// ============================================================
// Anuncios de Meta: lo que habla con la Marketing API
//
// QUIÉN ENTRA
//
// El token de la PERSONA que conectó Meta (`integracion_meta`), el mismo
// que lista las páginas. Las cuentas publicitarias salen de
// /me/adaccounts y se asignan a un cliente en /campanas. Hace falta que el
// token lleve `ads_read` y `ads_management`, que tienen App Review y por
// eso NO van en PERMISOS_META: se piden aparte con «Conceder permisos de
// anuncios» (`?para=anuncios`, PERMISOS_EXTRA_META en meta.js), que abre el mismo OAuth.
//
// EL DINERO
//
// Todo se crea en pausa (los cuerpos salen de src/lib/anuncios.js, que
// fija `PAUSED` y no admite otro valor). Activar es de administrador y con
// `confirmado: true`, en la ruta; aquí sólo se hace la llamada. Si la
// creación falla a medias, se borra la campaña creada (en pausa no gasta,
// pero una campaña huérfana en la cuenta del cliente confunde).
//
// EL PLAN GRATUITO
//
// Crear son cinco llamadas (campaña, conjunto, creativo, anuncio y, antes,
// el medio); la lista de campañas, una (las estadísticas van expandidas
// dentro); el detalle, cuatro. Todo lejos de las 50 por invocación.
//
// LO QUE NO SE HA PROBADO CONTRA META: nada de esto ha hablado con la
// Marketing API de verdad —no hay cuenta publicitaria de pruebas—. Los
// tests usan un `fetch` de mentira que contesta como la documentación.
// ============================================================

import { graph, urlGraph, urlGraphVideo, ErrorMeta, mensajeMeta, descifrarMeta, urlMedioPublico } from "./meta.js";
import {
  permisosAnunciosQueFaltan, CAMPOS_INSIGHTS, modificadorInsights, validarBorrador,
  cuerpoCampana, cuerpoConjunto, cuerpoCreativo, cuerpoAnuncio,
} from "../../src/lib/anuncios.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import { claveDelCliente } from "./estudio/archivos.js";
import { mediosDe } from "../../src/lib/publicacion.js";
import { ahora, uuid } from "./ids.js";

export class ErrorAnuncios extends Error {
  constructor(mensaje, estado = 400, datos = null) {
    super(mensaje);
    this.name = "ErrorAnuncios";
    this.estado = estado;
    this.datos = datos;
  }
}

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const ID_META = /^\d{1,30}$/;
const MAX_IMAGEN = 30 * 1024 * 1024;

/** Lo que se le enseña a la agencia cuando Meta dice que no. */
export function mensajeAnuncios(e) {
  if (e instanceof ErrorAnuncios) return e.message;
  if (e instanceof ErrorMeta && (e.codigo === 10 || e.codigo === 200 || e.codigo === 294 || (e.codigo >= 200 && e.codigo < 300))) {
    return `Meta no dio permiso para los anuncios: ${e.detalle || e.message}. El administrador tiene que pulsar «Conceder permisos de anuncios» y tener un rol en la cuenta publicitaria.`;
  }
  if (e instanceof ErrorMeta && e.titulo) return `${e.titulo}: ${e.detalle || e.message}`;
  return mensajeMeta(e);
}

// ------------------------------------------------------------
// El token y las cuentas
// ------------------------------------------------------------

/** La conexión con Meta del espacio: el token y lo concedido. */
export async function conexionMeta(env, acceso) {
  const fila = await acceso.leerUno("integracion_meta", { id: acceso.ownerId });
  if (!fila) throw new ErrorAnuncios("Meta no está conectado. El administrador lo conecta en Ajustes → Integraciones.", 409);
  const permisos = fila.permisos ? leerJSON(fila.permisos, null) : null;
  return { fila, permisos, faltan: permisosAnunciosQueFaltan(permisos), token: () => descifrarMeta(env, fila.token_cifrado) };
}

export const cuentaPublica = (c) => c && ({
  id: c.id, externoId: c.externo_id, nombre: c.nombre, moneda: c.moneda, zona: c.zona_horaria,
  estado: c.estado, negocio: c.negocio, minimoDiario: c.minimo_diario, clientId: c.client_id, actualizada: c.updated_at,
});

const CAMPOS_CUENTA = "id,account_id,name,currency,account_status,timezone_name,min_daily_budget,business{name}";

/**
 * Relee las cuentas publicitarias de Meta y las guarda, conservando a qué
 * cliente iba cada una. Las que ya no llegan se borran: el token ya no
 * las ve, y una asignada a un cliente le enseñaría campañas que no puede
 * leer.
 */
