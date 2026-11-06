import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  validarGuion, lineaDeTiempo, tramoDeAudio, palabrasDe, textoDeLocucion, MAX_ESCENAS, MAX_ESCENAS_CANCION, MIN_ESCENA,
} from "./videoEscenas.js";
import {
  limpiarLetra, lineasDeLetra, leerAlineacion, medirAlineacion, palabrasDeLaCancion, conDesplazamiento, limpiarDesplazamiento,
  estadoDeCancion, cancionSigueValiendo, palabrasParaLinea, conPalabrasDeCancion, lineasConTiempos, huecosInstrumentales,
  guionKaraoke, comprobarLetra, conLaCancion, duracionDeAudio, costoDeSincronia, partirLinea, letraEstimada, DESPLAZAMIENTO_MAX,
} from "./videoCancion.js";
import { puedeRenderizar, tramosDeAudio, armarPcm, BYTES_MUESTRA } from "./renderVideo.js";
import { formatoParaLaIA } from "./videoFormatoIA.js";
import { pedidoDeGuionCancion, letraParaLaIA } from "./guionAnimadoIA.js";

// ============================================================
// «Video con tu canción» (puro): el MODO CANCIÓN del formato y de la línea de tiempo, la letra, leer y alinear la
// sincronía, el ajuste fino, la canción que sigue valiendo, la prueba de sincronía y el render sin silencios.
// ============================================================

const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
};

const LETRA = `[Coro]
Toallitas suaves para tu bebé
sin alcohol y sin perfume
[Verso]
cuidan su piel desde el primer día
Toallitas suaves para tu bebé`;

/** La letra con tiempos «oídos»: una palabra cada 0,4 s desde `inicio`, con un hueco instrumental entre líneas. */
function oidasDe(letra, { inicio = 3, hueco = 0, paso = 0.4 } = {}) {
  const lineas = lineasDeLetra(letra);
  const oidas = [];
  let t = inicio;
  lineas.forEach((l, k) => {
    if (k === 2) t += hueco;
    for (const p of palabrasDe(l)) { oidas.push({ texto: p, desde: +t.toFixed(3), hasta: +(t + paso * 0.9).toFixed(3) }); t += paso; }
    t += 0.3;
  });
  return oidas;
}

const cancion = (duracion = 20, archivo = "c-1") => ({ archivo, duracion, nombre: "Toallitas" });

/** Un guion en modo canción con estas escenas (habla) y la canción de `duracion`. */
const conCancion = (hablas, duracion = 20, extra = {}) => ({
  cancion: cancion(duracion), ...extra,
  escenas: hablas.map((h, i) => ({ id: `e${i + 1}`, tipo: "explicacion", habla: h, pantalla: h ? h.slice(0, 40) : "" })),
});

