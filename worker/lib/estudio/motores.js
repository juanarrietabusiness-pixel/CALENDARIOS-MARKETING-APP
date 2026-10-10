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

const BASE_GEMINI = "https://generativelanguage.googleapis.com/v1beta";

/**
 * La petición de Gemini Omni Flash (Interactions API). Pura. Con imágenes, `input` es una lista: la primera es el
 * fotograma inicial y la segunda el final; sin ellas, el texto solo. La duración no es un parámetro de la API: se
 * dice en el prompt (los tiempos marcados del guion de 10 s ya la dicen). El video se pide por dirección
 * (`delivery: "uri"`): en línea, uno de más de 4 MB no cabe.
 */
export function peticionOmni(modelo, { prompt, ajustes = {}, medios = {} }) {
  const segundos = Number(ajustes.duration) || 10;
  const texto = /\bsegundos?\b|\d+\s?s\b/.test(prompt) ? prompt : `${prompt}\n\nDuración total: ${segundos} segundos.`;
  const imagenes = [medios.start?.[0], medios.start?.[0] ? medios.end?.[0] : null].filter(Boolean);
  return {
    model: modelo.gid,
    input: imagenes.length
      ? [...imagenes.map((f) => ({ type: "image", data: f.base64, mime_type: f.mime })), { type: "text", text: texto }]
      : texto,
    response_format: {
      type: "video",
      aspect_ratio: ajustes.aspectRatio === "16:9" ? "16:9" : "9:16",
      resolution: ["360p", "720p", "1080p", "4k"].includes(ajustes.resolution) ? ajustes.resolution : "720p",
      delivery: "uri",
    },
  };
}

/**
 * El video de una interacción terminada: por REST va en `steps[]` (type "model_output") → `content[]` (type
 * "video"), con `uri` o `data`. → { uri } | { data, mime } | null. Pura.
 */
export function videoDeInteraccion(j) {
  for (const paso of Array.isArray(j?.steps) ? j.steps : []) {
    for (const c of Array.isArray(paso?.content) ? paso.content : []) {
      if (c?.type === "video" && (c.uri || c.data)) return c.uri ? { uri: String(c.uri), mime: c.mime_type || "video/mp4" } : { data: c.data, mime: c.mime_type || "video/mp4" };
    }
  }
  const v = j?.output_video;
  if (v?.uri || v?.data) return v.uri ? { uri: String(v.uri), mime: v.mime_type || "video/mp4" } : { data: v.data, mime: v.mime_type || "video/mp4" };
  return null;
}

/**
 * «files/abc» o la dirección completa → la de descarga del archivo (con la llave). Null si no
 * es https de Google: la llave sólo viaja a `*.googleapis.com`.
 */
export function descargaDeArchivoGemini(uri) {
  const u = String(uri ?? "");
  if (/^files\/[\w-]+$/.test(u)) return `${BASE_GEMINI}/${u}:download?alt=media`;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && (url.hostname === "googleapis.com" || url.hostname.endsWith(".googleapis.com")) ? url.toString() : null;
  } catch {
    return null;
  }
}

const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function pedirGoogle(env, url, opciones = {}, gid) {
  const res = await fetch(url, { ...opciones, headers: { "Content-Type": "application/json", "x-goog-api-key": env.GOOGLE_AI_KEY, ...(opciones.headers ?? {}) } })
    .catch(() => { throw new ErrorMotor("No se pudo contactar con Google AI", 502, { reintentable: true }); });
  const texto = await res.text().catch(() => "");
  if (!res.ok) throw errorDeGoogle(res.status, texto, gid);
  try { return JSON.parse(texto); } catch { throw new ErrorMotor("Google devolvió algo que no se entiende.", 502); }
}

/** Lo que dice una interacción en cada vuelta: listo (con el video), fallido o pendiente. */
function estadoDeOmni(env, modelo, j) {
  const video = videoDeInteraccion(j);
  if (video?.data) return { estado: "listo", bytes: deBase64(video.data), mime: video.mime };
  if (video?.uri) {
    const url = descargaDeArchivoGemini(video.uri);
    if (!url) return { estado: "fallido", error: `${modelo.nombre}: Google devolvió el video en una dirección que no es suya.` };
    return { estado: "listo", url, headers: { "x-goog-api-key": env.GOOGLE_AI_KEY }, mime: video.mime };
  }
  const estado = String(j?.status ?? j?.state ?? "").toLowerCase();
  if (/fail|error|cancel/.test(estado) || j?.error) {
    const motivo = j?.error?.message || j?.error || estado;
    return { estado: "fallido", error: `${modelo.nombre}: Google no pudo hacerlo (${String(motivo).slice(0, 180)}).` };
  }
  if (estado === "completed" || estado === "succeeded") return { estado: "fallido", error: `${modelo.nombre} terminó sin ningún video. Si la imagen lleva una persona reconocible, Omni no la acepta.` };
  return { estado: "pendiente", nota: "Generando en Google (Omni)…", cada: 8000 };
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

    // ---- Video: Omni, por la Interactions API; puede contestar ya con el video o seguir en marcha (se mira su id).
    //      Veo 3.1 iba por predictLongRunning y Google lo retiró (ver MODELOS_RETIRADOS en el catálogo).
    async enviar(env, { modelo, prompt, ajustes, medios }) {
      if (modelo.api !== "interactions") throw new ErrorMotor(`${modelo.nombre} no es un video que Google haga por esta vía.`, 400);
      const j = await pedirGoogle(env, `${BASE_GEMINI}/interactions`, { method: "POST", body: JSON.stringify(peticionOmni(modelo, { prompt, ajustes, medios })) }, modelo.gid);
      const ya = videoDeInteraccion(j);
      if (!j?.id && !ya?.uri) throw new ErrorMotor("Google no devolvió la interacción del video.", 502);
      // Sólo se guarda la DIRECCIÓN (el video en línea no cabe en la fila): con ella, el primer sondeo lo da por listo.
      return { id: String(j.id ?? `omni-${crypto.randomUUID()}`), cada: ya ? 1000 : 8000, datos: { api: "interactions", ...(ya?.uri ? { uri: ya.uri, mime: ya.mime } : {}) } };
    },
    async sondear(env, { modelo, item }) {
      if (item?.datos?.uri) return estadoDeOmni(env, modelo, { steps: [{ content: [{ type: "video", uri: item.datos.uri, mime_type: item.datos.mime }] }] });
      try {
        return estadoDeOmni(env, modelo, await pedirGoogle(env, `${BASE_GEMINI}/interactions/${encodeURIComponent(item.id)}`, {}, modelo.gid));
      } catch (e) {
        if (e instanceof ErrorMotor && !e.reintentable) return { estado: "fallido", error: e.message };
        throw e;
      }
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
    return new ErrorMotor(`Google AI no dejó usar «${gid}» con la clave del servidor${detalle ? `: ${detalle.slice(0, 200)}` : ""}. Los videos de Google exigen que el proyecto tenga facturación.`, 502);
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
