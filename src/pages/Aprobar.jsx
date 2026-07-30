import { useState, useEffect } from "react";
import { FORMATS, STATUSES } from "../constants";

const API_BASE = "/api/approval";

export default function Aprobar() {
  const [calData, setCalData] = useState(null);
  const [approvals, setApprovals] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});
  const [commentInputs, setCommentInputs] = useState({});
  const [showComment, setShowComment] = useState({});
  const [activeWeek, setActiveWeek] = useState("all");

  const params = new URLSearchParams(window.location.search);
  const approvalId = params.get("id");

  useEffect(() => {
    if (!approvalId) {
      setError("Link invalido: falta el ID del calendario.");
      setLoading(false);
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch(`${API_BASE}?id=${approvalId}`);
      if (!res.ok) throw new Error("Error al cargar");
      const data = await res.json();
      if (!data.calendar) {
        setError("Link invalido o expirado.");
        setLoading(false);
        return;
      }
      setCalData(data.calendar);
      setApprovals(data.approvals || {});
    } catch (e) {
      setError("No se pudo cargar el calendario: " + e.message);
    }
    setLoading(false);
  };

  const handleApproval = async (postId, estado, comentario = "") => {
    setSaving((p) => ({ ...p, [postId]: true }));
    try {
      await fetch(`${API_BASE}?id=${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          publicacionId: postId,
          estado,
          comentario,
        }),
      });
      setApprovals((p) => ({
        ...p,
        [postId]: { estado, comentario, timestamp: new Date().toISOString() },
      }));
    } catch {
      alert("Error al guardar. Intenta de nuevo.");
    }
    setSaving((p) => ({ ...p, [postId]: false }));
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ color: "#64B5F6" }}>Cargando calendario...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "#EF5350", fontSize: 14 }}>{error}</div>
      </div>
    );
  }

  const { client, calendar } = calData;
  const pc = client?.primaryColor || "#1E90FF";
  const allPosts = (calendar.days || []).flatMap((d) =>
    (d.posts || []).map((p) => ({ ...p, _date: d.date }))
  );
  const totalPosts = allPosts.length;
  const reviewed = allPosts.filter((p) => approvals[p.id]).length;

  const weekGroups = {};
  (calendar.days || []).forEach((day) => {
    const wk = day.weekNumber || 1;
    if (!weekGroups[wk]) weekGroups[wk] = { concept: day.concept || "", days: [] };
    weekGroups[wk].days.push(day);
  });
  const weeks = Object.keys(weekGroups).sort((a, b) => a - b);

  const filteredWeeks =
    activeWeek === "all"
      ? weeks
      : weeks.filter((w) => w === activeWeek);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ ...styles.header, background: `linear-gradient(135deg, ${pc}, ${pc}99)` }}>
        {client?.logo && (
          <img
            src={client.logo}
            alt=""
            style={{ width: 50, height: 50, objectFit: "contain", borderRadius: 10, background: "rgba(255,255,255,.15)", padding: 4, marginBottom: 8 }}
          />
        )}
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>{client?.name || "Cliente"}</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,.85)", margin: "4px 0 0" }}>
          {calendar.name || "Calendario"}{calendar.campaign ? ` · ${calendar.campaign}` : ""}
        </p>
      </div>

      {/* Progress bar */}
      <div style={styles.progressSection}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#A0B4CC", marginBottom: 4 }}>
          <span>{reviewed} de {totalPosts} publicaciones revisadas</span>
          <span>{totalPosts > 0 ? Math.round((reviewed / totalPosts) * 100) : 0}%</span>
        </div>
        <div style={{ height: 6, background: "#050D1F", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${totalPosts > 0 ? (reviewed / totalPosts) * 100 : 0}%`, background: `linear-gradient(90deg, #1B3A6B, ${pc})`, borderRadius: 999, transition: "width .4s ease" }} />
        </div>
      </div>

      {/* Week tabs */}
      {weeks.length > 1 && (
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveWeek("all")}
            style={{ ...styles.tab, ...(activeWeek === "all" ? styles.tabActive : {}) }}
          >
            Todas
          </button>
          {weeks.map((w) => (
            <button
              key={w}
              onClick={() => setActiveWeek(w)}
              style={{ ...styles.tab, ...(activeWeek === w ? styles.tabActive : {}) }}
            >
              Semana {w}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {filteredWeeks.map((wk) => {
        const { concept, days } = weekGroups[wk];
        return (
          <div key={wk} style={{ marginBottom: 24 }}>
            <div style={styles.weekHeader}>
              <span style={styles.weekBadge}>Semana {wk}</span>
              {concept && <span style={{ fontSize: 12, color: "#A0B4CC", fontStyle: "italic" }}>{concept}</span>}
            </div>
            {days.map((day) => (
              <div key={day.date} style={styles.dayCard}>
                <div style={{ ...styles.dayHeader, borderColor: pc + "44" }}>
                  <div style={{ ...styles.dayNum, background: pc }}>{(day.date || "").split("-")[2]}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{day.dayName || ""}</div>
                    {day.category && <div style={{ fontSize: 11, color: "#FFA726" }}>{day.category}</div>}
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  {(day.posts || []).map((post) => {
                    const f = FORMATS[post.format] || FORMATS.post;
                    const approval = approvals[post.id];
                    const isSaving = saving[post.id];
                    const isPost = post.format === "post";

                    return (
                      <div key={post.id} style={{ ...styles.postCard, borderColor: approval?.estado === "aprobado" ? "#388E3C" : approval?.estado === "cambios" ? "#C62828" : "#1E3A6B" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
                          <span style={{ ...styles.badge, background: f.color + "22", color: f.color, borderColor: f.color + "44" }}>{f.icon} {f.label}</span>
                          {approval && (
                            <span style={{ ...styles.badge, background: approval.estado === "aprobado" ? "#0d2a0d" : "#2a0d0d", color: approval.estado === "aprobado" ? "#66BB6A" : "#EF5350", borderColor: approval.estado === "aprobado" ? "#388E3C" : "#C62828" }}>
                              {approval.estado === "aprobado" ? "✓ Aprobado" : "✗ Cambios"}
                            </span>
                          )}
                        </div>

                        {post.category && <div style={{ fontSize: 11, color: "#FFA726", fontWeight: 600, marginBottom: 6 }}>{post.category}</div>}
                        {post.image && <img src={post.image} alt="" style={{ width: "100%", maxWidth: 300, borderRadius: 8, marginBottom: 8 }} />}
                        {post.idea && <div style={styles.contentBox}><strong style={{ ...styles.fieldLabel, color: "#64B5F6" }}>Idea</strong>{post.idea}</div>}

                        {!isPost && post.guion && (
                          <div style={{ ...styles.contentBox, background: "#1a0a2a" }}>
                            <strong style={{ ...styles.fieldLabel, color: "#E91E63" }}>Guion</strong>
                            <div style={{ whiteSpace: "pre-wrap" }}>{post.guion}</div>
                          </div>
                        )}

                        {(post.descripcion || post.script) && (
                          <div style={{ ...styles.contentBox, position: "relative" }}>
                            <strong style={{ ...styles.fieldLabel, color: "#1E90FF" }}>Descripcion</strong>
                            <div style={{ whiteSpace: "pre-wrap" }}>{post.descripcion || post.script}</div>
                            <CopyBtn text={post.descripcion || post.script} />
                          </div>
                        )}

                        {post.hashtagsFinales && (
                          <div style={{ fontSize: 11, color: "#F5A623", marginBottom: 8 }}>{post.hashtagsFinales}</div>
                        )}

                        {/* Approval buttons */}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button
                            disabled={isSaving}
                            onClick={() => handleApproval(post.id, "aprobado")}
                            style={{ ...styles.approveBtn, opacity: isSaving ? 0.5 : 1 }}
                          >
                            {isSaving ? "..." : "✓ Aprobar"}
                          </button>
                          <button
                            disabled={isSaving}
                            onClick={() => setShowComment((p) => ({ ...p, [post.id]: !p[post.id] }))}
                            style={styles.changesBtn}
                          >
                            ✗ Pedir cambios
                          </button>
                        </div>

                        {showComment[post.id] && (
                          <div style={{ marginTop: 8 }}>
                            <textarea
                              value={commentInputs[post.id] || ""}
                              onChange={(e) => setCommentInputs((p) => ({ ...p, [post.id]: e.target.value }))}
                              placeholder="Describe los cambios que necesitas..."
                              style={styles.commentArea}
                            />
                            <button
                              disabled={isSaving}
                              onClick={() => {
                                handleApproval(post.id, "cambios", commentInputs[post.id] || "");
                                setShowComment((p) => ({ ...p, [post.id]: false }));
                              }}
                              style={{ ...styles.changesBtn, width: "100%", marginTop: 6 }}
                            >
                              Enviar cambios
                            </button>
                          </div>
                        )}

                        {approval?.comentario && (
                          <div style={styles.commentDisplay}>
                            💬 {approval.comentario}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Summary button */}
      <div style={styles.summary}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Resumen de revision</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
          <span style={{ color: "#66BB6A" }}>✓ {allPosts.filter((p) => approvals[p.id]?.estado === "aprobado").length} aprobadas</span>
          <span style={{ color: "#EF5350" }}>✗ {allPosts.filter((p) => approvals[p.id]?.estado === "cambios").length} con cambios</span>
          <span style={{ color: "#64B5F6" }}>⏳ {allPosts.filter((p) => !approvals[p.id]).length} pendientes</span>
        </div>
      </div>

      <div style={{ textAlign: "center", padding: 24, color: "#64B5F6", fontSize: 11, borderTop: "1px solid #1E3A6B", marginTop: 24 }}>
        Juancito Ads · Calendario de Contenido
      </div>
    </div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        padding: "4px 8px",
        background: copied ? "#0d2a0d" : "#1E90FF33",
        color: copied ? "#66BB6A" : "#1E90FF",
        border: `1px solid ${copied ? "#388E3C" : "#1E90FF44"}`,
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

const styles = {
  page: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: "#050D1F",
    color: "#fff",
    minHeight: "100vh",
    maxWidth: 600,
    margin: "0 auto",
    padding: "0 0 40px",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#050D1F",
    color: "#fff",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    padding: "28px 20px",
    textAlign: "center",
    borderRadius: "0 0 16px 16px",
  },
  progressSection: {
    padding: "12px 16px",
  },
  tabs: {
    display: "flex",
    gap: 6,
    padding: "0 16px 12px",
    overflowX: "auto",
  },
  tab: {
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid #1E3A6B",
    background: "#0A1628",
    color: "#A0B4CC",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  tabActive: {
    background: "#1E90FF",
    borderColor: "#1E90FF",
    color: "#fff",
  },
  weekHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 16px 8px",
  },
  weekBadge: {
    background: "#1E90FF22",
    color: "#1E90FF",
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
  },
  dayCard: {
    background: "#0A1628",
    border: "1px solid #1E3A6B",
    borderRadius: 14,
    margin: "0 16px 10px",
    overflow: "hidden",
  },
  dayHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottom: "1px solid #1E3A6B",
    background: "#0d1f3a",
  },
  dayNum: {
    color: "#fff",
    fontSize: 18,
    fontWeight: 900,
    padding: "4px 10px",
    borderRadius: 8,
    minWidth: 40,
    textAlign: "center",
  },
  postCard: {
    background: "#050D1F",
    border: "1px solid #1E3A6B",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    transition: "border-color .3s",
  },
  badge: {
    fontSize: 10,
    padding: "3px 8px",
    borderRadius: 20,
    fontWeight: 600,
    border: "1px solid",
  },
  contentBox: {
    background: "#0d1f3a",
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: "#C8D8E8",
    lineHeight: 1.7,
    marginBottom: 8,
    position: "relative",
  },
  fieldLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    display: "block",
    marginBottom: 4,
  },
  approveBtn: {
    flex: 1,
    padding: 10,
    background: "#0d2a0d",
    color: "#66BB6A",
    border: "1px solid #388E3C",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  },
  changesBtn: {
    flex: 1,
    padding: 10,
    background: "#2a0d0d",
    color: "#EF5350",
    border: "1px solid #C62828",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  },
  commentArea: {
    width: "100%",
    padding: 10,
    background: "#050D1F",
    border: "1px solid #1E3A6B",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
    resize: "vertical",
    minHeight: 60,
    fontFamily: "inherit",
    outline: "none",
  },
  commentDisplay: {
    marginTop: 8,
    padding: 8,
    background: "#1a2a0a",
    borderRadius: 6,
    fontSize: 11,
    color: "#FFA726",
  },
  summary: {
    margin: "0 16px",
    padding: 16,
    background: "#0A1628",
    border: "1px solid #1E3A6B",
    borderRadius: 12,
  },
};
