import { describe, it, expect } from "vitest";
import { ventanaCuadricula } from "./medios.js";

// El cuadro del perfil de un reel: Instagram enseña la ventana 3:4 del CENTRO de
// la portada y la API no deja elegir otra. «Encuadre en el perfil» mueve la imagen.
describe("la ventana del perfil de una portada vertical", () => {
  it("en el centro no se mueve nada: la ventana 3:4 queda en el medio", () => {
    expect(ventanaCuadricula(1080, 1920, 0)).toEqual({ desplazamiento: 0, arriba: 0.125, alto: 0.75 });
  });

  it("arriba y abajo mueven como mucho la mitad de lo que sobra (240 px en 1080×1920)", () => {
    expect(ventanaCuadricula(1080, 1920, -1)).toMatchObject({ desplazamiento: -240, arriba: 0 });
    expect(ventanaCuadricula(1080, 1920, 1)).toMatchObject({ desplazamiento: 240, arriba: 0.25 });
    expect(ventanaCuadricula(1080, 1920, 5).desplazamiento).toBe(240);
  });

  it("un video que ya es 3:4 o más ancho no tiene nada que deslizar", () => {
    expect(ventanaCuadricula(1080, 1440, 1).desplazamiento).toBe(0);
    expect(ventanaCuadricula(1080, 1080, -1)).toMatchObject({ desplazamiento: 0, alto: 1 });
  });
});
