// ============================================================
// «MEJORAR MI VIDEO» y «VARIOS ÁNGULOS DE UNA TOMA» en el servidor (lo puro: src/lib/mejoraVideo.js)
//
//   crearMejora     Comprueba el video (de ESE cliente, en la galería), lo mide, arma el plan, pregunta el costo (409:
//                   video pregunta siempre) y lo guarda como un encargo de tipo «mejora»: un paso por video que hace el
//                   modelo, que lleva el encargo como cualquier lote (cada uno es un trabajo del Estudio).
//   pasoUnion       Cuando terminaron todos los pasos, encarga la UNIÓN al Durable Object del render (su alarma tiene 15
//                   minutos y su Container 2 vCPU) y en los pasos siguientes mira si terminó. El encargo no se cierra
//                   hasta saberlo: si la unión falla, queda «hecho» con lo que hizo el modelo y el motivo.
//   ejecutarUnion   Lo que hace la alarma: sube los clips al Container por flujo, pide `/unir` (la imagen nueva con el
//                   AUDIO ORIGINAL; container/unir.mjs), guarda el mp4 en R2 por flujo y lo deja en la galería como
//                   VERSIÓN del video original (`ajustes.deArchivo`).
//
// Lo que se pide a Kie no se ha probado todavía contra el servicio real; la unión, sí, con ffmpeg (probarUnir.mjs).
// ============================================================

import { uuid, ahora } from "../ids.js";
import { crearAcceso } from "../acceso.js";
import { ErrorEstudio } from "./trabajos.js";
import { estadoMotores } from "./motores.js";
import { bloqueoPorPresupuesto } from "../configIA.js";
import { sondearEnR2 } from "./sonda.js";
import { subirClips } from "./cuadros.js";
import { guardarMp4, esCorteDelContainer } from "./render.js";
import { claveDeArchivo, claveDelCliente } from "./archivos.js";
import { planDeMejora, NOMBRE_MODO } from "../../../src/lib/mejoraVideo.js";
import { textoCosto } from "../../../src/lib/estudioCatalogo.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) ?? d : (t ?? d); } catch { return d; } };
/** Cuánto se espera a la unión antes de darla por perdida (el objeto murió a la mitad). */
export const PLAZO_UNION_MS = 20 * 60_000;

/**
 * El video de la galería de ESE cliente (por su id o, desde una publicación, por su clave o su dirección /api/media/…)
 * → la fila, medida. Lanza ErrorEstudio si no sirve.
 */
async function videoDelCliente(env, acceso, cliente, archivoId, claveOSrc = "") {
  const id = String(archivoId ?? "").slice(0, 80);
  const clave = !id && claveOSrc ? claveDelCliente(claveOSrc, cliente.id) : null;
  const a = id ? await acceso.leerUno("estudio_archivos", { id, client_id: cliente.id })
    : clave ? await acceso.leerUno("estudio_archivos", { client_id: cliente.id, clave }) : null;
  if (!a || a.borrado_at) throw new ErrorEstudio("Ese video no está en la galería de este cliente.", 404);
  if (a.tipo !== "video") throw new ErrorEstudio("Eso no es un video: «Mejorar» es para videos de la galería.", 400);
  const ajustes = leerJSON(a.ajustes, {});
  let duracion = Number(ajustes.duracion) || 0;
  let ancho = Number(a.ancho) || 0;
  let alto = Number(a.alto) || 0;
  if (!duracion || !ancho || !alto) {
    // Un MOV es la misma lista de cajas que un MP4: se mide igual.
    const m = await sondearEnR2(env, a.clave, "video/mp4", Number(a.bytes) || 0);
    duracion ||= m.duracion; ancho ||= m.ancho; alto ||= m.alto;
  }
  return { fila: a, video: { clave: a.clave, ancho, alto, duracion, bytes: Number(a.bytes) || 0 } };
}

