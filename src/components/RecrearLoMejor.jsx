import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { recrearLoMejor } from "../lib/loMejorApi";
import { leerMercado } from "../lib/mercado";
import { CAMINOS } from "../lib/loMejor";
import { construirRuta, navegar, slugDeMes } from "../lib/rutas";
import "./LoMejor.css";

// ============================================================
// «Recrear para [cliente]»: UN solo recreador para todo lo de otra cuenta
//
// Lo usan «Lo mejor» (global y la pestaña Inspiración de cada cliente) y las
// referencias del estudio de mercado. Dos caminos según lo que es la pieza:
//   · CON IA: el director diseña una imagen o un carrusel con la marca del
//     cliente mirando el original SÓLO como inspiración (nunca va al motor de
//     imagen), o un VIDEO ANIMADO con su idea y su estructura;
//   · PARA GRABAR: el guion con lo que se dice, las tomas, el texto en pantalla
//     y qué audio usar al publicarlo.
// Primero se pide el COSTO (el servidor no crea nada sin `confirmado`); con el
// sí, la publicación queda en el próximo día libre del cliente con el original
// de REFERENCIA (no se publica) y lo que la crea sigue en el servidor.
// ============================================================

const dinero = (n) => `${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace(".", ",")} $`;
const diaEnPalabras = (f) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" });

