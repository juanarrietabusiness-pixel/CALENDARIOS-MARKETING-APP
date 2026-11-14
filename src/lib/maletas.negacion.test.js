import { describe, it, expect } from "vitest";
import { diceQueNo, estadoDeMaleta } from "./maletas.js";

// La negación en cualquier parte del texto (hallazgo 3 del 14-nov): «En lo que sabemos no aparecen testimonios; hay
// que pedírselos al cliente» salía en VERDE. Casos de las dos clases: lo que dice que falta y lo que sólo lo parece.
describe("una maleta que dice que todavía no hay", () => {
  const rojas = [
    "En lo que sabemos no aparecen testimonios; hay que pedírselos al cliente",
    "No tenemos garantía todavía",
    "Sin testimonios",
    "[completar: los testimonios del cliente]",
    "Pendiente de confirmar con el cliente",
    "No hay.",
    "Por definir con el dueño",
    "Todavía no hay reseñas de clientes que se puedan usar en los anuncios",
  ];
  const verdes = [
    "No hay quien lave muebles a domicilio en la ciudad y la gente pierde el sábado entero",
    "No hay otro igual en Panamá: tela importada de Italia y armado a mano en 48 horas",
    "El cliente no tiene tiempo para limpiar sus muebles y los ve manchados cada día",
    "A las mamás les falta tiempo para cocinar sano entre semana y terminan pidiendo comida rápida",
    "Garantía de 30 días por defectos de fábrica; se pide por WhatsApp con una foto del daño",
  ];
  it.each(rojas)("rojo: «%s»", (t) => {
    expect(diceQueNo(t)).toBe(true);
    expect(estadoDeMaleta("testimonios", t).estado).toBe("rojo");
  });
  it.each(verdes)("no es una negación: «%s»", (t) => {
    expect(diceQueNo(t)).toBe(false);
    expect(estadoDeMaleta("problema", t).estado).not.toBe("rojo");
  });
});

describe("las objeciones", () => {
  it("una objeción sin su respuesta deja la maleta en ámbar, aunque haya otras respondidas", () => {
    const objeciones = [
      { objecion: "¿Y si no me queda?", respuesta: "Cambio gratis en 7 días." },
      { objecion: "¿Hacen envíos?", respuesta: "A todo Panamá en 48 horas." },
      { objecion: "Es caro", respuesta: "" },
    ];
    expect(estadoDeMaleta("objeciones", "", { objeciones }).estado).toBe("ambar");
    expect(estadoDeMaleta("objeciones", "", { objeciones: objeciones.slice(0, 2) }).estado).toBe("verde");
    expect(estadoDeMaleta("objeciones", "", { objeciones: [{ objecion: "Es caro", respuesta: "Por confirmar" }, ...objeciones.slice(0, 2)] }).estado).toBe("ambar");
  });
});
