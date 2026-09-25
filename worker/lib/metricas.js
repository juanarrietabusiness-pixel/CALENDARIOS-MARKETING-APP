// ============================================================
// La foto diaria de métricas
//
// Meta sólo guarda unos días de historia de una cuenta: la evolución de
// seguidores de un mes sólo existe si alguien la apunta cada día. Eso lo
// hace el cron (`scheduled` en worker/index.js), una cuenta por vuelta,
// desde las 6:00 de Panamá.
//
// UNA CUENTA POR VUELTA, A PROPÓSITO
//
// El plan gratuito de Workers admite 50 peticiones de salida y 50
// consultas a D1 por invocación. Una cuenta de Instagram son ~30 de las
// primeras (la cuenta, sus métricas del día, la audiencia y cada
// publicación reciente). Dos no caben. Con el cron cada minuto, cien
// cuentas tardan cien minutos: sobra.
//
// LO QUE META NO DA NO ROMPE LA FOTO
//
// Meta retira y renombra métricas a menudo (`impressions` pasó a `views`
// en 2025). Cada grupo se pide por su lado y lo que falle queda vacío:
// una foto con el alcance en blanco vale más que ninguna foto.
// ============================================================

import { crearAcceso, cuentasSinFoto } from "./acceso.js";
import { graph, descifrarMeta } from "./meta.js";
import { tokenTikTok, usuarioTikTok, videosTikTok } from "./tiktok.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";

const DIAS_PUBLICACIONES = 45;
const MAX_PUBLICACIONES = 18;
const MAX_COMPETIDORES = 5;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const inicioDelDia = (fecha) => Math.floor(Date.parse(`${fecha}T00:00:00-05:00`) / 1000);

/** El día que se fotografía: AYER en Panamá, que es el último completo. */
export const fechaDeFoto = (ahora = new Date()) => sumarDias(fechaEnZona(ahora), -1);

/** Una llamada que puede fallar sin tumbar la foto. */
async function intentar(fn) {
  try { return await fn(); } catch { return null; }
}

/** `total_value` de cada métrica de /insights, por nombre. */
function totales(datos) {
  const salida = {};
  for (const m of datos?.data ?? []) {
    salida[m.name] = num(m.total_value?.value ?? m.values?.at(-1)?.value);
  }
  return salida;
}

async function metricasDelDiaIG(env, token, ig, fecha) {
  const params = { period: "day", metric_type: "total_value", since: inicioDelDia(fecha), until: inicioDelDia(sumarDias(fecha, 1)) };
  const todas = ["reach", "views", "total_interactions", "profile_views", "accounts_engaged"];
  const juntas = await intentar(() => graph(env, token, `/${ig}/insights`, { params: { ...params, metric: todas.join(",") } }));
  if (juntas) return totales(juntas);
  // Alguna ya no existe en esta versión: una a una.
  const salida = {};
  for (const m of todas) {
    const r = await intentar(() => graph(env, token, `/${ig}/insights`, { params: { ...params, metric: m } }));
    Object.assign(salida, totales(r));
  }
  return salida;
}

