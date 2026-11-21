// ============================================================
// El CORTE de un video grabado (puro): de los clips con sus palabras a la línea de tiempo del montaje
//
// Lo que hizo a mano el chat de Rofer v2 (cortar.py, cortar3.py y build_data.py), como funciones que se prueban aquí y
// que el KIT DE PIEZAS lleva dentro (el empaquetador copia este archivo al zip: kit-edicion/, docs de la propuesta §9.1).
// Python mide (la transcripción por palabra y la energía del audio cada 10 ms); esto DECIDE:
//
//   1. Los límites de cada toma: el punto más callado justo antes de la primera palabra y justo después de la última.
//   2. Los silencios, RELATIVOS A LA VOZ (no un umbral fijo): lo que está por debajo de (voz + umbral) más de `minimo`
//      segundos se deja en `queda` segundos (OFICIO.silencio: −18 dB, 0,16 s → 0,10 s), salvo que el corte quite menos
//      de 0,1 s (se vería el salto sin que se oiga el silencio); y una pieza sin ninguna palabra (una respiración) se va.
//   3. Las palabras que no van (una toma repetida, un «Contáctanos» que sobra): se quitan por su índice y la toma se parte
//      donde estaban. Las tomas repetidas se SUGIEREN (`tomasRepetidas`); decide quien edita.
//   4. La línea de tiempo: cada pieza con su tiempo de origen y de salida (con la velocidad del clip: atempo), los cortes,
//      los cambios de clip y los saltos dentro de un clip, y cómo pasar un instante de origen a la salida.
//   5. Los grupos de subtítulos: solos (por puntuación y hasta 4 palabras) o desde el texto que escribe quien edita, con
//      `*` en las palabras clave y la corrección de lo que el reconocimiento oyó mal.
//
// La energía llega como { paso: 0.01, db: [dB RMS de cada ventana de 10 ms] } (kit-edicion/python/energia.py).
// ============================================================

import { OFICIO } from "./oficioEdicion.js";

const r3 = (n) => Math.round(n * 1000) / 1000;

/** dB RMS medio entre t0 y t1 (la media de la POTENCIA de las ventanas, no de los dB). Pura. */
export function dbEntre(energia, t0, t1) {
  const { paso, db } = energia;
  const i0 = Math.max(0, Math.floor(t0 / paso));
  const i1 = Math.min(db.length, Math.max(i0 + 1, Math.ceil(t1 / paso)));
  let suma = 0;
  for (let i = i0; i < i1; i++) suma += 10 ** (db[i] / 10);
  return i1 > i0 ? 10 * Math.log10(suma / (i1 - i0) + 1e-12) : -120;
}

/** El centro de la ventana de ~20 ms más callada entre t0 y t1. Pura. */
export function puntoCallado(energia, t0, t1, ventana = 0.02) {
  const { paso, db } = energia;
  const n = Math.max(1, Math.round(ventana / paso));
  const i0 = Math.max(0, Math.floor(t0 / paso));
  const i1 = Math.min(db.length, Math.ceil(t1 / paso));
  if (i1 - i0 <= n) return (t0 + t1) / 2;
  let mejor = Infinity;
  let donde = i0;
  for (let i = i0; i + n <= i1; i++) {
    let p = 0;
    for (let k = i; k < i + n; k++) p += 10 ** (db[k] / 10);
    if (p < mejor) { mejor = p; donde = i; }
  }
  return (donde + n / 2) * paso;
}

/**
 * Las tomas de un clip: las palabras que quedan, partidas donde se quitaron otras. → [[índices de palabra]].
 * `excluir`: [[desde, hasta]] índices de palabra (incluidos) que no van. Pura.
 */
export function tomasDelClip(palabras, excluir = []) {
  const fuera = new Set();
  for (const [a, b] of excluir) for (let i = a; i <= (b ?? a); i++) fuera.add(i);
  const tomas = [];
  let actual = [];
  palabras.forEach((_, i) => {
    if (fuera.has(i)) { if (actual.length) tomas.push(actual); actual = []; return; }
    actual.push(i);
  });
  if (actual.length) tomas.push(actual);
  return tomas;
}

/**
 * Las PIEZAS de una toma: sus límites en el punto callado y los silencios largos acortados. → [[src0, src1]]. Pura.
 * Lo mismo que cortar.py + cortar3.py de Rofer v2.
 */
