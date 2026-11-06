// ============================================================
// CERRAR EL CICLO en el Worker: qué publicación es cada anuncio, lo que está en pauta y lo que conviene pautar
// (curso de campañas, entrega 7; lo puro en src/lib/enPauta.js y src/lib/aprenderAnuncios.js)
//
//   GET  /api/anuncios/clientes/:c/en-pauta       Lo guardado (sólo D1, ni una llamada a Meta): cada publicación en
//                                                  pauta con su etapa y su costo, y lo que se aprende de ellas
//   GET  /api/anuncios/clientes/:c/para-pautar    Lo orgánico que rindió y no se ha pautado, con su texto revisado
//   POST /api/anuncios/clientes/:c/para-pautar { calendarId, postId, etapa }   «Marcar Va a pauta» (`post.pauta`)
//
// LO QUE SE LEE DE META va en la MISMA llamada de la lista de anuncios encendidos de la revisión 3Q: el creativo de
// cada anuncio con los ids de la publicación que usa (`anunciosEncendidos`). Si Meta rechaza un campo (#100), se baja
// un escalón (sin los de una publicación escogida, después sin ninguno) y se dice (`creativo`): sin poder leerlo NO se
// toca lo guardado, que si no todas las publicaciones parecerían salidas de pauta de golpe.
//
// LO QUE SE ESCRIBE: `anuncios_clientes.en_pauta` (0073), con `actualizar` y nunca con `guardar`: la fila tiene cinco
// dueños (el informe, los números del negocio, las ventas, la revisión, WhatsApp). La escribe quien ya escribe la fila
// en el mismo momento (revision3q.js: `revisada_at` al abrir, `alertas` en el cron), en UNA sentencia.
//
// «Marcar Va a pauta» escribe en la publicación por `cambiarPublicacion` (el `updated_at` del calendario como
// condición, la cola y `calendario:recargar` sin pestaña: también la pantalla que lo pidió relee, que si no su guardado
// de después lo pisaría). Una publicación YA publicada también: es justo lo que se pauta como publicación.
//
// Nada de esto se ha probado contra Meta: los tests (tests/migracion/enPauta.test.js) usan un `fetch` de mentira.
// ============================================================

import { graph, ErrorMeta } from "./meta.js";
import { json, error, cuerpo, noEncontrado } from "./respuesta.js";
import { firma } from "./vivo.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import {
  creativoDe, indiceDeSalidas, juntarEnPauta, limpiarEnPauta, fotoDePublicacion, entradaPublica, clavePublicacion,
  paraPautar, fraseParaPautar, textoDePublicacionDeAnuncio,
} from "../../src/lib/enPauta.js";
import { preferenciasDeAnuncios } from "../../src/lib/aprenderAnuncios.js";
import { composicionDe } from "../../src/lib/loteAnuncios.js";
import { limpiarPauta, vaAPauta, etapaSugerida, deLaOferta, problemasDePauta, tieneTextosAnuncio } from "../../src/lib/pauta.js";
import { idEtapaCiclo, nombreEtapaCiclo } from "../../src/lib/cicloVentas.js";
import { limpiarNegocio } from "../../src/lib/numerosNegocio.js";
import { cifras3q, sumarFilas, tipoDeResultado, NOMBRE_RESULTADO, etapaDeCampana, nombreEtapaRevision, enlaceAdsManager } from "../../src/lib/tresQ.js";

const leerJSON = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t ?? "") ?? d; } catch { return d; }
};
const nombreComposicion = (id) => composicionDe(id)?.nombre ?? "";
const proxy = (u) => (u ? `/api/metricas/miniatura?u=${encodeURIComponent(u)}` : "");
const rechazoDeCampo = (e) => e instanceof ErrorMeta && e.codigo === 100;
const FORMATO_DE_TIPO = { imagen: "post", carrusel: "carrusel", reel: "reel", video: "reel", short: "reel" };

// ------------------------------------------------------------
// Meta: la lista de anuncios encendidos con su creativo
// ------------------------------------------------------------

