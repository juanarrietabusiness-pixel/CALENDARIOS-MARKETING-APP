import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  validarGuion, lineaDeTiempo, tiempoDeCapa, palabrasDe, sinEtiquetas, etiquetasDe, textoDeLocucion,
  puedePasar, estadoTrasEditar, puedeGenerarVoz, ESTADOS_VIDEO, NOMBRE_TIPO_ESCENA, TIPOS_ESCENA, COMPONENTES, VERSION_GUION, MIN_ESCENA, COLA_FINAL, FPS, ANTICIPO,
  archivosDelGuion, videosDelGuion, tieneHabla, duracionMinimaDeEscena, segundoDelClip, MAX_TRAMO_VIDEO,
} from "./videoEscenas.js";

// ============================================================
// El formato de escenas v1 del video animado
//
//   · el ejemplo de docs/formato-escenas-v1.md es un guion válido (el documento no se queda atrás);
//   · los errores dicen dónde y no se arreglan en silencio; lo que sobra se quita con aviso;
//   · las palabras se cuentan igual que las contará la alineación (sin las etiquetas de emoción);
//   · la línea de tiempo: estimada sin voz, con la toma cuando la hay, las pausas como silencios del audio;
//   · las capas ancladas a una palabra siguen a esa palabra al cambiar la voz;
//   · el ciclo del proyecto y que la voz sólo se genera con la versión aprobada.
// ============================================================

const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
};

const minimo = (escenas) => ({ escenas });
const escena = (habla, extra = {}) => ({ tipo: "explicacion", habla, ...extra });
// Diez palabras: unos 4 s estimados (para medir tiempos). QUINCE: unos 6 s, por encima del mínimo de 5 s, para validar
// con una sola escena.
const DIEZ = "uno dos tres cuatro cinco seis siete ocho nueve diez";
const QUINCE = `${DIEZ} once doce trece catorce quince`;

describe("el ejemplo de la documentación", () => {
  it("es un guion válido, sin errores ni avisos", () => {
    const r = validarGuion(ejemplo());
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.segundos).toBeGreaterThan(10);
    expect(r.guion.version).toBe(VERSION_GUION);
  });

  it("también llega como texto JSON (lo que manda el MCP)", () => {
    expect(validarGuion(JSON.stringify(ejemplo())).ok).toBe(true);
    expect(validarGuion("{ no es json").errores[0].mensaje).toMatch(/JSON/);
  });

  it("documenta TODOS los componentes de la librería", () => {
    const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
    for (const c of Object.keys(COMPONENTES)) expect(md, c).toContain(`| \`${c}\` |`);
  });
});

describe("las palabras", () => {
  it("las etiquetas de emoción no cuentan, los signos sueltos tampoco", () => {
    const t = "[emocionada] ¡Hola, mamá! — ¿lista? [susurra] 3 pasos";
    expect(sinEtiquetas(t)).toBe("¡Hola, mamá! — ¿lista? 3 pasos");
    expect(etiquetasDe(t)).toEqual(["emocionada", "susurra"]);
    expect(palabrasDe(t)).toEqual(["¡Hola,", "mamá!", "¿lista?", "3", "pasos"]);
  });

  it("la locución es el habla de todas las escenas, en orden, con sus etiquetas", () => {
    const g = minimo([escena("[alegre] Hola."), escena("", { pausa: 1 }), escena("Adiós.")]);
    expect(textoDeLocucion(g)).toBe("[alegre] Hola. Adiós.");
  });
});

