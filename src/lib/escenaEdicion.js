// ============================================================
// La ESCENA de un video grabado (puro): de lo que decide quien edita a lo que pinta Remotion, y su REVISIÓN DE OFICIO
//
// Quien edita escribe en plan.json las PIEZAS (texto gigante detrás de la persona, titular del gancho, sello, cinta,
// fichas, lista, preguntas, botón de WhatsApp, modo celular…), cada una anclada a la PALABRA que la dice. Esto:
//   1. resuelve cada instante a segundos de salida (planEdicion.instante);
//   2. coloca lo que no dice dónde va: lo de arriba, con AIRE sobre el tope real de la cabeza o del casco (no la caja de la
//      cara: decisión de la agencia, 2026-11-20) y dentro de la franja segura;
//   3. arma los subtítulos (grupos de hasta 4 palabras) y oculta los que repiten lo que ya dice un gráfico;
//   4. junta todo con la cámara (camaraEdicion.js) y la marca en el JSON que lee kit-edicion/remotion;
//   5. REVISA: lo que tapa la cara, el texto gigante que la cabeza no deja leer, lo que sale de la franja segura, el
//      subtítulo encima de un gráfico, el cuadro 0 sin gancho. Cada aviso dice en qué segundo y qué hacer.
//
// Las medidas del texto son aproximadas (la letra del titular, condensada, ~0,47 em por carácter): sirven para avisar; el
// ancho exacto lo mide el navegador al pintar.
// ============================================================

import { OFICIO } from "./oficioEdicion.js";
import { instante } from "./planEdicion.js";
import { gruposDeSubtitulos, gruposDesdeTexto, normalizar } from "./corteEdicion.js";

export const TIPOS_PIEZA = Object.freeze({
  titular: "El gancho completo en el cuadro 0 (portada), detrás de la persona",
  gigante: "Texto gigante detrás de la persona, en el cielo o el espacio de arriba",
  tachado: "Una raya que tacha el texto gigante",
  cinta: "Cinta de obra con texto (para lo negativo)",
  logo: "La tarjeta del logo",
  ficha: "Ficha con icono (para pares: TIEMPO / DINERO)",
  lista: "Lista que entra ítem a ítem con la palabra (arriba, nunca a la altura de la cara)",
  sello: "Sello para un dato fuerte (FLOTA PROPIA · 14 EQUIPOS)",
  preguntas: "Preguntas numeradas en placas",
  trio: "Tres tamaños o tres cosas que crecen, con su palabra",
  whatsapp: "El botón de WhatsApp con el número, y su toque",
  celular: "Modo celular: la pantalla dentro de un teléfono y la persona en una burbuja",
});
const DETRAS = new Set(["titular", "gigante", "tachado", "trio"]);
const ARRIBA_SEGURO = Math.round(1920 * OFICIO.zonas.arriba);
const ABAJO_SEGURO = Math.round(1920 * (1 - OFICIO.zonas.abajo));
const AIRE = 40;
const r3 = (n) => Math.round(n * 1000) / 1000;
/** Ancho aproximado: la letra del titular es condensada (~0,47 em por carácter); la del texto, negra y ancha (~0,66). */
const anchoTexto = (texto, tam, cuerpo = false) => String(texto ?? "").length * tam * (cuerpo ? 0.66 : 0.47);

/** La cabeza en pantalla en un segundo (la del cuadro más cercano con cabeza). Pura. */
export function cabezaEn(cabeza, fps, t) {
  const f = Math.max(0, Math.min(cabeza.length - 1, Math.round(t * fps)));
  for (let d = 0; d < 15; d++) {
    if (cabeza[f + d]) return cabeza[f + d];
    if (cabeza[f - d]) return cabeza[f - d];
  }
  return null;
}

/** El tope más alto (menor y) de la cabeza entre dos segundos. Pura. */
function topeMinimo(cabeza, fps, a, b) {
  let m = Infinity;
  for (let f = Math.max(0, Math.round(a * fps)); f <= Math.min(cabeza.length - 1, Math.round(b * fps)); f++) if (cabeza[f]) m = Math.min(m, cabeza[f][1]);
  return Number.isFinite(m) ? m : 600;
}

