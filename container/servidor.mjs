// ============================================================
// El servidor del CONTAINER del video animado (Node + @napi-rs/canvas)
//
// Dibuja con el MISMO motor que la vista previa del navegador (src/lib/motorVideo.js, copiado tal cual en la imagen):
// lo que ve Claude en un cuadro es lo que verá la persona y lo que saldrá en el mp4. Sin llaves y sin internet: el
// Worker le manda el guion, los tiempos, la paleta, las imágenes y las fuentes dentro del pedido.
//
//   GET  /salud     → 200 «ok» (el Worker espera esto antes del primer pedido)
//   POST /cuadro    { …, t, ancho?, tipo? }  → la imagen del instante t (JPEG por defecto; X-Escena: su id)
//   POST /hoja      { …, ancho? }            → una hoja con un cuadro de cada escena en su instante «lleno», numerados
//   POST /revisar   { …, formatos? }         → JSON { problemas, texto }: la revisión con las fuentes reales
//   POST /render    { …, audio? (base64), musica? { audio (base64), volumen }, efectos? (bool) }   → el MP4 entero (voz con los silencios, -14 LUFS, subtítulos), y en
//                                              cabeceras lo que tardó, la duración y el volumen medido
//   POST /miniatura { imagen (base64), lado? }  → JSON { datos (base64), mime, ancho, alto, original }: una COPIA
//                                              reducida en JPEG (lado mayor ≤ `lado`, 768 por defecto) para que Claude
//                                              VEA una pieza del Estudio por MCP sin mandarle la de 2K. No lleva guion.
//   POST /acabado   { imagen, mime?, texto? { texto, plantilla, colores, familia?, fuente? }, logo? { datos, posicion } }
//                                            → JSON { datos, mime, ancho, alto }: el texto de la plantilla y/o el logo
//                                              estampado encima de una pieza del Estudio (src/lib/acabadoLienzo.js, el
//                                              mismo dibujo que el navegador). No lleva guion.
//
// Todo pedido del video lleva { guion, palabras, formato, paleta, imagenes, logo, fuentes } (ver recursos.mjs). El
// guion se valida aquí también: lo que no valida no se dibuja.
// ============================================================

import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import process from "node:process";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { validarGuion, lineaDeTiempo, FORMATOS_VIDEO } from "../src/lib/videoEscenas.js";
import { dibujarFrame, paletaDelGuion, escenaEn } from "../src/lib/motorVideo.js";
import { revisarEscenas, textoDeRevision, instanteLleno } from "../src/lib/revisionEscenas.js";
import { prepararRecursos, registrarRespaldo, registrarFuente } from "./recursos.mjs";
import { dibujarTextoPlantilla, dibujarLogo, letraDe } from "../src/lib/acabadoLienzo.js";
import { renderizar } from "./render.mjs";

const PUERTO = Number(process.env.PORT || 8080);
/** Un pedido trae imágenes y fuentes en base64: más que esto no es un video animado. */
const TOPE_PEDIDO = 40 * 1024 * 1024;
/** Un render a la vez (ver render.mjs): el siguiente espera al anterior. */
let renderEnCurso = Promise.resolve();

class ErrorPedido extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    const trozos = [];
    let n = 0;
    req.on("data", (t) => {
      n += t.length;
      if (n > TOPE_PEDIDO) { mal(new ErrorPedido("El pedido es demasiado grande.", 413)); req.destroy(); return; }
      trozos.push(t);
    });
    req.on("end", () => ok(Buffer.concat(trozos)));
    req.on("error", mal);
  });
}

/** Lo común a todo pedido: el guion validado, su línea de tiempo, la paleta, el formato y lo que el motor necesita. */
async function preparar(p) {
  const v = validarGuion(p.guion);
  if (!v.ok) throw new ErrorPedido(`El guion tiene errores: ${v.errores.slice(0, 3).map((e) => `${e.donde}: ${e.mensaje}`).join("; ")}`);
  const guion = v.guion;
  const formato = FORMATOS_VIDEO[p.formato] ? p.formato : guion.formatos[0];
  const linea = lineaDeTiempo(guion, Array.isArray(p.palabras) ? p.palabras : null);
  const paleta = paletaDelGuion(guion, Array.isArray(p.paleta) ? p.paleta : []);
  const prep = await prepararRecursos(p);
  return { guion, formato, linea, paleta, ...prep };
}

/** Un lienzo de `ancho` px con el cuadro del instante t (el motor dibuja en las medidas del formato y se escala). */
function cuadro(base, t, ancho) {
  const { ancho: W, alto: H } = FORMATOS_VIDEO[base.formato];
  const w = Math.max(64, Math.min(W, Math.round(ancho)));
  const h = Math.round((w * H) / W);
  const lienzo = createCanvas(w, h);
  const ctx = lienzo.getContext("2d");
  ctx.scale(w / W, h / H);
  dibujarFrame(ctx, { guion: base.guion, linea: base.linea, t, formato: base.formato, paleta: base.paleta, recursos: base.recursos, fuentes: base.fuentes });
  return lienzo;
}

