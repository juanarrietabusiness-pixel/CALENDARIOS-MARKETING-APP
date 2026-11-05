// ============================================================
// Las recetas del espacio y el pedido de «Crear con Claude» (handoff), lo que comparten la ruta y el MCP
//
// Lo puro está en src/lib/recetas.js; aquí, lo que lee y escribe en D1 por la capa de acceso.
// ============================================================

import { uuid } from "./ids.js";
import { recetasDisponibles, limpiarHandoff, mensajeParaClaude, enlaceDeClaude, HORAS_HANDOFF } from "../../src/lib/recetas.js";

const deFila = (f) => {
  let d = {};
  try { d = JSON.parse(f.datos); } catch { /* fila rota: la limpieza la descarta */ }
  return { ...d, id: f.receta_id };
};

/** Las recetas que valen en este espacio. */
export async function recetasDelEspacio(acceso) {
  return recetasDisponibles((await acceso.leer("recetas", {})).map(deFila));
}

/**
 * Guarda el pedido de «Crear con Claude» → { id, mensaje, enlace }. Las referencias tienen que ser imágenes de la
 * galería de ESE cliente; la publicación, de un calendario suyo. Lo comparten la ruta y quien lo necesite.
 */
export async function crearHandoff(acceso, usuario, receta, datos = {}) {
  const cliente = datos.clienteId ? await acceso.leerUno("clients", { id: String(datos.clienteId) }) : null;
  if (datos.clienteId && !cliente) return { error: "Ese cliente no existe.", estado: 404 };
  const limpio = limpiarHandoff(datos);
  if (limpio.publicacion) {
    const cal = cliente ? await acceso.leerUno("calendars", { id: limpio.publicacion.calendarId, client_id: cliente.id }) : null;
    if (!cal) return { error: "Esa publicación no es de este cliente.", estado: 400 };
  }
  if (limpio.referencias.length) {
    if (!cliente) return { error: "Las referencias son de la galería de un cliente: escoge el cliente.", estado: 400 };
    const hay = await acceso.leerVarios("estudio_archivos", ["id", "borrado_at"], "id", limpio.referencias, { client_id: cliente.id });
    const vivas = new Set(hay.filter((f) => !f.borrado_at).map((f) => f.id));
    limpio.referencias = limpio.referencias.filter((x) => vivas.has(x));
  }
  const id = uuid();
  const momento = new Date();
  await acceso.insertar("handoffs", {
    id, client_id: cliente?.id ?? null, receta_id: receta.id, datos: JSON.stringify(limpio), creado_por: usuario?.id ?? null,
    created_at: momento.toISOString(), expira_at: new Date(momento.getTime() + HORAS_HANDOFF * 3_600_000).toISOString(),
  });
  const mensaje = mensajeParaClaude({ receta, cliente: cliente?.name ?? "", handoffId: id });
  return { id, mensaje, enlace: enlaceDeClaude(mensaje) };
}

