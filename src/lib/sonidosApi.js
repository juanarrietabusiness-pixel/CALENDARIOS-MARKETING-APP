// ============================================================
// Cliente de /api/sonidos: la BIBLIOTECA DE SONIDO de un cliente (`clienteId`) y la de la agencia (sin cliente)
// ============================================================

import { pedir } from "./db";

const enc = encodeURIComponent;
const base = (clienteId) => (clienteId ? `/sonidos/${enc(clienteId)}` : "/sonidos/agencia");

/** Avisa a lo que enseña la biblioteca en ESTA pestaña (el eco de la propia pestaña no llega por el socket). */
export function avisarSonidos(clienteId = null) {
  try { window.dispatchEvent(new CustomEvent("sonidos", { detail: { local: true, clienteId } })); } catch { /* sin ventana */ }
}

/** La biblioteca: { musica, efectos } (con cliente, además `agencia` y `puedeCambiarAgencia`; sin él, `puedeCambiar`). */
export const leerBiblioteca = (clienteId = null) => pedir(base(clienteId));

/**
 * Lo que dura un audio YA SUBIDO, medido por el navegador de su dirección (el Worker no decodifica audio). De su
 * dirección y no del archivo: un `blob:` lo bloquea la CSP (`media-src` es `'self'`). Con plazo: Safari en el iPhone
 * puede no cargar los metadatos de lo que no se reproduce. → segundos, o null.
 */
export function duracionDe(src, plazo = 8000) {
  return new Promise((ok) => {
    let a;
    try { a = new Audio(); } catch { ok(null); return; }
    const fin = (v) => { clearTimeout(t); a.removeAttribute("src"); ok(Number.isFinite(v) && v > 0 ? v : null); };
    const t = setTimeout(() => fin(null), plazo);
    a.preload = "metadata";
    a.onloadedmetadata = () => fin(a.duration);
    a.onerror = () => fin(null);
    a.src = src;
  });
}

/** Mide lo que dura una pista recién subida y lo apunta (si no lo sabía). Nunca falla. → la pista, al día si se pudo. */
export async function conDuracion(clienteId, pista) {
  if (!pista?.src || pista.duracion) return pista;
  try {
    const duracion = await duracionDe(pista.src);
    if (!duracion) return pista;
    return (await cambiarSonido(clienteId, pista.id, { duracion }))?.pista ?? pista;
  } catch {
    return pista;
  }
}

/** Sube un audio (`categoria` «musica» | «efecto») y apunta lo que dura. → { pista, repetido }. */
export async function subirSonido(clienteId, archivo, { categoria = "musica" } = {}) {
  const form = new FormData();
  form.append("archivo", archivo);
  form.append("categoria", categoria);
  const r = await pedir(base(clienteId), { method: "POST", body: form });
  return { ...r, pista: await conDuracion(clienteId, r.pista) };
}

export const cambiarSonido = (clienteId, id, cambios) => pedir(`${base(clienteId)}/${enc(id)}`, { method: "PATCH", body: JSON.stringify(cambios) });
export const quitarSonido = (clienteId, id, { forzar = false } = {}) => pedir(`${base(clienteId)}/${enc(id)}${forzar ? "?forzar=1" : ""}`, { method: "DELETE" });
export const recuperarSonido = (clienteId, id) => pedir(`${base(clienteId)}/${enc(id)}/recuperar`, { method: "POST" });
/** «Usar de la agencia»: la copia a la biblioteca del cliente. */
export const usarDeLaAgencia = (clienteId, id) => pedir(`/sonidos/${enc(clienteId)}/de-agencia`, { method: "POST", body: JSON.stringify({ id }) });
/** «Pasar a la agencia»: la copia a la biblioteca de la agencia (para todos los clientes). */
export const pasarALaAgencia = (clienteId, id) => pedir(`/sonidos/${enc(clienteId)}/${enc(id)}/a-agencia`, { method: "POST" });
