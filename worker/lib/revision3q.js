// ============================================================
// La REVISIÓN 3Q de lo que corre en el Ads Manager de un cliente (curso de campañas, entrega 5)
//
//   GET  /api/anuncios/clientes/:c/revision            La revisión (sólo lee de Meta) y la marca «revisada»
//   POST /api/anuncios/clientes/:c/revision { conIA }  Lo mismo y, con conIA, la IA lo explica con palabras
//   PUT  /api/anuncios/clientes/:c/etapas { campanaId, etapa }   La etapa de una campaña cuyo nombre no la dice
//   GET  /api/anuncios/revision/pendientes             Mi día: los clientes con cuenta sin revisar hace 6 días o más
//   (y POST /api/anuncios/clientes/:c/diagnostico, el de antes, que es esta misma revisión con la forma de entonces)
//
// Lo puro (las 3 Q, el efecto desglose, el aprendizaje, la etapa, lo grave) es de src/lib/tresQ.js; aquí, lo que lee
// Meta y D1. La agencia MONTA las campañas en el Ads Manager: esto no escribe nada en Meta. Lo único que cambia algo
// son «Apagar» y «Subir un 20 %», que siguen en worker/rutas/anuncios.js con su confirmación y sus permisos.
//
// LO QUE SE LEE DE META, POR CUENTA Y NO POR CAMPAÑA
//
// Antes eran 2 + 4 llamadas por campaña activa (como mucho seis). Con tres ventanas eso pasaba de 40. Ahora son
// /act_…/insights con `level` (campaña, conjunto, anuncio) y una ventana por llamada —9 llamadas, las tenga la cuenta
// que tenga— más la lista de campañas, conjuntos y anuncios que están encendidos: 12 en total, dentro de las 50 del
// plan gratuito. Los campos nuevos (clics únicos y su CTR y costo, tiempo de reproducción, ThruPlays, los rankings) se
// piden y, si Meta rechaza alguno (#100), se repite sin ellos y se dice (`leidoCon`); las reproducciones de 3 s van en
// `actions` (`video_view`) y llegan siempre.
//
// EL CRON (una vez al día por cliente, al final de la cadena y sólo si la vuelta no hizo otra cosa): tres llamadas
// (las campañas con lo de ayer, los anuncios rechazados y lo de 7 días por campaña) y a la campana sólo lo GRAVE que
// no se avisó ayer. Se apunta en `anuncios_clientes.alertas` también si falló: si no, el cron lo miraría cada minuto.
//
// Nada de esto se ha probado contra Meta: los tests (tests/migracion/revision3q.test.js) usan un `fetch` de mentira.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "./respuesta.js";
import { difundir, firma } from "./vivo.js";
import { ahora, uuid } from "./ids.js";
import { graph, ErrorMeta, metaConfigurado } from "./meta.js";
import { ErrorAnuncios, conexionMeta, clienteYCuenta, mensajeAnuncios } from "./anuncios.js";
import { crearAcceso, clientesPorAlertar, NO_NULO } from "./acceso.js";
import { avisar } from "./equipo.js";
import { llamarIA } from "./cerebro/ia.js";
import { fechaEnZona, sumarDias, diasEntre } from "../../src/lib/agenda.js";
import { deMenores } from "../../src/lib/anuncios.js";
import { limpiarManual } from "../../src/lib/estratega.js";
import { limpiarNegocio, numeroMagico, costoAceptable, conLecturaMeta } from "../../src/lib/numerosNegocio.js";
import {
  revisar, q1DeCuenta, alertasGraves, comoDiagnostico, pedidoRevisionIA, limpiarEtapas, etapaDeNombre, rankingsDe,
  sumarFilas, cifras3q, agenciaDelInforme, VENTANAS, PRESET_VENTANA, ETAPAS_REVISION, DIAS_PARA_REVISAR,
} from "../../src/lib/tresQ.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const FIRMA = { userId: "sistema", nombre: "Revisión de campañas", color: "#1E90FF" };
const ID_META = /^\d{1,30}$/;
const miniatura = (u) => (u ? `/api/metricas/miniatura?u=${encodeURIComponent(u)}` : "");

