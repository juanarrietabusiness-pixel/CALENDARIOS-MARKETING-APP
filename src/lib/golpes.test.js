import { describe, it, expect } from "vitest";
import {
  analizarRitmo, pcmDeS16, limpiarGolpes, golpesEnTramo, pulsoEn, conGolpes, MUESTREO_GOLPES, PULSO,
} from "./golpes.js";

// ============================================================
// Los golpes de una canción, sobre señales SINTÉTICAS: un bombo cada 0,5 s (120 BPM) con un tono y ruido de fondo, y
// otro a 96 BPM. La detección es por energía: tiene que dar el tempo y cada golpe en su sitio (±30 ms).
// ============================================================

/** Una señal con un «bombo» (un ataque seco que se apaga en 80 ms) cada `cada` s, sobre un tono sostenido y ruido. */
function senal({ segundos = 12, cada = 0.5, desde = 0.25, muestreo = MUESTREO_GOLPES } = {}) {
  const n = Math.round(segundos * muestreo);
  const x = new Float32Array(n);
  let semilla = 7;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff - 0.5; };
  for (let i = 0; i < n; i++) x[i] = 0.12 * Math.sin((2 * Math.PI * 220 * i) / muestreo) + 0.02 * azar();
  const ataques = [];
  for (let t = desde; t < segundos - 0.2; t += cada) {
    ataques.push(t);
    const i0 = Math.round(t * muestreo);
    for (let k = 0; k < 0.08 * muestreo && i0 + k < n; k++) {
      const env = Math.exp(-k / (0.015 * muestreo));
      x[i0 + k] += 0.8 * env * Math.sin((2 * Math.PI * 70 * k) / muestreo) + 0.4 * env * azar();
    }
  }
  return { x, ataques };
}

describe("el ritmo de una canción", () => {
  it("a 120 BPM: el tempo y cada golpe en su sitio", () => {
    const { x, ataques } = senal({ cada: 0.5 });
    const r = analizarRitmo(x, MUESTREO_GOLPES);
    expect(Math.abs(r.bpm - 120)).toBeLessThanOrEqual(2);
    // Cada ataque tiene un golpe a menos de 30 ms, y no sobran (un golpe por ataque).
    for (const a of ataques) expect(r.golpes.some((g) => Math.abs(g - a) < 0.03)).toBe(true);
    expect(r.golpes.length).toBeLessThanOrEqual(ataques.length + 2);
    expect(r.confianza).toBeGreaterThan(0);
  });

  it("a 96 BPM, también", () => {
    const { x } = senal({ cada: 60 / 96, segundos: 15 });
    expect(Math.abs(analizarRitmo(x).bpm - 96)).toBeLessThanOrEqual(2);
  });

  it("sin nada que suene, sin golpes ni tempo", () => {
    expect(analizarRitmo(new Float32Array(MUESTREO_GOLPES * 3))).toEqual({ bpm: 0, confianza: 0, golpes: [] });
    expect(analizarRitmo(new Float32Array(10)).golpes).toEqual([]);
  });

  it("del PCM de ffmpeg (s16le) a números entre −1 y 1", () => {
    const b = new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0x00, 0x00]);
    const p = pcmDeS16(b);
    expect(p[0]).toBe(-1);
    expect(p[1]).toBeCloseTo(1, 3);
    expect(p[2]).toBe(0);
  });
});

describe("usar los golpes", () => {
  it("limpios, por tramo y en la línea de tiempo", () => {
    expect(limpiarGolpes([2, "x", 1, -1, 50], 10)).toEqual([1, 2]);
    expect(golpesEnTramo([0.5, 1, 1.5, 2], 1, 2)).toEqual([1, 1.5]);
    expect(conGolpes({ total: 3 }, [1])).toEqual({ total: 3, golpes: [1] });
    expect(conGolpes({ total: 3 }, [])).toEqual({ total: 3 });
  });

  it("el pulso: un 4 % justo en el golpe y vuelve a 1", () => {
    const g = [1, 2, 3];
    expect(pulsoEn(g, 0.5)).toBe(1);
    expect(pulsoEn(g, 2)).toBeCloseTo(1 + PULSO.escala, 6);
    expect(pulsoEn(g, 2 + PULSO.dura / 2)).toBeCloseTo(1 + PULSO.escala / 2, 6);
    expect(pulsoEn(g, 2.5)).toBe(1);
    expect(pulsoEn([], 2)).toBe(1);
  });
});
