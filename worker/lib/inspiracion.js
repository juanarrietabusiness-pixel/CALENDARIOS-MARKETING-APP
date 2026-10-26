// ============================================================
// Inspiración: lo que publican las cuentas que sigue cada cliente
//
// Las cuentas fijas viven en `clients.competidores` (src/lib/inspiracion.js
// las lee). Aquí se LEEN sus últimas publicaciones y se GUARDAN
// (`inspiracion_cuentas`, `inspiracion_publicaciones`, 0046) para que abrir
// el feed no gaste llamadas y se pueda medir «rinde X× su promedio» contra la
// mediana de la propia cuenta.
//
//   · Instagram por `business_discovery` desde un Instagram conectado del
//     espacio (sólo empresa o creador), UNA llamada por cuenta.
//   · YouTube por la Data API (lo público de un canal ajeno) con el token de
//     un canal conectado del espacio o la llave `YOUTUBE_API_KEY`: tres
//     llamadas por canal. Un video de YouTube no se baja (sus condiciones no
//     lo dejan): su guion lo saca Gemini por el enlace.
//   · TikTok no deja ver lo de otras cuentas: se guarda la fila (para que el
//     cron no la repita) sin publicaciones.
//
// Lo pone al día el cron (un cliente por vuelta, cada 20 h, sólo si la vuelta
// no tuvo nada más) y «Actualizar» en la pantalla. Una cuenta que falla deja
// su error y su fecha: no bloquea a las demás ni se repite cada minuto. Una
// publicación nueva que rinde 3× su promedio avisa al equipo, una vez.
// Nada de esto se ha probado contra Meta ni Google reales.
// ============================================================

import { cuentaDesde, descubrirCon, ErrorCompetencia, traerPublicacion } from "./competencia.js";
import { tokenYouTube, canalPublicoYouTube, videosPublicosYouTube } from "./youtube.js";
import { avisar, miembrosDe } from "./equipo.js";
import { difundir } from "./vivo.js";
import { llamarIA, ErrorIA } from "./cerebro/ia.js";
import { slug } from "./cerebro/notas.js";
import { clientesConInspiracionVieja, crearAcceso } from "./acceso.js";
import { publicacionesDeGraph } from "../../src/lib/competencia.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import {
  cuentasDeReferencia, claveCuenta, idDeCuenta, conRendimiento, debeAvisar, etiquetaRinde, FORMATOS_FEED, REDES_INSPIRACION,
  paraResumen, pedidoDeResumen, leerResumen, tituloDelResumen,
} from "../../src/lib/inspiracion.js";

/** Cada cuánto el cron pone al día el feed de un cliente. */
export const CADA_HORAS = 20;
const POR_CUENTA = 30;
/** Como mucho tantos avisos por lectura: un cliente nuevo con diez cuentas no debe llenar la campana. */
const MAX_AVISOS = 3;

/** Un fallo que se le dice a la persona, con su estado. */
export class ErrorInspiracion extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const leerLista = (t) => {
  if (Array.isArray(t)) return t;
  try { return JSON.parse(t ?? "[]") ?? []; } catch { return []; }
};

/** Las cuentas fijas de un cliente (la fila de D1 o el cliente ya leído). */
export const cuentasDe = (cliente) => cuentasDeReferencia(leerLista(cliente?.competidores));

const proxy = (u) => (u ? `/api/metricas/miniatura?u=${encodeURIComponent(u)}` : "");

/** Con qué se lee YouTube: el token de un canal conectado del espacio o la llave del servidor. null si no hay. */
async function credencialYouTube(env, acceso) {
  const canal = (await acceso.leer("cuentas_sociales", { red: "youtube" })).find((c) => c.refresh_cifrado || c.token_cifrado);
  if (canal) {
    try { return { token: await tokenYouTube(env, acceso, canal) }; } catch { /* con la llave, si la hay */ }
  }
  return env.YOUTUBE_API_KEY ? { llave: env.YOUTUBE_API_KEY } : null;
}

