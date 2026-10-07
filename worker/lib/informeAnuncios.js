// ============================================================
// El informe de anuncios de un cliente (aparte del de redes)
//
// Lo que se le enseña al cliente de su publicidad pagada del mes. Las
// CIFRAS las calcula `src/lib/informeAnuncios.js` sobre lo que devuelve
// Meta y se CONGELAN; la IA sólo escribe lo logrado, una frase por campaña
// y lo del mes que viene, con las cifras delante.
//
// TODAS las campañas de la cuenta, también las del Administrador de
// anuncios. Sólo lee de Meta: nueve llamadas como mucho (el total y el día
// a día del mes, el total del anterior, las campañas de los dos meses, los
// anuncios y las imágenes de los tres mejores), dentro de las 50 del plan
// gratuito también cuando lo genera el cron.
//
// Las imágenes de los mejores anuncios se INCRUSTAN (data:) al generar:
// el enlace del cliente no tiene sesión para pasar por el proxy de
// miniaturas, y lo del CDN de Meta caduca. Sólo de `fbcdn.net` o
// `cdninstagram.com` y con tope de tamaño (la fila de D1 corta a 2 MB).
//
// «Mostrar el costo por resultado» lo decide la agencia (por cliente, el
// valor de partida; por informe, el que vale). Si no se muestra, el
// enlace del cliente no lo LLEVA (`sinCosto`, en publico.js) y a la IA se
// le pide no nombrarlo.
//
// El automático (si el cliente lo tiene encendido) sale del día 1 al 5,
// desde las 9:00 de Panamá, como borrador: no se comparte solo.
// ============================================================

import { crearAcceso, clientesSinInformeAnuncios } from "./acceso.js";
import { difundir } from "./vivo.js";
import { graph } from "./meta.js";
import { ahora, uuid } from "./ids.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import { rangoInsights, modificadorInsights, CAMPOS_INSIGHTS } from "../../src/lib/anuncios.js";
import { cifrasInformeAnuncios, pedidoInformeAnuncios, leerAnalisisAnuncios } from "../../src/lib/informeAnuncios.js";
import { conexionMeta, clienteYCuenta, estadisticasCuenta, listarCampanas, mensajeAnuncios, ErrorAnuncios } from "./anuncios.js";
import { limitesDelMes, mesAnterior } from "./informes.js";
import { llamarIA } from "./cerebro/ia.js";

const FIRMA = { userId: "sistema", nombre: "Informe de anuncios", color: "#1E90FF" };
const CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;
const MAX_IMAGEN = 250_000;
const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const MES = /^\d{4}-\d{2}$/;

/** El mes anterior a `mes` («2026-01» → «2025-12»). */
export function mesPrevio(mes) {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

function aBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Una imagen del CDN de Meta como data URI; null si no es de allí, no es imagen o pesa demasiado. */
export async function incrustar(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !CDN.test(u.hostname)) return null;
  const r = await fetch(u).catch(() => null);
  const tipo = (r?.headers.get("content-type") ?? "").split(";")[0];
  if (!r?.ok || !/^image\/(jpeg|png|webp)$/.test(tipo)) return null;
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_IMAGEN) return null;
  return `data:${tipo};base64,${aBase64(buf)}`;
}

/** Los anuncios de la cuenta con sus cifras del mes (una llamada). */
async function anunciosDelMes(env, token, cuenta, rango) {
  const r = await graph(env, token, `/${cuenta.externo_id}/ads`, {
    params: {
      fields: `id,name,campaign{name,objective},creative{title,body,image_url,thumbnail_url},insights${modificadorInsights(rango)}{${CAMPOS_INSIGHTS}}`,
      limit: 100,
    },
  });
  return (r?.data ?? []).map((x) => ({ ...x, insights: x.insights?.data?.[0] ?? null })).filter((x) => x.insights);
}