describe("validar", () => {
  it("un componente que no existe es un error con su sitio", () => {
    const r = validarGuion(minimo([escena(QUINCE, { capas: [{ tipo: "cohete" }] })]));
    expect(r.ok).toBe(false);
    expect(r.errores[0].donde).toBe("escenas[0].capas[0].tipo");
  });

  it("un texto largo NO se recorta: es un error", () => {
    const r = validarGuion(minimo([escena(QUINCE, { capas: [{ tipo: "sello", texto: "x".repeat(30) }] })]));
    expect(r.ok).toBe(false);
    expect(r.errores[0]).toMatchObject({ donde: "escenas[0].capas[0].texto" });
    expect(r.guion.escenas[0].capas[0].texto).toHaveLength(30);
  });

  it("los colores son tokens del estilo o #RRGGBB", () => {
    const capa = (color) => validarGuion(minimo([escena(QUINCE, { capas: [{ tipo: "forma", color }] })]));
    expect(capa("acento").ok).toBe(true);
    expect(capa("#91c9a2").ok).toBe(true);
    expect(capa("verde").errores[0].donde).toBe("escenas[0].capas[0].color");
    expect(capa("var(--accent)").ok).toBe(false);
  });

  it("anclar a una palabra que la escena no dice es un error", () => {
    const r = validarGuion(minimo([escena("Hola mamá, mira esto ahora mismo que te sirve", { capas: [{ tipo: "icono", entra: { palabra: 9 } }] })]));
    expect(r.errores[0].mensaje).toMatch(/dice 9 palabras: la 9 no existe/);
  });

  it("una escena muda necesita pausa", () => {
    expect(validarGuion(minimo([escena(QUINCE), escena("")])).errores[0].mensaje).toMatch(/pausa/);
    expect(validarGuion(minimo([escena(QUINCE), escena("", { pausa: 1.5 })])).ok).toBe(true);
  });

  it("lo que no es del formato se quita y avisa", () => {
    const r = validarGuion({ ...minimo([escena(QUINCE, { capas: [{ tipo: "texto", texto: "Hola", sombra: true }] })]), codigo: "alert(1)" });
    expect(r.ok).toBe(true);
    expect(r.avisos.map((a) => a.donde)).toEqual(expect.arrayContaining(["codigo", "escenas[0].capas[0].sombra"]));
    expect(r.guion).not.toHaveProperty("codigo");
    expect(r.guion.escenas[0].capas[0]).not.toHaveProperty("sombra");
  });

  it("pone los valores por defecto", () => {
    const { guion } = validarGuion(minimo([escena(QUINCE, { capas: [{ tipo: "texto", texto: "Hola" }] })]));
    expect(guion.formatos).toEqual(["9:16"]);
    expect(guion.subtitulos).toEqual({ activo: true, pos: "abajo", maxPalabras: 4, maxCaracteres: 23, acento: "acento" });
    expect(guion.escenas[0]).toMatchObject({ id: "e1", pausa: 0, fondo: { tipo: "plano", color: "fondo" }, transicion: { tipo: "corte" } });
    expect(guion.escenas[0].capas[0]).toMatchObject({ pos: "centro", tam: 0.6, entra: { s: 0 }, sale: null, rol: "titular", animacion: { entrada: "aparece" } });
    expect(guion.estilo.fuentes).toEqual({ titular: "kit", cuerpo: "kit" });
  });

  it("la duración va de 5 s a 150 s", () => {
    expect(validarGuion(minimo([escena("Hola mamá")])).errores[0].mensaje).toMatch(/mínimo es 5/);
    const larga = Array.from({ length: 40 }, () => escena(Array(30).fill("palabra").join(" ")));
    expect(validarGuion(minimo(larga)).errores.at(-1).mensaje).toMatch(/máximo es 150/);
  });

  it("las posiciones son un nombre o { x, y } entre 0 y 1", () => {
    const pos = (p) => validarGuion(minimo([escena(QUINCE, { capas: [{ tipo: "logo", pos: p }] })]));
    expect(pos("abajo-der").ok).toBe(true);
    expect(pos({ x: 0.2, y: 0.9 }).guion.escenas[0].capas[0].pos).toEqual({ x: 0.2, y: 0.9 });
    expect(pos({ x: 2, y: 0 }).ok).toBe(false);
    expect(pos("esquina").ok).toBe(false);
  });

  it("una fuente o una música que no es del cliente no pasa", () => {
    const g = (estilo, musica) => validarGuion({ ...minimo([escena(QUINCE)]), estilo, musica });
    expect(g({ fuentes: { titular: { nombre: "Marca", clave: "clientes/bc/fuentes/marca.ttf" } } }).ok).toBe(true);
    expect(g({ fuentes: { titular: { nombre: "Marca", clave: "voces/kore.wav" } } }).ok).toBe(false);
    expect(g({ fuentes: { titular: { nombre: "Marca", clave: "clientes/bc/fuentes/../../x" } } }).ok).toBe(false);
    expect(g({}, { clave: "turnos/x.json" }).ok).toBe(false);
  });

  it("el antes y después necesita algo en cada lado", () => {
    const ad = (extra) => validarGuion(minimo([escena(QUINCE, { capas: [{ tipo: "antes_despues", ...extra }] })]));
    expect(ad({ textoAntes: "Piel roja", textoDespues: "Piel tranquila", modo: "deslizador" }).ok).toBe(true);
    expect(ad({ archivoAntes: "a1", textoDespues: "Después" }).ok).toBe(true);
    expect(ad({ textoAntes: "Piel roja" }).errores[0].donde).toBe("escenas[0].capas[0].textoDespues");
    expect(ad({ textoAntes: "x", textoDespues: "y", modo: "giro" }).ok).toBe(false);
  });

  it("los ids repetidos son un error", () => {
    expect(validarGuion(minimo([escena(QUINCE, { id: "a" }), escena(QUINCE, { id: "a" })])).ok).toBe(false);
    expect(validarGuion(minimo([escena(QUINCE, { capas: [{ tipo: "logo", id: "x" }, { tipo: "logo", id: "x" }] })])).ok).toBe(false);
  });
});

