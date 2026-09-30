import { describe, it, expect } from "vitest";
import { filtrarArchivos, contarFiltros, trabajosVisibles, fraseDeTrabajo, hace, textoPapelera, nombreDeDescarga } from "./estudio.js";

const A = (o) => ({ id: "a", prompt: "una taza", modelo: "nano-banana", favorito: false, subido: false, carpetaId: null, ...o });

describe("filtrar la galería", () => {
  const lista = [
    A({ id: "1", prompt: "Taza de café", favorito: true }),
    A({ id: "2", prompt: "Logo", subido: true, carpetaId: "f1" }),
    A({ id: "3", prompt: "Playa al atardecer", modelo: "prueba", carpetaId: "f1" }),
  ];
  it("por favoritas, subidas, carpeta y sin carpeta", () => {
    expect(filtrarArchivos(lista, { filtro: "favoritas" }).map((a) => a.id)).toEqual(["1"]);
    expect(filtrarArchivos(lista, { filtro: "subidas" }).map((a) => a.id)).toEqual(["2"]);
    expect(filtrarArchivos(lista, { filtro: "f1" }).map((a) => a.id)).toEqual(["2", "3"]);
    expect(filtrarArchivos(lista, { filtro: "sin-carpeta" }).map((a) => a.id)).toEqual(["1"]);
    expect(filtrarArchivos(lista, { filtro: "todas" })).toHaveLength(3);
  });
  it("por texto, en el prompt y en el modelo, sin importar mayúsculas", () => {
    expect(filtrarArchivos(lista, { texto: "CAFÉ" }).map((a) => a.id)).toEqual(["1"]);
    expect(filtrarArchivos(lista, { texto: "prueba" }).map((a) => a.id)).toEqual(["3"]);
    expect(filtrarArchivos(lista, { texto: "  " })).toHaveLength(3);
  });
  it("cuenta cada filtro", () => {
    expect(contarFiltros(lista, [{ id: "f1" }, { id: "f2" }])).toEqual({ todas: 3, favoritas: 1, subidas: 1, "sin-carpeta": 1, f1: 2, f2: 0 });
  });
});

describe("qué trabajos se enseñan arriba", () => {
  const ahora = Date.parse("2026-10-01T12:00:00Z");
  const T = (o) => ({ id: "t", estado: "hecho", nota: "", creado: "2026-10-01T11:50:00Z", actualizado: "2026-10-01T11:55:00Z", ...o });
  it("los vivos siempre", () => {
    expect(trabajosVisibles([T({ estado: "en_cola" }), T({ id: "u", estado: "en_marcha" })], { ahora })).toHaveLength(2);
  });
  it("lo que falló o se canceló en la última hora, hasta que se descarta", () => {
    const f = T({ id: "f", estado: "fallido" });
    expect(trabajosVisibles([f], { ahora })).toHaveLength(1);
    expect(trabajosVisibles([f], { ahora, descartados: new Set(["f"]) })).toHaveLength(0);
    expect(trabajosVisibles([T({ estado: "fallido", actualizado: "2026-10-01T09:00:00Z" })], { ahora })).toHaveLength(0);
  });
  it("lo terminado bien no, salvo que llegara menos de lo pedido", () => {
    expect(trabajosVisibles([T()], { ahora })).toHaveLength(0);
    expect(trabajosVisibles([T({ nota: "Llegaron 1 de 3: …", terminado: "2026-10-01T11:58:00Z" })], { ahora })).toHaveLength(1);
  });
});

describe("las frases", () => {
  it("dice por dónde va", () => {
    expect(fraseDeTrabajo({ estado: "en_cola", n: 1, archivos: [] })).toBe("En cola…");
    expect(fraseDeTrabajo({ estado: "en_marcha", n: 3, archivos: ["a"] })).toBe("Creando la 2 de 3…");
    expect(fraseDeTrabajo({ estado: "en_marcha", n: 1, archivos: [] })).toBe("Creando la imagen…");
    expect(fraseDeTrabajo({ estado: "fallido", error: "Sin saldo." })).toBe("Sin saldo.");
    expect(fraseDeTrabajo({ estado: "cancelado", n: 3, archivos: ["a"] })).toBe("Cancelado. Llegaron 1 de 3.");
  });
  it("hace cuánto", () => {
    const ahora = Date.parse("2026-10-01T12:00:00Z");
    expect(hace("2026-10-01T11:59:50Z", ahora)).toBe("ahora");
    expect(hace("2026-10-01T11:55:00Z", ahora)).toBe("hace 5 min");
    expect(hace("2026-10-01T09:00:00Z", ahora)).toBe("hace 3 h");
    expect(hace("2026-09-30T09:00:00Z", ahora)).toBe("ayer");
    expect(hace("nada", ahora)).toBe("");
  });
  it("cuánto queda en la papelera", () => {
    const ahora = Date.parse("2026-10-01T12:00:00Z");
    expect(textoPapelera("2026-09-01T12:00:00Z", ahora)).toBe("Se borra hoy");
    expect(textoPapelera("2026-09-02T12:00:00Z", ahora)).toBe("Se borra mañana");
    expect(textoPapelera("2026-09-21T12:00:00Z", ahora)).toBe("Se borra en 20 días");
  });
  it("el nombre de descarga sale del prompt", () => {
    expect(nombreDeDescarga({ prompt: "Una taza de café ☕!", mime: "image/png" })).toBe("una-taza-de-cafe.png");
    expect(nombreDeDescarga({ prompt: "", mime: "image/jpeg" })).toBe("imagen.jpg");
  });
});