/** Una cuenta de Instagram → { cuenta, publicaciones } (filas sin `owner_id`). */
async function leerInstagram(env, desde, cuenta) {
  const bd = await descubrirCon(env, desde, cuenta.usuario, POR_CUENTA);
  const pubs = publicacionesDeGraph(bd.media?.data ?? []);
  return {
    datos: { nombre: bd.name ?? "", foto: bd.profile_picture_url ?? "", seguidores: bd.followers_count ?? null, publicaciones: bd.media_count ?? null },
    publicaciones: pubs.map((p) => ({
      externo_id: p.id, codigo: p.codigo, formato: p.formato, enlace: p.enlace, texto: p.texto, miniatura: p.miniatura,
      publicada_at: p.fecha ? new Date(p.fecha).toJSON() : null, me_gusta: p.meGusta, comentarios: p.comentarios, vistas: 0,
      interacciones: p.interacciones, sin_archivo: p.sinArchivo ? 1 : 0,
    })),
  };
}

/** Un canal de YouTube → { datos, publicaciones }. */
async function leerYouTube(cred, cuenta) {
  const canal = await canalPublicoYouTube(cred, cuenta.usuario);
  if (!canal) throw new ErrorInspiracion(`No encontré el canal @${cuenta.usuario} en YouTube.`, 404);
  const videos = await videosPublicosYouTube(cred, canal.contentDetails?.relatedPlaylists?.uploads, 25);
  return {
    datos: {
      nombre: canal.snippet?.title ?? "", foto: canal.snippet?.thumbnails?.default?.url ?? "",
      seguidores: Number(canal.statistics?.subscriberCount ?? 0) || null, publicaciones: Number(canal.statistics?.videoCount ?? 0) || null,
    },
    publicaciones: videos.map((v) => ({
      externo_id: v.externo_id, codigo: "", formato: v.tipo === "short" ? "short" : "video", enlace: v.enlace, texto: v.texto,
      miniatura: v.miniatura, publicada_at: v.publicada_at, me_gusta: v.me_gusta, comentarios: v.comentarios, vistas: v.vistas,
      // Como en Instagram: un comentario pesa el doble que un «me gusta».
      interacciones: (v.me_gusta ?? 0) + (v.comentarios ?? 0) * 2, sin_archivo: 1,
    })),
  };
}

/**
 * Pone al día el feed de un cliente: lee sus cuentas (o sólo las de `solo`, claves «red:usuario»), guarda lo que
 * publican con su rendimiento, borra lo que ya no está entre las últimas y avisa al equipo de lo nuevo que rinde mucho.
 * Cada cuenta que falla deja su error. → { cuentas: n, publicaciones: n, avisos: n, errores: [{ cuenta, error }] }.
 */
