import { describe, it, expect } from "vitest";
import {
  coincideConBusqueda, formaDe, enFecha, esDelProducto, esCarpetaAutomatica, esCarpetaCompetencia, porSemanas, tituloDeSemana, lunesDe, diaDePanama,
} from "./galeriaVistas.js";
import {
  filtrarArchivos, contarVistas, idsDeLaSeleccion, insigniasDe, conPagina, fechaDeTarjeta, agruparGaleria, apilarVersiones,
} from "./estudio.js";

// La galería del Estudio vista y buscada (src/lib/galeriaVistas.js y lo de la galería de src/lib/estudio.js).

const A = (id, extra = {}) => ({ id, clave: `clientes/c1/${id}.png`, tipo: "imagen", prompt: id, modelo: "muse-image", usadoEn: [], ajustes: {}, carpetaId: null, creado: "2026-11-10T15:00:00.000Z", ...extra });
const MARCA = "\n\nMarca: paleta beige, azul y dorado; estilo cálido; nunca neón.";

describe("buscar", () => {
  it("en la escena, no en el bloque de la marca; sin tildes ni mayúsculas, cada palabra en cualquier orden", () => {
    const a = A("a", { prompt: `Escena: Un sofá cama gris en la sala${MARCA}` });
    expect(coincideConBusqueda(a, "SOFA")).toBe(true);
    expect(coincideConBusqueda(a, "sala sofá")).toBe(true);
    expect(coincideConBusqueda(a, "beige")).toBe(false);
    expect(coincideConBusqueda(a, "   ")).toBe(true);
  });
  it("por el título, el texto de la plantilla, el modelo, la fecha y la publicación donde se usa", () => {
    const a = A("a", {
      prompt: "Pieza: Portada Black Friday\nComposición: …", ajustes: { plantilla: { texto: "50 % en mesas" } },
      usadoEn: [{ fecha: "2026-11-27", titulo: "Viernes negro", producto: "Mesa de centro" }],
    });
    for (const q of ["portada black", "mesas", "muse image", "10 nov", "noviembre", "27 nov", "viernes negro", "mesa de centro"]) expect(coincideConBusqueda(a, q), q).toBe(true);
    expect(coincideConBusqueda(a, "diciembre")).toBe(false);
  });
  it("una foto del catálogo se encuentra por el nombre de su producto", () => {
    const a = A("foto", { subido: true, prompt: "IMG_2301.jpg" });
    expect(coincideConBusqueda(a, "pañal", { productos: [{ id: "p1", nombre: "Pañal de bambú", fotos: [a.clave] }] })).toBe(true);
    expect(coincideConBusqueda(a, "pañal")).toBe(false);
  });
});

describe("los filtros", () => {
  it("la forma por las medidas o por la proporción pedida", () => {
    expect(formaDe({ ancho: 1080, alto: 1920 })).toBe("vertical");
    expect(formaDe({ ancho: 1080, alto: 1350 })).toBe("4:5");
    expect(formaDe({ ancho: 896, alto: 1152 })).toBe("4:5");
    expect(formaDe({ ancho: 1024, alto: 1024 })).toBe("cuadrada");
    expect(formaDe({ ancho: 1920, alto: 1080 })).toBe("horizontal");
    expect(formaDe({ ajustes: { aspectRatio: "9:16" } })).toBe("vertical");
    expect(formaDe({})).toBe("");
  });
  it("la fecha, en semanas de lunes a domingo y meses de Panamá", () => {
    const ahora = Date.parse("2026-11-15T03:00:00.000Z"); // sábado 14 de noviembre por la noche, en Panamá
    expect(diaDePanama("2026-11-15T03:00:00.000Z")).toBe("2026-11-14");
    expect(lunesDe("2026-11-15T03:00:00.000Z")).toBe("2026-11-09");
    expect(enFecha(A("a", { creado: "2026-11-09T06:00:00.000Z" }), "semana", ahora)).toBe(true);
    expect(enFecha(A("a", { creado: "2026-11-09T04:00:00.000Z" }), "semana", ahora)).toBe(false); // domingo 8 en Panamá
    expect(enFecha(A("a", { creado: "2026-11-03T12:00:00.000Z" }), "pasada", ahora)).toBe(true);
    expect(enFecha(A("a", { creado: "2026-11-01T12:00:00.000Z" }), "mes", ahora)).toBe(true);
    expect(enFecha(A("a", { creado: "2026-10-20T12:00:00.000Z" }), "mes-pasado", ahora)).toBe(true);
    expect(enFecha(A("a", { creado: "2026-10-20T12:00:00.000Z" }), "mes", ahora)).toBe(false);
  });
  it("el producto: su foto, una publicación suya o la escena que lo nombra (palabra entera, sin tildes)", () => {
    const p = { id: "p1", nombre: "Sofá cama", fotos: ["clientes/c1/foto.png"] };
    expect(esDelProducto(A("foto"), p)).toBe(true);
    expect(esDelProducto(A("x", { usadoEn: [{ productoId: "p1" }] }), p)).toBe(true);
    expect(esDelProducto(A("y", { prompt: "Escena: un sofa cama en la sala" }), p)).toBe(true);
    expect(esDelProducto(A("z", { prompt: "Escena: un sofá de tres puestos" }), p)).toBe(false);
  });
});