describe("el MODO CANCIÓN en el formato", () => {
  it("un guion de antes valida EXACTAMENTE igual (no se escribe `cancion` si no está)", () => {
    const antes = validarGuion(ejemplo());
    expect(antes.ok).toBe(true);
    expect("cancion" in antes.guion).toBe(false);
    expect(JSON.stringify(validarGuion(antes.guion).guion)).toBe(JSON.stringify(antes.guion));
  });

  it("con canción: escenas sin letra no necesitan pausa, la pausa se ignora con aviso y el video dura lo que la canción", () => {
    const v = validarGuion({ ...conCancion(["", "Toallitas suaves para tu bebé", "sin alcohol y sin perfume", ""], 21.5), escenas: [
      { id: "intro", tipo: "gancho", habla: "", pantalla: "Intro" },
      { id: "a", tipo: "explicacion", habla: "Toallitas suaves para tu bebé", pausa: 1 },
      { id: "b", tipo: "explicacion", habla: "sin alcohol y sin perfume", pantalla: "sin alcohol" },
      { id: "fin", tipo: "cierre", habla: "", capas: [{ tipo: "logo" }] },
    ] });
    expect(v.errores).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.guion.cancion).toEqual({ archivo: "c-1", duracion: 21.5, nombre: "Toallitas" });
    expect(v.guion.escenas[1].pausa).toBe(0);
    expect(v.avisos.some((a) => a.donde === "escenas[1].pausa" && /no se insertan silencios/.test(a.mensaje))).toBe(true);
    expect(v.segundos).toBe(21.5);
  });

  it("sin canción, una escena muda sigue necesitando pausa (nada cambió para los guiones de siempre)", () => {
    const v = validarGuion({ escenas: [{ tipo: "explicacion", habla: "" }, { tipo: "cierre", habla: "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce" }] });
    expect(v.errores.some((e) => /necesita «pausa»/.test(e.mensaje))).toBe(true);
  });

  it("topes del modo canción: hasta 180 s y 80 escenas; la canción mal dicha es un error con su sitio", () => {
    const muchas = Array.from({ length: MAX_ESCENAS + 5 }, (_, i) => `palabra${i}`);
    expect(validarGuion(conCancion(muchas, 120)).ok).toBe(true);
    expect(validarGuion({ escenas: conCancion(muchas, 120).escenas }).errores.some((e) => /Como mucho 40 escenas/.test(e.mensaje))).toBe(true);
    expect(validarGuion(conCancion(Array.from({ length: MAX_ESCENAS_CANCION + 1 }, (_, i) => `p${i}`), 170)).errores.some((e) => /80 escenas/.test(e.mensaje))).toBe(true);
    expect(validarGuion(conCancion(["hola"], 200)).errores[0].donde).toBe("cancion.duracion");
    expect(validarGuion({ ...conCancion(["hola"]), cancion: { archivo: "../x", duracion: 20 } }).errores[0].donde).toBe("cancion.archivo");
    // Una canción de 170 s vale (pasa de los 150 de un video con voz).
    expect(validarGuion(conCancion(["hola mundo"], 170)).ok).toBe(true);
    // Sin letra no hay nada que sincronizar.
    expect(validarGuion(conCancion(["", ""], 20)).errores.some((e) => /lleva su letra/.test(e.mensaje))).toBe(true);
  });

  it("formato_video y el pedido a la IA explican el modo canción", () => {
    const f = formatoParaLaIA();
    expect(f).toMatch(/MODO CANCIÓN/);
    expect(f).toMatch(/LETRA TAL CUAL/);
    expect(f).toMatch(/180 s y 80 escenas/);
  });
});

