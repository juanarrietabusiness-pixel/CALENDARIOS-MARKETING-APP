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
//   1. el director de arte, una llamada por pieza (la primera sola, luego de 3 en 3, mientras se crean las listas);
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
// (`finales` de cada paso). Si el director escoge una plantilla del kit, su
// imagen se suma aquí al pedido (`conPlantillaDelDirector`), como en la pantalla.
// ============================================================

import { uuid } from "../ids.js";
import { difundir } from "../vivo.js";
import { despertar } from "../despertar.js";
import { crearTrabajo, ErrorEstudio } from "./trabajos.js";
import { estadoMotores } from "./motores.js";
import { fichasDeDiseno, limpiarVistas } from "./fichas.js";
import { mejorarIdea } from "./prompt.js";
import { controlarPieza, sistemaDePortada } from "./control.js";
import { propuestaDeCarrusel } from "./carrusel.js";
import { ordenarCarpeta, archivoPublico } from "./galeria.js";
import {
  modeloPorId, MAX_PROMPT, ajustesDe, fueraDeProporcion, respetaProporcion, relevoPara, pedidoDeRecomponer, estaVivo,
} from "../../../src/lib/estudioCatalogo.js";
import { pedidoDeCorreccion, modeloParaCorregir, proporcionDeMedidas } from "../../../src/lib/edicion.js";
import { correccionDelDirector, mejoro } from "../../../src/lib/control.js";
import { armarLamina } from "../../../src/lib/laminaPedido.js";
import { ESCENA, MAX_PASOS, MAX_LAMINAS, TANDA_FICHAS, TIPOS_ENCARGO } from "../../../src/lib/encargos.js";
import { referenciaDePlantilla, lineaDePlantillaEnPedido } from "../../../src/lib/kitMarca.js";
import { lineaDeReferencia } from "../../../src/lib/referencias.js";
import { kitDe } from "./kit.js";

/**
 * La plantilla del kit que escogió el DIRECTOR (o la de su tipo) en el pedido de una pieza, como lo hace la pantalla
 * (`pedidoDeLote`): su imagen de referencia —sólo por su diseño—, con su línea, y el sistema escrito detrás. Si la
 * pieza ya llevaba una plantilla, si la imagen no cabe en el modelo o si la plantilla ya no está, el pedido no cambia
 * (la ficha del director ya la describe). Pura.
 */
export function conPlantillaDelDirector(pedido, kitGuardado, id) {
  const ref = id ? referenciaDePlantilla(kitGuardado, id) : null;
  const linea = id ? lineaDePlantillaEnPedido(kitGuardado, id) : "";
  if (!ref || !pedido || String(pedido.prompt ?? "").includes("Sigue el diseño de la plantilla")) return pedido;
  const actuales = Array.isArray(pedido.medios?.reference) ? pedido.medios.reference : [];
  if (actuales.includes(ref.clave)) return pedido;
  const cabe = modeloPorId(pedido.modelo)?.referencias ?? 0;
  if (actuales.length >= cabe) return pedido;
  const reference = [...actuales, ref.clave];
  const lineas = [linea, lineaDeReferencia(ref, reference.length)].filter(Boolean).join("\n");
  return { ...pedido, prompt: `${pedido.prompt}\n${lineas}`, medios: { ...(pedido.medios ?? {}), reference } };
}

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

const objeto = (o, max) => (o && typeof o === "object" && !Array.isArray(o) && JSON.stringify(o).length <= max ? o : null);
const clave = (v) => texto(v, 300);

/** Lo que hay que hacer en la PANTALLA con una pieza ya hecha (necesita lienzo): el texto de la plantilla, el logo. */
function limpiarNavegador(n) {
  if (!n || typeof n !== "object") return null;
  const plantilla = n.plantilla && typeof n.plantilla === "object"
    ? { texto: texto(n.plantilla.texto, 600), plantilla: texto(n.plantilla.plantilla, 30), nombre: texto(n.plantilla.nombre, 60) }
    : null;
  return plantilla || n.logo === true ? { plantilla, logo: n.logo === true } : null;
}

