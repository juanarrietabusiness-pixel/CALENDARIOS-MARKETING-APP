import { describe, it, expect } from "vitest";
import { bloques, trozos } from "./markdownSimple";

describe("markdownSimple", () => {
  it("parte una nota en títulos, listas, tablas y párrafos", () => {
    const b = bloques("## 6. Proceso\n\n1. **Contacto** por WhatsApp.\n2. Cotización.\n\n| Código | Nombre |\n|---|---|\n| EG-01 | Pala |\n\nTexto\nseguido\n---\n> cita");
    expect(b.map((x) => x.tipo)).toEqual(["titulo", "lista", "tabla", "parrafo", "linea", "cita"]);
    expect(b[1]).toMatchObject({ ordenada: true, items: ["**Contacto** por WhatsApp.", "Cotización."] });
    expect(b[2]).toMatchObject({ cabecera: ["Código", "Nombre"], filas: [["EG-01", "Pala"]] });
    expect(b[3].texto).toBe("Texto seguido");
  });

  it("reconoce negrita, código, enlaces a notas y enlaces web; un enlace relativo queda como texto", () => {
    const t = trozos("**Ojo** `x` [[datos-del-negocio]] [Instagram](https://instagram.com/rofer) [flota](05_flota.md) *nota*");
    expect(t.filter((x) => x.t !== "texto")).toEqual([
      { t: "negrita", v: "Ojo" }, { t: "codigo", v: "x" }, { t: "nota", v: "datos-del-negocio" },
      { t: "enlace", v: "Instagram", url: "https://instagram.com/rofer" }, { t: "cursiva", v: "nota" },
    ]);
    expect(t.some((x) => x.t === "texto" && x.v === "flota")).toBe(true);
  });

  it("no convierte un javascript: en enlace", () => {
    expect(trozos("[mal](javascript:alert(1))").some((x) => x.t === "enlace")).toBe(false);
  });
});
