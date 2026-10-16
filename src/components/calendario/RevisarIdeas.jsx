import { useId, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { FORMATS } from "../../constants";
import { nombreDePilar } from "../../lib/pilares";
import { casillaParaOtra, reemplazarConIdea, ideasDelPlan, estrategiaDelCalendario, usadosDelMes } from "../../lib/ideaPublicacion";
import { porRevisar, ideasDeRevision } from "../../lib/revisionIdeas";
import "./RevisionMes.css";

// ============================================================
// «Revisar las ideas»: la aprobación INTERNA, en tarjetas
//
// El calendario va al cliente con todo ya creado (la agencia decidió no
// mandarle ideas sueltas). Antes de gastar en imágenes, la agencia revisa
// cada idea del mes:
//
//   · Aprobar → pasa a «En producción» (`etapa: "produccion"`): es lo que
//     «Diseñar las que ya hay» produce primero.
//   · Otra → el motor de ideas escribe OTRA para ese día y formato, distinta
//     de la que había, con lo que pida la agencia (opcional).
//   · Quitar → la publicación sale del mes (con un segundo toque).
//
// Nada gasta en el motor de imagen: «Otra» es texto.
// ============================================================

const fechaCorta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });
const FILTROS = [["revisar", "Por revisar"], ["aprobadas", "Aprobadas"], ["todas", "Todas"]];

