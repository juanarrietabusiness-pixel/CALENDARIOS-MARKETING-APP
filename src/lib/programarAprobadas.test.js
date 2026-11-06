import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.js", () => ({
  saveCalendar: vi.fn(async (cal) => cal),
  programarVarias: vi.fn(async (_cal, ids) => ({ programadas: ids.map((postId) => ({ postId, red: "instagram" })), fallidas: [] })),
  subirImagenPublicacion: vi.fn(),
}));

const db = await import("./db.js");
const { programarAprobadasDe } = await import("./programarAprobadas.js");
const { prepararParaAprobar, conPreparadas, piezasParaPreparar } = await import("./prepararEnvio.js");

const cal = {
  id: "cal1",
  days: [{ date: "2030-01-02", posts: [{ id: "a", title: "Buena" }, { id: "b", title: "Rota" }, { id: "c", title: "Otra" }] }],
};
const lista = cal.days[0].posts.map((post) => ({ post, redes: ["instagram"] }));

describe("programar lo aprobado de una vez", () => {
  beforeEach(() => vi.clearAllMocks());

  it("una publicación que no se puede preparar NO para a las demás: vuelve con su motivo", async () => {
    const preparar = vi.fn(async (post) => {
      if (post.id === "b") throw new Error("No se pudo leer «foto.png».");
      return { post: { ...post, preparada: true }, cambio: true };
    });
    const r = await programarAprobadasDe({ cal, clienteDb: "c1", lista, preparar });
    expect(db.programarVarias).toHaveBeenCalledWith("cal1", ["a", "c"]);
    expect(r.programadas).toBe(2);
    expect(r.fallidas).toEqual([{ postId: "b", titulo: "Rota", motivo: expect.stringMatching(/No se pudieron preparar sus archivos: No se pudo leer «foto\.png»/) }]);
    // El calendario se guarda con las que sí se prepararon.
    const guardado = db.saveCalendar.mock.calls[0][0];
    expect(guardado.days[0].posts.map((p) => Boolean(p.preparada))).toEqual([true, false, true]);
  });

  it("si no se puede preparar ninguna, no se llama a programar y se dice por qué", async () => {
    const preparar = vi.fn(async () => { throw new Error("sin red"); });
    const r = await programarAprobadasDe({ cal, clienteDb: "c1", lista, preparar });
    expect(db.programarVarias).not.toHaveBeenCalled();
    expect(r.programadas).toBe(0);
    expect(r.fallidas).toHaveLength(3);
  });
});

describe("preparar las piezas al enviarlas, para que salgan solas al aprobar", () => {
  it("prepara cada una por su lado y dice cuál no se pudo", async () => {
    const preparar = vi.fn(async (post) => {
      if (post.id === "b") throw new Error("no carga");
      return { post: { ...post, image: `${post.id}.jpg` }, cambio: post.id !== "c" };
    });
    const r = await prepararParaAprobar({ lista, clienteDb: "c1", preparar });
    expect([...r.cambiadas.keys()]).toEqual(["a"]);
    expect(r.fallidas).toEqual([{ postId: "b", titulo: "Rota", motivo: "no carga" }]);
  });

  it("lo preparado se pone sobre el calendario de AHORA y no pisa lo que se cambió mientras tanto", () => {
    const antes = { days: [{ date: "2030-01-02", posts: [{ id: "a", image: "a.png", descripcion: "x" }, { id: "b", image: "b.png" }] }] };
    // Mientras se preparaba: a «a» le cambiaron el texto (sus archivos siguen) y a «b» la imagen.
    const ahora = { days: [{ date: "2030-01-02", posts: [{ id: "a", image: "a.png", descripcion: "nuevo" }, { id: "b", image: "otra.png" }] }] };
    const cambiadas = new Map([
      ["a", { id: "a", image: "a.jpg", medios: [{ src: "a.jpg" }], adaptados: { "feed|a.jpg": 1 } }],
      ["b", { id: "b", image: "b.jpg" }],
    ]);
    const { cal, n } = conPreparadas(ahora, antes, cambiadas);
    expect(n).toBe(1);
    expect(cal.days[0].posts[0]).toMatchObject({ image: "a.jpg", descripcion: "nuevo", adaptados: { "feed|a.jpg": 1 } });
    expect(cal.days[0].posts[1].image).toBe("otra.png");
  });

  it("la portada del reel pasada a JPEG también se pone; si alguien la cambió mientras tanto, no se pisa", () => {
    const v = [{ src: "v.mp4", tipo: "video" }];
    const antes = { days: [{ date: "2030-01-02", posts: [{ id: "r", format: "reel", medios: v, portada: "p.png" }, { id: "s", format: "reel", medios: v, portada: "q.png" }] }] };
    const ahora = { days: [{ date: "2030-01-02", posts: [{ id: "r", format: "reel", medios: v, portada: "p.png" }, { id: "s", format: "reel", medios: v, portada: "otra.png" }] }] };
    const cambiadas = new Map([["r", { id: "r", medios: v, portada: "p.jpg" }], ["s", { id: "s", medios: v, portada: "q.jpg" }]]);
    const { cal, n } = conPreparadas(ahora, antes, cambiadas);
    expect(n).toBe(1);
    expect(cal.days[0].posts[0].portada).toBe("p.jpg");
    expect(cal.days[0].posts[1].portada).toBe("otra.png");
  });
});

describe("qué piezas se preparan al enviar", () => {
  it("las de una pieza aprobable, desde hoy, con red del cliente y fuera de la cola", () => {
    const img = { medios: [{ src: "/api/media/clientes/c/posts/a.png", tipo: "imagen" }] };
    const mes = { days: [
      { date: "2030-01-01", posts: [{ id: "vieja", format: "post", ...img }] },
      { date: "2030-01-05", posts: [
        { id: "si", format: "post", ...img },
        { id: "idea", format: "post", aprobacion: "idea" },
        { id: "en-cola", format: "post", ...img },
        { id: "a-mano", format: "post", asistida: true, ...img },
      ] },
    ] };
    const lista = piezasParaPreparar(mes, [{ postId: "en-cola", estado: "programada" }], ["instagram", "facebook"], "2030-01-02");
    expect(lista.map((x) => x.post.id)).toEqual(["si"]);
    expect(lista[0].redes.sort()).toEqual(["facebook", "instagram"]);
  });
});
