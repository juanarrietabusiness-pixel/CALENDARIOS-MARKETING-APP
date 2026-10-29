// ============================================================
// El lote, llevado por el SERVIDOR: armarlo, seguirlo y terminarlo
//
// La pantalla arma cada pieza por el MISMO camino que antes (`pedidoDeLote`, con
// la escena en el hueco «{{ESCENA}}») y el servidor la lleva: el director, el
// pedido, la proporción, el control y la corrección (worker/lib/estudio/encargos.js).
// Cerrar la aplicación ya no lo para. Lo que necesita un lienzo —el texto de la
// plantilla encima y el logo estampado— lo pone la pantalla cuando vuelve a ver
// cada pieza terminada (`terminarPaso` en lib/encargosApi.js), y se lo dice al servidor (`finales`)
// para no hacerlo dos veces.
// ============================================================

import { ESCENA, resultadoDePaso } from "./encargos";
import { ideaDeLote, encargoDeIdea, temaDeIdea } from "./loteEstudio";
import { ideaParaMejorar, ideaSinMejorar } from "./pieza";
import { asegurarTexto } from "./director";
import { textoDeIdea, plantillaDeIdea } from "./loteAnuncios";
import { crearEncargo, lanzarCarrusel } from "./encargosApi";
import { estiloDeMarca, limpiarKit, referenciaDeTipografia } from "./kitMarca";
import { estampaSola } from "./logoEstudio";
import { partirGuion } from "./carrusel";
import * as api from "./estudio";

/**
 * UNA pieza del lote como paso del encargo: lo mismo que hacía `crearPieza` antes de pedir, sin pedir. La escena va
 * lista sólo si ya la diseñó el director (`idea.ficha`); si no, el servidor se la pide al director. El borrador de
 * ficha que escribe el motor de ideas (`idea.imagen`) ya NO se salta al director: lo escribía el redactor de seis en
 * seis junto con títulos, captions y hashtags, y por eso el lote salía peor que el chat. Queda de respaldo (si el
 * director falla, o con «Mejorar» apagado). Pura salvo por los imports.
 */
export function pasoDeLote(idea, { pedidoDe, modo = "ia", formato = "post", n = 1, mejorar = true, piezaDe = () => "", indicacion = "", controlar = false, logo = false }) {
  const datos = ideaDeLote(idea, { modo });
  const delRedactor = modo === "ia" && !indicacion && !idea.pide ? asegurarTexto(idea.imagen, textoDeIdea(idea)) : "";
  const sinMejorar = delRedactor || ideaSinMejorar(datos);
  const lista = idea.ficha || "";
  const encargo = encargoDeIdea(idea, { modo, formato, piezaDe, indicacion });
  const disenar = mejorar && !lista;
  return {
    id: idea.id, titulo: idea.titulo || idea.titular || "",
    pedido: pedidoDe(idea, n, ESCENA),
    escena: mejorar ? lista : sinMejorar,
    sinMejorar,
    encargo: disenar ? encargo : null,
    mejora: disenar ? { ...encargo, idea: ideaParaMejorar(datos), tipo: "imagen", pieza: piezaDe(idea) } : null,
    texto: modo === "ia" ? textoDeIdea(idea) : "",
    controlar: Boolean(controlar) && modo !== "plantilla",
    // Lo que pone la PANTALLA al volver (lienzo): el texto de la plantilla encima y el logo estampado.
    navegador: modo === "plantilla" || logo
      ? { plantilla: modo === "plantilla" ? { texto: textoDeIdea(idea), plantilla: plantillaDeIdea(idea, formato), nombre: `pieza-${idea.id}` } : null, logo: Boolean(logo) }
      : null,
  };
}

/** Manda el lote de un formato al servidor. → { encargo, archivos }. */
export async function lanzarLote({ clienteId, ideas, titulo = "", carpetaId = null, mejorar = true, controlar = false, paralelo = 2, ...opciones }) {
  const pasos = ideas.map((i) => pasoDeLote(i, { ...opciones, mejorar, controlar }));
  // El director mira las plantillas y los «Me gusta» del cliente (copias chicas): se le mandan una vez, con el encargo.
  const vistas = mejorar ? await api.vistasDelCliente(clienteId).catch(() => []) : [];
  return crearEncargo(clienteId, { tipo: "lote", titulo, pasos, carpetaId, mejorar, controlar, paralelo, vistas });
}

/**
 * Un CARRUSEL del lote al servidor, como a mano: su carpeta (la galería lo enseña como una tarjeta), la propuesta del
 * director (se hace allí, con el guion de la idea de respaldo) y las láminas en orden. → { encargo, carpetaId }.
 */
export async function lanzarCarruselDeIdea({ clienteId, idea, kit, preset = "", estilo = "", modelo, fotos = [], personajes = [], personajesIds = [], marca = "", rubro = "", controlar = false }) {
  const k = limpiarKit(kit);
  const tema = temaDeIdea(idea);
  const carpetaId = await api.carpetaDeGrupo(clienteId, "carrusel", idea.titulo || idea.titular || tema);
  const { encargo } = await lanzarCarrusel({
    clienteId, carpetaId, controlar, logoEstampado: estampaSola(k), titulo: idea.titulo || idea.titular || "Carrusel",
    comun: {
      modelo, modo: "ia", plantilla: "banda", idea: tema, preset: estiloDeMarca(k, preset, { marca, rubro, estilo }), fotos, personajes,
      tipografia: referenciaDeTipografia(k), logo: estampaSola(k) ? "" : k.logo,
    },
    propuesta: { guion: idea.guion ?? "", tema, preset, estilo, productoId: idea.productoId || undefined, personajes: personajesIds, estructura: idea.estructura || undefined },
    laminas: partirGuion(idea.guion ?? ""),
  });
  return { encargo, carpetaId };
}

export { resultadoDePaso };
