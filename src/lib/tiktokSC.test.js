import { describe, it, expect } from "vitest";
import {
  RUTAS_TIKTOK, MAX_PALABRAS, pedidoPerfilTikTok, palabraDeTendencia, limpiarPalabras, pedidoDeTendencia, esDeTikTok,
  videoTikTok, videosDeRespuesta, cuentaTikTok, videoDelDetalle, cifraCorta, direccionDe,
} from "./scrapeCreators.js";
import { conRendimiento, campoDeRendimiento } from "./inspiracion.js";
import { cifraDe, claveDeInspiracion, claveDeTendencia, claveDeEnlace, unirRepetidas, conPercentiles, FUENTES } from "./loMejor.js";

// ============================================================
// TikTok por Scrape Creators, lo puro: los pedidos, leer su respuesta con
// tolerancia (la de la app de TikTok, «aweme»), las palabras de tendencia y la
// cifra de la tarjeta. Nada de esto se ha probado contra el servicio real: la
// forma sale de su documentación pública.
// ============================================================

const AWEME = {
  aweme_id: "7300000000000000001",
  desc: "El truco  para dormir al bebé",
  create_time: 1793000000,
  author: { unique_id: "MamaTips", nickname: "Mamá Tips", avatar_thumb: { url_list: ["https://p16-sign-va.tiktokcdn.com/a.jpeg"] }, follower_count: 52000 },
  statistics: { play_count: 1234567, digg_count: 45300, comment_count: 900, share_count: 1200, collect_count: 3000 },
  video: {
    cover: { url_list: ["https://p16-sign-va.tiktokcdn.com/c.jpeg"] },
    play_addr: { url_list: ["https://v16m.tiktokcdn.com/v.mp4"] },
    download_no_watermark_addr: { url_list: ["https://v19.tiktokcdn-us.com/limpio.mp4"] },
    duration: 15000,
  },
};

describe("los pedidos", () => {
  it("la cuenta va por su @ a profile/videos, las más nuevas y con trim", () => {
    expect(pedidoPerfilTikTok("@latienda")).toEqual({ ruta: RUTAS_TIKTOK.perfil, params: { handle: "latienda", sort_by: "latest", trim: "true" } });
  });

  it("un #hashtag va a search/hashtag; una palabra, a search/keyword con lo de esta semana (y sin filtros si no los entiende)", () => {
    expect(pedidoDeTendencia("#BabyShower")).toEqual({ ruta: RUTAS_TIKTOK.hashtag, params: { hashtag: "babyshower", trim: "true" } });
    expect(pedidoDeTendencia("Cuna para bebé")).toEqual({
      ruta: RUTAS_TIKTOK.palabra, params: { query: "cuna para bebé", date_posted: "this-week", sort_by: "relevance", trim: "true" },
    });
    expect(pedidoDeTendencia("cuna", { sinFiltros: true }).params).toEqual({ query: "cuna", trim: "true" });
    expect(pedidoDeTendencia("#")).toBeNull();
  });
});

