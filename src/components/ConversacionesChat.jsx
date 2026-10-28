import { useId, useState } from "react";
import Icon from "./Icon";
import { ordenarConversaciones, cuandoFue, TITULO_NUEVA } from "../lib/conversaciones";

// ============================================================
// La lista de conversaciones del asistente
//
// Una por tema, de TODO el equipo. Se abre una, se empieza otra, se renombra
// en el sitio y se borra con un segundo toque (borrar se lleva sus mensajes).
// Con el asistente ampliado va a la izquierda, fija; si no, se despliega
// debajo de la cabecera.
// ============================================================

export default function ConversacionesChat({ conversaciones, actualId, onAbrir, onNueva, onRenombrar, onBorrar, lateral = false, cargando = false, filtro = null, onFiltro = null }) {
  const ids = useId();
  const [buscar, setBuscar] = useState("");
  const [editando, setEditando] = useState(null); // { id, titulo }
  const [borrar, setBorrar] = useState(null); // id a la espera del segundo toque
  const [error, setError] = useState("");
  const lista = ordenarConversaciones(conversaciones, buscar);

  const guardarTitulo = async () => {
    const t = editando?.titulo?.trim();
    if (!t) { setEditando(null); return; }
    try {
      await onRenombrar(editando.id, t);
      setEditando(null);
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo cambiar el título.");
    }
  };

  const confirmarBorrar = async (id) => {
    if (borrar !== id) { setBorrar(id); return; }
    try {
      await onBorrar(id);
      setBorrar(null);
      setError("");
    } catch (e) {
      setError(e.message || "No se pudo borrar.");
    }
  };

  return (
    <section className={`chat-conv${lateral ? " chat-conv-lateral" : ""}`} aria-labelledby={`${ids}-t`}>
      <div className="chat-conv-cabecera">
        <h2 id={`${ids}-t`} className="chat-conv-titulo">Conversaciones</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNueva}>
          <Icon name="plus" size={14} /> Nueva
        </button>
      </div>
      {/* Todas o sólo las del director (las de la pestaña Diseño), cuando hay de las dos. */}
      {filtro && onFiltro && (
        <div className="chat-conv-filtro" role="group" aria-label="Qué conversaciones ver">
          <button type="button" className="filter-chip" aria-pressed={filtro === "todas"} onClick={() => onFiltro("todas")}>Todas</button>
          <button type="button" className="filter-chip" aria-pressed={filtro === "diseno"} onClick={() => onFiltro("diseno")}>Diseño</button>
        </div>
      )}
      {conversaciones.length > 4 && (
        <>
          <label htmlFor={`${ids}-b`} className="sr-only">Buscar una conversación</label>
          <input id={`${ids}-b`} className="input chat-conv-buscar" type="search" placeholder="Buscar por título…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </>
      )}
      {error && <p role="alert" className="chat-conv-error">{error}</p>}
      {cargando ? (
        <p className="hint chat-conv-vacio">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="hint chat-conv-vacio">{buscar ? "Ninguna con ese título." : "Aún no hay conversaciones: la primera empieza con tu primer mensaje."}</p>
      ) : (
        <ul className="chat-conv-lista">
          {lista.map((c) => (
            <li key={c.id} className="chat-conv-item" aria-current={c.id === actualId ? "true" : undefined}>
              {editando?.id === c.id ? (
                <form className="chat-conv-editar" onSubmit={(e) => { e.preventDefault(); guardarTitulo(); }}>
                  <label htmlFor={`${ids}-e-${c.id}`} className="sr-only">Título de la conversación</label>
                  <input id={`${ids}-e-${c.id}`} className="input" autoFocus maxLength={80} value={editando.titulo}
                    onChange={(e) => setEditando({ ...editando, titulo: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditando(null); } }} />
                  <button type="submit" className="btn-icon" aria-label="Guardar el título"><Icon name="check" size={16} /></button>
                </form>
              ) : (
                <>
                  <button type="button" className="chat-conv-abrir" onClick={() => onAbrir(c.id)}>
                    <span className="chat-conv-nombre">{c.titulo || TITULO_NUEVA}{c.tema === "diseno" && <span className="badge chat-conv-diseno">Diseño</span>}</span>
                    <span className="chat-conv-fecha">{cuandoFue(c.updated_at)}</span>
                  </button>
                  <button type="button" className="btn-icon" onClick={() => { setBorrar(null); setEditando({ id: c.id, titulo: c.titulo || "" }); }}
                    aria-label={`Cambiar el título de «${c.titulo || TITULO_NUEVA}»`} title="Cambiar el título">
                    <Icon name="pencil" size={16} />
                  </button>
                  <button type="button" className={`btn-icon${borrar === c.id ? " chat-conv-borrar-seguro" : ""}`} onClick={() => confirmarBorrar(c.id)}
                    aria-label={borrar === c.id ? `Pulsa otra vez para borrar «${c.titulo || TITULO_NUEVA}» con sus mensajes` : `Borrar «${c.titulo || TITULO_NUEVA}»`}
                    title={borrar === c.id ? "Pulsa otra vez para borrarla" : "Borrar la conversación"}>
                    <Icon name="trash" size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint chat-conv-pie">Las ve todo el equipo. Lo que deba valer en todas, guárdalo en el cerebro.</p>
    </section>
  );
}
