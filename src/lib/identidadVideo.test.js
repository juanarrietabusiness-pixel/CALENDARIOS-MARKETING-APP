import { describe, it, expect } from "vitest";
import {
  limpiarIdentidad, conSubtitulosDeIdentidad, paletaDeIdentidad, musicaQueToca, estiloDeMarcaDelKit, resumenDeIdentidad,
  subtitulosEnMayusculas, ESTILOS_SUBTITULO, ESTILOS_SUBTITULOS, MOMENTOS_EFECTO, IDS_MOMENTO,
} from "./identidadVideo.js";
import { colocadosAutomaticos, SONIDOS_DE_TRANSICION } from "./efectosColocados.js";
import { limpiarSonido } from "./sonidoVideo.js";
import { validarGuion, lineaDeTiempo } from "./videoEscenas.js";
import { dibujarFrame } from "./motorVideo.js";
import { gruposDeSubtitulos } from "./subtitulos.js";
import { limpiarKit } from "./kitMarca.js";

// ============================================================
// La identidad de video de un cliente
//
// Lo que importa:
//   1. Se guarda sólo lo que se entiende (ids con su forma, topes) y un kit de antes sigue igual.
//   2. Al crear un video: los subtítulos de la identidad, una música de SU lista (la que no sonó hace poco) y sus
//      efectos por momento rotando en los automáticos; lo que no tiene, como siempre.
//   3. Los cuatro estilos de subtítulos se dibujan distinto, y el «clásico» es exactamente el de antes.
// ============================================================

describe("la identidad, limpia", () => {
  it("guarda lo que se entiende y quita lo que no", () => {
    const i = limpiarIdentidad({
      estiloId: "ev-abc123", musicas: ["m1", { id: "m2", de: "agencia", nombre: "Cálida" }, "m1", "mal id!"],
      efectos: { transicion: ["swipe-glide", "MAL", "swish-soft"], otro: ["x"], sello: [] },
      subtitulos: { estilo: "placa", pos: "centro", maxPalabras: 9, acento: "acento", mayusculas: false },
      basura: 1,
    });
    expect(i).toEqual({
      estiloId: "ev-abc123",
      musicas: [{ id: "m1" }, { id: "m2", de: "agencia", nombre: "Cálida" }],
      efectos: { transicion: ["swipe-glide", "swish-soft"] },
      subtitulos: { estilo: "placa", pos: "centro", acento: "acento", mayusculas: false },
    });
    expect(limpiarIdentidad({})).toBeNull();
    expect(limpiarIdentidad(null)).toBeNull();
  });

  it("los estilos de subtítulos son los que valida el guion, y cada momento tiene su nombre", () => {
    expect(Object.keys(ESTILOS_SUBTITULO)).toEqual([...ESTILOS_SUBTITULOS]);
    for (const k of IDS_MOMENTO) expect(MOMENTOS_EFECTO[k].nombre).toBeTruthy();
  });

  it("va en el kit y un kit sin ella sale igual que antes", () => {
    const sin = limpiarKit({ estilo: "cálido" });
    expect(sin.identidadVideo).toBeUndefined();
    const con = limpiarKit({ estilo: "cálido", identidadVideo: { subtitulos: { estilo: "limpio" } } });
    expect(con.identidadVideo).toEqual({ subtitulos: { estilo: "limpio" } });
  });

  it("se dice en frases", () => {
    const r = resumenDeIdentidad({ estiloId: "ev-abc123", musicas: ["m1"], subtitulos: { estilo: "palabra" } }, { estilos: [{ id: "ev-abc123", nombre: "Marca personal" }], pistas: [{ id: "m1", nombre: "Mañana" }] });
    expect(r.join(" ")).toMatch(/Estilo de la marca: «Marca personal»/);
    expect(r.join(" ")).toMatch(/«Mañana» \[m1\]/);
    expect(r.join(" ")).toMatch(/Subtítulos: palabra a palabra/);
  });
});

