import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GLOSARIO, filtrarGlosario } from "./glosario";

const terminos = GLOSARIO.flatMap((g) => g.terminos);
const nombres = terminos.map((t) => t.termino);

describe("el glosario", () => {
  it("explica los nombres de la aplicación que la agencia pidió, sin repetir ninguno", () => {
    for (const n of [
      "Preparar el mes", "Muchas piezas de una vez", "Producción", "Diseñar", "Otra versión", "Corregir", "Recrear con mi marca",
      "Poner en una publicación", "Guardar referencia", "Cerebro", "Kit de marca", "Estudio de mercado", "Número mágico", "Va a pauta",
      "Primeros pasos",
    ]) expect(nombres, n).toContain(n);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const t of terminos) {
      expect(t.que.length, t.termino).toBeGreaterThan(20);
      expect(t.donde, t.termino).toBeTruthy();
    }
  });

  it("los nombres de los botones que dice son los que están en la pantalla", () => {
    // Si alguien renombra un botón y no el glosario, el glosario mentiría.
    const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), "utf8");
    expect(leer("components/CalendarView.jsx")).toContain("\"Preparar el mes\"");
    expect(leer("App.jsx")).toContain("Preparar el mes");
    expect(leer("components/EstudioMuchas.jsx")).toContain("Muchas piezas de una vez");
    expect(leer("components/NavPrincipal.jsx")).toContain("nombre: \"Producción\"");
  });

  it("se busca sin tildes ni mayúsculas, en el nombre o en lo que hace", () => {
    const de = (q) => filtrarGlosario(q).flatMap((g) => g.terminos.map((t) => t.termino));
    expect(de("numero magico")).toEqual(["Número mágico"]);
    expect(de("CEREBRO")).toContain("Cerebro");
    expect(de("ads manager")).toEqual(expect.arrayContaining(["Va a pauta", "Plan de campañas"]));
    expect(filtrarGlosario("")).toBe(GLOSARIO);
    expect(filtrarGlosario("zzzz")).toEqual([]);
  });
});
