// ============================================================
// Prueba de HUMO del Container del video animado: `node container/probar.mjs http://localhost:8080`
//
// La corre CI contra la imagen YA CONSTRUIDA (.github/workflows/ci.yml, job «contenedor»): construir la imagen y que
// arranque no basta, tiene que dibujar. Con el guion de ejemplo neutro comprueba:
//   · /salud contesta;
//   · /cuadro da un JPEG de 540 px de ancho en la proporción del formato, con su escena;
//   · /miniatura reduce una imagen a JPEG (y una que no lo es, 400); /acabado pone el texto de la plantilla y el logo
//     encima; /hoja da una imagen; /revisar da la revisión en JSON;
//   · /render da un mp4 de verdad, de la duración de la línea de tiempo, con el volumen en -14 LUFS (±1) aunque la voz
//     llegue mucho más baja (una voz sintética: un tono que sube y baja, en WAV);
//   · un guion roto es un 400 con el motivo, no un 500.
// Sale con código 1 al primer fallo, diciendo cuál.
// ============================================================

import process from "node:process";
import { Buffer } from "node:buffer";
import { EJEMPLO_GUION } from "../src/lib/videoFormatoIA.js";
import { lineaDeTiempo, validarGuion } from "../src/lib/videoEscenas.js";
import { RENDER, cuadrosDelVideo, esMp4 } from "../src/lib/renderVideo.js";

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

// La miniatura de una pieza del Estudio (lo que Claude ve por MCP): el cuadro de arriba reducido a 256 de lado mayor.
const mini = await fetch(`${base}/miniatura`, { method: "POST", body: JSON.stringify({ imagen: Buffer.from(c.bytes).toString("base64"), lado: 256 }) });
const mj = await mini.json().catch(() => ({}));
if (mini.status !== 200 || mj.mime !== "image/jpeg" || mj.alto !== 256 || mj.ancho !== 144 || mj.original?.alto !== 960) falla(`/miniatura devolvió ${mini.status}: ${JSON.stringify({ ...mj, datos: undefined })}`);
const mm = medidasJpeg(Buffer.from(mj.datos, "base64"));
if (!mm || mm.alto !== 256) falla(`/miniatura no devolvió un JPEG de 256 de alto (${JSON.stringify(mm)})`);
const malo = await fetch(`${base}/miniatura`, { method: "POST", body: JSON.stringify({ imagen: "bm8gZXMgdW5hIGltYWdlbg==" }) });
if (malo.status !== 400) falla(`/miniatura con algo que no es imagen debería ser 400, fue ${malo.status}`);
console.log("✓ /miniatura");

// Lo que necesita una imagen para cada red («Programar al aprobar» sin pantalla): el cuadro de 540 × 960 (9:16) no cabe
// en el feed: encajado en 4:5 sale a 1080 × 1350; medido, sus medidas; reducido para TikTok, sin agrandarlo.
const red = async (salida) => {
  const r = await fetch(`${base}/imagen-redes`, { method: "POST", body: JSON.stringify({ imagen: Buffer.from(c.bytes).toString("base64"), salida }) });
  return { estado: r.status, j: await r.json() };
};
const enc = await red({ tipo: "encajar", ancho: 1080, alto: 1350, modo: "difuminado", color: "#FFFFFF" });
if (enc.estado !== 200 || enc.j.ancho !== 1080 || enc.j.alto !== 1350 || medidasJpeg(Buffer.from(enc.j.datos, "base64"))?.alto !== 1350) falla(`/imagen-redes encajar devolvió ${enc.estado}: ${JSON.stringify({ ...enc.j, datos: undefined })}`);
const med = await red({ tipo: "medir" });
if (med.j.ancho !== 540 || med.j.alto !== 960 || med.j.datos) falla(`/imagen-redes medir devolvió ${JSON.stringify(med.j)}`);
const red1080 = await red({ tipo: "reducir", maxAncho: 1080, maxAlto: 1920 });
if (red1080.j.ancho !== 540 || red1080.j.alto !== 960) falla(`/imagen-redes reducir no debería agrandar: ${JSON.stringify({ ...red1080.j, datos: undefined })}`);
if ((await red({ tipo: "otra" })).estado !== 400) falla("/imagen-redes con una salida que no existe debería ser 400");
console.log("✓ /imagen-redes");

