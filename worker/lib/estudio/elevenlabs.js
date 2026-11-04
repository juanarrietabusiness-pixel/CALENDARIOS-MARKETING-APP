// ============================================================
// ElevenLabs DIRECTO, con la llave oficial (`ELEVENLABS_API_KEY`, secreto del Worker)
//
// La voz del video animado iba sólo por Kie.ai, y en la primera prueba real Kie dejó las tomas de v3 «en espera» hasta
// cortarlas («The upstream API service timed out»). Con la llave oficial se le pide a ElevenLabs mismo:
//
//   Crear   POST https://api.elevenlabs.io/v1/text-to-speech/<voz>/with-timestamps?output_format=mp3_44100_128
//           { text, model_id: "eleven_v3" | "eleven_multilingual_v2", language_code?, voice_settings }
//           → { audio_base64, alignment: { characters, character_start_times_seconds, character_end_times_seconds },
//               normalized_alignment }
//   Voces   GET  https://api.elevenlabs.io/v1/voices → { voices: [{ voice_id, name, labels: { gender, accent… } }] }
//   Modelos GET  https://api.elevenlabs.io/v1/models → [{ model_id, model_rates: { character_cost_multiplier } }]
//           (gratis: dice si la cuenta tiene `eleven_v4` y cuánto cobra cada modelo por carácter)
//   Biblioteca  GET  /v1/shared-voices?language=es&… → { voices: [{ voice_id, public_owner_id, name, accent… }] }
//               POST /v1/voices/add/<public_owner_id>/<voice_id> { new_name } → { voice_id }  (gratis: ocupa un hueco
//               de voces de la cuenta; desde entonces sale en /v1/voices)
//
// Contesta EN EL ACTO (una toma de un video son segundos), pero va con el contrato de COLA del Estudio para no tocar
// nada de lo que ya funciona: `enviar` genera la toma y la deja en R2 bajo `voces/pendientes/` (fuera de `clientes/`:
// ninguna ruta de medios la sirve) con su alineación, y `sondear` la entrega en el paso siguiente. `terminarAudio`
// (locucion.js) la guarda donde toca y borra lo pendiente.
//
// LA LLAVE sólo viaja a api.elevenlabs.io en `xi-api-key` y no sale nunca en un error ni en una nota.
//
// LO QUE NO SE HA PROBADO CONTRA ELEVENLABS REAL: los tests hablan con un `fetch` de mentira con la forma de su
// documentación. Dos cosas se piden con tolerancia porque no se pueden comprobar sin gastar:
//   · `language_code: "es"` en v3: si ElevenLabs lo rechaza, se repite UNA vez sin él (un rechazo no cobra).
//   · `/with-timestamps` con v3: si lo rechaza, se repite sin tiempos por `/v1/text-to-speech/<voz>`: el audio llega
//     igual y los tiempos los pone la verificación posterior (Gemini) o la estimación, como con Kie.
// ============================================================

import { ErrorMotor } from "./gemini.js";
import { tipoPorBytes } from "./archivos.js";
import { uuid } from "../ids.js";
import { MODELOS_VOZ, vozDeLaCuenta, vozDeLaBiblioteca, enEspanolPrimero, previaDeVoz } from "../../../src/lib/voces.js";

const BASE = "https://api.elevenlabs.io";
const PLAZO_MS = 90_000;
/** Una toma de un video es corta: más de esto no es una locución (y el Worker la tiene en memoria). */
const TOPE_AUDIO = 20 * 1024 * 1024;
export const PREFIJO_PENDIENTES = "voces/pendientes/";

const clavePendiente = (id, ext) => `${PREFIJO_PENDIENTES}${id}.${ext}`;

/** El motivo de ElevenLabs en palabras (su error viene en `detail`, texto u objeto). Pura. */
export function motivoDeElevenLabs(j, texto = "") {
  const d = j?.detail ?? j?.error ?? j;
  const m = typeof d === "string" ? d : d?.message ?? d?.msg ?? (Array.isArray(d) ? d.map((x) => x?.msg).filter(Boolean).join("; ") : "");
  const estado = typeof d === "object" && d ? d.status ?? d.code ?? "" : "";
  return [estado, m || String(texto).slice(0, 160)].filter(Boolean).join(": ").slice(0, 240);
}

