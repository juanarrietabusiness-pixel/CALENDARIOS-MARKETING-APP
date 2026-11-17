// ============================================================
// La prueba del AUDIO del render, DENTRO de la imagen (con su ffmpeg de Debian): `docker exec video node
// container/probarAudio.mjs`. Las tomas son como las de verdad: MP3 mono a 44,1 kHz y 128 kb/s (lo que devuelve
// ElevenLabs), con y sin pausas, y con una pausa DESPUÉS del final de la toma (la última palabra de la alineación puede
// acabar unos milisegundos más tarde que el archivo). Además, una toma cuyo muestreo cambia a la mitad, los EFECTOS del
// catálogo de la aplicación (los automáticos y una lista colocada por escena, capa y palabra: cada uno suena en su
// instante) y los de la biblioteca de sonido (un MP3 y un WAV subidos) en vez de los automáticos.
// ============================================================

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { audioDelVideo } from "./render.mjs";
import { RENDER } from "../src/lib/renderVideo.js";
import { validarGuion, lineaDeTiempo } from "../src/lib/videoEscenas.js";
import { EJEMPLO_GUION } from "../src/lib/videoFormatoIA.js";
import { colocadosAutomaticos, momentosColocados, instanteDe } from "../src/lib/efectosColocados.js";
import { efectoDelCatalogo } from "../src/lib/catalogoEfectos.js";
import { golpesDeCancion } from "./golpes.mjs";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const carpeta = await mkdtemp(join(tmpdir(), "probar-audio-"));
let mal = 0;

/** Un MP3 de `segundos` de un tono que sube y baja (como una voz), mono, al muestreo dado. */
function mp3(nombre, segundos, muestreo = 44100, volumen = "0.3+0.2*sin(2*PI*3*t)") {
  const salida = join(carpeta, nombre);
  const r = spawnSync(FFMPEG, ["-hide_banner", "-y", "-f", "lavfi", "-i",
    `sine=frequency=220:sample_rate=${muestreo}:duration=${segundos},volume='${volumen}':eval=frame`,
    "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", salida], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`no se pudo hacer ${nombre}: ${r.stderr.slice(-400)}`);
  return salida;
}

/** Un WAV de `segundos` de un tono corto que cae (como un «pop» subido), mono, a 48 kHz. */
function wav(nombre, segundos) {
  const salida = join(carpeta, nombre);
  const r = spawnSync(FFMPEG, ["-hide_banner", "-y", "-f", "lavfi", "-i",
    `sine=frequency=880:sample_rate=48000:duration=${segundos},volume='exp(-t*18)':eval=frame`,
    "-ac", "1", "-c:a", "pcm_s16le", salida], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`no se pudo hacer ${nombre}: ${r.stderr.slice(-400)}`);
  return salida;
}

/** La duración de un archivo de audio según ffprobe… o ffmpeg (la imagen no tiene por qué traer ffprobe). */
function duracion(archivo) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", archivo, "-f", "null", "-"], { encoding: "utf8" });
  const t = [...r.stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : NaN;
}

/** El nivel (RMS, 0–1) del audio de `archivo` entre `desde` y `hasta` segundos. */
function nivel(archivo, desde, hasta) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", archivo, "-ss", String(desde), "-t", String(hasta - desde), "-ac", "1", "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
  const b = Buffer.from(r.stdout ?? []);
  let suma = 0;
  for (let i = 0; i + 1 < b.length; i += 2) suma += (b.readInt16LE(i) / 32768) ** 2;
  return b.length ? Math.sqrt(suma / (b.length / 2)) : 0;
}

