// ============================================================
// Lectura del ADN de marca — el puerto de supabase/functions/github-adn
//
// Se conserva entero lo que costó encontrar:
//
//  · `decodeRuta()`. GitHub escribe los espacios como %20 en la barra de
//    direcciones, así que la ficha de un cliente acababa con
//    «Baby%20Caleb/01_ADN_y_Memoria». Las rutas del árbol que devuelve la
//    API vienen SIN escapar: la carpeta no coincidía con ninguna, la
//    lectura volvía vacía y el cliente parecía desconectado. Sólo les
//    pasaba a los clientes con un espacio en el nombre, que es lo que lo
//    hacía invisible. Se decodifica también el `folder` que llega, para
//    que las fichas viejas sigan funcionando sin reescribirlas.
//  · La carpeta que no existe devuelve 404 CON SU NOMBRE, no 200 con
//    todo vacío. Ese 200 vacío se enseñaba como «conectado, sin
//    archivos», y el fallo del %20 vivió meses ahí dentro.
//  · Los blobs se piden por SHA, no por `download_url`: en un
//    repositorio privado esa URL lleva un parámetro de acceso, y el
//    endpoint de blobs funciona igual con el token en la cabecera, que
//    es donde debe ir.
//  · `VERSION`, para que la aplicación pueda decir «estás corriendo una
//    versión vieja» en una línea en vez de deducirlo de tres campos
//    vacíos. Pasó, y costó una tarde.
// ============================================================

import { json, error, cuerpo } from "../lib/respuesta.js";

const VERSION = 3;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TOTAL_CHARS = 200_000;
const MAX_FILE_BYTES = 400_000;   // más que eso no es ADN, es un volcado
const MAX_FILES = 40;
const MAX_DEPTH = 3;

const TEXT_RE = /\.(md|txt|json|ya?ml)$/i;
const IMAGE_RE = /\.(png|jpe?g|svg|webp|gif)$/i;

/**
 * Cuánto se deja leer de cada archivo, y en qué orden se sirve el
 * presupuesto. Si hay que recortar algo, se recorta lo de abajo.
 */
