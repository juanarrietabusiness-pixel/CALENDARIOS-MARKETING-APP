import { useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { DAYS } from "../../constants";
import { PILARES } from "../../lib/pilares";
import { MAX_POR_DIA, OBJETIVOS_PLAN, configDeFormatos } from "../../lib/plantillasPlan";
import { leerPlantillas } from "../../lib/plantillasApi";
import {
  FORMATOS_SEMANA, semanaDelCliente, planSemanalParaGuardar, semanaEstandar, semanaPropia, valorDeFormato, conFormato, notasDelCliente,
  limpiarPlanSemanal, ritmoDelCliente,
} from "../../lib/planSemanal";
import { MAX_NOTA_DIA } from "../../lib/notasSemana";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { TimePicker } from "./primitivas";
import "../EditorPlantilla.css";

// ============================================================
// El PLAN SEMANAL ÚNICO de una empresa: lo que sale cada día, fijo todos los meses
//
// Un solo editor (lib/planSemanal.js) para lo que antes vivía en cinco sitios:
// cada día lleva hasta cuatro publicaciones, cada una con su TIPO (sólo los de
// la agencia), su FORMATO —también «UGC · guion para grabar», un reel que
// graba una persona— y su HORA; y cada día, su NOTA FIJA («Muebles y camas»:
// el tema de ese día, que no cambia el formato ni el tipo). Se puede partir de
// un plan de la agencia (la plantilla) y «Volver al estándar» no se lleva las
// notas. Es lo que leen el asistente del mes, «Planificar mes», el lote del
// Estudio y la IA. Lo ya creado en el calendario no cambia.
//
// `EditorSemana` es el editor; el diálogo (la barra de los días y «⋯») y la
// ficha del cliente lo usan igual.
// ============================================================

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

/**
 * El editor del plan semanal. `onGuardar(cambio)` recibe lo que va a `PUT /api/clientes/<id>/plan-semanal`
 * (`planSemanalParaGuardar`) y deja escapar el error; `onListo` se llama al guardar bien.
 */
export function EditorSemana({ client, diaInicial = null, onGuardar, onListo = () => {}, onCancelar = null }) {
  const ids = useId();
  const [lista, setLista] = useState(null);
  const [dias, setDias] = useState(null);
  const [base, setBase] = useState(undefined); // undefined = la de antes
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [notas, setNotas] = useState(() => notasDelCliente(client) ?? {});
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

  const baseActual = base !== undefined ? base : (limpiarPlanSemanal(client?.planSemanal)?.base ?? client?.planContenido?.plantilla ?? "");
  /** Partir de un plan de la agencia: sus días (con el ritmo de la empresa en la primera de cada día); las notas se quedan. */
  const partirDe = (id) => {
    setBase(id);
    const t = (lista ?? []).find((p) => p.id === id);
    if (!t) return;
    const ritmo = ritmoDelCliente(client);
    const cfg = configDeFormatos(t);
    setDias(Object.fromEntries(Object.entries(cfg).map(([dow, l]) => [dow, l.map((h) => ({ ...h, pilar: h.pilar || ritmo[dow] || "anuncio" }))])));
    setAviso(`Cargado «${t.nombre}». Ajusta lo que quieras y guarda.`);
  };

  const cambiarDia = (dow, l) => setDias((d) => ({ ...d, [dow]: l }));
  const guardar = async (cambio) => {
    setGuardando(true);
    setError("");
    try {
      await onGuardar(cambio);
      setGuardando(false);
      onListo();
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
      setGuardando(false);
    }
  };

  return (
    <div className="editor-semana">
      <p className="hint" style={{ margin: "0 0 var(--sp-3)" }}>
        Qué sale cada día, a qué hora y con qué tema, fijo todos los meses. Lo usan el asistente del mes, el lote del Estudio
        y la IA; lo que ya está en el calendario no cambia. La nota fija de cada día es el tema que se repite (si nombra un
        producto, ese día va con él).{!conPlan.current && dias ? " Esta empresa todavía no tiene formatos fijos: escoge el de cada día." : ""}
      </p>

      {lista && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-base`}>Partir de un plan de la agencia</label>
          <select id={`${ids}-base`} className="input" value={baseActual} onChange={(e) => partirDe(e.target.value)}>
            <option value="">Ninguno (el ritmo de la agencia)</option>
            {OBJETIVOS_PLAN.map((o) => (
              <optgroup key={o.id} label={o.nombre}>
                {lista.filter((p) => p.objetivo === o.id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="hint" style={{ margin: 0 }}>Lo que contrató el cliente. «Volver al estándar» vuelve a él; las plantillas se cambian en Ajustes.</p>
        </div>
      )}
      <div role="status" aria-live="polite" className={aviso ? "hint" : "sr-only"}>{aviso}</div>

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
                  <div key={i} className="editor-semana-pub" role="group" aria-label={`${DAYS[dow]}, publicación ${i + 1}`}>
                    <div className="editor-plantilla-hueco">
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
                    <div className="editor-semana-hora">
                      <label className="hint" htmlFor={`${ids}-h-${dow}-${i}`}>Hora</label>
                      <TimePicker id={`${ids}-h-${dow}-${i}`} atajos={false} value={h.hora || ""}
                        onChange={(v) => cambiarDia(dow, l.map((x, j) => (j === i ? { ...x, hora: v } : x)))} />
                    </div>
                  </div>
                ))}
                <label className="sr-only" htmlFor={`${ids}-nota-${dow}`}>Nota fija de los {DAYS[dow].toLowerCase()}</label>
                <input id={`${ids}-nota-${dow}`} className="input" maxLength={MAX_NOTA_DIA} value={notas[dow] ?? ""}
                  placeholder={`Nota fija de los ${DAYS[dow].toLowerCase()} (opcional): «Muebles y camas»`}
                  onChange={(e) => setNotas((n) => ({ ...n, [dow]: e.target.value }))} />
                {l.length < MAX_POR_DIA && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}
                    onClick={() => cambiarDia(dow, [...l, { format: "post", pilar: l[0]?.pilar || "anuncio", hora: l[l.length - 1]?.hora || "" }])}>
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
        {onCancelar && <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={guardando}>Cancelar</button>}
        <button type="button" className="btn btn-primary" disabled={!dias || guardando}
          onClick={() => guardar(planSemanalParaGuardar(client, lista ?? [], { dias, notas, ...(base !== undefined ? { base } : {}) }))}>
          {guardando ? "Guardando…" : "Guardar para todos los meses"}
        </button>
      </div>
    </div>
  );
}

export default function PlanSemanal({ client, diaInicial = null, onGuardar, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="dialog plan-semanal" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-2)", marginBottom: "var(--sp-2)" }}>
          <h2 id={`${ids}-t`} style={{ margin: 0 }}><Icon name="calendar" size={18} /> Plan semanal de {client?.name || "la empresa"}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <EditorSemana client={client} diaInicial={diaInicial} onGuardar={onGuardar} onListo={onClose} onCancelar={onClose} />
      </div>
    </div>
  );
}
