import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import VariacionesAnuncio from "./VariacionesAnuncio";
import DesgloseVideo from "./DesgloseVideo";
import { AlertasDelDia } from "./anuncios/Revision3Q";
import { leerDeconstruccion } from "../lib/deconstructor";
import { alertasDelDia } from "../lib/alertas3q";
import { sumarDias } from "../lib/agenda";
import { ACCION_MENSAJE } from "../lib/anuncios";

// ============================================================
// Las pantallas nuevas de lo sacado de los archivos del curso se PINTAN (sin navegador: react-dom/server). El lint no
// ve un campo que se lee de algo indefinido; aquí revienta al renderizar. No corren los efectos.
// ============================================================

const pintar = (componente, props) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");
const nada = () => {};

describe("Variaciones para anuncios", () => {
  it("se pinta con una pieza con texto y con una sin texto, con y sin costo", () => {
    const conTexto = { id: "a1", tipo: "imagen", prompt: "Pieza: anuncio.\nTexto exacto: titular «Tu sofá como nuevo»", ajustes: {} };
    const h = pintar(VariacionesAnuncio, { id: "v", archivo: conTexto, costo: 0.04, onCrear: nada, onCerrar: nada });
    expect(h).toMatch(/3/);
    const sinTexto = { id: "a2", tipo: "imagen", prompt: "", ajustes: { plantilla: { texto: "Hola" } } };
    expect(() => pintar(VariacionesAnuncio, { id: "v2", archivo: sinTexto, costo: null, onCrear: nada, onCerrar: nada })).not.toThrow();
  });
});

describe("Desglosar toma por toma", () => {
  const RESPUESTA = {
    ficha: { duracion: 12, proporcion: "9:16", produccion: "Teléfono" },
    recurrentes: { sujetos: "Una mujer", lugares: "Una cocina" },
    tomas: [
      { desde: 0, hasta: 4, plano: "primer plano", movimiento: "cámara en mano", contenido: "Mira a cámara.", texto: "¿Te pasa?" },
      { desde: 4, hasta: 12, plano: "plano medio", movimiento: "fijo", contenido: "Abre la caja.", dice: "Mira lo que llegó" },
    ],
    montaje: { ritmo: "parejo" },
  };
  it("sin desglose enseña el botón; con él, la cuenta y las tomas", () => {
    expect(pintar(DesgloseVideo, { clienteId: "c", archivoId: "f" })).toMatch(/Desglosar/);
    const h = pintar(DesgloseVideo, { clienteId: "c", archivoId: "f", inicial: leerDeconstruccion(JSON.stringify(RESPUESTA)) });
    expect(h).toMatch(/2 tomas/);
    expect(pintar(DesgloseVideo, { clienteId: "c", archivoId: "f", lectura: true })).toBe("");
  });
});

describe("Lo que se ve día a día (revisión 3Q)", () => {
  const fila = (fecha, conv, gasto = 30) => ({
    date_start: fecha, date_stop: fecha, campaign_id: "800", campaign_name: "Café · Presentación", objective: "OUTCOME_ENGAGEMENT",
    spend: String(gasto), impressions: "1000", clicks: "20", inline_link_clicks: "20", actions: [{ action_type: ACCION_MENSAJE, value: String(conv) }],
  });
  const dias = (desde, hasta) => { const s = []; for (let d = desde; d <= hasta; d = sumarDias(d, 1)) s.push(d); return s; };
  it("pinta cada alerta con su semáforo con texto, y nada sin alertas", () => {
    const filas = [...dias("2026-11-01", "2026-11-12").map((f) => fila(f, 3)), ...dias("2026-11-13", "2026-11-15").map((f) => fila(f, 0))];
    const alertasDia = alertasDelDia({ campanasDia: filas, anunciosDia: null, revision: { campanas: [] }, presupuesto: { total: 600 }, hoy: "2026-11-16" });
    expect(alertasDia.length).toBeGreaterThan(0);
    const h = pintar(AlertasDelDia, { d: { alertasDia } });
    expect(h).toMatch(/Lo que se ve día a día/);
    for (const a of alertasDia) expect(h).toContain(a.semaforo.texto);
    expect(pintar(AlertasDelDia, { d: {} })).toBe("");
  });
});

describe("Plan de campañas: cada anuncio con su ángulo de venta", async () => {
  const { default: AnunciosDeCampana } = await import("./anuncios/AnunciosDelPlan");
  const { planDelCiclo, conPiezas } = await import("../lib/planCiclo");
  const MALETAS = { publico: "Mujeres de 28 a 45 años.", problema: "El sofá se hunde.", solucion: "Se abre en cama.", diferenciales: "Hecho en Panamá.", testimonios: "Ana lo usa.", objeciones: "Tres cuotas.", garantia: "Dos años." };
  const ESTUDIO = {
    aprobadoAt: "2026-10-01T00:00:00.000Z",
    general: { resumen: "Muebles.", perfiles: [{ nombre: "Mamá práctica", quien: "Mamás de 30 a 45 años" }] },
    productos: { sofa: { elementos: MALETAS, angulos: [
      { id: "visitas", nombre: "Las visitas que se quedan", publico: "frio", problemaExterno: "No hay dónde dormir a las visitas." },
      { id: "cuotas", nombre: "En tres cuotas", publico: "tibio" },
    ] } },
  };
  it("se pinta con el ángulo de cada hueco y sin ángulos", () => {
    const base = { negocio: { tipo: "productos", destino: "whatsapp", cuenta: "historial", ticket: { valor: 50 }, invertir: { valor: 20 }, metaVentas: { valor: 1000 } },
      manual: {}, mes: "2026-11", kit: {}, catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$450", activo: true }], cliente: { nombre: "Dcasa" } };
    for (const estudio of [ESTUDIO, null]) {
      const p = conPiezas(planDelCiclo({ ...base, estudio }), [], { hoy: "2026-11-06" });
      for (const c of p.campanas) {
        const h = pintar(AnunciosDeCampana, { c, plan: p, cliente: { id: "c1", name: "Dcasa" }, soloLectura: false, ocupado: "", onGuardar: nada, onEscribir: nada, onCopiar: nada });
        expect(h).toMatch(/Anuncios \(/);
      }
      if (estudio) expect(p.campanas.map((c) => pintar(AnunciosDeCampana, { c, plan: p, cliente: { id: "c1", name: "Dcasa" }, soloLectura: false, ocupado: "", onGuardar: nada, onEscribir: nada, onCopiar: nada })).join("")).toMatch(/Las visitas que se quedan|En tres cuotas/);
    }
  });
});
