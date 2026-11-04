import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validarGuion, lineaDeTiempo, ICONOS_VIDEO, FONDOS } from "./videoEscenas.js";
import { dibujarFrame, cajasDeEscena, areaSegura, COMPONENTES_LISTOS } from "./motorVideo.js";
import {
  ICONOS_DIBUJADOS, dibujarIcono, formatearCifra, avanceDeCuenta, DURACION_CUENTA, dibujarFormas, quitarFondoLiso,
  tonoDeImagen, logoNecesitaPlaca, luzDe,
} from "./motorPiezas.js";
import { EJEMPLO_DIBUJO } from "./videoFormatoIA.js";

// ============================================================
// Las piezas del video animado (paso 3): cifra gigante, iconos, anillo, el dibujo libre, los fondos decorativos y el
// logo sin su fondo. Y que el reparto use el ancho y el alto (el texto salía pequeño y la mitad de abajo, vacía).
// ============================================================

function lienzo() {
  const log = [];
  const estado = { font: "10px x", globalAlpha: 1 };
  const tam = () => Number(/(\d+)px/.exec(estado.font)?.[1] ?? 10);
  const metodos = {
    measureText: (t) => ({ width: String(t).length * tam() * 0.55 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({ patron: true }),
  };
  return {
    log,
    ctx: new Proxy({}, {
      get(_, k) {
        if (k in metodos) return metodos[k];
        if (k in estado) return estado[k];
        return (...args) => log.push([k, ...args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : a))]);
      },
      set(_, k, v) { estado[k] = v; log.push([`=${String(k)}`, v]); return true; },
    }),
  };
}
const QUINCE = "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince";
const guion = (capas, extra = {}) => {
  const v = validarGuion({ escenas: [{ tipo: "dato", habla: QUINCE, capas, ...extra }] });
  expect(v.errores).toEqual([]);
  return v.guion;
};
const pintar = (g, t, extra = {}) => {
  const { ctx, log } = lienzo();
  dibujarFrame(ctx, { guion: g, linea: lineaDeTiempo(g), t, ...extra });
  return log;
};
const textos = (log) => log.filter(([m]) => m === "fillText").map(([, t]) => t);

describe("el formato admite las piezas nuevas", () => {
  it("anillo y dibujo validan; un dibujo sin formas, o con una figura que no existe, no", () => {
    expect(validarGuion({ escenas: [{ tipo: "dato", habla: QUINCE, capas: [{ tipo: "anillo", valor: 80, etiqueta: "satisfechos" }] }] }).ok).toBe(true);
    expect(validarGuion({ escenas: [{ tipo: "dato", habla: QUINCE, capas: [EJEMPLO_DIBUJO] }] }).ok).toBe(true);
    const vacio = validarGuion({ escenas: [{ tipo: "dato", habla: QUINCE, capas: [{ tipo: "dibujo", formas: [] }] }] });
    expect(vacio.errores.map((e) => e.mensaje).join(" ")).toMatch(/al menos una forma/);
    const rara = validarGuion({ escenas: [{ tipo: "dato", habla: QUINCE, capas: [{ tipo: "dibujo", formas: [{ figura: "dragon" }] }] }] });
    expect(rara.errores[0].donde).toMatch(/formas\[0\]\.figura/);
    const fuera = validarGuion({ escenas: [{ tipo: "dato", habla: QUINCE, capas: [{ tipo: "anillo", valor: 140 }] }] });
    expect(fuera.ok).toBe(false);
  });

  it("los fondos de estrellas y líneas existen, y el motor dibuja todas las piezas nuevas", () => {
    expect(FONDOS).toEqual(expect.arrayContaining(["estrellas", "lineas", "puntos"]));
    expect(COMPONENTES_LISTOS).toEqual(expect.arrayContaining(["cifra", "icono", "anillo", "dibujo"]));
  });

  it("cada icono del formato tiene su dibujo, y todos trazan algo", () => {
    expect([...ICONOS_DIBUJADOS].sort()).toEqual([...ICONOS_VIDEO].sort());
    for (const nombre of ICONOS_VIDEO) {
      const { ctx, log } = lienzo();
      dibujarIcono(ctx, nombre, 200, "#000000");
      expect(log.some(([m]) => m === "stroke" || m === "fill"), nombre).toBe(true);
    }
  });
});

