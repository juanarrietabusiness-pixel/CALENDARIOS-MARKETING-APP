import { describe, it, expect } from "vitest";
import { enTandas, PIEZAS_POR_TANDA } from "./tandas";

// ============================================================
// La numeración entre tandas es un fallo silencioso: cada llamada devuelve
// sus piezas desde 1, así que sin renumerar el prompt sale con tres
// «PIEZA 01» y Meta AI monta tres veces la primera. Se ve al abrir el
// HTML, no antes.
// ============================================================

/** Un generador que hace lo que hace el modelo: numerar desde 1 cada vez. */
const fingirModelo = (registro = []) => async ({ posts }) => {
  registro.push(posts.length);
  return posts.map((_, i) => ({ n: i + 1, titular: ["X"] }));
};

describe("enTandas", () => {
  it("renumera sobre el lote entero, no sobre la tanda", async () => {
    const llamadas = [];
    const piezas = await enTandas(
      { posts: Array.from({ length: 10 }, (_, i) => ({ idea: `i${i}` })), modo: "lote" },
      fingirModelo(llamadas)
    );
    expect(piezas.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(llamadas).toEqual([4, 4, 2]);
  });

  it("no parte un lote que ya cabe en una llamada", async () => {
    const llamadas = [];
    await enTandas(
      { posts: Array.from({ length: PIEZAS_POR_TANDA }, () => ({})), modo: "lote" },
      fingirModelo(llamadas)
    );
    expect(llamadas).toHaveLength(1);
  });

  it("no parte un carrusel, aunque tenga más piezas que la tanda", async () => {
    // Los tramos acentuados leídos en orden forman una frase, y eso no
    // sobrevive a dos llamadas que no se ven entre sí.
    const llamadas = [];
    await enTandas(
      { posts: Array.from({ length: 10 }, () => ({})), modo: "carrusel" },
      fingirModelo(llamadas)
    );
    expect(llamadas).toEqual([10]);
  });

  it("avisa del progreso para que la pantalla no parezca colgada", async () => {
    const avisos = [];
    await enTandas(
      { posts: Array.from({ length: 9 }, () => ({})), modo: "lote" },
      fingirModelo(),
      (hechas, total) => avisos.push([hechas, total])
    );
    expect(avisos[0]).toEqual([0, 9]);
    expect(avisos.at(-1)).toEqual([9, 9]);
    expect(avisos.length).toBeGreaterThan(2);
  });

  it("conserva lo que devuelve el generador además del número", async () => {
    const [pieza] = await enTandas(
      { posts: [{}], modo: "lote" },
      async () => [{ n: 1, titular: ["HOLA"], promptFondo: "x" }]
    );
    expect(pieza.titular).toEqual(["HOLA"]);
    expect(pieza.promptFondo).toBe("x");
  });
});
