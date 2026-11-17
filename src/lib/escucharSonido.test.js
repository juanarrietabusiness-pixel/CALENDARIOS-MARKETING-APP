import { describe, it, expect } from "vitest";
import { informeDeEscucha, envolvente, reloj, palabrasDelVideo, VENTANA_ESCUCHA } from "./escucharSonido.js";
import { BYTES_MUESTRA, RENDER } from "./renderVideo.js";

// ============================================================
// ESCUCHAR SIN OÍDOS: con las pistas sueltas y los tiempos de cada palabra, el informe dice lo que un editor oiría
// ============================================================

const M = 1000;
/** PCM s16le estéreo de `seg` s con un tono de amplitud `a` en los tramos [desde, hasta]. */
function pcm(seg, tramos = []) {
  const b = new Uint8Array(Math.round(seg * M) * BYTES_MUESTRA);
  const v = new DataView(b.buffer);
  for (const { desde, hasta, a } of tramos) {
    for (let i = Math.round(desde * M); i < Math.round(hasta * M); i++) {
      const x = Math.round(a * 32767 * Math.sin(i * 0.7));
      v.setInt16(i * BYTES_MUESTRA, x, true); v.setInt16(i * BYTES_MUESTRA + 2, x, true);
    }
  }
  return b;
}

const linea = {
  total: 10, estimado: false,
  escenas: [
    { id: "e1", desde: 0, hasta: 5, palabras: [{ texto: "Hoy", desde: 0.2, hasta: 0.5 }, { texto: "gratis", desde: 1, hasta: 1.5 }] },
    { id: "e2", desde: 5, hasta: 10, palabras: [{ texto: "compra", desde: 5.2, hasta: 5.8 }] },
  ],
};
const habla = pcm(10, [{ desde: 0.2, hasta: 1.5, a: 0.3 }, { desde: 5.2, hasta: 5.8, a: 0.3 }]);
const musica = pcm(10, [{ desde: 0, hasta: 10, a: 0.05 }]);
const efectos = pcm(10, [{ desde: 1, hasta: 1.2, a: 0.25 }, { desde: 3, hasta: 3.1, a: 0.01 }, { desde: 7, hasta: 7.6, a: 0.05 }, { desde: 7.2, hasta: 7.4, a: 0.05 }]);
const momentos = [
  { i: 0, nombre: "Golpe", papel: "golpe", que: "cuando se dice «gratis»" },
  { i: 1, nombre: "Tic", papel: "tic", que: "en el segundo 3" },
  { i: 2, nombre: "Whoosh", papel: "transicion", que: "cuando entra la escena e2" },
  { i: 3, nombre: "Pop", papel: "pop", que: "en el segundo 7.2" },
];
const medidas = [
  { i: 0, en: 1, golpe: 1, dur: 0.2, sobreVoz: -3, sobreFondo: 12, aMano: 6 },
  { i: 1, en: 3, golpe: 3, dur: 0.1, sobreVoz: -20, sobreFondo: 1, aMano: 0 },
  { i: 2, en: 7, golpe: 7.1, dur: 0.6, sobreVoz: -11, sobreFondo: 6, aMano: 0 },
  { i: 3, en: 7.2, golpe: 7.2, dur: 0.2, sobreVoz: -11, sobreFondo: 6, aMano: 0 },
];

function informe(extra = {}) {
  const mezcla = new Uint8Array(habla.byteLength);
  const v = new DataView(mezcla.buffer);
  for (const p of [habla, musica, efectos]) {
    const w = new DataView(p.buffer);
    for (let k = 0; k < mezcla.byteLength; k += 2) v.setInt16(k, Math.max(-32768, Math.min(32767, v.getInt16(k, true) + w.getInt16(k, true))), true);
  }
  return informeDeEscucha({
    pistas: { habla, musica, efectos }, mezcla, momentos, medidas, linea, muestreo: M, musica: "Lo-fi", titulo: "Prueba",
    bajadas: [{ desde: 0.6, hasta: 1, db: 8 }], volumen: { lufs: -20, pico: -3 }, colocados: [{}, {}, {}, {}], ...extra,
  });
}

