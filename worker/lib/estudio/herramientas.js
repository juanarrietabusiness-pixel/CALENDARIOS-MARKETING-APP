// ============================================================
// El Estudio desde el asistente y desde Claude (MCP)
//
// Tres herramientas, las mismas en los dos sitios (una sola implementación,
// como las de consulta de `herramientasServidor.js`):
//
//   · ver_estudio        qué modelos hay HOY, lo último de la galería, lo que está en
//                        marcha, la GUÍA VISUAL de la marca (del cerebro) y el CATÁLOGO
//                        con los ids de las fotos de cada producto y del logo
//   · crear_en_estudio   pide una imagen o un video: un TRABAJO, no una espera
//   · estado_trabajo     cómo va un pedido y qué archivos dio (terminado: con las IMÁGENES, para que las mire)
//   · ver_pieza          mirar piezas de la galería por su ID (copia reducida por el Container: miniaturas.js)
//
// CREAR NO ESPERA. El Worker no puede quedarse a ver un video; el pedido queda
// en la cola del Estudio, lo avanza el cron del minuto (o el navegador de quien
// tenga el Estudio abierto) y el resultado aparece en la galería del cliente.
// La respuesta de la herramienta lo dice, con el id para preguntar después.
//
// LAS MISMAS REGLAS QUE LA PANTALLA, PORQUE VAN POR EL MISMO SITIO. `crearTrabajo`
// valida el modelo, exige la llave, comprueba que las imágenes sean de ESTE cliente
// y pide la segunda confirmación desde 0,50 $ (409 `confirmar`) y el presupuesto
// antes de crear nada. Aquí sólo se añade lo propio de que pida una IA y no una
// persona:
//   · topes más cortos (`LIMITES`): hasta 4 imágenes por pedido y 10 s de video;
//   · las imágenes de apoyo se piden por ID de la GALERÍA, nunca por clave de R2:
//     el modelo no puede apuntar a un archivo que no esté ahí ni a uno de otro cliente;
//   · el cobro pasa por la confirmación: la herramienta NO la da por su cuenta. Devuelve
//     el costo y la orden de preguntar; `confirmado: true` sólo va después de un «sí».
//
// LA GUÍA VISUAL SE LE ENSEÑA AL MODELO, NO SE PEGA AL PROMPT. Lo que sale hacia el
// proveedor es lo que quedó escrito en la galería; que la marca se cuele por detrás
// sería un prompt que nadie escribió. Claude ve la guía y la usa al escribir el suyo.
// Sale del cerebro con `para: "imagen"`: la identidad visual, sin las notas internas
// (costos, márgenes) que a un proveedor externo no se le cuentan.
//
// LAS FOTOS DEL CATÁLOGO SE DAN POR SU ID DE LA GALERÍA. Antes ver_estudio sólo enseñaba
// las 12 piezas más nuevas: las fotos REALES de un producto (subidas hace semanas) no
// salían nunca, y un video del producto se lo inventaba entero. El catálogo se lee de
// `mercado_clientes` a mano y no con `leerMercado`: mercado.js importa (por
// herramientasServidor.js) este archivo, y sería circular.
// ============================================================

import {
  MODELOS, modeloPorId, modeloPorDefecto, nombreDelModelo, textoCosto, MAX_VIDEOS_POR_PEDIDO, NOMBRE_ESTADO, estaVivo, MAX_PROMPT,
  modeloQueRespeta, validarPedido, pideConfirmar,
} from "../../../src/lib/estudioCatalogo.js";
import { bloqueoPorPresupuesto } from "../configIA.js";
import { ESCENA } from "../../../src/lib/encargos.js";
import { estadoMotores } from "./motores.js";
import { crearTrabajo, trabajoPublico, ErrorEstudio } from "./trabajos.js";
import { buscar as buscarCerebro } from "../cerebro/cerebro.js";
import { pack } from "../cerebro/memoria.js";
import { kitDe } from "./kit.js";
import { pedidoConMarca, ponerLogo, kitVacio, IDS_PRESET, TIPOS_PRESET } from "../../../src/lib/kitMarca.js";
import { productosActivos } from "../../../src/lib/estudioMercado.js";
import { lineasDeReferencias } from "../../../src/lib/referencias.js";
import { ajustarFicha, esFicha, textoDeLaFicha } from "../../../src/lib/director.js";
import { listarVoces, pedirMuestra, pedirLocucion, ErrorVoz } from "./locucion.js";
import { pedirMusica, ErrorMusica } from "./musica.js";
import { DURACION_MUSICA } from "../../../src/lib/musica.js";
import { MODELOS_VOZ } from "../../../src/lib/voces.js";
import { DEFINICIONES_VIDEO, crearHerramientasVideo } from "./herramientasVideo.js";
import { miniaturasDe, MAX_PIEZAS_VISTAS } from "./miniaturas.js";
import { vistaDeTrabajo } from "./vistaTrabajo.js";
import { audioDeMuestra, lineasDeMedios } from "./vistaMedios.js";
import { vistaDe, piezaDe } from "../mcpVista/modelo.js";

/** Lo más que puede pedir una IA de una vez. La pantalla admite más (8 imágenes, 2 videos): ahí lo ve una persona. */
// 15 s: lo que dura un clip de MiniMax H3 o Kling 3.0 (la receta «Video del producto»). El gasto lo frena la confirmación.
export const LIMITES = Object.freeze({ imagenes: 4, videos: MAX_VIDEOS_POR_PEDIDO, segundos: 15 });

const GALERIA_A_MOSTRAR = 12;
/** Los videos más viejos que se enseñan además (para las capas «video» de un video animado). */
const VIDEOS_A_MOSTRAR = 10;
const MAX_GUIA = 1_800;
const CONSULTA_VISUAL = "estilo visual identidad paleta colores fotografía iluminación composición tipografía evitar negativos";

/** Un error de lo pedido: vuelve al modelo como resultado, no como fallo del servidor. */
export class ErrorHerramientaEstudio extends Error {}

/** El modelo de imagen del cliente: el fijado en su kit si tiene llave; si no, el predeterminado. Pura. */
export function modeloFijado(activos, kit) {
  const m = kit?.modelos?.imagen ? modeloPorId(kit.modelos.imagen) : null;
  return m && m.tipo === "imagen" && (m.motor === "prueba" || activos[m.motor]) ? m : modeloPorDefecto(activos, "imagen");
}

const clienteParam = {
  cliente: { type: "string", description: "Nombre del cliente. En el asistente de un cliente se puede omitir: es ese cliente." },
};

