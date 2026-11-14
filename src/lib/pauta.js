// ============================================================
// LO QUE VA A PAUTA: una publicación que se va a pautar nace escrita como anuncio (puro)
//
// El problema de la agencia: en el Ads Manager se escoge una publicación ya hecha y su texto NO se puede cambiar —el
// texto principal del anuncio ES el caption—. Si el caption se escribió para el orgánico («¡Hoy abrimos!», doce
// hashtags, sin llamado), el anuncio sale con eso. Y la agencia monta de las DOS formas (con la publicación y subiendo
// la pieza), así que toda publicación que va a pauta lleva su caption escrito como anuncio Y sus textos de anuncio
// aparte (decisión 8 de docs/propuesta-curso-campanas.md).
//
//   post.pauta   = { etapa, nivel?, como: "publicacion" | "anuncio" | "", auto?, motivo? }
//                  La etapa del ciclo de ventas (lib/cicloVentas.js); `como` dice cuál se espera ("" = las dos);
//                  `auto` cuando la puso la app (el asistente del mes) y se puede quitar.
//   post.anuncio = { textos: [3–5], titulos: [≤ 5, 40 car.], descripcion (30 car.), boton }
//
// Aquí: limpiar los dos, la regla que lee la IA (`REGLA_ANUNCIO` y el bloque con el negocio y el destino), qué se
// marca solo (`sugerirPauta`, decisión 9: las del tipo «Anuncio» del plan y las de la oferta del mes) y la REVISIÓN de
// anuncio de «Revisar el mes» con sus arreglos. Las ideas del curso de campañas, con palabras propias (la licencia de
// su método no deja copiar su texto).
//
// No va en la carga inicial: arrastra el estudio de mercado (sus límites de anuncio). El chip del mes mira la marca
// con su propio `enPauta` (lib/estadoChip.js), la MISMA regla en una línea.
// ============================================================

import { ETAPAS_CICLO, idEtapaCiclo, etapaCiclo, nombreEtapaCiclo, tipoNegocioDe, destinoNegocioDe } from "./cicloVentas.js";
import { CLAVES_NIVEL, nombreDeNivel } from "./consciencia.js";
import { LIMITES_ANUNCIO } from "./estudioMercado.js";
import { cicloDe } from "./cicloNegocio.js";
import { llevaCaption, separarHashtags, juntarHashtags } from "./reglasFormato.js";

/** Cuántos textos principales lleva un anuncio que se sube (el Ads Manager admite 5 y prueba combinaciones). */
export const MIN_TEXTOS = 3;
export const MAX_TEXTOS = 5;
export const MAX_TITULOS = 5;
/**
 * Un texto principal, como mucho: el tope ÚNICO de la aplicación (LIMITES_ANUNCIO del estudio de mercado, el mismo del
 * asistente de campañas). El de evaluación es más largo a propósito (detalles, beneficios, una objeción).
 */
export const MAX_TEXTO_ANUNCIO = LIMITES_ANUNCIO.textoPrincipal;
export const MAX_TITULO_ANUNCIO = LIMITES_ANUNCIO.titulo;
export const MAX_DESCRIPCION_ANUNCIO = LIMITES_ANUNCIO.descripcion;
/** Lo que se ve de un anuncio antes de «más»: ahí tiene que estar el gancho. */
export const PRIMERA_LINEA = 125;
/** Hashtags en lo que va a pauta: en un anuncio cada uno es una salida (decisión 10). */
export const MAX_HASHTAGS_PAUTA = 3;

/** Cómo se va a montar en el Ads Manager. "" = de las dos formas (lo normal: decisión 8). */
export const COMO_PAUTA = Object.freeze([
  { id: "", nombre: "De las dos formas", ayuda: "Lleva el caption escrito como anuncio y, aparte, sus textos para subir la pieza." },
  { id: "publicacion", nombre: "Con la publicación", ayuda: "En el Ads Manager se escoge esta publicación ya hecha: su texto (el caption) no se puede cambiar." },
  { id: "anuncio", nombre: "Subiendo la pieza", ayuda: "Se monta un anuncio nuevo con la imagen o el video, con sus textos aparte (hasta 5 textos y 5 títulos)." },
]);

/** Los botones del anuncio que se escogen en el Ads Manager (por su id de Meta), los de WhatsApp primero. */
export const BOTONES_PAUTA = Object.freeze([
  { id: "WHATSAPP_MESSAGE", nombre: "Enviar mensaje de WhatsApp", destino: "whatsapp" },
  { id: "MESSAGE_PAGE", nombre: "Enviar mensaje", destino: "whatsapp" },
  { id: "LEARN_MORE", nombre: "Más información" },
  { id: "SHOP_NOW", nombre: "Comprar", destino: "web" },
  { id: "ORDER_NOW", nombre: "Pedir ahora", destino: "web" },
  { id: "BOOK_TRAVEL", nombre: "Reservar" },
  { id: "CONTACT_US", nombre: "Contactarnos" },
  { id: "SIGN_UP", nombre: "Registrarte" },
  { id: "GET_OFFER", nombre: "Ver oferta" },
]);
export const nombreDeBoton = (id) => BOTONES_PAUTA.find((b) => b.id === id)?.nombre ?? "";
export const botonPorDefecto = (destino) => (destino === "web" ? "SHOP_NOW" : "WHATSAPP_MESSAGE");

