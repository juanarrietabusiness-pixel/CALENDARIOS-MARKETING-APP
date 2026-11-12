// ============================================================
// Historias automáticas: una al día por cliente, de lo ya publicado
//
// El NAVEGADOR hace la imagen (la del post encajada en 9:16 con su frase:
// necesita un lienzo, y el Worker no lo tiene) y la sube; aquí se guarda
// como pieza. El CRON (`historiasAutomaticasPendiente`) escoge cada día la
// que toca —la menos usada y, a igualdad, la que mejor funcionó— y la mete en
// la cola de siempre como una historia SIN calendario: la cola no la relee de
// ningún mes, la publica tal cual. Sale sola; se quita en Programación como
// cualquier otra fila.
//
// Una consulta por vuelta si no hay nada que hacer, y como mucho siete si
// pone una en la cola: cabe con lo demás del cron.
// ============================================================

import { crearAcceso, clientesConHistoriasPendientes, historiasPorRevisar, NULO } from "./acceso.js";
import { llamarIA, ErrorIA } from "./cerebro/ia.js";
import { MODELO_HAIKU, sinIADeTexto } from "./configIA.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import { fechasDelMes } from "../../src/lib/fechasEspeciales.js";
import {
  vigenciaPorReglas, combinarVigencia, estaVigente, yaCaducada, textoDelPost, pedidoDeVigencia, leerVigencia,
} from "../../src/lib/vigenciaHistorias.js";
import { difundir } from "./vivo.js";
import { uuid, ahora } from "./ids.js";
import { momentoPublicacion } from "../../src/lib/publicacion.js";
import {
  limpiarAjustes, proximaFecha, porPreparar, elegirPiezas, horasDelDia, publicacionDeRepost, DIAS_ATRAS, claveDeEstilo, estiloDeClave, ESTILOS_HISTORIA, colorDeMarca,
  baseDeClave,
} from "../../src/lib/historiasAuto.js";

export class ErrorHistorias extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const FIRMA = { userId: "sistema", nombre: "Historias automáticas", color: "#1E90FF" };
const NOMBRE_RED = { instagram: "Instagram", facebook: "Facebook" };

const leerJSON = (t, d) => { try { return JSON.parse(t); } catch { return d; } };

/** Lo que ve la agencia de un cliente: el interruptor, la hora, las redes y qué hay listo. */
export async function ajustesHistorias(acceso, clientId) {
  const f = await acceso.leerUno("historias_auto", { client_id: clientId });
  const piezas = await acceso.leerColumnas("historias_auto_piezas", ["id", "titulo", "clave", "clave_post", "usos", "usada_at", "publicada_at", "excluida", ...COLUMNAS_VIGENCIA], { client_id: clientId }, "created_at desc");
  const ajustes = limpiarAjustes({ activa: f?.activa === 1, hora: f?.hora, redes: leerJSON(f?.redes, []), porDia: f?.por_dia });
  const vista = (p) => ({
    id: p.id, titulo: p.titulo, estilo: estiloDeClave(p.clave_post), src: `/api/media/${p.clave}`, usos: p.usos ?? 0, usadaAt: p.usada_at ?? null,
    vigencia: p.vigencia ?? "sin_revisar", vigente_hasta: p.vigente_hasta ?? null, motivo: p.vigencia_motivo ?? "", por: p.vigencia_por ?? "",
    error: p.vigencia === "sin_revisar" ? p.revision_error ?? "" : "",
  });
  return {
    ...ajustes,
    ultimaFecha: f?.ultima_fecha ?? null,
    nota: f?.nota ?? "",
    proxima: ajustes.activa ? proximaFecha(ajustes.hora) : null,
    horas: horasDelDia(ajustes.hora, ajustes.porDia),
    hoy: fechaEnZona(),
    piezas: piezas.filter((p) => !p.excluida).map(vista),
    quitadas: piezas.filter((p) => p.excluida).map(vista),
  };
}

