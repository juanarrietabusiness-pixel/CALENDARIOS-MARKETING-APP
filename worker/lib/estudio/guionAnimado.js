// ============================================================
// «Escribir el guion con IA» del video animado (lo puro, en src/lib/guionAnimadoIA.js)
//
// Lee lo que la marca dice (cerebro para escribir, sin lo interno), el catálogo con los IDs de la galería de las fotos
// reales y el personaje del kit; le pide a la IA de texto el guion en el formato de escenas v1 y lo VALIDA con el
// mismo validador que el guardado. Si sale con errores, se los devuelve UNA vez para que los corrija. No guarda nada:
// la pantalla lo abre como borrador sin guardar, la persona lo revisa y lo guarda. Es texto (unos céntimos), sin
// confirmación, como «Dame ideas».
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { kitDe } from "./kit.js";
import { contextoDeGuion } from "./guionVideo.js";
import { leerMercado } from "../mercado.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { validarGuion } from "../../../src/lib/videoEscenas.js";
import { pedidoDeGuionAnimado, leerGuionAnimado, textoDePublicacion, duracionAnimado, MAX_IDEA_ANIMADO, pedidoDeGuionCancion } from "../../../src/lib/guionAnimadoIA.js";
import { conLaCancion, comprobarLetra } from "../../../src/lib/videoCancion.js";
import { estructuraDeVoz, usadaEn, ErrorEstructura } from "../estructurasGuion.js";

/** Un error de lo pedido, con su estado HTTP. */
export class ErrorGuion extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

/** El catálogo con los IDs de la galería de las fotos de cada producto (las que se pueden poner en una capa «imagen»). */
async function catalogoConFotos(acceso, clienteId) {
  try {
    const { catalogo, inventario } = await leerMercado(acceso, clienteId);
    const activos = productosActivos(catalogo);
    if (!activos.length) return "";
    const archivos = await acceso.leerColumnas("estudio_archivos", ["id", "clave", "mime", "borrado_at"], { client_id: clienteId });
    const idDe = new Map(archivos.filter((f) => !f.borrado_at && String(f.mime).startsWith("image/")).map((f) => [f.clave, f.id]));
    return activos.slice(0, 20).map((p) => {
      const ids = (p.fotos ?? []).map((k) => idDe.get(k)).filter(Boolean);
      return `${lineaDeProducto(p, { inventario })}${ids.length ? ` · fotos (archivo): ${ids.join(", ")}` : " · sin fotos"}`;
    }).join("\n");
  } catch {
    return "";
  }
}

/** El nombre de la estructura que dice la IA (campo «estructura» de su JSON) sale del guion: no es del formato. */
function sinEstructura(g) {
  if (!g || typeof g !== "object" || !("estructura" in g)) return { guion: g, nombre: "" };
  const { estructura, ...guion } = g;
  return { guion, nombre: typeof estructura === "string" ? estructura : String(estructura?.nombre ?? "") };
}

/**
 * Escribe el guion. `datos`: { idea, segundos, formato, postId?, estructuraId? }. → { guion, avisos, corregido, modelo,
 * aviso, estructura: { id, nombre } | null }. `estructuraId`: la ESTRUCTURA de guion de la agencia que sigue la voz
 * (sin ella, la IA escoge entre las de voz en off y dice cuál). Lanza ErrorGuion (400 sin idea ni publicación, o con una
 * estructura que ya no está; 502 si la IA no da un guion válido ni al segundo intento).
 */
