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
//      subtítulo encima de un gráfico, el cuadro 0 sin gancho y, con los ANCHOS MEDIDOS, que ningún texto se monte sobre
//      otro ni se salga del cuadro. Cada aviso dice en qué segundo y qué hacer.
//
// Los anchos: los MIDE el kit con las letras de verdad (kit-edicion/python/letras.py: los avances de cada carácter en em)
// y llegan en `anchos`; lo que no esté medido se aproxima (titular ~0,47 em por carácter, texto ~0,66) y la revisión lo
// dice. La caja de cada texto replica cómo lo pinta kit-edicion/remotion/src/Piezas.jsx (tamaños, márgenes, interletra):
// si cambia una pieza allí, cambia su caja aquí (`elementosDePieza`).
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
/** El trío: tres columnas con este borde a los lados del cuadro y este hueco entre palabras; el tamaño más grande. */
export const TRIO = Object.freeze({ borde: 40, hueco: 36, tamMax: 112, alto: 330 });
const APROX = { titular: 0.47, texto: 0.66 };

/**
 * El MEDIDOR de textos: `anchos` = { titular: { _mayus, texto: em }, texto: {…} } (de letras.py). → { ancho(texto, tam,
 * rol, interletra), mayus(rol), aproximados: Set }. Lo que no está medido se aproxima y queda en `aproximados`. Pura.
 */
export function crearMedidor(anchos = null) {
  const aproximados = new Set();
  return {
    aproximados,
    ancho(texto, tam, rol = "titular", interletra = 0) {
      const t = String(texto ?? "");
      let em = anchos?.[rol]?.[t];
      if (typeof em !== "number") { em = [...t].length * APROX[rol]; if (t) aproximados.add(t); }
      // CSS suma el interletraje detrás de CADA carácter, también del último.
      return em * tam + interletra * [...t].length;
    },
    mayus: (rol = "titular") => anchos?.[rol]?._mayus || 0.72,
  };
}
const APROXIMADO = crearMedidor();

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

/** La altura de una línea de Inter (y de casi todas las de texto) con `line-height: normal`. */
const LINEA_TEXTO = 1.21;
/** Las cajas de las FILAS de una lista o de unas preguntas (cada una del ancho de su texto), como las pinta Piezas.jsx. Pura. */
export function filasDePieza(p, med = APROXIMADO) {
  if (p.tipo === "lista") {
    // El título (34 px, interletra 5, 12 de margen); cada fila: el cuadro del check (62) + 14 + la placa (46 px, 22 a
    // cada lado, 8 arriba y abajo), y 12 de margen.
    const y0 = p.y + (p.titulo ? 34 * LINEA_TEXTO + 12 : 0);
    const alto = Math.max(62, 46 * LINEA_TEXTO + 16);
    return p.items.map((it, i) => ({ x0: p.x, y0: y0 + i * (alto + 12), x1: p.x + 62 + 14 + 44 + med.ancho(it.texto, 46, "texto"), y1: y0 + i * (alto + 12) + alto, at: it.at, texto: it.texto }));
  }
  if (p.tipo === "preguntas") {
    return p.items.map((it, i) => {
      const a = 92 + 60 + med.ancho(it.texto, 46, "texto");
      return { x0: 540 - a / 2, y0: p.y + i * 108, x1: 540 + a / 2, y1: p.y + i * 108 + 92, at: it.at, texto: it.texto };
    });
  }
  return null;
}

/** La caja de una pieza en pantalla: { x0, y0, x1, y1 } (la de todos sus textos juntos). Pura. */
export function cajaDePieza(p, med = APROXIMADO) {
  const els = elementosDePieza(p, { med });
  if (!els.length) return { x0: 0, y0: p.y ?? 0, x1: 1080, y1: p.y ?? 0 };
  return { x0: Math.min(...els.map((e) => e.x0)), y0: Math.min(...els.map((e) => e.y0)), x1: Math.max(...els.map((e) => e.x1)), y1: Math.max(...els.map((e) => e.y1)) };
}

/** Una caja centrada en (cx, cy). */
const centrada = (cx, cy, w, h) => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });

/**
 * Los ELEMENTOS de una pieza que se pueden montar sobre otro o salirse del cuadro: cada texto (la caja de sus letras: el
 * ancho medido y la altura de las mayúsculas) o cada placa con texto dentro, con su ventana de tiempo. Replica
 * Piezas.jsx. → [{ x0, y0, x1, y1, desde, hasta, texto, quien }]. Pura.
 */
