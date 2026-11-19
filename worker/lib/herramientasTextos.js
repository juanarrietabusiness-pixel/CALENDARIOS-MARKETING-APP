// ============================================================
// Los TEXTOS y el MES por el conector de Claude (MCP): el método del curso, por el motor de la agencia
//
// Por el conector, Claude escribía los textos él mismo y los guardaba con crear_publicacion/editar_publicacion: el
// calendario los guardaba tal cual y se saltaba todo lo que vive en su código (el estudio de mercado, el catálogo con
// su precio exacto, los ángulos de venta, la forma del gancho que escoge el código, el lenguaje del cliente, la regla
// del anuncio, la estrategia del mes…). Estas herramientas van por las MISMAS funciones que la pantalla:
//
//   · escribir_textos      el motor del servidor escribe (worker/lib/estudio/lote.js: modo «campos» para lo que le
//                          falta a una publicación con idea y para los campos pedidos —el botón «IA»—, modo «plan» para
//                          las vacías del plan, como el paso de las ideas del asistente del mes) y se guarda en el
//                          calendario sin pisar a nadie (`cambiarCalendario`). Sólo rellena lo vacío, salvo los campos
//                          pedidos (devuelve lo que había). Una tanda por llamada: «Quedan N».
//   · ficha_de_textos      el modo HÍBRIDO: el MISMO pedido que el motor le mandaría a su IA (`pedidoDelLote`), con la
//                          casilla ya resuelta por el código, para que Claude escriba EN EL CHAT con el método y guarde
//                          con editar_publicacion (que revisa lo guardado con las reglas: `avisosAlGuardar`). Sólo lee.
//   · preparar_mes         el paso «Plan» del asistente del mes (lib/asistenteMes.js): las casillas del plan semanal
//                          en los días libres, con su matriz y lo que va a pauta solo. Sin IA.
//   · estrategia_del_mes   leer, proponer (la IA de POST /api/estudio/<c>/estrategia, no guarda) y guardar (con
//                          confirmación) la estrategia del mes, como el paso «Estrategia» del asistente.
//   · revisar_mes          las REGLAS de «Revisar el mes» (lib/revisionMes.js, lib/pauta.js) y el balance, con cómo
//                          se arregla cada cosa. Sólo lee.
//
// Las reglas de un mes se arman UNA vez (`contextoDeRevision`, `revisionDelMes`): las usan revisar_mes y lo que
// devuelven crear_publicacion y editar_publicacion al guardar (worker/lib/mcp.js).
// ============================================================

import { pedidoDelLote, produccionDeLote } from "./estudio/lote.js";
import { estrategiaDelMes } from "./estudio/estrategiaMes.js";
import { cambiarCalendario, mesDeFila } from "./estudio/ponerEnPost.js";
import { obtenerOCrearMes, ErrorMes } from "./meses.js";
import { leerMercado } from "./mercado.js";
import { leerNegocio } from "./negocio.js";
import { plantillasDelEspacio } from "./plantillasPlan.js";
import { uuid } from "./ids.js";
import { rowToClient } from "../../src/lib/filas.js";
import { MONTHS, FORMATS } from "../../src/constants.js";
import { casillaDeCampos, aplicarCampos, textosQueFaltan, camposConSuBoton, conceptoDelDia } from "../../src/lib/camposTexto.js";
import { usadosDelMes, casillasSinIdea, conIdea, formatoDelPlan } from "../../src/lib/ideaPublicacionPura.js";
import {
  PASO_MES, limpiarAsistente, conAsistente, conCasillas, planDelAsistente, matrizDelPlan, pautaDelPlan, publicacionesDelPlan,
} from "../../src/lib/asistenteMes.js";
import { estrategiaDelCalendario, limpiarEstrategia, balanceDelMes, objetivoDe, OBJETIVOS_MES, ETAPAS, embudoDelMes, idEtapaCiclo } from "../../src/lib/estrategiaMes.js";
import { semanasDelPlan, unoPorSemana } from "../../src/lib/planMes.js";
import { revisarMes, revisarPauta, resumenRevision, resumenPauta, corregirVoseo } from "../../src/lib/revisionMes.js";
import { vaAPauta, describirPauta, avisoCuentaNueva, llamadoPorDefecto, recortarHashtags, MAX_HASHTAGS_PAUTA, BOTONES_PAUTA } from "../../src/lib/pauta.js";
import { separarHashtags, juntarHashtags } from "../../src/lib/reglasFormato.js";
import { nombreDeForma } from "../../src/lib/formasGancho.js";
import { anguloDe, productosParaPlan, limpiarEstudio } from "../../src/lib/estudioMercado.js";
import { avisoDeLoQueFalta } from "../../src/lib/materialTipo.js";
import { nombreDePilar } from "../../src/lib/pilares.js";
import { fechasDelMes } from "../../src/lib/fechasEspeciales.js";
import { nombreEtapaCiclo } from "../../src/lib/cicloVentas.js";
import { fechaEnZona } from "../../src/lib/agenda.js";

/** Un error de lo pedido: vuelve a Claude con `isError`, no como fallo del servidor. */
export class ErrorTextos extends Error {}

const clienteP = { type: "string", description: "Nombre del cliente (o su id). Basta con parte del nombre." };
const mesP = { type: "string", description: "El mes, AAAA-MM (p. ej. 2026-11)." };
const pubP = { type: "string", description: "El ID de la publicación (sale en ver_calendario)." };
const soloLectura = { readOnlyHint: true, openWorldHint: false };
const escribe = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

/** Los campos con el nombre que usa Claude → el del motor (lib/camposTexto.js `ORDEN_CAMPOS`). */
const CAMPOS_CLAUDE = Object.freeze({
  titulo: "titulo", idea: "idea", texto_pieza: "textoPieza", guion: "guion", descripcion: "descripcion", caption: "descripcion",
  hashtags: "hashtags", anuncio: "anuncio",
});
/** Dónde vive cada campo del motor en la publicación. */
const CLAVE_EN_POST = Object.freeze({ titulo: "title", idea: "idea", textoPieza: "textoPieza", guion: "guion", descripcion: "descripcion", hashtags: "hashtagsFinales", anuncio: "anuncio" });
const NOMBRE_CAMPO = Object.freeze({ titulo: "título", idea: "idea", textoPieza: "texto de la pieza", guion: "guion", descripcion: "caption", hashtags: "hashtags", anuncio: "textos del anuncio" });
/** Cuántas publicaciones por llamada (como «Completar los textos» de la pantalla). */
export const TANDA_TEXTOS = 6;
/** Hasta dónde puede llegar el pedido que devuelve ficha_de_textos; si pasa, la tanda baja. */
export const MAX_FICHA = 25000;

const camposP = {
  type: "array", items: { type: "string", enum: Object.keys(CAMPOS_CLAUDE) },
  description: "Opcional. Con una publicación: esos campos se REESCRIBEN aunque tengan texto (como el botón «IA» de cada campo; con el caption van también los hashtags y los textos de anuncio si le faltan). Con un mes: sólo esos campos, y sólo donde falten. Sin campos: lo que le falte.",
};
const pideP = { type: "string", description: "Opcional. Lo que pide la persona para estos textos (≤ 300 caracteres), p. ej. «más corto y con el precio del catálogo»." };

