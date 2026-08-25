// ============================================================
// Lectura de lo que devuelve el modelo, y de una URL de GitHub
//
// Todo lo de este archivo es puro: entra texto, sale un objeto. No hay
// red, no hay Supabase y no hay estado.
//
// Vivía dentro de `api.js`, que importa el cliente de Supabase en su
// primera línea. Eso hacía imposible probarlo: para ejecutar un parser
// había que copiarlo a un archivo suelto, y eso comprueba la copia, no
// el módulo que corre en producción. Los dos fallos de esta semana —el
// JSON que se rompía con una comilla y el `$` multilínea que dejaba los
// titulares vacíos— habrían saltado en un test si hubiera dónde
// escribirlo.
// ============================================================

export function parseAIResponse(rawText) {
  const results = {};
  const blocks = rawText.split(/<<<PUBLICACION_ID:/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const idEnd = block.indexOf(">>>");
    if (idEnd === -1) continue;
    const id = block.slice(0, idEnd).trim();
    let rest = block.slice(idEnd + 3);
    const nextBlock = rest.indexOf("<<<PUBLICACION_ID:");
    if (nextBlock !== -1) rest = rest.slice(0, nextBlock);

    const guionMatch = rest.match(/GUION:\s*([\s\S]*?)(?=DESCRIPCION:|HASHTAGS_FINALES:|<<<|$)/i);
    const descMatch = rest.match(/DESCRIPCION:\s*([\s\S]*?)(?=GUION:|HASHTAGS_FINALES:|<<<|$)/i);
    const hashMatch = rest.match(/HASHTAGS_FINALES:\s*([\s\S]*?)(?=GUION:|DESCRIPCION:|<<<|$)/i);

    const guion = guionMatch ? guionMatch[1].trim() : "";
    const descripcion = descMatch ? descMatch[1].trim() : "";
    const hashtagsFinales = hashMatch ? hashMatch[1].trim() : "";

    if (guion || descripcion || hashtagsFinales) {
      results[id] = { guion, descripcion, hashtagsFinales };
    }
  }
  return results;
}

export function parseGitHubUrl(url) {
  if (!url) return null;
  const treeMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+\/(.+)/);
  if (treeMatch) {
    return { owner: treeMatch[1], repo: treeMatch[2].replace(/\.git$/, ""), folder: treeMatch[3].replace(/\/$/, "") };
  }
  const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (repoMatch) {
    return { owner: repoMatch[1], repo: repoMatch[2].replace(/\.git$/, ""), folder: "" };
  }
  return null;
}

/**
 * Marca un bloque para la caché de prompt de Anthropic.
 *
 * El ADN del cliente son decenas de miles de caracteres y se reenvía en
 * cada tanda de seis publicaciones. Marcado, se paga una vez y las tandas
 * siguientes lo leen de la caché.
 */
export function cachedBlock(text) {
  return { type: "text", text, cache_control: { type: "ephemeral" } };
}

/**
 * Parsea JSON de un modelo, reparando lo que un modelo rompe.
 *
 * No es paranoia: los dos fallos de abajo se dieron en producción con un
 * lote de 12 piezas. Un modelo que escribe prosa española dentro de una
 * cadena JSON acaba metiendo una comilla sin escapar —«el titular "corto"
 * va arriba»— y a partir de ahí el resto del documento es ilegible.
 *
 * Para la prosa larga ya no se usa JSON en absoluto (ver `parseBloques`).
 * Esto cubre el JSON que queda, que son valores cortos.
 */
