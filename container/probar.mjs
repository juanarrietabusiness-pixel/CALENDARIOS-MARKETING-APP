// ============================================================
// Prueba de HUMO del Container del video animado: `node container/probar.mjs http://localhost:8080`
//
// La corre CI contra la imagen YA CONSTRUIDA (.github/workflows/ci.yml, job «contenedor»): construir la imagen y que
// arranque no basta, tiene que dibujar. Con el guion de ejemplo neutro comprueba:
//   · /salud contesta;
//   · /cuadro da un JPEG de 540 px de ancho en la proporción del formato, con su escena;
//   · /hoja da una imagen; /revisar da la revisión en JSON;
//   · un guion roto es un 400 con el motivo, no un 500.
// Sale con código 1 al primer fallo, diciendo cuál.
// ============================================================

import process from "node:process";
import { EJEMPLO_GUION } from "../src/lib/videoFormatoIA.js";

const base = process.argv[2] ?? "http://localhost:8080";
const pedido = { guion: EJEMPLO_GUION, formato: "9:16", paleta: [], imagenes: {}, logo: null, fuentes: {} };

function falla(que) {
  console.error(`✗ ${que}`);
  process.exit(1);
}

async function post(ruta, extra = {}) {
  const r = await fetch(`${base}${ruta}`, { method: "POST", body: JSON.stringify({ ...pedido, ...extra }) });
  return { estado: r.status, cabeceras: r.headers, bytes: new Uint8Array(await r.arrayBuffer()) };
}

/** Ancho y alto de un JPEG por su cabecera SOF. */
function medidasJpeg(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const largo = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xc3) return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + largo;
  }
  return null;
}

// Espera a que arranque (en CI, el contenedor recién lanzado).
let vivo = false;
for (let i = 0; i < 60 && !vivo; i++) {
  try { vivo = (await fetch(`${base}/salud`)).ok; } catch { await new Promise((ok) => setTimeout(ok, 500)); }
}
if (!vivo) falla("/salud no contesta");
console.log("✓ /salud");

const c = await post("/cuadro", { t: 1.5 });
if (c.estado !== 200) falla(`/cuadro devolvió ${c.estado}: ${new TextDecoder().decode(c.bytes)}`);
const m = medidasJpeg(c.bytes);
if (!m || m.ancho !== 540 || m.alto !== 960) falla(`/cuadro no es un JPEG de 540 × 960 (${JSON.stringify(m)})`);
if (c.cabeceras.get("x-escena") !== "e1") falla(`/cuadro en 1,5 s debería ser la escena e1, no ${c.cabeceras.get("x-escena")}`);
console.log(`✓ /cuadro (${c.bytes.length} bytes, ${c.cabeceras.get("x-ms")} ms)`);

const h = await post("/hoja");
if (h.estado !== 200 || !medidasJpeg(h.bytes)) falla(`/hoja devolvió ${h.estado}`);
console.log(`✓ /hoja (${h.cabeceras.get("x-ms")} ms)`);

const r = await post("/revisar", { formatos: ["9:16", "1:1", "16:9"] });
const j = JSON.parse(new TextDecoder().decode(r.bytes));
if (r.estado !== 200 || j.formatos?.length !== 3 || !j.formatos.every((f) => Array.isArray(f.problemas))) falla(`/revisar devolvió ${r.estado}: ${JSON.stringify(j).slice(0, 200)}`);
if (j.formatos.some((f) => f.problemas.some((p) => p.grave))) falla(`el ejemplo neutro no debería tener problemas graves: ${j.formatos.map((f) => f.texto).join(" | ")}`);
console.log("✓ /revisar");

const roto = await post("/cuadro", { guion: { version: 1, escenas: [{ id: "x", tipo: "inventado", habla: "hola" }] } });
if (roto.estado !== 400) falla(`un guion roto debería ser 400, fue ${roto.estado}`);
console.log("✓ un guion roto es 400");
console.log("Todo bien.");
