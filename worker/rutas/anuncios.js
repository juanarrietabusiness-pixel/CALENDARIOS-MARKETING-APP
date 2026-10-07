// ============================================================
// /api/anuncios — Meta Ads: cuentas, campañas, estadísticas y crear
//
//   GET  /estado                                   Conexión, permisos y cuentas publicitarias
//   POST /cuentas/sincronizar                      Releer /me/adaccounts (admin)
//   PUT  /cuentas/:id { clientId }                 Asignar una cuenta a un cliente
//   GET  /clientes/:c/campanas?rango=30            Campañas con sus cifras
//   GET  /clientes/:c/campanas/:id?rango=30        Conjuntos, anuncios y día a día
//   GET  /clientes/:c/estadisticas?rango=30        La cuenta: total y día a día
//   POST /clientes/:c/campanas { borrador }        Crear, TODO en pausa
//   POST /clientes/:c/campanas/:id/activar         Sólo admin, y con { confirmado: true }
//   POST /clientes/:c/campanas/:id/pausar          Cualquiera que pueda escribir
//   GET  /clientes/:c/ciudades?q=&pais=            Buscar ciudades para el público
//   GET  /clientes/:c/pixeles                      Píxeles de la cuenta
//   GET  /clientes/:c/intereses?q=                 Buscar intereses de Meta (conjuntos por intereses)
//   GET  /clientes/:c/publicos                     Públicos de la cuenta (personalizados y similares)
//   POST /clientes/:c/similares { origenId, pais, porcentaje }  Crear un público similar (no gasta)
//   GET  /manual · PUT /manual                     El «Manual de campañas de la agencia» (el estratega lo lee)
//   POST /estratega { clientId?, externo?, … }     El plan de una campaña (IA; no toca Meta)
//   GET  /planes?cliente= · POST /planes · DELETE /planes/:id   Los planes guardados
//   GET  /clientes/:c/medios                       Estudio + publicaciones del cliente
//   POST /clientes/:c/medio { clave }              Subirlo a Meta (imagen: hash; video: id)
//   GET  /clientes/:c/video/:id                    ¿Terminó Meta de procesar el video?
//   GET  /clientes/:c/historial                    Quién creó, activó o pausó qué
//
// ACTIVAR ES DEL SERVIDOR, NO DE LA PANTALLA. La pantalla enseña un
// diálogo con el presupuesto y las fechas y pide escribir ACTIVAR; aquí
// se exige el papel de administrador (403) y `confirmado: true` —el
// booleano, no algo que lo parezca— (409, con el resumen para el
// diálogo). Un asistente, un MCP o una petición a mano tampoco se lo saltan.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { ahora } from "../lib/ids.js";
import { ErrorMeta, metaConfigurado } from "../lib/meta.js";
import {
  ErrorAnuncios, mensajeAnuncios, conexionMeta, cuentaPublica, sincronizarCuentasAnuncios, clienteYCuenta,
  listarCampanas, campanaDeLaCuenta, detalleCampana, estadisticasCuenta, buscarCiudades, pixelesDeLaCuenta,
  mediosDelCliente, prepararMedio, estadoVideo, crearCampana, apuntar, presupuestoDe, fechasDe, cambiarEstado,
  buscarIntereses, publicosDeLaCuenta, crearSimilar,
} from "../lib/anuncios.js";
import { rangoInsights, RANGOS, deMenores, resumenPresupuesto, permisosAnunciosQueFaltan } from "../../src/lib/anuncios.js";
import { ErrorIA } from "../lib/cerebro/ia.js";
import { ErrorEstratega, leerManual, guardarManual, armarPlan, listarPlanes, guardarPlan, borrarPlan } from "../lib/estratega.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const miniatura = (u) => (u ? `/api/metricas/miniatura?u=${encodeURIComponent(u)}` : "");

/** El rango pedido y las fechas que cubre (para rellenar los días sin gasto). */
function rangoDe(url, cuenta) {
  const q = url.searchParams;
  const r = rangoInsights({ rango: Number(q.get("rango")) || 30, desde: q.get("desde") ?? "", hasta: q.get("hasta") ?? "" });
  if (r.time_range) {
    const t = JSON.parse(r.time_range);
    return { r, periodo: { desde: t.since, hasta: t.until } };
  }
  const dias = Object.values(RANGOS).find((x) => x.preset === r.date_preset)?.dias ?? 30;
  // `last_Nd` son los N días anteriores a hoy, sin hoy, en la zona de la cuenta.
  const hoy = fechaEnZona(new Date(), cuenta?.zona_horaria || "America/Panama");
  return { r, periodo: { desde: sumarDias(hoy, -dias), hasta: sumarDias(hoy, -1) } };
}

