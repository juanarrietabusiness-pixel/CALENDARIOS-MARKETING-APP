import { useId, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";

// ============================================================
// Activar una campaña: el segundo toque
//
// Lo que se va a gastar, dicho con el resumen que manda el SERVIDOR (su
// 409 sin `confirmado`), y la palabra ACTIVAR escrita a mano. La pantalla
// no es la red: el servidor exige `confirmado: true` y el papel de
// administrador por su cuenta.
// ============================================================

const PALABRA = "ACTIVAR";

export default function DialogoActivar({ confirmar, onConfirmar, onClose }) {
  const ids = useId();
  const [escrito, setEscrito] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState("");
  const ref = useDialogA11y(() => { if (!trabajando) onClose(); });
  const vale = escrito.trim().toUpperCase() === PALABRA;

  const activar = async (e) => {
    e.preventDefault();
    if (!vale) return;
    setTrabajando(true);
    setFallo("");
    try { await onConfirmar(); } catch (err) { setFallo(err.message); setTrabajando(false); }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !trabajando) onClose(); }}>
      <form ref={ref} className="dialog anu-activar" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} aria-describedby={`${ids}-d`} onSubmit={activar}>
        <h3 id={`${ids}-t`} className="dialog-titulo"><Icon name="alert" size={20} /> Activar «{confirmar.campana}»</h3>
        <div id={`${ids}-d`}>
          <p>Al activarla, Meta empieza a gastar del método de pago de la cuenta en cuanto apruebe el anuncio.</p>
          <p className="anu-activar-resumen"><strong>{confirmar.resumen}</strong></p>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-c`}>Escribe {PALABRA} para confirmar</label>
          <input id={`${ids}-c`} className="input" value={escrito} onChange={(e) => setEscrito(e.target.value)} autoComplete="off" autoCapitalize="characters" />
        </div>
        {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
        <div className="anu-activar-botones">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={trabajando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={!vale || trabajando}>
            <Icon name="play" size={16} /> {trabajando ? "Activando…" : "Activar y empezar a gastar"}
          </button>
        </div>
      </form>
    </div>
  );
}
