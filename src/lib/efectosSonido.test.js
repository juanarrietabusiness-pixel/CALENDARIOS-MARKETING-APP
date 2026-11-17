import { describe, it, expect } from "vitest";
import { limpiarSonido } from "./sonidoVideo.js";
import { sintetizar, mezclarColocados, muestrasDeEfecto, MAX_EFECTO_PROPIO } from "./efectosSonido.js";
import { BYTES_MUESTRA } from "./renderVideo.js";

// ============================================================
// Los EFECTOS de la biblioteca de sonido: suenan en vez del whoosh y del pop sintetizados, en el mismo instante y al
// mismo nivel bajito; lo guardado en el sonido del video se limpia
// ============================================================

const M = 1000;

/** Un PCM s16le estéreo de `seg` segundos: `silencio` s callado y luego un tono de amplitud `a`. */
function pcm(seg, { a = 0.5, silencio = 0, hasta = seg } = {}) {
  const b = new Uint8Array(Math.round(seg * M) * BYTES_MUESTRA);
  const v = new DataView(b.buffer);
  for (let i = Math.round(silencio * M); i < Math.round(hasta * M); i++) {
    const x = Math.round(a * 32767 * Math.sin(i * 0.9));
    v.setInt16(i * BYTES_MUESTRA, x, true); v.setInt16(i * BYTES_MUESTRA + 2, x, true);
  }
  return b;
}
function rmsEntre(b, desde, hasta) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let s = 0, n = 0;
  for (let i = Math.round(desde * M); i < Math.round(hasta * M); i++) { s += (v.getInt16(i * BYTES_MUESTRA, true) / 32768) ** 2; n++; }
  return Math.sqrt(s / Math.max(1, n));
}

/** El RMS de lo que se le SUMÓ a la voz (la mezcla menos la voz) en [desde, hasta). */
function rmsDelEfecto(mezcla, voz, desde, hasta) {
  const a = new DataView(mezcla.buffer, mezcla.byteOffset, mezcla.byteLength);
  const b = new DataView(voz.buffer, voz.byteOffset, voz.byteLength);
  let s = 0, n = 0;
  for (let i = Math.round(desde * M); i < Math.round(hasta * M); i++) {
    s += ((a.getInt16(i * BYTES_MUESTRA, true) - b.getInt16(i * BYTES_MUESTRA, true)) / 32768) ** 2; n++;
  }
  return Math.sqrt(s / Math.max(1, n));
}

describe("los efectos de la biblioteca en el video animado", () => {
  it("el sonido guarda un efecto por sitio (transiciones y sellos), sólo si hay alguno; claves de un cliente o de la agencia", () => {
    expect(limpiarSonido({ efectosPropios: {} })).toEqual({ efectos: true, musica: null });
    const s = limpiarSonido({
      efectos: true,
      efectosPropios: { transicion: "e1", sello: { archivoId: "e2", clave: "biblioteca/u1/efecto/x.mp3", nombre: " Ding ", de: "agencia" }, otro: "e3" },
    });
    expect(s.efectosPropios).toEqual({ transicion: { archivoId: "e1", nombre: "" }, sello: { archivoId: "e2", clave: "biblioteca/u1/efecto/x.mp3", nombre: "Ding", de: "agencia" } });
    expect(limpiarSonido({ efectosPropios: { sello: { archivoId: "e2", clave: "voces/x.mp3" } } }).efectosPropios.sello.clave).toBeUndefined();
    expect(limpiarSonido({ efectosPropios: { sello: "no vale!" } }).efectosPropios).toBeUndefined();
    // La música de la agencia también se guarda con su clave y su marca.
    expect(limpiarSonido({ musica: { archivoId: "m1", clave: "biblioteca/u1/musica/t.mp3", de: "agencia", volumen: 2 } }).musica)
      .toEqual({ archivoId: "m1", clave: "biblioteca/u1/musica/t.mp3", nombre: "", volumen: 2, de: "agencia" });
  });

  it("las muestras de un efecto subido: mono, sin el silencio del principio, con el pico en 1 y como mucho 4 s", () => {
    const s = muestrasDeEfecto(pcm(1, { a: 0.25, silencio: 0.3 }), M);
    expect(s.length).toBeGreaterThan(690);
    expect(s.length).toBeLessThanOrEqual(700);
    expect(Math.max(...s.map(Math.abs))).toBeCloseTo(1, 1);
    expect(Math.abs(s[0])).toBeGreaterThan(0.02);
    const largo = muestrasDeEfecto(pcm(9, { a: 0.5 }), M);
    expect(largo.length).toBe(MAX_EFECTO_PROPIO * M);
    expect(Math.abs(largo.at(-1))).toBeLessThan(0.05);
    expect(muestrasDeEfecto(new Uint8Array(400), M)).toHaveLength(0);
  });

  it("suena en su instante y al mismo nivel que el de la aplicación al que sustituye (por el RMS de lo que suena)", () => {
    const voz = pcm(5, { a: 0.4 });
    const m = { i: 0, clave: "x", en: 2, golpe: 2, db: 0, sobreFondo: 6, volumen: 0 };
    const mezclar = (s) => {
      const pista = new Uint8Array(voz.byteLength);
      mezclarColocados(pista, [m], new Map([["x", s]]), { habla: voz, muestreo: M });
      return pista;
    };
    // Un «ding» de 0,4 s con medio segundo de silencio delante y otro detrás.
    const ding = muestrasDeEfecto(pcm(1.4, { a: 0.9, silencio: 0.5, hasta: 0.9 }), M);
    const conPropio = mezclar(ding);
    const conSintetizado = mezclar(sintetizar("pop", M));
    // Antes del instante, nada; justo después, sí (el silencio del principio del archivo no lo retrasa).
    expect(rmsEntre(conPropio, 1, 1.99)).toBe(0);
    expect(rmsEntre(conPropio, 2, 2.1)).toBeGreaterThan(0.001);
    // El mismo nivel: el RMS de lo que suena del efecto, no el del archivo entero con sus silencios.
    const sint = sintetizar("pop", M);
    const silencio = new Uint8Array(voz.byteLength);
    const propio = rmsDelEfecto(conPropio, silencio, 2, 2 + ding.length / M);
    const sintetizado = rmsDelEfecto(conSintetizado, silencio, 2, 2 + sint.length / M);
    expect(propio / sintetizado).toBeGreaterThan(0.8);
    expect(propio / sintetizado).toBeLessThan(1.25);
    expect(conSintetizado).not.toEqual(conPropio);
    // Sin sus muestras, no suena y se dice.
    const sin = mezclarColocados(new Uint8Array(voz.byteLength), [m], new Map(), { habla: voz, muestreo: M });
    expect(sin.sinArchivo).toHaveLength(1);
    expect(sin.medidas).toHaveLength(0);
  });
});
