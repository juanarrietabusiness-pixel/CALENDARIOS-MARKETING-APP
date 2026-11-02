import { useState } from "react";
import Icon from "../Icon";
import { MONTHS } from "../../constants";
import { fechaParaAvisar, fraseDeFalta } from "../../lib/temporada";
import { fechaEnZona } from "../../lib/agenda";
import { yoActual } from "../../lib/sesionActual";

// ============================================================
// «Se acerca …»: la fecha comercial (o propia, o escogida) del cliente en las próximas tres semanas
//
// Encima de la rejilla, como el aviso de lo que se repite. No crea nada: recuerda que lo que ya funcionó se puede
// reutilizar en la fecha («De temporada» en «¿Qué quieres?» de cualquier publicación con imagen, y «Otra versión»).
// «Ahora no» lo esconde para ESA fecha, por navegador.
// ============================================================

const clave = (clienteId) => `temporada-avisada:${clienteId}`;
const leer = (clienteId) => {
  try { return JSON.parse(localStorage.getItem(clave(clienteId)) ?? "[]"); } catch { return []; }
};

// Va en su chunk y decide aquí lo que necesita (hoy, sólo lectura): CalendarView está en la carga inicial, en su tope.
export default function AvisoTemporada({ client }) {
  const clienteId = client?.id;
  const [ocultas, setOcultas] = useState(() => leer(clienteId));
  const f = yoActual()?.soloLectura ? null : fechaParaAvisar(client?.fechasEspeciales, fechaEnZona());
  if (!f || ocultas.includes(`${f.id}|${f.fecha}`)) return null;
  const dia = `${+f.fecha.slice(8, 10)} de ${MONTHS[+f.fecha.slice(5, 7) - 1].toLowerCase()}`;
  const ahoraNo = () => {
    const nuevas = [...ocultas, `${f.id}|${f.fecha}`].slice(-20);
    setOcultas(nuevas);
    try { localStorage.setItem(clave(clienteId), JSON.stringify(nuevas)); } catch { /* sin almacenamiento, sólo por ahora */ }
  };
  return (
    <section className="repeticiones-mes" aria-label="Fecha especial que se acerca">
      <p className="repeticiones-mes-titulo">
        <Icon name="calendar" size={16} /> {f.nombre} · {dia}: {fraseDeFalta(f.faltan)}
      </p>
      <p className="hint" style={{ margin: 0 }}>
        Reutiliza lo que ya funcionó: abre una publicación con imagen y, en «¿Qué quieres?», toca «{f.nombre}» y luego «Otra versión». Sale la misma pieza ambientada en la fecha.
      </p>
      <div className="repeticiones-mes-botones">
        <button type="button" className="btn btn-ghost btn-sm" onClick={ahoraNo}>Ahora no</button>
      </div>
    </section>
  );
}
