// ============================================================
// El PLAN DE EDICIÓN de un video grabado (puro): el JSON que escribe quien edita y que el kit ejecuta
//
// Es el contrato entre Claude (que decide) y el kit de piezas (que mide y pinta): se valida ANTES de gastar minutos en
// la voz, la música o el render, y los errores dicen qué y dónde. Lo que no depende de qué motor pinta (la Fase 2b
// añade escenas, cámara y piezas gráficas): los clips y su orden, lo que se quita, la velocidad, el rescate de la voz,
// la música por compases, los efectos del catálogo y dónde se aparta la música.
//
// Un instante del video se puede dar en segundos de SALIDA (`t`) o anclado a una PALABRA (`palabra`: su índice en las
// palabras que quedan, en orden; `mas`: segundos de más o de menos). Anclar a la palabra es lo que se hace casi siempre:
// si cambia el corte, el efecto sigue cayendo en su palabra.
//
//   {
//     "version": 1, "fps": 30, "cierre": 3.3,
//     "indicacion": "Rofer Service, movimiento de tierra…",          // ayuda al reconocimiento de voz (nombres, rubro)
//     "clips": [{ "id": "1427", "archivo": "clips/1427.mov", "velocidad": 1, "ganancia": 0, "presencia": false,
//                 "excluir": [[12, 14]] }],
//     "realces": [{ "palabra": 120, "db": 11 }],                       // una palabra susurrada ({ t, dura } también)
//     "musica": { "archivo": "musica/cancion.mp3", "a0": 0.2133, "pulso": 0.62929,
//                 "tramos": [{ "cancion": [0.46, 20.35], "video": 0 }], "llamado": { "palabra": 116 } },
//     "efectos": [{ "id": "impact-deep", "t": 0, "db": -15 }, { "id": "impact-classic", "palabra": 18, "mas": -0.02, "db": -13, "alinear": "pico" }],
//     "apartar": [{ "palabra": 18 }]
//   }
// ============================================================

import { erroresDeVariantes, esVariante, VARIANTES } from "./variantesEdicion.js";
import { OFICIO } from "./oficioEdicion.js";

export const VERSION_PLAN = 1;
const ID_CLIP = /^[\w.-]{1,60}$/;
const num = (v) => typeof v === "number" && Number.isFinite(v);

/** El segundo de salida de un instante del plan ({ t } o { palabra, mas }), o null si no se puede. Pura. */
export function instante(x, palabras = []) {
  if (!x || typeof x !== "object") return null;
  if (num(x.t)) return x.t + (num(x.mas) ? x.mas : 0);
  if (Number.isInteger(x.palabra) && palabras[x.palabra]) return palabras[x.palabra].s + (num(x.mas) ? x.mas : 0);
  return null;
}

function comprobarInstante(x, donde, palabras, errores) {
  if (num(x?.t)) return;
  if (!Number.isInteger(x?.palabra)) { errores.push(`${donde}: falta «t» (segundos) o «palabra» (su índice).`); return; }
  if (palabras && !palabras[x.palabra]) errores.push(`${donde}: la palabra ${x.palabra} no existe (quedan ${palabras.length}, de 0 a ${palabras.length - 1}).`);
}

/**
 * Comprueba el plan. `palabras` (las que quedan, en salida) y `catalogo` (Set de ids de efectos) son opcionales: sin
 * ellas se comprueba sólo la forma. → { errores: [], avisos: [] }. Pura.
 */
