import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { useDialogA11y } from "../hooks/useDialogA11y";

export default function QuickTasksPanel({ pulso = 0 }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssigned, setNewAssigned] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [dragId, setDragId] = useState(null);
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
      const task = await db.saveQuickTask({
        title,
        description: newDescription.trim(),
        assigned_to: newAssigned.trim(),
      });
      setTasks((prev) => [...prev, task]);
      setNewTitle("");
      setNewDescription("");
      setNewAssigned("");
      setAdding(false);
    } catch {
      setError("No se pudo crear la tarea rápida.");
    }
  }, [newTitle, newDescription, newAssigned]);

  const handleUpdate = useCallback(async (taskId, data) => {
    try {
      const updated = await db.updateQuickTask(taskId, data);
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t));
      if (editingTask?.id === taskId) setEditingTask(null);
      if (detailTask?.id === taskId) setDetailTask(updated);
    } catch {
      setError("No se pudo actualizar la tarea.");
    }
  }, [editingTask, detailTask]);

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
      if (detailTask?.id === taskId) setDetailTask(null);
    } catch {
      setError("No se pudo eliminar la tarea.");
    }
  }, [detailTask]);

  const handleDragStart = (id) => setDragId(id);

  const handleDragOver = useCallback((e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setTasks((prev) => {
      const from = prev.findIndex((t) => t.id === dragId);
      const to = prev.findIndex((t) => t.id === targetId);
      if (from < 0 || to < 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }, [dragId]);

  const handleDragEnd = useCallback(() => {
    if (dragId) {
      const pendingIds = tasks.filter((t) => t.status === "pending").map((t) => t.id);
      db.reorderQuickTasks(pendingIds).catch(() => {});
    }
    setDragId(null);
  }, [dragId, tasks]);

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
                onEdit={() => setEditingTask(task)}
                onDetail={() => setDetailTask(task)}
                onDragStart={() => handleDragStart(task.id)}
                onDragOver={(e) => handleDragOver(e, task.id)}
                onDragEnd={handleDragEnd}
                isDragging={dragId === task.id}
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
                      onDetail={() => setDetailTask(task)}
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
              <textarea
                className="input"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descripción (opcional)…"
                aria-label="Descripción de la tarea"
                rows={2}
                style={{ fontSize: "var(--fs-3xs)", resize: "vertical", minHeight: 40 }}
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
                <button className="btn" onClick={() => { setAdding(false); setNewTitle(""); setNewDescription(""); setNewAssigned(""); }} style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
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

      {editingTask && (
        <QuickEditModal
          task={editingTask}
          onSave={(data) => handleUpdate(editingTask.id, data)}
          onClose={() => setEditingTask(null)}
        />
      )}

      {detailTask && !editingTask && (
        <QuickDetailModal
          task={detailTask}
          onEdit={() => setEditingTask(detailTask)}
          onClose={() => setDetailTask(null)}
        />
      )}
    </section>
  );
}

function QuickRow({ task, onComplete, onReopen, onDelete, onEdit, onDetail, onDragStart, onDragOver, onDragEnd, isDragging }) {
  const isDone = task.status === "completed";
  const [showDesc, setShowDesc] = useState(false);

  return (
    <div
      draggable={!isDone && Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-1) 0",
        opacity: isDragging ? 0.5 : isDone ? 0.6 : 1,
        cursor: !isDone && onDragStart ? "grab" : undefined,
      }}
    >
      {!isDone && onDragStart && (
        <span style={{ color: "var(--text-faint)", flexShrink: 0, cursor: "grab", display: "flex" }}>
          <Icon name="grip" size={14} />
        </span>
      )}
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
      <div
        style={{ flex: 1, minWidth: 0, cursor: onDetail ? "pointer" : undefined }}
        onClick={onDetail}
        role={onDetail ? "button" : undefined}
        tabIndex={onDetail ? 0 : undefined}
        onKeyDown={onDetail ? (e) => { if (e.key === "Enter") onDetail(); } : undefined}
      >
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
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center" }}>
          {task.assigned_to && (
            <span style={{ fontSize: "var(--fs-3xs)", color: "var(--accent)" }}>
              {task.assigned_to}
            </span>
          )}
          {task.description && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowDesc(!showDesc); }}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontSize: "var(--fs-3xs)", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: 2,
              }}
              aria-label={showDesc ? "Ocultar descripción" : "Ver descripción"}
            >
              <Icon name={showDesc ? "chevronUp" : "chevronDown"} size={10} />
              <Icon name="message" size={10} />
            </button>
          )}
        </div>
        {showDesc && task.description && (
          <p style={{
            fontSize: "var(--fs-3xs)",
            color: "var(--text-dim)",
            margin: "var(--sp-1) 0 0",
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
          }}>
            {task.description}
          </p>
        )}
      </div>
      {onEdit && !isDone && (
        <button
          type="button"
          className="btn-icon"
          onClick={onEdit}
          aria-label={`Editar tarea: ${task.title}`}
          style={{ width: 24, height: 24, minHeight: 24, flexShrink: 0 }}
        >
          <Icon name="pencil" size={14} />
        </button>
      )}
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

function QuickEditModal({ task, onSave, onClose }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [assigned, setAssigned] = useState(task.assigned_to || "");
  const dialogRef = useDialogA11y(onClose);

  const handleSubmit = () => {
    onSave({
      title: title.trim(),
      description: description.trim(),
      assigned_to: assigned.trim(),
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button type="button" onClick={onClose} aria-label="Cerrar" style={{ position: "absolute", inset: 0, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer" }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Editar tarea rápida"
        style={{
          position: "relative",
          background: "var(--surface)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--elev-2)",
          padding: "var(--sp-4)",
          width: 380,
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Editar tarea rápida</span>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" style={{ fontSize: "var(--fs-xs)" }} />
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción…" rows={3} style={{ fontSize: "var(--fs-3xs)", resize: "vertical" }} />
        <input className="input" value={assigned} onChange={(e) => setAssigned(e.target.value)} placeholder="Asignar a…" aria-label="Asignar a" style={{ fontSize: "var(--fs-3xs)" }} />
        <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} style={{ fontSize: "var(--fs-3xs)" }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!title.trim()} style={{ fontSize: "var(--fs-3xs)" }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function QuickDetailModal({ task, onEdit, onClose }) {
  const dialogRef = useDialogA11y(onClose);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button type="button" onClick={onClose} aria-label="Cerrar" style={{ position: "absolute", inset: 0, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer" }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de tarea rápida"
        style={{
          position: "relative",
          background: "var(--surface)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--elev-2)",
          padding: "var(--sp-4)",
          width: 380,
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{task.title}</span>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        {task.description && (
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>
            {task.description}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>
          <span>Estado: {task.status === "completed" ? "Completada" : "Pendiente"}</span>
          {task.assigned_to && <span>Asignada a: <strong style={{ color: "var(--accent)" }}>{task.assigned_to}</strong></span>}
          {task.created_at && <span>Creada: {new Date(task.created_at).toLocaleDateString("es-PA")}</span>}
          {task.completed_at && <span>Completada: {new Date(task.completed_at).toLocaleDateString("es-PA")}</span>}
        </div>
        {task.status !== "completed" && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { onClose(); onEdit(); }}>
              <Icon name="pencil" size={14} /> Editar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
