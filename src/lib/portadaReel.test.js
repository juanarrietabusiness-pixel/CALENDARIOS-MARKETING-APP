import { describe, it, expect, vi, afterEach } from "vitest";
import {
  esReelConVideo, conPortada, imagenDelReelAPortada, portadaPorConvertir, revisarPublicacion, aplicarArreglo, mediosDe,
} from "./publicacion.js";
import { postConPiezas, REEL_SIN_IMAGENES } from "./galeriaPura.js";
import { conVideoEnPost } from "./resultadoEnPost.js";
import { normalizacionesDe, conNormalizadas } from "./prepararRedes.js";
import { modoDePoner, publicacionesParaPoner } from "./ponerPiezas.js";
import { prepararParaRedes } from "./medios.js";

// ============================================================
// La PORTADA de un reel: una imagen en un reel con su video es su portada, no un medio más
//
// Lo que pasó en producción: Claude diseñó portadas 9:16 y las puso con `poner_en_publicacion`; cada reel quedó con
// `medios: [video, imagen]` y `portada: null`, salió sin portada y uno como un carrusel. La regla es UNA
// (`postConPiezas`), la red de seguridad está en `revisarPublicacion` y la portada se pasa a JPEG al programar.
// ============================================================

const VIDEO = { src: "/api/media/clientes/c1/posts/v.mp4", tipo: "video", nombre: "v.mp4", deReel: "e1" };
const IMG = (n, ext = "png") => ({ src: `/api/media/clientes/c1/estudio/${n}.${ext}`, tipo: "imagen", nombre: `${n}.${ext}` });
const ARCHIVO = (n, mime = "image/png") => ({ id: n, src: `/api/media/clientes/c1/estudio/${n}.png`, mime, prompt: `pieza ${n}`, ancho: 1080, alto: 1920 });
const reel = (extra = {}) => ({ id: "p1", format: "reel", medios: [VIDEO], ...extra });

describe("¿sale como reel con su video?", () => {
  it("un reel con video, o un post con UN solo video (Instagram lo publica como reel)", () => {
    expect(esReelConVideo(reel())).toBe(true);
    expect(esReelConVideo({ format: "post", medios: [VIDEO] })).toBe(true);
    expect(esReelConVideo({ medios: [VIDEO] })).toBe(true);
    expect(esReelConVideo(reel({ medios: [VIDEO, IMG("a")] }))).toBe(true);
  });
  it("ni un reel sin video, ni un carrusel, ni una historia, ni un post con un video y una imagen (es un carrusel)", () => {
    expect(esReelConVideo({ format: "reel", medios: [IMG("a")] })).toBe(false);
    expect(esReelConVideo({ format: "carrusel", medios: [VIDEO] })).toBe(false);
    expect(esReelConVideo({ format: "historia", medios: [VIDEO] })).toBe(false);
    expect(esReelConVideo({ format: "post", medios: [VIDEO, IMG("a")] })).toBe(false);
  });
});

describe("conPortada e imagenDelReelAPortada", () => {
  it("pone la portada sin fotograma ni encuadre y la saca de los medios, sin perder las marcas del video", () => {
    const p = conPortada(reel({ medios: [VIDEO, IMG("a")], portadaMs: 1200, portadaEncuadre: 0.4 }), IMG("a").src);
    expect(p).toMatchObject({ portada: IMG("a").src, portadaMs: null, portadaEncuadre: 0 });
    expect(p.medios).toEqual([VIDEO]);
    expect(p.image).toBeNull();
  });
  it("una imagen suelta de un reel con video pasa a portada; con varias o sin video, nada", () => {
    expect(imagenDelReelAPortada(reel({ medios: [VIDEO, IMG("a")] }))).toMatchObject({ portada: IMG("a").src, medios: [VIDEO] });
    const dos = reel({ medios: [VIDEO, IMG("a"), IMG("b")] });
    expect(imagenDelReelAPortada(dos)).toBe(dos);
    const sinVideo = { format: "reel", medios: [IMG("a")] };
    expect(imagenDelReelAPortada(sinVideo)).toBe(sinVideo);
    const post = { format: "post", medios: [VIDEO, IMG("a")] };
    expect(imagenDelReelAPortada(post)).toBe(post);
  });
});

