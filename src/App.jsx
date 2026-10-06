import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { MONTHS } from "./constants";
import { useDialogA11y } from "./hooks/useDialogA11y";
import { useAnchoAmplio } from "./hooks/useAnchoAmplio";
import Icon from "./components/Icon";
// Importado (no ruta absoluta) para que Vite le ponga hash y respete la
// base del despliegue: el sitio también se publica bajo un subdirectorio.
import logoMark from "./assets/logo-mark.png";
import CalendarView from "./components/CalendarView";
import NavegadorMes from "./components/calendario/navegadorMes";
import { diasVecinos } from "./lib/meses";
import { ponerEnDia, deIdeaAPublicacion } from "./lib/subir";
import QuickTasksPanel from "./components/QuickTasksPanel";
import ResumenCliente from "./components/ResumenCliente";
import NavPrincipal from "./components/NavPrincipal";
import MenuCuenta from "./components/MenuCuenta";
import MedidorIA from "./components/MedidorIA";
import Avisos from "./components/Avisos";
import ContadorAtrasadas from "./components/ContadorAtrasadas";
import BarraInferior from "./components/BarraInferior";
import Login from "./pages/Login";
import Invitacion from "./pages/Invitacion";
import Presencia, { PresenciaEnCliente } from "./components/Presencia";
import { useSession, signOut } from "./lib/auth";
import * as db from "./lib/db";
import { rowToCalendar, rowToClient } from "./lib/filas";
import { vivo } from "./lib/vivo";
import { fijarYo, esAdmin } from "./lib/sesionActual";
import { leerFoco, guardarFoco } from "./lib/foco";
import { fechaEnZona } from "./lib/agenda";
import { resumenCalendario } from "./lib/resumenCliente";
import { calendarioVirtual, esVirtual, fusionarEnMes, mesDeFecha, mismoMes as esMismoMes } from "./lib/meses";
import {
  analizarRuta, construirRuta, navegar,
  porRuta, slugsDeCalendarios, slugsDeClientes, slugDeMes, mesDeSlug, rutaDeOtroCliente,
} from "./lib/rutas";

// El asistente sólo se descarga al abrirlo: es la pantalla más pesada y
// la mayoría de las visitas no la abren.
const ChatPanel = lazy(() => import("./components/ChatPanel"));
const PanelTareas = lazy(() => import("./components/PanelTareas"));
// «Mi día» es una página aparte: no tiene por qué venir en la primera descarga.
const Tareas = lazy(() => import("./pages/Tareas"));
// Igual Equipo y Ajustes, que no se abren en cada visita.
const Equipo = lazy(() => import("./pages/Equipo"));
const Ajustes = lazy(() => import("./pages/Ajustes"));
const Resultados = lazy(() => import("./pages/Resultados"));
const Programacion = lazy(() => import("./pages/Programacion"));
const Tablero = lazy(() => import("./pages/Tablero"));
const Bandeja = lazy(() => import("./pages/Bandeja"));
const ResumenAgencia = lazy(() => import("./pages/Resultados").then((m) => ({ default: m.ResumenAgencia })));
// Lo que sólo se abre a demanda —diálogos, pestañas que no son el
// calendario, la página del cliente final— tampoco va en la primera
// descarga: con Drive, el buscador y Ajustes, el inicial pasaba de 170 kB.
const ClientModal = lazy(() => import("./components/ClientModal"));
const PlanWizard = lazy(() => import("./components/PlanWizard"));
const Aprobar = lazy(() => import("./pages/Aprobar"));
const Informe = lazy(() => import("./pages/Informe"));
const AuditoriaPublica = lazy(() => import("./pages/AuditoriaPublica"));
const Auditorias = lazy(() => import("./pages/Auditorias"));
const Biblioteca = lazy(() => import("./pages/Biblioteca"));
const Campanas = lazy(() => import("./pages/Campanas"));
const ConectarClaude = lazy(() => import("./pages/ConectarClaude"));
const PublicarAMano = lazy(() => import("./pages/PublicarAMano"));
const IdeasBank = lazy(() => import("./components/IdeasBank"));
const TaskPanel = lazy(() => import("./components/TaskPanel"));
const PestanaContenido = lazy(() => import("./components/PestanaContenido"));
const FichaCliente = lazy(() => import("./components/FichaCliente"));
const Cerebro = lazy(() => import("./components/Cerebro"));
const Estudio = lazy(() => import("./components/Estudio"));
const Buscador = lazy(() => import("./components/Buscador"));
const SubirRapido = lazy(() => import("./components/SubirRapido"));

