import { useState, useEffect, useRef, useId, useCallback } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { callAIChat, buildChatSystemPrompt, getChatTools } from "../api";
import { uid } from "../utils";
import * as db from "../lib/db";

export default function ChatPanel({ client, calendar, calId, onUpdateCal, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [memories, setMemories] = useState([]);
  const [showMemories, setShowMemories] = useState(false);
  const [actionFeedback, setActionFeedback] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const dialogRef = useDialogA11y(onClose);
  const inputId = useId();
  const clientId = client.dbId || client.id;
  const calRef = useRef(calendar);
  calRef.current = calendar;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [history, mems] = await Promise.all([
          db.loadChatMessages(clientId),
          db.loadClientMemories(clientId),
        ]);
        if (alive) {
          setMessages(history);
          setMemories(mems);
        }
      } catch {
        if (alive) setError("No se pudo cargar el historial.");
      }
      if (alive) setLoadingHistory(false);
    })();
    return () => { alive = false; };
  }, [clientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, actionFeedback]);

  useEffect(() => {
    if (!loadingHistory) inputRef.current?.focus();
  }, [loadingHistory]);

  const executeToolCall = useCallback(async (toolName, toolInput) => {
    if (toolName === "guardar_memoria") {
      const mem = await db.saveClientMemory(clientId, toolInput.contenido);
      setMemories((prev) => [...prev, mem]);
      return { ok: true, mensaje: `Guardado: «${toolInput.contenido}»` };
    }

    if (toolName === "borrar_memoria") {
      const found = memories.find((m) => m.content === toolInput.contenido);
      if (!found) return { ok: false, mensaje: "No encontré esa memoria." };
      await db.deleteClientMemory(found.id);
      setMemories((prev) => prev.filter((m) => m.id !== found.id));
      return { ok: true, mensaje: `Olvidado: «${toolInput.contenido}»` };
    }

    const cal = calRef.current;
    if (!cal || !calId || !onUpdateCal) {
      return { ok: false, mensaje: "No hay calendario seleccionado." };
    }

    if (toolName === "crear_publicacion") {
      const day = (cal.days || []).find((d) => d.date === toolInput.fecha);
      if (!day) return { ok: false, mensaje: `No existe el día ${toolInput.fecha} en este calendario.` };
      const newPost = {
        id: uid(),
        format: toolInput.formato || "post",
        idea: toolInput.idea || "",
        descripcion: toolInput.descripcion || "",
        guion: toolInput.guion || "",
        category: toolInput.categoria || "",
        status: "pending",
        hashtagsFinales: "",
      };
      const newDays = cal.days.map((d) =>
        d.date !== toolInput.fecha ? d : { ...d, posts: [...(d.posts || []), newPost] },
      );
      const updated = { ...cal, days: newDays };
      calRef.current = updated;
      onUpdateCal(calId, updated);
      return { ok: true, mensaje: `Publicación creada: ${newPost.format} el ${toolInput.fecha}.` };
    }

    if (toolName === "editar_publicacion") {
      let found = false;
      const newDays = cal.days.map((d) => ({
        ...d,
        posts: (d.posts || []).map((p) => {
          if (p.id !== toolInput.post_id) return p;
          found = true;
          const upd = { ...p };
          if (toolInput.idea !== undefined) upd.idea = toolInput.idea;
          if (toolInput.descripcion !== undefined) upd.descripcion = toolInput.descripcion;
          if (toolInput.guion !== undefined) upd.guion = toolInput.guion;
          if (toolInput.categoria !== undefined) upd.category = toolInput.categoria;
          if (toolInput.formato !== undefined) upd.format = toolInput.formato;
          return upd;
        }),
      }));
      if (!found) return { ok: false, mensaje: `No encontré la publicación ${toolInput.post_id}.` };
      const updated = { ...cal, days: newDays };
      calRef.current = updated;
      onUpdateCal(calId, updated);
      return { ok: true, mensaje: `Publicación ${toolInput.post_id} editada.` };
    }

    if (toolName === "eliminar_publicaciones") {
      const ids = new Set(toolInput.post_ids || []);
      let count = 0;
      const newDays = cal.days.map((d) => {
        const before = (d.posts || []).length;
        const filtered = (d.posts || []).filter((p) => !ids.has(p.id));
        count += before - filtered.length;
        return { ...d, posts: filtered };
      });
      if (count === 0) return { ok: false, mensaje: "No se encontraron las publicaciones indicadas." };
      const updated = { ...cal, days: newDays };
      calRef.current = updated;
      onUpdateCal(calId, updated);
      return { ok: true, mensaje: `${count} publicación${count === 1 ? "" : "es"} eliminada${count === 1 ? "" : "s"}.` };
    }

    return { ok: false, mensaje: `Herramienta desconocida: ${toolName}` };
  }, [clientId, calId, onUpdateCal, memories]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError("");
    setActionFeedback([]);

    const userMsg = { role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      await db.saveChatMessage(clientId, "user", text);

      const system = buildChatSystemPrompt(
        client,
        calRef.current,
        client.githubContext || "",
        memories,
      );
      const tools = getChatTools(Boolean(calRef.current));

      let conversationMessages = [...messages, userMsg].slice(-50).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let maxLoops = 6;
      const feedbacks = [];

      while (maxLoops-- > 0) {
        const response = await callAIChat(conversationMessages, system, tools);

        const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
        const textBlocks = response.content.filter((b) => b.type === "text");
        const assistantText = textBlocks.map((b) => b.text || "").join("");

        if (toolUseBlocks.length === 0 || response.stopReason === "end_turn") {
          if (assistantText) {
            await db.saveChatMessage(clientId, "assistant", assistantText);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: assistantText, created_at: new Date().toISOString() },
            ]);
          }
          break;
        }

        conversationMessages.push({ role: "assistant", content: response.content });

        const toolResults = [];
        for (const toolBlock of toolUseBlocks) {
          try {
            const result = await executeToolCall(toolBlock.name, toolBlock.input);
            feedbacks.push({ tool: toolBlock.name, ...result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result),
            });
          } catch (e) {
            const result = { ok: false, mensaje: e.message || "Error al ejecutar la acción." };
            feedbacks.push({ tool: toolBlock.name, ...result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result),
            });
          }
        }
        setActionFeedback([...feedbacks]);
        conversationMessages.push({ role: "user", content: toolResults });
      }
    } catch (e) {
      setError(e.message || "Error al generar respuesta.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, client, clientId, memories, executeToolCall]);

  const handleClear = useCallback(async () => {
    try {
      await db.clearChatMessages(clientId);
      setMessages([]);
      setError("");
      setActionFeedback([]);
    } catch {
      setError("No se pudo limpiar el historial.");
    }
  }, [clientId]);

  const handleDeleteMemory = useCallback(async (memId) => {
    try {
      await db.deleteClientMemory(memId);
      setMemories((prev) => prev.filter((m) => m.id !== memId));
    } catch {
      setError("No se pudo borrar la memoria.");
    }
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoGrow = (e) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <button
        type="button"
        aria-label="Cerrar chat"
        onClick={onClose}
        style={{ flex: 1, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer", backdropFilter: "blur(2px)" }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Chat con asistente de ${client.name}`}
        style={{
          width: 420,
          maxWidth: "100vw",
          height: "100%",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border-strong)",
          boxShadow: "var(--elev-2)",
          display: "flex",
          flexDirection: "column",
          animation: "slideIn .24s cubic-bezier(.22,.61,.36,1)",
        }}
      >
        {/* Cabecera */}
        <div style={{
          padding: "var(--sp-3) var(--sp-4)",
          paddingTop: "calc(var(--sp-3) + var(--safe-top))",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-3)",
          flexShrink: 0,
        }}>
          <span style={{ color: "var(--accent)", display: "flex" }}>
            <Icon name="sparkles" size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              Asistente de {client.name}
            </div>
            <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
              Conversa, genera ideas y ejecuta acciones
            </div>
          </div>
          {memories.length > 0 && (
            <button
              className="btn-icon"
              onClick={() => setShowMemories(!showMemories)}
              aria-label="Ver memorias"
              aria-pressed={showMemories}
              title={`${memories.length} memoria${memories.length === 1 ? "" : "s"}`}
            >
              <Icon name="brain" size={18} />
            </button>
          )}
          {messages.length > 0 && (
            <button
              className="btn-icon"
              onClick={handleClear}
              aria-label="Limpiar historial"
              title="Limpiar historial"
            >
              <Icon name="trash" size={18} />
            </button>
          )}
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar chat">
            <Icon name="close" />
          </button>
        </div>

        {/* Panel de memorias */}
        {showMemories && memories.length > 0 && (
          <div style={{
            padding: "var(--sp-2) var(--sp-4)",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
            maxHeight: 160,
            overflowY: "auto",
            flexShrink: 0,
          }}>
            <div style={{ fontSize: "var(--fs-3xs)", fontWeight: 600, color: "var(--text-dim)", marginBottom: "var(--sp-1)" }}>
              Memorias ({memories.length})
            </div>
            {memories.map((m) => (
              <div key={m.id} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--sp-1)",
                fontSize: "var(--fs-3xs)",
                color: "var(--text)",
                padding: "2px 0",
              }}>
                <span style={{ flex: 1, lineHeight: 1.4 }}>{m.content}</span>
                <button
                  className="btn-icon"
                  onClick={() => handleDeleteMemory(m.id)}
                  aria-label={`Borrar memoria: ${m.content}`}
                  style={{ flexShrink: 0, width: 24, height: 24, minHeight: 24 }}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Mensajes */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--sp-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
        }}>
          {loadingHistory ? (
            <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: "var(--fs-xs)", padding: "var(--sp-6) 0" }}>
              Cargando historial…
            </p>
          ) : messages.length === 0 ? (
            <EmptyState clientName={client.name} hasCalendar={Boolean(calendar)} />
          ) : (
            messages.map((msg, i) => <ChatMessage key={i} message={msg} />)
          )}
          {actionFeedback.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
              {actionFeedback.map((fb, i) => (
                <ActionChip key={i} feedback={fb} />
              ))}
            </div>
          )}
          {loading && (
            <div style={{
              display: "flex",
              gap: "var(--sp-2)",
              alignItems: "center",
              padding: "var(--sp-2) var(--sp-3)",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              alignSelf: "flex-start",
              maxWidth: "85%",
            }}>
              <span style={{ display: "inline-flex", gap: 3 }}>
                <Dot delay="0s" /><Dot delay=".2s" /><Dot delay=".4s" />
              </span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>Pensando…</span>
            </div>
          )}
          {error && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--fs-xs)", padding: "var(--sp-2) 0" }}>
              {error}
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Entrada */}
        <div style={{
          padding: "var(--sp-3) var(--sp-4)",
          paddingBottom: "calc(var(--sp-3) + var(--safe-bottom))",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: "var(--sp-2)",
          alignItems: "flex-end",
          flexShrink: 0,
        }}>
          <label htmlFor={inputId} className="sr-only">Mensaje</label>
          <textarea
            ref={inputRef}
            id={inputId}
            className="input"
            value={input}
            onChange={(e) => { setInput(e.target.value); autoGrow(e); }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu mensaje…"
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              maxHeight: 120,
              minHeight: "var(--tap)",
              lineHeight: 1.5,
            }}
            disabled={loading}
          />
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            aria-label="Enviar mensaje"
            style={{ minHeight: "var(--tap)", paddingInline: "var(--sp-3)" }}
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ clientName, hasCalendar }) {
  return (
    <div style={{
      textAlign: "center",
      color: "var(--text-faint)",
      padding: "var(--sp-8) var(--sp-4)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "var(--sp-3)",
    }}>
      <span style={{ color: "var(--accent)", opacity: 0.6 }}>
        <Icon name="sparkles" size={36} />
      </span>
      <p style={{ fontSize: "var(--fs-xs)", maxWidth: 280 }}>
        Soy tu asistente para <strong style={{ color: "var(--text)" }}>{clientName}</strong>.
        Puedo ayudarte a crear descripciones, guiones, ideas de campañas,
        planificar contenido y ejecutar acciones en el calendario.
      </p>
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-1)",
        fontSize: "var(--fs-3xs)",
        color: "var(--text-dim)",
        textAlign: "left",
      }}>
        <span>Prueba con algo como:</span>
        <span style={{ fontStyle: "italic" }}>«Escríbeme un caption para un reel de lanzamiento»</span>
        <span style={{ fontStyle: "italic" }}>«Dame 5 ideas para posts educativos»</span>
        {hasCalendar && (
          <>
            <span style={{ fontStyle: "italic" }}>«Créame un reel para el martes sobre tips»</span>
            <span style={{ fontStyle: "italic" }}>«Elimina las publicaciones de los lunes»</span>
          </>
        )}
        <span style={{ fontStyle: "italic" }}>«Recuerda que prefiero un tono formal»</span>
      </div>
    </div>
  );
}

