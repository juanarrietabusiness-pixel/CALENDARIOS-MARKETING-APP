// ============================================================
// `subir_a_galeria` y `confirmar_subida`: lo que Claude hace FUERA del calendario entra en la galería del cliente
//
// Claude ya arma videos con código en su propia máquina (Python, PIL, ffmpeg) y quedan mejor y gratis; lo que no podía
// era DEJARLOS en el calendario. Dos caminos:
//   · `url`: el servidor baja el archivo (sólo https, con su tamaño dicho y el tipo por sus primeros bytes: el mismo
//     `abrirDescarga` que los resultados de los motores) y lo guarda en el acto.
//   · Sin `url`: la herramienta devuelve un ENLACE DE SUBIDA firmado (PUT, 15 minutos, UN solo uso) atado al espacio, al
//     cliente y a la persona del token MCP. Claude sube los bytes con `curl -T` y luego `confirmar_subida` lo pone en
//     su publicación si hace falta. La ficha se crea con la subida misma: aunque se olvide de confirmar, está en la
//     galería.
//
// Lo que se comprueba, porque los bytes llegan de fuera:
//   · El TIPO por los primeros bytes (`tipoPorBytes`), nunca por la extensión ni por la cabecera: MP4 y MOV, PNG, JPEG y
//     WebP, MP3, WAV y M4A. Nada de SVG ni HTML (se ejecutarían en nuestro origen con la sesión de la agencia).
//   · El TAMAÑO: el `Content-Length` es obligatorio (R2 necesita saberlo para guardar por flujo) y cada tipo tiene su
//     tope (`MAX_SUBIDA_CLAUDE`). El video, 95 MB: el cuerpo de una petición a Cloudflare no pasa de 100.
//   · UN USO: la ficha lleva el id del enlace; si ya existe, el enlace se gastó (409).
//   · Medidas y duración se leen de R2 por rangos (sonda.js): no se cree lo que diga quien sube.
//
// El archivo queda con `origen: "subida-claude"` y `subido: 1` (como lo subido a mano: la papelera puede borrarlo de
// R2). No gasta IA.
// ============================================================

import { crearAcceso } from "../acceso.js";
import { firmarCon, leerFirmado } from "../firmas.js";
import { secretoDeVista } from "../medioVista.js";
import { difundir } from "../vivo.js";
import { uuid } from "../ids.js";
import { claveDeArchivo, tipoPorBytes } from "./archivos.js";
import { abrirDescarga, guardarDescarga } from "./descarga.js";
import { archivoPublico } from "./galeria.js";
import { sondearEnR2 } from "./sonda.js";
import { ponerPiezasEnPost, ErrorPoner } from "./ponerPiezas.js";
import { MODELO_MUSICA_SUBIDA, MODELO_EFECTO_SUBIDO } from "../../../src/lib/bibliotecaSonido.js";

const MB = 1024 * 1024;
/** Lo más que pesa cada tipo. El video, por debajo de los 100 MB de cuerpo que admite Cloudflare. */
export const MAX_SUBIDA_CLAUDE = Object.freeze({ video: 95 * MB, imagen: 15 * MB, audio: 20 * MB });
export const VIDA_SUBIDA_MS = 15 * 60_000;
export const RUTA_SUBIR = "/api/subir/";
export const ORIGEN_SUBIDA_CLAUDE = "subida-claude";
/** El audio subido que no es música ni efecto (una locución hecha fuera): no entra en la biblioteca de sonido. */
export const MODELO_VOZ_SUBIDA = "voz-subida";
const USO = "subir-galeria";

const TIPOS = Object.freeze({
  "video/mp4": "video", "image/png": "imagen", "image/jpeg": "imagen", "image/webp": "imagen",
  "audio/mpeg": "audio", "audio/wav": "audio", "audio/mp4": "audio",
});
const USOS_AUDIO = ["musica", "efecto", "voz"];
const ID = /^[0-9a-f-]{36}$/;

export class ErrorSubida extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

