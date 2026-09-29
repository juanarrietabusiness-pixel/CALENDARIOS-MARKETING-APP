// ============================================================
// ‹ Hoy › — recorrer el calendario siempre activo
//
// Sustituye a la fila de pestañas con un calendario por mes («Octubre
// 2026», «Noviembre 2026»…), que había que crear antes de poder usarlos.
// Ahora el calendario es uno y se recorre: un mes que no tiene nada se ve
// igual, vacío, y se escribe en él sin crear nada a mano.
// ============================================================

import Icon from "../Icon";
import { MONTHS } from "../../constants";
import { mesMas, mismoMes, mesDeFecha } from "../../lib/meses";
import { fechaEnZona } from "../../lib/agenda";

export default function NavegadorMes({ mes, onIr, conContenido = [] }) {
  const hoy = mesDeFecha(fechaEnZona());
  const esHoy = mismoMes(mes, hoy);
  const anterior = mesMas(mes, -1);
  const siguiente = mesMas(mes, 1);
  const nombre = (m) => `${MONTHS[m.month]} ${m.year}`;
  // Un punto en las flechas si el mes de al lado ya tiene publicaciones.
  const tiene = (m) => conContenido.some((k) => mismoMes(k, m));
  return (
    <nav className="navegador-mes" aria-label="Mes del calendario">
      <button type="button" className="btn-icon navegador-mes-flecha" onClick={() => onIr(anterior)} aria-label={`Mes anterior: ${nombre(anterior)}`} title={nombre(anterior)}>
        <Icon name="chevronLeft" size={20} />
        {tiene(anterior) && <span className="navegador-mes-punto" aria-hidden="true" />}
      </button>
      <h2 className="navegador-mes-titulo" aria-live="polite">{nombre(mes)}</h2>
      <button type="button" className="btn-icon navegador-mes-flecha" onClick={() => onIr(siguiente)} aria-label={`Mes siguiente: ${nombre(siguiente)}`} title={nombre(siguiente)}>
        <Icon name="chevronRight" size={20} />
        {tiene(siguiente) && <span className="navegador-mes-punto" aria-hidden="true" />}
      </button>
      <button type="button" className="btn btn-secondary btn-sm navegador-mes-hoy" onClick={() => onIr(hoy)} disabled={esHoy} aria-label={`Ir a hoy: ${nombre(hoy)}`}>
        Hoy
      </button>
    </nav>
  );
}
