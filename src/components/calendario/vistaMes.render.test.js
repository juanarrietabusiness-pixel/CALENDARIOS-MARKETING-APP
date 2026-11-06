import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import VistaMes from "./VistaMes";

// ============================================================
// «Ver el mes como se verá» se PINTA (sin navegador: react-dom/server)
//
// No corren los efectos (ni el catálogo, ni lo ya publicado): se prueba lo que sale del calendario y de la cola.
// ============================================================

const pintar = (props) => renderToString(createElement(VistaMes, props)).replace(/<!-- -->/g, "");
const nada = () => {};
const pieza = (id, extra = {}) => ({
  id, format: "post", status: "pending", publishTime: "09:00", title: `Pieza ${id}`, descripcion: `Texto de ${id}. Escríbenos.`,
  hashtagsFinales: "#marca", medios: [{ src: `/api/media/clientes/c1/${id}.jpg`, tipo: "imagen", ancho: 1080, alto: 1350 }],
  ...extra,
});
const cal = {
  id: "cal1", year: 2030, month: 0,
  days: [
    { date: "2030-01-02", posts: [pieza("a")] },
    { date: "2030-01-04", posts: [pieza("b", { asistida: true }), pieza("h", { format: "historia", descripcion: "" })] },
    { date: "2030-01-06", posts: [pieza("x", { medios: [], title: "Sin pieza todavía" })] },
  ],
};
const client = { id: "c1", name: "Dcasa", logo: "/api/media/clientes/c1/logo.png" };
const estadoRedes = { cuentas: [{ clientId: "c1", red: "instagram", usuario: "dcasa.pa", nombre: "Dcasa Panamá", avatar: "https://scontent.cdninstagram.com/foto.jpg" }] };
const base = { client, cal, cola: [], estadoRedes, onAbrirPost: nada, onProgramar: nada, onClose: nada };

describe("la vista previa del mes", () => {
  it("es un diálogo con sus tres vistas como pestañas", () => {
    const html = pintar(base);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Así se verá enero 2030");
    expect(html).toMatch(/role="tablist"[^>]*aria-label="Cómo ver el mes"/);
    for (const nombre of ["Perfil", "Feed", "Detalles"]) expect(html).toContain(`<span>${nombre}</span>`);
    expect(html).toContain('role="tabpanel"');
  });

  it("el perfil: la cuenta de verdad (la foto por el proxy), lo más nuevo primero, sin la historia y «A mano» marcado", () => {
    const html = pintar(base);
    expect(html).toContain("dcasa.pa");
    expect(html).toContain(`/api/metricas/miniatura?u=${encodeURIComponent("https://scontent.cdninstagram.com/foto.jpg")}`);
    const orden = [...html.matchAll(/id="[^"]*-p-([a-z])"/g)].map((m) => m[1]);
    expect(orden).toEqual(["x", "b", "a"]);
    expect(html).toContain("A mano");
    expect(html).toContain("Sin pieza");
  });

  it("«Programar todo lo listo» cuenta sólo lo listo (ni lo de «La publico yo», ni lo que no tiene pieza), arriba y abajo", () => {
    const html = pintar(base);
    // a y la historia h; b la publicas tú y x no tiene pieza.
    expect(html.match(/Programar todo lo listo \(2\)/g)).toHaveLength(2);
    expect(html).toContain("1 no está lista");
    expect(html).toContain("1 las publicas tú");
  });

  it("con sólo lectura no se programa", () => {
    const html = pintar({ ...base, soloLectura: true });
    expect(html).not.toContain("Programar todo lo listo");
    expect(html).toContain("Con acceso de sólo lectura no se programa.");
  });

  it("el feed empieza en la publicación de la que se venía, con la vista previa de siempre", () => {
    const html = pintar({ ...base, inicial: { vista: "feed", postId: "b" } });
    expect(html).toContain("2 de 4");
    expect(html).toContain("La publicas tú desde el teléfono");
    expect(html).toContain('class="vista-red"');
    expect(html).toContain('aria-roledescription="carrusel"');
  });

  it("los detalles dicen qué impide programar y cada aviso abre la publicación", () => {
    const html = pintar({ ...base, inicial: { vista: "detalles", filtro: "no-listas" } });
    expect(html).toContain("Impide programarla:");
    expect(html).toContain("Le falta la pieza (la imagen o el video).");
    expect(html).toContain("Sin pieza todavía");
    // Con el filtro de las no listas, la que está lista no sale.
    expect(html).not.toContain("Pieza a");
  });
});
