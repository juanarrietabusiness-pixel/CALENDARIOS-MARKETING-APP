// ============================================================
// Proxy de IA — Chat conversacional
//
// Recibe un historial de mensajes y un prompt de sistema con el
// contexto del cliente. Devuelve la respuesta del asistente.
//
// Usa el mismo modelo rápido que el lote (`AI_MODEL`, Haiku 4.5
// por defecto). El pensamiento se apaga: la conversación es
// pregunta–respuesta, no razonamiento largo.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL = Deno.env.get("AI_MODEL") || "claude-haiku-4-5-20251001";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((o) => o.trim()).filter(Boolean);

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TOKENS = 4096;
const PRESUPUESTO_MS = 60_000;

function corsHeaders(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin || "*";
  }
  return headers;
}

function json(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, headers);

  // ── Sesión ──
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "No autenticado" }, 401, headers);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "Sesión inválida o caducada" }, 401, headers);
  }

  // ── Petición ──
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return json({ error: "La petición es demasiado grande" }, 413, headers);
  }

  let body: { messages?: unknown[]; system?: string; maxTokens?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400, headers);
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "Falta el historial de mensajes" }, 400, headers);
  }

  // Validar estructura mínima de cada mensaje.
  for (const m of messages) {
    if (!m || typeof m !== "object") return json({ error: "Mensaje inválido" }, 400, headers);
    const msg = m as { role?: string; content?: string };
    if (msg.role !== "user" && msg.role !== "assistant") {
      return json({ error: "Rol de mensaje inválido" }, 400, headers);
    }
    if (typeof msg.content !== "string" || !msg.content.trim()) {
      return json({ error: "Contenido de mensaje vacío" }, 400, headers);
    }
  }

  const system = typeof body?.system === "string" ? body.system : "";
  const maxTokens = Math.min(Math.max(Number(body?.maxTokens) || 2048, 256), MAX_TOKENS);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "El servidor no tiene configurada la clave de Anthropic" }, 503, headers);
  }

  // ── Llamada con un reintento ──
  const arranque = Date.now();
  const restante = () => PRESUPUESTO_MS - (Date.now() - arranque);

  for (let attempt = 0; attempt <= 1; attempt++) {
    const ms = restante();
    if (ms <= 3_000) {
      return json({ error: "Tiempo agotado." }, 504, headers);
    }

    const abortar = new AbortController();
    const reloj = setTimeout(() => abortar.abort(), ms);

    const apiBody: Record<string, unknown> = {
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages,
      thinking: { type: "disabled" },
    };
    if (system) apiBody.system = system;

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: abortar.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(apiBody),
      });
    } catch (e) {
      clearTimeout(reloj);
      if (abortar.signal.aborted) {
        return json({ error: "Tiempo agotado." }, 504, headers);
      }
      if (attempt < 1 && restante() > 10_000) {
        await sleep(2000);
        continue;
      }
      console.error("ai-chat: fallo de red:", e);
      return json({ error: "No se pudo contactar con el proveedor de IA" }, 502, headers);
    }
    clearTimeout(reloj);

    if ((res.status === 429 || res.status >= 500) && attempt < 1 && restante() > 10_000) {
      await sleep(2000);
      continue;
    }

    if (!res.ok) {
      console.error("ai-chat: error", res.status, await res.text().catch(() => ""));
      const msg = res.status === 429
        ? "El asistente está saturado. Inténtalo en unos segundos."
        : res.status === 401 || res.status === 403
          ? "La clave de IA del servidor no es válida."
          : "El proveedor de IA devolvió un error.";
      return json({ error: msg }, res.status === 429 ? 429 : 502, headers);
    }

    const data = await res.json();
    const bloques: { type?: string; text?: string }[] =
      Array.isArray(data?.content) ? data.content : [];
    const text = bloques
      .filter((b) => b?.type === "text")
      .map((b) => b?.text ?? "")
      .join("");

    return json({ text, model: ANTHROPIC_MODEL }, 200, headers);
  }

  return json({ error: "No se pudo generar la respuesta" }, 502, headers);
});
