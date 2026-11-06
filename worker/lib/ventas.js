// ============================================================
// «Tus ventas de la semana»: el enlace del cliente y lo que ve la agencia (curso de campañas, E.1)
//
// Lo puro (las semanas, limpiar lo que llega, la tasa de cierre, el ROAS real, el mensaje) vive en
// src/lib/ventasSemana.js; aquí, lo que toca D1 y Meta.
//
// DOS PUERTAS, LA MISMA TABLA
//
//   · El cliente, SIN sesión, por su testigo (`/api/publico-ventas/<testigo>`): la única lectura sin dueño es la del
//     testigo (worker/lib/publico.js), que da el espacio y el cliente; todo lo demás se lee con la capa de acceso de
//     ESE espacio. Sólo escribe la semana actual y las dos anteriores, y nunca ve un costo.
//   · La agencia, con sesión (`/api/ventas/<cliente>`): ocho semanas con la pauta y las conversaciones de Meta de
//     cada una, la tasa de cierre medida y el ROAS real. Un colaborador, sólo sus clientes (lo acota la capa).
//
// META, SÓLO LECTURA Y UNA LLAMADA
//
// /insights de la cuenta publicitaria del cliente con `time_increment=1` (gasto y acciones), sumado por el lunes de
// Panamá de cada día. Una llamada por petición: entra de sobra en las 50 del plan gratuito. La agencia lee una semana
// MÁS de las que ve, porque cada semana de ventas se cruza con las conversaciones de la anterior. Un fallo de Meta no
// tumba nada: las ventas salen igual, sin cifras de la pauta, y se dice por qué.
//
// LO QUE NO SE HA PROBADO CONTRA META: nada. Los tests hablan con un `fetch` de mentira (tests/migracion/ventas.test.js).
// ============================================================

import { graph, metaConfigurado } from "./meta.js";
import { conexionMeta, mensajeAnuncios } from "./anuncios.js";
import { clienteDeVentasPorTestigo } from "./publico.js";
import { crearAcceso, NULO } from "./acceso.js";
import { difundir } from "./vivo.js";
import { ahora, uuid, testigo as nuevoTestigo } from "./ids.js";
import { ACCION_MENSAJE } from "../../src/lib/anuncios.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";
import {
  lunesDe, semanasHacia, semanaQueToca, etiquetaSemana, nombreSemana, finDeSemana, limpiarVentas, agruparPorSemana,
  resumenVentas, VENTANA_CLIENTE, SEMANAS_AGENCIA,
} from "../../src/lib/ventasSemana.js";

export class ErrorVentas extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.name = "ErrorVentas";
    this.estado = estado;
  }
}

/** El id de la fila de una semana: fijo por cliente y semana, así guardar dos veces es la misma fila. */
const idSemana = (clientId, semana) => `vs:${clientId}:${semana}`;

/** Una fila de D1 como la usa la pantalla (y lo puro de src/lib/ventasSemana.js). */
const semanaDeFila = (f) => ({
  semana: f.semana,
  ventas: Number(f.ventas) || 0,
  monto: Number(f.monto) || 0,
  deAnuncios: f.de_anuncios == null ? null : Number(f.de_anuncios),
  otrosCanales: f.otros_canales == null ? null : Number(f.otros_canales),
  nota: f.nota ?? "",
  origen: f.origen,
  por: f.por ?? "",
  actualizado: f.updated_at,
});

// ------------------------------------------------------------
// El testigo del enlace
// ------------------------------------------------------------

/** El testigo del enlace de ventas de un cliente, o null si todavía no se creó. */
export async function testigoDeVentas(acceso, clientId) {
  const f = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  return f?.testigo_ventas || null;
}

/**
 * El testigo del enlace, creándolo la PRIMERA vez y nunca más: regenerarlo mataría el enlace que el cliente ya tiene
 * guardado en su WhatsApp. Si dos personas lo piden a la vez, gana la primera y las dos se llevan el mismo (la
 * escritura sólo ocurre si seguía vacío, y se relee).
 */
