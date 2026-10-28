// ============================================================
// Los encargos del Estudio: una cadena de piezas que sigue en el servidor
//
// Antes, el LOTE lo orquestaba el navegador: el director diseñaba la tanda,
// se pedía cada pieza, se esperaba, se controlaba y se corregía, todo con
// `await` en la pestaña. Al salir de la aplicación en el teléfono (o cerrar
// la pestaña) la cadena se paraba a medias: lo pedido terminaba por el cron,
// lo que faltaba no se pedía nunca.
//
// Ahora el navegador ARMA el encargo —cada pieza con su pedido ya compuesto
// por el mismo camino de siempre (`pedidoDeLote`), con «{{ESCENA}}» donde va
// la escena— y el servidor lo LLEVA, paso a paso, guardando el avance:
//
//   1. el director de arte, de 6 en 6 (la escena de cada pieza);
//   2. cada pieza: la mejora si no tiene ficha, y su trabajo;
//   3. cada imagen que sale: la proporción (se recompone si no casa), el
//      control de calidad y, si hace falta, UNA corrección que se queda sólo
//      si mejoró (la misma regla que lib/controlEstudio.js).
//
// QUIÉN AVANZA. La bomba del Durable Object del espacio (bomba.js, con su
// alarma), el cron de respaldo y el navegador si está mirando: los tres
// llaman a `avanzarEncargo`, y el permiso (`bloqueado_hasta`, como en los
// trabajos) hace que dos no den el mismo paso. Los TRABAJOS de cada pieza
// los avanza la bomba como cualquier otro; el encargo sólo mira si acabaron.
//
// LO QUE NO SE HACE AQUÍ. Poner el texto de la plantilla encima y estampar el
// logo necesitan un lienzo: los hace el navegador al volver a abrir el lote
// (`finales` de cada paso). Y si el director escoge una plantilla del kit, en
// el servidor sólo cuenta su ficha: el pedido ya va armado.
// ============================================================

import { uuid } from "../ids.js";
import { difundir } from "../vivo.js";
import { despertar } from "../despertar.js";
import { crearTrabajo, ErrorEstudio } from "./trabajos.js";
import { estadoMotores } from "./motores.js";
import { fichasDeDiseno, limpiarVistas } from "./fichas.js";
import { mejorarIdea } from "./prompt.js";
import { controlarPieza } from "./control.js";
import {
  modeloPorId, MAX_PROMPT, ajustesDe, fueraDeProporcion, respetaProporcion, relevoPara, pedidoDeRecomponer, estaVivo,
} from "../../../src/lib/estudioCatalogo.js";
import { pedidoDeCorreccion, modeloParaCorregir, proporcionDeMedidas } from "../../../src/lib/edicion.js";
import { correccionDelDirector, mejoro } from "../../../src/lib/control.js";
import { ESCENA, MAX_PASOS, TANDA_FICHAS, TIPOS_ENCARGO } from "../../../src/lib/encargos.js";

/** Cuánto vale el permiso de un paso: el director con razonamiento puede tardar minutos. */
export const RESERVA_ENCARGO_MS = 240_000;
/** Un encargo que lleva más que esto vivo se cierra con lo que haya salido. */
export const PLAZO_ENCARGO_MS = 8 * 3600_000;

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const texto = (v, max) => String(v ?? "").slice(0, max);
const ahora = () => new Date().toISOString();
const activosDe = (env) => Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, Boolean(v.activo)]));

// ------------------------------------------------------------
// Crear
// ------------------------------------------------------------

/** Lo que el navegador manda de UNA pieza, limpio. El pedido lo valida `crearTrabajo` al usarlo. */
function limpiarPaso(p, i) {
  if (!p || typeof p !== "object" || !p.pedido || typeof p.pedido !== "object") return null;
  const pedido = {
    modelo: texto(p.pedido.modelo, 80), prompt: texto(p.pedido.prompt, MAX_PROMPT + 40),
    n: Math.max(1, Math.min(3, Math.floor(Number(p.pedido.n)) || 1)),
    ajustes: p.pedido.ajustes && typeof p.pedido.ajustes === "object" ? p.pedido.ajustes : {},
    medios: p.pedido.medios && typeof p.pedido.medios === "object" ? p.pedido.medios : {},
  };
  if (!pedido.modelo || !pedido.prompt) return null;
  const objeto = (o, max) => (o && typeof o === "object" && JSON.stringify(o).length <= max ? o : null);
  return {
    id: texto(p.id, 80) || `p${i + 1}`, titulo: texto(p.titulo, 140), pedido,
    encargo: objeto(p.encargo, 6000), mejora: objeto(p.mejora, 6000),
    escena: texto(p.escena, 4000), sinMejorar: texto(p.sinMejorar, 4000), texto: texto(p.texto, 600),
    controlar: p.controlar === true,
    fase: "nuevo", trabajoId: "", opciones: [], error: "",
  };
}

