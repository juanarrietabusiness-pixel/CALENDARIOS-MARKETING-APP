// ============================================================
// Los encargos del Estudio desde el navegador: pedir, seguir y terminar
//
// El servidor lleva la cadena (worker/lib/estudio/encargos.js) aunque se cierre
// la aplicación. Lo que necesita un LIENZO —el texto de la plantilla encima y el
// logo estampado— lo pone el navegador cuando vuelve a ver la pieza hecha
// (`terminarPaso`) y se lo dice al servidor (`finales`) para no hacerlo dos
// veces: lo hace la pantalla que lo sigue y, si nadie la tenía abierta, la
// aplicación al abrirse (`terminarPendientes`).
// ============================================================

import { pedir } from "./db";
import { terminadoEncargo } from "./encargos";
import { ponerTexto } from "./loteEstudio";
import { conLogoSiToca } from "./logoEstudio";
import * as api from "./estudio";

const ruta = (clienteId, resto = "") => `/estudio/${encodeURIComponent(clienteId)}/encargos${resto}`;
const post = (datos) => ({ method: "POST", body: JSON.stringify(datos ?? {}) });
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

export const crearEncargo = (clienteId, datos) => pedir(ruta(clienteId), post(datos));
export const leerEncargo = (clienteId, id) => pedir(ruta(clienteId, `/${encodeURIComponent(id)}`));
export const avanzarEncargo = (clienteId, id) => pedir(ruta(clienteId, `/${encodeURIComponent(id)}/avanzar`), post({}));
export const cancelarEncargo = (clienteId, id) => pedir(ruta(clienteId, `/${encodeURIComponent(id)}/cancelar`), post({}));
const finalesDePaso = (clienteId, id, pasoId, finales) => pedir(ruta(clienteId, `/${encodeURIComponent(id)}/final`), post({ pasoId, finales }));

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

/** Lo que ya se está terminando en esta pestaña (la pantalla que sigue y el repaso al abrir no lo hacen dos veces). */
const enCurso = new Set();

/**
 * Pone en UNA pieza hecha lo que pide su `navegador` (el texto de la plantilla, el logo estampado) y se lo dice al
 * servidor. → las finales (archivos), o null si ya lo estaba haciendo otra llamada.
 */
export async function terminarPaso({ clienteId, encargo, paso, archivos, kit, carpetaId = null }) {
  const clave = `${encargo.id}:${paso.id}`;
  if (enCurso.has(clave) || paso.finales || paso.fase !== "hecho") return null;
  enCurso.add(clave);
  try {
    const nav = paso.navegador ?? {};
    const finales = [];
    for (const o of paso.opciones ?? []) {
      const crudo = archivos.get(o.id);
      if (!crudo) { finales.push(null); continue; }
      let final = crudo;
      try {
        if (nav.plantilla) {
          final = await ponerTexto({ clienteId, crudo, texto: nav.plantilla.texto, plantilla: nav.plantilla.plantilla, kit, carpetaId: carpetaId ?? crudo.carpetaId ?? null, nombre: nav.plantilla.nombre || "pieza" });
        }
        // `forzar`: el servidor lo pide también cuando Muse dejó fuera el logo (aunque el kit diga «lo pone el modelo»).
        if (nav.logo) final = await conLogoSiToca({ clienteId, archivo: final, kit, carpetaId: carpetaId ?? crudo.carpetaId ?? null, forzar: true });
      } catch { /* se queda la que hay: se vuelve a intentar la próxima vez */ }
      finales.push(final);
    }
    for (let intento = 0; intento < 6; intento++) {
      try {
        await finalesDePaso(clienteId, encargo.id, paso.id, finales.map((f) => f?.id ?? null));
        break;
      } catch (e) {
        if (e?.estado !== 409) break;
        await dormir(2500);
      }
    }
    return finales;
  } finally {
    enCurso.delete(clave);
  }
}

/** Todas las piezas hechas de un encargo que esperan a la pantalla, una tras otra. */
export async function terminarEncargo({ clienteId, encargo, archivos, kit }) {
  for (const p of encargo.pasos) {
    if (p.fase === "hecho" && !p.finales && p.navegador) await terminarPaso({ clienteId, encargo, paso: p, archivos, kit });
  }
}

const HECHO = "encargos-terminados";

/**
 * Al abrir la aplicación (una vez por sesión): lo que el servidor terminó sin nadie mirando y espera el lienzo. Sólo
 * los encargos de quien los pidió (`yo`): si no, cada pestaña del equipo pondría el mismo texto dos veces.
 */
