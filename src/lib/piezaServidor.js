// ============================================================
// UNA pieza (o unas pocas) con las MISMAS reglas que el lote: por el servidor
//
// El lote, «Producir el mes», el carrusel y `disenar_piezas` van por un ENCARGO
// del servidor (worker/lib/estudio/encargos.js), que aplica siempre lo mismo: la
// proporción (se recompone si no casa), el control de calidad con UNA corrección
// que sólo se queda si mejoró, y el logo estampado si el kit lo pide (el
// Container o, si no hay, la pantalla). Lo demás —el visor de la galería, «Otra
// versión», «Crear la imagen aquí», «Recrear con mi marca», las historias, el
// asistente— pedía el trabajo a pelo y lo terminaba la pantalla: si seguía
// abierta y si la casilla del control estaba encendida. En producción, 151 de 430
// piezas salieron sin control.
//
// Aquí cualquier camino manda su pedido YA LISTO (la escena dentro, sin el hueco
// «{{ESCENA}}»: el director ya la diseñó) como un encargo de una pieza o de unas
// pocas. Se sigue mientras se mira, y si se cierra la pantalla el servidor lo
// termina igual. Lo que necesita lienzo lo pone la pantalla SÓLO con el encargo
// ya cerrado: si hay Container, el servidor no lo cierra sin intentarlo antes, y
// así no se estampa el logo dos veces.
// ============================================================

import { crearEncargo, seguirEncargo, terminarEncargo } from "./encargosApi";
import { terminadoEncargo, resultadoDePaso } from "./encargos";
import { estampaSola } from "./logoEstudio";
import { ideaDelPedido } from "./kitMarca";

const limpio = (t, max) => String(t ?? "").slice(0, max);

/**
 * Un paso del encargo con su pedido listo. `texto`: lo que tiene que decir la pieza (el control lo compara letra por
 * letra; vacío: el servidor lo saca del pedido). `plantilla`: { texto, plantilla, nombre } si el texto lo pone la
 * aplicación encima (entonces no se controla: el texto no lo escribió el motor). El logo se estampa si el kit lo pide
 * (`estampar` lo fuerza o lo evita). Pura.
 */
export function pasoListo({ id = "p1", titulo = "", pedido, texto = "", kit = {}, plantilla = null, estampar = null }) {
  const logo = estampar ?? estampaSola(kit);
  const { modelo, prompt, n = 1, ajustes = {}, medios = {}, calendarId = null, postId = null } = pedido ?? {};
  return {
    id, titulo: limpio(titulo, 140),
    pedido: { modelo, prompt, n, ajustes, medios, ...(calendarId && postId ? { calendarId, postId } : {}) },
    // La escena ya va DENTRO del pedido (sin hueco): aquí sólo para que la pantalla diga «En cola» y no «Esperando al
    // director», y para saber qué se pidió.
    escena: limpio(ideaDelPedido(prompt), 1500) || "Pedido listo", sinMejorar: "", encargo: null, mejora: null,
    texto: plantilla ? "" : limpio(texto, 600),
    controlar: !plantilla,
    navegador: plantilla || logo ? { plantilla: plantilla ?? null, logo: Boolean(logo) } : null,
  };
}

/** Manda los pasos al servidor. → el encargo (lo sigue `esperarEnServidor`). */
export async function lanzarEnServidor({ clienteId, pasos, titulo = "", carpetaId = null }) {
  const { encargo } = await crearEncargo(clienteId, {
    tipo: "lote", titulo: limpio(titulo, 140), pasos, carpetaId, mejorar: false, controlar: true, paralelo: Math.min(3, Math.max(1, pasos.length)),
  });
  return encargo;
}

/**
 * Lo que dio cada paso de un encargo terminado: [{ id, archivo, control, error }] en su orden. `archivo` es la final (con
 * el logo o el texto puestos) o, si no la hay, la que salió. Pura.
 */
export function resultadosDe(e, archivos = new Map()) {
  return (e?.pasos ?? []).map((p) => {
    const r = resultadoDePaso(p, archivos);
    const o = r?.opciones?.[0];
    if (o) return { id: p.id, archivo: o.final ?? o.crudo, control: o.control ?? null, error: "" };
    return { id: p.id, archivo: null, control: null, error: r?.error || p.error || (terminadoEncargo(e) ? "La pieza no salió." : "") };
  });
}

/**
 * Sigue el encargo hasta que termine: `alPaso(id, resultadoDePaso)` según va cada pieza, y lo que necesita lienzo cuando
 * el servidor ya cerró. → los resultados (`resultadosDe`), o null si se dejó de mirar.
 */
export async function esperarEnServidor({ clienteId, encargo, kit = {}, alPaso = () => {}, seguir = () => true }) {
  let archivos = new Map();
  const fin = await seguirEncargo({
    clienteId, id: encargo.id, seguir,
    alCambio: (e, a) => {
      archivos = a;
      for (const p of e.pasos) alPaso(p.id, resultadoDePaso(p, a));
      if (terminadoEncargo(e)) void terminarEncargo({ clienteId, encargo: e, archivos: a, kit });
    },
  });
  return fin ? resultadosDe(fin, archivos) : null;
}

/**
 * UNA pieza por el servidor, de principio a fin. `alProgresar(texto)`: por dónde va. → el archivo final de la galería.
 * Lanza si la pieza no salió (con el motivo del servidor).
 */
export async function crearUnaEnServidor({ clienteId, paso, kit = {}, titulo = "", carpetaId = null, alProgresar = () => {}, seguir = () => true }) {
  const encargo = await lanzarEnServidor({ clienteId, pasos: [paso], titulo: titulo || paso.titulo, carpetaId });
  const r = await esperarEnServidor({
    clienteId, encargo, kit, seguir,
    alPaso: (_id, x) => { if (x?.cargando && x.paso) alProgresar(x.paso); },
  });
  if (!r) return null;
  if (!r[0]?.archivo) throw new Error(r[0]?.error || "La pieza no salió. Prueba otra vez.");
  return r[0].archivo;
}