export async function actualizarInspiracion(env, acceso, cliente, { solo = null } = {}) {
  const todas = cuentasDe(cliente);
  const cuentas = solo ? todas.filter((c) => solo.includes(claveCuenta(c))) : todas;
  if (!cuentas.length) return { cuentas: 0, publicaciones: 0, avisos: 0, errores: [] };
  const t = new Date().toJSON();

  // Lo que ya había: para conservar `avisado` y borrar lo que ya no está.
  const previas = await acceso.leerColumnas("inspiracion_publicaciones", ["id", "cuenta_id", "avisado"], { client_id: cliente.id }, "id asc");
  const avisadas = new Set(previas.filter((p) => p.avisado).map((p) => p.id));

  let desdeIG = null;
  let errorIG = "";
  if (cuentas.some((c) => c.red === "instagram")) {
    try { desdeIG = await cuentaDesde(env, acceso, cliente.id); } catch (e) { errorIG = e.message; }
  }
  let credYT;
  const filasCuentas = [];
  const filasPubs = [];
  const errores = [];
  const ahora = Date.now();

  for (const c of cuentas) {
    const cuentaId = idDeCuenta(cliente.id, c);
    let leido = null;
    let error = "";
    try {
      if (c.red === "instagram") {
        if (!desdeIG) throw new ErrorInspiracion(errorIG || "Hace falta un Instagram conectado (Ajustes → Integraciones).", 409);
        leido = await leerInstagram(env, desdeIG, c);
      } else if (c.red === "youtube") {
        if (credYT === undefined) credYT = await credencialYouTube(env, acceso);
        if (!credYT) throw new ErrorInspiracion("Para ver canales de YouTube hace falta un canal conectado (Ajustes → Integraciones → YouTube).", 409);
        leido = await leerYouTube(credYT, c);
      } else {
        error = "TikTok no deja ver el contenido de otras cuentas: abre su perfil.";
      }
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 300);
      errores.push({ cuenta: claveCuenta(c), error });
    }
    const { mediana, publicaciones } = conRendimiento(leido?.publicaciones ?? []);
    filasCuentas.push({
      id: cuentaId, client_id: cliente.id, red: c.red, usuario: c.usuario,
      nombre: String(leido?.datos.nombre ?? "").slice(0, 120), foto: String(leido?.datos.foto ?? "").slice(0, 1000),
      seguidores: leido?.datos.seguidores ?? null, publicaciones: leido?.datos.publicaciones ?? null, mediana,
      error, actualizada_at: t,
    });
    for (const p of publicaciones) {
      const id = `${cuentaId}:${p.externo_id}`;
      filasPubs.push({
        id, client_id: cliente.id, cuenta_id: cuentaId, red: c.red, usuario: c.usuario, ...p,
        texto: String(p.texto ?? "").slice(0, 2200), miniatura: String(p.miniatura ?? "").slice(0, 1500),
        avisado: avisadas.has(id) ? 1 : 0, tipoCuenta: c.tipo, updated_at: t,
      });
    }
  }

  // Avisos: lo nuevo que rinde mucho, una vez y con tope.
  const paraAvisar = filasPubs.filter((p) => debeAvisar({ ...p, fecha: p.publicada_at }, ahora))
    .sort((a, b) => b.rinde - a.rinde).slice(0, MAX_AVISOS);
  for (const p of paraAvisar) p.avisado = 1;

  await acceso.guardarVarios("inspiracion_cuentas", filasCuentas);
  await acceso.guardarVarios("inspiracion_publicaciones", filasPubs.map(({ tipoCuenta: _t, ...fila }) => fila));
  // Lo de las cuentas leídas BIEN que ya no está entre sus últimas (o de cuentas que se quitaron de la lista).
  const leidasBien = new Set(filasCuentas.filter((f) => !f.error).map((f) => f.id));
  const actuales = new Set(filasPubs.map((p) => p.id));
  const vigentes = new Set(todas.map((c) => idDeCuenta(cliente.id, c)));
  const sobran = previas.filter((p) => (leidasBien.has(p.cuenta_id) && !actuales.has(p.id)) || !vigentes.has(p.cuenta_id)).map((p) => p.id);
  if (sobran.length) await acceso.borrarVarios("inspiracion_publicaciones", sobran);
  if (!solo) {
    const cuentasViejas = (await acceso.leerColumnas("inspiracion_cuentas", ["id"], { client_id: cliente.id }, "id asc")).filter((f) => !vigentes.has(f.id));
    if (cuentasViejas.length) await acceso.borrarVarios("inspiracion_cuentas", cuentasViejas.map((f) => f.id));
  }

  if (paraAvisar.length) {
    const para = (await miembrosDe(acceso)).map((m) => m.userId);
    for (const p of paraAvisar) {
      await avisar(env, acceso, {
        para, tipo: "inspiracion",
        texto: `@${p.usuario} publicó ${p.formato === "imagen" ? "una imagen" : `un ${FORMATOS_FEED[p.formato]?.toLowerCase() ?? "contenido"}`} que rinde ${etiquetaRinde(p.rinde)} su promedio (lo sigue ${cliente.name}).`,
        enlace: `/cliente/${encodeURIComponent(cliente.id)}/inspiracion`,
      });
    }
  }
  difundir(env, acceso.ownerId, { tipo: "inspiracion", clientId: cliente.id });
  return { cuentas: filasCuentas.length, publicaciones: filasPubs.length, avisos: paraAvisar.length, errores };
}

/**
 * El feed guardado de un cliente: sus cuentas con su estado y lo que publican, con miniaturas por el proxy. Sólo lo de
 * las cuentas que sigue AHORA. `faltan`: las cuentas que todavía no se han leído nunca (la pantalla pide leerlas).
 */
