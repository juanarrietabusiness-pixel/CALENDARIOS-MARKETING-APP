import { describe, it, expect } from "vitest";
import {
  claveDeEnlace, claveDeInspiracion, claveDePropia, formatoComun, rindeAjustado, diasDeAnuncio, senalDeAnuncio, conPercentiles,
  enVentana, ordenarLoMejor, filtrarLoMejor, unirRepetidas, cifraDe, marcarMejoresPropias, caminosPosibles, caminoPorDefecto,
  proximoDiaLibre, semanaDe, pedidoDeClasificacion, leerClasificacion, ideaDeLoMejor, miniaturaPermitida, videoPermitido,
  proxyMiniatura, proxyVideo, briefDeRecreacion, nombreDelTipo, TIPOS_LO_MEJOR, CAMINOS,
} from "./loMejor.js";

const HOY = "2026-11-05";

describe("la identidad de una pieza", () => {
  it("la misma publicación es la misma clave venga de donde venga", () => {
    expect(claveDeEnlace("https://www.instagram.com/reel/ABC123/?igsh=xyz")).toBe("ig:ABC123");
    expect(claveDeEnlace("https://instagram.com/cuenta/p/ABC123/")).toBe("ig:ABC123");
    expect(claveDeInspiracion({ red: "instagram", codigo: "ABC123", externo_id: "9" })).toBe("ig:ABC123");
    expect(claveDeEnlace("https://youtu.be/aaaaaaaaaaa")).toBe("yt:aaaaaaaaaaa");
    expect(claveDeInspiracion({ red: "youtube", externo_id: "aaaaaaaaaaa" })).toBe("yt:aaaaaaaaaaa");
    expect(claveDeEnlace("https://www.facebook.com/ads/library/?id=12345")).toBe("fb-ad:12345");
    expect(claveDeEnlace("https://www.tiktok.com/@x/video/7300000000000000001")).toBe("tt:7300000000000000001");
    // Un enlace cualquiera, por su forma limpia (sin lo que va detrás del «?»).
    expect(claveDeEnlace("https://web.com/a?b=1")).toBe(claveDeEnlace("https://web.com/a/"));
    expect(claveDePropia({ red: "facebook", externo_id: "77", enlace: "https://facebook.com/x/posts/77" })).toBe("facebook:77");
  });

  it("tres formatos comunes", () => {
    expect(["reel", "short", "video"].map(formatoComun)).toEqual(["video", "video", "video"]);
    expect(formatoComun("carrusel")).toBe("carrusel");
    expect(formatoComun("post")).toBe("imagen");
  });
});