describe("la línea de tiempo en modo canción", () => {
  const oidas = oidasDe(LETRA, { inicio: 4, hueco: 5 });
  const letra = limpiarLetra(LETRA).letra;
  const lineas = lineasDeLetra(letra);

  it("sin silencios, la primera escena en 0, cada escena con letra en su primera palabra y el total es la canción", () => {
    const g = validarGuion(conCancion(lineas, 30)).guion;
    const palabras = palabrasDeLaCancion(g, { oidas, duracion: 30 }).palabras;
    const l = lineaDeTiempo(g, palabras);
    expect(l.cancion).toBe(true);
    expect(l.silencios).toEqual([]);
    expect(l.estimado).toBe(false);
    expect(l.total).toBe(30);
    expect(l.escenas[0].desde).toBe(0);
    expect(l.escenas[1].desde).toBe(l.escenas[1].palabras[0].desde);
    // El final instrumental se ve: la última escena llega hasta el final de la canción.
    expect(l.escenas.at(-1).hasta).toBe(30);
    // El tiempo del video ES el de la canción: tramoDeAudio no desplaza nada.
    expect(tramoDeAudio(l, 12.3)).toMatchObject({ a: 12.3, mudo: false, desplazado: 0 });
  });

  it("las escenas sin letra ocupan el hueco entre la última palabra de antes y la primera de después (se lo reparten)", () => {
    const g = validarGuion(conCancion(["", lineas[0], lineas[1], "", "", lineas[2], lineas[3], ""], 30)).guion;
    const l = lineaDeTiempo(g, palabrasDeLaCancion(g, { oidas, duracion: 30 }).palabras);
    // La intro, de 0 a la primera palabra.
    expect(l.escenas[0]).toMatchObject({ desde: 0, hasta: l.escenas[1].palabras[0].desde });
    // El puente (dos escenas sin letra): de la última palabra de la línea 2 a la primera de la línea 3, a partes iguales.
    const fin2 = l.escenas[2].palabras.at(-1).hasta;
    const ini3 = l.escenas[5].palabras[0].desde;
    expect(l.escenas[3].desde).toBeCloseTo(fin2, 2);
    expect(l.escenas[4].desde).toBeCloseTo((fin2 + ini3) / 2, 2);
    expect(l.escenas[4].hasta).toBeCloseTo(ini3, 2);
    // El final instrumental: de la última palabra al final de la canción.
    expect(l.escenas[7]).toMatchObject({ desde: l.escenas[6].palabras.at(-1).hasta, hasta: 30 });
  });

  it("una escena muy corta se AVISA y no se estira (nada cambia en el audio)", () => {
    const g = validarGuion(conCancion(["Toallitas suaves", "para", "tu bebé sin alcohol y sin perfume"], 20)).guion;
    const l = lineaDeTiempo(g, palabrasDeLaCancion(g, { oidas: oidasDe("Toallitas suaves para tu bebé sin alcohol y sin perfume", { inicio: 1, paso: 0.3 }), duracion: 20 }).palabras);
    const corta = l.avisos.find((a) => a.escena === "e2");
    expect(corta?.mensaje).toMatch(/no se estira/);
    expect(l.escenas[1].hasta - l.escenas[1].desde).toBeLessThan(MIN_ESCENA);
    expect(l.silencios).toEqual([]);
  });

  it("sin la sincronía, los tiempos se reparten sobre la canción y se dice que son estimados", () => {
    const g = validarGuion(conCancion(lineas, 24)).guion;
    const l = lineaDeTiempo(g);
    expect(l.estimado).toBe(true);
    expect(l.total).toBe(24);
    expect(l.escenas.at(-1).palabras.at(-1).hasta).toBeLessThanOrEqual(24);
  });

  it("el render no inserta nada: la canción va entera y el total manda", () => {
    const g = validarGuion(conCancion(lineas, 2)).guion;
    // (2 s no valida como guion, pero la línea de tiempo y el audio se arman igual: lo que importa es que no hay huecos)
    const l = lineaDeTiempo({ ...g, cancion: { ...g.cancion, duracion: 2 } });
    const tramos = tramosDeAudio(l.silencios);
    expect(tramos).toEqual([{ tipo: "voz", desde: 0, hasta: null }]);
    const muestreo = 100;
    const toma = new Uint8Array(150 * BYTES_MUESTRA).fill(7); // 1,5 s de «canción»
    const pcm = armarPcm(toma, tramos, l.total, muestreo);
    expect(pcm.length).toBe(200 * BYTES_MUESTRA); // dura lo que dice la línea (2 s), rellenada con silencio
    expect(pcm.subarray(0, 150 * BYTES_MUESTRA).every((x) => x === 7)).toBe(true);
  });
});

describe("la letra", () => {
  it("quita las marcas de sección y avisa de las repeticiones abreviadas", () => {
    const r = limpiarLetra("[Coro]\nLa la la\n\nVerso 1:\nOtra línea (x2)\n(Puente)\nFinal");
    expect(r.lineas).toEqual(["La la la", "Otra línea", "Final"]);
    expect(r.palabras).toBe(6);
    expect(r.avisos[0]).toMatch(/escríbela entera/);
    expect(limpiarLetra("").error).toMatch(/Pega la letra/);
    expect(limpiarLetra("x".repeat(6001)).error).toMatch(/6000/);
  });

  it("parte una línea larga por la coma más al centro", () => {
    const partes = partirLinea("Cuando llegas a casa y el día se acaba, te espera la calma de lo que más quieres de verdad");
    expect(partes.length).toBe(2);
    expect(partes[0]).toMatch(/acaba,$/);
    expect(partes.every((p) => p.length <= 70)).toBe(true);
  });
});

