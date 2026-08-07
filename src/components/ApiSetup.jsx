import { useId, useState } from "react";
import { lsGet, lsSet } from "../utils";
import { useDialogA11y } from "../hooks/useDialogA11y";

export default function ApiSetup({ onDone, onClose }) {
  const [key, setKey] = useState(lsGet("ja-apikey") || "");
  const [error, setError] = useState("");
  const dialogRef = useDialogA11y(onClose);
  const inputId = useId();
  const errorId = useId();

  const detected = key.startsWith("gsk_")
    ? "groq"
    : key.startsWith("sk-")
      ? "anthropic"
      : null;
  const provColor =
    detected === "groq" ? "#FF8A6A" : detected === "anthropic" ? "#F0A93B" : "var(--text-muted)";
  const provLabel = detected === "groq" ? "Groq" : detected === "anthropic" ? "Anthropic" : "";

  const save = () => {
    if (!detected) {
      setError("La clave debe empezar por gsk_ (Groq) o sk- (Anthropic).");
      return;
    }
    setError("");
    lsSet("ja-apikey", key);
    onDone(key);
  };

  return (
    <div className="overlay">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`} className="dialog">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar configuración de IA">✕</button>
        </div>

        <div style={{ textAlign: "center", marginBottom: "var(--sp-5)" }}>
          <span
            aria-hidden="true"
            style={{
              background: "linear-gradient(135deg,#1B3A6B,var(--accent))",
              display: "inline-block",
              padding: "var(--sp-2) var(--sp-3)",
              borderRadius: 10,
              fontWeight: 900,
              fontSize: "var(--fs-lg)",
              marginBottom: "var(--sp-3)",
            }}
          >
            JA
          </span>
          <h2 id={`${inputId}-title`} style={{ fontSize: "var(--fs-lg)", marginBottom: "var(--sp-2)" }}>Configurar IA</h2>
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>
            Introduce tu clave de <strong>Groq</strong> o <strong>Anthropic</strong>. Se detecta
            automáticamente por el prefijo.
          </p>
        </div>

        <div className="field">
          <label className="label" htmlFor={inputId}>API Key</label>
          <input
            id={inputId}
            className="input"
            type="password"
            autoComplete="off"
            spellCheck="false"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="gsk_… o sk-ant-…"
            aria-describedby={error ? errorId : `${inputId}-help`}
            aria-invalid={error ? "true" : undefined}
          />

          {detected && (
            <p style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: provColor, flexShrink: 0 }} />
              <span style={{ fontSize: "var(--fs-2xs)", color: provColor, fontWeight: 600 }}>
                Proveedor detectado: {provLabel}
              </span>
            </p>
          )}

          {error && (
            <p id={errorId} role="alert" className="notice notice-error" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>
              {error}
            </p>
          )}

          <p id={`${inputId}-help`} className="hint">
            Consigue una clave en console.groq.com/keys (Groq) o console.anthropic.com (Anthropic).
          </p>
        </div>

        <p className="notice notice-warn" style={{ display: "block" }}>
          <strong>Aviso:</strong> la clave se guarda en este navegador y las llamadas salen
          directamente desde él, así que queda visible para cualquiera con acceso al
          dispositivo. Usa una clave con límite de gasto y revócala si compartes el equipo.
        </p>

        <button className="btn btn-primary" style={{ width: "100%" }} onClick={save}>
          Guardar API Key
        </button>

        {key && (
          <button className="btn btn-ghost" style={{ width: "100%", marginTop: "var(--sp-2)" }} onClick={() => onDone(key)}>
            Continuar sin cambiar
          </button>
        )}

        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: "var(--sp-1)", color: "var(--text-dim)" }}
          onClick={onClose}
        >
          Usar sin IA
        </button>
      </div>
    </div>
  );
}
