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
import { AUTORIDAD, SIEMPRE, grupoDe } from "./notas.js";
import { cargarBoost, leerPesos, pesoDe, enlacesAprendidos } from "./pesos.js";

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
 *   imagen  crear una imagen o un video: la identidad visual (marca, maquetación), sin internas.
 *           Un prompt de imagen sale hacia un proveedor externo y queda en la galería del cliente:
 *           lo que el equipo se dice a sí mismo (costos, márgenes) no tiene nada que hacer ahí.
 *   chat    el equipo hablando con el asistente: todo.
 */
export const USOS = Object.freeze(["texto", "piezas", "imagen", "chat"]);

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

/**
 * `aristas`: el grafo ya calculado, o `null` si todavía no. Editar una nota lo deja en `null` en vez de
 * recalcularlo: el grafo entero cuesta entre 3 y 9 ms de CPU, sólo lo usa `contexto()` (las vecinas), y varias
 * ediciones seguidas lo pagarían cada una. Lo calcula quien primero lo pide (`cargarIndice`) y lo deja guardado.
 */
async function guardarPaquete(env, clientId, ix, meta, aristas) {
  const paquete = { v: VERSION, generado: new Date().toISOString(), indice: serializar(ix), meta, aristas };
  await env.MEDIA.put(claveIndice(clientId), JSON.stringify(paquete), { httpMetadata: { contentType: "application/json" } });
  return paquete;
}

/**
 * Lo que el índice sabe de cada nota además de su texto. `u` es su `updated_at` en D1 y `c` su tamaño: con los dos
 * se comprueba que el índice y las notas siguen diciendo lo mismo (`hayDeriva`). El tamaño está por si dos ediciones
 * caen en el mismo milisegundo, que la fecha no distinguiría.
 */
const metaDe = (n) => ({ t: n.tipo, i: n.interna ? 1 : 0, ti: n.titulo, u: n.updated_at, c: n.caracteres });

/** Las notas del cliente (con su texto), por título. */
export const leerNotas = (acceso, clientId) => acceso.leer("cerebro_notas", { client_id: clientId }, "titulo asc");

/** Las notas del cliente SIN su texto: lo que hace falta para listarlas, compararlas o repartir rutas. */
export const COLUMNAS_LIGERAS = Object.freeze([
  "id", "ruta", "titulo", "tipo", "origen", "fuente", "fuente_sha", "interna", "resumen", "caracteres", "created_at", "updated_at",
]);
export const leerNotasLigeras = (acceso, clientId) =>
  acceso.leerColumnas("cerebro_notas", COLUMNAS_LIGERAS, { client_id: clientId }, "titulo asc");

/**
 * ¿El índice guardado ya no dice lo mismo que las notas? Hay dos escritores concurrentes —dos ediciones a la vez,
 * o un guardado que se cruza con una importación— y cada uno lee el índice, lo parcha y lo escribe entero: el que
 * escribe último se lleva por delante lo del otro. R2 no tiene condiciones de escritura que lo impidan, así que se
 * detecta al leer: una nota que falta, una de más, o una cuya versión (`updated_at`), tipo, título o candado no
 * coincide con la de D1. Puro: recibe el `meta` del índice y las filas ligeras de D1.
 */
export function hayDeriva(meta, filas) {
  const claves = Object.keys(meta ?? {});
  if (claves.length !== filas.length) return true;
  for (const f of filas) {
    const m = meta[f.ruta];
    if (!m || m.u !== f.updated_at || m.c !== f.caracteres || m.t !== f.tipo || m.ti !== f.titulo || m.i !== (f.interna ? 1 : 0)) return true;
  }
  return false;
}

/**
 * Reconstruye el índice de un cliente desde D1. Se llama al importar, al
 * pedirlo a mano y cuando el índice guardado falta, es de otra versión o
 * ya no coincide con las notas.
 */
