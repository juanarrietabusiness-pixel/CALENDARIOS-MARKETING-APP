import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";

const MODOS = [
  ["nunca", "Nunca"],
  ["semanal", "Cada semana (terminadas hace más de 7 días)"],
  ["mensual", "Cada mes (terminadas hace más de 30 días)"],
];

/**
 * Vaciar las tareas terminadas y decidir si se borran solas.
 *
 * El ajuste es del ESPACIO, no de este panel: cambiarlo aquí lo cambia
 * para todas las tareas de la agencia. Las recurrentes nunca se borran
 * —son la definición de algo que vuelve—, así que `cantidad` sólo
 * cuenta las demás.
 */
export default function LimpiezaTerminadas({ cantidad, onVaciar, pulso = 0 }) {
  const ids = useId();
  const [modo, setModo] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let vivo = true;
    db.loadAjustes().then((a) => { if (vivo) setModo(a?.purga_tareas ?? "nunca"); }).catch(() => {});
    return () => { vivo = false; };
  }, [pulso]);

  const cambiarModo = async (nuevo) => {
    const antes = modo;
    setModo(nuevo);
    setAviso("");
    try {
      await db.saveAjustes({ purga_tareas: nuevo });
      setAviso(nuevo === "nunca" ? "Las terminadas ya no se borran solas." : "Guardado para todo el equipo.");
    } catch (e) {
      setModo(antes);
      setAviso(e.message || "No se pudo guardar el ajuste.");
    }
  };

  const vaciar = async () => {
    setTrabajando(true);
    try {
      await onVaciar();
      setAviso("");
    } catch (e) {
      setAviso(e.message || "No se pudieron borrar.");
    }
    setTrabajando(false);
    setConfirmando(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", padding: "var(--sp-2) 0" }}>
      {cantidad > 0 && (
        confirmando ? (
          <div role="group" aria-label="Confirmar borrado" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap", fontSize: "var(--fs-3xs)" }}>
            <span style={{ flex: 1, minWidth: 140 }}>¿Borrar {cantidad} tarea{cantidad === 1 ? "" : "s"} terminada{cantidad === 1 ? "" : "s"}? No se puede deshacer.</span>
            <button type="button" className="btn btn-danger btn-sm" onClick={vaciar} disabled={trabajando}>
              {trabajando ? "Borrando…" : "Sí, borrar"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmando(false)} disabled={trabajando}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmando(true)} style={{ alignSelf: "flex-start", color: "var(--danger)" }}>
            <Icon name="trash" size={14} /> Borrar terminadas ({cantidad})
          </button>
        )
      )}

      {modo !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          <label htmlFor={`${ids}-modo`} style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>
            Borrar terminadas automáticamente:
          </label>
          <select
            id={`${ids}-modo`}
            className="input"
            value={modo}
            onChange={(e) => cambiarModo(e.target.value)}
            style={{ flex: 1, minWidth: 180, minHeight: "var(--tap-sm)", fontSize: "var(--fs-3xs)" }}
          >
            {MODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}
      <p role="status" style={{ margin: 0, fontSize: "var(--fs-3xs)", color: "var(--text-dim)", minHeight: aviso ? undefined : 0 }}>{aviso}</p>
    </div>
  );
}
