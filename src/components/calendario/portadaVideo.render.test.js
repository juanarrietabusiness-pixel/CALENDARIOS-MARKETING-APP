import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PortadaVideo } from "./editorPublicacion";
import GaleriaSelector from "../GaleriaSelector";

// ============================================================
// «Portada del video» con «De la galería» se PINTA (sin navegador: react-dom/server)
//
// No corren los efectos: se prueba que el botón está (con cliente), que el selector de la galería tiene su modo de UNA
// imagen con sus textos, y que el de siempre no cambia.
// ============================================================

const pintar = (componente, props) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");
const nada = () => {};
const video = { src: "/api/media/clientes/c1/posts/v.mp4", tipo: "video" };

describe("la portada del reel, de la galería", () => {
  it("«Portada del video» ofrece el fotograma, subir una imagen y «De la galería» (sólo con cliente)", () => {
    const html = pintar(PortadaVideo, { id: "x", video, post: { id: "p1", format: "reel" }, clientId: "c1", onPortada: nada, onCerrar: nada });
    expect(html).toContain("Portada del video");
    expect(html).toContain("Usar este fotograma");
    expect(html).toContain("Subir una imagen");
    expect(html).toContain("De la galería");
    const sin = pintar(PortadaVideo, { id: "x", video, post: { id: "p1", format: "reel" }, clientId: "", onPortada: nada, onCerrar: nada });
    expect(sin).not.toContain("De la galería");
  });

  it("el selector de la galería en modo de UNA imagen dice que es la portada; el de siempre, no", () => {
    const una = pintar(GaleriaSelector, { clienteId: "c1", una: true, onElegir: nada, onCerrar: nada });
    expect(una).toContain("Escoger la portada de la galería");
    expect(una).toContain("Escoge una imagen");
    expect(una).not.toContain("Reemplazar lo que ya tiene");
    const siempre = pintar(GaleriaSelector, { clienteId: "c1", yaTiene: 2, onElegir: nada, onCerrar: nada });
    expect(siempre).toContain("Escoger de la galería");
    expect(siempre).toContain("Reemplazar lo que ya tiene (2)");
  });
});
