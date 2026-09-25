import { describe, it, expect } from "vitest";
import {
  mediosDe, conMedios, textoPara, primerComentario, destinoInstagram, revisarPublicacion,
  publicacionParaCliente, marcarActualizada, contarHashtags, rutasDeMedios, momentoPublicacion, esJPEG,
} from "./publicacion.js";

describe("medios", () => {
  it("las publicaciones de antes, con sólo `image`, tienen un medio", () => {
    expect(mediosDe({ image: "/api/media/clientes/c/posts/a.jpg" })).toEqual([{ src: "/api/media/clientes/c/posts/a.jpg", tipo: "imagen", nombre: "" }]);
    expect(mediosDe({})).toEqual([]);
  });
  it("reconoce el video por el tipo o por la extensión", () => {
    expect(mediosDe({ medios: [{ src: "/x.mp4" }, { src: "/y", tipo: "video" }, { src: "/z.png" }] }).map((m) => m.tipo))
      .toEqual(["video", "video", "imagen"]);
  });
  it("al guardar medios, `image` es la primera IMAGEN (la usan export y la IA)", () => {
    const p = conMedios({ id: "1" }, [{ src: "/v.mp4", tipo: "video" }, { src: "/i.jpg", tipo: "imagen" }]);
    expect(p.image).toBe("/i.jpg");
    expect(conMedios({}, [{ src: "/v.mp4", tipo: "video" }]).image).toBeNull();
  });
});

describe("texto y hashtags", () => {
  const post = { descripcion: "Hola 👋", hashtagsFinales: "#panama #cafe" };
  it("los hashtags van al final si no van en comentario", () => {
    expect(textoPara(post)).toBe("Hola 👋\n\n#panama #cafe");
    expect(textoPara({ ...post, hashtagsEnComentario: true })).toBe("Hola 👋");
    expect(primerComentario({ ...post, hashtagsEnComentario: true, primerComentario: "¡Gracias!" })).toBe("¡Gracias!\n\n#panama #cafe");
  });
  it("no duplica los hashtags si la descripción ya los trae", () => {
    expect(textoPara({ descripcion: "Hola\n\n#panama #cafe", hashtagsFinales: "#panama #cafe" })).toBe("Hola\n\n#panama #cafe");
  });
  it("Facebook puede llevar su propio texto", () => {
    expect(textoPara({ ...post, textoFacebook: "Versión FB" }, "facebook")).toBe("Versión FB\n\n#panama #cafe");
  });
  it("cuenta hashtags con tildes y eñes", () => {
    expect(contarHashtags("#año #café texto #x_1")).toBe(3);
  });
});

describe("revisarPublicacion", () => {
  it("un reel sin video no se puede publicar", () => {
    const { errores } = revisarPublicacion({ format: "reel", medios: [{ src: "/a.jpg" }] }, ["instagram"]);
    expect(errores.join(" ")).toMatch(/necesita un video/);
  });
  it("más de 30 hashtags en Instagram es error", () => {
    const hashtags = Array.from({ length: 31 }, (_, i) => `#h${i}`).join(" ");
    const { errores } = revisarPublicacion({ format: "post", image: "/a.jpg", hashtagsFinales: hashtags }, ["instagram"]);
    expect(errores.join(" ")).toMatch(/30 hashtags/);
  });
  it("un directo no se publica", () => {
    expect(revisarPublicacion({ format: "live" }).errores[0]).toMatch(/directo/);
  });
  it("una historia avisa de que no muestra el texto", () => {
    const { errores, avisos } = revisarPublicacion({ format: "historia", image: "/a.jpg", descripcion: "Hola" }, ["instagram"]);
    expect(errores).toEqual([]);
    expect(avisos.join(" ")).toMatch(/no muestra el texto/);
  });
  it("TikTok exige video", () => {
    expect(revisarPublicacion({ format: "post", image: "/a.jpg" }, ["tiktok"]).errores.join(" ")).toMatch(/TikTok necesita un video/);
  });
});

