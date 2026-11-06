// ============================================================
// El TEXTO CON CARÁCTER del video animado (puro: sólo mide con el lienzo que le dan)
//
// Lo que las referencias de estilo de la agencia piden y el texto de siempre no hacía (un titular en dos o tres líneas,
// un solo tamaño, un solo color):
//
//   · ÉNFASIS por palabra: lo que va entre *asteriscos* («LAS MANOS *MÁS BELLAS* DE LA HISTORIA») sale más grande, con
//     la letra de impacto y en el color de acento. Un asterisco suelto (una nota al pie) se dibuja tal cual: un guion de
//     antes que lo traía no cambia de significado.
//   · El rol GIGANTE: una o dos palabras por línea, en MAYÚSCULAS, apiladas, cada línea a TODO el ancho de su caja y con
//     el interlineado apretado (el cartel tipográfico).
//   · PALABRA POR PALABRA (`porPalabra`): cada palabra aparece cuando se DICE (o se canta). Las palabras del texto se
//     casan, en orden, con las del habla de su escena, que ya tienen su tiempo en la línea de tiempo.
//
// La LETRA DE IMPACTO es la del kit si el cliente tiene la suya; si no, la de la CASA (`FUENTE_CASA`, Anton: sans muy
// gruesa, licencia OFL), el mismo archivo en la vista previa (FontFace, src/lib/motorVideoNavegador.js) y en el render
// del Container (container/recursos.mjs): por eso su nombre y su archivo viven aquí, y un test exige que los dos lados
// los lean de aquí.
//
// Aquí se decide DÓNDE va cada palabra y con qué tamaño; lo dibuja el motor (src/lib/motorVideo.js), que es quien sabe
// de colores, placas y animaciones. El reparto lo mide con el mismo código: lo que dice la revisión es lo que sale.
// ============================================================

