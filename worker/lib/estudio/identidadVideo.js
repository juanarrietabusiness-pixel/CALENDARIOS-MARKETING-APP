// ============================================================
// La IDENTIDAD DE VIDEO de un cliente: leerla, guardarla (comprobando lo que nombra) y la muestra de los subtítulos
// (lo puro, en src/lib/identidadVideo.js; la herramienta, `identidad_video` en herramientasVideo.js; la ruta, en
// worker/rutas/videos.js)
//
// Vive en el kit (`kit.identidadVideo`) y SÓLO se escribe aquí (`guardarKit(…, { conIdentidad: true })`): el PUT del
// kit la conserva. No gasta nada: guardar son datos y la muestra son cuadros del Container.
// ============================================================

import { kitDe, guardarKit } from "./kit.js";
import { sonidoParaVideo } from "./sonidos.js";
import { pedidoDelVideo, alContenedor, respuestaEnBase64 } from "./cuadros.js";
import { efectoDelCatalogo } from "../../../src/lib/catalogoEfectos.js";
import { limpiarIdentidad, limpiarSubtitulosIdentidad, resumenDeIdentidad, ESTILOS_SUBTITULO, IDS_MOMENTO } from "../../../src/lib/identidadVideo.js";
import { validarGuion, lineaDeTiempo } from "../../../src/lib/videoEscenas.js";
import { gruposDeSubtitulos } from "../../../src/lib/subtitulos.js";

/** Un error de lo pedido, con su estado HTTP. */
export class ErrorIdentidad extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const esObjeto = (o) => o && typeof o === "object" && !Array.isArray(o);

/** La identidad guardada del cliente (o null) con su resumen en frases y los estilos que puede marcar. */
export function identidadDelCliente(cliente) {
  const kit = kitDe(cliente);
  const identidad = limpiarIdentidad(kit.identidadVideo);
  const estilos = kit.estilosVideo ?? [];
  return { identidad, estilos, resumen: resumenDeIdentidad(identidad, { estilos }) };
}

/**
 * Guarda la identidad: lo que llega REEMPLAZA cada parte que trae (`null` la quita; lo que no trae se queda). Comprueba
 * que el estilo esté guardado, que cada música sea de la biblioteca del cliente o de la agencia y que cada efecto exista
 * en el catálogo; lo que no, 400 diciendo cuál. → { identidad, resumen }.
 */
