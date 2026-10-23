import { describe, it, expect } from "vitest";
import {
  partirGuionUgc, guionUgcATexto, vozDelGuion, tomasDelGuion, medidaDeLaVoz, palabrasQueCaben, duracionUgc, esGuionUgc,
  leerGuionConGanchos, conGancho, reglaUgc, leerTranscripcion, leerAdaptacionUgc, publicacionDeUgc, pedidoDeAdaptacionUgc,
  pedidoDeVozUgc, leerVozUgc, lineaDeVozUgc, guionesUgcDe, ugcParaGrabar, textoParaGrabar,
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

describe("la línea «FÓRMULA:» que dice la IA no entra en el guion", () => {
  it("ni partido por tramos ni en el texto de respaldo", () => {
    expect(partirGuionUgc(`FÓRMULA: Pregunta → precio\n${GUION}`)).toHaveLength(3);
    expect(leerGuionConGanchos(`FÓRMULA: X\n${GUION}\nGANCHOS:\n- Uno`).guion).not.toMatch(/F[OÓ]RMULA/i);
    expect(leerGuionConGanchos("Fórmula: X\nUn guion sin tramos").guion).toBe("VOZ: «Un guion sin tramos»");
  });
});

describe("la «Voz UGC» de un cliente", () => {
  it("los guiones UGC de sus calendarios: sólo reels con rostro y guion, los aprobados primero y luego los más nuevos", () => {
    const cals = [{ days: [
      { date: "2030-10-05", posts: [{ format: "reel", rostro: true, title: "Nuevo", guion: "x" }] },
      { date: "2030-10-01", posts: [{ format: "reel", rostro: true, title: "Aprobado", guion: "y", status: "approved" }, { format: "reel", title: "Sin rostro", guion: "z" }] },
      { date: "2030-10-08", posts: [{ format: "reel", rostro: true, title: "Vacío", guion: " " }] },
    ] }];
    expect(guionesUgcDe(cals).map((g) => [g.titulo, g.estado])).toEqual([["Aprobado", "aprobado"], ["Nuevo", ""]]);
  });

  it("el pedido lleva sus guiones y la nota de ahora; sin guiones lo dice; la respuesta se limpia", () => {
    const p = pedidoDeVozUgc({ marca: "Dcasa", guiones: [{ titulo: "Uno", guion: "[0–3 s] VOZ: «Hola»", estado: "aprobado" }], actual: "## Quién habla\nAna" });
    expect(p).toMatch(/Escribe la nota «Voz UGC» de Dcasa/);
    expect(p).toContain("### 1. Uno (aprobado)");
    expect(p).toContain("LA NOTA DE AHORA");
    expect(pedidoDeVozUgc({ marca: "Dcasa" })).toMatch(/Todavía no hay guiones UGC/);
    expect(leerVozUgc("Claro:\n## Quién habla\nAna")).toBe("## Quién habla\nAna");
    expect(lineaDeVozUgc("")).toBe("");
    expect(lineaDeVozUgc("De tú.")).toMatch(/^VOZ UGC DE ESTA MARCA[^\n]*\nDe tú\.$/);
  });
});

describe("«Guiones para grabar»", () => {
  const DIAS = [
    { date: "2030-10-09", posts: [{ id: "b", format: "reel", rostro: true, title: "Segundo", guion: GUION, duracionUgc: 15 }] },
    { date: "2030-10-02", posts: [
      { id: "a", format: "reel", rostro: true, title: "Primero", guion: GUION },
      { id: "con-video", format: "reel", rostro: true, guion: GUION, medios: [{ tipo: "video", src: "/api/media/x.mp4" }] },
      { id: "no-ugc", format: "reel", guion: GUION },
    ] },
    { date: "2030-10-05", posts: [{ id: "enviado", format: "reel", rostro: true, guion: GUION, etapa: "produccion" }, { id: "sin", format: "reel", rostro: true }] },
  ];

  it("los UGC sin video, por fecha; los ya enviados sólo si se piden; los que no tienen guion, marcados", () => {
    expect(ugcParaGrabar(DIAS).map((x) => x.id)).toEqual(["a", "sin", "b"]);
    expect(ugcParaGrabar(DIAS).find((x) => x.id === "sin").sinGuion).toBe(true);
    expect(ugcParaGrabar(DIAS, { conEnviados: true }).map((x) => x.id)).toEqual(["a", "enviado", "sin", "b"]);
  });

  it("un solo mensaje: la sesión y cada video con lo que dice y sus tomas", () => {
    const t = textoParaGrabar({ cliente: "Dcasa", cuando: "jueves 30 oct", piezas: [DIAS[1].posts[0], DIAS[0].posts[0]] });
    expect(t.split("\n")[0]).toBe("*Grabación Dcasa · jueves 30 oct* · 2 videos");
    expect(t).toContain("*1. Primero*");
    expect(t).toContain("*2. Segundo* (15 s)");
    expect(t).toContain("_Lo que dices:_\n¿Tu sofá tiene manchas?");
    expect(t).toContain("_Tomas:_");
    expect(t.indexOf("Primero")).toBeLessThan(t.indexOf("Segundo"));
    expect(textoParaGrabar({ piezas: [{ title: "Uno", guion: GUION }] })).toMatch(/^\*Grabación\* · 1 video/);
  });
});
