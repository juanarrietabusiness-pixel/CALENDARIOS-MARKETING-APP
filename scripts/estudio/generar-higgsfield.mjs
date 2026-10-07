// ============================================================
// Los modelos de Higgsfield, sacados de SU documentación
//
//   node scripts/estudio/generar-higgsfield.mjs          escribe src/lib/estudioHiggsfield.json
//   node scripts/estudio/generar-higgsfield.mjs --check   sólo comprueba que el JSON está al día
//
// Higgsfield publica, para cada ruta, sus campos, los valores que admite, sus límites y cuáles son
// obligatorios. Ese esquema vive en `worker/lib/estudio/higgsfield-schemas.json` (viene de
// docs.higgsfield.ai, «llms-full.txt»). De él SALE TODO lo que la pantalla enseña de cada modelo:
//
//   · los ajustes (los valores son la unión de lo que admiten sus rutas),
//   · qué imágenes admite (inicial, final, referencias) y si necesita alguna,
//   · a qué ruta va un pedido, según las imágenes que lleve (worker/lib/estudio/higgsfield.js).
//
// Aquí sólo se escribe LO QUE NO ESTÁ EN LA DOCUMENTACIÓN: cómo se llama cada modelo, qué rutas lo
// forman, cuánto cuesta (aproximado: Higgsfield no publica precios por llamada) y para qué sirve.
//
// SÓLO ENTRAN LOS MODELOS QUE SE PUEDEN PEDIR DESDE ESTA APLICACIÓN. Una ruta que exige un video queda
// fuera, salvo en los modelos marcados `conVideo`: los que siguen o copian un VIDEO DE REFERENCIA (el de la
// competencia, subido a la galería). Editar, alargar o cambiar un objeto de un video siguen fuera.
//
// El resultado se guarda en el repositorio y lo importan las dos puntas: la pantalla (catálogo) y el
// Worker (rutas). Un test lo vuelve a generar y compara: si alguien lo edita a mano, falla.
// ============================================================

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const RAIZ = new URL("../../", import.meta.url);
const ESQUEMAS = () => JSON.parse(fs.readFileSync(new URL("worker/lib/estudio/higgsfield-schemas.json", RAIZ), "utf8")).endpoints;
export const SALIDA = new URL("src/lib/estudioHiggsfield.json", RAIZ);

/** Las proporciones que la pantalla sabe nombrar y medir (las mismas de `estudioCatalogo.js`; un test lo comprueba). */
export const PROPORCIONES_CONOCIDAS = ["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2", "5:4", "21:9"];

/** Campo de la ruta → ajuste del catálogo. Lo demás (semillas, estilos, audio…) se deja a lo que decida la ruta. */
const AJUSTE_DE = { aspect_ratio: "aspectRatio", resolution: "resolution", duration: "duration", mode: "mode", quality: "quality", rendering_speed: "renderingSpeed" };
const CAMPOS_DE_VIDEO = ["video_url", "video_urls"];
export const CAMPOS_DE_MEDIO = ["first_frame_url", "last_frame_url", "end_image_url", "last_image_url", "image_url", "image_urls", "image_reference_url", ...CAMPOS_DE_VIDEO];
const MAX_VALORES = 30;

/** Qué papel cumple un campo de medio en un modelo de imagen o de video. */
export function papelDe(tipo, campo) {
  if (campo === "first_frame_url" || (campo === "image_url" && tipo === "video")) return "start";
  if (["last_frame_url", "end_image_url", "last_image_url"].includes(campo)) return "end";
  if (CAMPOS_DE_VIDEO.includes(campo)) return "video";
  return "reference";
}

const hfm = (id, nombre, tipo, rutas, costo, creador, calidad, velocidad, para, nota = "", conVideo = false) => ({ id, nombre, tipo, rutas, costo, creador, calidad, velocidad, para, nota, conVideo });
const HFV = (prefijo) => ({ text: `${prefijo}/text-to-video`, image: `${prefijo}/image-to-video`, reference: `${prefijo}/reference-to-video` });
const HF = "Higgsfield", K = "Kling (Kuaishou)", AL = "Alibaba";

