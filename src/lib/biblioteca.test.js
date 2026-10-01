import { describe, it, expect } from "vitest";
import {
  normalizarConsulta, parametrosAdsArchive, urlBibliotecaWeb, enlaceDelAnuncio, tarjetaDeAnuncio,
  anunciosACSV, celdaCSV, nombreCSV, idDePagina, coberturaDe, cursorValido, filtroDeFila,
  LIMITE_MAX, MAX_PAGINAS_FB,
} from "./biblioteca";

// Un anuncio como lo devuelve /ads_archive (con el token en la instantánea, como Meta).
const AD = {
  id: "1234567890123",
  page_id: "111222333",
  page_name: "Ministerio de Salud",
  ad_creative_bodies: ["Vacúnate, Panamá.", "Segunda versión, con \"comillas\", y coma"],
  ad_creative_link_titles: ["Jornada de vacunación"],
  ad_creative_link_descriptions: ["Del 1 al 5 de octubre"],
  ad_delivery_start_time: "2026-09-01",
  publisher_platforms: ["facebook", "instagram"],
  languages: ["es"],
  bylines: "MINSA",
  ad_snapshot_url: "https://www.facebook.com/ads/archive/render_ad/?id=1234567890123&access_token=SECRETO",
};

describe("la consulta", () => {
  it("por defecto: Panamá, activos, política (fuera de la UE no hay más)", () => {
    const { consulta, cobertura, errores } = normalizarConsulta({ texto: "  vacunación   Panamá " });
    expect(errores).toEqual([]);
    expect(cobertura).toBe("politica");
    expect(consulta).toMatchObject({ texto: "vacunación Panamá", paises: ["PA"], estado: "ACTIVE", tipo: "POLITICAL_AND_ISSUE_ADS", limite: 25 });
  });

  it("«todos los tipos» con un país fuera de la UE se cambia a política y lo dice", () => {
    const r = normalizarConsulta({ texto: "x", paises: ["PA", "ES"], tipo: "ALL" });
    expect(r.consulta.tipo).toBe("POLITICAL_AND_ISSUE_ADS");
    expect(r.avisos.join(" ")).toMatch(/fuera de la UE/);
  });

  it("dentro de la UE y el Reino Unido, «todos» vale y es lo que sale por defecto", () => {
    expect(normalizarConsulta({ texto: "x", paises: ["ES", "GB"] }).consulta.tipo).toBe("ALL");
    expect(coberturaDe(["ES", "DE"])).toBe("ue");
    expect(coberturaDe(["ES", "PA"])).toBe("politica");
  });

  it("sin palabras ni páginas no se busca", () => {
    expect(normalizarConsulta({}).errores.join(" ")).toMatch(/palabras clave o al menos una página/);
  });

  it("páginas: acepta ids y enlaces que los lleven, rechaza lo demás y pone el tope de diez", () => {
    expect(idDePagina("123456789")).toBe("123456789");
    expect(idDePagina("https://www.facebook.com/ads/library/?view_all_page_id=987654321&country=PA")).toBe("987654321");
    expect(idDePagina("https://www.facebook.com/profile.php?id=55555555")).toBe("55555555");
    expect(idDePagina("https://www.facebook.com/minsapma")).toBeNull();

    expect(normalizarConsulta({ paginas: "123456789, 987654321 123456789" }).consulta.paginas).toEqual(["123456789", "987654321"]);
    expect(normalizarConsulta({ paginas: ["minsapma"] }).errores.join(" ")).toMatch(/id numérico/);
    const once = Array.from({ length: MAX_PAGINAS_FB + 1 }, (_, i) => String(100000 + i));
    expect(normalizarConsulta({ paginas: once }).errores.join(" ")).toMatch(/Como mucho 10 páginas/);
  });

  it("fechas: sólo AAAA-MM-DD y en orden", () => {
    expect(normalizarConsulta({ texto: "x", desde: "2026-09-10", hasta: "2026-09-01" }).errores.join(" ")).toMatch(/va después/);
    expect(normalizarConsulta({ texto: "x", desde: "10/09/2026" }).errores.join(" ")).toMatch(/«desde» no es válida/);
  });

  it("limit nunca pasa de 50, plataformas e idiomas sólo los conocidos", () => {
    const { consulta } = normalizarConsulta({ texto: "x", limite: 5000, plataformas: ["instagram", "TIKTOK"], idiomas: ["ES", "español"] });
    expect(consulta.limite).toBe(LIMITE_MAX);
    expect(consulta.plataformas).toEqual(["INSTAGRAM"]);
    expect(consulta.idiomas).toEqual(["es"]);
    expect(normalizarConsulta({ texto: "x", limite: -3 }).consulta.limite).toBe(25);
  });

  it("el texto se corta en 100 caracteres, como Meta", () => {
    expect(normalizarConsulta({ texto: "a".repeat(300) }).consulta.texto).toHaveLength(100);
  });
});

