import { describe, it, expect } from "vitest";
import { limpiarSonido, nivelDe, hablandoPorVentana, curvaDeDucking, mezclarMusica, MUSICA_BAJO_LA_VOZ, FUNDIDO_MUSICA } from "./sonidoVideo.js";
import { momentosDeEfectos, sintetizar, mezclarEfectos, DURACION_EFECTO } from "./efectosSonido.js";
import { BYTES_MUESTRA } from "./renderVideo.js";
import { validarGuion, lineaDeTiempo } from "./videoEscenas.js";
import { EJEMPLO_GUION } from "./videoFormatoIA.js";

// ============================================================
// Lo que suena debajo de la voz: efectos sintetizados y la música con ducking y fundido
// ============================================================

const M = 1000; // muestras por segundo en las pruebas (pocas: se cuentan a mano)

/** Un PCM s16le estéreo de `seg` segundos con un tono de amplitud `a` (0–1) entre `desde` y `hasta` (lo demás, cero). */
function pcm(seg, { a = 0.5, desde = 0, hasta = seg } = {}) {
  const b = new Uint8Array(Math.round(seg * M) * BYTES_MUESTRA);
  const v = new DataView(b.buffer);
  for (let i = Math.round(desde * M); i < Math.round(hasta * M); i++) {
    const x = Math.round(a * 32767 * Math.sin(i * 0.7));
    v.setInt16(i * BYTES_MUESTRA, x, true); v.setInt16(i * BYTES_MUESTRA + 2, x, true);
  }
  return b;
}
/** El RMS de un trozo [desde, hasta) en segundos, del canal izquierdo. */
function rmsEntre(b, desde, hasta) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let s = 0, n = 0;
  for (let i = Math.round(desde * M); i < Math.round(hasta * M); i++) { s += (v.getInt16(i * BYTES_MUESTRA, true) / 32768) ** 2; n++; }
  return Math.sqrt(s / Math.max(1, n));
}
const db = (x) => 20 * Math.log10(x);

describe("el sonido del video (lo que va aparte del guion)", () => {
  it("se limpia: efectos encendidos por defecto, música con su id, volumen acotado y clave sólo si es de la galería", () => {
    expect(limpiarSonido(null)).toEqual({ efectos: true, musica: null });
    expect(limpiarSonido({ efectos: false })).toEqual({ efectos: false, musica: null });
    expect(limpiarSonido({ musica: { archivoId: "a1", volumen: 40, nombre: "  Mi   tema " } }).musica).toEqual({ archivoId: "a1", nombre: "Mi tema", volumen: 12 });
    expect(limpiarSonido({ musica: { archivoId: "a1", clave: "clientes/c1/estudio/x.mp3" } }).musica.clave).toBe("clientes/c1/estudio/x.mp3");
    expect(limpiarSonido({ musica: { archivoId: "a1", clave: "cerebro/c1/indice.json" } }).musica.clave).toBeUndefined();
    expect(limpiarSonido({ musica: { archivoId: "a1", clave: "clientes/c1/../c2/x.mp3" } }).musica.clave).toBeUndefined();
    expect(limpiarSonido({ musica: { archivoId: "no vale!" } }).musica).toBeNull();
  });

  it("el nivel de la voz no cuenta el silencio insertado", () => {
    const voz = pcm(2, { a: 0.5, desde: 0, hasta: 1 });
    expect(nivelDe(voz)).toBeCloseTo(nivelDe(pcm(1, { a: 0.5 })), 2);
  });

  it("el ducking: abajo mientras se habla, arriba en los huecos, y se mueve suave", () => {
    const voz = pcm(2, { a: 0.5, desde: 0.5, hasta: 1.5 });
    const h = hablandoPorVentana(voz, M);
    expect(h[10]).toBe(0); // 0,1 s: callado
    expect(h[100]).toBe(1); // 1,0 s: hablando
    const curva = curvaDeDucking(h);
    expect(curva[10]).toBeCloseTo(-MUSICA_BAJO_LA_VOZ.hueco, 1);
    expect(curva[140]).toBeCloseTo(-MUSICA_BAJO_LA_VOZ.hablando, 0);
    // Justo al empezar a hablar no salta de golpe.
    expect(curva[51]).toBeGreaterThan(-MUSICA_BAJO_LA_VOZ.hablando + 2);
  });

  it("la música va por debajo de la voz, más baja al hablar, con fundido de salida y repetida si es corta", () => {
    const voz = pcm(8, { a: 0.3, desde: 0.5, hasta: 3 });
    const fondo = pcm(1, { a: 0.8 }); // un segundo: se repite
    const mezcla = mezclarMusica(new Uint8Array(voz), fondo, { muestreo: M, voz });
    const soloMusica = (d, h) => rmsEntre(mezcla, d, h);
    // En el hueco (4,5–5,5 s, ya recuperada y antes del fundido) la música está unos 9 dB por debajo de la voz;
    // mientras se habla, la voz domina.
    expect(db(soloMusica(4.5, 5.5) / nivelDe(voz))).toBeCloseTo(-MUSICA_BAJO_LA_VOZ.hueco, 0);
    expect(db(rmsEntre(mezcla, 1.5, 2.5) / rmsEntre(voz, 1.5, 2.5))).toBeLessThan(0.5);
    // Se repite: sigue sonando a los 3,5 s aunque dura 1 s; y se apaga al final.
    expect(soloMusica(3.5, 3.6)).toBeGreaterThan(0.01);
    expect(soloMusica(8 - 0.05, 8)).toBeLessThan(soloMusica(4.5, 5.5) / 10);
    expect(FUNDIDO_MUSICA.salida).toBeGreaterThan(1);
    // Más volumen a mano: sube.
    const alta = mezclarMusica(new Uint8Array(voz), fondo, { muestreo: M, voz, volumen: 6 });
    expect(db(rmsEntre(alta, 4.5, 5.5) / soloMusica(4.5, 5.5))).toBeCloseTo(6, 0);
  });
});

