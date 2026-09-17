import { useState, useEffect, useRef, useId, useCallback } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { callAIChat } from "../api";
import { compressImage } from "../utils";
import { buscarCliente, consultarPublicaciones, resumenAgencia, indiceParaPrompt } from "../lib/agencia";
import * as db from "../lib/db";

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
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
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
    // El índice, no el volcado: una línea por cliente con lo que hace
    // falta para saber a quién preguntarle el detalle. Ver lib/agencia.js.
    const clientSummaries = indiceParaPrompt(clients);

    return `Eres el asistente general de la agencia Juancito Ads.

QUIÉN ERES:
· Un estratega de marketing digital que conoce TODOS los clientes de la agencia.
· PUEDES LEER los calendarios y las tareas de todos ellos, con las herramientas
  consultar_publicaciones, consultar_tareas y resumen_agencia. Úsalas siempre que
  te pidan datos: reportes, qué está pendiente, qué falta por escribir, qué se
  publica esta semana, cuántos posts lleva aprobados un cliente. NO respondas que
  no tienes acceso —lo tienes— y NO te inventes cifras: pídelas.
· El índice de abajo te dice quién hay y cuánto tiene. El detalle lo traes tú con
  las herramientas: no está escrito aquí para no gastar la conversación entera en
  datos que quizá no hagan falta.
· Para EDITAR publicaciones, el usuario debe ir al chat del cliente concreto: usa
  ir_a_cliente para llevarlo allí.

ÍNDICE DE LA AGENCIA (${clients.length} cliente${clients.length === 1 ? "" : "s"}):
${clientSummaries || "(Sin clientes aún)"}

CÓMO DEBES RESPONDER:
· En español de Panamá, con tildes y signos de apertura (¿, ¡).
· Conciso y directo.
· Cuando hables de un cliente, referéncialo por nombre.
· En los reportes, da la cifra y luego el detalle que la sostiene. Si listas
  publicaciones, incluye cliente, fecha y formato: una lista sin cliente no sirve.
· Puedes comparar clientes, sugerir estrategias cruzadas y dar ideas de campañas.
· Si te preguntan algo que requiere editar un calendario, ofrece llevarlo al
  asistente de ese cliente.
· No inventes datos: si no los has consultado, consúltalos.`;
  }, [clients]);

  const executeToolCall = useCallback(async (toolName, toolInput) => {
    if (toolName === "ir_a_cliente") {
      const target = buscarCliente(clients, toolInput.client_id || toolInput.nombre);
      if (!target) return { ok: false, mensaje: "No encontré ese cliente." };
      onSelectClient(target.id);
      return { ok: true, mensaje: `Navegando a ${target.name}.` };
    }

    if (toolName === "resumen_agencia") {
      return { ok: true, ...resumenAgencia(clients) };
    }

    if (toolName === "consultar_publicaciones") {
      const r = consultarPublicaciones(clients, toolInput || {});
      if (!r.ok) return r;
      // Un mes entero de cinco clientes no cabe en una respuesta útil. Se
      // recorta y se DICE que se recortó, para que la IA pida más fino en
      // vez de dar por buena una lista a medias como si fuera completa.
      const TOPE = 120;
      if (r.total > TOPE) {
        return {
          ok: true,
          total: r.total,
          mostradas: TOPE,
          aviso: `Hay ${r.total} publicaciones y se muestran las primeras ${TOPE}. Afina el filtro (cliente, mes, semana, estado) si necesitas el resto.`,
          publicaciones: r.publicaciones.slice(0, TOPE),
        };
      }
      return r;
    }

    if (toolName === "consultar_tareas") {
      const objetivo = toolInput?.cliente ? buscarCliente(clients, toolInput.cliente) : null;
      if (toolInput?.cliente && !objetivo) {
        return { ok: false, mensaje: `No encontré ningún cliente que se parezca a «${toolInput.cliente}».` };
      }
      const objetivos = objetivo ? [objetivo] : clients;
      const filas = [];
      for (const c of objetivos) {
        const id = c.dbId || c.id;
        let tareas = [];
        try {
          tareas = await db.loadClientTasks(id);
        } catch {
          // Que falle la lectura de un cliente no debe tumbar el informe
          // entero: se dice de quién no se pudo leer y se sigue.
          filas.push({ cliente: c.name, error: "No se pudieron leer sus tareas." });
          continue;
        }
        for (const t of tareas) {
          if (toolInput?.estado && (t.status || "pending") !== toolInput.estado) continue;
          filas.push({
            cliente: c.name,
            id: t.id,
            titulo: t.title,
            descripcion: t.description || "",
            estado: t.status || "pending",
            vence: t.due_date || null,
            recurrencia: t.recurrence || "none",
          });
        }
      }
      return { ok: true, total: filas.length, tareas: filas };
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
          name: "resumen_agencia",
          description: "Cifras de toda la agencia: por cliente, cuántas publicaciones hay y en qué estado (pendientes, aprobadas, rechazadas, publicadas), cuántas están incompletas y cuántas sin hora. Úsala para reportes generales y para saber a qué cliente mirar de cerca.",
          input_schema: { type: "object", properties: {} },
        },
        {
          name: "consultar_publicaciones",
          description: "Lee publicaciones de los calendarios, de uno o de todos los clientes. Devuelve cliente, fecha, día, semana, formato, categoría, estado, hora, idea, descripción, guion y qué le falta a cada una. Úsala para «pásame los guiones de la semana 2», «qué hay sin descripción», «qué se publica el lunes» o «qué lleva aprobado este cliente». Sin filtros devuelve todo, así que filtra.",
          input_schema: {
            type: "object",
            properties: {
              cliente: { type: "string", description: "Nombre o ID del cliente. Omítelo para mirar a todos." },
              mes: { type: "integer", description: "Mes como lo dice una persona: 1 = enero, 12 = diciembre." },
              anio: { type: "integer", description: "Año de cuatro cifras." },
              semana: { type: "integer", description: "Número de semana dentro del calendario (1 es la del primer día del mes)." },
              dia: { type: "string", enum: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"], description: "Día de la semana." },
              desde: { type: "string", description: "Fecha inicial AAAA-MM-DD, inclusive." },
              hasta: { type: "string", description: "Fecha final AAAA-MM-DD, inclusive." },
              estado: { type: "string", enum: ["pending", "approved", "rejected", "published"], description: "Estado de aprobación." },
              formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Formato." },
              categoria: { type: "string", description: "Categoría temática." },
              sin_descripcion: { type: "boolean", description: "Sólo las que no tienen descripción escrita." },
              sin_guion: { type: "boolean", description: "Sólo las que no tienen guion escrito." },
              sin_hora: { type: "boolean", description: "Sólo las que no tienen hora de publicación." },
              incompletas: { type: "boolean", description: "Sólo las que a las que les falta algún campo para su formato." },
            },
          },
        },
        {
          name: "consultar_tareas",
          description: "Lee las tareas de los clientes: título, descripción, estado, fecha de vencimiento y recurrencia. Úsala para «qué tareas tengo pendientes» o «qué falta por hacer con este cliente».",
          input_schema: {
            type: "object",
            properties: {
              cliente: { type: "string", description: "Nombre o ID del cliente. Omítelo para todos." },
              estado: { type: "string", enum: ["pending", "completed"], description: "Filtrar por estado." },
            },
          },
        },
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
