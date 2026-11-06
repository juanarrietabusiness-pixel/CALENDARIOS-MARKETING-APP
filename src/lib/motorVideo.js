// ============================================================
// El MOTOR del video animado: dibuja un fotograma de un guion en un lienzo 2D (puro)
//
// `dibujarFrame(ctx, …)` pinta el instante `t` de un guion validado
// (src/lib/videoEscenas.js) en un contexto de Canvas 2D. No conoce el navegador:
// no crea lienzos, no carga imágenes ni fuentes y no lee la hora. Así el MISMO
// código dibuja la vista previa en la pantalla y, en la fase 2, cada fotograma
// del render en el Container (con un Canvas 2D de Node). Lo que cambie entre los
// dos tiene que entrar por `recursos` y `fuentes`, nunca por aquí.
//
// Reglas que no se ven y sostienen el render:
//
//   · DETERMINISTA. El mismo guion, la misma línea de tiempo y el mismo `t`
//     dan exactamente las mismas llamadas al lienzo. Nada de Math.random ni de
//     Date: lo «aleatorio» (el grano, el papel, la mancha) sale de una semilla
//     (`semilla`), y el grano cambia por FOTOGRAMA, no por reloj.
//   · COORDENADAS DE SALIDA. Se dibuja en las medidas del formato (1080 × 1920
//     en 9:16) aunque el lienzo sea más pequeño: quien llama escala el contexto
//     antes (`ctx.scale`). El motor nunca toca la transformación de fuera: todo
//     va entre `save()` y `restore()`.
//   · UNA CAPA QUE AÚN NO ENTRA NO SE DIBUJA. Antes de su `entra` y después de
//     su `sale` (más la salida animada) no hay ni una llamada: así un fotograma
//     sólo paga lo que se ve.
//   · LO QUE EL MOTOR AÚN NO DIBUJA SE VE COMO UN MARCADOR con su nombre
//     (`COMPONENTES_LISTOS`): el guion es válido aunque el componente llegue
//     después, y la vista previa no se rompe.
// ============================================================

import { dibujarPersonaje, expresionDe, PROPORCION_PERSONAJE } from "./personajeVideo.js";
import { FORMATOS_VIDEO, FPS, tiempoDeCapa, segundoDelClip } from "./videoEscenas.js";
import { gruposDeSubtitulos, grupoEn, estadoDePalabras } from "./subtitulos.js";
import {
  dibujarIcono, dibujarFormas, dibujarEstrellas, dibujarLineas, formatearCifra, avanceDeCuenta, logoNecesitaPlaca,
} from "./motorPiezas.js";
import { dibujarLista, dibujarBurbuja, dibujarReloj, dibujarAntesDespues, dibujarTelefono } from "./motorComponentes.js";
import {
  partirEnfasis, tieneEnfasis, encajarRico, encajarGigante, tiemposDePalabras, impactoDe,
} from "./motorTexto.js";
import { pulsoEn } from "./golpes.js";

// La letra de la casa (rol gigante y énfasis sin letra del kit): vive en motorTexto.js; aquí, a mano de quien carga.
export { FUENTE_CASA, ARCHIVO_FUENTE_CASA, FUENTE_IMPACTO, impactoDe } from "./motorTexto.js";

/** Los componentes que este motor ya dibuja (todos los del formato v1). Uno desconocido sale como marcador. */
export const COMPONENTES_LISTOS = Object.freeze([
  "texto", "sello", "imagen", "forma", "logo", "llamado", "cifra", "icono", "anillo", "dibujo", "personaje",
  "lista", "burbuja", "reloj", "antes_despues", "telefono", "video",
]);

/** Una capa de video a sangre (`encuadre` «completo»): va detrás de todo, a todo el cuadro, y no entra en el reparto. */
export const esVideoCompleto = (capa) => capa?.tipo === "video" && capa.encuadre !== "caja";
/** Una IMAGEN a sangre (`encuadre` «completo»: una foto con música). Por defecto una imagen va en su caja. */
export const esImagenCompleta = (capa) => capa?.tipo === "imagen" && capa.encuadre === "completo";
/** Lo que va A SANGRE detrás de todo y fuera del reparto: un video o una imagen con `encuadre` «completo». */
export const esCapaCompleta = (capa) => esVideoCompleto(capa) || esImagenCompleta(capa);

/** Cuánto se mueve una imagen a sangre: lo que se acerca (o aleja) en todo lo que se ve, y la escala del paneo. */
export const MOVIMIENTO_IMAGEN = Object.freeze({ zoom: 0.12, paneo: 1.08 });

/**
 * Cómo está una imagen a sangre con su `movimiento` cuando lleva `p` (0–1) de lo que se ve: { escala, desplaza }
 * (`desplaza`, de −1 a 1: cuánto de lo que sobra a los lados se corre a la derecha). Suave al empezar y al acabar
 * (seno), sin saltos: es el «Ken Burns» de una foto con música. Pura.
 */
export function movimientoDeImagen(movimiento, p) {
  const q = (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, Number(p) || 0)))) / 2;
  switch (movimiento) {
    case "acercar": return { escala: 1 + MOVIMIENTO_IMAGEN.zoom * q, desplaza: 0 };
    case "alejar": return { escala: 1 + MOVIMIENTO_IMAGEN.zoom * (1 - q), desplaza: 0 };
    case "paneo": return { escala: MOVIMIENTO_IMAGEN.paneo, desplaza: -1 + 2 * q };
    default: return { escala: 1, desplaza: 0 };
  }
}

export const FUENTE_RESPALDO = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// ------------------------------------------------------------
// Semillas y suavizados
// ------------------------------------------------------------