/** Una lámina de carrusel (la del guion o la de la propuesta del director). */
function limpiarLamina(l, i) {
  if (!l || typeof l !== "object") return null;
  return {
    n: Math.max(1, Math.floor(Number(l.n)) || i + 1), texto: texto(l.texto, 600), rol: texto(l.rol, 20),
    ficha: texto(l.ficha, 3000), escena: texto(l.escena, 600), composicion: texto(l.composicion, 300),
  };
}

const PASO_VACIO = () => ({ fase: "nuevo", trabajoId: "", opciones: [], error: "" });

/** Lo que el navegador manda de UNA pieza del lote, limpio. El pedido lo valida `crearTrabajo` al usarlo. */
function limpiarPaso(p, i) {
  if (!p || typeof p !== "object" || !p.pedido || typeof p.pedido !== "object") return null;
  const pedido = {
    modelo: texto(p.pedido.modelo, 80), prompt: texto(p.pedido.prompt, MAX_PROMPT + 40),
    n: Math.max(1, Math.min(3, Math.floor(Number(p.pedido.n)) || 1)),
    ajustes: p.pedido.ajustes && typeof p.pedido.ajustes === "object" ? p.pedido.ajustes : {},
    medios: p.pedido.medios && typeof p.pedido.medios === "object" ? p.pedido.medios : {},
    // La publicación a la que va (la pieza queda unida a ella en la galería, como al pedirla a mano).
    ...(p.pedido.calendarId && p.pedido.postId ? { calendarId: texto(p.pedido.calendarId, 80), postId: texto(p.pedido.postId, 80) } : {}),
  };
  if (!pedido.modelo || !pedido.prompt) return null;
  return {
    id: texto(p.id, 80) || `p${i + 1}`, titulo: texto(p.titulo, 140), pedido,
    encargo: objeto(p.encargo, 6000), mejora: objeto(p.mejora, 6000),
    escena: texto(p.escena, 4000), sinMejorar: texto(p.sinMejorar, 4000), texto: texto(p.texto, 600),
    controlar: p.controlar === true, navegador: limpiarNavegador(p.navegador),
    ...PASO_VACIO(),
  };
}

/** Una lámina como paso: lo que la pantalla pone encima lo decide el encargo (plantilla, logo estampado). */
function pasoDeLamina(l, i, datos) {
  const lamina = limpiarLamina(l, i);
  if (!lamina) return null;
  const c = datos.comun ?? {};
  return {
    id: `l${lamina.n}`, titulo: `Lámina ${lamina.n}`, lamina, texto: lamina.texto,
    controlar: Boolean(datos.controlar) && c.modo !== "plantilla",
    navegador: limpiarNavegador({
      plantilla: c.modo === "plantilla" ? { texto: lamina.texto, plantilla: c.plantilla, nombre: `lamina-${lamina.n}` } : null,
      logo: datos.logoEstampado === true,
    }),
    ...PASO_VACIO(),
  };
}

/** Lo común a todas las láminas de un carrusel (lo que `crearLamina` recibe en la pantalla). */
function limpiarComun(c = {}) {
  const lista = (v, max) => (Array.isArray(v) ? v : []).slice(0, max);
  const persona = (p) => (p && typeof p === "object" && p.clave ? { clave: clave(p.clave), nota: texto(p.nota, 200) } : null);
  return {
    modelo: texto(c.modelo, 80), idea: texto(c.idea, 400), preset: texto(c.preset, 3000),
    modo: c.modo === "plantilla" ? "plantilla" : "ia", plantilla: texto(c.plantilla, 30) || "banda", hilo: texto(c.hilo, 600),
    personajes: lista(c.personajes, 4).map(persona).filter(Boolean), tipografia: persona(c.tipografia),
    fotos: lista(c.fotos, 6).map(clave).filter(Boolean), logo: clave(c.logo),
    calendarId: c.calendarId ? texto(c.calendarId, 80) : null, postId: c.postId ? texto(c.postId, 80) : null,
  };
}

