// ============================================================
// Una pieza del asistente, hecha por el Estudio y entregada en el chat
//
// «Hazme un post del sofá cama para el viernes» tenía dos caminos y los dos
// cojeaban: `generar_imagen` la entregaba en el chat pero sin la marca (un
// pedido a Gemini sin kit, sin logo, sin las fotos del producto), y
// `crear_en_estudio` la hacía con la marca pero la dejaba en la galería
// («ve a mirarla»). Aquí es el camino de UNA pieza del Estudio (pieza.js, el
// mismo del compositor y del lote): el modelo fijado del cliente, las fotos
// del producto que nombre la idea, la tipografía, las referencias del tipo,
// la marca y el logo. El navegador la espera y la enseña en el chat.
//
// Una IMAGEN, además, con las MISMAS reglas que el lote: si lo que pidió el
// asistente no es ya una ficha de diseño, la diseña el DIRECTOR de arte (con la
// plantilla que escoja), y la pieza va por el SERVIDOR (lib/piezaServidor.js):
// la proporción, el control con su corrección y el logo estampado si el kit lo
// pide. El costo se confirma ANTES de pagar al director.
//
// Se carga aparte (import dinámico desde ChatPanel): arrastra el catálogo.
// ============================================================

import * as api from "./estudio";
import { estimar, textoCosto, modeloPorId } from "./estudioCatalogo";
import { apoyosDePieza, pedidoDePieza } from "./pieza";
import { productosNombrados } from "./referencias";
import { esperarArchivos } from "./carruselEstudio";
import { esFicha, textoDeLaFicha } from "./director";
import { nombreDePreset, referenciaDePlantilla, lineaDePlantillaEnPedido } from "./kitMarca";
import { crearUnaEnServidor, pasoListo } from "./piezaServidor";
import { decidir } from "./sinPreguntarApi";
import { textoSugerencia, textoDelMotivo, textoSinPreguntar } from "./sinPreguntar";

/** Del tamaño del chat a la proporción del motor. */
const PROPORCION = Object.freeze({ square: "1:1", vertical: "4:5", story: "9:16", horizontal: "16:9" });

/** El pedido de la pieza con su idea (o su ficha). Pura salvo por los imports. */
function armar({ cliente, idea, g, kit, modelo, estilo, deseada, video, activos, plantilla = "" }) {
  const productos = g?.productos ?? [];
  const nombrados = video ? [] : productosNombrados(productos, idea);
  const fotos = nombrados.length ? api.fotosDeVariosProductos(productos, nombrados.map((p) => p.id), modelo.referencias || 0) : [];
  const deLaPlantilla = plantilla ? referenciaDePlantilla(kit, plantilla, g?.archivos ?? []) : null;
  const apoyos = video ? [] : apoyosDePieza({ kit, preset: estilo, archivos: g?.archivos ?? [], fotos, manuales: deLaPlantilla ? [deLaPlantilla] : [], modelo });
  const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
  return pedidoDePieza({
    kit, idea, preset: estilo, apoyos, modelo, marca: cliente.name, rubro: cliente.industry ?? "",
    aspectRatio: valores.includes(deseada) ? deseada : "", video, ...(video ? {} : { proporcion: deseada, activos }),
    extra: deLaPlantilla ? lineaDePlantillaEnPedido(kit, plantilla) : "",
  });
}

/**
 * Crea la pieza y espera a que salga. → { archivo, modelo, costo, sinPreguntar } o, si hay que preguntar y no viene
 * `confirmado`, { confirmar: costo, modelo, fijo, sugerencia, motivo } sin crear nada (la persona tiene que decir que sí).
 * Se pregunta desde 0,50 $, salvo que el espacio tenga fijado «crear imágenes sin preguntar» (src/lib/sinPreguntar.js):
 * entonces una imagen con el modelo del cliente dentro del tope sale directa (`sinPreguntar`: el tope, para decirlo).
 * `modelo`: OTRO modelo que sugiere el asistente (con `motivoModelo`): con el ajuste puesto, eso siempre se pregunta.
 */