function ChatMessage({ message }) {
  const isUser = message.role === "user";
  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
    }}>
      <div style={{
        maxWidth: "85%",
        padding: "var(--sp-2) var(--sp-3)",
        borderRadius: isUser
          ? "var(--radius) var(--radius) var(--radius-sm) var(--radius)"
          : "var(--radius) var(--radius) var(--radius) var(--radius-sm)",
        background: isUser ? "var(--accent)" : "var(--surface-2)",
        color: isUser ? "#fff" : "var(--text)",
        fontSize: "var(--fs-xs)",
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {message.content}
      </div>
    </div>
  );
}

function ActionChip({ feedback }) {
  const TOOL_LABELS = {
    guardar_memoria: "Memoria",
    borrar_memoria: "Memoria",
    crear_publicacion: "Calendario",
    editar_publicacion: "Calendario",
    eliminar_publicaciones: "Calendario",
  };
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--sp-2)",
      padding: "var(--sp-1) var(--sp-2)",
      borderRadius: "var(--radius-sm)",
      background: feedback.ok ? "var(--accent-soft)" : "var(--alt-soft)",
      fontSize: "var(--fs-3xs)",
      color: feedback.ok ? "var(--accent)" : "var(--danger)",
      alignSelf: "flex-start",
    }}>
      <Icon name={feedback.ok ? "check" : "alert"} size={14} />
      <span style={{ fontWeight: 600 }}>{TOOL_LABELS[feedback.tool] || feedback.tool}</span>
      <span style={{ color: "var(--text-dim)" }}>{feedback.mensaje}</span>
    </div>
  );
}

function Dot({ delay }) {
  return (
    <span style={{
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "var(--text-dim)",
      display: "inline-block",
      animation: `chatDotPulse .8s ${delay} infinite ease-in-out`,
    }} />
  );
}
