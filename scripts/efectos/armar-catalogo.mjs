#!/usr/bin/env node
// ============================================================
// Arma el CATÁLOGO DE EFECTOS de la aplicación (src/lib/catalogoEfectos.datos.js + public/efectos/v1/*.mp3) a partir de:
//
//   · el banco de EARSHOT (github.com/Leonxlnx/earshot, MIT, commit 4ac3d2a): 252 efectos hechos con código. Se
//     renderizan una vez, SIN sus modelos, con `scripts/efectos/renderizar-earshot.py` (numpy, scipy, soundfile, soxr) y
//     de ellos entran los que pasan su propia auditoría (`earshot sfx check`: sin chasquidos, colas cortadas ni saturación);
//   · los sonidos de interfaz de UISFX (CC0, el paquete «studio» que trae github.com/Clipwing/skills): los 47 que sirven en
//     un video de marketing (sin los que suenan en bucle ni los de un editor de texto).
//
// No corre en CI ni en el despliegue: los MP3 y los datos se versionan (unos 4 MB) y la imagen del Container los copia.
// Cada efecto se MIDE aquí con el mismo código que lo usará el render (`muestrasDeEfecto` y `picoDeEfecto` sobre lo que
// ffmpeg decodifica del MP3, con la misma cadena que container/render.mjs): así el «pico» del catálogo es exactamente el
// que el Container pondrá sobre el corte.
//
//   node scripts/efectos/armar-catalogo.mjs <carpeta de los WAV de earshot> <lista.json de `earshot sfx list --json`> <carpeta de uisfx>
// ============================================================

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { muestrasDeEfecto, picoDeEfecto, MAX_EFECTO_CATALOGO } from "../../src/lib/efectosSonido.js";
import { RENDER } from "../../src/lib/renderVideo.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SALIDA = join(RAIZ, "public", "efectos", "v1");
const DATOS = join(RAIZ, "src", "lib", "catalogoEfectos.datos.js");
const [wavs, listaJson, uisfx] = process.argv.slice(2);
if (!wavs || !listaJson || !uisfx) {
  console.error("Uso: node scripts/efectos/armar-catalogo.mjs <wavs de earshot> <lista.json> <carpeta de uisfx>");
  process.exit(1);
}

/** El papel de cada «kind» de earshot (las reglas de cada papel, en src/lib/catalogoEfectos.js). */
const PAPEL_DE_KIND = {
  "whoosh.short": "transicion", suck: "transicion", zip: "transicion", "whoosh.long": "transicion_grande", riser: "subida",
  swell: "respiro", hit: "golpe", drop: "caida", land: "aterrizaje", "land.light": "toque", pop: "pop", click: "clic",
  "click.confirm": "confirmacion", tick: "tic", "tick.crisp": "tic", tock: "toc", key: "tecla", "key.space": "tecla",
  "key.return": "tecla", "key.run": "tecleo", text: "texto", bell: "campana", shimmer: "brillo", sting: "firma",
  glitch: "glitch", snap: "obturador",
};

