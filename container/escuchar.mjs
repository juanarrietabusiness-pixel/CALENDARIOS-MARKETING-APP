// ============================================================
// POST /escuchar del Container: ESCUCHAR SIN OÍDOS un video animado
//
// Arma el MISMO audio que el render (container/efectos.mjs, `sonidoPorPistas`: voz, clips, música y efectos, cada uno en
// su pista), lo mide (src/lib/escucharSonido.js) y lo dibuja en una HOJA (PNG) que Claude puede mirar: las escenas, las
// palabras, el nivel de cada pista en el tiempo, el espectrograma de la mezcla (de ffmpeg) y cada efecto numerado (en
// rojo los que tienen un aviso), con los 5 momentos que debe escuchar una persona. Sin IA y sin codificar video: unos
// segundos de CPU.
// ============================================================

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { usosDeVideo } from "../src/lib/motorVideo.js";
import { RENDER } from "../src/lib/renderVideo.js";
import { informeDeEscucha, reloj, SUELO_DB } from "../src/lib/escucharSonido.js";
import { BAJADA_MUSICA } from "../src/lib/efectosColocados.js";
import { sonidoPorPistas, propiosDelPedido, libreriaDelPedido, efectosMarcaDelPedido, recorteDelPedido } from "./efectos.mjs";
import { decodificadorEn, medirPcm } from "./render.mjs";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const ANCHO = 1400;
const MARGEN = 64;
const COLOR = Object.freeze({
  fondo: "#15171c", carril: "#1f232b", linea: "#3a404c", texto: "#f2f2f2", tenue: "#a3a9b5",
  voz: "#5ab0ff", musica: "#5fd38d", efectos: "#ffb347", aviso: "#ff5a5f", bajada: "rgba(255,255,255,0.10)",
  escenaA: "#2b3140", escenaB: "#343b4d",
});

/** El espectrograma de la mezcla (PNG de ffmpeg, frecuencias en escala logarítmica) o null si ffmpeg no puede. */
async function espectrograma(carpeta, pcm, ancho, alto) {
  const crudo = join(carpeta, "mezcla.pcm");
  const png = join(carpeta, "espectro.png");
  await writeFile(crudo, pcm);
  const args = ["-hide_banner", "-nostdin", "-y", "-f", "s16le", "-ar", String(RENDER.muestreo), "-ac", "2", "-i", crudo,
    "-lavfi", `showspectrumpic=s=${ancho}x${alto}:legend=0:fscale=log:color=intensity:scale=log`, "-frames:v", "1", png];
  const codigo = await new Promise((ok) => {
    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "ignore"] });
    proc.on("error", () => ok(-1));
    proc.on("close", ok);
  });
  if (codigo !== 0) return null;
  try { return await loadImage(await readFile(png)); } catch { return null; }
}

