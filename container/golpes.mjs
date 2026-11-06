// ============================================================
// POST /golpes del Container: los GOLPES de una canción (el análisis, puro, en src/lib/golpes.js)
//
// El Worker no puede decodificar un MP3 ni un M4A; aquí ffmpeg lo pasa a PCM mono a `MUESTREO_GOLPES` (una cadena
// simple, como la de la voz del render) y `analizarRitmo` saca el BPM y el segundo de cada golpe. Lo pide el Worker al
// sincronizar una canción («Video con tu canción», worker/lib/estudio/cancion.js); sin Container, sin golpes.
// ============================================================

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { analizarRitmo, pcmDeS16, MUESTREO_GOLPES } from "../src/lib/golpes.js";

const FFMPEG = process.env.FFMPEG || "ffmpeg";

/** Decodifica un audio (bytes) a PCM s16le mono a `MUESTREO_GOLPES`. → Uint8Array. */
async function decodificarMono(bytes) {
  const carpeta = await mkdtemp(join(tmpdir(), "golpes-"));
  try {
    const entrada = join(carpeta, "cancion");
    const crudo = join(carpeta, "cancion.pcm");
    await writeFile(entrada, bytes);
    const args = ["-hide_banner", "-nostdin", "-y", "-i", entrada, "-vn", "-ac", "1", "-ar", String(MUESTREO_GOLPES), "-c:a", "pcm_s16le", "-f", "s16le", crudo];
    const r = await new Promise((ok, mal) => {
      const proc = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
      let error = "";
      proc.stderr.on("data", (t) => { error = (error + t.toString()).slice(-4000); });
      proc.on("error", (e) => mal(new Error(`No se pudo arrancar ffmpeg: ${e.message}`)));
      proc.on("close", (codigo) => ok({ codigo, error }));
    });
    if (r.codigo !== 0) throw new Error(`No se pudo leer la canción (ffmpeg ${r.codigo}): ${r.error.trim().split("\n").slice(-2).join(" | ")}`);
    return new Uint8Array(await readFile(crudo));
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

/** El ritmo de una canción (bytes) → { bpm, confianza, golpes, duracion }. */
export async function golpesDeCancion(bytes) {
  const pcm = pcmDeS16(await decodificarMono(bytes));
  return { ...analizarRitmo(pcm, MUESTREO_GOLPES), duracion: Math.round((pcm.length / MUESTREO_GOLPES) * 1000) / 1000 };
}
