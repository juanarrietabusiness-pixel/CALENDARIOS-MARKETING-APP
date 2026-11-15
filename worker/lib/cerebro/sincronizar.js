// ============================================================
// El cerebro al día con GitHub: la revisión, los conflictos y lo que no vuelve
//
//   sincronizarCerebro   «Actualizar desde GitHub», la revisión al abrir Marca → Cerebro y la del cron: la importación
//                        (importar.js) y, si algo choca por primera vez, el aviso a la CAMPANA (una vez por choque).
//   resolverConflictos   «Quedarme con la mía» / «Usar la de GitHub» de UNA nota (o varias de un archivo que se fue).
//   marcarNoTraer        Al borrar aquí una nota que viene de GitHub: no se vuelve a traer al actualizar.
//   volverATraer         Deshace esa marca y la trae ya.
//   cerebroPendiente     El paso del cron: UN cliente por vuelta (su árbol de GitHub, una petición; sólo si cambió se
//                        baja algo) o, si trajo cambios en una vuelta anterior, su ficha técnica renovada una vez.
//
// GITHUB MANDA EN EL CANON. Lo que no choca se aplica solo; lo que choca (una nota corregida aquí cuya sección cambió
// allí, o que allí ya no existe) queda guardado en `cerebro_conflictos` hasta que una persona decide. Nada vuelve a
// GitHub: escribir allí necesita un token con permiso de escritura que el servidor no tiene.
// ============================================================

import { crearAcceso, cerebrosPorRevisar } from "../acceso.js";
import { uuid, ahora } from "../ids.js";
import { avisar } from "../equipo.js";
import { fechaEnZona } from "../../../src/lib/agenda.js";
import { importarDelRepositorio } from "./importar.js";
import { prepararFicha } from "./preparar.js";
import { leerEstadoSync, marcarFicha } from "./estadoSync.js";
import { derivados, EDITADA_TEXTO } from "./notas.js";
import { reindexar } from "./cerebro.js";

/** Quien firma lo que hace el cron (si fuera una persona, `avisar` no se lo mandaría a ella). */
export const POR_CEREBRO = Object.freeze({ userId: "sistema", nombre: "Cerebro" });

/** Lo que espera la revisión al abrir el cerebro antes de volver a mirar GitHub (cambiar de pestaña no es motivo). */
export const REVISION_RECIENTE_MS = 10 * 60_000;

/** Cuánto le da el cron a la pantalla que trajo cambios para renovar la ficha ella misma (y no pagarla dos veces). */
export const FICHA_ESPERA_MS = 5 * 60_000;

const enlaceDelCerebro = (clientId) => `/cliente/${encodeURIComponent(clientId)}/marca/cerebro`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** El texto del aviso de lo que choca por primera vez (o con otra versión de GitHub), o "" si no hay nada. Pura. */
export function textoDelAviso(cliente, conflictos) {
  const cambios = conflictos.filter((c) => c.tipo === "cambio").length;
  const idas = conflictos.length - cambios;
  const partes = [];
  if (cambios) partes.push(plural(cambios, "nota que corregiste aquí también cambió en GitHub", "notas que corregiste aquí también cambiaron en GitHub"));
  if (idas) partes.push(plural(idas, "nota corregida aquí ya no está en GitHub", "notas corregidas aquí ya no están en GitHub"));
  return partes.length ? `Cerebro de ${cliente?.name ?? "un cliente"}: ${partes.join(" y ")}. Decide cuál vale en Marca → Cerebro.` : "";
}

/** Quién del equipo recibe el aviso: quien puede tocar el cerebro de ESE cliente (sin sólo lectura). */
async function destinatarios(acceso, clientId) {
  const filas = await acceso.leer("memberships", {}, "created_at asc");
  return filas.filter((m) => {
    if (Number(m.solo_lectura)) return false;
    if (m.clientes === null || m.clientes === undefined || m.clientes === "") return true;
    try { return JSON.parse(m.clientes).map(String).includes(String(clientId)); } catch { return false; }
  }).map((m) => m.user_id);
}

/**
 * La sincronización entera de un cliente: la importación y el aviso de lo que choca. `auto`: la revisión al abrir el
 * cerebro (no vuelve a mirar GitHub si se miró hace menos de `REVISION_RECIENTE_MS` y no quedó nada pendiente).
 * `por`: { userId, nombre } de quien la pidió (no recibe el aviso: lo está viendo). Lanza lo que lanza la importación.
 */
