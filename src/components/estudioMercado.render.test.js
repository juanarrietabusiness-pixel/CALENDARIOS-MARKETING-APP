import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { RevisionGeneral, RevisionProducto } from "./EstudioMercado";
import LenguajeCliente from "./LenguajeCliente";
import { limpiarGeneral, leerGeneral, limpiarDeProducto } from "../lib/estudioMercado";

// ============================================================
// Lo nuevo del estudio de mercado y «Lenguaje del cliente» se PINTAN (sin navegador: react-dom/server).
//
// El lint no ve un campo que se lee de algo indefinido: un estudio de ANTES no trae lo profundo ni los ángulos, y
// aquí revienta al renderizar si alguna pantalla lo da por hecho. No corren los efectos.
// ============================================================

const pintar = (componente, props) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");
const nada = () => {};

const DE_ANTES = limpiarGeneral({
  rubro: "Limpieza", resumen: "Mucha oferta informal.",
  perfiles: [{ nombre: "Mamá ocupada", quien: "Trabaja", dolor: "Manchas", aspiracion: "Casa limpia" }],
  deseos: [{ deseo: "Tranquilidad", porque: "Confianza" }], nivel: { dominante: "problema", porque: "x" },
  propuestaValor: "Como nuevo en un día", diferenciadores: ["Rápido"],
});

const PROFUNDO = leerGeneral(JSON.stringify({
  ...DE_ANTES,
  perfiles: [{ ...DE_ANTES.perfiles[0], trabajo: "Quiero que alguien de confianza limpie para no perder el sábado", intensidad: "alta" }],
  problemas: { externos: ["Manchas en el sofá"], internos: ["Vergüenza ante las visitas"], principal: "El sofá se ve viejo" },
  necesidad: { cree: "Un producto que quite manchas", real: "Que alguien lo haga bien una vez" },
  transformacion: { antes: "Tapa el sofá con una manta", despues: "Invita a la familia sin pena" },
  justificacion: "Sale más barato que un sofá nuevo",
  cansados: ["Fotos de antes y después trucadas"],
  competenciaIndirecta: [{ alternativa: "Hacerlo uno mismo con vinagre", porque: "Es barato" }],
  anunciosDelRubro: { nadie: ["La salud de los niños"] },
}));

const PRODUCTO = limpiarDeProducto({
  elementos: { publico: "Familias", problema: "Manchas", solucion: "Lavado a domicilio" },
  objeciones: [], pruebas: [], ganchos: {}, anuncio: {},
}, { nombre: "Lavado de muebles" });

describe("el estudio de mercado se pinta", () => {
  it("un estudio de antes, de lectura: sin el bloque nuevo; editable: con todos sus campos vacíos", () => {
    const lectura = pintar(RevisionGeneral, { general: DE_ANTES, editable: false, onEditar: nada });
    expect(lectura).toContain("Perfiles de comprador");
    expect(lectura).not.toContain("Lo que hay detrás de la compra");
    expect(lectura).not.toContain("Cuánto le pesa el problema");
    const editable = pintar(RevisionGeneral, { general: DE_ANTES, editable: true, onEditar: nada });
    expect(editable).toContain("Lo que hay detrás de la compra");
    expect(editable).toContain("El problema principal (el que más empuja a comprar)");
    expect(editable).toContain("Añadir otra forma de resolverlo");
    expect(editable).toContain("Lo que casi nadie hace (la oportunidad)");
    expect(editable).toContain("Cuánto le pesa el problema");
  });

  it("uno profundo, de lectura: sólo lo que tiene algo", () => {
    const html = pintar(RevisionGeneral, { general: PROFUNDO, editable: false, onEditar: nada });
    expect(html).toContain("Lo que hay detrás de la compra");
    expect(html).toContain("El sofá se ve viejo");
    expect(html).toContain("Que alguien lo haga bien una vez");
    expect(html).toContain("Hacerlo uno mismo con vinagre");
    expect(html).toContain("La salud de los niños");
    expect(html).toContain("Alta");
    expect(html).not.toContain("Añadir otra forma de resolverlo");
  });

  it("un producto sin ángulos ofrece «Proponer ángulos»; con ángulos en el borrador, se editan", () => {
    const sin = pintar(RevisionProducto, { id: "p1", estudio: PRODUCTO, producto: { nombre: "Lavado de muebles" }, client: { id: "c1" }, editable: false, onEditar: nada, onProponerAngulos: nada });
    expect(sin).toContain("Ángulos de venta");
    expect(sin).toContain("Todavía no tiene ángulos de venta.");
    expect(sin).toContain("Proponer ángulos");
    const conAngulos = { ...PRODUCTO, angulos: [{ nombre: "Sin perder el sábado", solucion: "Seca en 4 horas", ganchos: ["Limpio antes del almuerzo"], publico: "tibio" }] };
    const editando = pintar(RevisionProducto, { id: "p1", estudio: conAngulos, producto: { nombre: "Lavado de muebles" }, client: { id: "c1" }, editable: true, onEditar: nada });
    expect(editando).toContain("Sin perder el sábado");
    expect(editando).toContain("Limpio antes del almuerzo");
    expect(editando).toContain("Quitar este ángulo");
    expect(editando).toContain("Añadir un ángulo");
    expect(editando).not.toContain("Proponer ángulos");
    const leyendo = pintar(RevisionProducto, { id: "p1", estudio: conAngulos, producto: { nombre: "Lavado de muebles" }, client: { id: "c1" }, editable: false, onEditar: nada });
    expect(leyendo).toContain("Para quien ya interactuó (tibio)");
    expect(leyendo).not.toContain("Quitar este ángulo");
  });

  it("«Lenguaje del cliente»: el diálogo con lo que se puede pegar", () => {
    const html = pintar(LenguajeCliente, { client: { id: "c1", name: "Dcasa" }, onPropuesta: nada, onCerrar: nada });
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Reseñas o comentarios de sus clientes (opcional)");
    expect(html).toContain("Reseñas de 1 estrella de la competencia (opcional)");
    expect(html).toContain("Proponer la nota");
  });
});
