import { describe, it, expect } from "vitest";
import {
  PARTES_EDITOR, TIPOS_VIDEO_GRABADO, MAX_PARTE_COMUN, MAX_PARTE_TIPO, ESTADOS_TIPO,
  huella, limpiarPartes, huellasDeLaBase, manualVigente, cambiosDeLaCasa, partesDistintas, juntarPartes, manualParaClaude,
} from "./manualEditor.js";
import { OFICIO } from "./oficioEdicion.js";

const base = (id) => PARTES_EDITOR.find((p) => p.id === id).base;

describe("la base de la casa", () => {
  it("tiene las partes comunes en orden y los cuatro tipos", () => {
    expect(PARTES_EDITOR.filter((p) => p.grupo === "comun").map((p) => p.id)).toEqual([
      "comun.diagnostico", "comun.propuesta", "comun.estilo", "comun.corte", "comun.gancho", "comun.imagen", "comun.textos",
      "comun.subtitulos", "comun.sonido", "comun.llamado", "comun.revision",
    ]);
    expect(TIPOS_VIDEO_GRABADO).toEqual(["persona-a-camara", "persona-y-pantalla", "sin-persona", "solo-idea"]);
    for (const p of PARTES_EDITOR.filter((x) => x.grupo === "tipo")) expect(Object.keys(ESTADOS_TIPO)).toContain(p.estado);
  });

  it("cada parte cabe en su tope y sólo «sin persona» está vacía", () => {
    for (const p of PARTES_EDITOR) expect(p.base.length, p.id).toBeLessThanOrEqual(p.grupo === "comun" ? MAX_PARTE_COMUN : MAX_PARTE_TIPO);
    expect(PARTES_EDITOR.filter((p) => !p.base).map((p) => p.id)).toEqual(["tipos.sin-persona"]);
  });

  it("se escribe con los números del oficio (una sola fuente)", () => {
    const todo = PARTES_EDITOR.map((p) => p.base).join("\n");
    expect(todo).toContain(`voz −${-OFICIO.silencio.umbralDb} dB`);
    expect(todo).toContain("más de 0,16 s queda en 0,10 s");
    expect(todo).toContain("14 % arriba y 20 % abajo");
    expect(todo).toContain("≈150 ms ANTES de la voz");
    expect(todo).toContain("−14 LUFS y pico −1,2 dBTP");
    expect(todo).toContain("hasta 4 palabras");
  });

  it("lleva las decisiones de la agencia del 2026-11-20", () => {
    // Las muestras antes de editar, el tope REAL de la cabeza y el contacto de la nota de datos del negocio.
    expect(base("comun.propuesta")).toMatch(/2 o 3 CUADROS DE MUESTRA/);
    expect(base("comun.textos")).toMatch(/tope REAL de la cabeza o del casco/);
    expect(base("comun.diagnostico")).toMatch(/«Datos del negocio»/);
    expect(base("comun.diagnostico")).toMatch(/Si no coinciden, díselo/);
  });
});

describe("el estilo de la marca (variedad, 2026-11-24)", () => {
  it("pide elegir por la personalidad y no copiar a otro cliente; lo de Rofer ya no es el estilo de todos", () => {
    const estilo = base("comun.estilo");
    for (const x of ["Lujo (lento y elegante)", "Tecnología (glitch y cortes secos)", "Familiar (suave y redondeado)", "Industrial (golpes y barridos)"]) expect(estilo).toContain(x);
    expect(estilo).toMatch(/NUNCA copies el estilo de otro cliente/);
    expect(estilo).toMatch(/van TAL CUAL/);
    const todo = PARTES_EDITOR.map((p) => p.base).join("\n");
    expect(todo).not.toMatch(/barrido diagonal del color de la marca/);
    expect(todo).not.toMatch(/con el barrido de la marca/);
    expect(base("comun.imagen")).toMatch(/plan\.variantes\.transicion/);
  });
});