describe("la regla al PONER piezas (postConPiezas: chat, MCP, Estudio y lo que el servidor pone solo)", () => {
  it("UNA imagen a un reel que ya tiene su video es su PORTADA, en «añadir» y en «reemplazar» (no le quita el video)", () => {
    for (const modo of ["anadir", "reemplazar"]) {
      const r = postConPiezas(reel(), [ARCHIVO("a")], modo);
      expect(r.portada, modo).toBe(true);
      expect(r.post.portada).toBe(ARCHIVO("a").src);
      expect(mediosDe(r.post).map((m) => m.src)).toEqual([VIDEO.src]);
      expect(r.post.medios[0].deReel).toBe("e1");
      expect(r.post.format).toBe("reel");
    }
  });
  it("también a un post con UN video (sale como reel)", () => {
    expect(postConPiezas({ format: "post", medios: [VIDEO] }, [ARCHIVO("a")], "anadir").portada).toBe(true);
  });
  it("varias imágenes a un reel con su video: error que dice que un reel no lleva imágenes", () => {
    const r = postConPiezas(reel(), [ARCHIVO("a"), ARCHIVO("b")], "anadir");
    expect(r.error).toBe(REEL_SIN_IMAGENES);
    expect(r.error).toMatch(/no lleva imágenes.*portada/);
    expect(r.post).toBeUndefined();
  });
  it("como: «portada» explícito: una imagen; si no hay reel con video, o son varias, o es un video, error", () => {
    expect(postConPiezas(reel(), [ARCHIVO("a")], "reemplazar", { como: "portada" })).toMatchObject({ portada: true, post: { portada: ARCHIVO("a").src } });
    expect(postConPiezas({ format: "post", medios: [IMG("x")] }, [ARCHIVO("a")], "reemplazar", { como: "portada" }).error).toMatch(/no lleva portada/);
    expect(postConPiezas({ format: "historia", medios: [VIDEO] }, [ARCHIVO("a")], "reemplazar", { como: "portada" }).error).toMatch(/historia no lleva portada/);
    expect(postConPiezas(reel(), [ARCHIVO("a"), ARCHIVO("b")], "reemplazar", { como: "portada" }).error).toMatch(/UNA imagen/);
    expect(postConPiezas(reel(), [ARCHIVO("v", "video/mp4")], "reemplazar", { como: "portada" }).error).toMatch(/UNA imagen/);
  });
  it("como: «medio» (lo escogió una persona): entre los archivos de un post con un video; en un reel, nunca", () => {
    const mixto = postConPiezas({ format: "post", medios: [VIDEO] }, [ARCHIVO("a")], "anadir", { como: "medio" });
    expect(mixto.portada).toBeUndefined();
    expect(mediosDe(mixto.post)).toHaveLength(2);
    expect(postConPiezas(reel(), [ARCHIVO("a")], "anadir", { como: "medio" }).error).toBe(REEL_SIN_IMAGENES);
    // Reemplazar el video por la imagen sí se puede (lo decidió la persona).
    expect(mediosDe(postConPiezas(reel(), [ARCHIVO("a")], "reemplazar", { como: "medio" }).post)).toHaveLength(1);
  });
  it("un reel que aún no tenía video y le llegan el video y una imagen: la imagen va de portada", () => {
    const r = postConPiezas({ format: "reel", medios: [] }, [ARCHIVO("v", "video/mp4"), ARCHIVO("a")], "reemplazar");
    expect(r.portada).toBe(true);
    expect(r.post.portada).toBe(ARCHIVO("a").src);
    expect(mediosDe(r.post).map((m) => m.tipo)).toEqual(["video"]);
  });
  it("lo de siempre no cambia: imágenes a un post (dos hacen carrusel), a un reel sin video, a una historia con video", () => {
    expect(postConPiezas({ format: "post" }, [ARCHIVO("a"), ARCHIVO("b")]).post.format).toBe("carrusel");
    expect(mediosDe(postConPiezas({ format: "reel", medios: [] }, [ARCHIVO("a"), ARCHIVO("b")]).post)).toHaveLength(2);
    const historia = postConPiezas({ format: "historia", medios: [VIDEO] }, [ARCHIVO("a")], "anadir");
    expect(historia.portada).toBeUndefined();
    expect(mediosDe(historia.post)).toHaveLength(2);
  });
});