export async function guardarAjustesHistorias(acceso, clientId, cambios = {}) {
  const previa = await acceso.leerUno("historias_auto", { client_id: clientId });
  const antes = limpiarAjustes({ activa: previa?.activa === 1, hora: previa?.hora, redes: leerJSON(previa?.redes, []), porDia: previa?.por_dia });
  const nuevos = limpiarAjustes({
    activa: typeof cambios.activa === "boolean" ? cambios.activa : antes.activa,
    hora: cambios.hora ?? antes.hora,
    redes: Array.isArray(cambios.redes) ? cambios.redes : antes.redes,
    porDia: cambios.porDia ?? antes.porDia,
  });
  await acceso.guardar("historias_auto", {
    id: previa?.id ?? uuid(), client_id: clientId, activa: nuevos.activa ? 1 : 0, hora: nuevos.hora,
    redes: JSON.stringify(nuevos.redes), por_dia: nuevos.porDia,
    // Cambiar la hora o encenderla vuelve a mirar el día: si la de hoy aún no salió, puede entrar.
    ultima_fecha: nuevos.hora !== antes.hora || (nuevos.activa && !antes.activa) ? null : previa?.ultima_fecha ?? null,
    nota: previa?.nota ?? "",
    created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
  });
  return ajustesHistorias(acceso, clientId);
}

/**
 * Lo publicado que aún no tiene su historia hecha: el navegador la dibuja y
 * la sube. Las 80 últimas publicadas del cliente bastan (90 días a tres por día).
 */
export async function pendientesDePreparar(acceso, clientId, momento = new Date()) {
  const desde = new Date(momento.getTime() - DIAS_ATRAS * 86_400_000).toJSON();
  const filas = (await acceso.leer("publicaciones_programadas", { client_id: clientId, estado: "publicada", variante: "post" }, "publicada_at desc", 80))
    .filter((f) => !f.publicada_at || f.publicada_at >= desde);
  const piezas = await acceso.leerColumnas("historias_auto_piezas", ["clave_post", "vigencia", "vigente_hasta"], { client_id: clientId });
  // Cada publicación da varios ESTILOS (src/lib/historiasAuto.js, `estilosDePost`): cada uno trae su frase, y todos el
  // color de la marca (las placas y el fondo de la «frase del post»).
  const cliente = await acceso.leerUno("clients", { id: clientId }).catch(() => null);
  const color = colorDeMarca(leerJSON(cliente?.kit_marca, {}));
  // Lo que ya no va a servir (una felicitación, la promoción de un mes pasado) no se prepara: ni se dibuja ni se revisa.
  const hoy = fechaEnZona(momento);
  const caducadas = new Set(piezas.filter((p) => yaCaducada({ vigencia: p.vigencia, hasta: p.vigente_hasta }, hoy)).map((p) => baseDeClave(p.clave_post)));
  const reglasDe = await contextoDeReglas(acceso, cliente, filas);
  const filaPorId = new Map(filas.map((f) => [f.id, f]));
  return porPreparar(filas, piezas, momento)
    .filter((p) => {
      const base = baseDeClave(p.clavePost);
      if (caducadas.has(base)) return false;
      const fila = filaPorId.get(p.filaId);
      return !fila || !yaCaducada(reglasDe(fila).reglas, hoy);
    })
    .map((p) => (color ? { ...p, color } : p));
}

// ------------------------------------------------------------
// La VIGENCIA: ¿sigue sirviendo? (src/lib/vigenciaHistorias.js)
// ------------------------------------------------------------

const COLUMNAS_VIGENCIA = ["vigencia", "vigente_hasta", "vigencia_motivo", "vigencia_por", "revision_intento_at", "revision_error"];
/** La IA que no pudo revisar no lo vuelve a intentar sola hasta pasado esto (a pedido, sí). */
const REINTENTO_MS = 6 * 3_600_000;
/** Cuántas publicaciones revisa la IA en una llamada (cada una con su imagen). */
export const REVISAR_POR_VUELTA = 4;
const MAX_IMAGEN = 3_500_000;

const leerPost = (fila) => leerJSON(fila?.carga, {}).post ?? {};

/**
 * Lo que necesitan las reglas de cada fila publicada: el día en que salió (Panamá), las fechas especiales del cliente
 * ese día y la oferta del mes de su calendario. Lee los calendarios de una vez. → (fila) → { publicada, fechasDelDia,
 * oferta, post, reglas }.
 */
