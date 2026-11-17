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
import { uuid as nuevoId } from "../ids.js";
import { guardarMp4, esCorteDelContainer } from "./render.js";
import { claveDeArchivo, claveDelCliente } from "./archivos.js";
import { planDeMejora, NOMBRE_MODO, esFotograma } from "../../../src/lib/mejoraVideo.js";
import { kitDe } from "./kit.js";
import { pedirAlContenedor, subirClips as subirAlContenedor } from "./cuadros.js";
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
  const paleta = (kitDe(cliente)?.paleta ?? []).map((c) => c?.hex).filter(Boolean);
  const plan = planDeMejora({ ...cuerpo, referencias, video, activos, paleta });
  if (!plan.ok) throw new ErrorEstudio(plan.error, 400);
  return { plan, video, fila };
}

/**
 * Saca el cuadro del segundo `t` del video (t < 0: desde el final) en el Container de los cuadros y lo deja en la galería
 * (en la carpeta del video). → su clave de R2. Lanza ErrorEstudio si no hay Container o no se pudo.
 */
async function guardarFotograma(env, acceso, cliente, fila, t) {
  if (!env.VIDEO) throw new ErrorEstudio("Para esto hace falta el Container del video (sacar un cuadro del original): aquí no está.", 503);
  const pedir = pedirAlContenedor(env);
  const fallaron = await subirAlContenedor(env, [{ id: fila.id, clave: fila.clave }], pedir);
  if (fallaron.length) throw new ErrorEstudio("No se pudo cargar el video en el Container: inténtalo otra vez en un momento.", 503);
  const r = await pedir("/fotograma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clip: fila.id, t }) });
  if (!r.ok) throw new ErrorEstudio("No se pudo sacar el cuadro del video.", 502);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const clave = claveDeArchivo(cliente.id, `cuadro ${fila.prompt || "video"}`, "image/jpeg");
  await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  const momento = ahora();
  await acceso.insertar("estudio_archivos", {
    id: nuevoId(), client_id: cliente.id, clave, tipo: "imagen", mime: "image/jpeg", ancho: Number(fila.ancho) || 0, alto: Number(fila.alto) || 0,
    bytes: bytes.length, prompt: `Cuadro del segundo ${t < 0 ? "final" : t} de: ${fila.prompt || "tu video"}`.slice(0, 2000), modelo: "",
    ajustes: JSON.stringify({ fotogramaDe: fila.id, t }), trabajo_id: null, carpeta_id: fila.carpeta_id ?? null, origen: "estudio",
    costo: 0, favorito: 0, subido: 0, usado_en: "[]", borrado_at: null, created_at: momento, updated_at: momento,
  });
  return clave;
}

/**
 * Crea la mejora (un encargo «mejora»). Sin `confirmado: true`, 409 con el costo: un video pregunta SIEMPRE.
 * → la fila del encargo.
 */
export async function crearMejora(env, acceso, cliente, cuerpo = {}, { usuario = null, crearEncargo } = {}) {
  const { plan, fila } = await planDelVideo(env, acceso, cliente, cuerpo);
  // Lo que no usa IA (el color, el gancho con el momento fuerte) no cuesta: no se pregunta.
  if (plan.costo > 0 && cuerpo.confirmado !== true) {
    throw new ErrorEstudio(`${plan.resumen} Confírmalo para seguir.`, 409, {
      codigo: "confirmar", costo: plan.costo, resumen: plan.resumen, aviso: plan.aviso ?? null,
    });
  }
  if (plan.costo > 0) {
    const bloqueo = await bloqueoPorPresupuesto(acceso);
    if (bloqueo) throw new ErrorEstudio(bloqueo, 402, { codigo: "presupuesto" });
  }
  // Los FOTOGRAMAS del original que van de imagen inicial o final (alargar, entrada o cierre nuevos): se sacan ahora
  // en el Container y quedan en la galería, para que el pedido los nombre por su clave como cualquier imagen.
  const fotogramas = new Map();
  for (const p of plan.pasos) {
    for (const rol of ["start", "end"]) {
      const lista = p.pedido.medios?.[rol] ?? [];
      for (const [i, v] of lista.entries()) {
        if (!esFotograma(v)) continue;
        if (!fotogramas.has(v)) fotogramas.set(v, await guardarFotograma(env, acceso, cliente, fila, Number(String(v).split(":")[1])));
        lista[i] = fotogramas.get(v);
      }
    }
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
  return {
    modo: m.modo, archivoId: String(m.archivoId).slice(0, 80), costo: Number(m.costo) || 0,
    resumen: String(m.resumen ?? "").slice(0, 600), aviso: m.aviso ? String(m.aviso).slice(0, 400) : null,
    union: { fase: "nuevo", versiones: versionesDe(m.union).map(limpiarVersion).filter((v) => v.tramos.length).slice(0, 5) },
  };
}

const fuenteDe = (f) => (f === "original" ? "original" : Math.max(0, Math.floor(Number(f)) || 0));

/** Las versiones de una unión (las de antes traían un solo `tramos`). */
export const versionesDe = (u = {}) => (Array.isArray(u?.versiones) ? u.versiones : Array.isArray(u?.tramos) ? [{ tramos: u.tramos, copiar: u.copiar }] : []);

function limpiarVersion(v = {}) {
  const tramos = (Array.isArray(v.tramos) ? v.tramos : []).slice(0, 24).map((t) => ({
    fuente: fuenteDe(t.fuente), desde: Math.max(0, Number(t.desde) || 0), hasta: Math.max(0, Number(t.hasta) || 0),
    ...(t.audio ? { audio: { fuente: fuenteDe(t.audio.fuente), desde: Math.max(0, Number(t.audio.desde) || 0) } } : {}),
  })).filter((t) => t.hasta > t.desde);
  return {
    tramos, copiar: v.copiar !== false, titulo: String(v.titulo ?? "").slice(0, 120),
    ...(typeof v.color === "string" && v.color ? { color: v.color.slice(0, 30) } : {}),
    ...(v.texto?.texto ? { texto: { texto: String(v.texto.texto).slice(0, 120), hasta: Math.max(0.5, Math.min(Number(v.texto.hasta) || 3, 10)), color: String(v.texto.color ?? "#FFFFFF").slice(0, 9), fondo: String(v.texto.fondo ?? "#111111").slice(0, 9) } } : {}),
    ...(Array.isArray(v.requiere) ? { requiere: v.requiere.map((x) => Math.max(0, Math.floor(Number(x)) || 0)).slice(0, 5) } : {}),
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
    union: { fase: u.fase ?? "nuevo", archivoId: u.archivoId ?? null, archivoIds: u.archivoIds ?? (u.archivoId ? [u.archivoId] : []), error: u.error ?? "" },
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
  // Sin pasos (el color, el gancho con el momento fuerte) no hay nada que esperar del modelo.
  if (pasos.length && !hechos.length) { m.union = { ...u, fase: "fallido", error: "No salió ningún video que unir." }; return { hizo: true }; }
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
    m.union = { ...u, fase: "hecho", archivoId: r.archivoId, archivoIds: r.archivoIds ?? [r.archivoId], error: r.aviso ?? "" };
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
    const clipDe = (f) => (f === "original" ? original : clips[f] ?? null);
    // Cada versión es un video. Una que necesita lo que hizo el modelo (`requiere`) y no salió, se salta; un ángulo que
    // no salió deja su tramo al original; en un solo tramo sin nada encima, sin el video nuevo no hay nada que unir.
    const versiones = versionesDe(m.union).filter((v) => !(v.requiere ?? []).some((k) => !clips[k]))
      .filter((v) => !(v.copiar !== false && v.tramos.length === 1 && v.tramos[0].fuente !== "original" && !clips[v.tramos[0].fuente]));
    if (!versiones.length) throw new Error("No salió ningún video que unir.");
    const subir = [original, ...clips.filter(Boolean)].filter((c, i, l) => l.findIndex((x) => x.id === c.id) === i);
    const fallaron = await subirClips(env, subir.map((c) => ({ id: c.id, clave: c.clave })), pedir);
    if (fallaron.length) throw new Error(`No se pudo cargar ${fallaron.length === 1 ? "un video" : `${fallaron.length} videos`} en el Container.`);
    const delModelo = clips.find(Boolean);
    const modeloDe = delModelo ? (await acceso.leerUno("estudio_archivos", { id: delModelo.id, client_id: clienteId }))?.modelo : "";
    const archivoIds = [];
    const errores = [];
    for (const v of versiones) {
      const tramos = v.tramos.map((t) => ({
        clip: (clipDe(t.fuente) ?? original).id, desde: t.desde, hasta: t.hasta,
        ...(t.audio ? { audio: { clip: (clipDe(t.audio.fuente) ?? original).id, desde: t.audio.desde } } : {}),
      }));
      try {
        const r = await pedir("/unir", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ original: original.id, tramos, copiar: v.copiar !== false, ...(v.color ? { color: v.color } : {}), ...(v.texto ? { texto: v.texto } : {}) }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `El Container respondió ${r.status}.`);
        }
        const num = (k) => Number(r.headers.get(k)) || 0;
        const ancho = num("X-Ancho");
        const alto = num("X-Alto");
        const duracion = num("X-Duracion");
        const clave = claveDeArchivo(clienteId, `${m.modo} ${v.titulo || original.prompt || "video"}`, "video/mp4");
        const bytes = await guardarMp4(env, clave, r);
        const momento = ahora();
        const archivoId = uuid();
        await acceso.insertar("estudio_archivos", {
          id: archivoId, client_id: clienteId, clave, tipo: "video", mime: "video/mp4", ancho, alto, bytes,
          prompt: `${NOMBRE_MODO[m.modo]}${v.titulo ? ` («${v.titulo}»)` : ""}: ${original.prompt || "tu video"}`.slice(0, 2000),
          modelo: modeloDe || "video-mejorado",
          ajustes: JSON.stringify({
            deArchivo: original.id, mejora: m.modo, encargoId, audioOriginal: true, duracion,
            ...(v.color ? { color: v.color } : {}), ...(v.texto ? { gancho: v.texto.texto } : {}), ...(v.titulo ? { version: v.titulo } : {}),
          }),
          trabajo_id: null, carpeta_id: original.carpeta_id ?? null, origen: "estudio", costo: 0, favorito: 0, subido: 0,
          usado_en: "[]", borrado_at: null, created_at: momento, updated_at: momento,
        });
        archivoIds.push(archivoId);
      } catch (e) {
        // Un corte del Container tumba todo (se reintenta entero); un fallo de UNA versión deja las demás.
        if (esCorteDelContainer(e)) throw e;
        errores.push(String(e?.message ?? e).slice(0, 200));
      }
    }
    if (!archivoIds.length) throw new Error(errores[0] ?? "No se pudo unir ninguna versión.");
    return {
      estado: "hecho", archivoId: archivoIds[0], archivoIds,
      ...(errores.length ? { aviso: `${errores.length === 1 ? "Una versión no salió" : `${errores.length} versiones no salieron`}: ${errores[0]}` } : {}),
    };
  } catch (e) {
    console.error("mejora: unir", e?.message ?? e);
    return { estado: "fallido", error: String(e?.message ?? e).slice(0, 300), corte: esCorteDelContainer(e) };
  }
}

