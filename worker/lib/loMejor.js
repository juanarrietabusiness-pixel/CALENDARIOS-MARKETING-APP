// ============================================================
// «Lo mejor del momento»: lo que toca D1, R2, la IA y Scrape Creators
//
// Lo puro (claves, señales, percentiles, la cifra de la tarjeta, la
// clasificación) está en src/lib/loMejor.js. Aquí:
//
//   · REUNIR las piezas del espacio de sus cuatro fuentes, ya guardadas (la
//     inspiración de cada cliente, las referencias del banco y del estudio de
//     mercado, las métricas propias y los anuncios releídos), sin repetir.
//   · CLASIFICAR cada pieza UNA vez (la IA barata mira su miniatura y su texto):
//     al pedirlo la pantalla o en el cron, unas pocas por vuelta. Lo que falla
//     también queda apuntado (con su fallo), para que el cron no lo repita cada
//     minuto.
//   · RELEER los anuncios de las búsquedas guardadas de Scrape Creators una vez
//     por semana, con el TOPE de créditos del espacio (lo buscado a mano también
//     cuenta). Instagram no gasta créditos: va por la API de Meta (Inspiración).
//     TikTok sí (las cuentas de cada cliente y las TENDENCIAS de sus palabras), y
//     va en la MISMA cola semanal que los anuncios: lo más viejo primero, una
//     tarea por vuelta del cron, sin pasarse nunca del tope; lo que no cabe
//     espera al lunes (`sc_lleno`).
//   · RECREAR una pieza para un cliente: la publicación en su próximo día libre,
//     con el original como REFERENCIA (nunca en `medios`), y lo que la crea —el
//     director con un ENCARGO del servidor (imagen o carrusel), el guion de un
//     video animado o el guion para grabar—. El costo se confirma antes.
//
// Nada de Scrape Creators se ha probado contra el servicio real; la clasificación
// y la recreación, tampoco contra la IA real (los tests usan `fetch` de mentira).
// ============================================================

import { uuid, ahora } from "./ids.js";
import { difundir } from "./vivo.js";
import { obtenerOCrearMes, ErrorMes } from "./meses.js";
import { crearAcceso, tareasScPendientes, espaciosPorClasificar } from "./acceso.js";
import { llamarIA, ErrorIA } from "./cerebro/ia.js";
import { MODELO_HAIKU, sinIADeTexto, prepararIA } from "./configIA.js";
import { traerPublicacion, ErrorCompetencia } from "./competencia.js";
import {
  scConfigurado, buscarAnunciosSC, traerAnuncio, traerTikTok, ErrorSC, creditosDeLaSemana, guardarAjustesDeCreditos, marcarLleno,
  cambiarAjustesSC, TOPE_POR_DEFECTO, DIAS_SC,
} from "./scrapeCreators.js";
import { leerCuentaTikTokDelCron } from "./inspiracion.js";
import { leerTendencia } from "./tendencias.js";
import { leerMercado, extraerUgc, ErrorMercado } from "./mercado.js";
import { crearEncargo } from "./estudio/encargos.js";
import { ErrorEstudio } from "./estudio/trabajos.js";
import { estadoMotores } from "./estudio/motores.js";
import { kitDe } from "./estudio/kit.js";
import { archivoPublico, crearCarpeta } from "./estudio/galeria.js";
import { planDeDiseno, pasoDelPlan, modeloDelCliente } from "./estudio/herramientasDiseno.js";
import { escribirGuion, ErrorGuion } from "./estudio/guionAnimado.js";
import { crearProyecto, ErrorVideo } from "./videosProyectos.js";
import { NULO } from "./acceso.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";
import { plataformaDe } from "../../src/lib/bancoIdeas.js";
import { referenciaLimpia } from "../../src/lib/referenciasPost.js";
import { publicacionDeUgc } from "../../src/lib/ugc.js";
import { fotosDelCatalogo, productosActivos } from "../../src/lib/estudioMercado.js";
import { estimar, ajustesDe, textoCosto, nombreDelModelo } from "../../src/lib/estudioCatalogo.js";
import { limpiarKit, estiloDeMarca, referenciaDeTipografia } from "../../src/lib/kitMarca.js";
import { consultaSC } from "../../src/lib/scrapeCreators.js";
import {
  claveDeInspiracion, claveDeAnuncio, claveDeTendencia, claveDePropia, claveDeEnlace, formatoComun, rindeAjustado, senalDeAnuncio, diasDeAnuncio,
  unirRepetidas, ordenarLoMejor, filtrarLoMejor, marcarMejoresPropias, cifraDe, caminosPosibles, caminoPorDefecto, briefDeRecreacion,
  tituloDeRecreacion, proximoDiaLibre, semanaDe, pedidoDeClasificacion, leerClasificacion, nombreDelTipo,
  proxyMiniatura, proxyVideo, miniaturaPermitida, CAMINOS, FORMATO_DE_CAMINO, CLASIFICAR_POR_VUELTA, DIAS_MAX, VENTANAS,
} from "../../src/lib/loMejor.js";
import { mediana } from "../../src/lib/inspiracion.js";

const DIA = 86_400_000;
/** Lo más que se enseña de una ventana (la pantalla y Claude). */
export const MAX_LISTA = 150;
// El tope de créditos vive con Scrape Creators (lo comparten anuncios y TikTok); se reexporta para quien lo leía de aquí.
export { TOPE_POR_DEFECTO, creditosDeLaSemana };
/** Cuántos anuncios se guardan de cada búsqueda en cada relectura. */
const POR_FILTRO = 30;
/** Una clasificación que falló se vuelve a intentar (a pedido) pasado esto. */
const REINTENTO_MS = 6 * 3600_000;
/** Una miniatura más grande no se le manda a la IA (ni se usa de imagen especial del director). */
const MAX_MINIATURA = 500_000;

/** Un fallo que se le dice a la persona, con su estado (y un código para la pantalla: «confirmar»). */
export class ErrorLoMejor extends Error {
  constructor(mensaje, estado = 400, extra = {}) {
    super(mensaje);
    this.estado = estado;
    Object.assign(this, extra);
  }
}

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t ?? "") ?? d; } catch { return d; }
};
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const idPublicacion = () => `p${uuid().replace(/-/g, "").slice(0, 12)}`;
const activosDe = (env) => Object.fromEntries(Object.entries(estadoMotores(env)).map(([k, v]) => [k, Boolean(v.activo)]));
const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ------------------------------------------------------------
// Reunir
// ------------------------------------------------------------

/** Las medianas de una lista por grupo (la cuenta): { grupo → { mediana, n } }. */
function medianasPor(filas, grupo, valor) {
  const por = new Map();
  for (const f of filas) {
    const g = grupo(f);
    if (!por.has(g)) por.set(g, []);
    por.get(g).push(valor(f));
  }
  return new Map([...por].map(([g, v]) => [g, { mediana: mediana(v), n: v.length }]));
}

