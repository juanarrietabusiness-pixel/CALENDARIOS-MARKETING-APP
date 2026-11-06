import { describe, it, expect, vi, beforeEach } from "vitest";

// «Crear imágenes sin preguntar» desde la pantalla: el «¿Sigo?» del panel y la tarjeta del plan del chat leen el
// ajuste del espacio y, dentro del tope, siguen solos; «No volver a preguntar» lo enciende con un tope razonable.
let ajustes = {};
const guardados = [];
vi.mock("./db", () => ({
  loadAjustes: vi.fn(async () => ajustes),
  saveAjustes: vi.fn(async (cambios) => { guardados.push(cambios); ajustes = { ...ajustes, ...cambios }; return ajustes; }),
}));
let rol = "admin";
vi.mock("./sesionActual", () => ({ esAdmin: () => rol === "admin" }));

const { decidir, confirmarConAjuste, fijarSinPreguntar, olvidarTope, topeDelEspacio, puedeFijar } = await import("./sinPreguntarApi.js");
const db = await import("./db");

beforeEach(() => { ajustes = {}; guardados.length = 0; rol = "admin"; olvidarTope(); db.loadAjustes.mockClear(); });

describe("el «¿Sigo?» con el ajuste delante", () => {
  it("apagado, la pregunta de siempre desde 0,50 $", async () => {
    const preguntar = vi.fn(() => false);
    expect(await confirmarConAjuste(preguntar)(0.6)).toBe(false);
    expect(preguntar).toHaveBeenCalledTimes(1);
    expect(await confirmarConAjuste(preguntar)(0.2)).toBe(true);
    expect(preguntar).toHaveBeenCalledTimes(1);
  });

  it("encendido y dentro del tope, sigue sin preguntar; por encima, pregunta", async () => {
    ajustes = { sin_preguntar_usd: 1 };
    const preguntar = vi.fn(() => true);
    expect(await confirmarConAjuste(preguntar)(0.9)).toBe(true);
    expect(preguntar).not.toHaveBeenCalled();
    expect(await confirmarConAjuste(preguntar)(1.4)).toBe(true);
    expect(preguntar).toHaveBeenCalledTimes(1);
  });

  it("un video pregunta aunque el tope dé para él", async () => {
    ajustes = { sin_preguntar_usd: 100 };
    const preguntar = vi.fn(() => false);
    expect(await confirmarConAjuste(preguntar, { tipo: "video" })(0.9)).toBe(false);
  });

  it("la tarjeta del plan del chat (pregunta siempre sin el ajuste) crea directo con él", async () => {
    expect((await decidir({ costo: 0.08, siempre: true })).preguntar).toBe(true);
    olvidarTope();
    ajustes = { sin_preguntar_usd: 3 };
    expect(await decidir({ costo: 0.08, siempre: true })).toMatchObject({ preguntar: false, sinPreguntar: true, tope: 3 });
    expect(await decidir({ costo: 0.08, siempre: true, otroMotor: true })).toMatchObject({ preguntar: true, motivo: "otro_motor" });
  });

  it("el tope se recuerda un minuto (no se pide en cada pregunta)", async () => {
    ajustes = { sin_preguntar_usd: 2 };
    await topeDelEspacio();
    await topeDelEspacio();
    expect(db.loadAjustes).toHaveBeenCalledTimes(1);
  });

  it("si el ajuste no se puede leer, se pregunta como siempre", async () => {
    db.loadAjustes.mockRejectedValueOnce(new Error("sin red"));
    expect((await decidir({ costo: 0.6 })).preguntar).toBe(true);
  });
});

describe("«No volver a preguntar»", () => {
  it("sólo el administrador; lo enciende con el doble del pedido o 3 $, y la próxima pregunta ya no sale", async () => {
    expect(puedeFijar()).toBe(true);
    expect(await fijarSinPreguntar(0.8)).toBe(3);
    expect(guardados).toEqual([{ sin_preguntar_usd: 3 }]);
    expect(await fijarSinPreguntar(2.3)).toBe(5);
    expect((await decidir({ costo: 4.5, siempre: true })).preguntar).toBe(false);
    rol = "editor";
    expect(puedeFijar()).toBe(false);
  });
});
