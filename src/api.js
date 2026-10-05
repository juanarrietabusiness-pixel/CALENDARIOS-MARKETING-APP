import { parseJSONLoose, parseGitHubUrl } from "./lib/parse";
import { normalizarColor, coloresDelTexto, tresColores } from "./lib/colores";
import { hora12 } from "./lib/horas";
import { getWeekNumber, dayName } from "./utils";
import { INSTRUCCION_PIEZAS, INSTRUCCION_ADJUNTOS } from "./lib/mensajeChat";
import { base64DeImagen, fotogramasDeVideo } from "./lib/medios";
import { mediosDe } from "./lib/publicacion";
import { analizarVideo } from "./lib/db";
import { PROPIEDADES_FECHA_TAREA, fechaEnZona } from "./lib/agenda";
import { diasPorSemanaDelMes, nombreDelDia } from "./lib/meses";
import { partirSSE } from "../worker/lib/flujoAnthropic.js";
import { sinCapaMaquetacion, prepararContenidoIA, TITULO_FICHA } from "./lib/contextoADN";
import { textoEstableDelCerebro, consultaDeTanda, consultaDePublicacion, usaElCerebro, contextoDelChat } from "./lib/cerebroCliente";

// Se reexportan porque media aplicación las importa desde aquí. Viven en
// `lib/parse.js` para poder probarlas sin arrastrar el cliente de Supabase.
export { parseAIResponse, parseGitHubUrl, parsePiezas, parseJSONLoose, parseBloques, cachedBlock, bloque } from "./lib/parse";

/**
 * Llama a una ruta del servidor.
 *
 * Las claves de IA y el token de GitHub viven en los secretos del
 * Worker: el navegador nunca las ve. La sesión viaja en la cookie
 * `__Host-`, que el navegador manda sola —antes había que adjuntar el
 * token de supabase-js a mano—.
 *
 * El error útil viene en el cuerpo. Cuando el cuerpo no es JSON, el
 * código de estado es la única pista que queda: decir «no se pudo
 * contactar con el servidor» ante un 504 manda a buscar un problema de
 * red que no existe.
 */
const RUTAS = { ai: "/api/ia", "github-adn": "/api/adn" };