describe("señales y percentiles", () => {
  it("«rinde» se acerca a lo normal con pocas publicaciones", () => {
    expect(rindeAjustado(5, 3)).toBeLessThan(rindeAjustado(5, 30));
    expect(rindeAjustado(5, 30)).toBeLessThan(5);
    expect(rindeAjustado(null, 10)).toBeNull();
  });

  it("un anuncio: los días que lleva, más si sigue activo y si tiene versiones", () => {
    expect(diasDeAnuncio({ inicio: "2026-09-03", activo: true }, HOY)).toBe(63);
    expect(diasDeAnuncio({ inicio: "2026-09-03", fin: "2026-09-13", activo: false }, HOY)).toBe(10);
    expect(senalDeAnuncio({ inicio: "2026-09-03", activo: true, versiones: 3 }, HOY)).toBeGreaterThan(senalDeAnuncio({ inicio: "2026-09-03", activo: false, versiones: 1 }, HOY));
  });

  it("el percentil es DENTRO de cada fuente: «4×» y «63 días» no se comparan", () => {
    const r = conPercentiles([
      { clave: "a", fuente: "inspiracion", senal: 4 }, { clave: "b", fuente: "inspiracion", senal: 1 },
      { clave: "c", fuente: "anuncio", senal: 63 }, { clave: "d", fuente: "anuncio", senal: 200 }, { clave: "e", fuente: "propia", senal: null },
    ]);
    const p = Object.fromEntries(r.map((x) => [x.clave, x.percentil]));
    expect(p.a).toBe(p.d);
    expect(p.b).toBe(p.c);
    expect(p.a).toBeGreaterThan(p.b);
    expect(p.e).toBeNull();
  });

  it("la ventana y el orden", () => {
    const items = [
      { clave: "x", fuente: "inspiracion", senal: 1, fecha: "2026-11-04T10:00:00Z" },
      { clave: "y", fuente: "inspiracion", senal: 9, fecha: "2026-10-20T10:00:00Z" },
      { clave: "z", fuente: "inspiracion", senal: 5, fecha: "2026-11-03T10:00:00Z" },
    ];
    expect(enVentana(items[1], "semana", HOY)).toBe(false);
    expect(enVentana(items[1], "mes", HOY)).toBe(true);
    expect(ordenarLoMejor(items, "semana", HOY).map((i) => i.clave)).toEqual(["z", "x"]);
    expect(ordenarLoMejor(items, "mes", HOY).map((i) => i.clave)).toEqual(["y", "z", "x"]);
    expect(ordenarLoMejor(items, "nuevo", HOY).map((i) => i.clave)).toEqual(["x", "z", "y"]);
  });

  it("una pieza repetida es UNA, con los clientes de todas y la fuente que mejor mide", () => {
    const [u] = unirRepetidas([
      { clave: "ig:A", fuente: "referencia", clientes: ["c3"], miniatura: "" },
      { clave: "ig:A", fuente: "inspiracion", clientes: ["c1"], senal: 3, miniatura: "/m" },
      { clave: "ig:A", fuente: "inspiracion", clientes: ["c2"], senal: 3 },
    ]);
    expect(u.fuente).toBe("inspiracion");
    expect(u.clientes.sort()).toEqual(["c1", "c2", "c3"]);
    expect(u.tambien).toEqual(["referencia"]);
    expect(u.miniatura).toBe("/m");
  });

  it("los filtros (también por fuente secundaria) y «tu mejor de…» una por cliente", () => {
    const items = [{ clave: "a", clientes: ["c1"], red: "instagram", formato: "video", tipo: "ugc", fuente: "inspiracion", tambien: ["referencia"] }];
    expect(filtrarLoMejor(items, { cliente: "c1", tipo: "ugc", fuente: "referencia" })).toHaveLength(1);
    expect(filtrarLoMejor(items, { cliente: "c2" })).toHaveLength(0);
    const propias = marcarMejoresPropias([{ fuente: "propia", clientes: ["c1"] }, { fuente: "propia", clientes: ["c1"] }, { fuente: "propia", clientes: ["c2"] }], "mes");
    expect(propias.map((p) => p.mejorDe ?? "")).toEqual(["mes", "", "mes"]);
  });
});

describe("la cifra de la tarjeta, sin mezclar unidades", () => {
  it("cada fuente con la suya", () => {
    expect(cifraDe({ fuente: "inspiracion", rinde: 4.1, cifras: {} }).texto).toBe("rinde 4,1×");
    expect(cifraDe({ fuente: "inspiracion", rindeVistas: 3, cifras: { vistas: 9000 } }).texto).toBe("rinde 3× en vistas");
    const ad = cifraDe({ fuente: "anuncio", cifras: { dias: 63, activo: true, versiones: 3 } });
    expect(ad).toEqual({ texto: "63 días activo", detalle: "sigue activo · 3 versiones" });
    expect(cifraDe({ fuente: "propia", mejorDe: "mes", cifras: { guardados: 30 } }).texto).toBe("Tu mejor del mes");
    expect(cifraDe({ fuente: "referencia", cifras: {} }).texto).toBe("Guardada por el equipo");
  });
});

