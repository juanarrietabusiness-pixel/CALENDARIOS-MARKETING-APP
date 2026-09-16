#!/usr/bin/env node
// ============================================================
// Alta del administrador
//
// Sustituye a netlify/functions/admin-seed.mjs, y con ella desaparece
// el endpoint que creaba administradores —el único motivo de que
// existiera ADMIN_SEED_TOKEN—. Se lanza desde el workflow «Sembrar
// administrador», que lee las credenciales de los secretos del
// repositorio.
//
// EL HASH LO CALCULA EL MISMO CÓDIGO QUE LUEGO LO COMPRUEBA.
//
// Antes esto reimplementaba PBKDF2 por su cuenta, y esa duplicación es
// justo la que no se puede permitir: si las dos implementaciones
// divergen en un solo parámetro, el hash guardado no vuelve a cuadrar
// nunca y nadie entra —sin ningún error que lo explique, porque «no
// coincide» es exactamente lo que responde una contraseña incorrecta—.
// Ahora importa `hashearContrasena` de worker/lib/sesion.js. Node 22
// trae WebCrypto en el ámbito global, así que el mismo módulo corre en
// los dos sitios.
// ============================================================

import { execFileSync } from "node:child_process";
import { hashearContrasena, ITERACIONES } from "../worker/lib/sesion.js";

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
// El correo entra en el SQL, así que se valida por lo que SÍ puede
// llevar en vez de por lo que no: una lista negra de comillas y barras
// se escapa mal con facilidad —y escribirla mal no da ningún aviso—.
// El hash y la sal son hexadecimal y no hace falta comprobarlos.
if (!/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email)) {
  console.error(`\n  ✗ «${email}» no parece un correo válido.\n`);
  process.exit(1);
}

const { salt, password_hash } = await hashearContrasena(contrasena);
const id = crypto.randomUUID();
const ahora = new Date().toISOString();

// Idempotente: si el usuario ya existe le pone la contraseña actual.
// Sirve para el alta y para recuperar el acceso si se olvida.
const sql = `
insert into users (id, email, password_hash, salt, created_at)
values ('${id}', '${email}', '${password_hash}', '${salt}', '${ahora}')
on conflict (email) do update set password_hash = excluded.password_hash,
                                  salt = excluded.salt;
`.trim();

execFileSync(
  "npx",
  ["wrangler", "d1", "execute", BASE, remoto ? "--remote" : "--local", "--command", sql],
  { stdio: "inherit" },
);

console.log(`\n  Administrador listo: ${email}`);
console.log(`  Hash con ${ITERACIONES.toLocaleString("es")} iteraciones, en vueltas de 100.000.\n`);
