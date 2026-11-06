import "./Revision3Q.css";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { revisionCampanas, guardarEtapaCampana } from "../../lib/revision3qApi";
import { olvidarEnPauta } from "../../lib/enPautaApi";
import { ventasDelCliente } from "../../lib/ventasApi";
import * as api from "../../lib/anunciosApi";
import { formatoMoneda } from "../../lib/anuncios";
import { analizarRuta, construirRuta, navegar } from "../../lib/rutas";
import { etapaCiclo } from "../../lib/cicloVentas";
import { VEREDICTOS, ESTADOS_Q1, EXIGENCIA_ETAPA, VENTANAS, valorQ2, METRICAS_Q2 } from "../../lib/tresQ";
import { CAMPOS_UMBRALES_3Q } from "../../lib/umbrales3q";
import { pct as pctFraccion, textoSinMedir } from "../../lib/ventasSemana";

// ============================================================
// La REVISIÓN 3Q de lo que corre en el Ads Manager de un cliente (curso de campañas, entrega 5)
//
// Resultados → Anuncios (y el «Diagnóstico» de Anuncios → Campañas, en un diálogo: la misma pantalla). Arriba la Q1 de
// la cuenta —el número mágico frente a lo real en 30, 14 y 7 días— y las ventas de la semana; debajo cada campaña
// encendida con su etapa, su veredicto, sus métricas secundarias (Q2) y qué hacer (Q3), y sus conjuntos y anuncios.
//
// La aplicación sólo LEE el Ads Manager. Lo que cambia algo es lo de siempre: «Apagar» (quien puede escribir) y
// «Subir un 20 %» (el administrador, confirmando). Lo creativo lleva a producir: «Mejorar los ganchos» y «Anuncios
// nuevos» abren el lote de anuncios del Estudio con el nivel de su etapa y lo que se pide; lo demás, al Ads Manager.
// Al cliente no se le enseña nada de esto.
//
// Cerrar el ciclo (entrega 7, worker/lib/enPauta.js): cada anuncio dice qué publicación del calendario es (o que es un
// anuncio nuevo, subido aparte), y debajo va «Para pautar» (ParaPautar.jsx, en su chunk): lo orgánico que rindió y no
// se ha pautado, y lo que se aprende de lo que ya corrió.
// ============================================================

const ParaPautar = lazy(() => import("./ParaPautar"));

const NIVEL = { campana: "Campaña", conjunto: "Conjunto", anuncio: "Anuncio" };
const coma = (n) => String(n).replace(".", ",");

function Veredicto({ v }) {
  if (!v) return null;
  return <span className="r3q-veredicto" data-tono={v.tono}>{v.nombre}</span>;
}

