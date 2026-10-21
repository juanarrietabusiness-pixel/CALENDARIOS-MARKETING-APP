import { useState, useEffect, useId, useMemo } from "react";
import Icon from "../components/Icon";
import { Avatar } from "../components/Presencia";
import SelectorFecha from "../components/SelectorFecha";
import ElegirDia from "../components/ElegirDia";
import RepasoAtrasadas from "../components/RepasoAtrasadas";
import { useRepaso } from "../hooks/useRepaso";
import * as db from "../lib/db";
import { useTareas, hecha, claveTarea as claveDe, esDe } from "../hooks/useTareas";
import { useArrastrarOrden } from "../hooks/useArrastrarOrden";
import { navegar } from "../lib/rutas";
import { clasificar, fechaEnZona, textoAtraso, textoFecha } from "../lib/agenda";
import { filtrarCola, ordenarProgramacion, horaDe, asistidasPendientes } from "../lib/cola";
import { REDES } from "../lib/publicacion";

// ============================================================
// Mi día
//
// Una sola lista para todo lo que hay que hacer, en vez de una por
// empresa: Atrasadas, Hoy y Próximas. Cada tarea lleva la etiqueta de
// su empresa, y las tareas rápidas entran como tareas «sin empresa».
//
// Tres cosas que llevan a una tarea a «Hoy» sin que nadie la arrastre:
//   · el botón «Hoy» (o «Pasar a hoy» en una atrasada), que la planea
//     para ESTA fecha y manda sobre la fecha límite —si no se hace,
//     mañana está en Atrasadas sola—; «Mover a…» la planea otro día;
//   · su fecha límite;
//   · su recurrencia: la diaria está aquí cada mañana.
//
// El orden de la página es el de la prioridad: Hoy arriba (y se ordena
// arrastrando), luego los avisos de las publicaciones —cada uno se puede
// ocultar hasta que cambie, y lo que falló se puede descartar—, y después
// Atrasadas. Con lo atrasado delante, lo de hoy quedaba debajo de todo.
//
// La vista «Por empresa» es la de antes, para quien quiera revisar
// una empresa entera. Lo mismo, a mano desde cualquier pantalla, está en
// el panel lateral (PanelTareas); las acciones son de `useTareas`.
// ============================================================

const RECURRENCIA = { daily: "Diaria", weekly: "Semanal", monthly: "Mensual" };

