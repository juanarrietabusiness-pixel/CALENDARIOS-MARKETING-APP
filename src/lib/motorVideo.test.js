import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validarGuion, lineaDeTiempo } from "./videoEscenas.js";
import {
  dibujarFrame, paletaDelKit, paletaDelGuion, colorDe, contraste, centroDe, estadoDeCapa, encajarTexto, escenaEn,
  ruidoDeGrano, semilla, aleatorio, COMPONENTES_LISTOS, framesDe,
} from "./motorVideo.js";

// ============================================================
// El motor del video animado
//
//   · es DETERMINISTA: el mismo instante da las mismas llamadas al lienzo, y el grano cambia por fotograma;
//   · no usa nada del navegador (el render del Container usará el mismo archivo);
//   · lo que aún no entra no se dibuja; las entradas, salidas y bucles hacen lo que dicen;
//   · las transiciones pintan las dos escenas; lo que el motor aún no dibuja sale como marcador con su nombre;
//   · la paleta sale del kit por el papel de cada color y, si no lo dice, por la luz.
// ============================================================

/** Un contexto 2D de mentira: apunta cada llamada y cada propiedad que se fija, y mide el texto por su largo. */
function lienzo() {
  const log = [];
  const estado = { font: "10px x" };
  const tam = () => Number(/(\d+)px/.exec(estado.font)?.[1] ?? 10);
  const metodos = {
    measureText: (t) => ({ width: String(t).length * tam() * 0.55 }),
    createLinearGradient: (...a) => { log.push(["createLinearGradient", ...a]); return { addColorStop: (...b) => log.push(["addColorStop", ...b]) }; },
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

const guionDelEjemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return validarGuion(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1])).guion;
};
const pintar = (guion, t, extra = {}) => {
  const { ctx, log } = lienzo();
  dibujarFrame(ctx, { guion, linea: lineaDeTiempo(guion), t, ...extra });
  return log;
};
const textos = (log) => log.filter(([m]) => m === "fillText").map(([, t]) => t);
const QUINCE = "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince";