export function encargoPublico(f, { conPedidos = false } = {}) {
  if (!f) return null;
  const pasos = leerJSON(f.pasos, []).map((p) => (conPedidos ? p : {
    id: p.id, titulo: p.titulo, fase: p.fase, error: p.error, trabajoId: p.trabajoId, escena: p.escena,
    opciones: (p.opciones ?? []).map((o) => ({ id: o.id, fase: o.fase, control: o.control ?? null, corregida: Boolean(o.corregida) })),
    finales: p.finales ?? null,
  }));
  return {
    id: f.id, clientId: f.client_id, tipo: f.tipo, titulo: f.titulo, estado: f.estado, pasos, nota: f.nota, error: f.error,
    creadoPor: f.creado_por, creado: f.created_at, actualizado: f.updated_at, terminado: f.terminado_at,
  };
}

function anunciar(env, acceso, fila) {
  difundir(env, acceso.ownerId, {
    tipo: "estudio", clientId: fila.client_id, encargoId: fila.id, estado: fila.estado,
    por: { userId: "sistema", nombre: "Estudio", color: "", tab: null },
  });
}

/**
 * Guarda el encargo y despierta a quien lo lleva. No genera nada todavía: lo que puede rechazarse por pieza (la llave,
 * las referencias, el presupuesto) lo rechaza `crearTrabajo` al pedir cada una, y esa pieza queda con su motivo.
 */
export async function crearEncargo(env, acceso, cliente, cuerpo = {}, { usuario = null } = {}) {
  const tipo = TIPOS_ENCARGO.includes(cuerpo.tipo) ? cuerpo.tipo : null;
  if (!tipo) throw new ErrorEstudio("Ese encargo no existe.", 400);
  const pasos = (Array.isArray(cuerpo.pasos) ? cuerpo.pasos : []).slice(0, MAX_PASOS).map(limpiarPaso).filter(Boolean);
  if (!pasos.length) throw new ErrorEstudio("El encargo no trae ninguna pieza.", 400);
  const ids = new Set();
  for (const p of pasos) { if (ids.has(p.id)) p.id = `${p.id}-${ids.size}`; ids.add(p.id); }
  const datos = {
    mejorar: cuerpo.mejorar !== false, controlar: cuerpo.controlar === true,
    paralelo: Math.max(1, Math.min(3, Math.floor(Number(cuerpo.paralelo)) || 2)),
    carpetaId: cuerpo.carpetaId ? texto(cuerpo.carpetaId, 80) : null,
    vistas: limpiarVistas(cuerpo.vistas), concepto: "",
  };
  const momento = ahora();
  const fila = await acceso.insertar("estudio_encargos", {
    id: uuid(), client_id: cliente.id, tipo, titulo: texto(cuerpo.titulo, 140), estado: "en_marcha",
    datos: JSON.stringify(datos), pasos: JSON.stringify(pasos), nota: "En cola", error: "",
    creado_por: usuario?.id ?? null, bloqueado_hasta: "", created_at: momento, updated_at: momento, terminado_at: null,
  });
  anunciar(env, acceso, fila);
  await despertar(env, acceso.ownerId);
  return fila;
}

// ------------------------------------------------------------
// Avanzar
// ------------------------------------------------------------

/** El pedido con su escena puesta, sin pasar del tope (lo que sobra se quita de la escena, no del final). */
export function conEscena(prompt, escena) {
  const p = String(prompt ?? "");
  const e = String(escena ?? "").trim();
  if (!p.includes(ESCENA)) return p.slice(0, MAX_PROMPT);
  const sobra = p.length - ESCENA.length + e.length - MAX_PROMPT;
  return p.replace(ESCENA, () => (sobra > 0 ? e.slice(0, Math.max(200, e.length - sobra)) : e)).slice(0, MAX_PROMPT);
}

const vivo = (p) => p.fase === "generando" || p.fase === "opciones";
const terminado = (p) => p.fase === "hecho" || p.fase === "fallido";