describe("leer y alinear la sincronía", () => {
  it("lee la respuesta de Forced Alignment (words con loss) y, si no, agrupa los caracteres", () => {
    const r = leerAlineacion({ characters: [], words: [{ text: "Hola", start: 0.5, end: 0.9, loss: 0.1 }, { text: " ", start: 0.9, end: 1 }, { text: "mundo", start: 1, end: 1.4, loss: 0.2 }], loss: 0.15 });
    expect(r.palabras.map((p) => p.texto)).toEqual(["Hola", "mundo"]);
    expect(r.loss).toBe(0.15);
    expect(r.campos).toEqual(["characters", "words", "loss"]);
    const c = leerAlineacion(JSON.stringify({ characters: [{ text: "s", start: 0, end: 0.1 }, { text: "í", start: 0.1, end: 0.2 }, { text: " ", start: 0.2, end: 0.3 }, { text: "y", start: 0.3, end: 0.4 }] }));
    expect(c.palabras).toEqual([{ texto: "sí", desde: 0, hasta: 0.2 }, { texto: "y", desde: 0.3, hasta: 0.4 }]);
    expect(leerAlineacion("no es json").palabras).toEqual([]);
  });

  it("alinea a la letra con palabras repetidas y palabras que la máquina no oyó", () => {
    const letra = ["la", "la", "la", "mi", "bebé", "la", "la"];
    const crudas = [{ texto: "la", desde: 1, hasta: 1.2 }, { texto: "la", desde: 1.3, hasta: 1.5 }, { texto: "mi", desde: 2, hasta: 2.2 }, { texto: "bebé", desde: 2.3, hasta: 2.8 }, { texto: "la", desde: 3, hasta: 3.2 }, { texto: "la", desde: 3.3, hasta: 3.5 }];
    const m = medirAlineacion(letra, crudas, 10);
    expect(m.oidas).toHaveLength(7);
    expect(m.oidas.map((p) => p.texto)).toEqual(letra);
    // La que no se oyó toma su tiempo entre sus vecinas; el orden nunca va hacia atrás.
    expect(m.oidas.every((p, i) => i === 0 || p.desde >= m.oidas[i - 1].desde)).toBe(true);
    expect(m.oidas[4]).toEqual({ texto: "bebé", desde: 2.3, hasta: 2.8 });
    expect(m.exactas).toBeCloseTo(6 / 7, 3);
  });

  it("una alineación FORZADA que no encontró la voz aplasta las palabras: la coincidencia lo dice", () => {
    const letra = ["uno", "dos", "tres", "cuatro"];
    const aplastadas = letra.map((t) => ({ texto: t, desde: 9.99, hasta: 9.99 }));
    const m = medirAlineacion(letra, aplastadas, 10);
    expect(m.exactas).toBe(1);
    expect(m.aplastadas).toBe(1);
    expect(m.coincidencia).toBe(0);
  });

  it("los estimados reparten la letra sobre lo que dura", () => {
    const e = letraEstimada(["a", "b", "c"], 9);
    expect(e).toHaveLength(3);
    expect(e[0].texto).toBe("a");
    expect(e.at(-1).hasta).toBeLessThanOrEqual(9);
  });
});

