// ============================================================
// Recuperar una vuelta del asistente que se cortó (en diferido)
//
// Al bloquear el teléfono o dejar la pestaña atrás, la conexión del chat se
// corta pero el servidor sigue y guarda el final de la vuelta con su id
// (worker/rutas/chat.js, `rutaTurnoChat`). Aquí se pide cuando la pestaña
// vuelve a verse y el chat sigue donde iba, en vez de dar error.
// ============================================================

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
/** Hasta que la pestaña vuelva a verse (con el teléfono bloqueado no tiene sentido preguntar). */
const hastaQueSeVea = () => (typeof document === "undefined" || document.visibilityState !== "hidden"
  ? Promise.resolve()
  : new Promise((r) => {
    const alVer = () => { if (document.visibilityState !== "hidden") { document.removeEventListener("visibilitychange", alVer); r(); } };
    document.addEventListener("visibilitychange", alVer);
  }));

/**
 * El final de una vuelta que se cortó: se pregunta cuando la pestaña se ve, cada pocos segundos, mientras el servidor
 * sigue (con razonamiento y búsqueda web una vuelta puede tardar minutos). Devuelve el «fin» como si hubiera llegado
 * por el flujo, con `recuperado` y `guardadoPorServidor` (la respuesta final ya quedó en la conversación).
 */
export async function recuperarTurno(turnoId, { intentos = 60, cada = 4000, pedir = (u) => fetch(u, { credentials: "same-origin" }) } = {}) {
  for (let i = 0; i < intentos; i++) {
    await hastaQueSeVea();
    let r = null;
    try { r = await pedir(`/api/ia/chat/turno/${encodeURIComponent(turnoId)}`); } catch { r = null; }
    if (r?.ok) {
      const d = await r.json().catch(() => null);
      const ev = d?.evento;
      if (ev?.t === "error") throw new Error(ev.mensaje || "No se pudo generar la respuesta.");
      if (ev?.t === "fin") return { ...ev, recuperado: true, guardadoPorServidor: Boolean(d.guardado) };
    } else if (r && r.status !== 404) {
      if (r.status === 401) throw new Error("La sesión caducó. Vuelve a entrar.");
    }
    await pausa(cada);
  }
  throw new Error("La conexión se cortó y la respuesta no llegó. Pídemelo otra vez.");
}
