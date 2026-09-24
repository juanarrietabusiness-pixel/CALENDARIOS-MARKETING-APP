// ============================================================
// Qué tareas terminadas se borran solas
//
// Pura, para poder probarla sin D1. Dos reglas que no son obvias:
//
//   · Una tarea RECURRENTE no se borra nunca, esté como esté: es la
//     definición de algo que vuelve cada semana o cada mes, y borrarla
//     sería perderla para siempre por haberla cumplido una vez.
//   · Se cuenta desde que se TERMINÓ, no desde que se creó: una tarea
//     de hace tres meses que se cerró ayer tiene que seguir visible.
// ============================================================

export const MODOS_PURGA = Object.freeze({ nunca: 0, semanal: 7, mensual: 30 });

const DIA_MS = 86_400_000;

/** Las terminadas que ya pasaron su plazo. `ahora` se inyecta para los tests. */
export function tareasParaPurgar(tareas, modo, ahora = Date.now()) {
  const dias = MODOS_PURGA[modo];
  if (!dias) return [];
  const limite = ahora - dias * DIA_MS;
  return (tareas ?? []).filter((t) => {
    if (t?.status !== "completed" || !t.completed_at) return false;
    if (t.recurrence && t.recurrence !== "none") return false;
    const cuando = Date.parse(t.completed_at);
    return Number.isFinite(cuando) && cuando < limite;
  });
}

/** Las terminadas que se pueden vaciar a mano: todas menos las recurrentes. */
export function terminadasBorrables(tareas) {
  return (tareas ?? []).filter((t) => t?.status === "completed" && (!t.recurrence || t.recurrence === "none"));
}
