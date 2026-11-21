import { lazy, Suspense, useEffect, useState } from "react";
import { leerActasEdicion, leerPropuestasEdicion } from "../lib/edicionApi";
import PropuestasEdicion from "./PropuestasEdicion";
import { KIT_EDICION } from "../lib/kitEdicionVersion";

// El manual del editor, en su propio chunk (su base pesa): se carga al abrirlo.
const SeccionManualEditor = lazy(() => import("./SeccionManualEditor"));

// ============================================================
// Ajustes → «Editor de video»: el editor de videos GRABADOS (docs/propuesta-edicion-video-grabado.md)
//
// Lo edita Claude en un chat (la receta «editar-video-grabado») con el kit en su máquina; aquí se ve lo que la agencia
// gobierna de él: la versión del kit, el manual que sigue (con sus versiones) y las últimas ediciones, con lo que
// corrigió la persona en cada una. Va en su propio chunk (lazy en Ajustes).
// ============================================================

const cuando = (iso) => (iso ? new Date(iso).toLocaleString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const TIPOS = { "persona-a-camara": "Persona a cámara", "persona-y-pantalla": "Persona y pantalla", "sin-persona": "Sin persona", "solo-idea": "Sólo una idea" };
const segundos = (n) => (typeof n === "number" ? `${n.toLocaleString("es", { maximumFractionDigits: 1 })} s` : "");

export default function SeccionEditorVideo({ pulso = 0 }) {
  const [actas, setActas] = useState(null);
  const [error, setError] = useState("");
  const [manualAbierto, setManualAbierto] = useState(false);
  const [propuestas, setPropuestas] = useState(null);
  const [versionManual, setVersionManual] = useState(0); // al aplicar una propuesta, el manual se vuelve a leer

  const leerPropuestas = () => leerPropuestasEdicion().then(setPropuestas).catch(() => setPropuestas(null));
  useEffect(() => {
    leerActasEdicion().then((r) => { setActas(r.actas); setError(""); }).catch((e) => setError(e.message));
    leerPropuestas();
  }, [pulso]);

  return (
    <>
      <div className="notice" role="note" style={{ margin: 0 }}>
        <p style={{ margin: 0 }}>
          <strong>Kit de edición v{KIT_EDICION.version}</strong> <span className="hint">(huella {KIT_EDICION.huella})</span>
        </p>
        <p className="hint" style={{ margin: "var(--sp-1) 0 0" }}>
          Lo instala Claude en el chat con <code>kit_edicion</code>; si el chat ya tiene otra versión, la vuelve a bajar. Para editar un
          video grabado, pídele en un chat nuevo «edita este video de…» con los clips: sigue la receta «Editar un video grabado».
        </p>
      </div>

      {propuestas && (
        <PropuestasEdicion titulo="Lo que propone aprender para el manual" propuestas={propuestas.generales} puede={propuestas.puedeManual}
          sinPermiso="Las decide quien administra o un editor de toda la agencia." onCambio={async () => { await leerPropuestas(); setVersionManual((v) => v + 1); }} />
      )}

      <h3 className="label" style={{ margin: "var(--sp-3) 0 0" }}>Últimas ediciones</h3>
      {error ? <p role="alert" className="notice notice-error" style={{ margin: 0 }}>{error}</p>
        : !actas ? <p className="hint" style={{ margin: 0 }}>Cargando…</p>
          : !actas.length ? <p className="hint" style={{ margin: 0 }}>Todavía ninguna: el acta la escribe Claude al terminar de editar (acta_de_edicion).</p>
            : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                {actas.map((a) => (
                  <li key={a.id} style={{ borderTop: "1px solid var(--border-light)", paddingTop: "var(--sp-2)" }}>
                    <p style={{ margin: 0, fontSize: "var(--fs-sm)" }}>
                      <strong>{a.cliente.nombre || "Un cliente"}</strong> · {TIPOS[a.tipo] ?? a.tipo} · {cuando(a.cuando)}
                    </p>
                    <p className="hint" style={{ margin: 0 }}>
                      {[a.kitVersion && `kit v${a.kitVersion}`, a.manualVersion ? `manual v${a.manualVersion}` : "manual de la casa", segundos(a.resumen?.duracion),
                        typeof a.resumen?.lufs === "number" && `${a.resumen.lufs} LUFS`,
                        a.correcciones ? `${a.correcciones} ${a.correcciones === 1 ? "corrección" : "correcciones"} de la persona` : "sin correcciones"].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}

      <details className="field" style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--sp-3)" }} onToggle={(e) => { if (e.currentTarget.open) setManualAbierto(true); }}>
        <summary className="label" style={{ display: "list-item", cursor: "pointer", minHeight: "var(--tap-sm)" }}>El manual del editor: cómo se editan los videos grabados</summary>
        {manualAbierto && (
          <Suspense fallback={<p className="hint">Cargando…</p>}>
            <SeccionManualEditor pulso={pulso + versionManual} />
          </Suspense>
        )}
      </details>
    </>
  );
}
