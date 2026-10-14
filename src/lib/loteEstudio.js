// ============================================================
// Crear las piezas de un lote de anuncios en el Estudio
//
// Cada pieza es un trabajo del Estudio (se cobra y queda en la galería, en
// la carpeta del lote), con el kit de la marca, las fotos REALES del
// producto y el logo si caben. Con el texto en «plantilla», la IA deja el
// hueco y aquí se escribe encima el texto exacto con los colores del kit
// (como en el carrusel); la pieza cruda también queda en la galería.
//
// Lo orquesta el navegador, de dos en dos: cerrar a la mitad deja hechas
// las que salieron. Un error de presupuesto para todo.
// ============================================================

import * as api from "./estudio";
import { ajustesDe } from "./estudioCatalogo";
import { pedidoConMarca, ponerLogo, limpiarKit } from "./kitMarca";
import { lineasDeReferencias } from "./referencias";
import { coloresPlantilla } from "./carrusel";
import { componerLamina } from "./textoSobreImagen";
import { esperarArchivo } from "./carruselEstudio";
import { escenaDeAnuncio, textoDeIdea, plantillaDeIdea, FORMATOS_LOTE } from "./loteAnuncios";

/** El pedido de UNA pieza: lo que se manda al motor (y queda en la galería). Pura salvo por los imports. */
export function pedidoDeLote({ idea, kit, preset = "anuncio", modo = "plantilla", formato = "post", modelo, fotos = [], marca = "", rubro = "" }) {
  const k = limpiarKit(kit);
  const deProducto = fotos.slice(0, modelo.referencias || 0);
  const claves = deProducto.map((f) => f.clave);
  const conLogo = ponerLogo({ kit: k, tipo: "imagen", modelo, referencias: claves });
  const reference = [...claves, ...(conLogo ? [k.logo] : [])];
  const prompt = pedidoConMarca({
    kit: k, idea: escenaDeAnuncio(idea, { modo, formato }), preset, marca, rubro, logo: conLogo,
    referencias: lineasDeReferencias(deProducto, { cliente: marca }),
  });
  const medios = reference.length ? { reference } : {};
  return { modelo: modelo.id, prompt, n: 1, medios, ajustes: ajustesDe(modelo, { aspectRatio: FORMATOS_LOTE[formato]?.aspectRatio ?? "4:5" }, medios) };
}

/**
 * El texto de la plantilla encima de una pieza cruda, y la pieza compuesta a la galería. La compuesta RECUERDA de qué
 * pieza salió y qué texto lleva (`origenId`, `plantilla`): así «Otra versión» funciona también sobre ella y la nueva
 * sale con su texto puesto. → el archivo compuesto.
 */
export async function ponerTexto({ clienteId, crudo, texto, plantilla = "banda", kit, carpetaId = null, nombre = "anuncio" }) {
  const k = limpiarKit(kit);
  const blob = await componerLamina({ src: crudo.src, texto, plantilla, colores: coloresPlantilla(k), familia: k.tipografia });
  const { archivo } = await api.subirImagen(clienteId, new File([blob], `${nombre}.jpg`, { type: "image/jpeg" }), {
    carpetaId, origenId: crudo.id, plantilla: { texto, plantilla },
  });
  return archivo;
}

/** Crea UNA pieza y espera a que salga. → { crudo, final } (en el modo «ia», el mismo archivo). */
export async function crearAnuncio({ clienteId, pedido, idea, modo, formato, kit, carpetaId = null, seguir = () => true }) {
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(carpetaId ? { carpetaId } : {}) });
  const crudo = await esperarArchivo(clienteId, trabajo, { seguir });
  if (modo !== "plantilla") return { crudo, final: crudo };
  const final = await ponerTexto({
    clienteId, crudo, texto: textoDeIdea(idea), plantilla: plantillaDeIdea(idea, formato), kit, carpetaId, nombre: `anuncio-${idea.id}`,
  });
  return { crudo, final };
}

/**
 * Todo el lote, de `paralelo` en `paralelo`. `alAvanzar(id, resultado)` con { cargando } | { crudo, final } | { error }.
 * Un error de presupuesto para lo que queda (las siguientes fallarían igual).
 */
export async function crearLote({ ideas, alAvanzar = () => {}, seguir = () => true, paralelo = 2, ...comun }) {
  const cola = [...ideas];
  let parar = false;
  const trabajador = async () => {
    while (cola.length && !parar && seguir()) {
      const idea = cola.shift();
      alAvanzar(idea.id, { cargando: true });
      try {
        alAvanzar(idea.id, await crearAnuncio({ ...comun, idea, pedido: comun.pedidoDe(idea), seguir }));
      } catch (e) {
        alAvanzar(idea.id, { error: e.message });
        if (e.datos?.codigo === "presupuesto") parar = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, paralelo) }, trabajador));
}
