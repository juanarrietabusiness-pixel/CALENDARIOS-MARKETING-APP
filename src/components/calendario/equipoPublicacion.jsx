// ============================================================
// El equipo dentro de una publicación
//
//   · «Lo lleva»: la persona responsable (un miembro, no un nombre escrito).
//   · Etapa: Idea → En producción → Revisión interna → Con el cliente, y
//     las que salen solas (Aprobada, Programada, Publicada).
//   · Hilo del equipo: mensajes con autor y hora, con @menciones que avisan.
//     La «nota interna» era un campo: el último que escribía pisaba.
//   · Tareas de esta publicación («Diseñar esto para el jueves»).
//   · Historial: quién cambió qué.
//
// Lo que se guarda en la publicación (responsable, etapa, revisor) viaja
// con el `form` del panel, como todo lo demás. El hilo, las tareas y el
// historial van aparte (sus tablas), porque varias personas escriben a la
// vez y el calendario se guarda entero.
// ============================================================

import { useCallback, useEffect, useId, useState } from "react";
import Icon from "../Icon";
import SelectorFecha from "../SelectorFecha";
import * as db from "../../lib/db";
import { ETAPAS, NOMBRE_ETAPA, ETAPAS_MANUALES, etapaDe, etapaTrasProducir } from "../../lib/trabajo";
import { miembroDe } from "../../hooks/useEquipo";
import { yoActual } from "../../lib/sesionActual";
import { iniciales } from "../../utils";

const hora = (iso) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function Persona({ persona, tamano = 22 }) {
  if (!persona) return null;
  return (
    <span className="persona-mini" style={{ width: tamano, height: tamano, background: persona.color || "var(--accent)" }} aria-hidden="true">
      {iniciales(persona.nombre)}
    </span>
  );
}

/** Un selector de persona del equipo. */
export function SelectorPersona({ id, valor, miembros, onCambiar, vacio = "Sin asignar" }) {
  return (
    <select id={id} className="input" value={valor || ""} onChange={(e) => onCambiar(e.target.value || null)}>
      <option value="">{vacio}</option>
      {miembros.map((m) => <option key={m.userId} value={m.userId}>{m.nombre}{m.userId === yoActual()?.id ? " (yo)" : ""}</option>)}
    </select>
  );
}

export function LoLleva({ post, sf, miembros }) {
  const ids = useId();
  const persona = miembroDe(miembros, post.responsableId);
  return (
    <div className="field lo-lleva">
      <label className="label" htmlFor={`${ids}-lleva`}>Lo lleva</label>
      <div className="lo-lleva-fila">
        <Persona persona={persona} tamano={28} />
        <SelectorPersona id={`${ids}-lleva`} valor={post.responsableId} miembros={miembros} onCambiar={(v) => sf("responsableId", v)} />
        {yoActual()?.id && post.responsableId !== yoActual().id && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => sf("responsableId", yoActual().id)}>Me la quedo</button>
        )}
      </div>
    </div>
  );
}

