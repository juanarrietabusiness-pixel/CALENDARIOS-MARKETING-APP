// ============================================================
// Los NÚMEROS DEL NEGOCIO de un cliente: leer, guardar, lo que sabe Meta y lo que propone la IA
//
//   GET  /api/anuncios/clientes/:c/negocio[?meta=0]   Lo guardado, la tasa del Manual y lo de Meta en 30 días
//   PUT  /api/anuncios/clientes/:c/negocio { negocio, antes }   Guardar (409 si otra persona guardó entremedias)
//   POST /api/anuncios/clientes/:c/negocio/proponer { negocio }  La IA PROPONE lo que falta; no guarda nada
//
// Las cuentas (objetivo, equilibrio, simulador, número mágico) son de src/lib/numerosNegocio.js: aquí sólo se
// lee y se escribe. Va en `anuncios_clientes.negocio` (0069), la fila de lo que decide la agencia de los anuncios
// de un cliente; se escribe con `actualizar` y no con `guardar`, que reescribiría las columnas del informe.
//
// LO QUE SABE META: una llamada a /act_…/insights con los últimos 30 días (gasto, CPM, frecuencia, clics únicos
// en el enlace y su CTR, clics salientes, visitas, conversaciones, compras y su valor), sólo lectura, para prellenar
// el presupuesto y el simulador con origen «meta». Si Meta rechaza un campo (#100), otra llamada con los de
// siempre. Si no hay cuenta, permisos o conexión, la ficha se abre igual y dice por qué no hay cifras de Meta.
//
// LA IA PROPONE, NO GUARDA: el ticket (desde los precios del catálogo), los costos variables, las devoluciones y el
// % a invertir, cada uno «estimado» con su explicación. Lee el cerebro con lo interno (`para: "chat"`): los costos y
// los márgenes están ahí, y esto sólo lo ve la agencia. Lo ya confirmado no se le pide.
//
// Nada de esto se ha probado contra Meta ni contra la IA reales: los tests usan un `fetch` de mentira.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "./respuesta.js";
import { difundir, firma } from "./vivo.js";
import { ahora, uuid } from "./ids.js";
import { graph, ErrorMeta, metaConfigurado } from "./meta.js";
import { ErrorAnuncios, conexionMeta, clienteYCuenta, mensajeAnuncios } from "./anuncios.js";
import { leerMercado } from "./mercado.js";
import { contexto as contextoCerebro } from "./cerebro/cerebro.js";
import { llamarIA, ErrorIA } from "./cerebro/ia.js";
import { limpiarManual } from "../../src/lib/estratega.js";
import { repartoDelCliente } from "../../src/lib/manualCiclo.js";
import { ACCION_MENSAJE } from "../../src/lib/anuncios.js";
import { productosActivos, catalogoATexto } from "../../src/lib/estudioMercado.js";
import {
  limpiarNegocio, costoAceptable, equilibrio, pedidoPropuesta, leerPropuesta, ticketDelCatalogo, queFaltaProponer, numeroMagicoDelCliente,
} from "../../src/lib/numerosNegocio.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const num = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
const r2 = (n) => Math.round(n * 100) / 100;

// ------------------------------------------------------------
// Leer y guardar
// ------------------------------------------------------------

/** Los números guardados del cliente, limpios (vacíos si no hay fila). */
export async function leerNegocio(acceso, clientId) {
  const f = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  return limpiarNegocio(leerJSON(f?.negocio, {}));
}

/** El Manual de campañas del espacio, limpio. */
async function manualDelEspacio(acceso) {
  const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
  return limpiarManual(leerJSON(fila?.manual_campanas, {}));
}

/** La tasa de cierre por defecto del espacio: la del Manual de campañas (la del curso si nadie la cambió). */
export async function tasaDelManual(acceso) {
  return (await manualDelEspacio(acceso)).tasaCierre;
}

