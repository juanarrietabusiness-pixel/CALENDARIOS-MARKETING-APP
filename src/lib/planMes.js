// ============================================================
// «Planificar mes» sin trampas (puro)
//
// Lo que el asistente de planificar (PlanWizard.jsx) necesita y se puede
// probar sin pantalla:
//
//   · Las SEMANAS son las filas de la rejilla (lunes a domingo, la de la
//     tarjeta de la campaña: `semanasDelMes`), no bloques de siete días desde
//     el 1. En noviembre de 2026 la «Semana 1» del asistente tenía siete días
//     y la de la rejilla, uno: el concepto de la semana caía en otros días.
//   · El BORRADOR: lo escrito (y las ideas ya PAGADAS) se guarda en el
//     navegador, por cliente y mes, como el lote del Estudio
//     (`estudio-lote-borrador:<cliente>`). Cerrar ya no tira nada; dura 7 días
//     y se borra al crear el calendario.
//   · Los DÍAS OCUPADOS: si el mes ya tiene publicaciones, las nuevas no se
//     ponen encima en esos días (como `omitir` del lote del mes).
//   · La publicación que sale del plan lleva TODO lo que escribió el motor,
//     también la ficha de diseño ya pagada (`promptImagen`, su huella y quién
//     la escribió): antes se perdía al crear el calendario y se volvía a pagar.
// ============================================================

import { semanasDelMes } from "./campanas.js";
import { CAMPOS_MATRIZ, nombreDePilar } from "./pilares.js";

/** Cuántos días se guarda un borrador. */
export const DIAS_BORRADOR = 7;
const DIA_MS = 86_400_000;
const dos = (n) => String(n).padStart(2, "0");

/** La clave del borrador de un cliente y un mes. Pura. */
export const claveBorrador = (clienteId, year, month) => `plan-mes-borrador:${clienteId ?? ""}:${year}-${dos(Number(month) + 1)}`;

/** Las semanas del plan: las FILAS de la rejilla del mes → [{ n, desde, hasta }]. Pura. */
export const semanasDelPlan = (year, month) => semanasDelMes(year, month).map((s) => ({ n: s.numero, desde: s.desde, hasta: s.hasta }));

/** Los conceptos (o las etapas), uno por semana del mes: se conserva lo escrito y se ajusta el largo. Pura. */
export const unoPorSemana = (lista = [], n = 5) => Array.from({ length: Math.max(0, n) }, (_, i) => (Array.isArray(lista) ? lista[i] ?? "" : ""));

/**
 * Los días de ese mes que ya tienen alguna publicación en el calendario del cliente (`client.calendars`): ahí el plan
 * no pone nada nuevo. → Set de «AAAA-MM-DD». Pura.
 */
export function diasOcupados(calendarios = [], year, month) {
  const prefijo = `${year}-${dos(Number(month) + 1)}-`;
  const fuera = new Set();
  for (const cal of calendarios ?? []) {
    for (const d of cal?.days ?? []) {
      if (String(d?.date ?? "").startsWith(prefijo) && (d.posts ?? []).length) fuera.add(d.date);
    }
  }
  return fuera;
}

/** ¿Hay algo que merezca guardarse? (ideas con algo escrito, la campaña, las ofertas, la estrategia). Pura. */
export function hayAlgoQueGuardar(e = {}) {
  const ideas = Object.values(e.ideas ?? {}).flat().some((p) => p && ["idea", "descripcion", "guion", "textoPieza", "escena"].some((k) => String(p[k] ?? "").trim()));
  return ideas || [e.campaign, e.offers, e.promoCode, e.objetivo, e.focoId].some((x) => String(x ?? "").trim())
    || (e.weekConcepts ?? []).some((x) => String(x ?? "").trim());
}

/** El borrador guardado (o null si no hay, no se puede leer o caducó, y entonces se borra). */
export function leerBorrador(storage, clave, ahora = Date.now()) {
  try {
    const crudo = storage?.getItem(clave);
    if (!crudo) return null;
    const b = JSON.parse(crudo);
    if (!b || typeof b !== "object" || !(ahora - Number(b.guardadoAt) < DIAS_BORRADOR * DIA_MS)) {
      storage.removeItem(clave);
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

/** Guarda el borrador si hay algo que guardar; si no, lo quita. Sin almacenamiento (privado, lleno), no hace nada. */
export function guardarBorrador(storage, clave, estado, ahora = Date.now()) {
  try {
    if (!hayAlgoQueGuardar(estado)) { storage?.removeItem(clave); return false; }
    storage?.setItem(clave, JSON.stringify({ ...estado, guardadoAt: ahora }));
    return true;
  } catch {
    return false;
  }
}

/** Borra el borrador (al crear el calendario o al empezar de cero). */
export function borrarBorrador(storage, clave) {
  try { storage?.removeItem(clave); } catch { /* sin almacenamiento */ }
}

/**
 * Lo que escribió el motor y debe llegar al calendario: además de la idea, el guion, el caption, los hashtags y el
 * texto de la pieza, el título, qué se ve, la forma, la fórmula UGC y la FICHA DE DISEÑO ya pagada (con su huella, que
 * sigue valiendo: qué se ve y el texto de la pieza no cambian por el camino). La propuesta de la IA (`sugerencia`) no
 * viaja.
 */
const QUE_VIAJA = Object.freeze([
  "title", "escena", "composicion", "tactica", "textoPieza", "hashtagsFinales", "estructuraRef", "formulaUgc",
  "promptImagen", "promptImagenDe", "promptImagenPor",
]);

/**
 * La publicación del calendario que sale de una casilla del plan. `idea`: lo escrito en el asistente (puede faltar);
 * `f`: el formato del día ({ format, rostro, publishTime }); `m`: la matriz calculada; `cat`: el tipo del día. Pura.
 */
export function publicacionDelPlan(idea = null, f = {}, m = {}, { id, cat = "" } = {}) {
  const i = idea ?? {};
  const viaja = Object.fromEntries(QUE_VIAJA.filter((k) => String(i[k] ?? "").trim()).map((k) => [k, i[k]]));
  return {
    ...Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, i[k] || m[k] || ""])),
    ...viaja,
    id: i.id || id,
    format: f.format,
    // Un video con rostro (UGC) del plan del cliente: lo graba una persona.
    ...(f.format === "reel" && f.rostro ? { rostro: true } : {}),
    ...(f.format === "carrusel" && i.estructura ? { estructura: i.estructura } : {}),
    ...(f.format === "reel" && f.rostro && i.duracionUgc ? { duracionUgc: i.duracionUgc } : {}),
    ...(f.format === "reel" && f.rostro && i.ganchosUgc?.length ? { ganchosUgc: i.ganchosUgc } : {}),
    idea: i.idea || "",
    referenceLink: i.referenceLink || "",
    image: i.image || null,
    guion: i.guion || "",
    descripcion: i.descripcion || "",
    hashtagsFinales: i.hashtagsFinales || "",
    script: i.descripcion || i.script || "",
    status: i.status || "pending",
    category: nombreDePilar(i.pilar || m.pilar) || cat,
    comment: "",
    publishTime: f.publishTime || "",
  };
}
