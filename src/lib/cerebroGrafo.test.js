import { describe, it, expect } from "vitest";
import {
  armarGrafo, colorDeNota, esVisible, coincidencias, vecinas, etiquetasPara, regiones, resumenDelMapa, pocasConexiones,
  COLOR_TIPO, FILTROS_INICIALES,
} from "./cerebroGrafo";
import { TIPOS } from "../../worker/lib/cerebro/notas.js";
import { TIPOS_VISTA } from "./cerebroVista";

// ============================================================
// El mapa del cerebro: lo que decide qué se ve y cómo se explora
// ============================================================

const nota = (ruta, extra = {}) => ({
  id: `id-${ruta}`, ruta, titulo: ruta[0].toUpperCase() + ruta.slice(1), tipo: "marca", origen: "repositorio", fuente: "", grupo: "Manual",
  interna: false, caracteres: 100, resumen: "", actualizada: "2026-09-29T10:00:00.000Z", d: 0, ...extra,
});

/** ficha ↔ sofas, ficha ↔ comedores (enlaces) y sofas ~ garantia (mención). */
const respuesta = () => ({
  notas: [nota("ficha", { tipo: "ficha", d: 2, titulo: "Ficha técnica", grupo: "Ficha y cifras" }), nota("sofas", { d: 2, resumen: "Sofás seccionales de espuma" }),
    nota("comedores", { d: 1, tipo: "documento" }), nota("garantia", { d: 1, interna: true, titulo: "Garantía extendida", resumen: "Cinco años" })],
  enlaces: [[0, 1], [0, 2]],
  menciones: [[1, 3]],
});

describe("armarGrafo", () => {
  it("cada nota lleva su lugar en la lista (con él se conectan las líneas), su grupo y un texto para buscar", () => {
    const g = armarGrafo(respuesta());
    expect(g.nodos.map((n) => n.i)).toEqual([0, 1, 2, 3]);
    expect(g.nodos[0]).toMatchObject({ g: "Ficha y cifras", d: 2 });
    expect(g.nodos[3].buscable).toContain("garantia extendida");
    expect(g.nodos[3].buscable, "sin tildes").not.toMatch(/[áéíóú]/);
    expect(g.enlaces).toEqual([[0, 1], [0, 2]]);
    expect(g.menciones).toEqual([[1, 3]]);
  });

  it("descarta las conexiones que apuntan a una nota que no existe, a sí misma o a algo que no es un número", () => {
    const r = respuesta();
    r.enlaces.push([0, 99], [7, 1], [2, 2], ["a", 1], [null, 0], [1.5, 0]);
    expect(armarGrafo(r).enlaces).toEqual([[0, 1], [0, 2]]);
  });

  it("una respuesta rota o vacía da un mapa vacío, no un error", () => {
    for (const r of [undefined, null, {}, { notas: null }, { notas: [] }]) {
      expect(armarGrafo(r)).toEqual({ nodos: [], enlaces: [], menciones: [] });
    }
  });

  it("una nota sin grupo o con un grado que no es número no rompe nada", () => {
    const g = armarGrafo({ notas: [{ id: "a", ruta: "a", titulo: "A", tipo: "nota", d: "x" }], enlaces: [], menciones: [] });
    expect(g.nodos[0]).toMatchObject({ g: "Sin grupo", d: 0 });
  });
});