async function invokeFunction(name, body) {
  const ruta = RUTAS[name];
  if (!ruta) throw new Error(`No hay ninguna ruta para «${name}».`);

  let res;
  try {
    res = await fetch(ruta, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu red.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* la respuesta no era JSON: pasa en los cortes del borde */
  }

  // El medidor de gasto de la cabecera se relee al terminar cualquier
  // llamada de IA, haya ido bien o mal: una que falla a medias también cuesta.
  if (name === "ai") {
    window.dispatchEvent(new Event("ia:gasto"));
  }

  if (!res.ok) {
    if (data?.error) throw new Error(data.error);
    if (res.status === 504 || res.status === 408) {
      throw new Error(
        `La ruta «${name}» se quedó sin margen y se cortó. ` +
        "Si estabas generando un lote, prueba con menos publicaciones."
      );
    }
    if (res.status === 401) throw new Error("La sesión caducó. Vuelve a entrar.");
    throw new Error(`La ruta «${name}» respondió ${res.status}.`);
  }

  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Genera texto con la IA.
 *
 * Los reintentos y la elección de proveedor ya no están aquí: los hace
 * la función del servidor, que además no tiene el límite de tiempo del
 * navegador cerrando la pestaña a medias.
 */
/**
 * `funcion` y `clienteId` sólo sirven para el contador de gasto: dicen en
 * qué se fue cada dólar y de qué cliente. El `tier` ya no elige nada.
 */
export async function callAI(content, { maxTokens, tier, tolerarCorte = false, funcion, clienteId } = {}) {
  // El ADN va en su propio bloque con caché: es lo mismo en cada tanda de
  // una generación y sólo cambian las publicaciones (`lib/contextoADN.js`).
  const data = await invokeFunction("ai", { content: prepararContenidoIA(content), maxTokens, tier, funcion, clienteId });

  // El servidor avisa si el modelo se quedó sin tokens a media respuesta.
  // Sin esto, un texto cortado a la mitad se trataría como completo.
  //
  // `tolerarCorte` es para quien sabe rescatar lo que sí llegó: en un lote
  // de piezas, que la última quede a medias no invalida las anteriores.
  if (data?.truncated && !tolerarCorte) {
    throw new Error("La respuesta se cortó por longitud. Prueba con menos piezas por tanda.");
  }
  if (tolerarCorte) {
    return {
      texto: data?.text ?? "",
      cortada: Boolean(data?.truncated),
      segundos: data?.segundos,
      diagnostico: data?.diagnostico ?? null,
    };
  }
  return data?.text ?? "";
}

export function buildScriptPrompt(client, calendar, posts, adnExtra = "", memories = [], cerebro = null) {
  const ctx = buildClientContext(client, calendar, adnExtra, cerebro);
  const memBlock = memories.length
    ? `\nMEMORIAS DEL ASISTENTE:\n${memories.map((m) => `· ${typeof m === "string" ? m : m.content}`).join("\n")}\n`
    : "";
  const postsList = posts.map((p) => {
    const formatRules = {
      post: "Solo DESCRIPCION (caption con emojis, CTA y hashtags al final). No escribas GUION.",
      reel: "GUION (escena por escena: Hook → Desarrollo → CTA) + DESCRIPCION (caption con hashtags al final)",
      carrusel: "GUION (texto por cada card/slide, separados por ---) + DESCRIPCION (caption con hashtags al final)",
      historia: "GUION (nota breve, max 2 oraciones) + DESCRIPCION (texto overlay con hashtags al final)",
      live: "GUION (puntos clave a cubrir en el live, formato bullet) + DESCRIPCION (caption de anuncio con hashtags al final)",
    };
    return `<<<PUBLICACION_ID:${p.id}>>>
FORMATO: ${p.format}
CATEGORIA: ${p.category || "N/A"}
DIA: ${p._date} (${p._dayName || ""})
SEMANA: ${p._weekNumber || ""}
CONCEPTO_SEMANAL: ${p._concept || "N/A"}
IDEA: ${p.idea || "genera según contexto del cliente"}
REGLAS_FORMATO: ${formatRules[p.format] || formatRules.post}`;
  }).join("\n\n");

  return `${ctx}
${memBlock}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "Natural y profesional"}
WHATSAPP: ${client.whatsapp || "N/A"}
HASHTAGS BASE: ${client.hashtags || "#Panama"}
CAMPAÑA: ${calendar?.campaign || "N/A"}
${calendar?.offers ? `OFERTAS Y DESCUENTOS DEL MES: ${calendar.offers}` : ""}
${calendar?.promoCode ? `CÓDIGO PROMOCIONAL: ${calendar.promoCode}` : ""}

---

INSTRUCCIONES:
Genera el contenido para CADA publicación listada abajo.
Respeta el formato de salida EXACTAMENTE.
Cada publicación va delimitada por <<<PUBLICACION_ID:xxx>>> con su ID correspondiente.

REGLAS POR FORMATO:
- post: Solo DESCRIPCION (caption con emojis + CTA + hashtags al final del texto). NO incluir GUION.
- reel: GUION (Hook → Desarrollo → CTA, escena por escena) + DESCRIPCION (incluye hashtags al final)
- carrusel: GUION (texto por card, separados por ---) + DESCRIPCION (incluye hashtags al final)
- historia: GUION (nota breve) + DESCRIPCION (incluye hashtags al final)
- live: GUION (bullet points del live) + DESCRIPCION (incluye hashtags al final)

IMPORTANTE: Los hashtags deben ir DENTRO de la DESCRIPCION, al final del caption. NO uses un campo HASHTAGS_FINALES separado.

FORMATO DE RESPUESTA OBLIGATORIO:
<<<PUBLICACION_ID:id_del_post>>>
GUION:
(contenido del guión aquí, o vacío si es post)
DESCRIPCION:
(caption/descripción aquí, con hashtags al final)

---

PUBLICACIONES A GENERAR:
${postsList}`;
}

/**
 * Prompt para escribir SÓLO las descripciones de un lote de publicaciones.
 *
 * El asistente de creación tiene dos pasos separados a propósito: primero
 * se acuerdan las ideas y se revisan, y sólo después se escriben los
 * captions. Pedir guion y descripción a la vez —que es lo que hace
 * `buildScriptPrompt`— gasta el doble de presupuesto para tirar la mitad,
 * y en un mes entero eso es la diferencia entre una tanda y tres.
 *
 * El contrato de salida es el mismo `<<<PUBLICACION_ID:…>>>` de siempre,
 * para poder leerlo con `parseAIResponse` sin un segundo parser.
 */
export function buildDescripcionesPrompt(client, calendar, posts, adnExtra = "", memories = [], cerebro = null) {
  const ctx = buildClientContext(client, calendar, adnExtra, cerebro);
  const memBlock = memories.length
    ? `\nMEMORIAS DEL ASISTENTE:\n${memories.map((m) => `· ${typeof m === "string" ? m : m.content}`).join("\n")}\n`
    : "";

  const reglas = {
    post: "Caption de post estático: gancho en la primera línea, cuerpo breve, CTA y hashtags al final.",
    reel: "Caption de reel: gancho corto que invite a ver el vídeo, CTA y hashtags al final.",
    carrusel: "Caption de carrusel: promete lo que se aprende deslizando, CTA y hashtags al final.",
    historia: "Texto para la historia: dos líneas como mucho, directo, con hashtags al final.",
    live: "Caption de anuncio del live: día, hora y motivo para conectarse, con hashtags al final.",
  };

  const lista = posts.map((p) => `<<<PUBLICACION_ID:${p.id}>>>
FORMATO: ${p.format}
CATEGORIA: ${p.category || "N/A"}
DIA: ${p._date} (${p._dayName || ""})
SEMANA: ${p._weekNumber || ""} — ${p._concept || "libre"}
IDEA: ${p.idea}
REGLA: ${reglas[p.format] || reglas.post}`).join("\n\n");

  return `${ctx}
${memBlock}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
WHATSAPP: ${client.whatsapp || "N/A"}
HASHTAGS BASE: ${client.hashtags || "#Panama"}
CAMPAÑA: ${calendar?.campaign || "N/A"}
${calendar?.offers ? `OFERTAS Y DESCUENTOS DEL MES: ${calendar.offers}` : ""}
${calendar?.promoCode ? `CÓDIGO PROMOCIONAL: ${calendar.promoCode}` : ""}

---

INSTRUCCIONES:
Escribe la DESCRIPCION (el caption que se publica) de CADA publicación de
la lista, partiendo de su idea. No escribas guion, ni títulos, ni notas de
producción: sólo el caption.

Cada caption lleva emojis con medida, una llamada a la acción hacia
WhatsApp (${client.whatsapp || "N/A"}) y los hashtags al final del propio
texto. No uses un campo de hashtags aparte.

FORMATO DE RESPUESTA OBLIGATORIO, sin nada más:
<<<PUBLICACION_ID:id_de_la_publicacion>>>
DESCRIPCION:
(caption completo, con los hashtags al final)

---

PUBLICACIONES:
${lista}`;
}

/**
 * Lee el ADN de marca del repositorio del cliente.
 *
 * Ya no recibe token: el de GitHub es uno solo del servidor. Antes cada
 * cliente guardaba el suyo en el navegador y acababa dentro del JSON de
 * «Exportar».
 */
/**
 * Versión mínima del contrato de `github-adn` que esta aplicación necesita.
 *
 * v2 trajo la lectura completa del repositorio: sin ella la función
 * recorta cada archivo a 3000 caracteres y no lee el 05_receta.json, así
 * que la receta se deduce con IA y vuelven a faltar campos.
 *
 * v3 decodifica la carpeta del cliente: sin ella, la carpeta de un cliente
 * con un espacio en el nombre («Baby Caleb/…», guardada como
 * «Baby%20Caleb/…») no coincide con ninguna ruta del repositorio y el ADN
 * vuelve vacío.
 *
 * Los dos se ven igual que «el repositorio está mal», y no lo es: es un
 * despliegue que no entró.
 */
export const VERSION_ADN_REQUERIDA = 3;

export async function fetchGitHubADN(repoUrl, folder = "") {
  if (!parseGitHubUrl(repoUrl)) {
    return { content: "", files: [], subfolders: [] };
  }
  return await invokeFunction("github-adn", { repoUrl, folder });
}

export async function generateSinglePost(client, post, day, calendar) {
  const isPost = post.format === "post";
  const adn = await loadADN(client);
  const adnExtra = adn.content;
  const pasajes = await pasajesDeLaPublicacion(client, adn, calendar, post, day);
  const ctx = buildClientContext(client, calendar, adnExtra, adn.cerebro ? { pasajes } : null);

  const formatRules = {
    post: `DESCRIPCION: caption completo con emojis, CTA a WhatsApp (${client.whatsapp || "N/A"}) y hashtags al final (${client.hashtags || "#Panama"})`,
    reel: `GUION:\nHook (0-3s): ...\nDesarrollo (3-20s): ...\nCTA final: ...\n\nDESCRIPCION: caption para Instagram con emojis, CTA y hashtags al final`,
    carrusel: `GUION:\nPortada: ...\nSlide 1: ...\nSlide 2: ...\nCTA: ...\n\nDESCRIPCION: caption para Instagram con emojis, CTA y hashtags al final`,
    historia: `GUION: nota breve de que cubrir\n\nDESCRIPCION: texto overlay con hashtags al final`,
    live: `GUION: bullet points del live\n\nDESCRIPCION: caption de anuncio del live con hashtags al final`,
  };

  let promptText = `${ctx}

CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})

${post.idea ? `IDEA: ${post.idea}` : "Genera basandote en el contexto del cliente, la categoria y el concepto semanal."}

Genera el contenido en este formato exacto:
${formatRules[post.format] || formatRules.post}

${isPost ? "No incluyas GUION para posts estaticos, solo DESCRIPCION." : ""}
Escribe directamente el contenido, sin preambulos.`;

  const content = [];
  const imagen = await base64DeImagen(post.image).catch(() => null);
  if (imagen) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imagen } });
    promptText = `Basandote en la imagen adjunta y el siguiente contexto:\n\n${promptText}`;
  }
  content.push({ type: "text", text: promptText });

  const txt = await callAI(content, { funcion: "publicación", clienteId: client?.id });

  const guionMatch = txt.match(/GUION:\s*([\s\S]*?)(?=DESCRIPCION:|HASHTAGS_FINALES:|$)/i);
  const descMatch = txt.match(/DESCRIPCION:\s*([\s\S]*?)(?=GUION:|HASHTAGS_FINALES:|$)/i);
  const hashMatch = txt.match(/HASHTAGS_FINALES:\s*([\s\S]*?)(?=GUION:|DESCRIPCION:|$)/i);

  return {
    guion: guionMatch ? guionMatch[1].trim() : "",
    descripcion: descMatch ? descMatch[1].trim() : (isPost ? txt.trim() : ""),
    hashtagsFinales: hashMatch ? hashMatch[1].trim() : "",
  };
}

