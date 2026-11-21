import { describe, it, expect } from "vitest";
import { suavizar, planosAutomaticos, camaraDelVideo, ANCHO, ALTO } from "./camaraEdicion.js";
import { lineaDeTiempo } from "./corteEdicion.js";
import { resolverPiezas, subtitulos, revisarEscena, escenaParaRemotion, cajaDePieza, filasDePieza } from "./escenaEdicion.js";

// Una persona quieta: cabeza arriba en y=500, centrada, 1300 px de alto (de cuerpo entero, cerca).
const geoQuieta = (n, g = { top: 500, hx: 540, hw: 220, bot: 1800 }) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, g]));

describe("la cámara virtual", () => {
  it("suavizar no cambia una serie constante y alisa un salto", () => {
    for (const v of suavizar([5, 5, 5, 5])) expect(v).toBeCloseTo(5, 9);
    const s = suavizar([0, 0, 0, 0, 0, 10, 10, 10, 10, 10], 2);
    expect(s[4]).toBeGreaterThan(0);
    expect(s[4]).toBeLessThan(5);
    expect(s[9]).toBeLessThan(10);
  });

  it("alterna abierto y medio; la persona lejos se acerca, hasta 2×", () => {
    const p = planosAutomaticos([{ alto: 1300 }, { alto: 1300 }, { alto: 400 }, { alto: 400 }]);
    expect(p.map((x) => x.z)).toEqual([1.135, 1.475, 2, 2]);
    expect(p[0].golpe).toBe(0);
    expect(p[1].golpe).toBeGreaterThan(0);
  });

  it("nunca enseña el borde del cuadro y deja la cabeza donde pide el plano", () => {
    const linea = lineaDeTiempo([{ id: "a", piezas: [[0, 2], [2.5, 4]] }], { fps: 30, cierre: 1 });
    const geo = { a: geoQuieta(150, { top: 500, hx: 900, hw: 220, bot: 1800 }) };
    const { cam, cabeza } = camaraDelVideo(linea, geo);
    for (const [z, tx, ty] of cam.slice(0, Math.round(linea.vozFin * 30))) {
      expect(tx).toBeLessThanOrEqual(0);
      expect(tx).toBeGreaterThanOrEqual(ANCHO - ANCHO * z - 0.1);
      expect(ty).toBeLessThanOrEqual(0);
      expect(ty).toBeGreaterThanOrEqual(ALTO - ALTO * z - 0.1);
    }
    // La persona está muy a la derecha (900): la cámara la trae hacia el centro todo lo que deja el borde.
    expect(cabeza[10][0]).toBeLessThan(900 * cam[10][0]);
    // El cierre no tiene cabeza.
    expect(cabeza.at(-1)).toBeNull();
  });

  it("el golpe de zoom al entrar a un tramo se apaga en unos cuadros", () => {
    const linea = lineaDeTiempo([{ id: "a", piezas: [[0, 1], [1.5, 3]] }], { fps: 30, cierre: 0 });
    const { cam } = camaraDelVideo(linea, { a: geoQuieta(100) });
    const entra = Math.round(linea.piezas[1].out0 * 30);
    expect(cam[entra][0]).toBeGreaterThan(cam[entra + 10][0] * 1.02);
  });

  it("lo que dice el plan por tramo pisa al automático", () => {
    const linea = lineaDeTiempo([{ id: "a", piezas: [[0, 1], [1.5, 3]] }], { fps: 30, cierre: 0 });
    const { planos } = camaraDelVideo(linea, { a: geoQuieta(100) }, { planos: [null, { z: 1.9, x: 735 }] });
    expect(planos[0].z).toBe(1.135);
    expect(planos[1]).toMatchObject({ z: 1.9, x: 735, y: 560 });
  });
});

