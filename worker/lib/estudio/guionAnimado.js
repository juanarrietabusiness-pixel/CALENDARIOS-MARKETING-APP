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
import { pedidoDeGuionAnimado, leerGuionAnimado, textoDePublicacion, duracionAnimado, MAX_IDEA_ANIMADO } from "../../../src/lib/guionAnimadoIA.js";

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

/**
 * Escribe el guion. `datos`: { idea, segundos, formato, postId? }. → { guion, avisos, corregido, modelo, aviso }.
 * Lanza ErrorGuion (400 sin idea ni publicación; 502 si la IA no da un guion válido ni al segundo intento).
 */
export async function escribirGuion(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim().slice(0, MAX_IDEA_ANIMADO);
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

  const base = { marca: cliente.name, idea, publicacion: delPost, segundos, formato: datos.formato, contexto, productos, personaje, criterio: ctx.criterio };
  let r = await llamarIA(env, acceso, cliente, { prompt: pedidoDeGuionAnimado(base), salida: 8000, funcion: "guion de video" });
  let g = leerGuionAnimado(r.texto);
  let v = g ? validarGuion(g) : { ok: false, errores: [{ donde: "guion", mensaje: "No es un JSON que se pueda leer." }] };
  let corregido = false;
  if (!v.ok) {
    // Una sola vuelta con sus errores: la segunda casi siempre los arregla y el costo tiene techo.
    corregido = true;
    r = await llamarIA(env, acceso, cliente, {
      prompt: pedidoDeGuionAnimado({ ...base, errores: v.errores, anterior: g ? JSON.stringify(g) : r.texto }), salida: 8000, funcion: "guion de video",
    });
    g = leerGuionAnimado(r.texto);
    v = g ? validarGuion(g) : v;
  }
  if (!v.ok) {
    const lista = (v.errores ?? []).slice(0, 4).map((e) => `${e.donde}: ${e.mensaje}`).join("; ");
    throw new ErrorGuion(`La IA no escribió un guion válido ni al corregirlo${lista ? ` (${lista})` : ""}. Prueba con otra idea o más detalle.`, 502);
  }
  return { guion: v.guion, avisos: v.avisos, corregido, modelo: r.modelo, aviso: r.aviso ?? null, postId: post ? String(datos.postId) : null };
}