export async function crearEnlaceDeVentas(acceso, clientId) {
  const previa = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  if (previa?.testigo_ventas) return previa.testigo_ventas;
  const nuevo = nuevoTestigo(24);
  if (previa) {
    await acceso.actualizar("anuncios_clientes", { id: previa.id, testigo_ventas: NULO }, { testigo_ventas: nuevo, updated_at: ahora() });
  } else {
    try {
      await acceso.insertar("anuncios_clientes", { id: uuid(), client_id: clientId, testigo_ventas: nuevo, created_at: ahora(), updated_at: ahora() });
    } catch {
      // Otra petición creó la fila entre la lectura y la escritura (client_id es único): se le pone el testigo a ésa.
      const otra = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
      if (otra && !otra.testigo_ventas) await acceso.actualizar("anuncios_clientes", { id: otra.id, testigo_ventas: NULO }, { testigo_ventas: nuevo, updated_at: ahora() });
    }
  }
  const fila = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  if (!fila?.testigo_ventas) throw new ErrorVentas("No se pudo crear el enlace. Vuelve a intentarlo.", 500);
  return fila.testigo_ventas;
}

// ------------------------------------------------------------
// Las semanas
// ------------------------------------------------------------

/** Las filas de esas semanas del cliente, por su lunes. */
async function filasDeSemanas(acceso, clientId, semanas) {
  if (!semanas.length) return new Map();
  const columnas = ["semana", "ventas", "monto", "de_anuncios", "otros_canales", "nota", "origen", "por", "updated_at"];
  const filas = await acceso.leerVarios("ventas_semana", columnas, "semana", semanas, { client_id: clientId });
  return new Map(filas.map((f) => [f.semana, semanaDeFila(f)]));
}

/**
 * Guarda (o reemplaza) lo de una semana. `fila` ya viene limpia (limpiarVentas). `origen`: «cliente» o «agencia»;
 * `por`: la persona del equipo, vacío si fue el cliente. Devuelve la semana como la usa la pantalla.
 */
export async function guardarSemana(acceso, { clientId, fila, origen, por = "" }) {
  const id = idSemana(clientId, fila.semana);
  const previa = await acceso.leerUno("ventas_semana", { id });
  const datos = {
    id, client_id: clientId, semana: fila.semana,
    ventas: fila.ventas, monto: fila.monto, de_anuncios: fila.deAnuncios, otros_canales: fila.otrosCanales, nota: fila.nota ?? "",
    origen: origen === "agencia" ? "agencia" : "cliente", por: origen === "agencia" ? String(por ?? "") : "",
    created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
  };
  await acceso.guardar("ventas_semana", datos);
  return semanaDeFila(datos);
}

// ------------------------------------------------------------
// Meta: la pauta y las conversaciones de cada semana
// ------------------------------------------------------------

/**
 * Gasto y conversaciones de Meta por semana (`{ [lunes]: { gasto, conversaciones } }`) desde el lunes `desde` hasta
 * `hasta`, o por qué no se pudo. UNA llamada a /insights de la cuenta del cliente, sólo lectura.
 * `estado`: «ok», «sin-meta» (Meta no está configurado o conectado), «sin-cuenta» (el cliente no tiene cuenta
 * publicitaria asignada), «sin-permisos» o «error» (Meta dijo que no: `mensaje` dice qué).
 */
export async function metaPorSemana(env, acceso, clientId, { desde, hasta }) {
  const semanas = [];
  for (let s = lunesDe(hasta); s >= desde; s = sumarDias(s, -7)) semanas.push(s);
  const vacio = (estado, mensaje = "") => ({ estado, mensaje, moneda: "USD", porSemana: null });
  if (!metaConfigurado(env)) return vacio("sin-meta", "Meta no está configurado en este entorno.");
  const cuenta = await acceso.leerUno("cuentas_anuncios", { client_id: clientId });
  if (!cuenta) return vacio("sin-cuenta", "Este cliente no tiene cuenta publicitaria asignada (Anuncios → Campañas).");
  let token;
  try {
    const conexion = await conexionMeta(env, acceso);
    if (conexion.faltan?.length) return { ...vacio("sin-permisos", "Faltan los permisos de anuncios: el administrador los concede en Anuncios."), moneda: cuenta.moneda || "USD" };
    token = await conexion.token();
  } catch {
    return { ...vacio("sin-meta", "Meta no está conectado: el administrador lo conecta en Ajustes → Integraciones."), moneda: cuenta.moneda || "USD" };
  }
  try {
    const r = await graph(env, token, `/${cuenta.externo_id}/insights`, {
      params: {
        fields: "spend,actions", time_increment: 1, limit: 100,
        time_range: JSON.stringify({ since: desde, until: hasta }),
      },
    });
    return {
      estado: "ok", mensaje: "", moneda: cuenta.moneda || "USD",
      porSemana: agruparPorSemana(r?.data ?? [], { accion: ACCION_MENSAJE, semanas }),
    };
  } catch (e) {
    return { ...vacio("error", mensajeAnuncios(e)), moneda: cuenta.moneda || "USD" };
  }
}