/** Las cajas de las FILAS de una lista o de unas preguntas (cada una del ancho de su texto). Pura. */
export function filasDePieza(p) {
  if (p.tipo === "lista") {
    const y0 = p.y + (p.titulo ? 46 : 0);
    return p.items.map((it, i) => ({ x0: p.x, y0: y0 + i * 74, x1: p.x + 76 + anchoTexto(it.texto, 46, true) + 44, y1: y0 + i * 74 + 62, at: it.at }));
  }
  if (p.tipo === "preguntas") {
    return p.items.map((it, i) => { const a = 92 + anchoTexto(it.texto, 46, true) + 60; return { x0: 540 - a / 2, y0: p.y + i * 108, x1: 540 + a / 2, y1: p.y + i * 108 + 92, at: it.at }; });
  }
  return null;
}

/** La caja aproximada de una pieza en pantalla: { x0, y0, x1, y1 }. Pura. */
export function cajaDePieza(p) {
  const y = p.y;
  switch (p.tipo) {
    case "titular": {
      const alto = p.lineas.reduce((s, l) => s + l.tam * 1.24, 0);
      const ancho = Math.max(...p.lineas.map((l) => anchoTexto(l.texto, l.tam)));
      return { x0: 540 - ancho / 2, y0: y - p.lineas[0].tam * 0.4, x1: 540 + ancho / 2, y1: y - p.lineas[0].tam * 0.62 + alto - p.lineas.at(-1).tam * 0.22 };
    }
    case "gigante": {
      // La LETRA, no la caja de la línea: las mayúsculas de una letra de titular ocupan ~0,4 em arriba y abajo del centro.
      const a = anchoTexto(p.texto, p.tam);
      return { x0: 540 - a / 2, y0: y - p.tam * 0.4, x1: 540 + a / 2, y1: y + p.tam * 0.4 };
    }
    case "tachado": return { x0: 540 - p.ancho / 2, y0: y - 9, x1: 540 + p.ancho / 2, y1: y + 9 };
    case "cinta": return { x0: 0, y0: y - 90, x1: 1080, y1: y + 90 };
    case "logo": return { x0: 540 - p.ancho / 2 - 22, y0: y - p.ancho * 0.45, x1: 540 + p.ancho / 2 + 22, y1: y + p.ancho * 0.45 };
    case "ficha": {
      const a = anchoTexto(p.texto, 60) + 130;
      return p.lado === "derecha" ? { x0: p.x - a, y0: y, x1: p.x, y1: y + 94 } : { x0: p.x, y0: y, x1: p.x + a, y1: y + 94 };
    }
    case "lista": { const f = filasDePieza(p); return { x0: p.x, y0: y, x1: Math.max(...f.map((r) => r.x1)), y1: f.at(-1).y1 }; }
    case "sello": {
      const a = Math.max(anchoTexto(p.grande, 112), anchoTexto(p.arriba, 38) * 1.3) + 100;
      return { x0: 540 - a / 2, y0: y - 110, x1: 540 + a / 2, y1: y + 110 };
    }
    case "preguntas": { const f = filasDePieza(p); return { x0: Math.min(...f.map((r) => r.x0)), y0: y, x1: Math.max(...f.map((r) => r.x1)), y1: f.at(-1).y1 }; }
    case "trio": return { x0: 30, y0: y, x1: 1050, y1: y + 330 };
    case "whatsapp": return { x0: 140, y0: y, x1: 940, y1: y + 150 };
    default: return { x0: 0, y0: y, x1: 1080, y1: y };
  }
}

const solapa = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const area = (a) => Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
/** La caja de la cabeza (casco incluido) y la cara debajo: del tope, ~1,3 anchos hacia abajo. */
const cajaCabeza = ([x, tope, ancho]) => ({ x0: x - ancho / 2, y0: tope, x1: x + ancho / 2, y1: tope + ancho * 1.3 });

