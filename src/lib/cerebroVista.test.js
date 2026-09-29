import { describe, it, expect } from "vitest";
import {
  TIPOS_VISTA, FILTROS_TIPO, nombreDeTipo, ordenarNotas, filtrarNotas, contarPorTipo, formatoCaracteres,
  describirImportacion, describirFicha, tituloDeDocumento, validarDocumento, leerDocumento,
} from "./cerebroVista";
import { TIPOS } from "../../worker/lib/cerebro/notas.js";
import { analizarRuta, construirRuta, PESTANAS_CLIENTE, slugsDeCalendarios } from "./rutas";

// ============================================================
// La pestaña Cerebro: lo que decide qué se ve
// ============================================================

const nota = (titulo, tipo = "nota", extra = {}) => ({ id: titulo, titulo, tipo, resumen: "", interna: false, ...extra });

describe("los tipos", () => {
  it("todo tipo que el servidor conoce tiene nombre y ayuda; y no sobra ninguno", () => {
    // Si el Worker estrena un tipo y la pantalla no lo sabe, saldría como «Nota» sin explicar qué es.
    expect(Object.keys(TIPOS_VISTA).sort()).toEqual([...TIPOS].sort());
    for (const t of TIPOS) expect(TIPOS_VISTA[t].ayuda.length).toBeGreaterThan(10);
  });

  it("los filtros sólo ofrecen tipos que existen", () => {
    for (const f of FILTROS_TIPO) expect(f === "todas" || TIPOS.includes(f)).toBe(true);
  });

  it("un tipo desconocido se llama «Nota»", () => {
    expect(nombreDeTipo("inventado")).toBe("Nota");
    expect(nombreDeTipo("ficha")).toBe("Ficha técnica");
  });
});

describe("ordenar y filtrar", () => {
  const todas = [nota("Zeta", "nota"), nota("Borrador viejo", "borrador"), nota("Tono", "marca"), nota("Cifras", "cifras"), nota("Ficha", "ficha"), nota("Ánimo", "marca")];

  it("la ficha y las cifras primero, luego por tipo, y por título dentro de cada tipo", () => {
    expect(ordenarNotas(todas).map((n) => n.titulo)).toEqual(["Ficha", "Cifras", "Ánimo", "Tono", "Zeta", "Borrador viejo"]);
  });

  it("no modifica la lista que recibe", () => {
    const copia = [...todas];
    ordenarNotas(todas);
    expect(todas).toEqual(copia);
  });

  it("filtra por tipo", () => {
    expect(filtrarNotas(todas, { tipo: "marca" }).map((n) => n.titulo).sort()).toEqual(["Tono", "Ánimo"]);
    expect(filtrarNotas(todas, { tipo: "todas" })).toHaveLength(6);
  });

  it("filtra por «sólo internas»", () => {
    const con = [...todas, nota("Costos", "documento", { interna: true })];
    expect(filtrarNotas(con, { soloInternas: true }).map((n) => n.titulo)).toEqual(["Costos"]);
  });

  it("filtra por lo que se escribe, sin importar tildes ni mayúsculas, en título o resumen", () => {
    const lista = [nota("Garantía", "marca", { resumen: "Dos años" }), nota("Otra", "marca", { resumen: "El envío es gratis" })];
    expect(filtrarNotas(lista, { texto: "GARANTIA" }).map((n) => n.titulo)).toEqual(["Garantía"]);
    expect(filtrarNotas(lista, { texto: "envio" }).map((n) => n.titulo)).toEqual(["Otra"]);
    expect(filtrarNotas(lista, { texto: "  " })).toHaveLength(2);
  });

  it("cuenta por tipo, con el total", () => {
    expect(contarPorTipo(todas)).toEqual({ todas: 6, nota: 1, borrador: 1, marca: 2, cifras: 1, ficha: 1 });
  });
});

describe("formatoCaracteres", () => {
  it("cifras que se leen de un vistazo", () => {
    expect(formatoCaracteres(800)).toBe("800");
    expect(formatoCaracteres(3541)).toBe("3,5 mil");
    expect(formatoCaracteres(126_975)).toBe("127 mil");
    expect(formatoCaracteres(undefined)).toBe("0");
  });
});