/**
 * Qué se le pide al botón de la idea. Vacía, una idea nueva como siempre.
 * Con algo escrito, la COMPLETA o la mejora sin cambiarla por otra: antes
 * la reemplazaba y se perdía lo que el equipo había pensado. Pura.
 */
export function instruccionIdea(post = {}) {
  const escrita = String(post.idea ?? "").trim();
  if (!escrita) {
    return `Genera UNA idea creativa y concreta para una publicacion de ${post.format} para este cliente.
La idea debe ser especifica, accionable y alineada con la marca, la categoria y el concepto semanal.
Responde SOLO con la idea, sin preambulos ni explicaciones. Maximo 2 oraciones.`;
  }
  return `IDEA QUE YA ESCRIBIÓ EL EQUIPO:
«${escrita.slice(0, 2000)}»

Mejora y completa ESTA idea para una publicación de ${post.format}. Respeta lo que dice: el tema, el producto, la oferta y el enfoque son los suyos; no la cambies por otra idea. Si está a medias, termínala; si ya está completa, hazla más clara y concreta, alineada con la marca.
Responde SOLO con la idea mejorada, sin preámbulos ni explicaciones. Máximo 3 oraciones.`;
}

export async function generateFieldForPost(client, post, day, calendar, field) {
  const adn = await loadADN(client);
  const adnExtra = adn.content;
  const pasajes = await pasajesDeLaPublicacion(client, adn, calendar, post, day);
  const ctx = buildClientContext(client, calendar, adnExtra, adn.cerebro ? { pasajes } : null);
  let promptText = "";

  if (field === "idea") {
    promptText = `${ctx}
CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || post.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})


${instruccionIdea(post)}`;
  } else if (field === "guion") {
    promptText = `${ctx}
CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || post.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})

IDEA: ${post.idea || "N/A"}

Basandote en la idea y el contexto del cliente, genera el GUION para esta publicacion.
${post.format === "reel" ? "Formato: Hook (0-3s) → Desarrollo (3-20s) → CTA final" : ""}
${post.format === "carrusel" ? "Formato: texto por cada slide, separados por ---" : ""}
${post.format === "historia" ? "Formato: nota breve, max 2 oraciones" : ""}
${post.format === "live" ? "Formato: bullet points de los temas a cubrir" : ""}
Responde SOLO con el guion, sin preambulos.`;
  } else if (field === "descripcion") {
    promptText = `${ctx}
CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || post.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})

IDEA: ${post.idea || "N/A"}
${post.guion ? `GUION: ${post.guion}` : ""}

Basandote en la idea${post.guion ? ", el guion" : ""} y el contexto del cliente, genera la DESCRIPCION (caption) para esta publicacion.
Incluye emojis, CTA a WhatsApp (${client.whatsapp || "N/A"}) y hashtags relevantes al final del texto (${client.hashtags || "#Panama"}).
Responde SOLO con la descripcion/caption completa incluyendo los hashtags, sin preambulos.`;
  }

  const content = [{ type: "text", text: promptText }];
  return await callAI(content, { funcion: "publicación", clienteId: client?.id });
}

/**
 * «Escribir a partir del contenido»: la IA MIRA lo subido —las imágenes,
 * y de un video su análisis de Gemini y unos fotogramas— y escribe en una
 * sola llamada el texto, los hashtags, el primer comentario, el texto
 * alternativo, la idea y el título. Antes el botón «IA» mandaba sólo texto
 * y, con una foto sin idea escrita, escribía a ciegas.
 *
 * Devuelve la propuesta; quien llama la pone con `rellenarDesdeContenido`,
 * que no pisa lo que ya hay escrito.
 */
