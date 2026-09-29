// ============================================================
// El cerebro de un cliente: el índice, la búsqueda y el contexto
//
// Junta el motor puro (`conocimiento.js`, `memoria.js`, `notas.js`) con
// dónde viven las cosas:
//
//   D1  `cerebro_notas`  Las notas. Son la verdad. Se leen y escriben por
//                        la capa de acceso, que las acota por espacio y,
//                        para un colaborador, por cliente.
//   R2  `cerebro/<cliente>/indice.json`
//                        El índice de búsqueda YA construido, con el
//                        grafo. Es un derivado: si falta o es de otra
//                        versión se reconstruye desde D1.
//
// POR QUÉ EL PREFIJO `cerebro/` Y NO `clientes/<id>/cerebro/`
//
// `/api/media/*` sirve cualquier clave que empiece por `clientes/` de un
// cliente del espacio, y borra con DELETE. Un índice con todas las notas
// —también las internas, con costos y márgenes— no tiene por qué salir
// por la ruta de las imágenes ni poder borrarse por ella. Con otro
// prefijo, esa ruta no lo alcanza. Lo vigila `enrutado.test.js`.
//
// El índice de UN cliente se construye sólo con las notas de ese cliente:
// esta capa recibe el `clientId` ya comprobado contra el espacio (quien la
// llama hace `acceso.leerUno("clients", …)`) y nunca mezcla dos.
// ============================================================

import { buildIndex, reemplazarNota, serializar, cargar, search, staleness } from "./conocimiento.js";
import { linkGraph, expand, pack, summary } from "./memoria.js";
import { AUTORIDAD, SIEMPRE } from "./notas.js";

const ID_CLIENTE = /^[\w-]{1,80}$/;
const VERSION = 1;

export const claveIndice = (clientId) => {
  if (!ID_CLIENTE.test(String(clientId))) throw new Error("Cliente no válido");
  return `cerebro/${clientId}/indice.json`;
};

/**
 * Para qué se pide el contexto:
 *   texto   escribir lo que se PUBLICA (ideas, guiones, captions): sin notas
 *           internas y sin la capa de maquetación de Meta AI.
 *   piezas  pedirle las piezas a Meta AI: con la maquetación, sin internas.
 *   chat    el equipo hablando con el asistente: todo.
 */
export const USOS = Object.freeze(["texto", "piezas", "chat"]);

/** ¿Esta nota queda fuera de este uso? */
export function fueraDeUso(meta, para) {
  if (!meta) return false;
  if (para === "chat") return false;
  if (meta.i) return true;
  return para === "texto" && meta.t === "maquetacion";
}

// ------------------------------------------------------------
// El índice en R2
// ------------------------------------------------------------

/** Las notas de un índice, como texto: los pasajes de cada una juntos. Sirve para el grafo y las vecinas. */
function textosDeIndice(ix) {
  const mapa = new Map();
  for (const d of ix.docs) mapa.set(d.note, (mapa.get(d.note) ? mapa.get(d.note) + "\n\n" : "") + d.text);
  return mapa;
}

/** El grafo de un índice como lista de aristas: es lo que se guarda, y es barato de volver a armar. */
function aristasDe(ix) {
  const adj = linkGraph(textosDeIndice(ix));
  const salida = [];
  for (const [a, vecinas] of adj) for (const [b, w] of vecinas) if (a < b) salida.push([a, b, w]);
  return salida;
}

async function guardarPaquete(env, clientId, ix, meta) {
  const paquete = { v: VERSION, generado: new Date().toISOString(), indice: serializar(ix), meta, aristas: aristasDe(ix) };
  await env.MEDIA.put(claveIndice(clientId), JSON.stringify(paquete), { httpMetadata: { contentType: "application/json" } });
  return paquete;
}

const metaDe = (n) => ({ t: n.tipo, i: n.interna ? 1 : 0, ti: n.titulo });

/** Las notas del cliente (con su texto), por título. */
export const leerNotas = (acceso, clientId) => acceso.leer("cerebro_notas", { client_id: clientId }, "titulo asc");

/**
 * Reconstruye el índice de un cliente desde D1. Se llama al importar, al
 * pedirlo a mano y cuando el índice guardado falta o es de otra versión.
 */
export async function reindexar(env, acceso, clientId) {
  const notas = await leerNotas(acceso, clientId);
  const ix = buildIndex(new Map(notas.map((n) => [n.ruta, n.texto])));
  const meta = Object.fromEntries(notas.map((n) => [n.ruta, metaDe(n)]));
  const paquete = await guardarPaquete(env, clientId, ix, meta);
  return { ix, meta, aristas: paquete.aristas, generado: paquete.generado, reconstruido: true };
}

async function leerPaquete(env, clientId) {
  const objeto = await env.MEDIA.get(claveIndice(clientId));
  if (!objeto) return null;
  try {
    const p = JSON.parse(await objeto.text());
    const ix = p?.v === VERSION ? cargar(p.indice) : null;
    return ix && p.meta ? { ix, meta: p.meta, aristas: p.aristas ?? [], generado: p.generado } : null;
  } catch {
    return null;
  }
}

