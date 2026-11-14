import { useId } from "react";
import { ETAPAS_CICLO } from "../../lib/cicloVentas";
import { REPARTO_POR_DEFECTO, MIN_ANUNCIOS_CONJUNTO, MAX_ANUNCIOS_CONJUNTO, errorDelCiclo } from "../../lib/manualCiclo";

// ============================================================
// Ajustes → Manual de campañas: lo del PLAN DE CAMPAÑAS (lib/manualCiclo.js)
//
// El reparto del presupuesto por etapa del ciclo de ventas (60/20/10/10 por defecto) y cuántos anuncios lleva cada
// conjunto (de 3 a 6; el plan pone además el tope de cada etapa: evaluación 4, ascensión 3). Lo lee el plan de campañas (Anuncios → Plan de campañas). Va en su propio componente: el resto
// del Manual lo tocan otras partes del curso, y así cada una vive en su bloque. Un reparto que no suma 100 no se guarda
// (el servidor lo devolvería al de la casa): aquí se dice y se ofrece volver al de la casa.
// ============================================================

export default function ManualCiclo({ m, poner, puede }) {
  const ids = useId();
  const reparto = m?.reparto ?? REPARTO_POR_DEFECTO;
  const error = errorDelCiclo(m);
  const cambiar = (etapa, v) => poner({ reparto: { ...reparto, [etapa]: v === "" ? "" : Math.max(0, Math.min(100, Math.round(Number(v) || 0))) } });
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-2)", minWidth: 0 }}>
      <legend className="label">El plan de campañas</legend>
      <p className="hint" style={{ margin: 0 }}>
        Cómo se reparte la inversión del mes entre las etapas del ciclo de ventas. En una cuenta nueva sólo van presentación y
        evaluación, y su parte vuelve a sumar 100. La campaña de temporada va aparte.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        {ETAPAS_CICLO.map((e) => (
          <div className="field" key={e.id} style={{ flex: "1 1 120px", margin: 0 }}>
            <label className="label" htmlFor={`${ids}-${e.id}`}>{e.nombre} (%)</label>
            <input id={`${ids}-${e.id}`} className="input" type="number" inputMode="numeric" min="0" max="100" step="1" readOnly={!puede}
              value={reparto[e.id] ?? ""} onChange={(ev) => cambiar(e.id, ev.target.value)} aria-describedby={error ? `${ids}-error` : undefined} />
          </div>
        ))}
      </div>
      {error && (
        <p id={`${ids}-error`} role="alert" className="cerebro-error" style={{ margin: 0 }}>
          {error}{" "}
          {puede && <button type="button" className="btn btn-ghost btn-sm" onClick={() => poner({ reparto: { ...REPARTO_POR_DEFECTO } })}>Volver a 60/20/10/10</button>}
        </p>
      )}
      <div className="field" style={{ margin: 0 }}>
        <label className="label" htmlFor={`${ids}-anuncios`}>Anuncios por conjunto</label>
        <select id={`${ids}-anuncios`} className="input" style={{ maxWidth: 140 }} value={m?.anunciosPorConjunto ?? 4} disabled={!puede}
          onChange={(e) => poner({ anunciosPorConjunto: Number(e.target.value) })}>
          {Array.from({ length: MAX_ANUNCIOS_CONJUNTO - MIN_ANUNCIOS_CONJUNTO + 1 }, (_, i) => MIN_ANUNCIOS_CONJUNTO + i).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <p className="hint" style={{ margin: 0 }}>
          Los mismos en todos los conjuntos de una campaña, cada uno de un tipo de arte distinto. Evaluación lleva 4 como mucho y
          ascensión 3: su presupuesto es menor. A un cliente se le puede repartir a mano en su plan (Anuncios → Plan de campañas).
        </p>
      </div>
    </fieldset>
  );
}