/** El texto del costo para el MCP y la pantalla: «≈ 0,68 $». */
export const costoDeMejora = (plan) => textoCosto(plan?.costo ?? 0);

/**
 * La MUESTRA de un color: un cuadro del video con ese grade puesto (JPEG, por el Container de los cuadros). Gratis.
 * `cuerpo`: { archivoId (o clave), color, t? }. → Response con la imagen.
 */
export async function muestraDeColor(env, acceso, cliente, cuerpo = {}) {
  const { fila, video } = await videoDelCliente(env, acceso, cliente, cuerpo.archivoId, cuerpo.clave);
  if (!env.VIDEO) throw new ErrorEstudio("La muestra necesita el Container del video: aquí no está.", 503);
  const pedir = pedirAlContenedor(env);
  const fallaron = await subirAlContenedor(env, [{ id: fila.id, clave: fila.clave }], pedir);
  if (fallaron.length) throw new ErrorEstudio("No se pudo cargar el video en el Container.", 503);
  const t = Number.isFinite(Number(cuerpo.t)) ? Number(cuerpo.t) : Math.min(2, (video.duracion || 2) / 2);
  const r = await pedir("/muestra-color", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clip: fila.id, color: String(cuerpo.color ?? ""), t, ancho: 360 }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new ErrorEstudio(j.error || "No se pudo sacar la muestra.", r.status === 400 ? 400 : 502);
  }
  return new Response(r.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}

