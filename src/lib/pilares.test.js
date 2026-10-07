import { describe, it, expect } from "vitest";
import {
  limpiarRitmo, RITMO_POR_DEFECTO, sugerenciasDeTemporada, ritmoDelMes, asignarMatriz, lineasDeContenido,
  nombreDePilar, presetDePilar, mezclaDeTipos, resumenRitmo, reglasDeLosTipos, MAX_CAMBIOS_POR_SEMANA, ordenDeProductos,
} from "./pilares";
import { fechasDelMes } from "./fechasEspeciales";

describe("el ritmo", () => {
  it("sin guardar es el de la agencia; lo guardado se limpia", () => {
    expect(limpiarRitmo(null)).toEqual({ ...RITMO_POR_DEFECTO });
    expect(limpiarRitmo({ 1: "educativo", 2: "inventado" })).toMatchObject({ 1: "educativo", 2: "", 3: "" });
    expect(resumenRitmo(null)).toBe("Lunes: Anuncio · Martes: Beneficios / Promociones · Miércoles: Servicios / Productos · Jueves: Educativo / Informativo · Viernes: Diferenciador · Sábado: 7 maletas");
  });

  it("el mes día a día, con los cambios aceptados", () => {
    const r = ritmoDelMes(2026, 10, null, [{ fecha: "2026-11-25", a: "beneficios" }]);
    expect(r["2026-11-02"]).toBe("anuncio");     // lunes
    expect(r["2026-11-01"]).toBe("");            // domingo, libre
    expect(r["2026-11-25"]).toBe("beneficios");  // miércoles, cambiado
    expect(Object.keys(r)).toHaveLength(30);
  });
});

describe("la temporada", () => {
  it("Black Friday: el día y el anterior pasan a promoción; como mucho dos por semana", () => {
    const s = sugerenciasDeTemporada({ year: 2026, month: 10, ritmo: null, fechas: fechasDelMes(2026, 10, null) });
    const bf = s.filter((c) => c.motivo.startsWith("Black Friday"));
    expect(bf.map((c) => [c.fecha, c.de, c.a])).toEqual([["2026-11-26", "educativo", "beneficios"], ["2026-11-27", "diferenciador", "beneficios"]]);
    const porSemana = {};
    for (const c of s) { const k = c.fecha.slice(0, 8) + Math.floor((+c.fecha.slice(8) + 5) / 7); porSemana[k] = (porSemana[k] ?? 0) + 1; }
    expect(Math.max(...Object.values(porSemana))).toBeLessThanOrEqual(MAX_CAMBIOS_POR_SEMANA);
  });

  it("en un día delicado una promoción pasa a educativo, y eso va primero", () => {
    // 20 de diciembre de 2026 (duelo nacional) cae domingo: con un ritmo que vende el domingo.
    const s = sugerenciasDeTemporada({ year: 2026, month: 11, ritmo: { ...RITMO_POR_DEFECTO, 0: "beneficios" }, fechas: fechasDelMes(2026, 11, null) });
    expect(s.find((c) => c.fecha === "2026-12-20")).toMatchObject({ de: "beneficios", a: "educativo" });
  });

  it("sin ritmo no sugiere nada", () => {
    const vacio = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, ""]));
    expect(sugerenciasDeTemporada({ year: 2026, month: 10, ritmo: vacio, fechas: fechasDelMes(2026, 10, null) })).toEqual([]);
  });
});

describe("la matriz", () => {
  const productos = [{ id: "a", nombre: "Sofá" }, { id: "b", nombre: "Alfombra" }];
  const deseos = [{ deseo: "Tranquilidad" }, { deseo: "Familia" }, { deseo: "Ahorro" }];
  const perfiles = [{ nombre: "Mamá" }, { nombre: "Mascotas" }];

  it("rota productos, niveles, maletas, deseos y perfiles; respeta lo elegido a mano", () => {
    const m = asignarMatriz([
      { pilar: "anuncio" }, { pilar: "anuncio" }, { pilar: "educativo" }, { pilar: "maletas" }, { pilar: "maletas" },
      { pilar: "servicios", productoId: "b", producto: "Alfombra", nivel: "solucion" }, { pilar: "" },
    ], { productos, deseos, perfiles });
    expect(m.map((x) => x.producto)).toEqual(["Sofá", "Alfombra", "", "Sofá", "Alfombra", "Alfombra", undefined]);
    expect(m.map((x) => x.nivel)).toEqual(["decision", "producto", "inconsciente", "decision", "producto", "solucion", undefined]);
    expect(m[3].pilarSub).toBe("garantia");
    expect(m[4].pilarSub).toBe("testimonio");
    expect(m.slice(0, 4).map((x) => x.deseo)).toEqual(["Tranquilidad", "Familia", "Ahorro", "Tranquilidad"]);
    expect(m.slice(0, 4).map((x) => x.perfil)).toEqual(["Mamá", "Mamá", "Mamá", "Mascotas"]);
    expect(m[6].pilar).toBe("");
  });

  it("sin catálogo ni estudio, sólo tipo y nivel", () => {
    const [x] = asignarMatriz([{ pilar: "beneficios" }]);
    expect(x).toMatchObject({ pilar: "beneficios", nivel: "decision", producto: "", deseo: "", perfil: "" });
  });
});

