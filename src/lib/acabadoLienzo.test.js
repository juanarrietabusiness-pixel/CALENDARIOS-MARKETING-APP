import { describe, it, expect } from "vitest";
import { dibujarTextoPlantilla, dibujarLogo, letraDe } from "./acabadoLienzo.js";
import { posicionLogo } from "./logoEncima.js";

/** Un contexto 2D de mentira: apunta lo que se escribe y dónde, y mide cada letra a 0,5 del tamaño de la fuente. */
function lienzo() {
  const hechos = { textos: [], rects: [], imagenes: [] };
  let tam = 10;
  const ctx = {
    hechos,
    set font(f) { tam = Number(/(\d+)px/.exec(f)?.[1] ?? 10); this._font = f; },
    get font() { return this._font; },
    measureText: (t) => ({ width: t.length * tam * 0.5 }),
    fillText: (t, x, y) => hechos.textos.push({ t, x, y, font: ctx._font }),
    fillRect: (...r) => hechos.rects.push(r),
    createLinearGradient: () => ({ addColorStop() {} }),
    beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {},
    drawImage: (img, ...r) => hechos.imagenes.push(r),
  };
  return ctx;
}

describe("el acabado que comparten la pantalla y el Container", () => {
  it("el texto de la plantilla: el titular grande y el apoyo debajo, en la banda de abajo con la letra pedida", () => {
    const ctx = lienzo();
    dibujarTextoPlantilla(ctx, { ancho: 1080, alto: 1350, texto: "Tus lentes en 40 minutos\nCiudad de Panamá", plantilla: "banda", colores: { fondo: "#D91B19", texto: "#FFFFFF", acento: "#C5A059" }, letra: letraDe("Oswald", "Roboto, sans-serif") });
    const [titular, ...resto] = ctx.hechos.textos;
    expect(titular.font).toMatch(/^800 78px "Oswald", Roboto, sans-serif$/);
    expect(resto.at(-1).t).toBe("Ciudad de Panamá");
    expect(resto.at(-1).font).toMatch(/^500 41px/);
    // En la banda de abajo: todo el texto en la mitad inferior.
    expect(ctx.hechos.textos.every((x) => x.y > 1350 / 2)).toBe(true);
  });

  it("arriba, el texto va en la parte de arriba", () => {
    const ctx = lienzo();
    dibujarTextoPlantilla(ctx, { ancho: 1080, alto: 1350, texto: "Hola\nMundo", plantilla: "arriba", colores: { fondo: "#000000", texto: "#FFFFFF", acento: "#FF0000" }, letra: letraDe("") });
    expect(ctx.hechos.textos.every((x) => x.y < 1350 / 3)).toBe(true);
  });

  it("el logo, en la esquina y al tamaño del kit (la misma cuenta que `posicionLogo`)", () => {
    const ctx = lienzo();
    const caja = dibujarLogo(ctx, { width: 400, height: 200 }, { ancho: 1080, alto: 1350, posicion: { esquina: "arriba-derecha", tamano: 0.2 } });
    expect(caja).toEqual(posicionLogo({ ancho: 1080, alto: 1350, logoAncho: 400, logoAlto: 200, esquina: "arriba-derecha", tamano: 0.2 }));
    expect(ctx.hechos.imagenes[0]).toEqual([caja.x, caja.y, caja.w, caja.h]);
  });

  it("la letra: la de la marca primero (sin comillas ni respaldos propios) y luego la de respaldo", () => {
    expect(letraDe('Montserrat, "Arial"')).toMatch(/^"Montserrat", system-ui/);
    expect(letraDe("", "Roboto")).toBe("Roboto");
  });
});
