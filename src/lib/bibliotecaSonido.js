// ============================================================
// La BIBLIOTECA DE SONIDO: la música y los efectos de cada cliente y los de la AGENCIA (puro: lo leen el Worker, el
// director musical, las herramientas de Claude y la pantalla)
//
// Para qué: ahorrar créditos de Suno. Lo que ya se generó (o se subió) se reutiliza en cualquier video del cliente y,
// pasándolo a la agencia, en los de todos los clientes; y cada cliente tiene sus efectos (un whoosh, un pop, un
// «ding») para las transiciones y los sellos del video animado en vez de los sintetizados.
//
//   · Una PISTA, como la ven la pantalla y las herramientas: { id, nombre, src, bytes, modelo, fecha, categoria
//     («musica» | «efecto»), de («cliente» | «agencia»), etiquetas, bpm, duracion, favorita, origen («suno»,
//     «subida», «agencia», «cliente»), estilo? (lo que se le pidió a Suno) }.
//   · La categoría de lo de un cliente sale de su `modelo` en `estudio_archivos` (`categoriaDeModelo`): así las
//     músicas de antes (musica-suno, musica-subida) entran solas, sin migrar nada.
//   · La FAVORITA de la música es «la música de la marca»: UNA por biblioteca, la que se propone primero y la que
//     llevan por defecto los videos nuevos. En los efectos, la favorita sólo los pone primero (puede haber varias).
//   · `pistasQueEncajan`: el DIRECTOR MUSICAL mira la biblioteca antes de pedir a Suno; si una pista encaja con lo que
//     propone (sus etiquetas y su estilo contra el de la propuesta, y su BPM contra el de los cortes), la ofrece GRATIS.
// ============================================================

export const CATEGORIAS_SONIDO = Object.freeze(["musica", "efecto"]);
export const NOMBRE_CATEGORIA = Object.freeze({ musica: "Música", efecto: "Efectos" });

/** Lo que pesa como mucho lo que se sube: una música entera y un efecto corto. */
export const MAX_BYTES_SONIDO = Object.freeze({ musica: 15 * 1024 * 1024, efecto: 2 * 1024 * 1024 });
/** Lo que se usa de un efecto (s): uno más largo es una música. */
export const MAX_DURACION_EFECTO = 4;
export const MAX_ETIQUETAS = 8;
const MAX_ETIQUETA = 24;
const MAX_NOMBRE = 80;
/** Las pistas de una biblioteca que se leen de una vez. */
export const MAX_PISTAS = 200;

/** Los `modelo` de `estudio_archivos` de lo que entra en la biblioteca de un cliente (la locución también es audio). */
export const MODELO_MUSICA_SUBIDA = "musica-subida";
export const MODELO_EFECTO_SUBIDO = "efecto-subido";
export const MODELO_MUSICA_AGENCIA = "musica-agencia";
export const MODELO_EFECTO_AGENCIA = "efecto-agencia";

/** La categoría de un audio de la galería por su `modelo`, o null si no es de la biblioteca (una locución). Pura. */
export function categoriaDeModelo(modelo) {
  const m = String(modelo ?? "");
  if (m.startsWith("efecto")) return "efecto";
  if (m.startsWith("musica")) return "musica";
  return null;
}

/** De dónde salió una pista de un cliente, por su `modelo`. Pura. */
export function origenDeModelo(modelo) {
  const m = String(modelo ?? "");
  if (m === "musica-suno") return "suno";
  if (m.endsWith("-agencia")) return "agencia";
  return "subida";
}

/** El `modelo` con que se guarda en un cliente lo subido (o lo traído de la agencia). Pura. */
export const modeloDeSonido = (categoria, { deAgencia = false } = {}) =>
  categoria === "efecto" ? (deAgencia ? MODELO_EFECTO_AGENCIA : MODELO_EFECTO_SUBIDO) : (deAgencia ? MODELO_MUSICA_AGENCIA : MODELO_MUSICA_SUBIDA);