/** Lo que se lee de Meta para el informe de `mes`, ya convertido en cifras. */
export async function datosDelMes(env, token, cuenta, mes, desdeApp = []) {
  const { desde, hasta } = limitesDelMes(mes);
  const previo = limitesDelMes(mesPrevio(mes));
  const rango = rangoInsights({ desde, hasta });
  const rangoAntes = rangoInsights(previo);
  const [{ total, dias }, anteriorBruto, campanas, campanasAnterior, anuncios] = await Promise.all([
    estadisticasCuenta(env, token, cuenta, rango),
    graph(env, token, `/${cuenta.externo_id}/insights`, { params: { fields: CAMPOS_INSIGHTS, ...rangoAntes } }),
    listarCampanas(env, token, cuenta, rango),
    listarCampanas(env, token, cuenta, rangoAntes),
    anunciosDelMes(env, token, cuenta, rango),
  ]);
  const cifras = cifrasInformeAnuncios({
    mes, desde, hasta, cuenta: { nombre: cuenta.nombre, moneda: cuenta.moneda },
    total, anterior: anteriorBruto?.data?.[0] ?? null, campanas, campanasAnterior, dias, anuncios, desdeApp,
  });
  // Las imágenes de los mejores, incrustadas: la del anuncio y, si no, su miniatura.
  const porId = new Map(anuncios.map((x) => [String(x.id), x]));
  cifras.mejores = await Promise.all(cifras.mejores.map(async (m) => {
    const c = porId.get(m.id)?.creative ?? {};
    const img = (c.image_url && (await incrustar(c.image_url))) || (c.thumbnail_url && (await incrustar(c.thumbnail_url))) || null;
    return { ...m, miniatura: img };
  }));
  return cifras;
}

// ------------------------------------------------------------
// Lo que decide la agencia por cliente
// ------------------------------------------------------------

export async function ajustesInforme(acceso, clientId) {
  const f = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  return { automatico: f?.informe_automatico === 1, mostrarCosto: f ? f.mostrar_costo === 1 : true };
}

export async function guardarAjustesInforme(acceso, clientId, { automatico, mostrarCosto }) {
  const previa = await acceso.leerUno("anuncios_clientes", { client_id: clientId });
  const actual = await ajustesInforme(acceso, clientId);
  const fila = {
    id: previa?.id ?? uuid(), client_id: clientId,
    informe_automatico: (typeof automatico === "boolean" ? automatico : actual.automatico) ? 1 : 0,
    mostrar_costo: (typeof mostrarCosto === "boolean" ? mostrarCosto : actual.mostrarCosto) ? 1 : 0,
    created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
  };
  await acceso.guardar("anuncios_clientes", fila);
  return { automatico: fila.informe_automatico === 1, mostrarCosto: fila.mostrar_costo === 1 };
}

// ------------------------------------------------------------
// Generar
// ------------------------------------------------------------

/** Lo que ve la agencia de un informe (la lista; el contenido va aparte). */
export const resumenInformeAnuncios = (f) => ({
  id: f.id, clientId: f.client_id, mes: f.mes, estado: f.estado, error: f.error ?? "",
  compartido: f.compartido === 1, testigo: f.compartido === 1 ? f.testigo : null,
  automatico: f.automatico === 1, mostrarCosto: f.mostrar_costo === 1, actualizado: f.updated_at,
});

/**
 * Genera (o regenera) el informe de anuncios de `mes`. Conserva el enlace si ya lo había. La fila se escribe ANTES
 * de nada que pueda fallar: el cron no vuelve a intentar un cliente con fila del mes, y un fallo sin fila lo
 * reintentaría cada minuto cinco días seguidos.
 */