export async function escribirGuion(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim().slice(0, MAX_IDEA_ANIMADO);
  let eleccion;
  try {
    eleccion = await estructuraDeVoz(acceso, { estructuraId: datos.estructuraId ?? datos.formulaId ?? "", segundos: duracionAnimado(datos.segundos) });
  } catch (e) {
    if (e instanceof ErrorEstructura) throw new ErrorGuion(e.message, e.estado);
    throw e;
  }
  // El contexto común de todo guion de video: la publicación (con su guion), el cerebro y el criterio comercial.
  const ctx = await contextoDeGuion(env, acceso, cliente, {
    postId: String(datos.postId ?? ""), consulta: `${idea} video animado guion`, presupuesto: 4000,
  });
  const post = ctx.post;
  const delPost = textoDePublicacion(post);
  if (!idea && !delPost) throw new ErrorGuion("Di de qué va el video (o créalo desde una publicación del calendario).");
  const segundos = duracionAnimado(datos.segundos);
  const contexto = ctx.contexto;
  const productos = await catalogoConFotos(acceso, cliente.id);
  const personaje = kitDe(cliente).personajeVideo ?? null;

  const base = { marca: cliente.name, idea, publicacion: delPost, segundos, formato: datos.formato, contexto, productos, personaje, criterio: ctx.criterio, estructura: eleccion.texto };
  let r = await llamarIA(env, acceso, cliente, { prompt: pedidoDeGuionAnimado(base), salida: 8000, funcion: "guion de video" });
  let leido = sinEstructura(leerGuionAnimado(r.texto));
  let nombre = leido.nombre;
  let g = leido.guion;
  let v = g ? validarGuion(g) : { ok: false, errores: [{ donde: "guion", mensaje: "No es un JSON que se pueda leer." }] };
  let corregido = false;
  if (!v.ok) {
    // Una sola vuelta con sus errores: la segunda casi siempre los arregla y el costo tiene techo.
    corregido = true;
    r = await llamarIA(env, acceso, cliente, {
      prompt: pedidoDeGuionAnimado({ ...base, errores: v.errores, anterior: g ? JSON.stringify(g) : r.texto }), salida: 8000, funcion: "guion de video",
    });
    leido = sinEstructura(leerGuionAnimado(r.texto));
    nombre = leido.nombre || nombre;
    g = leido.guion;
    v = g ? validarGuion(g) : v;
  }
  if (!v.ok) {
    const lista = (v.errores ?? []).slice(0, 4).map((e) => `${e.donde}: ${e.mensaje}`).join("; ");
    throw new ErrorGuion(`La IA no escribió un guion válido ni al corregirlo${lista ? ` (${lista})` : ""}. Prueba con otra idea o más detalle.`, 502);
  }
  return {
    guion: v.guion, avisos: v.avisos, corregido, modelo: r.modelo, aviso: r.aviso ?? null, postId: post ? String(datos.postId) : null,
    estructura: usadaEn(eleccion, nombre),
  };
}

/**
 * «Diseñar las escenas con IA» de un video con CANCIÓN (worker/lib/estudio/cancion.js): la IA diseña sobre la letra por
 * líneas con sus tiempos, el coro y los huecos instrumentales (`pedidoDeGuionCancion`); la aplicación le pone SU canción
 * (`conLaCancion`) y lo valida con el validador de siempre y con `comprobarLetra` (la `habla` es la letra tal cual). Si
 * falla, UNA vuelta con los errores; si tampoco, 502. No guarda nada. Texto (unos céntimos), sin confirmación.
 * `sincronia`: la de la canción ({ archivo, nombre, duracion, letra }); `lineas`, `huecos`: los de videoCancion.js.
 * → { guion, avisos, corregido, modelo, aviso }.
 */
export async function escribirGuionCancion(env, acceso, cliente, { sincronia, lineas, huecos, formato = "9:16", titulo = "", postId = "", indicacion = "" }) {
  const ctx = await contextoDeGuion(env, acceso, cliente, { postId: String(postId ?? ""), consulta: `${titulo || sincronia.nombre || ""} canción video animado`, presupuesto: 3000 });
  const productos = await catalogoConFotos(acceso, cliente.id);
  const personaje = kitDe(cliente).personajeVideo ?? null;
  const base = {
    marca: cliente.name, titulo, nombre: sincronia.nombre ?? "", duracion: sincronia.duracion, lineas, huecos, formato,
    contexto: ctx.contexto, productos, personaje, indicacion,
  };
  const cancion = { archivo: sincronia.archivo, duracion: sincronia.duracion, nombre: sincronia.nombre ?? "" };
  const revisar = (texto) => {
    const g = leerGuionAnimado(texto);
    if (!g) return { g: null, v: { ok: false, errores: [{ donde: "guion", mensaje: "No es un JSON que se pueda leer." }] } };
    const conCancion = conLaCancion(g, cancion);
    const v = validarGuion(conCancion);
    const deLetra = v.guion ? comprobarLetra(v.guion, sincronia.letra) : [];
    return { g: conCancion, v: deLetra.length ? { ...v, ok: false, errores: [...(v.errores ?? []), ...deLetra] } : v };
  };
  let r = await llamarIA(env, acceso, cliente, { prompt: pedidoDeGuionCancion(base), salida: 12000, funcion: "guion de video" });
  let { g, v } = revisar(r.texto);
  let corregido = false;
  if (!v.ok) {
    corregido = true;
    r = await llamarIA(env, acceso, cliente, {
      prompt: pedidoDeGuionCancion({ ...base, errores: v.errores, anterior: g ? JSON.stringify(g) : r.texto }), salida: 12000, funcion: "guion de video",
    });
    ({ g, v } = revisar(r.texto));
  }
  if (!v.ok) {
    const lista = (v.errores ?? []).slice(0, 4).map((e) => `${e.donde}: ${e.mensaje}`).join("; ");
    throw new ErrorGuion(`La IA no diseñó un guion válido con la letra tal cual ni al corregirlo${lista ? ` (${lista})` : ""}. Prueba con la prueba de sincronía (gratis) y edítala.`, 502);
  }
  return { guion: v.guion, avisos: v.avisos, corregido, modelo: r.modelo, aviso: r.aviso ?? null };
}
