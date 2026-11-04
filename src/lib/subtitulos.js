// ============================================================
// Los SUBTÍTULOS por palabra del video animado (puro: lo leen el motor, la vista previa y el render)
//
// Se arman de la línea de tiempo (`lineaDeTiempo`): cada palabra ya trae su segundo en el VIDEO (con los silencios
// insertados), así que los subtítulos van con la voz real cuando hay locución y con la estimada cuando no.
//
//   · Un GRUPO es lo que se ve a la vez: hasta `maxPalabras` palabras y `maxCaracteres` letras, sin cruzar una escena
//     ni un trozo de frase (un punto, una interrogación, una coma): «…en 40 minutos? Primero» junta dos ideas. Cada
//     trozo se parte en los menos grupos posibles, PAREJOS: nada de «de Panamá y La | Chorrera».
//   · La PALABRA CLAVE del grupo va en el color de acento: un número si lo hay («40», «28»); si no, la más larga que
//     no sea de relleno («computarizado», no «con»). La regla la decide el código: un modelo no la escribe en el guion.
//   · Dentro del grupo, lo ya dicho se ve entero, lo que se está diciendo «salta» un poco y lo que falta va atenuado.
//   · Un grupo se ve desde su primera palabra hasta que empieza el siguiente; tras una pausa larga (un silencio
//     insertado, el final) se apaga a los `COLA_GRUPO` segundos de su última palabra: un subtítulo quieto sobre un
//     silencio parece un error.
// ============================================================

/** Lo que se queda un grupo en pantalla tras su última palabra si no viene otro enseguida. */
export const COLA_GRUPO = 0.45;
/** Lo que tarda el «salto» de la palabra que se está diciendo. */
export const SALTO = 0.12;

/** Palabras de relleno que nunca son la clave de un grupo (sin tildes, en minúsculas). */
const RELLENO = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "lo", "al", "del", "de", "a", "en", "y", "e", "o", "u", "que", "con",
  "por", "para", "sin", "su", "sus", "tu", "tus", "mi", "mis", "se", "si", "es", "son", "muy", "mas", "pero", "como", "ya",
  "te", "me", "le", "les", "nos", "este", "esta", "esto", "ese", "esa", "eso", "hay", "va", "vas", "ser", "fue", "sobre",
]);

const plano = (p) => String(p ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]/g, "");

/**
 * Cómo se escribe una palabra en el subtítulo: sin la coma, el punto ni los dos puntos de detrás (en un subtítulo por
 * palabra sobran), con los signos de pregunta y exclamación, que sí cambian lo que se dice. Pura.
 */