/**
 * El nivel de consciencia que toca a cada etapa si nadie dice otro (uno de los de su etapa en lib/cicloVentas.js):
 * en presentación, quien sabe que tiene el problema (el grueso de la gente que no conoce la marca).
 */
export const NIVEL_POR_ETAPA = Object.freeze({ presentacion: "problema", evaluacion: "solucion", conversion: "decision", ascension: "decision" });

/** Cómo se escribe el anuncio de cada etapa (va en el pedido a la IA). */
export const COMO_ESCRIBE_ETAPA = Object.freeze({
  presentacion: "para quien todavía no conoce la marca: corto y directo; la necesidad, el problema o lo más vendido, y cómo se resuelve. El producto entra al final, como la salida.",
  evaluacion: "para quien ya vio la marca y está comparando: más largo y con detalles; los 1 a 3 beneficios que deciden, un diferencial y una objeción respondida.",
  conversion: "para quien ya está por decidir: la prueba (un testimonio real), la garantía y la oferta si existen, y un llamado sin rodeos.",
  ascension: "para quien ya compró: el segundo producto, el complemento o el combo, y por qué volver.",
});

/** Lo que cambia según el tipo de negocio, en una línea (el detalle por etapa lo pone la base del curso). */
export const PISTA_NEGOCIO = Object.freeze({
  productos: "Lo que vende es un producto: que se vea cuál, para qué sirve y su precio exacto.",
  servicios: "Vende un servicio: lo que la persona va a sentir o recibir, y algo para empezar a conversar (una valoración, una prueba o un regalo, si existen).",
  "segunda-necesidad": "No se compra por urgencia: hay que despertar el antojo, agrandar el problema y vender la experiencia.",
  suscripcion: "Es un pago que se repite: el diferencial y lo que gana (o ahorra) cada mes.",
  nicho: "Le habla a un público que ya sabe lo que busca: detalle, experiencia y confianza, sin explicar lo básico.",
  "producto-nuevo": "El mercado aún no lo conoce: primero que existe la solución, después la marca.",
  cursos: "Es formación: qué contiene y qué logra quien lo termina; cupos limitados sólo si es verdad.",
});

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const conLineas = (t, max) => String(t ?? "").replace(/\\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max).trim();
const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);

/** Corta en la última palabra que cabe (un título cortado a media palabra no sirve). Pura. */
export function cortarEnPalabra(t, max) {
  const s = corto(t, 400);
  if (s.length <= max) return s;
  const c = s.slice(0, max + 1);
  const i = c.lastIndexOf(" ");
  return (i > max * 0.5 ? c.slice(0, i) : s.slice(0, max)).replace(/[\s,;:.·-]+$/u, "").trim();
}

/** La etapa que toca a un nivel de consciencia: la primera que lo lleva (lib/cicloVentas.js), o "". Pura. */
export const etapaDeNivel = (nivel) => ETAPAS_CICLO.find((e) => e.niveles.includes(nivel))?.id ?? "";

// ------------------------------------------------------------
// La marca «Va a pauta» y los textos de anuncio
// ------------------------------------------------------------

/**
 * `post.pauta` limpio, o null si no va a pauta (false, vacío, otra cosa). La etapa se lee con los alias de antes
 * («atraer», «tibio»…); sin etapa, la de su nivel o presentación. Pura.
 */
export function limpiarPauta(x) {
  if (!esObjeto(x)) return null;
  const nivel = CLAVES_NIVEL.includes(x.nivel) ? x.nivel : "";
  const etapa = idEtapaCiclo(x.etapa) || etapaDeNivel(nivel) || "presentacion";
  const como = COMO_PAUTA.some((c) => c.id && c.id === x.como) ? x.como : "";
  const motivo = corto(x.motivo, 80);
  return {
    etapa, ...(nivel ? { nivel } : {}), como,
    ...(x.auto === true ? { auto: true } : {}),
    ...(x.auto === true && motivo ? { motivo } : {}),
  };
}

/** ¿Va a pauta? Pura. */
export const vaAPauta = (post) => Boolean(limpiarPauta(post?.pauta));

/** El nivel con que se escribe: el escogido; si no, el de la publicación si es de su etapa; si no, el de la etapa. Pura. */
export function nivelDePauta(pauta, post = {}) {
  const p = limpiarPauta(pauta);
  if (!p) return "";
  if (p.nivel) return p.nivel;
  const e = etapaCiclo(p.etapa);
  return e?.niveles.includes(post?.nivel) ? post.nivel : NIVEL_POR_ETAPA[p.etapa] ?? "";
}

