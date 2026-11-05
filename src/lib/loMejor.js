// ============================================================
// «Lo mejor del momento» (puro; también lo importa el Worker)
//
// Una sola galería con lo que MEJOR está funcionando, de cuatro sitios que ya
// existían repartidos:
//   · la INSPIRACIÓN de cada cliente (lo que publican las cuentas que sigue,
//     con «rinde X×» contra la mediana de su propia cuenta);
//   · las REFERENCIAS que guardó el equipo (el banco de ideas con enlace y las
//     del estudio de mercado);
//   · lo mejor PROPIO de cada cliente (sus métricas: interacciones, guardados,
//     compartidos);
//   · los ANUNCIOS de las búsquedas guardadas de Scrape Creators (cuántos días
//     llevan, si siguen activos, cuántas versiones tienen);
//   · las TENDENCIAS de TikTok de las palabras de cada cliente, por Scrape
//     Creators (los videos con más vistas de la semana: «1,2 M de vistas»).
//     Las cuentas de TikTok que sigue un cliente entran como inspiración, con
//     «rinde X×» en VISTAS contra la mediana de esa cuenta.
//
// CÓMO SE ORDENA. Cada fuente mide distinto («4,1×» no es «63 días»), así que
// cada una tiene su SEÑAL y la señal se pasa a PERCENTIL dentro de su fuente y de
// la ventana escogida (esta semana, este mes): se ordena por eso. La tarjeta
// enseña la cifra de verdad, sin mezclar unidades.
//
// UNA PIEZA ES UNA. La identifica su `clave` («ig:<código>», «yt:<video>»,
// «fb-ad:<anuncio>»…): si la misma está en la inspiración de dos clientes y
// además guardada en el banco, sale una vez.
//
// Lo que se sabe de cada pieza (su TIPO, si sale una persona, la idea) lo
// clasifica la IA UNA vez y se guarda (`lo_mejor_piezas`).
// ============================================================

import { fechaEnZona, sumarDias, diasEntre } from "./agenda.js";
import { cifraCorta } from "./scrapeCreators.js";

export const VENTANAS = Object.freeze([
  { id: "semana", nombre: "Esta semana", dias: 7 },
  { id: "mes", nombre: "Este mes", dias: 30 },
  { id: "nuevo", nombre: "Nuevo", dias: 30 },
]);

export const FUENTES = Object.freeze({
  inspiracion: { nombre: "Inspiración", icono: "eye" },
  anuncio: { nombre: "Anuncio", icono: "megaphone" },
  tendencia: { nombre: "Tendencia de TikTok", icono: "trending" },
  propia: { nombre: "Lo tuyo", icono: "star" },
  referencia: { nombre: "Guardada por el equipo", icono: "bookmark" },
});

export const REDES_LO_MEJOR = Object.freeze({
  instagram: { nombre: "Instagram", icono: "photo" },
  facebook: { nombre: "Facebook", icono: "globe" },
  youtube: { nombre: "YouTube", icono: "play" },
  tiktok: { nombre: "TikTok", icono: "video" },
  web: { nombre: "Enlace", icono: "link" },
});

export const FORMATOS_LO_MEJOR = Object.freeze({
  imagen: "Imagen",
  carrusel: "Carrusel",
  video: "Video",
});

/** Cómo se recrea una pieza: con IA (el director o el video animado) o para GRABAR (guion con tomas y audio). */
export const CAMINOS = Object.freeze({
  imagen: { nombre: "Diseñar una imagen con IA", corto: "Imagen con IA", icono: "imageAi" },
  carrusel: { nombre: "Diseñar un carrusel con IA", corto: "Carrusel con IA", icono: "layers" },
  animado: { nombre: "Video animado (motion)", corto: "Video animado", icono: "video" },
  grabar: { nombre: "Guion para grabar", corto: "Para grabar", icono: "user" },
});

/**
 * Los tipos de pieza, SIN limitarse: primero lo que más hace la agencia y después lo que vale la pena captar. Cada uno
 * con su camino de recreación por defecto. Lo que no encaja en ninguno va como «otro» con su nombre (`etiqueta`).
 */
