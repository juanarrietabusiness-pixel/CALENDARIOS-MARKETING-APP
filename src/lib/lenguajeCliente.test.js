import { describe, it, expect } from "vitest";
import {
  plegar, fraseEnTexto, quitarMarcas, marcasDeTexto, partirComentarios, frasesDeNota, fragmentosDeLenguaje, cuentaDeFuentes,
  pedidoDeLenguaje, leerLenguaje, notaDeLenguaje, describirLenguaje, lenguajeParaPedido,
  RUTA_LENGUAJE, TITULO_LENGUAJE, MAX_LENGUAJE, MAX_FRASES_TEMA,
} from "./lenguajeCliente";

// ============================================================
// El lenguaje del cliente: lo que hace el CÓDIGO y no la IA —comprobar que cada frase esté de verdad en el material,
// devolver el trozo ORIGINAL, contar y ocultar las marcas de la competencia— y la nota que sale.
// ============================================================

describe("comparar sin mayúsculas, tildes, comillas ni espacios de más", () => {
  it("pliega y encuentra la frase devolviendo el trozo original tal cual se escribió", () => {
    expect(plegar("  Más   RÁPIDO «sí» ")).toBe("mas rapido si");
    expect(fraseEnTexto("tardaron tres semanas en llegar", "Pedí el sofá y TARDARON  tres semanas en llegar!!! nunca más"))
      .toBe("TARDARON tres semanas en llegar");
    expect(fraseEnTexto("mas rapido de lo que pense.", "Llegó más rápido de lo que pensé")).toBe("más rápido de lo que pensé");
    expect(fraseEnTexto("“me salvó la mudanza”", "La verdad me salvó la mudanza")).toBe("me salvó la mudanza");
  });

  it("sólo palabras enteras, y lo que no está no se encuentra", () => {
    expect(fraseEnTexto("ardaron tres", "tardaron tres semanas")).toBeNull();
    expect(fraseEnTexto("llegó en dos días", "llegó en tres días")).toBeNull();
    expect(fraseEnTexto("", "algo")).toBeNull();
  });

  it("quita las marcas de la competencia (sin mayúsculas ni tildes, con su @) y respeta las palabras que sólo se parecen", () => {
    expect(quitarMarcas("En LimpiaYá me dejaron manchas y @limpiaya no contestó", ["Limpiaya"]))
      .toBe("En otra marca me dejaron manchas y otra marca no contestó");
    expect(quitarMarcas("LimpiaYaExpress es otra cosa", ["LimpiaYa"])).toBe("LimpiaYaExpress es otra cosa");
    expect(quitarMarcas("La marca X", ["X", "marca"])).toBe("La marca X");
    expect(marcasDeTexto("LimpiaYa, Dcasa; Brillo\nLimpiaYa", { propia: "Dcasa" })).toEqual(["LimpiaYa", "Brillo"]);
  });
});