/** Las métricas de la Q2 como chips: el valor, el umbral y si avisa. */
function MetricasQ2({ q2, moneda }) {
  const lista = q2?.metricas ?? [];
  if (!lista.length) return null;
  return (
    <ul className="r3q-q2" aria-label={`Por qué: las métricas secundarias (${q2.ventana} días)`}>
      {lista.map((m) => (
        <li key={m.id} data-mal={m.mal} title={m.texto}>
          <span className="r3q-q2-nombre">{m.nombre}</span>
          {m.valor != null && <strong>{valorQ2(m.unidad, m.valor, moneda)}</strong>}
          {m.umbral != null && <span className="r3q-q2-umbral">{METRICAS_Q2[m.id]?.mayor ? "máx." : "mín."} {valorQ2(m.unidad, m.umbral, moneda)}</span>}
          {m.valor == null && m.texto && <span className="r3q-q2-umbral">{m.texto}</span>}
          <span className="sr-only">{m.mal ? "(avisa)" : "(bien)"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Las ventanas de 30, 14 y 7 días, lado a lado. */
function TablaVentanas({ ventanas, nombreResultado = "resultados", moneda, titulo }) {
  const d = (n) => (n == null ? "—" : formatoMoneda(n, moneda));
  const p = (n) => (n == null ? "—" : `${coma(n)} %`);
  const filas = [
    ["Gasto", (c) => d(c?.gasto)],
    [nombreResultado.charAt(0).toUpperCase() + nombreResultado.slice(1), (c) => (c ? String(c.resultados ?? 0) : "—")],
    ["Costo por resultado", (c) => d(c?.costoPorResultado)],
    ["% de mensajes", (c) => p(c?.pctMensajes)],
    ["CTR único", (c) => p(c?.ctrUnico)],
    ["Frecuencia", (c) => (c?.frecuencia ? coma(c.frecuencia) : "—")],
    ["CPM", (c) => d(c?.cpm)],
  ];
  return (
    <div className="r3q-tabla-marco">
      <table className="r3q-tabla">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr><th scope="col">Métrica</th>{VENTANAS.map((w) => <th key={w} scope="col">{w} días</th>)}</tr>
        </thead>
        <tbody>
          {filas.map(([nombre, valor]) => (
            <tr key={nombre}><th scope="row">{nombre}</th>{VENTANAS.map((w) => <td key={w}>{valor(ventanas?.[w])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** El botón de una acción de la Q3 que se hace en la aplicación: a producir (el lote, el director). */
const BOTON_Q3 = { ganchos: ["sparkles", "Mejorar los ganchos"], anuncios: ["sparkles", "Anuncios nuevos"], video: ["video", "Mejorar el guion"] };

/**
 * Lo que se hace con un elemento: su Q3 (cada acción con su porqué y, si se hace aquí, su botón) y las dos que cambian
 * algo en Meta (apagar, subir el presupuesto), con su confirmación. «Abrir en el Ads Manager» siempre.
 */
function Acciones({ x, nivel, campana, ctx }) {
  const { esAdmin, soloLectura, trabajando, hechos, confirmar, onApagar, onSubir, onNoSubir, irA } = ctx;
  const v = x.veredicto;
  if (hechos[x.id]) return <p className="hint r3q-hecho"><Icon name="check" size={12} /> {hechos[x.id]}</p>;
  const q3 = (v.acciones ?? []).filter((a) => a.texto);
  return (
    <>
      {q3.length > 0 && (
        <ul className="r3q-q3" aria-label="Qué hacer">
          {q3.map((a) => (
            <li key={a.id}>
              <span><strong>{a.titulo}.</strong> {a.texto}</span>
              {BOTON_Q3[a.ir] && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => irA(a, campana)}>
                  <Icon name={BOTON_Q3[a.ir][0]} size={14} /> {BOTON_Q3[a.ir][1]}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="r3q-botones">
        {v.id === "apagar" && nivel !== "campana" && !soloLectura && (
          <button type="button" className="btn btn-danger btn-sm" disabled={Boolean(trabajando)} onClick={() => onApagar(x)}><Icon name="pause" size={14} /> Apagar</button>
        )}
        {v.id === "escalar" && v.sugerencia && nivel === "conjunto" && esAdmin && (confirmar?.id === x.id ? (
          <>
            <span className="hint">{confirmar.resumen}. ¿Seguro?</span>
            <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(trabajando)} onClick={() => onSubir(x, true)}>Sí, subir</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onNoSubir}>No</button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(trabajando)} onClick={() => onSubir(x)}>
            <Icon name="arrowUp" size={14} /> Subir a {formatoMoneda(v.sugerencia.diarioNuevo, ctx.moneda)} al día
          </button>
        ))}
        {v.id === "escalar" && v.sugerencia && nivel === "conjunto" && !esAdmin && <span className="hint">Subir el presupuesto lo hace el administrador.</span>}
        {x.enlace && (
          <a className="btn btn-ghost btn-sm" href={x.enlace} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={14} /> Abrir en el Ads Manager<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        )}
      </div>
    </>
  );
}

/** Qué publicación del calendario es un anuncio (o por qué no tiene ninguna), con «Abrir la publicación». */
export function PublicacionDelAnuncio({ x, ctx }) {
  if (x.publicacion) {
    const p = x.publicacion.post;
    return (
      <div className="r3q-publicacion">
        {p?.miniatura ? <img src={p.miniatura} alt="" loading="lazy" className="r3q-mini" /> : <Icon name="file" size={20} />}
        <span className="r3q-publicacion-texto">
          <span className="r3q-nivel">Publicación del calendario</span>
          <span>{p?.fecha ? new Date(`${p.fecha}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : ""}{p?.titulo ? ` · «${p.titulo}»` : ""}</span>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => ctx.abrirPublicacion(x.publicacion)}>
          <Icon name="calendar" size={14} /> Abrir la publicación
        </button>
      </div>
    );
  }
  if (x.sinPublicacion) return <p className="hint r3q-publicacion-sin">{x.sinPublicacion.texto}</p>;
  return null;
}

/** Un conjunto o un anuncio, con su veredicto y lo que se hace. */
function Elemento({ x, nivel, campana, ctx }) {
  const v = x.veredicto;
  const c7 = x.ventanas?.[7];
  const d = (n) => formatoMoneda(n, ctx.moneda);
  return (
    <li className="r3q-elemento" data-tono={v.tono}>
      <div className="r3q-elemento-cabeza">
        {x.miniatura ? <img src={x.miniatura} alt="" loading="lazy" className="r3q-mini" /> : null}
        <div className="r3q-elemento-nombre">
          <span className="r3q-nivel">{NIVEL[nivel]}</span>
          <strong>{x.nombre || x.titulo || x.id}</strong>
        </div>
        <Veredicto v={v} />
      </div>
      {nivel === "anuncio" && <PublicacionDelAnuncio x={x} ctx={ctx} />}
      {!v.heredado && <p className="r3q-motivo">{v.motivo}</p>}
      {!v.heredado && c7 && (
        <p className="hint r3q-cifras">
          7 días: {d(c7.gasto)} · {c7.resultados ?? 0} {campana.nombreResultado}{c7.costoPorResultado ? ` · ${d(c7.costoPorResultado)} c/u` : ""}
          {x.presupuestoDiario ? ` · ${d(x.presupuestoDiario)}/día` : ""}
        </p>
      )}
      {!v.heredado && <MetricasQ2 q2={x.q2} moneda={ctx.moneda} />}
      {!v.heredado && v.luego?.length > 0 && (
        <p className="hint r3q-luego">Cuando toque cambiar: {v.luego.map((a) => a.titulo.toLowerCase()).join(" · ")}.</p>
      )}
      {!v.heredado && <Acciones x={x} nivel={nivel} campana={campana} ctx={ctx} />}
    </li>
  );
}

/** Una campaña encendida: su etapa, sus 3 Q y lo que tiene dentro. */
function Campana({ c, ctx }) {
  const ids = useId();
  const pendientes = [...c.conjuntos, ...c.anuncios].filter((x) => x.veredicto.tono === "mal" && !x.veredicto.heredado).length;
  const [abierta, setAbierta] = useState(pendientes > 0);
  const v = c.veredicto;
  return (
    <li className="r3q-campana" data-tono={v.tono}>
      <div className="r3q-campana-cabeza">
        <div className="r3q-campana-nombre">
          <h3>{c.nombre}</h3>
          <p className="hint">
            {c.nombreObjetivo}{c.cbo ? " · presupuesto de campaña" : ""}{c.referencia?.ref ? ` · aguanta ${formatoMoneda(c.referencia.ref, ctx.moneda)} por resultado` : ""}
            {c.referencia?.de === "promedio" ? " (su promedio del mes)" : ""}
          </p>
        </div>
        <Veredicto v={v} />
      </div>
      <div className="r3q-etapa">
        {c.etapaDe === "nombre" ? (
          <span className="badge r3q-etapa-chip" title="Sale del nombre de la campaña">{c.nombreEtapa}</span>
        ) : (
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor={`${ids}-etapa`}>Etapa {c.etapaDe === "manual" ? "(escogida a mano)" : "(su nombre no la dice)"}</label>
            <select id={`${ids}-etapa`} className="input r3q-etapa-select" value={c.etapa} disabled={ctx.soloLectura || ctx.trabajando === `etapa-${c.id}`}
              onChange={(e) => ctx.onEtapa(c, e.target.value)}>
              <option value="">Sin etapa</option>
              {ctx.etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
        )}
        <p className="hint r3q-exigencia">{c.exigencia}</p>
      </div>
      <p className="r3q-motivo">{v.motivo}</p>
      <TablaVentanas ventanas={c.ventanas} nombreResultado={c.nombreResultado} moneda={ctx.moneda} titulo={`«${c.nombre}» en 30, 14 y 7 días`} />
      <MetricasQ2 q2={c.q2} moneda={ctx.moneda} />
      <Acciones x={c} nivel="campana" campana={c} ctx={ctx} />
      {(c.conjuntos.length > 0 || c.anuncios.length > 0) && (
        <>
          <button type="button" className="btn btn-ghost btn-sm r3q-desplegar" aria-expanded={abierta} aria-controls={`${ids}-dentro`} onClick={() => setAbierta((a) => !a)}>
            <Icon name={abierta ? "chevronUp" : "chevronDown"} size={14} />
            {c.conjuntos.length} {c.conjuntos.length === 1 ? "conjunto" : "conjuntos"} y {c.anuncios.length} {c.anuncios.length === 1 ? "anuncio" : "anuncios"}
            {pendientes ? ` · ${pendientes} ${pendientes === 1 ? "pide" : "piden"} cambios` : ""}
          </button>
          <div id={`${ids}-dentro`} hidden={!abierta}>
            <ul className="r3q-elementos">
              {c.conjuntos.map((s) => <Elemento key={s.id} x={s} nivel="conjunto" campana={c} ctx={ctx} />)}
              {c.anuncios.map((a) => <Elemento key={a.id} x={a} nivel="anuncio" campana={c} ctx={ctx} />)}
            </ul>
          </div>
        </>
      )}
    </li>
  );
}

/** La Q1 de la cuenta: el número mágico y lo real en cada ventana. */
function NumeroMagico({ d, irANegocio }) {
  const q = d.q1Cuenta;
  const n = d.numero;
  const moneda = d.cuenta.moneda;
  const dinero = (v) => (v == null ? "—" : formatoMoneda(v, moneda));
  const sinNumero = !q.objetivo && !q.equilibrio;
  return (
    <section className="r3q-tarjeta" aria-labelledby="r3q-q1">
      <h2 id="r3q-q1" className="r3q-titulo"><Icon name="calculator" size={18} /> Q1 · ¿Qué pasó? El número mágico frente a lo real</h2>
      {sinNumero ? (
        <p className="notice notice-warn">
          Sin números del negocio: cada campaña se compara con su propio mes.{" "}
          <a href="/" onClick={irANegocio}>Ponlos en Marca → Números del negocio</a> para saber cuánto aguanta cada {q.metrica === "Costo por compra" ? "compra" : "conversación"}.
        </p>
      ) : (
        <dl className="r3q-magico">
          <div><dt>{q.metrica} objetivo</dt><dd>{dinero(q.objetivo)}</dd></div>
          <div><dt>Equilibrio (a partir de aquí se pierde)</dt><dd>{dinero(q.equilibrio)}</dd></div>
          {n.tasaCierre ? <div><dt>Tasa de cierre</dt><dd>{coma(n.tasaCierre)} %</dd></div> : null}
        </dl>
      )}
      {n.alarma && <p className="notice notice-error">{n.textoAlarma}</p>}
      <div className="r3q-tabla-marco">
        <table className="r3q-tabla">
          <caption className="sr-only">Lo real de toda la cuenta en 30, 14 y 7 días</caption>
          <thead><tr><th scope="col">Toda la cuenta</th>{VENTANAS.map((w) => <th key={w} scope="col">{w} días</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">Gasto</th>{VENTANAS.map((w) => <td key={w}>{dinero(q.ventanas[w].gasto)}</td>)}</tr>
            <tr><th scope="row">{q.resultado.charAt(0).toUpperCase() + q.resultado.slice(1)}</th>{VENTANAS.map((w) => <td key={w}>{q.ventanas[w][q.resultado] ?? 0}</td>)}</tr>
            <tr><th scope="row">{q.metrica}</th>{VENTANAS.map((w) => <td key={w}>{dinero(q.ventanas[w].real)}</td>)}</tr>
            <tr>
              <th scope="row">Frente al número mágico</th>
              {VENTANAS.map((w) => {
                const e = ESTADOS_Q1[q.ventanas[w].estado];
                return <td key={w}><span className="r3q-estado" data-tono={e?.tono} title={e?.nombre}>{e?.corto ?? "—"}</span></td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Las ventas de la semana (el enlace del cliente): la tasa de cierre medida y el ROAS real. */
function Ventas({ v, irANegocio }) {
  if (!v) return null;
  const r = v.resumen ?? {};
  const moneda = v.meta?.moneda ?? "USD";
  const sinMedir = textoSinMedir(r.sinMedir);
  return (
    <section className="r3q-tarjeta" aria-labelledby="r3q-ventas">
      <h2 id="r3q-ventas" className="r3q-titulo"><Icon name="trending" size={18} /> Las ventas de las últimas semanas</h2>
      <dl className="r3q-magico">
        <div><dt>Tasa de cierre medida</dt><dd>{r.tasa?.tasa == null ? "—" : pctFraccion(r.tasa.tasa)}</dd></div>
        <div><dt>ROAS real (lo vendido ÷ la pauta)</dt><dd>{r.roas == null ? "—" : `${coma(Math.round(r.roas * 100) / 100)}×`}</dd></div>
        <div><dt>Costo real por venta</dt><dd>{r.costoPorVenta == null ? "—" : formatoMoneda(r.costoPorVenta, moneda)}</dd></div>
      </dl>
      {r.tasa?.motivo && <p className="hint">{r.tasa.motivo}</p>}
      {r.tasa?.aviso && <p className="hint">{r.tasa.aviso}</p>}
      {sinMedir && <p className="hint">{sinMedir}</p>}
      <p className="hint"><a href="/" onClick={irANegocio}>Marca → Números del negocio</a>: las ventas de cada semana y el enlace del cliente.</p>
    </section>
  );
}

/** Cómo se juzga: los umbrales del Manual y lo que se le exige a cada etapa. */
function ComoSeJuzga({ umbrales, irAlManual }) {
  return (
    <details className="r3q-tarjeta r3q-como">
      <summary>Cómo se juzga</summary>
      <ul>
        {CAMPOS_UMBRALES_3Q.map((c) => <li key={c.id}><strong>{c.nombre} {coma(umbrales?.[c.id])} {c.unidad}</strong> — {c.ayuda}</li>)}
      </ul>
      <p className="hint">Lo que aguanta cada etapa:</p>
      <ul>
        {["presentacion", "evaluacion", "conversion", "ascension", "temporada"].map((id) => <li key={id}>{EXIGENCIA_ETAPA[id].texto}</li>)}
      </ul>
      <p className="hint">
        Un conjunto dentro del número mágico no se toca, aunque uno de sus anuncios se vea peor (Meta reparte el presupuesto y
        se juzga el total). Lo que está aprendiendo, o se cambió hace poco, espera. Los umbrales se cambian en{" "}
        <a href="/ajustes" onClick={irAlManual}>Ajustes → Cómo trabajamos → Manual de campañas</a>.
      </p>
    </details>
  );
}

/**
 * Va en la página (Resultados → Anuncios) y en el diálogo del diagnóstico de Anuncios → Campañas.
 * @param onIr      antes de navegar a otra pantalla (el diálogo se cierra)
 * @param onCambio  tras apagar o subir un presupuesto (Anuncios relee sus campañas)
 */
export default function Revision3Q({ client, esAdmin = false, soloLectura = false, onIr = null, onCambio = null }) {
  const clientId = client?.dbId || client?.id;
  const raiz = useRef(null);
  const [d, setD] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [conIA, setConIA] = useState(false);
  const [ventas, setVentas] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [hechos, setHechos] = useState({});
  const [confirmar, setConfirmar] = useState(null);
  const [aviso, setAviso] = useState("");

  const leer = useCallback(async ({ ia = false } = {}) => {
    setCargando(true);
    setFallo(null);
    try {
      setD(await revisionCampanas(clientId, { conIA: ia }));
      // La lectura puso al día qué está en pauta (el panel de cada publicación lo relee).
      olvidarEnPauta(clientId);
      setHechos({});
      if (ia) window.dispatchEvent(new Event("ia:gasto"));
    } catch (e) {
      setFallo({ texto: e.message, estado: e.estado });
    }
    setCargando(false);
  }, [clientId]);

  // Se lee al abrir y con «Volver a leer», no con cada aviso del espacio: cada lectura son doce llamadas a Meta.
  useEffect(() => { void leer(); }, [leer]);
  useEffect(() => {
    let vivo = true;
    ventasDelCliente(clientId).then((v) => vivo && setVentas(v)).catch(() => vivo && setVentas(null));
    return () => { vivo = false; };
  }, [clientId]);

  // La dirección del cliente (en Resultados ya va en la barra; desde Anuncios, su id en crudo también resuelve).
  const slug = analizarRuta().cliente || clientId;
  const ir = (ruta) => { onIr?.(); navegar(ruta); };
  const irANegocio = (e) => { e?.preventDefault?.(); ir(construirRuta({ cliente: slug, pestana: "marca", seccion: "negocio" })); };
  const irAlManual = (e) => { e?.preventDefault?.(); ir("/ajustes"); };
  // Por su id en crudo (también resuelve): App abre la publicación con `?publicacion=`.
  const abrirPublicacion = ({ calendarId, postId }) => ir(`/cliente/${encodeURIComponent(slug)}/${encodeURIComponent(calendarId)}?publicacion=${encodeURIComponent(postId)}`);
  const devolverFoco = () => raiz.current?.focus({ preventScroll: true });

  const ctx = {
    moneda: d?.cuenta?.moneda ?? "USD", esAdmin, soloLectura, trabajando, hechos, confirmar, etapas: d?.etapas ?? [], abrirPublicacion,
    onApagar: async (x) => {
      setTrabajando(x.id);
      try {
        await api.pausarObjeto(clientId, x.id);
        setHechos((h) => ({ ...h, [x.id]: "En pausa" }));
        setAviso(`«${x.nombre}» quedó en pausa.`);
        onCambio?.();
        devolverFoco();
      } catch (e) { setFallo({ texto: e.message }); }
      setTrabajando("");
    },
    // Sin confirmar, el servidor dice qué va a cambiar; con «Sí», lo cambia.
    onSubir: async (x, confirmado = false) => {
      setTrabajando(x.id);
      try {
        const r = await api.presupuestoConjunto(clientId, x.id, x.veredicto.sugerencia.diarioNuevo, confirmado);
        setHechos((h) => ({ ...h, [x.id]: r.resumen }));
        setConfirmar(null);
        setAviso(`«${x.nombre}»: ${r.resumen}.`);
        onCambio?.();
        devolverFoco();
      } catch (e) {
        if (e.estado === 409 && e.datos?.confirmar) setConfirmar({ id: x.id, resumen: e.datos.confirmar.resumen });
        else setFallo({ texto: e.message });
      }
      setTrabajando("");
    },
    onNoSubir: () => { setConfirmar(null); devolverFoco(); },
    onEtapa: async (c, etapa) => {
      setTrabajando(`etapa-${c.id}`);
      try {
        await guardarEtapaCampana(clientId, c.id, etapa);
        setAviso(etapa ? `«${c.nombre}» queda en ${d.etapas.find((e) => e.id === etapa)?.nombre ?? etapa}. Recalculando…` : `«${c.nombre}» queda sin etapa. Recalculando…`);
        await leer();
      } catch (e) { setFallo({ texto: e.message }); }
      setTrabajando("");
    },
    // Lo creativo lleva a producir: el lote de anuncios del Estudio con el nivel de su etapa y lo que se pide.
    irA: (a, campana) => {
      if (a.ir === "video") { ir(construirRuta({ cliente: slug, pestana: "crear", seccion: "director" })); return; }
      const q = new URLSearchParams({ lote: "anuncios" });
      const niveles = etapaCiclo(campana?.etapa)?.niveles ?? [];
      if (a.ir === "ganchos" && niveles.length) q.set("niveles", niveles.join(","));
      // Con la etapa, las piezas llegan al calendario marcadas «Va a pauta» (lib/lotePauta.js).
      if (etapaCiclo(campana?.etapa)) q.set("etapa", etapaCiclo(campana.etapa).id);
      if (a.pide) q.set("pide", `${a.pide} Para la campaña «${campana?.nombre ?? ""}»${campana?.nombreEtapa ? ` (${campana.nombreEtapa.toLowerCase()})` : ""}.`.slice(0, 400));
      ir(`${construirRuta({ cliente: slug, pestana: "crear", seccion: "galeria" })}?${q}`);
    },
  };

  const sinCuenta = fallo?.estado === 409 && /cuenta publicitaria/.test(fallo.texto);

  return (
    <div ref={raiz} className="r3q" tabIndex={-1}>
      <div className="r3q-barra">
        <p className="hint" style={{ margin: 0, flex: "1 1 260px" }}>
          Lo que corre en su cuenta del Ads Manager, con el método de las 3 Q: qué pasó, por qué y qué hacer. La app sólo lee;
          nada cambia solo.
        </p>
        <label className="r3q-ia"><input type="checkbox" checked={conIA} onChange={(e) => setConIA(e.target.checked)} /> <span>Que la IA lo explique (unos centavos)</span></label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => leer({ ia: conIA })} disabled={cargando}>
          <Icon name="refresh" size={14} /> {cargando ? "Leyendo el Ads Manager…" : "Volver a leer"}
        </button>
      </div>

      <div role="status" aria-live="polite">
        {cargando && !d && <p className="hint">Leyendo las campañas del Ads Manager…</p>}
        {aviso && <p className="hint">{aviso}</p>}
      </div>
      {fallo && (sinCuenta ? (
        <p className="notice notice-warn">
          Este cliente no tiene cuenta publicitaria asignada: se escoge en{" "}
          <a href="/campanas" onClick={(e) => { e.preventDefault(); ir("/campanas"); }}>Anuncios → Campañas</a>.
        </p>
      ) : <p role="alert" className="notice notice-error">{fallo.texto}</p>)}

      {d && (
        <>
          {d.avisoLectura && <p className="hint">{d.avisoLectura}</p>}
          {d.avisoCreativo && <p className="hint">{d.avisoCreativo}</p>}
          {d.explicacion && <p className="r3q-explicacion">{d.explicacion}</p>}
          {d.avisoIA && <p className="hint">Sin explicación de la IA: {d.avisoIA}</p>}
          <div className="r3q-arriba">
            <NumeroMagico d={d} irANegocio={irANegocio} />
            <Ventas v={ventas} irANegocio={irANegocio} />
          </div>
          <section aria-labelledby="r3q-campanas">
            <h2 id="r3q-campanas" className="r3q-titulo">
              <Icon name="megaphone" size={18} /> Q2 y Q3 · Las campañas encendidas
              {d.resumen.pendientes > 0 && <span className="r3q-pendientes">{d.resumen.pendientes} {d.resumen.pendientes === 1 ? "pide" : "piden"} cambios</span>}
            </h2>
            {!d.campanas.length ? <p className="hint">Esta cuenta no tiene campañas encendidas.</p> : (
              <ul className="r3q-campanas">
                {d.campanas.map((c) => <Campana key={c.id} c={c} ctx={ctx} />)}
              </ul>
            )}
            {d.recortado && <p className="hint">La cuenta tiene muchos anuncios: se leyeron los primeros 500 de cada nivel.</p>}
          </section>
          <ComoSeJuzga umbrales={d.umbrales} irAlManual={irAlManual} />
          <p className="hint r3q-leyenda">
            {Object.entries(VEREDICTOS).filter(([id]) => d.resumen.porVeredicto?.[id]).map(([id, x]) => `${x.nombre}: ${d.resumen.porVeredicto[id]}`).join(" · ")}
          </p>
        </>
      )}
      {/* Lo orgánico que rindió y no se ha pautado: no necesita cuenta publicitaria (sólo D1). */}
      {(d || fallo) && (
        <Suspense fallback={null}>
          <ParaPautar client={client} soloLectura={soloLectura} onAbrir={abrirPublicacion} />
        </Suspense>
      )}
    </div>
  );
}