describe("la escena y su revisión de oficio", () => {
  const linea = lineaDeTiempo([{ id: "a", piezas: [[0, 6]] }], { fps: 30, cierre: 2 });
  const palabras = ["Lo", "más", "caro", "de", "tu", "obra", "y", "lo", "que", "hacemos", "vías,", "urbanismos."].map((w, i) => ({ w, s: i * 0.45, e: i * 0.45 + 0.4 }));
  const cam = camaraDelVideo(linea, { a: geoQuieta(200) });
  const base = { fps: 30, vozFin: linea.vozFin, palabras, cabeza: cam.cabeza };

  it("coloca lo de arriba con aire sobre el tope real de la cabeza", () => {
    const [g] = resolverPiezas([{ tipo: "gigante", texto: "OBRA", tam: 150, desde: { palabra: 5 } }], base);
    const tope = cam.cabeza[Math.round(g.desde * 30)][1];
    expect(g.desde).toBeCloseTo(2.25, 5);
    expect(g.y + 150 * 0.62).toBeLessThanOrEqual(tope);
  });

  it("avisa de lo que tapa la cara, del texto que la cabeza no deja leer y del cuadro 0 sin gancho", () => {
    const tope = cam.cabeza[30][1];
    const piezas = resolverPiezas([
      { tipo: "sello", arriba: "FLOTA", grande: "14 EQUIPOS", y: tope + 60, desde: { t: 0.5 }, hasta: { t: 2 } },
      { tipo: "gigante", texto: "OBRA", tam: 200, y: tope + 40, desde: { t: 1 }, hasta: { t: 2 } },
    ], base);
    const avisos = revisarEscena({ piezas, cabeza: cam.cabeza, fps: 30, grupos: [], palabras });
    const textos = avisos.map((a) => a.que).join("\n");
    expect(textos).toMatch(/El cuadro 0 no muestra el gancho/);
    expect(textos).toMatch(/sello tapa la cabeza o la cara/);
    expect(textos).toMatch(/La cabeza tapa ~\d+ % de «OBRA»/);
    expect(avisos.every((a) => a.arreglo)).toBe(true);
  });

  it("oculta el subtítulo que dice lo mismo que la lista y avisa si uno cae encima de un gráfico", () => {
    const piezas = resolverPiezas([
      { tipo: "titular", lineas: [{ texto: "LO MÁS CARO" }], hasta: { t: 1 } },
      { tipo: "lista", titulo: "LO QUE HACEMOS", desde: { palabra: 9 }, hasta: { t: 5.4 }, items: [{ texto: "VÍAS", palabra: 10 }, { texto: "URBANISMOS", palabra: 11 }] },
      { tipo: "ficha", texto: "TIEMPO", y: 1330, desde: { t: 0.5 }, hasta: { t: 2 } },
    ], base);
    const sub = subtitulos(palabras, piezas, { textos: ["Lo más caro", "de tu obra", "y lo que hacemos", "vías,", "urbanismos."] });
    const vias = sub.grupos.find((g) => g.ids.includes(10));
    expect(vias.oculto).toBe(true);
    const avisos = revisarEscena({ piezas, cabeza: cam.cabeza, fps: 30, grupos: sub.grupos, palabras: sub.palabras });
    expect(avisos.some((a) => /cae encima de ficha/.test(a.que))).toBe(true);
    expect(avisos.some((a) => /cuadro 0/.test(a.que))).toBe(false);
  });

  it("la lista se revisa fila a fila: una fila corta no choca con una cabeza a su derecha", () => {
    const [l] = resolverPiezas([{ tipo: "lista", x: 44, y: 400, desde: { t: 0 }, hasta: { t: 1 }, items: [{ texto: "VÍAS", palabra: 0 }, { texto: "URBANISMOS", palabra: 1 }] }], base);
    const filas = filasDePieza(l);
    expect(filas).toHaveLength(2);
    expect(filas[0].x1).toBeLessThan(filas[1].x1);
    expect(cajaDePieza(l).x1).toBe(filas[1].x1);
  });

  it("arma lo que lee Remotion, con la marca y el cierre", () => {
    const plan = { piezas: [{ tipo: "titular", lineas: [{ texto: "LO MÁS CARO" }], hasta: { t: 1 } }], golpes: [{ palabra: 2 }], subtitulos: { textos: ["Lo más *caro", "de tu obra", "y lo que hacemos", "vías, urbanismos."] } };
    const r = escenaParaRemotion({ linea, palabras, camara: cam, plan, marca: { colores: { oscuro: "#152473" }, subtitulos: { estilo: "placa" } } });
    expect(r.error).toBeUndefined();
    expect(r.datos.total).toBe(linea.total);
    expect(r.datos.palabras[2]).toMatchObject({ w: "caro", kw: true });
    expect(r.datos.palabras[10].w).toBe("vías");
    expect(r.datos.golpes).toEqual([0.9]);
    expect(r.datos.subtitulos).toMatchObject({ y: 1380, estilo: "placa", mayusculas: true });
    expect(r.datos.cam).toHaveLength(linea.total);
    const mal = escenaParaRemotion({ linea, palabras, camara: cam, plan: { ...plan, subtitulos: { textos: ["Lo más"] } }, marca: {} });
    expect(mal.error).toMatch(/Faltan grupos/);
  });
});
