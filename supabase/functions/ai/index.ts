// ============================================================
// Proxy de IA
//
// Antes el navegador llamaba a Anthropic y Groq directamente con la
// clave del usuario guardada en localStorage. Aquí las claves viven en
// los secretos del proyecto y el navegador sólo envía el contenido.
//
// Por qué aquí y no en una función de Netlify: Netlify corta a los 10 s
// (26 s en Pro) y un lote de 6 publicaciones con Anthropic tarda unos
// 40 s. El margen aquí es de 150 s en el plan gratuito. El límite de
// 2 s de CPU no aplica: esperar al proveedor es E/S asíncrona.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// SUPABASE_URL y SUPABASE_ANON_KEY los inyecta la plataforma.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const AI_PROVIDER = (Deno.env.get("AI_PROVIDER") ?? "").trim().toLowerCase();

// Modelo configurable: Haiku es rápido y barato para generar en lote.
// Para textos más cuidados, poner AI_MODEL=claude-sonnet-5.
const ANTHROPIC_MODEL = Deno.env.get("AI_MODEL") || "claude-haiku-4-5-20251001";

// El prompt maestro de Meta AI no es una tarea de lote: lleva los cortes
// de línea del titular, el tramo acentuado y la verificación de que
// ninguna cifra se sale del ADN. Haiku hace bien los captions y falla
// esto, así que la app pide «calidad» y aquí se traduce a un modelo.
// La lista es cerrada a propósito: el navegador no elige un modelo
// arbitrario ni puede pedir uno que no se quiera pagar.
const MODEL_TIERS: Record<string, string> = {
  rapido: ANTHROPIC_MODEL,
  calidad: Deno.env.get("AI_MODEL_CALIDAD") || "claude-sonnet-5",
};
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((o) => o.trim()).filter(Boolean);

const MAX_BODY_BYTES = 5 * 1024 * 1024; // las publicaciones llevan imágenes en base64
// Un prompt maestro de 12 piezas —con titular, cortes, prompt de fondo,
// descripción y hashtags por pieza— no cabe en 4096 tokens: se cortaba a
// media pieza y el HTML salía incompleto.
const MAX_TOKENS_CAP = 32_000;

function corsHeaders(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  // Sin lista configurada (desarrollo) se refleja el origen.
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin || "*";
  }
  return headers;
}

function json(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bloques de texto solamente: Groq no acepta imágenes en este modelo. */
function textOnly(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  return content
    .filter((b) => b && typeof b === "object" && (b as { type?: string }).type === "text")
    .map((b) => ({ type: "text", text: (b as { text?: string }).text ?? "" }));
}

async function callAnthropic(content: unknown, maxTokens: number, model: string) {
  return await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });
}

async function callGroq(content: unknown, maxTokens: number) {
  return await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: textOnly(content) }],
    }),
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, headers);

  // ---- Sesión ----
  // `verify_jwt` sólo comprueba que el token esté firmado por el proyecto,
  // y la clave anónima también lo está: no basta. getUser() confirma que
  // detrás hay una sesión de verdad.
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

  // ---- Petición ----
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return json({ error: "La petición es demasiado grande" }, 413, headers);
  }

  let body: { content?: unknown; maxTokens?: unknown; tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400, headers);
  }

  const content = body?.content;
  if (!content || (typeof content !== "string" && !Array.isArray(content))) {
    return json({ error: "Falta el contenido de la petición" }, 400, headers);
  }
  const maxTokens = Math.min(Math.max(Number(body?.maxTokens) || 2048, 256), MAX_TOKENS_CAP);
  const tier = String(body?.tier ?? "rapido");
  const model = MODEL_TIERS[tier] ?? MODEL_TIERS.rapido;

  // ---- Proveedor ----
  const useGroq = AI_PROVIDER === "groq"
    ? true
    : AI_PROVIDER === "anthropic"
      ? false
      : !ANTHROPIC_API_KEY && Boolean(GROQ_API_KEY);

  if (useGroq && !GROQ_API_KEY) {
    return json({ error: "El servidor no tiene configurada la clave de Groq" }, 503, headers);
  }
  if (!useGroq && !ANTHROPIC_API_KEY) {
    return json({ error: "El servidor no tiene configurada la clave de Anthropic" }, 503, headers);
  }

  // ---- Llamada con reintentos ----
  const retries = 2;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = useGroq
        ? await callGroq(content, maxTokens)
        : await callAnthropic(content, maxTokens, model);
    } catch (e) {
      if (attempt < retries) {
        await sleep(2 ** (attempt + 1) * 1000);
        continue;
      }
      console.error("ai: fallo de red hacia el proveedor:", e);
      return json({ error: "No se pudo contactar con el proveedor de IA" }, 502, headers);
    }

    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(2 ** (attempt + 1) * 1000);
      continue;
    }

    if (!res.ok) {
      // El error del proveedor se registra pero no se devuelve tal cual:
      // puede describir la clave o la cuenta.
      console.error("ai: el proveedor respondió", res.status, await res.text().catch(() => ""));
      const msg = res.status === 429
        ? "El proveedor de IA está saturado. Inténtalo en unos segundos."
        : res.status === 401 || res.status === 403
          ? "La clave de IA del servidor no es válida. Revísala en Supabase."
          : "El proveedor de IA devolvió un error.";
      return json({ error: msg }, res.status === 429 ? 429 : 502, headers);
    }

    const data = await res.json();
    const text = useGroq
      ? (data?.choices?.[0]?.message?.content ?? "")
      : (data?.content?.find((b: { type?: string }) => b.type === "text")?.text ?? "");

    return json({
      text,
      provider: useGroq ? "groq" : "anthropic",
      model: useGroq ? GROQ_MODEL : model,
      // `stop_reason: "max_tokens"` es la diferencia entre un prompt
      // maestro entero y uno cortado a media pieza, y desde el navegador
      // no se distingue de un modelo que decidió parar.
      truncated: !useGroq && data?.stop_reason === "max_tokens",
    }, 200, headers);
  }

  return json({ error: "No se pudo generar el contenido" }, 502, headers);
});
