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
//   GET    /api/videos/<c>/voces/muestra?modelo=&voz=&huella=   La muestra hecha (audio), o 404 `sin_muestra` con su costo
//   POST   /api/videos/<c>/voces/muestra    { modelo, voz, texto?, confirmado }: hacerla (un trabajo; también pide
//                                           confirmar). `texto` propio (≤ 500): queda aparte, con su `huella`
//   PUT    /api/videos/<c>/voces/marca      { voz, modelo }: fijar la voz de la MARCA en el kit guardado (gratis)
//   GET    /api/videos/<c>/voces/biblioteca?q=&genero=&acento=&pagina=   Voces en ESPAÑOL de la biblioteca de
//                                           ElevenLabs (gratis; sólo con la llave oficial)
//   POST   /api/videos/<c>/voces/biblioteca { publico, voz, nombre }: añadirla a la cuenta (sólo administración)
//   GET    /api/videos/<c>/voces/previa?u=  La muestra GRATIS que publica ElevenLabs de una voz (sólo de sus almacenes)
//   GET    /api/videos/<c>/<id>/cuadro?t=&formato=&ancho=   La imagen de un instante, dibujada por el Container con el
//                                           MISMO motor que la vista previa (JPEG; X-Escena dice cuál)
//   GET    /api/videos/<c>/<id>/hoja?formato=   Un cuadro de cada escena, en su instante «lleno», en una sola imagen
//   GET    /api/videos/<c>/<id>/revision?formatos=9:16,1:1   La revisión antes de renderizar (subtítulos que tapan,
//                                           texto que se sale, fuera de la zona segura…), con las fuentes reales
//   POST   /api/videos/<c>/<id>/render      { version }: el RENDER a mp4 (voz, escenas y subtítulos, -14 LUFS). Sólo
//                                           con el guion aprobado y su locución; contesta ya (202) y el Durable Object
//                                           del render lo hace (worker/lib/estudio/render.js). No gasta IA
//   POST   /api/videos/<c>/<id>/publicacion { postId, calendarId? }: ligarlo a una publicación del cliente (postId vacío:
//                                           desligarlo). Si el mp4 ya está hecho, se pone en ella ya
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
import { difundir, firma } from "../lib/vivo.js";
import {
  deFila, listarProyectos, crearProyecto, guardarProyecto, aprobarProyecto, ErrorVideo, ID_VIDEO as ID,
} from "../lib/videosProyectos.js";
import { listarVoces, pedirMuestra, pedirLocucion, locucionAlDia, claveDeMuestra, HUELLA, ErrorVoz, viaDeVoz, fijarVozDeMarca } from "../lib/estudio/locucion.js";
import { buscarEnBiblioteca, anadirDeLaBiblioteca, previaGratis, ACENTOS_BIBLIOTECA } from "../lib/estudio/elevenlabs.js";
import { ErrorMotor } from "../lib/estudio/gemini.js";
import { pedidoDelVideo, alContenedor } from "../lib/estudio/cuadros.js";
import { pedirRender, renderAlDia, ligarAPublicacion } from "../lib/estudio/render.js";
import { costoDeVoz, fraseDeMuestra, modeloDeVoz, esIdDeVoz } from "../../src/lib/voces.js";

/** Un ErrorVoz como respuesta: su mensaje, su estado y lo que la pantalla necesita (`codigo`, `costo`…). */
function respuestaDeVoz(e) {
  const { message, estado, ...extra } = e;
  return json({ error: message, ...extra }, estado ?? 400);
}

