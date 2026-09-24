import { useState, useEffect, useCallback, useId } from "react";
import Icon from "./Icon";
import LimpiezaTerminadas from "./LimpiezaTerminadas";
import CampoResponsable from "./CampoResponsable";
import SelectorFecha from "./SelectorFecha";
import * as db from "../lib/db";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { fechaEnZona, textoFecha, textoAtraso, fechaObjetivo, diasEntre } from "../lib/agenda";

const RECURRENCE_LABELS = { none: "Una vez", daily: "Diaria", weekly: "Semanal", monthly: "Mensual" };

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const MONTHLY_ANCHORS = [
  { value: "", label: "Elegir…" },
  { value: "1", label: "Día 1" },
  { value: "15", label: "Día 15" },
  { value: "last_monday", label: "Último lunes" },
  { value: "last_friday", label: "Último viernes" },
  { value: "week_before_end", label: "Semana antes del cierre" },
];

function formatRecurrenceDetail(recurrence, recurrenceDay) {
  if (recurrence === "weekly" && recurrenceDay != null) {
    return `Cada ${DAY_NAMES[recurrenceDay] ?? "semana"}`;
  }
  if (recurrence === "monthly" && recurrenceDay != null) {
    const anchor = MONTHLY_ANCHORS.find((a) => String(a.value) === String(recurrenceDay));
    return anchor ? `Mensual · ${anchor.label}` : "Mensual";
  }
  return RECURRENCE_LABELS[recurrence] ?? recurrence;
}

