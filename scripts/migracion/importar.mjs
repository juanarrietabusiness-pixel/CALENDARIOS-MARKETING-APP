#!/usr/bin/env node
// ============================================================
// Fases 1 y 6 — Importar a D1, con las imágenes fuera del JSON
//
// Lee lo que dejó volcar.mjs, lo convierte con convertir.js y lo
// mete en D1. Por el camino saca las imágenes en base64 del JSON y
// las deja en R2.
//
//   CLOUDFLARE_ACCOUNT_ID=... \
//   CLOUDFLARE_API_TOKEN=... \
//   D1_DATABASE_ID=... \
//   R2_BUCKET=juancito-contenido \
//   node scripts/migracion/importar.mjs [--ensayo]
//
// --ensayo convierte, mide y comprueba, pero no escribe nada.
//
// DOS COSAS QUE NO SON OPCIONALES
//
//  1. Los valores van SIEMPRE por parámetros ligados, nunca
//     interpolados en el SQL. D1 corta la sentencia a 100 kB y el
//     calendario de agosto ocupa 501.884 caracteres: interpolado no
//     entra. Por parámetro sí, porque el valor viaja aparte.
//
//  2. El orden importa. D1 aplica las claves ajenas —comprobado
//     contra una base real—, así que users → clients → calendars →
//     el resto. Al revés falla con FOREIGN KEY constraint failed.
// ============================================================

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  filaCliente, filaCalendario, filaAprobacion,
  extraerImagenes, pesoDeFila, cabeEnD1, LIMITE_FILA_D1,
} from "./convertir.js";

const CUENTA = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const BASE_D1 = process.env.D1_DATABASE_ID || "";
const BUCKET = process.env.R2_BUCKET || "juancito-contenido";
const ENSAYO = process.argv.includes("--ensayo");

const DATOS = join(dirname(fileURLToPath(import.meta.url)), "datos");

function exigir(condicion, mensaje) {
  if (!condicion) {
    console.error(`\n  ✗ ${mensaje}\n`);
    process.exit(1);
  }
}

const leer = async (f) => JSON.parse(await readFile(join(DATOS, f), "utf8"));

/** Una consulta a D1 por la API HTTP. `params` va aparte del `sql`. */
async function d1(sql, params = []) {
  if (ENSAYO) return { success: true, ensayo: true };
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CUENTA}/d1/database/${BASE_D1}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    },
  );
  const cuerpo = await res.json();
  if (!res.ok || !cuerpo.success) {
    throw new Error(`D1: ${JSON.stringify(cuerpo.errors ?? cuerpo)}`);
  }
  return cuerpo;
}

/** INSERT con marcadores, tantos como columnas. */
async function insertar(tabla, fila) {
  const cols = Object.keys(fila);
  const sql = `insert into ${tabla} (${cols.join(",")}) values (${cols.map(() => "?").join(",")})`;
  // D1 admite 100 parámetros por consulta; la tabla más ancha (clients)
  // tiene 33 columnas, así que una fila por consulta va sobrada.
  await d1(sql, cols.map((c) => (fila[c] === null || fila[c] === undefined ? null : String(fila[c]))));
}

async function subirAR2(clave, dataUri) {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const tipo = /^data:([^;]+);/.exec(dataUri)?.[1] ?? "application/octet-stream";
  const bytes = Buffer.from(base64, "base64");
  if (ENSAYO) return bytes.length;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CUENTA}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(clave)}`,
    { method: "PUT", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": tipo }, body: bytes },
  );
  if (!res.ok) throw new Error(`R2 ${clave}: ${res.status} ${await res.text()}`);
  return bytes.length;
}

async function main() {
  exigir(ENSAYO || CUENTA, "Falta CLOUDFLARE_ACCOUNT_ID.");
  exigir(ENSAYO || TOKEN, "Falta CLOUDFLARE_API_TOKEN.");
  exigir(ENSAYO || BASE_D1, "Falta D1_DATABASE_ID.");

  const avisos = [];
  let bytesR2 = 0;
  let imagenesR2 = 0;

  // ---- 1. Clientes (el logo también sale del JSON) ----
  const clientes = await leer("clients.json");
  for (const row of clientes) {
    const fila = filaCliente(row);
    if (fila.logo && fila.logo.startsWith("data:")) {
      const clave = `clientes/${fila.id}/logo.jpg`;
      bytesR2 += await subirAR2(clave, fila.logo);
      imagenesR2 += 1;
      fila.logo = clave;
    }
    await insertar("clients", fila);
  }

  // ---- 2. Calendarios ----
  const calendarios = await leer("calendars.json");
  for (const row of calendarios) {
    const { days, visualReferences, imagenes } = extraerImagenes(
      { days: row.days ?? [], visualReferences: row.visual_references ?? [] },
      row.client_id,
    );

    for (const img of imagenes) {
      bytesR2 += await subirAR2(img.clave, img.dataUri);
      imagenesR2 += 1;
    }

    const fila = filaCalendario({ ...row, days, visual_references: visualReferences });
    const peso = pesoDeFila(fila);
    if (!cabeEnD1(fila)) {
      avisos.push(`«${fila.name}» pesa ${peso} bytes, por encima del techo de ${LIMITE_FILA_D1} de D1`);
      continue;
    }
    if (peso > LIMITE_FILA_D1 / 4) {
      avisos.push(`«${fila.name}» pesa ${peso} bytes: ya va por un cuarto del techo de D1`);
    }
    await insertar("calendars", fila);
  }

  // ---- 3. El resto ----
  const sueltas = [
    ["approvals", "approvals.json", filaAprobacion],
    ["chat_messages", "chat_messages.json", (r) => r],
    ["client_memories", "client_memories.json", (r) => r],
    ["client_tasks", "client_tasks.json", (r) => r],
    ["task_templates", "task_templates.json", (r) => r],
    ["content_bank", "content_bank.json", (r) => r],
  ];
  const recuentos = { clients: clientes.length, calendars: calendarios.length };
  for (const [tabla, fichero, convertir] of sueltas) {
    const filas = await leer(fichero);
    for (const row of filas) await insertar(tabla, convertir(row));
    recuentos[tabla] = filas.length;
  }

  await mkdir(DATOS, { recursive: true });
  await writeFile(
    join(DATOS, "importado.json"),
    JSON.stringify({ cuando: new Date().toISOString(), ensayo: ENSAYO, recuentos, imagenesR2, bytesR2, avisos }, null, 2),
  );

  console.log(`\n  ${ENSAYO ? "ENSAYO — no se ha escrito nada" : "Importado"}\n`);
  for (const [k, v] of Object.entries(recuentos)) console.log(`    ${k.padEnd(18)} ${v}`);
  console.log(`\n    imágenes a R2     ${imagenesR2} (${Math.round(bytesR2 / 1024)} kB)`);
  if (avisos.length) {
    console.log("\n  Avisos:");
    for (const a of avisos) console.log(`    · ${a}`);
  }
  console.log("\n  Cotejar recuentos.json contra esto antes de mover el DNS.\n");
}

main().catch((e) => {
  console.error(`\n  ✗ ${e.message}\n`);
  process.exit(1);
});
