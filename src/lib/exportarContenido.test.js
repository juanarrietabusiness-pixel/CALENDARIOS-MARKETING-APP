import { describe, it, expect } from "vitest";
import { construirExportacion, hashtagsDe, fechaLarga } from "./exportarContenido";

// ============================================================
// La regla que define este exportador: o sale la ficha entera, o no sale.
// El exportador anterior sacaba la idea suelta y el prompt de imagen, y
// lo que llegaba al sitio de diseño no se podía producir.
// ============================================================

const ahora = new Date("2026-08-26T12:00:00");

function dia(campos = {}) {
  return {
    date: "2026-08-04",
    dayName: "Martes",
    category: "Producto estrella",
    posts: [],
    ...campos,
  };
}

function publicacion(campos = {}) {
  return {
    id: "p1",
    format: "post",
    idea: "Enseñar el juego de sábanas nuevo",
    descripcion: "Llegaron las sábanas 🛏️ Escríbenos al WhatsApp. #DCasa #Panama",
    publishTime: "18:00",
    ...campos,
  };
}

describe("hashtagsDe", () => {
  it("prefiere el campo suelto cuando existe", () => {
    expect(hashtagsDe({ hashtagsFinales: "#Uno #Dos", descripcion: "texto #Tres" }))
      .toBe("#Uno #Dos");
  });

  // El prompt de generación los pide DENTRO del caption, así que
  // `hashtagsFinales` está vacío en casi todas las publicaciones reales.
  // Si sólo se mirara ese campo, no se exportaría ni una.
  it("los recoge del caption cuando el campo suelto está vacío", () => {
    expect(hashtagsDe({ descripcion: "Llegaron 🛏️ #DCasa #Panamá #HogarPTY" }))
      .toBe("#DCasa #Panamá #HogarPTY");
  });

  it("no repite un hashtag que aparece dos veces", () => {
    expect(hashtagsDe({ descripcion: "#DCasa habla de #DCasa" })).toBe("#DCasa");
  });

  it("lee el campo heredado `script` si no hay descripción", () => {
    expect(hashtagsDe({ script: "caption viejo #Panama" })).toBe("#Panama");
  });

  it("devuelve cadena vacía cuando no hay ninguno", () => {
    expect(hashtagsDe({ descripcion: "Sin etiquetas" })).toBe("");
  });
});

describe("fechaLarga", () => {
  // El día 4 escrito en UTC y devuelto en Panamá es el día 3. Por eso la
  // fecha se parte como cadena y no se pasa por Date.
  it("no desplaza el día", () => {
    expect(fechaLarga({ date: "2026-08-04", dayName: "Martes" }))
      .toBe("Martes 4 de agosto de 2026");
  });

  it("funciona sin nombre de día", () => {
    expect(fechaLarga({ date: "2026-01-31" })).toBe("31 de enero de 2026");
  });
});

describe("construirExportacion", () => {
  it("exporta la ficha completa: formato, fecha, hora, idea, descripción y hashtags", () => {
    const { texto, completas } = construirExportacion({
      days: [dia({ posts: [publicacion()] })],
      formatos: ["post", "carrusel"],
      cliente: "D'CASA Panamá",
      calendario: "Agosto 2026",
      ahora,
    });

    expect(completas).toBe(1);
    expect(texto).toContain("CONTENIDO DEL CALENDARIO — D'CASA Panamá");
    expect(texto).toContain("1 · POST");
    expect(texto).toContain("FECHA: Martes 4 de agosto de 2026");
    expect(texto).toContain("HORA: 18:00");
    expect(texto).toContain("CATEGORÍA: Producto estrella");
    expect(texto).toContain("Enseñar el juego de sábanas nuevo");
    expect(texto).toContain("DESCRIPCIÓN:");
    expect(texto).toContain("HASHTAGS:\n#DCasa #Panama");
  });

  // La condición del encargo: nada de ideas sueltas.
  it("deja fuera la publicación sin descripción y dice qué le falta", () => {
    const { texto, completas, incompletas } = construirExportacion({
      days: [dia({ posts: [publicacion({ id: "p2", descripcion: "" })] })],
      formatos: ["post"],
      ahora,
    });

    expect(completas).toBe(0);
    expect(texto).toBe("");
    expect(incompletas).toHaveLength(1);
    expect(incompletas[0].falta).toEqual(["descripción", "hashtags"]);
  });

  it("deja fuera la publicación sin idea aunque tenga caption", () => {
    const { completas, incompletas } = construirExportacion({
      days: [dia({ posts: [publicacion({ idea: "   " })] })],
      formatos: ["post"],
      ahora,
    });

    expect(completas).toBe(0);
    expect(incompletas[0].falta).toEqual(["idea"]);
  });

  it("deja fuera la que tiene caption pero ningún hashtag", () => {
    const { completas, incompletas } = construirExportacion({
      days: [dia({ posts: [publicacion({ descripcion: "Caption sin etiquetas" })] })],
      formatos: ["post"],
      ahora,
    });

    expect(completas).toBe(0);
    expect(incompletas[0].falta).toEqual(["hashtags"]);
  });

  it("respeta el filtro de formatos", () => {
    const dias = [dia({
      posts: [
        publicacion({ id: "a", format: "post" }),
        publicacion({ id: "b", format: "reel" }),
        publicacion({ id: "c", format: "carrusel" }),
      ],
    })];

    const soloDiseno = construirExportacion({ days: dias, formatos: ["post", "carrusel"], ahora });
    expect(soloDiseno.completas).toBe(2);
    expect(soloDiseno.texto).toContain("POST");
    expect(soloDiseno.texto).toContain("CARRUSEL");
    expect(soloDiseno.texto).not.toContain("REEL");
    // Un formato que no entra en el filtro no cuenta como incompleto: no
    // se pidió, así que no falta nada.
    expect(soloDiseno.incompletas).toHaveLength(0);
  });

  it("numera las publicaciones en el orden del calendario", () => {
    const { texto } = construirExportacion({
      days: [
        dia({ date: "2026-08-04", posts: [publicacion({ id: "a" })] }),
        dia({ date: "2026-08-05", dayName: "Miércoles", posts: [publicacion({ id: "b" })] }),
      ],
      formatos: ["post"],
      ahora,
    });

    expect(texto.indexOf("1 · POST")).toBeLessThan(texto.indexOf("2 · POST"));
    expect(texto).toContain("Miércoles 5 de agosto de 2026");
  });

  it("dice «sin hora asignada» en vez de dejar el campo en blanco", () => {
    const { texto } = construirExportacion({
      days: [dia({ posts: [publicacion({ publishTime: "" })] })],
      formatos: ["post"],
      ahora,
    });
    expect(texto).toContain("HORA: sin hora asignada");
  });

  it("acepta el campo heredado `script` como descripción", () => {
    const { completas } = construirExportacion({
      days: [dia({ posts: [publicacion({ descripcion: "", script: "caption antiguo #Panama" })] })],
      formatos: ["post"],
      ahora,
    });
    expect(completas).toBe(1);
  });

  it("devuelve texto vacío sin publicaciones", () => {
    const { texto, completas } = construirExportacion({ days: [], formatos: ["post"], ahora });
    expect(texto).toBe("");
    expect(completas).toBe(0);
  });
});