describe("la red de seguridad al programar (revisarPublicacion)", () => {
  it("un reel con una imagen además de su video: error con el arreglo «Usar la imagen como portada»", () => {
    const post = reel({ descripcion: "x", medios: [VIDEO, IMG("a")] });
    for (const navegador of [true, false]) {
      const r = revisarPublicacion(post, ["instagram"], { navegador });
      expect(r.errores).toContain("Un reel no lleva imágenes: ¿es la portada?");
      expect(r.arreglos["Un reel no lleva imágenes: ¿es la portada?"]).toEqual({ codigo: "portada-reel", etiqueta: "Usar la imagen como portada" });
    }
    const arreglado = aplicarArreglo(post, "portada-reel");
    expect(arreglado).toMatchObject({ portada: IMG("a").src, portadaMs: null });
    expect(mediosDe(arreglado)).toEqual([expect.objectContaining({ src: VIDEO.src })]);
    expect(revisarPublicacion(arreglado, ["instagram"]).errores).toEqual([]);
  });
  it("varias imágenes en un reel: error con «Publicarlo como carrusel»", () => {
    const post = reel({ descripcion: "x", medios: [VIDEO, IMG("a"), IMG("b")] });
    const r = revisarPublicacion(post, ["instagram"]);
    const texto = r.errores.find((t) => /Un reel no lleva imágenes y éste tiene 2/.test(t));
    expect(r.arreglos[texto]).toEqual({ codigo: "formato:carrusel", etiqueta: "Publicarlo como carrusel" });
  });
  it("sólo para Instagram: TikTok sigue con su aviso de que publica sólo el video", () => {
    const r = revisarPublicacion(reel({ descripcion: "x", medios: [VIDEO, IMG("a")] }), ["tiktok"]);
    expect(r.errores).toEqual([]);
  });
  it("un reel con su portada aparte no tiene nada que arreglar", () => {
    expect(revisarPublicacion(reel({ descripcion: "x", portada: IMG("a", "jpg").src }), ["instagram"]).errores).toEqual([]);
  });
});

describe("la portada se pasa a JPEG (Instagram sólo la lee así en `cover_url`)", () => {
  it("portadaPorConvertir: sólo una portada que no es JPEG, de un reel que va a Instagram", () => {
    expect(portadaPorConvertir(reel({ portada: IMG("a").src }), ["instagram"])).toBe(IMG("a").src);
    expect(portadaPorConvertir(reel({ portada: IMG("a", "webp").src }), ["instagram", "facebook"])).toBe(IMG("a", "webp").src);
    expect(portadaPorConvertir(reel({ portada: IMG("a", "jpg").src }), ["instagram"])).toBeNull();
    expect(portadaPorConvertir(reel({ portada: IMG("a").src }), ["tiktok", "youtube"])).toBeNull();
    expect(portadaPorConvertir({ format: "carrusel", medios: [IMG("x"), IMG("y")], portada: IMG("a").src }, ["instagram"])).toBeNull();
    expect(portadaPorConvertir(reel(), ["instagram"])).toBeNull();
    expect(revisarPublicacion(reel({ descripcion: "x", portada: IMG("a").src }), ["instagram"]).avisos.join(" ")).toMatch(/portada en JPEG/);
  });
  it("el plan del Container la convierte y conNormalizadas la pone en su sitio", () => {
    const post = reel({ portada: IMG("a").src });
    expect(normalizacionesDe(post, ["instagram"])).toEqual([{ src: IMG("a").src, nombre: "portada", convertir: true }]);
    expect(normalizacionesDe(post, ["tiktok"])).toEqual([]);
    const nuevo = conNormalizadas(post, new Map([[IMG("a").src, { src: "/api/media/clientes/c1/posts/n.jpg", nombre: "portada.jpg", ancho: 1080, alto: 1920 }]]));
    expect(nuevo.portada).toBe("/api/media/clientes/c1/posts/n.jpg");
    expect(mediosDe(nuevo)).toEqual([expect.objectContaining({ src: VIDEO.src })]);
  });

  afterEach(() => { vi.unstubAllGlobals(); });
  it("en el navegador (prepararParaRedes): la portada PNG se dibuja en JPEG y se sube; el video no se toca", async () => {
    const leidas = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => { leidas.push(url); return new Response(new Blob(["png"])); }));
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1080, height: 1920, close() {} })));
    const ctx = { fillRect() {}, drawImage() {}, set fillStyle(_v) {}, set imageSmoothingQuality(_v) {} };
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toBlob: (ok) => ok(new Blob(["jpeg"], { type: "image/jpeg" })) }) });
    const subidas = [];
    const subir = vi.fn(async (f) => { subidas.push(f); return "/api/media/clientes/c1/posts/portada-nueva.jpg"; });
    const { post, cambio } = await prepararParaRedes(reel({ portada: IMG("a").src }), ["instagram"], { subir });
    expect(cambio).toBe(true);
    expect(post.portada).toBe("/api/media/clientes/c1/posts/portada-nueva.jpg");
    expect(subidas).toHaveLength(1);
    expect(subidas[0].type).toBe("image/jpeg");
    expect(leidas).toEqual([IMG("a").src]);
    expect(post.medios).toEqual([VIDEO]);
    // Ya en JPEG: nada que hacer.
    subir.mockClear();
    const otra = await prepararParaRedes(reel({ portada: "/api/media/clientes/c1/posts/p.jpg" }), ["instagram"], { subir });
    expect(otra.cambio).toBe(false);
    expect(subir).not.toHaveBeenCalled();
  });
});