export const DEFINICIONES_TEXTOS = Object.freeze([
  {
    name: "escribir_textos",
    description: "Escribe los textos de publicaciones del calendario POR EL MOTOR de la agencia (el mismo de «Completar los textos» y del asistente del mes): aplica el estudio de mercado, el catálogo con el precio EXACTO, los ángulos de venta, la forma del gancho que escoge el código, el lenguaje del cliente, la regla del anuncio en lo que va a pauta, la estrategia del mes, las fechas especiales, la ficha del cliente y la UGC. Por defecto NO la uses: escribe tú con ficha_de_textos (la agencia quiere que pienses tú). Úsala sólo si la persona pide que los escriba el calendario. Con publicacion_id: lo que le falta (si está vacía, la idea entera: título, idea, qué se ve, texto o guion, caption, hashtags); con campos, REESCRIBE esos campos (devuelve lo que había, por si hay que volver atrás con editar_publicacion). Con cliente y mes: lo que le falta al mes, de 6 en 6 (dice cuántas quedan: vuelve a llamar con lo mismo). Sólo rellena lo vacío (salvo los campos pedidos), nunca toca lo publicado y cuesta unos céntimos de IA. GUARDA en el calendario: enséñale a la persona lo escrito. Lo normal es escribirlos tú con ficha_de_textos.",
    annotations: escribe,
    inputSchema: { type: "object", properties: { publicacion_id: pubP, cliente: clienteP, mes: mesP, campos: camposP, pide: pideP } },
  },
  {
    name: "ficha_de_textos",
    description: "El MÉTODO del calendario para que escribas TÚ los textos en el chat: devuelve, para una publicación o una tanda del mes (las mismas que escribiría escribir_textos), EXACTAMENTE el pedido que el motor le manda a su IA, con lo que el código ya decidió para cada pieza (forma del gancho, ángulo de venta, táctica, producto con su precio exacto, nivel de consciencia, estructura del carrusel) y el estudio de mercado, el lenguaje del cliente, la regla del anuncio, las fechas especiales, la estrategia del mes, la ficha del cliente y la UGC. No llama a ninguna IA ni guarda nada. Es la forma POR DEFECTO de escribir los textos de un cliente: escribes tú siguiendo el método de la agencia (escribir_textos, que escribe con la IA del calendario, sólo si la persona lo pide). Después guarda cada campo con editar_publicacion (con forma_gancho y angulo, los ids que da la ficha): el calendario revisa lo guardado y te devuelve sus avisos.",
    annotations: soloLectura,
    inputSchema: { type: "object", properties: { publicacion_id: pubP, cliente: clienteP, mes: mesP, campos: camposP, pide: pideP } },
  },
  {
    name: "preparar_mes",
    description: "El paso «Plan» del asistente del mes: pone en los días LIBRES del mes las publicaciones del PLAN SEMANAL de la empresa (formato, tipo de contenido, hora y la matriz: producto, nivel, deseo, perfil), todavía sin ideas, y marca solas «Va a pauta» las del tipo Anuncio, las de la oferta del mes y algunas frías para Presentación. Aplica los ajustes de temporada (un día delicado deja de vender; una fecha comercial pasa a promoción) salvo con temporada: false. Sin IA y gratis; crea el mes si no existía. Úsala para empezar un mes (después de estrategia_del_mes) en vez de crear las publicaciones una a una. Con llenar_ocupados, también en los días que ya tienen publicaciones (no repite lo que el plan ya puso). Después: escribir_textos con cliente y mes (o ficha_de_textos para escribirlos tú).",
    annotations: escribe,
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP, mes: mesP,
        llenar_ocupados: { type: "boolean", description: "También en los días que ya tienen publicaciones. Por defecto no." },
        temporada: { type: "boolean", description: "Aplicar los ajustes de temporada. Por defecto sí." },
      },
      required: ["cliente", "mes"],
    },
  },
  {
    name: "estrategia_del_mes",
    description: "La ESTRATEGIA de un mes: objetivo, producto foco, campaña, ofertas, código de descuento y cada semana (las filas del calendario) con su concepto y su etapa del ciclo de ventas. La lee el motor de textos en todo lo que escribe. Sin más, la lee. Con proponer, la IA la PROPONE (no se guarda nada; unos céntimos) con el catálogo, el estudio de mercado, las fechas especiales y lo que mejor funcionó el mes anterior; las ofertas van ANTES (la IA las lee). Con guardar, la guarda (lo que no se pase se queda como estaba): sin confirmado: true NO se guarda nada y se enseña exactamente lo que se guardaría; enséñaselo a la persona y, sólo con su sí, vuelve a llamar con confirmado: true (nunca lo pongas por tu cuenta). Después: preparar_mes.",
    annotations: escribe,
    inputSchema: {
      type: "object",
      properties: {
        cliente: clienteP, mes: mesP,
        proponer: {
          description: "true, o lo que la agencia ya decidió y la IA respeta: { objetivo, foco, ofertas }.",
          anyOf: [{ type: "boolean" }, { type: "object", properties: { objetivo: { type: "string", enum: OBJETIVOS_MES.map((o) => o.id) }, foco: { type: "string" }, ofertas: { type: "string" } } }],
        },
        guardar: {
          type: "object",
          description: "Lo que se guarda (sólo lo que se pase cambia). foco: el producto del catálogo (nombre o id) o \"\" para la marca entera. semanas: una por fila del calendario, en orden, { concepto, etapa }.",
          properties: {
            objetivo: { type: "string", enum: OBJETIVOS_MES.map((o) => o.id) },
            foco: { type: "string" }, campana: { type: "string" }, ofertas: { type: "string" }, codigo: { type: "string" }, razon: { type: "string" },
            semanas: { type: "array", items: { type: "object", properties: { concepto: { type: "string" }, etapa: { type: "string", enum: Object.keys(ETAPAS) } } } },
          },
        },
        confirmado: { type: "boolean", description: "Sólo con el sí de la persona, después de enseñarle lo que se guardaría." },
      },
      required: ["cliente", "mes"],
    },
  },
  {
    name: "revisar_mes",
    description: "«Revisar el mes» antes de enviarlo al cliente, con las REGLAS de la agencia (gratis, sin IA): precios que no están en el catálogo, la competencia nombrada, promociones en fechas delicadas, voseo, sin llamado a la acción, hashtags (de más o dentro del caption), cifras del gancho que no están escritas, ganchos de miedo, lo que va a pauta revisado como anuncio y lo que le falta a una publicación sin contenido; y el balance del mes (tipos, productos, formatos, niveles). Por publicación: qué falla, por qué y cómo se arregla (con qué herramienta). Sólo lee: no cambia nada.",
    annotations: soloLectura,
    inputSchema: { type: "object", properties: { cliente: clienteP, mes: mesP }, required: ["cliente", "mes"] },
  },
]);

// ------------------------------------------------------------
// Lo común
// ------------------------------------------------------------

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
const JSON_CLIENTE = ["competidores", "fechas_especiales", "kit_marca", "ritmo_contenido", "plan_contenido", "notas_semana", "dias_trabajo", "plan_semanal", "saved_categories", "weekly_structure", "meta_recipe"];
/** El cliente de D1 con la forma de la aplicación (lo que reciben las funciones puras: planSemanal, fechasEspeciales…). */
export const clienteDeFila = (fila) => rowToClient(Object.fromEntries(Object.entries(fila ?? {}).map(([k, v]) => [k, JSON_CLIENTE.includes(k) ? leerJSON(v, null) : v])));
const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const idPublicacion = () => `p${uuid().replace(/-/g, "").slice(0, 12)}`;
/** Una semilla estable por mes: el motor da la misma forma a las mismas piezas en cada tanda. */
const semillaDe = (t) => [...String(t ?? "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);
const fechaLegible = (iso) => {
  const [a, m, d] = String(iso).split("-").map(Number);
  return `${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} de ${MONTHS[m - 1]?.toLowerCase() ?? ""}`;
};
const formatoLegible = (p) => (p?.format === "reel" && p?.rostro ? "UGC" : FORMATS[p?.format]?.label ?? p?.format ?? "Post");
const tituloDe = (p) => corto(p?.title || p?.idea || nombreDePilar(p?.pilar) || "sin título", 70);

/** «2026-11» → { year, month (0–11), texto }. */
function mesDe(texto) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(texto ?? "").trim());
  const month = m ? Number(m[2]) - 1 : -1;
  if (!m || month < 0 || month > 11) throw new ErrorTextos("El mes va como AAAA-MM (por ejemplo 2026-11).");
  return { year: Number(m[1]), month, texto: `${m[1]}-${m[2]}` };
}
const nombreMes = (year, month) => `${MONTHS[month]?.toLowerCase() ?? ""} de ${year}`;
/** Un mes sin cajón todavía (el calendario siempre activo: se crea al escribir, nunca al mirar). */
const mesVacio = (clientId, year, month) => ({ id: null, client_id: clientId, year, month, days: [], weekConcepts: [], opciones: {}, campaign: "", offers: "", promoCode: "" });

