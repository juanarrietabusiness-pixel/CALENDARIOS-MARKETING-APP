import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";

const RECURRENCE_LABELS = { none: "Una vez", weekly: "Semanal", monthly: "Mensual" };

export default function TaskPanel({ client }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newRecurrence, setNewRecurrence] = useState("none");
  const [showCompleted, setShowCompleted] = useState(false);
  const formId = useId();
  const clientId = client.dbId || client.id;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    db.loadClientTasks(clientId)
      .then((data) => { if (alive) setTasks(data); })
      .catch(() => { if (alive) setError("No se pudieron cargar las tareas."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [clientId]);

  const handleAdd = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const task = await db.saveClientTask({ client_id: clientId, title, recurrence: newRecurrence });
      setTasks((prev) => [...prev, task]);
      setNewTitle("");
      setNewRecurrence("none");
      setAdding(false);
    } catch {
      setError("No se pudo crear la tarea.");
    }
  }, [clientId, newTitle, newRecurrence]);

  const handleComplete = useCallback(async (taskId) => {
    try {
      const updated = await db.completeClientTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t));
    } catch {
      setError("No se pudo completar la tarea.");
    }
  }, []);

  const handleReopen = useCallback(async (taskId) => {
    try {
      const updated = await db.reopenClientTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t));
    } catch {
      setError("No se pudo reabrir la tarea.");
    }
  }, []);

  const handleDelete = useCallback(async (taskId) => {
    try {
      await db.deleteClientTask(taskId);
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
        <Icon name="list" size={16} style={{ color: "var(--accent)" }} />
        <span style={{ flex: 1 }}>Tareas</span>
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
              Cargando tareas…
            </p>
          )}

          {error && (
            <p role="alert" style={{ fontSize: "var(--fs-3xs)", color: "var(--danger)", padding: "var(--sp-1) 0" }}>
              {error}
            </p>
          )}

          {!loading && pending.length === 0 && completed.length === 0 && !adding && (
            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", padding: "var(--sp-2) 0" }}>
              Sin tareas. Pulsa + para añadir una.
            </p>
          )}

          {/* Tareas pendientes */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
            {pending.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={() => handleComplete(task.id)}
                onDelete={() => handleDelete(task.id)}
              />
            ))}
          </div>

          {/* Tareas completadas */}
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
                    <TaskRow
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

          {/* Formulario de nueva tarea */}
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
                <select
                  className="input"
                  value={newRecurrence}
                  onChange={(e) => setNewRecurrence(e.target.value)}
                  aria-label="Recurrencia"
                  style={{ fontSize: "var(--fs-3xs)", flex: 1 }}
                >
                  <option value="none">Una vez</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
                <button className="btn btn-primary" onClick={handleAdd} disabled={!newTitle.trim()} style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
                  Añadir
                </button>
                <button className="btn" onClick={() => { setAdding(false); setNewTitle(""); }} style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
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
              Añadir tarea
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, onComplete, onReopen, onDelete }) {
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
        {task.recurrence !== "none" && (
          <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
            {RECURRENCE_LABELS[task.recurrence]}
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

export function TaskTemplatesManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newRecurrence, setNewRecurrence] = useState("none");
  const [error, setError] = useState("");
  const formId = useId();

  useEffect(() => {
    db.loadTaskTemplates()
      .then(setTemplates)
      .catch(() => setError("No se pudieron cargar las plantillas."))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const tpl = await db.saveTaskTemplate({ title, recurrence: newRecurrence });
      setTemplates((prev) => [...prev, tpl]);
      setNewTitle("");
      setNewRecurrence("none");
    } catch {
      setError("No se pudo crear la plantilla.");
    }
  };

  const handleDelete = async (id) => {
    try {
      await db.deleteTaskTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError("No se pudo eliminar la plantilla.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
      <div style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--text)" }}>
        Plantillas de tareas obligatorias
      </div>
      <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", margin: 0 }}>
        Se crean automáticamente al dar de alta un cliente nuevo.
      </p>

      {error && (
        <p role="alert" style={{ fontSize: "var(--fs-3xs)", color: "var(--danger)" }}>{error}</p>
      )}

      {loading ? (
        <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>Cargando…</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
          {templates.map((tpl) => (
            <div key={tpl.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-2)",
              padding: "var(--sp-1) var(--sp-2)",
              background: "var(--surface-2)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--fs-3xs)",
            }}>
              <span style={{ flex: 1, color: "var(--text)" }}>{tpl.title}</span>
              {tpl.recurrence !== "none" && (
                <span style={{ color: "var(--text-faint)" }}>{RECURRENCE_LABELS[tpl.recurrence]}</span>
              )}
              <button
                className="btn-icon"
                onClick={() => handleDelete(tpl.id)}
                aria-label={`Eliminar plantilla: ${tpl.title}`}
                style={{ width: 24, height: 24, minHeight: 24 }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
        <label htmlFor={formId} className="sr-only">Nueva plantilla</label>
        <input
          id={formId}
          className="input"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Nueva plantilla…"
          style={{ flex: 1, fontSize: "var(--fs-3xs)" }}
        />
        <select
          className="input"
          value={newRecurrence}
          onChange={(e) => setNewRecurrence(e.target.value)}
          aria-label="Recurrencia"
          style={{ fontSize: "var(--fs-3xs)", width: 100 }}
        >
          <option value="none">Una vez</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
        </select>
        <button className="btn btn-primary" onClick={handleAdd} disabled={!newTitle.trim()} style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
          <Icon name="plus" size={14} />
        </button>
      </div>
    </div>
  );
}