export function piezasDeToma(palabras, energia, { silencio = OFICIO.silencio } = {}) {
  const primera = palabras[0];
  const ultima = palabras[palabras.length - 1];
  const tIn = puntoCallado(energia, Math.max(0, primera.s - 0.28), primera.s - 0.04);
  const tOut = puntoCallado(energia, ultima.e + 0.04, ultima.e + 0.3);
  const habla = dbEntre(energia, primera.s, ultima.e);
  const ini = Math.max(tIn, primera.s - 0.08);
  const fin = Math.min(tOut, ultima.e + 0.12);
  const { paso, db } = energia;
  const margen = silencio.queda / 2;
  const piezas = [];
  let cur = ini;
  let k = Math.floor(ini / paso);
  const kFin = Math.min(db.length, Math.ceil(fin / paso));
  while (k < kFin) {
    if (db[k] < habla + silencio.umbralDb) {
      let j = k;
      while (j < kFin && db[j] < habla + silencio.umbralDb) j++;
      const q0 = k * paso;
      const q1 = Math.min(j, kFin - 1) * paso;
      const quita = q1 - q0 - silencio.queda;
      if (q1 - q0 > silencio.minimo && quita >= (silencio.quitarMinimo ?? 0) && q0 > ini + 0.05 && q1 < fin - 0.05) {
        piezas.push([cur, q0 + margen]);
        cur = q1 - margen;
      }
      k = j;
    } else k++;
  }
  piezas.push([cur, fin]);
  // Una pieza sin ninguna palabra dentro es una respiración o un ruido entre frases: fuera.
  const conVoz = piezas.filter(([a, b]) => palabras.some((w) => w.s < b && w.e > a));
  return conVoz.map(([a, b]) => [r3(a), r3(b)]);
}

/**
 * Todas las piezas de un clip con sus tomas. → { piezas: [[src0, src1]], palabras: [índices que quedan] }. Pura.
 */
export function corteDelClip(palabras, energia, { excluir = [], silencio } = {}) {
  const tomas = tomasDelClip(palabras, excluir);
  const piezas = tomas.flatMap((t) => piezasDeToma(t.map((i) => palabras[i]), energia, { silencio }));
  return { piezas, palabras: tomas.flat() };
}

/**
 * La LÍNEA DE TIEMPO del montaje: los clips en orden, cada uno con sus piezas y su velocidad (atempo: el tono no cambia).
 * `clips`: [{ id, piezas: [[src0, src1]], velocidad? }]. `cierre`: segundos sin voz al final (logo y llamado). Pura.
 */
export function lineaDeTiempo(clips, { fps = 30, cierre = OFICIO.cierre.segundos } = {}) {
  const piezas = [];
  let t = 0;
  for (const c of clips) {
    const vel = Number(c.velocidad) > 0 ? Number(c.velocidad) : 1;
    for (const [a, b] of c.piezas) {
      const d = (b - a) / vel;
      piezas.push({ clip: c.id, src0: a, src1: b, vel, out0: r3(t), out1: r3(t + d) });
      t += d;
    }
  }
  const vozFin = r3(t);
  const cortes = piezas.slice(1).map((p) => p.out0);
  const cambiosClip = piezas.slice(1).filter((p, i) => p.clip !== piezas[i].clip).map((p) => p.out0);
  return {
    fps, piezas, vozFin, cierre,
    total: Math.round((t + cierre) * fps),
    cortes, cambiosClip,
    saltos: cortes.filter((c) => !cambiosClip.includes(c)),
  };
}

/** Un instante de ORIGEN de un clip → segundos de SALIDA (en un hueco recortado: el inicio de la pieza siguiente). Pura. */
export function aSalida(linea, clip, ts) {
  const delClip = linea.piezas.filter((p) => p.clip === clip);
  const p = delClip.find((x) => x.src0 - 0.02 <= ts && ts <= x.src1 + 0.02);
  if (p) return p.out0 + (Math.min(Math.max(ts, p.src0), p.src1) - p.src0) / p.vel;
  const sig = delClip.find((x) => x.src0 > ts);
  return sig ? sig.out0 : null;
}

/** Cada segundo de salida → [clip, cuadro de origen] (o null en el cierre). Lo que pinta la imagen (Fase 2b). Pura. */
export function cuadrosDeOrigen(linea) {
  const { fps, total, piezas } = linea;
  const fuera = [];
  let k = 0;
  for (let f = 0; f < total; f++) {
    const tt = f / fps;
    while (k < piezas.length && tt >= piezas[k].out1) k++;
    const p = piezas[k];
    fuera.push(p && tt >= p.out0 ? [p.clip, Math.round((p.src0 + (tt - p.out0) * p.vel) * fps)] : null);
  }
  return fuera;
}

