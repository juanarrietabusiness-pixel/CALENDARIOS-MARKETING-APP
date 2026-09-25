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

const PRESUPUESTO_MS = 120_000;
const MAX_REFS = 5;

// `ratio` es lo que Gemini entiende. 1200×630 no tiene proporción
// propia: sale en 16:9 y el navegador lo recorta al descargar.
const FORMATOS = {
  square:     { w: 1080, h: 1080, ratio: "1:1",  label: "Cuadrado 1080×1080" },
  vertical:   { w: 1080, h: 1350, ratio: "4:5",  label: "Vertical 1080×1350" },
  story:      { w: 1080, h: 1920, ratio: "9:16", label: "Historia/Reel 1080×1920" },
  horizontal: { w: 1200, h: 630,  ratio: "16:9", label: "Horizontal 1200×630" },
};

/**
 * A trozos: `String.fromCharCode(...bytes)` con una imagen de más de
 * ~100 KB pasa del máximo de argumentos, lanza, y el `catch` de abajo
 * descartaba la referencia sin decir nada.
 */
function aBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${env.GOOGLE_AI_KEY}`;

  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), PRESUPUESTO_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: abortar.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: (FORMATOS[formatoFinal] ?? FORMATOS.square).ratio },
        },
      }),
    });
  } catch {
    clearTimeout(reloj);
    if (abortar.signal.aborted) {
      return error("La generación de la imagen tardó demasiado. Inténtalo de nuevo.", 504);
    }
    return error("No se pudo contactar con Google AI", 502);
  }
  clearTimeout(reloj);

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    console.error("imagen: Google AI respondió", res.status, texto);
    if (res.status === 429) {
      return error("Google AI está saturado. Inténtalo en unos segundos.", 429);
    }
    if (res.status === 401 || res.status === 403) {
      return error("La clave de Google AI no es válida. Revísala en los secretos del Worker.", 502);
    }
    let detalle = "";
    try {
      const obj = JSON.parse(texto);
      detalle = obj?.error?.message || "";
    } catch { /* no es JSON */ }
    return error(
      `Google AI devolvió un error (${res.status})${detalle ? ": " + detalle.slice(0, 200) : ". Inténtalo de nuevo."}`,
      502,
    );
  }

  const data = await res.json();
  await registrarConsumoGemini(acceso, { funcion: historia ? "historia" : "imagen", modelo, meta: data?.usageMetadata, clienteId: clientId });
  const candidates = data?.candidates ?? [];
  const partesRespuesta = candidates[0]?.content?.parts ?? [];

  const imagePart = partesRespuesta.find((p) => p.inlineData);
  if (!imagePart) {
    const textPart = partesRespuesta.find((p) => p.text);
    const motivo = textPart?.text || "No se generó ninguna imagen";
    return error(`No se pudo generar la imagen: ${motivo.slice(0, 200)}`, 422);
  }

  const { mimeType, data: base64Data } = imagePart.inlineData;
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const clave = `clientes/${clientId}/generadas/${uuid()}.${ext}`;

  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  await env.MEDIA.put(clave, bytes, {
    httpMetadata: { contentType: mimeType || "image/png" },
  });

  return json({ clave, mimeType }, 201);
}
