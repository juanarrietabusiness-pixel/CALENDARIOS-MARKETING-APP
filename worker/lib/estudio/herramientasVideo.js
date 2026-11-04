// ============================================================
// El VIDEO ANIMADO desde el asistente y desde Claude (MCP)
//
//   · formato_video    el formato de escenas v1 contado a la IA (sale del mismo vocabulario que valida)
//   · listar_videos    los proyectos de un cliente, con su estado y su versión
//   · ver_video        uno entero: estado, qué falta, la línea de tiempo por escena, la locución y el guion (JSON)
//   · crear_video      un proyecto nuevo (borrador), ligado o no a una publicación
//   · guardar_video    reescribe el guion y/o el título (con la versión que se leyó)
//   · editar_escena    cambia, añade, mueve o quita UNA escena sin reescribir el resto
//   · aprobar_video    aprueba el guion de esa versión: con eso generar_locucion ya puede hacer la voz
//   · ver_cuadro       la IMAGEN de un instante (o de una escena, ya llena), dibujada por el Container con el mismo motor
//   · ver_escenas      una sola imagen con un cuadro de cada escena, numerados: el video entero de un vistazo
//   · revisar_video    la revisión antes de renderizar: subtítulos que tapan, texto que se sale o se parte, fuera de la
//                      zona segura, capas encimadas (con las fuentes reales)
//   · renderizar_video el mp4 (voz, escenas, subtítulos, -14 LUFS) en el Container: a la galería y a su publicación
//   · ligar_video      a qué publicación va (o ninguna); si el mp4 ya está hecho, se pone en ella ya
//
// Las tres de mirar devuelven { texto, imagenes } (no un texto): el MCP las manda como bloques de imagen y el
// asistente como imagen en su tool_result. No gastan IA: es cómputo del Container.
//
// Van por el MISMO camino que la pantalla (worker/lib/videosProyectos.js): el guion se valida en el servidor, un error
// vuelve con su sitio, y la versión que se leyó evita pisar lo que otra persona cambió. Ninguna gasta IA: lo único que
// cuesta es la voz (generar_locucion, que se confirma siempre). El render es cómputo del Container (céntimos de céntimo).
//
// APROBAR ES DE UNA PERSONA. La herramienta existe para que Claude no tenga que mandar a nadie a la pantalla, pero la
// descripción le dice que sólo apruebe cuando la persona lo pida o lo confirme, igual que con el costo.
// ============================================================

import { difundir } from "../vivo.js";
import {
  deFila, listarProyectos, proyectoDe, crearProyecto, guardarProyecto, editarEscena, aprobarProyecto, publicacionDelCliente, ErrorVideo,
} from "../videosProyectos.js";
import { locucionAlDia } from "./locucion.js";
import { lineaDeTiempo, NOMBRE_ESTADO_VIDEO, NOMBRE_TIPO_ESCENA, puedeGenerarVoz, sinEtiquetas, palabrasMudas, palabrasDe, textoDeLocucion } from "../../../src/lib/videoEscenas.js";
import { formatoParaLaIA } from "../../../src/lib/videoFormatoIA.js";
import { textoDeSubtitulo } from "../../../src/lib/subtitulos.js";
import { instanteLleno } from "../../../src/lib/revisionEscenas.js";
import { pedidoDelVideo, alContenedor, respuestaEnBase64 } from "./cuadros.js";
import { pedirRender, renderAlDia, ligarAPublicacion } from "./render.js";

const clienteParam = { cliente: { type: "string", description: "Nombre del cliente. En el asistente de un cliente se puede omitir: es ese cliente." } };
const videoParam = { video_id: { type: "string", description: "ID del proyecto de video (de listar_videos o crear_video)." } };
const versionParam = { version: { type: "integer", description: "La versión que leíste con ver_video (o la que devolvió el último cambio). Si otra persona lo cambió después, no se pisa." } };
const guionParam = { type: "object", description: "El guion entero en el formato de escenas v1 (formato_video). Se valida en el servidor." };