describe("contar lo que hizo una importación", () => {
  it("dice qué se creó y de cuántos archivos", () => {
    const d = describirImportacion({ archivos: { nuevos: 2, cambiados: 0, actualizados: 0, iguales: 0, omitidos: 0, fallidos: 0 }, notas: { creadas: 39, reemplazadas: 0, conservadas: 0 }, internas: [], revisar: [] });
    expect(d.texto).toBe("39 notas creadas de 2 archivos.");
    expect(d.detalles).toEqual([]);
  });

  it("usa el singular cuando toca", () => {
    expect(describirImportacion({ archivos: { nuevos: 1 }, notas: { creadas: 1 } }).texto).toBe("1 nota creada de 1 archivo.");
  });

  it("avisa de lo que cambió en el repositorio y de lo que quedó para otra vuelta", () => {
    const d = describirImportacion({ archivos: { cambiados: 2, omitidos: 15, iguales: 8 }, notas: {} });
    expect(d.texto).toMatch(/8 archivos sin cambios/);
    expect(d.texto).toMatch(/2 archivos cambiaron en el repositorio \(usa «Actualizar lo que cambió»/);
    expect(d.texto).toMatch(/15 archivos quedaron para la siguiente vuelta/);
  });

  it("enseña las notas marcadas internas solas y las que hay que revisar", () => {
    const d = describirImportacion({ archivos: { nuevos: 1 }, notas: { creadas: 3 }, internas: ["Economía unitaria"], revisar: ["Precios"] });
    expect(d.detalles.map((x) => x.titulo)).toEqual([
      "Marcadas como internas (no salen en los textos que se publican)",
      "Mencionan algo interno: revisa si alguna debe marcarse",
    ]);
    expect(d.detalles[0].lista).toEqual(["Economía unitaria"]);
  });

  it("sin nada, lo dice", () => {
    expect(describirImportacion({ archivos: {}, notas: {} }).texto).toBe("No había nada nuevo que traer.");
    expect(describirImportacion(undefined).texto).toBe("No había nada nuevo que traer.");
  });

  it("lo corregido a mano que se conservó se cuenta, porque tranquiliza", () => {
    expect(describirImportacion({ archivos: { actualizados: 1 }, notas: { creadas: 1, reemplazadas: 1, conservadas: 2 } }).texto).toMatch(/2 corregidas a mano se conservaron/);
  });
});

describe("contar lo que hizo la IA", () => {
  it("la ficha y las cifras, y qué leyó", () => {
    expect(describirFicha({ ficha: "creada", cifras: "creada", leidas: 12, fuera: [] })).toBe("Ficha técnica escrita; cifras escritas (leyó 12 notas).");
  });
  it("lo corregido a mano se conserva y se dice", () => {
    expect(describirFicha({ ficha: "conservada", cifras: "reemplazada" })).toMatch(/tiene cambios tuyos: se conservó; cifras renovadas/);
  });
  it("incluye el aviso del servidor (p. ej. que la cuenta rechazó un modelo)", () => {
    expect(describirFicha({ ficha: "creada", cifras: "vacia", aviso: "Se usó Sonnet 5." })).toMatch(/Se usó Sonnet 5\./);
  });
});

describe("documentos que se sueltan", () => {
  it("el nombre del archivo pasa a título", () => {
    expect(tituloDeDocumento("precios-2026_v2.md")).toBe("Precios 2026 v2");
    expect(tituloDeDocumento("")).toBe("Documento");
  });

  it("aceptan .md, .txt, .csv y .json", () => {
    for (const n of ["a.md", "a.MARKDOWN", "a.txt", "a.csv", "a.json"]) expect(validarDocumento(n, 100).ok, n).toBe(true);
  });

  it("PDF, Word y Excel se rechazan con el motivo y una salida, no en silencio", () => {
    for (const n of ["a.pdf", "a.docx", "a.xlsx"]) {
      const v = validarDocumento(n, 100);
      expect(v.ok).toBe(false);
      expect(v.motivo).toMatch(/llegan más adelante/);
      expect(v.motivo).toMatch(/pega su texto/);
    }
  });

  it("lo demás y lo enorme, también", () => {
    expect(validarDocumento("a.exe", 10).motivo).toMatch(/sólo se leen/);
    expect(validarDocumento("a.md", 10_000_000).motivo).toMatch(/demasiado grande/);
  });

  const archivo = (nombre, texto) => ({ name: nombre, size: texto.length, text: async () => texto });

  it("un documento bueno pasa a nota de tipo documento, con su archivo de origen", async () => {
    const r = await leerDocumento(archivo("garantia.md", "# Garantía\r\n\r\nDos años."));
    expect(r.nota).toEqual({ titulo: "Garantia", texto: "# Garantía\n\nDos años.", tipo: "documento", origen: "documento", fuente: "garantia.md" });
  });

  it("vacío o pasado de largo, con el motivo", async () => {
    expect((await leerDocumento(archivo("a.md", "  \n"))).error).toMatch(/vacío/);
    expect((await leerDocumento(archivo("a.md", "x".repeat(200_001)))).error).toMatch(/pasa de/);
  });
});

describe("la dirección de la pestaña", () => {
  it("/cliente/<slug>/cerebro es la pestaña, no un calendario llamado «cerebro»", () => {
    expect(PESTANAS_CLIENTE).toContain("cerebro");
    expect(analizarRuta({ pathname: "/cliente/dcasa/cerebro" })).toMatchObject({ vista: "panel", cliente: "dcasa", pestana: "cerebro", calendario: null });
  });

  it("construir y analizar son inversos", () => {
    expect(construirRuta({ vista: "panel", cliente: "dcasa", pestana: "cerebro" })).toBe("/cliente/dcasa/cerebro");
  });

  it("un calendario llamado «Cerebro» no se queda con la dirección de la pestaña", () => {
    const slugs = slugsDeCalendarios([{ id: "1", name: "Cerebro" }]);
    expect(slugs.get("1")).not.toBe("cerebro");
  });
});
