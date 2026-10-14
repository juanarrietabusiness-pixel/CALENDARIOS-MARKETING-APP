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
import { ajustesDe, MAX_PROMPT } from "./estudioCatalogo";
import { limpiarKit } from "./kitMarca";
import { coloresPlantilla, PLANTILLAS_TEXTO } from "./carrusel";
import { componerLamina } from "./textoSobreImagen";
import { esperarArchivos } from "./carruselEstudio";
import { textoDeIdea, plantillaDeIdea, composicionDe, FORMATOS_LOTE } from "./loteAnuncios";
import { ideaParaMejorar, ideaSinMejorar, apoyosDePieza, pedidoDePieza, lineaSinTexto } from "./pieza";

/** Lo que entra a la mejora de una idea del lote: escena, composición sugerida, texto (si lo escribe el motor) y brief. Pura. */
export function ideaDeLote(idea, { modo = "ia" } = {}) {
  return {
    escena: idea?.escena ?? "", composicion: composicionDe(idea?.composicion)?.linea ?? "", texto: modo === "ia" ? textoDeIdea(idea) : "",
    contexto: idea?.brief ?? "", conProducto: idea?.conProducto !== false,
  };
}

/**
 * Lo que va DETRÁS de la escena ya mejorada: la composición por su nombre (corto; así se reconoce para aprender cuáles
 * funcionan, `aprenderComposiciones`) y, en el modo plantilla, la zona que se deja libre. Pura.
 */
export function colaDeLote(idea, { modo = "ia", formato = "post" } = {}) {
  const comp = composicionDe(idea?.composicion);
  const zona = PLANTILLAS_TEXTO[plantillaDeIdea(idea, formato)]?.zona ?? PLANTILLAS_TEXTO.banda.zona;
  return [comp ? `Composición: ${comp.nombre}.` : "", modo === "plantilla" ? lineaSinTexto(zona) : ""].filter(Boolean).join(" ");
}

/**
 * El pedido de UNA pieza del lote: por el MISMO camino que una pieza hecha a mano (`pedidoDePieza`), con la escena
 * (mejorada o no) que se le dé. Pura salvo por los imports.
 */
export function pedidoDeLote({ idea, escena = null, kit, preset = "anuncio", estilo = "", modo = "ia", formato = "post", modelo, fotos = [], archivos = [], gustos = [], marca = "", rubro = "", n = 1 }) {
  const apoyos = apoyosDePieza({
    kit, preset, estilo, archivos, fotos, gustos, modelo, conProducto: idea?.conProducto !== false,
    // En el lote la referencia del tipo va sólo por su ESTILO: la composición la decide el plan.
    tomaTipo: ["estilo"],
  });
  return pedidoDePieza({
    kit, idea: escena ?? ideaSinMejorar(ideaDeLote(idea, { modo })), extra: colaDeLote(idea, { modo, formato }),
    preset, estilo, apoyos, modelo, marca, rubro, n, aspectRatio: FORMATOS_LOTE[formato]?.aspectRatio ?? "4:5",
  });
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
 * Crea UNA pieza con sus variantes, como se haría a mano: primero, si se pide, MEJORA la idea (escena + composición
 * sugerida + texto exacto, con el brief de contexto: lo que hace «Mejorar idea»; texto, céntimos); luego pide `n`
 * imágenes (1–3) y, en el modo «plantilla», le pone el texto encima a cada una. → { opciones: [{ crudo, final }], escena }.
 */
export async function crearPieza({ clienteId, idea, pedidoDe, mejorar = true, modo, formato, kit, n = 1, carpetaId = null, piezaDe = () => "", seguir = () => true }) {
  const datos = ideaDeLote(idea, { modo });
  let escena = ideaSinMejorar(datos);
  if (mejorar) {
    try {
      const r = await api.mejorarIdea(clienteId, { idea: ideaParaMejorar(datos), tipo: "imagen", pieza: piezaDe(idea) });
      if (r?.idea) escena = r.idea;
    } catch { /* sin mejora, con la idea tal cual */ }
  }
  const pedido = pedidoDe(idea, n, escena);
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

/**
 * «Pulir» una pieza antes de llevarla al calendario: ampliar y limpiar (o sólo nitidez) con un modelo de pulir. Sale
 * una imagen NUEVA en la misma carpeta; la original se queda. → el archivo pulido.
 */
export async function pulirArchivo({ clienteId, archivo, modelo, carpetaId = null, seguir = () => true }) {
  const medios = { reference: [archivo.clave] };
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, prompt: String(archivo.prompt || "Imagen pulida").slice(0, MAX_PROMPT), n: 1,
    ajustes: ajustesDe(modelo, {}, medios), medios, confirmado: true, ...(carpetaId ? { carpetaId } : {}),
  });
  const [pulido] = await esperarArchivos(clienteId, trabajo, { seguir });
  return pulido;
}