/** Las fotos de referencia (ids de la galería de ESE cliente) → sus claves. */
async function clavesDeFotos(acceso, cliente, ids = []) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x).slice(0, 80)).filter(Boolean))].slice(0, 3);
  if (!lista.length) return [];
  const filas = await acceso.leerVarios("estudio_archivos", ["id", "clave", "tipo", "borrado_at"], "id", lista, { client_id: cliente.id });
  const buenas = filas.filter((f) => f.tipo === "imagen" && !f.borrado_at);
  if (buenas.length !== lista.length) throw new ErrorEstudio("Una de las fotos de referencia no está en la galería de este cliente.", 400);
  return lista.map((id) => buenas.find((f) => f.id === id).clave);
}

/**
 * El plan y su costo SIN crear nada (para que la pantalla y Claude lo enseñen antes). → { plan, video }.
 * `cuerpo`: { archivoId (o clave), modo, look?, instruccion?, angulos?, referencias? (ids), factor? }.
 */
export async function planDelVideo(env, acceso, cliente, cuerpo = {}) {
  const { fila, video } = await videoDelCliente(env, acceso, cliente, cuerpo.archivoId, cuerpo.clave);
  const referencias = cuerpo.modo === "cambiar" ? await clavesDeFotos(acceso, cliente, cuerpo.referencias) : [];
  const activos = Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, Boolean(v.activo)]));
  const plan = planDeMejora({ ...cuerpo, referencias, video, activos });
  if (!plan.ok) throw new ErrorEstudio(plan.error, 400);
  return { plan, video, fila };
}

/**
 * Crea la mejora (un encargo «mejora»). Sin `confirmado: true`, 409 con el costo: un video pregunta SIEMPRE.
 * → la fila del encargo.
 */
export async function crearMejora(env, acceso, cliente, cuerpo = {}, { usuario = null, crearEncargo } = {}) {
  const { plan, fila } = await planDelVideo(env, acceso, cliente, cuerpo);
  if (cuerpo.confirmado !== true) {
    throw new ErrorEstudio(`${plan.resumen} Confírmalo para seguir.`, 409, {
      codigo: "confirmar", costo: plan.costo, resumen: plan.resumen, aviso: plan.aviso ?? null,
    });
  }
  if (plan.costo > 0) {
    const bloqueo = await bloqueoPorPresupuesto(acceso);
    if (bloqueo) throw new ErrorEstudio(bloqueo, 402, { codigo: "presupuesto" });
  }
  return crearEncargo(env, acceso, cliente, {
    tipo: "mejora", titulo: `${plan.titulo} · ${String(fila.prompt || "video").slice(0, 80)}`,
    pasos: plan.pasos, carpetaId: fila.carpeta_id ?? null, seguido: cuerpo.seguido === true,
    ...(["asistente", "claude"].includes(cuerpo.origen) ? { origen: cuerpo.origen } : {}),
    mejora: { modo: plan.modo, archivoId: fila.id, costo: plan.costo, resumen: plan.resumen, aviso: plan.aviso ?? null, union: { fase: "nuevo", ...plan.union } },
  }, { usuario, interno: true });
}

/** Lo de la mejora que guarda el encargo, limpio (lo arma `crearMejora`, nunca el navegador). */
export function limpiarMejora(m) {
  if (!m || typeof m !== "object" || !NOMBRE_MODO[m.modo] || !m.archivoId) return null;
  const tramos = (Array.isArray(m.union?.tramos) ? m.union.tramos : []).slice(0, 12).map((t) => ({
    fuente: t.fuente === "original" ? "original" : Math.max(0, Math.floor(Number(t.fuente)) || 0),
    desde: Math.max(0, Number(t.desde) || 0), hasta: Math.max(0, Number(t.hasta) || 0),
  })).filter((t) => t.hasta > t.desde);
  return {
    modo: m.modo, archivoId: String(m.archivoId).slice(0, 80), costo: Number(m.costo) || 0,
    resumen: String(m.resumen ?? "").slice(0, 600), aviso: m.aviso ? String(m.aviso).slice(0, 400) : null,
    union: { fase: "nuevo", tramos, copiar: m.union?.copiar !== false },
  };
}

