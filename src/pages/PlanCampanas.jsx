import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { leerCiclo, marcarPasos, guardarAjustesCiclo } from "../lib/planCicloApi";
import {
  guiaDeMontaje, hojasDelPlan, planATextoCiclo, textoDeLaPieza, textoCalendario, avanceDeGuia, nombreDelMes, diaCorto, publicoDe,
} from "../lib/planCiclo";
import { crearXlsx, MIME_XLSX } from "../lib/xlsx";
import { direccionDelLote } from "../lib/lotePauta";
import { tipoArteDe } from "../lib/tiposArte";
import { nombreDeNivel } from "../lib/consciencia";
import { tipoNegocioDe } from "../lib/cicloVentas";
import { formatoMoneda } from "../lib/anuncios";
import { construirRuta, navegar } from "../lib/rutas";
import { fechaEnZona } from "../lib/agenda";
import "./PlanCampanas.css";

// ============================================================
// Anuncios → Plan de campañas (entrega 6 del curso de campañas: C.1–C.3 de docs/propuesta-curso-campanas.md)
//
// La campaña COMPLETA sugerida de un cliente para un mes, para montarla en el Ads Manager (la app no crea campañas:
// la creación por la API quedó congelada). Arriba, de dónde sale el presupuesto y los avisos; luego cada campaña del
// ciclo de ventas —con su presupuesto, sus conjuntos (públicos y exclusiones), sus anuncios con la pieza del calendario
// que va en cada uno y «Producir los anuncios que faltan»—, los públicos que hay que crear y la GUÍA DE MONTAJE con sus
// casillas, en el orden del Ads Manager, que ve todo el equipo. «Descargar el Excel» lo entrega en el formato del Excel
// de estrategia de la agencia (5 hojas) y «Copiar como texto», para mandarlo.
//
// El plan lo arma el Worker (worker/lib/planCampanas.js) con las MISMAS cuentas puras de src/lib/planCiclo.js que
// usan el Excel y Claude. Lo marcado se guarda paso a paso (se funde con lo de los demás); el aviso «anuncios» sube el
// pulso de las demás pestañas, que releen. El eco de la propia se descarta: aquí se pinta lo que se marcó al momento.
// ============================================================

const Estratega = lazy(() => import("../components/anuncios/Estratega"));

const CLAVE_CLIENTE = "anuncios:cliente";
const leerClienteGuardado = () => { try { return localStorage.getItem(CLAVE_CLIENTE) ?? ""; } catch { return ""; } };
const guardarCliente = (id) => { try { localStorage.setItem(CLAVE_CLIENTE, id); } catch { /* sin almacenamiento: da igual */ } };

/** El mes anterior, este y los tres siguientes («2026-11»). */
function mesesDeLaLista(hoy) {
  const y = Number(hoy.slice(0, 4));
  const m = Number(hoy.slice(5, 7)) - 1;
  return [-1, 0, 1, 2, 3].map((k) => {
    const t = y * 12 + m + k;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}
const ORIGEN_INVERSION = {
  escrita: "escrita en este plan",
  meta: "de la meta de ventas (Marca → Números del negocio)",
  presupuesto: "el presupuesto del mes de los números del negocio",
  "meta-ads": "lo gastado en 30 días en su cuenta publicitaria",
};
const DESTINO = { whatsapp: "a WhatsApp", web: "a la web" };
const CUENTA = { nueva: "Cuenta nueva", historial: "Con historial", "": "Cuenta sin decir" };

/** Copia un texto y avisa (o dice que no se pudo). */
async function copiar(texto, avisar) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar({ ok: true, texto: "Copiado." });
  } catch {
    avisar({ ok: false, texto: "El navegador no dejó copiar: selecciónalo y cópialo a mano." });
  }
}