describe("la cifra gigante y el anillo", () => {
  it("la cifra se escribe con coma decimal y punto de miles (desde 5 cifras)", () => {
    expect(formatearCifra(1234)).toBe("1234");
    expect(formatearCifra(12345)).toBe("12.345");
    expect(formatearCifra(2.5, 1)).toBe("2,5");
    expect(formatearCifra(-1500000)).toBe("-1.500.000");
  });

  it(`cuenta desde 0 en ${DURACION_CUENTA} s y termina en su valor; sin «contar», sale entera`, () => {
    expect(avanceDeCuenta(0)).toBe(0);
    expect(avanceDeCuenta(DURACION_CUENTA * 2)).toBe(1);
    expect(avanceDeCuenta(0.1, false)).toBe(1);
    const g = guion([{ tipo: "cifra", id: "c", valor: 300, prefijo: "$", sufijo: "%", etiqueta: "de ahorro" }]);
    const alPrincipio = textos(pintar(g, 0.15));
    const alFinal = textos(pintar(g, 3));
    expect(alFinal).toEqual(expect.arrayContaining(["$300", " %", "DE AHORRO"]));
    const n = alPrincipio.find((t) => String(t).startsWith("$"));
    expect(Number(n.slice(1))).toBeLessThan(300);
  });

  it("el anillo dibuja su pista y su arco, y en medio el porcentaje que cuenta", () => {
    const g = guion([{ tipo: "anillo", id: "a", valor: 75, etiqueta: "lo recomiendan" }]);
    const log = pintar(g, 3);
    expect(textos(log)).toEqual(expect.arrayContaining(["75%", "LO RECOMIENDAN"]));
    expect(log.filter(([m]) => m === "arc").length).toBeGreaterThanOrEqual(2);
  });

  it("ninguna pieza nueva sale como marcador", () => {
    const g = guion([
      { tipo: "cifra", id: "c", valor: 3 }, { tipo: "icono", id: "i", nombre: "reloj", fondo: "superficie" },
      { tipo: "anillo", id: "a", valor: 50 }, EJEMPLO_DIBUJO,
    ]);
    expect(textos(pintar(g, 3))).not.toEqual(expect.arrayContaining(["Cifra", "Icono", "Anillo", "Dibujo"]));
  });
});

describe("el dibujo (lienzo libre)", () => {
  const colorDe = (c) => (c === "acento" ? "#FF0000" : "#00FF00");
  it("cada forma espera su retraso", () => {
    const formas = [{ figura: "circulo", x: 0.5, y: 0.5, w: 0.3, relleno: true, color: "acento", retraso: 0, entrada: "escala" },
      { figura: "rect", x: 0.5, y: 0.5, w: 0.3, relleno: true, color: "claro", retraso: 1, entrada: "escala" }];
    const a = lienzo(); dibujarFormas(a.ctx, formas, { ancho: 100, alto: 100, vida: 0.5, colorDe });
    expect(a.log.filter(([m]) => m === "fill")).toHaveLength(1);
    const b = lienzo(); dibujarFormas(b.ctx, formas, { ancho: 100, alto: 100, vida: 3, colorDe });
    expect(b.log.filter(([m]) => m === "fill")).toHaveLength(2);
  });

  it("lo relleno que «se dibuja» se descubre con un recorte puesto ANTES de trazarlo (si no, rellenaría el recorte)", () => {
    const { ctx, log } = lienzo();
    dibujarFormas(ctx, [{ figura: "circulo", x: 0.5, y: 0.5, w: 0.4, relleno: true, color: "acento", entrada: "dibuja" }], { ancho: 100, alto: 100, vida: 0.2, colorDe });
    const orden = log.map(([m]) => m).filter((m) => ["clip", "arc", "fill"].includes(m));
    expect(orden).toEqual(["clip", "arc", "fill"]);
  });

  it("las líneas se trazan de a poco con «dibuja», en coordenadas de su caja", () => {
    const linea = [{ figura: "linea", x: 0, y: 0.5, x2: 1, y2: 0.5, relleno: false, color: "acento", entrada: "dibuja" }];
    const fin = (vida) => { const { ctx, log } = lienzo(); dibujarFormas(ctx, linea, { ancho: 200, alto: 100, vida, colorDe }); return log.filter(([m]) => m === "lineTo").at(-1); };
    expect(fin(10)).toEqual(["lineTo", 100, 0]);
    expect(fin(0.1)[1]).toBeLessThan(100);
  });
});