export const BASE_ANUNCIO = "id,name,campaign_id,adset_id,status,effective_status,created_time,updated_time";
/** El creativo por escalones: con la publicación escogida y su enlace; con la que corre; sin ninguna (lo de antes). */
export const ESCALERA_CREATIVO = Object.freeze([
  ["completo", "creative{id,thumbnail_url,title,effective_object_story_id,object_story_id,effective_instagram_media_id,source_instagram_media_id,instagram_permalink_url}"],
  ["basico", "creative{id,thumbnail_url,title,effective_object_story_id,effective_instagram_media_id}"],
  ["sin-dato", "creative{thumbnail_url,title}"],
]);

/**
 * Los anuncios encendidos de la cuenta (`filtro`: los estados de Meta, como JSON) con su creativo. Una llamada; una más
 * por escalón si Meta rechaza un campo (#100) y, si ni la de antes pasa, otra sin el filtro (como la revisión de antes).
 * → { anuncios, creativo: "completo" | "basico" | "sin-dato" }
 */
export async function anunciosEncendidos(env, token, act, { filtro, base = BASE_ANUNCIO, limit = 200 } = {}) {
  for (const [nivel, creativo] of ESCALERA_CREATIVO) {
    try {
      const r = await graph(env, token, `/${act}/ads`, { params: { fields: `${base},${creativo}`, limit, ...(filtro ? { effective_status: filtro } : {}) } });
      return { anuncios: r?.data ?? [], creativo: nivel };
    } catch (e) {
      if (!rechazoDeCampo(e)) throw e;
    }
  }
  const r = await graph(env, token, `/${act}/ads`, { params: { fields: `${base},${ESCALERA_CREATIVO.at(-1)[1]}`, limit } });
  return { anuncios: r?.data ?? [], creativo: "sin-dato" };
}

// ------------------------------------------------------------
// Lo que corre, normalizado (de la revisión o del cron)
// ------------------------------------------------------------

/** Los anuncios de la revisión 3Q (src/lib/tresQ.js `revisar`) como los junta `juntarEnPauta`. */
export function anunciosDeRevision(revision) {
  return (revision?.campanas ?? []).flatMap((c) => (c.anuncios ?? []).map((a) => ({
    id: a.id, nombre: a.nombre || a.titulo || "", campanaId: c.id, campana: c.nombre, conjuntoId: a.conjuntoId,
    etapa: c.etapa, nombreEtapa: c.nombreEtapa, tipoResultado: c.tipoResultado, nombreResultado: c.nombreResultado, objetivo: c.objetivo,
    enlace: a.enlace, veredicto: a.veredicto?.nombre ?? "", d7: a.ventanas?.[7] ?? null, d30: a.ventanas?.[30] ?? null, creativo: a.creativo ?? null,
  })));
}

/**
 * Los del cron: la lista de anuncios encendidos (con su creativo), las campañas encendidas y lo de cada anuncio en 7 y
 * 30 días (`/insights` con `level=ad`). El tipo de resultado, el de su campaña (como en la revisión). Pura.
 */
export function anunciosDelCron({ campanas = [], anuncios = [], filas7 = [], filas30 = [], etapas = {}, destino = "", cuenta = "" } = {}) {
  const activas = new Map(campanas.filter((c) => String(c.status ?? "").toUpperCase() === "ACTIVE").map((c) => [String(c.id), c]));
  const de7 = new Map(filas7.filter((f) => f?.ad_id).map((f) => [String(f.ad_id), f]));
  const de30 = new Map(filas30.filter((f) => f?.ad_id).map((f) => [String(f.ad_id), f]));
  const tipos = new Map([...activas].map(([id, c]) => {
    const suyas = filas30.filter((f) => String(f?.campaign_id ?? "") === id);
    return [id, tipoDeResultado(suyas.length ? sumarFilas(suyas) : null, c.objective, destino)];
  }));
  return anuncios
    .filter((a) => String(a.status ?? "").toUpperCase() === "ACTIVE" && activas.has(String(a.campaign_id ?? "")))
    .map((a) => {
      const id = String(a.id);
      const c = activas.get(String(a.campaign_id));
      const etapa = etapaDeCampana({ id: c.id, nombre: c.name }, etapas).id;
      const tipo = tipos.get(String(c.id)) ?? "";
      return {
        id, nombre: a.name ?? "", campanaId: String(c.id), campana: c.name ?? "", conjuntoId: String(a.adset_id ?? ""),
        etapa, nombreEtapa: nombreEtapaRevision(etapa), tipoResultado: tipo, nombreResultado: NOMBRE_RESULTADO[tipo] ?? "resultados",
        objetivo: c.objective ?? "", enlace: enlaceAdsManager(cuenta, "anuncio", id),
        d7: cifras3q(de7.get(id) ?? null, c.objective), d30: cifras3q(de30.get(id) ?? null, c.objective), creativo: creativoDe(a.creative),
      };
    });
}