/**
 * Los modelos. Los ids son los de Agents Office, para que lo aprendido allí valga aquí. Las rutas salen de la
 * documentación de Higgsfield (25 sep 2026); los precios son aproximados.
 */
export const MODELOS_HF = [
  // ---- Imagen
  hfm("soul-2", "Soul 2", "imagen", { text: "higgsfield-ai/soul/v2/standard" }, 0.03, HF, 3, "normal", ["moda", "redes", "retrato"], "Fotos con estética de moda y redes, la firma de Higgsfield."),
  hfm("soul", "Soul", "imagen", { text: "higgsfield-ai/soul/standard" }, 0.03, HF, 3, "normal", ["moda", "redes", "retrato"], "El Soul original; acepta una imagen de referencia."),
  hfm("soul-cinema", "Soul Cinema", "imagen", { text: "higgsfield-ai/soul/cinema" }, 0.05, HF, 3, "normal", ["cine", "fotogramas", "retrato"], "Fotogramas de cine: luz y encuadre de película."),
  hfm("marketing-studio", "Marketing Studio", "imagen", { text: "marketing-studio/image" }, 0.05, HF, 3, "normal", ["producto", "publicidad", "muchas referencias"], "Piezas de marketing con tu producto: hasta 16 referencias."),
  hfm("ideogram-4", "Ideogram 4", "imagen", { text: "ideogram/v4.0" }, 0.06, "Ideogram", 4, "normal", ["texto legible", "carteles", "posts con título"], "El mejor para TEXTO legible dentro de la imagen (carteles, posts con título); con una referencia, la rehace."),
  hfm("recraft-4.1", "Recraft 4.1", "imagen", { text: "recraft/v4.1/text-to-image" }, 0.04, "Recraft", 3, "normal", ["diseño gráfico", "ilustración", "vector"], "Diseño gráfico, ilustración y vector."),
  hfm("recraft-4.1-pro", "Recraft 4.1 Pro", "imagen", { text: "recraft/v4.1/pro/text-to-image" }, 0.08, "Recraft", 4, "normal", ["diseño gráfico", "2K"], "Recraft en 2K."),
  hfm("grok-imagine-2", "Grok Imagine 2", "imagen", { text: "xai/grok-imagine-image-2.0" }, 0.04, "xAI", 3, "rápido", ["editar fotos", "hasta 10 referencias"], "Crea o edita con hasta 10 referencias."),
  hfm("qwen-image-3", "Qwen Image 3", "imagen", { text: "alibaba/qwen-image-3/text-to-image", reference: "alibaba/qwen-image-3/edit" }, 0.03, AL, 3, "normal", ["texto en imagen", "editar fotos"], "Con referencias, edita tus imágenes (hasta 3)."),
  hfm("z-image-turbo", "Z-Image Turbo", "imagen", { text: "z-image/turbo" }, 0.01, AL, 2, "muy rápido", ["bocetos", "lotes", "barato"], "Rapidísimo y barato: para bocetos y lotes grandes."),
  // ---- Video. Cuestan por segundo y van por la cola.
  hfm("kling-3-std", "Kling 3.0", "video", { text: "kling-video/v3.0/std/text-to-video", image: "kling-video/v3.0/std/image-to-video" }, 0.08, K, 3, "normal", ["con sonido", "imagen inicial y final", "todo uso"], "El equilibrio: buena calidad, sonido, imagen inicial y final."),
  hfm("kling-3-pro", "Kling 3.0 Pro", "video", { text: "kling-video/v3.0/pro/text-to-video", image: "kling-video/v3.0/pro/image-to-video" }, 0.11, K, 4, "lento", ["con sonido", "calidad alta"]),
  hfm("kling-3-4k", "Kling 3.0 4K", "video", { text: "kling-video/v3.0/4k/text-to-video", image: "kling-video/v3.0/4k/image-to-video" }, 0.2, K, 4, "lento", ["4K", "con sonido"]),
  hfm("kling-omni", "Kling Omni · hasta 10 s", "video", { text: "kling-video/omni/image-reference", reference: "kling-video/omni/image-reference", image: "kling-video/omni/first-last-frame" }, 0.1, K, 4, "lento", ["hasta 10 s", "referencias de la marca", "imagen inicial y final"], "De 3 a 10 s, con hasta 4 referencias (el logo, el producto) o imagen inicial y final. Para reels cortos con la marca."),
  // Con un VIDEO de referencia: la estructura y el movimiento de un video de la competencia, con la marca.
  hfm("kling-omni-video", "Kling Omni · sigue un video", "video", { videoRef: "kling-video/omni/video-reference" }, 0.1, K, 4, "lento", ["seguir un video de referencia", "hasta 10 s", "referencias de la marca"], "Sigue los planos, el ritmo y el movimiento de un video de referencia (el de la competencia) con tu marca y tu producto: de 3 a 10 s y hasta 4 imágenes de referencia.", true),
  hfm("kling-motion", "Kling 3.0 · copia el movimiento", "video", { videoRef: "kling-video/v3/motion-control/std" }, 0.08, K, 3, "normal", ["copiar el movimiento", "persona o producto"], "Lleva el movimiento de un video (un gesto, un baile, cómo se enseña un producto) a tu imagen: una imagen inicial y el video.", true),
  hfm("kling-motion-pro", "Kling 3.0 Pro · copia el movimiento", "video", { videoRef: "kling-video/v3/motion-control/pro" }, 0.12, K, 4, "lento", ["copiar el movimiento", "calidad alta"], "Lo mismo, con más calidad.", true),
  hfm("kling-3-turbo", "Kling 3.0 Turbo", "video", { text: "kling-video/v3.0-turbo/text-to-video", image: "kling-video/v3.0-turbo/image-to-video" }, 0.06, K, 2, "rápido", ["rápido", "redes"], "El más rápido de Kling 3."),
  hfm("kling-2.6", "Kling 2.6 Pro", "video", { text: "kling-video/v2.6/pro/text-to-video", image: "kling-video/v2.6/pro/image-to-video" }, 0.07, K, 3, "normal", ["con sonido"]),
  hfm("kling-2.5", "Kling 2.5 Turbo · Anima una foto", "video", { image: "kling-video/v2.5-turbo/standard/image-to-video" }, 0.05, K, 2, "rápido", ["animar una foto", "barato"], "Barato y rápido para animar una imagen."),
  hfm("kling-2.5-pro", "Kling 2.5 Turbo Pro", "video", { text: "kling-video/v2.5-turbo/pro/text-to-video", image: "kling-video/v2.5-turbo/pro/image-to-video" }, 0.07, K, 3, "normal", ["texto o foto"]),
  hfm("seedance-2", "Seedance 2.0", "video", HFV("bytedance/seedance-2.0"), 0.1, "ByteDance", 3, "normal", ["referencias", "con audio", "personajes"], "Hasta 9 referencias (personaje, producto, estilo) y audio."),
  hfm("seedance-2.5", "Seedance 2.5", "video", HFV("bytedance/seedance-2.5"), 0.1, "ByteDance", 4, "lento", ["hasta 30 s", "con audio", "muchas referencias"], "Hasta 30 s, audio, muchas referencias."),
  hfm("minimax-hailuo-2.3", "MiniMax Hailuo 2.3", "video", { text: "minimax/hailuo-2.3/standard/text-to-video", image: "minimax/hailuo-2.3/standard/image-to-video" }, 0.045, "MiniMax", 3, "normal", ["movimiento natural", "6 o 10 s"], "Videos de 6 o 10 s."),
  hfm("minimax-h3", "MiniMax H3", "video", HFV("minimax/h3"), 0.06, "MiniMax", 4, "lento", ["2K", "referencias"], "En 2K; texto, una imagen inicial o referencias."),
  hfm("wan-2.7", "Wan 2.7", "video", HFV("wan/v2.7"), 0.045, AL, 3, "normal", ["referencias", "imagen inicial y final"], "Texto, imagen o referencias."),
  hfm("wan-3", "Wan 3.0", "video", HFV("alibaba/wan-3.0"), 0.05, AL, 3, "normal", ["hasta 30 s", "con audio", "referencias"], "Hasta 30 s, audio, referencias."),
  hfm("ltx-2.5-pro", "LTX 2.5 Pro", "video", { text: "lightricks/ltx-2.5/text-to-video/pro", image: "lightricks/ltx-2.5/image-to-video/pro" }, 0.06, "Lightricks", 3, "normal", ["movimientos de cámara", "con audio"], "Con movimientos de cámara; 6, 8 o 10 s, vertical u horizontal."),
  hfm("ltx-2.5-fast", "LTX 2.5 Fast", "video", { text: "lightricks/ltx-2.5/text-to-video/fast", image: "lightricks/ltx-2.5/image-to-video/fast" }, 0.03, "Lightricks", 2, "rápido", ["hasta 4K", "barato"], "Rápido y barato; hasta 4K."),
  hfm("pixverse-6", "PixVerse 6", "video", { text: "pixverse/v6/text-to-video", image: "pixverse/v6/image-to-video" }, 0.05, "PixVerse", 3, "rápido", ["redes", "con audio"]),
  hfm("happy-horse-1.1", "Happy Horse 1.1", "video", HFV("alibaba/happy-horse/v1.1"), 0.045, AL, 3, "normal", ["referencias", "1080p"], "De Alibaba; texto, imagen o referencias."),
];

