// ============================================================
// Lo que le FALTA a una publicación, por el MOTOR de ideas (puro)
//
// Siete caminos escribían textos y no todos pasaban por el mismo motor: los
// botones «IA» de cada campo del panel, «Completar los textos que faltan»,
// «Generar con IA» de la vista Lista, el banco de ideas y el asistente de
// «Planificar mes» tenían sus propios pedidos en api.js (buildScriptPrompt,
// buildDescripcionesPrompt, generateFieldForPost…), con OTRAS reglas: el
// guion del reel en «Hook → Desarrollo → CTA», los hashtags dentro del
// caption, un caption a la historia. Y el motor del servidor (el bueno: el
// estudio de mercado, el catálogo con su precio exacto, el cerebro por tipo,
// las fechas especiales, la estrategia del mes, las fórmulas y la voz UGC)
// no los escribía.
//
// Ahora todo va por el modo «campos» de POST /api/estudio/<c>/lote/ideas
// (worker/lib/estudio/lote.js): cada publicación con lo que YA tiene escrito
// (manda: lo nuevo encaja con eso) y los campos que se le piden. La regla de
// qué lleva cada formato es una (lib/reglasFormato.js).
//
// Aquí: la casilla de una publicación (`casillaDeCampos`), el pedido
// (`pedidoDeCampos`), su lectura (`leerCampos`) y ponerlo en la publicación
// (`aplicarCampos`: sólo RELLENA lo vacío, salvo el campo que se pidió con
// su botón, que se reescribe).
// ============================================================

import {
  lineaDePieza, REGLA_FORMATO, GUION_DE_FORMATO, textoEstrategiaDelMes, captionYHashtags, MAX_TITULO, MAX_GUION, MAX_BRIEF,
} from "./loteAnuncios.js";
import { CAMPOS_TEXTO, llevaCampo } from "./reglasFormato.js";
import { reglaUgc, duracionUgc, palabrasQueCaben, leerGuionConGanchos, limpiarGanchos } from "./ugc.js";

/** Los campos que el motor sabe escribir, en el orden en que se piden. */
export const ORDEN_CAMPOS = Object.freeze(["titulo", "idea", "textoPieza", "guion", "descripcion", "hashtags"]);
/** Los formatos que escribe este modo: los del lote y el directo. */
export const FORMATOS_CAMPOS = Object.freeze(["post", "historia", "carrusel", "reel", "live"]);
/** Cuánto de lo ya escrito viaja al pedido, por campo. */
export const MAX_ESCRITO = 1500;
/** Cuántas publicaciones por llamada como mucho. */
export const MAX_PUBLICACIONES_CAMPOS = 12;

const NOMBRE = Object.freeze({
  titulo: "título", idea: "idea", escena: "qué se ve", textoPieza: "texto en la pieza", guion: "guion", descripcion: "caption", hashtags: "hashtags",
});
const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const conLineas = (t, max) => String(t ?? "").replace(/\\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max).trim();
const lleno = (t) => Boolean(String(t ?? "").trim());
/** El valor de un campo del motor en la publicación (el caption, con el `script` de antes de respaldo). */
const valorEnPost = (post, campo) => (campo === "descripcion" ? post?.descripcion || post?.script || "" : post?.[CAMPOS_TEXTO[campo]] ?? "");

/**
 * Una publicación del calendario → su casilla del modo «campos»: su formato, su tipo y su matriz, su semana y su
 * fecha especial, lo que YA tiene escrito y los `campos` que se le piden (sólo los que su formato lleva). Un campo que
 * se pide y ya tiene texto viaja en `antes` (se escribe uno mejor que conserve su intención). Null si no hay nada que
 * pedirle. Pura.
 */