describe("el logo sin su fondo", () => {
  /** Un logo de 40 × 40: fondo blanco, un cuadro oscuro en medio y, dentro, un hueco blanco (como el de una «O»). */
  const logo = () => {
    const d = new Uint8ClampedArray(40 * 40 * 4);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4;
      const cuadro = x >= 10 && x < 30 && y >= 10 && y < 30;
      const hueco = x >= 17 && x < 23 && y >= 17 && y < 23;
      const v = cuadro && !hueco ? 20 : 255;
      d[i] = v; d[i + 1] = v; d[i + 2] = v + (cuadro && !hueco ? 60 : 0); d[i + 3] = 255;
    }
    return d;
  };
  it("quita el blanco que toca el borde y deja lo de dentro (el hueco de la letra no se vacía)", () => {
    const d = logo();
    expect(quitarFondoLiso(d, 40, 40).quitado).toBe(true);
    const a = (x, y) => d[(y * 40 + x) * 4 + 3];
    expect(a(0, 0)).toBe(0);
    expect(a(5, 20)).toBe(0);
    expect(a(15, 15)).toBe(255);
    expect(a(20, 20)).toBe(255);
  });

  it("no toca un PNG que ya es transparente, ni una imagen que es sólo su color", () => {
    const transparente = logo(); transparente[3] = 0;
    expect(quitarFondoLiso(transparente, 40, 40).quitado).toBe(false);
    const blanca = new Uint8ClampedArray(20 * 20 * 4).fill(255);
    expect(quitarFondoLiso(blanca, 20, 20).quitado).toBe(false);
  });

  it("un logo oscuro sobre un fondo oscuro lleva placa; sobre uno claro, no", () => {
    const d = logo();
    for (let i = 0; i < d.length; i += 4) if (d[i] === 255) { d[i] = 20; d[i + 1] = 20; d[i + 2] = 80; } // sin hueco: todo el logo oscuro
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (x < 10 || x >= 30 || y < 10 || y >= 30) d[(y * 40 + x) * 4 + 3] = 0;
    const tono = tonoDeImagen(d);
    expect(Math.max(...tono)).toBeLessThan(0.15);
    expect(logoNecesitaPlaca(tono, luzDe(20, 30, 50))).toBe(true);
    expect(logoNecesitaPlaca(tono, luzDe(250, 246, 237))).toBe(false);
    expect(logoNecesitaPlaca(null, 0.1)).toBe(false);
  });

  it("un logo rojo con letras azul marino sobre un fondo azul oscuro lleva placa (la media sola no lo veía)", () => {
    const d = new Uint8ClampedArray(100 * 4);
    for (let p = 0; p < 100; p++) {
      const rojo = p < 60;
      d.set(rojo ? [224, 43, 39, 255] : [13, 17, 40, 255], p * 4);
    }
    const tono = tonoDeImagen(d);
    const fondo = luzDe(13, 17, 40);
    const media = tono.reduce((a, b) => a + b, 0) / tono.length;
    expect(logoNecesitaPlaca(media, fondo)).toBe(false);
    expect(logoNecesitaPlaca(tono, fondo)).toBe(true);
    expect(logoNecesitaPlaca(tono, luzDe(242, 237, 228))).toBe(false);
  });

  it("el motor pone la placa detrás del logo cuando no contrasta (y no cuando sí)", () => {
    const g = validarGuion({ escenas: [{ tipo: "cierre", habla: QUINCE, fondo: { tipo: "plano", color: "#101820" }, capas: [{ tipo: "logo", id: "l" }] }] }).guion;
    const placas = (tono) => {
      const log = pintar(g, 3, { recursos: { logo: { width: 400, height: 200 }, logoTono: [tono, tono] } });
      const i = log.findIndex(([m]) => m === "drawImage");
      return log.slice(0, i).filter(([m]) => m === "fill").length;
    };
    expect(placas(0.02)).toBeGreaterThan(placas(0.9));
  });
});

describe("el reparto usa el cuadro", () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  const ejemplo = validarGuion(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1])).guion;
  it("un titular corto con su apoyo no se queda en una franja estrecha: crece y ocupa más de la mitad del ancho y del alto", () => {
    const g = guion([
      { tipo: "texto", id: "t", texto: "Ahorra tiempo", rol: "titular", pos: "arriba" },
      { tipo: "texto", id: "a", texto: "Lo pides hoy y llega mañana", rol: "apoyo", pos: "abajo" },
    ]);
    const { ctx } = lienzo();
    const cajas = cajasDeEscena(ctx, { guion: g, linea: lineaDeTiempo(g), formato: "9:16" });
    const area = areaSegura("9:16", 1080, 1920);
    const t = cajas.find((c) => c.id === "t");
    expect(t.w).toBeGreaterThan(area.w * 0.55);
    const alto = Math.max(...cajas.map((c) => c.y + c.h)) - Math.min(...cajas.map((c) => c.y));
    expect(alto).toBeGreaterThan(area.h * 0.4); // del área segura, con la franja de los subtítulos dentro
  });

  it("el ejemplo de la documentación sigue sin encimarse", () => {
    const { ctx } = lienzo();
    for (let i = 0; i < ejemplo.escenas.length; i++) {
      const cajas = cajasDeEscena(ctx, { guion: ejemplo, linea: lineaDeTiempo(ejemplo), indice: i, formato: "9:16" }).filter((c) => !c.detras);
      for (const a of cajas) for (const b of cajas) {
        if (a === b) continue;
        const cruce = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(cruce).toBeLessThan(Math.min(a.w * a.h, b.w * b.h) * 0.05);
      }
    }
  });
});