/** Un número de 32 bits a partir de un texto (FNV-1a). Pura. */
export function semilla(texto = "") {
  let h = 0x811c9dc5;
  for (const c of String(texto)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Un generador de números entre 0 y 1 a partir de una semilla (mulberry32). Pura. */
export function aleatorio(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const limitar = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const suave = {
  lineal: (p) => p,
  sale: (p) => 1 - (1 - p) ** 3,
  entraSale: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  rebote: (p) => { const c = 1.70158; const c3 = c + 1; return 1 + c3 * (p - 1) ** 3 + c * (p - 1) ** 2; },
};

/** Lo que dura la entrada de una capa según el ritmo del estilo. */
export const DURACION_ENTRADA = Object.freeze({ calmado: 0.6, medio: 0.4, rapido: 0.25 });
export const DURACION_SALIDA = 0.3;
/** Lo que tarda la entrada «golpe» en asentarse (de 1,15 a 1). */
export const DURACION_GOLPE = 0.12;

// ------------------------------------------------------------
// Colores
// ------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;
const PALETA_NEUTRA = Object.freeze({
  fondo: "#F6F4EF", superficie: "#FFFFFF", texto: "#1F2430", acento: "#E4572E", apoyo: "#7BA7BC", claro: "#FFFFFF", oscuro: "#1F2430",
});

const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const saturacion = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};
/** El que más contrasta con `fondo` de los dos dados. Pura. */
export function contraste(fondo, a = "#FFFFFF", b = "#111111") {
  const r = (x, y) => { const [l1, l2] = [luminancia(x), luminancia(y)].sort((m, n) => n - m); return (l1 + 0.05) / (l2 + 0.05); };
  return r(fondo, a) >= r(fondo, b) ? a : b;
}

/** La razón de contraste entre dos colores (1–21, WCAG). Pura. */
export function razonDeContraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Qué dice el papel de un color, por token. Lo que va ANTES de la primera raya o barra («Fondo de apoyo — …»,
 * «Texto/títulos…») es lo que el color ES y pesa el triple; lo de después lo matiza. Así «base limpia para texto»
 * dentro del papel de un FONDO no lo vuelve color de texto, y «acento natural» no le gana a un «CTA».
 */
const PISTAS = Object.freeze({
  fondo: [[/fondo|background|lienzo/, 3]],
  superficie: [[/superficie|tarjeta|placa|caja/, 3], [/fondo de apoyo|apoyo|secundari/, 1]],
  texto: [[/texto|tipograf|t[ií]tul|titular|letra/, 3], [/estructura|tinta|ink/, 1]],
  acento: [[/cta|bot[oó]n|llamado|highlight/, 3], [/acento c[aá]lido|detalle/, 2], [/acento/, 1]],
  apoyo: [[/marca|logo|apoyo|secundari|natural|acento suave/, 2]],
});
/** Los papeles en los que la primera palabra desempata (el de apoyo no: «Apoyo del verde» no le gana al color del logo). */
const PRIMERA_DECIDE = new Set(["texto", "acento"]);
function puntaje(rol, token) {
  const [cabeza, ...resto] = rol.split(/\s[—–-]\s|\//);
  const cola = resto.join(" ");
  // La PRIMERA palabra del papel es lo que el color ES («acento principal: logo, títulos…», «texto y contraste…»): sin
  // ella, el dorado de 57DMC empataba con el blanco en «texto» (por «títulos») y salía de texto, y el blanco de acento.
  const primera = rol.trim().split(/[\s:;,.—–/-]+/)[0] ?? "";
  let n = 0;
  for (const [re, peso] of PISTAS[token]) {
    if (re.test(cabeza)) n += peso * 3;
    else if (re.test(cola)) n += peso;
    if (primera && PRIMERA_DECIDE.has(token) && re.test(primera)) n += peso * 2;
  }
  return n;
}

/**
 * La paleta de tokens a partir de la del KIT (`[{ hex, nombre, rol }]`), en este orden: el FONDO (lo que su papel
 * llama fondo; si no, el más claro), el TEXTO (lo que su papel llama texto o título, pero sólo si se lee sobre ese
 * fondo: 4,5 a 1, o 3 a 1 si nada llega; si no, el más oscuro), el ACENTO (CTA, botón o «highlight» antes que un
 * «acento» a secas; si no, el más saturado), la SUPERFICIE (las placas: un fondo de apoyo claro) y el APOYO (el color
 * de marca que queda). `claro` y `oscuro` son los extremos de luz. Lo que el kit no da queda en la paleta neutra. Pura.
 */
export function paletaDelKit(kitPaleta = []) {
  const colores = (Array.isArray(kitPaleta) ? kitPaleta : []).filter((c) => HEX.test(String(c?.hex ?? "")))
    .map((c) => ({ hex: c.hex.toUpperCase(), rol: String(c.rol ?? "").toLowerCase() }));
  if (!colores.length) return { ...PALETA_NEUTRA };
  const p = {};
  const usados = () => Object.values(p);
  const libres = () => colores.filter((c) => !usados().includes(c.hex));
  // El mejor por papel; a igualdad, el que mejor cumpla `desempate` (orden de la lista si no).
  const mejor = (token, lista, desempate = () => 0) => {
    const conNota = lista.map((c, i) => ({ c, n: puntaje(c.rol, token), d: desempate(c), i })).filter((x) => x.n > 0);
    conNota.sort((a, b) => b.n - a.n || b.d - a.d || a.i - b.i);
    return conNota[0]?.c;
  };
  const porLuz = [...colores].sort((a, b) => luminancia(b.hex) - luminancia(a.hex));

  p.fondo = (mejor("fondo", colores.filter((c) => puntaje(c.rol, "superficie") < 3)) ?? mejor("fondo", colores) ?? porLuz[0]).hex;
  const legibles = (min) => libres().filter((c) => razonDeContraste(c.hex, p.fondo) >= min);
  const texto = mejor("texto", legibles(4.5)) ?? mejor("texto", legibles(3))
    ?? [...legibles(3)].sort((a, b) => razonDeContraste(b.hex, p.fondo) - razonDeContraste(a.hex, p.fondo))[0];
  p.texto = texto?.hex ?? contraste(p.fondo, porLuz[0].hex, porLuz.at(-1).hex);
  const acento = mejor("acento", libres(), (c) => saturacion(c.hex))
    ?? [...libres()].sort((a, b) => saturacion(b.hex) - saturacion(a.hex))[0];
  if (acento) p.acento = acento.hex;
  const claroDeApoyo = libres().filter((c) => luminancia(c.hex) > 0.6);
  const superficie = mejor("superficie", claroDeApoyo) ?? mejor("fondo", claroDeApoyo) ?? claroDeApoyo[0];
  p.superficie = superficie?.hex ?? (luminancia(p.fondo) > 0.5 ? "#FFFFFF" : porLuz[0].hex);
  const apoyo = mejor("apoyo", libres(), (c) => saturacion(c.hex)) ?? libres()[0];
  if (apoyo) p.apoyo = apoyo.hex;
  p.claro = porLuz[0].hex;
  p.oscuro = porLuz.at(-1).hex;
  return { ...PALETA_NEUTRA, ...p };
}

/** La paleta con la que se dibuja: la del kit y, encima, la que fija el guion. Pura. */
export const paletaDelGuion = (guion, kitPaleta = []) => ({ ...paletaDelKit(kitPaleta), ...(guion?.estilo?.paleta ?? {}) });

/**
 * El color de un texto sobre `fondo`: el que pide el guion si se lee (3 a 1 o más, lo mínimo para texto grande) y, si
 * no, el claro u oscuro de la paleta que más contraste. Un texto que no se lee no es una decisión de estilo. Pura.
 */
export function colorLegible(pedido, fondo, paleta) {
  const t = colorDe(pedido, paleta); const f = colorDe(fondo, paleta);
  return razonDeContraste(t, f) >= 3 ? t : contraste(f, colorDe("claro", paleta), colorDe("oscuro", paleta));
}

/** Un token o un #RRGGBB a su color. Pura. */
export const colorDe = (c, paleta) => (HEX.test(String(c ?? "")) ? c : paleta?.[c] ?? PALETA_NEUTRA[c] ?? PALETA_NEUTRA.texto);

// ------------------------------------------------------------
// Dónde va cada cosa
// ------------------------------------------------------------

/**
 * Lo que NO se toca en cada formato, en fracciones del lienzo. En 9:16 arriba va la barra de Instagram y TikTok y
 * abajo el texto del post y los botones: ahí no va ni texto ni botón. En 1:1 (feed) y 16:9 (YouTube, el feed a lo
 * ancho) no hay botones encima del video, pero sí el recorte de la vista previa y los controles del reproductor: el
 * margen es menor y cumple lo mismo.
 */
export const ZONA_SEGURA = Object.freeze({
  "9:16": Object.freeze({ arriba: 0.12, abajo: 0.2, lados: 0.09 }),
  "1:1": Object.freeze({ arriba: 0.07, abajo: 0.1, lados: 0.07 }),
  "16:9": Object.freeze({ arriba: 0.08, abajo: 0.12, lados: 0.06 }),
});

/** El rectángulo donde se puede poner algo, en píxeles. Pura. */
export function areaSegura(formato, ancho, alto) {
  const z = ZONA_SEGURA[formato] ?? ZONA_SEGURA["9:16"];
  const x = ancho * z.lados; const y = alto * z.arriba;
  return { x, y, w: ancho - x * 2, h: alto * (1 - z.arriba - z.abajo) };
}

/** Lo alto de la franja de los subtítulos, en fracción del lado corto (dos líneas de su tarjeta y su aire). */
export const ALTO_SUBTITULOS = 0.15;

/**
 * La franja de los subtítulos, DENTRO del área segura: abajo (lo normal) o arriba; con «centro» van encima del
 * contenido y no apartan nada (`aparta: false`). Pura.
 */
export function bandaDeSubtitulos(formato, ancho, alto, pos = "abajo") {
  const a = areaSegura(formato, ancho, alto);
  const h = Math.min(ancho, alto) * ALTO_SUBTITULOS;
  if (pos === "centro") return { y: a.y + (a.h - h) / 2, h, aparta: false };
  return { y: pos === "arriba" ? a.y : a.y + a.h - h, h, aparta: true };
}

/** El centro de una capa con `{ x, y }` (entre 0 y 1) en píxeles del lienzo: la única que el motor no reparte. Pura. */
export function centroDe(pos, ancho, alto) {
  return pos && typeof pos === "object" ? { x: pos.x * ancho, y: pos.y * alto } : { x: ancho / 2, y: alto / 2 };
}

const ORDEN_ZONA = Object.freeze({ arriba: 0, centro: 1, abajo: 2 });
/** Lo que se ve grande y manda en la escena: en 16:9 va en su columna. */
const VISUALES = new Set(["imagen", "video", "personaje", "telefono", "antes_despues"]);
const zonaDe = (pos) => { const v = String(pos ?? "centro").split("-")[0]; return v in ORDEN_ZONA ? v : "centro"; };
const ladoDe = (pos) => { const p = String(pos ?? "").split("-"); const h = p[1] ?? p[0]; return h === "izq" || h === "der" ? h : null; };
const seCruzan = (a, b) => a.desde < b.hasta && b.desde < a.hasta;

/** Aire entre dos cosas del mismo bloque (un titular y su apoyo) y el mínimo entre dos bloques, en fracción del lado. */
export const AIRE = Object.freeze({ junto: 0.022, minimo: 0.035 });
/**
 * Lo que mide como mínimo el logo del CIERRE repartido por zonas (fracción del lado corto): es la firma del video, no un
 * sello. Con una posición `{ x, y }` en el guion no vale: ahí el tamaño también lo decide el guion (un sello pequeño).
 */
export const MIN_LOGO_CIERRE = 0.5;

/**
 * Lo ancho que va el texto como mínimo, en fracción de su columna. El `tam` de una capa de texto lo escribe una IA y
 * casi siempre es corto (0,6): los titulares salían en una columna estrecha, pequeños, con media pantalla vacía. Un
 * texto usa todo el ancho que le toca; el `tam` sólo manda si pide más. La etiqueta, el sello y el llamado, menos.
 */
export const ANCHO_TEXTO = Object.freeze({ texto: 0.94, cifra: 0.94, llamado: 0.82, sello: 0.6 });

/**
 * El ancho que pide una capa: su `tam` por el lado corto; el logo del cierre, al menos `MIN_LOGO_CIERRE` (salvo con
 * posición fija: `fija`); el texto, al menos lo que le toca de su columna (`ANCHO_TEXTO`, si se sabe `anchoMax`).
 */
function anchoPedido(capa, c, anchoMax = 0, { fija = false } = {}) {
  const tam = capa.tipo === "logo" && c.tipoEscena === "cierre" && !fija ? Math.max(capa.tam, MIN_LOGO_CIERRE) : capa.tam;
  const minimo = capa.tipo === "texto" && capa.rol === "etiqueta" ? 0 : (ANCHO_TEXTO[capa.tipo] ?? 0) * anchoMax;
  return Math.max(tam * c.lado, minimo);
}

/**
 * Cuánto de su columna llena una escena, como poco: si lo que hay ocupa menos, CRECE (hasta `CRECER_MAX` y sin pasar
 * del ancho), en vez de quedarse pequeño en medio de un cuadro vacío.
 */
export const LLENADO = 0.68;
export const CRECER_MAX = 1.35;
/**
 * Lo que puede crecer cada formato. En 1:1 y 16:9 el lado corto es el mismo (1080) pero hay más sitio alrededor: con
 * 1,35 el contenido se quedaba pequeño en medio del cuadro.
 */
export const CRECER_POR_FORMATO = Object.freeze({ "9:16": CRECER_MAX, "1:1": 1.55, "16:9": 1.8 });

/**
 * En 16:9, lo que va en la columna de la IZQUIERDA cuando hay también texto: lo visual y las piezas que se leen de un
 * vistazo (icono, anillo, dibujo, lista, reloj y el logo). Apilado todo en el centro, en un cuadro apaisado, salía
 * pequeño con los lados vacíos; el texto va a la derecha.
 */
const IZQUIERDA_APAISADO = new Set([...VISUALES, "icono", "anillo", "dibujo", "lista", "reloj", "logo"]);
/** En 16:9, una columna sola (sólo texto, o sólo piezas) no pasa de esta fracción del ancho: si no, una línea larguísima. */
export const ANCHO_COLUMNA_APAISADO = 0.68;

/** Hasta dónde se encoge lo visual antes de encoger todo (fracción de su tamaño). */
const MIN_VISUAL = 0.45;

/**
 * Un lienzo que sólo MIDE: deja pasar la fuente y `measureText` al de verdad y no dibuja nada. Así el tamaño de cada
 * capa sale del MISMO código que la dibuja y no puede discrepar.
 */
function medidorDe(ctx) {
  const nada = () => {};
  const propio = {
    measureText: (t) => ctx.measureText(t),
    createLinearGradient: () => ({ addColorStop: nada }),
    createPattern: () => null,
  };
  return new Proxy(propio, {
    get: (o, k) => (k in o ? o[k] : k === "font" ? ctx.font : nada),
    set: (o, k, v) => { if (k === "font") ctx.font = v; return true; },
  });
}

/** El ancho y el alto que ocupa una capa dibujada en `ancho` (sin animación). Pura (deja la fuente como estaba). */
export function medirCapa(ctx, capa, c, ancho) {
  const antes = ctx.font;
  const r = dibujarCapa(medidorDe(ctx), capa, { alfa: 1, dx: 0, dy: 0, escala: 1, giro: 0, revelado: 1 }, c, ancho);
  ctx.font = antes;
  return r;
}

/** Una columna repartida: cada fila en su sitio, con su escala, desde arriba de `caja`. */
function repartirColumna(ctx, items, caja, c, sitio) {
  if (!items.length) return;
  const lado = c.lado;
  // 1. Filas: dos capas de la misma zona marcadas izquierda y derecha van lado a lado; dos que no se ven a la vez
  //    (una sale antes de que entre la otra) comparten el sitio en vez de apilarse.
  const filas = [];
  for (const it of items) {
    const ult = filas.at(-1);
    const misma = ult && ult.zona === it.zona;
    if (misma && ult.par === null && it.lado && ult.items.length === 1 && ult.items[0].lado && ult.items[0].lado !== it.lado) {
      ult.par = true; ult.items.push(it); continue;
    }
    if (misma && !ult.par && ult.items.every((o) => !seCruzan(o.cuando, it.cuando))) { ult.turnos = true; ult.items.push(it); continue; }
    filas.push({ zona: it.zona, items: [it], par: it.lado ? null : false, turnos: false });
  }
  // 2. Medidas en el ancho de la columna (la mitad en una fila de dos).
  for (const f of filas) {
    const anchoMax = f.par ? (caja.w - lado * AIRE.minimo) / 2 : caja.w;
    for (const it of f.items) { it.ancho = Math.min(anchoPedido(it.capa, c, anchoMax), anchoMax); it.m = medirCapa(ctx, it.capa, c, it.ancho); }
    f.anchoMax = anchoMax;
    // Lo que se pasa de ancho (un sello girado, una placa con su aire) se encoge hasta caber.
    f.base = Math.min(1, ...f.items.map((it) => anchoMax / Math.max(1, it.m.w)));
    f.h = Math.max(...f.items.map((it) => it.m.h)) * f.base;
    f.visual = f.items.some((it) => VISUALES.has(it.capa.tipo));
  }
  // 3. El aire: entre dos textos seguidos de la misma zona, junto (son un bloque); entre lo demás, flexible.
  const juntas = filas.slice(1).map((f, i) => f.zona === filas[i].zona && f.items[0].capa.tipo === "texto" && filas[i].items[0].capa.tipo === "texto");
  const fijo = juntas.filter(Boolean).length * lado * AIRE.junto;
  const flexibles = juntas.filter((j) => !j).length;
  // 4. Si no cabe: primero se encoge lo visual (hasta MIN_VISUAL) y, si aún no, todo por igual.
  const alto = (fs) => fs.reduce((n, f) => n + f.h * f.escala, 0) + fijo + flexibles * lado * AIRE.minimo;
  filas.forEach((f) => { f.escala = 1; });
  if (alto(filas) > caja.h) {
    const altoVisual = filas.filter((f) => f.visual).reduce((n, f) => n + f.h, 0);
    if (altoVisual > 0) {
      const sobra = alto(filas) - caja.h;
      const ev = Math.max(MIN_VISUAL, 1 - sobra / altoVisual);
      filas.forEach((f) => { if (f.visual) f.escala = ev; });
    }
    const total = alto(filas);
    if (total > caja.h) { const e = caja.h / total; filas.forEach((f) => { f.escala *= e; }); }
  }
  // 4b. Si sobra mucho alto, todo crece por igual (cada fila, sin pasar de su ancho).
  const ocupadoAntes = alto(filas);
  if (ocupadoAntes > 0 && ocupadoAntes < caja.h * LLENADO) {
    const crecer = Math.min(CRECER_POR_FORMATO[c.formato] ?? CRECER_MAX, (caja.h * LLENADO) / ocupadoAntes);
    for (const f of filas) {
      const tope = Math.min(...f.items.map((it) => f.anchoMax / Math.max(1, it.m.w * f.base * f.escala)));
      f.escala *= Math.max(1, Math.min(crecer, tope));
    }
  }
  // 5. Lo que sobra se reparte por igual arriba, abajo y entre bloques: nada se queda amontonado arriba con el
  //    tercio de abajo vacío, y una escena de una sola cosa la deja en el centro.
  const ocupado = filas.reduce((n, f, i) => n + f.h * f.escala + (i > 0 && juntas[i - 1] ? lado * AIRE.junto * f.escala : 0), 0);
  const libre = Math.max(0, caja.h - ocupado);
  const hueco = libre / (flexibles + 2);
  let y = caja.y + hueco;
  filas.forEach((f, i) => {
    if (i > 0) y += juntas[i - 1] ? lado * AIRE.junto * f.escala : hueco;
    const h = f.h * f.escala;
    const cy = y + h / 2;
    f.items.forEach((it, j) => {
      let cx = caja.x + caja.w / 2;
      if (f.par) cx = caja.x + (j === 0 ? caja.w / 4 : (caja.w * 3) / 4);
      else if (it.lado && it.capa.tipo !== "texto") {
        const media = (it.m.w * f.escala * f.base) / 2;
        cx = it.lado === "izq" ? caja.x + media : caja.x + caja.w - media;
      }
      sitio.set(it.capa.id, { x: cx, y: cy, escala: f.escala * f.base, ancho: it.ancho, w: it.m.w, h: it.m.h });
    });
    y += h;
  });
}

/**
 * Dónde va cada capa de una escena: `Map(id → { x, y, escala, ancho })` en píxeles del lienzo. La ZONA de cada capa
 * («arriba», «centro», «abajo») dice el ORDEN de arriba abajo; el motor mide cada capa (con el mismo código que la
 * dibuja), reparte el alto del área segura entre todas y, si no caben, encoge primero lo visual. Nada se encima:
 * una placa de texto y una imagen tienen cada una su sitio. Lo demás:
 *   · `{ x, y }` en el guion — la capa va ahí y no cuenta en el reparto (la decisión es del guion, también el tamaño:
 *     el logo del cierre no se agranda a `MIN_LOGO_CIERRE`).
 *   · una FORMA — es un fondo: va detrás de la siguiente capa de su zona (o de la siguiente que haya), a su escala.
 *   · 16:9 con algo visual y algo más — dos columnas: lo visual a la izquierda, el resto a la derecha.
 *   · los subtítulos tienen su franja dentro del área segura (`bandaDeSubtitulos`), y nada entra en ella.
 * Pura y determinista: el mismo guion, formato y tiempos dan el mismo reparto.
 */
export function repartirEscena(ctx, capas, tiempos, c) {
  const sitio = new Map();
  const a = areaSegura(c.formato, c.ancho, c.alto);
  const sub = c.subtitulos?.activo ? bandaDeSubtitulos(c.formato, c.ancho, c.alto, c.subtitulos.pos) : null;
  const caja = { ...a };
  if (sub?.aparta) {
    if (c.subtitulos.pos === "arriba") { caja.y += sub.h; caja.h -= sub.h; } else caja.h -= sub.h;
  }
  const lista = capas.filter((capa) => !esCapaCompleta(capa))
    .map((capa, i) => ({ capa, i, zona: zonaDe(capa.pos), lado: ladoDe(capa.pos), cuando: tiempos.get(capa.id) }));
  for (const it of lista) if (it.capa.pos && typeof it.capa.pos === "object") sitio.set(it.capa.id, { ...centroDe(it.capa.pos, c.ancho, c.alto), escala: 1, ancho: anchoPedido(it.capa, c, caja.w, { fija: true }) });
  const repartidas = lista.filter((it) => !(it.capa.pos && typeof it.capa.pos === "object") && it.capa.tipo !== "forma")
    .sort((p, q) => ORDEN_ZONA[p.zona] - ORDEN_ZONA[q.zona] || p.i - q.i);
  const apaisado = c.ancho > c.alto * 1.2;
  const izquierda = apaisado ? repartidas.filter((it) => IZQUIERDA_APAISADO.has(it.capa.tipo)) : [];
  if (izquierda.length && izquierda.length < repartidas.length) {
    // Dos columnas: lo visual a la izquierda, el texto a la derecha (un poco más ancha: el texto necesita líneas).
    const aire = caja.w * 0.05;
    const wi = (caja.w - aire) * 0.46;
    const wd = caja.w - aire - wi;
    repartirColumna(ctx, izquierda, { x: caja.x, y: caja.y, w: wi, h: caja.h }, c, sitio);
    repartirColumna(ctx, repartidas.filter((it) => !IZQUIERDA_APAISADO.has(it.capa.tipo)), { x: caja.x + wi + aire, y: caja.y, w: wd, h: caja.h }, c, sitio);
  } else if (apaisado) {
    // Una columna sola, centrada y no tan ancha.
    const w = caja.w * ANCHO_COLUMNA_APAISADO;
    repartirColumna(ctx, repartidas, { ...caja, x: caja.x + (caja.w - w) / 2, w }, c, sitio);
  } else repartirColumna(ctx, repartidas, caja, c, sitio);
  // Las formas, detrás de lo que acompañan.
  for (const it of lista.filter((x) => x.capa.tipo === "forma" && !sitio.has(x.capa.id))) {
    const siguientes = lista.filter((o) => o.i > it.i && o.capa.tipo !== "forma" && sitio.has(o.capa.id));
    const junto = siguientes.find((o) => o.zona === it.zona) ?? siguientes[0] ?? lista.find((o) => o.capa.tipo !== "forma" && sitio.has(o.capa.id));
    const s = junto ? sitio.get(junto.capa.id) : null;
    const ancho = it.capa.tam * c.lado;
    // Un fondo, no un cartel: como mucho 1,3 veces lo que acompaña.
    const tope = s?.w ? (1.3 * Math.max(s.w, s.h) * s.escala) / ancho : 1;
    sitio.set(it.capa.id, {
      x: s?.x ?? caja.x + caja.w / 2, y: s?.y ?? caja.y + caja.h / 2, escala: Math.min(1, tope), ancho, detras: true,
    });
  }
  return sitio;
}

/** Cuánto puede tardar en aparecer algo en la primera escena: un video que empieza vacío pierde a quien lo ve. */
export const PRIMERO_ANTES_DE = 0.3;

/** Lo que entra detrás del texto principal del gancho, como mucho: lo bastante para que se lea primero. */
export const DESPUES_DEL_GANCHO = 0.3;

/**
 * El TEXTO PRINCIPAL de una escena: un titular, si no un sello, si no cualquier texto, si no el llamado. Null si la
 * escena no trae ninguno. Pura.
 */
export function textoPrincipal(capas) {
  return capas.find((c) => c.tipo === "texto" && (c.rol ?? "titular") === "titular")
    ?? capas.find((c) => c.tipo === "sello")
    ?? capas.find((c) => c.tipo === "texto")
    ?? capas.find((c) => c.tipo === "llamado")
    ?? null;
}

/**
 * Cuándo entra y sale cada capa de una escena (`Map(id → { desde, hasta })`). En la PRIMERA escena (el gancho) lo
 * primero que entra es su TEXTO PRINCIPAL, al empezar: lo demás (la imagen, el personaje, un marcador) entra
 * `DESPUES_DEL_GANCHO` segundos después si iba a entrar antes. Sin texto en la escena, la capa que antes entra se
 * adelanta al inicio si nada entraba en sus primeros `PRIMERO_ANTES_DE` segundos. Cuándo sale cada una no cambia. Pura.
 */
export function tiemposDeEscena(capas, momento, primera = false) {
  const t = new Map(capas.map((capa) => [capa.id, tiempoDeCapa(capa, momento)]));
  if (!primera || !capas.length) return t;
  const principal = textoPrincipal(capas);
  if (principal) {
    t.set(principal.id, { ...t.get(principal.id), desde: momento.desde });
    const luego = momento.desde + DESPUES_DEL_GANCHO;
    for (const capa of capas) {
      // Un video (o una imagen) a sangre es el FONDO del gancho: no se retrasa (si no, el primer cuadro saldría sin él).
      if (capa.id === principal.id || esCapaCompleta(capa)) continue;
      const v = t.get(capa.id);
      if (v.desde < luego) t.set(capa.id, { desde: luego, hasta: Math.max(v.hasta, luego) });
    }
    return t;
  }
  let id = null; let antes = Infinity;
  for (const capa of capas) { const d = t.get(capa.id).desde; if (d < antes) { antes = d; id = capa.id; } }
  if (antes > momento.desde + PRIMERO_ANTES_DE) t.set(id, { ...t.get(id), desde: momento.desde });
  return t;
}

// ------------------------------------------------------------
// Animación de una capa
// ------------------------------------------------------------

/**
 * Cómo está una capa en el instante `t`: si se ve, su opacidad, desplazamiento, escala, giro y cuánto se ha revelado
 * (0–1, para «escribe», «barrido» y «dibuja»). `null` si en ese instante no se dibuja. Pura.
 */
export function estadoDeCapa(capa, momento, t, { ritmo = "medio", lado = 1080 } = {}) {
  const { desde, hasta } = momento;
  const conSalida = capa.animacion?.salida && capa.animacion.salida !== "ninguna";
  if (t < desde || t > hasta + (conSalida ? 0 : 1e-6)) return null;
  const dEntra = DURACION_ENTRADA[ritmo] ?? DURACION_ENTRADA.medio;
  const pe = limitar((t - desde) / dEntra);
  // `vida`: los segundos desde que entró (la cifra cuenta y el dibujo saca sus formas con eso).
  const e = { alfa: 1, dx: 0, dy: 0, escala: 1, giro: 0, revelado: 1, vida: t - desde };
  const desp = lado * 0.08;
  // Un texto palabra por palabra no entra entero: cada palabra hace la entrada cuando se dice (ver `dibujarTextoRico`).
  switch (capa.porPalabra ? "ninguna" : capa.animacion?.entrada ?? "aparece") {
    case "aparece": e.alfa = limitar((t - desde) / 0.12); break;
    // Seca: entra entera y de 1,15 a 1 en `DURACION_GOLPE`, sin rebote (lo que entra cuando se canta).
    case "golpe": e.escala = 1 + 0.15 * (1 - suave.sale(limitar((t - desde) / DURACION_GOLPE))); break;
    case "fundido": e.alfa = suave.entraSale(pe); break;
    case "sube": e.alfa = suave.sale(pe); e.dy = desp * (1 - suave.sale(pe)); break;
    case "baja": e.alfa = suave.sale(pe); e.dy = -desp * (1 - suave.sale(pe)); break;
    case "escala": e.alfa = suave.sale(pe); e.escala = 0.6 + 0.4 * suave.sale(pe); break;
    case "rebote": e.alfa = limitar(pe * 3); e.escala = Math.max(0, suave.rebote(pe)); break;
    case "escribe": case "barrido": case "dibuja": e.revelado = suave.sale(pe); break;
    default: break;
  }
  if (conSalida) {
    const ps = limitar((t - (hasta - DURACION_SALIDA)) / DURACION_SALIDA);
    if (ps > 0) {
      if (capa.animacion.salida === "fundido") e.alfa *= 1 - ps;
      if (capa.animacion.salida === "baja") { e.alfa *= 1 - ps; e.dy += desp * suave.entraSale(ps); }
      if (capa.animacion.salida === "escala") { e.alfa *= 1 - ps; e.escala *= 1 - 0.4 * ps; }
    }
  }
  // El bucle cuenta desde que la capa entra: así dos capas que entran en momentos distintos no van al compás.
  const v = t - desde;
  switch (capa.animacion?.bucle ?? "ninguno") {
    case "flota": e.dy += Math.sin((v / 3) * Math.PI * 2) * lado * 0.012; break;
    case "pulso": e.escala *= 1 + Math.sin((v / 1.2) * Math.PI * 2) * 0.035; break;
    case "gira": e.giro += (v / 12) * Math.PI * 2; break;
    case "late": { const f = (v % 1.1) / 1.1; e.escala *= 1 + (f < 0.18 ? Math.sin((f / 0.18) * Math.PI) * 0.07 : 0); break; }
    default: break;
  }
  return e.alfa <= 0.001 || e.escala <= 0.001 ? null : e;
}

// ------------------------------------------------------------
// Texto: medir y partir en líneas
// ------------------------------------------------------------

/** El texto partido en líneas que caben en `ancho` con la fuente que ya tiene `ctx`. */
export function partirEnLineas(ctx, texto, ancho) {
  const lineas = [];
  let actual = "";
  for (const palabra of String(texto ?? "").split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && ctx.measureText(prueba).width > ancho) { lineas.push(actual); actual = palabra; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Un separador suelto («·», «|», «—», «/»): buen sitio para cortar, y se quita del borde de la línea. */
const SEPARADOR_SUELTO = /^[·•|—–/]$/;
/** Un signo de una cuenta («+», «=», «×», «→»): se corta ANTES y empieza la línea siguiente («= irritación»). */
const OPERADOR = /^[+=×÷→]$/;
const CIERRA_FRASE = /[,.;:!?…]$/;
/** Lo que sobra en un borde de línea al cortar en un separador suelto (el «·» no empieza ni acaba una línea). */
const sinSeparadorEnBorde = (linea) => linea.replace(/^\s*[·•|—–/]\s+/, "").replace(/\s+[·•|—–/]\s*$/, "").trim();

/**
 * El texto en `n` líneas que caben en `ancho`, EQUILIBRADAS: se escogen los cortes que dejan las líneas más
 * parecidas entre sí y, a igualdad, los que caen en un separador («·», coma, punto…). «Sin alcohol · sin perfume»
 * en dos líneas da «Sin alcohol» / «sin perfume», no «Sin alcohol · sin» / «perfume». Un separador suelto no empieza
 * ni acaba una línea. Null si en `n` líneas no cabe. Pura (sólo mide con la fuente que ya tiene `ctx`).
 */
export function partirEquilibrado(ctx, texto, ancho, n) {
  const palabras = String(texto ?? "").split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  if (n <= 1 || palabras.length === 1) {
    const l = palabras.join(" ");
    return ctx.measureText(l).width <= ancho || palabras.length === 1 ? [l] : null;
  }
  const medida = new Map();
  const linea = (i, j) => sinSeparadorEnBorde(palabras.slice(i, j).join(" "));
  const mide = (i, j) => {
    const k = `${i}:${j}`;
    if (!medida.has(k)) medida.set(k, ctx.measureText(linea(i, j)).width);
    return medida.get(k);
  };
  // Cortar DESPUÉS de la palabra j-1: bueno si ella cierra frase o es un separador suelto, o si la siguiente es un
  // separador o un signo de cuenta (que así empieza la línea). Después de un signo de cuenta no se corta.
  const buenCorte = (j) => CIERRA_FRASE.test(palabras[j - 1]) || SEPARADOR_SUELTO.test(palabras[j - 1])
    || SEPARADOR_SUELTO.test(palabras[j] ?? "") || OPERADOR.test(palabras[j] ?? "");
  const prohibido = (j) => OPERADOR.test(palabras[j - 1]);
  const N = palabras.length;
  // costo[k][j]: lo mejor para las primeras j palabras en k líneas. Cada línea paga lo que le falta para llenar el
  // ancho (al cuadrado: castiga una línea muy corta) y un corte fuera de un separador paga un recargo.
  const RECARGO = (ancho * 0.3) ** 2;
  const costo = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(Infinity));
  const desde = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(-1));
  costo[0][0] = 0;
  for (let k = 1; k <= n; k++) {
    for (let j = k; j <= N; j++) {
      for (let i = k - 1; i < j; i++) {
        if (costo[k - 1][i] === Infinity) continue;
        const w = mide(i, j);
        if (w > ancho && j - i > 1) continue;
        if (j < N && prohibido(j)) continue;
        const c = costo[k - 1][i] + (ancho - Math.min(w, ancho)) ** 2 + (j < N && !buenCorte(j) ? RECARGO : 0);
        if (c < costo[k][j]) { costo[k][j] = c; desde[k][j] = i; }
      }
    }
  }
  if (costo[n][N] === Infinity) return null;
  const lineas = [];
  for (let k = n, j = N; k > 0; k--) { const i = desde[k][j]; lineas.unshift(linea(i, j)); j = i; }
  return lineas.filter(Boolean);
}

export const TIPO_POR_ROL = Object.freeze({
  titular: { tam: 0.105, peso: 800, lineas: 3, fuente: "titular", alto: 1.08 },
  // El cartel tipográfico (motorTexto.js): cada línea a todo el ancho; `tam` es lo más grande de una línea.
  gigante: { tam: 0.36, peso: 900, lineas: 8, fuente: "impacto", alto: 1.04, mayusculas: true },
  apoyo: { tam: 0.06, peso: 500, lineas: 4, fuente: "cuerpo", alto: 1.25 },
  dato: { tam: 0.16, peso: 900, lineas: 2, fuente: "titular", alto: 1.0 },
  etiqueta: { tam: 0.042, peso: 700, lineas: 2, fuente: "cuerpo", alto: 1.2, mayusculas: true },
});

/**
 * La fuente y las líneas de un texto que tiene que caber en `ancho`: se empieza en el tamaño del rol y se baja de 6 en
 * 6 % hasta que entra en sus líneas (o hasta la mitad: si así no cabe, el guion pide demasiado texto).
 */
export function encajarTexto(ctx, texto, { ancho, lado, rol = "titular", familia = FUENTE_RESPALDO }) {
  const r = TIPO_POR_ROL[rol] ?? TIPO_POR_ROL.titular;
  const cuerpo = r.mayusculas ? String(texto).toUpperCase() : String(texto);
  let tam = lado * r.tam;
  let lineas = [];
  for (let i = 0; i < 12; i++) {
    ctx.font = `${r.peso} ${Math.round(tam)}px ${familia}`;
    lineas = partirEnLineas(ctx, cuerpo, ancho);
    const anchoMax = Math.max(0, ...lineas.map((l) => ctx.measureText(l).width));
    if (lineas.length <= r.lineas && anchoMax <= ancho) break;
    tam *= 0.94;
  }
  // Con las mismas líneas que pide el corte simple, repartidas parejas y cortando en los separadores.
  if (lineas.length > 1) lineas = partirEquilibrado(ctx, cuerpo, ancho, lineas.length) ?? lineas;
  return { fuente: `${r.peso} ${Math.round(tam)}px ${familia}`, tam, lineas, altoLinea: tam * r.alto };
}

// ------------------------------------------------------------
// Formas básicas
// ------------------------------------------------------------

export function rectRedondo(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function trazarFigura(ctx, figura, w, h, id) {
  ctx.beginPath();
  switch (figura) {
    case "rect": rectRedondo(ctx, -w / 2, -h / 2, w, h, w * 0.08); return;
    case "estrella":
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = (i % 2 ? 0.42 : 1) * (w / 2);
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); return;
    case "flecha":
      ctx.moveTo(-w / 2, -h * 0.14); ctx.lineTo(w * 0.12, -h * 0.14); ctx.lineTo(w * 0.12, -h * 0.34);
      ctx.lineTo(w / 2, 0); ctx.lineTo(w * 0.12, h * 0.34); ctx.lineTo(w * 0.12, h * 0.14); ctx.lineTo(-w / 2, h * 0.14);
      ctx.closePath(); return;
    case "linea": ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); return;
    case "ola": {
      const pasos = 48;
      for (let i = 0; i <= pasos; i++) {
        const x = -w / 2 + (w * i) / pasos;
        const y = Math.sin((i / pasos) * Math.PI * 4) * h * 0.18 - h * 0.1;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); return;
    }
    case "mancha": {
      // Una forma orgánica: ocho radios de la semilla de la capa, unidos con curvas suaves.
      const al = aleatorio(semilla(id));
      const radios = Array.from({ length: 8 }, () => (0.78 + al() * 0.22) * (w / 2));
      const punto = (i) => { const a = (i / 8) * Math.PI * 2; return [Math.cos(a) * radios[i % 8], Math.sin(a) * radios[i % 8]]; };
      const [x0, y0] = punto(0); const [x1, y1] = punto(1);
      ctx.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
      for (let i = 1; i <= 8; i++) {
        const [cx, cy] = punto(i); const [nx, ny] = punto(i + 1);
        ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
      }
      ctx.closePath(); return;
    }
    default: ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.closePath();
  }
}

// ------------------------------------------------------------
// El borde transparente de una imagen
// ------------------------------------------------------------

/**
 * La caja de lo que SE VE de una imagen RGBA (`datos` de `getImageData`, `ancho` × `alto`): los píxeles con alfa por
 * encima de `umbral`. Un logo exportado con mucho aire transparente se dibujaría diminuto dentro de su caja; con esto
 * quien carga la imagen la recorta (en el navegador, `motorVideoNavegador.js`; en el Container, su gemelo) y el motor
 * mide lo que se ve. `null` si es toda transparente; la imagen entera si no hay nada que recortar. Pura.
 */
export function cajaOpaca(datos, ancho, alto, umbral = 8) {
  let x0 = ancho; let y0 = alto; let x1 = -1; let y1 = -1;
  for (let y = 0; y < alto; y++) {
    const fila = y * ancho * 4;
    for (let x = 0; x < ancho; x++) {
      if (datos[fila + x * 4 + 3] > umbral) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ------------------------------------------------------------
// Los componentes
// ------------------------------------------------------------

/** El recuadro (alrededor del origen) que ocupa una imagen dentro de `ancho`, sin pasar de `maxAlto`. */
function cajaDeImagen(img, ancho, maxAlto, recorte) {
  const ia = img?.width && img?.height ? img.width / img.height : 1;
  if (recorte === "cubrir") { const h = Math.min(ancho * 1.25, maxAlto); return { w: ancho, h }; }
  let w = ancho; let h = ancho / ia;
  if (h > maxAlto) { h = maxAlto; w = h * ia; }
  return { w, h };
}

/** El filtro del lienzo para el tratamiento «byn» de una imagen (blanco y negro con más contraste). */
export const FILTRO_BYN = "grayscale(1) contrast(1.25)";

function dibujarImagenEn(ctx, img, w, h, recorte, tratamiento = "color") {
  // Blanco y negro: donde el lienzo no sabe de filtros (Safari), sale en color; nada se rompe.
  if (tratamiento === "byn") ctx.filter = FILTRO_BYN;
  if (recorte === "cubrir" && img?.width && img?.height) {
    const escala = Math.max(w / img.width, h / img.height);
    const sw = w / escala; const sh = h / escala;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
  } else ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (tratamiento === "byn") ctx.filter = "none";
}

function marcador(ctx, nombre, w, h, paleta, familia) {
  ctx.save();
  ctx.setLineDash([w * 0.03, w * 0.02]);
  ctx.lineWidth = Math.max(2, w * 0.008);
  ctx.strokeStyle = colorDe("texto", paleta);
  ctx.globalAlpha *= 0.55;
  rectRedondo(ctx, -w / 2, -h / 2, w, h, w * 0.05);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = colorDe("texto", paleta);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // Nunca menos de 28 px de salida: el marcador de un icono pequeño tiene que leerse en la vista previa.
  ctx.font = `600 ${Math.round(Math.max(28, Math.min(w, h) * 0.12))}px ${familia}`;
  ctx.fillText(nombre, 0, 0, w * 0.9);
  ctx.restore();
}

/** El id de un USO de video (una capa en su escena): el Container lleva un decodificador por uso. */
const usoDeVideo = (c, capa) => `${c.escenaId ?? ""}/${capa.id}`;

/** Lo que se ve de un video cuyo cuadro aún no llegó (o no se pudo leer): oscuro, con el triángulo de reproducir. */
function sinCuadro(ctx, w, h, familia) {
  ctx.save();
  ctx.fillStyle = "#1F1F1F";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  const r = Math.min(w, h) * 0.09;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath(); ctx.moveTo(-r * 0.6, -r); ctx.lineTo(r, 0); ctx.lineTo(-r * 0.6, r); ctx.closePath(); ctx.fill();
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.font = `600 ${Math.round(Math.max(26, Math.min(w, h) * 0.05))}px ${familia}`;
  ctx.fillText("Video", 0, r * 1.6, w * 0.9);
  ctx.restore();
}

/**
 * Un video A SANGRE: el cuadro del clip a todo el lienzo (cubrir o contener; lo que no cubre deja ver el fondo de la
 * escena), con su entrada (alfa, escala, desplazamiento) y el velo `oscurecer` encima para que se lea el texto.
 */
function dibujarVideoCompleto(ctx, capa, estado, c) {
  const { ancho: W, alto: H, recursos } = c;
  const cuadro = recursos?.video?.({ id: usoDeVideo(c, capa), archivo: capa.archivo }, segundoDelClip(capa, 0, estado.vida)) ?? null;
  ctx.save();
  ctx.globalAlpha *= estado.alfa;
  ctx.translate(W / 2 + estado.dx, H / 2 + estado.dy);
  if (estado.escala !== 1) ctx.scale(estado.escala, estado.escala);
  if (!cuadro) sinCuadro(ctx, W, H, c.fuentes?.cuerpo || FUENTE_RESPALDO);
  else if (capa.recorte === "contener" && cuadro.width && cuadro.height) {
    const k = Math.min(W / cuadro.width, H / cuadro.height);
    ctx.drawImage(cuadro, (-cuadro.width * k) / 2, (-cuadro.height * k) / 2, cuadro.width * k, cuadro.height * k);
  } else dibujarImagenEn(ctx, cuadro, W, H, "cubrir");
  if (capa.oscurecer > 0) {
    ctx.fillStyle = "#000000";
    ctx.globalAlpha *= capa.oscurecer;
    ctx.fillRect(-W / 2, -H / 2, W, H);
  }
  ctx.restore();
}

/**
 * Una IMAGEN A SANGRE (una foto con música): a todo el lienzo con su `movimiento` repartido en lo que se ve (`cuando`).
 * Con `recorte` «cubrir» llena el cuadro (lo que sobra se corta); con «contener» se ve ENTERA —un post 4:5 no pierde su
 * texto en 9:16— sobre ella misma ampliada, difuminada y oscurecida, que llena los huecos. El difuminado es el `filter`
 * del lienzo: donde no lo hay (Safari), el fondo sale nítido y oscurecido, que también sirve. `oscurecer`: el velo.
 */
function dibujarImagenCompleta(ctx, capa, estado, c, cuando) {
  const { ancho: W, alto: H, recursos, paleta } = c;
  const img = recursos?.imagen?.(capa.archivo) ?? null;
  const dura = Math.max(1e-3, (cuando?.hasta ?? 0) - (cuando?.desde ?? 0));
  const mov = movimientoDeImagen(capa.movimiento, (Number(estado.vida) || 0) / dura);
  ctx.save();
  ctx.globalAlpha *= estado.alfa;
  ctx.translate(W / 2 + estado.dx, H / 2 + estado.dy);
  if (estado.escala !== 1) ctx.scale(estado.escala, estado.escala);
  if (!img?.width || !img?.height) marcador(ctx, "Imagen", W * 0.8, H * 0.5, paleta, c.fuentes?.cuerpo || FUENTE_RESPALDO);
  else {
    const cubre = Math.max(W / img.width, H / img.height);
    let k = cubre * mov.escala;
    const byn = capa.tratamiento === "byn" ? ` ${FILTRO_BYN}` : "";
    if (capa.recorte === "contener") {
      // El fondo: la misma imagen, más grande, difuminada y oscurecida (se mueve con ella).
      ctx.save();
      ctx.filter = `blur(${Math.round(Math.min(W, H) * 0.04)}px)${byn}`;
      const kf = cubre * 1.1 * mov.escala;
      ctx.drawImage(img, (-img.width * kf) / 2, (-img.height * kf) / 2, img.width * kf, img.height * kf);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.globalAlpha *= 0.35;
      ctx.fillRect(-W / 2, -H / 2, W, H);
      ctx.restore();
      k = Math.min(W / img.width, H / img.height) * mov.escala;
    }
    const w = img.width * k; const h = img.height * k;
    // El paneo corre la imagen por lo que sobra a los lados (nunca deja ver el borde).
    const holgura = Math.max(0, (w - W) / 2);
    if (byn) ctx.filter = FILTRO_BYN;
    ctx.drawImage(img, -w / 2 + mov.desplaza * holgura, -h / 2, w, h);
    if (byn) ctx.filter = "none";
  }
  if (capa.oscurecer > 0) {
    ctx.fillStyle = "#000000";
    ctx.globalAlpha *= capa.oscurecer;
    ctx.fillRect(-W / 2, -H / 2, W, H);
  }
  ctx.restore();
}

// ------------------------------------------------------------
// El texto con carácter: énfasis, gigante y palabra por palabra (lo que mide, en motorTexto.js)
// ------------------------------------------------------------

/** ¿Va por el camino del texto con carácter? (rol gigante, *énfasis* o palabra por palabra). Pura. */
export const esTextoRico = (capa) => capa?.tipo === "texto" && (capa.rol === "gigante" || capa.porPalabra === true || tieneEnfasis(capa.texto));

/**
 * Cómo queda un texto en `ancho` (las líneas, sus palabras y su tamaño), con la letra de cada rol y la de impacto (la
 * del kit, o la de la casa). La usan el dibujo y la revisión. → { tam, lineas: [{ palabras, ancho, alto, tam }], alto,
 * anchoMax, espacio, gigante }. Pura salvo medir.
 */
export function encajarCapaTexto(ctx, capa, { ancho, lado, fuentes = {}, maxAlto = Infinity }) {
  const r = TIPO_POR_ROL[capa.rol] ?? TIPO_POR_ROL.titular;
  const titular = fuentes?.titular || FUENTE_RESPALDO;
  const familia = r.fuente === "cuerpo" ? fuentes?.cuerpo || titular : titular;
  const impacto = impactoDe(fuentes?.titular);
  const palabras = partirEnfasis(capa.texto, { mayusculas: capa.mayusculas === true || Boolean(r.mayusculas) });
  if (capa.rol === "gigante") return { ...encajarGigante(ctx, palabras, { ancho, lado, maxAlto, impacto }), gigante: true };
  return { ...encajarRico(ctx, palabras, { ancho, lado, rol: r, familia, impacto }), gigante: false };
}

/**
 * Cuándo se dice cada palabra de un texto palabra por palabra, en segundos desde que entró la capa (null: con la capa).
 * Se casan con el habla de SU escena (`momento.palabras`, de la línea de tiempo). Pura.
 */
export function tiemposRelativos(capa, momento, cuando) {
  const absolutos = tiemposDePalabras(partirEnfasis(capa.texto).map((p) => p.texto), momento?.palabras ?? []);
  const desde = cuando?.desde ?? momento?.desde ?? 0;
  return absolutos.map((x) => (x == null ? null : Math.max(0, x - desde)));
}

/**
 * Dibuja un texto con carácter: cada palabra con su fuente; las de énfasis en el color de acento (o en el del texto si
 * el texto ya va en acento); con `porPalabra`, cada una aparece (con la entrada de la capa) cuando se dice. Devuelve lo
 * que ocupa, como los demás componentes.
 */
function dibujarTextoRico(ctx, capa, estado, c, w) {
  const { paleta, lado } = c;
  const lay = encajarCapaTexto(ctx, capa, { ancho: w, lado, fuentes: c.fuentes, maxAlto: c.altoUtil ?? c.alto * 0.55 });
  const pad = lado * 0.035;
  const pw = lay.anchoMax + pad * 2;
  const alto = lay.alto;
  if (capa.placa) {
    ctx.fillStyle = colorDe(capa.placa, paleta);
    const x0 = capa.alinear === "izq" ? -w / 2 - pad : capa.alinear === "der" ? w / 2 - pw + pad : -pw / 2;
    rectRedondo(ctx, x0, -alto / 2 - pad * 0.7, pw, alto + pad * 1.4, lado * 0.025);
    ctx.fill();
  }
  const conPlaca = (tok) => (capa.placa ? colorLegible(tok, capa.placa, paleta) : colorDe(tok, paleta));
  const normal = conPlaca(capa.color);
  const resaltado = conPlaca(capa.color === "acento" ? "texto" : "acento");
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const total = lay.lineas.reduce((n, l) => n + l.palabras.length, 0);
  const visibles = capa.animacion?.entrada === "escribe" && !capa.porPalabra ? Math.round(total * (estado.revelado ?? 1)) : total;
  const tiempos = Array.isArray(estado.palabras) && Number.isFinite(estado.vida) ? estado.palabras : null;
  let k = 0;
  let y = -alto / 2;
  for (const linea of lay.lineas) {
    let x = capa.alinear === "izq" ? -w / 2 : capa.alinear === "der" ? w / 2 - linea.ancho : -linea.ancho / 2;
    const espacio = linea.espacio ?? lay.espacio;
    const cy = y + linea.alto / 2;
    for (const p of linea.palabras) {
      const cx = x + p.ancho / 2;
      x += p.ancho + espacio;
      const i = k++;
      if (i >= visibles) continue;
      let e = null;
      if (tiempos && tiempos[i] != null) {
        if (estado.vida < tiempos[i]) continue;
        e = estadoDeCapa({ animacion: { entrada: capa.animacion?.entrada ?? "aparece" } }, { desde: tiempos[i], hasta: Infinity }, estado.vida, { ritmo: c.ritmo, lado });
        if (!e) continue;
      }
      ctx.save();
      if (e) {
        ctx.globalAlpha *= e.alfa;
        ctx.translate(cx + e.dx, cy + e.dy);
        if (e.escala !== 1) ctx.scale(e.escala, e.escala);
      } else ctx.translate(cx, cy);
      ctx.font = p.fuente;
      ctx.fillStyle = p.enfasis ? resaltado : normal;
      ctx.fillText(p.texto, 0, 0);
      ctx.restore();
    }
    y += linea.alto;
  }
  return capa.placa ? { w: Math.max(w, pw), h: alto + pad * 1.4 } : { w, h: alto };
}

const NOMBRES_MARCADOR = Object.freeze({
  telefono: "Teléfono", burbuja: "Burbuja", personaje: "Personaje", icono: "Icono", cifra: "Cifra", lista: "Lista",
  reloj: "Reloj", antes_despues: "Antes / después",
});

/**
 * Dibuja una capa ya colocada: el origen está en su centro, con el estado de su animación aplicado, en `ancho` (lo
 * que le dio el reparto; su `tam` si no). Devuelve `{ w, h }`, lo que ocupa con su placa o su marco: el reparto lo
 * mide con este mismo código (`medirCapa`).
 */
function dibujarCapa(ctx, capa, estado, c, ancho = capa.tam * c.lado) {
  const { paleta, lado, fuentes, recursos } = c;
  const w = ancho;
  const maxAlto = c.altoUtil ?? c.alto * 0.55;
  const titular = fuentes?.titular || FUENTE_RESPALDO;
  const cuerpo = fuentes?.cuerpo || titular;
  switch (capa.tipo) {
    case "texto": {
      // Con carácter (énfasis, gigante o palabra por palabra), por su camino; si no, el de siempre, tal cual.
      if (esTextoRico(capa)) return dibujarTextoRico(ctx, capa, estado, c, w);
      const familia = (TIPO_POR_ROL[capa.rol] ?? TIPO_POR_ROL.titular).fuente === "titular" ? titular : cuerpo;
      const { fuente, lineas, altoLinea } = encajarTexto(ctx, capa.mayusculas ? String(capa.texto).toUpperCase() : capa.texto, { ancho: w, lado, rol: capa.rol, familia });
      ctx.font = fuente;
      const alto = lineas.length * altoLinea;
      const anchos = lineas.map((l) => ctx.measureText(l).width);
      const pad = lado * 0.035;
      const pw = Math.max(0, ...anchos) + pad * 2;
      if (capa.placa) {
        ctx.fillStyle = colorDe(capa.placa, paleta);
        const x0 = capa.alinear === "izq" ? -w / 2 - pad : capa.alinear === "der" ? w / 2 - pw + pad : -pw / 2;
        rectRedondo(ctx, x0, -alto / 2 - pad * 0.7, pw, alto + pad * 1.4, lado * 0.025);
        ctx.fill();
      }
      ctx.fillStyle = capa.placa ? colorLegible(capa.color, capa.placa, paleta) : colorDe(capa.color, paleta);
      ctx.textBaseline = "middle";
      ctx.textAlign = capa.alinear === "izq" ? "left" : capa.alinear === "der" ? "right" : "center";
      const x = capa.alinear === "izq" ? -w / 2 : capa.alinear === "der" ? w / 2 : 0;
      // «Escribe» revela las letras en orden; las demás entradas enseñan el texto entero.
      const total = lineas.reduce((n, l) => n + l.length, 0);
      let quedan = capa.animacion?.entrada === "escribe" ? Math.round(total * estado.revelado) : total;
      lineas.forEach((l, i) => {
        const trozo = l.slice(0, Math.max(0, quedan));
        quedan -= l.length;
        if (trozo) ctx.fillText(trozo, x, -alto / 2 + altoLinea * (i + 0.5));
      });
      return capa.placa ? { w: Math.max(w, pw), h: alto + pad * 1.4 } : { w, h: alto };
    }
    case "sello": {
      const { fuente, lineas, altoLinea } = encajarTexto(ctx, capa.texto, { ancho: w * 0.84, lado, rol: "titular", familia: titular });
      ctx.font = fuente;
      const h = lineas.length * altoLinea + lado * 0.06;
      ctx.rotate((capa.rotacion * Math.PI) / 180);
      ctx.fillStyle = colorDe(capa.color, paleta);
      rectRedondo(ctx, -w / 2, -h / 2, w, h, lado * 0.02);
      ctx.fill();
      ctx.strokeStyle = contraste(colorDe(capa.color, paleta), colorDe("claro", paleta), colorDe("oscuro", paleta));
      ctx.lineWidth = lado * 0.006;
      rectRedondo(ctx, -w / 2 + lado * 0.014, -h / 2 + lado * 0.014, w - lado * 0.028, h - lado * 0.028, lado * 0.012);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      lineas.forEach((l, i) => ctx.fillText(l.toUpperCase(), 0, -((lineas.length - 1) * altoLinea) / 2 + i * altoLinea));
      // Girado ocupa más: la caja que lo contiene.
      const g = Math.abs((capa.rotacion * Math.PI) / 180);
      return { w: w * Math.cos(g) + h * Math.sin(g), h: w * Math.sin(g) + h * Math.cos(g) };
    }
    case "imagen": {
      const img = recursos?.imagen?.(capa.archivo) ?? null;
      const { w: iw, h: ih } = cajaDeImagen(img, w, maxAlto, capa.recorte);
      if (!img) { marcador(ctx, "Imagen", iw, ih, paleta, cuerpo); return { w: iw, h: ih }; }
      const m = capa.marco ? lado * 0.02 : 0;
      if (capa.marco) {
        ctx.save();
        ctx.fillStyle = colorDe("superficie", paleta);
        ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = lado * 0.03; ctx.shadowOffsetY = lado * 0.01;
        rectRedondo(ctx, -iw / 2 - m, -ih / 2 - m, iw + m * 2, ih + m * 2, lado * 0.02);
        ctx.fill();
        ctx.restore();
      }
      dibujarImagenEn(ctx, img, iw, ih, capa.recorte, capa.tratamiento);
      return { w: iw + m * 2, h: ih + m * 2 };
    }
    case "video": {
      // En su caja, como una imagen. La forma sale de lo que mide el clip (no del cuadro, que al medir no se pide).
      const info = recursos?.videoInfo?.(capa.archivo) ?? null;
      const forma = info?.ancho && info?.alto ? { width: info.ancho, height: info.alto } : { width: 9, height: 16 };
      const { w: iw, h: ih } = cajaDeImagen(forma, w, maxAlto, capa.recorte);
      const cuadro = Number.isFinite(estado.vida) ? recursos?.video?.({ id: usoDeVideo(c, capa), archivo: capa.archivo }, segundoDelClip(capa, 0, estado.vida)) ?? null : null;
      const m = capa.marco ? lado * 0.02 : 0;
      if (capa.marco) {
        ctx.save();
        ctx.fillStyle = colorDe("superficie", paleta);
        ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = lado * 0.03; ctx.shadowOffsetY = lado * 0.01;
        rectRedondo(ctx, -iw / 2 - m, -ih / 2 - m, iw + m * 2, ih + m * 2, lado * 0.02);
        ctx.fill();
        ctx.restore();
      }
      if (cuadro) dibujarImagenEn(ctx, cuadro, iw, ih, capa.recorte);
      else if (Number.isFinite(estado.vida)) sinCuadro(ctx, iw, ih, cuerpo);
      return { w: iw + m * 2, h: ih + m * 2 };
    }
    case "forma": {
      const h = capa.figura === "ola" || capa.figura === "flecha" ? w * 0.45 : capa.figura === "linea" ? lado * 0.01 : w;
      ctx.rotate(estado.giro);
      trazarFigura(ctx, capa.figura, w, h, capa.id);
      const color = colorDe(capa.color, paleta);
      if (capa.relleno && capa.figura !== "linea") { ctx.fillStyle = color; ctx.fill(); } else {
        ctx.strokeStyle = color; ctx.lineWidth = lado * 0.012; ctx.lineCap = "round"; ctx.stroke();
      }
      return { w, h };
    }
    case "logo": {
      const img = recursos?.logo ?? null;
      // Una placa detrás si el guion la pide o si el logo no contrasta con el fondo de la escena (un logo azul oscuro
      // sobre el azul de la marca no se ve). Clara sobre fondo oscuro; oscura sobre claro.
      const placa = capa.placa ? colorDe(capa.placa, paleta)
        : img && logoNecesitaPlaca(recursos?.logoTono, c.luzFondo) ? colorDe(c.luzFondo < 0.4 ? "claro" : "oscuro", paleta) : "";
      const pad = placa ? lado * 0.045 : 0;
      // En el cierre el logo puede ocupar más alto: es lo último que se ve.
      const { w: lw, h: lh } = cajaDeImagen(img, w - pad * 2, maxAlto * (c.tipoEscena === "cierre" ? 0.75 : 0.5) - pad * 2, "contener");
      if (!img) { marcador(ctx, "Logo", lw, lh, paleta, cuerpo); return { w: lw, h: lh }; }
      if (placa) {
        ctx.fillStyle = placa;
        rectRedondo(ctx, -lw / 2 - pad, -lh / 2 - pad, lw + pad * 2, lh + pad * 2, lado * 0.03);
        ctx.fill();
      }
      dibujarImagenEn(ctx, img, lw, lh, "contener");
      return { w: lw + pad * 2, h: lh + pad * 2 };
    }
    case "cifra": {
      // El número con el ancho de su valor FINAL: mientras cuenta no cambia de tamaño. El sufijo, más pequeño, al lado;
      // la etiqueta, debajo.
      const numero = (v) => `${capa.prefijo ?? ""}${formatearCifra(v, capa.decimales, { abreviar: capa.abreviada === true })}`;
      const final = numero(capa.valor);
      const sufijo = capa.sufijo ? ` ${capa.sufijo}` : "";
      let tam = Math.min(lado * 0.36, maxAlto * 0.8);
      const medir = (t) => {
        ctx.font = `900 ${Math.round(t)}px ${titular}`;
        const a = ctx.measureText(final).width;
        ctx.font = `800 ${Math.round(t * 0.42)}px ${titular}`;
        return a + (sufijo ? ctx.measureText(sufijo).width : 0);
      };
      for (let i = 0; i < 24 && medir(tam) > w; i++) tam *= 0.94;
      const avance = avanceDeCuenta(estado.vida, capa.contar);
      const texto = numero(avance >= 1 ? capa.valor : capa.valor * avance);
      ctx.font = `900 ${Math.round(tam)}px ${titular}`;
      const anFinal = ctx.measureText(final).width;
      ctx.font = `800 ${Math.round(tam * 0.42)}px ${titular}`;
      const anSuf = sufijo ? ctx.measureText(sufijo).width : 0;
      const etiqueta = capa.etiqueta ? String(capa.etiqueta).toUpperCase() : "";
      const tamEt = Math.max(lado * 0.045, tam * 0.16);
      const alto = tam * 0.92 + (etiqueta ? tamEt * 1.5 : 0);
      const linea = -alto / 2 + tam * 0.8;
      const x0 = -(anFinal + anSuf) / 2;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = colorDe(capa.color, paleta);
      ctx.font = `900 ${Math.round(tam)}px ${titular}`;
      ctx.textAlign = "right";
      ctx.fillText(texto, x0 + anFinal, linea);
      if (sufijo) {
        ctx.textAlign = "left";
        ctx.font = `800 ${Math.round(tam * 0.42)}px ${titular}`;
        ctx.fillText(sufijo, x0 + anFinal, linea);
      }
      if (etiqueta) {
        ctx.textAlign = "center";
        ctx.fillStyle = colorDe("texto", paleta);
        ctx.font = `700 ${Math.round(tamEt)}px ${cuerpo}`;
        ctx.fillText(etiqueta, 0, linea + tamEt * 1.45, w);
      }
      return { w: Math.min(w, anFinal + anSuf), h: alto };
    }
    case "icono": {
      const s = Math.min(w, maxAlto);
      if (capa.fondo) {
        ctx.fillStyle = colorDe(capa.fondo, paleta);
        ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill();
        dibujarIcono(ctx, capa.nombre, s * 0.56, colorLegible(capa.color, capa.fondo, paleta), 2);
      } else dibujarIcono(ctx, capa.nombre, s * 0.92, colorDe(capa.color, paleta), 1.9);
      return { w: s, h: s };
    }
    case "anillo": {
      const s = Math.min(w, maxAlto);
      const grueso = s * 0.085;
      const r = (s - grueso) / 2;
      const valor = capa.valor * avanceDeCuenta(estado.vida, capa.contar);
      ctx.lineCap = "round";
      ctx.lineWidth = grueso;
      ctx.strokeStyle = colorDe(capa.pista, paleta);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      if (valor > 0.2) {
        ctx.strokeStyle = colorDe(capa.color, paleta);
        ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * valor) / 100); ctx.stroke();
      }
      // En medio, su texto o el porcentaje (que cuenta con el anillo); medido con «100%» para no cambiar de tamaño.
      const centro = capa.texto || `${Math.round(valor)}%`;
      const dentro = (r - grueso) * 2 * 0.82;
      let tam = s * 0.26;
      ctx.font = `900 ${Math.round(tam)}px ${titular}`;
      const anCentro = ctx.measureText(capa.texto || "100%").width;
      if (anCentro > dentro) tam *= dentro / anCentro;
      ctx.font = `900 ${Math.round(tam)}px ${titular}`;
      ctx.fillStyle = colorDe("texto", paleta);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const etiqueta = capa.etiqueta ? String(capa.etiqueta).toUpperCase() : "";
      ctx.fillText(centro, 0, etiqueta ? -s * 0.05 : 0);
      if (etiqueta) {
        ctx.font = `700 ${Math.round(Math.max(lado * 0.034, s * 0.06))}px ${cuerpo}`;
        ctx.fillText(etiqueta, 0, s * 0.13, dentro);
      }
      return { w: s, h: s };
    }
    case "personaje": {
      // La figura de la casa con el aspecto del cliente (src/lib/personajeVideo.js): alto = 1,2 × ancho.
      let pw = w;
      if (pw * PROPORCION_PERSONAJE > maxAlto) pw = maxAlto / PROPORCION_PERSONAJE;
      return dibujarPersonaje(ctx, {
        variante: capa.variante, pose: capa.pose, expresion: expresionDe(capa), aspecto: c.personaje, vida: estado.vida, ancho: pw,
        colorDe: (t) => colorDe(t, paleta),
      });
    }
    case "dibujo": {
      // La caja del dibujo: `tam` de ancho y `proporcion` de alto; si no cabe de alto, se encoge entera.
      let dw = w; let dh = w * (capa.proporcion ?? 1);
      if (dh > maxAlto) { dw *= maxAlto / dh; dh = maxAlto; }
      dibujarFormas(ctx, capa.formas, { ancho: dw, alto: dh, vida: estado.vida, colorDe: (t) => colorDe(t, paleta) });
      return { w: dw, h: dh };
    }
    case "llamado": {
      const { fuente, lineas, tam } = encajarTexto(ctx, capa.texto, { ancho: w * 0.84, lado, rol: "apoyo", familia: titular });
      const negrita = fuente.replace(/^\d+/, "800");
      ctx.font = negrita;
      const h = Math.max(tam * 2.2, lado * 0.11) + (lineas.length - 1) * tam * 1.2;
      ctx.fillStyle = colorDe(capa.fondo, paleta);
      rectRedondo(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = colorLegible(capa.color, capa.fondo, paleta);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      lineas.forEach((l, i) => ctx.fillText(l, 0, -((lineas.length - 1) * tam * 1.2) / 2 + i * tam * 1.2));
      return { w, h };
    }
    case "lista": case "burbuja": case "reloj": case "antes_despues": case "telefono": {
      // Los de motorComponentes.js, con los ayudantes de aquí (importarlos allí sería circular).
      const h = {
        w, lado, maxAlto, vida: estado.vida, titular, cuerpo, rect: rectRedondo, partir: partirEnLineas,
        color: (t) => colorDe(t, paleta), legible: (pedido, fondo) => colorLegible(pedido, fondo, paleta),
        imagen: (id) => recursos?.imagen?.(id) ?? null,
      };
      if (capa.tipo === "lista") return dibujarLista(ctx, capa, h);
      if (capa.tipo === "burbuja") return dibujarBurbuja(ctx, capa, h);
      if (capa.tipo === "reloj") return dibujarReloj(ctx, capa, h, avanceDeCuenta(estado.vida, true));
      if (capa.tipo === "antes_despues") return dibujarAntesDespues(ctx, capa, h);
      return dibujarTelefono(ctx, capa, h);
    }
    default: {
      // El marcador tiene la forma de lo que vendrá: un teléfono y una persona son más altos que anchos.
      const h = w * ({ telefono: 2, personaje: 1.2 }[capa.tipo] ?? 0.6);
      const hh = Math.min(h, maxAlto);
      const ww = w * (hh / h);
      marcador(ctx, NOMBRES_MARCADOR[capa.tipo] ?? capa.tipo, ww, hh, paleta, cuerpo);
      return { w: ww, h: hh };
    }
  }
}

// ------------------------------------------------------------
// Fondo, grano y escenas
// ------------------------------------------------------------

function dibujarFondo(ctx, fondo, ancho, alto, paleta, id, t = 0) {
  const a = colorDe(fondo?.color ?? "fondo", paleta);
  const b = colorDe(fondo?.color2 ?? "superficie", paleta);
  ctx.save();
  if (fondo?.tipo === "degradado") {
    const g = ctx.createLinearGradient(0, 0, 0, alto);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g;
  } else ctx.fillStyle = a;
  ctx.fillRect(0, 0, ancho, alto);
  const lado = Math.min(ancho, alto);
  if (fondo?.tipo === "rayas") {
    ctx.strokeStyle = b; ctx.globalAlpha = 0.18; ctx.lineWidth = lado * 0.03;
    for (let x = -alto; x < ancho; x += lado * 0.09) { ctx.beginPath(); ctx.moveTo(x, alto); ctx.lineTo(x + alto, 0); ctx.stroke(); }
  } else if (fondo?.tipo === "puntos") {
    ctx.fillStyle = b; ctx.globalAlpha = 0.28;
    const paso = lado * 0.06;
    for (let y = paso / 2; y < alto; y += paso) for (let x = paso / 2; x < ancho; x += paso) { ctx.beginPath(); ctx.arc(x, y, lado * 0.006, 0, Math.PI * 2); ctx.fill(); }
  } else if (fondo?.tipo === "estrellas" || fondo?.tipo === "lineas") {
    // Del color2 si el guion lo escogió; si no, el claro u oscuro que se vea sobre el fondo.
    const color = fondo?.color2 && fondo.color2 !== "superficie" ? b : contraste(a, colorDe("claro", paleta), colorDe("oscuro", paleta));
    if (fondo.tipo === "estrellas") dibujarEstrellas(ctx, { ancho, alto, color, semilla: semilla(`estrellas:${id}`), t });
    else dibujarLineas(ctx, { ancho, alto, color, semilla: semilla(`lineas:${id}`) });
  } else if (fondo?.tipo === "papel") {
    // Fibras del papel: la semilla es la escena, así no «hierven» de un fotograma a otro.
    const al = aleatorio(semilla(`papel:${id}`));
    ctx.strokeStyle = contraste(a, "#FFFFFF", "#000000"); ctx.lineWidth = Math.max(1, lado * 0.0015);
    for (let i = 0; i < 160; i++) {
      ctx.globalAlpha = 0.03 + al() * 0.05;
      const x = al() * ancho; const y = al() * alto; const l = lado * (0.01 + al() * 0.03); const g = al() * Math.PI;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(g) * l, y + Math.sin(g) * l); ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * El ruido del grano: un cuadro de `lado` × `lado` en RGBA (gris con alfa), de la semilla dada. Quien llama lo
 * convierte en imagen (un lienzo) una vez y lo pasa en `recursos.grano`. Pura.
 */
export function ruidoDeGrano(lado = 256, s = 1) {
  const al = aleatorio(s);
  const datos = new Uint8ClampedArray(lado * lado * 4);
  for (let i = 0; i < lado * lado; i++) {
    const v = Math.round(al() * 255);
    datos[i * 4] = v; datos[i * 4 + 1] = v; datos[i * 4 + 2] = v; datos[i * 4 + 3] = 255;
  }
  return datos;
}

function dibujarGrano(ctx, tile, intensidad, frame, ancho, alto) {
  if (!tile || !(intensidad > 0) || !ctx.createPattern) return;
  const patron = ctx.createPattern(tile, "repeat");
  if (!patron) return;
  const al = aleatorio(semilla(`grano:${frame}`));
  ctx.save();
  ctx.globalAlpha = Math.min(0.5, intensidad * 0.42);
  ctx.globalCompositeOperation = "overlay";
  ctx.translate(-Math.floor(al() * (tile.width || 256)), -Math.floor(al() * (tile.height || 256)));
  ctx.fillStyle = patron;
  ctx.fillRect(0, 0, ancho + (tile.width || 256), alto + (tile.height || 256));
  ctx.restore();
}

/**
 * Las capas de una escena. Si ninguna dice algo con letras (texto, sello o llamado) y la escena tiene `pantalla`, se
 * añade como titular, la PRIMERA y arriba: el texto en pantalla del guion es el mensaje de la escena, y una escena con
 * sólo un icono y una lista no lo decía.
 */
export function capasDe(escena) {
  const propias = escena.capas ?? [];
  const conLetras = propias.some((c) => ["texto", "sello", "llamado"].includes(c.tipo));
  if (conLetras || !escena.pantalla) return propias;
  return [{
    id: `${escena.id}-pantalla`, tipo: "texto", texto: escena.pantalla, rol: "titular", color: "texto", placa: "",
    alinear: "centro", pos: "arriba", tam: 0.84, entra: { s: 0 }, sale: null,
    animacion: { entrada: "sube", salida: "ninguna", bucle: "ninguno" },
  }, ...propias];
}

/** Una escena entera en el instante `t` (fondo y capas), sin transición ni grano. */
/** La luz del fondo de una escena (para decidir si el logo necesita placa). */
const luzDelFondo = (escena, paleta) => { const f = colorDe(escena?.fondo?.color ?? "fondo", paleta); return HEX.test(f) ? luminancia(f) : 0.5; };

/**
 * El estado de una capa A SANGRE. Una IMAGEN que entra con su escena y «aparece» ES la escena: se ve entera desde su
 * primer cuadro (la entrada la hace la transición de la escena); con la rampa de «aparece», el primer cuadro de una foto
 * con música salía negro, y ése es el que enseñan TikTok y la vista previa. Lo demás, como cualquier capa.
 */
function estadoACompleta(capa, cuando, momento, t, c) {
  const estado = estadoDeCapa(capa, cuando, t, { ritmo: c.ritmo, lado: c.lado });
  const conLaEscena = capa.tipo === "imagen" && (capa.animacion?.entrada ?? "aparece") === "aparece" && cuando.desde <= momento.desde + 1e-6;
  if (!conLaEscena || t < cuando.desde || t > cuando.hasta + 1e-6) return estado;
  return { ...(estado ?? { dx: 0, dy: 0, escala: 1, giro: 0, revelado: 1 }), alfa: 1, vida: t - cuando.desde };
}

function dibujarEscena(ctx, escena, momento, t, cGuion, primera = false) {
  const c = { ...cGuion, tipoEscena: escena.tipo, luzFondo: luzDelFondo(escena, cGuion.paleta), escenaId: escena.id };
  dibujarFondo(ctx, escena.fondo, c.ancho, c.alto, c.paleta, escena.id, t);
  const todas = capasDe(escena);
  const tiempos = tiemposDeEscena(todas, momento, primera);
  // Los videos y las imágenes a sangre, encima del fondo y detrás de todo lo demás.
  for (const capa of todas.filter(esCapaCompleta)) {
    // Un FONDO por crear (sólo su `pide`): mientras no exista, se ve el fondo de la escena.
    if (capa.tipo === "imagen" && !capa.archivo) continue;
    const cuando = tiempos.get(capa.id);
    const estado = estadoACompleta(capa, cuando, momento, t, c);
    if (!estado) continue;
    if (capa.tipo === "imagen") dibujarImagenCompleta(ctx, capa, estado, c, cuando);
    else dibujarVideoCompleto(ctx, capa, estado, c);
  }
  const capas = todas.filter((capa) => !esCapaCompleta(capa));
  const sitio = repartirEscena(ctx, capas, tiempos, c);
  // Las formas van detrás de lo que acompañan: se dibujan primero.
  const orden = [...capas].sort((p, q) => Number(Boolean(sitio.get(q.id)?.detras)) - Number(Boolean(sitio.get(p.id)?.detras)));
  for (const capa of orden) {
    const estado = estadoDeCapa(capa, tiempos.get(capa.id), t, { ritmo: c.ritmo, lado: c.lado });
    if (!estado) continue;
    const s = sitio.get(capa.id);
    ctx.save();
    ctx.globalAlpha *= estado.alfa;
    ctx.translate(s.x + estado.dx, s.y + estado.dy);
    // `pulso`: late con los golpes de la canción (los trae la línea de tiempo; sin golpes, nada).
    const escala = estado.escala * s.escala * (capa.pulso ? pulsoEn(c.golpes, t) : 1);
    if (escala !== 1) ctx.scale(escala, escala);
    if (estado.giro && capa.tipo !== "forma") ctx.rotate(estado.giro);
    // Barrido y dibuja: la capa se descubre de izquierda a derecha.
    if (estado.revelado < 1 && ["barrido", "dibuja"].includes(capa.animacion?.entrada)) {
      ctx.beginPath();
      ctx.rect(-c.lado, -c.alto, c.lado * 2 * estado.revelado, c.alto * 2);
      ctx.clip();
    }
    // Palabra por palabra: cuándo se dice cada palabra, desde que entró la capa (lo que dibuja cada una).
    const conTiempos = capa.tipo === "texto" && capa.porPalabra ? { ...estado, palabras: tiemposRelativos(capa, momento, tiempos.get(capa.id)) } : estado;
    dibujarCapa(ctx, capa, conTiempos, c, s.ancho);
    ctx.restore();
  }
}

// ------------------------------------------------------------
// Los subtítulos por palabra (src/lib/subtitulos.js decide los grupos y la palabra clave; aquí sólo se dibujan)
// ------------------------------------------------------------

/** Los grupos se calculan una vez por línea de tiempo (cada fotograma los pide). */
const GRUPOS = new WeakMap();
function gruposDe(linea, sub) {
  const clave = `${sub.maxPalabras}|${sub.maxCaracteres}`;
  const guardado = GRUPOS.get(linea);
  if (guardado?.clave === clave) return guardado.grupos;
  const grupos = gruposDeSubtitulos(linea, { maxPalabras: sub.maxPalabras, maxCaracteres: sub.maxCaracteres });
  GRUPOS.set(linea, { clave, grupos });
  return grupos;
}

/** Tamaño de los subtítulos (fracción del lado corto): el de partida, el mínimo y la altura de línea. */
export const TIPO_SUBTITULOS = Object.freeze({ tam: 0.082, minimo: 0.052, alto: 1.14, peso: 800 });

/**
 * Las líneas de un grupo (una o dos) y su tamaño: se empieza en el de partida y se baja hasta que entra a lo ancho y en
 * la altura de su franja. Dos líneas se parten parejas por palabras. Pura salvo medir.
 */
export function encajarSubtitulo(ctx, palabras, { ancho, alto, lado, familia }) {
  const T = TIPO_SUBTITULOS;
  const mide = (lista) => ctx.measureText(lista.join(" ")).width;
  let tam = lado * T.tam;
  let lineas = [palabras];
  for (let i = 0; i < 14; i++) {
    ctx.font = `${T.peso} ${Math.round(tam)}px ${familia}`;
    lineas = [palabras];
    if (mide(palabras) > ancho && palabras.length > 1) {
      // El corte que deja las dos líneas más parejas.
      let mejor = null;
      for (let k = 1; k < palabras.length; k++) {
        const a = palabras.slice(0, k); const b = palabras.slice(k);
        const peor = Math.max(mide(a), mide(b));
        if (!mejor || peor < mejor.peor) mejor = { peor, lineas: [a, b] };
      }
      lineas = mejor.lineas;
    }
    const cabe = Math.max(...lineas.map(mide)) <= ancho && lineas.length * tam * T.alto <= alto;
    if (cabe || tam <= lado * T.minimo) break;
    tam = Math.max(lado * T.minimo, tam * 0.93);
  }
  return { tam, lineas, fuente: `${T.peso} ${Math.round(tam)}px ${familia}` };
}

/**
 * Los subtítulos del instante `t`, en su franja (`bandaDeSubtitulos`): las palabras ya dichas en el claro de la paleta,
 * la clave en el acento de los subtítulos, la que se dice con un salto y las que faltan atenuadas. Con un borde oscuro
 * para que se lean sobre cualquier fondo.
 */
function dibujarSubtitulos(ctx, c, linea, t) {
  const sub = c.subtitulos;
  if (!sub?.activo || !linea) return;
  const g = grupoEn(gruposDe(linea, sub), t);
  if (!g) return;
  const area = areaSegura(c.formato, c.ancho, c.alto);
  const banda = bandaDeSubtitulos(c.formato, c.ancho, c.alto, sub.pos);
  const familia = c.fuentes?.cuerpo || c.fuentes?.titular || FUENTE_RESPALDO;
  const palabras = g.palabras.map((p) => p.texto.toUpperCase());
  const { tam, lineas, fuente } = encajarSubtitulo(ctx, palabras, { ancho: area.w * 0.94, alto: banda.h, lado: c.lado, familia });
  const estados = estadoDePalabras(g, t);
  const claro = colorDe("claro", c.paleta);
  const oscuro = colorDe("oscuro", c.paleta);
  const acento = colorDe(sub.acento || "acento", c.paleta);
  const altoLinea = tam * TIPO_SUBTITULOS.alto;
  const entrada = suave.sale(limitar((t - g.desde) / 0.08));

  ctx.save();
  ctx.font = fuente;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.globalAlpha *= entrada;
  const espacio = ctx.measureText(" ").width;
  let i = 0;
  lineas.forEach((fila, n) => {
    const anchos = fila.map((p) => ctx.measureText(p).width);
    const total = anchos.reduce((a, b) => a + b, 0) + espacio * (fila.length - 1);
    let x = c.ancho / 2 - total / 2;
    const y = banda.y + banda.h / 2 + (n - (lineas.length - 1) / 2) * altoLinea;
    fila.forEach((p, j) => {
      const e = estados[i];
      const centro = x + anchos[j] / 2;
      ctx.save();
      if (e.estado === "falta") ctx.globalAlpha *= 0.38;
      ctx.translate(centro, y);
      if (e.estado === "diciendo") { const s = 1 + 0.14 * (1 - suave.sale(e.salto)); ctx.scale(s, s); }
      ctx.lineWidth = tam * 0.17;
      ctx.strokeStyle = oscuro;
      ctx.strokeText(p, 0, 0);
      ctx.fillStyle = i === g.clave ? acento : claro;
      ctx.fillText(p, 0, 0);
      ctx.restore();
      x += anchos[j] + espacio;
      i++;
    });
  });
  ctx.restore();
}

/** La escena que se ve en `t` (la última que empezó). Pura. */
export function escenaEn(linea, t) {
  const es = linea?.escenas ?? [];
  let k = 0;
  for (let i = 0; i < es.length; i++) if (t >= es[i].desde) k = i;
  return k;
}

/**
 * Los cuadros de VIDEO que pide el fotograma del instante `t`: `[{ id, archivo, segundo }]`, uno por capa de video que
 * se ve (también la de la escena anterior mientras dura la transición, quieta en su último cuadro). El `id` es el del
 * uso (escena/capa) y el `segundo`, el del clip: lo MISMO que pedirá el motor al dibujar. El Container los decodifica
 * antes de dibujar el cuadro (el motor no espera nada). Puede sobrar alguno (no se dibuja si su alfa es 0). Pura.
 */
export function videosEnInstante(guion, linea, t) {
  const escenas = guion?.escenas ?? [];
  if (!escenas.length || !linea?.escenas?.length) return [];
  const k = escenaEn(linea, t);
  const momento = linea.escenas[k];
  const tr = escenas[k].transicion ?? { tipo: "corte", dur: 0 };
  const dibujadas = [[k, t]];
  if (k > 0 && tr.tipo !== "corte" && tr.dur > 0 && t < momento.desde + tr.dur) dibujadas.unshift([k - 1, linea.escenas[k - 1].hasta - 1 / FPS]);
  const salida = [];
  for (const [i, tt] of dibujadas) {
    const capas = capasDe(escenas[i]);
    if (!capas.some((capa) => capa.tipo === "video")) continue;
    const tiempos = tiemposDeEscena(capas, linea.escenas[i], i === 0);
    for (const capa of capas) {
      if (capa.tipo !== "video") continue;
      const v = tiempos.get(capa.id);
      if (tt < v.desde - 1e-6 || tt > v.hasta + DURACION_SALIDA + 1e-6) continue;
      salida.push({ id: `${escenas[i].id}/${capa.id}`, archivo: capa.archivo, segundo: segundoDelClip(capa, v.desde, tt) });
    }
  }
  return salida;
}

/**
 * Todos los USOS de video de un guion, con su ventana en el video y su tramo del clip: `[{ id, archivo, desde, hasta,
 * clipDesde, sonido, volumen }]` (desde/hasta en segundos del VIDEO, como los dibuja el motor). Para el audio del
 * render (el sonido de cada clip) y para saber qué clips mandar. Pura.
 */
export function usosDeVideo(guion, linea) {
  const salida = [];
  (guion?.escenas ?? []).forEach((e, i) => {
    const capas = capasDe(e);
    if (!capas.some((capa) => capa.tipo === "video") || !linea?.escenas?.[i]) return;
    const tiempos = tiemposDeEscena(capas, linea.escenas[i], i === 0);
    for (const capa of capas) {
      if (capa.tipo !== "video") continue;
      const v = tiempos.get(capa.id);
      const tramo = Number(capa.hasta) > Number(capa.desde) ? Number(capa.hasta) - Number(capa.desde) : Infinity;
      salida.push({
        id: `${e.id}/${capa.id}`, archivo: capa.archivo, desde: v.desde, hasta: Math.min(v.hasta, v.desde + tramo),
        clipDesde: Number(capa.desde) || 0, sonido: capa.sonido === true, volumen: Number.isFinite(capa.volumen) ? capa.volumen : 1,
      });
    }
  });
  return salida;
}

/** Lo que necesitan el reparto y el dibujo de cada capa: medidas, paleta, ritmo, recursos, fuentes, subtítulos. */
function contextoDe({ guion, linea = null, formato, paleta, recursos = {}, fuentes = {} }) {
  const f = FORMATOS_VIDEO[formato] ? formato : (guion?.formatos?.[0] ?? "9:16");
  const { ancho, alto } = FORMATOS_VIDEO[f] ?? FORMATOS_VIDEO["9:16"];
  return {
    ancho, alto, lado: Math.min(ancho, alto), formato: f, paleta: paleta ?? paletaDelGuion(guion),
    ritmo: guion?.estilo?.ritmo ?? "medio", recursos, fuentes, subtitulos: guion?.subtitulos, personaje: guion?.estilo?.personaje ?? null,
    golpes: linea?.golpes ?? null,
    // Lo más alto que puede ser una imagen: el 62 % del área segura; en 16:9 lo visual tiene su columna y llega al 82 %.
    altoUtil: areaSegura(f, ancho, alto).h * (ancho > alto * 1.2 ? 0.82 : 0.62),
  };
}

/**
 * Las cajas de las capas de la escena `indice` tal como las reparte el motor: `[{ id, tipo, x, y, w, h, detras, ancho,
 * escala, cuando }]`
 * en píxeles del lienzo (x, y: la esquina de arriba a la izquierda; ya con su escala). Para las pruebas y para quien
 * quiera ver el reparto sin dibujar. Pura.
 */
export function cajasDeEscena(ctx, { guion, linea, indice = 0, formato, recursos = {}, fuentes = {} }) {
  const escena = guion?.escenas?.[indice];
  if (!escena) return [];
  const base = contextoDe({ guion, formato, recursos, fuentes });
  const c = { ...base, tipoEscena: escena.tipo, luzFondo: luzDelFondo(escena, base.paleta), escenaId: escena.id };
  const todas = capasDe(escena);
  const tiempos = tiemposDeEscena(todas, linea.escenas[indice], indice === 0);
  // Un video (o una imagen) a sangre no tiene caja: es el fondo.
  const capas = todas.filter((capa) => !esCapaCompleta(capa));
  const sitio = repartirEscena(ctx, capas, tiempos, c);
  return capas.map((capa) => {
    const s = sitio.get(capa.id);
    const m = medirCapa(ctx, capa, c, s.ancho);
    const w = m.w * s.escala; const h = m.h * s.escala;
    return {
      id: capa.id, tipo: capa.tipo, x: s.x - w / 2, y: s.y - h / 2, w, h, detras: Boolean(s.detras),
      // Lo que necesita la revisión (src/lib/revisionEscenas.js): el ancho que se le dio, cuánto se encogió y cuándo se ve.
      ancho: s.ancho, escala: s.escala, cuando: tiempos.get(capa.id),
    };
  });
}

/**
 * Dibuja el fotograma del instante `t` de un guion.
 *   guion   — validado (`validarGuion().guion`)
 *   linea   — `lineaDeTiempo(guion, palabras)`
 *   formato — uno de FORMATOS_VIDEO (el primero del guion si no se dice)
 *   paleta  — `paletaDelGuion(guion, kit.paleta)`
 *   recursos — { imagen(id) → imagen | null, logo, grano } (imágenes ya cargadas, o nada: sale el marcador)
 *   fuentes — { titular, cuerpo }: familias ya registradas
 * El contexto se escala por fuera: aquí se dibuja en las medidas del formato.
 */
export function dibujarFrame(ctx, { guion, linea, t = 0, formato, paleta, recursos = {}, fuentes = {} }) {
  const c = contextoDe({ guion, linea, formato, paleta, recursos, fuentes });
  const { ancho, alto } = c;
  const escenas = guion?.escenas ?? [];
  ctx.save();
  if (!escenas.length) {
    ctx.fillStyle = c.paleta.fondo; ctx.fillRect(0, 0, ancho, alto); ctx.restore(); return;
  }
  const k = escenaEn(linea, t);
  const escena = escenas[k];
  const momento = linea.escenas[k];
  const tr = escena.transicion ?? { tipo: "corte", dur: 0 };
  const p = k > 0 && tr.tipo !== "corte" && tr.dur > 0 ? limitar((t - momento.desde) / tr.dur) : 1;
  if (p < 1) {
    // La anterior se queda quieta en su último fotograma mientras entra la nueva.
    const previa = linea.escenas[k - 1];
    dibujarEscena(ctx, escenas[k - 1], previa, previa.hasta - 1 / FPS, c, k - 1 === 0);
    const q = suave.entraSale(p);
    ctx.save();
    if (tr.tipo === "fundido") ctx.globalAlpha = q;
    if (tr.tipo === "barrido") { ctx.beginPath(); ctx.rect(0, 0, ancho * q, alto); ctx.clip(); }
    if (tr.tipo === "deslizar") ctx.translate(ancho * (1 - q), 0);
    if (tr.tipo === "zoom") {
      ctx.globalAlpha = q;
      const s = 1.15 - 0.15 * q;
      ctx.translate(ancho / 2, alto / 2); ctx.scale(s, s); ctx.translate(-ancho / 2, -alto / 2);
    }
    dibujarEscena(ctx, escena, momento, t, c, k === 0);
    ctx.restore();
  } else dibujarEscena(ctx, escena, momento, t, c, k === 0);
  dibujarSubtitulos(ctx, c, linea, t);
  dibujarGrano(ctx, recursos.grano, guion?.estilo?.grano ?? 0, Math.round(t * FPS), ancho, alto);
  ctx.restore();
}

/** Los fotogramas de un video de `segundos`. Pura. */
export const framesDe = (segundos) => Math.max(1, Math.ceil(segundos * FPS));
