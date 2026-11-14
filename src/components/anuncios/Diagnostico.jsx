import { useId } from "react";
import Icon from "../Icon";
import Revision3Q from "./Revision3Q";
import { useDialogA11y } from "../../hooks/useDialogA11y";

// ============================================================
// El diagnóstico de las campañas activas (Anuncios → Campañas)
//
// Es la REVISIÓN 3Q (Revision3Q.jsx, la misma de Resultados → Anuncios del cliente) en un diálogo: una sola
// implementación de las reglas y de la pantalla. Antes eran las reglas de src/lib/diagnostico.js con un costo
// aceptable tecleado; ahora el costo sale del número mágico (Marca → Números del negocio, el mismo para todas las
// etapas), y las reglas de
// antes son la base de la revisión (src/lib/tresQ.js).
// ============================================================

export default function Diagnostico({ client, clientId, esAdmin = false, soloLectura = false, onCambio, onCerrar }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet r3q-dialogo" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} className="anu-asistente-titulo"><Icon name="chart" size={18} /> Revisión de las campañas · 3 Q{client?.name ? ` · ${client.name}` : ""}</h2>
            <p className="hint" style={{ margin: 0 }}>También en Resultados → Anuncios del cliente. Nada cambia solo.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCerrar} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <Revision3Q client={client ?? { id: clientId }} esAdmin={esAdmin} soloLectura={soloLectura} onIr={onCerrar} onCambio={onCambio} />
        </div>
      </div>
    </div>
  );
}