describe("el motor es determinista y no sabe del navegador", () => {
  it("el mismo instante da exactamente las mismas llamadas", () => {
    const g = guionDelEjemplo();
    expect(pintar(g, 3.3)).toEqual(pintar(g, 3.3));
  });

  it("el grano cambia de un fotograma a otro, y siempre igual para el mismo", () => {
    const g = guionDelEjemplo();
    const grano = { grano: { width: 256, height: 256 } };
    const despl = (t) => pintar(g, t, { recursos: grano }).filter(([m]) => m === "translate").at(-1);
    expect(despl(1)).toEqual(despl(1));
    expect(despl(1)).not.toEqual(despl(1 + 1 / 30));
  });

  it("el archivo no usa nada que no exista en el Container", () => {
    const fuente = readFileSync(new URL("./motorVideo.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    for (const prohibido of ["document.", "window.", "Math.random", "Date.now", "new Date", "performance.", "requestAnimationFrame", "new Image", "fetch("]) {
      expect(fuente, prohibido).not.toContain(prohibido);
    }
  });

  it("el ruido del grano sale de su semilla", () => {
    expect(ruidoDeGrano(8, 3)).toEqual(ruidoDeGrano(8, 3));
    expect(ruidoDeGrano(8, 3)).not.toEqual(ruidoDeGrano(8, 4));
    const al = aleatorio(semilla("x"));
    const v = [al(), al(), al()];
    expect(v.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});

describe("la paleta", () => {
  const KIT_BC = [
    { hex: "#1B3246", nombre: "Navy", rol: "estructura y tipografía" },
    { hex: "#91C9A2", nombre: "Sage", rol: "acento natural" },
    { hex: "#EE924A", nombre: "Amber", rol: "detalle y CTA" },
    { hex: "#F9F6ED", nombre: "Cream", rol: "fondos" },
  ];

  it("sale del papel de cada color del kit", () => {
    const p = paletaDelKit(KIT_BC);
    expect(p).toMatchObject({ fondo: "#F9F6ED", texto: "#1B3246", claro: "#F9F6ED", oscuro: "#1B3246" });
    expect(["#91C9A2", "#EE924A"]).toContain(p.acento);
  });

  it("sin papeles, por la luz: el más claro de fondo y el más oscuro de texto", () => {
    const p = paletaDelKit([{ hex: "#FFB400" }, { hex: "#152473" }, { hex: "#FAFAFA" }]);
    expect(p).toMatchObject({ fondo: "#FAFAFA", texto: "#152473", acento: "#FFB400" });
  });

  it("sin kit, la neutra; y lo que fija el guion manda sobre el kit", () => {
    expect(paletaDelKit([]).fondo).toMatch(/^#/);
    expect(paletaDelGuion({ estilo: { paleta: { acento: "#123456" } } }, KIT_BC).acento).toBe("#123456");
    expect(colorDe("#ABCDEF", {})).toBe("#ABCDEF");
    expect(colorDe("acento", { acento: "#111111" })).toBe("#111111");
  });

  it("el texto sobre un color escoge el que más contrasta", () => {
    expect(contraste("#1B3246")).toBe("#FFFFFF");
    expect(contraste("#F9F6ED")).toBe("#111111");
  });
});

describe("dónde va cada capa", () => {
  it("las posiciones con nombre dependen del formato y respetan las zonas de Instagram", () => {
    const arriba = centroDe("arriba", "9:16", 1080, 1920);
    expect(arriba.x).toBe(540);
    expect(arriba.y / 1920).toBeGreaterThan(0.14);
    expect(centroDe("abajo-der", "9:16", 1080, 1920).x).toBeGreaterThan(540);
    expect(centroDe({ x: 0.1, y: 0.5 }, "1:1", 1080, 1080)).toEqual({ x: 108, y: 540 });
  });
});

describe("la animación de una capa", () => {
  const capa = (animacion) => ({ animacion: { entrada: "aparece", salida: "ninguna", bucle: "ninguno", ...animacion } });
  const m = { desde: 1, hasta: 4 };

  it("antes de entrar y después de salir no existe", () => {
    expect(estadoDeCapa(capa({}), m, 0.5)).toBe(null);
    expect(estadoDeCapa(capa({}), m, 4.5)).toBe(null);
    expect(estadoDeCapa(capa({}), m, 2)).toMatchObject({ alfa: 1, escala: 1 });
  });

  it("sube, escala y fundido terminan en su sitio", () => {
    expect(estadoDeCapa(capa({ entrada: "sube" }), m, 1.1).dy).toBeGreaterThan(0);
    expect(estadoDeCapa(capa({ entrada: "sube" }), m, 2).dy).toBeCloseTo(0, 5);
    expect(estadoDeCapa(capa({ entrada: "escala" }), m, 1.1).escala).toBeLessThan(1);
    expect(estadoDeCapa(capa({ entrada: "fundido" }), m, 1.1).alfa).toBeLessThan(1);
  });

  it("el ritmo cambia lo que tarda la entrada", () => {
    const a = (ritmo) => estadoDeCapa(capa({ entrada: "fundido" }), m, 1.3, { ritmo }).alfa;
    expect(a("rapido")).toBe(1);
    expect(a("calmado")).toBeLessThan(a("medio"));
  });

  it("la salida se apaga en sus últimos 0,3 s", () => {
    expect(estadoDeCapa(capa({ salida: "fundido" }), m, 3.5).alfa).toBe(1);
    expect(estadoDeCapa(capa({ salida: "fundido" }), m, 3.9).alfa).toBeLessThan(0.5);
  });

  it("los bucles se mueven solos y vuelven", () => {
    const flota = (t) => estadoDeCapa(capa({ bucle: "flota" }), m, t).dy;
    expect(flota(1.75)).not.toBeCloseTo(0, 1);
    expect(flota(4)).toBeCloseTo(0, 5);
    expect(estadoDeCapa(capa({ bucle: "gira" }), m, 4).giro).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("el texto cabe en su sitio", () => {
  it("un titular largo baja de tamaño hasta caber en sus tres líneas", () => {
    const { ctx } = lienzo();
    const corto = encajarTexto(ctx, "Hola", { ancho: 900, lado: 1080 });
    const largo = encajarTexto(ctx, "Un titular demasiado largo para caber de una vez en la pieza", { ancho: 900, lado: 1080 });
    expect(largo.tam).toBeLessThan(corto.tam);
    expect(largo.lineas.length).toBeLessThanOrEqual(3);
  });
});

describe("dibujar un fotograma", () => {
  it("una capa que entra en una palabra no se dibuja antes", () => {
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, capas: [{ tipo: "texto", texto: "Ahora", entra: { palabra: 10 } }] }] }).guion;
    expect(textos(pintar(g, 1))).not.toContain("Ahora");
    expect(textos(pintar(g, 5))).toContain("Ahora");
  });

  it("«escribe» revela las letras en orden", () => {
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, capas: [{ tipo: "texto", texto: "Hola mamá", animacion: { entrada: "escribe" } }] }] }).guion;
    const a = textos(pintar(g, 0.05)).join("");
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThan("Hola mamá".length);
    expect(textos(pintar(g, 2)).join(" ")).toBe("Hola mamá");
  });

  it("en una transición se pintan las dos escenas", () => {
    const g = validarGuion({ escenas: [
      { tipo: "gancho", habla: QUINCE, fondo: { color: "#111111" } },
      { tipo: "cierre", habla: QUINCE, fondo: { color: "#EEEEEE" }, transicion: { tipo: "fundido", dur: 0.5 } },
    ] }).guion;
    const inicio = lineaDeTiempo(g).escenas[1].desde;
    const colores = (t) => pintar(g, t).filter(([m]) => m === "=fillStyle").map(([, v]) => v);
    expect(colores(inicio + 0.1)).toEqual(expect.arrayContaining(["#111111", "#EEEEEE"]));
    expect(colores(inicio + 0.8)).not.toContain("#111111");
    expect(escenaEn(lineaDeTiempo(g), inicio + 0.1)).toBe(1);
  });

  it("sin capas, enseña el texto de «pantalla»", () => {
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, pantalla: "¿Piel roja?" }] }).guion;
    expect(textos(pintar(g, 2))).toContain("¿Piel roja?");
  });

  it("lo que el motor aún no dibuja sale como marcador con su nombre; una imagen sin cargar, también", () => {
    const g = validarGuion({ escenas: [{ tipo: "gancho", habla: QUINCE, capas: [
      { tipo: "telefono" }, { tipo: "imagen", archivo: "x1" }, { tipo: "antes_despues", textoAntes: "a", textoDespues: "b" },
    ] }] }).guion;
    expect(textos(pintar(g, 2))).toEqual(expect.arrayContaining(["Teléfono", "Imagen", "Antes / después"]));
  });

  it("con la imagen cargada la dibuja, y el logo del kit también", () => {
    const g = validarGuion({ escenas: [{ tipo: "producto", habla: QUINCE, capas: [{ tipo: "imagen", archivo: "x1" }, { tipo: "logo" }] }] }).guion;
    const img = { width: 800, height: 1000 };
    const log = pintar(g, 2, { recursos: { imagen: (id) => (id === "x1" ? img : null), logo: { width: 400, height: 200 } } });
    expect(log.filter(([m]) => m === "drawImage")).toHaveLength(2);
    expect(textos(log)).not.toContain("Imagen");
  });

  it("dibuja en las medidas del formato que se pida", () => {
    const g = guionDelEjemplo();
    const fondo = (formato) => pintar(g, 0.5, { formato }).find(([m]) => m === "fillRect");
    expect(fondo("9:16")).toEqual(["fillRect", 0, 0, 1080, 1920]);
    expect(fondo("16:9")).toEqual(["fillRect", 0, 0, 1920, 1080]);
  });

  it("todo componente del formato o está listo o sale como marcador", () => {
    expect(COMPONENTES_LISTOS).toEqual(expect.arrayContaining(["texto", "sello", "imagen", "forma", "logo", "llamado"]));
    expect(framesDe(40.2)).toBe(1206);
  });
});
