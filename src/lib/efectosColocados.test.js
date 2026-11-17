import { describe, it, expect } from "vitest";
import {
  limpiarColocado, limpiarColocados, instanteDe, momentosColocados, colocadosAutomaticos, bajadasDeMusica, bajadaEn,
  textoDeColocado, archivosDeColocados, palabraComparable, PAPELES, BAJADA_MUSICA, MAX_COLOCADOS, EFECTO_AUTOMATICO,
} from "./efectosColocados.js";
import { armarSonido, nivelDeFondoEn, sumarPistas } from "./efectosSonido.js";
import { nivelDe } from "./sonidoVideo.js";
import { limpiarSonido } from "./sonidoVideo.js";
import { BYTES_MUESTRA } from "./renderVideo.js";
import { validarGuion, lineaDeTiempo, tiempoDeCapa } from "./videoEscenas.js";
import { EJEMPLO_GUION } from "./videoFormatoIA.js";

// ============================================================
// Los EFECTOS COLOCADOS: anclados a eventos del video (escena, capa, palabra o segundo), con las reglas medidas de cada
// papel; y la mezcla por pistas que los nivela contra la voz y la música
// ============================================================

const guion = validarGuion(JSON.parse(JSON.stringify(EJEMPLO_GUION))).guion;
const linea = lineaDeTiempo(guion, null);
const datos = (papel, pico = 0) => () => ({ papel, pico, nombre: papel });

describe("limpiar la lista", () => {
  it("guarda el efecto (del catálogo o de la biblioteca) y UN ancla, con su ajuste y su volumen acotados", () => {
    expect(limpiarColocado({ efecto: "whoosh_fast-crisp", escena: "e2" })).toEqual({ sonido: "whoosh_fast-crisp", escena: "e2" });
    expect(limpiarColocado({ sonido: "ui_pop-soft", escena: "e2", capa: "s", momento: "sale", ajuste_ms: 5000, volumen: 20 }))
      .toEqual({ sonido: "ui_pop-soft", escena: "e2", capa: "s", sale: true, ajusteMs: 1000, volumen: 6 });
    expect(limpiarColocado({ sonido: "x", palabra: "precio", escena: "e2", n: 2 })).toEqual({ sonido: "x", palabra: "precio", escena: "e2", n: 2 });
    expect(limpiarColocado({ sonido: "x", segundo: 3.21456 })).toEqual({ sonido: "x", segundo: 3.215 });
    expect(limpiarColocado({ propio: { archivoId: "abc", clave: "biblioteca/esp/a.mp3", nombre: "Ding", de: "agencia" }, segundo: 0 }))
      .toEqual({ propio: { archivoId: "abc", clave: "biblioteca/esp/a.mp3", nombre: "Ding", de: "agencia" }, segundo: 0 });
    // Sin ancla, sin efecto o con un id raro: fuera. Una clave de otro sitio no se guarda.
    expect(limpiarColocado({ sonido: "x" })).toBeNull();
    expect(limpiarColocado({ escena: "e1" })).toBeNull();
    expect(limpiarColocado({ sonido: "../x", escena: "e1" })).toBeNull();
    expect(limpiarColocado({ propio: { archivoId: "a", clave: "otra/../x" }, segundo: 1 }).propio.clave).toBeUndefined();
    expect(limpiarColocados(Array.from({ length: MAX_COLOCADOS + 5 }, () => ({ sonido: "x", segundo: 1 })))).toHaveLength(MAX_COLOCADOS);
    expect(archivosDeColocados([{ propio: { archivoId: "a" } }, { sonido: "x" }, { propio: { archivoId: "a" } }])).toEqual(["a"]);
  });

  it("el sonido del video guarda la lista sólo si hay alguna (el de antes sigue igual)", () => {
    expect(limpiarSonido({ efectos: true, musica: null })).toEqual({ efectos: true, musica: null });
    expect(limpiarSonido({ colocados: [{ sonido: "x", segundo: 1 }, { sonido: "malo" }] }).colocados).toEqual([{ sonido: "x", segundo: 1 }]);
  });
});

