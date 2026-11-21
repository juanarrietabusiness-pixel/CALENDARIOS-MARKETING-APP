import { describe, it, expect } from "vitest";
import { telefonosDe, usuariosDe, contactoParaElVideo, esNotaDeDatos, listaDeControl } from "./guiaEdicion.js";

const NOTA = { titulo: "Brand guidelines — Datos del negocio", texto: "WhatsApp: +507 6086-6581 (desde el 2026-10-09). Instagram @roferservice." };

describe("la guía de edición: el contacto", () => {
  it("los teléfonos se comparan por sus últimos 8 dígitos, escritos como sea", () => {
    expect(telefonosDe("+507 6086-6581 o 60866581 y 6156 2010")).toEqual([
      { clave: "60866581", escrito: "+507 6086-6581" }, { clave: "61562010", escrito: "6156 2010" },
    ]);
    expect(telefonosDe("el 2026 y 14 equipos")).toEqual([]);
    expect(usuariosDe("síguenos en @RoferService. y (@otra_cuenta)")).toEqual(["roferservice", "otra_cuenta"]);
    expect(esNotaDeDatos("Brand guidelines — Datos del negocio")).toBe(true);
    expect(esNotaDeDatos("Ficha técnica")).toBe(false);
  });

  it("Rofer: manda la nota; la Ficha técnica y la ficha del cliente con el viejo se avisan", () => {
    const c = contactoParaElVideo({ notaDatos: NOTA, fichaTecnica: "- WhatsApp: 61562010 [[datos]]", cliente: { whatsapp: "61562010", instagram: "roferservice" } });
    expect(c.telefonos.map((t) => t.escrito)).toEqual(["+507 6086-6581"]);
    expect(c.usuarios).toEqual(["roferservice"]);
    expect(c.fuente).toMatch(/Datos del negocio/);
    expect(c.avisos).toHaveLength(2);
    expect(c.avisos[0]).toMatch(/La Ficha técnica dice 61562010 .*manda la nota/);
    expect(c.avisos[1]).toMatch(/ficha del cliente \(61562010\)/);
  });

  it("si coinciden no avisa; sin nota, la ficha del cliente con un aviso", () => {
    expect(contactoParaElVideo({ notaDatos: NOTA, fichaTecnica: "6086 6581", cliente: { whatsapp: "+50760866581" } }).avisos).toEqual([]);
    const sin = contactoParaElVideo({ cliente: { whatsapp: "6156-2010", instagram: "https://instagram.com/rofer/" } });
    expect(sin.telefonos[0].clave).toBe("61562010");
    expect(sin.usuarios).toEqual(["rofer"]);
    expect(sin.avisos[0]).toMatch(/No hay nota «Datos del negocio»/);
  });

  it("la lista de control lleva los números del oficio", () => {
    const l = listaDeControl().join("\n");
    expect(l).toMatch(/−14 LUFS/);
    expect(l).toMatch(/−1,2 dBTP/);
    expect(l).toMatch(/14 %.*20 %/);
    expect(l).toMatch(/hasta 4 palabras/);
  });
});