describe("la locución de una canción", () => {
  const letra = limpiarLetra(LETRA).letra;
  const oidas = oidasDe(LETRA, { inicio: 4 });
  const loc = (extra = {}) => ({ origen: "cancion", estado: "lista", clave: "clientes/bc/estudio/c.mp3", archivo: "c-1", duracion: 30, oidas, letra, desplazamiento: 0, ...extra });

  it("el desplazamiento mueve toda la letra (acotado a ±1,5 s y dentro de la canción)", () => {
    expect(limpiarDesplazamiento(3)).toBe(DESPLAZAMIENTO_MAX);
    expect(limpiarDesplazamiento(-0.456)).toBe(-0.46);
    expect(limpiarDesplazamiento("x")).toBe(0);
    const mov = conDesplazamiento([{ texto: "a", desde: 0.2, hasta: 0.5 }, { texto: "b", desde: 29.5, hasta: 29.9 }], 0.5, 30);
    expect(mov).toEqual([{ texto: "a", desde: 0.7, hasta: 1 }, { texto: "b", desde: 30, hasta: 30 }]);
    const g = validarGuion(conCancion(lineasDeLetra(letra), 30)).guion;
    const sin = palabrasDeLaCancion(g, loc()).palabras;
    const con = palabrasDeLaCancion(g, loc({ desplazamiento: -0.5 })).palabras;
    expect(con[0].desde).toBeCloseTo(sin[0].desde - 0.5, 3);
  });

  it("el guion que cambia lo que se ve sigue valiendo; el que cambia la letra, no (y lo dice)", () => {
    const g = validarGuion(conCancion(lineasDeLetra(letra), 30)).guion;
    expect(cancionSigueValiendo(g, loc())).toBe(true);
    const otraVista = { ...g, escenas: g.escenas.map((e) => ({ ...e, pantalla: "Otro texto" })) };
    expect(cancionSigueValiendo(otraVista, loc())).toBe(true);
    const otraLetra = { ...g, escenas: g.escenas.map((e) => ({ ...e, habla: "algo que no se canta en esta canción para nada" })) };
    const e = estadoDeCancion(otraLetra, loc());
    expect(e.ok).toBe(false);
    expect(e.motivo).toMatch(/ya no coincide con la letra/);
    // Otra canción u otra duración en el guion: tampoco.
    expect(estadoDeCancion({ ...g, cancion: { ...g.cancion, archivo: "otra" } }, loc()).ok).toBe(false);
    expect(estadoDeCancion({ ...g, cancion: { ...g.cancion, duracion: 25 } }, loc()).ok).toBe(false);
  });

  it("las palabras para la línea: las de la canción calculadas ahora; las de una voz, tal cual", () => {
    const g = validarGuion(conCancion(lineasDeLetra(letra), 30)).guion;
    expect(palabrasParaLinea(g, loc())).toHaveLength(palabrasDe(textoDeLocucion(g)).length);
    expect(palabrasParaLinea(g, { estado: "lista", palabras: [{ desde: 0, hasta: 1 }] })).toEqual([{ desde: 0, hasta: 1 }]);
    expect(palabrasParaLinea(g, { estado: "generando" })).toBeNull();
    expect(conPalabrasDeCancion(g, loc()).coincidenciaGuion).toBe(1);
    expect(conPalabrasDeCancion(g, { estado: "lista", palabras: [] })).toEqual({ estado: "lista", palabras: [] });
  });

  it("puedeRenderizar: con canción, vale para la versión aprobada mientras el guion diga la letra", () => {
    const g = validarGuion(conCancion(lineasDeLetra(letra), 30)).guion;
    const p = { estado: "con_voz", version: 3, aprobada_version: 3, guion: g, locucion: loc({ version: 1 }) };
    expect(puedeRenderizar(p)).toEqual({ ok: true, motivo: "", cancion: true });
    expect(puedeRenderizar({ ...p, aprobada_version: 2 }).motivo).toMatch(/aprueba el guion/);
    const mal = { ...p, guion: { ...g, escenas: g.escenas.map((e) => ({ ...e, habla: "otra cosa distinta" })) } };
    expect(puedeRenderizar(mal).ok).toBe(false);
  });
});

