import "./Resultados.css";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Icon from "../components/Icon";
import { GraficaLinea, GraficaBarras } from "../components/Graficas";
import SeccionInformes from "../components/SeccionInformes";
import * as db from "../lib/db";
import { navegar } from "../lib/rutas";
import { fechaEnZona, sumarDias } from "../lib/agenda";
import { REDES } from "../lib/publicacion";
import {
  kpis, serieDiaria, porFormato, mejoresMomentos, mejoresPublicaciones, resumenCompetencia,
  numeroCorto, DIAS_SEMANA, BLOQUES_HORA, NOMBRE_FORMATO,
} from "../lib/resultados";

// ============================================================
// Resultados: lo que pasó DESPUÉS de publicar
//
// Dos pantallas en un mismo trozo (se cargan juntas y sólo al abrirlas):
//
//   · Resultados, la pestaña de un cliente: cifras del periodo contra el
//     anterior, evolución, mejores publicaciones, formatos, horarios,
//     audiencia y competencia.
//   · ResumenAgencia (/resultados): todos los clientes en una tabla.
//
// Los datos los fotografía el cron cada día (worker/lib/metricas.js);
// aquí sólo se leen y se resumen con lib/resultados.js.
// ============================================================

const PERIODOS = [[7, "7 días"], [30, "30 días"], [90, "90 días"]];

const irA = (ruta) => (e) => { e.preventDefault(); navegar(ruta); };
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "long" });

function Cambio({ valor, invertir = false }) {
  if (valor == null || !Number.isFinite(valor)) return <span className="kpi-cambio">sin comparación</span>;
  const sube = valor >= 0;
  const bueno = invertir ? !sube : sube;
  return (
    <span className="kpi-cambio" data-tono={Math.abs(valor) < 0.5 ? "igual" : bueno ? "bien" : "mal"}>
      <Icon name={sube ? "arrowUp" : "arrowDown"} size={12} /> {Math.abs(valor).toLocaleString("es", { maximumFractionDigits: 1 })} %
      <span className="sr-only"> respecto al periodo anterior</span>
    </span>
  );
}

function Kpi({ titulo, cifra, sufijo = "", extra = null }) {
  return (
    <div className="kpi">
      <p className="kpi-titulo">{titulo}</p>
      <p className="kpi-valor">{cifra?.valor == null ? "—" : `${numeroCorto(cifra.valor)}${sufijo}`}</p>
      <Cambio valor={cifra?.cambio} />
      {extra && <p className="kpi-extra">{extra}</p>}
    </div>
  );
}

