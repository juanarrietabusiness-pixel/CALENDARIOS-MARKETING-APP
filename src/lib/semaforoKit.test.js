import { describe, it, expect } from "vitest";
import { semaforoDelKit, resumenSemaforo, loCritico, avisoDeLaPieza, kitConMarca, MIN_GUSTOS } from "./semaforoKit.js";
import { idDePestana, idDelPanel, indicePorTecla } from "./pestanas.js";

// ============================================================
// El semáforo del kit (fase 7): qué le falta a un cliente para que el diseño salga bien, calculado con lo que YA
// devuelve GET /api/estudio y el estado del cerebro.
// ============================================================

const kitCompleto = {
  paleta: [{ hex: "#1B3246", nombre: "azul", rol: "texto" }], estilo: "limpio", logo: "clientes/c1/estudio/logo.png",
  plantillas: [{ id: "plantilla-1" }], locucion: { voz: "abc123" },
};
const gustos = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, tipo: "imagen", favorito: true }));
const estudioCompleto = {
  kit: kitCompleto, productos: [{ id: "p1", nombre: "Sofá", fotos: ["clientes/c1/x.jpg"] }], sinFotos: [], archivos: gustos(MIN_GUSTOS),
};
const porId = (puntos) => Object.fromEntries(puntos.map((p) => [p.id, p]));

describe("semaforoDelKit", () => {
  it("sin la galería leída, nada (no se pinta un semáforo a medias)", () => {
    expect(semaforoDelKit({})).toEqual([]);
  });

  it("todo en verde con el kit, el logo, las fotos, plantillas, «Me gusta», la ficha y la voz", () => {
    const puntos = semaforoDelKit({ estudio: estudioCompleto, cerebro: { conFicha: true, fichaVieja: null } });
    expect(puntos.map((p) => p.id)).toEqual(["kit", "logo", "fotos", "plantillas", "gustos", "ficha", "voz"]);
    expect(puntos.every((p) => p.estado === "verde")).toBe(true);
    expect(resumenSemaforo(puntos)).toMatchObject({ rojos: 0, ambar: 0, estado: "verde" });
  });

  it("sin logo ni kit: rojo, y el logo se arregla ahí mismo (subirlo)", () => {
    const p = porId(semaforoDelKit({ estudio: { ...estudioCompleto, kit: {} } }));
    expect(p.kit.estado).toBe("rojo");
    expect(p.kit.arreglo.ir).toEqual(["marca", "kit"]);
    expect(p.logo.estado).toBe("rojo");
    expect(p.logo.arreglo.accion).toBe("logo");
  });

  it("las fotos del catálogo: sin catálogo ámbar, ningún producto con fotos rojo, algunos sin fotos ámbar con sus nombres", () => {
    expect(porId(semaforoDelKit({ estudio: { ...estudioCompleto, productos: [], sinFotos: [] } })).fotos.estado).toBe("ambar");
    const ninguno = porId(semaforoDelKit({ estudio: { ...estudioCompleto, productos: [], sinFotos: [{ id: "p2", nombre: "Mesa" }] } })).fotos;
    expect(ninguno.estado).toBe("rojo");
    expect(ninguno.arreglo).toMatchObject({ ir: ["marca", "cerebro"], mercado: "catalogo" });
    const algunos = porId(semaforoDelKit({ estudio: { ...estudioCompleto, sinFotos: [{ id: "p2", nombre: "Mesa" }, { id: "p3", nombre: "Silla" }] } })).fotos;
    expect(algunos.estado).toBe("ambar");
    expect(algunos.texto).toContain("«Mesa» y «Silla»");
  });

  it("las imágenes de la marca que ya no están (perdidas) salen en rojo", () => {
    const p = porId(semaforoDelKit({ estudio: { ...estudioCompleto, perdidas: [{ clave: "x", que: "el logo" }] } }));
    expect(p.perdidas.estado).toBe("rojo");
  });

  it("«Me gusta»: hacen falta al menos tres", () => {
    expect(porId(semaforoDelKit({ estudio: { ...estudioCompleto, archivos: gustos(1) } })).gustos.estado).toBe("ambar");
    // Un «Me gusta» de un video no cuenta: el director mira imágenes.
    expect(porId(semaforoDelKit({ estudio: { ...estudioCompleto, archivos: [...gustos(2), { tipo: "video", favorito: true }] } })).gustos.estado).toBe("ambar");
  });

  it("la ficha técnica: sólo si se sabe el estado del cerebro; vieja ámbar, sin ficha rojo", () => {
    expect(porId(semaforoDelKit({ estudio: estudioCompleto })).ficha).toBeUndefined();
    expect(porId(semaforoDelKit({ estudio: estudioCompleto, cerebro: { conFicha: false } })).ficha.estado).toBe("rojo");
    expect(porId(semaforoDelKit({ estudio: estudioCompleto, cerebro: { conFicha: true, fichaVieja: { total: 1 } } })).ficha.estado).toBe("ambar");
  });

  it("sin voz fijada, ámbar", () => {
    expect(porId(semaforoDelKit({ estudio: { ...estudioCompleto, kit: { ...kitCompleto, locucion: {} } } })).voz.estado).toBe("ambar");
  });

  it("lo crítico (el aviso corto de Crear) son los rojos, sin la ficha", () => {
    const puntos = semaforoDelKit({ estudio: { ...estudioCompleto, kit: { ...kitCompleto, logo: "" } }, cerebro: { conFicha: false } });
    expect(loCritico(puntos).map((p) => p.id)).toEqual(["logo"]);
  });

  it("kitConMarca: una paleta, un estilo o una regla bastan", () => {
    expect(kitConMarca({})).toBe(false);
    expect(kitConMarca({ reglas: ["el logo abajo"] })).toBe(true);
    expect(kitConMarca(null)).toBe(false);
  });
});

