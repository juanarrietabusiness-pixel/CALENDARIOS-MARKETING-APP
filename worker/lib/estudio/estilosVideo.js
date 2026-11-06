// ============================================================
// Los ESTILOS DE VIDEO guardados de un cliente: guardarlos de un video, cambiarles el nombre, quitarlos y aplicarlos
// (lo puro, en src/lib/estilosVideo.js; las rutas, en worker/rutas/videos.js; las herramientas, en herramientasVideo.js)
//
// Viven en el kit del cliente (`kit.estilosVideo`) y SÓLO se escriben aquí (`guardarKit(…, { conEstilos: true })`): el
// PUT del kit los conserva, así un kit abierto antes en otra pestaña no se los lleva. No gastan nada: un estilo son
// reglas sacadas del guion, sin IA.
// ============================================================

import { ahora } from "../ids.js";
import { kitDe, guardarKit } from "./kit.js";
import { guardarProyecto, deFila, ErrorVideo } from "../videosProyectos.js";
import { estiloDeGuion, limpiarEstiloVideo, aplicarEstilo, resumenDeEstilo, MAX_ESTILOS_VIDEO, USOS_ESTILO_VIDEO } from "../../../src/lib/estilosVideo.js";
import { conFondosPorCrear } from "../../../src/lib/fondosVideo.js";

/** Un error de lo pedido, con su estado HTTP. */
export class ErrorEstilo extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
const nuevoId = () => `ev-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
const texto = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Los estilos guardados del cliente, con su resumen en frases (lo que enseña la pantalla y lee Claude). */
export const estilosDelCliente = (cliente) => (kitDe(cliente).estilosVideo ?? []).map((e) => ({ ...e, resumen: resumenDeEstilo(e) }));

/** Un estilo del cliente por su id. 404 si no está. */
export function estiloDelCliente(cliente, estiloId) {
  const e = (kitDe(cliente).estilosVideo ?? []).find((x) => x.id === String(estiloId ?? ""));
  if (!e) throw new ErrorEstilo("Ese estilo de video no está guardado en este cliente.", 404);
  return e;
}

/** Escribe la lista de estilos en el kit GUARDADO (sólo esa parte). → la lista como queda. */
async function guardarLista(env, acceso, cliente, lista) {
  const kit = await guardarKit(env, acceso, cliente, { ...kitDe(cliente), estilosVideo: lista }, { conEstilos: true });
  return kit.estilosVideo ?? [];
}

/**
 * «Guardar como estilo»: las reglas del guion GUARDADO de un video (y su sonido) pasan a ser un estilo del cliente.
 * `datos`: { nombre, nota?, para? }. Va primero en la lista; con `MAX_ESTILOS_VIDEO`, 409. → { estilo, estilos }.
 */
export async function guardarEstilo(env, acceso, cliente, fila, datos = {}, usuario = null) {
  const guion = leerJSON(fila?.guion, null);
  if (!guion?.escenas?.length) throw new ErrorEstilo("El video no tiene escenas: no hay estilo que guardar.", 400);
  const nombre = texto(datos.nombre, 60) || texto(fila.titulo, 60) || "Estilo de video";
  const actuales = kitDe(cliente).estilosVideo ?? [];
  if (actuales.length >= MAX_ESTILOS_VIDEO) {
    throw new ErrorEstilo(`Este cliente ya tiene ${MAX_ESTILOS_VIDEO} estilos de video guardados: quita uno que ya no sirva (Marca → Kit y voz).`, 409);
  }
  if (actuales.some((e) => e.nombre.toLowerCase() === nombre.toLowerCase())) {
    throw new ErrorEstilo(`Ya hay un estilo que se llama «${nombre}»: ponle otro nombre.`, 409);
  }
  const estilo = estiloDeGuion(guion, {
    id: nuevoId(), nombre, nota: texto(datos.nota, 600), para: Object.hasOwn(USOS_ESTILO_VIDEO, datos.para) ? datos.para : "",
    videoId: fila.id, version: fila.version, titulo: fila.titulo, sonido: leerJSON(fila.sonido, {}), ahora: ahora(), por: usuario?.id ?? "",
  });
  if (!estilo) throw new ErrorEstilo("No se pudo sacar un estilo de este guion.", 400);
  const estilos = await guardarLista(env, acceso, cliente, [estilo, ...actuales]);
  return { estilo: { ...estilo, resumen: resumenDeEstilo(estilo) }, estilos: estilos.map((e) => ({ ...e, resumen: resumenDeEstilo(e) })) };
}

/** Cambiar el nombre, la nota o para qué videos es un estilo. → { estilo, estilos }. */
export async function cambiarEstilo(env, acceso, cliente, estiloId, datos = {}) {
  const actual = estiloDelCliente(cliente, estiloId);
  const lista = kitDe(cliente).estilosVideo ?? [];
  const nombre = datos.nombre === undefined ? actual.nombre : texto(datos.nombre, 60);
  if (!nombre) throw new ErrorEstilo("El nombre no puede quedar vacío.", 400);
  if (lista.some((e) => e.id !== actual.id && e.nombre.toLowerCase() === nombre.toLowerCase())) {
    throw new ErrorEstilo(`Ya hay un estilo que se llama «${nombre}».`, 409);
  }
  const nuevo = limpiarEstiloVideo({
    ...actual, nombre,
    nota: datos.nota === undefined ? actual.nota : texto(datos.nota, 600),
    para: Object.hasOwn(USOS_ESTILO_VIDEO, datos.para) ? datos.para : actual.para,
  });
  const estilos = await guardarLista(env, acceso, cliente, lista.map((e) => (e.id === actual.id ? nuevo : e)));
  return { estilo: { ...nuevo, resumen: resumenDeEstilo(nuevo) }, estilos: estilos.map((e) => ({ ...e, resumen: resumenDeEstilo(e) })) };
}

/** Quitar un estilo (los videos hechos con él no cambian). → { estilos }. */
export async function quitarEstilo(env, acceso, cliente, estiloId) {
  const actual = estiloDelCliente(cliente, estiloId);
  const estilos = await guardarLista(env, acceso, cliente, (kitDe(cliente).estilosVideo ?? []).filter((e) => e.id !== actual.id));
  return { estilos: estilos.map((e) => ({ ...e, resumen: resumenDeEstilo(e) })) };
}

/**
 * Aplicar un estilo a un video GUARDADO: el código impone la forma (no cambia lo que se dice ni lo que se lee) y se
 * guarda como una versión nueva (vuelve a borrador, como toda edición). `version`: la que se leyó. → { video, cambios }.
 */
export async function aplicarEstiloAVideo(acceso, cliente, fila, { estiloId, version, por = null }) {
  const estilo = estiloDelCliente(cliente, estiloId);
  if (fila.estado === "renderizando") throw new ErrorVideo("Se está renderizando: espera a que termine para cambiar su estilo.", 409);
  const guion = leerJSON(fila.guion, null);
  if (!guion?.escenas?.length) throw new ErrorEstilo("El video no tiene escenas.", 400);
  const r = aplicarEstilo(guion, estilo, { conFondos: conFondosPorCrear(guion) });
  if (!r.cambios) return { video: deFila(fila), cambios: 0 };
  const g = await guardarProyecto(acceso, cliente, fila, { guion: r.guion, version, por });
  return { video: g.video, cambios: r.cambios };
}
