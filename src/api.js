
export async function callAI(apiKey, content, { retries = 2 } = {}) {
  if (!apiKey) throw new Error("API key no configurada");

  const isGroq = apiKey.startsWith("gsk_");

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let res;
      if (isGroq) {
        let msgContent = content;
        if (Array.isArray(content)) {
          msgContent = content.filter((b) => b.type === "text").map((b) => ({ type: "text", text: b.text }));
        }
        res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 2048,
            messages: [{ role: "user", content: msgContent }],
          }),
        });
      } else {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2048,
            messages: [{ role: "user", content }],
          }),
        });
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const wait = Math.pow(2, attempt + 1) * 1000;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || "Error " + res.status);
      }

      const data = await res.json();
      if (isGroq) {
        return data.choices?.[0]?.message?.content || "";
      }
      if (data.error) throw new Error(data.error.message);
      return data.content?.find((b) => b.type === "text")?.text || "";
    } catch (e) {
      if (attempt < retries && (e.message.includes("429") || e.message.includes("500") || e.message.includes("fetch"))) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
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

export async function fetchGitHubADN(repoUrl, token) {
  if (!repoUrl) return "";
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return "";
  const [, owner, repo] = match;
  const headers = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = "token " + token;

  const paths = ["", "adn/"];
  const files = [];

  for (const path of paths) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo.replace(/\.git$/, "")}/contents/${path}`, { headers });
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item.type === "file" && /\.(md|txt)$/i.test(item.name) && item.size < 50000) {
          files.push(item);
        }
      }
    } catch { /* skip */ }
  }

  let adnContent = "";
  for (const file of files.slice(0, 5)) {
    try {
      const res = await fetch(file.download_url);
      if (res.ok) {
        const text = await res.text();
        adnContent += `\n--- ${file.name} ---\n${text.slice(0, 3000)}\n`;
      }
    } catch { /* skip */ }
  }
  return adnContent;
}

export async function generateSinglePost(apiKey, client, post, day, calendar) {
  const isPost = post.format === "post";
  let adnExtra = client.githubContext || "";
  if (!adnExtra && client.githubRepo) {
    adnExtra = await fetchGitHubADN(client.githubRepo, client.githubToken);
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

  const txt = await callAI(apiKey, content, { retries: 2 });

  const guionMatch = txt.match(/GUION:\s*([\s\S]*?)(?=DESCRIPCION:|HASHTAGS_FINALES:|$)/i);
  const descMatch = txt.match(/DESCRIPCION:\s*([\s\S]*?)(?=GUION:|HASHTAGS_FINALES:|$)/i);
  const hashMatch = txt.match(/HASHTAGS_FINALES:\s*([\s\S]*?)(?=GUION:|DESCRIPCION:|$)/i);

  return {
    guion: guionMatch ? guionMatch[1].trim() : "",
    descripcion: descMatch ? descMatch[1].trim() : (isPost ? txt.trim() : ""),
    hashtagsFinales: hashMatch ? hashMatch[1].trim() : "",
  };
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
