import { describe, it, expect } from "vitest";
import { aplicarLote, leerHora, MAL } from "./lote.js";

// Octubre de 2026: el 1 cae en jueves. Se cubren dos lunes para que un
// filtro por día no pueda pasar por casualidad al acertar una sola fila.
const cal = {
  days: [
    { date: "2026-10-01", posts: [{ id: "p1", format: "post", category: "venta", publishTime: "" }] },
    { date: "2026-10-05", posts: [{ id: "p2", format: "reel", category: "educativo", publishTime: "" }] },
    { date: "2026-10-08", posts: [{ id: "p3", format: "post", category: "venta", publishTime: "08:00" }] },
    { date: "2026-10-12", posts: [{ id: "p4", format: "post", category: "educativo", publishTime: "" }] },
  ],
};
const porId = (r, id) => r.dias.flatMap((d) => d.posts).find((p) => p.id === id);

describe("poner la misma hora a muchas publicaciones", () => {
  it("«las 9am a todos los lunes» alcanza los dos lunes y nada más", () => {
    const r = aplicarLote(cal, { filtro_dia: "lunes", aplicar_a_todas: { hora: "9am" } });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);              // 5 y 12 de octubre
    expect(porId(r, "p2").publishTime).toBe("09:00");
    expect(porId(r, "p4").publishTime).toBe("09:00");
    expect(porId(r, "p1").publishTime).toBe("");     // jueves, no se toca
    expect(porId(r, "p3").publishTime).toBe("08:00"); // jueves, conserva la suya
  });

  it("el filtro por formato y por categoría se aplican de verdad", () => {
    const soloReels = aplicarLote(cal, { filtro_formato: "reel", aplicar_a_todas: { hora: "18:00" } });
    expect(soloReels.count).toBe(1);
    expect(porId(soloReels, "p2").publishTime).toBe("18:00");

    const soloVenta = aplicarLote(cal, { filtro_categoria: "venta", aplicar_a_todas: { hora: "7pm" } });
    expect(soloVenta.count).toBe(2);
    expect(porId(soloVenta, "p1").publishTime).toBe("19:00");
    expect(porId(soloVenta, "p3").publishTime).toBe("19:00");
  });

  it("los filtros se acumulan, no se eligen", () => {
    const r = aplicarLote(cal, {
      filtro_formato: "post",
      filtro_categoria: "educativo",
      aplicar_a_todas: { hora: "10:00" },
    });
    expect(r.count).toBe(1);
    expect(porId(r, "p4").publishTime).toBe("10:00");
  });

  it("el filtro por semana usa la misma numeración que los conceptos semanales", () => {
    // La semana 1 arranca en el primer día del calendario, no en el lunes.
    const r = aplicarLote(cal, { filtro_semana: 1, aplicar_a_todas: { hora: "09:00" } });
    expect(r.count).toBe(2); // 1 y 5 de octubre
    expect(porId(r, "p1").publishTime).toBe("09:00");
    expect(porId(r, "p2").publishTime).toBe("09:00");
    expect(porId(r, "p3").publishTime).toBe("08:00");
  });
});

describe("las guardas", () => {
  it("«a todas» SIN filtro no hace nada: sería el mes entero", () => {
    const r = aplicarLote(cal, { aplicar_a_todas: { hora: "09:00" } });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/filtro/i);
  });

  it("una hora que no se entiende se rechaza en vez de guardarse", () => {
    const r = aplicarLote(cal, { filtro_dia: "lunes", aplicar_a_todas: { hora: "por la mañana" } });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/no entendí la hora/i);
  });

  it("un filtro que no alcanza a nadie lo dice, no responde que sí", () => {
    const r = aplicarLote(cal, { filtro_dia: "domingo", aplicar_a_todas: { hora: "09:00" } });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/ninguna publicación/i);
  });

  it("sin cambios ni valores comunes, no hay nada que hacer", () => {
    expect(aplicarLote(cal, {}).ok).toBe(false);
  });

  it("no muta el calendario que recibe", () => {
    const antes = JSON.stringify(cal);
    aplicarLote(cal, { filtro_dia: "lunes", aplicar_a_todas: { hora: "09:00" } });
    expect(JSON.stringify(cal)).toBe(antes);
  });
});

describe("los cambios por ID", () => {
  it("van por ID y el filtro NO los recorta", () => {
    // p1 es jueves; el filtro de lunes manda sobre «a todas», no sobre esto.
    const r = aplicarLote(cal, {
      filtro_dia: "lunes",
      cambios: [{ post_id: "p1", descripcion: "texto nuevo" }],
    });
    expect(r.ok).toBe(true);
    expect(porId(r, "p1").descripcion).toBe("texto nuevo");
  });

  it("cada publicación recibe lo suyo", () => {
    const r = aplicarLote(cal, {
      cambios: [
        { post_id: "p1", guion: "guion uno" },
        { post_id: "p2", guion: "guion dos", hora: "6pm" },
      ],
    });
    expect(r.count).toBe(2);
    expect(porId(r, "p1").guion).toBe("guion uno");
    expect(porId(r, "p2").guion).toBe("guion dos");
    expect(porId(r, "p2").publishTime).toBe("18:00");
  });

  it("lo explícito por ID gana sobre lo común", () => {
    const r = aplicarLote(cal, {
      filtro_dia: "lunes",
      aplicar_a_todas: { hora: "09:00" },
      cambios: [{ post_id: "p2", hora: "20:00" }],
    });
    expect(porId(r, "p2").publishTime).toBe("20:00"); // el suyo
    expect(porId(r, "p4").publishTime).toBe("09:00"); // el común
  });

  it("una publicación en las dos listas se cuenta una vez", () => {
    const r = aplicarLote(cal, {
      filtro_dia: "lunes",
      aplicar_a_todas: { hora: "09:00" },
      cambios: [{ post_id: "p2", idea: "otra" }],
    });
    expect(r.count).toBe(2);
  });
});

describe("quitar la hora es distinto de no tocarla", () => {
  it("«quitar» la deja vacía", () => {
    const r = aplicarLote(cal, { filtro_formato: "post", aplicar_a_todas: { hora: "quitar" } });
    expect(porId(r, "p3").publishTime).toBe("");
  });

  it("no mencionarla la conserva", () => {
    const r = aplicarLote(cal, { filtro_formato: "post", aplicar_a_todas: { categoria: "nueva" } });
    expect(porId(r, "p3").publishTime).toBe("08:00");
    expect(porId(r, "p3").category).toBe("nueva");
  });

  it("y leerHora distingue los tres casos", () => {
    expect(leerHora(undefined)).toBeUndefined();
    expect(leerHora("quitar")).toBe("");
    expect(leerHora("9am")).toBe("09:00");
    expect(leerHora("a media tarde")).toBe(MAL);
  });
});
