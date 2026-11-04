import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validarGuion, lineaDeTiempo, palabrasDe, textoDeLocucion } from "./videoEscenas.js";
import {
  MODELOS_VOZ, modeloDeVoz, VOCES_DE_SERIE, limpiarLocucion, vocesDisponibles, vozPorId, textoParaVoz, costoDeVoz,
  fraseDeMuestra, problemaDelTexto, palabrasDelResultado, alinearPalabras, palabrasEstimadas, duracionMp3,
  tiemposDeLocucion, leerTranscripcionConTiempos, normalizarPalabra, MAX_VOCES_PROPIAS,
} from "./voces.js";

// ============================================================
// La voz del video animado, sin gastar: el costo, el texto que se manda, las voces, y los tiempos de cada palabra
// en sus tres capas (lo que traiga Kie, la verificación posterior y la estimación sobre la duración real).
// ============================================================

const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return validarGuion(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1])).guion;
};

/** Un MP3 CBR de 128 kb/s y 44,1 kHz de `bytes` bytes (cabecera de un cuadro y ceros). */
function mp3(bytes, { id3 = 0, xing = 0 } = {}) {
  const b = new Uint8Array(bytes + id3);
  if (id3) { b.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, id3 - 10]); }
  b.set([0xff, 0xfb, 0x90, 0x44], id3);
  if (xing) {
    const x = id3 + 36;
    b.set([0x58, 0x69, 0x6e, 0x67, 0, 0, 0, 1, (xing >>> 24) & 0xff, (xing >>> 16) & 0xff, (xing >>> 8) & 0xff, xing & 0xff], x);
  }
  return b;
}

