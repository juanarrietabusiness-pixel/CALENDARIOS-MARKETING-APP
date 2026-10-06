import { useState, useEffect } from "react";
import { loadAllTasks } from "../lib/db";
import { contarAtrasadas, fechaEnZona, EVENTO_CAMBIO } from "../lib/agenda";

// ============================================================
// El número rojo sobre el botón de «Mi día»
//
// Cuántas tareas se pasaron de su fecha, en todo el espacio. Está en la
// cabecera y no sólo dentro de la página porque lo atrasado es justo lo
// que nadie va a ir a buscar: tiene que verse desde cualquier pantalla.
// Relee con cada `pulso`, que sube cuando alguien del equipo toca una
// tarea.
// ============================================================

export default function ContadorAtrasadas({ pulso = 0 }) {
  const [n, setN] = useState(0);
  // Los cambios de esta misma pestaña no suben el pulso (su eco se descarta).
  const [propio, setPropio] = useState(0);
  useEffect(() => {
    const alCambiar = () => setPropio((v) => v + 1);
    window.addEventListener(EVENTO_CAMBIO, alCambiar);
    return () => window.removeEventListener(EVENTO_CAMBIO, alCambiar);
  }, []);

  useEffect(() => {
    let vivo = true;
    loadAllTasks()
      .then(({ clientTasks = [], quickTasks = [] }) => {
        if (vivo) setN(contarAtrasadas([...clientTasks, ...quickTasks], fechaEnZona()));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pulso, propio]);

  if (!n) return null;
  return (
    <>
      <span className="contador-atrasadas" aria-hidden="true">{n > 99 ? "99+" : n}</span>
      <span className="sr-only">, {n} atrasada{n === 1 ? "" : "s"}</span>
    </>
  );
}
