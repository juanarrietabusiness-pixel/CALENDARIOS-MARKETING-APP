// ============================================================
// La CÁMARA VIRTUAL de un video grabado (puro): cuánto se acerca y a dónde mira en cada cuadro
//
// Lo que hizo datos_remotion.py en Rofer v2, como función: por cada TRAMO del montaje (una pieza de la línea de tiempo)
// un plano —abierto (≈1,12–1,15) o medio (≈1,45–1,5), alternando en cada corte—, la cabeza siguiendo su sitio en pantalla
// suavizada y sólo al 55 % de lo que se mueve, un acercamiento lento a lo largo del tramo y un pequeño golpe de zoom al
// entrar. Si la persona está lejos (ocupa poco del alto), el plano se acerca más, hasta 2× (más se ve blando). Nunca se ve
// el borde del cuadro: la traslación se acota.
//
// La geometría viene de la máscara de la persona (kit-edicion/python/persona.py): por cuadro de ORIGEN, `top` (el tope
// real de la cabeza o del casco), `hx` (su centro), `hw` (su ancho) y `bot` (los pies). Devuelve, por cuadro de SALIDA, la
// cámara [z, tx, ty] (escala desde la esquina y traslación, en px de 1080×1920) y dónde queda la cabeza en pantalla
// [x, tope, ancho]: con eso se colocan los textos con aire sobre la cabeza y se revisa que nada la tape.
// ============================================================

import { OFICIO } from "./oficioEdicion.js";

export const ANCHO = 1080;
export const ALTO = 1920;
const r1 = (n) => Math.round(n * 10) / 10;
const r4 = (n) => Math.round(n * 10000) / 10000;

/** Suavizado gaussiano con los bordes repetidos (como gaussian_filter1d 'nearest'). Pura. */
export function suavizar(valores, sigma = 9) {
  const n = valores.length;
  if (!n || sigma <= 0) return [...valores];
  const radio = Math.ceil(sigma * 4);
  const pesos = Array.from({ length: 2 * radio + 1 }, (_, i) => Math.exp(-((i - radio) ** 2) / (2 * sigma * sigma)));
  const total = pesos.reduce((a, b) => a + b, 0);
  return valores.map((_, i) => {
    let s = 0;
    for (let k = -radio; k <= radio; k++) s += pesos[k + radio] * valores[Math.min(n - 1, Math.max(0, i + k))];
    return s / total;
  });
}

/** El plano de partida de cada tramo, alternando abierto y medio; la persona lejos, más cerca. Pura. */
export function planosAutomaticos(tramos, { camara = OFICIO.camara } = {}) {
  const abierto = (camara.abierto[0] + camara.abierto[1]) / 2;
  const medio = (camara.medio[0] + camara.medio[1]) / 2;
  return tramos.map((t, k) => {
    let z = k % 2 === 0 ? abierto : medio;
    // La persona ocupa `alto` px del cuadro (del tope de la cabeza a los pies): en un plano abierto se quiere al menos
    // ~1000 px de persona y en uno medio ~1300; si con el zoom no llega, se acerca más (hasta el tope). Calibrado con
    // Rofer v2: el gancho (Alex de cuerpo entero) quedó abierto a 1,12 y el llamado (Alex lejos) a 1,40–2,0.
    if (t.alto > 0) {
      const objetivo = k % 2 === 0 ? 1000 : 1300;
      if (t.alto * z < objetivo) z = Math.min(camara.maxAcercar, objetivo / t.alto);
    }
    // Dónde queda el tope de la cabeza en pantalla: más abajo en el abierto (aire para el texto gigante arriba).
    return { z: r4(z), x: ANCHO / 2, y: k % 2 === 0 ? 640 : 560, golpe: k > 0 ? 0.045 : 0 };
  });
}

/**
 * La cámara de todo el video. `linea`: la de corteEdicion.lineaDeTiempo; `geometria`: { clip: { cuadro: {top, hx, hw,
 * bot} } }; `planos`: uno por tramo ({ z, x, y, golpe }), o los automáticos; lo que traiga `plan` por tramo pisa al
 * automático. → { cam: [[z, tx, ty]], cabeza: [[x, tope, ancho] | null], planos }. Pura.
 */
export function camaraDelVideo(linea, geometria, { planos = null, camara = OFICIO.camara, sigma = 9 } = {}) {
  const { fps, total, piezas } = linea;
  // Geometría de cada tramo, cuadro a cuadro, rellenando huecos con la última conocida.
  const tramos = piezas.map((p) => {
    const f0 = Math.round(p.out0 * fps);
    const f1 = Math.min(Math.round(p.out1 * fps), total);
    const geo = geometria?.[p.clip] ?? {};
    const cuadros = [];
    let ultima = null;
    for (let f = f0; f < f1; f++) {
      const src = Math.round((p.src0 + (f / fps - p.out0) * p.vel) * fps);
      ultima = geo[src] ?? geo[String(src)] ?? ultima;
      cuadros.push({ f, g: ultima });
    }
    const primera = cuadros.find((c) => c.g)?.g ?? { top: 500, hx: ANCHO / 2, hw: 200, bot: 1800 };
    for (const c of cuadros) c.g = c.g ?? primera;
    const alto = cuadros.length ? cuadros.reduce((s, c) => s + (c.g.bot - c.g.top), 0) / cuadros.length : 0;
    return { cuadros, alto };
  });
  const auto = planosAutomaticos(tramos, { camara });
  const usados = auto.map((a, k) => ({ ...a, ...(planos?.[k] ?? {}) }));

  const cam = Array.from({ length: total }, () => [1, 0, 0]);
  const cabeza = Array.from({ length: total }, () => null);
  tramos.forEach(({ cuadros }, k) => {
    if (!cuadros.length) return;
    const { z: z0, x: X, y: Y, golpe } = usados[k];
    const hx = cuadros.map((c) => c.g.hx);
    const top = cuadros.map((c) => c.g.top);
    const mx = hx.reduce((a, b) => a + b, 0) / hx.length;
    const mt = top.reduce((a, b) => a + b, 0) / top.length;
    const sx = suavizar(hx, sigma);
    const st = suavizar(top, sigma);
    const n = cuadros.length;
    cuadros.forEach(({ f, g }, j) => {
      // Sigue sólo una parte del movimiento (OFICIO.camara.seguir), alrededor de la media del tramo.
      const hxe = mx + camara.seguir * (sx[j] - mx);
      const tpe = mt + camara.seguir * (st[j] - mt);
      let z = z0 * (1 + 0.035 * (j / Math.max(1, n - 1)));
      if (golpe) z *= 1 + golpe * Math.exp(-j / (golpe > 0.06 ? 3 : 2.4));
      const tx = Math.min(0, Math.max(ANCHO - ANCHO * z, X - hxe * z));
      const ty = Math.min(0, Math.max(ALTO - ALTO * z, Y - tpe * z));
      cam[f] = [r4(z), r1(tx), r1(ty)];
      cabeza[f] = [r1(tx + hxe * z), r1(ty + tpe * z), r1(g.hw * z)];
    });
  });
  return { cam, cabeza, planos: usados };
}
