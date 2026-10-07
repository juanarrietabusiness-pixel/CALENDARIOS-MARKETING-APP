import { useId, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import * as api from "../../lib/anunciosApi";
import { ACCIONES_DIAGNOSTICO } from "../../lib/diagnostico";
import { formatoMoneda } from "../../lib/anuncios";

// ============================================================
// El diagnóstico de las campañas activas
//
// Las reglas de src/lib/diagnostico.js sobre los últimos 7 días frente a
// los 30 y al costo aceptable por resultado (el del estratega; si no se
// escribe, el promedio del mes de cada campaña). Nada cambia solo:
// «Apagar» pausa ese conjunto o anuncio; «Subir a…» cambia el presupuesto
// y, como es dinero, es del administrador y se confirma. La IA, si se
// marca, lo explica con palabras.
// ============================================================

const NIVEL = { campana: "Campaña", conjunto: "Conjunto", anuncio: "Anuncio" };

export default function Diagnostico({ clientId, moneda = "USD", esAdmin = false, soloLectura = false, onCambio, onCerrar }) {
  const ids = useId();
  const [costoMax, setCostoMax] = useState("");
  const [conIA, setConIA] = useState(false);
  const [d, setD] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null);
  const [hechos, setHechos] = useState({}); // id → texto
  const [confirmar, setConfirmar] = useState(null); // { id, diario, resumen }
  const ref = useDialogA11y(() => { if (!trabajando) onCerrar(); });
  const dinero = (n) => (n == null ? "—" : formatoMoneda(n, moneda));

  const diagnosticar = async () => {
    setTrabajando("diagnostico");
    setAviso(null);
    try {
      setD(await api.diagnostico(clientId, { costoMax: Number(costoMax) || 0, conIA }));
      setHechos({});
      if (conIA) window.dispatchEvent(new Event("ia:gasto"));
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setTrabajando("");
  };

  const apagar = async (h) => {
    setTrabajando(h.id);
    try {
      await api.pausarObjeto(clientId, h.id);
      setHechos((x) => ({ ...x, [h.id]: "En pausa" }));
      onCambio?.();
      // El botón desaparece: el foco vuelve al diálogo (si no, Escape ya no lo cierra).
      ref.current?.focus({ preventScroll: true });
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setTrabajando("");
  };

  // Sin confirmar, el servidor dice qué va a cambiar; con «Sí», lo cambia.
  const subir = async (h, confirmado = false) => {
    setTrabajando(h.id);
    try {
      const r = await api.presupuestoConjunto(clientId, h.id, h.sugerencia.diarioNuevo, confirmado);
      setHechos((x) => ({ ...x, [h.id]: r.resumen }));
      setConfirmar(null);
      onCambio?.();
      ref.current?.focus({ preventScroll: true });
    } catch (e) {
      if (e.estado === 409 && e.datos?.confirmar) setConfirmar({ id: h.id, resumen: e.datos.confirmar.resumen });
      else setAviso({ ok: false, texto: e.message });
    }
    setTrabajando("");
  };

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet anu-diagnostico" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} className="anu-asistente-titulo"><Icon name="chart" size={18} /> Diagnóstico de las campañas activas</h2>
            <p className="hint" style={{ margin: 0 }}>Los últimos 7 días frente al mes: qué apagar, qué escalar y qué anuncio está cansado. Nada cambia solo.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={Boolean(trabajando)} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <div className="anu-diag-opciones">
            <div className="field" style={{ margin: 0 }}>
              <label className="label" htmlFor={`${ids}-max`}>Costo aceptable por resultado ({moneda})</label>
              <input id={`${ids}-max`} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={costoMax}
                onChange={(e) => setCostoMax(e.target.value)} placeholder="El promedio del mes" aria-describedby={`${ids}-max-ayuda`} />
              <p id={`${ids}-max-ayuda`} className="hint" style={{ margin: 0 }}>El que te dio el estratega para que el cliente gane. Vacío: se compara con el promedio de los últimos 30 días.</p>
            </div>
            <label className="anu-check"><input type="checkbox" checked={conIA} onChange={(e) => setConIA(e.target.checked)} /> <span>Que la IA lo explique (unos centavos)</span></label>
            <button type="button" className="btn btn-primary" onClick={diagnosticar} disabled={Boolean(trabajando)}>
              <Icon name="chart" size={16} /> {trabajando === "diagnostico" ? "Mirando las campañas…" : d ? "Volver a mirar" : "Diagnosticar"}
            </button>
          </div>
          <div aria-live="polite">{aviso && <p role="alert" className="notice notice-error">{aviso.texto}</p>}</div>

          {d && (
            <>
              <dl className="anu-revision anu-diag-resumen">
                <div><dt>Campañas activas</dt><dd>{d.resumen.campanas}</dd></div>
                <div><dt>Gastado en 7 días</dt><dd>{dinero(d.resumen.gasto)}</dd></div>
                <div><dt>Resultados</dt><dd>{d.resumen.resultados}</dd></div>
                <div><dt>Por resultado</dt><dd>{dinero(d.resumen.costoPorResultado)}</dd></div>
              </dl>
              {d.explicacion && <p className="anu-diag-explicacion">{d.explicacion}</p>}
              {d.avisoIA && <p className="hint">Sin explicación de la IA: {d.avisoIA}</p>}
              {!d.resumen.campanas && <p className="hint">Esta cuenta no tiene campañas activas.</p>}
              {d.resumen.campanas > 0 && !d.hallazgos.length && <p className="revision-vacio"><Icon name="checkCircle" size={18} /> Todo va bien: nada que apagar ni que escalar esta semana.</p>}
              <ul className="anu-diag-lista">
                {d.hallazgos.map((h) => {
                  const a = ACCIONES_DIAGNOSTICO[h.accion];
                  return (
                    <li key={`${h.nivel}-${h.id}`} data-tono={a.tono}>
                      <div className="anu-diag-cabeza">
                        <span className="anu-diag-accion">{a.nombre}</span>
                        <strong>{NIVEL[h.nivel]} «{h.nombre}»</strong>
                        {h.nivel !== "campana" && <span className="hint">· {h.campana}</span>}
                      </div>
                      <p>{h.motivo}</p>
                      {h.cifras && <p className="hint">7 días: {dinero(h.cifras.gasto)} · {h.cifras.resultados ?? 0} resultados{h.cifras.costoPorResultado ? ` · ${dinero(h.cifras.costoPorResultado)} c/u` : ""} · frecuencia {String(h.cifras.frecuencia).replace(".", ",")}</p>}
                      <div className="anu-diag-botones">
                        {hechos[h.id] ? <span className="hint"><Icon name="check" size={12} /> {hechos[h.id]}</span> : (
                          <>
                            {h.accion === "apagar" && h.nivel !== "campana" && !soloLectura && (
                              <button type="button" className="btn btn-danger btn-sm" disabled={Boolean(trabajando)} onClick={() => apagar(h)}><Icon name="pause" size={14} /> Apagar</button>
                            )}
                            {h.accion === "escalar" && h.sugerencia && esAdmin && (confirmar?.id === h.id ? (
                              <>
                                <span className="hint">{confirmar.resumen}. ¿Seguro?</span>
                                <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(trabajando)} onClick={() => subir(h, true)}>Sí, subir</button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setConfirmar(null); ref.current?.focus({ preventScroll: true }); }}>No</button>
                              </>
                            ) : (
                              <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(trabajando)} onClick={() => subir(h)}>
                                <Icon name="arrowUp" size={14} /> Subir a {dinero(h.sugerencia.diarioNuevo)} al día
                              </button>
                            ))}
                            {h.accion === "escalar" && h.sugerencia && !esAdmin && <span className="hint">Subir el presupuesto lo hace el administrador.</span>}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {d.resumen.bien > 0 && <p className="hint">{d.resumen.bien} {d.resumen.bien === 1 ? "conjunto o anuncio va" : "conjuntos y anuncios van"} bien.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
