import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PautaPublicacion } from "./pautaPublicacion";
import { MonthGrid } from "./MonthGrid";
import RevisionMes from "./RevisionMes";
import AsistenteMes from "./AsistenteMes";
import VersionAnuncio from "../VersionAnuncio";
import { PASO_MES } from "../../lib/asistenteMes";

// ============================================================
// Lo que va a pauta se PINTA (sin navegador: react-dom/server)
//
// El lint no ve una prop que no llega ni un campo que se lee de algo
// indefinido: aquí revienta al renderizar. No corren los efectos; se prueba
// que el bloque del panel, el chip del mes, «Revisar el mes», el paso de las
// ideas del asistente y «Versión para anuncio» se pintan con datos de verdad.
// ============================================================

const pintar = (componente, props) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");
const nada = () => {};
const BUENO = "Tu sala pequeña también merece un sofá cama que se abre en un segundo.\n\nEscríbenos por WhatsApp y te ayudamos.";

describe("lo que va a pauta se pinta", () => {
  it("el panel: sin pauta, sólo el interruptor; con pauta, la etapa, cómo y los textos con «Copiar»", () => {
    const no = pintar(PautaPublicacion, { form: { id: "p1", format: "post" }, sf: nada, clienteId: "c1" });
    expect(no).toContain("Se va a pautar en Meta");
    expect(no).not.toContain("Textos del anuncio");
    const si = pintar(PautaPublicacion, {
      form: { id: "p1", format: "post", nivel: "producto", pauta: { etapa: "evaluacion", como: "", auto: true, motivo: "Tipo «Anuncio» del plan semanal" }, anuncio: { textos: ["Uno", "Dos"], titulos: ["Un título"], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" } },
      sf: nada, clienteId: "c1", onEscribir: nada,
    });
    expect(si).toContain("Etapa del ciclo de ventas");
    expect(si).toContain("Evaluación");
    expect(si).toContain("La marcó el asistente del mes");
    expect(si).toContain("De las dos formas");
    expect(si).toContain("Texto principal 2");
    expect(si).toContain("Copiar todo");
    expect(si).toContain("Reescribir con IA");
    expect(si).toContain("Enviar mensaje de WhatsApp");
  });

  it("el chip del mes lleva el megáfono y lo dice en su etiqueta accesible", () => {
    const cal = { year: 2026, month: 10, days: [{ date: "2026-11-02", posts: [{ id: "a", format: "post", title: "Sofá", pauta: { etapa: "presentacion" } }, { id: "b", format: "post", title: "Mesa" }] }] };
    const html = pintar(MonthGrid, { cal, onPostClick: nada, onMove: nada, onAddPost: nada });
    expect(html).toMatch(/aria-label="[^"]*Sofá[^"]*Va a pauta/);
    expect(html).not.toMatch(/aria-label="[^"]*Mesa[^"]*Va a pauta/);
    expect(html).toContain("Megáfono: va a pauta");
  });

  it("«Revisar el mes»: lo que va a pauta, aparte, con sus avisos y sus arreglos", () => {
    const cal = {
      id: "cal1", year: 2026, month: 10, days: [{ date: "2026-11-02", posts: [
        { id: "a", format: "post", title: "Sofá", descripcion: "¡Hoy abrimos!\n#sofa #a #b #c", pauta: { etapa: "presentacion" } },
        { id: "b", format: "post", title: "Lista", descripcion: BUENO, pauta: { etapa: "conversion" }, anuncio: { textos: ["Una sala pequeña merece un buen sofá. Escríbenos por WhatsApp."] } },
      ] }],
    };
    const html = pintar(RevisionMes, { client: { id: "c1", name: "Dcasa" }, cal, onAbrir: nada, onArreglar: nada, onClose: nada, incrustado: true });
    expect(html).toContain("Lo que va a pauta");
    expect(html).toContain("2 van a pauta · 1 con algo que revisar");
    expect(html).toContain("Dice «Hoy»");
    expect(html).toContain("Dejar 3");
    expect(html).toContain("Reescribir el caption como anuncio (IA)");
    expect(html).toContain("Lista como anuncio.");
  });

  it("el asistente del mes, en las ideas: las que van a pauta y las que podrían ir, sin marcarlas solo", () => {
    const cal = {
      id: "cal1", year: 2030, month: 2, offers: "15 % en colchones", days: [{ date: "2030-03-04", posts: [
        { id: "a", format: "post", title: "Sofá", pilar: "anuncio", idea: "x", pauta: { etapa: "presentacion" } },
        { id: "b", format: "post", title: "Colchón", pilar: "beneficios", idea: "y" },
        { id: "c", format: "post", title: "Tip", pilar: "educativo", idea: "z" },
      ] }],
    };
    const html = pintar(AsistenteMes, { client: { id: "c1", name: "Dcasa", calendars: [] }, cal, escribir: nada, onClose: nada, pasoInicial: PASO_MES.ideas });
    expect(html).toContain("1 publicación va a pauta: se escribirán como anuncio.");
    expect(html).toContain("Podrían ir a pauta (1)");
    expect(html).toMatch(/Colchón → Conversión/);
    expect(html).toContain("Marcar la «Va a pauta»");
  });

  it("«Versión para anuncio» de una ya publicada", () => {
    const html = pintar(VersionAnuncio, { client: { id: "c1", name: "Dcasa" }, cal: null, post: { id: "p1", format: "post", descripcion: "Texto publicado", nivel: "producto" }, day: {}, onClose: nada });
    expect(html).toContain("Versión para anuncio");
    expect(html).toContain("Escribir la versión para anuncio");
    expect(html).toMatch(/<option value="evaluacion" selected="">Evaluación/);
  });
});
