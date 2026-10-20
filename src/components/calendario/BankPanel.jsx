// ============================================================
// El banco de ideas (UNO para la agencia: lib/bancoIdeas.js)
//
// Publicaciones guardadas fuera del calendario, para reutilizarlas, y
// REFERENCIAS: el enlace de un video que se quiere versionar. Cada una con su
// empresa o general (sale en el banco de todos los clientes). La
// clave de sus imágenes en R2 lleva el prefijo `clientes/`: sin él no
// las sirve nadie y el fallo es mudo —la fila está, el objeto está, y
// la imagen no carga—.
// ============================================================

import { useId, useRef, useState } from "react";
import { FORMATS, FORMAT_ICONS } from "../../constants";
import { uid, compressImage } from "../../utils";
import { generateFieldForPost } from "../../api";
import Icon from "../Icon";
import { TimePicker } from "./primitivas";
import { nombreDelDia } from "../../lib/meses";
import { abrirGuardarReferencia } from "../../lib/bancoIdeasApi";
import { VISTAS_BANCO, PLATAFORMAS, filtrarBanco, nuevaIdea, esReferencia, plataformaDe, tituloDeIdea } from "../../lib/bancoIdeas";

/**
 * Los días a los que se puede llevar una idea: TODOS los del mes, tengan
 * publicaciones o no. `calDays` sólo trae los días con algo dentro (el
 * calendario es siempre activo), así que un día vacío no salía en la lista.
 */
function diasDelMes(cal, calDays) {
  if (!Number.isInteger(cal?.month) || !cal?.year) return (calDays ?? []).map((d) => ({ date: d.date, nombre: d.dayName }));
  const total = new Date(Date.UTC(cal.year, cal.month + 1, 0)).getUTCDate();
  const mm = String(cal.month + 1).padStart(2, "0");
  return Array.from({ length: total }, (_, i) => {
    const date = `${cal.year}-${mm}-${String(i + 1).padStart(2, "0")}`;
    return { date, nombre: nombreDelDia(date) };
  });
}

/**
 * El banco de ideas ÚNICO de la agencia, visto desde un cliente: sus ideas y las generales (sin empresa), y con
 * «Todas», las de todos los clientes. `banco` es `useBancoIdeas()`: lo comparten el botón del calendario (su
 * contador) y este panel. `modo` «pagina» es la pestaña Ideas del cliente: sin cerrar y a todo el ancho.
 */
