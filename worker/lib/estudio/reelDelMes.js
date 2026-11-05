// ============================================================
// Los REELS de un mes, desde el asistente del mes (fase 6)
//
// «Producir el mes» no hacía reels: un reel hecho con IA salía como un clip
// suelto o no salía. Aquí, cada reel APROBADO de una publicación (no un UGC:
// ése se graba) se lanza como el ENCARGO del reel por planos de siempre
// (encargoReel.js: storyboard → video → montaje), con su publicación, así que
// lo que sale se pone SOLO en ella (ponerEnPost.js).
//
//   · Sin `confirmado`: el COSTO aproximado de cada uno (fotogramas + video,
//     con un guion de la duración por defecto) y NO SE CREA NADA ni se escribe
//     el guion: no se paga nada por mirar.
//   · Con `confirmado: true` (UNA publicación por llamada: escribir el guion
//     tarda): el guion SIGUE el que ya tiene la publicación (`guionDeReel` con
//     su postId), el plan y el encargo. La voz del montaje se confirma APARTE,
//     como siempre (la pantalla la ofrece al llegar a «confirmar»).
//
// El plan del reel (`planDeReel`) vive en herramientasReel.js (el MCP) y se
// importa en el momento: estático cerraría el ciclo encargos → mercado →
// herramientasServidor → herramientas (ver vistaEstudio.js).
// ============================================================

import { crearEncargo } from "./encargos.js";
import { crearCarpeta } from "./galeria.js";
import { guionDeReel } from "./reel.js";
import { kitDe } from "./kit.js";
import { estadoMotores } from "./motores.js";
import { ErrorEstudio } from "./trabajos.js";
import { leerMercado } from "../mercado.js";
import { duracionesDeReel, DURACION_REEL_POR_DEFECTO } from "../../../src/lib/duracionesVideo.js";
import { nombreDelModelo, textoCosto } from "../../../src/lib/estudioCatalogo.js";
import { estiloDeMarca, limpiarKit } from "../../../src/lib/kitMarca.js";
import { fotosDelCatalogo } from "../../../src/lib/estudioMercado.js";
import { ganchoDe } from "../../../src/lib/montajeReel.js";

const ID = /^[\w-]{1,80}$/;
export const MAX_REELS_MES = 12;

const activosDe = (env) => Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, Boolean(v.activo)]));
const leer = (v, porDefecto) => {
  if (v == null) return porDefecto;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return porDefecto; }
};

/** Cuántos planos lleva, más o menos, un guion de esa duración (para el costo antes de escribirlo). Pura. */
export const planosParaSegundos = (s) => (s <= 10 ? 4 : s <= 20 ? 6 : 8);

/** Un guion de muestra con la forma justa para estimar el costo (sin texto: no se escribe nada). Pura. */
function guionDeMuestra(segundos) {
  const n = planosParaSegundos(segundos);
  const paso = segundos / n;
  return { segundos, planos: Array.from({ length: n }, (_, i) => ({ desde: +(i * paso).toFixed(2), hasta: +((i + 1) * paso).toFixed(2), visual: "" })) };
}

/** La publicación de ese mes: { post, date } o null. */
function buscar(days, postId) {
  for (const d of days ?? []) {
    const post = (d.posts ?? []).find((p) => p.id === postId);
    if (post) return { post, date: d.date };
  }
  return null;
}

/**
 * `cuerpo`: { calendarId, postIds: [ids] (sin confirmar) | postId (confirmado), confirmado?, montar?, confirmadoVoz?, guion? }.
 * → sin confirmar: { reels: [{ postId, costo, costoTexto, segundos, planos, modelo } | { postId, error }], total, totalTexto }
 * → confirmado: { encargoId, postId, costoTexto }. Lanza ErrorEstudio con lo que falta.
 */