/** El nombre en español de cada familia de earshot y para qué sirve. */
const FAMILIAS = {
  click: ["Clic", "un botón o el cursor que se pulsa"],
  cut_hit: ["Golpe de corte", "golpe grave y corto justo en un corte"],
  downlifter: ["Bajada", "la energía que cae tras un golpe o al salir de una escena"],
  drip: ["Gota", "gotas y burbujas: algo que aparece con suavidad"],
  "fit/bell": ["Campanita", "una campanita pequeña, un solo golpe"],
  "fit/click": ["Clic de plástico", "un clic pequeño de plástico"],
  "fit/hit": ["Golpe de bambú", "un golpe seco de madera"],
  "fit/key.space": ["Barra espaciadora", "la barra espaciadora de un teclado mecánico"],
  "fit/key": ["Tecla mecánica", "una tecla de teclado mecánico"],
  "fit/land.light": ["Toque con el dedo", "un dedo que toca un teléfono o una mesa"],
  "fit/pop": ["Pop de boca", "un pop corto y orgánico"],
  "fit/snap": ["Interruptor", "un interruptor que se acciona"],
  "fit/tick": ["Fichas de dominó", "fichas que chocan: un tic de madera"],
  "fit/whoosh.short": ["Whoosh de bambú", "un whoosh corto y real"],
  glitch: ["Glitch", "chisporroteo y ráfagas digitales"],
  hover_tick: ["Tic diminuto", "filas que pasan, el cursor encima de algo"],
  impact: ["Impacto de cine", "golpe grande con cola larga: revelar, un título que cae"],
  knock: ["Toc de madera", "nudillos sobre una mesa"],
  logo_sting: ["Firma de logo", "entrada, golpe y campanita: la aparición del logo"],
  mallet: ["Nota de mazo", "celesta, glockenspiel o marimba: una nota suave"],
  notify: ["Campana de aviso", "campanas: algo salió bien, llegó un mensaje"],
  pluck: ["Kalimba", "una lengüeta brillante sobre una caja de madera"],
  pop: ["Pop", "burbuja o corcho que salta"],
  pro_click: ["Clic brillante", "tics de interfaz brillantes"],
  pro_glitch: ["Glitch de corte", "un tartamudeo digital que termina en el corte"],
  pro_hover_tick: ["Tic digital", "parpadeo del cursor, contadores"],
  pro_impact: ["Impacto grave", "un golpe grave y seco"],
  pro_logo_sting: ["Firma de logo diseñada", "un gesto de lanzamiento que acaba en una nota"],
  pro_notify: ["Ding limpio", "dings cortos y limpios"],
  pro_pop: ["Pop tonal", "una palabra o un sello que aparece"],
  pro_pop_in: ["Pop de entrada", "un icono o un elemento que entra: golpe redondo y grave"],
  pro_riser: ["Subida corta", "subida entrecortada hacia un corte"],
  pro_shimmer: ["Destello", "chispas granuladas"],
  pro_sub_drop: ["Caída grave", "el bajo que florece después del corte"],
  pro_tap: ["Toque suave", "el golpecito grave de un toque"],
  pro_typing_key: ["Tecla diseñada", "tics para texto que se escribe"],
  pro_typing_run: ["Tecleo seguido", "una frase tecleada entera en un archivo"],
  pro_whoosh_big: ["Whoosh grave", "un barrido grave que crece hacia el corte"],
  pro_zip: ["Zip", "barridos tonales a través de un corte"],
  reverse_swell: ["Respiro inverso", "crece y llega justo después del corte"],
  riser: ["Subida", "tensión hacia una revelación; termina en su punto más fuerte"],
  shimmer: ["Brillo final", "campanitas que resuenan: el cierre, la tarjeta final"],
  shutter: ["Obturador", "una foto, un zoom de golpe"],
  sub_drop: ["Caída de bajo", "peso debajo de un golpe"],
  swipe: ["Deslizar", "tarjetas y paneles que pasan, pasar página"],
  swish: ["Swish", "movimientos rápidos y finos: un texto que se desliza"],
  tap: ["Toque en pantalla", "toques en una pantalla o una superficie"],
  toggle: ["Interruptor de ajustes", "un interruptor que se enciende (pulsar y encajar)"],
  typing_key: ["Tecla real", "teclas mecánicas, una por letra"],
  ui_pop: ["Pop redondo", "chips, burbujas, filas que llegan"],
  whoosh_big: ["Whoosh grande", "transiciones grandes de escena"],
  whoosh_fast: ["Whoosh rápido", "paneos rápidos, entradas volando, un elemento que se mueve"],
};

