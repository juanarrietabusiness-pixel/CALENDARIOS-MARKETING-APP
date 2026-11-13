// ============================================================
// El VIDEO ANIMADO desde el asistente y desde Claude (MCP)
//
//   · formato_video    el formato de escenas v1 contado a la IA (sale del mismo vocabulario que valida)
//   · listar_videos    los proyectos de un cliente, con su estado y su versión
//   · ver_video        uno entero: estado, qué falta, la línea de tiempo por escena, la locución y el guion (JSON)
//   · crear_video      un proyecto nuevo (borrador), ligado o no a una publicación, y la estructura de guion que siguió
//   · ver_estructuras  las ESTRUCTURAS DE GUION de la agencia (para todos los clientes), de voz en off o de UGC, con sus
//                      tramos repartidos en la duración pedida: Claude las ofrece y pasa la escogida (estructura_id)
//   · guardar_video    reescribe el guion y/o el título (con la versión que se leyó)
//   · editar_escena    cambia, añade, mueve o quita escenas sin reescribir el resto: una, o varias en una versión (`cambios`)
//   · aprobar_video    aprueba el guion de esa versión: con eso generar_locucion ya puede hacer la voz
//   · ver_cuadro       la IMAGEN de un instante (o de una escena, ya llena), dibujada por el Container con el mismo motor
//   · ver_escenas      una sola imagen con un cuadro de cada escena, numerados: el video entero de un vistazo
//   · revisar_video    la revisión antes de renderizar: subtítulos que tapan, texto que se sale o se parte, fuera de la
//                      zona segura, capas encimadas (con las fuentes reales)
//   · renderizar_video el mp4 (voz, escenas, subtítulos, -14 LUFS) en el Container: a la galería y a su publicación
//   · ligar_video      a qué publicación va (o ninguna); si el mp4 ya está hecho, se pone en ella ya
//   · sonido_video     lo que suena debajo de la voz: efectos (whoosh y pop, o uno de la biblioteca para las transiciones y
//                      otro para los sellos) y la música de fondo con su volumen; no toca el guion ni la voz (gratis)
//   · musicas          la BIBLIOTECA DE SONIDO del cliente y la de la agencia: músicas (la de la marca, primero) y efectos
//   · personaje_video  el aspecto del personaje de la casa en los videos del cliente (piel, pelo, ropa, accesorio): al kit
//   · versiones_video  el historial del guion; volver_a_version vuelve a una (versión nueva, en borrador)
//   · publicar_con_musica  «con música»: un post de UNA foto → un reel con su música (crea, aprueba y renderiza; no gasta
//                      IA); un carrusel → a mano con la música de Instagram y la canción sugerida (worker/lib/estudio/conMusica.js)
//   · estilos_video    los ESTILOS DE VIDEO guardados del cliente (src/lib/estilosVideo.js): las reglas de un video que
//                      salió bien; guardar_estilo_video guarda uno de un video y aplicar_estilo_video lo impone a otro
//   · video_con_cancion «VIDEO CON TU CANCIÓN»: sincroniza la letra con una canción ya grabada (siempre pide confirmar el
//                      costo) y crea el borrador con ella de locución: la prueba de sincronía o las escenas de la IA
//                      (worker/lib/estudio/cancion.js, importado en el momento: lee guionAnimado.js → mercado.js, que
//                      cerraría el ciclo con herramientas.js)
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
import { sonidosDelCliente, sonidosDeLaAgencia } from "./sonidos.js";
import { textoDePista } from "../../../src/lib/bibliotecaSonido.js";
import { kitDe, guardarKit, guardarLexico } from "./kit.js";
import {
  ACCESORIOS_PERSONAJE, EXPRESIONES_PERSONAJE, TOKENS_ROPA, ASPECTO_POR_DEFECTO, limpiarPersonaje, tieneAspecto, POSES_PERSONAJE, imagenesDePoses,
} from "../../../src/lib/personajeVideo.js";
import { VOLUMEN_MUSICA } from "../../../src/lib/sonidoVideo.js";
import { locucionAlDia, fijarVozDeMarca } from "./locucion.js";
import { lineaDeTiempo, NOMBRE_ESTADO_VIDEO, NOMBRE_TIPO_ESCENA, puedeGenerarVoz, sinEtiquetas, palabrasMudas, palabrasDe, textoDeLocucion, tieneHabla } from "../../../src/lib/videoEscenas.js";
import { formatoParaLaIA } from "../../../src/lib/videoFormatoIA.js";
import { textoDeSubtitulo } from "../../../src/lib/subtitulos.js";
import { esCancion, estadoDeCancion, FUENTES_CANCION, DESPLAZAMIENTO_MAX } from "../../../src/lib/videoCancion.js";
import { fondosPendientes } from "../../../src/lib/fondosVideo.js";
import { textoCosto } from "../../../src/lib/estudioCatalogo.js";
import { instanteLleno } from "../../../src/lib/revisionEscenas.js";
import { pedidoConClips, alContenedor, respuestaEnBase64 } from "./cuadros.js";
import { pedirRender, renderAlDia, ligarAPublicacion } from "./render.js";
import { conMusicaSegun } from "./conMusica.js";
import { DURACIONES_FOTO, MOVIMIENTOS_FOTO, TRANSICIONES_CARRUSEL, textoDeCancion } from "../../../src/lib/conMusica.js";
import { vistaDe, piezaDe } from "../mcpVista/modelo.js";
import { vistaDeVideo, lineasDeMedios } from "./vistaMedios.js";
import { leerEstructuras, estructuraExistente, guardarEstructura, quitarEstructura, ErrorEstructura } from "../estructurasGuion.js";
import { paraDe, tramosEnDuracion, USOS_ESTRUCTURA, estructuraDeTramosConPeso } from "../../../src/lib/formulasUgc.js";
import { estilosDelCliente, estiloDelCliente, guardarEstilo, aplicarEstiloAVideo, ErrorEstilo } from "./estilosVideo.js";
import { aplicarEstilo, lineaDeEstilo, USOS_ESTILO_VIDEO } from "../../../src/lib/estilosVideo.js";
import { conFondosPorCrear } from "../../../src/lib/fondosVideo.js";

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
    name: "tiempos_locucion",
    description: "Los TIEMPOS DE CADA PALABRA de una locución (los reales de ElevenLabs, o verificados o estimados: lo dice): de un video animado (video_id: por escena, en segundos DEL VIDEO, con los silencios que se insertan ya contados) o de una locución suelta de la galería (archivo_id, de generar_locucion con «texto»: en segundos del audio). Sirve para sincronizar con lo que se dice un video que armas fuera del calendario. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        video_id: { type: "string", description: "ID del video animado (con su locución lista)." },
        archivo_id: { type: "string", description: "ID de la galería de una locución suelta (la da estado_trabajo al terminar generar_locucion con «texto»)." },
      },
    },
  },
  {
    name: "crear_video",
    description: "Crea un video animado (borrador) para un cliente con su guion en el formato de escenas v1 (lee formato_video antes). Opcional: publicacion_id para ligarlo a su post del calendario; estructura_id, la estructura de guion de la agencia que sigue su voz en off (de ver_estructuras: queda apuntada en el video). Si el guion tiene errores no se crea y la respuesta dice cada uno con su sitio. No gasta nada. CON IMÁGENES DE FONDO (si la persona lo pide): pon de fondo de cada sección una «imagen» a sangre con «pide» y SIN archivo (formato_video lo explica); después fondos_video las crea con el director, con su costo. Lee antes el kit de la marca (ver_estudio): su paleta, su letra y el estilo de sus videos mandan.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, guion: guionParam,
        titulo: { type: "string", description: "Nombre del video (si se omite, el del guion)." },
        publicacion_id: { type: "string", description: "ID de la publicación del calendario a la que va (de ver_calendario)." },
        estructura_id: { type: "string", description: "La ESTRUCTURA de guion de la agencia que sigue la voz en off (de ver_estructuras con para=voz). Reparte las escenas en sus tramos antes de crearlo." },
        estilo_id: { type: "string", description: "Un ESTILO DE VIDEO guardado del cliente (de estilos_video): escribe el guion siguiendo sus reglas y la aplicación impone su forma al crearlo (texto principal, fondos, transiciones, cierre)." },
      },
      required: ["guion"],
    },
  },
  {
    name: "ver_estructuras",
    description: "Las ESTRUCTURAS DE GUION de la agencia, para TODOS los clientes: la forma de un guion que funciona —sus tramos con el papel de cada uno, el tipo de gancho, por qué funciona y cuándo conviene—, sin contenido. para=voz: las de VOZ EN OFF (video animado y reel); para=ugc: las del guion para grabar. Con segundos, los tramos ya repartidos en esa duración. Ofrécelas a la persona antes de escribir un guion y pasa la escogida en crear_video o crear_reel (estructura_id); el tono de cada marca va aparte. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        para: { type: "string", enum: ["voz", "ugc"], description: "voz: voz en off (video animado, reel); ugc: guion para grabar. Si se omite, todas." },
        segundos: { type: "integer", description: "La duración del video: los tramos de cada una, repartidos en ella." },
      },
    },
  },
  {
    name: "guardar_estructura",
    description: "Crea o corrige una ESTRUCTURA DE GUION de la agencia (para todos los clientes; la misma lista de Ajustes → Cómo trabajamos → Estructuras de guion, donde aparece en cuanto se guarda): la FORMA de un guion que funciona, sin su contenido. Con «id» (de ver_estructuras) corrige ésa; sin él, crea una nueva. Los tramos van EN ORDEN, cada uno con su nombre, su papel (qué hace ese momento) y su peso en la duración (un porcentaje o una proporción: se reparten sobre la duración original). Devuelve su ID, para pasarlo como estructura_id en crear_video o crear_reel. Úsala cuando la persona pida guardar una forma de guion que salió bien o una nueva. Sólo quien administra o un editor puede cambiarlas. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Para CORREGIR una que ya existe (de ver_estructuras). Sin él, se crea una nueva." },
        nombre: { type: "string", description: "Cómo se llama (≤ 60): «Pregunta incómoda → demostración → precio»." },
        para: { type: "string", enum: ["voz", "ugc", "ambos"], description: "voz: voz en off (video animado y reel); ugc: guion para grabar; ambos: las dos." },
        duracion: { type: "integer", enum: [10, 15, 20, 30, 45, 60], description: "La duración original (s) sobre la que van los pesos. Por defecto 30. Al usarla, se reparte en la del video." },
        tramos: {
          type: "array", description: "De 2 a 10 tramos, en orden.",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string", description: "El nombre del momento: «Gancho», «Problema», «Demostración», «Llamado»." },
              papel: { type: "string", description: "Qué hace ese tramo (sin el contenido de una marca): «una pregunta que la persona se hace en voz alta»." },
              peso: { type: "number", description: "Cuánto de la duración ocupa (un porcentaje o una proporción). Si se omite, a partes iguales." },
              ejemplo: { type: "string", description: "Opcional: un ejemplo corto de cómo suena." },
            },
            required: ["papel"],
          },
        },
        tipo_gancho: { type: "string", description: "El tipo de gancho (≤ 200): «pregunta incómoda», «dato que sorprende»…" },
        por_que_funciona: { type: "string", description: "Por qué funciona (≤ 300)." },
        cuando_conviene: { type: "string", description: "Cuándo conviene (≤ 200): «productos con un antes y un después claro»." },
        variantes: { type: "string", description: "Opcional (≤ 300): otras formas de la misma estructura que también valen." },
      },
      required: ["nombre", "para", "tramos"],
    },
  },
  {
    name: "eliminar_estructura",
    description: "QUITA una estructura de guion de la agencia (por su ID, de ver_estructuras): deja de ofrecerse para todos los clientes y sale de Ajustes → Cómo trabajamos. Úsala SÓLO si la persona lo pidió explícitamente. Los videos y publicaciones que la siguieron no cambian. Sólo quien administra o un editor puede. No gasta nada.",
    input_schema: { type: "object", properties: { id: { type: "string", description: "El ID de la estructura (de ver_estructuras)." } }, required: ["id"] },
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
    description: `Lo que suena DEBAJO de la voz del video animado: «efectos» (un whoosh suave en cada transición que no es un corte y un pop cuando entra un sello o el llamado; bajitos, encendidos por defecto; con «efecto_transicion_id» y «efecto_sello_id», un efecto de la BIBLIOTECA del cliente o de la agencia —de musicas— suena en su lugar, al mismo nivel) y la MÚSICA de fondo («musica_id», de musicas: del cliente o de la agencia; vacío para quitarla) con su «volumen» en dB (${VOLUMEN_MUSICA.min} a +${VOLUMEN_MUSICA.max}; 0 por defecto). La música baja sola mientras se habla y sube en los huecos (ducking), entra y sale con fundido y se repite si es corta. Va APARTE del guion: no sube la versión ni pide otra voz. Para oírlo hay que volver a renderizar (renderizar_video, no gasta IA). Sin parámetros, dice cómo está. No gasta nada.`,
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, ...videoParam,
        efectos: { type: "boolean", description: "Encender o apagar los efectos." },
        musica_id: { type: "string", description: "El id de una música de musicas (del cliente o de la agencia); vacío («») para quitarla." },
        volumen: { type: "number", description: "El volumen de la música en dB respecto a lo normal (-12 a 12)." },
        efecto_transicion_id: { type: "string", description: "El id de un EFECTO de musicas para las transiciones (en vez del whoosh); vacío («») vuelve al de la aplicación." },
        efecto_sello_id: { type: "string", description: "El id de un EFECTO de musicas para los sellos y llamados (en vez del pop); vacío («») vuelve al de la aplicación." },
      },
      required: ["video_id"],
    },
  },
  {
    name: "musicas",
    description: "La BIBLIOTECA DE SONIDO que puede usar un cliente en sus videos: su música (la de la marca, primero; las generadas con Suno y las subidas) y sus efectos, y la música y los efectos de la AGENCIA (para todos los clientes), cada uno con su id, BPM, etiquetas (ánimo, ritmo) y duración. Antes de generar una música con Suno, mira aquí: reutilizar una es gratis. No gasta nada.",
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
        imagenes: {
          type: "object",
          description: `La MASCOTA propia de la marca (si la tiene: no la figura genérica): una imagen de su galería por pose (${POSES_PERSONAJE.join(", ")}), { pose: id de ver_estudio }. Con ellas, la pieza «personaje» dibuja la mascota en esa pose (o la de pie). Créalas antes con crear_en_estudio (el logo de referencia, sin_logo, fondo liso) y revisa cada una: sin texto inventado. Una pose con "" la quita.`,
        },
      },
    },
  },
  {
    name: "voz_de_marca",
    description: "La VOZ de la marca en sus videos (la de ElevenLabs con que se generan las locuciones y el montaje de los reels): sin «voz», dice cuál es; con «voz» (un id de listar_voces) y el modelo, la cambia en el kit del cliente para TODOS sus videos. Para un solo video, pasa «voz» a generar_locucion, crear_reel, continuar_reel o montar_reel. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        voz: { type: "string", description: "El id de la voz (de listar_voces)." },
        modelo: { type: "string", enum: ["v4", "v3", "v2"], description: "El modelo de voz (si se omite, el que tenía)." },
      },
    },
  },
  {
    name: "lexico_de_marca",
    description: "El LÉXICO de la marca: cómo se dice algo («fibras de bambú») y qué no se dice nunca («bambú» a secas). La aplicación lo aplica SOLA a lo que se dice y a lo que se lee en todos sus videos (el guion del video animado al guardarse, el del reel al escribirse) y se lo dice a la IA que escribe. Sin «reglas», dice las que hay; con «reglas», las REEMPLAZA todas (lista vacía: las quita). Una regla sin «di» es una palabra prohibida sin reemplazo: no se cambia sola, se avisa. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        reglas: {
          type: "array", description: "Hasta 20: { di: cómo se dice (opcional), nunca: [lo que no se dice] }.",
          items: { type: "object", properties: { di: { type: "string" }, nunca: { type: "array", items: { type: "string" } } }, required: ["nunca"] },
        },
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
    name: "publicar_con_musica",
    description: `«Publicar CON MÚSICA». La API de Instagram no deja poner música de su biblioteca en fotos ni en carruseles; hay dos caminos según la publicación (ofrécelos cuando pidan un post «con música»):
· Un POST DE UNA FOTO se convierte en un REEL corto: la foto a sangre con un movimiento suave (${MOVIMIENTOS_FOTO.map((m) => `«${m.id}»: ${m.nombre.toLowerCase()}`).join("; ")}) de ${DURACIONES_FOTO.join(", ")} s y una música de la galería del cliente (musica_id de musicas; sin él, la favorita, la de la marca o la más nueva). Crea el video, lo aprueba y lo renderiza ligado a la publicación; al terminar es un reel con el video y la foto de PORTADA (en Instagram, «audio original»). En la pestaña Pieza, «Volver a la foto» lo deshace. NO gasta IA (0 $): el video lo hace el servidor. Sin música en la galería, dilo: se sube o se genera en «Sonido» (no generes música nueva salvo que la pidan).
  Con musica_id="generar" la música la escribe el DIRECTOR MUSICAL MIRANDO la foto y la hace Suno: eso SÍ cuesta y pide confirmar (sin confirmado=true devuelve el costo y NO SE CREA NADA); al llegar la música el reel se hace solo. movimiento «ninguno» deja la foto quieta.
· Un CARRUSEL tiene dos caminos: con reel=true se CONVIERTE en un reel con sus láminas una tras otra (transicion, segundos por lámina 2-5, movimiento «alternar» o uno fijo), la música (musica_id, «generar» o «ninguna») y, con voz=true, una VOZ: la IA escribe una frase por lámina con lo que dice la publicación y la voz de la marca la dice con subtítulos (cuesta: pide confirmar y enseña lo que dirá). Sin reel, se marca para publicarlo A MANO desde el teléfono con la música de Instagram («La publico yo»): a su hora llega un aviso con la pantalla del teléfono (las imágenes en orden, el texto para copiar y una CANCIÓN SUGERIDA de la lista de Marca → Kit y voz).`,
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        publicacion_id: { type: "string", description: "La publicación del calendario (de ver_calendario): un post de una foto o un carrusel." },
        musica_id: { type: "string", description: "Sólo para el reel: el id de una música de musicas. Si se omite, la favorita, la de la marca o la más nueva." },
        segundos: { type: "number", enum: [...DURACIONES_FOTO], description: "Sólo para el reel: lo que dura (10 por defecto)." },
        movimiento: { type: "string", enum: MOVIMIENTOS_FOTO.map((m) => m.id), description: "Sólo para el reel: cómo se mueve la foto (acercar por defecto)." },
        logo: { type: "boolean", description: "Sólo para el reel: el logo del kit encima. Si se omite, sólo si el kit lo estampa y la foto no salió ya del Estudio con él." },
        reel: { type: "boolean", description: "Sólo para un carrusel: true lo convierte en un reel con sus láminas (si no, a mano con la música de Instagram)." },
        transicion: { type: "string", enum: TRANSICIONES_CARRUSEL.map((t) => t.id), description: "Carrusel en reel: la transición entre láminas (fundido por defecto)." },
        voz: { type: "boolean", description: "Carrusel en reel: con una voz que cuenta las láminas (cuesta; pide confirmar)." },
        confirmado: { type: "boolean", description: "true SÓLO cuando la persona ya vio el costo (música generada o voz) y dijo que sí. No lo pongas por tu cuenta." },
      },
      required: ["publicacion_id"],
    },
  },
  {
    name: "video_con_cancion",
    description: `«VIDEO CON TU CANCIÓN»: un video animado (sobre todo un reel 9:16) sobre una CANCIÓN YA GRABADA —voz e instrumental mezclados, el FRAGMENTO del reel ya recortado, hasta 3 minutos— que está en la biblioteca de sonido del cliente o de la agencia (musica_id, de musicas). La LETRA va EXACTA, tal cual se canta en ese fragmento (las repeticiones escritas enteras, sin «x2»). NO se genera voz: la canción es el audio del video. Primero se SINCRONIZA la letra con la canción (ElevenLabs la alinea y, si la música la tapa, aísla la voz y la alinea otra vez; sin su llave, Gemini la oye): cuesta unos céntimos (aproximado) y SIEMPRE pide confirmar: sin confirmado=true devuelve el costo y NO SE CREA NADA (la misma canción con la misma letra otra vez sale gratis). Con el sí, crea el BORRADOR con la canción como su locución: la prueba de sincronía (disenar=false, gratis: una escena por línea con la letra de titular, el karaoke) o las escenas diseñadas por la IA (disenar=true, texto: el coro con más fuerza, la letra tal cual). desplazamiento (±${DESPLAZAMIENTO_MAX} s) mueve toda la letra si va adelantada (+) o atrasada (−). Después, como siempre: ver_video o ver_escenas, aprobar_video (con el sí de la persona: queda con la canción como locución) y renderizar_video.`,
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        musica_id: { type: "string", description: "El id de la canción en la biblioteca de sonido (de musicas: del cliente o de la agencia)." },
        letra: { type: "string", description: "La letra EXACTA de lo que se canta en el fragmento, con un renglón por línea (≤ 6.000 caracteres)." },
        formato: { type: "string", enum: ["9:16", "1:1", "16:9"], description: "9:16 por defecto (reel)." },
        publicacion_id: { type: "string", description: "Opcional: la publicación del calendario a la que va (de ver_calendario); el mp4 se pondrá en ella." },
        titulo: { type: "string", description: "Nombre del video (si se omite, el de la canción)." },
        disenar: { type: "boolean", description: "true: la IA diseña las escenas sobre la letra (texto). false (por defecto): la prueba de sincronía, gratis." },
        indicacion: { type: "string", description: "Sólo con disenar: lo que pide la agencia del diseño (≤ 600)." },
        con_fondos: { type: "boolean", description: "Sólo con disenar: «con imágenes de fondo». La IA pone de fondo de cada sección (verso, coro, puente) una imagen a sangre con «pide» (lo que muestra, en el estilo del kit) y sin archivo; después fondos_video las crea con el director (con su costo)." },
        desplazamiento: { type: "number", description: `El ajuste fino de la letra, de −${DESPLAZAMIENTO_MAX} a ${DESPLAZAMIENTO_MAX} s (0 por defecto).` },
        estilo_id: { type: "string", description: "Un ESTILO DE VIDEO guardado del cliente (de estilos_video): la IA diseña con sus reglas y la aplicación impone su forma (también a la prueba de sincronía). Si el estilo lleva imágenes de fondo, el video las pide aunque no pongas con_fondos. Si el cliente tiene uno para canciones, ofrécelo." },
        confirmado: { type: "boolean", description: "SÓLO true si la persona dijo que sí al costo de sincronizar que dio la llamada anterior." },
      },
      required: ["musica_id", "letra"],
    },
  },
  {
    name: "estilos_video",
    description: "Los ESTILOS DE VIDEO guardados del cliente: las REGLAS de un video que salió bien (texto principal, fondos, transiciones, cierre, grano, ritmo, subtítulos, efectos) —no su letra ni sus imágenes—, cada uno con su ID, para qué videos es (con canción, voz en off o todos) y su resumen. Úsalo antes de crear un video del cliente: si tiene uno que encaje, ofrécelo y pásalo (estilo_id) en video_con_cancion o crear_video. No gasta nada.",
    input_schema: { type: "object", properties: { ...clienteParam }, required: [] },
  },
  {
    name: "guardar_estilo_video",
    description: "«Guardar como estilo»: las reglas del guion GUARDADO de un video del cliente (cómo se ve y se mueve; no su letra, sus textos ni sus imágenes) pasan a ser un estilo del cliente, para que el siguiente salga igual (estilo_id en video_con_cancion o crear_video). Hasta 8 por cliente; se quitan en Marca → Kit y voz. Hazlo cuando la persona diga que un video quedó como lo quiere y pida repetirlo. No gasta nada.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam, ...videoParam,
        nombre: { type: "string", description: "Cómo se llama el estilo (≤ 60), p. ej. «Lyric bíblico en blanco y negro»." },
        nota: { type: "string", description: "Opcional: lo que el código no puede sacar del guion y conviene recordar (≤ 600), p. ej. «líneas doradas que tachan lo del mundo; citas bíblicas pequeñas con su referencia»." },
        para: { type: "string", enum: Object.keys(USOS_ESTILO_VIDEO), description: "Para qué videos: cancion, voz o todos (si se omite, el del video: con canción o con voz en off)." },
      },
      required: ["video_id", "nombre"],
    },
  },
  {
    name: "aplicar_estilo_video",
    description: "Impone un ESTILO DE VIDEO guardado (estilos_video) al guion de un video que ya existe: el código cambia la FORMA —el aspecto del texto principal, los fondos, las transiciones, el cierre, el grano, el ritmo y los subtítulos— sin tocar lo que se dice ni lo que se lee. Se guarda como una versión nueva y vuelve a borrador. No gasta nada.",
    input_schema: {
      type: "object",
      properties: { ...clienteParam, ...videoParam, ...versionParam, estilo_id: { type: "string", description: "El ID del estilo (de estilos_video)." } },
      required: ["video_id", "estilo_id", "version"],
    },
  },
  {
    name: "fondos_video",
    description: "Crea las IMÁGENES DE FONDO por sección de un video animado: las capas «imagen» a sangre con «pide» y sin archivo del guion GUARDADO (las pone la IA con con_fondos, o tú al escribir el guion: ver formato_video). Las diseña el DIRECTOR de arte de la agencia con el kit y el estilo de los videos de la marca, en 9:16, sin texto ni logo, con el modelo de imagen del cliente, por un encargo del servidor; al terminar se ponen solas en el guion (otra versión). La PRIMERA llamada, sin confirmado, NO crea nada: devuelve cuántas y el costo; díselo a la persona y, sólo con su «sí», repite con confirmado=true. EXCEPCIÓN: con «crear sin preguntar» fijado (Ajustes → IA) y dentro de su tope, la primera llamada ya crea, y la respuesta lo dice. Mira cómo va con ver_video.",
    input_schema: {
      type: "object",
      properties: { ...clienteParam, ...videoParam, confirmado: { type: "boolean", description: "SÓLO true si la persona dijo que sí al costo que dio la llamada anterior." } },
      required: ["video_id"],
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
export const ESCRIBEN_VIDEO = Object.freeze(["guardar_estructura", "eliminar_estructura", "voz_de_marca", "lexico_de_marca", "guardar_estilo_video", "aplicar_estilo_video", "fondos_video", "video_con_cancion", "publicar_con_musica", "crear_video", "guardar_video", "editar_escena", "aprobar_video", "renderizar_video", "ligar_video", "sonido_video", "volver_a_version", "personaje_video"]);

/** Lo que falta para el siguiente paso, en una frase para el modelo. Pura. */
/** ¿La locución es de la versión aprobada? (un video «aprobado» con voz de esa versión ya no la necesita otra vez). */
const vozDeEstaVersion = (video) => video.locucion?.estado === "lista" && !video.locucion.desfasada
  && video.locucion.version === video.version && video.version === video.aprobadaVersion;

export function siguientePaso(video) {
  if (!video.valido) return "Corregir los errores del guion (abajo) con guardar_video o editar_escena.";
  // Con una CANCIÓN no hay voz que generar: vale mientras el guion diga su letra.
  if (esCancion(video.locucion) && ["borrador", "aprobado"].includes(video.estado)) {
    const c = estadoDeCancion(video.guion, video.locucion);
    if (!c.ok) return `${c.motivo} (editar_escena con la letra tal cual en el «habla»; NUNCA generar_locucion: la canción es el audio).`;
    return video.estado === "borrador"
      ? "Que la persona revise el guion y lo apruebe (aprobar_video con esta versión, sólo con su sí): la canción ya es su locución, no se genera voz."
      : "Tiene la canción de locución: revisar_video y, si está bien, renderizar_video.";
  }
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
  const voz = esCancion(loc) && loc.estado === "lista"
    ? `Con CANCIÓN (no se genera voz): «${loc.nombre ?? "la canción"}», ${Number(loc.duracion ?? 0).toFixed(1)} s, letra sincronizada por ${FUENTES_CANCION[loc.fuente] ?? loc.fuente} (${Math.round(Number(loc.coincidencia ?? 0) * 100)} %)${loc.desplazamiento ? `, ajuste fino ${loc.desplazamiento > 0 ? "+" : ""}${loc.desplazamiento} s` : ""}${loc.revisar ? " · OJO: la letra no se encontró bien en la canción: revisa la vista previa" : ""}${linea?.avisos?.length ? ` · ${linea.avisos.length} escena(s) muy corta(s): ${linea.avisos.map((a) => a.escena).join(", ")}` : ""}.`
    : loc.estado === "lista"
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
    video.guion && fondosPendientes(video.guion).length ? `Imágenes de fondo POR CREAR: ${fondosPendientes(video.guion).length} (mientras tanto se ve el fondo de la escena). fondos_video las crea con el director (dice el costo antes).` : "",
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
    async video_con_cancion({ cliente, musica_id: musicaId = "", letra = "", formato = "9:16", publicacion_id: postId = "", titulo = "", disenar = false, indicacion = "", desplazamiento = 0, con_fondos: conFondos = false, estilo_id: estiloId = "", confirmado }) {
      const c = await resolverCliente(cliente);
      // En el momento: cancion.js lee guionAnimado.js → mercado.js, que estático cerraría el ciclo con herramientas.js.
      const { sincronizarCancion, crearVideoConCancion, resumenDeSincronia, ErrorCancion } = await import("./cancion.js");
      return conErrores(async () => {
        try {
          const s = await sincronizarCancion(env, acceso, c, { musicaId: String(musicaId), letra: String(letra), confirmado: confirmado === true, usuario });
          const r = await crearVideoConCancion(env, acceso, c, {
            huella: s.huella, modo: disenar === true ? "ia" : "karaoke", formato, titulo: String(titulo ?? ""), postId: String(postId ?? ""),
            desplazamiento, indicacion: String(indicacion ?? ""), conFondos: disenar === true && conFondos === true, estiloId: String(estiloId ?? ""), usuario,
          });
          avisar(c.id, r.video.id);
          const res = resumenDeSincronia(s, { desplazamiento });
          const video = { ...r.video, locucion: await locucionAlDia(acceso, r.video.locucion) };
          const texto = [
            `Creado el video «${r.video.titulo}» (ID ${r.video.id}), versión 1, en borrador, con la canción «${res.nombre}» (${Number(res.duracion).toFixed(1)} s) como su audio: no se genera voz.`,
            `Letra sincronizada por ${res.nombreFuente}: ${Math.round(res.coincidencia * 100)} % encontrada${s.repetida ? " (ya estaba sincronizada: no costó nada)" : `; costó ${textoCosto(s.costo ?? 0)} (aproximado)`}.`,
            res.revisar ? "OJO: la letra no se encontró bien en la canción. Revisa la vista previa; si todo va adelantado o atrasado, desplazamiento (±1,5 s)." : "",
            ...(res.avisos ?? []),
            r.aviso ? r.aviso : "",
            disenar === true ? `Escenas diseñadas por la IA sobre la letra${r.corregido ? " (corrigió su primer intento)" : ""}.` : "Es la PRUEBA DE SINCRONÍA (karaoke, gratis): una escena por línea con la letra de titular. Para un diseño con más fuerza: disenar=true.",
            r.estilo ? `Con el estilo guardado «${r.estilo.nombre}»: su forma ya está impuesta.` : "",
            r.fondos > 0 ? `Lleva ${r.fondos} imagen(es) de fondo POR CREAR (mientras tanto se ve el fondo de la escena): fondos_video las crea con el director (dice el costo antes).` : "",
            `Líneas (con su segundo): ${res.lineas.slice(0, 14).map((l) => `[${l.desde.toFixed(1)}] ${l.texto}`).join(" · ")}${res.lineas.length > 14 ? " · …" : ""}`,
            "Siguiente: ver_video o ver_escenas para revisarlo; aprobar_video SÓLO con el sí de la persona (la canción ya es su locución) y renderizar_video.",
            textoDelVideo(video, { conGuion: false }),
          ].filter(Boolean).join("\n");
          return { texto, imagenes: [], vista: await vistaDeVideo(env, { video, clienteId: c.id, cliente: { id: c.id, nombre: c.name } }) };
        } catch (e) {
          if (!(e instanceof ErrorCancion)) throw e;
          if (e.extra?.codigo === "confirmar") {
            return `NO SE CREÓ NADA. ${e.message.replace(/ Confírmalo para hacerlo\.$/, "")} Díselo al usuario con esa cifra y pregúntale si lo hago. Sólo si responde que sí, vuelve a llamar con los MISMOS datos y confirmado=true.`;
          }
          throw new Fallo(e.message);
        }
      });
    },

    async estilos_video({ cliente } = {}) {
      const c = await resolverCliente(cliente);
      const lista = estilosDelCliente(c);
      if (!lista.length) return `${c.name} no tiene estilos de video guardados. Cuando un video quede como la persona lo quiere, guárdalo con guardar_estilo_video y el siguiente saldrá igual.`;
      return [
        `Estilos de video de ${c.name} (pásalo con estilo_id en video_con_cancion o crear_video):`,
        ...lista.map((e) => [`· ${e.nombre} — ID ${e.id} · para ${USOS_ESTILO_VIDEO[e.para].toLowerCase()}${e.de?.titulo ? ` · sale de «${e.de.titulo}»` : ""}`, ...e.resumen.map((x) => `    ${x}`)].join("\n")),
        "",
        "Si escribes TÚ el guion (crear_video), síguelo así:",
        lineaDeEstilo(lista[0]),
      ].join("\n");
    },

    async guardar_estilo_video({ cliente, video_id: videoId, nombre = "", nota = "", para = "" }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, videoId);
        try {
          const r = await guardarEstilo(env, acceso, c, fila, { nombre, nota, para }, usuario);
          difundir(env, acceso.ownerId, { tipo: "estudio", clientId: c.id, por });
          return [`Guardado el estilo «${r.estilo.nombre}» (ID ${r.estilo.id}) en ${c.name}, de «${fila.titulo}»:`, ...r.estilo.resumen.map((x) => `· ${x}`),
            "El próximo video: estilo_id en video_con_cancion o crear_video."].join("\n");
        } catch (e) {
          if (e instanceof ErrorEstilo) throw new Fallo(e.message);
          throw e;
        }
      });
    },

    async aplicar_estilo_video({ cliente, video_id: videoId, estilo_id: estiloId, version }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, videoId);
        try {
          const r = await aplicarEstiloAVideo(acceso, c, fila, { estiloId: String(estiloId ?? ""), version, por: por?.nombre ?? null });
          if (!r.cambios) return "El video ya tenía la forma de ese estilo: no había nada que cambiar.";
          avisar(c.id, r.video.id);
          return [`Estilo aplicado: ${r.cambios} cambio(s) de forma. Ahora es la versión ${r.video.version} (${NOMBRE_ESTADO_VIDEO[r.video.estado]}).`, textoDelVideo(r.video, { conGuion: false })].join("\n");
        } catch (e) {
          if (e instanceof ErrorEstilo) throw new Fallo(e.message);
          throw e;
        }
      });
    },

    async fondos_video({ cliente, video_id: videoId, confirmado }) {
      const c = await resolverCliente(cliente);
      const fila = await acceso.leerUno("videos_proyectos", { id: String(videoId ?? ""), client_id: c.id });
      if (!fila) throw new Fallo("No encuentro ese video animado en este cliente (listar_videos).");
      // En el momento: fondosVideo.js lee encargos.js, que estático cerraría el ciclo con herramientas.js.
      const { pedirFondos } = await import("./fondosVideo.js");
      return conErrores(async () => {
        try {
          const r = await pedirFondos(env, acceso, c, fila, { confirmado: confirmado === true, usuario });
          return [
            `Pedidas ${r.fondos === 1 ? "la imagen de fondo" : `las ${r.fondos} imágenes de fondo`} del video «${fila.titulo}» al director (${r.modelo}, unos ${r.texto}). Encargo ${r.encargo?.id}.`,
            r.sinPreguntar ?? "",
            "Se crean en el servidor (unos minutos) y se ponen solas en el guion; mira cómo va con ver_video.",
          ].filter(Boolean).join("\n");
        } catch (e) {
          if (e instanceof ErrorVideo && e.extra?.codigo === "confirmar") {
            return `NO SE CREÓ NADA. ${e.message}${e.extra.aviso ? ` ${e.extra.aviso}` : ""} Díselo al usuario con esa cifra. Sólo si responde que sí, vuelve a llamar con confirmado=true.`;
          }
          throw e;
        }
      });
    },

    async formato_video() {
      return `${formatoParaLaIA()}\n\nLa FORMA de la voz en off (el orden de los momentos) puede seguir una estructura de guion de la agencia: ver_estructuras con para=voz, y su ID en crear_video (estructura_id).`;
    },

    async ver_estructuras({ para = "", segundos } = {}) {
      const uso = ["voz", "ugc"].includes(para) ? para : "";
      const lista = await leerEstructuras(acceso, { para: uso });
      const nombreUso = uso ? ` para ${USOS_ESTRUCTURA[uso].toLowerCase()}` : "";
      if (!lista.length) return `La agencia no tiene estructuras de guion${nombreUso} todavía (se guardan en Ajustes → Cómo trabajamos → Estructuras de guion). Sin ninguna, escribe el guion con el criterio de siempre.`;
      const s = Number(segundos) > 0 ? Number(segundos) : 0;
      return [
        `Estructuras de guion de la agencia${nombreUso} (para todos los clientes; el tono de cada marca va aparte):`,
        ...lista.map((f) => [
          `· «${f.nombre}» (ID ${f.id}) · sirve para: ${paraDe(f).map((u) => USOS_ESTRUCTURA[u]).join(" y ")}${f.cuando ? ` · conviene: ${f.cuando}` : ""}`,
          `  ${s ? `En ${s} s: ` : `Original (${f.duracion} s): `}${(s ? tramosEnDuracion(f, s) : f.tramos).map((t) => `${t.desde != null && t.hasta != null ? `[${t.desde}–${t.hasta} s] ` : ""}${t.funcion}`).join(" · ")}`,
          f.gancho || f.porQue || f.variantes ? `  ${[f.gancho && `Gancho: ${f.gancho}`, f.porQue && `Por qué funciona: ${f.porQue}`, f.variantes && `Variantes: ${f.variantes}`].filter(Boolean).join(" · ")}` : "",
        ].filter(Boolean).join("\n")),
        "Para usar una: su ID en crear_video o crear_reel (estructura_id). Sin escoger, crear_reel deja que la IA escoja la que encaje. Para corregir una: guardar_estructura con su ID.",
      ].join("\n");
    },

    async guardar_estructura({ id = "", nombre = "", para = "", duracion, tramos = [], tipo_gancho: tipoGancho = "", por_que_funciona: porQue = "", cuando_conviene: cuando = "", variantes = "" } = {}) {
      const usos = para === "ambos" ? ["voz", "ugc"] : ["voz", "ugc"].includes(para) ? [para] : [];
      if (!usos.length) throw new Fallo("Di para qué sirve: «voz» (voz en off), «ugc» (guion para grabar) o «ambos».");
      const formula = estructuraDeTramosConPeso({ nombre, para: usos, duracion, tramos, tipoGancho, porQue, cuando, variantes });
      try {
        const e = await guardarEstructura(acceso, usuario, formula, { id });
        difundir(env, acceso.ownerId, { tipo: "formulas-ugc", por });
        return [
          `${id ? "Corregida" : "Guardada"} la estructura «${e.nombre}» (ID ${e.id}) · sirve para: ${paraDe(e).map((u) => USOS_ESTRUCTURA[u]).join(" y ")}. Ya sale en Ajustes → Cómo trabajamos → Estructuras de guion.`,
          `Original (${e.duracion} s): ${e.tramos.map((t) => `[${t.desde}–${t.hasta} s] ${t.funcion}`).join(" · ")}`,
          [e.gancho && `Gancho: ${e.gancho}`, e.porQue && `Por qué funciona: ${e.porQue}`, e.cuando && `Conviene: ${e.cuando}`, e.variantes && `Variantes: ${e.variantes}`].filter(Boolean).join(" · "),
          `Para usarla: estructura_id = ${e.id} en crear_video o crear_reel.`,
        ].filter(Boolean).join("\n");
      } catch (e) {
        if (e instanceof ErrorEstructura) throw new Fallo(e.message);
        throw e;
      }
    },

    async eliminar_estructura({ id = "" } = {}) {
      try {
        const e = await quitarEstructura(acceso, usuario, id);
        difundir(env, acceso.ownerId, { tipo: "formulas-ugc", por });
        return `Quitada la estructura «${e.nombre || e.id}» (ID ${e.id}): ya no se ofrece a ningún cliente. Lo que la siguió no cambia.`;
      } catch (e) {
        if (e instanceof ErrorEstructura) throw new Fallo(e.message);
        throw e;
      }
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

    async tiempos_locucion({ cliente, video_id: id, archivo_id: archivoId }) {
      const c = await resolverCliente(cliente);
      const s2 = (x) => Number(x).toFixed(2);
      const fuenteDe = (f) => ({ motor: "los del motor (ElevenLabs)", verificado: "verificados al oírla", estimado: "ESTIMADOS (el motor no los dio)" }[f] ?? "sin saber de dónde");
      if (archivoId) {
        const f = await acceso.leerUno("estudio_archivos", { id: String(archivoId), client_id: c.id });
        if (!f || f.tipo !== "audio") throw new Fallo(`No encontré la locución «${archivoId}» en la galería de ${c.name}.`);
        const aj = (() => { try { return JSON.parse(f.ajustes ?? "{}") ?? {}; } catch { return {}; } })();
        const palabras = Array.isArray(aj.palabras) ? aj.palabras : [];
        if (!palabras.length) return `La locución «${archivoId}» no tiene los tiempos de sus palabras (es de antes, o no es una locución suelta).`;
        return [
          `Tiempos de la locución «${f.prompt || archivoId}» (${aj.duracion ? `${s2(aj.duracion)} s, ` : ""}${palabras.length} palabras; ${fuenteDe(aj.fuente)}), en segundos del audio: palabra inicio–fin.`,
          palabras.map((p, i) => `${i + 1}. ${p.texto} ${s2(p.desde)}–${s2(p.hasta)}`).join("\n"),
        ].join("\n");
      }
      if (!id) throw new Fallo("Dime de qué: video_id (un video animado) o archivo_id (una locución suelta).");
      return conErrores(async () => {
        const v = deFila(await proyectoDe(acceso, c.id, id));
        const palabras = v.locucion?.palabras;
        if (v.locucion?.estado !== "lista" || !Array.isArray(palabras) || !palabras.length) {
          return `El video «${v.titulo || id}» todavía no tiene su locución lista: los tiempos salen de ella (generar_locucion).`;
        }
        const linea = lineaDeTiempo(v.guion, palabras);
        const silencios = (linea.silencios ?? []).filter((x) => x.dur > 0);
        return [
          `Tiempos de «${v.titulo || id}» (${fuenteDe(v.locucion.fuente)}; el video dura ${s2(linea.total)} s), en segundos DEL VIDEO: palabra inicio–fin.`,
          silencios.length ? `Silencios insertados en el audio: ${silencios.map((x) => `${s2(x.dur)} s tras el ${s2(x.en)} del audio`).join(" · ")}.` : "Sin silencios insertados: el tiempo del video es el del audio.",
          ...linea.escenas.map((e, k) => `Escena ${k + 1} (${e.id}, ${s2(e.desde)}–${s2(e.hasta)} s): ${e.palabras.length ? e.palabras.map((p) => `${p.texto} ${s2(p.desde)}–${s2(p.hasta)}`).join(" · ") : "sin habla"}`),
        ].join("\n");
      });
    },

    async crear_video({ cliente, guion, titulo, publicacion_id: postId, estructura_id: estructuraPedida = "", estilo_id: estiloId = "" }) {
      const c = await resolverCliente(cliente);
      // Un estilo guardado: su forma se impone al guion antes de crearlo (lo que se dice y se lee no cambia).
      let estilo = null;
      if (estiloId) {
        try { estilo = estiloDelCliente(c, estiloId); } catch (e) { if (e instanceof ErrorEstilo) throw new Fallo(`${e.message} (los IDs salen de estilos_video).`); throw e; }
        if (guion && typeof guion === "object" && Array.isArray(guion.escenas)) guion = aplicarEstilo(guion, estilo, { conFondos: conFondosPorCrear(guion) }).guion;
      }
      return conErrores(async () => {
        let liga = null;
        if (postId) {
          liga = await publicacionDelCliente(acceso, c.id, postId);
          if (!liga) throw new ErrorVideo(`No encontré la publicación «${postId}» en los calendarios de ${c.name} (los IDs salen de ver_calendario).`, 404);
        }
        const estructuraId = estructuraPedida ? await estructuraExistente(acceso, estructuraPedida) : "";
        if (estructuraPedida && !estructuraId) throw new ErrorVideo(`No encontré la estructura de guion «${estructuraPedida}» (los IDs salen de ver_estructuras).`, 404);
        const r = await crearProyecto(acceso, c, {
          guion, titulo, calendarId: liga?.calendarId, postId: liga?.postId, usuario, estructuraId,
          ...(estilo ? { origen: { tipo: "", estiloId: estilo.id }, ...(estilo.efectos === false ? { sonido: { efectos: false } } : {}) } : {}),
        });
        avisar(c.id, r.video.id);
        return [
          `Creado el video «${r.video.titulo}» (ID ${r.video.id}), versión 1, en borrador. Se ve en el Estudio de ${c.name} → Video → Animado con código.`,
          estilo ? `Con el estilo guardado «${estilo.nombre}»: su forma ya está impuesta.` : "",
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

    async sonido_video({ cliente, video_id: id, efectos, musica_id: musicaId, volumen, efecto_transicion_id: transicion, efecto_sello_id: sello }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        const fila = await proyectoDe(acceso, c.id, id);
        const antes = deFila(fila).sonido;
        const cambia = [efectos, musicaId, volumen, transicion, sello].some((x) => x !== undefined);
        let ahora = antes;
        if (cambia) {
          const musica = musicaId === undefined ? antes.musica : musicaId ? { archivoId: musicaId, volumen: volumen ?? (antes.musica?.archivoId === musicaId ? antes.musica.volumen : 0) } : null;
          if (musica && volumen !== undefined) musica.volumen = volumen;
          // Los efectos de la biblioteca: un id lo pone; «» lo quita (vuelve el sintetizado); sin pasarlo, se queda el de antes.
          const propio = (nuevo, sitio) => (nuevo === undefined ? antes.efectosPropios?.[sitio] ?? null : nuevo || null);
          const efectosPropios = { transicion: propio(transicion, "transicion"), sello: propio(sello, "sello") };
          ahora = (await guardarSonido(acceso, c, fila, { efectos: efectos ?? antes.efectos, musica, efectosPropios })).video.sonido;
          avisar(c.id, id);
        }
        const m = ahora.musica;
        const ef = ahora.efectosPropios ?? {};
        const efectosTexto = !ahora.efectos ? "efectos apagados" : `efectos encendidos (transiciones: ${ef.transicion ? `«${ef.transicion.nombre}»` : "el whoosh de la aplicación"}; sellos y llamados: ${ef.sello ? `«${ef.sello.nombre}»` : "el pop de la aplicación"})`;
        return [
          `${cambia ? "Guardado. " : ""}Sonido de «${fila.titulo}»: ${efectosTexto}; ${m ? `música «${m.nombre}»${m.de === "agencia" ? " (de la agencia)" : ""} (${m.volumen > 0 ? "+" : ""}${m.volumen} dB)` : "sin música"}.`,
          cambia && fila.estado === "renderizado" ? "El mp4 que ya hay es de antes: renderizar_video para oírlo (no gasta IA ni pide otra voz)." : "",
        ].filter(Boolean).join(" ");
      });
    },

    async publicar_con_musica({ cliente, publicacion_id: postId, musica_id: musicaId = "", segundos, movimiento, logo, reel = false, transicion, voz = false, confirmado }) {
      const c = await resolverCliente(cliente);
      return conErrores(async () => {
        let r;
        try {
          r = await conMusicaSegun(env, acceso, c, {
            postId, musicaId, segundos, movimiento, logo: typeof logo === "boolean" ? logo : undefined, reel: reel === true, transicion, voz: voz === true,
            confirmado: confirmado === true, usuario, por,
          });
        } catch (e) {
          // La música nueva o la voz piden el «sí»: NO SE CREÓ NADA todavía.
          if (e?.codigo === "confirmar") {
            return `NO SE CREÓ NADA TODAVÍA. ${e.message}${Array.isArray(e.hablas) && e.hablas.length ? ` Lo que dirá la voz, lámina a lámina: ${e.hablas.map((h, i) => `${i + 1}. «${h}»`).join(" ")}` : ""} Enséñaselo a la persona y, sólo con su sí, repite con confirmado=true.`;
          }
          if (e?.estado && !(e instanceof ErrorVideo)) throw new Fallo(e.message);
          throw e;
        }
        if (r.tipo === "a-mano") {
          return [
            "Marcada para publicarla A MANO con la música de Instagram (el carrusel no se convierte: la API no deja poner su música).",
            r.cancion ? `Canción sugerida: «${textoDeCancion(r.cancion)}» (de la lista de ${c.name}; no repite la última usada).`
              : r.sinLista ? `${c.name} no tiene lista de canciones de Instagram: la agencia la escribe en Marca → Kit y voz.` : "",
            r.sacadas ? "Estaba programada: se sacó de la cola para que no salga sola sin la música." : "",
            `A su hora (y 10 min antes) llega el aviso a la campana con la pantalla del teléfono: ${r.enlace} (las imágenes en orden para compartir a Instagram, el texto para copiar y la canción).`,
          ].filter(Boolean).join(" ");
        }
        avisar(c.id, r.video.id);
        const capa = r.video.guion?.escenas?.[0]?.capas?.[0] ?? {};
        const mov = MOVIMIENTOS_FOTO.find((m) => m.id === capa.movimiento)?.nombre.toLowerCase() ?? "con movimiento";
        const escenas = r.video.guion?.escenas?.length ?? 1;
        const que = escenas > 1 ? `las ${escenas} láminas del carrusel` : `la foto con ${mov}, ${capa.dura ?? ""} s`;
        const texto = `Haciendo el reel con música de la publicación ${postId}: ${que}${r.musica?.nombre ? `, con «${r.musica.nombre}»` : ""}. ${r.aviso} Míralo con ver_video (video_id ${r.video.id}).`;
        const video = { ...r.video, locucion: await locucionAlDia(acceso, r.video.locucion) };
        return { texto, imagenes: [], vista: await vistaDeVideo(env, { video, clienteId: c.id, cliente: { id: c.id, nombre: c.name } }) };
      });
    },

    async musicas({ cliente }) {
      const c = await resolverCliente(cliente);
      const [suya, agencia] = await Promise.all([sonidosDelCliente(acceso, c.id), sonidosDeLaAgencia(acceso).catch(() => ({ musica: [], efectos: [] }))]);
      const linea = (p) => `· ${p.id} — ${textoDePista(p)} · ${(p.bytes / 1048576).toFixed(1)} MB`;
      const bloque = (titulo, lista, vacio) => (lista.length ? [titulo, ...lista.map(linea)] : [`${titulo} ${vacio}`]);
      const hay = suya.musica.length + suya.efectos.length + agencia.musica.length + agencia.efectos.length;
      if (!hay) return `${c.name} no tiene músicas ni efectos en su biblioteca, y la agencia tampoco. Se suben en Marca → Música y efectos (MP3, WAV o M4A: música de hasta 15 MB, efectos de hasta 2 MB, con derechos para usarlos) o se genera una con generar_musica.`;
      return [
        `La biblioteca de sonido de ${c.name} (gratis: no hace falta generar otra con Suno si alguna sirve). Para un video: sonido_video con musica_id, y efecto_transicion_id / efecto_sello_id para los efectos.`,
        ...bloque(`Música de ${c.name}:`, suya.musica, "ninguna."),
        ...bloque(`Efectos de ${c.name}:`, suya.efectos, "ninguno."),
        ...bloque("Música de la agencia (para todos los clientes):", agencia.musica, "ninguna."),
        ...bloque("Efectos de la agencia:", agencia.efectos, "ninguno."),
      ].join("\n");
    },

    async personaje_video({ cliente, ...cambios }) {
      const c = await resolverCliente(cliente);
      const kit = kitDe(c);
      const mascota = (p) => (p.imagenes ? ` Mascota propia (imagen por pose): ${Object.entries(p.imagenes).map(([pose, id]) => `${pose} → ${id}`).join(", ")}.` : "");
      const describir = (p, guardado) => `${guardado ? "Guardado en el kit de" : "El personaje de"} ${c.name}${p.nombre ? ` («${p.nombre}»)` : ""}: piel ${p.piel}, ${p.pelo ? `pelo ${p.pelo}` : "sin pelo"}, ropa ${p.ropa}, accesorio ${p.accesorio}.${mascota(p)}${guardado ? " Sale así en todos sus videos (salvo un guion que traiga estilo.personaje propio)." : ""}`;
      const campos = ["piel", "pelo", "ropa", "accesorio", "nombre", "imagenes"].filter((k) => cambios[k] !== undefined);
      if (!campos.length) return tieneAspecto(kit.personajeVideo) ? describir(limpiarPersonaje(kit.personajeVideo), false) : `${c.name} no tiene personaje propio: se dibuja con el aspecto de partida (${describir(ASPECTO_POR_DEFECTO, false).split(": ")[1]})`;
      // Las imágenes de la mascota: sólo de la galería de ESTE cliente, y sólo imágenes (se suman a las que había).
      if (cambios.imagenes !== undefined) {
        const pedidas = cambios.imagenes && typeof cambios.imagenes === "object" ? cambios.imagenes : {};
        const ids = Object.values(imagenesDePoses(pedidas));
        const hay = ids.length ? await acceso.leerVarios("estudio_archivos", ["id", "mime", "borrado_at"], "id", ids, { client_id: c.id }) : [];
        const buenas = new Set(hay.filter((f) => !f.borrado_at && String(f.mime).startsWith("image/")).map((f) => f.id));
        const malas = ids.filter((id) => !buenas.has(id));
        if (malas.length) throw new Fallo(`Esas imágenes no son de la galería de ${c.name}: ${malas.join(", ")} (usa los IDs de ver_estudio).`);
        const antes = kit.personajeVideo?.imagenes ?? {};
        const todas = { ...antes, ...Object.fromEntries(Object.entries(pedidas).map(([k, v]) => [k, String(v ?? "")])) };
        cambios = { ...cambios, imagenes: imagenesDePoses(todas) };
      }
      const nuevo = limpiarPersonaje({ ...(kit.personajeVideo ?? {}), ...Object.fromEntries(campos.map((k) => [k, cambios[k]])) });
      try {
        const guardado = await guardarKit(env, acceso, c, { ...kit, personajeVideo: nuevo });
        return describir(guardado.personajeVideo ?? nuevo, true);
      } catch (e) {
        throw new Fallo(e.message);
      }
    },

    async voz_de_marca({ cliente, voz = "", modelo }) {
      const c = await resolverCliente(cliente);
      const loc = kitDe(c).locucion ?? {};
      if (!voz && !modelo) {
        return loc.voz ? `La voz de ${c.name} es ${loc.voz} (modelo ${loc.modelo || "v4"}): con ella salen sus locuciones y el montaje de sus reels. Para cambiarla, voz_de_marca con «voz» (de listar_voces).` : `${c.name} no tiene voz fijada: se usa la de partida. Escoge una con listar_voces y fíjala con voz_de_marca.`;
      }
      try {
        const r = await fijarVozDeMarca(env, acceso, c, { vozId: voz || loc.voz || "", modelo });
        return `Voz de ${c.name}: ${r.voz ? `${r.voz.nombre} (${r.voz.id})` : "la de partida"}, modelo ${r.modelo}. Desde ahora sale en todos sus videos (los ya generados no cambian: su locución es la de antes).`;
      } catch (e) {
        throw new Fallo(e.message);
      }
    },

    async lexico_de_marca({ cliente, reglas }) {
      const c = await resolverCliente(cliente);
      const actual = kitDe(c).lexico ?? [];
      const listar = (l) => (l.length ? l.map((r) => (r.di ? `· di «${r.di}», nunca ${r.nunca.map((n) => `«${n}»`).join(" ni ")}` : `· nunca ${r.nunca.map((n) => `«${n}»`).join(" ni ")} (se avisa; no se cambia sola)`)).join("\n") : "· (ninguna)");
      if (reglas === undefined) return `Léxico de ${c.name}:\n${listar(actual)}`;
      try {
        const kit = await guardarLexico(env, acceso, c, Array.isArray(reglas) ? reglas : []);
        return `Léxico de ${c.name} guardado:\n${listar(kit.lexico ?? [])}\nSe aplica solo a lo que se dice y se lee en sus videos (los guardados cambian la próxima vez que se guarden).`;
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
