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
//
// ---- Por qué se lee el árbol entero y no dos carpetas ----
//
// La versión anterior listaba `basePath` y `basePath/adn`, leía los 5
// primeros .md y cortaba cada uno a 3000 caracteres. Contra la estructura
// real de Agencia_Workspace eso significaba que de la carpeta de un
// cliente no llegaba nada (sólo tiene subcarpetas), y que apuntando a
// `01_ADN_y_Memoria` llegaba el 20 % del ADN: de los 27 000 caracteres
// del prompt maestro de Meta AI se leían los 3000 primeros, que son la
// introducción. El formato de entrega, las plantillas, la escala, los
// negativos y el contrato del HTML nunca cruzaban.
//
// Ahora se pide el árbol completo en UNA llamada (git/trees?recursive=1),
// se recorre la carpeta del cliente entera y se reparte un presupuesto de
// caracteres por prioridad: los archivos que definen la marca entran
// completos y lo accesorio cede sitio. Cada archivo dice si se truncó,
// para que la interfaz pueda avisar en vez de degradarse en silencio.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((o) => o.trim()).filter(Boolean);

// Presupuesto global. 200 000 caracteres son unos 50 000 tokens: cabe de
// sobra en la ventana de Claude y, con la caché de prompt, se paga una vez.
// Versión del contrato de respuesta. Sube cuando cambie lo que devuelve
// esta función, para que la aplicación pueda decir «estás corriendo una
// versión vieja» en una línea, en vez de que alguien tenga que deducirlo de
// tres campos vacíos en un diagnóstico. Pasó, y costó una tarde.
const VERSION = 3;

const MAX_TOTAL_CHARS = 200_000;
// Un archivo de más de 400 kB no es ADN, es un volcado. Se descarta.
const MAX_FILE_BYTES = 400_000;
const MAX_FILES = 40;
// Profundidad dentro de la carpeta del cliente. `01_ADN_y_Memoria/
// Assets_Visuales_Base/x` son dos niveles; tres deja margen sin invitar
// a arrastrar el repositorio entero.
const MAX_DEPTH = 3;

const TEXT_RE = /\.(md|txt|json|ya?ml)$/i;
const IMAGE_RE = /\.(png|jpe?g|svg|webp|gif)$/i;

/**
 * Cuánto se deja leer de cada archivo, y en qué orden se sirve el
 * presupuesto. Los dos primeros son los que la app estaba cortando: el
 * prompt maestro define el formato de entrega y las guías definen la
 * marca. Si hay que recortar algo, se recorta lo de abajo.
 */
