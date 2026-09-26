import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { FORMATS, FORMAT_ICONS, STATUSES, MONTHS, DAYS } from "../constants";
import { uid } from "../utils";
import { marcarActualizada } from "../lib/publicacion";
import { callAI, loadADN, parseAIResponse, buildScriptPrompt, buildDescripcionesPrompt, buildClientContext, generateSinglePost } from "../api";
import { buildExportHTML } from "../export";
import { base64DeImagen, conImagenesIncrustadas, prepararParaRedes } from "../lib/medios";
import {
  shareCalendar, setShareEnabled, fetchApprovals, subscribeApprovals, loadClientMemories,
  listarPublicaciones, publicar, cancelarPublicacion, reintentarPublicacion, estadoRedes as leerEstadoRedes,
  subirImagenPublicacion, saveCalendar, programarVarias,
} from "../lib/db";
import { resumenCola, aprobadasSinProgramar } from "../lib/cola";
import { navegar } from "../lib/rutas";
import { agruparPorSemana, semanaInicial, rangoSemana } from "../lib/semanas";
import { moverEnCalendario, ponerEnDia } from "../lib/subir";
import { fechaEnZona } from "../lib/agenda";
import { construirExportacion, FORMATOS_EXPORTABLES_POR_DEFECTO, CAMPOS_EXPORTABLES } from "../lib/exportarContenido";
import MetaPromptModal from "./MetaPromptModal";
import Icon from "./Icon";
import { useConfigIA } from "../hooks/useConfigIA";
import { etiquetaIA } from "../lib/configIA";
import { ContentDisplay, OverflowMenu } from "./calendario/primitivas";
// El panel de una publicación se carga al abrirlo: medios, publicar,
// historias y vista previa son mucho código que el mes no necesita.
const PostSidePanel = lazy(() => import("./calendario/PostSidePanel").then((m) => ({ default: m.PostSidePanel })));
const ProgramarAprobadas = lazy(() => import("./calendario/programarAprobadas"));
import { MonthGrid } from "./calendario/MonthGrid";
import { BankPanel } from "./calendario/BankPanel";
import {
  ExportContenidoDialog, ElegirNuevaPublicacion,
  EditMetaDialog, ApprovalDialog, AddPostDialog,
} from "./calendario/dialogos";
import { categoryHue, fmt12h } from "./calendario/formato";

