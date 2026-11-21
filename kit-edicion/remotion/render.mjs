// ============================================================
// Pintar con Remotion lo que pide kit.mjs: cuadros sueltos (las MUESTRAS de la propuesta corta) o un TRAMO del video.
//
//   node render.mjs muestras <public> <salida-dir> <cuadro,cuadro,…>
//   node render.mjs tramo <public> <salida.mp4> <desde> <hasta>
//
// El navegador: el Chromium que ya haya (el del chat está en /opt/pw-browsers); si no hay ninguno, Remotion baja el suyo
// (y en una red cerrada eso falla: se dice). Un tramo es un mp4 sin audio; kit.mjs los junta sin recodificar y les pone
// la mezcla.
// ============================================================
import { bundle } from "@remotion/bundler";
import { renderStill, renderMedia, selectComposition } from "@remotion/renderer";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import process from "node:process";

const AQUI = dirname(fileURLToPath(import.meta.url));

/** El Chromium de la máquina: el headless shell de Playwright, el Chromium de Playwright o uno del sistema. */
export function navegador() {
  if (process.env.KIT_NAVEGADOR && existsSync(process.env.KIT_NAVEGADOR)) return process.env.KIT_NAVEGADOR;
  const base = "/opt/pw-browsers";
  if (existsSync(base)) {
    const carpetas = readdirSync(base).sort().reverse();
    for (const c of carpetas.filter((x) => x.startsWith("chromium_headless_shell-"))) {
      const p = join(base, c, "chrome-headless-shell-linux64", "chrome-headless-shell");
      if (existsSync(p)) return p;
    }
    for (const c of carpetas.filter((x) => /^chromium-\d/.test(x))) {
      const p = join(base, c, "chrome-linux", "chrome");
      if (existsSync(p)) return p;
    }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) if (existsSync(p)) return p;
  return undefined;
}

const [accion, publicDir, salida, a, b] = process.argv.slice(2);
const browserExecutable = navegador();
const inicio = Date.now();
const serveUrl = await bundle({ entryPoint: join(AQUI, "src", "index.jsx"), publicDir });
const composition = await selectComposition({ serveUrl, id: "Video", browserExecutable });
const hilos = Math.max(1, Math.min(4, os.cpus().length));
if (accion === "muestras") {
  mkdirSync(salida, { recursive: true });
  for (const f of a.split(",").map(Number)) {
    const out = join(salida, `muestra-${String(f).padStart(5, "0")}.jpg`);
    await renderStill({ serveUrl, composition, frame: f, output: out, imageFormat: "jpeg", jpegQuality: 90, browserExecutable });
    console.log(out);
  }
} else if (accion === "tramo") {
  await renderMedia({ serveUrl, composition, codec: "h264", crf: 18, outputLocation: salida, frameRange: [Number(a), Number(b)], browserExecutable,
    concurrency: hilos, muted: true, imageFormat: "jpeg", jpegQuality: 92, x264Preset: "medium", pixelFormat: "yuv420p" });
  console.log(`tramo ${a}–${b} → ${salida}`);
} else {
  console.error("Uso: node render.mjs muestras <public> <dir> <cuadros> | tramo <public> <salida.mp4> <desde> <hasta>");
  process.exit(1);
}
console.log(`render: ${((Date.now() - inicio) / 1000).toFixed(1)} s (${browserExecutable ? "navegador local" : "navegador de Remotion"})`);
