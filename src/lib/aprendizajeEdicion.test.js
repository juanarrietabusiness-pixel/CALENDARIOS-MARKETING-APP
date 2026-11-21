import { describe, it, expect } from "vitest";
import {
  limpiarCorreccion, evaluarCorreccion, aplicarATexto, campoDelEstilo, conCampo, esOrden, textoDePropuesta, MAX_PENDIENTES_POR_DESTINO,
} from "./aprendizajeEdicion.js";

const PARTES = ["comun.textos", "comun.sonido", "tipos.persona-a-camara"];
const limpia = (c) => limpiarCorreccion(c, { partesManual: PARTES });

describe("aprendizaje del editor: las correcciones", () => {
  it("sin cita no hay propuesta; cada campo dice lo que falta", () => {
    expect(limpia({ alcance: "general", parte: "comun.textos", operacion: "anadir", texto: "x" }).error).toMatch(/Sin «cita»/);
    expect(limpia({ alcance: "todo", cita: "a" }).error).toMatch(/alcance/);
    expect(limpia({ alcance: "marca", cita: "a", operacion: "mover" }).error).toMatch(/operacion/);
    expect(limpia({ alcance: "marca", cita: "a", operacion: "cambiar", texto: "b" }).error).toMatch(/antes/);
    expect(limpia({ alcance: "general", cita: "a", operacion: "anadir", texto: "b", parte: "comun.nada" }).error).toMatch(/parte/);
    expect(limpia({ alcance: "marca", cita: "a", operacion: "anadir", texto: "b", parte: "camara.abierto" }).error).toMatch(/campo de texto/);
    expect(limpia({ alcance: "marca", cita: " sube los textos ", operacion: "anadir", texto: "Más arriba" })).toEqual({
      alcance: "marca", parte: "notas", operacion: "anadir", antes: "", texto: "Más arriba", cita: "sube los textos",
    });
  });

  it("una general necesita una orden o haberse repetido con otro cliente", () => {
    expect(esOrden("eso debe pasar en todos los videos")).toBe(true);
    expect(esOrden("Nunca pongas la lista abajo")).toBe(true);
    expect(esOrden("la música ni se escucha")).toBe(false);
    const c = limpia({ alcance: "general", parte: "comun.sonido", operacion: "anadir", texto: "La música se oye.", cita: "la música ni se escucha" });
    expect(evaluarCorreccion(c).descartada).toMatch(/necesita una orden/);
    expect(evaluarCorreccion(c, { repetidaEn: 1 }).propuesta).toMatchObject({ destino: "manual", nota: /otro cliente/ });
    const orden = limpia({ alcance: "general", parte: "comun.sonido", operacion: "anadir", texto: "La música se oye.", cita: "todos los videos: que la música se oiga" });
    expect(evaluarCorreccion(orden).propuesta).toMatchObject({ destino: "manual", parte: "comun.sonido", operacion: "anadir" });
  });

  it("no se propone dos veces: lo que ya dice, lo pendiente, lo descartado; y hay tope", () => {
    const c = limpia({ alcance: "marca", operacion: "anadir", texto: "Los textos, más arriba", cita: "pudieron quedar más arriba" });
    expect(evaluarCorreccion(c, { textoActual: "Regla. Los textos, MÁS ARRIBA." }).descartada).toMatch(/ya lo dice/);
    const otra = { destino: "estilo", texto: "los textos mas arriba", antes: "" };
    expect(evaluarCorreccion(c, { otras: [{ ...otra, estado: "pendiente" }] }).descartada).toMatch(/esperando/);
    expect(evaluarCorreccion(c, { otras: [{ ...otra, estado: "descartada" }] }).descartada).toMatch(/descartó/);
    expect(evaluarCorreccion(c, { pendientes: { estilo: MAX_PENDIENTES_POR_DESTINO } }).descartada).toMatch(/Ya hay 10/);
    expect(evaluarCorreccion(c).propuesta.destino).toBe("estilo");
  });

  it("cambiar o quitar algo que no está, no se propone", () => {
    const c = limpia({ alcance: "marca", parte: "piezas.lista", operacion: "cambiar", antes: "abajo", texto: "arriba", cita: "casi tapa la cara" });
    expect(evaluarCorreccion(c, { textoActual: "sólo arriba" }).descartada).toMatch(/ya no está/);
    expect(evaluarCorreccion(c, { textoActual: "la lista va abajo" }).propuesta).toMatchObject({ operacion: "cambiar", antes: "abajo" });
  });
});

describe("aprendizaje del editor: aplicar exacto", () => {
  it("añadir pone una línea al final; cambiar y quitar necesitan el texto UNA vez", () => {
    expect(aplicarATexto("Uno.", { operacion: "anadir", texto: "Dos." })).toEqual({ texto: "Uno.\nDos." });
    expect(aplicarATexto("", { operacion: "anadir", texto: "Dos." })).toEqual({ texto: "Dos." });
    expect(aplicarATexto("La lista abajo.", { operacion: "cambiar", antes: "abajo", texto: "arriba" })).toEqual({ texto: "La lista arriba." });
    expect(aplicarATexto("A.\nB.\nC.", { operacion: "quitar", antes: "B." })).toEqual({ texto: "A.\n\nC." });
    expect(aplicarATexto("abajo y abajo", { operacion: "cambiar", antes: "abajo", texto: "x" }).caduca).toMatch(/más de una vez/);
    expect(aplicarATexto("nada", { operacion: "quitar", antes: "abajo" }).caduca).toMatch(/ya no está/);
  });

  it("los campos del estilo se leen y se cambian por su ruta", () => {
    const e = { nombre: "x", piezas: { lista: "arriba" }, notas: "n" };
    expect(campoDelEstilo(e, "piezas.lista")).toBe("arriba");
    expect(campoDelEstilo(e, "piezas.sello")).toBe("");
    expect(campoDelEstilo(null, "notas")).toBe("");
    expect(conCampo(e, "piezas.sello", "datos")).toEqual({ nombre: "x", piezas: { lista: "arriba", sello: "datos" }, notas: "n" });
    expect(conCampo(e, "notas", "")).toEqual({ nombre: "x", piezas: { lista: "arriba" } });
    expect(e.piezas).toEqual({ lista: "arriba" });
  });

  it("se enseña con el texto exacto y la cita", () => {
    expect(textoDePropuesta({ id: "pe-1", destino: "manual", parte: "comun.sonido", operacion: "cambiar", antes: "a", texto: "b", cita: "c" }, { nombreParte: "El sonido" }))
      .toBe("[pe-1] En el MANUAL (para todos los clientes), parte «El sonido»: CAMBIAR «a» POR «b». Porque dijo: «c».");
  });
});