/** Las voces de un cliente y su muestra: la lista, oír una ya hecha y pedir una nueva. */
async function rutasVoces(req, env, { acceso, usuario, cliente, sub, metodo }) {
  try {
    if (!sub && metodo === "GET") return json(await listarVoces(env, cliente));
    // La voz de la marca: sobre el kit GUARDADO (no el que tenga abierto otra pantalla).
    if (sub === "marca" && metodo === "PUT") {
      const b = (await cuerpo(req)) ?? {};
      const r = await fijarVozDeMarca(env, acceso, cliente, { vozId: typeof b.voz === "string" ? b.voz : "", modelo: b.modelo });
      difundir(env, acceso.ownerId, { tipo: "estudio", clientId: cliente.id, por: firma(usuario, req) });
      return json(r);
    }
    // La biblioteca de ElevenLabs (voces en español): sólo con la llave oficial.
    if (sub === "biblioteca") {
      if (viaDeVoz(env) !== "elevenlabs") return error("La biblioteca de voces necesita la llave oficial de ElevenLabs (ELEVENLABS_API_KEY).", 409);
      if (metodo === "GET") {
        const u = new URL(req.url).searchParams;
        const r = await buscarEnBiblioteca(env, { q: u.get("q") ?? "", genero: u.get("genero") ?? "", acento: u.get("acento") ?? "", pagina: u.get("pagina") ?? 0 });
        return json({ ...r, acentos: ACENTOS_BIBLIOTECA });
      }
      if (metodo === "POST") {
        // Ocupa un hueco de voces de la cuenta de la agencia: lo decide quien la administra.
        if (usuario?.rol !== "admin") return error("Sólo quien administra añade voces a la cuenta de ElevenLabs.", 403);
        const b = (await cuerpo(req)) ?? {};
        const id = await anadirDeLaBiblioteca(env, { publico: b.publico, voz: b.voz, nombre: b.nombre });
        return json({ voz: id }, 201);
      }
      return error("Método no permitido.", 405);
    }
    if (sub === "previa" && metodo === "GET") return await previaGratis(new URL(req.url).searchParams.get("u") ?? "");
    if (sub !== "muestra") return noEncontrado("Voces");
    if (metodo === "GET") {
      const url = new URL(req.url);
      const modelo = modeloDeVoz(url.searchParams.get("modelo") ?? "v4");
      // Sólo se OYE lo ya hecho: basta con que el id tenga la forma de uno de ElevenLabs (la clave de R2 no sale de ahí).
      // Con la llave oficial valen las voces de la cuenta, y preguntarle la lista para cada audio sería una llamada más.
      const vozId = url.searchParams.get("voz") ?? "";
      if (!modelo || !esIdDeVoz(vozId)) return noEncontrado("Voz");
      // `huella`: la de un texto propio (la da el POST); sin ella, la muestra de la frase fija.
      const huella = url.searchParams.get("huella") ?? "";
      if (huella && !HUELLA.test(huella)) return noEncontrado("Muestra");
      const obj = await env.MEDIA.get(claveDeMuestra(modelo.clave, vozId, huella));
      if (!obj) {
        return json({ error: "Esa muestra aún no está hecha.", codigo: "sin_muestra", costo: costoDeVoz(modelo.clave, fraseDeMuestra(modelo.clave).length, viaDeVoz(env) ?? "kie").usd }, 404);
      }
      return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "audio/mpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
    }
    if (metodo === "POST") {
      const b = (await cuerpo(req)) ?? {};
      const r = await pedirMuestra(env, acceso, cliente, {
        modelo: b.modelo, vozId: b.voz, texto: typeof b.texto === "string" ? b.texto : "", confirmado: b.confirmado === true, usuario,
      });
      return json(r, r.lista ? 200 : 202);
    }
    return error("Método no permitido.", 405);
  } catch (e) {
    if (e instanceof ErrorVoz) return respuestaDeVoz(e);
    if (e instanceof ErrorMotor) return error(e.message, e.estado >= 400 && e.estado < 600 ? e.estado : 502);
    throw e;
  }
}

const avisar = (env, acceso, usuario, req, clienteId, id) =>
  difundir(env, acceso.ownerId, { tipo: "videos", clienteId, id, por: firma(usuario, req) });

/** Un ErrorVideo como respuesta: su mensaje, su estado y lo que la pantalla necesita (`errores`, `video`…). */
const respuestaDeVideo = (e) => json({ error: e.message, ...e.extra }, e.estado);