describe("los colores", () => {
  it("todo tipo que el servidor conoce tiene su color y su nombre; y no sobra ninguno", () => {
    expect(Object.keys(COLOR_TIPO).sort()).toEqual([...TIPOS].sort());
    for (const t of TIPOS) { expect(COLOR_TIPO[t]).toMatch(/^#[0-9A-F]{6}$/i); expect(TIPOS_VISTA[t].nombre).toBeTruthy(); }
  });

  it("dos tipos no comparten color: si no, la leyenda no distingue", () => {
    expect(new Set(Object.values(COLOR_TIPO)).size).toBe(Object.keys(COLOR_TIPO).length);
  });

  it("un tipo desconocido pinta como una nota", () => {
    expect(colorDeNota({ tipo: "inventado" })).toBe(COLOR_TIPO.nota);
    expect(colorDeNota(undefined)).toBe(COLOR_TIPO.nota);
    expect(colorDeNota({ tipo: "ficha" })).toBe(COLOR_TIPO.ficha);
  });
});

describe("qué se ve", () => {
  const g = armarGrafo(respuesta());

  it("sin filtros se ve todo", () => {
    expect(g.nodos.every((n) => esVisible(n, FILTROS_INICIALES))).toBe(true);
    expect(g.nodos.every((n) => esVisible(n))).toBe(true);
  });

  it("una región apagada esconde sus notas", () => {
    const f = { ...FILTROS_INICIALES, tiposOcultos: new Set(["documento"]) };
    expect(g.nodos.filter((n) => esVisible(n, f)).map((n) => n.ruta)).toEqual(["ficha", "sofas", "garantia"]);
  });

  it("«sólo internas» deja las que llevan el candado", () => {
    expect(g.nodos.filter((n) => esVisible(n, { ...FILTROS_INICIALES, soloInternas: true })).map((n) => n.ruta)).toEqual(["garantia"]);
  });

  it("las dos cosas juntas se suman", () => {
    const f = { tiposOcultos: new Set(["marca"]), soloInternas: true, menciones: true };
    expect(g.nodos.filter((n) => esVisible(n, f))).toEqual([]);
  });
});

describe("buscar en el mapa", () => {
  const g = armarGrafo(respuesta());

  it("sin nada escrito no hay nada que resaltar (null, que no es lo mismo que «nada coincide»)", () => {
    expect(coincidencias(g.nodos, "")).toBeNull();
    expect(coincidencias(g.nodos, "   ")).toBeNull();
    expect(coincidencias(g.nodos, "zzz")).toEqual(new Set());
  });

  it("sin importar tildes ni mayúsculas, en el título, el resumen, la ruta o el grupo", () => {
    expect([...coincidencias(g.nodos, "GARANTIA")]).toEqual([3]);
    expect([...coincidencias(g.nodos, "sofás")]).toEqual([1]);
    expect([...coincidencias(g.nodos, "espuma")]).toEqual([1]);
    expect([...coincidencias(g.nodos, "ficha y cifras")]).toEqual([0]);
  });

  it("todas las palabras tienen que estar, en cualquier orden", () => {
    expect([...coincidencias(g.nodos, "extendida garantía")]).toEqual([3]);
    expect([...coincidencias(g.nodos, "extendida sofas")]).toEqual([]);
  });

  it("lo que encontró la búsqueda por pasajes se suma, aunque el título no diga nada", () => {
    expect([...coincidencias(g.nodos, "garantía", new Set([2]))].sort()).toEqual([2, 3]);
    expect([...coincidencias(g.nodos, "", new Set([2]))]).toEqual([2]);
  });
});

describe("las vecinas de una nota", () => {
  const g = armarGrafo(respuesta());

  it("primero las enlazadas, luego las mencionadas, y de cada clase las más conectadas antes", () => {
    const v = vecinas(g, 1);
    expect(v.map((x) => [x.nota.ruta, x.clase])).toEqual([["ficha", "enlace"], ["garantia", "mencion"]]);
    expect(vecinas(g, 0).map((x) => x.nota.ruta)).toEqual(["sofas", "comedores"]);
  });

  it("una nota aislada no tiene vecinas; y una que está enlazada Y mencionada cuenta una vez", () => {
    expect(vecinas({ nodos: g.nodos, enlaces: [], menciones: [] }, 0)).toEqual([]);
    const dup = { nodos: g.nodos, enlaces: [[0, 1]], menciones: [[1, 0]] };
    expect(vecinas(dup, 0)).toHaveLength(1);
    expect(vecinas(dup, 0)[0].clase).toBe("enlace");
  });
});

describe("a qué notas ponerles el nombre encima", () => {
  const g = armarGrafo(respuesta());

  it("la elegida primero, luego sus vecinas, las que coinciden y los centros", () => {
    const l = etiquetasPara(g, { elegida: g.nodos[1], coinciden: new Set([2]), centros: 1 });
    expect(l.map((n) => n.ruta)).toEqual(["sofas", "ficha", "garantia", "comedores"]);
  });

  it("sin elegir ni buscar, los centros del cerebro", () => {
    expect(etiquetasPara(g, { centros: 2 }).map((n) => n.ruta)).toEqual(["ficha", "sofas"]);
  });

  it("nadie se repite y hay un tope", () => {
    const l = etiquetasPara(g, { elegida: g.nodos[0], coinciden: new Set([0, 1, 2, 3]), centros: 4 });
    expect(new Set(l.map((n) => n.i)).size).toBe(l.length);
    expect(etiquetasPara(g, { centros: 4, max: 2 })).toHaveLength(2);
  });
});

describe("la leyenda y las cifras", () => {
  const g = armarGrafo(respuesta());

  it("las regiones salen en el orden de la leyenda, con su color y cuántas hay", () => {
    expect(regiones(g.nodos)).toEqual([
      { tipo: "ficha", nombre: "Ficha técnica", color: COLOR_TIPO.ficha, n: 1 },
      { tipo: "marca", nombre: "Marca", color: COLOR_TIPO.marca, n: 2 },
      { tipo: "documento", nombre: "Documento", color: COLOR_TIPO.documento, n: 1 },
    ]);
  });

  it("la línea de cifras usa el singular cuando toca", () => {
    expect(resumenDelMapa(g)).toBe("4 notas · 2 enlaces · 1 mención");
    expect(resumenDelMapa({ nodos: [1], enlaces: [], menciones: [1, 2] })).toBe("1 nota · 0 enlaces · 2 menciones");
  });

  it("avisa cuando hay tan pocas conexiones que el mapa parece una lista", () => {
    const suelta = { nodos: Array.from({ length: 12 }, (_, i) => nota(`n${i}`)).map((n, i) => ({ ...n, i })), enlaces: [[0, 1]], menciones: [] };
    expect(pocasConexiones(suelta)).toBe(true);
    expect(pocasConexiones({ ...suelta, enlaces: Array.from({ length: 6 }, (_, i) => [i, i + 1]) })).toBe(false);
    expect(pocasConexiones(g), "con cuatro notas no hay de qué avisar").toBe(false);
    expect(pocasConexiones({ nodos: [], enlaces: [], menciones: [] })).toBe(false);
  });
});
