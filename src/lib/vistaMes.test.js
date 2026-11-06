import { describe, it, expect } from "vitest";
import {
  entraEnLaCuadricula, miniaturaDeCuadricula, cuadriculaDelMes, yaPublicadasEnInstagram, inicioDelMes, feedDelMes,
  estadoParaProgramar, loListoDelMes, confirmacionDeProgramar, detallesDe, pasaFiltroDetalles,
} from "./vistaMes.js";

// Una publicación lista: pieza en JPEG, hora, texto y hashtags. El calendario es de 2030: nada ha pasado.
const lista = (id, extra = {}) => ({
  id, format: "post", status: "pending", publishTime: "09:00", descripcion: `Texto de ${id}. Escríbenos por WhatsApp.`,
  hashtagsFinales: "#marca", medios: [{ src: `/api/media/clientes/c1/${id}.jpg`, tipo: "imagen", ancho: 1080, alto: 1350 }],
  ...extra,
});
const AHORA = Date.parse("2030-01-01T12:00:00Z");

describe("la cuadrícula del perfil", () => {
  it("sólo lo que sale en el feed de Instagram: ni historias, ni directos, ni lo que va sólo a otras redes", () => {
    expect(entraEnLaCuadricula(lista("a"), ["instagram"])).toBe(true);
    expect(entraEnLaCuadricula(lista("h", { format: "historia" }), ["instagram"])).toBe(false);
    expect(entraEnLaCuadricula(lista("l", { format: "live" }), ["instagram"])).toBe(false);
    expect(entraEnLaCuadricula(lista("f", { redes: ["facebook"] }), ["instagram", "facebook"])).toBe(false);
    // Sin redes escogidas, las del cliente; sin saberlas (el enlace del cliente), Instagram.
    const video = { medios: [{ src: "/api/media/clientes/c1/v.mp4", tipo: "video" }], format: "reel" };
    expect(entraEnLaCuadricula(lista("t", video), ["tiktok"])).toBe(false);
    expect(entraEnLaCuadricula(lista("t", video), ["tiktok", "instagram"])).toBe(true);
    expect(entraEnLaCuadricula(lista("c"), [])).toBe(true);
  });

  it("lo de «La publico yo» entra, marcado", () => {
    const [item] = cuadriculaDelMes([{ date: "2030-01-03", posts: [lista("m", { asistida: true })] }], { conectadas: ["instagram"] });
    expect(item.aMano).toBe(true);
  });

  it("lo más nuevo primero, por día y hora (sin hora, a las 9:00)", () => {
    const days = [
      { date: "2030-01-02", posts: [lista("a", { publishTime: "18:00" }), lista("b", { publishTime: "08:00" })] },
      { date: "2030-01-05", posts: [lista("c", { publishTime: "" })] },
      { date: "2030-01-03", posts: [lista("d", { format: "historia" })] },
    ];
    expect(cuadriculaDelMes(days, { conectadas: ["instagram"] }).map((x) => x.post.id)).toEqual(["c", "a", "b"]);
  });

  it("de un reel se ve su portada; sin portada, el video en su fotograma", () => {
    const video = { src: "/api/media/clientes/c1/v.mp4", tipo: "video" };
    expect(miniaturaDeCuadricula({ format: "reel", medios: [video], portada: "/api/media/clientes/c1/p.jpg" }))
      .toEqual({ src: "/api/media/clientes/c1/p.jpg", tipo: "imagen" });
    expect(miniaturaDeCuadricula({ format: "reel", medios: [video], portadaMs: 1500 }))
      .toEqual({ src: video.src, tipo: "video", segundo: 1.5 });
    expect(miniaturaDeCuadricula({ format: "post", medios: [] })).toBeNull();
  });

  it("de una imagen se ve la copia que sale en el feed (4:5) si la hay", () => {
    const src = "/api/media/clientes/c1/flow.png";
    const post = { format: "post", medios: [{ src, tipo: "imagen", ancho: 768, alto: 1024 }], adaptados: { [`feed|${src}`]: { src: "/api/media/clientes/c1/feed.jpg", ancho: 1080, alto: 1350 } } };
    expect(miniaturaDeCuadricula(post)).toEqual({ src: "/api/media/clientes/c1/feed.jpg", tipo: "imagen", ancho: 1080, alto: 1350 });
  });

  it("dice lo que ya está programado o salió", () => {
    const days = [{ date: "2030-01-02", posts: [lista("a"), lista("b"), lista("c", { status: "published" })] }];
    const cola = [{ postId: "a", red: "instagram", estado: "programada" }, { postId: "b", red: "instagram", estado: "error" }];
    const porId = Object.fromEntries(cuadriculaDelMes(days, { conectadas: ["instagram"], cola }).map((x) => [x.post.id, x.estado]));
    expect(porId).toEqual({ a: "programada", b: "error", c: "publicada" });
  });

  it("debajo, lo ya publicado en Instagram ANTES del mes, lo más nuevo primero y sólo con miniatura", () => {
    const desde = inicioDelMes(2030, 0);
    expect(desde).toBe("2030-01-01T05:00:00.000Z");
    const publicadas = [
      { id: "1", red: "instagram", miniatura: "/api/metricas/miniatura?u=x1", publicadaAt: "2029-12-20T15:00:00Z" },
      { id: "2", red: "instagram", miniatura: "/api/metricas/miniatura?u=x2", publicadaAt: "2029-12-28T15:00:00Z" },
      { id: "3", red: "facebook", miniatura: "/api/metricas/miniatura?u=x3", publicadaAt: "2029-12-29T15:00:00Z" },
      { id: "4", red: "instagram", miniatura: "", publicadaAt: "2029-12-29T15:00:00Z" },
      { id: "5", red: "instagram", miniatura: "/api/metricas/miniatura?u=x5", publicadaAt: "2030-01-02T15:00:00Z" },
    ];
    expect(yaPublicadasEnInstagram(publicadas, { antesDe: desde }).map((p) => p.id)).toEqual(["2", "1"]);
    expect(yaPublicadasEnInstagram(publicadas, { antesDe: desde, max: 1 })).toHaveLength(1);
  });
});

