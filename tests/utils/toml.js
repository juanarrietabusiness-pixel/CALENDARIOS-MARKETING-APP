// ============================================================
// Lector de TOML acotado a lo que usa `netlify.toml`.
//
// No es un parser general y no pretende serlo: cubre tablas (`[build]`),
// tablas anidadas (`[build.environment]`), arrays de tablas
// (`[[redirects]]`), cadenas normales, cadenas multilínea con `"""` y
// continuación con `\`, enteros y booleanos.
//
// Se escribe a mano en vez de traer una dependencia porque el archivo que
// lee es uno solo y su forma está fijada. A cambio, el lector tiene sus
// propios tests en `toml.test.js`: una plantilla de despliegue que se
// valida con un lector sin probar no está validada.
// ============================================================

/** Corta la línea en el primer `#` que no esté dentro de una cadena. */
function sinComentario(linea) {
  let dentro = null;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (dentro) {
      if (c === "\\") { i++; continue; }
      if (c === dentro) dentro = null;
      continue;
    }
    if (c === '"' || c === "'") { dentro = c; continue; }
    if (c === "#") return linea.slice(0, i);
  }
  return linea;
}

/** Deshace los escapes de una cadena básica de TOML. */
function desescapar(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (m, c) => {
    if (c[0] === "u") return String.fromCharCode(parseInt(c.slice(1), 16));
    const mapa = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', b: "\b", f: "\f" };
    return mapa[c] ?? c;
  });
}

/**
 * Aplica la regla de continuación de línea de TOML: una `\` al final de
 * una línea dentro de `"""` se come el salto y los espacios iniciales de
 * la siguiente. Es lo que usa la CSP para escribirse en varias líneas.
 */
function plegarContinuaciones(s) {
  return s.replace(/\\\s*\n\s*/g, "");
}

function valorEscalar(bruto) {
  const v = bruto.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  if (v.startsWith("'")) return v.slice(1, -1);
  if (v.startsWith('"')) return desescapar(v.slice(1, -1));
  return v;
}

/** Devuelve (creándolo si hace falta) el objeto en la ruta dada. */
function bajar(raiz, ruta) {
  let actual = raiz;
  for (const parte of ruta) {
    if (Array.isArray(actual[parte])) {
      actual = actual[parte][actual[parte].length - 1];
    } else {
      if (typeof actual[parte] !== "object" || actual[parte] === null) actual[parte] = {};
      actual = actual[parte];
    }
  }
  return actual;
}

export function leerToml(texto) {
  const raiz = {};
  let destino = raiz;

  const lineas = texto.split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const linea = sinComentario(lineas[i]).trim();
    if (!linea) continue;

    // [[array de tablas]]
    const arr = linea.match(/^\[\[([^\]]+)\]\]$/);
    if (arr) {
      const ruta = arr[1].split(".").map((s) => s.trim());
      const padre = bajar(raiz, ruta.slice(0, -1));
      const hoja = ruta[ruta.length - 1];
      if (!Array.isArray(padre[hoja])) padre[hoja] = [];
      const nuevo = {};
      padre[hoja].push(nuevo);
      destino = nuevo;
      continue;
    }

    // [tabla]
    const tab = linea.match(/^\[([^\]]+)\]$/);
    if (tab) {
      destino = bajar(raiz, tab[1].split(".").map((s) => s.trim()));
      continue;
    }

    // clave = valor
    const eq = linea.indexOf("=");
    if (eq === -1) continue;
    const clave = linea.slice(0, eq).trim().replace(/^["']|["']$/g, "");
    let bruto = linea.slice(eq + 1).trim();

    // Cadena multilínea: se acumula hasta el """ de cierre. El corte de
    // comentarios no se aplica dentro, o la CSP perdería cualquier `#`.
    if (bruto.startsWith('"""')) {
      let cuerpo = bruto.slice(3);
      if (!cuerpo.includes('"""')) {
        while (++i < lineas.length) {
          cuerpo += "\n" + lineas[i];
          if (lineas[i].includes('"""')) break;
        }
      }
      cuerpo = cuerpo.slice(0, cuerpo.lastIndexOf('"""'));
      // TOML ignora el primer salto de línea justo tras la apertura.
      cuerpo = cuerpo.replace(/^\r?\n/, "");
      destino[clave] = desescapar(plegarContinuaciones(cuerpo));
      continue;
    }

    destino[clave] = valorEscalar(bruto);
  }

  return raiz;
}

/**
 * Normaliza una directiva de CSP a la lista de orígenes que declara.
 * Devuelve null si la directiva no está.
 */
export function directivaCSP(csp, nombre) {
  const partes = String(csp).split(";").map((s) => s.trim()).filter(Boolean);
  for (const parte of partes) {
    const [dir, ...resto] = parte.split(/\s+/);
    if (dir === nombre) return resto;
  }
  return null;
}
