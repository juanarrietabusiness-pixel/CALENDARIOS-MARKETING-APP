// ============================================================
// EL PLAN DE CAMPAÑAS de un cliente y un mes: lo que lee de la base, y lo que se guarda de la guía
//
//   GET /api/anuncios/clientes/:c/ciclo?mes=AAAA-MM          El plan (campañas, públicos, piezas, avisos) y lo guardado
//   PUT /api/anuncios/clientes/:c/ciclo { mes, marcar?, ajustes? }
//        `marcar`: { idDelPaso: true | false } — se FUNDE con lo guardado (dos personas que marcan pasos distintos no
//        se pisan); `ajustes`: { temporada: { incluir, diario }, inversion } — se reemplazan y el plan se rehace.
//
// Las cuentas son de src/lib/planCiclo.js (las mismas en la pantalla, el Excel y lo que lee Claude): aquí sólo se lee
// lo que hace falta —los números del negocio y el Manual, el catálogo y el estudio de mercado, el kit (sus tipos de
// arte), las fechas especiales, el calendario del mes y los tres anteriores (las piezas), la cola de lo publicado (el
// enlace de cada publicación) y las métricas de lo propio (su «rinde»)— y se guarda el progreso de la guía. NO toca
// Meta: el plan se monta en el Ads Manager (la creación por la API está congelada), así que no pide cuenta publicitaria.
// La moneda, la de la cuenta si la tiene.
//
// Lo guardado va en `planes_campana` (el de los planes del estratega) con `datos.tipo = "ciclo"`, una fila por cliente
// y mes con id fijo (`ciclo-<cliente>-<mes>`): el estratega no las enseña entre sus planes (worker/lib/estratega.js).
// ============================================================

import { json, error, cuerpo, noEncontrado } from "./respuesta.js";
import { difundir, firma } from "./vivo.js";
import { ahora } from "./ids.js";
import { clienteYCuenta } from "./anuncios.js";
import { leerMercado } from "./mercado.js";
import { leerNegocio } from "./negocio.js";
import { leerManual } from "./estratega.js";
import { preferenciasDelCliente } from "./enPauta.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import {
  planDelCiclo, conPiezas, candidatasDelCalendario, temporadaDelMes, guiaDeMontaje, limpiarProgreso, avanceDeGuia, planATextoCiclo,
  mesDelPlan, MESES_DE_PIEZAS,
} from "../../src/lib/planCiclo.js";
import { limpiarTiposArte } from "../../src/lib/tiposArte.js";
import { numeroMagicoDelCliente } from "../../src/lib/numerosNegocio.js";

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t ?? "") ?? d; } catch { return d; }
};
const MAX_PASOS = 400;
const MAX_MARCAR = 60;

/** El id de la fila guardada del plan de un cliente y un mes. */
export const idDelCiclo = (clientId, mes) => `ciclo-${clientId}-${mes}`;

/** «2026-11» del texto o, si no vale, el mes de hoy en Panamá. */
const mesPedido = (texto) => mesDelPlan(texto)?.texto ?? fechaEnZona().slice(0, 7);

/** El mes y los `n` anteriores («2026-11», 1 → [«2026-11», «2026-10»]). */
function mesesHasta(mes, n) {
  const m = mesDelPlan(mes);
  const salida = [];
  for (let k = 0; k <= n; k++) {
    const t = m.year * 12 + m.month - k;
    salida.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  }
  return salida;
}

/** Lo guardado del plan de un mes: { progreso, ajustes, actualizado, por }. */
export async function leerGuardado(acceso, clientId, mes) {
  const f = await acceso.leerUno("planes_campana", { id: idDelCiclo(clientId, mes) });
  const d = leerJSON(f?.datos, {});
  return {
    progreso: limpiarProgreso(d.progreso),
    ajustes: limpiarAjustes(d.ajustes),
    actualizado: f?.updated_at ?? null,
    por: f?.creado_por ?? null,
  };
}