/**
 * Resuelve las piezas del plan: instantes en segundos y posiciones por defecto. `palabras` (en salida), `cabeza` (por
 * cuadro), `fps`, `vozFin`. → [{ tipo, desde, hasta, ...con y, x, tam resueltos }]. Pura.
 */
export function resolverPiezas(piezas, { palabras, cabeza, fps, vozFin }) {
  const t = (x, defecto) => (x === undefined ? defecto : instante(x, palabras));
  return (piezas ?? []).map((p, k) => {
    const desde = p.tipo === "titular" ? 0 : t(p.desde, 0);
    const hasta = p.tipo === "whatsapp" ? vozFin : t(p.hasta, vozFin);
    const tope = topeMinimo(cabeza, fps, desde ?? 0, hasta ?? vozFin);
    const base = { ...p, n: k, desde: desde === null ? null : r3(desde), hasta: hasta === null ? null : r3(hasta) };
    switch (p.tipo) {
      case "titular": {
        const lineas = (p.lineas ?? []).map((l, i) => ({ texto: l.texto, tam: l.tam ?? (i === 0 ? 150 : 92), color: l.color ?? (i === 0 ? "claro" : "acento") }));
        return { ...base, lineas, y: p.y ?? Math.max(ARRIBA_SEGURO + lineas[0]?.tam * 0.62, 352) };
      }
      case "gigante": {
        const tam = p.tam ?? 150;
        // En el cielo, con aire sobre la cabeza; si no cabe entre la franja segura y la cabeza, que la toque un poco por
        // detrás (se permite si se lee: la revisión lo dice).
        const y = p.y ?? Math.max(ARRIBA_SEGURO + tam * 0.62, Math.min(tope - AIRE - tam * 0.62, 520));
        return { ...base, tam, y, color: p.color ?? "claro", modo: p.modo ?? "subir" };
      }
      case "tachado": return { ...base, y: p.y ?? 382, ancho: p.ancho ?? 880 };
      case "cinta": return { ...base, y: p.y ?? Math.max(ARRIBA_SEGURO + 90, Math.min(tope - AIRE - 90, 400)), giro: p.giro ?? -7 };
      case "logo": {
        const ancho = p.ancho ?? 360;
        return { ...base, ancho, y: p.y ?? Math.max(ARRIBA_SEGURO + ancho * 0.45, Math.min(tope - AIRE - ancho * 0.45, 392)) };
      }
      case "ficha": return { ...base, lado: p.lado ?? "izquierda", x: p.x ?? (p.lado === "derecha" ? 1040 : 40), y: p.y ?? 1000, icono: p.icono ?? "check" };
      case "lista": {
        const items = (p.items ?? []).map((i) => ({ ...i, at: r3(instante(i, palabras) ?? desde) }));
        const alto = 46 + items.length * 86;
        return { ...base, items, x: p.x ?? 44, y: p.y ?? Math.max(ARRIBA_SEGURO, Math.min(tope - AIRE - alto, 282)) };
      }
      case "sello": return { ...base, y: p.y ?? Math.max(ARRIBA_SEGURO + 110, Math.min(tope - AIRE - 110, 400)), giro: p.giro ?? -5 };
      case "preguntas": {
        const items = (p.items ?? []).map((i) => ({ ...i, at: r3(instante(i, palabras) ?? desde) }));
        return { ...base, items, y: p.y ?? 1128, marcar: p.marcar === undefined ? null : r3(instante(p.marcar, palabras)) };
      }
      case "trio": {
        const items = (p.items ?? []).map((i, j) => ({ ...i, escala: i.escala ?? [0.55, 0.78, 1][j] ?? 1, at: r3(instante(i, palabras) ?? desde) }));
        return { ...base, items, y: p.y ?? Math.max(ARRIBA_SEGURO, Math.min(tope - AIRE - 330, 262)) };
      }
      case "whatsapp": return { ...base, toque: p.toque === undefined ? null : r3(instante(p.toque, palabras)), y: p.y ?? 300 };
      case "celular": return { ...base, pantallas: p.pantallas ?? [], titulos: (p.titulos ?? []).map((x) => ({ ...x, at: r3(instante(x, palabras) ?? desde) })) };
      default: return base;
    }
  });
}

