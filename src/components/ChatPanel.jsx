import { useState, useEffect, useRef, useId, useCallback } from "react";
import Icon from "./Icon";
import BancoSelector from "./BancoSelector";
import { CopyButton } from "./calendario/primitivas";
import { stripMarkdown } from "./calendario/formato";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { conversarIA, leerResumenChat, resumirChat, buildChatSystemPrompt, getChatTools } from "../api";
import { uid, compressImage } from "../utils";
import { leerHora, MAL, aplicarLote } from "../lib/lote";
import { partirMensaje, marcarImagen, marcarContexto, FORMATOS_IMAGEN, INSTRUCCION_PIEZAS, INSTRUCCION_ADJUNTOS } from "../lib/mensajeChat";
import { imagenParaModelo, fotogramasDeVideo, descargarEnTamano } from "../lib/medios";
import * as db from "../lib/db";
import { tareaDesdeIA, fechaEnZona, PROPIEDADES_FECHA_TAREA } from "../lib/agenda";

const MAX_ADJUNTOS = 6;
// Vueltas del navegador con herramientas propias. Las del servidor
// (web, repositorio, consultas) no cuentan: las encadena el Worker.
const MAX_VUELTAS = 8;
// Pasado este número de mensajes sin resumir, lo más viejo se pliega en
// el resumen. Lo decide el servidor; esto sólo evita pedirlo en balde.
const UMBRAL_RESUMEN = 60;

/** El texto de los mensajes del asistente de una vuelta, en orden. */
const textoDe = (mensajes) => mensajes
  .filter((m) => m.role === "assistant" && Array.isArray(m.content))
  .flatMap((m) => m.content.filter((b) => b.type === "text").map((b) => b.text || ""))
  .join("")
  .trim();
const MAX_VIDEOS = 2;
const FOTOGRAMAS = 6;

