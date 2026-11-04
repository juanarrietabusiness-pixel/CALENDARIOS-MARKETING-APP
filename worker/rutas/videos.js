// ============================================================
// /api/videos/<cliente> — los proyectos de VIDEO ANIMADO de un cliente
//
//   GET    /api/videos/<c>                  La lista (sin el guion: puede pesar)
//   POST   /api/videos/<c>                  { titulo?, guion, calendarId?, postId? }: crear uno (borrador)
//   GET    /api/videos/<c>/<id>             Uno entero, con su guion y su línea de tiempo estimada
//   PUT    /api/videos/<c>/<id>             { guion?, titulo?, version }: guardar; un guion nuevo sube la versión y
//                                           devuelve el proyecto a borrador (la aprobación era de otro texto)
//   POST   /api/videos/<c>/<id>/aprobar     { version }: aprobar el guion de ESA versión (con él se podrá pagar la voz)
//   DELETE /api/videos/<c>/<id>             Borrarlo
//   POST   /api/videos/<c>/<id>/locucion    { version, modelo?, voz?, confirmado }: la VOZ del guion aprobado (un trabajo
//                                           del Estudio). Siempre pide confirmar: sin `confirmado: true`, 409 con el costo
//   GET    /api/videos/<c>/voces            Las voces del cliente (las propias del kit y las de serie), los modelos y
//                                           si la muestra de cada una ya está hecha
//   GET    /api/videos/<c>/voces/muestra?modelo=&voz=   La muestra hecha (audio), o 404 `sin_muestra` con su costo
//   POST   /api/videos/<c>/voces/muestra    { modelo, voz, confirmado }: hacerla (un trabajo; también pide confirmar)
//
// El guion lo valida `validarGuion` (src/lib/videoEscenas.js) aquí, en el servidor: lo que llega del navegador, del
// asistente o de Claude por MCP no se cree. Un guion con errores NO se guarda: vuelve 400 con la lista de errores,
// cada uno con su sitio, para que quien lo escribió lo corrija.
//
// `version` en el PUT y en aprobar es la que se leyó: si otra persona guardó entremedias, 409 en vez de pisarla (dos
// personas del equipo pueden tener el mismo video abierto).
//
// Lo único que gasta aquí es la voz (worker/lib/estudio/locucion.js), y siempre con su confirmación de costo.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { uuid, ahora } from "../lib/ids.js";
import { difundir, firma } from "../lib/vivo.js";
import { validarGuion, lineaDeTiempo, estadoTrasEditar, puedePasar, NOMBRE_ESTADO_VIDEO } from "../../src/lib/videoEscenas.js";
import { listarVoces, locucionDe, pedirMuestra, pedirLocucion, locucionAlDia, claveDeMuestra, ErrorVoz } from "../lib/estudio/locucion.js";
import { costoDeVoz, fraseDeMuestra, modeloDeVoz, vozPorId } from "../../src/lib/voces.js";

const ID = /^[\w-]{1,80}$/;
const MAX_PROYECTOS = 200;
const COLUMNAS_LISTA = ["id", "titulo", "estado", "version", "aprobada_version", "calendar_id", "post_id", "nota", "created_at", "updated_at"];

const leerJSON = (t, def) => { try { return JSON.parse(t); } catch { return def; } };

/** La fila como la ve la pantalla: el guion y la locución como objetos, y la duración estimada. */
function deFila(f) {
  const guion = leerJSON(f.guion, {});
  const locucion = leerJSON(f.locucion, {});
  const v = validarGuion(guion);
  return {
    id: f.id, titulo: f.titulo, estado: f.estado, version: f.version, aprobadaVersion: f.aprobada_version ?? null,
    calendarId: f.calendar_id ?? null, postId: f.post_id ?? null, nota: f.nota ?? "",
    guion: v.guion ?? guion, valido: v.ok, errores: v.errores,
    segundos: v.guion?.escenas?.length ? lineaDeTiempo(v.guion, locucion.palabras ?? null).total : 0,
    locucion, render: leerJSON(f.render, {}),
    aprobadoPor: f.aprobado_por ?? null, aprobadoAt: f.aprobado_at ?? null,
    creado: f.created_at, actualizado: f.updated_at,
  };
}

