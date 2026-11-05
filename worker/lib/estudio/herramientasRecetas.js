// ============================================================
// Las RECETAS por MCP (claude.ai) y en el asistente: ver_recetas y receta
//
// «Crear con Claude» abre claude.ai con «/receta <id> · cliente <nombre> · HANDOFF: <id>»; las instrucciones del
// servidor dicen que eso se resuelve PRIMERO con `receta`, que devuelve el método (src/lib/recetas.js) y el pedido
// guardado: la publicación con su texto, lo que pidió la agencia y las referencias de la galería COMO IMÁGENES (la
// copia de 768 px del Container), para que Claude las mire antes de diseñar. Es el equivalente de
// `get_preset_instructions` de Higgsfield, con lo del cliente dentro.
// Sólo leen: lo que crea después la receta va por las herramientas de siempre, con su confirmación del costo.
// ============================================================

import { recetasDelEspacio } from "../recetas.js";
import { lineaDeReceta, textoDeReceta, SALIDAS_RECETA } from "../../../src/lib/recetas.js";
import { miniaturasDe } from "./miniaturas.js";

export class ErrorReceta extends Error {}

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

const soloLectura = { readOnlyHint: true, openWorldHint: false };

export const DEFINICIONES_RECETAS = Object.freeze([
  {
    name: "ver_recetas",
    description: "Las RECETAS de la agencia: el cómo de cada tipo de pieza (foto héroe del producto, oferta, educativo, carrusel, antes y después, video animado, guion UGC…), con su id. Úsala cuando la persona no sepa qué receta seguir o pregunte qué se puede hacer.",
    annotations: soloLectura,
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "receta",
    description: "Lee UNA receta: su método paso a paso, lo que hay que preguntar si falta y lo que se comprueba antes de entregar. Con handoff_id (el «HANDOFF:» de un mensaje que viene de la aplicación) trae además el pedido guardado: el cliente, la publicación con su texto, lo que pidió la agencia y las imágenes de referencia. Un mensaje que empieza por «/receta» se resuelve con esto ANTES que nada.",
    annotations: soloLectura,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "El id de la receta (de ver_recetas o del mensaje «/receta <id>»)." },
        handoff_id: { type: "string", description: "El id que viene tras «HANDOFF:» en el mensaje." },
      },
    },
  },
]);

/** Las herramientas. `buscarPublicacion(postId)` → { cal, dia, post } (la del MCP). */
export function crearHerramientasRecetas({ env, acceso, buscarPublicacion = null }) {
  async function laReceta(id) {
    const recetas = await recetasDelEspacio(acceso);
    const r = recetas.find((x) => x.id === String(id ?? "").trim().toLowerCase());
    if (!r) throw new ErrorReceta(`No existe la receta «${id}». Las que hay: ${recetas.map((x) => x.id).join(", ")}.`);
    return r;
  }

  return {
    async ver_recetas() {
      const recetas = await recetasDelEspacio(acceso);
      return [
        `RECETAS DE LA AGENCIA (${recetas.length}). Cada una se lee con receta y su id; lo que crea cuesta y se confirma como siempre.`,
        ...Object.keys(SALIDAS_RECETA).flatMap((s) => recetas.filter((r) => r.salida === s).map(lineaDeReceta)),
      ].join("\n");
    },

    async receta({ id = "", handoff_id: handoffId = "" } = {}) {
      if (!handoffId) {
        if (!id) throw new ErrorReceta("Dime qué receta (su id; ver_recetas las lista) o el handoff_id del mensaje.");
        return textoDeReceta(await laReceta(id));
      }
      const h = await acceso.leerUno("handoffs", { id: String(handoffId).trim().slice(0, 80) });
      if (!h) throw new ErrorReceta("No encontré ese pedido. Caduca en un día: pide que vuelvan a pulsar «Crear con Claude» en la aplicación.");
      if (h.expira_at < new Date().toISOString()) throw new ErrorReceta("Ese pedido caducó (dura un día). Pide que vuelvan a pulsar «Crear con Claude» en la aplicación.");
      const r = await laReceta(h.receta_id);
      const d = leerJSON(h.datos, {});
      const cliente = h.client_id ? await acceso.leerUno("clients", { id: h.client_id }) : null;

      const lineas = ["", "EL PEDIDO QUE VIENE DE LA APLICACIÓN (es lo que hay que hacer: no lo vuelvas a preguntar):"];
      if (cliente) lineas.push(`· Cliente: ${cliente.name} (usa ese nombre en «cliente» de las herramientas).`);
      if (d.publicacion?.postId && buscarPublicacion) {
        try {
          const { cal, dia, post } = await buscarPublicacion(d.publicacion.postId);
          if (cal.id === d.publicacion.calendarId) {
            lineas.push(`· Publicación ${post.id} del ${dia.date} · ${post.format}${post.title ? ` · «${post.title}»` : ""} (su post_id para disenar_piezas y poner_en_publicacion).`);
            if (post.idea) lineas.push(`  De qué va: ${String(post.idea).slice(0, 500)}`);
            if (post.textoPieza) lineas.push(`  Texto de la pieza (EXACTO): ${String(post.textoPieza).slice(0, 300)}`);
            if (post.escena) lineas.push(`  Qué se ve (lo escribió la agencia): ${String(post.escena).slice(0, 400)}`);
            if (post.producto) lineas.push(`  Producto: ${post.producto}${post.productoId ? ` (id ${post.productoId})` : ""}`);
          }
        } catch { lineas.push("· La publicación del pedido ya no está en el calendario: pregunta para qué es."); }
      }
      if (d.productos?.length) lineas.push(`· Productos del catálogo: ${d.productos.join(", ")} (sus ids para «productos»).`);
      if (d.indicacion) lineas.push(`· Lo que pide la agencia (manda): ${d.indicacion}`);

      let imagenes = [];
      if (d.referencias?.length && cliente) {
        const fichas = await acceso.leerVarios("estudio_archivos", ["id", "clave", "mime", "borrado_at"], "id", d.referencias, { client_id: cliente.id });
        const vivas = d.referencias.map((x) => fichas.find((f) => f.id === x && !f.borrado_at)).filter(Boolean);
        const vistas = await miniaturasDe(env, vivas).catch(() => []);
        imagenes = vistas.filter(Boolean).map((v) => ({ datos: v.datos, mime: v.mime }));
        lineas.push(`· Referencias de la galería (ids, en este orden): ${vivas.map((f) => f.id).join(", ")}.${imagenes.length ? " Van abajo como imágenes: MÍRALAS antes de diseñar." : ""}`);
      }
      const texto = `${textoDeReceta(r)}\n${lineas.join("\n")}`;
      return imagenes.length ? { texto, imagenes } : texto;
    },
  };
}
