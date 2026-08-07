import { useId, useState, useRef } from "react";
import { FORMATS, DEFAULT_CATEGORIES } from "../constants";
import { uid, compressImage, createEmptyClient } from "../utils";
import { fetchGitHubADN, extractClientADN, parseGitHubUrl } from "../api";
import { useDialogA11y } from "../hooks/useDialogA11y";

const DAYS_ORDERED = [
  { dow: 1, name: "Lunes" },
  { dow: 2, name: "Martes" },
  { dow: 3, name: "Miercoles" },
  { dow: 4, name: "Jueves" },
  { dow: 5, name: "Viernes" },
  { dow: 6, name: "Sabado" },
  { dow: 0, name: "Domingo" },
];

function FormatPicker({ value, onChange, label }) {
  return (
    <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }} role="group" aria-label={label}>
      {Object.entries(FORMATS).map(([k, f]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          style={{
            padding: "var(--sp-2) var(--sp-3)",
            borderRadius: "var(--radius-xs)",
            border: `1px solid ${value === k ? f.color : "var(--border)"}`,
            cursor: "pointer",
            background: value === k ? f.color + "33" : "var(--card-alt)",
            color: value === k ? f.color : "var(--text-muted)",
            fontSize: "var(--fs-2xs)",
            fontWeight: 600,
            minHeight: "var(--tap-sm)",
          }}
        >
          <span aria-hidden="true">{f.icon}</span> {f.label}
        </button>
      ))}
    </div>
  );
}

