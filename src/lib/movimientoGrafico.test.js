import { describe, it, expect } from "vitest";
import { validarGuion, lineaDeTiempo, TRANSICIONES, FONDOS, ENTRADAS, CAMARAS, RESALTES } from "./videoEscenas.js";
import { dibujarFrame, estadoDeCapa, camaraEn, visibleSobreElFondo, conAlfa, esTextoRico, TRANSICIONES_CON_MOVIMIENTO } from "./motorVideo.js";
import { sintetizar, DURACION_EFECTO } from "./efectosSonido.js";
import { colocadosAutomaticos, momentosColocados, EFECTO_AUTOMATICO, REALCE_IMPACTO, SONIDOS_DE_TRANSICION } from "./efectosColocados.js";

// ============================================================
// El MOVIMIENTO GRÁFICO del video animado: transiciones que mueven las dos escenas, fondos vivos, cámara, viñeta, letra
// cinética, el resalte del énfasis y el impacto que suena en un golpe.
// ============================================================

/** Un contexto 2D de mentira que apunta cada llamada (como el de motorVideo.test.js, con degradados radiales). */
function lienzo() {
  const log = [];
  const estado = { font: "10px x" };
  const tam = () => Number(/(\d+)px/.exec(estado.font)?.[1] ?? 10);
  const degradado = (tipo) => (...a) => { log.push([tipo, ...a]); return { addColorStop: (...b) => log.push(["addColorStop", ...b]) }; };
  const metodos = {
    measureText: (t) => ({ width: String(t).length * tam() * 0.55, actualBoundingBoxAscent: tam() * 0.7, actualBoundingBoxDescent: tam() * 0.1 }),
    createLinearGradient: degradado("createLinearGradient"),
    createRadialGradient: degradado("createRadialGradient"),
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
      // Un degradado se apunta por lo que es (sus llamadas ya están en el registro), no por la referencia del objeto.
      set(_, k, v) { estado[k] = v; log.push([`=${String(k)}`, typeof v === "object" && v?.addColorStop ? "<degradado>" : v]); return true; },
    }),
  };
}

// Cada escena dura 3 s (un video dura al menos 5: con una sola, se le añade una de relleno detrás).
const escena = (id, color, extra = {}) => ({ id, tipo: "dato", habla: "", pausa: 3, fondo: { tipo: "plano", color }, capas: [], ...extra });
const guionDe = (escenas, estilo = {}) => {
  const todas = escenas.length > 1 ? escenas : [...escenas, escena("relleno", "fondo")];
  const v = validarGuion({ version: 1, formatos: ["9:16"], estilo, escenas: todas, subtitulos: { activo: false } });
  expect(v.errores).toEqual([]);
  return v.guion;
};
const pintar = (guion, t) => {
  const { ctx, log } = lienzo();
  dibujarFrame(ctx, { guion, linea: lineaDeTiempo(guion), t });
  return log;
};
const rellenos = (log) => log.filter(([m]) => m === "=fillStyle").map(([, v]) => v);

describe("el formato: todo lo nuevo es opcional y va detrás de lo de antes", () => {
  it("las listas crecen por el final", () => {
    expect(TRANSICIONES.slice(0, 5)).toEqual(["corte", "fundido", "barrido", "zoom", "deslizar"]);
    expect(TRANSICIONES.slice(5)).toEqual(["empuje", "golpe", "cortina", "circulo", "persiana", "glitch"]);
    expect(FONDOS.slice(7)).toEqual(["malla", "rayos", "foco"]);
    expect(ENTRADAS.slice(10)).toEqual(["mascara", "escalonado", "latigo", "desenfoque"]);
    expect(CAMARAS).toEqual(["ninguna", "acercar", "alejar", "deriva"]);
    expect(RESALTES).toEqual(["color", "marcador", "subrayado"]);
  });

  it("un guion de antes valida igual: sin cámara, sin dir ni color en la transición, sin viñeta", () => {
    const g = guionDe([escena("a", "fondo"), escena("b", "oscuro", { transicion: { tipo: "fundido", dur: 0.3 } })]);
    expect(g.escenas[1]).not.toHaveProperty("camara");
    expect(g.escenas[1].transicion).toEqual({ tipo: "fundido", dur: 0.3 });
    expect(g.estilo).not.toHaveProperty("vineta");
    expect(g.escenas[0].capas).toEqual([]);
  });

  it("guarda lo nuevo y rechaza lo que no vale", () => {
    const g = guionDe([
      escena("a", "fondo", { camara: "deriva", fondo: { tipo: "malla", color: "oscuro", color2: "acento" } }),
      escena("b", "oscuro", { transicion: { tipo: "cortina", dur: 0.5, dir: "izq", color: "apoyo" }, capas: [
        { tipo: "texto", id: "t", texto: "Hola *ya*", resalte: "marcador", animacion: { entrada: "mascara" } },
      ] }),
    ], { vineta: 0.4 });
    expect(g.escenas[0].camara).toBe("deriva");
    expect(g.escenas[1].transicion).toEqual({ tipo: "cortina", dur: 0.5, dir: "izq", color: "apoyo" });
    expect(g.escenas[1].capas[0].resalte).toBe("marcador");
    expect(g.estilo.vineta).toBe(0.4);
    const mal = validarGuion({ version: 1, escenas: [escena("a", "fondo", { camara: "volar", transicion: { tipo: "empuje", dir: "diagonal" } }), escena("b", "fondo")] });
    expect(mal.errores.map((e) => e.donde)).toEqual(expect.arrayContaining(["e1.camara", "e1.transicion.dir"].map((d) => d.replace("e1", "escenas[0]"))));
  });

  it("un resalte que no es «color» o una entrada cinética llevan el texto por el camino con carácter", () => {
    expect(esTextoRico({ tipo: "texto", texto: "Hola", rol: "titular" })).toBe(false);
    expect(esTextoRico({ tipo: "texto", texto: "Hola", rol: "titular", resalte: "color" })).toBe(false);
    expect(esTextoRico({ tipo: "texto", texto: "Hola", rol: "titular", resalte: "subrayado" })).toBe(true);
    expect(esTextoRico({ tipo: "texto", texto: "Hola", rol: "titular", animacion: { entrada: "escalonado" } })).toBe(true);
  });
});