export function casillaDeCampos(post = {}, day = {}, { campos = [], semana = "", especial = "", pide = "" } = {}) {
  const formato = FORMATOS_CAMPOS.includes(post.format) ? post.format : "post";
  const pedidos = ORDEN_CAMPOS.filter((c) => campos.includes(c) && llevaCampo(formato, c));
  if (!pedidos.length) return null;
  const escrito = {};
  const antes = {};
  for (const c of ORDEN_CAMPOS) {
    const v = String(valorEnPost(post, c) ?? "").trim();
    if (!v) continue;
    if (pedidos.includes(c)) antes[c] = v.slice(0, MAX_ESCRITO);
    else escrito[c] = v.slice(0, MAX_ESCRITO);
  }
  if (lleno(post.escena)) escrito.escena = String(post.escena).trim().slice(0, 400);
  return {
    clave: String(post.id ?? ""), formato,
    ...(day?.date ? { fecha: day.date } : {}),
    ...Object.fromEntries(["pilar", "pilarSub", "productoId", "nivel", "deseo", "perfil", "estructura", "composicion", "tactica"].map((k) => [k, post[k] || ""]).filter(([, v]) => v)),
    ...(semana || day?.concept ? { semana: semana || day.concept } : {}),
    ...(especial || day?.specialDate ? { especial: especial || day.specialDate } : {}),
    ...(formato === "reel" && post.rostro ? { rostro: true, duracionUgc: duracionUgc(post.duracionUgc), ...(post.formulaUgc ? { formulaUgc: String(post.formulaUgc) } : {}) } : {}),
    ...(String(pide).trim() ? { pide: String(pide).trim().slice(0, 300) } : {}),
    escrito, campos: pedidos, antes,
  };
}

/** Cómo es cada campo, dicho a la IA (sólo los que se piden en este pedido). */
function comoEsCadaCampo(pedidos, plan) {
  const formatos = new Set(plan.filter((r) => r.campos.includes("guion")).map((r) => (r.rostro ? "ugc" : r.formato)));
  return [
    pedidos.has("titulo") ? `- "titulo": cómo la llamarías en el calendario, en pocas palabras (${MAX_TITULO} caracteres).` : "",
    pedidos.has("idea") ? `- "idea": qué comunica la publicación y por qué funciona, en una o dos frases (${MAX_BRIEF} caracteres). Si ya tiene una, MEJÓRALA conservando su tema, su producto, su oferta y su enfoque: no la cambies por otra idea ni por otro formato.` : "",
    pedidos.has("textoPieza") ? '- "textoPieza": lo que va ESCRITO encima del diseño (no el caption): un titular de hasta 8 palabras y, en otra línea (\\n), una frase de apoyo corta; si el tipo lleva precio u oferta, el precio EXACTO del catálogo en una tercera línea. Sin el signo «·».' : "",
    ...[...formatos].map((f) => (f === "ugc"
      ? '- "guion" (en las UGC): el guion para GRABAR, por tramos, uno por línea, con la forma de «PARA LAS UGC» de abajo; y "ganchos": 3 ganchos alternativos para el primer tramo (lo que dice, palabra por palabra).'
      : GUION_DE_FORMATO[f] ? GUION_DE_FORMATO[f].replace('- "guion":', `- "guion" (en ${f === "live" ? "un directo" : `un ${f}`}):`) : "")),
    pedidos.has("descripcion") ? '- "descripcion": el texto de la publicación (caption), de 2 a 4 frases: gancho en la primera línea, emojis con medida y un llamado a la acción con el contacto de la ficha si el tipo lo pide. SIN hashtags (van aparte).' : "",
    pedidos.has("hashtags") ? '- "hashtags": de 5 a 10 hashtags útiles (del tema, del rubro y de la zona; los de la marca si la ficha los trae; ninguno de otra marca), separados por espacios.' : "",
  ].filter(Boolean);
}

/**
 * El pedido del modo «campos»: cada publicación con lo ya decidido (`lineaDePieza`), lo que ya tiene escrito y lo que
 * se le pide. `plan`: las casillas con su forma (worker: darForma) y `campos`; lo demás, como `pedidoDeProduccion`.
 * Una UGC lleva su duración y, si la agencia la escogió, su fórmula (`formulaLinea`, la pone el Worker). Pura.
 */
