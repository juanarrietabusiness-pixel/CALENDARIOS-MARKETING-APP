// ============================================================
// Los diálogos del calendario
//
// Todos se montan dentro de `.overlay`, que bloquea el scroll del
// fondo y atrapa el foco con `useDialogA11y`. Quién queda delante lo
// decide la escala `--z-*` de index.css, no el orden en el DOM.
//
// Y sólo hay uno abierto a la vez: `CalendarView` los gobierna con un
// único estado `capa`, no con una bandera por diálogo.
// ============================================================

import { lazy, Suspense, useId, useState, useRef } from "react";
import { uid, compressImage } from "../../utils";
import { rangoSemana } from "../../lib/semanas";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import Icon from "../Icon";

// La estrategia del mes se edita con el componente de «Planificar mes», en su chunk (no va en la carga inicial).
const EditorEstrategia = lazy(() => import("../EstrategiaMes").then((m) => ({ default: m.EditorEstrategia })));

/**
 * «Agregar publicación»: una pregunta y dos respuestas.
 *
 * Antes pedía formato y un TÍTULO obligatorio antes de dejar crearla, y
 * luego había que abrirla y buscar la pestaña. Ahora se escoge qué se
 * quiere hacer y se abre directamente ahí, sin rellenar nada:
 *
 *   · Subir contenido → la pestaña Pieza (pide «publicar», el nombre de
 *     antes: PostSidePanel lo traduce); el formato sale del archivo y
 *     queda aprobada (sale directo, como el botón «Subir»).
 *   · Agregar idea    → la pestaña Idea, para que el cliente la revise.
 *
 * Si se cierra sin escribir ni subir nada, el panel la descarta.
 */
const TIPOS_NUEVA = [
  ["publicar", "Subir contenido", "upload", "Ya tengo el archivo: sale directo, aprobada."],
  ["contenido", "Agregar idea", "bulb", "Para que el cliente la revise y la apruebe."],
];

export function ElegirNuevaPublicacion({ onElegir, onCancel = null }) {
  return (
    <div className="nueva-publicacion" role="group" aria-label="Qué quieres agregar">
      {TIPOS_NUEVA.map(([k, nombre, icono, detalle], i) => (
        <button key={k} type="button" className="nueva-publicacion-opcion" onClick={() => onElegir(k)} autoFocus={i === 0}>
          <Icon name={icono} size={20} />
          <span>
            <strong>{nombre}</strong>
            <small>{detalle}</small>
          </span>
        </button>
      ))}
      {onCancel && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>
      )}
    </div>
  );
}

/**
 * Menú de acciones secundarias.
 * Recoge lo que antes eran botones sueltos con el mismo peso visual que
 * la acción principal, incluido el visor de diagnóstico.
 */

const REF_FORMATS = [
  { key: "post", label: "Post", icon: "formatPost", color: "#4DA3FF" },
  { key: "carrusel", label: "Carrusel", icon: "formatCarrusel", color: "#FFA53D" },
  { key: "video", label: "Reel / Video", icon: "formatReel", color: "#FF6392" },
];

