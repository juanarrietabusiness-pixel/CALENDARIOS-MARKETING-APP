import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import MejorarVideo from "./MejorarVideo";
import { LOOKS } from "../lib/mejoraVideo";

// ============================================================
// «Mejorar mi video» se PINTA (sin navegador: react-dom/server; no corren los efectos): los cuatro modos, el look
// escogido por defecto con su texto, el video que se mejora y el botón del costo (nunca «crear» sin verlo).
// ============================================================

const pintar = (props) => renderToString(createElement(MejorarVideo, props)).replace(/<!-- -->/g, "");
const nada = () => {};

describe("Mejorar mi video", () => {
  it("los cuatro modos, el video y «Ver cuánto cuesta» (no crea nada sin el costo)", () => {
    const html = pintar({ clienteId: "c1", archivo: { id: "v1", src: "/api/media/clientes/c1/estudio/v1.mp4" }, onCerrar: nada });
    for (const t of ["Escalar", "Look y luz", "Cambiar algo", "Varios ángulos"]) expect(html).toContain(t);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("/api/media/clientes/c1/estudio/v1.mp4");
    expect(html).toContain("Ver cuánto cuesta");
    expect(html).toContain(LOOKS[0].nombre);
    expect(html).not.toContain("Sí, hacerlo");
  });
});
