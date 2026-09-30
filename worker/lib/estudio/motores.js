// ============================================================
// Los motores del Estudio
//
// Un motor es una función con el MISMO contrato para todos:
//
//   motor.generar(env, { modelo, prompt, ajustes, referencias })
//     → { bytes, mime, costo, meta? }        o lanza ErrorMotor
//
// «Una imagen por paso»: el Worker no puede esperar, así que un pedido de
// tres imágenes son tres pasos y cada uno guarda su avance (trabajos.js).
// Los motores de cola —un video que tarda minutos— tendrán además
// `enviar`/`sondear`; los de imagen que responden en el acto, como estos,
// sólo `generar`.
//
// CADA MOTOR DICE SI TIENE LLAVE. Las llaves son secretos del Worker
// (`wrangler secret put`); el navegador no recibe ninguna. Un modelo cuyo
// motor no tiene llave se ve en la lista, atenuado y con cómo activarlo.
// ============================================================

import { llamarGemini, aBase64 } from "./gemini.js";
import { MEDIDAS, proporcionDe } from "../../../src/lib/estudioCatalogo.js";
import { PRECIOS_GEMINI, costoGemini } from "../configIA.js";

const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * La tarjeta de prueba: un SVG con el prompt encima, sin red ni costo. Prueba
 * todo el recorrido —pedir, avanzar, guardar, ver, usar— sin gastar. Lo único
 * que lleva texto de la persona va escapado.
 */
export function tarjetaDePrueba({ prompt, ajustes, indice = 0, total = 1, referencias = 0 }) {
  const [w, h] = MEDIDAS[proporcionDe(ajustes)];
  const texto = `${prompt}${total > 1 ? ` (${indice + 1}/${total})` : ""}`;
  const tono = [...texto].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
  const lineas = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/)) {
    if ((`${actual} ${palabra}`).trim().length > 26) { lineas.push(actual); actual = palabra; } else actual = `${actual} ${palabra}`.trim();
  }
  if (actual) lineas.push(actual);
  const renglones = lineas.slice(0, 8)
    .map((l, k) => `<text x="50%" y="${34 + k * 8}%" fill="#fff" font-family="Georgia,serif" font-size="${Math.round(w / 17)}" text-anchor="middle">${escapar(l)}</text>`)
    .join("");
  const refs = referencias
    ? `<text x="50%" y="92%" fill="#fff" opacity=".7" font-family="Georgia,serif" font-size="${Math.round(w / 30)}" text-anchor="middle">con ${referencias} referencia${referencias === 1 ? "" : "s"}</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${tono},70%,22%)"/><stop offset="1" stop-color="hsl(${(tono + 60) % 360},80%,45%)"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/>` +
    `<text x="50%" y="12%" fill="#fff" opacity=".6" font-family="Georgia,serif" font-size="${Math.round(w / 22)}" text-anchor="middle">PRUEBA · ESTUDIO</text>` +
    `${renglones}${refs}</svg>`;
  return { svg, ancho: w, alto: h };
}

/** Lo que Gemini debe recibir: el prompt, y las referencias como imágenes en línea. */
export function partesDeGemini(prompt, referencias = []) {
  const partes = [{ text: `${prompt}\n\nGenera SOLO la imagen, sin explicación.` }];
  if (referencias.length) {
    partes.push({ text: "\nIMÁGENES DE REFERENCIA (úsalas como base o inspiración visual, según pida el prompt):" });
    for (const r of referencias) partes.push({ inlineData: { mimeType: r.mime, data: aBase64(r.bytes) } });
  }
  return partes;
}

/**
 * Lo que costó una imagen de Gemini. Con tokens reales si se conoce el
 * precio del modelo (`PRECIOS_GEMINI`); si no, la estimación del catálogo.
 * Ninguna tarifa de tokens inventada: un modelo nuevo cuenta lo que dice
 * `estimado` y se ve como tal.
 */
export function costoDeGemini(modelo, meta) {
  return PRECIOS_GEMINI[modelo.gid] ? costoGemini(modelo.gid, meta) : modelo.costo;
}

export const MOTORES = Object.freeze({
  prueba: {
    nombre: "Prueba (gratis)",
    llave: null,
    activo: () => true,
    async generar(_env, { prompt, ajustes, referencias = [], indice = 0, total = 1 }) {
      const { svg, ancho, alto } = tarjetaDePrueba({ prompt, ajustes, indice, total, referencias: referencias.length });
      return { bytes: new TextEncoder().encode(svg), mime: "image/svg+xml", costo: 0, ancho, alto };
    },
  },

  gemini: {
    nombre: "Google (Nano Banana)",
    llave: "GOOGLE_AI_KEY",
    activo: (env) => Boolean(env?.GOOGLE_AI_KEY),
    async generar(env, { modelo, prompt, ajustes, referencias = [] }) {
      const { bytes, mime, meta } = await llamarGemini(env, {
        gid: modelo.gid,
        partes: partesDeGemini(prompt, referencias),
        ratio: proporcionDe(ajustes),
        tamano: modelo.ajustes.imageSize ? ajustes.imageSize : null,
      });
      return { bytes, mime, costo: costoDeGemini(modelo, meta), meta };
    },
  },
});

/** Qué motores tienen llave, para la pantalla. Nunca la llave. */
export function estadoMotores(env) {
  return Object.fromEntries(
    Object.entries(MOTORES).map(([id, m]) => [id, { nombre: m.nombre, activo: m.activo(env), llave: m.llave }]),
  );
}
