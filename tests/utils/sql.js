// ============================================================
// Lectura estructurada de las migraciones.
//
// No interpreta SQL: reconoce las formas que este esquema usa —crear
// tabla, habilitar RLS, crear política, crear función, conceder y
// revocar— y las deja en objetos sobre los que se puede afirmar.
//
// Sirve para lo que un `grep` no distingue: que una política EXISTA no
// dice nada sobre si acota algo. La que dejó el banco de contenido
// abierto se llamaba «can read own content-bank» y sólo comprobaba el
// nombre del bucket.
// ============================================================

import { migraciones, rel, sqlSinComentarios } from "./repo";
import { readFileSync } from "node:fs";

/** El SQL de todas las migraciones, en orden, ya sin comentarios. */
export function esquema() {
  return migraciones().map((abs) => ({
    archivo: rel(abs),
    sql: sqlSinComentarios(readFileSync(abs, "utf8")),
    crudo: readFileSync(abs, "utf8"),
  }));
}

/** Todo el SQL concatenado: el estado final es la suma de las migraciones. */
export function sqlCompleto() {
  return esquema().map((m) => m.sql).join("\n");
}

/** Tablas creadas en `public`, con sus columnas en bruto. */
export function tablasCreadas() {
  const tablas = [];
  for (const { archivo, sql } of esquema()) {
    const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi;
    let m;
    while ((m = re.exec(sql))) {
      tablas.push({ archivo, nombre: m[1], columnas: m[2] });
    }
  }
  return tablas;
}

/**
 * Políticas RLS vigentes al final del esquema.
 *
 * Las migraciones se REPRODUCEN en orden en vez de leerse en montón: una
 * política creada en su día y sustituida después por otra no existe ya, y
 * denunciarla sería denunciar el pasado. Lo que se audita es el estado en
 * el que queda la base de datos.
 *
 * Con `{ historico: true }` se devuelven también las que se borraron, que
 * es lo que hace falta para comprobar que una corrección llegó a escribirse.
 */
export function politicas({ historico = false } = {}) {
  const vivas = new Map();
  const todas = [];

  for (const { archivo, sql } of esquema()) {
    // Creaciones y borrados en el orden en que aparecen dentro del archivo.
    const eventos = [];
    const reCrear = /create\s+policy\s+"([^"]+)"\s+on\s+([\w.]+)([\s\S]*?);/gi;
    const reBorrar = /drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+([\w.]+)\s*;/gi;
    let m;
    while ((m = reCrear.exec(sql))) eventos.push({ pos: m.index, tipo: "crear", m: [...m] });
    while ((m = reBorrar.exec(sql))) eventos.push({ pos: m.index, tipo: "borrar", m: [...m] });
    eventos.sort((a, b) => a.pos - b.pos);

    for (const ev of eventos) {
      const nombre = ev.m[1];
      const tabla = ev.m[2].replace(/^public\./, "");
      const clave = `${tabla}::${nombre}`;
      if (ev.tipo === "borrar") { vivas.delete(clave); continue; }
      const cuerpo = ev.m[3];
      const pol = {
        archivo,
        nombre,
        tabla,
        cuerpo,
        para: (cuerpo.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1] ?? "all").toLowerCase(),
        using: cuerpo.match(/\busing\s*\(([\s\S]*?)\)\s*(?:with\s+check|$)/i)?.[1] ?? "",
        conCheck: cuerpo.match(/\bwith\s+check\s*\(([\s\S]*?)\)\s*$/i)?.[1] ?? "",
      };
      vivas.set(clave, pol);
      todas.push(pol);
    }
  }

  return historico ? todas : [...vivas.values()];
}

/** Funciones creadas, con su cuerpo y sus modificadores. */
export function funciones() {
  const lista = [];
  for (const { archivo, sql } of esquema()) {
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*returns([\s\S]*?)\$\$([\s\S]*?)\$\$\s*;/gi;
    let m;
    while ((m = re.exec(sql))) {
      const cabecera = m[3];
      lista.push({
        archivo,
        nombre: m[1],
        args: m[2],
        cabecera,
        cuerpo: m[4],
        securityDefiner: /security\s+definer/i.test(cabecera),
        searchPath: cabecera.match(/set\s+search_path\s*=\s*([^\s;]+)/i)?.[1] ?? null,
      });
    }
  }
  return lista;
}

/** Todas las líneas `revoke ... from ...` del esquema. */
export function revocaciones() {
  const sql = sqlCompleto();
  return [...sql.matchAll(/revoke\s+([\s\S]*?)\s+on\s+function\s+(?:public\.)?(\w+)\s*\(([^)]*)\)\s+from\s+([^;]+);/gi)]
    .map((m) => ({ que: m[1].trim(), funcion: m[2], args: m[3], de: m[4].split(",").map((s) => s.trim()) }));
}

/** Todas las líneas `grant execute on function ...`. */
export function concesiones() {
  const sql = sqlCompleto();
  return [...sql.matchAll(/grant\s+execute\s+on\s+function\s+(?:public\.)?(\w+)\s*\(([^)]*)\)\s+to\s+([^;]+);/gi)]
    .map((m) => ({ funcion: m[1], args: m[2], a: m[3].split(",").map((s) => s.trim()) }));
}

/** Índices creados, para cruzarlos con las claves ajenas. */
export function indices() {
  const sql = sqlCompleto();
  return [...sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+(?:public\.)?(\w+)\s*(?:using\s+\w+\s*)?\(([^)]*)\)/gi)]
    .map((m) => ({ nombre: m[1], tabla: m[2], columnas: m[3].split(",").map((s) => s.trim().replace(/\s+(asc|desc)$/i, "")) }));
}

/** Claves ajenas declaradas en línea: `col uuid ... references public.tabla(id)`. */
export function clavesAjenas() {
  const fks = [];
  for (const t of tablasCreadas()) {
    for (const linea of t.columnas.split("\n")) {
      const m = linea.match(/^\s*(\w+)\s+[\w\s]*references\s+(?:public\.)?(\w+)/i);
      if (m) fks.push({ tabla: t.nombre, columna: m[1], referencia: m[2], archivo: t.archivo });
    }
  }
  return fks;
}