describe("el material", () => {
  it("parte lo pegado por líneas, numera por fuente en orden y con tope, y deja fuera los comentarios de una palabra", () => {
    expect(partirComentarios("Muy bueno\n\nok\nMe encantó\r\nx")).toEqual(["Muy bueno", "Me encantó"]);
    const f = fragmentosDeLenguaje({
      pegado: "Me salvó la mudanza\nTardaron mucho",
      competencia: "En la otra tienda nunca contestaron",
      nota: "## Cómo cuentan su problema · lo dicen 3 comentarios\n- «el sofá olía a perro» (3)",
      encuesta: [{ texto: "El precio me frenaba al principio", etiqueta: "¿Hubo algo que casi te hace no comprar?" }],
      bandeja: ["❤️", "Info", "¿Cuánto cuesta el de tres puestos?"],
    });
    expect(f.map((x) => [x.n, x.fuente])).toEqual([[1, "pegado"], [2, "pegado"], [3, "competencia"], [4, "nota"], [5, "encuesta"], [6, "bandeja"]]);
    expect(f.find((x) => x.fuente === "nota")).toMatchObject({ texto: "el sofá olía a perro", peso: 3 });
    expect(cuentaDeFuentes(f)).toEqual({ pegado: 2, competencia: 1, nota: 1, encuesta: 1, bandeja: 1 });
    // Con tope por fuente: lo pegado no se come todo.
    const mucho = fragmentosDeLenguaje({ pegado: Array.from({ length: 400 }, (_, i) => `comentario número ${i} con bastante texto alrededor para llenar`).join("\n"), bandeja: ["esto es un comentario de la bandeja"] });
    expect(mucho.reduce((s, x) => s + (x.fuente === "pegado" ? x.texto.length : 0), 0)).toBeLessThanOrEqual(15_000);
    expect(mucho.at(-1).fuente).toBe("bandeja");
  });

  it("el pedido numera cada comentario y marca la competencia", () => {
    const p = pedidoDeLenguaje({ marca: "Dcasa", fragmentos: fragmentosDeLenguaje({ pegado: "Me salvó la mudanza", competencia: "Nunca contestaron el WhatsApp" }) });
    expect(p).toContain("[1] Me salvó la mudanza");
    expect(p).toContain("[2 · COMPETENCIA] Nunca contestaron el WhatsApp");
    expect(p).toContain("COPIADA LETRA POR LETRA");
    expect(p).toMatch(/"temas":\{"dolor":\["…"\],"duda"/);
  });
});

describe("leer lo que propone la IA", () => {
  const fragmentos = fragmentosDeLenguaje({
    pegado: "Llegaron puntuales y el sofá quedó como nuevo\nEl sofá quedó como nuevo, increíble\nMe daba miedo que dañaran la tela",
    competencia: "En LimpiaYa me dejaron el sofá peor que antes",
    nota: "- «el olor a mascota desapareció» (4)",
    bandeja: ["¿Cuánto cuesta lavar un sofá de tres puestos?", "el olor a mascota desapareció de verdad"],
  });
  const respuesta = JSON.stringify({
    temas: {
      dolor: ["me dejaron el sofá peor que antes", "No sabía qué hacer con las manchas"],
      duda: ["Me daba miedo que dañaran la tela", "¿Cuánto cuesta lavar un sofá de tres puestos?"],
      deseo: [],
      elogio: ["el sofá quedó como nuevo", "EL SOFÁ QUEDÓ COMO NUEVO", "el olor a mascota desapareció", "bueno"],
      competencia: ["me dejaron el sofá peor que antes"],
    },
    patrones: ["Muchos comparan con LimpiaYa: sugiere un antes y después"],
  });

  it("descarta lo que no está tal cual, devuelve el trozo original y no repite una frase", () => {
    const r = leerLenguaje(respuesta, { fragmentos, marcas: ["LimpiaYa"] });
    expect(r.descartadas).toBe(1); // «No sabía qué hacer con las manchas» no está en ningún comentario
    const todas = r.temas.flatMap((t) => t.frases.map((f) => f.texto));
    expect(todas).not.toContain("No sabía qué hacer con las manchas");
    expect(todas).not.toContain("bueno"); // demasiado corta: ni cuenta
    expect(todas.filter((t) => plegar(t) === "el sofa quedo como nuevo")).toHaveLength(1);
    expect(r.frases).toBe(todas.length);
  });

  it("cuenta cuántos comentarios la dicen (la de la nota de ahora, sin sumarla dos veces) y ordena los temas por eso", () => {
    const r = leerLenguaje(respuesta, { fragmentos, marcas: ["LimpiaYa"] });
    const elogio = r.temas.find((t) => t.id === "elogio");
    expect(elogio.frases.find((f) => plegar(f.texto) === "el sofa quedo como nuevo").veces).toBe(2);
    // Está en la nota con 4 y en un comentario de la Bandeja: cuenta 4, no 5.
    expect(elogio.frases.find((f) => plegar(f.texto) === "el olor a mascota desaparecio").veces).toBe(4);
    expect(r.temas[0].id).toBe("elogio");
  });

  it("lo que sólo dicen clientes de la competencia va como su dolor, nunca como elogio, y sin la marca", () => {
    const r = leerLenguaje(JSON.stringify({ temas: { elogio: ["me dejaron el sofá peor que antes"] }, patrones: [] }), { fragmentos, marcas: ["LimpiaYa"] });
    expect(r.temas.map((t) => t.id)).toEqual(["competencia"]);
    const p = leerLenguaje(respuesta, { fragmentos, marcas: ["LimpiaYa"] }).patrones;
    expect(p[0]).toBe("Muchos comparan con otra marca: sugiere un antes y después");
    expect(leerLenguaje("no hay JSON", { fragmentos })).toBeNull();
  });

  it("no pasa del tope de frases por tema", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => `frase número ${i} de prueba`);
    const r = leerLenguaje(JSON.stringify({ temas: { dolor: muchas } }), { fragmentos: fragmentosDeLenguaje({ pegado: muchas.join("\n") }) });
    expect(r.temas[0].frases).toHaveLength(MAX_FRASES_TEMA);
  });
});