export async function escribirDesdeContenido(client, post, { calendar = null, fecha = "", alProgresar = () => {} } = {}) {
  const medios = mediosDe(post).filter((m) => m.src.startsWith("/api/media/"));
  if (!medios.length) throw new Error("Primero sube una imagen o un video: la IA escribe mirándolo.");
  const bloques = [];
  const notas = [];
  for (const [i, m] of medios.slice(0, 6).entries()) {
    if (m.tipo === "imagen") {
      alProgresar(`Preparando la imagen ${i + 1}…`);
      const data = await base64DeImagen(m.src, 1024).catch(() => null);
      if (data) {
        bloques.push({ type: "text", text: `Imagen ${i + 1} de la publicación:` });
        bloques.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
      }
      continue;
    }
    alProgresar("Mirando el video (puede tardar un poco)…");
    const [analisis, fotos] = await Promise.allSettled([
      analizarVideo(m.src.replace(/^\/api\/media\//, "")),
      fotogramasDeVideo(m.src, 4, 640),
    ]);
    if (analisis.status === "fulfilled" && analisis.value?.analisis) notas.push(`Lo que se ve y se oye en el video ${i + 1}:\n${analisis.value.analisis}`);
    if (fotos.status === "fulfilled") {
      bloques.push({ type: "text", text: `Fotogramas del video ${i + 1}:` });
      for (const f of fotos.value) bloques.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.base64 } });
    }
  }
  if (!bloques.length && !notas.length) throw new Error("No pude leer el archivo para enseñárselo a la IA.");

  alProgresar("Escribiendo…");
  const adn = await loadADN(client).catch(() => ({ content: "" }));
  const adnExtra = adn.content;
  const pasajes = await pasajesDeLaPublicacion(client, adn, calendar, post, { concept: "" });
  const ctx = buildClientContext(client, calendar, adnExtra, adn.cerebro ? { pasajes } : null);
  const formato = post.format || "post";
  const pedido = `${ctx}

Vas a escribir la publicación de ${client.name} a partir de SU CONTENIDO, que va adjunto: míralo con atención y describe lo que de verdad se ve (producto, personas, lugar, texto que aparezca), no algo genérico.
FORMATO: ${formato}${fecha ? `\nFECHA: ${fecha}` : ""}${calendar?.campaign ? `\nCAMPAÑA: ${calendar.campaign}` : ""}
${post.idea ? `IDEA YA ESCRITA (respétala): ${post.idea}` : ""}
${post.title ? `TÍTULO YA ESCRITO: ${post.title}` : ""}
${notas.join("\n\n")}

Devuelve SOLO un objeto JSON, sin texto antes ni después:
{
  "titulo": "nombre corto para el calendario (máx. 6 palabras)",
  "idea": "en una frase, de qué va la publicación",
  "descripcion": "${formato === "historia" ? "" : "el caption: gancho en la primera línea, emojis con medida y una llamada a la acción" + (client.whatsapp ? ` a WhatsApp (${client.whatsapp})` : "") + ". SIN hashtags"}",
  "hashtags": "${formato === "historia" ? "" : `de 5 a 12 hashtags relevantes separados por espacios${client.hashtags ? `, incluidos los de la marca (${client.hashtags})` : ""}`}",
  "primerComentario": "${formato === "historia" ? "" : "opcional: una línea útil para el primer comentario, o vacío"}",
  "altTexto": "texto alternativo: qué se ve, en una frase, para quien no puede verlo"
}
En español latino neutro, con el tono de la marca.`;
  const texto = await callAI([...bloques, { type: "text", text: pedido }], { funcion: "lectura de contenido", clienteId: client?.id });
  const bruto = parseJSONLoose(texto);
  const limpio = (x, max) => String(x ?? "").trim().slice(0, max);
  return {
    titulo: limpio(bruto.titulo, 80),
    idea: limpio(bruto.idea, 400),
    descripcion: limpio(bruto.descripcion, 2100),
    hashtags: limpio(bruto.hashtags, 600),
    primerComentario: limpio(bruto.primerComentario, 600),
    altTexto: limpio(bruto.altTexto, 1000),
  };
}

export async function extractClientADN(repoContent) {
  // La marca VISUAL también: antes el JSON no tenía ni un campo de color,
  // así que aunque el manual dijera «#0A2540», la ficha seguía con el
  // azul por defecto y la página del cliente salía con la marca de otro.
  const promptText = `Analiza el siguiente contenido de un repositorio de GitHub de un cliente y extrae la informacion para llenar su perfil de agencia de marketing.

CONTENIDO DEL REPOSITORIO:
${repoContent}

Responde UNICAMENTE con un JSON valido con esta estructura exacta, sin texto adicional:
{"nombre":"","industria":"","descripcion":"","valores":"","audiencia":"","competencia":"","estiloGuion":"","estiloLocucion":"","hashtags":"","whatsapp":"","instagram":"","sucursales":"","notasInspeccion":"","colores":[{"hex":"","nombre":"","rol":""}],"tipografias":"","estiloVisual":""}

- "colores": la paleta de marca tal como la defina el contenido. "hex" en formato #RRGGBB (convierte RGB a hex si viene asi; si solo hay Pantone sin equivalente, omitelo). "rol" es su papel: principal, secundario, acento, fondo, texto…
- "tipografias": las fuentes de la marca y para que se usa cada una.
- "estiloVisual": como se ven las piezas de la marca (fotografia, composicion, iluminacion, estilo grafico), en un parrafo.

Si no encuentras informacion para un campo, dejalo vacio.
No inventes datos que no esten en el contenido.`;

  const content = [{ type: "text", text: promptText }];
  const raw = await callAI(content, { funcion: "ADN de marca" });
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No se pudo parsear la respuesta de IA");
  const datos = JSON.parse(jsonMatch[0]);

  let paleta = (Array.isArray(datos.colores) ? datos.colores : [])
    .map((c) => ({ hex: normalizarColor(c?.hex), nombre: String(c?.nombre ?? ""), rol: String(c?.rol ?? "") }))
    .filter((c) => c.hex);
  // Red: si la IA no devolvió paleta pero el manual trae códigos escritos.
  if (!paleta.length) paleta = coloresDelTexto(repoContent).map((hex) => ({ hex, nombre: "", rol: "" }));
  const tres = tresColores(paleta);

  const visual = [
    String(datos.estiloVisual ?? "").trim(),
    datos.tipografias ? `Tipografías: ${String(datos.tipografias).trim()}` : "",
    paleta.length ? `Paleta: ${paleta.map((c) => `${c.hex}${c.nombre ? ` ${c.nombre}` : ""}${c.rol ? ` (${c.rol})` : ""}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  delete datos.colores;
  delete datos.tipografias;
  return {
    ...datos,
    estiloVisual: visual,
    colorPrincipal: tres.principal,
    colorSecundario: tres.secundario,
    colorAcento: tres.acento,
    paleta,
  };
}

/** Una imagen del repositorio del ADN (el logo), como Blob. */
export async function imagenDelADN(repoUrl, path) {
  const res = await fetch("/api/adn/imagen", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl, path }),
  });
  if (!res.ok) {
    let d = null;
    try { d = await res.json(); } catch { /* no era JSON */ }
    throw new Error(d?.error || `GitHub respondió ${res.status}.`);
  }
  return res.blob();
}

/**
 * El contexto que ve el modelo antes de escribir nada.
 *
 * El orden importa y antes estaba al revés. La ficha de la aplicación
 * —nueve campos cortos que alguien tecleó una vez— iba primero, y el ADN
 * del repositorio iba al final bajo el título «CONTEXTO ADICIONAL»: el
 * modelo leía como accesorio lo que el orquestador define como fuente de
 * verdad, y como autoritativo un resumen de trece cadenas.
 *
 * Ahora el ADN va primero, dice de qué archivo sale cada trozo, y la
 * ficha queda debajo declarada como lo que es: un índice, no una fuente.
 */
