import { useCallback, useEffect, useId, useState } from "react";
import Icon from "./Icon";
import {
  leerSenales, aprenderDelHistorial, aprenderDeMetricas, leerPropuestas, proponerReglas, aceptarPropuesta, descartarPropuesta,
} from "../lib/cerebro";
import {
  NOMBRE_SENAL, etiquetaDeResultado, senalesParaMostrar, describirSenales, acumularHistorial, describirHistorial, describirMetricas, describirPropuestas, textoDeRespaldo,
} from "../lib/cerebroAprendizaje";

// ============================================================
// Lo que el cerebro aprende de lo que pasa después de escribir
//
// Cuando el cliente aprueba o pide cambios, el cerebro lo apunta: las
// notas que se usaron al escribir esa publicación suben o bajan en la
// búsqueda, y lo que el cliente dijo con sus palabras queda como una nota
// de tipo Decisión. Lo mismo pasa con lo que rinde en redes y con lo que el
// equipo reescribe de lo que escribió la IA. Aquí se ve qué ha aprendido, se
// le puede pedir que aprenda también de lo de antes, y que proponga reglas.
// ============================================================

const fecha = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short" }) : "");
const MOSTRAR = 8;

export default function CerebroAprendizaje({ client, lectura, version, onCambio }) {
  const ids = useId();
  const [senales, setSenales] = useState(null);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null); // { ok, texto }
  const [reglas, setReglas] = useState([]);       // las que esperan una decisión
  const [borradores, setBorradores] = useState({}); // id → { titulo, texto }: lo que la persona va corrigiendo
  const [resolviendo, setResolviendo] = useState(""); // id de la regla que se está aceptando o descartando

  const cargar = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([leerSenales(client.id), leerPropuestas(client.id)]);
      setSenales(s.senales);
      setReglas(p.propuestas);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [client.id]);

  useEffect(() => { cargar(); }, [cargar, version]);

  const aprenderHistorial = async () => {
    setAviso(null);
    let acum = null;
    let desde = 0;
    try {
      do {
        setTrabajando(acum?.total ? `Leyendo calendarios: ${Math.min(acum.leidos, acum.total)} de ${acum.total}…` : "Leyendo calendarios…");
        const r = await aprenderDelHistorial(client.id, desde);
        acum = acumularHistorial(acum, r);
        desde = r.siguiente;
      } while (desde !== null);
      setAviso({ ok: true, texto: describirHistorial(acum) });
    } catch (e) {
      setAviso({ ok: false, texto: `${acum?.leidos ? `Alcanzó a leer ${acum.leidos} calendarios. ` : ""}${e.message}` });
    } finally {
      setTrabajando("");
      await cargar();
      if (onCambio) await onCambio();
    }
  };

  const aprenderMetricas = async () => {
    setAviso(null);
    setTrabajando("metricas");
    try {
      setAviso({ ok: true, texto: describirMetricas(await aprenderDeMetricas(client.id)) });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setTrabajando("");
      await cargar();
      if (onCambio) await onCambio();
    }
  };

  const proponer = async (forzar = false) => {
    setAviso(null);
    setTrabajando("reglas");
    try {
      setAviso({ ok: true, texto: describirPropuestas(await proponerReglas(client.id, { forzar })) });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setTrabajando("");
      await cargar();
    }
  };

  const editar = (regla, campo, valor) => setBorradores((b) => ({ ...b, [regla.id]: { titulo: regla.titulo, texto: regla.texto, ...b[regla.id], [campo]: valor } }));

  const resolver = async (regla, aceptar) => {
    setResolviendo(regla.id);
    setAviso(null);
    try {
      if (aceptar) {
        await aceptarPropuesta(client.id, regla.id, borradores[regla.id] ?? {});
        setAviso({ ok: true, texto: `«${borradores[regla.id]?.titulo ?? regla.titulo}» quedó como una nota de tipo Decisión: la IA ya la lee.` });
      } else {
        await descartarPropuesta(client.id, regla.id);
        setAviso({ ok: true, texto: `«${regla.titulo}» descartada: no se volverá a proponer.` });
      }
      setBorradores(({ [regla.id]: _quitada, ...resto }) => resto);
      await cargar();
      if (aceptar && onCambio) await onCambio();
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
      await cargar();
    } finally {
      setResolviendo("");
    }
  };

  const lista = senales ?? [];
  const mostradas = senalesParaMostrar(lista, MOSTRAR);
  return (
    <details className="cerebro-aprende card">
      <summary>
        <Icon name="sparkles" size={16} /> Lo que aprende de lo que pasa después de escribir
        {senales && <span className="cerebro-cuenta">{lista.length}</span>}
      </summary>

      <div className="cerebro-aprende-cuerpo">
        <p className="hint">
          Cuando el cliente aprueba o pide cambios, las notas que se usaron para escribir esa publicación suben o bajan en la búsqueda,
          y lo que dijo con sus palabras queda como una nota de tipo Decisión. Lo mismo pasa con lo que rinde en redes y con lo que el equipo
          reescribe de lo que escribió la IA. El silencio no cuenta: sin respuesta, no se aprende nada.
        </p>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
        {senales && <p className="cerebro-aprende-resumen" role="status">{describirSenales(lista)}</p>}

        {lista.length > 0 && (
          <ul className="cerebro-senales" aria-label="Lo último que ha aprendido">
            {mostradas.map((s) => {
              const e = etiquetaDeResultado(s.resultado);
              return (
                <li key={s.id} className="cerebro-senal">
                  <span className={`cerebro-senal-marca cerebro-senal-${e.nivel}`} aria-hidden="true" />
                  <span className="cerebro-senal-texto">
                    <span className="sr-only">{e.texto}: </span>{s.resumen}
                  </span>
                  <span className="cerebro-senal-meta">{NOMBRE_SENAL[s.tipo] ?? "Señal"}{s.fecha ? ` · ${fecha(s.fecha)}` : ""}</span>
                </li>
              );
            })}
            {lista.length > mostradas.length && <li className="hint">Y {lista.length - mostradas.length} más.</li>}
          </ul>
        )}

        {!lectura && (
          <div className="cerebro-acciones" role="group" aria-label="Aprender">
            <button type="button" className="btn btn-secondary" disabled={Boolean(trabajando)} onClick={aprenderHistorial} aria-describedby={`${ids}-h`}>
              <Icon name="refresh" size={18} /> {trabajando && trabajando !== "reglas" && trabajando !== "metricas" ? trabajando : "Aprender de lo que ya respondió"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(trabajando)} onClick={aprenderMetricas} aria-describedby={`${ids}-m`}>
              <Icon name="chart" size={18} /> {trabajando === "metricas" ? "Comparando publicaciones…" : "Aprender de los resultados en redes"}
            </button>
            <button type="button" className="btn btn-accent" disabled={Boolean(trabajando)} onClick={() => proponer(false)} aria-describedby={`${ids}-r`}>
              <Icon name="sparkles" size={18} /> {trabajando === "reglas" ? "La IA está leyendo lo que pasó…" : "Proponer reglas con IA"}
            </button>
          </div>
        )}
        <p id={`${ids}-h`} className="hint">
          Lee las respuestas que el cliente ya dio en sus calendarios y las apunta. No mueve lo que sube o baja en la búsqueda —de lo de antes no se sabe qué notas se usaron—: eso empieza con lo que se escriba desde ahora.
        </p>
        <p id={`${ids}-m`} className="hint">
          Compara lo que rindió cada publicación con las demás de este cliente, cuando ya han tenido unos días para rendir. Sólo aprende de las que salieron desde la aplicación. No gasta IA.
        </p>
        <p id={`${ids}-r`} className="hint">
          Una llamada a la IA lee lo que dijo el cliente, lo que rindió y lo que el equipo corrigió, y propone unas pocas reglas. Ninguna entra al cerebro hasta que tú la aceptes.
        </p>
        {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "cerebro-aviso" : "cerebro-error"}>{aviso.texto}</p>}

        {reglas.length > 0 && (
          <section className="cerebro-reglas" aria-labelledby={`${ids}-rt`}>
            <h4 id={`${ids}-rt`} className="cerebro-reglas-titulo">Reglas propuestas <span className="cerebro-cuenta">{reglas.length}</span></h4>
            <ul className="cerebro-lista">
              {reglas.map((r) => {
                const b = { titulo: r.titulo, texto: r.texto, ...borradores[r.id] };
                const ocupada = resolviendo === r.id;
                return (
                  <li key={r.id} className="cerebro-regla card">
                    <div className="field">
                      <label className="label" htmlFor={`${ids}-t-${r.id}`}>Regla</label>
                      <input id={`${ids}-t-${r.id}`} className="input" value={b.titulo} maxLength={140} readOnly={lectura} onChange={(e) => editar(r, "titulo", e.target.value)} />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor={`${ids}-x-${r.id}`}>Qué dice</label>
                      <textarea id={`${ids}-x-${r.id}`} className="input" rows={3} value={b.texto} readOnly={lectura} onChange={(e) => editar(r, "texto", e.target.value)} />
                    </div>
                    {r.respaldo.length > 0 && (
                      <details className="cerebro-respaldo">
                        <summary>{textoDeRespaldo(r.respaldo.length)}</summary>
                        <ul>{r.respaldo.map((t, i) => <li key={i}>{t}</li>)}</ul>
                      </details>
                    )}
                    {!lectura && (
                      <div className="cerebro-editor-pie">
                        <button type="button" className="btn btn-secondary" disabled={ocupada || Boolean(resolviendo)} onClick={() => resolver(r, false)}>Descartar</button>
                        <button type="button" className="btn btn-primary" disabled={ocupada || Boolean(resolviendo) || !b.titulo.trim() || !b.texto.trim()} onClick={() => resolver(r, true)}>
                          <Icon name="check" size={18} /> {ocupada ? "Guardando…" : "Aceptar"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}
