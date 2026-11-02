import { describe, it, expect } from "vitest";
import { CONCEPTOS_PORTADA, avisosDeTitular, titularInicial, escenaDePortada, MAX_PALABRAS_PORTADA } from "./portadaClic";
import { rejillaDeHoja, leerSerie, MAX_PIEZAS_SERIE } from "./piezasJuntas";
import { leerRevisionVideo, veredictoVideo, CRITERIOS_VIDEO } from "./revisionVideo";

// ============================================================
// Lo puro de la fase 2: la portada (16 conceptos, el titular que se lee a 120 px), la hoja de «Las piezas juntas» y
// el veredicto de «¿Está listo este video?» (lo pone el código, no la IA).
// ============================================================

describe("Portada que da clic", () => {
  it("son 16 conceptos con ids y nombres distintos", () => {
    expect(CONCEPTOS_PORTADA).toHaveLength(16);
    expect(new Set(CONCEPTOS_PORTADA.map((c) => c.id)).size).toBe(16);
    expect(new Set(CONCEPTOS_PORTADA.map((c) => c.nombre)).size).toBe(16);
  });

  it("el titular largo avisa; el corto no", () => {
    expect(avisosDeTitular("Sofá como nuevo")).toEqual([]);
    expect(avisosDeTitular("Tu sofá queda como nuevo en cuatro horas")[0]).toMatch(/palabras/);
    expect(avisosDeTitular("")[0]).toMatch(/Escribe/);
  });

  it("el titular de partida sale del texto de la pieza, cortado a lo que cabe", () => {
    const t = titularInicial({ textoPieza: "Tu sofá como nuevo en 4 horas. Desde $45" });
    expect(t.split(" ").length).toBeLessThanOrEqual(MAX_PALABRAS_PORTADA);
    expect(t).toBe("Tu sofá como nuevo");
  });

  it("la escena dice el concepto, el tamaño del titular y la zona segura de cada formato", () => {
    const reel = escenaDePortada({ concepto: "numero", formato: "reel" });
    expect(reel).toContain("«El número grande»");
    expect(reel).toContain("120 px");
    expect(reel).toContain("ventana 3:4");
    expect(escenaDePortada({ concepto: "numero", formato: "youtube" })).toContain("esquina inferior derecha");
    for (const c of CONCEPTOS_PORTADA) expect(escenaDePortada({ concepto: c.id }).length).toBeLessThan(1200);
  });
});

describe("Las piezas juntas", () => {
  it("la rejilla de la hoja no pasa de 4 columnas", () => {
    expect(rejillaDeHoja(2)).toEqual({ columnas: 2, filas: 1 });
    expect(rejillaDeHoja(6)).toEqual({ columnas: 3, filas: 2 });
    expect(rejillaDeHoja(24)).toEqual({ columnas: 4, filas: 6 });
    expect(rejillaDeHoja(99)).toEqual(rejillaDeHoja(MAX_PIEZAS_SERIE));
  });

  it("sólo vuelven números de la hoja, sin repetir y sin motivo vacío", () => {
    const r = leerSerie('Aquí: {"puntaje":12,"fuera":[{"n":2,"motivo":"Otra letra"},{"n":2,"motivo":"repetido"},{"n":0,"motivo":"x"},{"n":5,"motivo":""}]}', 4);
    expect(r.puntaje).toBe(10);
    expect(r.fuera).toEqual([{ n: 2, motivo: "Otra letra", arreglo: "" }]);
    expect(leerSerie("sin json")).toBeNull();
  });
});

describe("¿Está listo este video?", () => {
  it("lee todos los criterios aunque la IA se salte alguno (null = sin saber)", () => {
    const r = leerRevisionVideo('{"puntaje":9,"criterios":{"gancho":{"ok":true,"nota":"bien"}},"arreglos":[]}');
    expect(r.criterios).toHaveLength(CRITERIOS_VIDEO.length);
    expect(r.criterios.find((c) => c.id === "cierre").ok).toBeNull();
    expect(r.veredicto).toBe("listo");
  });

  it("un no grave manda sobre el puntaje", () => {
    const criterios = CRITERIOS_VIDEO.map((c) => ({ id: c.id, ok: c.id === "voz" ? false : true }));
    expect(veredictoVideo({ puntaje: 10, criterios })).toBe("no");
    expect(veredictoVideo({ puntaje: 7, criterios: [{ id: "cierre", ok: false }] })).toBe("casi");
    expect(veredictoVideo({ puntaje: 4, criterios: [] })).toBe("no");
  });
});
