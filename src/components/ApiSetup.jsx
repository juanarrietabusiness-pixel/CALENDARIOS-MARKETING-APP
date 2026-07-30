import { useState } from "react";
import { lsGet, lsSet } from "../utils";

export default function ApiSetup({ onDone, onClose }) {
  const [key, setKey] = useState(lsGet("ja-apikey") || "");
  const detected = key.startsWith("gsk_")
    ? "groq"
    : key.startsWith("sk-")
      ? "anthropic"
      : null;
  const provColor =
    detected === "groq" ? "#F55036" : detected === "anthropic" ? "#D97706" : "#64B5F6";
  const provLabel = detected === "groq" ? "Groq" : detected === "anthropic" ? "Anthropic" : "";

  return (
    <div className="overlay">
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: 28,
          width: "100%",
          maxWidth: 440,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div
            style={{
              background: "linear-gradient(135deg,#1B3A6B,var(--accent))",
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: 10,
              fontWeight: 900,
              fontSize: 18,
              marginBottom: 12,
            }}
          >
            JA
          </div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Configurar IA</h2>
          <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Ingresa tu API key de <strong>Groq</strong> o <strong>Anthropic</strong>.
            Se detecta automáticamente según el prefijo.
          </p>
        </div>
        <label className="label">API Key</label>
        <input
          className="input"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="gsk_... o sk-ant-..."
          style={{ marginBottom: 8 }}
        />
        {detected && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: provColor,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: provColor, fontWeight: 600 }}>
              {provLabel} detectado
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 10, color: "var(--text-muted)", flex: 1 }}>
            Groq: console.groq.com/keys
          </p>
          <p style={{ fontSize: 10, color: "var(--text-muted)", flex: 1 }}>
            Anthropic: console.anthropic.com
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{
            width: "100%",
            background: detected ? provColor : undefined,
          }}
          onClick={() => {
            if (!detected) {
              alert("La key debe empezar con gsk_ (Groq) o sk- (Anthropic)");
              return;
            }
            lsSet("ja-apikey", key);
            onDone(key);
          }}
        >
          Guardar API Key
        </button>
        {key && (
          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: 8 }}
            onClick={() => onDone(key)}
          >
            Continuar sin cambiar
          </button>
        )}
        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: 4, color: "var(--text-dim)" }}
          onClick={onClose}
        >
          Usar sin IA
        </button>
      </div>
    </div>
  );
}