/** Los de UISFX que entran (cue → [nombre, papel]). */
const UISFX = {
  press: ["Pulsar", "clic"], "double-click": ["Doble clic", "clic"], "long-press": ["Pulsación larga", "clic"],
  select: ["Seleccionar", "clic"], "toggle-on": ["Encender", "clic"], "toggle-off": ["Apagar", "clic"], check: ["Marcar hecho", "confirmacion"],
  delete: ["Borrar", "interfaz"], cancel: ["Cancelar", "interfaz"],
  open: ["Abrir", "pop"], close: ["Cerrar", "pop"], expand: ["Desplegar", "pop"], collapse: ["Plegar", "pop"],
  drop: ["Soltar en su sitio", "toque"], snap: ["Encajar", "clic"], swipe: ["Deslizar", "transicion"],
  send: ["Enviar mensaje", "interfaz"], receive: ["Recibir mensaje", "interfaz"], notification: ["Notificación", "campana"],
  mention: ["Mención", "interfaz"], typing: ["Teclear", "tecla"], reaction: ["Reacción", "pop"],
  success: ["Éxito", "confirmacion"], error: ["Error", "interfaz"], warning: ["Advertencia", "interfaz"], info: ["Información", "interfaz"],
  blocked: ["Bloqueado", "interfaz"], start: ["Empezar", "interfaz"], "progress-step": ["Paso de progreso", "tic"],
  complete: ["Completado", "confirmacion"], checkpoint: ["Punto de control", "confirmacion"], play: ["Reproducir", "clic"],
  pause: ["Pausa", "clic"], lock: ["Bloquear", "clic"], unlock: ["Desbloquear", "clic"], reward: ["Recompensa", "campana"],
  "level-up": ["Subir de nivel", "campana"], achievement: ["Logro", "campana"], streak: ["Racha", "campana"], badge: ["Insignia", "campana"],
  bonus: ["Bonificación", "campana"], "add-to-cart": ["Añadir al carrito", "interfaz"], "remove-from-cart": ["Quitar del carrito", "interfaz"],
  checkout: ["Ir a pagar", "interfaz"], purchase: ["Compra hecha", "confirmacion"], coupon: ["Cupón aplicado", "confirmacion"],
  refund: ["Reembolso", "interfaz"],
};

