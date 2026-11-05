// ============================================================
// La MÚSICA de fondo generada con SUNO por Kie.ai (puro: lo leen el Worker, la cola del Estudio y la pantalla)
//
// La forma sale de la documentación de Kie (docs/kie/suno.md, el extracto que entregó la agencia el 4-11-2026), NO de
// probarla. Todo Suno va por el MISMO `POST /api/v1/jobs/createTask` con `model: "ai-music-api/<operación>"`; aquí
// sólo se usa `generate`, en MODO PERSONALIZADO (`custom_mode: true`), que es el único que admite la duración y el
// título. En ese modo `prompt` se canta TAL CUAL como letra: por eso la descripción de la música va en `style` y la
// letra (sólo si no es instrumental) en `lyrics`.
//
// Cada pedido devuelve normalmente DOS versiones: las dos se guardan en la galería del cliente y la primera queda
// puesta en el video (la otra se escoge en «Sonido»). Los archivos de Kie caducan a los 14 días: se bajan a R2 al
// entregarlos.
//
// EL COSTO: la documentación no lo dice. Se cotiza un estimado (`CREDITOS_SUNO`) y, al entregarla, se apunta lo que
// Kie dice que cobró (`creditsConsumed`) si lo trae. Se confirma SIEMPRE, como la voz.
// ============================================================

import { USD_POR_CREDITO } from "./voces.js";

/** Los modelos de Suno que NO están descontinuados (V4–V5.5 lo están). `id` es el del trabajo del Estudio. */
export const MODELOS_MUSICA = Object.freeze({
  v6: { id: "suno-v6-kie", suno: "V6", clave: "v6", nombre: "Suno V6", nota: "La más expresiva, voces naturales" },
  mini: { id: "suno-v6-mini-kie", suno: "V6_MINI", clave: "mini", nombre: "Suno V6 Mini", nota: "Más ligera y rápida" },
  wild: { id: "suno-v6-wild-kie", suno: "V6_WILD", clave: "wild", nombre: "Suno V6 Wild", nota: "Más audaz y experimental" },
});
export const MODELO_MUSICA_POR_DEFECTO = "v6";

/** El modelo de la galería de una música generada (`musicasDe` reconoce todo lo que empieza por «musica»). */
export const MODELO_MUSICA_GENERADA = "musica-suno";

/** Lo que se puede pedir (s) y los topes de texto de V6. */
export const DURACION_MUSICA = Object.freeze({ min: 10, max: 360, porDefecto: 30 });
export const TOPES_MUSICA = Object.freeze({ estilo: 1000, letra: 5000, titulo: 80, evitar: 200 });

/**
 * Créditos de Kie por pedido (las dos versiones juntas), ESTIMADO: la documentación no da el precio. Se rotula
 * «aproximado» y, al entregar, se apunta lo que Kie diga que cobró.
 */
export const CREDITOS_SUNO = 12;

/** Lo que se le dice a Suno que evite en una instrumental (en modo personalizado `instrumental` no siempre basta). */
const SIN_VOZ = "vocals, singing, voice, lyrics, spoken word";

const limpio = (s, tope) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, tope);

/** El modelo por su clave («v6») o por su id del Estudio. */
export const modeloDeMusica = (valor) =>
  (valor ? MODELOS_MUSICA[valor] ?? Object.values(MODELOS_MUSICA).find((m) => m.id === valor) : null) ?? null;

/**
 * El modelo como lo ve la cola del Estudio (worker/lib/estudio/trabajos.js): Kie, tipo «audio», por la cola, con
 * `musica: true` para que la entregue su propio módulo. Pura.
 */
export function modeloDelEstudio(id) {
  const m = Object.values(MODELOS_MUSICA).find((x) => x.id === id);
  return m ? { id, clave: m.clave, suno: m.suno, nombre: m.nombre, motor: "kie", tipo: "audio", musica: true, cola: true, costo: 0.001, estimado: true } : null;
}

/** El costo cotizado de un pedido (dos versiones). → { creditos, usd, unidad }. Pura. */
export function costoDeMusica() {
  return { creditos: CREDITOS_SUNO, usd: Math.ceil(CREDITOS_SUNO * USD_POR_CREDITO * 1000) / 1000, unidad: "créditos de Kie" };
}

/** Lo que Kie dice que cobró (`creditsConsumed`), en dólares; null si no lo trae. Pura. */
export function costoCobrado(data) {
  const c = Number(data?.creditsConsumed ?? data?.credits_consumed);
  return Number.isFinite(c) && c > 0 ? Math.ceil(c * USD_POR_CREDITO * 1000) / 1000 : null;
}

/**
 * El pedido limpio: estilo (qué música: género, instrumentos, ánimo, tempo), letra (sólo si no es instrumental),
 * instrumental (por defecto sí), duración (10–360 s), título, lo que hay que evitar y el modelo. → { pedido } o
 * { error } con lo que falta. Pura.
 */