export const TIPOS_LO_MEJOR = Object.freeze([
  { id: "anuncio", nombre: "Anuncio que vende", camino: "imagen", nota: "vende un producto con oferta, precio o llamado a comprar" },
  { id: "imagen", nombre: "Imagen", camino: "imagen", nota: "una foto o un diseño de producto o de marca, sin más" },
  { id: "carrusel", nombre: "Carrusel", camino: "carrusel", nota: "varias láminas que se deslizan" },
  { id: "ugc", nombre: "UGC con rostro", camino: "grabar", nota: "una persona habla a cámara recomendando o usando algo" },
  { id: "video", nombre: "Video", camino: "animado", nota: "video de producto o de marca sin una persona que hable" },
  { id: "educativo", nombre: "Educativo", camino: "carrusel", nota: "enseña algo: consejos, datos, errores, cómo hacerlo" },
  { id: "motion", nombre: "Motion graphic", camino: "animado", nota: "texto, iconos o dibujos animados, sin grabar" },
  { id: "marca-personal", nombre: "Marca personal", camino: "grabar", nota: "la persona detrás de la marca cuenta su opinión o su historia" },
  { id: "viral", nombre: "Viral / tendencia", camino: "grabar", nota: "un formato o audio que está de moda" },
  { id: "humor", nombre: "Humor", camino: "grabar", nota: "sketch, chiste o situación graciosa" },
  { id: "pov", nombre: "POV", camino: "grabar", nota: "«POV: …», en primera persona" },
  { id: "transicion", nombre: "Transición", camino: "grabar", nota: "un cambio de toma o de look con efecto" },
  { id: "historia", nombre: "Historia que engancha", camino: "grabar", nota: "storytelling con principio, nudo y final" },
  { id: "reto", nombre: "Reto", camino: "grabar", nota: "un challenge o prueba" },
  { id: "reaccion", nombre: "Reacción", camino: "grabar", nota: "reacciona a otro video o a un comentario" },
  { id: "testimonio", nombre: "Testimonio", camino: "grabar", nota: "un cliente cuenta su experiencia" },
  { id: "tutorial", nombre: "Tutorial / paso a paso", camino: "grabar", nota: "enseña a hacer algo, en pasos" },
  { id: "antes-despues", nombre: "Antes y después", camino: "imagen", nota: "compara el antes y el después" },
  { id: "detras", nombre: "Detrás de cámaras", camino: "grabar", nota: "cómo se hace, el equipo, el local" },
  { id: "oferta", nombre: "Oferta / promoción", camino: "imagen", nota: "descuento, 2x1, fecha límite" },
  { id: "meme", nombre: "Meme", camino: "imagen", nota: "imagen con texto en clave de humor" },
  { id: "otro", nombre: "Otro", camino: "", nota: "no encaja en ninguno: di cuál en 2 a 4 palabras" },
]);
const TIPO_POR_ID = new Map(TIPOS_LO_MEJOR.map((t) => [t.id, t]));
export const tipoPorId = (id) => TIPO_POR_ID.get(String(id ?? "")) ?? null;

/** Cuántas piezas clasifica la IA de una vez (cada una con su miniatura). */
export const CLASIFICAR_POR_VUELTA = 6;
/** Hasta dónde se mira hacia atrás (lo más viejo no es «del momento»). */
export const DIAS_MAX = 35;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ------------------------------------------------------------
// La identidad de una pieza
// ------------------------------------------------------------

/** Un hash corto y estable (no criptográfico) para lo que no tiene id propio. Pura. */
export function hashCorto(texto) {
  let h = 5381;
  const s = String(texto ?? "");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** El código de una publicación de Instagram en su enlace (/p/, /reel/, /tv/), o "". Pura. */
export function codigoInstagram(enlace) {
  const m = String(enlace ?? "").match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]{5,40})/i);
  return m ? m[1] : "";
}

/** El id de un video de YouTube en su enlace (/watch?v=, /shorts/, youtu.be/), o "". Pura. */
export function videoYouTube(enlace) {
  const m = String(enlace ?? "").match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})/i);
  return m ? m[1] : "";
}

/**
 * La clave de una pieza por su enlace: la misma publicación es la misma clave venga de donde venga (la inspiración,
 * el banco, una referencia del estudio de mercado). Pura.
 */
