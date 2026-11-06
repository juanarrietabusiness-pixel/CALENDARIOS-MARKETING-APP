import { describe, it, expect } from "vitest";
import { validarGuion, lineaDeTiempo, tieneHabla, duracionMinimaDeEscena } from "./videoEscenas.js";
import { dibujarFrame, esCapaCompleta, movimientoDeImagen, cajasDeEscena, MOVIMIENTO_IMAGEN } from "./motorVideo.js";
import { puedeRenderizar } from "./renderVideo.js";
import { revisarEscenas } from "./revisionEscenas.js";
import { esReelConVideo, destinoInstagram, revisarPublicacion } from "./publicacion.js";
import {
  guionDeFoto, puedeConMusica, recorteDeFoto, duracionDeFoto, postConMusica, volverALaFoto, fotoDe, logoEnElReel,
  esCarruselParaMusica, cancionSugerida, limpiarCanciones, ultimaCancionUsada, textoDeCancion, cancionParaGuardar,
  DURACIONES_FOTO, MOVIMIENTOS_FOTO,
} from "./conMusica.js";

// ============================================================
// «Publicar con música»: la foto → un reel de una escena (sin habla, con su movimiento) y la canción sugerida para lo
// que se publica a mano. Todo puro: el render, la pantalla y el Worker leen lo mismo.
// ============================================================

/** El mismo lienzo de mentira de los tests del motor: apunta cada llamada y cada propiedad. */
function lienzo() {
  const log = [];
  const estado = { font: "10px x" };
  const tam = () => Number(/(\d+)px/.exec(estado.font)?.[1] ?? 10);
  const metodos = {
    measureText: (t) => ({ width: String(t).length * tam() * 0.55 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({ patron: true }),
  };
  return {
    log,
    ctx: new Proxy({}, {
      get(_, k) {
        if (k in metodos) return metodos[k];
        if (k in estado) return estado[k];
        return (...args) => log.push([k, ...args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : a))]);
      },
      set(_, k, v) { estado[k] = v; log.push([`=${String(k)}`, v]); return true; },
    }),
  };
}

const foto = { src: "/api/media/clientes/c1/estudio/foto.png", tipo: "imagen", nombre: "foto.png", ancho: 1080, alto: 1350 };
const post = (extra = {}) => ({ id: "p1", format: "post", medios: [foto], image: foto.src, idea: "Sofá cama", ...extra });
const mp4 = { src: "/api/media/clientes/c1/estudio/video.mp4", tipo: "video", nombre: "video.mp4", ancho: 1080, alto: 1920, duracion: 10, videoAnimado: "v1" };

