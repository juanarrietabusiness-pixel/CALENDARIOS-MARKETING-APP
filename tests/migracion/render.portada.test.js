import { describe, it, expect } from "vitest";
import { portadaDelVideo, conConPortada } from "../../worker/lib/estudio/render.js";
import { EJEMPLO_GUION } from "../../src/lib/videoFormatoIA.js";
import { validarGuion, lineaDeTiempo } from "../../src/lib/videoEscenas.js";
import { capasDe, textoPrincipal, tiemposDeEscena, estadoDeCapa } from "../../src/lib/motorVideo.js";

// ============================================================
// La portada de un reel animado
//
// Lo que importa: sin imagen de portada, Instagram enseña el cuadro de `thumb_offset` y, sin él, el primero. En el
// primer cuadro el texto del gancho todavía no entró (alfa 0): en el perfil se veía sólo el fondo. Ahora el render
// apunta el instante en que la primera escena está llena, y el texto del gancho se ve ENTERO ahí.
// ============================================================

const guion = validarGuion(EJEMPLO_GUION).guion;

describe("la portada de un reel animado", () => {
  it("cae donde el texto del gancho se ve entero, y no en el primer cuadro, donde todavía no está", () => {
    const ms = portadaDelVideo(guion, null);
    expect(ms).toBeGreaterThan(0);
    const linea = lineaDeTiempo(guion, null);
    const escena = guion.escenas[0];
    const capas = capasDe(escena);
    const gancho = textoPrincipal(capas);
    const cuando = tiemposDeEscena(capas, linea.escenas[0], true).get(gancho.id);
    const ritmo = { ritmo: guion.estilo?.ritmo ?? "medio" };
    expect(estadoDeCapa(gancho, cuando, 0, ritmo)).toBeNull();
    const enLaPortada = estadoDeCapa(gancho, cuando, ms / 1000, ritmo);
    expect(enLaPortada?.alfa).toBe(1);
    expect(ms / 1000).toBeLessThan(linea.escenas[0].hasta);
  });

  it("se pone en un reel sin imagen de portada y nunca pisa la imagen que eligió la persona", () => {
    expect(conConPortada({ format: "reel" }, 1800)).toEqual({ format: "reel", portadaMs: 1800 });
    expect(conConPortada({ format: "reel", portadaMs: 900 }, 1800).portadaMs).toBe(1800);
    const conImagen = { format: "reel", portada: "/api/media/x.jpg", portadaMs: 400 };
    expect(conConPortada(conImagen, 1800)).toBe(conImagen);
    const post = { format: "post" };
    expect(conConPortada(post, 1800)).toBe(post);
    expect(conConPortada({ format: "reel" }, null)).toEqual({ format: "reel" });
  });

  it("un guion vacío no da portada", () => {
    expect(portadaDelVideo(null)).toBeNull();
    expect(portadaDelVideo({ escenas: [] })).toBeNull();
  });
});