/** Las palabras que quedan, en tiempo de SALIDA y en orden: { w, s, e, clip, i }. Pura. */
export function palabrasEnSalida(linea, clips) {
  const fuera = [];
  for (const c of clips) {
    for (const i of c.quedan) {
      const w = c.palabras[i];
      const s = aSalida(linea, c.id, w.s);
      const e = aSalida(linea, c.id, w.e);
      if (s === null) continue;
      fuera.push({ w: String(w.w).trim(), s: r3(s), e: r3(Math.max(e ?? s, s + 0.08)), clip: c.id, i });
    }
  }
  return fuera;
}

/** Para comparar palabras: minúsculas, sin tildes ni puntuación. Pura. */
export const normalizar = (s) => String(s ?? "").toLowerCase().normalize("NFD")
  .replace(/ñ/g, "ñ") // la ñ no es una n con tilde: «año» no es «ano»
  .replace(/[̀-ͯ]/g, "").replace(/[^a-zñ0-9]/g, "");

/**
 * Las TOMAS REPETIDAS que se ven en la transcripción: la misma secuencia de `minimo` palabras o más dicha dos veces en
 * un clip. Sugiere quitar la PRIMERA (casi siempre la segunda sale mejor); decide quien edita. → [{ quitar: [a, b], porque }].
 */
export function tomasRepetidas(palabras, { minimo = 3 } = {}) {
  const n = palabras.map((p) => normalizar(p.w));
  const fuera = [];
  for (let i = 0; i < n.length; i++) {
    for (let j = i + minimo; j < n.length; j++) {
      let k = 0;
      while (j + k < n.length && i + k < j && n[i + k] && n[i + k] === n[j + k]) k++;
      if (k >= minimo) {
        fuera.push({ quitar: [i, j - 1], porque: `«${palabras.slice(i, i + k).map((p) => p.w.trim()).join(" ")}» se dice otra vez desde la palabra ${j}` });
        i = j - 1;
        break;
      }
    }
  }
  return fuera;
}

/** Grupos de subtítulos solos: cortan en la puntuación y a las `maxPalabras`. → [[índices]]. Pura. */
export function gruposDeSubtitulos(palabras, { maxPalabras = OFICIO.subtitulos.maxPalabras } = {}) {
  const grupos = [];
  let g = [];
  palabras.forEach((p, i) => {
    g.push(i);
    if (g.length >= maxPalabras || /[.,;:?!¿¡]$/.test(String(p.w).trim())) { grupos.push(g); g = []; }
  });
  if (g.length) grupos.push(g);
  return grupos;
}

/**
 * Los grupos desde el TEXTO que escribe quien edita (como el CHUNKS de Rofer v2): una cadena por grupo, `*` delante de
 * la palabra clave, y lo que se enseña puede corregir lo que oyó el reconocimiento (`reemplazos`: { oído: dicho }, en
 * normalizado: { hora: "obra" }). Comprueba palabra por palabra contra lo transcrito y dice dónde no casa.
 * → { grupos: [[índices]], palabras: [{ ...palabra, texto, clave }] } o { error }. Pura.
 */
export function gruposDesdeTexto(palabras, textos, { reemplazos = {}, maxPalabras = OFICIO.subtitulos.maxPalabras } = {}) {
  const fuera = palabras.map((p) => ({ ...p, texto: String(p.w).trim(), clave: false }));
  const grupos = [];
  let i = 0;
  for (const [g, texto] of textos.entries()) {
    const toks = String(texto).trim().split(/\s+/).filter(Boolean);
    if (toks.length > maxPalabras) return { error: `El grupo ${g + 1} («${texto}») tiene ${toks.length} palabras: como mucho ${maxPalabras}.` };
    const idx = [];
    for (const t of toks) {
      const clave = t.startsWith("*");
      const limpio = t.replace(/^\*/, "");
      const p = fuera[i];
      if (!p) return { error: `Sobra «${limpio}» en el grupo ${g + 1}: ya no quedan palabras transcritas.` };
      const oido = normalizar(p.w);
      const dicho = normalizar(limpio);
      if (oido !== dicho && normalizar(reemplazos[oido]) !== dicho) {
        return { error: `No casa en el grupo ${g + 1}: se transcribió «${p.texto}» (palabra ${i}) y el texto dice «${limpio}». Si el reconocimiento se equivocó, ponlo en reemplazos.` };
      }
      p.texto = limpio;
      p.clave = clave;
      idx.push(i);
      i++;
    }
    grupos.push(idx);
  }
  if (i !== fuera.length) return { error: `Faltan grupos: quedan ${fuera.length - i} palabras sin subtítulo desde «${fuera[i].texto}» (palabra ${i}).` };
  return { grupos, palabras: fuera };
}