const PRIORITY: { re: RegExp; rank: number; budget: number; role: string }[] = [
  // La receta en JSON va primera y entera. Es la fuente de verdad del
  // sistema visual: la app la lee tal cual, sin pasarla por ningún modelo.
  { re: /05_receta\.json$/i,               rank: -1, budget: 80_000, role: "recetaJson" },
  { re: /05_prompt_maestro_meta_ai\.md$/i, rank: 0, budget: 60_000, role: "receta" },
  { re: /01_brand_guidelines\.md$/i,       rank: 1, budget: 40_000, role: "guidelines" },
  { re: /02_buyer_personas\.md$/i,         rank: 2, budget: 20_000, role: "personas" },
  { re: /04_master_prompts\.md$/i,         rank: 3, budget: 20_000, role: "masterPrompts" },
  { re: /03_diccionario_seo\.json$/i,      rank: 4, budget: 10_000, role: "seo" },
  { re: /Calendarios_Aprobados\//i,        rank: 6, budget:  4_000, role: "publicado" },
  { re: /Auditorias\//i,                   rank: 7, budget:  3_000, role: "auditoria" },
];
const DEFAULT_RULE = { rank: 5, budget: 8_000, role: "otro" };

/** Carpetas que nunca aportan contexto y sí pesan. */
const SKIP_DIRS = /(^|\/)(06_Assets_Brutos_Solo_Lectura|node_modules|\.git|dist|build)(\/|$)/i;

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

/**
 * Deshace el escapado de una ruta copiada de la barra del navegador.
 *
 * Las rutas del árbol que devuelve GitHub vienen SIN escapar, así que un
 * `basePath` con `%20` no coincidía con ninguna y la carpeta del cliente
 * salía vacía: ni archivos, ni subcarpetas, ni error. Sólo les pasaba a
 * los clientes cuya carpeta lleva un espacio en el nombre.
 */
function decodeRuta(ruta: string) {
  if (!ruta) return "";
  return ruta
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
}

/** Mismo formato que la versión del navegador, para no cambiar las llamadas. */
function parseGitHubUrl(url: string) {
  if (!url) return null;
  const tree = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+\/(.+)/);
  if (tree) {
    return {
      owner: tree[1],
      repo: tree[2].replace(/\.git$/, ""),
      folder: decodeRuta(tree[3].replace(/\/$/, "")),
    };
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

function ruleFor(path: string) {
  return PRIORITY.find((p) => p.re.test(path)) ?? DEFAULT_RULE;
}

/** Profundidad de `path` relativa a `base`. `base` mismo es 0. */
function depthUnder(path: string, base: string) {
  const rel = base ? path.slice(base.length).replace(/^\//, "") : path;
  if (!rel) return 0;
  return rel.split("/").length - 1;
}

/**
 * Los blobs se piden por SHA en vez de por `download_url`.
 * `download_url` de un repositorio privado lleva un parámetro de acceso
 * en la URL, y el endpoint de blobs funciona igual con el token en la
 * cabecera, que es donde debe ir.
 */
function decodeBlob(base64: string) {
  const clean = base64.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
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
  // La carpeta puede llegar escapada desde la ficha del cliente: se guardó
  // así durante meses. Se decodifica aquí también para que las fichas
  // antiguas funcionen sin tener que reescribirlas una a una.
  const basePath = decodeRuta(String(body?.folder ?? "")) || parsed.folder || "";

  const ghHeaders: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (GITHUB_TOKEN) ghHeaders.Authorization = `token ${GITHUB_TOKEN}`;

  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  // ---- El árbol completo, en una llamada ----
  let tree: { path: string; type: string; sha: string; size?: number }[] = [];
  let truncatedTree = false;
  try {
    const res = await fetch(`${api}/git/trees/HEAD?recursive=1`, { headers: ghHeaders });
    if (!res.ok) {
      const detalle = res.status === 404
        ? "No se encontró el repositorio, o el token del servidor no tiene acceso."
        : res.status === 403
          ? "GitHub rechazó la petición (límite de peticiones o permisos del token)."
          : `GitHub respondió ${res.status}.`;
      return json({ error: detalle }, 502, headers);
    }
    const data = await res.json();
    tree = Array.isArray(data?.tree) ? data.tree : [];
    truncatedTree = Boolean(data?.truncated);
  } catch (e) {
    console.error("github-adn: no se pudo leer el árbol", e);
    return json({ error: "No se pudo contactar con GitHub" }, 502, headers);
  }

  const inBase = (p: string) => !basePath || p === basePath || p.startsWith(`${basePath}/`);

  // Una carpeta que no está en el árbol se dice con esas palabras. Antes
  // se devolvía 200 con todo vacío, y la interfaz lo enseñaba como
  // «conectado, sin archivos»: el fallo del `%20` vivió meses ahí dentro.
  if (basePath && !tree.some((n) => inBase(n.path))) {
    return json({
      error: `La carpeta «${basePath}» no existe en ${owner}/${repo}. ` +
        "Revisa la ruta en la ficha del cliente, pestaña GitHub.",
    }, 404, headers);
  }

  // ---- Subcarpetas directas: es lo que la interfaz ofrece para navegar ----
  const subfolders = tree
    .filter((n) => n.type === "tree" && inBase(n.path) && depthUnder(n.path, basePath) === 0 && n.path !== basePath)
    .map((n) => ({ name: n.path.split("/").pop()!, path: n.path }));

  // ---- Assets visuales: no se descargan, se listan ----
  // El logo del cliente lo carga el humano en la ficha; aquí sólo se dice
  // qué archivos existen, para poder avisar si falta.
  const assets = tree
    .filter((n) => n.type === "blob" && inBase(n.path) && IMAGE_RE.test(n.path) && !SKIP_DIRS.test(n.path))
    .map((n) => ({ name: n.path.split("/").pop()!, path: n.path, size: n.size ?? 0 }))
    .slice(0, 30);

  // ---- Candidatos de texto, ordenados por prioridad ----
  const candidates = tree
    .filter((n) =>
      n.type === "blob" &&
      inBase(n.path) &&
      TEXT_RE.test(n.path) &&
      !SKIP_DIRS.test(n.path) &&
      depthUnder(n.path, basePath) <= MAX_DEPTH &&
      (n.size ?? 0) < MAX_FILE_BYTES
    )
    .map((n) => ({ ...n, rule: ruleFor(n.path) }))
    .sort((a, b) => a.rule.rank - b.rule.rank || a.path.localeCompare(b.path))
    .slice(0, MAX_FILES);

  // ---- Descarga con presupuesto ----
  const sections: Record<string, string> = {};
  const files: { name: string; path: string; role: string; chars: number; truncated: boolean }[] = [];
  const shas: Record<string, string> = {};
  let restante = MAX_TOTAL_CHARS;
  let algoTruncado = false;
  let content = "";

  for (const file of candidates) {
    if (restante <= 0) { algoTruncado = true; break; }
    const url = `${api}/git/blobs/${file.sha}`;
    if (!isAllowedDownload(url)) continue;
    try {
      const res = await fetch(url, { headers: ghHeaders });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.encoding !== "base64" || typeof data?.content !== "string") continue;

      const full = decodeBlob(data.content);
      const tope = Math.min(file.rule.budget, restante);
      const texto = full.length > tope ? full.slice(0, tope) : full;
      const truncado = texto.length < full.length;
      if (truncado) algoTruncado = true;

      restante -= texto.length;
      const name = file.path.split("/").pop()!;
      const role = file.rule.role;

      files.push({ name, path: file.path, role, chars: texto.length, truncated: truncado });
      shas[file.path] = file.sha;

      // Los roles únicos se exponen sueltos para que la app pueda usarlos
      // sin volver a partir el blob; los repetibles se acumulan.
      if (role === "publicado" || role === "auditoria" || role === "otro") {
        sections[role] = `${sections[role] ?? ""}\n--- ${name} ---\n${texto}\n`;
      } else {
        sections[role] = texto;
      }

      content += `\n--- ${file.path}${truncado ? " (recortado)" : ""} ---\n${texto}\n`;
    } catch (e) {
      console.error("github-adn: no se pudo descargar", file.path, e);
    }
  }

  // Nunca se devuelve `download_url`: lleva parámetros de acceso cuando
  // el repositorio es privado.
  return json({
    version: VERSION,
    content,
    sections,
    files,
    subfolders,
    assets,
    basePath,
    owner,
    repo,
    // El SHA de la receta permite saber si hay que recompilarla sin
    // volver a leer el archivo entero.
    recipeSha: Object.entries(shas).find(([p]) => /05_prompt_maestro_meta_ai\.md$/i.test(p))?.[1] ?? "",
    totalChars: MAX_TOTAL_CHARS - restante,
    truncated: algoTruncado || truncatedTree,
  }, 200, headers);
});
