import { describe, it, expect } from "vitest";
import { apilarVersiones, verVersion, trasQuitarVersion, conVersiones } from "./estudio.js";
import { piezasDeGrupo } from "./galeriaPura.js";

// ============================================================
// Las VERSIONES de una pieza en la galería: escoger la principal, pasar de una a otra sin perder las demás, quitar una
// ============================================================

const a = (id, extra = {}) => ({ id, clave: `k-${id}`, creado: `2026-11-0${id.length}T00:00:00Z`, usadoEn: [], ajustes: {}, ...extra });

describe("las versiones de una pieza", () => {
  const original = a("o");
  const corregida = a("oc", { ajustes: { deArchivo: "o" } });
  const otra = a("occ", { ajustes: { deArchivo: "oc" } });
  it("se ve la más nueva salvo que alguien escoja otra con «Hacer la principal»", () => {
    expect(apilarVersiones([otra, corregida, original]).map((x) => x.id)).toEqual(["occ"]);
    const conPrincipal = [otra, corregida, { ...original, ajustes: { principalAt: "2026-11-09T00:00:00Z" } }];
    const [vista] = apilarVersiones(conPrincipal);
    expect(vista.id).toBe("o");
    expect(vista.anteriores.map((x) => x.id)).toEqual(["occ", "oc"]);
  });
  it("pasar de una versión a otra conserva las demás y cuál es la principal; quitar la que se ve deja las otras", () => {
    const [vista] = apilarVersiones([otra, corregida, original]);
    const v = verVersion(vista, corregida);
    expect(v.id).toBe("oc");
    expect(v.vistaId).toBe("occ");
    expect(v.anteriores.map((x) => x.id).sort()).toEqual(["o", "occ"]);
    const tras = trasQuitarVersion(v);
    expect(tras.id).toBe("occ");
    expect(tras.anteriores.map((x) => x.id)).toEqual(["o"]);
    // «Me gusta» desde el visor no pierde las versiones.
    expect(conVersiones(v, { ...corregida, favorito: true }).anteriores).toHaveLength(2);
  });
  it("en un carrusel o un reel sin orden, lo reemplazado por una versión no se repite", () => {
    const carpeta = { id: "c", tipo: "reel", orden: [] };
    const piezas = piezasDeGrupo(carpeta, [
      a("v1", { carpetaId: "c", tipo: "video", creado: "2026-11-01" }),
      a("v2", { carpetaId: "c", tipo: "video", creado: "2026-11-02", ajustes: { deArchivo: "v1" } }),
      a("f1", { carpetaId: "c", tipo: "imagen", creado: "2026-11-01" }),
    ]);
    expect(piezas.map((x) => x.id)).toEqual(["v2", "f1"]);
  });
});
