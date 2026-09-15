// ============================================================
// Acceso al repositorio desde los tests de despliegue.
//
// Todo se resuelve contra la raíz del proyecto, no contra el directorio
// de trabajo: los tests se ejecutan igual desde la raíz que desde CI.
// ============================================================

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ruta = (...partes) => join(RAIZ, ...partes);
export const hay = (...partes) => existsSync(ruta(...partes));
export const leer = (...partes) => readFileSync(ruta(...partes), "utf8");

/** Ruta relativa a la raíz, que es como se nombran los archivos en los fallos. */
export const rel = (abs) => relative(RAIZ, abs);

/**
 * Lista archivos bajo `dir` que casen con `filtro`, sin entrar en
 * node_modules, dist ni .git.
 */
export function listar(dir, filtro = /./, acc = []) {
  const base = ruta(dir);
  if (!existsSync(base)) return acc;
  for (const nombre of readdirSync(base)) {
    if (["node_modules", "dist", ".git", "coverage"].includes(nombre)) continue;
    const abs = join(base, nombre);
    if (statSync(abs).isDirectory()) {
      listar(relative(RAIZ, abs), filtro, acc);
    } else if (filtro.test(nombre)) {
      acc.push(abs);
    }
  }
  return acc;
}

/** Los fuentes que se embarcan en el navegador (no los tests). */
export function fuentesNavegador() {
  return listar("src", /\.(js|jsx)$/).filter((f) => !/\.test\.js$|test-helper/.test(f));
}

/** Los fuentes de las Edge Functions. */
export function fuentesEdge() {
  return listar("supabase/functions", /\.ts$/);
}

/** Las migraciones, en el orden en que se aplican. */
export function migraciones() {
  return listar("supabase/migrations", /\.sql$/).sort();
}

/**
 * Busca un patrón línea a línea y devuelve `{archivo, linea, texto}`.
 * Se salta las líneas de comentario para no denunciar lo que sólo está
 * mencionado en una explicación —que en este repositorio es constante—.
 */
export function buscar(archivos, patron, { incluirComentarios = false } = {}) {
  const hits = [];
  for (const abs of archivos) {
    const lineas = readFileSync(abs, "utf8").split("\n");
    lineas.forEach((texto, i) => {
      const limpia = texto.trim();
      // Los comentarios JSX de una línea —{/* … */}— cuentan como
      // comentario: App.jsx documenta ahí que la región de anuncios
      // «sustituye a alert()», y esa frase no es una llamada a alert().
      const esComentario =
        limpia.startsWith("//") || limpia.startsWith("*") || limpia.startsWith("/*") ||
        limpia.startsWith("--") || limpia.startsWith("#") ||
        /^\{\s*\/\*[\s\S]*\*\/\s*\}$/.test(limpia);
      if (!incluirComentarios && esComentario) return;
      if (patron.test(texto)) hits.push({ archivo: rel(abs), linea: i + 1, texto: limpia });
    });
  }
  return hits;
}

/** Quita comentarios de un SQL para analizar sólo lo que se ejecuta. */
export function sqlSinComentarios(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}