export function elementosDePieza(p, { med = APROXIMADO, marca = {} } = {}) {
  const ventana = (desde = p.desde) => ({ desde, hasta: p.hasta });
  // Un texto centrado en su caja (`cx` y su ancho, `caja`): si NO cabe, CSS no lo centra, lo desborda hacia la derecha
  // desde el borde izquierdo de la caja (así se salía «GRANDES» del trío). Por defecto, la caja es el cuadro entero.
  const letras = (texto, tam, cx, cy, rol = "titular", interletra = 0, caja = 1080) => {
    const w = med.ancho(texto, tam, rol, interletra);
    const h = tam * med.mayus(rol);
    return w <= caja ? centrada(cx, cy, w, h) : { x0: cx - caja / 2, y0: cy - h / 2, x1: cx - caja / 2 + w, y1: cy + h / 2 };
  };
  const de = (caja, texto, desde) => ({ ...caja, ...ventana(desde), texto, quien: p.tipo });
  switch (p.tipo) {
    case "titular": {
      let top = p.y - p.lineas[0].tam * 0.62;
      return p.lineas.map((l, i) => {
        const e = de(letras(l.texto, l.tam, 540, top + l.tam * 0.62, "titular", i ? 2 : 1), l.texto, 0);
        top += l.tam * 1.24 * 0.82;
        return e;
      });
    }
    case "gigante": return [de(letras(p.texto, p.tam, 540, p.y, "titular", p.espacio ?? 1), p.texto)];
    case "trio": return p.items.map((it) => de(letras(it.texto, it.tam, it.cx, it.cy, "titular", 1, p.col), it.texto, it.at));
    // La cinta es más ancha que el cuadro a propósito (va girada de lado a lado): lo que se comprueba es su texto.
    case "cinta": return [de(letras(p.texto, 76, 540, p.y, "titular", 2), p.texto)];
    case "logo": return [de({ x0: 540 - p.ancho / 2 - 22, y0: p.y - p.ancho * 0.45, x1: 540 + p.ancho / 2 + 22, y1: p.y + p.ancho * 0.45 }, "logo")];
    case "ficha": {
      // La píldora: 16 + el círculo (66) + 16 + el texto (60 px) + 30, y la flecha (16 + 40) si baja.
      const a = 16 + 66 + 16 + med.ancho(p.texto, 60, "titular", 1) + 30 + (p.baja ? 56 : 0);
      const x0 = p.lado === "derecha" ? p.x - a : p.x;
      return [de({ x0, y0: p.y, x1: x0 + a, y1: p.y + 94 }, p.texto)];
    }
    case "lista": {
      const filas = filasDePieza(p, med).map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, ...ventana(r.at), texto: r.texto, quien: p.tipo }));
      if (p.titulo) filas.unshift(de({ x0: p.x, y0: p.y, x1: p.x + med.ancho(p.titulo, 34, "texto", 5), y1: p.y + 34 * LINEA_TEXTO }, p.titulo));
      return filas;
    }
    case "preguntas": return filasDePieza(p, med).map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, ...ventana(r.at), texto: r.texto, quien: p.tipo }));
    case "sello": {
      // La placa: 44 a cada lado y 8 de borde; arriba (38 px, interletra 6) y lo grande (112 px, interletra 2).
      const a = Math.max(med.ancho(p.arriba, 38, "texto", 6), med.ancho(p.grande, 112, "titular", 2)) + 88 + 16;
      const h = 38 * LINEA_TEXTO + 112 * 1.05 + 38 + 16;
      return [de(centrada(540, p.y, a, h), p.grande)];
    }
    case "whatsapp": {
      const numero = String(marca.whatsapp ?? "");
      const a = 12 + 22 + 104 + 22 + Math.max(med.ancho("WHATSAPP", 30, "texto", 5), med.ancho(numero, 92, "titular", 2)) + 44;
      return [de({ x0: 540 - a / 2, y0: p.y, x1: 540 + a / 2, y1: p.y + 152 }, numero || "WHATSAPP")];
    }
    case "celular": return (p.titulos ?? []).map((x, i, todos) => ({ ...letras(x.texto, 64, 540, 262 + (x.numero ? 34 : 0) + 34, "titular"), desde: x.at, hasta: todos[i + 1]?.at ?? p.hasta, texto: x.texto, quien: p.tipo }));
    default: return [];
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
export function resolverPiezas(piezas, { palabras, cabeza, fps, vozFin, med = APROXIMADO }) {
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
        // Tres columnas iguales. SIN imagen, las tres palabras del MISMO tamaño: el mayor que deja cada una dentro de su
        // columna con aire entre ellas y con los bordes (lo que crece es la imagen, no la letra: sin ella, crecer las
        // montaba y «GRANDES» se salía por la derecha, Rofer 2026-11-21). CON imagen, crece la imagen y la palabra va debajo.
        const n = Math.max(1, (p.items ?? []).length);
        const col = (1080 - 2 * TRIO.borde) / n;
        // El ancho a 1 px de letra (em) y la interletra de 1 px por carácter: tam · em + n ≤ columna − hueco.
        const cabe = (texto, tope) => Math.min(tope, Math.floor((col - TRIO.hueco - [...String(texto)].length) / Math.max(0.01, med.ancho(texto, 1, "titular", 0))));
        const tamComun = Math.min(...(p.items ?? []).map((i) => cabe(i.texto, TRIO.tamMax)));
        const y = p.y ?? Math.max(ARRIBA_SEGURO, Math.min(tope - AIRE - TRIO.alto, 262));
        const items = (p.items ?? []).map((i, j) => {
          const escala = i.escala ?? [0.55, 0.78, 1][j] ?? 1;
          const tam = p.imagen ? cabe(i.texto, 64) : tamComun;
          return {
            ...i, escala, tam, cx: r3(TRIO.borde + col * (j + 0.5)), cy: r3(y + (p.imagen ? 272 : 200)),
            ...(p.imagen ? { img: r3(Math.min(300 * escala, col - TRIO.hueco)) } : {}), at: r3(instante(i, palabras) ?? desde),
          };
        });
        return { ...base, items, y, col: r3(col) };
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

/** Cuánto aire mínimo entre dos textos y con el borde del cuadro (px), y cuánto tienen que coincidir en el tiempo. */
const AIRE_TEXTOS = 6;
const A_LA_VEZ = 0.1;

/**
 * Con los ANCHOS MEDIDOS: que ningún texto (ni placa con texto) se salga del cuadro y que ninguno se monte sobre otro que
 * se vea al mismo tiempo, en TODAS las piezas (también los de una misma pieza: las tres palabras del trío, las líneas del
 * titular). La raya del tachado no cuenta (tacha a propósito). Pura.
 */
export function revisarTextos(piezas, { med = APROXIMADO, marca = {}, decir }) {
  const els = piezas.filter((p) => p.desde !== null && p.hasta !== null).flatMap((p) => elementosDePieza(p, { med, marca }).map((e) => ({ ...e, n: p.n })));
  const nombre = (e) => (e.quien === "logo" ? "la tarjeta del logo" : `«${e.texto}» (${e.quien})`);
  for (const e of els) {
    const fuera = Math.max(0 - e.x0, e.x1 - 1080, 0 - e.y0, e.y1 - 1920);
    if (fuera > 0) decir(e.desde, true, `${nombre(e)} se sale del cuadro ${Math.round(fuera)} px.`, "Hazlo más pequeño, más corto o muévelo hacia dentro.");
  }
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i];
      const b = els[j];
      if (Math.min(a.hasta, b.hasta) - Math.max(a.desde, b.desde) <= A_LA_VEZ) continue;
      const sx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + AIRE_TEXTOS;
      const sy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + AIRE_TEXTOS;
      if (sx > 0 && sy > 0) decir(Math.max(a.desde, b.desde), true, `${nombre(a)} se monta sobre ${nombre(b)}.`, "Sepáralos, hazlos más pequeños o que no coincidan en el tiempo.");
    }
  }
  if (med.aproximados.size) {
    decir(0, false, `Medidas aproximadas para ${med.aproximados.size} textos (${[...med.aproximados].slice(0, 3).map((t) => `«${t}»`).join(", ")}…): no se pudieron medir con la letra.`, "Corre escena con el kit instalado (letras.py) para medirlos.");
  }
}

