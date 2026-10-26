import { describe, it, expect } from "vitest";
import { codigoDeInstagram, publicacionesDeGraph, ordenarPorRendimiento, haceCuanto, usuarioDelEmbed } from "./competencia.js";
import { deLoCompartido } from "./bancoIdeas.js";

describe("el enlace de Instagram", () => {
  it("saca el código y, si lo trae, la cuenta", () => {
    expect(codigoDeInstagram("Mira https://www.instagram.com/reel/C9xYz_12/?igsh=abc")).toEqual({ codigo: "C9xYz_12", usuario: "" });
    expect(codigoDeInstagram("https://instagram.com/p/AbCdE1/")).toEqual({ codigo: "AbCdE1", usuario: "" });
    expect(codigoDeInstagram("https://www.instagram.com/muebles.x/reel/AbCdE1/")).toEqual({ codigo: "AbCdE1", usuario: "muebles.x" });
    expect(codigoDeInstagram("https://www.instagram.com/muebles.x/")).toBeNull();
    expect(codigoDeInstagram("https://www.tiktok.com/@x/video/1")).toBeNull();
  });
});

describe("el @ de la página pública de «insertar»", () => {
  it("lo lee de la cabecera, del enlace al perfil o de los datos incrustados", () => {
    expect(usuarioDelEmbed('<a class="Avatar InsideRing" href="x"></a><span class="UsernameText">Muebles.X</span>')).toBe("muebles.x");
    expect(usuarioDelEmbed('<a href="https://www.instagram.com/rival_cafe/?utm_source=ig_embed&amp;ig_rid=1">ver</a>')).toBe("rival_cafe");
    expect(usuarioDelEmbed('<script>{\\"owner\\":{\\"id\\":\\"9\\",\\"username\\":\\"tienda.pty\\"}}</script>')).toBe("tienda.pty");
  });
  it("sin nada reconocible devuelve vacío (y se pregunta el @); nunca una palabra reservada", () => {
    expect(usuarioDelEmbed("<html><body>Inicia sesión</body></html>")).toBe("");
    expect(usuarioDelEmbed('<a href="https://www.instagram.com/p/?utm_source=ig_embed">x</a>')).toBe("");
    expect(usuarioDelEmbed(null)).toBe("");
  });
});

describe("las publicaciones", () => {
  it("un reel sin `media_url` es uno con música de Instagram: no trae su video; el código sale del enlace", () => {
    const [con, sin, foto] = publicacionesDeGraph([
      { id: "1", media_type: "VIDEO", media_product_type: "REELS", media_url: "v1", permalink: "https://www.instagram.com/reel/AbCdE1/" },
      { id: "2", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: "t2", permalink: "https://www.instagram.com/reel/XyZ987/" },
      { id: "3", media_type: "IMAGE", media_url: "i3" },
    ]);
    expect([con.sinArchivo, sin.sinArchivo, foto.sinArchivo]).toEqual([false, true, false]);
    expect([con.codigo, sin.codigo, foto.codigo]).toEqual(["AbCdE1", "XyZ987", ""]);
  });
  it("las lee de Graph y pone primero lo que mejor funcionó (un comentario pesa el doble)", () => {
    const l = publicacionesDeGraph([
      { id: "1", media_type: "IMAGE", like_count: 50, comments_count: 0, media_url: "u1", timestamp: "2026-10-01" },
      { id: "2", media_type: "VIDEO", media_product_type: "REELS", like_count: 30, comments_count: 15, thumbnail_url: "t2", media_url: "v2" },
      { id: "3", media_type: "CAROUSEL_ALBUM", like_count: 50, comments_count: 0, media_url: "u3", timestamp: "2026-10-05" },
    ]);
    expect(l.map((p) => p.formato)).toEqual(["imagen", "reel", "carrusel"]);
    expect(l[1].miniatura).toBe("t2");
    const o = ordenarPorRendimiento(l, 200);
    expect(o.map((p) => p.id)).toEqual(["2", "3", "1"]);
    expect(o[0].tasa).toBe(30);
    expect(ordenarPorRendimiento(l, null)[0].tasa).toBeNull();
  });
  it("dice hace cuánto", () => {
    const ahora = Date.parse("2026-10-23T12:00:00Z");
    expect(haceCuanto("2026-10-23T08:00:00Z", ahora)).toBe("hoy");
    expect(haceCuanto("2026-10-20T08:00:00Z", ahora)).toBe("hace 3 días");
    expect(haceCuanto("2026-08-20T08:00:00Z", ahora)).toBe("hace 2 meses");
  });
});

describe("lo que llega por «Compartir»", () => {
  it("trae los archivos que guardó el service worker, y el aviso si no llegaron", () => {
    const u = new URL("https://x.test/compartir?text=Mira&url=https%3A%2F%2Fwww.instagram.com%2Freel%2FAbC12%2F&archivos=k9ab12:2");
    expect(deLoCompartido(u)).toMatchObject({ texto: "Mira https://www.instagram.com/reel/AbC12/", archivos: { id: "k9ab12", n: 2 } });
    expect(deLoCompartido(new URL("https://x.test/compartir?archivos=../x:9")).archivos).toBeUndefined();
    expect(deLoCompartido(new URL("https://x.test/compartir?error=archivos")).sinArchivos).toBe(true);
  });
});