/** Guarda los números (limpios) con quién y cuándo. Sólo toca la columna `negocio` de la fila del cliente. */
export async function guardarNegocio(acceso, clientId, entrada, usuario) {
  const t = ahora();
  const negocio = { ...limpiarNegocio(entrada), actualizado: t };
  const por = String(usuario?.nombre ?? "").slice(0, 80);
  if (por) negocio.por = por;
  else delete negocio.por;
  const previa = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  if (previa) await acceso.actualizar("anuncios_clientes", { id: previa.id }, { negocio: JSON.stringify(negocio), updated_at: t });
  else await acceso.insertar("anuncios_clientes", { id: uuid(), client_id: clientId, negocio: JSON.stringify(negocio), created_at: t, updated_at: t });
  return negocio;
}

/** Lo aceptable por resultado que usa el diagnóstico si nadie teclea otro (el número mágico guardado), o null. */
export async function costoAceptableDelCliente(acceso, clientId) {
  const [negocio, tasaDefecto] = await Promise.all([leerNegocio(acceso, clientId), tasaDelManual(acceso)]);
  return costoAceptable(negocio, { tasaDefecto });
}

/**
 * Lo que el estratega toma de los números del negocio: el ticket (si el producto no tiene precio), el margen
 * efectivo en % (si hay costos escritos), la tasa de cierre (si se escribió o se midió) y EL número mágico del cliente
 * (`magico`, de `numeroMagicoDelCliente`: la misma cifra de la ficha y la revisión). Cada uno null si no está.
 */
export async function numerosParaEstratega(acceso, clientId) {
  const [n, tasaDefecto] = await Promise.all([leerNegocio(acceso, clientId), tasaDelManual(acceso)]);
  const e = equilibrio(n, { tasaDefecto });
  const margen = n.costos.length && e.margenEfectivo > 0 ? r2(e.margenEfectivo) : null;
  // Por conversación (WhatsApp) y por compra (web): el estratega escoge el de su destino.
  const magico = numeroMagicoDelCliente(n, { tasaDefecto, objetivoCampana: "mensajes" });
  const magicoWeb = numeroMagicoDelCliente(n, { tasaDefecto, objetivoCampana: "ventas" });
  return {
    ticket: n.ticket?.valor ?? null, margen, tasaCierre: n.tasaCierre?.valor > 0 ? n.tasaCierre.valor : null,
    magico: magico.valor > 0 ? magico : null, magicoWeb: magicoWeb.valor > 0 ? magicoWeb : null,
  };
}

// ------------------------------------------------------------
// Lo que sabe Meta de la cuenta (30 días)
// ------------------------------------------------------------

/** Los campos de la lectura. `unique_inline_link_*` es el «clic único en el enlace» del Administrador de anuncios. */
export const CAMPOS_LECTURA = [
  "spend", "impressions", "reach", "frequency", "cpm",
  "unique_inline_link_clicks", "unique_inline_link_click_ctr", "cost_per_unique_inline_link_click",
  "outbound_clicks", "outbound_clicks_ctr", "actions", "action_values", "video_thruplay_watched_actions",
].join(",");
/** Si Meta rechaza alguno de los de arriba (#100), éstos son los de siempre. */
const CAMPOS_LECTURA_BASICOS = "spend,impressions,reach,frequency,cpm,actions,action_values";

const TIPOS_COMPRA = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const TIPOS_CLIENTE = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const TIPOS_VISITA = ["landing_page_view", "omni_landing_page_view"];

/** El primero de los tipos que aparezca, por orden de preferencia (Meta repite la compra con varios nombres). */
function accion(lista, tipos) {
  const l = Array.isArray(lista) ? lista : [];
  for (const t of tipos) {
    const a = l.find((x) => x?.action_type === t);
    if (a) return num(a.value);
  }
  return 0;
}
/** Un campo que Meta da como lista de acciones (`outbound_clicks`, `video_thruplay_watched_actions`): la suma. */
const suma = (lista) => (Array.isArray(lista) ? lista.reduce((s, a) => s + num(a?.value), 0) : num(lista));
const porCiento = (a, b) => (b > 0 ? (a / b) * 100 : null);
const entre = (a, b) => (b > 0 ? a / b : null);