export async function reindexar(env, acceso, clientId) {
  const notas = await leerNotas(acceso, clientId);
  const ix = buildIndex(new Map(notas.map((n) => [n.ruta, n.texto])));
  const meta = Object.fromEntries(notas.map((n) => [n.ruta, metaDe(n)]));
  const paquete = await guardarPaquete(env, clientId, ix, meta, aristasDe(ix));
  return { ix, meta, aristas: paquete.aristas, generado: paquete.generado, reconstruido: true };
}

async function leerPaquete(env, clientId) {
  const objeto = await env.MEDIA.get(claveIndice(clientId));
  if (!objeto) return null;
  try {
    const p = JSON.parse(await objeto.text());
    const ix = p?.v === VERSION ? cargar(p.indice) : null;
    return ix && p.meta ? { ix, meta: p.meta, aristas: Array.isArray(p.aristas) ? p.aristas : null, generado: p.generado, crudo: p } : null;
  } catch {
    return null;
  }
}

/**
 * El índice del cliente, listo para consultar. Si no hay uno bueno, o no coincide con las notas, lo construye.
 * Con `conGrafo`, si el índice está bien pero su grafo quedó pendiente de una edición, lo calcula y lo deja guardado.
 */
export async function cargarIndice(env, acceso, clientId, { conGrafo = false } = {}) {
  const actual = await leerPaquete(env, clientId);
  if (!actual) return reindexar(env, acceso, clientId);
  const filas = await acceso.leerColumnas("cerebro_notas", ["ruta", "titulo", "tipo", "interna", "caracteres", "updated_at"], { client_id: clientId });
  if (hayDeriva(actual.meta, filas)) return reindexar(env, acceso, clientId);
  if (conGrafo && !actual.aristas) {
    actual.aristas = aristasDe(actual.ix);
    // Guardarlo es un favor a la siguiente lectura: si falla, ésta ya tiene lo que necesita.
    try {
      await env.MEDIA.put(claveIndice(clientId), JSON.stringify({ ...actual.crudo, aristas: actual.aristas }), { httpMetadata: { contentType: "application/json" } });
    } catch (e) {
      console.error("cerebro: no se pudo guardar el grafo", e);
    }
  }
  return actual;
}

/**
 * Una nota cambió (`nota`, con su `updated_at` tal como quedó en D1) o se borró (`null`): se parcha el índice sin
 * volver a leer las demás. Si el índice no estaba, se construye entero.
 */
export async function actualizarIndice(env, acceso, clientId, ruta, nota) {
  const actual = await leerPaquete(env, clientId);
  if (!actual) return reindexar(env, acceso, clientId);
  const ix = reemplazarNota(actual.ix, ruta, nota ? nota.texto : null);
  const meta = { ...actual.meta };
  if (nota) meta[ruta] = metaDe(nota);
  else delete meta[ruta];
  const paquete = await guardarPaquete(env, clientId, ix, meta, null);
  return { ix, meta, aristas: null, generado: paquete.generado };
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
 * pasajes, puntos }]. Aquí la ficha y las cifras SÍ compiten como cualquier
 * nota: quien busca (el buscador de la pestaña, el asistente, Claude por MCP)
 * no las recibe de ningún otro lado. Sólo `contexto()` las pone aparte, siempre,
 * y por eso allí no entran en los pasajes. `aprendido(ruta)` es un factor
 * (0,8–1,2) de lo aprendido.
 */
export async function buscar(env, acceso, clientId, consulta, { para = "texto", n = 5, per = 2, aprendido } = {}) {
  const { ix, meta } = await cargarIndice(env, acceso, clientId);
  // Lo aprendido de lo que pasó con las publicaciones (pesos.js): quien no lo pide lo recibe igual.
  if (aprendido === undefined) aprendido = await cargarBoost(acceso, clientId);
  const hits = search(ix, consulta, {
    n, per,
    boost: pesos(meta, aprendido),
    excluir: (ruta) => fueraDeUso(meta[ruta], para),
  });
  return hits.map((h) => ({
    ruta: h.note, titulo: meta[h.note]?.ti ?? h.note, tipo: meta[h.note]?.t ?? "nota", interna: Boolean(meta[h.note]?.i),
    pasajes: h.passages, puntos: h.score,
  }));
}