describe("destinoInstagram", () => {
  it("carrusel, reel, historia o imagen", () => {
    expect(destinoInstagram({ format: "post", medios: [{ src: "/a.jpg" }, { src: "/b.jpg" }] })).toBe("carrusel");
    expect(destinoInstagram({ format: "reel", medios: [{ src: "/a.mp4" }] })).toBe("reel");
    expect(destinoInstagram({ format: "historia", image: "/a.jpg" })).toBe("historia");
    expect(destinoInstagram({ format: "post", image: "/a.jpg" })).toBe("imagen");
  });
});

describe("lo que ve el cliente", () => {
  it("nunca el comentario interno ni la idea para la IA", () => {
    const p = publicacionParaCliente({ id: "1", descripcion: "x", comment: "no se lo digas", idea: "prompt", category: "interna", _originCal: "k" });
    expect(p).toEqual({ id: "1", descripcion: "x" });
  });
  it("las rutas de medios incluyen portada y la imagen anterior", () => {
    expect(rutasDeMedios({ medios: [{ src: "/a.jpg" }], portada: "/p.jpg", anterior: { image: "/v.jpg" } }))
      .toEqual(["/a.jpg", "/p.jpg", "/v.jpg"]);
  });
});

describe("marcarActualizada", () => {
  it("sólo si el cliente pidió cambios y cambió algo que él ve", () => {
    const antes = { id: "1", status: "rejected", descripcion: "viejo" };
    const r = marcarActualizada(antes, { ...antes, descripcion: "nuevo" }, "2026-09-25T10:00:00Z");
    expect(r.actualizadaAt).toBe("2026-09-25T10:00:00Z");
    expect(r.anterior.descripcion).toBe("viejo");
    expect(marcarActualizada({ ...antes, status: "pending" }, { ...antes, descripcion: "nuevo" }, "t").actualizadaAt).toBeUndefined();
    expect(marcarActualizada(antes, { ...antes, comment: "nota interna" }, "t").actualizadaAt).toBeUndefined();
  });
});

describe("momentoPublicacion", () => {
  it("el día y la hora del calendario, en Panamá (UTC−5, sin horario de verano)", () => {
    expect(momentoPublicacion("2026-10-05", "10:00")).toBe("2026-10-05T15:00:00.000Z");
    expect(momentoPublicacion("2026-12-31", "21:30")).toBe("2027-01-01T02:30:00.000Z");
  });
  it("sin hora, a las 9:00; sin fecha válida, null", () => {
    expect(momentoPublicacion("2026-10-05", "")).toBe("2026-10-05T14:00:00.000Z");
    expect(momentoPublicacion("5 de octubre", "10:00")).toBeNull();
  });
});

describe("Instagram: proporción y formato", () => {
  const conImagen = (ancho, alto, src = "/api/media/clientes/c/posts/a.jpg") =>
    ({ format: "post", descripcion: "x", medios: [{ src, tipo: "imagen", ancho, alto }] });

  it("de 4:5 a 1.91:1 entra; más alta o más ancha, no", () => {
    expect(revisarPublicacion(conImagen(1080, 1350)).errores).toEqual([]);
    expect(revisarPublicacion(conImagen(1080, 566)).errores).toEqual([]);
    expect(revisarPublicacion(conImagen(1080, 1920)).errores.join()).toMatch(/4:5/);
    expect(revisarPublicacion(conImagen(2000, 800)).errores.join()).toMatch(/1\.91:1/);
  });
  it("una historia vertical sí vale", () => {
    expect(revisarPublicacion({ ...conImagen(1080, 1920), format: "historia" }).errores).toEqual([]);
  });
  it("un PNG avisa de que se convertirá; no bloquea el panel", () => {
    const r = revisarPublicacion(conImagen(1080, 1080, "/api/media/clientes/c/posts/a.png"));
    expect(r.errores).toEqual([]);
    expect(r.avisos.join()).toMatch(/JPEG/);
    expect(esJPEG("/x/a.JPEG")).toBe(true);
  });
});