export function BankPanel({ banco, client, clientes = [], calDays, onRemoveFromCal, onClose, cal, onMoveBankToCal, modo = "lateral" }) {
  const [editingId, setEditingId] = useState(null);
  const [dropHover, setDropHover] = useState(false);
  const [vista, setVista] = useState("cliente");
  const [soloReferencias, setSoloReferencias] = useState(false);
  const ids = useId();

  const visibles = filtrarBanco(banco.ideas, { clienteId: client.id, vista, soloReferencias });
  const nombreDe = (id) => clientes.find((c) => c.id === id)?.name ?? "";

  const addNewPost = async () => {
    const post = { ...nuevaIdea({ id: uid() }), category: "" };
    setEditingId(post.id);
    await banco.anadir(post, client.id);
  };

  const removeFromBank = async (postId) => {
    if (editingId === postId) setEditingId(null);
    await banco.quitar(postId);
  };

  const moveBankToCalendar = (bankPost, targetDate) => {
    if (editingId === bankPost.id) setEditingId(null);
    onMoveBankToCal?.(bankPost, targetDate);
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
          banco.anadir(bankPost, client.id).then((ok) => { if (ok && onRemoveFromCal) onRemoveFromCal(data.sourceDate, data.postId); });
        }
      }
    } catch { /* ignore */ }
  };

  const vacio = soloReferencias
    ? "No hay referencias aquí. Guarda el enlace de un video con «Referencia»."
    : vista === "generales"
      ? "No hay ideas generales: las que se guardan sin empresa salen aquí y en el banco de todos los clientes."
      : calDays ? "Arrastra publicaciones aquí, crea una idea o guarda el enlace de una referencia." : "Crea una idea o guarda el enlace de una referencia.";

  return (
    <section
      className={`bank-panel${modo === "pagina" ? " bank-panel-pagina" : ""}${dropHover ? " drop-hover" : ""}`}
      aria-labelledby={`${ids}-t`}
      onDragOver={(e) => { e.preventDefault(); setDropHover(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropHover(false); }}
      onDrop={handleDrop}
    >
      <div className="bank-panel-cabecera">
        <h3 id={`${ids}-t`} className="bank-panel-titulo">
          <Icon name="bulb" size={18} /> {modo === "pagina" ? "Banco de ideas" : "Banco"} ({visibles.length})
        </h3>
        <div style={{ display: "flex", gap: "var(--sp-1)" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirGuardarReferencia(client.id)}>
            <Icon name="link" size={14} /> Referencia
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addNewPost} aria-label="Crear nueva idea">
            <Icon name="plus" size={14} />
          </button>
          {onClose && (
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar banco de ideas">
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="bank-panel-filtros" role="group" aria-label="Qué ideas ver">
        {VISTAS_BANCO.map((v) => (
          <button key={v.id} type="button" className="filter-chip" aria-pressed={vista === v.id} onClick={() => setVista(v.id)}>
            {v.nombre}
          </button>
        ))}
        <button type="button" className="filter-chip" aria-pressed={soloReferencias} onClick={() => setSoloReferencias((x) => !x)}>
          <Icon name="link" size={12} /> Sólo referencias
        </button>
      </div>

      <div className="bank-panel-lista">
        {banco.cargando && !banco.ideas.length ? (
          <p className="hint" style={{ textAlign: "center", padding: "var(--sp-4) 0" }}>Cargando…</p>
        ) : visibles.length === 0 ? (
          <p style={{ textAlign: "center", padding: "var(--sp-4) var(--sp-2)", color: "var(--text-dim)", fontSize: "var(--fs-2xs)" }}>{vacio}</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {visibles.map((post) => (
              <li key={post.id}>
                <BankPostCard
                  post={post}
                  isEditing={editingId === post.id}
                  onToggleEdit={() => setEditingId(editingId === post.id ? null : post.id)}
                  onSave={banco.cambiar}
                  onRemove={() => removeFromBank(post.id)}
                  onMoveToCalendar={(date) => moveBankToCalendar(post, date)}
                  onAsignar={(clienteId) => banco.asignar(post.id, clienteId)}
                  etiqueta={!post.clientId ? "General" : post.clientId !== client.id ? nombreDe(post.clientId) : ""}
                  clientes={clientes}
                  calDays={calDays}
                  client={client}
                  cal={cal}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** El enlace de una referencia: su red, su título si lo trajo y «Abrir» (en otra pestaña). */
function EnlaceReferencia({ post }) {
  if (!esReferencia(post)) return null;
  const red = PLATAFORMAS[plataformaDe(post.referenceLink)] ?? PLATAFORMAS.web;
  return (
    <a className="bank-ref-enlace" href={post.referenceLink} target="_blank" rel="noopener noreferrer" draggable={false}>
      <Icon name={red.icono} size={12} /> {red.nombre}{post.enlaceAutor ? ` · ${post.enlaceAutor}` : ""}
      <Icon name="external" size={12} />
      <span className="sr-only"> (abre en otra pestaña)</span>
    </a>
  );
}

export function BankPostCard({ post, isEditing, onToggleEdit, onSave, onRemove, onMoveToCalendar, onAsignar, etiqueta = "", clientes = [], calDays, client, cal }) {
  const [form, setForm] = useState({ ...post });
  const [moveDate, setMoveDate] = useState("");
  const [fieldLoading, setFieldLoading] = useState({});
  const [fieldError, setFieldError] = useState("");
  const imgRef = useRef();
  const cardId = useId();
  const sf = (k, v) => { setForm((p) => { const next = { ...p, [k]: v }; onSave(next); return next; }); };
  const f = FORMATS[form.format] || FORMATS.post;
  const isPost = form.format === "post";
  const title = tituloDeIdea(form);

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
      <div className="bank-card" draggable onDragStart={handleDragStart} style={{ borderColor: f.color }}>
        {post.miniatura ? (
          <img className="bank-card-mini" src={`/api/metricas/miniatura?u=${encodeURIComponent(post.miniatura)}`} alt="" loading="lazy"
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={16} style={{ color: f.color, flexShrink: 0 }} />
        )}
        <span className="bank-card-cuerpo">
          <button
            type="button" draggable={false} className="bank-card-abrir"
            onClick={onToggleEdit}
            aria-label={`Editar: ${title}`}
          >
            <span className="bank-card-titulo">{title}</span>
            {(etiqueta || form.publishTime) && (
              <span className="bank-card-meta">
                {etiqueta && <span className="bank-card-etiqueta" data-general={etiqueta === "General" || undefined}>{etiqueta}</span>}
                {form.publishTime && <span><Icon name="clock" size={10} /> {form.publishTime}</span>}
              </span>
            )}
          </button>
          <EnlaceReferencia post={post} />
        </span>
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

      {onAsignar && (
        <div style={{ marginBottom: "var(--sp-2)" }}>
          <label className="label" style={{ fontSize: "var(--fs-3xs)" }} htmlFor={`${cardId}-empresa`}>Empresa</label>
          <select id={`${cardId}-empresa`} className="input" style={{ fontSize: "var(--fs-2xs)" }} value={post.clientId ?? ""} onChange={(e) => onAsignar(e.target.value || null)}>
            <option value="">Sin empresa (general: sale en todos los bancos)</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ marginBottom: "var(--sp-2)" }}>
        <label className="label" style={{ fontSize: "var(--fs-3xs)" }} htmlFor={`${cardId}-enlace`}>Enlace de referencia</label>
        <input id={`${cardId}-enlace`} className="input" type="url" inputMode="url" style={{ fontSize: "var(--fs-2xs)" }}
          value={form.referenceLink || ""} onChange={(e) => sf("referenceLink", e.target.value)} placeholder="https://www.instagram.com/reel/…" />
        <EnlaceReferencia post={form} />
      </div>

      <div style={{ marginBottom: "var(--sp-2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
          <label className="label" style={{ margin: 0, fontSize: "var(--fs-3xs)" }} htmlFor={`${cardId}-idea`}>Idea</label>
          <button type="button" className="btn-ai" style={{ fontSize: "var(--fs-3xs)", padding: "1px 6px" }} onClick={() => generateField("idea")} disabled={fieldLoading.idea}>
            {fieldLoading.idea ? "…" : <><Icon name="sparkles" size={11} /> IA</>}
          </button>
        </div>
        <textarea
          id={`${cardId}-idea`} className="textarea" style={{ minHeight: 56, fontSize: "var(--fs-2xs)" }}
          value={form.idea || ""} onChange={(e) => sf("idea", e.target.value)} placeholder="Idea…"
          aria-describedby={`${cardId}-idea-ayuda`}
          // Enter guarda y cierra; Mayús+Enter, salto de línea. Antes no había
          // forma de cerrar la idea: parecía que sólo se guardaba al crear otra.
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onToggleEdit(); } }}
        />
        <p id={`${cardId}-idea-ayuda`} className="hint" style={{ margin: "2px 0 0", fontSize: "var(--fs-3xs)" }}>Enter guarda · Mayús + Enter, otra línea</p>
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
              {diasDelMes(cal, calDays).map((d) => <option key={d.date} value={d.date}>{d.date.split("-")[2]} {d.nombre}</option>)}
            </select>
          </div>
          <button className="btn btn-accent btn-sm" style={{ fontSize: "var(--fs-3xs)" }} disabled={!moveDate} onClick={() => onMoveToCalendar(moveDate)}>
            <Icon name="calendar" size={14} />
          </button>
        </div>
      )}

      <button type="button" className="btn btn-primary btn-sm" style={{ width: "100%", marginBottom: "var(--sp-1)" }} onClick={onToggleEdit}>
        <Icon name="check" size={14} /> Guardar idea
      </button>
      <button className="btn btn-ghost btn-sm" style={{ width: "100%", color: "var(--danger)", fontSize: "var(--fs-3xs)" }} onClick={onRemove}>
        <Icon name="trash" size={14} /> Eliminar del banco
      </button>
    </div>
  );
}

