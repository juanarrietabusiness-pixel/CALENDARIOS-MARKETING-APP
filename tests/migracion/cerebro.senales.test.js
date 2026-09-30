import { describe, it, expect } from "vitest";
import {
  TIPOS_SENAL, PESO_SENAL, resultadoDeRespuesta, atenuar, claveDeSenal, fuenteDeRespuesta, resumenDePublicacion,
  notaDeRespuesta, senalDeRespuesta, mismoTitulo,
} from "../../worker/lib/cerebro/senales.js";

// ============================================================
// Las señales: lo que pasa DESPUÉS de escribir (puro)
// ============================================================

const pub = { titulo: "Reel de sofás", formato: "reel", categoria: "Producto", idea: "Mostrar el sofá seccional armado", fecha: "2026-10-12" };

describe("qué resultado tiene una respuesta", () => {
  it("aprobar es salir bien; pedir cambios, no ser lo que quería sin llegar a un rechazo del todo", () => {
    expect(resultadoDeRespuesta("aprobado")).toBe(1);
    expect(resultadoDeRespuesta("cambios")).toBe(0.2);
    expect(resultadoDeRespuesta("otra cosa")).toBe(0.2);
  });

  it("cada clase de señal se acerca al neutro según lo que pesa: la respuesta del cliente es lo más claro", () => {
    expect(PESO_SENAL.respuesta).toBe(1);
    expect(atenuar(1, "respuesta")).toBe(1);
    expect(atenuar(1, "metricas")).toBeCloseTo(0.8, 9);
    expect(atenuar(0, "correccion")).toBeCloseTo(0.2, 9);
    expect(atenuar(0.5, "metricas")).toBe(0.5);
  });

  it("un resultado que no es un número, o se sale de 0–1, no rompe nada", () => {
    expect(atenuar(NaN, "respuesta")).toBe(0.5);
    expect(atenuar(7, "respuesta")).toBe(1);
    expect(atenuar(-3, "respuesta")).toBe(0);
    expect(atenuar(0.9, "inventada")).toBeCloseTo(0.9, 9);
  });

  it("las clases de señal son las que el resto del código espera", () => {
    expect(TIPOS_SENAL).toEqual(["respuesta", "metricas", "correccion"]);
    for (const t of TIPOS_SENAL) expect(PESO_SENAL[t]).toBeGreaterThan(0);
  });
});

describe("las claves", () => {
  it("una señal por publicación y clase: cambiar de opinión la reemplaza", () => {
    expect(claveDeSenal("respuesta", "p1")).toBe("respuesta:p1");
    expect(claveDeSenal("metricas", "p1")).not.toBe(claveDeSenal("respuesta", "p1"));
    expect(fuenteDeRespuesta("p1")).toBe("respuesta:p1");
  });
});

describe("de qué publicación se habla", () => {
  it("el título, si lo hay; si no, la primera frase de la idea", () => {
    expect(resumenDePublicacion({ title: "Sofás en oferta", idea: "otra cosa" }).titulo).toBe("Sofás en oferta");
    expect(resumenDePublicacion({ idea: "Mostrar el sofá armado. Con música." }).titulo).toBe("Mostrar el sofá armado");
    expect(resumenDePublicacion({}).titulo).toBe("una publicación");
    expect(resumenDePublicacion(null).titulo).toBe("una publicación");
  });

  it("lleva formato, categoría y fecha; la categoría, la del día si la publicación no la trae", () => {
    const r = resumenDePublicacion({ title: "T", format: "reel", category: "" }, { category: "Producto", date: "2026-10-12" });
    expect(r).toMatchObject({ formato: "reel", categoria: "Producto", fecha: "2026-10-12" });
  });

  it("un título kilométrico se recorta", () => {
    expect(resumenDePublicacion({ title: "x".repeat(500) }).titulo.length).toBeLessThanOrEqual(80);
  });
});