const correr = (args, que) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], { encoding: "buffer", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${que}: ${r.stderr.toString().trim().split("\n").slice(-3).join(" | ")}`);
  return r.stdout;
};

/** El MP3 decodificado EXACTAMENTE como lo decodifica el Container (s16le estéreo al muestreo del render). */
const decodificar = (archivo) => {
  const m = String(RENDER.muestreo);
  return new Uint8Array(correr(["-i", archivo, "-vn", "-af", `aresample=${m}`, "-ac", "2", "-ar", m, "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"], `decodificar ${archivo}`));
};

const idSeguro = (s) => s.toLowerCase().replace(/\/+/g, "-").replace(/[^a-z0-9_-]+/g, "_");
const r3 = (n) => Math.round(n * 1000) / 1000;

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });
const catalogo = [];

/** Mide un MP3 ya escrito y lo apunta en el catálogo. */
function apuntar(entrada) {
  const s = muestrasDeEfecto(decodificar(join(SALIDA, entrada.archivo)), RENDER.muestreo, { max: MAX_EFECTO_CATALOGO });
  if (!s.length) throw new Error(`${entrada.id}: decodificado, no suena nada`);
  catalogo.push({ ...entrada, dur: r3(s.length / RENDER.muestreo), pico: picoDeEfecto(s, RENDER.muestreo) });
}

// 1. Earshot: los que pasan su auditoría, en MP3 mono a 48 kHz (lo que pase de 6 s se corta con un fundido).
const lista = JSON.parse(readFileSync(listaJson, "utf8")).sounds;
const renders = new Map(JSON.parse(readFileSync(join(wavs, "render.json"), "utf8")).map((r) => [r.id, r]));
let fuera = 0;
for (const s of lista) {
  const r = renders.get(s.id);
  if (!r || r.error || !r.ok || !existsSync(join(wavs, r.wav))) { fuera++; continue; }
  const familia = s.id.slice(0, s.id.lastIndexOf("/"));
  const miembro = s.id.slice(s.id.lastIndexOf("/") + 1);
  const [nombreFamilia, para] = FAMILIAS[familia] ?? [familia, ""];
  if (!FAMILIAS[familia]) throw new Error(`Falta el nombre en español de la familia ${familia}`);
  const papel = PAPEL_DE_KIND[s.kinds?.[0]];
  if (!papel) throw new Error(`${s.id}: el kind ${s.kinds?.[0]} no tiene papel`);
  const id = idSeguro(s.id);
  const archivo = `${id}.mp3`;
  const largo = Number(s.dur_s) > MAX_EFECTO_CATALOGO;
  correr([
    "-i", join(wavs, r.wav), "-ac", "1", "-ar", "48000",
    ...(largo ? ["-af", `atrim=0:${MAX_EFECTO_CATALOGO},afade=t=out:st=${MAX_EFECTO_CATALOGO - 0.08}:d=0.08`] : []),
    "-c:a", "libmp3lame", "-q:a", "3", join(SALIDA, archivo),
  ], `codificar ${s.id}`);
  apuntar({
    id, archivo, nombre: `${nombreFamilia} · ${miembro.replace(/_/g, " ")}`, familia: nombreFamilia, para, papel,
    papeles: [...new Set((s.kinds ?? []).map((k) => PAPEL_DE_KIND[k]).filter(Boolean))], fuente: "earshot", origen: s.id,
  });
}

// 2. UISFX: tal cual (ya son MP3 mono, CC0), sólo los que sirven en un video.
const manifiesto = JSON.parse(readFileSync(join(uisfx, "manifest.json"), "utf8"));
for (const a of manifiesto.assets.filter((x) => x.pack === "studio" && UISFX[x.cue])) {
  const [nombre, papel] = UISFX[a.cue];
  const id = `ui-${idSeguro(a.cue)}`;
  const archivo = `${id}.mp3`;
  writeFileSync(join(SALIDA, archivo), readFileSync(join(uisfx, a.files.mp3.path)));
  const cue = manifiesto.cues.find((c) => c.name === a.cue);
  apuntar({ id, archivo, nombre: `Interfaz · ${nombre}`, familia: "Interfaz", para: cue?.description ?? "", papel, papeles: [papel], fuente: "uisfx", origen: `studio/${a.cue}` });
}

// 3. Las licencias junto a los archivos.
writeFileSync(join(SALIDA, "LICENCIAS.txt"), [
  "Efectos de sonido del catálogo de la aplicación",
  "",
  "1) Los que empiezan por un nombre de familia de earshot (todos menos «ui-*») se generaron con el código de earshot",
  "   (https://github.com/Leonxlnx/earshot, commit 4ac3d2a), licencia MIT, Copyright (c) 2026 Leon Lin. Son síntesis",
  "   por código: no contienen grabaciones. Los «fit-*» se ajustaron a grabaciones CC0 1.0 de Freesound (sin copiar sus",
  "   muestras); gracias a steffcaffrey, qubodup, michorvath, Sadiquecat, zrrion, bigmonmulgrew, jentlemen, kyles, IENBA,",
  "   deraj, CapsLok, IanStarGem, Macif y Kinoton (la lista con cada grabación: docs/CREDITS_FIT.md de earshot).",
  "",
  "2) Los «ui-*» son de uisfx (paquete «studio», distribuido con https://github.com/Clipwing/skills): el audio es",
  "   CC0 1.0 (dominio público) y su código, MIT.",
  "",
].join("\n"));

catalogo.sort((a, b) => a.papel.localeCompare(b.papel) || a.id.localeCompare(b.id));
const cuerpo = catalogo.map((e) => `  ${JSON.stringify(e)},`).join("\n");
writeFileSync(DATOS, [
  "// GENERADO por scripts/efectos/armar-catalogo.mjs: no se edita a mano. Lo que significa cada campo y las reglas de cada",
  "// papel, en src/lib/catalogoEfectos.js. `dur` y `pico` (s) se midieron sobre el MP3 decodificado como lo hace el Container.",
  "export const EFECTOS_CATALOGO = Object.freeze([",
  cuerpo,
  "].map((e) => Object.freeze(e)));",
  "",
].join("\n"));

const bytes = readdirSync(SALIDA).reduce((n, f) => n + readFileSync(join(SALIDA, f)).length, 0);
console.log(`${catalogo.length} efectos (${catalogo.filter((e) => e.fuente === "earshot").length} de earshot, ${catalogo.filter((e) => e.fuente === "uisfx").length} de uisfx), ${fuera} de earshot fuera por su auditoría; ${(bytes / 1048576).toFixed(2)} MB.`);
