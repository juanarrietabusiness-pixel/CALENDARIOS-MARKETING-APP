import { describe, it, expect } from "vitest";
import { normalizacionesDe, conNormalizadas, adaptacionesDe, conAdaptados, necesitaCopiaTikTok, LADO_PUBLICAR, encajadaPendiente, conEncajada } from "./prepararRedes.js";
import { encajarEn, reducirEn } from "./encajarLienzo.js";

// ============================================================
// Lo que necesita una publicación para salir en cada red, como plan: lo ejecuta el navegador al programar y el
// Container al aprobarla el cliente («Programar al aprobar» sin pantalla). Mismas reglas en los dos.
// ============================================================

const img = (nombre, extra = {}) => ({ src: `/api/media/clientes/c1/posts/${nombre}`, tipo: "imagen", nombre, ...extra });

describe("normalizar: JPEG y medidas", () => {
  it("para Meta, lo que no es JPEG se convierte; un JPEG sin medidas sólo se mide; uno medido, nada", () => {
    const post = { format: "carrusel", medios: [img("a.png"), img("b.jpg"), img("c.jpg", { ancho: 1080, alto: 1350 })] };
    expect(normalizacionesDe(post, ["instagram"])).toEqual([
      { src: img("a.png").src, nombre: "a.png", convertir: true },
      { src: img("b.jpg").src, nombre: "b.jpg", convertir: false },
    ]);
  });

  it("para TikTok sólo se miden (la copia va aparte); la historia también entra para Meta", () => {
    expect(normalizacionesDe({ format: "carrusel", medios: [img("a.png")] }, ["tiktok"])).toEqual([{ src: img("a.png").src, nombre: "a.png", convertir: false }]);
    const conHistoria = { format: "post", medios: [img("a.jpg", { ancho: 1080, alto: 1350 })], historias: [img("h.png")] };
    expect(normalizacionesDe(conHistoria, ["instagram"]).map((n) => n.nombre)).toEqual(["h.png"]);
  });

  it("conNormalizadas pone lo nuevo en medios, image e historia, y mueve las copias adaptadas a la ruta nueva", () => {
    const viejo = img("a.png").src;
    const post = { medios: [img("a.png")], image: viejo, adaptados: { [`feed|${viejo}`]: { src: "/x.jpg" } } };
    const nuevo = conNormalizadas(post, new Map([[viejo, { src: "/api/media/clientes/c1/posts/n.jpg", nombre: "a.jpg", ancho: 900, alto: 1600 }]]));
    expect(nuevo.medios[0]).toMatchObject({ src: "/api/media/clientes/c1/posts/n.jpg", nombre: "a.jpg", ancho: 900, alto: 1600 });
    expect(nuevo.image).toBe("/api/media/clientes/c1/posts/n.jpg");
    expect(Object.keys(nuevo.adaptados)).toEqual(["feed|/api/media/clientes/c1/posts/n.jpg"]);
  });
});

describe("adaptar: las copias que faltan", () => {
  it("lo que no cabe en el feed se encaja a 4:5 con el ajuste de la publicación y el color de la marca", () => {
    const post = { format: "post", ajusteIG: "color", medios: [img("alta.jpg", { ancho: 1080, alto: 1920 })] };
    const a = adaptacionesDe(post, ["instagram", "facebook"], { colorMarca: "#123456" });
    expect(a).toEqual([{
      clave: `feed|${img("alta.jpg").src}`, src: img("alta.jpg").src, nombre: "alta-feed.jpg",
      salida: { tipo: "encajar", ancho: 1080, alto: 1350, modo: "color", color: "#123456" },
    }]);
  });

  it("la de IA no se pide sola (sin su copia, difuminado); la que ya está hecha con ese ajuste no se repite", () => {
    const alta = img("alta.jpg", { ancho: 1080, alto: 1920 });
    expect(adaptacionesDe({ format: "post", ajusteIG: "ia", medios: [alta] }, ["instagram"])[0].salida.modo).toBe("difuminado");
    const hecha = { format: "post", medios: [alta], adaptados: { [`feed|${alta.src}`]: { src: "/y.jpg", modo: "difuminado" } } };
    expect(adaptacionesDe(hecha, ["instagram"])).toEqual([]);
  });

  it("las fotos de TikTok de más de 1080p (o que no son JPEG) llevan su copia reducida", () => {
    const post = { format: "carrusel", medios: [img("g.jpg", { ancho: 2048, alto: 2048 }), img("p.jpg", { ancho: 1080, alto: 1080 })] };
    const a = adaptacionesDe(post, ["tiktok"]);
    expect(a.map((x) => x.clave)).toEqual([`tiktok|${img("g.jpg").src}`]);
    expect(a[0].salida).toEqual({ tipo: "reducir", maxAncho: 1080, maxAlto: 1920 });
    expect(necesitaCopiaTikTok(img("x.png", { ancho: 500, alto: 500 }))).toBe(true);
  });

  it("conAdaptados las apunta sin tocar las que había", () => {
    const post = { adaptados: { otra: { src: "/o.jpg" } } };
    const nuevo = conAdaptados(post, [{ clave: "feed|/a.jpg", src: "/b.jpg", ancho: 1080, alto: 1350, modo: "recorte" }]);
    expect(nuevo.adaptados).toEqual({ otra: { src: "/o.jpg" }, "feed|/a.jpg": { src: "/b.jpg", ancho: 1080, alto: 1350, modo: "recorte" } });
  });
});

