import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import ConMusica from "./ConMusica";
import CancionesInstagram from "../CancionesInstagram";
import PublicarAMano from "../../pages/PublicarAMano";

// ============================================================
// «Publicar con música» se PINTA (sin navegador: react-dom/server; no corren los efectos)
//
//   · un post de UNA foto ofrece «Publicar con música»; uno que ya lo es, el reel y «Volver a la foto»;
//   · un carrusel ofrece «Publicarlo a mano con música» y, marcado, la canción sugerida (sin repetir la última usada);
//   · lo demás (un reel de verdad, lo publicado) no enseña nada;
//   · la lista de canciones en el kit, y /a-mano con las imágenes en orden y la canción.
// ============================================================

const pintar = (componente, props) => renderToString(createElement(componente, props)).replace(/<!-- -->/g, "");
const nada = () => {};
const foto = { src: "/api/media/clientes/c1/posts/foto.jpg", tipo: "imagen", nombre: "foto.jpg" };
const b = { src: "/api/media/clientes/c1/posts/b.jpg", tipo: "imagen" };
const kitMarca = JSON.stringify({ musica: { cancionesInstagram: [{ nombre: "Flowers", artista: "Miley Cyrus" }, { nombre: "Calm Down", artista: "Rema" }] } });
const cliente = (posts = []) => ({ id: "c1", name: "Cliente Uno", kitMarca, calendars: [{ id: "cal1", dbId: "cal1", days: [{ date: "2026-11-20", posts }] }] });
const props = (post, extra = {}) => ({ post, setForm: nada, client: cliente([post]), clientId: "c1", cal: { id: "cal1" }, onError: nada, enlaceAMano: "/a-mano/cal1/p1", onIrA: nada, ...extra });

describe("en la pestaña Pieza", () => {
  it("un post de UNA foto: «Publicar con música», con su costo (no gasta IA)", () => {
    const html = pintar(ConMusica, props({ id: "p1", format: "post", medios: [foto] }));
    expect(html).toContain("Publicar con música");
    expect(html).toContain("Escoger la música…");
    expect(html).toContain("No gasta IA");
    expect(html).toContain("Zoom lento hacia dentro");
    expect(html).toContain("15 s");
    expect(html).not.toContain("Volver a la foto");
  });

  it("ya es un reel con música: el video y «Volver a la foto»", () => {
    const post = { id: "p1", format: "reel", medios: [{ src: "/api/media/clientes/c1/v.mp4", tipo: "video" }], portada: foto.src, conMusica: { foto, formato: "post" } };
    const html = pintar(ConMusica, props(post));
    expect(html).toContain("Es un reel con música");
    expect(html).toContain("Volver a la foto");
    expect(html).toContain("<video");
    expect(html).toContain("Cambiar la música o el movimiento");
  });

  it("haciéndose: lo dice (y en Publicar, compacto, también)", () => {
    const post = { id: "p1", format: "post", medios: [foto], conMusicaPendiente: { videoId: "v1", foto: foto.src } };
    expect(pintar(ConMusica, props(post))).toContain("Haciendo el video en el servidor");
    expect(pintar(ConMusica, props(post, { compacto: true }))).toContain("Haciendo el reel con música");
    expect(pintar(ConMusica, props({ id: "p1", format: "post", medios: [foto] }, { compacto: true }))).toBe("");
  });

  it("un carrusel: a mano con la música de Instagram; marcado, la canción sugerida sin repetir la última", () => {
    const html = pintar(ConMusica, props({ id: "p1", format: "carrusel", medios: [foto, b] }));
    expect(html).toContain("Con música de Instagram");
    expect(html).toContain("Publicarlo a mano con música");
    const usada = { id: "otra", cancionInstagram: { nombre: "Flowers", artista: "Miley Cyrus", en: "2026-11-01T00:00:00Z" } };
    const post = { id: "p1", format: "carrusel", medios: [foto, b], asistida: true, conMusicaInstagram: true };
    const marcado = pintar(ConMusica, { ...props(post), client: cliente([post, usada]) });
    expect(marcado).toContain("Canción sugerida:");
    expect(marcado).toContain("Calm Down — Rema");
    expect(marcado).toContain("Otra canción");
    expect(marcado).toContain("La pantalla del teléfono");
  });

  it("un reel de verdad o lo publicado: nada", () => {
    expect(pintar(ConMusica, props({ id: "p1", format: "reel", medios: [{ src: "/v.mp4", tipo: "video" }] }))).toBe("");
    expect(pintar(ConMusica, props({ id: "p1", format: "post", status: "published", medios: [foto] }))).toBe("");
  });
});

describe("la lista en el kit y la pantalla del teléfono", () => {
  it("Marca → Kit y voz: las canciones y añadir otra", () => {
    const html = pintar(CancionesInstagram, { kit: JSON.parse(kitMarca), onGuardar: nada });
    expect(html).toContain("Canciones de Instagram que le van");
    expect(html).toContain("Flowers — Miley Cyrus");
    expect(html).toContain("Añadir");
    expect(pintar(CancionesInstagram, { kit: {}, lectura: true, onGuardar: nada })).not.toContain("Añadir");
  });

  it("/a-mano de un carrusel: las imágenes numeradas, compartir las dos y la canción con «Copiar el nombre»", () => {
    const post = { id: "p1", format: "carrusel", status: "approved", medios: [foto, b], asistida: true, conMusicaInstagram: true, title: "Tres sofás" };
    const html = pintar(PublicarAMano, { clients: [cliente([post])], ruta: { calendario: "cal1", publicacion: "p1" }, onGuardado: nada });
    expect(html).toContain("Las imágenes del carrusel");
    expect(html).toContain("2 en este orden");
    expect(html).toContain("Compartir las 2 con Instagram");
    expect(html).toContain("Música de Instagram");
    expect(html).toContain("Flowers — Miley Cyrus");
    expect(html).toContain("Copiar el nombre");
    expect(html).toContain("Ya la publiqué");
  });
});
