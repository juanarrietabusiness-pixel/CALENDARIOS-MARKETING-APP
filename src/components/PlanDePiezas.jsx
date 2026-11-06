import { useId, useState, useEffect, useRef, useMemo } from "react";
import Icon from "./Icon";
import { textoCosto } from "../lib/estudioCatalogo";
import { textoDelMotivo, textoSoloAdmin, topeSugerido, textoTope } from "../lib/sinPreguntar";
import { puedeFijar } from "../lib/sinPreguntarApi";

// ============================================================
// El plan de una tanda del asistente, a la vista antes de gastar
//
// El asistente diseña (disenar_piezas: una ficha por pieza) y la persona
// decide con un botón, no escribiendo «sí»: ve el concepto, cada pieza con
// su ficha (que puede corregir) y el costo total. «Crear todas» es la
// confirmación del costo, como en el lote del Estudio. Mientras se crean,
// cada pieza aparece en su sitio en cuanto sale.
//
// El turno del asistente espera: su herramienta devuelve lo que se decidió y,
// al terminar, las imágenes para que las revise.
//
// Con «crear imágenes sin preguntar» fijado en el espacio (Ajustes → IA), la
// tarjeta llega ya «creando» (no hay botón que esperar) salvo que la tanda pase
// del tope o el asistente sugiera OTRO motor: entonces dice qué sugiere, en vez
// de qué y por qué, y la persona escoge. «No volver a preguntar» lo enciende
// desde aquí (sólo el administrador; a los demás se les dice dónde).
// ============================================================

/**
 * `plan`: { concepto, piezas: [{ n, titulo, ficha, formato }], calidades: { borrador: { nombre, costo }, sugerido?: { nombre,
 * costo, texto }, final?: {…} }, estado: "revisar"|"creando"|"hecho", avance: { n → { cargando?, archivo?, error? } },
 * logo?: { hay, modo }, motivo?, tope?, aviso? }.
 * `onCrear(piezas, calidad, modoLogo, { fijar })`, `onCancelar()`.
 */