describe("cómo se recrea", () => {
  it("grabar sólo si se puede ver el video; el camino del tipo, del formato o de la persona", () => {
    expect(caminosPosibles({ conVideo: false })).not.toContain("grabar");
    expect(caminosPosibles({ conVideo: true })).toContain("grabar");
    expect(caminoPorDefecto({ formato: "carrusel" })).toBe("carrusel");
    expect(caminoPorDefecto({ formato: "video", conVideo: true, persona: true })).toBe("grabar");
    expect(caminoPorDefecto({ formato: "video", conVideo: false, tipo: "ugc" })).toBe("animado");
    expect(caminoPorDefecto({ formato: "video", conVideo: true, tipo: "motion" })).toBe("animado");
    expect(caminoPorDefecto({ formato: "imagen", tipo: "educativo" })).toBe("carrusel");
    expect(caminoPorDefecto({ formato: "imagen", tipo: "anuncio" })).toBe("imagen");
    // Todo tipo tiene un camino que existe (o ninguno: «otro»).
    for (const t of TIPOS_LO_MEJOR) expect(t.camino === "" || Boolean(CAMINOS[t.camino])).toBe(true);
  });

  it("el encargo no copia: la misma idea con la marca, sin su texto ni su marca", () => {
    const b = briefDeRecreacion({ fuente: "inspiracion", rinde: 4, cifras: {}, cuenta: "@otra", texto: "Compra X", idea: "Pregunta y respuesta" }, { marca: "Dcasa" });
    expect(b).toContain("Dcasa");
    expect(b).toContain("NO se copia");
    expect(b).toMatch(/Nada de su marca/);
  });

  it("el próximo día libre y la semana del tope", () => {
    expect(proximoDiaLibre(["2026-11-06", "2026-11-07"], "2026-11-06")).toBe("2026-11-08");
    expect(semanaDe("2026-11-05")).toBe("2026-11-02"); // jueves → lunes
    expect(semanaDe("2026-11-08")).toBe("2026-11-02"); // domingo → el lunes de antes
    expect(semanaDe("2026-11-09")).toBe("2026-11-09");
  });
});

describe("la clasificación", () => {
  it("el pedido nombra todos los tipos y la respuesta sólo vale para las piezas que hay", () => {
    const pedido = pedidoDeClasificacion([{ formato: "video", red: "instagram", texto: "Hola", miniatura: true }]);
    for (const t of TIPOS_LO_MEJOR) expect(pedido).toContain(t.id);
    const r = leerClasificacion('```json\n{"piezas":[{"n":1,"tipo":"pov","persona":true,"idea":"x"},{"n":2,"tipo":"inventado","otro":"Unboxing ASMR"},{"n":9,"tipo":"ugc"}]}\n```', 2);
    expect(r[1]).toEqual({ tipo: "pov", etiqueta: "", persona: true, idea: "x" });
    expect(r[2].tipo).toBe("otro");
    expect(r[2].etiqueta).toBe("Unboxing ASMR");
    expect(r[9]).toBeUndefined();
    expect(nombreDelTipo({ tipo: "otro", etiqueta: "Unboxing ASMR" })).toBe("Unboxing ASMR");
    expect(leerClasificacion("nada", 3)).toEqual({});
  });
});

describe("al banco y a la pantalla", () => {
  it("la idea lleva la cifra, la miniatura y el archivo como REFERENCIA", () => {
    const i = ideaDeLoMejor({ clave: "ig:A", fuente: "inspiracion", formato: "video", rinde: 4.1, cifras: {}, enlace: "https://www.instagram.com/reel/A/", miniaturaOriginal: "https://x.cdninstagram.com/a.jpg", cuenta: "@otra", tipo: "ugc" },
      { id: "i1", archivo: { id: "f1", src: "/api/media/clientes/c1/a.mp4", tipo: "video" } });
    expect(i).toMatchObject({ format: "reel", rinde: 4.1, cifra: "rinde 4,1×", miniatura: "https://x.cdninstagram.com/a.jpg", referenceLink: "https://www.instagram.com/reel/A/" });
    expect(i.archivos[0]).toMatchObject({ id: "f1", tipo: "video" });
    expect(i.medios).toBeUndefined();
  });

  it("sólo las miniaturas y los videos de los CDN de siempre pasan por los proxys", () => {
    expect(miniaturaPermitida("https://scontent.cdninstagram.com/a.jpg")).toBe(true);
    expect(miniaturaPermitida("https://i.ytimg.com/a.jpg")).toBe(true);
    expect(miniaturaPermitida("http://scontent.cdninstagram.com/a.jpg")).toBe(false);
    expect(miniaturaPermitida("https://evil.com/a.jpg")).toBe(false);
    expect(videoPermitido("https://video.xx.fbcdn.net/v.mp4")).toBe(true);
    expect(videoPermitido("https://i.ytimg.com/v.mp4")).toBe(false);
    expect(proxyMiniatura("https://evil.com/a.jpg")).toBe("");
    expect(proxyVideo("https://scontent.cdninstagram.com/v.mp4").startsWith("/api/lo-mejor/video?u=")).toBe(true);
  });
});
