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
import { limpiarKit, estiloDeMarca } from "./kitMarca";
import { coloresPlantilla, PLANTILLAS_TEXTO } from "./carrusel";
import { componerLamina } from "./textoSobreImagen";
import { esperarArchivos, crearCarrusel } from "./carruselEstudio";
import { estampaSola, conLogoSiToca } from "./logoEstudio";
import { crearFotogramas, pedidoDeVideo, crearVideo } from "./reelEstudio";
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
export function pedidoDeLote({ idea, escena = null, kit, preset = "anuncio", estilo = "", modo = "ia", formato = "post", modelo, fotos = [], archivos = [], gustos = [], personajes = [], marca = "", rubro = "", n = 1 }) {
  const apoyos = apoyosDePieza({
    kit, preset, estilo, archivos, fotos, gustos, personajes, modelo, conProducto: idea?.conProducto !== false,
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
    // Con el logo estampado (kit), encima de la final; la cruda se queda sin él.
    opciones.push({ crudo, final: await conLogoSiToca({ clienteId, archivo: final, kit, carpetaId }) });
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

// ------------------------------------------------------------
// Los formatos guiados en lote: el MISMO camino que a mano
// ------------------------------------------------------------

/** Lo que se le cuenta a la IA del carrusel o del reel de una idea del lote: el tema, el brief y el texto. Pura. */
export const temaDeIdea = (idea) => [idea?.titulo || idea?.titular, idea?.brief, textoDeIdea(idea) ? `Texto: ${textoDeIdea(idea).replace(/\n/g, " / ")}` : ""].filter(Boolean).join(". ").slice(0, 400);

/**
 * Un CARRUSEL de una idea del lote, como a mano (components/FlujoCarrusel.jsx): la propuesta del director de arte a
 * partir de su guion, y las láminas una a una con la anterior, la portada y los personajes de referencia.
 * `alPaso(texto)` dice por dónde va. → { archivos: [láminas finales] }.
 */
export async function crearCarruselDeIdea({ clienteId, idea, kit, preset = "", estilo = "", modelo, fotos = [], personajes = [], personajesIds = [], marca = "", rubro = "", carpetaId = null, seguir = () => true, alPaso = () => {} }) {
  alPaso("Propuesta de las láminas…");
  // Cada carrusel en SU carpeta (la galería lo enseña como una tarjeta); si no se puede crear, en la del lote.
  carpetaId = (await api.carpetaDeGrupo(clienteId, "carrusel", idea.titulo || idea.titular || temaDeIdea(idea))) ?? carpetaId;
  const propuesta = await api.proponerCarrusel(clienteId, { guion: idea.guion ?? "", tema: temaDeIdea(idea), preset, estilo, productoId: idea.productoId || undefined, personajes: personajesIds });
  const k = limpiarKit(kit);
  let hechas = 0;
  const salida = await crearCarrusel({
    clienteId, modelo, modo: "ia", plantilla: "banda", hilo: propuesta.hilo, idea: temaDeIdea(idea), laminas: propuesta.laminas,
    preset: estiloDeMarca(k, preset, { marca, rubro, estilo }), fotos, personajes, logo: estampaSola(k) ? "" : k.logo, estampar: estampaSola(k) ? k : null, colores: coloresPlantilla(k), familia: k.tipografia, carpetaId, seguir,
    alAvanzar: () => { hechas += 1; alPaso(`Lámina ${Math.min(hechas + 1, propuesta.laminas.length)} de ${propuesta.laminas.length}…`); },
  });
  const archivos = salida.map((r) => r?.final).filter(Boolean);
  if (!archivos.length) throw new Error(salida.map((r) => r?.error).find(Boolean) || "No salió ninguna lámina.");
  if (carpetaId) await api.ordenarCarpeta(clienteId, carpetaId, archivos.map((a) => a.id)).catch(() => {});
  return { archivos, laminas: propuesta.laminas.length };
}

/**
 * Un REEL de una idea del lote, como a mano (components/FlujoReel.jsx): el guion por planos, un fotograma por plano
 * (el storyboard) y el video con ellos. Sin revisión entre medias: en el lote se revisa al final y se corrige por
 * tramos desde el Estudio. → { archivos: [video], fotogramas }.
 */
export async function crearReelDeIdea({ clienteId, idea, kit, preset = "", estilo = "", modeloImagen, modeloVideo, fotos = [], personajes = [], personajesIds = [], marca = "", rubro = "", carpetaId = null, seguir = () => true, alPaso = () => {} }) {
  alPaso("Guion por planos…");
  carpetaId = (await api.carpetaDeGrupo(clienteId, "reel", idea.titulo || idea.titular || temaDeIdea(idea))) ?? carpetaId;
  const guion = await api.guionDeReel(clienteId, {
    idea: [temaDeIdea(idea), idea.guion ? `Guion propuesto:\n${idea.guion}` : "", idea.escena ? `Qué se ve: ${idea.escena}` : ""].filter(Boolean).join("\n"),
    segundos: 10, preset, estilo, productoId: idea.productoId || undefined, personajes: personajesIds,
  });
  const estiloTexto = estiloDeMarca(limpiarKit(kit), preset, { marca, rubro, estilo });
  let hechos = 0;
  alPaso(`Fotograma 1 de ${guion.planos.length}…`);
  const salida = await crearFotogramas({
    clienteId, modelo: modeloImagen, planos: guion.planos, hilo: guion.hilo, estilo: estiloTexto, personajes, fotos, carpetaId, seguir,
    alAvanzar: () => { hechos += 1; alPaso(`Fotograma ${Math.min(hechos + 1, guion.planos.length)} de ${guion.planos.length}…`); },
  });
  const fotogramas = salida.map((r) => r?.archivo).filter(Boolean);
  if (!fotogramas.length) throw new Error(salida.map((r) => r?.error).find(Boolean) || "No salió ningún fotograma.");
  alPaso("Video (tarda unos minutos)…");
  const lineaPersonajes = [...new Set(personajes.map((p) => `Personaje: ${p.nota}.`))].join(" ");
  const pedido = pedidoDeVideo({ modelo: modeloVideo, planos: guion.planos, hilo: guion.hilo, musica: guion.musica, locucion: guion.locucion, efectos: guion.efectos, segundos: guion.segundos ?? 10, estilo: estiloTexto, personajes: lineaPersonajes, fotogramas });
  const video = await crearVideo({ clienteId, pedido, carpetaId, seguir });
  if (carpetaId) await api.ordenarCarpeta(clienteId, carpetaId, [video?.id, ...fotogramas.map((f) => f.id)].filter(Boolean)).catch(() => {});
  return { archivos: [video], fotogramas, descripcion: guion.descripcion };
}