describe("la prueba de sincronía (karaoke)", () => {
  const letra = limpiarLetra(LETRA).letra;

  it("una escena por línea, el coro con fuerza, escenas sin letra en los huecos de más de 2 s y el logo al cierre; valida", () => {
    const oidas = oidasDe(LETRA, { inicio: 4, hueco: 5 });
    const lineas = lineasConTiempos(letra, oidas);
    expect(lineas.map((l) => l.coro)).toEqual([true, false, false, true]);
    const huecos = huecosInstrumentales(lineas, 32);
    expect(huecos.map((h) => h.cual)).toEqual(["intro", "puente", "final"]);
    const g = guionKaraoke({ titulo: "Toallitas", lineas, duracion: 32, cancion: cancion(32), formato: "9:16" });
    expect(validarGuion(g).ok).toBe(true);
    expect(g.cancion).toEqual({ archivo: "c-1", duracion: 32, nombre: "Toallitas" });
    expect(g.escenas.map((e) => e.id)).toEqual(["intro", "l1", "l2", "p2", "l3", "l4", "final"]);
    expect(g.escenas.find((e) => e.id === "intro").capas.some((c) => c.tipo === "logo")).toBe(true);
    expect(g.escenas.find((e) => e.id === "final").capas.some((c) => c.tipo === "logo")).toBe(true);
    expect(g.escenas.find((e) => e.id === "l1").capas[0]).toMatchObject({ rol: "titular", placa: "acento" });
    // La letra va tal cual: comprobarLetra no encuentra nada.
    expect(comprobarLetra(g, letra)).toEqual([]);
    // Con sus palabras, la línea de tiempo dura la canción y no tiene silencios.
    const l = lineaDeTiempo(g, palabrasDeLaCancion(g, { oidas, duracion: 32 }).palabras);
    expect(l.total).toBe(32);
    expect(l.silencios).toEqual([]);
  });

  it("sin final instrumental, el logo va en la última escena; las líneas muy seguidas se juntan", () => {
    const corta = "Hola\nya\nme voy contigo a la playa hoy";
    const oidas = oidasDe(corta, { inicio: 3, paso: 0.25 });
    const lineas = lineasConTiempos(limpiarLetra(corta).letra, oidas);
    const g = guionKaraoke({ lineas, duracion: oidas.at(-1).hasta + 1, cancion: cancion(oidas.at(-1).hasta + 1) });
    expect(g.escenas.at(-1).capas.some((c) => c.tipo === "logo")).toBe(true);
    expect(g.escenas.filter((e) => e.habla).map((e) => e.habla)).toEqual(["Hola ya", "me voy contigo a la playa hoy"]);
    expect(comprobarLetra(g, limpiarLetra(corta).letra)).toEqual([]);
  });
});