/**
 * Una fila de /insights de la cuenta como la leen las calculadoras: cada métrica en su unidad (los % de 0 a 100) y
 * los porcentajes de paso que pide el simulador: % de mensajes = conversaciones ÷ clics únicos; % de visitas =
 * visitas ÷ clics salientes; % de compras = compras ÷ visitas. Lo que no llegó, null. Pura.
 */
export function lecturaDeInsights(fila, { moneda = "USD", dias = 30 } = {}) {
  if (!fila || typeof fila !== "object") return null;
  const gasto = num(fila.spend);
  const impresiones = num(fila.impressions);
  const alcance = num(fila.reach);
  const clicsUnicos = num(fila.unique_inline_link_clicks);
  const clicsSalientes = suma(fila.outbound_clicks);
  const visitas = accion(fila.actions, TIPOS_VISITA);
  const conversaciones = accion(fila.actions, [ACCION_MENSAJE]);
  const clientes = accion(fila.actions, TIPOS_CLIENTE);
  const compras = accion(fila.actions, TIPOS_COMPRA);
  const valorCompras = accion(fila.action_values, TIPOS_COMPRA);
  const thruplays = suma(fila.video_thruplay_watched_actions);
  const ctrSalienteMeta = Array.isArray(fila.outbound_clicks_ctr) ? suma(fila.outbound_clicks_ctr) : null;
  return {
    dias, moneda, desde: fila.date_start ?? null, hasta: fila.date_stop ?? null,
    gasto, impresiones, alcance,
    frecuencia: num(fila.frequency) || (alcance ? r2(impresiones / alcance) : null),
    cpm: fila.cpm != null ? num(fila.cpm) : impresiones ? (gasto / impresiones) * 1000 : null,
    clicsUnicos,
    ctrUnico: fila.unique_inline_link_click_ctr != null ? num(fila.unique_inline_link_click_ctr) : porCiento(clicsUnicos, alcance),
    costoClicUnico: num(fila.cost_per_unique_inline_link_click) || entre(gasto, clicsUnicos),
    clicsSalientes,
    ctrSaliente: ctrSalienteMeta || porCiento(clicsSalientes, impresiones),
    visitas,
    pctVisitas: porCiento(visitas, clicsSalientes),
    conversaciones,
    pctMensajes: porCiento(conversaciones, clicsUnicos),
    costoConversacion: entre(gasto, conversaciones),
    clientes,
    pctClientes: porCiento(clientes, clicsUnicos),
    pctClientesWeb: porCiento(clientes, visitas),
    costoCliente: entre(gasto, clientes),
    compras,
    valorCompras,
    pctCompras: porCiento(compras, visitas),
    costoCompra: entre(gasto, compras),
    roas: valorCompras ? entre(valorCompras, gasto) : null,
    thruplays,
    costoThruplay: entre(gasto, thruplays),
  };
}

const OBJETIVOS_MENSAJES = new Set(["OUTCOME_ENGAGEMENT", "OUTCOME_SALES", "MESSAGES", "POST_ENGAGEMENT", "CONVERSIONS"]);

/**
 * De las filas de /insights por campaña (con `objective`), el gasto y las conversaciones SÓLO de las que buscan
 * mensajes, y su costo por conversación. null si ninguna fila dice su objetivo (no se sabe cuáles son) o si todas son
 * de mensajes (sale lo mismo que la cuenta). Pura.
 */
export function costoDeMensajes(filas = []) {
  const conObjetivo = (Array.isArray(filas) ? filas : []).filter((f) => f?.objective);
  if (!conObjetivo.length) return null;
  const deMensajes = conObjetivo.filter((f) => OBJETIVOS_MENSAJES.has(String(f.objective).toUpperCase()));
  if (deMensajes.length === conObjetivo.length) return null;
  const gasto = deMensajes.reduce((s, f) => s + num(f.spend), 0);
  const conv = deMensajes.reduce((s, f) => s + accion(f.actions, [ACCION_MENSAJE]), 0);
  return { gastoMensajes: r2(gasto), conversacionesMensajes: conv, costoConversacion: conv > 0 ? gasto / conv : null };
}

