import { useState, useEffect, useId, useMemo, useRef } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import RepasoAtrasadas from "./RepasoAtrasadas";
import { useRepaso } from "../hooks/useRepaso";
import { Avatar } from "./Presencia";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useTareas, hecha, claveTarea, esDe } from "../hooks/useTareas";
import { useEquipo, miembroDe } from "../hooks/useEquipo";
import { clasificar, fechaEnZona, textoAtraso, textoFecha, partirNotas, empresaDelPrefijo, sumarDias } from "../lib/agenda";
import { navegar } from "../lib/rutas";
import "./PanelTareas.css";

// ============================================================
// Las tareas al lado, como Google Tasks
//
// Un panel a la derecha que se queda abierto mientras se trabaja en el
// calendario: desde 1280 px se ACOPLA (el contenido se aparta, sin fondo
// oscuro, como el asistente) y por debajo es un cajón. Comparte el sitio
// con el asistente: uno a la vez, que los dos juntos aplastarían el
// calendario.
//
// «Hoy» va siempre abierto y no se pliega: es lo que hay que ver desde
// cualquier pantalla, para uno y para el equipo. Atrasadas, Próximas,
// Sin fecha y Hechas hoy se pliegan, y cada cual recuerda cómo las dejó.
//
// La lógica (marcar, pasar a hoy, mover, convertir notas) es la de «Mi
// día»: `useTareas`. Aquí sólo se pinta.
// ============================================================

const PLEGADOS_INICIALES = { atrasadas: false, proximas: true, sinFecha: true, hechasHoy: true };

function leerLocal(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? porDefecto : JSON.parse(v);
  } catch { return porDefecto; }
}
function guardarLocal(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}

