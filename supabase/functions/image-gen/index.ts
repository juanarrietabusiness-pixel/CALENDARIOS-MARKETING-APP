// ============================================================
// Proxy de generación de imágenes
//
// Capa de abstracción que hoy apunta a la API de Nano Banana
// (https://www.nanobanana.com) pero que se puede reemplazar por
// cualquier proveedor compatible. La clave vive en los secretos
// del proyecto: el navegador nunca la ve.
//
// Variable de entorno requerida:
//   IMAGE_GEN_API_KEY — clave de la API de Nano Banana
//
// Opcional:
//   IMAGE_GEN_PROVIDER — "nanobanana" (por defecto)
//   IMAGE_GEN_API_URL  — URL base de la API (para proveedores
//                        alternativos o endpoints de staging)
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const IMAGE_GEN_API_KEY = Deno.env.get("IMAGE_GEN_API_KEY") ?? "";
const IMAGE_GEN_PROVIDER = (Deno.env.get("IMAGE_GEN_PROVIDER") ?? "nanobanana").trim().toLowerCase();
const IMAGE_GEN_API_URL = Deno.env.get("IMAGE_GEN_API_URL") ?? "";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((o) => o.trim()).filter(Boolean);

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

interface GenerateRequest {
  prompt?: string;
  width?: number;
  height?: number;
  format?: string;
}

async function callNanoBanana(prompt: string, width: number, height: number): Promise<{ imageUrl: string } | { error: string }> {
  const apiUrl = IMAGE_GEN_API_URL || "https://api.nanobanana.com/v1/generate";

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${IMAGE_GEN_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      width,
      height,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("image-gen: proveedor respondió", res.status, body);
    if (res.status === 401 || res.status === 403) {
      return { error: "La clave de generación de imágenes no es válida." };
    }
    if (res.status === 429) {
      return { error: "El proveedor de imágenes está saturado. Inténtalo en unos segundos." };
    }
    return { error: "El proveedor de imágenes devolvió un error." };
  }

  const data = await res.json();
  const imageUrl = data?.image_url ?? data?.url ?? data?.data?.[0]?.url ?? "";
  if (!imageUrl) {
    return { error: "El proveedor no devolvió una imagen." };
  }
  return { imageUrl };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, headers);

  // ---- Sesión ----
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

  // ---- Verificar configuración ----
  if (!IMAGE_GEN_API_KEY) {
    return json({
      error: "not_configured",
      message: "La generación de imágenes no está configurada. Añade IMAGE_GEN_API_KEY a los secretos de Supabase.",
    }, 200, headers);
  }

  // ---- Petición ----
  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400, headers);
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return json({ error: "Falta el prompt para generar la imagen" }, 400, headers);
  }

  const dimensions: Record<string, [number, number]> = {
    post: [1080, 1080],
    carrusel: [1080, 1080],
    historia: [1080, 1920],
    reel: [1080, 1920],
    live: [1080, 1080],
  };
  const [defaultW, defaultH] = dimensions[body.format ?? "post"] ?? [1080, 1080];
  const width = body.width ?? defaultW;
  const height = body.height ?? defaultH;

  // ---- Generar ----
  if (IMAGE_GEN_PROVIDER === "nanobanana" || !IMAGE_GEN_PROVIDER) {
    const result = await callNanoBanana(prompt, width, height);
    if ("error" in result) {
      return json(result, 502, headers);
    }
    return json(result, 200, headers);
  }

  return json({ error: `Proveedor "${IMAGE_GEN_PROVIDER}" no soportado` }, 400, headers);
});