async function deInspiracion(acceso, { cliente, desde, sc }) {
  const filas = await acceso.leerColumnas("inspiracion_publicaciones",
    ["id", "client_id", "cuenta_id", "red", "usuario", "externo_id", "codigo", "formato", "enlace", "texto", "miniatura", "video", "publicada_at", "me_gusta", "comentarios", "vistas", "compartidos", "interacciones", "rinde", "sin_archivo"],
    cliente ? { client_id: cliente } : {}, "publicada_at desc", 3000).catch(() => []);
  const cuentas = new Map((await acceso.leerColumnas("inspiracion_cuentas", ["id", "nombre"], cliente ? { client_id: cliente } : {}, "id asc").catch(() => [])).map((c) => [c.id, c]));
  const medidas = medianasPor(filas, (f) => f.cuenta_id, (f) => Number(f.interacciones) || 0);
  const vistas = medianasPor(filas.filter((f) => f.red === "youtube"), (f) => f.cuenta_id, (f) => Number(f.vistas) || 0);
  return filas.filter((f) => String(f.publicada_at ?? "") >= desde).map((f) => {
    const n = medidas.get(f.cuenta_id)?.n ?? 0;
    const mv = vistas.get(f.cuenta_id)?.mediana;
    // TikTok ya guarda su «rinde» en VISTAS (src/lib/inspiracion.js, `campoDeRendimiento`): la tarjeta dice «en vistas».
    const rindeVistas = f.red === "tiktok" ? (Number.isFinite(f.rinde) ? f.rinde : null)
      : f.red === "youtube" && mv > 0 && n >= 3 ? Math.round(((Number(f.vistas) || 0) / mv) * 10) / 10 : null;
    const rinde = Number.isFinite(f.rinde) ? f.rinde : null;
    const formato = formatoComun(f.formato);
    const tiktok = f.red === "tiktok";
    return {
      clave: claveDeInspiracion(f), fuente: "inspiracion", red: f.red, formato, formatoOriginal: f.formato,
      cuenta: f.red === "youtube" ? cuentas.get(f.cuenta_id)?.nombre || `@${f.usuario}` : `@${f.usuario}`, usuario: f.usuario,
      texto: corto(f.texto, 600), enlace: f.enlace, fecha: f.publicada_at,
      miniaturaOriginal: f.miniatura, miniatura: proxyMiniatura(f.miniatura), video: proxyVideo(f.video),
      // De TikTok sólo se puede VER el video si se sabe su archivo o Scrape Creators puede dar otra dirección.
      conVideo: f.red === "youtube" || (formato === "video" && !f.sin_archivo && (!tiktok || Boolean(f.video) || sc)),
      sinArchivo: Boolean(f.sin_archivo) || (tiktok && formato === "video" && !f.video && !sc),
      clientes: [f.client_id], rinde, rindeVistas,
      senal: rindeAjustado(rindeVistas ?? rinde, n),
      cifras: { meGusta: f.me_gusta, comentarios: f.comentarios, vistas: f.vistas, compartidos: f.compartidos ?? 0 },
      origenes: [{ fuente: "inspiracion", id: f.id, clienteId: f.client_id, red: f.red, usuario: f.usuario, externoId: f.externo_id, ...(tiktok ? { video: f.video, imagen: f.miniatura, enlace: f.enlace, formato: f.formato } : {}) }],
    };
  });
}

/** Los videos de tendencia de TikTok de las palabras de cada cliente (sólo con las tendencias encendidas). */
async function deTendencias(acceso, { cliente, desde, sc }) {
  const ajustes = await acceso.leerUno("lo_mejor_ajustes", { id: acceso.ownerId }).catch(() => null);
  if (ajustes && ajustes.tiktok_tendencias === 0) return [];
  const filas = await acceso.leer("tendencias_videos", cliente ? { client_id: cliente } : {}, "visto_at desc", 2000).catch(() => []);
  return filas.filter((v) => String(v.visto_at ?? "") >= desde).map((v) => {
    const formato = formatoComun(v.formato);
    return {
      clave: claveDeTendencia(v), fuente: "tendencia", red: "tiktok", formato, formatoOriginal: v.formato,
      cuenta: v.usuario ? `@${v.usuario}` : v.nombre || "TikTok", usuario: v.usuario, texto: corto(v.texto, 600), enlace: v.enlace,
      // Es «del momento» mientras sale en la búsqueda de su palabra: su fecha es la de la última lectura.
      fecha: v.visto_at, publicadaAt: v.publicada_at, miniaturaOriginal: v.miniatura, miniatura: proxyMiniatura(v.miniatura), video: proxyVideo(v.video),
      conVideo: formato === "video" && (Boolean(v.video) || sc), sinArchivo: formato === "video" && !v.video && !sc,
      clientes: [v.client_id], rinde: null, senal: Number(v.vistas) || 0,
      cifras: { vistas: v.vistas, meGusta: v.me_gusta, comentarios: v.comentarios, compartidos: v.compartidos, palabra: v.palabra },
      origenes: [{ fuente: "tendencia", id: v.id, clienteId: v.client_id, red: "tiktok", usuario: v.usuario, externoId: v.externo_id, video: v.video, imagen: v.miniatura, enlace: v.enlace, formato: v.formato }],
    };
  });
}

async function deAnuncios(acceso, { cliente, desde, hoy }) {
  const filas = await acceso.leer("lo_mejor_anuncios", cliente ? { client_id: cliente } : {}, "visto_at desc", 2000).catch(() => []);
  return filas.filter((a) => String(a.visto_at ?? "") >= desde).map((a) => {
    const formato = formatoComun(a.formato);
    return {
      clave: claveDeAnuncio(a), fuente: "anuncio", red: "facebook", formato, formatoOriginal: a.formato,
      cuenta: a.pagina || "Anuncio", texto: corto([a.titulo, a.texto].filter(Boolean).join(" — "), 600), enlace: a.enlace,
      // Un anuncio es «del momento» mientras se le ve correr: su fecha es la de la última relectura.
      fecha: a.visto_at, miniaturaOriginal: a.miniatura, miniatura: proxyMiniatura(a.miniatura), video: proxyVideo(a.video),
      conVideo: Boolean(a.video), clientes: a.client_id ? [a.client_id] : [],
      senal: senalDeAnuncio({ inicio: a.inicio, fin: a.fin, activo: Boolean(a.activo), versiones: a.versiones }, hoy),
      cifras: { dias: diasDeAnuncio({ inicio: a.inicio, fin: a.fin, activo: Boolean(a.activo) }, hoy), activo: Boolean(a.activo), versiones: a.versiones },
      origenes: [{ fuente: "anuncio", id: a.id, anuncioId: a.anuncio_id, pagina: a.pagina, video: a.video, imagen: a.miniatura, clienteId: a.client_id }],
    };
  });
}

