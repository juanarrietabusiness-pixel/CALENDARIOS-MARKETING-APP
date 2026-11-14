// ============================================================
// LOS ANUNCIOS DEL PLAN DE CAMPAÑAS: qué va a hacer la agencia, qué anuncio va en cada hueco y sus textos (puro)
//
// Las campañas se MONTAN en el Ads Manager; el plan (src/lib/planCiclo.js) da todo lo que se va a poner allí, también
// los ANUNCIOS de cada conjunto y SUS TEXTOS (decisión de la agencia del 14 de noviembre). Aquí:
//
//   · `limpiarQue()`        — «¿Qué vas a hacer?»: qué campañas (el ciclo completo o sólo las escogidas), qué productos
//                             (el foco, varios o todo el catálogo) y «lo que quieres lograr» (texto libre que lee la IA).
//                             Se guarda con el plan del mes (`planes_campana`, `datos.ajustes.que`).
//   · `limpiarAnunciosPlan()` — lo decidido de cada hueco de anuncio («<campaña>:a<n>»): la publicación escogida (de
//                             cualquier mes, publicada o no) o «anuncio nuevo» (sin publicación), cómo se monta y sus
//                             textos. Se guarda con el plan (`datos.anuncios`).
//   · `pedidoDeTextosPlan()` / `leerTextosPlan()` — el pedido a la IA de los textos de unos anuncios: con la etapa, su
//                             NIVEL de consciencia y cómo hablarle (src/lib/textosNivel.js), los productos con su precio,
//                             lo que dice la publicación escogida, lo que la agencia quiere lograr y la regla del anuncio
//                             (lib/pauta.js). Con la publicación ya subida («Usar publicación existente» del Ads Manager)
//                             el texto principal ES su caption y sólo se escriben el TÍTULO y la DESCRIPCIÓN; subiendo
//                             la pieza, de 3 a 5 textos principales, títulos, descripción y botón (la forma de
//                             `post.anuncio`).
// ============================================================

import { limpiarAnuncio, cortarEnPalabra, MIN_TEXTOS, MAX_TEXTOS, MAX_TITULOS, MAX_TITULO_ANUNCIO, MAX_DESCRIPCION_ANUNCIO, BOTONES_PAUTA, nombreDeBoton } from "./pauta.js";
import { tablaDeNiveles, nombreNivelTexto } from "./textosNivel.js";
import { miniaturaDe } from "./estadoChip.js";

/** Las campañas que se pueden escoger (las cuatro del ciclo y la de temporada). */
export const CAMPANAS_DEL_PLAN = Object.freeze(["presentacion", "evaluacion", "conversion", "ascension", "temporada"]);
/** Qué productos lleva el plan. */
export const MODOS_PRODUCTOS = Object.freeze([
  { id: "foco", nombre: "Un producto (el foco del mes)", ayuda: "Todo el plan habla de un producto: el foco de la estrategia del mes, o el que escojas." },
  { id: "varios", nombre: "Varios productos", ayuda: "Los que escojas del catálogo: los anuncios se reparten entre ellos." },
  { id: "todos", nombre: "Todo el catálogo", ayuda: "Una campaña de la marca, sin centrarse en un producto." },
]);
export const MAX_LOGRO = 600;
export const MAX_PRODUCTOS_PLAN = 20;
/** Los huecos de anuncio que se escriben en una sola llamada a la IA. */
export const MAX_TEXTOS_POR_LLAMADA = 8;

/** Para qué sirve cada campaña y a quién le habla, en una frase (lo que ve quien abre el plan). */
export const PARA_QUE_CAMPANA = Object.freeze({
  presentacion: "Para gente que todavía no te conoce: aquí van los anuncios que enganchan y dan a conocer la marca.",
  evaluacion: "Para quien ya te vio o interactuó contigo: anuncios que responden sus dudas y lo convencen.",
  conversion: "Para quien ya te escribió o está por comprar: el empujón final, con la prueba, la garantía o la oferta.",
  ascension: "Para quien ya te compró: que vuelva por otro producto, el complemento o una promoción para clientes.",
  temporada: "Para una fecha o una oferta con día de fin: corre sólo esos días, con su presupuesto aparte.",
});

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n).trim();
const conLineas = (t, n) => String(t ?? "").replace(/\\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n).trim();
const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const ID_HUECO = /^(presentacion|evaluacion|conversion|ascension|temporada):a([1-9])$/;

