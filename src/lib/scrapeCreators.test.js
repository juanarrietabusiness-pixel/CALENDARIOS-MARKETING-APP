import { describe, it, expect } from "vitest";
import {
  consultaSC, cursorSC, pedidoDeAnuncios, esDelCdnDeMeta, anuncioSC, empresaSC, mensajeErrorSC, claveDeCache,
} from "./scrapeCreators.js";

describe("consultaSC", () => {
  it("una empresa sin pageId ni nombre no se puede buscar", () => {
    expect(consultaSC({ modo: "empresa" }).errores).toHaveLength(1);
    expect(consultaSC({ modo: "empresa", empresa: "Dcasa" }).errores).toEqual([]);
  });

  it("por palabra pide la palabra", () => {
    expect(consultaSC({ modo: "palabra" }).errores).toHaveLength(1);
    expect(consultaSC({ modo: "palabra", q: "muebles" }).errores).toEqual([]);
  });

  it("limpia lo que no vale y pone los valores por defecto", () => {
    const { consulta } = consultaSC({ modo: "raro", pageId: "abc", pais: "panama", estado: "X", medio: "Y", orden: "Z", desde: "ayer" });
    expect(consulta).toMatchObject({ fuente: "sc", modo: "empresa", pageId: "", pais: "ALL", estado: "ACTIVE", medio: "ALL", orden: "total_impressions", desde: "" });
  });

  it("el país va en mayúsculas y las fechas al revés son un error", () => {
    const r = consultaSC({ modo: "palabra", q: "x", pais: "pa", desde: "2026-10-10", hasta: "2026-10-01" });
    expect(r.consulta.pais).toBe("PA");
    expect(r.errores.join(" ")).toMatch(/fecha/);
  });
});

describe("pedidoDeAnuncios", () => {
  it("una empresa va por su pageId a company/ads, siempre con trim", () => {
    const { consulta } = consultaSC({ modo: "empresa", pageId: "123456", pais: "PA", estado: "ALL" });
    const p = pedidoDeAnuncios(consulta);
    expect(p.ruta).toBe("/v1/facebook/adLibrary/company/ads");
    expect(p.params).toMatchObject({ pageId: "123456", country: "PA", status: "ALL", trim: "true" });
    expect(p.params.companyName).toBeUndefined();
  });

  it("sin pageId, por el nombre", () => {
    const { consulta } = consultaSC({ modo: "empresa", empresa: "Dcasa" });
    expect(pedidoDeAnuncios(consulta).params.companyName).toBe("Dcasa");
  });

  it("por palabra va a search/ads con la frase exacta si se pide", () => {
    const { consulta } = consultaSC({ modo: "palabra", q: "sofá cama", exacta: true, idioma: "es", desde: "2026-01-01" });
    const p = pedidoDeAnuncios(consulta, "CURSOR123");
    expect(p.ruta).toBe("/v1/facebook/adLibrary/search/ads");
    expect(p.params).toMatchObject({ query: "sofá cama", search_type: "keyword_exact_phrase", language: "ES", start_date: "2026-01-01", cursor: "CURSOR123" });
  });

  it("un cursor con espacios o comillas no viaja", () => {
    expect(cursorSC("abc def")).toBe("");
    expect(cursorSC('a"b')).toBe("");
    expect(cursorSC("x".repeat(5000))).toBe("");
    const { consulta } = consultaSC({ modo: "palabra", q: "x" });
    expect(pedidoDeAnuncios(consulta, "<script>").params.cursor).toBeUndefined();
  });
});

describe("esDelCdnDeMeta", () => {
  it("sólo fbcdn.net y cdninstagram.com", () => {
    expect(esDelCdnDeMeta("https://scontent.xx.fbcdn.net/v/t39/a.jpg")).toBe(true);
    expect(esDelCdnDeMeta("https://instagram.fpty1-1.cdninstagram.com/a.mp4")).toBe(true);
    expect(esDelCdnDeMeta("https://fbcdn.net.malo.com/a.jpg")).toBe(false);
    expect(esDelCdnDeMeta("https://ejemplo.com/a.jpg")).toBe(false);
    expect(esDelCdnDeMeta("no es url")).toBe(false);
  });
});