async function dePropias(acceso, { cliente, desde }) {
  const filas = await acceso.leerColumnas("metricas_publicacion",
    ["id", "client_id", "cuenta_id", "red", "externo_id", "tipo", "enlace", "texto", "miniatura", "publicada_at", "me_gusta", "comentarios", "guardados", "compartidos", "vistas", "interacciones"],
    cliente ? { client_id: cliente } : {}, "publicada_at desc", 3000).catch(() => []);
  const valor = (f) => (Number(f.interacciones) || 0) + (Number(f.guardados) || 0) + (Number(f.compartidos) || 0);
  const medidas = medianasPor(filas, (f) => f.cuenta_id, valor);
  return filas.filter((f) => f.client_id && String(f.publicada_at ?? "") >= desde).map((f) => {
    const m = medidas.get(f.cuenta_id);
    const rinde = m?.n >= 3 && m.mediana > 0 ? Math.round((valor(f) / m.mediana) * 10) / 10 : null;
    return {
      clave: claveDePropia(f), fuente: "propia", red: f.red, formato: formatoComun(f.tipo), formatoOriginal: f.tipo,
      cuenta: "", texto: corto(f.texto, 600), enlace: f.enlace, fecha: f.publicada_at,
      miniaturaOriginal: f.miniatura, miniatura: proxyMiniatura(f.miniatura), video: "", conVideo: false,
      clientes: [f.client_id], rinde, senal: rindeAjustado(rinde, m?.n ?? 0),
      cifras: { interacciones: f.interacciones, guardados: f.guardados, compartidos: f.compartidos, vistas: f.vistas },
      origenes: [{ fuente: "propia", id: f.id, clienteId: f.client_id }],
    };
  });
}

/** Las referencias del banco (ideas con enlace) y las del estudio de mercado de cada cliente. */
async function deReferencias(acceso, { cliente, desde }) {
  const salida = [];
  const banco = await acceso.leer("banco_ideas", {}, "created_at desc", 2000).catch(() => []);
  for (const f of banco) {
    if (cliente && f.client_id !== cliente) continue;
    if (String(f.created_at ?? "") < desde) continue;
    const d = leerJSON(f.datos, {});
    const enlace = String(d.referenceLink ?? "");
    if (!enlace) continue;
    const archivo = (Array.isArray(d.archivos) ? d.archivos : []).find((a) => a?.src) ?? null;
    const red = plataformaDe(enlace) || "web";
    salida.push({
      clave: d.loMejor?.clave || claveDeEnlace(enlace), fuente: "referencia", red, formato: formatoComun(d.format),
      formatoOriginal: d.format, cuenta: d.enlaceAutor ? String(d.enlaceAutor) : "", texto: corto(d.enlaceTitulo || d.idea || d.descripcion, 600),
      enlace, fecha: f.created_at, miniaturaOriginal: d.miniatura ?? "", miniatura: d.miniatura ? proxyMiniatura(d.miniatura) : archivo?.tipo === "imagen" ? archivo.src : "",
      video: archivo?.tipo === "video" ? archivo.src : "", conVideo: archivo?.tipo === "video" || red === "youtube",
      clientes: f.client_id ? [f.client_id] : [], rinde: Number.isFinite(d.rinde) ? d.rinde : null,
      // Lo guardado por el equipo no tiene métrica propia: pesa lo que traía (su «rinde») o lo reciente.
      senal: Number.isFinite(d.rinde) ? d.rinde : Date.parse(f.created_at) / DIA,
      cifras: {}, origenes: [{ fuente: "banco", id: f.id, clienteId: f.client_id ?? null, archivo }],
    });
  }
  const mercados = await acceso.leerColumnas("mercado_clientes", ["client_id", "referencias"], cliente ? { client_id: cliente } : {}).catch(() => []);
  for (const m of mercados) {
    for (const r of leerJSON(m.referencias, [])) {
      if (!r?.clave || String(r.creadaAt ?? "") < desde) continue;
      const video = r.medio === "video";
      const src = `/api/media/${r.clave}`;
      salida.push({
        clave: r.enlace ? claveDeEnlace(r.enlace) : `ref:${String(r.id ?? r.clave).slice(0, 60)}`, fuente: "referencia",
        red: r.enlace ? plataformaDe(r.enlace) || "web" : r.origen === "organico" ? "instagram" : "facebook",
        formato: video ? "video" : "imagen", formatoOriginal: r.medio, cuenta: r.competidor ?? "",
        texto: corto(r.analisis?.gancho || r.nota, 600), idea: corto(r.analisis?.porQueFunciona, 300), enlace: r.enlace ?? "",
        fecha: r.creadaAt, miniaturaOriginal: "", miniatura: video ? "" : src, video: video ? src : "", conVideo: video,
        clientes: [m.client_id], rinde: null, senal: Date.parse(r.creadaAt) / DIA, cifras: {},
        origenes: [{ fuente: "mercado", id: r.id, clienteId: m.client_id, archivo: r.archivoId ? { id: r.archivoId, src, tipo: video ? "video" : "imagen" } : null }],
      });
    }
  }
  return salida;
}

/** Lo que ya se sabe de cada pieza (su tipo, su idea), por su clave. */
async function clasificacionesDe(acceso, claves) {
  const filas = claves.length ? await acceso.leerVarios("lo_mejor_piezas", ["clave", "tipo", "camino", "persona", "idea", "datos", "clasificada_at", "updated_at"], "clave", claves) : [];
  return new Map(filas.map((f) => [f.clave, f]));
}

/**
 * Todas las piezas del espacio (o de un cliente) de los últimos DIAS_MAX días, sin repetir, con lo que se sabe de cada
 * una. Sin ordenar: la ventana la pone quien llama.
 */
export async function piezasDelEspacio(env, acceso, { cliente = "", sinFecha = false } = {}) {
  const hoy = fechaEnZona();
  // `sinFecha`: para buscar UNA pieza por su clave (recrear, traer), también lo más viejo (una referencia de hace meses).
  const desde = sinFecha ? "" : sumarDias(hoy, -DIAS_MAX);
  const opciones = { cliente: cliente || "", desde, hoy, sc: scConfigurado(env) };
  const listas = await Promise.all([
    deInspiracion(acceso, opciones), deAnuncios(acceso, opciones), dePropias(acceso, opciones), deReferencias(acceso, opciones), deTendencias(acceso, opciones),
  ]);
  const piezas = unirRepetidas(listas.flat().filter((p) => p.clave && !p.clave.endsWith(":undefined")));
  const sabidas = await clasificacionesDe(acceso, piezas.map((p) => p.clave));
  return piezas.map((p) => {
    const s = sabidas.get(p.clave);
    const datos = leerJSON(s?.datos, {});
    return {
      ...p,
      tipo: s?.tipo || "", etiqueta: datos.etiqueta ?? "", persona: Boolean(s?.persona), idea: s?.idea || p.idea || "",
      camino: s?.camino || "", clasificada: Boolean(s?.clasificada_at), falloClasificar: s && !s.clasificada_at ? { at: s.updated_at, motivo: datos.fallo ?? "" } : null,
    };
  });
}

