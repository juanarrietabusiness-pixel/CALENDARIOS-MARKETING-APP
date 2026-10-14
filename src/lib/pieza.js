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

import { textoDeLaPieza } from "./estudio.js";
import { ajustesDe, MAX_PROMPT } from "./estudioCatalogo.js";
import { pedidoConMarca, ponerLogo, limpiarKit, referenciasDePreset, estiloDeLaPieza } from "./kitMarca.js";
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
export function apoyosDePieza({ kit, preset = "", estilo = "", archivos = [], fotos = [], manuales = [], personajes = [], gustos = [], modelo, conProducto = true, tomaTipo = ["estilo", "composicion"], reservaLogo = true }) {
  const max = Math.max(0, (modelo?.referencias ?? 0) - (reservaLogo && limpiarKit(kit).logo ? 1 : 0));
  const deEstilo = estiloDeLaPieza(kit, preset, estilo);
  const lista = [
    ...(conProducto === false ? [] : fotos),
    ...personajes,
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
 * logo va el último si cabe. `extra`: líneas que van detrás de la idea (la zona libre de la plantilla). Pura.
 */
export function pedidoDePieza({
  kit, idea, preset = "", estilo = "", apoyos = [], modelo, marca = "la marca", rubro = "", usarKit = true, conLogo = true,
  aspectRatio = "", n = 1, video = false, extra = "", altaResolucion = true, ajustes: entrada = {},
}) {
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
