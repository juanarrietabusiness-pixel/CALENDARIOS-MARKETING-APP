import "./Programacion.css";
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import * as db from "../lib/db";
import { navegar } from "../lib/rutas";
import { REDES } from "../lib/publicacion";
import {
  fechaHora, TEXTO_ESTADO, asistidasPendientes, pestanasProgramacion, cifraCorta, PESTANAS_PROGRAMACION, FORMATOS_PROGRAMACION,
} from "../lib/cola";
import { FORMAT_ICONS } from "../constants";
import PorProgramar from "../components/PorProgramar";

// Las historias automáticas, en su chunk: sólo las mira quien abre esta página.
const HistoriasAutomaticas = lazy(() => import("../components/HistoriasAutomaticas"));
// «Versión para anuncio» de lo ya publicado (lib/pauta.js), en su chunk: sólo al pulsarla.
const VersionAnuncio = lazy(() => import("../components/VersionAnuncio"));

// ============================================================
// Producción (era «Programación»; `/programacion` sigue abriéndola), como en Meta Business Suite
//
// Cuatro pestañas —Por producir, Publicadas, Programadas, No publicadas—, los
// filtros en una fila (texto, cliente, red, formato, cuántos días) y una tabla:
// lo aprobado que falta programar y las ideas aprobadas por producir (fase 7:
// eran un bloque dentro de «No publicadas»), lo publicado con sus cifras
// (alcance, visualizaciones, interacciones), lo programado con «Publicar
// ahora» y «Cancelar» (también varias a la vez), y lo que no salió con su
// motivo y lo que va a mano.
//
// Se relee con cada `pulso`: la cola la mueve el cron sin nadie delante, y cada
// paso avisa al espacio. Borrar de Instagram lo ya publicado NO se puede por la
// API: aquí se cancela lo que aún no salió.
// ============================================================

const RANGOS = [[7, "Últimos 7 días"], [30, "Últimos 30 días"], [90, "Últimos 90 días"]];

function Miniatura({ fila }) {
  return (
    <span className="prog-miniatura" data-formato={fila.formato}>
      {fila.miniatura
        ? <img src={fila.miniatura} alt="" loading="lazy" />
        : <Icon name={FORMAT_ICONS[fila.formato] || "formatPost"} size={18} />}
      <span className="prog-miniatura-red" title={REDES[fila.red]?.nombre ?? fila.red}><Icon name={REDES[fila.red]?.icono ?? "globe"} size={12} /></span>
    </span>
  );
}

/** La celda de la publicación: miniatura, texto, cliente, red y formato. */
function Publicacion({ fila, cliente }) {
  const formato = FORMATOS_PROGRAMACION.find(([k]) => k === fila.formato)?.[1] ?? "Post";
  return (
    <div className="prog-publicacion">
      <Miniatura fila={fila} />
      <div className="prog-cuerpo">
        <p className="prog-texto">{fila.titulo || "Sin título"}</p>
        <p className="prog-pieza">
          <span className="prog-cliente">{cliente?.name ?? "Cliente borrado"}</span>
          <span className="prog-red"><Icon name={REDES[fila.red]?.icono ?? "globe"} size={13} /> {REDES[fila.red]?.nombre ?? fila.red}</span>
          <span>{formato}</span>
          {fila.calendarId === null && fila.formato === "historia" && <span className="badge prog-historia">automática</span>}
        </p>
      </div>
    </div>
  );
}

/** Las pestañas: «Por producir» (fase 7) y las de la cola (lib/cola.js). */
const PESTANAS = [["producir", "Por producir"], ...PESTANAS_PROGRAMACION];