describe("los parámetros de /ads_archive", () => {
  it("palabras en cualquier orden, con listas en JSON y los campos de la tarjeta", () => {
    const { consulta } = normalizarConsulta({ texto: "vacunación", paises: ["PA", "CR"], plataformas: ["FACEBOOK"], idiomas: ["es"], desde: "2026-09-01", hasta: "2026-09-30" });
    const p = parametrosAdsArchive(consulta);
    expect(p).toMatchObject({
      search_terms: "vacunación", search_type: "KEYWORD_UNORDERED", ad_reached_countries: '["PA","CR"]',
      ad_active_status: "ACTIVE", ad_type: "POLITICAL_AND_ISSUE_ADS", publisher_platforms: '["FACEBOOK"]',
      languages: '["es"]', ad_delivery_date_min: "2026-09-01", ad_delivery_date_max: "2026-09-30", limit: 25,
    });
    expect(p.fields.split(",")).toEqual(expect.arrayContaining(["ad_creative_bodies", "ad_snapshot_url", "page_name", "ad_creative_link_titles"]));
    expect(p).not.toHaveProperty("after");
    expect(p).not.toHaveProperty("search_page_ids");
  });

  it("frase exacta, páginas y cursor", () => {
    const { consulta } = normalizarConsulta({ texto: "seguridad vial", exacta: true, paginas: ["123456789"] });
    const p = parametrosAdsArchive(consulta, { after: "QVFIUmFi" });
    expect(p.search_type).toBe("KEYWORD_EXACT_PHRASE");
    expect(p.search_page_ids).toBe('["123456789"]');
    expect(p.after).toBe("QVFIUmFi");
  });

  it("sólo por páginas: sin search_terms", () => {
    const p = parametrosAdsArchive(normalizarConsulta({ paginas: ["123456789"] }).consulta);
    expect(p).not.toHaveProperty("search_terms");
    expect(p).not.toHaveProperty("search_type");
  });

  it("un cursor sólo vale si es base64", () => {
    expect(cursorValido("QVFIUmFi-_=")).toBe(true);
    expect(cursorValido("https://graph.facebook.com/…&access_token=x")).toBe(false);
    expect(cursorValido("")).toBe(false);
  });
});

describe("el enlace a la web de la Biblioteca (lo comercial que la API no da)", () => {
  it("rellena la búsqueda por palabras, con tipo «all» y el país", () => {
    const { consulta } = normalizarConsulta({ texto: "zapatos deportivos", estado: "ALL", desde: "2026-09-01", plataformas: ["INSTAGRAM"], idiomas: ["es"] });
    const u = new URL(urlBibliotecaWeb(consulta));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/ads/library/");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      active_status: "all", ad_type: "all", country: "PA", q: "zapatos deportivos", search_type: "keyword_unordered",
      media_type: "all", "start_date[min]": "2026-09-01", "publisher_platforms[0]": "instagram", "content_languages[0]": "es",
    });
  });

  it("frase exacta va entre comillas", () => {
    const u = new URL(urlBibliotecaWeb(normalizarConsulta({ texto: "envío gratis", exacta: true }).consulta));
    expect(u.searchParams.get("q")).toBe('"envío gratis"');
    expect(u.searchParams.get("search_type")).toBe("keyword_exact_phrase");
  });

  it("por página, la primera; con varios países, todos", () => {
    const u = new URL(urlBibliotecaWeb(normalizarConsulta({ paginas: ["123456789", "987654321"], paises: ["PA", "CR"] }).consulta));
    expect(u.searchParams.get("view_all_page_id")).toBe("123456789");
    expect(u.searchParams.get("search_type")).toBe("page");
    expect(u.searchParams.get("country")).toBe("ALL");
    expect(u.searchParams.has("q")).toBe(false);
  });

  it("no lleva nada de la API: ni token ni tipo político", () => {
    const url = urlBibliotecaWeb(normalizarConsulta({ texto: "x" }).consulta);
    expect(url).not.toMatch(/access_token|POLITICAL/);
  });
});

