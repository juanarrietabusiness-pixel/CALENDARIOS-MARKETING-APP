import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { getChatTools } from "../../src/lib/herramientasChat.js";

// ============================================================
// Las definiciones que ve Claude por MCP dicen la verdad
//
// Lo que importa: que nada de lo que una herramienta EXIGE falte en su esquema (efectos_sonido exigía «cliente» sin
// declararlo: Claude tenía que inventarse un parámetro), y que ninguna descripción mande a una herramienta que el MCP
// no tiene (crear_en_estudio mandaba a generar_imagen, que sólo tiene el asistente de la aplicación).
// ============================================================

const nombres = new Set(HERRAMIENTAS_MCP.map((h) => h.name));

describe("las definiciones del MCP", () => {
  it("todo lo que exige una herramienta está en su esquema", () => {
    const faltan = HERRAMIENTAS_MCP.flatMap((h) => (h.inputSchema?.required ?? [])
      .filter((k) => !Object.hasOwn(h.inputSchema?.properties ?? {}, k)).map((k) => `${h.name}.${k}`));
    expect(faltan).toEqual([]);
  });

  it("ninguna descripción manda a una herramienta que sólo tiene el asistente", () => {
    const soloAsistente = getChatTools(true).map((t) => t.name).filter((n) => !nombres.has(n));
    expect(soloAsistente.length).toBeGreaterThan(0);
    const malas = HERRAMIENTAS_MCP.flatMap((h) => soloAsistente
      .filter((n) => new RegExp(`(^|[^\\w])${n}([^\\w]|$)`).test(h.description ?? "")).map((n) => `${h.name} → ${n}`));
    expect(malas).toEqual([]);
  });
});
