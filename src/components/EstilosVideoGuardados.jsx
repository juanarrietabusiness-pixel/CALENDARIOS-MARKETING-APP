import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { listarEstilos, cambiarEstilo, quitarEstilo } from "../lib/estilosVideoApi";
import { USOS_ESTILO_VIDEO } from "../lib/estilosVideo";

// ============================================================
// Los ESTILOS DE VIDEO guardados del cliente en Marca → Kit y voz (en diferido), junto al estilo de los videos de la marca
//
// Cada uno con lo que hace (su resumen), de qué video salió y para qué videos es; se le cambia el nombre o el uso y se
// quita (con un segundo toque). Se guardan desde un video abierto («Estilo del video» → «Guardar como estilo») y se
// escogen en «Video nuevo». Los videos ya hechos con uno no cambian al quitarlo.
// ============================================================

export default function EstilosVideoGuardados({ client, lectura = false }) {
  const ids = useId();
  const [estilos, setEstilos] = useState(null);
  const [editando, setEditando] = useState(null); // { id, nombre, para }
  const [quitar, setQuitar] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    const cargar = () => listarEstilos(client.id).then((l) => { if (vivo) setEstilos(l); }).catch((e) => { if (vivo) { setEstilos([]); setError(e.message); } });
    cargar();
    const alCambiar = (e) => { if (!e.detail?.clienteId || e.detail.clienteId === client.id) cargar(); };
    window.addEventListener("estilos-video", alCambiar);
    return () => { vivo = false; window.removeEventListener("estilos-video", alCambiar); };
  }, [client.id]);

  const guardar = async () => {
    setOcupado(editando.id); setError("");
    try {
      const r = await cambiarEstilo(client.id, editando.id, { nombre: editando.nombre, para: editando.para });
      setEstilos(r.estilos ?? []); setEditando(null);
    } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };
  const borrar = async (id) => {
    if (quitar !== id) { setQuitar(id); return; }
    setOcupado(id); setError("");
    try {
      const r = await quitarEstilo(client.id, id);
      setEstilos(r.estilos ?? []); setQuitar("");
    } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };

  return (
    <div className="field">
      <span className="label">Estilos de video guardados</span>
      <p className="hint" style={{ margin: 0 }}>
        Cómo se vio y se movió un video que quedó bien (el texto, los fondos, las transiciones, el cierre), para que el
        siguiente salga igual: se guarda desde el video («Estilo del video» → «Guardar como estilo») y se escoge en «Video
        nuevo». No guarda la letra ni las imágenes.
      </p>
      {estilos === null && <p className="hint" role="status">Cargando…</p>}
      {estilos?.length === 0 && <p className="hint">Todavía no hay ninguno.</p>}
      {estilos?.length > 0 && (
        <ul className="estilos-video" aria-label="Estilos de video guardados">
          {estilos.map((e) => (
            <li key={e.id} className="estilo-video">
              {editando?.id === e.id ? (
                <div style={{ display: "grid", gap: "var(--sp-2)" }}>
                  <label htmlFor={`${ids}-${e.id}-n`} className="label">Nombre</label>
                  <input id={`${ids}-${e.id}-n`} className="input" maxLength={60} value={editando.nombre} onChange={(x) => setEditando({ ...editando, nombre: x.target.value })} />
                  <label htmlFor={`${ids}-${e.id}-p`} className="label">Para qué videos</label>
                  <select id={`${ids}-${e.id}-p`} className="input" value={editando.para} onChange={(x) => setEditando({ ...editando, para: x.target.value })}>
                    {Object.entries(USOS_ESTILO_VIDEO).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(ocupado) || !editando.nombre.trim()} onClick={guardar}>
                      {ocupado === e.id ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={() => setEditando(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <strong>{e.nombre}</strong>
                  <span className="hint"> · {USOS_ESTILO_VIDEO[e.para]}{e.de?.titulo ? ` · de «${e.de.titulo}»` : ""}</span>
                  <ul className="hint">{(e.resumen ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
                  {!lectura && (
                    <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={() => setEditando({ id: e.id, nombre: e.nombre, para: e.para })}>
                        <Icon name="pencil" size={14} /> Cambiar nombre o uso
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={() => borrar(e.id)} onBlur={() => setQuitar("")}>
                        <Icon name="trash" size={14} /> {ocupado === e.id ? "Quitando…" : quitar === e.id ? "Toca otra vez para quitarlo" : "Quitar"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div aria-live="polite">{error && <p className="va-msg va-error" role="alert">{error}</p>}</div>
    </div>
  );
}
