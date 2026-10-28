// ============================================================
// Controlar una pieza y, si sólo falla el texto, corregirlo editándola
//
// Lo usan el lote, «Producir el mes», el carrusel y el compositor: al
// terminar cada imagen, la IA la mira (src/lib/control.js, el Worker en
// worker/lib/estudio/control.js). Si lo único que falla son letras, se pide
// una EDICIÓN de la misma imagen («donde dice X debe decir Y, no toques nada
// más») con un modelo que sepa editar texto, y se controla otra vez. Se
// queda la que tenga menos errores; la otra sigue en la galería.
//
// En la MISMA llamada, el DIRECTOR revisa el diseño contra su ficha (dónde
// está el texto y de qué tamaño, la jerarquía…) y le pone nota. Por debajo de
// 8, sus arreglos van en la misma edición que las letras: UNA edición como
// mucho por pieza, así el costo tiene techo (una imagen más).
//
// Si falla algo más (un precio, el logo, una deformación), no se toca: se
// marca «Revisar» y lo decide una persona.
//
// Si el control mismo falla (sin saldo, sin red), la pieza sigue su camino
// sin control: nunca se pierde una pieza por no poder revisarla.
// ============================================================

import * as api from "./estudio";
import { correccionDelDirector, mejoro } from "./control";
import { esperarArchivos } from "./carruselEstudio";
import { MODELOS, ajustesDe, modeloQueRespeta } from "./estudioCatalogo";

/** ¿Revisar y corregir solo? Se recuerda por navegador; encendido por defecto. */
const CLAVE = "estudio-control";
export function controlEncendido() {
  try { return localStorage.getItem(CLAVE) !== "0"; } catch { return true; }
}
export function encenderControl(si) {
  try { localStorage.setItem(CLAVE, si ? "1" : "0"); } catch { /* sin almacenamiento */ }
}

/**
 * Con qué se corrige el texto: el mismo modelo que hizo la pieza si edita (así no cambia el estilo), si no Nano
 * Banana, y si no el que diga `modeloParaEditar`. `activos`: { motor: bool }. Pura.
 */
export function modeloParaCorregir(activos = {}, original = "", aspecto = "") {
  const sirve = (m) => m && m.tipo === "imagen" && m.referencias > 0 && activos[m.motor] && m.motor !== "prueba";
  const delOriginal = MODELOS.find((m) => m.id === original);
  const nano = MODELOS.find((m) => m.id === "nano-banana");
  const m = sirve(delOriginal) ? delOriginal : sirve(nano) ? nano : api.modeloParaEditar(activos);
  // Editar es pedir CON referencia (la misma imagen): un modelo que así no respeta la proporción (Muse Image da 2:3)
  // cede al que sí, o la pieza corregida saldría de otro tamaño.
  return modeloQueRespeta(m, activos, aspecto, 1);
}

/** Qué motores tienen llave (para escoger con qué corregir), si quien llama no lo sabe. */
async function activosDeMotores(activos) {
  if (activos && Object.keys(activos).length) return activos;
  const m = await api.leerMotores().catch(() => null);
  return Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, Boolean(v.activo)]));
}

/** La proporción de una pieza (la que se pidió, o la de sus medidas). Pura. */
const proporcion = (a) => a?.ajustes?.aspectRatio ?? api.proporcionDeMedidas(a?.ancho, a?.alto);

/**
 * Controla `archivo` y, si sólo falla el texto y `corregir`, lo corrige una vez. → { archivo, control, corregida }:
 * `archivo` es la que se queda (la corregida si mejoró). Nunca lanza por el control: sin él, `control: null`.
 */
export async function controlarYCorregir({ clienteId, archivo, texto = null, sistema = null, activos = null, corregir = true, carpetaId = null, seguir = () => true }) {
  if (!archivo || archivo.tipo === "video") return { archivo, control: null, corregida: false };
  let primero;
  try {
    primero = (await api.controlarArchivo(clienteId, archivo.id, { texto, sistema })).control;
  } catch {
    return { archivo, control: null, corregida: false };
  }
  if (!primero || primero.estado === "ok" || !corregir || !primero.corregible || !seguir()) return { archivo, control: primero, corregida: false };
  try {
    return await corregirTexto({ clienteId, archivo, control: primero, activos, carpetaId, seguir });
  } catch {
    return { archivo, control: primero, corregida: false };
  }
}

