import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";

export default function QuickTasksPanel({ pulso = 0 }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssigned, setNewAssigned] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const formId = useId();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    db.loadQuickTasks()
      .then((data) => { if (alive) setTasks(data); })
      .catch(() => { if (alive) setError("No se pudieron cargar las tareas rápidas."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [pulso]);

  const handleAdd = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const task = await db.saveQuickTask({ title, assigned_to: newAssigned.trim() });
      setTasks((prev) => [...prev, task]);
      setNewTitle("");
      setNewAssigned("");
      setAdding(false);
    } catch {
      setError("No se pudo crear la tarea rápida.");
    }
  }, [newTitle, newAssigned]);

  const handleComplete = useCallback(async (taskId) => {
    try {
      const updated = await db.completeQuickTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t));
    } catch {
      setError("No se pudo completar la tarea.");
    }
  }, []);

  const handleReopen = useCallback(async (taskId) => {
    try {
      const updated = await db.reopenQuickTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t));
    } catch {
      setError("No se pudo reabrir la tarea.");
    }
  }, []);

  const handleDelete = useCallback(async (taskId) => {
    try {
      await db.deleteQuickTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      setError("No se pudo eliminar la tarea.");
    }
  }, []);

  const pending = tasks.filter((t) => t.status === "pending");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <section style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-2)",
          padding: "var(--sp-3) var(--sp-4)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text)",
          fontSize: "var(--fs-sm)",
          fontWeight: 600,
          textAlign: "left",
        }}
      >
        <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={16} />
        <Icon name="inbox" size={16} style={{ color: "var(--accent)" }} />
        <span style={{ flex: 1 }}>Tareas rápidas</span>
        {pending.length > 0 && (
          <span style={{
            fontSize: "var(--fs-3xs)",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            padding: "1px 8px",
            borderRadius: "var(--radius-pill)",
            fontWeight: 600,
          }}>
            {pending.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div style={{ padding: "0 var(--sp-4) var(--sp-3)" }}>
          {loading && (
            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", padding: "var(--sp-2) 0" }}>
              Cargando…
            </p>
          )}

          {error && (
            <p role="alert" style={{ fontSize: "var(--fs-3xs)", color: "var(--danger)", padding: "var(--sp-1) 0" }}>
              {error}
            </p>
          )}

          {!loading && pending.length === 0 && completed.length === 0 && !adding && (
            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", padding: "var(--sp-2) 0" }}>
              Sin tareas rápidas. Pulsa + para añadir una.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
            {pending.map((task) => (
              <QuickRow
                key={task.id}
                task={task}
                onComplete={() => handleComplete(task.id)}
                onDelete={() => handleDelete(task.id)}
              />
            ))}
          </div>

          {completed.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "var(--fs-3xs)",
                  color: "var(--text-dim)",
                  padding: "var(--sp-2) 0 var(--sp-1)",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--sp-1)",
                }}
              >
                <Icon name={showCompleted ? "chevronDown" : "chevronRight"} size={12} />
                {completed.length} completada{completed.length === 1 ? "" : "s"}
              </button>
              {showCompleted && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
                  {completed.map((task) => (
                    <QuickRow
                      key={task.id}
                      task={task}
                      onReopen={() => handleReopen(task.id)}
                      onDelete={() => handleDelete(task.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {adding ? (
            <div style={{
              marginTop: "var(--sp-2)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-2)",
            }}>
              <label htmlFor={formId} className="sr-only">Título de la tarea</label>
              <input
                id={formId}
                className="input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="Título de la tarea…"
                autoFocus
                style={{ fontSize: "var(--fs-xs)" }}
              />
              <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
                <input
                  className="input"
                  value={newAssigned}
                  onChange={(e) => setNewAssigned(e.target.value)}
                  placeholder="Asignar a…"
                  aria-label="Asignar a"
                  style={{ fontSize: "var(--fs-3xs)", flex: 1 }}
                />
                <button className="btn btn-primary" onClick={handleAdd} disabled={!newTitle.trim()} style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
                  Añadir
                </button>
                <button className="btn" onClick={() => { setAdding(false); setNewTitle(""); setNewAssigned(""); }} style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                marginTop: "var(--sp-2)",
                background: "none",
                border: "1px dashed var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                width: "100%",
                padding: "var(--sp-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--sp-1)",
                fontSize: "var(--fs-3xs)",
                color: "var(--text-dim)",
              }}
            >
              <Icon name="plus" size={14} />
              Añadir tarea rápida
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function QuickRow({ task, onComplete, onReopen, onDelete }) {
  const isDone = task.status === "completed";
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--sp-2)",
      padding: "var(--sp-1) 0",
      opacity: isDone ? 0.6 : 1,
    }}>
      <button
        type="button"
        className="btn-icon"
        onClick={isDone ? onReopen : onComplete}
        aria-label={isDone ? "Reabrir tarea" : "Completar tarea"}
        style={{
          width: 22,
          height: 22,
          minHeight: 22,
          borderRadius: "var(--radius-sm)",
          border: isDone ? "none" : "1.5px solid var(--border-strong)",
          background: isDone ? "var(--accent)" : "transparent",
          color: isDone ? "#fff" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {isDone && <Icon name="check" size={14} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: "var(--fs-xs)",
          textDecoration: isDone ? "line-through" : "none",
          color: isDone ? "var(--text-dim)" : "var(--text)",
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {task.title}
        </span>
        {task.assigned_to && (
          <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
            {task.assigned_to}
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn-icon"
        onClick={onDelete}
        aria-label={`Eliminar tarea: ${task.title}`}
        style={{ width: 24, height: 24, minHeight: 24, flexShrink: 0 }}
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}