async function caso(titulo, audio, silencios, total, { callado = null, suena = null, guion = null, linea = null, efectos = false, musica = null, colocados = [], propios = {}, libreria = {}, cuantos = null, umbral = 0.02 } = {}) {
  const salida = join(carpeta, `${titulo.replace(/\W+/g, "-")}.m4a`);
  try {
    const m = await audioDelVideo(carpeta, { audio, linea: linea ?? { silencios }, total, salida, guion, efectos, musica, colocados, propios, libreria });
    if (cuantos !== null && m?.efectos?.cuantos !== cuantos) throw new Error(`sonaron ${m?.efectos?.cuantos} efectos, no ${cuantos}`);
    const dur = duracion(salida);
    if (!(Math.abs(dur - total) < 0.06)) throw new Error(`el audio dura ${dur} s, no ${total}`);
    // Con voz, o con sólo música (una foto con música): normalizado a -14 LUFS y sin pasarse de pico.
    const normalizado = audio || musica;
    if (normalizado && !(Math.abs((m?.lufs ?? NaN) - RENDER.lufs) <= 1)) throw new Error(`quedó en ${m?.lufs} LUFS`);
    if (normalizado && !(m?.pico <= RENDER.pico + 0.5)) throw new Error(`el pico quedó en ${m?.pico} dB`);
    // La pausa está donde tiene que estar: callada en su sitio y con voz justo antes (sin contar lo que AAC emborrona).
    if (callado && nivel(salida, ...callado) > 0.003) throw new Error(`entre ${callado.join(" y ")} s debería haber silencio`);
    if (suena && nivel(salida, ...suena) < umbral) throw new Error(`entre ${suena.join(" y ")} s debería sonar (${nivel(salida, ...suena).toFixed(4)})`);
    console.log(`✓ ${titulo} (${dur.toFixed(2)} s${m ? `, ${m.lufs} LUFS, pico ${m.pico} dB` : ""})`);
  } catch (e) {
    mal++;
    console.error(`✗ ${titulo}: ${e.message}`);
  }
}

