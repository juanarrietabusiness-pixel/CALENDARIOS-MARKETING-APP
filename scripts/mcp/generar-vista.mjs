// ============================================================
// La página de la VISTA PREVIA del conector en el chat de Claude (MCP Apps)
//
//   node scripts/mcp/generar-vista.mjs          escribe worker/lib/mcpVista/pagina.generada.js
//   node scripts/mcp/generar-vista.mjs --check   sólo comprueba que está al día
//
// claude.ai pinta la vista en un iframe aislado con la página que le da `resources/read`: un HTML entero, sin pedir
// nada fuera (su política de contenido no lo deja). Así que el código de la página (worker/lib/mcpVista/navegador.js,
// que importa modelo.js) se empaqueta con esbuild en UN script y se pega, con estilos.css, dentro del HTML. El Worker
// sirve ese texto tal cual. Un test lo vuelve a generar y compara: si alguien cambia navegador.js, modelo.js o
// estilos.css y no lo genera, falla.
// ============================================================

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { build } from "esbuild";

const RAIZ = new URL("../../", import.meta.url);
const CARPETA = new URL("worker/lib/mcpVista/", RAIZ);
export const SALIDA = new URL("pagina.generada.js", CARPETA);

/** El HTML de la página → texto. */
export async function generarPagina() {
  const r = await build({
    entryPoints: [fileURLToPath(new URL("navegador.js", CARPETA))],
    bundle: true, format: "iife", minify: true, target: "es2020", write: false, legalComments: "none", charset: "utf8",
  });
  const js = r.outputFiles[0].text.trim();
  if (/<\/script/i.test(js)) throw new Error("El script de la vista lleva «</script»: rompería el HTML.");
  const css = fs.readFileSync(new URL("estilos.css", CARPETA), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "").replace(/\s{2,}/g, " ").trim();
  return [
    "<!doctype html>",
    '<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Juancito Ads · vista previa</title>",
    `<style>${css}</style></head>`,
    '<body><main id="vista" aria-live="polite"></main>',
    `<script>${js}</script></body></html>`,
  ].join("");
}

/** El módulo que importa el Worker → texto. */
export async function generar() {
  const pagina = await generarPagina();
  return [
    "// GENERADO por scripts/mcp/generar-vista.mjs a partir de worker/lib/mcpVista/navegador.js, modelo.js y estilos.css.",
    "// No se edita a mano: se cambian esos y se vuelve a generar (un test lo comprueba).",
    `export const PAGINA_VISTA = ${JSON.stringify(pagina)};`,
    "",
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const texto = await generar();
  if (process.argv.includes("--check")) {
    const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, "utf8") : "";
    if (actual !== texto) {
      console.error("worker/lib/mcpVista/pagina.generada.js no está al día: node scripts/mcp/generar-vista.mjs");
      process.exit(1);
    }
    console.log("La vista está al día.");
  } else {
    fs.writeFileSync(SALIDA, texto);
    console.log(`Escrita ${fileURLToPath(SALIDA)} (${(texto.length / 1024).toFixed(1)} kB).`);
  }
}
