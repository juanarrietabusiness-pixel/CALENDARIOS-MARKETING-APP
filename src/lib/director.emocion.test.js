import { describe, it, expect } from "vitest";
import {
  FORMATO_FICHA, RAZONA_COMO_DIRECTOR, MAX_FICHA, limpiarFicha, ajustarFicha, textoDeLaFicha, asegurarTexto, esFicha, pedidoDeFichas,
} from "./director";
import { fichaDelPedido } from "../../worker/lib/estudio/control.js";

// ============================================================
// La línea «Emoción» de la ficha del director
//
// Lo que importa:
//   1. Va detrás de «Pieza» y la escribe el director (qué siente quien la ve y dónde se usa).
//   2. Una ficha de ANTES (sin Emoción) se lee y se acorta exactamente igual que siempre.
//   3. Al acortar, Emoción se va después de Marca y Evitar y antes que Fondo; la pieza y el texto exacto, nunca.
// ============================================================

const rep = (t, n) => t.repeat(n).trim();
const VIEJA = [
  "Pieza: post 4:5 — servicio: el examen gratis con tu compra.",
  `Composición: ${rep("titular arriba, del 6 al 20 % de la altura; ", 6)}`,
  `Fondo: ${rep("la consulta, pared crema #F2EDE4; ", 5)}`,
  `Imagen principal: ${rep("una mujer en el autorrefractómetro; ", 6)}`,
  `Fotografía: ${rep("panel suave a 45° desde la derecha, 5000 K, 50 mm a f/2.2; ", 5)}`,
  "Texto (exacto, sin cambiar una letra): titular «Examen computarizado gratis» (9 %); apoyo «Incluido con tu compra» (4 %).",
  `Marca: ${rep("logo abajo a la derecha, 12 % del ancho; ", 4)}`,
  `Evitar: ${rep("caras deformadas; ", 8)}`,
].join("\n");
const EMOCION = "Emoción: alivio y confianza de que la vista se cuida sin pagar de más; para un anuncio en el feed.";
const NUEVA = VIEJA.replace(/^(Pieza: .*)$/m, `$1\n${EMOCION}`);
const lineasDe = (f) => f.split("\n").map((l) => l.split(":")[0]);

describe("el formato", () => {
  it("lleva «Emoción» detrás de «Pieza», con dónde se usa", () => {
    const orden = lineasDe(FORMATO_FICHA);
    expect(orden.indexOf("Emoción")).toBe(orden.indexOf("Pieza") + 1);
    const linea = FORMATO_FICHA.split("\n").find((l) => l.startsWith("Emoción:"));
    expect(linea).toMatch(/qué tiene que sentir quien la ve en dos segundos/);
    expect(linea).toMatch(/feed, historia o anuncio/);
    expect(RAZONA_COMO_DIRECTOR).toMatch(/va en la línea «Emoción»/);
    expect(pedidoDeFichas({ piezas: [{ n: 1, formato: "post", idea: "x" }] })).toContain(linea);
  });

  it("la fotografía recoge las referencias de estilo de la marca con palabras genéricas", () => {
    expect(FORMATO_FICHA.split("\n").find((l) => l.startsWith("Fotografía:"))).toMatch(/referencias de estilo, se notan aquí[^]*palabras genéricas/);
  });
});

describe("una ficha de ANTES, sin Emoción, sigue igual", () => {
  it("se limpia, se reconoce y da el mismo texto exacto", () => {
    expect(limpiarFicha(VIEJA.split("\n").slice(0, 3).join("\n\n"))).toBe(VIEJA.split("\n").slice(0, 3).join("\n"));
    expect(esFicha(VIEJA)).toBe(true);
    expect(textoDeLaFicha(VIEJA)).toBe("Examen computarizado gratis\nIncluido con tu compra");
  });

  it("se acorta en el mismo orden de siempre: Marca, Evitar y Fondo", () => {
    const sinMarca = VIEJA.split("\n").filter((l) => !l.startsWith("Marca:")).join("\n");
    expect(ajustarFicha(VIEJA, sinMarca.length)).toBe(sinMarca);
    const sinMarcaNiEvitar = sinMarca.split("\n").filter((l) => !l.startsWith("Evitar:")).join("\n");
    expect(ajustarFicha(VIEJA, sinMarcaNiEvitar.length)).toBe(sinMarcaNiEvitar);
    const sinFondo = sinMarcaNiEvitar.split("\n").filter((l) => !l.startsWith("Fondo:")).join("\n");
    expect(ajustarFicha(VIEJA, sinFondo.length)).toBe(sinFondo);
  });
});

describe("una ficha NUEVA, con Emoción", () => {
  it("al acortar, Emoción se va después de Marca y Evitar y antes que Fondo", () => {
    const quitar = (f, prefijos) => f.split("\n").filter((l) => !prefijos.some((p) => l.startsWith(`${p}:`))).join("\n");
    const tres = quitar(NUEVA, ["Marca", "Evitar", "Emoción"]);
    const f = ajustarFicha(NUEVA, tres.length);
    expect(f).toBe(tres);
    expect(f).toMatch(/^Fondo:/m);
    const dos = quitar(NUEVA, ["Marca", "Evitar"]);
    expect(ajustarFicha(NUEVA, dos.length)).toContain(EMOCION);
  });

  it("una larga cabe en su tope sin perder la pieza ni el texto exacto", () => {
    const larga = `${NUEVA}\nOtra: ${rep("relleno ", 200)}`;
    const f = limpiarFicha(larga);
    expect(f.length).toBeLessThanOrEqual(MAX_FICHA);
    expect(f).toMatch(/^Pieza: post 4:5/);
    expect(textoDeLaFicha(f)).toBe("Examen computarizado gratis\nIncluido con tu compra");
    const asegurada = asegurarTexto(larga, "Examen computarizado gratis\nIncluido con tu compra");
    expect(asegurada.length).toBeLessThanOrEqual(MAX_FICHA);
    expect(asegurada).toContain("«Examen computarizado gratis»");
  });

  it("el control la lee entera con la ficha del pedido (del «Pieza:» a la primera línea en blanco)", () => {
    const pedido = `${NUEVA}\n\nTipo de pieza: anuncio.`;
    expect(fichaDelPedido(pedido)).toContain(EMOCION);
    expect(fichaDelPedido(pedido)).not.toContain("Tipo de pieza");
  });
});
