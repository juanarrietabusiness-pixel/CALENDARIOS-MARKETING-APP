// ============================================================
// Cómo va el cerebro de un cliente con GitHub (tabla `cerebro_sync`, 0079)
//
// Una fila por cliente (su id ES el del cliente): la última vez que se miró
// GitHub, lo que ya se trajo (`archivos`: ruta → sha, el «manifiesto»), lo
// que no entró (`fuera`), lo que quedó para la siguiente vuelta y el permiso
// de UNA sincronización a la vez.
//
// EL PERMISO. La revisión diaria del cron, la de la pantalla al abrir el
// cerebro y el botón pueden cruzarse. Dos sincronizaciones a la vez sobre el
// mismo cliente crearían dos veces las mismas notas (o morirían en el índice
// único de la ruta a media escritura). `bloqueado_hasta` se reserva con el
// valor que se leyó como condición del UPDATE —el segundo no cambia ninguna
// fila— y se suelta al terminar; si el Worker muere a medias, caduca solo.
// ============================================================

import { NULO } from "../acceso.js";
import { ahora } from "../ids.js";

/** Cuánto dura el permiso: bajar 40 archivos y escribir sus notas tarda segundos, no minutos. */
export const BLOQUEO_MS = 3 * 60_000;

const json = (v, d) => {
  if (v && typeof v === "object") return v;
  try { return JSON.parse(v ?? ""); } catch { return d; }
};

/** Una fila de `cerebro_sync` (o nada) con su JSON leído. Pura. */
export function estadoDeFila(fila) {
  return {
    existe: Boolean(fila),
    carpeta: fila?.carpeta ?? "",
    huella: fila?.huella ?? "",
    archivos: json(fila?.archivos, {}) ?? {},
    fuera: json(fila?.fuera, {}) ?? {},
    pendientes: Number(fila?.pendientes ?? 0),
    fichaPendiente: Boolean(Number(fila?.ficha_pendiente ?? 0)),
    error: fila?.error ?? "",
    revisadoAt: fila?.revisado_at ?? null,
    sincronizadoAt: fila?.sincronizado_at ?? null,
    bloqueadoHasta: fila?.bloqueado_hasta ?? null,
  };
}

/** El estado de un cliente, sin tomar nada (lo que lee la pantalla). */
export async function leerEstadoSync(acceso, clientId) {
  return estadoDeFila(await acceso.leerUno("cerebro_sync", { id: clientId }));
}

/**
 * Toma el permiso de sincronizar a `clientId`. → el estado (como `estadoDeFila`) o null si otra sincronización lo
 * tiene. Crea la fila la primera vez.
 */
export async function tomarSync(acceso, clientId, ahoraMs = Date.now()) {
  let fila = await acceso.leerUno("cerebro_sync", { id: clientId });
  if (!fila) {
    try {
      await acceso.insertar("cerebro_sync", { id: clientId, client_id: clientId });
    } catch {
      // Otra la creó a la vez: se lee la suya.
    }
    fila = await acceso.leerUno("cerebro_sync", { id: clientId });
    if (!fila) return null;
  }
  if (fila.bloqueado_hasta && Date.parse(fila.bloqueado_hasta) > ahoraMs) return null;
  const hasta = new Date(ahoraMs + BLOQUEO_MS).toISOString();
  const cambios = await acceso.actualizar("cerebro_sync", { id: clientId, bloqueado_hasta: fila.bloqueado_hasta ?? NULO }, { bloqueado_hasta: hasta });
  return cambios === 1 ? estadoDeFila({ ...fila, bloqueado_hasta: hasta }) : null;
}

/**
 * Suelta el permiso y escribe lo que cambió (`cambios`, con los nombres de las columnas: `archivos` y `fuera` pueden
 * ir como objetos). Nunca lanza: un estado que no se apunta no puede tumbar lo que ya se escribió en las notas.
 */
export async function soltarSync(acceso, clientId, cambios = {}) {
  const fila = { ...cambios, bloqueado_hasta: null, updated_at: ahora() };
  for (const k of ["archivos", "fuera"]) if (fila[k] && typeof fila[k] === "object") fila[k] = JSON.stringify(fila[k]);
  try {
    await acceso.actualizar("cerebro_sync", { id: clientId }, fila);
  } catch (e) {
    console.error("cerebro: no se pudo apuntar cómo va con GitHub", e);
  }
}

/** Marca (o quita) que la ficha técnica espera renovarse. Nunca lanza. */
export async function marcarFicha(acceso, clientId, pendiente, extra = {}) {
  try {
    await acceso.actualizar("cerebro_sync", { id: clientId }, { ficha_pendiente: pendiente ? 1 : 0, updated_at: ahora(), ...extra });
  } catch (e) {
    console.error("cerebro: no se pudo apuntar la ficha pendiente", e);
  }
}
