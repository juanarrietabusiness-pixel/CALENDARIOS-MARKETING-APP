import { useState, useEffect, useRef, useId, useCallback } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { callAIChat } from "../api";
import { compressImage } from "../utils";

export default function GlobalChatPanel({ clients, onClose, onSelectClient }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData, setImageData] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const dialogRef = useDialogA11y(onClose);
  const inputId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ya parado */ }
      }
    };
  }, []);

  const toggleVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Tu navegador no soporta dictado por voz.");
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = "es-PA";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput((prev) => prev ? prev + " " + transcript : transcript);
      setListening(false);
    };
    recognition.onerror = (ev) => {
      setListening(false);
      const msgs = {
        "not-allowed": "Permiso de micrófono denegado. Actívalo en los ajustes del navegador.",
        "no-speech": "No se detectó voz. Intenta de nuevo.",
        "audio-capture": "No se encontró micrófono. Conecta uno e intenta de nuevo.",
        "network": "Error de red al procesar la voz.",
        "aborted": "",
      };
      const msg = msgs[ev.error] ?? `Error de dictado: ${ev.error || "desconocido"}.`;
      if (msg) setError(msg);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try { recognition.start(); } catch { setError("No se pudo iniciar el dictado."); setListening(false); return; }
    setListening(true);
  }, [listening]);

  const handleImageSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800);
      setImagePreview(URL.createObjectURL(file));
      setImageData(compressed);
    } catch {
      setError("No se pudo procesar la imagen.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const clearImage = useCallback(() => {
    setImagePreview(null);
    setImageData(null);
  }, []);

  const buildSystemPrompt = useCallback(() => {
    const clientBlocks = clients.map((c) => {
      const lines = [`· ${c.name} (ID: ${c.id}) — ${c.industry || "Sin industria"}${c.instagram ? ` · ${c.instagram}` : ""}`];
      for (const cal of c.calendars || []) {
        const postLines = [];
        for (const day of cal.days || []) {
          for (const post of day.posts || []) {
            const parts = [`ID:${post.id}`, day.date];
            if (post.format) parts.push(post.format);
            if (post.category) parts.push(post.category);
            if (post.idea) parts.push(`Idea: «${post.idea}»`);
            if (post.descripcion) parts.push(`Desc: «${post.descripcion.slice(0, 120)}»`);
            if (post.publishTime) parts.push(`Hora: ${post.publishTime}`);
            if (post.status && post.status !== "pending") parts.push(`[${post.status}]`);
            postLines.push("      · " + parts.join(" | "));
          }
        }
        lines.push(`    Calendario: ${cal.name || "Sin nombre"} — ${(cal.month ?? 0) + 1}/${cal.year} — ${postLines.length} pub.`);
        if (cal.campaign) lines.push(`    Campaña: ${cal.campaign}`);
        if (postLines.length) lines.push(...postLines);
      }
      return lines.join("\n");
    }).join("\n\n");

    return `Eres el asistente general de la agencia Juancito Ads.

QUIÉN ERES:
· Un estratega de marketing digital que conoce TODOS los clientes de la agencia.
· Tienes acceso COMPLETO a todos los calendarios y publicaciones de cada cliente.
· Puedes dar ideas, sugerencias y análisis que abarquen a uno, varios o todos los clientes.
· Puedes citar datos concretos de las publicaciones: ideas, descripciones, formatos, fechas y estados.
· Para editar publicaciones, el usuario debe ir al chat del cliente específico.

CLIENTES DE LA AGENCIA (${clients.length}):
${clientBlocks || "(Sin clientes aún)"}

CÓMO DEBES RESPONDER:
· En español de Panamá, con tildes y signos de apertura (¿, ¡).
· Conciso y directo.
· Cuando hables de un cliente, referéncialo por nombre.
· Puedes comparar clientes, sugerir estrategias cruzadas y dar ideas de campañas.
· Si citas una publicación, incluye su fecha y formato para que sea fácil ubicarla.
· Si te preguntan algo que requiere editar un calendario, indica que deben ir al asistente del cliente específico.
· No inventes datos que no estén en el contexto.`;
  }, [clients]);

  const executeToolCall = useCallback(async (toolName, toolInput) => {
    if (toolName === "ir_a_cliente") {
      const target = clients.find(
        (c) => c.id === toolInput.client_id || c.name.toLowerCase() === (toolInput.nombre || "").toLowerCase(),
      );
      if (!target) return { ok: false, mensaje: "No encontré ese cliente." };
      onSelectClient(target.id);
      return { ok: true, mensaje: `Navegando a ${target.name}.` };
    }
    return { ok: false, mensaje: `Herramienta desconocida: ${toolName}` };
  }, [clients, onSelectClient]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageData) || loading) return;

    setInput("");
    setError("");

    const hasImage = Boolean(imageData);
    const displayText = text || (hasImage ? "[Imagen enviada]" : "");
    const userMsg = { role: "user", content: displayText, hasImage };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const sentImagePreview = imagePreview;
    const sentImageData = imageData;
    clearImage();

    try {
      const system = buildSystemPrompt();
      const tools = [
        {
          name: "ir_a_cliente",
          description: "Navega al asistente de un cliente específico para poder ejecutar acciones sobre su calendario.",
          input_schema: {
            type: "object",
            properties: {
              client_id: { type: "string", description: "ID del cliente." },
              nombre: { type: "string", description: "Nombre del cliente (alternativa al ID)." },
            },
          },
        },
      ];

      const previousMsgs = [...messages, userMsg].slice(-30).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      if (sentImageData) {
        const base64 = sentImageData.includes(",") ? sentImageData.split(",")[1] : sentImageData;
        const lastMsg = previousMsgs[previousMsgs.length - 1];
        lastMsg.content = [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: text || "Analiza esta imagen." },
        ];
      }

      let conversationMessages = previousMsgs;
      let maxLoops = 4;

      while (maxLoops-- > 0) {
        const response = await callAIChat(conversationMessages, system, tools);
        const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
        const textBlocks = response.content.filter((b) => b.type === "text");
        const assistantText = textBlocks.map((b) => b.text || "").join("");

        if (toolUseBlocks.length === 0 || response.stopReason === "end_turn") {
          if (assistantText) {
            setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
          }
          break;
        }

        conversationMessages.push({ role: "assistant", content: response.content });

        const toolResults = [];
        for (const toolBlock of toolUseBlocks) {
          try {
            const result = await executeToolCall(toolBlock.name, toolBlock.input);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result),
            });
          } catch (e) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify({ ok: false, mensaje: e.message }),
            });
          }
        }
        conversationMessages.push({ role: "user", content: toolResults });
      }
    } catch (e) {
      setError(e.message || "Error al generar respuesta.");
    } finally {
      setLoading(false);
      if (sentImagePreview) URL.revokeObjectURL(sentImagePreview);
    }
  }, [input, loading, messages, buildSystemPrompt, executeToolCall, imageData, imagePreview, clearImage]);

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

  const hasSpeechAPI = typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <button
        type="button"
        aria-label="Cerrar agente global"
        onClick={onClose}
        style={{ flex: 1, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer", backdropFilter: "blur(2px)" }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Agente global de la agencia"
        style={{
          width: 460,
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
            <Icon name="globe" size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              Agente de la agencia
            </div>
            <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
              Conoce todos tus clientes · Ideas y estrategia
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar agente global">
            <Icon name="close" />
          </button>
        </div>

        {/* Mensajes */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--sp-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
        }}>
          {messages.length === 0 ? (
            <GlobalEmptyState clientCount={clients.length} />
          ) : (
            messages.map((msg, i) => <GlobalMessage key={i} message={msg} />)
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

        {/* Vista previa de imagen */}
        {imagePreview && (
          <div style={{
            padding: "var(--sp-2) var(--sp-4)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-2)",
            flexShrink: 0,
            background: "var(--surface-2)",
          }}>
            <img
              src={imagePreview}
              alt="Imagen adjunta"
              style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
            />
            <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", flex: 1 }}>
              Imagen lista para enviar
            </span>
            <button
              className="btn-icon"
              onClick={clearImage}
              aria-label="Quitar imagen"
              style={{ width: 28, height: 28, minHeight: 28 }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

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
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            style={{ display: "none" }}
            aria-hidden="true"
          />
          <button
            className="btn-icon"
            onClick={() => fileRef.current?.click()}
            aria-label="Adjuntar imagen"
            title="Adjuntar imagen"
            disabled={loading}
            style={{ minHeight: "var(--tap)", minWidth: "var(--tap)" }}
          >
            <Icon name="image" size={18} />
          </button>
          {hasSpeechAPI && (
            <button
              className="btn-icon"
              onClick={toggleVoice}
              aria-label={listening ? "Detener dictado" : "Dictar por voz"}
              aria-pressed={listening}
              title={listening ? "Detener dictado" : "Dictar por voz"}
              disabled={loading}
              style={{
                minHeight: "var(--tap)",
                minWidth: "var(--tap)",
                color: listening ? "var(--danger)" : undefined,
              }}
            >
              <Icon name="mic" size={18} />
            </button>
          )}
          <label htmlFor={inputId} className="sr-only">Mensaje</label>
          <textarea
            ref={inputRef}
            id={inputId}
            className="input"
            value={input}
            onChange={(e) => { setInput(e.target.value); autoGrow(e); }}
            onKeyDown={handleKeyDown}
            placeholder={listening ? "Escuchando…" : "Pregunta sobre tus clientes…"}
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
            disabled={(!input.trim() && !imageData) || loading}
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

function GlobalEmptyState({ clientCount }) {
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
        <Icon name="globe" size={36} />
      </span>
      <p style={{ fontSize: "var(--fs-xs)", maxWidth: 300 }}>
        Soy el agente general de <strong style={{ color: "var(--text)" }}>Juancito Ads</strong>.
        Conozco a tus <strong style={{ color: "var(--text)" }}>{clientCount}</strong> cliente{clientCount === 1 ? "" : "s"} y
        puedo ayudarte con estrategia, ideas y análisis.
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
        <span style={{ fontStyle: "italic" }}>«Dame un resumen del estado de todos los clientes»</span>
        <span style={{ fontStyle: "italic" }}>«Ideas de campaña de fin de año para todos»</span>
        <span style={{ fontStyle: "italic" }}>«Qué clientes necesitan más contenido esta semana»</span>
        <span style={{ fontStyle: "italic" }}>«Compara las estrategias de [cliente A] y [cliente B]»</span>
      </div>
    </div>
  );
}

function GlobalMessage({ message }) {
  const isUser = message.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
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
        {message.hasImage && (
          <div style={{
            marginBottom: "var(--sp-1)",
            fontSize: "var(--fs-3xs)",
            opacity: 0.8,
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-1)",
          }}>
            <Icon name="image" size={12} />
            <span>Imagen adjunta</span>
          </div>
        )}
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