/** Las definiciones, con la forma de la API de Anthropic (`input_schema`). El MCP las convierte a `inputSchema`. */
export const DEFINICIONES_ESTUDIO = Object.freeze([
  {
    name: "ver_estudio",
    description:
      "El Estudio de un cliente (imágenes y videos con IA): qué modelos están disponibles ahora y cuánto cuestan, la GUÍA VISUAL de su " +
      "marca, su CATÁLOGO con los IDs de las fotos reales de cada producto y del logo, lo último de su galería (con los IDs para partir de una " +
      "imagen) y lo que está en marcha. Mírala ANTES de crear algo: los modelos que aparecen son los únicos que funcionan, la guía visual es lo " +
      "que hay que meter en el prompt para que la pieza sea de esa marca, y si la pieza enseña un producto, sus fotos van de referencia o de " +
      "imagen_inicial: sin ellas el modelo se inventa el empaque.",
    input_schema: { type: "object", properties: { ...clienteParam } },
  },
  {
    name: "crear_en_estudio",
    description:
      "Pide una IMAGEN o un VIDEO al Estudio de un cliente. NO espera el resultado: queda en cola, se hace solo (un video tarda de 1 a 10 minutos) " +
      "y aparece en la galería del cliente. Devuelve el ID del pedido para consultarlo con estado_trabajo. " +
      "Una IMAGEN sale como las del lote: con el modelo fijado del cliente (si no pides otro), diseñada por el director de arte " +
      "de la agencia si el prompt no es ya una ficha de diseño, revisada por el control de calidad y con el logo del kit. " +
      "Para una imagen suelta que deba verse aquí mismo en el chat, usa generar_imagen; esta es para video, para varias variantes, para elegir modelo " +
      "o para partir de imágenes de la galería. Cuesta dinero: si el pedido sale caro, la respuesta trae el costo y NO se crea nada hasta confirmarlo. " +
      "Entonces pregúntale al usuario, con la cifra, y sólo si dice que sí vuelve a llamarla con confirmado=true. Nunca pongas confirmado=true por tu cuenta. " +
      `Topes: hasta ${LIMITES.imagenes} imágenes o ${LIMITES.videos} videos por pedido, y ${LIMITES.segundos} s por video.`,
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        tipo: { type: "string", enum: ["imagen", "video"], description: "Por defecto, imagen." },
        prompt: { type: "string", description: "Qué crear: sujeto, composición, luz, estilo y, si hace falta, el texto exacto. Incluye lo esencial de la guía visual de ver_estudio." },
        modelo: { type: "string", description: "ID de un modelo de ver_estudio. Si se omite, el predeterminado del tipo." },
        cantidad: { type: "integer", description: "Cuántas variantes. Por defecto 1." },
        formato: { type: "string", enum: ["1:1", "4:5", "3:4", "9:16", "16:9"], description: "Proporción: 4:5 feed de Instagram, 9:16 historia o reel, 1:1 cuadrada, 16:9 horizontal. Cada modelo admite algunas." },
        duracion: { type: "integer", description: "Segundos de un video (el modelo admite unos valores concretos)." },
        imagen_inicial: { type: "string", description: "ID de una imagen de la galería (de ver_estudio): el video arranca de ella." },
        imagen_final: { type: "string", description: "ID de una imagen de la galería en la que termina el video (necesita imagen_inicial; no todos los modelos la admiten)." },
        referencias: { type: "array", items: { type: "string" }, description: "IDs de imágenes de la galería que sirven de referencia (producto, estilo, persona). Cada modelo admite un número distinto." },
        estilo: {
          type: "string", enum: [...IDS_PRESET],
          description: `El preset del KIT DE MARCA según el TIPO DE CONTENIDO (${Object.entries(TIPOS_PRESET).map(([id, d]) => `${id}: ${d.nombre}`).join("; ")}; las 7 maletas también como maletas-garantia, maletas-testimonio, maletas-solucion o maletas-objeciones). La identidad de la marca (paleta, estilo, tipografía) y el logo de referencia van SIEMPRE que el cliente tenga kit, con estilo o sin él: el prompt es sólo la ESCENA en una o dos frases.`,
        },
        sin_logo: { type: "boolean", description: "Una imagen SIN el logo del kit (el primer fotograma de un video: el logo va sólo en la imagen del cierre)." },
        confirmado: { type: "boolean", description: "Sólo tras oír «sí» del usuario a la cifra exacta que le dijiste." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "estado_trabajo",
    description:
      "Cómo va un pedido del Estudio (el ID lo dio crear_en_estudio o sale en ver_estudio): si sigue en marcha, si falló y por qué, y qué archivos dio " +
      "(con sus IDs). Cuando ya terminó, devuelve además las IMÁGENES (una copia reducida) para que las MIRES: juzga el texto letra por letra, la " +
      "composición y la marca antes de decir que está bien.",
    input_schema: { type: "object", properties: { trabajo_id: { type: "string" } }, required: ["trabajo_id"] },
  },
  {
    name: "ver_pieza",
    description:
      "MIRA piezas de la galería del Estudio de un cliente por su ID (de ver_estudio, estado_trabajo o un diseño): devuelve cada imagen (una copia " +
      `reducida) con lo que se sabe de ella —modelo, el pedido, el resultado del control de calidad y si la usa una publicación—. Hasta ${MAX_PIEZAS_VISTAS} a la vez. ` +
      "Úsala antes de decir que una pieza está bien o de proponer una corrección. No gasta.",
    input_schema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre o ID del cliente." },
        archivo_ids: { type: "array", items: { type: "string" }, description: "IDs de la galería (de 1 a 6)." },
      },
      required: ["cliente", "archivo_ids"],
    },
  },
  {
    name: "listar_voces",
    description:
      "Las voces con las que se puede hacer la LOCUCIÓN de un video animado de un cliente (ElevenLabs v4 con emociones por la llave oficial; v3 " +
      "por Kie.ai o si la cuenta no tiene v4; v2 de respaldo): su ID, nombre, género y tono en español, si es NATIVA en español (van primero: " +
      "prefiérelas para la marca), cuál es la de la marca y si su muestra ya está hecha (oírla entonces es gratis). No gasta nada.",
    input_schema: { type: "object", properties: { ...clienteParam } },
  },
  {
    name: "previsualizar_voz",
    description:
      "La MUESTRA de una voz para escucharla antes de escogerla: una frase fija o, con `texto`, el texto que se quiera oír (hasta 500 caracteres, " +
      "con [emociones] en v4 y v3). Si ya está hecha, da la dirección para oírla y no cuesta nada. Al terminar, estado_trabajo dice si el motor devolvió " +
      "el tiempo de cada palabra. " +
      "Si no, CUESTA dinero (centavos) y NO se crea hasta confirmarlo: la respuesta trae la cifra; díselo al usuario y sólo si dice que sí vuelve " +
      "a llamarla con confirmado=true. Nunca pongas confirmado=true por tu cuenta. Es un pedido: no espera, se hace solo en un minuto.",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        voz: { type: "string", description: "ID de una voz de listar_voces." },
        modelo: { type: "string", enum: ["v4", "v3", "v2"], description: "v4 (por defecto, la más expresiva; si la cuenta no lo tiene, v3), v3 o v2." },
        texto: { type: "string", description: "Lo que dirá la muestra (opcional, hasta 500 caracteres). Sin él, la frase fija." },
        confirmado: { type: "boolean", description: "Sólo tras oír «sí» del usuario a la cifra exacta que le dijiste." },
      },
      required: ["voz"],
    },
  },
  {
    name: "generar_locucion",
    description:
      "Genera la LOCUCIÓN de un video animado: una sola toma con todo lo que dicen sus escenas, del guion APROBADO (si no está aprobado, no se " +
      "puede). Usa la voz de la marca si no se dice otra. SIEMPRE cuesta y SIEMPRE se confirma: la primera llamada devuelve la cifra y NO crea " +
      "nada; díselo al usuario y sólo si dice que sí vuelve a llamarla con los MISMOS datos y confirmado=true. Nunca pongas confirmado=true por " +
      "tu cuenta. No espera: queda en cola y el video pasa a «Con voz» cuando termina (estado_trabajo con el ID para saber cómo va).",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        video_id: { type: "string", description: "ID del proyecto de video animado." },
        voz: { type: "string", description: "ID de una voz de listar_voces. Si se omite, la de la marca." },
        modelo: { type: "string", enum: ["v4", "v3", "v2"], description: "Si se omite, el del kit (v4 por defecto)." },
        confirmado: { type: "boolean", description: "Sólo tras oír «sí» del usuario a la cifra exacta que le dijiste." },
      },
      required: ["video_id"],
    },
  },
  {
    name: "generar_musica",
    description:
      "Genera una MÚSICA de fondo con Suno (por Kie.ai) y la guarda en la galería del cliente (Suno entrega DOS versiones; las dos quedan en " +
      "musicas). Con video_id y SIN «estilo», la escribe el DIRECTOR MUSICAL de la aplicación: escucha el video ya hecho (escenas, cortes, " +
      "silencios, el llamado, la voz) y la música de la MARCA del kit, y elige género, BPM que casa con los cortes, instrumentos y cómo sube " +
      "la energía; la respuesta dice qué pidió y por qué (es lo recomendado: no escribas un estilo genérico). La duración es la del video y la " +
      "primera versión queda puesta en su sonido (va debajo de la voz con ducking y fundido; cambiarla no pide otra voz: sólo volver a " +
      "renderizar). Con «estilo», manda el tuyo: género, instrumentos, ánimo, tempo (en inglés suele salir mejor), sin nombrar artistas ni " +
      "canciones. Instrumental por defecto; con voz cantada, la letra va en «letra». SIEMPRE cuesta y SIEMPRE se confirma: la primera llamada " +
      "devuelve la cifra y lo que se pediría, y NO crea nada; díselo al usuario y sólo si dice que sí vuelve a llamarla con los MISMOS datos y " +
      "confirmado=true (sale lo mismo que le dijiste). Nunca pongas confirmado=true por tu cuenta. No espera: tarda unos minutos " +
      "(estado_trabajo con el ID para saber cómo va).",
    input_schema: {
      type: "object",
      properties: {
        ...clienteParam,
        estilo: { type: "string", description: "Qué música: género, instrumentos, ánimo, tempo (≤ 1000). Con video_id, mejor omitirlo: lo escribe el director musical." },
        instrumental: { type: "boolean", description: "Sin voz cantada (por defecto sí)." },
        letra: { type: "string", description: "La letra, sólo si instrumental=false (≤ 5000; con [Verse], [Chorus]…)." },
        duracion: { type: "integer", description: `Segundos (${DURACION_MUSICA.min}–${DURACION_MUSICA.max}). Con video_id, lo que dura el video.` },
        titulo: { type: "string", description: "Nombre de la música en la galería (≤ 80)." },
        evitar: { type: "string", description: "Estilos o instrumentos a evitar (opcional)." },
        modelo: { type: "string", enum: ["v6", "mini", "wild"], description: "v6 (por defecto), mini (rápida) o wild (más experimental)." },
        video_id: { type: "string", description: "ID de un proyecto de video animado (opcional): la música queda puesta en él." },
        confirmado: { type: "boolean", description: "Sólo tras oír «sí» del usuario a la cifra exacta que le dijiste." },
      },
    },
  },
  // El video animado: crear, ver, editar y aprobar el guion (worker/lib/estudio/herramientasVideo.js).
  ...DEFINICIONES_VIDEO,
]);

