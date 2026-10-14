import { describe, it, expect } from "vitest";
import { filtrarArchivos, contarFiltros, trabajosVisibles, fraseDeTrabajo, hace, textoPapelera, nombreDeDescarga, archivoDesdeSrc, promptDeEdicion, modeloParaEditar, originalDe, ranurasLibres, RANURAS, pedidoDeCorreccion } from "./estudio.js";

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
    // «Qué se ve» manda: la idea (el brief) pasa a contexto.
    expect(promptDePublicacion({ escena: "Una mamá abre el sofá cama", idea: "Lo que gana: dormir bien", descripcion: "Escríbenos." }))
      .toBe("Una mamá abre el sofá cama\n\nContexto de la publicación: Lo que gana: dormir bien — Escríbenos.");
    expect(promptDePublicacion({})).toBe("");
    expect(promptDePublicacion({ idea: "x".repeat(3000) }).length).toBe(1500);
  });

  it("el texto de la pieza va EXACTO, salvo en un carrusel o en un video", async () => {
    const { promptDePublicacion, textoDeLaPieza } = await import("./estudio.js");
    expect(textoDeLaPieza("Tu sofá «como nuevo»\n\nDesde $45\n")).toBe('"Tu sofá como nuevo" / "Desde $45"');
    expect(textoDeLaPieza("")).toBe("");
    const post = { idea: "Un sofá gris", textoPieza: "Como nuevo\nDesde $45" };
    expect(promptDePublicacion(post)).toBe('Un sofá gris\n\nTexto en la imagen, exacto y legible: "Como nuevo" / "Desde $45"');
    expect(promptDePublicacion({ ...post, format: "carrusel" })).toBe("Un sofá gris");
    expect(promptDePublicacion(post, { conTexto: false })).toBe("Un sofá gris");
  });

  it("las fotos de un producto del catálogo, como archivos de apoyo", async () => {
    const { fotosDelProducto } = await import("./estudio.js");
    const productos = [{ id: "p-sofa", nombre: "Sofá", fotos: ["clientes/c1/a.jpg"] }];
    expect(fotosDelProducto(productos, "p-sofa")).toEqual([{ id: "ext:clientes/c1/a.jpg", src: "/api/media/clientes/c1/a.jpg", clave: "clientes/c1/a.jpg", prompt: "Sofá", producto: { nombre: "Sofá", marca: "" } }]);
    expect(fotosDelProducto(productos, "p-otro")).toEqual([]);
    expect(fotosDelProducto(productos, "")).toEqual([]);
    expect(fotosDelProducto(undefined, "p-sofa")).toEqual([]);
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

describe("editar una imagen con una indicación", () => {
  it("el prompt pide el cambio y que no se toque lo demás", () => {
    const p = promptDeEdicion("Quita el texto.  ");
    expect(p).toMatch(/^Edita la imagen de referencia: Quita el texto\. Conserva todo lo demás/);
    expect(promptDeEdicion("   ")).toBe("");
  });

  it("edita con Muse Image si hay llave de Meta; si no, Nano Banana; sin nada, la prueba", () => {
    expect(modeloParaEditar({ meta: true, gemini: true }).id).toBe("muse-image");
    expect(modeloParaEditar({ gemini: true }).id).toBe("nano-banana");
    expect(modeloParaEditar({ fal: true }).motor).toBe("fal");
    expect(modeloParaEditar({ prueba: true }).id).toBe("prueba");
  });

  it("la versión editada sabe de qué imagen sale, por su trabajo", () => {
    const original = { id: "a1", clave: "clientes/c/estudio/o.png" };
    const editada = { id: "a2", trabajoId: "t2" };
    const trabajos = [{ id: "t2", prompt: promptDeEdicion("más luz"), medios: { reference: [original.clave] } }];
    expect(originalDe(editada, trabajos, [original, editada])).toBe(original);
    // Una variación (referencia sin «Edita…») no es una edición.
    expect(originalDe(editada, [{ ...trabajos[0], prompt: "otra cosa" }], [original])).toBeNull();
    expect(originalDe({ id: "x" }, trabajos, [original])).toBeNull();
  });
});

describe("partirEscena (Otra versión no reescribe las órdenes del texto)", () => {
  it("separa lo que se ve de lo que manda sobre el texto", async () => {
    const { partirEscena } = await import("./estudio");
    expect(partirEscena("Un sofá en la sala. Composición: cenital. NO escribas ningún texto, letra ni número en la imagen.")).toEqual({
      escena: "Un sofá en la sala. Composición: cenital.", cola: "NO escribas ningún texto, letra ni número en la imagen.",
    });
    expect(partirEscena('Una taza. Texto en la imagen, EXACTO: "Hola"')).toEqual({ escena: "Una taza.", cola: 'Texto en la imagen, EXACTO: "Hola"' });
    expect(partirEscena("Sólo una escena")).toEqual({ escena: "Sólo una escena", cola: "" });
  });
});

describe("el modelo fijado", () => {
  it("arranca con el fijado si existe, es de ese tipo y tiene llave; si no, el predeterminado", async () => {
    const { modeloPreferido } = await import("./estudio");
    const { modeloPorDefecto } = await import("./estudioCatalogo");
    const activos = { gemini: true, fal: true };
    expect(modeloPreferido(activos, "imagen", "seedream-4").id).toBe("seedream-4");
    expect(modeloPreferido(activos, "imagen", "no-existe").id).toBe(modeloPorDefecto(activos, "imagen").id);
    expect(modeloPreferido(activos, "video", "nano-banana").id).toBe(modeloPorDefecto(activos, "video").id);
    expect(modeloPreferido({}, "imagen", "nano-banana").id).toBe(modeloPorDefecto({}, "imagen").id);
  });
});

describe("¿dónde va una imagen de la galería?", () => {
  it("con un modelo de video que tiene inicial, final y referencias, se ofrecen los sitios libres (y se pregunta)", () => {
    const m = { inicial: 1, final: 1, referencias: 7, video: 1 };
    const a = { id: "a", tipo: "imagen" };
    expect(ranurasLibres({ start: [], end: [], reference: [] }, m, a)).toEqual(["start", "reference"]);
    expect(ranurasLibres({ start: [{ id: "b" }], end: [], reference: [] }, m, a)).toEqual(["end", "reference"]);
    expect(ranurasLibres({ start: [{ id: "a" }], end: [], reference: [] }, m, a)).toEqual(["reference"]);
    expect(ranurasLibres({ start: [], reference: Array.from({ length: 7 }, (_, i) => ({ id: `r${i}` })) }, m, a)).toEqual(["start"]);
    expect(ranurasLibres({}, m, { id: "v", tipo: "video" })).toEqual(["video"]);
    expect(ranurasLibres({ video: [{ id: "x" }] }, m, { id: "v", tipo: "video" })).toEqual([]);
    expect(ranurasLibres({}, { referencias: 3 }, a)).toEqual(["reference"]);
    expect(RANURAS.reference.nombre).toBe("Referencia");
  });
});

describe("corregir con ejemplos de la galería", () => {
  it("la imagen va primero; los ejemplos detrás, los que quepan, cada uno diciendo qué se toma", () => {
    const m = { referencias: 3 };
    const ej = [{ clave: "clientes/c1/a.png", toma: ["tipografia"] }, { clave: "clientes/c1/b.png" }, { clave: "clientes/c1/c.png" }];
    const p = pedidoDeCorreccion({ clave: "clientes/c1/base.png", instruccion: "el titular más grande", ejemplos: ej, modelo: m });
    expect(p.medios.reference).toEqual(["clientes/c1/base.png", "clientes/c1/a.png", "clientes/c1/b.png"]);
    expect(p.prompt).toMatch(/^Edita la imagen de referencia 1: el titular más grande\./);
    expect(p.prompt).toMatch(/Imagen de referencia 2: toma SÓLO/);
    expect(p.prompt).toMatch(/Imagen de referencia 3: es un EJEMPLO/);
    expect(p.prompt).not.toMatch(/referencia 4/);
    // Sin ejemplos, el pedido de siempre.
    expect(pedidoDeCorreccion({ clave: "k", instruccion: "x", modelo: m }).prompt).toBe(promptDeEdicion("x"));
    // Un modelo de una sola referencia: sólo la imagen.
    expect(pedidoDeCorreccion({ clave: "k", instruccion: "x", ejemplos: ej, modelo: { referencias: 1 } }).medios.reference).toEqual(["k"]);
  });
});
