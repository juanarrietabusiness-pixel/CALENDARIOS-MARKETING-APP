// ============================================================
// Inspiración: las cuentas que sigue cada cliente y lo que publican (puro)
//
// Cada cliente tiene hasta MAX_CUENTAS cuentas fijas, de COMPETENCIA o de
// INSPIRACIÓN (una que gusta aunque no compita), en `clients.competidores`.
// Eso eran @ sueltos de Instagram (los competidores de Resultados): una
// cadena se lee como una cuenta de Instagram de competencia, así lo de
// antes sigue valiendo sin tocar una fila.
//
// Lo que publican lo guarda el Worker (worker/lib/inspiracion.js) y aquí se
// mide contra la PROPIA cuenta: «rinde 3,2× su promedio» es la mediana de
// sus interacciones, no los «me gusta» a secas (5.000 no significan lo mismo
// en una cuenta de 10.000 seguidores que en una de dos millones).
//
// Instagram y YouTube tienen feed (Instagram por `business_discovery`,
// sólo empresa o creador; YouTube por su Data API). TikTok no deja ver lo
// de otras cuentas: se guarda la cuenta y se abre su perfil.
//
// También lo importa el Worker.
// ============================================================

import { referenciaLimpia } from "./referenciasPost.js";

export { referenciasDe } from "./referenciasPost.js";

export const MAX_CUENTAS = 10;

export const REDES_INSPIRACION = Object.freeze({
  instagram: { nombre: "Instagram", icono: "photo", feed: true },
  youtube: { nombre: "YouTube", icono: "play", feed: true },
  tiktok: { nombre: "TikTok", icono: "video", feed: false },
});

export const TIPOS_CUENTA = Object.freeze({
  competencia: "Competencia",
  inspiracion: "Inspiración",
});

export const FORMATOS_FEED = Object.freeze({
  reel: "Reel",
  carrusel: "Carrusel",
  imagen: "Imagen",
  short: "Short",
  video: "Video",
});

/** Desde cuántas veces su promedio una publicación merece un aviso al equipo. */
export const UMBRAL_AVISO = 3;
/** Sólo se avisa de lo publicado en los últimos días: lo viejo que rinde no es noticia. */
export const DIAS_AVISO = 7;

const USUARIO = {
  instagram: /^[a-z0-9._]{1,30}$/,
  tiktok: /^[a-z0-9._]{2,24}$/,
  // Un handle de YouTube (sin @) o el id de un canal (UC…).
  youtube: /^(?:[a-z0-9._-]{3,30}|UC[\w-]{22})$/,
};

/** El @ limpio para esa red, o "" si no vale. El id de un canal de YouTube conserva sus mayúsculas. Pura. */
export function usuarioLimpio(red, usuario) {
  const t = String(usuario ?? "").trim().replace(/^@+/, "");
  if (!USUARIO[red]) return "";
  const canal = red === "youtube" && /^UC[\w-]{22}$/.test(t);
  const u = canal ? t : t.toLowerCase();
  return USUARIO[red].test(u) ? u : "";
}

/**
 * Lo que alguien escribe o pega (un @, el enlace de un perfil) → { red, usuario } o null. Entiende
 * instagram.com/<usuario>, tiktok.com/@<usuario>, youtube.com/@<handle> y youtube.com/channel/<UC…>. Pura.
 */
