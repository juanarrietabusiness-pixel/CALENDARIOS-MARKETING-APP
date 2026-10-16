import { describe, it, expect } from "vitest";
import {
  embudoDelMes, mejoresDelPeriodo, pedidoDeEstrategia, leerEstrategia, limpiarEstrategia, semanasConEtapa, balanceDelMes, resumenFormatos,
} from "./estrategiaMes.js";

describe("la estrategia del mes", () => {
  it("el embudo por defecto sigue el objetivo y llena las semanas", () => {
    expect(embudoDelMes("ventas", 4)).toEqual(["atraer", "considerar", "convertir", "convertir"]);
    expect(embudoDelMes("nada", 6)).toHaveLength(6);
    expect(embudoDelMes("seguidores", 2)).toEqual(["atraer", "atraer"]);
  });

  it("lo mejor del mes anterior, por interacciones y dentro del periodo", () => {
    const filas = [
      { publicada_at: "2026-09-03T10:00:00Z", interacciones: 10, texto: "a", red: "instagram" },
      { publicada_at: "2026-09-20T10:00:00Z", interacciones: 90, texto: "b", red: "instagram" },
      { publicada_at: "2026-10-01T10:00:00Z", interacciones: 500, texto: "fuera", red: "instagram" },
    ];
    expect(mejoresDelPeriodo(filas, { desde: "2026-09-01", hasta: "2026-09-30" }).map((m) => m.texto)).toEqual(["b", "a"]);
  });

  it("el pedido respeta lo que decidió la agencia y lleva lo que funcionó", () => {
    const p = pedidoDeEstrategia({
      marca: "Dcasa", mes: "Noviembre 2026", objetivo: "ventas", productos: ["- [p1] Sofá cama · $399"],
      semanas: [{ n: 1, desde: "2026-11-01", hasta: "2026-11-01" }], fechas: [{ fecha: "2026-11-02", nombre: "Difuntos", delicada: true }],
      mejores: [{ red: "instagram", tipo: "reel", interacciones: 90, texto: "El sofá que se abre en 3 s" }],
    });
    expect(p).toContain("OBJETIVO (lo decidió la agencia, respétalo): Vender");
    expect(p).toContain("[p1] Sofá cama · $399");
    expect(p).toContain("delicada: sin promociones");
    expect(p).toContain("90 interacciones");
    expect(p).toContain("Semana 1: del 2026-11-01");
  });

  it("lee la respuesta: foco sólo del catálogo, etapas válidas y todas las semanas", () => {
    const r = leerEstrategia('ok {"objetivo":"marca","foco":"inventado","campana":"Noviembre en casa","razon":"r","semanas":[{"concepto":"Visitas","etapa":"atraer"},{"concepto":"Sofá","etapa":"otra"}]}', { semanas: 3, productos: ["p1"] });
    expect(r.objetivo).toBe("marca");
    expect(r.focoId).toBe("");
    expect(r.semanas).toHaveLength(3);
    expect(r.semanas[1].etapa).toBe("considerar");
    expect(r.semanas[2].concepto).toBe("");
    expect(leerEstrategia('{"foco":"p1","semanas":[]}', { semanas: 1, productos: ["p1"], objetivo: "ventas" })).toMatchObject({ focoId: "p1", objetivo: "ventas" });
    expect(leerEstrategia("sin json")).toBeNull();
  });

  it("lo guardado se limpia y las semanas llevan su etapa al motor", () => {
    expect(limpiarEstrategia({ objetivo: "x", etapas: ["nada"] })).toBeNull();
    expect(limpiarEstrategia({ objetivo: "ventas", etapas: ["atraer", "x"] })).toMatchObject({ objetivo: "ventas", etapas: ["atraer", ""] });
    expect(semanasConEtapa(["Visitas", "Sofá"], ["atraer", ""])).toEqual([expect.stringContaining("etapa: Atraer"), "Sofá"]);
  });
});

describe("el balance del mes", () => {
  const dia = (date, ...posts) => ({ date, posts });
  it("avisa de un tipo que se come el mes, de un mes que no vende y de una semana vacía", () => {
    const days = [
      dia("2026-11-02", { format: "post", pilar: "educativo", nivel: "problema" }),
      dia("2026-11-03", { format: "reel", pilar: "educativo", nivel: "inconsciente" }),
      dia("2026-11-04", { format: "post", pilar: "educativo", nivel: "problema" }),
      dia("2026-11-05", { format: "carrusel", pilar: "humano", nivel: "inconsciente" }),
    ];
    const b = balanceDelMes(days, { semanas: [{ n: 1, desde: "2026-11-02", hasta: "2026-11-08" }, { n: 2, desde: "2026-11-09", hasta: "2026-11-15" }] });
    expect(b.total).toBe(4);
    const textos = b.avisos.map((a) => a.texto).join(" | ");
    expect(textos).toContain("«Educativo / Informativo» es el 75 %");
    expect(textos).toContain("no empuja a comprar");
    expect(textos).toContain("La semana 2 no tiene");
  });

  it("todo venta, sin reels, el mismo formato cuatro días seguidos y un producto que acapara", () => {
    const days = Array.from({ length: 8 }, (_, i) => dia(`2026-11-${String(i + 2).padStart(2, "0")}`,
      { format: "post", pilar: i % 2 ? "anuncio" : "beneficios", nivel: "decision", producto: i < 6 ? "Sofá cama" : "Mesa" }));
    const textos = balanceDelMes(days).avisos.map((a) => a.texto).join(" | ");
    expect(textos).toContain("% vende");
    expect(textos).toContain("Sin reels");
    expect(textos).toContain("Post cuatro días seguidos");
    expect(textos).toContain("«Sofá cama» sale en 6 de 8");
  });

  it("el foco del mes puede acaparar; lo que se avisa es que salga poco", () => {
    const days = Array.from({ length: 6 }, (_, i) => dia(`2026-11-${String(i + 2).padStart(2, "0")}`, { format: i % 2 ? "reel" : "post", pilar: "anuncio", producto: i < 5 ? "Sofá cama" : "Mesa" }));
    expect(balanceDelMes(days, { foco: "Sofá cama" }).avisos.map((a) => a.texto).join(" ")).not.toContain("Sofá cama");
    expect(balanceDelMes(days, { foco: "Mesa" }).avisos.map((a) => a.texto).join(" ")).toContain("El foco del mes («Mesa») sale sólo en 1 de 6");
  });

  it("con poco no dice nada, y resume los formatos", () => {
    expect(balanceDelMes([dia("2026-11-02", { format: "post" })]).avisos).toEqual([]);
    expect(resumenFormatos({ post: 2, reel: 5 })).toBe("Reel 5 · Post 2");
  });
});
