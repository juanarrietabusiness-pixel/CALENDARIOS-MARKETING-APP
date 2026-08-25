import { useState, useEffect, useRef } from "react";
import { MONTHS } from "./constants";
import { uid } from "./utils";
import { useDialogA11y } from "./hooks/useDialogA11y";
import Icon from "./components/Icon";
// Importado (no ruta absoluta) para que Vite le ponga hash y respete la
// base del despliegue: el sitio también se publica bajo un subdirectorio.
import logoMark from "./assets/logo-mark.png";
import ClientModal from "./components/ClientModal";
import PlanWizard from "./components/PlanWizard";
import CalendarView from "./components/CalendarView";
import Aprobar from "./pages/Aprobar";
import IdeasBank from "./components/IdeasBank";
import Login from "./pages/Login";
import { isSupabaseEnabled } from "./lib/supabase";
import { useSession, signOut } from "./lib/auth";
import * as db from "./lib/db";
import { migrateLocalData } from "./lib/migrateLocal";

const isApprovalPage = () => {
  const path = window.location.pathname;
  return path.includes("/aprobar") || window.location.hash.includes("/aprobar");
};

/**
 * Enrutador. Es un componente sin hooks para que la rama condicional
 * no altere el orden de los hooks de los componentes de destino
 * (regla de los hooks).
 */