/** Dibuja la HOJA del informe → Buffer PNG. */
async function dibujarHoja(inf, base, espectro) {
  const escenas = base.linea?.escenas ?? [];
  const carril = { escenas: 30, palabras: 46, niveles: 230, espectro: espectro ? 130 : 0 };
  const pie = 30 + 22 * Math.max(1, inf.escuchar.length);
  const alto = 64 + carril.escenas + carril.palabras + carril.niveles + carril.espectro + 40 + pie;
  const lienzo = createCanvas(ANCHO, alto);
  const ctx = lienzo.getContext("2d");
  const ancho = ANCHO - MARGEN - 20;
  const dur = Math.max(0.1, inf.duracion);
  const x = (t) => MARGEN + (Math.max(0, Math.min(dur, t)) / dur) * ancho;
  ctx.fillStyle = COLOR.fondo; ctx.fillRect(0, 0, ANCHO, alto);
  ctx.textBaseline = "middle";

  // Cabecera.
  ctx.fillStyle = COLOR.texto; ctx.font = "700 22px Roboto, sans-serif";
  ctx.fillText(`Sonido · ${inf.titulo || "video animado"} · ${String(inf.duracion).replace(".", ",")} s`, 16, 22);
  ctx.fillStyle = COLOR.tenue; ctx.font = "400 15px Roboto, sans-serif";
  const resumen = [
    inf.voz ? "voz" : "sin voz", inf.musica ? `música «${inf.musica.nombre || "de fondo"}»` : "sin música",
    `${inf.efectos.length} efectos (${String(inf.densidad).replace(".", ",")} cada 10 s)`,
    inf.volumen ? `${String(inf.volumen.lufs).replace(".", ",")} LUFS antes del final` : "", inf.estimado ? "TIEMPOS ESTIMADOS" : "",
  ].filter(Boolean).join(" · ");
  ctx.fillText(resumen, 16, 48);
  let y = 64;

  // Las escenas.
  escenas.forEach((e, k) => {
    ctx.fillStyle = k % 2 ? COLOR.escenaB : COLOR.escenaA;
    ctx.fillRect(x(e.desde), y, Math.max(1, x(e.hasta) - x(e.desde) - 1), carril.escenas - 4);
    ctx.fillStyle = COLOR.texto; ctx.font = "500 13px Roboto, sans-serif";
    const w = x(e.hasta) - x(e.desde);
    if (w > 24) ctx.fillText(String(e.id).slice(0, Math.max(2, Math.floor(w / 8))), x(e.desde) + 4, y + (carril.escenas - 4) / 2);
  });
  ctx.fillStyle = COLOR.tenue; ctx.font = "400 12px Roboto, sans-serif"; ctx.fillText("escenas", 6, y + 13);
  y += carril.escenas;

  // Las palabras (sin encimarse: la que no cabe, sólo su raya).
  ctx.fillStyle = COLOR.tenue; ctx.fillText("palabras", 6, y + 14);
  let libre = 0;
  let fila = 0;
  for (const e of escenas) {
    for (const p of e.palabras ?? []) {
      const px = x(p.desde);
      ctx.fillStyle = COLOR.linea; ctx.fillRect(px, y + 2, 1, carril.palabras - 6);
      ctx.font = "400 12px Roboto, sans-serif";
      const w = ctx.measureText(p.texto).width;
      if (px >= libre) {
        ctx.fillStyle = COLOR.texto;
        ctx.fillText(p.texto, px + 2, y + 12 + fila * 18);
        libre = px + w + 6;
        fila = 1 - fila;
      }
    }
  }
  y += carril.palabras;

  // Los niveles de cada pista (dBFS, de -60 a 0) con las bajadas de la música sombreadas.
  const top = y;
  const h = carril.niveles - 10;
  const yDb = (d) => top + ((0 - Math.max(-60, Math.min(0, d))) / 60) * h;
  ctx.fillStyle = COLOR.carril; ctx.fillRect(MARGEN, top, ancho, h);
  for (const d of [-12, -24, -36, -48]) {
    ctx.fillStyle = COLOR.linea; ctx.fillRect(MARGEN, yDb(d), ancho, 1);
    ctx.fillStyle = COLOR.tenue; ctx.font = "400 11px Roboto, sans-serif"; ctx.fillText(`${d} dB`, 14, yDb(d));
  }
  for (const b of inf.bajadas) {
    ctx.fillStyle = COLOR.bajada; ctx.fillRect(x(b.desde), top, Math.max(2, x(b.hasta + BAJADA_MUSICA.vuelve) - x(b.desde)), h);
  }
  const curva = (env, color, relleno) => {
    if (!env?.length) return;
    ctx.beginPath();
    ctx.moveTo(x(0), yDb(-60));
    env.forEach((d, k) => ctx.lineTo(x(k * inf.envolventes.ventana), yDb(d ?? SUELO_DB)));
    ctx.lineTo(x(env.length * inf.envolventes.ventana), yDb(-60));
    if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  };
  curva(inf.envolventes.musica, COLOR.musica, "rgba(95,211,141,0.22)");
  curva(inf.envolventes.voz, COLOR.voz, "rgba(90,176,255,0.20)");
  curva(inf.envolventes.efectos, COLOR.efectos, null);
  ctx.fillStyle = COLOR.tenue; ctx.font = "400 12px Roboto, sans-serif"; ctx.fillText("niveles", 6, top + 12);
  y += carril.niveles;

  // El espectrograma de la mezcla.
  if (espectro) {
    ctx.drawImage(espectro, MARGEN, y, ancho, carril.espectro - 10);
    ctx.fillStyle = COLOR.tenue; ctx.fillText("espectro", 6, y + 12);
    y += carril.espectro;
  }

  // Los efectos: una raya por cada uno, de arriba abajo, con su número (en rojo si tiene un aviso).
  for (const e of inf.efectos) {
    const ex = x(e.golpe);
    const color = e.avisos.length ? COLOR.aviso : COLOR.efectos;
    ctx.fillStyle = color; ctx.globalAlpha = 0.55; ctx.fillRect(ex, top, 1.5, y - top - 10); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(ex, top + 12 + (e.n % 2) * 22, 10, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = "#111111"; ctx.font = "700 12px Roboto, sans-serif";
    const t = String(e.n);
    ctx.fillText(t, ex - ctx.measureText(t).width / 2, top + 12 + (e.n % 2) * 22);
  }

  // El eje del tiempo.
  const paso = dur > 60 ? 10 : dur > 20 ? 5 : dur > 8 ? 2 : 1;
  ctx.fillStyle = COLOR.tenue; ctx.font = "400 12px Roboto, sans-serif";
  for (let t = 0; t <= dur + 0.001; t += paso) {
    ctx.fillRect(x(t), y - 6, 1, 6);
    ctx.fillText(reloj(t), x(t) - 14, y + 8);
  }
  y += 26;

  // Leyenda y lo que hay que escuchar.
  ctx.font = "500 14px Roboto, sans-serif";
  let lx = MARGEN;
  for (const [nombre, color] of [["voz", COLOR.voz], ["música", COLOR.musica], ["efectos", COLOR.efectos], ["efecto con aviso", COLOR.aviso], ["la música baja", "#888888"]]) {
    ctx.fillStyle = color; ctx.fillRect(lx, y + 2, 14, 14);
    ctx.fillStyle = COLOR.texto; ctx.fillText(nombre, lx + 20, y + 9);
    lx += ctx.measureText(nombre).width + 50;
  }
  y += 28;
  ctx.font = "400 14px Roboto, sans-serif";
  if (!inf.escuchar.length) { ctx.fillStyle = COLOR.tenue; ctx.fillText("Nada que escuchar en especial.", MARGEN, y); }
  inf.escuchar.forEach((m, k) => {
    ctx.fillStyle = COLOR.texto;
    ctx.fillText(`Escuchar ${k + 1}: ${reloj(m.segundo)} — ${m.porque}`.slice(0, 170), MARGEN, y + k * 22);
  });
  return lienzo.encode("png");
}

/**
 * Escucha el video del pedido (lo de `preparar()` del servidor más el sonido: audio, musica, efectos, colocados, propios,
 * libreria, titulo) → { informe (sin las envolventes), hoja: { mime, datos (base64) } }.
 */
export async function escuchar(base, p) {
  const carpeta = await mkdtemp(join(tmpdir(), "escuchar-"));
  try {
    const usos = usosDeVideo(base.guion, base.linea).filter((u) => base.infoVideos?.has(u.archivo));
    const clips = usos.filter((u) => u.sonido && base.infoVideos.get(u.archivo)?.audio);
    const audio = typeof p.audio === "string" && p.audio ? Buffer.from(p.audio, "base64") : null;
    const musica = typeof p.musica?.audio === "string" && p.musica.audio ? { audio: Buffer.from(p.musica.audio, "base64"), volumen: Number(p.musica.volumen) || 0 } : null;
    const s = await sonidoPorPistas({
      audio, recorte: recorteDelPedido(p.recorte), linea: base.linea, total: base.linea.total, guion: base.guion, efectos: p.efectos === true,
      colocados: Array.isArray(p.colocados) ? p.colocados : [], propios: propiosDelPedido(p), libreria: libreriaDelPedido(p), efectosMarca: efectosMarcaDelPedido(p),
      musica, clips, decodificar: decodificadorEn(carpeta),
    });
    const medido = await medirPcm(carpeta, s.mezcla).catch(() => null);
    const informe = informeDeEscucha({
      pistas: s.pistas, mezcla: s.mezcla, momentos: s.efectos.momentos, medidas: s.medidas, sinSitio: s.efectos.sinSitio,
      movidos: s.efectos.movidos, sinArchivo: s.sinArchivo, bajadas: s.efectos.bajadas, linea: base.linea,
      volumen: medido ? { lufs: Number(medido.input_i), pico: Number(medido.input_tp) } : null, musica: typeof p.musicaNombre === "string" ? p.musicaNombre.slice(0, 80) : null,
      automaticos: s.efectos.automaticos, colocados: s.efectos.automaticos ? [] : s.efectos.lista, titulo: String(p.titulo ?? "").slice(0, 120),
      avisosExtra: s.efectos.avisos,
    });
    const espectro = await espectrograma(carpeta, s.mezcla, 1400, 240).catch(() => null);
    const png = await dibujarHoja(informe, base, espectro);
    const ligero = { ...informe };
    delete ligero.envolventes;
    return { informe: ligero, hoja: { mime: "image/png", datos: Buffer.from(png).toString("base64") } };
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}
