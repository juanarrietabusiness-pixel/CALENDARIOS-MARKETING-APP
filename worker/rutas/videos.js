// ============================================================
// /api/videos/<cliente> — los proyectos de VIDEO ANIMADO de un cliente
//
//   GET    /api/videos/<c>                  La lista (sin el guion: puede pesar)
//   POST   /api/videos/<c>                  { titulo?, guion, calendarId?, postId?, estructuraId? }: crear uno (borrador);
//                                           `estructuraId`, la estructura de guion que siguió (queda en `origen`)
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
//   PUT    /api/videos/<c>/<id>/sonido      { efectos, musica: { archivoId, volumen } | null, efectosPropios?: { transicion,
//                                           sello } (ids de efectos de la biblioteca) }: lo que suena debajo de la voz. Va
//                                           aparte del guion: no sube la versión ni pide otra voz (gratis)
//   GET    /api/videos/<c>/<id>/fondos      Las IMÁGENES DE FONDO por crear del guion guardado: cuántas, su costo y si ya se
//                                           están creando
//   POST   /api/videos/<c>/<id>/fondos      { confirmado }: crearlas con el DIRECTOR (un encargo del servidor; 9:16, sin
//                                           texto ni logo). Sin `confirmado`, 409 `confirmar` con el costo (salvo «crear
//                                           sin preguntar»); al terminar, cada una va a las capas de su `pide`
//   GET    /api/videos/<c>/estilos          Los ESTILOS DE VIDEO guardados del cliente (con su resumen en frases)
//   PATCH  /api/videos/<c>/estilos/<estilo> { nombre?, nota?, para? }: cambiarle el nombre, la nota o para qué es
//   DELETE /api/videos/<c>/estilos/<estilo> Quitarlo (los videos hechos con él no cambian)
//   POST   /api/videos/<c>/<id>/estilo      { nombre, nota?, para? }: «Guardar como estilo»: las REGLAS del guion guardado
//                                           (no su letra ni sus imágenes) pasan al kit del cliente (gratis, sin IA)
//   POST   /api/videos/<c>/<id>/aplicar-estilo { estiloId, version }: imponer un estilo guardado al guion (una versión
//                                           nueva, en borrador; no cambia lo que se dice ni lo que se lee)
//   GET    /api/videos/<c>/<id>/versiones   El historial: las versiones de antes del guion
//   POST   /api/videos/<c>/<id>/versiones   { version, aVersion }: volver a una (crea una versión nueva con su guion)
//   POST   /api/videos/<c>/escribir         { idea, segundos?, formato?, postId?, estructuraId?, conFondos?, estiloId? }: la IA de texto ESCRIBE el
//                                           guion (formato v1, validado; si sale con errores se le devuelven una vez)
//                                           siguiendo la ESTRUCTURA de guion escogida (o la que escoja la IA entre las de
//                                           voz en off: vuelve en `estructura`). No guarda nada: la pantalla lo abre como
//                                           borrador sin guardar. Texto, sin confirmación
//   POST   /api/videos/<c>/con-musica       { postId, calendarId?, musicaId?, segundos?, movimiento?, logo? }: «Publicar con
//                                           música»: el post de UNA foto pasa a un video animado de una escena (la foto a
//                                           sangre con su movimiento y la música en su sonido), aprobado y renderizándose;
//                                           al terminar la publicación es un reel con la foto de portada. No gasta IA
//                                           (worker/lib/estudio/conMusica.js). 503 sin Container, 409 `sin_musica`
//   POST   /api/videos/<c>/cancion          { musicaId, letra, confirmado }: «Video con tu canción»: SINCRONIZA la letra con
//                                           una canción ya grabada de la biblioteca de sonido (del cliente o de la agencia):
//                                           ElevenLabs alinea la letra (y aísla la voz si hace falta), si no Gemini la oye.
//                                           Siempre pide confirmar: sin `confirmado`, 409 con el costo (aproximado). La misma
//                                           canción con la misma letra otra vez sale gratis (`repetida`). → { sincronia }
//   POST   /api/videos/<c>/cancion/video    { huella, modo: "karaoke" | "ia", formato?, titulo?, postId?, calendarId?,
//                                           desplazamiento?, indicacion?, conFondos?, estiloId? }: crea el BORRADOR con la canción como su
//                                           locución: la prueba de sincronía (gratis) o las escenas diseñadas por la IA
//                                           (texto); con `estiloId`, en la forma de ese estilo guardado
//   PUT    /api/videos/<c>/<id>/cancion     { desplazamiento }: el ajuste fino de la letra (±1,5 s; gratis, sin versión)
//   POST   /api/videos/<c>/<id>/cancion     { confirmado }: «Volver a sincronizar» la canción del video (pide confirmar)
//   GET    /api/videos/<c>/musicas          { musicas, efectos }: la BIBLIOTECA DE SONIDO del cliente y la de la agencia
//                                           (`de: "agencia"`), la música de la marca primero (worker/lib/estudio/sonidos.js)
//   POST   /api/videos/<c>/musicas          Subir una (multipart: archivo, duracion?; MP3, WAV o M4A, ≤ 15 MB)
//   POST   /api/videos/<c>/musicas/generar  { estilo, instrumental?, letra?, duracion?, titulo?, evitar?, modelo?, videoId?,
//                                           confirmado }: GENERARLA con Suno por Kie (un trabajo del Estudio; dos
//                                           versiones a la galería). Siempre pide confirmar: sin `confirmado`, 409 con el
//                                           costo. Con `videoId` y sin estilo, lo escribe el DIRECTOR MUSICAL (el 409 trae su
//                                           `propuesta`), la duración es la del video y la primera versión queda en su sonido
//   POST   /api/videos/<c>/musicas/marca    { archivoId }: «Me gusta esta»: una música GENERADA pasa a ser referencia de la
//                                           música de la marca en el kit (su estilo; gratis)
//   POST   /api/videos/<c>/<id>/musica      «Proponer la música para este video»: el DIRECTOR MUSICAL lee el guion guardado
//                                           (con la locución si está lista), el kit y al cliente, y escribe el pedido para
//                                           Suno con su porqué, y `biblioteca`: lo que YA hay en la biblioteca de sonido que
//                                           encaja (gratis). No guarda nada en el video ni pide a Suno; texto, sin
//                                           confirmación (worker/lib/estudio/directorMusical.js)
//
// El guion lo valida `validarGuion` (src/lib/videoEscenas.js) aquí, en el servidor: lo que llega del navegador, del
// asistente o de Claude por MCP no se cree. Un guion con errores NO se guarda: vuelve 400 con la lista de errores,
// cada uno con su sitio, para que quien lo escribió lo corrija.
//
// `version` en el PUT y en aprobar es la que se leyó: si otra persona guardó entremedias, 409 en vez de pisarla (dos
// personas del equipo pueden tener el mismo video abierto).
//
// Lo único que gasta aquí es la voz (worker/lib/estudio/locucion.js) y la música de Suno (worker/lib/estudio/musica.js),
// y siempre con su confirmación de costo.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import {
  deFila, listarProyectos, crearProyecto, guardarProyecto, aprobarProyecto, ErrorVideo, ID_VIDEO as ID,
  guardarSonido, versionesDe, volverAVersion, publicacionDelCliente,
} from "../lib/videosProyectos.js";
import { musicasDe, efectosDe, subirSonido, ErrorSonido } from "../lib/estudio/sonidos.js";
import { ErrorEstudio } from "../lib/estudio/trabajos.js";
import { listarVoces, pedirMuestra, pedirLocucion, locucionAlDia, claveDeMuestra, HUELLA, ErrorVoz, viaDeVoz, fijarVozDeMarca } from "../lib/estudio/locucion.js";
import { buscarEnBiblioteca, anadirDeLaBiblioteca, previaGratis, ACENTOS_BIBLIOTECA } from "../lib/estudio/elevenlabs.js";
import { ErrorMotor } from "../lib/estudio/gemini.js";
import { escribirGuion, ErrorGuion } from "../lib/estudio/guionAnimado.js";
import { estructuraExistente } from "../lib/estructurasGuion.js";
import { ErrorIA } from "../lib/cerebro/ia.js";
import { pedirMusica, ErrorMusica } from "../lib/estudio/musica.js";
import { proponerMusica, musicaALaMarca, resumenDelAnalisis, ErrorDirectorMusical } from "../lib/estudio/directorMusical.js";
import { pedidoConClips, alContenedor } from "../lib/estudio/cuadros.js";
import { pedirRender, renderAlDia, ligarAPublicacion } from "../lib/estudio/render.js";
import { publicarConMusica } from "../lib/estudio/conMusica.js";
import { pedirFondos, estadoDeFondos } from "../lib/estudio/fondosVideo.js";
import { costoDeVoz, fraseDeMuestra, modeloDeVoz, esIdDeVoz } from "../../src/lib/voces.js";
import { sincronizarCancion, crearVideoConCancion, ajustarCancion, resincronizarVideo, resumenDeSincronia, ErrorCancion } from "../lib/estudio/cancion.js";
import { estilosDelCliente, estiloDelCliente, guardarEstilo, cambiarEstilo, quitarEstilo, aplicarEstiloAVideo, ErrorEstilo } from "../lib/estudio/estilosVideo.js";