export async function crearPiezaParaElChat({ cliente, idea, tipo = "imagen", formato = "square", estilo = "", modelo: sugeridoId = "", motivoModelo = "", confirmado = false, alProgresar = () => {} }) {
  const clienteId = cliente.dbId || cliente.id;
  const video = tipo === "video";
  const [g, m] = await Promise.all([api.leerEstudio(clienteId), api.leerMotores()]);
  const activos = Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, v.activo]));
  const kit = g?.kit ?? {};
  const fijo = api.modeloPreferido(activos, video ? "video" : "imagen", kit.modelos?.[video ? "video" : "imagen"]);
  // El que sugiere el asistente, si existe, es de este tipo y tiene llave; si no, el del cliente.
  const pedido0 = sugeridoId ? modeloPorId(String(sugeridoId)) : null;
  const sugerido = pedido0 && pedido0.tipo === (video ? "video" : "imagen") && (pedido0.motor === "prueba" || activos[pedido0.motor]) ? pedido0 : null;
  if (sugeridoId && !sugerido) throw new Error(`«${sugeridoId}» no es un modelo de ${video ? "video" : "imagen"} con llave: no pases modelo (va el del cliente) o escoge uno que tenga.`);
  const modelo = sugerido ?? fijo;
  const otroMotor = Boolean(sugerido && fijo && sugerido.id !== fijo.id);
  if (!modelo) throw new Error(`No hay ningún modelo de ${video ? "video" : "imagen"} con llave.`);
  const deseada = PROPORCION[formato] ?? (video ? "9:16" : "1:1");

  // El costo, con el modelo que de verdad irá (el relevo si el del cliente no hace la proporción), ANTES del director.
  const borrador = armar({ cliente, idea, g, kit, modelo, estilo, deseada, video, activos });
  const usado = modeloPorId(borrador.modelo) ?? modelo;
  const costo = estimar(usado, 1, borrador.ajustes);
  const d = confirmado ? { preguntar: false, sinPreguntar: false } : await decidir({ costo, tipo: video ? "video" : "imagen", otroMotor });
  if (d.preguntar) {
    return {
      confirmar: costo, modelo: usado, fijo, motivo: textoDelMotivo(d),
      sugerencia: otroMotor ? textoSugerencia({ sugerido: usado.nombre, fijo: fijo.nombre, motivo: motivoModelo }) : "",
    };
  }
  const sinPreguntar = d.sinPreguntar ? d.tope : 0;

  if (video) {
    alProgresar(`Creando el video con ${usado.nombre} (puede tardar unos minutos)…`);
    const { trabajo } = await api.pedirImagenes(clienteId, { ...borrador, confirmado: true });
    const [archivo] = await esperarArchivos(clienteId, trabajo);
    return { archivo, modelo: usado, costo, sinPreguntar };
  }

  // Lo que no es ya una ficha de diseño, lo diseña el director (como el lote): la escena, el texto exacto, la plantilla.
  let ficha = String(idea ?? "").trim();
  let plantilla = "";
  if (!esFicha(ficha)) {
    alProgresar("El director de arte está diseñando la pieza…");
    const r = await api.mejorarIdea(clienteId, {
      idea: ficha, tipo: "imagen", pieza: estilo ? nombreDePreset(estilo, kit) : "", proporcion: deseada,
      formato: deseada === "9:16" ? "historia" : "post",
    }).catch(() => null);
    if (r?.idea) { ficha = r.idea; plantilla = r.plantilla ?? ""; }
  }
  const pedido = armar({ cliente, idea: ficha, g, kit, modelo, estilo, deseada, video: false, activos, plantilla });
  const final = modeloPorId(pedido.modelo) ?? usado;
  alProgresar(`Creando la imagen con ${final.nombre}…`);
  const archivo = await crearUnaEnServidor({
    clienteId, kit, alProgresar, paso: pasoListo({ titulo: "Pieza del asistente", pedido, texto: textoDeLaFicha(ficha), kit }),
  });
  if (!archivo) throw new Error("La imagen no llegó. Prueba otra vez.");
  return { archivo, modelo: final, costo: estimar(final, 1, pedido.ajustes), sinPreguntar };
}

/** Lo que se le dice al modelo cuando la pieza cuesta y falta el «sí». */
export const fraseDeConfirmar = ({ confirmar, modelo, fijo, sugerencia = "", motivo = "" }, video) =>
  [
    `NO SE CREÓ NADA. ${video ? "Este video" : "Esta imagen"} cuesta ${textoCosto(confirmar)} (${modelo.nombre}).`,
    motivo,
    sugerencia
      ? `${sugerencia} Díselo al usuario con la cifra y el porqué, y pregúntale cuál. Si acepta, vuelve a llamar con los MISMOS datos y confirmado=true; si se queda con el suyo (${fijo?.nombre ?? "el del cliente"}), vuelve a llamar SIN modelo.`
      : "Díselo al usuario con esa cifra y pregúntale si la hago. Sólo si dice que sí, vuelve a llamar con los MISMOS datos y confirmado=true.",
  ].filter(Boolean).join(" ");

/** Lo que se le dice al modelo cuando la pieza salió sin preguntar gracias al ajuste del espacio (vacío si no). */
export const fraseSinPreguntar = (r) => (r?.sinPreguntar ? ` ${textoSinPreguntar(r.sinPreguntar)}` : "");

/** Que la papelera del Estudio sepa que una publicación usa el archivo. */
export const apuntarUso = api.apuntarUso;