describe("el dibujo (el mismo en el navegador y en el Container)", () => {
  /** Un lienzo de mentira que apunta lo que se dibuja. */
  const crear = (log) => (w, h) => ({ width: w, height: h, getContext: () => new Proxy({}, { get: (_, k) => (...a) => log.push([k, w, h, ...a.map((x) => (typeof x === "number" ? Math.round(x) : x))]), set: (_, k, v) => { log.push([`=${k}`, v]); return true; } }) });

  it("encajar con color: el fondo del color y la imagen entera, centrada", () => {
    const log = [];
    const l = encajarEn(crear(log), { width: 1080, height: 1920 }, { ancho: 1080, alto: 1350 }, "color", "#123456");
    expect([l.width, l.height]).toEqual([1080, 1350]);
    expect(log).toContainEqual(["=fillStyle", "#123456"]);
    const dibujo = log.find(([k]) => k === "drawImage");
    expect(dibujo.slice(4)).toEqual([160, 0, 759, 1350]);
  });

  it("difuminado: la misma imagen chiquita ampliada detrás; recorte: llena el lienzo", () => {
    const log = [];
    encajarEn(crear(log), { width: 1080, height: 1920 }, { ancho: 1080, alto: 1350 }, "difuminado");
    expect(log.filter(([k]) => k === "drawImage")).toHaveLength(3);
    const log2 = [];
    encajarEn(crear(log2), { width: 1080, height: 1920 }, { ancho: 1080, alto: 1350 }, "recorte");
    expect(log2.filter(([k]) => k === "drawImage")).toHaveLength(1);
  });

  it("reducir nunca agranda, y va sobre blanco (un PNG transparente no sale negro en JPEG)", () => {
    const log = [];
    expect([reducirEn(crear(log), { width: 800, height: 600 }, { maxAncho: LADO_PUBLICAR, maxAlto: LADO_PUBLICAR })].map((l) => [l.width, l.height])).toEqual([[800, 600]]);
    expect(log).toContainEqual(["=fillStyle", "#ffffff"]);
    expect([reducirEn(crear([]), { width: 4000, height: 3000 }, { maxAncho: 1080, maxAlto: 1920 })].map((l) => [l.width, l.height])).toEqual([[1080, 810]]);
  });
});


describe("la historia encajada de un post que recibe su imagen sin pantalla", () => {
  const a = img("a.jpg");
  const b = img("b.jpg");
  it("se crea cuando el post RECIBE su primera imagen; no en un reel, un carrusel ni si ya tenía historias", () => {
    expect(encajadaPendiente({ format: "post" }, { format: "post", medios: [a] })).toEqual({ que: "crear", base: a.src });
    expect(encajadaPendiente({ format: "post", medios: [a] }, { format: "post", medios: [a] })).toBeNull();
    expect(encajadaPendiente({ format: "reel" }, { format: "reel", medios: [a] })).toBeNull();
    expect(encajadaPendiente({ format: "post" }, { format: "carrusel", medios: [a, b] })).toBeNull();
    expect(encajadaPendiente({ format: "post" }, { format: "post", medios: [a], historias: [img("h.jpg")] })).toBeNull();
  });

  it("si cambia la imagen y la encajada sigue puesta, se rehace en su sitio", () => {
    const h = img("h.jpg");
    const antes = { format: "post", medios: [a], historias: [img("otra.jpg"), h], encajadaDe: { de: a.src, src: h.src } };
    const despues = { ...antes, medios: [b] };
    const p = encajadaPendiente(antes, despues);
    expect(p).toEqual({ que: "rehacer", base: b.src });
    const nueva = img("h2.jpg");
    const r = conEncajada(despues, p, nueva);
    expect(r.historias.map((x) => x.nombre)).toEqual(["otra.jpg", "h2.jpg"]);
    expect(r).toMatchObject({ historiaTambien: true, encajadaDe: { de: b.src, src: nueva.src } });
  });
});
