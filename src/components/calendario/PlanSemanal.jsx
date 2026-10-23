import { useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { DAYS } from "../../constants";
import { PILARES } from "../../lib/pilares";
import { MAX_POR_DIA } from "../../lib/plantillasPlan";
import { leerPlantillas } from "../../lib/plantillasApi";
import { FORMATOS_SEMANA, semanaDelCliente, semanaParaGuardar, semanaEstandar, semanaPropia, valorDeFormato, conFormato } from "../../lib/planSemanal";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import "../EditorPlantilla.css";

// ============================================================
// «Plan semanal» de una empresa: lo que sale cada día, fijo todos los meses
//
// Se abre tocando la barra de los días encima del mes (o desde «⋯» en el
// teléfono, donde la barra no cabe). Cada día lleva hasta cuatro
// publicaciones, cada una con su tipo (sólo los de la agencia) y su formato
// —también «UGC · guion para grabar», un reel que graba una persona—. Se
// guarda en la empresa (lib/planSemanal.js): es lo que leen «Producir el
// mes», «Planificar mes» y la IA. Lo ya creado en el calendario no cambia.
// ============================================================

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

export default function PlanSemanal({ client, diaInicial = null, onGuardar, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  const [lista, setLista] = useState(null);
  const [dias, setDias] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const conPlan = useRef(false);

  useEffect(() => {
    leerPlantillas().catch(() => []).then((l) => {
      const s = semanaDelCliente(client, l);
      conPlan.current = s.conPlan;
      setLista(l);
      // Sin plan fijo, cada día con su tipo arranca en «Post» (lo que hace hoy el lote del mes sin plan).
      setDias(Object.fromEntries(Object.entries(s.dias).map(([d, l2]) => [d, l2.map((h) => ({ ...h, format: h.format || "post" }))])));
    });
  }, [client]);

  // El día que se tocó, a la vista (una vez, al pintarse).
  const visto = useRef(false);
  const alDia = (el) => {
    if (el && !visto.current) { visto.current = true; el.scrollIntoView({ block: "nearest" }); }
  };

  const cambiarDia = (dow, l) => setDias((d) => ({ ...d, [dow]: l }));
  const guardar = async (cambio) => {
    setGuardando(true);
    setError("");
    try {
      await onGuardar(cambio);
      onClose();
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
      setGuardando(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <div ref={ref} className="dialog plan-semanal" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-2)" }}>
          <h2 id={`${ids}-t`} style={{ margin: 0 }}><Icon name="calendar" size={18} /> Plan semanal de {client?.name || "la empresa"}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <p className="hint" style={{ margin: "var(--sp-2) 0 var(--sp-3)" }}>
          Qué sale cada día, fijo todos los meses. Lo usan «Producir el mes», «Planificar mes» y la IA. Lo que ya está en el
          calendario no cambia.{!conPlan.current && dias ? " Esta empresa todavía no tiene formatos fijos: escoge el de cada día." : ""}
        </p>

        {!dias ? <p className="hint" role="status">Cargando…</p> : (
          <ul className="editor-plantilla-dias">
            {ORDEN_DIAS.map((dow) => {
              const l = dias[dow] ?? [];
              return (
                <li key={dow} ref={dow === diaInicial ? alDia : undefined} className="editor-plantilla-dia" data-elegido={dow === diaInicial || undefined}>
                  <div className="editor-plantilla-dia-cabeza">
                    <span className="editor-plantilla-dia-nombre">{DAYS[dow]}</span>
                    {!l.length && <span className="hint">No se publica</span>}
                  </div>
                  {l.map((h, i) => (
                    <div key={i} className="editor-plantilla-hueco" role="group" aria-label={`${DAYS[dow]}, publicación ${i + 1}`}>
                      <select className="input" aria-label={`Tipo, ${DAYS[dow]} ${i + 1}`} value={h.pilar || "anuncio"}
                        onChange={(e) => cambiarDia(dow, l.map((x, j) => (j === i ? { ...x, pilar: e.target.value } : x)))}>
                        {PILARES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                      <select className="input" aria-label={`Formato, ${DAYS[dow]} ${i + 1}`} value={valorDeFormato(h)}
                        onChange={(e) => cambiarDia(dow, l.map((x, j) => (j === i ? conFormato(x, e.target.value) : x)))}>
                        {FORMATOS_SEMANA.map((f) => <option key={f.valor} value={f.valor}>{f.nombre}</option>)}
                      </select>
                      <button type="button" className="btn-icon" aria-label={`Quitar la publicación ${i + 1} del ${DAYS[dow].toLowerCase()}`}
                        onClick={() => cambiarDia(dow, l.filter((_, j) => j !== i))}>
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                  {l.length < MAX_POR_DIA && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}
                      onClick={() => cambiarDia(dow, [...l, { format: "post", pilar: l[0]?.pilar || "anuncio" }])}>
                      <Icon name="plus" size={14} /> {l.length ? "Otra publicación ese día" : `Publicar el ${DAYS[dow].toLowerCase()}`}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {error && <p role="alert" className="cerebro-error">{error}</p>}
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", justifyContent: "flex-end", marginTop: "var(--sp-3)" }}>
          {lista && semanaPropia(client) && (
            <button type="button" className="btn btn-ghost" style={{ marginRight: "auto" }} disabled={guardando}
              onClick={() => guardar(semanaEstandar(client, lista))}>
              <Icon name="undo" size={16} /> Volver al estándar de la agencia
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!dias || guardando}
            onClick={() => guardar(semanaParaGuardar(client, lista ?? [], dias))}>
            {guardando ? "Guardando…" : "Guardar para todos los meses"}
          </button>
        </div>
      </div>
    </div>
  );
}