describe("el feed del mes", () => {
  it("en el orden en que sale (del 1 al último), sin directos y con las historias marcadas", () => {
    const days = [
      { date: "2030-01-05", posts: [lista("c")] },
      { date: "2030-01-02", posts: [lista("b", { publishTime: "18:00" }), lista("a", { publishTime: "10:00", format: "historia" })] },
      { date: "2030-01-03", posts: [lista("l", { format: "live" })] },
    ];
    const feed = feedDelMes(days, { conectadas: ["instagram"] });
    expect(feed.map((x) => x.post.id)).toEqual(["a", "b", "c"]);
    expect(feed.map((x) => x.esHistoria)).toEqual([true, false, false]);
  });

  it("a igual día y hora, el orden del calendario", () => {
    const days = [{ date: "2030-01-02", posts: [lista("x"), lista("y"), lista("z")] }];
    expect(feedDelMes(days).map((x) => x.post.id)).toEqual(["x", "y", "z"]);
  });
});

describe("qué está listo para programar, sin la aprobación del cliente", () => {
  const ctx = { conectadas: ["instagram"], cola: [], ahora: AHORA };

  it("pieza, hora, texto y sin errores: lista, aunque el cliente no la haya aprobado", () => {
    const e = estadoParaProgramar(lista("a"), "2030-01-02", ctx);
    expect(e).toMatchObject({ estado: "lista", redes: ["instagram"], motivos: [] });
  });

  it("dice por qué no: sin pieza, sin hora, sin texto", () => {
    const e = estadoParaProgramar(lista("a", { medios: [], publishTime: "", descripcion: "" }), "2030-01-02", ctx);
    expect(e.estado).toBe("no-lista");
    expect(e.motivos).toEqual(["Le falta la pieza (la imagen o el video).", "Le falta la hora.", "Le falta el texto."]);
  });

  it("una historia no necesita texto", () => {
    expect(estadoParaProgramar(lista("h", { format: "historia", descripcion: "" }), "2030-01-02", ctx).estado).toBe("lista");
  });

  it("los errores del panel la paran (los de las redes que tiene el cliente)", () => {
    const e = estadoParaProgramar(lista("r", { format: "reel" }), "2030-01-02", ctx);
    expect(e.estado).toBe("no-lista");
    expect(e.motivos.join(" ")).toMatch(/Un reel necesita un video/);
  });

  it("lo que el navegador arregla solo (PNG, 3:4) no la para", () => {
    const post = lista("p", { medios: [{ src: "/api/media/clientes/c1/p.png", tipo: "imagen", ancho: 768, alto: 1024 }] });
    expect(estadoParaProgramar(post, "2030-01-02", ctx).estado).toBe("lista");
  });

  it("sin redes conectadas o sin la cuenta de su red, no", () => {
    expect(estadoParaProgramar(lista("a"), "2030-01-02", { ...ctx, conectadas: [] }).motivos.join(" ")).toMatch(/ninguna red conectada/);
    expect(estadoParaProgramar(lista("a", { redes: ["facebook"] }), "2030-01-02", ctx).motivos.join(" ")).toMatch(/cuenta de Facebook/);
  });

  it("lo que ya pasó, no", () => {
    expect(estadoParaProgramar(lista("a"), "2029-12-30", ctx).motivos).toContain("Su día y hora ya pasaron.");
  });

  it("si el cliente pidió cambios, no", () => {
    expect(estadoParaProgramar(lista("a", { status: "rejected" }), "2030-01-02", ctx).motivos[0]).toMatch(/pidió cambios/);
  });

  it("lo que ya está en la cola, lo publicado, lo de «La publico yo» y los directos van aparte", () => {
    const cola = [{ postId: "q", red: "instagram", estado: "programada" }, { postId: "e", red: "instagram", estado: "error" }];
    const c = { ...ctx, cola };
    expect(estadoParaProgramar(lista("q"), "2030-01-02", c).estado).toBe("en-cola");
    // Lo que falló no está en la cola: se puede volver a programar.
    expect(estadoParaProgramar(lista("e"), "2030-01-02", c).estado).toBe("lista");
    expect(estadoParaProgramar(lista("p", { status: "published" }), "2030-01-02", c).estado).toBe("publicada");
    expect(estadoParaProgramar(lista("m", { asistida: true }), "2030-01-02", c).estado).toBe("a-mano");
    expect(estadoParaProgramar(lista("l", { format: "live" }), "2030-01-02", c).estado).toBe("directo");
  });

  it("el mes entero: las listas en orden con sus redes, las que no con su motivo, y las demás contadas", () => {
    const days = [
      { date: "2030-01-04", posts: [lista("b"), lista("x", { medios: [] })] },
      { date: "2030-01-02", posts: [lista("a"), lista("m", { asistida: true })] },
    ];
    const r = loListoDelMes(days, ctx);
    expect(r.listas.map((x) => x.post.id)).toEqual(["a", "b"]);
    expect(r.listas[0]).toMatchObject({ fecha: "2030-01-02", redes: ["instagram"] });
    expect(r.noListas.map((x) => x.post.id)).toEqual(["x"]);
    expect(r.cuentas["a-mano"]).toBe(1);
  });

  it("la confirmación: el número, el mes, la lista corta y las que el cliente aún no responde", () => {
    const listas = Array.from({ length: 10 }, (_, i) => ({
      post: lista(`p${i}`, { title: `Pieza ${i}`, ...(i < 2 ? { enviadoAt: "2029-12-30T00:00:00Z" } : {}) }),
      fecha: "2030-01-02", cuando: "2030-01-02T14:00:00.000Z", redes: ["instagram"],
    }));
    const c = confirmacionDeProgramar(listas, "enero");
    expect(c.titulo).toBe("Programar 10 publicaciones de enero");
    expect(c.lineas).toHaveLength(8);
    expect(c.lineas[0].texto).toMatch(/Pieza 0$/);
    expect(c.lineas[0].redes).toBe("Instagram");
    expect(c.mas).toBe(2);
    expect(c.pendientesCliente).toBe(2);
    expect(confirmacionDeProgramar(listas.slice(0, 1), "enero").titulo).toBe("Programar 1 publicación de enero");
  });
});

