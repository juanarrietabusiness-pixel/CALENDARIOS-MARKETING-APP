import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueAprueba, EstadoAprobacion } from "./aprobacionCliente";
import PorProgramar from "../PorProgramar";
import { conAprobacion, huellaPieza } from "../../lib/aprobacion";

// ============================================================
// «¿Qué aprueba el cliente?» y en qué quedó, PINTADO (react-dom/server)
//
// La publicación que el cliente aprobó cuando era una IDEA y ya tiene su
// pieza (Feria del Lente, 5-nov) enseña el aviso nuevo con «El cliente vio la
// pieza: contarla como aprobada»; sin pieza, el «falta producir» de siempre.
// No corren los efectos ni los clics: se prueba que se pinta lo que toca.
// ============================================================

const pintar = (componente, props) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");
const nada = () => {};
const IMG = { src: "/api/media/clientes/c1/posts/a.jpg", tipo: "imagen" };
const SI_IDEA = { estado: "aprobado", tipo: "idea", huella: "h", timestamp: "2026-11-05T10:00:00Z" };

describe("el aviso de la aprobación en el panel", () => {
  it("idea aprobada con su pieza: el texto claro y los dos caminos", () => {
    const post = conAprobacion({ id: "p1", format: "post", medios: [IMG], aprobacion: "idea" }, SI_IDEA);
    const html = pintar(EstadoAprobacion, { post, setForm: nada, calId: "cal1" });
    expect(html).toContain("El cliente aprobó esta publicación cuando era una idea, pero ya tiene su pieza.");
    expect(html).toContain("Si la vio así, cuéntala como aprobada; si no, mándasela.");
    expect(html).toContain("El cliente vio la pieza: contarla como aprobada");
    expect(html).toContain("Pedir aprobación de la pieza");
    // El texto de antes, que mandaba a programarla «si no hace falta» mientras seguía «por producir», ya no sale.
    expect(html).not.toContain("prográmala tú si no hace falta");
  });

  it("idea aprobada SIN pieza: falta producirla (sin el botón)", () => {
    const post = conAprobacion({ id: "p1", format: "post" }, SI_IDEA);
    const html = pintar(EstadoAprobacion, { post, setForm: nada, calId: "cal1" });
    expect(html).toContain("El cliente aprobó la idea.");
    expect(html).not.toContain("contarla como aprobada");
  });

  it("contada como pieza: lista para programar", () => {
    const base = { id: "p1", format: "post", medios: [IMG] };
    const post = conAprobacion(base, { ...SI_IDEA, tipo: "pieza", huella: huellaPieza(base) });
    expect(pintar(EstadoAprobacion, { post, setForm: nada })).toContain("lista para programar");
  });

  it("«¿Qué aprueba el cliente?»: la idea del sistema con pieza sale como pieza y «elegido solo»; la de una persona, como idea", () => {
    const delSistema = pintar(QueAprueba, { post: { id: "p1", medios: [IMG], aprobacion: "idea" }, setForm: nada });
    expect(delSistema).toMatch(/aria-checked="true"[^>]*>(?:(?!<\/button>).)*La pieza final/);
    expect(delSistema).toContain("Elegido solo");
    const deUnaPersona = pintar(QueAprueba, { post: { id: "p1", medios: [IMG], aprobacion: "idea", aprobacionElegida: true }, setForm: nada });
    expect(deUnaPersona).toMatch(/aria-checked="true"[^>]*>(?:(?!<\/button>).)*La idea/);
    expect(deUnaPersona).not.toContain("Elegido solo");
  });

  it("Producción se pinta (sin datos todavía no enseña nada: la lista llega en un efecto)", () => {
    expect(pintar(PorProgramar, { clients: [] })).toBe("");
  });
});