export function cuentaDeTexto(texto, redPorDefecto = "instagram") {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const url = t.match(/https?:\/\/(?:www\.|m\.)?([a-z.]+)\/([^?#\s]*)/i);
  if (url) {
    const host = url[1].toLowerCase();
    const partes = url[2].split("/").filter(Boolean);
    if (/(^|\.)instagram\.com$/.test(host)) {
      const u = usuarioLimpio("instagram", partes[0]);
      return u && !["p", "reel", "reels", "tv", "stories", "explore"].includes(u) ? { red: "instagram", usuario: u } : null;
    }
    if (/(^|\.)tiktok\.com$/.test(host)) {
      const u = partes[0]?.startsWith("@") ? usuarioLimpio("tiktok", partes[0]) : "";
      return u ? { red: "tiktok", usuario: u } : null;
    }
    if (/(^|\.)youtube\.com$/.test(host)) {
      if (partes[0]?.startsWith("@")) {
        const u = usuarioLimpio("youtube", partes[0]);
        return u ? { red: "youtube", usuario: u } : null;
      }
      if (partes[0] === "channel") {
        const u = usuarioLimpio("youtube", partes[1]);
        return u ? { red: "youtube", usuario: u } : null;
      }
    }
    return null;
  }
  const red = REDES_INSPIRACION[redPorDefecto] ? redPorDefecto : "instagram";
  const u = usuarioLimpio(red, t);
  return u ? { red, usuario: u } : null;
}

/** «instagram:cuenta»: la que identifica una cuenta dentro de un cliente. Pura. */
export const claveCuenta = (c) => `${c.red}:${String(c.usuario).toLowerCase()}`;

/** El id de la fila de `inspiracion_cuentas`: el cliente y la cuenta. Pura. */
export const idDeCuenta = (clienteId, c) => `${clienteId}:${claveCuenta(c)}`;

/** El perfil de la cuenta en su red. Pura. */
export function enlaceDePerfil(c) {
  if (c.red === "tiktok") return `https://www.tiktok.com/@${c.usuario}`;
  if (c.red === "youtube") return /^UC[\w-]{22}$/.test(c.usuario) ? `https://www.youtube.com/channel/${c.usuario}` : `https://www.youtube.com/@${c.usuario}`;
  return `https://www.instagram.com/${c.usuario}/`;
}

/**
 * Las cuentas de un cliente, limpias: { red, usuario, tipo, nota }. Lee las dos formas —un @ suelto (lo de antes: una
 * cuenta de Instagram de competencia) o el objeto—, quita las repetidas y lo que no vale, y corta a MAX_CUENTAS. Pura.
 */
export function cuentasDeReferencia(lista) {
  const salida = [];
  const vistas = new Set();
  for (const x of Array.isArray(lista) ? lista : []) {
    const o = typeof x === "string" ? { red: "instagram", usuario: x } : x && typeof x === "object" ? x : null;
    if (!o) continue;
    const red = REDES_INSPIRACION[o.red] ? o.red : "instagram";
    const usuario = usuarioLimpio(red, o.usuario);
    if (!usuario) continue;
    const cuenta = {
      red, usuario,
      tipo: TIPOS_CUENTA[o.tipo] ? o.tipo : "competencia",
      nota: String(o.nota ?? "").trim().slice(0, 200),
    };
    const clave = claveCuenta(cuenta);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(cuenta);
    if (salida.length >= MAX_CUENTAS) break;
  }
  return salida;
}

/** Los @ de Instagram de las cuentas (los que se pueden leer por `business_discovery`). Pura. */
export const usuariosInstagram = (lista) => cuentasDeReferencia(lista).filter((c) => c.red === "instagram").map((c) => c.usuario);

/** Los @ que mide la foto de la competencia de Resultados: Instagram y de competencia. Pura. */
export const usuariosParaMetricas = (lista) => cuentasDeReferencia(lista).filter((c) => c.red === "instagram" && c.tipo === "competencia").map((c) => c.usuario);

/** La mediana (null sin números). Pura. */
export function mediana(numeros = []) {
  const n = numeros.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!n.length) return null;
  const m = Math.floor(n.length / 2);
  return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
}

/**
 * Cuántas veces su promedio rinde cada publicación: `interacciones` ÷ la MEDIANA de la cuenta (con un reel viral, la
 * media dejaría a todos los demás «por debajo»). Con menos de 3 publicaciones no hay promedio que valga: rinde null.
 * → { mediana, publicaciones: [{ …, rinde }] }. Pura.
 */
export function conRendimiento(publicaciones = []) {
  const lista = Array.isArray(publicaciones) ? publicaciones : [];
  const m = lista.length >= 3 ? mediana(lista.map((p) => Number(p.interacciones) || 0)) : null;
  return {
    mediana: m,
    publicaciones: lista.map((p) => ({ ...p, rinde: m > 0 ? Math.round(((Number(p.interacciones) || 0) / m) * 10) / 10 : null })),
  };
}

/** «3,2×» (o "" sin dato). Pura. */
export const etiquetaRinde = (r) => (Number.isFinite(r) ? `${String(r).replace(".", ",")}×` : "");

/**
 * El feed filtrado y ordenado. `cuenta`: «red:usuario» o "" (todas); `formato`: un id de FORMATOS_FEED o "";
 * `orden`: «rinde» (lo que más funcionó) o «nuevo»; `desde`: sólo lo publicado después (ISO), para «Nuevo desde tu
 * última visita». Pura.
 */
export function filtrarFeed(items = [], { cuenta = "", formato = "", orden = "rinde", desde = "" } = {}) {
  const d = Date.parse(desde || "");
  return (Array.isArray(items) ? items : [])
    .filter((p) => !cuenta || claveCuenta(p) === cuenta)
    .filter((p) => !formato || p.formato === formato)
    .filter((p) => !Number.isFinite(d) || Date.parse(p.fecha ?? "") > d)
    .sort((a, b) => (orden === "nuevo"
      ? String(b.fecha ?? "").localeCompare(String(a.fecha ?? ""))
      : (b.rinde ?? -1) - (a.rinde ?? -1) || String(b.fecha ?? "").localeCompare(String(a.fecha ?? ""))));
}

/** ¿Se avisa al equipo de esta publicación? Rinde al menos UMBRAL_AVISO veces su promedio, es reciente y no se avisó. Pura. */
export function debeAvisar(p, ahora = Date.now()) {
  if (!p || p.avisado) return false;
  if (!(Number(p.rinde) >= UMBRAL_AVISO)) return false;
  const t = Date.parse(p.fecha ?? p.publicada_at ?? "");
  return Number.isFinite(t) && ahora - t <= DIAS_AVISO * 86_400_000;
}

/** El formato de la publicación del calendario que sale de una del feed. Pura. */
export const formatoDePublicacion = (formato) => (formato === "carrusel" ? "carrusel" : formato === "imagen" ? "post" : "reel");

/**
 * Una publicación del feed (y, si se trajo, su archivo de la galería) → una idea con la forma del banco, lista para
 * `deIdeaAPublicacion`: el formato, la idea con de dónde salió, el enlace y el archivo como REFERENCIA. Pura.
 */
export function ideaDeInspiracion(p, archivo = null, id = "") {
  const de = p.red === "youtube" ? p.nombre || `@${p.usuario}` : `@${p.usuario}`;
  const rinde = etiquetaRinde(p.rinde);
  const texto = String(p.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  return {
    id,
    idea: `Referencia de ${de}${rinde ? ` (rinde ${rinde} su promedio)` : ""}${texto ? `: «${texto}»` : ""}`,
    format: formatoDePublicacion(p.formato),
    referenceLink: p.enlace ?? "",
    referencias: archivo?.src ? [referenciaLimpia({ src: archivo.src, tipo: archivo.tipo, id: archivo.id, cuenta: de, enlace: p.enlace })] : [],
    tags: [],
    status: "pending",
  };
}

// ------------------------------------------------------------
// «Lo que funciona en tu competencia»: el resumen del mes al cerebro
// ------------------------------------------------------------
//
// La IA lee lo que MÁS rindió (frente a su propia cuenta) en las cuentas del
// cliente y escribe los PATRONES —ganchos, formatos, temas, cómo abren y
// cierran— sin nombrar cuentas ni marcas: la nota no es interna para que el
// motor de ideas la lea al escribir, y un caption que nombre a la
// competencia sería un error. Propone y no guarda: la persona la guarda en
// el cerebro con su título (una por mes; la de ese mes se reemplaza).

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «Lo que funciona en tu competencia · octubre 2026». `mes`: «AAAA-MM». Pura. */
export function tituloDelResumen(mes) {
  const [a, m] = String(mes).split("-").map(Number);
  return `Lo que funciona en tu competencia · ${MESES[(m || 1) - 1]} ${a}`;
}

/** Las publicaciones que entran al resumen: las que más rinden de los últimos `dias`, como mucho `max`. Pura. */
export function paraResumen(publicaciones = [], { ahora = Date.now(), dias = 45, max = 15 } = {}) {
  return (Array.isArray(publicaciones) ? publicaciones : [])
    .filter((p) => Number.isFinite(p.rinde) && ahora - Date.parse(p.fecha ?? "") <= dias * 86_400_000)
    .sort((a, b) => b.rinde - a.rinde)
    .slice(0, max);
}

/** El pedido a la IA: los patrones de lo que funcionó, sin nombres. Pura. */
export function pedidoDeResumen({ marca, rubro = "", publicaciones = [] }) {
  const lineas = publicaciones.map((p, i) => [
    `${i + 1}. ${FORMATOS_FEED[p.formato] ?? p.formato} · rinde ${etiquetaRinde(p.rinde)} su promedio · ${p.tipoCuenta === "inspiracion" ? "cuenta de inspiración" : "competencia"}`,
    `   Texto: ${String(p.texto ?? "").replace(/\s+/g, " ").slice(0, 500) || "(sin texto)"}`,
  ].join("\n"));
  return [
    `Eres estratega de contenido de la agencia Juancito Ads. Trabajas para ${marca}${rubro ? ` (${rubro})` : ""}.`,
    "Estas son las publicaciones que MÁS rindieron, frente al promedio de su propia cuenta, en las cuentas que sigue este cliente (competencia y cuentas que le inspiran):",
    "",
    lineas.join("\n"),
    "",
    "Escribe una nota corta para el cerebro del cliente con los PATRONES que se repiten en lo que funcionó y cómo aprovecharlos en su contenido:",
    "- Ganchos: cómo empiezan (la frase o la situación de los primeros segundos).",
    "- Formatos: qué formato rinde más y con qué duración o número de láminas, si se nota.",
    "- Temas y ángulos: de qué hablan las que más rinden.",
    "- Cierre y llamado a la acción.",
    "- Tres ideas concretas para este cliente que sigan esos patrones (con su producto o servicio, no el de otros).",
    "",
    "Reglas: NO nombres cuentas, marcas, personas ni productos de otros; no copies frases; no inventes cifras. Si algo no se puede saber por el texto, no lo digas. Español latino neutro. Viñetas cortas, como mucho 350 palabras. Devuelve sólo la nota, sin título.",
  ].join("\n");
}

/** La nota que devolvió la IA, limpia ("" si no hay nada que guardar). Pura. */
export const leerResumen = (texto) => String(texto ?? "").replace(/^```\w*\n?|```$/g, "").trim().slice(0, 6000);

/**
 * El enlace de un video PÚBLICO de YouTube en la forma que entiende Gemini («https://www.youtube.com/watch?v=<id>»), o
 * "" si no es uno. Acepta /watch?v=, /shorts/ y youtu.be/. Pura.
 */
export function enlaceDeYouTube(enlace) {
  const t = String(enlace ?? "").trim();
  const m = t.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})(?:[?&#/].*)?$/i);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : "";
}