describe("avisoDeLaPieza (pestaña Pieza del panel)", () => {
  it("nada si no falta nada", () => {
    expect(avisoDeLaPieza({ estudio: estudioCompleto, post: { productoId: "p1" } })).toEqual([]);
  });
  it("sin logo, lo dice", () => {
    expect(avisoDeLaPieza({ estudio: { ...estudioCompleto, kit: {} }, post: {} })[0]).toMatch(/no tiene logo/);
  });
  it("los productos que nombra y no tienen fotos (también los secundarios)", () => {
    const estudio = { ...estudioCompleto, sinFotos: [{ id: "p2", nombre: "Mesa" }, { id: "p3", nombre: "Silla" }] };
    expect(avisoDeLaPieza({ estudio, post: { productoId: "p1", productoIds: ["p1", "p2"] } })).toEqual(["«Mesa» no tiene fotos en el catálogo: el motor se imaginará cómo es."]);
    expect(avisoDeLaPieza({ estudio, post: { productoIds: ["p2", "p3"] } })[0]).toMatch(/no tienen fotos/);
    // Un producto que no nombra no importa.
    expect(avisoDeLaPieza({ estudio, post: { productoId: "p1" } })).toEqual([]);
  });
  it("sin la galería o sin publicación, nada", () => {
    expect(avisoDeLaPieza({ post: {} })).toEqual([]);
    expect(avisoDeLaPieza({ estudio: estudioCompleto })).toEqual([]);
  });
});

describe("las barras de pestañas", () => {
  it("la pestaña y su panel se nombran con el mismo prefijo", () => {
    expect(idDePestana("r1", "marca")).toBe("r1-tab-marca");
    expect(idDelPanel("r1")).toBe("r1-panel");
  });
  it("las flechas, Inicio y Fin mueven en círculo; lo demás no mueve", () => {
    expect(indicePorTecla(0, 5, "ArrowRight")).toBe(1);
    expect(indicePorTecla(4, 5, "ArrowRight")).toBe(0);
    expect(indicePorTecla(0, 5, "ArrowLeft")).toBe(4);
    expect(indicePorTecla(2, 5, "Home")).toBe(0);
    expect(indicePorTecla(2, 5, "End")).toBe(4);
    expect(indicePorTecla(2, 5, "Enter")).toBe(-1);
    expect(indicePorTecla(-1, 5, "ArrowRight"), "sin foco en ninguna, no se mueve nada").toBe(-1);
  });
});
