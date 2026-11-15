// ============================================================
// Leer el repositorio de un cliente para llenar su cerebro
//
// Lo hace al llenarlo, cuando alguien pulsa «Actualizar desde GitHub», al
// abrir Marca → Cerebro y una vez al día desde el cron; nunca en cada
// generación. Primero el ÁRBOL (`leerArbol`, una petición, sin bajar nada):
// con eso se sabe si algo cambió y qué ya no está. Después, sólo lo que hace
// falta (`descargar`).
//
// LO QUE ESTO HACE DISTINTO DE `rutaADN`
//
// `rutaADN` prepara un texto para el PROMPT: recorta cada archivo por su
// presupuesto —se pierde la cola de los largos— y se detiene a los 200 000
// caracteres. Para llenar un cerebro no se recorta nada: cada archivo
// entra entero, porque partido por secciones cada trozo es corto. Sólo
// quedan los topes que protegen al Worker: 400 000 bytes por archivo (más
// que eso es un volcado, no ADN), tres niveles de carpetas y `MAX_ARCHIVOS`
// por llamada. Lo que no entra se CUENTA y se dice (`fuera`): un PDF, un
// Word, un archivo enorme o demasiado hondo no se callan.
//
// LÍMITES DE UNA INVOCACIÓN
//
// El plan gratuito de Workers da 50 peticiones de salida por invocación.
// El árbol es una y cada archivo otra, así que con 40 archivos quedan 9
// de margen. Un archivo cuyo SHA ya está en el cerebro no se descarga: al
// volver a importar sólo se pide lo que cambió.
// ============================================================

import { parseGitHubUrl, decodeRuta, profundidad, decodificarBlob, TEXT_RE, SALTAR } from "../../rutas/adn.js";

export const MAX_ARCHIVOS = 40;
export const MAX_BYTES = 400_000;
export const MAX_PROFUNDIDAD = 3;
const EN_PARALELO = 6;

/** Un fallo de GitHub que se le puede decir a la persona tal cual. */
export class ErrorRepositorio extends Error {}

/** Lo que NO es texto y por eso no entra, por clase: para decirlo («3 PDF, 1 Word») en vez de callarlo. */
const CLASES_FUERA = [
  ["pdf", /\.pdf$/i],
  ["word", /\.(docx?|odt|rtf|pages)$/i],
  ["hoja", /\.(xlsx?|ods|csv|numbers)$/i],
  ["imagen", /\.(png|jpe?g|gif|webp|svg|heic|avif|bmp|tiff?)$/i],
];
const claseDe = (ruta) => CLASES_FUERA.find(([, re]) => re.test(ruta))?.[0] ?? "otro";
/** Lo que no cuenta ni como «no entró»: archivos ocultos y de sistema (.DS_Store, .gitkeep…). */
const OCULTO = /(^|\/)\.[^/]*$/;
const MAX_LISTA_FUERA = 20;

/** La huella de una carpeta: cambia si cambia, entra o sale cualquier archivo de ella. Pura. */
function huellaDeCarpeta(blobs, truncado) {
  let h = 2166136261;
  const texto = `${truncado ? "t" : "c"}|${blobs.map((n) => `${n.path}:${n.sha}`).join("|")}`;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return `${(h >>> 0).toString(16)}-${blobs.length}`;
}

/**
 * El árbol de la carpeta de un cliente, en UNA petición, sin bajar ningún archivo. Es lo que mira la revisión diaria:
 * si la `huella` no cambió desde la última vez, no hay nada que bajar.
 * → { owner, repo, base, huella, truncado,
 *     candidatos: [{ path, sha, size }]   (los archivos de texto que entran, ordenados),
 *     presentes: Set<string>              (todo archivo de la carpeta: lo que no está aquí se borró, renombró o movió),
 *     fuera: { grandes: string[], profundos: string[], noTexto: { pdf, word, hoja, imagen, otro } } }
 */