describe("anuncioSC", () => {
  const IMG = "https://scontent.xx.fbcdn.net/a.jpg";
  const VID = "https://video.xx.fbcdn.net/v.mp4";

  it("una imagen: la tarjeta con su texto, fechas y enlace a la Biblioteca", () => {
    const a = anuncioSC({
      ad_archive_id: "1234567890", page_name: "Dcasa", page_id: "999", is_active: true,
      start_date: 1767225600, publisher_platform: ["FACEBOOK", "INSTAGRAM"],
      snapshot: { body: { text: "Sofá cama a  $399" }, title: "Oferta", cta_text: "Comprar", link_url: "https://dcasa.com", images: [{ original_image_url: IMG }] },
    });
    expect(a).toMatchObject({
      id: "1234567890", pagina: "Dcasa", pageId: "999", activo: true, inicio: "2026-01-01", plataformas: ["facebook", "instagram"],
      texto: "Sofá cama a $399", titulo: "Oferta", cta: "Comprar", destino: "https://dcasa.com/", formato: "imagen", imagenes: [IMG],
      enlace: "https://www.facebook.com/ads/library/?id=1234567890",
    });
  });

  it("un video trae video y portada", () => {
    const a = anuncioSC({ ad_archive_id: "1", snapshot: { display_format: "VIDEO", videos: [{ video_hd_url: VID, video_preview_image_url: IMG }] } });
    expect(a.formato).toBe("video");
    expect(a.videos).toEqual([{ video: VID, portada: IMG }]);
  });

  it("con varias versiones (cards), el creativo sale de la primera", () => {
    const a = anuncioSC({
      ad_archive_id: "2",
      snapshot: { cards: [{ body: "Uno", title: "T1", original_image_url: IMG }, { body: "Dos", title: "T2", original_image_url: IMG }] },
    });
    expect(a.formato).toBe("carrusel");
    expect(a.texto).toBe("Uno");
    expect(a.imagenes).toEqual([IMG]);
    expect(a.versiones).toHaveLength(2);
  });

  it("lo que no es https no pasa", () => {
    const a = anuncioSC({ ad_archive_id: "3", snapshot: { link_url: "javascript:alert(1)", images: [{ original_image_url: "http://x.com/a.jpg" }] } });
    expect(a.destino).toBe("");
    expect(a.imagenes).toEqual([]);
  });

  it("sin id no hay enlace", () => {
    expect(anuncioSC({}).enlace).toBe("");
  });
});

describe("empresaSC", () => {
  it("lo que hace falta para escoger la empresa", () => {
    expect(empresaSC({ page_id: "77", name: "Dcasa", category: "Muebles", likes: 1200, verification: "BLUE_VERIFIED", image_uri: "https://x.fbcdn.net/p.jpg", ig_username: "dcasa" }))
      .toMatchObject({ pageId: "77", nombre: "Dcasa", seguidores: 1200, verificada: true, instagram: "dcasa" });
    expect(empresaSC({ page_id: "1", verification: "NOT_VERIFIED" }).verificada).toBe(false);
  });
});

describe("mensajeErrorSC y claveDeCache", () => {
  it("cada código dice qué hacer", () => {
    expect(mensajeErrorSC(402)).toMatch(/créditos/);
    expect(mensajeErrorSC(401)).toMatch(/SCRAPECREATORS_API_KEY/);
    expect(mensajeErrorSC(404)).toMatch(/No se encontró/);
    expect(mensajeErrorSC(400, "falta query")).toMatch(/falta query/);
    expect(mensajeErrorSC(500)).toMatch(/vuelve a intentar/);
  });

  it("la clave no depende del orden de los parámetros", () => {
    expect(claveDeCache("/r", { b: 1, a: 2 })).toBe(claveDeCache("/r", { a: 2, b: 1 }));
    expect(claveDeCache("/r", { a: 1 })).not.toBe(claveDeCache("/r", { a: 2 }));
  });
});