/** La letra de la casa para titulares de impacto: Anton (Google Fonts, OFL), sólo su peso normal (ya es muy gruesa). */
export const FUENTE_CASA = "Anton";
/** El archivo de la letra de la casa, del paquete npm `@fontsource/anton` (el MISMO en el navegador y en el Container). */
export const ARCHIVO_FUENTE_CASA = "@fontsource/anton/files/anton-latin-400-normal.woff2";
/** La familia de impacto cuando el kit no tiene letra: la de la casa y, detrás, la de respaldo del sistema. */
export const FUENTE_IMPACTO = `"${FUENTE_CASA}", system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
/** El peso con que se pide la letra de la casa (sólo tiene ese: pedir 900 haría que el navegador la engordara a mano). */
export const PESO_CASA = 400;
/** El peso con que se pide la letra del kit en impacto: la más gruesa que tenga. */
export const PESO_IMPACTO_KIT = 900;

/**
 * La familia y el peso de IMPACTO (el rol gigante y el énfasis): la letra del kit si la hay (`familiaKit`, la familia ya
 * registrada) y si no la de la casa. La misma regla en el navegador y en el Container. Pura.
 */
export const impactoDe = (familiaKit = "") => (familiaKit
  ? { familia: familiaKit, peso: PESO_IMPACTO_KIT }
  : { familia: FUENTE_IMPACTO, peso: PESO_CASA });

/** Lo que crece una palabra con énfasis respecto a las de su línea. */
export const ESCALA_ENFASIS = 1.22;
/** El rol gigante: lo más grande que sale una línea (fracción del lado corto: una palabra corta sola no se desborda). */
export const GIGANTE = Object.freeze({ maxTam: 0.36, alto: 0.94, corta: 3, larga: 8, letras: 12 });

const ENFASIS = /\*([^*\n]+)\*/g;
/** ¿Lleva algo entre asteriscos? Pura. */
export const tieneEnfasis = (texto) => /\*[^*\n]+\*/.test(String(texto ?? ""));
/** El texto sin las marcas de énfasis (lo que se LEE: para el texto exacto y para medir). Pura. */
export const sinMarcas = (texto) => String(texto ?? "").replace(ENFASIS, "$1");

/**
 * Las palabras de un texto con su énfasis: [{ texto, enfasis }]. Lo que va entre dos asteriscos lleva énfasis; un
 * asterisco sin pareja se queda como letra. `mayusculas`: todo en mayúsculas. Pura.
 */
export function partirEnfasis(texto, { mayusculas = false } = {}) {
  const t = String(texto ?? "");
  const salida = [];
  const poner = (trozo, enfasis) => {
    for (const p of trozo.split(/\s+/).filter(Boolean)) salida.push({ texto: mayusculas ? p.toUpperCase() : p, enfasis });
  };
  let desde = 0;
  for (const m of t.matchAll(ENFASIS)) {
    poner(t.slice(desde, m.index), false);
    poner(m[1], true);
    desde = m.index + m[0].length;
  }
  poner(t.slice(desde), false);
  return salida;
}

/** Una palabra comparable: sin tildes, sin signos y en minúsculas. Pura. */
export const normalizar = (p) => String(p ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Cuándo se DICE cada palabra de un texto en pantalla: se casan, en orden, con las palabras del habla de su escena
 * (`habla`: [{ texto, desde }] de la línea de tiempo). Una palabra que el habla no dice (un artículo que se cambió, un
 * número escrito en cifras) sale con la anterior; antes de la primera que casa, con la primera que case. → [segundos
 * del video | null] (null: ninguna casa; sale con la capa). Pura.
 */
export function tiemposDePalabras(palabras = [], habla = []) {
  const oidas = (Array.isArray(habla) ? habla : []).map((h) => ({ n: normalizar(h.texto), desde: Number(h.desde) }));
  let j = 0;
  const tiempos = palabras.map((p) => {
    const n = normalizar(typeof p === "string" ? p : p?.texto);
    if (!n) return undefined;
    for (let k = j; k < oidas.length; k++) {
      if (oidas[k].n === n && Number.isFinite(oidas[k].desde)) { j = k + 1; return oidas[k].desde; }
    }
    return undefined;
  });
  // Las que no casan: con la anterior que sí; las primeras, con la primera que casó.
  const primera = tiempos.find((x) => x !== undefined);
  let ultima = primera ?? null;
  return tiempos.map((x) => { if (x !== undefined) { ultima = x; return x; } return ultima; });
}

/** El ancho de las palabras de i a j (sin j) con su espacio. */
const anchoDe = (anchos, espacio, i, j) => anchos.slice(i, j).reduce((a, b) => a + b, 0) + espacio * Math.max(0, j - i - 1);

/** Las líneas (cortes [i, j)) poniendo palabras mientras quepan en `ancho`. Pura. */
export function romperLineas(anchos, espacio, ancho) {
  const cortes = [];
  let i = 0;
  for (let j = 1; j <= anchos.length; j++) {
    if (j - i > 1 && anchoDe(anchos, espacio, i, j) > ancho) { cortes.push([i, j - 1]); i = j - 1; }
  }
  if (i < anchos.length) cortes.push([i, anchos.length]);
  return cortes;
}

/**
 * Las mismas palabras en `n` líneas lo más PAREJAS posible (lo que le falta a cada línea para llenar el ancho, al
 * cuadrado: castiga una línea muy corta). Null si en `n` no caben. Pura.
 */
export function equilibrarLineas(anchos, espacio, ancho, n) {
  const N = anchos.length;
  if (n <= 1 || N <= 1) return anchoDe(anchos, espacio, 0, N) <= ancho || N <= 1 ? [[0, N]] : null;
  const costo = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(Infinity));
  const desde = Array.from({ length: n + 1 }, () => new Array(N + 1).fill(-1));
  costo[0][0] = 0;
  for (let k = 1; k <= n; k++) {
    for (let j = k; j <= N; j++) {
      for (let i = k - 1; i < j; i++) {
        if (costo[k - 1][i] === Infinity) continue;
        const w = anchoDe(anchos, espacio, i, j);
        if (w > ancho && j - i > 1) continue;
        const c = costo[k - 1][i] + (ancho - Math.min(w, ancho)) ** 2;
        if (c < costo[k][j]) { costo[k][j] = c; desde[k][j] = i; }
      }
    }
  }
  if (costo[n][N] === Infinity) return null;
  const cortes = [];
  for (let k = n, j = N; k > 0; k--) { const i = desde[k][j]; cortes.unshift([i, j]); j = i; }
  return cortes;
}

/** La fuente de una palabra: su peso, su tamaño y su familia (las de énfasis, con la letra de impacto). */
const fuenteDe = (p, base, impacto) => (p.enfasis
  ? { fuente: `${impacto.peso} ${Math.round(base.tam * ESCALA_ENFASIS)}px ${impacto.familia}`, tam: base.tam * ESCALA_ENFASIS }
  : { fuente: `${base.peso} ${Math.round(base.tam)}px ${base.familia}`, tam: base.tam });

/** Las palabras medidas con su fuente → [{ ...p, fuente, tam, ancho }]. */
function medirPalabras(ctx, palabras, base, impacto) {
  return palabras.map((p) => {
    const f = fuenteDe(p, base, impacto);
    ctx.font = f.fuente;
    return { ...p, ...f, ancho: ctx.measureText(p.texto).width };
  });
}

/** Las líneas armadas a partir de sus cortes, con su ancho y su alto (el de su palabra más grande). */
function armarLineas(medidas, cortes, espacio, altoRel) {
  return cortes.map(([i, j]) => {
    const palabras = medidas.slice(i, j);
    const tam = Math.max(...palabras.map((p) => p.tam));
    return { palabras, ancho: anchoDe(palabras.map((p) => p.ancho), espacio, 0, palabras.length), alto: tam * altoRel, tam };
  });
}

/**
 * Un texto RICO (con énfasis o palabra por palabra) que tiene que caber en `ancho`: como `encajarTexto`, se empieza en el
 * tamaño del rol y se baja de 6 en 6 % hasta que entra en sus líneas; las líneas se reparten parejas. Cada palabra con
 * su fuente (las de énfasis, más grandes y con la letra de impacto). → { tam, lineas: [{ palabras, ancho, alto, tam }],
 * alto, anchoMax, espacio }. Pura salvo medir.
 */
export function encajarRico(ctx, palabras, { ancho, lado, rol, familia, impacto }) {
  let tam = lado * rol.tam;
  let medidas = []; let cortes = []; let espacio = 0;
  for (let i = 0; i < 12; i++) {
    const base = { tam, peso: rol.peso, familia };
    medidas = medirPalabras(ctx, palabras, base, impacto);
    ctx.font = `${rol.peso} ${Math.round(tam)}px ${familia}`;
    espacio = ctx.measureText(" ").width;
    cortes = romperLineas(medidas.map((p) => p.ancho), espacio, ancho);
    const anchoMax = Math.max(0, ...cortes.map(([a, b]) => anchoDe(medidas.map((p) => p.ancho), espacio, a, b)));
    if (cortes.length <= rol.lineas && anchoMax <= ancho) break;
    tam *= 0.94;
  }
  if (cortes.length > 1) cortes = equilibrarLineas(medidas.map((p) => p.ancho), espacio, ancho, cortes.length) ?? cortes;
  const lineas = armarLineas(medidas, cortes, espacio, rol.alto);
  return { tam, lineas, alto: lineas.reduce((a, l) => a + l.alto, 0), anchoMax: Math.max(0, ...lineas.map((l) => l.ancho)), espacio };
}

/**
 * Los cortes del rol GIGANTE: una o dos palabras por línea. Lo que va con énfasis va en sus propias líneas; una palabra
 * corta («de», «la», «y») se junta con la siguiente; una larga va sola. Pura.
 */
export function lineasGigantes(palabras = []) {
  const letras = (i, j) => palabras.slice(i, j).reduce((n, p) => n + normalizar(p.texto).length, 0);
  const corta = (p) => normalizar(p.texto).length <= GIGANTE.corta;
  // 1. Grupos: las cortas van con la palabra que las sigue («DE LA HISTORIA» es uno); el énfasis corta un grupo.
  const grupos = [];
  let i = 0;
  for (let j = 0; j < palabras.length; j++) {
    const fin = j === palabras.length - 1 || palabras[j + 1].enfasis !== palabras[j].enfasis;
    if (!corta(palabras[j]) || fin) { grupos.push([i, j + 1]); i = j + 1; }
  }
  // 2. Líneas: un grupo, o dos seguidos si ninguno lleva una palabra larga, tienen el mismo énfasis y no pasan de
  //    `GIGANTE.letras` letras entre los dos.
  const cortes = [];
  for (let k = 0; k < grupos.length; k++) {
    const [a, b] = grupos[k];
    const sig = grupos[k + 1];
    const larga = (x, y) => palabras.slice(x, y).some((p) => normalizar(p.texto).length >= GIGANTE.larga);
    if (sig && palabras[a].enfasis === palabras[sig[0]].enfasis && !larga(a, b) && !larga(sig[0], sig[1]) && letras(a, sig[1]) <= GIGANTE.letras) {
      cortes.push([a, sig[1]]);
      k++;
    } else cortes.push([a, b]);
  }
  return cortes;
}

/**
 * El texto GIGANTE: cada línea a TODO el ancho (su tamaño sale de lo que mide la línea), sin pasar de `GIGANTE.maxTam`
 * del lado, y si el bloque no cabe en `maxAlto`, todas las líneas más pequeñas por igual. Con la letra de impacto y en
 * mayúsculas (lo hace quien parte las palabras). → la forma de `encajarRico`. Pura salvo medir.
 */
export function encajarGigante(ctx, palabras, { ancho, lado, maxAlto = Infinity, impacto }) {
  const cortes = lineasGigantes(palabras);
  const MUESTRA = 100;
  const fuente = (t) => `${impacto.peso} ${Math.round(t)}px ${impacto.familia}`;
  ctx.font = fuente(MUESTRA);
  const espacio100 = ctx.measureText(" ").width;
  let tams = cortes.map(([i, j]) => {
    ctx.font = fuente(MUESTRA);
    const w = anchoDe(palabras.slice(i, j).map((p) => ctx.measureText(p.texto).width), espacio100, 0, j - i) || 1;
    return Math.min(lado * GIGANTE.maxTam, (MUESTRA * ancho) / w);
  });
  const total = tams.reduce((a, t) => a + t * GIGANTE.alto, 0);
  if (total > maxAlto) tams = tams.map((t) => (t * maxAlto) / total);
  let espacio = 0;
  const lineas = cortes.map(([i, j], k) => {
    const t = tams[k];
    ctx.font = fuente(t);
    espacio = ctx.measureText(" ").width;
    const medidas = palabras.slice(i, j).map((p) => ({ ...p, fuente: fuente(t), tam: t, ancho: ctx.measureText(p.texto).width }));
    return { palabras: medidas, ancho: anchoDe(medidas.map((p) => p.ancho), espacio, 0, medidas.length), alto: t * GIGANTE.alto, tam: t, espacio };
  });
  return {
    tam: Math.min(...tams), lineas, alto: lineas.reduce((a, l) => a + l.alto, 0),
    anchoMax: Math.max(0, ...lineas.map((l) => l.ancho)), espacio,
  };
}
