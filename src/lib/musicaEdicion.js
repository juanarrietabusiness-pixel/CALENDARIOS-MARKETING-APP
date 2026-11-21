// ============================================================
// La MÚSICA cortada al montaje, en límites de COMPÁS (puro)
//
// Rofer v2 (musica_suno.py): la canción de Suno se cortó en tramos de compases enteros y cada tramo se pegó en un
// instante del video —el drop entra en un corte con energía, el quiebre (un compás) queda bajo el inicio del llamado,
// el drop vuelve justo en «escríbenos» y el final de la canción cae en el cierre—. Aquí se escribe eso como datos:
//
//   tramos: [{ cancion: [desde, hasta | null], video: dónde empieza en el video }]   (segundos; null = hasta el final)
//
// `montarCancion` lo comprueba (que los tramos se toquen sin huecos ni solapes en el video, que cada costura caiga en
// un compás de la canción) y devuelve los cortes exactos que pega kit-edicion/python/musica.py con fundidos de 12 ms.
// La rejilla (dónde empieza el primer compás y cuánto dura un pulso) la mide kit-edicion/python/compases.py con librosa.
// ============================================================

const r3 = (n) => Math.round(n * 1000) / 1000;

/** La rejilla de compases de una canción: compas(m) = inicio del compás m (desde 0). Pura. */
export function rejilla({ a0, pulso, pulsosPorCompas = 4 }) {
  const compas = pulso * pulsosPorCompas;
  return {
    compas,
    en: (m) => a0 + m * compas,
    /** El compás más cercano a t (en compases, con decimales si no cae justo). */
    deTiempo: (t) => (t - a0) / compas,
  };
}

/** ¿t cae en una línea de compás (con `tolerancia` en segundos)? Pura. */
export function enCompas(r, t, tolerancia = 0.02) {
  const m = r.deTiempo(t);
  return Math.abs(m - Math.round(m)) * r.compas <= tolerancia;
}

/**
 * Los cortes de la canción para el video. → { tramos: [{ cancion0, cancion1, video0, video1 }], avisos: [], errores: [] }.
 * Errores: tramos que se pisan o dejan un hueco en el video, o que se salen de la canción. Avisos: costuras que no caen en
 * compás (se oyen) y un video que se queda sin música antes del final. Pura.
 */
export function montarCancion({ a0, pulso, pulsosPorCompas = 4, duracionCancion, duracionVideo, tramos }) {
  const r = rejilla({ a0, pulso, pulsosPorCompas });
  const errores = [];
  const avisos = [];
  const fuera = [];
  for (const [k, t] of (tramos ?? []).entries()) {
    const [c0, c1Pedido] = t.cancion ?? [];
    const c1 = c1Pedido ?? duracionCancion;
    if (!(c0 >= 0) || !(c1 > c0)) { errores.push(`Tramo ${k + 1}: la canción va de ${c0} a ${c1Pedido}: el final tiene que ir después del principio.`); continue; }
    if (c1 > duracionCancion + 0.01) errores.push(`Tramo ${k + 1}: la canción dura ${r3(duracionCancion)} s y el tramo pide hasta ${r3(c1)} s.`);
    const v0 = Number(t.video);
    if (!(v0 >= -0.5)) { errores.push(`Tramo ${k + 1}: falta dónde empieza en el video («video»).`); continue; }
    fuera.push({ cancion0: r3(c0), cancion1: r3(c1), video0: r3(v0), video1: r3(v0 + c1 - c0) });
  }
  for (let k = 1; k < fuera.length; k++) {
    const d = fuera[k].video0 - fuera[k - 1].video1;
    if (Math.abs(d) > 0.02) errores.push(`Entre el tramo ${k} y el ${k + 1} ${d > 0 ? `hay un hueco de ${r3(d)} s` : `se pisan ${r3(-d)} s`} en el video: el ${k + 1} tiene que empezar en ${fuera[k - 1].video1} s.`);
  }
  fuera.forEach((t, k) => {
    // La primera entrada y el final de la canción pueden caer donde sea: el resto son costuras y se oyen fuera de compás.
    if (k > 0 && !enCompas(r, t.cancion0)) avisos.push(`El tramo ${k + 1} empieza en ${t.cancion0} s de la canción, que no es un compás (el más cercano: ${r3(r.en(Math.round(r.deTiempo(t.cancion0))))} s).`);
    if (k < fuera.length - 1 && !enCompas(r, t.cancion1)) avisos.push(`El tramo ${k + 1} acaba en ${t.cancion1} s de la canción, que no es un compás (el más cercano: ${r3(r.en(Math.round(r.deTiempo(t.cancion1))))} s).`);
  });
  const ultimo = fuera[fuera.length - 1];
  if (ultimo && duracionVideo && ultimo.video1 < duracionVideo - 0.05) avisos.push(`La música se acaba en ${ultimo.video1} s y el video dura ${r3(duracionVideo)} s.`);
  if (!fuera.length && !errores.length) errores.push("Faltan los tramos de la música.");
  return { tramos: fuera, avisos, errores, compas: r3(r.compas) };
}

/**
 * Para colocar un tramo de `compases` compases que tiene que ACABAR justo en `t` del video (el quiebre antes del llamado):
 * dónde empieza en el video. Pura.
 */
export const empiezaAntesDe = (r, t, compases = 1) => r3(t - compases * r.compas);
