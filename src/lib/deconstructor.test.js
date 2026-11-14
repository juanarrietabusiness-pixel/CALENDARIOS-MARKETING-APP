import { describe, it, expect } from "vitest";
import {
  pedidoDeDeconstruccion, leerDeconstruccion, sinPalabrasDeValor, ritmoDeCortes, cuentaDeTomas, textoDeDeconstruccion,
  resumenDeSecuencia, fraseDeLaCuenta, cabeceraDeToma, MAX_RESUMEN, MAX_TOMAS_RESUMEN,
} from "./deconstructor.js";

const RESPUESTA = {
  ficha: { duracion: 12, proporcion: "9:16", origen: "teléfono [inferencia: ruido en las sombras porque…]", produccion: "Teléfono", produccionPorque: "estabilización electrónica visible", postproduccion: "texto encima" },
  recurrentes: { sujetos: "Una mujer de unos 30 años con camisa azul", lugares: "Una cocina", color: "cálido", luz: "ventana a la izquierda", audio: "voz en cuadro y música pop" },
  tomas: [
    { desde: 4, hasta: 7, plano: "plano medio", angulo: "altura de ojos", movimiento: "fijo", contenido: "La mujer abre una caja elegante y sonríe.", dice: "Mira lo que llegó", texto: "", transicion: "corte directo" },
    { desde: 0, hasta: 4.2, plano: "primer plano", angulo: "altura de ojos", movimiento: "cámara en mano", contenido: "Un plano cinematográfico de la mujer que mira a cámara.", dice: "", texto: "¿Te pasa?", transicion: "corte directo" },
    { desde: 7, plano: "plano detalle", angulo: "cenital", movimiento: "fijo", contenido: "Las manos sacan el producto.", transicion: "jump cut" },
    { desde: 9, hasta: 12, plano: "primer plano", movimiento: "cámara en mano", contenido: "La mujer levanta el producto.", transicion: "" },
  ],
  montaje: { ritmo: "parejo", musica: "los cortes caen en los golpes de la música" },
  noSeSabe: ["La marca del producto no se lee"],
};