// ------------------------------------------------------------
// D1: la cola, las publicaciones y lo guardado
// ------------------------------------------------------------

/** Lo que salió desde la cola del cliente (lo que casa un anuncio con su publicación). Una lectura. */
export const leerSalidas = (acceso, clientId) => acceso.leerColumnas(
  "publicaciones_programadas", ["calendar_id", "post_id", "red", "externo_id", "enlace", "variante"], { client_id: clientId, estado: "publicada" },
  "publicada_at desc", 2000,
);

/** Las publicaciones de unas claves («calendario|publicación»): una lectura por cada 50 calendarios. → Map clave → { post, fecha, cal }. */
export async function publicacionesDe(acceso, clientId, claves = []) {
  const porCal = new Map();
  for (const k of claves) {
    const [cal, post] = String(k).split("|");
    if (!cal || !post) continue;
    if (!porCal.has(cal)) porCal.set(cal, new Set());
    porCal.get(cal).add(post);
  }
  if (!porCal.size) return new Map();
  const cals = await acceso.leerVarios("calendars", ["id", "days", "offers", "promo_code"], "id", [...porCal.keys()], { client_id: clientId });
  const salida = new Map();
  for (const c of cals) {
    const buscadas = porCal.get(String(c.id));
    for (const d of leerJSON(c.days, [])) {
      for (const p of d?.posts ?? []) {
        if (p?.id && buscadas?.has(String(p.id))) salida.set(clavePublicacion(c.id, p.id), { post: p, fecha: d.date ?? "", cal: c });
      }
    }
  }
  return salida;
}

/**
 * Lo nuevo de `en_pauta` con lo que corre (y la publicación de cada anuncio para enseñarla). `anuncios`: normalizados
 * (`anunciosDeRevision` o `anunciosDelCron`); `previo`: lo guardado (texto o JSON); `creativo`: lo que se pudo leer.
 * Sin poder leer el creativo, lo guardado no se toca (→ `cambios: null`). Dos lecturas de D1 como mucho.
 * → { cambios: { en_pauta } | null, porAnuncio: Map, enPauta }
 */
export async function ponerAlDia(acceso, clientId, { anuncios = [], previo = null, creativo = "completo", cuenta = "", moneda = "USD", referencia = null, hoy = fechaEnZona(new Date()), leidoAt = new Date().toJSON() } = {}) {
  const salidas = await leerSalidas(acceso, clientId);
  const indice = indiceDeSalidas(salidas);
  // Primero sin las publicaciones, para saber cuáles hay que leer; después, con lo que se recuerda de cada una.
  const { enPauta: borrador } = juntarEnPauta({ anuncios, indice, previo, hoy, leidoAt, cuenta, moneda, referencia, creativo });
  const claves = Object.entries(borrador.publicaciones).filter(([, e]) => e.activo).map(([k]) => k);
  const leidas = await publicacionesDe(acceso, clientId, claves);
  const posts = new Map([...leidas].map(([k, x]) => [k, fotoDePublicacion(x.post, x.fecha, { nombreComposicion })]));
  const r = juntarEnPauta({ anuncios, indice, previo, hoy, leidoAt, cuenta, moneda, referencia, creativo, posts });
  if (creativo === "sin-dato") return { cambios: null, porAnuncio: r.porAnuncio, enPauta: limpiarEnPauta(previo) };
  return { cambios: { en_pauta: JSON.stringify(r.enPauta) }, porAnuncio: r.porAnuncio, enPauta: r.enPauta };
}

