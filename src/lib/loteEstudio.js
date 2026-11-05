// ============================================================
// Crear las piezas de un lote de anuncios en el Estudio
//
// Cada pieza es un trabajo del Estudio (se cobra y queda en la galería, en
// la carpeta del lote), con el kit de la marca, las fotos REALES del
// producto y el logo si caben. Con el texto en «plantilla», la IA deja el
// hueco y aquí se escribe encima el texto exacto con los colores del kit
// (como en el carrusel); la pieza cruda también queda en la galería.
//
// Las de UNA imagen las lleva el servidor (un encargo, lib/loteServidor.js):
// aquí queda cómo se arma cada pieza (`pedidoDeLote`, lo que lee el
// director) y el texto de la plantilla encima (`ponerTexto`, con lienzo).
// Los carruseles y los reels del lote siguen orquestados aquí, en orden.
// ============================================================

import * as api from "./estudio";
import { limpiarKit, estiloDeMarca, referenciaDePlantilla, lineaDePlantillaEnPedido } from "./kitMarca";
import { coloresPlantilla, PLANTILLAS_TEXTO } from "./carrusel";
import { componerLamina } from "./textoSobreImagen";
import { segundosParaModelo } from "./videoCorto";
import { lanzarReel, seguirEncargo, leerEncargo } from "./encargosApi";
import { resultadoDeReel } from "./encargoReelPuro";
import { textoDeIdea, plantillaDeIdea, composicionDe, FORMATOS_LOTE } from "./loteAnuncios";
import { ideaSinMejorar, apoyosDePieza, pedidoDePieza, lineaSinTexto } from "./pieza";

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
export function pedidoDeLote({ idea, escena = null, kit, preset = "anuncio", estilo = "", modo = "ia", formato = "post", modelo, fotos = [], archivos = [], gustos = [], personajes = [], marca = "", rubro = "", n = 1, activos = null }) {
  // La plantilla de la pieza (la escogida para la tanda o la que eligió el director de arte): su imagen, por su diseño.
  const plantilla = idea?.plantilla ? referenciaDePlantilla(kit, idea.plantilla, archivos) : null;
  const apoyos = apoyosDePieza({
    kit, preset, estilo, archivos, fotos, gustos, personajes, modelo, conProducto: idea?.conProducto !== false, manuales: plantilla ? [plantilla] : [],
    // En el lote la referencia del tipo va sólo por su ESTILO: la composición la decide el plan.
    tomaTipo: ["estilo"], conTexto: modo === "ia",
  });
  return pedidoDePieza({
    kit, idea: escena ?? ideaSinMejorar(ideaDeLote(idea, { modo })),
    extra: [colaDeLote(idea, { modo, formato }), plantilla ? lineaDePlantillaEnPedido(kit, idea.plantilla) : ""].filter(Boolean).join(" "),
    preset, estilo, apoyos, modelo, marca, rubro, n, aspectRatio: FORMATOS_LOTE[formato]?.aspectRatio ?? "4:5",
    ...(activos ? { proporcion: FORMATOS_LOTE[formato]?.aspectRatio ?? "4:5", activos } : {}),
  });
}

/**
 * El texto de la plantilla encima de una pieza cruda, y la pieza compuesta a la galería. La compuesta RECUERDA de qué
 * pieza salió y qué texto lleva (`origenId`, `plantilla`): así «Otra versión» funciona también sobre ella y la nueva
 * sale con su texto puesto. → el archivo compuesto.
 */
export async function ponerTexto({ clienteId, crudo, texto, plantilla = "banda", kit, carpetaId = null, nombre = "anuncio" }) {
  const k = limpiarKit(kit);
  const blob = await componerLamina({ src: crudo.src, texto, plantilla, colores: coloresPlantilla(k), familia: k.tipografia, fuente: k.fuente });
  const { archivo } = await api.subirImagen(clienteId, new File([blob], `${nombre}.jpg`, { type: "image/jpeg" }), {
    carpetaId, origenId: crudo.id, plantilla: { texto, plantilla },
  });
  return archivo;
}

/** Lo que el director de arte necesita de una idea del lote (src/lib/director.js, `limpiarPiezaEncargo`). Pura. */
export function encargoDeIdea(idea, { modo = "ia", formato = "post", piezaDe = () => "", indicacion = "" } = {}) {
  return {
    formato: formato === "anuncio" ? "anuncio" : FORMATOS_LOTE[formato] ? formato : "post",
    proporcion: FORMATOS_LOTE[formato]?.aspectRatio ?? "",
    tipo: piezaDe(idea), idea: [idea?.titulo, idea?.brief].filter(Boolean).join(" — "), escena: idea?.escena ?? "",
    texto: modo === "ia" ? textoDeIdea(idea) : "", sinTexto: modo === "plantilla", productoId: idea?.productoId ?? "",
    composicion: composicionDe(idea?.composicion)?.linea ?? "", fecha: idea?.fecha ?? "",
    indicacion: [indicacion, idea?.pide].map((t) => String(t ?? "").trim()).filter(Boolean).join(". "),
    ...(idea?.plantilla ? { plantilla: idea.plantilla } : {}),
  };
}

/** Cuántas piezas se le mandan al director por petición (dentro, cada una es su propia llamada: fichas.js). */
const TANDA_FICHAS = 6;

