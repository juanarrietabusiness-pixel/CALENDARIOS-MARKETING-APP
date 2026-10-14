// ============================================================
// El logo ESTAMPADO por la aplicación (lienzo) o puesto por el modelo
//
// Dos formas de llevar el logo, y cada cliente escoge la suya en el kit
// (`kit.logoModo`):
//   · «modelo» (la de siempre): el logo va de imagen de referencia y el motor
//     lo integra en la escena. Queda natural, pero a veces lo redibuja.
//   · «estampado»: el motor NO recibe el logo, y la aplicación pega el
//     original encima, en la esquina y al tamaño del kit (`kit.logoPosicion`).
//     Sale idéntico siempre, como un sello.
// «Estampar el logo» del visor funciona con cualquiera de los dos: la pieza
// estampada sube como una nueva que RECUERDA su original (`origenId`), así
// «Otra versión» sigue sabiendo repetirla.
//
// `posicionLogo` y `posicionDelKit` son puras; `estamparLogo` dibuja.
// ============================================================

export const ESQUINAS_LOGO = {
  "abajo-derecha": "Abajo a la derecha",
  "abajo-izquierda": "Abajo a la izquierda",
  "abajo-centro": "Abajo al centro",
  "arriba-derecha": "Arriba a la derecha",
  "arriba-izquierda": "Arriba a la izquierda",
};
export const MODOS_LOGO = {
  modelo: { nombre: "Lo pone el modelo", ayuda: "Va de referencia y el modelo lo integra en la escena (natural; a veces lo redibuja)." },
  estampado: { nombre: "Lo estampa la aplicación", ayuda: "El modelo no lo recibe; se pega el original encima, siempre igual, en la esquina y al tamaño de abajo." },
};
export const TAMANO_LOGO = { min: 0.06, max: 0.3, defecto: 0.16 };
export const MARGEN_LOGO = { min: 0, max: 0.1, defecto: 0.04 };

const entre = (v, { min, max, defecto }) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defecto;
};

/** La posición guardada en el kit, limpia (lo que no se entiende, al valor de la casa). Pura. */
export function posicionDelKit(entrada) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  return {
    esquina: ESQUINAS_LOGO[e.esquina] ? e.esquina : "abajo-derecha",
    tamano: Math.round(entre(e.tamano, TAMANO_LOGO) * 100) / 100,
    margen: Math.round(entre(e.margen, MARGEN_LOGO) * 100) / 100,
  };
}

/**
 * Dónde y de qué tamaño va el logo sobre una imagen de `ancho`×`alto`. `tamano` es el ANCHO del logo como fracción
 * del ancho de la imagen; un logo alto (vertical) se limita a esa misma fracción del alto, para que no tape media
 * pieza. `margen`, fracción del lado corto. → { x, y, w, h } en píxeles enteros. Pura.
 */
export function posicionLogo({ ancho, alto, logoAncho, logoAlto, esquina = "abajo-derecha", tamano = TAMANO_LOGO.defecto, margen = MARGEN_LOGO.defecto }) {
  const p = posicionDelKit({ esquina, tamano, margen });
  const prop = logoAncho > 0 && logoAlto > 0 ? logoAlto / logoAncho : 1;
  let w = ancho * p.tamano;
  let h = w * prop;
  const maxH = alto * p.tamano;
  if (h > maxH) { h = maxH; w = h / prop; }
  const m = Math.min(ancho, alto) * p.margen;
  const x = p.esquina.endsWith("izquierda") ? m : p.esquina.endsWith("centro") ? (ancho - w) / 2 : ancho - w - m;
  const y = p.esquina.startsWith("arriba") ? m : alto - h - m;
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

async function cargar(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}

/**
 * Pega el logo encima de la pieza y devuelve la imagen nueva (Blob). PNG si el original lo era (puede tener
 * transparencia); si no, JPEG de calidad alta.
 */
export async function estamparLogo({ src, logoSrc, posicion, mime = "image/png" }) {
  const [img, logo] = await Promise.all([cargar(src), cargar(logoSrc)]);
  const ancho = img.naturalWidth || img.width;
  const alto = img.naturalHeight || img.height;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(img, 0, 0, ancho, alto);
  const { x, y, w, h } = posicionLogo({ ancho, alto, logoAncho: logo.naturalWidth || logo.width, logoAlto: logo.naturalHeight || logo.height, ...posicion });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(logo, x, y, w, h);
  const tipo = mime === "image/png" ? "image/png" : "image/jpeg";
  return await new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo estampar el logo."))), tipo, 0.94));
}