export default function PanelTareas({ clients = [], pulso = 0, yo = null, clienteActual = null, acoplado = false, onCerrar, onSelectClient }) {
  const ref = useDialogA11y(onCerrar, { activo: !acoplado });
  const tituloId = useId();
  const quienId = useId();
  const hoy = fechaEnZona();
  const t = useTareas(pulso);
  const miembros = useEquipo(pulso);
  // De quién se ven: «mias», «equipo» o el id de una persona.
  const [quien, setQuien] = useState(() => leerLocal("panel-tareas:quien", "mias"));
  const [plegados, setPlegados] = useState(() => ({ ...PLEGADOS_INICIALES, ...leerLocal("panel-tareas:plegados", {}) }));
  const [abierta, setAbierta] = useState(null);
  const [aviso, setAviso] = useState(null);
  const repaso = useRepaso(yo?.id, hoy);

  useEffect(() => { guardarLocal("panel-tareas:quien", quien); }, [quien]);
  useEffect(() => { guardarLocal("panel-tareas:plegados", plegados); }, [plegados]);

  const nombreDe = useMemo(() => {
    const m = new Map();
    for (const c of clients) { m.set(c.id, c.name); if (c.dbId) m.set(c.dbId, c.name); }
    return (id) => m.get(id) ?? "";
  }, [clients]);

  const persona = quien === "mias" ? yo : quien === "equipo" ? null : (() => {
    const m = miembroDe(miembros, quien);
    return m ? { id: m.userId, nombre: m.nombre } : null;
  })();
  // «Mías» lleva también lo que no lleva nadie: en un equipo pequeño, lo
  // sin asignar es de todos, y si no se viera aquí no lo vería nadie.
  const visibles = quien === "equipo" ? t.todas : t.todas.filter((x) => esDe(x, persona, { sinAsignar: quien === "mias" }));
  const bloques = clasificar(visibles, hoy, { foco: clienteActual });
  const nHoy = bloques.hoy.length;

  const alternarPlegado = (k) => setPlegados((p) => ({ ...p, [k]: !p[k] }));

  const convertir = async (tarea) => {
    const n = await t.convertir(tarea);
    setAbierta(null);
    if (n) setAviso({ texto: `Se crearon ${n} ${n === 1 ? "tarea" : "tareas"}.`, tarea });
  };

  const fila = (item) => (
    <FilaTarea
      key={claveTarea(item.tarea)}
      item={item}
      hoy={hoy}
      empresa={item.tarea._rapida ? "" : nombreDe(item.tarea.client_id)}
      responsable={miembroDe(miembros, item.tarea.asignado_id)}
      verResponsable={quien === "equipo"}
      miembros={miembros}
      abierta={abierta === claveTarea(item.tarea)}
      onAbrir={() => setAbierta((a) => (a === claveTarea(item.tarea) ? null : claveTarea(item.tarea)))}
      acciones={t}
      onConvertir={() => convertir(item.tarea)}
      onEmpresa={() => onSelectClient?.(item.tarea.client_id)}
    />
  );

  const panel = (
      <div
        ref={ref}
        className="panel-tareas"
        role={acoplado ? "complementary" : "dialog"}
        aria-modal={acoplado ? undefined : "true"}
        aria-labelledby={tituloId}
      >
        <div className="panel-tareas-cabecera">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="panel-tareas-antetitulo">Tareas</p>
            <h2 id={tituloId} className="panel-tareas-titulo">Hoy{nHoy ? ` · ${nHoy}` : ""}</h2>
          </div>
          <button type="button" className="btn-icon" onClick={() => { navegar("/tareas"); if (!acoplado) onCerrar(); }} aria-label="Abrir Mi día en grande" title="Abrir en grande">
            <Icon name="external" size={18} />
          </button>
          <button type="button" className="btn-icon" onClick={onCerrar} aria-label="Cerrar las tareas" title="Cerrar">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="panel-tareas-filtro">
          <label htmlFor={quienId} className="sr-only">De quién</label>
          <select id={quienId} className="input panel-tareas-input" value={quien} onChange={(e) => setQuien(e.target.value)}>
            <option value="mias">Mías y sin asignar</option>
            <option value="equipo">Todo el equipo</option>
            {miembros.filter((m) => m.userId !== yo?.id).map((m) => (
              <option key={m.userId} value={m.userId}>{m.nombre}</option>
            ))}
          </select>
        </div>

        <div className="panel-tareas-cuerpo">
          {!yo?.soloLectura && (
            <AgregarTarea clients={clients} clienteActual={clienteActual} persona={persona} onCrear={t.crear} />
          )}

          {t.error && <p role="alert" className="notice notice-error" style={{ margin: "var(--sp-2) 0" }}>{t.error}</p>}
          {aviso && (
            <div role="status" className="notice panel-tareas-aviso">
              <span style={{ flex: "1 1 100%" }}>{aviso.texto} ¿Borras la de origen?</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await t.borrar(aviso.tarea); setAviso(null); }}>
                <Icon name="trash" size={14} /> Borrar «{aviso.tarea.title}»
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAviso(null)}>Dejarla</button>
            </div>
          )}

          {t.loading && <p className="panel-tareas-vacio">Cargando tareas…</p>}

          {!t.loading && repaso.pendiente && bloques.atrasadas.length > 0 && (
            <RepasoAtrasadas
              items={bloques.atrasadas}
              hoy={hoy}
              nombreDe={nombreDe}
              onMover={t.moverA}
              onHecha={t.alternarHecha}
              onCerrar={repaso.cerrar}
            />
          )}

          {!t.loading && (
            <>
              <section className="panel-tareas-bloque" aria-label="Hoy">
                {bloques.hoy.length === 0
                  ? <p className="panel-tareas-vacio">Nada para hoy. Escribe arriba o pulsa «Hoy» en cualquier tarea.</p>
                  : <ul className="panel-tareas-lista">{bloques.hoy.map(fila)}</ul>}
              </section>
              <Plegable titulo="Atrasadas" clave="atrasadas" items={bloques.atrasadas} plegados={plegados} onAlternar={alternarPlegado} fila={fila} peligro />
              <Plegable titulo="Próximas" clave="proximas" items={bloques.proximas} plegados={plegados} onAlternar={alternarPlegado} fila={fila} />
              <Plegable titulo="Sin fecha" clave="sinFecha" items={bloques.sinFecha} plegados={plegados} onAlternar={alternarPlegado} fila={fila} />
              <Plegable titulo="Hechas hoy" clave="hechasHoy" items={bloques.hechasHoy} plegados={plegados} onAlternar={alternarPlegado} fila={fila} />
            </>
          )}
        </div>
      </div>
  );

  if (acoplado) return <div className="panel-tareas-acoplado">{panel}</div>;
  return (
    <div className="overlay" style={{ justifyContent: "flex-end", alignItems: "stretch", padding: 0 }} onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      {panel}
    </div>
  );
}