describe("el instante de cada ancla", () => {
  it("una escena que entra o se va, una capa que aparece o se va", () => {
    expect(instanteDe({ escena: "e2" }, guion, linea).t).toBe(linea.escenas[1].desde);
    expect(instanteDe({ escena: "e2", sale: true }, guion, linea).t).toBe(linea.escenas[1].hasta);
    const capa = guion.escenas[1].capas.find((c) => c.id === "s");
    expect(instanteDe({ escena: "e2", capa: "s" }, guion, linea).t).toBe(tiempoDeCapa(capa, linea.escenas[1]).desde);
    expect(instanteDe({ escena: "nada" }, guion, linea).error).toMatch(/No hay ninguna escena/);
    expect(instanteDe({ escena: "e2", capa: "zz" }, guion, linea).error).toMatch(/tiene: s, l, i/);
  });

  it("una palabra (sin tildes ni signos; la vez que se pide; sólo en su escena si se dice)", () => {
    const p = linea.escenas[1].palabras.find((x) => palabraComparable(x.texto) === "precio");
    expect(instanteDe({ palabra: "PRECIO" }, guion, linea).t).toBe(p.desde);
    expect(instanteDe({ palabra: "sabías" }, guion, linea).t).toBe(linea.escenas[0].palabras[0].desde);
    expect(instanteDe({ palabra: "sabias", escena: "e2" }, guion, linea).error).toMatch(/Nadie dice/);
    expect(instanteDe({ palabra: "precio", n: 2 }, guion, linea).error).toMatch(/se dice 1 vez/);
    expect(palabraComparable("¿Sabías?")).toBe("sabias");
  });

  it("un segundo, dentro del video", () => {
    expect(instanteDe({ segundo: 2 }, guion, linea).t).toBe(2);
    expect(instanteDe({ segundo: 999 }, guion, linea).error).toMatch(/pasa del final/);
  });
});

describe("las reglas de cada papel", () => {
  it("un whoosh pone su PICO 37 ms después del corte; un clic empieza 11 ms antes; un toque, 60", () => {
    const c = { sonido: "w", escena: "e2" };
    const corte = linea.escenas[1].desde;
    const w = momentosColocados([c], guion, linea, datos("transicion", 0.125)).momentos[0];
    expect(w.golpe).toBeCloseTo(corte + 0.037, 3);
    expect(w.en).toBeCloseTo(corte + 0.037 - 0.125, 3);
    expect(momentosColocados([c], guion, linea, datos("clic")).momentos[0].en).toBeCloseTo(corte - 0.011, 3);
    expect(momentosColocados([c], guion, linea, datos("toque")).momentos[0].en).toBeCloseTo(corte - 0.06, 3);
    // El ajuste a mano se suma; nada empieza antes del segundo 0.
    expect(momentosColocados([{ ...c, ajusteMs: 100 }], guion, linea, datos("clic")).momentos[0].en).toBeCloseTo(corte + 0.089, 3);
    expect(momentosColocados([{ sonido: "w", segundo: 0 }], guion, linea, datos("toque")).momentos[0].en).toBe(0);
  });

  it("en una racha, dos del mismo papel se separan lo medido (y se dice); de papeles distintos, no", () => {
    const lista = [{ sonido: "a", segundo: 1 }, { sonido: "b", segundo: 1.02 }, { sonido: "c", segundo: 1.05 }];
    const r = momentosColocados(lista, guion, linea, datos("tic"));
    expect(r.momentos.map((m) => m.en)).toEqual([1, 1.066, 1.132]);
    expect(r.movidos.map((m) => m.i)).toEqual([1, 2]);
    const mixto = momentosColocados(lista, guion, linea, (c) => ({ papel: c.sonido === "b" ? "pop" : "golpe", pico: 0, nombre: "x" }));
    expect(mixto.movidos).toEqual([]);
  });

  it("lo que no tiene sitio no suena y dice por qué; el nivel sale del papel", () => {
    const r = momentosColocados([{ sonido: "x", escena: "nada" }, { sonido: "y", segundo: 1 }], guion, linea, (c) => (c.sonido === "y" ? { papel: "tic", pico: 0, nombre: "Tic" } : null));
    expect(r.sinSitio).toEqual([{ i: 0, motivo: "«x» no está en el catálogo de efectos." }]);
    expect(r.momentos[0].db).toBe(PAPELES.tic.sobreFondo - 8);
  });

  it("la música baja antes de un golpe y vuelve con él", () => {
    const { momentos } = momentosColocados([{ sonido: "g", segundo: 5 }, { sonido: "p", segundo: 7 }], guion, linea, (c) => ({ papel: c.sonido === "g" ? "golpe" : "pop", pico: 0, nombre: "x" }));
    const bajadas = bajadasDeMusica(momentos);
    expect(bajadas).toEqual([{ desde: 5 - BAJADA_MUSICA.antes, hasta: 5, db: BAJADA_MUSICA.db }]);
    expect(bajadaEn(bajadas, 4)).toBe(0);
    expect(bajadaEn(bajadas, 4.9)).toBe(BAJADA_MUSICA.db);
    expect(bajadaEn(bajadas, 5 + BAJADA_MUSICA.vuelve / 2)).toBeCloseTo(BAJADA_MUSICA.db / 2, 5);
    expect(bajadaEn(bajadas, 5.5)).toBe(0);
  });

  it("los automáticos son colocados con los ids del catálogo", () => {
    const l = colocadosAutomaticos(guion, linea);
    expect(l).toContainEqual({ sonido: EFECTO_AUTOMATICO.transicion, escena: "e2" });
    expect(l).toContainEqual({ sonido: EFECTO_AUTOMATICO.sello, escena: "e2", capa: "s" });
    expect(textoDeColocado({ sonido: "x", escena: "e2", capa: "s", ajusteMs: -20 }, "«Pop»")).toBe("«Pop» al entrar la capa s de la escena e2 (-20 ms)");
    expect(textoDeColocado({ sonido: "x", palabra: "precio", n: 2 })).toBe("x al decir «precio» (la vez 2)");
  });
});