async function contextoDeReglas(acceso, cliente, filas) {
  const ids = [...new Set(filas.map((f) => f.calendar_id).filter(Boolean))];
  const cals = ids.length ? await acceso.leerVarios("calendars", ["id", "offers", "promo_code"], "id", ids).catch(() => []) : [];
  const ofertas = new Map(cals.map((c) => [c.id, { offers: c.offers ?? "", promoCode: c.promo_code ?? "" }]));
  const guardado = leerJSON(cliente?.fechas_especiales, {});
  const porMes = new Map();
  return (fila) => {
    const cuando = fila.publicada_at || fila.programada_para;
    const publicada = cuando ? fechaEnZona(new Date(cuando)) : "";
    const mes = publicada.slice(0, 7);
    if (publicada && !porMes.has(mes)) porMes.set(mes, fechasDelMes(+mes.slice(0, 4), +mes.slice(5, 7) - 1, guardado));
    const fechasDelDia = publicada ? porMes.get(mes).filter((f) => f.fecha === publicada) : [];
    const oferta = ofertas.get(fila.calendar_id) ?? {};
    const post = leerPost(fila);
    return { publicada, fechasDelDia, oferta, post, reglas: vigenciaPorReglas({ post, publicada, fechasDelDia, oferta }) };
  };
}

/** Lo que se guarda en una pieza para una vigencia. */
const columnasDe = (v, por) => ({
  vigencia: v.vigencia, vigente_hasta: v.vigencia === "hasta" ? v.hasta : null, vigencia_motivo: String(v.motivo ?? "").slice(0, 200),
  vigencia_por: por, revision_error: "",
});

/** Pone la vigencia en TODAS las piezas de una publicación (sus estilos comparten lo que dice). */
async function aplicarVigencia(acceso, piezas, base, v, por) {
  for (const p of piezas.filter((x) => baseDeClave(x.clave_post) === base)) {
    await acceso.actualizar("historias_auto_piezas", { id: p.id }, columnasDe(v, por));
  }
}

function aBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function imagenDe(env, clave) {
  try {
    const obj = await env.MEDIA?.get?.(clave);
    if (!obj) return null;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const tipo = obj.httpMetadata?.contentType || "image/jpeg";
    if (bytes.byteLength > MAX_IMAGEN || !/^image\/(jpeg|png|webp)$/.test(tipo)) return null;
    return { media_type: tipo, data: aBase64(bytes) };
  } catch {
    return null;
  }
}

/**
 * Revisa la vigencia de las piezas «sin revisar» de un cliente: las reglas primero (lo que ya no sirve no necesita IA)
 * y la IA, que MIRA la historia ya dibujada, para lo demás. Como mucho `max` publicaciones por llamada. Lo que la IA no
 * pudo revisar se queda «sin revisar» (NO sale) con el motivo. `forzar`: también lo que falló hace poco.
 * → { revisadas, pendientes, fallo }.
 */