/** Lo que pide cada tipo de texto: el que va ENCIMA (gancho sin IA) o lo que PASA en una entrada o un cierre nuevos. */
const PARA_TEXTOS = Object.freeze({
  texto: (n) => `Escribe ${n} TEXTOS DE GANCHO distintos para poner encima de los primeros segundos de este anuncio: cada uno de 3 a 8 palabras, que se lea de un vistazo y detenga el dedo, en español latino neutro, sin emojis ni hashtags, sin cifras ni promesas que no estén escritas en lo que se sabe de la marca. Uno por cada forma de abajo, en ese orden.`,
  entrada: (n) => `Propón ${n} ENTRADAS VISUALES distintas de 5 segundos para este anuncio: qué se ve y qué pasa (una o dos frases cada una, concretas y filmables), algo que detenga el dedo en el primer segundo y que termine en el primer cuadro del video tal cual (las mismas personas, producto y lugar). Sin texto en pantalla. Una por cada forma de abajo, en ese orden.`,
  cierre: (n) => `Propón ${n} CIERRES VISUALES distintos de 5 segundos para este anuncio: qué se ve y qué pasa (una o dos frases cada una, concretas y filmables), que salgan del último cuadro del video y terminen en el producto o el resultado, quieto, para el llamado. Sin texto en pantalla.`,
});

