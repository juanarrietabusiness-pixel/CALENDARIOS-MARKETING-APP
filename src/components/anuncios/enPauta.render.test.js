import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { TarjetaEnPauta } from "../calendario/enPautaPublicacion";
import { Candidata } from "./ParaPautar";
import { PublicacionDelAnuncio } from "./Revision3Q";

// ============================================================
// Cerrar el ciclo se PINTA (sin navegador: react-dom/server). Lo que se lee del servidor llega por efectos, que aquí
// no corren: se pinta cada pieza con lo que devolvería GET …/en-pauta, …/para-pautar y la revisión.
// ============================================================

const pintar = (componente, props) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");
const nada = () => {};
afterEach(() => vi.unstubAllGlobals());

describe("«En pauta» en el panel de la publicación", () => {
  it("la línea, la campaña, «Abrir en el Ads Manager» y «Ver la revisión» (a Resultados → Anuncios del cliente)", () => {
    vi.stubGlobal("window", { location: new URL("https://calendarios.test/cliente/cafe-luna/octubre-2026") });
    const html = pintar(TarjetaEnPauta, {
      clienteId: "c1",
      e: {
        calendarId: "cal1", postId: "p1", activo: true, linea: "En pauta · Presentación · 0,80 US$ por conversación (7 días)", nombreResultado: "conversaciones",
        d30: { gasto: 50, resultados: 60 }, leidoAt: "2026-11-06T15:00:00.000Z",
        anuncios: [{ id: "9011", campana: "Café · Presentación", enlace: "https://adsmanager.facebook.com/adsmanager/manage/ads?act=111&amp;selected_ad_ids=9011" }, { id: "9012", campana: "Café · Presentación" }],
      },
    });
    expect(html).toContain("En pauta · Presentación · 0,80 US$ por conversación (7 días)");
    expect(html).toContain("Campaña «Café · Presentación» · en 2 anuncios · 30 días: 60 conversaciones");
    expect(html).toContain("Abrir en el Ads Manager");
    expect(html).toMatch(/href="\/cliente\/cafe-luna\/resultados\/anuncios"/);
    expect(html).toContain("Ver la revisión");
  });
});

describe("la revisión: qué publicación es cada anuncio", () => {
  it("la del calendario, con su fecha, título y «Abrir la publicación»; o por qué no tiene", () => {
    const con = pintar(PublicacionDelAnuncio, { ctx: { abrirPublicacion: nada }, x: { publicacion: { calendarId: "cal1", postId: "p1", post: { fecha: "2026-10-12", titulo: "Receta", miniatura: "/api/media/clientes/c1/a.jpg" } } } });
    expect(con).toContain("Publicación del calendario");
    expect(con).toMatch(/lun.? 12 oct.* · «Receta»/);
    expect(con).toContain("Abrir la publicación");
    const sin = pintar(PublicacionDelAnuncio, { ctx: {}, x: { sinPublicacion: { tipo: "nuevo", texto: "Anuncio nuevo, sin publicación del calendario (se montó subiendo la pieza)." } } });
    expect(sin).toContain("Anuncio nuevo, sin publicación del calendario");
    expect(pintar(PublicacionDelAnuncio, { ctx: {}, x: {} })).toBe("");
  });
});

describe("«Para pautar»", () => {
  const ctx = { soloLectura: false, etapas: {}, marcadas: {}, marcando: "", onEtapa: nada, onVersion: nada, onMarcar: nada, onAbrir: nada };
  const x = {
    clave: "cal1|p5", calendarId: "cal1", postId: "p5", red: "instagram", fecha: "2026-10-20", titulo: "Antes y después", texto: "¡Hola!",
    rinde: 3.4, etapa: "evaluacion", delCalendario: true, marcada: false, conTextosDeAnuncio: false, miniatura: "/api/media/clientes/c1/b.jpg",
    cifras: { interacciones: 340, guardados: 12, compartidos: 3 },
    problemas: [{ codigo: "caduca", texto: "Dice «hoy»: un anuncio corre semanas y eso caduca." }],
  };

  it("del calendario: la frase con su etapa, su texto revisado, la etapa, «Marcar Va a pauta» y «Abrir la publicación»", () => {
    const html = pintar(Candidata, { x, ctx });
    expect(html).toContain("Rindió 3,4× su promedio: páutala en Evaluación.");
    expect(html).toContain("Del calendario");
    expect(html).toContain("Dice «hoy»");
    expect(html).toContain("Marcar «Va a pauta»");
    expect(html).toContain("Versión para anuncio");
    expect(html).toContain("Abrir la publicación");
    expect(html).toContain("340 interacciones · 12 guardados · 3 compartidos");
  });

  it("ya marcada, o quien sólo mira: sin el botón de marcar; de fuera del calendario: «Ver en Instagram»", () => {
    const marcada = pintar(Candidata, { x: { ...x, marcada: true }, ctx });
    expect(marcada).toContain("Va a pauta en Evaluación: falta montarla en el Ads Manager (abajo, cómo).");
    expect(marcada).not.toContain("Marcar «Va a pauta»");
    expect(pintar(Candidata, { x, ctx: { ...ctx, soloLectura: true } })).not.toContain("Marcar «Va a pauta»");
    const fuera = pintar(Candidata, { x: { ...x, clave: "instagram:1", delCalendario: false, calendarId: undefined, postId: undefined, enlace: "https://www.instagram.com/p/AAA/", problemas: [] }, ctx });
    expect(fuera).toContain("No salió desde el calendario");
    expect(fuera).toContain("Ver en Instagram");
    expect(fuera).not.toContain("Abrir la publicación");
  });
});
