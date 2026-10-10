import { describe, it, expect } from "vitest";
import { segundosParaModelo, ajusteDeDuracion, pedidoDeGuionCorto, leerGuionCorto, promptDeVideoCorto, MAX_PALABRAS_PANTALLA } from "./videoCorto";
import { modeloPorId } from "./estudioCatalogo";

describe("la duración según el modelo", () => {
  it("Veo (fal) hasta 8 s; Gemini Omni y Kling Omni hasta 10", () => {
    expect(segundosParaModelo(modeloPorId("veo-3-fast-fal"))).toBe(8);
    expect(segundosParaModelo(modeloPorId("gemini-omni-flash"))).toBe(10);
    expect(segundosParaModelo(modeloPorId("kling-omni"))).toBe(10);
    expect(ajusteDeDuracion(modeloPorId("veo-3-fast-fal"), 8)).toBe("8");
    expect(ajusteDeDuracion(modeloPorId("kling-omni"), 10)).toBe("10");
    expect(ajusteDeDuracion(modeloPorId("veo-3-fast-fal"), 10)).toBeNull();
  });
});

describe("el guion", () => {
  it("el pedido lleva los tres tiempos de la duración, el tipo y el producto", () => {
    const p = pedidoDeGuionCorto({ marca: "Dcasa", idea: "Sofá manchado que queda limpio", segundos: 10, post: { pilar: "anuncio", producto: "Lavado de muebles", nivel: "decision" }, productoLinea: "Lavado de muebles (servicio) · precio: Desde $45" });
    expect(p).toContain("gancho (0–2 s), beneficio (2–7 s), cierre (7–10 s)");
    expect(p).toContain("TIPO DE CONTENIDO: Anuncio");
    expect(p).toContain("Desde $45");
    expect(p).toContain(`como MUCHO ${MAX_PALABRAS_PANTALLA} palabras`);
  });

  it("lee el JSON, recorta el texto en pantalla y arma el pedido sin texto largo ni logo", () => {
    const g = leerGuionCorto('{"escena":"Una sala luminosa","camara":"acercamiento lento","tramos":[{"clave":"gancho","accion":"Un niño derrama jugo en el sofá"},{"clave":"beneficio","accion":"El técnico limpia y la mancha desaparece"},{"clave":"cierre","accion":"La familia se sienta sonriendo"}],"textoPantalla":"Tu sofá como nuevo hoy mismo","textoEdicion":"Desde $45 · Escríbenos","sonido":"música alegre","descripcion":"¿Manchas? 👉 Escríbenos #Panama"}', 8);
    expect(g.textoPantalla).toBe("Tu sofá como nuevo");
    expect(g.tramos.map((t) => `${t.desde}-${t.hasta}`)).toEqual(["0-2", "2-6", "6-8"]);
    const pedido = promptDeVideoCorto(g);
    expect(pedido).toContain("Video vertical de 8 segundos, una sola toma");
    expect(pedido).toContain("0–2 s: Un niño derrama jugo en el sofá.");
    expect(pedido).toContain("«Tu sofá como nuevo»");
    expect(pedido).toContain("Sin logos.");
    expect(pedido).not.toContain("Desde $45");
    expect(leerGuionCorto("nada")).toBeNull();
  });
});