/** Una campaña de Meta como la pinta la pantalla. */
function campanaPublica(c, moneda, registro = null) {
  const p = presupuestoDe(c);
  const f = fechasDe(c);
  return {
    id: String(c.id), nombre: c.name ?? "", status: c.status ?? "", estado: c.effective_status ?? c.status ?? "",
    objetivo: c.objective ?? "", creada: c.created_time ?? null,
    presupuesto: { diario: deMenores(p.diario, moneda), total: deMenores(p.total, moneda) },
    inicio: f.inicio, fin: f.fin, insights: c.insights ?? null,
    desdeApp: registro ? {
      creadoPor: registro.creado_nombre, creadoAt: registro.created_at, activadaAt: registro.activada_at, activadaPor: registro.activada_por,
    } : null,
  };
}

async function exigirPermisos(conexion) {
  if (conexion.faltan?.length) {
    throw new ErrorAnuncios(`Faltan los permisos de anuncios (${conexion.faltan.join(", ")}). El administrador tiene que pulsar «Conceder permisos de anuncios».`, 409, { faltan: conexion.faltan });
  }
  return conexion.token();
}

export async function rutasAnuncios(req, env, { acceso, usuario, partes, metodo }) {
  try {
    return await atender(req, env, { acceso, usuario, partes, metodo });
  } catch (e) {
    if (e instanceof ErrorAnuncios) return json({ error: e.message, ...(e.datos ?? {}) }, e.estado);
    if (e instanceof ErrorEstratega || e instanceof ErrorIA) return error(e.message, e.estado ?? 502);
    if (e instanceof ErrorMeta) return error(mensajeAnuncios(e), e.transitorio ? 503 : 502, e);
    throw e;
  }
}

