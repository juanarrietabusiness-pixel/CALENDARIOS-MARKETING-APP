import { useEffect, useId, useMemo, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import * as api from "../../lib/anunciosApi";
import { leerMercado, guardarCatalogo } from "../../lib/mercado";
import { productosActivos, ELEMENTOS_MERCADO, limpiarCatalogo } from "../../lib/estudioMercado";
import { OBJETIVOS, DESTINOS, TIPOS_CONJUNTO, formatoMoneda } from "../../lib/anuncios";
import {
  economia, escenarios, planABorrador, planATexto, TIPOS_OFERTA, ETAPAS_EMBUDO,
} from "../../lib/estratega";
import { fechaEnZona } from "../../lib/agenda";
import "./Estratega.css";

// ============================================================
// El estratega de campañas
//
// Para un cliente del calendario lee solo lo que se sabe (cerebro,
// catálogo, estudio de mercado, el manual de la agencia); para un producto
// que no está en el catálogo o para alguien que no es cliente, se escribe
// lo que haya y él saca las 7 maletas. Devuelve el plan: embudo, cuentas
// (las hace el código), tres escenarios, públicos, de 4 a 6 anuncios con
// sus textos y mejoras de oferta como sugerencia. Se ajusta hablándole, se
// guarda, se copia, y «Crear la campaña con esto» abre «Nueva campaña» con
// todo puesto (se crea en pausa, como siempre).
//
// «Pegar el plan del otro bot» pasa a esta forma un plan escrito fuera.
// ============================================================

const DINERO = (n, moneda) => (n == null ? "—" : formatoMoneda(n, moneda));

function Copiar({ texto, etiqueta }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Copiar ${etiqueta}`}
      onClick={async () => { try { await navigator.clipboard.writeText(texto); setHecho(true); setTimeout(() => setHecho(false), 1500); } catch { /* sin portapapeles */ } }}>
      <Icon name={hecho ? "check" : "copy"} size={14} /> {hecho ? "Copiado" : "Copiar"}
    </button>
  );
}

function Plan({ r, moneda, diario, dias }) {
  const { plan, eco } = r;
  const filas = escenarios({ diario: plan.presupuesto.diario || diario, dias: plan.presupuesto.dias || dias, costos: plan.costos, eco });
  const c = plan.campana;
  return (
    <div className="est-plan">
      {plan.resumen && <p className="est-resumen">{plan.resumen}</p>}

      {plan.embudo.length > 0 && (
        <section aria-label="Embudo">
          <h3>Embudo</h3>
          <ol className="est-embudo">
            {plan.embudo.map((e, i) => <li key={i}><strong>{ETAPAS_EMBUDO[e.etapa]}</strong> · {e.objetivo}<span className="hint"> {e.idea}</span></li>)}
          </ol>
        </section>
      )}

      <section aria-label="Las cuentas">
        <h3>Las cuentas</h3>
        {eco ? (
          <dl className="est-cuentas">
            <div><dt>Ganancia por venta</dt><dd>{DINERO(eco.ganancia, moneda)}</dd></div>
            <div><dt>Compran</dt><dd>{eco.tasaCierre} de cada 100</dd></div>
            <div><dt>Costo máximo por resultado</dt><dd><strong>{DINERO(eco.costoMaxResultado, moneda)}</strong> <span className="hint">(no se pierde)</span></dd></div>
            <div><dt>Para ganar</dt><dd><strong>{DINERO(eco.costoObjetivo, moneda)}</strong> <span className="hint">o menos por resultado</span></dd></div>
          </dl>
        ) : <p className="hint">Sin precio o sin margen no hay cuentas: escríbelos y vuelve a armarlo.</p>}
        {filas.length > 0 && (
          <div className="est-tabla-envoltura">
            <table className="est-tabla">
              <caption className="sr-only">Escenarios</caption>
              <thead><tr><th scope="col">Escenario</th><th scope="col">Inversión</th><th scope="col">Costo por resultado</th><th scope="col">Resultados</th>{eco && <><th scope="col">Ventas</th><th scope="col">Ganancia</th></>}</tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <th scope="row">{f.nombre}</th><td>{DINERO(f.inversion, moneda)}</td><td>{DINERO(f.costoResultado, moneda)}</td><td>{f.resultados}</td>
                    {eco && <><td>{f.ventas}</td><td data-signo={f.ganancia < 0 ? "-" : "+"}>{DINERO(f.ganancia, moneda)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(plan.presupuesto.porque || plan.costos.porque) && <p className="hint">{[plan.presupuesto.porque, plan.costos.porque].filter(Boolean).join(" ")}</p>}
      </section>

      <section aria-label="La campaña">
        <h3>La campaña · {OBJETIVOS[c.objetivo]?.nombre}{c.destino === "whatsapp" ? " a WhatsApp" : ""}</h3>
        <ul className="est-lista">
          {c.conjuntos.map((x, i) => (
            <li key={i}>
              <strong>{TIPOS_CONJUNTO[x.tipo]?.nombre}</strong> · {x.presupuestoDiario ? `${DINERO(x.presupuestoDiario, moneda)} al día` : "—"} · {x.edadMin}–{x.edadMax}{x.lugar ? ` · ${x.lugar}` : ""}
              {x.intereses.length > 0 && <span className="hint"> · {x.intereses.join(", ")}</span>}
              {x.porque && <span className="hint"> — {x.porque}</span>}
            </li>
          ))}
        </ul>
        <ol className="est-anuncios">
          {c.anuncios.map((a, i) => (
            <li key={i}>
              <div className="est-anuncio-cabeza">
                <strong>{a.angulo || `Anuncio ${i + 1}`}</strong>
                <span className="hint">{a.formato === "carrusel" ? `Carrusel de ${a.tarjetas.length}` : "Imagen o video"}</span>
                <Copiar texto={[a.texto, a.titulo && `Título: ${a.titulo}`, a.descripcion && `Descripción: ${a.descripcion}`].filter(Boolean).join("\n")} etiqueta={`el anuncio ${i + 1}`} />
              </div>
              {a.pieza && <p className="hint"><Icon name="image" size={12} /> {a.pieza}</p>}
              <p className="est-texto">{a.texto}</p>
              {(a.titulo || a.descripcion) && <p className="hint">{[a.titulo, a.descripcion].filter(Boolean).join(" · ")}</p>}
              {a.tarjetas.length > 0 && <p className="hint">{a.tarjetas.map((t, j) => `${j + 1}. ${t.titulo}`).join(" · ")}</p>}
            </li>
          ))}
        </ol>
      </section>

      {plan.ofertas.length > 0 && (
        <section aria-label="Mejoras de oferta">
          <h3>Mejoras de oferta <span className="hint">(sugerencia para hablar con el cliente)</span></h3>
          <ul className="est-lista">{plan.ofertas.map((o, i) => <li key={i}><strong>{TIPOS_OFERTA[o.tipo]}</strong>: {o.texto}</li>)}</ul>
        </section>
      )}

      {Object.keys(plan.maletas).length > 0 && (
        <details className="est-maletas">
          <summary>Las 7 maletas</summary>
          <dl>{ELEMENTOS_MERCADO.filter((e) => plan.maletas[e.clave]).map((e) => <div key={e.clave}><dt>{e.titulo}</dt><dd>{plan.maletas[e.clave]}</dd></div>)}</dl>
        </details>
      )}

      {(plan.pasos.length > 0 || plan.riesgos.length > 0) && (
        <section aria-label="Antes de activar">
          <h3>Antes de activar</h3>
          <ul className="est-lista">{plan.pasos.map((p, i) => <li key={i}>{p}</li>)}</ul>
          {plan.riesgos.length > 0 && <ul className="est-lista est-riesgos">{plan.riesgos.map((p, i) => <li key={i}><Icon name="alert" size={12} /> {p}</li>)}</ul>}
        </section>
      )}
      {r.fuentes?.length > 0 && <p className="hint">Buscó en: {r.fuentes.slice(0, 5).join(" · ")}</p>}
    </div>
  );
}

export default function Estratega({ clients = [], clienteId = "", cuentaLista = false, moneda = "USD", zona = "America/Panama", onCrear, onClienteNuevo, onCerrar }) {
  const ids = useId();
  const [para, setPara] = useState(clienteId ? "cliente" : "fuera");
  const [cliente, setCliente] = useState(clienteId);
  const [catalogo, setCatalogo] = useState(null);
  const [productoId, setProductoId] = useState("");
  const [otro, setOtro] = useState({ nombre: "", precio: "", descripcion: "" });
  const [externo, setExterno] = useState({ nombre: "", rubro: "", lugar: "Panamá", enlaces: "", info: "" });
  const [cifras, setCifras] = useState({ margen: "", margenTipo: "%", tasaCierre: "", diario: "", dias: "30" });
  const [objetivo, setObjetivo] = useState("OUTCOME_SALES");
  const [destino, setDestino] = useState("whatsapp");
  const [notas, setNotas] = useState("");
  const [conWeb, setConWeb] = useState(false);
  const [conMaletas, setConMaletas] = useState(false);
  const [pegar, setPegar] = useState(false);
  const [planPegado, setPlanPegado] = useState("");
  const [r, setR] = useState(null);
  const [cambio, setCambio] = useState("");
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null);
  const [guardadoId, setGuardadoId] = useState(null);
  const [planesGuardados, setPlanesGuardados] = useState([]);
  const ref = useDialogA11y(() => { if (!trabajando) onCerrar(); });
  const hoy = useMemo(() => fechaEnZona(new Date(), zona), [zona]);
  const nombreCliente = clients.find((c) => c.id === cliente)?.name ?? "";

  useEffect(() => {
    api.planes().then(setPlanesGuardados).catch(() => setPlanesGuardados([]));
  }, []);
  useEffect(() => {
    if (para !== "cliente" || !cliente) { setCatalogo(null); return; }
    setCatalogo(null);
    leerMercado(cliente).then((m) => {
      setCatalogo(m.catalogo ?? []);
      const activos = productosActivos(m.catalogo ?? []);
      setProductoId(activos[0]?.id ?? "otro");
    }).catch(() => { setCatalogo([]); setProductoId("otro"); });
  }, [para, cliente]);

  const activos = catalogo ? productosActivos(catalogo) : [];
  const elegido = activos.find((p) => p.id === productoId) ?? null;
  const productoNombre = para === "cliente" && elegido ? elegido.nombre : otro.nombre;
  const precio = para === "cliente" && elegido ? elegido.precio : otro.precio;
  const eco = economia({ precio, margen: cifras.margen, margenTipo: cifras.margenTipo, tasaCierre: cifras.tasaCierre || undefined });
  const ocupado = Boolean(trabajando);

  const armar = async ({ conCambio = false } = {}) => {
    setTrabajando(conCambio ? "cambio" : "plan");
    setAviso(null);
    try {
      const datos = {
        ...(para === "cliente" ? { clientId: cliente, ...(elegido ? { productoId: elegido.id } : { producto: otro }) } : { externo, producto: otro }),
        margen: cifras.margen, margenTipo: cifras.margenTipo, tasaCierre: cifras.tasaCierre || undefined,
        diario: Number(cifras.diario) || 0, dias: Number(cifras.dias) || 30, objetivo, destino, notas, conWeb, conMaletas,
        ...(pegar && planPegado.trim() ? { planPegado } : {}),
        ...(conCambio && r ? { anterior: r.plan, cambio } : {}),
      };
      const nuevo = await api.armarPlan(datos);
      setR(nuevo);
      setCambio("");
      setAviso(nuevo.aviso ? { ok: false, texto: nuevo.aviso } : null);
      window.dispatchEvent(new Event("ia:gasto"));
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setTrabajando("");
  };

  const guardar = async () => {
    setTrabajando("guardar");
    try {
      const nombre = `${para === "cliente" ? nombreCliente : externo.nombre} · ${productoNombre || "Plan"} · ${hoy}`;
      const g = await api.guardarPlan({ id: guardadoId, clienteId: para === "cliente" ? cliente : null, nombre, datos: { ...r, para, externo, cifras, objetivo, destino } });
      setGuardadoId(g.id);
      setPlanesGuardados((l) => [g, ...l.filter((x) => x.id !== g.id)]);
      setAviso({ ok: true, texto: "Plan guardado." });
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setTrabajando("");
  };

  const abrirGuardado = (id) => {
    const g = planesGuardados.find((x) => x.id === id);
    if (!g) return;
    const d = g.datos ?? {};
    setR({ plan: d.plan, eco: d.eco, producto: d.producto, fuentes: d.fuentes ?? [] });
    setGuardadoId(g.id);
    if (d.para) setPara(d.para);
    if (g.clientId) setCliente(g.clientId);
    if (d.externo) setExterno(d.externo);
    if (d.cifras) setCifras(d.cifras);
    if (d.objetivo) setObjetivo(d.objetivo);
    if (d.destino) setDestino(d.destino);
  };

  const anadirAlCatalogo = async () => {
    setTrabajando("catalogo");
    try {
      const nuevo = { nombre: otro.nombre, precio: otro.precio, beneficios: otro.descripcion, tipo: "producto", activo: true };
      const g = await guardarCatalogo(cliente, limpiarCatalogo([...(catalogo ?? []), nuevo]));
      setCatalogo(g.catalogo);
      setProductoId(g.catalogo.at(-1)?.id ?? "otro");
      setAviso({ ok: true, texto: `«${otro.nombre}» quedó en el catálogo de ${nombreCliente}.` });
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setTrabajando("");
  };

  const crearCliente = async () => {
    setTrabajando("cliente");
    try {
      const c = await onClienteNuevo({ name: externo.nombre, industry: externo.rubro });
      if (otro.nombre) await guardarCatalogo(c.dbId || c.id, limpiarCatalogo([{ nombre: otro.nombre, precio: otro.precio, beneficios: otro.descripcion, tipo: "producto", activo: true }]));
      setAviso({ ok: true, texto: `«${externo.nombre}» ya es cliente${otro.nombre ? `, con «${otro.nombre}» en su catálogo` : ""}. Asígnale su página y su cuenta publicitaria para crear la campaña.` });
    } catch (e) { setAviso({ ok: false, texto: e.message }); }
    setTrabajando("");
  };

  const crearCampana = () => onCrear(planABorrador(r.plan, { hoy, cliente: nombreCliente, producto: r.producto?.nombre || productoNombre }), cliente);
  const texto = r ? planATexto(r.plan, {
    marca: para === "cliente" ? nombreCliente : externo.nombre, eco: r.eco,
    filas: escenarios({ diario: r.plan.presupuesto.diario || Number(cifras.diario), dias: r.plan.presupuesto.dias || Number(cifras.dias), costos: r.plan.costos, eco: r.eco }),
  }) : "";
  const puedeArmar = para === "cliente"
    ? Boolean(cliente && (elegido || otro.nombre.trim() || (pegar && planPegado.trim())))
    : Boolean(externo.nombre.trim() && (otro.nombre.trim() || (pegar && planPegado.trim())));

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="sheet est-estratega" tabIndex={-1}>
        <div className="sheet-header">
          <div>
            <h2 id={`${ids}-t`} className="est-titulo"><Icon name="sparkles" size={18} /> Estratega de campañas</h2>
            <p className="hint" style={{ margin: 0 }}>El plan de la campaña con lo que ya sabemos del cliente. No toca Meta: lo creas tú en pausa.</p>
          </div>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          {planesGuardados.length > 0 && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-guardados`}>Planes guardados</label>
              <select id={`${ids}-guardados`} className="input" value={guardadoId ?? ""} onChange={(e) => abrirGuardado(e.target.value)}>
                <option value="">Uno nuevo</option>
                {planesGuardados.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </div>
          )}

          <div className="segmented" role="group" aria-label="Para quién">
            <button type="button" className={`segmented-btn ${para === "cliente" ? "active" : ""}`} aria-pressed={para === "cliente"} onClick={() => setPara("cliente")} disabled={!clients.length}>Un cliente del calendario</button>
            <button type="button" className={`segmented-btn ${para === "fuera" ? "active" : ""}`} aria-pressed={para === "fuera"} onClick={() => setPara("fuera")}>Alguien de fuera</button>
          </div>

          {para === "cliente" ? (
            <div className="est-fila">
              <div className="field">
                <label className="label" htmlFor={`${ids}-cliente`}>Cliente</label>
                <select id={`${ids}-cliente`} className="input" value={cliente} onChange={(e) => setCliente(e.target.value)}>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-producto`}>Qué se anuncia</label>
                <select id={`${ids}-producto`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)} disabled={catalogo === null}>
                  {catalogo === null && <option value="">Leyendo el catálogo…</option>}
                  {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.precio ? ` · ${p.precio}` : ""}</option>)}
                  <option value="otro">Otro producto o servicio (no está en el catálogo)</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="est-fila">
              <div className="field"><label className="label" htmlFor={`${ids}-en`}>Negocio</label><input id={`${ids}-en`} className="input" value={externo.nombre} maxLength={120} onChange={(e) => setExterno({ ...externo, nombre: e.target.value })} placeholder="Ej.: Pan Rico" /></div>
              <div className="field"><label className="label" htmlFor={`${ids}-er`}>Rubro</label><input id={`${ids}-er`} className="input" value={externo.rubro} maxLength={120} onChange={(e) => setExterno({ ...externo, rubro: e.target.value })} placeholder="Ej.: Panadería" /></div>
              <div className="field"><label className="label" htmlFor={`${ids}-el`}>Dónde vende</label><input id={`${ids}-el`} className="input" value={externo.lugar} maxLength={200} onChange={(e) => setExterno({ ...externo, lugar: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor={`${ids}-ew`}>Instagram o web</label><input id={`${ids}-ew`} className="input" value={externo.enlaces} maxLength={300} onChange={(e) => setExterno({ ...externo, enlaces: e.target.value })} placeholder="@panrico · panrico.com" /></div>
              <div className="field est-ancho"><label className="label" htmlFor={`${ids}-ei`}>Lo que sabemos (público, diferenciador, testimonios…)</label><textarea id={`${ids}-ei`} className="textarea" rows={3} maxLength={6000} value={externo.info} onChange={(e) => setExterno({ ...externo, info: e.target.value })} /></div>
            </div>
          )}

          {(para === "fuera" || productoId === "otro") && (
            <div className="est-fila">
              <div className="field"><label className="label" htmlFor={`${ids}-pn`}>Producto o servicio</label><input id={`${ids}-pn`} className="input" value={otro.nombre} maxLength={120} onChange={(e) => setOtro({ ...otro, nombre: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor={`${ids}-pp`}>Precio</label><input id={`${ids}-pp`} className="input" value={otro.precio} maxLength={60} onChange={(e) => setOtro({ ...otro, precio: e.target.value })} placeholder="Ej.: $35" /></div>
              <div className="field est-ancho"><label className="label" htmlFor={`${ids}-pd`}>Qué es y por qué se compra</label><textarea id={`${ids}-pd`} className="textarea" rows={2} maxLength={1500} value={otro.descripcion} onChange={(e) => setOtro({ ...otro, descripcion: e.target.value })} /></div>
            </div>
          )}

          <div className="est-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-mg`}>Margen</label>
              <div className="anu-monto">
                <input id={`${ids}-mg`} className="input" type="number" inputMode="decimal" min="0" value={cifras.margen} onChange={(e) => setCifras({ ...cifras, margen: e.target.value })} placeholder={cifras.margenTipo === "%" ? "Ej.: 40" : "Ej.: 12"} />
                <div className="segmented" role="group" aria-label="Margen en">
                  {[["%", "%"], ["$", moneda]].map(([k, n]) => <button key={k} type="button" className={`segmented-btn ${cifras.margenTipo === k ? "active" : ""}`} aria-pressed={cifras.margenTipo === k} onClick={() => setCifras({ ...cifras, margenTipo: k })}>{n}</button>)}
                </div>
              </div>
            </div>
            <div className="field"><label className="label" htmlFor={`${ids}-tc`}>Compran (de cada 100)</label><input id={`${ids}-tc`} className="input" type="number" inputMode="decimal" min="1" max="100" value={cifras.tasaCierre} onChange={(e) => setCifras({ ...cifras, tasaCierre: e.target.value })} placeholder="La del manual" /></div>
            <div className="field"><label className="label" htmlFor={`${ids}-pr`}>Al día ({moneda})</label><input id={`${ids}-pr`} className="input" type="number" inputMode="decimal" min="0" value={cifras.diario} onChange={(e) => setCifras({ ...cifras, diario: e.target.value })} placeholder="Que lo proponga" /></div>
            <div className="field"><label className="label" htmlFor={`${ids}-di`}>Días</label><input id={`${ids}-di`} className="input" type="number" inputMode="numeric" min="1" max="365" value={cifras.dias} onChange={(e) => setCifras({ ...cifras, dias: e.target.value })} /></div>
          </div>
          {eco && <p className="hint" role="status">Con esto, cada resultado puede costar como mucho <strong>{DINERO(eco.costoMaxResultado, moneda)}</strong> (para ganar, {DINERO(eco.costoObjetivo, moneda)}).</p>}

          <div className="est-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-ob`}>Objetivo</label>
              <select id={`${ids}-ob`} className="input" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}>
                {Object.entries(OBJETIVOS).map(([k, o]) => <option key={k} value={k}>{o.nombre}</option>)}
              </select>
            </div>
            {DESTINOS.whatsapp.objetivos.includes(objetivo) && (
              <div className="field">
                <span className="label">A dónde lleva</span>
                <div className="segmented" role="group" aria-label="A dónde lleva">
                  {Object.entries(DESTINOS).map(([k, d]) => <button key={k} type="button" className={`segmented-btn ${destino === k ? "active" : ""}`} aria-pressed={destino === k} onClick={() => setDestino(k)}>{d.nombre}</button>)}
                </div>
              </div>
            )}
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-no`}>Notas para el estratega (opcional)</label>
            <textarea id={`${ids}-no`} className="textarea" rows={2} maxLength={1500} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: es la temporada fuerte; el cliente no quiere descuentos" />
          </div>
          <div className="est-casillas">
            <label className="cerebro-casilla"><input type="checkbox" checked={conWeb} onChange={(e) => setConWeb(e.target.checked)} /> <span>Investigar en internet (competencia, costos del rubro)</span></label>
            <label className="cerebro-casilla"><input type="checkbox" checked={conMaletas} onChange={(e) => setConMaletas(e.target.checked)} /> <span>Sacar las 7 maletas aunque el estudio de mercado ya las tenga</span></label>
            <label className="cerebro-casilla"><input type="checkbox" checked={pegar} onChange={(e) => setPegar(e.target.checked)} /> <span>Pegar el plan de otro bot</span></label>
          </div>
          {pegar && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-pg`}>El plan del otro bot</label>
              <textarea id={`${ids}-pg`} className="textarea" rows={6} maxLength={12000} value={planPegado} onChange={(e) => setPlanPegado(e.target.value)} placeholder="Pega aquí el plan completo: públicos, textos, presupuesto…" />
              <p className="hint" style={{ margin: 0 }}>Lo pasa a esta forma conservando sus decisiones; sólo corrige lo que choque con el manual o con un precio del catálogo.</p>
            </div>
          )}

          <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>

          {r?.plan && (
            <>
              <Plan r={r} moneda={moneda} diario={Number(cifras.diario)} dias={Number(cifras.dias)} />
              <div className="field">
                <label className="label" htmlFor={`${ids}-cb`}>Pídele un cambio</label>
                <div className="anu-buscar">
                  <input id={`${ids}-cb`} className="input" value={cambio} maxLength={1500} onChange={(e) => setCambio(e.target.value)} placeholder="Ej.: más agresivo · sin descuentos · un anuncio de testimonio" />
                  <button type="button" className="btn btn-secondary" disabled={ocupado || !cambio.trim()} onClick={() => armar({ conCambio: true })}>
                    {trabajando === "cambio" ? "Ajustando…" : "Ajustar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="sheet-footer est-pie">
          {r?.plan ? (
            <>
              <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={guardar}>{trabajando === "guardar" ? "Guardando…" : guardadoId ? "Guardar cambios" : "Guardar plan"}</button>
              <Copiar texto={texto} etiqueta="el plan entero" />
              {para === "cliente" && productoId === "otro" && otro.nombre.trim() && (
                <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={anadirAlCatalogo}>Añadir «{otro.nombre.trim().slice(0, 24)}» al catálogo</button>
              )}
              {para === "fuera" && onClienteNuevo && (
                <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={crearCliente}>{trabajando === "cliente" ? "Creando…" : "Guardar como cliente"}</button>
              )}
              {para === "cliente" && (
                <button type="button" className="btn btn-primary" disabled={ocupado || !(cuentaLista && cliente === clienteId)} onClick={crearCampana}
                  title={cuentaLista && cliente === clienteId ? undefined : "Escoge este cliente en Anuncios y asígnale su cuenta publicitaria"}>
                  <Icon name="megaphone" size={16} /> Crear la campaña con esto
                </button>
              )}
            </>
          ) : <span className="hint" style={{ flex: 1 }}>Unos centavos de IA{conWeb ? " más las búsquedas" : ""}. Tarda de 30 segundos a 2 minutos.</span>}
          <button type="button" className={r?.plan ? "btn btn-ghost" : "btn btn-primary"} disabled={ocupado || !puedeArmar} onClick={() => armar()}>
            <Icon name="sparkles" size={16} /> {trabajando === "plan" ? "Armando el plan…" : r?.plan ? "Armar otro" : "Armar el plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