// ------------------------------------------------------------
// La fila del cliente (números, etapas, cuándo se revisó, lo grave)
// ------------------------------------------------------------

/** La fila de `anuncios_clientes` del cliente, o null. */
const filaDelCliente = (acceso, clientId) => acceso.leerUno("anuncios_clientes", { client_id: clientId });

/** Cambia unas columnas de la fila del cliente (sólo esas: no pisa el informe ni los números); la crea si no hay. */
async function escribirFila(acceso, clientId, previa, cambios) {
  const t = ahora();
  if (previa) await acceso.actualizar("anuncios_clientes", { id: previa.id }, { ...cambios, updated_at: t });
  else await acceso.insertar("anuncios_clientes", { id: uuid(), client_id: clientId, ...cambios, created_at: t, updated_at: t });
}

/** El Manual de campañas del espacio, limpio (los umbrales 3Q y la tasa de cierre por defecto). */
async function manualDe(acceso) {
  const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
  return limpiarManual(leerJSON(fila?.manual_campanas, {}));
}

/**
 * El número mágico del cliente como lo usa la revisión: el de conversación y el de compra, cada uno con su objetivo y
 * su equilibrio (los mismos de Marca → Números del negocio). `gasto`: lo gastado en 30 días, que hace de presupuesto
 * del mes si nadie lo escribió (como la ficha). Pura salvo la lectura.
 */
export function numerosDe(negocioGuardado, { tasaDefecto, gasto = 0 } = {}) {
  const negocio = conLecturaMeta(limpiarNegocio(negocioGuardado), gasto > 0 ? { gasto } : null);
  const m = numeroMagico(negocio, { objetivoCampana: "mensajes", tasaDefecto });
  const v = numeroMagico(negocio, { objetivoCampana: "ventas", tasaDefecto });
  const aceptable = costoAceptable(negocio, { tasaDefecto });
  const web = negocio.destino === "web";
  return {
    destino: negocio.destino,
    numeros: {
      conversacion: { objetivo: m.objetivo, equilibrio: m.equilibrio },
      compra: { objetivo: v.alterna?.objetivo ?? null, equilibrio: v.alterna?.equilibrio ?? null, roasObjetivo: v.objetivo, roasEquilibrio: v.equilibrio },
    },
    numero: {
      destino: negocio.destino,
      metrica: web ? "Costo por compra" : "Costo por conversación",
      objetivo: web ? v.alterna?.objetivo ?? null : m.objetivo,
      equilibrio: web ? v.alterna?.equilibrio ?? null : m.equilibrio,
      tasaCierre: m.tasaCierre,
      faltan: m.faltan,
      alarma: web ? v.alarma : m.alarma,
      textoAlarma: web ? v.textoAlarma : m.textoAlarma,
      aceptable,
    },
  };
}

// ------------------------------------------------------------
// Leer de Meta
// ------------------------------------------------------------

/** Lo que está ENCENDIDO (en marcha, en revisión o rechazado), no lo pausado ni lo archivado. */
const ENCENDIDO = JSON.stringify(["ACTIVE", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "IN_PROCESS", "WITH_ISSUES", "PENDING_BILLING_INFO"]);
const CAMPOS_CAMPANA = "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time";
const CAMPOS_CONJUNTO = "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,created_time,updated_time";
const CAMPOS_ANUNCIO = "id,name,campaign_id,adset_id,status,effective_status,created_time,updated_time,creative{thumbnail_url,title}";

/** Los de siempre (como el diagnóstico de antes), los nuevos del curso y los rankings (sólo por anuncio). */
const BASICOS = ["spend", "impressions", "reach", "frequency", "cpm", "cpc", "ctr", "clicks", "actions"];
export const CAMPOS_NUEVOS_3Q = Object.freeze([
  "unique_inline_link_clicks", "unique_inline_link_click_ctr", "cost_per_unique_inline_link_click",
  "video_avg_time_watched_actions", "video_thruplay_watched_actions",
]);
const RANKINGS = ["quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking"];
const IDS = { campaign: ["campaign_id"], adset: ["campaign_id", "adset_id"], ad: ["campaign_id", "adset_id", "ad_id"] };
const ESCALERA = { campaign: [CAMPOS_NUEVOS_3Q, []], adset: [CAMPOS_NUEVOS_3Q, []], ad: [[...CAMPOS_NUEVOS_3Q, ...RANKINGS], CAMPOS_NUEVOS_3Q, []] };

