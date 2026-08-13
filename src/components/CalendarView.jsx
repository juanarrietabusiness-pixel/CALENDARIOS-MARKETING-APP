import { useEffect, useId, useState, useRef } from "react";
import { FORMATS, FORMAT_ICONS, STATUSES, MONTHS, DAYS } from "../constants";
import { uid, fmtDate, compressImage, parseVideoURL } from "../utils";
import { callAI, fetchGitHubADN, parseAIResponse, buildScriptPrompt, generateSinglePost, generateFieldForPost } from "../api";
import { buildExportHTML } from "../export";
import { shareCalendar, setShareEnabled, fetchApprovals, subscribeApprovals } from "../lib/db";
import { useDialogA11y } from "../hooks/useDialogA11y";
import Icon from "./Icon";


function stripMarkdown(text) {
  if (!text) return "";
  return text.replace(/\*\*\*(.*?)\*\*\*/g, "$1").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/__(.*?)__/g, "$1").replace(/_(.*?)_/g, "$1");
}

function CopyButton({ text, label, describes }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className={`btn-copy${copied ? " is-copied" : ""}`}
      aria-label={copied ? "Copiado al portapapeles" : `Copiar ${describes || "texto"}`}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(stripMarkdown(text)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copiado" : label || "Copiar"}
    </button>
  );
}

const fieldHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--sp-2)",
  marginBottom: "var(--sp-1)",
};
const fieldLabelStyle = {
  fontSize: "var(--fs-3xs)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};
const fieldBodyStyle = {
  fontSize: "var(--fs-xs)",
  color: "var(--text-dim)",
  borderRadius: "var(--radius-xs)",
  padding: "var(--sp-2)",
  lineHeight: "var(--lh-relaxed)",
  whiteSpace: "pre-wrap",
};

function TimePicker({ value, onChange, id }) {
  const [open, setOpen] = useState(false);
  const parts = (value || "").split(":");
  const hour = parts[0] || "";
  const minute = parts[1] || "";
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const setTime = (h, m) => {
    onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        id={id}
        className="input time-picker-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", cursor: "pointer", minWidth: 120 }}
      >
        <Icon name="clock" size={16} />
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {value || "--:--"}
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Seleccionar hora"
          className="time-picker-drop"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", justifyContent: "center", marginBottom: "var(--sp-3)" }}>
            <div className="time-picker-col">
              <button type="button" className="time-picker-arrow" aria-label="Hora anterior" onClick={() => setTime((+hour + 23) % 24, +minute || 0)}>
                <Icon name="chevronUp" size={18} />
              </button>
              <span className="time-picker-digit">{hour ? hour.padStart(2, "0") : "--"}</span>
              <button type="button" className="time-picker-arrow" aria-label="Hora siguiente" onClick={() => setTime((+hour + 1) % 24, +minute || 0)}>
                <Icon name="chevronDown" size={18} />
              </button>
            </div>
            <span className="time-picker-sep">:</span>
            <div className="time-picker-col">
              <button type="button" className="time-picker-arrow" aria-label="Minuto anterior" onClick={() => setTime(+hour || 0, (+minute + 55) % 60)}>
                <Icon name="chevronUp" size={18} />
              </button>
              <span className="time-picker-digit">{minute ? minute.padStart(2, "0") : "--"}</span>
              <button type="button" className="time-picker-arrow" aria-label="Minuto siguiente" onClick={() => setTime(+hour || 0, (+minute + 5) % 60)}>
                <Icon name="chevronDown" size={18} />
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: "var(--sp-2)" }}>
            {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((h) => (
              <button
                key={h}
                type="button"
                className={`time-picker-preset${+hour === h ? " active" : ""}`}
                onClick={() => { setTime(h, +minute || 0); }}
              >
                {String(h).padStart(2, "0")}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setOpen(false)}>
              Listo
            </button>
            {value && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => { onChange(""); setOpen(false); }}>
                Quitar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContentDisplay({ post }) {
  const f = post.format;
  if (f === "post") {
    const text = post.descripcion || post.script || "";
    if (!text) return null;
    return (
      <div style={{ marginTop: "var(--sp-2)" }}>
        <div style={fieldHeaderStyle}>
          <span style={{ ...fieldLabelStyle, color: "var(--text-muted)" }}>Descripción</span>
          <CopyButton text={text} describes="la descripción" />
        </div>
        <p style={{ ...fieldBodyStyle, background: "var(--card-alt)" }}>
          {text.slice(0, 220)}{text.length > 220 ? "…" : ""}
        </p>
      </div>
    );
  }

  const guion = post.guion || "";
  const descripcion = post.descripcion || post.script || "";

  return (
    <div style={{ marginTop: "var(--sp-2)" }}>
      {guion && (
        <div style={{ marginBottom: "var(--sp-2)" }}>
          <div style={fieldHeaderStyle}>
            <span style={{ ...fieldLabelStyle, color: "#FF7BA8" }}>Guion</span>
            <CopyButton text={guion} describes="el guion" />
          </div>
          <p style={{ ...fieldBodyStyle, background: "#1a0a2a" }}>
            {guion.slice(0, 180)}{guion.length > 180 ? "…" : ""}
          </p>
        </div>
      )}
      {descripcion && (
        <div style={{ marginBottom: "var(--sp-2)" }}>
          <div style={fieldHeaderStyle}>
            <span style={{ ...fieldLabelStyle, color: "var(--accent)" }}>Descripción</span>
            <CopyButton text={descripcion} describes="la descripción" />
          </div>
          <p style={{ ...fieldBodyStyle, background: "var(--card-alt)" }}>
            {descripcion.slice(0, 160)}{descripcion.length > 160 ? "…" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function PostSidePanel({ post, day, onUpdate, onClose, onDelete, onMoveDate, onSendToBank, client, cal }) {
  const [form, setForm] = useState({ ...post });
  const [fieldLoading, setFieldLoading] = useState({});
  const [fieldError, setFieldError] = useState("");
  const [moveDateOpen, setMoveDateOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const imgRef = useRef();
  const ids = useId();
  const panelRef = useDialogA11y(onClose);
  const sf = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const f = FORMATS[form.format] || FORMATS.post;
  const isPost = form.format === "post";

  const save = () => onUpdate(day.date, form);

  const generateField = async (field) => {
    setFieldError("");
    setFieldLoading((p) => ({ ...p, [field]: true }));
    try {
      const result = await generateFieldForPost(client, form, day, cal, field);
      sf(field, result);
    } catch (e) {
      setFieldError(`No se pudo generar «${field}»: ${e.message}`);
    }
    setFieldLoading((p) => ({ ...p, [field]: false }));
  };

  const AiButton = ({ field, label }) => (
    <button
      type="button"
      className="btn-ai"
      onClick={() => generateField(field)}
      disabled={fieldLoading[field]}
      aria-label={`Generar ${label} con IA`}
    >
      {fieldLoading[field] ? "Generando…" : <><Icon name="sparkles" size={14} /> IA</>}
    </button>
  );

  return (
    <div
      ref={panelRef}
      className="panel-right"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${ids}-title`}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", padding: "var(--sp-4)", paddingTop: "calc(var(--sp-4) + var(--safe-top))", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", minWidth: 0 }}>
          <Icon name={FORMAT_ICONS[form.format] || "formatPost"} size={20} style={{ color: f.color }} />
          <div style={{ minWidth: 0 }}>
            <h2 id={`${ids}-title`} style={{ fontSize: "var(--fs-sm)", fontWeight: 700 }}>
              {f.label} — {day.dayName} {(day.date || "").split("-")[2]}
            </h2>
            <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>{day.date}</p>
          </div>
        </div>
        <button className="btn-icon" onClick={() => { save(); onClose(); }} aria-label="Guardar y cerrar"><Icon name="close" /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--sp-4)" }}>
        {fieldError && (
          <p role="alert" className="notice notice-error">{fieldError}</p>
        )}

        <fieldset className="field" style={{ border: "none" }}>
          <legend className="label">Formato</legend>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            {Object.entries(FORMATS).map(([k, fmt]) => (
              <button
                key={k}
                type="button"
                aria-pressed={form.format === k}
                onClick={() => sf("format", k)}
                style={{
                  padding: "var(--sp-2) var(--sp-3)",
                  borderRadius: "var(--radius-xs)",
                  border: `1px solid ${form.format === k ? fmt.color : "var(--border)"}`,
                  cursor: "pointer",
                  background: form.format === k ? fmt.color + "33" : "var(--card-alt)",
                  color: form.format === k ? fmt.color : "var(--text-muted)",
                  fontSize: "var(--fs-2xs)",
                  fontWeight: 600,
                  minHeight: "var(--tap-sm)",
                }}
              >
                <Icon name={FORMAT_ICONS[k]} size={16} /> {fmt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: "none" }}>
          <legend className="label">Estado</legend>
          <div className="status-bar">
            {Object.entries(STATUSES).map(([k, st]) => (
              <button
                key={k}
                type="button"
                className="status-btn"
                aria-pressed={form.status === k}
                onClick={() => sf("status", k)}
                style={{
                  background: form.status === k ? st.bg : "var(--bg)",
                  color: st.text,
                  borderColor: form.status === k ? st.border : "var(--border)",
                  fontWeight: form.status === k ? 700 : 500,
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label className="label" htmlFor={`${ids}-time`}>Hora de publicación</label>
          <TimePicker id={`${ids}-time`} value={form.publishTime || ""} onChange={(v) => sf("publishTime", v)} />
        </div>

        <div className="field">
          <label className="label" htmlFor={`${ids}-cat`}>Categoría</label>
          <input id={`${ids}-cat`} className="input" value={form.category || ""} onChange={(e) => sf("category", e.target.value)} placeholder="Ej: Producto estrella" />
        </div>

        <div className="field">
          <div style={fieldHeaderStyle}>
            <label className="label" style={{ margin: 0 }} htmlFor={`${ids}-idea`}>Idea</label>
            <AiButton field="idea" label="la idea" />
          </div>
          <textarea id={`${ids}-idea`} className="textarea" value={form.idea || ""} onChange={(e) => sf("idea", e.target.value)} placeholder="Idea del contenido…" />
        </div>

        {!isPost && (
          <div className="field">
            <div style={fieldHeaderStyle}>
              <label className="label" style={{ margin: 0, color: "#FF7BA8" }} htmlFor={`${ids}-guion`}>Guion</label>
              <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                <CopyButton text={form.guion} describes="el guion" />
                <AiButton field="guion" label="el guion" />
              </div>
            </div>
            <textarea
              id={`${ids}-guion`}
              className="textarea"
              style={{ minHeight: 120, borderColor: "rgba(233,30,99,.35)" }}
              value={form.guion || ""}
              onChange={(e) => sf("guion", e.target.value)}
              placeholder="Guion del contenido (escenas, puntos clave…)"
            />
          </div>
        )}

        <div className="field">
          <div style={fieldHeaderStyle}>
            <label className="label" style={{ margin: 0 }} htmlFor={`${ids}-desc`}>Descripción</label>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <CopyButton text={form.descripcion || form.script} describes="la descripción" />
              <AiButton field="descripcion" label="la descripción" />
            </div>
          </div>
          <textarea
            id={`${ids}-desc`}
            className="textarea"
            style={{ minHeight: isPost ? 140 : 100 }}
            value={form.descripcion || form.script || ""}
            onChange={(e) => sf("descripcion", e.target.value)}
            placeholder="Caption / descripción del contenido…"
          />
        </div>

        <div className="field">
          <span className="label" id={`${ids}-img-label`}>Imagen</span>
          <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
            {form.image && <img src={form.image} alt="Vista previa de la imagen de la publicación" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />}
            <input
              ref={imgRef}
              id={`${ids}-img`}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-labelledby={`${ids}-img-label`}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  sf("image", await compressImage(file, 400));
                } catch (err) {
                  setFieldError(err.message);
                }
              }}
            />
            <button className="btn btn-secondary btn-sm" onClick={() => imgRef.current?.click()}>
              {form.image ? "Cambiar imagen" : "Subir imagen"}
            </button>
            {form.image && (
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => sf("image", null)}>
                Quitar
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor={`${ids}-ref`}>Enlace de referencia</label>
          <input id={`${ids}-ref`} className="input" type="url" value={form.referenceLink || ""} onChange={(e) => sf("referenceLink", e.target.value)} placeholder="https://…" />
          {form.referenceLink && (() => {
            const v = parseVideoURL(form.referenceLink);
            if (v?.type === "youtube") {
              return <img src={v.thumbnail} alt="Miniatura del vídeo de referencia" style={{ width: "100%", maxWidth: 260, borderRadius: "var(--radius-sm)", marginTop: "var(--sp-2)" }} />;
            }
            return null;
          })()}
        </div>

        <div className="field">
          <label className="label" htmlFor={`${ids}-comment`}>Comentario interno</label>
          <textarea id={`${ids}-comment`} className="textarea" value={form.comment || ""} onChange={(e) => sf("comment", e.target.value)} placeholder="Notas internas…" style={{ minHeight: 72 }} />
        </div>
      </div>

      <div style={{ padding: "var(--sp-3) var(--sp-4)", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
        {moveDateOpen && (
          <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label className="label" htmlFor={`${ids}-move-date`}>Mover a fecha</label>
              <input id={`${ids}-move-date`} className="input" type="date" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" disabled={!moveTarget || moveTarget === day.date} onClick={() => { save(); onMoveDate?.(post.id, day.date, moveTarget); onClose(); }}>
              Mover
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setMoveDateOpen(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <button
            className="btn btn-danger"
            aria-label="Eliminar publicación"
            onClick={() => { if (onDelete) onDelete(day.date, post.id); onClose(); }}
          >
            <Icon name="trash" size={18} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            aria-label="Cambiar fecha de publicación"
            onClick={() => setMoveDateOpen((o) => !o)}
          >
            <Icon name="calendar" size={16} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            aria-label="Enviar al banco de ideas"
            onClick={() => { save(); onSendToBank?.(form, day.date); onClose(); }}
          >
            <Icon name="bulb" size={16} />
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { save(); onClose(); }}>
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function AddPostInline({ onAdd, onCancel }) {
  const [format, setFormat] = useState("post");
  const [idea, setIdea] = useState("");
  const ids = useId();

  return (
    <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", marginTop: "var(--sp-2)", border: "1px dashed var(--accent)" }}>
      <fieldset style={{ border: "none", marginBottom: "var(--sp-3)" }}>
        <legend className="label">Formato</legend>
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          {Object.entries(FORMATS).map(([k, f]) => (
            <button
              key={k}
              type="button"
              aria-pressed={format === k}
              onClick={() => setFormat(k)}
              style={{
                padding: "var(--sp-1) var(--sp-2)",
                borderRadius: "var(--radius-xs)",
                border: `1px solid ${format === k ? f.color : "var(--border)"}`,
                cursor: "pointer",
                background: format === k ? f.color + "33" : "transparent",
                color: format === k ? f.color : "var(--text-dim)",
                fontSize: "var(--fs-3xs)",
                fontWeight: 600,
                minHeight: "var(--tap-sm)",
              }}
            >
              <Icon name={FORMAT_ICONS[k]} size={16} /> {f.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor={`${ids}-idea`}>Idea del post</label>
        <input
          id={`${ids}-idea`}
          className="input"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Ej: Antes y después de un cliente"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && idea) onAdd(format, idea); }}
        />
      </div>

      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={!idea} onClick={() => { if (idea) onAdd(format, idea); }}>
          Agregar
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Menú de acciones secundarias.
 * Recoge lo que antes eran botones sueltos con el mismo peso visual que
 * la acción principal, incluido el visor de diagnóstico.
 */
function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        className="btn-icon"
        aria-label="Más acciones"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((it, i) =>
            it.sep ? (
              <div key={`s${i}`} className="menu-sep" role="separator" />
            ) : (
              <button
                key={it.label}
                role="menuitem"
                className="menu-item"
                data-danger={it.danger ? "true" : undefined}
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick(); }}
              >
                <Icon name={it.icon} size={18} />
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function EditMetaDialog({ metaForm, setMetaForm, onSave, onClose }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 560 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Editar calendario</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <div className="segmented" role="group" aria-label="Sección de edición" style={{ margin: "0 var(--sp-4)", marginBottom: "var(--sp-2)" }}>
          <button type="button" className={`segmented-btn ${activeTab === "general" ? "active" : ""}`} aria-pressed={activeTab === "general"} onClick={() => setActiveTab("general")}>
            General
          </button>
          <button type="button" className={`segmented-btn ${activeTab === "weeks" ? "active" : ""}`} aria-pressed={activeTab === "weeks"} onClick={() => setActiveTab("weeks")}>
            Semanas
          </button>
          <button type="button" className={`segmented-btn ${activeTab === "categories" ? "active" : ""}`} aria-pressed={activeTab === "categories"} onClick={() => setActiveTab("categories")}>
            Categorías
          </button>
          <button type="button" className={`segmented-btn ${activeTab === "offers" ? "active" : ""}`} aria-pressed={activeTab === "offers"} onClick={() => setActiveTab("offers")}>
            Ofertas
          </button>
        </div>

        <div className="sheet-body">
          {activeTab === "general" && (
            <>
              <div className="field">
                <label className="label" htmlFor={`${ids}-name`}>Nombre</label>
                <input id={`${ids}-name`} className="input" value={metaForm.name} onChange={(e) => setMetaForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-camp`}>Campaña</label>
                <input id={`${ids}-camp`} className="input" value={metaForm.campaign} onChange={(e) => setMetaForm((p) => ({ ...p, campaign: e.target.value }))} />
              </div>
            </>
          )}

          {activeTab === "weeks" && (
            <fieldset style={{ border: "none" }}>
              <legend className="label">Conceptos semanales</legend>
              {(metaForm.weekConcepts || []).map((c, i) => (
                <div key={i} className="field">
                  <label className="label" style={{ textTransform: "none", color: "var(--text-dim)" }} htmlFor={`${ids}-wk-${i}`}>
                    Semana {i + 1}
                  </label>
                  <input
                    id={`${ids}-wk-${i}`}
                    className="input"
                    value={c}
                    onChange={(e) => setMetaForm((p) => {
                      const wc = [...p.weekConcepts];
                      wc[i] = e.target.value;
                      return { ...p, weekConcepts: wc };
                    })}
                  />
                </div>
              ))}
            </fieldset>
          )}

          {activeTab === "categories" && (
            <fieldset style={{ border: "none" }}>
              <legend className="label">Categoría por día de la semana</legend>
              <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
                Edita las categorías asignadas a cada día. Se aplicarán a las publicaciones del calendario.
              </p>
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <div key={dow} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
                  <label style={{ fontWeight: 700, minWidth: 84, fontSize: "var(--fs-xs)", flexShrink: 0 }} htmlFor={`${ids}-ecat-${dow}`}>
                    {DAYS[dow]}
                  </label>
                  <input
                    id={`${ids}-ecat-${dow}`}
                    className="input"
                    style={{ flex: 1 }}
                    value={(metaForm.dayCategories || {})[dow] || ""}
                    onChange={(e) => setMetaForm((p) => ({ ...p, dayCategories: { ...(p.dayCategories || {}), [dow]: e.target.value } }))}
                    placeholder="Categoría…"
                  />
                </div>
              ))}
            </fieldset>
          )}

          {activeTab === "offers" && (
            <>
              <div className="field">
                <label className="label" htmlFor={`${ids}-offers`}>Descuentos y ofertas del mes</label>
                <textarea
                  id={`${ids}-offers`}
                  className="textarea"
                  style={{ minHeight: 100 }}
                  value={metaForm.offers || ""}
                  onChange={(e) => setMetaForm((p) => ({ ...p, offers: e.target.value }))}
                  placeholder="Ej: 20% de descuento en todos los servicios, 2x1 en productos seleccionados…"
                />
                <p className="hint">
                  Estas ofertas se incluyen como contexto al generar contenido con IA.
                </p>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-promo-code`}>Código promocional</label>
                <input
                  id={`${ids}-promo-code`}
                  className="input"
                  value={metaForm.promoCode || ""}
                  onChange={(e) => setMetaForm((p) => ({ ...p, promoCode: e.target.value }))}
                  placeholder="Ej: VERANO2026"
                />
              </div>
            </>
          )}
        </div>

        <div className="sheet-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={onSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ApprovalDialog({
  approvalUrl, whatsappMessage, onClose, onGenerate, onRevoke, onReopen,
  hasLink, shareEnabled, working,
}) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [copied, setCopied] = useState("");

  const copy = (value, which) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(""), 2000);
    });
  };

  return (
    <div className="overlay">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="dialog">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)" }}>
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Enviar a cliente</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {copied === "link" ? "Enlace copiado" : copied === "msg" ? "Mensaje copiado" : ""}
        </div>

        {hasLink ? (
          <>
            {!shareEnabled && (
              <p className="notice notice-warn" style={{ display: "block" }}>
                El enlace está <strong>revocado</strong>: quien lo abra no verá nada. Puedes
                reactivarlo sin reenviarlo, porque conserva la misma dirección.
              </p>
            )}

            <div className="field">
              <label className="label" htmlFor={`${ids}-url`}>Enlace de aprobación</label>
              <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                <input id={`${ids}-url`} className="input" readOnly value={approvalUrl} onClick={(e) => e.target.select()} />
                <button className="btn btn-primary btn-sm" onClick={() => copy(approvalUrl, "link")}>
                  {copied === "link" ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="hint">
                Sólo permite ver y responder este calendario. No da acceso a ningún otro dato.
              </p>
            </div>

            <div className="field">
              <label className="label" htmlFor={`${ids}-msg`}>Mensaje para WhatsApp</label>
              <textarea
                id={`${ids}-msg`}
                className="textarea"
                readOnly
                style={{ minHeight: 100 }}
                value={whatsappMessage}
                onClick={(e) => { e.target.select(); copy(whatsappMessage, "msg"); }}
              />
              <p className="hint">Toca el mensaje para seleccionarlo y copiarlo.</p>
            </div>

            {/* Ya no hay botón «Sincronizar»: las respuestas del cliente
                llegan solas por Realtime. */}
            <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
              Las respuestas de tu cliente aparecen aquí al instante, sin recargar.
            </p>

            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cerrar</button>
              {shareEnabled ? (
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={onRevoke} disabled={working}>
                  {working ? "Revocando…" : "Revocar enlace"}
                </button>
              ) : (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={onReopen} disabled={working}>
                  {working ? "Reactivando…" : "Reactivar enlace"}
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "var(--sp-5) 0", color: "var(--text-dim)" }}>
            <Icon name="link" size={30} style={{ margin: "0 auto var(--sp-2)", color: "var(--text-muted)" }} />
            <p style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-4)" }}>
              Se generará un enlace único para que tu cliente revise y apruebe el calendario.
            </p>
            <button className="btn btn-primary" onClick={onGenerate} disabled={working}>
              {working ? "Generando…" : "Generar enlace de aprobación"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddPostDialog({ date, onAdd, onClose }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 420 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-sm)" }}>Agregar publicación — {date}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <AddPostInline onAdd={onAdd} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ cal, onPostClick, onMove, onAddPost, onDropFromBank, ideasBank }) {
  const [drag, setDrag] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const today = fmtDate(new Date());

  const dowBaseIdeas = {};
  for (const day of cal.days || []) {
    const dow = new Date(day.date + "T12:00:00").getDay();
    const dowMon = dow === 0 ? 6 : dow - 1;
    if (dowBaseIdeas[dowMon]) continue;
    const firstIdea = (day.posts || []).find((p) => p.idea)?.idea;
    if (firstIdea) dowBaseIdeas[dowMon] = firstIdea;
  }

  const cells = () => {
    const first = new Date(cal.year, cal.month, 1);
    const last = new Date(cal.year, cal.month + 1, 0);
    const s = new Date(first);
    const dow = s.getDay();
    s.setDate(s.getDate() - (dow === 0 ? 6 : dow - 1));
    const e = new Date(last);
    const edow = e.getDay();
    if (edow !== 0) e.setDate(e.getDate() + (7 - edow));
    const arr = [];
    const d = new Date(s);
    while (d <= e) { arr.push(fmtDate(d)); d.setDate(d.getDate() + 1); }
    return arr;
  };

  const allCells = cells();
  let lastWeek = null;

  const FULL_DOW = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  return (
    <div className="cal-grid">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((n, i) => (
        <div key={n} className="cal-header-cell">
          <abbr title={FULL_DOW[i]} style={{ textDecoration: "none" }}>{n}</abbr>
          {dowBaseIdeas[i] && <div className="cal-header-idea">{dowBaseIdeas[i]}</div>}
        </div>
      ))}
      {allCells.map((date) => {
        const d = new Date(date + "T12:00:00");
        const dd = cal.days?.find((dd) => dd.date === date);
        const cur = d.getMonth() === cal.month;
        const isToday = date === today;
        const isDrop = dropTarget === date;

        const weekNum = dd?.weekNumber;
        const concept = dd?.concept;
        let showWeekSep = false;
        if (weekNum && weekNum !== lastWeek && cur) {
          showWeekSep = true;
          lastWeek = weekNum;
        }

        return (
          <div
            key={date}
            className={`cal-cell ${!cur ? "outside" : ""} ${isToday ? "today" : ""} ${isDrop ? "drop-target" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDropTarget(date); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              let handled = false;
              try {
                const data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
                if (data.bankPostId && onDropFromBank && ideasBank) {
                  const bankPost = ideasBank.find((p) => p.id === data.bankPostId);
                  if (bankPost) { onDropFromBank(bankPost, date); handled = true; }
                }
              } catch { /* not bank data */ }
              if (!handled && drag && drag.sourceDate !== date) onMove(drag.postId, drag.sourceDate, date);
              setDrag(null);
              setDropTarget(null);
            }}
          >
            <div className={`cal-daynum${isToday ? " is-today" : ""}`}>
              {isToday && <span className="sr-only">Hoy, </span>}
              {d.getDate()}
            </div>
            {showWeekSep && concept && (
              <div className="cal-week-tag">S{weekNum}: {concept}</div>
            )}
            {(dd?.posts || []).map((post) => {
              const f = FORMATS[post.format] || FORMATS.post;
              const st = STATUSES[post.status || "pending"];
              const isPublished = post.status === "published";
              const briefIdea = post.idea ? post.idea.split(/[.\n]/)[0].slice(0, 24) : "";
              return (
                <button
                  key={post.id}
                  type="button"
                  draggable
                  className={`cal-post${isPublished ? " is-published" : ""}`}
                  /* El texto visible se recorta a un icono en móvil, así que
                     el nombre accesible lleva la información completa. */
                  aria-label={`${f.label}${briefIdea ? `: ${briefIdea}` : ""} — ${st.label}${post.publishTime ? `, ${post.publishTime}` : ""}`}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", JSON.stringify({ postId: post.id, sourceDate: date })); setDrag({ postId: post.id, sourceDate: date }); }}
                  onDragEnd={() => { setDrag(null); setDropTarget(null); }}
                  onClick={() => onPostClick(post, dd)}
                  style={{
                    background: isPublished ? st.bg : f.color + "22",
                    borderColor: isPublished ? st.border : st.border + "88",
                    borderWidth: isPublished ? 2 : 1,
                    color: isPublished ? st.text : f.color,
                  }}
                >
                  <span className="cal-post-dot" style={{ background: st.text }} aria-hidden="true" />
                  <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={13} />
                  <span className="cal-post-label" aria-hidden="true">{briefIdea || f.label}</span>
                  {post.publishTime && <span className="cal-post-time" aria-hidden="true">{post.publishTime}</span>}
                </button>
              );
            })}
            {cur && (
              <button
                type="button"
                className="cal-add"
                aria-label={`Agregar publicación el ${date}`}
                onClick={(e) => { e.stopPropagation(); onAddPost(date); }}
              >
                +
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BankPanel({ client, onUpdateClient, calDays, onRemoveFromCal, onClose, cal, calId, onUpdateCal, onMoveBankToCal }) {
  const [editingId, setEditingId] = useState(null);
  const [dropHover, setDropHover] = useState(false);

  const ideasBank = client.ideasBank || [];
  const saveBankList = (next) => onUpdateClient({ ...client, ideasBank: next });

  const addNewPost = () => {
    const post = {
      id: uid(), format: "post", idea: "", category: "", guion: "",
      descripcion: "", script: "", status: "pending", image: null,
      referenceLink: "", comment: "", publishTime: "",
      _addedAt: new Date().toISOString(),
    };
    saveBankList([...ideasBank, post]);
    setEditingId(post.id);
  };

  const updateBankPost = (updated) => {
    saveBankList(ideasBank.map((p) => p.id === updated.id ? updated : p));
  };

  const removeFromBank = (postId) => {
    saveBankList(ideasBank.filter((p) => p.id !== postId));
    if (editingId === postId) setEditingId(null);
  };

  const moveBankToCalendar = (bankPost, targetDate) => {
    if (onMoveBankToCal) {
      onMoveBankToCal(bankPost, targetDate);
      if (editingId === bankPost.id) setEditingId(null);
      return;
    }
    const newPost = { ...bankPost, id: uid(), status: "pending" };
    delete newPost._originDate;
    delete newPost._originCal;
    delete newPost._addedAt;
    const newDays = (cal.days || []).map((d) =>
      d.date !== targetDate ? d : { ...d, posts: [...(d.posts || []), newPost] }
    );
    onUpdateCal(calId, { ...cal, days: newDays });
    saveBankList(ideasBank.filter((p) => p.id !== bankPost.id));
    if (editingId === bankPost.id) setEditingId(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDropHover(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
      if (data.postId && data.sourceDate && calDays) {
        const sourceDay = calDays.find((d) => d.date === data.sourceDate);
        const post = sourceDay?.posts?.find((p) => p.id === data.postId);
        if (post) {
          const bankPost = { ...post, id: uid(), _originDate: data.sourceDate, _addedAt: new Date().toISOString() };
          saveBankList([...ideasBank, bankPost]);
          if (onRemoveFromCal) onRemoveFromCal(data.sourceDate, data.postId);
        }
      }
    } catch { /* ignore */ }
  };

  return (
    <div
      className={`bank-panel${dropHover ? " drop-hover" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDropHover(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropHover(false); }}
      onDrop={handleDrop}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--sp-3)", borderBottom: "1px solid var(--border)" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--accent-alt)" }}>
          <Icon name="bulb" size={18} /> Banco ({ideasBank.length})
        </h3>
        <div style={{ display: "flex", gap: "var(--sp-1)" }}>
          <button className="btn btn-secondary btn-sm" onClick={addNewPost} aria-label="Crear nueva idea">
            <Icon name="plus" size={14} />
          </button>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar banco de ideas">
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--sp-2)" }}>
        {ideasBank.length === 0 ? (
          <p style={{ textAlign: "center", padding: "var(--sp-4) 0", color: "var(--text-dim)", fontSize: "var(--fs-2xs)" }}>
            {calDays
              ? "Arrastra publicaciones aquí o crea una nueva idea."
              : "Crea una nueva idea para este cliente."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {ideasBank.map((post) => (
              <BankPostCard
                key={post.id}
                post={post}
                isEditing={editingId === post.id}
                onToggleEdit={() => setEditingId(editingId === post.id ? null : post.id)}
                onSave={updateBankPost}
                onRemove={() => removeFromBank(post.id)}
                onMoveToCalendar={(date) => moveBankToCalendar(post, date)}
                calDays={calDays}
                client={client}
                cal={cal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BankPostCard({ post, isEditing, onToggleEdit, onSave, onRemove, onMoveToCalendar, calDays, client, cal }) {
  const [form, setForm] = useState({ ...post });
  const [moveDate, setMoveDate] = useState("");
  const [fieldLoading, setFieldLoading] = useState({});
  const [fieldError, setFieldError] = useState("");
  const imgRef = useRef();
  const cardId = useId();
  const sf = (k, v) => { setForm((p) => { const next = { ...p, [k]: v }; onSave(next); return next; }); };
  const f = FORMATS[form.format] || FORMATS.post;
  const isPost = form.format === "post";
  const title = form.idea || form.descripcion?.slice(0, 40) || f.label;

  const generateField = async (field) => {
    setFieldError("");
    setFieldLoading((p) => ({ ...p, [field]: true }));
    try {
      const mockDay = { date: form._originDate || "", dayName: "", concept: "", category: form.category || "" };
      const result = await generateFieldForPost(client, form, mockDay, cal, field);
      sf(field, result);
    } catch (e) {
      setFieldError(`Error: ${e.message}`);
    } finally {
      setFieldLoading((p) => ({ ...p, [field]: false }));
    }
  };

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ bankPostId: post.id }));
  };

  if (!isEditing) {
    return (
      <div
        draggable
        onDragStart={handleDragStart}
        style={{
          display: "flex", alignItems: "center", gap: "var(--sp-2)",
          padding: "var(--sp-2)", background: "var(--bg)", borderRadius: "var(--radius-sm)",
          border: `1px solid ${f.color}44`, cursor: "grab",
        }}
      >
        <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={16} style={{ color: f.color, flexShrink: 0 }} />
        <button
          type="button" draggable={false}
          style={{ flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, color: "inherit", fontFamily: "inherit" }}
          onClick={onToggleEdit}
          aria-label={`Editar: ${title}`}
        >
          <span style={{ display: "block", fontSize: "var(--fs-2xs)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
          {form.category && <span style={{ display: "block", fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>{form.category}</span>}
          {form.publishTime && <span style={{ display: "block", fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}><Icon name="clock" size={10} /> {form.publishTime}</span>}
        </button>
        <button type="button" draggable={false} className="btn-remove" aria-label={`Quitar del banco: ${title}`} onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", border: `1px solid ${f.color}66` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
        <Icon name={FORMAT_ICONS[form.format] || "formatPost"} size={16} style={{ color: f.color }} />
        <span style={{ fontSize: "var(--fs-xs)", fontWeight: 700, flex: 1 }}>Editar idea</span>
        <button className="btn-icon" onClick={onToggleEdit} aria-label="Cerrar editor"><Icon name="close" size={16} /></button>
      </div>

      {fieldError && <p role="alert" style={{ fontSize: "var(--fs-3xs)", color: "var(--danger)", marginBottom: "var(--sp-2)" }}>{fieldError}</p>}

      <div style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap", marginBottom: "var(--sp-2)" }}>
        {Object.entries(FORMATS).map(([k, fmt]) => (
          <button
            key={k} type="button" aria-pressed={form.format === k}
            onClick={() => sf("format", k)}
            style={{
              padding: "2px var(--sp-2)", borderRadius: "var(--radius-xs)",
              border: `1px solid ${form.format === k ? fmt.color : "var(--border)"}`,
              cursor: "pointer", background: form.format === k ? fmt.color + "33" : "transparent",
              color: form.format === k ? fmt.color : "var(--text-dim)",
              fontSize: "var(--fs-3xs)", fontWeight: 600, fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 3,
            }}
          >
            <Icon name={FORMAT_ICONS[k]} size={12} /> {fmt.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: "var(--sp-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <label className="label" style={{ margin: 0, fontSize: "var(--fs-3xs)" }} htmlFor={`${cardId}-idea`}>Idea</label>
          <button type="button" className="btn-ai" style={{ fontSize: "var(--fs-3xs)", padding: "1px 6px" }} onClick={() => generateField("idea")} disabled={fieldLoading.idea}>
            {fieldLoading.idea ? "…" : <><Icon name="sparkles" size={11} /> IA</>}
          </button>
        </div>
        <textarea id={`${cardId}-idea`} className="textarea" style={{ minHeight: 56, fontSize: "var(--fs-2xs)" }} value={form.idea || ""} onChange={(e) => sf("idea", e.target.value)} placeholder="Idea…" />
      </div>

      <div style={{ marginBottom: "var(--sp-2)" }}>
        <label className="label" style={{ fontSize: "var(--fs-3xs)" }} htmlFor={`${cardId}-cat`}>Categoría</label>
        <input id={`${cardId}-cat`} className="input" style={{ fontSize: "var(--fs-2xs)" }} value={form.category || ""} onChange={(e) => sf("category", e.target.value)} placeholder="Categoría…" />
      </div>

      <div style={{ marginBottom: "var(--sp-2)" }}>
        <label className="label" style={{ fontSize: "var(--fs-3xs)" }} htmlFor={`${cardId}-time`}>Hora</label>
        <TimePicker id={`${cardId}-time`} value={form.publishTime || ""} onChange={(v) => sf("publishTime", v)} />
      </div>

      {!isPost && (
        <div style={{ marginBottom: "var(--sp-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <label className="label" style={{ margin: 0, fontSize: "var(--fs-3xs)", color: "#FF7BA8" }} htmlFor={`${cardId}-guion`}>Guion</label>
            <button type="button" className="btn-ai" style={{ fontSize: "var(--fs-3xs)", padding: "1px 6px" }} onClick={() => generateField("guion")} disabled={fieldLoading.guion}>
              {fieldLoading.guion ? "…" : <><Icon name="sparkles" size={11} /> IA</>}
            </button>
          </div>
          <textarea id={`${cardId}-guion`} className="textarea" style={{ minHeight: 64, fontSize: "var(--fs-2xs)" }} value={form.guion || ""} onChange={(e) => sf("guion", e.target.value)} placeholder="Guion…" />
        </div>
      )}

      <div style={{ marginBottom: "var(--sp-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <label className="label" style={{ margin: 0, fontSize: "var(--fs-3xs)" }} htmlFor={`${cardId}-desc`}>Descripción</label>
          <button type="button" className="btn-ai" style={{ fontSize: "var(--fs-3xs)", padding: "1px 6px" }} onClick={() => generateField("descripcion")} disabled={fieldLoading.descripcion}>
            {fieldLoading.descripcion ? "…" : <><Icon name="sparkles" size={11} /> IA</>}
          </button>
        </div>
        <textarea id={`${cardId}-desc`} className="textarea" style={{ minHeight: 64, fontSize: "var(--fs-2xs)" }} value={form.descripcion || form.script || ""} onChange={(e) => sf("descripcion", e.target.value)} placeholder="Descripción…" />
      </div>

      {form.image && <img src={form.image} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "var(--radius-xs)", marginBottom: "var(--sp-2)" }} />}
      <input ref={imgRef} type="file" accept="image/*" className="sr-only" aria-label="Imagen" onChange={async (e) => { const file = e.target.files[0]; if (!file) return; try { sf("image", await compressImage(file, 400)); } catch (err) { setFieldError(err.message); } }} />
      <div style={{ display: "flex", gap: "var(--sp-1)", marginBottom: "var(--sp-2)" }}>
        <button className="btn btn-secondary btn-sm" style={{ fontSize: "var(--fs-3xs)" }} onClick={() => imgRef.current?.click()}>
          {form.image ? "Cambiar img" : "Subir img"}
        </button>
        {form.image && <button className="btn btn-ghost btn-sm" style={{ fontSize: "var(--fs-3xs)", color: "var(--danger)" }} onClick={() => sf("image", null)}>Quitar</button>}
      </div>

      {calDays && (
        <div style={{ display: "flex", gap: "var(--sp-1)", alignItems: "flex-end", marginBottom: "var(--sp-2)" }}>
          <div style={{ flex: 1 }}>
            <label className="label" style={{ fontSize: "var(--fs-3xs)" }} htmlFor={`${cardId}-move`}>Mover al calendario</label>
            <select id={`${cardId}-move`} className="input" style={{ fontSize: "var(--fs-2xs)" }} value={moveDate} onChange={(e) => setMoveDate(e.target.value)}>
              <option value="">Elegir fecha…</option>
              {calDays.map((d) => <option key={d.date} value={d.date}>{d.date.split("-")[2]} {d.dayName}</option>)}
            </select>
          </div>
          <button className="btn btn-accent btn-sm" style={{ fontSize: "var(--fs-3xs)" }} disabled={!moveDate} onClick={() => onMoveToCalendar(moveDate)}>
            <Icon name="calendar" size={14} />
          </button>
        </div>
      )}

      <button className="btn btn-ghost btn-sm" style={{ width: "100%", color: "var(--danger)", fontSize: "var(--fs-3xs)" }} onClick={onRemove}>
        <Icon name="trash" size={14} /> Eliminar del banco
      </button>
    </div>
  );
}

export default function CalendarView({
  client,
  cal,
  calId,
  onUpdateCal,
  onUpdateCalLocal,
  onDeleteCal,
  onDuplicateCal,
  onUpdateClient,
  onMoveBankToCal,
}) {
  const [viewMode, setViewMode] = useState("list");
  const [expandedDay, setExpandedDay] = useState(null);
  const [sidePanel, setSidePanel] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");
  const [filterWeek, setFilterWeek] = useState("all");
  const [filterDOW, setFilterDOW] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(cal.name || (MONTHS[cal.month] + " " + cal.year));
  const [genLoading, setGenLoading] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [genProgress, setGenProgress] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [addingPostDay, setAddingPostDay] = useState(null);
  const [genSingleLoading, setGenSingleLoading] = useState({});
  const [incompleteInfo, setIncompleteInfo] = useState(null);
  const [approvalModal, setApprovalModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [shareWorking, setShareWorking] = useState(false);
  const [editMeta, setEditMeta] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const [metaForm, setMetaForm] = useState(() => {
    const cats = {};
    for (const day of cal.days || []) {
      if (!day.category) continue;
      const dow = new Date(day.date + "T12:00:00").getDay();
      if (!cats[dow]) cats[dow] = day.category;
    }
    return {
      name: cal.name || "",
      campaign: cal.campaign || "",
      weekConcepts: [...(cal.weekConcepts || [])],
      dayCategories: cats,
      offers: cal.offers || "",
      promoCode: cal.promoCode || "",
    };
  });

  // ----------------------------------------------------------
  // Respuestas del cliente final, en vivo
  //
  // Se vuelcan sobre `days` en el estado local únicamente. Persistirlas
  // dispararía una escritura por cada respuesta recibida, y esa
  // escritura volvería como otro evento: un bucle. La tabla `approvals`
  // es la fuente de verdad y se relee en cada carga.
  //
  // La referencia lleva el calendario más reciente a la suscripción sin
  // que ésta tenga que rehacerse en cada edición.
  // ----------------------------------------------------------
  const setCalRef = useRef(null);
  setCalRef.current = (updater) => onUpdateCalLocal(calId, updater(cal));

  useEffect(() => {
    if (!cal.shareToken || !cal.id) return;
    let alive = true;

    const aplicar = async () => {
      try {
        const approvals = await fetchApprovals(cal.id);
        if (!alive || Object.keys(approvals).length === 0) return;

        setCalRef.current?.((actual) => {
          const days = (actual.days || []).map((d) => ({
            ...d,
            posts: (d.posts || []).map((p) => {
              const review = approvals[p.id];
              if (!review) return p;
              return {
                ...p,
                status: review.estado === "aprobado" ? "approved"
                  : review.estado === "cambios" ? "rejected"
                    : p.status,
                comment: review.comentario || p.comment,
              };
            }),
          }));
          return { ...actual, days };
        });
      } catch (e) {
        console.error("No se pudieron leer las aprobaciones:", e);
      }
    };

    aplicar();
    const unsubscribe = subscribeApprovals(cal.id, () => {
      setSyncStatus("Tu cliente acaba de responder.");
      setTimeout(() => setSyncStatus(""), 4000);
      aplicar();
    });

    return () => { alive = false; unsubscribe(); };
  }, [cal.id, cal.shareToken]);

  const ideasBank = client.ideasBank || [];

  const addToBank = (post, sourceDate) => {
    const bankPost = { ...post, id: uid(), _originDate: sourceDate, _originCal: calId, _addedAt: new Date().toISOString() };
    onUpdateClient({ ...client, ideasBank: [...ideasBank, bankPost] });
  };

  const moveBankToCalendar = (bankPost, targetDate) => {
    if (onMoveBankToCal) {
      onMoveBankToCal(bankPost, targetDate);
      return;
    }
    const newPost = { ...bankPost, id: uid(), status: "pending" };
    delete newPost._originDate;
    delete newPost._originCal;
    delete newPost._addedAt;
    const newDays = (cal.days || []).map((d) =>
      d.date !== targetDate ? d : { ...d, posts: [...(d.posts || []), newPost] }
    );
    onUpdateCal(calId, { ...cal, days: newDays });
    onUpdateClient({ ...client, ideasBank: ideasBank.filter((p) => p.id !== bankPost.id) });
  };

  const calName = cal.name || (MONTHS[cal.month] + " " + cal.year);
  const approvalUrl = cal.shareToken
    ? `${window.location.origin}/aprobar?t=${encodeURIComponent(cal.shareToken)}`
    : "";
  const totalPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).length, 0);
  const approvedPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).filter((p) => p.status === "approved" || p.status === "published").length, 0);
  const publishedPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).filter((p) => p.status === "published").length, 0);

  const weeks = [...new Set((cal.days || []).map((d) => d.weekNumber || 1))].sort((a, b) => a - b);
  const activeFilterCount = [filterStatus, filterFormat, filterWeek, filterDOW].filter((f) => f !== "all").length;
  const approvalPct = totalPosts > 0 ? Math.round((approvedPosts / totalPosts) * 100) : 0;
  const monthLabel = `${MONTHS[cal.month]} ${cal.year}`;
  const calSubtitle = [calName === monthLabel ? null : monthLabel, cal.campaign]
    .filter(Boolean)
    .join(" · ");

  const filteredDays = (cal.days || []).map((day) => ({
    ...day,
    posts: (day.posts || []).filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterFormat !== "all" && p.format !== filterFormat) return false;
      return true;
    }),
  })).filter((day) => {
    if (filterWeek !== "all" && String(day.weekNumber) !== filterWeek) return false;
    if (filterDOW !== "all") {
      const dow = new Date(day.date + "T12:00:00").getDay();
      if (String(dow) !== filterDOW) return false;
    }
    return day.posts.length > 0 || (filterStatus === "all" && filterFormat === "all");
  });

  const addDebug = (msg) => setDebugLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg }]);

  const updatePost = (date, updatedPost) => {
    const newDays = (cal.days || []).map((d) =>
      d.date !== date ? d : { ...d, posts: d.posts.map((p) => (p.id === updatedPost.id ? updatedPost : p)) }
    );
    onUpdateCal(calId, { ...cal, days: newDays });
  };

  const addPost = (date, format, idea) => {
    const newPost = {
      id: uid(),
      format,
      idea,
      guion: "",
      descripcion: "",
      hashtagsFinales: "",
      script: "",
      status: "pending",
      category: "",
      image: null,
      referenceLink: "",
      comment: "",
    };
    const newDays = (cal.days || []).map((d) =>
      d.date !== date ? d : { ...d, posts: [...(d.posts || []), newPost] }
    );
    onUpdateCal(calId, { ...cal, days: newDays });
    setAddingPostDay(null);
  };

  const removePostFromDay = (date, postId) => {
    const newDays = (cal.days || []).map((d) =>
      d.date !== date ? d : { ...d, posts: d.posts.filter((p) => p.id !== postId) }
    );
    onUpdateCal(calId, { ...cal, days: newDays });
    if (sidePanel?.post?.id === postId) setSidePanel(null);
  };

  const deletePost = (date, postId) => {
    if (!window.confirm("Eliminar esta publicacion?")) return;
    removePostFromDay(date, postId);
  };

  const generateSinglePostContent = async (post, day) => {
    setGenSingleLoading((p) => ({ ...p, [post.id]: true }));
    try {
      const result = await generateSinglePost(client, post, day, cal);
      const newDays = (cal.days || []).map((d) =>
        d.date !== day.date ? d : {
          ...d,
          posts: d.posts.map((p) =>
            p.id !== post.id ? p : {
              ...p,
              guion: result.guion || p.guion,
              descripcion: result.descripcion || p.descripcion,
              hashtagsFinales: result.hashtagsFinales || p.hashtagsFinales,
              script: result.descripcion || result.guion || p.script,
            }
          ),
        }
      );
      onUpdateCal(calId, { ...cal, days: newDays });
    } catch (e) {
      setSyncStatus("Error al generar: " + e.message);
      setTimeout(() => setSyncStatus(""), 6000);
    }
    setGenSingleLoading((p) => ({ ...p, [post.id]: false }));
  };

  const getIncompletePosts = () => {
    return (cal.days || []).flatMap((d) =>
      (d.posts || [])
        .filter((p) => {
          const hasContent = p.guion || p.descripcion || p.script;
          return !hasContent;
        })
        .map((p) => ({ ...p, _date: d.date, _dayName: d.dayName }))
    );
  };

  const retryIncomplete = async () => {
    const incomplete = getIncompletePosts();
    if (!incomplete.length) return;
    setGenLoading(true);
    setGenProgress(0);
    setGenStatus(`Reintentando ${incomplete.length} posts...`);
    setIncompleteInfo(null);

    try {
      let adnExtra = client.githubContext || "";
      if (!adnExtra && client.githubRepo) {
        const result = await fetchGitHubADN(client.githubRepo, client.githubFolder);
        adnExtra = result.content;
      }

      const BATCH = 6;
      let allResults = {};
      const postsToGen = incomplete.map((p) => {
        const day = (cal.days || []).find((d) => d.date === p._date);
        return { ...p, _weekNumber: day?.weekNumber, _concept: day?.concept };
      });

      for (let i = 0; i < postsToGen.length; i += BATCH) {
        const batch = postsToGen.slice(i, i + BATCH);
        setGenStatus(`Reintentando ${i + 1}-${Math.min(i + BATCH, postsToGen.length)}/${postsToGen.length}...`);
        setGenProgress(Math.round((i / postsToGen.length) * 90));

        const promptText = buildScriptPrompt(client, cal, batch, adnExtra);
        const content = [{ type: "text", text: promptText }];
        for (const p of batch) {
          if (p.image) {
            content.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: p.image.includes(",") ? p.image.split(",")[1] : p.image },
            });
          }
        }

        const txt = await callAI(content);
        const parsed = parseAIResponse(txt);
        allResults = { ...allResults, ...parsed };
      }

      const newDays = (cal.days || []).map((d) => ({
        ...d,
        posts: (d.posts || []).map((p) => {
          const result = allResults[p.id];
          if (!result) return p;
          return { ...p, guion: result.guion || p.guion, descripcion: result.descripcion || p.descripcion, hashtagsFinales: result.hashtagsFinales || p.hashtagsFinales, script: result.descripcion || result.guion || p.script };
        }),
      }));
      onUpdateCal(calId, { ...cal, days: newDays });

      const stillIncomplete = newDays.flatMap((d) => d.posts.filter((p) => !p.guion && !p.descripcion && !p.script));
      setGenProgress(100);
      setGenStatus(`Listo! ${Object.keys(allResults).length} posts generados`);
      if (stillIncomplete.length > 0) {
        setIncompleteInfo({ count: stillIncomplete.length });
      }
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 2000);
    } catch (e) {
      setGenStatus("Error: " + e.message);
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 4000);
    }
  };

  // El calendario ya no se copia a ningún sitio al compartirlo: el
  // enlace apunta a la misma fila que edita la agencia, así que el
  // cliente ve siempre la versión actual sin volver a enviarlo.
  const sendToClient = async () => {
    if (cal.shareToken) {
      setApprovalModal(true);
      return;
    }
    setShareWorking(true);
    try {
      const token = await shareCalendar(cal.id);
      onUpdateCalLocal(calId, { ...cal, shareToken: token, shareEnabled: true });
      setApprovalModal(true);
    } catch (e) {
      setSyncStatus(`No se pudo generar el enlace: ${e.message}. Usa «HTML» para enviarlo como archivo.`);
      setTimeout(() => setSyncStatus(""), 8000);
    }
    setShareWorking(false);
  };

  const changeShare = async (enabled) => {
    setShareWorking(true);
    try {
      await setShareEnabled(cal.id, enabled);
      onUpdateCalLocal(calId, { ...cal, shareEnabled: enabled });
      setSyncStatus(enabled ? "Enlace reactivado." : "Enlace revocado.");
      setTimeout(() => setSyncStatus(""), 4000);
    } catch (e) {
      setSyncStatus(`No se pudo cambiar el enlace: ${e.message}`);
      setTimeout(() => setSyncStatus(""), 6000);
    }
    setShareWorking(false);
  };

  const movePost = (postId, sourceDate, targetDate) => {
    let days = [...(cal.days || [])];
    const sourceDay = days.find((d) => d.date === sourceDate);
    const post = sourceDay?.posts.find((p) => p.id === postId);
    if (!post) return;

    days = days.map((d) => {
      if (d.date === sourceDate) return { ...d, posts: d.posts.filter((p) => p.id !== postId) };
      if (d.date === targetDate) return { ...d, posts: [...(d.posts || []), post] };
      return d;
    });

    if (!days.find((d) => d.date === targetDate)) {
      const tdd = new Date(targetDate + "T12:00:00");
      days = [...days, { date: targetDate, dayName: DAYS[tdd.getDay()], weekNumber: 1, category: "", posts: [post] }];
      days.sort((a, b) => a.date.localeCompare(b.date));
    }

    onUpdateCal(calId, { ...cal, days });
  };

  const saveMetaEdit = () => {
    const updatedConcepts = metaForm.weekConcepts;
    const cats = metaForm.dayCategories || {};
    const newDays = (cal.days || []).map((d) => {
      const dow = new Date(d.date + "T12:00:00").getDay();
      return {
        ...d,
        concept: updatedConcepts[(d.weekNumber || 1) - 1] || d.concept || "",
        category: cats[dow] !== undefined ? cats[dow] : d.category || "",
      };
    });
    onUpdateCal(calId, {
      ...cal,
      name: metaForm.name || calName,
      campaign: metaForm.campaign,
      weekConcepts: updatedConcepts,
      offers: metaForm.offers || "",
      promoCode: metaForm.promoCode || "",
      days: newDays,
    });
    setEditMeta(false);
  };

  const generateScripts = async () => {
    if (genLoading) return;
    setGenLoading(true);
    setGenProgress(0);
    setGenStatus("Preparando...");
    setDebugLog([]);
    addDebug("Inicio de generacion");

    try {
      let adnExtra = client.githubContext || "";
      if (!adnExtra && client.githubRepo) {
        setGenStatus("Cargando ADN desde GitHub...");
        addDebug("Fetching GitHub ADN: " + client.githubRepo);
        const result = await fetchGitHubADN(client.githubRepo, client.githubFolder);
        adnExtra = result.content;
        addDebug("GitHub ADN: " + (adnExtra ? adnExtra.length + " chars" : "vacio"));
      } else if (adnExtra) {
        addDebug("Usando ADN cacheado: " + adnExtra.length + " chars");
      }

      const days = cal.days || [];
      const postsToGen = days.flatMap((d) =>
        (d.posts || [])
          .filter((p) => !p.guion && !p.descripcion && !p.script)
          .map((p) => ({
            ...p,
            _date: d.date,
            _dayName: d.dayName,
            _weekNumber: d.weekNumber,
            _concept: d.concept,
          }))
      );

      if (!postsToGen.length) {
        setGenStatus("Todos los posts ya tienen contenido.");
        addDebug("Nada que generar");
        setTimeout(() => { setGenLoading(false); setGenStatus(""); }, 1500);
        return;
      }

      addDebug(`${postsToGen.length} posts a generar`);

      const BATCH = 6;
      let allResults = {};

      for (let i = 0; i < postsToGen.length; i += BATCH) {
        const batch = postsToGen.slice(i, i + BATCH);
        const batchLabel = `${i + 1}-${Math.min(i + BATCH, postsToGen.length)}/${postsToGen.length}`;
        setGenStatus(`Generando ${batchLabel}...`);
        setGenProgress(Math.round((i / postsToGen.length) * 90));
        addDebug(`Batch ${batchLabel}: ${batch.map((p) => p.id).join(", ")}`);

        const promptText = buildScriptPrompt(client, cal, batch, adnExtra);
        addDebug(`Prompt length: ${promptText.length} chars`);

        const content = [{ type: "text", text: promptText }];
        for (const p of batch) {
          if (p.image) {
            content.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: p.image.includes(",") ? p.image.split(",")[1] : p.image },
            });
          }
        }

        const txt = await callAI(content);
        addDebug(`Respuesta: ${txt.length} chars`);

        const parsed = parseAIResponse(txt);
        const parsedIds = Object.keys(parsed);
        addDebug(`Parseados: ${parsedIds.length} posts — IDs: ${parsedIds.join(", ")}`);

        if (parsedIds.length === 0) {
          addDebug("WARN: No se parsearon posts. Respuesta cruda: " + txt.slice(0, 300));
        }

        allResults = { ...allResults, ...parsed };
      }

      const newDays = (cal.days || []).map((d) => ({
        ...d,
        posts: (d.posts || []).map((p) => {
          const result = allResults[p.id];
          if (!result) return p;
          return {
            ...p,
            guion: result.guion || p.guion || "",
            descripcion: result.descripcion || p.descripcion || "",
            hashtagsFinales: result.hashtagsFinales || p.hashtagsFinales || "",
            script: result.descripcion || result.guion || p.script || "",
          };
        }),
      }));
      onUpdateCal(calId, { ...cal, days: newDays });

      setGenProgress(100);
      const total = Object.keys(allResults).length;
      const stillIncomplete = newDays.flatMap((d) => (d.posts || []).filter((p) => !p.guion && !p.descripcion && !p.script));
      if (stillIncomplete.length > 0) {
        setIncompleteInfo({ count: stillIncomplete.length });
        addDebug(`WARN: ${stillIncomplete.length} posts quedaron sin generar`);
      }
      setGenStatus(`Listo! ${total} posts generados`);
      addDebug(`Completado: ${total} posts actualizados`);
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 2000);
    } catch (e) {
      addDebug("ERROR: " + e.message);
      setGenStatus("Error: " + e.message);
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 4000);
    }
  };

  const exportHTML = () => {
    const html = buildExportHTML(client, cal);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (calName).replace(/\s+/g, "-") + "-" + client.name.replace(/\s+/g, "-") + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const s = document.createElement("style");
    s.id = "print-style";
    s.textContent = "@media print{header,button,.no-print{display:none!important}body,html{background:var(--bg)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}";
    document.head.appendChild(s);
    window.print();
    setTimeout(() => document.getElementById("print-style")?.remove(), 2000);
  };

  return (
    <div style={{ paddingBottom: sidePanel ? 0 : 80 }}>
      {/* Rename inline */}
      {renaming && (
        <div className="field">
          <label className="label" htmlFor="cal-rename">Nombre del calendario</label>
          <input
            id="cal-rename"
            className="input"
            style={{ fontWeight: 700 }}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            autoFocus
            onBlur={() => { onUpdateCal(calId, { ...cal, name: nameVal }); setRenaming(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onUpdateCal(calId, { ...cal, name: nameVal }); setRenaming(false); }
              if (e.key === "Escape") { setNameVal(calName); setRenaming(false); }
            }}
          />
        </div>
      )}

      {/* Edit calendar meta modal */}
      {editMeta && <EditMetaDialog metaForm={metaForm} setMetaForm={setMetaForm} onSave={saveMetaEdit} onClose={() => setEditMeta(false)} />}

      {/* Identidad del calendario: una línea, no un banner de 90px.
          El mes y el año sólo se muestran si el nombre del calendario no
          los dice ya; si no, se leía «Agosto 2026 · Agosto 2026». */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
        <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: 700, letterSpacing: "-.01em" }}>{calName}</h2>
        {calSubtitle && (
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>{calSubtitle}</span>
        )}
      </div>

      {/* Estadísticas: una tira de una línea. Antes eran cuatro cajas de
          490×110px con bordes de cuatro colores sin significado. */}
      <div className="stat-strip">
        <div className="stat-item">
          <span className="stat-num">{totalPosts}</span>
          <span className="stat-name">publicaciones</span>
        </div>
        <span className="stat-divider" aria-hidden="true" />
        <div className="stat-item">
          <span className="stat-num" style={{ color: "var(--success)" }}>{approvedPosts}</span>
          <span className="stat-name">aprobadas</span>
        </div>
        {publishedPosts > 0 && (
          <>
            <span className="stat-divider" aria-hidden="true" />
            <div className="stat-item">
              <span className="stat-num" style={{ color: "var(--purple)" }}>{publishedPosts}</span>
              <span className="stat-name">publicadas</span>
            </div>
          </>
        )}
        {totalPosts > 0 && (
          <div className="stat-progress">
            <div
              className="progress-bar"
              style={{ flex: 1 }}
              role="progressbar"
              aria-label="Progreso de aprobación"
              aria-valuenow={approvalPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="progress-fill" style={{ width: `${approvalPct}%` }} />
            </div>
            <span className="stat-name" style={{ fontVariantNumeric: "tabular-nums" }}>{approvalPct}%</span>
          </div>
        )}
      </div>

      {/* Barra de herramientas: acción primaria, conmutador de vista y el
          resto agrupado. Antes eran siete botones idénticos que mezclaban
          la acción principal con un visor de registros de desarrollo. */}
      <div className="toolbar">
        <button className="btn btn-accent" onClick={generateScripts} disabled={genLoading}>
          <Icon name="sparkles" size={18} />
          {genLoading ? genStatus : "Generar contenido"}
        </button>

        <div className="segmented" role="group" aria-label="Vista del calendario" style={{ width: "auto", flexShrink: 0 }}>
          <button
            type="button"
            className={`segmented-btn ${viewMode === "list" ? "active" : ""}`}
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
          >
            <Icon name="list" size={16} /> Lista
          </button>
          <button
            type="button"
            className={`segmented-btn ${viewMode === "grid" ? "active" : ""}`}
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            <Icon name="grid" size={16} /> Mes
          </button>
        </div>

        <span className="toolbar-spacer" />

        <button
          className="btn btn-secondary"
          onClick={() => setBankOpen((b) => !b)}
          aria-expanded={bankOpen}
          aria-label={`Banco de ideas, ${ideasBank.length} guardadas`}
          style={{ position: "relative" }}
        >
          <Icon name="bulb" size={18} />
          {ideasBank.length > 0 && (
            <span aria-hidden="true" style={{ position: "absolute", top: -5, right: -5, background: "var(--accent-alt)", color: "#1a1200", borderRadius: "var(--radius-pill)", minWidth: 18, height: 18, fontSize: "var(--fs-3xs)", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
              {ideasBank.length}
            </span>
          )}
        </button>

        <button className="btn btn-primary" onClick={sendToClient}>
          <Icon name="send" size={18} /> Enviar al cliente
        </button>

        <OverflowMenu
          items={[
            { icon: "pencil", label: "Editar calendario", onClick: () => {
              const cats = {};
              for (const day of cal.days || []) {
                if (!day.category) continue;
                const dow = new Date(day.date + "T12:00:00").getDay();
                if (!cats[dow]) cats[dow] = day.category;
              }
              setMetaForm({ name: cal.name || "", campaign: cal.campaign || "", weekConcepts: [...(cal.weekConcepts || [])], dayCategories: cats, offers: cal.offers || "", promoCode: cal.promoCode || "" });
              setEditMeta(true);
            } },
            { icon: "file", label: "Renombrar calendario", onClick: () => setRenaming(true) },
            { icon: "copy", label: "Duplicar calendario", onClick: () => onDuplicateCal(calId) },
            { sep: true },
            { icon: "download", label: "Exportar a HTML", onClick: exportHTML },
            { icon: "file", label: "Imprimir o guardar en PDF", onClick: exportPDF },
            { sep: true },
            { icon: "terminal", label: debugOpen ? "Ocultar diagnóstico" : "Ver diagnóstico", onClick: () => setDebugOpen((d) => !d) },
            { icon: "trash", label: "Eliminar calendario", danger: true, onClick: () => {
              if (window.confirm("¿Eliminar este calendario? Esta acción no se puede deshacer.")) onDeleteCal(calId);
            } },
          ].filter(Boolean)}
        />
      </div>

      {/* Generation progress */}
      {genLoading && genProgress > 0 && (
        <div style={{ marginBottom: "var(--sp-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginBottom: "var(--sp-1)" }}>
            <span id="gen-progress-label">{genStatus}</span>
            <span>{genProgress}%</span>
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-labelledby="gen-progress-label"
            aria-valuenow={genProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${genProgress}%` }} />
          </div>
        </div>
      )}

      {/* Anuncia el avance a lectores de pantalla sin robar el foco */}
      <div role="status" aria-live="polite" className="sr-only">{genLoading ? genStatus : ""}</div>

      {/* Debug panel */}
      {debugOpen && (
        <div style={{ background: "#080d16", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", marginBottom: "var(--sp-3)", maxHeight: 220, overflowY: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
            <h3 style={{ fontSize: "var(--fs-2xs)", color: "var(--success)", fontWeight: 700 }}>Registro de diagnóstico</h3>
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setDebugLog([])}>Limpiar</button>
          </div>
          {debugLog.length === 0 && <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>Sin registros. Genera contenido para ver el detalle.</p>}
          {debugLog.map((log, i) => (
            <p key={i} style={{ fontSize: "var(--fs-2xs)", lineHeight: 1.6, color: log.msg.startsWith("ERROR") ? "#FF8A85" : log.msg.startsWith("WARN") ? "#FFC166" : "var(--text-dim)", marginBottom: 2 }}>
              <span style={{ color: "var(--text-faint)" }}>[{log.time}]</span> {log.msg}
            </p>
          ))}
        </div>
      )}

      {/* Filters. Plegados por defecto: cuatro filas de chips empujaban la
          primera publicación fuera de la pantalla en móvil. Cada grupo es un
          role="group" con nombre y cada chip expone aria-pressed en lugar de
          depender sólo del color. */}
      <div className="filters-panel">
        <button
          type="button"
          className="filters-summary"
          aria-expanded={filtersOpen}
          aria-controls="panel-filtros"
          onClick={() => setFiltersOpen((f) => !f)}
        >
          <span>Filtros{activeFilterCount > 0 && <span className="sr-only">, {activeFilterCount} activos</span>}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            {activeFilterCount > 0 && <span className="filters-count" aria-hidden="true">{activeFilterCount}</span>}
            <Icon name={filtersOpen ? "chevronUp" : "chevronDown"} size={18} />
          </span>
        </button>

        {filtersOpen && (
          <div id="panel-filtros" className="filters-body">
      <div className="filter-bar" role="group" aria-label="Filtrar por estado">
        <span className="filter-bar-label" aria-hidden="true">Estado</span>
        <button className={`filter-chip ${filterStatus === "all" ? "active" : ""}`} aria-pressed={filterStatus === "all"} onClick={() => setFilterStatus("all")}>Todos</button>
        {Object.entries(STATUSES).map(([k, st]) => (
          <button key={k} className={`filter-chip ${filterStatus === k ? "active" : ""}`} aria-pressed={filterStatus === k} onClick={() => setFilterStatus(k)}>{st.label}</button>
        ))}
      </div>
      <div className="filter-bar" role="group" aria-label="Filtrar por formato">
        <span className="filter-bar-label" aria-hidden="true">Formato</span>
        <button className={`filter-chip ${filterFormat === "all" ? "active" : ""}`} aria-pressed={filterFormat === "all"} onClick={() => setFilterFormat("all")}>Todos</button>
        {Object.entries(FORMATS).map(([k, f]) => (
          <button key={k} className={`filter-chip ${filterFormat === k ? "active" : ""}`} aria-pressed={filterFormat === k} onClick={() => setFilterFormat(k)}>
            <Icon name={FORMAT_ICONS[k]} size={14} /> {f.label}
          </button>
        ))}
      </div>
      {weeks.length > 1 && (
        <div className="filter-bar" role="group" aria-label="Filtrar por semana">
          <span className="filter-bar-label" aria-hidden="true">Semana</span>
          <button className={`filter-chip ${filterWeek === "all" ? "active" : ""}`} aria-pressed={filterWeek === "all"} onClick={() => setFilterWeek("all")}>Todas</button>
          {weeks.map((w) => (
            <button key={w} className={`filter-chip ${filterWeek === String(w) ? "active" : ""}`} aria-pressed={filterWeek === String(w)} onClick={() => setFilterWeek(String(w))}>
              Semana {w}
            </button>
          ))}
        </div>
      )}
      <div className="filter-bar" role="group" aria-label="Filtrar por día de la semana">
        <span className="filter-bar-label" aria-hidden="true">Día</span>
        <button className={`filter-chip ${filterDOW === "all" ? "active" : ""}`} aria-pressed={filterDOW === "all"} onClick={() => setFilterDOW("all")}>Todos</button>
        {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
          <button key={dow} className={`filter-chip ${filterDOW === String(dow) ? "active" : ""}`} aria-pressed={filterDOW === String(dow)} onClick={() => setFilterDOW(String(dow))}>
            {DAYS[dow]}
          </button>
        ))}
      </div>

            {activeFilterCount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: "var(--sp-2)" }}
                onClick={() => { setFilterStatus("all"); setFilterFormat("all"); setFilterWeek("all"); setFilterDOW("all"); }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Counter */}
      {activeFilterCount > 0 && (
        <p role="status" aria-live="polite" style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", padding: "var(--sp-1) 0 var(--sp-2)" }}>
          Mostrando {filteredDays.reduce((a, d) => a + d.posts.length, 0)} de {totalPosts} publicaciones
        </p>
      )}

      {/* Incomplete posts warning */}
      {incompleteInfo && (
        <div className="notice notice-warn notice-action" role="alert">
          <span style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}><Icon name="alert" size={18} /> {incompleteInfo.count} publicaciones quedaron sin generar</span>
          <button className="btn btn-secondary btn-sm" onClick={retryIncomplete} disabled={genLoading}>
            Reintentar
          </button>
        </div>
      )}

      {/* Approval sync status */}
      {syncStatus && (
        <p role="status" aria-live="polite" className="notice notice-ok">
          {syncStatus}
        </p>
      )}

      {/* Calendar + Ideas Bank layout */}
      <div className={`cal-layout${bankOpen ? " bank-visible" : ""}`}>
      <div className="cal-layout-main">
      {/* Grid view */}
      {viewMode === "grid" ? (
        <MonthGrid
          cal={{ ...cal, days: filteredDays }}
          onPostClick={(post, day) => setSidePanel({ post, day })}
          onMove={movePost}
          onAddPost={(date) => setAddingPostDay(date)}
          onDropFromBank={moveBankToCalendar}
          ideasBank={ideasBank}
        />
      ) : (
        /* List view */
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredDays.map((day, dayIdx) => {
            const isExpanded = expandedDay === day.date;
            const prevDay = dayIdx > 0 ? filteredDays[dayIdx - 1] : null;
            const showWeekHeader = !prevDay || prevDay.weekNumber !== day.weekNumber;

            return (
              <div key={day.date}>
                {/* Week separator */}
                {showWeekHeader && day.weekNumber && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                    marginTop: dayIdx > 0 ? "var(--sp-4)" : 0,
                    paddingBottom: "var(--sp-2)",
                    borderBottom: "1px solid var(--border-soft)",
                  }}>
                    <span style={{ background: "var(--accent-soft)", color: "var(--accent)", padding: "var(--sp-1) var(--sp-3)", borderRadius: 20, fontSize: "var(--fs-2xs)", fontWeight: 700, flexShrink: 0 }}>
                      Semana {day.weekNumber}
                    </span>
                    {day.concept && <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", fontStyle: "italic" }}>{day.concept}</span>}
                  </div>
                )}

                <div className="card">
                  {/* Antes era un <div onClick>: no recibía foco ni respondía a
                      Enter/Espacio. Ahora es un botón con aria-expanded. */}
                  <button
                    type="button"
                    className="day-row"
                    aria-expanded={isExpanded}
                    aria-controls={`dia-${day.date}`}
                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                  >
                    <span className="day-date" style={{ background: client.primaryColor || "var(--accent)", color: "#fff" }}>
                      <span className="day-date-dow">{(day.dayName || "").slice(0, 3).toUpperCase()}</span>
                      <span className="day-date-num">{(day.date || "").split("-")[2]}</span>
                    </span>

                    <span className="day-info">
                      <span className="day-title">
                        {day.category || day.dayName}
                        {day.specialDate && <span style={{ color: "var(--accent-alt)", marginLeft: "var(--sp-2)", fontSize: "var(--fs-2xs)" }}>{day.specialDate}</span>}
                      </span>
                      {day.concept && <span className="day-concept">{day.concept}</span>}
                    </span>

                    {/* En pantalla ancha estos chips se van a la derecha y
                        llenan el hueco que dejaba la fila. */}
                    <span className="day-chips">
                      {(day.posts || []).length === 0 ? (
                        <span className="day-empty">Sin publicaciones</span>
                      ) : (
                        (day.posts || []).map((p) => {
                          const f = FORMATS[p.format] || FORMATS.post;
                          const st = STATUSES[p.status || "pending"];
                          return (
                            <span
                              key={p.id}
                              className="badge"
                              style={{ background: f.color + "1F", color: f.color, border: `1px solid ${f.color}55` }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.text, flexShrink: 0 }} aria-hidden="true" />
                              <Icon name={FORMAT_ICONS[p.format] || "formatPost"} size={13} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.idea || p.category || f.label}
                              </span>
                            </span>
                          );
                        })
                      )}
                    </span>

                    <Icon name={isExpanded ? "chevronUp" : "chevronDown"} size={18} style={{ color: "var(--text-faint)" }} />
                  </button>
                  {isExpanded && (
                    <div id={`dia-${day.date}`} style={{ padding: "0 var(--sp-3) var(--sp-3)", borderTop: "1px solid var(--border)" }}>
                      {(day.posts || []).map((post) => {
                        const f = FORMATS[post.format] || FORMATS.post;
                        const st = STATUSES[post.status || "pending"];
                        const isPublished = post.status === "published";
                        const postTitle = post.idea || post.category || f.label;
                        return (
                          <article
                            key={post.id}
                            aria-label={`${f.label}: ${postTitle}`}
                            style={{
                              background: isPublished ? st.bg : "var(--bg)",
                              borderRadius: "var(--radius-sm)",
                              marginTop: "var(--sp-3)",
                              border: isPublished ? `2px solid ${st.border}` : `1px solid ${st.border}66`,
                              padding: "var(--sp-3)",
                            }}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ postId: post.id, sourceDate: day.date }))}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)", flexWrap: "wrap" }}>
                              <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={18} style={{ color: f.color }} />
                              <span className="badge" style={{ background: f.color + "22", color: f.color }}>{f.label}</span>
                              <span className="badge" style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>{st.label}</span>
                              {post.publishTime && (
                                <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
                                  <Icon name="clock" size={14} /> {post.publishTime}
                                </span>
                              )}
                            </div>

                            {post.category && <p style={{ fontSize: "var(--fs-2xs)", color: "var(--accent-alt)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>{post.category}</p>}
                            {post.image && !post.idea && !post.guion && !post.descripcion && !post.script && (
                              <span className="badge" style={{ background: "#2a1a0a", color: "var(--accent-alt)", border: "1px solid var(--alt-line)" }}>Solo imagen</span>
                            )}
                            {post.idea && <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", lineHeight: "var(--lh-normal)", marginBottom: "var(--sp-1)" }}>{post.idea}</p>}

                            <ContentDisplay post={post} />
                            {post.image && <img src={post.image} alt="" style={{ width: 68, height: 68, objectFit: "cover", borderRadius: "var(--radius-xs)", marginTop: "var(--sp-2)" }} />}

                            {!post.guion && !post.descripcion && !post.script && (
                              <button
                                type="button"
                                className="btn-ai"
                                style={{ marginTop: "var(--sp-2)" }}
                                onClick={() => generateSinglePostContent(post, day)}
                                disabled={genSingleLoading[post.id]}
                              >
                                {genSingleLoading[post.id] ? "Generando…" : <><Icon name="sparkles" size={14} /> Generar con IA</>}
                              </button>
                            )}

                            {/* Acciones explícitas. Antes toda la tarjeta era un
                                div con onClick: no era alcanzable por teclado y
                                el botón de borrar quedaba anidado dentro. */}
                            <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ flex: 1 }}
                                onClick={() => setSidePanel({ post, day })}
                              >
                                Editar publicación
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-label="Enviar al banco de ideas"
                                onClick={() => { addToBank(post, day.date); removePostFromDay(day.date, post.id); }}
                              >
                                <Icon name="bulb" size={16} />
                              </button>
                              <button
                                type="button"
                                className="btn-remove"
                                aria-label={`Eliminar publicación: ${postTitle}`}
                                onClick={() => deletePost(day.date, post.id)}
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {/* Add post button */}
                      {addingPostDay === day.date ? (
                        <AddPostInline
                          onAdd={(format, idea) => addPost(day.date, format, idea)}
                          onCancel={() => setAddingPostDay(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="btn-dashed"
                          style={{ marginTop: "var(--sp-2)" }}
                          onClick={() => setAddingPostDay(day.date)}
                        >
                          + Agregar publicación
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add post inline for grid view */}
      {addingPostDay && viewMode === "grid" && (
        <AddPostDialog
          date={addingPostDay}
          onAdd={(format, idea) => addPost(addingPostDay, format, idea)}
          onClose={() => setAddingPostDay(null)}
        />
      )}
      </div>{/* end cal-layout-main */}

      {/* Ideas Bank side panel */}
      {bankOpen && (
        <BankPanel
          client={client}
          onUpdateClient={onUpdateClient}
          calDays={cal.days}
          onRemoveFromCal={removePostFromDay}
          onClose={() => setBankOpen(false)}
          cal={cal}
          calId={calId}
          onUpdateCal={onUpdateCal}
          onMoveBankToCal={onMoveBankToCal}
        />
      )}
      </div>{/* end cal-layout */}

      {/* Approval link modal */}
      {approvalModal && (
        <ApprovalDialog
          hasLink={!!cal.shareToken}
          shareEnabled={cal.shareEnabled !== false}
          working={shareWorking}
          approvalUrl={approvalUrl}
          whatsappMessage={`Hola${client.name ? " " + client.name : ""}, aquí está el calendario de ${calName} para tu revisión:\n${approvalUrl}\nPuedes aprobar o pedir cambios directamente desde tu celular 📱`}
          onGenerate={sendToClient}
          onRevoke={() => changeShare(false)}
          onReopen={() => changeShare(true)}
          onClose={() => setApprovalModal(false)}
        />
      )}

      {/* Side panel */}
      {sidePanel && (
        <>
          <button
            type="button"
            aria-label="Cerrar panel de edición"
            onClick={() => setSidePanel(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 240, border: "none", cursor: "pointer" }}
          />
          <PostSidePanel
            post={sidePanel.post}
            day={sidePanel.day}
            onUpdate={updatePost}
            onDelete={deletePost}
            onMoveDate={movePost}
            onSendToBank={(post, date) => { addToBank(post, date); removePostFromDay(date, post.id); }}
            onClose={() => setSidePanel(null)}
            client={client}
            cal={cal}
          />
        </>
      )}
    </div>
  );
}