const codificar = (lienzo, tipo) => (tipo === "png" ? lienzo.encode("png") : lienzo.encode("jpeg", 84));

/** El lado mayor de una miniatura: lo que Claude necesita para juzgar una pieza sin pagar los tokens de una de 2K. */
const LADO_MINIATURA = 768;

/** Una imagen (base64) → su copia reducida en JPEG sobre blanco (el JPEG no tiene alfa). */
async function miniatura(p) {
  if (typeof p.imagen !== "string" || !p.imagen) throw new ErrorPedido("Falta la imagen.");
  let img;
  try { img = await loadImage(Buffer.from(p.imagen, "base64")); } catch { throw new ErrorPedido("No es una imagen que se pueda leer."); }
  const lado = Math.max(128, Math.min(1600, Math.round(Number(p.lado) || LADO_MINIATURA)));
  const f = Math.min(1, lado / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * f));
  const h = Math.max(1, Math.round(img.height * f));
  const lienzo = createCanvas(w, h);
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const jpg = await lienzo.encode("jpeg", 82);
  const json = JSON.stringify({ datos: jpg.toString("base64"), mime: "image/jpeg", ancho: w, alto: h, original: { ancho: img.width, alto: img.height } });
  return { cuerpo: Buffer.from(json), tipo: "application/json", cabeceras: {} };
}

const COLOR = /^#[0-9a-f]{6}$/i;
const PLANTILLAS = new Set(["banda", "arriba", "centro", "degradado"]);

/**
 * El ACABADO de una pieza ya hecha, sin pantalla: el texto de la plantilla encima y/o el logo estampado, con el MISMO
 * dibujo que el navegador (src/lib/acabadoLienzo.js). Lo pide el Worker cuando un encargo del Estudio termina una pieza
 * que necesitaba lienzo. → { datos (base64), mime, ancho, alto }.
 */
async function acabado(p) {
  if (typeof p.imagen !== "string" || !p.imagen) throw new ErrorPedido("Falta la imagen.");
  let img;
  try { img = await loadImage(Buffer.from(p.imagen, "base64")); } catch { throw new ErrorPedido("No es una imagen que se pueda leer."); }
  const ancho = img.width;
  const alto = img.height;
  const lienzo = createCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(img, 0, 0, ancho, alto);
  if (p.texto) {
    const t = p.texto;
    const colores = t.colores ?? {};
    if (![colores.fondo, colores.texto, colores.acento].every((c) => COLOR.test(String(c ?? "")))) throw new ErrorPedido("Los colores de la plantilla no son #RRGGBB.");
    const familia = registrarFuente(t.fuente) || String(t.familia ?? "");
    dibujarTextoPlantilla(ctx, {
      ancho, alto, texto: String(t.texto ?? "").slice(0, 600), plantilla: PLANTILLAS.has(t.plantilla) ? t.plantilla : "banda",
      colores, letra: letraDe(familia, "Roboto, sans-serif"),
    });
  }
  if (p.logo) {
    let logo;
    try { logo = await loadImage(Buffer.from(String(p.logo.datos ?? ""), "base64")); } catch { throw new ErrorPedido("El logo no es una imagen que se pueda leer."); }
    dibujarLogo(ctx, logo, { ancho, alto, posicion: p.logo.posicion ?? {} });
  }
  // PNG si se pidió (la pieza original lo era y puede tener transparencia); si no, JPEG de calidad alta, como el navegador.
  const png = p.mime === "image/png";
  const bytes = png ? await lienzo.encode("png") : await lienzo.encode("jpeg", p.texto ? 92 : 94);
  const json = JSON.stringify({ datos: bytes.toString("base64"), mime: png ? "image/png" : "image/jpeg", ancho, alto });
  return { cuerpo: Buffer.from(json), tipo: "application/json", cabeceras: {} };
}