describe("los efectos de sonido", () => {
  const guion = validarGuion(JSON.parse(JSON.stringify(EJEMPLO_GUION))).guion;
  const linea = lineaDeTiempo(guion);

  it("un whoosh en cada transición que no es un corte y un pop al entrar cada sello y el llamado", () => {
    const m = momentosDeEfectos(guion, linea);
    const conTransicion = guion.escenas.slice(1).filter((e) => e.transicion.tipo !== "corte").length;
    expect(m.filter((x) => x.tipo === "whoosh")).toHaveLength(conTransicion);
    const sellosYLlamados = guion.escenas.flatMap((e) => e.capas).filter((c) => c.tipo === "sello" || c.tipo === "llamado").length;
    expect(m.filter((x) => x.tipo === "pop").length).toBeLessThanOrEqual(sellosYLlamados);
    expect(m.length).toBeGreaterThan(0);
    // En orden y sin dos pegados.
    for (let i = 1; i < m.length; i++) expect(m[i].en - m[i - 1].en).toBeGreaterThanOrEqual(0.15);
    // Sin transiciones ni sellos, nada.
    const liso = { escenas: guion.escenas.map((e) => ({ ...e, transicion: { tipo: "corte", dur: 0 }, capas: e.capas.filter((c) => !["sello", "llamado"].includes(c.tipo)) })) };
    expect(momentosDeEfectos(liso, linea)).toEqual([]);
  });

  it("se sintetizan iguales cada vez, con su duración y el pico en 1", () => {
    for (const tipo of ["whoosh", "pop"]) {
      const a = sintetizar(tipo, 48000);
      expect(a.length).toBe(Math.round(DURACION_EFECTO[tipo] * 48000));
      expect(Math.max(...a.map(Math.abs))).toBeCloseTo(1, 5);
      expect(Array.from(sintetizar(tipo, 48000))).toEqual(Array.from(a));
    }
  });

  it("se mezclan bajitos: unos 12 dB por debajo de la voz, en su sitio", () => {
    const voz = pcm(3, { a: 0.3, desde: 0, hasta: 1 });
    const fuera = mezclarEfectos(new Uint8Array(voz), [{ tipo: "whoosh", en: 2 }], { muestreo: M });
    expect(rmsEntre(fuera, 1.2, 1.9)).toBe(0); // antes del efecto, el silencio sigue
    const efecto = rmsEntre(fuera, 2, 2 + DURACION_EFECTO.whoosh);
    expect(db(efecto / nivelDe(voz))).toBeGreaterThan(-15);
    expect(db(efecto / nivelDe(voz))).toBeLessThan(-9);
  });
});