describe("las partes de la agencia", () => {
  it("se limpian: ids que existen, sin vacíos, con su tope y sin copiar la casa", () => {
    const largo = "x".repeat(MAX_PARTE_COMUN + 50);
    const p = limpiarPartes({ "comun.corte": "  Mi corte  ", "comun.inventada": "no", "comun.gancho": "", "comun.textos": largo, "comun.sonido": base("comun.sonido"), "tipos.sin-persona": 7 });
    expect(p).toEqual({ "comun.corte": "Mi corte", "comun.textos": "x".repeat(MAX_PARTE_COMUN) });
    expect(limpiarPartes(null)).toEqual({});
    expect(limpiarPartes(["a"])).toEqual({});
  });

  it("lo que no cambió la agencia vale el de la casa", () => {
    const v = manualVigente({ "comun.corte": "Mi corte" });
    expect(v["comun.corte"]).toBe("Mi corte");
    expect(v["comun.gancho"]).toBe(base("comun.gancho"));
  });

  it("la huella dice si la casa cambió una parte que la agencia editó", () => {
    expect(huella("a")).toMatch(/^[0-9a-f]{8}$/);
    expect(huella("a")).not.toBe(huella("b"));
    const partes = { "comun.corte": "Mi corte", "comun.gancho": "Mi gancho" };
    const bases = huellasDeLaBase(partes);
    expect(cambiosDeLaCasa(partes, bases)).toEqual([]);
    expect(cambiosDeLaCasa(partes, { ...bases, "comun.corte": "00000000" })).toEqual(["comun.corte"]);
    // Sin huella guardada (no se sabe), no se avisa.
    expect(cambiosDeLaCasa(partes, {})).toEqual([]);
  });

  it("partesDistintas compara contra la casa lo que no está", () => {
    expect(partesDistintas({}, { "comun.corte": base("comun.corte") })).toEqual([]);
    expect(partesDistintas({ "comun.corte": "a" }, {})).toEqual(["comun.corte"]);
  });
});

describe("juntar al guardar (otra persona guardó entretanto)", () => {
  it("lo mío va encima de lo suyo si cambiamos partes distintas", () => {
    const r = juntarPartes({ leidas: { "comun.corte": "A" }, mias: { "comun.corte": "A", "comun.gancho": "mío" }, ultimas: { "comun.corte": "B" } });
    expect(r).toEqual({ partes: { "comun.corte": "B", "comun.gancho": "mío" }, choques: [] });
  });

  it("devolver una parte a la casa también se junta", () => {
    const r = juntarPartes({ leidas: { "comun.corte": "A", "comun.gancho": "G" }, mias: { "comun.gancho": "G" }, ultimas: { "comun.corte": "A", "comun.gancho": "G", "comun.textos": "T" } });
    expect(r).toEqual({ partes: { "comun.gancho": "G", "comun.textos": "T" }, choques: [] });
  });

  it("si los dos cambiamos la misma parte distinto, es un choque y no se pisa", () => {
    const r = juntarPartes({ leidas: {}, mias: { "comun.corte": "mío" }, ultimas: { "comun.corte": "suyo" } });
    expect(r.choques).toEqual(["comun.corte"]);
    expect(r.partes).toEqual({ "comun.corte": "suyo" });
    // Lo mismo escrito por los dos no es choque.
    expect(juntarPartes({ leidas: {}, mias: { "comun.corte": "igual" }, ultimas: { "comun.corte": "igual" } }).choques).toEqual([]);
  });
});

describe("lo que lee Claude (compacto)", () => {
  it("lo común y el tipo pedido, con la versión, en menos de 10.000 caracteres", () => {
    const t = manualParaClaude({ partes: { "comun.corte": "- Corta sólo lo nuestro." }, version: 3 }, "persona-a-camara");
    expect(t).toMatch(/^MANUAL DEL EDITOR DE LA AGENCIA · versión 3 \(con cambios de la agencia\)/);
    expect(t).toContain("## CORTE\n- Corta sólo lo nuestro.");
    expect(t).toContain("## TIPO: PERSONA A CÁMARA (EN UN LUGAR REAL)");
    expect(t).not.toContain("modo celular»");
    expect(t.length).toBeLessThan(10_000);
  });

  it("un tipo en prueba o vacío lo dice; sin tipo, la lista para reconocerlo", () => {
    expect(manualParaClaude({}, "persona-y-pantalla")).toContain("## TIPO: PERSONA Y PANTALLA · EN PRUEBA");
    expect(manualParaClaude({}, "sin-persona")).toMatch(/SIN ESCRIBIR\nEste tipo aún no tiene manual/);
    const sinTipo = manualParaClaude({}, "");
    expect(sinTipo).toMatch(/^MANUAL DEL EDITOR DE LA AGENCIA · el de la casa\n/);
    expect(sinTipo).toContain("- solo-idea: Sólo una idea (Sin clips grabados) · No es una edición");
  });
});