export async function guardarIdentidad(env, acceso, cliente, cambios = {}) {
  if (!esObjeto(cambios)) throw new ErrorIdentidad("Lo que se guarda es { estiloId, musicas, efectos, subtitulos }.");
  const kit = kitDe(cliente);
  const actual = limpiarIdentidad(kit.identidadVideo) ?? {};
  const junta = { ...actual };
  for (const k of ["estiloId", "musicas", "efectos", "subtitulos"]) {
    if (!Object.hasOwn(cambios, k)) continue;
    if (cambios[k] === null || cambios[k] === "") delete junta[k];
    else junta[k] = cambios[k];
  }
  const errores = [];

  if (junta.estiloId && !(kit.estilosVideo ?? []).some((e) => e.id === junta.estiloId)) {
    errores.push(`El estilo «${junta.estiloId}» no está guardado en este cliente (los IDs salen de estilos_video).`);
  }
  if (Object.hasOwn(cambios, "subtitulos") && cambios.subtitulos && !limpiarSubtitulosIdentidad(cambios.subtitulos)) {
    errores.push(`Los subtítulos son { estilo (${Object.keys(ESTILOS_SUBTITULO).join("|")}), pos, maxPalabras, acento, mayusculas }.`);
  }
  if (esObjeto(junta.efectos)) {
    for (const k of Object.keys(junta.efectos)) if (!IDS_MOMENTO.includes(k)) errores.push(`«${k}» no es un momento del video: ${IDS_MOMENTO.join(", ")}.`);
    const malos = IDS_MOMENTO.flatMap((k) => (Array.isArray(junta.efectos[k]) ? junta.efectos[k] : []).map(String).filter((id) => !efectoDelCatalogo(id)));
    if (malos.length) errores.push(`No están en el catálogo de efectos: ${[...new Set(malos)].join(", ")} (los IDs salen de efectos_sonido).`);
  }
  // Cada música, de la biblioteca de ESTE cliente o de la agencia; se guarda con su nombre (para enseñarla sin leerla).
  const musicas = [];
  for (const m of Array.isArray(junta.musicas) ? junta.musicas : []) {
    const id = String(typeof m === "string" ? m : m?.id ?? "");
    const p = await sonidoParaVideo(acceso, cliente.id, id).catch(() => null);
    if (!p) errores.push(`La música «${id}» no está en la biblioteca de sonido del cliente ni en la de la agencia (los IDs salen de musicas).`);
    else musicas.push({ id: p.archivoId, ...(p.de === "agencia" ? { de: "agencia" } : {}), nombre: p.nombre });
  }
  if (errores.length) throw new ErrorIdentidad(errores.join(" "));

  const limpia = limpiarIdentidad({ ...junta, musicas });
  const guardado = await guardarKit(env, acceso, cliente, { ...kit, identidadVideo: limpia ?? undefined }, { conIdentidad: true });
  const identidad = limpiarIdentidad(guardado.identidadVideo);
  return { identidad, resumen: resumenDeIdentidad(identidad, { estilos: guardado.estilosVideo ?? [] }) };
}

/** La frase de la muestra: lo bastante larga para dos grupos, con una palabra clave clara. */
const FRASE_MUESTRA = "Así se leen los subtítulos de tus videos, siempre con el mismo estilo";

/**
 * Un cuadro por estilo de subtítulos (o sólo los pedidos) con la marca del cliente —su paleta y su letra— y lo demás de
 * la identidad (posición, palabras, acento, mayúsculas). → [{ estilo, nombre, mime, datos }]. Necesita el Container.
 */
export async function muestraDeSubtitulos(env, acceso, cliente, { estilos = null, formato = "9:16" } = {}) {
  const base = limpiarIdentidad(kitDe(cliente).identidadVideo)?.subtitulos ?? {};
  const cuales = (Array.isArray(estilos) && estilos.length ? estilos : Object.keys(ESTILOS_SUBTITULO)).filter((e) => Object.hasOwn(ESTILOS_SUBTITULO, e));
  const salida = [];
  for (const estilo of cuales) {
    const v = validarGuion({
      version: 1, titulo: "Muestra de subtítulos", formatos: [formato],
      subtitulos: { activo: true, ...base, estilo },
      escenas: [{ id: "m1", tipo: "gancho", habla: FRASE_MUESTRA, fondo: { tipo: "degradado", color: "fondo", color2: "superficie" }, capas: [] }],
    });
    if (!v.ok) continue;
    const fila = { guion: JSON.stringify(v.guion), locucion: "{}", titulo: "Muestra" };
    const { pedido } = await pedidoDelVideo(env, acceso, cliente, fila, { formato });
    // El instante: la mitad del primer grupo, con la palabra que se dice a medio salto (lo que más se ve del estilo).
    const linea = lineaDeTiempo(v.guion, null);
    const g = gruposDeSubtitulos(linea, { maxPalabras: v.guion.subtitulos.maxPalabras, maxCaracteres: v.guion.subtitulos.maxCaracteres })[0];
    const t = g ? g.desde + (g.hasta - g.desde) * 0.55 : 0.8;
    const r = await alContenedor(env, "/cuadro", { ...pedido, t, ancho: 432 });
    salida.push({ estilo, nombre: ESTILOS_SUBTITULO[estilo].nombre, mime: r.headers.get("Content-Type") ?? "image/jpeg", datos: await respuestaEnBase64(r) });
  }
  return salida;
}
