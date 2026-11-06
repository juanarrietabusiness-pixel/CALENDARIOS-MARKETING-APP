// ============================================================
// El VIDEO ANIMADO desde el asistente y desde Claude (MCP)
//
//   · formato_video    el formato de escenas v1 contado a la IA (sale del mismo vocabulario que valida)
//   · listar_videos    los proyectos de un cliente, con su estado y su versión
//   · ver_video        uno entero: estado, qué falta, la línea de tiempo por escena, la locución y el guion (JSON)
//   · crear_video      un proyecto nuevo (borrador), ligado o no a una publicación
//   · guardar_video    reescribe el guion y/o el título (con la versión que se leyó)
//   · editar_escena    cambia, añade, mueve o quita escenas sin reescribir el resto: una, o varias en una versión (`cambios`)
//   · aprobar_video    aprueba el guion de esa versión: con eso generar_locucion ya puede hacer la voz
//   · ver_cuadro       la IMAGEN de un instante (o de una escena, ya llena), dibujada por el Container con el mismo motor
//   · ver_escenas      una sola imagen con un cuadro de cada escena, numerados: el video entero de un vistazo
//   · revisar_video    la revisión antes de renderizar: subtítulos que tapan, texto que se sale o se parte, fuera de la
//                      zona segura, capas encimadas (con las fuentes reales)
//   · renderizar_video el mp4 (voz, escenas, subtítulos, -14 LUFS) en el Container: a la galería y a su publicación
//   · ligar_video      a qué publicación va (o ninguna); si el mp4 ya está hecho, se pone en ella ya
//   · sonido_video     lo que suena debajo de la voz: efectos (whoosh y pop) y la música de fondo con su volumen; no toca
//                      el guion ni la voz (gratis)
//   · musicas          las músicas de fondo del cliente (audio de su galería)
//   · personaje_video  el aspecto del personaje de la casa en los videos del cliente (piel, pelo, ropa, accesorio): al kit
//   · versiones_video  el historial del guion; volver_a_version vuelve a una (versión nueva, en borrador)
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
  guardarSonido, versionesDe, volverAVersion,
} from "../videosProyectos.js";
import { musicasDe } from "./galeria.js";
import { kitDe, guardarKit } from "./kit.js";
import {
  ACCESORIOS_PERSONAJE, EXPRESIONES_PERSONAJE, TOKENS_ROPA, ASPECTO_POR_DEFECTO, limpiarPersonaje, tieneAspecto,
} from "../../../src/lib/personajeVideo.js";
import { VOLUMEN_MUSICA } from "../../../src/lib/sonidoVideo.js";
import { locucionAlDia } from "./locucion.js";
import { lineaDeTiempo, NOMBRE_ESTADO_VIDEO, NOMBRE_TIPO_ESCENA, puedeGenerarVoz, sinEtiquetas, palabrasMudas, palabrasDe, textoDeLocucion, tieneHabla } from "../../../src/lib/videoEscenas.js";
import { formatoParaLaIA } from "../../../src/lib/videoFormatoIA.js";
import { textoDeSubtitulo } from "../../../src/lib/subtitulos.js";
import { instanteLleno } from "../../../src/lib/revisionEscenas.js";
import { pedidoConClips, alContenedor, respuestaEnBase64 } from "./cuadros.js";
import { pedirRender, renderAlDia, ligarAPublicacion } from "./render.js";
import { vistaDe, piezaDe } from "../mcpVista/modelo.js";
import { vistaDeVideo, lineasDeMedios } from "./vistaMedios.js";

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
    description: "Cambia escenas sin reescribir el guion. UNA: «escena» con el id de una que existe la reemplaza (con «posicion», además la mueve); con un id nuevo la añade en «posicion» (1 = la primera) o al final; «quitar» con un id la borra; «id» + «cambiar» cambia SÓLO esos campos (habla, pantalla, pausa, fondo, transicion, tipo, capas) sin mandar la escena entera. VARIAS A LA VEZ: «cambios», una lista de esos mismos cambios ({escena, posicion} | {quitar} | {id, cambiar, posicion}), hasta 20, que se aplican en orden y todos o ninguno: queda UNA versión nueva. El guion entero se valida y, si cambia, vuelve a borrador. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, ...videoParam, ...versionParam,
        escena: { type: "object", description: "La escena completa (con su id), en el formato de escenas v1." },
        posicion: { type: "integer", description: "Dónde va: 1 = la primera." },
        quitar: { type: "string", description: "El id de la escena que se borra (en vez de «escena»)." },
        id: { type: "string", description: "El id de una escena que existe, para «cambiar» sólo algunos campos (o sólo moverla con «posicion»)." },
        cambiar: { type: "object", description: "Los campos que cambian de la escena «id»: habla, pantalla, pausa, fondo, transicion, tipo o capas (capas va entera)." },
        cambios: {
          type: "array", maxItems: 20,
          description: "Varios cambios en una sola versión, en orden. Cada uno: {escena, posicion?} | {quitar} | {id, cambiar?, posicion?}.",
          items: { type: "object" },
        },
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
    description: "RENDERIZA el video a mp4 (1080 de ancho, 30 cuadros por segundo): las escenas con el mismo motor de la vista previa, la voz con sus silencios, los subtítulos por palabra y el volumen a -14 LUFS. Sólo con el guion aprobado y su locución lista de esa versión (un montaje de clips sin habla no la necesita: sale con el sonido de sus clips). Tarda menos de un minuto (con clips de video, algo más): el mp4 queda en la galería del cliente y, si el video va ligado a una publicación, en sus medios (en el sitio del anterior). Mira el resultado después con ver_video. Revisa antes con revisar_video. No gasta IA.",
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
    name: "sonido_video",
    description: `Lo que suena DEBAJO de la voz del video animado: «efectos» (un whoosh suave en cada transición que no es un corte y un pop cuando entra un sello o el llamado; bajitos, encendidos por defecto) y la MÚSICA de fondo («musica_id», de musicas; vacío para quitarla) con su «volumen» en dB (${VOLUMEN_MUSICA.min} a +${VOLUMEN_MUSICA.max}; 0 por defecto). La música baja sola mientras se habla y sube en los huecos (ducking), entra y sale con fundido y se repite si es corta. Va APARTE del guion: no sube la versión ni pide otra voz. Para oírlo hay que volver a renderizar (renderizar_video, no gasta IA). Sin parámetros, dice cómo está. No gasta nada.`,
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, ...videoParam,
        efectos: { type: "boolean", description: "Encender o apagar los efectos." },
        musica_id: { type: "string", description: "El id de una música de musicas; vacío («») para quitarla." },
        volumen: { type: "number", description: "El volumen de la música en dB respecto a lo normal (-12 a 12)." },
      },
      required: ["video_id"],
    },
  },
  {
    name: "musicas",
    description: "Las músicas de fondo de un cliente que se pueden poner en sus videos animados (audio subido a su galería desde la pantalla del video: «Sonido» → «Subir música»). No gasta nada.",
    input_schema: { type: "object", properties: { ...clienteParam } },
  },
  {
    name: "personaje_video",
    description: `El PERSONAJE de los videos animados del cliente: la figura de la casa (bebé, niño o adulto) que dibuja la pieza «personaje», con el MISMO aspecto en todos sus videos. Sin parámetros, dice cómo es ahora. Con ellos, lo guarda en el kit del cliente: piel y pelo #RRGGBB (pelo «ninguno» = sin pelo), ropa (un token de la marca: ${TOKENS_ROPA.join(", ")}; o #RRGGBB), accesorio (${ACCESORIOS_PERSONAJE.join(", ")}) y un nombre. En cada escena, la pieza dice su variante, su pose y su expresión (${EXPRESIONES_PERSONAJE.join(", ")}; «auto» la toma de la pose). No gasta nada; mira el resultado con ver_cuadro.`,
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        piel: { type: "string", description: "#RRGGBB" },
        pelo: { type: "string", description: "#RRGGBB o «ninguno»" },
        ropa: { type: "string", description: "Un token de la marca o #RRGGBB" },
        accesorio: { type: "string", enum: [...ACCESORIOS_PERSONAJE] },
        nombre: { type: "string", description: "Cómo lo llama la marca (≤ 40)" },
      },
    },
  },
  {
    name: "versiones_video",
    description: "El HISTORIAL del guion de un video animado: cada versión de antes con su número, cuándo, quién, cuántas escenas, cuánto dura y el principio de lo que se dice. Para volver a una, volver_a_version. No gasta nada.",
    input_schema: { type: "object", properties: { ...clienteParam, ...videoParam }, required: ["video_id"] },
  },
  {
    name: "volver_a_version",
    description: "Vuelve el guion de un video animado a una versión de antes (de versiones_video): se crea una versión NUEVA con ese guion, en BORRADOR (la de ahora queda en el historial). Si lo que se DICE es igual que en la locución que ya tiene, al aprobarla otra vez la voz sigue valiendo y no se paga otra. Sólo con el sí de la persona. No gasta nada.",
    input_schema: {
      type: "object",
      properties: { ...clienteParam, ...videoParam, ...versionParam, a_version: { type: "integer", description: "El número de la versión a la que se vuelve." } },
      required: ["video_id", "version", "a_version"],
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
export const ESCRIBEN_VIDEO = Object.freeze(["crear_video", "guardar_video", "editar_escena", "aprobar_video", "renderizar_video", "ligar_video", "sonido_video", "volver_a_version", "personaje_video"]);

/** Lo que falta para el siguiente paso, en una frase para el modelo. Pura. */
/** ¿La locución es de la versión aprobada? (un video «aprobado» con voz de esa versión ya no la necesita otra vez). */
const vozDeEstaVersion = (video) => video.locucion?.estado === "lista" && !video.locucion.desfasada
  && video.locucion.version === video.version && video.version === video.aprobadaVersion;

export function siguientePaso(video) {
  if (!video.valido) return "Corregir los errores del guion (abajo) con guardar_video o editar_escena.";
  switch (video.estado) {
    case "borrador": return "Que la persona revise el guion y lo apruebe (aprobar_video con esta versión, sólo con su sí).";
    case "aprobado":
      if (video.guion && !tieneHabla(video.guion)) return "Es un montaje sin habla: no lleva locución. Siguiente: revisar_video y, si está bien, renderizar_video.";
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
    `Sonido: efectos ${video.sonido?.efectos === false ? "apagados" : "encendidos"}; ${video.sonido?.musica ? `música «${video.sonido.musica.nombre}»` : "sin música"} (sonido_video).`,
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
        const v = deFila(await renderAlDia(acceso, await proyectoDe(acceso, c.id, id)));
        const video = { ...v, locucion: await locucionAlDia(acceso, v.locucion) };
        // La vista previa del chat de Claude reproduce el mp4 y la locución ahí mismo (y se pone al día mientras se
        // hacen); el texto lleva sus direcciones firmadas. El asistente de la aplicación sólo recibe el texto.
        const vista = await vistaDeVideo(env, { video, clienteId: c.id, cliente: { id: c.id, nombre: c.name } });
        return { texto: [textoDelVideo(video), lineasDeMedios(vista)].filter(Boolean).join("\n"), imagenes: [], vista };
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
        const r = await guardarProyecto(acceso, c, fila, { guion, titulo, version, por: por?.nombre ?? null });
        if (r.cambio) avisar(c.id, id);
        return [
          r.cambio ? `Guardado: ahora es la versión ${r.video.version} (${NOMBRE_ESTADO_VIDEO[r.video.estado]}).` : "No había nada que cambiar.",
          r.avisos.length ? `Avisos: ${r.avisos.map((a) => `${a.donde}: ${a.mensaje}`).join("; ")}` : "",
          textoDelVideo(r.video, { conGuion: false }),
        ].filter(Boolean).join("\n");
      });
    },

    async editar_escena({ cliente, video_id: id, version, escena, posicion, quitar, id: escenaId, cambiar, cambios }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const r = await editarEscena(acceso, c, fila, { version, escena, posicion, quitar, id: escenaId, cambiar, cambios, por: por?.nombre ?? null });
        if (r.cambio) avisar(c.id, id);
        return [
          r.cambio ? `${r.que} Ahora es la versión ${r.video.version} (${NOMBRE_ESTADO_VIDEO[r.video.estado]}).` : "Ya estaba así: no cambió nada.",
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
        if (!tieneHabla(r.video.guion)) return `Guion aprobado (versión ${r.video.version}). Es un montaje sin habla: no lleva locución. Siguiente: revisar_video y renderizar_video.`;
        if (r.vozReutilizada) return `Guion aprobado (versión ${r.video.version}). Lo que se dice no cambió: la locución que ya tenía sirve para esta versión (no hace falta pagar otra). Siguiente: revisar_video y renderizar_video.`;
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
        const texto = `Render encargado: «${r.video.titulo}» (versión ${r.video.version}) se está renderizando; tarda menos de un minuto. Míralo con ver_video.${fila.post_id ? ` Al terminar, el mp4 se pone en la publicación ${fila.post_id}.` : " No va ligado a ninguna publicación: queda en la galería (ligar_video para ponerlo en una)."}`;
        // La vista previa del chat de Claude espera el mp4 y lo reproduce ahí mismo cuando sale.
        const video = { ...r.video, locucion: await locucionAlDia(acceso, r.video.locucion) };
        return { texto, imagenes: [], vista: await vistaDeVideo(env, { video, clienteId: c.id, cliente: { id: c.id, nombre: c.name } }) };
      });
    },

    async sonido_video({ cliente, video_id: id, efectos, musica_id: musicaId, volumen }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const antes = deFila(fila).sonido;
        const cambia = efectos !== undefined || musicaId !== undefined || volumen !== undefined;
        let ahora = antes;
        if (cambia) {
          const musica = musicaId === undefined ? antes.musica : musicaId ? { archivoId: musicaId, volumen: volumen ?? (antes.musica?.archivoId === musicaId ? antes.musica.volumen : 0) } : null;
          if (musica && volumen !== undefined) musica.volumen = volumen;
          ahora = (await guardarSonido(acceso, c, fila, { efectos: efectos ?? antes.efectos, musica })).video.sonido;
          avisar(c.id, id);
        }
        const m = ahora.musica;
        return [
          `${cambia ? "Guardado. " : ""}Sonido de «${fila.titulo}»: efectos ${ahora.efectos ? "encendidos" : "apagados"}; ${m ? `música «${m.nombre}» (${m.volumen > 0 ? "+" : ""}${m.volumen} dB)` : "sin música"}.`,
          cambia && fila.estado === "renderizado" ? "El mp4 que ya hay es de antes: renderizar_video para oírlo (no gasta IA ni pide otra voz)." : "",
        ].filter(Boolean).join(" ");
      });
    },

    async musicas({ cliente }) {
      const c = await resolverCliente(cliente);
      const lista = await musicasDe(acceso, c.id);
      if (!lista.length) return `${c.name} no tiene músicas de fondo en su galería. Se suben desde la pantalla del video (Sonido → Subir música: MP3 o WAV de hasta 15 MB, con derechos para usarla).`;
      return [`Músicas de fondo de ${c.name}:`, ...lista.map((m) => `· ${m.id} — «${m.nombre}» · ${(m.bytes / 1048576).toFixed(1)} MB · ${String(m.fecha).slice(0, 10)}`)].join("\n");
    },

    async personaje_video({ cliente, ...cambios }) {
      const c = await resolverCliente(cliente);
      const kit = kitDe(c);
      const describir = (p, guardado) => `${guardado ? "Guardado en el kit de" : "El personaje de"} ${c.name}${p.nombre ? ` («${p.nombre}»)` : ""}: piel ${p.piel}, ${p.pelo ? `pelo ${p.pelo}` : "sin pelo"}, ropa ${p.ropa}, accesorio ${p.accesorio}.${guardado ? " Sale así en todos sus videos (salvo un guion que traiga estilo.personaje propio)." : ""}`;
      const campos = ["piel", "pelo", "ropa", "accesorio", "nombre"].filter((k) => cambios[k] !== undefined);
      if (!campos.length) return tieneAspecto(kit.personajeVideo) ? describir(limpiarPersonaje(kit.personajeVideo), false) : `${c.name} no tiene personaje propio: se dibuja con el aspecto de partida (${describir(ASPECTO_POR_DEFECTO, false).split(": ")[1]})`;
      const nuevo = limpiarPersonaje({ ...(kit.personajeVideo ?? {}), ...Object.fromEntries(campos.map((k) => [k, cambios[k]])) });
      try {
        const guardado = await guardarKit(env, acceso, c, { ...kit, personajeVideo: nuevo });
        return describir(guardado.personajeVideo ?? nuevo, true);
      } catch (e) {
        throw new Fallo(e.message);
      }
    },

    async versiones_video({ cliente, video_id: id }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const lista = await versionesDe(acceso, c.id, fila);
        if (!lista.length) return `«${fila.titulo}» está en su versión ${fila.version} y no tiene versiones de antes guardadas (el historial empieza con el primer cambio).`;
        return [`Historial de «${fila.titulo}» (ahora: versión ${fila.version}):`, ...lista.map((v) =>
          `· v${v.version} · ${String(v.fecha).slice(0, 16).replace("T", " ")} UTC${v.por ? ` · ${v.por}` : ""} · ${v.escenas} escenas · ${v.segundos.toFixed(1)} s · «${v.habla.slice(0, 90)}»`)].join("\n");
      });
    },

    async volver_a_version({ cliente, video_id: id, version, a_version: aVersion }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const r = await volverAVersion(acceso, c, fila, { version, aVersion, por: por?.nombre ?? null });
        avisar(c.id, id);
        return `Listo: el guion de la versión ${aVersion} es ahora la versión ${r.video.version}, en borrador (la ${fila.version} quedó en el historial). Hay que aprobarla otra vez; si lo que se dice coincide con la locución que ya hay, la voz sigue valiendo.\n${textoDelVideo(r.video, { conGuion: false })}`;
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
        const { pedido, guion, palabras, faltan } = await pedidoConClips(env, acceso, c, fila, { formato });
        const linea = lineaDeTiempo(guion, palabras);
        let t = Number.isFinite(Number(segundo)) && segundo !== undefined && segundo !== null ? Number(segundo) : null;
        if (t === null) {
          const k = escena ? guion.escenas.findIndex((e) => e.id === escena) : 0;
          if (k < 0) throw new ErrorVideo(`No hay ninguna escena «${escena}». Las que hay: ${guion.escenas.map((e) => e.id).join(", ")}.`, 404);
          t = instanteLleno(guion, linea, k);
        }
        const r = await alContenedor(env, "/cuadro", { ...pedido, t, ancho: 540 });
        const cual = r.headers.get("X-Escena");
        const segundoVisto = Number(r.headers.get("X-Segundo") ?? t);
        return {
          vista: vistaDe({
            tipo: "cuadros", titulo: fila.titulo || "Video animado", cliente: { id: c.id, nombre: c.name },
            piezas: [piezaDe({ id: "cuadro", titulo: `Escena ${cual ?? ""} · segundo ${segundoVisto.toFixed(1)} de ${linea.total.toFixed(1)}`, imagen: 0, archivo: false })],
          }),
          texto: [
            `Cuadro de «${fila.titulo}» en el segundo ${segundoVisto.toFixed(1)} de ${linea.total.toFixed(1)} (escena ${cual}, ${pedido.formato}${palabras ? "" : ", tiempos estimados: aún no hay voz"}).`,
            faltan.length ? `OJO: estas imágenes o clips no están en la galería del cliente (o no se pudieron cargar) y salen como marcador: ${faltan.join(", ")}.` : "",
          ].filter(Boolean).join("\n"),
          imagenes: [{ mime: r.headers.get("Content-Type") ?? "image/jpeg", datos: await respuestaEnBase64(r) }],
        };
      });
    },

    async ver_escenas({ cliente, video_id: id, formato }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const { pedido, guion, palabras, faltan } = await pedidoConClips(env, acceso, c, fila, { formato });
        const r = await alContenedor(env, "/hoja", { ...pedido, ancho: 1080 });
        return {
          vista: vistaDe({
            tipo: "cuadros", titulo: fila.titulo || "Video animado", cliente: { id: c.id, nombre: c.name },
            piezas: [piezaDe({ id: "hoja", titulo: `Las ${guion.escenas.length} escenas (${pedido.formato})`, imagen: 0, archivo: false })],
          }),
          texto: [
            `Las ${guion.escenas.length} escenas de «${fila.titulo}» (${pedido.formato}), cada una ya llena, con su número, id y segundo${palabras ? "" : " (tiempos estimados: aún no hay voz)"}.`,
            faltan.length ? `OJO: estas imágenes o clips no están en la galería y salen como marcador: ${faltan.join(", ")}.` : "",
          ].filter(Boolean).join("\n"),
          imagenes: [{ mime: r.headers.get("Content-Type") ?? "image/jpeg", datos: await respuestaEnBase64(r) }],
        };
      });
    },

    async revisar_video({ cliente, video_id: id, formatos }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const { pedido, guion, faltan } = await pedidoConClips(env, acceso, c, fila);
        const lista = (Array.isArray(formatos) && formatos.length ? formatos : guion.formatos);
        const j = await (await alContenedor(env, "/revisar", { ...pedido, formatos: lista })).json();
        return [
          ...(j.formatos ?? []).map((f) => f.texto),
          faltan.length ? `Imágenes o clips que no están en la galería (salen como marcador): ${faltan.join(", ")}.` : "",
        ].filter(Boolean).join("\n\n");
      });
    },
  };
}