/**
 * La REVISIÓN DE OFICIO de la escena: [{ t, grave, que, arreglo }], en orden de tiempo. Pura.
 */
export function revisarEscena({ piezas, cabeza, fps, grupos, palabras, med = APROXIMADO, marca = {} }) {
  const avisos = [];
  const decir = (t, grave, que, arreglo) => avisos.push({ t: r3(t ?? 0), grave, que, arreglo });
  revisarTextos(piezas, { med, marca, decir });
  if (!piezas.some((p) => p.tipo === "titular")) decir(0, true, "El cuadro 0 no muestra el gancho (es la portada del perfil).", "Añade un «titular» con el gancho completo.");
  for (const p of piezas) {
    if (p.desde === null || p.hasta === null) { decir(0, true, `La pieza ${p.n + 1} (${p.tipo}) tiene un instante que no existe.`, "Revisa sus «palabra» o «t»."); continue; }
    if (p.tipo === "celular" || p.tipo === "whatsapp") continue;
    const c = cajaDePieza(p, med);
    if (c.y0 < ARRIBA_SEGURO - 12) decir(p.desde, false, `${p.tipo} «${p.texto ?? p.grande ?? p.lineas?.[0]?.texto ?? ""}» sube por encima de la franja segura (${ARRIBA_SEGURO} px).`, "Bájalo o hazlo más pequeño.");
    if (c.y1 > ABAJO_SEGURO + 12 && p.tipo !== "preguntas") decir(p.desde, false, `${p.tipo} baja de la franja segura de abajo (${ABAJO_SEGURO} px).`, "Súbelo: abajo lo tapa la aplicación.");
    // Contra la cabeza, en cinco momentos de su vida; una lista o unas preguntas, fila a fila y sólo desde que entra cada una.
    // Detrás: cuánto del TEXTO tapa la cabeza (tiene que leerse). Delante: cuánto de la CARA tapa la pieza (rozar el
    // borde de la caja de la cabeza no es taparla: con los anchos medidos, las fichas de Rofer v2 la rozaban).
    let peor = 0;
    let cara = 0;
    const filas = DETRAS.has(p.tipo) ? (filasDePieza(p, med) ?? [{ ...c, at: p.desde }]) : elementosDePieza(p, { med }).map((e) => ({ ...e, at: e.desde }));
    for (let k = 0; k <= 4; k++) {
      const t = p.desde + ((p.hasta - 0.05 - p.desde) * k) / 4;
      const h = cabezaEn(cabeza, fps, t);
      if (!h) continue;
      const cab = cajaCabeza(h);
      for (const r of filas) {
        if (t < r.at - 0.05 || !area(r)) continue;
        peor = Math.max(peor, solapa(r, cab) / Math.min(area(r), area(cab)));
        cara = Math.max(cara, solapa(r, cab) / area(cab));
      }
    }
    if (DETRAS.has(p.tipo)) {
      if (peor > 0.35) decir(p.desde, true, `La cabeza tapa ~${Math.round(peor * 100)} % de «${p.texto ?? p.lineas?.[0]?.texto ?? p.tipo}».`, "Súbelo o cambia el texto (una línea, otra palabra): tiene que leerse.");
    } else if (cara > 0.06) {
      decir(p.desde, true, `${p.tipo} tapa ~${Math.round(cara * 100)} % de la cabeza o la cara.`, "Llévalo arriba, con aire sobre la cabeza (nunca a la altura de la cara).");
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
      const filas = filasDePieza(p, med) ?? [{ ...cajaDePieza(p, med), at: p.desde }];
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
export function escenaParaRemotion({ linea, palabras, camara, plan, marca, anchos = null }) {
  const { fps, total, vozFin } = linea;
  const med = crearMedidor(anchos);
  const piezas = resolverPiezas(plan.piezas, { palabras, cabeza: camara.cabeza, fps, vozFin, med });
  const st = plan.subtitulos ?? {};
  const sub = subtitulos(palabras, piezas, { textos: st.textos, reemplazos: st.reemplazos, ocultar: st.ocultar });
  if (sub.error) return { error: sub.error };
  const avisos = revisarEscena({ piezas, cabeza: camara.cabeza, fps, grupos: sub.grupos, palabras: sub.palabras, med, marca });
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

/** Los textos de las piezas del plan que hay que MEDIR, por papel de letra: { titular: [...], texto: [...] }. Pura. */
export function textosDeEscena(piezas = [], marca = {}) {
  const t = new Set();
  const x = new Set(["WHATSAPP"]);
  for (const p of piezas ?? []) {
    for (const k of ["texto", "grande"]) if (p[k]) (p.tipo === "lista" || p.tipo === "preguntas" ? x : t).add(String(p[k]));
    if (p.arriba) x.add(String(p.arriba));
    if (p.titulo) x.add(String(p.titulo));
    for (const l of p.lineas ?? []) if (l.texto) t.add(String(l.texto));
    for (const i of p.items ?? []) if (i.texto) (p.tipo === "lista" || p.tipo === "preguntas" ? x : t).add(String(i.texto));
    for (const i of p.titulos ?? []) if (i.texto) t.add(String(i.texto));
  }
  if (marca?.whatsapp) t.add(String(marca.whatsapp));
  return { titular: [...t], texto: [...x] };
}