function Plegable({ titulo, clave, items, plegados, onAlternar, fila, peligro = false }) {
  const id = useId();
  if (!items.length) return null;
  const abierto = !plegados[clave];
  return (
    <section className="panel-tareas-bloque">
      <button type="button" className="panel-tareas-plegable" aria-expanded={abierto} aria-controls={id} onClick={() => onAlternar(clave)}>
        <Icon name={abierto ? "chevronDown" : "chevronRight"} size={16} />
        <span style={{ color: peligro ? "var(--danger)" : undefined }}>{titulo}</span>
        <span className="panel-tareas-numero" data-peligro={peligro}>{items.length}</span>
      </button>
      {abierto && <ul id={id} className="panel-tareas-lista">{items.map(fila)}</ul>}
    </section>
  );
}

/**
 * «Agregar una tarea»: Enter y queda para hoy. «Dcasa: revisar copys» la
 * deja en Dcasa; si no, en la empresa elegida al lado (la que se está
 * mirando, o ninguna). Queda para quien se está mirando (las mías: mía;
 * todo el equipo: sin asignar).
 */
function AgregarTarea({ clients, clienteActual, persona, onCrear }) {
  const [texto, setTexto] = useState("");
  const [empresa, setEmpresa] = useState(clienteActual ?? "");
  const [enviando, setEnviando] = useState(false);
  const textoId = useId();
  const empresaId = useId();
  const entrada = useRef(null);

  useEffect(() => { setEmpresa(clienteActual ?? ""); }, [clienteActual]);

  const enviar = async (e) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    const { clienteId, titulo } = empresaDelPrefijo(limpio, clients);
    setEnviando(true);
    const fila = await onCrear({
      titulo,
      empresa: clienteId ?? empresa,
      today_date: fechaEnZona(),
      assigned_to: persona?.nombre ?? "",
    });
    setEnviando(false);
    if (fila) { setTexto(""); entrada.current?.focus(); }
  };

  return (
    <form className="panel-tareas-agregar" onSubmit={enviar}>
      <Icon name="plus" size={18} className="panel-tareas-agregar-icono" />
      <label htmlFor={textoId} className="sr-only">Agregar una tarea para hoy</label>
      <input
        ref={entrada}
        id={textoId}
        className="panel-tareas-agregar-texto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Agregar una tarea"
        autoComplete="off"
        enterKeyHint="done"
      />
      <label htmlFor={empresaId} className="sr-only">Empresa de la tarea</label>
      <select id={empresaId} className="panel-tareas-agregar-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} title="Empresa (o escribe «Empresa: tarea»)">
        <option value="">Sin empresa</option>
        {clients.map((c) => <option key={c.id} value={c.dbId || c.id}>{c.name}</option>)}
      </select>
    </form>
  );
}

function FilaTarea({ item, hoy, empresa, responsable, verResponsable, miembros, abierta, onAbrir, acciones, onConvertir, onEmpresa }) {
  const { tarea: t, fecha, atraso } = item;
  const esHecha = hecha(t);
  const detalleId = useId();
  const notas = (t.description ?? "").trim();
  const esHoy = fecha === hoy;

  return (
    <li className="panel-tarea" data-hecha={esHecha} data-atrasada={atraso > 0 && !esHecha}>
      <button
        type="button"
        className="panel-tarea-check"
        aria-pressed={esHecha}
        onClick={() => acciones.alternarHecha(t)}
        aria-label={esHecha ? `Reabrir: ${t.title}` : `Completar: ${t.title}`}
      >
        <Icon name={esHecha ? "checkCircle" : "circle"} size={20} />
      </button>
      <div className="panel-tarea-texto">
        <button type="button" className="panel-tarea-titulo" aria-expanded={abierta} aria-controls={detalleId} onClick={onAbrir}>
          {t.title}
        </button>
        {notas && !abierta && <p className="panel-tarea-notas">{notas}</p>}
        <div className="panel-tarea-meta">
          {!t._rapida && empresa && (
            <button type="button" className="dia-empresa" onClick={onEmpresa} title={`Abrir ${empresa}`}>
              <Icon name="building" size={10} /> {empresa}
            </button>
          )}
          {atraso > 0 && !esHecha && <span className="dia-atraso">{textoAtraso(atraso)}</span>}
          {!esHecha && fecha && !esHoy && atraso === 0 && <span>{textoFecha(fecha, hoy)}</span>}
          {verResponsable && (responsable
            ? <Avatar persona={responsable} tamano={18} />
            : t.assigned_to && <span>{t.assigned_to}</span>)}
        </div>
        {!esHecha && !abierta && (
          <div className="panel-tarea-acciones">
            {!esHoy && <button type="button" className="btn btn-ghost btn-sm" onClick={() => acciones.moverA(t, hoy)}>{atraso > 0 ? "Pasar a hoy" : "Hoy"}</button>}
            {esHoy && <button type="button" className="btn btn-ghost btn-sm" onClick={() => acciones.moverA(t, sumarDias(hoy, 1))}>Mañana</button>}
            <SelectorFecha value={null} onChange={(f) => f && acciones.moverA(t, f)} etiqueta={`Mover «${t.title}» a otro día`} vacio="Mover a…" prefijo="Para" />
          </div>
        )}
        {abierta && (
          <DetalleTarea id={detalleId} tarea={t} miembros={miembros} acciones={acciones} onConvertir={onConvertir} onCerrar={onAbrir} />
        )}
      </div>
    </li>
  );
}