const Cargando = () => <p role="status" style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando…</p>;

const NOMBRE_RED = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };

/** Las pestañas de un cliente: [id, nombre, icono]. El id va en la dirección. */
const PESTANAS = [
  ["calendario", "Calendario", "calendar"],
  ["tareas", "Tareas", "clipboardCheck"],
  ["contenido", "Contenido", "cloud"],
  ["ideas", "Ideas", "bulb"],
  ["resultados", "Resultados", "chart"],
  ["estudio", "Estudio", "imageAi"],
  ["cerebro", "Cerebro", "brain"],
  ["ficha", "Ficha", "building"],
];

/**
 * Las pestañas de un cliente. En el teléfono no caben todas: la barra desplaza, la
 * pestaña activa se trae a la vista al entrar (si no, «Estudio» o «Cerebro» quedaban
 * fuera y no se sabía que existían) y un degradado a la derecha avisa de que hay más.
 */
function PestanasCliente({ nombre, pestana, onElegir }) {
  const barra = useRef(null);
  useEffect(() => {
    barra.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [pestana]);
  return (
    <nav ref={barra} className="pestanas-cliente" aria-label={`Secciones de ${nombre}`}>
      {PESTANAS.map(([id, texto, icono]) => (
        <button
          key={id}
          type="button"
          className="pestana-cliente"
          aria-current={pestana === id ? "page" : undefined}
          onClick={() => onElegir(id)}
        >
          <Icon name={icono} size={16} /> {texto}
        </button>
      ))}
    </nav>
  );
}

/**
 * La dirección actual, y se vuelve a pintar cuando cambia.
 *
 * `popstate` lo dispara el navegador al pulsar atrás y lo dispara
 * `navegar()` a mano cuando el cambio lo hace la aplicación: `pushState`
 * NO lo lanza solo, y sin ese aviso la barra de direcciones cambiaría y
 * la pantalla no.
 */

/** Cuántas publicaciones tiene el cliente en el mes de hoy (Panamá). */
function publicacionesDelMes(cliente) {
  const hoy = mesDeFecha(fechaEnZona());
  const cal = (cliente.calendars ?? []).find((k) => esMismoMes(k, hoy));
  return (cal?.days ?? []).reduce((n, d) => n + (d.posts?.length ?? 0), 0);
}

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
  // Y la auditoría de perfil que se le manda a un cliente o a un prospecto.
  if (ruta.vista === "auditoria") return <Suspense fallback={<Aviso>Cargando…</Aviso>}><AuditoriaPublica /></Suspense>;
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
                    {/* Un solo calendario por cliente: contar «N calendarios» ya no dice nada. */}
                    {c.industry || "Sin industria"}{publicacionesDelMes(c) > 0 && ` · ${publicacionesDelMes(c)} este mes`}
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
          // Lo de ESTE mes: el calendario es uno y se abre en hoy.
          const cal = (c.calendars ?? []).find((k) => esMismoMes(k, mesDeFecha(hoy))) ?? null;
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
                    {cal ? `${MONTHS[cal.month]} ${cal.year}` : "Nada este mes"}
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
  fijarYo(yo);

  const [clients, setClients] = useState([]);
  // Lo último del estado, para lo que se lee DESPUÉS de esperar a la red
  // (crear un mes, mover de mes): el cierre de ese momento ya es viejo.
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  // Qué cliente y qué calendario se están mirando NO son estado: son la
  // dirección. Guardarlos en `useState` era justo lo que hacía que
  // recargar te devolviera al principio y que no se pudiera pasar un
  // enlace a nadie.
  const [showDrawer, setShowDrawer] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showChat, setShowChat] = useState(false);
  // El panel de tareas, como Google Tasks. A lo ancho se recuerda si se
  // dejó abierto (por navegador); en el teléfono es un cajón y no se abre solo.
  const [showTareas, setShowTareas] = useState(() => {
    try { return Boolean(window.matchMedia?.("(min-width: 1280px)").matches) && localStorage.getItem("panel-tareas") === "1"; } catch { return false; }
  });
  const [showBuscador, setShowBuscador] = useState(false);
  const [showSubir, setShowSubir] = useState(false);
  // Una publicación que el buscador pidió abrir al llegar a su calendario.
  const [postPedido, setPostPedido] = useState(null);
  const anchoAmplio = useAnchoAmplio();
  useEffect(() => {
    if (!anchoAmplio) return;
    try { localStorage.setItem("panel-tareas", showTareas ? "1" : "0"); } catch { /* sin almacenamiento */ }
  }, [showTareas, anchoAmplio]);
  // El asistente y las tareas comparten el sitio de la derecha: uno a la vez.
  useEffect(() => { if (showChat) setShowTareas(false); }, [showChat]);
  const alternarTareas = () => {
    if (!showTareas) setShowChat(false);
    setShowTareas(!showTareas);
  };
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
        // La bandeja de avisos y el hilo interno: la campana y el panel
        // se releen solos con el pulso.
        case "avisos":
        // El Estudio: un trabajo avanzó o la galería cambió. La pestaña se relee sola con el pulso.
        case "estudio":
        // La bandeja: el webhook de Meta (o alguien del equipo) guardó comentarios o mensajes.
        case "bandeja":
        // Anuncios: se creó, activó o pausó una campaña. /campanas se relee con el pulso.
        case "anuncios":
        case "nota":
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

        case "auditoria":
          setPulso((n) => n + 1);
          if (ev.estado === "error" && ev.por?.userId === "sistema") setToast("La auditoría no se pudo terminar: el motivo está en Auditorías.");
          break;

        case "biblioteca":
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
  // Calendario siempre activo: la dirección dice QUÉ MES se mira
  // («octubre-2026»), tenga cajón o no. Sin mes, el de hoy. Los enlaces
  // de antes, con el nombre o el id del calendario, siguen valiendo: se
  // traducen al mes de ese calendario.
  const mesVisto = useMemo(() => {
    const porSlug = mesDeSlug(ruta.calendario);
    if (porSlug) return porSlug;
    const viejo = porRuta(client?.calendars ?? [], slugsCal, ruta.calendario);
    if (viejo) return { year: viejo.year, month: viejo.month };
    return mesDeFecha(fechaEnZona());
  }, [client, slugsCal, ruta.calendario]);
  // Sin cajón en la base, el mes se ve igual: vacío. Se crea al escribir.
  const calendar = useMemo(() => {
    if (!client) return null;
    return (client.calendars ?? []).find((k) => esMismoMes(k, mesVisto)) ?? calendarioVirtual(mesVisto.year, mesVisto.month);
  }, [client, mesVisto]);
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
    // El mes de ese calendario, no su nombre: la dirección dice qué mes se mira.
    const cal = calId ? (cliente?.calendars ?? []).find((k) => k.id === calId) : null;
    const calSlug = cal ? slugDeMes(cal.year, cal.month) : calId;
    navegar(construirRuta({ cliente: slug, calendario: calSlug }));
  }, [clients]);

  /** A un mes concreto del cliente, tenga cajón o no. */
  const irAMes = useCallback((clienteId, { year, month }) => {
    const slug = slugsDeClientes(clients).get(clienteId) ?? clienteId;
    navegar(construirRuta({ cliente: slug, calendario: slugDeMes(year, month) }));
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
    vivo.mirar(selectedClientId, esVirtual(calendar) ? null : selectedCalId);
  }, [selectedClientId, selectedCalId, calendar]);

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

  /**
   * El banco de ideas: estado ya y guardado agrupado. Antes sólo cambiaba
   * el estado —añadir, editar o borrar una idea no llegaba a la base y al
   * recargar volvía lo de antes—. Se fusiona SOLO `ideasBank`: pasar el
   * cliente entero pisaría los calendarios que acaban de cambiar.
   */
  const bancoTimers = useRef(new Map());
  const alCambiarBanco = (actualizado) => {
    const id = actualizado.id;
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ideasBank: actualizado.ideasBank ?? [] } : c)));
    clearTimeout(bancoTimers.current.get(id));
    bancoTimers.current.set(id, setTimeout(() => {
      bancoTimers.current.delete(id);
      const cliente = clientsRef.current.find((c) => c.id === id);
      if (cliente) db.saveClient(cliente, ownerId).catch(fallo("guardar el banco de ideas"));
    }, 600));
  };

  /** Las fechas especiales de un cliente (lib/fechasEspeciales.js): se guardan con el cliente. */
  const guardarFechasCliente = async (fechas) => {
    const id = selectedClientId;
    const cliente = clientsRef.current.find((c) => c.id === id);
    if (!cliente) return;
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, fechasEspeciales: fechas } : c)));
    await db.saveClient({ ...cliente, fechasEspeciales: fechas }, ownerId);
  };

  /**
   * Del banco de ideas a un día del calendario. La idea SÓLO sale del banco
   * si entró en el calendario: antes se borraba del banco aunque el día no
   * estuviera en el mes —siempre en un mes sin cajón—, y se esfumaba.
   */
  const ideaAlCalendario = async (bankPost, fecha) => {
    const clienteId = selectedClientId;
    const mes = mesDeFecha(fecha);
    if (!clienteId || !mes) return;
    try {
      const real = await asegurarMes(clienteId, mes);
      const base = pendingSaves.current.get(real.id)?.cal
        ?? clientsRef.current.find((c) => c.id === clienteId)?.calendars?.find((k) => k.id === real.id)
        ?? real;
      updateCalendar(real.id, ponerEnDia(base, fecha, deIdeaAPublicacion(bankPost)));
    } catch (e) {
      fallo("llevar la idea al calendario")(e);
      return;
    }
    const cliente = clientsRef.current.find((c) => c.id === clienteId);
    if (cliente) alCambiarBanco({ ...cliente, ideasBank: (cliente.ideasBank ?? []).filter((p) => p.id !== bankPost.id) });
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

  /**
   * El cajón de un mes, creándolo si todavía no existe (calendario
   * siempre activo). Dos llamadas seguidas al mismo mes comparten la
   * misma petición, y el servidor garantiza un solo mes por cliente.
   */
  const creandoMes = useRef(new Map());
  const asegurarMes = useCallback(async (clienteId, { year, month }) => {
    const cliente = clientsRef.current.find((c) => c.id === clienteId);
    const existente = (cliente?.calendars ?? []).find((k) => k.year === year && k.month === month);
    if (existente) return existente;
    const clave = `${clienteId}|${year}|${month}`;
    if (!creandoMes.current.has(clave)) {
      const promesa = db.mesDeCalendario(cliente?.dbId || clienteId, year, month)
        .then((cal) => { calendarioGuardado(clienteId, cal); return cal; })
        .finally(() => creandoMes.current.delete(clave));
      creandoMes.current.set(clave, promesa);
    }
    return creandoMes.current.get(clave);
  }, []);

  /**
   * Escribir en un mes que aún no tiene cajón: se crea y lo escrito se
   * lleva a él. Si alguien lo creó a la vez, lo suyo se queda y lo mío se
   * añade (`fusionarEnMes`).
   */
  const escribirEnMesVacio = async (virtual, cambiado) => {
    try {
      const real = await asegurarMes(selectedClientId, virtual);
      // Lo último que ya se escribió en ese mes (si otra edición llegó
      // antes a este punto) va por delante de lo que devolvió el servidor.
      const base = pendingSaves.current.get(real.id)?.cal ?? real;
      updateCalendar(real.id, fusionarEnMes(base, cambiado));
    } catch (e) {
      fallo("crear el mes")(e);
    }
  };

  /**
   * El asistente crea una publicación en OTRO mes que el que se mira: se
   * obtiene (o se crea) ese mes y se mete en su día. Devuelve el mes.
   */
  const crearEnOtroMes = async (fecha, post) => {
    const mes = mesDeFecha(fecha);
    if (!mes || !selectedClientId) throw new Error("Fecha no válida.");
    const real = await asegurarMes(selectedClientId, mes);
    const base = pendingSaves.current.get(real.id)?.cal ?? real;
    updateCalendar(real.id, ponerEnDia(base, fecha, post));
    return mes;
  };

  /** Guarda YA lo pendiente de un calendario (sin esperar al agrupado). */
  const guardarYa = async (calId) => {
    const entry = pendingSaves.current.get(calId);
    clearTimeout(saveTimers.current.get(calId));
    saveTimers.current.delete(calId);
    pendingSaves.current.delete(calId);
    if (entry) await db.saveCalendar(entry.cal, entry.clientDbId, entry.ownerId);
  };

  /**
   * Llevar una publicación a otro mes. Antes se guarda lo pendiente de
   * este mes: el servidor mueve lo que hay en D1, y un guardado agrupado
   * que saliera después devolvería la publicación a su sitio. Si está
   * con el cliente, se avisa de que la verá en el enlace del otro mes.
   * Devuelve el calendario de destino, o null si no se movió.
   */
  const moverAOtroMes = async (origenCal, postId, fecha, { abrir = false, sinPreguntar = false } = {}) => {
    const destino = mesDeFecha(fecha);
    if (!origenCal || esVirtual(origenCal) || !destino) return null;
    const post = (origenCal.days ?? []).flatMap((d) => d.posts ?? []).find((p) => p.id === postId);
    if (!post) return null;
    const nombreDestino = `${MONTHS[destino.month].toLowerCase()} ${destino.year}`;
    if (!sinPreguntar && origenCal.shareToken && post.status !== "published"
      && !window.confirm(`Tu cliente la verá en el enlace de ${nombreDestino}, no en el de ${MONTHS[origenCal.month].toLowerCase()}. Su aprobación y su conversación van con ella. ¿Moverla?`)) {
      return null;
    }
    try {
      await guardarYa(origenCal.id);
      const { origen, destino: calDestino } = await db.moverDeMes(origenCal.dbId || origenCal.id, postId, fecha);
      calendarioGuardado(selectedClientId, origen);
      calendarioGuardado(selectedClientId, calDestino);
      setToast(`Movida al ${Number(fecha.slice(8))} de ${MONTHS[destino.month].toLowerCase()} de ${destino.year}.`);
      if (abrir) {
        setPostPedido({ calId: calDestino.id, postId });
        irAMes(selectedClientId, destino);
      }
      return calDestino;
    } catch (e) {
      fallo("mover la publicación")(e);
      return null;
    }
  };

  /**
   * El asistente escribe en el mes que se eligió. Si ese mes ya tiene
   * cajón —un solo mes por cliente—, lo generado se AÑADE a lo que hay:
   * antes creaba un calendario nuevo aunque ya existiera otro del mismo mes.
   */
  const handleWizardGenerate = async (calendarData) => {
    const generado = {
      campaign: calendarData.campaign,
      weekConcepts: calendarData.weekConcepts,
      offers: calendarData.offers || "",
      promoCode: calendarData.promoCode || "",
      days: calendarData.days,
    };
    const mes = { year: calendarData.year, month: calendarData.month };
    try {
      const real = await asegurarMes(selectedClientId, mes);
      await guardarYa(real.id);
      const base = clientsRef.current.find((c) => c.id === selectedClientId)?.calendars?.find((k) => k.id === real.id) ?? real;
      const fusion = {
        ...fusionarEnMes(base, generado),
        // Lo que el asistente decide del mes sí manda: es para eso.
        ...(generado.campaign ? { campaign: generado.campaign } : {}),
        ...(generado.weekConcepts?.length ? { weekConcepts: generado.weekConcepts } : {}),
        ...(generado.offers ? { offers: generado.offers } : {}),
        ...(generado.promoCode ? { promoCode: generado.promoCode } : {}),
        generatedAt: new Date().toISOString(),
      };
      const guardado = await db.saveCalendar(fusion, selectedClientId, ownerId);
      calendarioGuardado(selectedClientId, guardado);
      irAMes(selectedClientId, mes);
      setShowWizard(false);
    } catch (e) {
      fallo("planificar el mes")(e);
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

  // Escoger otro cliente desde la barra lateral o el cajón: a su misma
  // pestaña (y en el calendario, al mismo mes), no siempre al calendario.
  const selectClient = (id) => {
    const slug = slugsDeClientes(clients).get(id) ?? id;
    navegar(rutaDeOtroCliente(ruta, slug));
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
    else if (a.tipo === "subir") setShowSubir(true);
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
  // Un enlace de aviso (`/cliente/…/…?publicacion=<id>`) abre esa publicación.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const postId = q.get("publicacion");
    if (!postId || !selectedCalId) return;
    setPostPedido({ calId: selectedCalId, postId });
    q.delete("publicacion");
    const resto = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${resto ? `?${resto}` : ""}`);
  }, [selectedCalId, ruta]);
  // «Subir» guarda el calendario por su cuenta: el eco de la propia pestaña
  // se ignora, así que el estado se pone al día aquí.
  const calendarioGuardado = (clientId, cal) => setClients((prev) => prev.map((c) => {
    if (c.id !== clientId) return c;
    const cals = c.calendars || [];
    return { ...c, calendars: cals.some((k) => k.id === cal.id) ? cals.map((k) => (k.id === cal.id ? cal : k)) : [...cals, cal] };
  }));
  // Lo pendiente de ese calendario ya va dentro de lo que guarda «Subir»
  // (sale del estado); si se guardara después, pisaría la publicación nueva.
  const soltarPendiente = (calId) => {
    clearTimeout(saveTimers.current.get(calId));
    saveTimers.current.delete(calId);
    pendingSaves.current.delete(calId);
  };
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
  const tareasAcopladas = showTareas && anchoAmplio;

  return (
    <div className="app-shell" data-lateral={chatAcoplado || tareasAcopladas ? "acoplado" : undefined}>
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
          {!yo.soloLectura && (
            <button type="button" className="btn btn-primary btn-sm boton-subir" onClick={() => setShowSubir(true)} aria-label="Subir contenido">
              <Icon name="upload" size={16} /> <span className="boton-subir-texto">Subir</span>
            </button>
          )}
          <MedidorIA pulso={pulso} />
          <button
            type="button"
            className="btn-icon boton-tareas"
            onClick={alternarTareas}
            aria-pressed={showTareas}
            aria-label="Tareas de hoy"
            title="Tareas"
          >
            <Icon name="clipboardCheck" size={20} />
            <ContadorAtrasadas pulso={pulso} />
          </button>
          <Avisos pulso={pulso} onAbrirPublicacion={abrirPublicacionDeCola} />
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
            {yo.soloLectura && (
              <p className="notice" role="note" style={{ display: "block" }}>
                <Icon name="alert" size={14} /> Tu papel es de <strong>sólo lectura</strong>: puedes mirar todo, pero lo que cambies no se guarda.
              </p>
            )}
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
                <Equipo presentes={presentes} yo={yo} pulso={pulso} clients={clients} onVolver={() => navegar("/")} />
              </Suspense>
            ) : ruta.vista === "tablero" ? (
              <Suspense fallback={<Cargando />}>
                <Tablero
                  clients={clients}
                  pulso={pulso}
                  onAbrir={abrirPublicacionDeCola}
                  onCalendarioGuardado={calendarioGuardado}
                  soltarPendiente={soltarPendiente}
                />
              </Suspense>
            ) : ruta.vista === "bandeja" ? (
              <Suspense fallback={<Cargando />}>
                <Bandeja clients={clients} pulso={pulso} yo={yo} />
              </Suspense>
            ) : ruta.vista === "programacion" ? (
              <Suspense fallback={<Cargando />}>
                <Programacion
                  clients={clients}
                  pulso={pulso}
                  onAbrir={abrirPublicacionDeCola}
                  onSubir={() => setShowSubir(true)}
                  onCalendarioGuardado={calendarioGuardado}
                  soltarPendiente={soltarPendiente}
                />
              </Suspense>
            ) : ruta.vista === "a-mano" ? (
              <Suspense fallback={<Cargando />}>
                <PublicarAMano clients={clients} ruta={ruta} onGuardado={updateCalendarLocal} />
              </Suspense>
            ) : ruta.vista === "conectar-claude" ? (
              <Suspense fallback={<Cargando />}>
                <ConectarClaude yo={yo} />
              </Suspense>
            ) : ruta.vista === "auditorias" ? (
              <Suspense fallback={<Cargando />}>
                <Auditorias clients={clients} pulso={pulso} />
              </Suspense>
            ) : ruta.vista === "biblioteca" ? (
              <Suspense fallback={<Cargando />}>
                <Biblioteca clients={clients} pulso={pulso} />
              </Suspense>
            ) : ruta.vista === "campanas" ? (
              <Suspense fallback={<Cargando />}>
                <Campanas clients={clients} pulso={pulso} yo={yo} />
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
                      {/* Ya no se crea un calendario por mes: el asistente
                          PLANIFICA el mes que se elija, dentro del mismo calendario. */}
                      <button className="btn btn-primary" onClick={() => setShowWizard(true)}>
                        <Icon name="sparkles" size={18} /> Planificar mes
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
                  <PestanasCliente nombre={client.name} pestana={pestana} onElegir={(id) => (id === "calendario" ? irA(client.id, selectedCalId) : irAPestana(id))} />
                </div>

                <Suspense fallback={<Cargando />}>
                {pestana === "tareas" && <TaskPanel client={client} pulso={pulso} />}

                {pestana === "contenido" && (
                  <PestanaContenido client={client} pulso={pulso} onPersistClient={persistClient} />
                )}

                {pestana === "ideas" && (
                  <IdeasBank
                    client={client}
                    onUpdateClient={alCambiarBanco}
                  />
                )}

                {pestana === "resultados" && (
                  <Resultados client={client} pulso={pulso} onPersistClient={persistClient} />
                )}

                {pestana === "estudio" && <Estudio key={client.id} client={client} pulso={pulso} />}

                {pestana === "cerebro" && <Cerebro client={client} />}

                {pestana === "ficha" && (
                  <FichaCliente
                    client={client}
                    onEditar={() => { setEditingClient(client); setShowClientModal(true); }}
                  />
                )}
                </Suspense>

                {pestana === "calendario" && (
                  <NavegadorMes
                    mes={mesVisto}
                    onIr={(m) => irAMes(client.id, m)}
                    conContenido={(client.calendars ?? []).filter((k) => (k.days ?? []).some((d) => d.posts?.length))}
                  />
                )}

                {pestana === "calendario" && (calendar ? (
                  <CalendarView
                    // Una vista por mes: al pasar de mes no se arrastra el
                    // panel abierto ni la semana desplegada del anterior.
                    key={`${client.id}-${mesVisto.year}-${mesVisto.month}`}
                    client={client}
                    cal={calendar}
                    calId={selectedCalId}
                    pulso={pulso}
                    editandoOtros={editandoOtros}
                    abrirPublicacion={postPedido?.calId === selectedCalId ? postPedido.postId : null}
                    onPublicacionAbierta={publicacionAbierta}
                    onUpdateCal={esVirtual(calendar) ? (_id, cambiado) => escribirEnMesVacio(calendar, cambiado) : updateCalendar}
                    onUpdateCalLocal={updateCalendarLocal}
                    onDeleteCal={deleteCalendar}
                    onMoverAOtroMes={(postId, fecha, opciones) => moverAOtroMes(calendar, postId, fecha, opciones)}
                    vecinos={diasVecinos(client.calendars ?? [], mesVisto)}
                    onAbrirVecina={(calVecino, postId) => { setPostPedido({ calId: calVecino.id, postId }); irAMes(client.id, calVecino); }}
                    onUpdateClient={alCambiarBanco}
                    onMoveBankToCal={ideaAlCalendario}
                    onGuardarFechas={guardarFechasCliente}
                  />
                ) : null)}
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
        onSubir={() => setShowSubir(true)}
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

        {showSubir && (
          <SubirRapido
            clients={clients}
            clienteInicial={selectedClientId || foco}
            onCalendarioGuardado={calendarioGuardado}
            soltarPendiente={soltarPendiente}
            onAbrir={abrirPublicacionDeCola}
            onClose={() => setShowSubir(false)}
          />
        )}

        {showWizard && client && (
          <PlanWizard
            client={client}
            mesInicial={mesVisto}
            onGenerate={handleWizardGenerate}
            onClose={() => setShowWizard(false)}
          />
        )}

        {showClientModal && (
          <ClientModal
            initial={editingClient}
            onSave={saveClient}
            onDelete={esAdmin() ? deleteClient : null}
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

      {showTareas && (
        <Suspense fallback={null}>
          <PanelTareas
            clients={clients}
            pulso={pulso}
            yo={yo}
            clienteActual={client ? client.dbId || client.id : null}
            acoplado={tareasAcopladas}
            onCerrar={() => setShowTareas(false)}
            onSelectClient={(id) => {
              irA(id);
              if (!tareasAcopladas) setShowTareas(false);
            }}
          />
        </Suspense>
      )}

      {showChat && (
        <Suspense fallback={null}>
          <ChatPanel
            client={client}
            calendar={calendar}
            calId={selectedCalId}
            clients={clients}
            acoplado={chatAcoplado}
            // Un mes sin cajón se escribe igual que desde el calendario.
            onUpdateCal={esVirtual(calendar) ? (_id, cambiado) => escribirEnMesVacio(calendar, cambiado) : updateCalendar}
            onCrearEnOtroMes={crearEnOtroMes}
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