/** ¿Ya se sabe cómo acabó la unión? */
export const unionTerminada = (datos = {}) => !datos.mejora || ["hecho", "fallido"].includes(datos.mejora.union?.fase);

/** Lo de la mejora que ve la pantalla. */
export function mejoraPublica(datos = {}) {
  const m = datos.mejora;
  if (!m) return null;
  const u = m.union ?? {};
  return {
    modo: m.modo, archivoId: m.archivoId, costo: m.costo, resumen: m.resumen, aviso: m.aviso,
    union: { fase: u.fase ?? "nuevo", archivoId: u.archivoId ?? null, error: u.error ?? "" },
  };
}

const stubDeUnion = (env, encargoId) => env.RENDER.get(env.RENDER.idFromName(`mejora-${encargoId}`));

/**
 * El paso de la UNIÓN del encargo (lo llama `paso` de encargos.js cuando ya no queda nada por pedir). → { hizo, nota } o
 * null si no le toca. Lo que cambia se queda en `datos.mejora.union` (lo escribe avanzarEncargo).
 */
export async function pasoUnion(ctx, fila) {
  const { env, datos, pasos } = ctx;
  const m = datos.mejora;
  if (!m || unionTerminada(datos)) return null;
  if (!pasos.every((p) => p.fase === "hecho" || p.fase === "fallido")) return null;
  const u = m.union;
  const hechos = pasos.filter((p) => p.fase === "hecho" && p.opciones?.[0]?.id);
  if (!hechos.length) { m.union = { ...u, fase: "fallido", error: "No salió ningún video que unir." }; return { hizo: true }; }
  if (!env.RENDER) {
    m.union = { ...u, fase: "fallido", error: "Sin el Container del render no se pudo poner el audio original: quedó el video con el sonido del modelo." };
    return { hizo: true };
  }
  if (u.fase === "nuevo") {
    const intento = uuid();
    try {
      const r = await stubDeUnion(env, fila.id).fetch(new Request("https://render/unir", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: ctx.acceso.ownerId, clienteId: fila.client_id, encargoId: fila.id, intento }),
      }));
      if (!r.ok) throw new Error(`respondió ${r.status}`);
    } catch (e) {
      m.union = { ...u, fase: (u.vueltas ?? 0) >= 2 ? "fallido" : "nuevo", vueltas: (u.vueltas ?? 0) + 1, error: `No se pudo encargar la unión: ${e?.message ?? e}` };
      return { hizo: true };
    }
    m.union = { ...u, fase: "uniendo", intento, desde: ahora(), vueltas: (u.vueltas ?? 0) + 1, error: "" };
    return { hizo: true, nota: "Uniendo con el audio original…" };
  }
  // Uniendo: ¿terminó?
  let r = null;
  try {
    const resp = await stubDeUnion(env, fila.id).fetch(new Request(`https://render/unir?intento=${encodeURIComponent(u.intento)}`));
    r = resp.ok ? await resp.json() : null;
  } catch { r = null; }
  if (r?.estado === "hecho") {
    m.union = { ...u, fase: "hecho", archivoId: r.archivoId, error: "" };
    return { hizo: true, nota: "Listo, con el audio original." };
  }
  if (r?.estado === "fallido") {
    const otra = r.corte && (u.vueltas ?? 1) < 2;
    m.union = { ...u, fase: otra ? "nuevo" : "fallido", error: r.error || "No se pudo unir con el audio original." };
    return { hizo: true };
  }
  if (Date.now() - Date.parse(u.desde) > PLAZO_UNION_MS) {
    m.union = { ...u, fase: "fallido", error: "La unión con el audio original tardó demasiado: quedó el video con el sonido del modelo." };
    return { hizo: true };
  }
  return null;
}

/** La clave del archivo de cada paso hecho (su primera opción), por índice de paso. */
async function clipsDePasos(acceso, clienteId, pasos) {
  const ids = pasos.map((p) => (p.fase === "hecho" ? p.opciones?.[0]?.id : null));
  const filas = await acceso.leerVarios("estudio_archivos", ["id", "clave", "tipo"], "id", ids.filter(Boolean), { client_id: clienteId });
  return ids.map((id) => filas.find((f) => f.id === id && f.tipo === "video") ?? null);
}

