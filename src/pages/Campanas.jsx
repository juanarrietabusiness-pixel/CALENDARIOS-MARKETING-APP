import "./Campanas.css";
import { lazy, Suspense, useCallback, useEffect, useId, useState } from "react";
import Icon from "../components/Icon";
import { GraficaBarras } from "../components/Graficas";
import * as api from "../lib/anunciosApi";
import {
  RANGOS, OBJETIVOS, objetivoODAX, nombreObjetivo, resumenInsights, serieDiaria, estadoAnuncio, formatoMoneda,
  resumenPresupuesto,
} from "../lib/anuncios";
import { numeroCorto } from "../lib/resultados";

const AsistenteCampana = lazy(() => import("../components/anuncios/AsistenteCampana"));
const DialogoActivar = lazy(() => import("../components/anuncios/DialogoActivar"));
const Estratega = lazy(() => import("../components/anuncios/Estratega"));
const Diagnostico = lazy(() => import("../components/anuncios/Diagnostico"));

// ============================================================
// /campanas — los anuncios de Meta de cada cliente
//
// Arriba el cliente y su cuenta publicitaria; debajo las cifras de la
// cuenta en el rango (con el gasto por día), las campañas con su estado,
// objetivo, presupuesto, gasto y resultados, y cada una se abre para ver
// sus conjuntos y anuncios. «Nueva campaña» crea TODO en pausa; activar es
// del administrador, con un diálogo que enseña lo que se va a gastar.
// «Estratega» arma el plan (también para alguien de fuera) y lo lleva a
// «Nueva campaña» con todo puesto.
//
// Nada habla con Meta desde aquí: todo pasa por /api/anuncios.
// ============================================================

const CLAVE_CLIENTE = "anuncios:cliente";
const leerGuardado = () => { try { return localStorage.getItem(CLAVE_CLIENTE) ?? ""; } catch { return ""; } };
const guardar = (id) => { try { localStorage.setItem(CLAVE_CLIENTE, id); } catch { /* sin almacenamiento: da igual */ } };

const METRICAS_GRAFICA = [
  ["spend", "Gasto"], ["impressions", "Impresiones"], ["clicks", "Clics"], ["reach", "Alcance"],
];

const pct = (v) => (v == null ? "—" : `${v.toFixed(2)} %`);
const fechaCorta = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

function Estado({ status }) {
  const e = estadoAnuncio(status);
  return <span className="badge anu-estado" data-tono={e.tono}>{e.texto}</span>;
}

