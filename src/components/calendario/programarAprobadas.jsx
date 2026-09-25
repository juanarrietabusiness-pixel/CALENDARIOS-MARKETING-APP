// ============================================================
// Programar lo aprobado, de una vez
//
// Cuando el cliente aprueba el mes, lo siguiente era abrir publicación
// por publicación y pulsar «Programar» veinte veces. Aquí se revisan
// todas a la vez con las reglas del panel y se programan las que pueden
// salir; las que no, se quedan con su motivo y un botón para abrirlas.
//
// Lo que el navegador arregla solo —la imagen a JPEG, las copias a 4:5 y
// 9:16— se hace aquí antes de programar, igual que en el panel, y el
// calendario se guarda YA: lo que sale es lo que hay en D1.
// ============================================================

import "./programarAprobadas.css";
import { useId, useMemo, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { REDES } from "../../lib/publicacion";
import { revisarAprobadas, fechaHora } from "../../lib/cola";

export default function ProgramarAprobadas({ candidatas, redesDelCliente, onProgramar, onAbrir, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  const revisadas = useMemo(() => revisarAprobadas(candidatas, redesDelCliente), [candidatas, redesDelCliente]);
  const listas = revisadas.filter((r) => r.lista);
  const conProblemas = revisadas.filter((r) => !r.lista);
  const [marcadas, setMarcadas] = useState(() => new Set(listas.map((r) => r.post.id)));
  const [trabajando, setTrabajando] = useState("");
  const [resultado, setResultado] = useState(null);

  const alternar = (id) => setMarcadas((m) => {
    const n = new Set(m);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const programar = async () => {
    setResultado(null);
    try {
      const r = await onProgramar(listas.filter((x) => marcadas.has(x.post.id)), setTrabajando);
      setResultado(r);
    } catch (e) {
      setResultado({ error: e.message });
    }
    setTrabajando("");
  };

  const titulo = (p) => p.title || p.idea || p.descripcion || "Sin título";
  const n = marcadas.size;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !trabajando) onClose(); }}>
      <div ref={ref} className="dialog programar-aprobadas" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <h3 id={`${ids}-t`} className="dialog-titulo">
          <Icon name="clock" size={20} /> Programar lo aprobado
        </h3>
        <p className="hint">
          Las publicaciones que el cliente aprobó y todavía no están en la cola. Cada una sale a su día y hora, en las redes que
          tiene marcadas y que el cliente tiene conectadas.
        </p>

        {revisadas.length === 0 && (
          <p className="notice notice-ok">No queda nada aprobado por programar en este calendario.</p>
        )}

        {listas.length > 0 && (
          <fieldset className="pa-grupo">
            <legend className="label">Listas para programar ({listas.length})</legend>
            <ul className="pa-lista">
              {listas.map((r) => (
                <li key={r.post.id}>
                  <label className="casilla pa-fila">
                    <input type="checkbox" checked={marcadas.has(r.post.id)} onChange={() => alternar(r.post.id)} disabled={!!trabajando} />
                    <span className="pa-texto">
                      <strong>{titulo(r.post)}</strong>
                      <span className="pa-meta">
                        {r.cuando ? fechaHora(r.cuando) : r.fecha} · {r.redes.map((x) => REDES[x]?.nombre ?? x).join(", ")}
                        {r.post.historiaTambien && " · con historia"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        {conProblemas.length > 0 && (
          <section className="pa-grupo" aria-labelledby={`${ids}-p`}>
            <h4 id={`${ids}-p`} className="label">Necesitan un arreglo ({conProblemas.length})</h4>
            <ul className="pa-lista">
              {conProblemas.map((r) => (
                <li key={r.post.id} className="pa-fila pa-problema">
                  <span className="pa-texto">
                    <strong>{titulo(r.post)}</strong>
                    <span className="pa-motivo">{r.errores.join(" ")}</span>
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAbrir(r.post.id)} disabled={!!trabajando}>
                    Abrir
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div role="status" aria-live="polite">
          {trabajando && <p className="hint">{trabajando}</p>}
          {resultado?.error && <p className="notice notice-error">{resultado.error}</p>}
          {resultado && !resultado.error && (
            <div className={`notice ${resultado.fallidas.length ? "notice-warn" : "notice-ok"}`}>
              <p>
                {resultado.programadas
                  ? `Programadas ${resultado.programadas} ${resultado.programadas === 1 ? "pieza" : "piezas"}.`
                  : "No se programó nada."}
              </p>
              {resultado.fallidas.length > 0 && (
                <ul className="pa-fallidas">
                  {resultado.fallidas.map((f) => <li key={f.postId}><strong>{f.titulo}:</strong> {f.motivo}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="dialog-acciones">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={!!trabajando}>
            {resultado && !resultado.error ? "Cerrar" : "Cancelar"}
          </button>
          {!resultado?.programadas && (
            <button type="button" className="btn btn-primary" onClick={programar} disabled={!n || !!trabajando}>
              <Icon name="clock" size={16} /> {trabajando ? "Programando…" : `Programar ${n}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
