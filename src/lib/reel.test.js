import { describe, it, expect } from "vitest";
import { pedidoDeReel, leerReel, repartirTiempos, pedidoDeFotograma, fotogramasParaVideo, promptDeReel, promptDeTramo, tramo, ajustarDuracion, locucionQueCabe, DURACIONES_REEL } from "./reel";
import { modelosParaReel, modeloRecomendadoParaReel, pedidoDeVideo, modeloParaTramo } from "./reelEstudio";
import { modeloPorId, costoDePieza } from "./estudioCatalogo";

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
    // Un guion de antes, con todo en «sonido», lo trae como música.
    expect(r).toMatchObject({ hilo: "luz cálida", musica: "música suave", locucion: "", descripcion: "Escríbenos." });
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
    expect(modeloRecomendadoParaReel({ kie: true, gemini: true }).id).toBe("gemini-omni-kie");
    // La lista va del más barato al más caro (por pieza), la prueba al final.
    const lista = modelosParaReel({ kie: true, gemini: true });
    const costos = lista.filter((m) => m.motor !== "prueba").map(costoDePieza);
    expect(costos).toEqual([...costos].sort((a, b) => a - b));
    expect(lista.at(-1).motor).toBe("prueba");
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

describe("el reel: música, locución, 8 s con Veo y la voz de Omni", () => {
  it("lee música, locución y efectos aparte, y el pedido del video los dice", () => {
    const r = leerReel(JSON.stringify({ hilo: "h", planos: [{ desde: 0, escena: "a" }, { desde: 3, escena: "b" }, { desde: 6, escena: "c" }], musica: "pop alegre", locucion: "Duerme mejor desde hoy", efectos: "risas" }), 10);
    expect(r).toMatchObject({ musica: "pop alegre", locucion: "Duerme mejor desde hoy", efectos: "risas" });
    const v = promptDeReel({ planos: r.planos, musica: r.musica, locucion: r.locucion, efectos: r.efectos });
    expect(v).toMatch(/Música de fondo: pop alegre\./);
    expect(v).toMatch(/Locución en off, en español latino neutro.*«Duerme mejor desde hoy»/);
    expect(v).toMatch(/Efectos de sonido: risas\./);
    const p = pedidoDeReel({ idea: "x", segundos: 8, musica: "jazz", locucion: "Hola" });
    expect(p).toMatch(/como mucho 20 palabras/);
    expect(p).toMatch(/Música que se quiere: jazz/);
    expect(p).toMatch(/Locución que se quiere \(respétala si cabe\): Hola/);
  });

  it("de 10 a 8 s: los planos conservan su proporción y quedan contiguos; la locución se corta a lo que cabe", () => {
    const planos = repartirTiempos([{ desde: 0, escena: "a" }, { desde: 5, escena: "b" }], 10);
    expect(ajustarDuracion(planos, 8).map((p) => [p.desde, p.hasta])).toEqual([[0, 4], [4, 8]]);
    expect(locucionQueCabe("una dos tres cuatro cinco", 1)).toBe("una dos…");
    expect(locucionQueCabe("una dos", 10)).toBe("una dos");
    expect(DURACIONES_REEL.map((d) => d.segundos)).toEqual([10, 8]);
  });

  it("la voz escogida va sólo al modelo que la tiene (Omni por Kie), y no con imagen inicial", () => {
    const planos = [{ desde: 0, hasta: 10, escena: "a" }];
    const fotogramas = [{ clave: "clientes/c1/f1.png" }, { clave: "clientes/c1/f2.png" }];
    expect(pedidoDeVideo({ modelo: modeloPorId("gemini-omni-kie"), planos, fotogramas, voz: "kore" }).ajustes.voz).toBe("kore");
    expect(pedidoDeVideo({ modelo: modeloPorId("veo-3-1-fast-kie"), planos, fotogramas, voz: "kore", segundos: 8 }).ajustes.voz).toBeUndefined();
    expect(pedidoDeVideo({ modelo: modeloPorId("veo-3-1-fast-kie"), planos, fotogramas, segundos: 8 }).ajustes.duration).toBe("8");
  });
});
