import { useEffect, useId, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { listarFormulas, guardarFormula, quitarFormula } from "../../lib/formulasUgcApi";
import { limpiarFormula, MAX_TRAMOS_FORMULA } from "../../lib/formulasUgc";
import { DURACIONES_UGC } from "../../lib/ugc";
import { editaLaAgencia } from "../../lib/sesionActual";
import "./GuionUgc.css";

// ============================================================
// Las fórmulas UGC de la agencia: la lista, corregir, quitar y escribir una
//
// Una fórmula es la receta de un video que funciona sin su contenido
// (lib/formulasUgc.js): sirve para todos los clientes. Se abre desde el
// guion UGC de una publicación («Fórmulas») o ya con una propuesta de la IA
// («Guardar como fórmula» en «Extraer guion y adaptar»), que NO se guarda
// hasta «Guardar». Las cambian quien administra y los editores; las demás
// personas las ven y las usan.
// ============================================================

const VACIA = { nombre: "", duracion: 30, tramos: [{ desde: 0, hasta: 3, funcion: "" }, { desde: 3, hasta: 30, funcion: "" }], gancho: "", porQue: "", cuando: "" };

function Editor({ inicial, onGuardar, onCancelar, ocupado }) {
  const ids = useId();
  const [f, setF] = useState(() => ({ ...VACIA, ...inicial, tramos: inicial?.tramos?.length ? inicial.tramos.map((t) => ({ ...t })) : VACIA.tramos.map((t) => ({ ...t })) }));
  const campo = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const tramo = (i, k, v) => setF((p) => ({ ...p, tramos: p.tramos.map((t, j) => (j === i ? { ...t, [k]: k === "funcion" ? v : v === "" ? null : Number(v) } : t)) }));
  const valida = limpiarFormula(f);
  return (
    <form className="formulas-ugc-editor" onSubmit={(e) => { e.preventDefault(); if (valida) onGuardar({ ...valida, ...(f.id ? { id: f.id } : {}) }); }}>
      <div className="extraer-ugc-ajustes">
        <label className="field" htmlFor={`${ids}-n`}>
          <span className="label">Nombre</span>
          <input id={`${ids}-n`} className="input" maxLength={60} value={f.nombre} onChange={(e) => campo("nombre", e.target.value)} placeholder="Ej.: Pregunta incómoda → demostración → precio" />
        </label>
        <label className="field" htmlFor={`${ids}-d`}>
          <span className="label">Duración original</span>
          <select id={`${ids}-d`} className="input" value={f.duracion} onChange={(e) => campo("duracion", Number(e.target.value))}>
            {DURACIONES_UGC.map((d) => <option key={d} value={d}>{d} s</option>)}
          </select>
        </label>
      </div>
      <fieldset className="field formulas-ugc-tramos">
        <legend className="label">Tramos <span className="hint">(qué hace cada uno, en general: al usarla se reparten en la duración del video)</span></legend>
        {f.tramos.map((t, i) => (
          <div key={i} className="formulas-ugc-tramo">
            <label className="sr-only" htmlFor={`${ids}-t${i}a`}>Desde (segundos), tramo {i + 1}</label>
            <input id={`${ids}-t${i}a`} className="input" inputMode="numeric" value={t.desde ?? ""} onChange={(e) => tramo(i, "desde", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
            <label className="sr-only" htmlFor={`${ids}-t${i}b`}>Hasta (segundos), tramo {i + 1}</label>
            <input id={`${ids}-t${i}b`} className="input" inputMode="numeric" value={t.hasta ?? ""} onChange={(e) => tramo(i, "hasta", e.target.value.replace(/[^\d.]/g, ""))} placeholder="3" />
            <label className="sr-only" htmlFor={`${ids}-t${i}f`}>Qué hace el tramo {i + 1}</label>
            <input id={`${ids}-t${i}f`} className="input" maxLength={160} value={t.funcion} onChange={(e) => tramo(i, "funcion", e.target.value)} placeholder="Ej.: una pregunta que toca un dolor del cliente" />
            <button type="button" className="btn-icon" aria-label={`Quitar el tramo ${i + 1}`} disabled={f.tramos.length <= 2}
              onClick={() => setF((p) => ({ ...p, tramos: p.tramos.filter((_, j) => j !== i) }))}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        {f.tramos.length < MAX_TRAMOS_FORMULA && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}
            onClick={() => setF((p) => ({ ...p, tramos: [...p.tramos, { desde: p.tramos.at(-1)?.hasta ?? null, hasta: null, funcion: "" }] }))}>
            <Icon name="plus" size={14} /> Añadir un tramo
          </button>
        )}
      </fieldset>
      <label className="field" htmlFor={`${ids}-g`}>
        <span className="label">Tipo de gancho</span>
        <input id={`${ids}-g`} className="input" maxLength={200} value={f.gancho} onChange={(e) => campo("gancho", e.target.value)} />
      </label>
      <label className="field" htmlFor={`${ids}-p`}>
        <span className="label">Por qué funciona</span>
        <input id={`${ids}-p`} className="input" maxLength={300} value={f.porQue} onChange={(e) => campo("porQue", e.target.value)} />
      </label>
      <label className="field" htmlFor={`${ids}-c`}>
        <span className="label">Cuándo conviene</span>
        <input id={`${ids}-c`} className="input" maxLength={200} value={f.cuando} onChange={(e) => campo("cuando", e.target.value)} placeholder="Ej.: productos con un antes y un después claro" />
      </label>
      {f.fuente && (f.fuente.cuenta || f.fuente.enlace) && (
        <p className="hint" style={{ margin: 0 }}>Sale de: {f.fuente.cuenta || ""} {f.fuente.enlace && <a href={f.fuente.enlace} target="_blank" rel="noreferrer">ver el video</a>}</p>
      )}
      <div className="extraer-ugc-acciones">
        <button type="button" className="btn btn-ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={!valida || ocupado} aria-busy={ocupado || undefined}>
          <Icon name="check" size={16} /> {ocupado ? "Guardando…" : "Guardar la fórmula"}
        </button>
      </div>
      {!valida && <p className="hint" style={{ margin: 0 }}>Le falta el nombre o al menos dos tramos con lo que hace cada uno.</p>}
    </form>
  );
}

/**
 * @param inicial    una fórmula para abrir directamente en el editor (la propuesta de la IA, sin guardar).
 * @param onGuardada recibe la fórmula guardada (con su id).
 */
export default function FormulasUgc({ inicial = null, onCerrar, onGuardada }) {
  const ids = useId();
  const [ocupado, setOcupado] = useState(false);
  const ref = useDialogA11y(() => { if (!ocupado) onCerrar(); });
  const [lista, setLista] = useState(null);
  const [editando, setEditando] = useState(inicial); // null | fórmula (sin id: nueva)
  const [quitando, setQuitando] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const puede = editaLaAgencia();

  // Al pasar de la lista al editor (o al revés) el botón pulsado desaparece y el foco caería al <body>, fuera del
  // diálogo: Escape y Tab dejarían de funcionar. Se queda dentro.
  useEffect(() => {
    const n = ref.current;
    if (n && !n.contains(document.activeElement)) (n.querySelector("input, button:not([disabled])") ?? n).focus({ preventScroll: true });
  }, [editando, ref]);

  useEffect(() => {
    let vivo = true;
    const leer = () => listarFormulas().then((l) => vivo && setLista(l)).catch((e) => vivo && setError(e.message));
    void leer();
    window.addEventListener("formulas-ugc", leer);
    return () => { vivo = false; window.removeEventListener("formulas-ugc", leer); };
  }, []);

  const guardar = async (formula) => {
    setOcupado(true);
    setError("");
    try {
      const r = await guardarFormula(formula);
      if (r?.formulas) setLista(r.formulas);
      setEditando(null);
      setAviso(`Guardada «${formula.nombre}»: ya se puede escoger al escribir un guion UGC.`);
      onGuardada?.(r?.formula ?? formula);
    } catch (e) {
      setError(e.message);
    }
    setOcupado(false);
  };

  const quitar = async (f) => {
    if (quitando !== f.id) { setQuitando(f.id); return; }
    setOcupado(true);
    setError("");
    try {
      setLista(await quitarFormula(f.id));
      setAviso(`Quitada «${f.nombre}».`);
    } catch (e) {
      setError(e.message);
    }
    setQuitando("");
    setOcupado(false);
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div ref={ref} className="dialog extraer-ugc" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} tabIndex={-1}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-2)" }}>
          <h2 id={`${ids}-t`} style={{ margin: 0 }}><Icon name="list" size={18} /> Fórmulas UGC de la agencia</h2>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <p className="hint" style={{ margin: "var(--sp-2) 0 var(--sp-3)" }}>
          La receta de un video que funciona, sin su contenido: sirve para todos los clientes. Al escribir un guion UGC se
          escoge una (o la IA escoge) y se escribe con la voz de cada marca.
        </p>

        {editando ? (
          puede
            ? <Editor inicial={editando} ocupado={ocupado} onGuardar={guardar} onCancelar={() => setEditando(null)} />
            : <p className="hint">Las fórmulas las guarda quien administra o un editor de la agencia.</p>
        ) : (
          <>
            {!lista && !error && <p className="hint" role="status">Cargando…</p>}
            {lista && !lista.length && <p className="hint">Todavía no hay fórmulas. Guarda una desde «Extraer guion y adaptar» o escríbela aquí.</p>}
            {lista && lista.length > 0 && (
              <ul className="formulas-ugc-lista">
                {lista.map((f) => (
                  <li key={f.id} className="formulas-ugc-item">
                    <div>
                      <strong>{f.nombre}</strong> <span className="hint">· {f.duracion} s</span>
                      {f.cuando && <p className="hint" style={{ margin: 0 }}>Conviene: {f.cuando}</p>}
                      <ol className="formulas-ugc-pasos">
                        {f.tramos.map((t, i) => <li key={i}>{t.desde != null ? <span className="guion-ugc-tiempo">{t.desde}–{t.hasta} s</span> : null} {t.funcion}</li>)}
                      </ol>
                    </div>
                    {puede && (
                      <div className="formulas-ugc-acciones">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuitando(""); setEditando(f); }} disabled={ocupado}>Corregir</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitar(f)} disabled={ocupado}>
                          {quitando === f.id ? "¿Seguro? Quitar" : "Quitar"}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {puede && (
              <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start", marginTop: "var(--sp-3)" }} onClick={() => setEditando({ ...VACIA })} disabled={ocupado}>
                <Icon name="plus" size={16} /> Escribir una fórmula
              </button>
            )}
          </>
        )}

        <div role="status" aria-live="polite" className={aviso ? "hint" : "sr-only"}>{aviso}</div>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
      </div>
    </div>
  );
}