export function VisualRefSection({ formatKey, label, icon, color, refs, onAdd, onRemove, onAddLink, ids }) {
  const inputRef = useRef(null);
  const [linkUrl, setLinkUrl] = useState("");
  const isVideo = formatKey === "video";
  const items = refs.filter((r) => r.format === formatKey);

  return (
    <div style={{ marginBottom: "var(--sp-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
        <Icon name={icon} size={18} style={{ color }} />
        <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)", color }}>{label}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        aria-label={`Subir referencias de ${label}`}
        onChange={(e) => {
          for (const file of e.target.files) onAdd(file, formatKey);
          e.target.value = "";
        }}
      />
      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", marginBottom: "var(--sp-2)" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" size={14} /> Subir archivos
        </button>
      </div>
      {isVideo && (
        <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-2)", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="label" style={{ textTransform: "none", color: "var(--text-dim)" }} htmlFor={`${ids}-vlink-${formatKey}`}>
              Pegar enlace de video
            </label>
            <input
              id={`${ids}-vlink-${formatKey}`}
              className="input"
              style={{ fontSize: "var(--fs-2xs)" }}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://youtube.com/… o https://instagram.com/reel/…"
            />
          </div>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            disabled={!linkUrl.trim()}
            onClick={() => {
              onAddLink(linkUrl.trim(), formatKey);
              setLinkUrl("");
            }}
          >
            <Icon name="link" size={14} /> Agregar
          </button>
        </div>
      )}
      {items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "var(--sp-2)" }}>
          {items.map((vr) => (
            <div key={vr.id} style={{ position: "relative" }}>
              {vr.type === "link" ? (
                <a href={vr.url} target="_blank" rel="noopener noreferrer" style={{ width: "100%", aspectRatio: "1", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", textDecoration: "none", padding: "var(--sp-2)" }}>
                  <Icon name="link" size={24} style={{ color: "var(--accent)", marginBottom: "var(--sp-1)" }} />
                  <span style={{ fontSize: "var(--fs-3xs)", color: "var(--text-dim)", wordBreak: "break-all", textAlign: "center", lineHeight: 1.2 }}>{vr.name || vr.url}</span>
                </a>
              ) : (
                <img
                  src={vr.url}
                  alt={vr.name || "Referencia visual"}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                />
              )}
              <button
                type="button"
                className="btn-icon"
                aria-label={`Quitar referencia ${vr.name || ""}`}
                onClick={() => onRemove(vr.id)}
                style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,.6)", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {items.length === 0 && (
        <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", fontStyle: "italic" }}>Sin referencias</p>
      )}
    </div>
  );
}

/**
 * «Editar el mes»: campaña, semanas, ofertas y referencias. `semanas` son
 * las del mes tal como las pinta la rejilla (lib/campanas.js): cada una
 * tiene su campo aunque todavía no tenga nombre —antes sólo salían las que
 * ya lo tenían, y un mes sin planificar no tenía dónde escribirlos—.
 * `aviso`: lo que dijo la IA al proponer los nombres.
 */
export function EditMetaDialog({ metaForm, setMetaForm, onSave, onClose, tabInicial = "general", semanas = [], aviso = "", client = null }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [activeTab, setActiveTab] = useState(tabInicial);
  const filasSemanas = semanas.length
    ? semanas.map((s, i) => ({ i, etiqueta: `Semana ${s.numero} · ${rangoSemana(s.desde, s.hasta)}` }))
    : (metaForm.weekConcepts || []).map((_, i) => ({ i, etiqueta: `Semana ${i + 1}` }));

  const addVisualRef = async (file, format) => {
    try {
      const dataUrl = await compressImage(file, 600);
      setMetaForm((p) => ({
        ...p,
        visualReferences: [...(p.visualReferences || []), { id: uid(), url: dataUrl, name: file.name, format: format || "post" }],
      }));
    } catch (e) {
      console.error("No se pudo comprimir la imagen:", e);
    }
  };

  const addVisualLink = (url, format) => {
    const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    setMetaForm((p) => ({
      ...p,
      visualReferences: [...(p.visualReferences || []), { id: uid(), url, name: hostname, format, type: "link" }],
    }));
  };

  const removeVisualRef = (refId) => {
    setMetaForm((p) => ({
      ...p,
      visualReferences: (p.visualReferences || []).filter((r) => r.id !== refId),
    }));
  };

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 560 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Editar el mes</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <div className="segmented" role="group" aria-label="Sección de edición" style={{ margin: "0 var(--sp-4)", marginBottom: "var(--sp-2)", flexWrap: "wrap" }}>
          <button type="button" className={`segmented-btn ${activeTab === "general" ? "active" : ""}`} aria-pressed={activeTab === "general"} onClick={() => setActiveTab("general")}>
            General
          </button>
          <button type="button" className={`segmented-btn ${activeTab === "weeks" ? "active" : ""}`} aria-pressed={activeTab === "weeks"} onClick={() => setActiveTab("weeks")}>
            Semanas
          </button>
          <button type="button" className={`segmented-btn ${activeTab === "offers" ? "active" : ""}`} aria-pressed={activeTab === "offers"} onClick={() => setActiveTab("offers")}>
            Ofertas
          </button>
          <button type="button" className={`segmented-btn ${activeTab === "estrategia" ? "active" : ""}`} aria-pressed={activeTab === "estrategia"} onClick={() => setActiveTab("estrategia")}>
            Estrategia
          </button>
          <button type="button" className={`segmented-btn ${activeTab === "visuals" ? "active" : ""}`} aria-pressed={activeTab === "visuals"} onClick={() => setActiveTab("visuals")}>
            Ref. Visuales
          </button>
        </div>

        <div className="sheet-body">
          {aviso && <p role="status" className="notice" style={{ marginBottom: "var(--sp-3)" }}>{aviso}</p>}
          {activeTab === "general" && (
            <>
              <div className="field">
                <label className="label" htmlFor={`${ids}-camp`}>Campaña del mes</label>
                <input id={`${ids}-camp`} className="input" value={metaForm.campaign} placeholder="Ej: Otoño en una taza" onChange={(e) => setMetaForm((p) => ({ ...p, campaign: e.target.value }))} />
                <p className="hint">El nombre que agrupa todo el mes. Las semanas, en la pestaña Semanas.</p>
              </div>
            </>
          )}

          {activeTab === "weeks" && (
            <fieldset style={{ border: "none" }}>
              <legend className="label">Conceptos semanales</legend>
              <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
                El nombre de la campaña de cada semana: sale en el calendario encima de su fila y la IA lo usa al escribir.
              </p>
              {filasSemanas.map(({ i, etiqueta }) => (
                <div key={i} className="field">
                  <label className="label" style={{ textTransform: "none", color: "var(--text-dim)" }} htmlFor={`${ids}-wk-${i}`}>
                    {etiqueta}
                  </label>
                  <input
                    id={`${ids}-wk-${i}`}
                    className="input"
                    value={(metaForm.weekConcepts || [])[i] || ""}
                    placeholder="Ej: Semana del café de otoño"
                    onChange={(e) => setMetaForm((p) => {
                      const wc = [...(p.weekConcepts || [])];
                      wc[i] = e.target.value;
                      return { ...p, weekConcepts: wc };
                    })}
                  />
                </div>
              ))}
            </fieldset>
          )}


          {activeTab === "offers" && (
            <>
              <div className="field">
                <label className="label" htmlFor={`${ids}-offers`}>Descuentos y ofertas del mes</label>
                <textarea
                  id={`${ids}-offers`}
                  className="textarea"
                  style={{ minHeight: 100 }}
                  value={metaForm.offers || ""}
                  onChange={(e) => setMetaForm((p) => ({ ...p, offers: e.target.value }))}
                  placeholder="Ej: 20% de descuento en todos los servicios, 2x1 en productos seleccionados…"
                />
                <p className="hint">
                  Estas ofertas se incluyen como contexto al generar contenido con IA.
                </p>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-promo-code`}>Código promocional</label>
                <input
                  id={`${ids}-promo-code`}
                  className="input"
                  value={metaForm.promoCode || ""}
                  onChange={(e) => setMetaForm((p) => ({ ...p, promoCode: e.target.value }))}
                  placeholder="Ej: VERANO2026"
                />
              </div>
            </>
          )}

          {/* La estrategia del mes (objetivo, foco, etapas), en su chunk: es de «Planificar mes». */}
          {activeTab === "estrategia" && (
            <Suspense fallback={<p className="hint">Cargando…</p>}>
              <EditorEstrategia
                client={client}
                valor={metaForm.estrategia}
                semanas={semanas}
                conceptos={metaForm.weekConcepts || []}
                onCambiar={(estrategia) => setMetaForm((p) => ({ ...p, estrategia }))}
              />
            </Suspense>
          )}

          {activeTab === "visuals" && (
            <fieldset style={{ border: "none" }}>
              <legend className="label">Referencias visuales por formato</legend>
              <p className="hint" style={{ marginBottom: "var(--sp-3)" }}>
                Sube imágenes de referencia organizadas por formato para que el cliente vea
                el estilo de cada tipo de contenido. En video también puedes pegar enlaces.
              </p>
              {REF_FORMATS.map((rf) => (
                <VisualRefSection
                  key={rf.key}
                  formatKey={rf.key}
                  label={rf.label}
                  icon={rf.icon}
                  color={rf.color}
                  refs={metaForm.visualReferences || []}
                  onAdd={addVisualRef}
                  onRemove={removeVisualRef}
                  onAddLink={addVisualLink}
                  ids={ids}
                />
              ))}
            </fieldset>
          )}
        </div>

        <div className="sheet-footer">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={onSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// «Enviar a cliente» vive en EnviarCliente.jsx, en diferido (CalendarView lo carga al abrirlo).

export function AddPostDialog({ date, onElegir, onClose }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet" style={{ maxWidth: 420 }}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-sm)" }}>Agregar publicación — {date}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <ElegirNuevaPublicacion onElegir={onElegir} />
        </div>
      </div>
    </div>
  );
}
