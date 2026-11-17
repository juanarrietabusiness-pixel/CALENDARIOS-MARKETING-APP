import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import MejorarVideo from "./MejorarVideo";
import NuevosGanchos from "./NuevosGanchos";
import CrearConPlantilla from "./CrearConPlantilla";
import { COLORES } from "../lib/coloresVideo";

// ============================================================
// «Mejorar mi video» se PINTA (sin navegador: react-dom/server; no corren los efectos): los cuatro modos, el look
// escogido por defecto con su texto, el video que se mejora y el botón del costo (nunca «crear» sin verlo).
// ============================================================

const pintar = (props, componente = MejorarVideo) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");
const nada = () => {};

describe("Mejorar mi video", () => {
  it("los seis modos y el video; arranca en «Color», gratis, con sus colores", () => {
    const html = pintar({ clienteId: "c1", archivo: { id: "v1", src: "/api/media/clientes/c1/estudio/v1.mp4" }, onCerrar: nada });
    for (const t of ["Color", "Escalar", "Look y luz", "Cambiar algo", "Varios ángulos", "Alargar"]) expect(html).toContain(t);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("/api/media/clientes/c1/estudio/v1.mp4");
    expect(html).toContain("Poner el color (gratis)");
    for (const c of COLORES.slice(0, 3)) expect(html).toContain(c.nombre);
    expect(html).not.toContain("Sí, hacerlo");
  });

  it("Nuevos ganchos: las tres formas, el momento fuerte y «Escribirlos con IA»", () => {
    const html = pintar({ clienteId: "c1", archivo: { id: "v1", src: "/api/media/v.mp4" }, onCerrar: nada }, NuevosGanchos);
    for (const t of ["Con el momento fuerte", "Entrada nueva con IA", "Cierre nuevo con IA", "Escribirlos con IA", "Usar el segundo que se ve"]) expect(html).toContain(t);
  });

  it("Plantillas de moda: las cuatro, y la de comentarios abierta", () => {
    const html = pintar({ client: { id: "c1", calendars: [] }, onCreado: nada, onCancelar: nada }, CrearConPlantilla);
    for (const t of ["Respondo tu comentario", "Búsqueda", "Producto que salta", "Logo sobre fondos", "El comentario", "Crear el video (gratis)"]) expect(html).toContain(t);
  });
});
