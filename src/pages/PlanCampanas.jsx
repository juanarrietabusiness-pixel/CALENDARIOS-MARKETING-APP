import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { leerCiclo, marcarPasos, guardarAjustesCiclo, guardarAnunciosCiclo, guardarRepartoCiclo, escribirTextosCiclo } from "../lib/planCicloApi";
import {
  guiaDeMontaje, hojasDelPlan, planATextoCiclo, textoCalendario, avanceDeGuia, nombreDelMes, diaCorto, publicoDe, textoDelTotal,
  nombreDeEtapaDelPlan,
} from "../lib/planCiclo";
import { MODOS_PRODUCTOS, CAMPANAS_DEL_PLAN, MAX_LOGRO, limpiarQue, queDeSiempre } from "../lib/anunciosPlan";
import { TEXTOS_POR_NIVEL } from "../lib/textosNivel";
import { REPARTO_POR_DEFECTO, sumaDelReparto, errorDelCiclo } from "../lib/manualCiclo";

import AnunciosDeCampana from "../components/anuncios/AnunciosDelPlan";
import { GLOSARIO } from "../lib/glosarioAnuncios";
import { crearXlsx, MIME_XLSX } from "../lib/xlsx";
import { direccionDelLote } from "../lib/lotePauta";
import { tipoArteDe } from "../lib/tiposArte";
import { nombreDeNivel } from "../lib/consciencia";
import { tipoNegocioDe, ETAPAS_CICLO } from "../lib/cicloVentas";
import { formatoMoneda } from "../lib/anuncios";
import { construirRuta, navegar } from "../lib/rutas";
import { fechaEnZona } from "../lib/agenda";
import "./PlanCampanas.css";

