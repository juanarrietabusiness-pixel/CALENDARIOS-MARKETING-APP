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
// las que salieron. Un error de presupuesto para todo. Cada pieza puede
// salir en 2 o 3 variantes para escoger, con la escena mejorada antes.
// ============================================================

import * as api from "./estudio";
import { ajustesDe } from "./estudioCatalogo";
import { pedidoConMarca, ponerLogo, limpiarKit, referenciasDePreset } from "./kitMarca";
import { lineasDeReferencias } from "./referencias";
import { coloresPlantilla } from "./carrusel";
import { componerLamina } from "./textoSobreImagen";
import { esperarArchivos } from "./carruselEstudio";
import { escenaDeAnuncio, textoDeIdea, plantillaDeIdea, FORMATOS_LOTE } from "./loteAnuncios";

/** El pedido de UNA pieza: lo que se manda al motor (y queda en la galería). Pura salvo por los imports. */
export function pedidoDeLote({ idea, kit, preset = "anuncio", modo = "plantilla", formato = "post", modelo, fotos = [], archivos = [], marca = "", rubro = "", n = 1 }) {
  const k = limpiarKit(kit);
  const max = modelo.referencias || 0;
  // En los niveles fríos el producto NO sale (se habla del problema): sus fotos no van.
  const deProducto = idea?.conProducto === false ? [] : fotos.slice(0, max);
  // La referencia visual del tipo, sólo por su ESTILO (la composición la decide el plan), dejando sitio al logo.
  const delTipo = referenciasDePreset(k, preset, archivos, { toma: ["estilo"] }).slice(0, Math.max(0, max - deProducto.length - (k.logo ? 1 : 0)));
  const apoyos = [...deProducto, ...delTipo];
  const claves = apoyos.map((f) => f.clave);
  const conLogo = ponerLogo({ kit: k, tipo: "imagen", modelo, referencias: claves });
  const reference = [...claves, ...(conLogo ? [k.logo] : [])];
  const prompt = pedidoConMarca({
    kit: k, idea: escenaDeAnuncio(idea, { modo, formato }), preset, marca, rubro, logo: conLogo,
    referencias: lineasDeReferencias(apoyos, { cliente: marca }),
  });
  const medios = reference.length ? { reference } : {};
  return { modelo: modelo.id, prompt, n: Math.max(1, Math.min(3, Math.floor(n) || 1)), medios, ajustes: ajustesDe(modelo, { aspectRatio: FORMATOS_LOTE[formato]?.aspectRatio ?? "4:5" }, medios) };
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

/**
 * Crea UNA pieza con sus variantes. Primero, si se pide, MEJORA la escena (lo que la agencia hacía a mano con
 * «Mejorar idea»: la idea en una o dos frases claras; texto, céntimos); luego pide `n` imágenes (1–3) y, en el modo
 * «plantilla», le pone el texto encima a cada una. → { opciones: [{ crudo, final }], escena }.
 */
export async function crearPieza({ clienteId, idea, pedidoDe, mejorar = true, modo, formato, kit, n = 1, carpetaId = null, seguir = () => true }) {
  let escena = idea.escena;
  if (mejorar) {
    try {
      const r = await api.mejorarIdea(clienteId, { idea: [idea.escena, idea.brief ? `Contexto de la publicación: ${idea.brief}` : ""].filter(Boolean).join("\n\n"), tipo: "imagen" });
      if (r?.idea) escena = r.idea;
    } catch { /* sin mejora, con la escena de la idea */ }
  }
  const pedido = pedidoDe({ ...idea, escena }, n);
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(carpetaId ? { carpetaId } : {}) });
  const crudos = await esperarArchivos(clienteId, trabajo, { seguir });
  const opciones = [];
  for (const crudo of crudos) {
    const final = modo === "plantilla"
      ? await ponerTexto({ clienteId, crudo, texto: textoDeIdea(idea), plantilla: plantillaDeIdea(idea, formato), kit, carpetaId, nombre: `pieza-${idea.id}` })
      : crudo;
    opciones.push({ crudo, final });
  }
  return { opciones, escena };
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
        alAvanzar(idea.id, await crearPieza({ ...comun, idea, seguir }));
      } catch (e) {
        alAvanzar(idea.id, { error: e.message });
        if (e.datos?.codigo === "presupuesto") parar = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, paralelo) }, trabajador));
}