export default function TaskPanel({ client, pulso = 0 }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newRecurrence, setNewRecurrence] = useState("none");
  const [newRecurrenceDay, setNewRecurrenceDay] = useState("");
  const [newAssigned, setNewAssigned] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDue, setNewDue] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [dragId, setDragId] = useState(null);
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
  }, [clientId, pulso]);

  const handleAdd = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      const task = await db.saveClientTask({
        client_id: clientId,
        title,
        description: newDescription.trim(),
        recurrence: newRecurrence,
        recurrence_day: newRecurrenceDay || null,
        assigned_to: newAssigned.trim(),
        due_date: newDue || null,
      });
      setTasks((prev) => [...prev, task]);
      setNewTitle("");
      setNewDescription("");
      setNewDue("");
      setNewRecurrence("none");
      setNewRecurrenceDay("");
      setNewAssigned("");
      setAdding(false);
    } catch {
      setError("No se pudo crear la tarea.");
    }
  }, [clientId, newTitle, newDescription, newRecurrence, newRecurrenceDay, newAssigned, newDue]);

  const handleUpdate = useCallback(async (taskId, data) => {
    try {
      const updated = await db.updateClientTask(taskId, data);
      setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t));
      if (editingTask?.id === taskId) setEditingTask(null);
      if (detailTask?.id === taskId) setDetailTask(updated);
    } catch {
      setError("No se pudo actualizar la tarea.");
    }
  }, [editingTask, detailTask]);

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
      if (detailTask?.id === taskId) setDetailTask(null);
    } catch {
      setError("No se pudo eliminar la tarea.");
    }
  }, [detailTask]);

  // «Hoy»: la marca es para ESTA fecha. Si no se hace, mañana la tarea
  // está en Atrasadas de «Mi día» sin que nadie la desmarque.
  const hoy = fechaEnZona();
  const handleHoy = useCallback((task) => {
    void handleUpdate(task.id, { today_date: task.today_date === hoy ? null : hoy });
  }, [handleUpdate, hoy]);

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
      db.reorderClientTasks(clientId, pendingIds).catch(() => {});
    }
    setDragId(null);
  }, [dragId, tasks, clientId]);

  const pending = tasks.filter((t) => t.status === "pending");
  const completed = tasks.filter((t) => t.status === "completed");
  const recurring = pending.filter((t) => t.recurrence && t.recurrence !== "none");
  const oneTime = pending.filter((t) => !t.recurrence || t.recurrence === "none");

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

          {recurring.length > 0 && (
            <>
              <div style={{ fontSize: "var(--fs-3xs)", fontWeight: 600, color: "var(--text-dim)", padding: "var(--sp-1) 0", display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
                <Icon name="refresh" size={12} /> Recurrentes
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", marginBottom: "var(--sp-2)" }}>
                {recurring.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={() => handleComplete(task.id)}
                    onDelete={() => handleDelete(task.id)}
                    onEdit={() => setEditingTask(task)}
                    onDetail={() => setDetailTask(task)}
                    onHoy={() => handleHoy(task)}
                    hoy={hoy}
                    onDragStart={() => handleDragStart(task.id)}
                    onDragOver={(e) => handleDragOver(e, task.id)}
                    onDragEnd={handleDragEnd}
                    isDragging={dragId === task.id}
                  />
                ))}
              </div>
            </>
          )}

          {oneTime.length > 0 && (
            <>
              {recurring.length > 0 && (
                <div style={{ fontSize: "var(--fs-3xs)", fontWeight: 600, color: "var(--text-dim)", padding: "var(--sp-1) 0", display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
                  <Icon name="check" size={12} /> Únicas
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
                {oneTime.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={() => handleComplete(task.id)}
                    onDelete={() => handleDelete(task.id)}
                    onEdit={() => setEditingTask(task)}
                    onDetail={() => setDetailTask(task)}
                    onHoy={() => handleHoy(task)}
                    hoy={hoy}
                    onDragStart={() => handleDragStart(task.id)}
                    onDragOver={(e) => handleDragOver(e, task.id)}
                    onDragEnd={handleDragEnd}
                    isDragging={dragId === task.id}
                  />
                ))}
              </div>
            </>
          )}

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
                      onDetail={() => setDetailTask(task)}
                    />
                  ))}
                  <LimpiezaTerminadas
                    cantidad={completed.filter((t) => !t.recurrence || t.recurrence === "none").length}
                    pulso={pulso}
                    onVaciar={async () => {
                      await db.borrarTerminadas(clientId);
                      setTasks((prev) => prev.filter((t) => t.status !== "completed" || (t.recurrence && t.recurrence !== "none")));
                    }}
                  />
                </div>
              )}
            </>
          )}

          {adding ? (
            <TaskForm
              formId={formId}
              title={newTitle}
              description={newDescription}
              recurrence={newRecurrence}
              recurrenceDay={newRecurrenceDay}
              assigned={newAssigned}
              due={newDue}
              onDueChange={setNewDue}
              onTitleChange={setNewTitle}
              onDescriptionChange={setNewDescription}
              onRecurrenceChange={(v) => { setNewRecurrence(v); setNewRecurrenceDay(""); }}
              onRecurrenceDayChange={setNewRecurrenceDay}
              onAssignedChange={setNewAssigned}
              onSubmit={handleAdd}
              onCancel={() => { setAdding(false); setNewTitle(""); setNewDescription(""); setNewAssigned(""); setNewDue(""); }}
              submitLabel="Añadir"
            />
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

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onSave={(data) => handleUpdate(editingTask.id, data)}
          onClose={() => setEditingTask(null)}
        />
      )}

      {detailTask && !editingTask && (
        <TaskDetailModal
          task={detailTask}
          onEdit={() => setEditingTask(detailTask)}
          onClose={() => setDetailTask(null)}
        />
      )}
    </section>
  );
}