// ============================================================
// Anuncios → Plan de campañas (entrega 6 del curso de campañas: C.1–C.3 de docs/propuesta-curso-campanas.md)
//
// EL sitio donde se elabora TODA la estrategia de anuncios de un cliente para un mes, para montarla en el Ads Manager
// (la app no crea campañas: la creación por la API quedó congelada; decisión de la agencia del 14 de noviembre). Arriba,
// «¿Qué vas a hacer?» (qué campañas, qué productos y lo que se quiere lograr), el presupuesto con el total del mes (el
// ciclo y la temporada aparte), «Repartir a mano» y lo que falta antes de montar; luego cada campaña —para qué sirve, su
// presupuesto, sus conjuntos (públicos y exclusiones) y SUS ANUNCIOS: la publicación sugerida o la que se escoja, cómo
// se monta y sus textos (título, descripción y, subiendo la pieza, los textos principales), escritos a mano o por la
// IA con el nivel de consciencia de cada anuncio—, y la GUÍA DE MONTAJE con sus casillas, en el orden del Ads Manager,
// que ve todo el equipo. «Descargar el Excel» lo entrega como el Excel de estrategia de la agencia (sus 5 hojas y la de
// los textos de los anuncios) y «Copiar como texto», para mandarlo.
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
  const [ocupado, setOcupado] = useState("");
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

  /** Lo decidido de un hueco de anuncio (null: vuelve a lo sugerido). → si se guardó. */
  const guardarAnuncio = async (slot, cambio) => {
    setAviso(null);
    try {
      const r = await guardarAnunciosCiclo(clienteId, mes, { [slot]: cambio });
      setDatos(r);
      setAviso({ ok: true, texto: cambio?.textos ? `Textos guardados${r.enPublicaciones ? " (también en la publicación)" : ""}.` : cambio === null ? "Vuelve a lo que sugiere el plan." : "Anuncio cambiado." });
      return true;
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
      return false;
    }
  };

  /** Los textos de unos anuncios por la IA, de 8 en 8 (lo que escribe el servidor en una llamada). */
  const escribir = async (slots, { clave = "", reescribir = false } = {}) => {
    setOcupado(clave || slots[0]);
    setAviso(null);
    try {
      let r = null;
      let escritos = 0;
      for (let i = 0; i < slots.length; i += 8) {
        r = await escribirTextosCiclo(clienteId, mes, slots.slice(i, i + 8), { reescribir });
        escritos += r.escritos ?? 0;
      }
      if (r) setDatos({ plan: r.plan, guardado: r.guardado, avance: r.avance, numeroMagico: r.numeroMagico ?? null });
      setAviso({ ok: true, texto: `${escritos === 1 ? "Escrito el texto de 1 anuncio" : `Escritos los textos de ${escritos} anuncios`}: revísalos antes de montarlos.${r?.aviso ? ` ${r.aviso}` : ""}` });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setOcupado("");
  };

  const guardarReparto = async (reparto) => {
    setAviso(null);
    try {
      setDatos(await guardarRepartoCiclo(clienteId, mes, reparto));
      setAviso({ ok: true, texto: reparto ? "Reparto a mano guardado: se queda para los meses siguientes." : "Vuelve al reparto estándar del Manual." });
      return true;
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
      return false;
    }
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
    const frios = Object.keys(c.faltan.niveles ?? {}).some((n) => n === "inconsciente" || n === "problema");
    const pide = [
      `Anuncios para la campaña de ${c.nombreEtapa.toLowerCase()}${artes.length ? `, cada uno de un tipo de arte distinto entre ${artes.slice(0, 3).join(", ")}` : ""}.`,
      frios ? "Los de nivel inconsciente o problema hablan del problema: sin el producto en el centro ni el precio." : "",
      "Dos con el mismo tipo de arte y la misma composición son un solo anuncio para Meta: que se distingan a la vista.",
      c.id === "temporada" && plan.temporada?.ofertas ? `La oferta: ${plan.temporada.ofertas}.` : "",
      plan.que?.logro ? `Lo que se quiere lograr: ${plan.que.logro}` : "",
    ].filter(Boolean).join(" ");
    navegar(direccionDelLote(construirRuta({ cliente: clienteId, pestana: "crear", seccion: "galeria" }), c.faltan, pide));
  };

  const grupos = useMemo(() => {
    const salida = [];
    for (const p of guia) {
      const ult = salida[salida.length - 1];
      if (ult?.id === p.grupo) ult.pasos.push(p);
      else salida.push({ id: p.grupo, titulo: p.grupo === "publicos" ? "Antes de empezar" : `${nombreDeEtapaDelPlan(p.grupo)}: ${plan?.campanas.find((c) => c.id === p.grupo)?.nombre ?? p.grupo}`, pasos: [p] });
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
              Toda la estrategia de anuncios de un cliente para un mes, lista para montarla en el Ads Manager: qué campañas, su
              presupuesto, sus públicos, qué anuncio va en cada conjunto y sus textos. La aplicación no crea las campañas: las
              montas tú siguiendo la guía de abajo.
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
              <div><dt>Número mágico</dt><dd>{datos?.numeroMagico?.valor != null
                ? <>{dinero(datos.numeroMagico.valor)} por {datos.numeroMagico.resultado || "resultado"} <span className="hint">· lo máximo a pagar sin perder, el mismo para todas las campañas</span></>
                : <span className="hint">{datos?.numeroMagico?.falta?.[0]?.texto || "Completa los números del negocio del cliente para saberlo."}</span>}
                <QueEs titulo="¿Qué es el número mágico?">{GLOSARIO.numeroMagico}</QueEs></dd></div>
              <div><dt>Inversión del ciclo</dt><dd>{dinero(plan.inversion)}{plan.inversionDe ? <span className="hint"> · {ORIGEN_INVERSION[plan.inversionDe]}</span> : null}</dd></div>
              {textoDelTotal(plan) && <div><dt>Total del mes</dt><dd>{textoDelTotal(plan, dinero)}</dd></div>}
              <div><dt>Reparto{plan.repartoAMano ? " (a mano)" : ""}</dt><dd>{plan.reparto.map((r) => `${r.nombre} ${String(r.pct).replace(".", ",")} %`).join(" · ") || "—"}</dd></div>
              <div><dt>Anuncios por conjunto</dt><dd>{plan.anunciosPorConjunto} <span className="hint">(evaluación 4 como mucho, ascensión 3)</span></dd></div>
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
            <RepartoAMano key={`${clienteId}-${JSON.stringify(plan.repartoBase)}`} plan={plan} dinero={dinero} soloLectura={soloLectura} onGuardar={guardarReparto} />
            <p className="hint">El reparto estándar y los anuncios por conjunto se cambian en Ajustes → Cómo trabajamos → Manual de campañas.</p>
          </section>

          <QueVasAHacer key={`${clienteId}-${mes}-${JSON.stringify(plan.que)}`} plan={plan} soloLectura={soloLectura} ocupado={guardandoAjustes}
            onGuardar={(que) => void guardarAjustes({ que })} />

          {plan.avisos.length > 0 && (
            <section aria-labelledby={`${ids}-avisos`} className="plan-avisos">
              <h2 id={`${ids}-avisos`} className="plan-subtitulo">Antes de montar</h2>
              <p className="hint">En rojo, lo que hay que arreglar antes de lanzar; en ámbar, lo que conviene revisar.</p>
              <ul>
                {[...plan.avisos].sort((a, b) => Number(b.grave) - Number(a.grave)).map((a, i) => (
                  <li key={`${a.codigo}-${i}`} className={`notice ${a.grave ? "notice-error" : "notice-warn"}`}>
                    <Icon name={a.grave ? "alert" : "info"} size={16} />
                    <span><strong>{a.grave ? "Arréglalo antes de lanzar: " : "Revisa: "}</strong>{a.texto}</span>
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
              <Campana key={c.id} c={c} plan={plan} cliente={cliente} dinero={dinero} soloLectura={soloLectura} ocupado={ocupado}
                onProducir={() => producir(c)} onCopiar={(t) => void copiar(t, setAviso)} onGuardarAnuncio={guardarAnuncio} onEscribir={escribir} />
            ))}
          </section>

          <section className="plan-tarjeta" aria-labelledby={`${ids}-guia`}>
            <div className="plan-guia-cabeza">
              <h2 id={`${ids}-guia`}>La guía de montaje</h2>
              <span className="hint">{avance.hechos} de {avance.total} pasos</span>
            </div>
            <progress className="plan-progreso" max={avance.total || 1} value={avance.hechos} aria-label={`${avance.hechos} de ${avance.total} pasos hechos`} />
            <p className="hint">
              Los pasos en el orden del Ads Manager: primero lo de antes de empezar (los públicos que hay que crear), y en cada
              campaña: crear la campaña, crear el primer conjunto, ponerle sus anuncios con sus textos y duplicar el conjunto para
              los demás públicos. Abre «Ver qué poner» y copia cada valor. Marca cada paso al terminarlo: lo ve todo el equipo.
            </p>
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

/** «¿Qué es esto?»: una explicación corta junto a donde aparece el término (se ve también en el teléfono). */
function QueEs({ children, titulo = "¿Qué es esto?" }) {
  return (
    <details className="plan-ayuda">
      <summary>{titulo}</summary>
      <div>{children}</div>
    </details>
  );
}

/** «¿Qué vas a hacer?»: qué campañas, qué productos y lo que se quiere lograr. Se guarda con el plan del mes. */
function QueVasAHacer({ plan, soloLectura, ocupado, onGuardar }) {
  const ids = useId();
  const [q, setQ] = useState(() => limpiarQue(plan.que));
  const todas = !q.campanas.length;
  const cambiar = (x) => setQ((a) => ({ ...a, ...x }));
  const marcarCampana = (id, si) => cambiar({ campanas: si ? [...q.campanas, id] : q.campanas.filter((c) => c !== id) });
  const marcarProducto = (id, si) => cambiar({ productoIds: si ? [...q.productoIds, id] : q.productoIds.filter((x) => x !== id) });
  const iguales = JSON.stringify(limpiarQue(q)) === JSON.stringify(limpiarQue(plan.que));
  const catalogo = plan.catalogo ?? [];
  return (
    <section className="plan-tarjeta" aria-labelledby={`${ids}-t`}>
      <h2 id={`${ids}-t`}>¿Qué vas a hacer este mes?</h2>
      <p className="hint">Dile al plan qué campañas vas a montar y de qué productos: el presupuesto, las piezas sugeridas y los textos se arman con eso.</p>
      <form className="plan-que" onSubmit={(e) => { e.preventDefault(); onGuardar(limpiarQue(q)); }}>
        <fieldset disabled={soloLectura}>
          <legend className="label">Qué campañas</legend>
          <label className="plan-opcion"><input type="radio" name={`${ids}-c`} checked={todas} onChange={() => cambiar({ campanas: [] })} /> El ciclo completo (lo que toca a la cuenta)</label>
          <label className="plan-opcion"><input type="radio" name={`${ids}-c`} checked={!todas} onChange={() => cambiar({ campanas: plan.campanas.map((c) => c.id) })} /> Sólo las que escoja</label>
          {!todas && (
            <div className="plan-casillas">
              {CAMPANAS_DEL_PLAN.map((id) => (
                <label key={id} className="plan-opcion"><input type="checkbox" checked={q.campanas.includes(id)} onChange={(e) => marcarCampana(id, e.target.checked)} /> {nombreDeEtapaDelPlan(id)}</label>
              ))}
            </div>
          )}
          {!todas && !q.campanas.length && <p className="hint" role="status">Marca al menos una (sin ninguna, va el ciclo completo).</p>}
        </fieldset>
        <fieldset disabled={soloLectura}>
          <legend className="label">De qué productos</legend>
          {MODOS_PRODUCTOS.map((m) => (
            <label key={m.id} className="plan-opcion">
              <input type="radio" name={`${ids}-p`} checked={q.productos === m.id} onChange={() => cambiar({ productos: m.id, productoIds: m.id === "todos" ? [] : q.productoIds })} />
              <span>{m.nombre} <span className="hint">— {m.ayuda}</span></span>
            </label>
          ))}
          {q.productos !== "todos" && catalogo.length > 0 && (
            <div className="plan-casillas">
              {catalogo.map((p) => (
                <label key={p.id} className="plan-opcion">
                  <input type={q.productos === "foco" ? "radio" : "checkbox"} name={`${ids}-pp`} checked={q.productos === "foco" ? (q.productoIds[0] ?? plan.foco?.id) === p.id : q.productoIds.includes(p.id)}
                    onChange={(e) => (q.productos === "foco" ? cambiar({ productoIds: [p.id] }) : marcarProducto(p.id, e.target.checked))} />
                  {p.nombre}{p.precio ? <span className="hint"> · {p.precio}</span> : null}
                </label>
              ))}
            </div>
          )}
          {!catalogo.length && <p className="hint">El cliente no tiene catálogo: se arma de la marca en general (Marca → Cerebro → estudio de mercado).</p>}
        </fieldset>
        <div className="field">
          <label className="label" htmlFor={`${ids}-l`}>Lo que quieres lograr (opcional)</label>
          <textarea id={`${ids}-l`} className="input" rows={2} maxLength={MAX_LOGRO} value={q.logro} readOnly={soloLectura}
            placeholder="Ej.: vender 20 sofás cama antes de Navidad; que nos escriban por el combo de muebles; dar a conocer la tienda nueva."
            onChange={(e) => cambiar({ logro: e.target.value })} />
          <p className="hint">La IA lo lee al escribir los textos de los anuncios.</p>
        </div>
        {!soloLectura && (
          <div className="plan-anuncio-acciones">
            <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado || iguales}>{ocupado ? "Rehaciendo…" : "Rehacer el plan con esto"}</button>
            {!queDeSiempre(plan.que) && <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onGuardar(limpiarQue({}))}>Volver a lo de siempre</button>}
          </div>
        )}
      </form>
    </section>
  );
}

/** «Repartir a mano»: el % de cada etapa para ESTE cliente (suma 100), con el monto al lado; se queda para los meses siguientes. */
function RepartoAMano({ plan, dinero, soloLectura, onGuardar }) {
  const ids = useId();
  const [abierto, setAbierto] = useState(false);
  const [r, setR] = useState(() => ({ ...REPARTO_POR_DEFECTO, ...(plan.repartoBase ?? {}) }));
  const [guardando, setGuardando] = useState(false);
  const suma = sumaDelReparto(r);
  const error = errorDelCiclo({ reparto: r });
  const guardar = async (valor) => {
    setGuardando(true);
    const ok = await onGuardar(valor);
    setGuardando(false);
    if (ok) setAbierto(false);
  };
  return (
    <div className="plan-reparto">
      <p className="hint">
        {plan.repartoAMano ? "Este cliente tiene el reparto a mano (se queda para los meses siguientes hasta «Volver al estándar»)." : "El reparto es el estándar del Manual de la agencia."}
      </p>
      <QueEs titulo="¿Qué es el reparto?">
        <p>Cómo se divide la inversión del mes entre las campañas del ciclo de ventas. Lo normal es 60 % a Presentación (gente que no te conoce), 20 % a Evaluación (quien ya te vio), 10 % a Conversión (quien ya te escribió) y 10 % a Ascensión (quien ya te compró). La campaña de temporada va aparte.</p>
      </QueEs>
      {!soloLectura && (
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={abierto} aria-controls={`${ids}-f`} onClick={() => setAbierto((x) => !x)}>
          <Icon name={abierto ? "chevronUp" : "chevronDown"} size={16} /> Repartir a mano
        </button>
      )}
      {abierto && (
        <form id={`${ids}-f`} className="plan-reparto-form" onSubmit={(e) => { e.preventDefault(); if (!error) void guardar(r); }}>
          {ETAPAS_CICLO.map((e) => (
            <div className="field" key={e.id}>
              <label className="label" htmlFor={`${ids}-${e.id}`}>{e.nombre} (%)</label>
              <input id={`${ids}-${e.id}`} className="input" type="number" inputMode="numeric" min="0" max="100" step="1" value={r[e.id] ?? ""}
                aria-describedby={`${ids}-m-${e.id}`} onChange={(ev) => setR((x) => ({ ...x, [e.id]: ev.target.value === "" ? "" : Math.max(0, Math.min(100, Math.round(Number(ev.target.value) || 0))) }))} />
              <span id={`${ids}-m-${e.id}`} className="hint">{plan.inversion ? `${dinero((plan.inversion * (Number(r[e.id]) || 0)) / 100)} al mes` : "sin inversión"}</span>
            </div>
          ))}
          <p className={error ? "cerebro-error" : "hint"} role={error ? "alert" : "status"}>{error || `Suma ${suma} %.`}</p>
          <div className="plan-anuncio-acciones">
            <button type="submit" className="btn btn-primary btn-sm" disabled={Boolean(error) || guardando}>Guardar el reparto de este cliente</button>
            {plan.repartoAMano && <button type="button" className="btn btn-ghost btn-sm" disabled={guardando} onClick={() => void guardar(null)}>Volver al estándar</button>}
          </div>
        </form>
      )}
    </div>
  );
}

/** Una campaña del plan: para qué sirve, presupuesto, conjuntos y sus anuncios con sus textos. */
function Campana({ c, plan, cliente, dinero, soloLectura, ocupado, onProducir, onCopiar, onGuardarAnuncio, onEscribir }) {
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
      {c.para && <p className="plan-para">{c.para}</p>}
      <dl className="plan-resumen">
        <div><dt>{c.calendario.fin ? "En sus fechas" : "Al mes"}</dt><dd>{dinero(c.presupuesto.mensual)}{c.pct ? <span className="hint"> · {String(c.pct).replace(".", ",")} %</span> : null}</dd></div>
        <div><dt>Al día</dt><dd>{enCampana ? `${dinero(c.presupuesto.diario)} en la campaña` : `${dinero(c.presupuesto.porConjunto)} en cada conjunto`}</dd></div>
        <div><dt>Objetivo</dt><dd>{c.nombreObjetivo}{c.appMensajes ? ` · ${c.appMensajes}` : ""}</dd></div>
        <div><dt>Calendario</dt><dd>{textoCalendario(c)}</dd></div>
      </dl>
      <QueEs titulo={enCampana ? "¿Por qué el presupuesto va en la campaña?" : "¿Por qué el presupuesto va en cada conjunto?"}>
        <p>{enCampana
          ? "Con el «presupuesto de la campaña Advantage+» activado, Meta reparte el dinero del día entre los conjuntos según cuál rinda mejor. Se usa en las campañas pequeñas o de públicos que ya te conocen."
          : "En Presentación cada conjunto (cada público) lleva su presupuesto diario: así se compara qué público funciona mejor con el mismo dinero."}</p>
      </QueEs>
      {c.contenido && <p className="plan-contenido">{c.contenido}</p>}
      <p className="hint">
        Tipos de arte: {c.artes.map((a) => tipoArteDe(a)?.nombre).filter(Boolean).join(", ") || "—"} · niveles: {c.niveles.map(nombreDeNivel).filter(Boolean).join(", ")}
      </p>
      <QueEs titulo="¿Qué es el nivel de consciencia?">
        <p>Lo que sabe de ti quien ve el anuncio. Cada anuncio se escribe para un nivel:</p>
        <ul>{TEXTOS_POR_NIVEL.map((x) => <li key={x.nivel}><strong>{x.nombre}:</strong> {x.sabe} {x.hablale}</li>)}</ul>
      </QueEs>
      <h4 className="plan-mini">Conjuntos (a quién le habla)</h4>
      <ul className="plan-conjuntos">
        {c.conjuntos.map((x, k) => (
          <li key={x.id}>
            <strong>{k + 1}. {x.nombreCorto}</strong>{!enCampana && x.presupuestoDiario !== null ? <span className="hint"> · {dinero(x.presupuestoDiario)} al día</span> : null}
            <p>{x.publico.texto}</p>
            {x.publico.nombres.length > 0 && <p className="hint">Públicos: {x.publico.nombres.join(", ")}</p>}
            <p className="hint">Excluir (que no lo vean): {x.excluye.nombres.length ? x.excluye.nombres.join(", ") : x.excluye.nota || "nada"}</p>
            {x.nota && <p className="hint">{x.nota}</p>}
          </li>
        ))}
      </ul>
      <AnunciosDeCampana c={c} plan={plan} cliente={cliente} soloLectura={soloLectura} ocupado={ocupado}
        onGuardar={onGuardarAnuncio} onEscribir={onEscribir} onCopiar={onCopiar} />
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