export default function Tareas({
  clients = [], pulso = 0, onSelectClient, yo = null, presentes = [], foco = null, onFoco,
}) {
  const { todas, loading, error, alternarHecha, actualizar, alternarHoy, moverA, crear: crearTarea, reordenar } = useTareas(pulso);
  const [vista, setVista] = useState("dia");
  const [soloMias, setSoloMias] = useState(false);
  const [verHechas, setVerHechas] = useState(false);
  const hoy = fechaEnZona();
  const repaso = useRepaso(yo?.id, hoy);

  const nombreDe = useMemo(() => {
    const m = new Map();
    for (const c of clients) {
      m.set(c.id, c.name);
      if (c.dbId) m.set(c.dbId, c.name);
    }
    return (id) => m.get(id) ?? "";
  }, [clients]);

  // «Mías» es por PERSONA (`asignado_id`), no por nombre: cambiarse el
  // nombre ya no deja las tareas sin dueño. Las de antes sin persona
  // casada se siguen comparando por nombre.
  const visibles = soloMias && yo?.nombre ? todas.filter((t) => esDe(t, yo)) : todas;
  const bloques = clasificar(visibles, hoy, { foco });

  const ordenHoy = useArrastrarOrden(bloques.hoy, (x) => claveDe(x.tarea), (lista) => reordenar(lista.map((x) => x.tarea)));

  const crear = ({ titulo, empresa, dia }) => crearTarea({ titulo, empresa, today_date: dia || null });

  const filaProps = (item) => ({
    item,
    hoy,
    empresa: item.tarea._rapida ? "" : nombreDe(item.tarea.client_id),
    enFoco: Boolean(foco) && item.tarea.client_id === foco,
    onToggle: () => alternarHecha(item.tarea),
    onHoy: () => alternarHoy(item.tarea),
    onMover: (f) => moverA(item.tarea, f),
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

          {repaso.pendiente && (
            <RepasoAtrasadas
              items={bloques.atrasadas}
              hoy={hoy}
              nombreDe={nombreDe}
              onMover={moverA}
              onHecha={alternarHecha}
              onCerrar={repaso.cerrar}
            />
          )}

          <Bloque
            titulo="Hoy"
            icono="clock"
            color="var(--accent)"
            items={ordenHoy.lista}
            filaProps={filaProps}
            orden={ordenHoy}
            vacio="Nada para hoy. Pulsa «Hoy» o «Pasar a hoy» en cualquier tarea para traerla aquí."
          />

          <PublicacionesDeHoy pulso={pulso} nombreDe={nombreDe} clients={clients} yo={yo} />

          <Bloque titulo="Atrasadas" icono="alert" color="var(--danger)" items={bloques.atrasadas} filaProps={filaProps} />
          <Bloque titulo="Próximas" icono="calendar" color="var(--text-dim)" items={bloques.proximas} filaProps={filaProps} />
          <Bloque titulo="Por agendar" icono="list" color="var(--text-dim)" items={bloques.sinFecha} filaProps={filaProps} />

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

function Bloque({ titulo, icono, color, items, filaProps, vacio, orden = null }) {
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
        : items.map((item, i) => (
          <FilaDia
            key={claveDe(item.tarea)}
            {...filaProps(item)}
            orden={orden && {
              props: orden.props(item),
              arriba: i > 0 ? () => orden.mover(item, -1) : null,
              abajo: i < items.length - 1 ? () => orden.mover(item, 1) : null,
            }}
          />
        ))}
    </section>
  );
}

function FilaDia({ item, hoy, empresa, enFoco, onToggle, onHoy, onMover, onFecha, onEmpresa, orden = null }) {
  const { tarea: t, fecha, atraso } = item;
  const esHecha = hecha(t);
  const marcadaHoy = t.today_date === hoy;
  const rec = RECURRENCIA[t.recurrence];

  return (
    <div className="dia-fila" data-atrasada={atraso > 0 && !esHecha} data-foco={enFoco} {...(orden && !esHecha ? orden.props : {})}>
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
          {orden && (orden.arriba || orden.abajo) && (
            <span className="dia-orden">
              <button type="button" className="btn-icon" disabled={!orden.arriba} onClick={orden.arriba ?? undefined} aria-label={`Subir «${t.title}»`} title="Antes"><Icon name="chevronUp" size={16} /></button>
              <button type="button" className="btn-icon" disabled={!orden.abajo} onClick={orden.abajo ?? undefined} aria-label={`Bajar «${t.title}»`} title="Después"><Icon name="chevronDown" size={16} /></button>
            </span>
          )}
          <SelectorFecha value={t.due_date} onChange={onFecha} etiqueta={`Fecha límite de ${t.title}`} vacio="Fecha límite" />
          {fecha !== hoy && (
            <SelectorFecha value={null} onChange={(f) => f && onMover(f)} etiqueta={`Mover «${t.title}» a otro día`} vacio="Mover a…" prefijo="Para" />
          )}
          {atraso > 0 ? (
            <button type="button" className="dia-hoy" onClick={() => onMover(hoy)} title="Pasarla a hoy: sale de Atrasadas">
              Pasar a hoy
            </button>
          ) : (
            <button type="button" className="dia-hoy" aria-pressed={marcadaHoy} onClick={onHoy} title={marcadaHoy ? "Quitar de hoy" : "Hacerla hoy"}>
              Hoy
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Una tarea nueva: con empresa o sin ella (entonces es una tarea rápida), y el día en que se hace —hoy por
 * defecto; mañana, otro día de la semana o sin día—.
 */
function NuevaParaHoy({ clients, foco, onCrear }) {
  const [titulo, setTitulo] = useState("");
  const [empresa, setEmpresa] = useState(foco ?? "");
  const [dia, setDia] = useState(() => fechaEnZona());
  const [enviando, setEnviando] = useState(false);
  const tituloId = useId();
  const empresaId = useId();

  useEffect(() => { setEmpresa(foco ?? ""); }, [foco]);

  const enviar = async (e) => {
    e.preventDefault();
    const t = titulo.trim();
    if (!t || enviando) return;
    setEnviando(true);
    await onCrear({ titulo: t, empresa, dia });
    setEnviando(false);
    setTitulo("");
  };

  return (
    <form onSubmit={enviar} style={{ display: "flex", gap: "var(--sp-2)", flex: "1 1 420px", flexWrap: "wrap" }}>
      <label htmlFor={tituloId} className="sr-only">Nueva tarea</label>
      <input
        id={tituloId}
        className="input"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Nueva tarea…"
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
      <ElegirDia value={dia} onChange={setDia} etiqueta="¿Cuándo la haces?" />
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

/**
 * Lo que se ocultó de Mi día, por persona y en este navegador: cada aviso guarda la HUELLA de lo que decía
 * al ocultarlo (qué publicaciones), y vuelve en cuanto cambia —otra que falla, otra aprobada—. Así se quita
 * del camino lo ya visto sin perderse lo nuevo.
 */
function useOcultos(yoId) {
  const clave = `midia-ocultos:${yoId ?? "yo"}`;
  const [ocultos, setOcultos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(clave) || "{}") ?? {}; } catch { return {}; }
  });
  const ocultar = (tipo, huella) => setOcultos((prev) => {
    const siguiente = { ...prev, [tipo]: huella };
    try { localStorage.setItem(clave, JSON.stringify(siguiente)); } catch { /* sin almacenamiento */ }
    return siguiente;
  });
  return { visible: (tipo, huella) => Boolean(huella) && ocultos[tipo] !== huella, ocultar };
}

const huellaDe = (lista, id) => lista.map(id).sort().join("|");

/**
 * La cola, vista desde Mi día: lo que no se publicó —que es trabajo, como
 * una tarea atrasada— y lo que sale hoy. El detalle está en Programación.
 * Cada aviso se puede ocultar, y lo que falló se puede descartar aquí mismo.
 */
function PublicacionesDeHoy({ pulso, nombreDe, clients, yo }) {
  const [filas, setFilas] = useState([]);
  const [aprobadas, setAprobadas] = useState({ porProgramar: [], porProducir: [] });
  const [ocupada, setOcupada] = useState(null);
  const [fallo, setFallo] = useState("");
  const { visible, ocultar } = useOcultos(yo?.id);
  useEffect(() => {
    let vivo = true;
    db.listarProgramacion(1).then((f) => { if (vivo) setFilas(f); }).catch(() => {});
    db.listarAprobadas().then((a) => { if (vivo) setAprobadas(a); }).catch(() => {});
    return () => { vivo = false; };
  }, [pulso]);
  const { fallidas, proximas } = ordenarProgramacion(filtrarCola(filas, { rango: 1 }));
  const hoy = proximas[0]?.nombre === "Hoy" ? proximas[0].filas : [];
  const aMano = asistidasPendientes(clients, undefined, 1);
  const nProgramar = aprobadas.porProgramar?.length ?? 0;
  const nProducir = aprobadas.porProducir?.length ?? 0;
  const huellas = {
    fallidas: huellaDe(fallidas, (f) => f.id),
    aprobadas: huellaDe([...(aprobadas.porProgramar ?? []), ...(aprobadas.porProducir ?? [])], (x) => `${x.calendarId}:${x.postId}`),
    aMano: huellaDe(aMano, (x) => x.post.id),
  };
  const ver = {
    fallidas: fallidas.length > 0 && visible("fallidas", huellas.fallidas),
    aprobadas: (nProgramar > 0 || nProducir > 0) && visible("aprobadas", huellas.aprobadas),
    aMano: aMano.length > 0 && visible("aMano", huellas.aMano),
  };
  const nOcultos = [fallidas.length > 0 && !ver.fallidas, (nProgramar || nProducir) && !ver.aprobadas, aMano.length > 0 && !ver.aMano].filter(Boolean).length;
  if (!ver.fallidas && !ver.aprobadas && !ver.aMano && !hoy.length && !nOcultos) return null;
  const ir = (e) => { e.preventDefault(); navegar("/programacion"); };
  const linea = (f) => `${nombreDe(f.clientId) || "Cliente"} · ${REDES[f.red]?.nombre ?? f.red}${f.variante === "historia" ? " (historia)" : ""}`;
  const descartar = async (f) => {
    if (!window.confirm("¿Descartar este fallo? No se volverá a intentar.")) return;
    setOcupada(f.id);
    setFallo("");
    try {
      await db.cancelarPublicacion(f.id);
      setFilas((prev) => prev.filter((x) => x.id !== f.id));
    } catch (e) {
      setFallo(e.message);
    }
    setOcupada(null);
  };
  const botonOcultar = (tipo) => (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => ocultar(tipo, huellas[tipo])} title="Vuelve a salir si cambia algo">
      <Icon name="eyeOff" size={14} /> Ocultar
    </button>
  );

  return (
    <section className="dia-bloque" aria-label="Publicaciones">
      {ver.fallidas && (
        <div className="notice notice-error" style={{ display: "block", marginBottom: "var(--sp-2)" }}>
          <div className="dia-aviso-cabecera">
            <p style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
              <Icon name="alert" size={16} /> {fallidas.length} {fallidas.length === 1 ? "publicación no se publicó" : "publicaciones no se publicaron"}
            </p>
            {botonOcultar("fallidas")}
          </div>
          <ul style={{ margin: "var(--sp-1) 0 var(--sp-2) var(--sp-4)", fontSize: "var(--fs-2xs)" }}>
            {fallidas.slice(0, 5).map((f) => (
              <li key={f.id}>
                <strong>{linea(f)}:</strong> {f.error}{" "}
                <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada === f.id} onClick={() => descartar(f)}>Descartar</button>
              </li>
            ))}
          </ul>
          {fallo && <p role="alert" style={{ fontSize: "var(--fs-2xs)" }}>{fallo}</p>}
          <a href="/programacion" onClick={ir}>Revisar y reintentar en Programación</a>
        </div>
      )}
      {ver.aprobadas && (
        <div className="notice" style={{ display: "block", marginBottom: "var(--sp-2)" }}>
          <div className="dia-aviso-cabecera">
            <p style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
              <Icon name="checkSquare" size={16} />
              {[
                nProgramar && `${nProgramar} ${nProgramar === 1 ? "aprobada" : "aprobadas"} por programar`,
                nProducir && `${nProducir} ${nProducir === 1 ? "idea aprobada" : "ideas aprobadas"} por producir`,
              ].filter(Boolean).join(" · ")}
            </p>
            {botonOcultar("aprobadas")}
          </div>
          <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", margin: "var(--sp-1) 0" }}>
            Lo aprobado no sale solo: revísalo y dale el paso final.
          </p>
          <a href="/programacion" onClick={ir}>Revisar y programar en Programación</a>
        </div>
      )}
      {ver.aMano && (
        <div className="notice notice-warn" style={{ display: "block", marginBottom: "var(--sp-2)" }}>
          <div className="dia-aviso-cabecera">
            <p style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
              <Icon name="photo" size={16} /> Hoy toca publicar a mano ({aMano.length})
            </p>
            {botonOcultar("aMano")}
          </div>
          <ul style={{ margin: "var(--sp-1) 0 0 var(--sp-4)", fontSize: "var(--fs-2xs)" }}>
            {aMano.map((x) => (
              <li key={x.post.id}>
                <a href={`/a-mano/${x.calendario.dbId || x.calendario.id}/${x.post.id}`} onClick={(e) => { e.preventDefault(); navegar(`/a-mano/${encodeURIComponent(x.calendario.dbId || x.calendario.id)}/${encodeURIComponent(x.post.id)}`); }}>
                  {x.cuando ? horaDe(x.cuando) : ""} · {x.cliente.name}: {x.post.title || x.post.idea || "publicación"}
                </a>
                {x.atrasada ? " (atrasada)" : ""}{x.post.notaAsistida ? ` — ${x.post.notaAsistida}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hoy.length > 0 && (
        <p style={{ fontSize: "var(--fs-2xs)", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          <Icon name="clock" size={14} />
          Hoy {hoy.length === 1 ? "sale 1 publicación" : `salen ${hoy.length} publicaciones`}; la próxima a las {horaDe(hoy[0].programadaPara)} ({linea(hoy[0])}).
          <a href="/programacion" onClick={ir}>Ver la cola</a>
        </p>
      )}
      {nOcultos > 0 && (
        <p style={{ fontSize: "var(--fs-3xs)", color: "var(--text-faint)", margin: 0 }}>
          {nOcultos === 1 ? "Un aviso oculto" : `${nOcultos} avisos ocultos`}: vuelven si cambia algo, y siguen en <a href="/programacion" onClick={ir}>Programación</a>.
        </p>
      )}
    </section>
  );
}