describe("el guion de una foto", () => {
  it("valida, no habla (no pide locución) y dura lo escogido", () => {
    for (const s of DURACIONES_FOTO) {
      const v = validarGuion(guionDeFoto({ archivoId: "a1", segundos: s, ancho: 1080, alto: 1350 }));
      expect(v.errores).toEqual([]);
      expect(v.ok).toBe(true);
      expect(tieneHabla(v.guion)).toBe(false);
      expect(lineaDeTiempo(v.guion).total).toBeCloseTo(s, 3);
    }
  });

  it("la foto va a sangre con su movimiento, sin subtítulos ni música en el guion", () => {
    const g = validarGuion(guionDeFoto({ archivoId: "a1", movimiento: "paneo" })).guion;
    const capa = g.escenas[0].capas[0];
    expect(capa).toMatchObject({ tipo: "imagen", archivo: "a1", encuadre: "completo", movimiento: "paneo", dura: 10 });
    expect(esCapaCompleta(capa)).toBe(true);
    expect(g.subtitulos.activo).toBe(false);
    expect(g.musica).toBe(null);
  });

  it("aprobado, se renderiza sin voz", () => {
    const g = validarGuion(guionDeFoto({ archivoId: "a1" })).guion;
    expect(puedeRenderizar({ estado: "aprobado", version: 1, aprobada_version: 1, guion: g, locucion: {} })).toMatchObject({ ok: true, sinVoz: true });
  });

  it("la duración va a una de las que hay y el movimiento desconocido, al de partida", () => {
    expect(duracionDeFoto(8)).toBe(7);
    expect(duracionDeFoto(12)).toBe(10);
    expect(duracionDeFoto(30)).toBe(15);
    expect(duracionDeFoto("x")).toBe(10);
    expect(guionDeFoto({ archivoId: "a", movimiento: "girar" }).escenas[0].capas[0].movimiento).toBe(MOVIMIENTOS_FOTO[0].id);
  });

  it("una foto casi vertical llena el cuadro; una 4:5 o cuadrada se ve entera", () => {
    expect(recorteDeFoto(1080, 1920)).toBe("cubrir");
    expect(recorteDeFoto(1080, 1350)).toBe("contener");
    expect(recorteDeFoto(1080, 1080)).toBe("contener");
    expect(recorteDeFoto(0, 0)).toBe("contener");
  });

  it("con el logo estampado del kit, el logo va dentro del área segura del reel", () => {
    const g = validarGuion(guionDeFoto({ archivoId: "a1", logo: { esquina: "abajo-derecha", tamano: 0.16 } }));
    expect(g.ok).toBe(true);
    const logo = g.guion.escenas[0].capas.find((c) => c.tipo === "logo");
    expect(logo.pos.y).toBeLessThanOrEqual(0.8 - 0.05); // por encima del 20 % de abajo
    expect(logoEnElReel({ esquina: "arriba-izquierda" }).y).toBeGreaterThanOrEqual(0.12);
  });

  it("un guion de antes con una imagen en su caja valida EXACTAMENTE igual (los campos nuevos no se escriben)", () => {
    const g = validarGuion({ escenas: [{ tipo: "producto", habla: "Mira esto", capas: [{ tipo: "imagen", id: "i", archivo: "x" }] }] }).guion;
    const capa = g.escenas[0].capas[0];
    expect(Object.keys(capa)).not.toContain("encuadre");
    expect(Object.keys(capa)).not.toContain("movimiento");
    expect(Object.keys(capa)).not.toContain("dura");
    expect(Object.keys(capa)).not.toContain("oscurecer");
  });

  it("una escena muda con una imagen sin «dura» sigue siendo un error (necesita pausa, tramo o dura)", () => {
    const v = validarGuion({ escenas: [{ tipo: "producto", capas: [{ tipo: "imagen", archivo: "x", encuadre: "completo" }] }] });
    expect(v.ok).toBe(false);
    expect(v.errores.some((e) => /dura/.test(e.mensaje))).toBe(true);
    expect(duracionMinimaDeEscena({ capas: [{ tipo: "imagen", dura: 7 }] })).toBe(7);
  });
});

