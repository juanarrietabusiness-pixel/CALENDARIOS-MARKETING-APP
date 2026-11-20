import { useEffect, useId, useState } from "react";
import { leerManualEditor, leerVersionEditor, guardarManualEditor, volverAVersionEditor } from "../lib/manualEditorApi";
import { PARTES_EDITOR, ESTADOS_TIPO, limpiarPartes, partesDistintas, juntarPartes } from "../lib/manualEditor";
import { editaLaAgencia } from "../lib/sesionActual";

// ============================================================
// Ajustes → Manuales de la agencia → «Editor de video»
//
// El manual que lee Claude cuando edita los clips que grabó una persona (docs/propuesta-edicion-video-grabado.md).
// La base es la de la casa (src/lib/manualEditor.js); aquí la agencia cambia las partes que quiera. Cada guardado es una
// VERSIÓN y se puede volver a cualquiera (lo que crea otra versión: nada se borra). Si otra persona guardó mientras se
// editaba, se junta por partes; si las dos cambiaron la misma, no se pisa: se dice y se enseña lo suyo.
//
// Va en su propio chunk (lazy en SeccionManualCampanas): la base del manual pesa y casi nadie abre esto.
// ============================================================

const NOMBRE = Object.fromEntries(PARTES_EDITOR.map((p) => [p.id, p.nombre]));
const nombres = (ids) => ids.map((id) => `«${NOMBRE[id] ?? id}»`).join(", ");
const cuando = (iso) => (iso ? new Date(iso).toLocaleString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const etiqueta = (fondo, color) => ({ background: fondo, color, fontSize: "var(--fs-3xs)" });

export default function SeccionManualEditor({ pulso = 0 }) {
  const ids = useId();
  const puede = editaLaAgencia();
  const [estado, setEstado] = useState(null); // lo que dijo el servidor
  const [leidas, setLeidas] = useState({}); // las partes de la versión que se leyó (para juntar en un 409)
  const [partes, setPartes] = useState({}); // lo que se está editando
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [suyas, setSuyas] = useState(null); // lo que guardó otra persona en las partes que chocaron
  const [vista, setVista] = useState(null); // una versión vieja, para verla
  const [volverA, setVolverA] = useState(null); // la versión a la que se pide volver (confirmar en línea)

  const poner = (e) => { setEstado(e); setLeidas(e.partes); setPartes(e.partes); setMotivo(""); setSuyas(null); };
  useEffect(() => {
    leerManualEditor().then(poner).catch((e) => setAviso({ ok: false, texto: e.message }));
  }, [pulso]);

  const cambiadas = estado ? partesDistintas(leidas, partes) : [];

  const guardar = async (version = estado.version, conPartes = partes) => {
    setOcupado(true);
    setAviso(null);
    try {
      const e = await guardarManualEditor({ version, partes: limpiarPartes(conPartes), motivo: motivo.trim() });
      poner(e);
      setAviso({ ok: true, texto: `Guardado como versión ${e.version}. Lo lee el próximo video que se edite.` });
    } catch (err) {
      const actual = err.estado === 409 ? err.datos?.actual : null;
      if (!actual) { setAviso({ ok: false, texto: err.message }); setOcupado(false); return; }
      // Otra persona guardó: lo mío va encima de lo suyo; si cambiamos la misma parte, no se pisa.
      const { partes: juntas, choques } = juntarPartes({ leidas, mias: conPartes, ultimas: actual.partes });
      if (!choques.length) { setLeidas(actual.partes); await guardar(actual.version, juntas); return; }
      const mias = limpiarPartes(conPartes);
      const conLoMio = { ...juntas };
      for (const id of choques) { if (mias[id]) conLoMio[id] = mias[id]; else delete conLoMio[id]; }
      setEstado((x) => ({ ...x, version: actual.version }));
      setLeidas(actual.partes);
      setPartes(conLoMio);
      setSuyas(Object.fromEntries(choques.map((id) => [id, actual.partes[id] ?? ""])));
      setAviso({ ok: false, texto: `Otra persona guardó la versión ${actual.version} y también cambió ${nombres(choques)}. Abajo está lo suyo; si guardas, queda lo tuyo.` });
    }
    setOcupado(false);
  };

  const ver = async (n) => {
    if (vista?.version === n) { setVista(null); return; }
    try { setVista(await leerVersionEditor(n)); } catch (e) { setAviso({ ok: false, texto: e.message }); }
  };

  const volver = async (n) => {
    setOcupado(true);
    setAviso(null);
    try {
      const e = await volverAVersionEditor({ a: n, version: estado.version });
      poner(e);
      setVolverA(null);
      setVista(null);
      setAviso({ ok: true, texto: `Listo: la versión ${e.version} es la ${n} otra vez.` });
    } catch (err) {
      setAviso({ ok: false, texto: err.estado === 409 ? `${err.message} Recarga la página para ver la última antes de volver atrás.` : err.message });
    }
    setOcupado(false);
  };

  if (!estado) return <p className="hint">{aviso?.texto ?? "Cargando el manual del editor…"}</p>;

  const grupo = (g) => PARTES_EDITOR.filter((p) => p.grupo === g).map((p) => {
    const texto = partes[p.id] ?? "";
    const casa = estado.cambiosDeLaCasa.includes(p.id);
    const propia = Boolean(limpiarPartes({ [p.id]: texto })[p.id]);
    return (
      <details key={p.id} className="field" style={{ borderTop: "1px solid var(--border-light)", paddingTop: "var(--sp-2)" }}>
        <summary className="label" style={{ display: "list-item", cursor: "pointer", minHeight: "var(--tap-sm)", lineHeight: 2 }}>
          {p.nombre}
          {p.ejemplo && <span className="hint" style={{ margin: 0, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> · {p.ejemplo}</span>}
          {p.estado && p.estado !== "completo" && <span className="badge" style={{ ...etiqueta("var(--surface-3)", "var(--text-dim)"), marginLeft: "var(--sp-2)" }}>{ESTADOS_TIPO[p.estado]}</span>}
          {propia && <span className="badge" style={{ ...etiqueta("var(--accent-soft)", "var(--text-muted)"), marginLeft: "var(--sp-2)" }}>De la agencia</span>}
          {casa && <span className="badge" style={{ ...etiqueta("var(--alt-soft)", "var(--text)"), marginLeft: "var(--sp-2)" }}>La casa la cambió</span>}
        </summary>
        <label className="sr-only" htmlFor={`${ids}-${p.id}`}>{p.nombre}</label>
        <textarea id={`${ids}-${p.id}`} className="textarea" rows={p.grupo === "tipo" ? 9 : 7} maxLength={p.tope} readOnly={!puede}
          value={texto} placeholder={p.base || "Sin escribir: lo vacío de la casa. Escribe aquí cómo se edita este tipo."}
          onChange={(e) => setPartes((x) => ({ ...x, [p.id]: e.target.value }))} />
        <p className="hint" style={{ margin: 0 }}>{texto ? `${texto.length.toLocaleString("es")} de ${p.tope.toLocaleString("es")} caracteres.` : "Vacío: vale el de la casa (el que se ve de ejemplo)."}</p>
        {suyas && p.id in suyas && (
          <div className="notice notice-warn" role="note">
            <strong>Lo que guardó la otra persona:</strong>
            <pre style={{ whiteSpace: "pre-wrap", margin: "var(--sp-1) 0 0", fontFamily: "inherit", fontSize: "var(--fs-xs)" }}>{suyas[p.id] || "(lo dejó como el de la casa)"}</pre>
          </div>
        )}
        {casa && (
          <details>
            <summary className="hint" style={{ cursor: "pointer" }}>La versión de la casa cambió desde que la agencia editó esta parte: verla</summary>
            <pre style={{ whiteSpace: "pre-wrap", margin: "var(--sp-1) 0 0", fontFamily: "inherit", fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>{p.base || "(vacía)"}</pre>
          </details>
        )}
        {puede && (
          <div className="action-row" style={{ margin: 0 }}>
            {!texto && p.base && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPartes((x) => ({ ...x, [p.id]: p.base }))}>Partir del de la casa</button>}
            {texto && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPartes((x) => ({ ...x, [p.id]: "" }))}>Dejar el de la casa</button>}
          </div>
        )}
      </details>
    );
  });

  return (
    <div id="manual-editor" className="field" style={{ gap: "var(--sp-3)" }}>
      <h3 className="label" style={{ fontSize: "var(--fs-md)", margin: 0 }}>Editor de video (videos grabados)</h3>
      <p className="hint" style={{ margin: 0 }}>
        Lo que lee Claude cuando edita los clips que grabó una persona: lo común a todo video y lo de cada tipo (persona a
        cámara, persona y pantalla…). Vale la última versión; cada parte vacía, la de la casa. Cada vez que se guarda queda
        una versión, y se puede volver a cualquiera.
      </p>
      <p className="hint" style={{ margin: 0 }}>
        {estado.guardada
          ? `Versión ${estado.version} · ${cuando(estado.guardada.cuando)}${estado.guardada.por ? ` · ${estado.guardada.por}` : ""}${estado.guardada.motivo ? ` · ${estado.guardada.motivo}` : ""}`
          : "La de la casa: la agencia aún no lo ha cambiado."}
      </p>
      {estado.cambiosDeLaCasa.length > 0 && (
        <p className="notice notice-warn" role="status" style={{ margin: 0 }}>
          La versión de la casa de {nombres(estado.cambiosDeLaCasa)} cambió desde que la agencia la editó. Ábrela para comparar.
        </p>
      )}

      <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <legend className="label">Lo común a todo video</legend>
        {grupo("comun")}
      </fieldset>
      <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <legend className="label">Por tipo de video</legend>
        {grupo("tipo")}
      </fieldset>

      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "notice notice-error"} style={{ margin: 0 }}>{aviso.texto}</p>}</div>
      {puede ? (
        <>
          <div className="field">
            <label className="label" htmlFor={`${ids}-motivo`}>Qué cambiaste (opcional)</label>
            <input id={`${ids}-motivo`} className="input" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: los subtítulos van más arriba en los videos de obra" />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => guardar()} disabled={ocupado || !cambiadas.length}>
            {ocupado ? "Guardando…" : cambiadas.length ? `Guardar como versión ${estado.version + 1} (${cambiadas.length} ${cambiadas.length === 1 ? "parte" : "partes"})` : "Sin cambios"}
          </button>
        </>
      ) : <p className="hint" style={{ margin: 0 }}>Lo cambian el administrador y los editores de la agencia.</p>}

      {estado.versiones.length > 0 && (
        <details className="field">
          <summary className="label" style={{ display: "list-item", cursor: "pointer", minHeight: "var(--tap-sm)" }}>Versiones ({estado.version})</summary>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
            {estado.versiones.map((v) => (
              <li key={v.version} style={{ borderTop: "1px solid var(--border-light)", paddingTop: "var(--sp-2)" }}>
                <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
                  <strong>Versión {v.version}</strong>{v.version === estado.version ? " (la vigente)" : ""} · {cuando(v.cuando)}{v.por ? ` · ${v.por}` : ""}
                </p>
                <p className="hint" style={{ margin: 0 }}>
                  {v.motivo}{v.cambia ? ` · ${v.cambia.length ? `cambió ${nombres(v.cambia)}` : "sin cambios de texto"}` : ""}
                </p>
                <div className="action-row" style={{ margin: "var(--sp-1) 0 0" }}>
                  <button type="button" className="btn btn-ghost btn-sm" aria-expanded={vista?.version === v.version} aria-controls={`${ids}-vista`} onClick={() => ver(v.version)}>
                    {vista?.version === v.version ? "Ocultar" : "Ver"}
                  </button>
                  {puede && v.version !== estado.version && (volverA === v.version ? (
                    <>
                      <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => volver(v.version)}>Sí, volver a la {v.version}</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVolverA(null)}>Cancelar</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado || cambiadas.length > 0} title={cambiadas.length ? "Guarda o descarta lo que estás editando antes" : undefined}
                      onClick={() => setVolverA(v.version)}>Volver a esta</button>
                  ))}
                </div>
                {vista?.version === v.version && (
                  <div id={`${ids}-vista`} style={{ marginTop: "var(--sp-2)" }}>
                    {Object.keys(vista.partes).length ? Object.entries(vista.partes).map(([id, t]) => (
                      <div key={id} style={{ marginBottom: "var(--sp-2)" }}>
                        <p className="label" style={{ margin: 0 }}>{NOMBRE[id] ?? id}</p>
                        <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>{t}</pre>
                      </div>
                    )) : <p className="hint" style={{ margin: 0 }}>Todo como el de la casa.</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