/**
 * Da UN paso del encargo `id`. → { encargo, hizo, ocupado } o null si no existe. Lo barato (mirar si un trabajo
 * terminó) se hace de todas las piezas; lo caro (una llamada a la IA o un pedido) sólo una vez por paso.
 */
export async function avanzarEncargo(env, acceso, id) {
  const fila = await acceso.leerUno("estudio_encargos", { id });
  if (!fila) return null;
  if (fila.estado !== "en_marcha") return { encargo: fila, hizo: false };
  const t = Date.now();
  if (fila.bloqueado_hasta && fila.bloqueado_hasta > new Date(t).toISOString()) return { encargo: fila, ocupado: true, hizo: false };
  const permiso = new Date(t + RESERVA_ENCARGO_MS).toISOString();
  const reservado = await acceso.actualizar("estudio_encargos", { id, bloqueado_hasta: fila.bloqueado_hasta }, { bloqueado_hasta: permiso });
  if (reservado !== 1) return { encargo: fila, ocupado: true, hizo: false };

  const pasos = leerJSON(fila.pasos, []);
  const datos = leerJSON(fila.datos, {});
  let r;
  try {
    r = t - Date.parse(fila.created_at) > PLAZO_ENCARGO_MS
      ? cerrarPorPlazo(pasos)
      : await paso(env, acceso, fila, pasos, datos);
  } catch (e) {
    console.error("estudio: encargo", id, e);
    r = { hizo: false, nota: "Algo falló; se vuelve a intentar." };
  }
  const listos = pasos.length && pasos.every(terminado);
  const estado = r.estado ?? (listos ? (pasos.every((p) => p.fase === "fallido") ? "fallido" : "hecho") : "en_marcha");
  const cambios = {
    bloqueado_hasta: "", updated_at: ahora(), pasos: JSON.stringify(pasos),
    ...(r.datos ? { datos: JSON.stringify(r.datos) } : {}),
    nota: texto(r.nota ?? notaDe(pasos), 300), estado,
    ...(estado !== "en_marcha" ? { terminado_at: ahora() } : {}),
    ...(estado === "fallido" ? { error: texto(r.error ?? pasos.find((p) => p.error)?.error ?? "No salió ninguna pieza.", 400) } : {}),
  };
  await acceso.actualizar("estudio_encargos", { id, bloqueado_hasta: permiso }, cambios);
  const actual = await acceso.leerUno("estudio_encargos", { id });
  if (actual && (r.hizo || estado !== "en_marcha")) anunciar(env, acceso, actual);
  return { encargo: actual, hizo: Boolean(r.hizo), ocupado: false };
}

function cerrarPorPlazo(pasos) {
  for (const p of pasos) {
    if (terminado(p)) continue;
    const salieron = (p.opciones ?? []).filter((o) => o.id);
    if (salieron.length) { p.fase = "hecho"; for (const o of salieron) o.fase = "hecho"; } else { p.fase = "fallido"; p.error = "No terminó a tiempo."; }
  }
  return { hizo: true, nota: "Se cerró con lo que había salido: llevaba demasiado tiempo." };
}

/** En palabras, por dónde va (lo que enseña la pantalla debajo del lote). */
export function notaDe(pasos) {
  const total = pasos.length;
  const hechas = pasos.filter((p) => p.fase === "hecho").length;
  const fallidas = pasos.filter((p) => p.fase === "fallido").length;
  if (hechas + fallidas === total) return fallidas ? `${hechas} de ${total} listas; ${fallidas} no salieron.` : `Las ${total} listas.`;
  return `${hechas} de ${total} listas${fallidas ? ` (${fallidas} no salieron)` : ""}.`;
}

