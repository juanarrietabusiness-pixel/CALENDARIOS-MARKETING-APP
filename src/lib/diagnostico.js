// ============================================================
// El diagnóstico de las campañas activas (puro)
//
// Lo que la agencia miraba a ojo en el Administrador cada pocos días:
// qué apagar, qué escalar y qué anuncio está cansado. Son REGLAS sobre las
// cifras de los últimos 7 días comparadas con las de 30 y con el costo
// máximo por resultado (el del estratega, o el promedio de la campaña si
// no se dice): no cuestan nada y no cambian solas. La IA, si se pide, sólo
// lo explica con palabras.
//
//   · apagar   — gastó el doble de lo aceptable sin resultados, o cada
//                resultado cuesta más de 1,5 veces lo aceptable
//   · revisar  — está activo y no gastó (aprobación, pago, público chico)
//   · renovar  — fatiga: la gente ya lo vio 3 veces o el CTR cayó un 30 %
//   · vigilar  — el costo por resultado subió un 30 % frente al mes
//   · escalar  — funciona (≤ 70 % de lo aceptable): +20 % de presupuesto
//   · duplicar — funciona pero el público se agota (frecuencia ≥ 2,5):
//                el mismo anuncio con un público nuevo
// ============================================================

import { resumenInsights, formatoMoneda } from "./anuncios.js";

export const UMBRALES = Object.freeze({
  frecuenciaFatiga: 3,
  frecuenciaSaturado: 2.5,
  caidaCtr: 0.7,
  subidaCosto: 1.3,
  escalar: 0.7,
  apagar: 1.5,
  gastoSinResultado: 2,
  minImpresiones: 1000,
  minResultados: 3,
  minGanador: 5,
  subidaPresupuesto: 0.2,
});

/** Las acciones, por orden de urgencia. */
export const ACCIONES_DIAGNOSTICO = Object.freeze({
  apagar: { nombre: "Apagar", tono: "mal", orden: 0 },
  revisar: { nombre: "Revisar", tono: "mal", orden: 1 },
  renovar: { nombre: "Renovar la pieza", tono: "espera", orden: 2 },
  vigilar: { nombre: "Vigilar", tono: "espera", orden: 3 },
  escalar: { nombre: "Escalar", tono: "ok", orden: 4 },
  duplicar: { nombre: "Escalar con otro público", tono: "ok", orden: 5 },
});

const redondeo = (n) => Math.round(n * 100) / 100;

/** Las cifras de una fila de /insights, con la frecuencia (la de Meta o impresiones ÷ alcance). */
export function cifrasDe(fila, objetivo) {
  if (!fila) return null;
  const r = resumenInsights(fila, objetivo);
  const frecuencia = Number(fila.frequency) || (r.alcance ? r.impresiones / r.alcance : 0);
  return { ...r, frecuencia: Math.round(frecuencia * 10) / 10 };
}

/**
 * Lo que dicen las reglas de UN elemento (conjunto o anuncio). `ref` es el costo por resultado aceptable; `nivel`,
 * «conjunto» o «anuncio». → { accion, motivo, sugerencia? } o null si está bien. Pura.
 */
export function evaluar({ nivel, estado, presupuestoDiario = null, i7, i30, objetivo }, { ref = 0, moneda = "USD" } = {}) {
  const u = UMBRALES;
  const d = (n) => formatoMoneda(n, moneda);
  const r7 = cifrasDe(i7, objetivo);
  const r30 = cifrasDe(i30, objetivo);
  const activo = String(estado ?? "").toUpperCase() === "ACTIVE";
  if (activo && (!r7 || r7.gasto === 0)) {
    return { accion: "revisar", motivo: "Está activo y no gastó nada en 7 días: puede estar en revisión, sin método de pago o con un público demasiado chico." };
  }
  if (!r7 || r7.gasto === 0) return null;
  const cpr = r7.costoPorResultado;
  if (ref > 0 && !r7.resultados && r7.gasto >= u.gastoSinResultado * ref) {
    return { accion: "apagar", motivo: `Gastó ${d(r7.gasto)} en 7 días sin un solo resultado (lo aceptable es ${d(ref)} por resultado).` };
  }
  // Con el doble de lo aceptable gastado ya hay con qué juzgar: no hace falta esperar a tres resultados caros.
  if (ref > 0 && r7.resultados && r7.gasto >= u.gastoSinResultado * ref && cpr > u.apagar * ref) {
    return { accion: "apagar", motivo: `Cada resultado le cuesta ${d(cpr)}, más de 1,5 veces lo aceptable (${d(ref)}).` };
  }
  if (nivel === "anuncio") {
    if (r7.frecuencia >= u.frecuenciaFatiga) {
      return { accion: "renovar", motivo: `La misma gente ya lo vio ${String(r7.frecuencia).replace(".", ",")} veces en 7 días: está cansado. Cambia la pieza o el ángulo.` };
    }
    if (r7.impresiones >= u.minImpresiones && r30?.ctr && r7.ctr != null && r7.ctr < u.caidaCtr * r30.ctr) {
      return { accion: "renovar", motivo: `Los clics cayeron: ${r7.ctr.toFixed(2)} % esta semana frente a ${r30.ctr.toFixed(2)} % en el mes.` };
    }
  }
  if (nivel === "conjunto" && ref > 0 && r7.resultados >= u.minGanador && cpr <= u.escalar * ref) {
    if (r7.frecuencia >= u.frecuenciaSaturado) {
      return { accion: "duplicar", motivo: `Funciona (${d(cpr)} por resultado) pero el público ya lo vio ${String(r7.frecuencia).replace(".", ",")} veces: duplícalo con un público nuevo (similares u otros intereses) en vez de subirle el presupuesto.` };
    }
    if (presupuestoDiario > 0) {
      const nuevo = redondeo(presupuestoDiario * (1 + u.subidaPresupuesto));
      return {
        accion: "escalar", motivo: `Funciona: ${d(cpr)} por resultado, por debajo de lo aceptable (${d(ref)}). Sube el presupuesto un 20 %, de ${d(presupuestoDiario)} a ${d(nuevo)} al día; más de golpe reinicia el aprendizaje.`,
        sugerencia: { diarioActual: presupuestoDiario, diarioNuevo: nuevo },
      };
    }
  }
  if (r30?.costoPorResultado && cpr && r7.resultados >= u.minResultados && cpr > u.subidaCosto * r30.costoPorResultado) {
    return { accion: "vigilar", motivo: `El costo por resultado subió: ${d(cpr)} esta semana frente a ${d(r30.costoPorResultado)} en el mes.` };
  }
  return null;
}