/** Lo de Meta en 30 días, o por qué no hay: { lectura, aviso }. Nunca tumba la ficha. */
export async function lecturaMeta(env, acceso, cuenta) {
  if (!cuenta) return { lectura: null, aviso: "Sin cuenta publicitaria asignada: no hay cifras de Meta. Se asigna en Anuncios." };
  if (!metaConfigurado(env)) return { lectura: null, aviso: "Meta no está configurado en el servidor." };
  try {
    const conexion = await conexionMeta(env, acceso);
    if (conexion.faltan?.length) return { lectura: null, aviso: `Faltan los permisos de anuncios (${conexion.faltan.join(", ")}): el administrador los concede en Anuncios.` };
    const token = await conexion.token();
    const ruta = `/${cuenta.externo_id}/insights`;
    let datos;
    try {
      datos = await graph(env, token, ruta, { params: { fields: CAMPOS_LECTURA, date_preset: "last_30d" } });
    } catch (e) {
      // Un campo que Meta ya no acepta no deja sin cifras: los de siempre.
      if (!(e instanceof ErrorMeta) || e.codigo !== 100) throw e;
      datos = await graph(env, token, ruta, { params: { fields: CAMPOS_LECTURA_BASICOS, date_preset: "last_30d" } });
    }
    const fila = datos?.data?.[0] ?? null;
    if (!fila) return { lectura: null, aviso: "La cuenta no gastó nada en los últimos 30 días." };
    const lectura = lecturaDeInsights(fila, { moneda: cuenta.moneda });
    // El costo por conversación «real» sólo de las campañas que buscan mensajes (Interacción o Ventas): una de tráfico o
    // de alcance gasta sin buscar conversaciones y las encarecía de mentira. Una llamada más, por campaña; si falla, el
    // de la cuenta entera.
    try {
      const porCampana = (await graph(env, token, ruta, { params: { level: "campaign", fields: "campaign_id,objective,spend,actions", date_preset: "last_30d", limit: 200 } }))?.data ?? [];
      Object.assign(lectura, costoDeMensajes(porCampana) ?? {});
    } catch (e) {
      if (!(e instanceof ErrorMeta)) throw e;
    }
    return { lectura, aviso: null };
  } catch (e) {
    if (e instanceof ErrorAnuncios || e instanceof ErrorMeta) return { lectura: null, aviso: mensajeAnuncios(e) };
    throw e;
  }
}

// ------------------------------------------------------------
// La IA propone lo que falta
// ------------------------------------------------------------

/** Lo que propone la IA (sin guardar): { datos, costos, avisos, ticketCatalogo, modelo, aviso }. */
export async function proponerNegocio(env, acceso, cliente, entrada = null) {
  const negocio = limpiarNegocio(entrada ?? (await leerNegocio(acceso, cliente.id)));
  const mercado = await leerMercado(acceso, cliente.id);
  const ticketCatalogo = ticketDelCatalogo(productosActivos(mercado.catalogo));
  if (!queFaltaProponer(negocio).length) {
    return { datos: {}, costos: [], avisos: ["Ya está todo lo que la IA puede proponer: el ticket, los costos, las devoluciones y el % a invertir."], ticketCatalogo, modelo: null, aviso: null };
  }
  let c = null;
  try {
    c = await contextoCerebro(env, acceso, cliente.id, "costo margen precio comisión envío devoluciones ticket ventas pedidos", { para: "chat", presupuesto: 8000 });
  } catch (e) {
    console.warn("números del negocio: el cerebro no respondió", e?.message);
  }
  const contexto = [
    cliente.industry && `Rubro: ${String(cliente.industry).slice(0, 120)}`,
    cliente.descripcion && `Descripción: ${String(cliente.descripcion).slice(0, 1200)}`,
    c?.ficha && `FICHA:\n${c.ficha}`,
    c?.cifras && `CIFRAS (pueden ser internas):\n${c.cifras}`,
    c?.pasajes && `NOTAS:\n${c.pasajes}`,
  ].filter(Boolean).join("\n\n").slice(0, 16_000);
  const cuenta = await acceso.leerUno("cuentas_anuncios", { client_id: cliente.id });
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoPropuesta({
      marca: cliente.name ?? "", rubro: cliente.industry ?? "", negocio,
      catalogo: catalogoATexto(mercado.catalogo, { inventario: mercado.inventario }), ticketCatalogo, contexto, moneda: cuenta?.moneda ?? "USD",
    }),
    salida: 2500, funcion: "números del negocio",
  });
  const propuesta = leerPropuesta(r.texto, negocio);
  if (!propuesta) throw new ErrorIA("La IA no devolvió una propuesta que se pueda leer. Inténtalo otra vez.", 502);
  // Si falta el ticket y la IA no lo dio, el promedio del catálogo (también «estimado»).
  const faltaTicket = !negocio.ticket || negocio.ticket.origen === "estimado";
  if (faltaTicket && !propuesta.datos.ticket && ticketCatalogo) {
    propuesta.datos.ticket = { valor: ticketCatalogo.valor, origen: "estimado", nota: `El promedio de los ${ticketCatalogo.precios} precios del catálogo.` };
  }
  return { ...propuesta, ticketCatalogo, modelo: r.modelo ?? null, aviso: r.aviso ?? null };
}

