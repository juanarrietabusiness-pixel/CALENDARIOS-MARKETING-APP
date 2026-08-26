import { describe, it, expect } from "vitest";
import { completitud, camposDe, resumenCompletitud } from "./completitud";

// ============================================================
// La barra del chip resume esto en tres píxeles de alto. Si el cálculo se
// mueve sin querer, lo que se ve es una vista de mes que miente, y eso no
// salta en ninguna pantalla hasta que alguien publica algo a medias.
// ============================================================

function completo(campos = {}) {
  return {
    format: "post",
    title: "Sábanas nuevas",
    category: "Producto estrella",
    idea: "Enseñar el juego de sábanas nuevo",
    descripcion: "Llegaron 🛏️ Escríbenos. #DCasa #Panama",
    publishTime: "18:00",
    ...campos,
  };
}

describe("camposDe", () => {
  // Un post estático no lleva guion: pedírselo lo dejaría a cinco sextos
  // para siempre, y una barra que nunca llega al final no dice nada.
  it("no le pide guion a un post", () => {
    expect(camposDe({ format: "post" }).map((c) => c.clave)).not.toContain("guion");
  });

  it("se lo pide a reel, carrusel, historia y live", () => {
    for (const format of ["reel", "carrusel", "historia", "live"]) {
      expect(camposDe({ format }).map((c) => c.clave)).toContain("guion");
    }
  });

  it("son seis campos para un post y siete para un reel", () => {
    expect(camposDe({ format: "post" })).toHaveLength(6);
    expect(camposDe({ format: "reel" })).toHaveLength(7);
  });
});

describe("completitud", () => {
  it("un post con todo escrito está al 100 %", () => {
    const r = completitud(completo());
    expect(r.porcentaje).toBe(100);
    expect(r.faltan).toEqual([]);
    expect(r.hechos).toBe(6);
  });

  it("un reel con lo mismo pero sin guion no llega al 100 %", () => {
    const r = completitud(completo({ format: "reel" }));
    expect(r.faltan).toEqual(["guion"]);
    expect(r.hechos).toBe(6);
    expect(r.total).toBe(7);
  });

  it("una publicación vacía está a cero", () => {
    const r = completitud({ format: "post" });
    expect(r.porcentaje).toBe(0);
    expect(r.faltan).toEqual(["título", "categoría", "idea", "descripción", "hashtags", "hora"]);
  });

  // La categoría se define por día de la semana en el asistente, así que
  // vive en el día y no en la publicación. Contarla como ausente marcaba
  // como incompleto medio calendario que estaba bien.
  it("acepta la categoría heredada del día", () => {
    const r = completitud(completo({ category: "" }), { category: "Tips" });
    expect(r.faltan).toEqual([]);
  });

  it("acepta el campo heredado `script` como descripción", () => {
    const r = completitud(completo({ descripcion: "", script: "caption viejo #Panama" }));
    expect(r.faltan).toEqual([]);
  });

  // Los hashtags viven dentro del caption: es donde los escribe el modelo.
  it("cuenta los hashtags que están dentro de la descripción", () => {
    const r = completitud(completo({ descripcion: "Llegaron 🛏️ #DCasa" }));
    expect(r.faltan).toEqual([]);
  });

  it("los echa en falta cuando el caption no lleva ninguno", () => {
    const r = completitud(completo({ descripcion: "Llegaron las sábanas" }));
    expect(r.faltan).toEqual(["hashtags"]);
  });

  it("no da por escrito un campo con sólo espacios", () => {
    const r = completitud(completo({ title: "   " }));
    expect(r.faltan).toEqual(["título"]);
  });

  it("redondea el porcentaje", () => {
    // 5 de 6 son 83,33…
    expect(completitud(completo({ title: "" })).porcentaje).toBe(83);
  });
});

describe("resumenCompletitud", () => {
  it("enumera lo que falta en español", () => {
    const post = completo({ title: "", category: "", publishTime: "" });
    expect(resumenCompletitud(post)).toBe("3 de 6 campos — falta título, categoría y hora");
  });

  it("no mete una «y» cuando falta un solo campo", () => {
    expect(resumenCompletitud(completo({ publishTime: "" })))
      .toBe("5 de 6 campos — falta hora");
  });

  it("lo dice en una palabra cuando no falta nada", () => {
    expect(resumenCompletitud(completo())).toBe("Completa: 6 de 6 campos");
  });
});
