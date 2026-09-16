// ============================================================
// El asistente — el puerto de supabase/functions/ai-chat
//
// Ésta es la función que corrió semanas con código que no estaba en
// ningún commit, porque el workflow sólo desplegaba `ai` y `github-adn`.
// El síntoma no se parecía a la causa: campos que faltaban, respuestas
// recortadas, y un diff limpio. En Cloudflare ese desajuste desaparece
// por construcción —`wrangler deploy` sube el Worker entero, no carpeta
// por carpeta—, pero la lección se queda escrita.
//
// `thinking: disabled` va fijo y no es un descuido: el asistente
// responde sobre un calendario que ya existe. Razonar aquí se paga del
// mismo max_tokens que el texto y devuelve respuestas vacías con
// stop_reason «max_tokens».
// ============================================================

import { json, error, cuerpo } from "../lib/respuesta.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_TOKENS = 8192;
const PRESUPUESTO_MS = 120_000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function rutaChat(req, env) {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_BODY_BYTES) return error("La petición es demasiado grande", 413);

  const body = await cuerpo(req);
  if (!body) return error("JSON inválido");

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return error("Falta el historial de mensajes");
  }
  for (const m of messages) {
    if (!m || typeof m !== "object") return error("Mensaje inválido");
    if (m.role !== "user" && m.role !== "assistant") return error("Rol de mensaje inválido");
    if (typeof m.content !== "string" && !Array.isArray(m.content)) {
      return error("Contenido de mensaje inválido");
    }
    if (typeof m.content === "string" && !m.content.trim()) {
      return error("Contenido de mensaje vacío");
    }
  }

  const system = typeof body.system === "string" ? body.system : "";
  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 4096, 256), MAX_TOKENS);
  const tools = Array.isArray(body.tools) ? body.tools : undefined;
  const modelo = env.AI_CHAT_MODEL || "claude-sonnet-5";

  if (!env.ANTHROPIC_API_KEY) {
    return error("El servidor no tiene configurada la clave de Anthropic", 503);
  }

  const arranque = Date.now();
  const restante = () => PRESUPUESTO_MS - (Date.now() - arranque);

  for (let intento = 0; intento <= 1; intento++) {
    const ms = restante();
    if (ms <= 3_000) return error("Tiempo agotado.", 504);

    const abortar = new AbortController();
    const reloj = setTimeout(() => abortar.abort(), ms);

    const peticion = {
      model: modelo,
      max_tokens: maxTokens,
      messages,
      thinking: { type: "disabled" },
    };
    if (system) peticion.system = system;
    if (tools?.length) peticion.tools = tools;

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: abortar.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(peticion),
      });
    } catch (e) {
      clearTimeout(reloj);
      if (abortar.signal.aborted) return error("Tiempo agotado.", 504);
      if (intento < 1 && restante() > 10_000) { await dormir(2000); continue; }
      return error("No se pudo contactar con el proveedor de IA", 502, e);
    }
    clearTimeout(reloj);

    if ((res.status === 429 || res.status >= 500) && intento < 1 && restante() > 10_000) {
      await dormir(2000);
      continue;
    }

    if (!res.ok) {
      console.error("chat: error", res.status, await res.text().catch(() => ""));
      const msg = res.status === 429
        ? "El asistente está saturado. Inténtalo en unos segundos."
        : res.status === 401 || res.status === 403
          ? "La clave de IA del servidor no es válida."
          : "El proveedor de IA devolvió un error.";
      return error(msg, res.status === 429 ? 429 : 502);
    }

    const data = await res.json();
    // Todos los bloques, no el primero: basta uno de pensamiento por
    // delante para que `find` devuelva undefined y el texto llegue vacío.
    const bloques = Array.isArray(data?.content) ? data.content : [];
    const text = bloques.filter((b) => b?.type === "text").map((b) => b?.text ?? "").join("");

    return json({
      content: data?.content ?? [],
      text,
      model: modelo,
      stopReason: data?.stop_reason ?? "end_turn",
    });
  }

  return error("No se pudo generar la respuesta", 502);
}
