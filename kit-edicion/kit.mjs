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
//   marca <carpeta del kit>      colores, logo y letra del ZIP de kit_descargable → plan.marca (lo demás, a mano)
//   muestras [cuadro,cuadro,…]   2 o 3 CUADROS DE MUESTRA con la marca (gancho, texto detrás, subtítulo) sin recortar ni
//                                pintar todo: se enseñan a la persona ANTES de editar
//   persona [segundos]           el recorte de la persona (RVM) y su geometría; por tramos, sigue donde iba
//   cuadros [segundos]           los cuadros etalonados y la persona encima, para Remotion
//   escena                       la escena (cámara, piezas, subtítulos) y la REVISIÓN DE OFICIO
//   render [segundos]            el video por tramos de 5 s (sólo con plan.aprobado: true, tras el sí a las muestras)
//   final                        junta los tramos con la mezcla → salida/final.mp4, lo mide y saca su hoja de contactos
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
const { camaraDelVideo } = await cargar("camaraEdicion.js");
const { escenaParaRemotion } = await cargar("escenaEdicion.js");

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

/** Corre un paso de Python. Código 3 = «hice lo que cupo en el presupuesto; falta»: no es un fallo. → true si terminó. */
function python(script, ...args) {
  mkdirSync(T, { recursive: true });
  writeFileSync(join(T, "oficio.json"), JSON.stringify(OFICIO));
  const r = spawnSync("python3", [join(KIT, "python", script), T, ...args.map(String)], { stdio: "inherit" });
  if (r.status === 3) {
    console.log(`→ ${script}: falta un poco; vuelve a correr el mismo paso (o siguiente): sigue donde iba.`);
    // También en el código de salida (3), para quien lo encadena en un bucle: «hasta que no salga con 3».
    process.exitCode = 3;
    return false;
  }
  if (r.status !== 0) fallo(`El paso ${script} falló (código ${r.status}). Si el proceso se cortó, vuelve a correrlo: sigue donde iba.`);
  return true;
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
  if (viejo(join(T, "voz.wav"), join(T, "linea.json"), partesDelPlan(p).voz)) voz();
  const conMusica = Boolean(p.musica);
  if (conMusica && viejo(join(T, "musica.wav"), partesDelPlan(p).musica)) musica();
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


// ---------------------------------------------------------------- la imagen (Fase 2b)

const R = join(T, "render");
const PUBLIC = join(R, "public");
const REMOTION = join(KIT, "remotion");
const PRESUPUESTO = Number(process.env.KIT_PRESUPUESTO || 420); // segundos por llamada: los procesos del chat mueren

/** Colores, logo y letra del ZIP de kit_descargable (su carpeta descomprimida) → plan.marca, sin pisar lo que ya diga. */
function marca(carpeta) {
  if (!carpeta || !existsSync(carpeta)) fallo("Dime la carpeta del kit de marca (el ZIP de kit_descargable, descomprimido).");
  const p = plan();
  const paleta = leer(join(carpeta, "paleta.json"), {});
  const kit = leer(join(carpeta, "kit.json"), {});
  const tk = paleta.tokens ?? {};
  const m = p.marca ?? {};
  mkdirSync(join(PROYECTO, "marca"), { recursive: true });
  const copiar = (rel) => { if (!rel || !existsSync(join(carpeta, rel))) return null; const d = join("marca", basename(rel)); copyFileSync(join(carpeta, rel), join(PROYECTO, d)); return d; };
  const logo = m.logo ?? copiar(kit.logo);
  const letra = kit.letra?.archivo ? copiar(kit.letra.archivo) : null;
  p.marca = {
    ...m,
    nombre: m.nombre ?? kit.cliente,
    colores: { oscuro: tk.oscuro ?? tk.fondo, acento: tk.acento, claro: tk.claro ?? "#FFFFFF", ...(m.colores ?? {}) },
    ...(logo ? { logo } : {}),
    ...(letra && !m.letras ? { letras: { titular: { familia: kit.letra.nombre || "Marca", archivo: letra } } } : {}),
  };
  escribir(PLAN, p);
  console.log(`plan.marca: ${JSON.stringify(p.marca)}`);
  console.log("Completa a mano lo que no está en el kit: whatsapp (de la nota «Datos del negocio» del cerebro), usuario (@…), llamado del cierre y subtitulos (de identidad_video).");
}

/** Lo que pide Remotion de la marca, con los archivos copiados a public/. */
function marcaParaRender(p) {
  const m = p.marca ?? {};
  mkdirSync(join(PUBLIC, "marca"), { recursive: true });
  const poner = (rel) => { if (!rel) return null; const o = resolve(PROYECTO, rel); if (!existsSync(o)) return null; const d = `marca/${basename(rel)}`; copyFileSync(o, join(PUBLIC, d)); return d; };
  const letrasM = m.letras ? JSON.parse(JSON.stringify(m.letras)) : undefined;
  if (letrasM?.titular?.archivo) letrasM.titular.archivo = poner(letrasM.titular.archivo);
  if (letrasM?.texto?.archivo) letrasM.texto.archivo = poner(letrasM.texto.archivo);
  // El logo, sin sus márgenes (si no, sale pequeño en la tarjeta y en el cierre).
  let logo = poner(m.logo);
  if (logo) {
    const recortado = `marca/${basename(logo, extname(logo))}-recortado.png`;
    if (viejo(join(PUBLIC, recortado), join(PUBLIC, logo))) python("logo.py", join(PUBLIC, logo), join(PUBLIC, recortado));
    if (existsSync(join(PUBLIC, recortado))) logo = recortado;
  }
  return { ...m, logo, letras: letrasM };
}

/** Las letras libres (OFL) que usan las piezas si la marca no trae las suyas: de node_modules/@fontsource a public/fonts. */
function letrasLibres() {
  const nm = join(REMOTION, "node_modules", "@fontsource");
  if (!existsSync(nm)) fallo("Falta instalar Remotion (bash instalar.sh lo hace).");
  mkdirSync(join(PUBLIC, "fonts"), { recursive: true });
  for (const [o, d] of [["anton/files/anton-latin-400-normal.woff2", "anton-400.woff2"], ["inter-tight/files/inter-tight-latin-900-normal.woff2", "inter-tight-900.woff2"],
    ["inter-tight/files/inter-tight-latin-800-normal.woff2", "inter-tight-800.woff2"], ["inter-tight/files/inter-tight-latin-600-normal.woff2", "inter-tight-600.woff2"]]) {
    if (!existsSync(join(PUBLIC, "fonts", d))) copyFileSync(join(nm, o), join(PUBLIC, "fonts", d));
  }
}

/**
 * Los cuadros de origen que hacen falta de cada clip ([clip, desde, hasta] seguidos). `solo`: cuadros de salida. `unir`:
 * huecos de hasta tantos cuadros se recorren igual (RVM recuerda lo anterior: cada tramo nuevo empieza con 20 cuadros
 * de calentamiento, así que recorrer un hueco corto cuesta menos que empezar otra vez).
 */
function tramosDeOrigen(fuente, solo = null, unir = 0) {
  const porClip = new Map();
  fuente.forEach((x, f) => { if (x && (!solo || solo.has(f))) { if (!porClip.has(x[0])) porClip.set(x[0], new Set()); porClip.get(x[0]).add(x[1]); } });
  const tramos = [];
  for (const [clip, set] of porClip) {
    const n = [...set].sort((a, b) => a - b);
    let a = n[0];
    for (let i = 1; i <= n.length; i++) if (i === n.length || n[i] > n[i - 1] + 1 + unir) { tramos.push([clip, a, n[i - 1]]); a = n[i]; }
  }
  return tramos;
}

function lineaYFuente() {
  const linea = leer(join(T, "linea.json"), null) ?? calcularCorte({ hablar: false }).linea;
  return { linea, fuente: corte.cuadrosDeOrigen(linea) };
}

/**
 * Los cuadros de salida que necesitan a la persona recortada: por defecto, sólo los que tienen un texto DETRÁS de la
 * persona (con 0,15 s de margen); el resto lleva la geometría rápida (geometria.py) para la cámara. En Rofer v2, 40 %
 * menos de tiempo y lado a lado no se distingue (propuesta §14). Con `persona.completa: true` en el plan, todos. → Set,
 * o null = todos.
 */
function conPersona(p, linea) {
  if (p.persona?.completa) return null;
  const { palabras } = leer(join(T, "linea.json"));
  const det = escenaSinCuadros(p, linea, palabras).datos.piezas.filter((x) => ["titular", "gigante", "tachado", "trio"].includes(x.tipo) && x.desde !== null);
  const set = new Set();
  for (const x of det) for (let f = Math.max(0, Math.floor((x.desde - 0.15) * linea.fps)); f <= Math.ceil((x.hasta + 0.15) * linea.fps); f++) set.add(f);
  return set;
}

function persona(presupuesto = PRESUPUESTO, solo = null) {
  const p = plan();
  const { linea, fuente } = lineaYFuente();
  const necesita = solo ?? conPersona(p, linea);
  escribir(join(T, "persona_plan.json"), {
    clips: Object.fromEntries(p.clips.map((c) => [c.id, archivoDe(c)])), tramos: tramosDeOrigen(fuente, necesita, 20),
    tramos_todos: tramosDeOrigen(fuente, solo, 20), modelo: p.persona?.modelo ?? "rvm_resnet50",
  });
  // Sin el recorte de todo, la cámara necesita la geometría del resto: una pasada rápida a 1/4.
  if (necesita && !solo && !python("geometria.py", presupuesto)) return false;
  return python("persona.py", presupuesto);
}

function geometria(p) {
  return Object.fromEntries(p.clips.map((c) => [c.id, leer(join(T, "geometria", `${c.id}.json`), {})]));
}

function camara(p, linea) {
  return camaraDelVideo(linea, geometria(p), { planos: p.camara ?? null });
}

function cuadros(presupuesto = PRESUPUESTO, solo = null) {
  const p = plan();
  const { linea, fuente } = lineaYFuente();
  const cam = camara(p, linea);
  // El clip que la cámara acerca mucho (persona lejos) lleva más nitidez.
  const nitidez = [...new Set(linea.piezas.filter((_, k) => cam.planos[k].z > 1.6).map((x) => x.clip))];
  const necesita = conPersona(p, linea);
  escribir(join(T, "cuadros_plan.json"), { fps: linea.fps, fuente, clips: Object.fromEntries(p.clips.map((c) => [c.id, archivoDe(c)])), nitidez, destino: join(PUBLIC, "r"),
    conPersona: necesita ? [...necesita] : null });
  return python("cuadros.py", solo ? [...solo].join(",") : "", presupuesto);
}

/** La escena para Remotion y su revisión. → { datos, avisos }. */
function escena({ hablar = true } = {}) {
  const p = plan();
  const { linea } = lineaYFuente();
  const { palabras } = leer(join(T, "linea.json"));
  const cam = camara(p, linea);
  letrasLibres();
  const r = escenaParaRemotion({ linea, palabras, camara: cam, plan: p, marca: marcaParaRender(p) });
  if (r.error) fallo(`Los subtítulos no casan: ${r.error}`);
  const necesita = conPersona(p, linea);
  if (necesita) r.datos.conPersona = Array.from({ length: linea.total }, (_, f) => (necesita.has(f) ? 1 : 0));
  escribir(join(PUBLIC, "datos.json"), r.datos);
  if (hablar) {
    console.log(`Escena: ${r.datos.piezas.length} piezas, ${r.datos.grupos.length} subtítulos (${r.datos.grupos.filter((g) => g.oculto).length} ocultos porque un gráfico ya lo dice).`);
    console.log("Planos por tramo: " + cam.planos.map((x, k) => `${k}:${x.z}`).join(" "));
    if (!r.avisos.length) console.log("Revisión de oficio: sin avisos.");
    for (const a of r.avisos) console.log(`${a.grave ? "✗" : "·"} ${s2(a.t)} s — ${a.que} → ${a.arreglo}`);
  }
  return r;
}

function remotion(...args) {
  if (!existsSync(join(REMOTION, "node_modules", "remotion"))) fallo("Falta instalar Remotion (bash instalar.sh lo hace).");
  const r = spawnSync("node", [join(REMOTION, "render.mjs"), ...args.map(String)], { stdio: "inherit", cwd: REMOTION });
  if (r.status !== 0) fallo(`Remotion falló (código ${r.status}).`);
}

/** Los cuadros de muestra: por defecto, el 0 (el gancho), el de la primera pieza detrás de la persona y uno con subtítulo. */
function muestras(lista) {
  const p = plan();
  const { linea } = lineaYFuente();
  let cuadrosM = lista ? lista.split(",").map(Number) : null;
  if (!cuadrosM) {
    const { palabras } = leer(join(T, "linea.json"));
    const r0 = escenaSinCuadros(p, linea, palabras);
    const det = r0.datos.piezas.find((x) => ["gigante", "trio"].includes(x.tipo) && x.desde > 0.5);
    const g = r0.datos.grupos.find((x) => !x.oculto && r0.datos.palabras[x.ids[0]].s > 1.5);
    cuadrosM = [0, det ? Math.round((det.desde + 0.6) * linea.fps) : 60, g ? Math.round((r0.datos.palabras[g.ids.at(-1)].s + 0.1) * linea.fps) : 120];
  }
  const solo = new Set(cuadrosM);
  persona(1e9, solo);
  cuadros(1e9, solo);
  escena();
  remotion("muestras", PUBLIC, join(PROYECTO, "salida", "muestras"), cuadrosM.join(","));
  console.log("Enséñale las muestras a la persona ANTES de editar. Con su sí, pon \"aprobado\": true en plan.json.");
}
function escenaSinCuadros(p, linea, palabras) {
  return escenaParaRemotion({ linea, palabras, camara: camara(p, linea), plan: p, marca: p.marca ?? {} });
}

const TRAMO = 150; // cuadros (5 s) por trozo de render
function trozos(total) {
  const t = [];
  for (let a = 0; a < total; a += TRAMO) t.push([a, Math.min(total - 1, a + TRAMO - 1)]);
  return t;
}
const rutaTrozo = ([a, b]) => join(R, "tramos", `${String(a).padStart(5, "0")}-${String(b).padStart(5, "0")}.mp4`);

function render(presupuesto = PRESUPUESTO) {
  const p = plan();
  if (p.aprobado !== true) fallo("La persona aún no aprobó las muestras: enséñaselas (node kit.mjs muestras) y, con su sí, pon \"aprobado\": true en plan.json.");
  const r = escena({ hablar: false });
  const graves = r.avisos.filter((a) => a.grave);
  if (graves.length && p.revision !== "aceptada") fallo(`La revisión de oficio tiene ${graves.length} avisos graves (node kit.mjs escena los enseña). Arréglalos, o si la persona los acepta, pon "revision": "aceptada".`);
  const { linea } = lineaYFuente();
  const inicio = Date.now();
  mkdirSync(join(R, "tramos"), { recursive: true });
  // Si la escena cambió después de un trozo, ese trozo se repite.
  const escenaMtime = mtime(join(PUBLIC, "datos.json"));
  let faltan = 0;
  for (const tr of trozos(linea.total)) {
    const ruta = rutaTrozo(tr);
    if (existsSync(ruta) && mtime(ruta) > escenaMtime) continue;
    if ((Date.now() - inicio) / 1000 > presupuesto) { faltan++; continue; }
    remotion("tramo", PUBLIC, ruta, tr[0], tr[1]);
  }
  if (faltan) {
    console.log(`→ render: faltan ${faltan} trozos de 5 s; vuelve a correr render (o siguiente): sigue donde iba.`);
    process.exitCode = 3;
  }
  else console.log("Render completo. Siguiente: node kit.mjs final");
  return !faltan;
}

function final() {
  const { linea } = lineaYFuente();
  const lista = trozos(linea.total).map(rutaTrozo);
  const falta = lista.filter((x) => !existsSync(x));
  if (falta.length) fallo(`Faltan ${falta.length} trozos del render: node kit.mjs render`);
  if (!existsSync(join(T, "mezcla.wav"))) fallo("Falta la mezcla: node kit.mjs mezcla");
  writeFileSync(join(R, "trozos.txt"), lista.map((x) => `file '${x}'`).join("\n"));
  mkdirSync(join(PROYECTO, "salida"), { recursive: true });
  const destino = join(PROYECTO, "salida", "final.mp4");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(R, "trozos.txt"), "-i", join(T, "mezcla.wav"),
    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", destino], { stdio: "inherit" });
  if (r.status !== 0) fallo("No pude juntar los trozos.");
  python("medir.py", destino);
  python("hoja.py", destino, "", join(PROYECTO, "salida", "hoja-final.jpg"));
  console.log(`Listo: ${destino}. Míralo en la hoja de contactos; súbelo con subir_a_galeria.`);
}

// ---------------------------------------------------------------- qué falta

/**
 * La PARTE del plan de la que depende un paso, en trabajo/plan/<nombre>.json, reescrita sólo si cambió: así tocar las
 * piezas o la marca no rehace el corte, la voz ni la música. → su ruta (su fecha es la de su último cambio).
 */
function parte(nombre, datos) {
  const ruta = join(T, "plan", `${nombre}.json`);
  const texto = JSON.stringify(datos ?? null);
  if (!existsSync(ruta) || readFileSync(ruta, "utf8") !== texto) { mkdirSync(dirname(ruta), { recursive: true }); writeFileSync(ruta, texto); }
  return ruta;
}
const partesDelPlan = (p) => ({
  corte: parte("corte", { clips: p.clips, cierre: p.cierre, fps: p.fps }),
  voz: parte("voz", { clips: (p.clips ?? []).map((c) => [c.id, c.velocidad, c.ganancia, c.presencia]), realces: p.realces }),
  musica: parte("musica", p.musica ?? null),
  mezcla: parte("mezcla", { efectos: p.efectos, apartar: p.apartar, musica: p.musica ?? null }),
  escena: parte("escena", { piezas: p.piezas, marca: p.marca, subtitulos: p.subtitulos, golpes: p.golpes, camara: p.camara, cierre: p.cierre, persona: p.persona }),
});

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
  const pt = partesDelPlan(p);
  return [
    { nombre: "transcribir", falta: trans.some((t) => !existsSync(t)), por: "faltan clips por transcribir" },
    { nombre: "cortar", falta: viejo(join(T, "corte.hecho"), pt.corte, ...trans), por: "el plan o las transcripciones cambiaron" },
    { nombre: "voz", falta: viejo(voz, linea, pt.voz), por: "el corte cambió" },
    p.musica
      ? { nombre: "musica", falta: viejo(musica, pt.musica, linea), por: "el plan de la música cambió" }
      : { nombre: "musica", decide: "falta plan.musica (biblioteca del cliente o Suno; node kit.mjs compases <canción>)" },
    { nombre: "mezcla", falta: viejo(mezcla, voz, pt.mezcla, ...(p.musica ? [musica] : [])), por: "la voz, la música o los efectos cambiaron" },
    { nombre: "crudo", falta: viejo(join(PROYECTO, "salida", "crudo.mp4"), mezcla), por: "la mezcla cambió" },
    ...(p.aprobado !== true
      ? [{ nombre: "muestras", decide: "faltan las piezas y los cuadros de muestra aprobados: node kit.mjs muestras y, con el sí, \"aprobado\": true en plan.json" }]
      : [
        { nombre: "persona", falta: personaFalta(p), por: "faltan cuadros por recortar" },
        { nombre: "cuadros", falta: cuadrosFalta(), por: "faltan cuadros para Remotion" },
        { nombre: "escena", falta: viejo(join(PUBLIC, "datos.json"), pt.escena, linea), por: "las piezas, la marca o la cámara cambiaron" },
        { nombre: "render", falta: renderFalta(), por: "faltan trozos del render" },
        { nombre: "final", falta: viejo(join(PROYECTO, "salida", "final.mp4"), mezcla, join(PUBLIC, "datos.json")), por: "el render o la mezcla cambiaron" },
      ]),
  ];
}