export async function sincronizarCuentasAnuncios(env, acceso, token) {
  const lista = [];
  let datos = await graph(env, token, "/me/adaccounts", { params: { fields: CAMPOS_CUENTA, limit: 100 } });
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    lista.push(...(datos?.data ?? []));
    const siguiente = datos?.paging?.next;
    if (!siguiente || !String(siguiente).startsWith(urlGraph(env).replace(/\/v[\d.]+$/, ""))) break;
    const res = await fetch(siguiente);
    datos = await res.json().catch(() => ({}));
    if (datos?.error) throw new ErrorMeta(datos.error, res.status);
  }
  const previas = await acceso.leer("cuentas_anuncios", {});
  const porId = new Map(previas.map((p) => [p.id, p]));
  const filas = lista.filter((c) => c?.id).map((c) => {
    const externo = String(c.id).startsWith("act_") ? String(c.id) : `act_${c.account_id ?? c.id}`;
    const id = `${acceso.ownerId}:${externo}`;
    const previa = porId.get(id);
    return {
      id, externo_id: externo, nombre: c.name ?? "", moneda: c.currency ?? "USD", zona_horaria: c.timezone_name ?? "",
      estado: Number(c.account_status ?? 1), negocio: c.business?.name ?? "",
      minimo_diario: c.min_daily_budget != null ? Number(c.min_daily_budget) : null,
      client_id: previa?.client_id ?? null, created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
    };
  });
  await acceso.guardarVarios("cuentas_anuncios", filas);
  const vivas = new Set(filas.map((f) => f.id));
  const fuera = previas.filter((p) => !vivas.has(p.id)).map((p) => p.id);
  if (fuera.length) await acceso.borrarVarios("cuentas_anuncios", fuera);
  return filas.length;
}

/** El cliente (del espacio, y de los de este colaborador) y su cuenta publicitaria. */
export async function clienteYCuenta(acceso, clientId, { exigirCuenta = true } = {}) {
  const cliente = await acceso.leerUno("clients", { id: clientId });
  if (!cliente) throw new ErrorAnuncios("Cliente no encontrado", 404);
  const cuenta = await acceso.leerUno("cuentas_anuncios", { client_id: clientId });
  if (!cuenta && exigirCuenta) throw new ErrorAnuncios("Este cliente no tiene cuenta publicitaria asignada. Escógela arriba.", 409);
  return { cliente, cuenta };
}

// ------------------------------------------------------------
// Leer: campañas, conjuntos, anuncios y estadísticas
// ------------------------------------------------------------

const CAMPOS_CAMPANA = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time";
const CAMPOS_CONJUNTO = "id,name,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,optimization_goal";
const CAMPOS_ANUNCIO = "id,name,status,effective_status,adset_id,creative{id,title,body,thumbnail_url,call_to_action_type}";

const conInsights = (campos, rango) => `${campos},insights${modificadorInsights(rango)}{${CAMPOS_INSIGHTS}}`;
const primeraFila = (x) => x?.insights?.data?.[0] ?? null;

/** Las campañas de la cuenta, con sus cifras del rango en la MISMA llamada. */
export async function listarCampanas(env, token, cuenta, rango) {
  const r = await graph(env, token, `/${cuenta.externo_id}/campaigns`, {
    params: { fields: conInsights(CAMPOS_CAMPANA, rango), limit: 100 },
  });
  return (r?.data ?? []).map((c) => ({ ...c, insights: primeraFila(c) }));
}

/** Una campaña leída de Meta, sólo si es de ESTA cuenta (si no, null). */
export async function campanaDeLaCuenta(env, token, cuenta, campanaId) {
  if (!ID_META.test(String(campanaId ?? ""))) return null;
  const c = await graph(env, token, `/${campanaId}`, {
    params: { fields: `${CAMPOS_CAMPANA},account_id,adsets{id,status,daily_budget,lifetime_budget,start_time,end_time}` },
  }).catch((e) => { if (e instanceof ErrorMeta && e.codigo === 100) return null; throw e; });
  if (!c || `act_${c.account_id}` !== cuenta.externo_id) return null;
  return c;
}