/**
 * Las ideas con su ficha del director de arte (`ficha`), de 6 en 6 por petición. TODAS pasan por el director: el
 * borrador del motor de ideas (`imagen`) ya no se lo salta. Si una tanda falla, sus ideas siguen sin ficha (se
 * diseñan una a una al crear).
 */
export async function conFichas({ ideas, clienteId, modo = "ia", formato = "post", piezaDe = () => "", indicacion = "", seguir = () => true }) {
  const salida = ideas.map((i) => ({ ...i }));
  const faltan = salida.filter((i) => !i.ficha);
  let concepto = "";
  for (let k = 0; k < faltan.length && seguir(); k += TANDA_FICHAS) {
    const tanda = faltan.slice(k, k + TANDA_FICHAS);
    try {
      const r = await api.fichasDeDiseno(clienteId, { concepto, serie: faltan.length, piezas: tanda.map((i, j) => ({ n: j + 1, ...encargoDeIdea(i, { modo, formato, piezaDe, indicacion }) })) });
      concepto ||= r?.concepto ?? "";
      tanda.forEach((i, j) => {
        const f = r?.fichas?.[j + 1];
        if (f?.ficha) i.ficha = f.ficha;
        // Si el director escogió una plantilla del kit, su imagen va de referencia (pedidoDeLote).
        if (f?.plantilla && !i.plantilla) i.plantilla = f.plantilla;
      });
    } catch { /* esta tanda, pieza a pieza al crear */ }
  }
  return salida;
}

// ------------------------------------------------------------
// Los formatos guiados en lote: el MISMO camino que a mano
// ------------------------------------------------------------

/** Lo que se le cuenta a la IA del carrusel o del reel de una idea del lote: el tema, el brief y el texto. Pura. */
export const temaDeIdea = (idea) => [idea?.titulo || idea?.titular, idea?.brief, textoDeIdea(idea) ? `Texto: ${textoDeIdea(idea).replace(/\n/g, " / ")}` : ""].filter(Boolean).join(". ").slice(0, 400);

/**
 * Un REEL de una idea del lote, como a mano (components/FlujoReel.jsx): el guion por planos y el ENCARGO del servidor
 * (worker/lib/estudio/encargoReel.js): el storyboard en orden y el video con él. Sin revisión entre medias: en el lote
 * se revisa al final y se corrige por tramos desde el Estudio. Va en el SERVIDOR: si se cierra la aplicación, sigue y
 * queda en la galería, en la carpeta del reel. La duración, la que hace el modelo del video (8 o 10 s).
 * → { archivos: [video], fotogramas, descripcion, encargoId }.
 */
export async function crearReelDeIdea({ clienteId, idea, kit, preset = "", estilo = "", modeloImagen, modeloVideo, fotos = [], personajes = [], personajesIds = [], marca = "", rubro = "", carpetaId = null, seguir = () => true, alPaso = () => {} }) {
  alPaso("Guion por planos…");
  carpetaId = (await api.carpetaDeGrupo(clienteId, "reel", idea.titulo || idea.titular || temaDeIdea(idea))) ?? carpetaId;
  const segundos = segundosParaModelo(modeloVideo) || 10;
  const guion = await api.guionDeReel(clienteId, {
    idea: [temaDeIdea(idea), idea.guion ? `Guion propuesto:\n${idea.guion}` : "", idea.escena ? `Qué se ve: ${idea.escena}` : ""].filter(Boolean).join("\n"),
    segundos, preset, estilo, productoId: idea.productoId || undefined, personajes: personajesIds,
  });
  const estiloTexto = estiloDeMarca(limpiarKit(kit), preset, { marca, rubro, estilo });
  const lineaPersonajes = [...new Set(personajes.map((p) => `Personaje: ${p.nota}.`))].join(" ");
  const r = await lanzarReel(clienteId, {
    titulo: String(idea.titulo || idea.titular || temaDeIdea(idea) || "Reel").slice(0, 120),
    reel: { ...guion, segundos }, carpetaId, salida: "uno", revisar: false, video: { modelo: modeloVideo.id },
    comun: {
      modelo: modeloImagen.id, estilo: estiloTexto, lineaPersonajes, fotos,
      personajes: personajes.map((p) => ({ clave: p.clave, nota: p.nota ?? "" })),
    },
  });
  const total = guion.planos.length;
  alPaso(`Fotograma 1 de ${total}…`);
  const fin = await seguirEncargo({
    clienteId, id: r.encargo.id, seguir,
    alCambio: (e) => {
      const hechos = e.pasos.filter((p) => p.fase === "hecho").length;
      alPaso(hechos < total ? `Fotograma ${Math.min(hechos + 1, total)} de ${total}…` : "Video (tarda unos minutos)…");
    },
  });
  if (!fin) throw new Error("Se dejó de mirar: el reel sigue en el servidor y queda en la galería.");
  const leido = await leerEncargo(clienteId, fin.id);
  const res = resultadoDeReel(leido.encargo, new Map((leido.archivos ?? []).map((a) => [a.id, a])));
  const fotogramas = res.fotos.map((f) => f?.archivo).filter(Boolean);
  if (!res.video) throw new Error(leido.encargo.error || res.videoError || (fotogramas.length ? "El video no salió." : "No salió ningún fotograma."));
  return { archivos: [res.video], fotogramas, descripcion: guion.descripcion, encargoId: fin.id };
}