const limpiarLista = (lista, max, cortar) => {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : typeof lista === "string" ? [lista] : [])
    .map((t) => cortar(t))
    .filter((t) => {
      const k = t.toLowerCase();
      if (!t || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, max);
};

/**
 * `post.anuncio` limpio: hasta 5 textos (sin repetir, con sus saltos de línea), hasta 5 títulos de 40 cortados en una
 * palabra, una descripción de 30 y un botón que existe (el de su destino si no). Null si no trae ningún texto. Pura.
 */
export function limpiarAnuncio(x, { destino = "" } = {}) {
  if (!esObjeto(x)) return null;
  const textos = limpiarLista(x.textos ?? x.textosPrincipales ?? x.textoPrincipal, MAX_TEXTOS, (t) => conLineas(t, MAX_TEXTO_ANUNCIO));
  const titulos = limpiarLista(x.titulos ?? x.titulo, MAX_TITULOS, (t) => cortarEnPalabra(String(t ?? "").replace(/^["«“]|["»”]$/g, ""), MAX_TITULO_ANUNCIO));
  const descripcion = cortarEnPalabra(x.descripcion, MAX_DESCRIPCION_ANUNCIO);
  const pedido = String(x.boton ?? "").trim().toUpperCase();
  const boton = BOTONES_PAUTA.find((b) => b.id === pedido || b.nombre.toLowerCase() === String(x.boton ?? "").trim().toLowerCase())?.id ?? botonPorDefecto(destino);
  if (!textos.length && !titulos.length) return null;
  return { textos, titulos, descripcion, boton };
}

/** ¿Tiene ya sus textos de anuncio aparte? Pura. */
export const tieneTextosAnuncio = (post) => Boolean(limpiarAnuncio(post?.anuncio)?.textos.length);

/** Lo que se copia de un anuncio, todo junto (para pegarlo en una nota o mandarlo). Pura. */
export function anuncioATexto(anuncio) {
  const a = limpiarAnuncio(anuncio);
  if (!a) return "";
  return [
    ...a.textos.map((t, i) => `Texto principal ${i + 1}:\n${t}`),
    a.titulos.length ? `Títulos:\n${a.titulos.map((t) => `· ${t}`).join("\n")}` : "",
    a.descripcion ? `Descripción: ${a.descripcion}` : "",
    `Botón: ${nombreDeBoton(a.boton)}`,
  ].filter(Boolean).join("\n\n");
}

/** Deja como mucho `max` hashtags («#uno #dos #tres»). Pura. */
export const recortarHashtags = (t, max = MAX_HASHTAGS_PAUTA) => (String(t ?? "").match(/#[\p{L}\p{N}_]+/gu) ?? []).slice(0, max).join(" ");

// ------------------------------------------------------------
// Lo que lee la IA
// ------------------------------------------------------------

/** La regla del anuncio, en palabras de la agencia: la lee el motor de textos cuando una publicación va a pauta. */
export const REGLA_ANUNCIO = [
  "LO QUE VA A PAUTA (anuncios de Meta). El caption de esas publicaciones ES el texto principal del anuncio: en el Ads Manager se escoge la publicación ya hecha y su texto ya no se puede cambiar. Tiene que nacer escrito como anuncio, y servir igual en orgánico el día que sale.",
  "1. Manda la ETAPA del ciclo de ventas (va en cada una) y el tipo de negocio: escribe para esa gente en ese momento de la compra.",
  `2. La primera línea es el gancho y se entiende SOLA: es lo único que se ve antes de «más» (unos ${PRIMERA_LINEA} caracteres). Con el nivel de consciencia de su etapa; nunca un saludo, el nombre de la marca ni «Les presentamos».`,
  "3. Termina con UN llamado concreto: escribir por WhatsApp (o entrar a la web, si el destino es la web), con el incentivo si existe de verdad (algo gratis, un regalo, la oferta del mes).",
  "4. Nada que caduque: ni «hoy», «mañana», «esta semana», «este fin de semana», un día de la semana ni el horario de un día. Un anuncio corre semanas. Una fecha sólo si la campaña termina ese día.",
  `5. Sin hashtags en el caption; en «hashtags», como mucho ${MAX_HASHTAGS_PAUTA} (en un anuncio cada uno es una salida).`,
  "6. Sólo lo real: el precio EXACTO del catálogo, y la garantía, los testimonios y el diferencial que están escritos. Nada inventado.",
  "7. La política de anuncios de Meta: nada que afirme o insinúe algo de quien lee (su cuerpo, su salud, su dinero, sus deudas, su edad, su situación): nada de «¿Tienes sobrepeso?» ni «¿Estás endeudado?»; se habla del problema, no de la persona. Sin promesas exageradas ni resultados garantizados, y sin antes y después de salud o de cuerpo.",
  "8. Una sola idea por anuncio, distinta de las otras de su etapa: si dos se parecen, Meta las trata como un mismo anuncio y no prueba nada.",
].join("\n");

/** Cómo es el campo «anuncio» (los textos aparte), dicho a la IA. */
export const CAMPO_ANUNCIO = `"anuncio" (en las que van a pauta): sus textos para montar el anuncio SUBIENDO la pieza, como objeto: {"textos":["…"],"titulos":["…"],"descripcion":"…","boton":"…"}. "textos": de ${MIN_TEXTOS} a ${MAX_TEXTOS} textos principales con las mismas reglas del caption de anuncio, cada uno por un ángulo o un nivel de consciencia DISTINTO (no la misma frase con otras palabras), hasta ${MAX_TEXTO_ANUNCIO} caracteres. "titulos": de 3 a ${MAX_TITULOS}, de ${MAX_TITULO_ANUNCIO} caracteres como mucho, directos sobre el producto o el beneficio. "descripcion": ${MAX_DESCRIPCION_ANUNCIO} caracteres como mucho, lo importante (el precio, el envío, la garantía). "boton": uno de ${BOTONES_PAUTA.map((b) => b.id).join(", ")}.`;

/**
 * El bloque del pedido para lo que va a pauta: la regla, el tipo de negocio y el destino del cliente (los números del
 * negocio, `anuncios_clientes.negocio`), cómo se escribe cada etapa que aparece y, si `conCampo`, cómo es el campo
 * «anuncio». `enJson`: en el modo del plan, que añada «anuncio» a su objeto. Pura.
 */
/** Lo que la tabla del ciclo dice de una etapa para este negocio («Para este negocio: … Lleva a …»), o "". */
function paraEsteNegocio(ciclo, etapa) {
  const e = ciclo?.etapas?.find((x) => x.id === etapa);
  if (!e?.contenido) return "";
  return ` Para este negocio: ${e.contenido.replace(/\.$/, "")}${e.lleva ? ` (lleva ${e.lleva})` : ""}.`;
}

export function bloqueDeAnuncio({ tipo = "", destino = "", etapas = [], conCampo = true, enJson = false } = {}) {
  const t = tipoNegocioDe(tipo);
  const d = destinoNegocioDe(destino) ?? destinoNegocioDe("whatsapp");
  const usadas = ETAPAS_CICLO.filter((e) => etapas.includes(e.id));
  // Qué pieza va en cada etapa según el negocio y el destino (la tabla del curso, lib/cicloNegocio.js): sólo si se sabe
  // el tipo de negocio; sin él, la regla general basta.
  const ciclo = t ? cicloDe(t.id, d.id) : null;
  return [
    REGLA_ANUNCIO,
    `El destino del anuncio: ${d.nombre}${d.id === "whatsapp" ? " (el llamado es a escribir por WhatsApp; el botón abre la conversación)" : " (el llamado es a entrar a la web y comprar)"}.`,
    t ? `El tipo de negocio: ${t.nombre} (${t.ayuda.replace(/\.$/, "")}). ${PISTA_NEGOCIO[t.id] ?? ""}`.trim() : "",
    usadas.length ? `Cómo se escribe cada etapa:\n${usadas.map((e) => `- ${e.nombre}: ${COMO_ESCRIBE_ETAPA[e.id]}${paraEsteNegocio(ciclo, e.id)}`).join("\n")}` : "",
    conCampo ? `- ${CAMPO_ANUNCIO}${enJson ? ' En cada una que VA A PAUTA, añade esa clave "anuncio" a su objeto del JSON.' : ""}` : "",
  ].filter(Boolean).join("\n");
}

/** La línea de una publicación que va a pauta en el pedido (va debajo de la suya). Pura. */
export function lineaDePauta(pauta, post = {}) {
  const p = limpiarPauta(pauta);
  if (!p) return "";
  const nivel = nivelDePauta(p, post);
  const como = p.como === "publicacion" ? "se monta con la publicación (el caption ES el anuncio)" : p.como === "anuncio" ? "se monta subiendo la pieza (con sus textos aparte)" : "se monta de las dos formas";
  return `VA A PAUTA · etapa ${nombreEtapaCiclo(p.etapa)}${nivel ? ` · nivel ${nombreDeNivel(nivel)}` : ""} · ${como}: el caption, escrito como anuncio (LO QUE VA A PAUTA).`;
}

/** De una respuesta del motor, el «anuncio» de cada número (modo del plan, que lo lee aparte) → Map n → anuncio. Pura. */
export function anunciosDeRespuesta(texto, { destino = "" } = {}) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  const fuera = new Map();
  if (i < 0 || j <= i) return fuera;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return fuera; }
  const lista = Array.isArray(d?.ideas) ? d.ideas : Array.isArray(d?.textos) ? d.textos : Array.isArray(d) ? d : [];
  lista.forEach((x, k) => {
    const a = limpiarAnuncio(x?.anuncio, { destino });
    if (a) fuera.set(Number(x?.n) || k + 1, a);
  });
  return fuera;
}

// ------------------------------------------------------------
// Qué se marca solo (decisión 9)
// ------------------------------------------------------------

const PALABRAS_VACIAS = new Set("para pero porque como cuando donde desde hasta entre sobre todo toda todos todas esta este estos estas esto eso esos esas aqui alli muy mas menos tambien solo cada nuestro nuestra nuestros nuestras tienes tiene tenemos puedes puede hacer haces hace ahora siempre nunca nada algo otro otra otros otras sera estan esta estas eres somos usted ustedes ellos ellas".split(" "));
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Las palabras que dicen algo de un texto (sin tildes, de 4 letras o más, sin las vacías). Pura. */
export function palabrasDe(texto) {
  return new Set(sinTildes(texto).replace(/#[\p{L}\p{N}_]+/gu, " ").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !PALABRAS_VACIAS.has(w)));
}
const cifrasDe = (t) => new Set((sinTildes(t).match(/\d+\s?%|\d+x\d+|\$\s?\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(/\s/g, "")));
const textoDePost = (p) => [p?.title, p?.idea, p?.textoPieza, p?.descripcion || p?.script, p?.escena].filter(Boolean).join("\n");

/**
 * ¿Es de la oferta del mes? Un tipo «Beneficios / Promociones» en un mes con oferta, o un texto que nombra su código,
 * una de sus cifras (15 %, 2x1, $45) o dos de sus palabras. Sin oferta ni código, no. Pura.
 */
export function deLaOferta(post = {}, { ofertas = "", codigo = "" } = {}) {
  const of = String(ofertas ?? "").trim();
  const cod = String(codigo ?? "").trim();
  if (!of && !cod) return false;
  if (post?.pilar === "beneficios" && of) return true;
  const texto = textoDePost(post);
  if (!texto.trim()) return false;
  if (cod && sinTildes(texto).includes(sinTildes(cod))) return true;
  if (!of) return false;
  const cifras = cifrasDe(of);
  if ([...cifrasDe(texto)].some((c) => cifras.has(c))) return true;
  const claves = palabrasDe(of);
  return [...palabrasDe(texto)].filter((w) => claves.has(w)).length >= 2;
}

/**
 * La etapa que se propone: la oferta del mes va a conversión; un «Anuncio» por su nivel —«Decisión» es quien sólo
 * necesita el empujón para comprar: conversión; el del producto, evaluación—; lo demás, presentación. Pura.
 */
export function etapaSugerida(post = {}, { oferta = false } = {}) {
  if (oferta) return "conversion";
  if (post?.nivel === "decision") return "conversion";
  if (post?.nivel === "producto") return "evaluacion";
  return etapaDeNivel(post?.nivel) || "presentacion";
}

/**
 * Las que se marcan «Va a pauta» solas (decisión 9): las del tipo «Anuncio» del plan semanal y las de la oferta del mes
 * (`ofertas`, `codigo`: los del calendario). Nunca un directo, ni lo ya publicado, ni lo que ya va a pauta, ni lo que
 * alguien desmarcó (`pauta === false`). `items`: [{ id, post }] o publicaciones. → [{ id, pauta (con `auto`), motivo }].
 * Pura.
 */
export function sugerirPauta(items = [], { ofertas = "", codigo = "", cuenta = "" } = {}) {
  const lista = (items ?? []).map((x) => ({ x, post: x?.post ?? x, id: String(x?.id ?? x?.clave ?? (x?.post ?? x)?.id ?? "") }))
    .filter(({ id, post }) => id && post && post.format !== "live" && post.status !== "published" && post.pauta !== false && !vaAPauta(post));
  const salida = [];
  for (const { post, id } of lista) {
    const oferta = deLaOferta(post, { ofertas, codigo });
    if (post.pilar !== "anuncio" && !oferta) continue;
    const motivo = oferta ? "La oferta del mes" : "Tipo «Anuncio» del plan semanal";
    salida.push({ id, motivo, etapa: etapaSugerida(post, { oferta }) });
  }
  // PRESENTACIÓN también (antes nunca caía nada ahí, y es la etapa con más presupuesto): lo que le habla a quien aún no
  // conoce la marca —un educativo, un diferenciador, contenido humano o una solución a un problema, en nivel frío—,
  // como mucho `MAX_PRESENTACION_AUTO` (el curso pide de 3 a 6 anuncios por conjunto).
  const yaEn = new Set(salida.map((s) => s.id));
  const frias = lista.filter(({ post, id }) => !yaEn.has(id) && TIPOS_PRESENTACION.has(post.pilar) && NIVELES_FRIOS.has(post.nivel));
  const faltan = Math.max(0, MAX_PRESENTACION_AUTO - salida.filter((s) => s.etapa === "presentacion").length);
  for (const { id } of frias.slice(0, faltan)) salida.push({ id, motivo: "Para quien aún no conoce la marca", etapa: "presentacion" });
  // Una cuenta NUEVA sólo corre Presentación y Evaluación (decisión 3): lo de conversión o ascensión se perdería sin
  // avisar. Va a Evaluación y lo dice (`cuentaNueva`).
  return salida.map(({ id, motivo, etapa }) => {
    const nueva = cuenta === "nueva" && (etapa === "conversion" || etapa === "ascension");
    const m = nueva ? `${motivo} (cuenta nueva: va a Evaluación)` : motivo;
    return { id, motivo: m, ...(nueva ? { cuentaNueva: etapa } : {}), pauta: limpiarPauta({ etapa: nueva ? "evaluacion" : etapa, como: "", auto: true, motivo: m }) };
  });
}

/** Cuántas se marcan solas para Presentación, como mucho. */
export const MAX_PRESENTACION_AUTO = 4;
const TIPOS_PRESENTACION = new Set(["educativo", "diferenciador", "humano", "solucion", "maletas"]);
const NIVELES_FRIOS = new Set(["inconsciente", "problema", "solucion"]);

/**
 * El aviso de una cuenta nueva: lo que iba a conversión o ascensión se movió a evaluación (una cuenta nueva sólo corre
 * Presentación y Evaluación). "" si no hubo ninguna. Pura.
 */
export function avisoCuentaNueva(sugeridas = []) {
  const n = (sugeridas ?? []).filter((s) => s?.cuentaNueva).length;
  if (!n) return "";
  return `Cuenta nueva: ${n === 1 ? "una publicación que iba" : `${n} publicaciones que iban`} a Conversión o Ascensión ${n === 1 ? "va" : "van"} a Evaluación. Una cuenta nueva sólo corre Presentación y Evaluación hasta tener historial.`;
}

/** Los días con la pauta de las publicaciones de `pautas` (id → pauta, o `false` para quitarla y que no se vuelva a proponer). Lo que no está, igual. Pura. */
export function conPautas(days = [], pautas = {}) {
  return (days ?? []).map((d) => {
    let cambio = false;
    const posts = (d.posts ?? []).map((p) => {
      if (!Object.hasOwn(pautas, p.id)) return p;
      cambio = true;
      return { ...p, pauta: pautas[p.id] ? limpiarPauta(pautas[p.id]) : false };
    });
    return cambio ? { ...d, posts } : d;
  });
}

// ------------------------------------------------------------
// La revisión de anuncio («Revisar el mes»)
// ------------------------------------------------------------

const DIAS = "lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo";
// Los bordes de palabra con letras de verdad: `\b` sólo entiende las de ASCII, y «acné» o «últimas» no casarían.
const ANTES = "(?:^|[^\\p{L}\\p{N}])";
const DESPUES = "(?=[^\\p{L}\\p{N}]|$)";
/** Lo que caduca en un anuncio que corre semanas (la palabra, en el grupo 1). */
const CADUCA = new RegExp(`${ANTES}(${[
  "hoy", "ma[ñn]ana", "pasado ma[ñn]ana", "esta (?:noche|tarde|ma[ñn]ana|semana)", `este (?:fin de semana|finde|${DIAS})`,
  `(?:el|este|pr[oó]ximo) (?:${DIAS})`, "s[oó]lo por hoy", "[uú]ltimas horas",
  "(?:desde|hasta|a) las \\d{1,2}(?:[:.]\\d{2})?", "\\d{1,2}(?::\\d{2})?\\s?(?:a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)",
].join("|")})${DESPUES}`, "iu");
/** Lo que se dice de quien lee y Meta rechaza (atributos personales): la frase, en el grupo 1. */
const PERSONAL = new RegExp(`${ANTES}((?:¿\\s*)?(?:tienes|ten[eé]s|est[aá]s|eres|sufres|padeces|te sientes|te cuesta|te duele|te da verg[uü]enza|tu|tus)${DESPUES}[^.!?\\n]{0,40}?${ANTES.replace("^|", "")}(?:${[
  "sobrepeso", "obesidad", "obes[oa]s?", "gord[oa]s?", "kilos de m[aá]s", "celulitis", "estr[ií]as", "arrugas", "acn[eé]", "calvicie",
  "calv[oa]", "ca[ií]da del cabello", "impotencia", "diabetes", "diab[eé]tic[oa]", "depresi[oó]n", "deprimid[oa]", "ansiedad", "ansios[oa]",
  "enfermedad", "enferm[oa]", "c[aá]ncer", "deudas?", "endeudad[oa]", "quiebra", "desemplead[oa]", "sin trabajo", "divorciad[oa]",
  "solter[oa]", "embarazada", "infertilidad", "mal aliento", "insomnio",
].join("|")}))${DESPUES}`, "iu");
const SALUDO = /^\s*(?:[¡!]?\s*)?(?:hola|buen(?:os|as)? (?:d[ií]as|tardes|noches)|feliz (?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|d[ií]a|semana|fin de semana)|les presentamos|te presentamos|bienvenid[oa]s?|conoce (?:a|nuestr)|nuevo post|atenci[oó]n)(?=[^\p{L}\p{N}]|$)/iu;
const LLAMADO_WHATSAPP = /(whats|wasap|wa\.me|escr[ií]b|mensaje|chat|\bdm\b|inbox)/i;
const LLAMADO_WEB = /(\bweb\b|tienda en l[ií]nea|sitio|p[aá]gina|link|enlace|www\.|https?:|compr[aá]\b|compra (?:en|aqu|ya)|haz tu pedido|pide|ped[ií]|entra|visita|toca)/i;

/** La primera línea de un caption (lo que se ve antes de «más»). Pura. */
export const primeraLinea = (texto) => String(texto ?? "").trim().split(/\n/)[0].trim();

/** ¿Se parecen dos captions tanto que Meta los tomaría por el mismo anuncio? La misma primera línea o casi las mismas palabras. Pura. */
export function casiIguales(a, b) {
  const pa = sinTildes(primeraLinea(a)).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const pb = sinTildes(primeraLinea(b)).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (pa.length >= 15 && pa === pb) return true;
  const A = palabrasDe(a);
  const B = palabrasDe(b);
  if (A.size < 6 || B.size < 6) return false;
  const comunes = [...A].filter((w) => B.has(w)).length;
  return comunes / (A.size + B.size - comunes) >= 0.6;
}

const fechaLegible = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Lo que la revisión de anuncio ve en una publicación que va a pauta → [{ codigo, texto, arreglo?, ia? }]. `arreglo`:
 * el botón que lo arregla solo (`aplicarArregloPauta`); `ia`: lo arregla el motor reescribiéndolo como anuncio.
 * `otras`: las demás que van a pauta en el mes ([{ date, post }]), para «casi igual a otra de su etapa». Pura.
 */
export function problemasDePauta(post, { destino = "", otras = [] } = {}) {
  const p = limpiarPauta(post?.pauta);
  if (!p) return [];
  const salida = [];
  const conCaption = llevaCaption(post?.format);
  const caption = String(post?.descripcion || post?.script || "");
  if (conCaption && !caption.trim()) {
    salida.push({ codigo: "sin-caption", texto: "Va a pauta y no tiene caption: el anuncio saldría sin texto principal.", ia: "Escribir el caption como anuncio" });
  }
  if (conCaption && caption.trim()) {
    const m = CADUCA.exec(caption);
    if (m) salida.push({ codigo: "caduca", texto: `Dice «${m[1].trim()}»: un anuncio corre semanas y eso caduca (salvo que la campaña termine ese día).`, ia: "Reescribirlo como anuncio" });
    const linea = primeraLinea(caption);
    if (linea.length > PRIMERA_LINEA) salida.push({ codigo: "primera-linea", texto: `La primera línea tiene ${linea.length} caracteres: pasados unos ${PRIMERA_LINEA}, el gancho queda escondido tras «más».`, ia: "Reescribirlo como anuncio" });
    else if (SALUDO.test(linea) || linea.replace(/[^\p{L}]/gu, "").length < 12) salida.push({ codigo: "primera-linea", texto: "La primera línea no engancha (un saludo o casi nada): es lo único que se ve del anuncio antes de «más».", ia: "Reescribirlo como anuncio" });
    const web = destino === "web";
    if (!(web ? LLAMADO_WEB : LLAMADO_WHATSAPP).test(caption)) {
      salida.push({ codigo: "llamado", texto: web ? "No invita a entrar a la web a comprar." : "No invita a escribir por WhatsApp: en un anuncio de mensajes es lo que se paga.", arreglo: "Añadir el llamado" });
    }
    const m2 = PERSONAL.exec(caption);
    if (m2) salida.push({ codigo: "personal", texto: `«${m2[1].trim()}» dice algo de quien lee: Meta rechaza los anuncios que afirman atributos personales. Habla del problema, no de la persona.`, ia: "Reescribirlo como anuncio" });
  }
  const hashtags = new Set([...String(caption).match(/#[\p{L}\p{N}_]+/gu) ?? [], ...String(post?.hashtagsFinales ?? "").match(/#[\p{L}\p{N}_]+/gu) ?? []].map((h) => h.toLowerCase()));
  if (hashtags.size > MAX_HASHTAGS_PAUTA || separarHashtags(caption).hashtags) {
    salida.push({ codigo: "hashtags", texto: hashtags.size > MAX_HASHTAGS_PAUTA ? `Lleva ${hashtags.size} hashtags: en un anuncio, ${MAX_HASHTAGS_PAUTA} como mucho (cada uno es una salida).` : "Lleva hashtags dentro del caption: en un anuncio van aparte, y pocos.", arreglo: `Dejar ${MAX_HASHTAGS_PAUTA}` });
  }
  if (conCaption && caption.trim()) {
    const igual = (otras ?? []).find((o) => o?.post?.id !== post?.id && limpiarPauta(o?.post?.pauta)?.etapa === p.etapa
      && casiIguales(caption, o.post.descripcion || o.post.script || ""));
    if (igual) salida.push({ codigo: "parecida", texto: `Casi igual a la del ${igual.date ? fechaLegible(igual.date) : "otro día"} (también de ${nombreEtapaCiclo(p.etapa).toLowerCase()}): Meta las trataría como el mismo anuncio.`, ia: "Escribir otra distinta", distintaDe: String(igual.post.descripcion || igual.post.script || "").slice(0, 300) });
  }
  if (!tieneTextosAnuncio(post)) salida.push({ codigo: "textos", texto: "Le faltan sus textos de anuncio aparte (para montarlo subiendo la pieza).", ia: "Escribir los textos del anuncio" });
  else salida.push(...problemasDeTextosAnuncio(post.anuncio, { destino }));
  return salida;
}

/**
 * Lo que la revisión ve en los textos de anuncio APARTE (`post.anuncio`: los que se pegan al subir la pieza), con las
 * mismas reglas del caption: lo que caduca, lo que dice de quien lee, la primera línea y el llamado. Antes sólo se
 * revisaba el caption y un texto de anuncio con «¡Sólo hoy!» se iba al Ads Manager así. Un problema por regla (con
 * qué textos), no uno por texto. Pura.
 */
export function problemasDeTextosAnuncio(anuncio, { destino = "" } = {}) {
  const a = limpiarAnuncio(anuncio, { destino });
  if (!a?.textos.length) return [];
  const salida = [];
  const cuales = (lista) => (lista.length === 1 ? `el texto ${lista[0]}` : `los textos ${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`);
  const caducan = [];
  const personales = [];
  const largos = [];
  let palabra = "";
  let frase = "";
  a.textos.forEach((t, i) => {
    const m = CADUCA.exec(t);
    if (m) { caducan.push(i + 1); palabra ||= m[1].trim(); }
    const p = PERSONAL.exec(t);
    if (p) { personales.push(i + 1); frase ||= p[1].trim(); }
    if (primeraLinea(t).length > PRIMERA_LINEA) largos.push(i + 1);
  });
  const ia = "Reescribir los textos del anuncio";
  if (caducan.length) salida.push({ codigo: "caduca-anuncio", texto: `En ${cuales(caducan)} del anuncio dice «${palabra}»: un anuncio corre semanas y eso caduca.`, ia });
  if (personales.length) salida.push({ codigo: "personal-anuncio", texto: `En ${cuales(personales)} del anuncio, «${frase}» dice algo de quien lee: Meta rechaza los anuncios que afirman atributos personales.`, ia });
  if (largos.length) salida.push({ codigo: "primera-linea-anuncio", texto: `En ${cuales(largos)} del anuncio la primera línea pasa de ${PRIMERA_LINEA} caracteres: el gancho queda escondido tras «más».`, ia });
  const web = destino === "web";
  const sinLlamado = a.textos.map((t, i) => ((web ? LLAMADO_WEB : LLAMADO_WHATSAPP).test(t) ? 0 : i + 1)).filter(Boolean);
  if (sinLlamado.length) salida.push({ codigo: "llamado-anuncio", texto: `${cuales(sinLlamado).replace(/^./, (c) => c.toUpperCase())} del anuncio no ${sinLlamado.length === 1 ? "invita" : "invitan"} a ${web ? "entrar a la web a comprar" : "escribir por WhatsApp"}.`, ia });
  return salida;
}

/** El llamado que se añade si falta (con el WhatsApp del cliente si se sabe). Pura. */
export function llamadoPorDefecto({ destino = "", whatsapp = "" } = {}) {
  if (destino === "web") return "Haz tu pedido en nuestra web.";
  const n = corto(whatsapp, 40);
  return `Escríbenos por WhatsApp${n ? ` al ${n}` : ""} y te asesoramos.`;
}

/**
 * Lo que se arregla solo, sobre la publicación: los hashtags (fuera del caption, 3 como mucho) o el llamado que falta
 * (una línea al final). Lo demás lo reescribe el motor. Pura.
 */
export function aplicarArregloPauta(post, codigo, { destino = "", whatsapp = "" } = {}) {
  if (!post) return post;
  if (codigo === "hashtags") {
    const { texto, hashtags } = separarHashtags(post.descripcion || post.script || "");
    const todos = juntarHashtags(post.hashtagsFinales, hashtags);
    return { ...post, ...(post.descripcion || post.script ? { descripcion: texto } : {}), hashtagsFinales: recortarHashtags(todos) };
  }
  if (codigo === "llamado") {
    const base = String(post.descripcion || post.script || "").trim();
    return { ...post, descripcion: [base, llamadoPorDefecto({ destino, whatsapp })].filter(Boolean).join("\n\n") };
  }
  return post;
}

/**
 * Lo que va a pauta en el mes, con su revisión → [{ date, post, problemas }], en orden de fecha (también las que no
 * tienen nada: «Revisar el mes» las enseña aparte, como listas). Pura.
 */
export function revisarPauta(days = [], { destino = "" } = {}) {
  const todas = [...(days ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))
    .flatMap((d) => (d.posts ?? []).filter(vaAPauta).map((post) => ({ date: d.date, post })));
  // «Casi igual» se dice de la segunda, comparada con las de antes (la primera no tiene la culpa).
  return todas.map((x, i) => ({ ...x, problemas: problemasDePauta(x.post, { destino, otras: todas.slice(0, i) }) }));
}

/** «6 van a pauta · 3 con algo que revisar». Pura. */
export function resumenPauta(lista = []) {
  if (!lista.length) return "";
  const con = lista.filter((x) => x.problemas.length).length;
  return `${lista.length} ${lista.length === 1 ? "va" : "van"} a pauta${con ? ` · ${con} con algo que revisar` : " · listas como anuncio"}`;
}

/** Cómo se dice una pauta en una línea («Presentación · las dos formas»). Pura. */
export function describirPauta(pauta) {
  const p = limpiarPauta(pauta);
  if (!p) return "";
  const como = COMO_PAUTA.find((c) => c.id === p.como)?.nombre ?? "";
  return [nombreEtapaCiclo(p.etapa), como.toLowerCase()].filter(Boolean).join(" · ");
}
