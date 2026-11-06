// ============================================================
// Las CANCIONES DE INSTAGRAM de cada cliente (puro, sin importaciones)
//
// Lo que se publica A MANO con la música de Instagram (un carrusel: la API no deja ponerla) lleva una canción sugerida.
// La agencia escribe por cliente las que le van (nombre y artista, en `kit.musica.cancionesInstagram`, Marca → Kit y
// voz) y la pantalla del teléfono (/a-mano) sugiere una sin repetir la última usada, que queda en la publicación
// (`post.cancionInstagram`, con cuándo se escogió). Sin importaciones: lo lee también el kit de marca (kitMarca.js).
// ============================================================

/** Cuántas canciones guarda un cliente, como mucho. */
export const MAX_CANCIONES = 20;
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Una canción, limpia: { nombre (≤ 80), artista (≤ 60) }, o null sin nombre. Pura. */
export function limpiarCancion(c) {
  const nombre = corto(c?.nombre, 80);
  if (!nombre) return null;
  const artista = corto(c?.artista, 60);
  return artista ? { nombre, artista } : { nombre };
}

/** La lista de canciones de un cliente, limpia y sin repetir (por nombre y artista). Pura. */
export function limpiarCanciones(lista) {
  const vistas = new Set();
  const salida = [];
  for (const c of Array.isArray(lista) ? lista : []) {
    const l = limpiarCancion(c);
    const clave = l ? `${l.nombre}|${l.artista ?? ""}`.toLowerCase() : "";
    if (!l || vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(l);
    if (salida.length >= MAX_CANCIONES) break;
  }
  return salida;
}

/** «Nombre — Artista», lo que se copia para buscarla en Instagram. Pura. */
export const textoDeCancion = (c) => (c?.nombre ? (c.artista ? `${c.nombre} — ${c.artista}` : c.nombre) : "");

const mismaCancion = (a, b) => Boolean(a?.nombre && b?.nombre)
  && a.nombre.toLowerCase() === b.nombre.toLowerCase() && String(a.artista ?? "").toLowerCase() === String(b.artista ?? "").toLowerCase();

/**
 * La última canción que se usó en lo publicado a mano de un cliente (la de `cancionInstagram` con la fecha más nueva),
 * sin contar la publicación `excepto`. Null si no hay. Pura.
 */
export function ultimaCancionUsada(cliente, excepto = "") {
  let ultima = null;
  for (const cal of cliente?.calendars ?? []) {
    for (const d of cal.days ?? []) {
      for (const p of d.posts ?? []) {
        const c = p?.cancionInstagram;
        if (!c?.nombre || p.id === excepto) continue;
        if (!ultima || String(c.en ?? "") > String(ultima.en ?? "")) ultima = c;
      }
    }
  }
  return ultima;
}

/**
 * La canción que se sugiere para una publicación: la que ya tiene puesta, si la tiene; si no, la siguiente de la lista
 * a la última que se usó en el cliente (nunca la misma, salvo que sólo haya una). Con `otra`, la siguiente a la que se
 * está enseñando (`actual`), sin caer en la última usada. Null sin lista. Pura.
 */
export function cancionSugerida(canciones, { ultima = null, actual = null, otra = false } = {}) {
  const lista = limpiarCanciones(canciones);
  if (actual?.nombre && !otra) return limpiarCancion(actual);
  if (!lista.length) return null;
  const desde = otra && actual?.nombre ? actual : ultima;
  let i = (lista.findIndex((c) => mismaCancion(c, desde)) + 1) % lista.length;
  if (lista.length > 1 && mismaCancion(lista[i], ultima)) i = (i + 1) % lista.length;
  return lista[i];
}

/** La canción como se guarda en la publicación: con cuándo se escogió (así la siguiente no la repite). Pura. */
export const cancionParaGuardar = (c, en) => (c?.nombre ? { ...limpiarCancion(c), en: String(en ?? "") } : null);