const megas = (b) => `${(b / MB).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;
const nombreTipo = { video: "un video", imagen: "una imagen", audio: "un audio" };

/** El tipo de galería de un mime aceptado, o null. Pura. */
export const tipoDeSubida = (mime) => TIPOS[mime] ?? null;

/** ¿Pesa demasiado para su tipo? El motivo, o "". Pura. */
export function problemaDeTamano(tipo, bytes) {
  const tope = MAX_SUBIDA_CLAUDE[tipo];
  if (!(bytes > 0)) return "El archivo está vacío.";
  return tope && bytes > tope ? `Pesa ${megas(bytes)} y ${nombreTipo[tipo]} admite como mucho ${megas(tope)}.` : "";
}

const MENSAJE_TIPO = "Sólo se suben videos MP4 o MOV, imágenes PNG, JPEG o WebP y audios MP3, WAV o M4A (se reconoce por sus bytes, no por la extensión).";

/**
 * Crea la ficha de la galería de lo ya guardado en R2 en `clave`, con sus medidas leídas de R2. `id`: el del enlace
 * (o uno nuevo). → la ficha pública. Si la ficha no entra (el enlace se usó a la vez dos veces), borra el objeto.
 */
export async function registrarSubida(env, acceso, clientId, { id = uuid(), clave, mime, bytes, titulo = "", uso = "", por = null, nombrePersona = "" }) {
  const tipo = tipoDeSubida(mime);
  const medida = await sondearEnR2(env, clave, mime, bytes);
  const modelo = tipo === "audio" ? ({ efecto: MODELO_EFECTO_SUBIDO, voz: MODELO_VOZ_SUBIDA }[uso] ?? MODELO_MUSICA_SUBIDA) : "";
  const ahora = new Date().toISOString();
  const ajustes = {
    ...(titulo ? { titulo } : {}), ...(medida.duracion ? { duracion: medida.duracion } : {}),
    subidaPor: nombrePersona || "Claude",
  };
  let fila;
  try {
    fila = await acceso.insertar("estudio_archivos", {
      id, client_id: clientId, clave, tipo, mime, ancho: medida.ancho, alto: medida.alto, bytes,
      prompt: String(titulo || "Subido por Claude").slice(0, 200), modelo, ajustes: JSON.stringify(ajustes), trabajo_id: null,
      carpeta_id: null, origen: ORIGEN_SUBIDA_CLAUDE, costo: 0, favorito: 0, subido: 1, usado_en: "[]", huella: "",
      borrado_at: null, created_at: ahora, updated_at: ahora,
    });
  } catch {
    await env.MEDIA.delete(clave).catch(() => null);
    throw new ErrorSubida("Ese enlace de subida ya se usó.", 409);
  }
  difundir(env, acceso.ownerId, { tipo: tipo === "audio" ? "sonidos" : "estudio", clientId, clienteId: clientId, por: por ?? { userId: "sistema", nombre: "Claude", color: "#D97757", tab: null } });
  return archivoPublico(fila);
}

/** Lo que se dice de una pieza subida: tipo, medidas, duración y peso. Pura. */
export function describirSubida(a) {
  const aj = a.ajustes ?? {};
  const partes = [a.tipo === "video" ? "video" : a.tipo === "audio" ? "audio" : "imagen"];
  if (a.ancho > 0 && a.alto > 0) partes.push(`${a.ancho}×${a.alto}`);
  if (aj.duracion) partes.push(`${Number(aj.duracion).toLocaleString("es", { maximumFractionDigits: 1 })} s`);
  if (a.bytes) partes.push(megas(a.bytes));
  return partes.join(" · ");
}

/** Avisos de lo que no va a salir bien en redes (un reel apaisado, de más de 3 minutos…). Pura. */
export function avisosDeSubida(a) {
  const aj = a.ajustes ?? {};
  const avisos = [];
  if (a.tipo === "video") {
    if (!aj.duracion) avisos.push("No pude leer su duración (¿no es un MP4 completo?): revisa que se reproduzca.");
    else if (aj.duracion > 180) avisos.push("Dura más de 3 minutos: Instagram no lo publica como reel.");
    if (a.ancho > 0 && a.alto > 0 && a.ancho >= a.alto) avisos.push("No es vertical: como reel o historia saldrá con franjas (9:16 es 1080×1920).");
  }
  return avisos;
}

// ------------------------------------------------------------
// Las herramientas
// ------------------------------------------------------------

const pubDesc = {
  publicacion_id: { type: "string", description: "Opcional: el ID de una publicación (de ver_calendario) donde ponerlo al terminar." },
  como: { type: "string", enum: ["medio", "portada"], description: "Con publicacion_id: «medio» (entre sus archivos; por defecto) o «portada» (UNA imagen, la portada del video de un reel)." },
  modo: { type: "string", enum: ["reemplazar", "anadir"], description: "Con publicacion_id: reemplazar lo que tenía (por defecto; lo de antes sigue en la galería) o añadir al final." },
};

export const DEFINICIONES_SUBIDA = Object.freeze([
  {
    name: "subir_a_galeria",
    description:
      "Sube a la GALERÍA de un cliente un archivo que hiciste FUERA del calendario (un mp4 que armaste con código, una imagen, una locución o una música): " +
      "MP4 o MOV (hasta 95 MB), PNG, JPEG o WebP (15 MB), MP3, WAV o M4A (20 MB). Dos formas: con «url» (https, que el servidor pueda descargar) queda " +
      "guardado en el acto; sin «url» devuelve un ENLACE DE SUBIDA (vale 15 minutos y una sola vez): sube los bytes con el comando que te da " +
      "(`curl -T archivo.mp4 \"<enlace>\"`) y luego llama a confirmar_subida con el subida_id (y la publicación, si va en una). Con publicacion_id y «url», " +
      "lo pone ya en esa publicación (un mp4 en un reel lo deja como su video; una imagen en un reel con video, como su portada). No gasta IA.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre del cliente (o su id). Basta con parte del nombre." },
        url: { type: "string", description: "Opcional: una dirección https de donde bajar el archivo. Sin ella, te doy un enlace para subirlo tú." },
        titulo: { type: "string", description: "Cómo se llama en la galería (p. ej. «Reel wipes Dany Baby 30 s»)." },
        uso: { type: "string", enum: USOS_AUDIO, description: "Sólo para un audio: «musica» (entra en su biblioteca de sonido; por defecto), «efecto» o «voz» (una locución hecha fuera)." },
        ...pubDesc,
      },
      required: ["cliente"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "confirmar_subida",
    description:
      "Después de subir los bytes al enlace de subir_a_galeria: comprueba que el archivo llegó (tipo, medidas, duración) y, con publicacion_id, lo pone en " +
      "esa publicación. Devuelve su ID de la galería (sirve para ver_pieza, video_listo, poner_en_publicacion, exportar_piezas). No gasta IA.",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Nombre del cliente (o su id)." },
        subida_id: { type: "string", description: "El subida_id que devolvió subir_a_galeria." },
        ...pubDesc,
      },
      required: ["cliente", "subida_id"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
]);