export const DEFINICIONES_VIDEO = Object.freeze([
  {
    name: "formato_video",
    description: "El FORMATO de escenas v1 del video animado: las reglas, los tipos de escena, los componentes con sus propiedades y un ejemplo que valida. Léelo antes de escribir o editar un guion. No gasta nada.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listar_videos",
    description: "Los videos animados de un cliente: ID, título, estado (borrador, guion aprobado, con locución…), versión y si va ligado a una publicación. No gasta nada.",
    input_schema: { type: "object", properties: { ...clienteParam } },
  },
  {
    name: "ver_video",
    description: "Un video animado entero: su estado, qué falta para el siguiente paso, la duración y cuándo empieza cada escena (estimado a 2,5 palabras por segundo hasta que haya voz; con la locución, los tiempos reales), la locución y el guion en JSON con su versión. Úsalo antes de editarlo. No gasta nada.",
    input_schema: { type: "object", properties: { ...clienteParam, ...videoParam }, required: ["video_id"] },
  },
  {
    name: "crear_video",
    description: "Crea un video animado (borrador) para un cliente con su guion en el formato de escenas v1 (lee formato_video antes). Opcional: publicacion_id para ligarlo a su post del calendario. Si el guion tiene errores no se crea y la respuesta dice cada uno con su sitio. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, guion: guionParam,
        titulo: { type: "string", description: "Nombre del video (si se omite, el del guion)." },
        publicacion_id: { type: "string", description: "ID de la publicación del calendario a la que va (de ver_calendario)." },
      },
      required: ["guion"],
    },
  },
  {
    name: "guardar_video",
    description: "Reescribe el guion entero y/o el título de un video. Un guion distinto sube la versión y lo devuelve a BORRADOR (si estaba aprobado, hay que aprobarlo otra vez). Para tocar una sola escena, mejor editar_escena. No gasta nada.",
    input_schema: {
      type: "object",
      properties: { ...clienteParam, ...videoParam, ...versionParam, guion: guionParam, titulo: { type: "string" } },
      required: ["video_id", "version"],
    },
  },
  {
    name: "editar_escena",
    description: "Cambia UNA escena sin reescribir el guion: «escena» con el id de una que existe la reemplaza (con «posicion», además la mueve); con un id nuevo la añade en «posicion» (1 = la primera) o al final. «quitar» con un id la borra. El guion entero se valida y, si cambia, vuelve a borrador con la versión siguiente. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, ...videoParam, ...versionParam,
        escena: { type: "object", description: "La escena completa (con su id), en el formato de escenas v1." },
        posicion: { type: "integer", description: "Dónde va: 1 = la primera." },
        quitar: { type: "string", description: "El id de la escena que se borra (en vez de «escena»)." },
      },
      required: ["video_id", "version"],
    },
  },
  {
    name: "aprobar_video",
    description: "Aprueba el guion de esa versión: desde ahí generar_locucion puede hacer la voz. APROBAR ES DE LA PERSONA: llámala sólo si te lo pidió o lo confirmó después de ver el guion; nunca por tu cuenta. Sólo se aprueba un borrador sin errores. No gasta nada.",
    input_schema: { type: "object", properties: { ...clienteParam, ...videoParam, ...versionParam }, required: ["video_id", "version"] },
  },
  {
    name: "ver_cuadro",
    description: "Una IMAGEN del video animado en un instante, dibujada con el mismo motor que la vista previa y el render: para revisar cómo queda antes de renderizar. Con «escena» (su id) da esa escena ya llena (cuando entró todo); con «segundo», ese instante. Sin ninguno, la primera escena. No gasta IA.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, ...videoParam,
        escena: { type: "string", description: "El id de una escena (de ver_video)." },
        segundo: { type: "number", description: "El instante en segundos del video." },
        formato: { type: "string", enum: ["9:16", "1:1", "16:9"], description: "Si se omite, el principal del guion." },
      },
      required: ["video_id"],
    },
  },
  {
    name: "ver_escenas",
    description: "Una sola IMAGEN con un cuadro de cada escena (cada una ya llena), numeradas con su segundo: el video entero de un vistazo. Úsala para revisar el ritmo y el diseño de todo el guion; luego ver_cuadro para mirar de cerca una. No gasta IA.",
    input_schema: {
      type: "object",
      properties: { ...clienteParam, ...videoParam, formato: { type: "string", enum: ["9:16", "1:1", "16:9"] } },
      required: ["video_id"],
    },
  },
  {
    name: "revisar_video",
    description: "Revisa el video antes de renderizar, con las fuentes reales: subtítulos que tapan un texto, texto que no cabe y se sale o se parte de más, texto encogido hasta no leerse, cosas fuera de la zona segura (donde las tapan los botones de la red) y capas encimadas. Cada problema dice la escena, el segundo y qué cambiar. Corrígelos con editar_escena y vuelve a revisar. No gasta IA.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, ...videoParam,
        formatos: { type: "array", items: { type: "string", enum: ["9:16", "1:1", "16:9"] }, description: "Si se omite, los del guion." },
      },
      required: ["video_id"],
    },
  },
  {
    name: "renderizar_video",
    description: "RENDERIZA el video a mp4 (1080 de ancho, 30 cuadros por segundo): las escenas con el mismo motor de la vista previa, la voz con sus silencios, los subtítulos por palabra y el volumen a -14 LUFS. Sólo con el guion aprobado y su locución lista de esa versión. Tarda menos de un minuto: el mp4 queda en la galería del cliente y, si el video va ligado a una publicación, en sus medios (en el sitio del anterior). Mira el resultado después con ver_video. Revisa antes con revisar_video. No gasta IA.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, ...videoParam, ...versionParam,
        publicacion_id: { type: "string", description: "Opcional: la publicación del calendario donde se pone el mp4 al salir (de ver_calendario). Si se omite, la que ya tenga ligada." },
      },
      required: ["video_id", "version"],
    },
  },
  {
    name: "ligar_video",
    description: "Liga el video animado a una publicación del calendario del cliente (de ver_calendario), o lo desliga con publicacion_id vacío. Si el mp4 ya está renderizado, se pone en esa publicación YA (primero en sus medios, o en el sitio del mp4 anterior de este video); si no, se pondrá al terminar el render. Desligar no quita el mp4 del post de antes. No gasta nada.",
    input_schema: {
      type: "object",
      properties: { ...clienteParam, ...videoParam, publicacion_id: { type: "string", description: "ID de la publicación; vacío para desligarlo." } },
      required: ["video_id", "publicacion_id"],
    },
  },
]);

