import { describe, it, expect } from "vitest";
import { suavizar, planosAutomaticos, camaraDelVideo, ANCHO, ALTO } from "./camaraEdicion.js";
import { lineaDeTiempo } from "./corteEdicion.js";
import { resolverPiezas, subtitulos, revisarEscena, revisarTextos, escenaParaRemotion, cajaDePieza, filasDePieza, crearMedidor, textosDeEscena, TRIO } from "./escenaEdicion.js";

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
    expect(textos).toMatch(/sello tapa ~\d+ % de la cabeza o la cara/);
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

describe("los textos con anchos MEDIDOS (Rofer, 2026-11-21: el trío se montaba y «GRANDES» se salía)", () => {
  // Los anchos de Anton medidos por letras.py (em) y la altura de sus mayúsculas.
  const ANTON = { _mayus: 0.8594, MINIS: 2.1587, MEDIANOS: 3.8086, GRANDES: 3.311, TIEMPO: 2.7383 };
  const linea = lineaDeTiempo([{ id: "a", piezas: [[0, 6]] }], { fps: 30, cierre: 2 });
  const palabras = ["minis", "medianos", "y", "grandes"].map((w, i) => ({ w, s: i * 0.5, e: i * 0.5 + 0.4 }));
  const cam = camaraDelVideo(linea, { a: geoQuieta(200, { top: 900, hx: 540, hw: 220, bot: 1900 }) });
  const base = { fps: 30, vozFin: linea.vozFin, palabras, cabeza: cam.cabeza };
  const TRIO_PLAN = { tipo: "trio", y: 262, desde: { palabra: 0 }, hasta: { t: 3 }, items: [{ texto: "MINIS", palabra: 0 }, { texto: "MEDIANOS", palabra: 1 }, { texto: "GRANDES", palabra: 3 }] };
  const avisosDe = (piezas, med) => { const a = []; revisarTextos(piezas, { med, decir: (t, grave, que) => a.push(que) }); return a; };

  it("sin imagen, las tres palabras del MISMO tamaño, cada una dentro de su columna y sin avisos", () => {
    const med = crearMedidor({ titular: ANTON });
    const [t] = resolverPiezas([TRIO_PLAN], { ...base, med });
    expect(new Set(t.items.map((i) => i.tam)).size).toBe(1);
    expect(t.items[0].tam).toBeLessThanOrEqual(TRIO.tamMax);
    for (const it of t.items) expect(med.ancho(it.texto, it.tam, "titular", 1)).toBeLessThanOrEqual(t.col - TRIO.hueco);
    expect(t.items.map((i) => i.cx)).toEqual([206.667, 540, 873.333]);
    expect(avisosDe([t], med)).toEqual([]);
  });

  it("con imagen crece la imagen, no la palabra, y la imagen cabe en su columna", () => {
    const med = crearMedidor({ titular: ANTON });
    const [t] = resolverPiezas([{ ...TRIO_PLAN, imagen: "marca/logo-dibujo.png" }], { ...base, med });
    expect(t.items.map((i) => i.tam)).toEqual([64, 64, 64]);
    expect(t.items[0].img).toBeLessThan(t.items[2].img);
    expect(Math.max(...t.items.map((i) => i.img))).toBeLessThanOrEqual(t.col - TRIO.hueco);
  });

  it("la revisión caza el trío de antes: «MEDIANOS» se monta sobre «GRANDES» y «GRANDES» se sale (CSS desborda a la derecha)", () => {
    const med = crearMedidor({ titular: ANTON });
    const viejo = { tipo: "trio", n: 0, desde: 0, hasta: 3, y: 262, col: 320, items: [["MINIS", 0.55], ["MEDIANOS", 0.78], ["GRANDES", 1]]
      .map(([texto, e], i) => ({ texto, at: i * 0.5, tam: 64 + 40 * e, cx: 190 + i * 350, cy: 262 + 230 - 64 * e + (64 + 40 * e) * 0.62 })) };
    const a = avisosDe([viejo], med).join("\n");
    expect(a).toMatch(/«GRANDES» \(trio\) se sale del cuadro/);
    expect(a).toMatch(/«MEDIANOS» \(trio\) se monta sobre «GRANDES»/);
  });

  it("dos piezas a la vez que se montan, se avisa; si no coinciden en el tiempo, no", () => {
    const med = crearMedidor({ titular: ANTON });
    const piezas = resolverPiezas([
      { tipo: "gigante", texto: "MEDIANOS", tam: 150, y: 400, desde: { t: 0 }, hasta: { t: 2 } },
      { tipo: "sello", arriba: "FLOTA", grande: "GRANDES", y: 420, desde: { t: 1 }, hasta: { t: 3 } },
      { tipo: "ficha", texto: "TIEMPO", y: 420, x: 40, desde: { t: 2.5 }, hasta: { t: 3.5 } },
    ], { ...base, med });
    const a = avisosDe(piezas, med);
    expect(a.some((x) => /«MEDIANOS» \(gigante\) se monta sobre «GRANDES» \(sello\)/.test(x))).toBe(true);
    expect(a.some((x) => /gigante.*ficha|ficha.*gigante/.test(x))).toBe(false);
  });

  it("lo que no está medido se aproxima y la revisión lo dice; se sabe qué medir", () => {
    const med = crearMedidor({ titular: ANTON });
    const [g] = resolverPiezas([{ tipo: "gigante", texto: "OBRA", tam: 100, y: 400, desde: { t: 0 }, hasta: { t: 1 } }], { ...base, med });
    expect(avisosDe([g], med).join(" ")).toMatch(/Medidas aproximadas para 1 textos \(«OBRA»/);
    expect(textosDeEscena([TRIO_PLAN, { tipo: "lista", titulo: "LO QUE HACEMOS", items: [{ texto: "VÍAS" }] }, { tipo: "sello", arriba: "FLOTA", grande: "14" }], { whatsapp: "6086-6581" }))
      .toEqual({ titular: ["MINIS", "MEDIANOS", "GRANDES", "14", "6086-6581"], texto: ["WHATSAPP", "LO QUE HACEMOS", "VÍAS", "FLOTA"] });
  });

  it("una ficha que roza el borde de la cabeza no es taparla; una encima de la cara, sí", () => {
    const med = crearMedidor({ titular: ANTON });
    const camCerca = camaraDelVideo(linea, { a: geoQuieta(200, { top: 560, hx: 540, hw: 300, bot: 1900 }) });
    const tope = camCerca.cabeza[30][1];
    const ancho = camCerca.cabeza[30][2];
    const izquierda = camCerca.cabeza[30][0] - ancho / 2;
    const piezas = resolverPiezas([
      { tipo: "ficha", texto: "TIEMPO", x: izquierda - 330, y: tope + 300, desde: { t: 0 }, hasta: { t: 1 } },
      { tipo: "ficha", texto: "DINERO", x: izquierda + 20, y: tope + 300, desde: { t: 2 }, hasta: { t: 3 } },
    ], { ...base, cabeza: camCerca.cabeza, med });
    const a = revisarEscena({ piezas, cabeza: camCerca.cabeza, fps: 30, grupos: [], palabras, med });
    expect(a.filter((x) => /ficha tapa/.test(x.que)).map((x) => x.t)).toEqual([2]);
  });
});
