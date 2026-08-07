import { useId, useState, useRef } from "react";
import { PLANS, FORMATS, FORMAT_ICONS, DEFAULT_CATEGORIES, MONTHS, DAYS, DAYS_SHORT } from "../constants";
import { uid, daysInMonth, fmtDate, getWeekNumber, dayName, parseVideoURL } from "../utils";
import { callAI, buildClientContext, fetchGitHubADN } from "../api";
import { useDialogA11y } from "../hooks/useDialogA11y";
import Icon from "./Icon";

const STEP_LABELS = ["Plan", "Fechas", "Campaña", "Conceptos", "Categorías", "Vídeos", "Ideas"];

function StepBar({ step, setStep }) {
  return (
    <nav className="wizard-steps" aria-label={`Paso ${step + 1} de ${STEP_LABELS.length}: ${STEP_LABELS[step]}`}>
      {STEP_LABELS.map((label, i) => (
        <button
          key={i}
          type="button"
          className={`wizard-step ${i === step ? "active" : i < step ? "done" : ""}`}
          aria-current={i === step ? "step" : undefined}
          /* Los pasos futuros ya no eran pulsables pero seguían recibiendo
             foco y no lo comunicaban: ahora se deshabilitan de verdad. */
          disabled={i > step}
          onClick={() => { if (i < step) setStep(i); }}
        >
          {i < step ? <Icon name="check" size={14} /> : <span aria-hidden="true">{i + 1}.</span>} {label}
        </button>
      ))}
    </nav>
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
  const [ideaMode, setIdeaMode] = useState("day");
  const [dowIdeas, setDowIdeas] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newDateName, setNewDateName] = useState("");
  const generating = useRef(false);
  const ids = useId();
  const dialogRef = useDialogA11y(onClose);

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
      const prompt = `${ctx}\n\nDame 5-8 fechas importantes para ${MONTHS[month]} ${year} en Panama relevantes para esta industria.
Formato JSON array: [{"date":"YYYY-MM-DD","name":"Nombre","relevant":true}]
Solo el JSON, nada mas.`;
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
    setAiStatus("Generando sugerencias de campana...");
    try {
      const ctx = buildClientContext(client);
      const prompt = `${ctx}\n\nSugiere 3 temas de campana para ${MONTHS[month]} ${year}. Una linea por sugerencia. Solo las sugerencias, nada mas.`;
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
Campana: ${campaign || "N/A"}
Formato: una linea por semana, solo el concepto. ${numWeeks} lineas exactas.`;
      const txt = await callAI(apiKey, prompt);
      const lines = txt.split("\n").filter(Boolean).slice(0, 5);
      setWeekConcepts((prev) => prev.map((c, i) => c || lines[i] || ""));
    } catch (e) {
      setAiStatus("Error: " + e.message);
    }
    setAiLoading(false);
    setAiStatus("");
  };

  const applyDowIdeas = () => {
    const newIdeas = { ...ideas };
    allDays.forEach((d) => {
      const date = fmtDate(d);
      const dow = d.getDay();
      const dowIdeaList = dowIdeas[dow];
      if (!dowIdeaList || dowIdeaList.length === 0) return;
      const formats = (formatConfig[dow] || []).slice(0, postsPerDay);
      const existing = newIdeas[date] || [];
      newIdeas[date] = formats.map((f, j) => {
        const ex = existing[j];
        if (ex?.idea) return ex;
        const baseIdea = dowIdeaList[j % dowIdeaList.length]?.idea || "";
        return {
          id: ex?.id || uid(),
          format: f.format,
          idea: baseIdea,
          referenceLink: ex?.referenceLink || "",
          image: ex?.image || null,
          script: "",
          status: "pending",
          category: dayCategories[dow] || "",
        };
      });
    });
    setIdeas(newIdeas);
  };

  const generateIdeas = async () => {
    if (!apiKey || generating.current) return;
    generating.current = true;
    setAiLoading(true);
    setAiStatus("Generando ideas...");
    try {
      let adnExtra = client.githubContext || "";
      if (!adnExtra && client.githubRepo) {
        setAiStatus("Cargando ADN desde GitHub...");
        const result = await fetchGitHubADN(client.githubRepo, client.githubToken, client.githubFolder);
        adnExtra = result.content;
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

CAMPANA: ${campaign || "N/A"}

Genera ideas UNICAS para cada publicacion de estos dias.
IMPORTANTE: Cada idea debe ser DIFERENTE incluso si el dia de la semana es el mismo.
Si ya hay idea existente, mejorala. Si no, genera una nueva.
Cada idea: 1-2 oraciones claras y accionables.

FORMATO DE RESPUESTA (respeta exactamente):
===DIA===
FECHA: YYYY-MM-DD
===POST===
FORMATO: formato
IDEA:
idea aqui
===POST===
FORMATO: formato
IDEA:
idea aqui
===FIN===

DIAS:
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
          guion: "",
          descripcion: "",
          hashtagsFinales: "",
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
    <div className="overlay overlay-sheet">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet">
        <div className="sheet-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Planificar calendario</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar planificador"><Icon name="close" /></button>
        </div>

        <StepBar step={step} setStep={setStep} />

        <div className="sheet-body">
          <div role="status" aria-live="polite" className="sr-only">{aiLoading ? aiStatus : ""}</div>
          {/* Step 0: Plan selection */}
          {step === 0 && (
            <div>
              <div style={{ display: "flex", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
                <div style={{ flex: 1 }}>
                  <label className="label" htmlFor={`${ids}-month`}>Mes</label>
                  <select id={`${ids}-month`} className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label className="label" htmlFor={`${ids}-year`}>Año</label>
                  <select id={`${ids}-year`} className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                    {[year - 1, year, year + 1, year + 2].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <fieldset style={{ border: "none", marginBottom: "var(--sp-4)" }}>
                <legend className="label">Plan de publicaciones</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                {Object.entries(PLANS).map(([k, p]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={plan === k}
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
                      padding: "var(--sp-4)",
                      borderRadius: "var(--radius)",
                      border: `2px solid ${plan === k ? "var(--accent)" : "var(--border)"}`,
                      cursor: "pointer",
                      background: plan === k ? "var(--accent-soft)" : "var(--bg)",
                      color: "#fff",
                      textAlign: "left",
                      minHeight: "var(--tap)",
                    }}
                  >
                    <span style={{ display: "block", fontWeight: 700, fontSize: "var(--fs-sm)" }}>{p.label}</span>
                    <span style={{ display: "block", fontSize: "var(--fs-xs)", color: "var(--text-dim)", marginTop: 2 }}>{p.description}</span>
                  </button>
                ))}
              </div>
              </fieldset>

              <fieldset style={{ border: "none" }}>
                <legend className="label">Formatos por día</legend>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                    <div key={dow} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)" }}>
                      <p style={{ fontSize: "var(--fs-xs)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>{DAYS[dow]}</p>
                      {(formatConfig[dow] || []).map((slot, si) => (
                        <div key={si} role="group" aria-label={`${DAYS[dow]}, publicación ${si + 1}`} style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-2)" }}>
                          {Object.entries(FORMATS).map(([fk, f]) => (
                            <button
                              key={fk}
                              type="button"
                              aria-pressed={slot.format === fk}
                              onClick={() =>
                                setFormatConfig((prev) => ({
                                  ...prev,
                                  [dow]: prev[dow].map((s, j) => (j === si ? { format: fk } : s)),
                                }))
                              }
                              style={{
                                padding: "var(--sp-1) var(--sp-2)",
                                borderRadius: "var(--radius-xs)",
                                border: `1px solid ${slot.format === fk ? f.color : "var(--border)"}`,
                                cursor: "pointer",
                                background: slot.format === fk ? f.color + "33" : "transparent",
                                color: slot.format === fk ? f.color : "var(--text-dim)",
                                fontSize: "var(--fs-3xs)",
                                fontWeight: 600,
                                minHeight: "var(--tap-sm)",
                              }}
                            >
                              <Icon name={FORMAT_ICONS[fk]} size={14} /> {f.label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {/* Step 1: Important dates */}
          {step === 1 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
                <h3 className="label" style={{ margin: 0 }}>Fechas importantes</h3>
                <button className="btn btn-primary btn-sm" onClick={suggestDates} disabled={aiLoading || !apiKey}>
                  {aiLoading ? "Buscando…" : "Sugerir con IA"}
                </button>
              </div>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}

              {/* Antes estos dos campos se leían con document.getElementById y
                  se limpiaban mutando el DOM: React no conocía su valor. */}
              <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 140px" }}>
                  <label className="label" htmlFor={`${ids}-newdate`}>Fecha</label>
                  <input
                    id={`${ids}-newdate`}
                    className="input"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div style={{ flex: "2 1 160px" }}>
                  <label className="label" htmlFor={`${ids}-newdatename`}>Nombre</label>
                  <input
                    id={`${ids}-newdatename`}
                    className="input"
                    value={newDateName}
                    onChange={(e) => setNewDateName(e.target.value)}
                    placeholder="Ej: Día de la Madre"
                  />
                </div>
                <button
                  className="btn btn-secondary"
                  disabled={!newDate || !newDateName}
                  onClick={() => {
                    setImportantDates((prev) => [...prev, { date: newDate, name: newDateName }]);
                    setNewDate("");
                    setNewDateName("");
                  }}
                >
                  Agregar
                </button>
              </div>

              {importantDates.length === 0 ? (
                <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", textAlign: "center", padding: "var(--sp-5)" }}>
                  Sin fechas especiales. Usa «Sugerir con IA» o agrégalas a mano.
                </p>
              ) : (
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {importantDates.map((d, i) => (
                    <li key={`${d.date}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", borderRadius: "var(--radius-sm)" }}>
                      <span>
                        <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>{d.date}</span>
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", marginLeft: "var(--sp-2)" }}>{d.name}</span>
                      </span>
                      <button
                        type="button"
                        className="btn-remove"
                        aria-label={`Quitar ${d.name} del ${d.date}`}
                        onClick={() => setImportantDates((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Step 2: Campaign theme */}
          {step === 2 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-2)" }}>
                <label className="label" style={{ margin: 0 }} htmlFor={`${ids}-campaign`}>Tema de campaña del mes</label>
                <button className="btn btn-primary btn-sm" onClick={suggestCampaign} disabled={aiLoading || !apiKey}>
                  {aiLoading ? "Generando…" : "Sugerir con IA"}
                </button>
              </div>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}
              <textarea
                id={`${ids}-campaign`}
                className="textarea"
                style={{ minHeight: 100 }}
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="Ej: Promoción de Regreso a Clases"
              />
            </div>
          )}

          {/* Step 3: Weekly concepts */}
          {step === 3 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
                <h3 className="label" style={{ margin: 0 }}>Conceptos semanales</h3>
                <button className="btn btn-primary btn-sm" onClick={suggestConcepts} disabled={aiLoading || !apiKey}>
                  {aiLoading ? "Generando…" : "Sugerir con IA"}
                </button>
              </div>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                {weekConcepts.map((c, i) => (
                  <div key={i}>
                    <label className="label" htmlFor={`${ids}-wc-${i}`}>Semana {i + 1}</label>
                    <input
                      id={`${ids}-wc-${i}`}
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
              <h3 className="label">Categoría por día de la semana</h3>
              <div className="filter-bar" role="group" aria-label="Categorías sugeridas: al pulsar se asignan al primer día libre">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
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
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", marginTop: "var(--sp-3)" }}>
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                  <div key={dow} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)", borderRadius: "var(--radius-sm)" }}>
                    <label style={{ fontWeight: 700, minWidth: 84, fontSize: "var(--fs-xs)", flexShrink: 0 }} htmlFor={`${ids}-cat-${dow}`}>
                      {DAYS[dow]}
                    </label>
                    <input
                      id={`${ids}-cat-${dow}`}
                      className="input"
                      style={{ flex: 1 }}
                      value={dayCategories[dow] || ""}
                      onChange={(e) => setDayCategories((prev) => ({ ...prev, [dow]: e.target.value }))}
                      placeholder="Categoría…"
                    />
                    {dayCategories[dow] && (
                      <button
                        type="button"
                        className="btn-remove"
                        aria-label={`Borrar categoría de ${DAYS[dow]}`}
                        onClick={() => setDayCategories((prev) => ({ ...prev, [dow]: "" }))}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Reference videos */}
          {step === 5 && (
            <div>
              <label className="label" htmlFor={`${ids}-video`}>Vídeos de referencia</label>
              <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-3)" }}>
                <input
                  id={`${ids}-video`}
                  className="input"
                  type="url"
                  style={{ flex: 1 }}
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=…"
                />
                <button
                  className="btn btn-primary"
                  disabled={!newVideoUrl}
                  onClick={() => {
                    setReferenceVideos((prev) => [...prev, { id: uid(), url: newVideoUrl, assignedDate: null, postIndex: 0 }]);
                    setNewVideoUrl("");
                  }}
                >
                  Agregar
                </button>
              </div>
              <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>Acepta YouTube, TikTok, Instagram o Vimeo.</p>

              {referenceVideos.length === 0 ? (
                <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", textAlign: "center", padding: "var(--sp-5)" }}>
                  Aún no has añadido vídeos de referencia.
                </p>
              ) : (
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                  {referenceVideos.map((v, i) => {
                    const parsed = parseVideoURL(v.url);
                    return (
                      <li key={v.id} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {parsed?.type === "youtube" && (
                              <img src={parsed.thumbnail} alt="" style={{ width: "100%", maxWidth: 220, borderRadius: "var(--radius-xs)", marginBottom: "var(--sp-2)" }} />
                            )}
                            <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {v.url}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn-remove"
                            aria-label="Quitar vídeo de referencia"
                            onClick={() => setReferenceVideos((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
                          <label style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", flexShrink: 0 }} htmlFor={`${ids}-vid-${v.id}`}>
                            Asignar a:
                          </label>
                          <select
                            id={`${ids}-vid-${v.id}`}
                            className="input"
                            style={{ flex: 1 }}
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Step 6: Ideas review */}
          {step === 6 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
                <h3 className="label" style={{ margin: 0 }}>Ideas por día</h3>
                <button className="btn btn-accent btn-sm" onClick={generateIdeas} disabled={aiLoading || !apiKey}>
                  {aiLoading ? aiStatus || "Generando…" : "Generar ideas con IA"}
                </button>
              </div>
              {aiStatus && <p role="status" style={{ fontSize: "var(--fs-2xs)", color: "var(--accent)", marginBottom: "var(--sp-2)" }}>{aiStatus}</p>}

              {/* Idea entry mode toggle */}
              <div className="segmented" role="group" aria-label="Modo de entrada de ideas" style={{ marginBottom: "var(--sp-3)" }}>
                <button
                  type="button"
                  className={`segmented-btn ${ideaMode === "day" ? "active" : ""}`}
                  aria-pressed={ideaMode === "day"}
                  onClick={() => setIdeaMode("day")}
                >
                  Por día
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${ideaMode === "dow" ? "active" : ""}`}
                  aria-pressed={ideaMode === "dow"}
                  onClick={() => setIdeaMode("dow")}
                >
                  Por día de semana
                </button>
              </div>

              {/* By day-of-week mode */}
              {ideaMode === "dow" && (
                <div style={{ marginBottom: "var(--sp-4)" }}>
                  <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
                    Define una idea base por día de la semana. Se duplicará en todas las fechas de
                    ese día; la IA generará después versiones únicas para cada una.
                  </p>
                  {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                    const formats = (formatConfig[dow] || []).slice(0, postsPerDay);
                    const dowIdea = dowIdeas[dow] || [];
                    return (
                      <div key={dow} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", marginBottom: "var(--sp-2)" }}>
                        <p style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>
                          {DAYS[dow]}
                          {dayCategories[dow] && <span style={{ color: "var(--accent-alt)", fontWeight: 400, marginLeft: "var(--sp-2)" }}>{dayCategories[dow]}</span>}
                        </p>
                        {formats.map((f, j) => (
                          <div key={j} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                            <Icon name={FORMAT_ICONS[f.format] || "formatPost"} size={16} style={{ color: FORMATS[f.format]?.color, width: 22 }} />
                            <input
                              className="input"
                              style={{ flex: 1 }}
                              aria-label={`Idea base de ${DAYS[dow]}, ${FORMATS[f.format]?.label || "publicación"} ${j + 1}`}
                              value={dowIdea[j]?.idea || ""}
                              onChange={(e) => {
                                setDowIdeas((prev) => {
                                  const current = [...(prev[dow] || [])];
                                  while (current.length <= j) current.push({ idea: "" });
                                  current[j] = { ...current[j], idea: e.target.value };
                                  return { ...prev, [dow]: current };
                                });
                              }}
                              placeholder="Idea base (se duplicará)…"
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <button className="btn btn-primary" style={{ width: "100%", marginTop: "var(--sp-2)" }} onClick={applyDowIdeas}>
                    Aplicar a todos los días
                  </button>
                </div>
              )}

              {/* Mini calendario: sólo resumen visual del progreso */}
              <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2, marginBottom: "var(--sp-2)" }}>
                {DAYS_SHORT.map((d) => (
                  <div key={d} style={{ textAlign: "center", fontSize: "var(--fs-3xs)", fontWeight: 700, color: "var(--text-muted)", padding: "var(--sp-1)" }}>{d}</div>
                ))}
              </div>
              <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2, marginBottom: "var(--sp-2)" }}>
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
                          padding: "var(--sp-1)",
                          textAlign: "center",
                          borderRadius: "var(--radius-xs)",
                          background: hasIdeas ? "var(--accent-soft)" : "var(--bg)",
                          border: `1px solid ${impDate ? "var(--accent-alt)" : hasIdeas ? "var(--accent)" : "var(--border-light)"}`,
                        }}
                      >
                        <div style={{ fontSize: "var(--fs-2xs)", fontWeight: 700 }}>{d.getDate()}</div>
                        <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>{(ideas[date] || []).filter((p) => p.idea).length}/{postsPerDay}</div>
                      </div>
                    );
                  });
                  return cells;
                })()}
              </div>
              <p role="status" className="hint" style={{ marginBottom: "var(--sp-4)" }}>
                {Object.values(ideas).flat().filter((p) => p?.idea).length} ideas definidas de {allDays.length * postsPerDay} publicaciones.
              </p>

              {/* Per-day idea list */}
              {ideaMode === "day" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {allDays.map((d) => {
                    const date = fmtDate(d);
                    const dayIdeas = ideas[date] || [];
                    if (!dayIdeas.length) return null;
                    return (
                      <div key={date} style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)" }}>
                        <p style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>
                          {d.getDate()} {DAYS[d.getDay()]}
                        </p>
                        {dayIdeas.map((p, j) => (
                          <div key={j} style={{ marginBottom: "var(--sp-2)" }}>
                            <label
                              className="label"
                              style={{ textTransform: "none", color: FORMATS[p.format]?.color || "var(--accent)" }}
                              htmlFor={`${ids}-idea-${date}-${j}`}
                            >
                              <Icon name={FORMAT_ICONS[p.format] || "formatPost"} size={14} style={{ display: "inline-block", verticalAlign: "-2px" }} /> {FORMATS[p.format]?.label || "Publicación"} {j + 1}
                            </label>
                            <input
                              id={`${ids}-idea-${date}-${j}`}
                              className="input"
                              value={p.idea || ""}
                              onChange={(e) => {
                                const newDayIdeas = [...dayIdeas];
                                newDayIdeas[j] = { ...newDayIdeas[j], idea: e.target.value };
                                setIdeas((prev) => ({ ...prev, [date]: newDayIdeas }));
                              }}
                              placeholder="Idea…"
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sheet-footer">
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
              Crear calendario
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
