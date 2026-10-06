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
import { ErrorEstudio } from "./trabajos.js";
import { aBase64 } from "./gemini.js";
import { limpiarKit, pedidoDeKit, leerKit, pedidoDeRevision, leerRevision } from "../../../src/lib/kitMarca.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const CONSULTA_VISUAL = "estilo visual identidad paleta colores hex fotografía iluminación composición tipografía logo evitar negativos";
const MAX_GUIA = 4_000;
/** Lo que Anthropic admite por imagen (5 MB en base64): con margen. */
const MAX_BYTES_REVISION = 3_600_000;

/** El kit guardado de un cliente (fila de `clients`). */
export const kitDe = (cliente) => limpiarKit(leerJSON(cliente?.kit_marca, {}));

/** Guarda el kit. El logo, si viene, tiene que ser una imagen de este cliente que exista. */
export async function guardarKit(env, acceso, cliente, entrada) {
  const kit = limpiarKit(entrada);
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

/** La IA propone el kit y los cuatro presets a partir del cerebro y la ficha. No guarda nada. */
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
  ].filter(Boolean).join("\n");
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeKit({ marca: cliente.name, rubro: cliente.industry ?? "", guia, ficha }),
    salida: 3000,
    funcion: "kit de marca",
  });
  const leido = leerKit(r.texto);
  if (!leido) throw new ErrorEstudio("La IA no devolvió un kit que se pueda leer. Inténtalo otra vez.", 502);
  return { ...leido, conCerebro: Boolean(guia), modelo: r.modelo, aviso: r.aviso };
}

/** La IA mira una imagen de la galería con el kit delante. */
export async function revisarPieza(env, acceso, cliente, archivoId) {
  const archivo = await acceso.leerUno("estudio_archivos", { id: String(archivoId ?? ""), client_id: cliente.id });
  if (!archivo) throw new ErrorEstudio("Esa imagen no está en la galería de este cliente.", 404);
  if (archivo.tipo !== "imagen" || !/^image\/(png|jpeg|webp|gif)$/.test(archivo.mime)) {
    throw new ErrorEstudio("Por ahora sólo se revisan imágenes (no videos ni SVG).", 400);
  }
  const kit = kitDe(cliente);
  if (!kit.paleta.length && !kit.estilo && !Object.keys(kit.presets).length) {
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
