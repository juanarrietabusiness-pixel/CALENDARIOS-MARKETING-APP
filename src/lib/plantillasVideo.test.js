import { describe, it, expect } from "vitest";
import { guionDePlantilla, PLANTILLAS_VIDEO } from "./plantillasVideo.js";
import { validarGuion, lineaDeTiempo } from "./videoEscenas.js";
import { COMPONENTES_LISTOS } from "./motorVideo.js";

// ============================================================
// Las PLANTILLAS de movimiento gráfico: cada una da un guion que VALIDA (sin errores), que el motor dibuja entero
// (sólo componentes listos) y que dura lo que se espera de un reel corto. Y sin lo que pide, dice qué falta.
// ============================================================

const DATOS = {
  comentarios: { usuario: "maria.pty", comentario: "¿Y eso no se daña con el agua?", likes: 1240, respuestas: ["Para nada", "Es tela antimanchas", "Se limpia con un paño húmedo"], producto: "f1", llamado: "Escríbenos" },
  busqueda: { busqueda: "colchón que no dé calor en Panamá", resultados: ["Colchón de resortes", "Colchón de espuma", "Colchón D'CASA fresco"], producto: "f1", nombre: "Colchón fresco", precio: "$199", llamado: "Pídelo hoy" },
  producto: { fotos: ["f1", "f2"], textos: ["Nuevo", "Queen", "En caja"], precio: "$299", llamado: "Ver más" },
  logo: { fotos: ["a", "b", "c", "d"], llamado: "Síguenos" },
};

describe("las plantillas de movimiento gráfico", () => {
  for (const p of PLANTILLAS_VIDEO) {
    it(`${p.nombre}: valida, sólo componentes que el motor dibuja, de 5 a 25 s`, () => {
      const r = guionDePlantilla(p.id, DATOS[p.id]);
      expect(r.error).toBeUndefined();
      const v = validarGuion(r.guion);
      expect(v.errores ?? [], JSON.stringify(v.errores)).toEqual([]);
      expect(v.ok).toBe(true);
      for (const e of v.guion.escenas) for (const c of e.capas) expect(COMPONENTES_LISTOS, c.tipo).toContain(c.tipo);
      const total = lineaDeTiempo(v.guion).total;
      expect(total).toBeGreaterThanOrEqual(5);
      expect(total).toBeLessThanOrEqual(25);
    });
  }

  it("sin lo que pide, dice qué falta; una plantilla que no existe, también", () => {
    expect(guionDePlantilla("comentarios", { respuestas: ["a"] }).error).toMatch(/comentario/);
    expect(guionDePlantilla("busqueda", {}).error).toMatch(/busca/);
    expect(guionDePlantilla("producto", {}).error).toMatch(/foto/);
    expect(guionDePlantilla("logo", { fotos: ["a"] }).error).toMatch(/3 fotos/);
    expect(guionDePlantilla("otra", {}).error).toMatch(/no existe/);
  });

  it("el logo queda fijo: mismo sitio y tamaño en cada corte", () => {
    const { guion } = guionDePlantilla("logo", DATOS.logo);
    const logos = guion.escenas.slice(0, -1).map((e) => e.capas.find((c) => c.tipo === "logo"));
    expect(new Set(logos.map((l) => `${l.pos}-${l.tam}`)).size).toBe(1);
  });
});

describe("lo que salió en el primer video real", () => {
  it("una búsqueda larga se escribe en 1,2 s como mucho: los resultados se ven en la escena", async () => {
    const { escritoHasta, letrasPorSegundo, MAX_ESCRIBIR } = await import("./motorComponentes.js");
    const larga = "óptica que me haga los lentes hoy en Panamá";
    expect(larga.length / letrasPorSegundo(larga)).toBeLessThanOrEqual(MAX_ESCRIBIR + 1e-9);
    expect(escritoHasta(larga, MAX_ESCRIBIR)).toBe(larga);
    expect(letrasPorSegundo("corta")).toBe(16);
  });

  it("un signo pegado al cierre de un énfasis va con la palabra (sin «café ,»)", async () => {
    const { partirEnfasis } = await import("./motorTexto.js");
    expect(partirEnfasis("Con música y *café*, ya").map((p) => p.texto)).toEqual(["Con", "música", "y", "café,", "ya"]);
    expect(partirEnfasis("¿Por qué *esperar*?").map((p) => p.texto)).toEqual(["¿Por", "qué", "esperar?"]);
    expect(partirEnfasis("Lo *mejor* de todo").map((p) => p.texto)).toEqual(["Lo", "mejor", "de", "todo"]);
  });
});