/** Lo que se le da a la IA para una tarea: la ficha, las cifras y los pasajes que esa tarea necesita. */
export async function contexto(env, acceso, clientId, consulta, { para = "texto", n = 5, per = 2, presupuesto = 9000, aprendido } = {}) {
  const { ix, meta, aristas } = await cargarIndice(env, acceso, clientId, { conGrafo: true });
  if (aprendido === undefined) aprendido = await cargarBoost(acceso, clientId);
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
    // Cuántas notas le sirven a ESTE uso: 0 quiere decir que el cerebro aún no se llenó —o que todo lo que tiene
    // queda fuera de este uso, por interno—, y quien pide el contexto (la generación) vuelve entonces al ADN de
    // la ficha del cliente.
    notas: Object.keys(meta).filter(vale).length,
  };
}

/**
 * Cuántas notas hay «sin revisar» según cuándo se tocaron por última vez. Si la fila trae el texto, también cuenta la
 * fecha que el propio texto declare (`revisar:`, `actualizado:`); la lista ligera no lo trae, y el ADN de las
 * agencias no lleva ninguna de las dos.
 */
export function notasViejas(notas, ahora = Date.now()) {
  return notas.filter((n) => n.tipo !== "borrador" && staleness(n.texto ?? "", Date.parse(n.updated_at) || ahora, ahora).stale).length;
}

// ------------------------------------------------------------
// El mapa: las notas como puntos y sus conexiones como líneas
// ------------------------------------------------------------

/**
 * El grafo de un cliente para dibujarlo: sus notas SIN el texto (sólo lo que hace falta para pintar y para leer un
 * resumen) y dos clases de conexión, que son índices de `notas`:
 *   enlaces    una nota escribió [[la otra]]: alguien las conectó a propósito.
 *   menciones  una nota nombra a la otra sin enlazarla: más tenue, y hay muchas más.
 *   aprendidas [i, j, peso]: dos notas que se usaron juntas en algo que salió bien; nacen de lo que pasa después de
 *              escribir (aprender.js), no de lo que dice ninguna nota.
 * Sale del mismo índice que usa `contexto()` para las vecinas, así que el mapa enseña lo que la IA de verdad recorre.
 * `d` es cuántas conexiones toca una nota: lo que decide su tamaño y qué tan al centro queda.
 */
export async function grafo(env, acceso, clientId) {
  const { aristas } = await cargarIndice(env, acceso, clientId, { conGrafo: true });
  const filas = await leerNotasLigeras(acceso, clientId);
  const posicion = new Map(filas.map((n, i) => [n.ruta, i]));
  const enlaces = [];
  const menciones = [];
  const aprendidas = [];
  const grado = new Array(filas.length).fill(0);
  const pesos = await leerPesos(acceso, clientId);
  for (const [a, b, peso] of aristas ?? []) {
    const i = posicion.get(a);
    const j = posicion.get(b);
    // Una arista de una nota que ya no está (se borró entre la lectura del índice y la de las notas): se salta.
    if (i === undefined || j === undefined || i === j) continue;
    (peso >= 1 ? enlaces : menciones).push([i, j]);
    grado[i]++;
    grado[j]++;
  }
  // Los enlaces que se aprendieron de lo que salió bien (dos notas usadas juntas en algo que el cliente aprobó).
  for (const [a, b, w] of enlacesAprendidos(pesos)) {
    const i = posicion.get(a);
    const j = posicion.get(b);
    if (i !== undefined && j !== undefined && i !== j) aprendidas.push([i, j, w]);
  }
  return {
    notas: filas.map((n, i) => ({
      id: n.id, ruta: n.ruta, titulo: n.titulo, tipo: n.tipo, origen: n.origen, fuente: n.fuente, grupo: grupoDe(n),
      interna: Boolean(n.interna), caracteres: n.caracteres, resumen: n.resumen, actualizada: n.updated_at, d: grado[i],
      // Cuánto pesa hoy por lo aprendido (0–1, 0,5 neutro), o null si nunca se aprendió nada de ella.
      peso: pesoDe(pesos, n.ruta),
    })),
    enlaces,
    menciones,
    aprendidas,
  };
}