export default function ChatPanel({
  client,
  calendar,
  calId,
  clients = [],
  onUpdateCal,
  onClose,
  onAddIdea,
  onSelectClient,
  defaultMode,
}) {
  const [chatMode, setChatMode] = useState(defaultMode || (client ? "client" : "global"));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(chatMode === "client" && Boolean(client));
  const [error, setError] = useState("");
  const [memories, setMemories] = useState([]);
  const [showMemories, setShowMemories] = useState(false);
  const [actionFeedback, setActionFeedback] = useState([]);
  const [listening, setListening] = useState(false);
  const [adjuntos, setAdjuntos] = useState([]);
  const [bancoAbierto, setBancoAbierto] = useState(false);
  const [progreso, setProgreso] = useState("");
  // Lo que llega en streaming mientras el asistente escribe.
  const [enVivo, setEnVivo] = useState({ texto: "", pensando: "", pasos: [] });
  const [resumen, setResumen] = useState({ resumen: "", hasta: null });
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const dialogRef = useDialogA11y(onClose);
  const inputId = useId();
  const clientId = client?.dbId || client?.id;
  const calRef = useRef(calendar);
  calRef.current = calendar;

  const globalMsgsRef = useRef([]);

  const switchMode = useCallback((newMode) => {
    if (newMode === chatMode) return;
    if (chatMode === "global") globalMsgsRef.current = messages;
    if (newMode === "global") {
      setMessages(globalMsgsRef.current);
      setLoadingHistory(false);
      setMemories([]);
      setShowMemories(false);
    } else {
      setLoadingHistory(true);
    }
    setChatMode(newMode);
    setActionFeedback([]);
    setError("");
  }, [chatMode, messages]);

  useEffect(() => {
    if (chatMode !== "client" || !clientId) return;
    let alive = true;
    (async () => {
      try {
        // El historial entero: el corte en 100 mensajes era perder lo de
        // hace semanas. Lo más viejo lo cubre el resumen.
        const [history, mems, res] = await Promise.all([
          db.loadChatMessages(clientId, Infinity),
          db.loadClientMemories(clientId),
          leerResumenChat(clientId),
        ]);
        if (alive) {
          setMessages(history);
          setMemories(mems);
          setResumen(res);
        }
      } catch {
        if (alive) setError("No se pudo cargar el historial.");
      }
      if (alive) setLoadingHistory(false);
    })();
    return () => { alive = false; };
  }, [clientId, chatMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, actionFeedback]);

  useEffect(() => {
    if (!loadingHistory) inputRef.current?.focus();
  }, [loadingHistory]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ya parado */ }
      }
    };
  }, []);

  const toggleVoice = useCallback(async () => {
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

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        setError("Permiso de micrófono denegado. Actívalo en los ajustes del navegador.");
        return;
      }
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
      if (ev.error === "aborted" || ev.error === "not-allowed") return;
      const msgs = {
        "no-speech": "No se detectó voz. Intenta de nuevo.",
        "audio-capture": "No se encontró micrófono. Conecta uno e intenta de nuevo.",
        "network": "Error de red al procesar la voz.",
      };
      const msg = msgs[ev.error] ?? `Error de dictado: ${ev.error || "desconocido"}.`;
      if (msg) setError(msg);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try { recognition.start(); } catch { setError("No se pudo iniciar el dictado."); setListening(false); return; }
    setListening(true);
  }, [listening]);

  const agregarAdjuntos = useCallback((nuevos) => {
    const lista = [...adjuntos];
    for (const a of nuevos) {
      const videos = lista.filter((x) => x.tipo === "video").length;
      if (lista.length >= MAX_ADJUNTOS || (a.tipo === "video" && videos >= MAX_VIDEOS)) {
        setError(`Como máximo ${MAX_ADJUNTOS} adjuntos por mensaje, y ${MAX_VIDEOS} de ellos videos.`);
        if (a.origen === "subida") URL.revokeObjectURL(a.preview);
        continue;
      }
      lista.push(a);
    }
    setAdjuntos(lista);
  }, [adjuntos]);

  const handleFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = "";
    const nuevos = [];
    for (const file of files) {
      if (file.type.startsWith("video/")) {
        // El video se guarda en el banco antes de analizarlo: el análisis
        // lo hace el servidor leyendo de R2, y R2 es por cliente.
        if (!clientId) {
          setError("Para analizar un video, abre el asistente de un cliente: el video se guarda en su banco de contenido.");
          continue;
        }
        nuevos.push({ id: uid(), tipo: "video", nombre: file.name, origen: "subida", file, preview: null });
      } else if (file.type.startsWith("image/")) {
        try {
          const data = await compressImage(file, 1024);
          nuevos.push({ id: uid(), tipo: "imagen", nombre: file.name, origen: "subida", base64: data.split(",")[1], preview: URL.createObjectURL(file) });
        } catch {
          setError(`No se pudo procesar «${file.name}».`);
        }
      }
    }
    agregarAdjuntos(nuevos);
  }, [clientId, agregarAdjuntos]);

  const desdeBanco = useCallback((items) => {
    setBancoAbierto(false);
    agregarAdjuntos(items.map((item) => ({
      id: uid(),
      tipo: item.file_type === "video" ? "video" : "imagen",
      nombre: item.file_name,
      origen: "banco",
      clave: item.file_path,
      preview: db.getContentBankUrl(item.file_path),
    })));
  }, [agregarAdjuntos]);

  const quitarAdjunto = useCallback((id) => {
    const a = adjuntos.find((x) => x.id === id);
    if (a?.origen === "subida") URL.revokeObjectURL(a.preview);
    setAdjuntos(adjuntos.filter((x) => x.id !== id));
  }, [adjuntos]);

  /**
   * Convierte los adjuntos en lo que recibe el modelo. De las imágenes,
   * la imagen. De los videos, el análisis de Gemini —que se guarda en el
   * historial, para que el hilo lo recuerde en los mensajes siguientes—
   * y unos fotogramas, que sólo viajan en este turno.
   */
  const prepararAdjuntos = useCallback(async (lista) => {
    const bloques = [];
    const contextos = [];
    const imagenes = lista.filter((a) => a.tipo === "imagen");
    if (imagenes.length) {
      contextos.push(marcarContexto(
        imagenes.length === 1 ? "Imagen adjunta" : `${imagenes.length} imágenes adjuntas`,
        imagenes.map((a) => `· ${a.nombre}${a.origen === "banco" ? " (del banco)" : ""}`).join("\n"),
      ));
    }
    for (const a of lista) {
      if (a.tipo === "imagen") {
        setProgreso(`Preparando «${a.nombre}»…`);
        const base64 = a.base64 ?? await imagenParaModelo(a.preview);
        bloques.push({ type: "text", text: `Imagen adjunta «${a.nombre}»:` });
        bloques.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } });
        continue;
      }

      let clave = a.clave;
      if (!clave) {
        setProgreso(`Guardando «${a.nombre}» en el banco…`);
        clave = (await db.uploadContentBankItem(clientId, a.file)).file_path;
      }
      setProgreso(`Viendo y escuchando «${a.nombre}»… (puede tardar un minuto)`);
      const [analisis, fotos] = await Promise.allSettled([
        db.analizarVideo(clave),
        fotogramasDeVideo(db.getContentBankUrl(clave), FOTOGRAMAS),
      ]);
      if (analisis.status === "rejected" && fotos.status === "rejected") {
        throw new Error(`No se pudo leer el video «${a.nombre}»: ${analisis.reason?.message || "error desconocido"}`);
      }
      contextos.push(marcarContexto(
        `Video «${a.nombre}»`,
        analisis.status === "fulfilled"
          ? analisis.value.analisis
          : `No se pudo analizar el audio ni las escenas (${analisis.reason?.message || "error desconocido"}). Sólo hay fotogramas.`,
      ));
      if (fotos.status === "fulfilled") {
        bloques.push({ type: "text", text: `Fotogramas del video «${a.nombre}», en los segundos ${fotos.value.map((f) => f.segundo).join(", ")}:` });
        for (const f of fotos.value) {
          bloques.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.base64 } });
        }
      }
    }
    return { bloques, contextos };
  }, [clientId]);

  const resolveClient = useCallback((nameOrId) => {
    if (!nameOrId) return null;
    const lower = nameOrId.toLowerCase();
    return clients.find(
      (c) => c.id === nameOrId || (c.dbId || c.id) === nameOrId ||
             c.name.toLowerCase() === lower ||
             c.name.toLowerCase().includes(lower),
    );
  }, [clients]);

  const buildGlobalSystemPrompt = useCallback(() => {
    const clientBlocks = clients.map((c) => {
      const lines = [`· ${c.name} (ID: ${c.dbId || c.id}) — ${c.industry || "Sin industria"}${c.instagram ? ` · ${c.instagram}` : ""}`];
      for (const cal of c.calendars || []) {
        const postCount = (cal.days || []).reduce((a, d) => a + (d.posts || []).length, 0);
        lines.push(`    Calendario: ${cal.name || "Sin nombre"} — ${(cal.month ?? 0) + 1}/${cal.year} — ${postCount} pub.`);
        if (cal.campaign) lines.push(`    Campaña: ${cal.campaign}`);
      }
      return lines.join("\n");
    }).join("\n\n");

    return `Eres el asistente general de la agencia Juancito Ads.

QUIÉN ERES:
· Un estratega de marketing digital que conoce TODOS los clientes de la agencia.
· Tienes acceso a la visión general de todos los calendarios y publicaciones.
· Puedes dar ideas, sugerencias y análisis que abarquen a uno, varios o todos los clientes.
· Puedes crear tareas para cualquier cliente con crear_tarea (indicando el nombre del cliente).
· Puedes añadir ideas al banco de ideas de cualquier cliente con agregar_banco_ideas.
· Puedes navegar al chat de un cliente específico con ir_a_cliente.

CLIENTES DE LA AGENCIA (${clients.length}):
${clientBlocks || "(Sin clientes aún)"}

${INSTRUCCION_PIEZAS}

${INSTRUCCION_ADJUNTOS}

CÓMO DEBES RESPONDER:
· En español de Panamá, con tildes y signos de apertura (¿, ¡).
· Conciso y directo.
· Cuando hables de un cliente, referéncialo por nombre.
· Puedes comparar clientes, sugerir estrategias cruzadas y dar ideas de campañas.
· No inventes datos que no estén en el contexto.`;
  }, [clients]);

  const getGlobalTools = useCallback(() => [
    {
      name: "ir_a_cliente",
      description: "Navega al asistente de un cliente específico para ver su calendario y ejecutar acciones.",
      input_schema: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre del cliente." },
        },
        required: ["nombre"],
      },
    },
    {
      name: "crear_tarea",
      description: "Crea una tarea para un cliente. Debes indicar de qué cliente.",
      input_schema: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nombre del cliente." },
          titulo: { type: "string", description: "Título de la tarea." },
          descripcion: { type: "string", description: "Descripción (opcional)." },
          ...PROPIEDADES_FECHA_TAREA,
          asignada_a: { type: "string", description: "Persona asignada (opcional)." },
        },
        required: ["cliente", "titulo"],
      },
    },
    {
      name: "agregar_banco_ideas",
      description: "Añade una idea al banco de ideas de un cliente.",
      input_schema: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nombre del cliente." },
          idea: { type: "string", description: "Concepto de la publicación." },
          formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"] },
          descripcion: { type: "string", description: "Caption sugerida (opcional)." },
          guion: { type: "string", description: "Guion sugerido (opcional)." },
          categoria: { type: "string", description: "Categoría temática (opcional)." },
        },
        required: ["cliente", "idea"],
      },
    },
  ], []);

  const executeToolCall = useCallback(async (toolName, toolInput) => {
    if (chatMode === "global") {
      if (toolName === "ir_a_cliente") {
        const target = resolveClient(toolInput.nombre);
        if (!target) return { ok: false, mensaje: "No encontré ese cliente." };
        if (onSelectClient) onSelectClient(target.id);
        return { ok: true, mensaje: `Navegando a ${target.name}.` };
      }
      if (toolName === "crear_tarea") {
        const target = resolveClient(toolInput.cliente);
        if (!target) return { ok: false, mensaje: `No encontré el cliente «${toolInput.cliente}».` };
        const fechas = tareaDesdeIA(toolInput, fechaEnZona());
        if (fechas.error) return { ok: false, mensaje: fechas.error };
        await db.saveClientTask({
          client_id: target.dbId || target.id,
          title: toolInput.titulo,
          description: toolInput.descripcion || "",
          assigned_to: toolInput.asignada_a || "",
          ...fechas,
        });
        return { ok: true, mensaje: `Tarea creada para ${target.name}: «${toolInput.titulo}»` };
      }
      if (toolName === "agregar_banco_ideas") {
        const target = resolveClient(toolInput.cliente);
        if (!target) return { ok: false, mensaje: `No encontré el cliente «${toolInput.cliente}».` };
        const newIdea = {
          id: uid(),
          format: toolInput.formato || "post",
          idea: toolInput.idea,
          descripcion: toolInput.descripcion || "",
          guion: toolInput.guion || "",
          category: toolInput.categoria || "",
          status: "pending",
          _addedAt: new Date().toISOString(),
        };
        return { ok: true, mensaje: `Idea añadida para ${target.name}: «${toolInput.idea}»`, _idea: newIdea, _clientId: target.id };
      }
      return { ok: false, mensaje: `Herramienta desconocida: ${toolName}` };
    }

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

    if (toolName === "crear_tarea") {
      const fechas = tareaDesdeIA(toolInput, fechaEnZona());
      if (fechas.error) return { ok: false, mensaje: fechas.error };
      await db.saveClientTask({
        client_id: clientId,
        title: toolInput.titulo,
        description: toolInput.descripcion || "",
        assigned_to: toolInput.asignada_a || "",
        ...fechas,
      });
      return { ok: true, mensaje: `Tarea creada: «${toolInput.titulo}»` };
    }

    if (toolName === "agregar_banco_ideas") {
      const newIdea = {
        id: uid(),
        format: toolInput.formato || "post",
        idea: toolInput.idea,
        descripcion: toolInput.descripcion || "",
        guion: toolInput.guion || "",
        category: toolInput.categoria || "",
        status: "pending",
        _addedAt: new Date().toISOString(),
      };
      return { ok: true, mensaje: `Idea añadida al banco: «${toolInput.idea}»`, _idea: newIdea };
    }

    const cal = calRef.current;

    // Antes que la comprobación del calendario: una imagen para el chat
    // no lo necesita. Sólo asignarla a una publicación sí.
    if (toolName === "generar_imagen") {
      if (!toolInput.prompt) return { ok: false, mensaje: "Falta la descripción de la imagen." };
      const formato = FORMATOS_IMAGEN[toolInput.formato_imagen] ? toolInput.formato_imagen : "square";
      const post = toolInput.post_id && cal
        ? cal.days.flatMap((d) => d.posts || []).find((p) => p.id === toolInput.post_id)
        : null;
      setProgreso(`Generando la imagen (${FORMATOS_IMAGEN[formato].label})…`);
      try {
        const res = await db.generateImage({
          clientId,
          idea: toolInput.prompt,
          format: post?.format || "",
          category: post?.category || "",
          title: post?.idea || "",
          descripcion: post?.descripcion || "",
          guion: post?.guion || "",
          imageFormat: formato,
        });
        if (!res?.clave) return { ok: false, mensaje: "La IA no devolvió ninguna imagen." };
        const entregada = { ok: true, _imagen: { clave: res.clave, formato } };
        if (!toolInput.post_id) {
          return { ...entregada, mensaje: `Imagen generada y mostrada en el chat (${FORMATOS_IMAGEN[formato].label}).` };
        }
        if (!post || !calId || !onUpdateCal) {
          return { ...entregada, mensaje: `Imagen mostrada en el chat, pero no encontré la publicación ${toolInput.post_id} para asignarla.` };
        }
        const updated = {
          ...cal,
          days: cal.days.map((d) => ({
            ...d,
            posts: (d.posts || []).map((p) => (p.id === toolInput.post_id ? { ...p, image: res.clave } : p)),
          })),
        };
        calRef.current = updated;
        onUpdateCal(calId, updated);
        return { ...entregada, mensaje: `Imagen mostrada en el chat y asignada a la publicación ${toolInput.post_id}.` };
      } catch (err) {
        return { ok: false, mensaje: err?.message || "Error al generar la imagen." };
      } finally {
        setProgreso("");
      }
    }

    if (!cal || !calId || !onUpdateCal) {
      return { ok: false, mensaje: "No hay calendario seleccionado." };
    }

    if (toolName === "crear_publicacion") {
      const day = (cal.days || []).find((d) => d.date === toolInput.fecha);
      if (!day) return { ok: false, mensaje: `No existe el día ${toolInput.fecha} en este calendario.` };
      const hora = leerHora(toolInput.hora);
      if (hora === MAL) return { ok: false, mensaje: `No entendí la hora «${toolInput.hora}». Escríbela como «9am», «21:30» o «6 pm».` };
      const newPost = {
        id: uid(),
        format: toolInput.formato || "post",
        idea: toolInput.idea || "",
        descripcion: toolInput.descripcion || "",
        guion: toolInput.guion || "",
        category: toolInput.categoria || "",
        status: "pending",
        hashtagsFinales: "",
        publishTime: hora ?? "",
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
      const hora = leerHora(toolInput.hora);
      if (hora === MAL) return { ok: false, mensaje: `No entendí la hora «${toolInput.hora}». Escríbela como «9am», «21:30» o «6 pm».` };
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
          if (hora !== undefined) upd.publishTime = hora;
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

    if (toolName === "editar_publicaciones_lote") {
      const r = aplicarLote(cal, toolInput);
      if (!r.ok) return r;
      const updated = { ...cal, days: r.dias };
      calRef.current = updated;
      onUpdateCal(calId, updated);
      return { ok: true, mensaje: `${r.count} publicación${r.count === 1 ? "" : "es"} editada${r.count === 1 ? "" : "s"} en lote.` };
    }

    return { ok: false, mensaje: `Herramienta desconocida: ${toolName}` };
  }, [chatMode, clientId, calId, onUpdateCal, memories, resolveClient, onSelectClient]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && !adjuntos.length) || loading) return;

    const enviados = adjuntos;
    setInput("");
    setError("");
    setActionFeedback([]);
    setAdjuntos([]);

    const pedido = text || (enviados.some((a) => a.tipo === "video")
      ? "Analiza el video que te adjunto."
      : "Analiza lo que te adjunto.");
    const userMsg = { role: "user", content: pedido, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Lo que se guarda lleva el análisis de cada video: así el hilo lo
      // sigue sabiendo en los mensajes siguientes, y al recargar.
      let bloquesAdjuntos = [];
      let guardado = pedido;
      if (enviados.length) {
        const { bloques, contextos } = await prepararAdjuntos(enviados);
        bloquesAdjuntos = bloques;
        guardado = [pedido, ...contextos].join("\n\n");
        setMessages((prev) => prev.map((m) => (m === userMsg ? { ...m, content: guardado } : m)));
        setProgreso("");
      }

      if (chatMode === "client" && clientId) {
        await db.saveChatMessage(clientId, "user", guardado);
      }

      // Conversación larga: se pliega lo viejo ANTES de montar el prompt.
      let res = resumen;
      if (chatMode === "client" && clientId) {
        const sinResumir = messages.filter((m) => !res.hasta || m.created_at > res.hasta).length;
        if (sinResumir > UMBRAL_RESUMEN) {
          setProgreso("Resumiendo la conversación anterior…");
          const nuevo = await resumirChat(clientId).catch(() => null);
          if (nuevo) { res = nuevo; setResumen(nuevo); }
          setProgreso("");
        }
      }

      let system = chatMode === "client" && client
        ? buildChatSystemPrompt(client, calRef.current, client.githubContext || "", memories)
        : buildGlobalSystemPrompt();
      if (res.resumen) {
        system += `\n\nRESUMEN DE LA CONVERSACIÓN ANTERIOR (lo más antiguo, ya plegado; lo reciente va entero en los mensajes):\n${res.resumen}`;
      }

      const tools = chatMode === "client"
        ? getChatTools(Boolean(calRef.current))
        : getGlobalTools();

      const recientes = [...messages, { role: "user", content: guardado, created_at: userMsg.created_at }]
        .filter((m) => chatMode !== "client" || !res.hasta || m.created_at > res.hasta)
        .slice(chatMode === "client" ? 0 : -100)
        .map((m) => ({ role: m.role, content: m.content }));
      // La API exige empezar por el usuario.
      while (recientes.length && recientes[0].role !== "user") recientes.shift();
      const conversationMessages = recientes;
      if (bloquesAdjuntos.length) {
        conversationMessages[conversationMessages.length - 1].content = [
          ...bloquesAdjuntos,
          { type: "text", text: guardado },
        ];
      }

      const feedbacks = [];
      const pasos = [];
      // Las imágenes generadas van al mensaje final como marcas: así se
      // pintan debajo del texto y siguen ahí al recargar el historial.
      const imagenes = [];
      let entregado = false;
      let textoTurno = "";

      // Lo que el asistente HIZO se guarda con su respuesta, plegado: así
      // el hilo lo recuerda en los mensajes siguientes y al recargar.
      // Antes sólo se guardaba el texto, y «¿qué cambiaste ayer?» no
      // tenía respuesta.
      const entregar = async (textoAsistente) => {
        const hechas = [
          ...pasos,
          ...feedbacks.map((f) => `${f.ok ? "Hecho" : "Falló"}: ${f.mensaje}`),
        ];
        const contenido = [
          textoAsistente,
          ...imagenes.map((i) => marcarImagen(i.clave, i.formato)),
          hechas.length ? marcarContexto("Acciones realizadas", hechas.join("\n")) : "",
        ].filter(Boolean).join("\n\n");
        entregado = true;
        if (!contenido) return;
        if (chatMode === "client" && clientId) {
          await db.saveChatMessage(clientId, "assistant", contenido);
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: contenido, created_at: new Date().toISOString() },
        ]);
      };

      const onEvento = (ev) => {
        if (ev.t === "texto") setEnVivo((v) => ({ ...v, texto: v.texto + ev.d }));
        else if (ev.t === "pensando") setEnVivo((v) => ({ ...v, pensando: v.pensando + ev.d }));
        else if (ev.t === "herramienta") {
          pasos.push(ev.texto);
          setEnVivo((v) => ({ ...v, pasos: [...v.pasos, ev.texto] }));
        }
      };

      for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
        setEnVivo((v) => ({ ...v, pensando: "" }));
        const fin = await conversarIA({
          messages: conversationMessages,
          system,
          tools,
          clienteId: chatMode === "client" ? clientId : null,
          onEvento,
        });
        // TAL CUAL: los bloques de razonamiento llevan firma y la API
        // rechaza la vuelta siguiente si llegan tocados.
        conversationMessages.push(...fin.mensajes);
        const texto = textoDe(fin.mensajes);
        if (texto) textoTurno = [textoTurno, texto].filter(Boolean).join("\n\n");

        if (fin.stopReason === "refusal") {
          await entregar([textoTurno, "No puedo ayudar con esa petición tal como está planteada. ¿La reformulamos?"].filter(Boolean).join("\n\n"));
          break;
        }
        if (fin.stopReason !== "tool_use") {
          if (fin.stopReason === "max_tokens") textoTurno += "\n\n(La respuesta se cortó por largo. Pídeme que continúe.)";
          if (fin.stopReason === "limite") textoTurno += "\n\n(Llegué al límite de pasos de este turno. Dime si sigo.)";
          await entregar(textoTurno);
          break;
        }

        const yaResueltas = new Set((fin.resultadosServidor ?? []).map((r) => r.tool_use_id));
        const ultimo = fin.mensajes[fin.mensajes.length - 1]?.content ?? [];
        const toolUseBlocks = ultimo.filter((b) => b.type === "tool_use" && !yaResueltas.has(b.id));

        const toolResults = [...(fin.resultadosServidor ?? [])];
        for (const toolBlock of toolUseBlocks) {
          try {
            const result = await executeToolCall(toolBlock.name, toolBlock.input);
            if (result._idea && onAddIdea) {
              onAddIdea(result._idea, result._clientId);
            }
            if (result._imagen) imagenes.push(result._imagen);
            feedbacks.push({ tool: toolBlock.name, ...result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify({ ok: result.ok, mensaje: result.mensaje }),
            });
          } catch (e) {
            const result = { ok: false, mensaje: e.message || "Error al ejecutar la acción." };
            feedbacks.push({ tool: toolBlock.name, ...result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result),
              is_error: true,
            });
          }
        }
        setActionFeedback([...feedbacks]);
        conversationMessages.push({ role: "user", content: toolResults });
      }
      // Sin respuesta final tras todas las vueltas: lo generado y lo
      // hecho no pueden perderse por eso.
      if (!entregado && (textoTurno || imagenes.length || feedbacks.length)) {
        await entregar([textoTurno, "(Me quedé sin vueltas antes de terminar. Dime si sigo.)"].filter(Boolean).join("\n\n"));
      }
    } catch (e) {
      setError(e.message || "Error al generar respuesta.");
    } finally {
      setLoading(false);
      setProgreso("");
      setEnVivo({ texto: "", pensando: "", pasos: [] });
      for (const a of enviados) if (a.origen === "subida") URL.revokeObjectURL(a.preview);
    }
  }, [input, loading, messages, client, clientId, chatMode, memories, executeToolCall, adjuntos, prepararAdjuntos, buildGlobalSystemPrompt, getGlobalTools, onAddIdea, resumen]);

  const handleClear = useCallback(async () => {
    if (chatMode === "client" && clientId) {
      try {
        await db.clearChatMessages(clientId);
      } catch {
        setError("No se pudo limpiar el historial.");
        return;
      }
    }
    setMessages([]);
    setResumen({ resumen: "", hasta: null });
    if (chatMode === "global") globalMsgsRef.current = [];
    setError("");
    setActionFeedback([]);
  }, [chatMode, clientId]);

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

  const hasSpeechAPI = typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const isGlobal = chatMode === "global";
  const panelLabel = isGlobal ? "Agente de la agencia" : `Chat con asistente de ${client?.name || ""}`;

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
        aria-label={panelLabel}
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
          flexDirection: "column",
          gap: "var(--sp-2)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
            <span style={{ color: "var(--accent)", display: "flex" }}>
              <Icon name={isGlobal ? "globe" : "sparkles"} size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "var(--fs-sm)",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {isGlobal ? "Agente de la agencia" : `Asistente de ${client?.name || ""}`}
              </div>
              <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)" }}>
                {isGlobal ? "Conoce todos tus clientes" : "Conversa, genera ideas y ejecuta acciones"}
              </div>
            </div>
            {!isGlobal && memories.length > 0 && (
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

          {/* Selector de contexto: Global / Cliente */}
          {client && (
            <div className="chat-mode-tabs" role="tablist" aria-label="Contexto del chat">
              <button
                role="tab"
                className="chat-mode-tab"
                aria-selected={isGlobal ? "true" : "false"}
                onClick={() => switchMode("global")}
              >
                <Icon name="globe" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                Global
              </button>
              <button
                role="tab"
                className="chat-mode-tab"
                aria-selected={!isGlobal ? "true" : "false"}
                onClick={() => switchMode("client")}
              >
                <Icon name="sparkles" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                {client.name}
              </button>
            </div>
          )}
        </div>

        {/* Panel de memorias */}
        {!isGlobal && showMemories && memories.length > 0 && (
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
            isGlobal
              ? <GlobalEmptyState clientCount={clients.length} />
              : <EmptyState clientName={client?.name || ""} hasCalendar={Boolean(calendar)} />
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
          {loading && (enVivo.pasos.length > 0 || enVivo.pensando) && (
            <EnVivo pasos={enVivo.pasos} pensando={enVivo.pensando} />
          )}
          {loading && enVivo.texto && (
            <ChatMessage message={{ role: "assistant", content: enVivo.texto }} />
          )}
          {loading && !enVivo.texto && (
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
              <span role="status" style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>
                {progreso || (enVivo.pasos.length ? enVivo.pasos[enVivo.pasos.length - 1] + "…" : "Pensando…")}
              </span>
            </div>
          )}
          {error && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--fs-xs)", padding: "var(--sp-2) 0" }}>
              {error}
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Adjuntos listos para enviar */}
        {adjuntos.length > 0 && (
          <div style={{
            padding: "var(--sp-2) var(--sp-4)",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
            background: "var(--surface-2)",
          }}>
            <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", marginBottom: "var(--sp-1)" }}>
              {adjuntos.length} adjunto{adjuntos.length === 1 ? "" : "s"} listo{adjuntos.length === 1 ? "" : "s"}
              {adjuntos.some((a) => a.tipo === "video") && " · los videos se analizan al enviar"}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: "var(--sp-2)", overflowX: "auto" }}>
              {adjuntos.map((a) => (
                <li key={a.id} style={{ position: "relative", flexShrink: 0 }}>
                  {/* Un video recién escogido es un blob:, y la CSP no deja
                      reproducirlos (media-src cae en 'self'): se enseña el
                      icono hasta que esté en el banco. */}
                  {a.tipo === "video" && a.origen === "banco" ? (
                    <video src={`${a.preview}#t=0.5`} muted preload="metadata" aria-label={`Video: ${a.nombre}`} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "block", background: "var(--bg)" }} />
                  ) : a.tipo === "video" ? (
                    <span role="img" aria-label={`Video: ${a.nombre}`} title={a.nombre} style={{ width: 56, height: 56, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--text-dim)" }}>
                      <Icon name="video" size={22} />
                    </span>
                  ) : (
                    <img src={a.preview} alt={`Imagen: ${a.nombre}`} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", display: "block" }} />
                  )}
                  {a.tipo === "video" && (
                    <span aria-hidden="true" style={{ position: "absolute", left: 4, bottom: 4, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: "var(--radius-pill)", padding: 3, display: "flex" }}>
                      <Icon name="play" size={10} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => quitarAdjunto(a.id)}
                    aria-label={`Quitar ${a.nombre}`}
                    disabled={loading}
                    style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, minHeight: 24, background: "var(--surface-3)" }}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {bancoAbierto && clientId && (
          <BancoSelector
            clientId={clientId}
            maximo={MAX_ADJUNTOS - adjuntos.length}
            titulo="Adjuntar del banco de contenido"
            onSelect={desdeBanco}
            onClose={() => setBancoAbierto(false)}
          />
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
            accept={clientId ? "image/*,video/*" : "image/*"}
            multiple
            onChange={handleFiles}
            style={{ display: "none" }}
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            className="btn-icon"
            onClick={() => fileRef.current?.click()}
            aria-label={clientId ? "Adjuntar imagen o video" : "Adjuntar imagen"}
            title={clientId ? "Adjuntar imagen o video" : "Adjuntar imagen"}
            disabled={loading || adjuntos.length >= MAX_ADJUNTOS}
            style={{ minHeight: "var(--tap)", minWidth: "var(--tap)" }}
          >
            <Icon name="paperclip" size={18} />
          </button>
          {clientId && (
            <button
              className="btn-icon"
              onClick={() => setBancoAbierto(true)}
              aria-label="Adjuntar del banco de contenido"
              title="Adjuntar del banco de contenido"
              disabled={loading || adjuntos.length >= MAX_ADJUNTOS}
              style={{ minHeight: "var(--tap)", minWidth: "var(--tap)" }}
            >
              <Icon name="folder" size={18} />
            </button>
          )}
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
            placeholder={listening ? "Escuchando…" : (isGlobal ? "Pregunta sobre tus clientes…" : "Escribe tu mensaje…")}
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
            disabled={(!input.trim() && !adjuntos.length) || loading}
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
        <span style={{ fontStyle: "italic" }}>«Dame 4 descripciones para este post» — cada una sale con su botón de copiar</span>
        <span style={{ fontStyle: "italic" }}>Adjunta un video del banco: «Hazme 3 guiones inspirados en este»</span>
        <span style={{ fontStyle: "italic" }}>«Genérame una imagen vertical para el lanzamiento»</span>
        {hasCalendar && (
          <>
            <span style={{ fontStyle: "italic" }}>«Créame un reel para el martes sobre tips»</span>
            <span style={{ fontStyle: "italic" }}>«Cambia todas las descripciones de los lunes a tono formal»</span>
          </>
        )}
        <span style={{ fontStyle: "italic" }}>«Recuerda que prefiero un tono formal»</span>
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

function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const bloques = partirMensaje(message.content);
  // Si hay piezas, cada una trae su botón: copiar además el mensaje
  // entero sería volver a pegarlo todo junto.
  const hayPiezas = bloques.some((b) => b.tipo === "pieza");

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      gap: "var(--sp-2)",
    }}>
      {bloques.map((b, i) => {
        if (b.tipo === "texto") return <Burbuja key={i} isUser={isUser} texto={b.texto} copiable={!isUser && !hayPiezas} />;
        if (b.tipo === "pieza") return <Pieza key={i} titulo={b.titulo} texto={b.texto} />;
        if (b.tipo === "imagen") return <ImagenGenerada key={i} clave={b.clave} formato={b.formato} />;
        return <Contexto key={i} titulo={b.titulo} texto={b.texto} />;
      })}
    </div>
  );
}

function Burbuja({ isUser, texto, copiable }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(stripMarkdown(texto)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div style={{ maxWidth: "85%", position: "relative" }}>
      <div style={{
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
        {texto}
      </div>
      {copiable && (
        <button
          type="button"
          className="btn-icon"
          onClick={handleCopy}
          aria-label={copied ? "Copiado" : "Copiar texto"}
          title={copied ? "Copiado" : "Copiar"}
          style={{
            position: "absolute",
            top: 2,
            right: -30,
            width: 24,
            height: 24,
            minHeight: 24,
            opacity: copied ? 1 : 0.4,
            color: copied ? "var(--accent)" : "var(--text-dim)",
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={14} />
        </button>
      )}
    </div>
  );
}

/** Un texto para pegar: su título, su botón y nada más. */
function Pieza({ titulo, texto }) {
  return (
    <section
      aria-label={titulo || "Texto para copiar"}
      style={{
        width: "92%",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-3)",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-3)",
      }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-3xs)", fontWeight: 600, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titulo || "Texto"}
        </span>
        <CopyButton text={texto} describes={titulo || "este texto"} />
      </div>
      <div style={{
        padding: "var(--sp-2) var(--sp-3)",
        fontSize: "var(--fs-xs)",
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "var(--text)",
      }}>
        {/* Se enseña lo mismo que se copia: sin asteriscos de markdown. */}
        {stripMarkdown(texto)}
      </div>
    </section>
  );
}

/** Lo que se le mandó al modelo con el mensaje: plegado, para no tapar la conversación. */
function Contexto({ titulo, texto }) {
  return (
    <details style={{
      width: "85%",
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)",
      fontSize: "var(--fs-3xs)",
      color: "var(--text-dim)",
    }}>
      <summary style={{ cursor: "pointer", padding: "var(--sp-2)", minHeight: "var(--tap-sm)", display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
        <Icon name={/^video/i.test(titulo) ? "video" : /^acciones/i.test(titulo) ? "bolt" : "image"} size={14} />
        <span>{titulo || "Adjunto"}</span>
      </summary>
      <div style={{ padding: "0 var(--sp-2) var(--sp-2)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto", lineHeight: 1.5 }}>
        {texto}
      </div>
    </details>
  );
}

/** La imagen que generó el asistente, lista para bajar al tamaño que se pidió. */
function ImagenGenerada({ clave, formato }) {
  const [tamano, setTamano] = useState(formato);
  const [bajando, setBajando] = useState(false);
  const [fallo, setFallo] = useState("");
  const selId = useId();
  const url = db.getContentBankUrl(clave);
  const f = FORMATOS_IMAGEN[tamano];

  const descargar = async () => {
    setBajando(true);
    setFallo("");
    try {
      await descargarEnTamano(url, f.w, f.h, `imagen-${f.w}x${f.h}.png`);
    } catch (e) {
      setFallo(e?.message || "No se pudo descargar la imagen.");
    }
    setBajando(false);
  };

  return (
    <figure style={{
      margin: 0,
      width: "92%",
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
    }}>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir la imagen en tamaño original">
        <img src={url} alt="Imagen generada por el asistente" style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "contain", background: "var(--bg)" }} />
      </a>
      <figcaption style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", alignItems: "center", padding: "var(--sp-2)" }}>
        <label htmlFor={selId} className="sr-only">Tamaño de descarga</label>
        <select
          id={selId}
          className="input"
          value={tamano}
          onChange={(e) => setTamano(e.target.value)}
          style={{ flex: 1, minWidth: 190, minHeight: "var(--tap-sm)" }}
        >
          {Object.entries(FORMATOS_IMAGEN).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={descargar} disabled={bajando} style={{ minHeight: "var(--tap-sm)" }}>
          <Icon name="download" size={16} /> {bajando ? "Preparando…" : "Descargar"}
        </button>
      </figcaption>
      {fallo && <p role="alert" style={{ margin: 0, padding: "0 var(--sp-2) var(--sp-2)", color: "var(--danger)", fontSize: "var(--fs-3xs)" }}>{fallo}</p>}
    </figure>
  );
}

function ActionChip({ feedback }) {
  const TOOL_LABELS = {
    guardar_memoria: "Memoria",
    borrar_memoria: "Memoria",
    crear_publicacion: "Calendario",
    editar_publicacion: "Calendario",
    eliminar_publicaciones: "Calendario",
    editar_publicaciones_lote: "Lote",
    crear_tarea: "Tarea",
    agregar_banco_ideas: "Banco de ideas",
    ir_a_cliente: "Navegación",
    generar_imagen: "Imagen",
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

/**
 * Lo que el asistente está haciendo mientras responde: los pasos —buscar
 * en internet, leer un archivo del repositorio— y, plegado, el resumen
 * de lo que va razonando. Sin esto, un turno largo era un «Pensando…»
 * de un minuto sin ninguna pista de si avanzaba.
 */
function EnVivo({ pasos, pensando }) {
  return (
    <div style={{ width: "85%", display: "flex", flexDirection: "column", gap: "var(--sp-1)", fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>
      {pasos.map((p, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}>
          <Icon name={i === pasos.length - 1 ? "clock" : "check"} size={12} /> {p}
        </span>
      ))}
      {pensando && (
        <details>
          <summary style={{ cursor: "pointer", minHeight: "var(--tap-sm)", display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
            <Icon name="brain" size={12} /> Razonando…
          </summary>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 200, overflowY: "auto", padding: "var(--sp-1) 0" }}>
            {pensando}
          </div>
        </details>
      )}
    </div>
  );
}