/** El id de un hueco de anuncio («presentacion:a2»): el mismo que el paso de la guía. Pura. */
export const idDeHueco = (campana, n) => `${campana}:a${n}`;
/** «presentacion:a2» → { campana, n } o null. Pura. */
export function huecoDeId(id) {
  const m = ID_HUECO.exec(String(id ?? ""));
  return m ? { campana: m[1], n: Number(m[2]) } : null;
}

/** «¿Qué vas a hacer?», limpio. `campanas` vacía = el ciclo completo del mes. Pura. */
export function limpiarQue(x) {
  const q = esObjeto(x) ? x : {};
  const campanas = [...new Set((Array.isArray(q.campanas) ? q.campanas : []).filter((c) => CAMPANAS_DEL_PLAN.includes(c)))];
  const productos = MODOS_PRODUCTOS.some((m) => m.id === q.productos) ? q.productos : "foco";
  const productoIds = [...new Set((Array.isArray(q.productoIds) ? q.productoIds : []).map((id) => corto(id, 80)).filter(Boolean))].slice(0, MAX_PRODUCTOS_PLAN);
  return { campanas, productos, productoIds, logro: conLineas(q.logro, MAX_LOGRO) };
}

/** ¿Es el «¿Qué vas a hacer?» de siempre (todo el ciclo, el foco, sin nada escrito)? Pura. */
export const queDeSiempre = (q) => {
  const x = limpiarQue(q);
  return !x.campanas.length && x.productos === "foco" && !x.productoIds.length && !x.logro;
};

/** Los textos de un anuncio del plan, limpios (la forma de `post.anuncio`: lib/pauta.js); null sin nada. Pura. */
export function limpiarTextosPlan(x, { destino = "" } = {}) {
  if (!esObjeto(x)) return null;
  const a = limpiarAnuncio({ ...x, textos: Array.isArray(x.textos) ? x.textos : [] }, { destino });
  if (a) return a;
  const descripcion = cortarEnPalabra(x.descripcion, MAX_DESCRIPCION_ANUNCIO);
  if (!descripcion) return null;
  return { textos: [], titulos: [], descripcion, boton: limpiarAnuncio({ titulos: ["-"], boton: x.boton }, { destino }).boton };
}

const pieza = (p) => (esObjeto(p) && corto(p.calendarId, 80) && corto(p.postId, 80) ? { calendarId: corto(p.calendarId, 80), postId: corto(p.postId, 80) } : null);

/**
 * Lo decidido de cada hueco de anuncio, limpio: { "<campaña>:a<n>": { pieza?: { calendarId, postId }, nuevo?: true,
 * como?: "publicacion" | "subir", textos?, editado?: true (lo escribió una persona), ia?: true, por?, at? } }. Un hueco
 * sin nada que decir no se guarda. Pura.
 */
export function limpiarAnunciosPlan(x, { destino = "" } = {}) {
  const salida = {};
  for (const [id, v] of Object.entries(esObjeto(x) ? x : {}).slice(0, 60)) {
    if (!huecoDeId(id) || !esObjeto(v)) continue;
    const p = pieza(v.pieza);
    const textos = limpiarTextosPlan(v.textos, { destino });
    const como = v.como === "publicacion" || v.como === "subir" ? v.como : "";
    const e = {
      ...(p ? { pieza: p } : v.nuevo === true ? { nuevo: true } : {}),
      ...(como ? { como } : {}),
      ...(textos ? { textos } : {}),
      ...(textos && v.editado === true ? { editado: true } : {}),
      ...(textos && v.ia === true && v.editado !== true ? { ia: true } : {}),
      ...(corto(v.por, 80) ? { por: corto(v.por, 80) } : {}),
      ...(/^\d{4}-\d{2}-\d{2}T/.test(String(v.at ?? "")) ? { at: String(v.at).slice(0, 30) } : {}),
    };
    if (e.pieza || e.nuevo || e.como || e.textos) salida[id] = e;
  }
  return salida;
}

/**
 * Funde lo que llega (`cambios`: { hueco → entrada | null }) con lo guardado: null vuelve el hueco a lo que sugiere el
 * plan; una entrada reemplaza la del hueco (lo que no trae, se conserva: cambiar sólo el modo no borra los textos). Pura.
 */