async function atender(ruta, p) {
  if (ruta === "/miniatura") return miniatura(p);
  if (ruta === "/acabado") return acabado(p);
  const base = await preparar(p);
  const total = base.linea.total;
  if (ruta === "/cuadro") {
    const t = Math.max(0, Math.min(Number(p.t) || 0, Math.max(0, total - 1 / 30)));
    const lienzo = cuadro(base, t, Number(p.ancho) || 540);
    const k = escenaEn(base.linea, t);
    return {
      cuerpo: await codificar(lienzo, p.tipo), tipo: p.tipo === "png" ? "image/png" : "image/jpeg",
      cabeceras: { "X-Escena": String(base.guion.escenas[k]?.id ?? ""), "X-Segundo": t.toFixed(2), "X-Total": total.toFixed(2), "X-Faltan": base.faltan.join(",") },
    };
  }
  if (ruta === "/hoja") {
    const escenas = base.guion.escenas;
    const n = escenas.length;
    const columnas = n <= 4 ? n : n <= 9 ? 3 : 4;
    const filas = Math.ceil(n / columnas);
    const anchoCelda = Math.max(160, Math.min(360, Math.round((Number(p.ancho) || 1080) / columnas)));
    const { ancho: W, alto: H } = FORMATOS_VIDEO[base.formato];
    const altoCelda = Math.round((anchoCelda * H) / W);
    const rotulo = 34;
    const hoja = createCanvas(columnas * anchoCelda + (columnas + 1) * 8, filas * (altoCelda + rotulo) + (filas + 1) * 8);
    const ctx = hoja.getContext("2d");
    ctx.fillStyle = "#1c1c1c"; ctx.fillRect(0, 0, hoja.width, hoja.height);
    escenas.forEach((e, i) => {
      const t = instanteLleno(base.guion, base.linea, i);
      const x = 8 + (i % columnas) * (anchoCelda + 8);
      const y = 8 + Math.floor(i / columnas) * (altoCelda + rotulo + 8);
      ctx.drawImage(cuadro(base, t, anchoCelda), x, y, anchoCelda, altoCelda);
      ctx.fillStyle = "#ffffff"; ctx.font = "700 20px Roboto, sans-serif"; ctx.textBaseline = "middle";
      ctx.fillText(`${i + 1} · ${e.id} · ${t.toFixed(1)} s`, x + 4, y + altoCelda + rotulo / 2);
    });
    return { cuerpo: await codificar(hoja, p.tipo), tipo: p.tipo === "png" ? "image/png" : "image/jpeg", cabeceras: { "X-Total": total.toFixed(2), "X-Faltan": base.faltan.join(",") } };
  }
  if (ruta === "/render") {
    const audio = typeof p.audio === "string" && p.audio ? Buffer.from(p.audio, "base64") : null;
    const musica = typeof p.musica?.audio === "string" && p.musica.audio
      ? { audio: Buffer.from(p.musica.audio, "base64"), volumen: Number(p.musica.volumen) || 0 } : null;
    const efectos = p.efectos === true;
    const turno = renderEnCurso.then(() => renderizar(base, { audio, musica, efectos }));
    renderEnCurso = turno.catch(() => {});
    const r = await turno;
    return {
      cuerpo: r.mp4, tipo: "video/mp4",
      cabeceras: {
        "X-Duracion": r.duracion.toFixed(3), "X-Cuadros": String(r.cuadros), "X-Ancho": String(r.ancho), "X-Alto": String(r.alto),
        "X-Ms-Audio": String(r.ms.audio), "X-Ms-Video": String(r.ms.video),
        "X-Lufs": r.audio?.lufs === null || r.audio?.lufs === undefined ? "" : String(r.audio.lufs),
        "X-Lufs-Antes": r.audio?.antes === null || r.audio?.antes === undefined ? "" : String(r.audio.antes),
        "X-Faltan": base.faltan.join(","),
      },
    };
  }
  if (ruta === "/revisar") {
    const formatos = (Array.isArray(p.formatos) && p.formatos.length ? p.formatos : [base.formato]).filter((f) => FORMATOS_VIDEO[f]);
    const ctx = createCanvas(16, 16).getContext("2d");
    const porFormato = formatos.map((formato) => {
      const problemas = revisarEscenas(ctx, { guion: base.guion, linea: base.linea, formato, recursos: base.recursos, fuentes: base.fuentes });
      return { formato, problemas, texto: textoDeRevision(problemas, { formato }) };
    });
    const json = JSON.stringify({ formatos: porFormato, faltan: base.faltan, total });
    return { cuerpo: Buffer.from(json), tipo: "application/json", cabeceras: {} };
  }
  throw new ErrorPedido("No existe esa ruta.", 404);
}

const servidor = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/salud") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return; }
    if (req.method !== "POST") throw new ErrorPedido("Método no permitido.", 405);
    const crudo = await leerCuerpo(req);
    let p;
    try { p = JSON.parse(crudo.toString("utf8")); } catch { throw new ErrorPedido("El pedido no es JSON."); }
    const inicio = Date.now();
    const r = await atender(new URL(req.url, "http://x").pathname, p);
    res.writeHead(200, { "Content-Type": r.tipo, "X-Ms": String(Date.now() - inicio), ...r.cabeceras });
    res.end(r.cuerpo);
  } catch (e) {
    const estado = e instanceof ErrorPedido ? e.estado : 500;
    if (estado === 500) console.error("contenedor:", e);
    res.writeHead(estado, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: estado === 500 ? `El dibujo falló: ${e?.message ?? e}` : e.message }));
  }
});

const letras = registrarRespaldo();
servidor.listen(PUERTO, () => console.log(`contenedor del video animado en :${PUERTO} (${letras} archivos de Roboto)`));
