import { useState } from "react";
import { FORMATS, FORMAT_ICONS } from "../constants";
import { uid } from "../utils";
import Icon from "./Icon";

export default function IdeasBank({ client, onUpdateClient, calDays, onRemoveFromCal }) {
  const [newIdeaOpen, setNewIdeaOpen] = useState(false);
  const [newIdea, setNewIdea] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newFormat, setNewFormat] = useState("post");

  const ideasBank = client.ideasBank || [];

  const addNewIdea = () => {
    if (!newIdea.trim()) return;
    const idea = {
      id: uid(),
      format: newFormat,
      idea: newIdea.trim(),
      category: newCategory.trim(),
      guion: "",
      descripcion: "",
      hashtagsFinales: "",
      script: "",
      status: "pending",
      image: null,
      referenceLink: "",
      comment: "",
      _addedAt: new Date().toISOString(),
    };
    onUpdateClient({ ...client, ideasBank: [...ideasBank, idea] });
    setNewIdea("");
    setNewCategory("");
    setNewFormat("post");
    setNewIdeaOpen(false);
  };

  const removeFromBank = (postId) => {
    onUpdateClient({ ...client, ideasBank: ideasBank.filter((p) => p.id !== postId) });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = "var(--alt-line)";
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
      if (data.postId && data.sourceDate && calDays) {
        const sourceDay = calDays.find((d) => d.date === data.sourceDate);
        const post = sourceDay?.posts?.find((p) => p.id === data.postId);
        if (post) {
          const bankPost = { ...post, id: uid(), _originDate: data.sourceDate, _addedAt: new Date().toISOString() };
          onUpdateClient({ ...client, ideasBank: [...ideasBank, bankPost] });
          if (onRemoveFromCal) onRemoveFromCal(data.sourceDate, data.postId);
        }
      }
    } catch { /* ignore */ }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent-alt)"; }}
      onDragLeave={(e) => { e.currentTarget.style.borderColor = "var(--alt-line)"; }}
      onDrop={handleDrop}
      style={{
        background: "var(--card)",
        border: "1px solid var(--alt-line)",
        borderRadius: "var(--radius)",
        padding: "var(--sp-3)",
        marginBottom: "var(--sp-3)",
        transition: "border-color .2s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--accent-alt)" }}>
          <Icon name="bulb" size={18} /> Banco de Ideas ({ideasBank.length})
        </h3>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setNewIdeaOpen(!newIdeaOpen)}
        >
          <Icon name="plus" size={14} /> Nueva idea
        </button>
      </div>

      {newIdeaOpen && (
        <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", marginBottom: "var(--sp-3)", border: "1px dashed var(--alt-line)" }}>
          <div style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap", marginBottom: "var(--sp-2)" }}>
            {Object.entries(FORMATS).map(([k, f]) => (
              <button
                key={k}
                type="button"
                onClick={() => setNewFormat(k)}
                style={{
                  padding: "var(--sp-1) var(--sp-2)",
                  borderRadius: "var(--radius-xs)",
                  border: `1px solid ${newFormat === k ? f.color : "var(--border)"}`,
                  cursor: "pointer",
                  background: newFormat === k ? f.color + "33" : "transparent",
                  color: newFormat === k ? f.color : "var(--text-dim)",
                  fontSize: "var(--fs-3xs)",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--sp-1)",
                  fontFamily: "inherit",
                }}
              >
                <Icon name={FORMAT_ICONS[k] || "formatPost"} size={14} /> {f.label}
              </button>
            ))}
          </div>
          <input
            className="input"
            style={{ fontSize: "var(--fs-2xs)", marginBottom: "var(--sp-2)" }}
            value={newIdea}
            onChange={(e) => setNewIdea(e.target.value)}
            placeholder="Describe la idea..."
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && newIdea.trim()) addNewIdea(); }}
          />
          <input
            className="input"
            style={{ fontSize: "var(--fs-2xs)", marginBottom: "var(--sp-2)" }}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Categoria (opcional)"
          />
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={addNewIdea} disabled={!newIdea.trim()}>
              Agregar
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setNewIdeaOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {ideasBank.length === 0 && !newIdeaOpen ? (
        <p style={{ textAlign: "center", padding: "var(--sp-4) 0", color: "var(--text-dim)", fontSize: "var(--fs-2xs)" }}>
          {calDays
            ? "Arrastra publicaciones del calendario aqui, o usa 'Nueva idea' para crear una."
            : "Usa 'Nueva idea' para anotar ideas para este cliente."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-2)", maxHeight: 300, overflowY: "auto" }}>
          {ideasBank.map((post) => {
            const f = FORMATS[post.format] || FORMATS.post;
            const title = post.idea || post.descripcion?.slice(0, 40) || f.label;
            return (
              <li
                key={post.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ bankPostId: post.id })); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-2)",
                  padding: "var(--sp-2) var(--sp-3)",
                  background: "var(--bg)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  cursor: "grab",
                }}
              >
                <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={16} style={{ color: f.color }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "var(--fs-2xs)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {title}
                  </span>
                  {post.category && <span style={{ display: "block", fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>{post.category}</span>}
                </span>
                {post.publishTime && <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>{post.publishTime}</span>}
                <button
                  type="button"
                  className="btn-remove"
                  aria-label={`Quitar del banco: ${title}`}
                  onClick={() => removeFromBank(post.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
