import { describe, it, expect } from "vitest";
import {
  categoriaDeModelo, origenDeModelo, modeloDeSonido, limpiarEtiquetas, limpiarBpm, limpiarDuracionSonido, bpmDelTexto,
  limpiarCambiosSonido, metaDeSonido, ordenarPistas, textoDePista, pistasQueEncajan, textoDeLasQueEncajan, limpiarNombreSonido,
  MAX_BYTES_SONIDO,
} from "./bibliotecaSonido.js";

describe("la biblioteca de sonido: lo puro", () => {
  it("la categoría y el origen salen del modelo de la galería (las músicas de antes entran solas; la locución no)", () => {
    expect(categoriaDeModelo("musica-suno")).toBe("musica");
    expect(categoriaDeModelo("musica-subida")).toBe("musica");
    expect(categoriaDeModelo("musica-agencia")).toBe("musica");
    expect(categoriaDeModelo("efecto-subido")).toBe("efecto");
    expect(categoriaDeModelo("elevenlabs-v3")).toBeNull();
    expect(categoriaDeModelo("")).toBeNull();
    expect(origenDeModelo("musica-suno")).toBe("suno");
    expect(origenDeModelo("efecto-agencia")).toBe("agencia");
    expect(origenDeModelo("musica-subida")).toBe("subida");
    expect(modeloDeSonido("efecto")).toBe("efecto-subido");
    expect(modeloDeSonido("musica", { deAgencia: true })).toBe("musica-agencia");
    expect(MAX_BYTES_SONIDO.efecto).toBe(2 * 1024 * 1024);
  });

  it("limpia nombre, etiquetas, BPM y duración; lo que no vale se quita", () => {
    expect(limpiarNombreSonido("  Mi   tema.mp3 ")).toBe("Mi tema");
    expect(limpiarEtiquetas("Alegre, alegre, #Acústica, acustica, ,  rápida ")).toEqual(["alegre", "acústica", "rápida"]);
    expect(limpiarEtiquetas(Array.from({ length: 12 }, (_, i) => `e${i}`))).toHaveLength(8);
    expect(limpiarBpm("98.4")).toBe(98);
    expect(limpiarBpm(20)).toBeNull();
    expect(limpiarBpm("")).toBeNull();
    expect(limpiarDuracionSonido(31.86)).toBe(31.9);
    expect(limpiarDuracionSonido(-1)).toBeNull();
    expect(bpmDelTexto("warm acoustic folk, ukulele, 100 BPM, builds")).toBe(100);
    expect(bpmDelTexto("sin tempo")).toBeNull();
    expect(limpiarCambiosSonido({ nombre: " ", etiquetas: "a,b", bpm: "120", favorita: "sí", otra: 1 })).toEqual({ etiquetas: ["a", "b"], bpm: 120 });
    expect(limpiarCambiosSonido({ favorita: true, nombre: "Tema" })).toEqual({ favorita: true, nombre: "Tema" });
  });

  it("lo que guarda una pista: el BPM del estilo de Suno si nadie lo escribió; la duración de Suno", () => {
    expect(metaDeSonido({ pedido: { estilo: "lofi chill, 84 BPM" }, duracion: 30.24 })).toEqual({ etiquetas: [], bpm: 84, duracion: 30.2 });
    expect(metaDeSonido({ biblioteca: { etiquetas: ["Tranquila"], bpm: 90, duracion: 12 }, pedido: { estilo: "84 BPM" } })).toEqual({ etiquetas: ["tranquila"], bpm: 90, duracion: 12 });
  });

  it("el orden: la favorita del cliente, lo del cliente, la favorita de la agencia y lo de la agencia; lo nuevo primero", () => {
    const l = ordenarPistas([
      { id: "a1", de: "agencia", fecha: "2026-11-05" },
      { id: "c1", de: "cliente", fecha: "2026-11-01" },
      { id: "af", de: "agencia", favorita: true, fecha: "2026-01-01" },
      { id: "c2", de: "cliente", fecha: "2026-11-03" },
      { id: "cf", de: "cliente", favorita: true, fecha: "2026-01-01" },
    ]);
    expect(l.map((p) => p.id)).toEqual(["cf", "c2", "c1", "af", "a1"]);
  });

  it("la línea de una pista para el asistente", () => {
    expect(textoDePista({ nombre: "Mañana", bpm: 98, etiquetas: ["alegre"], duracion: 32, favorita: true, categoria: "musica", de: "cliente" }))
      .toBe("«Mañana» · 98 BPM · alegre · 0:32 · música de la marca");
    expect(textoDePista({ nombre: "Whoosh", categoria: "efecto", de: "agencia" })).toBe("«Whoosh» · de la agencia");
  });

  it("encaja la que suena como lo que propone el director (etiquetas en español contra su inglés) y con su BPM", () => {
    const propuesta = { estilo: "warm acoustic folk, ukulele, soft claps, upbeat and cheerful, 100 BPM", genero: "acoustic folk pop", bpm: 100 };
    const pistas = [
      { id: "a", nombre: "Mañana", categoria: "musica", etiquetas: ["alegre", "acústica"], bpm: 98, de: "cliente" },
      { id: "b", nombre: "Noche", categoria: "musica", etiquetas: ["misteriosa"], bpm: 100, de: "cliente" },
      { id: "c", nombre: "Rápida", categoria: "musica", etiquetas: ["alegre"], bpm: 150, de: "agencia" },
      { id: "d", nombre: "Pop", categoria: "efecto", etiquetas: ["alegre"], de: "cliente" },
      { id: "e", nombre: "Suno", categoria: "musica", estilo: "acoustic folk, ukulele, handclaps, 102 BPM", bpm: 102, de: "agencia" },
    ];
    const r = pistasQueEncajan(propuesta, pistas);
    expect(r.map((x) => x.pista.id)).toEqual(["a", "e"]);
    expect(r[0].motivo).toMatch(/98 BPM \(pide 100\)/);
    expect(r[0].motivo).toMatch(/alegre, acústica/);
    // Con el BPM solo no basta, y uno a la mitad o al doble sí casa.
    expect(pistasQueEncajan({ estilo: "dark techno, 128 BPM" }, [{ id: "x", categoria: "musica", etiquetas: [], bpm: 128 }])).toEqual([]);
    expect(pistasQueEncajan({ estilo: "calm ambient piano, 70 BPM", bpm: 70 }, [{ id: "y", categoria: "musica", etiquetas: ["tranquila"], bpm: 140 }])).toHaveLength(1);
    expect(pistasQueEncajan(null, pistas)).toEqual([]);
  });

  it("lo que se le dice al asistente antes de pagar a Suno", () => {
    expect(textoDeLasQueEncajan([])).toBe("");
    const t = textoDeLasQueEncajan([{ id: "a", nombre: "Mañana", categoria: "musica", bpm: 98, motivo: "98 BPM (pide 100)" }]);
    expect(t).toMatch(/^ANTES DE PAGAR/);
    expect(t).toMatch(/a — «Mañana» · 98 BPM/);
    expect(t).toMatch(/sonido_video \(musica_id\)/);
  });
});