export async function revisarVigencias(env, acceso, clientId, { max = REVISAR_POR_VUELTA, forzar = false, momento = new Date() } = {}) {
  const todas = await acceso.leerColumnas("historias_auto_piezas", ["id", "clave", "clave_post", "fila_id", "excluida", ...COLUMNAS_VIGENCIA], { client_id: clientId });
  const hoy = fechaEnZona(momento);
  const limite = new Date(momento.getTime() - REINTENTO_MS).toJSON();
  const porBase = new Map();
  for (const p of todas) {
    if (p.vigencia !== "sin_revisar" || p.excluida) continue;
    if (!forzar && p.revision_intento_at && p.revision_intento_at > limite) continue;
    const b = baseDeClave(p.clave_post);
    if (!porBase.has(b)) porBase.set(b, []);
    porBase.get(b).push(p);
  }
  const bases = [...porBase.keys()].slice(0, Math.max(1, max));
  if (!bases.length) return { revisadas: 0, pendientes: 0, fallo: "" };

  // Una publicación ya revisada en otro estilo comparte su vigencia (una persona o la IA ya la decidió).
  const decidida = new Map();
  for (const p of todas) if (p.vigencia !== "sin_revisar") decidida.set(baseDeClave(p.clave_post), p);
  const filaIds = [...new Set(bases.map((b) => porBase.get(b)[0].fila_id).filter(Boolean))];
  const filas = filaIds.length ? await acceso.leerVarios("publicaciones_programadas", ["id", "calendar_id", "post_id", "carga", "publicada_at", "programada_para"], "id", filaIds) : [];
  const filaPorId = new Map(filas.map((f) => [f.id, f]));
  const cliente = await acceso.leerUno("clients", { id: clientId }).catch(() => null);
  const reglasDe = await contextoDeReglas(acceso, cliente, filas);

  let revisadas = 0;
  const paraIA = [];
  for (const b of bases) {
    const hecha = decidida.get(b);
    if (hecha) {
      await aplicarVigencia(acceso, todas, b, { vigencia: hecha.vigencia, hasta: hecha.vigente_hasta, motivo: hecha.vigencia_motivo }, hecha.vigencia_por || "reglas");
      revisadas++;
      continue;
    }
    const fila = filaPorId.get(porBase.get(b)[0].fila_id);
    if (!fila) {
      // Sin la publicación no se sabe qué decía: no sale.
      await aplicarVigencia(acceso, todas, b, { vigencia: "nunca", motivo: "No se encontró la publicación de origen." }, "reglas");
      revisadas++;
      continue;
    }
    const ctx = reglasDe(fila);
    if (yaCaducada(ctx.reglas, hoy)) {
      await aplicarVigencia(acceso, todas, b, ctx.reglas, "reglas");
      revisadas++;
      continue;
    }
    const encajada = porBase.get(b).find((p) => p.clave_post === b) ?? porBase.get(b)[0];
    paraIA.push({ base: b, piezas: porBase.get(b), clave: encajada.clave, ...ctx });
  }
  if (!paraIA.length) return { revisadas, pendientes: Math.max(0, porBase.size - bases.length), fallo: "" };

  const marcarFallo = async (lista, motivo) => {
    for (const it of lista) {
      for (const p of it.piezas) {
        await acceso.actualizar("historias_auto_piezas", { id: p.id }, { revision_intento_at: ahora(), revision_error: String(motivo).slice(0, 200) });
      }
    }
  };
  if (sinIADeTexto(env)) {
    await marcarFallo(paraIA, "No hay llave de IA para revisarla: no sale hasta que se revise.");
    return { revisadas, pendientes: porBase.size - revisadas, fallo: "No hay llave de IA de texto." };
  }
  const imagenes = await Promise.all(paraIA.map((it) => imagenDe(env, it.clave)));
  const conImagen = paraIA.filter((_, i) => imagenes[i]);
  const sinImagen = paraIA.filter((_, i) => !imagenes[i]);
  if (sinImagen.length) await marcarFallo(sinImagen, "No se pudo leer la imagen de la historia para revisarla.");
  if (!conImagen.length) return { revisadas, pendientes: porBase.size - revisadas, fallo: "No se pudo leer ninguna imagen." };

  const bloques = [];
  conImagen.forEach((it, i) => {
    bloques.push({ type: "text", text: `Imagen ${i + 1}:` }, { type: "image", source: { type: "base64", ...imagenes[paraIA.indexOf(it)] } });
  });
  const pedido = pedidoDeVigencia(conImagen.map((it) => ({ publicada: it.publicada, texto: textoDelPost(it.post), fechasDelDia: it.fechasDelDia, oferta: it.oferta, reglas: it.reglas })), hoy);
  let leido = {};
  let fallo = "";
  try {
    const r = await llamarIA(env, acceso, null, {
      prompt: [...bloques, { type: "text", text: pedido }], salida: 1200, funcion: "vigencia de historias",
      modelo: env.ANTHROPIC_API_KEY ? MODELO_HAIKU : null, esfuerzo: "low",
    });
    leido = leerVigencia(r.texto, conImagen.length);
    if (!Object.keys(leido).length) fallo = "La IA no devolvió una revisión que se pueda leer.";
  } catch (e) {
    fallo = e instanceof ErrorIA ? e.message : String(e?.message ?? e).slice(0, 200);
  }
  const sinRespuesta = [];
  for (const [i, it] of conImagen.entries()) {
    const ia = leido[i + 1];
    if (!ia) { sinRespuesta.push(it); continue; }
    // Gana lo más restrictivo: la IA no puede soltar lo que las reglas ya vieron.
    const final = combinarVigencia(it.reglas, ia);
    await aplicarVigencia(acceso, todas, it.base, final, final === it.reglas ? "reglas" : "ia");
    revisadas++;
  }
  if (sinRespuesta.length) await marcarFallo(sinRespuesta, fallo || "La IA no respondió por esta publicación.");
  return { revisadas, pendientes: porBase.size - revisadas, fallo };
}