describe("los modelos, el costo y el texto", () => {
  it("v3 es el principal y lleva las etiquetas; v2 no", () => {
    expect(modeloDeVoz("v3").kie).toBe("elevenlabs/text-to-dialogue-v3");
    expect(modeloDeVoz("elevenlabs-v2-kie").clave).toBe("v2");
    const g = ejemplo();
    expect(textoParaVoz(g, "v3")).toMatch(/^\[preocupada\] ¿Las toallitas/);
    expect(textoParaVoz(g, "v2")).not.toMatch(/\[/);
    expect(textoParaVoz(g, "v2")).toMatch(/^¿Las toallitas/);
  });

  it("el costo: 14 créditos por 1.000 caracteres en v3 y 12 en v2, a 0,005 $ el crédito", () => {
    expect(costoDeVoz("v3", 1000)).toEqual({ creditos: 14, usd: 0.07, unidad: "créditos de Kie.ai" });
    expect(costoDeVoz("v2", 198)).toMatchObject({ creditos: 2.376, usd: 0.012 });
    // Una toma de 198 caracteres en v3: 2,772 créditos (las tres voces de la prueba, 0,042 $).
    expect(costoDeVoz("v3", 198)).toMatchObject({ creditos: 2.772, usd: 0.014 });
    // Con la llave oficial: un crédito de ElevenLabs por carácter, en dólares aproximado (plan Creator).
    expect(costoDeVoz("v3", 215, "elevenlabs")).toEqual({ creditos: 215, usd: 0.048, unidad: "créditos de ElevenLabs" });
    expect(costoDeVoz("nada", 100)).toMatchObject({ creditos: 0, usd: 0 });
  });

  it("la frase de muestra cabe, con su emoción en v3 y sin ella en v2", () => {
    expect(fraseDeMuestra("v3").length).toBeLessThanOrEqual(130);
    expect(fraseDeMuestra("v3")).toMatch(/^\[/);
    expect(fraseDeMuestra("v2")).not.toMatch(/\[/);
  });

  it("un texto vacío o largo de más se dice antes de pagar", () => {
    expect(problemaDelTexto("", "v3")).toMatch(/nada que decir/);
    expect(problemaDelTexto("a".repeat(5001), "v3")).toMatch(/5001 caracteres/);
    expect(problemaDelTexto("Hola", "v4")).toMatch(/no existe/);
    expect(problemaDelTexto("Hola", "v3")).toBeNull();
  });
});

describe("las voces", () => {
  it("las de serie tienen id de ElevenLabs, nombre y género, sin repetirse", () => {
    expect(VOCES_DE_SERIE.length).toBeGreaterThanOrEqual(8);
    expect(new Set(VOCES_DE_SERIE.map((v) => v.id)).size).toBe(VOCES_DE_SERIE.length);
    for (const v of VOCES_DE_SERIE) expect(v.id).toMatch(/^[A-Za-z0-9]{12,40}$/);
    expect(VOCES_DE_SERIE.some((v) => v.genero === "femenina")).toBe(true);
    expect(VOCES_DE_SERIE.some((v) => v.genero === "masculina")).toBe(true);
  });

  it("las propias de la agencia van primero, limpias y con tope; un id raro no entra", () => {
    const l = limpiarLocucion({
      voz: "abcDEF1234567890", modelo: "v9",
      voces: [{ id: "abcDEF1234567890", nombre: " Valentina   MX ", genero: "femenina" }, { id: "abcDEF1234567890" }, { id: "no vale" }, { id: "<script>" }],
    });
    expect(l).toEqual({ voz: "abcDEF1234567890", modelo: "v3", voces: [{ id: "abcDEF1234567890", nombre: "Valentina MX", genero: "femenina", nota: "", propia: true }] });
    const muchas = limpiarLocucion({ voces: Array.from({ length: 20 }, (_, i) => ({ id: `vozpropia${String(i).padStart(6, "0")}` })) });
    expect(muchas.voces).toHaveLength(MAX_VOCES_PROPIAS);
    const lista = vocesDisponibles(l);
    expect(lista[0]).toMatchObject({ nombre: "Valentina MX", propia: true });
    expect(lista).toHaveLength(VOCES_DE_SERIE.length + 1);
    expect(vozPorId(l, "abcDEF1234567890").nombre).toBe("Valentina MX");
    expect(vozPorId(l, "inventada0000000")).toBeNull();
  });
});

describe("los tiempos de cada palabra", () => {
  it("lee los tiempos por palabra que traiga el resultado, en sus formas (y sin las de sólo espacio)", () => {
    const porPalabra = { resultJson: JSON.stringify({ resultUrls: ["https://x/a.mp3"], timestamps: [{ text: "Hola", start: 0.1, end: 0.4 }, { text: " ", start: 0.4, end: 0.45 }, { text: "mamá", start: 0.45, end: 0.9 }] }) };
    expect(palabrasDelResultado(porPalabra)).toEqual([{ texto: "Hola", desde: 0.1, hasta: 0.4 }, { texto: "mamá", desde: 0.45, hasta: 0.9 }]);
    const otra = { resultJson: { words: [{ word: "Hola", start_time: 0, end_time: 0.3 }] } };
    expect(palabrasDelResultado(otra)).toEqual([{ texto: "Hola", desde: 0, hasta: 0.3 }]);
  });

  it("agrupa la alineación POR CARÁCTER de ElevenLabs en palabras", () => {
    const chars = [..."Sí, ya"];
    const alineacion = {
      characters: chars,
      character_start_times_seconds: chars.map((_, i) => i * 0.1),
      character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1),
    };
    const l = palabrasDelResultado({ resultJson: JSON.stringify({ alignment: alineacion }) });
    expect(l.map((w) => w.texto)).toEqual(["Sí,", "ya"]);
    expect(l[0].desde).toBe(0);
    expect(l[0].hasta).toBeCloseTo(0.3, 5);
    expect(l[1].desde).toBeCloseTo(0.4, 5);
    expect(l[1].hasta).toBeCloseTo(0.6, 5);
  });

  it("sin tiempos en el resultado (sólo el audio), dice null", () => {
    expect(palabrasDelResultado({ resultJson: JSON.stringify({ resultUrls: ["https://x/a.mp3"] }) })).toBeNull();
    expect(palabrasDelResultado({ resultJson: "no es json" })).toBeNull();
    expect(palabrasDelResultado(null)).toBeNull();
  });

  it("alinea lo que se oyó con el guion: una palabra cambiada o comida toma el tiempo de sus vecinas", () => {
    const esperadas = ["¿Las", "toallitas", "le", "dejan", "la", "piel", "roja?"];
    const dichas = [
      { texto: "las", desde: 0.1, hasta: 0.3 }, { texto: "toallitas", desde: 0.3, hasta: 0.9 },
      { texto: "les", desde: 0.9, hasta: 1.0 }, { texto: "dejan", desde: 1.0, hasta: 1.3 },
      { texto: "piel", desde: 1.5, hasta: 1.8 }, { texto: "roja", desde: 1.8, hasta: 2.2 },
    ];
    const a = alinearPalabras(esperadas, dichas);
    expect(a.palabras).toHaveLength(7);
    expect(a.palabras[1]).toEqual({ desde: 0.3, hasta: 0.9 });
    // «la» no se oyó: queda entre «dejan» y «piel».
    expect(a.palabras[4].desde).toBeGreaterThanOrEqual(1.3);
    expect(a.palabras[4].hasta).toBeLessThanOrEqual(1.5);
    expect(a.coincidencia).toBeCloseTo(5 / 7, 3);
    for (let i = 1; i < 7; i++) expect(a.palabras[i].desde).toBeGreaterThanOrEqual(a.palabras[i - 1].desde);
  });

  it("estima sobre la duración REAL, con más tiempo a lo largo y a la puntuación", () => {
    const t = palabrasEstimadas(["Hola,", "mamá.", "Sí"], 3);
    expect(t).toHaveLength(3);
    expect(t[0].desde).toBeGreaterThan(0);
    expect(t[2].hasta).toBeLessThanOrEqual(3);
    expect(palabrasEstimadas(["a"], 0)).toEqual([]);
  });

  it("la duración de un MP3: CBR por su tamaño, con ID3 delante, y VBR por su cabecera Xing", () => {
    expect(duracionMp3(mp3(160_000))).toBe(10);
    expect(duracionMp3(mp3(16_000, { id3: 30 }))).toBe(1);
    expect(duracionMp3(mp3(4000, { xing: 100 }))).toBeCloseTo((100 * 1152) / 44100, 2);
    expect(duracionMp3(new Uint8Array([1, 2, 3]))).toBe(0);
  });

  it("la verificación posterior: lee la transcripción de Gemini aunque venga con texto alrededor", () => {
    const r = leerTranscripcionConTiempos('Aquí va:\n{"palabras":[{"t":"Hola","d":0.12,"h":0.4},{"t":"mamá","d":0.41,"h":0.8}]}\nListo.');
    expect(r).toEqual([{ texto: "Hola", desde: 0.12, hasta: 0.4 }, { texto: "mamá", desde: 0.41, hasta: 0.8 }]);
    expect(leerTranscripcionConTiempos("sin json")).toBeNull();
  });

  it("las tres capas, en orden, y siempre UNA por palabra del guion: lineaDeTiempo deja de estimar", () => {
    const g = ejemplo();
    const esperadas = palabrasDe(textoDeLocucion(g));
    const conTiempos = esperadas.map((p, i) => ({ text: p, start: i * 0.4, end: i * 0.4 + 0.35 }));
    const motor = tiemposDeLocucion(g, { resultado: { resultJson: JSON.stringify({ timestamps: conTiempos }) }, duracion: 99 });
    expect(motor).toMatchObject({ fuente: "motor", coincidencia: 1 });
    expect(motor.palabras).toHaveLength(esperadas.length);
    expect(lineaDeTiempo(g, motor.palabras).estimado).toBe(false);

    const oidas = conTiempos.map((w) => ({ t: w.text, d: w.start, h: w.end }));
    expect(tiemposDeLocucion(g, { resultado: { resultJson: "{}" }, oidas }).fuente).toBe("verificado");

    const est = tiemposDeLocucion(g, { resultado: { resultJson: "{}" }, duracion: 12 });
    expect(est).toMatchObject({ fuente: "estimado", coincidencia: null });
    expect(est.palabras).toHaveLength(esperadas.length);
    expect(est.palabras.at(-1).hasta).toBeLessThanOrEqual(12);
    expect(lineaDeTiempo(g, est.palabras).estimado).toBe(false);
  });

  it("normaliza tildes y signos para comparar, sin perder la eñe", () => {
    expect(normalizarPalabra("¿Mamá?")).toBe("mama");
    expect(normalizarPalabra("Año,")).toBe("ano");
    expect(MODELOS_VOZ.v3.id).not.toBe(MODELOS_VOZ.v2.id);
  });
});