async function paso(env, acceso, fila, pasos, datos) {
  const cliente = await acceso.leerUno("clients", { id: fila.client_id });
  if (!cliente) return { hizo: true, estado: "cancelado", nota: "El cliente ya no existe." };
  const ctx = { env, acceso, cliente, datos, usuario: fila.creado_por ? { id: fila.creado_por } : null };

  // 1. El director de arte, de 6 en 6: la tanda entera como una SERIE (el concepto de la primera pasa a las demás).
  if (datos.mejorar) {
    const faltan = pasos.filter((p) => p.fase === "nuevo" && p.encargo && !p.escena && !p.fichaIntentada);
    if (faltan.length) {
      const tanda = faltan.slice(0, TANDA_FICHAS);
      try {
        const r = await fichasDeDiseno(env, acceso, cliente, {
          concepto: datos.concepto ?? "", vistas: datos.vistas ?? [], piezas: tanda.map((p, j) => ({ n: j + 1, ...p.encargo })),
        });
        datos.concepto ||= String(r?.concepto ?? "");
        tanda.forEach((p, j) => { const f = r?.fichas?.[j + 1]; if (f?.ficha) p.escena = String(f.ficha); });
      } catch (e) {
        if (e?.codigo === "presupuesto" || e?.estado === 402) return pararTodo(pasos, e.message);
        // Sin ficha, cada pieza se diseña sola al crearla (la mejora).
      }
      for (const p of tanda) p.fichaIntentada = true;
      // Las vistas sólo las usa el director: no se reescriben en cada paso.
      if (!pasos.some((p) => p.fase === "nuevo" && p.encargo && !p.escena && !p.fichaIntentada)) delete datos.vistas;
      return { hizo: true, datos, nota: `El director diseñó ${Math.min(pasos.length, pasos.filter((p) => p.fichaIntentada).length)} de ${pasos.length}.` };
    }
  }

  // 2. Lo barato: ¿terminaron los trabajos de cada pieza (y los de sus correcciones)?
  let cambio = false;
  const ids = [...new Set(pasos.flatMap((p) => [
    ...(p.fase === "generando" ? [p.trabajoId] : []),
    ...(p.fase === "opciones" ? (p.opciones ?? []).filter((o) => o.trabajoId && (o.fase === "recomponer" || o.fase === "corregir")).map((o) => o.trabajoId) : []),
  ]).filter(Boolean))];
  const trabajos = new Map((ids.length ? await acceso.leerVarios("estudio_trabajos", ["id", "estado", "archivos", "ajustes", "error"], "id", ids) : []).map((t) => [t.id, t]));
  for (const p of pasos.filter((x) => x.fase === "generando")) {
    const tr = trabajos.get(p.trabajoId);
    if (!tr) { p.fase = "fallido"; p.error = "El trabajo de esta pieza ya no existe."; cambio = true; continue; }
    if (estaVivo(tr.estado)) continue;
    const archivos = leerJSON(tr.archivos, []);
    if (tr.estado === "hecho" && archivos.length) {
      p.proporcion = leerJSON(tr.ajustes, {}).aspectRatio ?? "";
      p.opciones = archivos.map((aid) => ({ id: aid, fase: "revisar" }));
      p.fase = "opciones";
    } else {
      p.fase = "fallido";
      p.error = tr.error || "La pieza no salió.";
    }
    cambio = true;
  }

  // 3. Lo caro, UNA vez: lo primero de una imagen que espera algo, o la siguiente pieza si cabe.
  for (const p of pasos.filter((x) => x.fase === "opciones")) {
    for (const o of p.opciones) {
      if (o.fase === "hecho") continue;
      if (o.fase === "recomponer" || o.fase === "corregir") {
        const tr = trabajos.get(o.trabajoId);
        if (tr && estaVivo(tr.estado)) continue;
        const nueva = tr?.estado === "hecho" ? leerJSON(tr.archivos, [])[0] : null;
        await (o.fase === "recomponer" ? trasRecomponer(ctx, p, o, nueva) : trasCorregir(ctx, p, o, nueva));
        cerrarPieza(p);
        return { hizo: true };
      }
      if (o.fase === "revisar") {
        const caro = await revisar(ctx, p, o);
        cerrarPieza(p);
        if (caro) return { hizo: true };
        cambio = true;
        continue;
      }
      if (o.fase === "control") {
        await controlar(ctx, p, o);
        cerrarPieza(p);
        return { hizo: true };
      }
    }
    cerrarPieza(p);
  }

  if (pasos.filter(vivo).length < (datos.paralelo ?? 2)) {
    const siguiente = pasos.find((p) => p.fase === "nuevo");
    if (siguiente) {
      const r = await iniciar(ctx, siguiente);
      if (r?.presupuesto) return pararTodo(pasos, r.presupuesto);
      return { hizo: true };
    }
  }
  return { hizo: cambio };
}

/** Sin presupuesto, lo que falta fallaría igual: se para todo lo que no empezó. */
function pararTodo(pasos, mensaje) {
  for (const p of pasos) if (p.fase === "nuevo") { p.fase = "fallido"; p.error = mensaje; }
  return { hizo: true, nota: mensaje };
}

function cerrarPieza(p) {
  if (p.fase === "opciones" && p.opciones.every((o) => o.fase === "hecho")) p.fase = "hecho";
}

