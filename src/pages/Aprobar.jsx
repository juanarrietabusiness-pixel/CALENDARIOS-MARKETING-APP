import { useCallback, useEffect, useId, useState } from "react";
import { FORMATS, FORMAT_ICONS, DAYS } from "../constants";
import { supabase, isSupabaseEnabled } from "../lib/supabase";
import Icon from "../components/Icon";
import logoMark from "../assets/logo-mark.png";

function fmt12h(value) {
  if (!value) return "--:--";
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Página pública de aprobación.
 *
 * Habla directamente con Postgres a través de dos funciones que validan
 * el token dentro de la base de datos. No hay clave de servicio de por
 * medio, y como la respuesta del cliente entra en la tabla al momento,
 * la agencia la ve en vivo sin sondear nada.
 *
 * El enlace sólo permite ver y responder este calendario: las políticas
 * RLS impiden leer ninguna otra fila.
 */
export default function Aprobar() {
  const [calData, setCalData] = useState(null);
  const [approvals, setApprovals] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});
  const [saveError, setSaveError] = useState("");
  const [commentInputs, setCommentInputs] = useState({});
  const [showComment, setShowComment] = useState({});
  const [activeWeek, setActiveWeek] = useState("all");
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [bulkSaving, setBulkSaving] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_shared_calendar", {
        p_token: token,
      });
      if (rpcError) throw new Error(rpcError.message);
      if (!data?.calendar) {
        setError("Enlace inválido, revocado o caducado. Pide uno nuevo a tu agencia.");
        setLoading(false);
        return;
      }
      setCalData(data.calendar);
      setApprovals(data.approvals || {});
    } catch (e) {
      setError("No se pudo cargar el calendario: " + e.message);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!isSupabaseEnabled) {
      setError("Este sitio no está configurado para mostrar calendarios compartidos.");
      setLoading(false);
      return;
    }
    if (!token) {
      setError("Enlace inválido: le falta el identificador del calendario.");
      setLoading(false);
      return;
    }
    loadData();
  }, [token, loadData]);

  const [editedFields, setEditedFields] = useState({});

  const handleApproval = async (postId, estado, comentario = "", suggestions = null) => {
    setSaving((p) => ({ ...p, [postId]: true }));
    setSaveError("");
    try {
      const { error: rpcError } = await supabase.rpc("submit_approval", {
        p_token: token,
        p_post_id: postId,
        p_estado: estado,
        p_comentario: comentario,
        p_reviewer: "",
        p_suggested_descripcion: suggestions?.descripcion || null,
        p_suggested_guion: suggestions?.guion || null,
      });
      if (rpcError) throw new Error(rpcError.message);

      setApprovals((p) => ({
        ...p,
        [postId]: {
          estado, comentario, timestamp: new Date().toISOString(),
          suggestedDescripcion: suggestions?.descripcion || null,
          suggestedGuion: suggestions?.guion || null,
        },
      }));
      if (suggestions) setEditedFields((p) => { const n = { ...p }; delete n[postId]; return n; });
    } catch (e) {
      setSaveError(`No se pudo guardar tu respuesta (${e.message}). Revisa tu conexión e inténtalo otra vez.`);
    }
    setSaving((p) => ({ ...p, [postId]: false }));
  };

  const handleBulkApprove = async () => {
    if (!calData) return;
    const pending = (calData.calendar.days || [])
      .flatMap((d) => (d.posts || []).map((p) => p))
      .filter((p) => !approvals[p.id]);
    if (pending.length === 0) return;
    if (!confirm(`Aprobar ${pending.length} publicaciones pendientes?`)) return;
    setBulkSaving(true);
    for (const post of pending) {
      try {
        const { error: rpcError } = await supabase.rpc("submit_approval", {
          p_token: token,
          p_post_id: post.id,
          p_estado: "aprobado",
          p_comentario: "",
          p_reviewer: "",
        });
        if (!rpcError) {
          setApprovals((p) => ({
            ...p,
            [post.id]: { estado: "aprobado", comentario: "", timestamp: new Date().toISOString() },
          }));
        }
      } catch {
        // continue with remaining
      }
    }
    setBulkSaving(false);
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <p role="status">
          <Icon name="calendar" size={36} style={{ margin: "0 auto var(--sp-3)", color: "var(--text-faint)" }} />
          <span style={{ color: "var(--text-muted)" }}>Cargando calendario…</span>
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <p role="alert" style={{ maxWidth: 420 }}>
          <Icon name="alert" size={36} style={{ margin: "0 auto var(--sp-3)", color: "var(--danger)" }} />
          <span style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{error}</span>
        </p>
        {token && (
          <button className="btn btn-secondary" style={{ marginTop: "var(--sp-4)" }} onClick={loadData}>
            Reintentar
          </button>
        )}
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
  const pct = totalPosts > 0 ? Math.round((reviewed / totalPosts) * 100) : 0;

  const weekGroups = {};
  (calendar.days || []).forEach((day) => {
    const wk = day.weekNumber || 1;
    if (!weekGroups[wk]) weekGroups[wk] = { concept: day.concept || "", days: [] };
    weekGroups[wk].days.push(day);
  });
  const weeks = Object.keys(weekGroups).sort((a, b) => a - b);
  const filteredWeeks = activeWeek === "all" ? weeks : weeks.filter((w) => w === activeWeek);

  const approvedCount = allPosts.filter((p) => approvals[p.id]?.estado === "aprobado").length;
  const changesCount = allPosts.filter((p) => approvals[p.id]?.estado === "cambios").length;
  const pendingCount = allPosts.filter((p) => !approvals[p.id]).length;

  const categoryPattern = {};
  (calendar.days || []).forEach((day) => {
    const dow = new Date(day.date + "T12:00:00").getDay();
    if (day.category && !categoryPattern[dow]) categoryPattern[dow] = day.category;
  });

  return (
    <div style={styles.page}>
      <a className="skip-link" href="#publicaciones">Saltar a las publicaciones</a>

      <header style={{ ...styles.header, background: `linear-gradient(135deg, ${pc}, ${pc}99)` }}>
        {client?.logo && (
          <img
            src={client.logo}
            alt={`Logo de ${client.name || "el cliente"}`}
            style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 12, background: "rgba(255,255,255,.18)", padding: 4, marginBottom: "var(--sp-2)" }}
          />
        )}
        <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 900 }}>{client?.name || "Cliente"}</h1>
        <p style={{ fontSize: "var(--fs-sm)", color: "rgba(255,255,255,.92)", marginTop: "var(--sp-1)" }}>
          {calendar.name || "Calendario"}
        </p>
        {calendar.campaign && (
          <span style={{ display: "inline-block", marginTop: "var(--sp-2)", padding: "var(--sp-1) var(--sp-3)", background: "rgba(255,255,255,.15)", borderRadius: 20, fontSize: "var(--fs-xs)", fontWeight: 700 }}>
            {calendar.campaign}
          </span>
        )}
        <p style={{ fontSize: "var(--fs-xs)", color: "rgba(255,255,255,.85)", marginTop: "var(--sp-2)" }}>
          Revisa cada publicación y marca si la apruebas o quieres cambios.
        </p>
      </header>

      {/* Stats bar */}
      <div style={styles.statsBar}>
        <div style={styles.stat}>
          <div style={{ ...styles.statNum, color: pc }}>{totalPosts}</div>
          <div style={styles.statLabel}>Posts</div>
        </div>
        <div style={styles.stat}>
          <div style={{ ...styles.statNum, color: "var(--success)" }}>{approvedCount}</div>
          <div style={styles.statLabel}>Aprobados</div>
        </div>
        <div style={styles.stat}>
          <div style={{ ...styles.statNum, color: "var(--danger)" }}>{changesCount}</div>
          <div style={styles.statLabel}>Cambios</div>
        </div>
        <div style={styles.stat}>
          <div style={{ ...styles.statNum, color: "var(--text-muted)" }}>{pendingCount}</div>
          <div style={styles.statLabel}>Pendientes</div>
        </div>
      </div>

      {/* Progreso: pegajoso para que el cliente sepa siempre cuánto le queda */}
      <div style={styles.progressSection}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-2xs)", color: "var(--text-dim)", marginBottom: "var(--sp-1)" }}>
          <span id="rev-label">{reviewed} de {totalPosts} publicaciones revisadas</span>
          <span>{pct}%</span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-labelledby="rev-label"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="progress-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #1B3A6B, ${pc})` }} />
        </div>
      </div>

      {/* Campaign summary section */}
      <div style={styles.campaignSection}>
        <button
          type="button"
          onClick={() => setSummaryOpen(!summaryOpen)}
          style={styles.campaignToggle}
        >
          <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)" }}>Resumen de Campana</span>
          <span style={{ fontSize: "var(--fs-sm)", transition: "transform .2s", transform: summaryOpen ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
        </button>
        {summaryOpen && (
          <div style={{ padding: "0 var(--sp-4) var(--sp-4)" }}>
            {Object.keys(categoryPattern).length > 0 && (
              <>
                <h3 style={styles.sectionHeading}>Patron Semanal</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
                  {Object.entries(categoryPattern)
                    .sort(([a], [b]) => ((+a || 7) - (+b || 7)))
                    .map(([dow, cat]) => (
                      <div key={dow} style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", padding: "var(--sp-1) 0" }}>
                        <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, color: "var(--text)", minWidth: 80 }}>{DAYS[dow]}</span>
                        <span style={{ fontSize: "var(--fs-2xs)", color: "#FFC166", fontWeight: 600 }}>{cat}</span>
                      </div>
                    ))}
                </div>
              </>
            )}
            <h3 style={styles.sectionHeading}>Ideas por Semana</h3>
            {weeks.map((wk) => {
              const { concept, days } = weekGroups[wk];
              const ideas = days.flatMap((d) => (d.posts || []).map((p) => p.idea).filter(Boolean));
              return (
                <div key={wk} style={styles.weekIdeaBlock}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
                    <span style={styles.weekBadgeSm}>Sem {wk}</span>
                    {concept && <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", fontStyle: "italic" }}>{concept}</span>}
                  </div>
                  {ideas.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {ideas.map((idea, i) => (
                        <div key={i} style={{ fontSize: "var(--fs-xs)", color: "#C8D8E8", padding: "var(--sp-1) 0 var(--sp-1) var(--sp-3)", borderLeft: "2px solid var(--border)" }}>
                          → {idea}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", fontStyle: "italic" }}>Sin ideas definidas</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Visual references gallery */}
      {(calendar.visualReferences || []).length > 0 && (
        <div style={styles.visualRefsSection}>
          <h3 style={styles.sectionHeading}>Referencias visuales</h3>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", marginBottom: "var(--sp-3)" }}>
            Estilo general de los diseños que se usarán en este calendario.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "var(--sp-2)" }}>
            {calendar.visualReferences.map((vr) => (
              <img
                key={vr.id}
                src={vr.url}
                alt={vr.name || "Referencia visual"}
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bulk approve */}
      {pendingCount > 0 && (
        <div style={{ padding: "0 var(--sp-4) var(--sp-3)" }}>
          <button
            type="button"
            className="btn"
            onClick={handleBulkApprove}
            disabled={bulkSaving}
            style={{ ...styles.approveBtn, width: "100%", opacity: bulkSaving ? 0.5 : 1 }}
          >
            {bulkSaving ? "Aprobando…" : <><Icon name="check" size={18} /> Aprobar todo ({pendingCount})</>}
          </button>
        </div>
      )}

      {saveError && (
        <p role="alert" className="notice notice-error" style={{ margin: "0 var(--sp-4) var(--sp-3)" }}>
          {saveError}
        </p>
      )}

      {weeks.length > 1 && (
        <div className="filter-bar" role="group" aria-label="Filtrar por semana" style={{ padding: "0 var(--sp-4) var(--sp-3)", flexWrap: "nowrap", overflowX: "auto" }}>
          <button
            className={`filter-chip ${activeWeek === "all" ? "active" : ""}`}
            aria-pressed={activeWeek === "all"}
            onClick={() => setActiveWeek("all")}
            style={{ flexShrink: 0 }}
          >
            Todas
          </button>
          {weeks.map((w) => (
            <button
              key={w}
              className={`filter-chip ${activeWeek === w ? "active" : ""}`}
              aria-pressed={activeWeek === w}
              onClick={() => setActiveWeek(w)}
              style={{ flexShrink: 0 }}
            >
              Semana {w}
            </button>
          ))}
        </div>
      )}

      <main id="publicaciones">
        {filteredWeeks.map((wk) => {
          const { concept, days } = weekGroups[wk];
          return (
            <section key={wk} aria-label={`Semana ${wk}`} style={{ marginBottom: "var(--sp-6)" }}>
              <div style={styles.weekHeader}>
                <h2 style={styles.weekBadge}>Semana {wk}</h2>
                {concept && <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", fontStyle: "italic" }}>{concept}</span>}
              </div>
              {days.map((day) => (
                <article key={day.date} style={styles.dayCard}>
                  <div style={{ ...styles.dayHeader, borderColor: pc + "44" }}>
                    <span style={{ ...styles.dayNum, background: pc }}>{(day.date || "").split("-")[2]}</span>
                    <span>
                      <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 700 }}>{day.dayName || ""}</h3>
                      {day.category && <span style={{ display: "block", fontSize: "var(--fs-2xs)", color: "#FFC166" }}>{day.category}</span>}
                    </span>
                  </div>
                  <div style={{ padding: "var(--sp-3)" }}>
                    {(day.posts || []).map((post) => (
                      <PostReview
                        key={post.id}
                        post={post}
                        approval={approvals[post.id]}
                        isSaving={saving[post.id]}
                        commentValue={commentInputs[post.id] || ""}
                        commentOpen={!!showComment[post.id]}
                        allowEditing={calendar.allowEditing || false}
                        editedFields={editedFields[post.id] || null}
                        onEditField={(field, value) => setEditedFields((p) => ({ ...p, [post.id]: { ...(p[post.id] || {}), [field]: value } }))}
                        onCommentChange={(v) => setCommentInputs((p) => ({ ...p, [post.id]: v }))}
                        onToggleComment={() => setShowComment((p) => ({ ...p, [post.id]: !p[post.id] }))}
                        onApprove={() => handleApproval(post.id, "aprobado")}
                        onRequestChanges={() => {
                          const edits = editedFields[post.id];
                          const hasSuggestions = edits && (edits.descripcion !== undefined || edits.guion !== undefined);
                          handleApproval(
                            post.id, "cambios", commentInputs[post.id] || "",
                            hasSuggestions ? edits : null,
                          );
                          setShowComment((p) => ({ ...p, [post.id]: false }));
                        }}
                      />
                    ))}
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </main>

      <div style={styles.summary} role="status" aria-live="polite">
        <h2 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Resumen de revisión</h2>
        <div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", fontSize: "var(--fs-xs)" }}>
          <span style={{ color: "var(--success)" }}>{approvedCount} aprobadas</span>
          <span style={{ color: "var(--danger)" }}>{changesCount} con cambios</span>
          <span style={{ color: "var(--text-muted)" }}>{pendingCount} pendientes</span>
        </div>
        {reviewed === totalPosts && totalPosts > 0 && (
          <p className="notice notice-ok" style={{ marginTop: "var(--sp-3)", marginBottom: 0, display: "block" }}>
            Has revisado todas las publicaciones. Tu agencia ya puede ver tus respuestas.
          </p>
        )}
      </div>

      <footer style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-6)", color: "var(--text-dim)", fontSize: "var(--fs-2xs)", borderTop: "1px solid var(--border)", marginTop: "var(--sp-6)" }}>
        <img src={logoMark} alt="" width={36} height={36} style={{ width: 36, height: 36, objectFit: "contain", opacity: .9 }} />
        Juancito Ads · Calendario de contenido
      </footer>
    </div>
  );
}

function PostReview({
  post, approval, isSaving, commentValue, commentOpen, allowEditing,
  editedFields, onEditField,
  onCommentChange, onToggleComment, onApprove, onRequestChanges,
}) {
  const f = FORMATS[post.format] || FORMATS.post;
  const isPost = post.format === "post";
  const ids = useId();
  const [expanded, setExpanded] = useState(false);
  const borderColor =
    approval?.estado === "aprobado" ? "#388E3C" : approval?.estado === "cambios" ? "#C62828" : "var(--border)";
  const hasContent = post.guion || post.descripcion || post.script;

  return (
    <div style={{ ...styles.postCard, borderColor }}>
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-2)", alignItems: "center" }}>
        <span className="badge" style={{ background: f.color + "22", color: f.color, border: `1px solid ${f.color}66` }}>
          <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={14} /> {f.label}
        </span>
        {post.publishTime && <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>{fmt12h(post.publishTime)}</span>}
        {approval && (
          <span
            className="badge"
            style={{
              background: approval.estado === "aprobado" ? "#0d2a0d" : "#2a0d0d",
              color: approval.estado === "aprobado" ? "var(--success)" : "var(--danger)",
              border: `1px solid ${approval.estado === "aprobado" ? "#388E3C" : "#C62828"}`,
            }}
          >
            {approval.estado === "aprobado" ? "Aprobado" : "Cambios solicitados"}
          </span>
        )}
      </div>

      {post.category && <p style={{ fontSize: "var(--fs-2xs)", color: "#FFC166", fontWeight: 600, marginBottom: "var(--sp-2)" }}>{post.category}</p>}
      {post.image && <img src={post.image} alt="" style={{ width: "100%", maxWidth: 340, borderRadius: "var(--radius-sm)", marginBottom: "var(--sp-2)" }} />}
      {post.idea && (
        <div style={styles.contentBox}>
          <strong style={{ ...styles.fieldLabel, color: "var(--text-muted)" }}>Idea</strong>
          {post.idea}
        </div>
      )}

      {hasContent && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            style={styles.expandBtn}
          >
            <span>{expanded ? "Ocultar contenido" : "Ver contenido"}</span>
            <span style={{ transition: "transform .2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
          </button>

          {expanded && (
            <div style={{ marginTop: "var(--sp-2)" }}>
              {!isPost && post.guion && (
                <div style={{ ...styles.contentBox, background: "#1a0a2a" }}>
                  <strong style={{ ...styles.fieldLabel, color: "#FF7BA8" }}>Guion</strong>
                  {allowEditing ? (
                    <>
                      <div style={{ whiteSpace: "pre-wrap", marginBottom: "var(--sp-2)" }}>{post.guion}</div>
                      <label className="label" htmlFor={`${ids}-edit-guion`} style={{ fontSize: "var(--fs-3xs)", color: "#FF7BA8" }}>Sugerir cambio al guion</label>
                      <textarea
                        id={`${ids}-edit-guion`}
                        className="textarea"
                        style={{ minHeight: 80, fontSize: "var(--fs-2xs)", background: "var(--bg)", borderColor: "#FF7BA844" }}
                        value={editedFields?.guion ?? ""}
                        onChange={(e) => onEditField("guion", e.target.value)}
                        placeholder="Escribe tu versión sugerida del guion…"
                      />
                    </>
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap" }}>{post.guion}</div>
                  )}
                </div>
              )}

              {(post.descripcion || post.script) && (
                <div style={{ ...styles.contentBox, position: "relative", paddingTop: "var(--sp-8)" }}>
                  <strong style={{ ...styles.fieldLabel, color: "var(--accent)" }}>Descripción</strong>
                  {allowEditing ? (
                    <>
                      <div style={{ whiteSpace: "pre-wrap", marginBottom: "var(--sp-2)" }}>{post.descripcion || post.script}</div>
                      <CopyBtn text={post.descripcion || post.script} />
                      <label className="label" htmlFor={`${ids}-edit-desc`} style={{ fontSize: "var(--fs-3xs)" }}>Sugerir cambio a la descripción</label>
                      <textarea
                        id={`${ids}-edit-desc`}
                        className="textarea"
                        style={{ minHeight: 80, fontSize: "var(--fs-2xs)", background: "var(--bg)" }}
                        value={editedFields?.descripcion ?? ""}
                        onChange={(e) => onEditField("descripcion", e.target.value)}
                        placeholder="Escribe tu versión sugerida de la descripción…"
                      />
                    </>
                  ) : (
                    <>
                      <div style={{ whiteSpace: "pre-wrap" }}>{post.descripcion || post.script}</div>
                      <CopyBtn text={post.descripcion || post.script} />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {post.hashtagsFinales && (
        <p style={{ fontSize: "var(--fs-2xs)", color: "var(--accent-alt)", marginBottom: "var(--sp-2)" }}>{post.hashtagsFinales}</p>
      )}

      <div className="review-actions">
        <button
          type="button"
          disabled={isSaving}
          onClick={onApprove}
          className="btn"
          style={{ ...styles.approveBtn, opacity: isSaving ? 0.5 : 1 }}
        >
          {isSaving ? "Guardando…" : <><Icon name="check" size={18} /> Aprobar</>}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={onToggleComment}
          aria-expanded={commentOpen}
          aria-controls={`${ids}-comment`}
          className="btn"
          style={styles.changesBtn}
        >
          <Icon name="close" size={18} /> Pedir cambios
        </button>
      </div>

      {commentOpen && (
        <div id={`${ids}-comment`} style={{ marginTop: "var(--sp-3)" }}>
          <label className="label" htmlFor={`${ids}-comment-input`}>¿Qué quieres cambiar?</label>
          <textarea
            id={`${ids}-comment-input`}
            className="textarea"
            value={commentValue}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Describe los cambios que necesitas…"
          />
          <button
            type="button"
            disabled={isSaving}
            onClick={onRequestChanges}
            className="btn"
            style={{ ...styles.changesBtn, width: "100%", marginTop: "var(--sp-2)" }}
          >
            Enviar cambios
          </button>
        </div>
      )}

      {approval?.comentario && (
        <p style={styles.commentDisplay}>
          <Icon name="message" size={16} style={{ display: "inline-block", verticalAlign: "-3px", marginRight: "var(--sp-1)" }} />{approval.comentario}
        </p>
      )}
      {(approval?.suggestedDescripcion || approval?.suggestedGuion) && (
        <div style={{ ...styles.contentBox, background: "#1a1a0a", borderColor: "var(--accent-alt)", marginTop: "var(--sp-2)" }}>
          <strong style={{ ...styles.fieldLabel, color: "var(--accent-alt)" }}>Sugerencias enviadas</strong>
          {approval.suggestedGuion && (
            <p style={{ fontSize: "var(--fs-2xs)", marginBottom: "var(--sp-1)" }}>
              <strong style={{ color: "#FF7BA8" }}>Guion:</strong> {approval.suggestedGuion.slice(0, 100)}{approval.suggestedGuion.length > 100 ? "…" : ""}
            </p>
          )}
          {approval.suggestedDescripcion && (
            <p style={{ fontSize: "var(--fs-2xs)" }}>
              <strong style={{ color: "var(--accent)" }}>Descripción:</strong> {approval.suggestedDescripcion.slice(0, 100)}{approval.suggestedDescripcion.length > 100 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className={`btn-copy${copied ? " is-copied" : ""}`}
      aria-label={copied ? "Copiado al portapapeles" : "Copiar la descripción"}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      style={{ position: "absolute", top: "var(--sp-2)", right: "var(--sp-2)" }}
    >
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

const styles = {
  page: {
    background: "var(--bg)",
    color: "var(--text)",
    minHeight: "100dvh",
    maxWidth: 640,
    margin: "0 auto",
    paddingBottom: "calc(var(--sp-10) + var(--safe-bottom))",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    padding: "var(--sp-5)",
    textAlign: "center",
    background: "var(--bg)",
    color: "var(--text)",
  },
  header: {
    padding: "calc(var(--sp-8) + var(--safe-top)) var(--sp-5) var(--sp-6)",
    textAlign: "center",
    borderRadius: "0 0 18px 18px",
  },
  statsBar: {
    display: "flex",
    justifyContent: "space-around",
    padding: "var(--sp-4) var(--sp-4)",
    background: "var(--card)",
    margin: "0 var(--sp-4)",
    borderRadius: "var(--radius)",
    marginTop: -8,
    border: "1px solid var(--border)",
    position: "relative",
    zIndex: 1,
  },
  stat: {
    textAlign: "center",
  },
  statNum: {
    fontSize: "var(--fs-xl)",
    fontWeight: 900,
  },
  statLabel: {
    fontSize: "var(--fs-3xs)",
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: ".04em",
    fontWeight: 600,
  },
  progressSection: {
    padding: "var(--sp-3) var(--sp-4)",
    position: "sticky",
    top: 0,
    background: "var(--bg)",
    zIndex: 10,
  },
  campaignSection: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    margin: "0 var(--sp-4) var(--sp-3)",
    overflow: "hidden",
  },
  visualRefsSection: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    margin: "0 var(--sp-4) var(--sp-3)",
    padding: "var(--sp-4)",
  },
  campaignToggle: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "var(--sp-4)",
    background: "transparent",
    border: "none",
    color: "var(--text)",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  sectionHeading: {
    fontSize: "var(--fs-3xs)",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: ".06em",
    fontWeight: 700,
    marginBottom: "var(--sp-2)",
    marginTop: "var(--sp-3)",
  },
  weekIdeaBlock: {
    background: "var(--bg)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--sp-3)",
    marginBottom: "var(--sp-2)",
  },
  weekBadgeSm: {
    background: "var(--accent-soft)",
    color: "var(--accent)",
    padding: "var(--sp-1) var(--sp-2)",
    borderRadius: 10,
    fontSize: "var(--fs-3xs)",
    fontWeight: 700,
  },
  expandBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "var(--sp-2) var(--sp-3)",
    background: "var(--card-alt)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-xs)",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "var(--fs-2xs)",
    fontWeight: 600,
    fontFamily: "inherit",
    marginBottom: "var(--sp-1)",
  },
  weekHeader: {
    display: "flex",
    alignItems: "center",
    gap: "var(--sp-3)",
    flexWrap: "wrap",
    padding: "0 var(--sp-4) var(--sp-2)",
  },
  weekBadge: {
    background: "var(--accent-soft)",
    color: "var(--accent)",
    padding: "var(--sp-1) var(--sp-3)",
    borderRadius: 20,
    fontSize: "var(--fs-2xs)",
    fontWeight: 700,
  },
  dayCard: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    margin: "0 var(--sp-4) var(--sp-3)",
    overflow: "hidden",
  },
  dayHeader: {
    display: "flex",
    alignItems: "center",
    gap: "var(--sp-3)",
    padding: "var(--sp-4)",
    borderBottom: "1px solid var(--border)",
    background: "var(--card-alt)",
  },
  dayNum: {
    color: "#fff",
    fontSize: "var(--fs-lg)",
    fontWeight: 900,
    padding: "var(--sp-1) var(--sp-3)",
    borderRadius: "var(--radius-sm)",
    minWidth: 44,
    textAlign: "center",
    flexShrink: 0,
  },
  postCard: {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--sp-3)",
    marginBottom: "var(--sp-3)",
    transition: "border-color .3s",
  },
  contentBox: {
    background: "var(--card-alt)",
    borderRadius: "var(--radius-xs)",
    padding: "var(--sp-3)",
    // 14px: es el texto que el cliente lee de verdad en el móvil.
    fontSize: "var(--fs-sm)",
    color: "#C8D8E8",
    lineHeight: "var(--lh-relaxed)",
    marginBottom: "var(--sp-2)",
    position: "relative",
  },
  fieldLabel: {
    fontSize: "var(--fs-3xs)",
    textTransform: "uppercase",
    letterSpacing: ".06em",
    display: "block",
    marginBottom: "var(--sp-1)",
  },
  approveBtn: {
    background: "#0d2a0d",
    color: "var(--success)",
    border: "1px solid #388E3C",
  },
  changesBtn: {
    background: "#2a0d0d",
    color: "var(--danger)",
    border: "1px solid #C62828",
  },
  commentDisplay: {
    marginTop: "var(--sp-3)",
    padding: "var(--sp-2) var(--sp-3)",
    background: "#2a1a0a",
    border: "1px solid var(--alt-line)",
    borderRadius: "var(--radius-xs)",
    fontSize: "var(--fs-2xs)",
    color: "#FFC166",
  },
  summary: {
    margin: "0 var(--sp-4)",
    padding: "var(--sp-4)",
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
  },
};