describe("el motor mueve la foto", () => {
  it("acercar crece, alejar decrece y el paneo corre de un lado al otro, suave al empezar y al acabar", () => {
    expect(movimientoDeImagen("acercar", 0).escala).toBe(1);
    expect(movimientoDeImagen("acercar", 1).escala).toBeCloseTo(1 + MOVIMIENTO_IMAGEN.zoom, 6);
    expect(movimientoDeImagen("alejar", 0).escala).toBeCloseTo(1 + MOVIMIENTO_IMAGEN.zoom, 6);
    expect(movimientoDeImagen("alejar", 1).escala).toBe(1);
    expect(movimientoDeImagen("paneo", 0).desplaza).toBe(-1);
    expect(movimientoDeImagen("paneo", 1).desplaza).toBe(1);
    expect(movimientoDeImagen("paneo", 0.5).desplaza).toBeCloseTo(0, 6);
    // Suave: en el primer 5 % casi no se mueve.
    expect(movimientoDeImagen("acercar", 0.05).escala - 1).toBeLessThan(MOVIMIENTO_IMAGEN.zoom * 0.01);
    expect(movimientoDeImagen("ninguno", 0.5)).toEqual({ escala: 1, desplaza: 0 });
  });

  const pintar = (guion, t, imagen) => {
    const { ctx, log } = lienzo();
    dibujarFrame(ctx, { guion, linea: lineaDeTiempo(guion), t, recursos: { imagen: () => imagen } });
    return log;
  };
  const img = { width: 1080, height: 1920, foto: true };

  it("a sangre, la imagen se dibuja más grande al final que al principio (acercar), y no entra en el reparto", () => {
    const g = validarGuion(guionDeFoto({ archivoId: "a1", movimiento: "acercar", ancho: 1080, alto: 1920 })).guion;
    const ancho = (t) => pintar(g, t, img).find(([m, i]) => m === "drawImage" && i === img)[4];
    expect(ancho(0)).toBeCloseTo(1080, 0);
    expect(ancho(9.9)).toBeGreaterThan(ancho(5));
    expect(ancho(5)).toBeGreaterThan(ancho(0));
    const { ctx } = lienzo();
    expect(cajasDeEscena(ctx, { guion: g, linea: lineaDeTiempo(g), indice: 0 })).toEqual([]);
  });

  it("contener: la foto entera encima de ella misma ampliada y difuminada", () => {
    const g = validarGuion(guionDeFoto({ archivoId: "a1", movimiento: "acercar", ancho: 1080, alto: 1350 })).guion;
    const log = pintar(g, 0, { width: 1080, height: 1350 });
    const dibujos = log.filter(([m]) => m === "drawImage");
    expect(dibujos).toHaveLength(2);
    expect(log.some(([m, v]) => m === "=filter" && /blur/.test(v))).toBe(true);
    expect(dibujos[1][4]).toBeCloseTo(1080, 0); // la foto, al ancho del cuadro: se ve entera
  });

  it("es determinista: el mismo instante, las mismas llamadas", () => {
    const g = validarGuion(guionDeFoto({ archivoId: "a1", movimiento: "paneo" })).guion;
    expect(pintar(g, 3.3, img)).toEqual(pintar(g, 3.3, img));
  });

  it("la revisión no la da por vacía (la foto llena el cuadro)", () => {
    const g = validarGuion(guionDeFoto({ archivoId: "a1" })).guion;
    const { ctx } = lienzo();
    const problemas = revisarEscenas(ctx, { guion: g, linea: lineaDeTiempo(g) });
    expect(Array.isArray(problemas)).toBe(true);
    expect(problemas.filter((p) => p.grave || p.tipo === "espacio_vacio")).toEqual([]);
  });
});

