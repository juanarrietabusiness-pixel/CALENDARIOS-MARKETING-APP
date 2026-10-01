// ============================================================
// Los motores del Estudio
//
// Un motor tiene el MISMO contrato para todos, en una de dos formas:
//
//   IMAGEN, que responde en el acto:
//     motor.generar(env, { modelo, prompt, ajustes, referencias, medios })
//       → { bytes, mime, costo, meta? }        o lanza ErrorMotor
//
//   COLA (todo video, y las imágenes de los motores que sólo contestan así):
//     motor.enviar(env, { modelo, prompt, ajustes, medios })
//       → { id, cada?, datos? }                el id del motor: se guarda al instante; `datos` son sus
//                                              direcciones de seguimiento, que vuelven en `item.datos`
//     motor.sondear(env, { modelo, item, ajustes })
//       → { estado: "pendiente", nota?, cada? }
//       | { estado: "fallido", error }
//       | { estado: "listo", url, headers?, mime? } | { estado: "listo", bytes, mime }
//
//   Opcional en cualquiera: motor.validar(modelo, pedido) → motivo | null, para rechazar al PEDIR una
//   combinación que el motor no admite (Higgsfield: una ruta para esas imágenes), antes de crear nada.
//
// «Una cosa por paso»: el Worker no puede esperar, así que un pedido de tres
// imágenes son tres pasos, y un video son un paso para ENVIAR y otros para
// mirar cómo va; cada uno guarda su avance (trabajos.js). Enviar es lo único
// que no se repite —igual que publicar—: el id que devuelve el motor se guarda
// antes que nada.
//
// CADA MOTOR DICE SI TIENE LLAVE. Las llaves son secretos del Worker
// (`wrangler secret put`); el navegador no recibe ninguna. Un modelo cuyo
// motor no tiene llave se ve en la lista, atenuado y con cómo activarlo.
// ============================================================

import { llamarGemini, aBase64, ErrorMotor } from "./gemini.js";
import { MEDIDAS, proporcionDe } from "../../../src/lib/estudioCatalogo.js";
import { PRECIOS_GEMINI, costoGemini } from "../configIA.js";
import { MOTOR_FAL } from "./fal.js";
import { MOTOR_HIGGSFIELD } from "./higgsfield.js";
import { MOTOR_META } from "./meta.js";

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

/**
 * La «cámara» del video de prueba: una tarjeta ANIMADA (SVG con SMIL, que corre dentro de un <img>) en
 * lugar de un video, porque el Worker no puede codificar MP4. Prueba el recorrido entero —animar una
 * imagen, esperar en la cola, verlo— sin gastar.
 */
export function tarjetaDeVideoDePrueba({ prompt, ajustes, medios = {} }) {
  const [w, h] = MEDIDAS[proporcionDe(ajustes)];
  const segundos = Math.max(1, Number(ajustes?.duration) || 5);
  const { svg } = tarjetaDePrueba({ prompt, ajustes, referencias: (medios.reference ?? []).length });
  const animacion =
    `<circle r="${Math.round(w / 5)}" cy="${Math.round(h / 2)}" fill="#fff" opacity=".12"><animate attributeName="cx" values="${-Math.round(w / 5)};${Math.round(w * 1.2)}" dur="${segundos}s" repeatCount="indefinite"/></circle>` +
    `<rect x="0" y="${h - Math.round(h / 40)}" height="${Math.round(h / 40)}" fill="#fff" opacity=".85"><animate attributeName="width" values="0;${w}" dur="${segundos}s" repeatCount="indefinite"/></rect>` +
    `<text x="96%" y="${h - Math.round(h / 20)}" fill="#fff" opacity=".8" font-family="Georgia,serif" font-size="${Math.round(w / 34)}" text-anchor="end">muestra animada · ${segundos} s</text>`;
  return { svg: svg.replace("</svg>", `${animacion}</svg>`).replace("PRUEBA · ESTUDIO", "PRUEBA · VIDEO"), ancho: w, alto: h };
}

/** La petición de Veo, como la envía el SDK de Google. Pura (las imágenes ya vienen en base64). */
export function peticionVeo(modelo, { prompt, ajustes, medios = {} }) {
  const imagen = (f) => ({ bytesBase64Encoded: f.base64, mimeType: f.mime });
  const instancia = { prompt };
  const inicial = medios.start?.[0];
  const final = medios.end?.[0];
  const referencias = (medios.reference ?? []).slice(0, modelo.referencias ?? 0);
  if (inicial) instancia.image = imagen(inicial);
  if (final && inicial) instancia.lastFrame = imagen(final); // un fotograma final sólo va con uno inicial
  if (referencias.length && !inicial) instancia.referenceImages = referencias.map((f) => ({ image: imagen(f), referenceType: "asset" }));
  return {
    instances: [instancia],
    parameters: {
      aspectRatio: ajustes.aspectRatio || "9:16",
      resolution: ajustes.resolution || "720p",
      durationSeconds: Number(ajustes.duration) || 8,
    },
  };
}

const BASE_GEMINI = "https://generativelanguage.googleapis.com/v1beta";

