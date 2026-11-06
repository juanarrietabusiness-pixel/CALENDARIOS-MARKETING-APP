import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { OBJETIVOS_MES, ETAPAS, objetivoDe, balanceDelMes, resumenFormatos, embudoDelMes, idEtapaCiclo } from "../lib/estrategiaMes";
import { estrategiaConIA } from "../lib/ideaPublicacion";
import "./EstrategiaMes.css";

// ============================================================
// La estrategia del mes y su balance
//
//   · PasoEstrategia: el paso «Estrategia» de «Planificar mes» — objetivo,
//     producto foco, campaña y «Proponer la estrategia con IA», que trae
//     también el concepto y la etapa del ciclo de ventas de cada semana y lo que mejor
//     funcionó el mes anterior. Propone: lo que cambia se puede deshacer.
//   · EtapaSemana: la etapa del ciclo de ventas (presentación, evaluación,
//     conversión, ascensión) junto al concepto de cada semana; una de antes
//     («Atraer»…) se enseña con su nombre de hoy.
//   · BalanceDelMes: cuántas de cada formato, tipo y nivel, y los avisos
//     (src/lib/estrategiaMes.js). Lo usan «Planificar mes» y «Revisar el mes».
//   · EditorEstrategia: la estrategia DESPUÉS de planificar («Editar el mes» →
//     Estrategia, desde la tarjeta de la campaña): objetivo, foco y la etapa de
//     cada semana. Antes sólo vivía dentro del asistente.
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
        la campaña y el concepto de cada semana con su etapa del ciclo de ventas. Es texto: no gasta en imágenes.
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

/** La etapa del ciclo de ventas de una semana (junto a su concepto). Una guardada con el nombre de antes se lee por alias. */
export function EtapaSemana({ semana, valor = "", onCambiar }) {
  const id = useId();
  return (
    <>
      <label className="sr-only" htmlFor={id}>Etapa del ciclo de ventas de la semana {semana}</label>
      <select id={id} className="input estrategia-etapa" value={idEtapaCiclo(valor)} onChange={(e) => onCambiar(e.target.value)}>
        <option value="">Sin etapa</option>
        {Object.entries(ETAPAS).map(([k, e]) => <option key={k} value={k} title={e.ayuda}>{e.nombre}</option>)}
      </select>
    </>
  );
}

/** Qué es cada etapa, en una línea (debajo de las semanas). */
export const AyudaEtapas = () => (
  <p className="hint" style={{ margin: 0 }}>
    {Object.values(ETAPAS).map((e) => `${e.nombre}: ${e.ayuda.split(":")[0]}`).join(" · ")}.
  </p>
);

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

/**
 * La estrategia del mes, después de planificar («Editar el mes» → Estrategia): el objetivo, el producto foco y la etapa
 * del ciclo de ventas de cada semana (la FILA de la rejilla). `valor`: la guardada (`opciones.estrategia`); `onCambiar(nueva)`.
 * El catálogo se lee al abrirla (el foco sale de los productos del plan).
 */
export function EditorEstrategia({ client, valor = null, semanas = [], conceptos = [], onCambiar }) {
  const ids = useId();
  const e = { objetivo: "", focoId: "", foco: "", razon: "", etapas: [], ...(valor ?? {}) };
  const [productos, setProductos] = useState(null);
  const clienteId = client?.dbId || client?.id;
  useEffect(() => {
    let vivo = true;
    if (!clienteId) return undefined;
    Promise.all([import("../lib/mercado"), import("../lib/estudioMercado")])
      .then(([{ leerMercado }, { productosParaPlan }]) => leerMercado(clienteId)
        .then((m) => { if (vivo) setProductos(productosParaPlan(m?.catalogo ?? [], m?.inventario)); }))
      .catch(() => { if (vivo) setProductos([]); });
    return () => { vivo = false; };
  }, [clienteId]);
  const poner = (cambios) => onCambiar({ ...e, ...cambios });
  const etapas = semanas.map((_, i) => idEtapaCiclo(e.etapas?.[i]));
  const opciones = [...(productos ?? [])];
  if (e.focoId && !opciones.some((p) => p.id === e.focoId)) opciones.unshift({ id: e.focoId, nombre: e.foco || "El de antes" });
  const obj = objetivoDe(e.objetivo);
  return (
    <div className="estrategia-mes">
      <p className="hint" style={{ marginTop: 0 }}>
        La estrategia del mes la lee el motor de ideas cada vez que escribe para este mes (las ideas, los guiones, los
        captions): el objetivo, el foco y la etapa de cada semana.
      </p>
      <div className="field">
        <span className="label" id={`${ids}-obj`}>Objetivo del mes</span>
        <div className="est-tipos" role="radiogroup" aria-labelledby={`${ids}-obj`}>
          {OBJETIVOS_MES.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={e.objetivo === o.id} className={`filter-chip${e.objetivo === o.id ? " active" : ""}`}
              onClick={() => poner({ objetivo: e.objetivo === o.id ? "" : o.id })}>{o.nombre}</button>
          ))}
        </div>
        <p className="hint" style={{ margin: 0 }}>{obj ? obj.ayuda : "Sin objetivo escogido."}</p>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-foco`}>Producto foco</label>
        <select id={`${ids}-foco`} className="input" value={e.focoId} disabled={productos === null}
          onChange={(ev) => poner({ focoId: ev.target.value, foco: opciones.find((p) => p.id === ev.target.value)?.nombre ?? "" })}>
          <option value="">{productos === null ? "Leyendo el catálogo…" : "Toda la marca (rotan todos)"}</option>
          {opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <fieldset style={{ border: "none" }}>
        <legend className="label">Etapa del ciclo de ventas de cada semana</legend>
        {semanas.map((s, i) => (
          <div key={s.numero ?? i} className="estrategia-semana" style={{ alignItems: "center", marginBottom: "var(--sp-2)" }}>
            <span style={{ fontSize: "var(--fs-xs)", flex: 1, minWidth: 0 }}>
              <strong>Semana {s.numero ?? i + 1}</strong>{conceptos[i] ? ` · ${conceptos[i]}` : ""}
            </span>
            <EtapaSemana semana={s.numero ?? i + 1} valor={etapas[i]} onCambiar={(v) => poner({ etapas: etapas.map((x, j) => (j === i ? v : x)) })} />
          </div>
        ))}
        {!etapas.some(Boolean) && semanas.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => poner({ etapas: embudoDelMes(e.objetivo, semanas.length) })}>
            Repartir las etapas según el objetivo
          </button>
        )}
        <AyudaEtapas />
      </fieldset>
      {e.razon && <p className="hint" style={{ margin: 0 }}><strong>Por qué (de la propuesta):</strong> {e.razon}</p>}
    </div>
  );
}