describe("la tarjeta y su enlace", () => {
  it("el enlace es la ficha del anuncio en la Biblioteca: el token de la instantánea NO sale", () => {
    expect(enlaceDelAnuncio(AD)).toBe("https://www.facebook.com/ads/library/?id=1234567890123");
    const sinId = enlaceDelAnuncio({ ad_snapshot_url: AD.ad_snapshot_url });
    expect(sinId).not.toMatch(/access_token|SECRETO/);
    expect(sinId).toMatch(/render_ad/);
    expect(enlaceDelAnuncio({ ad_snapshot_url: "javascript:alert(1)" })).toBeNull();
    expect(enlaceDelAnuncio({ ad_snapshot_url: "https://malo.example/?access_token=x" })).toBeNull();
  });

  it("de un anuncio de Meta a lo que pinta la pantalla", () => {
    const t = tarjetaDeAnuncio(AD);
    expect(t).toMatchObject({
      id: "1234567890123", pagina: "Ministerio de Salud", paginaId: "111222333", titulos: ["Jornada de vacunación"],
      inicio: "2026-09-01", fin: null, plataformas: ["facebook", "instagram"], pagadoPor: "MINSA",
    });
    expect(JSON.stringify(t)).not.toMatch(/SECRETO/);
    expect(tarjetaDeAnuncio({}).textos).toEqual([]);
  });
});

describe("el CSV", () => {
  it("cabecera, BOM, CRLF y comillas dobladas", () => {
    const csv = anunciosACSV([tarjetaDeAnuncio(AD)]);
    expect(csv.startsWith("﻿ID del anuncio,Página,")).toBe(true);
    const lineas = csv.slice(1).split("\r\n");
    expect(lineas[0].split(",")).toHaveLength(12);
    expect(csv).toContain('"Vacúnate, Panamá.\n\nSegunda versión, con ""comillas"", y coma"');
    expect(csv).toContain("https://www.facebook.com/ads/library/?id=1234567890123");
    expect(csv).not.toMatch(/SECRETO/);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("sin anuncios, sólo la cabecera", () => {
    expect(anunciosACSV([]).split("\r\n").filter(Boolean)).toHaveLength(1);
  });

  it("lo que parece una fórmula no se ejecuta en la hoja de cálculo", () => {
    expect(celdaCSV("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(celdaCSV("+50760000000")).toBe("'+50760000000");
    expect(celdaCSV("@alguien")).toBe("'@alguien");
    expect(celdaCSV("normal")).toBe("normal");
    expect(celdaCSV(null)).toBe("");
  });

  it("el nombre del archivo", () => {
    expect(nombreCSV({ texto: "Envío gratis!" }, "2026-09-30")).toBe("biblioteca-envio-gratis-2026-09-30.csv");
    expect(nombreCSV({ paginas: ["123"] })).toBe("biblioteca-pagina-123.csv");
  });
});

describe("un filtro guardado", () => {
  it("se lee aunque su JSON esté roto, y su consulta sale normalizada", () => {
    expect(filtroDeFila({ id: "f1", nombre: "Roto", consulta: "{no" }).consulta.paises).toEqual(["PA"]);
    const f = filtroDeFila({ id: "f2", nombre: "Dcasa", client_id: "c1", consulta: JSON.stringify({ texto: "muebles", limite: 999 }) });
    expect(f).toMatchObject({ id: "f2", nombre: "Dcasa", clientId: "c1" });
    expect(f.consulta.limite).toBe(LIMITE_MAX);
  });
});