/** El rechazo de ElevenLabs según su estado, con lo que dijo. Pura. */
export function errorDeElevenLabs(estado, motivo = "") {
  const d = motivo ? ` (${motivo})` : "";
  // Sin créditos ElevenLabs contesta 401 con `quota_exceeded`: se mira ANTES que la llave.
  if (estado === 402 || /quota|credits?|insufficient/i.test(motivo)) {
    return new ErrorMotor(`La cuenta de ElevenLabs no tiene créditos suficientes${d}. Recárgala o sube de plan en elevenlabs.io.`, 502);
  }
  if (estado === 401) return new ErrorMotor(`ElevenLabs no aceptó la llave del servidor (ELEVENLABS_API_KEY)${d}.`, 502);
  if (estado === 404 || /voice_not_found|voice not found/i.test(motivo)) {
    return new ErrorMotor(`ElevenLabs no encontró esa voz en la cuenta${d}. Escoge otra de la lista o añádela a «My Voices» en elevenlabs.io.`, 502);
  }
  if (estado === 429) return new ErrorMotor(`ElevenLabs está ocupado o se pasó el límite de la cuenta${d}. Se reintenta solo.`, 429, { reintentable: true });
  if (estado >= 500) return new ErrorMotor(`ElevenLabs devolvió un error (${estado})${d}.`, 502, { reintentable: true });
  return new ErrorMotor(`ElevenLabs rechazó el pedido (${estado})${d}.`, 502);
}

async function llamar(env, ruta, { method = "GET", cuerpo, crudo = false } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method,
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, ...(cuerpo ? { "Content-Type": "application/json" } : {}), ...(crudo ? { Accept: "audio/mpeg" } : {}) },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      signal: AbortSignal.timeout(PLAZO_MS),
    });
  } catch {
    throw new ErrorMotor("No se pudo contactar con ElevenLabs.", 502, { reintentable: true });
  }
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    let j = null;
    try { j = JSON.parse(texto); } catch { /* no es JSON */ }
    throw errorDeElevenLabs(res.status, motivoDeElevenLabs(j, texto));
  }
  return res;
}

/** El cuerpo de la toma para ese modelo (v4 y v3 con el idioma forzado si se pide). Pura. */
export function cuerpoDeToma(modelo, { prompt, ajustes = {} }, { conIdioma = true } = {}) {
  const m = MODELOS_VOZ[modelo.clave] ?? Object.values(MODELOS_VOZ).find((x) => x.idDirecto === modelo.id);
  const estabilidad = Number(ajustes.estabilidad ?? 0.5);
  return {
    text: String(prompt ?? ""),
    model_id: m?.elevenlabs ?? modelo.elevenlabs,
    ...(conIdioma && (m?.clave === "v3" || m?.clave === "v4") ? { language_code: "es" } : {}),
    voice_settings: { stability: Number.isFinite(estabilidad) ? estabilidad : 0.5, similarity_boost: 0.75 },
  };
}

/** Base64 → bytes (atob existe en el Worker y en Node). */
function deBase64(b64) {
  const bin = atob(String(b64 ?? ""));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

const rechazaIdioma = (e) => e instanceof ErrorMotor && !e.reintentable && /language/i.test(e.message);
const rechazoDeDatos = (e) => e instanceof ErrorMotor && !e.reintentable && /rechazó el pedido/.test(e.message);

/**
 * La toma: con tiempos (y el idioma en v3); si ElevenLabs rechaza el idioma, otra vez sin él; si rechaza los tiempos,
 * sin ellos. → { bytes, mime, alineacion | null, intentos: ["…"] }.
 */
export async function generarToma(env, modelo, { prompt, ajustes = {} }) {
  const voz = encodeURIComponent(String(ajustes.voz ?? ""));
  if (!voz) throw new ErrorMotor("Falta la voz de la toma.", 400);
  const conTiempos = async (conIdioma) => {
    const res = await llamar(env, `/v1/text-to-speech/${voz}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST", cuerpo: cuerpoDeToma(modelo, { prompt, ajustes }, { conIdioma }),
    });
    const j = await res.json().catch(() => null);
    if (!j?.audio_base64) throw new ErrorMotor("ElevenLabs no devolvió el audio de la toma.", 502, { reintentable: true });
    return { bytes: deBase64(j.audio_base64), alineacion: { alignment: j.alignment ?? null, normalized_alignment: j.normalized_alignment ?? null } };
  };
  const sinTiempos = async () => {
    const res = await llamar(env, `/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
      method: "POST", cuerpo: cuerpoDeToma(modelo, { prompt, ajustes }, { conIdioma: false }), crudo: true,
    });
    return { bytes: new Uint8Array(await res.arrayBuffer()), alineacion: null };
  };

  const notas = [];
  let toma;
  try {
    toma = await conTiempos(true);
  } catch (e) {
    if (rechazaIdioma(e)) {
      notas.push("ElevenLabs no aceptó forzar el español: se pidió sin language_code.");
      try {
        toma = await conTiempos(false);
      } catch (e2) {
        if (!rechazoDeDatos(e2)) throw e2;
        notas.push("ElevenLabs no dio los tiempos con este modelo: se pidió el audio solo.");
        toma = await sinTiempos();
      }
    } else if (rechazoDeDatos(e)) {
      notas.push("ElevenLabs no dio los tiempos con este modelo: se pidió el audio solo.");
      toma = await sinTiempos();
    } else {
      throw e;
    }
  }
  if (!toma.bytes.byteLength) throw new ErrorMotor("ElevenLabs devolvió un audio vacío.", 502, { reintentable: true });
  if (toma.bytes.byteLength > TOPE_AUDIO) throw new ErrorMotor("ElevenLabs devolvió un audio demasiado grande para una locución.", 502);
  const mime = tipoPorBytes(toma.bytes);
  if (mime !== "audio/mpeg" && mime !== "audio/wav") throw new ErrorMotor("Lo que devolvió ElevenLabs no es un audio.", 502);
  return { ...toma, mime, notas };
}