function Kpis({ r, moneda, conResultados = false, objetivo = null }) {
  const items = [
    ["Gasto", formatoMoneda(r.gasto, moneda)],
    ["Impresiones", numeroCorto(r.impresiones)],
    ["Alcance", numeroCorto(r.alcance)],
    ["Clics", numeroCorto(r.clics)],
    ["CPM", r.cpm == null ? "—" : formatoMoneda(r.cpm, moneda)],
    ["CPC", r.cpc == null ? "—" : formatoMoneda(r.cpc, moneda)],
    ["CTR", pct(r.ctr)],
    ...(conResultados ? [[OBJETIVOS[objetivoODAX(objetivo)]?.resultado ?? "Resultados", r.resultados == null ? "—" : numeroCorto(r.resultados)]] : []),
  ];
  return (
    <dl className="anu-kpis">
      {items.map(([k, v]) => <div key={k} className="anu-kpi"><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

function GraficaDias({ dias, periodo, titulo }) {
  const [metrica, setMetrica] = useState("spend");
  const nombre = METRICAS_GRAFICA.find(([m]) => m === metrica)?.[1] ?? "Gasto";
  return (
    <div className="anu-grafica">
      <div className="anu-grafica-cabeza">
        <h3>{titulo}</h3>
        <div className="segmented" role="group" aria-label="Qué se dibuja">
          {METRICAS_GRAFICA.map(([m, n]) => (
            <button key={m} type="button" className={`segmented-btn ${metrica === m ? "active" : ""}`} aria-pressed={metrica === m} onClick={() => setMetrica(m)}>{n}</button>
          ))}
        </div>
      </div>
      <GraficaBarras datos={serieDiaria(dias, metrica, periodo)} titulo={`${nombre} por día`} />
    </div>
  );
}

function DetalleCampana({ clientId, campana, rango, moneda }) {
  const [d, setD] = useState(null);
  const [fallo, setFallo] = useState("");
  useEffect(() => {
    let vivo = true;
    setD(null);
    api.detalleCampana(clientId, campana.id, rango).then((x) => vivo && setD(x)).catch((e) => vivo && setFallo(e.message));
    return () => { vivo = false; };
  }, [clientId, campana.id, rango]);

  if (fallo) return <p role="alert" className="notice notice-error">{fallo}</p>;
  if (!d) return <p className="hint" role="status">Cargando conjuntos y anuncios…</p>;
  return (
    <div className="anu-detalle">
      <GraficaDias dias={d.dias} periodo={d.periodo} titulo="Día a día" />
      <h3>Conjuntos de anuncios</h3>
      {d.conjuntos.length === 0 ? <p className="hint">Sin conjuntos.</p> : (
        <ul className="anu-sublista">
          {d.conjuntos.map((s) => {
            const r = resumenInsights(s.insights, campana.objetivo);
            return (
              <li key={s.id}>
                <div className="anu-fila-cabeza"><strong>{s.nombre}</strong> <Estado status={s.estado} /></div>
                <p className="hint">
                  {resumenPresupuesto({ ...s.presupuesto, inicio: s.inicio, fin: s.fin, moneda })} · gasto {formatoMoneda(r.gasto, moneda)} · {numeroCorto(r.resultados ?? 0)} {(OBJETIVOS[objetivoODAX(campana.objetivo)]?.resultado ?? "resultados").toLowerCase()}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <h3>Anuncios</h3>
      {d.anuncios.length === 0 ? <p className="hint">Sin anuncios.</p> : (
        <ul className="anu-sublista">
          {d.anuncios.map((a) => {
            const r = resumenInsights(a.insights, campana.objetivo);
            return (
              <li key={a.id} className="anu-anuncio">
                <span className="anu-miniatura">{a.miniatura ? <img src={a.miniatura} alt="" loading="lazy" /> : <Icon name="image" size={20} />}</span>
                <div className="anu-anuncio-texto">
                  <div className="anu-fila-cabeza"><strong>{a.titulo || a.nombre}</strong> <Estado status={a.estado} /></div>
                  {a.texto && <p className="anu-recorte">{a.texto}</p>}
                  <p className="hint">Gasto {formatoMoneda(r.gasto, moneda)} · {numeroCorto(r.impresiones)} impresiones · CTR {pct(r.ctr)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Campana({ c, clientId, rango, moneda, esAdmin, soloLectura, onPausar, onActivar }) {
  const [abierta, setAbierta] = useState(false);
  const ids = useId();
  const r = resumenInsights(c.insights, c.objetivo);
  const activa = c.status === "ACTIVE";
  const resultado = OBJETIVOS[objetivoODAX(c.objetivo)]?.resultado ?? "Resultados";
  return (
    <li className="anu-campana">
      <div className="anu-campana-cabeza">
        <div className="anu-campana-nombre">
          <strong>{c.nombre}</strong>
          <span className="anu-campana-meta">
            <Estado status={c.estado} /> {nombreObjetivo(c.objetivo)}
            {c.desdeApp && <span className="badge anu-app" title={`Creada por ${c.desdeApp.creadoPor || "alguien del equipo"}`}>Desde la app</span>}
          </span>
        </div>
        <div className="anu-campana-acciones">
          {!soloLectura && activa && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPausar(c)}><Icon name="pause" size={16} /> Pausar</button>
          )}
          {!soloLectura && !activa && esAdmin && c.status === "PAUSED" && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onActivar(c)}><Icon name="play" size={16} /> Activar</button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={abierta} aria-controls={`${ids}-d`} onClick={() => setAbierta((x) => !x)}>
            <Icon name={abierta ? "chevronUp" : "chevronDown"} size={16} /> {abierta ? "Cerrar" : "Ver"}
          </button>
        </div>
      </div>
      <dl className="anu-campana-cifras">
        <div><dt>Presupuesto</dt><dd>{c.presupuesto.diario != null ? `${formatoMoneda(c.presupuesto.diario, moneda)}/día` : c.presupuesto.total != null ? `${formatoMoneda(c.presupuesto.total, moneda)} total` : "—"}</dd></div>
        <div><dt>Gasto</dt><dd>{formatoMoneda(r.gasto, moneda)}</dd></div>
        <div><dt>{resultado}</dt><dd>{r.resultados == null ? "—" : numeroCorto(r.resultados)}</dd></div>
        <div><dt>Costo por resultado</dt><dd>{r.costoPorResultado == null ? "—" : formatoMoneda(r.costoPorResultado, moneda)}</dd></div>
        <div><dt>Fechas</dt><dd>{c.inicio ? fechaCorta(c.inicio) : "—"}{c.fin ? ` → ${fechaCorta(c.fin)}` : ""}</dd></div>
      </dl>
      <div id={`${ids}-d`} hidden={!abierta}>
        {abierta && <DetalleCampana clientId={clientId} campana={c} rango={rango} moneda={moneda} />}
      </div>
    </li>
  );
}

const ACCIONES = { crear: "creó", activar: "activó", pausar: "pausó" };

export default function Campanas({ clients = [], pulso = 0, yo = {}, onClienteNuevo = null }) {
  const ids = useId();
  const esAdmin = yo?.rol === "admin";
  const soloLectura = Boolean(yo?.soloLectura);
  const [estado, setEstado] = useState(null);
  const [clienteId, setClienteId] = useState(() => {
    const g = leerGuardado();
    return clients.some((c) => c.id === g) ? g : clients[0]?.id ?? "";
  });
  const [rango, setRango] = useState(30);
  const [datos, setDatos] = useState(null);
  const [stats, setStats] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [aviso, setAviso] = useState("");
  const [fallo, setFallo] = useState("");
  const [asistente, setAsistente] = useState(false); // false | true | { inicial } (el borrador del estratega)
  const [estratega, setEstratega] = useState(false);
  const [diagnostico, setDiagnostico] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);

  const cuenta = estado?.cuentas?.find((c) => c.clientId === clienteId) ?? null;
  const faltan = estado?.faltan ?? null;
  const listo = Boolean(estado?.conectado && cuenta && !(faltan?.length));

  const leerEstado = useCallback(() => api.estadoAnuncios().then(setEstado).catch((e) => setFallo(e.message)), []);

  // La vuelta de «Conceder permisos de anuncios» (Meta → /campanas?meta=…).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const meta = q.get("meta");
    if (!meta) return;
    window.history.replaceState({}, "", "/campanas");
    if (meta === "ok") {
      setAviso("Permisos de anuncios concedidos. Leyendo las cuentas publicitarias…");
      if (esAdmin) {
        api.sincronizarCuentas()
          .then((r) => setAviso(`Listo: ${r.total} cuenta${r.total === 1 ? "" : "s"} publicitaria${r.total === 1 ? "" : "s"}. Asigna la de cada cliente.`))
          .catch((e) => setFallo(e.message))
          .finally(() => void leerEstado());
      }
    } else {
      setFallo(q.get("motivo") || "Meta no dio los permisos.");
    }
  }, [esAdmin, leerEstado]);

  useEffect(() => { void leerEstado(); }, [leerEstado, pulso]);
  useEffect(() => { if (!clienteId && clients[0]) setClienteId(clients[0].id); }, [clients, clienteId]);

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    setDatos(null);
    setStats(null);
    api.historial(clienteId).then(setHistorial).catch(() => setHistorial([]));
    if (!listo) return;
    setFallo("");
    try {
      const [d, s] = await Promise.all([api.campanas(clienteId, rango), api.estadisticas(clienteId, rango)]);
      setDatos(d);
      setStats(s);
    } catch (e) {
      setFallo(e.message);
      setDatos({ campanas: [] });
    }
  }, [clienteId, rango, listo]);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const elegirCliente = (id) => { setClienteId(id); guardar(id); setAviso(""); setFallo(""); };
  const asignar = async (cuentaId) => {
    setFallo("");
    try {
      if (cuentaId) await api.asignarCuenta(cuentaId, clienteId);
      else if (cuenta) await api.asignarCuenta(cuenta.id, null);
      await leerEstado();
    } catch (e) { setFallo(e.message); }
  };
  const sincronizar = async () => {
    setSincronizando(true);
    setFallo("");
    try {
      const r = await api.sincronizarCuentas();
      setAviso(`Cuentas publicitarias al día: ${r.total}.`);
      await leerEstado();
    } catch (e) { setFallo(e.message); }
    setSincronizando(false);
  };
  const pausar = async (c) => {
    setFallo("");
    try {
      await api.pausarCampana(clienteId, c.id);
      setAviso(`«${c.nombre}» quedó en pausa.`);
      await cargar();
    } catch (e) { setFallo(e.message); }
  };
  // Sin `confirmado`, el servidor contesta 409 con lo que se va a gastar: eso es lo que enseña el diálogo.
  const pedirActivar = async (c) => {
    setFallo("");
    try {
      await api.activarCampana(clienteId, c.id, false);
      await cargar();
    } catch (e) {
      if (e.estado === 409 && e.datos?.confirmar) setConfirmar({ ...e.datos.confirmar, id: c.id });
      else setFallo(e.message);
    }
  };
  const activar = async () => {
    await api.activarCampana(clienteId, confirmar.id, true);
    setAviso(`«${confirmar.campana}» está activa. Meta la revisa antes de empezar a mostrarla.`);
    setConfirmar(null);
    await cargar();
  };

  const moneda = cuenta?.moneda ?? "USD";
  const total = stats ? resumenInsights(stats.total) : null;

  return (
    <div className="campanas">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1 className="page-title">Anuncios</h1>
            <p className="hint">Las campañas de Meta de cada cliente: cifras, conjuntos y anuncios. Lo que se crea aquí nace en pausa.</p>
          </div>
          <div className="page-header-actions">
            {esAdmin && estado?.conectado && !(faltan?.length) && (
              <button type="button" className="btn btn-secondary" onClick={sincronizar} disabled={sincronizando}>
                <Icon name="refresh" size={16} /> {sincronizando ? "Leyendo…" : "Actualizar cuentas"}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setDiagnostico(true)} disabled={!listo}>
              <Icon name="chart" size={16} /> Diagnóstico
            </button>
            {!soloLectura && (
              <button type="button" className="btn btn-secondary" onClick={() => setEstratega(true)}>
                <Icon name="sparkles" size={16} /> Estratega
              </button>
            )}
            {!soloLectura && (
              <button type="button" className="btn btn-primary" onClick={() => setAsistente(true)} disabled={!listo}>
                <Icon name="plus" size={16} /> Nueva campaña
              </button>
            )}
          </div>
        </div>
      </div>

      <div role="status" aria-live="polite">{aviso && <p className="notice notice-ok">{aviso}</p>}</div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}

      {estado && !estado.configurado && <p className="notice notice-warn">Falta configurar Meta en el servidor (META_APP_ID y META_APP_SECRET).</p>}
      {estado?.configurado && !estado.conectado && (
        <p className="notice notice-warn">Meta no está conectado. {esAdmin ? "Conéctalo en Ajustes → Integraciones." : "Pide al administrador que lo conecte en Ajustes → Integraciones."}</p>
      )}
      {estado?.conectado && faltan?.length > 0 && (
        <div className="notice notice-warn anu-permisos">
          <p>
            <strong>Faltan los permisos de anuncios</strong> ({faltan.join(", ")}). Meta los revisa aparte (App Review), por eso no
            entran al conectar Meta.
          </p>
          {esAdmin
            ? <a className="btn btn-primary btn-sm" href={api.urlConcederPermisos()}><Icon name="lock" size={16} /> Conceder permisos de anuncios</a>
            : <p>Pide al administrador que pulse «Conceder permisos de anuncios».</p>}
        </div>
      )}

      <div className="anu-barra">
        <div className="field">
          <label className="label" htmlFor={`${ids}-c`}>Cliente</label>
          <select id={`${ids}-c`} className="input" value={clienteId} onChange={(e) => elegirCliente(e.target.value)}>
            {clients.length === 0 && <option value="">Sin clientes</option>}
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-a`}>Cuenta publicitaria</label>
          <select id={`${ids}-a`} className="input" value={cuenta?.id ?? ""} onChange={(e) => void asignar(e.target.value)}
            disabled={soloLectura || !estado?.cuentas?.length}>
            <option value="">{estado?.cuentas?.length ? "Sin cuenta asignada" : "No hay cuentas: actualiza las cuentas"}</option>
            {(estado?.cuentas ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre || a.externoId} · {a.moneda}{a.clientId && a.clientId !== clienteId ? ` (de ${clients.find((c) => c.id === a.clientId)?.name ?? "otro cliente"})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="segmented anu-rango" role="group" aria-label="Periodo">
          {Object.keys(RANGOS).map((n) => (
            <button key={n} type="button" className={`segmented-btn ${rango === Number(n) ? "active" : ""}`} aria-pressed={rango === Number(n)} onClick={() => setRango(Number(n))}>
              {n} días
            </button>
          ))}
        </div>
      </div>

      {listo && (
        <>
          <section className="anu-tarjeta" aria-labelledby={`${ids}-cuenta`}>
            <h2 id={`${ids}-cuenta`}>La cuenta · {RANGOS[rango].nombre.toLowerCase()} · {moneda}</h2>
            {!stats ? <p className="hint" role="status">Cargando cifras…</p> : (
              <>
                <Kpis r={total} moneda={moneda} />
                <GraficaDias dias={stats.dias} periodo={stats.periodo} titulo="Día a día" />
              </>
            )}
          </section>

          <section className="anu-tarjeta" aria-labelledby={`${ids}-camp`}>
            <h2 id={`${ids}-camp`}>Campañas</h2>
            {!datos ? <p className="hint" role="status">Cargando campañas…</p> : datos.campanas.length === 0 ? (
              <p className="hint">Esta cuenta no tiene campañas. Crea la primera con «Nueva campaña».</p>
            ) : (
              <ul className="anu-campanas">
                {datos.campanas.map((c) => (
                  <Campana key={c.id} c={c} clientId={clienteId} rango={rango} moneda={moneda} esAdmin={esAdmin} soloLectura={soloLectura}
                    onPausar={pausar} onActivar={pedirActivar} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {historial.length > 0 && (
        <details className="anu-tarjeta anu-historial">
          <summary>Historial ({historial.length})</summary>
          <ul>
            {historial.map((h) => (
              <li key={h.id}>
                <strong>{h.nombre || "Alguien"}</strong> {ACCIONES[h.accion] ?? h.accion} «{h.detalle?.nombre ?? h.campanaId}»
                <span className="hint"> · {new Date(h.cuando).toLocaleString("es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                {h.detalle?.resumen && <span className="hint"> · {h.detalle.resumen}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Suspense fallback={null}>
        {asistente && cuenta && (
          <AsistenteCampana
            clientId={clienteId}
            cuenta={cuenta}
            inicial={asistente?.inicial ?? null}
            onClose={() => setAsistente(false)}
            onCreada={(r) => { setAsistente(false); setAviso(`«${r.nombre}» se creó en pausa. No gasta nada hasta que el administrador la active.`); void cargar(); }}
          />
        )}
        {estratega && (
          <Estratega clients={clients} clienteId={clienteId} cuentaLista={listo} moneda={moneda} zona={cuenta?.zona || "America/Panama"}
            onClienteNuevo={onClienteNuevo}
            onCrear={(borrador) => { setEstratega(false); setAsistente({ inicial: borrador }); }}
            onCerrar={() => setEstratega(false)} />
        )}
        {diagnostico && (
          <Diagnostico clientId={clienteId} moneda={moneda} esAdmin={esAdmin} soloLectura={soloLectura}
            onCambio={() => void cargar()} onCerrar={() => setDiagnostico(false)} />
        )}
        {confirmar && <DialogoActivar confirmar={confirmar} onConfirmar={activar} onClose={() => setConfirmar(null)} />}
      </Suspense>
    </div>
  );
}