describe("los detalles de cada publicación", () => {
  const ctx = { conectadas: ["instagram"], cola: [], ahora: AHORA };

  it("junta lo que impide programarla, los avisos del panel y la revisión de los textos (sin repetir)", () => {
    const post = lista("a", { format: "historia", descripcion: "Hola", publishTime: "" });
    const d = detallesDe(post, "2030-01-02", { ...ctx, problemasTexto: [{ codigo: "voseo", texto: "Voseo: «vení» → «ven»." }, "Voseo: «vení» → «ven»."] });
    expect(d.estado).toBe("no-lista");
    expect(d.motivos).toContain("Le falta la hora.");
    expect(d.avisos).toContain("Una historia no muestra el texto: el texto va dentro de la imagen o el video.");
    expect(d.avisos.filter((a) => a.startsWith("Voseo"))).toHaveLength(1);
  });

  it("sin pieza: lo que le falta para que el cliente la entienda; y los hashtags que no lleva", () => {
    const d = detallesDe(lista("a", { medios: [], hashtagsFinales: "" }), "2030-01-02", ctx);
    expect(d.avisos.join(" ")).toMatch(/le falta una referencia/);
    expect(d.avisos).toContain("No lleva hashtags.");
  });

  it("lo que el navegador convierte solo al programar no ensucia los detalles", () => {
    const post = lista("p", { medios: [{ src: "/api/media/clientes/c1/p.png", tipo: "imagen", ancho: 1080, alto: 1350 }] });
    expect(detallesDe(post, "2030-01-02", ctx).avisos).toEqual([]);
  });

  it("«La publicas tú» no es un problema: va como nota", () => {
    const d = detallesDe(lista("m", { asistida: true }), "2030-01-02", ctx);
    expect(d).toMatchObject({ estado: "a-mano", motivos: [] });
    expect(d.nota).toMatch(/La publicas tú/);
  });

  it("los filtros", () => {
    const limpio = { estado: "lista", motivos: [], avisos: [] };
    const conAviso = { estado: "lista", motivos: [], avisos: ["x"] };
    const rota = { estado: "no-lista", motivos: ["y"], avisos: [] };
    expect([limpio, conAviso, rota].filter((d) => pasaFiltroDetalles(d, "avisos"))).toEqual([conAviso, rota]);
    expect([limpio, conAviso, rota].filter((d) => pasaFiltroDetalles(d, "no-listas"))).toEqual([rota]);
    expect([limpio, conAviso, rota].filter((d) => pasaFiltroDetalles(d))).toHaveLength(3);
  });
});