/**
 * Las voces de la CUENTA (las de serie y las que se añadieron a «My Voices», también las de la biblioteca en español).
 * Null si la llave no deja leerlas (permiso de leer voces): entonces valen las de serie (`VOCES_ELEVENLABS`).
 */
export async function vocesDeLaCuenta(env) {
  try {
    const res = await llamar(env, "/v1/voices");
    const j = await res.json().catch(() => null);
    const voces = enEspanolPrimero((Array.isArray(j?.voices) ? j.voices : []).map(vozDeLaCuenta).filter(Boolean)).slice(0, 80);
    return voces.length ? voces : null;
  } catch (e) {
    console.warn("elevenlabs: no se pudo leer la lista de voces", e?.message);
    return null;
  }
}

/**
 * Los modelos de la CUENTA (`/v1/models`, gratis): → { ids: Set<model_id>, factores: { model_id: multiplicador } } o null
 * si no se pudo saber. Se recuerda 10 minutos por instancia: lo preguntan la lista de voces y cada pedido.
 */
let modelosRecordados = null;
const RECORDAR_MODELOS_MS = 10 * 60_000;
export async function modelosDeLaCuenta(env, { ahora = Date.now() } = {}) {
  if (modelosRecordados && modelosRecordados.llave === env.ELEVENLABS_API_KEY && ahora - modelosRecordados.at < RECORDAR_MODELOS_MS) {
    return modelosRecordados.valor;
  }
  try {
    const res = await llamar(env, "/v1/models");
    const j = await res.json().catch(() => null);
    const lista = Array.isArray(j) ? j : Array.isArray(j?.models) ? j.models : [];
    const ids = new Set();
    const factores = {};
    for (const m of lista) {
      const id = String(m?.model_id ?? "");
      if (!id || m?.can_do_text_to_speech === false) continue;
      ids.add(id);
      const f = Number(m?.model_rates?.character_cost_multiplier ?? m?.token_cost_factor);
      if (Number.isFinite(f) && f > 0) factores[id] = f;
    }
    const valor = ids.size ? { ids, factores } : null;
    modelosRecordados = { llave: env.ELEVENLABS_API_KEY, at: ahora, valor };
    return valor;
  } catch (e) {
    console.warn("elevenlabs: no se pudo leer la lista de modelos", e?.message);
    return null;
  }
}
/** Para las pruebas: olvidar lo recordado. */
export const olvidarModelos = () => { modelosRecordados = null; };

/** Los acentos de las voces en español que se pueden buscar en la biblioteca (su valor en ElevenLabs → en pantalla). */
export const ACENTOS_BIBLIOTECA = Object.freeze({
  "latin american": "Latinoamericano", mexican: "Mexicano", colombian: "Colombiano", argentine: "Argentino",
  venezuelan: "Venezolano", chilean: "Chileno", peruvian: "Peruano", caribbean: "Caribeño", peninsular: "España",
});

/**
 * Busca voces en ESPAÑOL en la biblioteca de ElevenLabs (gratis). Sin las que cobran una tarifa propia
 * (`include_custom_rates=false`): costarían más que lo que dice la confirmación. → { voces, mas }.
 */
