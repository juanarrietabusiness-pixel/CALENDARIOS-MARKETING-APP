import { describe, it, expect } from "vitest";
import {
  dbEntre, puntoCallado, tomasDelClip, piezasDeToma, corteDelClip, lineaDeTiempo, aSalida, cuadrosDeOrigen,
  palabrasEnSalida, tomasRepetidas, gruposDeSubtitulos, gruposDesdeTexto, normalizar,
} from "./corteEdicion.js";

// Una energía de mentira: −60 dB de fondo y −20 dB donde se habla (cada 10 ms).
function energia(duracion, habla) {
  const paso = 0.01;
  const db = Array.from({ length: Math.round(duracion / paso) }, (_, i) => {
    const t = i * paso;
    return habla.some(([a, b]) => t >= a && t < b) ? -20 : -60;
  });
  return { paso, db };
}
const p = (w, s, e) => ({ w, s, e });

describe("medir la energía", () => {
  it("dbEntre promedia la potencia, no los dB", () => {
    const e = { paso: 0.01, db: [-20, -60] };
    // La media de 10^-2 y 10^-6 es ≈ 5·10^-3 → ≈ −23 dB (la media de los dB diría −40).
    expect(dbEntre(e, 0, 0.02)).toBeCloseTo(-23.01, 1);
  });

  it("el punto callado es el centro de la ventana más baja", () => {
    const e = energia(1, [[0, 0.3], [0.5, 1]]);
    const t = puntoCallado(e, 0.2, 0.6);
    expect(t).toBeGreaterThanOrEqual(0.3);
    expect(t).toBeLessThanOrEqual(0.5);
  });
});

describe("las tomas y las piezas de un clip", () => {
  it("quitar palabras parte la toma donde estaban", () => {
    expect(tomasDelClip(new Array(8).fill(0), [[2, 3], [6]])).toEqual([[0, 1], [4, 5], [7]]);
    expect(tomasDelClip(new Array(3).fill(0))).toEqual([[0, 1, 2]]);
  });

  it("un silencio largo queda en 0,10 s y uno corto se respeta", () => {
    // Habla de 1,0 a 2,0; silencio de 0,5 s; habla de 2,5 a 3,5; silencio corto (0,1 s); habla de 3,6 a 4,0.
    const e = energia(5, [[1, 2], [2.5, 3.5], [3.6, 4]]);
    const palabras = [p("uno", 1.0, 2.0), p("dos", 2.5, 3.5), p("tres", 3.6, 4.0)];
    const piezas = piezasDeToma(palabras, e);
    expect(piezas).toHaveLength(2);
    const silencio = piezas[1][0] - piezas[0][1];
    // El hueco de 0,5 s pasa a ~0,10 s (lo que queda dentro de las piezas: 0,05 a cada lado).
    expect(piezas[0][1]).toBeCloseTo(2.05, 2);
    expect(piezas[1][0]).toBeCloseTo(2.45, 2);
    expect(silencio).toBeGreaterThan(0);
    // Los bordes: no más de 0,08 s antes de la primera palabra ni 0,12 s después de la última.
    expect(piezas[0][0]).toBeGreaterThanOrEqual(0.92);
    expect(piezas[1][1]).toBeLessThanOrEqual(4.12);
  });

  it("nunca antes del inicio ni después del final del clip (Rofer: una pieza en −0,02 s dejó 3 s sin voz)", () => {
    // La primera palabra empieza a los 0,02 s y la última acaba 0,03 s antes del final del archivo (2,0 s).
    const e = energia(2, [[0.02, 1.97]]);
    const piezas = piezasDeToma([p("Y", 0.02, 0.2), p("tres", 0.3, 1.97)], e);
    expect(piezas[0][0]).toBe(0);
    expect(piezas.at(-1)[1]).toBeLessThanOrEqual(2);
    // Y la red de la línea de tiempo: una pieza que pida leer fuera del clip se recorta a lo que hay.
    const l = lineaDeTiempo([{ id: "a", piezas: [[-0.02, 1], [1.5, 2.3]], duracion: 2 }], { fps: 30, cierre: 0 });
    expect(l.piezas.map((x) => [x.src0, x.src1])).toEqual([[0, 1], [1.5, 2]]);
    expect(l.piezas[1].out0).toBe(1);
    expect(lineaDeTiempo([{ id: "a", piezas: [[2.1, 2.4]], duracion: 2 }]).piezas).toEqual([]);
  });

  it("corteDelClip junta las piezas de cada toma y dice qué palabras quedan", () => {
    const e = energia(6, [[1, 1.5], [2, 2.5], [4, 4.5]]);
    const palabras = [p("a", 1, 1.5), p("b", 2, 2.5), p("c", 4, 4.5)];
    const r = corteDelClip(palabras, e, { excluir: [[1]] });
    expect(r.palabras).toEqual([0, 2]);
    expect(r.piezas).toHaveLength(2);
    expect(r.piezas[0][1]).toBeLessThan(2);
    expect(r.piezas[1][0]).toBeGreaterThan(3.8);
  });
});

