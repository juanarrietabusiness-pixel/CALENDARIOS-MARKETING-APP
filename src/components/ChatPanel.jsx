import { useState, useEffect, useRef, useId, useCallback } from "react";
import Icon from "./Icon";
import BancoSelector from "./BancoSelector";
import { idDeCarpeta } from "../lib/drive";
import { CopyButton } from "./calendario/primitivas";
import { stripMarkdown } from "./calendario/formato";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { conversarIA, leerResumenChat, resumirChat, buildChatSystemPrompt, getChatTools, adnParaElChat, herramientaGuardarEnCerebro, INSTRUCCION_GUARDAR_CEREBRO } from "../api";
import GuardarEnCerebro from "./GuardarEnCerebro";
import PlanDePiezas from "./PlanDePiezas";
import { HERRAMIENTAS_DISENO } from "../lib/herramientasDiseno";
import "./ChatPanel.css";
import { guardarNota, avisarTextoDeIA } from "../lib/cerebro";
import { crearDictado, unirDictado } from "../lib/dictado";
import { ATAJOS_DIRECTOR } from "../lib/director";
import ConversacionesChat from "./ConversacionesChat";
import { tituloProvisional, TITULO_NUEVA } from "../lib/conversaciones";
import {
  listarConversaciones, crearConversacion, renombrarConversacion, borrarConversacion, leerMensajes, guardarMensaje,
  titularConversacion, leerUltima, guardarUltima,
} from "../lib/conversacionesApi";
import { uid, compressImage } from "../utils";
import { leerHora, MAL, aplicarLote } from "../lib/lote";
import { partirMensaje, marcarImagen, marcarVideo, marcarContexto, FORMATOS_IMAGEN, INSTRUCCION_PIEZAS, INSTRUCCION_ADJUNTOS } from "../lib/mensajeChat";
import { imagenParaModelo, fotogramasDeVideo, descargarEnTamano } from "../lib/medios";
import * as db from "../lib/db";
import { useConfigIA } from "../hooks/useConfigIA";
import { etiquetaIA, NIVELES_IA } from "../lib/configIA";

const NIVEL_DE_ESFUERZO = { low: "bajo", medium: "medio", high: "alto", max: "maximo" };
import { tareaDesdeIA, fechaEnZona, PROPIEDADES_FECHA_TAREA } from "../lib/agenda";
import { ponerEnDia } from "../lib/subir";
import { conMedios, mediosDe } from "../lib/publicacion";
import { conPromptListo } from "../lib/promptImagen";
import { enlaceLimpio, nuevaIdea } from "../lib/bancoIdeas";
import { anadirAlBanco } from "../lib/bancoIdeasApi";
import { mesDeFecha, mismoMes } from "../lib/meses";

