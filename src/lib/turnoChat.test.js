import { describe, expect, it } from "vitest";
import { recuperarTurno } from "./turnoChat.js";

const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo });

describe("recuperar una vuelta del asistente que se cortó", () => {
  it("espera mientras el servidor sigue (404) y devuelve el final cuando llega", async () => {
    const pedidas = [];
    const cola = [respuesta(404, { pendiente: true }), respuesta(404, { pendiente: true }), respuesta(200, { evento: { t: "fin", texto: "Listo", stopReason: "end_turn" }, guardado: true })];
    const fin = await recuperarTurno("t-1", { cada: 0, pedir: async (u) => { pedidas.push(u); return cola.shift(); } });
    expect(pedidas).toHaveLength(3);
    expect(pedidas[0]).toBe("/api/ia/chat/turno/t-1");
    expect(fin).toMatchObject({ t: "fin", texto: "Listo", recuperado: true, guardadoPorServidor: true });
  });

  it("un fallo de red al preguntar no corta: vuelve a preguntar", async () => {
    let n = 0;
    const fin = await recuperarTurno("t-2", {
      cada: 0,
      pedir: async () => { if (n++ === 0) throw new Error("red"); return respuesta(200, { evento: { t: "fin", texto: "" }, guardado: false }); },
    });
    expect(fin.guardadoPorServidor).toBe(false);
  });

  it("el error del servidor y la sesión caducada se dicen; sin respuesta, un mensaje claro", async () => {
    await expect(recuperarTurno("t-3", { cada: 0, pedir: async () => respuesta(200, { evento: { t: "error", mensaje: "Sin saldo" } }) })).rejects.toThrow("Sin saldo");
    await expect(recuperarTurno("t-4", { cada: 0, pedir: async () => respuesta(401, {}) })).rejects.toThrow("sesión");
    await expect(recuperarTurno("t-5", { cada: 0, intentos: 2, pedir: async () => respuesta(404, {}) })).rejects.toThrow("Pídemelo otra vez");
  });
});
