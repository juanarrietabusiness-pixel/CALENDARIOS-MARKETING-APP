import { describe, it, expect } from "vitest";
import {
  limpiarAjustes, proximaFecha, porPreparar, elegirPieza, elegirPiezas, publicacionDeRepost, imagenParaHistoria, fraseDe, FRASES_HISTORIA,
  estilosDePost, fraseDelPost, claveDeEstilo, baseDeClave, colorDeMarca,
} from "./historiasAuto";
import { conHistoria, mediosParaRed, publicacionDeVariante } from "./publicacion";

const IMG = "/api/media/clientes/c1/posts/a.jpg";
const fila = (extra = {}) => ({
  id: "f1", calendar_id: "cal1", post_id: "p1", red: "instagram", variante: "post", estado: "publicada",
  externo_id: "m1", publicada_at: "2026-10-01T15:00:00.000Z",
  carga: JSON.stringify({ post: { id: "p1", format: "post", title: "Lanzamiento", image: IMG } }), ...extra,
});

describe("los ajustes", () => {
  it("apagadas, a las 18:00 y en Instagram si no se dice otra cosa", () => {
    expect(limpiarAjustes({})).toEqual({ activa: false, hora: "18:00", redes: ["instagram"], porDia: 1 });
  });
  it("sólo redes con historias y horas que valen", () => {
    expect(limpiarAjustes({ activa: true, hora: "25:00", redes: ["tiktok", "facebook", "facebook"] }))
      .toEqual({ activa: true, hora: "18:00", redes: ["facebook"], porDia: 1 });
  });
});

describe("el día de la próxima", () => {
  it("hoy si a su hora le quedan más de diez minutos (hora de Panamá)", () => {
    // 12:00 UTC = 07:00 en Panamá.
    expect(proximaFecha("18:00", new Date("2026-10-05T12:00:00Z"))).toBe("2026-10-05");
  });
  it("mañana si ya pasó o está a punto", () => {
    expect(proximaFecha("18:00", new Date("2026-10-05T22:55:00Z"))).toBe("2026-10-06");
    expect(proximaFecha("07:00", new Date("2026-10-31T12:00:00Z"))).toBe("2026-11-01");
  });
  it("de noche en Panamá ya es otro día en UTC, y manda Panamá", () => {
    // 03:00 UTC del 6 = 22:00 del 5 en Panamá: lo de las 18:00 ya pasó → el 6.
    expect(proximaFecha("18:00", new Date("2026-10-06T03:00:00Z"))).toBe("2026-10-06");
    expect(proximaFecha("23:30", new Date("2026-10-06T03:00:00Z"))).toBe("2026-10-05");
  });
});

describe("qué se prepara", () => {
  it("lo publicado en el feed con imagen, una vez aunque saliera en dos redes", () => {
    const lista = porPreparar([fila({ id: "fb", red: "facebook", externo_id: "x" }), fila()], [], new Date("2026-10-05T00:00:00Z"));
    // Una publicación (aunque saliera en dos redes), con sus estilos: la de siempre primero y el detalle con su título.
    expect(lista.map((x) => x.estilo)).toEqual(["encajada", "detalle"]);
    expect(lista[0]).toMatchObject({ filaId: "f1", clavePost: "cal1|p1", src: IMG, externoId: "m1", titulo: "Lanzamiento" });
    expect(lista[1]).toMatchObject({ clavePost: "cal1|p1#detalle", frase: "Lanzamiento" });
  });
  it("ni lo ya preparado, ni historias, ni lo que no salió, ni lo de hace más de 90 días", () => {
    const filas = [
      fila(),
      fila({ id: "f2", post_id: "p2", variante: "historia" }),
      fila({ id: "f3", post_id: "p3", estado: "error" }),
      fila({ id: "f4", post_id: "p4", publicada_at: "2026-05-01T00:00:00.000Z" }),
      fila({ id: "f5", post_id: "p5", carga: JSON.stringify({ post: { format: "post", medios: [{ src: "data:image/png;base64,xx" }] } }) }),
    ];
    expect(porPreparar(filas, [{ clave_post: "cal1|p1" }, { clave_post: "cal1|p1#detalle" }], new Date("2026-10-05T00:00:00Z"))).toEqual([]);
  });
  it("de un video, su portada", () => {
    expect(imagenParaHistoria({ medios: [{ src: "/api/media/clientes/c1/posts/v.mp4", tipo: "video" }], portada: IMG })).toBe(IMG);
    expect(imagenParaHistoria({ medios: [{ src: "/api/media/clientes/c1/posts/v.mp4", tipo: "video" }] })).toBeNull();
  });
});