/** Conjuntos, anuncios y la serie diaria de una campaña. */
export async function detalleCampana(env, token, campanaId, rango) {
  const [conjuntos, anuncios, dias] = await Promise.all([
    graph(env, token, `/${campanaId}/adsets`, { params: { fields: conInsights(CAMPOS_CONJUNTO, rango), limit: 50 } }),
    graph(env, token, `/${campanaId}/ads`, { params: { fields: conInsights(CAMPOS_ANUNCIO, rango), limit: 50 } }),
    graph(env, token, `/${campanaId}/insights`, { params: { fields: `${CAMPOS_INSIGHTS},date_start`, time_increment: 1, ...rango, limit: 100 } }),
  ]);
  return {
    conjuntos: (conjuntos?.data ?? []).map((x) => ({ ...x, insights: primeraFila(x) })),
    anuncios: (anuncios?.data ?? []).map((x) => ({ ...x, insights: primeraFila(x) })),
    dias: dias?.data ?? [],
  };
}

/**
 * Las cifras de la cuenta: el total del rango y día a día. Son dos
 * llamadas porque el alcance NO se suma: diez días de 1.000 personas no
 * son 10.000 personas.
 */
export async function estadisticasCuenta(env, token, cuenta, rango) {
  const [total, dias] = await Promise.all([
    graph(env, token, `/${cuenta.externo_id}/insights`, { params: { fields: CAMPOS_INSIGHTS, ...rango } }),
    graph(env, token, `/${cuenta.externo_id}/insights`, { params: { fields: `${CAMPOS_INSIGHTS},date_start`, time_increment: 1, ...rango, limit: 100 } }),
  ]);
  return { total: total?.data?.[0] ?? null, dias: dias?.data ?? [] };
}