export async function feedDe(acceso, cliente) {
  const lista = cuentasDe(cliente);
  const filasCuentas = await acceso.leer("inspiracion_cuentas", { client_id: cliente.id }, "usuario asc");
  const porId = new Map(filasCuentas.map((f) => [f.id, f]));
  const pubs = await acceso.leer("inspiracion_publicaciones", { client_id: cliente.id }, "publicada_at desc");
  const tipo = new Map(lista.map((c) => [idDeCuenta(cliente.id, c), c.tipo]));
  const cuentas = lista.map((c) => {
    const f = porId.get(idDeCuenta(cliente.id, c));
    return {
      ...c, clave: claveCuenta(c), feed: REDES_INSPIRACION[c.red].feed,
      nombre: f?.nombre ?? "", foto: proxy(f?.foto ?? ""), seguidores: f?.seguidores ?? null, publicaciones: f?.publicaciones ?? null,
      mediana: f?.mediana ?? null, error: f?.error ?? "", actualizadaAt: f?.actualizada_at ?? null,
    };
  });
  return {
    cuentas,
    faltan: cuentas.filter((c) => !c.actualizadaAt).map((c) => c.clave),
    publicaciones: pubs.filter((p) => tipo.has(p.cuenta_id)).map((p) => ({
      id: p.id, red: p.red, usuario: p.usuario, tipoCuenta: tipo.get(p.cuenta_id), nombre: porId.get(p.cuenta_id)?.nombre ?? "",
      formato: p.formato, video: ["reel", "short", "video"].includes(p.formato), texto: p.texto, fecha: p.publicada_at,
      enlace: p.enlace, codigo: p.codigo, miniatura: proxy(p.miniatura), meGusta: p.me_gusta, comentarios: p.comentarios,
      vistas: p.vistas, interacciones: p.interacciones, rinde: p.rinde, sinArchivo: Boolean(p.sin_archivo),
    })),
  };
}

/** El archivo de una publicación del feed a la galería del cliente (sólo Instagram). → lo de `traerPublicacion`. */
export async function traerDeInspiracion(env, acceso, cliente, id, { miniatura = false } = {}) {
  const p = await acceso.leerUno("inspiracion_publicaciones", { id, client_id: cliente.id });
  if (!p) throw new ErrorInspiracion("Esa publicación ya no está en el feed: actualízalo.", 404);
  if (p.red !== "instagram") throw new ErrorInspiracion("YouTube no deja bajar sus videos: su guion se saca por el enlace («Extraer guion»).", 409);
  try {
    return await traerPublicacion(env, acceso, cliente, { usuario: p.usuario, id: p.externo_id, miniatura });
  } catch (e) {
    if (e instanceof ErrorCompetencia) throw Object.assign(new ErrorInspiracion(e.message, e.estado), e.codigo ? { codigo: e.codigo } : {});
    throw e;
  }
}

/**
 * «Lo que funciona en tu competencia»: la IA lee lo que más rindió y escribe los patrones. PROPONE y no guarda: la
 * persona la guarda con PUT /api/cerebro/<c>/nota. → { titulo, texto, existente: { id } | null, publicaciones: n, aviso }.
 */
export async function proponerResumen(env, acceso, cliente) {
  const { publicaciones } = await feedDe(acceso, cliente);
  const elegidas = paraResumen(publicaciones);
  if (elegidas.length < 3) throw new ErrorInspiracion("Hacen falta al menos 3 publicaciones medidas en el feed (de los últimos 45 días) para ver qué funciona. Actualiza el feed o añade cuentas.", 409);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeResumen({ marca: cliente.name, rubro: cliente.industry ?? "", publicaciones: elegidas }),
    salida: 2500,
    funcion: "lo que funciona en la competencia",
  });
  const texto = leerResumen(r.texto);
  if (!texto) throw new ErrorIA("La IA no devolvió la nota. Inténtalo otra vez.", 502);
  const titulo = tituloDelResumen(fechaEnZona().slice(0, 7));
  const existente = await acceso.leerUno("cerebro_notas", { client_id: cliente.id, ruta: slug(titulo) });
  return { titulo, texto, existente: existente ? { id: existente.id } : null, publicaciones: elegidas.length, aviso: r.aviso ?? null };
}

/**
 * Una vuelta del cron: el siguiente cliente cuyo feed lleva más de CADA_HORAS sin leerse, de cualquier espacio.
 * → 1 si leyó uno, 0 si no había.
 */
export async function inspiracionPendiente(env, ahora = new Date()) {
  const antesDe = new Date(ahora.getTime() - CADA_HORAS * 3600_000).toJSON();
  const [siguiente] = await clientesConInspiracionVieja(env.DB, antesDe, 1);
  if (!siguiente) return 0;
  const acceso = crearAcceso(env.DB, siguiente.owner_id);
  const cliente = await acceso.leerUno("clients", { id: siguiente.id });
  if (!cliente) return 0;
  await actualizarInspiracion(env, acceso, cliente).catch((e) => console.error("cron inspiración:", cliente.id, e?.message));
  return 1;
}
