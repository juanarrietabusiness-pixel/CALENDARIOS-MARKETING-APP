import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { useEquipo } from "../hooks/useEquipo";

/**
 * «Asignar a»: primero las PERSONAS del equipo (con su color), que es lo
 * que el servidor casa con su cuenta (`asignado_id`) para «Mías» y para
 * avisarle. Debajo, los nombres sueltos de gente sin cuenta —un
 * freelance, el cliente— que se guardan la primera vez que se usan (ver
 * `recordarResponsable` en worker/rutas/datos.js).
 */
export default function CampoResponsable({ value, onChange, style }) {
  const ids = useId();
  const [nombres, setNombres] = useState([]);
  const [editando, setEditando] = useState(false);
  const miembros = useEquipo();

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
  const deEquipo = new Set(miembros.map((m) => m.nombre.trim().toLowerCase()));
  const sueltos = nombres.filter((r) => !deEquipo.has(r.nombre.trim().toLowerCase()));

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
        {[...miembros.map((m) => m.nombre), ...sueltos.map((r) => r.nombre)].map((n) => <option key={n} value={n} />)}
      </datalist>

      {miembros.length > 0 && (
        <div role="group" aria-label="Personas del equipo" style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap" }}>
          {miembros.map((m) => {
            const elegido = m.nombre.trim().toLowerCase() === actual;
            return (
              <button
                key={m.userId}
                type="button"
                className="filter-chip"
                aria-pressed={elegido}
                onClick={() => onChange(elegido ? "" : m.nombre)}
                style={{ minHeight: "var(--tap-sm)", borderColor: elegido ? m.color : undefined, color: elegido ? m.color : undefined }}
              >
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, display: "inline-block" }} /> {m.nombre}
              </button>
            );
          })}
        </div>
      )}

      {sueltos.length > 0 && (
        <div role="group" aria-label="Otros nombres guardados" style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap", alignItems: "center" }}>
          {sueltos.map((r) => {
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