/** Un ErrorVoz como respuesta: su mensaje, su estado y lo que la pantalla necesita (`codigo`, `costo`…). */
function respuestaDeVoz(e) {
  const { message, estado, ...extra } = e;
  return json({ error: message, ...extra }, estado ?? 400);
}

/** Las voces de un cliente y su muestra: la lista, oír una ya hecha y pedir una nueva. */
async function rutasVoces(req, env, { acceso, usuario, cliente, sub, metodo }) {
  try {
    if (!sub && metodo === "GET") return json(await listarVoces(env, cliente));
    if (sub !== "muestra") return noEncontrado("Voces");
    if (metodo === "GET") {
      const url = new URL(req.url);
      const modelo = modeloDeVoz(url.searchParams.get("modelo") ?? "v3");
      const voz = modelo ? vozPorId(locucionDe(cliente), url.searchParams.get("voz") ?? "") : null;
      if (!modelo || !voz) return noEncontrado("Voz");
      const obj = await env.MEDIA.get(claveDeMuestra(modelo.clave, voz.id));
      if (!obj) {
        return json({ error: "Esa muestra aún no está hecha.", codigo: "sin_muestra", costo: costoDeVoz(modelo.clave, fraseDeMuestra(modelo.clave).length).usd }, 404);
      }
      return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
    }
    if (metodo === "POST") {
      const b = (await cuerpo(req)) ?? {};
      const r = await pedirMuestra(env, acceso, cliente, { modelo: b.modelo, vozId: b.voz, confirmado: b.confirmado === true, usuario });
      return json(r, r.lista ? 200 : 202);
    }
    return error("Método no permitido.", 405);
  } catch (e) {
    if (e instanceof ErrorVoz) return respuestaDeVoz(e);
    throw e;
  }
}

const avisar = (env, acceso, usuario, req, clienteId, id) =>
  difundir(env, acceso.ownerId, { tipo: "videos", clienteId, id, por: firma(usuario, req) });

/** Un guion que llega: validado, o el 400 con sus errores. */
function guionDe(b) {
  const v = validarGuion(b?.guion);
  if (!v.ok) return { respuesta: json({ error: "El guion tiene errores: corrígelos y vuelve a guardarlo.", errores: v.errores, avisos: v.avisos }, 400) };
  return { guion: v.guion, avisos: v.avisos };
}

