import { useId, useState } from "react";
import Icon from "./Icon";
import { OBJETIVOS_MES, ETAPAS, objetivoDe, balanceDelMes, resumenFormatos } from "../lib/estrategiaMes";
import { estrategiaConIA } from "../lib/ideaPublicacion";
import "./EstrategiaMes.css";

// ============================================================
// La estrategia del mes y su balance
//
//   · PasoEstrategia: el paso «Estrategia» de «Planificar mes» — objetivo,
//     producto foco, campaña y «Proponer la estrategia con IA», que trae
//     también el concepto y la etapa del embudo de cada semana y lo que mejor
//     funcionó el mes anterior. Propone: lo que cambia se puede deshacer.
//   · EtapaSemana: la etapa del embudo junto al concepto de cada semana.
//   · BalanceDelMes: cuántas de cada formato, tipo y nivel, y los avisos
//     (src/lib/estrategiaMes.js). Lo usan «Planificar mes» y «Revisar el mes».
// ============================================================

export function PasoEstrategia({
  client, month, year, objetivo, setObjetivo, focoId, setFocoId, productos = [], campaign, setCampaign,
  offers = "", semanas = [], propuesta, onPropuesta, onDeshacer,
}) {
  const ids = useId();
  const [estado, setEstado] = useState({ cargando: false, error: "" });
  const proponer = async () => {
    if (estado.cargando) return;
    setEstado({ cargando: true, error: "" });
    try {
      const r = await estrategiaConIA(client.dbId || client.id, { year, month, objetivo, focoId, ofertas: offers, semanas });
      onPropuesta(r);
      window.dispatchEvent(new Event("ia:gasto"));
      setEstado({ cargando: false, error: "" });
    } catch (e) {
      setEstado({ cargando: false, error: e.message });
    }
  };
  const obj = objetivoDe(objetivo);
  return (
    <div className="estrategia-mes">
      <div className="field">
        <span className="label" id={`${ids}-obj`}>Objetivo del mes</span>
        <div className="est-tipos" role="radiogroup" aria-labelledby={`${ids}-obj`}>
          {OBJETIVOS_MES.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={objetivo === o.id} className={`filter-chip${objetivo === o.id ? " active" : ""}`}
              onClick={() => setObjetivo(objetivo === o.id ? "" : o.id)}>{o.nombre}</button>
          ))}
        </div>
        <p className="hint" style={{ margin: 0 }}>{obj ? obj.ayuda : "Sin escoger, la IA propone el que más convenga."}</p>
      </div>
      {productos.length > 0 && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-foco`}>Producto foco</label>
          <select id={`${ids}-foco`} className="input" value={focoId} onChange={(e) => setFocoId(e.target.value)}>
            <option value="">Toda la marca (rotan todos)</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <p className="hint" style={{ margin: 0 }}>El foco sale en la mitad de las publicaciones con producto; los demás rotan en el resto.</p>
        </div>
      )}
      <div className="estrategia-proponer">
        <button type="button" className="btn btn-primary btn-sm" aria-disabled={estado.cargando} onClick={proponer}>
          <Icon name="sparkles" size={14} /> {estado.cargando ? "Pensando la estrategia…" : "Proponer la estrategia con IA"}
        </button>
        {propuesta?.antes && <button type="button" className="btn btn-ghost btn-sm" onClick={onDeshacer}>Deshacer</button>}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Con el catálogo, el estudio de mercado, las fechas especiales y lo que mejor funcionó el mes anterior: el objetivo, el foco,
        la campaña y el concepto de cada semana con su etapa del embudo. Es texto: no gasta en imágenes.
      </p>
      <div role="status" aria-live="polite" className="sr-only">{estado.cargando ? "Pensando la estrategia…" : propuesta ? "Estrategia propuesta." : ""}</div>
      {estado.error && <p role="alert" className="cerebro-error">{estado.error}</p>}
      {propuesta && (
        <div className="notice estrategia-propuesta" style={{ display: "block" }}>
          {propuesta.razon && <p style={{ margin: 0 }}><strong>Por qué:</strong> {propuesta.razon}</p>}
          {propuesta.ofertas && <p className="hint" style={{ margin: 0 }}><strong>Oferta que encajaría:</strong> {propuesta.ofertas} (sólo si es real: ponla en «Ofertas»).</p>}
          {propuesta.mejores?.length > 0 && (
            <details>
              <summary className="hint">Lo que mejor funcionó el mes anterior ({propuesta.mejores.length})</summary>
              <ol className="hint estrategia-mejores">
                {propuesta.mejores.map((m, i) => <li key={i}>{m.texto || "(sin texto)"} · {m.interacciones} interacciones</li>)}
              </ol>
            </details>
          )}
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor={`${ids}-campaign`}>Campaña del mes</label>
        <textarea id={`${ids}-campaign`} className="textarea" style={{ minHeight: 80 }} value={campaign} onChange={(e) => setCampaign(e.target.value)}
          placeholder="Ej: Noviembre en casa — preparar el hogar para las visitas de diciembre" />
      </div>
    </div>
  );
}

/** La etapa del embudo de una semana (junto a su concepto). */
export function EtapaSemana({ semana, valor = "", onCambiar }) {
  const id = useId();
  return (
    <>
      <label className="sr-only" htmlFor={id}>Etapa del embudo de la semana {semana}</label>
      <select id={id} className="input estrategia-etapa" value={valor} onChange={(e) => onCambiar(e.target.value)}>
        <option value="">Sin etapa</option>
        {Object.entries(ETAPAS).map(([k, e]) => <option key={k} value={k}>{e.nombre}</option>)}
      </select>
    </>
  );
}

/** El balance de un mes (o de un plan): cifras y avisos. `days`: [{ date, posts }]. */
export function BalanceDelMes({ days = [], semanas = [], objetivo = "", foco = "", titulo = "Balance del mes" }) {
  const b = balanceDelMes(days, { semanas, objetivo, foco });
  if (!b.total) return null;
  const top = (m) => Object.entries(m).sort((a, c) => c[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ");
  return (
    <section className={`notice ${b.avisos.some((a) => a.tipo === "aviso") ? "notice-warn" : ""} balance-mes`} aria-label={titulo}>
      <p style={{ margin: 0 }}><strong>{titulo}</strong> · {b.total} {b.total === 1 ? "publicación" : "publicaciones"}</p>
      <p className="hint" style={{ margin: 0 }}>Formatos: {resumenFormatos(b.formatos)}</p>
      {Object.keys(b.tipos).length > 0 && <p className="hint" style={{ margin: 0 }}>Tipos: {top(b.tipos)}</p>}
      {Object.keys(b.niveles).length > 0 && <p className="hint" style={{ margin: 0 }}>Niveles: {top(b.niveles)}</p>}
      {b.avisos.length > 0 ? (
        <ul className="balance-avisos">
          {b.avisos.map((a, i) => <li key={i} data-tipo={a.tipo}><Icon name={a.tipo === "aviso" ? "alert" : "info"} size={14} /> {a.texto}</li>)}
        </ul>
      ) : (
        <p className="hint" style={{ margin: 0 }}><Icon name="check" size={14} /> Bien repartido.</p>
      )}
    </section>
  );
}