export function buildClientContext(client, calendar, adnCompleto = "", cerebro = null, { maquetacion = false } = {}) {
  // Quien llama a esto ESCRIBE texto —ideas, guiones, captions—: la capa de
  // maquetación para Meta AI no le sirve y son ~41 000 caracteres en Dcasa.
  // El asistente también pasa por aquí, pero pide `{ maquetacion: true }`.
  //
  // `cerebro` ({ pasajes }) es el modo del cerebro del cliente: `adnCompleto`
  // trae su ficha técnica y sus cifras, y los pasajes que esta tarea necesita
  // van DESPUÉS del título de la ficha de la aplicación —es donde se parte
  // la caché—, porque cambian con cada tanda.
  const conCerebro = Boolean(cerebro);
  // `maquetacion` es del asistente: alguien puede pedirle «arma el prompt para Meta AI», y para eso
  // necesita la receta y el prompt maestro, que un caption no.
  const adnExtra = conCerebro || maquetacion ? adnCompleto : sinCapaMaquetacion(adnCompleto);
  const pasajes = String(cerebro?.pasajes ?? "").trim();
  if (adnExtra) {
    return `Escribes para ${client.name}, cliente de la agencia Juancito Ads.

═══════════════════════════════════════════════════════════
QUÉ MANDA, CUANDO DOS COSAS SE CONTRADIGAN
═══════════════════════════════════════════════════════════
1. ${conCerebro
    ? "El cerebro del cliente que viene abajo —su ficha técnica, sus cifras y los pasajes de sus notas—. Es la fuente de verdad."
    : "El ADN del repositorio que viene abajo. Es la fuente de verdad."}
2. La campaña y las ofertas de este calendario.
3. La ficha de la aplicación. Es un índice de contacto, no una fuente:
   si dice algo distinto de ${conCerebro ? "el cerebro, gana el cerebro" : "el ADN, gana el ADN"}.

Tres reglas del orquestador de la agencia, que aquí no se negocian:
· No mezcles memoria, tono ni assets con los de otro cliente, aunque
  compartan nicho.
· No inventes identidad de marca, ofertas ni precios. Toda cifra, precio,
  plazo, testimonio y caso sale de ${conCerebro ? "las cifras vigentes y los pasajes de abajo" : "el ADN"} y sólo de ahí. Si un dato no está,
  no se usa: se deja fuera y se dice qué falta.
· Escribe en español de Panamá, con tildes y con signos de apertura.

═══════════════════════════════════════════════════════════
${conCerebro ? "CEREBRO" : "ADN"} DE ${(client.name || "").toUpperCase()} — ${conCerebro ? "su ficha técnica y sus cifras" : "leído de su repositorio"}
═══════════════════════════════════════════════════════════
${adnExtra}

═══════════════════════════════════════════════════════════
${TITULO_FICHA}
═══════════════════════════════════════════════════════════
INDUSTRIA: ${client.industry || "N/A"}
DESCRIPCIÓN: ${client.descripcion || "N/A"}
VALORES: ${client.valores || "N/A"}
AUDIENCIA: ${client.audiencia || "N/A"}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "N/A"}
HASHTAGS: ${client.hashtags || "#Panama"}
COMPETENCIA: ${client.competencia || "N/A"}
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}
${pasajes ? `\n═══════════════════════════════════════════════════════════\nPASAJES DEL CEREBRO — lo más relevante para esta tarea\n═══════════════════════════════════════════════════════════\n${pasajes}` : ""}
${client.aiInstructions ? `\n═══════════════════════════════════════════════════════════\nINSTRUCCIONES OBLIGATORIAS DEL CLIENTE\n═══════════════════════════════════════════════════════════\n${client.aiInstructions}` : ""}`;
  }

  // Sin ADN en esta llamada, la ficha es lo único que hay. Se dice, para
  // que el modelo no rellene los huecos como si supiera. Y se dice la
  // verdad: los pasos de sugerencias del asistente de planificación
  // llaman aquí a propósito, sin gastar el ADN entero, con clientes que SÍ
  // lo tienen; decirles «no tiene ADN conectado» hacía que el modelo
  // desconfiara de una marca perfectamente documentada.
  const conectado = Boolean(client.githubContext || client.githubRepo);
  return `CLIENTE: ${client.name}
${conectado
    ? `AVISO: en esta consulta no viaja el ADN completo del cliente, sólo su ficha.
Trabaja con lo que hay aquí abajo y no inventes cifras, precios ni ofertas
que no estén escritos.`
    : `AVISO: este cliente no tiene ADN conectado desde su repositorio. Trabaja
sólo con lo que hay aquí abajo y no inventes lo que falte.`}
INDUSTRIA: ${client.industry || "N/A"}
DESCRIPCIÓN: ${client.descripcion || "N/A"}
VALORES: ${client.valores || "N/A"}
AUDIENCIA: ${client.audiencia || "N/A"}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "N/A"}
HASHTAGS: ${client.hashtags || "#Panama"}
COMPETENCIA: ${client.competencia || "N/A"}
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}
${client.aiInstructions ? `\nINSTRUCCIONES OBLIGATORIAS DEL CLIENTE:\n${client.aiInstructions}` : ""}`;
}

// ============================================================
// El cerebro del cliente
// ============================================================

/**
 * Lo que el cerebro del cliente le da a una tarea: su ficha técnica, sus
 * cifras y los pasajes de sus notas que responden a `consulta`. `null` si
 * el cliente aún no tiene cerebro o si falla: la generación vuelve entonces
 * al ADN de la ficha, como antes, en vez de romperse.
 */
export async function contextoDelCerebro(clienteId, consulta = "", { presupuesto = 9000, para = "texto", postIds = null } = {}) {
  if (!clienteId) return null;
  try {
    const res = await fetch(`/api/cerebro/${encodeURIComponent(clienteId)}/contexto`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      // `postIds`: para qué publicaciones se pide. Con ellos el servidor apunta qué notas se le dieron a la IA para
      // escribirlas, y así sabe después a qué notas atribuirle un sí o un no del cliente.
      body: JSON.stringify(postIds?.length ? { consulta, para, presupuesto, postIds } : { consulta, para, presupuesto }),
    });
    if (!res.ok) return null;
    const c = await res.json();
    return c?.notas > 0 ? c : null;
  } catch {
    return null;
  }
}

