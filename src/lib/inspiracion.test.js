import { describe, it, expect } from "vitest";
import {
  MAX_CUENTAS, cuentasDeReferencia, cuentaDeTexto, usuariosInstagram, usuariosParaMetricas, enlaceDePerfil, idDeCuenta,
  mediana, conRendimiento, etiquetaRinde, filtrarFeed, debeAvisar, ideaDeInspiracion, referenciasDe, enlaceDeYouTube,
  tituloDelResumen, paraResumen, pedidoDeResumen, leerResumen,
} from "./inspiracion.js";

describe("las cuentas fijas de un cliente", () => {
  it("lee lo de antes (@ sueltos de Instagram, de competencia) y lo de ahora, sin repetir y con tope", () => {
    const lista = cuentasDeReferencia([
      "@Rival.Cafe",
      { red: "youtube", usuario: "@CanalBueno", tipo: "inspiracion", nota: "  Ganchos  " },
      { red: "instagram", usuario: "rival.cafe", tipo: "inspiracion" }, // repetida
      { red: "tiktok", usuario: "@tienda" },
      { red: "instagram", usuario: "no vale!" },
      null, 42,
    ]);
    expect(lista).toEqual([
      { red: "instagram", usuario: "rival.cafe", tipo: "competencia", nota: "" },
      { red: "youtube", usuario: "canalbueno", tipo: "inspiracion", nota: "Ganchos" },
      { red: "tiktok", usuario: "tienda", tipo: "competencia", nota: "" },
    ]);
    const muchas = Array.from({ length: 14 }, (_, i) => `cuenta${i}`);
    expect(cuentasDeReferencia(muchas)).toHaveLength(MAX_CUENTAS);
    expect(cuentasDeReferencia("no es una lista")).toEqual([]);
  });

  it("entiende el @ o el enlace del perfil de cada red", () => {
    expect(cuentaDeTexto("@Muebles.X")).toEqual({ red: "instagram", usuario: "muebles.x" });
    expect(cuentaDeTexto("https://www.instagram.com/muebles.x/?hl=es")).toEqual({ red: "instagram", usuario: "muebles.x" });
    expect(cuentaDeTexto("https://www.instagram.com/reel/AbC123/")).toBeNull(); // es una publicación, no un perfil
    expect(cuentaDeTexto("https://www.tiktok.com/@la.tienda?lang=es")).toEqual({ red: "tiktok", usuario: "la.tienda" });
    expect(cuentaDeTexto("https://www.youtube.com/@CanalBueno/shorts")).toEqual({ red: "youtube", usuario: "canalbueno" });
    expect(cuentaDeTexto("https://www.youtube.com/channel/UC1234567890123456789012")).toEqual({ red: "youtube", usuario: "UC1234567890123456789012" });
    expect(cuentaDeTexto("canalbueno", "youtube")).toEqual({ red: "youtube", usuario: "canalbueno" });
    expect(cuentaDeTexto("")).toBeNull();
  });

  it("de Instagram se leen todas; la foto de Resultados mide sólo las de competencia", () => {
    const l = [{ red: "instagram", usuario: "a" }, { red: "instagram", usuario: "b", tipo: "inspiracion" }, { red: "youtube", usuario: "ccc" }];
    expect(usuariosInstagram(l)).toEqual(["a", "b"]);
    expect(usuariosParaMetricas(l)).toEqual(["a"]);
    expect(usuariosParaMetricas(["viejo"])).toEqual(["viejo"]);
  });

  it("el perfil y el id de la fila", () => {
    expect(enlaceDePerfil({ red: "tiktok", usuario: "x" })).toBe("https://www.tiktok.com/@x");
    expect(enlaceDePerfil({ red: "youtube", usuario: "canal" })).toBe("https://www.youtube.com/@canal");
    expect(idDeCuenta("c1", { red: "instagram", usuario: "Rival" })).toBe("c1:instagram:rival");
  });
});

describe("«rinde X× su promedio»", () => {
  it("se mide contra la MEDIANA de la propia cuenta: un viral no deja a las demás por debajo", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 100])).toBe(2.5);
    expect(mediana([])).toBeNull();
    const { mediana: m, publicaciones } = conRendimiento([
      { id: "a", interacciones: 100 }, { id: "b", interacciones: 100 }, { id: "c", interacciones: 1000 }, { id: "d", interacciones: 50 },
    ]);
    expect(m).toBe(100);
    expect(publicaciones.map((p) => p.rinde)).toEqual([1, 1, 10, 0.5]);
    expect(etiquetaRinde(3.2)).toBe("3,2×");
    expect(etiquetaRinde(null)).toBe("");
  });

  it("con menos de tres publicaciones no hay promedio que valga", () => {
    expect(conRendimiento([{ interacciones: 10 }, { interacciones: 20 }]).publicaciones.map((p) => p.rinde)).toEqual([null, null]);
  });
});

