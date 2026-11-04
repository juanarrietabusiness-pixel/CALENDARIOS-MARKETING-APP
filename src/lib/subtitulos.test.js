import { describe, it, expect } from "vitest";
import { validarGuion, lineaDeTiempo, palabrasDe, textoDeLocucion, tramoDeAudio, palabrasMudas } from "./videoEscenas.js";
import { gruposDeSubtitulos, grupoEn, estadoDePalabras, palabraClave, textoDeSubtitulo, COLA_GRUPO } from "./subtitulos.js";
import { dibujarFrame, bandaDeSubtitulos, encajarSubtitulo } from "./motorVideo.js";

// ============================================================
// Los subtítulos por palabra y la voz de la vista previa
//
//   · los grupos no pasan de 4 palabras ni de 22 letras, y no cruzan una frase ni una escena;
//   · la palabra clave es un número si lo hay; si no, la más larga que no sea de relleno;
//   · dentro del grupo: lo dicho, lo que se dice (con su salto) y lo que falta;
//   · el motor los dibuja en su franja, la clave en el acento, lo que falta atenuado, y nada en un silencio;
//   · la vista previa sabe qué segundo del audio suena en cada instante del video, con los silencios insertados;
//   · las palabras que la voz no dijo (sin duración al final) se detectan.
// ============================================================

const guion = (extra = {}) => validarGuion({
  subtitulos: { activo: true, maxPalabras: 4, maxCaracteres: 22, acento: "#E8C77F" },
  escenas: [
    { id: "e1", tipo: "gancho", habla: "[curiosa] ¿Y si tus lentes estuvieran listos en 40 minutos?", pausa: 0.8, capas: [{ tipo: "texto", texto: "40", pos: "centro" }] },
    { id: "e2", tipo: "pasos", habla: "Primero, un examen visual computarizado, gratis con tu compra.", capas: [{ tipo: "texto", texto: "Examen", pos: "arriba" }] },
  ],
  ...extra,
}).guion;

/** Tiempos de voz «reales»: una palabra cada 0,4 s, empezando en 0,1. */
const voz = (g) => palabrasDe(textoDeLocucion(g)).map((_, i) => ({ desde: 0.1 + i * 0.4, hasta: 0.1 + i * 0.4 + 0.3 }));

describe("los grupos de subtítulos", () => {
  it("hasta 4 palabras y 22 letras, sin cruzar una frase ni una escena", () => {
    const g = guion();
    const grupos = gruposDeSubtitulos(lineaDeTiempo(g, voz(g)));
    for (const x of grupos) {
      expect(x.palabras.length).toBeLessThanOrEqual(4);
      expect(x.palabras.map((p) => p.texto).join(" ").length).toBeLessThanOrEqual(22);
    }
    // «minutos?» cierra su grupo: «Primero» empieza otro (y otra escena).
    const conMinutos = grupos.find((x) => x.palabras.some((p) => p.texto === "minutos?"));
    expect(conMinutos.palabras.at(-1).texto).toBe("minutos?");
    expect(grupos[grupos.indexOf(conMinutos) + 1].palabras[0].texto).toBe("Primero");
    expect(grupos[grupos.indexOf(conMinutos) + 1].escena).toBe(1);
    // Las etiquetas de emoción no salen; las comas y los puntos tampoco.
    expect(grupos.flatMap((x) => x.palabras.map((p) => p.texto))).not.toContain("[curiosa]");
    expect(grupos.flatMap((x) => x.palabras.map((p) => p.texto))).toContain("computarizado");
  });

  it("la palabra clave: un número; si no, la más larga que no sea de relleno", () => {
    expect(palabraClave(["en", "40", "minutos?"])).toBe(1);
    expect(palabraClave(["un", "examen", "computarizado"])).toBe(2);
    expect(palabraClave(["viendo", "nítido"])).toBe(1); // a igualdad, la de después
    expect(palabraClave(["con", "tu"])).toBe(-1);
    expect(textoDeSubtitulo("compra.")).toBe("compra");
    expect(textoDeSubtitulo("¿Y")).toBe("¿Y");
    expect(textoDeSubtitulo("«hola»,")).toBe("hola");
  });

  it("se ve desde su primera palabra y se apaga tras la última si no viene otro enseguida", () => {
    const g = guion();
    const linea = lineaDeTiempo(g, voz(g));
    const grupos = gruposDeSubtitulos(linea);
    const primero = grupos[0];
    expect(grupoEn(grupos, primero.desde - 0.01)).toBeNull();
    expect(grupoEn(grupos, primero.desde)).toBe(primero);
    // Antes del silencio de 0,8 s de la primera escena el último grupo se apaga a los COLA_GRUPO segundos.
    const ultimoE1 = grupos.filter((x) => x.escena === 0).at(-1);
    expect(ultimoE1.hasta).toBeCloseTo(ultimoE1.palabras.at(-1).hasta + COLA_GRUPO, 5);
    expect(grupoEn(grupos, ultimoE1.hasta + 0.05)).toBeNull();
  });

  it("dentro del grupo: lo dicho, lo que se dice con su salto y lo que falta", () => {
    const grupo = { palabras: [{ desde: 1, hasta: 1.3 }, { desde: 1.4, hasta: 1.7 }, { desde: 1.8, hasta: 2 }] };
    expect(estadoDePalabras(grupo, 1.45).map((e) => e.estado)).toEqual(["dicha", "diciendo", "falta"]);
    expect(estadoDePalabras(grupo, 1.45)[1].salto).toBeGreaterThan(0);
    expect(estadoDePalabras(grupo, 1.6)[1].salto).toBe(1);
  });
});

