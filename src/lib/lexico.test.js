import { describe, it, expect } from "vitest";
import { limpiarLexico, lexicoDeTexto, textoDeLexico, lineaDeLexico, aplicarLexico, aplicarLexicoAlGuion, aplicarLexicoAlReel, prohibidasEn } from "./lexico.js";
import { dineroDe, preciosInventados, preciosPermitidos, erroresDePrecio } from "./fidelidad.js";
import { cantidadesDe } from "./revisionMes.js";

// ============================================================
// E23 · el léxico de la marca lo aplica el CÓDIGO; E21 · los precios salen del producto del video
// ============================================================

const BAMBU = [{ di: "fibras de bambú", nunca: ["bambú", "100% bambú"] }, { nunca: ["barato"] }];

describe("el léxico de la marca", () => {
  it("se escribe una regla por línea y se lee igual", () => {
    const l = lexicoDeTexto("fibras de bambú ← bambú, 100% bambú\nnunca: barato\n\nlínea sin forma");
    expect(l).toEqual(BAMBU);
    expect(lexicoDeTexto(textoDeLexico(l))).toEqual(l);
    expect(limpiarLexico([{ di: "x", nunca: ["x"] }, null, { di: "y" }])).toEqual([]);
  });
  it("cambia lo que nunca se dice por cómo se dice, sin tocar lo que ya está bien ni partes de otra palabra", () => {
    const r = aplicarLexico("Hechos de bambú. Bambú suave, 100% bambú y fibras de bambú. Bambusal no.", BAMBU);
    expect(r.texto).toBe("Hechos de fibras de bambú. Fibras de bambú suave, fibras de bambú y fibras de bambú. Bambusal no.");
    expect(r.cambios).toHaveLength(3);
    // Una palabra prohibida sin reemplazo no se quita (rompería la frase): se avisa.
    expect(aplicarLexico("Es barato", BAMBU).texto).toBe("Es barato");
    expect(prohibidasEn("Es barato", BAMBU)).toEqual(["barato"]);
    expect(lineaDeLexico(BAMBU)).toMatch(/LÉXICO DE LA MARCA.*di «fibras de bambú», nunca «bambú» ni «100% bambú».*nunca digas ni escribas «barato»/);
    expect(lineaDeLexico([])).toBe("");
  });
  it("en un video animado, a lo que se dice y a lo que se lee; en uno con canción, sólo a lo que se lee", () => {
    const guion = { escenas: [{ id: "e1", habla: "Pañales de bambú", pantalla: "Bambú", capas: [{ tipo: "texto", texto: "100% bambú" }, { tipo: "lista", items: ["bambú"] }] }] };
    const r = aplicarLexicoAlGuion(guion, BAMBU);
    expect(r.guion.escenas[0]).toMatchObject({ habla: "Pañales de fibras de bambú", pantalla: "Fibras de bambú" });
    expect(r.guion.escenas[0].capas.map((c) => c.texto ?? c.items[0])).toEqual(["fibras de bambú", "fibras de bambú"]);
    const cancion = aplicarLexicoAlGuion({ ...guion, cancion: { archivo: "a", duracion: 30 } }, BAMBU);
    expect(cancion.guion.escenas[0].habla).toBe("Pañales de bambú");
    expect(cancion.guion.escenas[0].pantalla).toBe("Fibras de bambú");
    expect(aplicarLexicoAlGuion(guion, []).guion).toBe(guion);
  });
  it("en un reel por planos: la voz, lo que se lee, el gancho y el caption", () => {
    const r = aplicarLexicoAlReel({ locucion: "Son de bambú.", gancho: "Bambú puro", planos: [{ escena: "x", dice: "de bambú", pantalla: "" }], descripcion: "Bambú" }, BAMBU);
    expect(r.reel).toMatchObject({ locucion: "Son de fibras de bambú.", gancho: "Fibras de bambú puro", descripcion: "Fibras de bambú" });
    expect(r.reel.planos[0].dice).toBe("de fibras de bambú");
  });
});

describe("los precios del video salen de su producto", () => {
  it("sólo dinero (no porcentajes) y la misma cuenta que la revisión del mes", () => {
    expect(dineroDe("$45 y 100% algodón, B/. 12.50")).toEqual(["45", "12.5"]);
    expect(cantidadesDe("20 % de descuento")).toEqual(["20%"]);
  });
  it("un precio que no es del producto del video (ni de la idea) es un error grave", () => {
    const wipes = { nombre: "Wipes", precio: "$45", oferta: "" };
    const permitidos = preciosPermitidos([wipes], ["Caja de 960 por $45"]);
    const guion = { escenas: [{ habla: "Solo $45 hoy", capas: [{ tipo: "cifra", prefijo: "$", valor: 45 }] }] };
    expect(erroresDePrecio(guion, permitidos)).toEqual([]);
    const otro = { escenas: [{ habla: "Solo $45", capas: [{ tipo: "texto", texto: "Pañales a $32,99" }] }] };
    const e = erroresDePrecio(otro, permitidos);
    expect(e[0]).toMatchObject({ donde: "precio" });
    expect(e[0].mensaje).toMatch(/\$32\.99.*nunca el de otro producto/i);
    expect(preciosInventados(["Ahorra 20%"], permitidos)).toEqual([]);
  });
});
