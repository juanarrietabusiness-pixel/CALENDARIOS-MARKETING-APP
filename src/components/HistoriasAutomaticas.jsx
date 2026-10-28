// ============================================================
// «Historias automáticas» en Programación: lo publicado vuelve como historia
//
// Una al día por cliente, a su hora: la imagen del post encajada en 9:16 con
// una frase corta. Se escoge la que menos salió y, a igualdad, la que mejor
// funcionó. Sale sola (la pone el servidor en la cola cada día) y se quita
// como cualquier otra fila de la cola. Las imágenes las dibuja el navegador:
// se preparan solas al abrir la aplicación y aquí con «Preparar ahora».
// ============================================================

import { useCallback, useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { TimePicker } from "./calendario/primitivas";
import { leerHistorias, guardarHistorias, quitarHistoria, devolverHistoria, prepararPendientes } from "../lib/historiasAutoApi";
import { REDES_HISTORIAS } from "../lib/historiasAuto";
import { fmtDate } from "../utils";

const NOMBRE_RED = { instagram: "Instagram", facebook: "Facebook" };
const idDe = (c) => c?.dbId || c?.id;

/** «2026-10-29» → «jue 29 oct». */
const diaCorto = (fecha) => {
  if (!fecha) return "";
  const d = new Date(`${fecha}T12:00:00`);
  return Number.isNaN(d.getTime()) ? fecha : d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
};

export default function HistoriasAutomaticas({ clients = [], onCambio }) {
  const ids = useId();
  const [clienteId, setClienteId] = useState(() => idDe(clients[0]) ?? "");
  const [datos, setDatos] = useState(null);
  const [abierta, setAbierta] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async (id) => {
    if (!id) return;
    try { setDatos(await leerHistorias(id)); } catch (e) { setMensaje({ tipo: "error", texto: e.message }); }
  }, []);
  useEffect(() => { if (abierta) void cargar(clienteId); }, [abierta, clienteId, cargar]);
  useEffect(() => { if (!clienteId && clients.length) setClienteId(idDe(clients[0])); }, [clients, clienteId]);

  const cambiar = async (cambios) => {
    setTrabajando("ajustes");
    setMensaje(null);
    try {
      setDatos(await guardarHistorias(clienteId, cambios));
      onCambio?.();
    } catch (e) { setMensaje({ tipo: "error", texto: e.message }); }
    setTrabajando("");
  };

  const preparar = async () => {
    setTrabajando("preparar");
    setMensaje(null);
    try {
      const { hechas, faltan } = await prepararPendientes(clienteId);
      setMensaje({
        tipo: "ok",
        texto: hechas ? `${hechas === 1 ? "Preparada 1 historia" : `Preparadas ${hechas} historias`}${faltan ? `; faltan ${faltan} (sigue al volver a pulsar)` : ""}.`
          : faltan ? "No se pudo preparar ninguna: revisa que las imágenes de esas publicaciones sigan subidas." : "No hay nada nuevo: todo lo publicado con imagen ya tiene su historia.",
      });
      await cargar(clienteId);
    } catch (e) { setMensaje({ tipo: "error", texto: e.message }); }
    setTrabajando("");
  };

  const quitar = async (pieza, volver = false) => {
    setTrabajando(pieza.id);
    try { setDatos(await (volver ? devolverHistoria : quitarHistoria)(clienteId, pieza.id)); } catch (e) { setMensaje({ tipo: "error", texto: e.message }); }
    setTrabajando("");
  };
  const quitadas = datos?.quitadas ?? [];

  const redes = datos?.redes ?? ["instagram"];
  const alternarRed = (r) => {
    const nuevas = redes.includes(r) ? redes.filter((x) => x !== r) : [...redes, r];
    if (nuevas.length) void cambiar({ redes: nuevas });
  };

  return (
    <section className="prog-bloque historias-auto" aria-labelledby={`${ids}-t`}>
      <h2 className="prog-titulo" id={`${ids}-t`}>
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={abierta} aria-controls={`${ids}-c`} onClick={() => setAbierta((v) => !v)}>
          <Icon name={abierta ? "chevronDown" : "chevronRight"} size={16} /> Historias automáticas
        </button>
      </h2>
      {abierta && (
        <div id={`${ids}-c`} className="historias-auto-cuerpo">
          <p className="hint" style={{ margin: 0 }}>
            Para que la cuenta no se quede callada: cada día, a la hora escogida, vuelve a salir como historia algo que
            ya se publicó (la imagen del post encajada en 9:16 con una frase corta). Primero lo que menos salió y, entre
            eso, lo que mejor funcionó. Sale sola. «Que no salga» la aparta para siempre (se puede devolver abajo); la de un día concreto se quita en la lista de la cola.
          </p>
          <div className="historias-auto-fila">
            <label className="sr-only" htmlFor={`${ids}-cl`}>Cliente</label>
            <select id={`${ids}-cl`} className="input" value={clienteId} onChange={(e) => { setDatos(null); setMensaje(null); setClienteId(e.target.value); }}>
              {clients.map((c) => <option key={idDe(c)} value={idDe(c)}>{c.name}</option>)}
            </select>
            <div className="interruptor-fila">
              <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>Una historia al día</span>
              <button
                type="button" role="switch" aria-checked={Boolean(datos?.activa)} aria-label="Historias automáticas de este cliente"
                className={`toggle${datos?.activa ? " is-on" : ""}`} disabled={!datos || trabajando === "ajustes"}
                onClick={() => cambiar({ activa: !datos?.activa })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>

          {datos && (
            <>
              <div className="historias-auto-fila">
                <div className="field" style={{ margin: 0 }}>
                  <label className="label" htmlFor={`${ids}-h`}>A qué hora (Panamá)</label>
                  <TimePicker id={`${ids}-h`} value={datos.hora} atajos={false} onChange={(h) => h && cambiar({ hora: h })} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <span className="label" id={`${ids}-r`}>Dónde</span>
                  <div role="group" aria-labelledby={`${ids}-r`} style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                    {REDES_HISTORIAS.map((r) => (
                      <button key={r} type="button" className="filter-chip" aria-pressed={redes.includes(r)} onClick={() => alternarRed(r)} disabled={trabajando === "ajustes"}>
                        {NOMBRE_RED[r]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p className="hint" role="status" style={{ margin: 0 }}>
                {datos.activa
                  ? `La próxima sale el ${diaCorto(datos.proxima)} a las ${datos.hora}${datos.ultimaFecha && datos.ultimaFecha >= datos.proxima ? " (ya está en la cola)" : ""}.`
                  : "Apagadas para este cliente."}
                {datos.nota ? ` Última: ${datos.nota}` : ""}
              </p>

              <div className="historias-auto-fila">
                <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>
                  {datos.piezas.length ? `${datos.piezas.length} preparadas` : "Nada preparado todavía"}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={preparar} disabled={Boolean(trabajando)}>
                  <Icon name="refresh" size={14} /> {trabajando === "preparar" ? "Preparando…" : "Preparar ahora"}
                </button>
              </div>
              {mensaje && <p className={mensaje.tipo === "error" ? "form-error" : "hint"} role={mensaje.tipo === "error" ? "alert" : "status"} style={{ margin: 0 }}>{mensaje.texto}</p>}

              {datos.piezas.length > 0 && (
                <ul className="historias-auto-piezas">
                  {datos.piezas.map((p) => (
                    <li key={p.id}>
                      <img src={p.src} alt={p.titulo ? `Historia de «${p.titulo}»` : "Historia preparada"} loading="lazy" />
                      <span className="historias-auto-usos">
                        {p.usos ? `${p.usos === 1 ? "1 vez" : `${p.usos} veces`}${p.usadaAt ? ` · la última, ${diaCorto(fmtDate(new Date(p.usadaAt)))}` : ""}` : "Aún no salió"}
                      </span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitar(p)} disabled={trabajando === p.id}>
                        Que no salga
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {quitadas.length > 0 && (
                <details className="historias-auto-quitadas">
                  <summary>{quitadas.length === 1 ? "1 apartada (no sale)" : `${quitadas.length} apartadas (no salen)`}</summary>
                  <ul className="historias-auto-piezas">
                    {quitadas.map((p) => (
                      <li key={p.id}>
                        <img src={p.src} alt={p.titulo ? `Historia apartada de «${p.titulo}»` : "Historia apartada"} loading="lazy" />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitar(p, true)} disabled={trabajando === p.id}>
                          Que vuelva a salir
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
