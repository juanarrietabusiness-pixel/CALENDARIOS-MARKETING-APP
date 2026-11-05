import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import LoMejorTarjetas from "./LoMejorTarjetas";
import RecrearLoMejor from "./RecrearLoMejor";
import LoMejor from "../pages/LoMejor";
import BarraInferior from "./BarraInferior";
import Inspiracion from "./Inspiracion";
import SeccionScrapeCreators from "./SeccionScrapeCreators";

// ============================================================
// «Lo mejor» se PINTA (sin navegador: react-dom/server)
//
// Lo que el lint no ve y sí rompe la pantalla en producción —una prop que no llega,
// un campo que se lee de algo indefinido— revienta aquí al renderizar. No prueba los
// efectos (no corren en el servidor): prueba que la tarjeta, el diálogo de «Recrear
// para…» y la página entera se pintan con datos de verdad.
// ============================================================

const PIEZA = {
  clave: "ig:PEGO01", fuente: "inspiracion", red: "instagram", formato: "video", cuenta: "@mueblesx", texto: "El reel", idea: "Pregunta y respuesta",
  enlace: "https://www.instagram.com/reel/PEGO01/", fecha: "2026-11-03T10:00:00Z", miniatura: "/api/metricas/miniatura?u=x", video: "/api/lo-mejor/video?u=y",
  conVideo: true, clientes: ["c1", "c2"], tambien: ["referencia"], percentil: 95, cifra: { texto: "rinde 6,5×", detalle: "900 me gusta" },
  tipo: "ugc", tipoNombre: "UGC con rostro", caminos: ["imagen", "carrusel", "animado", "grabar"], caminoSugerido: "grabar",
};
const CLIENTES = [{ id: "c1", name: "Dcasa" }, { id: "c2", name: "Rofer" }];
/** El HTML sin las marcas entre trozos de texto que pone React al pintar en el servidor. */
const pintar = (componente, props) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");

describe("«Lo mejor» se pinta", () => {
  it("la tarjeta: la cifra, el tipo, el video y «Recrear para…»", () => {
    const html = pintar(LoMejorTarjetas, { piezas: [PIEZA, { ...PIEZA, clave: "fb-ad:1", fuente: "anuncio", video: "", conVideo: false }], clientes: CLIENTES });
    expect(html).toContain("rinde 6,5×");
    expect(html).toContain("UGC con rostro");
    expect(html).toContain("<video");
    expect(html).toContain("Recrear para Dcasa");
    expect(html).toContain("Ver el original");
  });

  it("de sólo lectura, sin acciones", () => {
    const html = renderToString(createElement(LoMejorTarjetas, { piezas: [PIEZA], clientes: CLIENTES, lectura: true }));
    expect(html).not.toContain("Recrear para");
  });

  it("el diálogo de «Recrear para…» con sus caminos", () => {
    const html = renderToString(createElement(RecrearLoMejor, { pieza: PIEZA, clientes: CLIENTES, clienteInicial: "c1", onCerrar: () => {} }));
    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("Guion para grabar");
    expect(html).toContain("sugerido");
  });

  it("la página y la barra del móvil", () => {
    expect(renderToString(createElement(LoMejor, { clients: CLIENTES }))).toContain("Lo mejor del momento");
    const barra = renderToString(createElement(BarraInferior, { ruta: { vista: "lo-mejor" }, onLoMejor: () => {}, onMiDia: () => {}, onCalendario: () => {}, onChat: () => {}, onSubir: () => {}, onMas: () => {} }));
    expect(barra).toContain("Lo mejor");
    expect(barra).not.toContain("Enlace");
  });

  it("la pestaña Inspiración de un cliente (y el ojo del calendario) es «Lo mejor» filtrado", () => {
    const cliente = { id: "c1", name: "Dcasa", competidores: [] };
    expect(pintar(Inspiracion, { client: cliente, modo: "pestana", onPersistClient: () => {}, onLlevar: async () => true })).toContain("Lo mejor · Dcasa");
    expect(pintar(Inspiracion, { client: cliente, modo: "panel", onCerrar: () => {}, llevarRef: { current: null } })).toContain("Cerrar Lo mejor");
  });

  it("Ajustes: el tope de créditos de Scrape Creators", () => {
    expect(renderToString(createElement(SeccionScrapeCreators, { esAdmin: true }))).toContain("Scrape Creators");
  });
});
