// ============================================================
// El kit de marca del Estudio: guardarlo, prepararlo con la IA desde el
// cerebro y revisar una pieza contra él
//
// Lo puro (limpiar, presets, pedidos y lecturas) vive en
// src/lib/kitMarca.js, que también usa la pantalla. Aquí lo que toca la
// base, R2 y la IA:
//
//   · GUARDAR: sólo lo que entiende `limpiarKit`, y el logo tiene que ser una
//     imagen de ESTE cliente que exista (la clave llega del navegador).
//   · PREPARAR: la guía visual sale del cerebro con `para: "imagen"` —nunca
//     las notas internas— más la ficha del cliente (rubro, colores, estilo).
//     Devuelve una PROPUESTA; no guarda nada: la persona la revisa y guarda.
//   · REVISAR: la IA MIRA la imagen (de la galería del cliente) con el kit
//     delante y dice qué respeta, qué no y qué añadir al pedido.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { buscar as buscarCerebro } from "../cerebro/cerebro.js";
import { pack } from "../cerebro/memoria.js";
import { claveDelCliente } from "./archivos.js";
import { modeloPorId, VOCES_OMNI } from "../../../src/lib/estudioCatalogo.js";
import { ErrorEstudio } from "./trabajos.js";
import { aBase64 } from "./gemini.js";
import { limpiarKit, kitVacio, pedidoDeKit, leerKit, pedidoDeRevision, leerRevision } from "../../../src/lib/kitMarca.js";
import { estudioParaElKit } from "../../../src/lib/estudioMercado.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const CONSULTA_VISUAL = "estilo visual identidad paleta colores hex fotografía iluminación composición tipografía logo evitar negativos";
const MAX_GUIA = 4_000;
/** Lo que Anthropic admite por imagen (5 MB en base64): con margen. */
const MAX_BYTES_REVISION = 3_600_000;

/** Lo que el kit necesita del estudio de mercado aprobado (vacío si no hay). No puede tumbar la preparación. */
async function estudioAprobado(acceso, clienteId) {
  try {
    const f = await acceso.leerUno("mercado_clientes", { client_id: clienteId });
    return estudioParaElKit(leerJSON(f?.estudio, null));
  } catch {
    return "";
  }
}

/** El kit guardado de un cliente (fila de `clients`). */
export const kitDe = (cliente) => limpiarKit(leerJSON(cliente?.kit_marca, {}));

/** Guarda el kit. El logo, si viene, tiene que ser una imagen de este cliente que exista. */
export async function guardarKit(env, acceso, cliente, entrada) {
  const kit = limpiarKit(entrada);
  // La voz, sólo una de las fijas de Google (la pantalla no ofrece otras; el servidor no se lo cree).
  if (kit.voz && !Object.hasOwn(VOCES_OMNI, kit.voz)) kit.voz = "";
  // Las referencias de cada tipo las manda el navegador: sólo claves de ESTE cliente (una ajena no llega a un motor).
  kit.referencias = Object.fromEntries(Object.entries(kit.referencias)
    .map(([id, claves]) => [id, claves.filter((c) => claveDelCliente(c, cliente.id))])
    .filter(([, claves]) => claves.length));
  // Las imágenes de los personajes, igual: sólo de ESTE cliente; un personaje sin ninguna, fuera.
  kit.personajes = kit.personajes
    .map((p) => ({ ...p, imagenes: p.imagenes.filter((c) => claveDelCliente(c, cliente.id)) }))
    .filter((p) => p.imagenes.length);
  // Las plantillas: su imagen tiene que ser de ESTE cliente.
  kit.plantillas = kit.plantillas.filter((p) => claveDelCliente(p.clave, cliente.id));
  // El modelo fijado del cliente: sólo uno que exista en el catálogo y sea de ese tipo.
  // (el de las historias es una imagen)
  kit.modelos = Object.fromEntries(Object.entries(kit.modelos).filter(([tipo, id]) => modeloPorId(id)?.tipo === (tipo === "historias" ? "imagen" : tipo)));
  // La fuente: el archivo tiene que estar en `fuentes/` de ESTE cliente y la muestra ser una imagen suya; si no, fuera.
  if (kit.fuente) {
    const f = kit.fuente;
    const ok = claveDelCliente(f.clave, cliente.id) && claveDelCliente(f.muestra, cliente.id)
      && (await env.MEDIA.head(f.clave)) && (await env.MEDIA.head(f.muestra));
    if (!ok) throw new ErrorEstudio("La fuente o su muestra no son de este cliente (o ya no existen). Súbela otra vez.", 400);
  }
  if (entrada?.logo) {
    const clave = claveDelCliente(entrada.logo, cliente.id);
    if (!clave) throw new ErrorEstudio("El logo tiene que ser una imagen de este cliente.", 400);
    const cabeza = await env.MEDIA.head(clave);
    if (!cabeza) throw new ErrorEstudio("La imagen del logo ya no existe.", 404);
    // Va de referencia a los motores: un SVG o un video no les sirven.
    const tipo = cabeza.httpMetadata?.contentType ?? "";
    if (tipo && !/^image\/(png|jpeg|webp)$/.test(tipo)) throw new ErrorEstudio("El logo tiene que ser una imagen PNG, JPG o WEBP.", 400);
    kit.logo = clave;
  }
  await acceso.actualizar("clients", { id: cliente.id }, { kit_marca: JSON.stringify(kit) });
  return kit;
}