/** A cada anuncio de la revisión, su publicación del calendario (o por qué no la tiene) y cómo se dice. */
export function conPublicaciones(revision, porAnuncio) {
  for (const c of revision?.campanas ?? []) {
    c.anuncios = (c.anuncios ?? []).map((a) => {
      const x = porAnuncio.get(String(a.id));
      if (!x) return a;
      return { ...a, ...x, publicacionTexto: textoDePublicacionDeAnuncio(x) };
    });
  }
  return revision;
}

/** Lo guardado de un cliente, limpio (una lectura). */
export async function enPautaDelCliente(acceso, clientId) {
  const f = await acceso.leerColumnas("anuncios_clientes", ["en_pauta"], { client_id: clientId }, "created_at asc", 1);
  return limpiarEnPauta(f[0]?.en_pauta);
}

/**
 * Lo que se aprende de sus anuncios (src/lib/aprenderAnuncios.js), o null si falla o no hay muestra: lo leen el motor
 * de ideas y el director cuando escriben para pauta. Una lectura.
 */
export async function preferenciasDelCliente(acceso, clientId) {
  try {
    const p = preferenciasDeAnuncios(await enPautaDelCliente(acceso, clientId), null, { nombres: { composicion: nombreComposicion } });
    return p.linea ? p : null;
  } catch {
    return null;
  }
}

/** Lo que va a la pantalla (y al asistente) de lo guardado: sin lo interno. */
export function enPautaPublico(guardado) {
  const g = limpiarEnPauta(guardado);
  const pref = preferenciasDeAnuncios(g, null, { nombres: { composicion: nombreComposicion } });
  return {
    leidoAt: g.leidoAt, cuenta: g.cuenta, moneda: g.moneda, creativo: g.creativo,
    publicaciones: Object.values(g.publicaciones).map((e) => ({
      ...entradaPublica(e, g.moneda),
      post: e.post ? { fecha: e.post.fecha, titulo: e.post.titulo, formato: e.post.formato, miniatura: e.post.miniatura } : null,
    })),
    sinPublicacion: g.sinPublicacion,
    preferencias: { linea: pref.linea, motivo: pref.motivo, muestra: pref.muestra, piezas: pref.piezas, minGasto: pref.minGasto, mejores: pref.mejores, peores: pref.peores },
  };
}

// ------------------------------------------------------------
// «Para pautar»
// ------------------------------------------------------------

/** Lo orgánico que rindió y no se ha pautado, con su etapa sugerida y lo que su texto tiene que no sirve en un anuncio. */
export async function paraPautarDelCliente(acceso, cliente, fila, { hoy = fechaEnZona(new Date()) } = {}) {
  const guardado = limpiarEnPauta(fila?.en_pauta);
  const destino = limpiarNegocio(leerJSON(fila?.negocio, {})).destino;
  const [medidas, salidas] = await Promise.all([
    acceso.leerColumnas("metricas_publicacion",
      ["cuenta_id", "red", "externo_id", "tipo", "enlace", "texto", "miniatura", "publicada_at", "interacciones", "guardados", "compartidos", "alcance", "vistas"],
      { client_id: cliente.id }, "publicada_at desc", 1000),
    leerSalidas(acceso, cliente.id),
  ]);
  const lista = paraPautar({ medidas, salidas, enPauta: guardado, hoy });
  const leidas = await publicacionesDe(acceso, cliente.id, lista.filter((x) => x.calendarId).map((x) => x.clave));
  const candidatas = lista.map((x) => {
    const p = leidas.get(x.clave);
    const post = p?.post ?? { format: FORMATO_DE_TIPO[x.tipo] ?? "post", descripcion: x.texto };
    const marcada = p ? limpiarPauta(p.post.pauta) : null;
    const oferta = p ? deLaOferta(p.post, { ofertas: p.cal.offers ?? "", codigo: p.cal.promo_code ?? "" }) : false;
    const etapa = marcada?.etapa || etapaSugerida(post, { oferta });
    // Su texto, revisado como anuncio (lib/pauta.js). Los textos aparte y «casi igual a otra» no aplican a lo ya publicado.
    const problemas = p
      ? problemasDePauta({ ...p.post, pauta: { etapa } }, { destino }).filter((q) => !["textos", "parecida"].includes(q.codigo)).map((q) => ({ codigo: q.codigo, texto: q.texto }))
      : [];
    const foto = p ? fotoDePublicacion(p.post, p.fecha) : null;
    return {
      ...x, miniatura: foto?.miniatura || proxy(x.miniatura), delCalendario: Boolean(p), fecha: foto?.fecha || String(x.publicadaAt ?? "").slice(0, 10),
      titulo: foto?.titulo || x.texto.slice(0, 80), formato: post.format, etapa, nombreEtapa: nombreEtapaCiclo(etapa), frase: fraseParaPautar(x.rinde, nombreEtapaCiclo(etapa)),
      marcada: Boolean(marcada), problemas, conTextosDeAnuncio: p ? tieneTextosAnuncio(p.post) : false,
      // Para «Versión para anuncio» de lo que no está en el calendario: su texto (los primeros 300 caracteres que mide Meta).
      ...(p ? {} : { post: { id: x.externoId, format: post.format, descripcion: x.texto } }),
    };
  });
  return { candidatas, destino, leidoAt: guardado.leidoAt, hoy };
}