/**
 * «Sí puede salir» / «Que no salga por vencida» de una PERSONA: vale para todas las piezas de esa publicación y la
 * revisión ya no la toca. `v`: { vigencia: "siempre" | "hasta" | "nunca", hasta? }.
 */
export async function fijarVigencia(env, acceso, clientId, id, v = {}, persona = "") {
  const pieza = await acceso.leerUno("historias_auto_piezas", { id: String(id), client_id: clientId });
  if (!pieza) return null;
  if (!["siempre", "hasta", "nunca"].includes(v.vigencia)) throw new ErrorHistorias("Vigencia no válida.");
  if (v.vigencia === "hasta" && !/^\d{4}-\d{2}-\d{2}$/.test(String(v.hasta ?? ""))) throw new ErrorHistorias("Falta hasta qué día sirve.");
  const todas = await acceso.leerColumnas("historias_auto_piezas", ["id", "clave_post"], { client_id: clientId });
  const motivo = v.vigencia === "siempre" ? `Lo decidió ${persona || "una persona"}.` : v.vigencia === "nunca" ? `Lo apartó ${persona || "una persona"}.` : `Hasta el ${v.hasta}, según ${persona || "una persona"}.`;
  await aplicarVigencia(acceso, todas, baseDeClave(pieza.clave_post), { vigencia: v.vigencia, hasta: v.hasta, motivo }, "persona");
  await cancelarVencidas(env, acceso, clientId);
  return true;
}

/**
 * Lo ya puesto en la cola que dejó de servir (vencida, «no se reutiliza» o apartada) sale de la cola con el motivo.
 * Lo que sigue «sin revisar» NO se quita aquí (aún puede revisarse a tiempo): lo para la cola al ir a publicarlo.
 * → cuántas quitó.
 */
export async function cancelarVencidas(env, acceso, clientId) {
  const filas = await acceso.leer("publicaciones_programadas", { client_id: clientId, estado: "programada", variante: "historia", calendar_id: NULO });
  const reposts = filas.map((f) => ({ f, rep: leerJSON(f.carga, {}).post?.repost })).filter((x) => x.rep?.piezaId);
  if (!reposts.length) return 0;
  const piezas = await acceso.leerVarios("historias_auto_piezas", ["id", "excluida", "titulo", ...COLUMNAS_VIGENCIA], "id", [...new Set(reposts.map((x) => x.rep.piezaId))]);
  const porId = new Map(piezas.map((p) => [p.id, p]));
  let n = 0;
  for (const { f, rep } of reposts) {
    const p = porId.get(rep.piezaId);
    const dia = rep.fecha || fechaEnZona(new Date(f.programada_para));
    if (p && p.vigencia === "sin_revisar" && !p.excluida) continue;
    if (p && estaVigente(p, dia)) continue;
    const motivo = motivoDeNoSalir(p, dia);
    if (await acceso.actualizar("publicaciones_programadas", { id: f.id, estado: "programada" }, { estado: "cancelada", error: motivo, updated_at: ahora() })) {
      n++;
      difundir(env, acceso.ownerId, { tipo: "publicacion", calId: null, postId: f.post_id, red: f.red, variante: "historia", estado: "cancelada", por: FIRMA });
    }
  }
  return n;
}

