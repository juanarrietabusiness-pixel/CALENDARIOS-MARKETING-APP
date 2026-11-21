import { useState } from "react";
import "./IdentidadVideo.css";
import { aplicarPropuestaEdicion, descartarPropuestaEdicion } from "../lib/edicionApi";

// ============================================================
// Las PROPUESTAS de lo que aprende el editor de video grabado (Fase 5): las enseña Ajustes → Editor de video (las
// GENERALES, para el manual) y Marca → Kit y voz → Estilos de edición (las DE LA MARCA, para su estilo). Cada una con el
// texto EXACTO que cambia y las palabras de la persona que la respaldan. Nada se aplica sin que alguien pulse «Aceptar».
// ============================================================

const cuando = (iso) => (iso ? new Date(iso).toLocaleDateString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short" }) : "");

/** Lo que haría, en una frase con el texto exacto. */
function queHace(p) {
  if (p.operacion === "anadir") return <>Añadir: <q>{p.texto}</q></>;
  if (p.operacion === "cambiar") return <>Cambiar <q>{p.antes}</q> por <q>{p.texto}</q></>;
  return <>Quitar: <q>{p.antes}</q></>;
}

export default function PropuestasEdicion({ titulo, propuestas = [], puede = true, sinPermiso = "", onCambio }) {
  const [ocupada, setOcupada] = useState(null);
  const [aviso, setAviso] = useState(null);
  if (!propuestas.length) return null;

  const decidir = async (p, aceptar) => {
    setOcupada(p.id); setAviso(null);
    try {
      const r = await (aceptar ? aplicarPropuestaEdicion(p.id) : descartarPropuestaEdicion(p.id));
      setAviso({ ok: true, texto: aceptar ? (r.version ? `Aplicada: el manual pasa a la versión ${r.version}.` : `Aplicada al estilo «${r.estilo}».`) : "Rechazada: no se volverá a proponer." });
      await onCambio?.();
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setOcupada(null);
  };

  return (
    <div className="identidad-grupo" role="group" aria-label={titulo}>
      <p className="label" style={{ margin: 0 }}>{titulo} ({propuestas.length})</p>
      <ul className="identidad-lista">
        {propuestas.map((p) => (
          <li key={p.id} style={{ borderTop: "1px solid var(--border-light)", paddingTop: "var(--sp-2)", display: "grid", gap: "var(--sp-1)" }}>
            <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}><strong>{p.nombreParte}</strong>: {queHace(p)}</p>
            <p className="hint" style={{ margin: 0 }}>
              Porque dijo: <q>{p.cita}</q>{p.de?.cliente ? ` · en la edición de ${p.de.cliente}` : ""}{p.de?.cuando ? ` (${cuando(p.de.cuando)})` : ""}
            </p>
            {puede ? (
              <div className="action-row" style={{ margin: 0 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(ocupada)} onClick={() => decidir(p, true)} aria-label={`Aceptar: ${p.nombreParte}`}>
                  {ocupada === p.id ? "…" : "Aceptar"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupada)} onClick={() => decidir(p, false)} aria-label={`Rechazar: ${p.nombreParte}`}>Rechazar</button>
              </div>
            ) : <p className="hint" style={{ margin: 0 }}>{sinPermiso}</p>}
          </li>
        ))}
      </ul>
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "notice notice-error"} style={{ margin: 0 }}>{aviso.texto}</p>}</div>
    </div>
  );
}