/** La estrategia que viaja con el pedido (como la pantalla: sólo si el mes tiene algo; si no, la lee el servidor). */
const estrategiaDe = (m) => (m && (m.campaign || m.weekConcepts?.length || m.offers || m.opciones?.estrategia) ? estrategiaDelCalendario(m) : undefined);
/** Lo que ya hay en el mes para el modo «plan» (título o idea), como el paso de las ideas del asistente del mes. */
const usadosDelPlan = (m) => (m?.days ?? []).flatMap((d) => (d.posts ?? []).map((p) => String(p.title || p.idea || "").trim().slice(0, 80))).filter(Boolean).slice(0, 30);

/** Los campos que pide Claude → los del motor, sin repetir. Null si no pide ninguno. */
function camposPedidos(campos) {
  if (campos === undefined || campos === null) return null;
  const lista = Array.isArray(campos) ? campos : [campos];
  const malos = lista.filter((c) => !CAMPOS_CLAUDE[String(c)]);
  if (malos.length) throw new ErrorTextos(`No conozco el campo «${malos[0]}». Los que hay: ${Object.keys(CAMPOS_CLAUDE).join(", ")}.`);
  const fuera = [...new Set(lista.map((c) => CAMPOS_CLAUDE[String(c)]))];
  return fuera.length ? fuera : null;
}

/** Un error del motor con su estado (400, 404, 502…) o de un mes es del pedido: vuelve a Claude con su texto. */
async function delMotor(promesa) {
  try {
    return await promesa;
  } catch (e) {
    if (e?.estado || e instanceof ErrorMes) throw new ErrorTextos(e.message);
    throw e;
  }
}

// ------------------------------------------------------------
// Las reglas de «Revisar el mes»: una regla, un sitio (revisar_mes y lo que se guarda por el conector)
// ------------------------------------------------------------

/**
 * Lo que necesitan las reglas de un mes, leído UNA vez: el catálogo y el estudio de mercado, la competencia, las fechas
 * delicadas del mes y, sólo si algo va a pauta, el destino del cliente (WhatsApp o web: cambia qué llamado se pide).
 * `cliente`: la fila de D1.
 */
export async function contextoDeRevision(acceso, cliente, { year, month, conPauta = false }) {
  const app = clienteDeFila(cliente);
  const mercado = await leerMercado(acceso, cliente.id).catch(() => null);
  const competidores = (limpiarEstudio(mercado?.estudio ?? mercado?.borrador)?.general?.competidores ?? []).map((c) => c.nombre);
  const delicadas = Object.fromEntries(fechasDelMes(year, month, app.fechasEspeciales).filter((f) => f.delicada).map((f) => [f.fecha, f.nombre]));
  const destino = conPauta ? (await leerNegocio(acceso, cliente.id).catch(() => null))?.destino ?? "" : "";
  return {
    catalogo: mercado?.catalogo ?? [], competidores, delicadas, destino, whatsapp: app.whatsapp ?? "",
    // Con el estudio de mercado (o el catálogo) se revisan también las cifras del gancho, como la pantalla.
    ...(mercado ? { estudio: mercado.estudio ?? mercado.borrador ?? null } : {}),
  };
}

/** Las reglas sobre los días de un mes → { lista (revisarMes), pauta (revisarPauta) }. Pura. */
export function revisionDelMes(days = [], ctx = {}) {
  const { catalogo = [], competidores = [], delicadas = {}, destino = "" } = ctx;
  return {
    lista: revisarMes(days, { catalogo, competidores, delicadas, ...(Object.hasOwn(ctx, "estudio") ? { estudio: ctx.estudio } : {}) }),
    pauta: revisarPauta(days, { destino }),
  };
}

/** Cómo se arregla cada aviso (y con qué herramienta), para Claude. */
function comoArreglar(problema, post, ctx = {}) {
  switch (problema.codigo) {
    case "precio": return "Usa el precio EXACTO del catálogo: corrígelo con editar_publicacion, o escribir_textos con campos [\"descripcion\"] y pide «con el precio del catálogo».";
    case "competencia": return "Quita el nombre de la competencia (editar_publicacion).";
    case "delicada": return "Es una fecha delicada: quita la promoción (editar_publicacion, o escribir_textos con pide «sin promociones: es una fecha delicada»).";
    case "voseo": {
      const caption = String(post?.descripcion || post?.script || "");
      return caption && corregirVoseo(caption) !== caption ? `Pásalo a tú con editar_publicacion; el caption quedaría: «${corto(corregirVoseo(caption), 600)}».` : "Pásalo a tú con editar_publicacion (las palabras de arriba).";
    }
    case "cta": return "Añade un llamado a la acción (escribir, agendar, comprar…) al caption con editar_publicacion, o escribir_textos con campos [\"descripcion\"].";
    case "hashtags": {
      if (vaAPauta(post)) {
        const { texto, hashtags } = separarHashtags(post?.descripcion || post?.script || "");
        return `En un anuncio, ${MAX_HASHTAGS_PAUTA} como mucho y aparte: editar_publicacion con hashtags «${recortarHashtags(juntarHashtags(post?.hashtagsFinales, hashtags))}»${hashtags ? ` y el caption sin ellos («${corto(texto, 200)}…»)` : ""}.`;
      }
      const { hashtags } = separarHashtags(post?.descripcion || post?.script || "");
      return hashtags ? `Pásalos a «hashtags» con editar_publicacion (hashtags «${juntarHashtags(post?.hashtagsFinales, hashtags)}» y el caption sin ellos).` : "Deja 30 como mucho (editar_publicacion).";
    }
    case "cifra-gancho": return "Usa una cifra que esté escrita en el catálogo, el estudio de mercado o la idea, o quítala (editar_publicacion).";
    case "miedo": return "Cuéntalo sin miedo ni exageración (editar_publicacion, o escribir_textos con campos y pide «sin asustar»).";
    case "llamado": return `Añade al final del caption: «${llamadoPorDefecto({ destino: ctx.destino, whatsapp: ctx.whatsapp })}» (editar_publicacion).`;
    case "sin-caption": return "escribir_textos con campos [\"descripcion\"]: lo escribe como anuncio.";
    case "textos": return "escribir_textos con campos [\"anuncio\"] (o escríbelos tú y guárdalos con editar_publicacion, anuncio).";
    case "parecida": return `escribir_textos con campos ["descripcion"] y pide «que sea DISTINTA de la otra de su etapa: otro gancho y otro ángulo».`;
    default:
      if (/-anuncio$/.test(problema.codigo)) return "Reescribe sus textos de anuncio: escribir_textos con campos [\"anuncio\"].";
      return problema.ia ? "Reescríbelo como anuncio: escribir_textos con campos [\"descripcion\"]." : "Corrígelo con editar_publicacion.";
  }
}

/** Los avisos de las reglas sobre UNA publicación (de un mes ya revisado), con cómo se arregla cada uno. */
function avisosDePost(postId, revision, ctx) {
  const deTexto = revision.lista.find((x) => x.post.id === postId);
  const dePauta = revision.pauta.find((x) => x.post.id === postId);
  const post = deTexto?.post ?? dePauta?.post;
  return [...(deTexto?.problemas ?? []), ...(dePauta?.problemas ?? [])].map((p) => `· ${p.texto}\n  Cómo: ${comoArreglar(p, post, ctx)}`);
}

