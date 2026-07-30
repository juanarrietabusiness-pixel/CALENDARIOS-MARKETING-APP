import { useState, useRef } from "react";
import { FORMATS, STATUSES, MONTHS, DAYS } from "../constants";
import { fmtDate, compressImage, parseVideoURL } from "../utils";
import { callAI, buildClientContext, fetchGitHubADN } from "../api";
import { buildExportHTML } from "../export";

function PostSidePanel({ post, day, onUpdate, onClose }) {
  const [form, setForm] = useState({ ...post });
  const imgRef = useRef();
  const sf = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const f = FORMATS[form.format] || FORMATS.post;
  const scriptLabel = form.format === "post" ? "Descripción" : "Guión";

  const save = () => onUpdate(day.date, form);

  return (
    <div className="panel-right">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{f.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{f.label} — {day.dayName} {(day.date || "").split("-")[2]}</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{day.date}</div>
          </div>
        </div>
        <button className="btn-icon" onClick={() => { save(); onClose(); }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label className="label">Formato</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(FORMATS).map(([k, fmt]) => (
              <button
                key={k}
                onClick={() => sf("format", k)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: `1px solid ${form.format === k ? fmt.color : "var(--border)"}`,
                  cursor: "pointer",
                  background: form.format === k ? fmt.color + "33" : "var(--card-alt)",
                  color: form.format === k ? fmt.color : "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {fmt.icon} {fmt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">Estado</label>
          <div className="status-bar">
            {Object.entries(STATUSES).map(([k, st]) => (
              <button
                key={k}
                className="status-btn"
                onClick={() => sf("status", k)}
                style={{
                  background: form.status === k ? st.bg : "var(--bg)",
                  color: st.text,
                  borderColor: form.status === k ? st.border : "var(--border)",
                  fontWeight: form.status === k ? 700 : 400,
                }}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">Categoría</label>
          <input className="input" value={form.category || ""} onChange={(e) => sf("category", e.target.value)} placeholder="Categoría..." />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">Idea</label>
          <textarea className="textarea" value={form.idea || ""} onChange={(e) => sf("idea", e.target.value)} placeholder="Idea del contenido..." />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">{scriptLabel}</label>
          <textarea
            className="textarea"
            style={{ minHeight: 120, lineHeight: 1.8 }}
            value={form.script || ""}
            onChange={(e) => sf("script", e.target.value)}
            placeholder={`${scriptLabel} del contenido...`}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">Imagen</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {form.image && <img src={form.image} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8 }} />}
            <input
              ref={imgRef}
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files[0];
                if (file) sf("image", await compressImage(file, 400));
              }}
              style={{ display: "none" }}
            />
            <button className="btn btn-secondary btn-sm" onClick={() => imgRef.current?.click()}>
              {form.image ? "Cambiar" : "Subir"}
            </button>
            {form.image && (
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => sf("image", null)}>
                Quitar
              </button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">Link de referencia</label>
          <input className="input" value={form.referenceLink || ""} onChange={(e) => sf("referenceLink", e.target.value)} placeholder="https://..." />
          {form.referenceLink && (() => {
            const v = parseVideoURL(form.referenceLink);
            if (v?.type === "youtube") return <img src={v.thumbnail} alt="" style={{ width: "100%", maxWidth: 250, borderRadius: 8, marginTop: 8 }} />;
            return null;
          })()}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="label">Comentario</label>
          <textarea className="textarea" value={form.comment || ""} onChange={(e) => sf("comment", e.target.value)} placeholder="Notas internas..." style={{ minHeight: 50 }} />
        </div>
      </div>

      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => { save(); onClose(); }}>
          Guardar cambios
        </button>
      </div>
    </div>
  );
}

function MonthGrid({ cal, onPostClick, onMove }) {
  const [drag, setDrag] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const today = fmtDate(new Date());

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

  return (
    <div className="cal-grid">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((n) => (
        <div key={n} className="cal-header-cell">{n}</div>
      ))}
      {cells().map((date) => {
        const d = new Date(date + "T12:00:00");
        const dd = cal.days?.find((dd) => dd.date === date);
        const cur = d.getMonth() === cal.month;
        const isToday = date === today;
        const isDrop = dropTarget === date;

        return (
          <div
            key={date}
            className={`cal-cell ${!cur ? "outside" : ""} ${isToday ? "today" : ""} ${isDrop ? "drop-target" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDropTarget(date); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (drag && drag.sourceDate !== date) onMove(drag.postId, drag.sourceDate, date);
              setDrag(null);
              setDropTarget(null);
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--accent)" : cur ? "#fff" : "#444", textAlign: "right", marginBottom: 3, padding: "0 2px" }}>
              {d.getDate()}
            </div>
            {(dd?.posts || []).map((post) => {
              const f = FORMATS[post.format] || FORMATS.post;
              const st = STATUSES[post.status || "pending"];
              return (
                <div
                  key={post.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ postId: post.id, sourceDate: date }); }}
                  onDragEnd={() => { setDrag(null); setDropTarget(null); }}
                  onClick={() => onPostClick(post, dd)}
                  style={{
                    background: f.color + "22",
                    border: "1px solid " + st.border + "88",
                    borderRadius: 4,
                    padding: "2px 4px",
                    marginBottom: 2,
                    cursor: "grab",
                    fontSize: 8,
                    color: f.color,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.icon} {post.category || post.idea?.slice(0, 12) || f.label}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function CalendarView({
  client,
  cal,
  calId,
  apiKey,
  onUpdateCal,
  onDeleteCal,
  onDuplicateCal,
}) {
  const [viewMode, setViewMode] = useState("list");
  const [expandedDay, setExpandedDay] = useState(null);
  const [sidePanel, setSidePanel] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");
  const [filterWeek, setFilterWeek] = useState("all");
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(cal.name || (MONTHS[cal.month] + " " + cal.year));
  const [genLoading, setGenLoading] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [genProgress, setGenProgress] = useState(0);

  const calName = cal.name || (MONTHS[cal.month] + " " + cal.year);
  const totalPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).length, 0);
  const approvedPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).filter((p) => p.status === "approved" || p.status === "published").length, 0);
  const publishedPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).filter((p) => p.status === "published").length, 0);

  const weeks = [...new Set((cal.days || []).map((d) => d.weekNumber || 1))].sort((a, b) => a - b);

  const filteredDays = (cal.days || []).map((day) => ({
    ...day,
    posts: (day.posts || []).filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterFormat !== "all" && p.format !== filterFormat) return false;
      return true;
    }),
  })).filter((day) => {
    if (filterWeek !== "all" && String(day.weekNumber) !== filterWeek) return false;
    return day.posts.length > 0 || (filterStatus === "all" && filterFormat === "all");
  });

  const updatePost = (date, updatedPost) => {
    const newDays = (cal.days || []).map((d) =>
      d.date !== date ? d : { ...d, posts: d.posts.map((p) => (p.id === updatedPost.id ? updatedPost : p)) }
    );
    onUpdateCal(calId, { ...cal, days: newDays });
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

  const generateScripts = async () => {
    if (!apiKey || genLoading) return;
    setGenLoading(true);
    setGenProgress(0);
    setGenStatus("Generando guiones...");

    try {
      let adnExtra = "";
      if (client.githubRepo) {
        setGenStatus("Cargando ADN desde GitHub...");
        adnExtra = await fetchGitHubADN(client.githubRepo);
      }

      const days = cal.days || [];
      const postsToGen = days.flatMap((d) => (d.posts || []).filter((p) => !p.script).map((p) => ({ ...p, _date: d.date })));

      if (!postsToGen.length) {
        setGenStatus("Todos los posts ya tienen guión.");
        setTimeout(() => { setGenLoading(false); setGenStatus(""); }, 1500);
        return;
      }

      const BATCH = 6;
      let allScripts = {};

      for (let i = 0; i < postsToGen.length; i += BATCH) {
        const batch = postsToGen.slice(i, i + BATCH);
        setGenStatus(`Guiones ${i + 1}-${Math.min(i + BATCH, postsToGen.length)}/${postsToGen.length}...`);
        setGenProgress(Math.round((i / postsToGen.length) * 90));

        const ctx = buildClientContext(client, cal, adnExtra);
        const content = [{
          type: "text",
          text: `${ctx}

Genera guiones/descripciones para estas publicaciones.
ESTILO: ${client.estiloGuion || "Cercano, persuasivo"}
WA: ${client.whatsapp || "N/A"}
HASHTAGS: ${client.hashtags || "#Panama"}

REGLAS:
- post/carrusel: caption con emojis + CTA + hashtags
- reel: guión escena por escena (Hook/Desarrollo/CTA)
- live/historia: nota breve

FORMATO:
===POST===
ID: [id]
CONTENIDO:
contenido
===FIN===

PUBLICACIONES:
${batch.map((p) => `---\nID: ${p.id}\nFORMATO: ${p.format}\nCATEGORÍA: ${p.category || "N/A"}\nIDEA: ${p.idea || "según contexto"}`).join("\n")}`,
        }];

        for (const p of batch) {
          if (p.image) {
            content.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: p.image.includes(",") ? p.image.split(",")[1] : p.image },
            });
          }
        }

        const txt = await callAI(apiKey, content);
        for (const block of txt.split("===POST===").slice(1)) {
          const idMatch = block.match(/ID:\s*(\S+)/);
          const contentMatch = block.match(/CONTENIDO:\n?([\s\S]*?)(?:===|$)/);
          if (idMatch && contentMatch) allScripts[idMatch[1].trim()] = contentMatch[1].trim();
        }
      }

      const newDays = (cal.days || []).map((d) => ({
        ...d,
        posts: (d.posts || []).map((p) => (allScripts[p.id] ? { ...p, script: allScripts[p.id] } : p)),
      }));
      onUpdateCal(calId, { ...cal, days: newDays });

      setGenProgress(100);
      setGenStatus("Guiones listos!");
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 1000);
    } catch (e) {
      setGenStatus("Error: " + e.message);
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 3000);
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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {renaming ? (
          <input
            className="input"
            style={{ flex: 1, fontSize: 14, fontWeight: 700 }}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            autoFocus
            onBlur={() => { onUpdateCal(calId, { ...cal, name: nameVal }); setRenaming(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onUpdateCal(calId, { ...cal, name: nameVal }); setRenaming(false); } }}
          />
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{calName}</span>
            <button className="btn-icon" onClick={() => setRenaming(true)} data-tip="Renombrar">✏️</button>
            <button className="btn-icon" onClick={() => onDuplicateCal(calId)} data-tip="Duplicar">📋</button>
            <button className="btn-icon" style={{ color: "var(--danger)" }} onClick={() => { if (window.confirm("¿Eliminar este calendario?")) onDeleteCal(calId); }}>🗑️</button>
          </>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
        {[
          ["Posts", totalPosts, "var(--accent)"],
          ["Aprobados", approvedPosts, "var(--success)"],
          ["Publicados", publishedPosts, "var(--purple)"],
          ["Días", (cal.days || []).length, "var(--accent-alt)"],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: "var(--card)", border: `1px solid ${color}33`, borderRadius: 10, padding: 10, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      {totalPosts > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>
            <span>Progreso</span>
            <span>{Math.round((approvedPosts / totalPosts) * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(approvedPosts / totalPosts) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button className="btn btn-accent" style={{ flex: 2 }} onClick={generateScripts} disabled={genLoading}>
          {genLoading ? genStatus : "Generar Guiones"}
        </button>
        <button className="btn btn-secondary" onClick={() => setViewMode((m) => (m === "list" ? "grid" : "list"))}>
          {viewMode === "list" ? "Calendario" : "Lista"}
        </button>
        <button className="btn btn-secondary no-print" onClick={exportPDF}>PDF</button>
        <button className="btn btn-secondary" onClick={exportHTML}>HTML</button>
      </div>

      {/* Generation progress */}
      {genLoading && genProgress > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
            <span>{genStatus}</span>
            <span>{genProgress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${genProgress}%` }} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <button className={`filter-chip ${filterStatus === "all" ? "active" : ""}`} onClick={() => setFilterStatus("all")}>Todos</button>
        {Object.entries(STATUSES).map(([k, st]) => (
          <button key={k} className={`filter-chip ${filterStatus === k ? "active" : ""}`} onClick={() => setFilterStatus(k)}>{st.label}</button>
        ))}
      </div>
      <div className="filter-bar">
        <button className={`filter-chip ${filterFormat === "all" ? "active" : ""}`} onClick={() => setFilterFormat("all")}>Todos</button>
        {Object.entries(FORMATS).map(([k, f]) => (
          <button key={k} className={`filter-chip ${filterFormat === k ? "active" : ""}`} onClick={() => setFilterFormat(k)}>{f.icon} {f.label}</button>
        ))}
      </div>
      {weeks.length > 1 && (
        <div className="filter-bar">
          <button className={`filter-chip ${filterWeek === "all" ? "active" : ""}`} onClick={() => setFilterWeek("all")}>Todas</button>
          {weeks.map((w) => (
            <button key={w} className={`filter-chip ${filterWeek === String(w) ? "active" : ""}`} onClick={() => setFilterWeek(String(w))}>Sem {w}</button>
          ))}
        </div>
      )}

      {/* Grid view */}
      {viewMode === "grid" ? (
        <MonthGrid
          cal={{ ...cal, days: filteredDays }}
          onPostClick={(post, day) => setSidePanel({ post, day })}
          onMove={movePost}
        />
      ) : (
        /* List view */
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredDays.map((day) => {
            const isExpanded = expandedDay === day.date;
            return (
              <div key={day.date} className="card">
                <div
                  onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                  style={{ padding: "11px 13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 54 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        background: client.primaryColor || "var(--accent)",
                        borderRadius: 8,
                        padding: "3px 8px",
                        textAlign: "center",
                        flexShrink: 0,
                        minWidth: 42,
                      }}
                    >
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,.8)", fontWeight: 600 }}>{(day.dayName || "").slice(0, 3).toUpperCase()}</div>
                      <div style={{ fontSize: 15, fontWeight: 900 }}>{(day.date || "").split("-")[2]}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {day.category || day.dayName}
                        {day.specialDate && <span style={{ color: "var(--accent-alt)", marginLeft: 6, fontSize: 10 }}>{day.specialDate}</span>}
                      </div>
                      {day.concept && <div style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>{day.concept}</div>}
                      <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                        {(day.posts || []).map((p) => {
                          const f = FORMATS[p.format] || FORMATS.post;
                          return (
                            <span key={p.id} className="badge" style={{ background: f.color + "22", color: f.color, border: `1px solid ${f.color}44` }}>
                              {f.icon} {p.category || f.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <span style={{ color: "var(--text-muted)", fontSize: 12, flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
                {isExpanded && (
                  <div style={{ padding: "0 13px 13px", borderTop: "1px solid var(--border)" }}>
                    {(day.posts || []).map((post) => {
                      const f = FORMATS[post.format] || FORMATS.post;
                      const st = STATUSES[post.status || "pending"];
                      return (
                        <div
                          key={post.id}
                          onClick={() => setSidePanel({ post, day })}
                          style={{
                            background: "var(--bg)",
                            borderRadius: 10,
                            marginTop: 10,
                            border: `1px solid ${st.border}44`,
                            padding: "10px 12px",
                            cursor: "pointer",
                            transition: "border-color .2s",
                          }}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ postId: post.id, sourceDate: day.date }))}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 16 }}>{f.icon}</span>
                            <span className="badge" style={{ background: f.color + "22", color: f.color }}>{f.label}</span>
                            <span className="badge" style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>{st.label}</span>
                          </div>
                          {post.category && <div style={{ fontSize: 11, color: "var(--accent-alt)", fontWeight: 600, marginBottom: 4 }}>{post.category}</div>}
                          {post.idea && <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 4 }}>{post.idea}</div>}
                          {post.script && (
                            <div style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--card-alt)", borderRadius: 6, padding: 8, lineHeight: 1.6, maxHeight: 80, overflow: "hidden" }}>
                              {post.script.slice(0, 150)}{post.script.length > 150 ? "..." : ""}
                            </div>
                          )}
                          {post.image && <img src={post.image} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, marginTop: 6 }} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Side panel */}
      {sidePanel && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 240 }} onClick={() => setSidePanel(null)} />
          <PostSidePanel
            post={sidePanel.post}
            day={sidePanel.day}
            onUpdate={updatePost}
            onClose={() => setSidePanel(null)}
          />
        </>
      )}
    </div>
  );
}