export async function buscarEnBiblioteca(env, { q = "", genero = "", acento = "", pagina = 0 } = {}) {
  const p = new URLSearchParams({ page_size: "24", language: "es", include_custom_rates: "false", sort: "trending" });
  const busqueda = String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (busqueda) p.set("search", busqueda);
  if (["female", "male", "neutral"].includes(genero)) p.set("gender", genero);
  if (Object.hasOwn(ACENTOS_BIBLIOTECA, acento)) p.set("accent", acento);
  const n = Math.max(0, Math.min(20, Math.floor(Number(pagina) || 0)));
  if (n) p.set("page", String(n));
  const res = await llamar(env, `/v1/shared-voices?${p}`);
  const j = await res.json().catch(() => null);
  const voces = (Array.isArray(j?.voices) ? j.voices : [])
    .map((v) => vozDeLaBiblioteca({ ...v, labels: { ...(v?.labels ?? {}), language: v?.language ?? v?.labels?.language ?? "es" } }))
    .filter(Boolean);
  return { voces: enEspanolPrimero(voces), mas: Boolean(j?.has_more) };
}

/** Añade una voz de la biblioteca a la cuenta («My Voices»). → el id con el que queda. */
export async function anadirDeLaBiblioteca(env, { publico, voz, nombre }) {
  if (!/^[A-Za-z0-9]{8,80}$/.test(String(publico ?? "")) || !/^[A-Za-z0-9]{12,40}$/.test(String(voz ?? ""))) {
    throw new ErrorMotor("Esa voz de la biblioteca no tiene un id válido.", 400);
  }
  const nuevo = String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Voz en español";
  const res = await llamar(env, `/v1/voices/add/${encodeURIComponent(publico)}/${encodeURIComponent(voz)}`, { method: "POST", cuerpo: { new_name: nuevo } });
  const j = await res.json().catch(() => null);
  return String(j?.voice_id ?? voz);
}

/** Lo más que pesa la muestra gratis de una voz (unos segundos de MP3). */
const TOPE_PREVIA = 3 * 1024 * 1024;

/**
 * La muestra GRATIS de una voz que publica ElevenLabs (`preview_url`), servida desde aquí: la CSP no deja oír audio de
 * otro origen, y así tampoco sale al navegador ninguna llave (no lleva). Sólo de sus almacenes (`previaDeVoz`). → Response.
 */
export async function previaGratis(url) {
  const limpia = previaDeVoz(url);
  if (!limpia) throw new ErrorMotor("Esa muestra no es de ElevenLabs.", 400);
  let res;
  try {
    res = await fetch(limpia, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ErrorMotor("No se pudo traer la muestra de ElevenLabs.", 502);
  }
  if (!res.ok) throw new ErrorMotor(`ElevenLabs no dio la muestra (${res.status}).`, 502);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > TOPE_PREVIA) throw new ErrorMotor("La muestra de ElevenLabs no es válida.", 502);
  const mime = tipoPorBytes(bytes);
  if (mime !== "audio/mpeg" && mime !== "audio/wav") throw new ErrorMotor("Lo que dio ElevenLabs no es un audio.", 502);
  return new Response(bytes, { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

export const MOTOR_ELEVENLABS = {
  nombre: "ElevenLabs",
  llave: "ELEVENLABS_API_KEY",
  activo: (env) => Boolean(env?.ELEVENLABS_API_KEY),

  /** Genera la toma y la deja pendiente en R2: el paso siguiente la entrega. */
  async enviar(env, { modelo, prompt, ajustes = {} }) {
    const toma = await generarToma(env, modelo, { prompt, ajustes });
    const id = uuid();
    await env.MEDIA.put(clavePendiente(id, "audio"), toma.bytes, { httpMetadata: { contentType: toma.mime } });
    await env.MEDIA.put(clavePendiente(id, "json"), JSON.stringify({ alineacion: toma.alineacion, notas: toma.notas, mime: toma.mime }), {
      httpMetadata: { contentType: "application/json" },
    });
    return { id, cada: 500 };
  },

  async sondear(env, { item }) {
    const id = String(item?.id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return { estado: "fallido", error: "La toma de ElevenLabs no tiene un id válido." };
    const [audio, datos] = await Promise.all([env.MEDIA.get(clavePendiente(id, "audio")), env.MEDIA.get(clavePendiente(id, "json"))]);
    if (!audio) return { estado: "fallido", error: "La toma de ElevenLabs se perdió antes de guardarla. Vuelve a pedirla." };
    let extra = {};
    try { extra = datos ? JSON.parse(new TextDecoder().decode(await datos.arrayBuffer())) : {}; } catch { extra = {}; }
    const bytes = new Uint8Array(await audio.arrayBuffer());
    return {
      estado: "listo", bytes, mime: extra.mime ?? audio.httpMetadata?.contentType ?? "audio/mpeg",
      resultado: extra.alineacion ?? null, notas: Array.isArray(extra.notas) ? extra.notas : [],
      pendientes: [clavePendiente(id, "audio"), clavePendiente(id, "json")],
    };
  },
};
