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
import { fieldHeaderStyle, stripMarkdown } from "./formato";
import { leerHoraEscrita, partesDeHora, hora12 } from "../../lib/horas";

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

/** Atajos de la hora: las que más se usan para publicar. */
const ATAJOS_HORA = ["09:00", "12:00", "18:00", "20:00"];

/**
 * La hora de publicación: se toca y se escribe. Antes era un botón que
 * abría un desplegable de flechas y dieciséis botones, que se salía de su
 * caja en el panel estrecho y obligaba a subir de cinco en cinco minutos.
 * Ahora: «9», «930», «21:30» o «9:30 pm», con a. m. / p. m. al lado y unos
 * atajos debajo. Lo que no se entiende no se guarda: se dice.
 */
export function TimePicker({ value, onChange, id, atajos = true }) {
  const actual = partesDeHora(value);
  const [editando, setEditando] = useState(null);
  const [periodoSinHora, setPeriodoSinHora] = useState("am");
  const [malo, setMalo] = useState(false);
  const periodo = actual.periodo ?? periodoSinHora;
  const ayuda = `${id}-ayuda`;

  const confirmar = (texto = editando) => {
    setEditando(null);
    if (texto === null) return;
    if (!texto.trim()) { setMalo(false); if (value) onChange(""); return; }
    const hhmm = leerHoraEscrita(texto, periodo);
    setMalo(!hhmm);
    if (hhmm && hhmm !== value) onChange(hhmm);
  };

  const cambiarPeriodo = (p) => {
    if (!value) { setPeriodoSinHora(p); return; }
    if (p === actual.periodo) return;
    const [h, m] = value.split(":").map(Number);
    onChange(`${String((h + 12) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  return (
    <div className="campo-hora">
      <div className="campo-hora-fila">
        <div className={`campo-hora-caja${malo ? " es-malo" : ""}`}>
          <Icon name="clock" size={16} />
          <input
            id={id}
            className="campo-hora-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="9:00"
            value={editando ?? actual.texto}
            aria-describedby={ayuda}
            aria-invalid={malo || undefined}
            onFocus={(e) => { setEditando(actual.texto); e.target.select(); }}
            onChange={(e) => setEditando(e.target.value)}
            onBlur={() => confirmar()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === "Escape") { setEditando(null); setMalo(false); }
            }}
          />
        </div>
        <div className="campo-hora-periodo" role="group" aria-label="Mañana o tarde">
          {[["am", "a. m."], ["pm", "p. m."]].map(([p, t]) => (
            <button key={p} type="button" aria-pressed={periodo === p} onClick={() => cambiarPeriodo(p)}>{t}</button>
          ))}
        </div>
      </div>
      <p id={ayuda} className={malo ? "campo-hora-error" : "sr-only"} role={malo ? "alert" : undefined}>
        {malo ? "No entiendo esa hora: escribe 9, 9:30 o 21:30." : "Escribe la hora: 9, 930, 9:30 o 21:30."}
      </p>
      {atajos && (
        <div className="campo-hora-atajos" role="group" aria-label="Horas frecuentes">
          {ATAJOS_HORA.map((h) => (
            <button key={h} type="button" className="filter-chip" aria-pressed={value === h} onClick={() => { setMalo(false); onChange(h); }}>
              {hora12(h).replace(" AM", " a. m.").replace(" PM", " p. m.")}
            </button>
          ))}
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
