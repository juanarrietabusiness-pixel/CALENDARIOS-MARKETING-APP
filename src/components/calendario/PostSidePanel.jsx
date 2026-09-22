// ============================================================
// El panel lateral de una publicación
//
// GUARDA AL DESMONTAR, NO AL PULSAR CERRAR. El fondo oscuro y la tecla
// Escape llaman a `onClose` a secas: con el guardado colgado sólo del
// botón, todo lo editado —y todo lo que acababa de generar la IA— se
// perdía sin decir nada. Los tres botones que sacan la publicación de
// su sitio (borrar, mover, banco) levantan `yaEscrito` antes de
// reescribir el calendario ellos mismos.
// ============================================================

import { useEffect, useId, useState, useRef } from "react";
import { FORMATS, FORMAT_ICONS, STATUSES } from "../../constants";
import { compressImage, parseVideoURL } from "../../utils";
import { generateFieldForPost } from "../../api";
import { generateImage, feedbackImage, loadImageTemplates } from "../../lib/db";
import { vivo } from "../../lib/vivo";

import { useDialogA11y } from "../../hooks/useDialogA11y";
import { AvisoEditando } from "../Presencia";
import Icon from "../Icon";
import { CopyButton, TimePicker } from "./primitivas";
import { fieldHeaderStyle } from "./formato";