/**
 * El diagnóstico de la cuenta. `campanas`: las activas, cada una con { id, nombre, objetivo, estado, i7, i30,
 * conjuntos: [{ id, nombre, estado, presupuestoDiario, i7, i30 }], anuncios: [{ id, nombre, conjuntoId, estado, i7, i30 }] }.
 * `costoMax`: el costo por resultado aceptable (si no, el promedio de 30 días de cada campaña). Pura.
 * → { hallazgos: [...], resumen: { campanas, gasto, resultados, costoPorResultado, bien } }
 */
export function diagnosticar(campanas = [], { costoMax = 0, moneda = "USD" } = {}) {
  const hallazgos = [];
  let bien = 0;
  let gasto = 0;
  let resultados = 0;
  for (const c of campanas) {
    const r7 = cifrasDe(c.i7, c.objetivo);
    const r30 = cifrasDe(c.i30, c.objetivo);
    gasto += r7?.gasto ?? 0;
    resultados += r7?.resultados ?? 0;
    const ref = Number(costoMax) > 0 ? Number(costoMax) : r30?.costoPorResultado ?? 0;
    const base = { campanaId: c.id, campana: c.nombre };
    if (String(c.estado).toUpperCase() === "ACTIVE" && (!r7 || !r7.gasto)) {
      hallazgos.push({ ...base, nivel: "campana", id: c.id, nombre: c.nombre, accion: "revisar", motivo: "La campaña está activa y no gastó nada en 7 días.", cifras: r7 });
      continue;
    }
    for (const [nivel, lista] of [["conjunto", c.conjuntos ?? []], ["anuncio", c.anuncios ?? []]]) {
      for (const x of lista) {
        if (!["ACTIVE"].includes(String(x.estado).toUpperCase())) continue;
        const h = evaluar({ ...x, nivel, objetivo: c.objetivo }, { ref, moneda });
        if (h) hallazgos.push({ ...base, nivel, id: x.id, nombre: x.nombre, ...h, cifras: cifrasDe(x.i7, c.objetivo) });
        else bien++;
      }
    }
  }
  hallazgos.sort((a, b) => ACCIONES_DIAGNOSTICO[a.accion].orden - ACCIONES_DIAGNOSTICO[b.accion].orden);
  return {
    hallazgos,
    resumen: { campanas: campanas.length, gasto: redondeo(gasto), resultados, costoPorResultado: resultados ? redondeo(gasto / resultados) : null, bien },
  };
}

/** Lo que se le pide a la IA si se quiere la explicación: con las reglas delante, sin inventar cifras. Pura. */
export function pedidoDiagnosticoIA({ marca, diagnostico, moneda = "USD", costoMax = 0 }) {
  const { hallazgos, resumen } = diagnostico;
  return [
    `Eres el especialista en Meta Ads de una agencia en Panamá. Explica a la agencia, en 4 a 8 frases sencillas, cómo van los anuncios de ${marca} esta semana y qué hacer primero.`,
    "Usa SOLO las cifras de abajo; no inventes ninguna. Español latino neutro, con «tú». Sin listas largas ni tecnicismos (di «costo por resultado», no «CPA»).",
    "",
    `Últimos 7 días: ${resumen.campanas} campañas activas, ${formatoMoneda(resumen.gasto, moneda)} gastados, ${resumen.resultados} resultados${resumen.costoPorResultado ? `, ${formatoMoneda(resumen.costoPorResultado, moneda)} por resultado` : ""}.`,
    costoMax ? `Lo aceptable por resultado: ${formatoMoneda(costoMax, moneda)}.` : "",
    "",
    "LO QUE DICEN LAS REGLAS:",
    ...(hallazgos.length ? hallazgos.map((h) => `- ${ACCIONES_DIAGNOSTICO[h.accion].nombre} · ${h.nivel} «${h.nombre}» (campaña «${h.campana}»): ${h.motivo}`) : ["- Nada fuera de lo normal."]),
    `- ${resumen.bien} conjuntos y anuncios van bien.`,
  ].filter((l) => l !== "").join("\n");
}
