import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { leerRecetas, guardarReceta, borrarReceta, crearConClaude } from "../lib/recetasApi";
import { SALIDAS_RECETA, limpiarReceta, idDeReceta } from "../lib/recetas";
import { editaLaAgencia } from "../lib/sesionActual";
import "./Recetas.css";

// ============================================================
// Las RECETAS de la agencia: escoger el QUÉ, y el CÓMO ya viene hecho
//
// Cada receta (src/lib/recetas.js) se abre de dos formas:
//   · «Crear aquí»: el director de la aplicación (pestaña Diseño) con «/receta <id>» escrito; lo paga la llave de la API.
//   · «Crear con Claude»: guarda el pedido (el cliente, la publicación, lo pedido) un día y abre claude.ai con un
//     mensaje corto que Claude canjea por el conector; lo paga la suscripción de Claude. El mensaje se COPIA también.
// Quien administra y los editores cambian las de la casa (y vuelven a ellas) y escriben las suyas.
// ============================================================

const VACIA = { titulo: "", descripcion: "", salida: "imagen", instrucciones: "", preguntas: [], controles: [] };
const lineas = (t) => String(t ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

function Editor({ inicial, existentes, onGuardar, onCancelar, ocupado }) {
  const ids = useId();
  const [f, setF] = useState(() => ({ ...VACIA, ...inicial, preguntas: (inicial?.preguntas ?? []).join("\n"), controles: (inicial?.controles ?? []).join("\n") }));
  const campo = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const id = inicial?.id || idDeReceta(f.titulo, existentes);
  const valida = limpiarReceta({ ...f, id, preguntas: lineas(f.preguntas), controles: lineas(f.controles) });
  return (
    <form className="recetas-editor" onSubmit={(e) => { e.preventDefault(); if (valida) onGuardar(valida); }}>
      <label className="field" htmlFor={`${ids}-t`}>
        <span className="label">Título</span>
        <input id={`${ids}-t`} className="input" maxLength={80} value={f.titulo} onChange={(e) => campo("titulo", e.target.value)} placeholder="Ej.: Producto en manos de una clienta" />
      </label>
      <label className="field" htmlFor={`${ids}-d`}>
        <span className="label">Para qué sirve (una frase)</span>
        <input id={`${ids}-d`} className="input" maxLength={240} value={f.descripcion} onChange={(e) => campo("descripcion", e.target.value)} />
      </label>
      <label className="field" htmlFor={`${ids}-s`}>
        <span className="label">Qué sale</span>
        <select id={`${ids}-s`} className="input" value={f.salida} onChange={(e) => campo("salida", e.target.value)}>
          {Object.entries(SALIDAS_RECETA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="field" htmlFor={`${ids}-i`}>
        <span className="label">El método, paso a paso</span>
        <textarea id={`${ids}-i`} className="input recetas-metodo" rows={9} value={f.instrucciones} onChange={(e) => campo("instrucciones", e.target.value)}
          placeholder={"1. Lee la guía del cliente con guia_de_diseno.\n2. …\n3. disenar_piezas: el plan con su costo, y crea sólo con el «sí»."} />
      </label>
      <label className="field" htmlFor={`${ids}-p`}>
        <span className="label">Qué preguntar si falta (una por línea, hasta 3)</span>
        <textarea id={`${ids}-p`} className="input" rows={3} value={f.preguntas} onChange={(e) => campo("preguntas", e.target.value)} />
      </label>
      <label className="field" htmlFor={`${ids}-c`}>
        <span className="label">Qué comprobar antes de entregar (una por línea)</span>
        <textarea id={`${ids}-c`} className="input" rows={3} value={f.controles} onChange={(e) => campo("controles", e.target.value)} />
      </label>
      <div className="recetas-botones">
        <button type="submit" className="btn btn-primary" disabled={!valida || ocupado}>Guardar</button>
        <button type="button" className="btn btn-ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
      </div>
    </form>
  );
}

/**
 * @param clienteId   el cliente para «Crear con Claude» (sin él, sólo se pueden ver y editar)
 * @param publicacion { calendarId, postId, etiqueta } si se abre desde una publicación
 * @param indicacion  lo escrito en «¿Qué quieres?»
 * @param onCrearAqui (receta) → abre el director de la aplicación con ella; sin esto, no hay «Crear aquí»
 */
export default function Recetas({ clienteId = null, publicacion = null, indicacion = "", onCrearAqui = null, onCerrar }) {
  const ids = useId();
  const [ocupado, setOcupado] = useState(false);
  const ref = useDialogA11y(() => { if (!ocupado) onCerrar(); });
  const [lista, setLista] = useState(null);
  const [editando, setEditando] = useState(null);
  const [quitando, setQuitando] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null);
  const puede = editaLaAgencia();

  useEffect(() => {
    let vivo = true;
    leerRecetas().then((l) => vivo && setLista(l)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, []);

  // Al pasar de la lista al editor el botón pulsado desaparece: el foco se queda dentro del diálogo.
  useEffect(() => {
    const n = ref.current;
    if (n && !n.contains(document.activeElement)) (n.querySelector("input, button:not([disabled])") ?? n).focus({ preventScroll: true });
  }, [editando, ref]);

  const conClaude = async (r) => {
    setOcupado(true);
    setError("");
    try {
      const h = await crearConClaude(r, { clienteId, publicacion, indicacion });
      setAviso({ receta: r.titulo, ...h });
    } catch (e) {
      setError(e.message);
    }
    setOcupado(false);
  };

  const guardar = async (r) => {
    setOcupado(true);
    setError("");
    try {
      setLista(await guardarReceta(r.id, r));
      setEditando(null);
      setAviso({ texto: `Guardada «${r.titulo}».` });
    } catch (e) {
      setError(e.message);
    }
    setOcupado(false);
  };

  const quitar = async (r) => {
    if (quitando !== r.id) { setQuitando(r.id); return; }
    setOcupado(true);
    setError("");
    try {
      setLista(await borrarReceta(r.id));
      setAviso({ texto: r.casa ? `«${r.titulo}» volvió a la de la casa.` : `Quitada «${r.titulo}».` });
    } catch (e) {
      setError(e.message);
    }
    setQuitando("");
    setOcupado(false);
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div ref={ref} className="dialog recetas" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} tabIndex={-1}>
        <div className="recetas-cabecera">
          <h2 id={`${ids}-t`} style={{ margin: 0 }}><Icon name="list" size={18} /> Recetas</h2>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <p className="hint" style={{ margin: "var(--sp-2) 0 var(--sp-3)" }}>
          Escoge qué quieres; el cómo ya viene en la receta.{publicacion?.etiqueta ? ` Para: ${publicacion.etiqueta}.` : ""}
          {" "}«Crear aquí» lo hace el director de la aplicación; «Crear con Claude» lo abre en claude.ai con el pedido (necesita el conector del calendario instalado allí).
        </p>

        {editando ? (
          <Editor inicial={editando} existentes={(lista ?? []).map((r) => r.id)} ocupado={ocupado} onGuardar={guardar} onCancelar={() => setEditando(null)} />
        ) : (
          <>
            {!lista && !error && <p className="hint" role="status">Cargando…</p>}
            {lista && (
              <ul className="recetas-lista">
                {lista.map((r) => (
                  <li key={r.id} className="recetas-item">
                    <div className="recetas-texto">
                      <strong>{r.titulo}</strong> <span className="recetas-salida">{SALIDAS_RECETA[r.salida] ?? r.salida}</span>
                      {!r.casa && <span className="recetas-salida">De la agencia</span>}
                      {r.descripcion && <p className="hint" style={{ margin: "var(--sp-1) 0 0" }}>{r.descripcion}</p>}
                    </div>
                    <div className="recetas-acciones">
                      {onCrearAqui && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCrearAqui(r)} disabled={ocupado}>Crear aquí</button>
                      )}
                      {clienteId && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => conClaude(r)} disabled={ocupado}>Crear con Claude</button>
                      )}
                      {puede && (
                        <>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuitando(""); setEditando(r); }} disabled={ocupado}>Editar</button>
                          {(r.cambiada || !r.casa) && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitar(r)} disabled={ocupado}>
                              {quitando === r.id ? "¿Seguro?" : r.casa ? "Volver a la de la casa" : "Quitar"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {puede && (
              <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start", marginTop: "var(--sp-3)" }} onClick={() => setEditando({ ...VACIA })} disabled={ocupado}>
                <Icon name="plus" size={16} /> Escribir una receta
              </button>
            )}
          </>
        )}

        <div role="status" aria-live="polite" className={aviso ? "recetas-aviso" : "sr-only"}>
          {aviso?.mensaje ? (
            <>
              Abrí claude.ai con «{aviso.receta}».{aviso.copiado ? " El mensaje también está copiado: si no aparece escrito, pégalo." : " Si no aparece escrito, copia este mensaje y pégalo:"}
              <code className="recetas-mensaje">{aviso.mensaje}</code>
              <a href={aviso.enlace} target="_blank" rel="noopener noreferrer">Abrir claude.ai otra vez</a>
            </>
          ) : aviso?.texto}
        </div>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
      </div>
    </div>
  );
}
