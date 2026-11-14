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
import { ESTADOS_Q1, TEXTO_EXIGENCIA, SEMAFOROS, VENTANAS, valorQ2, METRICAS_Q2 } from "../../lib/tresQ";
import { CAMPOS_UMBRALES_3Q } from "../../lib/umbrales3q";
import { pct as pctFraccion, textoSinMedir, roasFrenteAlEquilibrio } from "../../lib/ventasSemana";
import QueEs from "./QueEs";
import Semaforo from "./Semaforo";

// ============================================================
// La REVISIÓN 3Q de lo que corre en el Ads Manager de un cliente (curso de campañas, entrega 5)
//
// Resultados → Anuncios (y el «Diagnóstico» de Anuncios → Campañas, en un diálogo: la misma pantalla). Para alguien que
// no hizo el curso (decisión de la agencia, 14-nov): ARRIBA el resumen en una frase («De 5 campañas, 3 están sanas…:
// empieza por esa»), después el número mágico del cliente con de dónde sale, y cada campaña, conjunto y anuncio con su
// SEMÁFORO (Sana · A vigilar · Mala · Esperando), por qué en una frase, qué hacer en pasos y dónde en el Ads Manager.
// Las cifras técnicas (30, 14 y 7 días, las métricas de la Q2) van plegadas en «Ver las cifras», y cada término lleva
// su «¿Qué es…?» (QueEs.jsx).
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

const NIVEL = { campana: "Campaña", conjunto: "Conjunto de anuncios", anuncio: "Anuncio" };
const coma = (n) => String(n).replace(".", ",");
/** El término del glosario que explica cada métrica de la Q2. */
const TERMINO_Q2 = { pctMensajes: "pctMensajes", ctrUnico: "ctrUnico", tasa3s: "tasa3s", tiempoVideo: "tiempoVideo", frecuencia: "frecuencia", cpm: "cpm", aprendizaje: "aprendizaje" };

