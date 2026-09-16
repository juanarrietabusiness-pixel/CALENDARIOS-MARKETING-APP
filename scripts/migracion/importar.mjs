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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  filaCliente, filaCalendario, filaAprobacion,
  filaChat, filaMemoria, filaTarea, filaPlantilla, filaBanco,
  resolverDueno, conDueno,
  extraerImagenes, base64SinConvertir, pesoDeFila, cabeEnD1, LIMITE_FILA_D1,
} from "./convertir.js";

const CUENTA = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const ENSAYO = process.argv.includes("--ensayo");

/**
 * El identificador de D1 y el nombre del bucket salen de wrangler.jsonc,
 * que es donde ya viven. Pedirlos aparte sería una variable más que
 * pegar y una más que puede quedar desincronizada del despliegue.
 */
function deWrangler() {
  const crudo = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  // JSONC: fuera comentarios y comas colgantes.
  const limpio = crudo
    .replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => (m.startsWith('"') ? m : " "))
    .replace(/,(\s*[}\]])/g, "$1");
  const cfg = JSON.parse(limpio);
  return {
    baseD1: cfg.d1_databases?.[0]?.database_id ?? "",
    bucket: cfg.r2_buckets?.[0]?.bucket_name ?? "juancito-contenido",
  };
}

const { baseD1: BASE_D1, bucket: BUCKET } = deWrangler();

const DATOS = join(dirname(fileURLToPath(import.meta.url)), "datos");

function exigir(condicion, mensaje) {
  if (!condicion) {
    console.error(`\n  ✗ ${mensaje}\n`);
    process.exit(1);
  }
}

const leer = async (f) => JSON.parse(await readFile(join(DATOS, f), "utf8"));

/** Lo que `volcar.mjs` dejó en datos/banco/, o nada si no hay. */
async function listarBanco() {
  try {
    return JSON.parse(await readFile(join(DATOS, "banco", "indice.json"), "utf8"));
  } catch {
    return [];
  }
}

/**
 * Una consulta a D1 por la API HTTP. `params` va aparte del `sql`.
 *
 * En ensayo se saltan las ESCRITURAS, no las lecturas: un ensayo que no
 * mira la base no puede detectar nada de la base. La primera
 * importación real murió con «FOREIGN KEY constraint failed» después de
 * que el ensayo pasara en verde, precisamente por eso.
 */
async function d1(sql, params = [], lectura = false) {
  if (ENSAYO && !lectura) return { success: true, ensayo: true };
  if (ENSAYO && !(CUENTA && TOKEN && BASE_D1)) return { result: [{ results: [] }] };
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
  //
  // Los números van como números y los nulos como nulos. Pasarlo todo
  // por String() metía "null" donde debía haber NULL, y eso no falla:
  // guarda la palabra.
  await d1(sql, cols.map((c) => (fila[c] === undefined ? null : fila[c])));
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
  // También en ensayo: sin ellas no se puede leer la tabla de usuarios,
  // y sin eso el ensayo no comprueba a quién van a pertenecer las filas.
  exigir(CUENTA, "Falta CLOUDFLARE_ACCOUNT_ID.");
  exigir(TOKEN, "Falta CLOUDFLARE_API_TOKEN.");
  exigir(BASE_D1, "wrangler.jsonc no declara ninguna base de D1.");

  const avisos = [];
  let bytesR2 = 0;
  let imagenesR2 = 0;

  // ---- 0. ¿De quién van a ser estas filas? ----
  //
  // Las de Supabase traen el owner_id de allí, y en D1 ese usuario no
  // existe: el administrador se siembra aparte, con un UUID nuevo. Sin
  // esta correspondencia, la primera inserción muere con
  // «FOREIGN KEY constraint failed» y no dice qué clave.
  const usuariosOrigen = await leer("users.json");
  // Lectura: se hace TAMBIÉN en ensayo. Es la comprobación que faltaba.
  const usuariosDestino = (await d1("select id, email from users", [], true))
    ?.result?.[0]?.results ?? [];

  const { mapa: DUENOS, notas } = resolverDueno(usuariosOrigen, usuariosDestino);
  avisos.push(...notas);
  console.log(`\n  Dueño: ${usuariosOrigen.length} en el volcado → ${usuariosDestino.length} en D1`);

  // ---- 1. Clientes (el logo también sale del JSON) ----
  const clientes = await leer("clients.json");
  for (const row of clientes) {
    const fila = conDueno(filaCliente(row), DUENOS);
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

    // Un campo nuevo con base64 dentro viajaría a D1 sin que nadie lo
    // note, hasta que la fila choca con el techo de 2 MB.
    for (const h of base64SinConvertir({ days, visualReferences })) {
      avisos.push(`«${row.name}» lleva base64 en ${h.campo} (${h.bytes} bytes) y nadie lo convierte`);
    }

    const fila = conDueno(filaCalendario({ ...row, days, visual_references: visualReferences }), DUENOS);
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
  //
  // `approvals` no tiene owner_id: pertenece a su calendario. Las demás
  // sí, y todas pasan por la correspondencia de dueños.
  const sueltas = [
    ["approvals", "approvals.json", filaAprobacion, false],
    ["chat_messages", "chat_messages.json", filaChat, true],
    ["client_memories", "client_memories.json", filaMemoria, true],
    ["client_tasks", "client_tasks.json", filaTarea, true],
    ["task_templates", "task_templates.json", filaPlantilla, true],
    ["content_bank", "content_bank.json", filaBanco, true],
  ];
  const recuentos = { clients: clientes.length, calendars: calendarios.length };
  for (const [tabla, fichero, convertir, tieneDueno] of sueltas) {
    const filas = await leer(fichero);
    for (const row of filas) {
      const fila = convertir(row);
      await insertar(tabla, tieneDueno ? conDueno(fila, DUENOS) : fila);
    }
    recuentos[tabla] = filas.length;
  }

  // ---- 4. Los archivos del banco de contenido ----
  //
  // Viven en el Storage de Supabase, no en el JSON. `volcar.mjs` los
  // baja a datos/banco/; aquí suben a R2 con la MISMA clave que guarda
  // content_bank.file_path, o la fila apuntaría a un objeto que no está.
  for (const fichero of await listarBanco()) {
    const bytes = await readFile(join(DATOS, "banco", fichero.local));
    if (!ENSAYO) {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CUENTA}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(fichero.clave)}`,
        { method: "PUT", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": fichero.tipo }, body: bytes },
      );
      if (!res.ok) throw new Error(`R2 ${fichero.clave}: ${res.status} ${await res.text()}`);
    }
    bytesR2 += bytes.length;
    imagenesR2 += 1;
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
