import { describe, it, expect } from "vitest";
import {
  limpiarPersonaje, tieneAspecto, conPersonajeDelKit, expresionDe, dibujarPersonaje, TOKENS_ROPA, ASPECTO_POR_DEFECTO, PROPORCION_PERSONAJE,
  EXPRESIONES_PERSONAJE,
} from "./personajeVideo.js";
import { TOKENS_COLOR, validarGuion, COMPONENTES } from "./videoEscenas.js";
import { COMPONENTES_LISTOS } from "./motorVideo.js";
import { EJEMPLO_GUION } from "./videoFormatoIA.js";
import { limpiarKit, fundirKit } from "./kitMarca.js";

// ============================================================
// El personaje de la casa: el aspecto del cliente, la expresión y el dibujo (determinista, sin Path2D ni ellipse)
// ============================================================

/** Un lienzo de mentira que apunta cada llamada (sólo lo que usa el dibujo). */
function lienzo() {
  const llamadas = [];
  const ctx = new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (["path2D", "ellipse"].includes(k)) throw new Error(`no existe ${k}`);
      return (...a) => { llamadas.push([k, ...a.map((x) => (typeof x === "number" ? Math.round(x * 1000) / 1000 : x))]); };
    },
    set(o, k, v) { o[k] = v; llamadas.push([`=${String(k)}`, v]); return true; },
  });
  ctx.globalAlpha = 1;
  return { ctx, llamadas };
}

describe("el aspecto del personaje", () => {
  it("se limpia: colores #RRGGBB, ropa por token, accesorio de la lista, sin pelo con «ninguno»", () => {
    expect(limpiarPersonaje({})).toEqual(ASPECTO_POR_DEFECTO);
    expect(limpiarPersonaje({ piel: "#e0b090", pelo: "ninguno", ropa: "acento", accesorio: "chupete", nombre: "  Caleb  " }))
      .toEqual({ piel: "#E0B090", pelo: "", ropa: "acento", accesorio: "chupete", nombre: "Caleb" });
    expect(limpiarPersonaje({ piel: "rojo", ropa: "url(x)", accesorio: "espada" })).toMatchObject({ piel: ASPECTO_POR_DEFECTO.piel, ropa: "apoyo", accesorio: "ninguno" });
    expect(TOKENS_ROPA).toEqual(TOKENS_COLOR);
  });

  it("el kit lo guarda y «volver a preparar» no se lo lleva; el guion usa el del kit salvo que traiga el suyo", () => {
    const kit = limpiarKit({ personajeVideo: { ropa: "#AABBCC", accesorio: "lazo" } });
    expect(kit.personajeVideo).toMatchObject({ ropa: "#AABBCC", accesorio: "lazo" });
    expect(limpiarKit({}).personajeVideo).toBeUndefined();
    expect(fundirKit(kit, { estilo: "otro" }).personajeVideo).toEqual(kit.personajeVideo);
    const g = validarGuion(JSON.parse(JSON.stringify(EJEMPLO_GUION))).guion;
    expect(conPersonajeDelKit(g, kit).estilo.personaje).toEqual(kit.personajeVideo);
    expect(conPersonajeDelKit(g, {})).toBe(g);
    const propio = { ...g, estilo: { ...g.estilo, personaje: limpiarPersonaje({ piel: "#111111" }) } };
    expect(conPersonajeDelKit(propio, kit).estilo.personaje.piel).toBe("#111111");
    expect(tieneAspecto(null)).toBe(false);
  });

  it("el guion valida la expresión y el aspecto de su estilo", () => {
    const g = JSON.parse(JSON.stringify(EJEMPLO_GUION));
    g.estilo = { ...(g.estilo ?? {}), personaje: { piel: "#C68E6A", accesorio: "gorro" } };
    g.escenas[0].capas.push({ tipo: "personaje", variante: "bebe", expresion: "dormido", pos: "centro" });
    const v = validarGuion(g);
    expect(v.ok).toBe(true);
    expect(v.guion.estilo.personaje).toMatchObject({ piel: "#C68E6A", accesorio: "gorro" });
    g.escenas[0].capas.at(-1).expresion = "furioso";
    expect(validarGuion(g).ok).toBe(false);
    expect(COMPONENTES.personaje.props.expresion).toBeTruthy();
    expect(COMPONENTES_LISTOS).toContain("personaje");
  });
});

describe("la expresión y el dibujo", () => {
  it("la expresión es la que diga la capa; «auto» la toma de la pose", () => {
    expect(expresionDe({ expresion: "triste" })).toBe("triste");
    expect(expresionDe({ expresion: "auto", pose: "preocupado" })).toBe("preocupado");
    expect(expresionDe({ pose: "celebra" })).toBe("feliz");
    expect(expresionDe({ pose: "saluda" })).toBe("neutral");
  });

  it("dibuja las tres variantes con cada expresión, sin Path2D ni ellipse, en una caja de 1,2 × su ancho", () => {
    for (const variante of ["bebe", "nino", "adulto"]) {
      for (const expresion of EXPRESIONES_PERSONAJE) {
        const { ctx, llamadas } = lienzo();
        const r = dibujarPersonaje(ctx, { variante, expresion, pose: "saluda", ancho: 300, vida: 1 });
        expect(r).toEqual({ w: 300, h: 300 * PROPORCION_PERSONAJE });
        expect(llamadas.filter(([k]) => k === "arc").length).toBeGreaterThan(5);
      }
    }
  });

  it("es determinista: el mismo instante da el mismo dibujo; otro instante mueve lo animado", () => {
    const dibujo = (vida, expresion = "dormido") => { const { ctx, llamadas } = lienzo(); dibujarPersonaje(ctx, { variante: "bebe", expresion, ancho: 200, vida }); return JSON.stringify(llamadas); };
    expect(dibujo(1.3)).toBe(dibujo(1.3));
    expect(dibujo(1.3)).not.toBe(dibujo(2.1));
    expect(dibujo(0.5, "triste")).not.toBe(dibujo(1.2, "triste"));
    // Parpadea: con los ojos abiertos y cerrados el dibujo cambia.
    expect(dibujo(1, "neutral")).not.toBe(dibujo(3.3, "neutral"));
  });
});