describe("la nota del cerebro", () => {
  const resultado = {
    temas: [
      { id: "elogio", nombre: "Lo que celebran", frases: [{ texto: "el sofá quedó como nuevo", veces: 2 }], veces: 2 },
      { id: "duda", nombre: "Sus dudas y objeciones", frases: [{ texto: "Me daba miedo que dañaran la tela", veces: 1 }], veces: 1 },
    ],
    patrones: ["Comparan con lo de antes: un antes y después"],
  };

  it("sale en Markdown legible, con la cuenta y «Para escribir», y su ruta es la del título", () => {
    const n = notaDeLenguaje(resultado, { marca: "Dcasa", fecha: new Date(2026, 10, 14) });
    expect(n).toMatch(/^# Lenguaje del cliente\n/);
    expect(n).toContain("Actualizada el 14 de noviembre de 2026.");
    expect(n).toContain("## Lo que celebran · lo dicen 2 comentarios\n- «el sofá quedó como nuevo» (2)");
    expect(n).toContain("## Sus dudas y objeciones · lo dice 1 comentario");
    expect(n).toContain("## Para escribir");
    expect(n).toContain("- Comparan con lo de antes: un antes y después");
    expect(n).toMatch(/no se afirma algo personal de quien lee/);
    expect(plegar(TITULO_LENGUAJE).replace(/ /g, "-")).toBe(RUTA_LENGUAJE);
    // Lo que se vuelve a leer al proponerla otra vez: las frases con su cuenta.
    expect(frasesDeNota(n)).toEqual([{ texto: "el sofá quedó como nuevo", peso: 2 }, { texto: "Me daba miedo que dañaran la tela", peso: 1 }]);
    // Lo que leen el estudio y los ángulos: sin «Para escribir».
    expect(lenguajeParaPedido(n)).not.toContain("Para escribir");
    expect(lenguajeParaPedido(n)).toContain("«el sofá quedó como nuevo» (2)");
  });

  it("cabe en lo que lee el motor de ideas: primero se van los patrones y luego las frases que menos se repiten", () => {
    const largas = Array.from({ length: 6 }, (_, i) => ({ texto: `${"una frase larga de un cliente que cuenta su problema ".repeat(3)}${i}`, veces: 6 - i }));
    const grande = {
      temas: ["dolor", "duda", "deseo", "elogio", "competencia"].map((id) => ({ id, nombre: id, frases: largas, veces: 9 })),
      patrones: ["patrón ".repeat(30)],
    };
    const n = notaDeLenguaje(grande, { marca: "Dcasa" });
    expect(n.length).toBeLessThanOrEqual(MAX_LENGUAJE);
    expect(n).toContain("## Para escribir");
    expect(n).not.toContain("patrón patrón");
    expect(n).toContain("0» (6)"); // la más repetida se queda
  });

  it("lo que se le dice a la persona: qué leyó y cuántas descartó", () => {
    const t = describirLenguaje({ fuentes: { bandeja: 12, encuesta: 9, personas: 3, pegado: 1, competencia: 0, nota: 1 }, frases: 8, descartadas: 2 });
    expect(t).toContain("La IA leyó 12 comentarios de la Bandeja, 3 respuestas de la encuesta y 1 línea que pegaste (y las frases de la nota de ahora).");
    expect(t).toContain("Quedaron 8 frases; se descartaron 2 porque no estaban tal cual en los comentarios.");
    expect(describirLenguaje({ fuentes: { pegado: 4 }, frases: 1, descartadas: 0 })).toContain("Quedaron 1 frase.");
  });
});
