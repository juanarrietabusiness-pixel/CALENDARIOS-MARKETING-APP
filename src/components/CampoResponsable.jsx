import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";

/**
 * «Asignar a», con los nombres del equipo a un toque.
 *
 * No hay alta aparte: el servidor guarda el nombre la primera vez que
 * se asigna una tarea a alguien (ver `recordarResponsable` en
 * worker/rutas/datos.js), así que la lista se llena usándola. Aquí sólo
 * se escoge y, en «Editar lista», se quita un nombre mal escrito.
 */
export default function CampoResponsable({ value, onChange, style }) {
  const ids = useId();
  const [nombres, setNombres] = useState([]);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    let vivo = true;
    db.loadResponsables().then((r) => { if (vivo) setNombres(r); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const quitar = async (r) => {
    setNombres((prev) => prev.filter((x) => x.id !== r.id));
    try { await db.deleteResponsable(r.id); } catch { setNombres((prev) => [...prev, r]); }
  };

  const actual = (value || "").trim().toLowerCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", flex: 1, minWidth: 160, ...style }}>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Asignar a…"
        aria-label="Asignar a"
        list={`${ids}-lista`}
        autoComplete="off"
        style={{ fontSize: "var(--fs-3xs)" }}
      />
      <datalist id={`${ids}-lista`}>
        {nombres.map((r) => <option key={r.id} value={r.nombre} />)}
      </datalist>

      {nombres.length > 0 && (
        <div role="group" aria-label="Equipo guardado" style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap", alignItems: "center" }}>
          {nombres.map((r) => {
            const elegido = r.nombre.toLowerCase() === actual;
            return editando ? (
              <button
                key={r.id}
                type="button"
                className="filter-chip"
                onClick={() => quitar(r)}
                aria-label={`Quitar a ${r.nombre} de la lista`}
                style={{ minHeight: "var(--tap-sm)", color: "var(--danger)" }}
              >
                {r.nombre} <Icon name="close" size={12} />
              </button>
            ) : (
              <button
                key={r.id}
                type="button"
                className="filter-chip"
                aria-pressed={elegido}
                onClick={() => onChange(elegido ? "" : r.nombre)}
                style={{
                  minHeight: "var(--tap-sm)",
                  background: elegido ? "var(--accent-soft)" : undefined,
                  borderColor: elegido ? "var(--accent)" : undefined,
                  color: elegido ? "var(--accent)" : undefined,
                }}
              >
                {r.nombre}
              </button>
            );
          })}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setEditando((e) => !e)}
            aria-pressed={editando}
            style={{ fontSize: "var(--fs-3xs)" }}
          >
            {editando ? "Listo" : "Editar lista"}
          </button>
        </div>
      )}
    </div>
  );
}
