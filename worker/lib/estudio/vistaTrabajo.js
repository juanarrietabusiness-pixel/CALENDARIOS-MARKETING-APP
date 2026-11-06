// ============================================================
// La VISTA PREVIA del chat de Claude para un PEDIDO del Estudio (crear_en_estudio, corregir_pieza, estado_trabajo) y lo
// que comparte con la de un encargo (vistaEstudio.js): las imágenes que la página aún no tiene y el cliente. Un pedido
// de AUDIO (la muestra de una voz, la locución, la música) o un VIDEO terminado se enseña con su reproductor
// (vistaMedios.js): su dirección firmada, no la imagen.
//
// Aparte de vistaEstudio.js a propósito: herramientas.js (que comparte el asistente de la aplicación) importa esto, y
// vistaEstudio.js importa encargos.js, que por fichas.js → mercado.js → herramientasServidor.js vuelve a herramientas.js.
// ============================================================

import { trabajoPublico } from "./trabajos.js";
import { miniaturasDe, MAX_PIEZAS_VISTAS } from "./miniaturas.js";
import { estaVivo } from "../../../src/lib/estudioCatalogo.js";
import { vistaDe, piezaDe } from "../mcpVista/modelo.js";
import { audiosDeTrabajo, medioDeArchivo, esVideo, COLUMNAS_MEDIO } from "./vistaMedios.js";

export const esImagen = (f) => String(f?.mime ?? "").startsWith("image/");
export const listaDeIds = (ya) => new Set((Array.isArray(ya) ? ya : []).map((x) => String(x ?? "")).filter(Boolean).slice(0, 200));

/**
 * Las copias reducidas de las fichas que aún no tiene la página (las de `ya` no), como mucho `MAX_PIEZAS_VISTAS` → {
 * imagenes (en orden), indice (id → posición), sinVista (ids que no se pudieron reducir), quedan (las que no cupieron) }.
 */
export async function imagenesNuevas(env, fichas, ya) {
  const candidatas = fichas.filter((f) => esImagen(f) && !ya.has(f.id));
  const aMandar = candidatas.slice(0, MAX_PIEZAS_VISTAS);
  const vistas = aMandar.length ? await miniaturasDe(env, aMandar) : [];
  const imagenes = [];
  const indice = new Map();
  const sinVista = new Set();
  aMandar.forEach((f, i) => {
    if (vistas[i]) { indice.set(f.id, imagenes.length); imagenes.push(vistas[i]); } else sinVista.add(f.id);
  });
  return { imagenes, indice, sinVista, quedan: candidatas.length - aMandar.length };
}

export const clienteDe = async (acceso, id) => {
  const c = id ? await acceso.leerUno("clients", { id }) : null;
  return c ? { id: c.id, nombre: c.name } : null;
};

/**
 * La vista de un PEDIDO del Estudio (crear_en_estudio, corregir_pieza): lo que salió y un hueco por lo que falta. Un
 * pedido de audio, con su reproductor; un video terminado, también (no como pieza sin imagen).
 */
export async function vistaDeTrabajo(env, acceso, fila, { ya = [], titulo = "" } = {}) {
  const t = trabajoPublico(fila);
  const fichas = t.archivos.length
    ? (await acceso.leerVarios("estudio_archivos", [...new Set([...COLUMNAS_MEDIO, "favorito"])], "id", t.archivos.map(String)))
      .filter((f) => f.client_id === fila.client_id)
    : [];
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const vivo = estaVivo(t.estado);
  const cliente = await clienteDe(acceso, fila.client_id);
  if (t.tipo === "audio") {
    const { nombre, audios } = await audiosDeTrabajo(env, t, fichas, { vivo, titulo });
    const vista = vistaDe({
      tipo: "medios", titulo: nombre, subtitulo: vivo ? "Se está haciendo…" : t.estado === "hecho" ? t.nota ?? "" : t.error ?? "",
      cliente, estado: vivo ? "en_marcha" : t.estado, audios,
      seguir: vivo ? { herramienta: "vista_trabajo", argumentos: { trabajo_id: t.id, titulo }, cada: 4 } : null,
      aviso: !vivo && t.estado !== "hecho" ? t.error || "No salió." : "",
    });
    return { t, imagenes: [], vista };
  }
  // En marcha no se enseña nada a medias (como estado_trabajo): sólo lo que ya terminó.
  const { imagenes, indice, sinVista, quedan } = vivo ? { imagenes: [], indice: new Map(), sinVista: new Set(), quedan: 0 } : await imagenesNuevas(env, fichas, listaDeIds(ya));
  // Un video terminado va con su reproductor (su dirección firmada), no como una pieza «Sin vista previa».
  const videos = [];
  if (!vivo) {
    for (const [i, id] of t.archivos.entries()) {
      const f = porId.get(String(id));
      if (f && esVideo(f)) videos.push(await medioDeArchivo(env, f, { titulo: t.n > 1 ? `${titulo || "Video"} ${i + 1}` : titulo || "Video" }));
    }
  }
  const conReproductor = new Set(videos.map((v) => v.id));
  const piezas = t.archivos.filter((id) => !conReproductor.has(String(id))).map((id, i) => {
    const f = porId.get(String(id));
    return piezaDe({
      id: String(id), titulo: t.n > 1 ? `${titulo || "Imagen"} ${i + 1}` : titulo || (t.tipo === "video" ? "Video" : "Imagen"),
      estado: vivo ? "en_marcha" : "lista", imagen: indice.get(String(id)) ?? null, gusta: Boolean(f?.favorito),
      sinImagen: !vivo && (!f || !esImagen(f) || sinVista.has(String(id))), archivo: Boolean(f),
    });
  });
  if (vivo) for (let i = piezas.length; i < t.n; i++) piezas.push(piezaDe({ id: `hueco-${t.id}-${i}`, titulo: t.n > 1 ? `${titulo || "Imagen"} ${i + 1}` : titulo || "Imagen", estado: "en_marcha", archivo: false }));
  else if (!piezas.length && t.estado !== "hecho") piezas.push(piezaDe({ id: `hueco-${t.id}`, titulo: titulo || "Imagen", estado: "fallida", nota: t.error ?? "", archivo: false }));
  const vista = vistaDe({
    tipo: piezas.length || !videos.length ? "piezas" : "medios",
    titulo: titulo || (t.tipo === "video" ? "Video del Estudio" : "Imagen del Estudio"),
    subtitulo: vivo ? "Creándose…" : t.estado === "hecho" ? "" : t.error ?? "",
    cliente,
    estado: vivo ? "en_marcha" : t.estado,
    piezas,
    videos,
    seguir: vivo || quedan > 0 ? { herramienta: "vista_trabajo", argumentos: { trabajo_id: t.id, titulo }, cada: vivo ? 4 : 1 } : null,
    aviso: t.nota ?? "",
  });
  return { t, imagenes, vista };
}