export default function PlanDePiezas({ plan, onCrear, onCancelar }) {
  const ids = useId();
  const [piezas, setPiezas] = useState(plan.piezas);
  const [abierta, setAbierta] = useState(null);
  // Si el asistente sugiere otro motor, arranca en su sugerencia (la tarjeta dice por qué); se puede volver al del cliente.
  const [calidad, setCalidad] = useState(plan.calidades?.sugerido ? "sugerido" : "borrador");
  const [fijar, setFijar] = useState(false);
  // Quién pone el logo en ESTA tanda: el del kit por defecto; las dos opciones valen (la IA lo integra, la app pega el original).
  const [modoLogo, setModoLogo] = useState(plan.logo?.modo ?? "modelo");
  const titulo = useRef(null);
  useEffect(() => { titulo.current?.focus({ preventScroll: true }); }, []);

  const revisando = plan.estado === "revisar";
  // Revisando, lo que la persona va cambiando; creando, lo que de verdad se pidió.
  const lista = revisando ? piezas : plan.piezas;
  const cal = plan.calidades?.[calidad] ?? plan.calidades?.borrador;
  const total = useMemo(() => (cal?.costo ?? 0) * piezas.length, [cal, piezas.length]);
  const poner = (n, cambio) => setPiezas((l) => l.map((p) => (p.n === n ? { ...p, ...cambio } : p)));
  const listas = Object.values(plan.avance ?? {}).filter((a) => a.archivo).length;

  return (
    <section className="chat-cerebro plan-piezas" aria-labelledby={`${ids}-t`}>
      <p id={`${ids}-t`} className="chat-cerebro-titulo" tabIndex={-1} ref={titulo}>
        <Icon name="palette" size={16} /> {revisando ? `Plan de ${lista.length} ${lista.length === 1 ? "pieza" : "piezas"}` : plan.estado === "creando" ? `Creando… ${listas} de ${lista.length} listas` : `${listas} de ${lista.length} listas`}
      </p>
      {plan.concepto && <p className="hint" style={{ margin: 0 }}><strong>Concepto:</strong> {plan.concepto}</p>}
      {revisando && <p className="hint" style={{ margin: 0 }}>Revisa las fichas si quieres (toca una para verla). No se gasta nada hasta que pulses «Crear».</p>}
      {revisando && plan.motivo === "tope" && <p className="hint" style={{ margin: 0 }}>{textoDelMotivo({ motivo: "tope", tope: plan.tope })}</p>}
      {revisando && plan.calidades?.sugerido?.texto && <p className="notice notice-warn" style={{ margin: 0 }}>{plan.calidades.sugerido.texto}</p>}
      <div role="status" aria-live="polite">{plan.aviso && <p className="hint" style={{ margin: 0 }}>{plan.aviso}</p>}</div>
      <ol className="plan-piezas-lista">
        {lista.map((p) => {
          const av = plan.avance?.[p.n];
          return (
            <li key={p.n} className="plan-pieza" data-estado={av?.archivo ? "lista" : av?.error ? "error" : av?.cargando ? "creando" : ""}>
              <div className="plan-pieza-marco" aria-hidden={!av?.archivo}>
                {av?.archivo ? <img src={av.archivo.src} alt={p.titulo} /> : <span>{av?.error ? "No salió" : av?.cargando ? "Creando…" : p.n}</span>}
              </div>
              <div className="plan-pieza-cuerpo">
                <p className="plan-pieza-titulo">{p.titulo}</p>
                {av?.error && <p className="cerebro-error" style={{ margin: 0 }}>{av.error}</p>}
                {revisando && (
                  <span className="chat-cerebro-acciones">
                    <button type="button" className="btn btn-ghost btn-sm" aria-expanded={abierta === p.n} aria-controls={`${ids}-f${p.n}`}
                      onClick={() => setAbierta((a) => (a === p.n ? null : p.n))}>
                      {abierta === p.n ? "Cerrar la ficha" : "Ver la ficha"}
                    </button>
                    {piezas.length > 1 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPiezas((l) => l.filter((x) => x.n !== p.n))} aria-label={`Quitar «${p.titulo}»`}>
                        Quitar
                      </button>
                    )}
                  </span>
                )}
                {revisando && abierta === p.n && (
                  <div className="field" id={`${ids}-f${p.n}`} style={{ margin: 0 }}>
                    <label className="label" htmlFor={`${ids}-x${p.n}`}>Ficha de diseño</label>
                    <textarea id={`${ids}-x${p.n}`} className="textarea" rows={7} value={p.ficha} onChange={(e) => poner(p.n, { ficha: e.target.value })} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {revisando && (
        <>
          {(plan.calidades?.final || plan.calidades?.sugerido) && (
            <fieldset className="plan-piezas-calidad">
              {/* Dos modelos, no «borrador» y «final»: lo que sale con el del cliente (Muse, casi siempre) ES la pieza
                  que se usa; el otro es otra opción, más cara, no la única buena. El que sugiere el asistente va primero. */}
              <legend className="label">Con qué modelo</legend>
              {[["sugerido", "lo sugiere el asistente"], ["borrador", "el de este cliente"], ["final", "otra opción"]].filter(([k]) => plan.calidades[k]).map(([k, nota]) => (
                <label key={k} className="casilla">
                  <input type="radio" name={`${ids}-cal`} checked={calidad === k} onChange={() => setCalidad(k)} />
                  {plan.calidades[k].nombre} ({nota}) · {textoCosto(plan.calidades[k].costo)} c/u
                </label>
              ))}
            </fieldset>
          )}
          {plan.logo?.hay && (
            <fieldset className="plan-piezas-calidad">
              <legend className="label">El logo</legend>
              {[["modelo", "Lo integra la IA en el diseño"], ["estampado", "Lo estampa la aplicación (el original, exacto)"]].map(([k, texto]) => (
                <label key={k} className="casilla">
                  <input type="radio" name={`${ids}-logo`} checked={modoLogo === k} onChange={() => setModoLogo(k)} />
                  {texto}
                </label>
              ))}
            </fieldset>
          )}
          {/* Fijarlo desde aquí: sólo el administrador lo cambia (como el presupuesto); a los demás se les dice dónde. Con
              otro motor sugerido, el ajuste ya está puesto: no hay nada que fijar. */}
          {plan.motivo !== "otro_motor" && (puedeFijar() ? (
            <label className="casilla">
              <input type="checkbox" checked={fijar} onChange={(e) => setFijar(e.target.checked)} />
              No volver a preguntar (crear directo con el modelo de este cliente, hasta {textoTope(topeSugerido(total))} por pedido)
            </label>
          ) : (
            <p className="hint" style={{ margin: 0 }}>{textoSoloAdmin}</p>
          ))}
          <div className="chat-cerebro-acciones">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onCrear(piezas, calidad, modoLogo, { fijar })}>
              <Icon name="sparkles" size={14} /> Crear {piezas.length === 1 ? "la pieza" : `las ${piezas.length}`} ({textoCosto(total)})
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>Cambiar algo</button>
          </div>
        </>
      )}
    </section>
  );
}