export async function terminarPendientes(yo) {
  try { if (sessionStorage.getItem(HECHO)) return; sessionStorage.setItem(HECHO, "1"); } catch { /* se hace igual */ }
  const r = await pedir("/encargos/por-terminar").catch(() => null);
  const kits = new Map();
  for (const { encargo, archivos } of r?.encargos ?? []) {
    if (yo && encargo.creadoPor && encargo.creadoPor !== yo) continue;
    try {
      if (!kits.has(encargo.clientId)) kits.set(encargo.clientId, (await api.leerEstudio(encargo.clientId))?.kit ?? {});
      await terminarEncargo({ clienteId: encargo.clientId, encargo, archivos: new Map(archivos.map((a) => [a.id, a])), kit: kits.get(encargo.clientId) });
    } catch (e) {
      console.warn("encargo por terminar:", encargo.id, e?.message);
    }
  }
}

/**
 * Lo que una pantalla enseña de un carrusel que lleva el servidor: por lámina (`lamina.n`), `{ cargando }`, `{ error }`
 * o `{ crudo, final, control }` (final = lo que puso la pantalla encima, o la cruda mientras tanto). Pura.
 */
export function laminasDeEncargo(e, archivos) {
  const salida = {};
  for (const p of e?.pasos ?? []) {
    const i = (p.lamina?.n ?? 1) - 1;
    if (p.fase === "fallido") salida[i] = { error: p.error || "La lámina no salió." };
    else if (p.fase !== "hecho") salida[i] = { cargando: true };
    else {
      const o = p.opciones?.[0];
      const crudo = o ? archivos.get(o.id) : null;
      const final = (p.finales?.[0] && archivos.get(p.finales[0])) || crudo;
      salida[i] = crudo ? { crudo, final, control: o.control ?? null } : { error: "La lámina se creó pero no aparece en la galería." };
    }
  }
  return salida;
}

/**
 * Un carrusel al servidor. `comun`: lo mismo que recibe `crearLamina` en la pantalla (el modelo, el estilo de la marca,
 * las fotos, los personajes, la letra, el logo si lo pone el modelo); `laminas`: las del guion (o el respaldo si va
 * `propuesta`, que hace que el director diseñe la serie en el servidor). `previas`: { portada, anterior } (claves de
 * las crudas) al seguir tras aprobar la portada. → { encargo, archivos }.
 */
export async function lanzarCarrusel({ clienteId, comun, laminas = [], total, previas = null, sistema = null, conSistema = true, propuesta = null, carpetaId = null, controlar = false, logoEstampado = false, titulo = "" }) {
  const vistas = propuesta ? await api.vistasDelCliente(clienteId).catch(() => []) : [];
  return crearEncargo(clienteId, {
    tipo: "carrusel", titulo, comun: comunParaServidor(comun), laminas, total: total ?? laminas.length, previas, sistema, conSistema,
    propuesta, carpetaId, controlar, logoEstampado, vistas,
  });
}

/** De lo común de `crearLamina` (con objetos) a lo que guarda el servidor: ids y claves. Pura. */
export function comunParaServidor(c = {}) {
  const persona = (p) => (p?.clave ? { clave: p.clave, nota: p.nota ?? "" } : null);
  return {
    modelo: typeof c.modelo === "string" ? c.modelo : c.modelo?.id ?? "", idea: c.idea ?? "", preset: c.preset ?? "",
    modo: c.modo ?? "ia", plantilla: c.plantilla ?? "banda", hilo: c.hilo ?? "",
    personajes: (c.personajes ?? []).map(persona).filter(Boolean), tipografia: persona(c.tipografia),
    fotos: c.fotos ?? [], logo: c.logo ?? "", calendarId: c.calendarId ?? null, postId: c.postId ?? null,
  };
}

/** Un carrusel del servidor como resultado de UNA pieza del lote: en marcha, con su avance, o sus láminas en orden. Pura. */
export function resultadoDeCarrusel(e, archivos) {
  if (!e) return null;
  const hechas = e.pasos.filter((p) => p.fase === "hecho");
  if (!terminadoEncargo(e)) {
    return { cargando: true, enServidor: true, paso: e.pasos.length ? `Lámina ${Math.min(hechas.length + 1, e.pasos.length)} de ${e.pasos.length}…` : "El director diseña las láminas…" };
  }
  const lista = hechas.map((p) => archivos.get(p.finales?.[0]) ?? archivos.get(p.opciones?.[0]?.id)).filter(Boolean);
  return lista.length
    ? { opciones: [{ final: lista[0], archivos: lista }], elegida: 0, enServidor: true }
    : { error: e.error || e.pasos.find((p) => p.error)?.error || "No salió ninguna lámina." };
}

export const terminado = terminadoEncargo;