describe("las transiciones que mueven las dos escenas", () => {
  for (const tipo of ["empuje", "golpe", "cortina", "circulo", "persiana", "glitch"]) {
    it(`«${tipo}» pinta la vieja y la nueva en su momento, siempre igual`, () => {
      expect(TRANSICIONES_CON_MOVIMIENTO.has(tipo)).toBe(true);
      const g = guionDe([escena("a", "#112233"), escena("b", "#445566", { transicion: { tipo, dur: 0.4 } })]);
      // golpe y glitch enseñan una cada mitad: se mira al principio y al final.
      const al = pintar(g, 3.06); const tarde = pintar(g, 3.34);
      const vistos = new Set([...rellenos(al), ...rellenos(tarde)]);
      expect(vistos.has("#112233")).toBe(true);
      expect(vistos.has("#445566")).toBe(true);
      expect(pintar(g, 3.2)).toEqual(pintar(g, 3.2));
    });
  }

  it("el empuje desenfoca en lo más rápido y no al empezar", () => {
    const g = guionDe([escena("a", "#112233"), escena("b", "#445566", { transicion: { tipo: "empuje", dur: 0.4 } })]);
    const filtros = (log) => log.filter(([m, v]) => m === "=filter" && String(v).startsWith("blur"));
    expect(filtros(pintar(g, 3.2)).length).toBeGreaterThan(0);
    expect(filtros(pintar(g, 3.0))).toEqual([]);
  });

  it("acabada la transición sólo queda la nueva", () => {
    const g = guionDe([escena("a", "#112233"), escena("b", "#445566", { transicion: { tipo: "cortina", dur: 0.4 } })]);
    expect(rellenos(pintar(g, 4))).not.toContain("#112233");
  });
});

describe("fondos vivos, cámara y viñeta", () => {
  it("malla, rayos y foco se mueven con el tiempo y son deterministas", () => {
    for (const tipo of ["malla", "rayos", "foco"]) {
      const g = guionDe([escena("a", "oscuro", { fondo: { tipo, color: "oscuro", color2: "acento" } })]);
      expect(pintar(g, 0.5)).toEqual(pintar(g, 0.5));
      expect(pintar(g, 0.5)).not.toEqual(pintar(g, 1.5));
    }
  });

  it("la cámara va a velocidad constante y sin ella no hay nada", () => {
    const m = { desde: 0, hasta: 2 };
    expect(camaraEn("ninguna", m, 1)).toBeNull();
    expect(camaraEn("acercar", m, 0).escala).toBeCloseTo(1);
    expect(camaraEn("acercar", m, 1).escala).toBeCloseTo(1.03);
    expect(camaraEn("acercar", m, 2).escala).toBeCloseTo(1.06);
    expect(camaraEn("alejar", m, 2).escala).toBeCloseTo(1);
    expect(camaraEn("deriva", m, 0, 1000).dx).toBeCloseTo(-25);
  });

  it("la viñeta pone un degradado radial encima; sin viñeta, no", () => {
    const radiales = (log) => log.filter(([m]) => m === "createRadialGradient").length;
    const sin = guionDe([escena("a", "oscuro")]);
    const con = guionDe([escena("a", "oscuro")], { vineta: 0.5 });
    expect(radiales(pintar(con, 1))).toBe(radiales(pintar(sin, 1)) + 1);
  });

  it("conAlfa pasa un hex a rgba y deja lo demás", () => {
    expect(conAlfa("#FF0080", 0.5)).toBe("rgba(255, 0, 128, 0.5)");
    expect(conAlfa("rojo", 0.5)).toBe("rojo");
  });
});