export const NOMBRES_ESTUDIO = new Set(DEFINICIONES_ESTUDIO.map((d) => d.name));

/**
 * La receta «Video del producto» (src/lib/videoProducto.js) dicha a la IA: la misma que sigue el botón de la pantalla, así
 * pedirla en el chat o por Claude da lo mismo. Salió de una prueba que funcionó: la caja y el logo salen perfectos porque
 * NO los dibuja el modelo de video.
 */
export const RECETA_VIDEO_PRODUCTO = [
  "RECETA «VIDEO DEL PRODUCTO» (10–15 s; síguela cuando pidan un video de un producto):",
  "1. Primer fotograma: crear_en_estudio de imagen, formato 9:16, con sin_logo=true: la escena donde empieza la acción.",
  "2. Cierre: imagen 9:16 con las fotos del producto en referencias: el producto IDÉNTICO al centro del tercio inferior y el logo (lo pone el kit) arriba.",
  "3. Video: tipo video con imagen_inicial (1) e imagen_final (2), minimax-h3-kie si está; el prompt describe el MOVIMIENTO por segundos " +
    "(no lo que ya se ve), corto, y la voz en off en español latino neutro escrita entre comillas palabra por palabra (2,5 palabras por segundo): " +
    "si no se escribe, el modelo se inventa una en otro idioma. Sin texto en pantalla.",
].join("\n");

/** El catálogo guardado (texto JSON de `mercado_clientes`), o vacío si no se lee. */
function catalogoDeLaFila(fila) {
  try {
    return productosActivos(JSON.parse(fila?.catalogo ?? "[]"));
  } catch {
    return [];
  }
}

/**
 * El catálogo y el logo con los IDs de la galería que sirven en crear_en_estudio. Pura.
 * Una foto sin ficha viva en la galería (en la papelera, o subida antes de que existiera) no tiene ID: se cuenta, no se ofrece.
 */
export function textoDelCatalogo(catalogo, kit, archivos) {
  const idDe = new Map(archivos.filter((f) => !f.borrado_at && String(f.mime).startsWith("image/")).map((f) => [f.clave, f.id]));
  const partes = [];
  if (catalogo.length) {
    const lineas = catalogo.map((p) => {
      const ids = p.fotos.map((k) => idDe.get(k)).filter(Boolean);
      const sinFicha = p.fotos.length - ids.length;
      const fotos = ids.length ? `fotos: ${ids.join(", ")}` : "sin fotos";
      return `· ${p.nombre}${p.marca ? ` (de la marca ${p.marca}: respeta su empaque y no le pongas el logo del cliente)` : ""}` +
        `${p.precio ? ` · ${p.precio}` : ""} · ${fotos}${sinFicha ? ` (${sinFicha} sin ficha en la galería: no se pueden usar desde aquí)` : ""}`;
    });
    partes.push(`CATÁLOGO (las fotos son el producto REAL: pon sus IDs en referencias o en imagen_inicial cuando la pieza lo enseñe):\n${lineas.join("\n")}`);
  }
  if (kit.logo) {
    const id = idDe.get(kit.logo);
    partes.push(
      `LOGO DEL KIT: ${id ?? "está en el kit pero no tiene ficha en la galería"}. En una imagen el kit ya lo pone solo. A un modelo de VIDEO no se le ` +
      "manda (lo deforma): si el video tiene que cerrar con el logo, crea primero la imagen del cierre (sale con el logo) y úsala de imagen_final.",
    );
  }
  if (catalogo.some((p) => p.fotos.some((k) => idDe.has(k)))) partes.push(RECETA_VIDEO_PRODUCTO);
  return partes.join("\n\n");
}

/**
 * Lo que devuelve la voz al asistente: la confirmación NO es un fallo (es la respuesta correcta a un pedido que cuesta),
 * así que vuelve como texto con la cifra y la orden de preguntar; lo demás, como error que el modelo pueda leer.
 */