export function fundirAnunciosPlan(guardado, cambios, { por = "", at = "", destino = "" } = {}) {
  const base = limpiarAnunciosPlan(guardado, { destino });
  for (const [id, v] of Object.entries(esObjeto(cambios) ? cambios : {}).slice(0, 60)) {
    if (!huecoDeId(id)) continue;
    if (v === null || v?.auto === true) { delete base[id]; continue; }
    if (!esObjeto(v)) continue;
    const antes = base[id] ?? {};
    const junto = { ...antes, ...v, por, at };
    // Otra publicación (u otro anuncio nuevo): los textos de la anterior no le sirven si no vienen con ella.
    const otraPieza = (v.pieza !== undefined || v.nuevo !== undefined) && JSON.stringify(pieza(v.pieza) ?? (v.nuevo ? "nuevo" : null)) !== JSON.stringify(antes.pieza ?? (antes.nuevo ? "nuevo" : null));
    if (otraPieza && v.textos === undefined) delete junto.textos;
    if (v.pieza !== undefined && pieza(v.pieza)) delete junto.nuevo;
    if (v.nuevo === true) delete junto.pieza;
    if (v.textos !== undefined) { junto.editado = v.editado === true; junto.ia = v.ia === true; }
    const limpio = limpiarAnunciosPlan({ [id]: junto }, { destino })[id];
    if (limpio) base[id] = limpio;
    else delete base[id];
  }
  return base;
}

/** ¿Le faltan textos a un anuncio del plan? Con la publicación: título y descripción; subiendo la pieza: el texto principal. Pura. */
export function faltanTextos(anuncio) {
  if (!anuncio || anuncio.vacio) return false;
  const t = anuncio.textos;
  if (anuncio.como === "publicacion") return !(t?.titulos?.length && t?.descripcion);
  return !t?.textos?.length;
}

// ------------------------------------------------------------
// El pedido a la IA de los textos
// ------------------------------------------------------------

/**
 * Lo que la IA necesita de un anuncio del plan → la casilla del pedido. `anuncio`: el del plan (planCiclo.js:
 * { slot, nivel, como, pieza, caption }); `campana`: la suya ({ id, etapa, nombreEtapa }); `post`: la publicación
 * escogida (el contenido que se lee), si la hay. Pura.
 */
export function casillaDeTextos(anuncio, campana, post = null, { artes = [] } = {}) {
  const conPost = Boolean(post);
  const como = anuncio.como === "publicacion" && conPost ? "publicacion" : "subir";
  return {
    slot: anuncio.slot, campana: campana.id, etapa: campana.etapa === "temporada" ? "conversion" : campana.etapa, nombreEtapa: campana.nombreEtapa,
    para: PARA_QUE_CAMPANA[campana.id] ?? "",
    nivel: anuncio.nivel || "", como,
    ...(conPost ? {
      pieza: {
        titulo: corto(post.title || anuncio.pieza?.titulo, 120),
        idea: corto(post.idea, 500),
        escena: corto(post.escena, 300),
        textoPieza: conLineas(post.textoPieza, 300),
        caption: conLineas(post.descripcion || post.script || anuncio.caption, 1500),
        formato: post.format || "post",
        producto: corto(post.producto, 120),
      },
    } : { artes: artes.slice(0, 4) }),
  };
}

/** La línea de cada anuncio en el pedido. */
function lineaDeAnuncio(c, i) {
  const nivel = nombreNivelTexto(c.nivel);
  const cabeza = `${i + 1}. Campaña de ${c.nombreEtapa.toLowerCase()} (${c.para.replace(/\.$/, "")}) · nivel ${nivel || "el de su etapa"}.`;
  if (c.como === "publicacion") {
    return [
      cabeza,
      `   Se monta con la PUBLICACIÓN YA SUBIDA («${c.pieza.titulo}», ${c.pieza.formato}): su texto principal es el caption y NO se cambia:`,
      `   «${c.pieza.caption || "(sin caption)"}»`,
      c.pieza.textoPieza ? `   Lo que dice la pieza: «${c.pieza.textoPieza}»` : "",
      "   Escribe SÓLO \"titulos\" y \"descripcion\": que completen el caption, no lo repitan.",
    ].filter(Boolean).join("\n");
  }
  if (c.pieza) {
    return [
      cabeza,
      `   Se monta SUBIENDO LA PIEZA de la publicación «${c.pieza.titulo}» (${c.pieza.formato}).`,
      c.pieza.idea ? `   De qué va: ${c.pieza.idea}` : "",
      c.pieza.escena ? `   Qué se ve: ${c.pieza.escena}` : "",
      c.pieza.textoPieza ? `   Lo que dice la pieza: «${c.pieza.textoPieza}»` : "",
      c.pieza.caption ? `   Su caption (de referencia; el anuncio lleva sus textos propios): «${c.pieza.caption.slice(0, 600)}»` : "",
      c.pieza.producto ? `   Producto: ${c.pieza.producto}` : "",
      "   Escribe \"textos\", \"titulos\", \"descripcion\" y \"boton\".",
    ].filter(Boolean).join("\n");
  }
  return [
    cabeza,
    `   ANUNCIO NUEVO, sin publicación: la agencia sube una pieza propia${c.artes?.length ? ` (tipo de arte sugerido: ${c.artes.join(" o ")})` : ""}. Escribe textos que sirvan para esa pieza.`,
    "   Escribe \"textos\", \"titulos\", \"descripcion\" y \"boton\".",
  ].join("\n");
}

