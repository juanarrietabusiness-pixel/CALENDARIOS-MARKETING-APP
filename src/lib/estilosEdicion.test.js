import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  limpiarEstiloEdicion, limpiarEstilosEdicion, resumenEstiloEdicion, TIPOS_ESTILO_EDICION, MAX_ESTILOS_EDICION, MAX_ESTILO_EDICION,
  VARIANTES_ESTILO_EDICION, igualesEntreVariantes,
} from "./estilosEdicion.js";
import { VARIANTES } from "./variantesEdicion.js";
import { TIPOS_VIDEO_GRABADO } from "./manualEditor.js";
import { limpiarKit } from "./kitMarca.js";

const siembra = (n) => JSON.parse(readFileSync(new URL(`../../docs/estilos-edicion/${n}.json`, import.meta.url), "utf8"));

describe("estilos de edición (puro)", () => {
  it("los tipos son los del manual (menos «sólo una idea», que no es una edición)", () => {
    expect(TIPOS_ESTILO_EDICION).toEqual(TIPOS_VIDEO_GRABADO.filter((t) => t !== "solo-idea"));
  });

  it("las variantes son las del catálogo del kit, y se cuentan las que se ven iguales entre dos marcas", () => {
    expect(VARIANTES_ESTILO_EDICION).toEqual(Object.fromEntries(Object.entries(VARIANTES).map(([k, v]) => [k, Object.keys(v.variantes)])));
    const errores = [];
    const e = limpiarEstiloEdicion({ nombre: "X", variantes: { transicion: "zoom", entrada: "nada", forma: "recta", colores: "x" } }, errores);
    expect(e.variantes).toEqual({ transicion: "zoom", forma: "recta" });
    expect(errores.join(" ")).toMatch(/variantes\.entrada: «nada»/);
    expect(errores.join(" ")).toMatch(/variantes\.colores: no es una pieza/);
    expect(igualesEntreVariantes({ transicion: "zoom", entrada: "golpe", ritmo: "vivo" }, { transicion: "zoom", entrada: "golpe", ritmo: "vivo" })).toBe(2);
    expect(igualesEntreVariantes(null, { transicion: "zoom" })).toBe(0);
    expect(resumenEstiloEdicion(e).join(" ")).toMatch(/Variantes del kit: transicion «zoom», forma «recta»/);
  });

  it("las dos siembras (Rofer y Comunidad) se entienden enteras, sin un solo error", () => {
    for (const n of ["rofer-alex-en-obra", "comunidad-persona-y-pantalla"]) {
      const errores = [];
      const e = limpiarEstiloEdicion(siembra(n), errores);
      expect(errores).toEqual([]);
      expect(e).toEqual(siembra(n));
      expect(JSON.stringify(e).length).toBeLessThanOrEqual(MAX_ESTILO_EDICION);
    }
  });

  it("sin nombre no hay estilo; lo que no se entiende se dice y se descarta", () => {
    const errores = [];
    expect(limpiarEstiloEdicion({ tipo: "persona-a-camara" }, errores)).toBeNull();
    expect(errores[0]).toMatch(/nombre/);
    const e2 = [];
    const e = limpiarEstiloEdicion({
      nombre: "  Prueba  ", tipo: "baile", piezas: { textoDetras: "arriba", confeti: "mucho", placasNumeradas: "sí" },
      camara: { abierto: 1.13, medio: 3, zoom: 2, golpeAlEntrar: true }, transiciones: { entreClips: "estrella" },
      cierre: { segundos: 12, boton: "ESCRÍBENOS", numero: true }, musica: { bajoVoz: -18, llamado: 5 },
    }, e2);
    expect(e).toEqual({
      nombre: "Prueba", piezas: { textoDetras: "arriba" }, camara: { abierto: 1.13, golpeAlEntrar: true },
      cierre: { boton: "ESCRÍBENOS", numero: true }, musica: { bajoVoz: -18 },
    });
    expect(e2.join(" ")).toMatch(/tipo: «baile»/);
    expect(e2.join(" ")).toMatch(/piezas\.confeti/);
    expect(e2.join(" ")).toMatch(/camara\.medio: 3 está fuera/);
    expect(e2.join(" ")).toMatch(/camara\.zoom: no existe/);
    expect(e2.join(" ")).toMatch(/entreClips: «estrella»/);
    expect(e2.join(" ")).toMatch(/cierre\.segundos/);
    expect(e2.join(" ")).toMatch(/musica\.llamado: 5/);
  });

  it("el plano medio acerca más que el abierto", () => {
    const errores = [];
    limpiarEstiloEdicion({ nombre: "x", camara: { abierto: 1.3, medio: 1.2 } }, errores);
    expect(errores.join(" ")).toMatch(/medio tiene que acercar más/);
  });

  it("topes: textos de pieza a 160, notas a 600 y el estilo entero a 2.000", () => {
    const e = limpiarEstiloEdicion({ nombre: "x", piezas: { sello: "a".repeat(300) }, notas: "b".repeat(900) });
    expect(e.piezas.sello).toHaveLength(160);
    expect(e.notas).toHaveLength(600);
    const errores = [];
    const largo = Object.fromEntries(["textoDetras", "titular", "tachado", "cinta", "sello", "fichas", "lista", "preguntas", "trio", "logo", "whatsapp", "celular"].map((k) => [k, "c".repeat(160)]));
    expect(limpiarEstiloEdicion({ nombre: "x", piezas: largo }, errores)).toBeNull();
    expect(errores[0]).toMatch(/2000 caracteres/);
  });

  it("la lista guarda sólo estilos con id, sin repetir id ni nombre, hasta 6", () => {
    const lista = limpiarEstilosEdicion([
      { id: "ee-aaaaaa1", nombre: "Uno" }, { nombre: "Sin id" }, { id: "ee-aaaaaa1", nombre: "Otro" }, { id: "ee-bbbbbb2", nombre: "uno" },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `ee-cccccc${i}`, nombre: `N${i}` })),
    ]);
    expect(lista[0]).toEqual({ id: "ee-aaaaaa1", nombre: "Uno" });
    expect(lista).toHaveLength(MAX_ESTILOS_EDICION);
    expect(lista.map((e) => e.nombre)).not.toContain("Sin id");
    expect(lista.map((e) => e.nombre)).not.toContain("uno");
  });

  it("el resumen se lee en frases", () => {
    const r = resumenEstiloEdicion(siembra("rofer-alex-en-obra")).join("\n");
    expect(r).toMatch(/Gancho: afirmación de dolor gigante/);
    expect(r).toMatch(/El sello \(datos verificados\): sólo datos verificados/);
    expect(r).toMatch(/Cámara: abierto 1.13×, medio 1.47×, sigue la cabeza al 55 %, acerca hasta 2×, golpe al entrar: sí/);
    expect(r).toMatch(/Transiciones: entre clips, barrido-diagonal; dentro de un clip, destello-obturador/);
    expect(r).toMatch(/Cierre: 3 s sin voz, botón «ESCRÍBANOS AL WHATSAPP», número: sí, @usuario: sí/);
    expect(r).toMatch(/Placas numeradas: sí/);
  });

  it("el kit los conserva al limpiarse (y uno de antes no cambia)", () => {
    const estilo = { ...siembra("rofer-alex-en-obra"), id: "ee-rofer0001" };
    expect(limpiarKit({ estilosEdicion: [estilo] }).estilosEdicion).toEqual([estilo]);
    expect(limpiarKit({ estilo: "sobrio" })).not.toHaveProperty("estilosEdicion");
  });
});