describe("la línea de tiempo", () => {
  // Las piezas de Rofer v2 (segs2.json) del gancho y del llamado, con el llamado un 5 % más ágil.
  const clips = [
    { id: "1427", piezas: [[1.06, 3.5], [3.74, 5.36]] },
    { id: "1450", piezas: [[0.5, 2.5]], velocidad: 1.05 },
  ];
  const linea = lineaDeTiempo(clips, { fps: 30, cierre: 3.3 });

  it("pone cada pieza en la salida, con la velocidad del clip", () => {
    expect(linea.piezas.map((x) => [x.out0, x.out1])).toEqual([[0, 2.44], [2.44, 4.06], [4.06, 5.965]]);
    expect(linea.vozFin).toBe(5.965);
    expect(linea.total).toBe(Math.round((5.965 + 3.3) * 30));
    expect(linea.cambiosClip).toEqual([4.06]);
    expect(linea.saltos).toEqual([2.44]);
  });

  it("pasa un instante de origen a la salida (y uno recortado, al inicio de la pieza siguiente)", () => {
    expect(aSalida(linea, "1427", 1.06)).toBe(0);
    expect(aSalida(linea, "1427", 3.74)).toBeCloseTo(2.44, 5);
    expect(aSalida(linea, "1427", 3.6)).toBe(2.44);
    expect(aSalida(linea, "1450", 1.55)).toBeCloseTo(4.06 + 1.05 / 1.05, 5);
    expect(aSalida(linea, "1450", 9)).toBeNull();
  });

  it("cada cuadro de salida sabe de qué cuadro de origen sale; el cierre, de ninguno", () => {
    const c = cuadrosDeOrigen(linea);
    expect(c).toHaveLength(linea.total);
    expect(c[0]).toEqual(["1427", Math.round(1.06 * 30)]);
    expect(c[c.length - 1]).toBeNull();
  });

  it("las palabras que quedan, en la salida y en orden", () => {
    const w = palabrasEnSalida(linea, [{ id: "1427", palabras: [p(" Lo", 1.14, 1.5), p("más", 3.8, 4.0)], quedan: [0, 1] }]);
    expect(w[0]).toMatchObject({ w: "Lo", clip: "1427", i: 0 });
    expect(w[0].s).toBeCloseTo(0.08, 3);
    expect(w[1].s).toBeCloseTo(2.44 + 0.06, 3);
  });
});

describe("tomas repetidas", () => {
  it("sugiere quitar la primera vez que se dice la misma frase", () => {
    const palabras = "somos rofer service una somos rofer service una empresa".split(" ").map((w, i) => p(w, i, i + 0.5));
    expect(tomasRepetidas(palabras)).toEqual([{ quitar: [0, 3], porque: "«somos rofer service una» se dice otra vez desde la palabra 4" }]);
    expect(tomasRepetidas("una frase que no se repite".split(" ").map((w, i) => p(w, i, i + 0.5)))).toEqual([]);
  });
});

describe("los grupos de subtítulos", () => {
  const palabras = ["Lo", "más", "caro", "de", "tu", "hora", "no", "es", "la", "máquina,"].map((w, i) => p(w, i, i + 0.5));

  it("solos: cortan en la puntuación y a las 4 palabras", () => {
    expect(gruposDeSubtitulos(palabras)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
  });

  it("desde el texto: con palabras clave y lo que el reconocimiento oyó mal", () => {
    const r = gruposDesdeTexto(palabras, ["Lo más *caro", "de tu *obra", "no es la", "máquina,"], { reemplazos: { hora: "obra" } });
    expect(r.error).toBeUndefined();
    expect(r.grupos).toEqual([[0, 1, 2], [3, 4, 5], [6, 7, 8], [9]]);
    expect(r.palabras[5]).toMatchObject({ texto: "obra", clave: true });
    expect(r.palabras[0].clave).toBe(false);
  });

  it("dice dónde no casa, qué sobra y qué falta", () => {
    expect(gruposDesdeTexto(palabras, ["Lo más caro", "de tu obra"]).error).toMatch(/se transcribió «hora» \(palabra 5\)/);
    expect(gruposDesdeTexto(palabras, ["Lo más caro de tu"]).error).toMatch(/tiene 5 palabras: como mucho 4/);
    expect(gruposDesdeTexto(palabras, ["Lo más"]).error).toMatch(/quedan 8 palabras sin subtítulo desde «caro»/);
    expect(gruposDesdeTexto(palabras.slice(0, 1), ["Lo más"]).error).toMatch(/Sobra «más»/);
  });

  it("normaliza sin tildes ni puntuación", () => {
    expect(normalizar("¿Máquina,")).toBe("maquina");
    expect(normalizar("Año")).toBe("año");
  });
});