export default function Programacion({ clients = [], pulso = 0, onAbrir, onSubir, onCalendarioGuardado, soltarPendiente }) {
  const ids = useId();
  const [filas, setFilas] = useState(null);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupada, setOcupada] = useState("");
  // «Por producir» primero (fase 7: esta página es «Producción»): lo aprobado por programar y las ideas por producir.
  const [pestana, setPestana] = useState("producir");
  const [porProducir, setPorProducir] = useState(null);
  const [dias, setDias] = useState(30);
  const [cliente, setCliente] = useState("");
  const [red, setRed] = useState("");
  const [formato, setFormato] = useState("");
  const [texto, setTexto] = useState("");
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [version, setVersion] = useState(null);

  // Al entrar, si algo NO se publicó, se abre esa pestaña: es lo único que pide hacer algo (y adonde llevan los avisos
  // de Mi día y el número rojo de la navegación). Después manda lo que escoja la persona.
  const primera = useRef(true);
  const cargar = useCallback(() => db.listarProgramacion(dias).then((f) => {
    setFilas(f);
    setFallo("");
    if (primera.current) {
      primera.current = false;
      if (f.some((x) => x.estado === "error")) setPestana("no");
    }
  }).catch((e) => setFallo(e.message)), [dias]);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const porId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const vista = useMemo(() => pestanasProgramacion(filas ?? [], { cliente, red, formato, texto, dias }), [filas, cliente, red, formato, texto, dias]);
  const redesUsadas = useMemo(() => [...new Set((filas ?? []).map((f) => f.red))], [filas]);
  const clientesUsados = useMemo(() => clients.filter((c) => (filas ?? []).some((f) => f.clientId === c.id)), [clients, filas]);

  // Lo que se publica a mano sale de los calendarios, no de la cola: va en «No publicadas» (hay que hacerlo).
  const aMano = useMemo(
    () => (red || (formato && formato !== "post") ? [] : asistidasPendientes(clients, undefined, 7).filter((x) => !cliente || x.cliente.id === cliente)),
    [clients, cliente, red, formato],
  );

  const accion = async (fila, fn, hecho) => {
    setOcupada(fila.id);
    setAviso("");
    try {
      await fn(fila);
      setAviso(hecho);
      await cargar();
    } catch (e) {
      setAviso(e.message);
    }
    setOcupada("");
  };
  const reintentar = (f) => accion(f, (x) => db.reintentarPublicacion(x.id), "Reintentando. Si vuelve a fallar, sigue en «No publicadas» con el motivo.");
  const cancelar = (f, pregunta, hecho = "Quitada de la cola.") => {
    if (!window.confirm(pregunta)) return;
    void accion(f, (x) => db.cancelarPublicacion(x.id), hecho);
  };
  const publicarYa = (f) => {
    if (!window.confirm("¿Publicarla AHORA en la cuenta del cliente? Sale en un par de minutos y no se puede deshacer.")) return;
    void accion(f, (x) => db.publicar({ calendarId: x.calendarId, postId: x.postId, redes: [x.red], ahora: true }), "Publicándose ahora. Pasa a «Publicadas» cuando salga.");
  };
  const abrir = (f) => onAbrir?.({ clientId: f.clientId, calendarId: f.calendarId, postId: f.postId });
  /** La publicación de una fila en su calendario (para «Versión para anuncio»), o null. */
  const publicacionDe = (f) => {
    const c = porId.get(f.clientId);
    for (const cal of c?.calendars ?? []) {
      if (cal.id !== f.calendarId && cal.dbId !== f.calendarId) continue;
      for (const d of cal.days ?? []) {
        const post = (d.posts ?? []).find((x) => x.id === f.postId);
        if (post) return { client: c, cal, post, day: d };
      }
    }
    return null;
  };

  const alternar = (id) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cancelarMarcadas = async () => {
    const lista = vista.programadas.filter((f) => marcadas.has(f.id) && f.estado === "programada");
    if (!lista.length || !window.confirm(`¿Quitar ${lista.length === 1 ? "esta publicación" : `estas ${lista.length} publicaciones`} de la cola? No saldrán.`)) return;
    setOcupada("varias");
    let bien = 0;
    for (const f of lista) {
      try { await db.cancelarPublicacion(f.id); bien++; } catch { /* sigue con las demás */ }
    }
    setMarcadas(new Set());
    setAviso(`${bien} de ${lista.length} quitadas de la cola.`);
    await cargar();
    setOcupada("");
  };

  const cuentaNo = vista.cuentas.no + aMano.length;
  const cuentas = { ...vista.cuentas, no: cuentaNo, producir: porProducir ?? "" };

  return (
    <div className="programacion">
      <div className="page-header">
        <div className="page-header-top">
          <h1 className="page-title">Producción</h1>
          {onSubir && (
            <div className="page-header-actions">
              <button type="button" className="btn btn-primary" onClick={onSubir}>
                <Icon name="upload" size={18} /> Programar contenido
              </button>
            </div>
          )}
        </div>
        <p className="page-meta">Lo que está por producir y la cola de todos los clientes: lo que sale, lo que salió y lo que falló, a la hora de Panamá.</p>
      </div>

      <div className="prog-pestanas" role="tablist" aria-label="Qué mirar" onKeyDown={(e) => {
        // Pestañas: las flechas pasan a la de al lado (el patrón de pestañas de WAI-ARIA).
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = PESTANAS.findIndex(([k]) => k === pestana);
        const sig = PESTANAS[(i + (e.key === "ArrowRight" ? 1 : PESTANAS.length - 1)) % PESTANAS.length][0];
        setPestana(sig);
        setMarcadas(new Set());
        document.getElementById(`${ids}-t-${sig}`)?.focus();
      }}>
        {PESTANAS.map(([k, nombre]) => (
          <button key={k} type="button" role="tab" id={`${ids}-t-${k}`} aria-selected={pestana === k} aria-controls={`${ids}-p-${k}`} tabIndex={pestana === k ? 0 : -1}
            className="prog-pestana" data-aviso={k === "no" && cuentaNo > 0 ? "si" : undefined} onClick={() => { setPestana(k); setMarcadas(new Set()); }}>
            {nombre} <span className="prog-cuenta">{filas ? cuentas[k] : ""}</span>
          </button>
        ))}
      </div>

      {/* Los filtros son de la cola: «Por producir» tiene los suyos (cada publicación con su revisión). */}
      <div className="prog-filtros" hidden={pestana === "producir"}>
        <label className="sr-only" htmlFor={`${ids}-q`}>Buscar por texto</label>
        <input id={`${ids}-q`} className="input prog-buscar" type="search" placeholder="Buscar por texto" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <label className="sr-only" htmlFor={`${ids}-c`}>Cliente</label>
        <select id={`${ids}-c`} className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientesUsados.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-r`}>Red</label>
        <select id={`${ids}-r`} className="input" value={red} onChange={(e) => setRed(e.target.value)}>
          <option value="">Todas las redes</option>
          {redesUsadas.map((r) => <option key={r} value={r}>{REDES[r]?.nombre ?? r}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-f`}>Formato</label>
        <select id={`${ids}-f`} className="input" value={formato} onChange={(e) => setFormato(e.target.value)}>
          <option value="">Todos los formatos</option>
          {FORMATOS_PROGRAMACION.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        {pestana === "publicadas" && (
          <>
            <label className="sr-only" htmlFor={`${ids}-d`}>Cuántos días</label>
            <select id={`${ids}-d`} className="input" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {RANGOS.map(([n, nombre]) => <option key={n} value={n}>{nombre}</option>)}
            </select>
          </>
        )}
      </div>

      <div role="status" aria-live="polite" className={aviso ? undefined : "sr-only"}>
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      {!filas && !fallo && <p role="status" className="hint">Cargando la cola…</p>}

      {/* Siempre montado (escondido fuera de su pestaña): su cifra va en la pestaña aunque se mire otra. */}
      <section id={`${ids}-p-producir`} role="tabpanel" aria-labelledby={`${ids}-t-producir`} hidden={pestana !== "producir"}>
        <PorProgramar clients={clients} pulso={pulso} onAbrir={onAbrir} onCalendarioGuardado={onCalendarioGuardado} soltarPendiente={soltarPendiente} onProgramado={cargar} onCuenta={setPorProducir} />
        {porProducir === 0 && <Vacio texto="Nada por producir ni por programar: lo aprobado ya está en la cola, y no hay ideas aprobadas esperando su pieza." />}
      </section>

      {filas && pestana === "publicadas" && (
        <section id={`${ids}-p-publicadas`} role="tabpanel" aria-labelledby={`${ids}-t-publicadas`}>
          {vista.publicadas.length ? (
            <table className="prog-tabla">
              <thead>
                <tr>
                  <th scope="col">Publicación</th>
                  <th scope="col">Fecha de publicación</th>
                  <th scope="col" className="prog-num">Alcance</th>
                  <th scope="col" className="prog-num">Visualizaciones</th>
                  <th scope="col" className="prog-num">Interacciones</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {vista.publicadas.map((f) => (
                  <tr key={f.id}>
                    <td><Publicacion fila={f} cliente={porId.get(f.clientId)} />{f.aviso && <p className="prog-cuando">{f.aviso}</p>}</td>
                    <td data-etiqueta="Publicada">{fechaHora(f.publicadaAt ?? f.programadaPara)}</td>
                    <td className="prog-num" data-etiqueta="Alcance">{cifraCorta(f.metricas?.alcance)}</td>
                    <td className="prog-num" data-etiqueta="Visualizaciones">{cifraCorta(f.metricas?.vistas)}</td>
                    <td className="prog-num" data-etiqueta="Interacciones">{cifraCorta(f.metricas?.interacciones)}</td>
                    <td className="prog-acciones">
                      {f.enlace && (
                        <a className="btn btn-ghost btn-sm" href={f.enlace} target="_blank" rel="noreferrer">
                          Ver <Icon name="link" size={14} /><span className="sr-only"> (se abre en otra pestaña)</span>
                        </a>
                      )}
                      {f.calendarId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(f)}>Abrir</button>}
                      {/* Pautarla después: el motor escribe su texto como anuncio y sus textos aparte, para copiar. */}
                      {f.calendarId && f.variante !== "historia" && publicacionDe(f) && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVersion(publicacionDe(f))}
                          title="El texto de esta pieza escrito como anuncio y sus textos de anuncio aparte, para copiar">
                          <Icon name="megaphone" size={14} /> Versión para anuncio
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Vacio texto="Nada publicado con estos filtros en estos días." />}
          <p className="hint">Las cifras salen de la foto diaria de métricas: lo publicado hoy se mide mañana. «—» es que aún no se midió.</p>
        </section>
      )}

      {filas && pestana === "programadas" && (
        <section id={`${ids}-p-programadas`} role="tabpanel" aria-labelledby={`${ids}-t-programadas`}>
          {marcadas.size > 0 && (
            <div className="prog-seleccion" role="group" aria-label="Con las marcadas">
              <span>{marcadas.size} {marcadas.size === 1 ? "marcada" : "marcadas"}</span>
              <button type="button" className="btn btn-danger btn-sm" disabled={ocupada === "varias"} onClick={cancelarMarcadas}>
                <Icon name="trash" size={14} /> Quitar de la cola
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMarcadas(new Set())}>Desmarcar</button>
            </div>
          )}
          {vista.programadas.length ? (
            <table className="prog-tabla">
              <thead>
                <tr>
                  <th scope="col" className="prog-marca"><span className="sr-only">Marcar</span></th>
                  <th scope="col">Publicación</th>
                  <th scope="col">Sale</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {vista.programadas.map((f) => (
                  <tr key={f.id} data-estado={f.estado}>
                    <td className="prog-marca">
                      {f.estado === "programada" && (
                        <input type="checkbox" checked={marcadas.has(f.id)} onChange={() => alternar(f.id)} aria-label={`Marcar «${f.titulo || "publicación"}»`} />
                      )}
                    </td>
                    <td><Publicacion fila={f} cliente={porId.get(f.clientId)} />{f.error && <p className="prog-cuando">Reintento pendiente: {f.error}</p>}</td>
                    <td data-etiqueta="Sale">{fechaHora(f.programadaPara)}</td>
                    <td data-etiqueta="Estado"><span className="badge badge-cola" data-estado={f.estado}>{f.estado === "procesando" ? "Publicándose…" : TEXTO_ESTADO.programada}</span></td>
                    <td className="prog-acciones">
                      {f.calendarId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrir(f)}>Abrir</button>}
                      {f.estado === "programada" && f.calendarId && (
                        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupada === f.id} onClick={() => publicarYa(f)}>Publicar ahora</button>
                      )}
                      {f.estado === "programada" && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada === f.id} aria-label={`Cancelar «${f.titulo || "publicación"}»`}
                          onClick={() => cancelar(f, "¿Quitar esta publicación de la cola? No saldrá.")}>
                          <Icon name="trash" size={14} /> Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Vacio texto={(filas ?? []).length ? "Nada programado con estos filtros." : "Todavía no hay nada programado. Programa desde una publicación o desde «Por producir → Aprobadas, por programar»."} />}
          <p className="hint">Para cambiar el día o la hora, ábrela: «¿Cuándo sale?» la reprograma.</p>
        </section>
      )}

      {filas && pestana === "no" && (
        <section id={`${ids}-p-no`} role="tabpanel" aria-labelledby={`${ids}-t-no`} className="prog-no">
          {vista.no.length > 0 && (
            <div className="prog-bloque">
              <h2 className="prog-titulo prog-titulo-error"><Icon name="alert" size={16} /> No se pudieron publicar ({vista.no.length})</h2>
              <table className="prog-tabla">
                <thead>
                  <tr><th scope="col">Publicación</th><th scope="col">Tocaba</th><th scope="col">Motivo</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
                </thead>
                <tbody>
                  {vista.no.map((f) => (
                    <tr key={f.id} data-estado="error">
                      <td><Publicacion fila={f} cliente={porId.get(f.clientId)} /></td>
                      <td data-etiqueta="Tocaba">{fechaHora(f.programadaPara)}{f.intentos > 1 ? ` · ${f.intentos} intentos` : ""}</td>
                      <td data-etiqueta="Motivo" className="prog-motivo">{f.error || "Falló sin motivo conocido."}</td>
                      <td className="prog-acciones">
                        <button type="button" className="btn btn-primary btn-sm" disabled={ocupada === f.id} onClick={() => reintentar(f)}><Icon name="refresh" size={14} /> Reintentar</button>
                        {f.calendarId && <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrir(f)}>Abrir</button>}
                        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada === f.id} onClick={() => cancelar(f, "¿Descartar esta publicación fallida? No se volverá a intentar.", "Descartada.")}>Descartar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {aMano.length > 0 && (
            <div className="prog-bloque">
              <h2 className="prog-titulo"><Icon name="photo" size={16} /> Para publicar a mano ({aMano.length})</h2>
              <ul className="prog-lista">
                {aMano.map((x) => (
                  <li key={x.post.id} className="prog-fila" data-estado={x.atrasada ? "error" : "programada"}>
                    <div className="prog-cuerpo">
                      <span className="prog-pieza"><span className="prog-cliente">{x.cliente.name}</span> {fechaHora(x.cuando)}{x.atrasada ? " · atrasada" : ""}</span>
                      <p className="prog-texto">{x.post.title || x.post.idea || "Sin título"}</p>
                      {x.post.notaAsistida && <p className="prog-cuando">A mano: {x.post.notaAsistida}</p>}
                    </div>
                    <div className="prog-acciones">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => navegar(`/a-mano/${encodeURIComponent(x.calendario.dbId || x.calendario.id)}/${encodeURIComponent(x.post.id)}`)}>
                        Publicarla
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!vista.no.length && !aMano.length && <p className="hint">Nada falló ni espera a mano. Lo aprobado por el cliente que falta programar está en «Por producir».</p>}
        </section>
      )}

      <Suspense fallback={null}>
        <HistoriasAutomaticas clients={clients} onCambio={cargar} />
      </Suspense>
      {version && (
        <Suspense fallback={null}>
          <VersionAnuncio {...version} onClose={() => setVersion(null)} />
        </Suspense>
      )}

      <p className="hint">
        <a href="/ajustes#integraciones" onClick={(e) => { e.preventDefault(); navegar("/ajustes#integraciones"); }}>Cuentas conectadas</a>
      </p>
    </div>
  );
}

function Vacio({ texto }) {
  return (
    <div className="prog-vacio">
      <Icon name="clock" size={28} />
      <p>{texto}</p>
    </div>
  );
}