function TaskRow({ task, onComplete, onReopen, onDelete, onEdit, onDetail, onHoy, hoy, onDragStart, onDragOver, onDragEnd, isDragging }) {
  const isDone = task.status === "completed";
  const objetivo = !isDone && hoy ? fechaObjetivo(task, hoy) : null;
  const atraso = objetivo && objetivo < hoy ? diasEntre(objetivo, hoy) : 0;
  const marcadaHoy = Boolean(hoy) && task.today_date === hoy;
  const detail = task.recurrence !== "none"
    ? formatRecurrenceDetail(task.recurrence, task.recurrence_day)
    : null;
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
        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
        onClick={onDetail}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") onDetail?.(); }}
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
          {detail && (
            <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
              {detail}
            </span>
          )}
          {task.assigned_to && (
            <span style={{ fontSize: "var(--fs-3xs)", color: "var(--accent)" }}>
              {task.assigned_to}
            </span>
          )}
          {atraso > 0 && (
            <span className="dia-atraso" style={{ fontSize: "var(--fs-3xs)" }}>{textoAtraso(atraso)}</span>
          )}
          {!atraso && task.due_date && !isDone && (
            <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
              Vence {textoFecha(task.due_date, hoy).toLowerCase()}
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
      {onHoy && !isDone && (
        <button
          type="button"
          className="dia-hoy"
          aria-pressed={marcadaHoy}
          onClick={onHoy}
          title={marcadaHoy ? "Quitar de hoy" : "Hacerla hoy: aparece en «Mi día»"}
          aria-label={`${marcadaHoy ? "Quitar de hoy" : "Hacer hoy"}: ${task.title}`}
          style={{ flexShrink: 0 }}
        >
          Hoy
        </button>
      )}
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

function TaskForm({ formId, title, description, recurrence, recurrenceDay, assigned, due, onDueChange, onTitleChange, onDescriptionChange, onRecurrenceChange, onRecurrenceDayChange, onAssignedChange, onSubmit, onCancel, submitLabel }) {
  return (
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
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
        placeholder="Título de la tarea…"
        autoFocus
        style={{ fontSize: "var(--fs-xs)" }}
      />
      <textarea
        className="input"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Descripción (opcional)…"
        aria-label="Descripción de la tarea"
        rows={2}
        style={{ fontSize: "var(--fs-3xs)", resize: "vertical", minHeight: 40 }}
      />
      <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="input"
          value={recurrence}
          onChange={(e) => onRecurrenceChange(e.target.value)}
          aria-label="Recurrencia"
          style={{ fontSize: "var(--fs-3xs)", minWidth: 90 }}
        >
          <option value="none">Una vez</option>
          <option value="daily">Diaria</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
        </select>

        {recurrence === "weekly" && (
          <select
            className="input"
            value={recurrenceDay}
            onChange={(e) => onRecurrenceDayChange(e.target.value)}
            aria-label="Día de la semana"
            style={{ fontSize: "var(--fs-3xs)", minWidth: 100 }}
          >
            <option value="">Cualquier día</option>
            {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        )}

        {recurrence === "monthly" && (
          <select
            className="input"
            value={recurrenceDay}
            onChange={(e) => onRecurrenceDayChange(e.target.value)}
            aria-label="Ancla mensual"
            style={{ fontSize: "var(--fs-3xs)", minWidth: 140 }}
          >
            {MONTHLY_ANCHORS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        )}

        <SelectorFecha value={due} onChange={(f) => onDueChange(f ?? "")} etiqueta="Fecha límite de la tarea nueva" vacio="Fecha límite" />
      </div>
      <CampoResponsable value={assigned} onChange={onAssignedChange} />
      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
        <button className="btn btn-primary" onClick={onSubmit} disabled={!title.trim()} style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
          {submitLabel}
        </button>
        <button className="btn" onClick={onCancel} style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function TaskEditModal({ task, onSave, onClose, conFecha = true }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [recurrence, setRecurrence] = useState(task.recurrence || "none");
  const [recurrenceDay, setRecurrenceDay] = useState(task.recurrence_day ?? "");
  const [assigned, setAssigned] = useState(task.assigned_to || "");
  const [due, setDue] = useState(task.due_date || "");
  const dialogRef = useDialogA11y(onClose);

  const handleSubmit = () => {
    onSave({
      title: title.trim(),
      description: description.trim(),
      recurrence,
      recurrence_day: recurrenceDay || null,
      assigned_to: assigned.trim(),
      // Las plantillas no tienen fecha: son moldes, no tareas.
      ...(conFecha ? { due_date: due || null } : {}),
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button type="button" onClick={onClose} aria-label="Cerrar" style={{ position: "absolute", inset: 0, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer" }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Editar tarea"
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
          <span style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>Editar tarea</span>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" style={{ fontSize: "var(--fs-xs)" }} />
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción…" rows={3} style={{ fontSize: "var(--fs-3xs)", resize: "vertical" }} />
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          <select className="input" value={recurrence} onChange={(e) => { setRecurrence(e.target.value); setRecurrenceDay(""); }} aria-label="Recurrencia" style={{ fontSize: "var(--fs-3xs)", flex: 1 }}>
            <option value="none">Una vez</option>
            <option value="daily">Diaria</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
          {recurrence === "weekly" && (
            <select className="input" value={recurrenceDay} onChange={(e) => setRecurrenceDay(e.target.value)} aria-label="Día" style={{ fontSize: "var(--fs-3xs)", flex: 1 }}>
              <option value="">Cualquier día</option>
              {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          )}
          {recurrence === "monthly" && (
            <select className="input" value={recurrenceDay} onChange={(e) => setRecurrenceDay(e.target.value)} aria-label="Ancla" style={{ fontSize: "var(--fs-3xs)", flex: 1 }}>
              {MONTHLY_ANCHORS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          )}
        </div>
        {conFecha && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>
            Fecha límite
            <SelectorFecha value={due} onChange={(f) => setDue(f ?? "")} etiqueta={`Fecha límite de ${task.title}`} vacio="Escoger fecha" />
          </div>
        )}
        <CampoResponsable value={assigned} onChange={setAssigned} />
        <div style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} style={{ fontSize: "var(--fs-3xs)" }}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!title.trim()} style={{ fontSize: "var(--fs-3xs)" }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function TaskDetailModal({ task, onEdit, onClose }) {
  const dialogRef = useDialogA11y(onClose);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <button type="button" onClick={onClose} aria-label="Cerrar" style={{ position: "absolute", inset: 0, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer" }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de tarea"
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
          {task.recurrence && task.recurrence !== "none" && (
            <span>{formatRecurrenceDetail(task.recurrence, task.recurrence_day)}</span>
          )}
          {task.assigned_to && <span>Asignada a: <strong style={{ color: "var(--accent)" }}>{task.assigned_to}</strong></span>}
          {task.due_date && <span>Vence: {new Date(`${task.due_date}T12:00:00`).toLocaleDateString("es-PA")}</span>}
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

export function TaskTemplatesManager({ clients = [] }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newRecurrence, setNewRecurrence] = useState("none");
  const [newRecurrenceDay, setNewRecurrenceDay] = useState("");
  const [newAssigned, setNewAssigned] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState("");
  const [editingTpl, setEditingTpl] = useState(null);
  const [aviso, setAviso] = useState("");
  const [aplicando, setAplicando] = useState(null);
  const formId = useId();

  // Las obligatorias —subir las historias de cada cliente cada día— se
  // ponen UNA vez y llegan a todas las empresas. Las que ya tienen una
  // tarea con el mismo título se saltan: aplicar dos veces no duplica.
  const aplicarATodas = async (tpl) => {
    setAplicando(tpl.id);
    setAviso("");
    let creadas = 0;
    try {
      for (const c of clients) {
        const id = c.dbId || c.id;
        const tareas = await db.loadClientTasks(id);
        const titulo = tpl.title.trim().toLowerCase();
        if (tareas.some((t) => t.title.trim().toLowerCase() === titulo)) continue;
        await db.applyTemplatesToClient(id, [tpl]);
        creadas++;
      }
      setAviso(creadas
        ? `«${tpl.title}» añadida a ${creadas} empresa${creadas === 1 ? "" : "s"}.`
        : `Todas las empresas ya tenían «${tpl.title}».`);
    } catch {
      setError("No se pudo aplicar la plantilla a todas las empresas.");
    }
    setAplicando(null);
  };

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
      const tpl = await db.saveTaskTemplate({
        title,
        description: newDescription.trim(),
        recurrence: newRecurrence,
        recurrence_day: newRecurrenceDay || null,
        assigned_to: newAssigned.trim(),
      });
      setTemplates((prev) => [...prev, tpl]);
      setNewTitle("");
      setNewDescription("");
      setNewRecurrence("none");
      setNewRecurrenceDay("");
      setNewAssigned("");
    } catch {
      setError("No se pudo crear la plantilla.");
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      const updated = await db.updateTaskTemplate(id, data);
      setTemplates((prev) => prev.map((t) => t.id === id ? updated : t));
      setEditingTpl(null);
    } catch {
      setError("No se pudo actualizar la plantilla.");
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
      <p role="status" style={{ fontSize: "var(--fs-3xs)", color: "var(--success)", margin: 0 }}>{aviso}</p>

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
                <span style={{ color: "var(--text-faint)" }}>
                  {formatRecurrenceDetail(tpl.recurrence, tpl.recurrence_day)}
                </span>
              )}
              {tpl.assigned_to && (
                <span style={{ color: "var(--accent)" }}>{tpl.assigned_to}</span>
              )}
              {clients.length > 0 && (
                <button
                  className="btn-icon"
                  onClick={() => aplicarATodas(tpl)}
                  disabled={aplicando === tpl.id}
                  aria-label={`Añadir «${tpl.title}» a todas las empresas`}
                  title="Añadir a todas las empresas"
                  style={{ width: 24, height: 24, minHeight: 24 }}
                >
                  <Icon name={aplicando === tpl.id ? "clock" : "users"} size={12} />
                </button>
              )}
              <button
                className="btn-icon"
                onClick={() => setEditingTpl(tpl)}
                aria-label={`Editar plantilla: ${tpl.title}`}
                style={{ width: 24, height: 24, minHeight: 24 }}
              >
                <Icon name="pencil" size={12} />
              </button>
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

      <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor={formId} className="sr-only">Nueva plantilla</label>
        <input
          id={formId}
          className="input"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Nueva plantilla…"
          style={{ flex: 1, fontSize: "var(--fs-3xs)", minWidth: 120 }}
        />
        <select
          className="input"
          value={newRecurrence}
          onChange={(e) => { setNewRecurrence(e.target.value); setNewRecurrenceDay(""); }}
          aria-label="Recurrencia"
          style={{ fontSize: "var(--fs-3xs)", width: 100 }}
        >
          <option value="none">Una vez</option>
          <option value="daily">Diaria</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
        </select>

        {newRecurrence === "weekly" && (
          <select
            className="input"
            value={newRecurrenceDay}
            onChange={(e) => setNewRecurrenceDay(e.target.value)}
            aria-label="Día de la semana"
            style={{ fontSize: "var(--fs-3xs)", width: 100 }}
          >
            <option value="">Cualquier día</option>
            {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        )}

        {newRecurrence === "monthly" && (
          <select
            className="input"
            value={newRecurrenceDay}
            onChange={(e) => setNewRecurrenceDay(e.target.value)}
            aria-label="Ancla mensual"
            style={{ fontSize: "var(--fs-3xs)", width: 140 }}
          >
            {MONTHLY_ANCHORS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        )}

        <CampoResponsable value={newAssigned} onChange={setNewAssigned} />

        <button className="btn btn-primary" onClick={handleAdd} disabled={!newTitle.trim()} aria-label="Añadir plantilla" style={{ fontSize: "var(--fs-3xs)", padding: "var(--sp-1) var(--sp-3)" }}>
          <Icon name="plus" size={14} />
        </button>
      </div>

      {editingTpl && (
        <TaskEditModal
          conFecha={false}
          task={editingTpl}
          onSave={(data) => handleUpdate(editingTpl.id, data)}
          onClose={() => setEditingTpl(null)}
        />
      )}
    </div>
  );
}
