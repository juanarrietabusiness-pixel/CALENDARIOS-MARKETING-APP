// ============================================================
// Generación de imágenes con Gemini
//
// El navegador NUNCA habla con Google: todo pasa por el Worker,
// que es lo que permite que `connect-src` quede en `'self'`.
//
// El flujo:
//   1. Recibe prompt + contexto del post + referencias
//   2. Construye la petición con las imágenes de referencia desde R2
//   3. Llama a Gemini con responseModalities: ["IMAGE"]
//   4. Sube el resultado a R2
//   5. Devuelve la clave R2
// ============================================================

import { json, error, cuerpo } from "../lib/respuesta.js";
import { uuid } from "../lib/ids.js";
import { bloqueoPorPresupuesto, registrarConsumoGemini } from "../lib/configIA.js";
import { llamarGemini, aBase64, ErrorMotor } from "../lib/estudio/gemini.js";
import { registrarImagenGenerada } from "../lib/estudio/galeria.js";
import { medidasDe } from "../lib/estudio/archivos.js";

const MAX_REFS = 5;

// `ratio` es lo que Gemini entiende. 1200×630 no tiene proporción
// propia: sale en 16:9 y el navegador lo recorta al descargar.
const FORMATOS = {
  square:     { w: 1080, h: 1080, ratio: "1:1",  label: "Cuadrado 1080×1080" },
  vertical:   { w: 1080, h: 1350, ratio: "4:5",  label: "Vertical 1080×1350" },
  story:      { w: 1080, h: 1920, ratio: "9:16", label: "Historia/Reel 1080×1920" },
  horizontal: { w: 1200, h: 630,  ratio: "16:9", label: "Horizontal 1200×630" },
};

function construirPrompt(datos) {
  const { idea, descripcion, guion, format, category, title, clientName,
    visualStyle, templatePrompt, imageFormat } = datos;

  const dim = FORMATOS[imageFormat] ?? FORMATOS.square;
  const partes = [];

  partes.push(`Genera una imagen profesional para una publicación de redes sociales.`);
  partes.push(`Dimensiones: ${dim.w}×${dim.h} píxeles (formato ${dim.label}).`);

  if (clientName) partes.push(`Cliente: ${clientName}.`);
  if (format) partes.push(`Tipo de publicación: ${format}.`);
  if (category) partes.push(`Categoría: ${category}.`);
  if (title) partes.push(`Título: ${title}.`);
  if (idea) partes.push(`Idea/Brief: ${idea}.`);
  if (descripcion) partes.push(`Descripción: ${descripcion.slice(0, 500)}.`);
  if (guion) partes.push(`Guion: ${guion.slice(0, 300)}.`);

  if (visualStyle) {
    partes.push(`\nGUÍA VISUAL DEL CLIENTE (respetar estrictamente):\n${visualStyle}`);
  }

  if (templatePrompt) {
    partes.push(`\nPLANTILLA VISUAL:\n${templatePrompt}`);
  }

  partes.push(`\nIMPORTANTE: La imagen debe ser limpia, profesional y lista para publicar.`);
  partes.push(`NO incluyas texto en la imagen a menos que se indique explícitamente.`);
  partes.push(`Genera SOLO la imagen, sin explicación.`);

  return partes.join("\n");
}

/**
 * Las historias que salen de un post. La imagen del post va como BASE
 * (no como inspiración): lo que se pide es la misma pieza llevada a 9:16,
 * no otra nueva. Tres variantes para escoger.
 *
 * Todas dejan libres las zonas seguras de una historia —arriba el nombre
 * de la cuenta, abajo la barra de respuesta— y un hueco para el sticker
 * de enlace o encuesta, que por API no se puede poner.
 */
const VARIANTES_HISTORIA = Object.freeze({
  adaptacion: "Adapta ESTA imagen a una historia vertical 9:16. Conserva exactamente el mismo contenido, producto, personas, colores, estilo y cualquier texto que ya tenga, sin cambiarlo ni traducirlo. Completa el lienzo ampliando el fondo arriba y abajo de forma natural y coherente (sin franjas, sin bordes, sin repetir el motivo). No recortes el motivo principal: debe verse entero, centrado.",
  anuncio: "Diseña una historia vertical 9:16 que anuncie ESTA publicación: coloca la imagen del post entera, como una tarjeta centrada con esquinas suavemente redondeadas y una sombra sutil, sobre un fondo limpio con los colores de la marca (puede ser un degradado suave o una textura sutil). Encima de la tarjeta, en letras grandes y limpias, sólo el texto «NUEVO POST». Ningún otro texto.",
  detalle: "Crea una historia vertical 9:16 con un primer plano (detalle) del motivo principal de ESTA imagen: el mismo producto o escena, con la misma luz, colores y estilo, como si fuera una foto real tomada más cerca. Sin texto.",
});

/**
 * La portada de un destacado del perfil. Instagram la enseña recortada en
 * CÍRCULO y muy pequeña: un icono simple en el centro, sobre el color de
 * la marca, sin texto —el título ya va debajo, escrito por Instagram—.
 */