/** Las que escriben (en el MCP van como escritura; las demás, de sólo lectura). */
export const ESCRIBEN_VIDEO = Object.freeze(["crear_video", "guardar_video", "editar_escena", "aprobar_video", "renderizar_video", "ligar_video"]);

/** Lo que falta para el siguiente paso, en una frase para el modelo. Pura. */
/** ¿La locución es de la versión aprobada? (un video «aprobado» con voz de esa versión ya no la necesita otra vez). */
const vozDeEstaVersion = (video) => video.locucion?.estado === "lista" && !video.locucion.desfasada
  && video.locucion.version === video.version && video.version === video.aprobadaVersion;

export function siguientePaso(video) {
  if (!video.valido) return "Corregir los errores del guion (abajo) con guardar_video o editar_escena.";
  switch (video.estado) {
    case "borrador": return "Que la persona revise el guion y lo apruebe (aprobar_video con esta versión, sólo con su sí).";
    case "aprobado":
      if (vozDeEstaVersion(video)) return "Ya tiene la locución de esta versión. Siguiente: revisar_video y, si está bien, renderizar_video.";
      return video.locucion?.estado === "generando"
        ? "La voz se está generando: vuelve a mirar en un minuto."
        : "Generar la voz con generar_locucion (siempre pide confirmar el costo).";
    case "con_voz": return "Tiene guion aprobado y voz. Siguiente: revisar_video y, si está bien, renderizar_video.";
    case "renderizando": return "Se está renderizando (menos de un minuto): vuelve a mirar con ver_video.";
    case "renderizado": return video.render?.adjunto ? "Listo: el mp4 está en la galería y en su publicación." : "Listo: el mp4 está en la galería del cliente.";
    case "fallido": return "Falló el render (el motivo, arriba): corrígelo y vuelve a pedirlo con renderizar_video.";
    default: return "";
  }
}

/** Las palabras del final que la voz no dijo (`palabrasMudas`), dichas para el modelo. */
function mudasDe(video) {
  const mudas = palabrasMudas(video.locucion?.palabras);
  if (!mudas.length || !video.guion) return "";
  const dichas = palabrasDe(textoDeLocucion(video.guion));
  return ` · OJO: la voz NO dijo «${mudas.map((i) => textoDeSubtitulo(dichas[i] ?? "")).filter(Boolean).join(" ")}» (sin tiempo al final): hay que generar la locución otra vez o acortar el cierre`;
}

