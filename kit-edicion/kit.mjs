#!/usr/bin/env node
// ============================================================
// El KIT DE EDICIÓN de Juancito Ads: lo que corre Claude en el chat para editar un video grabado
//
// `node ~/kit/kit.mjs <paso>` desde la carpeta del proyecto (donde están plan.json y los clips). Las DECISIONES las toma
// la lógica pura del calendario (lib/: el corte, la música por compases, el plan; la misma que se prueba en su
// repositorio) y lo PESADO lo hace Python (python/: transcribir, medir, limpiar la voz, mezclar). Todo es REANUDABLE: cada
// paso deja su resultado en trabajo/ y `siguiente` hace sólo lo que falta (los procesos del chat mueren al responder).
//
//   preparar <clips…|carpeta>   copia los clips a clips/ y escribe un plan.json de partida
//   transcribir                  palabra por palabra (faster-whisper large-v3-turbo); por clip, salta lo hecho
//   cortar                       energía, tomas, silencios y la línea de tiempo; enseña lo transcrito con sus índices
//   voz                          la voz limpia, al mismo nivel, montada
//   compases <canción>           tempo, primer compás y energía de cada compás (para escoger los tramos)
//   musica                       la canción cortada al montaje en compases (plan.musica)
//   mezcla                       voz + música con ducking + efectos del catálogo; máster a −14 LUFS
//   crudo                        el corte en crudo con la mezcla (salida/crudo.mp4) para que la persona lo apruebe
//   medir [archivo]              LUFS y pico verdadero de un archivo terminado
//   hoja <video> [cada] [desde] [hasta]   hoja de contactos (salida/hoja-<nombre>.jpg)
//   siguiente                    el próximo paso que falta (o qué decisión falta en el plan)
//   estado                       qué está hecho y qué no
// ============================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, copyFileSync, linkSync } from "node:fs";
import { join, dirname, basename, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import process from "node:process";
import { Buffer } from "node:buffer";

const KIT = dirname(fileURLToPath(import.meta.url));
// En el zip, lib/ va al lado; en el repositorio del calendario, es src/lib.
const LIB = existsSync(join(KIT, "lib", "corteEdicion.js")) ? join(KIT, "lib") : join(KIT, "..", "src", "lib");
const cargar = (n) => import(pathToFileURL(join(LIB, n)).href);
const { OFICIO } = await cargar("oficioEdicion.js");
const corte = await cargar("corteEdicion.js");
const { montarCancion } = await cargar("musicaEdicion.js");
const { validarPlan, instante, efectosResueltos, tramoDeRealce, VERSION_PLAN } = await cargar("planEdicion.js");
const { EFECTOS_CATALOGO } = await cargar("catalogoEfectos.datos.js");
const { KIT_EDICION } = await cargar("kitEdicionVersion.js");

const VERSION = KIT_EDICION.version;
const DOMINIO = (process.env.KIT_DOMINIO || (existsSync(join(KIT, ".dominio")) ? readFileSync(join(KIT, ".dominio"), "utf8").trim() : "")
  || "https://calendarios.juanarrietabusiness.workers.dev").replace(/\/$/, "");
const PROYECTO = process.cwd();
const T = join(PROYECTO, "trabajo");
const PLAN = join(PROYECTO, "plan.json");
const CATALOGO = new Map(EFECTOS_CATALOGO.map((e) => [e.id, e]));
const VIDEO = /\.(mov|mp4|m4v|mkv|webm)$/i;

const leer = (ruta, defecto) => { try { return JSON.parse(readFileSync(ruta, "utf8")); } catch (e) { if (defecto !== undefined) return defecto; throw e; } };
const escribir = (ruta, datos) => { mkdirSync(dirname(ruta), { recursive: true }); writeFileSync(ruta, JSON.stringify(datos, null, 1)); };
const mtime = (ruta) => { try { return statSync(ruta).mtimeMs; } catch { return 0; } };
const s2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
function fallo(msg) { console.error(`\n✗ ${msg}`); process.exit(1); }

function plan() {
  if (!existsSync(PLAN)) fallo("No hay plan.json aquí. Empieza con: node <kit>/kit.mjs preparar <clips o carpeta>");
  let p;
  try { p = JSON.parse(readFileSync(PLAN, "utf8")); } catch (e) { fallo(`plan.json no es JSON válido: ${e.message}`); }
  return p;
}
const archivoDe = (c) => resolve(PROYECTO, c.archivo);

function python(script, ...args) {
  mkdirSync(T, { recursive: true });
  writeFileSync(join(T, "oficio.json"), JSON.stringify(OFICIO));
  const r = spawnSync("python3", [join(KIT, "python", script), T, ...args.map(String)], { stdio: "inherit" });
  if (r.status !== 0) fallo(`El paso ${script} falló (código ${r.status}). Si el proceso se cortó, vuelve a correrlo: sigue donde iba.`);
}

function comprobarForma(p) {
  const { errores, avisos } = validarPlan(p, { catalogo: new Set(CATALOGO.keys()), clipsEnDisco: new Set((p.clips ?? []).filter((c) => c.archivo && existsSync(archivoDe(c))).map((c) => c.archivo)) });
  return { errores, avisos };
}

// ---------------------------------------------------------------- los pasos

function preparar(rutas) {
  if (!rutas.length) fallo("Dime qué clips: node kit.mjs preparar <clip1> <clip2>… o una carpeta.");
  // En orden de nombre (el de la cámara suele ser el de grabación); el montaje se reordena en el plan.
  const archivos = rutas.flatMap((r) => (statSync(r).isDirectory() ? readdirSync(r).filter((n) => VIDEO.test(n)).map((n) => join(r, n)) : [r]))
    .sort((a, b) => basename(a).localeCompare(basename(b), "es", { numeric: true }));
  if (!archivos.length) fallo("No encuentro videos (.mov, .mp4, .m4v, .mkv, .webm).");
  mkdirSync(join(PROYECTO, "clips"), { recursive: true });
  const clips = archivos.map((a) => {
    const id = basename(a, extname(a)).replace(/[^\w.-]/g, "_");
    const destino = join(PROYECTO, "clips", `${id}${extname(a).toLowerCase()}`);
    if (resolve(a) !== destino && !existsSync(destino)) { try { linkSync(a, destino); } catch { copyFileSync(a, destino); } }
    return { id, archivo: `clips/${basename(destino)}` };
  });
  if (existsSync(PLAN)) {
    console.log("Ya hay un plan.json: no lo toco. Clips preparados en clips/.");
  } else {
    escribir(PLAN, { version: VERSION_PLAN, fps: 30, cierre: OFICIO.cierre.segundos, indicacion: "", clips, realces: [], efectos: [], apartar: [] });
    console.log(`plan.json de partida con ${clips.length} clips en este orden: ${clips.map((c) => c.id).join(", ")}.`);
    console.log("Pon en «indicacion» el nombre de la marca y su rubro (ayuda al reconocimiento) y ordena los clips como irán en el montaje.");
  }
  console.log("Siguiente: node kit.mjs transcribir");
}

function transcribir() {
  const p = plan();
  const faltan = (p.clips ?? []).filter((c) => !existsSync(archivoDe(c)));
  if (faltan.length) fallo(`No encuentro: ${faltan.map((c) => c.archivo).join(", ")}`);
  escribir(join(T, "clips.json"), { indicacion: p.indicacion ?? "", clips: p.clips.map((c) => ({ id: c.id, archivo: archivoDe(c) })) });
  python("transcribir.py");
  for (const c of p.clips) {
    const t = leer(join(T, "transcripcion", `${c.id}.json`));
    console.log(`\n${c.id}: ${t.palabras.map((w, i) => `${i}:${w.w}`).join(" ")}`);
  }
  console.log("\nSiguiente: node kit.mjs cortar (quita tomas con «excluir» en el plan si hace falta).");
}

/** El corte: lee transcripciones y energía y escribe trabajo/linea.json. Devuelve lo calculado. */
function calcularCorte({ hablar = true } = {}) {
  const p = plan();
  const { errores } = comprobarForma(p);
  if (errores.length) fallo(`El plan tiene errores:\n  · ${errores.join("\n  · ")}`);
  const faltan = p.clips.filter((c) => !existsSync(join(T, "transcripcion", `${c.id}.json`)));
  if (faltan.length) fallo(`Falta transcribir: ${faltan.map((c) => c.id).join(", ")} (node kit.mjs transcribir).`);
  escribir(join(T, "clips.json"), { indicacion: p.indicacion ?? "", clips: p.clips.map((c) => ({ id: c.id, archivo: archivoDe(c) })) });
  python("energia.py");
  const datos = p.clips.map((c) => {
    const { palabras } = leer(join(T, "transcripcion", `${c.id}.json`));
    const energia = leer(join(T, "energia", `${c.id}.json`));
    if (!palabras.length) fallo(`El clip ${c.id} no tiene palabras transcritas: quítalo del plan o revisa su audio.`);
    const r = corte.corteDelClip(palabras, energia, { excluir: c.excluir ?? [] });
    if (!r.palabras.length) fallo(`En el clip ${c.id} no queda ninguna palabra con lo que excluye el plan.`);
    return { id: c.id, velocidad: c.velocidad ?? 1, piezas: r.piezas, palabras, quedan: r.palabras, energia };
  });
  const linea = corte.lineaDeTiempo(datos, { fps: p.fps ?? 30, cierre: p.cierre ?? OFICIO.cierre.segundos });
  const palabras = corte.palabrasEnSalida(linea, datos);
  const { errores: e2, avisos } = validarPlan(p, { palabras, catalogo: new Set(CATALOGO.keys()) });
  // Sólo si cambió: su fecha es la que dice a los pasos de después que hay que rehacerlos.
  const nueva = JSON.stringify({ ...linea, palabras, quedan: Object.fromEntries(datos.map((d) => [d.id, d.quedan])) }, null, 1);
  const rutaLinea = join(T, "linea.json");
  if (!existsSync(rutaLinea) || readFileSync(rutaLinea, "utf8") !== nueva) writeFileSync(rutaLinea, nueva);
  writeFileSync(join(T, "corte.hecho"), new Date().toISOString()); // el corte está al día con este plan
  if (hablar) {
    for (const d of datos) {
      const rep = corte.tomasRepetidas(d.palabras);
      const piezas = d.piezas.map(([a, b]) => `${s2(a)}–${s2(b)}`).join(" · ");
      console.log(`${d.id}${d.velocidad !== 1 ? ` (×${d.velocidad})` : ""}: ${d.piezas.length} piezas: ${piezas}`);
      for (const x of rep) console.log(`   ¿toma repetida? quitar [${x.quitar.join(", ")}]: ${x.porque}`);
    }
    console.log(`\nVoz: ${s2(linea.vozFin)} s + cierre ${s2(linea.cierre)} s = ${s2(linea.total / linea.fps)} s (${linea.total} cuadros).`);
    console.log(`Cambios de clip: ${linea.cambiosClip.map(s2).join(", ") || "—"} · saltos dentro de un clip: ${linea.saltos.map(s2).join(", ") || "—"}`);
    console.log("\nLas palabras del montaje (su índice es el que usan «palabra» en efectos, realces, apartar y el llamado):");
    let fila = [];
    palabras.forEach((w, i) => {
      fila.push(`[${i}] ${w.w} ${s2(w.s)}`);
      if (fila.length === 6 || i === palabras.length - 1) { console.log("  " + fila.join("  ")); fila = []; }
    });
    for (const a of avisos) console.log(`aviso: ${a}`);
    if (e2.length) console.log(`\nOJO, el plan tiene errores con estas palabras:\n  · ${e2.join("\n  · ")}`);
  }
  return { p, linea, palabras, datos };
}

function voz() {
  const { p, linea, palabras } = calcularCorte({ hablar: false });
  const clips = Object.fromEntries(p.clips.map((c) => [c.id, { archivo: archivoDe(c), vel: c.velocidad ?? 1, ganancia: c.ganancia ?? 0, presencia: Boolean(c.presencia) }]));
  const realces = (p.realces ?? []).map((r) => [...(tramoDeRealce(r, palabras) ?? []), r.db]).filter((x) => x.length === 3);
  escribir(join(T, "voz_plan.json"), { duracion: linea.total / linea.fps, piezas: linea.piezas, clips, realces });
  python("voz.py");
}

function compases(cancion) {
  if (!cancion || !existsSync(cancion)) fallo("Dime la canción: node kit.mjs compases <archivo de la canción>");
  python("compases.py", resolve(cancion));
  console.log("\nCon a0 y pulso escribe plan.musica: { archivo, a0, pulso, tramos: [{ cancion: [desde, hasta], video }], llamado: { palabra } }.");
}

function duracionDe(ruta) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

function musica() {
  const p = plan();
  const linea = leer(join(T, "linea.json"), null) ?? calcularCorte({ hablar: false }).linea;
  const m = p.musica;
  if (!m) fallo("Falta la música en el plan (plan.musica). De la biblioteca del cliente (musicas) o de Suno (generar_musica); luego node kit.mjs compases <canción>.");
  const archivo = resolve(PROYECTO, m.archivo);
  if (!existsSync(archivo)) fallo(`No encuentro la canción ${m.archivo}.`);
  const r = montarCancion({ a0: m.a0, pulso: m.pulso, pulsosPorCompas: m.pulsosPorCompas ?? 4, duracionCancion: duracionDe(archivo), duracionVideo: linea.total / linea.fps, tramos: m.tramos });
  if (r.errores.length) fallo(`La música no encaja:\n  · ${r.errores.join("\n  · ")}`);
  for (const a of r.avisos) console.log(`aviso: ${a}`);
  escribir(join(T, "musica_plan.json"), { archivo, duracion: linea.total / linea.fps, tramos: r.tramos });
  python("musica.py");
}

async function efectoLocal(e) {
  const local = join(KIT, "..", "public", "efectos", "v1", e.archivo);
  if (existsSync(local)) return local;
  const cache = join(homedir(), ".cache", "kit-edicion", "efectos");
  const ruta = join(cache, e.archivo);
  if (existsSync(ruta)) return ruta;
  mkdirSync(cache, { recursive: true });
  const res = await fetch(`${DOMINIO}/efectos/v1/${encodeURIComponent(e.archivo)}`);
  if (!res.ok) fallo(`No pude bajar el efecto ${e.id} (${res.status}) de ${DOMINIO}.`);
  writeFileSync(ruta, Buffer.from(await res.arrayBuffer()));
  return ruta;
}

async function mezcla() {
  const { p, linea, palabras } = calcularCorte({ hablar: false });
  if (!existsSync(join(T, "voz.wav")) || mtime(join(T, "voz.wav")) < mtime(join(T, "linea.json"))) voz();
  const conMusica = Boolean(p.musica);
  if (conMusica && (!existsSync(join(T, "musica.wav")) || mtime(join(T, "musica.wav")) < mtime(PLAN))) musica();
  const efectos = [];
  for (const e of efectosResueltos(p, palabras)) {
    const c = CATALOGO.get(e.id);
    efectos.push({ ...e, ruta: await efectoLocal(c), pico: c.pico ?? 0 });
  }
  // Los tramos del informe: cada clip en la salida y el cierre.
  const tramos = [];
  for (const pz of linea.piezas) {
    const ult = tramos[tramos.length - 1];
    if (ult && ult.nombre === pz.clip) ult.hasta = pz.out1;
    else tramos.push({ nombre: pz.clip, desde: pz.out0, hasta: pz.out1 });
  }
  tramos.push({ nombre: "cierre", desde: linea.vozFin, hasta: linea.total / linea.fps });
  escribir(join(T, "mezcla_plan.json"), {
    duracion: linea.total / linea.fps, vozFin: linea.vozFin, conMusica,
    llamado: conMusica && p.musica.llamado ? instante(p.musica.llamado, palabras) : null,
    apartar: (p.apartar ?? []).map((a) => instante(a, palabras)).filter((x) => x !== null),
    efectos, tramos,
  });
  python("mezcla.py");
}

function crudo() {
  const p = plan();
  const linea = leer(join(T, "linea.json"));
  if (!existsSync(join(T, "mezcla.wav"))) fallo("Falta la mezcla: node kit.mjs mezcla");
  escribir(join(T, "crudo_plan.json"), { fps: linea.fps, cierre: linea.cierre, piezas: linea.piezas, clips: Object.fromEntries(p.clips.map((c) => [c.id, archivoDe(c)])) });
  python("crudo.py");
  python("medir.py", join(PROYECTO, "salida", "crudo.mp4"));
}

// ---------------------------------------------------------------- qué falta

/** ¿Hay que (re)hacer `salida`? Si no existe o es más vieja que alguna de sus entradas. */
const viejo = (salida, ...entradas) => !existsSync(salida) || mtime(salida) < Math.max(0, ...entradas.map(mtime));

function pasos() {
  const p = existsSync(PLAN) ? plan() : null;
  if (!p) return [{ nombre: "preparar", falta: true, por: "no hay plan.json" }];
  const trans = (p.clips ?? []).map((c) => join(T, "transcripcion", `${c.id}.json`));
  const linea = join(T, "linea.json");
  const voz = join(T, "voz.wav");
  const musica = join(T, "musica.wav");
  const mezcla = join(T, "mezcla.wav");
  return [
    { nombre: "transcribir", falta: trans.some((t) => !existsSync(t)), por: "faltan clips por transcribir" },
    { nombre: "cortar", falta: viejo(join(T, "corte.hecho"), PLAN, ...trans), por: "el plan o las transcripciones cambiaron" },
    { nombre: "voz", falta: viejo(voz, linea, PLAN), por: "el corte cambió" },
    p.musica
      ? { nombre: "musica", falta: viejo(musica, PLAN, linea), por: "el plan de la música cambió" }
      : { nombre: "musica", decide: "falta plan.musica (biblioteca del cliente o Suno; node kit.mjs compases <canción>)" },
    { nombre: "mezcla", falta: viejo(mezcla, voz, PLAN, ...(p.musica ? [musica] : [])), por: "la voz, la música o los efectos cambiaron" },
    { nombre: "crudo", falta: viejo(join(PROYECTO, "salida", "crudo.mp4"), mezcla), por: "la mezcla cambió" },
  ];
}

function estado() {
  console.log(`Kit de edición v${VERSION} · ${PROYECTO}`);
  for (const x of pasos()) console.log(`  ${x.decide ? "? decide" : x.falta ? "· falta " : "✓ hecho "} ${x.nombre}${x.decide ? ` — ${x.decide}` : x.falta ? ` (${x.por})` : ""}`);
}

async function siguiente() {
  const lista = pasos();
  const p = lista.find((x) => x.falta || x.decide);
  if (!p) { console.log("Todo hecho. El corte en crudo está en salida/crudo.mp4."); return; }
  if (p.decide) { console.log(`Antes de seguir: ${p.decide}. (Sin música también se puede mezclar: node kit.mjs mezcla.)`); return; }
  console.log(`→ ${p.nombre} (${p.por})`);
  await ejecutar(p.nombre, []);
}

async function ejecutar(paso, args) {
  switch (paso) {
    case "preparar": return preparar(args);
    case "transcribir": return transcribir();
    case "cortar": return void calcularCorte();
    case "voz": return voz();
    case "compases": return compases(args[0]);
    case "musica": return musica();
    case "mezcla": return mezcla();
    case "crudo": return crudo();
    case "medir": return python("medir.py", args[0] ? resolve(args[0]) : join(T, "mezcla.wav"));
    case "hoja": if (!args[0]) fallo("Dime el video: node kit.mjs hoja <video> [cada] [desde] [hasta]"); return python("hoja.py", resolve(args[0]), args[1] ?? "", join(PROYECTO, "salida", `hoja-${basename(args[0], extname(args[0]))}.jpg`), ...args.slice(2));
    case "siguiente": return siguiente();
    case "estado": return estado();
    case "version": return console.log(VERSION);
    default:
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//   ")).map((l) => l.slice(5)).join("\n"));
  }
}

await ejecutar(process.argv[2] ?? "ayuda", process.argv.slice(3));