// ------------------------------------------------------------
// La ruta (la despacha worker/rutas/anuncios.js: va antes de exigir la cuenta publicitaria)
// ------------------------------------------------------------

export async function rutasNegocio(req, env, { acceso, usuario, clientId, accion, metodo }) {
  const { cliente, cuenta } = await clienteYCuenta(acceso, clientId, { exigirCuenta: false });
  const url = new URL(req.url);

  if (!accion && metodo === "GET") {
    const [fila, manual] = await Promise.all([acceso.leerUno("anuncios_clientes", { client_id: cliente.id }), manualDelEspacio(acceso)]);
    const negocio = limpiarNegocio(leerJSON(fila?.negocio, {}));
    const tasaDefecto = manual.tasaCierre;
    const { lectura, aviso } = url.searchParams.get("meta") === "0" ? { lectura: null, aviso: null } : await lecturaMeta(env, acceso, cuenta);
    return json({
      negocio, tasaDefecto,
      // El reparto por etapa del cliente: el suyo a mano (`anuncios_clientes.reparto`, lo escribe el plan de campañas)
      // o el del Manual. El mismo que usan el plan y el Excel. → { reparto: { presentacion, … }, aMano }.
      reparto: repartoDelCliente(manual.reparto, fila?.reparto ?? null),
      // EL número mágico (el mismo de la revisión, el plan y el estratega), con lo gastado en Meta sólo de referencia.
      numeroMagico: numeroMagicoDelCliente(negocio, {
        tasaDefecto, gastoMeta30: lectura?.gasto ?? null, lectura, nombre: cliente.name ?? "", moneda: cuenta?.moneda || "USD",
      }),
      cuenta: cuenta ? { nombre: cuenta.nombre, moneda: cuenta.moneda } : null,
      lectura, avisoMeta: aviso,
      // La tasa de cierre MEDIDA por el enlace de ventas (entrega 4): { tasa, ventas, conversaciones, desde }. Hasta
      // que exista, null; la pantalla la aplica con `conTasaMedida` si llega.
      medida: null,
    });
  }

  if (!accion && metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    const entrada = b.negocio && typeof b.negocio === "object" ? b.negocio : null;
    if (!entrada) return error("Faltan los números del negocio.");
    // Si otra persona guardó desde que se leyó, no se pisa: se devuelve lo de ahora.
    if ("antes" in b) {
      const actual = await leerNegocio(acceso, cliente.id);
      if ((b.antes ?? null) !== (actual.actualizado ?? null)) {
        return json({ error: `${actual.por || "Otra persona"} cambió los números mientras los editabas. Revisa lo de ahora y vuelve a guardar.`, negocio: actual }, 409);
      }
    }
    const negocio = await guardarNegocio(acceso, cliente.id, entrada, usuario);
    difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: cliente.id, por: firma(usuario, req) });
    return json({ negocio });
  }

  if (accion === "proponer" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    return json(await proponerNegocio(env, acceso, cliente, b.negocio && typeof b.negocio === "object" ? b.negocio : null));
  }

  return noEncontrado("Ruta");
}