export async function generarInformeAnuncios(env, acceso, { clientId, mes, usuarioId = null, automatico = false, mostrarCosto }) {
  if (!MES.test(String(mes ?? ""))) throw new ErrorAnuncios("Mes inválido.");
  const { cliente, cuenta } = await clienteYCuenta(acceso, clientId, { exigirCuenta: false });
  const id = `${clientId}:${mes}`;
  const previo = await acceso.leerUno("informes_anuncios", { id });
  const ajustes = await ajustesInforme(acceso, clientId);
  const costo = typeof mostrarCosto === "boolean" ? mostrarCosto : previo ? previo.mostrar_costo === 1 : ajustes.mostrarCosto;
  const base = {
    id, client_id: clientId, mes, testigo: previo?.testigo ?? null, compartido: previo?.compartido ?? 0,
    automatico: automatico ? 1 : 0, mostrar_costo: costo ? 1 : 0, generado_por: usuarioId,
    created_at: previo?.created_at ?? ahora(),
  };
  await acceso.guardar("informes_anuncios", { ...base, estado: "generando", contenido: previo?.contenido ?? "{}", error: null, updated_at: "" });
  difundir(env, acceso.ownerId, { tipo: "anuncios", clientId, informe: mes, estado: "generando", por: FIRMA });

  try {
    if (!cuenta) throw new ErrorAnuncios("Este cliente no tiene cuenta publicitaria asignada.", 409);
    const conexion = await conexionMeta(env, acceso);
    if (conexion.faltan.includes("ads_read")) throw new ErrorAnuncios("Falta el permiso de anuncios de Meta (ads_read): concédelo en Anuncios.", 409);
    const token = await conexion.token();
    const registros = await acceso.leer("campanas_anuncios", { client_id: clientId });
    const cifras = await datosDelMes(env, token, cuenta, mes, registros.map((r) => r.campana_id));

    // El análisis es de la IA y no puede tumbar las cifras: sin él, el informe sale igual y la agencia lo sabe.
    const avisos = [];
    let analisis = { logros: "", campanas: {}, recomendaciones: [] };
    let modelo = null;
    if (cifras.kpis.inversion.valor > 0) {
      try {
        const r = await llamarIA(env, acceso, cliente, {
          prompt: pedidoInformeAnuncios(cifras, { marca: cliente.name, mostrarCosto: costo, rubro: cliente.industry ?? "" }),
          salida: 2500, funcion: "informe de anuncios",
        });
        analisis = leerAnalisisAnuncios(r.texto, cifras);
        modelo = r.modelo;
        if (r.aviso) avisos.push(r.aviso);
      } catch (e) {
        avisos.push(`La IA no escribió el análisis: ${e.message}`);
      }
    } else {
      avisos.push("La cuenta no gastó nada este mes.");
    }
    const contenido = { cifras, analisis, modelo, costoEnAnalisis: costo, ...(avisos.length ? { avisos } : {}) };
    const fila = { ...base, estado: "listo", contenido: JSON.stringify(contenido), error: null, updated_at: "" };
    await acceso.guardar("informes_anuncios", fila);
    difundir(env, acceso.ownerId, { tipo: "anuncios", clientId, informe: mes, estado: "listo", por: FIRMA });
    return fila;
  } catch (e) {
    const mensaje = e instanceof ErrorAnuncios ? e.message : mensajeAnuncios(e);
    await acceso.guardar("informes_anuncios", { ...base, estado: "error", contenido: previo?.contenido ?? "{}", error: String(mensaje).slice(0, 500), updated_at: "" });
    difundir(env, acceso.ownerId, { tipo: "anuncios", clientId, informe: mes, estado: "error", por: FIRMA });
    throw e;
  }
}

/** El contenido de una fila, como lo ve la agencia. */
export const contenidoInforme = (f) => leerJSON(f?.contenido, {});

/**
 * El cron: del día 1 al 5, desde las 9:00 de Panamá, el informe del mes anterior de UN cliente con el automático
 * encendido y cuenta publicitaria. Uno por vuelta, y sólo si el informe de redes no hizo nada en ella.
 */
export async function informeAnunciosPendiente(env, momento = new Date()) {
  if (!env.ANTHROPIC_API_KEY) return 0;
  const hoy = fechaEnZona(momento);
  const horaPanama = (momento.getUTCHours() + 19) % 24;
  if (Number(hoy.slice(8, 10)) > 5 || horaPanama < 9) return 0;
  const mes = mesAnterior(momento);
  const [siguiente] = await clientesSinInformeAnuncios(env.DB, mes, 1);
  if (!siguiente) return 0;
  const acceso = crearAcceso(env.DB, siguiente.owner_id);
  try {
    await generarInformeAnuncios(env, acceso, { clientId: siguiente.client_id, mes, automatico: true });
  } catch (e) {
    console.error("informe de anuncios automático:", siguiente.client_id, e?.message);
  }
  return 1;
}