export async function sincronizarCerebro(env, acceso, cliente, { auto = false, soloSiCambio = auto, por = null, ...opciones } = {}) {
  if (auto) {
    const e = await leerEstadoSync(acceso, cliente.id);
    const reciente = e.revisadoAt && Date.now() - Date.parse(e.revisadoAt) < REVISION_RECIENTE_MS;
    if (reciente && !e.pendientes) return { reciente: true, sinCambios: true, trajo: false, conflictos: { nuevos: 0 } };
  }
  const r = await importarDelRepositorio(env, acceso, cliente, { actualizar: true, soloSiCambio, ...opciones });
  const nuevos = r.conflictos?.avisar ?? [];
  if (nuevos.length) {
    try {
      await avisar(env, acceso, {
        para: await destinatarios(acceso, cliente.id), tipo: "cerebro", texto: textoDelAviso(cliente, nuevos),
        enlace: enlaceDelCerebro(cliente.id), por: por ?? POR_CEREBRO,
      });
    } catch (e) {
      console.error("cerebro: no se pudo avisar de los conflictos", e);
    }
  }
  // Lo que se avisa no viaja al navegador: son filas con el texto de GitHub.
  return { ...r, conflictos: { nuevos: nuevos.length, total: r.conflictos?.total ?? 0 } };
}

// ------------------------------------------------------------
// Los conflictos
// ------------------------------------------------------------

/** Los conflictos de un cliente para la lista (sin los textos), con el título de su nota. */
export async function listarConflictos(acceso, clientId) {
  const filas = await acceso.leerColumnas("cerebro_conflictos", ["id", "nota_id", "tipo", "fuente", "created_at", "updated_at"], { client_id: clientId }, "fuente asc, created_at asc");
  if (!filas.length) return [];
  const notas = await acceso.leerVarios("cerebro_notas", ["id", "titulo", "ruta"], "id", filas.map((f) => f.nota_id), { client_id: clientId });
  const porId = new Map(notas.map((n) => [n.id, n]));
  return filas.filter((f) => porId.has(f.nota_id)).map((f) => ({
    id: f.id, notaId: f.nota_id, titulo: porId.get(f.nota_id).titulo, ruta: porId.get(f.nota_id).ruta, tipo: f.tipo, fuente: f.fuente, desde: f.updated_at,
  }));
}

/** Un conflicto con los dos textos: la nota de aquí y la sección de GitHub. → null si no está. */
export async function leerConflicto(acceso, clientId, id) {
  const c = await acceso.leerUno("cerebro_conflictos", { id: String(id), client_id: clientId });
  if (!c) return null;
  const n = await acceso.leerUno("cerebro_notas", { id: c.nota_id, client_id: clientId });
  if (!n) return null;
  return { id: c.id, notaId: n.id, titulo: n.titulo, tipo: c.tipo, fuente: c.fuente || n.fuente, mia: n.texto, github: c.texto, desde: c.updated_at };
}

/**
 * Resuelve conflictos (`ids`, hasta 50) con `usar`:
 *   «github»  en un cambio, la nota toma el texto de GitHub (y deja de estar «corregida aquí», con su tipo y su candado);
 *             si su sección o su archivo ya no está, la nota se quita.
 *   «mia»     en un cambio, la nota se queda como está y lo de GitHub pasa a ser la base (sólo vuelve a chocar si esa
 *             sección cambia otra vez); si ya no está en GitHub, se queda como nota propia del cerebro.
 * → { resueltos, cambiadas, quitadas }
 */
export async function resolverConflictos(env, acceso, clientId, ids, usar) {
  if (!["mia", "github"].includes(usar)) throw new Error("usar: mia | github");
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 50);
  if (!lista.length) return { resueltos: 0, cambiadas: 0, quitadas: 0 };
  const conflictos = await acceso.leerVarios("cerebro_conflictos", ["id", "nota_id", "tipo", "fuente", "texto", "seccion_hash", "fuente_sha"], "id", lista, { client_id: clientId });
  if (!conflictos.length) return { resueltos: 0, cambiadas: 0, quitadas: 0 };
  const notas = await acceso.leerVarios("cerebro_notas", ["id", "editada", "fuente"], "id", conflictos.map((c) => c.nota_id), { client_id: clientId });
  const nota = new Map(notas.map((n) => [n.id, n]));
  const t = ahora();
  const cambios = [];
  const quitar = [];
  for (const c of conflictos) {
    const n = nota.get(c.nota_id);
    if (!n) continue;
    const editada = Number(n.editada ?? 0);
    if (c.tipo === "cambio") {
      cambios.push({
        where: { id: n.id, client_id: clientId },
        cambios: usar === "github"
          ? { texto: c.texto, ...derivados(c.texto), editada: editada & ~EDITADA_TEXTO, seccion_hash: c.seccion_hash, fuente_sha: c.fuente_sha, fuente: c.fuente || n.fuente, created_at: t, updated_at: t }
          : { seccion_hash: c.seccion_hash, fuente_sha: c.fuente_sha, fuente: c.fuente || n.fuente },
      });
    } else if (usar === "github") {
      quitar.push(n.id);
    } else {
      // Ya no está en GitHub y la persona la quiere: es suya. Sin `origen: "repositorio"` ninguna actualización la toca.
      cambios.push({ where: { id: n.id, client_id: clientId }, cambios: { origen: "manual", fuente_sha: "", seccion_hash: "" } });
    }
  }
  await acceso.borrarVarios("cerebro_conflictos", conflictos.map((c) => c.id));
  if (quitar.length) await acceso.borrarVarios("cerebro_notas", quitar);
  if (cambios.length) await acceso.actualizarVarios("cerebro_notas", cambios);
  const cambiadas = usar === "github" ? cambios.length : 0;
  if (cambiadas || quitar.length) await reindexar(env, acceso, clientId);
  return { resueltos: conflictos.length, cambiadas, quitadas: quitar.length };
}