export function pedidoDeCampos({
  marca = "la marca", plan = [], productos = {}, perfiles = {}, estudio = "", contexto = "", usados = [], fechasEspeciales = [],
  estrategia = null, falta = "", ugc = "", cliente = "",
}) {
  const pedidos = new Set(plan.flatMap((r) => r.campos ?? []));
  const formatos = [...new Set(plan.map((r) => r.formato))].filter((f) => REGLA_FORMATO[f]);
  const perfilesUsados = [...new Set(plan.map((r) => r.perfil).filter(Boolean))].filter((n) => perfiles[n]);
  const ugcs = plan.filter((r) => r.rostro && r.campos.includes("guion"));
  const lineaDe = (r) => {
    const escrito = Object.entries(r.escrito ?? {}).map(([k, v]) => `     ${NOMBRE[k] ?? k}: «${conLineas(v, MAX_ESCRITO)}»`);
    const antes = Object.entries(r.antes ?? {}).map(([k, v]) => `   lo que tiene ahora en «${NOMBRE[k] ?? k}» (escribe una versión mejor que conserve su intención; lo que va entre comillas se dice TAL CUAL): «${conLineas(v, MAX_ESCRITO)}»`);
    return [
      lineaDePieza({ ...r, rostro: false }, productos),
      r.rostro ? `   UGC: lo GRABA una persona de la marca hablando a cámara (no se hace con IA); guion para grabar de ${r.duracionUgc} s, unas ${palabrasQueCaben(r.duracionUgc)} palabras de voz en total.` : "",
      r.formulaLinea ? `   ${r.formulaLinea}` : "",
      escrito.length ? `   YA ESCRITO (manda: lo que escribas encaja con esto, no lo repite ni lo contradice):\n${escrito.join("\n")}` : "",
      ...antes,
      `   escribe: ${r.campos.map((c) => `"${c}"`).join(", ")}`,
    ].filter(Boolean).join("\n");
  };
  const duraciones = [...new Set(ugcs.map((r) => r.duracionUgc))];
  return [
    `Escribe lo que les falta a ${plan.length === 1 ? "UNA publicación" : `${plan.length} publicaciones`} del calendario de ${marca}. ${plan.length === 1 ? "Tiene" : "Cada una tiene"} YA decidido su FORMATO (entre corchetes), su tipo de contenido, su nivel de consciencia, su gancho y su composición: respétalos. Lo que ya tiene escrito es de la agencia y MANDA. Escribe SÓLO los campos que pide cada una.`,
    ...formatos.map((f) => `- ${f === "live" ? "Directo" : f[0].toUpperCase() + f.slice(1)}: ${REGLA_FORMATO[f]}`),
    cliente ? String(cliente).slice(0, 4000) : "",
    textoEstrategiaDelMes(estrategia),
    perfilesUsados.length ? `Los perfiles:\n${perfilesUsados.map((n) => `- ${n}: ${perfiles[n]}`).join("\n")}` : "",
    fechasEspeciales.length ? `Fechas especiales:\n${fechasEspeciales.map((f) => `- ${f}`).join("\n")}` : "",
    "",
    ...plan.map(lineaDe),
    "",
    "Cada campo:",
    ...comoEsCadaCampo(pedidos, plan),
    ugcs.some((r) => !r.formulaLinea) && /FÓRMULAS DE LA AGENCIA/.test(ugc) ? '- "formula" (en las UGC sin fórmula escogida): el nombre exacto de la fórmula de la agencia que sigue su guion.' : "",
    "",
    "Reglas:",
    "- Precios, ofertas, garantías y cifras: sólo los del catálogo y EXACTOS como allí. No inventes reseñas, testimonios, seguidores, porcentajes ni plazos; una urgencia sólo con una fecha real.",
    "- Un día marcado «sin promociones» no vende ni da precios. No nombres a la competencia.",
    "- Que dos publicaciones no se parezcan: ni el mismo gancho ni el mismo llamado a la acción.",
    ...(falta ? [`- ${falta}`] : []),
    usados.length ? `- Estos títulos ya están en el mes: no repitas ninguno ni su idea:\n${usados.slice(0, 30).map((t) => `  · ${corto(t, 80)}`).join("\n")}` : "",
    "",
    estudio ? `ESTUDIO DE MERCADO:\n${String(estudio).slice(0, 8000)}\n` : "",
    contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 6000)}\n` : "",
    ugcs.length ? `PARA LAS UGC:\n${[...duraciones.map((d) => `${duraciones.length > 1 ? `De ${d} s:\n` : ""}${reglaUgc(d)}`), String(ugc ?? "").slice(0, 7000)].filter(Boolean).join("\n\n")}\n` : "",
    `Responde SOLO con JSON, una por número y sólo con los campos que pide cada una, así: {"textos":[{"n":1,"descripcion":"…","hashtags":"#… #…"}]}`,
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

const deJSON = (texto) => {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};

/**
 * La respuesta → [{ clave, n, campos: { campo → texto }, ganchos?, formula? }], una por casilla que trajo algo, con
 * la regla de su formato: sólo los campos pedidos, el caption sin hashtags (los del final se pasan a «hashtags» si se
 * pidieron; si no, se quitan: saldrían dos veces), el guion de una UGC por tramos. Pura.
 */
export function leerCampos(texto, plan = []) {
  const d = deJSON(texto);
  const lista = Array.isArray(d?.textos) ? d.textos : Array.isArray(d?.ideas) ? d.ideas : Array.isArray(d) ? d : [];
  const porNumero = new Map();
  lista.forEach((x, i) => {
    const n = Number(x?.n) || plan[i]?.n || i + 1;
    if (!porNumero.has(n)) porNumero.set(n, x);
  });
  return plan.flatMap((r) => {
    const x = porNumero.get(r.n);
    if (!x || typeof x !== "object") return [];
    const campos = {};
    const pide = new Set(r.campos ?? []);
    let ganchos = [];
    if (pide.has("titulo") && corto(x.titulo, MAX_TITULO)) campos.titulo = corto(x.titulo, MAX_TITULO);
    if (pide.has("idea") && corto(x.idea, MAX_BRIEF + 100)) campos.idea = corto(x.idea, MAX_BRIEF + 100);
    if (pide.has("textoPieza") && conLineas(x.textoPieza, 300)) campos.textoPieza = conLineas(x.textoPieza, 300).replace(/\s*·\s*/g, ". ");
    if (pide.has("guion") && conLineas(x.guion, MAX_GUION)) {
      if (r.rostro) {
        const leido = leerGuionConGanchos(conLineas(x.guion, MAX_GUION));
        campos.guion = leido.guion;
        ganchos = limpiarGanchos(Array.isArray(x.ganchos) && x.ganchos.length ? x.ganchos : leido.ganchos);
      } else {
        campos.guion = conLineas(x.guion, MAX_GUION);
      }
    }
    if (pide.has("descripcion") || pide.has("hashtags")) {
      const { descripcion, hashtags } = captionYHashtags(x, r.formato);
      if (pide.has("descripcion") && descripcion) campos.descripcion = descripcion;
      if (pide.has("hashtags") && hashtags) campos.hashtags = hashtags;
    }
    if (!Object.keys(campos).length) return [];
    return [{
      clave: r.clave, n: r.n, campos,
      ...(ganchos.length ? { ganchos } : {}),
      ...(r.rostro && corto(x.formula, 60) ? { formula: corto(x.formula, 60) } : {}),
    }];
  });
}

/**
 * Lo que escribió el motor, sobre la publicación: sólo RELLENA lo vacío, salvo los campos de `reemplazar` (el que se
 * pidió con su botón «IA», que se reescribe). Un guion de UGC trae además sus ganchos, su duración y la fórmula que
 * siguió. → { cambios, campos (sus nombres, para decirlo) }. Pura.
 */
export function aplicarCampos(post = {}, textos = {}, { reemplazar = [] } = {}) {
  const cambios = {};
  for (const [campo, valor] of Object.entries(textos?.campos ?? {})) {
    const clave = CAMPOS_TEXTO[campo];
    if (!clave || !lleno(valor) || !llevaCampo(post.format, campo)) continue;
    if (lleno(valorEnPost(post, campo)) && !reemplazar.includes(campo)) continue;
    cambios[clave] = valor;
  }
  if (cambios.guion && post.format === "reel" && post.rostro) {
    if (textos.ganchos?.length) cambios.ganchosUgc = textos.ganchos;
    cambios.duracionUgc = duracionUgc(post.duracionUgc);
    if (textos.formulaUgc && !post.formulaUgc) cambios.formulaUgc = textos.formulaUgc;
  }
  const NOMBRES = { title: "título", idea: "idea", textoPieza: "texto de la pieza", guion: "guion", descripcion: "descripción", hashtagsFinales: "hashtags" };
  return { cambios, campos: Object.keys(cambios).map((k) => NOMBRES[k]).filter(Boolean) };
}