describe("la línea de tiempo", () => {
  it("sin voz, se estima a 2,5 palabras por segundo y la última lleva su cola", () => {
    const { guion } = validarGuion(minimo([escena("uno dos tres cuatro cinco"), escena(DIEZ)]));
    const t = lineaDeTiempo(guion);
    expect(t.estimado).toBe(true);
    expect(t.escenas[0]).toMatchObject({ desde: 0, hasta: 2, frames: { desde: 0, hasta: 2 * FPS } });
    expect(t.escenas[1].desde).toBe(2);
    expect(t.total).toBeCloseTo(6 - 0.05 + COLA_FINAL, 3);
    expect(t.silencios).toEqual([]);
  });

  it("con la toma, cada escena empieza donde empieza su primera palabra", () => {
    const g = validarGuion(minimo([escena("Hola mamá"), escena(DIEZ)])).guion;
    const palabras = [{ desde: 0.3, hasta: 0.6 }, { desde: 0.7, hasta: 1.1 }, ...Array.from({ length: 10 }, (_, i) => ({ desde: 1.6 + i * 0.4, hasta: 1.9 + i * 0.4 }))];
    const t = lineaDeTiempo(g, palabras);
    expect(t.estimado).toBe(false);
    expect(t.escenas[0]).toMatchObject({ desde: 0, hasta: 1.6 });
    expect(t.escenas[1].desde).toBe(1.6);
    expect(t.escenas[1].palabras[0]).toEqual({ texto: "uno", desde: 1.6, hasta: 1.9 });
    expect(t.total).toBeCloseTo(5.5 + COLA_FINAL, 3);
  });

  it("tiempos que no cuadran con el guion no se usan: se estima y se dice", () => {
    const g = validarGuion(minimo([escena(DIEZ)])).guion;
    expect(lineaDeTiempo(g, [{ desde: 0, hasta: 1 }]).estimado).toBe(true);
    const alReves = Array.from({ length: 10 }, (_, i) => ({ desde: 10 - i, hasta: 10.5 - i }));
    expect(lineaDeTiempo(g, alReves).estimado).toBe(true);
  });

  it("una pausa es un silencio del AUDIO detrás de su escena y empuja lo que viene", () => {
    const g = validarGuion(minimo([escena("uno dos tres cuatro cinco", { pausa: 1 }), escena("", { pausa: 2 }), escena(DIEZ)])).guion;
    const t = lineaDeTiempo(g);
    expect(t.silencios).toEqual([{ en: 2, dur: 1 }, { en: 2, dur: 2 }]);
    expect(t.escenas.map((e) => [e.desde, e.hasta])).toEqual([[0, 3], [3, 5], [5, expect.any(Number)]]);
    expect(t.escenas[2].palabras[0].desde).toBe(5); // 2 s de audio + 3 s de silencios
  });

  it("una escena muy corta que CIERRA una oración se alarga con silencio hasta el mínimo", () => {
    const g = validarGuion(minimo([escena("Hola."), escena(DIEZ)])).guion;
    const t = lineaDeTiempo(g);
    expect(t.escenas[0].hasta - t.escenas[0].desde).toBeCloseTo(MIN_ESCENA, 3);
    expect(t.silencios[0]).toEqual({ en: 0.4, dur: 0.2 });
  });

  it("A1 · la voz nunca se traba: ni un clip ni una imagen alargan una escena con habla, ni se mete silencio a mitad de una oración", () => {
    const clip = { tipo: "video", id: "v", archivo: "a1", encuadre: "completo", desde: 0, hasta: 4 };
    const foto = { tipo: "imagen", id: "f", archivo: "a2", encuadre: "completo", dura: 5 };
    // Una oración partida en tres escenas: la del medio, corta y sin signo, y las capas que antes las alargaban.
    const g = validarGuion(minimo([escena("Esta crema", { capas: [clip] }), escena("no", { capas: [foto] }), escena("irrita la piel de tu bebé: cámbiate hoy a la crema suave que sí lo cuida.")])).guion;
    const t = lineaDeTiempo(g);
    expect(t.silencios).toEqual([]);
    // Lo que dura cada escena es lo que tarda en decirse (estimado a 2,5 palabras por segundo).
    expect(t.escenas[0].hasta - t.escenas[0].desde).toBeCloseTo(0.8, 3);
    expect(t.escenas[1].hasta - t.escenas[1].desde).toBeCloseTo(0.4, 3);
    // Sin habla, el clip y la imagen siguen marcando lo que dura su escena (un montaje mudo, una foto con música).
    const mudo = lineaDeTiempo(validarGuion(minimo([escena("", { capas: [clip] }), escena("", { capas: [foto] })])).guion);
    expect(mudo.escenas.map((e) => e.hasta - e.desde)).toEqual([4, 5]);
  });

  it("una capa anclada a una palabra la sigue al cambiar la voz", () => {
    const g = validarGuion(minimo([escena(DIEZ, { capas: [{ tipo: "sello", texto: "¡Ya!", entra: { palabra: 4 } }, { tipo: "logo", entra: { s: 1 }, sale: { palabra: 6 } }] })])).guion;
    const lenta = Array.from({ length: 10 }, (_, i) => ({ desde: i * 0.8, hasta: i * 0.8 + 0.6 }));
    const rapida = Array.from({ length: 10 }, (_, i) => ({ desde: i * 0.3, hasta: i * 0.3 + 0.2 }));
    const [sello, logo] = g.escenas[0].capas;
    const e = (pal) => lineaDeTiempo(g, pal).escenas[0];
    // Entra ANTICIPO (0,12 s) antes de la palabra: es cuando el ojo la espera. La salida no se adelanta.
    expect(tiempoDeCapa(sello, e(lenta)).desde).toBeCloseTo(3.2 - ANTICIPO, 3);
    expect(tiempoDeCapa(sello, e(rapida)).desde).toBeCloseTo(1.2 - ANTICIPO, 3);
    expect(tiempoDeCapa(logo, e(lenta))).toEqual({ desde: 1, hasta: 4.8 });
    // Nunca antes de que empiece su escena (la palabra 0 de la primera).
    const primera = validarGuion(minimo([escena(DIEZ, { capas: [{ tipo: "sello", texto: "¡Ya!", entra: { palabra: 0 } }] })])).guion;
    expect(tiempoDeCapa(primera.escenas[0].capas[0], lineaDeTiempo(primera, lenta).escenas[0]).desde).toBe(0);
  });
});