export async function reelsDelMes(env, acceso, cliente, cuerpo = {}, { usuario = null } = {}) {
  const calendarId = String(cuerpo.calendarId ?? "");
  if (!ID.test(calendarId)) throw new ErrorEstudio("Falta el mes.", 400);
  const cal = await acceso.leerUno("calendars", { id: calendarId, client_id: cliente.id });
  if (!cal) throw new ErrorEstudio("Ese mes no existe.", 404);
  const days = leer(cal.days, []);
  const activos = activosDe(env);
  if (!duracionesDeReel(activos).length) throw new ErrorEstudio("No hay ningún modelo de video con llave (Ajustes → IA).", 409);
  const kit = kitDe(cliente);
  const segundos = DURACION_REEL_POR_DEFECTO;
  const { planDeReel } = await import("./herramientasReel.js");
  const valido = (e) => (!e ? "Esa publicación ya no está en el mes."
    : e.post.format !== "reel" ? "No es un reel."
      : e.post.rostro ? "Es un UGC: se graba (Guiones para grabar)."
        : e.post.status === "published" ? "Ya se publicó." : "");

  if (cuerpo.confirmado !== true) {
    const ids = (Array.isArray(cuerpo.postIds) ? cuerpo.postIds : []).map(String).filter((x) => ID.test(x)).slice(0, MAX_REELS_MES);
    if (!ids.length) throw new ErrorEstudio("Escoge al menos un reel.", 400);
    const reels = ids.map((postId) => {
      const error = valido(buscar(days, postId));
      if (error) return { postId, error };
      const plan = planDeReel({ guion: guionDeMuestra(segundos), activos, kit });
      if (!plan.imagen || !plan.video) return { postId, error: "No hay modelos con llave para los fotogramas o el video (Ajustes → IA)." };
      return { postId, costo: plan.total, costoTexto: textoCosto(plan.total), segundos: plan.segundos, planos: plan.planos, salida: plan.salida, modelo: nombreDelModelo(plan.video.id) };
    });
    const total = reels.reduce((t, r) => t + (r.costo ?? 0), 0);
    return { reels, total, totalTexto: textoCosto(total) };
  }

  const postId = String(cuerpo.postId ?? "");
  const e = buscar(days, postId);
  const error = valido(e);
  if (error) throw new ErrorEstudio(error, 400);
  const { post } = e;
  const montar = cuerpo.montar !== false;
  // Un guion ya escrito (como el de crear_reel por MCP) se usa tal cual; si no, se escribe siguiendo el de la publicación.
  const guion = cuerpo.guion && typeof cuerpo.guion === "object" && Array.isArray(cuerpo.guion.planos) ? cuerpo.guion : await guionDeReel(env, acceso, cliente, {
    idea: String(post.idea || post.title || "").slice(0, 1500), segundos, productoId: post.productoId || "", postId, montaje: montar,
  });
  const plan = planDeReel({ guion, activos, kit });
  if (!plan.imagen || !plan.video) throw new ErrorEstudio("No hay modelos con llave para los fotogramas o el video (Ajustes → IA).", 409);
  const mercado = post.productoId ? await leerMercado(acceso, cliente.id).catch(() => null) : null;
  const fotos = (mercado ? fotosDelCatalogo(mercado.catalogo).find((p) => p.id === post.productoId)?.fotos ?? [] : []).slice(0, 2);
  const titulo = String(post.title || post.idea || guion.titulo || ganchoDe(guion) || "Reel").replace(/\s+/g, " ").trim().slice(0, 120);
  const carpeta = await crearCarpeta(acceso, cliente.id, titulo, { tipo: "reel" });
  const fila = await crearEncargo(env, acceso, cliente, {
    tipo: "reel", titulo, reel: { ...guion, segundos: plan.segundos }, carpetaId: carpeta.id,
    comun: { modelo: plan.imagen.id, estilo: estiloDeMarca(limpiarKit(kit), "", { marca: cliente.name, rubro: cliente.industry ?? "" }), fotos, personajes: [], referencias: [] },
    salida: plan.salida, revisar: false, video: { modelo: plan.video.id },
    montaje: montar ? { automatico: true, confirmadoVoz: cuerpo.confirmadoVoz === true } : null,
    calendarId, postId,
  }, { usuario });
  return { encargoId: fila.id, postId, costoTexto: textoCosto(plan.total) };
}
