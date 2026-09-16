// ============================================================
// Lectura de la configuración del despliegue.
//
// Sustituye al lector de netlify.toml. Ahora hay DOS sitios donde vive
// lo que se despliega, y esa separación es la trampa principal de
// Workers Static Assets:
//
//   wrangler.jsonc    qué se despliega y con qué ataduras (D1, R2)
//   public/_headers   las cabeceras de los recursos ESTÁTICOS
//
// Y un tercero que no es un fichero de configuración pero manda igual:
// worker/lib/respuesta.js, que pone las cabeceras de /api/*, porque las
// de _headers NO se aplican a lo que genera el Worker.
// ============================================================

import { leer } from "./repo.js";

/**
 * JSONC: JSON con comentarios, que es lo que acepta wrangler.
 *
 * Se quitan los comentarios respetando las cadenas: un `//` dentro de
 * una URL —«https://…»— no es un comentario, y cortarlo ahí dejaba la
 * configuración ilegible sin decir por qué.
 */
export function parseJSONC(texto) {
  let fuera = "";
  let enCadena = false;
  let escapando = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      fuera += c;
      if (escapando) escapando = false;
      else if (c === "\\") escapando = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') { enCadena = true; fuera += c; continue; }
    if (c === "/" && texto[i + 1] === "/") {
      while (i < texto.length && texto[i] !== "\n") i++;
      fuera += "\n";
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      i += 2;
      while (i < texto.length && !(texto[i] === "*" && texto[i + 1] === "/")) i++;
      i++;
      continue;
    }
    fuera += c;
  }
  // Comas colgantes: wrangler las tolera, JSON.parse no.
  return JSON.parse(fuera.replace(/,(\s*[}\]])/g, "$1"));
}

export const wrangler = () => parseJSONC(leer("wrangler.jsonc"));

/**
 * `public/_headers` como lista de reglas `{ patron, cabeceras }`.
 *
 * El formato es el de Pages: una línea sin sangrar es un patrón, las
 * sangradas que le siguen son sus cabeceras.
 */
export function cabeceras() {
  const reglas = [];
  let actual = null;
  for (const linea of leer("public/_headers").split("\n")) {
    if (!linea.trim() || linea.trim().startsWith("#")) continue;
    if (/^\S/.test(linea)) {
      actual = { patron: linea.trim(), cabeceras: {} };
      reglas.push(actual);
    } else if (actual) {
      const i = linea.indexOf(":");
      if (i > 0) actual.cabeceras[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
    }
  }
  return reglas;
}

/** Las cabeceras que se aplican a una ruta, acumulando todas las reglas que casan. */
export function cabecerasDe(ruta) {
  const salida = {};
  for (const regla of cabeceras()) {
    const re = new RegExp(`^${regla.patron.replace(/\*/g, ".*")}$`);
    if (re.test(ruta)) Object.assign(salida, regla.cabeceras);
  }
  return salida;
}

/** La CSP partida en directivas. */
export function csp(ruta = "/index.html") {
  const bruta = cabecerasDe(ruta)["Content-Security-Policy"] ?? "";
  const mapa = {};
  for (const trozo of bruta.split(";")) {
    const [nombre, ...valores] = trozo.trim().split(/\s+/);
    if (nombre) mapa[nombre] = valores;
  }
  return mapa;
}