export function PostSidePanel({ post, day, onUpdate, onClose, onDelete, onMoveDate, onSendToBank, suggestion, onAcceptSuggestion, onRejectSuggestion, client, cal, editandoOtros = {} }) {
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

  // ---- Por qué se guarda al desmontar ----
  //
  // Antes sólo guardaba el botón de cerrar. El fondo oscuro y la tecla
  // Escape llamaban a `onClose` a secas, así que todo lo escrito en el
  // panel —y todo lo que acababa de generar la IA— se perdía sin decir
  // nada. Se veía como «la generación con IA no funciona»: el texto
  // llegaba bien, se pintaba en el campo, y desaparecía al cerrar.
  //
  // Guardar al desmontar cubre las tres salidas a la vez. `updatePost`
  // busca la publicación por id en todo el calendario, así que si se
  // acaba de borrar no encuentra nada y no la resucita, y si se acaba de
  // mover la actualiza ya en su fecha nueva.
  const ultimo = useRef(form);
  ultimo.current = form;
  const guardarRef = useRef(onUpdate);
  guardarRef.current = onUpdate;
  const fechaRef = useRef(day.date);
  fechaRef.current = day.date;
  // Borrar, mover y mandar al banco reescriben el calendario ellos mismos y
  // luego cierran. El guardado del desmonte llegaría con el calendario de
  // antes de esa reescritura y la desharía: devolvería la publicación
  // borrada a su día, o la traería de vuelta de la fecha nueva.
  const yaEscrito = useRef(false);
  useEffect(() => () => {
    if (yaEscrito.current) return;
    guardarRef.current?.(fechaRef.current, ultimo.current);
  }, []);

  // ---- «Estoy editando esta publicación» ----
  //
  // Se anuncia al abrir y se retira al cerrar, en el mismo efecto: si el
  // aviso se quedara puesto, el resto del equipo vería para siempre que
  // alguien está dentro de una publicación que nadie tiene abierta.
  //
  // No bloquea nada, y es a propósito: un bloqueo de verdad hay que
  // soltarlo bien en TODOS los caminos —cerrar la pestaña, quedarse sin
  // batería— y su forma de fallar es dejar una publicación trabada sin
  // nadie dentro. Avisar no puede atascarse.
  useEffect(() => {
    vivo.editar(cal.id, post.id, true);
    return () => vivo.editar(cal.id, post.id, false);
  }, [cal.id, post.id]);

  const otroEditando = editandoOtros[post.id] ?? null;

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

  const [imgGenOpen, setImgGenOpen] = useState(false);
  const [imgGenFormat, setImgGenFormat] = useState("square");
  const [imgGenTemplateId, setImgGenTemplateId] = useState("");
  const [imgGenLoading, setImgGenLoading] = useState(false);
  const [imgGenPreview, setImgGenPreview] = useState(null);
  const [imgGenKey, setImgGenKey] = useState(null);
  const [imgTemplates, setImgTemplates] = useState([]);

  useEffect(() => {
    if (imgGenOpen && client?.dbId) {
      loadImageTemplates(client.dbId).then(setImgTemplates).catch(() => {});
    }
  }, [imgGenOpen, client?.dbId]);

  const handleGenerateImage = async () => {
    setImgGenLoading(true);
    setFieldError("");
    try {
      const result = await generateImage({
        clientId: client.dbId,
        idea: form.idea,
        descripcion: form.descripcion || form.script,
        guion: form.guion,
        format: form.format,
        category: form.category,
        title: form.title,
        imageFormat: imgGenFormat,
        templateId: imgGenTemplateId || undefined,
      });
      setImgGenPreview(`/api/media/${result.clave}`);
      setImgGenKey(result.clave);
    } catch (e) {
      setFieldError(`No se pudo generar la imagen: ${e.message}`);
    }
    setImgGenLoading(false);
  };

  const handleImageFeedback = async (liked) => {
    if (!imgGenKey) return;
    try {
      await feedbackImage(client.dbId, imgGenKey, liked);
    } catch { /* no bloquear el flujo */ }
    if (liked) {
      sf("image", `/api/media/${imgGenKey}`);
    }
    setImgGenPreview(null);
    setImgGenKey(null);
    setImgGenOpen(false);
  };

  const IMAGE_FORMATS = [
    ["square", "1080×1080"],
    ["vertical", "1080×1350"],
    ["story", "1080×1920"],
    ["horizontal", "1200×630"],
  ];

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
            {otroEditando && (
              <p role="status" style={{ marginTop: 4 }}>
                <AvisoEditando persona={otroEditando} />
              </p>
            )}
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
          <label className="label" htmlFor={`${ids}-title`}>Título</label>
          <input id={`${ids}-title`} className="input" value={form.title || ""} onChange={(e) => sf("title", e.target.value)} placeholder="Nombre corto de la publicación" />
        </div>

        <div className="field">
          <div style={fieldHeaderStyle}>
            <label className="label" style={{ margin: 0 }} htmlFor={`${ids}-idea`}>Idea / Brief</label>
            <AiButton field="idea" label="la idea" />
          </div>
          <textarea id={`${ids}-idea`} className="textarea" value={form.idea || ""} onChange={(e) => sf("idea", e.target.value)} placeholder="Explicación o prompt para la generación con IA…" />
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

        {suggestion && (suggestion.guion || suggestion.descripcion) && (
          <div style={{
            padding: "var(--sp-3)", background: "var(--surface)", borderRadius: "var(--radius-sm)",
            border: "1px solid var(--accent-alt)", marginBottom: "var(--sp-3)",
          }}>
            <p style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--accent-alt)", marginBottom: "var(--sp-2)" }}>
              <Icon name="message" size={16} /> Sugerencias del cliente
            </p>
            {suggestion.comentario && (
              <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", marginBottom: "var(--sp-2)", fontStyle: "italic" }}>
                &ldquo;{suggestion.comentario}&rdquo;
              </p>
            )}
            {suggestion.guion && (
              <div style={{ marginBottom: "var(--sp-2)" }}>
                <p style={{ fontSize: "var(--fs-3xs)", fontWeight: 600, color: "#FF7BA8", marginBottom: 2 }}>Guion sugerido:</p>
                <p style={{ fontSize: "var(--fs-2xs)", whiteSpace: "pre-wrap", background: "var(--bg)", padding: "var(--sp-2)", borderRadius: "var(--radius-xs)" }}>{suggestion.guion}</p>
                <div style={{ display: "flex", gap: "var(--sp-1)", marginTop: "var(--sp-1)" }}>
                  <button className="btn btn-primary btn-sm" style={{ fontSize: "var(--fs-3xs)" }} onClick={() => { sf("guion", suggestion.guion); onAcceptSuggestion?.(post.id, "guion", suggestion.guion); }}>
                    <Icon name="check" size={14} /> Aceptar
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: "var(--fs-3xs)", color: "var(--danger)" }} onClick={() => onRejectSuggestion?.(post.id, "guion")}>
                    <Icon name="close" size={14} /> Rechazar
                  </button>
                </div>
              </div>
            )}
            {suggestion.descripcion && (
              <div>
                <p style={{ fontSize: "var(--fs-3xs)", fontWeight: 600, color: "var(--accent)", marginBottom: 2 }}>Descripción sugerida:</p>
                <p style={{ fontSize: "var(--fs-2xs)", whiteSpace: "pre-wrap", background: "var(--bg)", padding: "var(--sp-2)", borderRadius: "var(--radius-xs)" }}>{suggestion.descripcion}</p>
                <div style={{ display: "flex", gap: "var(--sp-1)", marginTop: "var(--sp-1)" }}>
                  <button className="btn btn-primary btn-sm" style={{ fontSize: "var(--fs-3xs)" }} onClick={() => { sf("descripcion", suggestion.descripcion); onAcceptSuggestion?.(post.id, "descripcion", suggestion.descripcion); }}>
                    <Icon name="check" size={14} /> Aceptar
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: "var(--fs-3xs)", color: "var(--danger)" }} onClick={() => onRejectSuggestion?.(post.id, "descripcion")}>
                    <Icon name="close" size={14} /> Rechazar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
            <button
              className="btn-ai"
              onClick={() => setImgGenOpen((o) => !o)}
              aria-expanded={imgGenOpen}
              aria-label="Generar imagen con IA"
            >
              <Icon name="imageAi" size={14} /> Generar
            </button>
            {form.image && (
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => sf("image", null)}>
                Quitar
              </button>
            )}
          </div>

          {imgGenOpen && (
            <div style={{
              marginTop: "var(--sp-3)", padding: "var(--sp-3)",
              background: "var(--surface)", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                <fieldset style={{ border: "none" }}>
                  <legend className="label" style={{ marginBottom: "var(--sp-1)" }}>Formato de imagen</legend>
                  <div style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap" }}>
                    {IMAGE_FORMATS.map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        className="filter-chip"
                        aria-pressed={imgGenFormat === k}
                        onClick={() => setImgGenFormat(k)}
                        style={{
                          background: imgGenFormat === k ? "var(--accent-soft)" : "var(--bg)",
                          borderColor: imgGenFormat === k ? "var(--accent)" : "var(--border)",
                          color: imgGenFormat === k ? "var(--accent)" : "var(--text-muted)",
                          fontWeight: imgGenFormat === k ? 700 : 500,
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {imgTemplates.length > 0 && (
                  <div>
                    <label className="label" htmlFor={`${ids}-img-tpl`}>Plantilla visual</label>
                    <select
                      id={`${ids}-img-tpl`}
                      className="input"
                      value={imgGenTemplateId}
                      onChange={(e) => setImgGenTemplateId(e.target.value)}
                    >
                      <option value="">Sin plantilla</option>
                      {imgTemplates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {imgGenPreview ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                    <img
                      src={imgGenPreview}
                      alt="Imagen generada por IA"
                      style={{
                        width: "100%", maxHeight: 300, objectFit: "contain",
                        borderRadius: "var(--radius-sm)", background: "var(--bg)",
                      }}
                    />
                    <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "center" }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleImageFeedback(true)}
                        aria-label="Me gusta, usar como imagen y guardar como referencia"
                      >
                        <Icon name="thumbsUp" size={16} /> Usar y guardar
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { sf("image", imgGenPreview); setImgGenPreview(null); setImgGenKey(null); setImgGenOpen(false); }}
                        aria-label="Usar esta imagen sin guardar como referencia"
                      >
                        Solo usar
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--danger)" }}
                        onClick={() => handleImageFeedback(false)}
                        aria-label="No me gusta, descartar imagen"
                      >
                        <Icon name="thumbsDown" size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={handleGenerateImage}
                    disabled={imgGenLoading}
                  >
                    {imgGenLoading ? (
                      <>Generando imagen…</>
                    ) : (
                      <><Icon name="sparkles" size={16} /> Generar imagen con IA</>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
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
            <button className="btn btn-primary btn-sm" disabled={!moveTarget || moveTarget === day.date} onClick={() => { save(); yaEscrito.current = true; onMoveDate?.(post.id, day.date, moveTarget); onClose(); }}>
              Mover
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setMoveDateOpen(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          {/* Se guarda antes de preguntar: si se cancela el borrado, el
              panel se cierra igual y lo editado no se pierde. */}
          <button
            className="btn btn-danger"
            aria-label="Eliminar publicación"
            onClick={() => { save(); yaEscrito.current = true; if (onDelete) onDelete(day.date, post.id); onClose(); }}
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
            onClick={() => { save(); yaEscrito.current = true; onSendToBank?.(form, day.date); onClose(); }}
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

/**
 * Diálogo de exportación del contenido del calendario.
 *
 * Enseña el texto antes de sacarlo, que es lo que faltaba: el exportador
 * anterior descargaba un .txt a ciegas y había que abrirlo para descubrir
 * que estaba casi vacío. Aquí se ve lo que hay, se dice qué quedó fuera y
 * por qué, y se puede copiar sin pasar por un archivo.
 */