/** «Marcar Va a pauta»: la etapa escogida en `post.pauta` (con la publicación ya hecha, «como» es «con la publicación»). */
async function marcarParaPautar(req, env, { acceso, usuario, cliente }) {
  const b = (await cuerpo(req)) ?? {};
  const calendarId = String(b.calendarId ?? "").slice(0, 80);
  const postId = String(b.postId ?? "").slice(0, 80);
  if (!calendarId || !postId) return error("Falta la publicación.");
  const etapa = idEtapaCiclo(b.etapa);
  if (b.etapa && !etapa) return error("Esa etapa no existe.");
  // Se importa en el momento: ponerEnPost.js llega al publicador, y esto lo lee el director (fichas.js).
  const { cambiarPublicacion } = await import("./estudio/ponerEnPost.js");
  const r = await cambiarPublicacion(env, acceso, {
    clienteId: cliente.id, calendarId, postId, publicadas: true,
    // Sin pestaña: también la que lo pidió relee el mes (si no, su guardado de después lo pisaría).
    por: { ...firma(usuario, req), tab: null },
    cambiar: (post) => {
      const antes = limpiarPauta(post.pauta);
      const nueva = limpiarPauta({
        etapa: etapa || antes?.etapa || etapaSugerida(post), ...(antes?.nivel ? { nivel: antes.nivel } : {}),
        como: post.status === "published" ? "publicacion" : antes?.como ?? "",
      });
      return vaAPauta(post) && JSON.stringify(antes) === JSON.stringify(nueva) ? null : { ...post, pauta: nueva };
    },
  });
  if (r.aviso) return error(/guardando/.test(r.aviso) ? "El calendario se estaba guardando a la vez: vuelve a intentarlo." : "La publicación ya no está en su calendario.", 409);
  return json({ calendarId: r.calendarId, postId: r.postId, pauta: limpiarPauta(r.post?.pauta) });
}

// ------------------------------------------------------------
// Las rutas (las despacha worker/rutas/anuncios.js; no piden cuenta publicitaria)
// ------------------------------------------------------------

export async function rutasEnPauta(req, env, { acceso, usuario, clientId, sub, metodo }) {
  const cliente = await acceso.leerUno("clients", { id: clientId });
  if (!cliente) return noEncontrado("Cliente");
  if (sub === "en-pauta" && metodo === "GET") return json(enPautaPublico(await enPautaDelCliente(acceso, cliente.id)));
  if (sub === "para-pautar" && metodo === "GET") {
    const fila = await acceso.leerUno("anuncios_clientes", { client_id: cliente.id });
    const r = await paraPautarDelCliente(acceso, cliente, fila);
    return json({ ...r, preferencias: enPautaPublico(fila?.en_pauta).preferencias });
  }
  if (sub === "para-pautar" && metodo === "POST") return await marcarParaPautar(req, env, { acceso, usuario, cliente });
  return noEncontrado("Ruta");
}