describe("el ciclo del proyecto", () => {
  it("borrador → aprobado → con voz → render, y editar vuelve a borrador", () => {
    expect(puedePasar("borrador", "aprobado")).toBe(true);
    expect(puedePasar("borrador", "con_voz")).toBe(false);
    expect(puedePasar("aprobado", "con_voz")).toBe(true);
    expect(puedePasar("con_voz", "renderizando")).toBe(true);
    expect(puedePasar("renderizando", "renderizado")).toBe(true);
    expect(estadoTrasEditar("con_voz")).toBe("borrador");
    expect(estadoTrasEditar("renderizando")).toBe(null);
    for (const e of ESTADOS_VIDEO) expect(puedePasar("inventado", e)).toBe(false);
  });

  it("la voz sólo se genera con el guion aprobado y en la versión aprobada", () => {
    expect(puedeGenerarVoz({ estado: "aprobado", version: 3, aprobada_version: 3 })).toBe(true);
    expect(puedeGenerarVoz({ estado: "aprobado", version: 4, aprobada_version: 3 })).toBe(false);
    expect(puedeGenerarVoz({ estado: "borrador", version: 3, aprobada_version: 3 })).toBe(false);
    expect(puedeGenerarVoz({ estado: "con_voz", version: 2, aprobada_version: null })).toBe(false);
  });

  it("cada tipo de escena tiene su nombre corto para la pantalla", () => {
    expect(Object.keys(NOMBRE_TIPO_ESCENA).sort()).toEqual(Object.keys(TIPOS_ESCENA).sort());
  });

  it("los estados son los mismos que el CHECK de D1", () => {
    const sql = readFileSync(new URL("../../migraciones/d1/0059_videos_animados.sql", import.meta.url), "utf8");
    const enSql = /estado in \(([^)]+)\)/.exec(sql)[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(enSql).toEqual([...ESTADOS_VIDEO]);
  });
});


