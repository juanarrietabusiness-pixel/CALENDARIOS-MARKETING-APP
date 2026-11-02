// ============================================================
// «Exportar ideas y descripciones» del calendario
//
// Va en su chunk: CalendarView es de la carga inicial y está en su tope. El diálogo lleva su propio estado (formatos y
// campos escogidos); al cerrarlo y volver a abrirlo arranca con los de siempre.
// ============================================================

import { useId, useState } from "react";
import { FORMATS, FORMAT_ICONS } from "../../constants";
import { construirExportacion, FORMATOS_EXPORTABLES_POR_DEFECTO, CAMPOS_EXPORTABLES } from "../../lib/exportarContenido";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import Icon from "../Icon";

const CAMPOS_LABELS = { idea: "Ideas", guion: "Guiones", descripcion: "Descripciones", hashtags: "Hashtags" };

export default function ExportarContenido({ cal, client, calName, onError, onClose }) {
  const ids = useId();
  const dialogRef = useDialogA11y(onClose);
  const [formatos, setFormatos] = useState(FORMATOS_EXPORTABLES_POR_DEFECTO);
  const [campos, setCampos] = useState(CAMPOS_EXPORTABLES);
  const [copiado, setCopiado] = useState(false);
  // La construcción del texto vive en `lib/exportarContenido.js`: es pura y allí se prueba sin montar nada.
  const { texto, completas, incompletas } = construirExportacion({
    days: cal.days || [], formatos, campos, cliente: client.name, calendario: calName,
  });
  const alternar = (set) => (clave) => set((prev) => (prev.includes(clave) ? prev.filter((x) => x !== clave) : [...prev, clave]));
  const onToggleFormato = alternar(setFormatos);
  const onToggleCampo = alternar(setCampos);

  const onCopiar = () => {
    navigator.clipboard.writeText(texto).then(
      () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); },
      () => onError("El navegador no dejó copiar al portapapeles."),
    );
  };

  const onDescargar = () => {
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contenido-${calName.replace(/\s+/g, "-")}-${client.name.replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-titulo`}
        style={{ maxWidth: 720, width: "100%" }}
      >
        <h3 id={`${ids}-titulo`} style={{ fontSize: "var(--fs-base)", fontWeight: 700, marginBottom: "var(--sp-1)" }}>
          <Icon name="copy" size={20} /> Exportar ideas y descripciones
        </h3>
        <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
          Cada publicación sale completa: formato, fecha y hora, idea, guion (reels, carruseles…), descripción y hashtags.
          Las que tengan algún campo sin escribir se quedan fuera.
        </p>

        <fieldset className="field" style={{ border: "none", padding: 0 }}>
          <legend className="label">Formatos que entran</legend>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            {Object.entries(FORMATS).map(([k, fmt]) => {
              const activo = formatos.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onToggleFormato(k)}
                  style={{
                    padding: "var(--sp-2) var(--sp-3)",
                    borderRadius: "var(--radius-sm)",
                    border: `1px solid ${activo ? fmt.color : "var(--border)"}`,
                    cursor: "pointer",
                    background: activo ? fmt.color + "33" : "var(--card-alt)",
                    color: activo ? fmt.color : "var(--text-muted)",
                    fontSize: "var(--fs-2xs)",
                    fontWeight: 600,
                    minHeight: "var(--tap-sm)",
                  }}
                >
                  <Icon name={FORMAT_ICONS[k]} size={16} /> {fmt.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: "none", padding: 0 }}>
          <legend className="label">Campos que entran</legend>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            {CAMPOS_EXPORTABLES.map((c) => {
              const activo = campos.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onToggleCampo(c)}
                  style={{
                    padding: "var(--sp-2) var(--sp-3)",
                    borderRadius: "var(--radius-sm)",
                    border: `1px solid ${activo ? "var(--accent)" : "var(--border)"}`,
                    cursor: "pointer",
                    background: activo ? "var(--accent-soft)" : "var(--card-alt)",
                    color: activo ? "var(--accent)" : "var(--text-muted)",
                    fontSize: "var(--fs-2xs)",
                    fontWeight: 600,
                    minHeight: "var(--tap-sm)",
                  }}
                >
                  {CAMPOS_LABELS[c] || c}
                </button>
              );
            })}
          </div>
        </fieldset>

        <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", marginBottom: "var(--sp-2)" }}>
          {completas} {completas === 1 ? "publicación completa" : "publicaciones completas"}
          {incompletas.length > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--accent-alt)" }}>
                {incompletas.length} fuera por faltarles algo
              </span>
            </>
          )}
        </p>

        {incompletas.length > 0 && (
          <details style={{ marginBottom: "var(--sp-3)" }}>
            <summary style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", cursor: "pointer", minHeight: "var(--tap-sm)" }}>
              Ver qué le falta a cada una
            </summary>
            <ul style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", margin: "var(--sp-2) 0 0", paddingLeft: "var(--sp-4)", maxHeight: 140, overflowY: "auto" }}>
              {incompletas.map(({ day, post, falta }) => (
                <li key={post.id} style={{ marginBottom: 2 }}>
                  {day.date} · {FORMATS[post.format]?.label || post.format} — falta {falta.join(", ")}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="field">
          <label className="label" htmlFor={`${ids}-texto`}>Texto que se exporta</label>
          <textarea
            id={`${ids}-texto`}
            className="textarea"
            readOnly
            value={texto || "No hay ninguna publicación completa con los formatos elegidos."}
            style={{ minHeight: 220, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "var(--fs-2xs)" }}
          />
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-secondary" onClick={onDescargar} disabled={!texto}>
            <Icon name="download" size={16} /> Descargar .txt
          </button>
          <button className="btn btn-primary" onClick={onCopiar} disabled={!texto}>
            <Icon name="copy" size={16} /> {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}
