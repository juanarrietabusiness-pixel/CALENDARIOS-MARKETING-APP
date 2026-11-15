import { describe, it, expect } from "vitest";
import { datosDeTexto, datosQueNoCuadran, normalizarTelefono, centimos, preciosDeLinea, productosDelCatalogo } from "./datosCerebro";

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

  it("lee los importes en sus formas de siempre", () => {
    expect([centimos("1,250.00"), centimos("1.250,00"), centimos("25,5"), centimos("1.250"), centimos("50")]).toEqual([125000, 125000, 2550, 125000, 5000]);
    expect(preciosDeLinea("Cuesta 30 dólares o 25,50 USD, B/. 12")).toEqual([3000, 2550, 1200]);
    // Lo que va después de «antes», «anterior»… no vale.
    expect(preciosDeLinea("- Pañal RN: $55 (antes $50)")).toEqual([5500]);
    expect(preciosDeLinea("Antes $50, ahora $45")).toEqual([4500]);
  });

  it("lee los productos del catálogo con todos sus importes (precio y oferta)", () => {
    const cat = "Productos y servicios vigentes.\n\n- Pañal RN (producto) · precio: $55 · oferta: 2 por $100\n- Sofá (producto) · precio: sin definir";
    expect(productosDelCatalogo(cat)).toEqual([
      { nombre: "Pañal RN", clave: "panal rn", precios: [5500, 10000] },
      { nombre: "Sofá", clave: "sofa", precios: [] },
    ]);
  });

  it("los precios los manda el catálogo: avisa del precio viejo de las cifras, no de lo que cuadra ni de lo que no es del catálogo", () => {
    const r = datosQueNoCuadran([
      { fuente: "catalogo", titulo: "Productos y servicios", texto: "- Pañal RN (producto) · precio: $55\n- Sofá cama (producto) · precio: B/. 450\n- Sofá (producto) · precio: sin definir" },
      { fuente: "cifras", titulo: "Cifras vigentes", texto: "- Pañal RN: $50 [[precios]]\n- Sofá cama: $450\n- Sofá: $300\n- Envío: $5" },
      { fuente: "nota", titulo: "Precios", texto: "Pañal RN a $40" },
    ]);
    expect(r).toEqual([
      expect.objectContaining({ tipo: "precio", producto: "Pañal RN", valor: "$50", en: ["Cifras vigentes"], vigentes: ["$55"] }),
      expect.objectContaining({ tipo: "precio", producto: "Sofá", valor: "$300", vigentes: [] }),
    ]);
  });

  it("sin catálogo no hay con qué comparar los precios", () => {
    expect(datosQueNoCuadran([{ fuente: "cifras", titulo: "Cifras", texto: "- Pañal RN: $50" }])).toEqual([]);
  });
});