/** Un ErrorCancion como respuesta: su mensaje, su estado y lo que la pantalla necesita (`codigo`, `costo`…). */
const respuestaDeCancion = (e) => json({ error: e.message, ...e.extra }, e.estado);
const texto = (v) => (typeof v === "string" ? v : "");

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
    if (e instanceof ErrorEstilo) return error(e.message, e.estado);
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
      // La estructura de guion que siguió (la devolvió «escribir»): se apunta sólo si existe en el espacio.
      const estructuraId = await estructuraExistente(acceso, b.estructuraId);
      const r = await crearProyecto(acceso, cliente, { guion: b.guion, titulo: b.titulo, calendarId: b.calendarId, postId: b.postId, usuario, estructuraId });
      avisar(env, acceso, usuario, req, clienteId, r.video.id);
      return json(r, 201);
    }
    return error("Método no permitido.", 405);
  }

  // Escribir el guion con IA (no guarda: lo revisa la persona en la pantalla).
  if (id === "escribir" && !accion) {
    if (metodo !== "POST") return error("Método no permitido.", 405);
    const b = (await cuerpo(req)) ?? {};
    // Un estilo guardado del cliente: la IA escribe con él delante y el código impone su forma.
    const estilo = typeof b.estiloId === "string" && b.estiloId ? estiloDelCliente(cliente, b.estiloId) : null;
    try {
      const r = await escribirGuion(env, acceso, cliente, {
        idea: b.idea, segundos: b.segundos, formato: b.formato, postId: typeof b.postId === "string" ? b.postId : "",
        estructuraId: typeof (b.estructuraId ?? b.formulaId) === "string" ? b.estructuraId ?? b.formulaId : "",
        conFondos: b.conFondos === true, estilo,
      });
      const publicacion = r.postId ? await publicacionDelCliente(acceso, clienteId, r.postId) : null;
      return json({
        guion: r.guion, avisos: r.avisos, corregido: r.corregido, aviso: r.aviso, publicacion, estructura: r.estructura,
        referencias: r.referencias ?? 0, fondos: r.fondos ?? 0, ...(estilo ? { estilo: { id: estilo.id, nombre: estilo.nombre } } : {}),
      });
    } catch (e) {
      if (e instanceof ErrorGuion || e instanceof ErrorIA) return error(e.message, e.estado ?? 502);
      throw e;
    }
  }

  if (id === "voces") return rutasVoces(req, env, { acceso, usuario, cliente, sub: accion, metodo });

  // Los ESTILOS DE VIDEO guardados del cliente (en su kit; gratis, sin IA).
  if (id === "estilos") {
    if (!accion && metodo === "GET") return json({ estilos: estilosDelCliente(cliente) });
    if (accion && (metodo === "PATCH" || metodo === "DELETE")) {
      const r = metodo === "DELETE"
        ? await quitarEstilo(env, acceso, cliente, accion)
        : await (async () => { const b = (await cuerpo(req)) ?? {}; return cambiarEstilo(env, acceso, cliente, accion, { nombre: b.nombre, nota: b.nota, para: b.para }); })();
      difundir(env, acceso.ownerId, { tipo: "estudio", clientId: cliente.id, por: firma(usuario, req) });
      return json(r);
    }
    return error("Método no permitido.", 405);
  }

  // Las músicas de fondo del cliente y de la AGENCIA (la biblioteca de sonido), con sus efectos: listar y subir (gratis).
  if (id === "musicas" && !accion) {
    if (metodo === "GET") {
      const [musicas, efectos] = await Promise.all([musicasDe(acceso, clienteId), efectosDe(acceso, clienteId)]);
      return json({ musicas, efectos });
    }
    if (metodo === "POST") {
      try {
        const form = await req.formData().catch(() => null);
        const r = await subirSonido(env, acceso, { cliente, archivo: form?.get("archivo"), categoria: "musica", duracion: form?.get("duracion") ?? null, usuario });
        difundir(env, acceso.ownerId, { tipo: "sonidos", clienteId, por: firma(usuario, req) });
        return json({ musica: { id: r.pista.id, nombre: r.pista.nombre, src: r.pista.src }, pista: r.pista, repetido: r.repetido }, 201);
      } catch (e) {
        if (e instanceof ErrorSonido) return error(e.message, e.estado ?? 400);
        throw e;
      }
    }
    return error("Método no permitido.", 405);
  }

  // «Publicar con música»: la foto de un post → un reel con su música (crea, aprueba y renderiza; no gasta IA).
  if (id === "con-musica" && !accion) {
    if (metodo !== "POST") return error("Método no permitido.", 405);
    const b = (await cuerpo(req)) ?? {};
    const r = await publicarConMusica(env, acceso, cliente, {
      postId: typeof b.postId === "string" ? b.postId : "", calendarId: typeof b.calendarId === "string" ? b.calendarId : null,
      musicaId: typeof b.musicaId === "string" ? b.musicaId : "", segundos: b.segundos, movimiento: b.movimiento,
      logo: typeof b.logo === "boolean" ? b.logo : undefined, usuario, por: firma(usuario, req),
    });
    avisar(env, acceso, usuario, req, clienteId, r.video.id);
    return json(r, 202);
  }

  // «Me gusta esta»: una música generada pasa a referencia de la música de la marca (en el kit guardado).
  if (id === "musicas" && accion === "marca") {
    if (metodo !== "POST") return error("Método no permitido.", 405);
    const b = (await cuerpo(req)) ?? {};
    try {
      const musica = await musicaALaMarca(env, acceso, cliente, typeof b.archivoId === "string" ? b.archivoId : "");
      difundir(env, acceso.ownerId, { tipo: "estudio", clientId: cliente.id, por: firma(usuario, req) });
      return json({ musica });
    } catch (e) {
      if (e instanceof ErrorDirectorMusical || e instanceof ErrorEstudio) return error(e.message, e.estado ?? 400);
      throw e;
    }
  }

  // Generar una música con Suno: siempre con su confirmación de costo.
  if (id === "musicas" && accion === "generar") {
    if (metodo !== "POST") return error("Método no permitido.", 405);
    const b = (await cuerpo(req)) ?? {};
    let video = null;
    if (b.videoId) {
      if (!ID.test(String(b.videoId))) return noEncontrado("Video");
      video = await acceso.leerUno("videos_proyectos", { id: String(b.videoId), client_id: clienteId });
      if (!video) return noEncontrado("Video");
    }
    try {
      const r = await pedirMusica(env, acceso, cliente, {
        estilo: b.estilo, letra: b.letra, instrumental: typeof b.instrumental === "boolean" ? b.instrumental : undefined,
        duracion: b.duracion, titulo: b.titulo, evitar: b.evitar, modelo: b.modelo, video, confirmado: b.confirmado === true, usuario,
      });
      return json(r, 202);
    } catch (e) {
      if (e instanceof ErrorMusica) return respuestaDeVoz(e);
      throw e;
    }
  }

  // «Video con tu canción»: sincronizar la letra (paga, con su confirmación) y crear el borrador con ella.
  if (id === "cancion") {
    if (metodo !== "POST") return error("Método no permitido.", 405);
    const b = (await cuerpo(req)) ?? {};
    try {
      if (!accion) {
        const s = await sincronizarCancion(env, acceso, cliente, { musicaId: texto(b.musicaId), letra: texto(b.letra), confirmado: b.confirmado === true, usuario });
        return json({ sincronia: resumenDeSincronia(s, { desplazamiento: b.desplazamiento }), repetida: Boolean(s.repetida) });
      }
      if (accion === "video") {
        const r = await crearVideoConCancion(env, acceso, cliente, {
          huella: texto(b.huella), modo: b.modo === "ia" ? "ia" : "karaoke", formato: texto(b.formato) || "9:16", titulo: texto(b.titulo),
          postId: texto(b.postId), calendarId: texto(b.calendarId), desplazamiento: b.desplazamiento, indicacion: texto(b.indicacion),
          conFondos: b.conFondos === true, estiloId: texto(b.estiloId), usuario,
        });
        avisar(env, acceso, usuario, req, clienteId, r.video.id);
        return json(r, 201);
      }
      return noEncontrado("Canción");
    } catch (e) {
      if (e instanceof ErrorCancion) return respuestaDeCancion(e);
      throw e;
    }
  }

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
    const { pedido } = await pedidoConClips(env, acceso, cliente, fila, { formato: u.get("formato") ?? "" });
    if (accion === "revision") {
      const formatos = (u.get("formatos") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      return json(await (await alContenedor(env, "/revisar", { ...pedido, formatos })).json());
    }
    const r = await alContenedor(env, `/${accion}`, { ...pedido, t: Number(u.get("t")) || 0, ancho: Number(u.get("ancho")) || (accion === "hoja" ? 1080 : 540) });
    const cabeceras = { "Content-Type": r.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    for (const k of ["X-Escena", "X-Segundo", "X-Total", "X-Faltan"]) if (r.headers.get(k) !== null) cabeceras[k] = r.headers.get(k);
    return new Response(r.body, { headers: cabeceras });
  }

  // «Proponer la música para este video»: el director musical lee el guion GUARDADO (no lo que haya sin guardar en la
  // pantalla) y propone; no toca el video ni pide nada a Suno, así que no pide la versión.
  if (accion === "musica" && metodo === "POST") {
    try {
      const r = await proponerMusica(env, acceso, cliente, fila);
      return json({ propuesta: r.propuesta, video: resumenDelAnalisis(r.analisis), aviso: r.aviso, modelo: r.modelo, biblioteca: r.biblioteca ?? [] });
    } catch (e) {
      if (e instanceof ErrorDirectorMusical) return error(e.message, e.estado);
      throw e;
    }
  }

  // Las IMÁGENES DE FONDO por sección (los fondos por crear del guion GUARDADO): cuántas faltan y crearlas con el director
  // (un encargo del servidor; siempre con su costo dicho antes). No pide la versión: al terminar se ponen sobre la de ahora.
  if (accion === "fondos" && metodo === "GET") return json(await estadoDeFondos(env, acceso, cliente, fila));
  if (accion === "fondos" && metodo === "POST") {
    const bf = (await cuerpo(req)) ?? {};
    const r = await pedirFondos(env, acceso, cliente, fila, { confirmado: bf.confirmado === true, usuario });
    return json(r, 202);
  }

  const b = (await cuerpo(req)) ?? {};
  if (!accion && metodo === "PUT") {
    const r = await guardarProyecto(acceso, cliente, fila, { guion: b.guion, titulo: b.titulo, version: b.version, por: usuario?.nombre ?? null });
    if (r.cambio) avisar(env, acceso, usuario, req, clienteId, id);
    return json({ video: r.video, avisos: r.avisos });
  }

  // La canción del video: el ajuste fino (PUT, gratis) o «Volver a sincronizar» (POST, pide confirmar). No tocan el guion.
  if (accion === "cancion" && (metodo === "PUT" || metodo === "POST")) {
    try {
      const r = metodo === "PUT"
        ? await ajustarCancion(acceso, cliente, fila, { desplazamiento: b.desplazamiento })
        : await resincronizarVideo(env, acceso, cliente, fila, { confirmado: b.confirmado === true, usuario });
      avisar(env, acceso, usuario, req, clienteId, id);
      return json(r);
    } catch (e) {
      if (e instanceof ErrorCancion) return respuestaDeCancion(e);
      throw e;
    }
  }

  // «Guardar como estilo»: las reglas del guion guardado pasan al kit del cliente (no toca el video).
  if (accion === "estilo" && metodo === "POST") {
    const r = await guardarEstilo(env, acceso, cliente, fila, { nombre: b.nombre, nota: b.nota, para: b.para }, usuario);
    difundir(env, acceso.ownerId, { tipo: "estudio", clientId: cliente.id, por: firma(usuario, req) });
    return json(r, 201);
  }

  // A qué publicación va: no toca el guion, así que no pide la versión.
  if (accion === "publicacion" && metodo === "POST") {
    const r = await ligarAPublicacion(env, acceso, cliente, fila, {
      postId: typeof b.postId === "string" ? b.postId : null, calendarId: typeof b.calendarId === "string" ? b.calendarId : null, por: firma(usuario, req),
    });
    return json(r);
  }

  // El sonido (efectos y música): tampoco toca el guion ni la voz.
  if (accion === "sonido" && metodo === "PUT") {
    // Sin `efectosPropios` en el cuerpo (una pantalla de antes), los de la biblioteca que ya tenía se quedan.
    const efectosPropios = b.efectosPropios === undefined ? deFila(fila).sonido.efectosPropios ?? null : b.efectosPropios;
    const r = await guardarSonido(acceso, cliente, fila, { efectos: b.efectos, musica: b.musica ?? null, efectosPropios });
    avisar(env, acceso, usuario, req, clienteId, id);
    return json(r);
  }

  if (accion === "versiones" && metodo === "GET") return json({ versiones: await versionesDe(acceso, clienteId, fila), actual: fila.version });

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

  if (accion === "versiones" && metodo === "POST") {
    const r = await volverAVersion(acceso, cliente, fila, { version: b.version, aVersion: b.aVersion, por: usuario?.nombre ?? null });
    avisar(env, acceso, usuario, req, clienteId, id);
    return json({ video: r.video, avisos: r.avisos });
  }

  // Imponer un estilo guardado al guion (una versión nueva, en borrador).
  if (accion === "aplicar-estilo" && metodo === "POST") {
    const r = await aplicarEstiloAVideo(acceso, cliente, fila, { estiloId: texto(b.estiloId), version: b.version, por: usuario?.nombre ?? null });
    if (r.cambios) avisar(env, acceso, usuario, req, clienteId, id);
    return json(r);
  }

  if (accion === "aprobar" && metodo === "POST") {
    const r = await aprobarProyecto(acceso, cliente, fila, { version: b.version, usuario });
    avisar(env, acceso, usuario, req, clienteId, id);
    return json(r);
  }

  return error("Método no permitido.", 405);
}
