import { useState, useEffect, useCallback, useId, useMemo } from "react";
import Icon from "../components/Icon";
import { Avatar } from "../components/Presencia";
import * as db from "../lib/db";
import { navegar } from "../lib/rutas";
import { clasificar, fechaEnZona, textoAtraso, textoFecha } from "../lib/agenda";

// ============================================================
// Mi día
//
// Una sola lista para todo lo que hay que hacer, en vez de una por
// empresa: Atrasadas, Hoy y Próximas. Cada tarea lleva la etiqueta de
// su empresa, y las tareas rápidas entran como tareas «sin empresa».
//
// Tres cosas que llevan a una tarea a «Hoy» sin que nadie la arrastre:
//   · el botón «Hoy», que la marca para ESTA fecha —si no se hace,
//     mañana está en Atrasadas sola—;
//   · su fecha límite;
//   · su recurrencia: la diaria está aquí cada mañana.
//
// La vista «Por empresa» es la de antes, para quien quiera revisar
// una empresa entera.
// ============================================================

const RECURRENCIA = { daily: "Diaria", weekly: "Semanal", monthly: "Mensual" };

const hecha = (t) => t.status === "completed" || t.status === "done";
const claveDe = (t) => `${t._rapida ? "r" : "c"}:${t.id}`;

