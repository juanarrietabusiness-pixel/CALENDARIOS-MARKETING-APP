#!/usr/bin/env node
// ============================================================
// Fase 0 — Congelar la verdad
//
// Vuelca el proyecto vivo de Supabase a JSON. SÓLO LEE: no escribe
// nada en Supabase ni en Cloudflare.
//
// Se vuelca desde la base viva y no desde supabase/migrations/ porque
// los dos no coinciden: el registro remoto tiene 8 versiones contra 13
// ficheros, una registrada sin fichero y seis ficheros sin registrar.
// Ver docs/migracion-cloudflare.md § 5.4.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/migracion/volcar.mjs
//
// La clave de servicio ignora RLS y da acceso total: se pasa por
// entorno, nunca por argumento (los argumentos quedan en el historial
// del intérprete de órdenes y en `ps`).
//
// La salida va a scripts/migracion/datos/, que está en .gitignore:
// son datos de clientes reales y no tienen por qué vivir en el
// repositorio para siempre.
// ============================================================

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const TABLAS = [
  "clients", "calendars", "approvals", "chat_messages",
  "client_memories", "client_tasks", "task_templates", "content_bank",
];

const DESTINO = join(dirname(fileURLToPath(import.meta.url)), "datos");

function exigir(condicion, mensaje) {
  if (!condicion) {
    console.error(`\n  ✗ ${mensaje}\n`);
    process.exit(1);
  }
}

const cabeceras = () => ({
  apikey: CLAVE,
  Authorization: `Bearer ${CLAVE}`,
  "Content-Type": "application/json",
});

async function leerTabla(tabla) {
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=*`, { headers: cabeceras() });
  if (!res.ok) throw new Error(`${tabla}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function leerUsuarios() {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=200`, { headers: cabeceras() });
  if (!res.ok) throw new Error(`auth.users: ${res.status} ${await res.text()}`);
  const { users = [] } = await res.json();
  // La contraseña NO viaja: en Cloudflare se rehace con PBKDF2 en la
  // fase 2. Aquí sólo hace falta saber qué identificador tenía cada
  // dueño, porque owner_id apunta a él en ocho tablas.
  return users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at }));
}

async function leerObjetos() {
  const res = await fetch(`${URL_BASE}/storage/v1/object/list/content-bank`, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify({ prefix: "", limit: 1000 }),
  });
  if (!res.ok) throw new Error(`storage: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  exigir(URL_BASE, "Falta SUPABASE_URL.");
  exigir(CLAVE, "Falta SUPABASE_SERVICE_ROLE_KEY.");
  exigir(!CLAVE.startsWith("VITE_"), "Esa clave lleva prefijo VITE_: es la pública, y no puede leer con RLS puesta.");

  await mkdir(DESTINO, { recursive: true });

  const resumen = {};
  const usuarios = await leerUsuarios();
  await writeFile(join(DESTINO, "users.json"), JSON.stringify(usuarios, null, 2));
  resumen["auth.users"] = usuarios.length;

  for (const tabla of TABLAS) {
    const filas = await leerTabla(tabla);
    await writeFile(join(DESTINO, `${tabla}.json`), JSON.stringify(filas, null, 2));
    resumen[tabla] = filas.length;
  }

  const objetos = await leerObjetos();
  await writeFile(join(DESTINO, "storage.json"), JSON.stringify(objetos, null, 2));
  resumen["storage.objects"] = objetos.length;

  await writeFile(
    join(DESTINO, "recuentos.json"),
    JSON.stringify({ tomado: new Date().toISOString(), origen: URL_BASE, filas: resumen }, null, 2),
  );

  console.log("\n  Volcado en scripts/migracion/datos/\n");
  for (const [k, v] of Object.entries(resumen)) console.log(`    ${k.padEnd(18)} ${v}`);
  console.log("\n  Los recuentos quedan en recuentos.json: son los que hay que");
  console.log("  cotejar contra D1 después de importar.\n");
}

main().catch((e) => {
  console.error(`\n  ✗ ${e.message}\n`);
  process.exit(1);
});