/**
 * Lo que va detrás de la marca de caché en el contexto: los pasajes que
 * esta tanda necesita. Vacío si el cliente no usa el cerebro. Los pasajes
 * de la tanda de sofás no son los de la de hashtags, y por eso se piden
 * por tanda y no una vez para toda la generación.
 */
export async function pasajesDeLaTanda(client, adn, calendar, posts) {
  if (!adn?.cerebro) return "";
  const c = await contextoDelCerebro(client?.dbId || client?.id, consultaDeTanda(calendar, posts), {
    presupuesto: 6000, postIds: (posts ?? []).map((p) => p?.id).filter(Boolean),
  });
  return c?.pasajes ?? "";
}

/** Lo mismo para UNA publicación. */
export async function pasajesDeLaPublicacion(client, adn, calendar, post, day) {
  if (!adn?.cerebro) return "";
  const c = await contextoDelCerebro(client?.dbId || client?.id, consultaDePublicacion(calendar, post, day), {
    presupuesto: 6000, postIds: post?.id ? [post.id] : null,
  });
  return c?.pasajes ?? "";
}

// ============================================================
// El ADN del cliente
// ============================================================

/**
 * Carga el ADN del cliente, del caché o del repositorio.
 *
 * Estaba copiado en cinco sitios con el mismo fallo: `githubContext`
 * ganaba siempre, así que el ADN se congelaba en la primera lectura y no
 * volvía a mirar el repositorio nunca. `forzar` es lo que permite
 * releerlo cuando el repositorio ha cambiado.
 */
export async function loadADN(client, { forzar = false } = {}) {
  // Si el cliente tiene cerebro, manda él: su ficha y sus cifras, sin releer
  // el repositorio. Con `forzar` se sigue leyendo GitHub, que es lo que
  // hace la ficha del cliente para probar la conexión.
  if (!forzar) {
    const cerebro = await contextoDelCerebro(client?.dbId || client?.id);
    if (cerebro && usaElCerebro(cerebro, client)) {
      return { content: textoEstableDelCerebro(cerebro), sections: {}, cacheado: false, cerebro: true, notas: cerebro.notas };
    }
  }
  if (!forzar && client.githubContext) {
    return { content: client.githubContext, sections: {}, cacheado: true };
  }
  if (!client.githubRepo) return { content: "", sections: {}, cacheado: false };
  const result = await fetchGitHubADN(client.githubRepo, client.githubFolder);
  return { ...result, cacheado: false };
}

/**
 * El ADN que recibe el asistente de UN cliente. No es `loadADN`: el chat lo pide en cada mensaje, y `loadADN`
 * puede releer el repositorio de GitHub (decenas de peticiones) cuando el cliente no tiene ADN guardado. Aquí sólo
 * se mira el cerebro —y su respuesta se recuerda un minuto: la ficha no cambia de un mensaje a otro—; sin cerebro,
 * lo que el cliente ya lleva en su ficha, que es lo que el chat usaba antes.
 */
export async function adnParaElChat(client) {
  const id = client?.dbId || client?.id;
  let cerebro = contextoDelChat.leer(id);
  if (cerebro === undefined) {
    cerebro = await contextoDelCerebro(id);
    contextoDelChat.poner(id, cerebro);
  }
  if (cerebro && usaElCerebro(cerebro, client)) return { content: textoEstableDelCerebro(cerebro), cerebro: true };
  return { content: client?.githubContext || "", cerebro: false };
}

// ============================================================
// Chat del asistente por cliente
// ============================================================

/**
 * Una vuelta del asistente, en streaming.
 *
 * El Worker reenvía el texto según se escribe (`onEvento` recibe
 * «texto», «pensando» y «herramienta») y resuelve con el evento «fin»:
 * los `mensajes` que añadió en esta vuelta —se reenvían TAL CUAL en la
 * siguiente, razonamiento con firma incluido— y, si el modelo pidió
 * herramientas del navegador, los resultados de las del servidor que
 * hay que juntar con los de aquí en un mismo mensaje.
 */
// La caché del prompt dura cinco minutos y escribirla cuesta 1,25×: sólo
// se pide cuando la conversación va seguida, que es cuando se va a leer.
const VIDA_CACHE_MS = 4.5 * 60_000;
let ultimaLlamadaChat = 0;

export async function conversarIA({ messages, system, tools, clienteId = null, onEvento = () => {} }) {
  const seguido = Date.now() - ultimaLlamadaChat < VIDA_CACHE_MS;
  ultimaLlamadaChat = Date.now();
  let res;
  try {
    res = await fetch("/api/ia/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system, tools, clienteId, seguido }),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu red.");
  }
  if (!res.ok || !res.body) {
    let data = null;
    try { data = await res.json(); } catch { /* no era JSON */ }
    if (res.status === 401) throw new Error("La sesión caducó. Vuelve a entrar.");
    throw new Error(data?.error || `El asistente respondió ${res.status}.`);
  }

  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let fin = null;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const { eventos, resto } = partirSSE(buffer);
      buffer = resto;
      for (const { datos: ev } of eventos) {
        if (ev.t === "error") throw new Error(ev.mensaje || "No se pudo generar la respuesta.");
        if (ev.t === "fin") fin = ev;
        else onEvento(ev);
      }
    }
  } finally {
    // El medidor de gasto de la cabecera se relee: esta respuesta ya costó.
    window.dispatchEvent(new Event("ia:gasto"));
  }
  if (!fin) throw new Error("La respuesta del asistente se cortó. Inténtalo de nuevo.");
  return fin;
}

/** El resumen guardado de la conversación de un cliente. */
export async function leerResumenChat(clienteId) {
  const res = await fetch(`/api/ia/chat/resumen?cliente=${encodeURIComponent(clienteId)}`, { credentials: "same-origin" });
  if (!res.ok) return { resumen: "", hasta: null };
  return res.json();
}

/** Pliega lo viejo en el resumen si la conversación ya es larga. */
export async function resumirChat(clienteId) {
  const res = await fetch("/api/ia/chat/resumen", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clienteId }),
  });
  if (!res.ok) return null;
  return res.json();
}