describe("lo que toma un video nuevo", () => {
  it("los subtítulos de la identidad, sin encenderlos ni apagarlos", () => {
    const guion = { subtitulos: { activo: false, pos: "abajo", maxPalabras: 4 } };
    const r = conSubtitulosDeIdentidad(guion, { subtitulos: { estilo: "limpio", pos: "arriba" } });
    expect(r.cambio).toBe(true);
    expect(r.guion.subtitulos).toEqual({ activo: false, pos: "arriba", maxPalabras: 4, estilo: "limpio" });
    expect(conSubtitulosDeIdentidad(guion, null)).toEqual({ guion, cambio: false });
  });

  it("la música que no sonó en los últimos videos; si sonaron todas, la que hace más", () => {
    const identidad = { musicas: ["a", "b", "c"] };
    expect(musicaQueToca(identidad, []).id).toBe("a");
    expect(musicaQueToca(identidad, ["a", "x"]).id).toBe("b");
    expect(musicaQueToca(identidad, ["c", "a", "b"]).id).toBe("b");
    expect(musicaQueToca({}, ["a"])).toBeNull();
  });

  it("el estilo de la marca sólo si está guardado y encaja con el uso", () => {
    const estilo = (id, para) => ({ id, nombre: id, para, texto: { rol: "titular" } });
    const kit = { identidadVideo: { estiloId: "ev-voz001" }, estilosVideo: [estilo("ev-voz001", "voz"), estilo("ev-todo01", "todos")] };
    expect(estiloDeMarcaDelKit(kit, "voz")?.id).toBe("ev-voz001");
    expect(estiloDeMarcaDelKit(kit, "cancion")).toBeNull();
    expect(estiloDeMarcaDelKit({ ...kit, identidadVideo: { estiloId: "ev-todo01" } }, "cancion")?.id).toBe("ev-todo01");
    expect(estiloDeMarcaDelKit({ ...kit, identidadVideo: { estiloId: "ev-borrado" } }, "voz")).toBeNull();
  });

  it("el sonido guarda la paleta de efectos y los automáticos la usan, rotando; lo demás suena como siempre", () => {
    const efectosMarca = paletaDeIdentidad({ efectos: { transicion: ["swipe-glide", "swish-soft"], sello: ["ui_pop-soft"] } });
    expect(limpiarSonido({ efectosMarca }).efectosMarca).toEqual(efectosMarca);
    expect(limpiarSonido({}).efectosMarca).toBeUndefined();
    const guion = validarGuion({
      escenas: ["a", "b", "c", "d"].map((id, i) => ({
        id, tipo: "explicacion", habla: "Una frase corta para la escena.", transicion: { tipo: i % 2 ? "deslizar" : "zoom", dur: 0.4 },
        capas: i === 1 ? [{ tipo: "sello", id: "s", texto: "Nuevo", entra: { palabra: 1 } }] : [],
      })),
    }).guion;
    const linea = lineaDeTiempo(guion);
    const suyos = colocadosAutomaticos(guion, linea, {}, efectosMarca);
    const transiciones = suyos.filter((x) => x.escena && !x.capa).map((x) => x.sonido);
    expect(transiciones).toEqual(["swipe-glide", "swish-soft", "swipe-glide"]);
    expect(suyos.find((x) => x.capa === "s")?.sonido).toBe("ui_pop-soft");
    // Sin paleta, los de siempre (los de cada tipo de transición).
    const deSiempre = colocadosAutomaticos(guion, linea, {}).filter((x) => x.escena && !x.capa).map((x) => x.sonido);
    expect(deSiempre[0]).toBe(SONIDOS_DE_TRANSICION.deslizar[0]);
  });
});

/** El lienzo de mentira de los tests del motor: apunta cada llamada y cada propiedad. */
function lienzo() {
  const log = [];
  const estado = { font: "10px x" };
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
        return (...args) => log.push([k, ...args]);
      },
      set(_, k, v) { estado[k] = v; log.push([`=${String(k)}`, v]); return true; },
    }),
  };
}

describe("los estilos de subtítulos", () => {
  const habla = "Así se leen los subtítulos de tus videos";
  const pintar = (sub) => {
    const guion = validarGuion({ subtitulos: { activo: true, ...sub }, escenas: [{ id: "e1", tipo: "gancho", habla, fondo: { tipo: "solido", color: "fondo" }, capas: [] }] }).guion;
    const linea = lineaDeTiempo(guion);
    const g = gruposDeSubtitulos(linea, { maxPalabras: guion.subtitulos.maxPalabras, maxCaracteres: guion.subtitulos.maxCaracteres })[0];
    const { ctx, log } = lienzo();
    dibujarFrame(ctx, { guion, linea, t: g.palabras[1].desde + 0.02, formato: "9:16" });
    return { log, g, escrito: log.filter((x) => x[0] === "fillText").map((x) => x[1]) };
  };

  it("el clásico es el de antes: el grupo en mayúsculas con borde", () => {
    const { log, g, escrito } = pintar({});
    expect(escrito).toEqual(g.palabras.map((p) => p.texto.toUpperCase()));
    expect(log.filter((x) => x[0] === "strokeText")).toHaveLength(g.palabras.length);
    expect(log.some((x) => x[0] === "roundRect")).toBe(false);
  });

  it("palabra a palabra: sólo la que se dice", () => {
    const { g, escrito } = pintar({ estilo: "palabra" });
    expect(escrito).toEqual([g.palabras[1].texto.toUpperCase()]);
  });

  it("sobre placa: una placa redondeada y sin borde en las letras", () => {
    const { log, g, escrito } = pintar({ estilo: "placa" });
    expect(escrito).toHaveLength(g.palabras.length);
    expect(log.some((x) => x[0] === "roundRect")).toBe(true);
    expect(log.some((x) => x[0] === "strokeText")).toBe(false);
  });

  it("limpio: como se escribe, sin borde y con sombra; las mayúsculas se pueden pedir", () => {
    const { log, g, escrito } = pintar({ estilo: "limpio" });
    expect(escrito).toEqual(g.palabras.map((p) => p.texto));
    expect(log.some((x) => x[0] === "strokeText")).toBe(false);
    expect(log.some((x) => x[0] === "=shadowBlur")).toBe(true);
    expect(pintar({ estilo: "limpio", mayusculas: true }).escrito).toEqual(g.palabras.map((p) => p.texto.toUpperCase()));
    expect(subtitulosEnMayusculas({ estilo: "limpio" })).toBe(false);
    expect(subtitulosEnMayusculas({ estilo: "placa" })).toBe(true);
  });

  it("un estilo que no existe no valida", () => {
    expect(validarGuion({ subtitulos: { estilo: "neón" }, escenas: [{ id: "e1", tipo: "gancho", habla }] }).ok).toBe(false);
  });
});