describe("la nota con las palabras del cliente", () => {
  it("sin palabras no hay nota: una aprobación a secas no le enseña nada a nadie", () => {
    expect(notaDeRespuesta({ publicacion: pub, estado: "aprobado" })).toBeNull();
    expect(notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "   " })).toBeNull();
    expect(notaDeRespuesta({})).toBeNull();
  });

  it("pidió cambios: dice qué publicación, qué dijo el cliente y con su nombre", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "No me gustan los emojis, es muy informal.", revisor: "Ana" });
    expect(n.titulo).toBe("Pidió cambios: Reel de sofás");
    expect(n.texto).toContain("# Ana pidió cambios en «Reel de sofás»");
    expect(n.texto).toContain("Publicación: reel · Producto · 2026-10-12.");
    expect(n.texto).toContain("Lo que escribió: «No me gustan los emojis, es muy informal.»");
    expect(n.resumen).toMatch(/emojis/);
  });

  it("sin nombre, «el cliente»", () => {
    expect(notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "más corto" }).texto).toContain("# El cliente pidió cambios");
  });

  it("aprobó con un comentario: se guarda también, es una preferencia", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "aprobado", comentario: "Me encanta que salga el precio." });
    expect(n.titulo).toBe("Aprobó con un comentario: Reel de sofás");
    expect(n.texto).toContain("# El cliente aprobó «Reel de sofás»");
  });

  it("lo que propuso cambiar en el texto y en el guion entra tal cual", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "cambios", sugeridaDescripcion: "Sofás desde $450, envío gratis.", sugeridoGuion: "Hook: el precio primero." });
    expect(n.texto).toContain("Cambio que propuso en la descripción: «Sofás desde $450, envío gratis.»");
    expect(n.texto).toContain("Cambio que propuso en el guion: «Hook: el precio primero.»");
  });

  it("lo que añadió en la conversación va aparte, sin repetir lo que ya dijo al responder, y sólo lo más reciente", () => {
    const n = notaDeRespuesta({
      publicacion: pub, estado: "cambios", comentario: "más corto",
      comentarios: ["más corto", "1", "2", "3", "4", "5", "6"],
    });
    expect(n.texto.match(/- «/g)).toHaveLength(4);
    expect(n.texto).not.toContain("- «más corto»");
    expect(n.texto).toContain("- «6»");
    expect(n.texto).not.toContain("- «1»");
  });

  it("sólo comentó, sin responder: nota de un comentario", () => {
    const n = notaDeRespuesta({ publicacion: pub, comentarios: ["¿Y el precio?"] });
    expect(n.titulo).toBe("Comentó: Reel de sofás");
    expect(n.texto).toContain("«¿Y el precio?»");
  });

  it("nada se pasa de largo: una pared de texto se recorta", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "palabra ".repeat(1000) });
    expect(n.texto.length).toBeLessThan(2000);
    expect(n.titulo.length).toBeLessThanOrEqual(140);
  });

  it("los espacios y saltos de línea del comentario se aplanan: una nota no se rompe por lo que escribió el cliente", () => {
    const n = notaDeRespuesta({ publicacion: pub, estado: "cambios", comentario: "línea uno\n\n\n# Un encabezado falso\n\nlínea dos" });
    expect(n.texto).toContain("«línea uno # Un encabezado falso línea dos»");
    expect(n.texto.split("\n").filter((l) => l.startsWith("# "))).toHaveLength(1);
  });
});

describe("la señal de una respuesta", () => {
  it("lleva su clave, su resultado y una línea legible con lo que dijo", () => {
    const s = senalDeRespuesta({ postId: "p1", publicacion: pub, estado: "cambios", comentario: "No me gustan los emojis", revisor: "Ana", fecha: "2026-10-12" });
    expect(s).toMatchObject({ clave: "respuesta:p1", tipo: "respuesta", postId: "p1", resultado: 0.2 });
    expect(s.resumen).toBe("Pidió cambios en «Reel de sofás»: No me gustan los emojis");
    expect(s.detalle).toMatchObject({ estado: "cambios", revisor: "Ana", fecha: "2026-10-12", publicacion: pub });
  });

  it("aprobar sin nada que decir: el resumen no lleva dos puntos colgando", () => {
    const s = senalDeRespuesta({ postId: "p1", publicacion: pub, estado: "aprobado" });
    expect(s.resumen).toBe("Aprobó «Reel de sofás»");
    expect(s.resultado).toBe(1);
  });
});

describe("¿la misma regla?", () => {
  it("sin tildes, mayúsculas ni puntuación", () => {
    expect(mismoTitulo("No usar emojis", "no usar  EMOJIS.")).toBe(true);
    expect(mismoTitulo("Precio en dólares", "Precio en pesos")).toBe(false);
    expect(mismoTitulo("Garantía", "garantia")).toBe(true);
  });
});
