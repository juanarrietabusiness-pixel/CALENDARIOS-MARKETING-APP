import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { MONTHS } from "./constants";
import { uid } from "./utils";
import { useDialogA11y } from "./hooks/useDialogA11y";
import Icon from "./components/Icon";
// Importado (no ruta absoluta) para que Vite le ponga hash y respete la
// base del despliegue: el sitio también se publica bajo un subdirectorio.
import logoMark from "./assets/logo-mark.png";
import CalendarView from "./components/CalendarView";
import QuickTasksPanel from "./components/QuickTasksPanel";
import ResumenCliente from "./components/ResumenCliente";
import NavPrincipal from "./components/NavPrincipal";
import MenuCuenta from "./components/MenuCuenta";
import MedidorIA from "./components/MedidorIA";
import BarraInferior from "./components/BarraInferior";
import Login from "./pages/Login";
import Invitacion from "./pages/Invitacion";
import Presencia, { PresenciaEnCliente } from "./components/Presencia";
import { useSession, signOut } from "./lib/auth";
import * as db from "./lib/db";
import { rowToCalendar, rowToClient } from "./lib/filas";
import { vivo } from "./lib/vivo";
import { leerFoco, guardarFoco } from "./lib/foco";
import { fechaEnZona } from "./lib/agenda";
import { calendarioPorDefecto, resumenCalendario } from "./lib/resumenCliente";
import {
  analizarRuta, construirRuta, navegar,
  porRuta, slugsDeCalendarios, slugsDeClientes,
} from "./lib/rutas";

// El asistente sólo se descarga al abrirlo: es la pantalla más pesada y
// la mayoría de las visitas no la abren.
const ChatPanel = lazy(() => import("./components/ChatPanel"));
// «Mi día» es una página aparte: no tiene por qué venir en la primera descarga.
const Tareas = lazy(() => import("./pages/Tareas"));
// Igual Equipo y Ajustes, que no se abren en cada visita.
const Equipo = lazy(() => import("./pages/Equipo"));
const Ajustes = lazy(() => import("./pages/Ajustes"));
const Resultados = lazy(() => import("./pages/Resultados"));
const Programacion = lazy(() => import("./pages/Programacion"));
const ResumenAgencia = lazy(() => import("./pages/Resultados").then((m) => ({ default: m.ResumenAgencia })));
// Lo que sólo se abre a demanda —diálogos, pestañas que no son el
// calendario, la página del cliente final— tampoco va en la primera
// descarga: con Drive, el buscador y Ajustes, el inicial pasaba de 170 kB.
const ClientModal = lazy(() => import("./components/ClientModal"));
const PlanWizard = lazy(() => import("./components/PlanWizard"));
const Aprobar = lazy(() => import("./pages/Aprobar"));
const Informe = lazy(() => import("./pages/Informe"));
const IdeasBank = lazy(() => import("./components/IdeasBank"));
const TaskPanel = lazy(() => import("./components/TaskPanel"));
const PestanaContenido = lazy(() => import("./components/PestanaContenido"));
const FichaCliente = lazy(() => import("./components/FichaCliente"));
const Buscador = lazy(() => import("./components/Buscador"));

const Cargando = () => <p role="status" style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando…</p>;

const NOMBRE_RED = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

/** Las pestañas de un cliente: [id, nombre, icono]. El id va en la dirección. */
const PESTANAS = [
  ["calendario", "Calendario", "calendar"],
  ["tareas", "Tareas", "clipboardCheck"],
  ["contenido", "Contenido", "cloud"],
  ["ideas", "Ideas", "bulb"],
  ["resultados", "Resultados", "chart"],
  ["ficha", "Ficha", "building"],
];

/** Pantalla ancha: donde el asistente cabe al lado del contenido. */
function useAnchoAmplio(minimo = 1280) {
  const consulta = `(min-width: ${minimo}px)`;
  const [amplio, setAmplio] = useState(() => window.matchMedia?.(consulta).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(consulta);
    if (!mq) return;
    const alCambiar = () => setAmplio(mq.matches);
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [consulta]);
  return amplio;
}

/**
 * La dirección actual, y se vuelve a pintar cuando cambia.
 *
 * `popstate` lo dispara el navegador al pulsar atrás y lo dispara
 * `navegar()` a mano cuando el cambio lo hace la aplicación: `pushState`
 * NO lo lanza solo, y sin ese aviso la barra de direcciones cambiaría y
 * la pantalla no.
 */
function useRuta() {
  const [ruta, setRuta] = useState(analizarRuta);
  useEffect(() => {
    const alCambiar = () => setRuta(analizarRuta());
    window.addEventListener("popstate", alCambiar);
    return () => window.removeEventListener("popstate", alCambiar);
  }, []);
  return ruta;
}

/**
 * Enrutador.
 *
 * Los hooks van todos ANTES del primer `return`: llamarlos después de
 * una rama condicional rompe la regla de los hooks, y oxlint lo marca
 * como error. Por eso el enrutado (App), la puerta de acceso (Panel) y
 * el estado (Workspace) siguen siendo tres componentes y no uno.
 */
function App() {
  const ruta = useRuta();
  // La página de aprobación es la del cliente final: ni sesión, ni
  // panel, ni nada de lo que cuelga de Panel.
  if (ruta.vista === "aprobar") return <Suspense fallback={<Aviso>Cargando…</Aviso>}><Aprobar /></Suspense>;
  // El informe mensual que abre el cliente, igual: sin sesión.
  if (ruta.vista === "informe") return <Suspense fallback={<Aviso>Cargando…</Aviso>}><Informe /></Suspense>;
  return <Panel ruta={ruta} />;
}

/** Pantalla centrada de una sola línea. Se usa al cargar y al fallar. */
function Aviso({ children, tono = "status" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: "var(--sp-5)" }}>
      <p role={tono} style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)", maxWidth: 420, textAlign: "center" }}>
        {children}
      </p>
    </div>
  );
}

/**
 * Puerta de acceso. Todos los hooks se llaman antes de cualquier
 * `return`, así que las ramas no alteran su orden.
 */