export function buildChatSystemPrompt(client, calendar, adnExtra = "", memories = [], cerebro = null) {
  // Con cerebro, el asistente recibe la ficha y las cifras —lo estable— y busca el resto con
  // `buscar_cerebro`: volcarle todo el ADN en cada mensaje era lo que más gastaba.
  const ctx = buildClientContext(client, calendar, adnExtra, cerebro, { maquetacion: true }) +
    (cerebro ? "\n\nPARA MÁS DETALLE de este cliente (precios, personas, límites, lo que se le ha subido) usa la herramienta buscar_cerebro: lo de arriba es sólo su ficha técnica y sus cifras. No digas que no sabes algo sin buscarlo antes." : "");

  let calendarInfo = "";
  if (calendar) {
    // La SEMANA y el DÍA van en cada línea porque es como se pide el
    // trabajo —«los guiones de la semana 2», «pon las 9am los lunes»— y
    // sin ellos el modelo tiene que deducirlos de la fecha, que es
    // justo donde se equivoca. La semana sale de `getWeekNumber`, la
    // misma que numera los conceptos semanales: dos numeraciones
    // distintas para lo mismo sería peor que ninguna.
    const primerDia = (calendar.days || [])[0]?.date;
    const postLines = [];
    for (const day of calendar.days || []) {
      for (const post of day.posts || []) {
        const parts = [`ID:${post.id}`, day.date];
        if (primerDia) parts.push(`semana ${getWeekNumber(day.date, primerDia)}`);
        parts.push(dayName(day.date));
        if (post.format) parts.push(post.format);
        if (post.category) parts.push(post.category);
        parts.push(post.publishTime ? `Hora: ${hora12(post.publishTime)}` : "Hora: sin asignar");
        if (post.idea) parts.push(`Idea: «${post.idea}»`);
        if (post.descripcion) parts.push(`Descripción: «${post.descripcion}»`);
        if (post.guion) parts.push(`Guion: «${post.guion}»`);
        if (post.hashtagsFinales) parts.push(`Hashtags: ${post.hashtagsFinales}`);
        if (post.status && post.status !== "pending") parts.push(`[${post.status}]`);
        postLines.push("  · " + parts.join(" | "));
      }
    }
    const hoy = fechaEnZona();
    calendarInfo = `\nHOY: ${hoy} (${nombreDelDia(hoy)}), hora de Panamá.
CALENDARIO SELECCIONADO: ${calendar.name || "Sin nombre"}
MES: ${(calendar.month ?? 0) + 1}/${calendar.year}${Number.isInteger(calendar.month) && calendar.year ? `
DÍAS DE ESTE MES POR DÍA DE LA SEMANA (úsalo tal cual; no calcules el día de la semana de una fecha):
${diasPorSemanaDelMes({ year: calendar.year, month: calendar.month })}
Puedes crear publicaciones en CUALQUIER día de este mes, tenga ya publicaciones o no.` : ""}
CAMPAÑA: ${calendar.campaign || "N/A"}
CONCEPTOS SEMANALES: ${(calendar.weekConcepts || []).join(", ") || "N/A"}${
  calendar.offers ? `\nOFERTAS: ${calendar.offers}` : ""
}${calendar.promoCode ? `\nCÓDIGO PROMOCIONAL: ${calendar.promoCode}` : ""}
PUBLICACIONES (${postLines.length}):
${postLines.length ? postLines.join("\n") : "  (vacío)"}`;
  }

  let memoriesBlock = "";
  if (memories.length > 0) {
    memoriesBlock = `\n\n═══════════════════════════════════════════════════════════
MEMORIAS GUARDADAS DE ESTE CLIENTE
═══════════════════════════════════════════════════════════
${memories.map((m) => `· ${m.content}`).join("\n")}

Usa estas memorias como contexto para personalizar tus respuestas.
Si el usuario te pide que recuerdes algo nuevo, usa la herramienta guardar_memoria.
Si te pide olvidar algo, usa borrar_memoria con el contenido exacto.`;
  }

  return `Eres el asistente de contenido de la agencia Juancito Ads, dedicado al cliente «${client.name}».

QUIÉN ERES:
· Un estratega de redes sociales y redactor creativo.
· Conoces a este cliente a fondo: su marca, su tono, su audiencia.
· Cuando escribes contenido, lo entregas listo para publicar.
· TIENES DELANTE EL CALENDARIO ENTERO, más abajo: cada publicación con su fecha,
  su semana, su día, su hora, su idea, su descripción, su guion y sus hashtags.
  Cuando te pidan leer, listar, resumir o reportar algo de él —«pásame los guiones
  de la semana 2», «qué posts están sin descripción», «qué llevo aprobado»—,
  respóndelo con esos datos. NO digas que no puedes: lo tienes escrito abajo.
· Puedes ejecutar acciones sobre el calendario: crear, editar y eliminar publicaciones.
· Puedes poner la HORA de publicación, de una en una o a muchas a la vez.
· Puedes editar en lote: cambiar descripciones, guiones o ideas de múltiples publicaciones filtradas por día, formato o semana.
· Puedes guardar preferencias y datos importantes en tu memoria para recordarlos después.
· Puedes crear tareas para el cliente con crear_tarea.
· Puedes añadir ideas al banco de ideas del cliente con agregar_banco_ideas.
· Puedes GENERAR IMÁGENES con IA usando generar_imagen. La imagen se ENTREGA AQUÍ MISMO, en el
  chat, y el usuario la descarga en el tamaño que pidió. Úsala siempre que te pidan una imagen,
  sea o no para una publicación. Si además piden ponerla en una publicación, pasa su post_id.
  No escribas la clave ni un enlace: la imagen aparece sola debajo de tu mensaje.
· Puedes ver las imágenes y los videos que el usuario te adjunte y crear contenido basado en ellos.

${ctx}
${calendarInfo}${memoriesBlock}

${INSTRUCCION_PIEZAS}

${INSTRUCCION_ADJUNTOS}

CÓMO DEBES RESPONDER:
· En español de Panamá, con tildes y signos de apertura (¿, ¡).
· Conciso y directo. Sin preámbulos innecesarios.
· Si generas una descripción o guion, escríbelo listo para copiar y pegar, en su bloque de pieza.
· Si necesitas más información, pregúntala en vez de inventar.
· No inventes datos, precios, testimonios ni cifras que no estén en el contexto.
· Cuando te pidan CONSULTAR el calendario, contesta directamente leyendo el listado
  de abajo. Cita el ID de cada publicación para que el usuario pueda pedirte cambios
  sobre ella, y respeta la semana y el día tal como aparecen ahí.
· Cuando el usuario pida acciones sobre el calendario (crear, editar, eliminar publicaciones),
  usa las herramientas disponibles. Confirma lo que vas a hacer antes de ejecutar acciones destructivas.
· Para poner la misma hora a varias publicaciones, usa editar_publicaciones_lote con
  un filtro y aplicar_a_todas, no una llamada por publicación.
· Cuando el usuario confirme una preferencia o dato que debas recordar, guárdalo con guardar_memoria.`;
}