/** El índice del cliente, listo para consultar. Si no hay uno bueno, lo construye. */
export async function cargarIndice(env, acceso, clientId) {
  return (await leerPaquete(env, clientId)) ?? (await reindexar(env, acceso, clientId));
}

/**
 * Una nota cambió (`nota`) o se borró (`null`): se parcha el índice sin
 * volver a leer las demás. Si el índice no estaba, se construye entero.
 */
export async function actualizarIndice(env, acceso, clientId, ruta, nota) {
  const actual = await leerPaquete(env, clientId);
  if (!actual) return reindexar(env, acceso, clientId);
  const ix = reemplazarNota(actual.ix, ruta, nota ? nota.texto : null);
  const meta = { ...actual.meta };
  if (nota) meta[ruta] = metaDe(nota);
  else delete meta[ruta];
  const paquete = await guardarPaquete(env, clientId, ix, meta);
  return { ix, meta, aristas: paquete.aristas, generado: paquete.generado };
}

/** Borra el índice (el cerebro del cliente se vació). */
export const olvidarIndice = (env, clientId) => env.MEDIA.delete(claveIndice(clientId));

// ------------------------------------------------------------
// Buscar y armar el contexto
// ------------------------------------------------------------

/** Una nota entera, leída del índice (sus pasajes juntos). */
export function textoDe(ix, ruta) {
  return ix.docs.filter((d) => d.note === ruta).map((d) => d.text).join("\n\n");
}

/** Los pesos de una búsqueda: la autoridad de cada tipo, por lo aprendido si lo hay. */
function pesos(meta, aprendido) {
  return (ruta) => (AUTORIDAD[meta[ruta]?.t] ?? 1) * (aprendido ? aprendido(ruta) : 1);
}

/**
 * Buscar en el cerebro de un cliente. → [{ ruta, titulo, tipo, interna,
 * pasajes, puntos }]. La ficha y las cifras no compiten: `contexto()` las
 * pone siempre. `aprendido(ruta)` es un factor (0,8–1,2) de lo aprendido.
 */
export async function buscar(env, acceso, clientId, consulta, { para = "texto", n = 5, per = 2, aprendido = null } = {}) {
  const { ix, meta } = await cargarIndice(env, acceso, clientId);
  const hits = search(ix, consulta, {
    n, per,
    boost: pesos(meta, aprendido),
    excluir: (ruta) => SIEMPRE.includes(meta[ruta]?.t) || fueraDeUso(meta[ruta], para),
  });
  return hits.map((h) => ({
    ruta: h.note, titulo: meta[h.note]?.ti ?? h.note, tipo: meta[h.note]?.t ?? "nota", interna: Boolean(meta[h.note]?.i),
    pasajes: h.passages, puntos: h.score,
  }));
}

/** Lo que se le da a la IA para una tarea: la ficha, las cifras y los pasajes que esa tarea necesita. */
export async function contexto(env, acceso, clientId, consulta, { para = "texto", n = 5, per = 2, presupuesto = 9000, aprendido = null } = {}) {
  const { ix, meta, aristas } = await cargarIndice(env, acceso, clientId);
  const vale = (ruta) => !fueraDeUso(meta[ruta], para);
  const fija = (tipo) => Object.keys(meta).filter((r) => meta[r].t === tipo && vale(r)).sort();
  const unida = (tipo) => fija(tipo).map((r) => textoDe(ix, r)).filter(Boolean).join("\n\n");

  const hits = search(ix, consulta, {
    n, per,
    boost: pesos(meta, aprendido),
    excluir: (ruta) => SIEMPRE.includes(meta[ruta]?.t) || fueraDeUso(meta[ruta], para),
  });

  // Las vecinas de las mejores: un resumen de cada una, no la nota entera.
  const adj = new Map();
  for (const [a, b, w] of aristas) {
    for (const [x, y] of [[a, b], [b, a]]) (adj.get(x) || adj.set(x, new Map()).get(x)).set(y, w);
  }
  const vecinas = expand(hits.map((h) => ({ note: h.note, score: h.score })), adj, {
    skip: new Set(Object.keys(meta).filter((r) => !vale(r) || SIEMPRE.includes(meta[r].t))),
  });

  const bloques = hits.map((h) => ({ head: `--- ${meta[h.note]?.ti ?? h.note} [${h.note}] ---`, body: h.passages.join("\n…\n") }));
  for (const v of vecinas) bloques.push({ head: `--- (relacionada) ${meta[v.note]?.ti ?? v.note} [${v.note}] ---`, body: summary(textoDe(ix, v.note), 320) });

  return {
    ficha: unida("ficha"),
    cifras: unida("cifras"),
    pasajes: pack(bloques, presupuesto),
    fuentes: [...hits.map((h) => h.note), ...vecinas.map((v) => v.note)],
  };
}

/** Cuántas notas hay «sin revisar» según sus fechas y cuándo se tocaron por última vez. */
export function notasViejas(notas, ahora = Date.now()) {
  return notas.filter((n) => n.tipo !== "borrador" && staleness(n.texto, Date.parse(n.updated_at) || ahora, ahora).stale).length;
}
