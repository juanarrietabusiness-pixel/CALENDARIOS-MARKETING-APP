import { describe, it, expect } from "vitest";
import { filtrarArchivos, contarFiltros, trabajosVisibles, fraseDeTrabajo, hace, textoPapelera, nombreDeDescarga, archivoDesdeSrc } from "./estudio.js";

const A = (o) => ({ id: "a", prompt: "una taza", modelo: "nano-banana", favorito: false, subido: false, carpetaId: null, ...o });

describe("filtrar la galería", () => {
  const lista = [
    A({ id: "1", prompt: "Taza de café", favorito: true }),
    A({ id: "2", prompt: "Logo", subido: true, carpetaId: "f1" }),
    A({ id: "3", prompt: "Playa al atardecer", modelo: "prueba", carpetaId: "f1" }),
  ];
  it("por favoritas, subidas, carpeta y sin carpeta", () => {
    expect(filtrarArchivos(lista, { filtro: "favoritas" }).map((a) => a.id)).toEqual(["1"]);
    expect(filtrarArchivos(lista, { filtro: "subidas" }).map((a) => a.id)).toEqual(["2"]);
    expect(filtrarArchivos(lista, { filtro: "f1" }).map((a) => a.id)).toEqual(["2", "3"]);
    expect(filtrarArchivos(lista, { filtro: "sin-carpeta" }).map((a) => a.id)).toEqual(["1"]);
    expect(filtrarArchivos(lista, { filtro: "todas" })).toHaveLength(3);
  });
  it("por texto, en el prompt y en el modelo, sin importar mayúsculas", () => {
    expect(filtrarArchivos(lista, { texto: "CAFÉ" }).map((a) => a.id)).toEqual(["1"]);
    expect(filtrarArchivos(lista, { texto: "prueba" }).map((a) => a.id)).toEqual(["3"]);
    expect(filtrarArchivos(lista, { texto: "  " })).toHaveLength(3);
  });
  it("cuenta cada filtro", () => {
    expect(contarFiltros(lista, [{ id: "f1" }, { id: "f2" }])).toEqual({ todas: 3, favoritas: 1, subidas: 1, "sin-carpeta": 1, f1: 2, f2: 0 });
  });
});

describe("qué trabajos se enseñan arriba", () => {
  const ahora = Date.parse("2026-10-01T12:00:00Z");
  const T = (o) => ({ id: "t", estado: "hecho", nota: "", creado: "2026-10-01T11:50:00Z", actualizado: "2026-10-01T11:55:00Z", ...o });
  it("los vivos siempre", () => {
    expect(trabajosVisibles([T({ estado: "en_cola" }), T({ id: "u", estado: "en_marcha" })], { ahora })).toHaveLength(2);
  });
  it("lo que falló o se canceló en la última hora, hasta que se descarta", () => {
    const f = T({ id: "f", estado: "fallido" });
    expect(trabajosVisibles([f], { ahora })).toHaveLength(1);
    expect(trabajosVisibles([f], { ahora, descartados: new Set(["f"]) })).toHaveLength(0);
    expect(trabajosVisibles([T({ estado: "fallido", actualizado: "2026-10-01T09:00:00Z" })], { ahora })).toHaveLength(0);
  });
  it("lo terminado bien no, salvo que llegara menos de lo pedido", () => {
    expect(trabajosVisibles([T()], { ahora })).toHaveLength(0);
    expect(trabajosVisibles([T({ nota: "Llegaron 1 de 3: …", terminado: "2026-10-01T11:58:00Z" })], { ahora })).toHaveLength(1);
  });
});

