import "./Tablero.css";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Icon from "../components/Icon";
import * as db from "../lib/db";
import { ETAPAS, ETAPAS_MANUALES, NOMBRE_ETAPA, etapaDe } from "../lib/trabajo";
import { conAprobacion } from "../lib/aprobacion";
import { resumenCola } from "../lib/cola";
import { fechaEnZona, sumarDias } from "../lib/agenda";
import { useEquipo, miembroDe } from "../hooks/useEquipo";
import { yoActual } from "../lib/sesionActual";
import { FORMAT_ICONS } from "../constants";
import { iniciales } from "../utils";

// ============================================================
// El tablero: en qué etapa está cada publicación, de todos los clientes
//
// Idea → En producción → Revisión interna → Con el cliente → Aprobada →
// Programada → Publicada. Las cuatro primeras las mueve el equipo
// —arrastrando la tarjeta o con «Mover a…», que es lo que funciona con
// teclado y en el teléfono—; las tres últimas salen solas de la
// aprobación del cliente y de la cola, así que no se sueltan ahí.
//
// Mover una tarjeta escribe su calendario, como el panel: con el
// guardado agrupado pendiente soltado antes (ver «Subir»).
// ============================================================

const RANGOS = [[7, "Esta semana"], [14, "2 semanas"], [31, "Un mes"]];