const rechazoDeCampo = (e) => e instanceof ErrorMeta && e.codigo === 100;

/** Una lista de lo encendido de la cuenta. Si Meta rechaza algo (#100), otra vez sin el filtro y sin `extra`. */
async function listaEncendida(env, token, ruta, campos, extra = "") {
  const params = { fields: extra ? `${campos},${extra}` : campos, limit: 200, effective_status: ENCENDIDO };
  try {
    return (await graph(env, token, ruta, { params }))?.data ?? [];
  } catch (e) {
    if (!rechazoDeCampo(e)) throw e;
    return (await graph(env, token, ruta, { params: { fields: campos, limit: 200 } }))?.data ?? [];
  }
}

/**
 * Las filas de /insights de la cuenta a un nivel y en una ventana. Baja por la escalera de campos si Meta rechaza
 * alguno (#100) y se acuerda del escalón (`estado`) para no repetir el fallo en las otras ventanas.
 */
async function insightsDe(env, token, act, nivel, ventana, estado) {
  const escalera = ESCALERA[nivel];
  for (let i = estado[nivel] ?? 0; i < escalera.length; i++) {
    try {
      const r = await graph(env, token, `/${act}/insights`, {
        params: { level: nivel, date_preset: PRESET_VENTANA[ventana], fields: [...IDS[nivel], ...BASICOS, ...escalera[i]].join(","), limit: 500 },
      });
      estado[nivel] = i;
      if (r?.paging?.next) estado.recortado = true;
      return r?.data ?? [];
    } catch (e) {
      if (!rechazoDeCampo(e) || i === escalera.length - 1) throw e;
    }
  }
  return [];
}

/**
 * Lo que necesita la revisión de una cuenta: lo encendido (campañas, conjuntos y anuncios) y sus cifras por nivel en
 * 30, 14 y 7 días. 12 llamadas (más una por escalón si Meta rechaza un campo). → { campanas, conjuntos, anuncios,
 * filas: { campaign: { 30, 14, 7 }, adset, ad }, leidoCon, recortado }
 */
export async function leerCuenta(env, token, cuenta) {
  const act = cuenta.externo_id;
  const estado = {};
  const porNivel = async (nivel) => {
    const de30 = await insightsDe(env, token, act, nivel, 30, estado);
    const [de14, de7] = await Promise.all([14, 7].map((w) => insightsDe(env, token, act, nivel, w, estado)));
    return { 30: de30, 14: de14, 7: de7 };
  };
  const [campanas, conjuntos, anuncios, fc, fs, fa] = await Promise.all([
    listaEncendida(env, token, `/${act}/campaigns`, CAMPOS_CAMPANA),
    listaEncendida(env, token, `/${act}/adsets`, CAMPOS_CONJUNTO, "learning_stage_info"),
    listaEncendida(env, token, `/${act}/ads`, CAMPOS_ANUNCIO),
    porNivel("campaign"), porNivel("adset"), porNivel("ad"),
  ]);
  const leidoCon = estado.campaign === 1 || estado.adset === 1 || estado.ad === 2 ? "basico" : estado.ad === 1 ? "sin-rankings" : "completo";
  return { campanas, conjuntos, anuncios, filas: { campaign: fc, adset: fs, ad: fa }, leidoCon, recortado: Boolean(estado.recortado) };
}

const encendido = (x) => String(x?.status ?? "").toUpperCase() === "ACTIVE";
const porCampo = (filas, campo) => new Map((filas ?? []).filter((f) => f?.[campo]).map((f) => [String(f[campo]), f]));
const ventanasDe = (mapas, id) => Object.fromEntries(VENTANAS.map((w) => [w, mapas[w].get(String(id)) ?? null]));