describe("letra cinética y resalte", () => {
  const momento = { desde: 1, hasta: 3 };
  it("látigo entra de lado y se asienta; desenfoque va de borroso a nítido; la máscara de una capa sube desde abajo", () => {
    const l0 = estadoDeCapa({ tipo: "icono", animacion: { entrada: "latigo" } }, momento, 1.01, { lado: 1000 });
    const l1 = estadoDeCapa({ tipo: "icono", animacion: { entrada: "latigo" } }, momento, 2.5, { lado: 1000 });
    expect(l0.dx).toBeLessThan(-300);
    expect(Math.abs(l1.dx)).toBeLessThan(1);
    const d0 = estadoDeCapa({ tipo: "icono", animacion: { entrada: "desenfoque" } }, momento, 1.05, { lado: 1000 });
    const d1 = estadoDeCapa({ tipo: "icono", animacion: { entrada: "desenfoque" } }, momento, 2.5, { lado: 1000 });
    expect(d0.desenfoque).toBeGreaterThan(10);
    expect(d1.desenfoque).toBeLessThan(0.5);
    expect(estadoDeCapa({ tipo: "icono", animacion: { entrada: "mascara" } }, momento, 1, {}).mascara).toBeCloseTo(1);
    expect(estadoDeCapa({ tipo: "icono", animacion: { entrada: "mascara" } }, momento, 2.5, {}).mascara).toBeCloseTo(0, 2);
  });

  it("un texto escalonado enseña sus palabras una tras otra", () => {
    const g = guionDe([escena("a", "oscuro", { capas: [
      { tipo: "texto", id: "t", texto: "uno dos tres cuatro", animacion: { entrada: "escalonado" } },
    ] })]);
    const palabras = (t) => pintar(g, t).filter(([m]) => m === "fillText").length;
    expect(palabras(0.07)).toBeLessThan(palabras(1));
    expect(palabras(1)).toBe(4);
  });

  it("el marcador se pinta detrás de la palabra de énfasis y la vuelve a escribir encima", () => {
    const g = guionDe([escena("a", "#141414", { capas: [
      { tipo: "texto", id: "t", texto: "Así de *rápido*", resalte: "marcador", color: "claro" },
    ] })], { paleta: { acento: "#D91B19", claro: "#FFFFFF", oscuro: "#0E0E0E" } });
    const log = pintar(g, 2);
    expect(log.filter(([m, t]) => m === "fillText" && t === "rápido").length).toBe(2);
    expect(rellenos(log)).toContain("#D91B19");
  });

  it("el acento que casi no se distingue del fondo pasa al claro u oscuro que contrasta", () => {
    const c = { colorFondo: "#D91B19", paleta: { claro: "#FFFFFF", oscuro: "#0E0E0E" } };
    expect(["#FFFFFF", "#0E0E0E"]).toContain(visibleSobreElFondo("#D91B19", c));
    expect(visibleSobreElFondo("#D91B19", { ...c, colorFondo: "#F2EDE4" })).toBe("#D91B19");
  });
});

describe("el impacto", () => {
  it("un golpe o un glitch suenan a impacto en el destello; las demás que se mueven, a whoosh", () => {
    const g = guionDe([
      escena("a", "fondo"),
      escena("b", "oscuro", { transicion: { tipo: "golpe", dur: 0.34 } }),
      escena("c", "fondo", { transicion: { tipo: "empuje", dur: 0.4 } }),
      escena("d", "oscuro", { transicion: { tipo: "glitch", dur: 0.26 } }),
    ]);
    const linea = lineaDeTiempo(g);
    // El golpe lleva además su subida y su grave (CAPAS_DEL_GOLPE): aquí se mira lo de cada transición.
    const lista = colocadosAutomaticos(g, linea).filter((c) => c.escena && !c.capa);
    // Cada una de su familia (la primera vez, su variante más suya): el golpe, un impacto; el empuje, un barrido grave;
    // el glitch, un tartamudeo digital.
    expect(lista.map((x) => x.sonido)).toEqual([SONIDOS_DE_TRANSICION.golpe[0], SONIDOS_DE_TRANSICION.empuje[0], SONIDOS_DE_TRANSICION.glitch[0]]);
    expect(lista[0].sonido).toBe(EFECTO_AUTOMATICO.impacto);
    expect(lista[0].volumen).toBe(REALCE_IMPACTO);
    expect(lista[2].volumen).toBe(REALCE_IMPACTO);
    // El impacto es un golpe: empieza (por su arranque) en el destello, la mitad de la transición.
    const deImpacto = new Set([...SONIDOS_DE_TRANSICION.golpe, ...SONIDOS_DE_TRANSICION.glitch]);
    const { momentos } = momentosColocados(lista, g, linea, (c) => ({ papel: deImpacto.has(c.sonido) ? "golpe" : "transicion", pico: 0, nombre: "x" }));
    expect(momentos[0].en).toBeCloseTo(3.17, 2);
    expect(momentos[2].en).toBeCloseTo(9.13, 2);
  });

  it("se sintetiza igual cada vez, con el pico en 1 y lo que dura", () => {
    const a = sintetizar("impacto", 48000);
    expect(a.length).toBe(Math.round(DURACION_EFECTO.impacto * 48000));
    expect(Math.max(...a.map(Math.abs))).toBeCloseTo(1);
    expect(Array.from(sintetizar("impacto", 48000))).toEqual(Array.from(a));
  });
});