export function claveDeEnlace(enlace) {
  const e = String(enlace ?? "").trim();
  if (!e) return "";
  const ig = codigoInstagram(e);
  if (ig) return `ig:${ig}`;
  const yt = videoYouTube(e);
  if (yt) return `yt:${yt}`;
  const ad = e.match(/facebook\.com\/ads\/library\/?\?(?:[^#]*&)?id=(\d{3,30})/i);
  if (ad) return `fb-ad:${ad[1]}`;
  const tt = e.match(/tiktok\.com\/@[\w.]+\/video\/(\d{5,30})/i);
  if (tt) return `tt:${tt[1]}`;
  return `ref:${hashCorto(e.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase())}`;
}

/** La clave de una publicación de la inspiración (la misma regla que la consulta del cron en acceso.js). Pura. */
export function claveDeInspiracion(p) {
  if (p?.red === "youtube") return `yt:${p.externo_id ?? p.externoId}`;
  if (p?.red === "instagram") return `ig:${p.codigo || p.externo_id || p.externoId}`;
  // TikTok, como su enlace (`claveDeEnlace`): el mismo video seguido, en tendencia y guardado en el banco es UNO.
  if (p?.red === "tiktok") return `tt:${p.externo_id ?? p.externoId}`;
  return `${p?.red}:${p?.externo_id ?? p?.externoId}`;
}

export const claveDeAnuncio = (a) => `fb-ad:${a?.anuncio_id ?? a?.id}`;
/** La de un video de tendencia de TikTok (la misma regla que la consulta del cron en acceso.js). Pura. */
export const claveDeTendencia = (v) => `tt:${v?.externo_id ?? v?.externoId ?? v?.id}`;

/** La de una publicación propia (de sus métricas): por su enlace si se reconoce, si no por la red y su id. Pura. */
export function claveDePropia(p) {
  const porEnlace = claveDeEnlace(p?.enlace);
  if (porEnlace && !porEnlace.startsWith("ref:")) return porEnlace;
  return `${p?.red}:${p?.externo_id}`;
}

/** El formato común de las cuatro fuentes: imagen, carrusel o video. Pura. */
export function formatoComun(f) {
  const t = String(f ?? "").toLowerCase();
  if (t === "carrusel" || t === "carousel" || t === "carousel_album") return "carrusel";
  if (["reel", "short", "video", "reels"].includes(t)) return "video";
  return "imagen";
}

// ------------------------------------------------------------
// La señal de cada fuente y su percentil
// ------------------------------------------------------------

/**
 * «rinde X×» corregido cuando la cuenta tiene pocas publicaciones medidas: con 3 publicaciones, un 6× puede ser
 * suerte. Se acerca a 1× (lo normal) en la medida en que falta muestra. Pura.
 */
export function rindeAjustado(rinde, n) {
  if (!Number.isFinite(rinde)) return null;
  const k = Math.max(0, numero(n));
  return Math.round((1 + (rinde - 1) * (k / (k + 4))) * 100) / 100;
}

/** Los días que lleva (o llevó) un anuncio: de su inicio a su fin, o a hoy si sigue activo. Pura. */
export function diasDeAnuncio(a, hoy = fechaEnZona()) {
  const inicio = /^\d{4}-\d{2}-\d{2}/.test(String(a?.inicio ?? "")) ? String(a.inicio).slice(0, 10) : "";
  if (!inicio) return 0;
  const fin = a?.activo ? hoy : /^\d{4}-\d{2}-\d{2}/.test(String(a?.fin ?? "")) ? String(a.fin).slice(0, 10) : hoy;
  return Math.max(0, diasEntre(inicio, fin));
}

/** La señal de un anuncio: los días que lleva, más si sigue activo y si tiene varias versiones. Pura. */
export function senalDeAnuncio(a, hoy = fechaEnZona()) {
  const dias = Math.min(180, diasDeAnuncio(a, hoy));
  const versiones = Math.max(1, Math.min(8, numero(a?.versiones) || 1));
  return Math.round(dias * (a?.activo ? 1.25 : 1) * (1 + 0.25 * (versiones - 1)) * 100) / 100;
}

/**
 * El percentil de cada pieza DENTRO de su fuente (0–100, el rango medio: con empates, la mitad). Las que no tienen señal
 * se quedan sin percentil y van detrás. Pura.
 */
export function conPercentiles(items = []) {
  const porFuente = new Map();
  for (const it of items) {
    if (!Number.isFinite(it?.senal)) continue;
    if (!porFuente.has(it.fuente)) porFuente.set(it.fuente, []);
    porFuente.get(it.fuente).push(it.senal);
  }
  for (const lista of porFuente.values()) lista.sort((a, b) => a - b);
  return items.map((it) => {
    const lista = porFuente.get(it.fuente);
    if (!lista || !Number.isFinite(it.senal)) return { ...it, percentil: null };
    let menores = 0;
    let iguales = 0;
    for (const v of lista) { if (v < it.senal) menores++; else if (v === it.senal) iguales++; }
    return { ...it, percentil: Math.round(((menores + iguales / 2) / lista.length) * 100) };
  });
}

/** ¿Entra en la ventana? `fecha` (ISO o AAAA-MM-DD) en los últimos `dias` días de Panamá. Pura. */
export function enVentana(item, ventana = "semana", hoy = fechaEnZona()) {
  const v = VENTANAS.find((x) => x.id === ventana) ?? VENTANAS[0];
  const f = String(item?.fecha ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  return f >= sumarDias(hoy, -v.dias) && f <= sumarDias(hoy, 1);
}

/**
 * Lo que se enseña de una ventana: lo que entra, con su percentil (calculado SOBRE la ventana) y en orden. «Nuevo» va
 * por fecha; las otras, por percentil y, a igualdad, lo más nuevo. Pura.
 */
export function ordenarLoMejor(items = [], ventana = "semana", hoy = fechaEnZona()) {
  const dentro = conPercentiles(items.filter((it) => enVentana(it, ventana, hoy)));
  const porFecha = (a, b) => String(b.fecha ?? "").localeCompare(String(a.fecha ?? ""));
  if (ventana === "nuevo") return dentro.sort(porFecha);
  return dentro.sort((a, b) => (b.percentil ?? -1) - (a.percentil ?? -1) || (b.senal ?? -1) - (a.senal ?? -1) || porFecha(a, b));
}

/** Filtros de la pantalla: cliente (las que sigue o guardó ese cliente), red, formato, tipo y fuente. Pura. */
export function filtrarLoMejor(items = [], { cliente = "", red = "", formato = "", tipo = "", fuente = "" } = {}) {
  return items.filter((it) => (!cliente || (it.clientes ?? []).includes(cliente))
    && (!red || it.red === red)
    && (!formato || it.formato === formato)
    && (!tipo || it.tipo === tipo)
    && (!fuente || it.fuente === fuente || (it.tambien ?? []).includes(fuente)));
}

const PRIORIDAD_FUENTE = { inspiracion: 0, tendencia: 1, anuncio: 2, propia: 3, referencia: 4 };

/**
 * Una pieza que sale en varias fuentes o de varios clientes es UNA: se queda la que mide mejor (inspiración, tendencia,
 * anuncio, propia, referencia), con los clientes de todas y las fuentes en `tambien`. Pura.
 */
export function unirRepetidas(items = []) {
  const porClave = new Map();
  for (const it of items) {
    const previa = porClave.get(it.clave);
    if (!previa) { porClave.set(it.clave, { ...it, clientes: [...new Set(it.clientes ?? [])], tambien: [] }); continue; }
    const gana = (PRIORIDAD_FUENTE[it.fuente] ?? 9) < (PRIORIDAD_FUENTE[previa.fuente] ?? 9)
      || (it.fuente === previa.fuente && (it.senal ?? -1) > (previa.senal ?? -1));
    const base = gana ? it : previa;
    const otra = gana ? previa : it;
    porClave.set(it.clave, {
      ...base,
      clientes: [...new Set([...(previa.clientes ?? []), ...(it.clientes ?? [])])],
      tambien: [...new Set([...(previa.tambien ?? []), ...(gana ? [previa.fuente] : [it.fuente])].filter((f) => f !== base.fuente))],
      miniatura: base.miniatura || otra.miniatura,
      miniaturaOriginal: base.miniaturaOriginal || otra.miniaturaOriginal,
      video: base.video || otra.video,
      conVideo: Boolean(base.conVideo || otra.conVideo),
      origenes: [...(base.origenes ?? []), ...(otra.origenes ?? [])].slice(0, 8),
    });
  }
  return [...porClave.values()];
}

const veces = (r) => `${String(Math.round(r * 10) / 10).replace(".", ",")}×`;

/**
 * La cifra de verdad de una pieza, sin mezclar unidades: { texto, detalle }. «rinde 4,1×», «63 días activo», «tu mejor
 * del mes», «guardada por el equipo». Pura.
 */
export function cifraDe(it) {
  const c = it?.cifras ?? {};
  if (it?.fuente === "tendencia") {
    const vistas = numero(c.vistas);
    return {
      texto: vistas >= 1e6 ? `${cifraCorta(vistas)} de vistas` : `${cifraCorta(vistas)} vistas`,
      detalle: [`${cifraCorta(c.meGusta)} me gusta`, numero(c.compartidos) ? `${cifraCorta(c.compartidos)} compartidos` : "", c.palabra ? `por ${c.palabra}` : ""].filter(Boolean).join(" · "),
    };
  }
  if (it?.fuente === "anuncio") {
    const dias = numero(c.dias);
    return {
      texto: dias ? `${dias} ${dias === 1 ? "día" : "días"} activo` : "Anuncio",
      detalle: [c.activo ? "sigue activo" : "ya no corre", numero(c.versiones) > 1 ? `${c.versiones} versiones` : ""].filter(Boolean).join(" · "),
    };
  }
  if (it?.fuente === "propia") {
    const detalle = [numero(c.guardados) ? `${c.guardados} guardados` : "", numero(c.compartidos) ? `${c.compartidos} compartidos` : "", `${numero(c.interacciones)} interacciones`].filter(Boolean).join(" · ");
    if (it.mejorDe) return { texto: `Tu mejor ${it.mejorDe === "semana" ? "de la semana" : "del mes"}`, detalle };
    return { texto: Number.isFinite(it.rinde) ? `rinde ${veces(it.rinde)} tu promedio` : "Lo tuyo", detalle };
  }
  if (it?.fuente === "referencia") {
    return { texto: Number.isFinite(it.rinde) ? `rinde ${veces(it.rinde)}` : "Guardada por el equipo", detalle: it.cuenta ? `de ${it.cuenta}` : "" };
  }
  const detalle = [numero(c.vistas) ? `${numero(c.vistas).toLocaleString("es-PA")} vistas` : "", `${numero(c.meGusta).toLocaleString("es-PA")} me gusta`, `${numero(c.comentarios).toLocaleString("es-PA")} comentarios`,
    numero(c.compartidos) ? `${numero(c.compartidos).toLocaleString("es-PA")} compartidos` : ""].filter(Boolean).join(" · ");
  if (Number.isFinite(it?.rindeVistas)) return { texto: `rinde ${veces(it.rindeVistas)} en vistas`, detalle };
  return { texto: Number.isFinite(it?.rinde) ? `rinde ${veces(it.rinde)}` : "Sin medir", detalle };
}

/** Marca «tu mejor de la semana / del mes» en lo propio: la primera de cada cliente en la ventana. Pura. */
export function marcarMejoresPropias(ordenados = [], ventana = "semana") {
  const vistos = new Set();
  return ordenados.map((it) => {
    if (it.fuente !== "propia" || ventana === "nuevo") return it;
    const cliente = it.clientes?.[0] ?? "";
    if (vistos.has(cliente)) return it;
    vistos.add(cliente);
    return { ...it, mejorDe: ventana };
  });
}

// ------------------------------------------------------------
// Cómo se recrea
// ------------------------------------------------------------

/** Los caminos que admite una pieza: grabar sólo si se puede VER el video (bajado, de un anuncio o de YouTube). Pura. */
export function caminosPosibles(it) {
  const lista = ["imagen", "carrusel", "animado"];
  if (it?.conVideo) lista.push("grabar");
  return lista;
}

/**
 * El camino que se propone: el del tipo (si se puede), un carrusel si es un carrusel, y en un video con una persona
 * hablando, para grabar. Pura.
 */
export function caminoPorDefecto(it) {
  const posibles = caminosPosibles(it);
  if (it?.camino && posibles.includes(it.camino)) return it.camino;
  if (it?.formato === "carrusel") return "carrusel";
  const delTipo = tipoPorId(it?.tipo)?.camino ?? "";
  if (it?.formato === "video") {
    if ((it?.persona || delTipo === "grabar") && posibles.includes("grabar")) return "grabar";
    return "animado";
  }
  return delTipo && delTipo !== "grabar" && delTipo !== "animado" ? delTipo : "imagen";
}

/** El formato de la publicación que se crea por cada camino. */
export const FORMATO_DE_CAMINO = Object.freeze({ imagen: "post", carrusel: "carrusel", animado: "reel", grabar: "reel" });

/**
 * El encargo de la recreación en palabras: qué hace que funcione y que hay que hacer una versión PROPIA (sin copiar su
 * texto, su marca ni su producto). Va al director, al guion animado o al guion para grabar. Pura.
 */
export function briefDeRecreacion(it, { marca = "", camino = "" } = {}) {
  const tipo = tipoPorId(it?.tipo);
  const lineas = [
    `Recrear para ${marca || "la marca"} una pieza que está funcionando${it?.cuenta ? ` (de ${it.cuenta})` : ""}: ${cifraDe(it).texto}.`,
    tipo && tipo.id !== "otro" ? `Tipo: ${tipo.nombre}.` : it?.etiqueta ? `Tipo: ${it.etiqueta}.` : "",
    it?.idea ? `Por qué funciona: ${corto(it.idea, 400)}` : "",
    it?.texto ? `Su texto (sólo para entender la idea; NO se copia): «${corto(it.texto, 500)}»` : "",
    camino === "grabar" ? "" : "Haz una versión PROPIA con la misma idea y el mismo gancho, con el producto, los colores y la voz de la marca: que nadie la reconozca como una copia. Nada de su marca, su producto, su texto ni su logo.",
  ];
  return lineas.filter(Boolean).join("\n");
}

/** El título de la publicación que se crea. Pura. */
export function tituloDeRecreacion(it) {
  const tipo = tipoPorId(it?.tipo);
  const que = tipo && tipo.id !== "otro" ? tipo.nombre : it?.etiqueta || FORMATOS_LO_MEJOR[it?.formato] || "Pieza";
  return corto(`Recreación: ${que}${it?.cuenta ? ` de ${it.cuenta}` : ""}`, 90);
}

/** El primer día SIN publicaciones desde `desde` (incluido), mirando hasta `maxDias`. `ocupados`: fechas AAAA-MM-DD. Pura. */
export function proximoDiaLibre(ocupados = [], desde = sumarDias(fechaEnZona(), 1), maxDias = 90) {
  const set = new Set(ocupados);
  for (let i = 0; i < maxDias; i++) {
    const f = sumarDias(desde, i);
    if (!set.has(f)) return f;
  }
  return sumarDias(desde, maxDias);
}

/** El lunes de la semana de una fecha (AAAA-MM-DD, de Panamá): la clave de la semana del tope de créditos. Pura. */
export function semanaDe(fecha = fechaEnZona()) {
  const f = String(fecha).slice(0, 10);
  const dia = new Date(`${f}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(f, -((dia + 6) % 7));
}

// ------------------------------------------------------------
// La clasificación (la IA, una vez por pieza)
// ------------------------------------------------------------

/** El pedido: cada pieza numerada (su miniatura va delante como imagen) con su texto. Pura. */
export function pedidoDeClasificacion(piezas = []) {
  const tipos = TIPOS_LO_MEJOR.map((t) => `${t.id} (${t.nota})`).join(" · ");
  return [
    "Eres analista de contenido de la agencia Juancito Ads. Clasifica cada pieza de redes sociales que va abajo (si tiene miniatura, va delante como «Pieza N»).",
    `Tipos (escoge UNO, el que mejor la describa): ${tipos}.`,
    "Para cada pieza responde: el tipo; si es «otro», cuál (2 a 4 palabras); si sale una persona hablando o actuando a cámara (persona); y la idea: qué hace que funcione en UNA frase (el gancho y la estructura), sin nombrar marcas ni cuentas.",
    'Responde SOLO con JSON: {"piezas":[{"n":1,"tipo":"ugc","otro":"","persona":true,"idea":"…"}]}',
    "",
    ...piezas.map((p, i) => `Pieza ${i + 1} · ${FORMATOS_LO_MEJOR[p.formato] ?? "Pieza"}${p.red ? ` de ${REDES_LO_MEJOR[p.red]?.nombre ?? p.red}` : ""}${p.miniatura ? "" : " (sin miniatura)"}\nTexto: ${corto(p.texto, 600) || "(sin texto)"}`),
  ].join("\n");
}

/** La respuesta → { n → { tipo, etiqueta, persona, idea } }, sólo de las piezas que hay. Pura. */
export function leerClasificacion(texto, total) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return {};
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return {}; }
  const salida = {};
  for (const p of Array.isArray(d?.piezas) ? d.piezas : []) {
    const n = Math.floor(Number(p?.n));
    if (!(n >= 1 && n <= total) || salida[n]) continue;
    const tipo = tipoPorId(p?.tipo) ? String(p.tipo) : "otro";
    salida[n] = {
      tipo,
      etiqueta: tipo === "otro" ? corto(p?.otro || p?.tipo, 40) : "",
      persona: p?.persona === true,
      idea: corto(p?.idea, 300),
    };
  }
  return salida;
}

/** El nombre del tipo de una pieza ya clasificada (o "" sin clasificar). Pura. */
export function nombreDelTipo(it) {
  if (!it?.tipo) return "";
  if (it.tipo === "otro") return it.etiqueta || "Otro";
  return tipoPorId(it.tipo)?.nombre ?? "";
}

// ------------------------------------------------------------
// Del servidor a la pantalla y al banco
// ------------------------------------------------------------

const HOSTS_MINIATURA = /(^|\.)(cdninstagram\.com|fbcdn\.net|tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|ytimg\.com)$/;
// TikTok también: su dirección caduca en horas y puede no contestar sin su cookie; si no se reproduce, la tarjeta
// enseña la miniatura y «Ver el original».
const HOSTS_VIDEO = /(^|\.)(cdninstagram\.com|fbcdn\.net|tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|tiktokv\.com|tiktokv\.us)$/;

/** ¿Una miniatura que se puede pedir por el proxy de miniaturas (y mirar desde el Worker)? Pura. */
export function miniaturaPermitida(url) {
  try {
    const u = new URL(String(url ?? ""));
    return u.protocol === "https:" && HOSTS_MINIATURA.test(u.hostname);
  } catch {
    return false;
  }
}

/** ¿Un video del CDN de Meta (o de TikTok), que se puede reproducir por el proxy de videos? Pura. */
export function videoPermitido(url) {
  try {
    const u = new URL(String(url ?? ""));
    return u.protocol === "https:" && HOSTS_VIDEO.test(u.hostname);
  } catch {
    return false;
  }
}

export const proxyMiniatura = (u) => (miniaturaPermitida(u) ? `/api/metricas/miniatura?u=${encodeURIComponent(u)}` : "");
export const proxyVideo = (u) => (videoPermitido(u) ? `/api/lo-mejor/video?u=${encodeURIComponent(u)}` : "");

/**
 * Una pieza → la idea del banco: con el enlace, la miniatura, la cifra y el archivo (si se trajo) como REFERENCIA. Así
 * «rinde 4,1×» y la vista viajan con ella (antes quedaban como texto y sin miniatura). Pura.
 */
export function ideaDeLoMejor(it, { id = "", archivo = null } = {}) {
  const cifra = cifraDe(it);
  const tipo = nombreDelTipo(it);
  return {
    id,
    idea: corto([`${tipo || FORMATOS_LO_MEJOR[it?.formato] || "Referencia"}${it?.cuenta ? ` de ${it.cuenta}` : ""} · ${cifra.texto}`, it?.idea].filter(Boolean).join(". "), 600),
    format: it?.formato === "carrusel" ? "carrusel" : it?.formato === "video" ? "reel" : "post",
    referenceLink: it?.enlace ?? "",
    ...(it?.miniaturaOriginal ? { miniatura: it.miniaturaOriginal } : {}),
    ...(Number.isFinite(it?.rinde) ? { rinde: it.rinde } : {}),
    cifra: cifra.texto,
    loMejor: { clave: it?.clave ?? "", fuente: it?.fuente ?? "", tipo: it?.tipo ?? "" },
    ...(archivo?.src ? { archivos: [{ src: archivo.src, tipo: archivo.tipo === "video" ? "video" : "imagen", id: archivo.id, ...(it?.cuenta ? { cuenta: it.cuenta } : {}), ...(it?.enlace ? { enlace: it.enlace } : {}) }] } : {}),
    tags: [],
    status: "pending",
  };
}