export async function rutasVideos(req, env, ctx) {
  try {
    return await rutasDelCliente(req, env, ctx);
  } catch (e) {
    if (e instanceof ErrorVideo) return respuestaDeVideo(e);
    throw e;
  }
}

async function rutasDelCliente(req, env, { acceso, usuario, partes, metodo }) {
  const [, clienteId, id, accion] = partes;
  if (!ID.test(String(clienteId ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  if (!cliente) return noEncontrado("Cliente");

  if (!id) {
    if (metodo === "GET") return json({ videos: await listarProyectos(acceso, clienteId) });
    if (metodo === "POST") {
      const b = (await cuerpo(req)) ?? {};
      const r = await crearProyecto(acceso, cliente, { guion: b.guion, titulo: b.titulo, calendarId: b.calendarId, postId: b.postId, usuario });
      avisar(env, acceso, usuario, req, clienteId, r.video.id);
      return json(r, 201);
    }
    return error("Método no permitido.", 405);
  }

  if (id === "voces") return rutasVoces(req, env, { acceso, usuario, cliente, sub: accion, metodo });

  if (!ID.test(String(id))) return noEncontrado("Video");
  // Un render que se quedó a medias (pasado su plazo) se da por fallido al leerlo.
  const fila = await renderAlDia(acceso, await acceso.leerUno("videos_proyectos", { id, client_id: clienteId }));
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

  // Ver el video antes de renderizar: un cuadro, la hoja de escenas o la revisión (el Container dibuja; no gasta IA).
  if (["cuadro", "hoja", "revision"].includes(accion) && metodo === "GET") {
    const u = new URL(req.url).searchParams;
    const { pedido } = await pedidoDelVideo(env, acceso, cliente, fila, { formato: u.get("formato") ?? "" });
    if (accion === "revision") {
      const formatos = (u.get("formatos") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      return json(await (await alContenedor(env, "/revisar", { ...pedido, formatos })).json());
    }
    const r = await alContenedor(env, `/${accion}`, { ...pedido, t: Number(u.get("t")) || 0, ancho: Number(u.get("ancho")) || (accion === "hoja" ? 1080 : 540) });
    const cabeceras = { "Content-Type": r.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    for (const k of ["X-Escena", "X-Segundo", "X-Total", "X-Faltan"]) if (r.headers.get(k) !== null) cabeceras[k] = r.headers.get(k);
    return new Response(r.body, { headers: cabeceras });
  }

  const b = (await cuerpo(req)) ?? {};
  if (!accion && metodo === "PUT") {
    const r = await guardarProyecto(acceso, cliente, fila, { guion: b.guion, titulo: b.titulo, version: b.version });
    if (r.cambio) avisar(env, acceso, usuario, req, clienteId, id);
    return json({ video: r.video, avisos: r.avisos });
  }

  // A qué publicación va: no toca el guion, así que no pide la versión.
  if (accion === "publicacion" && metodo === "POST") {
    const r = await ligarAPublicacion(env, acceso, cliente, fila, {
      postId: typeof b.postId === "string" ? b.postId : null, calendarId: typeof b.calendarId === "string" ? b.calendarId : null, por: firma(usuario, req),
    });
    return json(r);
  }

  // La versión que se leyó: si alguien guardó después, no se pisa.
  if (!Number.isInteger(b.version)) return error("Falta la versión que tenías abierta.");
  if (b.version !== fila.version) return json({ error: "Otra persona cambió este video mientras lo tenías abierto. Vuelve a abrirlo.", video: deFila(fila) }, 409);

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

  if (accion === "render" && metodo === "POST") {
    const r = await pedirRender(env, acceso, cliente, fila, { version: b.version, usuario, por: firma(usuario, req) });
    return json(r, 202);
  }

  if (accion === "aprobar" && metodo === "POST") {
    const r = await aprobarProyecto(acceso, cliente, fila, { version: b.version, usuario });
    avisar(env, acceso, usuario, req, clienteId, id);
    return json(r);
  }

  return error("Método no permitido.", 405);
}
