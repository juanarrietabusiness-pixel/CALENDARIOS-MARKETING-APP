import { describe, it, expect } from "vitest";
import { MODELOS, modeloPorId } from "./estudioCatalogo";
import {
  MOTORES_PRIORIDAD, FORTALEZAS, USOS_VIDEO, esPrioritario, conPrioridadPrimero, usosDeToma, sugerirMotores,
  sugerenciaDeDesglose, textoDeSugerencia, textoDeLosDiez,
} from "./motoresVideo";

// Un desglose como el del anuncio del tsunami que la agencia recreó para Baby Caleb (19-11-2026).
const TOMAS = [
  { n: 1, desde: 0, hasta: 2.5, plano: "plano general", movimiento: "fijo", contenido: "Una mamá con su bebé en la playa, sentados en la arena", dice: "" },
  { n: 2, desde: 2.5, hasta: 4, plano: "gran plano general", movimiento: "dron", contenido: "Una ola gigante, un tsunami, se levanta en el mar", dice: "" },
  { n: 3, desde: 4, hasta: 5.5, plano: "primer plano", movimiento: "cámara en mano", contenido: "La mujer mira asustada y grita", dice: "¡Corre!" },
  { n: 4, desde: 5.5, hasta: 8, plano: "plano entero", movimiento: "seguimiento", contenido: "La madre corre con el bebé y se cae; el pañal sale de la bolsa", dice: "" },
  { n: 5, desde: 8, hasta: 10, plano: "plano detalle", movimiento: "fijo", contenido: "El agua llega al pañal y el pañal absorbe toda la ola", dice: "" },
  { n: 6, desde: 10, hasta: 12, plano: "plano medio", movimiento: "fijo", contenido: "La mamá sorprendida y el bebé feliz", dice: "Pañales Nateen" },
  { n: 7, desde: 12, hasta: 14, plano: "inserto", movimiento: "fijo", contenido: "El paquete del producto con el logo", dice: "" },
];
const DESGLOSE = { tomas: TOMAS, cuenta: { duracion: 14 } };