export function encargoPublico(f, { conPedidos = false } = {}) {
  if (!f) return null;
  const pasos = leerJSON(f.pasos, []).map((p) => (conPedidos ? p : {
    id: p.id, titulo: p.titulo, fase: p.fase, error: p.error, trabajoId: p.trabajoId, escena: p.escena, deDirector: Boolean(p.deDirector),
    opciones: (p.opciones ?? []).map((o) => ({ id: o.id, fase: o.fase, control: o.control ?? null, corregida: Boolean(o.corregida) })),
    finales: p.finales ?? null, navegador: p.navegador ?? null, ...(p.lamina ? { lamina: p.lamina } : {}),
  }));
  return {
    id: f.id, clientId: f.client_id, tipo: f.tipo, titulo: f.titulo, estado: f.estado, pasos, nota: f.nota, error: f.error,
    creadoPor: f.creado_por, creado: f.created_at, actualizado: f.updated_at, terminado: f.terminado_at,
    // El sistema de la portada (lo siguen las demás láminas): la pantalla lo usa para rehacer una sola.
    ...(f.tipo === "carrusel" ? { sistema: leerJSON(f.datos, {}).sistema ?? null } : {}),
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
  const datos = {
    mejorar: tipo === "lote" && cuerpo.mejorar !== false, controlar: cuerpo.controlar === true,
    // Un carrusel va en ORDEN: cada lámina lleva la anterior de referencia.
    paralelo: tipo === "carrusel" ? 1 : Math.max(1, Math.min(3, Math.floor(Number(cuerpo.paralelo)) || 2)),
    carpetaId: cuerpo.carpetaId ? texto(cuerpo.carpetaId, 80) : null,
    vistas: limpiarVistas(cuerpo.vistas), concepto: "",
  };
  let pasos;
  if (tipo === "carrusel") {
    datos.comun = limpiarComun(cuerpo.comun);
    if (!datos.comun.modelo) throw new ErrorEstudio("Falta el modelo de las láminas.", 400);
    datos.logoEstampado = cuerpo.logoEstampado === true;
    datos.conSistema = cuerpo.conSistema !== false;
    datos.sistema = objeto(cuerpo.sistema, 4000);
    datos.previas = { portada: clave(cuerpo.previas?.portada), anterior: clave(cuerpo.previas?.anterior) };
    // Con `propuesta`, el director diseña la serie AQUÍ (en el servidor) antes de la primera lámina; `laminas` queda
    // de respaldo por si no responde.
    datos.propuesta = objeto(cuerpo.propuesta, 8000);
    const laminas = (Array.isArray(cuerpo.laminas) ? cuerpo.laminas : []).slice(0, MAX_LAMINAS);
    if (datos.propuesta) { datos.respaldo = laminas.map(limpiarLamina).filter(Boolean); pasos = []; } else pasos = laminas.map((l, i) => pasoDeLamina(l, i, datos)).filter(Boolean);
    datos.total = Math.max(1, Math.floor(Number(cuerpo.total)) || pasos.length || datos.respaldo?.length || 1);
    if (!pasos.length && !datos.propuesta) throw new ErrorEstudio("El carrusel no trae ninguna lámina.", 400);
  } else {
    pasos = (Array.isArray(cuerpo.pasos) ? cuerpo.pasos : []).slice(0, MAX_PASOS).map(limpiarPaso).filter(Boolean);
    if (!pasos.length) throw new ErrorEstudio("El encargo no trae ninguna pieza.", 400);
    const ids = new Set();
    for (const p of pasos) { if (ids.has(p.id)) p.id = `${p.id}-${ids.size}`; ids.add(p.id); }
  }
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
/** ¿Esta pieza ya se puede pedir? Con su escena, sin director que esperar, o con el director ya intentado (va la mejora). */
const listaParaCrear = (p, datos) => Boolean(p.escena) || !datos.mejorar || !p.encargo || Boolean(p.fichaIntentada);
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
  const listos = pasos.length > 0 && pasos.every(terminado);
  // Un carrusel terminado queda ORDENADO en su carpeta (la galería lo enseña como una tarjeta, en este orden). Si la
  // pantalla pone después el texto de la plantilla, vuelve a ordenarlo con las finales.
  if (listos && r.estado == null && fila.tipo === "carrusel" && datos.carpetaId) {
    const orden = pasos.filter((p) => p.fase === "hecho").map((p) => p.finales?.[0] ?? p.opciones?.[0]?.id).filter(Boolean);
    await ordenarCarpeta(acceso, fila.client_id, datos.carpetaId, orden).catch(() => null);
  }
  const estado = r.estado ?? (listos ? (pasos.every((p) => p.fase === "fallido") ? "fallido" : "hecho") : "en_marcha");
  const cambios = {
    bloqueado_hasta: "", updated_at: ahora(), pasos: JSON.stringify(pasos), datos: JSON.stringify(datos),
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
  const ctx = { env, acceso, cliente, datos, tipo: fila.tipo, pasos, usuario: fila.creado_por ? { id: fila.creado_por } : null };

  // 0. Un carrusel con PROPUESTA: el director diseña la serie (las fichas de cada lámina y lo que comparten) primero.
  if (fila.tipo === "carrusel" && datos.propuesta && !datos.propuestaHecha) {
    datos.propuestaHecha = true;
    let laminas = null;
    try {
      const r = await propuestaDeCarrusel(env, acceso, cliente, { ...datos.propuesta, vistas: datos.vistas ?? [] });
      if (r?.laminas?.length) {
        laminas = r.laminas;
        if (r.hilo) datos.comun.hilo = texto(r.hilo, 600);
      }
    } catch (e) {
      if (e?.estado === 402) return { hizo: true, estado: "fallido", error: e.message };
    }
    delete datos.vistas;
    pasos.push(...(laminas ?? datos.respaldo ?? []).slice(0, MAX_LAMINAS).map((l, i) => pasoDeLamina(l, i, datos)).filter(Boolean));
    datos.total = pasos.length || datos.total;
    if (!pasos.length) return { hizo: true, estado: "fallido", error: "El director no propuso láminas y no había guion de respaldo." };
    return { hizo: true, nota: `El director diseñó ${pasos.length} láminas.` };
  }

  // 1. El director de arte: CADA pieza en su llamada, pensada entera. La primera va sola y fija el concepto de la serie;
  //    después, de TANDA_FICHAS en TANDA_FICHAS a la vez, con ese concepto y las ya diseñadas delante. Mientras quedan
  //    piezas listas para crear y hay sitio, se crean primero: el director sigue en el paso siguiente.
  if (datos.mejorar) {
    const faltan = pasos.filter((p) => p.fase === "nuevo" && p.encargo && !p.escena && !p.fichaIntentada);
    const listas = pasos.filter((p) => p.fase === "nuevo" && listaParaCrear(p, datos));
    const hayHueco = pasos.filter(vivo).length < (datos.paralelo ?? 2);
    if (faltan.length && !(listas.length && hayHueco)) {
      const tanda = faltan.slice(0, datos.concepto ? TANDA_FICHAS : 1);
      try {
        const r = await fichasDeDiseno(env, acceso, cliente, {
          concepto: datos.concepto ?? "", vistas: datos.vistas ?? [], previas: datos.serie ?? [], serie: pasos.length,
          piezas: tanda.map((p, j) => ({ n: j + 1, ...p.encargo })),
        });
        datos.concepto ||= String(r?.concepto ?? "");
        const kit = tanda.some((_, j) => r?.fichas?.[j + 1]?.plantilla) ? kitDe(cliente) : null;
        tanda.forEach((p, j) => {
          const f = r?.fichas?.[j + 1];
          if (!f?.ficha) return;
          p.escena = String(f.ficha);
          p.deDirector = true;
          // La plantilla que escogió el director: su imagen va de referencia, como en la pantalla.
          if (f.plantilla && kit) p.pedido = conPlantillaDelDirector(p.pedido, kit, f.plantilla);
        });
        // Lo que ya diseñó de la serie (corto): lo ven las siguientes para no repetir composición.
        datos.serie = [...(datos.serie ?? []), ...tanda.filter((p) => p.deDirector).map((p) => texto(p.escena, 700))].slice(-2);
      } catch (e) {
        if (e?.codigo === "presupuesto" || e?.estado === 402) return pararTodo(pasos, e.message);
        // Sin ficha, cada pieza se diseña sola al crearla (la mejora).
      }
      for (const p of tanda) p.fichaIntentada = true;
      // Las vistas sólo las usa el director: no se reescriben en cada paso.
      if (!pasos.some((p) => p.fase === "nuevo" && p.encargo && !p.escena && !p.fichaIntentada)) { delete datos.vistas; delete datos.serie; }
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

  // El SISTEMA DE DISEÑO de la portada, antes de la segunda lámina: las demás lo reciben en su pedido y en su control.
  if (fila.tipo === "carrusel" && datos.conSistema && datos.comun?.modo !== "plantilla" && !datos.sistema && !datos.sistemaIntentado) {
    const portada = pasos[0];
    if (portada?.fase === "hecho" && portada.opciones?.[0]?.id && pasos.some((p) => p.fase === "nuevo")) {
      datos.sistemaIntentado = true;
      try {
        datos.sistema = (await sistemaDePortada(env, acceso, cliente, portada.opciones[0].id, { texto: portada.lamina?.texto ?? "" }))?.sistema ?? null;
      } catch { /* sin sistema, las láminas siguen con la portada de referencia */ }
      return { hizo: true };
    }
  }

  if (pasos.filter(vivo).length < (datos.paralelo ?? 2)) {
    // La siguiente que ya tiene su diseño (o no lo espera): una que aún espera al director no se pide sin él.
    const siguiente = pasos.find((p) => p.fase === "nuevo" && (fila.tipo === "carrusel" || listaParaCrear(p, datos)));
    if (siguiente) {
      const r = fila.tipo === "carrusel" ? await iniciarLamina(ctx, siguiente) : await iniciar(ctx, siguiente);
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
  if (p.fase !== "opciones" || !p.opciones.every((o) => o.fase === "hecho")) return;
  p.fase = "hecho";
  // Sin nada que poner encima en la pantalla, la final ES la que salió.
  if (!p.navegador) p.finales = p.opciones.map((o) => o.id);
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

/**
 * Pide UNA lámina, en orden: la anterior y la portada (las CRUDAS ya hechas) de referencia, y el sistema de la portada
 * en el pedido. El pedido sale de `armarLamina`, el mismo que usa la pantalla.
 */
async function iniciarLamina(ctx, p) {
  const { env, acceso, cliente, datos, usuario, pasos } = ctx;
  const c = datos.comun;
  const modelo = modeloPorId(c.modelo);
  if (!modelo) { p.fase = "fallido"; p.error = "Ese modelo ya no está en el Estudio."; return null; }
  const antes = pasos.slice(0, pasos.indexOf(p)).filter((x) => x.fase === "hecho" && x.opciones?.[0]?.clave);
  const anterior = antes.at(-1)?.opciones[0].clave || datos.previas?.anterior || "";
  const delPrimero = pasos[0] !== p && pasos[0]?.fase === "hecho" ? pasos[0].opciones?.[0]?.clave : "";
  const portada = (delPrimero || datos.previas?.portada || "") === anterior ? "" : (delPrimero || datos.previas?.portada || "");
  const pedido = armarLamina({
    modelo, activos: activosDe(env), lamina: p.lamina, total: datos.total ?? pasos.length, idea: c.idea, preset: c.preset,
    modo: c.modo, plantilla: c.plantilla, hilo: c.hilo, personajes: c.personajes, tipografia: c.tipografia, fotos: c.fotos,
    logo: c.logo, anterior, portada, sistema: datos.sistema ?? null,
  });
  try {
    const t = await crearTrabajo(env, acceso, cliente, {
      ...pedido, confirmado: true, ...(datos.carpetaId ? { carpetaId: datos.carpetaId } : {}),
      ...(c.calendarId && c.postId ? { calendarId: c.calendarId, postId: c.postId } : {}),
    }, { usuario });
    p.trabajoId = t.id;
    p.fase = "generando";
  } catch (e) {
    p.fase = "fallido";
    p.error = e?.message || "No se pudo pedir la lámina.";
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
  o.clave = a.clave;
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
    if (n) { o.id = nueva; o.clave = n.clave; }
  }
  o.trabajoId = "";
  o.fase = ctx.datos.controlar && p.controlar ? "control" : "hecho";
}

/** El control de calidad y, si sólo falla lo corregible, UNA corrección editando la misma imagen. */
async function controlar(ctx, p, o) {
  let c = null;
  try {
    c = (await controlarPieza(ctx.env, ctx.acceso, ctx.cliente, o.id, {
      texto: p.texto || null, sistema: ctx.tipo === "carrusel" && p.lamina?.n > 1 ? ctx.datos.sistema ?? null : null,
    }))?.control ?? null;
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
    const r = await controlarPieza(ctx.env, ctx.acceso, ctx.cliente, nueva, { texto: o.control.texto ?? p.texto ?? null, ficha: o.control.ficha ?? null });
    const segundo = r?.control;
    if (mejoro(o.control, segundo)) {
      o.descartada = o.id;
      o.id = nueva;
      o.clave = r?.archivo?.clave ?? o.clave;
      o.control = segundo;
      o.corregida = true;
    }
  } catch { /* se queda la original */ }
}

// ------------------------------------------------------------
// Cancelar y lo que pone el navegador
// ------------------------------------------------------------

/** Lo que `archivoPublico` lee de una ficha de la galería (para pedir varias por id sin `select *`). */
export const COLUMNAS_ARCHIVO = [
  "id", "clave", "tipo", "mime", "ancho", "alto", "bytes", "prompt", "modelo", "ajustes", "trabajo_id", "carpeta_id",
  "origen", "costo", "favorito", "subido", "usado_en", "borrado_at", "created_at",
];

/** Un encargo como lo ve la pantalla, con las imágenes que ya salieron (las de sus opciones y sus finales). */
export async function encargoConArchivos(acceso, fila) {
  const e = encargoPublico(fila);
  const ids = [...new Set(e.pasos.flatMap((p) => [...p.opciones.map((o) => o.id), ...(p.finales ?? [])]).filter(Boolean))];
  const archivos = ids.length ? await acceso.leerVarios("estudio_archivos", COLUMNAS_ARCHIVO, "id", ids, { client_id: fila.client_id }) : [];
  return { encargo: e, archivos: archivos.map(archivoPublico) };
}

/**
 * Lo que el servidor terminó y espera a la PANTALLA (el texto de la plantilla, el logo estampado): de toda la agencia,
 * de los últimos 7 días. Lo pide la aplicación al abrirse.
 */
export async function encargosPorTerminar(acceso) {
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const filas = (await acceso.leer("estudio_encargos", {}, "updated_at desc", 30)).filter((f) => f.updated_at >= desde);
  const pendientes = filas.filter((f) => leerJSON(f.pasos, []).some((p) => p.fase === "hecho" && p.navegador && !p.finales));
  return Promise.all(pendientes.slice(0, 10).map((f) => encargoConArchivos(acceso, f)));
}

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