/** Lo leído de Meta con la forma que pide `revisar()` (src/lib/tresQ.js): las campañas encendidas con lo suyo. */
export function campanasParaRevisar(meta, cuenta, etapas = {}) {
  const mapa = (nivel, campo) => Object.fromEntries(VENTANAS.map((w) => [w, porCampo(meta.filas[nivel][w], campo)]));
  const mc = mapa("campaign", "campaign_id");
  const ms = mapa("adset", "adset_id");
  const ma = mapa("ad", "ad_id");
  const moneda = cuenta.moneda;
  return (meta.campanas ?? []).filter(encendido).slice(0, 25).map((c) => {
    const id = String(c.id);
    const nombre = c.name ?? "";
    const delNombre = etapaDeNombre(nombre);
    const manual = limpiarEtapas(etapas)[id];
    return {
      id, nombre, objetivo: c.objective ?? "", estado: c.effective_status ?? c.status ?? "", status: c.status ?? "",
      presupuestoDiario: deMenores(c.daily_budget, moneda), presupuestoTotal: deMenores(c.lifetime_budget, moneda),
      creada: c.created_time ?? "", actualizada: c.updated_time ?? "",
      etapa: delNombre || manual || "", etapaDe: delNombre ? "nombre" : manual ? "manual" : "",
      i: ventanasDe(mc, id),
      conjuntos: (meta.conjuntos ?? []).filter((s) => String(s.campaign_id) === id).slice(0, 20).map((s) => ({
        id: String(s.id), nombre: s.name ?? "", estado: s.effective_status ?? s.status ?? "", status: s.status ?? "",
        presupuestoDiario: deMenores(s.daily_budget, moneda), optimizacion: s.optimization_goal ?? "",
        aprendizaje: s.learning_stage_info?.status ?? "", creada: s.created_time ?? "", actualizada: s.updated_time ?? "",
        i: ventanasDe(ms, s.id),
      })),
      anuncios: (meta.anuncios ?? []).filter((a) => String(a.campaign_id) === id).slice(0, 40).map((a) => {
        const i = ventanasDe(ma, a.id);
        return {
          id: String(a.id), nombre: a.name ?? "", conjuntoId: String(a.adset_id ?? ""), estado: a.effective_status ?? a.status ?? "", status: a.status ?? "",
          creada: a.created_time ?? "", actualizada: a.updated_time ?? "",
          titulo: a.creative?.title ?? "", miniatura: miniatura(a.creative?.thumbnail_url),
          rankings: rankingsDe(i[7] ?? i[30]), i,
        };
      }),
    };
  });
}

/** Lo que se cambió desde la aplicación en los últimos días (pausar, presupuesto…): id → fecha. */
async function cambiosDesdeLaApp(acceso, clientId, hoy) {
  const desde = sumarDias(hoy, -15);
  const filas = await acceso.leer("historial_anuncios", { client_id: clientId }, "created_at desc", 200);
  const salida = {};
  for (const h of filas) {
    const f = fechaEnZona(new Date(h.created_at));
    if (f < desde || !h.campana_id) continue;
    if (!salida[h.campana_id] || salida[h.campana_id] < f) salida[h.campana_id] = f;
  }
  return salida;
}

// ------------------------------------------------------------
// La revisión de un cliente
// ------------------------------------------------------------

/**
 * La revisión 3Q de un cliente, entera. `marcar`: apunta que alguien la abrió (Mi día deja de pedirla). `costoMax`:
 * lo que alguien teclee para probar (el diagnóstico de antes); si no, el número mágico. `conIA`: la explicación.
 */