/** Pide UNA pieza: la mejora si no trae escena (ni ficha del director) y su trabajo. */
async function iniciar(ctx, p) {
  const { env, acceso, cliente, datos, usuario } = ctx;
  let escena = p.escena;
  if (!escena && datos.mejorar && p.mejora) {
    try {
      const r = await mejorarIdea(env, acceso, cliente, p.mejora);
      if (r?.idea) escena = String(r.idea);
    } catch (e) {
      if (e?.estado === 402) return { presupuesto: e.message };
    }
  }
  p.escena = escena || p.sinMejorar || "";
  try {
    const t = await crearTrabajo(env, acceso, cliente, {
      ...p.pedido, prompt: conEscena(p.pedido.prompt, p.escena), confirmado: true, ...(datos.carpetaId ? { carpetaId: datos.carpetaId } : {}),
    }, { usuario });
    p.trabajoId = t.id;
    p.fase = "generando";
  } catch (e) {
    p.fase = "fallido";
    p.error = e?.message || "No se pudo pedir la pieza.";
    if (e?.codigo === "presupuesto") return { presupuesto: p.error };
  }
  return null;
}

/** Un trabajo de edición sobre una imagen de la galería (recomponer o corregir), en su misma carpeta. */
async function pedirEdicion(ctx, archivo, { modelo, instruccion, proporcion, alta = false }) {
  const { prompt, medios } = pedidoDeCorreccion({ clave: archivo.clave, instruccion, modelo });
  const t = await crearTrabajo(ctx.env, ctx.acceso, ctx.cliente, {
    modelo: modelo.id, prompt, n: 1, ajustes: ajustesDe(modelo, { aspectRatio: proporcion, ...(alta ? { imageSize: "2K" } : {}) }, medios), medios,
    confirmado: true, ...(archivo.carpeta_id ? { carpetaId: archivo.carpeta_id } : {}),
  }, { usuario: ctx.usuario });
  return t.id;
}

/**
 * La red de seguridad de la proporción (la misma que `esperarArchivos` en el navegador): una imagen que no salió en la
 * pedida se RECOMPONE —con el modelo que la hizo si la respeta; si no, o si vuelve a salir mal, con el relevo—. Sin
 * eso, al control. → true si pidió algo (paso caro).
 */
async function revisar(ctx, p, o) {
  const a = await ctx.acceso.leerUno("estudio_archivos", { id: o.id });
  if (!a) { o.fase = "hecho"; return false; }
  const pedida = p.proporcion;
  if (a.tipo === "imagen" && pedida && fueraDeProporcion(a, pedida) && (o.intentos ?? 0) < 2) {
    const activos = activosDe(ctx.env);
    const propio = modeloPorId(a.modelo);
    const mismo = propio && activos[propio.motor] && propio.motor !== "prueba" && (propio.referencias ?? 0) >= 1 && respetaProporcion(propio, pedida, true) ? propio : null;
    const relevo = relevoPara(activos, pedida, 1);
    const m = (o.intentos ?? 0) === 0 ? (mismo ?? relevo) : (relevo && relevo.id !== o.conModelo ? relevo : null);
    if (m) {
      try {
        o.original ??= o.id;
        o.trabajoId = await pedirEdicion(ctx, a, { modelo: m, instruccion: pedidoDeRecomponer(pedida), proporcion: pedida, alta: true });
        o.conModelo = m.id;
        o.intentos = (o.intentos ?? 0) + 1;
        o.fase = "recomponer";
        return true;
      } catch { /* sin recomponer: sigue la que salió */ }
    }
  }
  o.fase = ctx.datos.controlar && p.controlar && a.tipo === "imagen" ? "control" : "hecho";
  return false;
}

async function trasRecomponer(ctx, p, o, nueva) {
  if (nueva) {
    const n = await ctx.acceso.leerUno("estudio_archivos", { id: nueva });
    // Si volvió a salir de otra medida, se prueba UNA vez con el relevo (desde la original), como en el navegador.
    if (n && fueraDeProporcion(n, p.proporcion) && (o.intentos ?? 0) < 2) {
      o.fase = "revisar";
      o.id = o.original;
      return;
    }
    if (n) o.id = nueva;
  }
  o.trabajoId = "";
  o.fase = ctx.datos.controlar && p.controlar ? "control" : "hecho";
}

