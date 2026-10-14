import { describe, it, expect } from "vitest";
import { pedidoDeReel, leerReel, repartirTiempos, pedidoDeFotograma, fotogramasParaVideo, promptDeReel, promptDeTramo, tramo } from "./reel";
import { modelosParaReel, pedidoDeVideo, modeloParaTramo } from "./reelEstudio";
import { modeloPorId } from "./estudioCatalogo";

describe("el reel con IA: el guion por planos", () => {
  it("pide varios planos con cortes, el cierre con logo y llamado, texto corto y el precio exacto", () => {
    const p = pedidoDeReel({ marca: "Baby Caleb", idea: "Caja grande de wipes: 960 por $45", producto: "Wipes Nateen · $45", personajes: ["Mamá"], tipo: "Anuncio" });
    expect(p).toMatch(/reel vertical \(9:16\) de 10 segundos para Baby Caleb/);
    expect(p).toMatch(/LA IDEA CENTRAL: Caja grande de wipes: 960 por \$45/);
    expect(p).toMatch(/de 4 a 8 planos que sumen 10 s/);
    expect(p).toMatch(/logo de la marca y el llamado/);
    expect(p).toMatch(/como mucho 5 palabras/);
    expect(p).toMatch(/"planos":\[\{"desde":0,"hasta":2,"escena"/);
  });

  it("lee el guion y deja los tiempos contiguos desde 0 hasta los segundos", () => {
    const r = leerReel(`Listo: ${JSON.stringify({ hilo: "luz cálida", planos: [{ desde: 5, escena: "c" }, { desde: 0, escena: "a", texto: "¿Piel sensible?" }, { desde: 2, escena: "b" }, { desde: 8, escena: "d", camara: "fija" }], sonido: "música suave", descripcion: "Escríbenos." })}`, 10);
    expect(r.planos.map((p) => [p.n, p.desde, p.hasta, p.escena])).toEqual([[1, 0, 2, "a"], [2, 2, 5, "b"], [3, 5, 8, "c"], [4, 8, 10, "d"]]);
    expect(r).toMatchObject({ hilo: "luz cálida", sonido: "música suave", descripcion: "Escríbenos." });
    expect(leerReel('{"planos":[{"escena":"sola"}]}')).toBeNull();
    expect(repartirTiempos([{}, {}, {}], 10).map((p) => [p.desde, p.hasta])).toEqual([[0, 3], [3, 7], [7, 10]]);
    expect(tramo({ desde: 2, hasta: 5 })).toBe("[2–5 s]");
  });

  it("cada fotograma lleva su plano, el hilo, los anteriores y el texto exacto; el video, el storyboard en orden", () => {
    const plano = { n: 2, desde: 2, hasta: 5, escena: "La mano limpia la piel con la toallita", texto: "Sin cloro", camara: "acercamiento lento" };
    const f = pedidoDeFotograma({ plano, total: 5, hilo: "fondo crema", conAnteriores: true });
    expect(f).toMatch(/Fotograma 2 de 5 del storyboard de un reel vertical 9:16: el plano \[2–5 s\]/);
    expect(f).toMatch(/Qué se ve: La mano limpia/);
    expect(f).toMatch(/fotogramas anteriores de este MISMO reel/);
    expect(f).toMatch(/Texto en pantalla, EXACTO.*"Sin cloro"/);
    expect(fotogramasParaVideo([1, 2, 3, 4, 5, 6, 7, 8, 9], 7)).toEqual([1, 2, 4, 5, 6, 8, 9]);
    expect(fotogramasParaVideo([1, 2], 7)).toEqual([1, 2]);
    const v = promptDeReel({ planos: [{ desde: 0, hasta: 2, escena: "a", texto: "Hola" }, { desde: 2, hasta: 10, escena: "b", camara: "fija" }], hilo: "h", sonido: "voz", conStoryboard: true });
    expect(v).toMatch(/STORYBOARD, en orden/);
    expect(v).toMatch(/\[0–2 s\] a Texto en pantalla, exacto: "Hola"\./);
    expect(v).toMatch(/\[2–10 s\] b Cámara: fija\./);
    expect(promptDeTramo({ desde: 3, hasta: 5, cambio: "que la mamá sonría." })).toMatch(/SOLO del segundo 3 al 5: que la mamá sonría\. Conserva todo lo demás/);
  });

  it("el video: Omni por Kie primero; con referencias va el storyboard, si no, el primer fotograma de inicio", () => {
    expect(modelosParaReel({ kie: true, gemini: true })[0].id).toBe("gemini-omni-kie");
    expect(modeloParaTramo({ kie: true }).id).toBe("gemini-omni-kie");
    expect(modeloParaTramo({ gemini: true })).toBeNull();
    const fotogramas = Array.from({ length: 8 }, (_, i) => ({ clave: `clientes/c1/f${i}.png` }));
    const planos = [{ desde: 0, hasta: 5, escena: "a" }, { desde: 5, hasta: 10, escena: "b" }];
    const conKie = pedidoDeVideo({ modelo: modeloPorId("gemini-omni-kie"), planos, fotogramas });
    expect(conKie.medios.reference).toHaveLength(7);
    expect(conKie.ajustes).toMatchObject({ aspectRatio: "9:16", duration: "10" });
    expect(conKie.prompt).toMatch(/STORYBOARD/);
    const google = pedidoDeVideo({ modelo: modeloPorId("gemini-omni-flash"), planos, fotogramas });
    expect(google.medios).toEqual({ start: ["clientes/c1/f0.png"] });
    expect(google.prompt).not.toMatch(/STORYBOARD/);
  });
});
