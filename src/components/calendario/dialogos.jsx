// ============================================================
// Los diálogos del calendario
//
// Todos se montan dentro de `.overlay`, que bloquea el scroll del
// fondo y atrapa el foco con `useDialogA11y`. Quién queda delante lo
// decide la escala `--z-*` de index.css, no el orden en el DOM.
//
// Y sólo hay uno abierto a la vez: `CalendarView` los gobierna con un
// único estado `capa`, no con una bandera por diálogo.
// ============================================================

import { useId, useState, useRef } from "react";
import { FORMATS, FORMAT_ICONS, DAYS } from "../../constants";
import { uid, compressImage } from "../../utils";
import { CAMPOS_EXPORTABLES } from "../../lib/exportarContenido";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import Icon from "../Icon";
import SelectorFecha from "../SelectorFecha";

const CAMPOS_LABELS = { idea: "Ideas", guion: "Guiones", descripcion: "Descripciones", hashtags: "Hashtags" };

export function ExportContenidoDialog({ exportacion, formatos, onToggleFormato, campos, onToggleCampo, onCopiar, copiado, onDescargar, onClose }) {
  const ids = useId();
  const dialogRef = useDialogA11y(onClose);
  const { texto, completas, incompletas } = exportacion;

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

export function AddPostInline({ onAdd, onCancel }) {
  const [format, setFormat] = useState("post");
  const [title, setTitle] = useState("");
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
        <label className="label" htmlFor={`${ids}-title`}>Título</label>
        <input
          id={`${ids}-title`}
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nombre corto de la publicación"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && title) onAdd(format, idea, title); }}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor={`${ids}-idea`}>Idea / Brief</label>
        <input
          id={`${ids}-idea`}
          className="input"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Explicación o prompt para IA (opcional)"
          onKeyDown={(e) => { if (e.key === "Enter" && title) onAdd(format, idea, title); }}
        />
      </div>

      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={!title} onClick={() => { if (title) onAdd(format, idea, title); }}>
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

const REF_FORMATS = [
  { key: "post", label: "Post", icon: "formatPost", color: "#4DA3FF" },
  { key: "carrusel", label: "Carrusel", icon: "formatCarrusel", color: "#FFA53D" },
  { key: "video", label: "Reel / Video", icon: "formatReel", color: "#FF6392" },
];

export function VisualRefSection({ formatKey, label, icon, color, refs, onAdd, onRemove, onAddLink, ids }) {
  const inputRef = useRef(null);
  const [linkUrl, setLinkUrl] = useState("");
  const isVideo = formatKey === "video";
  const items = refs.filter((r) => r.format === formatKey);

  return (
    <div style={{ marginBottom: "var(--sp-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
        <Icon name={icon} size={18} style={{ color }} />
        <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color }}>{label}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        aria-label={`Subir referencias de ${label}`}
        onChange={(e) => {
          for (const file of e.target.files) onAdd(file, formatKey);
          e.target.value = "";
        }}
      />
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-2)" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" size={14} /> Subir archivos
        </button>
      </div>
      {isVideo && (
        <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-2)", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="label" style={{ textTransform: "none", color: "var(--text-dim)" }} htmlFor={`${ids}-vlink-${formatKey}`}>
              Pegar enlace de video
            </label>
            <input
              id={`${ids}-vlink-${formatKey}`}
              className="input"
              style={{ fontSize: "var(--fs-2xs)" }}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://youtube.com/… o https://instagram.com/reel/…"
            />
          </div>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            disabled={!linkUrl.trim()}
            onClick={() => {
              onAddLink(linkUrl.trim(), formatKey);
              setLinkUrl("");
            }}
          >
            <Icon name="link" size={14} /> Agregar
          </button>
        </div>
      )}
      {items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "var(--sp-2)" }}>
          {items.map((vr) => (
            <div key={vr.id} style={{ position: "relative" }}>
              {vr.type === "link" ? (
                <a href={vr.url} target="_blank" rel="noopener noreferrer" style={{ width: "100%", aspectRatio: "1", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", textDecoration: "none", padding: "var(--sp-2)" }}>
                  <Icon name="link" size={24} style={{ color: "var(--accent)", marginBottom: "var(--sp-1)" }} />
                  <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", wordBreak: "break-all", textAlign: "center", lineHeight: 1.2 }}>{vr.name || vr.url}</span>
                </a>
              ) : (
                <img
                  src={vr.url}
                  alt={vr.name || "Referencia visual"}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                />
              )}
              <button
                type="button"
                className="btn-icon"
                aria-label={`Quitar referencia ${vr.name || ""}`}
                onClick={() => onRemove(vr.id)}
                style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,.6)", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {items.length === 0 && (
        <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", fontStyle: "italic" }}>Sin referencias</p>
      )}
    </div>
  );
}

export function EditMetaDialog({ metaForm, setMetaForm, onSave, onClose }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [activeTab, setActiveTab] = useState("general");

  const addVisualRef = async (file, format) => {
    try {
      const dataUrl = await compressImage(file, 600);
      setMetaForm((p) => ({
        ...p,
        visualReferences: [...(p.visualReferences || []), { id: uid(), url: dataUrl, name: file.name, format: format || "post" }],
      }));
    } catch (e) {
      console.error("No se pudo comprimir la imagen:", e);
    }
  };

  const addVisualLink = (url, format) => {
    const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    setMetaForm((p) => ({
      ...p,
      visualReferences: [...(p.visualReferences || []), { id: uid(), url, name: hostname, format, type: "link" }],
    }));
  };

  const removeVisualRef = (refId) => {
    setMetaForm((p) => ({
      ...p,
      visualReferences: (p.visualReferences || []).filter((r) => r.id !== refId),
    }));
  };

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 560 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Editar calendario</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <div className="segmented" role="group" aria-label="Sección de edición" style={{ margin: "0 var(--sp-4)", marginBottom: "var(--sp-2)", flexWrap: "wrap" }}>
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
          <button type="button" className={`segmented-btn ${activeTab === "visuals" ? "active" : ""}`} aria-pressed={activeTab === "visuals"} onClick={() => setActiveTab("visuals")}>
            Ref. Visuales
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

          {activeTab === "visuals" && (
            <fieldset style={{ border: "none" }}>
              <legend className="label">Referencias visuales por formato</legend>
              <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
                Sube imágenes de referencia organizadas por formato para que el cliente vea
                el estilo de cada tipo de contenido. En video también puedes pegar enlaces.
              </p>
              {REF_FORMATS.map((rf) => (
                <VisualRefSection
                  key={rf.key}
                  formatKey={rf.key}
                  label={rf.label}
                  icon={rf.icon}
                  color={rf.color}
                  refs={metaForm.visualReferences || []}
                  onAdd={addVisualRef}
                  onRemove={removeVisualRef}
                  onAddLink={addVisualLink}
                  ids={ids}
                />
              ))}
            </fieldset>
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

export function ApprovalDialog({
  approvalUrl, whatsappMessage, onClose, onGenerate, onRevoke, onReopen,
  hasLink, shareEnabled, working, allowEditing, onToggleEditing,
  opciones = {}, onCambiarOpciones, revisionEnviada = null, revisionRevisor = "",
}) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [copied, setCopied] = useState("");
  const [mensaje, setMensaje] = useState(opciones.mensajeCliente ?? "");

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

            <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
              Las respuestas de tu cliente aparecen aquí al instante, sin recargar.
            </p>

            <div className="interruptor-fila">
              <div>
                <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>Permitir edición</span>
                <p className="hint" style={{ margin: 0 }}>El cliente puede sugerir cambios a la descripción y guion.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowEditing}
                className={`toggle${allowEditing ? " is-on" : ""}`}
                onClick={onToggleEditing}
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            {/* Lo que ve el cliente en la portada de su página: la fecha
                para revisar y un mensaje de la agencia. */}
            <div className="field">
              <span className="label" id={`${ids}-limite`}>Revisar antes del</span>
              <SelectorFecha
                value={opciones.fechaLimite || null}
                onChange={(f) => onCambiarOpciones?.({ fechaLimite: f || "" })}
                etiqueta="Fecha límite para que el cliente revise"
                vacio="Sin fecha límite"
                prefijo="Antes del"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-mensaje`}>Mensaje para el cliente</label>
              <textarea
                id={`${ids}-mensaje`}
                className="textarea"
                style={{ minHeight: 72 }}
                value={mensaje}
                maxLength={2000}
                onChange={(e) => setMensaje(e.target.value)}
                onBlur={() => mensaje !== (opciones.mensajeCliente ?? "") && onCambiarOpciones?.({ mensajeCliente: mensaje })}
                placeholder="Ej.: ¡Hola! Aquí está el contenido de octubre. Cualquier cambio, pídelo en cada publicación."
              />
              <p className="hint">Sale en la portada de su página.</p>
            </div>

            <div className="interruptor-fila">
              <div>
                <span id={`${ids}-auto`} style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>Programar al aprobar</span>
                <p className="hint" style={{ margin: 0 }}>
                  Cuando el cliente aprueba una publicación que ya tiene fecha, hora y medios, se programa sola en las
                  redes conectadas del cliente.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-labelledby={`${ids}-auto`}
                aria-checked={!!opciones.programarAlAprobar}
                className={`toggle${opciones.programarAlAprobar ? " is-on" : ""}`}
                onClick={() => onCambiarOpciones?.({ programarAlAprobar: !opciones.programarAlAprobar })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>

            {revisionEnviada && (
              <p className="notice notice-ok" style={{ display: "block" }}>
                {revisionRevisor || "El cliente"} envió su revisión el{" "}
                {new Date(revisionEnviada).toLocaleString("es-PA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.
              </p>
            )}

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

export function AddPostDialog({ date, onAdd, onClose }) {
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