export async function revisionDelCliente(env, acceso, clientId, { marcar = false, costoMax = 0, conIA = false, hoy = fechaEnZona(new Date()) } = {}) {
  const { cliente, cuenta } = await clienteYCuenta(acceso, clientId);
  const conexion = await conexionMeta(env, acceso);
  if (conexion.faltan?.length) {
    throw new ErrorAnuncios(`Faltan los permisos de anuncios (${conexion.faltan.join(", ")}). El administrador tiene que pulsar «Conceder permisos de anuncios».`, 409, { faltan: conexion.faltan });
  }
  const token = await conexion.token();
  const [fila, manual, cambios, meta] = await Promise.all([
    filaDelCliente(acceso, cliente.id), manualDe(acceso), cambiosDesdeLaApp(acceso, cliente.id, hoy), leerCuenta(env, token, cuenta),
  ]);
  const etapas = limpiarEtapas(leerJSON(fila?.etapas, {}));
  const gasto30 = cifras3q(sumarFilas(meta.filas.campaign[30]))?.gasto ?? 0;
  const { destino, numeros, numero } = numerosDe(leerJSON(fila?.negocio, {}), { tasaDefecto: manual.tasaCierre, gasto: gasto30 });
  const escrito = Number(costoMax) > 0 ? Number(costoMax) : 0;
  const r = revisar(campanasParaRevisar(meta, cuenta, etapas), {
    numeros, umbrales: manual.umbrales3q, moneda: cuenta.moneda, hoy, cambios, cuenta: cuenta.externo_id, destino, costoMax: escrito,
  });
  const salida = {
    cliente: { id: cliente.id, nombre: cliente.name ?? "" },
    cuenta: { nombre: cuenta.nombre, externoId: cuenta.externo_id, moneda: cuenta.moneda, zona: cuenta.zona_horaria },
    hoy,
    numero,
    numeros,
    q1Cuenta: q1DeCuenta(meta.filas.campaign, { destino, numeros }),
    ...r,
    etapas: ETAPAS_REVISION,
    revisadaAntes: fila?.revisada_at ?? null,
    leidoCon: meta.leidoCon,
    recortado: meta.recortado,
    avisoLectura: meta.leidoCon === "basico"
      ? "Meta no dio las métricas nuevas (clics únicos, tiempo de reproducción): la Q2 va con las de siempre."
      : meta.leidoCon === "sin-rankings" ? "Meta no dio los rankings de calidad de los anuncios." : "",
    // Lo de antes (el diagnóstico): lo aceptable y de dónde salió.
    costoMax: escrito || numero.aceptable?.valor || 0,
    origenCosto: escrito ? "escrito" : numero.aceptable ? "numero-magico" : "promedio",
    explicacion: "",
    avisoIA: null,
  };
  if (conIA) {
    try {
      const ia = await llamarIA(env, acceso, cliente, { prompt: pedidoRevisionIA({ marca: cliente.name, revision: salida }), salida: 1500, funcion: "diagnóstico de campañas" });
      salida.explicacion = String(ia.texto ?? "").trim().slice(0, 3000);
    } catch (e) {
      // La explicación es un extra: sin ella, la revisión sigue valiendo.
      salida.avisoIA = e.message;
    }
  }
  if (marcar) await escribirFila(acceso, cliente.id, fila, { revisada_at: ahora() });
  return salida;
}

/** Para Mi día: los clientes con cuenta publicitaria cuya última revisión tiene 6 días o más (o nunca). Dos lecturas. */
export async function pendientesDeRevisar(acceso, { hoy = fechaEnZona(new Date()) } = {}) {
  const cuentas = await acceso.leerColumnas("cuentas_anuncios", ["client_id"], { client_id: NO_NULO }, "created_at asc");
  const ids = [...new Set(cuentas.map((c) => c.client_id).filter(Boolean))];
  if (!ids.length) return [];
  const filas = await acceso.leerVarios("anuncios_clientes", ["client_id", "revisada_at"], "client_id", ids);
  const cuando = new Map(filas.map((f) => [f.client_id, f.revisada_at]));
  return ids
    .map((id) => {
      const r = cuando.get(id) ?? null;
      return { clientId: id, revisadaAt: r, dias: r ? diasEntre(fechaEnZona(new Date(r)), hoy) : null };
    })
    .filter((p) => p.dias === null || p.dias >= DIAS_PARA_REVISAR);
}

/**
 * Lo que ve SÓLO la agencia en el informe de anuncios de un mes: el % de mensajes, el CTR único y el número mágico
 * frente al costo real (src/lib/tresQ.js, `agenciaDelInforme`). `total`: la fila del mes de la cuenta. null sin ella.
 */