/** Ciudades por nombre, para el público. */
export async function buscarCiudades(env, token, texto, pais = "") {
  const q = String(texto ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const r = await graph(env, token, "/search", {
    params: {
      type: "adgeolocation", q, location_types: JSON.stringify(["city"]), limit: 10,
      ...(/^[A-Z]{2}$/.test(pais) ? { country_code: pais } : {}),
    },
  });
  return (r?.data ?? []).map((c) => ({ key: String(c.key), nombre: c.name, region: c.region ?? "", pais: c.country_code ?? "" }));
}

/** Los píxeles de la cuenta (clientes potenciales y ventas en la web). */
export async function pixelesDeLaCuenta(env, token, cuenta) {
  const r = await graph(env, token, `/${cuenta.externo_id}/adspixels`, { params: { fields: "id,name", limit: 50 } });
  return (r?.data ?? []).map((p) => ({ id: String(p.id), nombre: p.name ?? "" }));
}

// ------------------------------------------------------------
// Los medios del anuncio
// ------------------------------------------------------------

/**
 * Lo que se puede poner en un anuncio de este cliente: la galería del
 * Estudio y los medios de sus publicaciones de los últimos meses (con su
 * texto, para no escribirlo dos veces). Sólo claves de R2 del cliente.
 */
export async function mediosDelCliente(acceso, clientId) {
  const [archivos, calendarios] = await Promise.all([
    acceso.leer("estudio_archivos", { client_id: clientId }, "created_at desc", 60),
    acceso.leer("calendars", { client_id: clientId }, "year desc, month desc", 3),
  ]);
  const salida = [];
  const vistas = new Set();
  const poner = (m) => {
    const clave = claveDelCliente(m.clave, clientId);
    if (!clave || vistas.has(clave)) return;
    vistas.add(clave);
    salida.push({ ...m, clave, src: `/api/media/${clave}` });
  };
  for (const a of archivos) {
    if (a.borrado_at || !["imagen", "video"].includes(a.tipo)) continue;
    poner({ origen: "estudio", clave: a.clave, tipo: a.tipo, nombre: String(a.prompt ?? "").slice(0, 80), texto: "" });
  }
  for (const c of calendarios) {
    for (const d of leerJSON(c.days, [])) {
      for (const p of d?.posts ?? []) {
        for (const m of mediosDe(p)) {
          poner({
            origen: "publicacion", clave: m.src, tipo: m.tipo, nombre: String(p.idea ?? "").slice(0, 80) || d.date,
            texto: String(p.descripcion || p.script || "").slice(0, 2000), fecha: d.date,
          });
        }
      }
    }
  }
  return salida.slice(0, 120);
}

/**
 * Sube un medio del cliente a la cuenta publicitaria.
 *
 *   Imagen → /adimages, por partes (multipart) desde R2: devuelve el hash.
 *   Video  → /advideos con `file_url`: Meta lo DESCARGA de una dirección
 *            firmada (la misma que usa la cola de publicación), así que el
 *            Worker no carga el video en memoria ni lo parte en trozos.
 *            Meta lo procesa después; `estadoVideo` dice cuándo está listo.
 */
export async function prepararMedio(env, token, { cuenta, clientId, clave, origen }) {
  const limpia = claveDelCliente(clave, clientId);
  if (!limpia) throw new ErrorAnuncios("Ese archivo no es de este cliente.", 403);
  const objeto = await env.MEDIA.get(limpia);
  if (!objeto) throw new ErrorAnuncios("Archivo no encontrado", 404);
  const tipo = objeto.httpMetadata?.contentType ?? "";

  if (tipo.startsWith("video/")) {
    const r = await graph(env, token, `/${cuenta.externo_id}/advideos`, {
      metodo: "POST", host: urlGraphVideo(env),
      params: { file_url: await urlMedioPublico(env, origen, limpia), name: limpia.split("/").pop() },
    });
    if (!r?.id) throw new ErrorAnuncios("Meta no devolvió el video.", 502);
    return { tipo: "video", clave: limpia, videoId: String(r.id), listo: false };
  }

  if (!/^image\/(jpeg|png|gif|bmp|webp)$/.test(tipo)) throw new ErrorAnuncios("Meta sólo acepta imágenes JPG o PNG, o un video.", 415);
  if (objeto.size > MAX_IMAGEN) throw new ErrorAnuncios("La imagen pasa de 30 MB, el tope de Meta.", 413);
  const form = new FormData();
  form.append("access_token", token);
  form.append("filename", new Blob([await objeto.arrayBuffer()], { type: tipo }), limpia.split("/").pop());
  let res;
  try {
    res = await fetch(`${urlGraph(env)}/${cuenta.externo_id}/adimages`, { method: "POST", body: form });
  } catch (e) {
    throw new ErrorMeta({ message: `No se pudo contactar con Meta (${e.message})`, is_transient: true }, 0);
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || datos?.error) throw new ErrorMeta(datos?.error ?? {}, res.status);
  const imagen = Object.values(datos?.images ?? {})[0];
  if (!imagen?.hash) throw new ErrorAnuncios("Meta no devolvió la imagen.", 502);
  return { tipo: "imagen", clave: limpia, hash: String(imagen.hash), listo: true };
}

/** ¿Está listo el video en Meta? Con su miniatura, que el creativo de video exige. */
export async function estadoVideo(env, token, videoId) {
  if (!ID_META.test(String(videoId ?? ""))) throw new ErrorAnuncios("Video no válido", 400);
  const v = await graph(env, token, `/${videoId}`, { params: { fields: "status,picture,thumbnails{uri,is_preferred}" } });
  const estado = v?.status?.video_status ?? "processing";
  const miniaturas = v?.thumbnails?.data ?? [];
  const miniatura = (miniaturas.find((t) => t.is_preferred) ?? miniaturas[0])?.uri ?? v?.picture ?? "";
  return { videoId: String(videoId), listo: estado === "ready", fallo: estado === "error", estado, miniatura };
}

// ------------------------------------------------------------
// Crear (en pausa), activar y pausar
// ------------------------------------------------------------

/**
 * Crea campaña → conjunto → creativo → anuncio, TODO en pausa, y apunta la
 * campaña y la acción en D1. Lo que valida la pantalla se valida otra vez
 * aquí: el borrador lo manda el navegador.
 */
export async function crearCampana(env, token, acceso, { cliente, cuenta, borrador, usuario }) {
  const hoy = fechaEnZona(new Date(), cuenta.zona_horaria || "America/Panama");
  const errores = validarBorrador(borrador, { moneda: cuenta.moneda, minimoDiario: cuenta.minimo_diario, hoy });
  if (errores.length) throw new ErrorAnuncios(errores[0].mensaje, 400, { errores });

  const pagina = await acceso.leerUno("cuentas_sociales", { client_id: cliente.id, red: "facebook" });
  if (!pagina?.externo_id) {
    throw new ErrorAnuncios("Este cliente no tiene página de Facebook asignada: los anuncios salen a nombre de una página. Asígnala en Ajustes → Integraciones.", 409);
  }
  const instagram = await acceso.leerUno("cuentas_sociales", { client_id: cliente.id, red: "instagram" });

  let miniatura = "";
  if (borrador.anuncio.medio.tipo === "video") {
    const v = await estadoVideo(env, token, borrador.anuncio.medio.videoId);
    if (!v.listo) throw new ErrorAnuncios("El video aún no está listo en Meta. Espera un poco y vuelve a intentarlo.", 409);
    miniatura = v.miniatura;
  }

  const act = cuenta.externo_id;
  let campanaId = null;
  try {
    const campana = await graph(env, token, `/${act}/campaigns`, { metodo: "POST", params: cuerpoCampana(borrador) });
    campanaId = String(campana.id);
    const conjunto = await graph(env, token, `/${act}/adsets`, {
      metodo: "POST", params: cuerpoConjunto(borrador, { campanaId, moneda: cuenta.moneda, zona: cuenta.zona_horaria, hoy }),
    });
    const creativo = await graph(env, token, `/${act}/adcreatives`, {
      metodo: "POST", params: cuerpoCreativo(borrador, { paginaId: pagina.externo_id, instagramId: instagram?.externo_id ?? null, miniatura }),
    });
    const anuncio = await graph(env, token, `/${act}/ads`, {
      metodo: "POST", params: cuerpoAnuncio(borrador, { conjuntoId: String(conjunto.id), creativoId: String(creativo.id) }),
    });

    const fila = {
      id: uuid(), client_id: cliente.id, cuenta_id: act, campana_id: campanaId, conjunto_id: String(conjunto.id),
      creativo_id: String(creativo.id), anuncio_id: String(anuncio.id), nombre: String(borrador.nombre).trim(),
      objetivo: borrador.objetivo,
      presupuesto: JSON.stringify({ tipo: borrador.presupuesto.tipo, monto: Number(borrador.presupuesto.monto), moneda: cuenta.moneda }),
      inicio: borrador.inicio, fin: borrador.fin || null, estado: "PAUSED", borrador: JSON.stringify(borrador),
      creado_por: usuario.id, creado_nombre: usuario.nombre ?? "", created_at: ahora(), updated_at: ahora(),
    };
    await acceso.insertar("campanas_anuncios", fila);
    await apuntar(acceso, { clientId: cliente.id, campanaId, accion: "crear", usuario, detalle: { nombre: fila.nombre, objetivo: fila.objetivo, presupuesto: JSON.parse(fila.presupuesto) } });
    return fila;
  } catch (e) {
    // En pausa no gasta, pero una campaña a medias en la cuenta del
    // cliente es ruido: se borra (con sus hijos). Si el borrado también
    // falla, queda en pausa, que es lo seguro.
    if (campanaId) await graph(env, token, `/${campanaId}`, { metodo: "DELETE" }).catch(() => {});
    throw e;
  }
}

/** Apunta quién hizo qué. Nunca tumba la acción: un apunte perdido no es una campaña perdida. */
export async function apuntar(acceso, { clientId, campanaId, accion, usuario, detalle = {} }) {
  try {
    await acceso.insertar("historial_anuncios", {
      id: uuid(), client_id: clientId, campana_id: String(campanaId), accion, usuario_id: usuario?.id ?? null,
      nombre: usuario?.nombre ?? "", detalle: JSON.stringify(detalle), created_at: ahora(),
    });
  } catch (e) {
    console.error("historial de anuncios:", e);
  }
}

/** Presupuesto de una campaña leída de Meta, en unidades MENORES: el suyo o la suma de sus conjuntos. */
export function presupuestoDe(c) {
  if (c?.daily_budget) return { diario: Number(c.daily_budget), total: null };
  if (c?.lifetime_budget) return { diario: null, total: Number(c.lifetime_budget) };
  const conjuntos = c?.adsets?.data ?? [];
  const suma = (campo) => conjuntos.reduce((a, s) => a + Number(s[campo] ?? 0), 0);
  if (suma("daily_budget") > 0) return { diario: suma("daily_budget"), total: null };
  if (suma("lifetime_budget") > 0) return { diario: null, total: suma("lifetime_budget") };
  return { diario: null, total: null };
}

/** Fechas de una campaña leída de Meta: las suyas o las de su primer conjunto. */
export function fechasDe(c) {
  const s = c?.adsets?.data?.[0] ?? {};
  return { inicio: c?.start_time || s.start_time || "", fin: c?.stop_time || s.end_time || "" };
}

/**
 * Cambia el estado. Activar enciende primero lo de dentro (anuncio y
 * conjunto que se crearon desde la app) y la campaña la ÚLTIMA: la
 * campaña es el interruptor, y mientras esté en pausa nada gasta. Pausar
 * sólo toca la campaña: basta para que nada salga.
 */
export async function cambiarEstado(env, token, { campanaId, registro, activar }) {
  const status = activar ? "ACTIVE" : "PAUSED";
  const orden = activar ? [registro?.anuncio_id, registro?.conjunto_id, campanaId] : [campanaId];
  for (const id of orden.filter(Boolean)) {
    await graph(env, token, `/${id}`, { metodo: "POST", params: { status } });
  }
  return status;
}
