// ============================================================
// CERRAR EL CICLO: qué publicación del calendario es cada anuncio que corre (curso de campañas, entrega 7; puro)
//
// En el Ads Manager un anuncio se monta de dos formas: escogiendo una publicación que ya salió (su «identidad» es la de
// esa publicación: el mismo id, los mismos comentarios y «me gusta»), o subiendo la pieza (un anuncio NUEVO, que Meta
// trata como otra cosa aunque la imagen sea la misma). El creativo de cada anuncio dice qué publicación usa
// (`effective_object_story_id`, `effective_instagram_media_id`…) y la cola guarda el id que Meta le dio a cada
// publicación al salir (`publicaciones_programadas.externo_id`, por red): casándolos se sabe qué publicación del
// calendario está en pauta, en qué etapa y a cuánto sale cada resultado.
//
// Lo que se guarda por cliente (`anuncios_clientes.en_pauta`, 0073) cada vez que se lee la revisión 3Q (y en el repaso
// diario del cron):
//
//   { v: 1, leidoAt, cuenta, moneda, referencia (el número mágico de ese día), creativo ("completo" | "basico" |
//     "sin-dato": lo que Meta dejó leer del creativo), externos (los ids de Meta de lo que se pautó, para no
//     sugerirlo otra vez), sinPublicacion: { nuevo, otra, sinDato, lista },
//     publicaciones: { "<calendario>|<publicación>": {
//       calendarId, postId, red, activo, desde, visto, etapa, nombreEtapa, tipoResultado, nombreResultado,
//       d7: { gasto, resultados, costo }, d30, anuncios: [ … hasta 6 ], post: { fecha, titulo, formato, miniatura,
//       pilar, composicion, composicionNombre, nivel, tactica, tipoArte, pautaEtapa, productoId } } } }
//
// Lo que deja de correr no se borra en el momento: queda `activo: false` con sus últimas cifras (sus perdedores son lo
// que más enseña: probar varios y quedarse con lo que funciona) y se olvida a los `DIAS_SIN_PAUTA` días.
//
// También aquí: lo ORGÁNICO que rindió y no se ha pautado (`paraPautar`), con la misma medida que «Lo mejor» usa para lo
// propio (interacciones + guardados + compartidos frente a la mediana de su cuenta). Con palabras propias: la licencia
// del método del curso no deja copiar su texto.
// ============================================================

import { miniaturaDe } from "./estadoChip.js";
import { formatoMoneda } from "./anuncios.js";
import { sumarDias } from "./agenda.js";

/** Lo que se guarda, como mucho. */
export const MAX_PUBLICACIONES = 200;
export const MAX_ANUNCIOS_POR_PUBLICACION = 6;
export const MAX_SIN_PUBLICACION = 30;
export const MAX_EXTERNOS = 500;
/** Una publicación que dejó de correr se recuerda (con sus últimas cifras) estos días. */
export const DIAS_SIN_PAUTA = 120;
/** «Para pautar»: lo publicado de estos últimos días, que rindió al menos tanto frente a su cuenta. */
export const DIAS_PARA_PAUTAR = 60;
export const RINDE_PARA_PAUTAR = 1.5;
export const MAX_PARA_PAUTAR = 10;
/** La mediana de una cuenta no dice nada con menos publicaciones medidas. */
const MIN_MEDIDAS_CUENTA = 3;