/** El resumen que ve el modelo de un video. */
function textoDelVideo(video, { conGuion = true } = {}) {
  const linea = video.guion?.escenas?.length ? lineaDeTiempo(video.guion, video.locucion?.palabras ?? null) : null;
  const loc = video.locucion ?? {};
  const voz = loc.estado === "lista"
    ? `Locución lista: ${loc.voz?.nombre ?? "?"} (${loc.modelo ?? "?"}), ${Number(loc.duracion ?? 0).toFixed(1)} s, tiempos ${loc.fuente === "motor" ? "del motor" : loc.fuente === "verificado" ? "verificados al oírla" : "estimados"}${loc.revisar ? " · OJO: no se oyó todo el guion tal cual" : ""}${mudasDe(video)}${loc.desfasada ? " · es de una versión anterior del guion" : ""}.`
    : loc.estado === "generando" ? `La voz se está generando (pedido ${loc.trabajoId}).`
      : loc.estado === "fallida" ? `La voz falló: ${loc.error ?? "sin motivo"}.` : "Sin locución todavía.";
  const r = video.render ?? {};
  const render = r.estado === "listo"
    ? `Render: mp4 de ${Number(r.duracion ?? 0).toFixed(1)} s, ${r.ancho}×${r.alto}, ${(Number(r.bytes ?? 0) / 1048576).toFixed(1)} MB${r.lufs !== null && r.lufs !== undefined ? `, ${r.lufs} LUFS` : ""}, de la versión ${r.version} (en /api/media/${r.clave})${r.adjunto ? ", puesto en su publicación" : ""}${r.aviso ? ` · ${r.aviso}` : ""}.`
    : r.estado === "en_curso" ? `Render en curso desde ${String(r.pedidoAt ?? "").slice(11, 19)} (UTC).`
      : r.estado === "fallido" ? `El render falló: ${r.error ?? "sin motivo"}.` : "";
  return [
    `Video «${video.titulo}» (ID ${video.id}) — ${NOMBRE_ESTADO_VIDEO[video.estado] ?? video.estado}, versión ${video.version}${video.aprobadaVersion ? ` (aprobada la ${video.aprobadaVersion})` : ""}.`,
    video.postId ? `Ligado a la publicación ${video.postId}.` : "Sin publicación ligada.",
    render,
    linea ? `Duración: ${linea.total.toFixed(1)} s${linea.estimado ? " (estimada: aún no hay voz)" : ""}, ${linea.escenas.length} escenas.` : "Sin escenas válidas.",
    voz,
    `Siguiente paso: ${siguientePaso(video)}`,
    video.errores?.length ? `ERRORES:\n${video.errores.map((e) => `· ${e.donde}: ${e.mensaje}`).join("\n")}` : "",
    linea ? `Escenas:\n${linea.escenas.map((e, i) => {
      const esc = video.guion.escenas[i];
      return `${i + 1}. ${e.id} · ${NOMBRE_TIPO_ESCENA[esc.tipo] ?? esc.tipo} · ${e.desde.toFixed(1)}–${e.hasta.toFixed(1)} s · «${sinEtiquetas(esc.habla ?? "").slice(0, 90)}»${esc.pantalla ? ` · en pantalla: «${esc.pantalla}»` : ""}`;
    }).join("\n")}` : "",
    conGuion ? `Guion (JSON, versión ${video.version}):\n${JSON.stringify(video.guion)}` : "",
  ].filter(Boolean).join("\n");
}

/** Un ErrorVideo dicho para el modelo: el motivo y, si los hay, los errores con su sitio. */
function textoDelError(e) {
  const errores = e.extra?.errores ?? [];
  return `${e.message}${errores.length ? `\n${errores.map((x) => `· ${x.donde}: ${x.mensaje}`).join("\n")}` : ""}`;
}

/**
 * Las acciones. `Fallo` es la clase de error que quien llama sabe devolver al modelo (la del Estudio). `por`: la firma
 * del aviso al espacio, para que la pantalla de quien lo tenga abierto se ponga al día.
 */
