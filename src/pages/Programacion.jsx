import "./Programacion.css";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Icon from "../components/Icon";
import * as db from "../lib/db";
import { navegar } from "../lib/rutas";
import { REDES } from "../lib/publicacion";
import { filtrarCola, ordenarProgramacion, fechaHora, horaDe, TEXTO_ESTADO } from "../lib/cola";
import { FORMAT_ICONS } from "../constants";

// ============================================================
// Programación: lo que sale, en todas las cuentas
//
// La cola vivía repartida por los calendarios: para saber qué salía hoy
// había que abrir cliente por cliente, y lo que fallaba sólo se veía si
// alguien abría esa publicación. Aquí está todo, con lo que falló ARRIBA
// y su motivo, porque es lo único de esta página que pide hacer algo.
//
// Se relee con cada `pulso`: la cola la mueve el cron sin nadie delante,
// y cada paso avisa al espacio.
// ============================================================

const RANGOS = [[1, "Hoy"], [7, "7 días"], [30, "30 días"]];
const ESTADOS = [["", "Todo"], ["pendiente", "Por salir"], ["error", "No se publicó"], ["publicada", "Publicadas"]];

function Miniatura({ fila }) {
  return (
    <span className="prog-miniatura" data-formato={fila.formato}>
      {fila.miniatura
        ? <img src={fila.miniatura} alt="" loading="lazy" />
        : <Icon name={FORMAT_ICONS[fila.formato] || "formatPost"} size={18} />}
    </span>
  );
}

function Pieza({ fila, cliente }) {
  return (
    <span className="prog-pieza">
      <span className="prog-cliente">{cliente?.name ?? "Cliente borrado"}</span>
      <span className="prog-red">
        <Icon name={REDES[fila.red]?.icono ?? "globe"} size={13} />
        {REDES[fila.red]?.nombre ?? fila.red}
        {fila.variante === "historia" && <span className="badge prog-historia">historia</span>}
      </span>
    </span>
  );
}

