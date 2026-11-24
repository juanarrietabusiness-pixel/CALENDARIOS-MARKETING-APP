import { describe, it, expect } from "vitest";
import {
  VARIANTES, VARIANTES_BASE, PIEZAS_CON_VARIANTE, FACTOR_RITMO, limpiarVariantes, erroresDeVariantes, variantesCompletas,
  variantesParaRemotion, describirVariantes, catalogoEnTexto, esVariante,
} from "./variantesEdicion.js";
import { ESTILOS_SUBTITULO } from "./identidadVideo.js";
import { escenaParaRemotion, resolverPiezas } from "./escenaEdicion.js";
import { validarPlan, VERSION_PLAN } from "./planEdicion.js";
import { lineaDeTiempo } from "./corteEdicion.js";
import { camaraDelVideo } from "./camaraEdicion.js";

// El editor salía igual que Rofer con otros colores (2026-11-24): un juego de piezas. Ahora cada pieza tiene variantes.

describe("el catálogo de variantes", () => {
  it("tiene lo que pidió la agencia: 6 transiciones, 6 entradas, los 4 subtítulos de identidad_video y cierres distintos", () => {
    expect(Object.keys(VARIANTES.transicion.variantes)).toEqual(["barrido", "zoom", "paneo", "deslizar", "glitch", "destello"]);
    expect(Object.keys(VARIANTES.entrada.variantes)).toEqual(["subir", "golpe", "palabra", "mascara", "maquina", "escala"]);
    expect(Object.keys(VARIANTES.subtitulos.variantes).sort()).toEqual(Object.keys(ESTILOS_SUBTITULO).sort());
    expect(Object.keys(VARIANTES.cierre.variantes).length).toBeGreaterThanOrEqual(4);
    for (const k of PIEZAS_CON_VARIANTE) {
      for (const v of Object.values(VARIANTES[k].variantes)) expect(v.nombre && v.descripcion).toBeTruthy();
    }
  });

  it("la base es el juego de Rofer v2 y es válida", () => {
    expect(VARIANTES_BASE).toEqual({ transicion: "barrido", entrada: "subir", subtitulos: "placa", cierre: "tarjeta", ritmo: "normal", forma: "redonda" });
    for (const [k, v] of Object.entries(VARIANTES_BASE)) expect(esVariante(k, v)).toBe(true);
  });

  it("limpia, completa y describe; lo que no existe se dice con su lista", () => {
    expect(limpiarVariantes({ transicion: "glitch", entrada: "nada", otra: "x" })).toEqual({ transicion: "glitch" });
    expect(limpiarVariantes(null)).toEqual({});
    expect(variantesCompletas({ cierre: "banda" })).toEqual({ ...VARIANTES_BASE, cierre: "banda" });
    expect(variantesParaRemotion({ ritmo: "pausado" }).k).toBe(FACTOR_RITMO.pausado);
    expect(describirVariantes({ transicion: "zoom", entrada: "maquina" })).toBe("Transición: golpe de zoom · Entrada de texto: máquina de escribir");
    const errores = erroresDeVariantes({ transicion: "fundido", colores: "x" });
    expect(errores.join("\n")).toMatch(/«fundido» no es una variante; son barrido, zoom/);
    expect(errores.join("\n")).toMatch(/«variantes\.colores» no existe/);
    expect(erroresDeVariantes([1])).toHaveLength(1);
    expect(catalogoEnTexto()).toMatch(/glitch: Glitch\./);
  });
});

describe("las variantes en el plan y en la escena", () => {
  const linea = lineaDeTiempo([{ id: "a", piezas: [[0, 2], [2.5, 4]] }], { fps: 30, cierre: 1 });
  const palabras = ["lo", "más", "caro", "de", "tu", "obra"].map((w, i) => ({ w, s: i * 0.5, e: i * 0.5 + 0.4 }));
  const geo = { a: Object.fromEntries(Array.from({ length: 150 }, (_, i) => [i, { top: 900, hx: 540, hw: 220, bot: 1900 }])) };
  const cam = camaraDelVideo(linea, geo);
  const titular = { tipo: "titular", lineas: [{ texto: "LO MÁS CARO" }], hasta: { t: 1 } };

  it("sin elegir, el juego de siempre; los subtítulos, los de la marca", () => {
    const r = escenaParaRemotion({ linea, palabras, camara: cam, plan: { piezas: [titular] }, marca: { subtitulos: { estilo: "limpio" } } });
    expect(r.datos.variantes).toEqual({ ...VARIANTES_BASE, subtitulos: "limpio", k: 1 });
    expect(r.datos.subtitulos).toMatchObject({ estilo: "limpio", mayusculas: false });
  });

  it("lo elegido llega a Remotion, con el ritmo resuelto, y manda sobre los subtítulos de la marca", () => {
    const variantes = { transicion: "glitch", entrada: "maquina", subtitulos: "palabra", cierre: "banda", ritmo: "vivo", forma: "recta" };
    const plan = { piezas: [titular, { tipo: "gigante", texto: "OBRA", desde: { palabra: 5 } }, { tipo: "sello", arriba: "FLOTA", grande: "14", desde: { palabra: 3 } }], variantes };
    const r = escenaParaRemotion({ linea, palabras, camara: cam, plan, marca: { subtitulos: { estilo: "placa" } } });
    expect(r.datos.variantes).toEqual({ ...variantes, k: FACTOR_RITMO.vivo });
    expect(r.datos.subtitulos.estilo).toBe("palabra");
    expect(r.datos.piezas.find((p) => p.tipo === "gigante")).toMatchObject({ entrada: "maquina" });
    expect(r.datos.piezas.find((p) => p.tipo === "sello")).toMatchObject({ entrada: "maquina" });
    expect(r.datos.piezas.find((p) => p.tipo === "titular").entrada).toBeUndefined();
  });

  it("una pieza puede pedir su propia entrada; el «modo» de antes del catálogo sigue valiendo", () => {
    const base = { palabras, cabeza: cam.cabeza, fps: 30, vozFin: linea.vozFin, entrada: "escala" };
    const [a, b, c, d] = resolverPiezas([
      { tipo: "gigante", texto: "A", entrada: "golpe" },
      { tipo: "gigante", texto: "B", modo: "pop" },
      { tipo: "gigante", texto: "C" },
      { tipo: "trio", items: [{ texto: "X" }] },
    ], base);
    expect([a.entrada, b.entrada, c.entrada, d.entrada]).toEqual(["golpe", "golpe", "escala", "escala"]);
    expect(b.modo).toBe("pop");
  });

  it("validarPlan dice lo que no existe", () => {
    const plan = { version: VERSION_PLAN, clips: [{ id: "a", archivo: "a.mov" }], musica: null, variantes: { transicion: "fundido" }, piezas: [{ tipo: "gigante", entrada: "rodar" }] };
    const { errores } = validarPlan(plan);
    expect(errores.join("\n")).toMatch(/«variantes\.transicion»: «fundido»/);
    expect(errores.join("\n")).toMatch(/Pieza 1 \(gigante\): «entrada» «rodar» no existe/);
    expect(validarPlan({ ...plan, variantes: { transicion: "zoom" }, piezas: [{ tipo: "gigante", entrada: "mascara" }] }).errores).toEqual([]);
  });
});
