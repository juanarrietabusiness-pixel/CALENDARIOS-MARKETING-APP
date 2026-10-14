import { describe, it, expect } from "vitest";
import { planDeIdeas, pedidoDeIdeasEstudio, leerIdeasEstudio, MAX_IDEAS } from "./ideasEstudio";
import { ideaAlPedido } from "./estudio";
import { PILARES } from "./pilares";

describe("«Dame ideas»", () => {
  it("variadas: cada idea de un tipo distinto; los tipos con producto llevan uno del catálogo, rotando", () => {
    const plan = planDeIdeas({ n: 7, productos: [{ id: "a" }, { id: "b" }] });
    expect(plan.map((r) => r.tipo)).toEqual(PILARES.map((p) => p.id));
    for (const r of plan) expect(Boolean(r.productoId)).toBe(Boolean(PILARES.find((p) => p.id === r.tipo).producto));
    expect(new Set(plan.filter((r) => r.productoId).map((r) => r.productoId))).toEqual(new Set(["a", "b"]));
    expect(new Set(plan.map((r) => r.composicion)).size).toBe(7);
  });

  it("de un tipo: todas de ese tipo; nunca más de las que caben", () => {
    expect(planDeIdeas({ n: 3, tipo: "educativo" }).every((r) => r.tipo === "educativo" && !r.productoId)).toBe(true);
    expect(planDeIdeas({ n: 40 })).toHaveLength(MAX_IDEAS);
    expect(planDeIdeas({ n: 2, tipo: "inventado" }).map((r) => r.tipo)).toEqual([PILARES[0].id, PILARES[1].id]);
  });

  it("el pedido da cada idea resuelta, con la regla de su tipo y la línea del producto; en video, sin texto", () => {
    const plan = planDeIdeas({ n: 2, tipo: "anuncio", productos: [{ id: "a" }] });
    const p = pedidoDeIdeasEstudio({ marca: "Dcasa", plan, productos: { a: "Sofá · $399" }, tema: "Navidad" });
    expect(p).toMatch(/^1\. Anuncio: Pieza de venta directa.*composición: .*producto: Sofá · \$399$/m);
    expect(p).toMatch(/Tema que pide la persona: Navidad/);
    expect(pedidoDeIdeasEstudio({ plan, video: true })).toMatch(/"texto": vacío/);
  });

  it("lee por número, limpia el texto (dos líneas) y lo pone en el pedido EXACTO", () => {
    const plan = planDeIdeas({ n: 2, tipo: "anuncio", productos: [{ id: "a" }] });
    const ideas = leerIdeasEstudio(JSON.stringify({ ideas: [
      { n: 2, titulo: "Sala lista", escena: "Un sofá en una sala luminosa", texto: "«Tu sala, lista»\nDesde $399\nsobra" },
      { n: 1, titulo: "", escena: "" },
    ] }), plan);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ id: "idea-2", tipo: "anuncio", productoId: "a", titulo: "Sala lista", texto: "Tu sala, lista\nDesde $399" });
    expect(ideaAlPedido(ideas[0])).toBe('Un sofá en una sala luminosa\n\nTexto en la imagen, exacto y legible: "Tu sala, lista" / "Desde $399"');
    expect(ideaAlPedido({ escena: "Sólo escena", texto: "" })).toBe("Sólo escena");
  });
});
