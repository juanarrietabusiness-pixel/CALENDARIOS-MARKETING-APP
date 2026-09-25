import { describe, it, expect } from "vitest";
import { usuarioInstagram, cifrasPerfil, limpiarAnalisis, extraerJSON, LIMITES_PERFIL } from "./auditoria.js";

describe("la auditoría de un perfil", () => {
  it("el usuario sale de @, de un enlace o de lo escrito a mano", () => {
    expect(usuarioInstagram("@Baby.Caleb ")).toBe("baby.caleb");
    expect(usuarioInstagram("https://www.instagram.com/cafe_luna/?hl=es")).toBe("cafe_luna");
    expect(usuarioInstagram("no vale con espacios")).toBeNull();
    expect(usuarioInstagram("")).toBeNull();
  });

  it("las cifras: interacción media, en % de seguidores, ritmo y días sin publicar", () => {
    const ahora = Date.parse("2026-10-01T12:00:00Z");
    const medios = [
      { meGusta: 90, comentarios: 10, fecha: "2026-09-29T12:00:00Z", formato: "reel" },
      { meGusta: 40, comentarios: 0, fecha: "2026-09-20T12:00:00Z", formato: "imagen" },
      { meGusta: 60, comentarios: 0, fecha: "2026-08-01T12:00:00Z", formato: "reel" },
    ];
    const c = cifrasPerfil({ seguidores: 2000, medios }, ahora);
    expect(c.interaccionMedia).toBe(67);
    expect(c.tasaInteraccion).toBe(3.3);
    expect(c.porSemana).toBe(0.5);
    expect(c.diasSinPublicar).toBe(2);
    expect(c.formatos).toEqual({ reel: 2, imagen: 1 });
  });

  it("sin publicaciones, sin cifras inventadas", () => {
    expect(cifrasPerfil({ seguidores: 10 })).toMatchObject({ interaccionMedia: null, tasaInteraccion: null, porSemana: null, diasSinPublicar: null });
  });

  it("lo que devuelve la IA se ciñe a los límites de Instagram", () => {
    const a = limpiarAnalisis({
      puntuacion: 140,
      nombre: { estado: "mal", propuesta: "x".repeat(90) },
      bio: { opciones: ["Corta y buena", "y".repeat(151), "Otra buena"] },
      destacados: { propuesta: [{ titulo: "Preguntas frecuentes", contenido: "…" }, { titulo: "" }] },
      rejilla: { estado: "raro", recomendaciones: ["a", "b"] },
    });
    expect(a.puntuacion).toBe(100);
    expect(a.nombre.propuesta).toHaveLength(LIMITES_PERFIL.nombre);
    expect(a.bio.opciones).toEqual(["Corta y buena", "Otra buena"]);
    expect(a.destacados.propuesta).toEqual([{ titulo: "Preguntas frecu", contenido: "…" }]);
    expect(a.rejilla).toEqual({ estado: "mejorable", comentario: "", recomendaciones: ["a", "b"] });
  });

  it("encuentra el JSON aunque venga con texto alrededor", () => {
    expect(extraerJSON('Aquí va:\n{"puntuacion": 70}\nListo.')).toEqual({ puntuacion: 70 });
    expect(extraerJSON("nada")).toBeNull();
  });
});