async function atender(req, env, { acceso, usuario, partes, metodo }) {
  const [, grupo, id, sub, subId, accion] = partes;
  const url = new URL(req.url);
  const esAdmin = usuario?.rol === "admin";

  if (grupo === "estado" && metodo === "GET") {
    const fila = metaConfigurado(env) ? await acceso.leerUno("integracion_meta", { id: acceso.ownerId }) : null;
    const permisos = fila?.permisos ? leerJSON(fila.permisos, null) : null;
    const cuentas = await acceso.leer("cuentas_anuncios", {}, "nombre asc");
    return json({
      configurado: metaConfigurado(env),
      conectado: Boolean(fila),
      permisos,
      faltan: fila ? permisosAnunciosQueFaltan(permisos) : null,
      puedeConceder: esAdmin,
      cuentas: cuentas.map(cuentaPublica),
    });
  }

  if (grupo === "cuentas" && id === "sincronizar" && metodo === "POST") {
    if (!esAdmin) return error("Sólo el administrador actualiza las cuentas publicitarias", 403);
    const conexion = await conexionMeta(env, acceso);
    const total = await sincronizarCuentasAnuncios(env, acceso, await exigirPermisos(conexion));
    difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
    return json({ ok: true, total });
  }

  if (grupo === "cuentas" && id && metodo === "PUT") {
    const cuenta = await acceso.leerUno("cuentas_anuncios", { id });
    if (!cuenta) return noEncontrado("Cuenta publicitaria");
    const { clientId = null } = (await cuerpo(req)) ?? {};
    if (clientId && !(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    // Una cuenta publicitaria por cliente: la que ocupaba el sitio queda libre.
    if (clientId) {
      for (const o of await acceso.leer("cuentas_anuncios", { client_id: clientId })) {
        if (o.id !== cuenta.id) await acceso.actualizar("cuentas_anuncios", { id: o.id }, { client_id: null, updated_at: ahora() });
      }
    }
    await acceso.actualizar("cuentas_anuncios", { id: cuenta.id }, { client_id: clientId || null, updated_at: ahora() });
    difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
    return json(cuentaPublica({ ...cuenta, client_id: clientId || null }));
  }

  // ---- El estratega: no toca Meta (no hace falta cuenta publicitaria) ----
  // El manual lo escriben quienes ven toda la agencia (admin, o editor sin clientes asignados).
  const editaAgencia = esAdmin || (usuario?.rol === "editor" && !Array.isArray(usuario?.clientes));
  if (grupo === "manual" && metodo === "GET") return json(await leerManual(acceso));
  if (grupo === "manual" && metodo === "PUT") {
    if (!editaAgencia) return error("El manual de campañas lo cambian el administrador y los editores de la agencia.", 403);
    const manual = await guardarManual(acceso, (await cuerpo(req)) ?? {});
    difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
    return json(manual);
  }
  if (grupo === "estratega" && metodo === "POST") {
    const datos = (await cuerpo(req)) ?? {};
    let cliente = null;
    if (datos.clientId) {
      cliente = await acceso.leerUno("clients", { id: datos.clientId });
      if (!cliente) return noEncontrado("Cliente");
    } else if (Array.isArray(usuario?.clientes)) {
      // Un colaborador sólo trabaja con sus clientes.
      return error("Escoge uno de tus clientes.", 403);
    }
    return json(await armarPlan(env, acceso, cliente, datos));
  }
  if (grupo === "planes" && metodo === "GET") return json(await listarPlanes(acceso, url.searchParams.get("cliente") || null));
  if (grupo === "planes" && !id && metodo === "POST") {
    const datos = (await cuerpo(req)) ?? {};
    if (datos.clienteId && !(await acceso.leerUno("clients", { id: datos.clienteId }))) return noEncontrado("Cliente");
    return json(await guardarPlan(acceso, datos, usuario), 201);
  }
  if (grupo === "planes" && id && metodo === "DELETE") return (await borrarPlan(acceso, id)) ? json({ ok: true }) : noEncontrado("Plan");

  if (grupo !== "clientes" || !id) return noEncontrado("Ruta");

  // Activar, antes de nada: el papel no depende ni del cliente ni de lo que diga Meta.
  if (sub === "campanas" && accion === "activar" && metodo === "POST" && !esAdmin) {
    return error("Sólo el administrador activa campañas: activar empieza a gastar dinero del cliente.", 403);
  }

  // ---- De un cliente ----
  const { cliente, cuenta } = await clienteYCuenta(acceso, id, { exigirCuenta: sub !== "historial" && sub !== "medios" });

  if (sub === "historial" && metodo === "GET") {
    const filas = await acceso.leer("historial_anuncios", { client_id: cliente.id }, "created_at desc", 100);
    return json(filas.map((h) => ({
      id: h.id, campanaId: h.campana_id, accion: h.accion, nombre: h.nombre, cuando: h.created_at, detalle: leerJSON(h.detalle, {}),
    })));
  }

  if (sub === "medios" && metodo === "GET") return json(await mediosDelCliente(acceso, cliente.id));

  const conexion = await conexionMeta(env, acceso);
  const token = await exigirPermisos(conexion);

  if (sub === "campanas" && !subId && metodo === "GET") {
    const { r, periodo } = rangoDe(url, cuenta);
    const [campanas, registros] = await Promise.all([
      listarCampanas(env, token, cuenta, r),
      acceso.leer("campanas_anuncios", { client_id: cliente.id }),
    ]);
    const porId = new Map(registros.map((x) => [x.campana_id, x]));
    return json({
      cuenta: cuentaPublica(cuenta), periodo,
      campanas: campanas.map((c) => campanaPublica(c, cuenta.moneda, porId.get(String(c.id)))),
    });
  }

  if (sub === "estadisticas" && metodo === "GET") {
    const { r, periodo } = rangoDe(url, cuenta);
    const { total, dias } = await estadisticasCuenta(env, token, cuenta, r);
    return json({ moneda: cuenta.moneda, periodo, total, dias });
  }

  if (sub === "campanas" && subId && !accion && metodo === "GET") {
    const c = await campanaDeLaCuenta(env, token, cuenta, subId);
    if (!c) return noEncontrado("Campaña");
    const { r, periodo } = rangoDe(url, cuenta);
    const d = await detalleCampana(env, token, c.id, r);
    return json({
      periodo,
      conjuntos: d.conjuntos.map((s) => ({
        id: String(s.id), nombre: s.name ?? "", estado: s.effective_status ?? s.status ?? "", optimizacion: s.optimization_goal ?? "",
        presupuesto: { diario: deMenores(s.daily_budget, cuenta.moneda), total: deMenores(s.lifetime_budget, cuenta.moneda) },
        inicio: s.start_time ?? "", fin: s.end_time ?? "", insights: s.insights,
      })),
      anuncios: d.anuncios.map((a) => ({
        id: String(a.id), nombre: a.name ?? "", estado: a.effective_status ?? a.status ?? "", conjuntoId: String(a.adset_id ?? ""),
        titulo: a.creative?.title ?? "", texto: a.creative?.body ?? "", boton: a.creative?.call_to_action_type ?? "",
        miniatura: miniatura(a.creative?.thumbnail_url), insights: a.insights,
      })),
      dias: d.dias,
    });
  }

  if (sub === "campanas" && !subId && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    if (!b.borrador || typeof b.borrador !== "object") return error("Falta el borrador de la campaña");
    const fila = await crearCampana(env, token, acceso, { cliente, cuenta, borrador: b.borrador, usuario });
    difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: cliente.id, por: firma(usuario, req) });
    return json({ id: fila.campana_id, nombre: fila.nombre, estado: fila.estado }, 201);
  }

  if (sub === "campanas" && subId && (accion === "activar" || accion === "pausar") && metodo === "POST") {
    const activar = accion === "activar";
    const c = await campanaDeLaCuenta(env, token, cuenta, subId);
    if (!c) return noEncontrado("Campaña");
    const p = presupuestoDe(c);
    const f = fechasDe(c);
    const resumen = resumenPresupuesto({
      diario: deMenores(p.diario, cuenta.moneda), total: deMenores(p.total, cuenta.moneda), inicio: f.inicio, fin: f.fin, moneda: cuenta.moneda,
    });
    const b = (await cuerpo(req)) ?? {};
    if (activar && b.confirmado !== true) {
      return json({
        error: "Activar gasta dinero: confirma el presupuesto y las fechas.",
        confirmar: { campana: c.name ?? "", resumen, moneda: cuenta.moneda },
      }, 409);
    }
    const registro = await acceso.leerUno("campanas_anuncios", { campana_id: String(c.id), client_id: cliente.id });
    const status = await cambiarEstado(env, token, { campanaId: String(c.id), registro, activar });
    if (registro) {
      await acceso.actualizar("campanas_anuncios", { id: registro.id }, {
        estado: status, updated_at: ahora(), ...(activar ? { activada_por: usuario.nombre ?? usuario.id, activada_at: ahora() } : {}),
      });
    }
    await apuntar(acceso, { clientId: cliente.id, campanaId: c.id, accion, usuario, detalle: { nombre: c.name ?? "", resumen } });
    difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: cliente.id, por: firma(usuario, req) });
    return json({ ok: true, estado: status });
  }

  if (sub === "ciudades" && metodo === "GET") {
    return json(await buscarCiudades(env, token, url.searchParams.get("q"), url.searchParams.get("pais") ?? ""));
  }

  if (sub === "pixeles" && metodo === "GET") return json(await pixelesDeLaCuenta(env, token, cuenta));

  if (sub === "intereses" && metodo === "GET") return json(await buscarIntereses(env, token, url.searchParams.get("q")));

  if (sub === "publicos" && metodo === "GET") return json(await publicosDeLaCuenta(env, token, cuenta));

  if (sub === "similares" && metodo === "POST") {
    const datos = (await cuerpo(req)) ?? {};
    const publico = await crearSimilar(env, token, cuenta, { origenId: datos.origenId, pais: datos.pais, porcentaje: datos.porcentaje });
    await apuntar(acceso, { clientId: cliente.id, campanaId: "", accion: "publico", usuario, detalle: { nombre: publico.nombre } });
    return json(publico, 201);
  }

  if (sub === "medio" && metodo === "POST") {
    const { clave } = (await cuerpo(req)) ?? {};
    const origen = conexion.fila.origen || url.origin;
    return json(await prepararMedio(env, token, { cuenta, clientId: cliente.id, clave, origen }), 201);
  }

  if (sub === "video" && subId && metodo === "GET") return json(await estadoVideo(env, token, subId));

  return noEncontrado("Ruta");
}
