import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import CuentasReferencia from "./CuentasReferencia";
import { leerInspiracion, actualizarInspiracion, traerDeInspiracion, proponerResumen } from "../lib/inspiracionApi";
import { FORMATOS_FEED, REDES_INSPIRACION, TIPOS_CUENTA, filtrarFeed, etiquetaRinde, ideaDeInspiracion, enlaceDePerfil, formatoDePublicacion, UMBRAL_AVISO } from "../lib/inspiracion";
import { haceCuanto } from "../lib/competencia";
import { fechaEnZona } from "../lib/agenda";
import "./Inspiracion.css";

// Sólo al usarlos: el guion (y la fórmula) y el editor de la nota del cerebro.
const ExtraerUgc = lazy(() => import("./calendario/ExtraerUgc"));

// ============================================================
// Inspiración: lo que publican las cuentas que sigue cada cliente
//
// Las hasta 10 cuentas fijas del cliente (competencia e inspiración,
// `clients.competidores`) y lo que publican, guardado por el Worker
// (worker/lib/inspiracion.js) y medido contra su propia cuenta: «rinde 3,2×
// su promedio». Va como panel junto al calendario (`modo="panel"`, se puede
// ARRASTRAR una publicación a un día) y como pestaña del cliente
// (`/cliente/<slug>/inspiracion`).
//
// Desde cada publicación: llevarla a un día (con su archivo como
// REFERENCIA, nunca como lo que se publica), guardarla en el banco,
// analizarla (queda en el cerebro como interna), extraer su guion UGC, sacar
// su fórmula o recrearla con la marca. Los videos se bajan sólo al pulsar
// algo. Un reel con música de Instagram no trae video (Meta no lo da): se
// trabaja con su miniatura y su texto. TikTok no deja ver lo de otros.
// ============================================================

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("es-PA"));
/** «2026-10-15» → «15 de octubre». */
const diaEnPalabras = (f) => new Date(`${f}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "long" });
const visto = (clienteId) => `inspiracion-visto:${clienteId}`;

function leerVisto(clienteId) {
  try { return localStorage.getItem(visto(clienteId)) || ""; } catch { return ""; }
}
function guardarVisto(clienteId) {
  try { localStorage.setItem(visto(clienteId), new Date().toISOString()); } catch { /* sin almacenamiento */ }
}

export default function Inspiracion({ client, modo = "panel", lectura = false, onCerrar = null, onPersistClient = null, onLlevar = null, llevarRef = null }) {
  const ids = useId();
  const clienteId = client.dbId || client.id;
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [formato, setFormato] = useState("");
  const [orden, setOrden] = useState("rinde");
  // Lo publicado desde la última visita de ESTA persona en este navegador (no se avisa a nadie más).
  const [ultimaVisita] = useState(() => leerVisto(clienteId));
  const [soloNuevo, setSoloNuevo] = useState(false);
  const [editandoCuentas, setEditandoCuentas] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [llevando, setLlevando] = useState(null); // la publicación a la que se le escoge día
  const [fecha, setFecha] = useState(fechaEnZona());
  const [extraer, setExtraer] = useState(null); // { inicial, formula }
  const [resumen, setResumen] = useState(null);
  const pidioFaltan = useRef(false);

  useEffect(() => () => guardarVisto(clienteId), [clienteId]);

  const cargar = useCallback(async () => {
    try {
      const d = await leerInspiracion(clienteId);
      setDatos(d);
      setError("");
      // Las cuentas que nunca se leyeron (recién añadidas) se leen solas, una vez por apertura.
      if (d.faltan?.length && !lectura && !pidioFaltan.current) {
        pidioFaltan.current = true;
        setActualizando(true);
        try { setDatos(await actualizarInspiracion(clienteId, d.faltan)); } catch (e) { setError(e.message); }
        setActualizando(false);
      }
    } catch (e) {
      setError(e.message);
    }
    setCargando(false);
  }, [clienteId, lectura]);

  // Al cambiar las cuentas (la ficha del cliente) se vuelve a leer; y cuando otra persona (o el cron) lo pone al día.
  const firmaCuentas = JSON.stringify(client.competidores ?? []);
  useEffect(() => { pidioFaltan.current = false; void cargar(); }, [cargar, firmaCuentas]);
  useEffect(() => {
    const alCambiar = (e) => { if (!e.detail?.clientId || e.detail.clientId === clienteId) void cargar(); };
    window.addEventListener("inspiracion", alCambiar);
    return () => window.removeEventListener("inspiracion", alCambiar);
  }, [cargar, clienteId]);

  const actualizar = async () => {
    setActualizando(true);
    setError("");
    setAviso("");
    try {
      const d = await actualizarInspiracion(clienteId);
      setDatos(d);
      setAviso(d.errores?.length ? `Puesto al día, salvo ${d.errores.length === 1 ? "una cuenta" : `${d.errores.length} cuentas`} (abajo dice por qué).` : "Puesto al día.");
    } catch (e) {
      setError(e.message);
    }
    setActualizando(false);
  };

  const cuentas = useMemo(() => datos?.cuentas ?? [], [datos]);
  const porClave = useMemo(() => new Map(cuentas.map((c) => [c.clave, c])), [cuentas]);
  const lista = useMemo(
    () => filtrarFeed(datos?.publicaciones ?? [], { cuenta, formato, orden, desde: soloNuevo ? ultimaVisita : "" }),
    [datos, cuenta, formato, orden, soloNuevo, ultimaVisita],
  );
  const formatos = useMemo(() => [...new Set((datos?.publicaciones ?? []).map((p) => p.formato))], [datos]);
  const nuevas = useMemo(() => (ultimaVisita ? filtrarFeed(datos?.publicaciones ?? [], { desde: ultimaVisita }).length : 0), [datos, ultimaVisita]);

  /** Su archivo a la galería: el video (o la imagen); de un reel con música, la miniatura. null si no se puede (YouTube). */
  const traer = async (p) => (p.red === "instagram" ? (await traerDeInspiracion(clienteId, p.id, { miniatura: p.sinArchivo })).archivo : null);

  const conTrabajo = (id, hacer) => async () => {
    if (trabajando) return;
    setTrabajando(id);
    setError("");
    setAviso("");
    try { await hacer(); } catch (e) { setError(e.message); }
    setTrabajando("");
  };

  /** Llevarla a un día: la idea con su archivo como REFERENCIA (no se publica). → si entró. */
  const llevar = async (p, dia) => {
    if (!onLlevar) return false;
    let archivo = null;
    try { archivo = await traer(p); } catch (e) { setAviso(`Va sin el archivo: ${e.message}`); }
    const ok = await onLlevar(ideaDeInspiracion(p, archivo, crypto.randomUUID().slice(0, 8)), dia);
    if (ok) setAviso(`En el calendario el ${diaEnPalabras(dia)}: ${archivo ? "con el archivo como referencia (no se publica)" : "con el enlace de referencia"}. Ábrela para recrearla o sacarle el guion.`);
    return ok;
  };
  // Lo que se suelta en un día del calendario (MonthGrid) llega por aquí.
  useEffect(() => {
    if (!llevarRef) return undefined;
    llevarRef.current = (id, dia) => {
      const p = (datos?.publicaciones ?? []).find((x) => x.id === id);
      if (!p) return;
      setTrabajando(p.id);
      setError("");
      void llevar(p, dia).finally(() => setTrabajando(""));
    };
    return () => { llevarRef.current = null; };
  });

  const alBanco = (p) => conTrabajo(p.id, async () => {
    const [{ anadirAlBanco }, { nuevaIdea }] = await Promise.all([import("../lib/bancoIdeasApi"), import("../lib/bancoIdeas")]);
    const idea = ideaDeInspiracion(p, null);
    await anadirAlBanco(nuevaIdea({ id: crypto.randomUUID(), idea: idea.idea, format: idea.format, referenceLink: p.enlace }), clienteId);
    setAviso("Guardada en el banco de ideas de este cliente.");
  })();

  const analizar = (p) => conTrabajo(p.id, async () => {
    const archivo = await traer(p);
    if (!archivo) throw new Error("De YouTube no se puede bajar el video: usa «Extraer guion» (Gemini lo ve por el enlace).");
    const { agregarReferencia } = await import("../lib/mercado");
    const r = await agregarReferencia(clienteId, {
      archivoId: archivo.id, competidor: `@${p.usuario}`, enlace: p.enlace, origen: "organico",
      nota: [
        `${fmt(p.meGusta)} me gusta y ${fmt(p.comentarios)} comentarios${Number.isFinite(p.rinde) ? `; rinde ${etiquetaRinde(p.rinde)} su promedio` : ""}`,
        p.sinArchivo ? `es un reel con música de Instagram: se analiza su miniatura. Su texto: ${String(p.texto ?? "").slice(0, 400)}` : "",
      ].filter(Boolean).join("; "),
    }, archivo.tipo === "video" ? archivo.src : "");
    setAviso(r.aviso ? `Guardada, pero sin analizar: ${r.aviso}` : "Analizada: está en las referencias del estudio de mercado (pestaña Cerebro), como nota interna.");
  })();

  const guion = (p, formula = false) => conTrabajo(p.id, async () => {
    if (p.red === "youtube") {
      setExtraer({ formula, inicial: { youtube: p.enlace, nombre: `«${String(p.texto ?? "").slice(0, 60)}» de ${p.nombre || `@${p.usuario}`}`, cuenta: `@${p.usuario}`, enlace: p.enlace } });
      return;
    }
    const archivo = await traer(p);
    setExtraer({ formula, inicial: { id: archivo.id, src: archivo.src, nombre: `Reel de @${p.usuario}`, cuenta: `@${p.usuario}`, enlace: p.enlace } });
  })();

  const recrear = (p) => conTrabajo(p.id, async () => {
    const archivo = await traer(p);
    if (!archivo) throw new Error("De YouTube no se puede bajar el video para recrearlo: llévalo a un día o saca su guion.");
    const { recrearConLaMarca } = await import("../lib/otraVersion");
    const borrador = { id: "", format: formatoDePublicacion(p.formato), idea: ideaDeInspiracion(p).idea };
    const nueva = await recrearConLaMarca({
      client, post: borrador, medio: { src: archivo.src, tipo: archivo.tipo }, alProgresar: setAviso,
      confirmar: (costo) => window.confirm(`Recrearla cuesta unos ${costo.toFixed(2).replace(".", ",")} $. ¿Sigo?`),
    });
    if (nueva) setAviso("Lista: la versión con la marca está en la galería del Estudio. Desde ahí se lleva a una publicación.");
    else setAviso("");
  })();

  const pedirResumen = conTrabajo("resumen", async () => {
    setResumen(await proponerResumen(clienteId));
  });
  const guardarResumen = conTrabajo("resumen", async () => {
    const { guardarNota } = await import("../lib/cerebro");
    await guardarNota(clienteId, { ...(resumen.existente ? { id: resumen.existente.id } : {}), titulo: resumen.titulo, texto: resumen.texto, tipo: "nota", interna: false });
    setResumen(null);
    setAviso("Guardada en el cerebro: el motor de ideas la tiene en cuenta cuando escribe.");
  });

  const panel = modo === "panel";
  const conFeed = cuentas.some((c) => c.feed);

  return (
    <section className={`bank-panel inspiracion${panel ? "" : " bank-panel-pagina"}`} aria-labelledby={`${ids}-t`}>
      <div className="bank-panel-cabecera">
        <h3 id={`${ids}-t`} className="bank-panel-titulo"><Icon name="eye" size={18} /> Inspiración</h3>
        <div style={{ display: "flex", gap: "var(--sp-1)" }}>
          {!lectura && conFeed && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={actualizar} disabled={actualizando} aria-busy={actualizando || undefined}>
              <Icon name="refresh" size={14} /> {actualizando ? "Leyendo…" : "Actualizar"}
            </button>
          )}
          {!lectura && onPersistClient && (
            <button type="button" className="btn btn-secondary btn-sm" aria-expanded={editandoCuentas} aria-controls={`${ids}-cuentas`} onClick={() => setEditandoCuentas((v) => !v)}>
              <Icon name="users" size={14} /> Cuentas ({cuentas.length})
            </button>
          )}
          {onCerrar && <button type="button" className="btn-icon" onClick={onCerrar} aria-label="Cerrar Inspiración"><Icon name="close" size={18} /></button>}
        </div>
      </div>

      {(editandoCuentas || (!cargando && !cuentas.length)) && (
        <div id={`${ids}-cuentas`} className="inspiracion-cuentas">
          {!cuentas.length && <p className="hint" style={{ margin: 0 }}>Añade hasta 10 cuentas que sigue {client.name}: su competencia y las que le inspiran (Instagram de empresa o creador, YouTube o TikTok).</p>}
          {onPersistClient && !lectura
            ? <CuentasReferencia client={client} onGuardar={(competidores) => onPersistClient({ ...client, competidores })} />
            : !cuentas.length && <p className="hint" style={{ margin: 0 }}>Las cuentas se añaden en la pestaña Resultados del cliente.</p>}
        </div>
      )}

      {cuentas.length > 0 && (
        <div className="bank-panel-filtros" role="group" aria-label="Qué ver">
          <button type="button" className="filter-chip" aria-pressed={!cuenta} onClick={() => setCuenta("")}>Todas</button>
          {cuentas.map((c) => (
            <button key={c.clave} type="button" className="filter-chip" aria-pressed={cuenta === c.clave} onClick={() => setCuenta(cuenta === c.clave ? "" : c.clave)}
              title={`${REDES_INSPIRACION[c.red].nombre} · ${TIPOS_CUENTA[c.tipo]}${c.nota ? ` · ${c.nota}` : ""}`}>
              <Icon name={REDES_INSPIRACION[c.red].icono} size={12} /> @{c.usuario}
            </button>
          ))}
        </div>
      )}
      {(datos?.publicaciones ?? []).length > 0 && (
        <div className="bank-panel-filtros inspiracion-orden">
          <label className="sr-only" htmlFor={`${ids}-orden`}>Orden</label>
          <select id={`${ids}-orden`} className="input" value={orden} onChange={(e) => setOrden(e.target.value)}>
            <option value="rinde">Lo que más rindió</option>
            <option value="nuevo">Lo más nuevo</option>
          </select>
          <label className="sr-only" htmlFor={`${ids}-formato`}>Formato</label>
          <select id={`${ids}-formato`} className="input" value={formato} onChange={(e) => setFormato(e.target.value)}>
            <option value="">Todos los formatos</option>
            {formatos.map((f) => <option key={f} value={f}>{FORMATOS_FEED[f] ?? f}</option>)}
          </select>
          {ultimaVisita && (
            <button type="button" className="filter-chip" aria-pressed={soloNuevo} onClick={() => setSoloNuevo((v) => !v)}>
              Nuevo desde tu última visita ({nuevas})
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="inspiracion-error">{error}</p>}
      <div role="status" aria-live="polite" className={aviso ? "hint inspiracion-aviso" : "sr-only"}>{aviso}</div>

      {cuentas.some((c) => c.error) && (
        <ul className="inspiracion-errores">
          {cuentas.filter((c) => c.error).map((c) => (
            <li key={c.clave}><a href={enlaceDePerfil(c)} target="_blank" rel="noopener noreferrer">@{c.usuario}</a>: {c.error}</li>
          ))}
        </ul>
      )}

      {!lectura && (datos?.publicaciones ?? []).length >= 3 && (
        <div className="inspiracion-resumen">
          {!resumen ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={pedirResumen} disabled={Boolean(trabajando)} aria-busy={trabajando === "resumen" || undefined}
              title="La IA lee lo que más rindió y escribe los patrones (ganchos, formatos, temas) para el cerebro del cliente">
              <Icon name="brain" size={14} /> {trabajando === "resumen" ? "Leyendo lo que funcionó…" : "Lo que funciona en tu competencia"}
            </button>
          ) : (
            <div className="inspiracion-resumen-nota">
              <p className="label" style={{ margin: 0 }}>{resumen.titulo}</p>
              <p className="hint" style={{ margin: 0 }}>De las {resumen.publicaciones} que más rindieron. Revísala: al guardarla, el motor de ideas la tiene en cuenta.{resumen.aviso ? ` ${resumen.aviso}` : ""}</p>
              <label className="sr-only" htmlFor={`${ids}-resumen`}>La nota</label>
              <textarea id={`${ids}-resumen`} className="textarea" rows={8} value={resumen.texto} onChange={(e) => setResumen((r) => ({ ...r, texto: e.target.value }))} />
              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={guardarResumen} disabled={Boolean(trabajando) || !resumen.texto.trim()}>
                  <Icon name="check" size={14} /> {resumen.existente ? "Guardar encima de la de este mes" : "Guardar en el cerebro"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResumen(null)}>No guardar</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bank-panel-lista inspiracion-lista">
        {cargando && <p className="hint" style={{ textAlign: "center", padding: "var(--sp-4) 0" }}>Cargando…</p>}
        {!cargando && cuentas.length > 0 && !lista.length && (
          <p className="hint" style={{ textAlign: "center", padding: "var(--sp-4) var(--sp-2)" }}>
            {actualizando ? "Leyendo sus publicaciones…" : (datos?.publicaciones ?? []).length ? "Nada con estos filtros." : "Todavía no hay publicaciones leídas. Pulsa «Actualizar»."}
          </p>
        )}
        <ul className="inspiracion-items">
          {lista.map((p) => {
            const c = porClave.get(`${p.red}:${String(p.usuario).toLowerCase()}`);
            const ocupado = trabajando === p.id;
            return (
              <li key={p.id} className="inspiracion-item" data-tipo={p.tipoCuenta}
                draggable={Boolean(llevarRef) && !lectura}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", JSON.stringify({ inspiracionId: p.id })); }}>
                <div className="inspiracion-vista">
                  {p.miniatura ? <img src={p.miniatura} alt="" loading="lazy" /> : <span className="hint">Sin vista</span>}
                  <span className="inspiracion-formato">{p.video && <Icon name="play" size={11} />} {FORMATOS_FEED[p.formato] ?? p.formato}</span>
                  {Number.isFinite(p.rinde) && (
                    <span className="inspiracion-rinde" data-alto={p.rinde >= UMBRAL_AVISO || undefined} title="Interacciones frente a la mediana de su cuenta">
                      {etiquetaRinde(p.rinde)}
                    </span>
                  )}
                </div>
                <div className="inspiracion-cuerpo">
                  <p className="inspiracion-de">
                    <Icon name={REDES_INSPIRACION[p.red]?.icono ?? "link"} size={12} /> <strong>@{p.usuario}</strong>
                    <span className="inspiracion-tipo">{TIPOS_CUENTA[p.tipoCuenta] ?? ""}</span>
                    <span className="hint">{haceCuanto(p.fecha)}</span>
                  </p>
                  <p className="inspiracion-cifras">
                    <span><Icon name="heart" size={11} /> {fmt(p.meGusta)}</span>
                    <span><Icon name="message" size={11} /> {fmt(p.comentarios)}</span>
                    {p.vistas > 0 && <span><Icon name="eye" size={11} /> {fmt(p.vistas)}</span>}
                    {Number.isFinite(p.rinde) && <span className="hint">rinde {etiquetaRinde(p.rinde)} su promedio{c?.mediana ? ` (${fmt(Math.round(c.mediana))})` : ""}</span>}
                  </p>
                  {p.texto && <p className="inspiracion-texto">{p.texto}</p>}
                  {p.sinArchivo && p.red === "instagram" && <p className="hint" style={{ margin: 0 }}>Con música de Instagram: Meta no da su video. Se trabaja con su miniatura y su texto.</p>}
                  <div className="inspiracion-acciones">
                    {!lectura && onLlevar && (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(trabajando)} aria-expanded={llevando === p.id} onClick={() => setLlevando(llevando === p.id ? null : p.id)}>
                        <Icon name="calendar" size={13} /> Llevar a un día
                      </button>
                    )}
                    {!lectura && p.video && !(p.red === "instagram" && p.sinArchivo) && (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(trabajando)} onClick={() => guion(p)}>
                        <Icon name="user" size={13} /> Extraer guion
                      </button>
                    )}
                    {!lectura && p.red === "instagram" && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(trabajando)} onClick={() => analizar(p)}>
                        <Icon name="sparkles" size={13} /> Analizar
                      </button>
                    )}
                    {!lectura && p.red === "instagram" && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(trabajando)} onClick={() => recrear(p)}>
                        <Icon name="wand" size={13} /> Recrear con mi marca
                      </button>
                    )}
                    {!lectura && p.video && !(p.red === "instagram" && p.sinArchivo) && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(trabajando)} onClick={() => guion(p, true)} title="La receta del video, sin su contenido, para la biblioteca de fórmulas UGC de la agencia">
                        <Icon name="list" size={13} /> Fórmula
                      </button>
                    )}
                    {!lectura && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(trabajando)} onClick={() => alBanco(p)}>
                        <Icon name="bulb" size={13} /> Al banco
                      </button>
                    )}
                    {p.enlace && <a className="btn btn-ghost btn-sm" href={p.enlace} target="_blank" rel="noopener noreferrer"><Icon name="external" size={13} /> Ver</a>}
                  </div>
                  {ocupado && <p className="hint" role="status" style={{ margin: 0 }}>Trabajando…</p>}
                  {llevando === p.id && (
                    <div className="inspiracion-llevar">
                      <SelectorFecha value={fecha} onChange={(f) => setFecha(f || fechaEnZona())} etiqueta="Día" vacio="Escoge el día" prefijo="El" />
                      <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(trabajando)}
                        onClick={() => { setLlevando(null); void conTrabajo(p.id, () => llevar(p, fecha))(); }}>
                        Llevar
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {extraer && (
        <Suspense fallback={null}>
          <ExtraerUgc client={client} inicial={extraer.inicial} formula={extraer.formula} onCerrar={() => setExtraer(null)} />
        </Suspense>
      )}
    </section>
  );
}
