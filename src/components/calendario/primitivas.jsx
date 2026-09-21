// ============================================================
// Piezas sueltas del calendario
//
// Salieron de `CalendarView.jsx`, que tenía 3.034 líneas y diecisiete
// componentes dentro. Un fichero así no se navega: se busca dentro. Y
// mientras todo vive en el mismo ámbito, nada obliga a declarar qué
// necesita cada pieza —cualquiera alcanza cualquier cosa—, que es
// justo lo que convierte un componente en algo imposible de mover.
//
// Aquí van las que no saben nada del calendario: copian un texto,
// eligen una hora, pintan contenido, despliegan un menú.
// ============================================================

import { useEffect, useState, useRef } from "react";
import Icon from "../Icon";
import { fieldHeaderStyle, fmt12h, stripMarkdown } from "./formato";

export function CopyButton({ text, label, describes }) {
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

export function TimePicker({ value, onChange, id }) {
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
        aria-haspopup="true"
        style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", cursor: "pointer", minWidth: 120 }}
      >
        <Icon name="clock" size={16} />
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {fmt12h(value)}
        </span>
      </button>
      {open && (
        // Se anuncia como grupo, no como diálogo. Esto es un desplegable
        // anclado al botón, no un modal: llamarlo diálogo le promete a un
        // lector de pantalla un foco atrapado y un fondo inerte que aquí
        // no existen —ni deben—. Se cierra con Escape y con un clic
        // fuera, y el fondo sigue siendo navegable a propósito.
        <div
          role="group"
          aria-label="Seleccionar hora"
          className="time-picker-drop"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", justifyContent: "center", marginBottom: "var(--sp-3)" }}>
            <div className="time-picker-col">
              <button type="button" className="time-picker-arrow" aria-label="Hora anterior" onClick={() => setTime((+hour + 23) % 24, +minute || 0)}>
                <Icon name="chevronUp" size={18} />
              </button>
              <span className="time-picker-digit">{hour ? (hour === "00" ? "12" : +hour > 12 ? String(+hour - 12) : hour.replace(/^0/, "")) : "--"}</span>
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
            <span className="time-picker-sep" style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--text-muted)" }}>
              {hour && +hour >= 12 ? "PM" : "AM"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: "var(--sp-2)" }}>
            {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((h) => {
              const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
              const sfx = h >= 12 ? "PM" : "AM";
              return (
                <button
                  key={h}
                  type="button"
                  className={`time-picker-preset${+hour === h ? " active" : ""}`}
                  onClick={() => { setTime(h, +minute || 0); }}
                >
                  {h12} {sfx}
                </button>
              );
            })}
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

export function ContentDisplay({ post }) {
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

export function OverflowMenu({ items }) {
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
