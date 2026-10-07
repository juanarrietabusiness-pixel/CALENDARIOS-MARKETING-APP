import { describe, it, expect } from "vitest";
import {
  PLANTILLAS_BASE, plantillasDisponibles, limpiarPlantilla, limpiarPlanCliente, plantillaDelCliente, configDeFormatos,
  conteoSemanal, resumenPlantilla, lineaDelPlan, idNuevo, copiaDePlantilla, esDeArranque, MAX_POR_DIA, planParaGuardar,
} from "./plantillasPlan";

const de = (id) => PLANTILLAS_BASE.find((p) => p.id === id);

describe("las plantillas de arranque", () => {
  it("nueve: tres objetivos por tres negocios", () => {
    expect(PLANTILLAS_BASE).toHaveLength(9);
    expect(PLANTILLAS_BASE.map((p) => p.id)).toContain("seguidores-servicios");
  });

  it("ventas es el ritmo (lunes a sábado, uno por día); seguidores suma 2 reels virales; 360, 3 virales y comunidad", () => {
    const v = conteoSemanal(de("ventas-productos"));
    expect(v.total).toBe(6);
    expect(v.tipos).toEqual({});
    expect(de("ventas-productos").dias[0]).toEqual([]);
    expect(de("ventas-productos").dias[1]).toEqual([{ format: "post", pilar: "" }]);

    const s = conteoSemanal(de("seguidores-productos"));
    expect(s.total).toBe(8);
    expect(s.tipos).toEqual({ viral: 2 });

    const t = conteoSemanal(de("360-marca"));
    expect(t.tipos).toEqual({ viral: 3, comunidad: 2 });
    expect(t.formatos.historia).toBeUndefined(); // sin historias
    expect(resumenPlantilla(de("360-productos"))).toBe("11 por semana · 5 reels, 3 posts, 3 carruseles · 3 Viral / alcance, 2 Comunidad");
  });
});

describe("lo que cambia la agencia", () => {
  it("una guardada con el id de una de arranque la sustituye; las propias van al final, por nombre", () => {
    const lista = plantillasDisponibles([
      { ...de("ventas-productos"), nombre: "Ventas (la nuestra)", dias: { 1: [{ format: "reel", pilar: "" }] } },
      { id: "p-zeta", nombre: "Zeta", dias: {} },
      { id: "p-alfa", nombre: "Alfa", dias: {} },
      { id: "mala" },
    ]);
    expect(lista).toHaveLength(11);
    expect(lista[0]).toMatchObject({ id: "ventas-productos", nombre: "Ventas (la nuestra)", base: true, editada: true });
    expect(lista[1]).toMatchObject({ base: true, editada: false });
    expect(lista.slice(9).map((p) => p.nombre)).toEqual(["Alfa", "Zeta"]);
  });

  it("limpia formatos y tipos que no existen, y el tope por día", () => {
    const t = limpiarPlantilla({ id: "p-x", nombre: "  X  ", objetivo: "nada", dias: { 1: [{ format: "tiktok" }, { format: "reel", pilar: "inventado" }, ...Array(6).fill({ format: "post" })] } });
    expect(t.nombre).toBe("X");
    expect(t.objetivo).toBe("ventas");
    expect(t.dias[1][0]).toEqual({ format: "reel", pilar: "" });
    expect(t.dias[1]).toHaveLength(MAX_POR_DIA);
    expect(limpiarPlantilla({ id: "../x", nombre: "a" })).toBeNull();
  });

  it("ids nuevos sin choques ni tildes", () => {
    expect(idNuevo("Plan Ñandú más", [])).toBe("p-plan-nandu-mas");
    expect(idNuevo("Plan", ["p-plan"])).toBe("p-plan-2");
    expect(esDeArranque("ventas-marca")).toBe(true);
    expect(copiaDePlantilla(de("ventas-marca"), { id: "p-y", nombre: "" }).nombre).toBe("Centrado en ventas · Marca personal (copia)");
  });
});

describe("la del cliente", () => {
  const lista = plantillasDisponibles([]);
  it("la personalizada manda; si no, la elegida; si no, ninguna", () => {
    expect(plantillaDelCliente(null, lista)).toBeNull();
    expect(plantillaDelCliente({ plantilla: "360-servicios" }, lista).id).toBe("360-servicios");
    const propia = plantillaDelCliente({ plantilla: "360-servicios", personalizada: { ...de("360-servicios"), nombre: "Dcasa", dias: { 2: [{ format: "live" }] } } }, lista);
    expect(propia).toMatchObject({ personalizada: true, origen: "Marketing 360 · Servicios", nombre: "Dcasa" });
    expect(limpiarPlanCliente({ plantilla: "<x>" })).toEqual({ plantilla: "", personalizada: null, linea: "" });
    expect(planParaGuardar({ plantilla: "ventas-servicios" }, lista).linea).toMatch(/^PLAN DE CONTENIDO: Centrado en ventas \(servicios\)/);
    expect(planParaGuardar({ plantilla: "no-existe" }, lista)).toBeNull();
  });

  it("la configuración del planificador lleva el tipo de cada publicación", () => {
    const cfg = configDeFormatos(de("seguidores-productos"));
    expect(cfg[2]).toEqual([{ format: "carrusel", pilar: "" }, { format: "reel", pilar: "viral" }]);
    expect(cfg[0]).toEqual([]);
  });

  it("la línea para la IA dice el objetivo y lo que lleva", () => {
    const l = lineaDelPlan(de("seguidores-marca"));
    expect(l).toMatch(/^PLAN DE CONTENIDO: Ventas y seguidores \(marca personal\) — El plan tiene dos objetivos/);
    expect(l).toContain("8 por semana");
    expect(lineaDelPlan(null)).toBe("");
  });
});