describe("cuando el video llega DESPUÉS de la imagen (conVideoEnPost)", () => {
  it("la imagen que esperaba en el reel pasa a su portada, si no tenía", () => {
    const r = conVideoEnPost({ format: "reel", medios: [IMG("a")] }, VIDEO);
    expect(r.portada).toBe(IMG("a").src);
    expect(mediosDe(r).map((m) => m.src)).toEqual([VIDEO.src]);
  });
  it("con portada ya puesta, o en un post que no es reel, se queda como estaba", () => {
    const conPortadaYa = conVideoEnPost({ format: "reel", medios: [IMG("a")], portada: "/x.jpg" }, VIDEO);
    expect(conPortadaYa.portada).toBe("/x.jpg");
    expect(mediosDe(conPortadaYa)).toHaveLength(2);
    expect(mediosDe(conVideoEnPost({ format: "post", medios: [IMG("a")] }, VIDEO))).toHaveLength(2);
  });
});

describe("«Poner en una publicación…» del Estudio: «Como portada del video»", () => {
  const calendars = [{ id: "nov", days: [{ date: "2026-11-10", posts: [
    { id: "r1", format: "reel", title: "Reel", medios: [VIDEO] },
    { id: "r2", format: "reel", title: "Reel sin video" },
    { id: "p1", format: "post", title: "Post", medios: [IMG("x")] },
  ] }] }];
  it("cada publicación dice si lleva portada (un reel con su video)", () => {
    const l = publicacionesParaPoner(calendars, { hoy: "2026-11-05" });
    expect(Object.fromEntries(l.map((p) => [p.postId, p.llevaPortada]))).toEqual({ r1: true, r2: false, p1: false });
  });
  it("con UNA imagen y un reel con video, por defecto va de portada; si la persona escoge otro modo, va como «medio»", () => {
    expect(modoDePoner({ unaImagen: true, llevaPortada: true, medios: 1 })).toEqual({ modo: "reemplazar", como: "portada" });
    expect(modoDePoner({ unaImagen: true, llevaPortada: true, medios: 1, escogido: "reemplazar" })).toEqual({ modo: "reemplazar", como: "medio" });
    expect(modoDePoner({ unaImagen: true, llevaPortada: true, medios: 1, escogido: "anadir" })).toEqual({ modo: "anadir", como: "medio" });
  });
  it("sin portada posible, lo de siempre y sin «como» (la regla del servidor)", () => {
    expect(modoDePoner({ unaImagen: false, llevaPortada: true, medios: 1 })).toEqual({ modo: "reemplazar" });
    expect(modoDePoner({ unaImagen: true, llevaPortada: false, medios: 2, escogido: "anadir" })).toEqual({ modo: "anadir" });
    // Lo escogido de antes («portada») en una publicación que ya no la lleva no se manda.
    expect(modoDePoner({ unaImagen: true, llevaPortada: false, medios: 0, escogido: "portada" })).toEqual({ modo: "reemplazar" });
  });
});
