
export async function callAI(apiKey, content) {
  if (!apiKey) throw new Error("API key no configurada");

  const isGroq = apiKey.startsWith("gsk_");

  if (isGroq) {
    let msgContent = content;
    if (Array.isArray(content)) {
      msgContent = content.filter((b) => b.type === "text").map((b) => ({ type: "text", text: b.text }));
    }
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2048,
        messages: [{ role: "user", content: msgContent }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || "Error " + res.status);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
  if (!res.ok) throw new Error("Error " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.find((b) => b.type === "text")?.text || "";
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