export function textoDeSubtitulo(palabra) {
  return String(palabra ?? "").replace(/[,.;:…]+(?=["»”)]*$)/g, "").replace(/^["«“(]+|["»”)]+$/g, "").trim();
}

/** El índice de la palabra clave de un grupo (`palabras`: textos): un número; si no, la más larga que no sea relleno. Pura. */
export function palabraClave(palabras) {
  const lista = palabras.map((p) => plano(p));
  const conNumero = lista.findIndex((p) => /\d/.test(p));
  if (conNumero >= 0) return conNumero;
  let mejor = -1;
  lista.forEach((p, i) => {
    if (!p || RELLENO.has(p)) return;
    if (mejor < 0 || p.length >= lista[mejor].length) mejor = i; // a igualdad, la de después (suele ser la que importa)
  });
  return mejor;
}

/** ¿La palabra cierra un trozo de frase? (una coma también: «Sales viendo nítido, | el mismo día»). */
const cierraTrozo = (p) => /[,.!?…:;]["»”)]*$/.test(String(p ?? ""));

/**
 * Parte una frase (`palabras`, ya con su texto limpio) en el MENOR número de grupos que respeten los topes, lo más
 * parejos posible por letras: «¿Y si tus lentes | estuvieran listos | en 40 minutos?», no «… | en 40 | minutos?».
 */
function partirParejo(palabras, maxPalabras, maxCaracteres) {
  const n = palabras.length;
  const largo = (i, j) => palabras.slice(i, j).reduce((s, p) => s + p.texto.length, 0) + (j - i - 1);
  const cabe = (i, j) => j - i <= maxPalabras && (largo(i, j) <= maxCaracteres || j - i === 1);
  for (let k = 1; k <= n; k++) {
    // peor[i][r]: el grupo más largo (en letras) al partir palabras[i..] en r grupos; Infinity si no se puede.
    const memo = new Map();
    const peor = (i, r) => {
      if (i === n) return r === 0 ? 0 : Infinity;
      if (r === 0) return Infinity;
      const clave = i * 100 + r;
      if (memo.has(clave)) return memo.get(clave).v;
      let mejor = { v: Infinity, j: -1 };
      for (let j = i + 1; j <= n && cabe(i, j); j++) {
        const v = Math.max(largo(i, j), peor(j, r - 1));
        if (v < mejor.v) mejor = { v, j };
      }
      memo.set(clave, mejor);
      return mejor.v;
    };
    if (peor(0, k) === Infinity) continue;
    const grupos = [];
    for (let i = 0, r = k; i < n; r--) { const j = memo.get(i * 100 + r).j; grupos.push(palabras.slice(i, j)); i = j; }
    return grupos;
  }
  return palabras.map((p) => [p]);
}

/**
 * Los grupos del video entero. → [{ escena, palabras: [{ texto, desde, hasta }], clave, desde, hasta }], en segundos del
 * video; `hasta` es cuando se apaga. Cada escena se parte en trozos de frase (puntos, interrogaciones, comas); un trozo
 * de una sola palabra se junta con el siguiente («Primero, un examen…»), y cada trozo se reparte parejo. Pura.
 */
export function gruposDeSubtitulos(linea, { maxPalabras = 4, maxCaracteres = 22 } = {}) {
  const grupos = [];
  for (const [k, escena] of (linea?.escenas ?? []).entries()) {
    // Los trozos de frase de la escena.
    const trozos = [];
    let actual = [];
    for (const p of escena.palabras ?? []) {
      const texto = textoDeSubtitulo(p.texto);
      if (!texto) continue;
      actual.push({ texto, desde: p.desde, hasta: Math.max(p.hasta, p.desde) });
      if (cierraTrozo(p.texto)) { trozos.push(actual); actual = []; }
    }
    if (actual.length) trozos.push(actual);
    // Una palabra sola va con el trozo siguiente (o, si es la última, con el anterior).
    const juntos = [];
    for (let i = 0; i < trozos.length; i++) {
      if (trozos[i].length === 1 && i + 1 < trozos.length) { trozos[i + 1] = [...trozos[i], ...trozos[i + 1]]; continue; }
      if (trozos[i].length === 1 && juntos.length) { juntos[juntos.length - 1] = [...juntos.at(-1), ...trozos[i]]; continue; }
      juntos.push(trozos[i]);
    }
    for (const trozo of juntos) {
      for (const palabras of partirParejo(trozo, maxPalabras, maxCaracteres)) grupos.push({ escena: k, palabras });
    }
  }
  // Cuándo se ve cada uno: desde su primera palabra; hasta que empieza el siguiente, o un poco después de su última.
  grupos.forEach((g, i) => {
    g.clave = palabraClave(g.palabras.map((p) => p.texto));
    g.desde = g.palabras[0].desde;
    const ultima = g.palabras.at(-1).hasta;
    const siguiente = grupos[i + 1]?.palabras[0].desde ?? Infinity;
    g.hasta = Math.max(ultima, Math.min(siguiente, ultima + COLA_GRUPO));
  });
  return grupos;
}

/** El grupo que se ve en `t`, o null. Pura. */
export function grupoEn(grupos, t) {
  for (const g of grupos) {
    if (t < g.desde) return null;
    if (t < g.hasta) return g;
  }
  return null;
}

/**
 * El estado de cada palabra del grupo en `t`: «dicha», «diciendo» (con `salto` de 0 a 1 mientras empieza) o
 * «falta». La que se está diciendo es la última que ya empezó. Pura.
 */
export function estadoDePalabras(grupo, t) {
  let actual = -1;
  grupo.palabras.forEach((p, i) => { if (t >= p.desde) actual = i; });
  return grupo.palabras.map((p, i) => {
    if (i > actual) return { estado: "falta", salto: 0 };
    if (i < actual) return { estado: "dicha", salto: 0 };
    return { estado: "diciendo", salto: Math.min(1, Math.max(0, (t - p.desde) / SALTO)) };
  });
}
