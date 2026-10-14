import { useId } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { RANURAS } from "../lib/estudio";

/**
 * «¿Dónde va esta imagen?»: cuando el modelo tiene más de un sitio libre (en video, imagen inicial, final y
 * referencias), la persona escoge. Antes iba sola al primero libre —la imagen inicial— y una referencia nunca
 * llegaba a referencias.
 */
export default function EleccionRanura({ archivo, opciones, modelo, onElegir, onCerrar }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog est-ranura-dialogo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <h3 id={`${ids}-t`}>¿Dónde va esta imagen?</h3>
        <div className="est-ranura-cuerpo">
          {archivo.src && <img src={archivo.src} alt="" className="est-ranura-miniatura" />}
          <p className="hint">{modelo?.nombre ? `${modelo.nombre} la puede usar de varias formas.` : "El modelo la puede usar de varias formas."}</p>
        </div>
        <div className="est-ranura-opciones">
          {opciones.map((rol) => (
            <button key={rol} type="button" className="btn btn-secondary est-ranura-opcion" onClick={() => onElegir(rol)}>
              <strong>{RANURAS[rol]?.nombre ?? rol}</strong>
              <span className="hint">{RANURAS[rol]?.ayuda}</span>
            </button>
          ))}
        </div>
        <div className="est-ranura-pie">
          <button type="button" className="btn btn-ghost" onClick={onCerrar}><Icon name="close" size={16} /> Cancelar</button>
        </div>
      </div>
    </div>
  );
}
