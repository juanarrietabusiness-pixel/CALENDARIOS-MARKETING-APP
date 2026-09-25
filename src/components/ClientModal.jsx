import { useEffect, useId, useState, useRef } from "react";
import { FORMATS, FORMAT_ICONS, DEFAULT_CATEGORIES } from "../constants";
import { uid, compressImage, createEmptyClient } from "../utils";
import { fetchGitHubADN, extractClientADN, parseGitHubUrl, imagenDelADN } from "../api";
import { elegirLogo, tresColores } from "../lib/colores";
import { loadImageTemplates, saveImageTemplate, deleteImageTemplate, loadImageReferences, uploadImageReference, deleteImageReference } from "../lib/db";
import { useDialogA11y } from "../hooks/useDialogA11y";
import Icon from "./Icon";
import { idDeCarpeta } from "../lib/drive";

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
          <Icon name={FORMAT_ICONS[k]} size={16} /> {f.label}
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

/** La receta del prompt maestro puede venir como objeto o como texto JSON. */
function recetaDe(receta) {
  if (!receta) return null;
  if (typeof receta === "object") return receta;
  try { return JSON.parse(receta); } catch { return null; }
}

export default function ClientModal({ initial, onSave, onDelete, onClose }) {
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
  // El logo que se encontró en el repositorio, si hay uno importable.
  const [ghLogo, setGhLogo] = useState(null);
  const [importandoLogo, setImportandoLogo] = useState(false);
  const coloresReceta = tresColores(recetaDe(form.metaRecipe)?.colores ?? []);
  const [ghLoading, setGhLoading] = useState(false);
  const [adnExtracted, setAdnExtracted] = useState(null);
  const [adnSelected, setAdnSelected] = useState({});
  const [adnLoading, setAdnLoading] = useState(false);
  const [nameError, setNameError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imgTemplates, setImgTemplates] = useState([]);
  const [imgRefs, setImgRefs] = useState([]);
  const [newTplName, setNewTplName] = useState("");
  const [newTplPrompt, setNewTplPrompt] = useState("");
  const [newTplFormat, setNewTplFormat] = useState("square");
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [refUploading, setRefUploading] = useState(false);
  const refInputRef = useRef();
  const logoRef = useRef();
  const ids = useId();
  const dialogRef = useDialogA11y(onClose);
  const sf = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (initial?.dbId && tab === "visual") {
      loadImageTemplates(initial.dbId).then(setImgTemplates).catch(() => {});
      loadImageReferences(initial.dbId).then(setImgRefs).catch(() => {});
    }
  }, [initial?.dbId, tab]);

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
    estiloVisual: "Estilo visual, tipografías y paleta",
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
    estiloVisual: "visualStyle",
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
      const result = await fetchGitHubADN(form.githubRepo, folder);
      const fileList = result.files.map((f) => ({ name: f.name, path: f.path, size: f.size, selected: true }));
      setGhFiles(fileList);
      setGhLogo(elegirLogo(result.assets));
      setGhSubfolders(result.subfolders || []);

      if (fileList.length === 0 && result.subfolders?.length > 0) {
        setGhStatus(`Conectado — ${result.subfolders.length} carpetas de clientes encontradas. Selecciona una carpeta abajo.`);
      } else {
        setGhStatus(fileList.length > 0 ? `Conectado (${fileList.length} archivos)` : "Conectado, sin archivos .md/.txt");
      }

      if (result.content) {
        sf("githubContext", result.content);

        // La IA la sirve el servidor, así que ya no hay que comprobar si
        // el usuario configuró una clave: siempre está disponible.
        setAdnLoading(true);
        setGhStatus("Analizando ADN con IA…");
        try {
          const extracted = await extractClientADN(result.content);
          setAdnExtracted(extracted);
          const sel = {};
          Object.entries(ADN_FIELD_LABELS).forEach(([k]) => {
            if (extracted[k]) sel[k] = true;
          });
          if (extracted.colorPrincipal) sel.colores = true;
          if (elegirLogo(result.assets) && !form.logo) sel.logo = true;
          setAdnSelected(sel);
          setGhStatus(`ADN analizado — ${Object.values(sel).filter(Boolean).length} campos encontrados`);
        } catch (e) {
          setGhStatus("ADN cargado. Error al analizar: " + e.message);
        }
        setAdnLoading(false);
      }
    } catch (e) {
      setGhStatus("Error: " + e.message);
    }
    setGhLoading(false);
  };

  const applyAdnFields = async () => {
    if (!adnExtracted) return;
    Object.entries(adnSelected).forEach(([key, checked]) => {
      if (!checked || typeof adnExtracted[key] !== "string" || !adnExtracted[key]) return;
      const formKey = ADN_TO_FORM_KEY[key];
      if (formKey) sf(formKey, adnExtracted[key]);
    });
    // La marca visual: los tres colores de la ficha, que son los que usan
    // la página de aprobación, los informes y la generación de imágenes.
    if (adnSelected.colores) {
      if (adnExtracted.colorPrincipal) sf("primaryColor", adnExtracted.colorPrincipal);
      if (adnExtracted.colorSecundario) sf("secondaryColor", adnExtracted.colorSecundario);
      if (adnExtracted.colorAcento) sf("accentColor", adnExtracted.colorAcento);
    }
    let avisoLogo = "";
    if (adnSelected.logo && ghLogo) {
      setImportandoLogo(true);
      try {
        sf("logo", await compressImage(await imagenDelADN(form.githubRepo, ghLogo.path), 150));
      } catch (e) {
        avisoLogo = ` · El logo no se pudo importar: ${e.message}`;
      }
      setImportandoLogo(false);
    }
    setAdnExtracted(null);
    setAdnSelected({});
    setGhStatus(`Campos aplicados al perfil${avisoLogo}`);
  };

  const handleSave = async () => {
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

    // Guardar va a la red: si falla, el diálogo tiene que seguir abierto
    // con los datos dentro. Antes se cerraba a la vez que se enviaba y el
    // trabajo se perdía sin más aviso que un mensaje de fondo.
    setSaving(true);
    setSaveError("");
    try {
      await onSave({
        ...form,
        id: initial?.id || "client-" + uid(),
        weeklyStructure: ws,
        calendars: initial?.calendars || [],
        savedPlans: initial?.savedPlans || [],
        savedCategories: initial?.savedCategories || [],
      });
    } catch (e) {
      setSaveError(e.message || "No se pudo guardar el cliente.");
      setSaving(false);
    }
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
    ["visual", "Visual"],
    ["github", "Drive y GitHub"],
    ["semanal", "Semanal"],
  ];

  return (
    <div className="overlay overlay-sheet">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 560 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>{initial ? "Editar cliente" : "Nuevo cliente"}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
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
                  <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: "var(--radius)", background: "var(--surface-2)", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="building" size={26} />
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
              {/* El prompt maestro ya trae la paleta del manual; antes se
                  quedaba ahí y la ficha seguía con los colores por defecto. */}
              {coloresReceta.principal && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginBottom: "var(--sp-2)" }}
                  onClick={() => {
                    sf("primaryColor", coloresReceta.principal);
                    if (coloresReceta.secundario) sf("secondaryColor", coloresReceta.secundario);
                    if (coloresReceta.acento) sf("accentColor", coloresReceta.acento);
                  }}
                >
                  <Icon name="palette" size={16} /> Usar los colores del prompt maestro
                </button>
              )}
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
            <div>
              <label className="label" htmlFor={`${ids}-aiInstructions`}>Instrucciones para la IA</label>
              <textarea
                id={`${ids}-aiInstructions`}
                className="textarea"
                style={{ minHeight: 120 }}
                value={form.aiInstructions || ""}
                onChange={(e) => sf("aiInstructions", e.target.value)}
                placeholder={"Reglas que la IA debe seguir siempre para este cliente.\nEj: «Nunca uses la palabra increíble», «Los reels siempre empiezan con una pregunta», «No menciones precios si no están en el ADN»…"}
              />
              <p className="hint">Se envían como instrucciones obligatorias en cada generación de contenido para este cliente.</p>
            </div>
          </div>
        )}

        {tab === "visual" && (
          <div role="tabpanel" id={`${ids}-panel-visual`} aria-labelledby={`${ids}-tab-visual`} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            <div>
              <label className="label" htmlFor={`${ids}-visualStyle`}>Guía visual</label>
              <textarea
                id={`${ids}-visualStyle`}
                className="textarea"
                style={{ minHeight: 120 }}
                value={form.visualStyle || ""}
                onChange={(e) => sf("visualStyle", e.target.value)}
                placeholder={"Describe el estilo visual que quieres para este cliente.\nEj: «Fondo pastel, tipografía sans-serif moderna, fotos con filtro cálido, mucho espacio en blanco», «Estilo minimalista con acentos en el color de marca (#2563EB)»…"}
              />
              <p className="hint">La IA usará esta guía cada vez que genere una imagen para este cliente. Puedes ir refinándola.</p>
            </div>

            {initial?.dbId && (
              <>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                    <span className="label" style={{ margin: 0 }}>Plantillas visuales</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-expanded={showNewTpl}
                      onClick={() => setShowNewTpl((o) => !o)}
                    >
                      <Icon name="plus" size={14} /> Nueva
                    </button>
                  </div>

                  {showNewTpl && (
                    <div style={{
                      padding: "var(--sp-3)", background: "var(--bg)",
                      borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                      marginBottom: "var(--sp-2)", display: "flex", flexDirection: "column", gap: "var(--sp-2)",
                    }}>
                      <div>
                        <label className="label" htmlFor={`${ids}-tpl-name`}>Nombre</label>
                        <input id={`${ids}-tpl-name`} className="input" value={newTplName} onChange={(e) => setNewTplName(e.target.value)} placeholder="Ej: Post promocional" />
                      </div>
                      <div>
                        <label className="label" htmlFor={`${ids}-tpl-prompt`}>Instrucciones visuales</label>
                        <textarea id={`${ids}-tpl-prompt`} className="textarea" value={newTplPrompt} onChange={(e) => setNewTplPrompt(e.target.value)} placeholder="Ej: Foto de producto centrada, fondo degradado, texto grande arriba…" />
                      </div>
                      <fieldset style={{ border: "none" }}>
                        <legend className="label">Formato por defecto</legend>
                        <div style={{ display: "flex", gap: "var(--sp-1)", flexWrap: "wrap" }}>
                          {[["square", "Cuadrado"], ["vertical", "Vertical"], ["story", "Historia"], ["horizontal", "Horizontal"]].map(([k, l]) => (
                            <button
                              key={k}
                              type="button"
                              className="filter-chip"
                              aria-pressed={newTplFormat === k}
                              onClick={() => setNewTplFormat(k)}
                              style={{
                                background: newTplFormat === k ? "var(--accent-soft)" : "var(--bg)",
                                borderColor: newTplFormat === k ? "var(--accent)" : "var(--border)",
                                color: newTplFormat === k ? "var(--accent)" : "var(--text-muted)",
                              }}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!newTplName.trim() || tplSaving}
                        onClick={async () => {
                          setTplSaving(true);
                          try {
                            const tpl = await saveImageTemplate({
                              client_id: initial.dbId, name: newTplName.trim(),
                              prompt: newTplPrompt, format: newTplFormat,
                            });
                            setImgTemplates((p) => [...p, tpl]);
                            setNewTplName(""); setNewTplPrompt(""); setNewTplFormat("square"); setShowNewTpl(false);
                          } catch (e) { setSaveError(e.message); }
                          setTplSaving(false);
                        }}
                      >
                        {tplSaving ? "Guardando…" : "Guardar plantilla"}
                      </button>
                    </div>
                  )}

                  {imgTemplates.length === 0 && !showNewTpl && (
                    <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
                      Sin plantillas. Crea una para reutilizar estilos visuales.
                    </p>
                  )}

                  {imgTemplates.map((tpl) => (
                    <div key={tpl.id} style={{
                      display: "flex", alignItems: "center", gap: "var(--sp-2)",
                      padding: "var(--sp-2) var(--sp-3)", background: "var(--bg)",
                      borderRadius: "var(--radius-xs)", border: "1px solid var(--border)",
                      marginBottom: "var(--sp-1)", minHeight: "var(--tap-sm)",
                    }}>
                      <Icon name="palette" size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>{tpl.name}</p>
                        {tpl.prompt && <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tpl.prompt}</p>}
                      </div>
                      <button
                        type="button"
                        className="btn-remove"
                        aria-label={`Eliminar plantilla ${tpl.name}`}
                        onClick={async () => {
                          try {
                            await deleteImageTemplate(tpl.id);
                            setImgTemplates((p) => p.filter((t) => t.id !== tpl.id));
                          } catch (e) { setSaveError(e.message); }
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                    <span className="label" style={{ margin: 0 }}>Imágenes de referencia</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => refInputRef.current?.click()}
                      disabled={refUploading}
                    >
                      <Icon name="upload" size={14} /> {refUploading ? "Subiendo…" : "Subir"}
                    </button>
                  </div>
                  <input
                    ref={refInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    aria-label="Subir imágenes de referencia"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      setRefUploading(true);
                      for (const f of files) {
                        try {
                          const ref = await uploadImageReference(initial.dbId, f);
                          setImgRefs((p) => [ref, ...p]);
                        } catch { /* silenciar errores individuales */ }
                      }
                      setRefUploading(false);
                      e.target.value = "";
                    }}
                  />

                  <p className="hint" style={{ marginBottom: "var(--sp-2)" }}>
                    La IA usará estas imágenes como referencia visual. Las imágenes que marques con &ldquo;me gusta&rdquo; al generar se guardan aquí automáticamente.
                  </p>

                  {imgRefs.length === 0 && (
                    <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
                      Sin referencias. Sube imágenes o genera con IA y marca las que te gusten.
                    </p>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
                    {imgRefs.map((ref) => (
                      <div key={ref.id} style={{ position: "relative", width: 72, height: 72 }}>
                        <img
                          src={`/api/media/${ref.file_path}`}
                          alt="Referencia visual"
                          style={{
                            width: 72, height: 72, objectFit: "cover",
                            borderRadius: "var(--radius-xs)", border: "1px solid var(--border)",
                          }}
                        />
                        {ref.source === "liked" && (
                          <span style={{
                            position: "absolute", bottom: 2, left: 2, background: "var(--accent)",
                            borderRadius: "var(--radius-xs)", padding: "1px 3px", lineHeight: 1,
                          }}>
                            <Icon name="thumbsUp" size={10} style={{ color: "#fff" }} />
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn-remove"
                          style={{
                            position: "absolute", top: -4, right: -4,
                            background: "var(--surface)", borderRadius: "50%",
                            width: 20, height: 20, display: "flex", alignItems: "center",
                            justifyContent: "center", boxShadow: "var(--elev-1)",
                          }}
                          aria-label="Eliminar referencia"
                          onClick={async () => {
                            try {
                              await deleteImageReference(ref.id);
                              setImgRefs((p) => p.filter((r) => r.id !== ref.id));
                            } catch (e) { setSaveError(e.message); }
                          }}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!initial?.dbId && (
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>
                Guarda el cliente primero para poder agregar plantillas y referencias visuales.
              </p>
            )}
          </div>
        )}

        {tab === "github" && (
          <div role="tabpanel" id={`${ids}-panel-github`} aria-labelledby={`${ids}-tab-github`} style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            <div>
              <label className="label" htmlFor={`${ids}-drive`}>Carpeta de Google Drive</label>
              <input
                id={`${ids}-drive`}
                className="input"
                value={form.driveFolder || ""}
                onChange={(e) => sf("driveFolder", idDeCarpeta(e.target.value) || e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                aria-describedby={`${ids}-drive-help`}
              />
              <p id={`${ids}-drive-help`} className="hint">
                Es el banco de contenido del cliente. Pega el enlace de su carpeta: tiene que estar compartida con la
                cuenta de Google de la agencia, como Editor.
                {form.driveFolder && !idDeCarpeta(form.driveFolder) && (
                  <strong style={{ color: "var(--danger)" }}> Eso no parece un enlace de carpeta de Drive.</strong>
                )}
              </p>
            </div>
            <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "var(--sp-1) 0" }} />
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
                <Icon name="folder" size={16} />
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
                      <Icon name="folder" size={18} />
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
                    <Icon name="close" size={16} />
                  </button>
                </div>
                {(adnExtracted.colorPrincipal || ghLogo) && (
                  <div className="adn-marca">
                    {adnExtracted.colorPrincipal && (
                      <label className="adn-marca-fila" data-activa={!!adnSelected.colores}>
                        <input
                          type="checkbox"
                          checked={!!adnSelected.colores}
                          onChange={() => setAdnSelected((p) => ({ ...p, colores: !p.colores }))}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="adn-marca-titulo">Colores de marca</span>
                          <span className="adn-muestras">
                            {[["Principal", adnExtracted.colorPrincipal], ["Secundario", adnExtracted.colorSecundario], ["Acento", adnExtracted.colorAcento]]
                              .filter(([, hex]) => hex)
                              .map(([nombre, hex]) => (
                                <span key={nombre} className="adn-muestra">
                                  <span style={{ background: hex }} aria-hidden="true" />
                                  {nombre} <code>{hex}</code>
                                </span>
                              ))}
                          </span>
                          {adnExtracted.paleta?.length > 3 && (
                            <span className="adn-paleta" aria-label="Paleta completa">
                              {adnExtracted.paleta.map((c) => (
                                <span key={c.hex} title={`${c.hex} ${c.nombre} ${c.rol}`.trim()} style={{ background: c.hex }} />
                              ))}
                            </span>
                          )}
                        </span>
                      </label>
                    )}
                    {ghLogo && (
                      <label className="adn-marca-fila" data-activa={!!adnSelected.logo}>
                        <input
                          type="checkbox"
                          checked={!!adnSelected.logo}
                          onChange={() => setAdnSelected((p) => ({ ...p, logo: !p.logo }))}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="adn-marca-titulo">Usar como logo del cliente</span>
                          <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", wordBreak: "break-all" }}>{ghLogo.path}</span>
                          {form.logo && <span style={{ display: "block", fontSize: "var(--fs-3xs)", color: "var(--accent-alt)" }}>Se reemplazará el logo actual.</span>}
                        </span>
                      </label>
                    )}
                  </div>
                )}
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
                      Object.keys(ADN_FIELD_LABELS).forEach((k) => { if (adnExtracted[k]) all[k] = true; });
                      if (adnExtracted.colorPrincipal) all.colores = true;
                      if (ghLogo) all.logo = true;
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
                    disabled={!Object.values(adnSelected).some(Boolean) || importandoLogo}
                  >
                    {importandoLogo ? "Importando el logo…" : "Aplicar seleccionados"}
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

            <p className="hint">
              Se leerán archivos .md y .txt de la carpeta indicada (o la raíz si está vacía) y de su
              subcarpeta /adn/. La IA analizará el contenido y sugerirá campos para el perfil.
              Para repositorios privados, el token de GitHub se configura una sola vez en el
              servidor (<code>GITHUB_TOKEN</code>), no aquí.
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
                    {s.active && <Icon name="check" size={18} />}
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
                            <Icon name="close" size={16} />
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
                              <Icon name="close" size={16} />
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
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : initial ? "Guardar cambios" : "Crear cliente"}
            </button>
          </div>

          {saveError && (
            <p role="alert" className="notice notice-error" style={{ display: "block", marginTop: "var(--sp-3)" }}>
              {saveError}
            </p>
          )}
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