/** Las etiquetas que se ofrecen al escribir (ánimo y ritmo; en los efectos, qué es). Se puede escribir cualquier otra. */
export const ETIQUETAS_SUGERIDAS = Object.freeze({
  musica: Object.freeze([
    "alegre", "tranquila", "energética", "emotiva", "inspiradora", "épica", "elegante", "divertida", "romántica",
    "corporativa", "acústica", "electrónica", "urbana", "latina", "navideña", "infantil", "lenta", "media", "rápida",
  ]),
  efecto: Object.freeze(["whoosh", "pop", "ding", "clic", "transición", "sello", "golpe", "brillo", "aplauso", "notificación"]),
});

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const limpio = (s, tope) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, tope);

/** El nombre de una pista: sin la extensión del archivo, sin espacios de más. Pura. */
export const limpiarNombreSonido = (s) => limpio(String(s ?? "").trim().replace(/\.(mp3|wav|m4a|aac)$/i, ""), MAX_NOMBRE);

/** Las etiquetas, limpias: minúsculas, sin repetir (sin contar tildes), como mucho 8 de 24 letras. Lista o «a, b». Pura. */
export function limpiarEtiquetas(v) {
  const lista = Array.isArray(v) ? v : String(v ?? "").split(",");
  const vistas = new Set();
  const out = [];
  for (const x of lista) {
    const t = limpio(String(x ?? "").trim().replace(/^#+/, ""), MAX_ETIQUETA).toLowerCase();
    if (!t || vistas.has(sinTildes(t))) continue;
    vistas.add(sinTildes(t));
    out.push(t);
    if (out.length >= MAX_ETIQUETAS) break;
  }
  return out;
}

/** Un BPM que se cree: entero de 40 a 240, o null. Pura. */
export function limpiarBpm(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 40 && n <= 240 ? n : null;
}

/** Una duración que se cree (s, una décima): de 0,05 s a una hora, o null. Pura. */
export function limpiarDuracionSonido(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0.05 && n <= 3600 ? Math.round(n * 10) / 10 : null;
}

/** El BPM que dice un texto («warm acoustic folk, 100 BPM»), o null. Pura. */
export function bpmDelTexto(texto) {
  const m = /(\d{2,3})\s*bpm\b/i.exec(String(texto ?? ""));
  return m ? limpiarBpm(m[1]) : null;
}

/**
 * Lo que se puede cambiar de una pista (nombre, etiquetas, bpm, duracion, favorita), limpio; sólo lo que viene. Pura.
 * → { nombre?, etiquetas?, bpm?, duracion?, favorita? }
 */
export function limpiarCambiosSonido(b) {
  const o = b && typeof b === "object" && !Array.isArray(b) ? b : {};
  const out = {};
  if (o.nombre !== undefined) {
    const n = limpiarNombreSonido(o.nombre);
    if (n) out.nombre = n;
  }
  if (o.etiquetas !== undefined) out.etiquetas = limpiarEtiquetas(o.etiquetas);
  if (o.bpm !== undefined) out.bpm = limpiarBpm(o.bpm);
  // Lo que dura, medido por el navegador DESPUÉS de subirla (de su dirección: un `blob:` lo bloquea la CSP).
  if (o.duracion !== undefined && limpiarDuracionSonido(o.duracion) !== null) out.duracion = limpiarDuracionSonido(o.duracion);
  if (typeof o.favorita === "boolean") out.favorita = o.favorita;
  return out;
}

/**
 * Lo que una pista de un cliente guarda en `estudio_archivos.ajustes.biblioteca`, limpio. Pura.
 * → { etiquetas, bpm, duracion }
 */
export function metaDeSonido(ajustes) {
  const b = ajustes?.biblioteca && typeof ajustes.biblioteca === "object" ? ajustes.biblioteca : {};
  const estilo = String(ajustes?.pedido?.estilo ?? "");
  return {
    etiquetas: limpiarEtiquetas(b.etiquetas ?? []),
    bpm: limpiarBpm(b.bpm) ?? bpmDelTexto(estilo),
    duracion: limpiarDuracionSonido(b.duracion ?? ajustes?.duracion),
  };
}

/** El puesto de una pista: la favorita del cliente, lo del cliente, la favorita de la agencia, lo de la agencia. */
const puesto = (p) => (p.de === "agencia" ? 2 : 0) + (p.favorita ? 0 : 1);

/**
 * El orden de una biblioteca: lo del cliente antes que lo de la agencia, la favorita primero en cada una (la del
 * cliente es «la música de la marca»: la que se propone primero) y, dentro, lo más nuevo primero. Pura (otra lista).
 */
export function ordenarPistas(lista) {
  return [...(lista ?? [])].sort((a, b) => puesto(a) - puesto(b) || String(b.fecha ?? "").localeCompare(String(a.fecha ?? "")));
}

/** «0:32» Pura. */
export const duracionCorta = (s) => {
  const t = Math.round(Number(s) || 0);
  return t > 0 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : "";
};

/** Una línea para el asistente y Claude: «Nombre» · 98 BPM · alegre, acústica · 0:32 · música de la marca. Pura. */
export function textoDePista(p) {
  return [
    `«${p.nombre}»`,
    p.bpm ? `${p.bpm} BPM` : "",
    p.etiquetas?.length ? p.etiquetas.join(", ") : "",
    duracionCorta(p.duracion),
    p.favorita ? (p.categoria === "musica" ? "música de la marca" : "favorito") : "",
    p.de === "agencia" ? "de la agencia" : p.origen === "suno" ? "generada con Suno" : "",
  ].filter(Boolean).join(" · ");
}

// ------------------------------------------------------------
// ¿Encaja alguna con lo que propone el director musical?
// ------------------------------------------------------------

/**
 * Lo que dice cada etiqueta (en español) en el idioma en que el director escribe para Suno (inglés). Con esto una
 * pista etiquetada «alegre, acústica» se reconoce en «warm acoustic folk, upbeat, 100 BPM».
 */
const SINONIMOS = Object.freeze({
  alegre: ["happy", "upbeat", "cheerful", "bright", "joyful", "positive", "feel-good", "uplifting", "sunny"],
  tranquila: ["calm", "soft", "gentle", "ambient", "chill", "relaxed", "peaceful", "mellow", "lo-fi", "lofi"],
  energetica: ["energetic", "driving", "punchy", "powerful", "dynamic", "high-energy"],
  emotiva: ["emotional", "heartfelt", "moving", "sentimental", "touching"],
  inspiradora: ["inspiring", "inspirational", "uplifting", "motivational", "hopeful"],
  epica: ["epic", "cinematic", "orchestral", "trailer", "heroic"],
  elegante: ["elegant", "sophisticated", "luxury", "lounge", "classy", "jazz"],
  divertida: ["playful", "fun", "quirky", "whimsical", "bouncy"],
  romantica: ["romantic", "love", "tender"],
  corporativa: ["corporate", "business", "clean", "professional"],
  acustica: ["acoustic", "guitar", "ukulele", "folk"],
  electronica: ["electronic", "synth", "edm", "house", "electro", "synthwave"],
  urbana: ["urban", "hip hop", "hip-hop", "trap", "rap", "beats"],
  latina: ["latin", "reggaeton", "salsa", "cumbia", "tropical", "bachata", "merengue"],
  navidena: ["christmas", "holiday", "festive", "jingle", "xmas"],
  infantil: ["kids", "children", "lullaby", "nursery"],
  misteriosa: ["mysterious", "dark", "suspense", "tension"],
  piano: ["piano"], guitarra: ["guitar"], pop: ["pop"], rock: ["rock"], jazz: ["jazz"],
});

/**
 * Las de ritmo y el rango de BPM que dicen (los de `RANGO_BPM` del director musical, un poco más abiertos; copiados
 * aquí para que la pantalla no cargue el director entero).
 */
const RITMO = Object.freeze({ lenta: [60, 100], media: [88, 118], rapida: [108, 160] });

/** Las palabras que no dicen nada de cómo suena (se quitan antes de comparar dos estilos). */
const VACIAS = new Set(["with", "and", "the", "for", "music", "track", "song", "background", "instrumental", "vocals", "voice", "light", "soft", "warm", "clean", "ending", "intro", "builds", "build", "resolves", "under", "hook", "middle", "end", "modern"]);

const palabras = (t) => sinTildes(t).split(/[^a-z0-9-]+/).filter((w) => w.length >= 4 && !VACIAS.has(w) && !/^\d+$/.test(w));

/** ¿Qué tan cerca están dos BPM (también al doble o a la mitad: un corte sigue cayendo en un tiempo fuerte)? → 0…∞. */
function distanciaBpm(a, b) {
  if (!(a > 0) || !(b > 0)) return null;
  return Math.min(...[a, a * 2, a / 2].map((x) => Math.abs(x - b) / b));
}

/**
 * Las pistas de MÚSICA de la biblioteca que encajan con una propuesta del director musical ({ estilo, genero,
 * instrumentos, energia, bpm }): por sus etiquetas (en español, con sus sinónimos en inglés) y su estilo de Suno contra
 * el texto de la propuesta, y por su BPM contra el de los cortes. Hace falta que encaje lo que suena (al menos una
 * etiqueta o dos palabras del estilo) y que el BPM no choque: con el BPM solo no basta. → [{ pista, puntos, motivo }]
 * de la que más encaja a la que menos, como mucho `max`. Pura.
 */
export function pistasQueEncajan(propuesta, pistas, { max = 3 } = {}) {
  if (!propuesta) return [];
  const texto = sinTildes([propuesta.estilo, propuesta.genero, propuesta.instrumentos, propuesta.energia].filter(Boolean).join(" "));
  const deLaPropuesta = new Set(palabras(texto));
  const bpm = limpiarBpm(propuesta.bpm) ?? bpmDelTexto(propuesta.estilo);
  const out = [];
  for (const p of pistas ?? []) {
    if ((p.categoria ?? "musica") !== "musica") continue;
    let puntos = 0;
    let suena = 0;
    const motivos = [];
    const etiquetas = [];
    for (const e of p.etiquetas ?? []) {
      const k = sinTildes(e);
      if (RITMO[k]) {
        if (bpm && bpm >= RITMO[k][0] && bpm <= RITMO[k][1]) { puntos += 1; etiquetas.push(e); }
        continue;
      }
      const busca = [k, ...(SINONIMOS[k] ?? [])];
      if (busca.some((w) => (w.includes(" ") ? texto.includes(w) : deLaPropuesta.has(w) || new RegExp(`\\b${w}\\b`).test(texto)))) {
        puntos += 2; suena++; etiquetas.push(e);
      }
    }
    // El estilo con que se generó (las de Suno) o el nombre: las palabras que comparte con la propuesta.
    const comunes = [...new Set(palabras(`${p.estilo ?? ""} ${p.nombre ?? ""}`))].filter((w) => deLaPropuesta.has(w));
    if (comunes.length >= 2 || (comunes.length && suena)) { puntos += Math.min(3, comunes.length); suena += comunes.length >= 2 ? 1 : 0; }
    const d = distanciaBpm(p.bpm, bpm);
    if (d !== null) {
      if (d <= 0.06) { puntos += 3; motivos.push(`${p.bpm} BPM (pide ${bpm})`); } else if (d <= 0.12) { puntos += 1.5; motivos.push(`${p.bpm} BPM (pide ${bpm})`); } else if (d > 0.2) puntos -= 3;
    }
    if (p.favorita) puntos += 1;
    if (!suena || puntos < 3) continue;
    if (etiquetas.length) motivos.push(etiquetas.join(", "));
    if (comunes.length) motivos.push(`su estilo: ${comunes.slice(0, 3).join(", ")}`);
    if (p.favorita) motivos.push("es la música de la marca");
    out.push({ pista: p, puntos: Math.round(puntos * 10) / 10, motivo: motivos.join(" · ") });
  }
  return out.sort((a, b) => b.puntos - a.puntos).slice(0, max);
}

/** Lo que se le dice al asistente (y a Claude) de las que encajan ({ pista, motivo } o la pista con su `motivo`). Pura. */
export function textoDeLasQueEncajan(lista) {
  if (!lista?.length) return "";
  return `ANTES DE PAGAR: en la biblioteca ya hay ${lista.length === 1 ? "una música que encaja" : `${lista.length} músicas que encajan`} (gratis): ${
    lista.map((x) => `${(x.pista ?? x).id} — ${textoDePista(x.pista ?? x)}${x.motivo ? ` (${x.motivo})` : ""}`).join("; ")
  }. Ofrécela primero: se pone con sonido_video (musica_id) sin gastar. Si no le sirve ninguna, entonces sí se genera.`;
}
