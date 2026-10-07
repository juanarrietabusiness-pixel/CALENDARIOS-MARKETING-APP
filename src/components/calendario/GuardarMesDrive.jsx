import { useId, useMemo, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { FORMATS } from "../../constants";
import { planDrive, carpetasDeFecha, enlaceCarpeta } from "../../lib/drive";
import { guardarPublicacionEnDrive } from "../../lib/guardarDrive";
import "./RevisionMes.css";

// ============================================================
// «Guardar el mes en Drive»: lo mismo que el botón de cada publicación,
// con todas las del mes que tienen piezas, de una vez. Lo ya guardado se
// salta; lo que cambió de archivo, de día o de hora se vuelve a subir
// (la copia vieja va a la papelera de Drive). Lo guardado se apunta en
// las publicaciones al terminar, todo junto: apuntarlo una a una partiría
// cada vez del calendario de antes.
// ============================================================

const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });

export default function GuardarMesDrive({ client, cal, onPoner, onClose }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const [paso, setPaso] = useState("elegir"); // elegir | guardando | listo
  const [estados, setEstados] = useState({}); // postId → { texto, ok }
  const [aviso, setAviso] = useState(null);
  const trabajando = paso === "guardando";
  const ref = useDialogA11y(() => { if (!trabajando) onClose(); });

  const filas = useMemo(() => [...(cal.days ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))
    .flatMap((d) => (d.posts ?? []).map((post) => ({ date: d.date, post, plan: planDrive(post, d.date) })))
    .filter((f) => f.plan.total > 0), [cal.days]);
  const pendientes = filas.filter((f) => f.plan.subir.length || f.plan.quitar.length);
  const piezas = pendientes.reduce((n, f) => n + f.plan.subir.length, 0);

  const guardar = async () => {
    setPaso("guardando");
    setAviso(null);
    const hechos = new Map();
    let fallos = 0;
    let carpeta = null;
    for (const f of pendientes) {
      setEstados((e) => ({ ...e, [f.post.id]: { texto: "Guardando…" } }));
      try {
        const r = await guardarPublicacionEnDrive(clienteId, f.post, f.date);
        hechos.set(f.post.id, r.guardadoDrive);
        fallos += r.fallos.length;
        setEstados((e) => ({ ...e, [f.post.id]: { ok: !r.fallos.length, texto: r.fallos.length ? `No se guardó ${r.fallos.join(", ")}` : `Guardada (${r.guardados.length})` } }));
      } catch (e) {
        setEstados((x) => ({ ...x, [f.post.id]: { ok: false, texto: e.message } }));
        // Drive desconectado o sin carpeta: las demás fallarían igual.
        if (e.estado === 401 || e.estado === 404 || e.estado === 409) { fallos += 1; break; }
        fallos += 1;
      }
    }
    if (hechos.size) onPoner((p) => (hechos.has(p.id) ? { ...p, guardadoDrive: hechos.get(p.id) } : p));
    carpeta = client?.driveFolder ? enlaceCarpeta(client.driveFolder) : null;
    setPaso("listo");
    // El botón de guardar desaparece: el foco vuelve al diálogo (si no, Escape ya no lo cierra).
    ref.current?.focus({ preventScroll: true });
    setAviso({ ok: !fallos, texto: fallos ? `Listo, con ${fallos} ${fallos === 1 ? "cosa que no salió" : "cosas que no salieron"}: mira cada publicación.` : "Listo: el mes está en Drive.", carpeta });
  };

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet revision-mes" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Guardar el mes en Drive</h2>
            <p className="hint" style={{ margin: 0 }}>En la carpeta del cliente: {carpetasDeFecha(`${cal.year}-${String(cal.month + 1).padStart(2, "0")}-01`)[0]} / Semana N / «Martes 6 - Semana 2 - 8 am».</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} disabled={trabajando} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <div aria-live="polite">
            {aviso && (
              <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>
                {aviso.texto}{aviso.carpeta && <> <a href={aviso.carpeta} target="_blank" rel="noopener noreferrer">Abrir la carpeta</a></>}
              </p>
            )}
          </div>
          {!filas.length && <p className="hint">Ninguna publicación de este mes tiene piezas subidas todavía.</p>}
          <ul className="revision-lista">
            {filas.map(({ date, post, plan }) => {
              const e = estados[post.id];
              const falta = plan.subir.length || plan.quitar.length;
              return (
                <li key={post.id} className="revision-item">
                  <div className="revision-cabeza">
                    <strong>{fechaCorta(date)} · {FORMATS[post.format]?.label ?? post.format}</strong>
                    <span className="hint">{String(post.title || post.idea || "").slice(0, 60)}</span>
                  </div>
                  <p className={`revision-problema${e?.ok === false ? "" : " revision-ok"}`}>
                    {e ? e.texto : falta
                      ? `${plan.subir.length} ${plan.subir.length === 1 ? "pieza" : "piezas"} por guardar${plan.guardadas ? ` (${plan.guardadas} ya estaban)` : ""}`
                      : <><Icon name="check" size={12} /> Ya está en Drive</>}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="sheet-footer">
          {paso === "listo" ? (
            <button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>
          ) : (
            <>
              <span className="hint" style={{ flex: 1 }}>{pendientes.length ? `${piezas} ${piezas === 1 ? "pieza" : "piezas"} de ${pendientes.length} ${pendientes.length === 1 ? "publicación" : "publicaciones"}` : "Todo está guardado."}</span>
              <button type="button" className="btn btn-primary" disabled={trabajando || !pendientes.length} onClick={guardar}>
                <Icon name="upload" size={16} /> {trabajando ? "Guardando…" : "Guardar en Drive"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