/** Lo que va a la pantalla (sin lo que sólo usa el servidor para traer el archivo). */
export function piezaPublica(p) {
  const { origenes, falloClasificar: _f, ...resto } = p;
  return {
    ...resto,
    cifra: cifraDe(p),
    tipoNombre: nombreDelTipo(p),
    caminos: caminosPosibles(p),
    caminoSugerido: caminoPorDefecto(p),
    // Lo del estudio de mercado y el banco lleva su archivo de la galería: la pantalla lo usa para «Extraer guion».
    archivo: origenes?.find((o) => o.archivo)?.archivo ?? null,
  };
}

/**
 * Una ventana ordenada y filtrada: { piezas, total, sinClasificar }. Con `pieza` (la clave de un aviso), esa va
 * primero aunque no entre en la ventana.
 */
export async function loMejor(env, acceso, { ventana = "semana", cliente = "", red = "", formato = "", tipo = "", fuente = "", pieza = "", max = MAX_LISTA } = {}) {
  const v = VENTANAS.some((x) => x.id === ventana) ? ventana : "semana";
  const todas = await piezasDelEspacio(env, acceso, { cliente });
  const ordenadas = marcarMejoresPropias(ordenarLoMejor(todas, v), v);
  const filtradas = filtrarLoMejor(ordenadas, { red, formato, tipo, fuente });
  let lista = filtradas.slice(0, Math.max(1, Math.min(MAX_LISTA, Number(max) || MAX_LISTA)));
  if (pieza) {
    const destacada = todas.find((p) => p.clave === pieza);
    if (destacada) lista = [{ ...destacada, destacada: true }, ...lista.filter((p) => p.clave !== pieza)];
  }
  return {
    ventana: v,
    total: filtradas.length,
    sinClasificar: filtradas.filter((p) => !p.tipo).length,
    piezas: lista.map(piezaPublica),
  };
}

// ------------------------------------------------------------
// Miniaturas (para la IA y para el director)
// ------------------------------------------------------------

const aBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** La miniatura de una pieza como { media_type, data } (base64), o null. Del CDN permitido o de R2 (lo de la galería). */
export async function miniaturaDe(env, p) {
  try {
    let bytes = null;
    let tipo = "";
    const propia = /^\/api\/media\/(clientes\/.+)$/.exec(String(p?.miniatura ?? ""));
    if (propia && env.MEDIA) {
      const obj = await env.MEDIA.get(decodeURIComponent(propia[1]));
      if (!obj) return null;
      bytes = new Uint8Array(await obj.arrayBuffer());
      tipo = obj.httpMetadata?.contentType || "image/jpeg";
    } else if (miniaturaPermitida(p?.miniaturaOriginal)) {
      const r = await fetch(p.miniaturaOriginal, { redirect: "follow" });
      if (!r.ok) return null;
      tipo = (r.headers.get("content-type") ?? "").split(";")[0];
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    if (!bytes || bytes.byteLength > MAX_MINIATURA || !/^image\/(jpeg|png|webp)$/.test(tipo)) return null;
    return { media_type: tipo, data: aBase64(bytes) };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// Clasificar (la IA barata, una vez por pieza)
// ------------------------------------------------------------

/** El modelo de la clasificación: Haiku sin razonar si hay llave de Anthropic; si no, el del espacio (Meta). */
const modeloBarato = (env) => (env.ANTHROPIC_API_KEY ? MODELO_HAIKU : null);

/**
 * Clasifica hasta `max` piezas sin tipo (las de `claves`, o las mejores de la semana y el mes que aún no lo tienen).
 * → { clasificadas: n, fallo: "" }. Lo que no se pudo queda apuntado con su motivo.
 */
export async function clasificarPendientes(env, acceso, { claves = null, max = CLASIFICAR_POR_VUELTA, cliente = "" } = {}) {
  if (sinIADeTexto(env)) return { clasificadas: 0, fallo: "No hay llave de IA de texto." };
  const todas = await piezasDelEspacio(env, acceso, { cliente });
  const ahoraMs = Date.now();
  const pendiente = (p) => !p.tipo && (!p.falloClasificar || ahoraMs - Date.parse(p.falloClasificar.at ?? 0) > REINTENTO_MS);
  let candidatas;
  if (Array.isArray(claves) && claves.length) {
    const set = new Set(claves.map(String));
    candidatas = todas.filter((p) => set.has(p.clave) && pendiente(p));
  } else {
    // Primero lo mejor de la semana y del mes; después todo lo demás de los últimos días: lo que la consulta del cron ve
    // sin clasificar TIENE que poder clasificarse aquí, o el cron volvería a este espacio cada minuto.
    const vistas = new Set();
    candidatas = [...ordenarLoMejor(todas, "semana"), ...ordenarLoMejor(todas, "mes"), ...todas]
      .filter((p) => pendiente(p) && !vistas.has(p.clave) && vistas.add(p.clave));
  }
  const tanda = candidatas.slice(0, Math.max(1, Math.min(CLASIFICAR_POR_VUELTA, Number(max) || CLASIFICAR_POR_VUELTA)));
  if (!tanda.length) return { clasificadas: 0, fallo: "" };

  const vistasIA = await Promise.all(tanda.map((p) => miniaturaDe(env, p)));
  const bloques = [];
  tanda.forEach((p, i) => {
    if (!vistasIA[i]) return;
    bloques.push({ type: "text", text: `Pieza ${i + 1}:` }, { type: "image", source: { type: "base64", ...vistasIA[i] } });
  });
  const texto = pedidoDeClasificacion(tanda.map((p, i) => ({ ...p, miniatura: Boolean(vistasIA[i]) })));
  const momento = ahora();
  const fila = (p, extra) => ({ id: `${acceso.ownerId}|${p.clave}`.slice(0, 200), clave: p.clave, updated_at: momento, ...extra });
  let leido = {};
  let fallo = "";
  try {
    const r = await llamarIA(env, acceso, null, {
      prompt: bloques.length ? [...bloques, { type: "text", text: texto }] : texto,
      salida: 1500, funcion: "clasificar lo mejor", modelo: modeloBarato(env), esfuerzo: "low",
    });
    leido = leerClasificacion(r.texto, tanda.length);
    if (!Object.keys(leido).length) fallo = "La IA no devolvió una clasificación que se pueda leer.";
  } catch (e) {
    fallo = e instanceof ErrorIA ? e.message : String(e?.message ?? e).slice(0, 200);
  }
  const filas = tanda.map((p, i) => {
    const c = leido[i + 1];
    if (!c) return fila(p, { tipo: "", camino: "", persona: 0, idea: "", datos: JSON.stringify({ fallo: fallo || "Sin respuesta para esta pieza." }), clasificada_at: null });
    const camino = caminoPorDefecto({ ...p, tipo: c.tipo, persona: c.persona });
    return fila(p, { tipo: c.tipo, camino, persona: c.persona ? 1 : 0, idea: c.idea, datos: JSON.stringify(c.etiqueta ? { etiqueta: c.etiqueta } : {}), clasificada_at: momento });
  });
  await acceso.guardarVarios("lo_mejor_piezas", filas);
  const clasificadas = filas.filter((f) => f.clasificada_at).length;
  if (clasificadas) difundir(env, acceso.ownerId, { tipo: "lo-mejor", que: "clasificadas", n: clasificadas, por: { userId: "sistema", nombre: "Lo mejor", color: "", tab: null } });
  return { clasificadas, fallo };
}

// ------------------------------------------------------------
// Los créditos de Scrape Creators y los anuncios de cada semana
// ------------------------------------------------------------

/** Cambia el tope semanal (0 apaga lo automático) y/o el interruptor de las tendencias de TikTok. */
export async function guardarTope(acceso, tope, { tendencias } = {}) {
  try {
    return await guardarAjustesDeCreditos(acceso, { ...(tope !== undefined ? { tope } : {}), ...(tendencias !== undefined ? { tendencias } : {}) });
  } catch (e) {
    if (e instanceof ErrorSC) throw new ErrorLoMejor(e.message, e.status);
    throw e;
  }
}

/**
 * Lo que espera su lectura por Scrape Creators en este espacio (lleva una semana o nunca se leyó): las cuentas de
 * TikTok, las palabras de tendencia (si están encendidas) y si los anuncios de las búsquedas guardadas esperan. Para
 * Ajustes: «faltan 3 cuentas de TikTok por leer». → { tiktok, palabras, anuncios, busquedas }.
 */
export async function esperaDelEspacio(acceso, ahoraMs = Date.now()) {
  const corte = new Date(ahoraMs - DIAS_SC * DIA).toJSON();
  const viejo = (f) => !f || String(f) < corte;
  const [cuentas, palabras, filtros, ajustes] = await Promise.all([
    acceso.leerColumnas("inspiracion_cuentas", ["id", "leida_sc_at"], { red: "tiktok" }, "id asc").catch(() => []),
    acceso.leerColumnas("tendencias_palabras", ["id", "leida_at"], {}, "id asc").catch(() => []),
    acceso.leerColumnas("biblioteca_filtros", ["id", "consulta"], {}, "id asc").catch(() => []),
    acceso.leerUno("lo_mejor_ajustes", { id: acceso.ownerId }).catch(() => null),
  ]);
  const busquedas = filtros.filter((f) => leerJSON(f.consulta, {})?.fuente === "sc").length;
  return {
    tiktok: cuentas.filter((c) => viejo(c.leida_sc_at)).length,
    palabras: ajustes?.tiktok_tendencias === 0 ? 0 : palabras.filter((p) => viejo(p.leida_at)).length,
    anuncios: busquedas > 0 && viejo(ajustes?.sc_releido_at),
    busquedas,
  };
}

/** Un anuncio de Scrape Creators como fila de `lo_mejor_anuncios`. Pura. */
export function filaDeAnuncio(a, filtro, momento = ahora()) {
  const imagen = a.imagenes?.[0] ?? a.videos?.[0]?.portada ?? a.versiones?.[0]?.imagenes?.[0] ?? "";
  return {
    id: `${filtro.id}:${a.id}`.slice(0, 160), client_id: filtro.client_id ?? null, filtro_id: filtro.id, anuncio_id: a.id,
    pagina: corto(a.pagina, 120), texto: corto(a.texto, 1500), titulo: corto(a.titulo, 200), formato: a.formato,
    miniatura: String(imagen).slice(0, 1500), video: String(a.videos?.[0]?.video ?? "").slice(0, 1500),
    enlace: a.enlace, destino: String(a.destino ?? "").slice(0, 1000), activo: a.activo ? 1 : 0, inicio: a.inicio || null,
    fin: a.fin || null, versiones: Math.max(a.versiones?.length ?? 0, a.relacionados ?? 0, 1),
    plataformas: JSON.stringify(a.plataformas ?? []), visto_at: momento, updated_at: momento,
  };
}

/**
 * Relee los anuncios de las búsquedas guardadas de Scrape Creators, hasta el tope de la semana. Lo que sale de la
 * caché no gasta. → { filtros, anuncios, creditos, tope, total, sinCreditos, errores }.
 */
export async function releerAnuncios(env, acceso, { fuente = "auto", hoy = fechaEnZona() } = {}) {
  if (!scConfigurado(env)) throw new ErrorLoMejor("Falta la llave de Scrape Creators (SCRAPECREATORS_API_KEY en los secretos del Worker).", 503);
  const filtros = (await acceso.leer("biblioteca_filtros", {}, "created_at asc"))
    .map((f) => ({ ...f, consulta: leerJSON(f.consulta, {}) }))
    .filter((f) => f.consulta?.fuente === "sc");
  const cuenta = await creditosDeLaSemana(acceso, hoy);
  let total = cuenta.total;
  let gastados = 0;
  let intentados = 0;
  let sinCreditos = false;
  const errores = [];
  const momento = ahora();
  const filas = [];
  for (const f of filtros) {
    if (total >= cuenta.tope) { sinCreditos = true; break; }
    intentados++;
    const { consulta, errores: mal } = consultaSC(f.consulta);
    if (mal.length) { errores.push(`${f.nombre}: ${mal.join(" ")}`); continue; }
    try {
      const r = await buscarAnunciosSC(env, acceso, consulta, "", { fuente });
      if (!r.cache) { total++; gastados++; }
      for (const a of (r.anuncios ?? []).slice(0, POR_FILTRO)) if (a.id) filas.push(filaDeAnuncio(a, f, momento));
    } catch (e) {
      errores.push(`${f.nombre}: ${e?.message ?? e}`.slice(0, 240));
      if (e instanceof ErrorSC && e.status === 402) break;
    }
  }
  if (filas.length) await acceso.guardarVarios("lo_mejor_anuncios", filas);
  // Lo que lleva más de tres meses sin verse ya no es «del momento».
  const viejos = (await acceso.leerColumnas("lo_mejor_anuncios", ["id", "visto_at"], {}, "visto_at asc", 500).catch(() => []))
    .filter((a) => String(a.visto_at ?? "") < new Date(Date.now() - 90 * DIA).toJSON()).map((a) => a.id);
  if (viejos.length) await acceso.borrarVarios("lo_mejor_anuncios", viejos);
  // Si se paró en el tope, lo automático de este espacio (las cuentas y las tendencias de TikTok) espera al lunes. Sin
  // haber intentado ninguna búsqueda, los anuncios NO cuentan como releídos: van primero en cuanto haya créditos.
  await cambiarAjustesSC(acceso, {
    ...(intentados || !filtros.length ? { sc_releido_at: momento } : {}),
    ...(sinCreditos ? { sc_lleno: cuenta.semana } : {}),
  });
  difundir(env, acceso.ownerId, { tipo: "lo-mejor", que: "anuncios", n: filas.length, por: { userId: "sistema", nombre: "Lo mejor", color: "", tab: null } });
  return { filtros: filtros.length, anuncios: filas.length, creditos: gastados, tope: cuenta.tope, total, sinCreditos, errores };
}

/**
 * Una vuelta del cron (la última de la cadena: sólo si las otras no hicieron nada). Primero UNA tarea de la cola de
 * Scrape Creators —los anuncios de las búsquedas guardadas de un espacio, una cuenta de TikTok o una palabra de
 * tendencia que lleven una semana sin leerse—, LO MÁS VIEJO PRIMERO y sin pasarse del tope semanal del espacio: si ya
 * no cabe, el espacio se marca lleno y su cola espera al lunes (no se mira cada minuto). Si no hay nada que leer, unas
 * pocas piezas sin clasificar de un espacio. → 1 si hizo algo.
 */
export async function loMejorPendiente(env, ahoraFecha = new Date()) {
  const t = ahoraFecha.getTime();
  if (scConfigurado(env)) {
    const hoy = fechaEnZona(ahoraFecha);
    const [tarea] = await tareasScPendientes(env.DB, new Date(t - DIAS_SC * DIA).toJSON(), semanaDe(hoy), 1);
    if (tarea) {
      const acceso = crearAcceso(env.DB, tarea.owner_id);
      const { tope, total, semana } = await creditosDeLaSemana(acceso, hoy);
      if (tope <= 0 || total >= tope) {
        await marcarLleno(acceso, semana);
        return 1;
      }
      const fallo = (x) => console.error(`cron lo mejor (${tarea.tipo}):`, tarea.owner_id, x?.message);
      if (tarea.tipo === "anuncios") await releerAnuncios(env, acceso, { fuente: "auto", hoy }).catch(fallo);
      else if (tarea.tipo === "tiktok") await leerCuentaTikTokDelCron(env, acceso, tarea.id).catch(fallo);
      else if (tarea.tipo === "tendencia") await leerTendencia(env, acceso, tarea.id, { fuente: "auto" }).catch(fallo);
      return 1;
    }
  }
  if (sinIADeTexto(env)) return 0;
  // Dos días de margen sobre lo que se reúne (DIAS_MAX): el cron no debe ver como pendiente algo que no se va a clasificar.
  const [c] = await espaciosPorClasificar(env.DB, new Date(t - (DIAS_MAX - 2) * DIA).toJSON(), 1);
  if (!c) return 0;
  await clasificarPendientes(env, crearAcceso(env.DB, c.owner_id)).catch((x) => console.error("cron lo mejor (clasificar):", c.owner_id, x?.message));
  return 1;
}

// ------------------------------------------------------------
// Traer el archivo de una pieza a la galería de un cliente (sin pagar dos veces)
// ------------------------------------------------------------

/**
 * El archivo de la pieza en la galería de `cliente`: el que ya estaba (de una referencia de ese cliente, o lo bajado
 * antes: `bajarALaGaleria` no repite una descarga) o el que se baja ahora. null si no hay forma (YouTube, lo propio).
 * De TikTok, por Scrape Creators (`traerTikTok`). Con `miniatura`, la imagen (para un reel con música, o para mirarla).
 */
export async function traerArchivo(env, acceso, cliente, p, { miniatura = false } = {}) {
  for (const o of p.origenes ?? []) {
    if (o.archivo?.id && o.clienteId === cliente.id) {
      const f = await acceso.leerUno("estudio_archivos", { id: String(o.archivo.id), client_id: cliente.id });
      if (f && !f.borrado_at) return archivoPublico(f);
    }
  }
  const ig = (p.origenes ?? []).find((o) => o.fuente === "inspiracion" && o.red === "instagram");
  // TikTok (una cuenta que sigue el cliente o una tendencia): su archivo por su dirección o, si caducó, la que dé
  // Scrape Creators; si TikTok no lo da, 409 `sin_archivo` y se trabaja con la miniatura y el texto.
  const tt = (p.origenes ?? []).find((o) => o.red === "tiktok" && (o.fuente === "inspiracion" || o.fuente === "tendencia"));
  try {
    if (ig) return (await traerPublicacion(env, acceso, cliente, { usuario: ig.usuario, id: ig.externoId, miniatura: miniatura || p.sinArchivo })).archivo;
    if (tt) {
      return await traerTikTok(env, acceso, cliente, { id: tt.externoId, usuario: tt.usuario, video: tt.video, miniatura: tt.imagen, enlace: tt.enlace, formato: tt.formato }, { miniatura });
    }
    const ad = (p.origenes ?? []).find((o) => o.fuente === "anuncio");
    if (ad) {
      const video = !miniatura && ad.video;
      return await traerAnuncio(env, acceso, cliente, { url: video ? ad.video : ad.imagen, tipo: video ? "video" : "imagen", id: ad.anuncioId, pagina: ad.pagina });
    }
  } catch (e) {
    if (e instanceof ErrorCompetencia || e instanceof ErrorSC) throw new ErrorLoMejor(e.message, e.estado ?? e.status ?? 502, e.codigo ? { codigo: e.codigo } : {});
    throw e;
  }
  return null;
}

// ------------------------------------------------------------
// Recrear para un cliente
// ------------------------------------------------------------

/** Los días ocupados de un cliente (con alguna publicación), de este mes en adelante. */
async function diasOcupados(acceso, clienteId, desde) {
  const cals = await acceso.leerColumnas("calendars", ["id", "year", "month", "days"], { client_id: clienteId }, "year desc, month desc", 24);
  const mes = desde.slice(0, 7);
  const ocupados = [];
  for (const c of cals) {
    if (`${c.year}-${String(c.month + 1).padStart(2, "0")}` < mes) continue;
    for (const d of leerJSON(c.days, [])) if ((d?.posts ?? []).length) ocupados.push(String(d.date));
  }
  return ocupados;
}

/** Mete la publicación en su día (crea el mes si hace falta) y avisa a las pantallas abiertas. → { calendarId }. */
async function meterPublicacion(env, acceso, cliente, fecha, post) {
  let cal;
  try {
    cal = (await obtenerOCrearMes(acceso, cliente.id, Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1)).fila;
  } catch (e) {
    if (e instanceof ErrorMes) throw new ErrorLoMejor(e.message, e.estado);
    throw e;
  }
  const days = leerJSON(cal.days, []);
  let dia = days.find((d) => d.date === fecha);
  if (!dia) {
    dia = { date: fecha, dayName: DIAS_SEMANA[new Date(`${fecha}T12:00:00Z`).getUTCDay()], posts: [] };
    days.push(dia);
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  dia.posts = [...(dia.posts ?? []), post];
  await acceso.actualizar("calendars", { id: cal.id }, { days: JSON.stringify(days), updated_at: ahora() });
  // Sin pestaña: también la que pidió la recreación relee el mes (el eco de la propia pestaña se descarta).
  difundir(env, acceso.ownerId, { tipo: "calendario:recargar", id: cal.id, clientId: cliente.id, por: { userId: "sistema", nombre: "Lo mejor", color: "", tab: null } });
  return { calendarId: cal.id };
}

/** El costo aproximado de recrear por un camino: { costo, detalle }. */
async function costoDe(env, acceso, cliente, p, camino) {
  const activos = activosDe(env);
  const kit = kitDe(cliente);
  if (camino === "imagen" || camino === "carrusel") {
    const modelo = modeloDelCliente(activos, kit);
    if (!modelo) throw new ErrorLoMejor("No hay ningún modelo de imagen con llave (Ajustes → IA).", 409);
    const una = estimar(modelo, 1, ajustesDe(modelo, { aspectRatio: "4:5" }, {}));
    if (camino === "imagen") return { costo: una + 0.04, detalle: `la imagen con ${nombreDelModelo(modelo.id)} (${textoCosto(una)}), el director y la revisión` };
    return { costo: una * 6 + 0.08, detalle: `de 5 a 8 láminas con ${nombreDelModelo(modelo.id)} (${textoCosto(una)} cada una), el director y la revisión` };
  }
  if (camino === "animado") return { costo: 0.06, detalle: "el guion del video animado (la voz y el render se piden después, con su costo)" };
  const yt = p.red === "youtube" ? await acceso.leerUno("lo_mejor_piezas", { id: `${acceso.ownerId}|${p.clave}`.slice(0, 200) }).catch(() => null) : null;
  const yaVisto = Boolean(leerJSON(yt?.datos, {}).transcripcion);
  return { costo: yaVisto ? 0.05 : 0.12, detalle: yaVisto ? "adaptar el guion (el video ya se vio: no se paga otra vez)" : "Gemini ve el video y la IA lo adapta a la marca" };
}

/** La referencia del original que va en la publicación (lo de otra cuenta NUNCA va en `medios`). */
function referenciaDe(p, archivo) {
  if (!archivo?.src) return [];
  const r = referenciaLimpia({ src: archivo.src, tipo: archivo.tipo, id: archivo.id, cuenta: p.cuenta, enlace: p.enlace });
  return r ? [r] : [];
}

/**
 * Recrea una pieza para un cliente. Sin `confirmado: true`, lanza 409 «confirmar» con el costo, el día y el camino (la
 * pantalla y Claude lo enseñan antes). → { fecha, calendarId, postId, camino, encargoId?, videoId?, aviso }.
 */
export async function recrear(env, acceso, usuario, { clave, clienteId, camino: pedido = "", productoId = "", confirmado = false }) {
  const cliente = await acceso.leerUno("clients", { id: String(clienteId ?? "") });
  if (!cliente) throw new ErrorLoMejor("Escoge para qué cliente.", 404);
  const todas = await piezasDelEspacio(env, acceso, { sinFecha: true });
  const p = todas.find((x) => x.clave === String(clave ?? ""));
  if (!p) throw new ErrorLoMejor("Esa pieza ya no está en «Lo mejor»: vuelve a cargarlo.", 404);
  const posibles = caminosPosibles(p);
  const camino = posibles.includes(pedido) ? pedido : caminoPorDefecto(p);
  if (!CAMINOS[camino]) throw new ErrorLoMejor("Ese camino no existe.");
  const ia = await prepararIA(env, acceso, { funcion: "director de arte" });
  if (ia.bloqueo) throw new ErrorLoMejor(ia.bloqueo, 402);

  const desde = sumarDias(fechaEnZona(), 1);
  const fecha = proximoDiaLibre(await diasOcupados(acceso, cliente.id, desde), desde);
  const { costo, detalle } = await costoDe(env, acceso, cliente, p, camino);
  if (confirmado !== true) {
    throw new ErrorLoMejor(`Recrearla para ${cliente.name} cuesta unos ${textoCosto(costo).replace("≈ ", "")}: ${detalle}. Va el ${fecha}.`, 409, {
      codigo: "confirmar", costo, costoTexto: textoCosto(costo), detalle, fecha, camino, caminos: posibles,
    });
  }

  const mercado = await leerMercado(acceso, cliente.id).catch(() => null);
  const producto = productoId ? productosActivos(mercado?.catalogo ?? []).find((x) => x.id === productoId) ?? null : null;
  const brief = briefDeRecreacion(p, { marca: cliente.name, camino });
  const base = {
    id: idPublicacion(), format: FORMATO_DE_CAMINO[camino], status: "pending", title: tituloDeRecreacion(p),
    idea: corto(brief, 1500), referenceLink: p.enlace ?? "",
    recreadoDe: { clave: p.clave, fuente: p.fuente, cifra: cifraDe(p).texto, tipo: p.tipo || "", camino },
    ...(producto ? { productoId: producto.id, producto: producto.nombre } : {}),
  };
  const aviso = [];

  // Para grabar: Gemini ve el video y la IA lo adapta (se paga ANTES de crear nada: si falla, no queda una publicación vacía).
  if (camino === "grabar") {
    let archivo = null;
    let entrada;
    if (p.red === "youtube" && p.enlace) entrada = { youtube: p.enlace };
    else {
      archivo = await traerArchivo(env, acceso, cliente, p);
      if (!archivo || archivo.tipo !== "video") throw new ErrorLoMejor("No hay video que ver de esta pieza: recréala con IA o ábrela y guárdala desde el teléfono.", 409);
      entrada = { archivoId: archivo.id };
    }
    let r;
    try {
      r = await extraerUgc(env, acceso, cliente, { ...entrada, productoId: producto?.id ?? "", nota: "Recreación desde «Lo mejor»." });
    } catch (e) {
      if (e instanceof ErrorMercado) throw new ErrorLoMejor(e.message, e.estado ?? 502, e.codigo ? { codigo: e.codigo } : {});
      throw e;
    }
    const ugc = publicacionDeUgc(r.adaptado, { duracion: r.duracion, productoId: r.producto?.id ?? "", producto: r.producto?.nombre ?? "" });
    const post = { ...base, ...ugc, idea: corto(`${ugc.idea}. ${p.idea || ""}`, 1500), referencias: referenciaDe(p, archivo), ...(r.adaptado?.audio ? { audioUgc: r.adaptado.audio } : {}) };
    const { calendarId } = await meterPublicacion(env, acceso, cliente, fecha, post);
    if (r.aviso) aviso.push(r.aviso);
    return { fecha, calendarId, postId: post.id, camino, aviso: aviso.join(" ") };
  }

  // Video animado: la IA escribe el guion por escenas con la idea y la estructura del original; queda unido al post.
  if (camino === "animado") {
    let g;
    try {
      g = await escribirGuion(env, acceso, cliente, { idea: brief, segundos: p.formato === "video" ? 30 : 20, formato: "9:16" });
    } catch (e) {
      if (e instanceof ErrorGuion || e instanceof ErrorIA) throw new ErrorLoMejor(e.message, e.estado ?? 502);
      throw e;
    }
    const archivo = await traerArchivo(env, acceso, cliente, p, { miniatura: p.formato !== "video" }).catch(() => null);
    const post = { ...base, referencias: referenciaDe(p, archivo) };
    const { calendarId } = await meterPublicacion(env, acceso, cliente, fecha, post);
    let video = null;
    try {
      video = (await crearProyecto(acceso, cliente, { guion: g.guion, titulo: post.title, calendarId, postId: post.id, usuario })).video;
      difundir(env, acceso.ownerId, { tipo: "videos", clientId: cliente.id, id: video.id, por: { userId: "sistema", nombre: "Lo mejor", color: "", tab: null } });
    } catch (e) {
      if (!(e instanceof ErrorVideo)) throw e;
      aviso.push(`La publicación está creada, pero el guion no se guardó: ${e.message}`);
    }
    if (g.aviso) aviso.push(g.aviso);
    return { fecha, calendarId, postId: post.id, camino, videoId: video?.id ?? null, aviso: aviso.join(" ") };
  }

  // Imagen o carrusel: el DIRECTOR con un encargo del servidor (sigue aunque se cierre la aplicación). Mira el original
  // SÓLO como inspiración (una imagen especial que no va al motor de imagen); la pieza sale con la marca del cliente.
  const archivo = await traerArchivo(env, acceso, cliente, p, { miniatura: true }).catch((e) => { aviso.push(`Sin el archivo del original: ${e.message}`); return null; });
  const post = { ...base, referencias: referenciaDe(p, archivo) };
  const { calendarId } = await meterPublicacion(env, acceso, cliente, fecha, post);
  const especial = await miniaturaDe(env, p);
  const kit = kitDe(cliente);
  const activos = activosDe(env);
  const productos = mercado ? fotosDelCatalogo(mercado.catalogo) : [];
  const archivos = (await acceso.leer("estudio_archivos", { client_id: cliente.id, borrado_at: NULO }, "created_at desc", 300)).map(archivoPublico);
  const ctx = { cliente, kit, activos, mercado, productos, archivos };
  const productosPieza = producto ? [producto.id] : [];
  try {
    let fila;
    if (camino === "carrusel") {
      const modelo = modeloDelCliente(activos, kit);
      const k = limpiarKit(kit);
      const estampa = Boolean(k.logo) && k.logoModo === "estampado";
      const carpeta = await crearCarpeta(acceso, cliente.id, post.title, { tipo: "carrusel" });
      fila = await crearEncargo(env, acceso, cliente, {
        // `poner`: el carrusel entero se pone SOLO en su publicación al terminar (encargos.js, `ponerResultados`).
        tipo: "carrusel", titulo: post.title, carpetaId: carpeta.id, controlar: true, logoEstampado: estampa, poner: true,
        comun: {
          modelo: modelo.id, modo: "ia", plantilla: "banda", idea: corto(brief, 400), hilo: "",
          preset: estiloDeMarca(kit, "", { marca: cliente.name, rubro: cliente.industry ?? "" }), fotos: [], personajes: [],
          tipografia: referenciaDeTipografia(kit), logo: estampa ? "" : k.logo ?? "", calendarId, postId: post.id,
        },
        propuesta: { guion: "", tema: corto(brief, 400), preset: "", estilo: "", productoId: producto?.id ?? "" }, laminas: [],
      }, { usuario });
    } else {
      const [pieza] = planDeDiseno(ctx, [{ titulo: post.title, idea: brief, texto: "", formato: "vertical", productos: productosPieza, post_id: post.id }], { productosTanda: productosPieza });
      if (!pieza || pieza.error) throw new ErrorLoMejor(pieza?.error ?? "No se pudo armar la pieza.", 409);
      const k = limpiarKit(kit);
      fila = await crearEncargo(env, acceso, cliente, {
        // `poner`: la pieza va SOLA a su publicación al terminar, aunque nadie tenga la aplicación abierta.
        tipo: "lote", titulo: post.title, mejorar: true, controlar: true, paralelo: 1, poner: true,
        especiales: especial ? [{ papel: "inspiracion", ...especial }] : [],
        pasos: [pasoDelPlan(pieza, { calendarioDePost: { [post.id]: calendarId }, productos, estampa: Boolean(k.logo) && k.logoModo === "estampado" })],
      }, { usuario });
    }
    if (!especial && camino === "imagen") aviso.push("El director no pudo mirar el original (sin miniatura): diseña con la idea y el texto.");
    return { fecha, calendarId, postId: post.id, camino, encargoId: fila.id, aviso: aviso.join(" ") };
  } catch (e) {
    if (e instanceof ErrorEstudio) throw new ErrorLoMejor(`La publicación está creada (el ${fecha}), pero la pieza no arrancó: ${e.message}`, e.estado ?? 400);
    throw e;
  }
}

/** Las piezas como líneas para Claude (`ver_lo_mejor`). Pura. */
export function textoDeLoMejor(r, nombreCliente = (id) => id) {
  if (!r.piezas.length) return "No hay nada en «Lo mejor» con esos filtros todavía.";
  return [
    `Lo mejor (${VENTANAS.find((v) => v.id === r.ventana)?.nombre ?? r.ventana}): ${r.total} piezas${r.sinClasificar ? ` (${r.sinClasificar} sin clasificar)` : ""}. Las ${r.piezas.length} primeras, de mejor a peor:`,
    ...r.piezas.map((p, i) => [
      `${i + 1}. [${p.clave}] ${p.cifra.texto}${p.cifra.detalle ? ` (${p.cifra.detalle})` : ""} · ${p.tipoNombre || "sin clasificar"} · ${p.formato} de ${p.red}${p.cuenta ? ` · ${p.cuenta}` : ""}${p.percentil != null ? ` · percentil ${p.percentil} de su fuente` : ""}`,
      p.idea ? `   Por qué funciona: ${p.idea}` : "",
      p.texto ? `   Texto: ${corto(p.texto, 200)}` : "",
      `   Clientes: ${(p.clientes ?? []).map(nombreCliente).join(", ") || "de la agencia"} · se recrea: ${p.caminos.map((c) => CAMINOS[c].corto).join(", ")} (sugerido: ${CAMINOS[p.caminoSugerido].corto})${p.enlace ? ` · ${p.enlace}` : ""}`,
    ].filter(Boolean).join("\n")),
    "Para recrear una: recrear con su clave (la que va entre corchetes), el cliente y el camino. Primero devuelve el costo; sólo con el «sí» de la persona, confirmado=true.",
  ].join("\n");
}


