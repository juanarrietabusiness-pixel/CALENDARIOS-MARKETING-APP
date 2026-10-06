import { useState, useEffect, useCallback, useMemo } from "react";
import * as db from "../lib/db";
import { fechaEnZona, partirNotas, EVENTO_CAMBIO } from "../lib/agenda";

// ============================================================
// Todas las tareas del espacio y lo que se hace con ellas
//
// Lo comparten «Mi día» (/tareas) y el panel lateral: dos copias de
// «marcar hecha» o de «pasar a hoy» acabarían haciendo cosas distintas.
// Las tareas rápidas (sin empresa) llegan con `client_id` vacío y
// `_rapida`, que dice a qué ruta va cada cambio.
//
// Se relee con cada `pulso`: cuando alguien del equipo toca una tarea,
// el evento sube el pulso y aquí se vuelve a leer.
// ============================================================

export const hecha = (t) => t?.status === "completed" || t?.status === "done";
export const claveTarea = (t) => `${t._rapida ? "r" : "c"}:${t.id}`;

/**
 * ¿La lleva esta persona? Por `asignado_id`; las de antes sin persona, por
 * nombre. Con `sinAsignar`, lo que no lleva nadie también cuenta.
 */
export function esDe(t, persona, { sinAsignar = false } = {}) {
  if (!persona) return true;
  if (sinAsignar && !t.asignado_id && !(t.assigned_to ?? "").trim()) return true;
  if (t.asignado_id) return t.asignado_id === persona.id;
  const nombre = (persona.nombre ?? "").trim().toLowerCase();
  return Boolean(nombre) && (t.assigned_to ?? "").trim().toLowerCase() === nombre;
}

export function useTareas(pulso = 0) {
  const [clientTasks, setClientTasks] = useState([]);
  const [quickTasks, setQuickTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      const { clientTasks: ct, quickTasks: qt } = await db.loadAllTasks();
      setClientTasks(ct || []);
      setQuickTasks(qt || []);
      setError("");
    } catch {
      setError("No se pudieron cargar las tareas.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const todas = useMemo(() => [
    ...clientTasks.map((t) => ({ ...t, _rapida: false })),
    ...quickTasks.map((t) => ({ ...t, client_id: "", _rapida: true })),
  ], [clientTasks, quickTasks]);

  // Aplica la fila que devuelve el servidor en su lista.
  const reemplazar = (t, fila) => {
    if (!fila) return;
    const set = t._rapida ? setQuickTasks : setClientTasks;
    set((prev) => prev.map((x) => (x.id === fila.id ? fila : x)));
  };

  // Tras cada cambio propio se avisa a la página (el contador de atrasadas
  // de la cabecera relee): el eco de la propia pestaña se descarta, así que
  // el `pulso` no subiría.
  const accion = (fn) => async (...args) => {
    try {
      const r = await fn(...args);
      window.dispatchEvent(new Event(EVENTO_CAMBIO));
      return r;
    } catch (e) {
      setError(e?.message || "No se pudo guardar el cambio.");
      return null;
    }
  };

  const alternarHecha = accion(async (t) => {
    const fila = hecha(t)
      ? await (t._rapida ? db.reopenQuickTask(t.id) : db.reopenClientTask(t.id))
      : await (t._rapida ? db.completeQuickTask(t.id) : db.completeClientTask(t.id));
    reemplazar(t, fila);
  });

  const actualizar = accion(async (t, datos) => {
    const fila = t._rapida ? await db.updateQuickTask(t.id, datos) : await db.updateClientTask(t.id, datos);
    reemplazar(t, fila);
    return fila;
  });

  /** «Hoy»: la planea para hoy, o se lo quita si ya lo estaba. */
  const alternarHoy = (t) => {
    const hoy = fechaEnZona();
    return actualizar(t, { today_date: t.today_date === hoy ? null : hoy });
  };

  /** «Mover a…»: el día en que se piensa hacer. La fecha límite no se toca. */
  const moverA = (t, fecha) => actualizar(t, { today_date: fecha || null });

  /** Una tarea nueva: con empresa es de esa empresa; sin ella, una rápida. */
  const crear = accion(async ({ titulo, empresa = "", notas = "", today_date = null, due_date = null, assigned_to = "" }) => {
    const base = { title: titulo, description: notas, today_date, due_date, assigned_to };
    if (empresa) {
      const fila = await db.saveClientTask({ ...base, client_id: empresa, recurrence: "none" });
      setClientTasks((prev) => [...prev, fila]);
      return fila;
    }
    const fila = await db.saveQuickTask(base);
    setQuickTasks((prev) => [...prev, fila]);
    return fila;
  });

  const borrar = accion(async (t) => {
    await (t._rapida ? db.deleteQuickTask(t.id) : db.deleteClientTask(t.id));
    const set = t._rapida ? setQuickTasks : setClientTasks;
    set((prev) => prev.filter((x) => x.id !== t.id));
  });

  /**
   * «Convertir en tareas»: cada viñeta de las notas pasa a ser su propia
   * tarea, con la misma empresa, la misma persona y las mismas fechas, y
   * sale de las notas. La tarea de origen se queda (la persona decide si
   * la borra). Devuelve cuántas se crearon.
   */
  const convertir = accion(async (t) => {
    const { tareas, resto } = partirNotas(t.description);
    if (!tareas.length) return 0;
    for (const titulo of tareas) {
      await crear({
        titulo, empresa: t._rapida ? "" : t.client_id, assigned_to: t.assigned_to ?? "",
        today_date: t.today_date ?? null, due_date: t.due_date ?? null,
      });
    }
    await actualizar(t, { description: resto });
    return tareas.length;
  });

  return { todas, loading, error, setError, alternarHecha, actualizar, alternarHoy, moverA, crear, borrar, convertir };
}
