import { useId, useState, useEffect, useRef } from "react";
import Icon from "./Icon";
import { TIPOS_VISTA, TIPOS_PROPONIBLES, propuestaLimpia } from "../lib/cerebroVista";

// ============================================================
// «Guardar en el cerebro», a la vista antes de guardar
//
// El asistente PROPONE (herramienta guardar_en_cerebro) y la persona decide:
// ve el tipo, el título y el texto, los corrige si hace falta y pulsa
// «Guardar en el cerebro» o «No guardar». Nada se escribe sin ese toque.
// Mientras tanto el turno del asistente espera: su herramienta devuelve lo
// que se decidió.
// ============================================================

/**
 * `propuesta`: { cliente: nombre, tipo, titulo, texto }. `onGuardar(nota)` guarda (lanza si falla) y `onDescartar()`
 * dice que no.
 */
export default function GuardarEnCerebro({ propuesta, onGuardar, onDescartar }) {
  const ids = useId();
  const [f, setF] = useState(() => propuestaLimpia(propuesta));
  const [estado, setEstado] = useState({ guardando: false, error: "" });
  const titulo = useRef(null);
  // La tarjeta aparece en medio del turno: el foco va a ella para que se sepa que espera una decisión.
  useEffect(() => { titulo.current?.focus(); }, []);

  const vacia = !f.titulo.trim() || !f.texto.trim();
  const guardar = async () => {
    if (estado.guardando || vacia) return;
    setEstado({ guardando: true, error: "" });
    try {
      await onGuardar({ ...f, titulo: f.titulo.trim(), texto: f.texto.trim() });
    } catch (e) {
      setEstado({ guardando: false, error: e?.message || "No se pudo guardar." });
    }
  };

  return (
    <section className="chat-cerebro" aria-labelledby={`${ids}-t`}>
      <p id={`${ids}-t`} className="chat-cerebro-titulo" tabIndex={-1} ref={titulo}>
        <Icon name="brain" size={16} /> ¿Lo guardo en el cerebro{propuesta.cliente ? ` de ${propuesta.cliente}` : ""}?
      </p>
      <p className="hint" style={{ margin: 0 }}>Revísalo y corrígelo si hace falta. No se guarda nada hasta que pulses «Guardar».</p>
      <div className="field">
        <label className="label" htmlFor={`${ids}-tipo`}>Tipo</label>
        <select id={`${ids}-tipo`} className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          {TIPOS_PROPONIBLES.map((t) => <option key={t} value={t}>{TIPOS_VISTA[t]?.nombre ?? t}</option>)}
        </select>
        <p className="hint" style={{ margin: 0 }}>{TIPOS_VISTA[f.tipo]?.ayuda}</p>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-ti`}>Título</label>
        <input id={`${ids}-ti`} className="input" maxLength={140} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-tx`}>Texto</label>
        <textarea id={`${ids}-tx`} className="textarea" rows={5} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} />
      </div>
      {estado.error && <p role="alert" className="cerebro-error" style={{ margin: 0 }}>{estado.error}</p>}
      <div className="chat-cerebro-acciones">
        <button type="button" className="btn btn-primary btn-sm" aria-disabled={estado.guardando || vacia} onClick={guardar}>
          <Icon name="check" size={14} /> {estado.guardando ? "Guardando…" : "Guardar en el cerebro"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-disabled={estado.guardando} onClick={() => { if (!estado.guardando) onDescartar(); }}>
          No guardar
        </button>
      </div>
    </section>
  );
}