function personaFalta(p) {
  const L = leer(join(T, "linea.json"), null);
  if (!L) return true;
  return tramosDeOrigen(corte.cuadrosDeOrigen(L), conPersona(p, L)).some(([clip, a, b]) => !existsSync(join(T, "alfa", clip, `${String(a).padStart(5, "0")}.png`)) || !existsSync(join(T, "alfa", clip, `${String(b).padStart(5, "0")}.png`)));
}
function cuadrosFalta() {
  const L = leer(join(T, "linea.json"), null);
  if (!L) return true;
  const necesita = conPersona(plan(), L);
  return corte.cuadrosDeOrigen(L).some((x, f) => x && (!existsSync(join(PUBLIC, "r", "cam", `${String(f).padStart(5, "0")}.jpg`))
    || ((!necesita || necesita.has(f)) && !existsSync(join(PUBLIC, "r", "p", `${String(f).padStart(5, "0")}.webp`)))));
}
function renderFalta() {
  const L = leer(join(T, "linea.json"), null);
  if (!L) return true;
  const e = mtime(join(PUBLIC, "datos.json"));
  return !e || trozos(L.total).some((tr) => !existsSync(rutaTrozo(tr)) || mtime(rutaTrozo(tr)) < e);
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
    case "marca": return marca(args[0]);
    case "muestras": return muestras(args[0]);
    case "persona": return persona(Number(args[0]) || PRESUPUESTO);
    case "cuadros": return cuadros(Number(args[0]) || PRESUPUESTO);
    case "escena": return void escena();
    case "render": return render(Number(args[0]) || PRESUPUESTO);
    case "final": return final();
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