export default function Programacion({ clients = [], pulso = 0, onAbrir }) {
  const ids = useId();
  const [filas, setFilas] = useState(null);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupada, setOcupada] = useState("");
  const [rango, setRango] = useState(7);
  const [cliente, setCliente] = useState("");
  const [red, setRed] = useState("");
  const [estado, setEstado] = useState("");

  const cargar = useCallback(() => db.listarProgramacion(14).then((f) => { setFilas(f); setFallo(""); }).catch((e) => setFallo(e.message)), []);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const porId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const vista = useMemo(
    () => ordenarProgramacion(filtrarCola(filas ?? [], { cliente, red, estado, rango })),
    [filas, cliente, red, estado, rango],
  );
  const redesUsadas = useMemo(() => [...new Set((filas ?? []).map((f) => f.red))], [filas]);
  const clientesUsados = useMemo(
    () => clients.filter((c) => (filas ?? []).some((f) => f.clientId === c.id)),
    [clients, filas],
  );

  const accion = async (fila, fn, hecho) => {
    setOcupada(fila.id);
    setAviso("");
    try {
      await fn(fila.id);
      setAviso(hecho);
      await cargar();
    } catch (e) {
      setAviso(e.message);
    }
    setOcupada("");
  };
  const reintentar = (f) => accion(f, db.reintentarPublicacion, "Reintentando. Si vuelve a fallar, sale arriba con el motivo.");
  const cancelar = (f, texto) => {
    if (!window.confirm(texto)) return;
    void accion(f, db.cancelarPublicacion, "Quitada de la cola.");
  };
  const abrir = (f) => onAbrir?.({ clientId: f.clientId, calendarId: f.calendarId, postId: f.postId });

  const total = vista.fallidas.length + vista.proximas.reduce((a, g) => a + g.filas.length, 0) + vista.publicadas.reduce((a, g) => a + g.filas.length, 0);

  return (
    <div className="programacion">
      <div className="page-header">
        <h1 className="page-title">Programación</h1>
        <p className="page-meta">Lo que sale en las cuentas de todos los clientes, a la hora de Panamá. Lo que no se pudo publicar va arriba.</p>
      </div>

      <div className="prog-filtros">
        <div className="segmented" role="group" aria-label="Cuántos días mirar">
          {RANGOS.map(([n, nombre]) => (
            <button key={n} type="button" className={`segmented-btn ${rango === n ? "active" : ""}`} aria-pressed={rango === n} onClick={() => setRango(n)}>
              {nombre}
            </button>
          ))}
        </div>
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
        <label className="sr-only" htmlFor={`${ids}-e`}>Estado</label>
        <select id={`${ids}-e`} className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
          {ESTADOS.map(([v, nombre]) => <option key={v} value={v}>{nombre}</option>)}
        </select>
      </div>

      <div role="status" aria-live="polite" className={aviso ? undefined : "sr-only"}>
        {aviso && <p className="notice notice-ok">{aviso}</p>}
      </div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      {!filas && !fallo && <p role="status" className="hint">Cargando la cola…</p>}

      {filas && total === 0 && (
        <div className="prog-vacio">
          <Icon name="clock" size={28} />
          <p>
            {filas.length
              ? "Nada con estos filtros."
              : "Todavía no hay nada programado. Programa desde una publicación, o usa «Programar lo aprobado» en el calendario de un cliente."}
          </p>
        </div>
      )}

      {vista.fallidas.length > 0 && (
        <section className="prog-bloque prog-fallidas" aria-labelledby={`${ids}-f`}>
          <h2 id={`${ids}-f`} className="prog-titulo">
            <Icon name="alert" size={16} /> No se publicaron ({vista.fallidas.length})
          </h2>
          <ul className="prog-lista">
            {vista.fallidas.map((f) => (
              <li key={f.id} className="prog-fila" data-estado="error">
                <Miniatura fila={f} />
                <div className="prog-cuerpo">
                  <Pieza fila={f} cliente={porId.get(f.clientId)} />
                  <p className="prog-texto">{f.titulo || "Sin título"}</p>
                  <p className="prog-cuando">Tocaba el {fechaHora(f.programadaPara)}{f.intentos > 1 ? ` · ${f.intentos} intentos` : ""}</p>
                  <p className="prog-motivo">{f.error || "Falló sin motivo conocido."}</p>
                </div>
                <div className="prog-acciones">
                  <button type="button" className="btn btn-primary btn-sm" disabled={ocupada === f.id} onClick={() => reintentar(f)}>
                    <Icon name="refresh" size={14} /> Reintentar
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrir(f)}>Abrir</button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada === f.id} onClick={() => cancelar(f, "¿Descartar esta publicación fallida? No se volverá a intentar.")}>
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vista.proximas.map((g) => (
        <section key={g.fecha} className="prog-bloque" aria-labelledby={`${ids}-d-${g.fecha}`}>
          <h2 id={`${ids}-d-${g.fecha}`} className="prog-titulo">
            {g.nombre} <span className="prog-cuenta">{g.filas.length} {g.filas.length === 1 ? "pieza" : "piezas"}</span>
          </h2>
          <ul className="prog-lista">
            {g.filas.map((f) => (
              <li key={f.id} className="prog-fila" data-estado={f.estado}>
                <span className="prog-hora">{horaDe(f.programadaPara)}</span>
                <Miniatura fila={f} />
                <div className="prog-cuerpo">
                  <Pieza fila={f} cliente={porId.get(f.clientId)} />
                  <p className="prog-texto">{f.titulo || "Sin título"}</p>
                  {f.estado === "procesando" && <p className="prog-cuando">Publicando ahora…</p>}
                  {f.error && f.estado === "programada" && <p className="prog-cuando">Reintento pendiente: {f.error}</p>}
                </div>
                <div className="prog-acciones">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrir(f)}>Abrir</button>
                  {f.estado === "programada" && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada === f.id} onClick={() => cancelar(f, "¿Quitar esta publicación de la cola? No saldrá.")}>
                      Cancelar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {vista.publicadas.length > 0 && (
        <section className="prog-bloque" aria-labelledby={`${ids}-p`}>
          <h2 id={`${ids}-p`} className="prog-titulo">Publicadas <span className="prog-cuenta">últimos 14 días</span></h2>
          {vista.publicadas.map((g) => (
            <div key={g.fecha}>
              <h3 className="prog-subtitulo">{g.nombre}</h3>
              <ul className="prog-lista">
                {g.filas.map((f) => (
                  <li key={f.id} className="prog-fila" data-estado="publicada">
                    <span className="prog-hora">{horaDe(f.publicadaAt ?? f.programadaPara)}</span>
                    <Miniatura fila={f} />
                    <div className="prog-cuerpo">
                      <Pieza fila={f} cliente={porId.get(f.clientId)} />
                      <p className="prog-texto">{f.titulo || "Sin título"}</p>
                      {f.aviso && <p className="prog-cuando">{f.aviso}</p>}
                    </div>
                    <div className="prog-acciones">
                      <span className="badge badge-cola" data-estado="publicada"><Icon name="check" size={12} /> {TEXTO_ESTADO.publicada}</span>
                      {f.enlace && (
                        <a className="btn btn-ghost btn-sm" href={f.enlace} target="_blank" rel="noreferrer">
                          Ver <Icon name="link" size={14} /><span className="sr-only"> (se abre en otra pestaña)</span>
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <p className="hint">
        ¿Falta algo? Las publicaciones aprobadas que aún no están en la cola se programan de una vez desde el calendario del cliente
        {" "}(«Programar lo aprobado»). <a href="/ajustes#integraciones" onClick={(e) => { e.preventDefault(); navegar("/ajustes#integraciones"); }}>Cuentas conectadas</a>.
      </p>
    </div>
  );
}