export default function CalendarView({
  client,
  cal,
  calId,
  pulso = 0,
  editandoOtros = {},
  onUpdateCal,
  onUpdateCalLocal,
  onDeleteCal,
  onDuplicateCal,
  onUpdateClient,
  onPersistClient,
  onMoveBankToCal,
  abrirPublicacion = null,
  onPublicacionAbierta,
}) {
  // Mes por defecto, también en el móvil: es la vista que se usa. La lista
  // (por semanas) queda a un toque.
  const [viewMode, setViewMode] = useState("grid");
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
    if (!calDb) return;
    listarPublicaciones({ calendario: calDb }).then(setCola).catch(() => {});
  }, [calDb]);
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
    const ahoraISO = new Date().toISOString();
    const preparadas = new Map();
    for (const [i, r] of lista.entries()) {
      avisar(`Preparando imágenes (${i + 1} de ${lista.length})…`);
      const { post, cambio } = await prepararParaRedes(r.post, r.redes, {
        subir: (f) => subirImagenPublicacion(clienteDb, f),
        colorMarca: client?.primaryColor,
      });
      if (cambio) preparadas.set(post.id, post);
    }
    const nuevo = {
      ...cal,
      days: (cal.days || []).map((d) => ({
        ...d,
        posts: (d.posts || []).map((p) => (preparadas.has(p.id) ? marcarActualizada(p, preparadas.get(p.id), ahoraISO) : p)),
      })),
    };
    if (preparadas.size) onUpdateCal(calId, nuevo);
    avisar("Guardando el calendario…");
    await saveCalendar(nuevo, clienteDb);
    avisar("Programando…");
    const r = await programarVarias(calDb, lista.map((x) => x.post.id));
    recargarCola();
    const titulo = (id) => {
      const p = lista.find((x) => x.post.id === id)?.post;
      return p?.title || p?.idea || "Publicación";
    };
    return {
      programadas: r?.programadas?.length ?? 0,
      fallidas: (r?.fallidas ?? []).map((f) => ({ ...f, titulo: titulo(f.postId) })),
    };
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
  const [filterWeek, setFilterWeek] = useState("all");
  // La lista va por semanas plegables. null = lo de entrada (sólo la
  // semana de hoy abierta); en cuanto alguien abre o cierra, es un Set.
  const [semanasAbiertas, setSemanasAbiertas] = useState(null);
  useEffect(() => { setSemanasAbiertas(null); }, [calId]);
  const [filterDOW, setFilterDOW] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(cal.name || (MONTHS[cal.month] + " " + cal.year));
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
            posts: (d.posts || []).map((p) => {
              const review = approvals[p.id];
              if (!review) return p;
              return {
                ...p,
                // «Publicada» no la pisa una aprobación: ya salió.
                status: p.status === "published" ? p.status
                  : review.estado === "aprobado" ? "approved"
                    : review.estado === "cambios" ? "rejected"
                      : p.status,
                // El comentario del cliente ya NO se copia a la nota
                // interna: vive en la conversación de la publicación, y
                // mezclarlos pisaba lo que la agencia había escrito.
              };
            }),
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

  const ideasBank = client.ideasBank || [];

  const addToBank = (post, sourceDate) => {
    const bankPost = { ...post, id: uid(), _originDate: sourceDate, _originCal: calId, _addedAt: new Date().toISOString() };
    onUpdateClient({ ...client, ideasBank: [...ideasBank, bankPost] });
  };

  const moveBankToCalendar = (bankPost, targetDate) => {
    if (onMoveBankToCal) {
      onMoveBankToCal(bankPost, targetDate);
      return;
    }
    const newPost = { ...bankPost, id: uid(), status: "pending" };
    delete newPost._originDate;
    delete newPost._originCal;
    delete newPost._addedAt;
    const newDays = (cal.days || []).map((d) =>
      d.date !== targetDate ? d : { ...d, posts: [...(d.posts || []), newPost] }
    );
    onUpdateCal(calId, { ...cal, days: newDays });
    onUpdateClient({ ...client, ideasBank: ideasBank.filter((p) => p.id !== bankPost.id) });
  };

  const calName = cal.name || (MONTHS[cal.month] + " " + cal.year);
  const approvalUrl = cal.shareToken
    ? `${window.location.origin}/aprobar?t=${encodeURIComponent(cal.shareToken)}`
    : "";
  const totalPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).length, 0);
  const approvedPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).filter((p) => p.status === "approved" || p.status === "published").length, 0);
  const publishedPosts = (cal.days || []).reduce((a, d) => a + (d.posts || []).filter((p) => p.status === "published").length, 0);

  const weeks = [...new Set((cal.days || []).map((d) => d.weekNumber || 1))].sort((a, b) => a - b);
  const activeFilterCount = [filterStatus, filterFormat, filterWeek, filterDOW].filter((f) => f !== "all").length;
  const approvalPct = totalPosts > 0 ? Math.round((approvedPosts / totalPosts) * 100) : 0;
  const monthLabel = `${MONTHS[cal.month]} ${cal.year}`;
  const calSubtitle = [calName === monthLabel ? null : monthLabel, cal.campaign]
    .filter(Boolean)
    .join(" · ");

  const filteredDays = (cal.days || []).map((day) => ({
    ...day,
    posts: (day.posts || []).filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterFormat !== "all" && p.format !== filterFormat) return false;
      return true;
    }),
  })).filter((day) => {
    if (filterWeek !== "all" && String(day.weekNumber) !== filterWeek) return false;
    if (filterDOW !== "all") {
      const dow = new Date(day.date + "T12:00:00").getDay();
      if (String(dow) !== filterDOW) return false;
    }
    return day.posts.length > 0 || (filterStatus === "all" && filterFormat === "all");
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

        const promptText = buildScriptPrompt(client, cal, batch, adnExtra, mems2);
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
          return { ...p, guion: result.guion || p.guion, descripcion: result.descripcion || p.descripcion, hashtagsFinales: result.hashtagsFinales || p.hashtagsFinales, script: result.descripcion || result.guion || p.script };
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

  const saveMetaEdit = () => {
    const updatedConcepts = metaForm.weekConcepts;
    const cats = metaForm.dayCategories || {};
    const newDays = (cal.days || []).map((d) => {
      const dow = new Date(d.date + "T12:00:00").getDay();
      return {
        ...d,
        concept: updatedConcepts[(d.weekNumber || 1) - 1] || d.concept || "",
        category: cats[dow] !== undefined ? cats[dow] : d.category || "",
      };
    });
    onUpdateCal(calId, {
      ...cal,
      name: metaForm.name || calName,
      campaign: metaForm.campaign,
      weekConcepts: updatedConcepts,
      offers: metaForm.offers || "",
      promoCode: metaForm.promoCode || "",
      visualReferences: metaForm.visualReferences || [],
      days: newDays,
    });
    cerrarCapa();
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
      const sinIdea = currentDays.flatMap((d) =>
        (d.posts || []).filter((p) => !(p.idea || "").trim()).map((p) => ({
          ...p, _date: d.date, _dayName: d.dayName, _weekNumber: d.weekNumber, _concept: d.concept,
        }))
      );

      if (sinIdea.length) {
        addDebug(`Fase 1: ${sinIdea.length} posts sin idea`);
        const ctx = buildClientContext(client, cal, adnExtra);
        let ideasResults = {};

        for (let i = 0; i < sinIdea.length; i += BATCH) {
          const batch = sinIdea.slice(i, i + BATCH);
          setGenStatus(`Fase 1 — Ideas ${i + 1}-${Math.min(i + BATCH, sinIdea.length)} de ${sinIdea.length}…`);
          setGenProgress(Math.round((i / sinIdea.length) * 25));

          const prompt = `${ctx}

CAMPAÑA: ${cal.campaign || "N/A"}
${cal.offers ? `OFERTAS: ${cal.offers}` : ""}

Genera una idea ÚNICA para cada publicación. Cada idea: 1-2 oraciones claras y accionables.

FORMATO DE RESPUESTA (respeta exactamente):
<<<PUBLICACION_ID:id>>>
IDEA:
idea aqui

PUBLICACIONES:
${batch.map((p) => `<<<PUBLICACION_ID:${p.id}>>>\nFORMATO: ${p.format}\nDIA: ${p._date} (${p._dayName || ""})\nCATEGORIA: ${p.category || "N/A"}\nSEMANA: ${p._weekNumber || ""} — ${p._concept || "libre"}`).join("\n\n")}`;

          const res = await callAI([{ type: "text", text: prompt }], { maxTokens: 4000, tolerarCorte: true, funcion: "guiones", clienteId: client?.id });
          const txt = typeof res === "string" ? res : res.texto;
          const parsed = parseAIResponse(txt);
          ideasResults = { ...ideasResults, ...parsed };
          addDebug(`Fase 1 batch: ${Object.keys(parsed).length} ideas`);
        }

        currentDays = currentDays.map((d) => ({
          ...d,
          posts: (d.posts || []).map((p) => {
            const r = ideasResults[p.id];
            if (!r?.idea) return p;
            return { ...p, idea: p.idea || r.idea };
          }),
        }));
        onUpdateCal(calId, { ...cal, days: currentDays });
        addDebug(`Fase 1 completa: ${Object.keys(ideasResults).length} ideas generadas`);
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

          const promptText = buildScriptPrompt(client, cal, batch, adnExtra, memories);
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

          const promptText = buildDescripcionesPrompt(client, cal, batch, adnExtra, memories);
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

  const exportHTML = async () => {
    const html = buildExportHTML(client, await conImagenesIncrustadas(cal));
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (calName).replace(/\s+/g, "-") + "-" + client.name.replace(/\s+/g, "-") + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  const exportPDF = () => {
    const s = document.createElement("style");
    s.id = "print-style";
    s.textContent = "@media print{header,button,.no-print{display:none!important}body,html{background:var(--bg)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}";
    document.head.appendChild(s);
    window.print();
    setTimeout(() => document.getElementById("print-style")?.remove(), 2000);
  };

  return (
    <div style={{ paddingBottom: sidePanel ? 0 : 80 }}>
      {/* Rename inline */}
      {renaming && (
        <div className="field">
          <label className="label" htmlFor="cal-rename">Nombre del calendario</label>
          <input
            id="cal-rename"
            className="input"
            style={{ fontWeight: 700 }}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            autoFocus
            onBlur={() => { onUpdateCal(calId, { ...cal, name: nameVal }); setRenaming(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onUpdateCal(calId, { ...cal, name: nameVal }); setRenaming(false); }
              if (e.key === "Escape") { setNameVal(calName); setRenaming(false); }
            }}
          />
        </div>
      )}

      {/* Edit calendar meta modal */}
      {capa === "meta" && <EditMetaDialog metaForm={metaForm} setMetaForm={setMetaForm} onSave={saveMetaEdit} onClose={cerrarCapa} />}

      {capa === "promptMeta" && (
        <MetaPromptModal
          client={client}
          cal={cal}
          onClose={cerrarCapa}
          onPersistClient={(actualizado) => {
            onUpdateClient?.(actualizado);
            onPersistClient?.(actualizado);
          }}
        />
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

      {/* Identidad del calendario: una línea, no un banner de 90px.
          El mes y el año sólo se muestran si el nombre del calendario no
          los dice ya; si no, se leía «Agosto 2026 · Agosto 2026». */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
        <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: 700, letterSpacing: "-.01em" }}>{calName}</h2>
        {calSubtitle && (
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>{calSubtitle}</span>
        )}
      </div>

      {/* Estadísticas: una tira de una línea. Antes eran cuatro cajas de
          490×110px con bordes de cuatro colores sin significado. */}
      <div className="stat-strip">
        <div className="stat-item">
          <span className="stat-num">{totalPosts}</span>
          <span className="stat-name">publicaciones</span>
        </div>
        <span className="stat-divider" aria-hidden="true" />
        <div className="stat-item">
          <span className="stat-num" style={{ color: "var(--success)" }}>{approvedPosts}</span>
          <span className="stat-name">aprobadas</span>
        </div>
        {publishedPosts > 0 && (
          <>
            <span className="stat-divider" aria-hidden="true" />
            <div className="stat-item">
              <span className="stat-num" style={{ color: "var(--purple)" }}>{publishedPosts}</span>
              <span className="stat-name">publicadas</span>
            </div>
          </>
        )}
        {totalPosts > 0 && (
          <div className="stat-progress">
            <div
              className="progress-bar"
              style={{ flex: 1 }}
              role="progressbar"
              aria-label="Progreso de aprobación"
              aria-valuenow={approvalPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="progress-fill" style={{ width: `${approvalPct}%` }} />
            </div>
            <span className="stat-name" style={{ fontVariantNumeric: "tabular-nums" }}>{approvalPct}%</span>
          </div>
        )}
      </div>

      {/* Barra de herramientas: acción primaria, conmutador de vista y el
          resto agrupado. Antes eran siete botones idénticos que mezclaban
          la acción principal con un visor de registros de desarrollo. */}
      <div className="toolbar">
        <button className="btn btn-accent" onClick={generateScripts} disabled={genLoading}>
          <Icon name="sparkles" size={18} />
          {genLoading ? genStatus : "Generar contenido"}
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

        <button className="btn btn-primary" onClick={sendToClient}>
          <Icon name="send" size={18} /> Enviar al cliente
        </button>

        <OverflowMenu
          items={[
            { icon: "pencil", label: "Editar calendario", onClick: () => {
              const cats = {};
              for (const day of cal.days || []) {
                if (!day.category) continue;
                const dow = new Date(day.date + "T12:00:00").getDay();
                if (!cats[dow]) cats[dow] = day.category;
              }
              setMetaForm({ name: cal.name || "", campaign: cal.campaign || "", weekConcepts: [...(cal.weekConcepts || [])], dayCategories: cats, offers: cal.offers || "", promoCode: cal.promoCode || "", visualReferences: (cal.visualReferences || []).map((r) => r.format ? r : { ...r, format: "post" }) });
              abrirCapa("meta");
            } },
            { icon: "file", label: "Renombrar calendario", onClick: () => setRenaming(true) },
            { icon: "copy", label: "Duplicar calendario", onClick: () => onDuplicateCal(calId) },
            { sep: true },
            { icon: "download", label: "Exportar a HTML", onClick: exportHTML },
            { icon: "file", label: "Imprimir o guardar en PDF", onClick: exportPDF },
            { icon: "copy", label: "Exportar ideas y descripciones", onClick: () => abrirCapa("exportar") },
            { icon: "sparkles", label: "Prompt maestro para Meta AI", onClick: () => abrirCapa("promptMeta") },
            { sep: true },
            { icon: "terminal", label: capa === "diagnostico" ? "Ocultar diagnóstico" : "Ver diagnóstico", onClick: () => setCapa((c) => (c === "diagnostico" ? null : "diagnostico")) },
            { icon: "trash", label: "Eliminar calendario", danger: true, onClick: () => {
              if (window.confirm("¿Eliminar este calendario? Esta acción no se puede deshacer.")) onDeleteCal(calId);
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
              title="Cuando el cliente aprueba una publicación, entra sola en la cola a su día y hora"
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
          onPostClick={(post, day) => setSidePanel({ post, day })}
          onMove={movePost}
          onAddPost={(date) => setAddingPostDay(date)}
          onDropFromBank={moveBankToCalendar}
          ideasBank={ideasBank}
          dayLabels={cal.dayLabels || {}}
          onUpdateDayLabel={(dow, value) => {
            const updated = { ...(cal.dayLabels || {}), [dow]: value };
            onUpdateCal(calId, { ...cal, dayLabels: updated });
          }}
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
                        {day.category || day.dayName}
                        {day.specialDate && <span style={{ color: "var(--accent-alt)", marginLeft: "var(--sp-2)", fontSize: "var(--fs-2xs)" }}>{day.specialDate}</span>}
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
                          const pCat = p.category || day.category || "";
                          const pHue = pCat ? categoryHue(pCat) : 0;
                          return (
                            <span
                              key={p.id}
                              className="badge"
                              style={pCat ? {
                                background: `hsl(${pHue} 60% 25% / .35)`,
                                color: `hsl(${pHue} 70% 75%)`,
                                border: `1px solid hsl(${pHue} 55% 50% / .5)`,
                              } : {
                                background: f.color + "1F", color: f.color, border: `1px solid ${f.color}55`,
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.text, flexShrink: 0 }} aria-hidden="true" />
                              <Icon name={FORMAT_ICONS[p.format] || "formatPost"} size={13} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.title || pCat || f.label}
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
                        const postTitle = post.title || post.idea || post.category || f.label;
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

                            {post.category && <p style={{ fontSize: "var(--fs-2xs)", color: "var(--accent-alt)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>{post.category}</p>}
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
          client={client}
          onUpdateClient={onUpdateClient}
          calDays={cal.days}
          onRemoveFromCal={removePostFromDay}
          onClose={cerrarCapa}
          cal={cal}
          calId={calId}
          onUpdateCal={onUpdateCal}
          onMoveBankToCal={onMoveBankToCal}
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
          whatsappMessage={`Hola${client.name ? " " + client.name : ""}, aquí está el calendario de ${calName} para tu revisión:\n${approvalUrl}\nPuedes aprobar o pedir cambios directamente desde tu celular.`}
          onGenerate={sendToClient}
          onRevoke={() => changeShare(false)}
          onReopen={() => changeShare(true)}
          allowEditing={cal.allowEditing || false}
          onToggleEditing={() => onUpdateCal(calId, { ...cal, allowEditing: !cal.allowEditing })}
          opciones={cal.opciones || {}}
          onCambiarOpciones={(cambios) => onUpdateCal(calId, { ...cal, opciones: { ...(cal.opciones || {}), ...cambios } })}
          revisionEnviada={cal.revisionEnviada}
          revisionRevisor={cal.revisionRevisor}
          onClose={cerrarCapa}
        />
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
