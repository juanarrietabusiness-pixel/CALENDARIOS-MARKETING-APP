import { useState, useRef } from "react";
import { FORMATS, DEFAULT_CATEGORIES } from "../constants";
import { uid, compressImage, createEmptyClient } from "../utils";
import { fetchGitHubADN } from "../api";

const DAYS_ORDERED = [
  { dow: 1, name: "Lunes" },
  { dow: 2, name: "Martes" },
  { dow: 3, name: "Miercoles" },
  { dow: 4, name: "Jueves" },
  { dow: 5, name: "Viernes" },
  { dow: 6, name: "Sabado" },
  { dow: 0, name: "Domingo" },
];

function FormatPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {Object.entries(FORMATS).map(([k, f]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          style={{
            padding: "5px 9px",
            borderRadius: 7,
            border: `1px solid ${value === k ? f.color : "var(--border)"}`,
            cursor: "pointer",
            background: value === k ? f.color + "33" : "var(--card-alt)",
            color: value === k ? f.color : "var(--text-muted)",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {f.icon} {f.label}
        </button>
      ))}
    </div>
  );
}

function CategoryTemplates({ savedCategories, onLoad, onSave }) {
  const [templateName, setTemplateName] = useState("");
  const [showSave, setShowSave] = useState(false);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {(savedCategories || []).map((tpl, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onLoad(tpl)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--accent)",
              cursor: "pointer",
              background: "var(--accent)" + "22",
              color: "var(--accent)",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {tpl.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowSave(!showSave)}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px dashed var(--border)",
            cursor: "pointer",
            background: "transparent",
            color: "var(--text-dim)",
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          + Guardar template
        </button>
      </div>
      {showSave && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 11, padding: "6px 8px" }}
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Nombre del template..."
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (templateName) {
                onSave(templateName);
                setTemplateName("");
                setShowSave(false);
              }
            }}
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  );
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
  const [ghLoading, setGhLoading] = useState(false);
  const logoRef = useRef();
  const sf = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const testGitHub = async () => {
    if (!form.githubRepo) return;
    setGhLoading(true);
    setGhStatus("Conectando...");
    try {
      const match = form.githubRepo.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) { setGhStatus("URL invalida"); setGhLoading(false); return; }
      const [, owner, repo] = match;
      const headers = { Accept: "application/vnd.github.v3+json" };
      if (form.githubToken) headers.Authorization = "token " + form.githubToken;

      const files = [];
      for (const path of ["", "adn/"]) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo.replace(/\.git$/, "")}/contents/${path}`, { headers });
        if (!res.ok) continue;
        const items = await res.json();
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (item.type === "file" && /\.(md|txt)$/i.test(item.name) && item.size < 50000) {
            files.push({ name: item.name, path: item.path, size: item.size, selected: true });
          }
        }
      }
      setGhFiles(files);
      setGhStatus(files.length > 0 ? `Conectado (${files.length} archivos)` : "Conectado, sin archivos .md/.txt");

      const adnContent = await fetchGitHubADN(form.githubRepo, form.githubToken);
      if (adnContent) {
        sf("githubContext", adnContent);
      }
    } catch (e) {
      setGhStatus("Error: " + e.message);
    }
    setGhLoading(false);
  };

  const handleSave = () => {
    if (!form.name) return;
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

  return (
    <div className="overlay">
      <div
        style={{
          background: "var(--card)",
          borderRadius: "20px 20px 0 0",
          padding: 18,
          width: "100%",
          maxWidth: 540,
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{initial ? "Editar Cliente" : "Nuevo Cliente"}</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 3, marginBottom: 14, background: "var(--bg)", borderRadius: 10, padding: 3 }}>
          {[
            ["basico", "Basico"],
            ["adn", "ADN"],
            ["voz", "Voz"],
            ["github", "GitHub"],
            ["semanal", "Semanal"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                flex: 1,
                padding: "7px 2px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: tab === k ? "var(--accent)" : "transparent",
                color: tab === k ? "#fff" : "var(--text-muted)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "basico" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div>
              <label className="label">Logo</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {form.logo ? (
                  <img src={form.logo} alt="" style={{ width: 50, height: 50, objectFit: "contain", borderRadius: 8, background: "#fff", padding: 3 }} />
                ) : (
                  <div style={{ width: 50, height: 50, borderRadius: 8, background: "var(--card-alt)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    🏢
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files[0];
                      if (f) sf("logo", await compressImage(f, 150));
                    }}
                    style={{ display: "none" }}
                  />
                  <button className="btn btn-secondary btn-sm" style={{ width: "100%" }} onClick={() => logoRef.current?.click()}>
                    {form.logo ? "Cambiar" : "Subir logo"}
                  </button>
                  {form.logo && (
                    <button className="btn btn-ghost btn-sm" style={{ width: "100%", color: "var(--danger)", marginTop: 3 }} onClick={() => sf("logo", null)}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>
            {[
              ["name", "Nombre *"],
              ["industry", "Industria"],
              ["instagram", "Instagram"],
              ["phone", "Telefono"],
              ["whatsapp", "WhatsApp"],
              ["sucursales", "Sucursales"],
              ["direcciones", "Direcciones"],
            ].map(([k, l]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input className="input" value={form[k] || ""} onChange={(e) => sf(k, e.target.value)} />
              </div>
            ))}
            <div>
              <label className="label">Colores de marca</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {[
                  ["primaryColor", "Principal"],
                  ["secondaryColor", "Secundario"],
                  ["accentColor", "Acento"],
                ].map(([k, l]) => (
                  <div key={k} style={{ textAlign: "center" }}>
                    <input
                      type="color"
                      value={form[k] || "#000000"}
                      onChange={(e) => sf(k, e.target.value)}
                      style={{ width: "100%", height: 36, border: "none", background: "none", cursor: "pointer", borderRadius: 6 }}
                    />
                    <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "adn" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {[
              ["descripcion", "Descripcion del negocio", "Que hace, servicios..."],
              ["valores", "Valores", "Calidad, rapidez..."],
              ["notasInspeccion", "Notas de inspeccion", "Bio, destacados..."],
            ].map(([k, l, ph]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <textarea className="textarea" value={form[k] || ""} onChange={(e) => sf(k, e.target.value)} placeholder={ph} />
              </div>
            ))}
            {[
              ["audiencia", "Audiencia", "Ej: Mujeres 25-45 anos"],
              ["competencia", "Competencia", "Ej: Marca X"],
              ["hashtags", "Hashtags", "#Hashtag1 #Panama"],
            ].map(([k, l, ph]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input className="input" value={form[k] || ""} onChange={(e) => sf(k, e.target.value)} placeholder={ph} />
              </div>
            ))}
          </div>
        )}

        {tab === "voz" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div>
              <label className="label">Estilo de guiones</label>
              <textarea className="textarea" style={{ minHeight: 80 }} value={form.estiloGuion || ""} onChange={(e) => sf("estiloGuion", e.target.value)} placeholder="Tono, emojis, CTA..." />
            </div>
            <div>
              <label className="label">Estilo de locucion</label>
              <textarea className="textarea" style={{ minHeight: 60 }} value={form.estiloLocucion || ""} onChange={(e) => sf("estiloLocucion", e.target.value)} placeholder="Voz, ritmo..." />
            </div>
          </div>
        )}

        {tab === "github" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Conecta un repositorio de GitHub para cargar automaticamente el ADN del cliente (archivos .md/.txt).
            </p>
            <div>
              <label className="label">URL del repositorio</label>
              <input
                className="input"
                value={form.githubRepo || ""}
                onChange={(e) => sf("githubRepo", e.target.value)}
                placeholder="https://github.com/usuario/repo"
              />
            </div>
            <div>
              <label className="label">Token GitHub (opcional, para repos privados)</label>
              <input
                className="input"
                type="password"
                value={form.githubToken || ""}
                onChange={(e) => sf("githubToken", e.target.value)}
                placeholder="ghp_..."
              />
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={testGitHub}
              disabled={ghLoading || !form.githubRepo}
              style={{ width: "100%" }}
            >
              {ghLoading ? "Conectando..." : "Conectar y sincronizar"}
            </button>

            {ghStatus && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                background: ghStatus.startsWith("Error") ? "#2a0d0d" : "#0d2a0d",
                borderRadius: 8,
                border: `1px solid ${ghStatus.startsWith("Error") ? "#C62828" : "#388E3C"}`,
              }}>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: ghStatus.startsWith("Error") ? "var(--danger)" : "var(--success)",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: ghStatus.startsWith("Error") ? "var(--danger)" : "var(--success)" }}>{ghStatus}</span>
              </div>
            )}

            {ghFiles.length > 0 && (
              <div>
                <label className="label">Archivos encontrados</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {ghFiles.map((f, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      background: "var(--bg)",
                      borderRadius: 6,
                    }}>
                      <input
                        type="checkbox"
                        checked={f.selected}
                        onChange={() => setGhFiles((prev) => prev.map((ff, j) => j === i ? { ...ff, selected: !ff.selected } : ff))}
                      />
                      <span style={{ fontSize: 11, flex: 1 }}>{f.path}</span>
                      <span style={{ fontSize: 9, color: "var(--text-dim)" }}>{Math.round(f.size / 1024)}KB</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {form.githubContext && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="badge" style={{ background: "#0d2a0d", color: "var(--success)", border: "1px solid #388E3C" }}>
                  ADN sincronizado
                </span>
                <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{form.githubContext.length} chars</span>
              </div>
            )}

            <p style={{ fontSize: 10, color: "var(--text-dim)" }}>
              Se leeran archivos .md y .txt de la raiz y carpeta /adn/ del repositorio para contextualizar la IA.
            </p>
          </div>
        )}

        {tab === "semanal" && (
          <div>
            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "0 0 12px" }}>
              Define formatos y categorias que se repiten cada semana.
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
                      height: 32,
                      borderRadius: 7,
                      border: "none",
                      cursor: "pointer",
                      background: s.active ? "var(--accent)" : "var(--card-alt)",
                      color: "#fff",
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {s.active ? "✓" : ""}
                  </button>
                  <span style={{ fontSize: 12, color: s.active ? "#fff" : "var(--text-muted)", fontWeight: s.active ? 700 : 400, width: 76, flexShrink: 0 }}>
                    {s.dayName}
                  </span>
                  {s.active && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.slots.length} slot{s.slots.length !== 1 ? "s" : ""}</span>}
                </div>
                {s.active && (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <div className="label" style={{ marginBottom: 6 }}>Slots</div>
                      {s.slots.map((slot, si) => (
                        <div key={si} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6, paddingLeft: 8 }}>
                          <div style={{ flex: 1 }}>
                            <FormatPicker
                              value={slot.format}
                              onChange={(v) =>
                                setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, slots: x.slots.map((ss, k) => (k !== si ? ss : { ...ss, format: v })) })))
                              }
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, slots: x.slots.filter((_, k) => k !== si) })))}
                            style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, flexShrink: 0, marginTop: 4 }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, slots: [...x.slots, { format: "post" }] })))}
                        style={{ marginLeft: 8, padding: "5px 12px", background: "var(--card-alt)", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 11 }}
                      >
                        + Slot
                      </button>
                    </div>
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      <div className="label" style={{ marginBottom: 6 }}>Categorias</div>
                      {(s.categories || [""]).map((cat, ci) => (
                        <div key={ci} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", paddingLeft: 8 }}>
                          <input
                            className="input"
                            style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}
                            value={cat}
                            placeholder={`Categoria ${ci + 1}`}
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
                              onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, categories: x.categories.filter((_, k) => k !== ci) })))}
                              style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13 }}
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
                          style={{ marginLeft: 8 }}
                          onClick={() => setWeekStructure((p) => p.map((x, j) => (j !== i ? x : { ...x, categories: [...(x.categories || [""]), ""] })))}
                        >
                          + Categoria
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <div style={{ display: "flex", gap: 10 }}>
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
                if (window.confirm(`Eliminar ${form.name}?`)) {
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