/** Lo que la agencia decide del plan de un mes, limpio: la temporada (incluirla o no, su diario) y la inversión. */
export function limpiarAjustes(a) {
  const x = a && typeof a === "object" ? a : {};
  const t = x.temporada && typeof x.temporada === "object" ? x.temporada : {};
  const diario = Number(t.diario);
  const inversion = Number(x.inversion);
  return {
    temporada: {
      ...(typeof t.incluir === "boolean" ? { incluir: t.incluir } : {}),
      ...(diario > 0 && diario < 1e7 ? { diario: Math.round(diario * 100) / 100 } : {}),
    },
    ...(inversion > 0 && inversion < 1e9 ? { inversion: Math.round(inversion * 100) / 100 } : {}),
  };
}

/**
 * El plan del cliente para un mes, con sus piezas y lo guardado. Pocas consultas y todas acotadas por el cliente: los
 * números y el Manual, el mercado, hasta 8 calendarios (el del mes y los de antes), la cola publicada y las métricas.
 * → { plan, guardado, avance }
 */
export async function cicloDelCliente(env, acceso, cliente, mes, { cuenta = null } = {}) {
  const hoy = fechaEnZona();
  const meses = new Set(mesesHasta(mes, MESES_DE_PIEZAS));
  const [negocio, manual, mercado, guardado, cals, cola, metricas, aprendido] = await Promise.all([
    leerNegocio(acceso, cliente.id),
    leerManual(acceso),
    leerMercado(acceso, cliente.id),
    leerGuardado(acceso, cliente.id, mes),
    acceso.leerColumnas("calendars", ["id", "year", "month", "days", "offers", "promo_code", "campaign", "opciones"], { client_id: cliente.id }, "year desc, month desc", 8).catch(() => []),
    acceso.leerColumnas("publicaciones_programadas", ["calendar_id", "post_id", "red", "estado", "variante", "externo_id", "enlace"], { client_id: cliente.id, estado: "publicada" }, "created_at desc", 600).catch(() => []),
    acceso.leerColumnas("metricas_publicacion", ["id", "cuenta_id", "red", "externo_id", "interacciones", "guardados", "compartidos"], { client_id: cliente.id }, "publicada_at desc", 3000).catch(() => []),
    // Lo que se aprendió de sus anuncios (lo que ya corrió en el Ads Manager): null sin muestra o si falla.
    preferenciasDelCliente(acceso, cliente.id),
  ]);
  const deMes = (c) => `${c.year}-${String(Number(c.month) + 1).padStart(2, "0")}`;
  const calendarios = cals.filter((c) => meses.has(deMes(c))).map((c) => ({
    id: c.id, year: c.year, month: c.month, mes: deMes(c), days: leerJSON(c.days, []),
    offers: c.offers ?? "", promoCode: c.promo_code ?? "", campaign: c.campaign ?? "", opciones: leerJSON(c.opciones, {}),
  }));
  const delMes = calendarios.find((c) => c.mes === mes) ?? null;
  const kit = leerJSON(cliente.kit_marca, {});
  const estudio = mercado.estudio ?? mercado.borrador;
  const temporada = temporadaDelMes({ mes, calendario: delMes, fechasEspeciales: leerJSON(cliente.fechas_especiales, null), hoy });
  const base = planDelCiclo({
    negocio, numeros: { tasaDefecto: manual.tasaCierre, inversion: guardado.ajustes.inversion }, manual, mes, calendario: delMes,
    kit: { tiposArte: limpiarTiposArte(kit?.tiposArte) }, estudio, catalogo: mercado.catalogo, temporada, ajustes: guardado.ajustes,
    cliente: { nombre: cliente.name, rubro: cliente.industry ?? "" }, moneda: cuenta?.moneda || "USD",
  });
  const candidatas = candidatasDelCalendario({ calendarios, cola, metricas, destino: base.destino, artesMarca: kit?.tiposArte });
  const plan = conPiezas(base, candidatas, { ofertas: delMes?.offers ?? "", codigo: delMes?.promoCode ?? "", hoy, aprendido });
  const guia = guiaDeMontaje(plan);
  const progreso = limpiarProgreso(guardado.progreso, guia);
  // EL número mágico del cliente (lib/numerosNegocio.js): la MISMA cifra de la ficha, la revisión, el aviso diario y el
  // estratega, para todas las etapas del plan (decisión del 14-nov).
  const numeroMagico = numeroMagicoDelCliente(negocio, { tasaDefecto: manual.tasaCierre, nombre: cliente.name ?? "", moneda: cuenta?.moneda || "USD" });
  return { plan, guardado: { ...guardado, progreso }, avance: avanceDeGuia(guia, progreso), numeroMagico };
}