export default function PlanCampanas({ clients = [], pulso = 0, yo = {}, onClienteNuevo = null }) {
  const ids = useId();
  const soloLectura = Boolean(yo?.soloLectura);
  const hoy = fechaEnZona();
  const meses = useMemo(() => mesesDeLaLista(hoy), [hoy]);
  const inicial = useMemo(() => new URLSearchParams(window.location.search), []);
  const [clienteId, setClienteId] = useState(() => {
    const pedido = inicial.get("cliente") || leerClienteGuardado();
    return clients.some((c) => c.id === pedido) ? pedido : clients[0]?.id ?? "";
  });
  const [mes, setMes] = useState(() => (meses.includes(inicial.get("mes")) ? inicial.get("mes") : hoy.slice(0, 7)));
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState("");
  const [aviso, setAviso] = useState(null);
  const [estratega, setEstratega] = useState(false);
  const [guardandoAjustes, setGuardandoAjustes] = useState(false);
  const [diarioTemporada, setDiarioTemporada] = useState("");
  const [inversion, setInversion] = useState("");
  const pedido = useRef(0);

  useEffect(() => { if (!clienteId && clients[0]) setClienteId(clients[0].id); }, [clients, clienteId]);
  // La dirección dice qué se mira: así se puede mandar el enlace del plan de un cliente y un mes.
  useEffect(() => {
    if (!clienteId) return;
    const q = new URLSearchParams({ cliente: clienteId, mes });
    window.history.replaceState(window.history.state, "", `${construirRuta({ vista: "plan-campanas" })}?${q}`);
  }, [clienteId, mes]);

  const cargar = useCallback(async () => {
    if (!clienteId) return;
    const n = ++pedido.current;
    setFallo("");
    try {
      const r = await leerCiclo(clienteId, mes);
      if (n !== pedido.current) return;
      setDatos(r);
      setDiarioTemporada(r.guardado?.ajustes?.temporada?.diario ? String(r.guardado.ajustes.temporada.diario) : "");
      setInversion(r.guardado?.ajustes?.inversion ? String(r.guardado.ajustes.inversion) : "");
    } catch (e) {
      if (n === pedido.current) { setFallo(e.message); setDatos(null); }
    }
  }, [clienteId, mes]);
  useEffect(() => { void cargar(); }, [cargar, pulso]);

  const plan = datos?.plan ?? null;
  const guia = useMemo(() => (plan ? guiaDeMontaje(plan) : []), [plan]);
  const progreso = datos?.guardado?.progreso ?? {};
  const avance = avanceDeGuia(guia, progreso);
  const moneda = plan?.moneda ?? "USD";
  const dinero = (n) => (n === null || n === undefined ? "—" : formatoMoneda(n, moneda));
  const cliente = clients.find((c) => c.id === clienteId) ?? null;

  const elegirCliente = (id) => { setClienteId(id); guardarCliente(id); setDatos(null); setAviso(null); };

  const marcar = async (paso, hecho) => {
    // Al momento en la pantalla; el servidor lo funde con lo de los demás y devuelve lo de todos.
    setDatos((d) => {
      if (!d) return d;
      const p = { ...d.guardado.progreso };
      if (hecho) p[paso] = { por: yo?.nombre ?? "", at: new Date().toISOString() };
      else delete p[paso];
      return { ...d, guardado: { ...d.guardado, progreso: p } };
    });
    try {
      const { guardado } = await marcarPasos(clienteId, mes, { [paso]: hecho });
      setDatos((d) => (d ? { ...d, guardado: { ...d.guardado, progreso: guardado.progreso } } : d));
    } catch (e) {
      setAviso({ ok: false, texto: `No se guardó lo marcado: ${e.message}` });
      void cargar();
    }
  };

  const guardarAjustes = async (cambios) => {
    setGuardandoAjustes(true);
    setAviso(null);
    try {
      const actuales = datos?.guardado?.ajustes ?? {};
      const r = await guardarAjustesCiclo(clienteId, mes, { ...actuales, ...cambios, temporada: { ...(actuales.temporada ?? {}), ...(cambios.temporada ?? {}) } });
      setDatos(r);
      setAviso({ ok: true, texto: "Plan rehecho con los ajustes." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setGuardandoAjustes(false);
  };

  const descargarExcel = () => {
    const bytes = crearXlsx(hojasDelPlan(plan));
    const url = URL.createObjectURL(new Blob([bytes], { type: MIME_XLSX }));
    const a = document.createElement("a");
    a.href = url;
    // Sin tildes ni signos: con ellos, algún navegador baja el archivo como «download».
    const slug = String(plan.cliente || "cliente").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    a.download = `plan-de-campanas-${slug || "cliente"}-${plan.mes}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const producir = (c) => {
    const artes = c.faltan.artes.map((x) => tipoArteDe(x)?.nombre).filter(Boolean);
    const pide = [
      `Anuncios para la campaña de ${c.nombreEtapa.toLowerCase()}${artes.length ? `, cada uno de un tipo de arte distinto entre ${artes.slice(0, 3).join(", ")}` : ""}.`,
      "Dos con el mismo tipo de arte y la misma composición son un solo anuncio para Meta: que se distingan a la vista.",
      c.id === "temporada" && plan.temporada?.ofertas ? `La oferta: ${plan.temporada.ofertas}.` : "",
    ].filter(Boolean).join(" ");
    navegar(direccionDelLote(construirRuta({ cliente: clienteId, pestana: "crear", seccion: "galeria" }), c.faltan, pide));
  };

  const grupos = useMemo(() => {
    const salida = [];
    for (const p of guia) {
      const ult = salida[salida.length - 1];
      if (ult?.id === p.grupo) ult.pasos.push(p);
      else salida.push({ id: p.grupo, titulo: p.grupo === "publicos" ? "Antes de empezar: los públicos personalizados" : plan?.campanas.find((c) => c.id === p.grupo)?.nombre ?? p.grupo, pasos: [p] });
    }
    return salida;
  }, [guia, plan]);

  const temporadaCampana = plan?.campanas.find((c) => c.id === "temporada") ?? null;

  return (
    <div className="plan-ciclo">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1 className="page-title">Plan de campañas</h1>
            <p className="hint">
              El ciclo de ventas entero de un cliente para un mes, listo para montarlo en el Ads Manager: cada campaña con su
              presupuesto, sus públicos, sus exclusiones y qué pieza va en cada anuncio. La aplicación no crea las campañas.
            </p>
          </div>
          <div className="page-header-actions">
            {!soloLectura && (
              <button type="button" className="btn btn-secondary" onClick={() => setEstratega(true)}>
                <Icon name="sparkles" size={16} /> Una campaña suelta
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => void copiar(planATextoCiclo(plan), setAviso)} disabled={!plan}>
              <Icon name="copy" size={16} /> Copiar como texto
            </button>
            <button type="button" className="btn btn-primary" onClick={descargarExcel} disabled={!plan}>
              <Icon name="download" size={16} /> Descargar el Excel
            </button>
          </div>
        </div>
      </div>

      <div className="plan-barra">
        <div className="field">
          <label className="label" htmlFor={`${ids}-c`}>Cliente</label>
          <select id={`${ids}-c`} className="input" value={clienteId} onChange={(e) => elegirCliente(e.target.value)}>
            {clients.length === 0 && <option value="">Sin clientes</option>}
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-m`}>Mes</label>
          <select id={`${ids}-m`} className="input" value={mes} onChange={(e) => { setMes(e.target.value); setDatos(null); }}>
            {meses.map((m) => <option key={m} value={m}>{nombreDelMes(m)}</option>)}
          </select>
        </div>
      </div>

      <div role="status" aria-live="polite">{aviso && <p className={`notice ${aviso.ok ? "notice-ok" : "notice-error"}`}>{aviso.texto}</p>}</div>
      {fallo && <p role="alert" className="notice notice-error">{fallo}</p>}
      {!plan && !fallo && clienteId && <p className="hint" role="status">Armando el plan…</p>}

      {plan && (
        <>
          <section className="plan-tarjeta" aria-labelledby={`${ids}-resumen`}>
            <h2 id={`${ids}-resumen`}>{plan.cliente} · {plan.nombreMes}</h2>
            <dl className="plan-resumen">
              <div><dt>Negocio</dt><dd>{tipoNegocioDe(plan.tipo)?.nombre ?? "Productos"} {DESTINO[plan.destino] ?? ""}</dd></div>
              <div><dt>Cuenta</dt><dd>{CUENTA[plan.cuenta] ?? plan.cuenta}</dd></div>
              <div><dt>Objetivo</dt><dd>{plan.nombreObjetivo}</dd></div>
              <div><dt>Inversión del mes</dt><dd>{dinero(plan.inversion)}{plan.inversionDe ? <span className="hint"> · {ORIGEN_INVERSION[plan.inversionDe]}</span> : null}</dd></div>
              <div><dt>Reparto</dt><dd>{plan.reparto.map((r) => `${r.nombre} ${String(r.pct).replace(".", ",")} %`).join(" · ")}</dd></div>
              <div><dt>Anuncios por conjunto</dt><dd>{plan.anunciosPorConjunto}</dd></div>
            </dl>
            {!soloLectura && (
              <form className="plan-ajuste" onSubmit={(e) => { e.preventDefault(); void guardarAjustes({ inversion: Number(inversion) || null }); }}>
                <div className="field">
                  <label className="label" htmlFor={`${ids}-inv`}>Inversión del mes a mano ({moneda})</label>
                  <input id={`${ids}-inv`} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={inversion}
                    placeholder={plan.inversionDe && plan.inversionDe !== "escrita" ? String(plan.inversion ?? "") : "Vacío: la de los números del negocio"}
                    onChange={(e) => setInversion(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-secondary btn-sm" disabled={guardandoAjustes}>{guardandoAjustes ? "Rehaciendo…" : "Rehacer el plan"}</button>
              </form>
            )}
            <p className="hint">El reparto y los anuncios por conjunto se cambian en Ajustes → Cómo trabajamos → Manual de campañas.</p>
          </section>

          {plan.avisos.length > 0 && (
            <section aria-labelledby={`${ids}-avisos`} className="plan-avisos">
              <h2 id={`${ids}-avisos`} className="plan-subtitulo">Antes de montar</h2>
              <ul>
                {plan.avisos.map((a, i) => (
                  <li key={`${a.codigo}-${i}`} className={`notice ${a.grave ? "notice-error" : "notice-warn"}`}>
                    {a.grave && <Icon name="alert" size={16} />} {a.texto}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.temporada && !soloLectura && (
            <section className="plan-tarjeta" aria-labelledby={`${ids}-temp`}>
              <h2 id={`${ids}-temp`}>La campaña de temporada · {plan.temporada.nombre}</h2>
              <p className="hint">{plan.temporada.motivo}. Del {diaCorto(plan.temporada.inicio)} al {diaCorto(plan.temporada.fin)} ({plan.temporada.dias} días), con su presupuesto aparte del reparto.</p>
              <form className="plan-ajuste" onSubmit={(e) => { e.preventDefault(); void guardarAjustes({ temporada: { incluir: true, diario: Number(diarioTemporada) || null } }); }}>
                <div className="field">
                  <label className="label" htmlFor={`${ids}-td`}>Presupuesto diario de la temporada ({moneda})</label>
                  <input id={`${ids}-td`} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={diarioTemporada}
                    placeholder={temporadaCampana?.presupuesto.diario ? `Sugerido: ${temporadaCampana.presupuesto.diario}` : "Sin números: escríbelo"}
                    onChange={(e) => setDiarioTemporada(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-secondary btn-sm" disabled={guardandoAjustes}>Guardar</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={guardandoAjustes}
                  onClick={() => void guardarAjustes({ temporada: { incluir: !plan.temporada.incluida } })}>
                  {plan.temporada.incluida ? "Quitarla del plan" : "Incluir la de temporada"}
                </button>
              </form>
            </section>
          )}

          <section aria-labelledby={`${ids}-camp`} className="plan-campanas">
            <h2 id={`${ids}-camp`} className="plan-subtitulo">Las campañas</h2>
            {plan.campanas.map((c) => (
              <Campana key={c.id} c={c} dinero={dinero} soloLectura={soloLectura} onProducir={() => producir(c)} onCopiar={(t) => void copiar(t, setAviso)} />
            ))}
          </section>

          <section className="plan-tarjeta" aria-labelledby={`${ids}-guia`}>
            <div className="plan-guia-cabeza">
              <h2 id={`${ids}-guia`}>La guía de montaje</h2>
              <span className="hint">{avance.hechos} de {avance.total} pasos</span>
            </div>
            <progress className="plan-progreso" max={avance.total || 1} value={avance.hechos} aria-label={`${avance.hechos} de ${avance.total} pasos hechos`} />
            <p className="hint">En el orden del Ads Manager: los públicos, y en cada campaña la campaña, el primer conjunto con sus anuncios y los demás conjuntos. Lo marcado lo ve todo el equipo.</p>
            {grupos.map((g) => (
              <div key={g.id} className="plan-guia-grupo">
                <h3>{g.titulo}</h3>
                <ol className="plan-pasos">
                  {g.pasos.map((p) => (
                    <Paso key={p.id} p={p} hecho={Boolean(progreso[p.id])} por={progreso[p.id]?.por} soloLectura={soloLectura}
                      onMarcar={(v) => void marcar(p.id, v)} onCopiar={(t) => void copiar(t, setAviso)} />
                  ))}
                </ol>
              </div>
            ))}
          </section>
        </>
      )}

      {estratega && (
        <Suspense fallback={null}>
          <Estratega clients={clients} clienteId={clienteId} cuentaLista={false} moneda={moneda}
            onClienteNuevo={onClienteNuevo} onCrear={() => setEstratega(false)} onCerrar={() => setEstratega(false)} />
        </Suspense>
      )}
      {!cliente && clients.length === 0 && <p className="hint">Crea un cliente para armar su plan.</p>}
    </div>
  );
}

/** Una campaña del plan: presupuesto, conjuntos, anuncios con su pieza y lo que falta. */
function Campana({ c, dinero, soloLectura, onProducir, onCopiar }) {
  const ids = useId();
  const enCampana = c.presupuesto.en === "campana";
  return (
    <article className="plan-tarjeta plan-campana" aria-labelledby={`${ids}-t`}>
      <div className="plan-campana-cabeza">
        <span className="badge plan-etapa" data-etapa={c.etapa}>{c.nombreEtapa}</span>
        <h3 id={`${ids}-t`} className="plan-campana-nombre">{c.nombre}</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCopiar(c.nombre)} aria-label={`Copiar el nombre de la campaña de ${c.nombreEtapa.toLowerCase()}`}>
          <Icon name="copy" size={16} />
        </button>
      </div>
      <dl className="plan-resumen">
        <div><dt>{c.calendario.fin ? "En sus fechas" : "Al mes"}</dt><dd>{dinero(c.presupuesto.mensual)}{c.pct ? <span className="hint"> · {String(c.pct).replace(".", ",")} %</span> : null}</dd></div>
        <div><dt>Al día</dt><dd>{enCampana ? `${dinero(c.presupuesto.diario)} en la campaña` : `${dinero(c.presupuesto.porConjunto)} en cada conjunto`}</dd></div>
        <div><dt>Objetivo</dt><dd>{c.nombreObjetivo}{c.appMensajes ? ` · ${c.appMensajes}` : ""}</dd></div>
        <div><dt>Calendario</dt><dd>{textoCalendario(c)}</dd></div>
      </dl>
      {c.contenido && <p className="plan-contenido">{c.contenido}</p>}
      <p className="hint">
        Tipos de arte: {c.artes.map((a) => tipoArteDe(a)?.nombre).filter(Boolean).join(", ") || "—"} · niveles: {c.niveles.map(nombreDeNivel).filter(Boolean).join(", ")}
      </p>
      <h4 className="plan-mini">Conjuntos</h4>
      <ul className="plan-conjuntos">
        {c.conjuntos.map((x, k) => (
          <li key={x.id}>
            <strong>{k + 1}. {x.nombreCorto}</strong>{!enCampana && x.presupuestoDiario !== null ? <span className="hint"> · {dinero(x.presupuestoDiario)} al día</span> : null}
            <p>{x.publico.texto}</p>
            {x.publico.nombres.length > 0 && <p className="hint">Públicos: {x.publico.nombres.join(", ")}</p>}
            <p className="hint">Excluir: {x.excluye.nombres.length ? x.excluye.nombres.join(", ") : x.excluye.nota || "nada"}</p>
            {x.nota && <p className="hint">{x.nota}</p>}
          </li>
        ))}
      </ul>
      <h4 className="plan-mini">Anuncios ({c.anunciosPorConjunto} por conjunto{c.conjuntos.length > 1 ? ", los mismos en todos" : ""})</h4>
      <ol className="plan-anuncios">
        {Array.from({ length: c.anunciosPorConjunto }, (_, i) => {
          const a = c.anuncios[i];
          const img = a?.pieza.medios.find((m) => /^\/api\/media\//.test(m) && !/\.(mp4|mov|webm)$/i.test(m));
          return (
            <li key={i} className={a ? "" : "plan-falta"}>
              {img ? <img src={img} alt="" width="56" height="56" loading="lazy" /> : <span className="plan-sin-imagen" aria-hidden="true"><Icon name={a ? "image" : "plus"} size={18} /></span>}
              <div>
                {a ? (
                  <>
                    <strong>{a.pieza.titulo}</strong>
                    <p className="hint">{a.origen === "publicada" ? "Lo publicado que mejor funcionó" : "Va a pauta"} · {textoDeLaPieza(a)}</p>
                  </>
                ) : <span className="hint">Por producir</span>}
              </div>
            </li>
          );
        })}
      </ol>
      {c.faltan && !soloLectura && (
        <button type="button" className="btn btn-secondary btn-sm plan-producir" onClick={onProducir}>
          <Icon name="wand" size={16} /> Producir {c.faltan.n === 1 ? "el anuncio que falta" : `los ${c.faltan.n} anuncios que faltan`}
        </button>
      )}
    </article>
  );
}

/** Un paso de la guía: su casilla y lo que se copia. */
function Paso({ p, hecho, por, soloLectura, onMarcar, onCopiar }) {
  const ids = useId();
  return (
    <li className="plan-paso" data-hecho={hecho || undefined}>
      <div className="plan-paso-cabeza">
        <input id={`${ids}-c`} type="checkbox" className="plan-casilla" checked={hecho} disabled={soloLectura} onChange={(e) => onMarcar(e.target.checked)} />
        <label htmlFor={`${ids}-c`}>{p.titulo}</label>
        {hecho && por ? <span className="hint">· {por}</span> : null}
      </div>
      <details className="plan-paso-detalle">
        <summary>Ver qué poner</summary>
        <dl>
          {p.campos.map((f, i) => (
            <div key={`${f.etiqueta}-${i}`} className="plan-campo">
              <dt>{f.etiqueta}</dt>
              <dd>
                {f.enlace ? <a href={f.valor} target="_blank" rel="noopener noreferrer">{f.valor}</a> : <span>{f.valor}</span>}
                {f.copiar && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCopiar(f.valor)} aria-label={`Copiar ${f.etiqueta.toLowerCase()}`}>
                    <Icon name="copy" size={16} />
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {p.nota && <p className="hint">{p.nota}</p>}
        {p.id.startsWith("publico:") && publicoDe(p.id.slice(8))?.web && <p className="hint">Necesita el píxel de Meta en la web.</p>}
      </details>
    </li>
  );
}