export async function rutasVideos(req, env, { acceso, usuario, partes, metodo }) {
  const [, clienteId, id, accion] = partes;
  if (!ID.test(String(clienteId ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  if (!cliente) return noEncontrado("Cliente");

  if (!id) {
    if (metodo === "GET") {
      const filas = await acceso.leerColumnas("videos_proyectos", COLUMNAS_LISTA, { client_id: clienteId }, "updated_at desc", MAX_PROYECTOS);
      return json({ videos: filas.map((f) => ({ ...f, nombreEstado: NOMBRE_ESTADO_VIDEO[f.estado] ?? f.estado })) });
    }
    if (metodo === "POST") {
      const b = (await cuerpo(req)) ?? {};
      const { guion, avisos, respuesta } = guionDe(b);
      if (respuesta) return respuesta;
      let calendarId = null;
      let postId = null;
      if (b.calendarId) {
        const cal = await acceso.leerUno("calendars", { id: String(b.calendarId), client_id: clienteId });
        if (!cal) return error("Ese calendario no es de este cliente.", 400);
        calendarId = cal.id;
        postId = ID.test(String(b.postId ?? "")) ? String(b.postId) : null;
      }
      if ((await acceso.leerColumnas("videos_proyectos", ["id"], { client_id: clienteId })).length >= MAX_PROYECTOS) {
        return error(`Como mucho ${MAX_PROYECTOS} videos por cliente: borra los que ya no sirvan.`, 409);
      }
      const momento = ahora();
      const fila = await acceso.insertar("videos_proyectos", {
        id: uuid(), client_id: clienteId, calendar_id: calendarId, post_id: postId,
        titulo: String(b.titulo ?? guion.titulo ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Video sin título",
        // Los valores por defecto van escritos: `insertar` devuelve lo que se le dio, no la fila releída.
        estado: "borrador", version: 1, locucion: "{}", render: "{}", nota: "",
        guion: JSON.stringify(guion), creado_por: usuario.id, created_at: momento, updated_at: momento,
      });
      avisar(env, acceso, usuario, req, clienteId, fila.id);
      return json({ video: deFila(fila), avisos }, 201);
    }
    return error("Método no permitido.", 405);
  }

  if (id === "voces") return rutasVoces(req, env, { acceso, usuario, cliente, sub: accion, metodo });

  if (!ID.test(String(id))) return noEncontrado("Video");
  const fila = await acceso.leerUno("videos_proyectos", { id, client_id: clienteId });
  if (!fila) return noEncontrado("Video");

  // Si la voz se estaba generando y el pedido acabó mal, se dice al abrirlo.
  if (!accion && metodo === "GET") {
    const video = deFila(fila);
    return json({ video: { ...video, locucion: await locucionAlDia(acceso, video.locucion) } });
  }

  if (!accion && metodo === "DELETE") {
    if (fila.estado === "renderizando") return error("Se está renderizando: espera a que termine para borrarlo.", 409);
    await acceso.borrar("videos_proyectos", { id, client_id: clienteId });
    avisar(env, acceso, usuario, req, clienteId, id);
    return json({ ok: true });
  }

  const b = (await cuerpo(req)) ?? {};
  // La versión que se leyó: si alguien guardó después, no se pisa.
  if (!Number.isInteger(b.version)) return error("Falta la versión que tenías abierta.");
  if (b.version !== fila.version) return json({ error: "Otra persona cambió este video mientras lo tenías abierto. Vuelve a abrirlo.", video: deFila(fila) }, 409);

  if (!accion && metodo === "PUT") {
    const cambios = {};
    let avisos = [];
    if (b.guion !== undefined) {
      const r = guionDe(b);
      if (r.respuesta) return r.respuesta;
      avisos = r.avisos;
      if (JSON.stringify(r.guion) !== fila.guion) {
        const estado = estadoTrasEditar(fila.estado);
        if (!estado) return error("Se está renderizando: no se puede cambiar el guion hasta que termine.", 409);
        Object.assign(cambios, { guion: JSON.stringify(r.guion), version: fila.version + 1, estado });
      }
    }
    if (b.titulo !== undefined) {
      const t = String(b.titulo).replace(/\s+/g, " ").trim().slice(0, 120);
      if (!t) return error("El título no puede quedar vacío.");
      if (t !== fila.titulo) cambios.titulo = t;
    }
    if (!Object.keys(cambios).length) return json({ video: deFila(fila), avisos });
    cambios.updated_at = ahora();
    const n = await acceso.actualizar("videos_proyectos", { id, client_id: clienteId, version: fila.version }, cambios);
    if (!n) return json({ error: "Otra persona cambió este video mientras lo guardabas. Vuelve a abrirlo." }, 409);
    avisar(env, acceso, usuario, req, clienteId, id);
    return json({ video: deFila({ ...fila, ...cambios }), avisos });
  }

  if (accion === "locucion" && metodo === "POST") {
    try {
      const r = await pedirLocucion(env, acceso, cliente, fila, {
        modelo: b.modelo, vozId: b.voz, confirmado: b.confirmado === true, usuario, por: firma(usuario, req),
      });
      return json(r, 202);
    } catch (e) {
      if (e instanceof ErrorVoz) return respuestaDeVoz(e);
      throw e;
    }
  }

  if (accion === "aprobar" && metodo === "POST") {
    if (!puedePasar(fila.estado, "aprobado")) return error(`Está en «${NOMBRE_ESTADO_VIDEO[fila.estado] ?? fila.estado}»: sólo se aprueba un borrador.`, 409);
    const v = validarGuion(leerJSON(fila.guion, null));
    if (!v.ok) return json({ error: "El guion tiene errores: corrígelos antes de aprobarlo.", errores: v.errores }, 400);
    const cambios = { estado: "aprobado", aprobada_version: fila.version, aprobado_por: usuario.id, aprobado_at: ahora(), updated_at: ahora() };
    const n = await acceso.actualizar("videos_proyectos", { id, client_id: clienteId, version: fila.version }, cambios);
    if (!n) return json({ error: "Otra persona cambió este video mientras lo aprobabas. Vuelve a abrirlo." }, 409);
    avisar(env, acceso, usuario, req, clienteId, id);
    return json({ video: deFila({ ...fila, ...cambios }) });
  }

  return error("Método no permitido.", 405);
}