const PRIORIDAD = [
  { re: /05_receta\.json$/i,               rank: -1, budget: 80_000, role: "recetaJson" },
  { re: /05_prompt_maestro_meta_ai\.md$/i, rank: 0,  budget: 60_000, role: "receta" },
  { re: /01_brand_guidelines\.md$/i,       rank: 1,  budget: 40_000, role: "guidelines" },
  { re: /02_buyer_personas\.md$/i,         rank: 2,  budget: 20_000, role: "personas" },
  { re: /04_master_prompts\.md$/i,         rank: 3,  budget: 20_000, role: "masterPrompts" },
  { re: /03_diccionario_seo\.json$/i,      rank: 4,  budget: 10_000, role: "seo" },
  { re: /Calendarios_Aprobados\//i,        rank: 6,  budget:  4_000, role: "publicado" },
  { re: /Auditorias\//i,                   rank: 7,  budget:  3_000, role: "auditoria" },
];
const POR_DEFECTO = { rank: 5, budget: 8_000, role: "otro" };

/** Carpetas que nunca aportan contexto y sí pesan. */
const SALTAR = /(^|\/)(06_Assets_Brutos_Solo_Lectura|node_modules|\.git|dist|build)(\/|$)/i;

export function decodeRuta(ruta) {
  if (!ruta) return "";
  return ruta.split("/").map((seg) => {
    try { return decodeURIComponent(seg); } catch { return seg; }
  }).join("/");
}

export function parseGitHubUrl(url) {
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
  if (repo) return { owner: repo[1], repo: repo[2].replace(/\.git$/, ""), folder: "" };
  return null;
}

/** Sólo se descarga de los dominios de GitHub: evita usar esto de proxy. */
function descargaPermitida(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      (u.hostname === "raw.githubusercontent.com" || u.hostname === "api.github.com");
  } catch {
    return false;
  }
}

const reglaDe = (path) => PRIORIDAD.find((p) => p.re.test(path)) ?? POR_DEFECTO;

/** Profundidad de `path` relativa a `base`. `base` mismo es 0. */
export function profundidad(path, base) {
  const rel = base ? path.slice(base.length).replace(/^\//, "") : path;
  if (!rel) return 0;
  return rel.split("/").length - 1;
}

function decodificarBlob(base64) {
  const limpio = base64.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(limpio), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export async function rutaADN(req, env) {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_BODY_BYTES) return error("La petición es demasiado grande", 413);

  const body = await cuerpo(req);
  if (!body) return error("JSON inválido");

  const parsed = parseGitHubUrl(String(body.repoUrl ?? ""));
  if (!parsed) return error("La URL del repositorio no es válida");

  const { owner, repo } = parsed;
  // La carpeta puede llegar escapada desde la ficha del cliente: se guardó
  // así durante meses.
  const basePath = decodeRuta(String(body.folder ?? "")) || parsed.folder || "";

  const cabeceras = { Accept: "application/vnd.github.v3+json", "User-Agent": "juancito-calendarios" };
  if (env.GITHUB_TOKEN) cabeceras.Authorization = `token ${env.GITHUB_TOKEN}`;

  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  let tree = [];
  let arbolTruncado = false;
  try {
    const res = await fetch(`${api}/git/trees/HEAD?recursive=1`, { headers: cabeceras });
    if (!res.ok) {
      const detalle = res.status === 404
        ? "No se encontró el repositorio, o el token del servidor no tiene acceso."
        : res.status === 403
          ? "GitHub rechazó la petición (límite de peticiones o permisos del token)."
          : `GitHub respondió ${res.status}.`;
      return error(detalle, 502);
    }
    const data = await res.json();
    tree = Array.isArray(data?.tree) ? data.tree : [];
    arbolTruncado = Boolean(data?.truncated);
  } catch (e) {
    return error("No se pudo contactar con GitHub", 502, e);
  }

  const enBase = (p) => !basePath || p === basePath || p.startsWith(`${basePath}/`);

  // Una carpeta que no está en el árbol se dice con esas palabras.
  if (basePath && !tree.some((n) => enBase(n.path))) {
    return error(
      `La carpeta «${basePath}» no existe en ${owner}/${repo}. ` +
      "Revisa la ruta en la ficha del cliente, pestaña GitHub.", 404,
    );
  }

  const subfolders = tree
    .filter((n) => n.type === "tree" && enBase(n.path) && profundidad(n.path, basePath) === 0 && n.path !== basePath)
    .map((n) => ({ name: n.path.split("/").pop(), path: n.path }));

  // Los assets no se descargan, se listan: el logo lo carga el humano en
  // la ficha, aquí sólo se dice qué existe para poder avisar si falta.
  const assets = tree
    .filter((n) => n.type === "blob" && enBase(n.path) && IMAGE_RE.test(n.path) && !SALTAR.test(n.path))
    .map((n) => ({ name: n.path.split("/").pop(), path: n.path, size: n.size ?? 0 }))
    .slice(0, 30);

  const candidatos = tree
    .filter((n) =>
      n.type === "blob" && enBase(n.path) && TEXT_RE.test(n.path) && !SALTAR.test(n.path) &&
      profundidad(n.path, basePath) <= MAX_DEPTH && (n.size ?? 0) < MAX_FILE_BYTES)
    .map((n) => ({ ...n, rule: reglaDe(n.path) }))
    .sort((a, b) => a.rule.rank - b.rule.rank || a.path.localeCompare(b.path))
    .slice(0, MAX_FILES);

  const sections = {};
  const files = [];
  const shas = {};
  let restante = MAX_TOTAL_CHARS;
  let algoTruncado = false;
  let content = "";

  for (const file of candidatos) {
    if (restante <= 0) { algoTruncado = true; break; }
    const url = `${api}/git/blobs/${file.sha}`;
    if (!descargaPermitida(url)) continue;
    try {
      const res = await fetch(url, { headers: cabeceras });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.encoding !== "base64" || typeof data?.content !== "string") continue;

      const completo = decodificarBlob(data.content);
      const tope = Math.min(file.rule.budget, restante);
      const texto = completo.length > tope ? completo.slice(0, tope) : completo;
      const truncado = texto.length < completo.length;
      if (truncado) algoTruncado = true;

      restante -= texto.length;
      const name = file.path.split("/").pop();
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
      console.error("adn: no se pudo descargar", file.path, e);
    }
  }

  // Nunca se devuelve `download_url`: lleva parámetros de acceso cuando
  // el repositorio es privado.
  return json({
    version: VERSION,
    content, sections, files, subfolders, assets,
    basePath, owner, repo,
    recipeSha: Object.entries(shas).find(([p]) => /05_prompt_maestro_meta_ai\.md$/i.test(p))?.[1] ?? "",
    totalChars: MAX_TOTAL_CHARS - restante,
    truncated: algoTruncado || arbolTruncado,
  });
}
