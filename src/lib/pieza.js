// ============================================================
// UNA pieza, por el mismo camino venga de donde venga (puro)
//
// El compositor del Estudio, la producción en lote, el mes completo y
// «Producir el mes» arman cada pieza con estas funciones. Antes cada uno
// tenía su versión: el lote pegaba detrás de la escena mejorada frases fijas
// (la composición, «Fondo de color pleno…») iguales para todo el lote, la
// mejora no veía el texto, y las piezas salían planas comparadas con las
// hechas una a una. Ahora:
//
//   1. La IDEA: la escena, la composición SUGERIDA y el texto exacto juntos,
//      con el brief como contexto (`ideaParaMejorar`). Así entra a «Mejorar
//      idea», que la devuelve en una o dos frases con el texto integrado.
//   2. El PEDIDO (`pedidoDePieza`): la idea, el tipo de pieza, el estilo
//      visual con su acabado, las referencias con lo que se toma de cada una,
//      la identidad de la marca y el logo (kitMarca.js), en alta resolución.
//
// Un test exige que la misma idea dé el mismo pedido por todas las puertas.
// ============================================================

import { textoDeLaPieza, fotosDeVariosProductos } from "./estudio.js";
import { productosNombrados } from "./referencias.js";
import { deMisGustos } from "./aprendizajeVisual.js";
import { ajustesDe, MAX_PROMPT, modeloQueRespeta } from "./estudioCatalogo.js";
import { pedidoConMarca, ponerLogo, limpiarKit, referenciasDePreset, estiloDeLaPieza, referenciaDeTipografia, referenciasDePersonajes } from "./kitMarca.js";
import { lineasDeReferencias } from "./referencias.js";

const limpio = (t) => String(t ?? "").trim();

/** La línea del texto que el motor escribe EXACTO en la imagen, o vacío. Pura. */
export const lineaDeTexto = (texto) => {
  const t = textoDeLaPieza(texto);
  return t ? `Texto en la imagen, exacto, legible y bien jerarquizado (lo primero grande): ${t}.` : "";
};

/** La orden de NO escribir (el texto lo pone la plantilla encima) y qué zona dejar libre. Pura. */
export const lineaSinTexto = (zona = "la franja inferior") => `NO escribas ningún texto, letra ni número en la imagen: el texto se pone después. Deja ${zona} limpio y despejado, con buen contraste.`;

/**
 * Lo que entra a «Mejorar idea»: la escena, la composición sugerida, el texto exacto (si lo escribe el motor) y el
 * contexto de la publicación (para entender, no para copiar). Pura.
 */
export function ideaParaMejorar({ escena, composicion = "", texto = "", contexto = "", conProducto = true }) {
  return [
    limpio(escena),
    composicion ? `Composición sugerida: ${limpio(composicion).replace(/^Composición[^:]*:\s*/i, "")}` : "",
    conProducto === false ? "El producto NO aparece en esta imagen: se habla del problema." : "",
    lineaDeTexto(texto),
    contexto ? `Contexto de la publicación: ${limpio(contexto).slice(0, 300)}` : "",
  ].filter(Boolean).join("\n\n");
}

/** La misma idea SIN mejorar (si se apaga la mejora): sin el contexto, que es para la IA de texto. Pura. */
export const ideaSinMejorar = (datos) => ideaParaMejorar({ ...datos, contexto: "" });

/**
 * Lo que va de referencia en una pieza, en orden de importancia y sin pasarse de lo que admite el modelo (dejando
 * sitio al logo): las fotos REALES del producto (si sale), los personajes de la marca, lo puesto a mano, las referencias del tipo de pieza y del
 * estilo propio, y las últimas que gustaron (sólo por su estilo). Pura.
 */
export function apoyosDePieza({ kit, preset = "", estilo = "", archivos = [], fotos = [], manuales = [], personajes = [], gustos = [], modelo, conProducto = true, tomaTipo = ["estilo", "composicion"], reservaLogo = true, conTexto = true }) {
  const max = Math.max(0, (modelo?.referencias ?? 0) - (reservaLogo && limpiarKit(kit).logo ? 1 : 0));
  const deEstilo = estiloDeLaPieza(kit, preset, estilo);
  // La tipografía de la marca, sólo si el motor escribe el texto (con la plantilla, el texto lo pone la aplicación).
  const tipografia = conTexto ? referenciaDeTipografia(kit) : null;
  const lista = [
    ...(conProducto === false ? [] : fotos),
    ...personajes,
    ...(tipografia ? [tipografia] : []),
    ...manuales,
    ...referenciasDePreset(kit, preset, archivos, { toma: tomaTipo }),
    ...(deEstilo.startsWith("estilo-") ? referenciasDePreset(kit, deEstilo, archivos, { toma: ["estilo"] }) : []),
    ...gustos,
  ];
  const vistas = new Set();
  return lista.filter((a) => a?.clave && !vistas.has(a.clave) && vistas.add(a.clave)).slice(0, max);
}

/** La resolución de una pieza «de verdad»: al menos 2K si el modelo lo tiene (los 1K se notan en el feed). Pura. */
export function conAltaResolucion(modelo, ajustes = {}) {
  const valores = modelo?.ajustes?.imageSize?.valores ?? [];
  if (!valores.includes("2K")) return ajustes;
  return ["2K", "4K"].includes(ajustes.imageSize) ? ajustes : { ...ajustes, imageSize: "2K" };
}