/** Por qué una historia automática no sale ese día (para la cola y la nota). */
export function motivoDeNoSalir(p, dia) {
  if (!p) return "La historia ya no existe.";
  if (p.excluida) return "Se apartó con «Que no salga».";
  if (p.vigencia === "nunca") return `No se reutiliza: ${p.vigencia_motivo || "es de un día concreto"}`;
  if (p.vigencia === "hasta") return `Ya no está vigente (servía hasta el ${p.vigente_hasta}; era para el ${dia}). ${p.vigencia_motivo ?? ""}`.trim();
  return "Aún no se ha revisado si sigue vigente.";
}

/**
 * Guarda la historia hecha de una publicación. La imagen la sube el navegador:
 * tiene que ser de ESTE cliente y estar en R2, y la publicación tiene que
 * estar de verdad publicada (la clave la manda quien pide).
 */
export async function guardarPieza(env, acceso, clientId, { filaId, src, frase = "", estilo = "encajada" } = {}) {
  const prefijo = `/api/media/clientes/${clientId}/`;
  if (typeof src !== "string" || !src.startsWith(prefijo) || src.includes("..")) throw new ErrorHistorias("La imagen no es de este cliente.");
  const clave = src.slice("/api/media/".length);
  if (!(await env.MEDIA.head(clave))) throw new ErrorHistorias("La imagen no se subió.", 404);
  const fila = filaId ? await acceso.leerUno("publicaciones_programadas", { id: String(filaId), client_id: clientId }) : null;
  if (!fila || fila.estado !== "publicada" || !fila.calendar_id) throw new ErrorHistorias("Esa publicación no está publicada.", 404);
  const post = leerJSON(fila.carga, {}).post ?? {};
  // Un estilo que no existe es «encajada» (la de siempre): así una pantalla de antes sigue guardando lo mismo.
  const clavePost = claveDeEstilo(`${fila.calendar_id}|${fila.post_id}`, ESTILOS_HISTORIA.includes(estilo) ? estilo : "encajada");
  const previa = await acceso.leerUno("historias_auto_piezas", { client_id: clientId, clave_post: clavePost });
  const pieza = {
    id: previa?.id ?? uuid(), client_id: clientId, clave_post: clavePost, fila_id: fila.id,
    externo_id: fila.red === "instagram" ? fila.externo_id ?? "" : previa?.externo_id ?? "",
    clave, titulo: String(post.title || post.idea || "").slice(0, 140), frase: String(frase).slice(0, 120),
    publicada_at: fila.publicada_at ?? null, usos: previa?.usos ?? 0, usada_at: previa?.usada_at ?? null,
    excluida: previa?.excluida ? 1 : 0, created_at: previa?.created_at ?? ahora(),
    ...(await vigenciaAlGuardar(acceso, clientId, fila, previa, clavePost)),
  };
  await acceso.guardar("historias_auto_piezas", pieza);
  return pieza;
}

/**
 * La vigencia de una pieza nueva: la que ya tenga (volver a subirla no la borra), la de otra pieza de la misma
 * publicación, o la de las REGLAS si ya dicen que no sirve. Si no, «sin revisar»: la revisará la IA y, hasta entonces,
 * no sale.
 */
async function vigenciaAlGuardar(acceso, clientId, fila, previa, clavePost) {
  if (previa && previa.vigencia && previa.vigencia !== "sin_revisar") return {};
  const base = baseDeClave(clavePost);
  const hermanas = await acceso.leerColumnas("historias_auto_piezas", ["clave_post", ...COLUMNAS_VIGENCIA], { client_id: clientId });
  const hecha = hermanas.find((p) => baseDeClave(p.clave_post) === base && p.vigencia && p.vigencia !== "sin_revisar");
  if (hecha) return columnasDe({ vigencia: hecha.vigencia, hasta: hecha.vigente_hasta, motivo: hecha.vigencia_motivo }, hecha.vigencia_por || "reglas");
  const cliente = await acceso.leerUno("clients", { id: clientId }).catch(() => null);
  const { reglas } = (await contextoDeReglas(acceso, cliente, [fila]))(fila);
  return yaCaducada(reglas, fechaEnZona()) ? columnasDe(reglas, "reglas") : { vigencia: previa?.vigencia ?? "sin_revisar" };
}