/** Un contexto 2D de mentira que apunta los textos con el color con que se rellenan y la transparencia. */
function lienzo() {
  const log = [];
  const estado = { font: "10px x", fillStyle: "", globalAlpha: 1, ox: 0, oy: 0 };
  const pila = [];
  const tam = () => Number(/(\d+)px/.exec(estado.font)?.[1] ?? 10);
  const metodos = {
    measureText: (t) => ({ width: String(t).length * tam() * 0.55 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    save: () => pila.push({ ...estado }),
    restore: () => Object.assign(estado, pila.pop() ?? {}),
    translate: (x, y) => { estado.ox += x; estado.oy += y; },
    setTransform: () => {},
    fillText: (t, x, y) => log.push({ t, color: estado.fillStyle, alfa: estado.globalAlpha, font: estado.font, x: x + estado.ox, y: y + estado.oy }),
  };
  return {
    log,
    ctx: new Proxy({}, {
      get(_, k) { if (k in metodos) return metodos[k]; if (k in estado) return estado[k]; return () => {}; },
      set(_, k, v) { estado[k] = v; return true; },
    }),
  };
}

describe("el motor dibuja los subtítulos", () => {
  const g = guion();
  const linea = lineaDeTiempo(g, voz(g));
  const grupos = gruposDeSubtitulos(linea);
  const pintar = (t, gg = g, l = linea) => { const { ctx, log } = lienzo(); dibujarFrame(ctx, { guion: gg, linea: l, t }); return log; };
  const enLaFranja = (log) => { const b = bandaDeSubtitulos("9:16", 1080, 1920, "abajo"); return log.filter((x) => x.y >= b.y && x.y <= b.y + b.h); };

  it("en su franja, en mayúsculas, con la palabra clave en el acento y lo que falta atenuado", () => {
    // «¿Y si tus lentes»: diciendo la primera, las demás faltan (atenuadas); la clave es «lentes».
    const grupo = grupos[0];
    const sub = enLaFranja(pintar(grupo.palabras[0].desde + 0.15));
    const textos = sub.map((x) => x.t);
    for (const p of grupo.palabras) expect(textos).toContain(p.texto.toUpperCase());
    expect(sub.find((x) => x.t === "¿Y").alfa).toBe(1);
    const lentes = sub.find((x) => x.t === "LENTES");
    expect(lentes.color).toBe("#E8C77F");
    expect(lentes.alfa).toBeLessThan(1);
    // «40 minutos?»: el número es la clave.
    const cuarenta = grupos.find((x) => x.palabras.some((p) => p.texto === "40"));
    const sub40 = enLaFranja(pintar(cuarenta.palabras.at(-1).desde + 0.15));
    expect(sub40.find((x) => x.t === "40" && x.color === "#E8C77F")?.alfa).toBe(1);
    expect(sub40.find((x) => x.t === "MINUTOS?").color).not.toBe("#E8C77F");
  });

  it("nada en el silencio insertado ni con los subtítulos apagados", () => {
    const silencio = linea.silencios[0];
    expect(silencio).toBeTruthy();
    // El silencio va en tiempo del audio; en el video empieza en el mismo segundo (es el primero). Pasada la cola del
    // último grupo, y antes de que acabe el silencio, no se ve ningún subtítulo.
    const t = silencio.en + COLA_GRUPO + 0.1;
    expect(t).toBeLessThan(silencio.en + silencio.dur);
    expect(enLaFranja(pintar(t))).toEqual([]);
    const sinSub = validarGuion({ ...g, subtitulos: { activo: false } }).guion;
    const l2 = lineaDeTiempo(sinSub, voz(sinSub));
    expect(enLaFranja(pintar(grupos[0].desde + 0.1, sinSub, l2))).toEqual([]);
  });

  it("un grupo largo baja de tamaño o se parte en dos líneas, y siempre cabe en la franja", () => {
    const { ctx } = lienzo();
    const r = encajarSubtitulo(ctx, ["COMPUTARIZADO,", "GRATIS", "CON", "TU"], { ancho: 900, alto: 162, lado: 1080, familia: "x" });
    expect(r.lineas.length * r.tam * 1.14).toBeLessThanOrEqual(162 + 1);
    for (const l of r.lineas) expect(l.join(" ").length * r.tam * 0.55).toBeLessThanOrEqual(900 + 1);
  });
});

describe("la voz de la vista previa", () => {
  it("cada instante del video tiene su segundo del audio, con los silencios insertados", () => {
    const linea = { silencios: [{ en: 3, dur: 0.8 }, { en: 10, dur: 1 }] };
    expect(tramoDeAudio(linea, 2)).toMatchObject({ a: 2, mudo: false, desplazado: 0, finTramo: 3 });
    expect(tramoDeAudio(linea, 3.4)).toMatchObject({ a: 3, mudo: true });
    expect(tramoDeAudio(linea, 4)).toMatchObject({ a: 3.2, mudo: false, desplazado: 0.8, finTramo: 10 });
    expect(tramoDeAudio(linea, 11)).toMatchObject({ a: 10, mudo: true });
    expect(tramoDeAudio(linea, 12)).toMatchObject({ a: 10.2, mudo: false, desplazado: 1.8, finTramo: Infinity });
  });

  it("encaja con la línea de tiempo: la primera palabra de una escena suena cuando empieza su escena", () => {
    const g = guion();
    const linea = lineaDeTiempo(g, voz(g));
    const e2 = linea.escenas[1];
    const r = tramoDeAudio(linea, e2.palabras[0].desde);
    expect(r.mudo).toBe(false);
    expect(r.a).toBeCloseTo(voz(g)[palabrasDe(g.escenas[0].habla).length].desde, 5);
  });

  it("detecta las palabras del final que la voz no dijo (sin duración, pegadas al último instante)", () => {
    const p = [{ desde: 0, hasta: 0.4 }, { desde: 0.5, hasta: 0.9 }, { desde: 0.9, hasta: 0.9 }, { desde: 0.9, hasta: 0.9 }];
    expect(palabrasMudas(p)).toEqual([2, 3]);
    expect(palabrasMudas([{ desde: 0, hasta: 0.4 }, { desde: 0.5, hasta: 0.9 }])).toEqual([]);
    expect(palabrasMudas(null)).toEqual([]);
  });
});