export default function Tareas({
  clients = [], pulso = 0, onSelectClient, yo = null, presentes = [], foco = null, onFoco,
}) {
  const [clientTasks, setClientTasks] = useState([]);
  const [quickTasks, setQuickTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vista, setVista] = useState("dia");
  const [soloMias, setSoloMias] = useState(false);
  const [verHechas, setVerHechas] = useState(false);
  const hoy = fechaEnZona();

  const nombreDe = useMemo(() => {
    const m = new Map();
    for (const c of clients) {
      m.set(c.id, c.name);
      if (c.dbId) m.set(c.dbId, c.name);
    }
    return (id) => m.get(id) ?? "";
  }, [clients]);

  const cargar = useCallback(async () => {
    try {
      const { clientTasks: ct, quickTasks: qt } = await db.loadAllTasks();
      setClientTasks(ct || []);
      setQuickTasks(qt || []);
      setError("");
    } catch {
      setError("No se pudieron cargar las tareas.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const todas = useMemo(() => [
    ...clientTasks.map((t) => ({ ...t, _rapida: false })),
    ...quickTasks.map((t) => ({ ...t, client_id: "", _rapida: true })),
  ], [clientTasks, quickTasks]);

  const mias = (t) => {
    const yoNombre = (yo?.nombre ?? "").trim().toLowerCase();
    return !yoNombre || (t.assigned_to ?? "").trim().toLowerCase() === yoNombre;
  };
  const visibles = soloMias ? todas.filter(mias) : todas;
  const bloques = clasificar(visibles, hoy, { foco });

  // Aplica la fila que devuelve el servidor en su lista.
  const reemplazar = (t, fila) => {
    if (!fila) return;
    const set = t._rapida ? setQuickTasks : setClientTasks;
    set((prev) => prev.map((x) => (x.id === fila.id ? fila : x)));
  };

  const accion = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      setError(e?.message || "No se pudo guardar el cambio.");
    }
  };

  const alternarHecha = accion(async (t) => {
    const fila = hecha(t)
      ? await (t._rapida ? db.reopenQuickTask(t.id) : db.reopenClientTask(t.id))
      : await (t._rapida ? db.completeQuickTask(t.id) : db.completeClientTask(t.id));
    reemplazar(t, fila);
  });

  const actualizar = accion(async (t, datos) => {
    const fila = t._rapida ? await db.updateQuickTask(t.id, datos) : await db.updateClientTask(t.id, datos);
    reemplazar(t, fila);
  });

  const alternarHoy = (t) => actualizar(t, { today_date: t.today_date === hoy ? null : hoy });

  const crear = accion(async ({ titulo, empresa }) => {
    if (empresa) {
      const fila = await db.saveClientTask({ client_id: empresa, title: titulo, today_date: hoy, recurrence: "none" });
      setClientTasks((prev) => [...prev, fila]);
    } else {
      const fila = await db.saveQuickTask({ title: titulo, today_date: hoy });
      setQuickTasks((prev) => [...prev, fila]);
    }
  });

  const filaProps = (item) => ({
    item,
    hoy,
    empresa: item.tarea._rapida ? "" : nombreDe(item.tarea.client_id),
    enFoco: Boolean(foco) && item.tarea.client_id === foco,
    onToggle: () => alternarHecha(item.tarea),
    onHoy: () => alternarHoy(item.tarea),
    onFecha: (f) => actualizar(item.tarea, { due_date: f || null }),
    onEmpresa: () => onSelectClient?.(item.tarea.client_id),
  });

  const pendientes = todas.filter((t) => !hecha(t)).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)", flexWrap: "wrap" }}>
        <button className="btn-icon" onClick={() => navegar("/")} aria-label="Volver al panel">
          <Icon name="chevronLeft" size={20} />
        </button>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <h1 style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>Mi día</h1>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)" }}>
            {new Date(`${hoy}T12:00:00`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}{pendientes} pendiente{pendientes === 1 ? "" : "s"}
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Vista" style={{ flex: "1 1 260px", maxWidth: 360 }}>
          <button type="button" className={`segmented-btn ${vista === "dia" ? "active" : ""}`} aria-pressed={vista === "dia"} onClick={() => setVista("dia")}>
            <Icon name="clock" size={14} /> Mi día
          </button>
          <button type="button" className={`segmented-btn ${vista === "empresa" ? "active" : ""}`} aria-pressed={vista === "empresa"} onClick={() => setVista("empresa")}>
            <Icon name="building" size={14} /> Por empresa
          </button>
        </div>
      </div>

      {error && <p role="alert" className="notice notice-error">{error}</p>}

      <Foco clients={clients} foco={foco} onFoco={onFoco} presentes={presentes} yo={yo} nombreDe={nombreDe} />

      {loading && <p style={{ color: "var(--text-dim)", fontSize: "var(--fs-xs)" }}>Cargando tareas…</p>}

      {!loading && vista === "dia" && (
        <>
          <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
            <NuevaParaHoy clients={clients} foco={foco} onCrear={crear} />
            {yo?.nombre && (
              <button
                type="button"
                className={`filter-chip ${soloMias ? "active" : ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: "var(--tap-sm)" }}
                aria-pressed={soloMias}
                onClick={() => setSoloMias((v) => !v)}
                title={`Sólo las asignadas a ${yo.nombre}`}
              >
                <Icon name="user" size={12} /> Sólo las mías
              </button>
            )}
          </div>

          <Bloque titulo="Atrasadas" icono="alert" color="var(--danger)" items={bloques.atrasadas} filaProps={filaProps} />
          <Bloque
            titulo="Hoy"
            icono="clock"
            color="var(--accent)"
            items={bloques.hoy}
            filaProps={filaProps}
            vacio="Nada marcado para hoy. Pulsa «Hoy» en cualquier tarea para traerla aquí."
          />
          <Bloque titulo="Próximas" icono="calendar" color="var(--text-dim)" items={bloques.proximas} filaProps={filaProps} />
          <Bloque titulo="Sin fecha" icono="list" color="var(--text-dim)" items={bloques.sinFecha} filaProps={filaProps} />

          {bloques.hechasHoy.length > 0 && (
            <section className="dia-bloque">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={verHechas}
                onClick={() => setVerHechas((v) => !v)}
              >
                <Icon name={verHechas ? "chevronDown" : "chevronRight"} size={14} />
                Hechas hoy ({bloques.hechasHoy.length})
              </button>
              {verHechas && (
                <div style={{ marginTop: "var(--sp-2)" }}>
                  {bloques.hechasHoy.map((item) => <FilaDia key={claveDe(item.tarea)} {...filaProps(item)} />)}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {!loading && vista === "empresa" && (
        <PorEmpresa todas={visibles} nombreDe={nombreDe} filaProps={filaProps} hoy={hoy} />
      )}
    </div>
  );
}

function Bloque({ titulo, icono, color, items, filaProps, vacio }) {
  if (!items.length && !vacio) return null;
  return (
    <section className="dia-bloque" aria-label={titulo}>
      <h2 className="dia-bloque-titulo">
        <Icon name={icono} size={16} style={{ color }} />
        <span style={{ color: titulo === "Atrasadas" ? color : undefined }}>{titulo}</span>
        <span className="badge" style={{ background: "var(--surface-2)", fontSize: "var(--fs-3xs)" }}>{items.length}</span>
      </h2>
      {items.length === 0
        ? <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-faint)" }}>{vacio}</p>
        : items.map((item) => <FilaDia key={claveDe(item.tarea)} {...filaProps(item)} />)}
    </section>
  );
}

function FilaDia({ item, hoy, empresa, enFoco, onToggle, onHoy, onFecha, onEmpresa }) {
  const { tarea: t, fecha, atraso } = item;
  const esHecha = hecha(t);
  const marcadaHoy = t.today_date === hoy;
  const fechaId = useId();
  const rec = RECURRENCIA[t.recurrence];

  return (
    <div className="dia-fila" data-atrasada={atraso > 0 && !esHecha} data-foco={enFoco}>
      <button
        type="button"
        className="dia-check"
        aria-pressed={esHecha}
        onClick={onToggle}
        aria-label={esHecha ? `Reabrir: ${t.title}` : `Completar: ${t.title}`}
      >
        <Icon name={esHecha ? "checkSquare" : "square"} size={20} />
      </button>

      <div className="dia-fila-texto">
        <div
          className="dia-fila-titulo"
          style={{ textDecoration: esHecha ? "line-through" : "none", color: esHecha ? "var(--text-dim)" : "var(--text)" }}
        >
          {t.title}
        </div>
        <div className="dia-fila-meta">
          {t._rapida ? (
            <span className="dia-empresa" style={{ cursor: "default" }}><Icon name="bolt" size={10} /> Sin empresa</span>
          ) : (
            <button type="button" className="dia-empresa" onClick={onEmpresa} title={`Abrir ${empresa || "la empresa"}`}>
              <Icon name="building" size={10} /> {empresa || "Empresa"}
            </button>
          )}
          {atraso > 0 && !esHecha && <span className="dia-atraso">{textoAtraso(atraso)}</span>}
          {atraso === 0 && fecha && fecha !== hoy && !esHecha && <span>{textoFecha(fecha, hoy)}</span>}
          {rec && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="refresh" size={10} /> {rec}</span>}
          {t.assigned_to && <span style={{ color: "var(--accent)" }}>{t.assigned_to}</span>}
        </div>
      </div>

      {!esHecha && (
        <>
          <label htmlFor={fechaId} className="sr-only">Fecha límite de {t.title}</label>
          <input
            id={fechaId}
            type="date"
            className="input dia-fecha"
            value={t.due_date ?? ""}
            onChange={(e) => onFecha(e.target.value)}
            title="Fecha límite"
          />
          <button type="button" className="dia-hoy" aria-pressed={marcadaHoy} onClick={onHoy} title={marcadaHoy ? "Quitar de hoy" : "Hacerla hoy"}>
            Hoy
          </button>
        </>
      )}
    </div>
  );
}

/** «Añadir para hoy»: con empresa o sin ella (entonces es una tarea rápida). */
function NuevaParaHoy({ clients, foco, onCrear }) {
  const [titulo, setTitulo] = useState("");
  const [empresa, setEmpresa] = useState(foco ?? "");
  const [enviando, setEnviando] = useState(false);
  const tituloId = useId();
  const empresaId = useId();

  useEffect(() => { setEmpresa(foco ?? ""); }, [foco]);

  const enviar = async (e) => {
    e.preventDefault();
    const t = titulo.trim();
    if (!t || enviando) return;
    setEnviando(true);
    await onCrear({ titulo: t, empresa });
    setEnviando(false);
    setTitulo("");
  };

  return (
    <form onSubmit={enviar} style={{ display: "flex", gap: "var(--sp-2)", flex: "1 1 420px", flexWrap: "wrap" }}>
      <label htmlFor={tituloId} className="sr-only">Nueva tarea para hoy</label>
      <input
        id={tituloId}
        className="input"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Nueva tarea para hoy…"
        style={{ flex: "1 1 200px" }}
      />
      <label htmlFor={empresaId} className="sr-only">Empresa</label>
      <select id={empresaId} className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} style={{ flex: "0 1 180px" }}>
        <option value="">Sin empresa</option>
        {clients.map((c) => <option key={c.id} value={c.dbId || c.id}>{c.name}</option>)}
      </select>
      <button type="submit" className="btn btn-primary" disabled={!titulo.trim() || enviando}>
        <Icon name="plus" size={16} /> Añadir
      </button>
    </form>
  );
}

/**
 * «Hoy trabajo en…» y dónde está cada cual. Por persona: cada uno lleva
 * cosas distintas, y un foco global obligaría a ponerse de acuerdo.
 */
function Foco({ clients, foco, onFoco, presentes, yo, nombreDe }) {
  const id = useId();
  const conFoco = presentes.filter((p) => p.foco && p.userId !== yo?.id);
  return (
    <section
      aria-label="Empresa en foco"
      style={{
        display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap",
        padding: "var(--sp-3)", marginBottom: "var(--sp-4)",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
      }}
    >
      <label htmlFor={id} style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>Hoy trabajo en</label>
      <select id={id} className="input" value={foco ?? ""} onChange={(e) => onFoco?.(e.target.value || null)} style={{ flex: "0 1 220px" }}>
        <option value="">Ninguna en concreto</option>
        {clients.map((c) => <option key={c.id} value={c.dbId || c.id}>{c.name}</option>)}
      </select>
      {conFoco.length > 0 && (
        <div className="equipo-foco" aria-label="El equipo hoy">
          {conFoco.map((p) => (
            <span key={p.userId} className="equipo-foco-item">
              <Avatar persona={p} tamano={22} />
              {p.nombre} → {nombreDe(p.foco) || "otra empresa"}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** La vista de antes: todo agrupado por empresa, las rápidas primero. */
function PorEmpresa({ todas, nombreDe, filaProps, hoy }) {
  const [filtro, setFiltro] = useState("pending");
  const pasa = (t) => filtro === "all" || (filtro === "pending" ? !hecha(t) : hecha(t));
  const grupos = new Map();
  for (const t of todas.filter(pasa)) {
    const nombre = t._rapida ? "Sin empresa" : (nombreDe(t.client_id) || "Empresa sin nombre");
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre).push(t);
  }
  const orden = [...grupos.keys()].sort((a, b) =>
    a === "Sin empresa" ? -1 : b === "Sin empresa" ? 1 : a.localeCompare(b));

  return (
    <>
      <div className="filter-bar" role="group" aria-label="Filtrar tareas" style={{ marginBottom: "var(--sp-4)" }}>
        {[["pending", "Pendientes"], ["completed", "Completadas"], ["all", "Todas"]].map(([k, label]) => (
          <button key={k} className={`filter-chip ${filtro === k ? "active" : ""}`} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>
            {label}
          </button>
        ))}
      </div>
      {orden.length === 0 && (
        <div className="empty-state">
          <Icon name="clipboardCheck" size={36} className="empty-state-icon" style={{ margin: "0 auto var(--sp-3)" }} />
          <p className="empty-state-title">Sin tareas</p>
        </div>
      )}
      {orden.map((nombre) => (
        <section key={nombre} className="dia-bloque" aria-label={nombre}>
          <h2 className="dia-bloque-titulo">
            <Icon name={nombre === "Sin empresa" ? "bolt" : "building"} size={16} /> {nombre}
            <span className="badge" style={{ background: "var(--surface-2)", fontSize: "var(--fs-3xs)" }}>{grupos.get(nombre).length}</span>
          </h2>
          {grupos.get(nombre).map((t) => {
            const [item] = Object.values(clasificar([t], hoy)).flat();
            return <FilaDia key={claveDe(t)} {...filaProps(item ?? { tarea: t, fecha: null, atraso: 0 })} />;
          })}
        </section>
      ))}
    </>
  );
}