/**
 * Lo que devuelven crear_publicacion y editar_publicacion al GUARDAR texto: los avisos de las reglas de «Revisar el mes»
 * para ESA publicación (sin lo que le falta para enviarla sin contenido: eso es de revisar_mes), con cómo se arregla.
 * Lee el catálogo y el estudio UNA vez (y los números del negocio sólo si va a pauta). `cal`: la fila del mes; `days`:
 * los días ya guardados. Nunca lanza: si no puede revisar, lo dice en una línea.
 */
export async function avisosAlGuardar({ acceso, cliente = null, cal, days, postId }) {
  try {
    const fila = cliente ?? await acceso.leerUno("clients", { id: cal.client_id });
    if (!fila) return "";
    const post = (days ?? []).flatMap((d) => d.posts ?? []).find((p) => p?.id === postId);
    const ctx = await contextoDeRevision(acceso, fila, { year: cal.year, month: cal.month, conPauta: vaAPauta(post) });
    const avisos = avisosDePost(postId, revisionDelMes(days, ctx), ctx);
    return avisos.length ? `AVISOS DEL CALENDARIO (corrígelos con editar_publicacion):\n${avisos.join("\n")}` : "Revisado: sin avisos.";
  } catch (e) {
    console.error("mcp avisos al guardar:", e);
    return "No se pudo revisar con las reglas del calendario: usa revisar_mes.";
  }
}

// ------------------------------------------------------------
// Las herramientas
// ------------------------------------------------------------

