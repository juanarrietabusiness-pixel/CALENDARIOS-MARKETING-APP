// ============================================================
// «Producir el mes»: qué semanas y qué días, y en qué orden (puro)
//
// La agencia produce por TIPO de contenido, y el tipo va por día de la
// semana (lunes Anuncio, martes Promociones…): todos los lunes del mes
// salen con el mismo estilo. Por eso, por defecto, la lista va de lunes a
// domingo y dentro de cada día por fecha; «Por fecha» la deja corrida.
// La semana es la FILA de la rejilla (`semanaDelMes`), la misma que la
// lista por semanas y la campaña de cada semana.
// ============================================================

import { semanaDelMes } from "./semanas";

/** Los días en el orden de la agencia: lunes primero. `n` es el de `getUTCDay()`. */
export const DIAS_SEMANA = Object.freeze([
  { n: 1, nombre: "Lunes", corto: "Lun" },
  { n: 2, nombre: "Martes", corto: "Mar" },
  { n: 3, nombre: "Miércoles", corto: "Mié" },
  { n: 4, nombre: "Jueves", corto: "Jue" },
  { n: 5, nombre: "Viernes", corto: "Vie" },
  { n: 6, nombre: "Sábado", corto: "Sáb" },
  { n: 0, nombre: "Domingo", corto: "Dom" },
]);

/** 0 = domingo … 6 = sábado, sin depender de la zona horaria. */
export const diaDeLaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

/** La posición de un día en el orden de la agencia (lunes 0 … domingo 6). */
const posicion = (fecha) => (diaDeLaSemana(fecha) + 6) % 7;

/** Las semanas que tienen algo → [número], en orden. */
export function semanasDe(lista = []) {
  return [...new Set(lista.map((c) => semanaDelMes(c.date)))].sort((a, b) => a - b);
}

/** Los días de la semana que tienen algo → los de DIAS_SEMANA que aparecen, lunes primero. */
export function diasDe(lista = []) {
  const hay = new Set(lista.map((c) => diaDeLaSemana(c.date)));
  return DIAS_SEMANA.filter((d) => hay.has(d.n));
}

/**
 * Lo que queda con el filtro: `semanas` y `dias` son conjuntos (de números de semana y de `getUTCDay`);
 * vacío o null = todas. Pura.
 */
export function filtrarProduccion(lista = [], { semanas = null, dias = null } = {}) {
  return lista.filter((c) =>
    (!semanas?.size || semanas.has(semanaDelMes(c.date))) && (!dias?.size || dias.has(diaDeLaSemana(c.date))));
}

/** «dia»: de lunes a domingo y, dentro, por fecha; «fecha»: corrido. No cambia la lista de entrada. Pura. */
export function ordenarProduccion(lista = [], orden = "dia") {
  return [...lista].sort((a, b) =>
    (orden === "dia" ? posicion(a.date) - posicion(b.date) : 0) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ------------------------------------------------------------
// Lo que sale del servidor
// ------------------------------------------------------------

const terminado = (e) => Boolean(e) && e.estado !== "en_marcha";

/**
 * De los encargos de «Producir el mes» (las imágenes, en un lote; cada carrusel, el suyo) a lo que enseña la pantalla.
 * `metas`: [{ id, tipo: "lote" | "carrusel", postId? }] tal cual se lanzaron; `estados`: id → { encargo, archivos (Map),
 * fin }; `posts`: Map id → { post, date }. → { trabajos, versiones, mejores, controles, fichas, listo }:
 *   · `trabajos`: por publicación, su avance ({ postId, date, format, titulo, estado, error, laminas?, hechas? });
 *   · `versiones` postId → [archivos]; `mejores` postId → la que se propone (la primera que pasó el control) o, en un
 *     carrusel, sus láminas en orden; `controles` postId → el control de la propuesta (en un carrusel, la peor lámina);
 *   · `fichas` postId → la ficha que escribió el director (se guarda en la publicación: la próxima vez sale al instante);
 *   · `listo`: todo terminó y la pantalla ya puso lo suyo.
 * Pura.
 */
export function resultadosDeProduccion(metas = [], estados = {}, posts = new Map()) {
  const trabajos = [];
  const versiones = {};
  const mejores = {};
  const controles = {};
  const fichas = {};
  const base = (postId) => {
    const x = posts.get(postId);
    return { postId, date: x?.date ?? "", format: x?.post?.format ?? "post", titulo: x?.post?.title || x?.post?.idea || "" };
  };
  for (const m of metas) {
    const est = estados[m.id];
    const e = est?.encargo;
    const archivos = est?.archivos ?? new Map();
    if (m.tipo === "carrusel") {
      const hechas = (e?.pasos ?? []).filter((p) => p.fase === "hecho");
      const lista = hechas.map((p) => archivos.get(p.finales?.[0]) ?? archivos.get(p.opciones?.[0]?.id)).filter(Boolean);
      const fin = terminado(e);
      trabajos.push({
        ...base(m.postId), laminas: e?.pasos?.length || m.laminas || 0, hechas: hechas.length,
        estado: !fin ? "creando" : lista.length ? "hecho" : "fallido", error: fin && !lista.length ? e?.error || "No salió ninguna lámina." : "",
      });
      if (fin && lista.length) {
        mejores[m.postId] = lista;
        const vistos = hechas.map((p) => p.opciones?.[0]?.control).filter(Boolean);
        if (vistos.length) controles[m.postId] = vistos.find((c) => c.estado === "revisar") ?? { estado: "ok" };
      }
      continue;
    }
    for (const p of e?.pasos ?? []) {
      trabajos.push({ ...base(p.id), estado: p.fase === "hecho" ? "hecho" : p.fase === "fallido" ? "fallido" : "creando", error: p.error ?? "" });
      if (p.deDirector && p.escena) fichas[p.id] = p.escena;
      if (p.fase !== "hecho") continue;
      const lista = (p.opciones ?? []).map((o, i) => archivos.get(p.finales?.[i]) ?? archivos.get(o.id)).filter(Boolean);
      if (!lista.length) continue;
      versiones[p.id] = lista;
      const k = Math.max(0, (p.opciones ?? []).findIndex((o) => o.control?.estado === "ok"));
      mejores[p.id] = lista[k] ?? lista[0];
      if (p.opciones?.[k]?.control) controles[p.id] = p.opciones[k].control;
    }
  }
  const listo = metas.length > 0 && metas.every((m) => estados[m.id]?.fin);
  return { trabajos, versiones, mejores, controles, fichas, listo };
}