async function audienciaIG(env, token, ig) {
  const salida = {};
  for (const desglose of ["age", "gender", "city"]) {
    const r = await intentar(() => graph(env, token, `/${ig}/insights`, {
      params: { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: desglose },
    }));
    const resultados = r?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    if (resultados.length) {
      salida[desglose] = resultados
        .map((x) => ({ clave: String(x.dimension_values?.[0] ?? ""), valor: num(x.value) ?? 0 }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, desglose === "city" ? 8 : 12);
    }
  }
  return salida;
}

const TIPO_IG = { IMAGE: "imagen", VIDEO: "video", CAROUSEL_ALBUM: "carrusel" };

async function publicacionesIG(env, token, ig, desde) {
  const lista = await intentar(() => graph(env, token, `/${ig}/media`, {
    params: {
      fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url",
      limit: 30,
    },
  }));
  const recientes = (lista?.data ?? []).filter((m) => Date.parse(m.timestamp) >= desde).slice(0, MAX_PUBLICACIONES);
  const salida = [];
  for (const m of recientes) {
    const reel = m.media_product_type === "REELS";
    const ins = totales(await intentar(() => graph(env, token, `/${m.id}/insights`, {
      params: { metric: "reach,saved,shares,views,total_interactions" },
    })) ?? await intentar(() => graph(env, token, `/${m.id}/insights`, { params: { metric: "reach,saved" } })));
    salida.push({
      externo_id: m.id,
      tipo: reel ? "reel" : TIPO_IG[m.media_type] ?? "imagen",
      enlace: m.permalink ?? "",
      texto: String(m.caption ?? "").slice(0, 300),
      miniatura: m.thumbnail_url || (m.media_type === "VIDEO" ? "" : m.media_url) || "",
      publicada_at: m.timestamp ? new Date(m.timestamp).toJSON() : null,
      me_gusta: num(m.like_count) ?? 0,
      comentarios: num(m.comments_count) ?? 0,
      guardados: ins.saved ?? 0,
      compartidos: ins.shares ?? 0,
      alcance: ins.reach ?? 0,
      vistas: ins.views ?? 0,
      interacciones: ins.total_interactions ?? (num(m.like_count) ?? 0) + (num(m.comments_count) ?? 0) + (ins.saved ?? 0) + (ins.shares ?? 0),
    });
  }
  return salida;
}

async function competidorIG(env, token, ig, usuario) {
  const campos = `business_discovery.username(${usuario}){username,followers_count,media_count,media.limit(12){like_count,comments_count,timestamp,media_type,permalink}}`;
  const r = await intentar(() => graph(env, token, `/${ig}`, { params: { fields: campos } }));
  const bd = r?.business_discovery;
  if (!bd) return null;
  const medios = bd.media?.data ?? [];
  const inter = medios.map((m) => (num(m.like_count) ?? 0) + (num(m.comments_count) ?? 0));
  const ultima = medios[0]?.timestamp ?? null;
  return {
    seguidores: num(bd.followers_count),
    publicaciones: num(bd.media_count),
    interacciones_promedio: inter.length ? inter.reduce((a, b) => a + b, 0) / inter.length : null,
    datos: { ultima, formatos: medios.map((m) => m.media_type), recientes: medios.slice(0, 6).map((m) => ({ enlace: m.permalink, interacciones: (num(m.like_count) ?? 0) + (num(m.comments_count) ?? 0) })) },
  };
}

// ------------------------------------------------------------
// Facebook
// ------------------------------------------------------------

async function metricasDelDiaFB(env, token, pagina, fecha) {
  const params = { period: "day", since: inicioDelDia(fecha), until: inicioDelDia(sumarDias(fecha, 1)) };
  const salida = {};
  for (const [m, clave] of [["page_impressions_unique", "reach"], ["page_post_engagements", "total_interactions"], ["page_views_total", "profile_views"], ["page_media_view", "views"]]) {
    const r = await intentar(() => graph(env, token, `/${pagina}/insights`, { params: { ...params, metric: m } }));
    const v = r?.data?.[0]?.values?.at(-1)?.value;
    if (v !== undefined) salida[clave] = num(v);
  }
  return salida;
}

async function publicacionesFB(env, token, pagina, desde) {
  const r = await intentar(() => graph(env, token, `/${pagina}/posts`, {
    params: {
      fields: "id,message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)",
      limit: 25,
    },
  }));
  return (r?.data ?? []).filter((p) => Date.parse(p.created_time) >= desde).slice(0, MAX_PUBLICACIONES).map((p) => {
    const reacciones = num(p.reactions?.summary?.total_count) ?? 0;
    const comentarios = num(p.comments?.summary?.total_count) ?? 0;
    const compartidos = num(p.shares?.count) ?? 0;
    return {
      externo_id: p.id, tipo: p.full_picture ? "imagen" : "texto", enlace: p.permalink_url ?? "",
      texto: String(p.message ?? "").slice(0, 300), miniatura: p.full_picture ?? "",
      publicada_at: p.created_time ? new Date(p.created_time).toJSON() : null,
      me_gusta: reacciones, comentarios, guardados: 0, compartidos, alcance: 0, vistas: 0,
      interacciones: reacciones + comentarios + compartidos,
    };
  });
}

// ------------------------------------------------------------
// La foto
// ------------------------------------------------------------

/**
 * Fotografía una cuenta: su fila de `metricas_cuenta` para `fecha`, sus
 * publicaciones recientes y, si es un Instagram, la competencia del
 * cliente. Devuelve la fila de la cuenta.
 */
export async function fotografiarCuenta(env, acceso, cuenta, fecha = fechaDeFoto()) {
  const token = cuenta.red === "tiktok" ? await tokenTikTok(env, acceso, cuenta) : await descifrarMeta(env, cuenta.token_cifrado);
  const desde = Date.now() - DIAS_PUBLICACIONES * 86400_000;
  let base = {};
  let dia = {};
  let datos = {};
  let publicaciones = [];

  if (cuenta.red === "instagram") {
    base = (await intentar(() => graph(env, token, `/${cuenta.externo_id}`, { params: { fields: "followers_count,media_count" } }))) ?? {};
    dia = await metricasDelDiaIG(env, token, cuenta.externo_id, fecha);
    datos = { audiencia: await audienciaIG(env, token, cuenta.externo_id) };
    publicaciones = await publicacionesIG(env, token, cuenta.externo_id, desde);
  } else if (cuenta.red === "facebook") {
    base = (await intentar(() => graph(env, token, `/${cuenta.externo_id}`, { params: { fields: "followers_count,fan_count" } }))) ?? {};
    dia = await metricasDelDiaFB(env, token, cuenta.externo_id, fecha);
    publicaciones = await publicacionesFB(env, token, cuenta.externo_id, desde);
  } else if (cuenta.red === "tiktok") {
    // TikTok no da métricas por día de la cuenta: seguidores y totales,
    // y de cada video sus vistas, me gusta, comentarios y compartidos.
    const u = (await intentar(() => usuarioTikTok(token))) ?? {};
    base = { followers_count: u.follower_count, media_count: u.video_count };
    datos = { meGustaTotales: num(u.likes_count) };
    publicaciones = ((await intentar(() => videosTikTok(token, 20))) ?? [])
      .filter((v) => Number(v.create_time) * 1000 >= desde)
      .map((v) => {
        const meGusta = num(v.like_count) ?? 0;
        const comentarios = num(v.comment_count) ?? 0;
        const compartidos = num(v.share_count) ?? 0;
        return {
          externo_id: String(v.id), tipo: "video", enlace: v.share_url ?? "",
          texto: String(v.video_description || v.title || "").slice(0, 300), miniatura: v.cover_image_url ?? "",
          publicada_at: new Date(Number(v.create_time) * 1000).toJSON(),
          me_gusta: meGusta, comentarios, guardados: 0, compartidos, alcance: 0, vistas: num(v.view_count) ?? 0,
          interacciones: meGusta + comentarios + compartidos,
        };
      });
  }

  // Si ni siquiera llegaron los seguidores, el token no vale: se deja sin
  // foto para que el cron lo vuelva a intentar, en vez de guardar ceros.
  const seguidores = num(base.followers_count ?? base.fan_count);
  if (seguidores === null && !publicaciones.length) throw new Error(`Meta no devolvió datos de ${cuenta.nombre || cuenta.externo_id}.`);

  const fila = {
    id: `${cuenta.id}:${fecha}`,
    client_id: cuenta.client_id, cuenta_id: cuenta.id, red: cuenta.red, fecha,
    seguidores, publicaciones: num(base.media_count),
    alcance: dia.reach ?? null, vistas: dia.views ?? null,
    interacciones: dia.total_interactions ?? null, visitas_perfil: dia.profile_views ?? null,
    datos: JSON.stringify(datos),
    created_at: new Date().toJSON(),
  };
  await acceso.guardar("metricas_cuenta", fila);
  await acceso.guardarVarios("metricas_publicacion", publicaciones.map((p) => ({
    id: `${cuenta.id}:${p.externo_id}`, client_id: cuenta.client_id, cuenta_id: cuenta.id, red: cuenta.red, ...p,
    updated_at: new Date().toJSON(),
  })));

  if (cuenta.red === "instagram" && cuenta.client_id) await fotografiarCompetencia(env, acceso, cuenta, token, fecha);
  return fila;
}

async function fotografiarCompetencia(env, acceso, cuenta, token, fecha) {
  const cliente = await acceso.leerUno("clients", { id: cuenta.client_id });
  const usuarios = leerJSON(cliente?.competidores ?? "[]", [])
    .map((u) => String(u).trim().replace(/^@/, ""))
    .filter((u) => /^[\w.]{1,30}$/.test(u))
    .slice(0, MAX_COMPETIDORES);
  const filas = [];
  for (const usuario of usuarios) {
    const c = await competidorIG(env, token, cuenta.externo_id, usuario);
    if (!c) continue;
    filas.push({
      id: `${cuenta.client_id}:${usuario.toLowerCase()}:${fecha}`, client_id: cuenta.client_id, usuario, fecha,
      seguidores: c.seguidores, publicaciones: c.publicaciones, interacciones_promedio: c.interacciones_promedio,
      datos: JSON.stringify(c.datos), created_at: new Date().toJSON(),
    });
  }
  await acceso.guardarVarios("metricas_competencia", filas);
}

/**
 * Una vuelta del cron: la siguiente cuenta sin foto de ayer. Desde las
 * 6:00 de Panamá, para que «ayer» esté cerrado del lado de Meta. Una que
 * falla se apunta con la foto vacía para no bloquear a las demás; al día
 * siguiente se vuelve a intentar.
 */
export async function fotoPendiente(env, ahora = new Date()) {
  const horaPanama = (ahora.getUTCHours() + 19) % 24;
  if (horaPanama < 6) return 0;
  const fecha = fechaDeFoto(ahora);
  const [siguiente] = await cuentasSinFoto(env.DB, fecha, 1);
  if (!siguiente) return 0;
  const acceso = crearAcceso(env.DB, siguiente.owner_id);
  const cuenta = await acceso.leerUno("cuentas_sociales", { id: siguiente.id });
  if (!cuenta) return 0;
  try {
    await fotografiarCuenta(env, acceso, cuenta, fecha);
  } catch (e) {
    console.error("foto de métricas:", cuenta.id, e?.message);
    await acceso.guardar("metricas_cuenta", {
      id: `${cuenta.id}:${fecha}`, client_id: cuenta.client_id, cuenta_id: cuenta.id, red: cuenta.red, fecha,
      datos: JSON.stringify({ error: String(e?.message ?? e).slice(0, 300) }), created_at: new Date().toJSON(),
    });
  }
  return 1;
}