export async function agenciaDelMes(acceso, clientId, total) {
  if (!total) return null;
  const [fila, manual] = await Promise.all([filaDelCliente(acceso, clientId), manualDe(acceso)]);
  const { destino, numeros } = numerosDe(leerJSON(fila?.negocio, {}), { tasaDefecto: manual.tasaCierre, gasto: Number(total.spend) || 0 });
  return agenciaDelInforme(total, { numeros, destino, umbrales: manual.umbrales3q });
}

// ------------------------------------------------------------
// Las rutas (las despacha worker/rutas/anuncios.js)
// ------------------------------------------------------------

/** GET|POST /clientes/:c/revision y PUT /clientes/:c/etapas. */
export async function rutasRevision(req, env, { acceso, usuario, clientId, sub, metodo }) {
  if (sub === "etapas" && metodo === "PUT") {
    const { cliente } = await clienteYCuenta(acceso, clientId, { exigirCuenta: false });
    const b = (await cuerpo(req)) ?? {};
    const campanaId = String(b.campanaId ?? "");
    const etapa = String(b.etapa ?? "");
    if (!ID_META.test(campanaId)) return error("Falta la campaña.");
    if (etapa && !ETAPAS_REVISION.some((e) => e.id === etapa)) return error("Esa etapa no existe.");
    const fila = await filaDelCliente(acceso, cliente.id);
    const etapas = limpiarEtapas(leerJSON(fila?.etapas, {}));
    if (etapa) etapas[campanaId] = etapa;
    else delete etapas[campanaId];
    await escribirFila(acceso, cliente.id, fila, { etapas: JSON.stringify(etapas) });
    difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: cliente.id, por: firma(usuario, req) });
    return json({ etapas });
  }
  if (sub === "revision" && (metodo === "GET" || metodo === "POST")) {
    const b = metodo === "POST" ? ((await cuerpo(req)) ?? {}) : {};
    // Quien sólo mira (sólo lectura) la ve, pero no cuenta como revisada: no es quien la puede cambiar.
    const r = await revisionDelCliente(env, acceso, clientId, { marcar: !usuario?.soloLectura, conIA: b.conIA === true, costoMax: b.costoMax });
    return json(r);
  }
  return noEncontrado("Ruta");
}

/** POST /clientes/:c/diagnostico: la revisión con la forma del diagnóstico de antes (hallazgos y su resumen). */
export async function rutaDiagnostico(req, env, { acceso, usuario, clientId }) {
  const b = (await cuerpo(req)) ?? {};
  const r = await revisionDelCliente(env, acceso, clientId, { marcar: !usuario?.soloLectura, conIA: b.conIA === true, costoMax: b.costoMax });
  return json({ ...comoDiagnostico(r), moneda: r.cuenta.moneda, costoMax: r.costoMax, origenCosto: r.origenCosto, explicacion: r.explicacion, avisoIA: r.avisoIA, revision: r });
}

/** GET /revision/pendientes (Mi día): `{ pendientes: [{ clientId, revisadaAt, dias }] }`. Los nombres los pone la pantalla. */
export async function rutasRevisionGlobal(req, env, { acceso, accion, metodo }) {
  if (accion === "pendientes" && metodo === "GET") return json({ pendientes: await pendientesDeRevisar(acceso), cada: DIAS_PARA_REVISAR });
  return noEncontrado("Ruta");
}

// ------------------------------------------------------------
// El cron: lo GRAVE de un cliente, una vez al día
// ------------------------------------------------------------

/** A quién le llega lo grave de un cliente: el equipo que lo ve (no quien sólo mira). */
async function destinatarios(acceso, clientId) {
  const miembros = await acceso.leer("memberships", {}, "created_at asc");
  return miembros
    .filter((m) => !m.solo_lectura)
    .filter((m) => {
      const lista = leerJSON(m.clientes, null);
      return !Array.isArray(lista) || lista.map(String).includes(String(clientId));
    })
    .map((m) => m.user_id);
}

/**
 * Lo grave de UN cliente: tres lecturas de Meta (las campañas con lo de ayer, los anuncios rechazados y lo de 7 días
 * por campaña), lo nuevo a la campana y el apunte en `alertas`. → cuántos avisos.
 */