/** Los grupos de subtítulos, y cuáles se ocultan porque un gráfico ya dice lo mismo. Pura. */
export function subtitulos(palabras, piezas, { textos = null, reemplazos = {}, ocultar = [], maxPalabras = OFICIO.subtitulos.maxPalabras } = {}) {
  let grupos;
  let mostradas = palabras.map((p) => ({ ...p, texto: String(p.w).trim(), clave: false }));
  if (textos?.length) {
    const r = gruposDesdeTexto(palabras, textos, { reemplazos, maxPalabras });
    if (r.error) return { error: r.error };
    grupos = r.grupos;
    mostradas = r.palabras;
  } else grupos = gruposDeSubtitulos(palabras, { maxPalabras });
  // Lo que dicen los gráficos que se leen ítem a ítem (lista, preguntas, trío): un subtítulo que se dice MIENTRAS está el
  // gráfico y con al menos la mitad de sus palabras en él se oculta: el gráfico ya lo dice. Y los rangos del plan.
  const graficos = piezas.filter((p) => ["lista", "preguntas", "trio"].includes(p.tipo) && p.desde !== null)
    .map((p) => ({ desde: p.desde, hasta: p.hasta, palabras: new Set(p.items.flatMap((i) => String(i.texto).split(/\s+/).map(normalizar)).filter(Boolean)) }));
  const fuera = new Set();
  for (const [a, b] of ocultar) for (let i = a; i <= (b ?? a); i++) fuera.add(i);
  return {
    palabras: mostradas,
    grupos: grupos.map((ids) => {
      const s = mostradas[ids[0]].s;
      const ws = ids.map((i) => normalizar(mostradas[i].texto)).filter(Boolean);
      const dicho = graficos.some((g) => s >= g.desde - 0.1 && s <= g.hasta && ws.filter((w) => g.palabras.has(w)).length / Math.max(1, ws.length) >= 0.5);
      return { ids, oculto: ids.every((i) => fuera.has(i)) || dicho };
    }),
  };
}

/**
 * La REVISIÓN DE OFICIO de la escena: [{ t, grave, que, arreglo }], en orden de tiempo. Pura.
 */
