// ============================================================
// Leer el repositorio de un cliente para llenar su cerebro
//
// Lo hace UNA vez (y cada vez que alguien lo pide), no en cada generación.
//
// LO QUE ESTO HACE DISTINTO DE `rutaADN`
//
// `rutaADN` prepara un texto para el PROMPT: recorta cada archivo por su
// presupuesto —se pierde la cola de los largos— y se detiene a los 200 000
// caracteres. Para llenar un cerebro no se recorta nada: cada archivo
// entra entero, porque partido por secciones cada trozo es corto. Sólo
// quedan los topes que protegen al Worker: 400 000 bytes por archivo (más
// que eso es un volcado, no ADN) y `MAX_ARCHIVOS` por llamada.
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
const MAX_BYTES = 400_000;
const MAX_PROFUNDIDAD = 3;
const EN_PARALELO = 6;

/** Un fallo de GitHub que se le puede decir a la persona tal cual. */
export class ErrorRepositorio extends Error {}

/**
 * Los archivos de texto de la carpeta de un cliente, enteros.
 * `conocidos`: Map fuente → sha de lo que ya está en el cerebro.
 * Se descargan los NUEVOS y, sólo con `actualizar`, también los que cambiaron: sin `actualizar` un archivo cambiado
 * ni se lee ni se pisa, así que bajarlo gastaría una de las 50 peticiones del plan gratuito para tirarlo.
 * → { archivos: [{ ruta, sha, texto }], iguales, cambiados (los que hay y no se bajaron), omitidos, fallidos, truncado }
 */
export async function leerRepositorio(env, { repoUrl, carpeta = "" }, conocidos = new Map(), { actualizar = false } = {}) {
  const parsed = parseGitHubUrl(String(repoUrl ?? ""));
  if (!parsed) throw new ErrorRepositorio("Este cliente no tiene un repositorio de GitHub en su ficha.");
  const { owner, repo } = parsed;
  const base = decodeRuta(String(carpeta ?? "")) || parsed.folder || "";

  const cabeceras = { Accept: "application/vnd.github.v3+json", "User-Agent": "juancito-calendarios" };
  if (env.GITHUB_TOKEN) cabeceras.Authorization = `token ${env.GITHUB_TOKEN}`;
  const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  let res;
  try {
    res = await fetch(`${api}/git/trees/HEAD?recursive=1`, { headers: cabeceras });
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

  const enBase = (p) => !base || p === base || p.startsWith(`${base}/`);
  if (base && !arbol.some((n) => enBase(n.path))) {
    throw new ErrorRepositorio(`La carpeta «${base}» no existe en ${owner}/${repo}. Revisa la ruta en la ficha del cliente, pestaña GitHub.`);
  }

  const candidatos = arbol
    .filter((n) => n.type === "blob" && enBase(n.path) && TEXT_RE.test(n.path) && !SALTAR.test(n.path)
      && profundidad(n.path, base) <= MAX_PROFUNDIDAD && (n.size ?? 0) > 0 && (n.size ?? 0) < MAX_BYTES)
    .sort((a, b) => a.path.localeCompare(b.path));

  const distintos = candidatos.filter((n) => conocidos.get(n.path) !== n.sha);
  const iguales = candidatos.length - distintos.length;
  const cambiados = distintos.filter((n) => conocidos.has(n.path));
  const pendientes = actualizar ? distintos : distintos.filter((n) => !conocidos.has(n.path));
  const aLeer = pendientes.slice(0, MAX_ARCHIVOS);

  const archivos = [];
  for (let i = 0; i < aLeer.length; i += EN_PARALELO) {
    const trozo = aLeer.slice(i, i + EN_PARALELO);
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
    archivos.push(...leidos.filter(Boolean));
  }

  return {
    archivos,
    iguales,
    cambiados: actualizar ? 0 : cambiados.length,
    // Lo que no cupo en esta llamada: se importa en la siguiente, que ya no repite lo hecho.
    omitidos: pendientes.length - aLeer.length,
    fallidos: aLeer.length - archivos.length,
    truncado: Boolean(datos?.truncated),
  };
}
