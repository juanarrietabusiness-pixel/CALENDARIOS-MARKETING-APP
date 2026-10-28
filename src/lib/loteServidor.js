// ============================================================
// El lote, llevado por el SERVIDOR: armarlo, seguirlo y terminarlo
//
// La pantalla arma cada pieza por el MISMO camino que antes (`pedidoDeLote`, con
// la escena en el hueco «{{ESCENA}}») y el servidor la lleva: el director, el
// pedido, la proporción, el control y la corrección (worker/lib/estudio/encargos.js).
// Cerrar la aplicación ya no lo para. Lo que necesita un lienzo —el texto de la
// plantilla encima y el logo estampado— lo pone la pantalla cuando vuelve a ver
// cada pieza terminada (`terminarPieza`), y se lo dice al servidor (`finales`)
// para no hacerlo dos veces.
// ============================================================

import { pedir } from "./db";
import { ESCENA, terminadoEncargo, resultadoDePaso } from "./encargos";
import { ideaDeLote, encargoDeIdea, ponerTexto } from "./loteEstudio";
import { ideaParaMejorar, ideaSinMejorar } from "./pieza";
import { asegurarTexto } from "./director";
import { textoDeIdea, plantillaDeIdea } from "./loteAnuncios";
import { conLogoSiToca } from "./logoEstudio";
import { vistasDelCliente } from "./estudio";

const ruta = (clienteId, resto = "") => `/estudio/${encodeURIComponent(clienteId)}/encargos${resto}`;
const post = (datos) => ({ method: "POST", body: JSON.stringify(datos ?? {}) });

export const crearEncargo = (clienteId, datos) => pedir(ruta(clienteId), post(datos));
export const leerEncargo = (clienteId, id) => pedir(ruta(clienteId, `/${encodeURIComponent(id)}`));
export const avanzarEncargo = (clienteId, id) => pedir(ruta(clienteId, `/${encodeURIComponent(id)}/avanzar`), post({}));
export const cancelarEncargo = (clienteId, id) => pedir(ruta(clienteId, `/${encodeURIComponent(id)}/cancelar`), post({}));
const finalesDePaso = (clienteId, id, pasoId, finales) => pedir(ruta(clienteId, `/${encodeURIComponent(id)}/final`), post({ pasoId, finales }));

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * UNA pieza del lote como paso del encargo: lo mismo que hacía `crearPieza` antes de pedir, sin pedir. La escena va
 * lista si ya la hay (la ficha del director o el pedido listo del motor de ideas); si no, el servidor se la pide al
 * director y, si tampoco, a la mejora. Pura salvo por los imports.
 */
export function pasoDeLote(idea, { pedidoDe, modo = "ia", formato = "post", n = 1, mejorar = true, piezaDe = () => "", indicacion = "", controlar = false }) {
  const datos = ideaDeLote(idea, { modo });
  const sinMejorar = ideaSinMejorar(datos);
  const lista = idea.ficha || (modo === "ia" && !indicacion && !idea.pide ? asegurarTexto(idea.imagen, textoDeIdea(idea)) : "");
  const encargo = encargoDeIdea(idea, { modo, formato, piezaDe, indicacion });
  const disenar = mejorar && !lista;
  return {
    id: idea.id, titulo: idea.titulo || idea.titular || "",
    pedido: pedidoDe(idea, n, ESCENA),
    escena: mejorar ? lista || "" : sinMejorar,
    sinMejorar,
    encargo: disenar ? encargo : null,
    mejora: disenar ? { ...encargo, idea: ideaParaMejorar(datos), tipo: "imagen", pieza: piezaDe(idea) } : null,
    texto: modo === "ia" ? textoDeIdea(idea) : "",
    controlar: Boolean(controlar) && modo !== "plantilla",
  };
}

/** Manda el lote de un formato al servidor. → { encargo, archivos }. */
export async function lanzarLote({ clienteId, ideas, titulo = "", carpetaId = null, mejorar = true, controlar = false, paralelo = 2, ...opciones }) {
  const pasos = ideas.map((i) => pasoDeLote(i, { ...opciones, mejorar, controlar }));
  // El director mira las plantillas y los «Me gusta» del cliente (copias chicas): se le mandan una vez, con el encargo.
  const vistas = mejorar ? await vistasDelCliente(clienteId).catch(() => []) : [];
  return crearEncargo(clienteId, { tipo: "lote", titulo, pasos, carpetaId, mejorar, controlar, paralelo, vistas });
}

/**
 * Sigue un encargo mientras se mira: lo lee cada pocos segundos y avisa con `alCambio(encargo, archivos)`. El paso lo
 * da la bomba del servidor; sólo si lleva un rato quieto (sin la bomba: local, o se durmió) lo empuja la pantalla.
 * → el encargo al terminar, o null si se dejó de mirar.
 */
export async function seguirEncargo({ clienteId, id, alCambio = () => {}, seguir = () => true }) {
  let quieto = 0;
  let antes = "";
  let cerrado = 0;
  while (seguir()) {
    let r = null;
    try {
      r = quieto >= 20_000 ? await avanzarEncargo(clienteId, id) : await leerEncargo(clienteId, id);
    } catch (e) {
      if (e?.estado === 404) return null;
      await dormir(5000);
      continue;
    }
    const e = r?.encargo;
    if (!e) return null;
    alCambio(e, new Map((r.archivos ?? []).map((a) => [a.id, a])));
    // Terminado: se espera a que la pantalla apunte lo suyo (los finales), pero no para siempre.
    if (terminadoEncargo(e) && (e.pasos.every((p) => p.fase !== "hecho" || p.finales) || (cerrado += 3000) > 60_000)) return e;
    quieto = e.actualizado === antes ? quieto + 3000 : 0;
    antes = e.actualizado;
    await dormir(3000);
  }
  return null;
}

/**
 * Lo que la pantalla pone a una pieza terminada: el texto de la plantilla encima (modo «plantilla») y el logo estampado
 * (si el kit lo pide), y se lo dice al servidor. → los archivos nuevos (para enseñarlos) o [] si no hizo falta nada.
 */
export async function terminarPieza({ clienteId, encargoId, paso, idea, archivos, modo = "ia", formato = "post", kit, carpetaId = null }) {
  const finales = [];
  const nuevos = [];
  for (const o of paso.opciones ?? []) {
    const crudo = archivos.get(o.id);
    if (!crudo) { finales.push(null); continue; }
    let final = crudo;
    try {
      if (modo === "plantilla" && idea) {
        final = await ponerTexto({ clienteId, crudo, texto: textoDeIdea(idea), plantilla: plantillaDeIdea(idea, formato), kit, carpetaId, nombre: `pieza-${idea.id}` });
      }
      final = await conLogoSiToca({ clienteId, archivo: final, kit, carpetaId });
    } catch { /* se queda la que hay: se puede volver a intentar al reabrir */ }
    if (final !== crudo) nuevos.push(final);
    finales.push(final.id);
  }
  for (let intento = 0; intento < 5; intento++) {
    try {
      await finalesDePaso(clienteId, encargoId, paso.id, finales);
      break;
    } catch (e) {
      if (e?.estado !== 409) break;
      await dormir(2000);
    }
  }
  return nuevos;
}

export { resultadoDePaso };