describe("la capa VIDEO (un clip de la galería)", () => {
  const conVideo = (capa, escena = {}) => validarGuion({
    version: 1, formatos: ["9:16"],
    escenas: [
      { id: "a", tipo: "gancho", habla: "", capas: [{ tipo: "video", id: "v", archivo: "clip1", ...capa }], ...escena },
      { id: "b", tipo: "cierre", habla: "Escríbenos hoy mismo por WhatsApp", capas: [{ tipo: "imagen", id: "i", archivo: "foto1" }] },
    ],
  });

  it("valida con sus valores por defecto: a sangre, cubrir, con un velo de 0,3 y sin sonido", () => {
    const v = conVideo({ hasta: 5 });
    expect(v.ok).toBe(true);
    expect(v.guion.escenas[0].capas[0]).toMatchObject({ encuadre: "completo", recorte: "cubrir", desde: 0, hasta: 5, sonido: false, volumen: 1, oscurecer: 0.3 });
  });

  it("una escena sin habla dura el TRAMO de su video (lo que falta va como silencio en la locución)", () => {
    const v = conVideo({ desde: 2, hasta: 6.5 });
    const linea = lineaDeTiempo(v.guion);
    expect(linea.escenas[0].hasta - linea.escenas[0].desde).toBeCloseTo(4.5, 3);
    expect(linea.silencios[0]).toMatchObject({ en: 0, dur: 4.5 });
    expect(duracionMinimaDeEscena(v.guion.escenas[0])).toBe(4.5);
    // Con su entrada en segundos, el tramo empieza después.
    expect(duracionMinimaDeEscena({ capas: [{ tipo: "video", desde: 0, hasta: 3, entra: { s: 1 } }] })).toBe(4);
  });

  it("sin habla, sin pausa y sin tramo, es un error que dice las dos salidas", () => {
    const v = conVideo({});
    expect(v.ok).toBe(false);
    expect(v.errores[0].mensaje).toMatch(/pausa.*video con su tramo/);
  });

  it("«hasta» tiene que pasar de «desde» y el tramo no pasa de 60 s", () => {
    expect(conVideo({ desde: 3, hasta: 2 }).errores.some((e) => e.donde === "escenas[0].capas[0].hasta")).toBe(true);
    const largo = conVideo({ desde: 0, hasta: MAX_TRAMO_VIDEO + 1 });
    expect(largo.errores.some((e) => /como mucho 60 s/.test(e.mensaje))).toBe(true);
  });

  it("los ids de video van aparte de los de imagen; un guion sin habla no tiene locución", () => {
    const v = conVideo({ hasta: 5 });
    expect(archivosDelGuion(v.guion)).toEqual(["foto1"]);
    expect(videosDelGuion(v.guion)).toEqual(["clip1"]);
    expect(tieneHabla(v.guion)).toBe(true);
    expect(tieneHabla({ escenas: [{ habla: "" }, { habla: "[ríe]" }] })).toBe(false);
  });

  it("el segundo del clip: desde su «desde», a velocidad normal, y quieto en su «hasta»", () => {
    expect(segundoDelClip({ desde: 2 }, 10, 11.5)).toBe(3.5);
    expect(segundoDelClip({ desde: 2 }, 10, 9)).toBe(2);
    expect(segundoDelClip({ desde: 2, hasta: 4 }, 10, 20)).toBe(4);
  });
});