export default function Tablero({ clients = [], pulso = 0, onAbrir, onCalendarioGuardado, soltarPendiente }) {
  const ids = useId();
  const miembros = useEquipo(pulso);
  const [filas, setFilas] = useState([]);
  const [respuestas, setRespuestas] = useState(() => new Map());
  const [rango, setRango] = useState(14);
  const [persona, setPersona] = useState("all");
  const [cliente, setCliente] = useState("");
  const [arrastrada, setArrastrada] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const hoy = fechaEnZona();

  const cargar = useCallback(() => Promise.all([
    db.listarProgramacion(60).then(setFilas).catch(() => setFilas([])),
    db.aprobacionesDelEspacio().then(setRespuestas).catch(() => {}),
  ]), []);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const quien = persona === "mias" ? yoActual()?.id : persona;
  const tarjetas = useMemo(() => {
    const desde = sumarDias(hoy, -14);
    const hasta = sumarDias(hoy, rango - 1);
    const salida = [];
    for (const c of clients) {
      if (cliente && c.id !== cliente) continue;
      for (const cal of c.calendars ?? []) {
        for (const d of cal.days ?? []) {
          if (!d?.date || d.date < desde || d.date > hasta) continue;
          for (const original of d.posts ?? []) {
            // Lo que respondió el cliente, aunque ese calendario no se haya abierto.
            const p = conAprobacion(original, respuestas.get(`${cal.dbId || cal.id}:${original.id}`));
            if (persona !== "all" && p.responsableId !== quien) continue;
            const etapa = etapaDe(p, { estadoCola: resumenCola(filas, p.id)?.estado ?? null, compartido: Boolean(cal.shareToken) });
            // Lo de días pasados sólo si quedó colgado (no salió).
            if (d.date < hoy && ["publicada", "programada"].includes(etapa)) continue;
            salida.push({ cliente: c, cal, fecha: d.date, post: p, etapa, atrasada: d.date < hoy });
          }
        }
      }
    }
    return salida.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  }, [clients, filas, respuestas, rango, persona, quien, cliente, hoy]);

  const mover = async (t, etapa) => {
    if (!ETAPAS_MANUALES.includes(etapa) || t.etapa === etapa) return;
    setMensaje(null);
    const nuevo = {
      ...t.cal,
      days: (t.cal.days ?? []).map((d) => ({
        ...d,
        posts: (d.posts ?? []).map((p) => (p.id === t.post.id ? { ...p, etapa } : p)),
      })),
    };
    try {
      soltarPendiente?.(t.cal.id);
      const guardado = await db.saveCalendar(nuevo, t.cliente.dbId || t.cliente.id);
      onCalendarioGuardado?.(t.cliente.id, { ...nuevo, ...(guardado ? { days: guardado.days } : {}) });
      setMensaje({ tipo: "ok", texto: `«${t.post.title || t.post.idea || "Publicación"}» pasó a «${NOMBRE_ETAPA[etapa]}».` });
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    }
  };

  const soltar = (etapa) => (e) => {
    e.preventDefault();
    if (arrastrada) void mover(arrastrada, etapa);
    setArrastrada(null);
  };

  return (
    <div className="tablero">
      <div className="page-header">
        <h1 className="page-title">Tablero</h1>
        <p className="page-meta">En qué etapa está cada publicación de todos los clientes. Arrastra una tarjeta (o usa «Mover a…») entre las cuatro primeras columnas.</p>
      </div>

      <div className="prog-filtros tablero-filtros">
        <div className="segmented" role="group" aria-label="Cuántos días mirar">
          {RANGOS.map(([n, nombre]) => (
            <button key={n} type="button" className={`segmented-btn ${rango === n ? "active" : ""}`} aria-pressed={rango === n} onClick={() => setRango(n)}>{nombre}</button>
          ))}
        </div>
        <label className="sr-only" htmlFor={`${ids}-persona`}>Quién la lleva</label>
        <select id={`${ids}-persona`} className="input" value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="all">Todo el equipo</option>
          <option value="mias">Las mías</option>
          {miembros.map((m) => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-cliente`}>Cliente</label>
        <select id={`${ids}-cliente`} className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div role="status" aria-live="polite" className={mensaje?.tipo === "ok" ? undefined : "sr-only"}>
        {mensaje?.tipo === "ok" && <p className="notice notice-ok">{mensaje.texto}</p>}
      </div>
      {mensaje?.tipo === "error" && <p role="alert" className="notice notice-error">{mensaje.texto}</p>}

      <div className="tablero-columnas">
        {ETAPAS.map(([k, nombre, icono]) => {
          const manual = ETAPAS_MANUALES.includes(k);
          const propias = tarjetas.filter((t) => t.etapa === k);
          return (
            <section
              key={k}
              className="tablero-columna"
              data-manual={manual || undefined}
              data-soltable={(manual && arrastrada && arrastrada.etapa !== k) || undefined}
              aria-labelledby={`${ids}-${k}`}
              onDragOver={manual ? (e) => e.preventDefault() : undefined}
              onDrop={manual ? soltar(k) : undefined}
            >
              <h2 id={`${ids}-${k}`} className="tablero-titulo"><Icon name={icono} size={16} /> {nombre} <span className="prog-cuenta">({propias.length})</span></h2>
              <ul className="tablero-lista">
                {propias.map((t) => {
                  const lleva = miembroDe(miembros, t.post.responsableId);
                  const titulo = t.post.title || t.post.idea || String(t.post.descripcion || "").slice(0, 60) || "Sin título";
                  return (
                    <li key={`${t.cal.id}:${t.post.id}`} className="tablero-tarjeta" draggable={ETAPAS_MANUALES.includes(t.etapa)}
                      onDragStart={() => setArrastrada(t)} onDragEnd={() => setArrastrada(null)} data-atrasada={t.atrasada || undefined}>
                      <button type="button" className="tablero-abrir" onClick={() => onAbrir?.({ clientId: t.cliente.id, calendarId: t.cal.id, postId: t.post.id })}>
                        <span className="tablero-cliente">{t.cliente.name}</span>
                        <span className="tablero-texto"><Icon name={FORMAT_ICONS[t.post.format] || "formatPost"} size={13} /> {titulo}</span>
                        <span className="tablero-meta">
                          {t.atrasada ? "Atrasada · " : ""}{new Date(`${t.fecha}T12:00:00Z`).toLocaleDateString("es-PA", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })}
                          {t.post.publishTime ? ` · ${t.post.publishTime}` : ""}
                        </span>
                      </button>
                      <div className="tablero-pie">
                        {lleva ? (
                          <span className="persona-mini" style={{ width: 22, height: 22, background: lleva.color }} title={`Lo lleva ${lleva.nombre}`} aria-label={`Lo lleva ${lleva.nombre}`} role="img">{iniciales(lleva.nombre)}</span>
                        ) : <span className="tablero-sin">Sin asignar</span>}
                        {ETAPAS_MANUALES.includes(t.etapa) && (
                          <>
                            <label className="sr-only" htmlFor={`${ids}-m-${t.post.id}`}>Mover «{titulo}» a</label>
                            <select id={`${ids}-m-${t.post.id}`} className="input tablero-mover" value="" onChange={(e) => mover(t, e.target.value)}>
                              <option value="">Mover a…</option>
                              {ETAPAS_MANUALES.filter((x) => x !== t.etapa).map((x) => <option key={x} value={x}>{NOMBRE_ETAPA[x]}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