export const MOTORES = Object.freeze({
  prueba: {
    nombre: "Prueba (gratis)",
    llave: null,
    activo: () => true,
    async generar(_env, { prompt, ajustes, referencias = [], indice = 0, total = 1 }) {
      const { svg, ancho, alto } = tarjetaDePrueba({ prompt, ajustes, indice, total, referencias: referencias.length });
      return { bytes: new TextEncoder().encode(svg), mime: "image/svg+xml", costo: 0, ancho, alto };
    },
    // El «video» de prueba pasa por la cola de verdad: la primera vez que se mira, aún no está.
    async enviar() { return { id: `prueba-${crypto.randomUUID()}`, cada: 1000 }; },
    async sondear(_env, { modelo, item, prompt, ajustes, medios }) {
      if ((item?.sondeos ?? 0) < 1) return { estado: "pendiente", nota: "Generando…", cada: 1000 };
      const { svg, ancho, alto } = tarjetaDeVideoDePrueba({ prompt: prompt ?? "", ajustes: ajustes ?? modelo?.ajustes ?? {}, medios });
      return { estado: "listo", bytes: new TextEncoder().encode(svg), mime: "image/svg+xml", ancho, alto };
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

    // ---- Video (Veo): predictLongRunning → sondear la operación → bajar el archivo con la llave.
    async enviar(env, { modelo, prompt, ajustes, medios }) {
      const res = await fetch(`${BASE_GEMINI}/models/${encodeURIComponent(modelo.gid)}:predictLongRunning`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GOOGLE_AI_KEY },
        body: JSON.stringify(peticionVeo(modelo, { prompt, ajustes, medios })),
      }).catch(() => { throw new ErrorMotor("No se pudo contactar con Google AI", 502, { reintentable: true }); });
      const texto = await res.text().catch(() => "");
      if (!res.ok) throw errorDeGoogle(res.status, texto, modelo.gid);
      let op = null;
      try { op = JSON.parse(texto); } catch { /* respuesta rara */ }
      if (!op?.name) throw new ErrorMotor("Google no devolvió el número de la operación del video.", 502);
      return { id: op.name, cada: 8000 };
    },
    async sondear(env, { modelo, item }) {
      const ruta = String(item.id).split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${BASE_GEMINI}/${ruta}`, { headers: { "x-goog-api-key": env.GOOGLE_AI_KEY } })
        .catch(() => { throw new ErrorMotor("No se pudo contactar con Google AI", 502, { reintentable: true }); });
      const texto = await res.text().catch(() => "");
      if (!res.ok) {
        // Un 4xx al sondear no se reintenta: la operación no existe o la llave dejó de valer.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) return { estado: "fallido", error: errorDeGoogle(res.status, texto, modelo.gid).message };
        throw errorDeGoogle(res.status, texto, modelo.gid);
      }
      let op = {};
      try { op = JSON.parse(texto); } catch { /* respuesta rara */ }
      if (!op.done) return { estado: "pendiente", nota: "Generando en Google…", cada: 8000 };
      if (op.error) return { estado: "fallido", error: `${modelo.nombre}: ${String(op.error.message || "falló").slice(0, 200)}` };
      const r = op.response?.generateVideoResponse ?? op.response ?? {};
      const video = (r.generatedSamples ?? r.generatedVideos ?? []).map((x) => x.video).find(Boolean);
      if (!video?.uri) {
        const razones = r.raiMediaFilteredReasons?.length ? ` ${r.raiMediaFilteredReasons.join(" ")}` : "";
        return { estado: "fallido", error: r.raiMediaFilteredCount || razones
          ? `El filtro de contenido de Google no dejó crear ese video.${razones} Cambia el prompt.`
          : `${modelo.nombre} no devolvió ningún video.` };
      }
      return { estado: "listo", url: video.uri, headers: { "x-goog-api-key": env.GOOGLE_AI_KEY }, mime: "video/mp4" };
    },
  },

  // Los otros dos viven en su archivo: rutas, cuerpos y direcciones de seguimiento son de cada proveedor.
  fal: MOTOR_FAL,
  higgsfield: MOTOR_HIGGSFIELD,
  meta: MOTOR_META,
});

/** El rechazo de Google en palabras. Un 404 dice qué modelo falta. */
function errorDeGoogle(estado, texto, gid) {
  let detalle = "";
  try { detalle = JSON.parse(texto)?.error?.message || ""; } catch { /* no es JSON */ }
  if (estado === 429) return new ErrorMotor("Google AI está saturado. Inténtalo en unos segundos.", 429, { reintentable: true });
  if (estado === 401 || estado === 403) {
    return new ErrorMotor(`Google AI no dejó usar «${gid}» con la clave del servidor${detalle ? `: ${detalle.slice(0, 200)}` : ""}. Los videos de Veo exigen que el proyecto de Google tenga facturación.`, 502);
  }
  if (estado === 404) return new ErrorMotor(`Tu cuenta de Google AI no tiene el modelo «${gid}»${detalle ? ` (${detalle.slice(0, 160)})` : ""}. Prueba con otro modelo.`, 502);
  return new ErrorMotor(`Google AI devolvió un error (${estado})${detalle ? `: ${detalle.slice(0, 200)}` : "."}`, 502, { reintentable: estado >= 500 });
}

/** Qué motores tienen llave, para la pantalla. Nunca la llave. */
export function estadoMotores(env) {
  return Object.fromEntries(
    Object.entries(MOTORES).map(([id, m]) => [id, { nombre: m.nombre, activo: m.activo(env), llave: m.llave }]),
  );
}