export function getChatTools(hasCalendar) {
  const tools = [
    {
      name: "guardar_memoria",
      description: "Guarda una preferencia, instrucción o dato importante del cliente para recordarlo en futuras conversaciones. Úsala cuando el usuario confirme algo que quiere que recuerdes siempre.",
      input_schema: {
        type: "object",
        properties: {
          contenido: {
            type: "string",
            description: "La frase a recordar, breve y concreta. Ej: «Nunca usar emojis de fuego», «El horario de publicación es 9am y 6pm», «Prefiere un tono formal».",
          },
        },
        required: ["contenido"],
      },
    },
    {
      name: "borrar_memoria",
      description: "Elimina una memoria guardada que ya no aplica o que el usuario pide olvidar.",
      input_schema: {
        type: "object",
        properties: {
          contenido: {
            type: "string",
            description: "El contenido exacto de la memoria a eliminar.",
          },
        },
        required: ["contenido"],
      },
    },
  ];

  tools.push(
    {
      name: "crear_tarea",
      description: "Crea una tarea para el cliente actual. Útil cuando el usuario menciona algo pendiente, un entregable o un paso que debe recordar.",
      input_schema: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título de la tarea." },
          descripcion: { type: "string", description: "Descripción o detalle de la tarea (opcional)." },
          ...PROPIEDADES_FECHA_TAREA,
          asignada_a: { type: "string", description: "Nombre de la persona asignada (opcional)." },
        },
        required: ["titulo"],
      },
    },
    {
      name: "agregar_banco_ideas",
      description: "Añade una idea al banco de ideas del cliente. El banco es una lista de publicaciones guardadas para usar después.",
      input_schema: {
        type: "object",
        properties: {
          idea: { type: "string", description: "Concepto de la publicación." },
          formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Formato sugerido." },
          descripcion: { type: "string", description: "Caption/descripción sugerida (opcional)." },
          guion: { type: "string", description: "Guion sugerido (opcional)." },
        },
        required: ["idea"],
      },
    },
  );

  if (hasCalendar) {
    tools.push(
      {
        name: "crear_publicacion",
        description: "Crea una nueva publicación en un día del calendario (AAAA-MM-DD). El día NO tiene que tener publicaciones ya: cualquier día del mes vale. Si la fecha es de otro mes, se crea en el calendario de ese mes. Para varias, llámala una vez por publicación.",
        input_schema: {
          type: "object",
          properties: {
            fecha: { type: "string", description: "Fecha en formato AAAA-MM-DD." },
            formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Formato de la publicación." },
            idea: { type: "string", description: "Idea o concepto de la publicación." },
            descripcion: { type: "string", description: "Caption/descripción lista para publicar." },
            guion: { type: "string", description: "Guion para reels, carruseles, historias o lives." },
            hora: { type: "string", description: "Hora de publicación. Se entiende «9am», «9:00», «21:30» o «6 pm»." },
          },
          required: ["fecha", "formato"],
        },
      },
      {
        name: "editar_publicacion",
        description: "Edita campos de una publicación existente. Necesitas el ID de la publicación (visible en el contexto del calendario).",
        input_schema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "ID de la publicación a editar." },
            idea: { type: "string", description: "Nueva idea." },
            descripcion: { type: "string", description: "Nueva descripción/caption." },
            guion: { type: "string", description: "Nuevo guion." },
            formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Nuevo formato." },
            hora: { type: "string", description: "Hora de publicación. Se entiende «9am», «9:00», «21:30» o «6 pm». Escribe «quitar» para dejarla sin asignar." },
          },
          required: ["post_id"],
        },
      },
      {
        name: "eliminar_publicaciones",
        description: "Elimina una o varias publicaciones del calendario. Pide confirmación al usuario antes de usar esta herramienta.",
        input_schema: {
          type: "object",
          properties: {
            post_ids: {
              type: "array",
              items: { type: "string" },
              description: "Lista de IDs de las publicaciones a eliminar.",
            },
          },
          required: ["post_ids"],
        },
      },
      {
        name: "editar_publicaciones_lote",
        description: "Edita muchas publicaciones a la vez. Dos formas, y se pueden combinar: `aplicar_a_todas` pone los MISMOS valores en todas las que pasen el filtro —para «pon las 9am a todos los lunes» o «marca como aprobados todos los reels»—, y `cambios` da valores DISTINTOS a cada publicación por su ID —para reescribir textos, que son diferentes en cada una—.",
        input_schema: {
          type: "object",
          properties: {
            filtro_dia: {
              type: "string",
              enum: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
              description: "Filtrar por día de la semana (opcional).",
            },
            filtro_formato: {
              type: "string",
              enum: ["post", "reel", "carrusel", "historia", "live"],
              description: "Filtrar por formato (opcional).",
            },
            filtro_semana: {
              type: "integer",
              description: "Filtrar por número de semana del mes, tal como aparece en el contexto (opcional).",
            },
            aplicar_a_todas: {
              type: "object",
              properties: {
                hora: { type: "string", description: "Hora de publicación: «9am», «9:00», «21:30», «6 pm». Escribe «quitar» para dejarla sin asignar." },
                formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Formato para todas." },
              },
              description: "Los MISMOS valores para todas las publicaciones que pasen el filtro. Requiere al menos un filtro: sin filtro no se aplica nada, para no tocar el mes entero por accidente.",
            },
            cambios: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  post_id: { type: "string", description: "ID de la publicación." },
                  idea: { type: "string", description: "Nueva idea." },
                  descripcion: { type: "string", description: "Nueva descripción/caption." },
                  guion: { type: "string", description: "Nuevo guion." },
                  hora: { type: "string", description: "Hora de publicación para esta publicación en concreto." },
                },
                required: ["post_id"],
              },
              description: "Valores distintos para cada publicación, por ID. Para textos, que no se repiten.",
            },
          },
        },
      },
    );
  }

  // Fuera del `if`: una imagen para el chat no necesita calendario.
  tools.push({
    name: "generar_imagen",
    description: "Genera una imagen con IA y la ENTREGA EN EL CHAT, donde el usuario la ve y la descarga en el tamaño pedido. Úsala siempre que pidan una imagen. Si también piden ponerla en una publicación del calendario, pasa post_id.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Descripción detallada de lo que debe mostrar la imagen: sujeto, composición, estilo, colores, luz y, si lo piden, el texto exacto que debe llevar." },
        formato_imagen: {
          type: "string",
          enum: ["square", "vertical", "story", "horizontal"],
          description: "Tamaño: square (1080×1080, post), vertical (1080×1350, post de feed alto), story (1080×1920, historia o reel), horizontal (1200×630, portada o anuncio web). Elige el que corresponda a lo que pidan; por defecto square.",
        },
        post_id: { type: "string", description: "ID de una publicación del calendario a la que además asignarla (opcional)." },
      },
      required: ["prompt"],
    },
  });

  return tools;
}