/** Una semana para la pantalla: su nombre, sus fechas, lo apuntado (o vacío) y lo de Meta de ESA semana. */
function semanaParaPantalla(lunes, hoy, apuntada, meta, { conCosto }) {
  const m = meta?.[lunes] ?? null;
  return {
    semana: lunes,
    hasta: finDeSemana(lunes),
    nombre: nombreSemana(lunes, hoy),
    etiqueta: etiquetaSemana(lunes),
    apuntada: Boolean(apuntada),
    ventas: apuntada?.ventas ?? null,
    monto: apuntada?.monto ?? null,
    deAnuncios: apuntada?.deAnuncios ?? null,
    otrosCanales: apuntada?.otrosCanales ?? null,
    nota: apuntada?.nota ?? "",
    origen: apuntada?.origen ?? null,
    actualizado: apuntada?.actualizado ?? null,
    conversaciones: m ? m.conversaciones : null,
    ...(conCosto ? { gasto: m ? m.gasto : null, por: apuntada?.por ?? "" } : {}),
  };
}

// ------------------------------------------------------------
// Lo que ve la agencia
// ------------------------------------------------------------

/**
 * Las últimas ocho semanas del cliente con la pauta y las conversaciones de cada una, la tasa de cierre medida, el
 * ROAS real, desde cuándo no apunta y el testigo del enlace (si ya se creó). Una consulta de semanas, una de quién
 * escribió y una llamada a Meta.
 */
export async function ventasDelCliente(env, acceso, clientId, { hoy = fechaEnZona(new Date()) } = {}) {
  const cliente = await acceso.leerUno("clients", { id: clientId });
  if (!cliente) throw new ErrorVentas("Cliente no encontrado", 404);
  const semanas = semanasHacia(lunesDe(hoy), SEMANAS_AGENCIA);
  // Una semana más atrás: la tasa cruza las ventas de cada semana con las conversaciones de la anterior.
  const desde = sumarDias(semanas.at(-1), -7);
  const [apuntadas, meta, testigo] = await Promise.all([
    filasDeSemanas(acceso, clientId, semanas),
    metaPorSemana(env, acceso, clientId, { desde, hasta: hoy }),
    testigoDeVentas(acceso, clientId),
  ]);
  // Quién del equipo escribió cada semana: su nombre, no su id.
  const porIds = [...new Set([...apuntadas.values()].map((s) => s.por).filter(Boolean))];
  const nombres = porIds.length
    ? new Map((await acceso.leerVarios("memberships", ["user_id", "nombre"], "user_id", porIds)).map((m) => [m.user_id, m.nombre]))
    : new Map();
  const lista = semanas.map((s) => {
    const fila = semanaParaPantalla(s, hoy, apuntadas.get(s), meta.porSemana, { conCosto: true });
    return { ...fila, porNombre: fila.por ? nombres.get(fila.por) ?? "" : "" };
  });
  return {
    clientId,
    nombre: cliente.name ?? "",
    hoy,
    toca: semanaQueToca(hoy),
    semanas: lista,
    // Lo de la semana de antes de la más vieja: sólo para cruzar (la tasa la calcula también la pantalla).
    metaPorSemana: meta.porSemana,
    meta: { estado: meta.estado, mensaje: meta.mensaje, moneda: meta.moneda },
    resumen: resumenVentas([...apuntadas.values()], meta.porSemana, { hoy }),
    testigo,
  };
}