/**
 * Corrige lo corregible de una pieza ya controlada (las letras y los arreglos de diseño del director) editando la
 * misma imagen, controla la nueva contra la MISMA ficha y se queda la mejor (a igualdad, la original). → { archivo,
 * control, corregida }. Lanza si el pedido falla (lo dice quien llama).
 */
export async function corregirTexto({ clienteId, archivo, control, activos = null, carpetaId = null, seguir = () => true }) {
  const m = modeloParaCorregir(await activosDeMotores(activos), archivo.modelo, proporcion(archivo));
  const instruccion = correccionDelDirector(control, control.texto);
  if (!instruccion) return { archivo, control, corregida: false };
  const { prompt, medios } = api.pedidoDeCorreccion({ clave: archivo.clave, instruccion, modelo: m });
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: m.id, prompt, n: 1, ajustes: ajustesDe(m, { aspectRatio: proporcion(archivo) }, medios), medios, confirmado: true,
    ...(carpetaId ?? archivo.carpetaId ? { carpetaId: carpetaId ?? archivo.carpetaId } : {}),
  });
  const [nueva] = await esperarArchivos(clienteId, trabajo, { seguir });
  const segundo = (await api.controlarArchivo(clienteId, nueva.id, { texto: control.texto, ficha: control.ficha ?? null })).control;
  const mejor = mejoro(control, segundo);
  return mejor ? { archivo: nueva, control: segundo, corregida: true } : { archivo, control, corregida: false, intento: nueva };
}

/**
 * Lo que se hace al terminar un trabajo del compositor: el control (y la corrección del texto) de cada imagen, si está
 * encendido, y el logo estampado si el kit lo pide. → true si cambió algo en la galería (hay que releerla).
 */
export async function terminarTrabajo({ clienteId, trabajo, kit, estampar = false, conLogo = null }) {
  if (!trabajo?.archivos?.length || trabajo.tipo === "video" || trabajo.estado !== "hecho") return false;
  const g = await api.leerEstudio(clienteId).catch(() => null);
  let cambios = false;
  for (const id of trabajo.archivos) {
    let a = g?.archivos?.find((x) => x.id === id);
    if (!a) continue;
    if (controlEncendido()) {
      const r = await controlarYCorregir({ clienteId, archivo: a });
      cambios ||= Boolean(r.control);
      a = r.archivo;
    }
    if (estampar && conLogo && (await conLogo({ clienteId, archivo: a, kit })) !== a) cambios = true;
  }
  return cambios;
}

/**
 * «Rehacer con lo que dijo el cliente»: EDITA la imagen de la publicación con su comentario (la misma pieza, sólo
 * ese cambio) en vez de pedir otra desde cero, que perdería lo que sí le gustó. `src`: la imagen puesta (tiene que
 * estar en el almacén de ESTE cliente); `medida`: sus { ancho, alto } para la proporción; `texto`: lo que debe decir
 * (se controla si el control está encendido). → el archivo nuevo de la galería; la imagen de antes se queda allí.
 */
export async function rehacerConComentario({ clienteId, src, indicacion, medida = {}, texto = "", activos = null, seguir = () => true }) {
  const archivo = api.archivoDesdeSrc(src, clienteId);
  if (!archivo) throw new Error("Esa imagen no está en el almacén de este cliente: súbela de nuevo y prueba otra vez.");
  if (!String(indicacion ?? "").trim()) throw new Error("Escribe qué hay que cambiar.");
  const m = modeloParaCorregir(await activosDeMotores(activos), "", proporcion(medida));
  if (!m) throw new Error("No hay ningún modelo que edite imágenes con llave puesta (Ajustes → IA).");
  const { prompt, medios } = api.pedidoDeCorreccion({ clave: archivo.clave, instruccion: indicacion, modelo: m });
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: m.id, prompt, n: 1, ajustes: ajustesDe(m, { aspectRatio: proporcion(medida) }, medios), medios, confirmado: true,
  });
  const [nueva] = await esperarArchivos(clienteId, trabajo, { seguir });
  if (!nueva) throw new Error("La imagen nueva no llegó. Prueba otra vez.");
  if (!controlEncendido()) return nueva;
  return (await controlarYCorregir({ clienteId, archivo: nueva, texto: texto || null, activos })).archivo;
}