const MAX_ADJUNTOS = 6;
const CLAVE_AMPLIADO = "chat-ampliado";
/** Hasta dónde crece la caja de escribir, en parte del alto de la pantalla; luego desplaza por dentro. */
const ALTO_MAX_CAJA = 0.4;
// Vueltas del navegador con herramientas propias. Las del servidor
// (web, cerebro, consultas) no cuentan: las encadena el Worker. Tampoco las
// de DISEÑO (crear, corregir, mirar): doce piezas eran doce vueltas y el
// asistente se cortaba a la mitad con «Me quedé sin vueltas». Esas tienen
// su propio techo, mucho más alto.
const MAX_VUELTAS = 10;
const MAX_VUELTAS_TOTAL = 40;
const HERRAMIENTAS_DE_DISENO = new Set(["disenar_piezas", "corregir_pieza", "version_final", "ver_lo_que_funciona", "guardar_regla", "generar_imagen", "crear_publicacion"]);
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
  onCrearEnOtroMes = null,
  onClose,
  onSelectClient,
  defaultMode,
  acoplado = false,
  // Dentro de la pestaña Estudio («Con el director»): en la página, sin ser un diálogo, y sólo sus conversaciones de diseño.
  incrustado = false,
  tema: temaFijo = "",
  atajos: atajosFijos = null,
}) {
  // El «Modo director» del asistente flotante: las conversaciones nuevas son de diseño (las mismas que la pestaña
  // Diseño) y salen los encargos del director. La pestaña Diseño lo trae fijo (`tema`). Abrir una conversación de
  // diseño lo enciende; una de las otras, lo apaga.
  const [modoDirector, setModoDirector] = useState(false);
  const temaVisible = temaFijo || (modoDirector ? "diseno" : "");
  const atajos = atajosFijos ?? (temaVisible === "diseno" ? ATAJOS_DIRECTOR : null);
  // La lista: en la pestaña Diseño sólo las suyas; en el asistente, todas o sólo las de diseño.
  const [filtroLista, setFiltroLista] = useState("todas");
  const tema = temaFijo;
  const [chatMode, setChatMode] = useState(defaultMode || (client ? "client" : "global"));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // Las conversaciones por tema (de todo el equipo) y la que está abierta. Sin abierta, el primer mensaje empieza una.
  const [conversaciones, setConversaciones] = useState([]);
  const [conversacionId, setConversacionId] = useState(null);
  const [verLista, setVerLista] = useState(false);
  const [error, setError] = useState("");
  const [memories, setMemories] = useState([]);
  const [showMemories, setShowMemories] = useState(false);
  const [actionFeedback, setActionFeedback] = useState([]);
  // Lo que el asistente propone guardar en el cerebro, a la espera de que la persona decida.
  const [propuestaCerebro, setPropuestaCerebro] = useState(null);
  // El plan de una tanda del director (disenar_piezas), a la espera del botón y luego con cada pieza según sale.
  const [planDiseno, setPlanDiseno] = useState(null);
  const [listening, setListening] = useState(false);
  // Lo que se está diciendo y aún no se cierra: se ve en gris debajo de la caja y entra si se envía así.
  const [provisional, setProvisional] = useState("");
  // Pantalla completa: se recuerda por navegador.
  const [ampliado, setAmpliado] = useState(() => {
    try { return localStorage.getItem(CLAVE_AMPLIADO) === "1"; } catch { return false; }
  });
  const [adjuntos, setAdjuntos] = useState([]);
  const [bancoAbierto, setBancoAbierto] = useState(false);
  const [progreso, setProgreso] = useState("");
  // Lo que llega en streaming mientras el asistente escribe.
  const [enVivo, setEnVivo] = useState({ texto: "", pensando: "", pasos: [] });
  const [resumen, setResumen] = useState({ resumen: "", hasta: null });
  // Qué modelo respondió de verdad la última vez: si el elegido falló y
  // contestó el de respaldo, la etiqueta lo dice.
  const configIA = useConfigIA();
  const [modeloVivo, setModeloVivo] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  // Ampliado tapa toda la pantalla: es un diálogo aunque esté acoplado, y Escape primero lo REDUCE.
  const dialogRef = useDialogA11y(ampliado ? () => setAmpliado(false) : onClose, { activo: (!acoplado && !incrustado) || ampliado });
  const inputId = useId();
  const clientId = client?.dbId || client?.id;
  const raizDrive = idDeCarpeta(client?.driveFolder);
  const calRef = useRef(calendar);
  calRef.current = calendar;

  // De quién son las conversaciones que se ven: del cliente, o del asistente general (null).
  const ambito = chatMode === "client" && clientId ? clientId : null;
  const conversacionRef = useRef(null);
  conversacionRef.current = conversacionId;
  const loadingRef = useRef(false);
  loadingRef.current = loading;
  // La conversación que se acaba de empezar al enviar: sus mensajes ya están en pantalla, no se releen.
  const sinRecargar = useRef(null);

  const switchMode = useCallback((newMode) => {
    if (newMode === chatMode) return;
    if (newMode === "global") { setMemories([]); setShowMemories(false); }
    setChatMode(newMode);
    setActionFeedback([]);
    setError("");
  }, [chatMode]);

  // La lista de conversaciones del cliente (o del general) y las memorias de antes; se abre la que esta persona tuvo
  // abierta la última vez, o la más reciente.
  useEffect(() => {
    let vivo = true;
    setLoadingHistory(true);
    setMessages([]);
    setResumen({ resumen: "", hasta: null });
    (async () => {
      try {
        const [lista, mems] = await Promise.all([
          listarConversaciones(ambito),
          ambito ? db.loadClientMemories(ambito) : Promise.resolve([]),
        ]);
        if (!vivo) return;
        // En el Estudio, sólo las de diseño (en el chat de siempre salen todas, con su etiqueta).
        const deAqui = tema ? lista.filter((c) => c.tema === tema) : lista;
        setConversaciones(deAqui);
        setMemories(mems);
        const recordada = leerUltima(ambito, tema);
        const abierta = deAqui.find((c) => c.id === recordada) ?? deAqui[0] ?? null;
        setConversacionId(abierta?.id ?? null);
        if (!abierta) setLoadingHistory(false);
      } catch {
        if (!vivo) return;
        // Un colaborador no tiene conversaciones del asistente general: el chat funciona igual, sin guardar.
        setConversaciones([]);
        setConversacionId(null);
        setLoadingHistory(false);
      }
    })();
    return () => { vivo = false; };
  }, [ambito, tema]);

  // Los mensajes y el resumen de la conversación abierta: el asistente sólo recuerda ESA.
  useEffect(() => {
    if (!conversacionId) return;
    guardarUltima(ambito, conversacionId, tema);
    if (sinRecargar.current === conversacionId) { sinRecargar.current = null; return; }
    let vivo = true;
    setLoadingHistory(true);
    Promise.all([leerMensajes(conversacionId), leerResumenChat(conversacionId)])
      .then(([m, r]) => { if (vivo) { setMessages(m); setResumen(r); } })
      .catch(() => { if (vivo) setError("No se pudo cargar la conversación."); })
      .finally(() => { if (vivo) setLoadingHistory(false); });
    return () => { vivo = false; };
    // `ambito` no: cambiarlo ya relee la lista y escoge conversación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacionId]);

  // Alguien del equipo empezó, renombró o borró una conversación de aquí, o escribió en la que está abierta.
  useEffect(() => {
    const alCambio = (e) => {
      const ev = e.detail ?? {};
      if ((ev.clientId ?? null) !== ambito) return;
      listarConversaciones(ambito).then((l) => setConversaciones(tema ? l.filter((c) => c.tema === tema) : l)).catch(() => {});
      if (ev.conversacionId !== conversacionRef.current) return;
      if (ev.borrada) { setConversacionId(null); setMessages([]); setResumen({ resumen: "", hasta: null }); }
      else if (ev.mensaje && !loadingRef.current) leerMensajes(ev.conversacionId).then(setMessages).catch(() => {});
    };
    window.addEventListener("chat:conversaciones", alCambio);
    return () => window.removeEventListener("chat:conversaciones", alCambio);
  }, [ambito, tema]);

  // «Pedir un cambio» de una imagen del chat: la caja queda señalándola, para escribir qué cambiar.
  useEffect(() => {
    const alPedir = (e) => {
      const clave = e.detail?.clave;
      if (!clave) return;
      setInput((t) => `${t.trim() ? `${t.trim()}\n` : ""}En la imagen ${clave}: `);
      inputRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("chat:cambio-imagen", alPedir);
    return () => window.removeEventListener("chat:cambio-imagen", alPedir);
  }, []);

  const nuevaConversacion = useCallback(() => {
    if (loading) return;
    setConversacionId(null);
    setMessages([]);
    setResumen({ resumen: "", hasta: null });
    setActionFeedback([]);
    setError("");
    setVerLista(false);
    guardarUltima(ambito, "", tema);
    inputRef.current?.focus({ preventScroll: true });
  }, [loading, ambito, tema]);

  const abrirConversacion = useCallback((id) => {
    if (loading) return;
    setActionFeedback([]);
    setError("");
    setVerLista(false);
    if (!temaFijo) setModoDirector(conversaciones.find((c) => c.id === id)?.tema === "diseno");
    if (id !== conversacionId) setConversacionId(id);
  }, [loading, conversacionId, conversaciones, temaFijo]);

  const renombrar = useCallback(async (id, titulo) => {
    const c = await renombrarConversacion(id, titulo);
    setConversaciones((p) => p.map((x) => (x.id === id ? { ...x, titulo: c?.titulo ?? titulo } : x)));
  }, []);

  const borrarUna = useCallback(async (id) => {
    await borrarConversacion(id);
    setConversaciones((p) => p.filter((x) => x.id !== id));
    if (id === conversacionId) nuevaConversacion();
  }, [conversacionId, nuevaConversacion]);

  useEffect(() => {
    // Sólo baja la LISTA de mensajes: scrollIntoView movía también la página (en la pestaña Diseño el chat subía y la
    // caja de escribir quedaba fuera de su sitio hasta cambiar de pestaña).
    const lista = messagesEndRef.current?.parentElement;
    if (lista) lista.scrollTo({ top: lista.scrollHeight, behavior: "smooth" });
  }, [messages, loading, actionFeedback]);

  useEffect(() => {
    if (!loadingHistory) inputRef.current?.focus({ preventScroll: true });
  }, [loadingHistory]);

  useEffect(() => {
    try { localStorage.setItem(CLAVE_AMPLIADO, ampliado ? "1" : "0"); } catch { /* sin almacenamiento: no se recuerda */ }
  }, [ampliado]);

  // La caja crece con lo escrito o lo dictado (también cuando el texto llega del micrófono, no sólo al teclear), hasta
  // ALTO_MAX_CAJA de la pantalla; al enviar vuelve a su tamaño.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * ALTO_MAX_CAJA))}px`;
  }, [input, ampliado]);

  useEffect(() => () => recognitionRef.current?.cortar(), []);

  // El dictado sigue hasta que se vuelve a pulsar (src/lib/dictado.js): se reenciende si el navegador lo corta.
  const toggleVoice = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Tu navegador no soporta dictado por voz.");
      return;
    }
    if (recognitionRef.current?.escuchando) {
      recognitionRef.current.parar();
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
    setError("");
    const dictado = crearDictado({
      SR,
      alFinal: (texto) => setInput((prev) => unirDictado(prev, texto)),
      alProvisional: setProvisional,
      alEstado: setListening,
      alError: setError,
    });
    recognitionRef.current = dictado;
    dictado.empezar();
  }, []);

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

  // Del selector llega la misma forma venga de Drive o del banco de
  // antes (ver BancoSelector): `fileId` para Drive, `clave` para R2.
  const desdeBanco = useCallback((items) => {
    setBancoAbierto(false);
    agregarAdjuntos(items.map((item) => ({
      id: uid(),
      tipo: item.tipo,
      nombre: item.nombre,
      origen: item.fuente,
      clave: item.clave ?? null,
      fileId: item.fileId ?? null,
      preview: item.url,
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
        imagenes.map((a) => `· ${a.nombre}${a.origen === "drive" ? " (de Google Drive)" : a.origen === "banco" ? " (del banco)" : ""}`).join("\n"),
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

      // El video tiene que estar guardado para que Gemini lo vea: si el
      // cliente tiene Drive, va a su carpeta; si no, al banco de antes.
      let { clave, fileId } = a;
      if (!clave && !fileId) {
        if (raizDrive) {
          setProgreso(`Guardando «${a.nombre}» en el Drive del cliente…`);
          fileId = (await db.subirADrive(clientId, a.file)).id;
        } else {
          setProgreso(`Guardando «${a.nombre}» en el banco…`);
          clave = (await db.uploadContentBankItem(clientId, a.file)).file_path;
        }
      }
      setProgreso(`Viendo y escuchando «${a.nombre}»… (puede tardar un minuto)`);
      const [analisis, fotos] = await Promise.allSettled([
        fileId ? db.analizarVideoDrive(clientId, fileId) : db.analizarVideo(clave),
        fotogramasDeVideo(fileId ? db.urlArchivoDrive(clientId, fileId) : db.getContentBankUrl(clave), FOTOGRAMAS),
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
  }, [clientId, raizDrive]);

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
· Puedes guardar ideas y REFERENCIAS (el enlace de un video de Instagram, TikTok, YouTube…) en el banco de ideas con
  agregar_banco_ideas: con «cliente» van a esa empresa; sin él quedan GENERALES (salen en el banco de todos).
· Puedes navegar al chat de un cliente específico con ir_a_cliente.
· CADA CLIENTE TIENE SU CEREBRO en la aplicación (sus notas: marca, productos, precios, personas, reglas,
  decisiones). Para cualquier dato de un cliente usa buscar_cerebro con su nombre en «cliente»; para varios
  clientes, una búsqueda por cada uno. Abajo sólo va la lista: lo demás se busca.

CLIENTES DE LA AGENCIA (${clients.length}):
${clientBlocks || "(Sin clientes aún)"}

${INSTRUCCION_PIEZAS}

${INSTRUCCION_ADJUNTOS}

CÓMO DEBES RESPONDER:
· En español de Panamá, con tildes y signos de apertura (¿, ¡).
· Conciso y directo.
· Cuando hables de un cliente, referéncialo por nombre.
· Puedes comparar clientes, sugerir estrategias cruzadas y dar ideas de campañas.
· No inventes datos: si no están abajo, búscalos en el cerebro del cliente o con tus herramientas; si no
  están, dilo. Nunca digas que no tienes acceso a un cliente sin haber buscado antes.
${INSTRUCCION_GUARDAR_CEREBRO}`;
  }, [clients]);

  const getGlobalTools = useCallback(() => [
    herramientaGuardarEnCerebro({ conCliente: true }),
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
      description: "Guarda una idea o una referencia (enlace de un video) en el banco de ideas de la agencia. Sin cliente, queda general.",
      input_schema: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nombre del cliente. Vacío: general (sale en el banco de todos)." },
          idea: { type: "string", description: "Concepto de la publicación, o qué tiene de bueno la referencia." },
          enlace: { type: "string", description: "El enlace de la referencia (https://…), si lo hay." },
          formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"] },
          descripcion: { type: "string", description: "Caption sugerida (opcional)." },
          guion: { type: "string", description: "Guion sugerido (opcional)." },
        },
      },
    },
  ], []);

  /**
   * La herramienta guardar_en_cerebro: enseña la propuesta y ESPERA a que la persona la guarde (corregida o no) o la
   * descarte. El turno del asistente sigue con lo que se decidió.
   */
  /**
   * agregar_banco_ideas: al banco de ideas ÚNICO de la agencia (/api/banco-ideas), con su empresa o general (`destino`
   * null). Una idea o una referencia (el enlace de un video); el enlace se limpia igual que en «Guardar referencia».
   */
  const guardarEnBanco = useCallback(async (entrada, destino) => {
    const enlace = enlaceLimpio(entrada.enlace);
    if (String(entrada.enlace ?? "").trim() && !enlace) return { ok: false, mensaje: "El enlace no es válido: tiene que empezar por https://." };
    const idea = nuevaIdea({ id: uid(), idea: entrada.idea ?? "", format: entrada.formato, referenceLink: enlace, descripcion: entrada.descripcion ?? "", guion: entrada.guion ?? "" });
    if (!idea.idea && !idea.referenceLink) return { ok: false, mensaje: "Falta la idea o el enlace." };
    await anadirAlBanco(idea, destino ? destino.dbId || destino.id : null);
    const que = idea.referenceLink ? "Referencia" : "Idea";
    return { ok: true, mensaje: destino ? `${que} guardada en el banco de ${destino.name}.` : `${que} guardada como general: sale en el banco de todos los clientes.` };
  }, []);

  const pedirGuardarEnCerebro = useCallback((destino, entrada) => new Promise((resolve) => {
    setPropuestaCerebro({
      cliente: destino.name, entrada,
      guardar: async (nota) => {
        await guardarNota(destino.dbId || destino.id, nota);
        setPropuestaCerebro(null);
        resolve({ ok: true, mensaje: `Guardado en el cerebro de ${destino.name}: «${nota.titulo}» (${nota.tipo === "pautas" ? "pautas para escribir" : nota.tipo}).` });
      },
      descartar: () => {
        setPropuestaCerebro(null);
        resolve({ ok: false, mensaje: "La persona decidió no guardarlo en el cerebro. No insistas." });
      },
    });
  }), []);

  /**
   * «Recordar esto» de una respuesta: la misma tarjeta que la herramienta guardar_en_cerebro, con la respuesta como
   * texto para que la persona se quede sólo con lo que importa. Lo que se guarda vale en TODAS las conversaciones.
   */
  const recordarEnCerebro = useCallback((msg) => {
    if (!client) return;
    const texto = partirMensaje(msg.content)
      .filter((b) => b.tipo === "texto" || b.tipo === "pieza")
      .map((b) => (b.tipo === "pieza" && b.titulo ? `${b.titulo}:\n${b.texto}` : b.texto))
      .join("\n\n").trim();
    setPropuestaCerebro({
      cliente: client.name,
      entrada: { tipo: "nota", titulo: "", texto },
      guardar: async (nota) => {
        await guardarNota(clientId, nota);
        setPropuestaCerebro(null);
        setActionFeedback([{ tool: "guardar_en_cerebro", ok: true, mensaje: `Guardado en el cerebro: «${nota.titulo}»` }]);
      },
      descartar: () => setPropuestaCerebro(null),
    });
  }, [client, clientId]);

  // ---------- El asistente como director creativo (lib/disenoChat.js, lazy) ----------

  /** Pone `archivo` en la publicación `postId` (con su ficha como pedido listo) o, con `antes`, lo cambia por esa imagen donde esté. */
  const ponerEnElCalendario = useCallback(({ archivo, postId = "", ficha = "", antes = "" }) => {
    const cal = calRef.current;
    if (!cal || !calId || !onUpdateCal || !archivo) return false;
    let puesto = false;
    const medio = { src: archivo.src, tipo: "imagen", nombre: (archivo.prompt || "pieza").slice(0, 40), ...(archivo.ancho ? { ancho: archivo.ancho, alto: archivo.alto } : {}) };
    const days = cal.days.map((d) => ({
      ...d,
      posts: (d.posts || []).map((p) => {
        if (antes && mediosDe(p).some((m) => m.src === antes)) {
          puesto = true;
          return conMedios(p, mediosDe(p).map((m) => (m.src === antes ? { ...m, ...medio, nombre: m.nombre || medio.nombre } : m)));
        }
        if (postId && p.id === postId) {
          puesto = true;
          const con = conMedios(p, [...mediosDe(p), medio]);
          return ficha ? conPromptListo(con, ficha) : con;
        }
        return p;
      }),
    }));
    if (!puesto) return false;
    const updated = { ...cal, days };
    calRef.current = updated;
    onUpdateCal(calId, updated);
    return true;
  }, [calId, onUpdateCal]);

  /** disenar_piezas: el plan a la vista, ESPERA el botón, crea de tres en tres y devuelve las imágenes al modelo. */
  const disenarPiezas = useCallback(async (entrada) => {
    if (!client) return { ok: false, mensaje: "Abre el asistente dentro de un cliente para diseñar." };
    // Un carrusel es 4:5 en todas sus láminas, diga lo que diga cada una.
    const piezas = (Array.isArray(entrada.piezas) ? entrada.piezas : []).slice(0, 12).map((p) => (entrada.carrusel === true ? { ...p, formato: "vertical" } : p));
    if (!piezas.length) return { ok: false, mensaje: "No mandaste ninguna pieza." };
    setProgreso("Preparando el plan con el kit de la marca…");
    const mod = await import("../lib/disenoChat");
    const ctx = await mod.leerContexto(client);
    setProgreso("");
    const borrador = mod.planDePiezas(ctx, piezas, { calidad: "borrador" });
    const conModelo = borrador.find((p) => p.modelo);
    if (!conModelo) return { ok: false, mensaje: borrador[0]?.error || "No hay ningún modelo de imagen con llave." };
    const fin = mod.modeloFinal(ctx.activos);
    const finalPlan = fin && fin.id !== conModelo.modelo.id ? mod.planDePiezas(ctx, piezas, { calidad: "final" }).find((p) => p.modelo) : null;
    const calidades = {
      borrador: { nombre: conModelo.modelo.nombre, costo: conModelo.costo },
      ...(finalPlan ? { final: { nombre: finalPlan.modelo.nombre, costo: finalPlan.costo } } : {}),
    };
    return new Promise((resolve) => {
      setPlanDiseno({
        concepto: String(entrada.concepto ?? "").slice(0, 400),
        piezas: borrador.map((p) => ({ n: p.n, titulo: p.titulo, ficha: p.ficha })),
        calidades, estado: "revisar", avance: {},
        cancelar: () => {
          setPlanDiseno(null);
          resolve({ ok: false, mensaje: "La persona no creó el plan: quiere cambiar algo. Pregúntale qué, en una línea, y vuelve a proponerlo." });
        },
        crear: async (editadas, calidad) => {
          // Las fichas corregidas en la tarjeta mandan; las quitadas no van.
          const entradaFinal = editadas.map((e) => ({ ...piezas[e.n - 1], titulo: e.titulo, ficha: e.ficha }));
          const plan = mod.planDePiezas(ctx, entradaFinal, { calidad });
          setPlanDiseno((pl) => pl && { ...pl, piezas: plan.map((p) => ({ n: p.n, titulo: p.titulo, ficha: p.ficha })), estado: "creando", avance: {} });
          const cal = calRef.current;
          const resultados = await mod.crearPlan(ctx, plan, {
            calendarId: cal ? cal.dbId || calId : null,
            carrusel: entrada.carrusel === true ? String(entrada.concepto || plan[0]?.titulo || "Carrusel") : "",
            alAvanzar: (n, est) => setPlanDiseno((pl) => pl && { ...pl, avance: { ...pl.avance, [n]: est } }),
          });
          setPlanDiseno((pl) => pl && { ...pl, estado: "hecho" });
          const lineas = [];
          const imagenes = [];
          const paraElModelo = [];
          for (const r of resultados) {
            const p = plan[r.n - 1];
            if (!r.archivo) { lineas.push(`${r.n}. «${p.titulo}»: NO salió (${r.error}).`); continue; }
            const enPost = p.postId ? ponerEnElCalendario({ archivo: r.archivo, postId: p.postId, ficha: p.ficha }) : false;
            if (enPost) void mod.apuntarUso?.(ctx.clienteId, r.archivo.id, { calendarId: cal?.dbId || calId, postId: p.postId });
            lineas.push(`${r.n}. «${p.titulo}» → archivo_id ${r.archivo.id}${p.postId ? (enPost ? ` (puesta en la publicación ${p.postId})` : ` (no encontré la publicación ${p.postId} en el mes abierto)`) : ""}.`);
            imagenes.push({ clave: r.archivo.clave, formato: mod.formatoDe(r.archivo), id: r.archivo.id });
            const [bloque] = await mod.paraElModelo([r.archivo]);
            if (bloque) paraElModelo.push({ type: "text", text: `Pieza ${r.n} «${p.titulo}» (archivo_id ${r.archivo.id}):` }, bloque);
          }
          const hechas = imagenes.length;
          resolve({
            ok: hechas > 0,
            mensaje: `${hechas} de ${plan.length} creadas con ${plan.find((p) => p.modelo)?.modelo.nombre ?? "el modelo del cliente"}. Están en la galería y la persona ya las ve.\n${lineas.join("\n")}\nAhora MÍRALAS (van abajo): si alguna tiene una falta, un texto ilegible o se sale del sistema, corrígela antes de darla por buena.`,
            _imagenes: imagenes, _paraModelo: paraElModelo,
          });
        },
      });
    });
  }, [client, calId, ponerEnElCalendario]);

  /** corregir_pieza y version_final: la nueva ocupa el sitio de la anterior (en el chat y en la publicación). */
  const rehacerPieza = useCallback(async (como, entrada) => {
    if (!client) return { ok: false, mensaje: "Abre el asistente dentro de un cliente." };
    const mod = await import("../lib/disenoChat");
    const ctx = await mod.leerContexto(client);
    setProgreso(como === "final" ? "Haciendo la versión final con el mejor modelo…" : "Corrigiendo la pieza…");
    try {
      const r = como === "final"
        ? await mod.versionFinal(ctx, { archivoId: String(entrada.archivo_id ?? "") })
        : await mod.corregirPieza(ctx, { archivoId: String(entrada.archivo_id ?? ""), indicacion: String(entrada.indicacion ?? ""), igualA: String(entrada.igual_a ?? "") });
      const enPost = ponerEnElCalendario({ archivo: r.archivo, antes: r.antes?.src ?? "" });
      const [bloque] = await mod.paraElModelo([r.archivo]);
      return {
        ok: true,
        mensaje: `${como === "final" ? `Versión final con ${r.modelo?.nombre}` : "Corregida"}: archivo_id ${r.archivo.id} (sustituye a ${r.antes?.id})${enPost ? "; también en su publicación" : ""}. Mírala abajo.`,
        _imagenes: [{ clave: r.archivo.clave, formato: mod.formatoDe(r.archivo), id: r.archivo.id, reemplaza: r.antes?.id }],
        _paraModelo: bloque ? [bloque] : [],
      };
    } finally {
      setProgreso("");
    }
  }, [client, ponerEnElCalendario]);

  /** ver_lo_que_funciona: las plantillas y los «Me gusta» del cliente, como imágenes. */
  const verLoQueFunciona = useCallback(async () => {
    if (!client) return { ok: false, mensaje: "Abre el asistente dentro de un cliente." };
    const mod = await import("../lib/disenoChat");
    const ctx = await mod.leerContexto(client);
    const { texto, archivos } = mod.loQueFunciona(ctx);
    return { ok: true, mensaje: texto, _paraModelo: await mod.paraElModelo(archivos) };
  }, [client]);

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
        const target = toolInput.cliente ? resolveClient(toolInput.cliente) : null;
        if (toolInput.cliente && !target) return { ok: false, mensaje: `No encontré el cliente «${toolInput.cliente}».` };
        return guardarEnBanco(toolInput, target);
      }
      if (toolName === "guardar_en_cerebro") {
        const target = resolveClient(toolInput.cliente);
        if (!target) return { ok: false, mensaje: `No encontré el cliente «${toolInput.cliente}».` };
        return pedirGuardarEnCerebro(target, toolInput);
      }
      return { ok: false, mensaje: `Herramienta desconocida: ${toolName}` };
    }

    if (toolName === "guardar_en_cerebro") {
      if (!client) return { ok: false, mensaje: "No hay cliente abierto." };
      return pedirGuardarEnCerebro(client, toolInput);
    }

    if (toolName === "disenar_piezas") return disenarPiezas(toolInput);
    if (toolName === "corregir_pieza") return rehacerPieza("corregir", toolInput);
    if (toolName === "version_final") return rehacerPieza("final", toolInput);
    if (toolName === "ver_lo_que_funciona") return verLoQueFunciona();
    if (toolName === "guardar_regla") {
      if (!clientId) return { ok: false, mensaje: "Abre el asistente dentro de un cliente." };
      const { guardarRegla } = await import("../lib/estudio");
      const regla = String(toolInput.regla ?? "").trim();
      if (!regla) return { ok: false, mensaje: "Falta la regla." };
      await guardarRegla(clientId, regla);
      return { ok: true, mensaje: `Regla guardada en el kit de ${client.name}: «${regla}». Va en todas las piezas siguientes.` };
    }

    if (toolName === "borrar_memoria") {
      // Por id; el texto exacto se acepta todavía por si el modelo lo manda así.
      const found = memories.find((m) => m.id === toolInput.id) ?? memories.find((m) => m.content === (toolInput.contenido ?? toolInput.id));
      if (!found) return { ok: false, mensaje: "No encontré esa memoria: usa el id que va entre corchetes." };
      await db.deleteClientMemory(found.id);
      setMemories((prev) => prev.filter((m) => m.id !== found.id));
      return { ok: true, mensaje: `Olvidado: «${found.content}»` };
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
      return guardarEnBanco(toolInput, toolInput.general === true ? null : client);
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
      const video = toolInput.tipo === "video";
      // Con un cliente, por el ESTUDIO: su kit de marca, su logo, las fotos del producto y su modelo fijado. Sin
      // cliente (el asistente general) no hay marca que poner: el camino de siempre, y sólo imagen.
      if (client) {
        setProgreso(video ? "Preparando el video con el kit de la marca…" : `Preparando la imagen con el kit de la marca (${FORMATOS_IMAGEN[formato].label})…`);
        try {
          const { crearPiezaParaElChat, fraseDeConfirmar, apuntarUso } = await import("../lib/piezaChat");
          const r = await crearPiezaParaElChat({
            cliente: client, idea: toolInput.prompt, tipo: video ? "video" : "imagen", formato,
            estilo: toolInput.estilo || "", confirmado: toolInput.confirmado === true, alProgresar: setProgreso,
          });
          if (r.confirmar) return { ok: false, mensaje: fraseDeConfirmar(r, video) };
          // La imagen vuelve al modelo para que la mire (antes sólo recibía «Imagen creada»).
          const vista = video ? [] : await import("../lib/disenoChat").then((m) => m.paraElModelo([r.archivo])).catch(() => []);
          const entregada = { ok: true, ...(video ? { _video: { clave: r.archivo.clave } } : { _imagen: { clave: r.archivo.clave, formato, id: r.archivo.id }, _paraModelo: vista }) };
          const dicho = `${video ? "Video" : "Imagen"} creada en el Estudio con el kit de ${client.name} (${r.modelo.nombre}, archivo_id ${r.archivo.id}) y mostrada en el chat; también queda en su galería.`;
          if (!toolInput.post_id) return { ...entregada, mensaje: dicho };
          if (!post || !calId || !onUpdateCal) return { ...entregada, mensaje: `${dicho} No encontré la publicación ${toolInput.post_id} para ponerla.` };
          const medio = { src: r.archivo.src, tipo: video ? "video" : "imagen", nombre: r.archivo.prompt?.slice(0, 40) || (video ? "video" : "imagen") };
          const updated = {
            ...cal,
            days: cal.days.map((d) => ({
              ...d,
              posts: (d.posts || []).map((p) => (p.id === toolInput.post_id ? conMedios(p, [...mediosDe(p), medio]) : p)),
            })),
          };
          calRef.current = updated;
          onUpdateCal(calId, updated);
          // Que la papelera del Estudio sepa que una publicación la usa.
          void apuntarUso(client.dbId || client.id, r.archivo.id, { calendarId: cal.dbId || calId, postId: toolInput.post_id }).catch(() => null);
          return { ...entregada, mensaje: `${dicho} Puesta en la publicación ${toolInput.post_id}.` };
        } catch (err) {
          return { ok: false, mensaje: err?.message || "El Estudio no pudo crearla." };
        } finally {
          setProgreso("");
        }
      }
      if (video) return { ok: false, mensaje: "Un video se crea en el Estudio de un cliente: abre el asistente dentro de ese cliente." };
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
      // Calendario siempre activo: un día sin publicaciones no está en `days`
      // y un mes sin ninguna es virtual. Ninguno de los dos es «no existe»:
      // el día se crea aquí (`ponerEnDia`) y el mes, al guardar (App.jsx).
      const destino = mesDeFecha(toolInput.fecha);
      if (!destino || !/^\d{4}-\d{2}-\d{2}$/.test(String(toolInput.fecha))) {
        return { ok: false, mensaje: `La fecha «${toolInput.fecha}» no es válida: escríbela como AAAA-MM-DD.` };
      }
      const otroMes = Number.isInteger(cal.month) && cal.year && !mismoMes(destino, { year: cal.year, month: cal.month });
      if (otroMes && !onCrearEnOtroMes) {
        return { ok: false, mensaje: `El ${toolInput.fecha} es de otro mes. Este chat escribe en ${String(cal.month + 1).padStart(2, "0")}/${cal.year}: pide a la persona que abra ese mes en el calendario.` };
      }
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
      if (otroMes) {
        // Otro mes: se escribe en SU cajón (creado si hacía falta), no en el que se mira.
        try {
          await onCrearEnOtroMes(toolInput.fecha, newPost);
        } catch (e) {
          return { ok: false, mensaje: `No pude crearla en ese mes: ${e?.message || "error"}.` };
        }
        return { ok: true, mensaje: `Publicación creada: ${newPost.format} el ${toolInput.fecha} (en el calendario de ese mes, no en el que está abierto; post_id ${newPost.id}, pero para ponerle una pieza hay que abrir ese mes).` };
      }
      const updated = ponerEnDia(cal, toolInput.fecha, newPost);
      calRef.current = updated;
      onUpdateCal(calId, updated);
      return { ok: true, mensaje: `Publicación creada: ${newPost.format} el ${toolInput.fecha} (post_id ${newPost.id}).` };
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
          if (toolInput.texto_pieza !== undefined) upd.textoPieza = toolInput.texto_pieza;
          if (toolInput.categoria !== undefined) upd.category = toolInput.categoria;
          if (toolInput.formato !== undefined) upd.format = toolInput.formato;
          if (hora !== undefined) upd.publishTime = hora;
          return upd;
        }),
      }));
      if (!found) return { ok: false, mensaje: `No encontré la publicación ${toolInput.post_id}.` };
      // Lo que reescribe el asistente es texto de la IA, no una corrección de la persona: se avisa ANTES del guardado.
      if (["idea", "descripcion", "guion", "texto_pieza"].some((k) => toolInput[k] !== undefined)) await avisarTextoDeIA(clientId, [toolInput.post_id]);
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
      const conTexto = (toolInput.cambios ?? []).filter((c) => c && ["idea", "descripcion", "guion"].some((k) => c[k] !== undefined)).map((c) => c.post_id);
      if (conTexto.length) await avisarTextoDeIA(clientId, conTexto);
      const updated = { ...cal, days: r.dias };
      calRef.current = updated;
      onUpdateCal(calId, updated);
      return { ok: true, mensaje: `${r.count} publicación${r.count === 1 ? "" : "es"} editada${r.count === 1 ? "" : "s"} en lote.` };
    }

    return { ok: false, mensaje: `Herramienta desconocida: ${toolName}` };
  }, [chatMode, client, clientId, calId, onUpdateCal, onCrearEnOtroMes, memories, resolveClient, onSelectClient, pedirGuardarEnCerebro, guardarEnBanco, disenarPiezas, rehacerPieza, verLoQueFunciona]);

  const handleSend = useCallback(async () => {
    // Enviar apaga el micrófono, y lo que se estaba diciendo va en el mensaje.
    const text = (recognitionRef.current?.escuchando ? unirDictado(input, provisional) : input).trim();
    if ((!text && !adjuntos.length) || loading) return;
    recognitionRef.current?.cortar();

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

      // Sin conversación abierta, el primer mensaje empieza una (con las primeras palabras de título hasta que la IA
      // ponga el suyo). Si no se puede —un colaborador en el asistente general—, se conversa igual, sin guardar.
      let convId = conversacionId;
      const primera = messages.length === 0;
      if (!convId) {
        try {
          const nueva = await crearConversacion(ambito, tituloProvisional(text || pedido), temaVisible);
          convId = nueva.id;
          sinRecargar.current = nueva.id;
          setConversaciones((p) => [nueva, ...p.filter((c) => c.id !== nueva.id)]);
          setConversacionId(nueva.id);
        } catch {
          convId = null;
        }
      }
      if (convId) {
        await guardarMensaje(convId, "user", guardado);
        const ahoraIso = new Date().toISOString();
        setConversaciones((p) => p.map((c) => (c.id === convId ? { ...c, updated_at: ahoraIso } : c)));
      }

      // Conversación larga: se pliega lo viejo ANTES de montar el prompt.
      let res = resumen;
      if (convId) {
        const sinResumir = messages.filter((m) => !res.hasta || m.created_at > res.hasta).length;
        if (sinResumir > UMBRAL_RESUMEN) {
          setProgreso("Resumiendo la conversación anterior…");
          const nuevo = await resumirChat(convId).catch(() => null);
          if (nuevo) { res = nuevo; setResumen(nuevo); }
          setProgreso("");
        }
      }

      // Con cerebro, el asistente recibe la ficha y las cifras del cliente y busca el resto con `buscar_cerebro`;
      // sin él, el ADN de la ficha como siempre.
      const adn = chatMode === "client" && client ? await adnParaElChat(client) : null;
      let system = chatMode === "client" && client
        ? buildChatSystemPrompt(client, calRef.current, adn.content, memories, adn.cerebro ? { pasajes: "" } : null, { notasCerebro: adn.notas })
        : buildGlobalSystemPrompt();
      if (res.resumen) {
        system += `\n\nRESUMEN DE LA CONVERSACIÓN ANTERIOR (lo más antiguo, ya plegado; lo reciente va entero en los mensajes):\n${res.resumen}`;
      }

      const tools = chatMode === "client"
        ? [...getChatTools(Boolean(calRef.current)), ...(client ? HERRAMIENTAS_DISENO : [])]
        : getGlobalTools();

      const recientes = [...messages, { role: "user", content: guardado, created_at: userMsg.created_at }]
        .filter((m) => !res.hasta || m.created_at > res.hasta)
        .slice(convId ? 0 : -100)
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
      const videos = [];
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
          ...videos.map((v) => marcarVideo(v.clave)),
          hechas.length ? marcarContexto("Acciones realizadas", hechas.join("\n")) : "",
        ].filter(Boolean).join("\n\n");
        entregado = true;
        if (!contenido) return;
        if (convId) {
          await guardarMensaje(convId, "assistant", contenido);
          // Con el primer intercambio, la IA le pone título (barato); si falla, se queda el provisional.
          if (primera) {
            titularConversacion(convId)
              .then((c) => { if (c) setConversaciones((p) => p.map((x) => (x.id === c.id ? { ...x, titulo: c.titulo } : x))); })
              .catch(() => {});
          }
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: contenido, created_at: new Date().toISOString() },
        ]);
      };

      const onEvento = (ev) => {
        if (ev.t === "texto") setEnVivo((v) => ({ ...v, texto: v.texto + ev.d }));
        else if (ev.t === "pensando") setEnVivo((v) => ({ ...v, pensando: v.pensando + ev.d }));
        else if (ev.t === "modelo") setModeloVivo(ev);
        else if (ev.t === "herramienta" || ev.t === "aviso") {
          pasos.push(ev.texto);
          setEnVivo((v) => ({ ...v, pasos: [...v.pasos, ev.texto] }));
        }
      };

      // Las vueltas de diseño no gastan del tope normal (ver HERRAMIENTAS_DE_DISENO).
      let gastadas = 0;
      for (let vuelta = 0; gastadas < MAX_VUELTAS && vuelta < MAX_VUELTAS_TOTAL; vuelta++) {
        setEnVivo((v) => ({ ...v, pensando: "" }));
        const fin = await conversarIA({
          messages: conversationMessages,
          system,
          tools,
          clienteId: chatMode === "client" ? clientId : null,
          conversacionId: convId,
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

        if (!toolUseBlocks.length || toolUseBlocks.some((b) => !HERRAMIENTAS_DE_DISENO.has(b.name))) gastadas += 1;
        const toolResults = [...(fin.resultadosServidor ?? [])];
        for (const toolBlock of toolUseBlocks) {
          try {
            const result = await executeToolCall(toolBlock.name, toolBlock.input);
            // Una pieza corregida ocupa el sitio de la anterior en el mensaje; las demás, detrás.
            for (const img of [...(result._imagen ? [result._imagen] : []), ...(result._imagenes ?? [])]) {
              const i = img.reemplaza ? imagenes.findIndex((x) => x.id === img.reemplaza) : -1;
              if (i >= 0) imagenes[i] = img; else imagenes.push(img);
            }
            if (result._video) videos.push(result._video);
            feedbacks.push({ tool: toolBlock.name, ok: result.ok, mensaje: result.mensaje });
            const texto = JSON.stringify({ ok: result.ok, mensaje: result.mensaje });
            const vistas = result._paraModelo;
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              // Con imágenes, el modelo las VE: el resultado lleva el texto y las copias pequeñas.
              content: vistas?.length ? [{ type: "text", text: texto }, ...vistas] : texto,
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
      setPlanDiseno(null);
      setProgreso("");
      setEnVivo({ texto: "", pensando: "", pasos: [] });
      for (const a of enviados) if (a.origen === "subida") URL.revokeObjectURL(a.preview);
    }
  }, [input, provisional, loading, messages, client, clientId, chatMode, memories, executeToolCall, adjuntos, prepararAdjuntos, buildGlobalSystemPrompt, getGlobalTools, resumen, conversacionId, ambito, temaVisible]);

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

  const hasSpeechAPI = typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const isGlobal = chatMode === "global";
  const panelLabel = isGlobal ? "Agente de la agencia" : `Chat con asistente de ${client?.name || ""}`;

  return (
    <div
      className={incrustado && !ampliado ? "chat-incrustado" : acoplado && !ampliado ? "chat-acoplado" : undefined}
      style={(acoplado || incrustado) && !ampliado ? undefined : { position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "flex-end" }}
    >
      {/* Acoplado —pantalla ancha— es un panel al lado del contenido, no
          un diálogo: sin fondo oscuro, sin foco atrapado y con el resto
          de la pantalla usable. Ampliado ocupa la pantalla entera y vuelve
          a ser un diálogo. */}
      {!acoplado && !incrustado && !ampliado && (
        <button
          type="button"
          aria-label="Cerrar chat"
          onClick={onClose}
          style={{ flex: 1, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer", backdropFilter: "blur(2px)" }}
        />
      )}
      <div
        ref={dialogRef}
        className={ampliado ? "chat-ampliado" : undefined}
        role={incrustado && !ampliado ? "region" : acoplado && !ampliado ? "complementary" : "dialog"}
        aria-modal={(acoplado || incrustado) && !ampliado ? undefined : "true"}
        aria-label={panelLabel}
        style={{
          width: acoplado || incrustado || ampliado ? "100%" : 420,
          maxWidth: "100vw",
          height: "100%",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border-strong)",
          boxShadow: acoplado || incrustado ? "none" : "var(--elev-2)",
          display: "flex",
          flexDirection: "column",
          animation: acoplado || incrustado ? undefined : "slideIn .24s cubic-bezier(.22,.61,.36,1)",
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
                {isGlobal ? "Agente de la agencia" : temaVisible === "diseno" ? `Director creativo de ${client?.name || ""}` : `Asistente de ${client?.name || ""}`}
              </div>
              <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", display: "flex", alignItems: "center", gap: "var(--sp-1)", flexWrap: "wrap" }}>
                <span>{isGlobal ? "Conoce todos tus clientes" : temaVisible === "diseno" ? "Dile qué quieres con tus palabras: él diseña, revisa y te enseña" : "Conversa, genera ideas y ejecuta acciones"}</span>
                <span
                  className="badge"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)", fontSize: "var(--fs-3xs)" }}
                  title="Modelo y nivel de razonamiento. Se cambian en Ajustes → Inteligencia artificial."
                >
                  {modeloVivo
                    ? `${modeloVivo.etiqueta} · ${NIVELES_IA.find((n) => n.id === NIVEL_DE_ESFUERZO[modeloVivo.esfuerzo])?.nombre ?? ""}`
                    : etiquetaIA(configIA, { para: "chat" })}
                </span>
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
            <button
              type="button"
              className="btn-icon"
              onClick={nuevaConversacion}
              aria-disabled={loading}
              aria-label="Nueva conversación"
              title="Nueva conversación (la de ahora se queda en la lista)"
            >
              <Icon name="plus" size={18} />
            </button>
            <button
              type="button"
              className="btn-icon chat-ampliar"
              onClick={() => setAmpliado((a) => !a)}
              aria-pressed={ampliado}
              aria-label={ampliado ? "Reducir el asistente" : "Ampliar el asistente a pantalla completa"}
              title={ampliado ? "Reducir (Escape)" : "Ampliar a pantalla completa"}
            >
              <Icon name={ampliado ? "collapse" : "expand"} size={18} />
            </button>
            {onClose && (
              <button className="btn-icon" onClick={onClose} aria-label="Cerrar chat">
                <Icon name="close" />
              </button>
            )}
          </div>

          {/* Selector de contexto: Global / Cliente (el director es siempre de su cliente) */}
          {client && tema !== "diseno" && (
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

          {/* «Modo director»: el mismo director de la pestaña Diseño, sin salir de donde se está. */}
          {client && !temaFijo && !isGlobal && (
            <button
              type="button"
              className="filter-chip chat-modo-director"
              aria-pressed={modoDirector}
              disabled={loading}
              onClick={() => {
                setModoDirector((v) => !v);
                // Cambiar de modo empieza en limpio: lo nuevo va a una conversación de ese tipo.
                if (messages.length) nuevaConversacion();
              }}
            >
              <Icon name="wand" size={14} /> Modo director
            </button>
          )}

          {/* La conversación abierta y la lista: una por tema, de todo el equipo. */}
          <button
            type="button"
            className="chat-conv-actual"
            onClick={() => setVerLista((v) => !v)}
            aria-expanded={verLista}
            aria-controls={`${inputId}-conv`}
          >
            <Icon name="message" size={14} />
            <span className="chat-conv-actual-titulo">
              {conversacionId ? (conversaciones.find((c) => c.id === conversacionId)?.titulo || TITULO_NUEVA) : "Nueva conversación"}
            </span>
            <span className="chat-conv-actual-cuantas">{conversaciones.length} {conversaciones.length === 1 ? "conversación" : "conversaciones"}</span>
            <Icon name={verLista ? "chevronUp" : "chevronDown"} size={14} />
          </button>
        </div>

        <div className="chat-cuerpo">
        {verLista && (
          <div id={`${inputId}-conv`} className={ampliado ? "chat-conv-aparte" : "chat-conv-desplegada"}>
            <ConversacionesChat
              conversaciones={!temaFijo && filtroLista === "diseno" ? conversaciones.filter((c) => c.tema === "diseno") : conversaciones}
              filtro={!temaFijo && conversaciones.some((c) => c.tema === "diseno") ? filtroLista : null}
              onFiltro={setFiltroLista}
              actualId={conversacionId}
              onAbrir={abrirConversacion}
              onNueva={nuevaConversacion}
              onRenombrar={renombrar}
              onBorrar={borrarUna}
              lateral={ampliado}
            />
          </div>
        )}
        <div className="chat-columna">

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
              Memorias de antes ({memories.length})
            </div>
            <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", margin: "0 0 var(--sp-1)" }}>
              Lo nuevo ya no se guarda aquí: va al cerebro del cliente. Estas se siguen leyendo hasta que las borres.
            </p>
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
        <div className="chat-mensajes" style={{
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
              : temaVisible === "diseno"
                ? <DisenoEmptyState clientName={client?.name || ""} />
                : <EmptyState clientName={client?.name || ""} hasCalendar={Boolean(calendar)} />
          ) : (
            messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} onRecordar={!isGlobal && client && msg.role === "assistant" && !loading ? () => recordarEnCerebro(msg) : null} />
            ))
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
          {propuestaCerebro && (
            <GuardarEnCerebro
              propuesta={{ cliente: propuestaCerebro.cliente, ...propuestaCerebro.entrada }}
              onGuardar={propuestaCerebro.guardar}
              onDescartar={propuestaCerebro.descartar}
            />
          )}
          {planDiseno && (
            <PlanDePiezas
              plan={planDiseno}
              onCrear={planDiseno.crear}
              onCancelar={planDiseno.cancelar}
            />
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

        {/* Atajos del director: rellenan la caja con un encargo que se completa con lo de cada uno. */}
        {atajos?.length > 0 && !loading && (
          <div className="chat-atajos" role="group" aria-label="Encargos frecuentes">
            {atajos.map((a) => (
              <button key={a.etiqueta} type="button" className="filter-chip" onClick={() => { setInput(a.texto); inputRef.current?.focus({ preventScroll: true }); }}>
                {a.etiqueta}
              </button>
            ))}
          </div>
        )}

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
                  {a.tipo === "video" && (a.origen === "banco" || a.origen === "drive") ? (
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
            driveFolder={client?.driveFolder}
            maximo={MAX_ADJUNTOS - adjuntos.length}
            titulo={raizDrive ? "Adjuntar desde Google Drive" : "Adjuntar del banco de contenido"}
            onSelect={desdeBanco}
            onClose={() => setBancoAbierto(false)}
          />
        )}

        {/* El dictado: que se sepa que sigue escuchando, y lo que se está diciendo antes de que se fije. */}
        {listening && (
          <div className="chat-escuchando" role="status">
            <span className="chat-escuchando-punto" aria-hidden="true" />
            <span><strong>Escuchando…</strong> pulsa el micrófono para parar.</span>
            {provisional && <span className="chat-provisional">{provisional}</span>}
          </div>
        )}

        {/* Entrada */}
        <div className="chat-entrada" style={{
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
              aria-label={raizDrive ? "Adjuntar desde Google Drive" : "Adjuntar del banco de contenido"}
              title={raizDrive ? "Adjuntar desde Google Drive" : "Adjuntar del banco de contenido"}
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
              title={listening ? "Detener dictado" : "Dictar por voz (escucha hasta que lo vuelvas a pulsar)"}
              disabled={loading}
              data-escuchando={listening ? "si" : undefined}
              style={{
                minHeight: "var(--tap)",
                minWidth: "var(--tap)",
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={listening ? "Escuchando…" : (isGlobal ? "Pregunta sobre tus clientes…" : "Escribe tu mensaje…")}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
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

/** Lo que ve quien abre «Diseño» por primera vez: qué pedirle, con palabras sencillas. */
function DisenoEmptyState({ clientName }) {
  return (
    <div style={{ textAlign: "center", color: "var(--text-faint)", padding: "var(--sp-8) var(--sp-4)", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sp-3)" }}>
      <span style={{ color: "var(--accent)", opacity: 0.6 }}>
        <Icon name="palette" size={36} />
      </span>
      <p style={{ fontSize: "var(--fs-xs)", maxWidth: 360 }}>
        Soy el director creativo de <strong style={{ color: "var(--text)" }}>{clientName}</strong>. Dime qué necesitas
        como se lo dirías a un diseñador: te enseño el plan con su costo, creo al pulsar «Crear», reviso cada imagen y
        corrijo lo que salga mal.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)", fontSize: "var(--fs-3xs)", color: "var(--text-dim)", textAlign: "left" }}>
        <span>Prueba con algo como:</span>
        <span style={{ fontStyle: "italic" }}>«Diseña los posts de la semana que viene»</span>
        <span style={{ fontStyle: "italic" }}>«4 anuncios del sofá cama, uno por cada objeción»</span>
        <span style={{ fontStyle: "italic" }}>«Esta quedó oscura: más luz y el precio más grande»</span>
        <span style={{ fontStyle: "italic" }}>«Pasa a final las que me gustaron»</span>
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

function ChatMessage({ message, onRecordar = null }) {
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
        if (b.tipo === "video") return <VideoGenerado key={i} clave={b.clave} />;
        return <Contexto key={i} titulo={b.titulo} texto={b.texto} />;
      })}
      {onRecordar && (
        <button type="button" className="btn btn-ghost btn-sm chat-recordar" onClick={onRecordar}
          title="Guardarlo en el cerebro del cliente: vale en todas las conversaciones y en todo lo que se escriba">
          <Icon name="brain" size={14} /> Recordar esto
        </button>
      )}
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
        {/* «Pedir un cambio»: la caja queda con la imagen señalada; se escribe el cambio y el director la corrige. */}
        <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: "var(--tap-sm)" }}
          onClick={() => window.dispatchEvent(new CustomEvent("chat:cambio-imagen", { detail: { clave } }))}>
          <Icon name="pencil" size={16} /> Pedir un cambio
        </button>
      </figcaption>
      {fallo && <p role="alert" style={{ margin: 0, padding: "0 var(--sp-2) var(--sp-2)", color: "var(--danger)", fontSize: "var(--fs-3xs)" }}>{fallo}</p>}
    </figure>
  );
}

/** El video que creó el asistente en el Estudio: se ve aquí y se descarga. */
function VideoGenerado({ clave }) {
  const url = db.getContentBankUrl(clave);
  return (
    <figure style={{ margin: 0, width: "92%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
      <video src={url} controls playsInline preload="metadata" style={{ display: "block", width: "100%", maxHeight: 480, background: "var(--bg)" }} aria-label="Video creado por el asistente" />
      <figcaption style={{ display: "flex", gap: "var(--sp-2)", padding: "var(--sp-2)" }}>
        <a className="btn btn-primary btn-sm" href={url} download style={{ minHeight: "var(--tap-sm)" }}>
          <Icon name="download" size={16} /> Descargar
        </a>
      </figcaption>
    </figure>
  );
}

function ActionChip({ feedback }) {
  const TOOL_LABELS = {
    guardar_en_cerebro: "Cerebro",
    borrar_memoria: "Memoria",
    crear_publicacion: "Calendario",
    editar_publicacion: "Calendario",
    eliminar_publicaciones: "Calendario",
    editar_publicaciones_lote: "Lote",
    crear_tarea: "Tarea",
    agregar_banco_ideas: "Banco de ideas",
    ir_a_cliente: "Navegación",
    generar_imagen: "Imagen",
    disenar_piezas: "Diseño",
    corregir_pieza: "Diseño",
    version_final: "Diseño",
    ver_lo_que_funciona: "Diseño",
    guardar_regla: "Kit de marca",
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