export function limpiarPedidoMusica(p = {}) {
  const instrumental = p.instrumental !== false;
  const estilo = limpio(p.estilo, TOPES_MUSICA.estilo);
  const letra = instrumental ? "" : String(p.letra ?? "").trim().slice(0, TOPES_MUSICA.letra);
  const m = modeloDeMusica(p.modelo || MODELO_MUSICA_POR_DEFECTO);
  if (!m) return { error: "Ese modelo de música no existe: v6, mini o wild." };
  if (!estilo) return { error: "Di qué música quieres: el género, los instrumentos, el ánimo y el tempo (p. ej. «acústica alegre con ukelele, 100 bpm»)." };
  if (!instrumental && !letra) return { error: "Con voz cantada, escribe la letra (o pídela instrumental)." };
  const d = Number(p.duracion);
  if (p.duracion !== undefined && p.duracion !== null && p.duracion !== "" && !Number.isFinite(d)) return { error: "La duración es un número de segundos." };
  const duracion = Math.round(Math.max(DURACION_MUSICA.min, Math.min(DURACION_MUSICA.max, Number.isFinite(d) && d > 0 ? d : DURACION_MUSICA.porDefecto)));
  const titulo = limpio(p.titulo, TOPES_MUSICA.titulo) || limpio(estilo.split(/[,.;]/)[0], TOPES_MUSICA.titulo) || "Música de fondo";
  const evitar = limpio(p.evitar, TOPES_MUSICA.evitar);
  return { pedido: { modelo: m.clave, estilo, letra, instrumental, duracion, titulo, evitar } };
}

/** La duración de la música para un video: lo que dura (redondeado hacia arriba), entre 10 y 360 s. Pura. */
export const duracionParaVideo = (segundos) =>
  Math.max(DURACION_MUSICA.min, Math.min(DURACION_MUSICA.max, Math.ceil(Number(segundos) || DURACION_MUSICA.porDefecto)));

/**
 * El cuerpo de `createTask` (sin `callBackUrl`: lo sigue la cola preguntando). Modo personalizado: título obligatorio y
 * el estilo; la letra en `lyrics`; en una instrumental, ni letra ni `prompt` y las voces en `negative_tags`. Pura.
 */
export function cuerpoSuno(pedido) {
  const m = modeloDeMusica(pedido.modelo) ?? MODELOS_MUSICA[MODELO_MUSICA_POR_DEFECTO];
  const evitar = [pedido.evitar, pedido.instrumental ? SIN_VOZ : ""].filter(Boolean).join(", ").slice(0, TOPES_MUSICA.evitar);
  return {
    model: "ai-music-api/generate",
    input: {
      custom_mode: true,
      instrumental: pedido.instrumental !== false,
      model: m.suno,
      style: pedido.instrumental !== false ? `${pedido.estilo}. Instrumental, no vocals.`.slice(0, TOPES_MUSICA.estilo) : pedido.estilo,
      title: pedido.titulo,
      duration: pedido.duracion,
      ...(evitar ? { negative_tags: evitar } : {}),
      ...(pedido.instrumental === false && pedido.letra ? { lyrics: pedido.letra } : {}),
    },
  };
}

/** Lee un texto JSON (o devuelve el objeto tal cual). */
const json = (x) => { if (typeof x !== "string") return x ?? null; try { return JSON.parse(x); } catch { return null; } };

/**
 * Las pistas que entregó Suno, leídas con tolerancia: `data.response.data[]` (recordInfo), `resultJson` (texto JSON,
 * con `data[]` o `resultUrls`) o el sobre del callback. Sólo direcciones https. → [{ url, id, duracion, titulo, imagen }].
 * Pura.
 */
export function pistasDeSuno(data = {}) {
  const fuentes = [data?.response, json(data?.resultJson), data?.data, data];
  for (const f of fuentes) {
    const lista = Array.isArray(f?.data) ? f.data : Array.isArray(f?.sunoData) ? f.sunoData : Array.isArray(f) ? f : null;
    if (lista?.length) {
      const pistas = lista.map((p) => ({
        url: String(p?.audio_url ?? p?.audioUrl ?? p?.source_audio_url ?? ""),
        id: String(p?.id ?? p?.audio_id ?? ""),
        duracion: Number(p?.duration) || 0,
        titulo: limpio(p?.title, 80),
        imagen: String(p?.image_url ?? p?.imageUrl ?? ""),
      })).filter((p) => /^https:\/\//.test(p.url));
      if (pistas.length) return pistas;
    }
    const urls = f?.resultUrls ?? f?.result_urls;
    if (Array.isArray(urls)) {
      const pistas = urls.map(String).filter((u) => /^https:\/\//.test(u)).map((url) => ({ url, id: "", duracion: 0, titulo: "", imagen: "" }));
      if (pistas.length) return pistas;
    }
  }
  return [];
}

/**
 * El volumen de la música de un guion (0–1, 0,35 por defecto) en los dB que usa la mezcla (0 dB a 0,35; ±12). Pura.
 */
export const dbDeVolumenGuion = (v) => {
  const n = Number(v);
  if (!(n > 0)) return -12;
  return Math.max(-12, Math.min(12, Math.round(20 * Math.log10(n / 0.35))));
};
