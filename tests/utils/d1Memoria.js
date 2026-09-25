// ============================================================
// Una D1 de verdad, en memoria
//
// SQLite de Node con TODAS las migraciones de migraciones/d1 aplicadas,
// detrás de la misma forma que la D1 de Workers:
// `prepare(sql).bind(...).first() / all() / run()`.
//
// Para lo que un doble a mano no puede comprobar: que las consultas que
// construye la capa de acceso EXISTEN en el esquema —columnas, checks,
// claves ajenas—, y que una fila escrita se lee después igual.
// ============================================================

import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { ruta } from "./repo.js";

const valor = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

export function d1EnMemoria() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = ruta("migraciones", "d1");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`${dir}/${f}`, "utf8"));
  }
  const limpiar = (fila) => (fila ? { ...fila } : null);
  return {
    sqlite,
    async batch(sentencias) {
      const salida = [];
      for (const s of sentencias) salida.push(await s.run());
      return salida;
    },
    prepare(sql) {
      let binds = [];
      return {
        bind(...args) { binds = args.map(valor); return this; },
        async first() { return limpiar(sqlite.prepare(sql).get(...binds)); },
        async all() { return { results: sqlite.prepare(sql).all(...binds).map(limpiar) }; },
        async run() { const r = sqlite.prepare(sql).run(...binds); return { meta: { changes: Number(r.changes) } }; },
      };
    },
  };
}