describe("las vistas", () => {
  const carpetas = [{ id: "comp", nombre: "Competencia", tipo: "" }, { id: "car", nombre: "Carrusel · Sofá", tipo: "carrusel", orden: [] }, { id: "mia", nombre: "Mías", tipo: "" }];
  const lista = [
    A("suelta"),
    A("logo", { deLaMarca: "el logo del kit" }),
    A("rival", { carpetaId: "comp" }),
    A("l1", { carpetaId: "car" }),
    A("l2", { carpetaId: "car" }),
    A("gusta", { favorito: true, carpetaId: "mia" }),
  ];
  it("«Lo último» deja fuera la competencia y lo de la marca, que tienen su vista", () => {
    expect(filtrarArchivos(lista, { filtro: "todas", carpetas }).map((a) => a.id)).toEqual(["suelta", "l1", "l2", "gusta"]);
    expect(filtrarArchivos(lista, { filtro: "competencia", carpetas }).map((a) => a.id)).toEqual(["rival"]);
    expect(filtrarArchivos(lista, { filtro: "marca", carpetas }).map((a) => a.id)).toEqual(["logo"]);
    expect(filtrarArchivos(lista, { filtro: "grupos", carpetas }).map((a) => a.id)).toEqual(["l1", "l2"]);
    expect(filtrarArchivos(lista, { filtro: "sin-carpeta", carpetas }).map((a) => a.id)).toEqual(["suelta", "logo"]);
    expect(filtrarArchivos(lista, { filtro: "favoritas", carpetas, uso: "sin-usar" }).map((a) => a.id)).toEqual(["gusta"]);
  });
  it("«Lo último» cuenta TARJETAS: un carrusel es una y las versiones de una pieza, otra", () => {
    const conVersion = [A("nueva", { ajustes: { deArchivo: "suelta" } }), ...lista];
    const deTodas = agruparGaleria(apilarVersiones(filtrarArchivos(conVersion, { carpetas }), carpetas), carpetas, conVersion);
    expect(deTodas.map((x) => x.id)).toEqual(["nueva", "grupo-car", "gusta"]);
    expect(contarVistas(conVersion, carpetas, deTodas)).toMatchObject({ todas: 3, grupos: 1, favoritas: 1, marca: 1, competencia: 1, mia: 1 });
  });
  it("las carpetas de la aplicación: «auto», y las de antes por su nombre", () => {
    expect(esCarpetaAutomatica({ nombre: "Cualquiera", tipo: "auto" })).toBe(true);
    expect(esCarpetaAutomatica({ nombre: "Lote Sofá · 12 nov", tipo: "" })).toBe(true);
    expect(esCarpetaAutomatica({ nombre: "Variaciones · Sofá", tipo: "" })).toBe(true);
    expect(esCarpetaAutomatica({ nombre: "Competencia", tipo: "" })).toBe(true);
    expect(esCarpetaCompetencia({ nombre: "competencia" })).toBe(true);
    expect(esCarpetaAutomatica({ nombre: "Lotería de navidad", tipo: "" })).toBe(false);
    expect(esCarpetaAutomatica({ nombre: "Carrusel · Sofá", tipo: "carrusel" })).toBe(false);
  });
});

describe("seleccionar lo que se VE", () => {
  it("una tarjeta de carrusel son TODAS las piezas de su carpeta; una pila de versiones, sólo la que se ve", () => {
    const todos = [A("l1", { carpetaId: "car" }), A("l2", { carpetaId: "car" }), A("cruda", { carpetaId: "car" }), A("vista"), A("vieja")];
    expect(idsDeLaSeleccion(new Set(["grupo-car", "vista"]), todos)).toEqual(["l1", "l2", "cruda", "vista"]);
    expect(idsDeLaSeleccion(null, todos)).toEqual([]);
  });
});

describe("la tarjeta y las páginas", () => {
  it("como mucho tres marcas, sin pisarse", () => {
    const x = A("x", { tipo: "video", anteriores: [A("v1")], usadoEn: [{ postId: "p" }], ajustes: { control: { estado: "ok" } } });
    expect(insigniasDe(x, { enPedido: true }).map((i) => i.clave)).toEqual(["pedido", "video", "versiones"]);
    expect(insigniasDe(A("y", { ajustes: { control: { estado: "revisar" } } })).map((i) => i.texto)).toEqual(["Revisar"]);
  });
  it("una página se suma sin repetir y deja el cursor de la siguiente", () => {
    const d = { archivos: [A("a"), A("b")], siguiente: "2026-11-01T00:00:00.000Z", kit: {} };
    const r = conPagina(d, { archivos: [A("b"), A("c")], siguiente: null });
    expect(r.archivos.map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(r.siguiente).toBeNull();
    expect(r.kit).toBe(d.kit);
  });
  it("por semanas: la fecha de una tarjeta es la de su pieza más nueva", () => {
    const ahora = Date.parse("2026-11-12T15:00:00.000Z");
    const pila = { ...A("vieja", { creado: "2026-10-20T15:00:00.000Z" }), anteriores: [A("nueva", { creado: "2026-11-11T15:00:00.000Z" })] };
    expect(fechaDeTarjeta(pila)).toBe("2026-11-11T15:00:00.000Z");
    const semanas = porSemanas([pila, A("b", { creado: "2026-11-04T15:00:00.000Z" }), A("c", { creado: "2026-10-01T15:00:00.000Z" })], fechaDeTarjeta, ahora);
    expect(semanas.map((s) => [s.titulo, s.items.length])).toEqual([["Esta semana", 1], ["La semana pasada", 1], ["Semana del 28 sep", 1]]);
    expect(tituloDeSemana("2025-12-29", ahora)).toBe("Semana del 29 dic 2025");
  });
});