// ------------------------------------------------------------------ la mezcla por pistas

const M = 1000;
/** PCM s16le estéreo de `seg` s con un tono de amplitud `a` entre `desde` y `hasta`. */
function pcm(seg, { a = 0.5, desde = 0, hasta = seg } = {}) {
  const b = new Uint8Array(Math.round(seg * M) * BYTES_MUESTRA);
  const v = new DataView(b.buffer);
  for (let i = Math.round(desde * M); i < Math.round(hasta * M); i++) {
    const x = Math.round(a * 32767 * Math.sin(i * 0.7));
    v.setInt16(i * BYTES_MUESTRA, x, true); v.setInt16(i * BYTES_MUESTRA + 2, x, true);
  }
  return b;
}
const tono = (seg, a = 1) => Float32Array.from({ length: Math.round(seg * M) }, (_, i) => a * Math.sin(i * 1.3));
const db = (x) => 20 * Math.log10(x);

describe("la mezcla por pistas", () => {
  const momento = (en, papel = "pop", extra = {}) => ({ i: 0, clave: "e", en, golpe: en, db: PAPELES[papel].sobreFondo - 8, sobreFondo: PAPELES[papel].sobreFondo, volumen: 0, ...extra });

  it("con voz y sin música: el de siempre (unos 12 dB bajo la voz, movido por su papel)", () => {
    const habla = pcm(6, { a: 0.3, hasta: 3 });
    const r = armarSonido({ habla, momentos: [momento(4)], muestras: new Map([["e", tono(0.3)]]), muestreo: M });
    expect(r.medidas[0].sobreVoz).toBeCloseTo(-12 + 0.5, 0);
    expect(r.pistas.musica).toBeNull();
  });

  it("en un hueco con música fuerte, el efecto sube hasta quedar sobre ella (sin pasar de 6 dB bajo la voz)", () => {
    const habla = pcm(8, { a: 0.3, hasta: 2 });
    const musica = pcm(8, { a: 0.5 });
    const r = armarSonido({ habla, musica, momentos: [momento(5)], muestras: new Map([["e", tono(0.3)]]), muestreo: M });
    const m = r.medidas[0];
    // La regla de la música manda: queda por encima de lo que la música sonaba antes, hasta el techo bajo la voz.
    expect(m.sobreVoz).toBeLessThanOrEqual(-6 + 0.01);
    expect(m.sobreVoz).toBeGreaterThan(-12);
    expect(m.sobreFondo).toBeGreaterThan(0);
    // A mano se puede pasar del techo.
    const fuerte = armarSonido({ habla, musica, momentos: [momento(5, "pop", { volumen: 6 })], muestras: new Map([["e", tono(0.3)]]), muestreo: M });
    expect(fuerte.medidas[0].sobreVoz).toBeCloseTo(m.sobreVoz + 6, 0);
  });

  it("la música baja antes del golpe (medida antes de bajarla) y la mezcla es la suma de las pistas", () => {
    const habla = pcm(8, { a: 0.3, hasta: 1 });
    const musica = pcm(8, { a: 0.4 });
    const golpe = momento(5, "golpe", { bajaMusica: true });
    const bajadas = [{ desde: 5 - BAJADA_MUSICA.antes, hasta: 5, db: BAJADA_MUSICA.db }];
    const r = armarSonido({ habla, musica, momentos: [golpe], muestras: new Map([["e", tono(0.2)]]), bajadas, muestreo: M });
    const rms = (b, d, h) => {
      const v = new DataView(b.buffer);
      let s = 0;
      for (let i = Math.round(d * M); i < Math.round(h * M); i++) s += (v.getInt16(i * BYTES_MUESTRA, true) / 32768) ** 2;
      return Math.sqrt(s / Math.round((h - d) * M));
    };
    expect(db(rms(r.pistas.musica, 4.7, 4.95) / rms(r.pistas.musica, 3, 4.5))).toBeCloseTo(-BAJADA_MUSICA.db, 0);
    expect(db(rms(r.pistas.musica, 5.3, 6) / rms(r.pistas.musica, 3, 4.5))).toBeCloseTo(0, 1);
    expect(nivelDeFondoEn(r.pistas.musica, 4.5, M)).toBeGreaterThan(0);
    // El fondo se midió ANTES de bajar la música; aquí el techo bajo la voz (6 dB) para al golpe en 3 dB sobre ella.
    expect(r.medidas[0].sobreVoz).toBeCloseTo(-6, 0);
    expect(r.medidas[0].sobreFondo).toBeCloseTo(3, 0);
    expect(r.mezcla).toEqual(sumarPistas(r.pistas.habla, r.pistas.musica, r.pistas.efectos));
    expect(nivelDe(r.pistas.efectos)).toBeGreaterThan(0);
  });
});