describe("el pedido del desglose", () => {
  it("pide describir toma por toma sin opinar, con las inferencias marcadas y la regla de la toma nueva", () => {
    const p = pedidoDeDeconstruccion({ nombre: "reel.mp4" });
    expect(p).toMatch(/TOMA POR TOMA/);
    expect(p).toMatch(/No diseñas, no propones/);
    expect(p).toMatch(/\[inferencia: … porque …\]/);
    expect(p).toMatch(/\[incierto\]/);
    expect(p).toMatch(/haría falta otro clip para producirla/);
    expect(p).toMatch(/NO es toma nueva/);
    expect(p).toMatch(/sonríe y levanta las cejas/);
    expect(p).toContain("primer plano");
    expect(p).toMatch(/"tomas":\[\{"desde":0,"hasta":2\.1/);
    // No pide prompts ni sugerencias: separa VER de ESCRIBIR.
    expect(p).not.toMatch(/escribe (el|un) prompt/i);
  });
});

describe("la lectura: lo cuenta el código", () => {
  it("ordena las tomas, completa la salida que falta y no deja que se solapen", () => {
    const d = leerDeconstruccion(`Aquí va:\n\`\`\`json\n${JSON.stringify(RESPUESTA)}\n\`\`\``);
    expect(d.tomas.map((t) => [t.n, t.desde, t.hasta])).toEqual([[1, 0, 4], [2, 4, 7], [3, 7, 9], [4, 9, 12]]);
    expect(d.tomas[2].dura).toBe(2);
    expect(d.cuenta).toMatchObject({ tomas: 4, duracion: 12, media: 3, masCorta: 2, masLarga: 4 });
    expect(d.cuenta.planos[0]).toEqual(["primer plano", 2]);
    expect(d.ficha.produccion).toBe("telefono");
    expect(d.noSeSabe).toEqual(["La marca del producto no se lee"]);
  });

  it("quita las palabras de valor que se le escapan a la IA y las cuenta", () => {
    const d = leerDeconstruccion(JSON.stringify(RESPUESTA));
    expect(d.tomas[1].contenido).toBe("La mujer abre una caja y sonríe.");
    expect(d.tomas[0].contenido).toBe("Un plano de la mujer que mira a cámara.");
    expect(d.limpiadas).toBe(2);
    expect(sinPalabrasDeValor("Luz suave y elegante.")).toEqual({ texto: "Luz suave.", n: 1 });
    expect(sinPalabrasDeValor("Un encuadre muy cinematográfico, con grano").texto).toBe("Un encuadre, con grano");
    // Lo que no es una palabra de valor se queda (y no se confunde con trozos de otras palabras).
    expect(sinPalabrasDeValor("La estética del video: elegantísimo no, bellota sí").texto).toBe("La estética del video: elegantísimo no, bellota sí");
  });

  it("sin JSON o sin ninguna toma, null", () => {
    expect(leerDeconstruccion("no sé")).toBeNull();
    expect(leerDeconstruccion(JSON.stringify({ ficha: {}, tomas: [] }))).toBeNull();
    expect(leerDeconstruccion(JSON.stringify({ tomas: [{ hasta: 3 }] }))).toBeNull();
  });

  it("el ritmo del corte: acelera, frena o parejo (con menos de 4 tomas no se dice)", () => {
    const tomas = (duras) => { let t = 0; return duras.map((d) => ({ desde: t, hasta: (t += d) })); };
    expect(ritmoDeCortes(tomas([3, 3, 1, 1]))).toBe("acelera");
    expect(ritmoDeCortes(tomas([1, 1, 3, 3]))).toBe("frena");
    expect(ritmoDeCortes(tomas([2, 2, 2, 2]))).toBe("parejo");
    expect(ritmoDeCortes(tomas([2, 2]))).toBe("");
    expect(cuentaDeTomas([], 10)).toMatchObject({ tomas: 0, duracion: 10, media: 0 });
  });
});

describe("para leerlo y para el guion", () => {
  it("la cuenta en una frase y cada toma en una línea", () => {
    const d = leerDeconstruccion(JSON.stringify(RESPUESTA));
    expect(fraseDeLaCuenta(d)).toBe("4 tomas en 12 s: una cada 3 s de media; el corte va parejo.");
    expect(cabeceraDeToma(d.tomas[0])).toBe("1 · 0–4 s · primer plano · altura de ojos · cámara en mano → corte directo");
  });

  it("el texto entero lleva la ficha, lo que se repite, el mapa con lo que se dice y lo que no se sabe", () => {
    const d = leerDeconstruccion(JSON.stringify(RESPUESTA));
    const t = textoDeDeconstruccion(d, { nombre: "reel.mp4" });
    expect(t).toMatch(/^# Desglose toma por toma · reel\.mp4/);
    expect(t).toContain("## Mapa de secuencia");
    expect(t).toContain("Dice: «Mira lo que llegó»");
    expect(t).toContain("En pantalla: «¿Te pasa?»");
    expect(t).toContain("Producción: Grabado con un teléfono (estabilización electrónica visible).");
    expect(t).toContain("- La marca del producto no se lee");
    expect(textoDeDeconstruccion({ porFotogramas: true, ...d })).toMatch(/por fotogramas, sin el audio/);
    expect(textoDeDeconstruccion(null)).toBe("");
  });

  it("el resumen para el guion: la forma (planos, cámara, orden), nunca lo que dice ni lo que se lee", () => {
    const d = leerDeconstruccion(JSON.stringify(RESPUESTA));
    const r = resumenDeSecuencia(d, { cuantos: 3 });
    expect(r).toMatch(/^LA FORMA DE UN VIDEO DE REFERENCIA/);
    expect(r).toMatch(/nunca su marca, sus personas, su texto ni lo que dice/);
    expect(r).toContain("· 4 tomas en 12 s");
    expect(r).toContain("Planos: primer plano (2), plano medio, plano detalle.");
    expect(r).toContain("  1. 0–4 s · primer plano, cámara en mano: Un plano de la mujer que mira a cámara.");
    expect(r).toContain("Lo nuevo tiene 3 planos: junta las tomas seguidas");
    expect(r).not.toContain("Mira lo que llegó");
    expect(r).not.toContain("¿Te pasa?");
    // Con tantos o más planos que tomas, no se pide juntar.
    expect(resumenDeSecuencia(d, { cuantos: 4, unidad: "escenas" })).not.toContain("junta las tomas");
    expect(resumenDeSecuencia(null)).toBe("");
  });

  it("un video de muchas tomas: se cuentan las primeras y el resto en una línea, y cabe", () => {
    const tomas = Array.from({ length: 40 }, (_, i) => ({ desde: i, hasta: i + 1, plano: "primer plano", movimiento: "fijo", contenido: `Toma número ${i + 1}, una descripción bastante larga de lo que se ve en el cuadro para llenar el espacio disponible.` }));
    const d = leerDeconstruccion(JSON.stringify({ tomas }));
    const r = resumenDeSecuencia(d);
    expect(r.length).toBeLessThanOrEqual(MAX_RESUMEN);
    expect(r).toMatch(/… y \d+ tomas más con el mismo patrón\./);
    expect(r.split("\n").filter((l) => /^ {2}\d+\. /.test(l)).length).toBeLessThanOrEqual(MAX_TOMAS_RESUMEN);
  });
});