/**
 * «Que no salga» (`excluida`: true) o «Que vuelva a salir» (false). La fila NO se borra: si se borrara, la publicación
 * volvería a estar «sin historia hecha» y la aplicación la prepararía otra vez al abrirse.
 */
export async function excluirPieza(acceso, clientId, id, excluida = true) {
  return acceso.actualizar("historias_auto_piezas", { id: String(id), client_id: clientId }, { excluida: excluida ? 1 : 0 });
}

/**
 * La historia de un cliente para `fecha`, en la cola. Devuelve cuántas filas
 * puso (una por red con cuenta) y deja dicho en `nota` lo que pasó.
 */
export async function programarHistoriaDelDia(env, acceso, clientId, fecha, momento = new Date()) {
  const config = await acceso.leerUno("historias_auto", { client_id: clientId });
  if (!config) return 0;
  const ajustes = limpiarAjustes({ activa: config.activa === 1, hora: config.hora, redes: leerJSON(config.redes, []), porDia: config.por_dia });
  const cerrar = async (nota) => {
    await acceso.actualizar("historias_auto", { id: config.id }, { ultima_fecha: fecha, nota, updated_at: ahora() });
  };
  if (!ajustes.activa) return 0;

  // Primero se revisa lo que falte por revisar (si la IA no puede, no sale) y se quita de la cola lo que dejó de servir.
  await revisarVigencias(env, acceso, clientId, { momento }).catch((e) => console.error("historias: revisar vigencia:", e?.message));
  await cancelarVencidas(env, acceso, clientId).catch((e) => console.error("historias: cancelar vencidas:", e?.message));
  const todas = await acceso.leer("historias_auto_piezas", { client_id: clientId });
  const sinApartar = todas.filter((p) => !p.excluida);
  // Sólo lo que sigue VIGENTE ese día: ni lo «sin revisar», ni la promoción de un mes pasado, ni una felicitación.
  const piezas = sinApartar.filter((p) => estaVigente(p, fecha));
  if (!piezas.length) {
    const sinRevisar = sinApartar.filter((p) => p.vigencia === "sin_revisar").length;
    await cerrar(!todas.length ? "Aún no hay publicaciones preparadas: se preparan solas al abrir la aplicación."
      : !sinApartar.length ? "Todas las preparadas están apartadas con «Que no salga»."
        : `Ninguna sigue vigente para el ${fecha}${sinRevisar ? ` (${sinRevisar} sin revisar todavía: no salen hasta que se revisan)` : ""}: lo demás era de una fecha, una promoción o un mes que ya pasó.`);
    return 0;
  }
  const medidas = await acceso.leerVarios("metricas_publicacion", ["externo_id", "interacciones"], "externo_id",
    piezas.map((p) => p.externo_id).filter(Boolean), { client_id: clientId });
  // Las del día (hasta `porDia`), cada una con una publicación distinta y su hora (`horasDelDia`).
  const horas = horasDelDia(ajustes.hora, ajustes.porDia);
  const elegidas = elegirPiezas(piezas, horas.length, { interacciones: new Map(medidas.map((m) => [m.externo_id, m.interacciones])), momento, todas });
  if (!elegidas.length) {
    await cerrar("Ese día no salió ninguna: todo lo preparado salió hace poco o se acaba de publicar.");
    return 0;
  }

  const cuentas = (await acceso.leer("cuentas_sociales", { client_id: clientId })).filter((c) => ajustes.redes.includes(c.red) && c.token_cifrado);
  const meta = await acceso.leerUno("integracion_meta", { id: acceso.ownerId });
  const destinos = ajustes.redes.map((red) => cuentas.find((c) => c.red === red)).filter(Boolean);
  if (!meta || !destinos.length) {
    await cerrar(!meta ? "Meta no está conectado: conéctalo en Ajustes → Integraciones."
      : `El cliente no tiene cuenta de ${ajustes.redes.map((r) => NOMBRE_RED[r]).join(" ni ")} asignada.`);
    return 0;
  }

  const filas = elegidas.flatMap((pieza, i) => {
    const cuando = momentoPublicacion(fecha, horas[i]);
    const post = publicacionDeRepost(pieza, fecha);
    return destinos.map((c) => ({
      id: uuid(), client_id: clientId, calendar_id: null, post_id: `${post.id}-${fecha}`, red: c.red, variante: "historia",
      cuenta_id: c.id, programada_para: cuando, estado: "programada", intentos: 0, siguiente_intento: null,
      carga: JSON.stringify({ post: { ...post, publishTime: horas[i] } }), creado_por: null,
      created_at: ahora(), updated_at: ahora(),
    }));
  });
  await acceso.guardarVarios("publicaciones_programadas", filas);
  for (const [i, pieza] of elegidas.entries()) {
    await acceso.actualizar("historias_auto_piezas", { id: pieza.id }, { usos: (pieza.usos ?? 0) + 1, usada_at: momentoPublicacion(fecha, horas[i]) });
  }
  const faltaron = horas.length - elegidas.length;
  await cerrar(`${fecha}: ${elegidas.map((p, i) => `«${p.titulo || "Publicación"}» (${horas[i]})`).join(", ")} en ${destinos.map((c) => NOMBRE_RED[c.red]).join(" y ")}.${faltaron ? ` ${faltaron === 1 ? "Faltó una" : `Faltaron ${faltaron}`}: no hay más preparadas que puedan salir hoy.` : ""}`);
  for (const f of filas) {
    difundir(env, acceso.ownerId, { tipo: "publicacion", calId: null, postId: f.post_id, red: f.red, variante: "historia", estado: "programada", por: FIRMA });
  }
  return filas.length;
}

