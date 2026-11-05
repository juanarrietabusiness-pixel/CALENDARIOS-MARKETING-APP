import { describe, it, expect } from "vitest";
import { dibujarLista, dibujarBurbuja, dibujarReloj, tiempoComoReloj } from "./motorComponentes.js";
import { formatearCifra } from "./motorPiezas.js";

/** Un contexto de mentira que apunta lo que se escribe y con qué transparencia. */
function lienzo() {
  const textos = [];
  let font = "10px x";
  let alfa = 1;
  const pila = [];
  const nada = () => {};
  const ctx = {
    get font() { return font; }, set font(v) { font = v; },
    get globalAlpha() { return alfa; }, set globalAlpha(v) { alfa = v; },
    measureText: (t) => ({ width: String(t).length * Number(/(\d+)px/.exec(font)?.[1] ?? 10) * 0.55 }),
    fillText: (t) => textos.push({ t, alfa }),
    save: () => pila.push(alfa), restore: () => { alfa = pila.pop() ?? 1; },
    beginPath: nada, arc: nada, fill: nada, stroke: nada, moveTo: nada, lineTo: nada, closePath: nada, translate: nada, rect: nada, clip: nada,
    fillRect: nada, drawImage: nada,
  };
  return { ctx, textos };
}
const ayudas = (vida) => ({
  w: 700, lado: 1080, maxAlto: 900, vida, titular: "T", cuerpo: "C",
  color: (t) => (String(t ?? "").startsWith("#") ? t : "#123456"), legible: () => "#FFFFFF", rect: () => {},
  partir: (_ctx, t) => [String(t)], imagen: () => null,
});

describe("los componentes que eran marcador", () => {
  it("la lista entra ESCALONADA: cada ítem `cada` segundos después del anterior", () => {
    const capa = { items: ["Uno", "Dos", "Tres"], numerada: true, cada: 0.5, color: "texto" };
    const al = (vida) => { const l = lienzo(); dibujarLista(l.ctx, capa, ayudas(vida)); return l.textos.filter((x) => ["Uno", "Dos", "Tres"].includes(x.t)).map((x) => x.t); };
    expect(al(0.1)).toEqual(["Uno"]);
    expect(al(0.6)).toEqual(["Uno", "Dos"]);
    expect(al(5)).toEqual(["Uno", "Dos", "Tres"]);
    // Al medir (sin vida) está todo puesto y ocupa una fila por ítem.
    const l = lienzo();
    const caja = dibujarLista(l.ctx, capa, ayudas(undefined));
    expect(caja.h).toBeGreaterThan(0);
    expect(l.textos.map((x) => x.t)).toEqual(["1", "Uno", "2", "Dos", "3", "Tres"]);
  });

  it("la burbuja escribe su texto y ocupa más alto que su texto (la colita)", () => {
    const l = lienzo();
    const caja = dibujarBurbuja(l.ctx, { texto: "¿Tienen envío?", lado: "der", color: "superficie" }, ayudas(1));
    expect(l.textos.map((x) => x.t)).toEqual(["¿Tienen envío?"]);
    expect(caja.h).toBeGreaterThan(1080 * 0.044 * 1.3);
  });

  it("el reloj cuenta: un contador de 0 a 90 s y una cuenta atrás, con el avance de la cuenta", () => {
    const al = (capa, avance) => { const l = lienzo(); dibujarReloj(l.ctx, capa, ayudas(1), avance); return l.textos[0].t; };
    expect(al({ modo: "contador", desde: 0, hasta: 90 }, 0.5)).toBe("0:45");
    expect(al({ modo: "cuenta_atras", desde: 3600, hasta: 0 }, 0)).toBe("1:00:00");
    expect(tiempoComoReloj(65)).toBe("1:05");
  });
});

describe("la cifra abreviada", () => {
  it("«412K», «3,2M», «4,5K»; sin abreviar, como siempre", () => {
    expect(formatearCifra(412000, 0, { abreviar: true })).toBe("412K");
    expect(formatearCifra(3200000, 0, { abreviar: true })).toBe("3,2M");
    expect(formatearCifra(4500, 0, { abreviar: true })).toBe("4,5K");
    expect(formatearCifra(5000, 0, { abreviar: true })).toBe("5K");
    expect(formatearCifra(-1200000, 0, { abreviar: true })).toBe("-1,2M");
    expect(formatearCifra(950, 0, { abreviar: true })).toBe("950");
    expect(formatearCifra(12500)).toBe("12.500");
  });
});
