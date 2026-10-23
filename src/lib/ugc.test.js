import { describe, it, expect } from "vitest";
import {
  partirGuionUgc, guionUgcATexto, vozDelGuion, tomasDelGuion, medidaDeLaVoz, palabrasQueCaben, duracionUgc, esGuionUgc,
  leerGuionConGanchos, conGancho, reglaUgc, leerTranscripcion, leerAdaptacionUgc, publicacionDeUgc, pedidoDeAdaptacionUgc,
} from "./ugc.js";

const GUION = [
  "[0–3 s] VOZ: «¿Tu sofá tiene manchas?» | SE VE: La dueña señala el sofá | TEXTO: ¿Manchas?",
  "[3–12 s] VOZ: «Lo lavamos en tu casa» | SE VE: Lavado en la sala",
  "[12–15 s] VOZ: «Escríbenos hoy» | SE VE: El sofá limpio",
].join("\n");

describe("el guion por tramos", () => {
  it("lee la forma de siempre y vuelve a escribirla igual", () => {
    const t = partirGuionUgc(GUION);
    expect(t).toHaveLength(3);
    expect(t[0]).toEqual({ desde: 0, hasta: 3, voz: "¿Tu sofá tiene manchas?", seVe: "La dueña señala el sofá", texto: "¿Manchas?" });
    expect(guionUgcATexto(t)).toBe(GUION);
    expect(esGuionUgc(GUION)).toBe(true);
    expect(esGuionUgc("Hook → desarrollo → CTA")).toBe(false);
  });
  it("lee la forma corta del lote (sin etiquetas, con «·») y una línea suelta sigue al tramo anterior", () => {
    const t = partirGuionUgc("[0-3s] Hola, soy Ana · Ana a cámara · Hola\nsigo hablando\n[3-8 s] Mira esto · Muestra el producto");
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ voz: "Hola, soy Ana sigo hablando", seVe: "Ana a cámara", texto: "Hola" });
    expect(t[1]).toMatchObject({ desde: 3, hasta: 8, voz: "Mira esto", seVe: "Muestra el producto" });
  });
  it("copia la voz seguida y la lista de tomas", () => {
    expect(vozDelGuion(GUION)).toBe("¿Tu sofá tiene manchas?\nLo lavamos en tu casa\nEscríbenos hoy");
    expect(tomasDelGuion(GUION).split("\n")[0]).toBe("1. [0–3 s] La dueña señala el sofá · en pantalla: «¿Manchas?»");
  });
  it("mide si la voz cabe: unas 2,5 palabras por segundo", () => {
    expect(palabrasQueCaben(15)).toBe(38);
    expect(palabrasQueCaben(60)).toBe(150);
    expect(duracionUgc(22)).toBe(30);
    expect(medidaDeLaVoz(GUION, 15)).toEqual({ palabras: 11, caben: 38, sobra: 0 });
    expect(medidaDeLaVoz(GUION.replace("Escríbenos hoy", "palabra ".repeat(40)), 15).sobra).toBeGreaterThan(0);
  });
});

describe("la IA del panel", () => {
  it("la regla dice la forma, la duración y que lo citado va tal cual", () => {
    const r = reglaUgc(45);
    expect(r).toMatch(/45 segundos/);
    expect(r).toMatch(/VOZ: «lo que dice, palabra por palabra» \| SE VE/);
    expect(r).toMatch(/113 palabras como mucho/);
    expect(r).toMatch(/entre comillas en la idea se dice TAL CUAL/);
  });
  it("separa el guion de los ganchos, y un gancho escogido pasa a ser la voz del primer tramo", () => {
    const { guion, ganchos } = leerGuionConGanchos(`${GUION}\n\nGANCHOS:\n- ¿Hace cuánto no lavas tu sofá?\n- «Esto salió de mi sofá»\n- Nadie lo ve, pero está ahí`);
    expect(guion).toBe(GUION);
    expect(ganchos).toEqual(["¿Hace cuánto no lavas tu sofá?", "Esto salió de mi sofá", "Nadie lo ve, pero está ahí"]);
    expect(partirGuionUgc(conGancho(guion, ganchos[1]))[0].voz).toBe("Esto salió de mi sofá");
  });
});

describe("extraer y adaptar", () => {
  it("lee la transcripción de Gemini; sin tramos no hay nada", () => {
    const t = leerTranscripcion('```json\n{"tramos":[{"desde":0,"hasta":2.5,"voz":"Hola","seVe":"Ella"}],"duracion":20,"gancho":"g"}\n```');
    expect(t).toMatchObject({ duracion: 20, gancho: "g", tramos: [{ desde: 0, hasta: 2.5, voz: "Hola", seVe: "Ella", texto: "" }] });
    expect(leerTranscripcion('{"tramos":[]}')).toBeNull();
  });
  it("el pedido lleva el original, el producto con su precio y la regla; no pide copiar", () => {
    const p = pedidoDeAdaptacionUgc({ marca: "Dcasa", original: { tramos: partirGuionUgc(GUION), estructura: "problema → solución" }, productoLinea: "Lavado: Desde $45", duracion: 30 });
    expect(p).toMatch(/No copies frases, marcas/);
    expect(p).toContain("¿Tu sofá tiene manchas?");
    expect(p).toContain("Desde $45");
    expect(p).toMatch(/30 segundos/);
  });
  it("lee la adaptación y arma la publicación UGC", () => {
    const a = leerAdaptacionUgc(`TITULO: Sofá como nuevo\nGUION:\n${GUION}\nGANCHOS:\n- Uno\n- Dos\nDESCRIPCION: Escríbenos. #sofa`);
    expect(a).toMatchObject({ titulo: "Sofá como nuevo", guion: GUION, ganchos: ["Uno", "Dos"], descripcion: "Escríbenos. #sofa" });
    expect(leerAdaptacionUgc("TITULO: x\nGUION:\nnada")).toBeNull();
    expect(publicacionDeUgc(a, { duracion: 15, productoId: "p1", producto: "Lavado" })).toMatchObject({
      format: "reel", rostro: true, title: "Sofá como nuevo", guion: GUION, ganchosUgc: ["Uno", "Dos"], duracionUgc: 15, productoId: "p1",
    });
  });
});