/** Lee la respuesta de la IA: { textos, momento }. Pura. */
export function leerTextosDeGancho(texto, n, duracion = 0) {
  const crudo = String(texto ?? "");
  const json = crudo.slice(crudo.indexOf("{"), crudo.lastIndexOf("}") + 1);
  let d = null;
  try { d = JSON.parse(json); } catch { d = null; }
  const textos = (Array.isArray(d?.textos) ? d.textos : []).map((t) => String(t ?? "").replace(/\s+/g, " ").trim()).filter((t) => t.length >= 3).slice(0, n).map((t) => t.slice(0, 300));
  const desde = Number(d?.momento?.desde);
  const hasta = Number(d?.momento?.hasta);
  const momento = Number.isFinite(desde) && Number.isFinite(hasta) && hasta > desde && (!duracion || desde < duracion)
    ? { desde: Math.max(0, desde), hasta: Math.min(duracion || hasta, hasta, desde + 4) } : null;
  return { textos, momento };
}

/**
 * Los TEXTOS de los ganchos (o lo que pasa en la entrada o el cierre nuevos), escritos por la IA con las FORMAS DE
 * GANCHO del método (sólo las que sirven en un anuncio de video), lo que se sabe de la marca y, si el video ya está
 * desglosado, sus tomas (de ahí sale también el MOMENTO FUERTE). Sólo escribe: no crea nada.
 * `cuerpo`: { archivoId (o clave), para: texto|entrada|cierre, cuantos?, idea? } → { textos, momento, formas }.
 */
export async function textosDeGancho(env, acceso, cliente, cuerpo = {}) {
  const { fila, video } = await videoDelCliente(env, acceso, cliente, cuerpo.archivoId, cuerpo.clave);
  const para = PARA_TEXTOS[cuerpo.para] ? cuerpo.para : "texto";
  const n = Math.max(1, Math.min(3, Math.floor(Number(cuerpo.cuantos)) || 3));
  // En el momento: guionVideo.js y la IA leen el cerebro y el director, que no hacen falta para unir.
  const [{ contextoDeGuion }, { llamarIA }, { FORMAS_GANCHO }, { resumenDeSecuencia }] = await Promise.all([
    import("./guionVideo.js"), import("../cerebro/ia.js"), import("../../../src/lib/formasGancho.js"), import("../../../src/lib/deconstructor.js"),
  ]);
  const formas = FORMAS_GANCHO.filter((f) => f.pauta && f.donde.includes("video") && !f.requiereDato);
  // Formas distintas cada vez (no siempre las tres primeras): por la hora, repartidas.
  const desde = Math.floor(Date.now() / 60_000) % formas.length;
  const escogidas = Array.from({ length: n }, (_, i) => formas[(desde + i * Math.max(1, Math.floor(formas.length / n))) % formas.length]);
  const idea = String(cuerpo.idea ?? "").trim().slice(0, 500);
  const desglose = leerJSON(fila.ajustes, {}).deconstruccion;
  const ctx = await contextoDeGuion(env, acceso, cliente, { consulta: `${idea || fila.prompt} gancho anuncio video`, presupuesto: 2500, criterio: false });
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [
      `Eres director creativo de anuncios en video para ${cliente.name}.`,
      PARA_TEXTOS[para](n),
      `Las formas:\n${escogidas.map((f, i) => `${i + 1}. ${f.nombre}: ${f.como}.`).join("\n")}`,
      `El video: ${String(fila.prompt || "un video del cliente").slice(0, 300)} (${Math.round(video.duracion)} s).`,
      desglose?.tomas?.length ? `Lo que se ve, toma por toma:\n${resumenDeSecuencia(desglose)}` : "",
      idea ? `Lo que pide la agencia: ${idea}` : "",
      ctx.contexto ? `Lo que se sabe de la marca:\n${ctx.contexto.slice(0, 2500)}` : "",
      para === "texto" && desglose?.tomas?.length
        ? 'Escoge también el MOMENTO MÁS FUERTE del video (el resultado, el antes y después, lo más llamativo; de 1,5 a 3 s) para abrir con él. Responde SOLO con JSON: {"textos":["…"],"momento":{"desde":0,"hasta":0}}'
        : 'Responde SOLO con JSON: {"textos":["…"]}',
    ].filter(Boolean).join("\n\n"),
    salida: 900,
    funcion: "guion de video",
  });
  const leido = leerTextosDeGancho(r.texto, n, video.duracion);
  if (!leido.textos.length) throw new ErrorEstudio("La IA no devolvió textos que se puedan usar. Inténtalo otra vez.", 502);
  return { ...leido, formas: escogidas.map((f) => f.nombre), duracion: video.duracion };
}