export async function alertasDelCliente(env, acceso, clientId, { hoy = fechaEnZona(new Date()) } = {}) {
  const fila = await filaDelCliente(acceso, clientId);
  const previas = leerJSON(fila?.alertas, {});
  const apuntar = (datos) => escribirFila(acceso, clientId, fila, { alertas: JSON.stringify({ fecha: hoy, ...datos }) });
  try {
    const { cliente, cuenta } = await clienteYCuenta(acceso, clientId);
    const conexion = await conexionMeta(env, acceso);
    if (conexion.faltan?.length) {
      await apuntar({ claves: [], error: "Faltan los permisos de anuncios." });
      return 0;
    }
    const token = await conexion.token();
    const act = cuenta.externo_id;
    const [campanas, anuncios, semana, manual] = await Promise.all([
      graph(env, token, `/${act}/campaigns`, { params: { fields: "id,name,status,effective_status,objective,created_time,insights.date_preset(yesterday){spend}", limit: 200, effective_status: ENCENDIDO } }),
      graph(env, token, `/${act}/ads`, { params: { fields: "id,name,campaign_id,adset_id,status,effective_status", limit: 200, effective_status: JSON.stringify(["DISAPPROVED", "WITH_ISSUES"]) } }),
      graph(env, token, `/${act}/insights`, { params: { level: "campaign", date_preset: "last_7d", fields: "campaign_id,campaign_name,spend,actions", limit: 500 } }),
      manualDe(acceso),
    ]);
    const { destino, numero } = numerosDe(leerJSON(fila?.negocio, {}), { tasaDefecto: manual.tasaCierre });
    const graves = alertasGraves({
      campanas: (campanas?.data ?? []).map((c) => ({ ...c, ayer: c.insights?.data?.[0]?.spend ?? 0 })),
      anuncios: anuncios?.data ?? [],
      semana: semana?.data ?? [],
      numero: numero.objetivo ?? numero.equilibrio ?? 0,
      destino, hoy, nombre: cliente.name ?? "", moneda: cuenta.moneda, umbrales: manual.umbrales3q,
    });
    // Lo que ya se avisó la última vez no se repite cada día: sigue en la revisión.
    const yaAvisadas = new Set(Array.isArray(previas.claves) ? previas.claves : []);
    const nuevas = graves.filter((g) => !yaAvisadas.has(g.clave));
    let avisados = 0;
    if (nuevas.length) {
      const para = await destinatarios(acceso, clientId);
      const enlace = `/cliente/${encodeURIComponent(clientId)}/resultados/anuncios`;
      for (const g of nuevas.slice(0, 5)) avisados += await avisar(env, acceso, { para, tipo: "campanas", texto: g.texto, enlace, por: FIRMA });
    }
    await apuntar({ claves: graves.map((g) => g.clave).slice(0, 100), avisos: nuevas.length });
    return avisados;
  } catch (e) {
    if (!(e instanceof ErrorAnuncios || e instanceof ErrorMeta)) console.error("revisión 3Q, cron:", clientId, e);
    await apuntar({ claves: Array.isArray(previas.claves) ? previas.claves : [], error: String(e instanceof ErrorMeta || e instanceof ErrorAnuncios ? mensajeAnuncios(e) : e?.message ?? e).slice(0, 300) }).catch(() => {});
    return 0;
  }
}

/**
 * El paso del cron: desde las 7:00 de Panamá, el cliente con cuenta publicitaria más atrasado en su repaso de hoy.
 * Uno por vuelta. → 1 si hizo algo, 0 si no había nada.
 */
export async function revision3qPendiente(env, momento = new Date()) {
  if (!metaConfigurado(env)) return 0;
  const horaPanama = (momento.getUTCHours() + 19) % 24;
  if (horaPanama < 7) return 0;
  const hoy = fechaEnZona(momento);
  const [siguiente] = await clientesPorAlertar(env.DB, hoy, 1);
  if (!siguiente) return 0;
  await alertasDelCliente(env, crearAcceso(env.DB, siguiente.owner_id), siguiente.client_id, { hoy });
  return 1;
}
