import { describe, it, expect } from "vitest";
import { primeras, siguientes, restantes, alternar } from "./seleccion";

const lista = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));

describe("qué publicaciones entran en el lote", () => {
  it("propone las primeras que caben", () => {
    expect(primeras(lista(21), 12)).toHaveLength(12);
    expect(primeras(lista(21), 12)[0]).toBe("p1");
    expect(primeras(lista(21), 12)[11]).toBe("p12");
  });

  it("no inventa publicaciones cuando hay menos que el tope", () => {
    expect(primeras(lista(3), 12)).toEqual(["p1", "p2", "p3"]);
  });

  describe("la tanda siguiente", () => {
    it("retoma justo después de la última, sin repetir ni saltarse ninguna", () => {
      const c = lista(21);
      const primera = new Set(primeras(c, 12));
      const segunda = siguientes(c, primera, 12);

      expect(segunda[0]).toBe("p13");
      expect(segunda).toHaveLength(9);
      // Lo que este módulo existe para garantizar: las dos tandas juntas
      // son las 21, cada una exactamente una vez.
      expect([...primera, ...segunda]).toHaveLength(21);
      expect(new Set([...primera, ...segunda]).size).toBe(21);
    });

    it("se guía por la posición en el calendario, no por el orden de marcado", () => {
      const c = lista(10);
      // Marcada la 5 y después la 2: la siguiente empieza en la 6.
      expect(siguientes(c, new Set(["p5", "p2"]), 3)).toEqual(["p6", "p7", "p8"]);
    });

    it("devuelve vacío cuando ya no queda nada detrás", () => {
      const c = lista(5);
      expect(siguientes(c, new Set(["p5"]), 12)).toEqual([]);
      expect(restantes(c, new Set(["p5"]))).toBe(0);
    });

    it("sin nada marcado empieza por el principio", () => {
      expect(siguientes(lista(5), new Set(), 2)).toEqual(["p1", "p2"]);
      expect(restantes(lista(5), new Set())).toBe(5);
    });
  });

  describe("marcar y desmarcar", () => {
    it("deja desmarcar siempre", () => {
      expect(alternar(new Set(["a", "b"]), "a", 1)).toEqual(new Set(["b"]));
    });

    it("no deja pasar del tope", () => {
      const lleno = new Set(["a", "b"]);
      expect(alternar(lleno, "c", 2)).toEqual(lleno);
    });

    it("deja marcar mientras quede sitio", () => {
      expect(alternar(new Set(["a"]), "b", 2)).toEqual(new Set(["a", "b"]));
    });
  });
});
