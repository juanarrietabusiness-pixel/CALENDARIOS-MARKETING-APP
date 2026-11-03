import { describe, it, expect } from "vitest";
import { datosDeTexto, datosQueNoCuadran, normalizarTelefono } from "./datosCerebro";

describe("datosCerebro", () => {
  it("lee los teléfonos de Panamá en sus formas de siempre", () => {
    const { telefonos } = datosDeTexto("WhatsApp +507 6086-6581 · fijo 225-1234 · 60866581 · otro 6086 6581");
    expect([...telefonos].sort()).toEqual(["2251234", "60866581"]);
  });

  it("no confunde precios, años ni códigos con teléfonos", () => {
    const { telefonos } = datosDeTexto("Desde $1250.00 en 2026, referencia 12345678, 3 cuotas de 1.250");
    expect([...telefonos]).toEqual([]);
  });

  it("salta la línea que dice que el número ya no vale", () => {
    const { telefonos } = datosDeTexto("Reemplaza al número anterior 61562010.\nNuevo: 6086-6581");
    expect([...telefonos]).toEqual(["60866581"]);
  });

  it("normaliza con y sin +507", () => {
    expect(normalizarTelefono("+507 6086-6581")).toBe("60866581");
    expect(normalizarTelefono("2026")).toBe("");
  });

  it("encuentra el WhatsApp viejo de la ficha técnica (el caso de ROFER)", () => {
    const r = datosQueNoCuadran([
      { fuente: "nota", titulo: "Datos del negocio", texto: "Contacto: WhatsApp +507 6086-6581 (nuevo; reemplaza al anterior)" },
      { fuente: "nota", titulo: "WhatsApp oficial", texto: "El WhatsApp es 6086-6581. Reemplaza al número anterior 61562010." },
      { fuente: "ficha", titulo: "Ficha técnica", texto: "**Contacto y redes**\nWhatsApp: 61562010 [[datos]]" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "telefono", valor: "6156-2010", en: ["Ficha técnica"], vigentes: ["6086-6581"] });
  });

  it("no avisa cuando todo coincide, ni sin notas con qué comparar", () => {
    expect(datosQueNoCuadran([
      { fuente: "nota", titulo: "A", texto: "Tel 6086-6581 · hola@marca.com" },
      { fuente: "cifras", titulo: "Cifras", texto: "- WhatsApp: 6086-6581\n- Correo: HOLA@marca.com" },
    ])).toEqual([]);
    expect(datosQueNoCuadran([{ fuente: "cliente", titulo: "", texto: "6086-6581" }])).toEqual([]);
  });

  it("también mira los correos y las memorias del asistente", () => {
    const r = datosQueNoCuadran([
      { fuente: "nota", titulo: "Contacto", texto: "ventas@nueva.com" },
      { fuente: "memoria", titulo: "", texto: "Recordar: el correo es ventas@otra.com" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe("correo");
    expect(r[0].en[0]).toMatch(/^Memoria del asistente/);
  });
});