describe("el informe de escucha", () => {
  it("cada efecto: qué palabra pisa y lo que compite, se tapa o se pisa con otro", () => {
    const inf = informe();
    const [golpe, tic, whoosh, pop] = inf.efectos;
    expect(golpe.pisa).toEqual(["gratis"]);
    expect(golpe.avisos[0]).toMatch(/compite con la voz: pisa «gratis»/);
    expect(tic.hablando).toBe(false);
    expect(tic.avisos[0]).toMatch(/la música lo tapa/);
    expect(whoosh.avisos).toEqual([]);
    expect(pop.avisos[0]).toMatch(/se pisa con el 3 \(«Whoosh»\)/);
  });

  it("los 5 momentos para escuchar: lo de más riesgo, en orden, sin repetirse", () => {
    const inf = informe();
    expect(inf.escuchar.length).toBeGreaterThan(2);
    expect(inf.escuchar.length).toBeLessThanOrEqual(5);
    const t = inf.escuchar.map((m) => m.segundo);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBeGreaterThanOrEqual(0.5);
    expect(inf.escuchar.some((m) => /compite con la voz/.test(m.porque))).toBe(true);
  });

  it("la música bajo la voz, la densidad, los huecos y el volumen final", () => {
    const inf = informe();
    expect(inf.voz).not.toBeNull();
    expect(inf.musica.hablando).toBeLessThan(-10);
    expect(inf.densidad).toBe(4);
    expect(inf.volumen).toEqual({ lufs: -20, ganancia: RENDER.lufs + 20, picoFinal: -3 + RENDER.lufs + 20, limitador: -3 + RENDER.lufs + 20 > RENDER.pico });
    // Sin música, entre la voz y los efectos hay silencios de más de un segundo.
    const sinMusica = informeDeEscucha({ pistas: { habla, musica: null, efectos }, mezcla: habla, momentos: [], medidas: [], linea, muestreo: M });
    expect(sinMusica.huecos.length).toBeGreaterThan(0);
    expect(sinMusica.huecos[0]).toEqual({ desde: 1.5, hasta: 5.2 });
  });

  it("el texto para Claude lo dice todo en español, y que es medido, no oído", () => {
    const t = informe().texto;
    expect(t).toMatch(/Sonido de «Prueba» \(10 s\)/);
    expect(t).toMatch(/Música: «Lo-fi»/);
    expect(t).toMatch(/Efectos: 4, la lista colocada \(4\)/);
    expect(t).toMatch(/1\. 0:01,0 · «Golpe» \(Golpe\)/);
    expect(t).toMatch(/La música baja 8 dB antes de: 0:01,0/);
    expect(t).toMatch(/Que una persona escuche estos momentos:/);
    expect(t).toMatch(/Medido, no oído/);
    expect(informe({ avisosExtra: ["Aún no hay voz."] }).texto).toMatch(/OJO: Aún no hay voz\./);
  });

  it("las piezas: la envolvente en ventanas de 50 ms, el reloj y las palabras planas", () => {
    const env = envolvente(habla, M);
    expect(env.length).toBe(Math.ceil(10 / VENTANA_ESCUCHA));
    expect(env[Math.floor(0.3 / VENTANA_ESCUCHA)]).toBeGreaterThan(-20);
    expect(env[Math.floor(3 / VENTANA_ESCUCHA)]).toBeLessThan(-60);
    expect(reloj(3.21)).toBe("0:03,2");
    expect(reloj(75)).toBe("1:15,0");
    expect(palabrasDelVideo(linea).map((p) => `${p.escena}:${p.texto}`)).toEqual(["e1:Hoy", "e1:gratis", "e2:compra"]);
  });
});