const DIA = 86_400_000;
const ID = /^\d{1,30}(?:_\d{1,30})?$/;
const idMeta = (x) => {
  const s = String(x ?? "").trim();
  return ID.test(s) ? s : "";
};
const num = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
const r2 = (n) => Math.round(n * 100) / 100;
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const dias = (de, a) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA);
const fechaCorta = (iso) => {
  const t = Date.parse(`${String(iso ?? "").slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" }) : "";
};

/** La clave de una publicación del calendario. */
export const clavePublicacion = (calendarId, postId) => `${calendarId}|${postId}`;

/** La dirección que abre esa publicación en su calendario (App lee `?publicacion=`). Pura. */
export const direccionDePublicacion = (cliente, calendarId, postId) =>
  `/cliente/${encodeURIComponent(cliente)}/${encodeURIComponent(calendarId)}?publicacion=${encodeURIComponent(postId)}`;

// ------------------------------------------------------------
// El creativo de un anuncio y la cola
// ------------------------------------------------------------

/** El código corto de una publicación de Instagram en su enlace (`/p/<código>/`, `/reel/<código>/`), o "". Pura. */
export function codigoInstagram(url) {
  const m = /instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]{5,40})/i.exec(String(url ?? ""));
  return m ? m[1] : "";
}

/** La parte de la publicación de un id de Facebook «<página>_<publicación>» (o el id entero si no lleva página). */
const partePost = (id) => (id ? String(id).split("_").pop() : "");

/**
 * Lo que dice el creativo de un anuncio de la publicación que usa, limpio (sólo ids de Meta), o null sin creativo.
 * `historia`: la publicación de la página que corre (también la «oscura» de un anuncio nuevo); `objeto`: la que se
 * escogió ya hecha; `instagram`: la de Instagram que corre; `origen`: la de Instagram que se escogió ya hecha. Pura.
 */
export function creativoDe(c) {
  if (!esObjeto(c)) return null;
  return {
    id: idMeta(c.id),
    historia: idMeta(c.effective_object_story_id),
    objeto: idMeta(c.object_story_id),
    instagram: idMeta(c.effective_instagram_media_id),
    origen: idMeta(c.source_instagram_media_id),
    codigo: codigoInstagram(c.instagram_permalink_url),
  };
}

/**
 * Las publicaciones que salieron desde la cola, por cada id que Meta les dio → { calendarId, postId, red }. La historia
 * de un post no cuenta: no se pauta como publicación. Pura.
 */
export function indiceDeSalidas(salidas = []) {
  const m = new Map();
  for (const f of Array.isArray(salidas) ? salidas : []) {
    if (!f?.calendar_id || !f.post_id || f.variante === "historia") continue;
    const pub = { calendarId: String(f.calendar_id), postId: String(f.post_id), red: f.red };
    const ext = idMeta(f.externo_id);
    if (f.red === "instagram") {
      if (ext) m.set(`ig:${ext}`, pub);
      const cod = codigoInstagram(f.enlace);
      if (cod) m.set(`ig-codigo:${cod}`, pub);
    } else if (f.red === "facebook" && ext) {
      m.set(`fb:${ext}`, pub);
      // Un video de la página guarda su id suelto; el anuncio lo nombra «<página>_<publicación>».
      m.set(`fb-post:${partePost(ext)}`, pub);
    }
  }
  return m;
}

/** La publicación del calendario que usa un anuncio (con por qué id casó), o null. Pura. */
export function casarCreativo(cr, indice) {
  if (!cr || !indice?.size) return null;
  const pruebas = [
    ["ig", cr.origen], ["ig", cr.instagram], ["ig-codigo", cr.codigo],
    ["fb", cr.objeto], ["fb", cr.historia], ["fb-post", partePost(cr.objeto)], ["fb-post", partePost(cr.historia)],
  ];
  for (const [tipo, v] of pruebas) {
    if (v && indice.has(`${tipo}:${v}`)) return { ...indice.get(`${tipo}:${v}`), por: tipo };
  }
  return null;
}

/** Por qué un anuncio no casó con ninguna publicación del calendario. */
export const TEXTO_SIN_PUBLICACION = Object.freeze({
  nuevo: "Anuncio nuevo, sin publicación del calendario (se montó subiendo la pieza).",
  otra: "Usa una publicación ya hecha que no salió desde el calendario (se publicó a mano o antes de usar la aplicación).",
  "sin-dato": "Meta no dijo qué publicación usa.",
});

/** De un anuncio sin publicación del calendario: «nuevo» (se subió la pieza), «otra» (una publicación de fuera) o «sin-dato». Pura. */
export function tipoSinCasar(cr) {
  if (!cr) return "sin-dato";
  return cr.objeto || cr.origen || cr.codigo ? "otra" : "nuevo";
}

/** Los ids de Meta de las publicaciones que usa un anuncio («instagram:<id>», «facebook:<id>»). Pura. */
export function externosDe(cr) {
  if (!cr) return [];
  return [...new Set([
    cr.origen && `instagram:${cr.origen}`, cr.instagram && `instagram:${cr.instagram}`,
    cr.objeto && `facebook:${cr.objeto}`, cr.historia && `facebook:${cr.historia}`,
  ].filter(Boolean))];
}

// ------------------------------------------------------------
// Lo que se guarda
// ------------------------------------------------------------

/** Unas cifras de cifras3q (src/lib/tresQ.js) → { gasto, resultados, costo }, o null. Pura. */
export function cifraCorta(c) {
  if (!c) return null;
  const gasto = r2(num(c.gasto));
  const resultados = num(c.resultados);
  const costo = c.costoPorResultado != null ? r2(num(c.costoPorResultado)) : resultados > 0 ? r2(gasto / resultados) : null;
  return { gasto, resultados, costo };
}

/** Varias cifras cortas sumadas (el costo, del total). Pura. */
function sumarCifras(lista) {
  const v = lista.filter(Boolean);
  if (!v.length) return null;
  const gasto = r2(v.reduce((s, c) => s + num(c.gasto), 0));
  const resultados = v.reduce((s, c) => s + num(c.resultados), 0);
  return { gasto, resultados, costo: resultados > 0 ? r2(gasto / resultados) : null };
}

/**
 * Lo que se recuerda de la publicación (para pintarla sin leer su calendario y para aprender de ella). `fecha`: el día
 * del calendario; `nombreComposicion`: id → su nombre (lib/loteAnuncios.js, que es grande: lo pone quien llama). Pura.
 */
export function fotoDePublicacion(post, fecha = "", { nombreComposicion = null } = {}) {
  if (!esObjeto(post)) return null;
  const mini = miniaturaDe(post);
  const texto = String(post.descripcion || post.script || "").trim().split(/\n/)[0];
  const etapa = esObjeto(post.pauta) ? corto(post.pauta.etapa, 20) : "";
  const composicion = corto(post.composicion, 40);
  const nombre = composicion && typeof nombreComposicion === "function" ? corto(nombreComposicion(composicion), 60) : "";
  return {
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? String(fecha) : "",
    titulo: corto(post.title || post.idea || texto, 80),
    formato: corto(post.format, 20),
    miniatura: mini?.src && /^\/api\/media\//.test(mini.src) ? mini.src : "",
    pilar: corto(post.pilar, 40), composicion, ...(nombre ? { composicionNombre: nombre } : {}),
    nivel: corto(esObjeto(post.pauta) && post.pauta.nivel ? post.pauta.nivel : post.nivel, 20),
    tactica: corto(post.tactica, 40), tipoArte: corto(post.tipoArte, 40),
    pautaEtapa: etapa, productoId: corto(post.productoId, 80),
  };
}

/** Un anuncio de la revisión (o del cron) como se guarda. */
function anuncioGuardado(a) {
  return {
    id: String(a.id), nombre: corto(a.nombre, 120), campanaId: String(a.campanaId ?? ""), campana: corto(a.campana, 120),
    conjuntoId: String(a.conjuntoId ?? ""), etapa: corto(a.etapa, 20), nombreEtapa: corto(a.nombreEtapa, 30),
    tipoResultado: corto(a.tipoResultado, 20), nombreResultado: corto(a.nombreResultado, 40), objetivo: corto(a.objetivo, 40),
    enlace: /^https:\/\/adsmanager\.facebook\.com\//.test(String(a.enlace ?? "")) ? String(a.enlace) : "",
    ...(a.veredicto ? { veredicto: corto(a.veredicto, 40) } : {}),
    d7: cifraCorta(a.d7), d30: cifraCorta(a.d30),
  };
}

/** El resumen de una publicación con sus anuncios: la etapa del que más gastó y las cifras de los de su mismo resultado. */
function resumenDeAnuncios(anuncios) {
  const orden = [...anuncios].sort((a, b) => num(b.d30?.gasto ?? b.d7?.gasto) - num(a.d30?.gasto ?? a.d7?.gasto));
  const principal = orden[0];
  const mismos = orden.filter((a) => a.tipoResultado === principal.tipoResultado);
  return {
    etapa: principal.etapa, nombreEtapa: principal.nombreEtapa, tipoResultado: principal.tipoResultado, nombreResultado: principal.nombreResultado,
    d7: sumarCifras(mismos.map((a) => a.d7)), d30: sumarCifras(mismos.map((a) => a.d30)),
    anuncios: orden.slice(0, MAX_ANUNCIOS_POR_PUBLICACION),
  };
}

/** Lo guardado, limpio (o vacío). Pura. */
export function limpiarEnPauta(x) {
  const d = typeof x === "string" ? (() => { try { return JSON.parse(x); } catch { return null; } })() : x;
  if (!esObjeto(d)) return { v: 1, publicaciones: {}, externos: [], sinPublicacion: { nuevo: 0, otra: 0, sinDato: 0, lista: [] } };
  const publicaciones = {};
  for (const [k, e] of Object.entries(esObjeto(d.publicaciones) ? d.publicaciones : {}).slice(0, MAX_PUBLICACIONES)) {
    if (!esObjeto(e) || !e.calendarId || !e.postId || clavePublicacion(e.calendarId, e.postId) !== k) continue;
    publicaciones[k] = { ...e, activo: e.activo === true, anuncios: Array.isArray(e.anuncios) ? e.anuncios.slice(0, MAX_ANUNCIOS_POR_PUBLICACION) : [] };
  }
  const sin = esObjeto(d.sinPublicacion) ? d.sinPublicacion : {};
  return {
    v: 1, leidoAt: typeof d.leidoAt === "string" ? d.leidoAt : null, cuenta: corto(d.cuenta, 40), moneda: corto(d.moneda, 5) || "USD",
    referencia: num(d.referencia) > 0 ? num(d.referencia) : null,
    creativo: ["completo", "basico", "sin-dato"].includes(d.creativo) ? d.creativo : "",
    publicaciones,
    externos: (Array.isArray(d.externos) ? d.externos : []).filter((e) => /^(instagram|facebook):[\d_]{1,62}$/.test(String(e))).slice(0, MAX_EXTERNOS),
    sinPublicacion: {
      nuevo: num(sin.nuevo), otra: num(sin.otra), sinDato: num(sin.sinDato),
      lista: (Array.isArray(sin.lista) ? sin.lista : []).slice(0, MAX_SIN_PUBLICACION),
    },
  };
}

/**
 * Lo nuevo de `en_pauta` con lo que corre ahora. `anuncios`: los encendidos, ya normalizados ({ id, nombre, campanaId,
 * campana, conjuntoId, etapa, nombreEtapa, tipoResultado, nombreResultado, objetivo, enlace, veredicto?, d7, d30
 * (cifras de tresQ), creativo }); `indice`: el de la cola; `posts`: clave → lo que se recuerda de la publicación
 * (`fotoDePublicacion`); `previo`: lo guardado; `hoy`: AAAA-MM-DD de Panamá.
 * → { enPauta, porAnuncio: Map(id → { publicacion } | { sinPublicacion: { tipo, texto } }) }. Pura.
 */
export function juntarEnPauta({ anuncios = [], indice = new Map(), posts = new Map(), previo = null, hoy = "", leidoAt = "", cuenta = "", moneda = "USD", referencia = null, creativo = "completo" } = {}) {
  const antes = limpiarEnPauta(previo);
  const grupos = new Map();
  const porAnuncio = new Map();
  const sin = { nuevo: 0, otra: 0, sinDato: 0, lista: [] };
  const externos = new Set(antes.externos);
  for (const a of anuncios) {
    if (!a?.id) continue;
    for (const e of externosDe(a.creativo)) externos.add(e);
    const pub = casarCreativo(a.creativo, indice);
    if (!pub) {
      const tipo = creativo === "sin-dato" ? "sin-dato" : tipoSinCasar(a.creativo);
      sin[tipo === "sin-dato" ? "sinDato" : tipo]++;
      if (sin.lista.length < MAX_SIN_PUBLICACION) sin.lista.push({ id: String(a.id), nombre: corto(a.nombre, 120), campana: corto(a.campana, 120), tipo });
      porAnuncio.set(String(a.id), { sinPublicacion: { tipo, texto: TEXTO_SIN_PUBLICACION[tipo] } });
      continue;
    }
    const k = clavePublicacion(pub.calendarId, pub.postId);
    if (!grupos.has(k)) grupos.set(k, { ...pub, lista: [] });
    grupos.get(k).lista.push(anuncioGuardado(a));
  }

  const publicaciones = {};
  for (const [k, g] of grupos) {
    const previa = antes.publicaciones[k];
    const post = posts.get(k) ?? previa?.post ?? null;
    publicaciones[k] = {
      calendarId: g.calendarId, postId: g.postId, red: g.red, activo: true,
      desde: previa?.desde || hoy, visto: hoy, ...resumenDeAnuncios(g.lista), ...(post ? { post } : {}),
    };
    for (const a of g.lista) porAnuncio.set(a.id, { publicacion: { calendarId: g.calendarId, postId: g.postId, red: g.red, ...(post ? { post } : {}) } });
  }
  // Lo que dejó de correr: con sus últimas cifras, hasta que se olvida.
  for (const [k, e] of Object.entries(antes.publicaciones)) {
    if (publicaciones[k]) continue;
    const visto = e.visto || hoy;
    if (hoy && dias(visto, hoy) > DIAS_SIN_PAUTA) continue;
    publicaciones[k] = { ...e, activo: false, ...(posts.get(k) ? { post: posts.get(k) } : {}) };
  }
  // Si no caben, se quedan las que corren y luego las vistas más tarde.
  const lista = Object.entries(publicaciones)
    .sort(([, a], [, b]) => Number(b.activo) - Number(a.activo) || String(b.visto ?? "").localeCompare(String(a.visto ?? "")))
    .slice(0, MAX_PUBLICACIONES);
  return {
    enPauta: {
      v: 1, leidoAt: leidoAt || null, cuenta: corto(cuenta, 40), moneda: corto(moneda, 5) || "USD",
      referencia: num(referencia) > 0 ? r2(num(referencia)) : null, creativo,
      publicaciones: Object.fromEntries(lista), externos: [...externos].slice(-MAX_EXTERNOS), sinPublicacion: sin,
    },
    porAnuncio,
  };
}

// ------------------------------------------------------------
// Cómo se dice
// ------------------------------------------------------------

const SINGULAR = Object.freeze({
  conversaciones: "conversación", compras: "compra", "clientes potenciales": "cliente potencial", clics: "clic",
  interacciones: "interacción", "personas alcanzadas": "persona alcanzada", resultados: "resultado",
});
/** «conversaciones» → «conversación». Pura. */
export const singularDe = (nombre) => SINGULAR[nombre] ?? "resultado";

/** El costo que se enseña: el de 7 días si tiene resultados; si no, el de 30. → { ventana, costo } o null. */
function costoQueSeEnsena(e) {
  if (e?.d7?.resultados > 0 && e.d7.costo != null) return { ventana: 7, costo: e.d7.costo };
  if (e?.d30?.resultados > 0 && e.d30.costo != null) return { ventana: 30, costo: e.d30.costo };
  return null;
}

/**
 * Cómo se dice que una publicación está en pauta: «En pauta · Presentación · 1,20 US$ por conversación (7 días)» o,
 * si ya no corre, «Estuvo en pauta hasta el 3 nov · …». Pura.
 */
export function lineaEnPauta(e, moneda = "USD") {
  if (!e) return "";
  const c = costoQueSeEnsena(e);
  const resultado = singularDe(e.nombreResultado);
  const cuanto = c
    ? `${formatoMoneda(c.costo, moneda)} por ${resultado} (${c.ventana} días)`
    : e.d7?.gasto > 0 ? `${formatoMoneda(e.d7.gasto, moneda)} en 7 días sin ${e.nombreResultado || "resultados"}`
      : e.activo ? "sin gasto en 7 días" : "";
  const cuando = e.activo ? "En pauta" : `Estuvo en pauta hasta el ${fechaCorta(e.visto)}`;
  return [cuando, e.nombreEtapa, cuanto].filter(Boolean).join(" · ");
}

/** El texto de la publicación de un anuncio (la revisión, el asistente y Claude). Pura. */
export function textoDePublicacionDeAnuncio(x) {
  if (x?.publicacion) {
    const p = x.publicacion.post;
    const fecha = p?.fecha ? `del ${fechaCorta(p.fecha)}` : "";
    return [`Publicación del calendario ${fecha}`.trim(), p?.titulo ? `«${p.titulo}»` : "", `(ID ${x.publicacion.postId})`].filter(Boolean).join(" ");
  }
  if (x?.sinPublicacion) return x.sinPublicacion.texto;
  return "";
}

/** Lo que el panel de una publicación necesita de su entrada (sin lo interno). Pura. */
export function entradaPublica(e, moneda = "USD") {
  if (!e) return null;
  return {
    calendarId: e.calendarId, postId: e.postId, red: e.red, activo: Boolean(e.activo), desde: e.desde ?? "", visto: e.visto ?? "",
    etapa: e.etapa ?? "", nombreEtapa: e.nombreEtapa ?? "", nombreResultado: e.nombreResultado ?? "",
    d7: e.d7 ?? null, d30: e.d30 ?? null, linea: lineaEnPauta(e, moneda),
    anuncios: (e.anuncios ?? []).map((a) => ({ id: a.id, nombre: a.nombre, campana: a.campana, nombreEtapa: a.nombreEtapa, enlace: a.enlace })),
  };
}

// ------------------------------------------------------------
// «Para pautar»: lo orgánico que rindió y no se ha pautado
// ------------------------------------------------------------

/** La mediana de una lista de números. Pura. */
export function mediana(lista) {
  const v = lista.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** La medida de lo propio, la de «Lo mejor» (worker/lib/loMejor.js): interacciones + guardados + compartidos. */
export const valorPropio = (f) => num(f?.interacciones) + num(f?.guardados) + num(f?.compartidos);

/** Lo que no se pauta como publicación: una historia caduca en un día; un texto sin imagen casi no se pauta. */
const NO_SE_PAUTA = new Set(["historia", "texto"]);

/**
 * Lo publicado que rindió (frente a la mediana de SU cuenta, con al menos 3 medidas) y no se ha pautado. `medidas`:
 * las filas de `metricas_publicacion` del cliente (todas: las viejas cuentan para la mediana); `salidas`: la cola
 * publicada; `enPauta`: lo guardado; `hoy`: AAAA-MM-DD. Lo que ya corre o corrió (por su publicación del calendario o
 * por el id de Meta que usó un anuncio) no sale. → [{ clave, red, externoId, tipo, enlace, texto, miniatura,
 * publicadaAt, valor, rinde, cifras, calendarId?, postId? }], la que más rindió primero. Pura.
 */
export function paraPautar({ medidas = [], salidas = [], enPauta = null, hoy = "", dias: ventana = DIAS_PARA_PAUTAR, minRinde = RINDE_PARA_PAUTAR, max = MAX_PARA_PAUTAR } = {}) {
  const guardado = limpiarEnPauta(enPauta);
  const ya = new Set(guardado.externos);
  const indice = indiceDeSalidas(salidas);
  const filas = (Array.isArray(medidas) ? medidas : []).filter((f) => f?.externo_id && !NO_SE_PAUTA.has(f.tipo));
  const porCuenta = new Map();
  for (const f of filas) {
    if (!porCuenta.has(f.cuenta_id)) porCuenta.set(f.cuenta_id, []);
    porCuenta.get(f.cuenta_id).push(valorPropio(f));
  }
  const medianas = new Map([...porCuenta].map(([k, v]) => [k, { mediana: mediana(v), n: v.length }]));
  // Desde la medianoche de Panamá (UTC−5) de hace `ventana` días, como lo compara Resultados.
  const desde = hoy ? `${sumarDias(hoy, -ventana)}T05:00:00` : "";
  const salida = [];
  const vistos = new Set();
  for (const f of filas) {
    if (desde && String(f.publicada_at ?? "") < desde) continue;
    const m = medianas.get(f.cuenta_id);
    if (!m || m.n < MIN_MEDIDAS_CUENTA || !(m.mediana > 0)) continue;
    const rinde = Math.round((valorPropio(f) / m.mediana) * 10) / 10;
    if (rinde < minRinde) continue;
    if (ya.has(`${f.red}:${f.externo_id}`)) continue;
    const pub = f.red === "instagram" ? indice.get(`ig:${f.externo_id}`) : f.red === "facebook" ? indice.get(`fb:${f.externo_id}`) : null;
    if (pub && guardado.publicaciones[clavePublicacion(pub.calendarId, pub.postId)]) continue;
    // La misma publicación del calendario, salida en Instagram y en Facebook: una vez (la que más rindió).
    const k = pub ? clavePublicacion(pub.calendarId, pub.postId) : `${f.red}:${f.externo_id}`;
    salida.push({
      clave: k, red: f.red, externoId: String(f.externo_id), tipo: f.tipo ?? "", enlace: String(f.enlace ?? ""),
      texto: corto(f.texto, 300), miniatura: String(f.miniatura ?? ""), publicadaAt: f.publicada_at ?? "",
      valor: valorPropio(f), rinde,
      cifras: { interacciones: num(f.interacciones), guardados: num(f.guardados), compartidos: num(f.compartidos), alcance: num(f.alcance), vistas: num(f.vistas) },
      ...(pub ? { calendarId: pub.calendarId, postId: pub.postId } : {}),
    });
  }
  salida.sort((a, b) => b.rinde - a.rinde || b.valor - a.valor);
  return salida.filter((x) => (vistos.has(x.clave) ? false : (vistos.add(x.clave), true))).slice(0, max);
}

/** «Rindió 3,4× su promedio: páutala en Evaluación.» Pura. */
export function fraseParaPautar(rinde, nombreEtapa) {
  const veces = String(Math.round(num(rinde) * 10) / 10).replace(".", ",");
  return `Rindió ${veces}× su promedio${nombreEtapa ? `: páutala en ${nombreEtapa}` : ""}.`;
}