describe("las palabras de tendencia", () => {
  it("se limpian, no se repiten y caben MAX_PALABRAS", () => {
    expect(palabraDeTendencia("  #Baby-Shower! ")).toEqual({ tipo: "hashtag", valor: "babyshower", texto: "#babyshower" });
    expect(palabraDeTendencia("x")).toBeNull();
    expect(palabraDeTendencia('<script>"hola"</script>')?.texto).not.toMatch(/[<>"]/);
    expect(limpiarPalabras(["#bebé", "#BEBÉ", "cunas", "", "a"])).toEqual(["#bebé", "cunas"]);
    expect(limpiarPalabras("uno, dos,\ntres")).toEqual(["uno", "dos", "tres"]);
    expect(limpiarPalabras(Array.from({ length: 9 }, (_, i) => `palabra ${i}`))).toHaveLength(MAX_PALABRAS);
  });
});

describe("leer lo que contesta", () => {
  it("un video con sus cifras, el archivo SIN marca de agua, la miniatura y el enlace canónico", () => {
    const v = videoTikTok(AWEME);
    expect(v).toMatchObject({
      id: "7300000000000000001", usuario: "mamatips", nombre: "Mamá Tips", texto: "El truco para dormir al bebé",
      vistas: 1234567, meGusta: 45300, comentarios: 900, compartidos: 1200, guardados: 3000, duracion: 15, formato: "video",
      miniatura: "https://p16-sign-va.tiktokcdn.com/c.jpeg", video: "https://v19.tiktokcdn-us.com/limpio.mp4",
      enlace: "https://www.tiktok.com/@mamatips/video/7300000000000000001",
    });
    expect(v.publicada).toBe(new Date(1793000000 * 1000).toJSON());
    // El enlace da la MISMA clave que una publicación de la inspiración o una tendencia.
    expect(claveDeEnlace(v.enlace)).toBe("tt:7300000000000000001");
  });

  it("con tolerancia: la forma de la web (stats, playAddr) y la búsqueda por palabra (aweme_info)", () => {
    const web = { id: "7300000000000000002", desc: "Web", author: { uniqueId: "otra" }, stats: { playCount: 10, diggCount: 2 }, video: { cover: "https://p16.tiktokcdn.com/x.jpg", playAddr: "https://v16-webapp.tiktok.com/v.mp4", duration: 12 } };
    const lista = videosDeRespuesta({ search_item_list: [{ aweme_info: AWEME }, { aweme_info: web }, { aweme_info: AWEME }, { nada: true }] });
    expect(lista.map((v) => v.id)).toEqual(["7300000000000000001", "7300000000000000002"]);
    expect(lista[1]).toMatchObject({ usuario: "otra", vistas: 10, meGusta: 2, duracion: 12, video: "https://v16-webapp.tiktok.com/v.mp4" });
    expect(videosDeRespuesta({ aweme_list: [AWEME] })).toHaveLength(1);
    expect(videosDeRespuesta({})).toEqual([]);
    expect(videoDelDetalle({ aweme_detail: AWEME }).id).toBe("7300000000000000001");
  });

  it("un archivo que no es de TikTok no se guarda; un video de fotos es un carrusel sin archivo", () => {
    const malo = videoTikTok({ ...AWEME, video: { ...AWEME.video, download_no_watermark_addr: { url_list: ["https://evil.example.com/v.mp4"] }, play_addr: null } });
    expect(malo.video).toBe("");
    const fotos = videoTikTok({ ...AWEME, image_post_info: { images: [{ display_image: { url_list: ["https://p16.tiktokcdn.com/f1.jpeg"] } }] } });
    expect(fotos).toMatchObject({ formato: "carrusel", video: "" });
    expect(esDeTikTok("https://v16m.tiktokcdn.com/v.mp4")).toBe(true);
    expect(esDeTikTok("http://v16m.tiktokcdn.com/v.mp4")).toBe(false);
    expect(esDeTikTok("https://tiktokcdn.com.evil.com/v.mp4")).toBe(false);
    expect(direccionDe({ url_list: ["no es", "https://p16.tiktokcdn.com/a.jpg"] })).toBe("https://p16.tiktokcdn.com/a.jpg");
  });

  it("la cuenta, del autor del primer video", () => {
    expect(cuentaTikTok({ aweme_list: [AWEME] })).toEqual({ nombre: "Mamá Tips", foto: "https://p16-sign-va.tiktokcdn.com/a.jpeg", seguidores: 52000, publicaciones: null });
  });
});

describe("«rinde» en vistas y la cifra de la tarjeta", () => {
  it("TikTok se mide por vistas contra la mediana de su cuenta", () => {
    expect(campoDeRendimiento("tiktok")).toBe("vistas");
    expect(campoDeRendimiento("instagram")).toBe("interacciones");
    const { mediana, publicaciones } = conRendimiento([{ vistas: 1000, interacciones: 1 }, { vistas: 2000, interacciones: 900 }, { vistas: 8000, interacciones: 2 }], { campo: "vistas" });
    expect(mediana).toBe(2000);
    expect(publicaciones.map((p) => p.rinde)).toEqual([0.5, 1, 4]);
  });

  it("una tendencia dice sus vistas en corto, sin mezclar unidades", () => {
    expect(cifraCorta(1234567)).toBe("1,2 M");
    expect(cifraCorta(45300)).toBe("45 mil");
    expect(cifraCorta(4500)).toBe("4,5 mil");
    expect(cifraCorta(850)).toBe("850");
    const c = cifraDe({ fuente: "tendencia", cifras: { vistas: 1234567, meGusta: 45300, compartidos: 1200, palabra: "#babyshower" } });
    expect(c.texto).toBe("1,2 M de vistas");
    expect(c.detalle).toBe("45 mil me gusta · 1,2 mil compartidos · por #babyshower");
    expect(cifraDe({ fuente: "tendencia", cifras: { vistas: 45300 } }).texto).toBe("45 mil vistas");
    expect(FUENTES.tendencia.nombre).toBe("Tendencia de TikTok");
  });

  it("la misma pieza de TikTok es UNA: seguida, en tendencia y guardada en el banco", () => {
    expect(claveDeInspiracion({ red: "tiktok", externo_id: "7300000000000000001" })).toBe("tt:7300000000000000001");
    expect(claveDeTendencia({ externo_id: "7300000000000000001" })).toBe("tt:7300000000000000001");
    const una = unirRepetidas([
      { clave: "tt:1", fuente: "referencia", clientes: ["c1"], senal: 1 },
      { clave: "tt:1", fuente: "tendencia", clientes: ["c2"], senal: 900 },
      { clave: "tt:1", fuente: "inspiracion", clientes: ["c1"], senal: 2 },
    ]);
    expect(una).toHaveLength(1);
    expect(una[0].fuente).toBe("inspiracion");
    expect(una[0].tambien.sort()).toEqual(["referencia", "tendencia"]);
  });

  it("el percentil de una tendencia se calcula dentro de SU fuente", () => {
    const r = conPercentiles([
      { fuente: "tendencia", senal: 1_000_000 }, { fuente: "tendencia", senal: 10 },
      { fuente: "anuncio", senal: 5 },
    ]);
    expect(r.map((x) => x.percentil)).toEqual([75, 25, 50]);
  });
});