const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** Lo que se sabe de una pieza de la galería, en una línea: así el modelo la juzga sabiendo qué se pidió. */
export function lineaDePieza(f, n) {
  const control = leerJSON(f.ajustes, {})?.control;
  const usos = leerJSON(f.usado_en, []);
  const pedido = String(f.prompt ?? "").replace(/\s+/g, " ").trim();
  const partes = [
    `${n}. ${f.id} · ${f.tipo}${f.ancho && f.alto ? ` ${f.ancho}×${f.alto}` : ""} · ${f.modelo ? nombreDelModelo(f.modelo) : f.origen}`,
    control
      ? `control: ${control.estado === "ok" ? "bien" : "revisar"}${control.errores?.length ? ` (${control.errores.length} error${control.errores.length > 1 ? "es" : ""} de texto)` : ""}${control.puntajeDiseno ? `, diseño ${control.puntajeDiseno}/10` : ""}`
      : "sin control de calidad",
    control?.aspecto?.length ? `acabado: ${control.aspecto.map((x) => x.defecto).join("; ")}` : "",
    Array.isArray(usos) && usos.length ? (usos.length > 1 ? `la usan ${usos.length} publicaciones` : "la usa una publicación") : "",
    pedido ? `pedido: «${pedido.slice(0, 280)}${pedido.length > 280 ? "…" : ""}»` : "",
  ];
  return `· ${partes.filter(Boolean).join(" · ")}`;
}

/**
 * Qué música se pide y por qué, para el modelo: el estilo que va a Suno, lo que se evita y, si lo escribió el director
 * musical, su porqué (o que fue el respaldo). Pura.
 */
function lineasDelPedido(pedido, propuesta, aviso) {
  if (!pedido) return [];
  const de = propuesta ? (propuesta.deRespaldo ? "Sin el director musical (respaldo)" : "El director musical escuchó el video y pide") : "Se pide";
  return [
    `${de}: «${pedido.estilo}»${pedido.evitar ? ` · evitar: ${pedido.evitar}` : ""}.`,
    propuesta?.porque ? `Por qué: ${propuesta.porque}` : "",
    aviso ? `Aviso: ${aviso}` : "",
  ].filter(Boolean);
}

function confirmacionDeVoz(e) {
  if (!(e instanceof ErrorVoz)) throw e;
  if (e.codigo === "confirmar") {
    return (`NO SE CREÓ NADA. ${e.message.replace(/ Confírmalo para generarla\.$/, "")}. ` +
      "Díselo al usuario con esa cifra y pregúntale si lo hago. Sólo si responde que sí, vuelve a llamar con los MISMOS datos y confirmado=true.");
  }
  throw new ErrorHerramientaEstudio(e.message);
}

/**
 * @param resolverCliente  async (nombre?) → fila de `clients`; la misma que usan las demás herramientas
 * @param usuario          quien firma lo que se pida (el id queda en `creado_por`)
 * @param por              la firma para avisar al espacio en vivo
 * @param origen           "asistente" | "claude": queda en el trabajo, para saber quién lo pidió
 */