/**
 * El pedido de los textos de unos anuncios del plan. `casillas`: las de `casillaDeTextos`; `productos`: las líneas del
 * catálogo con su precio exacto (las escribe el Worker con `lineaDeProducto`); `logro`: lo que la agencia quiere lograr;
 * `regla`: el bloque del anuncio con el negocio y el destino (lib/pauta.js `bloqueDeAnuncio`); `cliente`: la ficha del
 * cliente (`textoDelCliente`); `contexto`: lo del cerebro para escribir. Pura.
 */
export function pedidoDeTextosPlan({ marca = "la marca", casillas = [], productos = [], logro = "", regla = "", cliente = "", contexto = "", destino = "whatsapp", mes = "" }) {
  const niveles = [...new Set(casillas.map((c) => c.nivel).filter(Boolean))];
  return [
    `Escribe los textos de ${casillas.length === 1 ? "UN anuncio" : `${casillas.length} anuncios`} de Meta (Facebook e Instagram) de ${marca}${mes ? ` para ${mes}` : ""}. Las campañas se montan a mano en el Ads Manager con estos textos: tienen que poder copiarse tal cual.`,
    logro ? `LO QUE LA AGENCIA QUIERE LOGRAR CON ESTAS CAMPAÑAS (manda sobre el enfoque):\n${logro}` : "",
    regla,
    tablaDeNiveles(niveles),
    productos.length ? `LOS PRODUCTOS (precio EXACTO; ningún otro precio ni oferta):\n${productos.join("\n")}` : "",
    cliente,
    "",
    "LOS ANUNCIOS:",
    ...casillas.map(lineaDeAnuncio),
    "",
    "Cada campo:",
    `- "textos": de ${MIN_TEXTOS} a ${MAX_TEXTOS} textos principales, cada uno por un ángulo DISTINTO dentro del nivel de su anuncio (no la misma frase con otras palabras). El primero se entiende solo en su primera línea. Terminan con un llamado concreto ${destino === "web" ? "a entrar a la web" : "a escribir por WhatsApp"}.`,
    `- "titulos": de 3 a ${MAX_TITULOS}, de ${MAX_TITULO_ANUNCIO} caracteres como mucho, directos sobre el producto o el beneficio.`,
    `- "descripcion": ${MAX_DESCRIPCION_ANUNCIO} caracteres como mucho, lo importante (el precio, el envío, la garantía o la oferta, si existen).`,
    `- "boton": uno de ${BOTONES_PAUTA.map((b) => b.id).join(", ")}.`,
    "",
    "Reglas: nada inventado (ni testimonios, ni cifras, ni garantías, ni urgencias sin fecha real); que dos anuncios de la misma campaña no se parezcan; español latino neutro, sin voseo.",
    "",
    contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 5000)}\n` : "",
    `Responde SOLO con JSON, uno por número y sólo con lo que pide cada uno: {"anuncios":[{"n":1,"textos":["…"],"titulos":["…"],"descripcion":"…","boton":"${destino === "web" ? "SHOP_NOW" : "WHATSAPP_MESSAGE"}"}]}`,
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * La respuesta → Map hueco → textos (la forma de `post.anuncio`). Con la publicación ya subida, sin textos principales
 * (su caption es el texto y no se cambia). Lo que no se lee, fuera. Pura.
 */
export function leerTextosPlan(texto, casillas = [], { destino = "" } = {}) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  const salida = new Map();
  if (i < 0 || j <= i) return salida;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return salida; }
  const lista = Array.isArray(d?.anuncios) ? d.anuncios : Array.isArray(d) ? d : [];
  lista.forEach((x, k) => {
    const n = Number(x?.n) || k + 1;
    const c = casillas[n - 1];
    if (!c || !esObjeto(x)) return;
    if (c.como === "publicacion") {
      const a = limpiarTextosPlan({ titulos: x.titulos ?? x.titulo, descripcion: x.descripcion, boton: x.boton }, { destino });
      if (a?.titulos?.length || a?.descripcion) salida.set(c.slot, { ...a, textos: [] });
      return;
    }
    const a = limpiarAnuncio(x, { destino });
    if (a?.textos.length) salida.set(c.slot, a);
  });
  return salida;
}

/**
 * Los textos del plan sobre los de la publicación (`post.anuncio`) SIN pisar lo que ya tenía: sólo rellena lo vacío.
 * → el `anuncio` nuevo o null si no cambia nada. Pura.
 */
export function rellenarAnuncioDelPost(actual, nuevos, { destino = "" } = {}) {
  const a = limpiarAnuncio(actual, { destino });
  const n = limpiarTextosPlan(nuevos, { destino });
  if (!n) return null;
  const junto = {
    textos: a?.textos?.length ? a.textos : n.textos,
    titulos: a?.titulos?.length ? a.titulos : n.titulos,
    descripcion: a?.descripcion || n.descripcion,
    boton: a ? a.boton : n.boton,
  };
  if (JSON.stringify(junto) === JSON.stringify(a ? { textos: a.textos, titulos: a.titulos, descripcion: a.descripcion, boton: a.boton } : null)) return null;
  if (!junto.textos.length && !junto.titulos.length) return null;
  return junto;
}

/** Los textos de un anuncio del plan para copiarlos todos juntos (o para el texto del plan). Pura. */
export function textosATexto(t, { conCaption = "" } = {}) {
  if (!t && !conCaption) return "";
  return [
    conCaption ? `Texto principal (el de la publicación, no se cambia):\n${conCaption}` : "",
    ...(t?.textos ?? []).map((x, i) => `Texto principal ${i + 1}:\n${x}`),
    t?.titulos?.length ? `Títulos:\n${t.titulos.map((x) => `· ${x}`).join("\n")}` : "",
    t?.descripcion ? `Descripción: ${t.descripcion}` : "",
    t?.boton ? `Botón: ${nombreDeBoton(t.boton)}` : "",
  ].filter(Boolean).join("\n\n");
}

// ------------------------------------------------------------
// «Cambiar»: cualquier publicación del cliente
// ------------------------------------------------------------

const FORMATO = { post: "Post", carrusel: "Carrusel", reel: "Reel", historia: "Historia" };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Las publicaciones del cliente que se pueden poner en un anuncio del plan: de CUALQUIER mes, publicadas o no (la
 * agencia muchas veces ya sabe qué publicación va a montar). `calendars`: los del cliente con sus días
 * (`client.calendars`); `buscar`: por fecha, formato, título o lo que dice (sin tildes); las más nuevas primero. Un
 * directo no se pauta. → [{ calendarId, postId, fecha, etiqueta, titulo, formato, publicada, miniatura, video,
 * vaAPauta }]. Pura.
 */
export function publicacionesParaAnuncio(calendars = [], { buscar = "", max = 60 } = {}) {
  const q = sinTildes(buscar).trim();
  const todas = [];
  for (const cal of calendars ?? []) {
    for (const d of cal?.days ?? []) {
      for (const p of d?.posts ?? []) {
        if (!p?.id || !d.date || p.format === "live") continue;
        const titulo = corto(p.title || p.idea || p.descripcion || "sin título", 80);
        const [, m, dia] = d.date.split("-").map(Number);
        const etiqueta = `${dia} ${MESES[m - 1] ?? ""} · ${FORMATO[p.format] ?? "Post"} · ${titulo}`;
        if (q && !sinTildes(`${d.date} ${etiqueta} ${p.descripcion ?? ""} ${p.textoPieza ?? ""}`).includes(q)) continue;
        const mini = miniaturaDe(p);
        todas.push({
          calendarId: cal.dbId || cal.id, postId: p.id, fecha: d.date, etiqueta, titulo, formato: p.format || "post",
          publicada: p.status === "published", miniatura: mini?.src && /^\/api\//.test(mini.src) ? mini.src : "", video: Boolean(mini?.video),
          vaAPauta: Boolean(p.pauta && typeof p.pauta === "object"),
        });
      }
    }
  }
  todas.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return todas.slice(0, max);
}
