import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { FORMATS, FORMAT_ICONS, STATUSES, MONTHS, DAYS } from "../constants";
import { uid } from "../utils";
import { marcarActualizada, momentoPublicacion } from "../lib/publicacion";
import { callAI, loadADN, parseAIResponse, buildScriptPrompt, buildDescripcionesPrompt, buildClientContext, generateSinglePost, pasajesDeLaTanda } from "../api";
import { base64DeImagen, prepararParaRedes } from "../lib/medios";
import {
  shareCalendar, setShareEnabled, fetchApprovals, subscribeApprovals, loadClientMemories,
  listarPublicaciones, publicar, cancelarPublicacion, reintentarPublicacion, estadoRedes as leerEstadoRedes,
  subirImagenPublicacion, saveCalendar,
} from "../lib/db";
import { resumenCola, aprobadasSinProgramar } from "../lib/cola";
import { navegar, analizarRuta, construirRuta } from "../lib/rutas";
import { ideasDeRevision, porRevisar } from "../lib/revisionIdeas";
import { agruparPorSemana, semanaInicial, rangoSemana } from "../lib/semanas";
import { moverEnCalendario, ponerEnDia, copiaDePublicacion } from "../lib/subir";
import { conAprobacion, resumenEnvio, estadoDelEnvio, mensajeDeEnvio } from "../lib/aprobacion";
import { sinLoNecesario } from "../lib/completitud";
import { programarAprobadasDe } from "../lib/programarAprobadas";
import { useEquipo } from "../hooks/useEquipo";
import { useBancoIdeas } from "../hooks/useBancoIdeas";
import { filtrarBanco } from "../lib/bancoIdeas";
import { yoActual, esAdmin } from "../lib/sesionActual";
import { fechaEnZona } from "../lib/agenda";
import { fechasDelMes, fechasPorDia } from "../lib/fechasEspeciales";
import { semanasDelMes, conceptosDelMes, pedidoDeNombres, leerNombres } from "../lib/campanas";
import { semanaDelMes } from "../lib/semanas";
import { esVirtual } from "../lib/meses";
import { construirExportacion, FORMATOS_EXPORTABLES_POR_DEFECTO, CAMPOS_EXPORTABLES } from "../lib/exportarContenido";
import Icon from "./Icon";
import { useConfigIA } from "../hooks/useConfigIA";
import { etiquetaIA } from "../lib/configIA";
import { ContentDisplay, OverflowMenu } from "./calendario/primitivas";
// El panel de una publicación se carga al abrirlo: medios, publicar,
// historias y vista previa son mucho código que el mes no necesita.
// La vista (mes o lista) se recuerda al pasar de un mes a otro.
let vistaRecordada = "grid";

const PostSidePanel = lazy(() => import("./calendario/PostSidePanel").then((m) => ({ default: m.PostSidePanel })));
const ProgramarAprobadas = lazy(() => import("./calendario/programarAprobadas"));
import { MonthGrid } from "./calendario/MonthGrid";
import { CampanaMes } from "./calendario/campanaMes";
import { RepeticionesMes } from "./calendario/repeticionesMes";
import { repeticionesPendientes, copiaRepetida, conRegla } from "../lib/repetir";
// «Revisar el mes» antes de enviarlo: reglas, IA y marca (se carga al abrirlo).
const RevisionMes = lazy(() => import("./calendario/RevisionMes"));
const ProducirMes = lazy(() => import("./calendario/ProducirMes"));
// «Producir el mes»: crear lo que falta (el lote del Estudio) o diseñar lo que ya hay.
const ProducirElMes = lazy(() => import("./calendario/ProducirElMes"));
// «Revisar las ideas»: la aprobación interna, en tarjetas (aprobar, otra, quitar).
const RevisarIdeas = lazy(() => import("./calendario/RevisarIdeas"));
const GuardarMesDrive = lazy(() => import("./calendario/GuardarMesDrive"));
const PlanSemanal = lazy(() => import("./calendario/PlanSemanal"));
const FechasEspecialesDialog = lazy(() => import("./calendario/fechasEspeciales").then((m) => ({ default: m.FechasEspecialesDialog })));
import { BankPanel } from "./calendario/BankPanel";
import {
  ExportContenidoDialog, ElegirNuevaPublicacion,
  EditMetaDialog, ApprovalDialog, AddPostDialog,
} from "./calendario/dialogos";
import { fmt12h } from "./calendario/formato";