describe("lo que lee la IA", () => {
  it("las líneas de una publicación con tipo; nada si no tiene", () => {
    const t = lineasDeContenido({ pilar: "maletas", pilarSub: "testimonio", producto: "Sofá", nivel: "problema", deseo: "Familia", perfil: "Mamá" });
    expect(t).toContain("TIPO DE CONTENIDO: 7 maletas · Testimonio — Un testimonio REAL");
    expect(t).toContain("PRODUCTO: Sofá (su precio y oferta, EXACTAMENTE");
    expect(t).toContain("gancho por el DOLOR");
    expect(t).toContain("perfil «Mamá», deseo de familia");
    expect(lineasDeContenido({})).toBe("");
    expect(reglasDeLosTipos()).toContain("Nunca inventes precios");
  });

  it("nombres, preset y mezcla", () => {
    expect(nombreDePilar("maletas", "garantia")).toBe("7 maletas · Garantía");
    expect(nombreDePilar("nada")).toBe("");
    expect(presetDePilar("educativo")).toBe("creativo");
    expect(presetDePilar("diferenciador")).toBe("corporativo");
    expect(mezclaDeTipos([{ pilar: "anuncio" }, { pilar: "anuncio" }, { pilar: "educativo" }, {}])).toEqual([
      { id: "anuncio", nombre: "Anuncio", n: 2 }, { id: "educativo", nombre: "Educativo / Informativo", n: 1 },
    ]);
  });
});

describe("los productos según su disponibilidad", () => {
  const P = (id, stock = "") => ({ id, nombre: id.toUpperCase(), stock });

  it("sin disponibilidad, rotan en el orden del catálogo", () => {
    expect(ordenDeProductos([P("a"), P("b"), P("c")], 7).map((p) => p.id)).toEqual(["a", "b", "c", "a", "b", "c", "a"]);
  });

  it("mucho sale más; poco, sólo en la primera mitad; agotado, nunca", () => {
    const orden = ordenDeProductos([P("mucho", "alto"), P("poco", "bajo"), P("normal", "medio"), P("fuera", "agotado")], 14).map((p) => p.id);
    const cuenta = (id) => orden.filter((x) => x === id).length;
    expect(cuenta("fuera")).toBe(0);
    expect(cuenta("mucho")).toBeGreaterThan(cuenta("normal"));
    expect(orden.slice(7)).not.toContain("poco");
    expect(orden.slice(0, 7)).toContain("poco");
    // Repartido: el que más sale no se amontona (nunca tres seguidos).
    expect(orden.join(",")).not.toMatch(/mucho,mucho,mucho/);
  });

  it("si sólo queda lo que tiene poco, sale igual", () => {
    expect(ordenDeProductos([P("poco", "bajo")], 4).map((p) => p.id)).toEqual(["poco", "poco", "poco", "poco"]);
    expect(ordenDeProductos([P("x", "agotado")], 3)).toEqual([]);
  });

  it("la matriz usa ese orden", () => {
    const pubs = Array.from({ length: 6 }, (_, i) => ({ fecha: `2026-10-0${i + 1}`, pilar: "anuncio" }));
    const m = asignarMatriz(pubs, { productos: [P("a", "alto"), P("b", "agotado"), P("c", "bajo")] });
    expect(m.map((x) => x.productoId)).not.toContain("b");
    expect(m.slice(3).map((x) => x.productoId)).not.toContain("c");
  });
});