export function EtapaPublicacion({ post, sf, miembros, estadoCola = null, compartido = false, revisionInterna = false }) {
  const ids = useId();
  const actual = etapaDe(post, { estadoCola, compartido });
  const automatica = !ETAPAS_MANUALES.includes(actual);
  const elegir = (k) => {
    if (k === "revision" && !post.revisorId) {
      // Sin revisor elegido, la pide quien no sea quien la lleva.
      const otro = miembros.find((m) => m.userId !== post.responsableId && m.userId !== yoActual()?.id);
      if (otro) sf("revisorId", otro.userId);
    }
    sf("etapa", k);
  };
  return (
    <div className="field etapa-publicacion">
      <span className="label" id={`${ids}-etapa`}>Etapa</span>
      <ol className="etapas" aria-labelledby={`${ids}-etapa`}>
        {ETAPAS.map(([k, nombre, icono]) => {
          const manual = ETAPAS_MANUALES.includes(k);
          return (
            <li key={k} data-actual={actual === k || undefined}>
              {manual ? (
                <button type="button" aria-pressed={actual === k} onClick={() => elegir(k)}>
                  <Icon name={icono} size={13} /> {nombre}
                </button>
              ) : (
                <span title="Sale sola de la aprobación y la cola"><Icon name={icono} size={13} /> {nombre}</span>
              )}
            </li>
          );
        })}
      </ol>
      {automatica && <p className="hint">«{NOMBRE_ETAPA[actual]}»: esta etapa sale sola de la aprobación del cliente y la cola.</p>}
      {revisionInterna && ["idea", "produccion", "revision"].includes(actual) && (
        <p className="hint"><Icon name="users" size={13} /> Este cliente pide revisión interna: no la ve hasta que pase a «Con el cliente».</p>
      )}
      {actual === "produccion" && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => elegir(etapaTrasProducir(revisionInterna))}>
          <Icon name="check" size={14} /> Terminé la producción: {revisionInterna ? "a revisión" : "lista para el cliente"}
        </button>
      )}
      {actual === "revision" && (
        <div className="etapa-revision">
          <label className="label" htmlFor={`${ids}-revisa`}>La revisa</label>
          <SelectorPersona id={`${ids}-revisa`} valor={post.revisorId} miembros={miembros} onCambiar={(v) => sf("revisorId", v)} vacio="Cualquiera del equipo" />
          <div className="etapa-botones">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => sf("etapa", "cliente")}>
              <Icon name="check" size={14} /> Aprobar y pasar al cliente
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sf("etapa", "produccion")}>
              Devolver a producción
            </button>
          </div>
          <p className="hint">Al devolverla, cuenta qué cambiar en el hilo del equipo (con @nombre le llega el aviso).</p>
        </div>
      )}
    </div>
  );
}

