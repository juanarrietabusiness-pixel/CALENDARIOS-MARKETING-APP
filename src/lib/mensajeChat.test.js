import { describe, it, expect } from "vitest";
import { partirMensaje, marcarImagen, marcarContexto, claveImagenValida } from "./mensajeChat";

describe("partirMensaje", () => {
  it("un texto sin marcas es un solo bloque", () => {
    expect(partirMensaje("Hola, ¿qué tal?")).toEqual([{ tipo: "texto", texto: "Hola, ¿qué tal?" }]);
  });

  it("cuatro descripciones salen como cuatro piezas, con el texto de alrededor aparte", () => {
    const msg = [
      "Aquí tienes las cuatro:",
      ...[1, 2, 3, 4].map((n) => `[[pieza: Descripción ${n}]]\nTexto ${n}\n[[/pieza]]`),
      "¿Ajusto el tono?",
    ].join("\n\n");
    const b = partirMensaje(msg);
    expect(b.map((x) => x.tipo)).toEqual(["texto", "pieza", "pieza", "pieza", "pieza", "texto"]);
    expect(b[1]).toEqual({ tipo: "pieza", titulo: "Descripción 1", texto: "Texto 1" });
    expect(b[5].texto).toBe("¿Ajusto el tono?");
  });

  it("una pieza sin cerrar llega hasta la siguiente, sin comerse el texto", () => {
    const b = partirMensaje("[[pieza: A]]uno[[pieza: B]]dos");
    expect(b).toEqual([
      { tipo: "pieza", titulo: "A", texto: "uno" },
      { tipo: "pieza", titulo: "B", texto: "dos" },
    ]);
  });

  it("un cierre suelto se ignora y el texto sigue", () => {
    expect(partirMensaje("hola [[/pieza]] adiós")).toEqual([{ tipo: "texto", texto: "hola [[/pieza]] adiós" }]);
  });

  it("la pieza sin título tiene título vacío, no undefined", () => {
    expect(partirMensaje("[[pieza]]x[[/pieza]]")[0].titulo).toBe("");
  });

  it("lee la imagen con su formato", () => {
    const b = partirMensaje(`Lista:\n${marcarImagen("clientes/abc/generadas/1.png", "vertical")}`);
    expect(b[1]).toEqual({ tipo: "imagen", clave: "clientes/abc/generadas/1.png", formato: "vertical" });
  });

  it("un formato desconocido cae a cuadrado", () => {
    expect(partirMensaje("[[imagen: clientes/a/b.png | gigante]]")[0].formato).toBe("square");
  });

  it("una clave fuera de clientes/ o con .. se queda como texto: no llega a un src", () => {
    for (const mala of ["[[imagen: https://evil.test/x.png]]", "[[imagen: clientes/a/../../x.png]]", "[[imagen: javascript:alert(1)]]"]) {
      expect(partirMensaje(mala)).toEqual([{ tipo: "texto", texto: mala }]);
    }
  });

  it("el contexto adjunto es su propio bloque", () => {
    const b = partirMensaje(`Hazme 3 guiones\n\n${marcarContexto("Análisis del video «a.mp4»", "Escena 1…")}`);
    expect(b).toEqual([
      { tipo: "texto", texto: "Hazme 3 guiones" },
      { tipo: "contexto", titulo: "Análisis del video «a.mp4»", texto: "Escena 1…" },
    ]);
  });

  it("no revienta con lo que no es texto", () => {
    expect(partirMensaje(undefined)).toEqual([]);
    expect(partirMensaje(null)).toEqual([]);
  });
});

describe("claveImagenValida", () => {
  it("acepta las claves que genera el servidor", () => {
    expect(claveImagenValida("clientes/9f1c-22/generadas/4b2a.png")).toBe(true);
  });
  it("rechaza lo demás", () => {
    expect(claveImagenValida("")).toBe(false);
    expect(claveImagenValida("otra/cosa.png")).toBe(false);
  });
});
