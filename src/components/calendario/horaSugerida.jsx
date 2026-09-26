// ============================================================
// La hora sugerida: la franja en que mejor responde la cuenta ese día
//
// Sale de las métricas (`horaSugerida` en lib/resultados.js), que se
// piden una vez por cliente y sesión. Con pocos datos no sale nada.
// ============================================================

import { useEffect, useState } from "react";
import Icon from "../Icon";
import { horaSugerida } from "../../lib/resultados";
import { metricasCliente } from "../../lib/db";
import { fmt12h } from "./formato";

// Las publicaciones medidas de cada cliente, una vez por sesión: la hora
// sugerida no merece una petición cada vez que se abre una publicación.
const medidas = new Map();

/** El chip de la hora sugerida: la franja en que mejor responde la cuenta ese día. */
export default function HoraSugerida({ clientId, fecha, hora, onUsar }) {
  const [pubs, setPubs] = useState(() => medidas.get(clientId) ?? null);
  useEffect(() => {
    if (!clientId || medidas.has(clientId)) return undefined;
    let vivo = true;
    metricasCliente(clientId, 90)
      .then((d) => { const p = d?.publicaciones ?? []; medidas.set(clientId, p); if (vivo) setPubs(p); })
      .catch(() => { medidas.set(clientId, []); });
    return () => { vivo = false; };
  }, [clientId]);
  const s = pubs ? horaSugerida(pubs, fecha) : null;
  if (!s) return null;
  // La sugerida es la franja de tres horas que empieza una antes.
  const inicio = Number(s.hora.slice(0, 2)) - 1;
  const h = Number(String(hora).slice(0, 2));
  if (hora && h >= inicio && h < inicio + 3) {
    return <span className="hora-sugerida" data-dentro title={s.motivo}><Icon name="check" size={12} /> En su mejor franja</span>;
  }
  return (
    <button type="button" className="hora-sugerida" onClick={() => onUsar(s.hora)} title={s.motivo}>
      <Icon name="sparkles" size={12} /> Mejor a las {fmt12h(s.hora)}
      <span className="sr-only">. {s.motivo}</span>
    </button>
  );
}