/** Lo que se edita al abrir una tarea: título, notas, quién la lleva, fecha límite. */
function DetalleTarea({ id, tarea: t, miembros, acciones, onConvertir, onCerrar }) {
  const [titulo, setTitulo] = useState(t.title);
  const [notas, setNotas] = useState(t.description ?? "");
  const [borrar, setBorrar] = useState(false);
  const tituloId = useId();
  const notasId = useId();
  const llevaId = useId();
  const nVinetas = partirNotas(notas).tareas.length;

  const guardarTitulo = () => {
    const limpio = titulo.trim();
    if (limpio && limpio !== t.title) void acciones.actualizar(t, { title: limpio });
    else setTitulo(t.title);
  };
  const guardarNotas = () => {
    if (notas !== (t.description ?? "")) void acciones.actualizar(t, { description: notas });
  };

  return (
    <div id={id} className="panel-tarea-detalle">
      <label htmlFor={tituloId} className="sr-only">Título</label>
      <input id={tituloId} className="input panel-tareas-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={guardarTitulo} />
      <label htmlFor={notasId} className="panel-tarea-etiqueta">Notas</label>
      <textarea
        id={notasId}
        className="input"
        rows={Math.min(8, Math.max(3, notas.split("\n").length + 1))}
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        onBlur={guardarNotas}
        placeholder={"Detalles, o una lista:\n- primera cosa\n- segunda cosa"}
      />
      {nVinetas > 0 && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await acciones.actualizar(t, { description: notas }); onConvertir(); }}>
          <Icon name="list" size={14} /> Convertir en {nVinetas} {nVinetas === 1 ? "tarea" : "tareas"}
        </button>
      )}
      <div className="panel-tarea-detalle-fila">
        <label htmlFor={llevaId} className="panel-tarea-etiqueta">Lo lleva</label>
        <select id={llevaId} className="input panel-tareas-input" value={t.assigned_to ?? ""} onChange={(e) => acciones.actualizar(t, { assigned_to: e.target.value })}>
          <option value="">Nadie</option>
          {miembros.map((m) => <option key={m.userId} value={m.nombre}>{m.nombre}</option>)}
          {t.assigned_to && !miembros.some((m) => m.nombre === t.assigned_to) && <option value={t.assigned_to}>{t.assigned_to}</option>}
        </select>
      </div>
      <div className="panel-tarea-detalle-fila">
        <span className="panel-tarea-etiqueta">Fecha límite</span>
        <SelectorFecha value={t.due_date} onChange={(f) => acciones.actualizar(t, { due_date: f || null })} etiqueta={`Fecha límite de ${t.title}`} vacio="Sin fecha límite" />
      </div>
      <div className="panel-tarea-detalle-fila" style={{ justifyContent: "space-between" }}>
        {borrar ? (
          <span style={{ display: "inline-flex", gap: "var(--sp-2)", alignItems: "center" }}>
            ¿Borrarla?
            <button type="button" className="btn btn-danger btn-sm" onClick={() => acciones.borrar(t)}>Sí, borrar</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBorrar(false)}>No</button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBorrar(true)} disabled={t.recurrence && t.recurrence !== "none"} title={t.recurrence && t.recurrence !== "none" ? "Las recurrentes se borran desde la empresa" : undefined}>
            <Icon name="trash" size={14} /> Borrar
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrar}>Listo</button>
      </div>
    </div>
  );
}