/** Los tipos de fuente que se aceptan, por sus primeros bytes: → [tipo MIME, extensión]. */
export function tipoDeFuente(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const t = String.fromCharCode(...b.slice(0, 4));
  if (t === "wOF2") return ["font/woff2", "woff2"];
  if (t === "wOFF") return ["font/woff", "woff"];
  if (t === "OTTO") return ["font/otf", "otf"];
  if ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || t === "true") return ["font/ttf", "ttf"];
  return null;
}
export const MAX_FUENTE = 3_000_000;

/** Sube la fuente de la marca a `clientes/<c>/fuentes/` (reconocida por sus bytes, ≤ 3 MB). → { clave, nombre }. */
export async function subirFuente(env, cliente, archivo) {
  if (!archivo || typeof archivo.arrayBuffer !== "function") throw new ErrorEstudio("Falta el archivo de la fuente.", 400);
  if (archivo.size > MAX_FUENTE) throw new ErrorEstudio("La fuente pesa más de 3 MB.", 413);
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoDeFuente(bytes);
  if (!tipo) throw new ErrorEstudio("Eso no es una fuente: sube un archivo TTF, OTF, WOFF o WOFF2.", 415);
  const clave = `clientes/${cliente.id}/fuentes/${crypto.randomUUID()}.${tipo[1]}`;
  await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: tipo[0] } });
  const nombre = String(archivo.name ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 60);
  return { clave, nombre };
}

/** La IA propone el kit y un preset por tipo de contenido a partir del cerebro y la ficha. No guarda nada. */
export async function prepararKit(env, acceso, cliente) {
  let guia = "";
  try {
    const hits = await buscarCerebro(env, acceso, cliente.id, CONSULTA_VISUAL, { para: "imagen", n: 6, per: 2 });
    const bloques = hits.filter((h) => !h.interna).map((h) => ({ head: `· ${h.titulo}`, body: h.pasajes.join(" … ") }));
    guia = bloques.length ? pack(bloques, MAX_GUIA) : "";
  } catch (e) {
    console.warn("kit: el cerebro no respondió, se usa sólo la ficha", e?.message);
  }
  const ficha = [
    cliente.industry && `Rubro: ${cliente.industry}`,
    cliente.descripcion && `Descripción: ${String(cliente.descripcion).slice(0, 800)}`,
    cliente.audiencia && `Público: ${String(cliente.audiencia).slice(0, 400)}`,
    cliente.visual_style && `Estilo visual de la ficha: ${String(cliente.visual_style).slice(0, 800)}`,
    [cliente.primary_color, cliente.secondary_color, cliente.accent_color].some(Boolean) &&
      `Colores de la ficha: principal ${cliente.primary_color ?? "—"}, secundario ${cliente.secondary_color ?? "—"}, acento ${cliente.accent_color ?? "—"}`,
    // El estudio de mercado aprobado: a quién le habla y qué la mueve, para el preset de anuncio.
    await estudioAprobado(acceso, cliente.id),
  ].filter(Boolean).join("\n");
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeKit({ marca: cliente.name, rubro: cliente.industry ?? "", guia, ficha }),
    salida: 4000,
    funcion: "kit de marca",
  });
  const leido = leerKit(r.texto);
  if (!leido) throw new ErrorEstudio("La IA no devolvió un kit que se pueda leer. Inténtalo otra vez.", 502);
  return { ...leido, conCerebro: Boolean(guia), modelo: r.modelo, aviso: r.aviso };
}

/**
 * La IA mira una imagen con el kit delante: una de la galería (`archivoId`) o, por su clave de R2, la imagen de una
 * publicación de ESTE cliente (`clave`, o la ruta `/api/media/…`), que no siempre está en la galería.
 */
export async function revisarPieza(env, acceso, cliente, archivoId, { clave = null } = {}) {
  let archivo = archivoId ? await acceso.leerUno("estudio_archivos", { id: String(archivoId), client_id: cliente.id }) : null;
  if (!archivo && clave) {
    const limpia = claveDelCliente(clave, cliente.id);
    if (!limpia) throw new ErrorEstudio("Esa imagen no es de este cliente.", 400);
    const obj = await env.MEDIA.get(limpia);
    if (!obj) throw new ErrorEstudio("La imagen ya no está en el almacenamiento.", 404);
    const mime = obj.httpMetadata?.contentType || "";
    archivo = { clave: limpia, mime, tipo: mime.startsWith("image/") ? "imagen" : "otro", prompt: "" };
  }
  if (!archivo) throw new ErrorEstudio("Esa imagen no está en la galería de este cliente.", 404);
  if (archivo.tipo !== "imagen" || !/^image\/(png|jpeg|webp|gif)$/.test(archivo.mime)) {
    throw new ErrorEstudio("Por ahora sólo se revisan imágenes (no videos ni SVG).", 400);
  }
  const kit = kitDe(cliente);
  if (kitVacio(kit)) {
    throw new ErrorEstudio("Este cliente todavía no tiene kit de marca: prepáralo primero.", 409);
  }
  const obj = await env.MEDIA.get(archivo.clave);
  if (!obj) throw new ErrorEstudio("La imagen ya no está en el almacenamiento.", 404);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES_REVISION) throw new ErrorEstudio("La imagen es demasiado grande para revisarla (más de 3,5 MB).", 413);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [
      { type: "image", source: { type: "base64", media_type: archivo.mime, data: aBase64(bytes) } },
      { type: "text", text: pedidoDeRevision({ marca: cliente.name, kit, prompt: archivo.prompt }) },
    ],
    salida: 1200,
    funcion: "revisión de marca",
  });
  const revision = leerRevision(r.texto);
  if (!revision) throw new ErrorEstudio("La IA no devolvió una revisión que se pueda leer. Inténtalo otra vez.", 502);
  return { ...revision, modelo: r.modelo };
}
