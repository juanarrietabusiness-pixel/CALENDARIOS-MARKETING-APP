// ============================================================
// Lo que Claude VE de una pieza del Estudio por MCP (y el asistente por sus herramientas de servidor)
//
// El Worker no tiene lienzo; el Container del video animado sí (worker/contenedor.js, container/servidor.mjs →
// POST /miniatura). Una pieza de 2K en PNG pesa de 4 a 8 MB: mandarla entera en el resultado de una herramienta gasta
// tokens y puede pasarse del tope de imagen de quien la recibe. Por eso va una COPIA reducida en JPEG (768 de lado
// mayor), que alcanza para juzgar el diseño, el texto y la marca.
//
// Sin Container (en local, o si falla) se manda la ORIGINAL sólo si es pequeña; si no, nada: el texto dice que no se
// pudo enseñar, y la pieza sigue en la galería. Nunca tumba la herramienta: ver una pieza es un extra.
// No gasta IA: es cómputo del Container (céntimos de céntimo).
// ============================================================

import { alContenedor, aBase64 } from "./cuadros.js";

/** El lado mayor de la copia: lo mismo que usa el director de la aplicación (`paraElModelo`). */
export const LADO_MINIATURA = 768;
/** Cuántas piezas se enseñan de una vez como mucho (cada una son ~1.000 tokens de imagen). */
export const MAX_PIEZAS_VISTAS = 6;
/** Más que esto no se lee de R2 para reducirlo (una pieza de 4K en PNG ronda los 20 MB; no es lo normal). */
const TOPE_LEER = 24 * 1024 * 1024;
/** Sin Container, la original sólo si pesa menos que esto. */
const TOPE_ORIGINAL = 1_200_000;
const MIMES_ORIGINAL = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * La copia reducida de una imagen de R2 → { datos (base64), mime, ancho?, alto?, original? } o null.
 * `mime` es el de la ficha de la galería (el de R2 puede no estar).
 */
export async function miniaturaDe(env, clave, { mime = "", lado = LADO_MINIATURA } = {}) {
  if (!clave || !env?.MEDIA) return null;
  const obj = await env.MEDIA.get(clave).catch(() => null);
  if (!obj || obj.size > TOPE_LEER) return null;
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (env.VIDEO) {
    try {
      const r = await alContenedor(env, "/miniatura", { imagen: aBase64(bytes), lado });
      const j = await r.json();
      if (j?.datos) return { datos: j.datos, mime: j.mime || "image/jpeg", ancho: j.ancho, alto: j.alto, original: j.original };
    } catch (e) {
      console.error("miniatura:", e?.message ?? e);
    }
  }
  const tipo = mime || obj.httpMetadata?.contentType || "";
  if (bytes.length <= TOPE_ORIGINAL && MIMES_ORIGINAL.has(tipo)) return { datos: aBase64(bytes), mime: tipo };
  return null;
}

/** Varias fichas de la galería → sus copias, en orden, una a una (el Worker no carga varias de 2K a la vez). */
export async function miniaturasDe(env, fichas, opciones = {}) {
  const salida = [];
  for (const f of fichas.slice(0, MAX_PIEZAS_VISTAS)) {
    if (!String(f?.mime ?? "").startsWith("image/")) { salida.push(null); continue; }
    salida.push(await miniaturaDe(env, f.clave, { ...opciones, mime: f.mime }).catch(() => null));
  }
  return salida;
}
