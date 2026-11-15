import { describe, it, expect } from "vitest";
import { numeroWhatsApp, enlaceWhatsApp, cuandoLoAbrio } from "./enviarCliente.js";

describe("el WhatsApp de la ficha del cliente", () => {
  it("lo que se escribe a mano: con o sin código de país, con guiones o un enlace wa.me", () => {
    expect(numeroWhatsApp("+507 6123-4567")).toBe("50761234567");
    expect(numeroWhatsApp("6123 4567")).toBe("50761234567");
    expect(numeroWhatsApp("https://wa.me/50761234567")).toBe("50761234567");
    expect(numeroWhatsApp("https://api.whatsapp.com/send?phone=573001234567")).toBe("573001234567");
    expect(numeroWhatsApp("")).toBe("");
    expect(numeroWhatsApp("123")).toBe("");
  });

  it("«Abrir en WhatsApp» lleva el mensaje escrito; sin número, se escoge el chat", () => {
    expect(enlaceWhatsApp("6123-4567", "Hola, aquí está:\nhttps://x.test/aprobar?t=1"))
      .toBe("https://wa.me/50761234567?text=Hola%2C%20aqu%C3%AD%20est%C3%A1%3A%0Ahttps%3A%2F%2Fx.test%2Faprobar%3Ft%3D1");
    expect(enlaceWhatsApp("", "Hola")).toBe("https://wa.me/?text=Hola");
  });
});

describe("cuándo abrió el cliente su enlace (hora de Panamá)", () => {
  const ahora = new Date("2026-11-12T15:00:00Z"); // jueves 12, 10:00 en Panamá
  it("hoy, ayer, esta semana por el día, y antes por la fecha", () => {
    expect(cuandoLoAbrio("2026-11-12T14:12:00Z", ahora)).toMatch(/^hoy a las 9:12/);
    expect(cuandoLoAbrio("2026-11-11T20:30:00Z", ahora)).toMatch(/^ayer a las 3:30/);
    expect(cuandoLoAbrio("2026-11-10T14:12:00Z", ahora)).toMatch(/^el martes a las 9:12/);
    expect(cuandoLoAbrio("2026-11-01T14:12:00Z", ahora)).toMatch(/^el 1 de noviembre a las 9:12/);
    expect(cuandoLoAbrio(null, ahora)).toBe("");
  });
});