export function parseJSONLoose(texto, apertura = "{", cierre = "}") {
  const sinVallas = texto.replace(/```(?:json)?/gi, "");
  const ini = sinVallas.indexOf(apertura);
  const fin = sinVallas.lastIndexOf(cierre);
  if (ini === -1 || fin <= ini) throw new Error("La respuesta no contenía JSON.");
  const crudo = sinVallas.slice(ini, fin + 1);

  try {
    return JSON.parse(crudo);
  } catch {
    /* se intenta reparar abajo */
  }

  // Recorre carácter a carácter llevando la cuenta de si está dentro de una
  // cadena. Dentro de una cadena: los saltos de línea y tabuladores se
  // escapan, y una comilla sólo cierra de verdad si lo siguiente que hay
  // es `,` `}` `]` o `:`. Cualquier otra es una comilla literal del texto.
  let salida = "";
  let dentro = false;
  for (let i = 0; i < crudo.length; i++) {
    const c = crudo[i];
    if (!dentro) {
      if (c === '"') dentro = true;
      salida += c;
      continue;
    }
    if (c === "\\") { salida += c + (crudo[i + 1] ?? ""); i++; continue; }
    if (c === "\n") { salida += "\\n"; continue; }
    if (c === "\r") { salida += "\\r"; continue; }
    if (c === "\t") { salida += "\\t"; continue; }
    if (c === '"') {
      const siguiente = crudo.slice(i + 1).match(/^\s*(.)/)?.[1];
      if (siguiente && !",}]:".includes(siguiente)) { salida += '\\"'; continue; }
      dentro = false;
      salida += c;
      continue;
    }
    salida += c;
  }
  // Comas colgantes antes de un cierre.
  return JSON.parse(salida.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * Lee bloques etiquetados de un texto plano.
 *
 * Es el mismo formato que ya usa `parseAIResponse` para los guiones, y por
 * la misma razón: la prosa española lleva comillas, tildes, saltos de línea
 * y guiones largos, y ninguno de ellos necesita escaparse aquí. Un campo
 * empieza en `ETIQUETA:` a principio de línea y termina donde empieza la
 * siguiente etiqueta conocida.
 */
export function parseBloques(texto, etiquetas) {
  const siguiente = `^(?:${etiquetas.join("|")}):`;
  const campos = {};
  for (const etiqueta of etiquetas) {
    // `(?![\s\S])` y no `$`: con la bandera `m`, `$` casa al final de CADA
    // línea, así que el cuantificador perezoso paraba en el primer salto y
    // los campos multilínea —el titular, el prompt del fondo, el guion—
    // llegaban vacíos o con una sola línea.
    const re = new RegExp(`^${etiqueta}:[ \\t]*([\\s\\S]*?)(?=${siguiente}|(?![\\s\\S]))`, "m");
    const m = texto.match(re);
    if (m) campos[etiqueta] = m[1].trim();
  }
  return campos;
}

const ETIQUETAS_PIEZA = [
  "PLANTILLA", "FORMATO", "FECHA", "ANTETITULO", "TITULAR", "BAJADA",
  "CIFRA", "NOTA", "ANCLAJE", "FOTO_REAL", "PROMPT_FONDO", "GUION",
  "DESCRIPCION", "HASHTAGS", "DESCRIPCION_CONJUNTO", "HASHTAGS_CONJUNTO",
];

/** Convierte las fichas de texto en los objetos que espera `metaPrompt.js`. */
export function parsePiezas(texto) {
  const bloques = texto.split(/<<<PIEZA:/).slice(1);
  return bloques.map((bloque, i) => {
    const cuerpo = bloque.slice(bloque.indexOf(">>>") + 3);
    const c = parseBloques(cuerpo, ETIQUETAS_PIEZA);
    const n = Number(bloque.slice(0, bloque.indexOf(">>>")).trim()) || i + 1;
    return {
      n,
      plantilla: c.PLANTILLA || "",
      formato: c.FORMATO || "",
      fecha: c.FECHA || "",
      antetitulo: c.ANTETITULO || "",
      // El titular es una línea por línea del lienzo: los cortes ya vienen
      // decididos y no se recalculan en ningún punto de la cadena.
      titular: (c.TITULAR || "").split("\n").map((l) => l.trim()).filter(Boolean),
      bajada: c.BAJADA || "",
      cifra: c.CIFRA || "",
      nota: c.NOTA || "",
      anclaje: c.ANCLAJE || "",
      fotoReal: /^s[ií]$/i.test((c.FOTO_REAL || "").trim()),
      promptFondo: c.PROMPT_FONDO || "",
      guion: c.GUION || "",
      descripcion: c.DESCRIPCION || "",
      hashtags: c.HASHTAGS || "",
      descripcionConjunto: c.DESCRIPCION_CONJUNTO || "",
      hashtagsConjunto: c.HASHTAGS_CONJUNTO || "",
    };
  });
}