export function validarPlan(plan, { palabras = null, catalogo = null, clipsEnDisco = null } = {}) {
  const errores = [];
  const avisos = [];
  if (!plan || typeof plan !== "object") return { errores: ["El plan no es un objeto JSON."], avisos };
  if (plan.version !== VERSION_PLAN) errores.push(`El plan es de la versión ${plan.version ?? "(ninguna)"} y el kit lee la ${VERSION_PLAN}.`);
  if (plan.fps !== undefined && ![24, 25, 30, 60].includes(plan.fps)) errores.push(`fps ${plan.fps}: usa 30 (o 24, 25, 60).`);
  if (plan.cierre !== undefined && !(num(plan.cierre) && plan.cierre >= 0 && plan.cierre <= 8)) errores.push("«cierre» son los segundos sin voz del final: entre 0 y 8.");

  const clips = Array.isArray(plan.clips) ? plan.clips : [];
  if (!clips.length) errores.push("Faltan los clips («clips»: en el orden del montaje).");
  const vistos = new Set();
  clips.forEach((c, k) => {
    const donde = `Clip ${k + 1}${c?.id ? ` («${c.id}»)` : ""}`;
    if (!ID_CLIP.test(String(c?.id ?? ""))) errores.push(`${donde}: falta su «id» (letras, números, punto, guion).`);
    if (vistos.has(c?.id)) errores.push(`${donde}: está dos veces.`);
    vistos.add(c?.id);
    if (!c?.archivo) errores.push(`${donde}: falta «archivo».`);
    else if (clipsEnDisco && !clipsEnDisco.has(c.archivo)) errores.push(`${donde}: no encuentro ${c.archivo}.`);
    if (c?.velocidad !== undefined && !(num(c.velocidad) && c.velocidad >= 0.8 && c.velocidad <= 1.25)) errores.push(`${donde}: «velocidad» va de 0,8 a 1,25 (más rápido se nota; el llamado flojo de Rofer fue a 1,05).`);
    if (c?.ganancia !== undefined && !(num(c.ganancia) && Math.abs(c.ganancia) <= 12)) errores.push(`${donde}: «ganancia» (dB sobre el nivel común) va de −12 a +12.`);
    if (c?.excluir !== undefined) {
      const bien = Array.isArray(c.excluir) && c.excluir.every((r) => Array.isArray(r) && Number.isInteger(r[0]) && (r[1] === undefined || (Number.isInteger(r[1]) && r[1] >= r[0])));
      if (!bien) errores.push(`${donde}: «excluir» es una lista de [desde, hasta] (índices de palabra del clip).`);
    }
  });

  (plan.realces ?? []).forEach((r, k) => {
    comprobarInstante(r, `Realce ${k + 1}`, palabras, errores);
    if (num(r?.t) && !(num(r?.dura) && r.dura > 0)) errores.push(`Realce ${k + 1}: con «t», di también cuánto dura («dura», segundos).`);
    if (!(num(r?.db) && r.db > 0 && r.db <= 15)) errores.push(`Realce ${k + 1}: «db» entre 0 y 15 (el susurro de Rofer: +${OFICIO.rescate.susurroDb}).`);
  });

  const m = plan.musica;
  if (m) {
    if (!m.archivo) errores.push("Música: falta «archivo» (de la biblioteca del cliente o de Suno; nunca hecha con código).");
    if (!(num(m.a0) && num(m.pulso) && m.pulso > 0.2 && m.pulso < 1.5)) errores.push("Música: faltan «a0» y «pulso» (los da `node kit.mjs compases`).");
    if (!Array.isArray(m.tramos) || !m.tramos.length) errores.push("Música: faltan sus «tramos» ({ cancion: [desde, hasta], video }).");
    if (m.llamado) comprobarInstante(m.llamado, "Música, llamado", palabras, errores);
  } else avisos.push("Sin música: el manual pide música de la biblioteca o de Suno.");

  (plan.efectos ?? []).forEach((e, k) => {
    const donde = `Efecto ${k + 1}${e?.id ? ` («${e.id}»)` : ""}`;
    if (!e?.id) errores.push(`${donde}: falta su «id» (del catálogo del calendario).`);
    else if (catalogo && !catalogo.has(e.id)) errores.push(`${donde}: no está en el catálogo del calendario (efectos_sonido).`);
    comprobarInstante(e, donde, palabras, errores);
    if (!(num(e?.db) && e.db <= 0 && e.db >= -40)) errores.push(`${donde}: «db» entre −40 y 0.`);
    if (e?.alinear !== undefined && !["inicio", "pico"].includes(e.alinear)) errores.push(`${donde}: «alinear» es «inicio» o «pico».`);
  });
  (plan.apartar ?? []).forEach((a, k) => comprobarInstante(a, `Apartar ${k + 1}`, palabras, errores));
  // Las VARIANTES de las piezas (src/lib/variantesEdicion.js): el estilo del video, y la entrada propia de una pieza.
  errores.push(...erroresDeVariantes(plan.variantes));
  (plan.piezas ?? []).forEach((x, k) => {
    if (x?.entrada !== undefined && !esVariante("entrada", x.entrada)) {
      errores.push(`Pieza ${k + 1} (${x?.tipo ?? "?"}): «entrada» «${x.entrada}» no existe; son ${Object.keys(VARIANTES.entrada.variantes).join(", ")}.`);
    }
  });
  return { errores, avisos };
}

/** El tramo de salida de un realce: la palabra entera, o desde `t` durante `dura` segundos. → [desde, hasta] o null. Pura. */
export function tramoDeRealce(r, palabras = []) {
  if (Number.isInteger(r?.palabra) && palabras[r.palabra]) return [palabras[r.palabra].s, palabras[r.palabra].e];
  if (num(r?.t) && num(r?.dura) && r.dura > 0) return [r.t, r.t + r.dura];
  return null;
}

/** Los efectos con su segundo de salida resuelto (para la mezcla): [{ id, t, db, alinear }]. Pura. */
export const efectosResueltos = (plan, palabras) => (plan.efectos ?? [])
  .map((e) => ({ id: e.id, t: instante(e, palabras), db: e.db, alinear: e.alinear ?? "inicio" }))
  .filter((e) => e.t !== null);