function CategoryTemplates({ savedCategories, onLoad, onSave }) {
  const [templateName, setTemplateName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const inputId = useId();

  return (
    <div style={{ marginBottom: "var(--sp-3)" }}>
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-2)" }}>
        {(savedCategories || []).map((tpl, i) => (
          <button
            key={i}
            type="button"
            className="filter-chip"
            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" }}
            onClick={() => onLoad(tpl)}
          >
            {tpl.name}
          </button>
        ))}
        <button
          type="button"
          className="filter-chip"
          style={{ borderStyle: "dashed", background: "transparent" }}
          aria-expanded={showSave}
          onClick={() => setShowSave(!showSave)}
        >
          + Guardar plantilla
        </button>
      </div>
      {showSave && (
        <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-end", marginBottom: "var(--sp-2)" }}>
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor={inputId}>Nombre de la plantilla</label>
            <input
              id={inputId}
              className="input"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Ej: Estructura estándar"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!templateName}
            onClick={() => {
              onSave(templateName);
              setTemplateName("");
              setShowSave(false);
            }}
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}

export default function ClientModal({ initial, onSave, onDelete, onClose, apiKey }) {
  const blank = createEmptyClient();
  const [form, setForm] = useState(initial ? { ...initial } : blank);
  const [tab, setTab] = useState("basico");
  const [weekStructure, setWeekStructure] = useState(() =>
    DAYS_ORDERED.map(({ dow, name }) => {
      const existing = initial?.weeklyStructure?.find((s) => s.dayOfWeek === dow);
      return existing
        ? { dayOfWeek: dow, dayName: name, active: true, slots: existing.slots || [], categories: existing.categories || [""] }
        : { dayOfWeek: dow, dayName: name, active: false, slots: [], categories: [""] };
    })
  );
  const [ghStatus, setGhStatus] = useState("");
  const [ghFiles, setGhFiles] = useState([]);
  const [ghLoading, setGhLoading] = useState(false);
  const [adnExtracted, setAdnExtracted] = useState(null);
  const [adnSelected, setAdnSelected] = useState({});
  const [adnLoading, setAdnLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  const logoRef = useRef();
  const ids = useId();
  const dialogRef = useDialogA11y(onClose);
  const sf = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const ADN_FIELD_LABELS = {
    nombre: "Nombre",
    industria: "Industria",
    descripcion: "Descripcion",
    valores: "Valores",
    audiencia: "Audiencia",
    competencia: "Competencia",
    estiloGuion: "Estilo de guiones",
    estiloLocucion: "Estilo de locucion",
    hashtags: "Hashtags",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    sucursales: "Sucursales",
    notasInspeccion: "Notas de inspeccion",
  };

  const ADN_TO_FORM_KEY = {
    nombre: "name",
    industria: "industry",
    descripcion: "descripcion",
    valores: "valores",
    audiencia: "audiencia",
    competencia: "competencia",
    estiloGuion: "estiloGuion",
    estiloLocucion: "estiloLocucion",
    hashtags: "hashtags",
    whatsapp: "whatsapp",
    instagram: "instagram",
    sucursales: "sucursales",
    notasInspeccion: "notasInspeccion",
  };

  const [ghReadingPath, setGhReadingPath] = useState("");
  const [ghSubfolders, setGhSubfolders] = useState([]);

  const handleRepoUrlChange = (url) => {
    sf("githubRepo", url);
    const parsed = parseGitHubUrl(url);
    if (parsed && parsed.folder) {
      sf("githubFolder", parsed.folder);
    }
  };

  const testGitHub = async () => {
    if (!form.githubRepo) return;
    setGhLoading(true);
    setGhStatus("Conectando...");
    setAdnExtracted(null);
    setAdnSelected({});
    setGhReadingPath("");
    setGhSubfolders([]);

    const parsed = parseGitHubUrl(form.githubRepo);
    if (!parsed) { setGhStatus("URL invalida"); setGhLoading(false); return; }

    const folder = form.githubFolder || parsed.folder || "";
    const readingLabel = folder ? `${parsed.repo}/${folder}/` : `${parsed.repo}/`;
    setGhReadingPath(readingLabel);

    try {
      const result = await fetchGitHubADN(form.githubRepo, form.githubToken, folder);
      const fileList = result.files.map((f) => ({ name: f.name, path: f.path, size: f.size, selected: true }));
      setGhFiles(fileList);
      setGhSubfolders(result.subfolders || []);

      if (fileList.length === 0 && result.subfolders?.length > 0) {
        setGhStatus(`Conectado — ${result.subfolders.length} carpetas de clientes encontradas. Selecciona una carpeta abajo.`);
      } else {
        setGhStatus(fileList.length > 0 ? `Conectado (${fileList.length} archivos)` : "Conectado, sin archivos .md/.txt");
      }

      if (result.content) {
        sf("githubContext", result.content);

        if (apiKey) {
          setAdnLoading(true);
          setGhStatus("Analizando ADN con IA...");
          try {
            const extracted = await extractClientADN(apiKey, result.content);
            setAdnExtracted(extracted);
            const sel = {};
            Object.entries(extracted).forEach(([k, v]) => {
              if (v) sel[k] = true;
            });
            setAdnSelected(sel);
            setGhStatus(`ADN analizado — ${Object.values(sel).filter(Boolean).length} campos encontrados`);
          } catch (e) {
            setGhStatus("ADN cargado. Error al analizar: " + e.message);
          }
          setAdnLoading(false);
        }
      }
    } catch (e) {
      setGhStatus("Error: " + e.message);
    }
    setGhLoading(false);
  };

  const applyAdnFields = () => {
    if (!adnExtracted) return;
    Object.entries(adnSelected).forEach(([key, checked]) => {
      if (!checked || !adnExtracted[key]) return;
      const formKey = ADN_TO_FORM_KEY[key];
      if (formKey) sf(formKey, adnExtracted[key]);
    });
    setAdnExtracted(null);
    setAdnSelected({});
    setGhStatus("Campos aplicados al perfil");
  };

  const handleSave = () => {
    // Antes el botón simplemente no hacía nada si faltaba el nombre, sin
    // decir por qué ni llevar al campo que falla.
    if (!form.name?.trim()) {
      setNameError("El nombre del cliente es obligatorio.");
      setTab("basico");
      requestAnimationFrame(() => document.getElementById(`${ids}-name`)?.focus());
      return;
    }
    setNameError("");
    const ws = weekStructure
      .filter((s) => s.active && s.slots.length > 0)
      .map((s) => ({ ...s, categories: (s.categories || [""]).filter((c) => c) }));
    onSave({
      ...form,
      id: initial?.id || "client-" + uid(),
      weeklyStructure: ws,
      calendars: initial?.calendars || [],
      savedPlans: initial?.savedPlans || [],
      savedCategories: initial?.savedCategories || [],
    });
    onClose();
  };

  const saveCategoryTemplate = (name) => {
    const cats = {};
    weekStructure.forEach((s) => {
      if (s.active) cats[s.dayOfWeek] = s.categories || [""];
    });
    sf("savedCategories", [...(form.savedCategories || []), { name, categories: cats }]);
  };

  const loadCategoryTemplate = (tpl) => {
    setWeekStructure((prev) =>
      prev.map((s) => {
        const tplCats = tpl.categories[s.dayOfWeek];
        if (tplCats) return { ...s, active: true, categories: [...tplCats] };
        return s;
      })
    );
  };

  const TABS = [
    ["basico", "Básico"],
    ["adn", "ADN"],
    ["voz", "Voz"],
    ["github", "GitHub"],
    ["semanal", "Semanal"],
  ];

  return (
    <div className="overlay overlay-sheet">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 560 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>{initial ? "Editar cliente" : "Nuevo cliente"}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="sheet-body">
        {/* Pestañas con semántica de tablist para que el lector de pantalla
            anuncie cuántas hay y cuál está activa. */}
        <div className="segmented" role="tablist" aria-label="Secciones del cliente" style={{ marginBottom: "var(--sp-4)" }}>
          {TABS.map(([k, l]) => (
            <button
              key={k}
              role="tab"
              id={`${ids}-tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`${ids}-panel-${k}`}
              tabIndex={tab === k ? 0 : -1}
              className={`segmented-btn ${tab === k ? "active" : ""}`}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "basico" && (
          <div role="tabpanel" id={`${ids}-panel-basico`} aria-labelledby={`${ids}-tab-basico`} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            <div>
              <span className="label" id={`${ids}-logo-label`}>Logo</span>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                {form.logo ? (
                  <img src={form.logo} alt="Logo actual del cliente" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: "var(--radius-sm)", background: "#fff", padding: 3, flexShrink: 0 }} />
                ) : (
                  <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: "var(--radius-sm)", background: "var(--card-alt)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-xl)", flexShrink: 0 }}>
                    🏢
                  </span>
                )}
                <div style={{ flex: 1 }}>
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-labelledby={`${ids}-logo-label`}
                    onChange={async (e) => {
                      const f = e.target.files[0];
                      if (!f) return;
                      try {
                        sf("logo", await compressImage(f, 150));
                      } catch (err) {
                        setNameError(err.message);
                      }
                    }}
                  />
                  <button className="btn btn-secondary btn-sm" style={{ width: "100%" }} onClick={() => logoRef.current?.click()}>
                    {form.logo ? "Cambiar logo" : "Subir logo"}
                  </button>
                  {form.logo && (
                    <button className="btn btn-ghost btn-sm" style={{ width: "100%", color: "var(--danger)", marginTop: "var(--sp-1)" }} onClick={() => sf("logo", null)}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>

            {[
              ["name", "Nombre", "text", true],
              ["industry", "Industria", "text", false],
              ["instagram", "Instagram", "text", false],
              ["phone", "Teléfono", "tel", false],
              ["whatsapp", "WhatsApp", "tel", false],
              ["sucursales", "Sucursales", "text", false],
              ["direcciones", "Direcciones", "text", false],
            ].map(([k, l, type, required]) => (
              <div key={k}>
                <label className="label" htmlFor={`${ids}-${k}`}>
                  {l}{required && <span aria-hidden="true"> *</span>}
                  {required && <span className="sr-only"> (obligatorio)</span>}
                </label>
                <input
                  id={`${ids}-${k}`}
                  className="input"
                  type={type}
                  required={required}
                  aria-invalid={k === "name" && nameError ? "true" : undefined}
                  aria-describedby={k === "name" && nameError ? `${ids}-name-err` : undefined}
                  value={form[k] || ""}
                  onChange={(e) => { sf(k, e.target.value); if (k === "name") setNameError(""); }}
                />
                {k === "name" && nameError && (
                  <p id={`${ids}-name-err`} role="alert" className="notice notice-error" style={{ marginTop: "var(--sp-2)", marginBottom: 0 }}>
                    {nameError}
                  </p>
                )}
              </div>
            ))}

            <fieldset style={{ border: "none" }}>
              <legend className="label">Colores de marca</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "var(--sp-3)" }}>
                {[
                  ["primaryColor", "Principal"],
                  ["secondaryColor", "Secundario"],
                  ["accentColor", "Acento"],
                ].map(([k, l]) => (
                  <div key={k} style={{ textAlign: "center" }}>
                    <label className="label" htmlFor={`${ids}-${k}`} style={{ textTransform: "none" }}>{l}</label>
                    <input
                      id={`${ids}-${k}`}
                      type="color"
                      value={form[k] || "#000000"}
                      onChange={(e) => sf(k, e.target.value)}
                      style={{ width: "100%", height: 44, border: "1px solid var(--border)", background: "none", cursor: "pointer", borderRadius: "var(--radius-xs)" }}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {tab === "adn" && (
          <div role="tabpanel" id={`${ids}-panel-adn`} aria-labelledby={`${ids}-tab-adn`} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {[
              ["descripcion", "Descripción del negocio", "Qué hace, servicios…"],
              ["valores", "Valores", "Calidad, rapidez…"],
              ["notasInspeccion", "Notas de inspección", "Bio, destacados…"],
            ].map(([k, l, ph]) => (
              <div key={k}>
                <label className="label" htmlFor={`${ids}-${k}`}>{l}</label>
                <textarea id={`${ids}-${k}`} className="textarea" value={form[k] || ""} onChange={(e) => sf(k, e.target.value)} placeholder={ph} />
              </div>
            ))}
            {[
              ["audiencia", "Audiencia", "Ej: Mujeres de 25 a 45 años"],
              ["competencia", "Competencia", "Ej: Marca X"],
              ["hashtags", "Hashtags", "#Hashtag1 #Panama"],
            ].map(([k, l, ph]) => (
              <div key={k}>
                <label className="label" htmlFor={`${ids}-${k}`}>{l}</label>
                <input id={`${ids}-${k}`} className="input" value={form[k] || ""} onChange={(e) => sf(k, e.target.value)} placeholder={ph} />
              </div>
            ))}
          </div>
        )}

        {tab === "voz" && (
          <div role="tabpanel" id={`${ids}-panel-voz`} aria-labelledby={`${ids}-tab-voz`} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            <div>
              <label className="label" htmlFor={`${ids}-estiloGuion`}>Estilo de guiones</label>
              <textarea id={`${ids}-estiloGuion`} className="textarea" style={{ minHeight: 100 }} value={form.estiloGuion || ""} onChange={(e) => sf("estiloGuion", e.target.value)} placeholder="Tono, emojis, llamada a la acción…" />
            </div>
            <div>
              <label className="label" htmlFor={`${ids}-estiloLocucion`}>Estilo de locución</label>
              <textarea id={`${ids}-estiloLocucion`} className="textarea" style={{ minHeight: 84 }} value={form.estiloLocucion || ""} onChange={(e) => sf("estiloLocucion", e.target.value)} placeholder="Voz, ritmo…" />
            </div>
          </div>
        )}

        {tab === "github" && (
          <div role="tabpanel" id={`${ids}-panel-github`} aria-labelledby={`${ids}-tab-github`} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>
              Conecta un repositorio de GitHub para cargar el ADN del cliente. Puedes pegar la URL
              completa con carpeta (ej: github.com/usuario/repo/tree/main/clientes/nombre) y se
              detectará automáticamente.
            </p>
            <div>
              <label className="label" htmlFor={`${ids}-ghrepo`}>Repositorio GitHub</label>
              <input
                id={`${ids}-ghrepo`}
                className="input"
                type="url"
                value={form.githubRepo || ""}
                onChange={(e) => handleRepoUrlChange(e.target.value)}
                placeholder="https://github.com/usuario/agencia"
              />
            </div>
            <div>
              <label className="label" htmlFor={`${ids}-ghfolder`}>Carpeta del cliente (dentro del repo)</label>
              <input
                id={`${ids}-ghfolder`}
                className="input"
                value={form.githubFolder || ""}
                onChange={(e) => sf("githubFolder", e.target.value)}
                placeholder="clientes/nombre-del-cliente"
                aria-describedby={`${ids}-ghfolder-help`}
              />
              <p id={`${ids}-ghfolder-help`} className="hint">
                Déjalo vacío para leer desde la raíz del repositorio.
              </p>
            </div>
            <div>
              <label className="label" htmlFor={`${ids}-ghtoken`}>Token de GitHub (opcional, para repos privados)</label>
              <input
                id={`${ids}-ghtoken`}
                className="input"
                type="password"
                autoComplete="off"
                value={form.githubToken || ""}
                onChange={(e) => sf("githubToken", e.target.value)}
                placeholder="ghp_…"
                aria-describedby={`${ids}-ghtoken-help`}
              />
              <p id={`${ids}-ghtoken-help`} className="notice notice-warn" style={{ display: "block", marginTop: "var(--sp-2)" }}>
                El token se guarda sin cifrar en este navegador y se incluye en las copias de
                seguridad que exportes. Usa un token de sólo lectura (<code>repo:read</code>) y
                revócalo cuando dejes de necesitarlo.
              </p>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={testGitHub}
              disabled={ghLoading || adnLoading || !form.githubRepo}
              style={{ width: "100%" }}
            >
              {adnLoading ? "Analizando ADN con IA..." : ghLoading ? "Conectando..." : "Conectar y cargar ADN"}
            </button>

            {ghStatus && (
              <p role="status" aria-live="polite" className={`notice ${ghStatus.startsWith("Error") ? "notice-error" : "notice-ok"}`} style={{ display: "block", marginBottom: 0 }}>
                {ghStatus}
              </p>
            )}

            {ghReadingPath && (
              <p style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--sp-2)",
                padding: "var(--sp-2) var(--sp-3)",
                background: "var(--card-alt)",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--border)",
                fontSize: "var(--fs-2xs)",
                color: "var(--text-muted)",
              }}>
                <span aria-hidden="true">📂</span>
                Leyendo: <strong style={{ color: "var(--accent)" }}>{ghReadingPath}</strong>
              </p>
            )}

            {ghSubfolders.length > 0 && !form.githubFolder && (
              <div>
                <h3 className="label">Carpetas de clientes encontradas</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  {ghSubfolders.map((sf2, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        sf("githubFolder", sf2.path);
                        setGhSubfolders([]);
                        setTimeout(() => testGitHub(), 100);
                      }}
                      className="tap-row"
                      style={{
                        padding: "var(--sp-2) var(--sp-3)",
                        background: "var(--bg)",
                        borderRadius: "var(--radius-xs)",
                        border: "1px solid var(--border)",
                        fontSize: "var(--fs-xs)",
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: "var(--fs-sm)" }}>📂</span>
                      <span style={{ flex: 1 }}>{sf2.name}</span>
                      <span style={{ fontSize: "var(--fs-3xs)", color: "var(--accent)" }}>Seleccionar</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ghFiles.length > 0 && !adnExtracted && (
              <fieldset style={{ border: "none" }}>
                <legend className="label">Archivos encontrados</legend>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
                  {ghFiles.map((f, i) => (
                    <label key={i} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--sp-2)",
                      padding: "var(--sp-2) var(--sp-3)",
                      background: "var(--bg)",
                      borderRadius: "var(--radius-xs)",
                      minHeight: "var(--tap)",
                      cursor: "pointer",
                    }}>
                      <input
                        type="checkbox"
                        checked={f.selected}
                        onChange={() => setGhFiles((prev) => prev.map((ff, j) => j === i ? { ...ff, selected: !ff.selected } : ff))}
                      />
                      <span style={{ fontSize: "var(--fs-2xs)", flex: 1, wordBreak: "break-all" }}>{f.path}</span>
                      <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", flexShrink: 0 }}>{Math.round(f.size / 1024)} KB</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {adnExtracted && (
              <div style={{ background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", border: "1px solid var(--accent-line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-3)" }}>
                  <h3 className="label" style={{ margin: 0 }}>Campos encontrados por IA</h3>
                  <button
                    type="button"
                    className="btn-remove"
                    aria-label="Descartar campos sugeridos"
                    style={{ color: "var(--text-dim)" }}
                    onClick={() => { setAdnExtracted(null); setAdnSelected({}); }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", marginBottom: "var(--sp-3)" }}>
                  {Object.entries(ADN_FIELD_LABELS).map(([key, label]) => {
                    const value = adnExtracted[key];
                    if (!value) return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-1) 0" }}>
                        <input type="checkbox" disabled checked={false} aria-label={`${label}: no encontrado`} />
                        <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-faint)" }}>{label}: <em>(no encontrado)</em></span>
                      </div>
                    );
                    const formKey = ADN_TO_FORM_KEY[key];
                    const existing = form[formKey];
                    const hasConflict = existing && existing !== value;
                    return (
                      <label
                        key={key}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "var(--sp-2)",
                          padding: "var(--sp-2)",
                          background: adnSelected[key] ? "var(--accent-soft)" : "transparent",
                          borderRadius: "var(--radius-xs)",
                          border: `1px solid ${adnSelected[key] ? "var(--accent-line)" : "transparent"}`,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={!!adnSelected[key]}
                          onChange={() => setAdnSelected((p) => ({ ...p, [key]: !p[key] }))}
                          style={{ marginTop: 2 }}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: "var(--fs-3xs)", fontWeight: 700, color: "var(--accent)", marginBottom: 2 }}>{label}</span>
                          <span style={{ display: "block", fontSize: "var(--fs-2xs)", color: "var(--text-dim)", lineHeight: "var(--lh-normal)", wordBreak: "break-word" }}>
                            {value.length > 140 ? value.slice(0, 140) + "…" : value}
                          </span>
                          {hasConflict && (
                            <span style={{ display: "block", fontSize: "var(--fs-3xs)", color: "#FFC166", marginTop: "var(--sp-1)", padding: "var(--sp-1) var(--sp-2)", background: "#2a1a0a", borderRadius: 4, border: "1px solid var(--alt-line)" }}>
                              Se reemplazará el valor actual: {existing.length > 80 ? existing.slice(0, 80) + "…" : existing}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => {
                      const all = {};
                      Object.entries(adnExtracted).forEach(([k, v]) => { if (v) all[k] = true; });
                      setAdnSelected(all);
                    }}
                  >
                    Todos
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setAdnSelected({})}
                  >
                    Ninguno
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ flex: 2 }}
                    onClick={applyAdnFields}
                    disabled={!Object.values(adnSelected).some(Boolean)}
                  >
                    Aplicar seleccionados
                  </button>
                </div>
              </div>
            )}

            {form.githubContext && !adnExtracted && (
              <p style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <span className="badge" style={{ background: "#0d2a0d", color: "var(--success)", border: "1px solid #388E3C" }}>
                  ADN sincronizado
                </span>
                <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)" }}>{form.githubContext.length} caracteres</span>
              </p>
            )}

            {!apiKey && (
              <p className="notice notice-warn" style={{ display: "block" }}>
                Configura una API key en ajustes para que la IA analice el ADN y rellene los campos
                automáticamente.
              </p>
            )}

            <p className="hint">
              Se leerán archivos .md y .txt de la carpeta indicada (o la raíz si está vacía) y de su
              subcarpeta /adn/. Con una API key configurada, la IA analizará el contenido y sugerirá
              campos para el perfil.
            </p>
          </div>
        )}

        {tab === "semanal" && (
          <div role="tabpanel" id={`${ids}-panel-semanal`} aria-labelledby={`${ids}-tab-semanal`}>
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", margin: "0 0 var(--sp-3)" }}>
              Define los formatos y categorías que se repiten cada semana.
            </p>

            <CategoryTemplates
              savedCategories={form.savedCategories}
              onLoad={loadCategoryTemplate}
              onSave={saveCategoryTemplate}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
              {DEFAULT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="filter-chip"
                  onClick={() => {
                    const emptyDay = weekStructure.find((s) => s.active && s.categories.some((c) => !c));
                    if (emptyDay) {
                      const idx = weekStructure.indexOf(emptyDay);
                      setWeekStructure((p) =>
                        p.map((x, j) => {
                          if (j !== idx) return x;
                          const nc = [...x.categories];
                          const ei = nc.findIndex((c) => !c);
                          if (ei !== -1) nc[ei] = cat;
                          return { ...x, categories: nc };
                        })
                      );
                    }
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {weekStructure.map((s, i) => (
              <div key={s.dayOfWeek} style={{ background: "var(--bg)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: s.active ? 8 : 0 }}>
                  <button
                    type="button"
                    onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, active: !x.active })))}
                    style={{
                      width: 32,
                      height: 36,
                      borderRadius: "var(--radius-xs)",
                      border: "none",
                      cursor: "pointer",
                      background: s.active ? "var(--accent)" : "var(--card-alt)",
                      color: "#fff",
                      fontSize: "var(--fs-xs)",
                      flexShrink: 0,
                    }}
                    aria-pressed={s.active}
                    aria-label={`${s.active ? "Desactivar" : "Activar"} ${s.dayName}`}
                  >
                    <span aria-hidden="true">{s.active ? "✓" : ""}</span>
                  </button>
                  <span style={{ fontSize: "var(--fs-xs)", color: s.active ? "#fff" : "var(--text-muted)", fontWeight: s.active ? 700 : 500, width: 80, flexShrink: 0 }}>
                    {s.dayName}
                  </span>
                  {s.active && <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-muted)" }}>{s.slots.length} publicación{s.slots.length !== 1 ? "es" : ""}</span>}
                </div>
                {s.active && (
                  <>
                    <div style={{ marginBottom: "var(--sp-3)" }}>
                      <p className="label">Publicaciones del día</p>
                      {s.slots.map((slot, si) => (
                        <div key={si} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-start", marginBottom: "var(--sp-2)", paddingLeft: "var(--sp-2)" }}>
                          <div style={{ flex: 1 }}>
                            <FormatPicker
                              label={`Formato de la publicación ${si + 1} del ${s.dayName}`}
                              value={slot.format}
                              onChange={(v) =>
                                setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, slots: x.slots.map((ss, k) => (k !== si ? ss : { ...ss, format: v })) })))
                              }
                            />
                          </div>
                          <button
                            type="button"
                            className="btn-remove"
                            aria-label={`Quitar publicación ${si + 1} del ${s.dayName}`}
                            onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, slots: x.slots.filter((_, k) => k !== si) })))}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginLeft: "var(--sp-2)" }}
                        onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, slots: [...x.slots, { format: "post" }] })))}
                      >
                        + Publicación
                      </button>
                    </div>
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--sp-3)" }}>
                      <p className="label">Categorías</p>
                      {(s.categories || [""]).map((cat, ci) => (
                        <div key={ci} style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-2)", alignItems: "center", paddingLeft: "var(--sp-2)" }}>
                          <input
                            className="input"
                            style={{ flex: 1 }}
                            value={cat}
                            aria-label={`Categoría ${ci + 1} del ${s.dayName}`}
                            placeholder={`Categoría ${ci + 1}`}
                            onChange={(e) =>
                              setWeekStructure((p) =>
                                p.map((x, j) => {
                                  if (j !== i) return x;
                                  const nc = [...(x.categories || [""])];
                                  nc[ci] = e.target.value;
                                  return { ...x, categories: nc };
                                })
                              )
                            }
                          />
                          {ci > 0 && (
                            <button
                              type="button"
                              className="btn-remove"
                              aria-label={`Quitar categoría ${ci + 1} del ${s.dayName}`}
                              onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, categories: x.categories.filter((_, k) => k !== ci) })))}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {(s.categories || []).length < 3 && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ marginLeft: "var(--sp-2)" }}
                          onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, categories: [...(x.categories || [""]), ""] })))}
                        >
                          + Categoría
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        </div>

        <div className="sheet-footer" style={{ flexDirection: "column", gap: "var(--sp-2)" }}>
          <div style={{ display: "flex", gap: "var(--sp-3)", width: "100%" }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}>
              {initial ? "Guardar cambios" : "Crear cliente"}
            </button>
          </div>
          {initial && onDelete && (
            <button
              className="btn btn-danger"
              style={{ width: "100%" }}
              onClick={() => {
                if (window.confirm(`¿Eliminar ${form.name}? Se borrarán también sus calendarios.`)) {
                  onDelete(initial.id);
                  onClose();
                }
              }}
            >
              Eliminar cliente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
