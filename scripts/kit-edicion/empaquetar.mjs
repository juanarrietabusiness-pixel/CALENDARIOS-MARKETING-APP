// ============================================================
// Empaqueta el KIT DE EDICIÓN (kit-edicion/ + la lógica pura que usa, copiada de src/lib/) en un ZIP versionado.
//
//   node scripts/kit-edicion/empaquetar.mjs            (lo corre `npm run build`): comprueba la huella y deja el ZIP en
//                                                       dist/api/_kit/kit-edicion-<versión>.zip
//   node scripts/kit-edicion/empaquetar.mjs --huella   (`npm run kit:huella`): escribe la huella en
//                                                       src/lib/kitEdicionVersion.js; se niega si el kit cambió y la
//                                                       versión no (súbela antes)
//
// POR QUÉ EN dist/api/_kit Y NO EN R2. Va con el despliegue del Worker: el número que anuncia `kit_edicion` y el ZIP que
// sirve salen del MISMO despliegue (sin una ventana en la que el Worker nuevo anuncie un ZIP que aún no subió nadie) y no
// hace falta que el token de despliegue pueda escribir en R2. Y no es público: /api/* pasa SIEMPRE por el Worker
// (`run_worker_first` en wrangler.jsonc), que sólo lo entrega con un enlace firmado (worker/lib/kitEdicion.js).
// ============================================================

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { armarZip } from "./zip.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KIT = join(RAIZ, "kit-edicion");
const MODULO_VERSION = join(RAIZ, "src", "lib", "kitEdicionVersion.js");
/** La lógica pura que el kit lleva copiada en lib/ (la importa kit.mjs). */
export const LIB_DEL_KIT = Object.freeze(["oficioEdicion.js", "corteEdicion.js", "musicaEdicion.js", "planEdicion.js", "catalogoEfectos.datos.js", "kitEdicionVersion.js"]);
/** Lo que NO va: lo que crea la instalación en el chat y lo que deja Python. */
const FUERA = /(^|\/)(\.instalado|modelos|__pycache__|\.dominio)(\/|$)|\.pyc$/;

function recorrer(dir) {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? recorrer(r) : [r];
  });
}

/** Los archivos del kit: [{ ruta (en el ZIP), datos, ejecutable }]. Sin la versión: va aparte. */
export function archivosDelKit() {
  const propios = recorrer(KIT).map((r) => relative(KIT, r).split("\\").join("/")).filter((r) => !FUERA.test(r))
    .map((ruta) => ({ ruta, datos: readFileSync(join(KIT, ruta)), ejecutable: /\.(sh|mjs)$/.test(ruta) }));
  const lib = LIB_DEL_KIT.filter((n) => n !== "kitEdicionVersion.js").map((n) => ({ ruta: `lib/${n}`, datos: readFileSync(join(RAIZ, "src", "lib", n)) }));
  return [...propios, ...lib].sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** La huella: sha256 de cada ruta y su contenido, en orden (16 caracteres). */
export function huellaDelKit(archivos = archivosDelKit()) {
  const h = createHash("sha256");
  for (const a of archivos) h.update(a.ruta).update("\0").update(a.datos).update("\0");
  return h.digest("hex").slice(0, 16);
}

export function versionGuardada() {
  const t = readFileSync(MODULO_VERSION, "utf8");
  const m = /version:\s*"([^"]+)",\s*huella:\s*"([^"]*)"/.exec(t);
  if (!m) throw new Error(`No entiendo ${MODULO_VERSION}.`);
  return { version: m[1], huella: m[2], texto: t };
}

function escribirHuella() {
  const { version, huella, texto } = versionGuardada();
  const nueva = huellaDelKit();
  if (huella === nueva) return console.log(`El kit v${version} ya tiene su huella (${nueva}).`);
  if (huella) {
    console.error(`El kit cambió y sigue diciendo v${version}. Sube «version» en src/lib/kitEdicionVersion.js (y luego vuelve a correr npm run kit:huella).`);
    process.exit(1);
  }
  writeFileSync(MODULO_VERSION, texto.replace(/huella:\s*"[^"]*"/, `huella: "${nueva}"`));
  console.log(`Kit v${version}: huella ${nueva}.`);
}

function empaquetar() {
  const { version, huella } = versionGuardada();
  const archivos = archivosDelKit();
  const real = huellaDelKit(archivos);
  if (real !== huella) {
    console.error(`\n✗ El kit de edición cambió (huella ${real}) y src/lib/kitEdicionVersion.js dice v${version} con huella ${huella || "(ninguna)"}.\n` +
      "  Sube la versión ahí, deja la huella vacía (\"\") y corre npm run kit:huella.\n");
    process.exit(1);
  }
  archivos.push({ ruta: "lib/kitEdicionVersion.js", datos: readFileSync(MODULO_VERSION) });
  const zip = armarZip(archivos);
  const destino = join(RAIZ, "dist", "api", "_kit", `kit-edicion-${version}.zip`);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, zip);
  console.log(`Kit de edición v${version} (${huella}): ${archivos.length} archivos, ${(zip.length / 1024).toFixed(0)} kB → dist/api/_kit/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--huella")) escribirHuella();
  else empaquetar();
}
