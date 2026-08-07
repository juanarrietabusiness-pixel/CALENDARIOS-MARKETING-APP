import { useState, useEffect, useRef } from "react";
import { MONTHS } from "./constants";
import { uid, lsGet, lsSet } from "./utils";
import { useDialogA11y } from "./hooks/useDialogA11y";
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

/** Panel lateral de clientes: diálogo modal con foco atrapado y cierre con Escape. */
function ClientSidebar({ clients, selectedClientId, onSelect, onNew, onClose, onExport, onImport }) {
  const dialogRef = useDialogA11y(onClose);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
      <button
        type="button"
        aria-label="Cerrar panel de clientes"
        onClick={onClose}
        style={{ flex: 1, background: "rgba(0,0,0,.6)", border: "none", cursor: "pointer" }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Clientes"
        style={{
          width: 300,
          maxWidth: "88vw",
          background: "var(--card)",
          borderLeft: "1px solid var(--border)",
          padding: "var(--sp-4)",
          paddingTop: "calc(var(--sp-4) + var(--safe-top))",
          paddingBottom: "calc(var(--sp-4) + var(--safe-bottom))",
          overflowY: "auto",
          animation: "slideIn .25s ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
          <h2 className="label" style={{ margin: 0 }}>Clientes</h2>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <button className="btn btn-primary btn-sm" onClick={onNew}>+ Nuevo</button>
            <button className="btn-icon" onClick={onClose} aria-label="Cerrar panel de clientes">✕</button>
          </div>
        </div>

        {clients.length === 0 ? (
          <div className="empty-state" style={{ padding: "var(--sp-6) var(--sp-3)" }}>
            <div className="empty-state-icon" aria-hidden="true">📋</div>
            <p className="empty-state-text">Sin clientes aún</p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {clients.map((c) => {
              const isSelected = selectedClientId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className="tap-row"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => onSelect(c.id)}
                    style={{
                      padding: "var(--sp-3)",
                      borderRadius: "var(--radius-sm)",
                      background: isSelected ? "#1B3A6B" : "var(--card-alt)",
                      border: `1px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                    }}
                  >
                    {c.logo ? (
                      <img
                        src={c.logo}
                        alt=""
                        style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 6, background: "#fff", padding: 2, flexShrink: 0 }}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 34, height: 34, borderRadius: 6,
                          background: "var(--card-alt)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, fontSize: "var(--fs-md)",
                        }}
                      >
                        🏢
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: "var(--fs-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </span>
                      <span style={{ display: "block", fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
                        {c.industry || "Sin industria"} · {(c.calendars || []).length} calendario{(c.calendars || []).length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Copia de seguridad: acciones globales, no por cliente. Antes vivían
            en la cabecera y a 360px aplastaban el nombre del cliente. */}
        <div style={{ marginTop: "var(--sp-6)", paddingTop: "var(--sp-4)", borderTop: "1px solid var(--border)" }}>
          <h3 className="label">Copia de seguridad</h3>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onExport}>
              <span aria-hidden="true">⬇️</span> Exportar
            </button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onImport}>
              <span aria-hidden="true">⬆️</span> Importar
            </button>
          </div>
          <p className="hint">Descarga o restaura todos tus clientes y calendarios en un archivo JSON.</p>
        </div>
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
  const [showSidebar, setShowSidebar] = useState(false);
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

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
        <p role="status" style={{ textAlign: "center", color: "var(--text-dim)" }}>
          <span aria-hidden="true" style={{ fontSize: "2.5rem", display: "block", marginBottom: "var(--sp-3)" }}>⚡</span>
          Cargando…
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>

      <header
        style={{
          background: "var(--card)",
          borderBottom: "1px solid var(--border)",
          height: "calc(var(--header-h) + var(--safe-top))",
          paddingTop: "var(--safe-top)",
          paddingLeft: "calc(var(--sp-3) + var(--safe-left))",
          paddingRight: "calc(var(--sp-3) + var(--safe-right))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-2)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        {/* min-width:0 en toda la cadena flex: sin él el bloque de texto no
            puede encogerse y el nombre del cliente se partía letra a letra. */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", minWidth: 0, flex: 1, overflow: "hidden" }}>
          <button className="btn-icon" onClick={() => setShowSidebar(true)} aria-label="Abrir lista de clientes" aria-expanded={showSidebar}>
            ☰
          </button>
          <span
            aria-hidden="true"
            style={{
              background: "linear-gradient(135deg,#1B3A6B,var(--accent))",
              padding: "6px 9px",
              borderRadius: 8,
              fontWeight: 900,
              fontSize: "var(--fs-2xs)",
              flexShrink: 0,
            }}
          >
            JA
          </span>
          <span style={{ minWidth: 0, overflow: "hidden" }}>
            <span style={{ display: "block", fontWeight: 700, fontSize: "var(--fs-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {client?.name || "Juancito Ads"}
            </span>
            <span style={{ display: "block", fontSize: "var(--fs-3xs)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Calendarios
            </span>
          </span>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0 }}>
          {client && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowWizard(true)}>
              <span aria-hidden="true">⚡</span> Nuevo
            </button>
          )}
          <button
            className="btn-icon"
            style={!apiKey ? { background: "#2a1a0a", color: "var(--accent-alt)", borderColor: "var(--accent-alt)" } : undefined}
            onClick={() => setShowApiSetup(true)}
            aria-label={apiKey ? "Configurar IA" : "Configurar IA (sin API key)"}
          >
            ⚙️
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

      {/* Región de anuncios: sustituye a alert() para mensajes no bloqueantes */}
      <div role="status" aria-live="polite" className={toast ? undefined : "sr-only"}>
        {toast && (
          <p className="notice notice-ok" style={{ margin: "var(--sp-3) var(--sp-3) 0" }}>
            {toast}
          </p>
        )}
      </div>

      {showSidebar && (
        <ClientSidebar
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={(id) => {
            setSelectedClientId(id);
            setSelectedCalId(null);
            setShowSidebar(false);
          }}
          onNew={() => {
            setEditingClient(null);
            setShowClientModal(true);
            setShowSidebar(false);
          }}
          onExport={exportJSON}
          onImport={() => importRef.current?.click()}
          onClose={() => setShowSidebar(false)}
        />
      )}

      <main
        id="contenido"
        style={{
          flex: 1,
          padding: "var(--sp-3)",
          paddingLeft: "calc(var(--sp-3) + var(--safe-left))",
          paddingRight: "calc(var(--sp-3) + var(--safe-right))",
          paddingBottom: "calc(var(--sp-6) + var(--safe-bottom))",
        }}
      >
        {client ? (
          <div>
            <div
              className="card"
              style={{ padding: "var(--sp-3)", marginBottom: "var(--sp-3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", minWidth: 0 }}>
                {client.logo ? (
                  <img src={client.logo} alt={`Logo de ${client.name}`} style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8, background: "#fff", padding: 3, flexShrink: 0 }} />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ width: 40, height: 40, borderRadius: 8, background: "var(--card-alt)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >
                    🏢
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ fontWeight: 700, fontSize: "var(--fs-md)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.name}</h1>
                  <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
                    {client.industry}
                    {client.instagram && ` · ${client.instagram}`}
                  </p>
                </div>
              </div>
              <button
                className="btn-icon"
                aria-label={`Editar cliente ${client.name}`}
                onClick={() => {
                  setEditingClient(client);
                  setShowClientModal(true);
                }}
              >
                ✏️
              </button>
            </div>

            {client.calendars?.length > 0 && (
              <nav aria-label="Calendarios del cliente" style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-3)", overflowX: "auto", paddingBottom: "var(--sp-1)" }}>
                {client.calendars.map((c) => {
                  const active = selectedCalId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCalId(c.id)}
                      aria-current={active ? "true" : undefined}
                      style={{
                        padding: "var(--sp-2) var(--sp-3)",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        fontSize: "var(--fs-2xs)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        background: active ? "var(--accent)" : "var(--card-alt)",
                        color: "#fff",
                        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                        flexShrink: 0,
                        minHeight: "var(--tap-sm)",
                      }}
                    >
                      {c.name || MONTHS[c.month] + " " + c.year}
                    </button>
                  );
                })}
              </nav>
            )}

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
                <div className="empty-state-icon" aria-hidden="true">📅</div>
                <p className="empty-state-title">
                  {client.calendars?.length > 0 ? "Selecciona un calendario arriba" : "Sin calendarios"}
                </p>
                <p className="empty-state-text">Pulsa «⚡ Nuevo» para crear uno.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state" style={{ border: "none" }}>
            <div className="empty-state-icon" aria-hidden="true">📅</div>
            <p className="empty-state-title">
              {clients.length > 0 ? "Selecciona un cliente para empezar" : "Crea tu primer cliente"}
            </p>
            <p className="empty-state-text" style={{ marginBottom: "var(--sp-4)" }}>
              {clients.length > 0 ? "Abre la lista de clientes desde el menú." : "Necesitas un cliente antes de planificar calendarios."}
            </p>
            <button className="btn btn-primary" onClick={() => setShowSidebar(true)}>
              {clients.length > 0 ? "Ver clientes" : "Crear cliente"}
            </button>
          </div>
        )}
      </main>

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
