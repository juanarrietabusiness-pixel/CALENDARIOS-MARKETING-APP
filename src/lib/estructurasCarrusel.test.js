import { describe, it, expect } from "vitest";
import {
  ESTRUCTURAS_CARRUSEL, estructuraDe, estructuraPara, limpiarEstructurasRecientes, estructurasDeCalendarios, lineaDeEstructura, estructurasDistintas,
} from "./estructurasCarrusel.js";
import { darForma, pedidoDeProduccion, publicacionDePieza } from "./loteAnuncios.js";
import { pedidoDeIdeasFormato, leerIdeasFormato } from "./ideasFormato.js";
import { pedidoDeCarrusel } from "./director.js";

describe("las estructuras de un carrusel", () => {
  it("cada una con su id, su número de láminas y con qué tipos encaja", () => {
    const ids = ESTRUCTURAS_CARRUSEL.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of ESTRUCTURAS_CARRUSEL) {
      expect(e.laminas).toBeGreaterThanOrEqual(5);
      expect(e.laminas).toBeLessThanOrEqual(10);
      expect(e.tipos.length).toBeGreaterThan(0);
    }
    expect(lineaDeEstructura("errores")).toMatch(/^estructura del carrusel: Errores comunes, 6 láminas:/);
    expect(lineaDeEstructura("inventada")).toBe("");
  });

  it("rota dentro del tipo y no repite las dos últimas que ese cliente usó en ese tipo", () => {
    const delTipo = ESTRUCTURAS_CARRUSEL.filter((x) => x.tipos.includes("educativo")).map((x) => x.id);
    const usadas = [{ pilar: "educativo", estructura: delTipo[0] }, { pilar: "educativo", estructura: delTipo[1] }];
    for (let s = 0; s < 20; s++) {
      const id = estructuraPara("educativo", { usadas, semilla: s });
      expect(delTipo).toContain(id);
      expect([delTipo[0], delTipo[1]]).not.toContain(id);
    }
    // Lo de OTRO tipo no cuenta: una educativa no quita una estructura a un anuncio.
    const otro = estructuraPara("anuncio", { usadas: [{ pilar: "educativo", estructura: "comparacion" }], semilla: 0 });
    expect(estructuraDe(otro).tipos).toContain("anuncio");
  });

  it("lee las recientes de los calendarios del cliente, por fecha y sólo las que existen", () => {
    const cals = [{ days: [
      { date: "2026-10-10", posts: [{ format: "carrusel", pilar: "educativo", estructura: "mitos" }, { format: "post", estructura: "mitos" }] },
      { date: "2026-10-02", posts: [{ format: "carrusel", pilar: "educativo", estructura: "pasos" }, { format: "carrusel", estructura: "inventada" }] },
    ] }];
    expect(estructurasDeCalendarios(cals)).toEqual([{ pilar: "educativo", estructura: "pasos" }, { pilar: "educativo", estructura: "mitos" }]);
    expect(limpiarEstructurasRecientes([{ pilar: "x", estructura: "nada" }, null, { estructura: "caso" }])).toEqual([{ pilar: "", estructura: "caso" }]);
  });

  it("darForma: los carruseles de un mismo tipo salen con estructuras distintas y lo demás sin ella", () => {
    const celdas = Array.from({ length: 4 }, () => ({ tipo: "educativo", formato: "carrusel" }));
    const plan = darForma([...celdas, { tipo: "educativo", formato: "post" }], { formato: "plan", semilla: 3 });
    const est = plan.slice(0, 4).map((r) => r.estructura);
    expect(est.every(Boolean)).toBe(true);
    // Seguidas, nunca la misma (no repite las dos últimas).
    for (let i = 1; i < est.length; i++) expect(est[i]).not.toBe(est[i - 1]);
    expect(plan[4].estructura).toBeUndefined();
    // La misma semilla da el mismo plan (cada tanda lo recalcula).
    expect(darForma([...celdas], { formato: "plan", semilla: 3 }).map((r) => r.estructura)).toEqual(est);
    // Va en el pedido y en la publicación.
    expect(pedidoDeProduccion({ marca: "Dcasa", plan: [{ ...plan[0], n: 1 }], formato: "carrusel" })).toContain(lineaDeEstructura(est[0]));
    expect(publicacionDePieza({ id: "p1", idea: { ...plan[0], titular: "Hola" }, formato: "carrusel" }).estructura).toBe(est[0]);
  });

  it("«Dame ideas» del carrusel: una estructura distinta por idea, y la idea la recuerda", () => {
    const ids = estructurasDistintas("anuncio", 4, { semilla: 1 });
    expect(new Set(ids).size).toBe(4);
    const p = pedidoDeIdeasFormato({ formato: "carrusel", marca: "Dcasa", n: 4, estructuras: ids });
    expect(p).toMatch(/Cada idea con SU estructura/);
    expect(p).toContain(`1. ${lineaDeEstructura(ids[0])}`);
    const leidas = leerIdeasFormato(JSON.stringify({ ideas: [{ titulo: "a", tema: "b", guion: "Portada: x\nCTA: y" }] }), "carrusel", ids);
    expect(leidas[0].estructura).toBe(ids[0]);
    expect(pedidoDeIdeasFormato({ formato: "reel", estructuras: ids })).not.toMatch(/estructura/);
  });

  it("el director, con sólo un tema, sigue la estructura; con guion, no la necesita", () => {
    const linea = lineaDeEstructura("checklist");
    expect(pedidoDeCarrusel({ tema: "cómo escoger un sofá", estructura: linea })).toContain(`Sigue esta ${linea}`);
    expect(pedidoDeCarrusel({ laminas: [{ n: 1, rol: "portada", texto: "a" }, { n: 2, rol: "cierre", texto: "b" }], estructura: linea })).not.toContain("Sigue esta");
  });
});
