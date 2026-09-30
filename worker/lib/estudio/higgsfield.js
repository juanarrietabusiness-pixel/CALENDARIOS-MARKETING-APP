// ============================================================
// Higgsfield como motor del Estudio
//
//   POST https://api.higgsfield.ai/<ruta>          → { request_id, status_url, cancel_url }
//   GET  <status_url>                              → queued | in_progress | completed | failed | nsfw | canceled
//                                                    completed trae `images[].url` o `video.url`
//   POST /files/generate-upload-url { content_type } + PUT     las imágenes de apoyo van a SU almacén
//
// Auth: `Authorization: Key <id>:<secreto>` (`HF_KEY`, o `HF_API_KEY` + `HF_API_SECRET`).
//
// TODO SALE DE SU DOCUMENTACIÓN. `higgsfield-schemas.json` dice, ruta por ruta, qué campos hay, qué valores
// admiten y cuáles son obligatorios. De ahí salen a qué ruta va un pedido (según las imágenes que lleve) y el
// cuerpo: sólo campos de esa ruta, cada valor uno que acepta; lo que no encaja se deja fuera y manda el valor
// por defecto de la ruta. El catálogo (src/lib/estudioHiggsfield.json) sale del mismo esquema
// (scripts/estudio/generar-higgsfield.mjs), así que la pantalla nunca ofrece lo que aquí se rechazaría.
//
// Higgsfield sólo contesta por COLA, también las imágenes: van por `enviar` + `sondear` como un video.
//
// NO SE HA PROBADO CONTRA EL SERVICIO REAL: no hay llave en el desarrollo. Los tests recorren todas las
// combinaciones contra el esquema y el motor contra un `fetch` de mentira. Lo primero que ha de hacerse con una
// llave es un pedido barato (Z-Image Turbo) y uno de video corto.
// ============================================================

import ESQUEMAS_JSON from "./higgsfield-schemas.json";
import { ErrorMotor } from "./gemini.js";
import { direccionValida } from "./descarga.js";

const ESQUEMAS = ESQUEMAS_JSON.endpoints;
const PLAZO_MS = 120_000;
const RUTA_VALIDA = /^[a-z0-9][a-z0-9._/-]*$/i;

const BASE = (env) => (env.HF_API_BASE_URL || "https://api.higgsfield.ai").replace(/\/$/, "");
export const llaveHiggsfield = (env) => env?.HF_KEY || (env?.HF_API_KEY && env?.HF_API_SECRET ? `${env.HF_API_KEY}:${env.HF_API_SECRET}` : "");

/** Ajuste del catálogo → campo del esquema. Los demás campos (semillas, estilos, audio…) los decide la ruta. */
const CAMPO_DE = { aspectRatio: "aspect_ratio", resolution: "resolution", duration: "duration", mode: "mode", quality: "quality", renderingSpeed: "rendering_speed" };
const ORDEN = ["firstLast", "image", "edit", "videoRef", "reference", "text"]; // en qué orden se prueba una ruta
const CAMPOS_DE_MEDIO = ["first_frame_url", "last_frame_url", "end_image_url", "last_image_url", "image_url", "image_urls", "image_reference_url", "video_url", "video_urls"];
const DE_INICIO = ["first_frame_url", "image_url"];
const DE_FINAL = ["last_frame_url", "end_image_url", "last_image_url"];

const tipoDe = (modelo) => (modelo.tipo === "video" ? "video" : "image");

/** Qué papel cumple un campo de medio en este tipo de modelo. */
function papelDe(tipo, campo) {
  if (campo === "first_frame_url" || (campo === "image_url" && tipo === "video")) return "start";
  if (DE_FINAL.includes(campo)) return "end";
  if (campo === "video_url" || campo === "video_urls") return "video";
  return "reference";
}

/** Los campos donde cabe una imagen de cada papel. */
function ranuras(tipo, papel) {
  if (papel === "start") return DE_INICIO;
  if (papel === "end") return DE_FINAL;
  return tipo === "image" ? ["image_urls", "image_url", "image_reference_url"] : ["image_urls"];
}

const admite = (tipo, eid, papel) => ranuras(tipo, papel).some((c) => ESQUEMAS[eid]?.p[c]);

/**
 * La ruta a la que va un pedido, según las imágenes que lleve ({ start, end, reference }: cuántas de cada una).
 * Lanza, en palabras, si el modelo no admite esa combinación.
 */
export function rutaDe(modelo, cuantas = {}) {
  const tipo = tipoDe(modelo);
  const hay = Object.entries(cuantas).filter(([, n]) => n > 0).map(([papel]) => papel);
  const sirve = (eid) => {
    const sc = ESQUEMAS[eid];
    if (!sc) return false;
    if (hay.some((papel) => !admite(tipo, eid, papel))) return false;
    // Lo que la ruta exige, tiene que estar.
    return sc.req.filter((c) => CAMPOS_DE_MEDIO.includes(c)).every((c) => hay.includes(papelDe(tipo, c)));
  };
  const rutas = ORDEN.filter((k) => modelo.rutas[k]).map((k) => modelo.rutas[k]);
  const elegida = (!hay.length && modelo.rutas.text && sirve(modelo.rutas.text)) ? modelo.rutas.text : rutas.find(sirve);
  if (elegida) return elegida;
  throw new ErrorMotor(
    hay.length
      ? `${modelo.nombre} no admite esa combinación de imágenes.`
      : `${modelo.nombre} no crea desde texto solo: necesita una imagen.`,
    400,
  );
}