export default function RevisarIdeas({ client, cal, onAplicar, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  // La función más nueva: «Otra» vuelve tarde y tiene que escribir sobre el calendario de ENTONCES.
  const aplicar = useRef(onAplicar);
  aplicar.current = onAplicar;
  const [filtro, setFiltro] = useState("revisar");
  const [otra, setOtra] = useState({}); // postId → { abierta, nota, cargando, error }
  const [quitando, setQuitando] = useState(null);
  const [aviso, setAviso] = useState("");

  const todas = useMemo(() => ideasDeRevision(cal), [cal]);
  const lista = todas.filter(({ post }) => (filtro === "todas" ? true : filtro === "aprobadas" ? !porRevisar(post) : porRevisar(post)));
  const pendientes = todas.filter(({ post }) => porRevisar(post));

  const cambiarPost = (postId, cambiar) => aplicar.current((days) => days.map((d) => ({ ...d, posts: (d.posts ?? []).map((p) => (p.id === postId ? cambiar(p) : p)) })));
  const aprobar = (postId, si = true) => cambiarPost(postId, (p) => ({ ...p, etapa: si ? "produccion" : "idea" }));
  const aprobarTodas = () => {
    const ids = new Set(pendientes.map(({ post }) => post.id));
    aplicar.current((days) => days.map((d) => ({ ...d, posts: (d.posts ?? []).map((p) => (ids.has(p.id) ? { ...p, etapa: "produccion" } : p)) })));
    setAviso(`${ids.size} ${ids.size === 1 ? "idea aprobada" : "ideas aprobadas"}: pasan a «En producción».`);
  };
  const quitar = (postId) => {
    aplicar.current((days) => days.map((d) => ({ ...d, posts: (d.posts ?? []).filter((p) => p.id !== postId) })));
    setQuitando(null);
    setAviso("Quitada del mes.");
  };
  const ponerOtra = (postId, cambios) => setOtra((m) => ({ ...m, [postId]: { ...m[postId], ...cambios } }));
  const pedirOtra = async ({ post, day }) => {
    const casilla = casillaParaOtra(post, day, { pide: otra[post.id]?.nota ?? "" });
    if (!casilla) return;
    ponerOtra(post.id, { cargando: true, error: "" });
    try {
      const r = await ideasDelPlan(client.dbId || client.id, {
        casillas: [casilla], estrategia: estrategiaDelCalendario(cal), usados: usadosDelMes(cal, post.id), semilla: Math.floor(Math.random() * 1000),
      });
      const idea = r?.ideas?.[0];
      if (!idea) throw new Error("La IA no devolvió otra idea. Inténtalo otra vez.");
      cambiarPost(post.id, (p) => ({ ...reemplazarConIdea(p, idea), etapa: "idea" }));
      ponerOtra(post.id, { cargando: false, abierta: false, nota: "" });
      window.dispatchEvent(new Event("ia:gasto"));
    } catch (e) {
      ponerOtra(post.id, { cargando: false, error: e.message });
    }
  };

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet revision-mes" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)", margin: 0 }}>Revisar las ideas</h2>
            <p className="hint" style={{ margin: 0 }}>Antes de diseñar: aprueba las que van, pide otra para las que no y quita las que sobran. Al cliente le llega el calendario con todo creado.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <div className="est-tipos" role="group" aria-label="Qué ideas ver" style={{ marginBottom: "var(--sp-3)" }}>
            {FILTROS.map(([id, nombre]) => (
              <button key={id} type="button" className="filter-chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                {nombre} ({id === "todas" ? todas.length : id === "aprobadas" ? todas.length - pendientes.length : pendientes.length})
              </button>
            ))}
          </div>
          <div role="status" aria-live="polite" className={aviso ? "hint" : "sr-only"}>{aviso}</div>
          {!lista.length && <p className="revision-vacio"><Icon name="checkCircle" size={18} /> {filtro === "revisar" ? "No queda ninguna idea por revisar." : "No hay ideas aquí."}</p>}
          <ul className="revision-lista">
            {lista.map(({ post, day }) => {
              const o = otra[post.id] ?? {};
              const aprobada = !porRevisar(post);
              const guiado = post.format === "carrusel" || post.format === "reel";
              return (
                <li key={post.id} className="revision-item revisar-idea" data-aprobada={aprobada || undefined}>
                  <p className="revisar-idea-cabeza">
                    <strong>{fechaCorta(day.date)}</strong>
                    <span className="lote-insignia">{FORMATS[post.format]?.label ?? post.format}</span>
                    {post.pilar && <span className="lote-insignia">{nombreDePilar(post.pilar, post.pilarSub)}</span>}
                    {post.producto && <span className="hint">{post.producto}</span>}
                    {aprobada && <span className="revisar-idea-ok"><Icon name="check" size={12} /> Aprobada</span>}
                  </p>
                  {post.title && <p className="revisar-idea-titulo">{post.title}</p>}
                  <p style={{ margin: 0 }}>{post.idea}</p>
                  {post.escena && <p className="hint" style={{ margin: 0 }}><strong>Qué se ve:</strong> {post.escena}</p>}
                  {!guiado && post.textoPieza && <p className="hint" style={{ margin: 0 }}><strong>Texto en la pieza:</strong> {post.textoPieza.replace(/\n+/g, " / ")}</p>}
                  {guiado && post.guion && (
                    <details><summary className="hint">Guion</summary><p className="hint" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{post.guion}</p></details>
                  )}
                  {post.descripcion && (
                    <details><summary className="hint">Caption</summary><p className="hint" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{post.descripcion}</p></details>
                  )}
                  {o.abierta && (
                    <div className="field" style={{ marginTop: "var(--sp-1)" }}>
                      <label className="label" htmlFor={`${ids}-n-${post.id}`}>¿Qué quieres distinto? (opcional)</label>
                      <input id={`${ids}-n-${post.id}`} className="input" maxLength={300} value={o.nota ?? ""} placeholder="Ej.: más divertida, con el producto en uso, sin precio"
                        onChange={(e) => ponerOtra(post.id, { nota: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void pedirOtra({ post, day }); } }} />
                    </div>
                  )}
                  {o.error && <p role="alert" className="cerebro-error">{o.error}</p>}
                  <div className="revisar-idea-botones">
                    {aprobada
                      ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => aprobar(post.id, false)}>Volver a revisar</button>
                      : <button type="button" className="btn btn-primary btn-sm" onClick={() => aprobar(post.id)}><Icon name="check" size={14} /> Aprobar</button>}
                    {o.abierta
                      ? <button type="button" className="btn btn-secondary btn-sm" aria-disabled={Boolean(o.cargando)} onClick={() => !o.cargando && pedirOtra({ post, day })}><Icon name="sparkles" size={14} /> {o.cargando ? "Escribiendo otra…" : "Pedir otra"}</button>
                      : <button type="button" className="btn btn-secondary btn-sm" aria-expanded={false} onClick={() => ponerOtra(post.id, { abierta: true })}><Icon name="refresh" size={14} /> Otra</button>}
                    {quitando === post.id ? (
                      <>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => quitar(post.id)}>Sí, quitarla</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuitando(null)}>No</button>
                      </>
                    ) : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuitando(post.id)}><Icon name="trash" size={14} /> Quitar</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="sheet-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          <button type="button" className="btn btn-primary" disabled={!pendientes.length} onClick={aprobarTodas}>
            <Icon name="check" size={16} /> Aprobar las {pendientes.length} que quedan
          </button>
        </div>
      </div>
    </div>
  );
}
