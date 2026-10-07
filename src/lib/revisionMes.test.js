import { describe, it, expect } from "vitest";
import {
  cantidadesDe, cantidadesDelCatalogo, corregirVoseo, problemasDeTexto, aplicarArregloTexto, faltaParaEnviar, revisarMes,
  resumenRevision, pedidoDeRevisionIA, leerRevisionIA,
} from "./revisionMes";

const CATALOGO = [{ nombre: "Lavado", precio: "Desde $45", oferta: "10 % menos" }, { nombre: "Alfombra", precio: "B/. 25.00 el m²" }];

describe("los precios", () => {
  it("se leen en sus formas de Panamá y se comparan con el catálogo", () => {
    expect(cantidadesDe("Ahora $45, antes $1,200.50 · 25 dólares · B/. 25 · 10% menos")).toEqual(["45", "1200.5", "25", "10%"]);
    const precios = cantidadesDelCatalogo(CATALOGO);
    expect([...precios].sort()).toEqual(["10%", "25", "45"]);
    const p = problemasDeTexto({ descripcion: "Lavado por $40 con 10% menos. Escríbenos" }, { precios });
    expect(p.map((x) => x.codigo)).toEqual(["precio"]);
    expect(p[0].texto).toContain("$40");
    expect(problemasDeTexto({ descripcion: "Lavado desde $45. Escríbenos" }, { precios })).toEqual([]);
    // Sin catálogo no se puede saber qué precio es bueno: no se dice nada.
    expect(problemasDeTexto({ descripcion: "Por $40. Escríbenos" }, {})).toEqual([]);
  });
});

describe("el voseo", () => {
  it("se encuentra y se corrige respetando la mayúscula, sin tocar otras palabras", () => {
    expect(corregirVoseo("Vení hoy, ¿tenés dudas? Escribinos. Sosa no cambia.")).toBe("Ven hoy, ¿tienes dudas? Escríbenos. Sosa no cambia.");
    const p = { descripcion: "Vení y probá. Agendá tu cita", guion: "Tenés que verlo" };
    const [v] = problemasDeTexto(p);
    expect(v).toMatchObject({ codigo: "voseo", arreglo: "Pasar a tú" });
    expect(aplicarArregloTexto(p, "voseo")).toMatchObject({ descripcion: "Ven y prueba. Agenda tu cita", guion: "Tienes que verlo" });
  });
});

describe("lo demás de los textos", () => {
  it("competencia, fecha delicada con promo, sin llamado a la acción y demasiados hashtags", () => {
    const p = { descripcion: `Mejor que LimpiaYa: 2x1 hoy ${Array.from({ length: 31 }, (_, i) => `#h${i}`).join(" ")}` };
    const codigos = problemasDeTexto(p, { competidores: ["LimpiaYa", "AB"], delicada: "Día de los Difuntos" }).map((x) => x.codigo);
    expect(codigos).toEqual(["competencia", "delicada", "cta", "hashtags"]);
    // Una historia no necesita llamado a la acción en el texto.
    expect(problemasDeTexto({ format: "historia", descripcion: "Buenos días" }).map((x) => x.codigo)).toEqual([]);
  });
});

describe("lo que falta para enviar", () => {
  it("sin contenido: texto, guion (o láminas) y referencia; con contenido o publicada, nada", () => {
    expect(faltaParaEnviar({ format: "reel", descripcion: "" })).toEqual(["la idea en el texto", "el guion", "una referencia"]);
    expect(faltaParaEnviar({ format: "carrusel", descripcion: "x", referenceLink: "https://x" })).toEqual(["el texto de cada lámina"]);
    expect(faltaParaEnviar({ format: "post", descripcion: "x", referenceLink: "https://x" })).toEqual([]);
    expect(faltaParaEnviar({ format: "reel", image: "/api/media/clientes/c/a.jpg" })).toEqual([]);
    expect(faltaParaEnviar({ format: "reel", status: "published" })).toEqual([]);
  });

  it("el mes en orden y su resumen", () => {
    const days = [
      { date: "2026-11-03", posts: [{ id: "b", format: "post", descripcion: "Vení. Escribinos", image: "/api/media/x" }] },
      { date: "2026-11-02", posts: [{ id: "a", format: "reel", descripcion: "Idea. Agenda" }, { id: "c", format: "post", descripcion: "Bien. Escríbenos", image: "/api/media/y" }] },
    ];
    const r = revisarMes(days, {});
    expect(r.map((x) => x.post.id)).toEqual(["a", "b"]);
    expect(resumenRevision(r)).toBe("1 publicación sin contenido a la que le falta algo · 1 aviso en los textos");
    expect(resumenRevision([])).toBe("");
  });
});

describe("la revisión con IA", () => {
  it("el pedido lleva cada publicación con su id, y la respuesta descarta ids que no se mandaron", () => {
    const t = pedidoDeRevisionIA({ marca: "Dcasa", publicaciones: [{ id: "p1", date: "2026-11-02", format: "reel", descripcion: "Hola", guion: "G" }] });
    expect(t).toContain("<<<p1>>> 2026-11-02 · reel");
    expect(t).toContain("GUION: G");
    expect(leerRevisionIA('```json\n{"problemas":[{"id":"p1","texto":"Falta tilde en «estás»"},{"id":"zz","texto":"x"}]}\n```', ["p1"])).toEqual({ p1: ["Falta tilde en «estás»"] });
    expect(leerRevisionIA("nada", ["p1"])).toBeNull();
  });
});