export function crearHerramientasVideo({ env, acceso, resolverCliente, usuario, por, Fallo }) {
  const avisar = (clienteId, id) => difundir(env, acceso.ownerId, { tipo: "videos", clienteId, id, por });
  /** Corre una acción y devuelve un ErrorVideo como error legible (con sus errores). */
  const conErrores = async (f) => {
    try {
      return await f();
    } catch (e) {
      if (e instanceof ErrorVideo) throw new Fallo(textoDelError(e));
      throw e;
    }
  };

  return {
    async formato_video() {
      return formatoParaLaIA();
    },

    async listar_videos({ cliente }) {
      const c = await resolverCliente(cliente);
      const lista = await listarProyectos(acceso, c.id);
      if (!lista.length) return `${c.name} no tiene videos animados todavía. Para crear uno: formato_video y después crear_video.`;
      return [`Videos animados de ${c.name}:`, ...lista.map((v) =>
        `· ${v.id} — «${v.titulo}» · ${v.nombreEstado} · versión ${v.version}${v.post_id ? ` · publicación ${v.post_id}` : ""} · ${String(v.updated_at).slice(0, 10)}`)].join("\n");
    },

    async ver_video({ cliente, video_id: id }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const video = deFila(await renderAlDia(acceso, await proyectoDe(acceso, c.id, id)));
        return textoDelVideo({ ...video, locucion: await locucionAlDia(acceso, video.locucion) });
      });
    },

    async crear_video({ cliente, guion, titulo, publicacion_id: postId }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        let liga = null;
        if (postId) {
          liga = await publicacionDelCliente(acceso, c.id, postId);
          if (!liga) throw new ErrorVideo(`No encontré la publicación «${postId}» en los calendarios de ${c.name} (los IDs salen de ver_calendario).`, 404);
        }
        const r = await crearProyecto(acceso, c, { guion, titulo, calendarId: liga?.calendarId, postId: liga?.postId, usuario });
        avisar(c.id, r.video.id);
        return [
          `Creado el video «${r.video.titulo}» (ID ${r.video.id}), versión 1, en borrador. Se ve en el Estudio de ${c.name} → Video → Animado con código.`,
          r.avisos.length ? `Avisos: ${r.avisos.map((a) => `${a.donde}: ${a.mensaje}`).join("; ")}` : "",
          textoDelVideo(r.video, { conGuion: false }),
        ].filter(Boolean).join("\n");
      });
    },

    async guardar_video({ cliente, video_id: id, version, guion, titulo }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const r = await guardarProyecto(acceso, c, fila, { guion, titulo, version });
        if (r.cambio) avisar(c.id, id);
        return [
          r.cambio ? `Guardado: ahora es la versión ${r.video.version} (${NOMBRE_ESTADO_VIDEO[r.video.estado]}).` : "No había nada que cambiar.",
          r.avisos.length ? `Avisos: ${r.avisos.map((a) => `${a.donde}: ${a.mensaje}`).join("; ")}` : "",
          textoDelVideo(r.video, { conGuion: false }),
        ].filter(Boolean).join("\n");
      });
    },

    async editar_escena({ cliente, video_id: id, version, escena, posicion, quitar }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const r = await editarEscena(acceso, c, fila, { version, escena, posicion, quitar });
        if (r.cambio) avisar(c.id, id);
        return [
          r.cambio ? `${r.que} Ahora es la versión ${r.video.version} (${NOMBRE_ESTADO_VIDEO[r.video.estado]}).` : "La escena ya estaba así: no cambió nada.",
          r.avisos.length ? `Avisos: ${r.avisos.map((a) => `${a.donde}: ${a.mensaje}`).join("; ")}` : "",
          textoDelVideo(r.video, { conGuion: false }),
        ].filter(Boolean).join("\n");
      });
    },

    async aprobar_video({ cliente, video_id: id, version }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const r = await aprobarProyecto(acceso, c, fila, { version, usuario });
        avisar(c.id, id);
        return `Guion aprobado (versión ${r.video.version}). ${puedeGenerarVoz({ ...fila, estado: "aprobado", aprobada_version: r.video.version, version: r.video.version })
          ? "Ya se puede generar la voz con generar_locucion (pide confirmar el costo)." : ""}`.trim();
      });
    },
    async renderizar_video({ cliente, video_id: id, version, publicacion_id: postId }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        let fila = await renderAlDia(acceso, await proyectoDe(acceso, c.id, id));
        // Primero a qué publicación va (si se pidió otra), luego el render.
        if (postId && postId !== fila.post_id) {
          await ligarAPublicacion(env, acceso, c, fila, { postId, por });
          fila = await proyectoDe(acceso, c.id, id);
        }
        const r = await pedirRender(env, acceso, c, fila, { version, usuario, por });
        return `Render encargado: «${r.video.titulo}» (versión ${r.video.version}) se está renderizando; tarda menos de un minuto. Míralo con ver_video.${fila.post_id ? ` Al terminar, el mp4 se pone en la publicación ${fila.post_id}.` : " No va ligado a ninguna publicación: queda en la galería (ligar_video para ponerlo en una)."}`;
      });
    },

    async ligar_video({ cliente, video_id: id, publicacion_id: postId }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await renderAlDia(acceso, await proyectoDe(acceso, c.id, id));
        const r = await ligarAPublicacion(env, acceso, c, fila, { postId: postId || null, por });
        if (!postId) return `«${fila.titulo}» ya no va ligado a ninguna publicación${fila.post_id ? ` (el mp4 que ya estuviera en ${fila.post_id} se queda ahí)` : ""}.`;
        if (r.puesto) return `Ligado a la publicación ${postId} y el mp4 ya está puesto en ella.`;
        if (r.aviso) return `Ligado a la publicación ${postId}, pero no se pudo poner el mp4: ${r.aviso}`;
        return `Ligado a la publicación ${postId}. Aún no hay mp4: se pondrá en ella al terminar el render (renderizar_video).`;
      });
    },

    async ver_cuadro({ cliente, video_id: id, escena, segundo, formato }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const { pedido, guion, palabras, faltan } = await pedidoDelVideo(env, acceso, c, fila, { formato });
        const linea = lineaDeTiempo(guion, palabras);
        let t = Number.isFinite(Number(segundo)) && segundo !== undefined && segundo !== null ? Number(segundo) : null;
        if (t === null) {
          const k = escena ? guion.escenas.findIndex((e) => e.id === escena) : 0;
          if (k < 0) throw new ErrorVideo(`No hay ninguna escena «${escena}». Las que hay: ${guion.escenas.map((e) => e.id).join(", ")}.`, 404);
          t = instanteLleno(guion, linea, k);
        }
        const r = await alContenedor(env, "/cuadro", { ...pedido, t, ancho: 540 });
        const cual = r.headers.get("X-Escena");
        return {
          texto: [
            `Cuadro de «${fila.titulo}» en el segundo ${Number(r.headers.get("X-Segundo") ?? t).toFixed(1)} de ${linea.total.toFixed(1)} (escena ${cual}, ${pedido.formato}${palabras ? "" : ", tiempos estimados: aún no hay voz"}).`,
            faltan.length ? `OJO: estas imágenes no están en la galería del cliente y salen como marcador: ${faltan.join(", ")}.` : "",
          ].filter(Boolean).join("\n"),
          imagenes: [{ mime: r.headers.get("Content-Type") ?? "image/jpeg", datos: await respuestaEnBase64(r) }],
        };
      });
    },

    async ver_escenas({ cliente, video_id: id, formato }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const { pedido, guion, palabras, faltan } = await pedidoDelVideo(env, acceso, c, fila, { formato });
        const r = await alContenedor(env, "/hoja", { ...pedido, ancho: 1080 });
        return {
          texto: [
            `Las ${guion.escenas.length} escenas de «${fila.titulo}» (${pedido.formato}), cada una ya llena, con su número, id y segundo${palabras ? "" : " (tiempos estimados: aún no hay voz)"}.`,
            faltan.length ? `OJO: estas imágenes no están en la galería y salen como marcador: ${faltan.join(", ")}.` : "",
          ].filter(Boolean).join("\n"),
          imagenes: [{ mime: r.headers.get("Content-Type") ?? "image/jpeg", datos: await respuestaEnBase64(r) }],
        };
      });
    },

    async revisar_video({ cliente, video_id: id, formatos }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const { pedido, guion, faltan } = await pedidoDelVideo(env, acceso, c, fila);
        const lista = (Array.isArray(formatos) && formatos.length ? formatos : guion.formatos);
        const j = await (await alContenedor(env, "/revisar", { ...pedido, formatos: lista })).json();
        return [
          ...(j.formatos ?? []).map((f) => f.texto),
          faltan.length ? `Imágenes que no están en la galería (salen como marcador): ${faltan.join(", ")}.` : "",
        ].filter(Boolean).join("\n\n");
      });
    },
  };
}