// El ACABADO de una pieza sin pantalla: el texto de la plantilla encima y el logo estampado (el cuadro hace de logo).
const acab = await fetch(`${base}/acabado`, { method: "POST", body: JSON.stringify({
  imagen: Buffer.from(c.bytes).toString("base64"),
  texto: { texto: "Tus lentes en 40 minutos\nCiudad de Panamá y La Chorrera", plantilla: "banda", colores: { fondo: "#D91B19", texto: "#FFFFFF", acento: "#C5A059" } },
  logo: { datos: mj.datos, posicion: { esquina: "abajo-derecha", tamano: 0.16 } },
}) });
const aj = await acab.json().catch(() => ({}));
if (acab.status !== 200 || aj.mime !== "image/jpeg" || aj.ancho !== 540 || aj.alto !== 960) falla(`/acabado devolvió ${acab.status}: ${JSON.stringify({ ...aj, datos: undefined })}`);
const am = medidasJpeg(Buffer.from(aj.datos, "base64"));
if (!am || am.ancho !== 540) falla(`/acabado no devolvió un JPEG de 540 de ancho (${JSON.stringify(am)})`);
if (Buffer.from(aj.datos, "base64").equals(Buffer.from(c.bytes))) falla("/acabado devolvió la misma imagen: no dibujó nada");
const malColor = await fetch(`${base}/acabado`, { method: "POST", body: JSON.stringify({ imagen: Buffer.from(c.bytes).toString("base64"), texto: { texto: "x", colores: { fondo: "rojo" } } }) });
if (malColor.status !== 400) falla(`/acabado con colores que no son #RRGGBB debería ser 400, fue ${malColor.status}`);
console.log("✓ /acabado");

const h = await post("/hoja");
if (h.estado !== 200 || !medidasJpeg(h.bytes)) falla(`/hoja devolvió ${h.estado}`);
console.log(`✓ /hoja (${h.cabeceras.get("x-ms")} ms)`);

const r = await post("/revisar", { formatos: ["9:16", "1:1", "16:9"] });
const j = JSON.parse(new TextDecoder().decode(r.bytes));
if (r.estado !== 200 || j.formatos?.length !== 3 || !j.formatos.every((f) => Array.isArray(f.problemas))) falla(`/revisar devolvió ${r.estado}: ${JSON.stringify(j).slice(0, 200)}`);
if (j.formatos.some((f) => f.problemas.some((p) => p.grave))) falla(`el ejemplo neutro no debería tener problemas graves: ${j.formatos.map((f) => f.texto).join(" | ")}`);
console.log("✓ /revisar");

/** Una «voz» de prueba: `segundos` de un tono de 220 Hz que sube y baja, bajito (unos -30 LUFS), en WAV de 16 bits. */
function vozDePrueba(segundos) {
  const m = 24000;
  const n = Math.round(segundos * m);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(m, 24); b.writeUInt32LE(m * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / m;
    b.writeInt16LE(Math.round(1600 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t))), 44 + i * 2);
  }
  return b.toString("base64");
}

const linea = lineaDeTiempo(validarGuion(EJEMPLO_GUION).guion, null);
const v = await post("/render", { audio: vozDePrueba(Math.max(1, linea.total - 1)), efectos: true });
if (v.estado !== 200) falla(`/render devolvió ${v.estado}: ${new TextDecoder().decode(v.bytes).slice(0, 300)}`);
if (!esMp4(v.bytes)) falla("/render no devolvió un mp4");
const cuadros = Number(v.cabeceras.get("x-cuadros"));
if (cuadros !== cuadrosDelVideo(linea.total)) falla(`/render: ${cuadros} cuadros, se esperaban ${cuadrosDelVideo(linea.total)}`);
const lufs = Number(v.cabeceras.get("x-lufs"));
if (!(Math.abs(lufs - RENDER.lufs) <= 1)) falla(`/render: el volumen quedó en ${v.cabeceras.get("x-lufs")} LUFS, no en ${RENDER.lufs}`);
// La pista de video y la de audio están dentro (las cajas «avc1» y «mp4a» del moov).
const texto = Buffer.from(v.bytes).toString("latin1");
if (!texto.includes("avc1") || !texto.includes("mp4a")) falla("/render: al mp4 le falta la pista de video o la de audio");
console.log(`✓ /render (${(v.bytes.length / 1048576).toFixed(1)} MB, ${cuadros} cuadros, ${lufs} LUFS desde ${v.cabeceras.get("x-lufs-antes")}, ${v.cabeceras.get("x-ms")} ms)`);

// El texto con carácter: un titular GIGANTE con énfasis (la letra de la casa, Anton) y un fondo por crear se dibujan.
const gigante = JSON.parse(JSON.stringify(EJEMPLO_GUION));
gigante.escenas[0].capas = [
  { tipo: "imagen", id: "fondo", encuadre: "completo", pide: "Un grabado antiguo", oscurecer: 0.4 },
  { tipo: "texto", id: "t", texto: "Las manos *más bellas* de la historia", rol: "gigante", porPalabra: true, animacion: { entrada: "golpe" } },
];
const cg = await post("/cuadro", { guion: gigante, t: 2 });
if (cg.estado !== 200 || !medidasJpeg(cg.bytes)) falla(`/cuadro con un titular gigante devolvió ${cg.estado}: ${new TextDecoder().decode(cg.bytes).slice(0, 200)}`);
console.log("✓ /cuadro con el texto gigante (Anton) y un fondo por crear");

const roto = await post("/cuadro", { guion: { version: 1, escenas: [{ id: "x", tipo: "inventado", habla: "hola" }] } });
if (roto.estado !== 400) falla(`un guion roto debería ser 400, fue ${roto.estado}`);
console.log("✓ un guion roto es 400");
console.log("Todo bien.");