/** Las herramientas. `origen`: el del conector (https://…), para que el enlace de subida vaya entero. */
export function crearHerramientasSubida({ env, acceso, resolverCliente, usuario, por }) {
  async function poner(c, archivo, { publicacion_id: postId, como, modo }) {
    if (!postId) return "";
    try {
      const r = await ponerPiezasEnPost(env, acceso, c, { postId: String(postId), archivoIds: [archivo.id], modo: modo === "anadir" ? "anadir" : "reemplazar", como: como === "portada" ? "portada" : "" });
      return r.portada ? `Puesta como PORTADA del video de la publicación ${r.postId}.` : `Puesta en la publicación ${r.postId} (ahora ${r.formato || "con"} ${r.n} ${r.n === 1 ? "archivo" : "archivos"}).`;
    } catch (e) {
      if (e instanceof ErrorPoner) return `NO se puso en la publicación ${postId}: ${e.message} (el archivo sí quedó en la galería).`;
      throw e;
    }
  }

  const resumen = (c, a, extra) => [
    `Listo: «${a.prompt}» está en la galería de ${c.name} (ID ${a.id}; ${describirSubida(a)}).`,
    ...avisosDeSubida(a).map((x) => `OJO: ${x}`),
    extra,
    a.tipo === "video" ? "Para revisarlo: video_listo o ver_pieza con ese ID. Para ponerlo en otra publicación: poner_en_publicacion." : "",
  ].filter(Boolean).join("\n");

  return {
    async subir_a_galeria({ cliente, url, titulo = "", uso = "", publicacion_id: postId, como, modo }) {
      const c = await resolverCliente(cliente);
      const limpio = String(titulo ?? "").trim().slice(0, 120);
      const usoAudio = USOS_AUDIO.includes(uso) ? uso : "";
      if (url) {
        let descarga;
        try {
          descarga = await abrirDescarga(String(url), { tope: MAX_SUBIDA_CLAUDE.video, tipos: Object.keys(TIPOS), nombre: "esa dirección" });
        } catch (e) {
          throw new ErrorSubida(`${e.message} ${/no es un archivo/.test(e.message) ? MENSAJE_TIPO : ""}`.trim());
        }
        const tipo = tipoDeSubida(descarga.mime);
        const problema = problemaDeTamano(tipo, descarga.largo);
        if (problema) { await descarga.cuerpo.cancel().catch(() => {}); throw new ErrorSubida(problema); }
        const clave = claveDeArchivo(c.id, limpio || "subida claude", descarga.mime);
        await guardarDescarga(env, clave, descarga);
        const a = await registrarSubida(env, acceso, c.id, { clave, mime: descarga.mime, bytes: descarga.largo, titulo: limpio, uso: usoAudio, por, nombrePersona: usuario?.nombre });
        return resumen(c, a, await poner(c, a, { publicacion_id: postId, como, modo }));
      }
      const secreto = await secretoDeVista(env).catch(() => null);
      if (!secreto) throw new ErrorSubida("No pude preparar el enlace de subida ahora. Inténtalo otra vez.", 503);
      const id = uuid();
      const testigo = await firmarCon(secreto, USO, {
        o: acceso.ownerId, u: usuario?.id ?? "", n: String(usuario?.nombre ?? "").slice(0, 40), cl: usuario?.clientes ?? null,
        c: c.id, id, t: limpio, a: usoAudio,
      }, VIDA_SUBIDA_MS);
      const enlace = `${RUTA_SUBIR}${testigo}`;
      return [
        `Enlace de subida para la galería de ${c.name} (vale 15 minutos y UNA sola vez). subida_id: ${id}`,
        `Enlace: ${enlace}`,
        `Sube el archivo así (PUT con el archivo tal cual, sin formulario): curl -sS -T "ruta/del/archivo.mp4" "${enlace}"`,
        `Topes: video ${megas(MAX_SUBIDA_CLAUDE.video)}, imagen ${megas(MAX_SUBIDA_CLAUDE.imagen)}, audio ${megas(MAX_SUBIDA_CLAUDE.audio)}. El tipo se reconoce por los bytes.`,
        `Después: confirmar_subida con subida_id ${id}${postId ? ` y publicacion_id ${postId}` : " (y publicacion_id si va en una publicación)"}.`,
      ].join("\n");
    },

    async confirmar_subida({ cliente, subida_id: id, publicacion_id: postId, como, modo }) {
      const c = await resolverCliente(cliente);
      if (!ID.test(String(id ?? ""))) throw new ErrorSubida("Ese subida_id no es válido: es el que devolvió subir_a_galeria.");
      const f = await acceso.leerUno("estudio_archivos", { id: String(id), client_id: c.id });
      if (!f) throw new ErrorSubida(`Todavía no llegó nada a ese enlace (subida_id ${id}). Sube el archivo con el comando que te di (curl -T …) y vuelve a confirmar; si pasaron 15 minutos, pide otro enlace con subir_a_galeria.`, 404);
      if (f.borrado_at) throw new ErrorSubida("Ese archivo ya se mandó a la papelera de la galería.", 409);
      const a = archivoPublico(f);
      return resumen(c, a, await poner(c, a, { publicacion_id: postId, como, modo }));
    },
  };
}

