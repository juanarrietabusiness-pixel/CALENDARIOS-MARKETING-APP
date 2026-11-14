import { describe, it, expect } from "vitest";
import { pedidoDeListoAnimar, leerListoAnimar, fraseDeAnimar, resumenDeAnimar, CRITERIOS_ANIMAR } from "./listoAnimar";
import { resultadoDeReel } from "./encargoReelPuro";
import { porRevisarAnimar, reelTerminado, notaDelReel, cerrarReelPorPlazo } from "../../worker/lib/estudio/encargoReel.js";

describe("«¿Listo para animar?»: el pedido y la lectura", () => {
  it("pide las cuatro cosas, sin opinar del diseño, con lo que hará cada plano", () => {
    const p = pedidoDeListoAnimar({ planos: [{ n: 1, escena: "La mamá abre la caja", camara: "acercamiento lento" }, { n: 2, escena: "El bebé sonríe" }] });
    for (const c of CRITERIOS_ANIMAR) expect(p).toContain(`· ${c.id}:`);
    expect(p).toMatch(/No opinas del diseño/);
    expect(p).toMatch(/Plano 1: La mamá abre la caja · cámara: acercamiento lento/);
    expect(p).toMatch(/"fotogramas":\[\{"n":1,"separado":true/);
  });

  it("el veredicto lo pone el código: un «no» en cualquiera = no está listo; sólo los números del storyboard", () => {
    const r = leerListoAnimar("```json\n" + JSON.stringify({ fotogramas: [
      { n: 1, separado: true, luz: true, espacio: true, limpio: true, porque: "todo bien" },
      { n: 2, separado: true, luz: "true", espacio: false, limpio: null, porque: "La mano ya toca el borde derecho y la cámara se acerca." },
      { n: 9, separado: false },
      { n: 2, separado: false },
    ] }) + "\n```", [1, 2, 3]);
    expect(r.get(1)).toEqual({ ok: true, motivos: [], nota: "" });
    expect(r.get(2)).toEqual({ ok: false, motivos: ["espacio"], nota: "La mano ya toca el borde derecho y la cámara se acerca." });
    expect(r.has(9)).toBe(false);
    expect(r.has(3)).toBe(false);
    expect(leerListoAnimar("no sé", [1])).toBeNull();
  });

  it("la frase y el resumen dicen el porqué; con todo bien, una línea", () => {
    expect(fraseDeAnimar({ ok: true })).toBe("Listo para animar.");
    expect(fraseDeAnimar({ ok: false, motivos: ["espacio", "limpio"], nota: "La mano toca el borde." }))
      .toBe("Ojo antes de animar: falla «espacio para el movimiento», «sin artefactos ni texto» (La mano toca el borde).");
    expect(resumenDeAnimar([{ n: 1, animable: { ok: true } }, { n: 2, animable: { ok: true } }])).toBe("Listo para animar: los 2 fotogramas revisados.");
    const r = resumenDeAnimar([{ n: 1, animable: { ok: true } }, { n: 2, animable: { ok: false, motivos: ["luz"], nota: "" } }, { n: 3, animable: null }]);
    expect(r).toMatch(/^Listo para animar: 1 de 2 \(es un aviso, no bloquea/);
    expect(r).toMatch(/· Plano 2: falla «luz coherente»\./);
    expect(resumenDeAnimar([])).toBe("");
  });
});

describe("en el encargo del reel", () => {
  const hecho = (n, extra = {}) => ({ id: `f${n}`, fase: "hecho", plano: { n }, opciones: [{ id: `a${n}`, fase: "hecho" }], ...extra });

  it("al pararse a revisar, la mirada va antes de cerrar el encargo; una vez", () => {
    const pasos = [hecho(1), hecho(2)];
    const datos = { salida: "uno", video: { fase: "espera" } };
    expect(porRevisarAnimar(datos, pasos)).toBe(true);
    expect(reelTerminado(datos, pasos)).toBe(false);
    expect(notaDelReel(datos, pasos)).toMatch(/mirando si se puede animar bien/);
    datos.animable = { at: "x", revisados: 2, listos: 1 };
    expect(porRevisarAnimar(datos, pasos)).toBe(false);
    expect(reelTerminado(datos, pasos)).toBe(true);
    expect(notaDelReel(datos, pasos)).toMatch(/1 con un aviso antes de animar/);
    // Sin pararse (el video sigue solo) no se mira; sin nada hecho, tampoco.
    expect(porRevisarAnimar({ salida: "uno", video: { fase: "nuevo" } }, pasos)).toBe(false);
    expect(porRevisarAnimar({ salida: "fotogramas", video: { fase: "espera" } }, [{ id: "f1", fase: "fallido" }])).toBe(false);
  });

  it("si se cierra por plazo, no se queda pendiente", () => {
    const datos = { salida: "fotogramas", video: { fase: "espera" } };
    cerrarReelPorPlazo(datos, [hecho(1)]);
    expect(datos.animable.omitido).toMatch(/No dio tiempo/);
  });

  it("la pantalla lo lee de la ficha del fotograma; uno corregido después no lo lleva", () => {
    const e = { estado: "hecho", reel: { video: { fase: "espera" } }, pasos: [
      hecho(1, { animable: { archivoId: "a1", ok: false, motivos: ["luz"] } }),
      hecho(2, { finales: ["nuevo2"], animable: { archivoId: "a2", ok: true } }),
    ] };
    const archivos = new Map([["a1", { id: "a1", src: "x" }], ["nuevo2", { id: "nuevo2", src: "y", ajustes: {} }]]);
    const r = resultadoDeReel(e, archivos);
    expect(r.fotos[0].animable).toMatchObject({ ok: false, motivos: ["luz"] });
    expect(r.fotos[1].animable).toBeUndefined();
  });
});