/** El control de calidad y, si sólo falla lo corregible, UNA corrección editando la misma imagen. */
async function controlar(ctx, p, o) {
  let c = null;
  try {
    c = (await controlarPieza(ctx.env, ctx.acceso, ctx.cliente, o.id, { texto: p.texto || null }))?.control ?? null;
  } catch { /* sin control, la pieza sigue */ }
  o.control = c;
  if (!c || c.estado === "ok" || !c.corregible) { o.fase = "hecho"; return; }
  const a = await ctx.acceso.leerUno("estudio_archivos", { id: o.id });
  const proporcion = leerJSON(a?.ajustes, {}).aspectRatio ?? proporcionDeMedidas(a?.ancho, a?.alto);
  const m = a ? modeloParaCorregir(activosDe(ctx.env), a.modelo, proporcion) : null;
  const instruccion = correccionDelDirector(c, c.texto);
  if (!a || !m || !instruccion) { o.fase = "hecho"; return; }
  try {
    o.trabajoId = await pedirEdicion(ctx, a, { modelo: m, instruccion, proporcion });
    o.fase = "corregir";
  } catch {
    o.fase = "hecho";
  }
}

/** La corrección terminó: se controla contra la MISMA ficha y se queda la mejor (a igualdad, la original). */
async function trasCorregir(ctx, p, o, nueva) {
  o.fase = "hecho";
  o.trabajoId = "";
  if (!nueva || !o.control) return;
  try {
    const segundo = (await controlarPieza(ctx.env, ctx.acceso, ctx.cliente, nueva, { texto: o.control.texto ?? p.texto ?? null, ficha: o.control.ficha ?? null }))?.control;
    if (mejoro(o.control, segundo)) {
      o.descartada = o.id;
      o.id = nueva;
      o.control = segundo;
      o.corregida = true;
    }
  } catch { /* se queda la original */ }
}

// ------------------------------------------------------------
// Cancelar y lo que pone el navegador
// ------------------------------------------------------------

export async function cancelarEncargo(env, acceso, id) {
  const fila = await acceso.leerUno("estudio_encargos", { id });
  if (!fila) return null;
  if (fila.estado !== "en_marcha") return fila;
  const pasos = leerJSON(fila.pasos, []);
  for (const p of pasos) if (p.fase === "nuevo") { p.fase = "fallido"; p.error = "Se canceló."; }
  await acceso.actualizar("estudio_encargos", { id }, {
    estado: "cancelado", pasos: JSON.stringify(pasos), nota: "Se canceló: lo que ya estaba saliendo se queda en la galería.",
    terminado_at: ahora(), updated_at: ahora(), bloqueado_hasta: "",
  });
  const actual = await acceso.leerUno("estudio_encargos", { id });
  anunciar(env, acceso, actual);
  return actual;
}

/**
 * Lo que hizo el navegador con una pieza terminada (el texto de la plantilla encima, el logo estampado): las imágenes
 * que quedan como final de cada opción. Sólo ids de la galería de ESTE cliente.
 */
export async function finalesDePaso(env, acceso, cliente, id, pasoId, finales = []) {
  const fila = await acceso.leerUno("estudio_encargos", { id });
  if (!fila) return null;
  // Con el permiso, como un paso: si no, un paso que escribiera a la vez se llevaría lo de aquí (o al revés).
  const t = Date.now();
  if (fila.bloqueado_hasta && fila.bloqueado_hasta > new Date(t).toISOString()) return { ocupado: true };
  const permiso = new Date(t + 30_000).toISOString();
  if ((await acceso.actualizar("estudio_encargos", { id, bloqueado_hasta: fila.bloqueado_hasta }, { bloqueado_hasta: permiso })) !== 1) return { ocupado: true };
  const pasos = leerJSON(fila.pasos, []);
  const p = pasos.find((x) => x.id === pasoId);
  const lista = (Array.isArray(finales) ? finales : []).map((x) => (x ? String(x).slice(0, 80) : null)).slice(0, 3);
  if (p) {
    const existen = new Set((await acceso.leerVarios("estudio_archivos", ["id"], "id", lista.filter(Boolean), { client_id: cliente.id })).map((a) => a.id));
    p.finales = lista.map((x) => (x && existen.has(x) ? x : null));
  }
  await acceso.actualizar("estudio_encargos", { id, bloqueado_hasta: permiso }, { pasos: JSON.stringify(pasos), bloqueado_hasta: "" });
  return p ? { encargo: await acceso.leerUno("estudio_encargos", { id }) } : null;
}