// ------------------------------------------------------------
// Lo que no vuelve
// ------------------------------------------------------------

/** Lo que se borró aquí y no se trae de GitHub, para la lista. */
export const listarNoTraer = (acceso, clientId) =>
  acceso.leerColumnas("cerebro_no_traer", ["id", "fuente", "titulo", "por", "created_at"], { client_id: clientId }, "fuente asc, titulo asc", 200);

/** Al borrar una nota que viene de GitHub: la marca de «no traer» (archivo + título de la sección). Nunca lanza. */
export async function marcarNoTraer(acceso, clientId, nota, por = "") {
  if (nota?.origen !== "repositorio" || !nota.fuente) return false;
  try {
    const ya = await acceso.leerUno("cerebro_no_traer", { client_id: clientId, fuente: nota.fuente, titulo: nota.titulo });
    if (ya) return true;
    await acceso.insertar("cerebro_no_traer", { id: uuid(), client_id: clientId, fuente: nota.fuente, titulo: nota.titulo, por: String(por ?? "").slice(0, 80) });
    return true;
  } catch (e) {
    console.error("cerebro: no se pudo apuntar que no se traiga", e);
    return false;
  }
}

/** Deshace la marca y trae ya ese archivo de GitHub (sólo vuelve esa sección: las demás ya estaban). → la importación o null. */
export async function volverATraer(env, acceso, cliente, id, { por = null } = {}) {
  const marca = await acceso.leerUno("cerebro_no_traer", { id: String(id), client_id: cliente.id });
  if (!marca) return null;
  await acceso.borrar("cerebro_no_traer", { id: marca.id, client_id: cliente.id });
  if (!cliente.github_repo) return { sinRepositorio: true };
  return sincronizarCerebro(env, acceso, cliente, { forzar: [marca.fuente], por });
}

// ------------------------------------------------------------
// El cron
// ------------------------------------------------------------

/**
 * El paso del cron (worker/index.js, al final de la cascada): UN cliente por vuelta. Si en una vuelta anterior trajo
 * cambios y su ficha espera (y la pantalla no la renovó), la renueva; si no, mira su árbol de GitHub (una petición) y
 * sólo si cambió baja lo que cambió (hasta 40 archivos) y lo aplica. → 1 si hizo algo, 0 si no había nada.
 */
export async function cerebroPendiente(env, momento = new Date()) {
  if (!env?.DB) return 0;
  const hoy = fechaEnZona(momento);
  const [s] = await cerebrosPorRevisar(env.DB, {
    ahoraISO: momento.toISOString(),
    // La medianoche de Panamá (UTC-5, sin horario de verano).
    revisadoAntes: `${hoy}T05:00:00.000Z`,
    fichaAntes: new Date(momento.getTime() - FICHA_ESPERA_MS).toISOString(),
  }, 1);
  if (!s) return 0;
  const acceso = crearAcceso(env.DB, s.owner_id);
  const cliente = await acceso.leerUno("clients", { id: s.client_id });
  if (!cliente) return 0;
  if (Number(s.ficha_pendiente) && !Number(s.pendientes)) {
    try {
      await prepararFicha(env, acceso, cliente, { forzar: false });
    } catch (e) {
      // Sin IA, sin presupuesto o sin notas de marca: no se reintenta cada minuto. La pantalla sigue diciendo que la
      // ficha está desactualizada, y por qué no se renovó sola.
      await marcarFicha(acceso, cliente.id, false, { error: `La ficha técnica no se pudo renovar sola: ${String(e?.message ?? e)}`.slice(0, 300) });
    }
    return 1;
  }
  try {
    await sincronizarCerebro(env, acceso, cliente, { soloSiCambio: !Number(s.pendientes), por: POR_CEREBRO });
  } catch (e) {
    // El motivo ya quedó apuntado en `cerebro_sync` (importar.js): la pantalla lo enseña.
    console.error("cron cerebro:", e?.message ?? e);
  }
  return 1;
}