/** La agencia escribe (o corrige) una semana: de las ocho que ve, nunca una que no ha empezado. */
export async function escribirSemanaAgencia(env, acceso, { clientId, entrada, usuario, firma = null, hoy = fechaEnZona(new Date()) }) {
  if (!(await acceso.leerUno("clients", { id: clientId }))) throw new ErrorVentas("Cliente no encontrado", 404);
  const { fila, error } = limpiarVentas(entrada, { hoy, ventana: SEMANAS_AGENCIA });
  if (error) throw new ErrorVentas(error, 400);
  const semana = await guardarSemana(acceso, { clientId, fila, origen: "agencia", por: usuario?.id ?? "" });
  difundir(env, acceso.ownerId, { tipo: "ventas", clientId, semana: fila.semana, por: firma });
  return { ...semana, porNombre: usuario?.nombre ?? "" };
}

/** Borra lo apuntado de una semana (lo escribió alguien por error). */
export async function borrarSemana(env, acceso, { clientId, semana, firma = null }) {
  const lunes = lunesDe(String(semana ?? ""));
  if (!lunes || lunes !== semana) throw new ErrorVentas("Esa semana no existe.", 404);
  const n = await acceso.borrar("ventas_semana", { id: idSemana(clientId, lunes), client_id: clientId });
  if (!n) throw new ErrorVentas("Esa semana no tiene nada apuntado.", 404);
  difundir(env, acceso.ownerId, { tipo: "ventas", clientId, semana: lunes, por: firma });
  return { ok: true };
}

// ------------------------------------------------------------
// Lo que ve el cliente (sin sesión)
// ------------------------------------------------------------

/** El cliente del testigo y la capa de acceso de su espacio, o null si el testigo no vale. */
async function delTestigo(env, testigo) {
  const c = await clienteDeVentasPorTestigo(env.DB, testigo);
  if (!c) return null;
  return { ...c, acceso: crearAcceso(env.DB, c.ownerId) };
}

/**
 * Lo que enseña la página del cliente: su nombre, la semana que toca, las tres que puede escribir con lo que ya
 * apuntó y cuántas conversaciones empezaron los anuncios en cada una (si tiene cuenta y Meta está conectado). Nunca
 * un costo ni un gasto. null si el testigo no vale.
 */
export async function ventasPublicas(env, testigo, { hoy = fechaEnZona(new Date()) } = {}) {
  const c = await delTestigo(env, testigo);
  if (!c) return null;
  const semanas = semanasHacia(lunesDe(hoy), VENTANA_CLIENTE);
  const [apuntadas, meta] = await Promise.all([
    filasDeSemanas(c.acceso, c.clientId, semanas),
    metaPorSemana(env, c.acceso, c.clientId, { desde: semanas.at(-1), hasta: hoy }),
  ]);
  return {
    cliente: { nombre: c.nombre, color: c.color, logo: c.logo },
    hoy,
    toca: semanaQueToca(hoy),
    moneda: meta.moneda,
    conMeta: meta.estado === "ok",
    semanas: semanas.map((s) => semanaParaPantalla(s, hoy, apuntadas.get(s), meta.porSemana, { conCosto: false })),
  };
}

/** El cliente guarda una semana por su enlace. Devuelve la semana guardada; null si el testigo no vale. */
export async function guardarDelCliente(env, testigo, entrada, { hoy = fechaEnZona(new Date()) } = {}) {
  const c = await delTestigo(env, testigo);
  if (!c) return null;
  const { fila, error } = limpiarVentas(entrada, { hoy, ventana: VENTANA_CLIENTE });
  if (error) throw new ErrorVentas(error, 400);
  const semana = await guardarSemana(c.acceso, { clientId: c.clientId, fila, origen: "cliente" });
  difundir(env, c.ownerId, { tipo: "ventas", clientId: c.clientId, semana: fila.semana, por: { userId: "cliente", nombre: c.nombre } });
  return { semana: fila.semana, ventas: semana.ventas, monto: semana.monto, deAnuncios: semana.deAnuncios, otrosCanales: semana.otrosCanales, nota: semana.nota, actualizado: semana.actualizado };
}