// ------------------------------------------------------------
// La ruta: PUT /api/subir/<testigo>
// ------------------------------------------------------------

const respuesta = (estado, cuerpo) => new Response(JSON.stringify(cuerpo), {
  status: estado,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const error = (estado, mensaje) => respuesta(estado, { error: mensaje });

/** PUT (o POST con el archivo tal cual) a /api/subir/<testigo> — sin sesión: sólo lo que dice su testigo firmado. */
export async function rutaSubir(req, env, partes) {
  const testigo = String(partes[1] ?? "");
  if (!["PUT", "POST"].includes(req.method)) return error(405, "Sube el archivo con PUT (curl -T archivo \"<enlace>\").");
  const secreto = await secretoDeVista(env).catch(() => null);
  const d = secreto && testigo && testigo.length < 4000 ? await leerFirmado(secreto, USO, testigo) : null;
  if (!d?.o || !d?.c || !ID.test(String(d.id ?? ""))) return error(404, "Este enlace de subida no existe o ya caducó (dura 15 minutos). Pide otro con subir_a_galeria.");
  if (/multipart\/form-data/i.test(req.headers.get("content-type") ?? "")) return error(400, "Manda el archivo TAL CUAL en el cuerpo (curl -T archivo \"<enlace>\"), no como formulario.");
  const largo = Number(req.headers.get("content-length"));
  if (!(largo > 0)) return error(411, "Falta el tamaño del archivo (Content-Length): súbelo con curl -T, que lo pone solo.");
  if (largo > MAX_SUBIDA_CLAUDE.video) return error(413, `Pesa ${megas(largo)} y lo más que se sube son ${megas(MAX_SUBIDA_CLAUDE.video)}.`);
  if (!req.body) return error(400, "No llegó ningún archivo.");

  const acceso = crearAcceso(env.DB, d.o, Array.isArray(d.cl) ? { clientes: d.cl } : {});
  const cliente = await acceso.leerUno("clients", { id: d.c }).catch(() => null);
  if (!cliente) return error(404, "Ese cliente ya no está.");
  if (await acceso.leerUno("estudio_archivos", { id: d.id, client_id: d.c }).catch(() => null)) return error(409, "Este enlace de subida ya se usó. Pide otro con subir_a_galeria.");

  // El primer trozo se lee para saber qué es; luego vuelve a ir por delante.
  const lector = req.body.getReader();
  const primero = await lector.read();
  let cabecera = primero.value instanceof Uint8Array ? primero.value : new Uint8Array(primero.value ?? []);
  const trozos = [cabecera];
  // Un trozo muy corto no basta para reconocer el tipo: se juntan unos bytes más.
  while (cabecera.length < 16 && !primero.done) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    cabecera = new Uint8Array(trozos.reduce((s, t) => s + t.length, 0));
    let p = 0;
    for (const t of trozos) { cabecera.set(t, p); p += t.length; }
  }
  const mime = tipoPorBytes(cabecera);
  const tipo = tipoDeSubida(mime);
  if (!tipo) { await lector.cancel().catch(() => {}); return error(415, MENSAJE_TIPO); }
  const problema = problemaDeTamano(tipo, largo);
  if (problema) { await lector.cancel().catch(() => {}); return error(413, problema); }
  const cuerpo = new ReadableStream({
    start(c) { for (const t of trozos) c.enqueue(t); },
    async pull(c) {
      const { done, value } = await lector.read();
      if (done) c.close(); else c.enqueue(value);
    },
    cancel() { return lector.cancel(); },
  });
  const clave = claveDeArchivo(d.c, d.t || "subida claude", mime);
  try {
    await guardarDescarga(env, clave, { cuerpo, largo, mime });
  } catch {
    await env.MEDIA.delete(clave).catch(() => null);
    return error(400, "El archivo no llegó entero (el tamaño no coincide con lo que se mandó). Vuelve a subirlo.");
  }
  try {
    const a = await registrarSubida(env, acceso, d.c, {
      id: d.id, clave, mime, bytes: largo, titulo: d.t, uso: d.a,
      por: { userId: d.u || "sistema", nombre: `Claude (${d.n || "MCP"})`, color: "#D97757", tab: null }, nombrePersona: d.n,
    });
    return respuesta(201, {
      ok: true, subida_id: a.id, id: a.id, tipo: a.tipo, mime: a.mime, ancho: a.ancho, alto: a.alto, bytes: a.bytes,
      duracion: a.ajustes?.duracion ?? null, siguiente: "Llama a confirmar_subida con este subida_id (y la publicación, si va en una).",
    });
  } catch (e) {
    if (e instanceof ErrorSubida) return error(e.estado, e.message);
    throw e;
  }
}