describe("el feed", () => {
  const items = [
    { id: "1", red: "instagram", usuario: "a", formato: "reel", rinde: 1, fecha: "2026-10-20T10:00:00Z" },
    { id: "2", red: "instagram", usuario: "b", formato: "imagen", rinde: 4, fecha: "2026-10-10T10:00:00Z" },
    { id: "3", red: "youtube", usuario: "canal", formato: "short", rinde: null, fecha: "2026-10-25T10:00:00Z" },
  ];
  it("ordena por lo que más funcionó o por lo más nuevo, y filtra por cuenta, formato y última visita", () => {
    expect(filtrarFeed(items).map((p) => p.id)).toEqual(["2", "1", "3"]);
    expect(filtrarFeed(items, { orden: "nuevo" }).map((p) => p.id)).toEqual(["3", "1", "2"]);
    expect(filtrarFeed(items, { cuenta: "instagram:a" }).map((p) => p.id)).toEqual(["1"]);
    expect(filtrarFeed(items, { formato: "short" }).map((p) => p.id)).toEqual(["3"]);
    expect(filtrarFeed(items, { desde: "2026-10-15T00:00:00Z" }).map((p) => p.id)).toEqual(["1", "3"]);
  });

  it("avisa de lo nuevo que rinde 3× o más, una vez", () => {
    const ahora = Date.parse("2026-10-26T12:00:00Z");
    expect(debeAvisar({ rinde: 3.5, fecha: "2026-10-24T00:00:00Z" }, ahora)).toBe(true);
    expect(debeAvisar({ rinde: 3.5, fecha: "2026-10-24T00:00:00Z", avisado: 1 }, ahora)).toBe(false);
    expect(debeAvisar({ rinde: 2.9, fecha: "2026-10-24T00:00:00Z" }, ahora)).toBe(false);
    expect(debeAvisar({ rinde: 9, fecha: "2026-09-01T00:00:00Z" }, ahora)).toBe(false); // viejo: no es noticia
    expect(debeAvisar({ rinde: 9, publicada_at: "2026-10-25T00:00:00Z" }, ahora)).toBe(true);
  });
});

describe("llevarla al calendario", () => {
  it("su archivo va como REFERENCIA, con de dónde salió; nunca entre lo que se publica", () => {
    const p = { red: "instagram", usuario: "rival", formato: "reel", rinde: 3.2, texto: "Tres errores al  comprar un sofá", enlace: "https://www.instagram.com/reel/AbC/" };
    const idea = ideaDeInspiracion(p, { id: "a1", src: "/api/media/clientes/c1/r.mp4", tipo: "video" }, "i1");
    expect(idea).toMatchObject({ id: "i1", format: "reel", referenceLink: p.enlace, status: "pending" });
    expect(idea.idea).toBe("Referencia de @rival (rinde 3,2× su promedio): «Tres errores al comprar un sofá»");
    expect(idea.referencias).toEqual([{ src: "/api/media/clientes/c1/r.mp4", tipo: "video", id: "a1", cuenta: "@rival", enlace: p.enlace }]);
    expect(idea.medios).toBeUndefined();
    expect(ideaDeInspiracion({ ...p, formato: "carrusel" }).format).toBe("carrusel");
    expect(ideaDeInspiracion({ ...p, formato: "imagen" }).referencias).toEqual([]);
  });

  it("las referencias de una publicación: limpias, sin repetir y con tope", () => {
    const post = {
      referencias: [{ src: "/a.mp4", tipo: "video" }],
      archivos: [{ src: "/a.mp4", tipo: "video" }, { src: "/b.jpg" }, { nada: true }],
    };
    expect(referenciasDe(post)).toEqual([{ src: "/a.mp4", tipo: "video" }, { src: "/b.jpg", tipo: "imagen" }]);
    expect(referenciasDe({})).toEqual([]);
  });
});

describe("YouTube por su enlace", () => {
  it("sólo videos públicos en la forma que entiende Gemini", () => {
    expect(enlaceDeYouTube("https://www.youtube.com/shorts/abcdefghijk")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(enlaceDeYouTube("https://youtu.be/abcdefghijk?si=x")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(enlaceDeYouTube("https://www.youtube.com/watch?feature=x&v=abcdefghijk")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(enlaceDeYouTube("https://evil.com/watch?v=abcdefghijk")).toBe("");
    expect(enlaceDeYouTube("https://www.youtube.com/@canal")).toBe("");
  });
});

describe("«Lo que funciona en tu competencia»", () => {
  it("una nota por mes, con lo que más rindió hace poco, y sin nombrar cuentas", () => {
    expect(tituloDelResumen("2026-10")).toBe("Lo que funciona en tu competencia · octubre 2026");
    const ahora = Date.parse("2026-10-26T12:00:00Z");
    const pubs = [
      { id: "1", rinde: 1, fecha: "2026-10-20" }, { id: "2", rinde: 5, fecha: "2026-10-01" },
      { id: "3", rinde: 9, fecha: "2026-06-01" }, { id: "4", rinde: null, fecha: "2026-10-22" },
    ];
    expect(paraResumen(pubs, { ahora }).map((p) => p.id)).toEqual(["2", "1"]);
    const pedido = pedidoDeResumen({ marca: "Dcasa", rubro: "Muebles", publicaciones: [{ formato: "reel", rinde: 4, texto: "Hola @rival", tipoCuenta: "competencia" }] });
    expect(pedido).toContain("Dcasa (Muebles)");
    expect(pedido).toContain("rinde 4× su promedio");
    expect(pedido).toMatch(/NO nombres cuentas, marcas/);
    expect(leerResumen("```\n- Gancho con pregunta\n```")).toBe("- Gancho con pregunta");
  });
});
