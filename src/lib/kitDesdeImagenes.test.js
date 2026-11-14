import { describe, it, expect } from "vitest";
import { pedidoDeKitDesdeImagenes, leerKitDesdeImagenes, fundirMoodboard, MIN_MOODBOARD, MAX_MOODBOARD } from "./kitDesdeImagenes";
import { limpiarKit } from "./kitMarca";

// ============================================================
// Preparar el kit desde un MOODBOARD
//
// Lo que importa:
//   1. La IA mira lo que las imágenes tienen en COMÚN y sólo propone lo visual.
//   2. Nada de nombres propios en las referencias de estilo.
//   3. Fundir no toca lo demás del kit (presets, logo, reglas, plantillas…), y una paleta vacía deja la de antes.
// ============================================================

const GUARDADO = {
  paleta: [{ hex: "#1B3246", nombre: "azul profundo", rol: "dominante" }],
  tipografia: "Montserrat",
  estilo: "limpio",
  luz: "natural",
  evitar: "fondos negros",
  logo: "clientes/c1/logo.png",
  presets: { anuncio: "Anuncio de la marca." },
  reglas: ["El logo siempre abajo"],
  plantillas: [{ id: "plantilla-a", nombre: "Portada", uso: "post", clave: "clientes/c1/a.png" }],
  anclas: ["minimalismo escandinavo"],
  preparadoAt: "2026-11-01T00:00:00.000Z",
};

describe("el pedido", () => {
  it("dice cuántas imágenes son, pide lo común y sólo lo visual, sin nombres propios ni contenido", () => {
    const p = pedidoDeKitDesdeImagenes({ marca: "Dcasa", rubro: "muebles", n: 4, actual: GUARDADO, ficha: "Rubro: muebles" });
    expect(p).toMatch(/Las 4 imágenes de arriba son el MOODBOARD de la marca Dcasa \(muebles\)/);
    expect(p).toMatch(/lo que tienen en COMÚN/);
    expect(p).toMatch(/nunca nombres de artistas, fotógrafos, personas ni marcas/);
    expect(p).toMatch(/no describas ninguna imagen en concreto/);
    expect(p).toContain("Paleta: azul profundo #1B3246 (dominante)");
    expect(p).toContain('"anclas":["…"]');
    expect(p).not.toMatch(/presets/);
    expect(MIN_MOODBOARD).toBe(3);
    expect(MAX_MOODBOARD).toBe(10);
  });
});

describe("la lectura", () => {
  it("sólo lo visual, sin las referencias que parecen una marca o una persona", () => {
    const r = leerKitDesdeImagenes(`Listo: ${JSON.stringify({
      estilo: "luminoso y sereno", luz: "lateral cálida", evitar: "colores saturados",
      paleta: [{ hex: "#f2ede4", nombre: "crema", rol: "fondo" }, { hex: "rojo" }],
      anclas: ["revista de diseño de interiores", "Kinfolk", "fotos de Annie Leibovitz"],
      presets: { anuncio: "no lo pide" }, dudas: "dos imágenes eran de noche",
    })}`);
    expect(r.kit).toEqual({
      estilo: "luminoso y sereno", luz: "lateral cálida", evitar: "colores saturados",
      paleta: [{ hex: "#F2EDE4", nombre: "crema", rol: "fondo" }],
      anclas: ["revista de diseño de interiores"],
    });
    expect(r.dudas).toBe("dos imágenes eran de noche");
    expect(leerKitDesdeImagenes("no hay json")).toBeNull();
    expect(leerKitDesdeImagenes("{}")).toBeNull();
  });
});

describe("fundir", () => {
  it("cambia sólo lo visual y conserva todo lo demás del kit", () => {
    const f = fundirMoodboard(GUARDADO, { estilo: "luminoso", luz: "lateral", evitar: "neón", paleta: [{ hex: "#F2EDE4", rol: "fondo" }], anclas: ["luz lateral de hora dorada"] });
    expect(f).toMatchObject({ estilo: "luminoso", luz: "lateral", evitar: "neón", anclas: ["luz lateral de hora dorada"] });
    expect(f.paleta.map((c) => c.hex)).toEqual(["#F2EDE4"]);
    const antes = limpiarKit(GUARDADO);
    for (const k of ["tipografia", "logo", "presets", "reglas", "plantillas", "preparadoAt"]) expect(f[k], k).toEqual(antes[k]);
  });

  it("lo que no trae (paleta vacía, sin referencias) se queda como estaba", () => {
    const f = fundirMoodboard(GUARDADO, { estilo: "luminoso", paleta: [], anclas: ["kodak portra"] });
    expect(f.paleta).toEqual(limpiarKit(GUARDADO).paleta);
    expect(f.anclas).toEqual(["minimalismo escandinavo"]);
    expect(f.luz).toBe("natural");
    // Un kit vacío recibe lo propuesto.
    expect(fundirMoodboard(null, { estilo: "luminoso" }).estilo).toBe("luminoso");
  });
});
