import { describe, it, expect, vi, afterEach } from "vitest";
import {
  limpiarYouTube, huecosSinLlenar, hashtagsSobreTitulo, miniaturaYouTube, etiquetasYouTube, tituloYouTube, descripcionYouTube,
  revisarPublicacion, resumenYouTube,
} from "../../src/lib/publicacion.js";
import { cuerpoYouTube, listasYouTube } from "../../worker/lib/postpeer.js";
import { rutasYouTube } from "../../worker/rutas/youtube.js";

// ============================================================
// La «Configuración de YouTube» de una publicación (`post.youtube`, 26-nov-2026, aprobada por Juan): lo vacío vale lo
// de siempre (primera línea, mismo texto, hashtags, categoría automática, privacidad del canal); lo que se escribe
// manda; un hueco sin llenar («[PEGAR ENLACE…]») no deja programar; y lo que PostPeer admite (lista, primer comentario,
// contenido sintético) llega a su cuerpo. PostPeer es de mentira, como en youtubePostPeer.test.js.
// ============================================================

const VIDEO = { src: "/api/media/clientes/c1/estudio/v.mp4", tipo: "video", ancho: 1920, alto: 1080, duracion: 193.5 };
const post = (extra = {}) => ({
  id: "p1", format: "post", descripcion: "BENDECIDOS\nSomos bendecidos", hashtagsFinales: "#57DMC #JuanArrieta #Bendecidos #Worship",
  medios: [VIDEO], redes: ["youtube"], ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe("Configuración de YouTube: lo que se guarda", () => {
  it("limpiarYouTube quita lo vacío y lo que no vale (categoría, privacidad, miniatura de fuera, lista)", () => {
    expect(limpiarYouTube({ titulo: "  ", descripcion: "" })).toBeUndefined();
    expect(limpiarYouTube(null)).toBeUndefined();
    expect(limpiarYouTube({
      titulo: "  BENDECIDOS   (video oficial) ", etiquetas: "#57dmc, worship, , 57dmc", categoria: "10", privacidad: "unlisted",
      miniatura: "/api/media/clientes/c1/estudio/m.jpg", playlistId: "PL_abc-1", playlist: "Videos oficiales", primerComentario: " ¡Gracias! ", ia: true,
    })).toEqual({
      titulo: "BENDECIDOS (video oficial)", etiquetas: ["57dmc", "worship"], categoria: "10", privacidad: "unlisted",
      miniatura: "/api/media/clientes/c1/estudio/m.jpg", playlistId: "PL_abc-1", playlist: "Videos oficiales", primerComentario: "¡Gracias!", ia: true,
    });
    expect(limpiarYouTube({ titulo: "x", categoria: "99", privacidad: "todos", miniatura: "https://otro.com/m.jpg", playlistId: "a b", ia: "sí" })).toEqual({ titulo: "x" });
    expect(limpiarYouTube({ miniatura: "/api/media/clientes/../secreto" })).toBeUndefined();
  });

  it("lo vacío vale lo de siempre; lo propio manda", () => {
    const p = post();
    expect(tituloYouTube(p)).toBe("BENDECIDOS");
    expect(descripcionYouTube(p)).toContain("Somos bendecidos");
    expect(etiquetasYouTube(p)).toEqual(["57DMC", "JuanArrieta", "Bendecidos", "Worship"]);
    const q = post({ youtube: { titulo: "Otro título", descripcion: "Sólo para YouTube", etiquetas: ["alabanza"] } });
    expect(tituloYouTube(q)).toBe("Otro título");
    expect(descripcionYouTube(q)).toBe("Sólo para YouTube");
    // Las etiquetas propias REEMPLAZAN a los hashtags (no se suman).
    expect(etiquetasYouTube(q)).toEqual(["alabanza"]);
  });

  it("los tres hashtags encima del título (sin #shorts) y la miniatura (la suya, si no la portada; nunca un video)", () => {
    expect(hashtagsSobreTitulo(post())).toEqual(["#57DMC", "#JuanArrieta", "#Bendecidos"]);
    expect(hashtagsSobreTitulo(post({ hashtagsFinales: "#Shorts #uno" }))).toEqual(["#uno"]);
    expect(miniaturaYouTube(post({ portada: "/api/media/clientes/c1/p.jpg" }))).toBe("/api/media/clientes/c1/p.jpg");
    expect(miniaturaYouTube(post({ portada: "/api/media/clientes/c1/p.jpg", youtube: { miniatura: "/api/media/clientes/c1/m.jpg" } }))).toBe("/api/media/clientes/c1/m.jpg");
    expect(miniaturaYouTube(post({ portada: "/api/media/clientes/c1/v.mp4" }))).toBe("");
  });

  it("el resumen de la cabecera dice lo que cambia", () => {
    expect(resumenYouTube(post())).toBe("video · mismo texto");
    expect(resumenYouTube(post({ youtube: { titulo: "t", descripcion: "d", categoria: "10", privacidad: "public", miniatura: "/api/media/clientes/c1/m.jpg", playlistId: "PL1" } })))
      .toBe("video · título propio · texto propio · Música · Público · miniatura · en una lista");
  });
});

describe("Configuración de YouTube: la revisión antes de programar", () => {
  it("un hueco sin llenar NO deja programar (el de la publicación de 57DMC: «[PEGAR ENLACE…]»)", () => {
    expect(huecosSinLlenar("Únete: [PEGAR ENLACE COMPLETO DEL CANAL DE WHATSAPP]\n[Coro]\n[completar]")).toEqual(["[PEGAR ENLACE COMPLETO DEL CANAL DE WHATSAPP]", "[completar]"]);
    expect(huecosSinLlenar("[Coro]\n[Verso 1]")).toEqual([]);
    const { errores } = revisarPublicacion(post({ youtube: { descripcion: "Únete: [PEGAR ENLACE COMPLETO DEL CANAL DE WHATSAPP]" } }), ["youtube"]);
    expect(errores.some((e) => /hueco sin llenar/.test(e))).toBe(true);
    // También en el primer comentario.
    expect(revisarPublicacion(post({ youtube: { primerComentario: "[ENLACE]" } }), ["youtube"]).errores.some((e) => /hueco/.test(e))).toBe(true);
    expect(revisarPublicacion(post(), ["youtube"]).errores).toEqual([]);
  });

  it("con título propio no avisa de la primera línea larga", () => {
    const larga = `${"palabra ".repeat(20)}\nresto`;
    expect(revisarPublicacion(post({ descripcion: larga }), ["youtube"]).avisos.some((a) => /primera línea/.test(a))).toBe(true);
    expect(revisarPublicacion(post({ descripcion: larga, youtube: { titulo: "Corto" } }), ["youtube"]).avisos.some((a) => /primera línea/.test(a))).toBe(false);
  });
});

describe("Configuración de YouTube: PostPeer", () => {
  it("el cuerpo lleva la lista, el primer comentario y «contenido sintético» sólo si se piden", () => {
    const base = { descripcion: "d", titulo: "t", accountId: "yt", urlVideo: "https://x/v.mp4" };
    const sin = cuerpoYouTube(base).platforms[0].platformSpecificData;
    expect(sin).not.toHaveProperty("playlistId");
    expect(sin).not.toHaveProperty("firstComment");
    expect(sin).not.toHaveProperty("containsSyntheticMedia");
    expect(cuerpoYouTube({ ...base, playlistId: "PL1", primerComentario: "¡Gracias!", ia: true }).platforms[0].platformSpecificData)
      .toMatchObject({ playlistId: "PL1", firstComment: "¡Gracias!", containsSyntheticMedia: true });
  });

  it("las listas del canal: por PostPeer; con la conexión de Google, la nota de por qué no", async () => {
    const llamadas = [];
    vi.stubGlobal("fetch", vi.fn(async (u) => {
      llamadas.push(new URL(String(u)).pathname);
      return new Response(JSON.stringify({ success: true, data: { playlists: [{ id: "PL1", title: "Videos oficiales", privacy: "public" }, { title: "sin id" }] } }));
    }));
    const env = { POSTPEER_API_KEY: "pp" };
    expect(await listasYouTube(env, "yt_789")).toEqual([{ id: "PL1", titulo: "Videos oficiales", privacidad: "public" }]);
    expect(llamadas).toEqual(["/v1/youtube/accounts/yt_789/playlists"]);

    const cuentas = { postpeer: { externo_id: "yt_789", datos: JSON.stringify({ via: "postpeer" }) }, google: { externo_id: "UC1", datos: "{}" } };
    for (const [via, cuenta] of Object.entries(cuentas)) {
      const acceso = {
        ownerId: "u1",
        leerUno: async (t, f) => (t === "clients" && f.id === "c1" ? { id: "c1" } : null),
        leer: async (t, f) => (t === "cuentas_sociales" && f.client_id === "c1" && f.red === "youtube" ? [cuenta] : []),
      };
      const r = await rutasYouTube(new Request("https://app.test/api/redes/youtube/listas?cliente=c1"), env, { acceso, usuario: { id: "u1" }, partes: ["redes", "youtube", "listas"], metodo: "GET" });
      const j = await r.json();
      if (via === "postpeer") expect(j).toMatchObject({ via: "postpeer", listas: [{ id: "PL1" }] });
      else expect(j).toMatchObject({ via: "google", listas: [] });
      if (via === "google") expect(j.nota).toMatch(/PostPeer/);
    }
  });
});