describe("los diez motores de prioridad", () => {
  it("son diez, de video, de Kie, con su puesto del 1 al 10 y lo que hace bien cada uno", () => {
    expect(MOTORES_PRIORIDAD.map((m) => m.prioridad)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(MOTORES_PRIORIDAD.map((m) => m.id)).toEqual([
      "veo-3-1-kie", "gemini-omni-video-kie", "seedance-2-5-kie", "kling-3-omni-kie", "minimax-h3-kie",
      "seedance-2-kie", "wan-3-kie", "kling-3-kie", "veo-3-1-fast-kie", "kling-2-6-movimiento-kie",
    ]);
    for (const m of MOTORES_PRIORIDAD) {
      expect(m.tipo, m.id).toBe("video");
      expect(FORTALEZAS[m.id]?.fuerte, m.id).toBeTruthy();
      for (const u of Object.keys(FORTALEZAS[m.id].usos)) expect(USOS_VIDEO[u], `${m.id} ${u}`).toBeTruthy();
    }
    // Ninguna fortaleza de un modelo que no esté entre los diez (se quedaría sin usar sin que nadie lo vea).
    expect(Object.keys(FORTALEZAS).sort()).toEqual(MOTORES_PRIORIDAD.map((m) => m.id).sort());
    expect(MODELOS.filter((m) => m.prioridad && m.tipo !== "video")).toEqual([]);
  });

  it("del más caro al más barato, como los pidió la agencia", () => {
    const costos = MOTORES_PRIORIDAD.map((m) => m.costo);
    expect(costos).toEqual([...costos].sort((a, b) => b - a));
  });

  it("los diez van primero en una lista; los demás detrás, en el orden que traían", () => {
    const lista = [modeloPorId("veo-3-1-lite-kie"), modeloPorId("kling-3-kie"), modeloPorId("gemini-omni-1-2-kie"), modeloPorId("veo-3-1-kie")];
    expect(conPrioridadPrimero(lista).map((m) => m.id)).toEqual(["veo-3-1-kie", "kling-3-kie", "veo-3-1-lite-kie", "gemini-omni-1-2-kie"]);
    expect(esPrioritario("seedance-2-5-kie")).toBe(true);
    expect(esPrioritario("veo-3-1-lite-kie")).toBe(false);
  });
});

describe("lo que necesita cada toma", () => {
  it("lo lee del desglose: gente, efectos, producto, cámara, diálogo y tomas largas", () => {
    expect(usosDeToma(TOMAS[0])).toEqual(["persona"]);
    // Una ola que «se levanta» no es una persona.
    expect(usosDeToma(TOMAS[1])).toEqual(["efectos", "camara"]);
    expect(usosDeToma(TOMAS[2])).toEqual(["dialogo", "persona"]);
    expect(usosDeToma(TOMAS[4])).toEqual(["efectos", "producto"]);
    expect(usosDeToma(TOMAS[6])).toEqual(["producto"]);
    expect(usosDeToma({ desde: 0, hasta: 20, contenido: "Un paisaje" })).toEqual(["larga"]);
  });

  it("una voz en off no es diálogo: sin gente en cuadro, la pone el montaje", () => {
    expect(usosDeToma({ desde: 0, hasta: 3, contenido: "Un atardecer sobre la ciudad", dice: "Llegó la oferta" })).toEqual([]);
    expect(usosDeToma({ desde: 0, hasta: 3, contenido: "Un hombre sonríe", dice: "vacío" })).toEqual(["persona"]);
  });
});

describe("qué motor sugiere", () => {
  it("nunca uno sin llave ni uno que no llegue a la duración", () => {
    expect(sugerirMotores({ gemini: true }, { usos: ["persona"] })).toEqual([]);
    const largos = sugerirMotores({ kie: true }, { usos: ["persona"], segundos: 25 });
    expect(largos.map((x) => x.modelo.id)).toEqual(["seedance-2-5-kie"]);
  });

  it("para alguien que habla, uno con voz en español; Seedance y Wan no", () => {
    const habla = sugerirMotores({ kie: true }, { usos: ["dialogo", "persona"], conFotogramas: true });
    expect(habla[0].modelo.id).toBe("kling-3-omni-kie");
    expect(habla.map((x) => x.modelo.id)).not.toContain("seedance-2-5-kie");
  });

  it("con fotogramas, sólo los que animan una imagen inicial; el que copia un movimiento, sólo si se pide", () => {
    const efectos = sugerirMotores({ kie: true }, { usos: ["efectos"], conFotogramas: true, cuantos: 10 });
    expect(efectos.map((x) => x.modelo.id)).not.toContain("gemini-omni-video-kie");
    expect(efectos.map((x) => x.modelo.id)).not.toContain("kling-2-6-movimiento-kie");
    expect(sugerirMotores({ kie: true }, { usos: ["efectos"] })[0].modelo.id).toBe("gemini-omni-video-kie");
    expect(sugerirMotores({ kie: true }, { usos: ["movimiento"] })[0].modelo.id).toBe("kling-2-6-movimiento-kie");
  });

  it("a igual puntaje, el más barato: sale igual por menos", () => {
    const [a, b] = sugerirMotores({ kie: true }, { usos: [], conFotogramas: true, cuantos: 2 });
    expect(a.puntos).toBe(b.puntos);
    expect(a.modelo.costo).toBeLessThanOrEqual(b.modelo.costo);
  });
});

describe("la sugerencia tras un desglose", () => {
  it("un motor principal para todo el video y otro sólo donde el principal flojea", () => {
    const s = sugerenciaDeDesglose(DESGLOSE, { kie: true });
    expect(s.principal.modelo.id).toBe("kling-3-omni-kie");
    expect(s.principal.costo).toBeCloseTo(1.4);
    // El agua del tsunami y la absorción: Kling Omni flojea en efectos; Veo 3.1 Quality, no.
    expect(s.excepciones).toEqual([expect.objectContaining({ tomas: [2, 5], modelo: expect.objectContaining({ id: "veo-3-1-kie" }) })]);
    expect(s.movimiento).toMatchObject({ modelo: { id: "kling-2-6-movimiento-kie" }, tomas: [1, 3, 4, 6] });
    expect(s.borrador.id).toBe("veo-3-1-fast-kie");
    expect(s.tomas).toHaveLength(7);
    expect(s.tomas[2].mejores[0].modelo.id).toBe("kling-3-omni-kie");
  });

  it("una toma más larga de lo que hace el principal va con uno que llega", () => {
    const largo = { tomas: [...TOMAS.slice(0, 3), { n: 4, desde: 5.5, hasta: 26, plano: "plano entero", movimiento: "fijo", contenido: "La madre corre por la playa", dice: "" }] };
    const s = sugerenciaDeDesglose(largo, { kie: true });
    const e = s.excepciones.find((x) => x.tomas.includes(4));
    if (s.principal.modelo.id !== "seedance-2-5-kie") expect(e.modelo.id).toBe("seedance-2-5-kie");
  });

  it("sin llaves no sugiere nada; sin tomas, null", () => {
    expect(sugerenciaDeDesglose(DESGLOSE, { gemini: true }).principal).toBeNull();
    expect(textoDeSugerencia(sugerenciaDeDesglose(DESGLOSE, { gemini: true }))).toMatch(/ninguno de los diez/);
    expect(sugerenciaDeDesglose({ tomas: [] }, { kie: true })).toBeNull();
    // Sin `activos` (la pantalla sin las llaves a mano) no mira las llaves.
    expect(sugerenciaDeDesglose(DESGLOSE).principal).toBeTruthy();
  });

  it("el texto dice el principal, por qué, lo que cuesta y cada toma", () => {
    const t = textoDeSugerencia(sugerenciaDeDesglose(DESGLOSE, { kie: true }));
    expect(t).toMatch(/^MOTORES SUGERIDOS/);
    expect(t).toContain("Principal, para TODO el video");
    expect(t).toContain("kling-3-omni-kie");
    expect(t).toContain("unos 1,40 $ los 14 s");
    expect(t).toContain("Se va a notar el cambio de motor");
    expect(t).toContain("nada de la otra marca sale en el tuyo");
    expect(t).toMatch(/^ {2}5 · agua, fuego, humo y física, el producto fiel → /m);
    expect(t).not.toContain("≈ ≈");
  });

  it("la lista de los diez dice cuáles no tienen llave", () => {
    const t = textoDeLosDiez({ gemini: true });
    expect(t.split("\n")).toHaveLength(10);
    expect(t).toMatch(/^1\. veo-3-1-kie — .*SIN LLAVE/);
    expect(textoDeLosDiez({ kie: true })).not.toContain("SIN LLAVE");
  });
});