const unico = (lista, v) => { if (!lista.includes(v)) lista.push(v); };

/** Los valores enteros de un rango, sin pasar de MAX_VALORES. */
function rango(min, max) {
  const n = max - min + 1;
  const paso = Math.max(1, Math.ceil(n / MAX_VALORES));
  const salida = [];
  for (let v = min; v <= max; v += paso) salida.push(String(v));
  if (salida[salida.length - 1] !== String(max)) salida.push(String(max));
  return salida;
}

/** Un modelo del catálogo a partir de su definición y del esquema. Lanza si una ruta no existe o el modelo queda vacío. */
export function construir(def, esquemas = ESQUEMAS()) {
  const todas = Object.entries(def.rutas);
  for (const [, eid] of todas) if (!esquemas[eid]) throw new Error(`${def.id}: la ruta «${eid}» no está en el esquema de Higgsfield.`);
  // Una ruta que exige un video sólo entra en los modelos de video de referencia (`conVideo`).
  const exigeVideo = (eid) => esquemas[eid].req.some((c) => CAMPOS_DE_VIDEO.includes(c));
  const rutas = Object.fromEntries(todas.filter(([, eid]) => def.conVideo || !exigeVideo(eid)));
  if (!Object.keys(rutas).length) throw new Error(`${def.id}: todas sus rutas exigen un video.`);
  const ids = Object.values(rutas);

  // Qué imágenes admite y cuántas.
  const roles = { start: 0, end: 0, reference: 0 };
  for (const eid of ids) {
    const P = esquemas[eid].p;
    for (const campo of CAMPOS_DE_MEDIO) {
      if (!P[campo] || CAMPOS_DE_VIDEO.includes(campo)) continue;
      const papel = papelDe(def.tipo, campo);
      const n = /_urls$/.test(campo) ? (P[campo].maxItems || 8) : 1;
      roles[papel] = Math.max(roles[papel], n);
    }
  }
  // ¿Se puede pedir sin ninguna imagen? Sólo si alguna ruta no exige ninguna (el video de referencia va aparte).
  const sinImagen = ids.some((eid) => !esquemas[eid].req.some((c) => CAMPOS_DE_MEDIO.includes(c) && !CAMPOS_DE_VIDEO.includes(c)));
  const conVideo = Boolean(def.conVideo) && ids.some((eid) => CAMPOS_DE_VIDEO.some((c) => esquemas[eid].p[c]));
  const necesitaVideo = conVideo && ids.every(exigeVideo);

  // Los ajustes: la unión de lo que admiten sus rutas.
  const acumulado = {};
  for (const eid of ids) {
    for (const [campo, clave] of Object.entries(AJUSTE_DE)) {
      const f = esquemas[eid].p[campo];
      if (!f) continue;
      const a = (acumulado[clave] ??= { valores: [], defecto: undefined });
      if (a.defecto === undefined && f.d !== undefined) a.defecto = String(f.d);
      if (f.e) for (const v of f.e) unico(a.valores, String(v));
      else if ((f.t === "integer") && f.min !== undefined && f.max !== undefined) for (const v of rango(f.min, f.max)) unico(a.valores, v);
    }
  }
  const ajustes = {};
  for (const [clave, a] of Object.entries(acumulado)) {
    const valores = clave === "aspectRatio" ? a.valores.filter((v) => PROPORCIONES_CONOCIDAS.includes(v)) : a.valores;
    if (!valores.length) continue;
    ajustes[clave] = { valores, defecto: valores.includes(a.defecto) ? a.defecto : valores[0] };
  }
  // La proporción con que arranca: la de una historia o un reel para un video y la cuadrada para una imagen, si el modelo la admite
  // (la de la documentación es la que le queda mejor al modelo, no a una agencia de redes). Al pedir desde una publicación ya viene fijada.
  const preferida = def.tipo === "video" ? "9:16" : "1:1";
  if (ajustes.aspectRatio?.valores.includes(preferida)) ajustes.aspectRatio.defecto = preferida;

  return {
    id: def.id, motor: "higgsfield", tipo: def.tipo, nombre: def.nombre, creador: def.creador, calidad: def.calidad, velocidad: def.velocidad,
    costo: def.costo, ...(def.tipo === "video" ? { por: "s" } : {}), estimado: true,
    referencias: roles.reference, ...(def.tipo === "video" ? { inicial: roles.start, final: roles.end } : {}),
    ...(sinImagen ? {} : { necesitaImagen: true }),
    ...(conVideo ? { video: 1 } : {}), ...(necesitaVideo ? { necesitaVideo: true } : {}),
    ...(def.tipo === "video" && !ajustes.duration ? { segundos: 5 } : {}),
    cola: true,
    nota: `${def.nota ? `${def.nota} ` : ""}Precio aproximado.`.trim(),
    para: def.para, ajustes, rutas,
  };
}

export function generar(esquemas = ESQUEMAS()) {
  return MODELOS_HF.map((d) => construir(d, esquemas));
}

/** El texto exacto del archivo (con salto final): lo que se escribe y lo que un test compara. */
export const texto = (modelos = generar()) => `${JSON.stringify(modelos, null, 1)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const esperado = texto();
  if (process.argv.includes("--check")) {
    const hay = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, "utf8") : "";
    if (hay !== esperado) {
      console.error("src/lib/estudioHiggsfield.json no está al día. Ejecuta: node scripts/estudio/generar-higgsfield.mjs");
      process.exit(1);
    }
    console.log("estudioHiggsfield.json está al día.");
  } else {
    fs.writeFileSync(SALIDA, esperado);
    console.log(`Escritos ${MODELOS_HF.length} modelos en src/lib/estudioHiggsfield.json`);
  }
}