/**
 * La UNIÓN, en la alarma del Durable Object del render (worker/contenedor.js). `pedir(ruta, init)`: al Container, crudo.
 * → { estado: "hecho", archivoId } | { estado: "fallido", error, corte }.
 */
export async function ejecutarUnion(env, { ownerId, clienteId, encargoId }, pedir) {
  const acceso = crearAcceso(env.DB, ownerId);
  try {
    const encargo = await acceso.leerUno("estudio_encargos", { id: encargoId, client_id: clienteId });
    const datos = leerJSON(encargo?.datos, {});
    const m = datos.mejora;
    if (!encargo || encargo.tipo !== "mejora" || !m) throw new Error("La mejora ya no existe.");
    const pasos = leerJSON(encargo.pasos, []);
    const original = await acceso.leerUno("estudio_archivos", { id: m.archivoId, client_id: clienteId });
    if (!original || original.tipo !== "video") throw new Error("El video original ya no está en la galería.");
    const clips = await clipsDePasos(acceso, clienteId, pasos);
    // Un ángulo que no salió deja su tramo al original; en un solo tramo, sin el video nuevo no hay nada que unir.
    const tramos = (m.union?.tramos ?? []).map((t) => {
      const c = t.fuente === "original" ? original : clips[t.fuente];
      return { clip: (c ?? original).id, desde: t.desde, hasta: t.hasta };
    });
    if (!tramos.length || (m.union?.copiar !== false && !clips.some(Boolean))) throw new Error("No salió ningún video que unir.");
    const subir = [original, ...clips.filter(Boolean)].filter((c, i, l) => l.findIndex((x) => x.id === c.id) === i);
    const fallaron = await subirClips(env, subir.map((c) => ({ id: c.id, clave: c.clave })), pedir);
    if (fallaron.length) throw new Error(`No se pudo cargar ${fallaron.length === 1 ? "un video" : `${fallaron.length} videos`} en el Container.`);
    const r = await pedir("/unir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ original: original.id, tramos, copiar: m.union?.copiar !== false }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `El Container respondió ${r.status}.`);
    }
    const num = (k) => Number(r.headers.get(k)) || 0;
    const ancho = num("X-Ancho");
    const alto = num("X-Alto");
    const duracion = num("X-Duracion");
    const clave = claveDeArchivo(clienteId, `${m.modo} ${original.prompt || "video"}`, "video/mp4");
    const bytes = await guardarMp4(env, clave, r);
    const delModelo = clips.find(Boolean);
    const modeloDe = delModelo ? (await acceso.leerUno("estudio_archivos", { id: delModelo.id, client_id: clienteId }))?.modelo : "";
    const momento = ahora();
    const archivoId = uuid();
    await acceso.insertar("estudio_archivos", {
      id: archivoId, client_id: clienteId, clave, tipo: "video", mime: "video/mp4", ancho, alto, bytes,
      prompt: `${NOMBRE_MODO[m.modo]}: ${original.prompt || "tu video"}`.slice(0, 2000), modelo: modeloDe || "video-mejorado",
      ajustes: JSON.stringify({ deArchivo: original.id, mejora: m.modo, encargoId, audioOriginal: true, duracion }),
      trabajo_id: null, carpeta_id: original.carpeta_id ?? null, origen: "estudio", costo: 0, favorito: 0, subido: 0,
      usado_en: "[]", borrado_at: null, created_at: momento, updated_at: momento,
    });
    return { estado: "hecho", archivoId };
  } catch (e) {
    console.error("mejora: unir", e?.message ?? e);
    return { estado: "fallido", error: String(e?.message ?? e).slice(0, 300), corte: esCorteDelContainer(e) };
  }
}

/** El texto del costo para el MCP y la pantalla: «≈ 0,68 $». */
export const costoDeMejora = (plan) => textoCosto(plan?.costo ?? 0);
