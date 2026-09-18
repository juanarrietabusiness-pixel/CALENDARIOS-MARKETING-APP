// ============================================================
// El banco de ideas
//
// Publicaciones guardadas fuera del calendario, para reutilizarlas. La
// clave de sus imágenes en R2 lleva el prefijo `clientes/`: sin él no
// las sirve nadie y el fallo es mudo —la fila está, el objeto está, y
// la imagen no carga—.
// ============================================================

import { useId, useState } from "react";
import { FORMATS } from "../../constants";
import { uid, compressImage } from "../../utils";
import { generateFieldForPost } from "../../api";
import Icon from "../Icon";
import { TimePicker } from "./primitivas";

export function BankPanel({ client, onUpdateClient, calDays, onRemoveFromCal, onClose, cal, calId, onUpdateCal, onMoveBankToCal }) {
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

export function BankPostCard({ post, isEditing, onToggleEdit, onSave, onRemove, onMoveToCalendar, calDays, client, cal }) {
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