/** El cuerpo para esa ruta: sólo sus campos, cada valor uno que acepta. `urls` = { start: [], end: [], reference: [] }. */
export function cuerpoDe(modelo, eid, { prompt, ajustes = {}, urls = {} }) {
  const tipo = tipoDe(modelo);
  const P = ESQUEMAS[eid].p;
  const cuerpo = {};
  if (P.prompt) cuerpo.prompt = prompt;
  const poner = (campos, valor) => {
    const c = campos.find((x) => P[x]);
    if (!c) return;
    cuerpo[c] = /_urls$/.test(c) ? [].concat(valor).slice(0, P[c].maxItems || 99) : [].concat(valor)[0];
  };
  if (urls.start?.[0]) poner(DE_INICIO, urls.start[0]);
  if (urls.end?.[0]) poner(DE_FINAL, urls.end[0]);
  if (urls.reference?.length) poner(ranuras(tipo, "reference"), urls.reference);

  for (const [clave, campo] of Object.entries(CAMPO_DE)) {
    const f = P[campo];
    const dado = ajustes[clave];
    if (!f || dado === undefined || dado === null || dado === "") continue;
    let v = dado;
    if (f.t === "integer" || f.t === "number") {
      v = Number(v);
      if (!Number.isFinite(v)) continue;
      // 7 s en una ruta de 5 | 10 → el más cercano que admite.
      if (f.e) v = f.e.reduce((mejor, x) => (Math.abs(x - v) < Math.abs(mejor - v) ? x : mejor), f.e[0]);
      if (f.min !== undefined) v = Math.max(f.min, v);
      if (f.max !== undefined) v = Math.min(f.max, v);
      if (f.t === "integer") v = Math.round(v);
    } else {
      v = String(v);
      if (f.e && !f.e.includes(v)) continue; // un valor que esta ruta no tiene: manda el suyo por defecto
    }
    cuerpo[campo] = v;
  }
  // Un campo obligatorio va siempre (la duración de LTX, por ejemplo).
  for (const r of ESQUEMAS[eid].req) {
    if (cuerpo[r] === undefined && (P[r].d !== undefined || P[r].e)) cuerpo[r] = P[r].d !== undefined ? P[r].d : P[r].e[0];
  }
  return cuerpo;
}

/** El pedido completo: { ruta, cuerpo }. Pura. */
export function pedidoHiggsfield(modelo, { prompt, ajustes, urls = {} }) {
  const ruta = rutaDe(modelo, { start: urls.start?.length ?? 0, end: urls.end?.length ?? 0, reference: urls.reference?.length ?? 0 });
  if (!RUTA_VALIDA.test(ruta) || ruta.includes("..")) throw new ErrorMotor("Ruta de modelo no válida.", 500);
  return { ruta, cuerpo: cuerpoDe(modelo, ruta, { prompt, ajustes, urls }) };
}

/** Comprobación antes de crear el trabajo: ¿tiene ruta este pedido? Devuelve el motivo, o null. */
export function validarHiggsfield(modelo, pedido) {
  try {
    rutaDe(modelo, {
      start: pedido.medios?.start?.length ?? 0, end: pedido.medios?.end?.length ?? 0, reference: pedido.medios?.reference?.length ?? 0,
    });
    return null;
  } catch (e) {
    return e.message;
  }
}

/** El rechazo de Higgsfield en palabras. */
export function errorDeHiggsfield(estado, texto) {
  let detalle = "";
  try {
    const j = JSON.parse(texto);
    detalle = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((d) => d?.msg).filter(Boolean).join("; ") : j.error?.message || j.message || (typeof j.error === "string" ? j.error : "");
  } catch { /* no es JSON */ }
  const d = detalle ? `: ${String(detalle).slice(0, 200)}` : "";
  if (estado === 401) return new ErrorMotor("Higgsfield no aceptó la llave del servidor (HF_KEY).", 502);
  if (estado === 403) return new ErrorMotor("Higgsfield no dejó hacer el pedido: no hay créditos suficientes en la cuenta.", 502);
  if (estado === 404) return new ErrorMotor(`Higgsfield no tiene ese modelo${d}.`, 502);
  if (estado === 400 || estado === 422) return new ErrorMotor(`Higgsfield rechazó el pedido${d || " (datos no válidos)"}.`, 502);
  if (estado === 429) return new ErrorMotor("Higgsfield está saturado. Inténtalo en unos segundos.", 429, { reintentable: true });
  return new ErrorMotor(`Higgsfield devolvió un error (${estado})${d || "."}`, 502, { reintentable: estado >= 500 });
}