function construirPromptPortada({ titulo, contenido }, { clientName, colores, visualStyle }) {
  return [
    `Genera la PORTADA de un destacado de Instagram (1080×1080) para la marca ${clientName}.`,
    `El destacado se llama «${String(titulo).slice(0, 30)}»${contenido ? ` y contiene: ${String(contenido).slice(0, 200)}` : ""}.`,
    `Diseño: fondo liso de color ${colores[0]}${colores[1] ? ` (o un degradado muy suave hacia ${colores[1]})` : ""}; en el centro, un icono minimalista de línea, en blanco, que represente ese tema de un vistazo.`,
    `Instagram la recorta en círculo y la enseña a unos 60 px: el icono debe caber holgado en el círculo central (60 % del ancho), ser grueso y simple, sin detalles finos.`,
    `SIN TEXTO, sin letras, sin marcos ni sombras.`,
    visualStyle ? `\nGUÍA VISUAL DEL CLIENTE (respetar):\n${visualStyle}` : "",
    `Genera SOLO la imagen, sin explicación.`,
  ].filter(Boolean).join("\n");
}

function construirPromptHistoria(variante, { clientName, visualStyle }) {
  return [
    `Genera una imagen para una HISTORIA de Instagram (1080×1920, vertical 9:16) a partir de la imagen de la publicación que te adjunto.`,
    clientName ? `Marca: ${clientName}.` : "",
    VARIANTES_HISTORIA[variante] ?? VARIANTES_HISTORIA.adaptacion,
    `ZONAS SEGURAS: deja libres de texto y de elementos importantes los ~250 px de arriba (ahí va el nombre de la cuenta) y los ~350 px de abajo (ahí va la barra de respuesta y el sticker).`,
    visualStyle ? `\nGUÍA VISUAL DEL CLIENTE (respetar):\n${visualStyle}` : "",
    `Genera SOLO la imagen, sin explicación.`,
  ].filter(Boolean).join("\n");
}

/**
 * La MISMA imagen llevada a otra proporción, ampliando el fondo: lo que
 * hace Metricool con «expandir». Para la de Flow (3:4), que el feed de
 * Instagram no acepta: en vez de bandas difuminadas, fondo de verdad.
 * El navegador decide la proporción (sabe las medidas) y recorta el
 * resultado al tamaño exacto: Gemini entrega 4:5 en 896×1152, un pelo
 * más alto de lo que Instagram admite.
 */
const PROPORCIONES_ADAPTAR = Object.freeze({ "4:5": "vertical", "16:9": "horizontal", "9:16": "story" });

function construirPromptAdaptar(proporcion, { clientName }) {
  // GENERAR, no ampliar: pedirle a Nano Banana que «amplíe» la imagen hacía
  // que la redibujara más cerca —el motivo crecía y los bordes se perdían—,
  // justo lo contrario de lo que se quería. Ahora se le pide una imagen NUEVA
  // en la proporción de destino, con la original como referencia, y que el
  // encuadre sea más abierto, nunca más cerrado.
  const destino = proporcion === "9:16" ? "una historia vertical 9:16" : proporcion === "16:9" ? "una imagen horizontal 16:9" : "una publicación vertical 4:5 del feed de Instagram";
  return [
    `Genera una imagen NUEVA para ${destino}, tomando la imagen adjunta como referencia exacta.`,
    clientName ? `Marca: ${clientName}.` : "",
    "Recrea la misma escena: el mismo producto, las mismas personas, los mismos colores, la misma luz y el mismo estilo, y cualquier texto o logo que ya tenga, sin cambiarlo ni traducirlo.",
    "Recompón el encuadre para la nueva proporción con un plano IGUAL O MÁS ABIERTO que el original: nada de acercar, recortar ni cortar el motivo. Todo lo que se ve en la original tiene que verse entero, con aire alrededor.",
    "Lo que falte a los lados, arriba o abajo se completa con el mismo entorno, de forma natural: sin franjas, sin bordes, sin desenfoque, sin repetir el motivo.",
    "Genera SOLO la imagen, sin explicación.",
  ].filter(Boolean).join("\n");
}

