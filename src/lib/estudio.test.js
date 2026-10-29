import { describe, it, expect } from "vitest";
import { filtrarArchivos, contarFiltros, trabajosVisibles, fraseDeTrabajo, hace, textoPapelera, nombreDeDescarga, archivoDesdeSrc, promptDeEdicion, modeloParaEditar, originalDe, ranurasLibres, RANURAS, pedidoDeCorreccion, agruparGaleria, piezasDeGrupo, textoDeGrupo, nombresParaZip, estaUsado } from "./estudio.js";

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
    expect(contarFiltros(lista, [{ id: "f1" }, { id: "f2" }])).toEqual({ todas: 3, favoritas: 1, subidas: 1, usadas: 0, "sin-usar": 3, "sin-carpeta": 1, f1: 2, f2: 0 });
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

describe("carruseles y reels agrupados en la galería", () => {
  const car = { id: "c1", nombre: "Carrusel · x", tipo: "carrusel", orden: [] };
  const reel = { id: "r1", nombre: "Reel · y", tipo: "reel", orden: [] };
  const a = (id, extra = {}) => ({ id, tipo: "imagen", mime: "image/png", usadoEn: [], creado: `2026-10-14T10:0${id.slice(-1)}:00Z`, ...extra });
  const archivos = [
    a("s9"),
    a("f3", { carpetaId: "c1", ajustes: { plantilla: { origenId: "f2", texto: "Hola" } }, mime: "image/jpeg" }),
    a("f2", { carpetaId: "c1" }),
    a("f1", { carpetaId: "c1" }),
    a("v5", { carpetaId: "r1", tipo: "video", mime: "video/mp4" }),
    a("g4", { carpetaId: "r1" }),
    a("s0", { usadoEn: [{ clave: "c:p" }] }),
  ];

  it("cada carrusel y cada reel es UNA tarjeta, donde está su pieza más nueva", () => {
    const vista = agruparGaleria(archivos, [car, reel]);
    expect(vista.map((x) => x.grupo ? x.grupo.carpeta.id : x.id)).toEqual(["s9", "c1", "r1", "s0"]);
  });

  it("sin orden guardado: las láminas en orden y sin la cruda que ya tiene texto encima", () => {
    expect(piezasDeGrupo(car, archivos).map((x) => x.id)).toEqual(["f1", "f3"]);
    expect(piezasDeGrupo(reel, archivos).map((x) => x.id)).toEqual(["v5", "g4"]);
  });

  it("con orden guardado manda el orden, y lo que ya no está se salta", () => {
    expect(piezasDeGrupo({ ...car, orden: ["f3", "f1", "borrada"] }, archivos).map((x) => x.id)).toEqual(["f3", "f1"]);
  });

  it("dice qué es y nombra las piezas del ZIP", () => {
    expect(textoDeGrupo(car, piezasDeGrupo(car, archivos))).toBe("Carrusel · 2 láminas");
    expect(textoDeGrupo(reel, piezasDeGrupo(reel, archivos))).toBe("Reel · 1 video y 1 fotograma");
    expect(nombresParaZip(car, piezasDeGrupo(car, archivos))).toEqual(["01.png", "02.jpg"]);
    expect(nombresParaZip(reel, piezasDeGrupo(reel, archivos))).toEqual(["video-1.mp4", "fotograma-01.png"]);
  });

  it("una carpeta normal no se agrupa", () => {
    expect(agruparGaleria(archivos, [{ id: "c1", nombre: "Mía", tipo: "", orden: [] }])).toHaveLength(archivos.length);
  });

  it("usadas y sin usar", () => {
    expect(estaUsado(archivos[6])).toBe(true);
    expect(filtrarArchivos(archivos, { filtro: "usadas" }).map((x) => x.id)).toEqual(["s0"]);
    expect(filtrarArchivos(archivos, { filtro: "sin-usar" })).toHaveLength(6);
    const c = contarFiltros(archivos, []);
    expect([c.usadas, c["sin-usar"]]).toEqual([1, 6]);
  });
});

describe("lo que se dice al subir", () => {
  it("avisa de lo que ya estaba", async () => {
    const { fraseDeSubida } = await import("./estudio.js");
    expect(fraseDeSubida(1)).toBe("Imagen subida a la galería.");
    expect(fraseDeSubida(1, 1)).toMatch(/^Ya estaba en la galería/);
    expect(fraseDeSubida(3, 1)).toBe("3 imágenes subidas. 1 ya estaba en la galería (no se guardó otra copia).");
    expect(fraseDeSubida(1, 0, true)).toBe("Video subido a la galería.");
  });
});

describe("el orden de un carrusel agrupado", () => {
  it("mueve una pieza un sitio, sin salirse", async () => {
    const { moverEnOrden } = await import("./estudio");
    expect(moverEnOrden(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moverEnOrden(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    const igual = ["a", "b"];
    expect(moverEnOrden(igual, "a", -1)).toBe(igual);
    expect(moverEnOrden(igual, "x", 1)).toBe(igual);
  });
});

describe("el texto de la pieza, de un toque", () => {
  it("cada ajuste es una edición con medidas; «Igualar» lleva la buena de referencia sólo por su composición y su letra", async () => {
    const { AJUSTES_DE_TEXTO, IGUALAR_TEXTO, ejemploParaIgualar, pedidoDeCorreccion } = await import("./estudio");
    expect(AJUSTES_DE_TEXTO.map((x) => x.id)).toEqual(["arriba", "abajo", "pequeno", "grande", "centrar"]);
    expect(AJUSTES_DE_TEXTO.find((x) => x.id === "arriba").instruccion).toMatch(/10 puntos porcentuales/);
    const p = pedidoDeCorreccion({ clave: "clientes/c1/mala.png", instruccion: IGUALAR_TEXTO, ejemplos: [ejemploParaIgualar({ id: "b", clave: "clientes/c1/buena.png" })], modelo: { referencias: 3 } });
    expect(p.medios.reference).toEqual(["clientes/c1/mala.png", "clientes/c1/buena.png"]);
    expect(p.prompt).toMatch(/^Edita la imagen de referencia 1: Pon el texto de la imagen de referencia 1 en la MISMA posición/);
    expect(p.prompt).toMatch(/Imagen de referencia 2: toma SÓLO/);
  });
});

describe("«Vaciar la papelera» dice qué se queda y por qué", async () => {
  const { textoDeVaciar } = await import("./estudio.js");
  it("cuántas se borraron y, de lo que se queda, cuántas usa una publicación y cuáles son de la marca", () => {
    expect(textoDeVaciar(5)).toBe("5 borradas del todo.");
    expect(textoDeVaciar(1, [{ motivo: "publicacion", fecha: "2026-10-12" }])).toBe("1 borrada del todo. Se queda 1: 1 la usa una publicación (quítala de ahí primero).");
    expect(textoDeVaciar(0, [{ motivo: "marca", que: "el logo del kit" }, { motivo: "publicacion" }, { motivo: "publicacion" }]))
      .toBe("No se borró nada. Se quedan 3: 2 las usan una publicación (quítala de ahí primero); 1 es de la marca (el logo del kit): cámbiala en el kit o el catálogo.");
  });
});