export default function CalendarView({
  client,
  cal,
  calId,
  pulso = 0,
  editandoOtros = {},
  onUpdateCal,
  onUpdateOtroCal,
  onUpdateCalLocal,
  onDeleteCal,
  onMoverAOtroMes,
  onLlevarAlCalendario,
  vecinos = null,
  onAbrirVecina,
  clientes = [],
  onAviso,
  onMoveBankToCal,
  onGuardarFechas,
  onGuardarPlan,
  abrirPublicacion = null,
  onPublicacionAbierta,
}) {
  // Mes por defecto, también en el móvil: es la vista que se usa. La lista
  // (por semanas) queda a un toque. Se recuerda al pasar de mes: la vista
  // se monta de nuevo en cada uno (App le da `key` por mes).
  const [viewMode, setViewModeEstado] = useState(() => vistaRecordada);
  const setViewMode = (v) => { vistaRecordada = v; setViewModeEstado(v); };
  // Un mes sin cajón todavía (calendario siempre activo): se ve vacío y se
  // escribe en él; lo que necesita el cajón en la base espera a que exista.
  const virtual = esVirtual(cal);
  const mesDelCal = `${cal.year}-${String(cal.month + 1).padStart(2, "0")}`;
  const configIA = useConfigIA();
  const [expandedDay, setExpandedDay] = useState(null);
  const [sidePanel, setSidePanel] = useState(null);

  // El buscador (Ctrl+K) puede pedir que se abra una publicación concreta
  // al llegar a este calendario.
  useEffect(() => {
    if (!abrirPublicacion) return;
    for (const day of cal?.days ?? []) {
      const post = (day.posts ?? []).find((p) => p.id === abrirPublicacion);
      if (post) { setSidePanel({ post, day }); break; }
    }
    onPublicacionAbierta?.();
  }, [abrirPublicacion, cal, onPublicacionAbierta]);

  // La cola de publicación de este calendario y qué hay conectado. Se
  // relee con `pulso`: la cola la mueve el cron, sin nadie delante.
  const [cola, setCola] = useState([]);
  const [redes, setRedes] = useState(null);
  const calDb = cal?.dbId || cal?.id;
  const clienteDb = client?.dbId || client?.id;
  const recargarCola = useCallback(() => {
    if (!calDb || virtual) return;
    listarPublicaciones({ calendario: calDb }).then(setCola).catch(() => {});
  }, [calDb, virtual]);
  useEffect(() => { recargarCola(); }, [recargarCola, pulso]);
  useEffect(() => {
    leerEstadoRedes().then(setRedes).catch(() => setRedes({ meta: {}, cuentas: [] }));
  }, [pulso]);

  /**
   * Publicar o programar desde el panel. Lo que sale es lo que hay en D1,
   * así que antes: imágenes a JPEG (Instagram no acepta otra cosa) y
   * guardado INMEDIATO, sin esperar al agrupado de 600 ms.
   */
  const publicarDesdePanel = async (form, setForm, { ahora, redes: destino, fecha = null, cambios = null }) => {
    // A OTRO mes: se guarda aquí, se lleva al mes nuevo (con todo lo suyo)
    // y se programa allí. Después se abre en su mes.
    if (!ahora && fecha && fecha.slice(0, 7) !== mesDelCal) {
      let post = cambios ? { ...form, ...cambios } : form;
      const preparada = await prepararParaRedes(post, destino, { subir: (f) => subirImagenPublicacion(clienteDb, f), colorMarca: client?.primaryColor });
      if (preparada.cambio) post = preparada.post;
      setForm(post);
      const ahoraISO = new Date().toISOString();
      const aqui = { ...cal, days: (cal.days || []).map((d) => ({ ...d, posts: (d.posts || []).map((p) => (p.id === post.id ? marcarActualizada(p, post, ahoraISO) : p)) })) };
      onUpdateCal(calId, aqui);
      const calDestino = await onMoverAOtroMes?.(post.id, fecha);
      if (!calDestino) throw new Error("No se movió: sigue en este mes.");
      await publicar({ calendarId: calDestino.dbId || calDestino.id, postId: post.id, redes: destino, ahora: false });
      setSidePanel(null);
      onAbrirVecina?.(calDestino, post.id);
      return;
    }
    // Lo que cambia al elegir el «cuándo» (deja de ser «a mano») va con ella.
    let post = cambios ? { ...form, ...cambios } : form;
    if (cambios) setForm(post);
    // JPEG, medidas y las copias adaptadas (4:5 para el feed, 9:16 para
    // las historias) de lo que no quepa. El original no se toca.
    const preparada = await prepararParaRedes(post, destino, {
      subir: (f) => subirImagenPublicacion(clienteDb, f),
      colorMarca: client?.primaryColor,
    });
    if (preparada.cambio) {
      post = preparada.post;
      setForm(post);
    }
    const ahoraISO = new Date().toISOString();
    let nuevo = {
      ...cal,
      days: (cal.days || []).map((d) => ({
        ...d,
        posts: (d.posts || []).map((p) => (p.id === post.id ? marcarActualizada(p, post, ahoraISO) : p)),
      })),
    };
    // Programar para OTRO día la mueve en el calendario: el día es parte
    // del «cuándo», no algo que haya que cambiar en otro sitio antes.
    const diaActual = (cal.days || []).find((d) => (d.posts || []).some((p) => p.id === post.id))?.date;
    if (!ahora && fecha && fecha !== diaActual) {
      nuevo = moverEnCalendario(nuevo, post.id, fecha);
      const dia = nuevo.days.find((d) => d.date === fecha);
      setSidePanel((s) => (s && s.post.id === post.id ? { ...s, day: dia } : s));
    }
    onUpdateCal(calId, nuevo);
    await saveCalendar(nuevo, clienteDb);
    await publicar({ calendarId: calDb, postId: post.id, redes: destino, ahora });
    recargarCola();
  };

  // Lo aprobado que aún no está en la cola, y las redes que el cliente
  // tiene de verdad: sin ninguna cuenta, la barra de publicar no sale.
  const candidatas = useMemo(() => aprobadasSinProgramar(cal?.days ?? [], cola), [cal?.days, cola]);
  const redesDelCliente = useMemo(
    () => [...new Set((redes?.cuentas ?? []).filter((c) => c.clientId === clienteDb).map((c) => c.red))],
    [redes, clienteDb],
  );

  /**
   * «Programar lo aprobado»: prepara las imágenes de cada una como el
   * panel (JPEG y copias adaptadas), guarda el calendario UNA vez y
   * programa todas en una sola petición.
   */
  const programarAprobadas = async (lista, avisar) => {
    const r = await programarAprobadasDe({ cal, clienteDb, colorMarca: client?.primaryColor, lista, avisar });
    if (r.cambiado) onUpdateCal(calId, { ...cal, days: r.nuevo.days });
    recargarCola();
    return { programadas: r.programadas, fallidas: r.fallidas };
  };

  const abrirDesdeLista = (postId) => {
    setCapa(null);
    for (const day of cal?.days ?? []) {
      const post = (day.posts ?? []).find((p) => p.id === postId);
      if (post) { setSidePanel({ post, day }); break; }
    }
  };

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFormat, setFilterFormat] = useState("all");
  // «all», «mias» o el id de una persona del equipo.
  const [filterPersona, setFilterPersona] = useState("all");
  const miembros = useEquipo(pulso);
  const [filterWeek, setFilterWeek] = useState("all");
  // La lista va por semanas plegables. null = lo de entrada (sólo la
  // semana de hoy abierta); en cuanto alguien abre o cierra, es un Set.
  const [semanasAbiertas, setSemanasAbiertas] = useState(null);
  useEffect(() => { setSemanasAbiertas(null); }, [calId]);
  const [filterDOW, setFilterDOW] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [genProgress, setGenProgress] = useState(0);
  const [debugLog, setDebugLog] = useState([]);
  const [addingPostDay, setAddingPostDay] = useState(null);
  const [genSingleLoading, setGenSingleLoading] = useState({});
  const [incompleteInfo, setIncompleteInfo] = useState(null);
  const [syncStatus, setSyncStatus] = useState("");
  const [shareWorking, setShareWorking] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const undoRef = useRef(null);
  const [undoVisible, setUndoVisible] = useState(false);
  // ------------------------------------------------------------
  // UNA SOLA CAPA POR ENCIMA DEL CALENDARIO
  //
  // Esto eran seis `useState(false)` independientes —banco, aprobación,
  // meta, prompt maestro, exportar y diagnóstico— renderizados como
  // hermanos, y NADA cerraba uno al abrir otro: se podían apilar dos
  // diálogos, y cuál quedaba delante lo decidía el orden en el DOM
  // porque sus z-index estaban sin escalar (dos empatados en 50).
  //
  // Con un solo valor, «abrir algo» es por construcción «cerrar lo que
  // hubiera». Añadir una capa nueva es añadir un nombre, no una
  // séptima bandera que alguien tendrá que acordarse de bajar.
  // ------------------------------------------------------------
  const [capa, setCapa] = useState(null);
  // El plan semanal de la empresa en la barra de los días (lib/planSemanal.js): lo que leen el lote y la IA.
  // Va en diferido: las plantillas no caben en el arranque (rendimiento.bundle.test.js), y la barra sólo pinta texto.
  const [semanaPlan, setSemanaPlan] = useState(null);
  const [diaPlan, setDiaPlan] = useState(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([import("../lib/planSemanal"), import("../lib/plantillasApi").then((m) => m.leerPlantillas()).catch(() => [])])
      .then(([m, lista]) => { if (vivo) setSemanaPlan(m.lineasDeLaSemana(client, lista)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [client]);
  const puedeEditarPlan = Boolean(onGuardarPlan) && !yoActual()?.soloLectura;
  const abrirCapa = useCallback((nombre) => setCapa(nombre), []);
  const cerrarCapa = useCallback(() => setCapa(null), []);
  const [suggestions, setSuggestions] = useState({});

  const [metaForm, setMetaForm] = useState(() => {
    const cats = {};
    for (const day of cal.days || []) {
      if (!day.category) continue;
      const dow = new Date(day.date + "T12:00:00").getDay();
      if (!cats[dow]) cats[dow] = day.category;
    }
    return {
      name: cal.name || "",
      campaign: cal.campaign || "",
      weekConcepts: [...(cal.weekConcepts || [])],
      dayCategories: cats,
      offers: cal.offers || "",
      promoCode: cal.promoCode || "",
      visualReferences: (cal.visualReferences || []).map((r) => r.format ? r : { ...r, format: "post" }),
    };
  });
  // La campaña del mes y de cada semana, y las fechas especiales del mes
  // (las del catálogo más lo que decidió este cliente).
  const semanasMes = useMemo(() => semanasDelMes(cal.year, cal.month), [cal.year, cal.month]);
  const conceptos = conceptosDelMes(cal);
  const fechasMes = useMemo(() => fechasDelMes(cal.year, cal.month, client?.fechasEspeciales), [cal.year, cal.month, client?.fechasEspeciales]);
  const fechasDia = useMemo(() => fechasPorDia(fechasMes), [fechasMes]);

  // «Post que se repite» (lib/repetir.js): lo que le toca a este mes y aún no está. Las reglas pueden vivir en
  // cualquier mes del cliente; éste va con su versión de ahora (el virtual no está en `client.calendars`).
  // «Ahora no» se recuerda por navegador y por cliente.
  const claveOmitidas = `repetir-omitidas:${client?.id ?? ""}`;
  const [omitidas, setOmitidas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(claveOmitidas) || "[]"); } catch { return []; }
  });
  const [repetidasHechas, setRepetidasHechas] = useState(0);
  const repeticiones = useMemo(() => {
    const cals = [...(client?.calendars ?? []).filter((k) => k.id !== cal.id), cal];
    return repeticionesPendientes(cals, mesDelCal, { hoy: fechaEnZona(), omitidas });
  }, [client?.calendars, cal, mesDelCal, omitidas]);
  const omitirRepeticiones = () => {
    const todas = [...new Set([...omitidas, ...repeticiones.map((r) => r.clave)])].slice(-300);
    setOmitidas(todas);
    try { localStorage.setItem(claveOmitidas, JSON.stringify(todas)); } catch { /* sin almacenamiento: sólo esta vez */ }
  };
  const anadirRepeticiones = ({ textosNuevos }) => {
    let nuevo = cal;
    for (const r of repeticiones) nuevo = ponerEnDia(nuevo, r.fecha, copiaRepetida(r.origen, r.fecha, uid(), { textosNuevos }));
    setRepetidasHechas(repeticiones.length);
    onUpdateCal(calId, nuevo);
  };
  const noRepetirMas = (r) => {
    if (r.calOrigen.id === cal.id) onUpdateCal(calId, conRegla(cal, r.origen.id, ""));
    else onUpdateOtroCal?.(r.calOrigen.id, conRegla(r.calOrigen, r.origen.id, ""));
  };
  const [metaTab, setMetaTab] = useState("general");
  const [metaAviso, setMetaAviso] = useState("");
  const [nombrando, setNombrando] = useState(false);
  const [errorNombres, setErrorNombres] = useState("");

  const formDelMes = (extra = {}) => ({
    campaign: cal.campaign || "",
    weekConcepts: semanasMes.map((_, i) => conceptos[i] || ""),
    offers: cal.offers || "",
    promoCode: cal.promoCode || "",
    visualReferences: (cal.visualReferences || []).map((r) => r.format ? r : { ...r, format: "post" }),
    ...extra,
  });
  const abrirMeta = (tab = "general", extra = {}, aviso = "") => {
    setMetaForm(formDelMes(extra));
    setMetaTab(tab);
    setMetaAviso(aviso);
    abrirCapa("meta");
  };

  /** La IA propone el nombre del mes y el de las semanas que no lo tienen; se revisa antes de guardar. */
  const sugerirNombres = async () => {
    if (nombrando) return;
    setNombrando(true);
    setErrorNombres("");
    try {
      const pedido = pedidoDeNombres({
        contexto: buildClientContext(client), year: cal.year, month: cal.month,
        fechas: fechasMes, ofertas: cal.offers || "", campana: cal.campaign || "", semanas: conceptos,
      });
      const txt = await callAI(pedido, { funcion: "calendario", clienteId: client?.id });
      const r = leerNombres(txt, semanasMes.length, { campana: cal.campaign || "", semanas: conceptos });
      if (!r) throw new Error("La IA no devolvió nombres que se puedan leer. Inténtalo otra vez.");
      abrirMeta(cal.campaign ? "weeks" : "general", { campaign: r.campana, weekConcepts: r.semanas }, "Propuesta de la IA: cambia lo que quieras y pulsa Guardar.");
    } catch (e) {
      setErrorNombres(e?.message || "No se pudo consultar a la IA.");
    }
    setNombrando(false);
  };

  // ----------------------------------------------------------
  // Respuestas del cliente final, en vivo
  //
  // Se vuelcan sobre `days` en el estado local únicamente. Persistirlas
  // dispararía una escritura por cada respuesta recibida, y esa
  // escritura volvería como otro evento: un bucle. La tabla `approvals`
  // es la fuente de verdad y se relee en cada carga.
  //
  // La referencia lleva el calendario más reciente a la suscripción sin
  // que ésta tenga que rehacerse en cada edición.
  // ----------------------------------------------------------
  const setCalRef = useRef(null);
  setCalRef.current = (updater) => onUpdateCalLocal(calId, updater(cal));

  // Huella de las aprobaciones ya vistas. El sondeo de repuesto se
  // dispara cada minuto haya respuesta o no, y antes anunciaba «tu
  // cliente acaba de responder» en CADA vuelta, respondiera alguien o
  // no: un aviso que aparece solo cada quince segundos deja de querer
  // decir nada, y con él se pierde el que sí importa.
  const vistas = useRef("");

  useEffect(() => {
    if (!cal.shareToken || !cal.id) return;
    let alive = true;

    const aplicar = async ({ anunciar = false } = {}) => {
      try {
        const approvals = await fetchApprovals(cal.id);
        if (!alive || Object.keys(approvals).length === 0) return;

        const huella = JSON.stringify(approvals);
        const huboNovedad = vistas.current !== "" && vistas.current !== huella;
        vistas.current = huella;
        if (anunciar && huboNovedad) {
          setSyncStatus("Tu cliente acaba de responder.");
          setTimeout(() => setSyncStatus(""), 4000);
        }

        const newSuggestions = {};
        for (const [postId, review] of Object.entries(approvals)) {
          if (review.suggestedDescripcion || review.suggestedGuion) {
            newSuggestions[postId] = {
              descripcion: review.suggestedDescripcion,
              guion: review.suggestedGuion,
              comentario: review.comentario,
            };
          }
        }
        setSuggestions(newSuggestions);

        setCalRef.current?.((actual) => {
          const days = (actual.days || []).map((d) => ({
            ...d,
            // «Publicada» no la pisa una aprobación: ya salió. Y lo que el
            // cliente respondió ANTES de que se le volviera a pedir, no
            // cuenta (lib/aprobacion.js). El comentario del cliente NO se
            // copia a la nota interna: vive en la conversación.
            posts: (d.posts || []).map((p) => conAprobacion(p, approvals[p.id])),
          }));
          return { ...actual, days };
        });
      } catch (e) {
        console.error("No se pudieron leer las aprobaciones:", e);
      }
    };

    aplicar();
    const unsubscribe = subscribeApprovals(cal.id, () => { aplicar({ anunciar: true }); });

    return () => { alive = false; unsubscribe(); };
    // `pulso` sube cuando el enlace público avisa de que el cliente final
    // acaba de responder. El sondeo de abajo sigue ahí como red: si el
    // socket está caído, es lo único que queda.
  }, [cal.id, cal.shareToken, pulso]);

  // El banco de ideas ÚNICO de la agencia (lib/bancoIdeas.js): las de este cliente y las generales.
  const banco = useBancoIdeas({ pulso, onError: onAviso });
  const ideasBank = filtrarBanco(banco.ideas, { clienteId: client.id });

  const addToBank = (post, sourceDate) => {
    const bankPost = { ...post, id: uid(), _originDate: sourceDate, _originCal: calId, _addedAt: new Date().toISOString() };
    banco.anadir(bankPost, client.id);
  };

  // La idea SÓLO sale del banco si entró en el calendario.
  const moveBankToCalendar = async (bankPost, targetDate) => {
    if (await onMoveBankToCal?.(bankPost, targetDate)) banco.quitar(bankPost.id);
  };

  const calName = cal.name || (MONTHS[cal.month] + " " + cal.year);
  const approvalUrl = cal.shareToken
    ? `${window.location.origin}/aprobar?t=${encodeURIComponent(cal.shareToken)}`
    : "";
  // Cómo va el mes para mandarlo COMPLETO (sólo se calcula con el diálogo de enviar abierto).
  const envio = capa === "aprobacion" ? estadoDelEnvio(cal.days) : null;
  const totalPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).length, 0);

  const weeks = [...new Set((cal.days || []).map((d) => d.weekNumber || 1))].sort((a, b) => a - b);
  const activeFilterCount = [filterStatus, filterFormat, filterWeek, filterDOW, filterPersona].filter((f) => f !== "all").length;
  const personaFiltrada = filterPersona === "mias" ? yoActual()?.id : filterPersona;

  const filteredDays = (cal.days || []).map((day) => ({
    ...day,
    posts: (day.posts || []).filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterFormat !== "all" && p.format !== filterFormat) return false;
      if (filterPersona !== "all" && p.responsableId !== personaFiltrada) return false;
      return true;
    }),
  })).filter((day) => {
    if (filterWeek !== "all" && String(day.weekNumber) !== filterWeek) return false;
    if (filterDOW !== "all") {
      const dow = new Date(day.date + "T12:00:00").getDay();
      if (String(dow) !== filterDOW) return false;
    }
    return day.posts.length > 0 || (filterStatus === "all" && filterFormat === "all" && filterPersona === "all");
  });

  const addDebug = (msg) => setDebugLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg }]);

  const updatePost = (_date, updatedPost) => {
    // Si el cliente había pedido cambios y se corrige algo que él ve, la
    // publicación vuelve a su página como «Actualizada», con lo de antes
    // tachado: así no tiene que releer el mes entero.
    const ahoraISO = new Date().toISOString();
    const newDays = (cal.days || []).map((d) => ({
      ...d,
      posts: (d.posts || []).map((p) => (p.id === updatedPost.id ? marcarActualizada(p, updatedPost, ahoraISO) : p)),
    }));
    onUpdateCal(calId, { ...cal, days: newDays });
  };

  /**
   * «Agregar publicación» → «Subir contenido» o «Agregar idea». Se crea al
   * momento, sin pedir título, y se abre en la pestaña que toca. Lo subido
   * sale directo (aprobada, como el botón «Subir»); la idea espera al
   * cliente. `ponerEnDia` crea el día si el calendario aún no lo tenía: el
   * «+» de la rejilla se ofrece en todos los días del mes, y antes la
   * publicación de un día sin fila se perdía sin decir nada.
   */
  const addPost = (date, pestana) => {
    const subir = pestana === "publicar";
    const newPost = {
      id: uid(),
      format: "post",
      title: "",
      idea: "",
      guion: "",
      descripcion: "",
      hashtagsFinales: "",
      script: "",
      status: subir ? "approved" : "pending",
      category: "",
      image: null,
      referenceLink: "",
      comment: "",
      ...(subir ? { subidaRapida: true } : {}),
    };
    const nuevo = ponerEnDia(cal, date, newPost);
    onUpdateCal(calId, nuevo);
    setAddingPostDay(null);
    setSidePanel({ post: newPost, day: nuevo.days.find((d) => d.date === date), pestana, nueva: true });
  };

  const removePostFromDay = (date, postId) => {
    const newDays = (cal.days || []).map((d) =>
      d.date !== date ? d : { ...d, posts: d.posts.filter((p) => p.id !== postId) }
    );
    onUpdateCal(calId, { ...cal, days: newDays });
    if (sidePanel?.post?.id === postId) setSidePanel(null);
  };

  const deletePost = (date, postId) => {
    if (!window.confirm("Eliminar esta publicacion?")) return;
    removePostFromDay(date, postId);
  };

  const togglePostSelection = (postId) => {
    setSelectedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const bulkDelete = () => {
    if (selectedPosts.size === 0) return;
    const label = selectedPosts.size === 1 ? "1 publicación" : `${selectedPosts.size} publicaciones`;
    if (!window.confirm(`¿Eliminar ${label}?`)) return;
    const snapshot = (cal.days || []).map((d) => ({ ...d, posts: [...(d.posts || [])] }));
    const newDays = (cal.days || []).map((d) => ({
      ...d,
      posts: (d.posts || []).filter((p) => !selectedPosts.has(p.id)),
    }));
    onUpdateCal(calId, { ...cal, days: newDays });
    undoRef.current = snapshot;
    setUndoVisible(true);
    setSelectedPosts(new Set());
    setSelectionMode(false);
    setTimeout(() => setUndoVisible(false), 8000);
  };

  const undoLastAction = () => {
    if (!undoRef.current) return;
    onUpdateCal(calId, { ...cal, days: undoRef.current });
    undoRef.current = null;
    setUndoVisible(false);
  };

  const togglePublished = (date, post) => {
    const newStatus = post.status === "published" ? "approved" : "published";
    updatePost(date, { ...post, status: newStatus });
  };

  const sortedPosts = (posts) =>
    [...(posts || [])].sort((a, b) => {
      if (!a.publishTime && !b.publishTime) return 0;
      if (!a.publishTime) return 1;
      if (!b.publishTime) return -1;
      return a.publishTime.localeCompare(b.publishTime);
    });

  const generateSinglePostContent = async (post, day) => {
    setGenSingleLoading((p) => ({ ...p, [post.id]: true }));
    try {
      const result = await generateSinglePost(client, post, day, cal);
      const newDays = (cal.days || []).map((d) =>
        d.date !== day.date ? d : {
          ...d,
          posts: d.posts.map((p) =>
            p.id !== post.id ? p : {
              ...p,
              guion: result.guion || p.guion,
              descripcion: result.descripcion || p.descripcion,
              hashtagsFinales: result.hashtagsFinales || p.hashtagsFinales,
              textoPieza: p.textoPieza || result.textoPieza || "",
              script: result.descripcion || result.guion || p.script,
            }
          ),
        }
      );
      onUpdateCal(calId, { ...cal, days: newDays });
    } catch (e) {
      setSyncStatus("Error al generar: " + e.message);
      setTimeout(() => setSyncStatus(""), 6000);
    }
    setGenSingleLoading((p) => ({ ...p, [post.id]: false }));
  };

  const getIncompletePosts = () => {
    return (cal.days || []).flatMap((d) =>
      (d.posts || [])
        .filter((p) => {
          const hasContent = p.guion || p.descripcion || p.script;
          return !hasContent;
        })
        .map((p) => ({ ...p, _date: d.date, _dayName: d.dayName }))
    );
  };

  const retryIncomplete = async () => {
    const incomplete = getIncompletePosts();
    if (!incomplete.length) return;
    setGenLoading(true);
    setGenProgress(0);
    setGenStatus(`Reintentando ${incomplete.length} posts...`);
    setIncompleteInfo(null);

    try {
      const [adn2, mems2] = await Promise.all([
        loadADN(client),
        loadClientMemories(client.dbId || client.id).catch(() => []),
      ]);
      const adnExtra = adn2.content;

      const BATCH = 6;
      let allResults = {};
      const postsToGen = incomplete.map((p) => {
        const day = (cal.days || []).find((d) => d.date === p._date);
        return { ...p, _weekNumber: day?.weekNumber, _concept: day?.concept };
      });

      for (let i = 0; i < postsToGen.length; i += BATCH) {
        const batch = postsToGen.slice(i, i + BATCH);
        setGenStatus(`Reintentando ${i + 1}-${Math.min(i + BATCH, postsToGen.length)}/${postsToGen.length}...`);
        setGenProgress(Math.round((i / postsToGen.length) * 90));

        const pasajes = await pasajesDeLaTanda(client, adn2, cal, batch);
        const promptText = buildScriptPrompt(client, cal, batch, adnExtra, mems2, adn2.cerebro ? { pasajes } : null);
        const content = [{ type: "text", text: promptText }];
        for (const p of batch) {
          const data = await base64DeImagen(p.image).catch(() => null);
          if (data) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
        }

        const txt = await callAI(content, { funcion: "calendario", clienteId: client?.id });
        const parsed = parseAIResponse(txt);
        allResults = { ...allResults, ...parsed };
      }

      const newDays = (cal.days || []).map((d) => ({
        ...d,
        posts: (d.posts || []).map((p) => {
          const result = allResults[p.id];
          if (!result) return p;
          return { ...p, guion: result.guion || p.guion, descripcion: result.descripcion || p.descripcion, hashtagsFinales: result.hashtagsFinales || p.hashtagsFinales, textoPieza: p.textoPieza || result.textoPieza || "", script: result.descripcion || result.guion || p.script };
        }),
      }));
      onUpdateCal(calId, { ...cal, days: newDays });

      const stillIncomplete = newDays.flatMap((d) => d.posts.filter((p) => !p.guion && !p.descripcion && !p.script));
      setGenProgress(100);
      setGenStatus(`Listo! ${Object.keys(allResults).length} posts generados`);
      if (stillIncomplete.length > 0) {
        setIncompleteInfo({ count: stillIncomplete.length });
      }
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 2000);
    } catch (e) {
      setGenStatus("Error: " + e.message);
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 4000);
    }
  };

  // El calendario ya no se copia a ningún sitio al compartirlo: el
  // enlace apunta a la misma fila que edita la agencia, así que el
  // cliente ve siempre la versión actual sin volver a enviarlo.
  const sendToClient = async () => {
    if (cal.shareToken) {
      abrirCapa("aprobacion");
      return;
    }
    setShareWorking(true);
    try {
      const token = await shareCalendar(cal.id);
      onUpdateCalLocal(calId, { ...cal, shareToken: token, shareEnabled: true });
      abrirCapa("aprobacion");
    } catch (e) {
      setSyncStatus(`No se pudo generar el enlace: ${e.message}. Usa «HTML» para enviarlo como archivo.`);
      setTimeout(() => setSyncStatus(""), 8000);
    }
    setShareWorking(false);
  };

  const changeShare = async (enabled) => {
    setShareWorking(true);
    try {
      await setShareEnabled(cal.id, enabled);
      onUpdateCalLocal(calId, { ...cal, shareEnabled: enabled });
      setSyncStatus(enabled ? "Enlace reactivado." : "Enlace revocado.");
      setTimeout(() => setSyncStatus(""), 4000);
    } catch (e) {
      setSyncStatus(`No se pudo cambiar el enlace: ${e.message}`);
      setTimeout(() => setSyncStatus(""), 6000);
    }
    setShareWorking(false);
  };

  const movePost = (postId, sourceDate, targetDate) => {
    // Lo que está en la cola se mueve con ella (el servidor reprograma al guardar: `resincronizarCalendario`).
    // Dos casos no: lo que ya salió o está saliendo no cambia de día, y a un momento que ya pasó saldría AL
    // INSTANTE en el siguiente minuto del cron, que no es lo que se quiere al arrastrar.
    const filasDelPost = cola.filter((f) => f.postId === postId);
    if (filasDelPost.some((f) => ["procesando", "publicada"].includes(f.estado))) {
      setSyncStatus("Esa publicación ya salió (o está saliendo): no se mueve de día.");
      setTimeout(() => setSyncStatus(""), 5000);
      return;
    }
    const programadas = filasDelPost.filter((f) => f.estado === "programada");
    if (programadas.length) {
      const post = (cal.days || []).find((d) => d.date === sourceDate)?.posts.find((p) => p.id === postId);
      const nuevo = momentoPublicacion(targetDate, post?.publishTime);
      if (nuevo && Date.parse(nuevo) < Date.now()
        && !window.confirm("Está programada y esa fecha ya pasó: si la mueves, saldrá en el próximo minuto. ¿Moverla igual?")) return;
      setSyncStatus(`La programación se mueve con ella: sale el ${Number(targetDate.slice(8))}.`);
      setTimeout(() => setSyncStatus(""), 5000);
    }
    // A otro mes lo mueve el servidor, con su aprobación, su cola y lo demás.
    if (targetDate.slice(0, 7) !== mesDelCal) {
      void onMoverAOtroMes?.(postId, targetDate);
      return;
    }
    let days = [...(cal.days || [])];
    const sourceDay = days.find((d) => d.date === sourceDate);
    const post = sourceDay?.posts.find((p) => p.id === postId);
    if (!post) return;

    days = days.map((d) => {
      if (d.date === sourceDate) return { ...d, posts: d.posts.filter((p) => p.id !== postId) };
      if (d.date === targetDate) return { ...d, posts: [...(d.posts || []), post] };
      return d;
    });

    if (!days.find((d) => d.date === targetDate)) {
      const tdd = new Date(targetDate + "T12:00:00");
      days = [...days, { date: targetDate, dayName: DAYS[tdd.getDay()], weekNumber: 1, category: "", posts: [post] }];
      days.sort((a, b) => a.date.localeCompare(b.date));
    }

    onUpdateCal(calId, { ...cal, days });
  };

  /**
   * «Duplicar a otro día»: una copia nueva y pendiente (lib/subir.js) en esa fecha; en otro mes, en su cajón (lo
   * crea si no existe). La original no se toca. → la copia, o null si no se pudo.
   */
  const duplicarPost = async (post, fecha) => {
    const copia = copiaDePublicacion(post, uid());
    try {
      if (fecha.slice(0, 7) === mesDelCal) onUpdateCal(calId, ponerEnDia(cal, fecha, copia));
      else if (onLlevarAlCalendario) await onLlevarAlCalendario(fecha, copia);
      else throw new Error("Ese día es de otro mes: ábrelo y duplícala desde allí.");
      setSyncStatus(`Duplicada al ${Number(fecha.slice(8))}${fecha.slice(0, 7) === mesDelCal ? "" : ` de ${MONTHS[Number(fecha.slice(5, 7)) - 1]}`}. Ábrela y pulsa «Otra versión» para darle otro diseño.`);
      setTimeout(() => setSyncStatus(""), 7000);
      return copia;
    } catch (e) {
      onAviso?.(`No se pudo duplicar: ${e.message}`);
      return null;
    }
  };

  const saveMetaEdit = () => {
    const updatedConcepts = metaForm.weekConcepts;
    // El nombre de cada semana se copia a sus días por la FILA de la rejilla
    // (lunes a domingo): un día añadido a mano llevaba `weekNumber: 1`
    // fuera cual fuera su semana.
    const newDays = (cal.days || []).map((d) => ({
      ...d,
      concept: updatedConcepts[semanaDelMes(d.date) - 1] || "",
    }));
    onUpdateCal(calId, {
      ...cal,
      campaign: metaForm.campaign,
      weekConcepts: updatedConcepts,
      offers: metaForm.offers || "",
      promoCode: metaForm.promoCode || "",
      visualReferences: metaForm.visualReferences || [],
      days: newDays,
    });
    cerrarCapa();
  };

  // «Crear lo que falta»: el Estudio de este cliente, en «Producir en lote» → «Mes completo» con ESTE mes.
  const producirEnLote = () => {
    const ruta = analizarRuta();
    navegar(`${construirRuta({ cliente: ruta.cliente, pestana: "estudio" })}?lote=mes&mes=${mesDelCal}`);
  };

  const generateScripts = async () => {
    if (genLoading) return;
    setGenLoading(true);
    setGenProgress(0);
    setGenStatus("Preparando...");
    setDebugLog([]);
    addDebug("Inicio de generación por fases");

    try {
      if (!client.githubContext && client.githubRepo) setGenStatus("Cargando ADN desde GitHub...");
      const [adn, mems] = await Promise.all([
        loadADN(client),
        loadClientMemories(client.dbId || client.id).catch(() => []),
      ]);
      const adnExtra = adn.content;
      const memories = mems;
      addDebug(`ADN ${adn.cacheado ? "cacheado" : "de GitHub"}: ${adnExtra.length} caracteres`);

      let currentDays = cal.days || [];
      const BATCH = 6;
      const formatosConGuion = new Set(["reel", "carrusel", "historia", "live"]);

      // ── FASE 1: Ideas para publicaciones sin idea ──
      // Por el MISMO motor que «Planificar mes» y «Producir en lote» (lib/ideaPublicacion.js): cada una con su formato,
      // su tipo y su matriz y la estrategia del mes; vuelve con idea, qué se ve, texto de la pieza o guion, caption,
      // hashtags y forma. Sólo rellena lo vacío.
      // En diferido: el motor de ideas sólo se baja al pulsar (la carga inicial tiene tope).
      const { casillasSinIdea, estrategiaDelCalendario, ideasDelPlan, rellenarConIdea } = await import("../lib/ideaPublicacion");
      const casillas = casillasSinIdea({ ...cal, days: currentDays });
      if (casillas.length) {
        addDebug(`Fase 1: ${casillas.length} publicaciones sin idea`);
        const porId = {};
        let usados = currentDays.flatMap((d) => (d.posts || []).map((p) => String(p.title || p.idea || "").trim().slice(0, 80))).filter(Boolean).slice(0, 30);
        const semilla = Math.floor(Math.random() * 1000);
        for (let desde = 0; desde < casillas.length; desde += BATCH) {
          setGenStatus(`Fase 1 — Ideas ${desde + 1}-${Math.min(desde + BATCH, casillas.length)} de ${casillas.length}…`);
          setGenProgress(Math.round((desde / casillas.length) * 25));
          const r = await ideasDelPlan(client.dbId || client.id, { casillas, estrategia: estrategiaDelCalendario(cal), usados: usados.slice(0, 30), semilla, desde, tamano: BATCH });
          for (const idea of r.ideas ?? []) {
            porId[idea.clave] = idea;
            usados = [idea.titular || idea.titulo, ...usados].filter(Boolean);
          }
          addDebug(`Fase 1 tanda: ${(r.ideas ?? []).length} ideas`);
        }
        currentDays = currentDays.map((d) => ({
          ...d,
          posts: (d.posts || []).map((p) => (porId[p.id] ? { ...p, ...rellenarConIdea(p, porId[p.id]).cambios } : p)),
        }));
        onUpdateCal(calId, { ...cal, days: currentDays });
        addDebug(`Fase 1 completa: ${Object.keys(porId).length} ideas generadas`);
      } else {
        addDebug("Fase 1: todas las publicaciones ya tienen idea");
      }

      // ── FASE 2: Guiones para reels/carruseles/historias/lives sin guion ──
      const sinGuion = currentDays.flatMap((d) =>
        (d.posts || []).filter((p) => formatosConGuion.has(p.format) && (p.idea || "").trim() && !(p.guion || "").trim())
          .map((p) => ({ ...p, _date: d.date, _dayName: d.dayName, _weekNumber: d.weekNumber, _concept: d.concept }))
      );

      if (sinGuion.length) {
        addDebug(`Fase 2: ${sinGuion.length} posts necesitan guion`);

        for (let i = 0; i < sinGuion.length; i += BATCH) {
          const batch = sinGuion.slice(i, i + BATCH);
          setGenStatus(`Fase 2 — Guiones ${i + 1}-${Math.min(i + BATCH, sinGuion.length)} de ${sinGuion.length}…`);
          setGenProgress(25 + Math.round((i / sinGuion.length) * 30));

          const pasajes = await pasajesDeLaTanda(client, adn, cal, batch);
          const promptText = buildScriptPrompt(client, cal, batch, adnExtra, memories, adn.cerebro ? { pasajes } : null);
          const content = [{ type: "text", text: promptText }];
          const res2 = await callAI(content, { maxTokens: 8000, tolerarCorte: true, funcion: "guiones", clienteId: client?.id });
          const txt2 = typeof res2 === "string" ? res2 : res2.texto;
          const parsed = parseAIResponse(txt2);
          addDebug(`Fase 2 batch: ${Object.keys(parsed).length} guiones`);

          currentDays = currentDays.map((d) => ({
            ...d,
            posts: (d.posts || []).map((p) => {
              const r = parsed[p.id];
              if (!r) return p;
              return {
                ...p,
                guion: p.guion || r.guion || "",
                descripcion: p.descripcion || r.descripcion || "",
                hashtagsFinales: p.hashtagsFinales || r.hashtagsFinales || "",
                textoPieza: p.textoPieza || r.textoPieza || "",
                script: p.script || r.descripcion || r.guion || "",
              };
            }),
          }));
          onUpdateCal(calId, { ...cal, days: currentDays });
        }
        addDebug("Fase 2 completa");
      } else {
        addDebug("Fase 2: nada necesita guion");
      }

      // ── FASE 3: Descripciones para lo que falta ──
      const sinDesc = currentDays.flatMap((d) =>
        (d.posts || []).filter((p) => (p.idea || "").trim() && !(p.descripcion || p.script || "").trim())
          .map((p) => ({ ...p, _date: d.date, _dayName: d.dayName, _weekNumber: d.weekNumber, _concept: d.concept }))
      );

      if (sinDesc.length) {
        addDebug(`Fase 3: ${sinDesc.length} posts necesitan descripción`);

        for (let i = 0; i < sinDesc.length; i += BATCH) {
          const batch = sinDesc.slice(i, i + BATCH);
          setGenStatus(`Fase 3 — Descripciones ${i + 1}-${Math.min(i + BATCH, sinDesc.length)} de ${sinDesc.length}…`);
          setGenProgress(55 + Math.round((i / sinDesc.length) * 40));

          const pasajes = await pasajesDeLaTanda(client, adn, cal, batch);
          const promptText = buildDescripcionesPrompt(client, cal, batch, adnExtra, memories, adn.cerebro ? { pasajes } : null);
          const { texto } = await callAI([{ type: "text", text: promptText }], { maxTokens: 8000, tolerarCorte: true, funcion: "guiones", clienteId: client?.id });
          const parsed = parseAIResponse(texto);
          addDebug(`Fase 3 batch: ${Object.keys(parsed).length} descripciones`);

          currentDays = currentDays.map((d) => ({
            ...d,
            posts: (d.posts || []).map((p) => {
              const r = parsed[p.id];
              if (!r?.descripcion) return p;
              return {
                ...p,
                descripcion: p.descripcion || r.descripcion,
                hashtagsFinales: p.hashtagsFinales || r.hashtagsFinales || "",
                textoPieza: p.textoPieza || r.textoPieza || "",
                script: p.script || r.descripcion,
              };
            }),
          }));
          onUpdateCal(calId, { ...cal, days: currentDays });
        }
        addDebug("Fase 3 completa");
      } else {
        addDebug("Fase 3: nada necesita descripción");
      }

      // ── Resultado final ──
      const leFalta = (p) => {
        const tieneCaption = Boolean(p.descripcion || p.script);
        if (p.format === "post") return !tieneCaption;
        return !p.guion || !tieneCaption;
      };
      const stillIncomplete = currentDays.flatMap((d) => (d.posts || []).filter(leFalta));
      if (stillIncomplete.length > 0) {
        setIncompleteInfo({ count: stillIncomplete.length });
        addDebug(`${stillIncomplete.length} posts quedaron incompletos`);
      }

      setGenProgress(100);
      setGenStatus("Listo — contenido generado por fases");
      addDebug("Generación por fases completada");
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 2000);
    } catch (e) {
      addDebug("ERROR: " + e.message);
      setGenStatus("Error: " + e.message);
      setTimeout(() => { setGenLoading(false); setGenStatus(""); setGenProgress(0); }, 4000);
    }
  };

  // La construcción del texto vive en `lib/exportarContenido.js`: es pura
  // y allí se puede probar sin montar el componente entero.
  const [formatosExport, setFormatosExport] = useState(FORMATOS_EXPORTABLES_POR_DEFECTO);
  const [camposExport, setCamposExport] = useState(CAMPOS_EXPORTABLES);
  const [copiado, setCopiado] = useState(false);

  const exportacion = capa === "exportar"
    ? construirExportacion({
        days: cal.days || [],
        formatos: formatosExport,
        campos: camposExport,
        cliente: client.name,
        calendario: calName,
      })
    : { texto: "", completas: 0, incompletas: [] };

  const alternarFormatoExport = (clave) => {
    setFormatosExport((prev) =>
      prev.includes(clave) ? prev.filter((f) => f !== clave) : [...prev, clave]
    );
  };

  const alternarCampoExport = (clave) => {
    setCamposExport((prev) =>
      prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave]
    );
  };

  const copiarExportacion = () => {
    navigator.clipboard.writeText(exportacion.texto).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      },
      () => setGenStatus("El navegador no dejó copiar al portapapeles.")
    );
  };

  const descargarExportacion = () => {
    const blob = new Blob([exportacion.texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contenido-${calName.replace(/\s+/g, "-")}-${client.name.replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={viewMode === "grid" ? "cal-vista-mes" : undefined} style={{ paddingBottom: sidePanel ? 0 : 80 }}>
      {/* Edit calendar meta modal */}
      {capa === "meta" && <EditMetaDialog metaForm={metaForm} setMetaForm={setMetaForm} onSave={saveMetaEdit} onClose={cerrarCapa} tabInicial={metaTab} semanas={semanasMes} aviso={metaAviso} />}

      {capa === "plan" && (
        <Suspense fallback={null}>
          <PlanSemanal client={client} diaInicial={diaPlan} onGuardar={onGuardarPlan} onClose={cerrarCapa} />
        </Suspense>
      )}

      {capa === "fechas" && (
        <Suspense fallback={null}>
          <FechasEspecialesDialog client={client} year={cal.year} month={cal.month} onGuardar={onGuardarFechas} onClose={cerrarCapa} />
        </Suspense>
      )}

      {capa === "programarAprobadas" && (
        <Suspense fallback={null}>
          <ProgramarAprobadas
            candidatas={candidatas}
            redesDelCliente={redesDelCliente}
            onProgramar={programarAprobadas}
            onAbrir={abrirDesdeLista}
            onClose={cerrarCapa}
          />
        </Suspense>
      )}

      {capa === "exportar" && (
        <ExportContenidoDialog
          exportacion={exportacion}
          formatos={formatosExport}
          onToggleFormato={alternarFormatoExport}
          campos={camposExport}
          onToggleCampo={alternarCampoExport}
          onCopiar={copiarExportacion}
          copiado={copiado}
          onDescargar={descargarExportacion}
          onClose={cerrarCapa}
        />
      )}

      {/* El mes ya lo dice el navegador de arriba (‹ Octubre 2026 ›), y las
          cifras —aprobadas, por aprobar, a medias— la cabecera del cliente.
          Aquí va la campaña: la del mes, la de cada semana y las fechas. */}
      <CampanaMes
        cal={cal}
        conceptos={conceptos}
        fechas={fechasMes}
        hoy={fechaEnZona()}
        soloLectura={Boolean(yoActual()?.soloLectura)}
        sugiriendo={nombrando}
        error={errorNombres}
        onEditar={(tab) => abrirMeta(tab)}
        onSugerir={sugerirNombres}
        onFechas={() => abrirCapa("fechas")}
      />

      <RepeticionesMes
        pendientes={repeticiones}
        hechas={repetidasHechas}
        soloLectura={Boolean(yoActual()?.soloLectura)}
        escribiendo={genLoading}
        onAnadir={anadirRepeticiones}
        onOmitir={omitirRepeticiones}
        onNoRepetir={noRepetirMas}
        onEscribir={() => { setRepetidasHechas(0); void generateScripts(); }}
        onCerrarHechas={() => setRepetidasHechas(0)}
      />

      {/* Barra de herramientas: acción primaria, conmutador de vista y el
          resto agrupado. Antes eran siete botones idénticos que mezclaban
          la acción principal con un visor de registros de desarrollo. */}
      <div className="toolbar">
        {/* «Producir el mes»: con publicaciones pregunta si crear lo que falta o diseñar lo que hay; sin ninguna, va
            directo al lote del mes del Estudio. Escribir sólo los textos que faltan está en «⋯». */}
        <button className="btn btn-accent" onClick={() => (totalPosts ? abrirCapa("producir-mes") : producirEnLote())} disabled={genLoading || Boolean(yoActual()?.soloLectura)}>
          <Icon name="sparkles" size={18} />
          {genLoading ? genStatus : "Producir el mes"}
        </button>

        <div className="segmented" role="group" aria-label="Vista del calendario" style={{ width: "auto", flexShrink: 0 }}>
          <button
            type="button"
            className={`segmented-btn ${viewMode === "list" ? "active" : ""}`}
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
          >
            <Icon name="list" size={16} /> Lista
          </button>
          <button
            type="button"
            className={`segmented-btn ${viewMode === "grid" ? "active" : ""}`}
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            <Icon name="grid" size={16} /> Mes
          </button>
        </div>

        <span className="toolbar-spacer" />

        <button
          className={`btn ${selectionMode ? "btn-accent" : "btn-secondary"} btn-sm`}
          onClick={() => { setSelectionMode((s) => !s); setSelectedPosts(new Set()); }}
          aria-pressed={selectionMode}
          aria-label="Seleccionar publicaciones"
        >
          <Icon name="checkSquare" size={16} />
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => setCapa((c) => (c === "banco" ? null : "banco"))}
          aria-expanded={capa === "banco"}
          aria-label={`Banco de ideas, ${ideasBank.length} guardadas`}
          style={{ position: "relative" }}
        >
          <Icon name="bulb" size={18} />
          {ideasBank.length > 0 && (
            <span aria-hidden="true" style={{ position: "absolute", top: -5, right: -5, background: "var(--accent-alt)", color: "#1a1200", borderRadius: "var(--radius-pill)", minWidth: 18, height: 18, fontSize: "var(--fs-3xs)", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
              {ideasBank.length}
            </span>
          )}
        </button>

        <button className="btn btn-primary" onClick={sendToClient} disabled={virtual} title={virtual ? "Añade alguna publicación a este mes primero" : undefined}>
          <Icon name="send" size={18} /> Enviar al cliente
        </button>

        <OverflowMenu
          items={[
            { icon: "pencil", label: "Editar el mes", onClick: () => abrirMeta("general") },
            { icon: "calendar", label: "Fechas especiales", onClick: () => abrirCapa("fechas") },
            puedeEditarPlan && { icon: "grid", label: "Plan semanal de la empresa", onClick: () => { setDiaPlan(null); abrirCapa("plan"); } },
            { icon: "checkSquare", label: "Revisar el mes", onClick: () => abrirCapa("revision") },
            { icon: "checkCircle", label: "Revisar las ideas", onClick: () => abrirCapa("revisar-ideas"), disabled: !totalPosts },
            { icon: "sparkles", label: "Completar los textos que faltan", onClick: generateScripts, disabled: genLoading || !totalPosts },
            { icon: "imageAi", label: "Diseñar las que ya hay", onClick: () => abrirCapa("producir") },
            client?.driveFolder && !virtual && { icon: "upload", label: "Guardar el mes en Drive", onClick: () => abrirCapa("drive") },
            { icon: "copy", label: "Exportar ideas y descripciones", onClick: () => abrirCapa("exportar") },
            { sep: true },
            { icon: "terminal", label: capa === "diagnostico" ? "Ocultar diagnóstico" : "Ver diagnóstico", onClick: () => setCapa((c) => (c === "diagnostico" ? null : "diagnostico")) },
            // Borrar un mes entero es de quien administra (el servidor lo
            // exige). Desde el calendario se borran publicaciones, no meses.
            esAdmin() && !virtual && { icon: "trash", label: "Borrar el mes entero", danger: true, onClick: () => {
              if (window.confirm(`¿Borrar ${MONTHS[cal.month].toLowerCase()} ${cal.year} entero, con todas sus publicaciones, aprobaciones y conversaciones? Esta acción no se puede deshacer.`)) onDeleteCal(calId);
            } },
          ].filter(Boolean)}
        />
      </div>

      {/* Publicar: sólo si el cliente tiene alguna cuenta conectada. Lo
          aprobado se programa de una vez, y «Programar al aprobar» está a
          la vista: antes vivía escondido en el diálogo de enviar. */}
      {redesDelCliente.length > 0 && (
        <div className="barra-publicar">
          <span className="barra-publicar-texto">
            <Icon name="clock" size={16} />
            {candidatas.length
              ? `${candidatas.length} ${candidatas.length === 1 ? "aprobada" : "aprobadas"} sin programar`
              : "Nada aprobado pendiente de programar"}
          </span>
          {candidatas.length > 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirCapa("programarAprobadas")}>
              Programar lo aprobado
            </button>
          )}
          <span className="interruptor-corto">
            <span id={`auto-${calId}`}>Programar al aprobar</span>
            <button
              type="button"
              role="switch"
              aria-labelledby={`auto-${calId}`}
              aria-checked={!!cal.opciones?.programarAlAprobar}
              className={`toggle${cal.opciones?.programarAlAprobar ? " is-on" : ""}`}
              onClick={() => onUpdateCal(calId, { ...cal, opciones: { ...(cal.opciones || {}), programarAlAprobar: !cal.opciones?.programarAlAprobar } })}
              title="Apagado: lo aprobado espera en Programación a que alguien lo programe. Encendido: la pieza final aprobada entra sola en la cola (una idea aprobada, nunca)"
            >
              <span className="toggle-thumb" />
            </button>
          </span>
          <a className="barra-publicar-enlace" href="/programacion" onClick={(e) => { e.preventDefault(); navegar("/programacion"); }}>
            Ver la cola
          </a>
        </div>
      )}

      {/* Generation progress */}
      {genLoading && genProgress > 0 && (
        <div style={{ marginBottom: "var(--sp-3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginBottom: "var(--sp-1)" }}>
            <span id="gen-progress-label">{genStatus}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-2)" }}>
              <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)", fontSize: "var(--fs-3xs)" }} title="Se cambia en Ajustes → Inteligencia artificial">
                {etiquetaIA(configIA)}
              </span>
              {genProgress}%
            </span>
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-labelledby="gen-progress-label"
            aria-valuenow={genProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${genProgress}%` }} />
          </div>
        </div>
      )}

      {/* Anuncia el avance a lectores de pantalla sin robar el foco */}
      <div role="status" aria-live="polite" className="sr-only">{genLoading ? genStatus : ""}</div>

      {/* Debug panel */}
      {capa === "diagnostico" && (
        <div style={{ background: "#080d16", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", marginBottom: "var(--sp-3)", maxHeight: 220, overflowY: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
            <h3 style={{ fontSize: "var(--fs-2xs)", color: "var(--success)", fontWeight: 700 }}>Registro de diagnóstico</h3>
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setDebugLog([])}>Limpiar</button>
          </div>
          {debugLog.length === 0 && <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>Sin registros. Genera contenido para ver el detalle.</p>}
          {debugLog.map((log, i) => (
            <p key={i} style={{ fontSize: "var(--fs-2xs)", lineHeight: 1.6, color: log.msg.startsWith("ERROR") ? "#FF8A85" : log.msg.startsWith("WARN") ? "#FFC166" : "var(--text-dim)", marginBottom: 2 }}>
              <span style={{ color: "var(--text-faint)" }}>[{log.time}]</span> {log.msg}
            </p>
          ))}
        </div>
      )}

      {/* Filters. Plegados por defecto: cuatro filas de chips empujaban la
          primera publicación fuera de la pantalla en móvil. Cada grupo es un
          role="group" con nombre y cada chip expone aria-pressed en lugar de
          depender sólo del color. */}
      <div className="filters-panel">
        <button
          type="button"
          className="filters-summary"
          aria-expanded={filtersOpen}
          aria-controls="panel-filtros"
          onClick={() => setFiltersOpen((f) => !f)}
        >
          <span>Filtros{activeFilterCount > 0 && <span className="sr-only">, {activeFilterCount} activos</span>}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            {activeFilterCount > 0 && <span className="filters-count" aria-hidden="true">{activeFilterCount}</span>}
            <Icon name={filtersOpen ? "chevronUp" : "chevronDown"} size={18} />
          </span>
        </button>

        {filtersOpen && (
          <div id="panel-filtros" className="filters-body">
      <div className="filter-bar" role="group" aria-label="Filtrar por estado">
        <span className="filter-bar-label" aria-hidden="true">Estado</span>
        <button className={`filter-chip ${filterStatus === "all" ? "active" : ""}`} aria-pressed={filterStatus === "all"} onClick={() => setFilterStatus("all")}>Todos</button>
        {Object.entries(STATUSES).map(([k, st]) => (
          <button key={k} className={`filter-chip ${filterStatus === k ? "active" : ""}`} aria-pressed={filterStatus === k} onClick={() => setFilterStatus(k)}>{st.label}</button>
        ))}
      </div>
      {miembros.length > 1 && (
        <div className="filter-bar" role="group" aria-label="Filtrar por quién la lleva">
          <span className="filter-bar-label" aria-hidden="true">Lo lleva</span>
          <button className={`filter-chip ${filterPersona === "all" ? "active" : ""}`} aria-pressed={filterPersona === "all"} onClick={() => setFilterPersona("all")}>Todos</button>
          <button className={`filter-chip ${filterPersona === "mias" ? "active" : ""}`} aria-pressed={filterPersona === "mias"} onClick={() => setFilterPersona("mias")}>Mías</button>
          {miembros.filter((m) => m.userId !== yoActual()?.id).map((m) => (
            <button key={m.userId} className={`filter-chip ${filterPersona === m.userId ? "active" : ""}`} aria-pressed={filterPersona === m.userId} onClick={() => setFilterPersona(m.userId)}>{m.nombre}</button>
          ))}
        </div>
      )}
      <div className="filter-bar" role="group" aria-label="Filtrar por formato">
        <span className="filter-bar-label" aria-hidden="true">Formato</span>
        <button className={`filter-chip ${filterFormat === "all" ? "active" : ""}`} aria-pressed={filterFormat === "all"} onClick={() => setFilterFormat("all")}>Todos</button>
        {Object.entries(FORMATS).map(([k, f]) => (
          <button key={k} className={`filter-chip ${filterFormat === k ? "active" : ""}`} aria-pressed={filterFormat === k} onClick={() => setFilterFormat(k)}>
            <Icon name={FORMAT_ICONS[k]} size={14} /> {f.label}
          </button>
        ))}
      </div>
      {weeks.length > 1 && (
        <div className="filter-bar" role="group" aria-label="Filtrar por semana">
          <span className="filter-bar-label" aria-hidden="true">Semana</span>
          <button className={`filter-chip ${filterWeek === "all" ? "active" : ""}`} aria-pressed={filterWeek === "all"} onClick={() => setFilterWeek("all")}>Todas</button>
          {weeks.map((w) => (
            <button key={w} className={`filter-chip ${filterWeek === String(w) ? "active" : ""}`} aria-pressed={filterWeek === String(w)} onClick={() => setFilterWeek(String(w))}>
              Semana {w}
            </button>
          ))}
        </div>
      )}
      <div className="filter-bar" role="group" aria-label="Filtrar por día de la semana">
        <span className="filter-bar-label" aria-hidden="true">Día</span>
        <button className={`filter-chip ${filterDOW === "all" ? "active" : ""}`} aria-pressed={filterDOW === "all"} onClick={() => setFilterDOW("all")}>Todos</button>
        {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
          <button key={dow} className={`filter-chip ${filterDOW === String(dow) ? "active" : ""}`} aria-pressed={filterDOW === String(dow)} onClick={() => setFilterDOW(String(dow))}>
            {DAYS[dow]}
          </button>
        ))}
      </div>

            {activeFilterCount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: "var(--sp-2)" }}
                onClick={() => { setFilterStatus("all"); setFilterFormat("all"); setFilterWeek("all"); setFilterDOW("all"); }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Counter */}
      {activeFilterCount > 0 && (
        <p role="status" aria-live="polite" style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", padding: "var(--sp-1) 0 var(--sp-2)" }}>
          Mostrando {filteredDays.reduce((a, d) => a + d.posts.length, 0)} de {totalPosts} publicaciones
        </p>
      )}

      {/* Bulk selection toolbar */}
      {selectionMode && (
        <div className="notice" style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", background: "var(--accent-soft)", border: "1px solid var(--accent-line)", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>
            {selectedPosts.size > 0
              ? `${selectedPosts.size} seleccionada${selectedPosts.size > 1 ? "s" : ""}`
              : "Selecciona publicaciones"}
          </span>
          <span style={{ display: "flex", gap: "var(--sp-2)" }}>
            {selectedPosts.size > 0 && (
              <button type="button" className="btn btn-danger btn-sm" onClick={bulkDelete}>
                <Icon name="trash" size={14} /> Eliminar
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelectionMode(false); setSelectedPosts(new Set()); }}>
              Cancelar
            </button>
          </span>
        </div>
      )}

      {/* Undo toast */}
      {undoVisible && (
        <div className="notice notice-ok" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "fixed", bottom: "calc(var(--sp-5) + var(--safe-bottom))", left: "50%", transform: "translateX(-50%)", zIndex: 100, minWidth: 280, maxWidth: 420, boxShadow: "var(--elev-2)" }}>
          <span style={{ fontSize: "var(--fs-xs)" }}>Publicaciones eliminadas</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={undoLastAction}>
            <Icon name="undo" size={14} /> Deshacer
          </button>
        </div>
      )}

      {/* Incomplete posts warning */}
      {incompleteInfo && (
        <div className="notice notice-warn notice-action" role="alert">
          <span style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}><Icon name="alert" size={18} /> {incompleteInfo.count} publicaciones quedaron sin generar</span>
          <button className="btn btn-secondary btn-sm" onClick={retryIncomplete} disabled={genLoading}>
            Reintentar
          </button>
        </div>
      )}

      {/* Approval sync status */}
      {syncStatus && (
        <p role="status" aria-live="polite" className="notice notice-ok">
          {syncStatus}
        </p>
      )}

      {/* Calendar + Ideas Bank layout */}
      <div className={`cal-layout${capa === "banco" ? " bank-visible" : ""}`}>
      <div className="cal-layout-main">
      {/* Grid view */}
      {viewMode === "grid" ? (
        <MonthGrid
          cal={{ ...cal, days: filteredDays }}
          cola={cola}
          miembros={miembros}
          onPostClick={(post, day) => setSidePanel({ post, day })}
          onMove={movePost}
          onAddPost={(date) => setAddingPostDay(date)}
          onDropFromBank={moveBankToCalendar}
          ideasBank={banco.ideas}
          semana={semanaPlan}
          onEditarPlan={puedeEditarPlan ? (dow) => { setDiaPlan(dow); abrirCapa("plan"); } : undefined}
          vecinos={vecinos}
          onVecina={(calVecino, post) => onAbrirVecina?.(calVecino, post.id)}
          fechas={fechasDia}
          conceptos={conceptos}
          onEditarSemana={yoActual()?.soloLectura ? undefined : () => abrirMeta("weeks")}
        />
      ) : (
        /* List view: por semanas plegables (lib/semanas.js). Antes eran los
           treinta días seguidos, interminable en el teléfono. */
        (() => {
          const grupos = agruparPorSemana(filteredDays);
          const porDefecto = filterWeek !== "all"
            ? new Set(grupos.map((g) => g.numero))
            : new Set([semanaInicial(grupos, fechaEnZona())]);
          const abiertas = semanasAbiertas ?? porDefecto;
          const todas = grupos.length > 0 && grupos.every((g) => abiertas.has(g.numero));
          const alternar = (n) => setSemanasAbiertas(() => {
            const siguiente = new Set(abiertas);
            if (siguiente.has(n)) siguiente.delete(n); else siguiente.add(n);
            return siguiente;
          });
          const hoy = fechaEnZona();
          const tarjetaDia = (day) => {
            const isExpanded = expandedDay === day.date;
            return (
              <div key={day.date}>
                <div className="card">
                  {/* Antes era un <div onClick>: no recibía foco ni respondía a
                      Enter/Espacio. Ahora es un botón con aria-expanded. */}
                  <button
                    type="button"
                    className="day-row"
                    aria-expanded={isExpanded}
                    aria-controls={`dia-${day.date}`}
                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                  >
                    <span className="day-date" style={{ background: client.primaryColor || "var(--accent)", color: "#fff" }}>
                      <span className="day-date-dow">{(day.dayName || "").slice(0, 3).toUpperCase()}</span>
                      <span className="day-date-num">{(day.date || "").split("-")[2]}</span>
                    </span>

                    <span className="day-info">
                      <span className="day-title">
                        {day.dayName}
                        {(fechasDia.get(day.date) ?? (day.specialDate ? [{ nombre: day.specialDate }] : [])).map((f) => (
                          <span key={f.nombre} style={{ color: "var(--accent-alt)", marginLeft: "var(--sp-2)", fontSize: "var(--fs-2xs)" }}>{f.nombre}</span>
                        ))}
                      </span>
                      {day.concept && <span className="day-concept">{day.concept}</span>}
                    </span>

                    {/* En pantalla ancha estos chips se van a la derecha y
                        llenan el hueco que dejaba la fila. */}
                    <span className="day-chips">
                      {(day.posts || []).length === 0 ? (
                        <span className="day-empty">Sin publicaciones</span>
                      ) : (
                        sortedPosts(day.posts).map((p) => {
                          const f = FORMATS[p.format] || FORMATS.post;
                          const st = STATUSES[p.status || "pending"];
                          return (
                            <span
                              key={p.id}
                              className="badge"
                              style={{ background: f.color + "1F", color: f.color, border: `1px solid ${f.color}55` }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.text, flexShrink: 0 }} aria-hidden="true" />
                              <Icon name={FORMAT_ICONS[p.format] || "formatPost"} size={13} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.title || f.label}
                              </span>
                            </span>
                          );
                        })
                      )}
                    </span>

                    <Icon name={isExpanded ? "chevronUp" : "chevronDown"} size={18} style={{ color: "var(--text-faint)" }} />
                  </button>
                  {isExpanded && (
                    <div id={`dia-${day.date}`} style={{ padding: "0 var(--sp-3) var(--sp-3)", borderTop: "1px solid var(--border)" }}>
                      {sortedPosts(day.posts).map((post) => {
                        const f = FORMATS[post.format] || FORMATS.post;
                        const st = STATUSES[post.status || "pending"];
                        const isPublished = post.status === "published";
                        const isSelected = selectedPosts.has(post.id);
                        const postTitle = post.title || post.idea || f.label;
                        const imgName = post.image && typeof post.image === "string" && post.image.startsWith("/api/media/")
                          ? decodeURIComponent(post.image.split("/").pop().replace(/\.[^.]+$/, ""))
                          : null;
                        return (
                          <article
                            key={post.id}
                            aria-label={`${f.label}: ${postTitle}`}
                            style={{
                              background: isPublished ? st.bg : isSelected ? "var(--accent-soft)" : "var(--bg)",
                              borderRadius: "var(--radius-sm)",
                              marginTop: "var(--sp-3)",
                              border: isSelected ? "2px solid var(--accent)" : isPublished ? `2px solid ${st.border}` : `1px solid ${st.border}66`,
                              padding: "var(--sp-3)",
                            }}
                            draggable={!selectionMode}
                            onDragStart={(e) => { if (selectionMode) { e.preventDefault(); return; } e.dataTransfer.setData("text/plain", JSON.stringify({ postId: post.id, sourceDate: day.date })); }}
                            onClick={selectionMode ? () => togglePostSelection(post.id) : undefined}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)", flexWrap: "wrap" }}>
                              {selectionMode && (
                                <button type="button" aria-label={isSelected ? "Deseleccionar" : "Seleccionar"} onClick={(e) => { e.stopPropagation(); togglePostSelection(post.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: isSelected ? "var(--accent)" : "var(--text-dim)" }}>
                                  <Icon name={isSelected ? "checkSquare" : "square"} size={18} />
                                </button>
                              )}
                              <Icon name={FORMAT_ICONS[post.format] || "formatPost"} size={18} style={{ color: f.color }} />
                              <span className="badge" style={{ background: f.color + "22", color: f.color }}>{f.label}</span>
                              <span className="badge" style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>{st.label}</span>
                              {(() => {
                                const enCola = resumenCola(cola, post.id);
                                return enCola && (
                                  <span className="badge badge-cola" data-estado={enCola.estado}>
                                    <Icon name={enCola.icono} size={12} /> {enCola.texto}
                                  </span>
                                );
                              })()}
                              {post.publishTime && (
                                <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
                                  <Icon name="clock" size={14} /> {fmt12h(post.publishTime)}
                                </span>
                              )}
                              <span style={{ flex: 1 }} />
                              <button
                                type="button"
                                className={`btn btn-sm ${isPublished ? "btn-accent" : "btn-ghost"}`}
                                style={{ padding: "2px 8px", fontSize: "var(--fs-3xs)", minHeight: 28 }}
                                aria-label={isPublished ? "Desmarcar como publicado" : "Marcar como publicado"}
                                title={isPublished ? "Desmarcar publicado" : "Marcar publicado"}
                                onClick={(e) => { e.stopPropagation(); togglePublished(day.date, post); }}
                              >
                                <Icon name="rocket" size={14} />
                              </button>
                            </div>

                            {post.title && <p style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-1)" }}>{post.title}</p>}
                            {post.image && !post.title && !post.idea && !post.guion && !post.descripcion && !post.script && (
                              <span className="badge" style={{ background: "#2a1a0a", color: "var(--accent-alt)", border: "1px solid var(--alt-line)" }}>Solo imagen</span>
                            )}
                            {post.idea && <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", lineHeight: "var(--lh-normal)", marginBottom: "var(--sp-1)" }}>{post.idea}</p>}

                            <ContentDisplay post={post} />
                            {post.image && (
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                                <img src={post.image} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: "var(--radius-xs)" }} />
                                {imgName && <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{imgName}</span>}
                              </div>
                            )}

                            {!post.guion && !post.descripcion && !post.script && (
                              <button
                                type="button"
                                className="btn-ai"
                                style={{ marginTop: "var(--sp-2)" }}
                                onClick={() => generateSinglePostContent(post, day)}
                                disabled={genSingleLoading[post.id]}
                              >
                                {genSingleLoading[post.id] ? "Generando…" : <><Icon name="sparkles" size={14} /> Generar con IA</>}
                              </button>
                            )}

                            {!selectionMode && (
                            <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ flex: 1 }}
                                onClick={() => setSidePanel({ post, day })}
                              >
                                Editar publicación
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-label="Enviar al banco de ideas"
                                onClick={() => { addToBank(post, day.date); removePostFromDay(day.date, post.id); }}
                              >
                                <Icon name="bulb" size={16} />
                              </button>
                              <button
                                type="button"
                                className="btn-remove"
                                aria-label={`Eliminar publicación: ${postTitle}`}
                                onClick={() => deletePost(day.date, post.id)}
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </div>
                            )}
                          </article>
                        );
                      })}
                      {/* Add post button */}
                      {addingPostDay === day.date ? (
                        <ElegirNuevaPublicacion
                          onElegir={(pestana) => addPost(day.date, pestana)}
                          onCancel={() => setAddingPostDay(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="btn-dashed"
                          style={{ marginTop: "var(--sp-2)" }}
                          onClick={() => setAddingPostDay(day.date)}
                        >
                          + Agregar publicación
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          };
          return (
            <div className="semanas-lista">
              {grupos.length > 1 && (
                <div className="semanas-barra">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSemanasAbiertas(todas ? new Set() : new Set(grupos.map((g) => g.numero)))}
                  >
                    <Icon name={todas ? "chevronUp" : "chevronDown"} size={16} /> {todas ? "Plegar todas" : "Abrir todas"}
                  </button>
                </div>
              )}
              {grupos.map((g) => {
                const abierta = abiertas.has(g.numero);
                const esHoy = g.desde <= hoy && hoy <= g.hasta;
                const pct = g.total ? Math.round((g.aprobadas / g.total) * 100) : 0;
                return (
                  <section key={g.numero} className="semana" data-abierta={abierta || undefined} data-hoy={esHoy || undefined} aria-labelledby={`semana-t-${g.numero}`}>
                    <button
                      type="button"
                      id={`semana-t-${g.numero}`}
                      className="semana-cabecera"
                      aria-expanded={abierta}
                      aria-controls={`semana-${g.numero}`}
                      onClick={() => alternar(g.numero)}
                    >
                      <span className="semana-titulo">
                        <span className="semana-num">Semana {g.numero}</span>
                        <span className="semana-rango">{rangoSemana(g.desde, g.hasta)}</span>
                        {esHoy && <span className="semana-hoy">Esta semana</span>}
                      </span>
                      {g.concepto && <span className="semana-concepto">{g.concepto}</span>}
                      <span className="semana-resumen">
                        <span>{g.total} {g.total === 1 ? "publicación" : "publicaciones"}</span>
                        {g.total > 0 && <span className="semana-ok">{g.aprobadas} aprobadas</span>}
                        {g.cambios > 0 && <span className="semana-cambios">{g.cambios} con cambios</span>}
                        {g.pendientes > 0 && <span>{g.pendientes} por aprobar</span>}
                      </span>
                      {g.total > 0 && (
                        <span className="semana-barra-avance" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                      )}
                      <Icon name={abierta ? "chevronUp" : "chevronDown"} size={18} className="semana-flecha" />
                    </button>
                    {abierta && (
                      <div id={`semana-${g.numero}`} className="semana-dias">
                        {g.dias.map(tarjetaDia)}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          );
        })()
      )}

      {/* Add post inline for grid view */}
      {addingPostDay && viewMode === "grid" && (
        <AddPostDialog
          date={addingPostDay}
          onElegir={(pestana) => addPost(addingPostDay, pestana)}
          onClose={() => setAddingPostDay(null)}
        />
      )}
      </div>{/* end cal-layout-main */}

      {/* Ideas Bank side panel */}
      {capa === "banco" && (
        <BankPanel
          banco={banco}
          client={client}
          clientes={clientes}
          calDays={cal.days}
          onRemoveFromCal={removePostFromDay}
          onClose={cerrarCapa}
          cal={cal}
          onMoveBankToCal={moveBankToCalendar}
        />
      )}
      </div>{/* end cal-layout */}

      {/* Approval link modal */}
      {capa === "aprobacion" && (
        <ApprovalDialog
          hasLink={!!cal.shareToken}
          shareEnabled={cal.shareEnabled !== false}
          working={shareWorking}
          approvalUrl={approvalUrl}
          whatsappMessage={mensajeDeEnvio({ nombre: client.name, mes: calName, url: approvalUrl, corregidas: envio.corregidas, revisado: Boolean(cal.revisionEnviada) })}
          onGenerate={sendToClient}
          onRevoke={() => changeShare(false)}
          onReopen={() => changeShare(true)}
          allowEditing={cal.allowEditing || false}
          onToggleEditing={() => onUpdateCal(calId, { ...cal, allowEditing: !cal.allowEditing })}
          opciones={cal.opciones || {}}
          onCambiarOpciones={(cambios) => onUpdateCal(calId, { ...cal, opciones: { ...(cal.opciones || {}), ...cambios } })}
          revisionEnviada={cal.revisionEnviada}
          revisionRevisor={cal.revisionRevisor}
          resumen={resumenEnvio(cal.days)}
          sinLoNecesario={sinLoNecesario(cal.days)}
          onRevisar={() => abrirCapa("revision")}
          envio={envio}
          onDisenar={() => abrirCapa("producir")}
          onClose={cerrarCapa}
        />
      )}

      {capa === "revision" && (
        <Suspense fallback={<div className="panel-cargando" role="status">Abriendo la revisión…</div>}>
          <RevisionMes
            client={client}
            cal={cal}
            onAbrir={(postId) => {
              for (const day of cal.days ?? []) {
                const post = (day.posts ?? []).find((p) => p.id === postId);
                if (post) { cerrarCapa(); setSidePanel({ post, day }); break; }
              }
            }}
            onArreglar={(date, post) => updatePost(date, post)}
            onClose={cerrarCapa}
          />
        </Suspense>
      )}

      {capa === "producir-mes" && (
        <Suspense fallback={<div className="panel-cargando" role="status">Abriendo…</div>}>
          <ProducirElMes
            mesNombre={`${MONTHS[cal.month].toLowerCase()} ${cal.year}`}
            publicaciones={totalPosts}
            porRevisar={ideasDeRevision(cal).filter(({ post }) => porRevisar(post)).length}
            pasado={mesDelCal < fechaEnZona().slice(0, 7)}
            onCrear={() => { cerrarCapa(); producirEnLote(); }}
            onRevisar={() => abrirCapa("revisar-ideas")}
            onDisenar={() => abrirCapa("producir")}
            onClose={cerrarCapa}
          />
        </Suspense>
      )}

      {capa === "revisar-ideas" && (
        <Suspense fallback={<div className="panel-cargando" role="status">Abriendo…</div>}>
          <RevisarIdeas
            client={client}
            cal={cal}
            onAplicar={(cambiar) => onUpdateCal(calId, { ...cal, days: cambiar(cal.days || []) })}
            onClose={cerrarCapa}
          />
        </Suspense>
      )}

      {capa === "producir" && (
        <Suspense fallback={<div className="panel-cargando" role="status">Abriendo…</div>}>
          <ProducirMes
            client={client}
            cal={cal}
            onPoner={(cambiar) => {
              // Todas de una vez: poner una a una con `updatePost` partiría cada vez del calendario de antes.
              onUpdateCal(calId, { ...cal, days: (cal.days || []).map((d) => ({ ...d, posts: (d.posts || []).map(cambiar) })) });
            }}
            onClose={cerrarCapa}
          />
        </Suspense>
      )}

      {capa === "drive" && (
        <Suspense fallback={<div className="panel-cargando" role="status">Abriendo…</div>}>
          <GuardarMesDrive
            client={client}
            cal={cal}
            onPoner={(cambiar) => onUpdateCal(calId, { ...cal, days: (cal.days || []).map((d) => ({ ...d, posts: (d.posts || []).map(cambiar) })) })}
            onClose={cerrarCapa}
          />
        </Suspense>
      )}

      {/* Side panel */}
      {sidePanel && (
        <>
          <button
            type="button"
            aria-label="Cerrar panel de edición"
            onClick={() => setSidePanel(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 240, border: "none", cursor: "pointer" }}
          />
          <Suspense fallback={<div className="panel-cargando" role="status">Abriendo la publicación…</div>}>
          <PostSidePanel
            key={sidePanel.post.id}
            post={sidePanel.post}
            day={sidePanel.day}
            pestanaInicial={sidePanel.pestana ?? null}
            nueva={sidePanel.nueva ?? false}
            onDescartar={removePostFromDay}
            editandoOtros={editandoOtros}
            pulso={pulso}
            publicacion={{
              filas: cola,
              estadoRedes: redes,
              onPublicar: publicarDesdePanel,
              onCancelar: async (id) => { await cancelarPublicacion(id); recargarCola(); },
              onReintentar: async (id) => { await reintentarPublicacion(id); recargarCola(); },
            }}
            onUpdate={updatePost}
            onDelete={deletePost}
            onMoveDate={movePost}
            onDuplicar={duplicarPost}
            onSendToBank={(post, date) => { addToBank(post, date); removePostFromDay(date, post.id); }}
            onClose={() => setSidePanel(null)}
            suggestion={suggestions[sidePanel.post.id] || null}
            onAcceptSuggestion={(postId, field, value) => {
              const post = (cal.days || []).flatMap((d) => d.posts || []).find((p) => p.id === postId);
              if (post) updatePost(null, { ...post, [field]: value });
              setSuggestions((p) => {
                const n = { ...p };
                if (n[postId]) {
                  n[postId] = { ...n[postId], [field === "descripcion" ? "descripcion" : "guion"]: null };
                  if (!n[postId].descripcion && !n[postId].guion) delete n[postId];
                }
                return n;
              });
            }}
            onRejectSuggestion={(postId, field) => {
              setSuggestions((p) => {
                const n = { ...p };
                if (n[postId]) {
                  n[postId] = { ...n[postId], [field === "descripcion" ? "descripcion" : "guion"]: null };
                  if (!n[postId].descripcion && !n[postId].guion) delete n[postId];
                }
                return n;
              });
            }}
            client={client}
            cal={cal}
          />
          </Suspense>
        </>
      )}
    </div>
  );
}