function Competidores({ client, onPersistClient }) {
  const ids = useId();
  const [nuevo, setNuevo] = useState("");
  const lista = client.competidores ?? [];
  const guardar = (siguiente) => onPersistClient?.({ ...client, competidores: siguiente });
  const anadir = (e) => {
    e.preventDefault();
    const u = nuevo.trim().replace(/^@/, "").replace(/.*instagram\.com\//, "").replace(/\/.*$/, "");
    if (!/^[\w.]{1,30}$/.test(u) || lista.some((x) => x.toLowerCase() === u.toLowerCase()) || lista.length >= 5) return;
    guardar([...lista, u]);
    setNuevo("");
  };
  return (
    <div className="competidores-editor">
      <form onSubmit={anadir} className="competidores-form">
        <label htmlFor={`${ids}-c`} className="sr-only">Usuario de Instagram del competidor</label>
        <input id={`${ids}-c`} className="input" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="@competidor (hasta 5)" disabled={lista.length >= 5} />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={!nuevo.trim() || lista.length >= 5}><Icon name="plus" size={14} /> Seguir</button>
      </form>
      {lista.length > 0 && (
        <ul className="competidores-chips" aria-label="Competidores que se siguen">
          {lista.map((u) => (
            <li key={u}>
              @{u}
              <button type="button" className="btn-icon" aria-label={`Dejar de seguir a @${u}`} onClick={() => guardar(lista.filter((x) => x !== u))}>
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Resultados({ client, pulso = 0, onPersistClient }) {
  const clientId = client?.dbId || client?.id;
  const [dias, setDias] = useState(30);
  const [red, setRed] = useState("todas");
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");
  const [actualizando, setActualizando] = useState("");

  const cargar = useCallback(() => {
    db.metricasCliente(clientId, dias).then((d) => { setDatos(d); setFallo(""); }).catch((e) => setFallo(e.message));
  }, [clientId, dias]);
  useEffect(() => { cargar(); }, [cargar, pulso]);

  const hasta = fechaEnZona();
  const desde = sumarDias(hasta, -dias);
  const redesConDatos = useMemo(() => [...new Set((datos?.cuentas ?? []).map((c) => c.red))], [datos]);
  const enPeriodo = useMemo(
    () => (datos?.publicaciones ?? []).filter((p) => (red === "todas" || p.red === red) && p.publicadaAt >= `${desde}T05:00:00`),
    [datos, red, desde],
  );
  const cifras = useMemo(() => (datos ? kpis(datos, { desde, hasta, red }) : null), [datos, desde, hasta, red]);
  const serie = useMemo(() => serieDiaria(datos?.serie ?? [], red).filter((d) => d.fecha >= desde), [datos, red, desde]);
  const momentos = useMemo(() => mejoresMomentos(enPeriodo), [enPeriodo]);
  const competencia = useMemo(() => resumenCompetencia(datos?.competencia ?? [], desde), [datos, desde]);
  const audiencia = Object.values(datos?.audiencia ?? {})[0] ?? null;

  const actualizar = async () => {
    setFallo("");
    for (const c of datos?.cuentas ?? []) {
      setActualizando(`Midiendo ${c.usuario ? `@${c.usuario}` : c.nombre}…`);
      try { await db.actualizarMetricasCuenta(c.id); } catch (e) { setFallo(e.message); }
    }
    setActualizando("");
    cargar();
  };

  if (!datos && !fallo) return <p role="status" className="hint">Cargando resultados…</p>;

  if (datos && !datos.cuentas.length) {
    return (
      <div className="empty-state">
        <Icon name="chart" size={36} className="empty-state-icon" style={{ margin: "0 auto var(--sp-3)" }} />
        <p className="empty-state-title">Sin cuentas conectadas</p>
        <p className="empty-state-text">
          Asigna el Instagram o el Facebook de {client.name} en{" "}
          <a href="/ajustes#integraciones" onClick={irA("/ajustes#integraciones")}>Ajustes → Integraciones</a>{" "}
          y desde el día siguiente empezarán a verse sus resultados.
        </p>
      </div>
    );
  }

  const sinFotos = datos && !datos.serie.some((f) => !f.error);
  // La última foto de cada cuenta: si Meta no dejó leer sus publicaciones
  // o la foto falló entera, se dice aquí en vez de enseñar ceros.
  const ultimas = new Map();
  for (const f of datos?.serie ?? []) ultimas.set(f.cuentaId, f);
  const problemas = [...ultimas.values()].filter((f) => f.error || f.avisoPublicaciones).map((f) => {
    const c = datos.cuentas.find((x) => x.id === f.cuentaId);
    const nombre = `${REDES[f.red]?.nombre ?? f.red} ${c?.usuario ? `@${c.usuario}` : c?.nombre ?? ""}`.trim();
    return { id: f.cuentaId, texto: f.error ? `${nombre}: no se pudo medir (${f.error})` : `${nombre}: Meta no dejó leer sus publicaciones (${f.avisoPublicaciones})` };
  });

  return (
    <div className="resultados">
      <div className="resultados-barra">
        <div role="group" aria-label="Periodo" className="resultados-filtros">
          {PERIODOS.map(([n, nombre]) => (
            <button key={n} type="button" className="filter-chip" aria-pressed={dias === n} onClick={() => setDias(n)}>{nombre}</button>
          ))}
        </div>
        {redesConDatos.length > 1 && (
          <div role="group" aria-label="Red" className="resultados-filtros">
            {["todas", ...redesConDatos].map((r) => (
              <button key={r} type="button" className="filter-chip" aria-pressed={red === r} onClick={() => setRed(r)}>
                {r === "todas" ? "Todas" : REDES[r]?.nombre ?? r}
              </button>
            ))}
          </div>
        )}
        <div className="resultados-actualizar">
          {datos?.ultimaFoto && <span className="hint">Datos hasta el {fechaLarga(datos.ultimaFoto)}</span>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={actualizar} disabled={!!actualizando || !datos}>
            <Icon name="refresh" size={14} /> {actualizando ? "Midiendo…" : "Actualizar ahora"}
          </button>
        </div>
      </div>
      <div role="status" aria-live="polite">{actualizando && <p className="hint">{actualizando}</p>}</div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      {problemas.length > 0 && (
        <ul className="notice notice-warn resultados-problemas" aria-label="Cuentas con datos incompletos">
          {problemas.map((p) => <li key={p.id}>{p.texto}</li>)}
        </ul>
      )}

      {sinFotos ? (
        <p className="notice notice-warn">
          Todavía no hay datos. La app mide cada cuenta una vez al día (desde las 6:00); si no quieres esperar, pulsa
          «Actualizar ahora».
        </p>
      ) : cifras && (
        <>
          <section className="kpis" aria-label="Cifras del periodo">
            <Kpi titulo="Seguidores" cifra={cifras.seguidores}
              extra={cifras.seguidores.ganados != null ? `${cifras.seguidores.ganados >= 0 ? "+" : ""}${numeroCorto(cifras.seguidores.ganados)} en el periodo` : null} />
            <Kpi titulo="Alcance" cifra={cifras.alcance} />
            <Kpi titulo="Vistas" cifra={cifras.vistas} />
            <Kpi titulo="Interacciones" cifra={cifras.interacciones} />
            <Kpi titulo="Tasa de interacción" cifra={cifras.tasaInteraccion} sufijo=" %" />
            <Kpi titulo="Publicaciones" cifra={cifras.publicaciones} />
          </section>

          <div className="resultados-rejilla">
            <section className="resultados-tarjeta" aria-labelledby="res-seg">
              <h3 id="res-seg">Seguidores</h3>
              <GraficaLinea titulo="Seguidores" datos={serie.map((d) => ({ fecha: d.fecha, valor: d.seguidores }))} />
            </section>
            <section className="resultados-tarjeta" aria-labelledby="res-alc">
              <h3 id="res-alc">Alcance por día</h3>
              <GraficaBarras titulo="Alcance" datos={serie.map((d) => ({ fecha: d.fecha, valor: d.alcance }))} />
            </section>
          </div>

          <section className="resultados-tarjeta" aria-labelledby="res-top">
            <h3 id="res-top">Las que mejor funcionaron</h3>
            {enPeriodo.length === 0 ? <p className="hint">Sin publicaciones en este periodo.</p> : (
              <ul className="top-publicaciones">
                {mejoresPublicaciones(enPeriodo, 6).map((p) => (
                  <li key={p.id}>
                    <div className="top-miniatura">
                      {p.miniatura ? <img src={p.miniatura} alt="" loading="lazy" /> : <Icon name="file" size={24} />}
                    </div>
                    <div className="top-texto">
                      <p className="top-meta">
                        <Icon name={REDES[p.red]?.icono ?? "globe"} size={12} /> {NOMBRE_FORMATO[p.tipo] ?? p.tipo} ·{" "}
                        {new Date(p.publicadaAt).toLocaleDateString("es", { day: "numeric", month: "short" })}
                        {p.postId && <span className="badge">Del calendario</span>}
                      </p>
                      <p className="top-caption">{p.texto || "Sin texto"}</p>
                      <p className="top-cifras">
                        <strong>{numeroCorto(p.interacciones)}</strong> interacciones
                        {p.alcance > 0 && <> · {numeroCorto(p.alcance)} de alcance</>}
                        {p.vistas > 0 && <> · {numeroCorto(p.vistas)} vistas</>}
                      </p>
                      {p.enlace && <a href={p.enlace} target="_blank" rel="noreferrer" className="top-enlace">Ver publicación <Icon name="link" size={12} /></a>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="resultados-rejilla">
            <section className="resultados-tarjeta" aria-labelledby="res-for">
              <h3 id="res-for">Por formato</h3>
              {enPeriodo.length === 0 ? <p className="hint">Sin publicaciones en este periodo.</p> : (
                <table className="tabla-resultados">
                  <thead><tr><th scope="col">Formato</th><th scope="col">Publicaciones</th><th scope="col">Interacción media</th><th scope="col">Alcance medio</th></tr></thead>
                  <tbody>
                    {porFormato(enPeriodo).map((f) => (
                      <tr key={f.tipo}><th scope="row">{f.nombre}</th><td>{f.cantidad}</td><td>{numeroCorto(f.interacciones)}</td><td>{numeroCorto(f.alcance)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="resultados-tarjeta" aria-labelledby="res-hor">
              <h3 id="res-hor">Cuándo funcionan mejor</h3>
              {momentos.mejores.length === 0 ? <p className="hint">Sin publicaciones en este periodo.</p> : (
                <>
                  <p className="hint">
                    Mejor: {momentos.mejores.map((m) => `${DIAS_SEMANA[m.dia].toLowerCase()} de ${BLOQUES_HORA[m.bloque]} h`).join(", ")} (hora de Panamá).
                  </p>
                  <table className="mapa-horas">
                    <caption className="sr-only">Interacción media por día y franja horaria</caption>
                    <thead><tr><th scope="col"><span className="sr-only">Día</span></th>{BLOQUES_HORA.map((b) => <th key={b} scope="col">{b}</th>)}</tr></thead>
                    <tbody>
                      {momentos.matriz.map((fila, d) => (
                        <tr key={DIAS_SEMANA[d]}>
                          <th scope="row">{DIAS_SEMANA[d].slice(0, 3)}</th>
                          {fila.map((c, b) => (
                            <td key={BLOQUES_HORA[b]}
                              style={c ? { background: `color-mix(in srgb, var(--accent) ${Math.round(15 + 70 * (c.media / (momentos.maximo || 1)))}%, transparent)` } : undefined}
                              title={c ? `${numeroCorto(c.media)} de media (${c.cantidad})` : "Sin publicaciones"}>
                              {c ? numeroCorto(c.media) : ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          </div>

          {audiencia && (
            <section className="resultados-tarjeta" aria-labelledby="res-aud">
              <h3 id="res-aud">Audiencia</h3>
              <div className="audiencia">
                {[["age", "Edad"], ["gender", "Género"], ["city", "Ciudades"]].filter(([k]) => audiencia[k]?.length).map(([k, nombre]) => {
                  const total = audiencia[k].reduce((a, x) => a + x.valor, 0) || 1;
                  const etiqueta = (c) => (k === "gender" ? { F: "Mujeres", M: "Hombres", U: "Sin dato" }[c] ?? c : c);
                  return (
                    <div key={k}>
                      <h4>{nombre}</h4>
                      <ul className="barras-h">
                        {audiencia[k].slice(0, 6).map((x) => (
                          <li key={x.clave}>
                            <span>{etiqueta(x.clave)}</span>
                            <span className="barras-h-pista" aria-hidden="true"><span style={{ width: `${(x.valor / total) * 100}%` }} /></span>
                            <span>{Math.round((x.valor / total) * 100)} %</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <SeccionInformes client={client} pulso={pulso} />

      <section className="resultados-tarjeta" aria-labelledby="res-com">
        <h3 id="res-com">Competencia</h3>
        <p className="hint">Cuentas profesionales de Instagram. Se miden cada día junto con la del cliente.</p>
        <Competidores client={client} onPersistClient={onPersistClient} />
        {competencia.length > 0 && (
          <table className="tabla-resultados">
            <thead><tr><th scope="col">Cuenta</th><th scope="col">Seguidores</th><th scope="col">Cambio</th><th scope="col">Interacción media</th><th scope="col">Publicaciones</th></tr></thead>
            <tbody>
              {competencia.map((c) => (
                <tr key={c.usuario}>
                  <th scope="row"><a href={`https://www.instagram.com/${c.usuario}/`} target="_blank" rel="noreferrer">@{c.usuario}</a></th>
                  <td>{numeroCorto(c.seguidores)}</td>
                  <td><Cambio valor={c.cambio} /></td>
                  <td>{numeroCorto(c.interaccionesPromedio)}</td>
                  <td>{numeroCorto(c.publicaciones)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** /resultados: todos los clientes con cuentas medidas, de un vistazo. */
export function ResumenAgencia({ clients = [], pulso = 0 }) {
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");
  useEffect(() => { db.resumenMetricas().then(setDatos).catch((e) => setFallo(e.message)); }, [pulso]);
  const slug = (id) => clients.find((c) => (c.dbId || c.id) === id)?.id;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Resultados</h1>
        <p className="page-meta">Todos los clientes, últimos 30 días. El detalle está en la pestaña «Resultados» de cada uno.</p>
      </div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      {!datos && !fallo && <p role="status" className="hint">Cargando…</p>}
      {datos && datos.clientes.length === 0 && (
        <p className="notice notice-warn">
          Todavía no hay datos. Conecta Meta y asigna las cuentas en{" "}
          <a href="/ajustes#integraciones" onClick={irA("/ajustes#integraciones")}>Ajustes → Integraciones</a>; la app las mide cada día.
        </p>
      )}
      {datos?.clientes.length > 0 && (
        <div className="resultados-tarjeta">
          <table className="tabla-resultados tabla-agencia">
            <thead>
              <tr><th scope="col">Cliente</th><th scope="col">Seguidores</th><th scope="col">Cambio</th><th scope="col">Alcance</th><th scope="col">Publicaciones</th><th scope="col">Interacciones</th></tr>
            </thead>
            <tbody>
              {datos.clientes.map((c) => (
                <tr key={c.clientId}>
                  <th scope="row">
                    <a href={`/cliente/${c.clientId}/resultados`} onClick={(e) => { e.preventDefault(); navegar(`/cliente/${slug(c.clientId) ?? c.clientId}/resultados`); }}>{c.nombre}</a>
                  </th>
                  <td>{numeroCorto(c.seguidores)}</td>
                  <td><Cambio valor={c.seguidoresAntes ? ((c.seguidores - c.seguidoresAntes) / c.seguidoresAntes) * 100 : null} /></td>
                  <td>{numeroCorto(c.alcance)}</td>
                  <td>{c.publicaciones}</td>
                  <td>{numeroCorto(c.interacciones)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