export function crearHerramientasEstudio({ env, acceso, resolverCliente, usuario, por, origen }) {
  const activos = () => Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, v.activo]));

  /** Un ID de la galería → su clave de R2. Falla con un mensaje que el modelo pueda usar. */
  async function claveDeGaleria(clienteId, id, para) {
    const f = await acceso.leerUno("estudio_archivos", { id: String(id ?? ""), client_id: clienteId });
    if (!f || f.borrado_at) throw new ErrorHerramientaEstudio(`No encontré la imagen «${id}» en la galería (${para}). Los IDs salen de ver_estudio.`);
    if (!String(f.mime).startsWith("image/")) throw new ErrorHerramientaEstudio(`«${id}» no es una imagen (${f.mime}); ${para} tiene que ser una imagen.`);
    return f.clave;
  }

  /**
   * Las referencias (claves, en orden) con el producto del catálogo de cada una, si es una foto suya: así su línea dice
   * que es el producto REAL. Una consulta; si el catálogo no se lee, van sin nombre (como antes).
   */
  async function refsDelCatalogo(clienteId, claves) {
    const fila = await acceso.leerUno("mercado_clientes", { client_id: clienteId }).catch(() => null);
    const catalogo = catalogoDeLaFila(fila);
    return claves.map((clave) => {
      const p = catalogo.find((x) => x.fotos.includes(clave));
      return p ? { clave, producto: { nombre: p.nombre, ...(p.marca ? { marca: p.marca } : {}) } } : { clave };
    });
  }

  /** La identidad visual del cliente que el cerebro puede dar a un prompt de imagen: nunca notas internas. */
  async function guiaVisual(clienteId) {
    const hits = await buscarCerebro(env, acceso, clienteId, CONSULTA_VISUAL, { para: "imagen", n: 3, per: 1 });
    const bloques = hits
      // Doble candado: `para: "imagen"` ya las deja fuera, y si un día se rompe, esto lo sigue impidiendo.
      .filter((h) => !h.interna)
      .map((h) => ({ head: `· ${h.titulo}`, body: h.pasajes.join(" … ") }));
    return bloques.length ? pack(bloques, MAX_GUIA) : "";
  }

  /**
   * `crear_en_estudio` de una IMAGEN: un encargo del servidor de `n` piezas (encargos.js), como `disenar_piezas`. Si llega
   * una ficha de diseño, va tal cual; si no, la diseña el DIRECTOR de la agencia (con el kit, el catálogo y el cerebro).
   * Luego, en el servidor: el trabajo, la proporción, el control con UNA corrección y el logo estampado si el kit lo pide.
   * El costo se confirma ANTES (el mismo «NO SE CREÓ NADA» de siempre) y el presupuesto se mira antes de crear.
   */
  async function imagenPorEncargo({ c, modelo, n, ajustes, medios, idea, prompt, armar, acortada, estampar, estilo, confirmado }) {
    if (!idea.trim()) throw new ErrorHerramientaEstudio("Escribe qué quieres crear.");
    if (!(modelo.motor === "prueba" || activos()[modelo.motor])) {
      throw new ErrorHerramientaEstudio(`${modelo.nombre} no tiene su llave en este servidor: usa ver_estudio para ver los que sí.`);
    }
    const v = validarPedido({ modelo: modelo.id, prompt, n: 1, ajustes, medios });
    if (!v.ok) throw new ErrorHerramientaEstudio(v.error);
    const costo = Math.round(v.pedido.costoEstimado * n * 1000) / 1000;
    if (pideConfirmar(costo) && !confirmado) {
      return `NO SE CREÓ NADA. Este pedido cuesta ${textoCosto(costo)} (${modelo.nombre}, ${n} imagen${n > 1 ? "es" : ""}). ` +
        "Díselo al usuario con esa cifra y pregúntale si lo hago. Sólo si responde que sí, vuelve a llamar con los MISMOS datos y confirmado=true.";
    }
    const bloqueo = costo > 0 ? await bloqueoPorPresupuesto(acceso) : null;
    if (bloqueo) throw new ErrorHerramientaEstudio(bloqueo);
    const ficha = esFicha(idea);
    const proporcion = v.pedido.ajustes.aspectRatio ?? "";
    const tipoPieza = TIPOS_PRESET[String(estilo).split("-")[0]]?.nombre ?? "";
    const encargo = ficha ? null : {
      formato: proporcion === "9:16" ? "historia" : proporcion === "16:9" ? "anuncio" : "post", proporcion, tipo: tipoPieza,
      idea: idea.slice(0, 900), escena: "", texto: "", sinTexto: false, producto: "", indicacion: "",
    };
    const pasos = Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`, titulo: n > 1 ? `Imagen ${i + 1}` : "Imagen",
      pedido: { modelo: modelo.id, prompt: armar(ESCENA), n: 1, ajustes: v.pedido.ajustes, medios },
      // Con ficha, la escena va lista (el servidor la acorta si no cabe, nunca por el final); sin ella, el director.
      escena: ficha ? idea : "", sinMejorar: ficha ? "" : idea,
      encargo, mejora: encargo ? { ...encargo, idea, tipo: "imagen", pieza: tipoPieza } : null,
      texto: ficha ? textoDeLaFicha(idea) : "", controlar: true,
      navegador: estampar ? { plantilla: null, logo: true } : null,
    }));
    // Aparte (import en el momento): encargos.js lee fichas.js → mercado.js → herramientasServidor.js, que vuelve aquí.
    const [{ crearEncargo }, { vistaDeEncargo }] = await Promise.all([import("./encargos.js"), import("./vistaEstudio.js")]);
    let fila;
    try {
      fila = await crearEncargo(env, acceso, c, {
        tipo: "lote", titulo: `${origen === "claude" ? "Claude" : "Asistente"} · ${n} imagen${n > 1 ? "es" : ""}`, mejorar: !ficha, controlar: true,
        paralelo: Math.min(2, n), pasos, origen,
      }, { usuario });
    } catch (e) {
      if (e instanceof ErrorEstudio) throw new ErrorHerramientaEstudio(e.message);
      throw e;
    }
    const texto = [
      acortada ? `Ojo: con la marca y el logo del kit tu ficha no cabía en ${MAX_PROMPT} caracteres; se acortará quitando primero «Marca», «Evitar» y «Fondo» (el texto exacto va entero). Para la próxima, cada línea más corta.` : "",
      `Pedido creado: ${fila.id} (${modelo.nombre}, ${n} imagen${n > 1 ? "es" : ""}, costo ${textoCosto(costo)}${modelo.estimado ? ", aprox." : ""}).`,
      ficha ? "Va con tu ficha tal cual." : "La diseña primero el director de arte de la agencia (con el kit, el catálogo y el cerebro del cliente).",
      `Se hace en el servidor, como el lote: la proporción, el control de calidad (corrige sola una letra mal escrita y se queda con la mejor)${estampar ? " y el logo estampado" : ""}. Tarda de uno a pocos minutos; no hace falta esperar aquí.`,
      `Va a la galería de ${c.name} (pestaña Crear). Para saber cómo va: estado_trabajo con el ID ${fila.id}.`,
    ].filter(Boolean).join("\n");
    return { texto, imagenes: [], vista: (await vistaDeEncargo(env, acceso, fila)).vista };
  }

  /**
   * La vista de un pedido recién creado (la muestra de una voz, la locución, la música): en marcha, con su hueco, y la
   * vista previa del chat de Claude se pone al día sola hasta que suena. Null si el pedido no se encuentra.
   */
  async function vistaDelPedido(id, titulo = "") {
    const fila = await acceso.leerUno("estudio_trabajos", { id: String(id ?? "") }).catch(() => null);
    return fila ? (await vistaDeTrabajo(env, acceso, fila, { titulo })).vista : null;
  }

  /** estado_trabajo de un ENCARGO (lo que crea crear_en_estudio de una imagen): cada pieza y, de las listas, las imágenes. */
  async function estadoDeEncargo(fila) {
    const { vistaDeEncargo } = await import("./vistaEstudio.js");
    const { e, imagenes, vista } = await vistaDeEncargo(env, acceso, fila);
    const FASE = { nuevo: "esperando", generando: "creándose", opciones: "revisándose", hecho: "lista", fallido: "no salió" };
    const lineas = e.pasos.map((p, i) => {
      const finales = p.fase === "hecho" ? (p.finales?.length ? p.finales : p.opciones.map((o) => o.id)) : [];
      const control = p.opciones?.[0]?.control;
      const nota = control ? ` · control: ${control.estado === "ok" ? "bien" : "revisar"}${control.puntajeDiseno ? `, diseño ${control.puntajeDiseno}/10` : ""}${p.opciones?.[0]?.corregida ? " (corregida)" : ""}` : "";
      return `${i + 1}. ${p.titulo || p.id} — ${FASE[p.fase] ?? p.fase}${finales.length ? ` · archivo ${finales.join(", ")}` : ""}${nota}${p.error ? ` · ${p.error}` : ""}`;
    });
    const vivo = e.estado === "en_marcha";
    const texto = [
      `Pedido ${e.id}: ${vivo ? "en marcha" : e.estado === "hecho" ? "terminado" : e.estado}. ${e.nota ?? ""}`.trim(),
      e.error ? `Motivo: ${e.error}` : "",
      ...lineas,
      imagenes.length ? `Van ${imagenes.length === 1 ? "la imagen lista" : `las ${imagenes.length} imágenes listas`}, en el orden de arriba: míralas.` : "",
      vivo ? "Sigue en marcha: se hace solo." : "",
    ].filter(Boolean).join("\n");
    return { texto, imagenes, vista };
  }

  const acciones = {
    async ver_estudio({ cliente }) {
      const c = await resolverCliente(cliente);
      const motores = activos();
      const hay = MODELOS.filter((m) => motores[m.motor] && m.motor !== "prueba");
      const usables = hay.length ? hay : MODELOS.filter((m) => m.motor === "prueba");
      const porTipo = (tipo) => usables.filter((m) => m.tipo === tipo);
      const porDefecto = { imagen: modeloPorDefecto(motores, "imagen"), video: modeloPorDefecto(motores, "video") };
      const linea = (m) => {
        const valores = Object.entries(m.ajustes ?? {}).map(([k, d]) => `${k}: ${d.valores.join("/")}`).join("; ");
        const apoyo = [m.inicial ? "imagen inicial" : "", m.final ? "imagen final" : "", m.referencias ? `hasta ${m.referencias} referencias` : ""].filter(Boolean).join(", ");
        return `· ${m.id} — ${m.nombre} · ${textoCosto(m.costo)}${m.por === "s" ? " por segundo" : " por imagen"}${m.estimado ? " (aprox.)" : ""}` +
          `${porDefecto[m.tipo]?.id === m.id ? " · PREDETERMINADO" : ""}${valores ? ` · ${valores}` : ""}${apoyo ? ` · admite ${apoyo}` : ""}`;
      };

      const [filas, trabajos, guia, mercado, encargos] = await Promise.all([
        acceso.leer("estudio_archivos", { client_id: c.id }, "created_at desc"),
        acceso.leer("estudio_trabajos", { client_id: c.id }, "created_at desc", 20),
        guiaVisual(c.id),
        acceso.leerUno("mercado_clientes", { client_id: c.id }).catch(() => null),
        // Lo que lleva el servidor (las imágenes de crear_en_estudio, el lote, los carruseles): también está en marcha.
        acceso.leer("estudio_encargos", { client_id: c.id, estado: "en_marcha" }, "created_at desc", 10).catch(() => []),
      ]);
      const galeria = filas.filter((f) => !f.borrado_at).slice(0, GALERIA_A_MOSTRAR);
      // Los VIDEOS aparte (los que grabó el cliente, los de Kie, los de Drive): un clip de hace semanas no sale entre lo
      // último, y es lo que necesita una capa «video» del video animado.
      const videos = filas.filter((f) => !f.borrado_at && f.tipo === "video" && !galeria.includes(f)).slice(0, VIDEOS_A_MOSTRAR);
      const vivos = trabajos.filter((t) => estaVivo(t.estado));
      const deEncargo = (f) => { try { const p = JSON.parse(f.pasos)[0]; return String(p?.escena || p?.sinMejorar || p?.titulo || f.titulo || "").slice(0, 70); } catch { return f.titulo; } };
      const catalogo = textoDelCatalogo(catalogoDeLaFila(mercado), kitDe(c), filas);

      return [
        `Estudio de ${c.name}.`,
        hay.length ? "" : "AVISO: este servidor sólo tiene el motor de prueba (tarjetas, no imágenes reales): falta la llave de un proveedor.",
        `IMÁGENES:\n${porTipo("imagen").map(linea).join("\n") || "(ninguno)"}`,
        `VIDEO:\n${porTipo("video").map(linea).join("\n") || "(ninguno)"}`,
        kitVacio(kitDe(c))
          ? "KIT DE MARCA: no está preparado (se prepara en la pestaña Marca → Kit y voz). Sin él, pon la guía visual en el prompt."
          : `KIT DE MARCA: preparado${kitDe(c).logo ? ", con logo" : ""}. La paleta, el estilo y el logo los pone el kit en cada pieza. Usa estilo=<tipo de contenido> en crear_en_estudio (${Object.keys(TIPOS_PRESET).join("|")}) y escribe en el prompt sólo la escena.`,
        guia
          ? `GUÍA VISUAL DE LA MARCA (del cerebro; ponla en el prompt, con tus palabras):\n${guia}`
          : `GUÍA VISUAL: el cerebro de ${c.name} no tiene notas de identidad visual. Pregunta al usuario por colores, estilo y qué evitar, o pídele que las añada en Marca → Cerebro.`,
        catalogo,
        galeria.length
          ? `GALERÍA (lo último; el ID sirve de imagen_inicial o referencia):\n${galeria.map((f) => `· ${f.id} · ${f.tipo} · ${f.modelo || "subida"} · «${String(f.prompt).slice(0, 90)}»`).join("\n")}`
          : "GALERÍA: todavía no hay nada.",
        videos.length
          ? `MÁS VIDEOS DE LA GALERÍA (para una capa «video» de un video animado, o de referencia):\n${videos.map((f) => `· ${f.id} · ${f.modelo || "subido"}${f.ancho && f.alto ? ` · ${f.ancho}×${f.alto}` : ""} · «${String(f.prompt || "").slice(0, 70)}»`).join("\n")}`
          : "",
        vivos.length || encargos.length
          ? `EN MARCHA:\n${[...vivos.map((t) => `· ${t.id} · ${t.tipo} · ${NOMBRE_ESTADO[t.estado]} · «${String(t.prompt).slice(0, 70)}»`), ...encargos.map((f) => `· ${f.id} · encargo · ${f.nota || "en marcha"} · «${deEncargo(f)}»`)].join("\n")}`
          : "",
      ].filter(Boolean).join("\n\n");
    },

    async crear_en_estudio(entrada) {
      const c = await resolverCliente(entrada.cliente);
      const tipo = entrada.tipo === "video" ? "video" : "imagen";
      const motores = activos();
      // Una IMAGEN sale con el modelo del CLIENTE (el fijado en su kit) salvo que se pida otro, y si ése no hace el formato
      // pedido con sus referencias, con el que lo releva (como la pantalla y el lote). Un video, como siempre.
      let modelo = entrada.modelo ? modeloPorId(entrada.modelo) : tipo === "imagen" ? modeloFijado(motores, kitDe(c)) : modeloPorDefecto(motores, tipo);
      if (!entrada.modelo && modelo && tipo === "imagen" && entrada.formato) {
        modelo = modeloQueRespeta(modelo, motores, String(entrada.formato), (entrada.referencias?.length ?? 0) + (kitDe(c).logo ? 1 : 0));
      }
      if (!modelo) throw new ErrorHerramientaEstudio(`No existe el modelo «${entrada.modelo}». Usa ver_estudio para ver cuáles hay.`);
      if (modelo.tipo !== tipo) throw new ErrorHerramientaEstudio(`${modelo.nombre} es un modelo de ${modelo.tipo}, no de ${tipo}.`);

      const n = Number(entrada.cantidad ?? 1);
      const tope = tipo === "video" ? LIMITES.videos : LIMITES.imagenes;
      if (!(Number.isInteger(n) && n >= 1 && n <= tope)) throw new ErrorHerramientaEstudio(`Puedes pedir de 1 a ${tope} ${tipo === "video" ? "videos" : "imágenes"} por vez desde aquí.`);

      // Lo que el modelo no admite se dice; no se cambia en silencio por otro valor.
      const ajustes = {};
      for (const [pedido, campo, valor] of [["formato", "aspectRatio", entrada.formato], ["duracion", "duration", entrada.duracion === undefined ? undefined : String(entrada.duracion)]]) {
        if (valor === undefined || valor === null || valor === "") continue;
        const def = modelo.ajustes?.[campo];
        if (!def?.valores.includes(valor)) {
          throw new ErrorHerramientaEstudio(`${modelo.nombre} no admite ${pedido} «${valor}»${def ? `; admite: ${def.valores.join(", ")}` : " (no lo tiene)"}.`);
        }
        ajustes[campo] = valor;
      }
      const segundos = Number(ajustes.duration ?? modelo.ajustes?.duration?.defecto ?? 0);
      if (tipo === "video" && segundos > LIMITES.segundos) throw new ErrorHerramientaEstudio(`Desde aquí un video dura como mucho ${LIMITES.segundos} s.`);

      const medios = {};
      if (entrada.imagen_inicial) medios.start = [await claveDeGaleria(c.id, entrada.imagen_inicial, "imagen_inicial")];
      if (entrada.imagen_final) medios.end = [await claveDeGaleria(c.id, entrada.imagen_final, "imagen_final")];
      if (Array.isArray(entrada.referencias) && entrada.referencias.length) {
        if (entrada.referencias.length > 8) throw new ErrorHerramientaEstudio("Demasiadas referencias.");
        medios.reference = await Promise.all(entrada.referencias.map((id) => claveDeGaleria(c.id, id, "referencia")));
      }

      // Como en la pantalla: el preset de su tipo (si se pide), la identidad de la marca SIEMPRE que haya kit y, en
      // imágenes, el logo de referencia.
      if (entrada.estilo && !IDS_PRESET.includes(entrada.estilo)) throw new ErrorHerramientaEstudio(`El estilo tiene que ser uno de: ${IDS_PRESET.join(", ")}.`);
      const kit = kitDe(c);
      // Un logo cuyo archivo ya no está (lo borró una papelera de antes) no se pide: tumbaría la pieza entera.
      if (kit.logo && !(await env.MEDIA.head(kit.logo).catch(() => true))) kit.logo = "";
      const conLogo = entrada.sin_logo !== true && !kitVacio(kit) && ponerLogo({ kit, tipo, modelo, referencias: medios.reference ?? [] });
      if (conLogo) medios.reference = [...(medios.reference ?? []), kit.logo];
      // Las fotos del catálogo entre las referencias son el producto REAL: se dice así, como en la pantalla (si no, el
      // motor las toma por una imagen de estilo, copia su ángulo y se inventa el empaque).
      const referencias = tipo === "imagen" && entrada.referencias?.length
        ? lineasDeReferencias(await refsDelCatalogo(c.id, medios.reference.slice(0, entrada.referencias.length)), { cliente: c.name })
        : "";
      const armar = (idea) => pedidoConMarca({
        kit, idea, preset: entrada.estilo ?? "", marca: c.name, rubro: c.industry ?? "",
        video: tipo === "video", logo: conLogo, usarKit: !kitVacio(kit), referencias,
      });
      let prompt = armar(entrada.prompt);
      // Con la marca, el acabado y el logo detrás, una ficha completa puede no caber: se acorta la ficha (lo prescindible
      // primero; el texto exacto se queda) en vez de rechazar el pedido, y se dice.
      let acortada = false;
      const idea = String(entrada.prompt ?? "");
      if (prompt.length > MAX_PROMPT && idea.length > 200) {
        prompt = armar(ajustarFicha(idea, Math.max(200, idea.length - (prompt.length - MAX_PROMPT))));
        acortada = true;
      }

      // Una IMAGEN, con las mismas reglas que el lote: un ENCARGO del servidor (el director si no llega una ficha, la
      // proporción, el control con su corrección y el logo estampado si el kit lo pide).
      if (tipo === "imagen") {
        return imagenPorEncargo({ c, modelo, n, ajustes, medios, idea, prompt, armar, acortada, estampar: entrada.sin_logo !== true && kit.logoModo === "estampado" && Boolean(kit.logo), estilo: entrada.estilo ?? "", confirmado: entrada.confirmado === true });
      }

      let fila;
      try {
        fila = await crearTrabajo(env, acceso, c, {
          modelo: modelo.id, prompt, n, ajustes, medios, confirmado: entrada.confirmado === true,
        }, { usuario, origen, por });
      } catch (e) {
        if (!(e instanceof ErrorEstudio)) throw e;
        // La confirmación no es un error: es la respuesta correcta a un pedido caro.
        if (e.codigo === "confirmar") {
          return `NO SE CREÓ NADA. Este pedido cuesta ${textoCosto(e.costo)} (${modelo.nombre}, ${n} ${tipo === "video" ? `video${n > 1 ? "s" : ""} de ${segundos} s` : `imagen${n > 1 ? "es" : ""}`}). ` +
            "Díselo al usuario con esa cifra y pregúntale si lo hago. Sólo si responde que sí, vuelve a llamar con los MISMOS datos y confirmado=true.";
        }
        throw new ErrorHerramientaEstudio(e.message);
      }

      const t = trabajoPublico(fila);
      const texto = [
        acortada ? `Ojo: con la marca y el logo del kit tu ficha no cabía en ${MAX_PROMPT} caracteres; se acortó quitando primero «Marca», «Evitar» y «Fondo» (el texto exacto va entero). Para la próxima, cada línea más corta.` : "",
        `Pedido creado: ${t.id} (${modelo.nombre}, ${n} ${tipo === "video" ? `video${n > 1 ? "s" : ""}` : `imagen${n > 1 ? "es" : ""}`}, costo ${textoCosto(t.costoEstimado)}${modelo.estimado ? ", aprox." : ""}).`,
        tipo === "video"
          ? "Un video tarda de 1 a 10 minutos. Sigue solo: no hace falta esperar aquí."
          : "Las imágenes tardan unos segundos a un par de minutos. Siguen solas: no hace falta esperar aquí.",
        `Va a la galería de ${c.name} (pestaña Crear). Para saber cómo va: estado_trabajo con el ID ${t.id}.`,
      ].filter(Boolean).join("\n");
      // La vista previa del chat de Claude (MCP Apps) lo enseña según sale; el asistente de la aplicación sólo lee el texto.
      const { vista } = await vistaDeTrabajo(env, acceso, fila, { titulo: tipo === "video" ? "Video" : "Imagen" });
      return { texto, imagenes: [], vista };
    },

    async estado_trabajo({ trabajo_id: id }) {
      const fila = await acceso.leerUno("estudio_trabajos", { id: String(id ?? "") });
      if (!fila) {
        // Una imagen de crear_en_estudio es un ENCARGO (con su control): su ID también vale aquí.
        const encargo = await acceso.leerUno("estudio_encargos", { id: String(id ?? "") });
        if (encargo) return estadoDeEncargo(encargo);
        throw new ErrorHerramientaEstudio(`No encontré el pedido «${id}».`);
      }
      const t = trabajoPublico(fila);
      const fichas = t.archivos.length
        ? (await Promise.all(t.archivos.map((a) => acceso.leerUno("estudio_archivos", { id: String(a), client_id: fila.client_id })))).filter(Boolean)
        : [];
      const texto = [
        `Pedido ${t.id}: ${NOMBRE_ESTADO[t.estado] ?? t.estado} — ${nombreDelModelo(t.modelo)}, ${t.n} ${t.tipo === "video" ? "video" : "imagen"}${t.n > 1 ? "s" : ""}.`,
        t.error ? `Motivo: ${t.error}` : "",
        t.nota ? `Nota: ${t.nota}` : "",
        `Llevan ${t.archivos.length} de ${t.n}.`,
        t.costo > 0 ? `Costo real hasta ahora: ${textoCosto(t.costo)}.` : "",
        fichas.length ? `Archivos:\n${fichas.map((f) => `· ${f.id} · ${f.tipo} · /api/media/${f.clave}`).join("\n")}` : "",
        estaVivo(t.estado) ? "Sigue en marcha: se hace solo." : "",
      ].filter(Boolean).join("\n");
      // Terminado: las imágenes van para que el modelo las MIRE (lo que se pide en curso no se enseña a medias). Son las
      // mismas que enseña la vista previa del chat. Un audio o un video va con su reproductor en la vista y, en el texto,
      // su dirección firmada (para dársela a la persona).
      const { imagenes, vista } = await vistaDeTrabajo(env, acceso, fila);
      const conMedios = [texto, lineasDeMedios(vista)].filter(Boolean).join("\n");
      const conImagen = estaVivo(t.estado) ? [] : fichas.filter((f) => String(f.mime ?? "").startsWith("image/"));
      if (!conImagen.length) return { texto: conMedios, imagenes: [], vista };
      if (!imagenes.length) return { texto: `${conMedios}\n(No pude enseñarte las imágenes ahora; están en la galería.)`, imagenes: [], vista };
      return { texto: `${conMedios}\nVan ${imagenes.length === 1 ? "la imagen" : `las ${imagenes.length} imágenes`} (copia reducida), en el orden de arriba: míralas.`, imagenes, vista };
    },

    async ver_pieza({ cliente, archivo_ids: ids = [] }) {
      const c = await resolverCliente(cliente);
      const lista = [...new Set((Array.isArray(ids) ? ids : [ids]).map((x) => String(x ?? "").trim()).filter(Boolean))];
      if (!lista.length) throw new ErrorHerramientaEstudio("Dime los IDs de la galería que quieres ver (de ver_estudio o estado_trabajo).");
      if (lista.length > MAX_PIEZAS_VISTAS) throw new ErrorHerramientaEstudio(`Como mucho ${MAX_PIEZAS_VISTAS} piezas a la vez.`);
      const fichas = [];
      const lineas = [];
      for (const id of lista) {
        const f = await acceso.leerUno("estudio_archivos", { id, client_id: c.id });
        if (!f || f.borrado_at) { lineas.push(`· ${id}: no está en la galería de ${c.name}.`); continue; }
        fichas.push(f);
        lineas.push(lineaDePieza(f, fichas.length));
      }
      if (!fichas.length) throw new ErrorHerramientaEstudio(`Ninguna de esas piezas está en la galería de ${c.name}.`);
      const vistas = await miniaturasDe(env, fichas);
      const imagenes = [];
      const sinVer = [];
      const piezas = [];
      fichas.forEach((f, i) => {
        if (vistas[i]) imagenes.push(vistas[i]); else sinVer.push(f.id);
        const control = leerJSON(f.ajustes, {})?.control ?? null;
        piezas.push(piezaDe({ id: f.id, titulo: `Pieza ${i + 1}`, imagen: vistas[i] ? imagenes.length - 1 : null, control, gusta: Boolean(f.favorito), sinImagen: !vistas[i] }));
      });
      const texto = [
        `${fichas.length === 1 ? "La pieza" : `Las ${fichas.length} piezas`} de ${c.name}, en este orden:`,
        ...lineas,
        sinVer.length ? `Sin imagen que enseñar (video, o no se pudo reducir): ${sinVer.join(", ")}.` : "",
      ].filter(Boolean).join("\n");
      const vista = vistaDe({ tipo: "piezas", titulo: fichas.length === 1 ? "La pieza" : `${fichas.length} piezas`, cliente: { id: c.id, nombre: c.name }, piezas });
      return imagenes.length ? { texto, imagenes, vista } : texto;
    },

    async listar_voces({ cliente }) {
      const c = await resolverCliente(cliente);
      const l = await listarVoces(env, c);
      const precios = l.modelos.map((m) => `${m.nombre} (muestra ${textoCosto(m.muestra)})`).join(" · ");
      const lineas = l.voces.map((v) => {
        const oidas = Object.entries(v.muestras).filter(([, si]) => si).map(([k]) => k);
        return `· ${v.id} — ${v.nombre}${v.genero ? ` · ${v.genero}` : ""}${v.espanol ? " · NATIVA EN ESPAÑOL" : ""}${v.nota ? ` · ${v.nota}` : ""}${v.propia ? " · propia" : ""}` +
          `${v.escogida ? " · LA DE LA MARCA" : ""}${oidas.length ? ` · muestra hecha (${oidas.join(", ")}): oírla es gratis` : ""}`;
      });
      return [
        `Voces para la locución de ${c.name} (salen por ${l.viaNombre ?? "Kie.ai"}). Modelos: ${precios}.`,
        l.espanol ? `${l.espanol} nativas en español (van primero).` : "Ninguna es nativa en español: hablan español con el acento de su idioma. Se añaden desde «Probar una voz» → «Buscar voces en español» (biblioteca de ElevenLabs, gratis).",
        l.voz ? `La de la marca: ${l.voces.find((v) => v.escogida)?.nombre ?? l.voz} con ${MODELOS_VOZ[l.modelo]?.nombre ?? l.modelo}.` : "La marca todavía no tiene voz escogida (se escoge en el kit de marca).",
        lineas.join("\n"),
      ].join("\n\n");
    },

    async previsualizar_voz({ cliente, voz, modelo, texto, confirmado }) {
      const c = await resolverCliente(cliente);
      try {
        const r = await pedirMuestra(env, acceso, c, {
          modelo: modelo ?? "v4", vozId: voz, texto: typeof texto === "string" ? texto : "", confirmado: confirmado === true, usuario, origen,
        });
        const oir = `/api/videos/${c.id}/voces/muestra?modelo=${r.modelo}&voz=${encodeURIComponent(r.voz.id)}${r.huella ? `&huella=${r.huella}` : ""}`;
        const cliente = { id: c.id, nombre: c.name };
        // La vista previa del chat de Claude la reproduce ahí mismo (ya hecha) o se pone al día sola hasta que lo esté.
        if (r.lista) {
          const audio = await audioDeMuestra(env, { modelo: r.modelo, vozId: r.voz.id, huella: r.huella, nombre: r.voz.nombre });
          const vista = vistaDe({ tipo: "medios", titulo: audio.titulo, subtitulo: "Ya estaba hecha: no costó nada.", cliente, audios: [audio] });
          return { texto: [`La muestra de ${r.voz.nombre} (${r.modelo}) ya está hecha: se oye en ${oir}. No costó nada.`, lineasDeMedios(vista)].filter(Boolean).join("\n"), imagenes: [], vista };
        }
        const pedido = `Pedido creado: ${r.trabajoId} (muestra de ${r.voz.nombre}, ${r.modelo}, ${textoCosto(r.costo)}). Tarda menos de un minuto; ` +
          `después se oye en ${oir} y en la pestaña del video. Para saber cómo va: estado_trabajo con el ID ${r.trabajoId}.`;
        return { texto: pedido, imagenes: [], vista: await vistaDelPedido(r.trabajoId) };
      } catch (e) {
        return confirmacionDeVoz(e);
      }
    },

    async generar_locucion({ cliente, video_id: id, voz, modelo, confirmado }) {
      const c = await resolverCliente(cliente);
      const video = await acceso.leerUno("videos_proyectos", { id: String(id ?? ""), client_id: c.id });
      if (!video) throw new ErrorHerramientaEstudio(`No encontré el video «${id}» de ${c.name}.`);
      try {
        const r = await pedirLocucion(env, acceso, c, video, { modelo, vozId: voz, confirmado: confirmado === true, usuario, origen, por });
        const texto = [
          `Pedido creado: ${r.trabajoId} (locución de «${video.titulo || "el video"}», voz ${r.voz.nombre}, ${r.modelo}, ${r.caracteres} caracteres, ${textoCosto(r.costo)}).`,
          "Tarda uno o dos minutos y sigue solo. Al terminar, el video pasa a «Con voz» con los tiempos de cada palabra.",
          `Para saber cómo va: estado_trabajo con el ID ${r.trabajoId}.`,
        ].join("\n");
        return { texto, imagenes: [], vista: await vistaDelPedido(r.trabajoId, `Locución de «${video.titulo || "el video"}»`) };
      } catch (e) {
        return confirmacionDeVoz(e);
      }
    },
    async generar_musica({ cliente, estilo, instrumental, letra, duracion, titulo, evitar, modelo, video_id: id, confirmado }) {
      const c = await resolverCliente(cliente);
      let video = null;
      if (id) {
        video = await acceso.leerUno("videos_proyectos", { id: String(id), client_id: c.id });
        if (!video) throw new ErrorHerramientaEstudio(`No encontré el video «${id}» de ${c.name}.`);
      }
      try {
        const r = await pedirMusica(env, acceso, c, {
          estilo, instrumental: typeof instrumental === "boolean" ? instrumental : undefined, letra, duracion, titulo, evitar, modelo,
          video, confirmado: confirmado === true, usuario, origen,
        });
        const texto = [
          `Pedido creado: ${r.trabajoId} (música «${r.pedido.titulo}», ${r.pedido.duracion} s, ${r.pedido.instrumental ? "instrumental" : "con voz"}, ${textoCosto(r.costo)} aprox.).`,
          ...lineasDelPedido(r.pedido, r.propuesta, r.aviso),
          `Tarda unos minutos y sigue solo. Las versiones quedan en la galería (musicas)${video ? " y la primera, puesta en el video: para oírla, renderizar_video otra vez" : ""}.`,
          `Para saber cómo va: estado_trabajo con el ID ${r.trabajoId}.`,
        ].join("\n");
        return { texto, imagenes: [], vista: await vistaDelPedido(r.trabajoId) };
      } catch (e) {
        if (e instanceof ErrorMusica) {
          if (e.codigo === "confirmar") {
            return [
              `NO SE CREÓ NADA. ${e.message.replace(/ Confírmalo para generarla\.$/, "")}.`,
              ...lineasDelPedido(e.pedido, e.propuesta, e.aviso),
              "Díselo al usuario con esa cifra (y qué música es) y pregúntale si lo hago. Sólo si responde que sí, vuelve a llamar con los MISMOS datos y confirmado=true: se pide exactamente esto.",
            ].join("\n");
          }
          throw new ErrorHerramientaEstudio(e.message);
        }
        throw e;
      }
    },
    ...crearHerramientasVideo({ env, acceso, resolverCliente, usuario, por, Fallo: ErrorHerramientaEstudio }),
  };

  return acciones;
}
