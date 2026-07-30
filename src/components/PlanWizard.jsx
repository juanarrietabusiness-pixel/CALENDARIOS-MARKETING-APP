import { useState, useRef } from "react";
import { PLANS, FORMATS, DEFAULT_CATEGORIES, MONTHS, DAYS, DAYS_SHORT } from "../constants";
import { uid, daysInMonth, fmtDate, getWeekNumber, dayName, parseVideoURL } from "../utils";
import { callAI, buildClientContext, fetchGitHubADN } from "../api";

const STEP_LABELS = ["Plan", "Fechas", "Campaña", "Conceptos", "Categorías", "Videos", "Ideas"];

function StepBar({ step, setStep }) {
  return (
    <div className="wizard-steps">
      {STEP_LABELS.map((label, i) => (
        <button
          key={i}
          className={`wizard-step ${i === step ? "active" : i < step ? "done" : ""}`}
          onClick={() => { if (i < step) setStep(i); }}
        >
          {i < step ? "✓" : i + 1}. {label}
        </button>
      ))}
    </div>
  );
}

export default function PlanWizard({ client, apiKey, onGenerate, onClose }) {
  const [step, setStep] = useState(0);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [plan, setPlan] = useState("standard");
  const [formatConfig, setFormatConfig] = useState(() => {
    const cfg = {};
    for (let dow = 0; dow < 7; dow++) {
      cfg[dow] = [{ format: "post" }, { format: "reel" }];
    }
    return cfg;
  });
  const [importantDates, setImportantDates] = useState([]);
  const [campaign, setCampaign] = useState("");
  const [weekConcepts, setWeekConcepts] = useState(["", "", "", "", ""]);
  const [dayCategories, setDayCategories] = useState(() => {
    const cats = {};
    for (let dow = 0; dow < 7; dow++) cats[dow] = "";
    return cats;
  });
  const [referenceVideos, setReferenceVideos] = useState([]);
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [ideas, setIdeas] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const generating = useRef(false);

  const allDays = daysInMonth(year, month);
  const postsPerDay = PLANS[plan]?.posts || 2;

  const goNext = () => setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const suggestDates = async () => {
    if (!apiKey) return;
    setAiLoading(true);
    setAiStatus("Buscando fechas importantes...");
    try {
      const ctx = buildClientContext(client);
      const prompt = `${ctx}\n\nDame 5-8 fechas importantes para ${MONTHS[month]} ${year} en Panamá relevantes para esta industria.
Formato JSON array: [{"date":"YYYY-MM-DD","name":"Nombre","relevant":true}]
Solo el JSON, nada más.`;
      const txt = await callAI(apiKey, prompt);
      const match = txt.match(/\[[\s\S]*?\]/);
      if (match) {
        const dates = JSON.parse(match[0]);
        setImportantDates((prev) => {
          const existing = new Set(prev.map((d) => d.date));
          return [...prev, ...dates.filter((d) => !existing.has(d.date))];
        });
      }
    } catch (e) {
      setAiStatus("Error: " + e.message);
    }
    setAiLoading(false);
    setAiStatus("");
  };

  const suggestCampaign = async () => {
    if (!apiKey) return;
    setAiLoading(true);
    setAiStatus("Generando sugerencias de campaña...");
    try {
      const ctx = buildClientContext(client);
      const prompt = `${ctx}\n\nSugiere 3 temas de campaña para ${MONTHS[month]} ${year}. Una línea por sugerencia. Solo las sugerencias, nada más.`;
      const txt = await callAI(apiKey, prompt);
      setCampaign(txt.split("\n").filter(Boolean)[0] || "");
    } catch (e) {
      setAiStatus("Error: " + e.message);
    }
    setAiLoading(false);
    setAiStatus("");
  };

  const suggestConcepts = async () => {
    if (!apiKey) return;
    setAiLoading(true);
    setAiStatus("Generando conceptos semanales...");
    try {
      const ctx = buildClientContext(client, { campaign });
      const numWeeks = Math.ceil(allDays.length / 7);
      const prompt = `${ctx}\n\nGenera ${numWeeks} conceptos semanales para el calendario de ${MONTHS[month]} ${year}.
Campaña: ${campaign || "N/A"}
Formato: una línea por semana, solo el concepto. ${numWeeks} líneas exactas.`;
      const txt = await callAI(apiKey, prompt);
      const lines = txt.split("\n").filter(Boolean).slice(0, 5);
      setWeekConcepts((prev) => prev.map((c, i) => c || lines[i] || ""));
    } catch (e) {
      setAiStatus("Error: " + e.message);
    }
    setAiLoading(false);
    setAiStatus("");
  };

  const generateIdeas = async () => {
    if (!apiKey || generating.current) return;
    generating.current = true;
    setAiLoading(true);
    setAiStatus("Generando ideas...");
    try {
      let adnExtra = "";
      if (client.githubRepo) {
        setAiStatus("Cargando ADN desde GitHub...");
        adnExtra = await fetchGitHubADN(client.githubRepo);
      }
      const ctx = buildClientContext(client, { campaign }, adnExtra);
      const daysList = allDays.map((d) => {
        const date = fmtDate(d);
        const dow = d.getDay();
        const wk = getWeekNumber(date, fmtDate(allDays[0]));
        const cat = dayCategories[dow] || "";
        const impDate = importantDates.find((id) => id.date === date);
        const formats = (formatConfig[dow] || []).slice(0, postsPerDay);
        const existingIdeas = ideas[date] || [];
        return { date, dow, wk, cat, impDate, formats, existingIdeas };
      });

      const BATCH = 7;
      const newIdeas = { ...ideas };
      for (let i = 0; i < daysList.length; i += BATCH) {
        const batch = daysList.slice(i, i + BATCH);
        setAiStatus(`Ideas ${i + 1}-${Math.min(i + BATCH, daysList.length)}/${daysList.length}...`);
        const daysDesc = batch
          .map((d) => {
            const fmts = d.formats.map((f) => f.format).join(", ");
            const existing = d.existingIdeas
              .filter((e) => e.idea)
              .map((e, j) => `  Post ${j + 1}: ${e.idea}`)
              .join("\n");
            return `${d.date} (${DAYS[d.dow]}) | Cat: ${d.cat || "libre"} | Semana ${d.wk}: ${weekConcepts[d.wk - 1] || "libre"} | Formatos: ${fmts}${d.impDate ? ` | FECHA ESPECIAL: ${d.impDate.name}` : ""}${existing ? `\n  Ideas existentes:\n${existing}` : ""}`;
          })
          .join("\n");

        const prompt = `${ctx}

CAMPAÑA: ${campaign || "N/A"}

Genera ideas para cada publicación de estos días.
Si ya hay idea existente, mejórala. Si no, genera una nueva.
Cada idea: 1-2 oraciones claras y accionables.

FORMATO DE RESPUESTA (respeta exactamente):
===DIA===
FECHA: YYYY-MM-DD
===POST===
FORMATO: formato
IDEA:
idea aquí
===POST===
FORMATO: formato
IDEA:
idea aquí
===FIN===

DÍAS:
${daysDesc}`;

        const txt = await callAI(apiKey, prompt);
        for (const block of txt.split("===DIA===").slice(1)) {
          const dateMatch = block.match(/FECHA:\s*([\d-]+)/);
          if (!dateMatch) continue;
          const date = dateMatch[1].trim();
          const posts = [];
          for (const pb of block.split("===POST===").slice(1)) {
            const fm = pb.match(/FORMATO:\s*(\S+)/);
            const im = pb.match(/IDEA:\n?([\s\S]*?)(?:===|$)/);
            if (im) {
              posts.push({
                format: (fm?.[1] || "post").toLowerCase().trim(),
                idea: im[1].trim(),
              });
            }
          }
          const dayData = daysList.find((d) => d.date === date);
          if (dayData) {
            const merged = dayData.formats.map((f, j) => {
              const existing = (newIdeas[date] || [])[j];
              const aiIdea = posts[j];
              return {
                id: existing?.id || uid(),
                format: f.format,
                idea: existing?.idea || aiIdea?.idea || "",
                referenceLink: existing?.referenceLink || "",
                image: existing?.image || null,
                script: "",
                status: "pending",
                category: dayData.cat,
              };
            });
            newIdeas[date] = merged;
          }
        }
        setIdeas({ ...newIdeas });
      }
    } catch (e) {
      setAiStatus("Error: " + e.message);
      setTimeout(() => setAiStatus(""), 3000);
    }
    setAiLoading(false);
    setAiStatus("");
    generating.current = false;
  };

  const handleGenerate = () => {
    const calDays = allDays.map((d) => {
      const date = fmtDate(d);
      const dow = d.getDay();
      const wk = getWeekNumber(date, fmtDate(allDays[0]));
      const cat = dayCategories[dow] || "";
      const impDate = importantDates.find((id) => id.date === date);
      const formats = (formatConfig[dow] || []).slice(0, postsPerDay);
      const dayIdeas = ideas[date] || [];

      const posts = formats.map((f, j) => {
        const idea = dayIdeas[j];
        const refVideo = referenceVideos.find((v) => v.assignedDate === date && v.postIndex === j);
        return {
          id: idea?.id || uid(),
          format: f.format,
          idea: idea?.idea || "",
          referenceLink: refVideo?.url || idea?.referenceLink || "",
          image: idea?.image || null,
          script: idea?.script || "",
          status: idea?.status || "pending",
          category: cat,
          comment: "",
        };
      });

      return {
        date,
        dayName: dayName(date),
        weekNumber: wk,
        concept: weekConcepts[wk - 1] || "",
        category: cat,
        specialDate: impDate?.name || "",
        posts,
      };
    });

    onGenerate({
      month,
      year,
      campaign,
      weekConcepts,
      days: calDays,
    });
  };

  return (
    <div className="overlay" style={{ alignItems: "flex-end" }}>
      <div
        style={{
          background: "var(--card)",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 600,
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px 0" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Planificar Calendario</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <StepBar step={step} setStep={setStep} />

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {/* Step 0: Plan selection */}
          {step === 0 && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label className="label">Mes</label>
                  <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
                <div style={{ width: 100 }}>
                  <label className="label">Año</label>
                  <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                    {[year - 1, year, year + 1, year + 2].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <label className="label" style={{ marginBottom: 8 }}>Plan de publicaciones</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {Object.entries(PLANS).map(([k, p]) => (
                  <button
                    key={k}
                    onClick={() => {
                      setPlan(k);
                      setFormatConfig((prev) => {
                        const cfg = {};
                        for (let dow = 0; dow < 7; dow++) {
                          const existing = prev[dow] || [];
                          cfg[dow] = Array.from({ length: p.posts }, (_, i) => existing[i] || { format: i === 0 ? "post" : "reel" });
                        }
                        return cfg;
                      });
                    }}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `2px solid ${plan === k ? "var(--accent)" : "var(--border)"}`,
                      cursor: "pointer",
                      background: plan === k ? "var(--accent)" + "22" : "var(--bg)",
                      color: "#fff",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{p.description}</div>
                  </button>
                ))}
              </div>
              <label className="label" style={{ marginBottom: 8 }}>Formatos por día</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                  <div key={dow} style={{ background: "var(--bg)", borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{DAYS[dow]}</div>
                    {(formatConfig[dow] || []).map((slot, si) => (
                      <div key={si} style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                        {Object.entries(FORMATS).map(([fk, f]) => (
                          <button
                            key={fk}
                            type="button"
                            onClick={() =>
                              setFormatConfig((prev) => ({
                                ...prev,
                                [dow]: prev[dow].map((s, j) => (j === si ? { format: fk } : s)),
                              }))
                            }
                            style={{
                              padding: "3px 8px",
                              borderRadius: 6,
                              border: `1px solid ${slot.format === fk ? f.color : "var(--border)"}`,
                              cursor: "pointer",
                              background: slot.format === fk ? f.color + "33" : "transparent",
                              color: slot.format === fk ? f.color : "var(--text-dim)",
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                          >
                            {f.icon} {f.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Important dates */}
          {step === 1 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <label className="label" style={{ margin: 0 }}>Fechas importantes</label>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={suggestDates}
                  disabled={aiLoading || !apiKey}
                >
                  {aiLoading ? "..." : "IA Sugerir"}
                </button>
              </div>
              {aiStatus && <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>{aiStatus}</div>}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input
                  className="input"
                  type="date"
                  id="newDateInput"
                  style={{ flex: 1 }}
                />
                <input className="input" id="newDateName" placeholder="Nombre" style={{ flex: 2 }} />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const dateEl = document.getElementById("newDateInput");
                    const nameEl = document.getElementById("newDateName");
                    if (dateEl.value && nameEl.value) {
                      setImportantDates((prev) => [...prev, { date: dateEl.value, name: nameEl.value }]);
                      dateEl.value = "";
                      nameEl.value = "";
                    }
                  }}
                >
                  +
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {importantDates.map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--bg)", borderRadius: 8 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{d.date}</span>
                      <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 8 }}>{d.name}</span>
                    </div>
                    <button
                      onClick={() => setImportantDates((prev) => prev.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {importantDates.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 20 }}>
                    Sin fechas especiales. Usa "IA Sugerir" o agrega manualmente.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Campaign theme */}
          {step === 2 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label className="label" style={{ margin: 0 }}>Tema de campaña del mes</label>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={suggestCampaign}
                  disabled={aiLoading || !apiKey}
                >
                  {aiLoading ? "..." : "IA Sugerir"}
                </button>
              </div>
              {aiStatus && <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>{aiStatus}</div>}
              <textarea
                className="textarea"
                style={{ minHeight: 80 }}
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="Ej: Promoción de Regreso a Clases — Agosto 2026"
              />
            </div>
          )}

          {/* Step 3: Weekly concepts */}
          {step === 3 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <label className="label" style={{ margin: 0 }}>Conceptos semanales</label>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={suggestConcepts}
                  disabled={aiLoading || !apiKey}
                >
                  {aiLoading ? "..." : "IA Sugerir"}
                </button>
              </div>
              {aiStatus && <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>{aiStatus}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {weekConcepts.map((c, i) => (
                  <div key={i}>
                    <label className="label">Semana {i + 1}</label>
                    <input
                      className="input"
                      value={c}
                      onChange={(e) => setWeekConcepts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                      placeholder={`Concepto de la semana ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Daily categories */}
          {step === 4 && (
            <div>
              <label className="label" style={{ marginBottom: 12 }}>Categoría por día de la semana</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                {DEFAULT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    className="filter-chip"
                    onClick={() => {
                      const emptyDow = Object.entries(dayCategories).find(([, v]) => !v);
                      if (emptyDow) setDayCategories((prev) => ({ ...prev, [emptyDow[0]]: cat }));
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                  <div key={dow} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--bg)", borderRadius: 8 }}>
                    <span style={{ fontWeight: 700, minWidth: 90, fontSize: 12 }}>{DAYS[dow]}</span>
                    <input
                      className="input"
                      style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}
                      value={dayCategories[dow] || ""}
                      onChange={(e) => setDayCategories((prev) => ({ ...prev, [dow]: e.target.value }))}
                      placeholder="Categoría..."
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Reference videos */}
          {step === 5 && (
            <div>
              <label className="label" style={{ marginBottom: 8 }}>Videos de referencia</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... o TikTok/Instagram"
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    if (newVideoUrl) {
                      setReferenceVideos((prev) => [...prev, { id: uid(), url: newVideoUrl, assignedDate: null, postIndex: 0 }]);
                      setNewVideoUrl("");
                    }
                  }}
                >
                  +
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {referenceVideos.map((v, i) => {
                  const parsed = parseVideoURL(v.url);
                  return (
                    <div key={v.id} style={{ background: "var(--bg)", borderRadius: 10, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {parsed?.type === "youtube" && (
                            <img src={parsed.thumbnail} alt="" style={{ width: "100%", maxWidth: 200, borderRadius: 6, marginBottom: 6 }} />
                          )}
                          <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {v.url}
                          </div>
                        </div>
                        <button
                          onClick={() => setReferenceVideos((prev) => prev.filter((_, j) => j !== i))}
                          style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, flexShrink: 0 }}
                        >
                          ✕
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <label style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>Asignar a:</label>
                        <select
                          className="input"
                          style={{ flex: 1, fontSize: 11, padding: "5px 8px" }}
                          value={v.assignedDate || ""}
                          onChange={(e) =>
                            setReferenceVideos((prev) => prev.map((vv, j) => (j === i ? { ...vv, assignedDate: e.target.value } : vv)))
                          }
                        >
                          <option value="">Sin asignar</option>
                          {allDays.map((d) => (
                            <option key={fmtDate(d)} value={fmtDate(d)}>
                              {d.getDate()} {DAYS_SHORT[d.getDay()]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
                {referenceVideos.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 20 }}>
                    Agrega URLs de YouTube, TikTok, Instagram o Vimeo.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 6: Ideas review */}
          {step === 6 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <label className="label" style={{ margin: 0 }}>Ideas por día</label>
                <button
                  className="btn btn-accent btn-sm"
                  onClick={generateIdeas}
                  disabled={aiLoading || !apiKey}
                >
                  {aiLoading ? aiStatus || "Generando..." : "IA Generar Ideas"}
                </button>
              </div>
              {aiStatus && <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>{aiStatus}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 8 }}>
                {DAYS_SHORT.map((d) => (
                  <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", padding: 4 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 16 }}>
                {(() => {
                  const first = new Date(year, month, 1);
                  const pad = first.getDay();
                  const cells = [];
                  for (let i = 0; i < pad; i++) cells.push(<div key={`p${i}`} />);
                  allDays.forEach((d) => {
                    const date = fmtDate(d);
                    const hasIdeas = ideas[date]?.some((p) => p.idea);
                    const impDate = importantDates.find((id) => id.date === date);
                    cells.push(
                      <div
                        key={date}
                        style={{
                          padding: 4,
                          textAlign: "center",
                          borderRadius: 6,
                          background: hasIdeas ? "var(--accent)" + "33" : "var(--bg)",
                          border: `1px solid ${impDate ? "var(--accent-alt)" : hasIdeas ? "var(--accent)" : "var(--border-light)"}`,
                          cursor: "default",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{d.getDate()}</div>
                        <div style={{ fontSize: 8, color: "var(--text-dim)" }}>{(ideas[date] || []).filter((p) => p.idea).length}/{postsPerDay}</div>
                      </div>
                    );
                  });
                  return cells;
                })()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
                {allDays.map((d) => {
                  const date = fmtDate(d);
                  const dayIdeas = ideas[date] || [];
                  if (!dayIdeas.length) return null;
                  return (
                    <div key={date} style={{ background: "var(--bg)", borderRadius: 8, padding: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                        {d.getDate()} {DAYS[d.getDay()]}
                      </div>
                      {dayIdeas.map((p, j) => (
                        <div key={j} style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
                          <span style={{ color: FORMATS[p.format]?.color || "var(--accent)", fontWeight: 600 }}>
                            {FORMATS[p.format]?.icon || "📄"} {j + 1}:
                          </span>{" "}
                          <input
                            className="input"
                            style={{ fontSize: 11, padding: "4px 8px", marginTop: 2 }}
                            value={p.idea || ""}
                            onChange={(e) => {
                              const newDayIdeas = [...dayIdeas];
                              newDayIdeas[j] = { ...newDayIdeas[j], idea: e.target.value };
                              setIdeas((prev) => ({ ...prev, [date]: newDayIdeas }));
                            }}
                            placeholder="Idea..."
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
          {step > 0 && (
            <button className="btn btn-secondary" onClick={goBack}>
              Atrás
            </button>
          )}
          <button className="btn btn-secondary" style={{ flex: step > 0 ? undefined : 1 }} onClick={onClose}>
            Cancelar
          </button>
          {step < STEP_LABELS.length - 1 ? (
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={goNext}>
              Siguiente
            </button>
          ) : (
            <button className="btn btn-accent" style={{ flex: 2 }} onClick={handleGenerate}>
              Crear Calendario
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
