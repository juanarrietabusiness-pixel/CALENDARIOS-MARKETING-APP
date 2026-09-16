#!/usr/bin/env node
// ============================================================
// Alta del administrador
//
// Sustituye a netlify/functions/admin-seed.mjs, y con ella desaparece
// el endpoint que creaba administradores —el único motivo de que
// existiera ADMIN_SEED_TOKEN—. Esto se ejecuta desde la línea de
// órdenes, no desde la red: no hay nada que proteger porque no hay
// nada expuesto.
//
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run sembrar
//
// La contraseña no se pasa por argumento: los argumentos quedan en el
// historial del intérprete y los ve `ps`.
// ============================================================

import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const contrasena = process.env.ADMIN_PASSWORD || "";
const BASE = process.env.D1_DATABASE_NAME || "calendarios-db";
const remoto = !process.argv.includes("--local");

if (!email || !contrasena) {
  console.error("\n  ✗ Faltan ADMIN_EMAIL o ADMIN_PASSWORD.\n");
  process.exit(1);
}
if (contrasena.length < 12) {
  console.error("\n  ✗ La contraseña debe tener 12 caracteres como mínimo.\n");
  process.exit(1);
}
// El correo entra en el SQL: si trajera una comilla, la rompería. El
// hash y la sal son hexadecimal, así que no hace falta comprobarlos.
if (!/^[^\s'"\\;]+@[^\s'"\\;]+\.[^\s'"\\;]+$/.test(email)) {
  console.error(`\n  ✗ «${email}» no parece un correo válido.\n`);
  process.exit(1);
}

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

// Mismos parámetros que worker/lib/sesion.js. Si divergen, nadie entra.
const ITERACIONES = 210_000;

const salt = hex(webcrypto.getRandomValues(new Uint8Array(16)));
const clave = await webcrypto.subtle.importKey(
  "raw", new TextEncoder().encode(contrasena), "PBKDF2", false, ["deriveBits"],
);
const hash = hex(await webcrypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt: deHex(salt), iterations: ITERACIONES },
  clave, 256,
));

const id = webcrypto.randomUUID();
const ahora = new Date().toISOString();

// Idempotente: si el usuario ya existe le pone la contraseña actual.
// Sirve para el alta y para recuperar el acceso si se olvida.
const sql = `
insert into users (id, email, password_hash, salt, created_at)
values ('${id}', '${email}', '${hash}', '${salt}', '${ahora}')
on conflict (email) do update set password_hash = excluded.password_hash,
                                  salt = excluded.salt;
`.trim();

execFileSync(
  "npx",
  ["wrangler", "d1", "execute", BASE, remoto ? "--remote" : "--local", "--command", sql],
  { stdio: "inherit" },
);

console.log(`\n  Administrador listo: ${email}\n`);
