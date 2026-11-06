import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validarGuion, lineaDeTiempo, ENTRADAS } from "./videoEscenas.js";
import { dibujarFrame, estadoDeCapa, paletaDelKit, FILTRO_BYN, DURACION_GOLPE, esTextoRico, cajasDeEscena } from "./motorVideo.js";
import {
  partirEnfasis, sinMarcas, tieneEnfasis, lineasGigantes, tiemposDePalabras, impactoDe, FUENTE_CASA, FUENTE_IMPACTO,
  ARCHIVO_FUENTE_CASA, PESO_CASA,
} from "./motorTexto.js";
import { revisarEscenas } from "./revisionEscenas.js";
import { EJEMPLO_GUION } from "./videoFormatoIA.js";

// ============================================================
// El texto CON CARÁCTER del video animado: énfasis, mayúsculas, el rol gigante, palabra por palabra, la entrada
// «golpe», la letra de la casa y el blanco y negro de una imagen. Lo nuevo es OPCIONAL: un guion de antes valida y se
// dibuja exactamente igual.
// ============================================================

/** Un contexto 2D de mentira que apunta cada llamada y mide cada letra al 55 % de su tamaño (como el del motor). */
function lienzo() {
  const log = [];
  const estado = { font: "10px x", fillStyle: "#000000", filter: "none" };
  const tam = () => Number(/(\d+)px/.exec(estado.font)?.[1] ?? 10);
  const metodos = {
    measureText: (t) => ({ width: String(t).length * tam() * 0.55 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    fillText: (t, ...a) => log.push(["fillText", t, estado.font, estado.fillStyle, ...a]),
  };
  return {
    log,
    ctx: new Proxy({}, {
      get(_, k) {
        if (k in metodos) return metodos[k];
        if (k in estado) return estado[k];
        return (...args) => log.push([k, ...args]);
      },
      set(_, k, v) { estado[k] = v; log.push([`=${String(k)}`, v]); return true; },
    }),
  };
}

const copia = (x) => JSON.parse(JSON.stringify(x));
const conCapa = (capa, extra = {}) => {
  const g = copia(EJEMPLO_GUION);
  g.escenas[0].capas = [capa];
  Object.assign(g.escenas[0], extra);
  const v = validarGuion(g);
  expect(v.errores).toEqual([]);
  return v.guion;
};
const pintar = (guion, t, extra = {}) => {
  const { ctx, log } = lienzo();
  dibujarFrame(ctx, { guion, linea: lineaDeTiempo(guion), t, ...extra });
  return log;
};
const textos = (log) => log.filter(([m]) => m === "fillText");

describe("las marcas de énfasis y las palabras", () => {
  it("lo que va entre asteriscos lleva énfasis; un asterisco suelto se queda como letra", () => {
    expect(partirEnfasis("LAS MANOS *MÁS BELLAS* DE LA HISTORIA")).toEqual([
      { texto: "LAS", enfasis: false }, { texto: "MANOS", enfasis: false }, { texto: "MÁS", enfasis: true },
      { texto: "BELLAS", enfasis: true }, { texto: "DE", enfasis: false }, { texto: "LA", enfasis: false }, { texto: "HISTORIA", enfasis: false },
    ]);
    expect(partirEnfasis("Envío gratis*")).toEqual([{ texto: "Envío", enfasis: false }, { texto: "gratis*", enfasis: false }]);
    expect(partirEnfasis("hola *mundo*", { mayusculas: true }).map((p) => p.texto)).toEqual(["HOLA", "MUNDO"]);
    expect(sinMarcas("las *manos* bellas")).toBe("las manos bellas");
    expect(tieneEnfasis("Envío gratis*")).toBe(false);
  });

  it("el gigante va de una o dos palabras por línea: las cortas con la siguiente y el énfasis en su línea", () => {
    const lineas = (t) => { const p = partirEnfasis(t, { mayusculas: true }); return lineasGigantes(p).map(([a, b]) => p.slice(a, b).map((x) => x.texto).join(" ")); };
    expect(lineas("Las manos *más bellas* de la historia")).toEqual(["LAS MANOS", "MÁS BELLAS", "DE LA HISTORIA"]);
    expect(lineas("Que Cristo vive en mí")).toEqual(["QUE CRISTO", "VIVE EN MÍ"]);
  });

  it("cada palabra del texto se casa con la que se dice; la que no se dice sale con la anterior", () => {
    const habla = [{ texto: "Las", desde: 1 }, { texto: "manos", desde: 1.3 }, { texto: "más", desde: 1.6 }, { texto: "bellas", desde: 2 }];
    expect(tiemposDePalabras(["LAS", "MANOS", "MAS", "BELLAS"], habla)).toEqual([1, 1.3, 1.6, 2]);
    expect(tiemposDePalabras(["3", "errores"], [{ texto: "tres", desde: 1 }, { texto: "errores", desde: 1.3 }])).toEqual([1.3, 1.3]);
    expect(tiemposDePalabras(["nada"], [])).toEqual([null]);
  });
});

describe("la validación: todo lo nuevo es opcional", () => {
  it("un guion de antes valida EXACTAMENTE igual (no se le añade ningún campo)", () => {
    const v = validarGuion(copia(EJEMPLO_GUION));
    expect(JSON.stringify(v.guion)).not.toMatch(/mayusculas|porPalabra|tratamiento|"pide"/);
    expect(validarGuion(v.guion).guion).toEqual(v.guion);
  });

  it("«golpe» va al FINAL de las entradas (el orden de las de antes no cambia)", () => {
    expect(ENTRADAS.at(-1)).toBe("golpe");
    expect(ENTRADAS.slice(0, 9)).toEqual(["aparece", "fundido", "sube", "baja", "escala", "rebote", "escribe", "barrido", "dibuja"]);
  });

  it("los asteriscos no cuentan en el largo del texto; gigante, mayúsculas y palabra por palabra se aceptan", () => {
    const largo = `*${"a".repeat(79)}*`;
    const g = conCapa({ tipo: "texto", id: "t", texto: largo, rol: "gigante", mayusculas: true, porPalabra: true, animacion: { entrada: "golpe" } });
    expect(g.escenas[0].capas[0]).toMatchObject({ rol: "gigante", mayusculas: true, porPalabra: true, animacion: { entrada: "golpe" } });
  });

  it("un fondo por crear: imagen a sangre con «pide» y sin archivo; sin las dos cosas, falta el archivo", () => {
    const g = conCapa({ tipo: "imagen", id: "f", encuadre: "completo", pide: "Un grabado de unas manos", oscurecer: 0.4, tratamiento: "byn" });
    expect(g.escenas[0].capas[0]).toMatchObject({ pide: "Un grabado de unas manos", tratamiento: "byn" });
    const enCaja = copia(EJEMPLO_GUION);
    enCaja.escenas[0].capas = [{ tipo: "imagen", id: "f", pide: "Algo" }];
    expect(validarGuion(enCaja).errores.map((e) => e.donde)).toContain("escenas[0].capas[0].pide");
    const nada = copia(EJEMPLO_GUION);
    nada.escenas[0].capas = [{ tipo: "imagen", id: "f" }];
    expect(validarGuion(nada).errores).toContainEqual({ donde: "escenas[0].capas[0].archivo", mensaje: "Falta y es obligatorio." });
  });
});

describe("el motor", () => {
  it("el gigante: en mayúsculas, una línea por grupo, con la letra de la casa (sin letra en el kit)", () => {
    const g = conCapa({ tipo: "texto", id: "t", texto: "Las manos *más bellas* de la historia", rol: "gigante" });
    // (los subtítulos van aparte: con su letra, no con la de la casa)
    const t = textos(pintar(g, 0.5)).filter((x) => x[2].includes(`"${FUENTE_CASA}"`));
    expect(t.map((x) => x[1])).toEqual(["LAS", "MANOS", "MÁS", "BELLAS", "DE", "LA", "HISTORIA"]);
    expect(t.every((x) => x[2].startsWith(`${PESO_CASA} `))).toBe(true);
    // Cada línea a su tamaño: «DE LA HISTORIA» (más letras) sale más pequeña que «LAS MANOS».
    const tam = (x) => Number(/(\d+)px/.exec(x[2])[1]);
    expect(tam(t[6])).toBeLessThan(tam(t[0]));
  });

  it("con letra del kit, manda la del kit", () => {
    const g = conCapa({ tipo: "texto", id: "t", texto: "Gloria *eterna*", rol: "gigante" });
    const t = textos(pintar(g, 0.5, { fuentes: { titular: "\"MarcaX\", Roboto, sans-serif" } }));
    expect(t.every((x) => x[2].includes("MarcaX") && !x[2].includes(FUENTE_CASA))).toBe(true);
    expect(impactoDe("")).toEqual({ familia: FUENTE_IMPACTO, peso: PESO_CASA });
  });

  it("el énfasis: más grande y en el color de acento", () => {
    const paleta = paletaDelKit([{ hex: "#000000", rol: "fondo" }, { hex: "#D19E03", rol: "acento dorado" }, { hex: "#FFFFFF", rol: "texto" }]);
    const g = conCapa({ tipo: "texto", id: "t", texto: "Las manos *bellas*", rol: "titular" });
    const t = textos(pintar(g, 0.5, { paleta }));
    const bellas = t.find((x) => x[1] === "bellas");
    const manos = t.find((x) => x[1] === "manos");
    expect(bellas[3]).toBe(paleta.acento);
    expect(manos[3]).toBe(paleta.texto);
    expect(Number(/(\d+)px/.exec(bellas[2])[1])).toBeGreaterThan(Number(/(\d+)px/.exec(manos[2])[1]));
  });

  it("palabra por palabra: cada palabra aparece cuando se dice", () => {
    const g = conCapa({ tipo: "texto", id: "t", texto: "Sabías que casi todos", rol: "titular", porPalabra: true, animacion: { entrada: "golpe" } });
    const linea = lineaDeTiempo(g);
    const dichas = linea.escenas[0].palabras;
    const dicha = (p) => dichas.find((x) => x.texto.toLowerCase().startsWith(p)).desde;
    const en = (t) => textos(pintar(g, t)).map((x) => x[1]).filter((x) => ["Sabías", "que", "casi", "todos"].includes(x));
    expect(en(dicha("que") + 0.01)).toEqual(["Sabías", "que"]);
    expect(en(dicha("todos") + 0.01)).toEqual(["Sabías", "que", "casi", "todos"]);
  });

  it("la entrada «golpe»: entera desde el primer cuadro, de 1,15 a 1 y sin rebote", () => {
    const capa = { animacion: { entrada: "golpe" } };
    expect(estadoDeCapa(capa, { desde: 0, hasta: 5 }, 0)).toMatchObject({ alfa: 1, escala: 1.15 });
    expect(estadoDeCapa(capa, { desde: 0, hasta: 5 }, DURACION_GOLPE).escala).toBeCloseTo(1, 5);
    expect(estadoDeCapa(capa, { desde: 0, hasta: 5 }, 1).escala).toBe(1);
  });

  it("una imagen en blanco y negro pone el filtro del lienzo y lo quita después", () => {
    const g = conCapa({ tipo: "imagen", id: "f", archivo: "img1", encuadre: "completo", recorte: "cubrir", tratamiento: "byn" });
    const img = { width: 1000, height: 1600 };
    const log = pintar(g, 0.5, { recursos: { imagen: () => img } });
    const filtros = log.filter(([m]) => m === "=filter").map(([, v]) => v);
    expect(filtros).toContain(FILTRO_BYN);
    expect(filtros.at(-1)).toBe("none");
  });

  it("un fondo por crear no dibuja nada (se ve el fondo de la escena) ni sale como marcador", () => {
    const g = conCapa({ tipo: "imagen", id: "f", encuadre: "completo", pide: "Un grabado", oscurecer: 0.4 });
    const log = pintar(g, 0.5);
    expect(log.some(([m]) => m === "drawImage")).toBe(false);
    expect(textos(log).map((x) => x[1])).not.toContain("Imagen");
  });

  it("sólo va por el camino nuevo lo que lo pide: un titular de antes se dibuja como siempre", () => {
    expect(esTextoRico({ tipo: "texto", texto: "Hola", rol: "titular" })).toBe(false);
    expect(esTextoRico({ tipo: "texto", texto: "Hola *ya*", rol: "titular" })).toBe(true);
    expect(esTextoRico({ tipo: "texto", texto: "Hola", rol: "gigante" })).toBe(true);
  });

  it("el gigante llena el ancho de su caja y la revisión no lo da por partido", () => {
    const g = conCapa({ tipo: "texto", id: "t", texto: "Las manos más bellas de la historia", rol: "gigante" });
    const { ctx } = lienzo();
    const [caja] = cajasDeEscena(ctx, { guion: g, linea: lineaDeTiempo(g), indice: 0 });
    expect(caja.w / caja.escala).toBeGreaterThan(1080 * 0.8);
    const problemas = revisarEscenas(lienzo().ctx, { guion: g, linea: lineaDeTiempo(g), formato: "9:16" });
    expect(problemas.map((p) => p.tipo)).not.toContain("texto_se_parte");
    expect(problemas.filter((p) => p.grave)).toEqual([]);
  });
});

describe("la letra de la casa es la MISMA en la vista previa y en el render", () => {
  const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), "utf8");

  it("el navegador la carga del archivo que dice el motor, con el nombre que dice el motor", () => {
    const nav = leer("./motorVideoNavegador.js");
    expect(nav).toContain(`"${ARCHIVO_FUENTE_CASA}?url"`);
    expect(nav).toMatch(/new FontFace\(FUENTE_CASA/);
  });

  it("el Container la registra del mismo archivo y con el mismo nombre", () => {
    const cont = leer("../../container/recursos.mjs");
    expect(cont).toMatch(/resolve\(ARCHIVO_FUENTE_CASA\)/);
    expect(cont).toMatch(/registerFromPath\([^)]*FUENTE_CASA\)/);
  });

  it("los dos package.json piden la misma versión del paquete de la letra", () => {
    const raiz = JSON.parse(leer("../../package.json"));
    const cont = JSON.parse(leer("../../container/package.json"));
    const v = raiz.dependencies?.["@fontsource/anton"];
    expect(v).toBeTruthy();
    expect(cont.dependencies?.["@fontsource/anton"]).toBe(v);
  });
});