describe("comprobar la letra (lo que diseña la IA)", () => {
  const letra = "Toallitas suaves para tu bebé\nsin alcohol y sin perfume";
  const base = validarGuion(conCancion(["Toallitas suaves para tu bebé", "sin alcohol y sin perfume"], 20)).guion;

  it("cuadra con la letra tal cual (las mayúsculas y los signos no cuentan)", () => {
    expect(comprobarLetra({ escenas: [{ habla: "TOALLITAS suaves, para tu bebé" }, { habla: "sin alcohol y sin perfume." }] }, letra)).toEqual([]);
    expect(comprobarLetra(base, letra)).toEqual([]);
  });

  it("una palabra cambiada, de más o de menos: el error dice la escena y lo que dice la letra", () => {
    expect(comprobarLetra({ escenas: [{ habla: "Toallitas suaves para tu niño" }, { habla: "sin alcohol y sin perfume" }] }, letra)[0])
      .toMatchObject({ donde: "escenas[0].habla", mensaje: expect.stringMatching(/La letra dice «bebé/) });
    expect(comprobarLetra({ escenas: [{ habla: "Toallitas suaves para tu bebé" }] }, letra)[0].mensaje).toMatch(/Falta letra/);
    expect(comprobarLetra({ escenas: [{ habla: `${letra} ¡compra ya!` }] }, letra)[0].mensaje).toMatch(/Sobra/);
  });

  it("la aplicación le pone SU canción y le quita la música del guion", () => {
    const g = conLaCancion({ escenas: [], musica: { estilo: "pop" }, cancion: { archivo: "inventada" } }, { archivo: "c-9", duracion: 12.3456, nombre: "X" });
    expect(g).toEqual({ escenas: [], cancion: { archivo: "c-9", duracion: 12.346, nombre: "X" } });
  });

  it("el pedido a la IA lleva la letra por líneas con sus tiempos, el coro y los huecos, y las reglas", () => {
    const lineas = [{ texto: "La la", desde: 3, hasta: 4.5, coro: true }, { texto: "Mi bebé", desde: 9, hasta: 10, coro: false }];
    const huecos = [{ desde: 0, hasta: 3, cual: "intro" }, { desde: 4.5, hasta: 9, cual: "puente" }];
    const t = letraParaLaIA(lineas, huecos);
    expect(t.split("\n")[0]).toMatch(/HUECO instrumental \(intro/);
    expect(t).toMatch(/\(CORO\) La la/);
    const p = pedidoDeGuionCancion({ marca: "Baby Caleb", duracion: 12, lineas, huecos });
    expect(p).toMatch(/LETRA TAL CUAL/);
    expect(p).toMatch(/Sin «pausa»/);
    expect(p).toMatch(/CORO/);
  });
});

describe("lo que dura un audio y lo que cuesta", () => {
  it("WAV por su cabecera, M4A por su caja mvhd y MP3 por sus cuadros", () => {
    // WAV: 8.000 bytes por segundo y 24.000 de datos → 3 s.
    const wav = new Uint8Array(44 + 24000);
    const dv = new DataView(wav.buffer);
    wav.set([...new TextEncoder().encode("RIFF")], 0); dv.setUint32(4, 36 + 24000, true); wav.set([...new TextEncoder().encode("WAVEfmt ")], 8);
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true);
    dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); wav.set([...new TextEncoder().encode("data")], 36); dv.setUint32(40, 24000, true);
    expect(duracionDeAudio(wav, "audio/wav")).toBe(3);
    // M4A: ftyp + moov > mvhd (v0) con escala 1.000 y 42.500 → 42,5 s.
    const caja = (tipo, cuerpo) => { const b = new Uint8Array(8 + cuerpo.length); new DataView(b.buffer).setUint32(0, b.length); b.set(new TextEncoder().encode(tipo), 4); b.set(cuerpo, 8); return b; };
    const mvhd = new Uint8Array(100);
    new DataView(mvhd.buffer).setUint32(12, 1000);
    new DataView(mvhd.buffer).setUint32(16, 42500);
    const ftyp = caja("ftyp", new TextEncoder().encode("M4A \0\0\0\0"));
    const moov = caja("moov", caja("mvhd", mvhd));
    const m4a = new Uint8Array(ftyp.length + moov.length);
    m4a.set(ftyp); m4a.set(moov, ftyp.length);
    expect(duracionDeAudio(m4a, "audio/mp4")).toBe(42.5);
    // MP3 CBR de 128 kb/s: 16.000 bytes por segundo.
    const mp3 = new Uint8Array(64000);
    for (let i = 0; i + 4 < mp3.length; i += 417) mp3.set([0xff, 0xfb, 0x90, 0x44], i);
    expect(duracionDeAudio(mp3, "audio/mpeg")).toBeCloseTo(4, 1);
    expect(duracionDeAudio(new Uint8Array(4))).toBe(0);
  });

  it("sincronizar: lo de una alineación y lo más que puede costar (aislar y alinear otra vez); sin llave, lo de Gemini", () => {
    const c = costoDeSincronia(60);
    expect(c.minimo).toBeGreaterThan(0);
    expect(c.maximo).toBeGreaterThan(c.minimo + c.aislar - 0.001);
    expect(c.aprox).toBe(true);
    expect(costoDeSincronia(60, { elevenlabs: false })).toMatchObject({ minimo: 0.01, maximo: 0.01 });
  });
});
