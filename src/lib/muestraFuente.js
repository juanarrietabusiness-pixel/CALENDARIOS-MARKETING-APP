// ============================================================
// La fuente de la marca en el navegador
//
// La agencia sube la fuente del cliente (TTF, OTF, WOFF, WOFF2) al kit. Con
// ella:
//   · `dibujarMuestra` dibuja una MUESTRA (el nombre de la marca, el
//     abecedario con tildes y eñes, números y un titular) que va de referencia
//     «toma la tipografía de aquí» cuando el modelo escribe el texto: así
//     Nano Banana diseña libre pero con la letra de la marca.
//   · `cargarFuente` la registra para el lienzo: la plantilla de texto encima
//     (textoSobreImagen.js) escribe con la letra REAL y no con la del sistema.
//
// La fuente se sirve desde /api/media (mismo origen: `font-src 'self'`).
// ============================================================

const cargadas = new Map();

/** Registra la fuente del kit ({ clave, nombre }) para el lienzo → el nombre de familia con que usarla. */
export async function cargarFuente(fuente) {
  if (!fuente?.clave || typeof FontFace === "undefined") return "";
  if (cargadas.has(fuente.clave)) return cargadas.get(fuente.clave);
  const familia = `Marca-${fuente.clave.split("/").pop().replace(/\W+/g, "").slice(0, 24)}`;
  const promesa = new FontFace(familia, `url(/api/media/${fuente.clave})`).load()
    .then((f) => { document.fonts.add(f); return familia; })
    .catch(() => "");
  cargadas.set(fuente.clave, promesa);
  return promesa;
}

/** Las líneas de la muestra: lo que deja ver la forma de cada letra (tildes, eñes, signos de apertura y números). Pura. */
export function lineasDeMuestra(marca = "") {
  return [
    String(marca || "Aa").slice(0, 28),
    "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ",
    "abcdefghijklmnñopqrstuvwxyz",
    "ÁÉÍÓÚ áéíóú ¿? ¡! 0123456789 $ %",
    "Así se escribe un titular",
  ];
}

/** Dibuja la muestra con la fuente (negro sobre blanco, 1600 × 1000) → un PNG. Lanza si la fuente no carga. */
export async function dibujarMuestra({ fuente, marca = "" }) {
  const familia = await cargarFuente(fuente);
  if (!familia) throw new Error("El navegador no pudo leer esa fuente: prueba con el archivo TTF u OTF.");
  const lienzo = document.createElement("canvas");
  lienzo.width = 1600;
  lienzo.height = 1000;
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "top";
  const [titulo, ...resto] = lineasDeMuestra(marca);
  let y = 70;
  const escribir = (texto, tam, peso = 700) => {
    ctx.font = `${peso} ${tam}px "${familia}"`;
    // Que quepa a lo ancho: se achica hasta entrar.
    let t = tam;
    while (ctx.measureText(texto).width > lienzo.width - 140 && t > 24) { t -= 4; ctx.font = `${peso} ${t}px "${familia}"`; }
    ctx.fillText(texto, 70, y);
    y += t * 1.35;
  };
  escribir(titulo, 170, 800);
  y += 20;
  for (const l of resto) escribir(l, 84, 600);
  return await new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo dibujar la muestra."))), "image/png"));
}
