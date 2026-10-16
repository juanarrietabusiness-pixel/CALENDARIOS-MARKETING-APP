import { describe, it, expect } from "vitest";
import { pedidoDeSistema, leerSistema, lineaDeSistema, resumenSistema } from "./sistemaCarrusel.js";
import { pedidoDeControl, leerControl, resumenControl } from "./control.js";
import { pedidoDeLamina } from "./carrusel.js";

const RESPUESTA = 'Listo: {"titular":{"tamano":"≈9 % del alto","peso":"extra negrita","mayusculas":true,"color":"#FFFFFF","alineacion":"izquierda","letra":"sans geométrica"},"apoyo":{"tamano":"","peso":"","color":"azul"},"zonaTexto":"tercio superior, a la izquierda, directo sobre la foto","margenes":"≈6 % del ancho","fondo":"foto cálida a sangre","colores":["#1B3246","#F2E8D5","rojo"],"elementos":["número de lámina arriba a la derecha"],"logo":"abajo a la derecha, pequeño"}';

describe("el sistema de diseño de la portada", () => {
  it("pide medidas que el generador pueda seguir, con el texto de la portada", () => {
    const p = pedidoDeSistema({ marca: "Dcasa", texto: "3 errores al comprar un sofá" });
    expect(p).toContain("PORTADA aprobada");
    expect(p).toContain("3 errores al comprar un sofá");
    expect(p).toMatch(/porcentajes del alto o del ancho/);
  });

  it("lee la respuesta: colores en hex, sin lo que no sirve", () => {
    const s = leerSistema(RESPUESTA);
    expect(s.titular).toMatchObject({ tamano: "≈9 % del alto", mayusculas: true, color: "#ffffff" });
    expect(s.apoyo).toBeNull();
    expect(s.colores).toEqual(["#1b3246", "#f2e8d5"]);
    expect(leerSistema("sin json")).toBeNull();
    expect(leerSistema("{}")).toBeNull();
    // Un sistema ya leído (el guardado en la ficha) se vuelve a limpiar igual.
    expect(leerSistema(s)).toEqual(s);
  });

  it("va en una línea al pedido de cada lámina, menos en la portada", () => {
    const linea = lineaDeSistema(leerSistema(RESPUESTA));
    expect(linea).toMatch(/^SISTEMA DE DISEÑO DE LA SERIE/);
    expect(linea).toContain("en MAYÚSCULAS");
    expect(linea).toContain("el texto va tercio superior");
    expect(linea).toContain("#1b3246");
    expect(lineaDeSistema(null)).toBe("");
    const lamina = pedidoDeLamina({ lamina: { n: 2, rol: "contenido", texto: "Error 1" }, total: 4, conAnteriores: true, sistema: linea });
    expect(lamina).toContain("SISTEMA DE DISEÑO DE LA SERIE");
    expect(resumenSistema(RESPUESTA)).toContain("Titular ≈9 % del alto, extra negrita, mayúsculas");
  });

  it("el control dice lo que se sale de la serie: se revisa, pero una letra mal se sigue corrigiendo sola", () => {
    const linea = lineaDeSistema(leerSistema(RESPUESTA));
    expect(pedidoDeControl({ texto: "Error 1", sistema: linea })).toMatch(/7\. Esta pieza es parte de una serie[\s\S]*"serie"/);
    expect(pedidoDeControl({ texto: "Error 1" })).not.toMatch(/"serie"/);
    const fuera = leerControl('{"textoLeido":"Error 1","serie":["el titular es la mitad de grande"]}', { texto: "Error 1" });
    expect(fuera).toMatchObject({ estado: "revisar", serie: ["el titular es la mitad de grande"], soloTexto: false });
    expect(resumenControl(fuera)).toBe("Revisar: se sale de la serie (el titular es la mitad de grande)");
    const ambas = leerControl('{"textoLeido":"Eror 1","serie":["otro margen"]}', { texto: "Error 1" });
    expect(ambas.soloTexto).toBe(true);
    expect(leerControl('{"textoLeido":"Error 1"}', { texto: "Error 1" }).serie).toBeUndefined();
  });
});
