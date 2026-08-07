import { useState, useEffect, useRef } from "react";
import { MONTHS } from "./constants";
import { uid, lsGet, lsSet } from "./utils";
import { useDialogA11y } from "./hooks/useDialogA11y";
import Icon from "./components/Icon";
import ApiSetup from "./components/ApiSetup";
import ClientModal from "./components/ClientModal";
import PlanWizard from "./components/PlanWizard";
import CalendarView from "./components/CalendarView";
import Aprobar from "./pages/Aprobar";

const STORAGE_KEY = "jads-data";

const isApprovalPage = () => {
  const path = window.location.pathname;
  return path.includes("/aprobar") || window.location.hash.includes("/aprobar");
};

/**
 * Enrutador. Es un componente sin hooks para que la rama condicional
 * no altere el orden de los hooks de Workspace (regla de los hooks).
 */
function App() {
  return isApprovalPage() ? <Aprobar /> : <Workspace />;
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

function Workspace() {
  const [clients, setClients] = useState([]);
  const [apiKey, setApiKey] = useState(() => lsGet("ja-apikey") || "");
  const [showApiSetup, setShowApiSetup] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedCalId, setSelectedCalId] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const importRef = useRef();

  useEffect(() => {
    try {
      const raw = lsGet(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        setClients(data);
        if (data.length) setSelectedClientId(data[0].id);
      }
    } catch { /* empty storage */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!loading) lsSet(STORAGE_KEY, JSON.stringify(clients));
  }, [clients, loading]);

  // Los mensajes se anuncian en una región aria-live en lugar de alert(),
  // que interrumpe al lector de pantalla y bloquea la interfaz.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const client = clients.find((c) => c.id === selectedClientId);
  const calendar = client?.calendars?.find((c) => c.id === selectedCalId);

  const saveClient = (c) => {
    setClients((prev) => {
      const exists = prev.find((x) => x.id === c.id);
      return exists ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c];
    });
    setSelectedClientId(c.id);
    setSelectedCalId(null);
    setEditingClient(null);
    setShowClientModal(false);
  };

  const deleteClient = (id) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (selectedClientId === id) {
      setSelectedClientId(null);
      setSelectedCalId(null);
    }
  };

  const updateCalendar = (calId, updatedCal) => {
    setClients((prev) =>
      prev.map((c) =>
        c.id !== selectedClientId ? c : { ...c, calendars: c.calendars.map((cal) => (cal.id === calId ? updatedCal : cal)) }
      )
    );
  };

  const deleteCalendar = (calId) => {
    setClients((prev) =>
      prev.map((c) =>
        c.id !== selectedClientId ? c : { ...c, calendars: c.calendars.filter((cal) => cal.id !== calId) }
      )
    );
    if (selectedCalId === calId) setSelectedCalId(null);
  };

  const duplicateCalendar = (calId) => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.id !== selectedClientId) return c;
        const original = c.calendars.find((cal) => cal.id === calId);
        if (!original) return c;
        const copy = JSON.parse(JSON.stringify(original));
        copy.id = "cal-" + uid();
        copy.name = (copy.name || MONTHS[copy.month] + " " + copy.year) + " (copia)";
        // La copia no hereda el enlace de aprobación: es un calendario nuevo.
        delete copy.approvalId;
        copy.days = copy.days.map((d) => ({
          ...d,
          posts: d.posts.map((p) => ({ ...p, id: uid(), status: "pending", script: "" })),
        }));
        return { ...c, calendars: [...c.calendars, copy] };
      })
    );
  };

  const handleWizardGenerate = (calendarData) => {
    const calId = "cal-" + uid();
    const newCal = {
      id: calId,
      name: calendarData.campaign || MONTHS[calendarData.month] + " " + calendarData.year,
      month: calendarData.month,
      year: calendarData.year,
      campaign: calendarData.campaign,
      weekConcepts: calendarData.weekConcepts,
      generatedAt: new Date().toISOString(),
      days: calendarData.days,
    };

    setClients((prev) =>
      prev.map((c) =>
        c.id !== selectedClientId ? c : { ...c, calendars: [...(c.calendars || []), newCal] }
      )
    );
    setSelectedCalId(calId);
    setShowWizard(false);
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
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.clients) {
          setClients(data.clients);
          if (data.clients.length) setSelectedClientId(data.clients[0].id);
          setSelectedCalId(null);
          setToast(`Importados ${data.clients.length} clientes.`);
        } else if (data.aprobaciones && data.calendarioId) {
          importReviewsData(data);
        } else {
          setToast("El archivo no contiene clientes ni revisiones.");
        }
      } catch {
        setToast("Archivo inválido: no se pudo leer el JSON.");
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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
        <p role="status" style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando…</p>
      </div>
    );
  }

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
          <span
            aria-hidden="true"
            style={{
              background: "linear-gradient(135deg,#1B3A6B,var(--accent))",
              padding: "6px 9px",
              borderRadius: "var(--radius-sm)",
              fontWeight: 800,
              fontSize: "var(--fs-2xs)",
              letterSpacing: ".02em",
              flexShrink: 0,
              color: "#fff",
            }}
          >
            JA
          </span>
          <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Juancito Ads
          </span>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0, alignItems: "center" }}>
          {!apiKey && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowApiSetup(true)}>
              <Icon name="sparkles" size={16} /> Conectar IA
            </button>
          )}
          {apiKey && (
            <button className="btn-icon" onClick={() => setShowApiSetup(true)} aria-label="Configurar IA">
              <Icon name="settings" />
            </button>
          )}
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

                {calendar ? (
                  <CalendarView
                    client={client}
                    cal={calendar}
                    calId={selectedCalId}
                    apiKey={apiKey}
                    onUpdateCal={updateCalendar}
                    onDeleteCal={deleteCalendar}
                    onDuplicateCal={duplicateCalendar}
                    onUpdateClient={(updated) => setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c))}
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
          apiKey={apiKey}
          onGenerate={handleWizardGenerate}
          onClose={() => setShowWizard(false)}
        />
      )}

      {showClientModal && (
        <ClientModal
          initial={editingClient}
          onSave={saveClient}
          onDelete={deleteClient}
          apiKey={apiKey}
          onClose={() => {
            setShowClientModal(false);
            setEditingClient(null);
          }}
        />
      )}

      {showApiSetup && (
        <ApiSetup
          onDone={(k) => {
            setApiKey(k);
            setShowApiSetup(false);
          }}
          onClose={() => setShowApiSetup(false)}
        />
      )}
    </div>
  );
}

export default App;