function Panel({ ruta }) {
  const { session, loading, setSession } = useSession();

  // Ya no hay puerta de configuración. Con Supabase, `isSupabaseEnabled`
  // era una constante de compilación: sin las VITE_*, Vite la plegaba a
  // false y rollup borraba el panel entero del bundle. La API vive ahora
  // en el mismo origen que la aplicación, así que no hay variable que
  // pueda faltar ni media aplicación que pueda compilarse por descuido.

  // La invitación va ANTES de mirar la sesión: quien abre ese enlace no
  // tiene cuenta todavía, que es precisamente para lo que se le manda.
  if (ruta.vista === "invitacion") return <Invitacion onAcceso={setSession} />;

  if (loading) return <Aviso>Cargando…</Aviso>;
  // `setSession` es el arreglo del fallo de acceso: sin pasárselo a
  // Login, entrar dejaba la cookie puesta y la pantalla quieta. Ver
  // src/lib/auth.js.
  if (!session) return <Login onAcceso={setSession} />;
  return <Workspace session={session} ruta={ruta} />;
}

/** Lista de clientes. Se reutiliza en la barra fija y en el cajón móvil. */
function ClientList({ clients, selectedClientId, onSelect, onNew, presentes = [], yo }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-3)" }}>
        <h2 className="label" style={{ margin: 0 }}>Clientes</h2>
        <button className="btn btn-secondary btn-sm" onClick={onNew}>
          <Icon name="plus" size={16} /> Nuevo
        </button>
      </div>

      {clients.length === 0 ? (
        <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-faint)", padding: "var(--sp-4) 0", textAlign: "center" }}>
          Sin clientes aún
        </p>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
          {clients.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="client-item"
                aria-current={selectedClientId === c.id ? "true" : undefined}
                onClick={() => onSelect(c.id)}
              >
                <span className="client-avatar">
                  {c.logo ? <img src={c.logo} alt="" /> : <Icon name="building" size={18} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "var(--fs-xs)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  <span style={{ display: "block", fontSize: "var(--fs-3xs)", color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.industry || "Sin industria"} · {(c.calendars || []).length} calendario{(c.calendars || []).length === 1 ? "" : "s"}
                  </span>
                </span>
                {/* Quién del equipo está dentro de este cliente ahora
                    mismo. Verlo antes de entrar es lo que evita que dos
                    personas reescriban la misma semana. */}
                <PresenciaEnCliente presentes={presentes} clienteId={c.id} yo={yo} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Cajón del móvil (secciones y clientes): diálogo modal con foco atrapado. */
function ClientDrawer({ ruta, pulso, clients, selectedClientId, onSelect, onNew, onClose, presentes, yo }) {
  const dialogRef = useDialogA11y(onClose);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
      <button
        type="button"
        aria-label="Cerrar el menú"
        onClick={onClose}
        style={{ flex: 1, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer", backdropFilter: "blur(2px)" }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        style={{
          width: "var(--sidebar-w)",
          maxWidth: "86vw",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border-strong)",
          boxShadow: "var(--elev-2)",
          padding: "var(--sp-4) var(--sp-3)",
          paddingTop: "calc(var(--sp-4) + var(--safe-top))",
          paddingBottom: "calc(var(--sp-4) + var(--safe-bottom))",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          animation: "slideIn .24s cubic-bezier(.22,.61,.36,1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--sp-2)" }}>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar el menú">
            <Icon name="close" />
          </button>
        </div>
        <NavPrincipal ruta={ruta} pulso={pulso} onIr={onClose} />
        <div className="app-sidebar-clientes">
          <ClientList
            clients={clients}
            selectedClientId={selectedClientId}
            onSelect={onSelect}
            onNew={onNew}
            presentes={presentes}
            yo={yo}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * El inicio: las tareas rápidas y los clientes con lo que tienen
 * pendiente, para entrar donde haga falta sin buscar.
 */
function Inicio({ yo, clients, pulso, presentes, onAbrir, onNuevo }) {
  const hoy = fechaEnZona();
  const saludo = (() => {
    const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Panama" }).format(new Date()));
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  })();

  if (!clients.length) {
    return (
      <div className="empty-state" style={{ border: "none", paddingTop: "var(--sp-10)" }}>
        <Icon name="users" size={40} className="empty-state-icon" style={{ margin: "0 auto var(--sp-3)" }} />
        <p className="empty-state-title">Crea tu primer cliente</p>
        <p className="empty-state-text" style={{ marginBottom: "var(--sp-4)" }}>
          Necesitas un cliente antes de planificar calendarios.
        </p>
        <button className="btn btn-primary" onClick={onNuevo}>Crear cliente</button>
      </div>
    );
  }

  return (
    <div className="inicio">
      <div className="page-header">
        <h1 className="page-title">{saludo}{yo?.nombre ? `, ${yo.nombre.split(" ")[0]}` : ""}</h1>
        <p className="page-meta">Tus clientes y lo que tienen pendiente este mes.</p>
      </div>

      <ul className="inicio-clientes" aria-label="Clientes">
        {clients.map((c) => {
          const cal = calendarioPorDefecto(c.calendars ?? [], hoy);
          const r = resumenCalendario(cal);
          return (
            <li key={c.id}>
              <button type="button" className="inicio-cliente" onClick={() => onAbrir(c.id)}>
                <span className="client-avatar" style={{ width: 40, height: 40 }}>
                  {c.logo ? <img src={c.logo} alt="" /> : <Icon name="building" size={20} />}
                </span>
                <span className="inicio-cliente-texto">
                  <span className="inicio-cliente-nombre">{c.name}</span>
                  <span className="inicio-cliente-meta">
                    {cal ? (cal.name || `${MONTHS[cal.month]} ${cal.year}`) : "Sin calendarios"}
                    {cal && r.publicaciones > 0 && ` · ${r.aprobadas + r.publicadas}/${r.publicaciones} aprobadas`}
                  </span>
                  {cal && (r.porAprobar > 0 || r.conCambios > 0) && (
                    <span className="inicio-cliente-pendiente">
                      {r.porAprobar > 0 && `${r.porAprobar} por aprobar`}
                      {r.porAprobar > 0 && r.conCambios > 0 && " · "}
                      {r.conCambios > 0 && `${r.conCambios} con cambios`}
                    </span>
                  )}
                </span>
                <PresenciaEnCliente presentes={presentes} clienteId={c.id} yo={yo} />
              </button>
            </li>
          );
        })}
      </ul>

      <QuickTasksPanel pulso={pulso} />
    </div>
  );
}

function Workspace({ session, ruta }) {
  // El dueño de las filas es el ESPACIO, no la persona: los clientes son
  // de la agencia y los ve igual quien los creó que quien entró ayer.
  // `?? id` cubre la sesión de antes de que existiera el equipo.
  const ownerId = session.user.ownerId ?? session.user.id;
  const yo = session.user;

  const [clients, setClients] = useState([]);
  // Qué cliente y qué calendario se están mirando NO son estado: son la
  // dirección. Guardarlos en `useState` era justo lo que hacía que
  // recargar te devolviera al principio y que no se pudiera pasar un
  // enlace a nadie.
  const [showDrawer, setShowDrawer] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showBuscador, setShowBuscador] = useState(false);
  // Una publicación que el buscador pidió abrir al llegar a su calendario.
  const [postPedido, setPostPedido] = useState(null);
  const anchoAmplio = useAnchoAmplio();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [saveError, setSaveError] = useState(null);
  // Tiempo real.
  const [presentes, setPresentes] = useState([]);
  const [estadoVivo, setEstadoVivo] = useState("desconectado");
  // Sube cada vez que llega un cambio de algo que carga su propio panel
  // (tareas, banco, aprobaciones). Se pasa como prop y va en las
  // dependencias de su efecto: subirlo es decirles «vuelve a leer».
  const [pulso, setPulso] = useState(0);
  // Alguien ha guardado un calendario que yo tengo a medio escribir.
  const [pisada, setPisada] = useState(null);
  // Qué publicación tiene abierta cada cual: postId → persona.
  const [editandoOtros, setEditandoOtros] = useState({});
  const importRef = useRef();
  // Un temporizador por calendario: las ediciones seguidas se agrupan en
  // una sola escritura en lugar de una por pulsación.
  const saveTimers = useRef(new Map());
  const pendingSaves = useRef(new Map());

  const flushPendingSaves = () => {
    const timers = saveTimers.current;
    const pending = pendingSaves.current;
    timers.forEach(clearTimeout);
    timers.clear();
    for (const [, entry] of pending) {
      db.saveCalendar(entry.cal, entry.clientDbId, entry.ownerId).catch(() => {});
    }
    pending.clear();
  };

  /**
   * Relee el espacio entero.
   *
   * Se usa al arrancar y al RECONECTAR: mientras el socket estuvo caído
   * pudo pasar cualquier cosa, y ninguno de esos eventos llegó. El
   * socket acelera; esto es lo que garantiza que lo que se ve es lo que
   * hay.
   */
  const cargar = useCallback(async () => {
    try {
      const data = await db.loadWorkspace();
      setClients(data);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "No se pudieron cargar los datos.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar, ownerId]);

  // ----------------------------------------------------------
  // Tiempo real
  //
  // Lo que llega por aquí es un ATAJO: evita recargar para enterarse de
  // lo que ha hecho el resto del equipo. La fuente de verdad sigue
  // siendo D1, y por eso al reconectar se relee entero: si se ha perdido
  // un evento, la relectura lo repone.
  //
  // DOS FILTROS QUE NO SON OPCIONALES
  //
  //  1. Los eventos de esta MISMA PESTAÑA se descartan. El Durable
  //     Object reparte a todos —no sabe de qué socket salió un cambio
  //     que le llegó por HTTP—, así que tu propio guardado vuelve. Si se
  //     aplicara, te pisaría lo que hubieras seguido escribiendo en los
  //     milisegundos siguientes: el cursor salta y la última palabra
  //     desaparece.
  //
  //  2. Un calendario con escritura PENDIENTE no se pisa. Si alguien
  //     guarda el mismo mes que tú estás editando, aplicar su versión te
  //     borraría lo que tienes a medias sin decir nada. Se avisa y se
  //     deja elegir, que es lo único honesto que se puede hacer aquí.
  // ----------------------------------------------------------
  useEffect(() => {
    let yaEstuvo = false;
    vivo.conectar();

    const aplicarCalendario = (cal, clientId) => {
      setClients((prev) => prev.map((c) => {
        if (c.id !== clientId) return c;
        const cals = c.calendars ?? [];
        return {
          ...c,
          calendars: cals.some((x) => x.id === cal.id)
            ? cals.map((x) => (x.id === cal.id ? cal : x))
            : [...cals, cal],
        };
      }));
    };

    const bajaEventos = vivo.al((ev) => {
      if (ev.tipo === "hola" || ev.tipo === "presencia") {
        const presentes = ev.presentes ?? [];
        setPresentes(presentes);
        // Quien se desconecta deja de estar editando nada. Sin esto, un
        // cierre de pestaña dejaba su aviso pegado a una publicación
        // para siempre: el `editando: false` del desmonte no llega
        // cuando el navegador se va de golpe.
        const vivos = new Set(presentes.map((p) => p.userId));
        setEditandoOtros((prev) => {
          const siguiente = Object.fromEntries(
            Object.entries(prev).filter(([, persona]) => vivos.has(persona?.userId)),
          );
          return Object.keys(siguiente).length === Object.keys(prev).length ? prev : siguiente;
        });
        return;
      }
      // Filtro 1: mi propio eco.
      if (ev.por?.tab && ev.por.tab === db.PESTANA) return;

      switch (ev.tipo) {
        case "cliente": {
          const nuevo = rowToClient(ev.cliente);
          setClients((prev) => {
            const previo = prev.find((c) => c.id === nuevo.id);
            // `rowToClient` deja `calendars: []`: la fila del cliente no
            // los trae. Pisarlos con eso vaciaría la lista de meses de la
            // pantalla de quien no ha tocado nada.
            const fusion = { ...nuevo, calendars: previo?.calendars ?? [] };
            return previo
              ? prev.map((c) => (c.id === nuevo.id ? fusion : c))
              : [...prev, fusion];
          });
          break;
        }

        case "cliente:fuera":
          setClients((prev) => prev.filter((c) => c.id !== ev.id));
          break;

        case "calendario": {
          const cal = rowToCalendar(ev.calendario);
          // Filtro 2.
          if (pendingSaves.current.has(cal.id) || saveTimers.current.has(cal.id)) {
            setPisada({ calId: cal.id, quien: ev.por?.nombre ?? "Alguien" });
            break;
          }
          aplicarCalendario(cal, ev.calendario.client_id);
          break;
        }

        case "calendario:recargar":
          // El mes no cabía en un mensaje: se relee. Ver TOPE_EVENTO en
          // worker/lib/vivo.js.
          if (!pendingSaves.current.size) void cargar();
          break;

        case "calendario:fuera":
          setClients((prev) => prev.map((c) => ({
            ...c,
            calendars: (c.calendars ?? []).filter((cal) => cal.id !== ev.id),
          })));
          break;

        case "calendario:enlace":
          setClients((prev) => prev.map((c) => ({
            ...c,
            calendars: (c.calendars ?? []).map((cal) =>
              cal.id === ev.id ? { ...cal, shareEnabled: ev.enabled } : cal),
          })));
          break;

        // Tareas, banco, memorias y respuestas del cliente final: cada
        // panel carga lo suyo, así que no se parchea el estado desde
        // aquí —sería copiar su lógica en otro sitio—. Se les dice que
        // vuelvan a leer.
        case "tarea":
        case "tarea:fuera":
        case "tarea:reorden":
        case "tarea-rapida":
        case "tarea-rapida:fuera":
        case "tarea-rapida:reorden":
        case "responsable":
        case "ajustes":
        case "banco":
        case "banco:fuera":
        case "memoria":
        case "plantilla-imagen":
        case "plantilla-imagen:fuera":
        case "referencia-imagen":
        case "referencia-imagen:fuera":
        // Lo del equipo lo pinta la pantalla de Equipo, que carga lo
        // suyo: se le dice que vuelva a leer, igual que a los paneles.
        case "miembro":
        case "miembro:fuera":
        case "invitacion":
        case "invitacion:fuera":
          setPulso((n) => n + 1);
          break;

        case "editando":
          // Se guarda por publicación, no por persona: lo que hace falta
          // saber al abrir una es si alguien más la tiene delante.
          setEditandoOtros((prev) => {
            const siguiente = { ...prev };
            if (ev.activo) siguiente[ev.postId] = ev.por;
            else delete siguiente[ev.postId];
            return siguiente;
          });
          break;

        case "aprobacion":
          setPulso((n) => n + 1);
          setToast(`${ev.por?.nombre ?? "El cliente"} acaba de responder en el calendario.`);
          break;

        case "comentario":
          setPulso((n) => n + 1);
          if (ev.por?.userId === "cliente") setToast(`${ev.por?.nombre ?? "El cliente"} dejó un comentario.`);
          break;

        case "revision":
          setPulso((n) => n + 1);
          setToast(`${ev.por?.nombre ?? "El cliente"} terminó y envió su revisión.`);
          break;

        case "metricas":
          setPulso((n) => n + 1);
          break;

        case "informe":
          setPulso((n) => n + 1);
          if (ev.estado === "listo" && ev.por?.userId === "sistema") setToast("El informe mensual está listo.");
          break;

        // La cola de publicación: la mueve el cron, sin nadie delante. Se
        // avisa de lo que sale y de lo que falla; lo demás sólo refresca.
        case "publicacion":
          setPulso((n) => n + 1);
          if (ev.aviso) setToast(ev.aviso);
          else if (ev.estado === "publicada") setToast(`Publicada ${ev.variante === "historia" ? "la historia " : ""}en ${NOMBRE_RED[ev.red] ?? ev.red}.`);
          else if (ev.estado === "error") setToast(`No se pudo publicar en ${NOMBRE_RED[ev.red] ?? ev.red}. El motivo está en Programación.`);
          break;

        default:
          break;
      }
    });

    const bajaEstado = vivo.alCambiarEstado((e) => {
      setEstadoVivo(e);
      if (e !== "conectado") return;
      // La primera conexión no recarga: los datos acaban de llegar. Las
      // siguientes sí, porque son una RE-conexión y ahí sí hay un hueco
      // que tapar.
      if (yaEstuvo) void cargar();
      yaEstuvo = true;
    });

    return () => {
      bajaEventos();
      bajaEstado();
      vivo.desconectar();
    };
  }, [cargar]);

  useEffect(() => {
    const flush = () => flushPendingSaves();
    const onVisChange = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisChange);
      flushPendingSaves();
    };
  }, []);

  // Los mensajes se anuncian en una región aria-live en lugar de alert(),
  // que interrumpe al lector de pantalla y bloquea la interfaz.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ----------------------------------------------------------
  // De la dirección a lo que se mira
  //
  // Al revés que antes: la URL manda y el cliente y el calendario salen
  // de ella. Por eso recargar ya no pierde el sitio, y por eso un enlace
  // pegado en un mensaje abre exactamente lo mismo que veía quien lo
  // mandó.
  // ----------------------------------------------------------
  const slugsCliente = useMemo(() => slugsDeClientes(clients), [clients]);
  const client = useMemo(
    () => porRuta(clients, slugsCliente, ruta.cliente),
    [clients, slugsCliente, ruta.cliente],
  );
  const selectedClientId = client?.id ?? null;

  const slugsCal = useMemo(() => slugsDeCalendarios(client?.calendars ?? []), [client]);
  // Sin mes en la dirección, se abre el del mes en curso (o el más
  // reciente): antes salía «Selecciona un calendario» y había que buscarlo.
  const calendar = useMemo(
    () => porRuta(client?.calendars ?? [], slugsCal, ruta.calendario)
      ?? (!ruta.calendario ? calendarioPorDefecto(client?.calendars ?? [], fechaEnZona()) : null),
    [client, slugsCal, ruta.calendario],
  );
  const selectedCalId = calendar?.id ?? null;

  /**
   * Navega a un cliente, y opcionalmente a uno de sus calendarios.
   *
   * `lista` existe porque justo después de crear o importar algo, el
   * estado todavía no lo tiene: el slug hay que calcularlo sobre la
   * lista que va a haber, no sobre la que hay. Sin eso, un cliente
   * recién creado navegaba a una dirección que aún no resolvía.
   */
  const irA = useCallback((clienteId, calId = null, lista = clients) => {
    if (!clienteId) { navegar("/"); return; }
    const cliente = lista.find((c) => c.id === clienteId);
    const slug = slugsDeClientes(lista).get(clienteId) ?? clienteId;
    const calSlug = calId
      ? (slugsDeCalendarios(cliente?.calendars ?? []).get(calId) ?? calId)
      : null;
    navegar(construirRuta({ cliente: slug, calendario: calSlug }));
  }, [clients]);

  // Una dirección que no resuelve —cliente borrado, enlace viejo, un
  // nombre cambiado— vuelve al inicio en vez de dejar la pantalla vacía
  // sin explicar nada. Se hace REEMPLAZANDO: no es navegar, es corregir,
  // y meterlo en el historial obligaría a pulsar «atrás» dos veces.
  useEffect(() => {
    // Con un error de carga no se corrige nada: la lista está vacía
    // porque no se ha podido leer, no porque el cliente no exista, y
    // devolver al inicio borraría la dirección a la que hay que volver
    // cuando la red se recupere.
    if (loading || loadError || !ruta.cliente) return;
    if (!client) {
      setToast("Ese cliente ya no está. Te hemos devuelto al inicio.");
      navegar("/", { reemplazar: true });
    }
  }, [loading, loadError, ruta.cliente, client]);

  // Contarle al equipo dónde estoy. Es lo que dibuja los avatares sobre
  // el cliente en la lista de al lado.
  useEffect(() => {
    vivo.mirar(selectedClientId, selectedCalId);
  }, [selectedClientId, selectedCalId]);

  // La empresa en la que trabajo hoy. Se lee al entrar —la de ayer ya
  // no vale— y se le cuenta al equipo por la presencia.
  const [foco, setFoco] = useState(() => leerFoco(yo.id, fechaEnZona()));
  useEffect(() => { vivo.enfocar(foco); }, [foco]);
  const cambiarFoco = useCallback((clienteId) => {
    guardarFoco(yo.id, fechaEnZona(), clienteId);
    setFoco(clienteId || null);
  }, [yo.id]);

  const fallo = (accion) => (e) => setToast(`No se pudo ${accion}: ${e.message}`);

  const handleAddIdea = useCallback((idea, targetClientId) => {
    const cId = targetClientId || selectedClientId;
    if (!cId) return;
    setClients((prev) => prev.map((c) => {
      if (c.id !== cId) return c;
      const updated = { ...c, ideasBank: [...(c.ideasBank || []), idea] };
      db.saveClient(updated, ownerId).catch(() => {});
      return updated;
    }));
  }, [selectedClientId, ownerId]);

  // Deja escapar el error a propósito: ClientModal lo muestra dentro del
  // diálogo y lo mantiene abierto con los datos, en vez de cerrarse y
  // perderlos.
  const saveClient = async (c) => {
    const isNew = !clients.find((x) => x.id === c.id || x.id === c.dbId);
    const guardado = await db.saveClient(c, ownerId);
    // El estado se actualiza en forma de función: entre el render y esta
    // línea puede haber entrado un cambio de la otra persona por el
    // socket, y reemplazar la lista entera con la de antes lo perdería.
    setClients((prev) => (prev.find((x) => x.id === guardado.id)
      ? prev.map((x) => (x.id === guardado.id ? guardado : x))
      : [...prev, guardado]));
    // Para NAVEGAR, en cambio, hace falta la lista que va a haber: el
    // slug depende de los nombres que hay alrededor, y con la de ahora un
    // cliente recién creado iría a una dirección que todavía no resuelve
    // y rebotaría al inicio.
    // Y conservando su SITIO en la lista, no empujándolo al final: el
    // orden es lo que decide, cuando dos clientes normalizan al mismo
    // slug, cuál se queda el limpio. Moverlo cambiaría la dirección de un
    // cliente que sólo se estaba renombrando.
    irA(guardado.id, null, clients.some((x) => x.id === guardado.id)
      ? clients.map((x) => (x.id === guardado.id ? guardado : x))
      : [...clients, guardado]);
    setEditingClient(null);
    setShowClientModal(false);

    if (isNew) {
      db.loadTaskTemplates()
        .then((templates) => {
          if (templates.length) return db.applyTemplatesToClient(guardado.id, templates);
        })
        .catch(() => {});
    }
  };

  // Guarda un cliente sin tocar la selección ni cerrar diálogos.
  // `saveClient` sirve al modal de alta y edición: además de guardar,
  // cambia de cliente y cierra la ficha. Para lo que se guarda de fondo
  // —la receta visual compilada, el ADN releído— eso sería un salto de
  // pantalla cada vez.
  const persistClient = async (c) => {
    try {
      const guardado = await db.saveClient(c, ownerId);
      setClients((prev) => prev.map((x) => (x.id === guardado.id ? guardado : x)));
    } catch (e) {
      console.error("No se pudo guardar el cliente:", e);
    }
  };

  const deleteClient = async (id) => {
    try {
      await db.deleteClient(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
      if (selectedClientId === id) irA(null);
    } catch (e) {
      fallo("borrar el cliente")(e);
    }
  };

  /** Sólo estado: lo usan las aprobaciones en vivo, que no deben persistirse. */
  const updateCalendarLocal = (calId, updatedCal) => {
    setClients((prev) =>
      prev.map((c) =>
        c.id !== selectedClientId ? c : { ...c, calendars: c.calendars.map((cal) => (cal.id === calId ? updatedCal : cal)) }
      )
    );
  };

  /** Estado inmediato y escritura agrupada: la interfaz no espera a la red. */
  const updateCalendar = (calId, updatedCal) => {
    updateCalendarLocal(calId, updatedCal);

    const timers = saveTimers.current;
    const pending = pendingSaves.current;
    const entry = { cal: updatedCal, clientDbId: selectedClientId, ownerId };
    pending.set(calId, entry);
    clearTimeout(timers.get(calId));
    timers.set(calId, setTimeout(() => {
      timers.delete(calId);
      pending.delete(calId);
      db.saveCalendar(updatedCal, selectedClientId, ownerId)
        .then(() => setSaveError(null))
        .catch((e) => setSaveError({ calId, entry, message: e.message }));
    }, 600));
  };

  const retrySave = () => {
    if (!saveError) return;
    const { calId: cId, entry } = saveError;
    setSaveError(null);
    db.saveCalendar(entry.cal, entry.clientDbId, entry.ownerId)
      .then(() => setToast("Calendario guardado correctamente."))
      .catch((e) => setSaveError({ calId: cId, entry, message: e.message }));
  };

  const deleteCalendar = async (calId) => {
    try {
      clearTimeout(saveTimers.current.get(calId));
      saveTimers.current.delete(calId);
      pendingSaves.current.delete(calId);
      await db.deleteCalendar(calId);
      setClients((prev) =>
        prev.map((c) =>
          c.id !== selectedClientId ? c : { ...c, calendars: c.calendars.filter((cal) => cal.id !== calId) }
        )
      );
      if (selectedCalId === calId) irA(selectedClientId);
    } catch (e) {
      fallo("borrar el calendario")(e);
    }
  };

  const duplicateCalendar = async (calId) => {
    const original = client?.calendars?.find((cal) => cal.id === calId);
    if (!original) return;

    const copy = JSON.parse(JSON.stringify(original));
    // La copia es un calendario nuevo: ni id ni enlace se heredan.
    delete copy.id;
    delete copy.dbId;
    delete copy.shareToken;
    copy.name = (copy.name || MONTHS[copy.month] + " " + copy.year) + " (copia)";
    copy.days = (copy.days || []).map((d) => ({
      ...d,
      posts: (d.posts || []).map((p) => ({ ...p, id: uid(), status: "pending", script: "" })),
    }));

    try {
      const creado = await db.saveCalendar(copy, selectedClientId, ownerId);
      setClients((prev) =>
        prev.map((c) => (c.id !== selectedClientId ? c : { ...c, calendars: [...c.calendars, creado] }))
      );
    } catch (e) {
      fallo("duplicar el calendario")(e);
    }
  };

  const handleWizardGenerate = async (calendarData) => {
    const nuevo = {
      name: calendarData.campaign || MONTHS[calendarData.month] + " " + calendarData.year,
      month: calendarData.month,
      year: calendarData.year,
      campaign: calendarData.campaign,
      weekConcepts: calendarData.weekConcepts,
      offers: calendarData.offers || "",
      promoCode: calendarData.promoCode || "",
      generatedAt: new Date().toISOString(),
      days: calendarData.days,
    };

    try {
      // Se inserta primero para que el id sea el de la base de datos: el
      // enlace de aprobación se pide con él.
      const creado = await db.saveCalendar(nuevo, selectedClientId, ownerId);
      setClients((prev) =>
        prev.map((c) =>
          c.id !== selectedClientId ? c : { ...c, calendars: [...(c.calendars || []), creado] }
        )
      );
      // La lista con el calendario nuevo ya dentro, por lo mismo que en
      // saveClient: el slug del mes tiene que existir para navegar a él.
      irA(
        selectedClientId, creado.id,
        clients.map((c) => (c.id !== selectedClientId ? c : { ...c, calendars: [...(c.calendars || []), creado] })),
      );
      setShowWizard(false);
    } catch (e) {
      fallo("crear el calendario")(e);
    }
  };

  const exportJSON = () => {
    const data = { clients, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "juancito-ads-" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToast("Copia de seguridad descargada.");
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch {
        setToast("Archivo inválido: no se pudo leer el JSON.");
        return;
      }

      if (Array.isArray(data.clients)) {
        // Se añaden a lo que ya hay en la nube; antes se reemplazaba el
        // estado entero y los clientes existentes desaparecían de la vista
        // aunque siguieran en la base de datos.
        setToast("Importando…");
        try {
          const añadidos = [];
          for (const c of data.clients) {
            const copia = { ...c };
            delete copia.dbId;
            const guardado = await db.saveClient(copia, ownerId);
            for (const cal of c.calendars ?? []) {
              const calCopia = { ...cal };
              delete calCopia.dbId;
              delete calCopia.shareToken;
              const calGuardado = await db.saveCalendar(calCopia, guardado.id, ownerId);
              guardado.calendars = [...(guardado.calendars ?? []), calGuardado];
            }
            añadidos.push(guardado);
          }
          setClients((prev) => [...prev, ...añadidos]);
          if (añadidos.length) irA(añadidos[0].id, null, [...clients, ...añadidos]);
          setToast(`Importados ${añadidos.length} clientes.`);
        } catch (err) {
          fallo("importar")(err);
        }
      } else if (data.aprobaciones && data.calendarioId) {
        importReviewsData(data);
      } else {
        setToast("El archivo no contiene clientes ni revisiones.");
      }
    };
    reader.readAsText(file);
  };

  const importReviewsData = (reviewData) => {
    if (!calendar) {
      setToast("Selecciona un calendario antes de importar revisiones.");
      return;
    }
    const { aprobaciones } = reviewData;
    if (!aprobaciones || typeof aprobaciones !== "object") return;
    let updated = 0;
    const newDays = (calendar.days || []).map((d) => ({
      ...d,
      posts: (d.posts || []).map((p) => {
        const review = aprobaciones[p.id];
        if (!review) return p;
        updated++;
        return {
          ...p,
          status: review.estado === "aprobado" ? "approved" : review.estado === "cambios" ? "rejected" : p.status,
          comment: review.comentario || p.comment,
        };
      }),
    }));
    updateCalendar(selectedCalId, { ...calendar, days: newDays });
    setToast(`Importadas ${updated} revisiones.`);
  };

  const openNewClient = () => {
    setEditingClient(null);
    setShowClientModal(true);
    setShowDrawer(false);
  };

  const selectClient = (id) => {
    irA(id);
    setShowDrawer(false);
  };

  // ----------------------------------------------------------
  // Atajos: Ctrl+K (⌘K en Mac) abre el buscador desde cualquier sitio.
  // ----------------------------------------------------------
  useEffect(() => {
    const tecla = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowBuscador((v) => !v);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const elegirDelBuscador = (r) => {
    setShowBuscador(false);
    const a = r.accion;
    if (a.tipo === "ruta") navegar(a.ruta);
    else if (a.tipo === "asistente") setShowChat(true);
    else if (a.tipo === "nuevo-cliente") openNewClient();
    else if (a.tipo === "nuevo-calendario") setShowWizard(true);
    else if (a.tipo === "cliente") irA(a.clienteId);
    else if (a.tipo === "calendario") irA(a.clienteId, a.calId);
    else if (a.tipo === "publicacion") {
      setPostPedido({ calId: a.calId, postId: a.postId });
      irA(a.clienteId, a.calId);
    }
  };
  const publicacionAbierta = useCallback(() => setPostPedido(null), []);
  // Desde Programación o Mi día: abrir la publicación de una fila de la cola.
  const abrirPublicacionDeCola = ({ clientId, calendarId, postId }) => {
    if (calendarId && postId) setPostPedido({ calId: calendarId, postId });
    irA(clientId, calendarId);
  };

  if (loading) return <Aviso>Cargando tus clientes…</Aviso>;
  if (loadError) return <Aviso tono="alert">{loadError}</Aviso>;

  const pestana = client ? (ruta.pestana ?? "calendario") : null;
  const slugCliente = client ? slugsCliente.get(client.id) ?? client.id : null;
  const irAPestana = (p) => navegar(construirRuta({ cliente: slugCliente, pestana: p }));
  // En pantalla ancha el asistente se acopla a la derecha y el contenido
  // se aparta: se trabaja con el calendario a la vista, sin fondo oscuro.
  const chatAcoplado = showChat && anchoAmplio;

  return (
    <div className="app-shell" data-chat={chatAcoplado ? "acoplado" : undefined}>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", minWidth: 0 }}>
          <button
            className="btn-icon menu-toggle"
            onClick={() => setShowDrawer(true)}
            aria-label="Abrir el menú y la lista de clientes"
            aria-expanded={showDrawer}
          >
            <Icon name="menu" />
          </button>
          <button type="button" className="app-marca" onClick={() => navegar("/")} aria-label="Juancito Ads: ir al inicio">
            <img src={logoMark} alt="" width={32} height={32} />
            <span>Juancito Ads</span>
          </button>
        </div>

        <button type="button" className="buscador-disparador" onClick={() => setShowBuscador(true)} aria-label="Buscar (Ctrl+K)">
          <Icon name="search" size={16} />
          <span className="buscador-disparador-texto">Buscar clientes, meses, publicaciones…</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>

        <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0, alignItems: "center" }}>
          <MedidorIA pulso={pulso} />
          {/* Quién más está dentro, y si mi propia conexión está viva.
              Lo segundo importa tanto como lo primero: cuando el socket
              se cae, la pantalla deja de actualizarse sola y sin este
              aviso parecería que nadie ha tocado nada. */}
          <Presencia presentes={presentes} yo={yo} estado={estadoVivo} clientes={clients} />
          <MenuCuenta yo={yo} onSalir={signOut} />
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Archivo JSON a importar"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) importJSON(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar" aria-label="Navegación y clientes">
          <NavPrincipal ruta={ruta} pulso={pulso} />
          <div className="app-sidebar-clientes">
            <ClientList
              clients={clients}
              selectedClientId={selectedClientId}
              onSelect={selectClient}
              onNew={openNewClient}
              presentes={presentes}
              yo={yo}
            />
          </div>
        </aside>

        <main id="contenido" className="app-main">
          <div className="app-content">
            {/* Región de anuncios: sustituye a alert() */}
            <div role="status" aria-live="polite" className={toast ? undefined : "sr-only"}>
              {toast && <p className="notice notice-ok">{toast}</p>}
            </div>
            {saveError && (
              <div role="alert" className="notice notice-error" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <span style={{ flex: 1 }}>No se pudo guardar el calendario: {saveError.message}</span>
                <button className="btn btn-primary btn-sm" onClick={retrySave}>Reintentar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSaveError(null)} aria-label="Descartar aviso">
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}

            {/* Sólo sobre el calendario al que se refiere: el aviso
                habla de «este calendario», y enseñarlo mientras miras
                otro es peor que no enseñarlo. Al volver, reaparece. */}
            {pisada && pisada.calId === selectedCalId && (
              <div role="alert" className="notice notice-warn" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <span style={{ flex: 1 }}>
                  {pisada.quien} ha guardado este calendario mientras tú lo
                  editabas. Lo que ves es lo tuyo: al guardar, tus cambios
                  ganan. Recarga si prefieres quedarte con los suyos.
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => { setPisada(null); void cargar(); }}>
                  Ver los suyos
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPisada(null)} aria-label="Descartar aviso">
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}

            {ruta.vista === "tareas" ? (
              <Suspense fallback={<p style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando Mi día…</p>}>
              <Tareas
                clients={clients}
                pulso={pulso}
                onSelectClient={(id) => irA(id)}
                yo={yo}
                presentes={presentes}
                foco={foco}
                onFoco={cambiarFoco}
              />
              </Suspense>
            ) : ruta.vista === "equipo" ? (
              <Suspense fallback={<p style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando Equipo…</p>}>
                <Equipo presentes={presentes} yo={yo} pulso={pulso} onVolver={() => navegar("/")} />
              </Suspense>
            ) : ruta.vista === "programacion" ? (
              <Suspense fallback={<Cargando />}>
                <Programacion clients={clients} pulso={pulso} onAbrir={abrirPublicacionDeCola} />
              </Suspense>
            ) : ruta.vista === "resultados" ? (
              <Suspense fallback={<Cargando />}>
                <ResumenAgencia clients={clients} pulso={pulso} />
              </Suspense>
            ) : ruta.vista === "ajustes" ? (
              <Suspense fallback={<p style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando Ajustes…</p>}>
                <Ajustes
                  yo={yo}
                  clients={clients}
                  pulso={pulso}
                  onVolver={() => navegar("/")}
                  onExportar={exportJSON}
                  onImportar={() => importRef.current?.click()}
                />
              </Suspense>
            ) : client ? (
              <>
                {/* Un solo encabezado. Antes había cuatro bloques apilados
                    que repetían el nombre del cliente y el del mes. */}
                <div className="page-header">
                  <div className="page-header-top">
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", minWidth: 0 }}>
                      <span className="client-avatar" style={{ width: 44, height: 44, borderRadius: "var(--radius)" }}>
                        {client.logo ? <img src={client.logo} alt="" /> : <Icon name="building" size={22} />}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <h1 className="page-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {client.name}
                        </h1>
                        <p className="page-meta">
                          {client.industry && <span>{client.industry}</span>}
                          {client.industry && client.instagram && <span className="page-meta-sep">·</span>}
                          {client.instagram && <span>{client.instagram}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="page-header-actions">
                      <button
                        className="btn-icon"
                        aria-label={`Editar cliente ${client.name}`}
                        onClick={() => {
                          setEditingClient(client);
                          setShowClientModal(true);
                        }}
                      >
                        <Icon name="pencil" />
                      </button>
                      <button className="btn btn-primary" onClick={() => setShowWizard(true)}>
                        <Icon name="plus" size={18} /> Calendario
                      </button>
                    </div>
                  </div>

                  <ResumenCliente client={client} calendar={calendar} pulso={pulso} onIr={irAPestana} />

                  {/* Las pestañas del cliente. Son direcciones —se
                      recargan, se comparten, atrás funciona—, así que es
                      navegación con aria-current, no role="tab". Antes
                      todo esto iba apilado ENCIMA del calendario, que es
                      lo que se usa todo el día, y había que bajar para
                      llegar a él. */}
                  <nav className="pestanas-cliente" aria-label={`Secciones de ${client.name}`}>
                    {PESTANAS.map(([id, nombre, icono]) => (
                      <button
                        key={id}
                        type="button"
                        className="pestana-cliente"
                        aria-current={pestana === id ? "page" : undefined}
                        onClick={() => (id === "calendario" ? irA(client.id, selectedCalId) : irAPestana(id))}
                      >
                        <Icon name={icono} size={16} /> {nombre}
                      </button>
                    ))}
                  </nav>
                </div>

                <Suspense fallback={<Cargando />}>
                {pestana === "tareas" && <TaskPanel client={client} pulso={pulso} />}

                {pestana === "contenido" && (
                  <PestanaContenido client={client} pulso={pulso} onPersistClient={persistClient} />
                )}

                {pestana === "ideas" && (
                  <IdeasBank
                    client={client}
                    onUpdateClient={(updated) => setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c))}
                  />
                )}

                {pestana === "resultados" && (
                  <Resultados client={client} pulso={pulso} onPersistClient={persistClient} />
                )}

                {pestana === "ficha" && (
                  <FichaCliente
                    client={client}
                    onEditar={() => { setEditingClient(client); setShowClientModal(true); }}
                  />
                )}
                </Suspense>

                {pestana === "calendario" && client.calendars?.length > 0 && (
                  <nav className="cal-tabs" aria-label="Calendarios del cliente">
                    {client.calendars.map((c) => (
                      <button
                        key={c.id}
                        className="cal-tab"
                        onClick={() => irA(selectedClientId, c.id)}
                        aria-current={selectedCalId === c.id ? "true" : undefined}
                      >
                        {c.name || MONTHS[c.month] + " " + c.year}
                      </button>
                    ))}
                  </nav>
                )}

                {pestana === "calendario" && (calendar ? (
                  <CalendarView
                    client={client}
                    cal={calendar}
                    calId={selectedCalId}
                    pulso={pulso}
                    editandoOtros={editandoOtros}
                    abrirPublicacion={postPedido?.calId === selectedCalId ? postPedido.postId : null}
                    onPublicacionAbierta={publicacionAbierta}
                    onUpdateCal={updateCalendar}
                    onUpdateCalLocal={updateCalendarLocal}
                    onDeleteCal={deleteCalendar}
                    onDuplicateCal={duplicateCalendar}
                    onUpdateClient={(updated) => setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c))}
                    onPersistClient={persistClient}
                    onMoveBankToCal={(bankPost, targetDate) => {
                      setClients((prev) => prev.map((c) => {
                        if (c.id !== selectedClientId) return c;
                        const newPost = { ...bankPost, id: crypto.randomUUID().slice(0, 8), status: "pending" };
                        delete newPost._originDate;
                        delete newPost._originCal;
                        delete newPost._addedAt;
                        const cals = c.calendars.map((cal) => {
                          if (cal.id !== selectedCalId) return cal;
                          const days = (cal.days || []).map((d) =>
                            d.date !== targetDate ? d : { ...d, posts: [...(d.posts || []), newPost] }
                          );
                          return { ...cal, days };
                        });
                        const bank = (c.ideasBank || []).filter((p) => p.id !== bankPost.id);
                        return { ...c, calendars: cals, ideasBank: bank };
                      }));
                      clearTimeout(saveTimers.current.get(selectedCalId));
                      saveTimers.current.set(selectedCalId, setTimeout(() => {
                        saveTimers.current.delete(selectedCalId);
                        setClients((cur) => {
                          const cl = cur.find((c) => c.id === selectedClientId);
                          const cal = cl?.calendars?.find((c) => c.id === selectedCalId);
                          if (cal) db.saveCalendar(cal, selectedClientId, ownerId).catch(fallo("guardar el calendario"));
                          if (cl) db.saveClient(cl, ownerId).catch(fallo("guardar el cliente"));
                          return cur;
                        });
                      }, 600));
                    }}
                  />
                ) : (
                  <div className="empty-state">
                    <Icon name="calendar" size={36} className="empty-state-icon" style={{ margin: "0 auto var(--sp-3)" }} />
                    <p className="empty-state-title">Sin calendarios</p>
                    <p className="empty-state-text" style={{ marginBottom: "var(--sp-4)" }}>Crea el primer calendario de este cliente.</p>
                    <button className="btn btn-primary" onClick={() => setShowWizard(true)}>
                      <Icon name="plus" size={18} /> Crear calendario
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <Inicio
                yo={yo}
                clients={clients}
                pulso={pulso}
                presentes={presentes}
                onAbrir={(id) => irA(id)}
                onNuevo={openNewClient}
              />
            )}
          </div>
        </main>
      </div>

      <BarraInferior
        ruta={ruta}
        hayCliente={Boolean(client)}
        chatAbierto={showChat}
        pulso={pulso}
        onMiDia={() => navegar("/tareas")}
        onCalendario={() => (client ? irA(client.id, selectedCalId) : navegar("/"))}
        onChat={() => setShowChat((v) => !v)}
        onMas={() => setShowDrawer(true)}
      />

      {showDrawer && (
        <ClientDrawer
          ruta={ruta}
          pulso={pulso}
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={selectClient}
          onNew={openNewClient}
          presentes={presentes}
          yo={yo}
          onClose={() => setShowDrawer(false)}
        />
      )}

      <Suspense fallback={null}>
        {showBuscador && (
          <Buscador
            clients={clients}
            client={client}
            onClose={() => setShowBuscador(false)}
            onElegir={elegirDelBuscador}
          />
        )}

        {showWizard && client && (
          <PlanWizard
            client={client}
            onGenerate={handleWizardGenerate}
            onClose={() => setShowWizard(false)}
          />
        )}

        {showClientModal && (
          <ClientModal
            initial={editingClient}
            onSave={saveClient}
            onDelete={deleteClient}
            onClose={() => {
              setShowClientModal(false);
              setEditingClient(null);
            }}
          />
        )}
      </Suspense>

      {!showChat && (
        <button
          className="chat-fab"
          onClick={() => setShowChat(true)}
          aria-label="Abrir asistente"
          title="Asistente IA"
        >
          <Icon name="messageCircle" size={24} />
        </button>
      )}

      {showChat && (
        <Suspense fallback={null}>
          <ChatPanel
            client={client}
            calendar={calendar}
            calId={selectedCalId}
            clients={clients}
            acoplado={chatAcoplado}
            onUpdateCal={updateCalendar}
            onClose={() => setShowChat(false)}
            onAddIdea={handleAddIdea}
            onSelectClient={(id) => {
              irA(id);
              // Acoplado, el asistente se queda: se trabaja al lado.
              if (!chatAcoplado) setShowChat(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