export function revisarEscena({ piezas, cabeza, fps, grupos, palabras }) {
  const avisos = [];
  const decir = (t, grave, que, arreglo) => avisos.push({ t: r3(t ?? 0), grave, que, arreglo });
  if (!piezas.some((p) => p.tipo === "titular")) decir(0, true, "El cuadro 0 no muestra el gancho (es la portada del perfil).", "Añade un «titular» con el gancho completo.");
  for (const p of piezas) {
    if (p.desde === null || p.hasta === null) { decir(0, true, `La pieza ${p.n + 1} (${p.tipo}) tiene un instante que no existe.`, "Revisa sus «palabra» o «t»."); continue; }
    if (p.tipo === "celular" || p.tipo === "whatsapp") continue;
    const c = cajaDePieza(p);
    if (c.y0 < ARRIBA_SEGURO - 12) decir(p.desde, false, `${p.tipo} «${p.texto ?? p.grande ?? p.lineas?.[0]?.texto ?? ""}» sube por encima de la franja segura (${ARRIBA_SEGURO} px).`, "Bájalo o hazlo más pequeño.");
    if (c.y1 > ABAJO_SEGURO + 12 && p.tipo !== "preguntas") decir(p.desde, false, `${p.tipo} baja de la franja segura de abajo (${ABAJO_SEGURO} px).`, "Súbelo: abajo lo tapa la aplicación.");
    // Contra la cabeza, en cinco momentos de su vida; una lista o unas preguntas, fila a fila y sólo desde que entra cada una.
    let peor = 0;
    const filas = filasDePieza(p) ?? [{ ...c, at: p.desde }];
    for (let k = 0; k <= 4; k++) {
      const t = p.desde + ((p.hasta - 0.05 - p.desde) * k) / 4;
      const h = cabezaEn(cabeza, fps, t);
      if (!h) continue;
      const cab = cajaCabeza(h);
      for (const r of filas) if (t >= r.at - 0.05) peor = Math.max(peor, area(r) ? solapa(r, cab) / Math.min(area(r), area(cab)) : 0);
    }
    if (DETRAS.has(p.tipo)) {
      if (peor > 0.35) decir(p.desde, true, `La cabeza tapa ~${Math.round(peor * 100)} % de «${p.texto ?? p.lineas?.[0]?.texto ?? p.tipo}».`, "Súbelo o cambia el texto (una línea, otra palabra): tiene que leerse.");
    } else if (peor > 0.05) {
      decir(p.desde, true, `${p.tipo} tapa la cabeza o la cara.`, "Llévalo arriba, con aire sobre la cabeza (nunca a la altura de la cara).");
    }
  }
  // Un subtítulo que se ve mientras hay un gráfico en su franja.
  const franja = { x0: 0, y0: 1380 - 70, x1: 1080, y1: 1380 + 70 };
  grupos.forEach((g, k) => {
    if (g.oculto) return;
    // La ventana en que SE VE (la misma que usa Subtitulos en Remotion).
    const a = palabras[g.ids[0]].s - 0.08;
    const sig = grupos[k + 1] ? palabras[grupos[k + 1].ids[0]].s - 0.08 : Infinity;
    const b = Math.min(sig, palabras[g.ids[g.ids.length - 1]].e + 0.5);
    const choca = piezas.find((p) => {
      if (p.desde === null || ["celular", "whatsapp", "titular"].includes(p.tipo)) return false;
      const filas = filasDePieza(p) ?? [{ ...cajaDePieza(p), at: p.desde }];
      // Un cruce de menos de 0,1 s (uno entra mientras el otro se apaga) no cuenta.
      return filas.some((r) => Math.min(b, p.hasta) - Math.max(a, r.at - 0.08) > 0.1 && solapa(r, franja) > 0);
    });
    if (choca) decir(a + 0.08, true, `El subtítulo «${g.ids.map((i) => palabras[i].texto ?? palabras[i].w).join(" ")}» cae encima de ${choca.tipo}.`, "Oculta ese subtítulo o mueve el gráfico.");
  });
  return avisos.sort((x, y) => x.t - y.t);
}

/**
 * Todo lo que lee Remotion. `linea` (corteEdicion), `palabras`, `camara` ({ cam, cabeza }), `plan`, `marca`. → { datos,
 * avisos } o { error }. Pura.
 */
export function escenaParaRemotion({ linea, palabras, camara, plan, marca }) {
  const { fps, total, vozFin } = linea;
  const piezas = resolverPiezas(plan.piezas, { palabras, cabeza: camara.cabeza, fps, vozFin });
  const st = plan.subtitulos ?? {};
  const sub = subtitulos(palabras, piezas, { textos: st.textos, reemplazos: st.reemplazos, ocultar: st.ocultar });
  if (sub.error) return { error: sub.error };
  const avisos = revisarEscena({ piezas, cabeza: camara.cabeza, fps, grupos: sub.grupos, palabras: sub.palabras });
  const golpes = (plan.golpes ?? []).map((g) => instante(g, palabras)).filter((x) => x !== null).map(r3);
  return {
    avisos,
    datos: {
      fps, total, vozFin, ancho: 1080, alto: 1920,
      palabras: sub.palabras.map((p) => ({ w: (p.texto ?? p.w).replace(/[.,;:]+$/, ""), s: p.s, e: p.e, kw: Boolean(p.clave) })),
      grupos: sub.grupos,
      cam: camara.cam, cabeza: camara.cabeza,
      cortes: linea.cortes, cambios: linea.cambiosClip,
      piezas, golpes, marca,
      subtitulos: { y: st.y ?? 1380, estilo: marca?.subtitulos?.estilo ?? "placa", mayusculas: marca?.subtitulos?.mayusculas ?? true },
      cierre: { segundos: linea.cierre, ...(plan.cierre ?? {}) },
    },
  };
}
