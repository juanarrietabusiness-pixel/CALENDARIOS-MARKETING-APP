import { useState, useEffect, useRef, useId, useCallback } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { callAIChat, buildChatSystemPrompt } from "../api";
import * as db from "../lib/db";

export default function ChatPanel({ client, calendar, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const dialogRef = useDialogA11y(onClose);
  const inputId = useId();
  const clientId = client.dbId || client.id;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const history = await db.loadChatMessages(clientId);
        if (alive) setMessages(history);
      } catch {
        if (alive) setError("No se pudo cargar el historial.");
      }
      if (alive) setLoadingHistory(false);
    })();
    return () => { alive = false; };
  }, [clientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loadingHistory) inputRef.current?.focus();
  }, [loadingHistory]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError("");

    const userMsg = { role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      await db.saveChatMessage(clientId, "user", text);

      const system = buildChatSystemPrompt(
        client,
        calendar,
        client.githubContext || "",
      );
      const history = [...messages, userMsg].slice(-50).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await callAIChat(history, system);

      await db.saveChatMessage(clientId, "assistant", response);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response, created_at: new Date().toISOString() },
      ]);
    } catch (e) {
      setError(e.message || "Error al generar respuesta.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, client, calendar, clientId]);

  const handleClear = useCallback(async () => {
    try {
      await db.clearChatMessages(clientId);
      setMessages([]);
      setError("");
    } catch {
      setError("No se pudo limpiar el historial.");
    }
  }, [clientId]);

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
        {/* ── Cabecera ── */}
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
              Conversa, genera ideas y crea contenido
            </div>
          </div>
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

        {/* ── Mensajes ── */}
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
            <EmptyState clientName={client.name} />
          ) : (
            messages.map((msg, i) => <ChatMessage key={i} message={msg} />)
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

        {/* ── Entrada ── */}
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

function EmptyState({ clientName }) {
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
        Puedo ayudarte a crear descripciones, guiones, ideas de campañas y
        planificar contenido.
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
        <span style={{ fontStyle: "italic" }}>«Propón una campaña para septiembre»</span>
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