export function HiloEquipo({ calId, postId, pulso = 0, miembros = [], notaAnterior = "" }) {
  const ids = useId();
  const [notas, setNotas] = useState(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState("");

  const cargar = useCallback(() => db.listarNotas(calId, postId).then(setNotas).catch(() => setNotas([])), [calId, postId]);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const enviar = async (e) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    setFallo("");
    try {
      await db.escribirNota(calId, postId, t);
      setTexto("");
      await cargar();
    } catch (err) {
      setFallo(err.message);
    }
    setEnviando(false);
  };
  const mencionar = (m) => setTexto((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${m.nombre.split(/\s+/)[0]} `);
  const otros = miembros.filter((m) => m.userId !== yoActual()?.id);

  return (
    <section className="field hilo-equipo" aria-labelledby={`${ids}-t`}>
      <h3 className="label" id={`${ids}-t`}>Hilo del equipo <span style={{ fontWeight: 400, textTransform: "none" }}>· el cliente no lo ve</span></h3>
      {notaAnterior && (
        <p className="hilo-anterior"><span>Nota anterior:</span> {notaAnterior}</p>
      )}
      {notas?.length > 0 && (
        <ul className="hilo-lista">
          {notas.map((n) => {
            const autor = miembroDe(miembros, n.autor_id) ?? { nombre: n.autor_nombre };
            return (
              <li key={n.id}>
                <Persona persona={autor} />
                <div>
                  <p className="hilo-quien"><strong>{autor.nombre || "Alguien"}</strong> · {hora(n.created_at)}</p>
                  <p className="hilo-texto">{n.texto}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={enviar} className="hilo-form">
        <label className="sr-only" htmlFor={`${ids}-nota`}>Escribir al equipo</label>
        <textarea id={`${ids}-nota`} className="textarea" style={{ minHeight: 60 }} value={texto} maxLength={2000}
          onChange={(e) => setTexto(e.target.value)} placeholder="Escribe al equipo… @nombre para avisar a alguien" />
        <div className="hilo-acciones">
          {otros.length > 0 && (
            <span className="hilo-menciones" role="group" aria-label="Mencionar">
              {otros.map((m) => (
                <button key={m.userId} type="button" className="filter-chip" onClick={() => mencionar(m)} aria-label={`Mencionar a ${m.nombre}`}>
                  @{m.nombre.split(/\s+/)[0]}
                </button>
              ))}
            </span>
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={!texto.trim() || enviando}>
            <Icon name="send" size={14} /> {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
        {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      </form>
    </section>
  );
}

export function TareasDePublicacion({ calId, clientId, post, pulso = 0, miembros = [] }) {
  const ids = useId();
  const [tareas, setTareas] = useState(null);
  const [titulo, setTitulo] = useState("");
  const [asignado, setAsignado] = useState("");
  const [fecha, setFecha] = useState("");
  const [fallo, setFallo] = useState("");

  const cargar = useCallback(() => db.tareasDePublicacion(calId, post.id).then(setTareas).catch(() => setTareas([])), [calId, post.id]);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const crear = async (e) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    setFallo("");
    try {
      const persona = miembroDe(miembros, asignado);
      await db.saveClientTask({
        client_id: clientId, title: titulo.trim(), status: "pending", calendar_id: calId, post_id: post.id,
        assigned_to: persona?.nombre ?? "", due_date: fecha || null,
        description: `Para la publicación «${post.title || post.idea || "sin título"}».`,
      });
      setTitulo("");
      setFecha("");
      await cargar();
    } catch (err) {
      setFallo(err.message);
    }
  };
  const alternar = async (t) => {
    try {
      if (t.status === "completed") await db.reopenClientTask(t.id);
      else await db.completeClientTask(t.id);
      await cargar();
    } catch (err) { setFallo(err.message); }
  };

  return (
    <section className="field tareas-publicacion" aria-labelledby={`${ids}-t`}>
      <h3 className="label" id={`${ids}-t`}>Tareas de esta publicación</h3>
      {tareas?.length > 0 && (
        <ul className="tareas-publicacion-lista">
          {tareas.map((t) => (
            <li key={t.id} data-hecha={t.status === "completed" || undefined}>
              <button type="button" className="btn-icon" aria-pressed={t.status === "completed"} onClick={() => alternar(t)}
                aria-label={t.status === "completed" ? `Reabrir «${t.title}»` : `Terminar «${t.title}»`}>
                <Icon name={t.status === "completed" ? "checkSquare" : "square"} size={18} />
              </button>
              <span>{t.title}</span>
              <span className="hint">{[miembroDe(miembros, t.asignado_id)?.nombre || t.assigned_to, t.due_date].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={crear} className="tareas-publicacion-form">
        <label className="sr-only" htmlFor={`${ids}-titulo`}>Nueva tarea</label>
        <input id={`${ids}-titulo`} className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Diseñar la portada" />
        <label className="sr-only" htmlFor={`${ids}-quien`}>Para quién</label>
        <SelectorPersona id={`${ids}-quien`} valor={asignado} miembros={miembros} onCambiar={(v) => setAsignado(v ?? "")} vacio="Para…" />
        <SelectorFecha value={fecha || null} onChange={(f) => setFecha(f || "")} etiqueta="Para cuándo" vacio="Sin fecha" prefijo="Para el" />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={!titulo.trim()}><Icon name="plus" size={14} /> Tarea</button>
      </form>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
    </section>
  );
}

export function HistorialPublicacion({ calId, postId, pulso = 0 }) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState(null);
  useEffect(() => {
    if (!abierto) return;
    db.listarHistorial(calId, postId).then(setFilas).catch(() => setFilas([]));
  }, [abierto, calId, postId, pulso]);
  return (
    <details className="historial-publicacion" onToggle={(e) => setAbierto(e.currentTarget.open)}>
      <summary><Icon name="clock" size={14} /> Historial</summary>
      {filas === null ? <p className="hint">Cargando…</p> : filas.length ? (
        <ul>
          {filas.map((h) => <li key={h.id}><strong>{h.nombre || "Alguien"}</strong> {h.accion.charAt(0).toLowerCase() + h.accion.slice(1)} <span className="hint">· {hora(h.created_at)}</span></li>)}
        </ul>
      ) : <p className="hint">Todavía no hay cambios apuntados.</p>}
    </details>
  );
}