/**
 * El pedido de UNA pieza, listo para `pedirImagenes`: { modelo, prompt, n, medios, ajustes }. `idea` es la escena
 * final (ya mejorada); `apoyos`, las referencias en orden (`apoyosDePieza`), cada una con lo que se toma de ella. El
 * logo va el último si cabe. `extra`: líneas que van detrás de la idea (la zona libre de la plantilla).
 * Con `activos` y `proporcion` (la que TIENE que salir), si el modelo no la respeta con estas referencias (Muse Image
 * con el logo daba 2:3 en vez de 4:5) el pedido va con el primero que sí (`modeloQueRespeta`): mira `pedido.modelo`.
 * Pura.
 */
export function pedidoDePieza(datos) {
  const { activos = null, proporcion = "", modelo, video = false } = datos;
  const primero = armarPedido(datos);
  if (!activos || !proporcion || video) return primero;
  const otro = modeloQueRespeta(modelo, activos, proporcion, primero.medios.reference?.length ?? 0);
  return otro === modelo ? primero : armarPedido({ ...datos, modelo: otro });
}

function armarPedido({
  kit, idea, preset = "", estilo = "", apoyos = [], modelo, marca = "la marca", rubro = "", usarKit = true, conLogo = true,
  aspectRatio = "", proporcion = "", n = 1, video = false, extra = "", altaResolucion = true, ajustes: entrada = {},
}) {
  // La proporción que tiene que salir manda sobre la que se pidiera, si este modelo la tiene.
  if (proporcion && (modelo?.ajustes?.aspectRatio?.valores ?? []).includes(proporcion)) aspectRatio = proporcion;
  const max = modelo?.referencias ?? 0;
  const usados = apoyos.slice(0, max);
  const claves = usados.map((a) => a.clave);
  const logo = Boolean(usarKit && conLogo && !video && ponerLogo({ kit, tipo: video ? "video" : "imagen", modelo, referencias: claves }));
  const reference = [...claves, ...(logo ? [limpiarKit(kit).logo] : [])];
  const medios = reference.length ? { reference } : {};
  const escena = [limpio(idea), limpio(extra)].filter(Boolean).join(" ");
  const prompt = pedidoConMarca({
    kit, idea: escena, preset, estilo, marca, rubro, usarKit, logo, video,
    referencias: lineasDeReferencias(usados, { cliente: marca }),
  }).slice(0, MAX_PROMPT);
  const base = { ...entrada, ...(aspectRatio ? { aspectRatio } : {}) };
  const ajustes = ajustesDe(modelo, altaResolucion ? conAltaResolucion(modelo, base) : base, medios);
  return { modelo: modelo.id, prompt, n: Math.max(1, Math.min(8, Math.floor(n) || 1)), medios, ajustes };
}

/**
 * Lo que el COMPOSITOR suma de referencia a lo puesto a mano (`puestas`, claves), en orden y cada cosa en el hueco que
 * deja la anterior (guardando uno para el logo si va): las fotos de los productos que nombra la idea (una de cada uno
 * antes que la segunda de ninguno), los personajes escogidos, la muestra de la tipografía de la marca, las referencias
 * del tipo de pieza y del estilo propio, y los «Me gusta». → { fotosNombradas, nombrado, deLosPersonajes, deLaLetra,
 * refsTipo, gustos }. Pura.
 */
export function apoyosDelCompositor({ kit, form, modelo, conKit = true, reservaLogo = false, preset = "", estilo = "", personajes = [], archivos = [], productos = [], conGustos = false, perdidos = new Set(), puestas = [] }) {
  const vacio = { fotosNombradas: [], nombrado: null, deLosPersonajes: [], deLaLetra: [], refsTipo: [], gustos: [] };
  if (!form || !modelo) return vacio;
  const max = modelo.referencias || 0;
  const hueco = (...usadas) => max - puestas.length - usadas.reduce((t, l) => t + l.length, 0) - (reservaLogo ? 1 : 0);
  const imagen = form.tipo === "imagen";
  const libres = max - puestas.length;
  const nombrados = imagen && libres > 0 ? productosNombrados(productos, form.prompt, puestas) : [];
  const fotosNombradas = nombrados.length ? fotosDeVariosProductos(productos, nombrados.map((p) => p.id), libres) : [];
  const nombrado = nombrados.length
    ? { nombres: nombrados.filter((p) => fotosNombradas.some((f) => f.prompt === p.nombre)).map((p) => p.nombre), fotos: fotosNombradas.length, sinHueco: nombrados.length - new Set(fotosNombradas.map((f) => f.prompt)).size }
    : null;
  const deLosPersonajes = max > 0
    ? referenciasDePersonajes(kit, personajes, archivos).filter((a) => !puestas.includes(a.clave)).slice(0, Math.max(0, hueco(fotosNombradas)))
    : [];
  const letra = conKit && imagen ? referenciaDeTipografia(kit) : null;
  const deLaLetra = letra && !puestas.includes(letra.clave) && hueco(fotosNombradas, deLosPersonajes) > 0 ? [letra] : [];
  const huecoTipo = imagen ? hueco(fotosNombradas, deLosPersonajes, deLaLetra) : 0;
  const refsTipo = huecoTipo > 0
    ? [...referenciasDePreset(kit, preset, archivos), ...(estilo.startsWith("estilo-") ? referenciasDePreset(kit, estilo, archivos) : [])]
      .filter((a, i, l) => !puestas.includes(a.clave) && l.findIndex((b) => b.clave === a.clave) === i).slice(0, huecoTipo)
    : [];
  const huecoGustos = huecoTipo - refsTipo.length;
  const gustos = conGustos && huecoGustos > 0 ? deMisGustos(archivos, { yaPuestas: puestas, perdidos, cuantas: Math.min(2, huecoGustos) }) : [];
  return { fotosNombradas, nombrado, deLosPersonajes, deLaLetra, refsTipo, gustos };
}