try {
  const voz = await readFile(mp3("voz.mp3", 47.647));
  await caso("MP3 sin pausas", voz, [], 47.7);
  await caso("MP3 con una pausa en medio", voz, [{ en: 4.2, dur: 0.4 }], 48.1, { suena: [3.9, 4.15], callado: [4.25, 4.55] });
  await caso("MP3 con pausa en medio y al final (después del archivo)", voz, [{ en: 4.2, dur: 0.4 }, { en: 47.68, dur: 0.5 }], 48.6, { callado: [48.15, 48.55] });
  await caso("MP3 con pausa justo al final", voz, [{ en: 47.6, dur: 0.5 }], 48.15);
  await caso("MP3 con pausa al principio", voz, [{ en: 0, dur: 0.6 }], 48.3, { callado: [0.05, 0.55], suena: [0.7, 1] });
  await caso("MP3 con muchas pausas", voz, [0.4, 0.8, 0.3, 1.2, 0.5].map((dur, i) => ({ en: 5 + i * 8, dur })), 50.9);
  // Como una voz de verdad: bajita y con golpes fuertes (la ganancia sola llevaría el pico por encima de -1,5 dB, así
  // que entra el limitador).
  const conPicos = await readFile(mp3("picos.mp3", 20, 44100, "if(lt(mod(t,0.7),0.03),0.9,0.04)"));
  await caso("Voz con picos (limitador) y una pausa", conPicos, [{ en: 6, dur: 0.5 }], 20.6, { callado: [6.05, 6.45] });
  // Dos MP3 pegados con muestreos distintos: el decodificador cambia de parámetros a la mitad.
  const pegado = Buffer.concat([await readFile(mp3("a.mp3", 6, 44100)), await readFile(mp3("b.mp3", 6, 22050))]);
  await caso("MP3 que cambia de muestreo a la mitad", pegado, [{ en: 3, dur: 0.5 }], 12.6);
  await caso("Sin voz", null, [], 5);
  // El guion de ejemplo con los efectos y una música corta (se repite) por debajo: sigue en -14 LUFS y en su duración;
  // en el silencio de la pausa ya no hay silencio total (suena la música) pero sí mucho menos que la voz.
  const g = validarGuion(JSON.parse(JSON.stringify(EJEMPLO_GUION))).guion;
  const l = lineaDeTiempo(g, null);
  const vozEjemplo = await readFile(mp3("voz-ejemplo.mp3", Math.max(1, l.total - 1)));
  const tema = await readFile(mp3("tema.mp3", 4, 44100, "0.5"));
  const automaticos = colocadosAutomaticos(g, l);
  if (!automaticos.length) { mal++; console.error("✗ el ejemplo debería tener efectos (transiciones o sellos)"); }
  // Los automáticos, del CATÁLOGO (los MP3 de la imagen): el pop de un sello suena en su instante.
  const popAuto = automaticos.find((c) => c.capa);
  const tPop = popAuto ? instanteDe(popAuto, g, l).t : null;
  await caso("Con efectos (los automáticos, del catálogo) y música de fondo (ducking y fundido)", vozEjemplo, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, musica: { audio: tema, volumen: 0 }, cuantos: automaticos.length,
  });
  // Sin voz ni música el audio no se normaliza: los efectos quedan bajitos (a su nivel de siempre), pero suenan donde van.
  await caso("Los automáticos del catálogo suenan en su instante (sin voz ni música)", null, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, cuantos: automaticos.length, umbral: 0.003, ...(tPop !== null ? { suena: [tPop, tPop + 0.08] } : {}),
  });
  // Una LISTA colocada (escena, capa, palabra y segundo): manda sobre los automáticos y cada uno suena en su instante.
  const lista = [
    { sonido: "whoosh_fast-crisp", escena: "e2" },
    { sonido: "ui_pop-soft", escena: "e2", capa: "s" },
    { sonido: "cut_hit-punch", palabra: "precio" },
    { sonido: "ui-success", segundo: 1 },
    { sonido: "ui-add-to-cart", escena: "nada" },
  ];
  const datos = (c) => { const e = efectoDelCatalogo(c.sonido); return e ? { papel: e.papel, pico: e.pico, nombre: e.nombre } : null; };
  const { momentos, sinSitio } = momentosColocados(lista, g, l, datos);
  if (sinSitio.length !== 1 || momentos.length !== 4) { mal++; console.error(`✗ la lista: ${momentos.length} con sitio y ${sinSitio.length} sin (se esperaban 4 y 1)`); }
  const golpe = momentos.find((x) => x.clave === "cut_hit-punch");
  await caso("Con una lista colocada (escena, capa, palabra y segundo; una sin sitio)", null, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, colocados: lista, cuantos: 4, umbral: 0.003, ...(golpe ? { suena: [golpe.en, golpe.en + 0.1], callado: [golpe.en - 0.4, golpe.en - 0.15] } : {}),
  });
  await caso("La lista con voz y música (la música baja antes del golpe)", vozEjemplo, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, colocados: lista, musica: { audio: tema, volumen: 0 }, cuantos: 4,
  });
  // Una transición «golpe» suena a IMPACTO (un golpe grave del catálogo) en su destello, la mitad de la transición.
  const gGolpe = JSON.parse(JSON.stringify(EJEMPLO_GUION));
  gGolpe.escenas[1].transicion = { tipo: "golpe", dur: 0.34 };
  const gg = validarGuion(gGolpe).guion;
  const lg = lineaDeTiempo(gg, null);
  const impacto = colocadosAutomaticos(gg, lg).find((c) => c.sonido === "pro_impact-air");
  const tImpacto = impacto ? instanteDe(impacto, gg, lg).t + (impacto.ajusteMs ?? 0) / 1000 : null;
  if (!gg || tImpacto === null) { mal++; console.error("✗ una transición «golpe» debería llevar su impacto automático"); }
  // Antes del destello ya no hay silencio: sube la «subida» que termina en él (CAPAS_DEL_GOLPE).
  else await caso("Un golpe suena a impacto en el destello (con su subida antes)", null, lg.silencios, lg.total, { guion: gg, linea: lg, efectos: true, umbral: 0.003, suena: [tImpacto - 0.3, tImpacto + 0.15] });
  // Los EFECTOS de la biblioteca de sonido (subidos por la agencia: un MP3 con silencio delante y un WAV corto), en vez
  // de los automáticos: el audio sigue en -14 LUFS y en su duración, y en el instante de un sello suena.
  const whooshSubido = await readFile(mp3("whoosh-subido.mp3", 1.2, 44100, "if(lt(t,0.3),0,0.6)"));
  const popSubido = await readFile(wav("pop-subido.wav", 0.25));
  const propios = { transicion: { archivoId: "whoosh-subido", nombre: "Whoosh subido" }, sello: { archivoId: "pop-subido", nombre: "Pop subido" } };
  await caso("Con efectos SUBIDOS (biblioteca de sonido) y música", vozEjemplo, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, musica: { audio: tema, volumen: 0 }, propios, libreria: { "whoosh-subido": whooshSubido, "pop-subido": popSubido },
    cuantos: automaticos.length, ...(tPop !== null ? { suena: [tPop, tPop + 0.2] } : {}),
  });
  // Uno que no se puede leer no tumba el audio: suena el de la aplicación.
  await caso("Con un efecto subido que no se puede leer (va el de la aplicación)", vozEjemplo, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, propios: { sello: propios.sello }, libreria: { "pop-subido": Buffer.from("no es un audio") }, cuantos: automaticos.length,
  });
  // Con los efectos apagados, ni los automáticos ni la lista.
  await caso("Con los efectos apagados", vozEjemplo, l.silencios, l.total, { guion: g, linea: l, efectos: false, colocados: lista, cuantos: 0 });
  // Una foto con música (src/lib/conMusica.js): sin voz, la escena entera es un silencio insertado y debajo sólo la
  // música, repetida; tiene que oírse a -14 LUFS (sin voz que la mida quedaba muy baja) y sonar en medio.
  await caso("Sólo música, sin voz (una foto con música)", null, [{ en: 0, dur: 10 }], 10, { musica: { audio: tema, volumen: 0 }, suena: [4, 6] });
  // «Video con tu canción» (src/lib/videoCancion.js): la toma ES la canción. Sin silencios insertados, el video dura lo
  // que ella y su final instrumental suena (no se corta tras la última palabra + la cola), en -14 LUFS y con los efectos.
  const gCancion = validarGuion({
    cancion: { archivo: "c1", duracion: 14 },
    escenas: [{ id: "a", tipo: "explicacion", habla: "la la la mi canción", transicion: { tipo: "fundido" } }, { id: "fin", tipo: "cierre", habla: "", transicion: { tipo: "fundido" }, capas: [{ tipo: "logo" }] }],
  }).guion;
  const lCancion = lineaDeTiempo(gCancion, null);
  if (!gCancion || lCancion.silencios.length || lCancion.total !== 14) { mal++; console.error("✗ la línea de una canción no lleva silencios y dura lo que la canción"); }
  const cancion = await readFile(mp3("cancion.mp3", 14, 44100, "0.4+0.1*sin(2*PI*2*t)"));
  await caso("Canción sin silencios (la duración manda)", cancion, lCancion.silencios, lCancion.total, { guion: gCancion, linea: lCancion, efectos: true, suena: [13.2, 13.8] });

  // Los GOLPES de una canción (POST /golpes): un MP3 con un bombo cada 0,5 s → 120 BPM y un golpe por bombo.
  const bombo = join(carpeta, "bombo.mp3");
  const rb = spawnSync(FFMPEG, ["-hide_banner", "-y", "-f", "lavfi", "-i",
    "sine=frequency=60:sample_rate=44100:duration=10,volume='if(gte(t,0.3),exp(-mod(t-0.3,0.5)*40),0)':eval=frame",
    "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", bombo], { encoding: "utf8" });
  if (rb.status !== 0) { mal++; console.error(`✗ no se pudo hacer el bombo: ${rb.stderr.slice(-300)}`); } else {
    const g = await golpesDeCancion(await readFile(bombo));
    const bien = Math.abs(g.bpm - 120) <= 2 && g.golpes.length >= 17 && g.golpes.length <= 22;
    if (bien) console.log(`✓ Golpes de una canción (${g.bpm} BPM, ${g.golpes.length} golpes, el primero en ${g.golpes[0]} s)`);
    else { mal++; console.error(`✗ Golpes de una canción: ${g.bpm} BPM y ${g.golpes.length} golpes (se esperaban 120 y ~20)`); }
  }
} finally {
  await rm(carpeta, { recursive: true, force: true });
}
if (mal) {
  console.error(`${mal} caso(s) fallaron.`);
  process.exit(1);
}
console.log("Audio: todo bien.");
