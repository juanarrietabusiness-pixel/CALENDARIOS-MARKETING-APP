import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import EditorPlantilla from "./EditorPlantilla";
import { leerPlantillas } from "../lib/plantillasApi";
import { limpiarPlanCliente, plantillaDelCliente, planParaGuardar, copiaDePlantilla, resumenPlantilla, OBJETIVOS_PLAN } from "../lib/plantillasPlan";

// ============================================================
// El plan de contenido de un cliente (ficha → Semanal)
//
// Qué plantilla de la agencia usa —«Planificar mes» abre con ella— y, si
// hace falta, una copia PERSONALIZADA para él solo: cambiar la de la
// agencia ya no le afecta hasta que se vuelva a ella. Lo que se guarda va
// con la ficha (`plan_contenido`), con la línea que lee la IA ya escrita.
// ============================================================

export default function PlanDelCliente({ valor, onChange, nombreCliente = "" }) {
  const ids = useId();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const plan = limpiarPlanCliente(valor);

  useEffect(() => { leerPlantillas().then(setLista).catch((e) => setError(e.message)); }, []);

  const efectiva = lista ? plantillaDelCliente(plan, lista) : null;
  const guardar = (siguiente) => onChange(lista ? planParaGuardar(siguiente, lista) : null);

  return (
    <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--sp-3)", margin: "0 0 var(--sp-4)" }}>
      <legend className="label" style={{ padding: "0 var(--sp-1)" }}>Plan de contenido</legend>
      <p className="hint" style={{ margin: "0 0 var(--sp-2)" }}>
        Qué se publica cada día según lo que contrató. «Planificar mes» abre con este plan y la IA sabe su objetivo.
        Las plantillas de la agencia se cambian en Ajustes → Plantillas de plan.
      </p>
      {error && <p role="alert" className="cerebro-error">{error}</p>}
      {!lista && !error && <p className="hint">Cargando plantillas…</p>}
      {lista && (
        <>
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor={`${ids}-p`}>Plantilla</label>
            <select id={`${ids}-p`} className="input" value={plan.plantilla}
              onChange={(e) => guardar({ plantilla: e.target.value, personalizada: null })}>
              <option value="">Sin plan (como siempre: se elige al planificar)</option>
              {OBJETIVOS_PLAN.map((o) => (
                <optgroup key={o.id} label={o.nombre}>
                  {lista.filter((p) => p.objetivo === o.id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {efectiva && <p className="hint" style={{ margin: "var(--sp-2) 0 0" }}>{efectiva.personalizada ? "Personalizada para este cliente · " : ""}{resumenPlantilla(efectiva)}</p>}

          {efectiva && !plan.personalizada && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: "var(--sp-2)" }}
              onClick={() => guardar({ plantilla: plan.plantilla, personalizada: copiaDePlantilla(efectiva, { id: "cliente", nombre: `${efectiva.nombre} · ${nombreCliente || "este cliente"}` }) })}>
              <Icon name="pencil" size={14} /> Personalizar para este cliente
            </button>
          )}
          {plan.personalizada && (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <EditorPlantilla valor={plan.personalizada} conNombre={false}
                onCambio={(p) => guardar({ plantilla: plan.plantilla, personalizada: p })} />
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: "var(--sp-2)" }}
                onClick={() => guardar({ plantilla: plan.plantilla, personalizada: null })}>
                <Icon name="undo" size={14} /> Volver a la plantilla de la agencia
              </button>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
