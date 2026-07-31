import { useState, useEffect, useRef } from "react";
import { MONTHS } from "./constants";
import { uid, lsGet, lsSet } from "./utils";
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

function App() {
  if (isApprovalPage()) return <Aprobar />;
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
        } else if (data.aprobaciones && data.calendarioId) {
          importReviewsData(data);
        }
      } catch {
        alert("Archivo invalido");
      }
    };
    reader.readAsText(file);
  };

  const importReviewsData = (reviewData) => {
    if (!calendar) {
      alert("Selecciona un calendario primero.");
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
    alert(`Importadas ${updated} revisiones.`);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <div>Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Header */}
      <header
        style={{
          background: "var(--card)",
          borderBottom: "1px solid var(--accent)" + "22",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn-icon" onClick={() => setShowSidebar(true)}>☰</button>
          <div
            style={{
              background: "linear-gradient(135deg,#1B3A6B,var(--accent))",
              padding: "5px 8px",
              borderRadius: 8,
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            JA
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {client?.name || "Juancito Ads"}
            </div>
            <div style={{ fontSize: 9, color: "var(--accent)" }}>Calendarios</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {client && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowWizard(true)}>
              ⚡ Nuevo
            </button>
          )}
          <button
            className="btn btn-secondary btn-sm"
            style={!apiKey ? { background: "#2a1a0a", color: "var(--accent-alt)", borderColor: "var(--accent-alt)" } : {}}
            onClick={() => setShowApiSetup(true)}
          >
            ⚙️{!apiKey && " IA"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportJSON}>⬇️</button>
          <button className="btn btn-secondary btn-sm" onClick={() => importRef.current?.click()}>⬆️</button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) importJSON(f);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </div>
      </header>

      {/* Sidebar overlay */}
      {showSidebar && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
          <div onClick={() => setShowSidebar(false)} style={{ flex: 1, background: "rgba(0,0,0,.6)" }} />
          <div
            style={{
              width: 280,
              background: "var(--card)",
              borderLeft: "1px solid var(--border)",
              padding: 18,
              overflowY: "auto",
              animation: "slideIn .25s ease-out",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <span className="label" style={{ margin: 0, letterSpacing: 1 }}>Clientes</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setEditingClient(null);
                    setShowClientModal(true);
                    setShowSidebar(false);
                  }}
                >
                  + Nuevo
                </button>
                <button className="btn-icon" onClick={() => setShowSidebar(false)}>✕</button>
              </div>
            </div>
            {clients.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setSelectedClientId(c.id);
                  setSelectedCalId(null);
                  setShowSidebar(false);
                }}
                style={{
                  padding: "11px 13px",
                  borderRadius: 10,
                  cursor: "pointer",
                  marginBottom: 6,
                  background: selectedClientId === c.id ? "#1B3A6B" : "var(--card-alt)",
                  border: `1px solid ${selectedClientId === c.id ? "var(--accent)" : "transparent"}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {c.logo ? (
                  <img src={c.logo} alt="" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, background: "#fff", padding: 2, flexShrink: 0 }} />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: (c.primaryColor || "var(--accent)") + "44",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 14,
                    }}
                  >
                    🏢
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.industry} · {(c.calendars || []).length} cal</div>
                </div>
              </div>
            ))}
            {clients.length === 0 && (
              <div style={{ textAlign: "center", padding: 30, color: "var(--text-dim)" }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 12 }}>Sin clientes aún</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <main style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {client ? (
          <div>
            {/* Client header card */}
            <div
              className="card"
              style={{
                padding: 13,
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {client.logo ? (
                  <img src={client.logo} alt="" style={{ width: 38, height: 38, objectFit: "contain", borderRadius: 7, background: "#fff", padding: 3 }} />
                ) : (
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 7,
                      background: (client.primaryColor || "var(--accent)") + "33",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    🏢
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{client.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {client.industry}
                    {client.instagram && ` · ${client.instagram}`}
                  </div>
                </div>
              </div>
              <button
                className="btn-icon"
                onClick={() => {
                  setEditingClient(client);
                  setShowClientModal(true);
                }}
              >
                ✏️
              </button>
            </div>

            {/* Calendar tabs */}
            {client.calendars?.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
                {client.calendars.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCalId(c.id)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      background: selectedCalId === c.id ? "var(--accent)" : "var(--card-alt)",
                      color: "#fff",
                      border: `1px solid ${selectedCalId === c.id ? "var(--accent)" : "var(--border)"}`,
                      flexShrink: 0,
                      minHeight: 36,
                    }}
                  >
                    {c.name || MONTHS[c.month] + " " + c.year}
                  </button>
                ))}
              </div>
            )}

            {/* Calendar view or empty state */}
            {calendar ? (
              <CalendarView
                client={client}
                cal={calendar}
                calId={selectedCalId}
                apiKey={apiKey}
                onUpdateCal={updateCalendar}
                onDeleteCal={deleteCalendar}
                onDuplicateCal={duplicateCalendar}
              />
            ) : (
              <div style={{ textAlign: "center", padding: 50, border: "2px dashed var(--border)", borderRadius: 16, color: "var(--text-muted)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {client.calendars?.length > 0 ? "Selecciona un calendario arriba" : "Sin calendarios"}
                </div>
                <div style={{ fontSize: 12, marginTop: 6, color: "var(--text-dim)" }}>
                  Toca "⚡ Nuevo" para crear uno
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {clients.length > 0 ? "Toca ☰ para seleccionar un cliente" : "Crea tu primer cliente con ☰ → + Nuevo"}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
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
