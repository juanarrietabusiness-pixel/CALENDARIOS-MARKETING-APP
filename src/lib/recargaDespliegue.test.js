import { describe, it, expect } from "vitest";
import { esFalloDeCarga, recargarUnaVez, ESPERA_RECARGA, vigilarDespliegue } from "./recargaDespliegue.js";

const T = 1_763_200_000_000;
const memoria = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

describe("la pantalla en blanco tras un despliegue", () => {
  it("reconoce un trozo que no se pudo descargar, lo diga el navegador que lo diga", () => {
    expect(esFalloDeCarga(new TypeError("Failed to fetch dynamically imported module: https://x/assets/Estudio-abc.js"))).toBe(true);
    expect(esFalloDeCarga(new TypeError("Importing a module script failed."))).toBe(true);
    expect(esFalloDeCarga(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(esFalloDeCarga(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
    expect(esFalloDeCarga({ name: "ChunkLoadError" })).toBe(true);
    expect(esFalloDeCarga(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(esFalloDeCarga(null)).toBe(false);
  });

  it("recarga una vez y no entra en bucle: la segunda, dentro del plazo, no recarga", () => {
    const almacen = memoria();
    let recargas = 0;
    const recargar = () => { recargas++; };
    expect(recargarUnaVez({ almacen, ahora: T, recargar })).toBe(true);
    expect(recargarUnaVez({ almacen, ahora: T + ESPERA_RECARGA - 1, recargar })).toBe(false);
    expect(recargas).toBe(1);
    // Pasado el plazo (otro despliegue), sí.
    expect(recargarUnaVez({ almacen, ahora: T + ESPERA_RECARGA + 1, recargar })).toBe(true);
    expect(recargas).toBe(2);
  });

  it("sin almacenamiento no recarga: no podría saber si ya lo hizo", () => {
    const roto = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} };
    let recargas = 0;
    expect(recargarUnaVez({ almacen: roto, recargar: () => { recargas++; } })).toBe(false);
    expect(recargas).toBe(0);
  });

  it("el aviso de Vite (`vite:preloadError`) se escucha", () => {
    const oidos = [];
    vigilarDespliegue({ addEventListener: (tipo) => oidos.push(tipo) });
    expect(oidos).toEqual(["vite:preloadError"]);
  });
});