async function llamar(env, url, opciones = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...opciones,
      headers: { Authorization: `Key ${llaveHiggsfield(env)}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
      signal: AbortSignal.timeout(PLAZO_MS),
    });
  } catch {
    throw new ErrorMotor("No se pudo contactar con Higgsfield", 502, { reintentable: true });
  }
  const texto = await res.text().catch(() => "");
  if (!res.ok) throw errorDeHiggsfield(res.status, texto);
  try { return JSON.parse(texto); } catch { throw new ErrorMotor("Higgsfield devolvió algo que no se entiende.", 502); }
}

/** Sube una imagen al almacén de Higgsfield y devuelve su dirección pública. */
async function subir(env, f) {
  const up = await llamar(env, `${BASE(env)}/files/generate-upload-url`, { method: "POST", body: JSON.stringify({ content_type: f.mime }) });
  if (!direccionValida(up?.upload_url) || !direccionValida(up?.public_url)) throw new ErrorMotor("Higgsfield no devolvió dónde subir la imagen de referencia.", 502);
  let res;
  try {
    // Esta dirección ya lleva su permiso: la llave de Higgsfield no viaja a ese almacén.
    res = await fetch(up.upload_url, { method: "PUT", headers: up.upload_headers || { "Content-Type": f.mime }, body: f.bytes, signal: AbortSignal.timeout(PLAZO_MS) });
  } catch {
    throw new ErrorMotor("No se pudo subir la imagen de referencia a Higgsfield.", 502, { reintentable: true });
  }
  if (!res.ok) throw new ErrorMotor(`Higgsfield no aceptó la imagen de referencia (${res.status}).`, 502, { reintentable: res.status >= 500 });
  return up.public_url;
}

/** ¿Una dirección del propio Higgsfield? La llave sólo viaja a ese origen. */
export function esDeHiggsfield(env, url) {
  try { return new URL(url).origin === new URL(BASE(env)).origin; } catch { return false; }
}

export const MOTOR_HIGGSFIELD = {
  nombre: "Higgsfield",
  llave: "HF_KEY",
  activo: (env) => Boolean(llaveHiggsfield(env)),
  validar: validarHiggsfield,

  async enviar(env, { modelo, prompt, ajustes, medios = {} }) {
    const urls = { start: [], end: [], reference: [] };
    for (const papel of Object.keys(urls)) for (const f of medios[papel] ?? []) urls[papel].push(await subir(env, f));
    const { ruta, cuerpo } = pedidoHiggsfield(modelo, { prompt, ajustes, urls });
    const j = await llamar(env, `${BASE(env)}/${ruta}`, { method: "POST", body: JSON.stringify(cuerpo) });
    if (!j?.request_id) throw new ErrorMotor("Higgsfield no devolvió el número del pedido.", 502);
    const estado = esDeHiggsfield(env, j.status_url) ? j.status_url : `${BASE(env)}/requests/${encodeURIComponent(j.request_id)}/status`;
    return { id: j.request_id, cada: 5000, datos: { estado } };
  },

  async sondear(env, { modelo, item }) {
    const estado = item?.datos?.estado;
    if (!esDeHiggsfield(env, estado)) return { estado: "fallido", error: `${modelo.nombre}: falta la dirección para seguir el pedido. Vuelve a intentarlo.` };
    let s;
    try {
      s = await llamar(env, estado);
    } catch (e) {
      // Un 4xx al mirar no se reintenta: el pedido no existe o la llave dejó de valer.
      if (e instanceof ErrorMotor && !e.reintentable) return { estado: "fallido", error: e.message };
      throw e;
    }
    if (s.status === "queued") return { estado: "pendiente", nota: "En cola en Higgsfield", cada: 5000 };
    if (s.status === "in_progress") return { estado: "pendiente", nota: "Generando en Higgsfield…", cada: 5000 };
    if (s.status === "nsfw") return { estado: "fallido", error: "Higgsfield lo bloqueó por contenido (NSFW). Cambia el prompt." };
    if (s.status === "failed" || s.status === "canceled") {
      const motivo = typeof s.error === "string" ? s.error : s.error ? JSON.stringify(s.error) : s.status;
      return { estado: "fallido", error: `${modelo.nombre}: Higgsfield ${s.status === "canceled" ? "canceló el pedido" : "no pudo hacerlo"} (${String(motivo).slice(0, 180)}).` };
    }
    if (s.status !== "completed") return { estado: "pendiente", nota: `Higgsfield: ${String(s.status ?? "en espera")}`, cada: 5000 };
    // Cada modelo entrega lo suyo: un video no se confunde con una vista previa que traiga la respuesta.
    const url = modelo.tipo === "video" ? (s.video?.url ?? s.videos?.[0]?.url ?? null) : (s.images?.[0]?.url ?? null);
    if (!url) return { estado: "fallido", error: `${modelo.nombre}: Higgsfield terminó sin ningún archivo.` };
    return { estado: "listo", url };
  },
};
