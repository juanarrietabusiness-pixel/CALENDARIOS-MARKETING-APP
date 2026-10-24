import { describe, it, expect } from "vitest";
import { MANUAL_VIDEO_BASE, manualDeVideo, lineaDelDirector, pedidoDelDirector, leerDirector } from "./directorVideo";
import { pedidoDeReel } from "./reel";
import { pedidoDeAdaptacion } from "./estudioMercado";
import { limpiarManual } from "./estratega";

describe("el director comercial de los videos", () => {
  it("vale el criterio de la agencia o, vacío, el de la casa; el manual lo guarda", () => {
    expect(manualDeVideo(null)).toBe(MANUAL_VIDEO_BASE);
    expect(manualDeVideo({ video: "  - Siempre una mamá real.  " })).toBe("- Siempre una mamá real.");
    expect(lineaDelDirector({ video: "- X" })).toMatch(/^CRITERIO COMERCIAL DE LA AGENCIA \(síguelo siempre, por encima de cómo venga escrito el pedido/);
    expect(limpiarManual({ video: "- Siempre una mamá real." }).video).toBe("- Siempre una mamá real.");
  });

  it("va en todo guion de video: el del Reel IA y el de recrear un anuncio", () => {
    const criterio = lineaDelDirector(null);
    expect(pedidoDeReel({ idea: "El sofá", criterio })).toContain("CRITERIO COMERCIAL DE LA AGENCIA");
    expect(pedidoDeReel({ idea: "El sofá" })).not.toContain("CRITERIO COMERCIAL");
    const ref = { id: "r1", analisis: { gancho: "g" } };
    expect(pedidoDeAdaptacion({ marca: "Dcasa", referencia: ref, formato: "reel", criterio })).toContain("CRITERIO COMERCIAL DE LA AGENCIA");
    // En una imagen, no: es para video.
    expect(pedidoDeAdaptacion({ marca: "Dcasa", referencia: ref, formato: "post", criterio })).not.toContain("CRITERIO COMERCIAL");
  });

  it("la revisión mejora sin cambiar la intención, dice por qué, y se lee", () => {
    const p = pedidoDelDirector({ marca: "Dcasa", idea: "un video del sofá", producto: "Sofá cama · $399", segundos: 15 });
    expect(p).toContain("Respeta la intención de quien lo pidió");
    expect(p).toContain("EL PEDIDO: un video del sofá");
    expect(p).toContain("$399");
    expect(p).toContain("de 15 segundos");
    expect(leerDirector('Listo: {"idea":"Una mamá derrama jugo…","cambios":["Gancho visual en 2 s","Cierre con WhatsApp"]}'))
      .toEqual({ idea: "Una mamá derrama jugo…", cambios: ["Gancho visual en 2 s", "Cierre con WhatsApp"] });
    expect(leerDirector("{}")).toBeNull();
    expect(leerDirector("nada")).toBeNull();
  });
});