describe("la publicación: de foto a reel y vuelta", () => {
  it("sólo un post de UNA foto sin publicar", () => {
    expect(puedeConMusica(post()).ok).toBe(true);
    expect(puedeConMusica(post({ format: "carrusel" })).ok).toBe(false);
    expect(puedeConMusica(post({ medios: [foto, { ...foto, src: "/api/media/clientes/c1/b.png" }] })).ok).toBe(false);
    expect(puedeConMusica(post({ medios: [mp4] })).ok).toBe(false);
    expect(puedeConMusica(post({ status: "published" })).ok).toBe(false);
    expect(puedeConMusica(post({ medios: [], image: null })).ok).toBe(false);
  });

  it("al terminar: reel con el mp4 de único medio y la foto de PORTADA; sale como reel en Instagram", () => {
    const p = postConMusica(post({ portada: null }), mp4, { videoId: "v1", foto: foto.src, ahora: "2026-11-06T15:00:00.000Z" });
    expect(p.format).toBe("reel");
    expect(p.medios).toEqual([mp4]);
    expect(p.portada).toBe(foto.src);
    expect(esReelConVideo(p)).toBe(true);
    expect(destinoInstagram(p)).toBe("reel");
    expect(p.conMusica).toMatchObject({ foto, formato: "post", videoId: "v1" });
    // Un reel con su video y su portada: nada que arreglar por la regla de la portada.
    expect(revisarPublicacion(p, ["instagram"], { navegador: true }).errores.filter((e) => /imagen/i.test(e))).toEqual([]);
  });

  it("si la foto cambió mientras se hacía, no se toca la publicación", () => {
    expect(postConMusica(post(), mp4, { videoId: "v1", foto: "/api/media/clientes/c1/otra.png" })).toBe(null);
  });

  it("otra vez (otra pista): cambia sólo el video y conserva la foto apuntada y la portada", () => {
    const una = postConMusica(post(), mp4, { videoId: "v1", foto: foto.src, ahora: "a" });
    const otro = { ...mp4, src: "/api/media/clientes/c1/estudio/video2.mp4" };
    const dos = postConMusica({ ...una, portada: "/api/media/clientes/c1/portada.png" }, otro, { videoId: "v1", foto: foto.src, ahora: "b" });
    expect(dos.medios).toEqual([otro]);
    expect(dos.conMusica.foto).toEqual(foto);
    expect(dos.portada).toBe("/api/media/clientes/c1/portada.png");
    expect(fotoDe(dos)).toEqual(foto);
    expect(puedeConMusica(dos)).toMatchObject({ ok: true, yaEs: true });
  });

  it("«Volver a la foto» deja la publicación como estaba", () => {
    const antes = post({ portada: null });
    const reel = postConMusica(antes, mp4, { videoId: "v1", foto: foto.src, ahora: "a" });
    const vuelta = volverALaFoto(reel, "b");
    expect(vuelta.format).toBe("post");
    expect(vuelta.medios).toEqual([foto]);
    expect(vuelta.image).toBe(foto.src);
    expect(vuelta.portada).toBe(null);
    expect(vuelta.conMusica).toBeUndefined();
    expect(volverALaFoto(antes)).toBe(antes);
  });

  it("un carrusel se ofrece a mano con la música de Instagram", () => {
    expect(esCarruselParaMusica(post({ format: "carrusel", medios: [foto, foto] }))).toBe(true);
    expect(esCarruselParaMusica(post())).toBe(false);
  });
});

describe("la canción sugerida", () => {
  const lista = [{ nombre: "Flowers", artista: "Miley Cyrus" }, { nombre: "Calm Down", artista: "Rema" }, { nombre: "Ojitos lindos" }];

  it("limpia la lista: sin nombres vacíos ni repetidas", () => {
    expect(limpiarCanciones([...lista, { nombre: " flowers ", artista: "miley cyrus" }, { artista: "Nadie" }, null])).toHaveLength(3);
    expect(textoDeCancion(lista[0])).toBe("Flowers — Miley Cyrus");
    expect(textoDeCancion(lista[2])).toBe("Ojitos lindos");
  });

  it("nunca repite la última usada; la ya puesta en la publicación se queda", () => {
    expect(cancionSugerida(lista, { ultima: lista[0] })).toEqual(lista[1]);
    expect(cancionSugerida(lista, { ultima: lista[2] })).toEqual(lista[0]);
    expect(cancionSugerida(lista, {})).toEqual(lista[0]);
    expect(cancionSugerida(lista, { ultima: lista[0], actual: lista[2] })).toEqual(lista[2]);
    expect(cancionSugerida([], {})).toBe(null);
  });

  it("«Otra» pasa a la siguiente sin caer en la última usada", () => {
    expect(cancionSugerida(lista, { ultima: lista[0], actual: lista[1], otra: true })).toEqual(lista[2]);
    expect(cancionSugerida(lista, { ultima: lista[0], actual: lista[2], otra: true })).toEqual(lista[1]);
  });

  it("la última usada es la más nueva de lo publicado a mano del cliente", () => {
    const cliente = {
      calendars: [{ days: [{ posts: [
        { id: "a", cancionInstagram: cancionParaGuardar(lista[0], "2026-11-01T10:00:00Z") },
        { id: "b", cancionInstagram: cancionParaGuardar(lista[1], "2026-11-03T10:00:00Z") },
      ] }] }],
    };
    expect(ultimaCancionUsada(cliente)).toMatchObject(lista[1]);
    expect(ultimaCancionUsada(cliente, "b")).toMatchObject(lista[0]);
  });
});