/**
 * Del cron: el primer cliente con historias encendidas al que le falta poner
 * la de su próximo día. Uno por vuelta. Devuelve 1 si hizo algo.
 */
export async function historiasAutomaticasPendiente(env, momento = new Date()) {
  // Con la hora 00:00 la próxima fecha es siempre mañana: lo que ya tiene puesta la de mañana no se lee.
  const candidatos = await clientesConHistoriasPendientes(env.DB, proximaFecha("00:00", momento), 50);
  for (const c of candidatos) {
    const fecha = proximaFecha(c.hora, momento);
    if (c.ultima_fecha && c.ultima_fecha >= fecha) continue;
    const acceso = crearAcceso(env.DB, c.owner_id);
    try {
      await programarHistoriaDelDia(env, acceso, c.client_id, fecha, momento);
    } catch (e) {
      console.error("historias automáticas:", c.client_id, e?.message);
      await acceso.actualizar("historias_auto", { client_id: c.client_id }, { ultima_fecha: fecha, nota: `No se pudo programar: ${e?.message ?? e}`, updated_at: ahora() }).catch(() => {});
    }
    return 1;
  }
  // Sin nada que programar: revisar la vigencia de UN cliente con piezas «sin revisar» (una llamada barata a la IA),
  // así ya están revisadas cuando les toque. Lo que la IA no pudo no se reintenta solo hasta pasadas unas horas.
  const [porRevisar] = await historiasPorRevisar(env.DB, new Date(momento.getTime() - REINTENTO_MS).toJSON(), 1);
  if (!porRevisar) return 0;
  const acceso = crearAcceso(env.DB, porRevisar.owner_id);
  try {
    await revisarVigencias(env, acceso, porRevisar.client_id, { momento });
    await cancelarVencidas(env, acceso, porRevisar.client_id);
  } catch (e) {
    console.error("historias: revisar vigencia:", porRevisar.client_id, e?.message);
    // Que el cron no vuelva a este cliente cada minuto.
    for (const p of await acceso.leerColumnas("historias_auto_piezas", ["id"], { client_id: porRevisar.client_id, vigencia: "sin_revisar" }).catch(() => [])) {
      await acceso.actualizar("historias_auto_piezas", { id: p.id }, { revision_intento_at: ahora(), revision_error: String(e?.message ?? e).slice(0, 200) }).catch(() => {});
    }
  }
  return 1;
}