/**
 * Guarda lo marcado (fundido con lo de antes) y los ajustes del plan de un mes. Sólo ids con forma de paso; lo
 * desmarcado se quita. → lo guardado.
 */
export async function guardarCiclo(acceso, cliente, mes, { marcar = null, ajustes = undefined } = {}, usuario = null) {
  const id = idDelCiclo(cliente.id, mes);
  const previa = await acceso.leerUno("planes_campana", { id });
  const d = leerJSON(previa?.datos, {});
  const progreso = limpiarProgreso(d.progreso);
  const t = ahora();
  const por = String(usuario?.nombre ?? usuario?.id ?? "").slice(0, 80);
  if (marcar && typeof marcar === "object") {
    for (const [paso, hecho] of Object.entries(marcar).slice(0, MAX_MARCAR)) {
      if (!/^[\w:-]{3,60}$/.test(paso)) continue;
      if (hecho === true) progreso[paso] = { por, at: t };
      else delete progreso[paso];
    }
  }
  const llenos = Object.fromEntries(Object.entries(progreso).slice(0, MAX_PASOS));
  const datos = { tipo: "ciclo", mes, progreso: llenos, ajustes: ajustes === undefined ? limpiarAjustes(d.ajustes) : limpiarAjustes(ajustes) };
  const fila = { nombre: `Plan de campañas · ${mes}`, datos: JSON.stringify(datos), creado_por: por || null, updated_at: t };
  if (previa) await acceso.actualizar("planes_campana", { id }, fila);
  else await acceso.insertar("planes_campana", { id, client_id: cliente.id, ...fila, created_at: t });
  return { progreso: llenos, ajustes: datos.ajustes, actualizado: t, por: por || null };
}

/** El plan en texto, para el asistente y Claude (`plan_de_campanas`), con cuánto de la guía va marcado. */
export async function planDeCampanasEnTexto(env, acceso, cliente, mes) {
  const { cuenta } = await clienteYCuenta(acceso, cliente.id, { exigirCuenta: false });
  const { plan, avance } = await cicloDelCliente(env, acceso, cliente, mesPedido(mes), { cuenta });
  return `${planATextoCiclo(plan)}\n\nGuía de montaje: ${avance.hechos} de ${avance.total} pasos marcados (Anuncios → Plan de campañas). ` +
    "Las campañas se montan en el Ads Manager: esta aplicación no las crea.";
}

// ------------------------------------------------------------
// La ruta (la despacha worker/rutas/anuncios.js: va antes de exigir la cuenta publicitaria)
// ------------------------------------------------------------

export async function rutasCiclo(req, env, { acceso, usuario, clientId, metodo }) {
  const { cliente, cuenta } = await clienteYCuenta(acceso, clientId, { exigirCuenta: false });
  const url = new URL(req.url);
  if (metodo === "GET") return json(await cicloDelCliente(env, acceso, cliente, mesPedido(url.searchParams.get("mes")), { cuenta }));
  if (metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    const mes = mesDelPlan(b.mes)?.texto;
    if (!mes) return error("Escoge el mes del plan.");
    const conAjustes = b.ajustes !== undefined;
    if (!conAjustes && !(b.marcar && typeof b.marcar === "object")) return error("No hay nada que guardar.");
    const guardado = await guardarCiclo(acceso, cliente, mes, { marcar: b.marcar ?? null, ajustes: conAjustes ? b.ajustes : undefined }, usuario);
    // Lo marcado lo ve todo el equipo: el aviso «anuncios» sube el pulso de las demás pestañas, que releen.
    difundir(env, acceso.ownerId, { tipo: "anuncios", clientId: cliente.id, por: firma(usuario, req) });
    if (conAjustes) return json(await cicloDelCliente(env, acceso, cliente, mes, { cuenta }));
    return json({ guardado });
  }
  return noEncontrado("Ruta");
}
