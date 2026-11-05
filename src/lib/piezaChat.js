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
import { estimar, CONFIRMAR_DESDE, textoCosto, modeloPorId } from "./estudioCatalogo";
import { apoyosDePieza, pedidoDePieza } from "./pieza";
import { productosNombrados } from "./referencias";
import { esperarArchivos } from "./carruselEstudio";
import { esFicha, textoDeLaFicha } from "./director";
import { nombreDePreset, referenciaDePlantilla, lineaDePlantillaEnPedido } from "./kitMarca";
import { crearUnaEnServidor, pasoListo } from "./piezaServidor";

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
 * Crea la pieza y espera a que salga. → { archivo, modelo, costo } o, si cuesta desde CONFIRMAR_DESDE y no viene
 * `confirmado`, { confirmar: costo, modelo } sin crear nada (la persona tiene que decir que sí).
 */
export async function crearPiezaParaElChat({ cliente, idea, tipo = "imagen", formato = "square", estilo = "", confirmado = false, alProgresar = () => {} }) {
  const clienteId = cliente.dbId || cliente.id;
  const video = tipo === "video";
  const [g, m] = await Promise.all([api.leerEstudio(clienteId), api.leerMotores()]);
  const activos = Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, v.activo]));
  const kit = g?.kit ?? {};
  const modelo = api.modeloPreferido(activos, video ? "video" : "imagen", kit.modelos?.[video ? "video" : "imagen"]);
  if (!modelo) throw new Error(`No hay ningún modelo de ${video ? "video" : "imagen"} con llave.`);
  const deseada = PROPORCION[formato] ?? (video ? "9:16" : "1:1");

  // El costo, con el modelo que de verdad irá (el relevo si el del cliente no hace la proporción), ANTES del director.
  const borrador = armar({ cliente, idea, g, kit, modelo, estilo, deseada, video, activos });
  const usado = modeloPorId(borrador.modelo) ?? modelo;
  const costo = estimar(usado, 1, borrador.ajustes);
  if (costo >= CONFIRMAR_DESDE && !confirmado) return { confirmar: costo, modelo: usado };

  if (video) {
    alProgresar(`Creando el video con ${usado.nombre} (puede tardar unos minutos)…`);
    const { trabajo } = await api.pedirImagenes(clienteId, { ...borrador, confirmado: true });
    const [archivo] = await esperarArchivos(clienteId, trabajo);
    return { archivo, modelo: usado, costo };
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
  return { archivo, modelo: final, costo: estimar(final, 1, pedido.ajustes) };
}

/** Lo que se le dice al modelo cuando la pieza cuesta y falta el «sí». */
export const fraseDeConfirmar = ({ confirmar, modelo }, video) =>
  `NO SE CREÓ NADA. ${video ? "Este video" : "Esta imagen"} cuesta ${textoCosto(confirmar)} (${modelo.nombre}). Díselo al usuario con esa cifra y pregúntale si la hago. Sólo si dice que sí, vuelve a llamar con los MISMOS datos y confirmado=true.`;

/** Que la papelera del Estudio sepa que una publicación usa el archivo. */
export const apuntarUso = api.apuntarUso;