describe("las frases", () => {
  it("dice por dónde va", () => {
    expect(fraseDeTrabajo({ estado: "en_cola", n: 1, archivos: [] })).toBe("En cola…");
    expect(fraseDeTrabajo({ estado: "en_marcha", n: 3, archivos: ["a"] })).toBe("Creando la 2 de 3…");
    expect(fraseDeTrabajo({ estado: "en_marcha", n: 1, archivos: [] })).toBe("Creando la imagen…");
    expect(fraseDeTrabajo({ estado: "en_marcha", tipo: "video", n: 1, archivos: [] })).toBe("Creando el video…");
    expect(fraseDeTrabajo({ estado: "en_marcha", tipo: "video", n: 2, archivos: ["a"] })).toBe("Creando el 2 de 2…");
    // Lo que el servidor cuenta de un video en espera es más útil que un «Creando».
    expect(fraseDeTrabajo({ estado: "en_marcha", tipo: "video", n: 1, archivos: [], nota: "Enviado: el video tarda unos minutos." })).toBe("Enviado: el video tarda unos minutos.");
    expect(fraseDeTrabajo({ estado: "fallido", error: "Sin saldo." })).toBe("Sin saldo.");
    expect(fraseDeTrabajo({ estado: "cancelado", n: 3, archivos: ["a"] })).toBe("Cancelado. Llegaron 1 de 3.");
  });
  it("hace cuánto", () => {
    const ahora = Date.parse("2026-10-01T12:00:00Z");
    expect(hace("2026-10-01T11:59:50Z", ahora)).toBe("ahora");
    expect(hace("2026-10-01T11:55:00Z", ahora)).toBe("hace 5 min");
    expect(hace("2026-10-01T09:00:00Z", ahora)).toBe("hace 3 h");
    expect(hace("2026-09-30T09:00:00Z", ahora)).toBe("ayer");
    expect(hace("nada", ahora)).toBe("");
  });
  it("cuánto queda en la papelera", () => {
    const ahora = Date.parse("2026-10-01T12:00:00Z");
    expect(textoPapelera("2026-09-01T12:00:00Z", ahora)).toBe("Se borra hoy");
    expect(textoPapelera("2026-09-02T12:00:00Z", ahora)).toBe("Se borra mañana");
    expect(textoPapelera("2026-09-21T12:00:00Z", ahora)).toBe("Se borra en 20 días");
  });
  it("el nombre de descarga sale del prompt", () => {
    expect(nombreDeDescarga({ prompt: "Una taza de café ☕!", mime: "image/png" })).toBe("una-taza-de-cafe.png");
    expect(nombreDeDescarga({ prompt: "", mime: "image/jpeg" })).toBe("imagen.jpg");
  });
});

describe("de una publicación al Estudio", () => {
  it("la proporción sigue al formato", async () => {
    const { proporcionParaFormato } = await import("./estudio.js");
    expect(proporcionParaFormato("reel")).toBe("9:16");
    expect(proporcionParaFormato("historia")).toBe("9:16");
    expect(proporcionParaFormato("post")).toBe("4:5");
    expect(proporcionParaFormato("carrusel")).toBe("4:5");
    expect(proporcionParaFormato("live")).toBe("16:9");
    expect(proporcionParaFormato("post", "video")).toBe("9:16");
  });

  it("el prompt sale de la idea, con el texto como contexto", async () => {
    const { promptDePublicacion } = await import("./estudio.js");
    expect(promptDePublicacion({ idea: "Un sofá gris", descripcion: "Espuma de alta densidad." })).toBe("Un sofá gris\n\nContexto de la publicación: Espuma de alta densidad.");
    expect(promptDePublicacion({ title: "Sofá", descripcion: "Texto largo" })).toBe("Sofá");
    expect(promptDePublicacion({})).toBe("");
    expect(promptDePublicacion({ idea: "x".repeat(3000) }).length).toBe(1500);
  });

  it("reconoce un video de verdad y la proporción de unas medidas", async () => {
    const { esVideoReal, proporcionDeMedidas, medioDeArchivo } = await import("./estudio.js");
    expect(esVideoReal({ mime: "video/mp4" })).toBe(true);
    expect(esVideoReal({ mime: "image/svg+xml" })).toBe(false);
    expect(proporcionDeMedidas(1080, 1920)).toBe("9:16");
    expect(proporcionDeMedidas(896, 1152)).toBe("4:5");
    expect(proporcionDeMedidas(1000, 1000)).toBe("1:1");
    expect(proporcionDeMedidas(1920, 1080)).toBe("16:9");
    expect(proporcionDeMedidas(0, 0)).toBeNull();
    expect(medioDeArchivo({ src: "/api/media/x.png", mime: "image/png", prompt: "Un sofá", ancho: 896, alto: 1152 })).toEqual({ src: "/api/media/x.png", tipo: "imagen", nombre: "Un sofá", ancho: 896, alto: 1152 });
    expect(medioDeArchivo({ src: "/api/media/x.mp4", mime: "video/mp4", prompt: "", ancho: 0, alto: 0 })).toEqual({ src: "/api/media/x.mp4", tipo: "video", nombre: "" });
  });
  it("una imagen de la publicación se puede usar de inicial sólo si es del propio cliente", () => {
    const a = archivoDesdeSrc("/api/media/clientes/c1/2026/foto%20uno.jpg?v=3", "c1", "Foto uno");
    expect(a).toEqual({ id: "ext:clientes/c1/2026/foto uno.jpg", src: "/api/media/clientes/c1/2026/foto%20uno.jpg?v=3", clave: "clientes/c1/2026/foto uno.jpg", prompt: "Foto uno" });
    expect(archivoDesdeSrc("/api/media/clientes/c2/foto.jpg", "c1")).toBeNull();
    expect(archivoDesdeSrc("/api/media/clientes/c1/../c2/foto.jpg", "c1")).toBeNull();
    expect(archivoDesdeSrc("data:image/png;base64,AAAA", "c1")).toBeNull();
    expect(archivoDesdeSrc("https://x.test/a.png", "c1")).toBeNull();
    expect(archivoDesdeSrc("", "c1")).toBeNull();
  });
});
