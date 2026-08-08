// ============================================================
// Lectura del ADN de marca alojado en GitHub
//
// Antes cada cliente guardaba su token de GitHub en el navegador, y el
// token acababa dentro del JSON de «Exportar». Aquí el token es uno solo
// del servidor y nunca sale de los secretos del proyecto.
//
// El repositorio a leer lo elige la agencia autenticada, así que se
// valida el destino: sólo api.github.com y raw.githubusercontent.com.
// Sin esa comprobación, una URL manipulada convertiría esta función en
// un proxy hacia la red interna.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((o) => o.trim()).filter(Boolean);

const MAX_FILES = 5;
const MAX_FILE_BYTES = 50_000;
const MAX_CHARS_PER_FILE = 3000;

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

/** Mismo formato que la versión del navegador, para no cambiar las llamadas. */
function parseGitHubUrl(url: string) {
  if (!url) return null;
  const tree = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+\/(.+)/);
  if (tree) {
    return { owner: tree[1], repo: tree[2].replace(/\.git$/, ""), folder: tree[3].replace(/\/$/, "") };
  }
  const repo = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (repo) {
    return { owner: repo[1], repo: repo[2].replace(/\.git$/, ""), folder: "" };
  }
  return null;
}

/** Sólo se descarga de los dominios de GitHub: evita usar esto de proxy. */
function isAllowedDownload(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      (u.hostname === "raw.githubusercontent.com" || u.hostname === "api.github.com");
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, headers);

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

  let body: { repoUrl?: string; folder?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400, headers);
  }

  const parsed = parseGitHubUrl(String(body?.repoUrl ?? ""));
  if (!parsed) {
    return json({ error: "La URL del repositorio no es válida" }, 400, headers);
  }

  const { owner, repo } = parsed;
  const basePath = String(body?.folder ?? "") || parsed.folder || "";

  const ghHeaders: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (GITHUB_TOKEN) ghHeaders.Authorization = `token ${GITHUB_TOKEN}`;

  const paths = basePath ? [basePath, `${basePath}/adn`] : ["", "adn/"];
  const files: { name: string; path: string; download_url: string; size: number }[] = [];
  const subfolders: { name: string; path: string }[] = [];

  for (const path of paths) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
        { headers: ghHeaders },
      );
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item.type === "file" && /\.(md|txt)$/i.test(item.name) && item.size < MAX_FILE_BYTES) {
          files.push(item);
        }
        if (item.type === "dir" && path === basePath) {
          subfolders.push({ name: item.name, path: item.path });
        }
      }
    } catch (e) {
      console.error("github-adn: no se pudo listar", path, e);
    }
  }

  let content = "";
  for (const file of files.slice(0, MAX_FILES)) {
    if (!isAllowedDownload(file.download_url)) continue;
    try {
      const res = await fetch(file.download_url, { headers: ghHeaders });
      if (!res.ok) continue;
      const text = await res.text();
      content += `\n--- ${file.name} ---\n${text.slice(0, MAX_CHARS_PER_FILE)}\n`;
    } catch (e) {
      console.error("github-adn: no se pudo descargar", file.name, e);
    }
  }

  // Nunca se devuelve `download_url`: lleva parámetros de acceso cuando
  // el repositorio es privado.
  return json({
    content,
    files: files.map((f) => ({ name: f.name, path: f.path })),
    subfolders,
    basePath,
    owner,
    repo,
  }, 200, headers);
});
