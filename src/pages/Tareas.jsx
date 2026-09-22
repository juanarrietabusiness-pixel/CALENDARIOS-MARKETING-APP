import { useState, useEffect, useCallback } from "react";
import Icon from "../components/Icon";
import { loadAllTasks, completeQuickTask, reopenQuickTask } from "../lib/db";
import { navegar } from "../lib/rutas";

const FILTROS = { all: "Todas", pending: "Pendientes", completed: "Completadas" };
const RECURRENCE_LABELS = { none: "", daily: "Diaria", weekly: "Semanal", monthly: "Mensual" };

export default function Tareas({ clients = [], pulso = 0, onSelectClient }) {
  const [clientTasks, setClientTasks] = useState([]);
  const [quickTasks, setQuickTasks] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);

  const clientMap = {};
  for (const c of clients) {
    clientMap[c.id] = c.name;
    if (c.dbId) clientMap[c.dbId] = c.name;
  }

  const cargar = useCallback(async () => {
    try {
      const { clientTasks: ct, quickTasks: qt } = await loadAllTasks();
      setClientTasks(ct || []);
      setQuickTasks(qt || []);
    } catch (e) {
      console.error("No se pudieron cargar las tareas:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar, pulso]);

  const filterFn = (t) => {
    if (filter === "all") return true;
    if (filter === "pending") return t.status !== "done" && t.status !== "completed";
    return t.status === "done" || t.status === "completed";
  };

  const filteredClient = clientTasks.filter(filterFn);
  const filteredQuick = quickTasks.filter(filterFn);

  const totalPending = clientTasks.filter((t) => t.status !== "done" && t.status !== "completed").length
    + quickTasks.filter((t) => t.status !== "done" && t.status !== "completed").length;
  const totalCompleted = clientTasks.filter((t) => t.status === "done" || t.status === "completed").length
    + quickTasks.filter((t) => t.status === "done" || t.status === "completed").length;
  const total = clientTasks.length + quickTasks.length;

  const byClient = {};
  for (const t of filteredClient) {
    const name = clientMap[t.client_id] || "Sin cliente";
    if (!byClient[name]) byClient[name] = { clientId: t.client_id, tasks: [] };
    byClient[name].tasks.push(t);
  }

  const toggleQuick = async (task) => {
    const isDone = task.status === "done" || task.status === "completed";
    try {
      if (isDone) {
        await reopenQuickTask(task.id);
        setQuickTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "pending", completed_at: null } : t));
      } else {
        await completeQuickTask(task.id);
        setQuickTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "done", completed_at: new Date().toISOString() } : t));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const pct = total > 0 ? Math.round((totalCompleted / total) * 100) : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navegar("/")} aria-label="Volver al panel">
          <Icon name="chevronLeft" size={18} />
        </button>
        <h1 style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>Todas las tareas</h1>
      </div>

      {/* Estadísticas */}
      <div className="stat-strip" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="stat-item">
          <span className="stat-num">{total}</span>
          <span className="stat-name">total</span>
        </div>
        <span className="stat-divider" aria-hidden="true" />
        <div className="stat-item">
          <span className="stat-num" style={{ color: "var(--accent)" }}>{totalPending}</span>
          <span className="stat-name">pendientes</span>
        </div>
        <span className="stat-divider" aria-hidden="true" />
        <div className="stat-item">
          <span className="stat-num" style={{ color: "var(--success)" }}>{totalCompleted}</span>
          <span className="stat-name">completadas</span>
        </div>
        {total > 0 && (
          <div className="stat-progress">
            <div className="progress-bar" style={{ flex: 1 }} role="progressbar" aria-label="Progreso de tareas" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="stat-name" style={{ fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="filter-bar" role="group" aria-label="Filtrar tareas" style={{ marginBottom: "var(--sp-4)" }}>
        {Object.entries(FILTROS).map(([k, label]) => (
          <button key={k} className={`filter-chip ${filter === k ? "active" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando tareas…</p>}

      {!loading && total === 0 && (
        <div className="empty-state">
          <Icon name="clipboardCheck" size={36} className="empty-state-icon" style={{ margin: "0 auto var(--sp-3)" }} />
          <p className="empty-state-title">Sin tareas</p>
          <p className="empty-state-text">Las tareas se crean desde cada cliente o desde las tareas rápidas.</p>
        </div>
      )}

      {/* Tareas rápidas (globales) */}
      {filteredQuick.length > 0 && (
        <section style={{ marginBottom: "var(--sp-5)" }}>
          <h2 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <Icon name="bolt" size={16} style={{ color: "var(--accent-alt)" }} /> Tareas rápidas
            <span className="badge" style={{ background: "var(--surface-2)", fontSize: "var(--fs-3xs)" }}>{filteredQuick.length}</span>
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filteredQuick.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => toggleQuick(t)} />
            ))}
          </div>
        </section>
      )}

      {/* Tareas por cliente */}
      {Object.entries(byClient).sort(([a], [b]) => a.localeCompare(b)).map(([name, { clientId, tasks }]) => (
        <section key={name} style={{ marginBottom: "var(--sp-5)" }}>
          <h2 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)", display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: "2px 6px" }}
              onClick={() => onSelectClient?.(clientId)}
            >
              <Icon name="building" size={14} /> {name}
            </button>
            <span className="badge" style={{ background: "var(--surface-2)", fontSize: "var(--fs-3xs)" }}>{tasks.length}</span>
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TaskRow({ task, onToggle }) {
  const isDone = task.status === "done" || task.status === "completed";
  const recLabel = RECURRENCE_LABELS[task.recurrence] || "";
  return (
    <div
      className="card"
      style={{
        display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3)",
        opacity: isDone ? 0.6 : 1,
      }}
    >
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={isDone ? "Reabrir tarea" : "Completar tarea"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: isDone ? "var(--success)" : "var(--text-dim)" }}
        >
          <Icon name={isDone ? "checkSquare" : "square"} size={18} />
        </button>
      )}
      {!onToggle && (
        <Icon name={isDone ? "check" : "clock"} size={16} style={{ color: isDone ? "var(--success)" : "var(--text-dim)", flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, fontSize: "var(--fs-xs)", textDecoration: isDone ? "line-through" : "none", color: isDone ? "var(--text-dim)" : "var(--text)" }}>
        {task.title}
      </span>
      {recLabel && (
        <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)", fontSize: "var(--fs-3xs)" }}>
          <Icon name="refresh" size={10} /> {recLabel}
        </span>
      )}
      {task.assigned_to && (
        <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>{task.assigned_to}</span>
      )}
      {task.due_date && (
        <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>
          <Icon name="calendar" size={10} /> {task.due_date.slice(5)}
        </span>
      )}
    </div>
  );
}