export async function leerArbol(env, { repoUrl, carpeta = "" }) {
  const parsed = parseGitHubUrl(String(repoUrl ?? ""));
  if (!parsed) throw new ErrorRepositorio("Este cliente no tiene un repositorio de GitHub en su ficha.");
  const { owner, repo } = parsed;
  const base = decodeRuta(String(carpeta ?? "")) || parsed.folder || "";

  let res;
  try {
    res = await fetch(`${apiDe(owner, repo)}/git/trees/HEAD?recursive=1`, { headers: cabecerasDe(env) });
  } catch (e) {
    throw new ErrorRepositorio("No se pudo contactar con GitHub.", { cause: e });
  }
  if (!res.ok) {
    throw new ErrorRepositorio(
      res.status === 404 ? "No se encontró el repositorio, o el token del servidor no tiene acceso."
        : res.status === 403 ? "GitHub rechazó la petición (límite de peticiones o permisos del token)."
          : `GitHub respondió ${res.status}.`,
    );
  }
  const datos = await res.json();
  const arbol = Array.isArray(datos?.tree) ? datos.tree : [];
  const truncado = Boolean(datos?.truncated);

  const enBase = (p) => !base || p === base || p.startsWith(`${base}/`);
  if (base && !arbol.some((n) => enBase(n.path))) {
    throw new ErrorRepositorio(`La carpeta «${base}» no existe en ${owner}/${repo}. Revisa la ruta en la ficha del cliente, pestaña GitHub.`);
  }

  const blobs = arbol.filter((n) => n.type === "blob" && typeof n.path === "string" && enBase(n.path) && !SALTAR.test(n.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  const candidatos = [];
  const fuera = { grandes: [], profundos: [], noTexto: { pdf: 0, word: 0, hoja: 0, imagen: 0, otro: 0 } };
  for (const n of blobs) {
    if (OCULTO.test(n.path)) continue;
    if (!TEXT_RE.test(n.path)) { fuera.noTexto[claseDe(n.path)]++; continue; }
    const size = n.size ?? 0;
    if (size <= 0) continue;
    if (size >= MAX_BYTES) { fuera.grandes.push(n.path); continue; }
    if (profundidad(n.path, base) > MAX_PROFUNDIDAD) { fuera.profundos.push(n.path); continue; }
    candidatos.push({ path: n.path, sha: n.sha, size });
  }
  fuera.grandes = fuera.grandes.slice(0, MAX_LISTA_FUERA);
  fuera.profundos = fuera.profundos.slice(0, MAX_LISTA_FUERA);
  return {
    owner, repo, base, truncado, candidatos, fuera,
    presentes: new Set(blobs.map((n) => n.path)),
    huella: huellaDeCarpeta(blobs, truncado),
  };
}

/** Baja `lista` ([{ path, sha }]) del repositorio de `arbol`, de seis en seis. → { archivos: [{ ruta, sha, texto }], fallidos: string[] } */
export async function descargar(env, arbol, lista) {
  const api = apiDe(arbol.owner, arbol.repo);
  const cabeceras = cabecerasDe(env);
  const archivos = [];
  const fallidos = [];
  for (let i = 0; i < lista.length; i += EN_PARALELO) {
    const trozo = lista.slice(i, i + EN_PARALELO);
    const leidos = await Promise.all(trozo.map(async (n) => {
      try {
        const r = await fetch(`${api}/git/blobs/${n.sha}`, { headers: cabeceras });
        if (!r.ok) return null;
        const blob = await r.json();
        if (blob?.encoding !== "base64" || typeof blob?.content !== "string") return null;
        return { ruta: n.path, sha: n.sha, texto: decodificarBlob(blob.content) };
      } catch (e) {
        console.error("cerebro: no se pudo descargar", n.path, e);
        return null;
      }
    }));
    leidos.forEach((a, j) => (a ? archivos.push(a) : fallidos.push(trozo[j].path)));
  }
  return { archivos, fallidos };
}

const apiDe = (owner, repo) => `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
function cabecerasDe(env) {
  const c = { Accept: "application/vnd.github.v3+json", "User-Agent": "juancito-calendarios" };
  if (env.GITHUB_TOKEN) c.Authorization = `token ${env.GITHUB_TOKEN}`;
  return c;
}

/**
 * La dirección de un archivo del repositorio en la web de GitHub («Editar en GitHub»), o "" si el cliente no tiene
 * repositorio. Cada tramo de la ruta va escapado: las carpetas de los clientes llevan espacios («Baby Caleb/…»). Pura.
 */
export function enlaceDeArchivo(repoUrl, ruta) {
  const parsed = parseGitHubUrl(String(repoUrl ?? ""));
  if (!parsed || !ruta) return "";
  return `https://github.com/${parsed.owner}/${parsed.repo}/blob/HEAD/${String(ruta).split("/").map(encodeURIComponent).join("/")}`;
}

/** La dirección del repositorio en la web («https://github.com/dueño/repo»), o "". Pura. */
export function webDelRepositorio(repoUrl) {
  const parsed = parseGitHubUrl(String(repoUrl ?? ""));
  return parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : "";
}