/** `buscarPublicacion(postId)` → { cal (la fila), dia, post } (la del MCP). `resolverCliente(nombre)` → la fila del cliente. */
export function crearHerramientasTextos({ env, acceso, resolverCliente, usuario, por, buscarPublicacion }) {
  /** El mes de un cliente: la fila (o null si aún no tiene cajón) y su forma de la aplicación. */
  async function mesDelCliente(c, year, month) {
    const fila = await acceso.leerUno("calendars", { client_id: c.id, year, month });
    return { fila, mes: fila ? mesDeFila(fila) : mesVacio(c.id, year, month) };
  }

  /**
   * QUÉ se escribe (lo mismo para escribir_textos y ficha_de_textos), sin llamar a nada: el cliente, el mes y la tanda
   * candidata con su modo. → { cliente, fila, mes, modo: "plan" | "campos", candidatas: [casilla], reemplazar: { id → [campos] },
   * usados, una, otras (cuántas quedan en la otra fase), nada? }.
   */
  async function seleccionar({ publicacion_id: postId, cliente, mes, campos, pide }) {
    const pedidos = camposPedidos(campos);
    const extra = String(pide ?? "").trim() ? { pide: String(pide).trim().slice(0, 300) } : {};
    if (postId) {
      const { cal: fila, dia, post } = await buscarPublicacion(String(postId));
      if (post.status === "published") throw new ErrorTextos("Esa publicación ya salió: no se le cambian los textos.");
      const c = await acceso.leerUno("clients", { id: fila.client_id });
      if (!c) throw new ErrorTextos("No encontré el cliente de esa publicación.");
      const m = mesDeFila(fila);
      const base = { cliente: c, fila, mes: m, una: true, otras: 0 };
      if (pedidos) {
        const casilla = casillaDeCampos(post, dia, { campos: camposConSuBoton(post, pedidos), semana: conceptoDelDia(m, dia), ...extra });
        if (!casilla) throw new ErrorTextos(`Una publicación de formato ${formatoLegible(post)} no lleva ${pedidos.map((k) => NOMBRE_CAMPO[k]).join(" ni ")}${pedidos.includes("anuncio") ? " (los textos de anuncio sólo los lleva lo que va a pauta)" : ""}.`);
        return { ...base, modo: "campos", candidatas: [casilla], reemplazar: { [post.id]: casilla.campos.filter((k) => pedidos.includes(k)) }, usados: usadosDelMes(m, post.id) };
      }
      if (!String(post.idea ?? "").trim() && formatoDelPlan(post.format)) {
        const casilla = casillasSinIdea(m).find((x) => x.clave === post.id);
        return { ...base, modo: "plan", candidatas: [{ ...casilla, ...extra }], reemplazar: {}, usados: usadosDelPlan(m) };
      }
      const faltan = textosQueFaltan(post);
      if (!faltan.length) return { ...base, nada: `A «${tituloDe(post)}» (${fechaLegible(dia.date)}) no le falta ningún texto. Para reescribir uno, vuelve a llamar con campos (p. ej. ["descripcion"]).` };
      const casilla = casillaDeCampos(post, dia, { campos: faltan, semana: conceptoDelDia(m, dia), ...extra });
      if (!casilla) return { ...base, nada: `A «${tituloDe(post)}» no le falta ningún texto que su formato lleve.` };
      return { ...base, modo: "campos", candidatas: [casilla], reemplazar: {}, usados: usadosDelMes(m, post.id) };
    }

    if (!cliente) throw new ErrorTextos("Indica la publicación (publicacion_id) o el cliente y el mes.");
    const c = await resolverCliente(cliente);
    const { year, month, texto } = mesDe(mes);
    const { fila, mes: m } = await mesDelCliente(c, year, month);
    const base = { cliente: c, fila, mes: m, una: false };
    if (!fila || !(m.days ?? []).some((d) => (d.posts ?? []).length)) {
      return { ...base, nada: `${c.name} no tiene publicaciones en ${nombreMes(year, month)} (${texto}). Empieza con preparar_mes (el plan semanal de la empresa) o crea las publicaciones.` };
    }
    // Los días que YA PASARON no se ofrecen (decisión de la agencia, 19-11-2026): lo que no salió ese día ya no sale, y
    // escribirlo gastaba la tanda. Una publicación concreta (publicacion_id) se sigue pudiendo escribir.
    const hoy = fechaEnZona();
    const vigente = (fecha) => String(fecha ?? "") >= hoy;
    const todasVacias = pedidos ? [] : casillasSinIdea(m);
    const vacias = todasVacias.filter((x) => vigente(x.fecha)).map((x) => ({ ...x, ...extra }));
    const pasadas = todasVacias.length - vacias.length;
    const conIdeaFaltan = (m.days ?? []).filter((d) => vigente(d.date)).flatMap((d) => (d.posts ?? [])
      .filter((p) => String(p.idea ?? "").trim() && p.status !== "published")
      .map((p) => {
        const lista = textosQueFaltan(p).filter((k) => !pedidos || pedidos.includes(k));
        return lista.length ? casillaDeCampos(p, d, { campos: lista, semana: conceptoDelDia(m, d), ...extra }) : null;
      })
      .filter(Boolean));
    const sinIdeaConCampos = pedidos ? casillasSinIdea(m).filter((x) => vigente(x.fecha)).length : 0;
    if (vacias.length) return { ...base, modo: "plan", candidatas: vacias, reemplazar: {}, usados: usadosDelPlan(m), otras: conIdeaFaltan.length };
    if (conIdeaFaltan.length) return { ...base, modo: "campos", candidatas: conIdeaFaltan, reemplazar: {}, usados: usadosDelMes(m), otras: 0, sinIdeaConCampos };
    return {
      ...base,
      nada: sinIdeaConCampos
        ? `No falta ninguno de esos campos en las publicaciones con idea. ${sinIdeaConCampos} ${sinIdeaConCampos === 1 ? "publicación no tiene" : "no tienen"} idea todavía: llama sin campos para escribirlas enteras.`
        : `No le falta ningún texto a ${nombreMes(year, month)} de ${c.name}${pasadas ? ` de hoy en adelante (${pasadas} de días que ya pasaron se quedan sin escribir; una concreta, con publicacion_id)` : ""}. Siguiente: revisar_mes.`,
    };
  }

  /** Lo que se le manda al motor para una tanda de `n` (el MISMO cuerpo que la pantalla). */
  const datosDelMotor = (sel, n) => {
    const semilla = sel.una ? Date.now() % 997 : semillaDe(sel.fila?.id ?? sel.cliente.id);
    const estrategia = estrategiaDe(sel.mes);
    return sel.modo === "plan"
      // El mes entero: con el planificador del mes (lo decidido se guarda y las llamadas siguientes lo reusan).
      ? { modo: "plan", casillas: sel.candidatas, ...(estrategia ? { estrategia } : {}), usados: sel.usados, semilla, desde: 0, tamano: n, ...(sel.una ? {} : { planificar: true }) }
      : { modo: "campos", publicaciones: sel.candidatas.slice(0, n), ...(estrategia ? { estrategia } : {}), usados: sel.usados, semilla };
  };

  /** El nombre de un ángulo (del estudio APROBADO) por su id, leído una vez. */
  async function nombresDeAngulos(c, pares) {
    if (!pares.some(([, a]) => a)) return () => "";
    const { estudio } = await leerMercado(acceso, c.id).catch(() => ({ estudio: null }));
    return (productoId, id) => anguloDe(estudio, productoId, id)?.nombre ?? "";
  }

  /** Lo escrito en una publicación, para que Claude lo enseñe. */
  function bloqueEscrito({ fecha, post, cambios, antes = {}, nombreAngulo = () => "" }) {
    const l = [`· ${fechaLegible(fecha)} · ${formatoLegible(post)} · «${tituloDe(post)}» (ID ${post.id})${vaAPauta(post) ? ` · va a pauta (${describirPauta(post.pauta)})` : ""}`];
    const forma = nombreDeForma(cambios.formaGancho ?? post.formaGancho);
    const angulo = cambios.angulo || post.angulo ? nombreAngulo(post.productoId, cambios.angulo ?? post.angulo) || (cambios.angulo ?? post.angulo) : "";
    if (forma || angulo || post.producto) l.push(`  ${[forma && `Forma del gancho: ${forma}`, angulo && `Ángulo: ${angulo}`, post.producto && `Producto: ${post.producto}`].filter(Boolean).join(" · ")}`);
    const ver = [["title", "Título"], ["idea", "Idea"], ["escena", "Qué se ve"], ["textoPieza", "Texto de la pieza"], ["guion", "Guion"], ["descripcion", "Caption"], ["hashtagsFinales", "Hashtags"]];
    for (const [k, nombre] of ver) if (cambios[k]) l.push(`  ${nombre}: ${String(cambios[k]).slice(0, 2500)}`);
    if (cambios.ganchosUgc?.length) l.push(`  Ganchos alternativos: ${cambios.ganchosUgc.map((g) => `«${g}»`).join(" · ")}`);
    if (cambios.anuncio) {
      const a = cambios.anuncio;
      l.push(`  Textos del anuncio: ${a.textos.map((t, i) => `${i + 1}) ${t}`).join("\n    ")}`);
      if (a.titulos?.length) l.push(`  Títulos del anuncio: ${a.titulos.join(" · ")}${a.descripcion ? ` · Descripción: ${a.descripcion}` : ""} · Botón: ${BOTONES_PAUTA.find((b) => b.id === a.boton)?.nombre ?? a.boton}`);
    }
    if (cambios.promptImagen) l.push("  Lleva el borrador de su ficha de diseño (el director la termina al diseñar).");
    for (const [k, v] of Object.entries(antes)) l.push(`  (Lo que había en «${NOMBRE_CAMPO[k] ?? k}»: «${corto(typeof v === "string" ? v : JSON.stringify(v), 1500)}»)`);
    return l.join("\n");
  }

  /** Cuántas publicaciones del mes quedan por escribir (las vacías y las que tienen idea y les falta algo). */
  function quedanEn(m, pedidos = null) {
    const vacias = pedidos ? 0 : casillasSinIdea(m).length;
    const faltan = (m.days ?? []).flatMap((d) => d.posts ?? [])
      .filter((p) => String(p.idea ?? "").trim() && p.status !== "published" && textosQueFaltan(p).some((k) => !pedidos || pedidos.includes(k))).length;
    return vacias + faltan;
  }

  return {
    async escribir_textos(entrada) {
      const sel = await seleccionar(entrada);
      if (sel.nada) return sel.nada;
      const r = await delMotor(produccionDeLote(env, acceso, sel.cliente, datosDelMotor(sel, TANDA_TEXTOS)));
      const porClave = new Map((sel.modo === "plan" ? r.ideas ?? [] : r.textos ?? []).map((x) => [String(x.clave), x]));
      if (!porClave.size) throw new ErrorTextos("La IA no devolvió textos que se puedan leer. Vuelve a intentarlo.");

      const escritas = [];
      const res = await cambiarCalendario(env, acceso, {
        clienteId: sel.cliente.id, calendarId: sel.fila.id, por,
        cambiar: (m) => {
          escritas.length = 0;
          let cambio = false;
          m.days = (m.days ?? []).map((d) => ({
            ...d,
            posts: (d.posts ?? []).map((p) => {
              const x = porClave.get(String(p.id));
              if (!x || p.status === "published") return p;
              let nuevo;
              let cambios;
              if (sel.modo === "plan") {
                // Sólo si sigue sin idea (otra persona pudo escribirla mientras la IA pensaba).
                if (String(p.idea ?? "").trim()) return p;
                nuevo = conIdea(p, x);
                cambios = Object.fromEntries(Object.entries(nuevo).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(p[k])));
              } else {
                cambios = aplicarCampos(p, x, { reemplazar: sel.reemplazar[p.id] ?? [] }).cambios;
                nuevo = { ...p, ...cambios };
              }
              if (!Object.keys(cambios).length) return p;
              // Lo que había en los campos que se REESCRIBIERON (los pedidos), por si hay que volver atrás.
              const antes = Object.fromEntries((sel.reemplazar[p.id] ?? []).map((k) => [k, CLAVE_EN_POST[k]])
                .filter(([, clave]) => cambios[clave] !== undefined && p[clave] && (typeof p[clave] !== "string" || p[clave].trim()))
                .map(([k, clave]) => [k, p[clave]]));
              escritas.push({ fecha: d.date, post: nuevo, cambios, antes, anguloNombre: x.anguloNombre });
              cambio = true;
              return nuevo;
            }),
          }));
          return cambio ? m : null;
        },
      });
      if (res.aviso) throw new ErrorTextos(`${res.aviso} No se guardó nada (la IA ya cobró esta tanda).`);
      if (!escritas.length) return "La IA escribió, pero esas publicaciones ya tenían esos textos (alguien los escribió a la vez) o ya salieron: no cambié nada.";

      const nombreAngulo = await nombresDeAngulos(sel.cliente, escritas.map((e) => [e.post.productoId, e.cambios.angulo]));
      const quedan = sel.una ? 0 : quedanEn(res.mes ?? sel.mes, camposPedidos(entrada.campos));
      const falta = avisoDeLoQueFalta(r.faltan ?? []);
      return [
        `Escribí ${escritas.length === 1 ? "1 publicación" : `${escritas.length} publicaciones`} de ${sel.cliente.name} por el motor de la agencia y lo guardé en el calendario (${sel.modo === "plan" ? "la idea entera: estaban vacías" : "sólo lo que faltaba"}${Object.keys(sel.reemplazar).length ? "; los campos pedidos se reescribieron" : ""}):`,
        ...escritas.map((e) => bloqueEscrito({ ...e, nombreAngulo: (pid, id) => e.anguloNombre || nombreAngulo(pid, id) })),
        falta ? `\nFALTA MATERIAL: ${falta}` : "",
        r.aviso ? `Aviso de la IA: ${r.aviso}` : "",
        quedan ? `\nQuedan ${quedan}: vuelve a llamar a escribir_textos con el mismo cliente y mes.` : sel.una ? "\nEnséñale a la persona lo escrito. Para cambiar un campo: escribir_textos con campos y pide, o editar_publicacion." : "\nNo queda nada por escribir en el mes. Siguiente: revisar_mes.",
      ].filter(Boolean).join("\n");
    },

    async ficha_de_textos(entrada) {
      const sel = await seleccionar(entrada);
      if (sel.nada) return sel.nada;
      // La tanda: 6 (como escribir_textos); si el pedido pasa de MAX_FICHA, menos (una sola vuelta más).
      let n = Math.min(TANDA_TEXTOS, sel.candidatas.length);
      let pedido = await delMotor(pedidoDelLote(env, acceso, sel.cliente, datosDelMotor(sel, n)));
      if (!pedido.vacio && pedido.prompt.length > MAX_FICHA && n > 1) {
        n = Math.max(1, Math.floor((n * MAX_FICHA) / pedido.prompt.length));
        pedido = await delMotor(pedidoDelLote(env, acceso, sel.cliente, datosDelMotor(sel, n)));
      }
      if (pedido.vacio || !pedido.plan?.length) return "No hay nada que escribir en esas publicaciones.";
      const posts = new Map((sel.mes.days ?? []).flatMap((d) => (d.posts ?? []).map((p) => [p.id, { p, fecha: d.date }])));
      const nombreAngulo = await nombresDeAngulos(sel.cliente, pedido.plan.map((r) => [r.productoId, r.angulo]));
      const piezas = pedido.plan.map((r) => {
        const { p, fecha } = posts.get(String(r.clave)) ?? { p: {}, fecha: r.fecha };
        const forma = r.formaGancho ? `forma del gancho «${nombreDeForma(r.formaGancho)}» (forma_gancho: ${r.formaGancho})` : "";
        const angulo = r.angulo ? `ángulo «${r.anguloNombre || nombreAngulo(r.productoId, r.angulo) || r.angulo}» (angulo: ${r.angulo})` : "";
        const guarda = sel.modo === "plan"
          ? (["carrusel", "reel"].includes(p.format) ? "titulo, idea (el brief), escena, guion, descripcion, hashtags" : p.format === "historia" ? "titulo, idea (el brief), escena, texto_pieza (titular y apoyo, una línea cada uno)" : "titulo, idea (el brief), escena, texto_pieza (titular y apoyo, una línea cada uno), descripcion, hashtags")
          : r.campos.map((k) => ({ textoPieza: "texto_pieza", anuncio: "anuncio" }[k] ?? k)).join(", ");
        // Con opciones (el código da 2–3 válidas), Claude escoge una y guarda la que usó.
        const otras = [
          ...(r.opciones?.formas ?? []).filter((x) => x !== r.formaGancho).map((x) => `«${nombreDeForma(x)}» (forma_gancho: ${x})`),
          ...(r.opciones?.angulos ?? []).filter((a) => a.id !== r.angulo).map((a) => `«${a.nombre}» (angulo: ${a.id})`),
        ];
        return `· Pieza n.º ${r.n} = publicación ${r.clave} (${fecha ? fechaLegible(fecha) : "sin fecha"} · ${formatoLegible(p.format ? p : { format: r.formato })}): guarda ${guarda}${r.pauta ? ", y anuncio (va a pauta)" : ""}.${forma || angulo ? ` ${otras.length ? "Lo sugiere" : "Lo escogió"} el código (${otras.length ? "o una de las otras que también valen" : "respétalo"} y guarda el que uses con editar_publicacion): ${[forma, angulo].filter(Boolean).join(" y ")}.` : ""}${otras.length ? ` También valen: ${otras.join(", ")}.` : ""}`;
      });
      const quedan = Math.max(0, sel.candidatas.length - pedido.plan.length) + (sel.otras ?? 0);
      return [
        `MÉTODO DEL CALENDARIO para ${pedido.plan.length === 1 ? "1 publicación" : `${pedido.plan.length} publicaciones`} de ${sel.cliente.name} (${sel.modo === "plan" ? "vacías: la idea entera" : "lo que les falta"}). Es EXACTAMENTE lo que el motor le mandaría a su IA; no se llamó a ninguna IA ni se guardó nada.`,
        "",
        "=== EL PEDIDO ===",
        pedido.prompt,
        "=== FIN DEL PEDIDO ===",
        "",
        "QUÉ ES CADA PIEZA Y DÓNDE SE GUARDA:",
        ...piezas,
        "",
        "INSTRUCCIONES: Escribe tú los textos siguiendo esto al pie de la letra. El formato JSON del final del pedido es sólo para la IA del calendario: tú guarda cada campo con editar_publicacion (descripcion, guion, texto_pieza, hashtags, titulo, idea, escena; y anuncio —textos, títulos, descripción, botón— en lo que va a pauta). Conserva la forma de gancho y el ángulo que dice cada pieza y guárdalos con forma_gancho y angulo. Los precios, sólo los del catálogo, exactos. La «imagen» (ficha de diseño) no hace falta: el director la escribe al diseñar. El calendario revisará lo que guardes y te devolverá sus avisos: corrígelos antes de seguir.",
        pedido.faltan?.length ? `FALTA MATERIAL: ${avisoDeLoQueFalta(pedido.faltan)}` : "",
        quedan ? `Quedan ${quedan} después de éstas: cuando las guardes, vuelve a llamar a ficha_de_textos con lo mismo.` : "",
      ].filter((x, i, t) => x !== "" || t[i - 1] !== "").join("\n");
    },

    async preparar_mes({ cliente, mes, llenar_ocupados: llenar = false, temporada = true }) {
      const c = await resolverCliente(cliente);
      const { year, month, texto } = mesDe(mes);
      const hoy = fechaEnZona();
      const app = clienteDeFila(c);
      const lista = await plantillasDelEspacio(acceso);
      const llenarOcupados = llenar === true;
      const [mercado, negocio] = await Promise.all([leerMercado(acceso, c.id).catch(() => null), leerNegocio(acceso, c.id).catch(() => null)]);

      /** El plan sobre el mes como esté AHORA: lo mismo que el paso «Plan» de la pantalla. */
      const delMes = (m) => {
        const base = planDelAsistente({ cliente: app, cal: m, lista, aceptadas: [], llenarOcupados, hoy });
        const aceptadas = temporada === false ? [] : base.sugerencias;
        const plan = aceptadas.length ? planDelAsistente({ cliente: app, cal: m, lista, aceptadas, llenarOcupados, hoy }) : base;
        // Con «llenar los ocupados», lo que el plan ya puso no se pone dos veces (una segunda llamada lo duplicaría).
        const yaDelPlan = new Set((m.days ?? []).filter((d) => (d.posts ?? []).some((p) => p.delPlan)).map((d) => d.date));
        const casillas = llenarOcupados ? plan.casillas.filter((x) => !yaDelPlan.has(x.fecha)) : plan.casillas;
        const matriz = matrizDelPlan(casillas, { mercado, notas: plan.notas, foco: limpiarEstrategia(m.opciones?.estrategia)?.focoId ?? "" });
        const sugeridas = pautaDelPlan(casillas, matriz, { ofertas: m.offers, codigo: m.promoCode, cuenta: negocio?.cuenta ?? "" });
        return { plan, aceptadas, casillas, sugeridas, publicaciones: publicacionesDelPlan(casillas, { matriz, sugeridas, nuevoId: idPublicacion }) };
      };

      const antes = await mesDelCliente(c, year, month);
      const previo = delMes(antes.mes);
      if (previo.plan.pasado) throw new ErrorTextos(`${nombreMes(year, month)} ya pasó: el plan no pone nada en un mes pasado.`);
      if (!previo.casillas.length) {
        return previo.plan.ocupados.size
          ? `Los días del plan semanal de ${c.name} en ${nombreMes(year, month)} ya tienen sus publicaciones: no puse nada. Con llenar_ocupados: true se añaden también ahí. Siguiente: escribir_textos con cliente y mes.`
          : `El plan semanal de ${c.name} no tiene publicaciones para ${nombreMes(year, month)}: edítalo en Marca → Plan semanal y vuelve a llamar.`;
      }
      let fila = antes.fila;
      if (!fila) fila = (await delMotor(obtenerOCrearMes(acceso, c.id, year, month))).fila;
      let hecho = null;
      const res = await cambiarCalendario(env, acceso, {
        clienteId: c.id, calendarId: fila.id, por,
        cambiar: (m) => {
          hecho = delMes(m);
          if (!hecho.publicaciones.length) return null;
          const guardado = limpiarAsistente(m.opciones?.asistente).paso;
          return conAsistente(conCasillas(m, hecho.publicaciones), {
            paso: Math.max(guardado ?? 0, PASO_MES.ideas),
            aceptadas: hecho.aceptadas.map((s) => ({ id: s.id, fecha: s.fecha, de: s.de, a: s.a, motivo: s.motivo })), llenarOcupados,
          }, { por: usuario?.nombre ?? "Claude" });
        },
      });
      if (res.aviso) throw new ErrorTextos(res.aviso);
      if (res.sinCambios || !hecho?.publicaciones.length) return "No había nada que poner: los días del plan ya tienen sus publicaciones.";

      const porDia = new Map();
      for (const { fecha, post } of hecho.publicaciones) porDia.set(fecha, [...(porDia.get(fecha) ?? []), post]);
      const lineas = [...porDia.entries()].sort().map(([fecha, ps]) => `· ${fechaLegible(fecha)}: ${ps.map((p) => [formatoLegible(p), nombreDePilar(p.pilar, p.pilarSub), p.producto, p.publishTime, p.pauta ? `a pauta (${nombreEtapaCiclo(p.pauta.etapa)})` : ""].filter(Boolean).join(" · ")).join(" | ")}`);
      const aPauta = hecho.publicaciones.filter((x) => x.post.pauta).length;
      const nueva = avisoCuentaNueva(hecho.sugeridas);
      return [
        `Puse ${hecho.publicaciones.length} publicaciones del plan semanal en ${nombreMes(year, month)} (${texto}) de ${c.name}, sin ideas todavía (su formato, su tipo, su hora y su producto):`,
        ...lineas,
        hecho.aceptadas.length ? `\nAjustes de temporada aplicados: ${hecho.aceptadas.map((s) => `${fechaLegible(s.fecha)} ${nombreDePilar(s.de)} → ${nombreDePilar(s.a)} (${s.motivo})`).join("; ")}.` : "",
        hecho.plan.fechas.length ? `Fechas especiales del mes: ${hecho.plan.fechas.map((f) => `${fechaLegible(f.fecha)} ${f.nombre}${f.delicada ? " (delicada: sin promociones)" : ""}`).join("; ")}.` : "",
        aPauta ? `${aPauta} ${aPauta === 1 ? "va" : "van"} a pauta solas (se escribirán como anuncio). Para quitar una: editar_publicacion con pauta: false.` : "",
        nueva,
        "\nAhora llama a escribir_textos con el cliente y el mes (el motor escribe cada una por tandas), o a ficha_de_textos si la persona quiere que las escribas tú con el método.",
      ].filter(Boolean).join("\n");
    },

    async estrategia_del_mes({ cliente, mes, proponer, guardar, confirmado }) {
      const c = await resolverCliente(cliente);
      const { year, month, texto } = mesDe(mes);
      const { fila, mes: m } = await mesDelCliente(c, year, month);
      const semanas = semanasDelPlan(year, month);
      const titulo = `${c.name} · ${nombreMes(year, month)} (${texto})`;
      const mercado = await leerMercado(acceso, c.id).catch(() => null);
      const productos = productosParaPlan(mercado?.catalogo ?? [], mercado?.inventario);
      const e0 = limpiarEstrategia(m.opciones?.estrategia);

      const describir = ({ objetivo, foco, campana, ofertas, codigo, conceptos, etapas, razon }) => [
        `Objetivo: ${objetivoDe(objetivo) ? `${objetivoDe(objetivo).nombre} — ${objetivoDe(objetivo).ayuda}` : "sin escoger"}`,
        `Producto foco: ${foco || "la marca entera"}`,
        `Campaña: ${campana || "sin campaña"}`,
        `Ofertas: ${ofertas || "ninguna"}${codigo ? ` · Código: ${codigo}` : ""}`,
        "Semanas (las filas del calendario):",
        ...semanas.map((s, i) => `  ${s.n}. ${fechaLegible(s.desde)} a ${fechaLegible(s.hasta)}: ${conceptos[i] ? `«${conceptos[i]}»` : "(sin concepto)"}${etapas[i] ? ` · etapa: ${ETAPAS[idEtapaCiclo(etapas[i])]?.nombre ?? etapas[i]}` : ""}`),
        razon ? `Por qué: ${razon}` : "",
      ].filter(Boolean).join("\n");
      const actual = {
        objetivo: e0?.objetivo ?? "", foco: e0?.foco ?? "", focoId: e0?.focoId ?? "", campana: m.campaign ?? "", ofertas: m.offers ?? "", codigo: m.promoCode ?? "",
        conceptos: unoPorSemana(m.weekConcepts, semanas.length), etapas: unoPorSemana(e0?.etapas, semanas.length), razon: e0?.razon ?? "",
      };
      const buscarProducto = (x) => {
        const t = String(x ?? "").trim().toLowerCase();
        if (!t || t === "marca" || t === "la marca") return null;
        const p = productos.find((q) => q.id === x) ?? productos.find((q) => q.nombre.toLowerCase() === t) ?? productos.find((q) => q.nombre.toLowerCase().includes(t));
        if (!p) throw new ErrorTextos(`No encontré «${x}» en el catálogo activo. Los productos: ${productos.map((q) => q.nombre).join(", ") || "(catálogo vacío)"}.`);
        return p;
      };

      if (guardar && typeof guardar === "object") {
        const g = guardar;
        if (g.objetivo !== undefined && g.objetivo !== "" && !objetivoDe(g.objetivo)) throw new ErrorTextos(`Objetivo no válido. Los que hay: ${OBJETIVOS_MES.map((o) => o.id).join(", ")}.`);
        const foco = g.foco === undefined ? (actual.focoId ? { id: actual.focoId, nombre: actual.foco } : null) : buscarProducto(g.foco);
        const semanasG = Array.isArray(g.semanas) ? g.semanas : [];
        const etapaMala = semanasG.find((s) => s?.etapa && !ETAPAS[idEtapaCiclo(s.etapa)]);
        if (etapaMala) throw new ErrorTextos(`Etapa no válida: «${etapaMala.etapa}». Las del ciclo de ventas: ${Object.keys(ETAPAS).join(", ")}.`);
        const nueva = {
          objetivo: g.objetivo === undefined ? actual.objetivo : objetivoDe(g.objetivo)?.id ?? "",
          foco: foco?.nombre ?? "", focoId: foco?.id ?? "",
          campana: g.campana === undefined ? actual.campana : corto(g.campana, 300),
          ofertas: g.ofertas === undefined ? actual.ofertas : corto(g.ofertas, 400),
          codigo: g.codigo === undefined ? actual.codigo : corto(g.codigo, 60),
          razon: g.razon === undefined ? actual.razon : corto(g.razon, 500),
          conceptos: actual.conceptos.map((x, i) => (semanasG[i]?.concepto !== undefined ? corto(semanasG[i].concepto, 200) : x)),
          etapas: actual.etapas.map((x, i) => (semanasG[i]?.etapa ? idEtapaCiclo(semanasG[i].etapa) : x)),
        };
        if (confirmado !== true) {
          return [
            "NO SE GUARDÓ NADA. Esto es lo que se guardaría como estrategia de " + titulo + ":",
            describir(nueva),
            "",
            "Enséñaselo a la persona y, con su sí, vuelve a llamar a estrategia_del_mes con el mismo guardar y confirmado: true.",
          ].join("\n");
        }
        const filaMes = fila ?? (await delMotor(obtenerOCrearMes(acceso, c.id, year, month))).fila;
        const res = await cambiarCalendario(env, acceso, {
          clienteId: c.id, calendarId: filaMes.id, por,
          cambiar: (mm) => {
            const guardado = limpiarAsistente(mm.opciones?.asistente).paso;
            // Lo mismo que guarda el paso «Estrategia» del asistente del mes (sin volver atrás su paso).
            return conAsistente({
              ...mm, campaign: nueva.campana, offers: nueva.ofertas, promoCode: nueva.codigo, weekConcepts: nueva.conceptos,
              opciones: { ...(mm.opciones ?? {}), estrategia: limpiarEstrategia({ objetivo: nueva.objetivo, focoId: nueva.focoId, foco: nueva.foco, razon: nueva.razon, etapas: nueva.etapas }) },
            }, { paso: Math.max(guardado ?? 0, PASO_MES.plan) }, { por: usuario?.nombre ?? "Claude" });
          },
        });
        if (res.aviso) throw new ErrorTextos(res.aviso);
        return [`Guardada la estrategia de ${titulo}:`, describir(nueva), "", "El motor de textos la lee en todo lo que escribe de este mes. Siguiente: preparar_mes (si el mes aún no tiene sus publicaciones) o escribir_textos."].join("\n");
      }

      if (proponer) {
        const o = typeof proponer === "object" ? proponer : {};
        if (o.objetivo && !objetivoDe(o.objetivo)) throw new ErrorTextos(`Objetivo no válido. Los que hay: ${OBJETIVOS_MES.map((x) => x.id).join(", ")}.`);
        const foco = o.foco !== undefined ? buscarProducto(o.foco) : actual.focoId ? { id: actual.focoId } : null;
        const r = await delMotor(estrategiaDelMes(env, acceso, c, {
          year, month, objetivo: o.objetivo || actual.objetivo, focoId: foco?.id ?? "", ofertas: o.ofertas ?? actual.ofertas, semanas,
        }));
        const e = r.estrategia;
        const propuesta = {
          objetivo: e.objetivo, foco: e.foco, campana: e.campana, ofertas: o.ofertas ?? actual.ofertas, codigo: actual.codigo,
          conceptos: semanas.map((_, i) => e.semanas?.[i]?.concepto || ""), etapas: semanas.map((_, i) => e.semanas?.[i]?.etapa || embudoDelMes(e.objetivo, semanas.length)[i]), razon: e.razon,
        };
        const sugerido = { objetivo: e.objetivo, foco: e.focoId || "", campana: e.campana, razon: e.razon, semanas: propuesta.conceptos.map((concepto, i) => ({ concepto, etapa: propuesta.etapas[i] })) };
        return [
          `PROPUESTA DE LA IA para ${titulo} (no se guardó nada):`,
          describir(propuesta),
          e.ofertas ? `Oferta que sugiere (sólo si encaja con lo que hay): ${e.ofertas}` : "",
          r.mejores?.length ? `Lo que mejor funcionó el mes anterior: ${r.mejores.map((x) => `«${corto(x.texto, 80)}» (${x.interacciones} interacciones)`).join("; ")}` : "",
          r.aviso ? `Aviso: ${r.aviso}` : "",
          "",
          `Enséñasela a la persona. Para guardarla (con lo que corrija), estrategia_del_mes con guardar: ${JSON.stringify(sugerido)} — primero sin confirmado (te enseña lo que se guardaría) y, con su sí, con confirmado: true.`,
        ].filter(Boolean).join("\n");
      }

      if (!e0 && !actual.campana && !actual.conceptos.some(Boolean) && !actual.ofertas) {
        return `${titulo}: todavía no tiene estrategia. Para que la IA proponga una, estrategia_del_mes con proponer: true (las ofertas reales del mes van en proponer.ofertas).`;
      }
      return [`ESTRATEGIA de ${titulo}:`, describir(actual), "", "Para cambiarla: estrategia_del_mes con guardar (y confirmado: true con el sí de la persona). Para otra propuesta: proponer: true."].join("\n");
    },

    async revisar_mes({ cliente, mes }) {
      const c = await resolverCliente(cliente);
      const { year, month, texto } = mesDe(mes);
      const { fila, mes: m } = await mesDelCliente(c, year, month);
      const days = m.days ?? [];
      if (!fila || !days.some((d) => (d.posts ?? []).length)) return `${c.name} no tiene publicaciones en ${nombreMes(year, month)} (${texto}).`;
      const ctx = await contextoDeRevision(acceso, c, { year, month, conPauta: days.some((d) => (d.posts ?? []).some(vaAPauta)) });
      const revision = revisionDelMes(days, ctx);
      const e = limpiarEstrategia(m.opciones?.estrategia);
      const balance = balanceDelMes(days, { semanas: semanasDelPlan(year, month), objetivo: e?.objetivo ?? "", foco: e?.foco ?? "" });
      const porPost = new Map();
      const de = (date, post) => {
        if (!porPost.has(post.id)) porPost.set(post.id, { date, post, lineas: [] });
        return porPost.get(post.id).lineas;
      };
      for (const x of revision.lista) {
        if (x.falta.length) de(x.date, x.post).push(`· Sin contenido todavía: le falta ${x.falta.join(", ")} para que el cliente entienda qué va.\n  Cómo: ${x.falta.includes("una referencia") ? "la referencia (un enlace que el cliente pueda abrir) se pone en la pestaña Idea del panel; " : ""}lo demás, escribir_textos con publicacion_id.`);
        for (const p of x.problemas) de(x.date, x.post).push(`· ${p.texto}\n  Cómo: ${comoArreglar(p, x.post, ctx)}`);
      }
      for (const x of revision.pauta) for (const p of x.problemas) de(x.date, x.post).push(`· [Pauta · ${describirPauta(x.post.pauta)}] ${p.texto}\n  Cómo: ${comoArreglar(p, x.post, ctx)}`);
      const filas = [...porPost.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
      const resumen = [resumenRevision(revision.lista), resumenPauta(revision.pauta)].filter(Boolean).join(" · ");
      return [
        `REVISIÓN de ${c.name} · ${nombreMes(year, month)} (${texto}), con las reglas de la agencia (sin IA): ${resumen || "las reglas no encontraron nada."}`,
        balance.total ? `\nBALANCE (${balance.total} publicaciones): ${Object.entries(balance.formatos).map(([f, n]) => `${FORMATS[f]?.label ?? f} ${n}`).join(" · ")}${Object.keys(balance.tipos).length ? ` | Tipos: ${Object.entries(balance.tipos).map(([t, n]) => `${t} ${n}`).join(" · ")}` : ""}${Object.keys(balance.productos).length ? ` | Productos: ${Object.entries(balance.productos).map(([t, n]) => `${t} ${n}`).join(" · ")}` : ""}` : "",
        ...balance.avisos.map((a) => `${a.tipo === "aviso" ? "AVISO:" : "Nota:"} ${a.texto}`),
        "",
        ...filas.map((f) => `${fechaLegible(f.date)} · ${formatoLegible(f.post)} · «${tituloDe(f.post)}» (ID ${f.post.id})\n${f.lineas.join("\n")}`),
        filas.length ? "\nArréglalo con la herramienta que dice cada aviso y vuelve a llamar a revisar_mes. Lo que no ven las reglas (ortografía, tono) lo revisas tú leyendo los textos." : "\nTodo listo para enviar según las reglas.",
      ].filter((x, i, t) => x !== "" || t[i - 1] !== "").join("\n");
    },
  };
}