describe("historias NUEVAS de lo publicado (no la misma cada vez)", () => {
  const post = {
    format: "carrusel", title: "Tres errores al lavar el sofá",
    descripcion: "¿Lo lavas con agua caliente? 🔥 El agua caliente fija las manchas de grasa para siempre. #limpieza @marca",
    medios: [{ src: IMG, tipo: "imagen" }, { src: "/api/media/clientes/c1/posts/b.jpg", tipo: "imagen" }],
  };
  it("cada publicación da varios diseños: la de siempre, el detalle, una frase del post y otra lámina", () => {
    const e = estilosDePost(post);
    expect(e.map((x) => x.estilo)).toEqual(["encajada", "detalle", "cita", "lamina"]);
    expect(e.find((x) => x.estilo === "cita").texto).toBe("¿Lo lavas con agua caliente?");
    expect(e.find((x) => x.estilo === "lamina").src).toBe("/api/media/clientes/c1/posts/b.jpg");
    const lista = porPreparar([fila({ carga: JSON.stringify({ post }) })], [], new Date("2026-10-05T00:00:00Z"));
    expect(lista.map((x) => [x.clavePost, x.frase])).toEqual([
      ["cal1|p1", expect.any(String)], ["cal1|p1#detalle", "Tres errores al lavar el sofá"],
      ["cal1|p1#cita", "¿Lo lavas con agua caliente?"], ["cal1|p1#lamina", "Desliza en el post →"],
    ]);
  });
  it("sin hashtags, menciones, enlaces ni emojis; una sola imagen no da «otra lámina»", () => {
    expect(fraseDelPost({ descripcion: "Hola 👋 #x" })).toBe("");
    expect(estilosDePost({ medios: [{ src: IMG, tipo: "imagen" }] }).map((x) => x.estilo)).toEqual(["encajada", "detalle"]);
    expect([claveDeEstilo("a|b", "encajada"), claveDeEstilo("a|b", "cita"), baseDeClave("a|b#cita")]).toEqual(["a|b", "a|b#cita", "a|b"]);
  });
  it("los estilos de UN post no salen el mismo día ni seguidos: cuenta la publicación, no la pieza", () => {
    const ahora = new Date("2026-10-10T12:00:00Z");
    const p = (id, clave, extra = {}) => ({ id, clave_post: clave, usos: 0, publicada_at: "2026-09-01T00:00:00Z", ...extra });
    const piezas = [p("a1", "c|a", { usos: 1, usada_at: "2026-10-09T00:00:00Z" }), p("a2", "c|a#detalle"), p("b1", "c|b"), p("b2", "c|b#cita")];
    const hoy = elegirPiezas(piezas, 3, { momento: ahora });
    expect(hoy.map((x) => x.id)).toEqual(["b1"]);
    expect(colorDeMarca({ paleta: [{ hex: "#FFFFFF", rol: "fondo" }, { hex: "#0a5", rol: "x" }, { hex: "#123456", rol: "Color principal" }] })).toBe("#123456");
  });
});

describe("cuál sale", () => {
  const ahora = new Date("2026-10-10T12:00:00Z");
  const pieza = (id, extra = {}) => ({ id, usos: 0, externo_id: id, publicada_at: "2026-09-20T00:00:00Z", ...extra });
  it("la menos usada; a igualdad, la que mejor funcionó", () => {
    const piezas = [pieza("a", { usos: 1, usada_at: "2026-10-01T00:00:00Z" }), pieza("b"), pieza("c")];
    expect(elegirPieza(piezas, { momento: ahora, interacciones: new Map([["b", 10], ["c", 80]]) }).id).toBe("c");
  });
  it("ni lo publicado hace menos de dos días ni lo que salió hace menos de cuatro", () => {
    const piezas = [pieza("a", { publicada_at: "2026-10-09T12:00:00Z" }), pieza("b", { usos: 3, usada_at: "2026-10-08T00:00:00Z" })];
    expect(elegirPieza(piezas, { momento: ahora })).toBeNull();
  });
});

describe("lo que va a la cola", () => {
  it("es una historia que la cola sabe publicar: sus medios son la imagen hecha", () => {
    const post = publicacionDeRepost({ id: "h1", clave: "clientes/c1/posts/h.jpg", titulo: "Lanzamiento" }, "2026-10-05");
    expect(conHistoria(post)).toBe(true);
    expect(publicacionDeVariante(post, "historia").format).toBe("historia");
    expect(mediosParaRed(post, "instagram", "historia")).toEqual([
      { src: "/api/media/clientes/c1/posts/h.jpg", tipo: "imagen", nombre: "historia.jpg", ancho: 1080, alto: 1920 },
    ]);
  });
  it("las frases rotan", () => {
    expect(fraseDe(0)).toBe(FRASES_HISTORIA[0]);
    expect(fraseDe(FRASES_HISTORIA.length + 1)).toBe(FRASES_HISTORIA[1]);
  });
});

describe("varias historias al día", async () => {
  const { horasDelDia, elegirPiezas, limpiarAjustes } = await import("./historiasAuto");
  it("la primera a su hora y las demás cada 2 horas; si no caben antes de las 22:00, más juntas", () => {
    expect(horasDelDia("10:00", 1)).toEqual(["10:00"]);
    expect(horasDelDia("10:00", 3)).toEqual(["10:00", "12:00", "14:00"]);
    expect(horasDelDia("18:00", 5)).toEqual(["18:00", "19:00", "20:00", "21:00", "22:00"]);
    expect(horasDelDia("21:30", 3)).toEqual(["21:30", "22:00", "22:30"]);
  });
  it("de 1 a 5; lo de antes vale 1", () => {
    expect(limpiarAjustes({}).porDia).toBe(1);
    expect(limpiarAjustes({ porDia: 9 }).porDia).toBe(1);
    expect(limpiarAjustes({ porDia: "3" }).porDia).toBe(3);
  });
  it("cada historia del día es una publicación distinta", () => {
    const piezas = [{ id: "a", usos: 0 }, { id: "b", usos: 1 }, { id: "c", usos: 0 }];
    const r = elegirPiezas(piezas, 5, { momento: new Date("2026-11-03T12:00:00Z") });
    expect(r.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
  });
});