/** Las métricas de la Q2 como chips: el valor, el umbral y si avisa, con su frase a la vista (no en un `title`). */
function MetricasQ2({ q2, moneda }) {
  const lista = q2?.metricas ?? [];
  if (!lista.length) return null;
  return (
    <>
      <ul className="r3q-q2" aria-label={`Las métricas que explican el porqué (${q2.ventana} días)`}>
        {lista.map((m) => (
          <li key={m.id} data-mal={m.mal}>
            <span className="r3q-q2-nombre">{m.nombre}</span>
            {m.valor != null && <strong>{valorQ2(m.unidad, m.valor, moneda)}</strong>}
            {m.umbral != null && <span className="r3q-q2-umbral">{METRICAS_Q2[m.id]?.mayor ? "máx." : "mín."} {valorQ2(m.unidad, m.umbral, moneda)}</span>}
            <span className="sr-only">{m.mal ? "(avisa)" : "(bien)"}</span>
          </li>
        ))}
      </ul>
      <ul className="r3q-q2-frases">
        {lista.filter((m) => m.texto).map((m) => <li key={m.id} data-mal={m.mal}>{m.mal ? "✗" : "✓"} {m.texto}</li>)}
      </ul>
      {[...new Set(lista.map((m) => TERMINO_Q2[m.id]).filter(Boolean))].map((t) => <QueEs key={t} termino={t} />)}
    </>
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
const BOTON_Q3 = { ganchos: ["sparkles", "Mejorar los ganchos"], anuncios: ["sparkles", "Hacer anuncios nuevos"], video: ["video", "Mejorar el guion"] };

/**
 * Por qué y qué hacer, para quien no sabe del curso: la frase del porqué, los pasos en orden y dónde se hace en el Ads
 * Manager (el semáforo de lib/tresQ.js, `semaforoDe`). Un término que aparece lleva su «¿Qué es…?».
 */
function QueHacer({ x }) {
  const s = x.semaforo;
  const v = x.veredicto;
  if (!s || v.heredado) return null;
  return (
    <div className="r3q-que-hacer">
      {s.porque && <p className="r3q-porque"><strong>Por qué:</strong> {s.porque}</p>}
      {s.pasos?.length > 0 && (
        <>
          <p className="r3q-que"><strong>Qué hacer:</strong></p>
          <ol className="r3q-pasos">{s.pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>
        </>
      )}
      {s.donde && <p className="r3q-donde"><Icon name="external" size={14} /> <span>{s.donde}</span></p>}
      {v.desglose && <QueEs termino="desglose" />}
      {v.id === "espera" && <QueEs termino="aprendizaje" />}
    </div>
  );
}

/**
 * Los botones: lo que se hace en la aplicación (producir anuncios nuevos, mejorar el guion) y lo que cambia algo en
 * Meta (apagar, subir el presupuesto), con su confirmación. «Abrir en el Ads Manager» siempre.
 */
function Acciones({ x, nivel, campana, ctx }) {
  const { esAdmin, soloLectura, trabajando, hechos, confirmar, onApagar, onSubir, onNoSubir, irA } = ctx;
  const v = x.veredicto;
  if (hechos[x.id]) return <p className="hint r3q-hecho"><Icon name="check" size={12} /> {hechos[x.id]}</p>;
  const enApp = [...new Map((v.acciones ?? []).filter((a) => BOTON_Q3[a.ir]).map((a) => [a.ir, a])).values()];
  return (
    <div className="r3q-botones">
      {enApp.map((a) => (
        <button key={a.id} type="button" className="btn btn-secondary btn-sm" onClick={() => irA(a, campana)}>
          <Icon name={BOTON_Q3[a.ir][0]} size={14} /> {BOTON_Q3[a.ir][1]}
        </button>
      ))}
      {v.id === "apagar" && nivel !== "campana" && !soloLectura && (
        <button type="button" className="btn btn-danger btn-sm" disabled={Boolean(trabajando)} onClick={() => onApagar(x)}><Icon name="pause" size={14} /> Apagarlo desde aquí</button>
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

/** Un conjunto o un anuncio: su semáforo, por qué, qué hacer y dónde; las cifras, plegadas. */
function Elemento({ x, nivel, campana, ctx }) {
  const v = x.veredicto;
  const c7 = x.ventanas?.[7];
  const c30 = x.ventanas?.[30];
  const d = (n) => formatoMoneda(n, ctx.moneda);
  return (
    <li className="r3q-elemento" data-tono={x.semaforo?.tono ?? v.tono}>
      <div className="r3q-elemento-cabeza">
        {x.miniatura ? <img src={x.miniatura} alt="" loading="lazy" className="r3q-mini" /> : null}
        <div className="r3q-elemento-nombre">
          <span className="r3q-nivel">{NIVEL[nivel]}</span>
          <strong>{x.nombre || x.titulo || x.id}</strong>
        </div>
        {!v.heredado && <Semaforo s={x.semaforo} />}
      </div>
      {nivel === "anuncio" && <PublicacionDelAnuncio x={x} ctx={ctx} />}
      {v.heredado ? <p className="hint r3q-motivo">{v.motivo}</p> : <QueHacer x={x} />}
      {!v.heredado && <Acciones x={x} nivel={nivel} campana={campana} ctx={ctx} />}
      {!v.heredado && (c7 || c30) && (
        <details className="r3q-tecnico">
          <summary>Ver las cifras</summary>
          <p className="hint r3q-cifras">
            {c30 ? `30 días: ${d(c30.gasto)} · ${c30.resultados ?? 0} ${campana.nombreResultado}${c30.costoPorResultado ? ` · ${d(c30.costoPorResultado)} c/u` : ""}` : ""}
            {c7 ? ` · 7 días: ${d(c7.gasto)} · ${c7.resultados ?? 0}${c7.costoPorResultado ? ` · ${d(c7.costoPorResultado)} c/u` : ""}` : ""}
            {x.presupuestoDiario ? ` · ${d(x.presupuestoDiario)}/día` : ""}
          </p>
          <p className="hint">Lo que toca según el método: {v.nombre}.</p>
          <MetricasQ2 q2={x.q2} moneda={ctx.moneda} />
          {v.luego?.length > 0 && <p className="hint r3q-luego">Cuando toque cambiar: {v.luego.map((a) => a.titulo.toLowerCase()).join(" · ")}.</p>}
        </details>
      )}
    </li>
  );
}

/** Una campaña encendida: su semáforo, por qué, qué hacer y dónde; su etapa; y lo que tiene dentro. */
function Campana({ c, ctx }) {
  const ids = useId();
  const pendientes = [...c.conjuntos, ...c.anuncios].filter((x) => x.semaforo && ["mala", "vigilar"].includes(x.semaforo.id) && !x.veredicto.heredado).length;
  const [abierta, setAbierta] = useState(pendientes > 0);
  const total = SEMAFOROS[c.semaforoTotal];
  const peorDentro = c.semaforoTotal && c.semaforo && c.semaforoTotal !== c.semaforo.id && total;
  return (
    <li className="r3q-campana" data-tono={total?.tono ?? c.veredicto.tono}>
      <div className="r3q-campana-cabeza">
        <div className="r3q-campana-nombre">
          <span className="r3q-nivel">Campaña</span>
          <h3>{c.nombre}</h3>
          <p className="hint">
            {c.nombreObjetivo}{c.cbo ? " · el presupuesto lo lleva la campaña" : ""}{c.referencia?.ref ? ` · número mágico ${formatoMoneda(c.referencia.ref, ctx.moneda)} por ${singular(c.nombreResultado)}` : " · sin número mágico"}
          </p>
        </div>
        <Semaforo s={c.semaforo} />
      </div>
      {peorDentro && <p className="r3q-dentro"><Semaforo s={total} prefijo="Dentro: " /> {total.tono === "mal" ? "algo de dentro va mal" : "algo de dentro hay que vigilarlo"}: míralo abajo.</p>}
      <QueHacer x={c} />
      <Acciones x={c} nivel="campana" campana={c} ctx={ctx} />
      <div className="r3q-etapa">
        {c.etapaDe === "nombre" ? (
          <span className="badge r3q-etapa-chip">Etapa: {c.nombreEtapa} <span className="sr-only">(sale del nombre de la campaña)</span></span>
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
        <QueEs termino="etapa" />
        {c.cbo && <QueEs termino="cbo" />}
      </div>
      <details className="r3q-tecnico">
        <summary>Ver las cifras de la campaña (30, 14 y 7 días)</summary>
        <p className="hint">Lo que toca según el método: {c.veredicto.nombre}. {TEXTO_EXIGENCIA}</p>
        <TablaVentanas ventanas={c.ventanas} nombreResultado={c.nombreResultado} moneda={ctx.moneda} titulo={`«${c.nombre}» en 30, 14 y 7 días`} />
        <MetricasQ2 q2={c.q2} moneda={ctx.moneda} />
      </details>
      {(c.conjuntos.length > 0 || c.anuncios.length > 0) && (
        <>
          <button type="button" className="btn btn-ghost btn-sm r3q-desplegar" aria-expanded={abierta} aria-controls={`${ids}-dentro`} onClick={() => setAbierta((a) => !a)}>
            <Icon name={abierta ? "chevronUp" : "chevronDown"} size={14} />
            {c.conjuntos.length} {c.conjuntos.length === 1 ? "conjunto" : "conjuntos"} y {c.anuncios.length} {c.anuncios.length === 1 ? "anuncio" : "anuncios"}
            {pendientes ? ` · ${pendientes} con algo que hacer` : ""}
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

const singular = (n) => ({ conversaciones: "conversación", compras: "compra", "clientes potenciales": "cliente potencial", clics: "clic", interacciones: "interacción", "personas alcanzadas": "persona alcanzada" }[n] ?? "resultado");

/** Arriba de todo: la frase del resumen y cuántas campañas hay de cada color. */
function Resumen({ d }) {
  const por = d.resumen?.porSemaforo ?? {};
  return (
    <section className="r3q-tarjeta r3q-resumen" aria-labelledby="r3q-resumen">
      <h2 id="r3q-resumen" className="r3q-titulo"><Icon name="clipboardCheck" size={18} /> Cómo van las campañas</h2>
      <p className="r3q-frase">{d.resumen?.frase}</p>
      {d.campanas.length > 0 && (
        <ul className="r3q-conteo" aria-label="Campañas por color">
          {Object.entries(SEMAFOROS).filter(([id]) => por[id]).map(([id, s]) => (
            <li key={id}><Semaforo s={s} /> <strong>{por[id]}</strong></li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** El número mágico del cliente (el MISMO de la ficha, el plan y el aviso diario), de dónde sale y lo real de la cuenta. */
function NumeroMagico({ d, irANegocio }) {
  const q = d.q1Cuenta;
  const n = d.numero ?? {};
  const moneda = d.cuenta.moneda;
  const dinero = (v) => (v == null ? "—" : formatoMoneda(v, moneda));
  const que = q.metrica === "Costo por compra" ? "compra" : "conversación";
  return (
    <section className="r3q-tarjeta" aria-labelledby="r3q-q1">
      <h2 id="r3q-q1" className="r3q-titulo"><Icon name="calculator" size={18} /> El número mágico de {d.cliente?.nombre || "este cliente"}</h2>
      {!n.valor ? (
        <div className="notice notice-warn">
          <p style={{ margin: 0 }}><strong>Todavía no hay número mágico:</strong> no se puede saber si lo que cuesta cada {que} es caro, así que nada se pausa por costo.</p>
          {n.falta?.length > 0 && <ul style={{ margin: "var(--sp-1) 0" }}>{n.falta.map((f) => <li key={f.id}>{f.texto}</li>)}</ul>}
          <button type="button" className="btn btn-primary btn-sm" onClick={irANegocio}><Icon name="calculator" size={14} /> Completar los números del negocio</button>
        </div>
      ) : (
        <>
          <p className="r3q-numero">
            Puede pagar hasta <strong>{dinero(n.valor)}</strong> por {que}
            {n.roasEquilibrio && q.metrica === "Costo por compra" ? <> y tiene que vender al menos <strong>{coma(n.roasEquilibrio)} veces</strong> lo invertido</> : null}.
          </p>
          <p className="hint" style={{ margin: 0 }}>Sale {n.de}. Es el mismo para todas las campañas y todas las etapas.</p>
          {n.explicacion?.length > 0 && (
            <details className="r3q-tecnico">
              <summary>Cómo sale esta cifra, con sus números</summary>
              <ol className="r3q-pasos">{n.explicacion.map((t, i) => <li key={i}>{t}</li>)}</ol>
            </details>
          )}
        </>
      )}
      {n.gastoMeta30 ? <p className="hint">En los últimos 30 días Meta gastó {dinero(n.gastoMeta30)}: es sólo una referencia, la cuenta usa el presupuesto escrito o la inversión que pide la meta.</p> : null}
      {n.alarma && <p className="notice notice-error">{n.textoAlarma}</p>}
      <QueEs termino="numeroMagico" />
      <QueEs termino="equilibrio" />
      <h3 className="r3q-subtitulo">Lo real de la cuenta {q.tendencia === "empeora" ? "(la última semana empeoró)" : q.tendencia === "mejora" ? "(la última semana mejoró)" : ""}</h3>
      <div className="r3q-tabla-marco">
        <table className="r3q-tabla">
          <caption className="sr-only">Lo real de la cuenta en 30, 14 y 7 días, sólo de las campañas que buscan {que}s</caption>
          <thead><tr><th scope="col">Campañas de {que}s</th>{VENTANAS.map((w) => <th key={w} scope="col">{w} días</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">Gasto</th>{VENTANAS.map((w) => <td key={w}>{dinero(q.ventanas[w].gasto)}</td>)}</tr>
            <tr><th scope="row">{q.resultado.charAt(0).toUpperCase() + q.resultado.slice(1)}</th>{VENTANAS.map((w) => <td key={w}>{q.ventanas[w][q.resultado] ?? 0}</td>)}</tr>
            <tr><th scope="row">{q.metrica}</th>{VENTANAS.map((w) => <td key={w}>{dinero(q.ventanas[w].real)}</td>)}</tr>
            <tr>
              <th scope="row">Frente al número mágico</th>
              {VENTANAS.map((w) => {
                const e = ESTADOS_Q1[q.ventanas[w].estado];
                return <td key={w}><span className="r3q-estado" data-tono={e?.tono}>{e?.corto ?? "—"}</span></td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: 0 }}>Se juzga con el mes (30 días); 14 y 7 dicen si va mejorando o empeorando.</p>
    </section>
  );
}

/** Las ventas de la semana (el enlace del cliente): la tasa de cierre medida y el ROAS real frente al de equilibrio. */
function Ventas({ v, roasEquilibrio, irANegocio }) {
  if (!v) return null;
  const r = v.resumen ?? {};
  const moneda = v.meta?.moneda ?? "USD";
  const sinMedir = textoSinMedir(r.sinMedir);
  const frente = roasFrenteAlEquilibrio(r.roas, roasEquilibrio);
  return (
    <section className="r3q-tarjeta" aria-labelledby="r3q-ventas">
      <h2 id="r3q-ventas" className="r3q-titulo"><Icon name="trending" size={18} /> Las ventas de las últimas semanas</h2>
      <dl className="r3q-magico">
        <div><dt>Tasa de cierre medida</dt><dd>{r.tasa?.tasa == null ? "—" : pctFraccion(r.tasa.tasa)}</dd></div>
        <div><dt>ROAS real (lo vendido ÷ la pauta)</dt><dd>{r.roas == null ? "—" : `${coma(Math.round(r.roas * 100) / 100)}×`}</dd></div>
        {roasEquilibrio ? <div><dt>ROAS de equilibrio</dt><dd>{coma(roasEquilibrio)}×</dd></div> : null}
        <div><dt>Costo real por venta</dt><dd>{r.costoPorVenta == null ? "—" : formatoMoneda(r.costoPorVenta, moneda)}</dd></div>
      </dl>
      {frente && <p className={`notice ${frente.gana ? "notice-ok" : "notice-error"}`}>{frente.texto}</p>}
      {r.tasa?.motivo && <p className="hint">{r.tasa.motivo}</p>}
      {r.tasa?.aviso && <p className="hint">{r.tasa.aviso}</p>}
      {sinMedir && <p className="hint">{sinMedir}</p>}
      <QueEs termino="tasaCierre" />
      <QueEs termino="roas" />
      <p className="hint"><a href="/" onClick={irANegocio}>Marca → Números del negocio</a>: las ventas de cada semana y el enlace del cliente.</p>
    </section>
  );
}

/** Cómo se juzga: los umbrales del Manual y las reglas, para quien quiera saberlo. */
function ComoSeJuzga({ umbrales, irAlManual }) {
  return (
    <details className="r3q-tarjeta r3q-como">
      <summary>Cómo se juzga (para quien quiera el detalle)</summary>
      <ul>
        <li><strong>El mes manda:</strong> se juzga con los últimos 30 días; 14 y 7 dicen la tendencia. Una mala semana dentro de un buen mes se vigila, no se apaga.</li>
        <li><strong>Se apaga</strong> si en el mes cada resultado cuesta mucho más que el número mágico (o más que el equilibrio), ya gastó lo bastante para saberlo y la última semana tampoco fue bien.</li>
        <li><strong>Sin número mágico</strong> no se apaga nada por costo: sólo si casi nadie de los que dan clic escribe.</li>
        <li>{TEXTO_EXIGENCIA}</li>
        {CAMPOS_UMBRALES_3Q.map((c) => <li key={c.id}><strong>{c.nombre} {coma(umbrales?.[c.id])} {c.unidad}</strong> — {c.ayuda}</li>)}
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
          Lo que corre en su cuenta del Ads Manager: si cada campaña está sana, a vigilar o mala, por qué y qué hacer. La
          aplicación sólo lee; nada cambia solo.
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
          <Resumen d={d} />
          <div className="r3q-arriba">
            <NumeroMagico d={d} irANegocio={irANegocio} />
            <Ventas v={ventas} roasEquilibrio={d.numero?.roasEquilibrio} irANegocio={irANegocio} />
          </div>
          <section aria-labelledby="r3q-campanas">
            <h2 id="r3q-campanas" className="r3q-titulo">
              <Icon name="megaphone" size={18} /> Las campañas encendidas, una por una
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
