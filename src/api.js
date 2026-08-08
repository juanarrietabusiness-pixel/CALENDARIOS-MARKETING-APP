import { supabase, isSupabaseEnabled } from "./lib/supabase";

/**
 * Llama a una función del servidor.
 *
 * Las claves de IA y el token de GitHub viven en los secretos del
 * proyecto: el navegador nunca las ve. supabase-js adjunta el token de
 * la sesión, así que las funciones pueden exigir que haya una.
 *
 * El error útil viene en el cuerpo de la respuesta, no en `error.message`
 * (que sólo dice «non-2xx status code»), de ahí la lectura de `context`.
 */
async function invokeFunction(name, body) {
  if (!isSupabaseEnabled) {
    throw new Error("El servidor de IA no está configurado en este despliegue.");
  }

  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let mensaje = "";
    try {
      mensaje = (await error.context?.json())?.error ?? "";
    } catch {
      /* la respuesta no era JSON */
    }
    throw new Error(mensaje || "No se pudo contactar con el servidor.");
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
export async function callAI(content, { maxTokens } = {}) {
  const data = await invokeFunction("ai", { content, maxTokens });
  return data?.text ?? "";
}

export function parseAIResponse(rawText) {
  const results = {};
  const blocks = rawText.split(/<<<PUBLICACION_ID:/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const idEnd = block.indexOf(">>>");
    if (idEnd === -1) continue;
    const id = block.slice(0, idEnd).trim();
    let rest = block.slice(idEnd + 3);
    const nextBlock = rest.indexOf("<<<PUBLICACION_ID:");
    if (nextBlock !== -1) rest = rest.slice(0, nextBlock);

    const guionMatch = rest.match(/GUION:\s*([\s\S]*?)(?=DESCRIPCION:|HASHTAGS_FINALES:|<<<|$)/i);
    const descMatch = rest.match(/DESCRIPCION:\s*([\s\S]*?)(?=GUION:|HASHTAGS_FINALES:|<<<|$)/i);
    const hashMatch = rest.match(/HASHTAGS_FINALES:\s*([\s\S]*?)(?=GUION:|DESCRIPCION:|<<<|$)/i);

    const guion = guionMatch ? guionMatch[1].trim() : "";
    const descripcion = descMatch ? descMatch[1].trim() : "";
    const hashtagsFinales = hashMatch ? hashMatch[1].trim() : "";

    if (guion || descripcion || hashtagsFinales) {
      results[id] = { guion, descripcion, hashtagsFinales };
    }
  }
  return results;
}

export function buildScriptPrompt(client, calendar, posts, adnExtra = "") {
  const ctx = buildClientContext(client, calendar, adnExtra);
  const postsList = posts.map((p) => {
    const formatRules = {
      post: "Solo DESCRIPCION (caption con emojis, CTA y hashtags). No escribas GUION.",
      reel: "GUION (escena por escena: Hook → Desarrollo → CTA) + DESCRIPCION (caption para la publicación) + HASHTAGS_FINALES",
      carrusel: "GUION (texto por cada card/slide, separados por ---) + DESCRIPCION (caption) + HASHTAGS_FINALES",
      historia: "GUION (nota breve, max 2 oraciones) + DESCRIPCION (texto overlay si aplica) + HASHTAGS_FINALES",
      live: "GUION (puntos clave a cubrir en el live, formato bullet) + DESCRIPCION (caption de anuncio del live) + HASHTAGS_FINALES",
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

ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "Natural y profesional"}
WHATSAPP: ${client.whatsapp || "N/A"}
HASHTAGS BASE: ${client.hashtags || "#Panama"}
CAMPAÑA: ${calendar?.campaign || "N/A"}

---

INSTRUCCIONES:
Genera el contenido para CADA publicación listada abajo.
Respeta el formato de salida EXACTAMENTE.
Cada publicación va delimitada por <<<PUBLICACION_ID:xxx>>> con su ID correspondiente.

REGLAS POR FORMATO:
- post: Solo DESCRIPCION (caption con emojis + CTA + hashtags). NO incluir GUION.
- reel: GUION (Hook → Desarrollo → CTA, escena por escena) + DESCRIPCION + HASHTAGS_FINALES
- carrusel: GUION (texto por card, separados por ---) + DESCRIPCION + HASHTAGS_FINALES
- historia: GUION (nota breve) + DESCRIPCION + HASHTAGS_FINALES
- live: GUION (bullet points del live) + DESCRIPCION + HASHTAGS_FINALES

FORMATO DE RESPUESTA OBLIGATORIO:
<<<PUBLICACION_ID:id_del_post>>>
GUION:
(contenido del guión aquí, o vacío si es post)
DESCRIPCION:
(caption/descripción aquí)
HASHTAGS_FINALES:
(hashtags finales aquí)

---

PUBLICACIONES A GENERAR:
${postsList}`;
}

export function parseGitHubUrl(url) {
  if (!url) return null;
  const treeMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+\/(.+)/);
  if (treeMatch) {
    return { owner: treeMatch[1], repo: treeMatch[2].replace(/\.git$/, ""), folder: treeMatch[3].replace(/\/$/, "") };
  }
  const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (repoMatch) {
    return { owner: repoMatch[1], repo: repoMatch[2].replace(/\.git$/, ""), folder: "" };
  }
  return null;
}

/**
 * Lee el ADN de marca del repositorio del cliente.
 *
 * Ya no recibe token: el de GitHub es uno solo del servidor. Antes cada
 * cliente guardaba el suyo en el navegador y acababa dentro del JSON de
 * «Exportar».
 */
export async function fetchGitHubADN(repoUrl, folder = "") {
  if (!parseGitHubUrl(repoUrl)) {
    return { content: "", files: [], subfolders: [] };
  }
  return await invokeFunction("github-adn", { repoUrl, folder });
}

export async function generateSinglePost(client, post, day, calendar) {
  const isPost = post.format === "post";
  let adnExtra = client.githubContext || "";
  if (!adnExtra && client.githubRepo) {
    const result = await fetchGitHubADN(client.githubRepo, client.githubFolder);
    adnExtra = result.content;
  }
  const ctx = buildClientContext(client, calendar, adnExtra);

  const formatRules = {
    post: `DESCRIPCION: caption completo con emojis, CTA a WhatsApp (${client.whatsapp || "N/A"}) y hashtags (${client.hashtags || "#Panama"})`,
    reel: `GUION:\nHook (0-3s): ...\nDesarrollo (3-20s): ...\nCTA final: ...\n\nDESCRIPCION: caption para Instagram con emojis y CTA\n\nHASHTAGS_FINALES: hashtags relevantes`,
    carrusel: `GUION:\nPortada: ...\nSlide 1: ...\nSlide 2: ...\nCTA: ...\n\nDESCRIPCION: caption para Instagram con emojis y CTA\n\nHASHTAGS_FINALES: hashtags relevantes`,
    historia: `GUION: nota breve de que cubrir\n\nDESCRIPCION: texto overlay si aplica\n\nHASHTAGS_FINALES: hashtags relevantes`,
    live: `GUION: bullet points del live\n\nDESCRIPCION: caption de anuncio del live\n\nHASHTAGS_FINALES: hashtags relevantes`,
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
  if (post.image) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: post.image.includes(",") ? post.image.split(",")[1] : post.image,
      },
    });
    promptText = `Basandote en la imagen adjunta y el siguiente contexto:\n\n${promptText}`;
  }
  content.push({ type: "text", text: promptText });

  const txt = await callAI(content);

  const guionMatch = txt.match(/GUION:\s*([\s\S]*?)(?=DESCRIPCION:|HASHTAGS_FINALES:|$)/i);
  const descMatch = txt.match(/DESCRIPCION:\s*([\s\S]*?)(?=GUION:|HASHTAGS_FINALES:|$)/i);
  const hashMatch = txt.match(/HASHTAGS_FINALES:\s*([\s\S]*?)(?=GUION:|DESCRIPCION:|$)/i);

  return {
    guion: guionMatch ? guionMatch[1].trim() : "",
    descripcion: descMatch ? descMatch[1].trim() : (isPost ? txt.trim() : ""),
    hashtagsFinales: hashMatch ? hashMatch[1].trim() : "",
  };
}

export async function generateFieldForPost(client, post, day, calendar, field) {
  let adnExtra = client.githubContext || "";
  if (!adnExtra && client.githubRepo) {
    const result = await fetchGitHubADN(client.githubRepo, client.githubFolder);
    adnExtra = result.content;
  }
  const ctx = buildClientContext(client, calendar, adnExtra);
  let promptText = "";

  if (field === "idea") {
    promptText = `${ctx}
CAMPANA: ${calendar?.campaign || "N/A"}
SEMANA: ${day.concept || "N/A"}
CATEGORIA: ${day.category || post.category || "N/A"}
FORMATO: ${post.format}
FECHA: ${day.date} (${day.dayName || ""})

Genera UNA idea creativa y concreta para una publicacion de ${post.format} para este cliente.
La idea debe ser especifica, accionable y alineada con la marca, la categoria y el concepto semanal.
Responde SOLO con la idea, sin preambulos ni explicaciones. Maximo 2 oraciones.`;
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
Incluye emojis, CTA a WhatsApp (${client.whatsapp || "N/A"}) y hashtags (${client.hashtags || "#Panama"}).
Responde SOLO con la descripcion/caption, sin preambulos.`;
  }

  const content = [{ type: "text", text: promptText }];
  return await callAI(content);
}

export async function extractClientADN(repoContent) {
  const promptText = `Analiza el siguiente contenido de un repositorio de GitHub de un cliente y extrae la informacion para llenar su perfil de agencia de marketing.

CONTENIDO DEL REPOSITORIO:
${repoContent}

Responde UNICAMENTE con un JSON valido con esta estructura exacta, sin texto adicional:
{"nombre":"","industria":"","descripcion":"","valores":"","audiencia":"","competencia":"","estiloGuion":"","estiloLocucion":"","hashtags":"","whatsapp":"","instagram":"","sucursales":"","notasInspeccion":""}

Si no encuentras informacion para un campo, dejalo como string vacio.
No inventes datos que no esten en el contenido.`;

  const content = [{ type: "text", text: promptText }];
  const raw = await callAI(content);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No se pudo parsear la respuesta de IA");
  return JSON.parse(jsonMatch[0]);
}

export function buildClientContext(client, calendar, adnExtra = "") {
  return `CLIENTE: ${client.name}
INDUSTRIA: ${client.industry || "N/A"}
DESCRIPCIÓN: ${client.descripcion || "N/A"}
VALORES: ${client.valores || "N/A"}
AUDIENCIA: ${client.audiencia || "N/A"}
ESTILO DE GUIONES: ${client.estiloGuion || "Cercano, persuasivo, con emojis y CTA"}
ESTILO DE LOCUCIÓN: ${client.estiloLocucion || "N/A"}
HASHTAGS: ${client.hashtags || "#Panama"}
COMPETENCIA: ${client.competencia || "N/A"}
${calendar?.campaign ? `CAMPAÑA DEL MES: ${calendar.campaign}` : ""}
${adnExtra ? `\nCONTEXTO ADICIONAL DEL CLIENTE:\n${adnExtra}` : ""}`;
}