/** La imagen del post, de R2, siempre de ESTE cliente. */
async function imagenDelPost(env, clientId, src) {
  const clave = String(src ?? "").replace(/^\/api\/media\//, "");
  if (!clave.startsWith(`clientes/${clientId}/`) || clave.includes("..")) return null;
  const obj = await env.MEDIA.get(clave);
  if (!obj) return null;
  return { inlineData: { mimeType: obj.httpMetadata?.contentType || "image/jpeg", data: aBase64(await obj.arrayBuffer()) } };
}

async function cargarReferencias(env, acceso, clientId) {
  const refs = await acceso.leer(
    "image_references", { client_id: clientId }, "created_at desc",
  );
  const partes = [];

  for (const ref of refs.slice(0, MAX_REFS)) {
    try {
      const obj = await env.MEDIA.get(ref.file_path);
      if (!obj) continue;
      const buf = await obj.arrayBuffer();
      const base64 = aBase64(buf);
      const mime = obj.httpMetadata?.contentType || "image/jpeg";
      partes.push({ inlineData: { mimeType: mime, data: base64 } });
    } catch { /* la referencia ya no existe en R2 */ }
  }
  return partes;
}

export async function rutaGenerarImagen(req, env, ctx) {
  if (!env.GOOGLE_AI_KEY) {
    return error("El servidor no tiene configurada la clave de Google AI", 503);
  }

  const body = await cuerpo(req);
  if (!body) return error("JSON inválido");

  const { clientId, idea, descripcion, guion, format, category, title,
    imageFormat, templateId } = body;

  if (!clientId) return error("Falta el cliente");

  const { acceso } = ctx;
  const cliente = await acceso.leerUno("clients", { id: clientId });
  if (!cliente) return error("Cliente no encontrado", 404);
  const bloqueo = await bloqueoPorPresupuesto(acceso);
  if (bloqueo) return error(bloqueo, 402);

  let templatePrompt = "";
  if (templateId) {
    const tpl = await acceso.leerUno("image_templates", { id: templateId });
    if (tpl) templatePrompt = tpl.prompt;
  }

  // Historia a partir de la imagen de un post: otra petición, otra base.
  const historia = body.historiaDe && typeof body.historiaDe === "object" ? body.historiaDe : null;
  const adaptar = !historia && body.adaptarDe && typeof body.adaptarDe === "object" && PROPORCIONES_ADAPTAR[body.adaptarDe.proporcion] ? body.adaptarDe : null;
  const portada = !historia && !adaptar && body.portada && typeof body.portada === "object" && body.portada.titulo ? body.portada : null;
  let formatoFinal = imageFormat || "square";
  let parts;
  if (historia) {
    const base = await imagenDelPost(env, clientId, historia.src);
    if (!base) return error("No encontré la imagen del post: tiene que estar subida a la publicación.", 404);
    formatoFinal = "story";
    parts = [
      { text: construirPromptHistoria(historia.variante, { clientName: cliente.name, visualStyle: cliente.visual_style || "" }) },
      { text: "\nIMAGEN DE LA PUBLICACIÓN (la base):" },
      base,
    ];
  } else if (adaptar) {
    const base = await imagenDelPost(env, clientId, adaptar.src);
    if (!base) return error("No encontré la imagen: tiene que estar subida a la publicación.", 404);
    formatoFinal = PROPORCIONES_ADAPTAR[adaptar.proporcion];
    parts = [
      { text: construirPromptAdaptar(adaptar.proporcion, { clientName: cliente.name }) },
      { text: "\nLA IMAGEN DE REFERENCIA (la original):" },
      base,
    ];
  } else if (portada) {
    formatoFinal = "square";
    const colores = [cliente.primary_color, cliente.secondary_color].filter((c) => /^#[0-9a-f]{6}$/i.test(c ?? "") && c.toUpperCase() !== "#FFFFFF");
    parts = [{ text: construirPromptPortada(portada, { clientName: cliente.name, colores: colores.length ? colores : ["#1E90FF"], visualStyle: cliente.visual_style || "" }) }];
  } else {
    const prompt = construirPrompt({
      idea, descripcion, guion, format, category, title,
      clientName: cliente.name,
      visualStyle: cliente.visual_style || "",
      templatePrompt,
      imageFormat: formatoFinal,
    });
    parts = [{ text: prompt }];
    const refParts = await cargarReferencias(env, acceso, clientId);
    if (refParts.length > 0) {
      parts.push({ text: "\nIMÁGENES DE REFERENCIA (usa estas como inspiración visual):" });
      parts.push(...refParts);
    }
  }

  const modelo = env.GEMINI_MODEL || "gemini-2.5-flash-image";
  const funcion = historia ? "historia" : adaptar ? "ampliar" : portada ? "portada" : "imagen";

  // La llamada vive en lib/estudio/gemini.js: la comparte el Estudio. Sus
  // mensajes de error son los de siempre, palabra por palabra.
  let resultado;
  try {
    resultado = await llamarGemini(env, {
      gid: modelo,
      partes: parts,
      ratio: (FORMATOS[formatoFinal] ?? FORMATOS.square).ratio,
    });
  } catch (e) {
    if (e instanceof ErrorMotor) return error(e.message, e.estado);
    throw e;
  }

  await registrarConsumoGemini(acceso, { funcion, modelo, meta: resultado.meta, clienteId: clientId });

  const { mime: mimeType, bytes } = resultado;
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const clave = `clientes/${clientId}/generadas/${uuid()}.${ext}`;
  await env.MEDIA.put(clave, bytes, {
    httpMetadata: { contentType: mimeType || "image/png" },
  });

  // Y a la galería del Estudio, para que se vea junto a las demás. Sin
  // esperarlo ni poder tumbar la respuesta: la imagen ya existe.
  const { ancho, alto } = medidasDe(bytes, mimeType);
  await registrarImagenGenerada(acceso, {
    clientId, clave, mime: mimeType, prompt: idea || title || funcion, modelo, ancho, alto, bytes: bytes.byteLength,
    ajustes: { aspectRatio: (FORMATOS[formatoFinal] ?? FORMATOS.square).ratio, origen: funcion },
  });

  return json({ clave, mimeType }, 201);
}