function App() {
  return isApprovalPage() ? <Aprobar /> : <Panel />;
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
function Panel() {
  const { session, loading } = useSession();

  if (!isSupabaseEnabled) {
    return (
      <Aviso tono="alert">
        Este despliegue no tiene Supabase configurado. Define VITE_SUPABASE_URL y
        VITE_SUPABASE_ANON_KEY en las variables del sitio y vuelve a desplegar.
      </Aviso>
    );
  }
  if (loading) return <Aviso>Cargando…</Aviso>;
  if (!session) return <Login />;
  return <Workspace session={session} />;
}

/** Lista de clientes. Se reutiliza en la barra fija y en el cajón móvil. */
function ClientList({ clients, selectedClientId, onSelect, onNew }) {
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
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Copia de seguridad: acciones globales, no de un cliente concreto. */
function BackupActions({ onExport, onImport }) {
  return (
    <div style={{ marginTop: "auto", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--border)" }}>
      <h3 className="label">Copia de seguridad</h3>
      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onExport}>
          <Icon name="download" size={16} /> Exportar
        </button>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onImport}>
          <Icon name="upload" size={16} /> Importar
        </button>
      </div>
    </div>
  );
}

/** Cajón de clientes en móvil: diálogo modal con foco atrapado. */
function ClientDrawer({ clients, selectedClientId, onSelect, onNew, onClose, onExport, onImport }) {
  const dialogRef = useDialogA11y(onClose);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
      <button
        type="button"
        aria-label="Cerrar lista de clientes"
        onClick={onClose}
        style={{ flex: 1, background: "rgba(2,6,16,.66)", border: "none", cursor: "pointer", backdropFilter: "blur(2px)" }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Clientes"
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
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar lista de clientes">
            <Icon name="close" />
          </button>
        </div>
        <ClientList
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={onSelect}
          onNew={onNew}
        />
        <BackupActions onExport={onExport} onImport={onImport} />
      </div>
    </div>
  );
}

function Workspace({ session }) {
  const ownerId = session.user.id;

  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedCalId, setSelectedCalId] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [saveError, setSaveError] = useState(null);
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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { migrados } = await migrateLocalData(ownerId);
        const data = await db.loadWorkspace();
        if (!alive) return;
        setClients(data);
        if (data.length) setSelectedClientId(data[0].id);
        if (migrados > 0) {
          setToast(`Se migraron ${migrados} clientes desde este navegador a la nube.`);
        }
      } catch (e) {
        if (alive) setLoadError(e.message || "No se pudieron cargar los datos.");
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [ownerId]);

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

  const client = clients.find((c) => c.id === selectedClientId);
  const calendar = client?.calendars?.find((c) => c.id === selectedCalId);

  const fallo = (accion) => (e) => setToast(`No se pudo ${accion}: ${e.message}`);

  // Deja escapar el error a propósito: ClientModal lo muestra dentro del
  // diálogo y lo mantiene abierto con los datos, en vez de cerrarse y
  // perderlos.
  const saveClient = async (c) => {
    const guardado = await db.saveClient(c, ownerId);
    setClients((prev) => {
      const exists = prev.find((x) => x.id === guardado.id);
      return exists ? prev.map((x) => (x.id === guardado.id ? guardado : x)) : [...prev, guardado];
    });
    setSelectedClientId(guardado.id);
    setSelectedCalId(null);
    setEditingClient(null);
    setShowClientModal(false);
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
      if (selectedClientId === id) {
        setSelectedClientId(null);
        setSelectedCalId(null);
      }
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
      if (selectedCalId === calId) setSelectedCalId(null);
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
      setSelectedCalId(creado.id);
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
          if (añadidos.length) setSelectedClientId(añadidos[0].id);
          setSelectedCalId(null);
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
    setSelectedClientId(id);
    setSelectedCalId(null);
    setShowDrawer(false);
  };

  if (loading) return <Aviso>Cargando tus clientes…</Aviso>;
  if (loadError) return <Aviso tono="alert">{loadError}</Aviso>;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          height: "calc(var(--header-h) + var(--safe-top))",
          paddingTop: "var(--safe-top)",
          paddingLeft: "calc(var(--sp-3) + var(--safe-left))",
          paddingRight: "calc(var(--sp-3) + var(--safe-right))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-3)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", minWidth: 0 }}>
          <button
            className="btn-icon menu-toggle"
            onClick={() => setShowDrawer(true)}
            aria-label="Abrir lista de clientes"
            aria-expanded={showDrawer}
          >
            <Icon name="menu" />
          </button>
          <img
            src={logoMark}
            alt=""
            width={32}
            height={32}
            style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }}
          />
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Juancito Ads
          </span>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0, alignItems: "center" }}>
          <span
            style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            className="session-email"
          >
            {session.user.email}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={signOut}>
            <Icon name="close" size={16} /> Salir
          </button>
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
        <aside className="app-sidebar" aria-label="Clientes">
          <ClientList
            clients={clients}
            selectedClientId={selectedClientId}
            onSelect={selectClient}
            onNew={openNewClient}
          />
          <BackupActions onExport={exportJSON} onImport={() => importRef.current?.click()} />
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

            {client ? (
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

                  {client.calendars?.length > 0 && (
                    <nav className="cal-tabs" aria-label="Calendarios del cliente">
                      {client.calendars.map((c) => (
                        <button
                          key={c.id}
                          className="cal-tab"
                          onClick={() => setSelectedCalId(c.id)}
                          aria-current={selectedCalId === c.id ? "true" : undefined}
                        >
                          {c.name || MONTHS[c.month] + " " + c.year}
                        </button>
                      ))}
                    </nav>
                  )}
                </div>

                {/* Ideas Bank at client level */}
                <IdeasBank
                  client={client}
                  onUpdateClient={(updated) => setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c))}
                />

                {calendar ? (
                  <CalendarView
                    client={client}
                    cal={calendar}
                    calId={selectedCalId}
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
                    <p className="empty-state-title">
                      {client.calendars?.length > 0 ? "Selecciona un calendario" : "Sin calendarios"}
                    </p>
                    <p className="empty-state-text">
                      {client.calendars?.length > 0
                        ? "Elige uno de los calendarios de arriba."
                        : "Crea el primer calendario de este cliente."}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state" style={{ border: "none", paddingTop: "var(--sp-10)" }}>
                <Icon name="users" size={40} className="empty-state-icon" style={{ margin: "0 auto var(--sp-3)" }} />
                <p className="empty-state-title">
                  {clients.length > 0 ? "Selecciona un cliente" : "Crea tu primer cliente"}
                </p>
                <p className="empty-state-text" style={{ marginBottom: "var(--sp-4)" }}>
                  {clients.length > 0
                    ? "Elige un cliente de la lista para ver sus calendarios."
                    : "Necesitas un cliente antes de planificar calendarios."}
                </p>
                <button className="btn btn-primary" onClick={clients.length > 0 ? () => setShowDrawer(true) : openNewClient}>
                  {clients.length > 0 ? "Ver clientes" : "Crear cliente"}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {showDrawer && (
        <ClientDrawer
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={selectClient}
          onNew={openNewClient}
          onExport={exportJSON}
          onImport={() => importRef.current?.click()}
          onClose={() => setShowDrawer(false)}
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
    </div>
  );
}

export default App;