export default function RecrearLoMejor({ pieza, clientes = [], clienteInicial = "", onCerrar, onHecho = null }) {
  const ids = useId();
  const [ocupado, setOcupado] = useState("");
  const ref = useDialogA11y(() => { if (!ocupado) onCerrar(); });
  const posibles = clientes;
  const [clienteId, setClienteId] = useState(clienteInicial || pieza.clientes?.[0] || clientes[0]?.id || "");
  const [camino, setCamino] = useState(pieza.caminoSugerido || pieza.caminos?.[0] || "imagen");
  const [productos, setProductos] = useState([]);
  const [productoId, setProductoId] = useState("");
  const [presupuesto, setPresupuesto] = useState(null);
  const [hecho, setHecho] = useState(null);
  const [error, setError] = useState("");
  const cliente = clientes.find((c) => (c.dbId || c.id) === clienteId) ?? null;

  // El catálogo del cliente: para decir de qué producto va (sin escoger, el director usa el que encaje).
  useEffect(() => {
    let vivo = true;
    setProductos([]);
    setProductoId("");
    if (!clienteId) return undefined;
    leerMercado(clienteId)
      .then((m) => { if (vivo) setProductos((m?.catalogo ?? []).filter((p) => p.activo !== false && p.nombre)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [clienteId]);

  // El costo y el día, sin crear nada.
  useEffect(() => {
    let vivo = true;
    setPresupuesto(null);
    setError("");
    if (!clienteId) return undefined;
    recrearLoMejor({ clave: pieza.clave, clienteId, camino, productoId })
      .then((r) => { if (vivo) setPresupuesto(r.confirmar ?? null); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [pieza.clave, clienteId, camino, productoId]);

  const crear = async () => {
    if (ocupado || !presupuesto) return;
    setOcupado(camino === "grabar" ? "Viendo el video y escribiendo el guion para grabar (puede tardar un minuto)…"
      : camino === "animado" ? "Escribiendo el guion del video animado…" : "Creando la publicación y avisando al director…");
    setError("");
    try {
      const r = await recrearLoMejor({ clave: pieza.clave, clienteId, camino, productoId, confirmado: true });
      setHecho(r);
      onHecho?.(r);
    } catch (e) {
      setError(e.message);
    }
    setOcupado("");
  };

  const abrirCalendario = () => {
    if (!hecho) return;
    const [a, m] = hecho.fecha.split("-").map(Number);
    navegar(construirRuta({ cliente: clienteId, calendario: slugDeMes(a, m - 1) }));
    onCerrar();
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div ref={ref} className="dialog lo-mejor-recrear" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="lo-mejor-recrear-cabecera">
          <h2 id={`${ids}-t`}><Icon name="wand" size={18} /> Recrear{cliente ? ` para ${cliente.name}` : ""}</h2>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={Boolean(ocupado)} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>

        <div className="lo-mejor-recrear-pieza">
          {pieza.miniatura ? <img src={pieza.miniatura} alt="" /> : <span className="lo-mejor-sin-vista"><Icon name="image" size={20} /></span>}
          <div>
            <p className="lo-mejor-cifra">{pieza.cifra?.texto}</p>
            <p className="hint" style={{ margin: 0 }}>{[pieza.tipoNombre, pieza.cuenta].filter(Boolean).join(" · ")}</p>
            {pieza.idea && <p className="lo-mejor-idea">{pieza.idea}</p>}
          </div>
        </div>

        {!hecho && (
          <>
            {posibles.length > 1 && (
              <div className="field">
                <label className="label" htmlFor={`${ids}-c`}>Para qué cliente</label>
                <select id={`${ids}-c`} className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={Boolean(ocupado)}>
                  {posibles.map((c) => <option key={c.dbId || c.id} value={c.dbId || c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <fieldset className="field lo-mejor-caminos" disabled={Boolean(ocupado)}>
              <legend className="label">Cómo se recrea</legend>
              {(pieza.caminos ?? ["imagen"]).map((c) => (
                <label key={c} className="lo-mejor-camino" data-activo={camino === c || undefined}>
                  <input type="radio" name={`${ids}-camino`} value={c} checked={camino === c} onChange={() => setCamino(c)} />
                  <Icon name={CAMINOS[c].icono} size={16} />
                  <span>
                    <strong>{CAMINOS[c].nombre}</strong>{c === pieza.caminoSugerido && <span className="lo-mejor-sugerido"> · sugerido</span>}
                    <span className="hint">
                      {c === "imagen" && " El director la diseña con la marca: mira el original sólo como inspiración."}
                      {c === "carrusel" && " El director diseña la serie con la idea del original, lámina a lámina."}
                      {c === "animado" && " Un guion por escenas con su idea y su estructura; la voz y el render se piden después."}
                      {c === "grabar" && " Lo que se dice, las tomas, el texto en pantalla y qué audio usar al publicar."}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {productos.length > 0 && (
              <div className="field">
                <label className="label" htmlFor={`${ids}-p`}>De qué producto</label>
                <select id={`${ids}-p`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)} disabled={Boolean(ocupado)}>
                  <option value="">El que mejor encaje</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}
            <div role="status" aria-live="polite" className="lo-mejor-costo">
              {presupuesto
                ? <>Cuesta unos <strong>{dinero(presupuesto.costo)}</strong> ({presupuesto.detalle}). Va el <strong>{diaEnPalabras(presupuesto.fecha)}</strong>, el próximo día libre, con el original de referencia (no se publica).</>
                : !error && clienteId ? "Calculando el costo…" : ""}
            </div>
          </>
        )}

        {error && <p role="alert" className="lo-mejor-error">{error}</p>}
        {ocupado && <p role="status" className="hint">{ocupado}</p>}

        {hecho && (
          <div role="status" className="lo-mejor-hecho">
            <p style={{ margin: 0 }}><Icon name="check" size={16} /> Publicación creada el <strong>{diaEnPalabras(hecho.fecha)}</strong>.</p>
            <p className="hint" style={{ margin: 0 }}>
              {hecho.encargoId && "El director la está diseñando en el servidor: sigue aunque cierres la aplicación. Cuando salga, está en el Estudio del cliente."}
              {hecho.videoId && "El guion del video animado está listo para revisar (en la publicación, «Video animado»)."}
              {hecho.camino === "grabar" && "El guion para grabar está en la publicación, con las tomas y qué audio usar."}
              {hecho.aviso ? ` ${hecho.aviso}` : ""}
            </p>
          </div>
        )}

        <div className="lo-mejor-recrear-pie">
          {hecho ? (
            <>
              <button type="button" className="btn btn-primary" onClick={abrirCalendario}><Icon name="calendar" size={16} /> Abrir el calendario</button>
              <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cerrar</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={crear} disabled={!presupuesto || Boolean(ocupado)} aria-busy={Boolean(ocupado) || undefined}>
                <Icon name="sparkles" size={16} /> {presupuesto ? `Crear por unos ${dinero(presupuesto.costo)}` : "Crear"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onCerrar} disabled={Boolean(ocupado)}>Cancelar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
