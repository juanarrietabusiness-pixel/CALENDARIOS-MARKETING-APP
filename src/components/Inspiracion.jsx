import { useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import CuentasReferencia from "./CuentasReferencia";
import LoMejorTarjetas from "./LoMejorTarjetas";
import { useLoMejor } from "../hooks/useLoMejor";
import { leerInspiracion, actualizarInspiracion, proponerResumen } from "../lib/inspiracionApi";
import { enlaceDePerfil } from "../lib/inspiracion";
import { VENTANAS, FUENTES, FORMATOS_LO_MEJOR } from "../lib/loMejor";
import { abrirGuardarReferencia } from "../lib/bancoIdeasApi";
import { navegar } from "../lib/rutas";
import "./Inspiracion.css";
import "./LoMejor.css";

// ============================================================
// Inspiración de un cliente = «Lo mejor del momento» FILTRADO por él
//
// La misma vista que /lo-mejor (las mismas tarjetas, el mismo orden por
// percentil, el mismo «Recrear para…»), con lo que es sólo de este cliente:
// sus hasta 10 cuentas fijas (competencia e inspiración, `clients.competidores`),
// «Actualizar» (leerlas otra vez) y «Lo que funciona en tu competencia» (la
// nota del cerebro). Va como pestaña del cliente (`/cliente/<slug>/inspiracion`)
// y como panel junto al calendario (el ojo, `modo="panel"`): ahí cada tarjeta se
// puede ARRASTRAR a un día.
//
// Un aviso de «esto rinde 3×» trae `?pieza=<clave>`: esa tarjeta va primero y
// se señala.
// ============================================================

const piezaDeLaDireccion = () => {
  try { return new URLSearchParams(window.location.search).get("pieza") ?? ""; } catch { return ""; }
};

export default function Inspiracion({ client, clientes = null, modo = "panel", lectura = false, onCerrar = null, onPersistClient = null, onLlevar = null, llevarRef = null }) {
  const ids = useId();
  const clienteId = client.dbId || client.id;
  const [feed, setFeed] = useState(null);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ventana, setVentana] = useState("semana");
  const [fuente, setFuente] = useState("");
  const [formato, setFormato] = useState("");
  const [editandoCuentas, setEditandoCuentas] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [pieza] = useState(piezaDeLaDireccion);
  const [pulsoLocal, setPulsoLocal] = useState(0);
  const pidioFaltan = useRef(false);
  const { datos, cargando, error: errorLista } = useLoMejor({ ventana, cliente: clienteId, fuente, formato, pieza, pulso: pulsoLocal, lectura });

  // La pieza de un aviso se señala una vez: la dirección queda limpia.
  useEffect(() => {
    if (pieza && modo !== "panel") navegar(window.location.pathname, { reemplazar: true });
  }, [pieza, modo]);

  const cargarFeed = useCallback(async () => {
    try {
      const d = await leerInspiracion(clienteId);
      setFeed(d);
      // Las cuentas que nunca se leyeron (recién añadidas) se leen solas, una vez por apertura.
      if (d.faltan?.length && !lectura && !pidioFaltan.current) {
        pidioFaltan.current = true;
        setActualizando(true);
        try { setFeed(await actualizarInspiracion(clienteId, d.faltan)); setPulsoLocal((n) => n + 1); } catch (e) { setError(e.message); }
        setActualizando(false);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [clienteId, lectura]);

  // Al cambiar las cuentas (la ficha del cliente) se vuelve a leer; y cuando otra persona (o el cron) lo pone al día.
  const firmaCuentas = JSON.stringify(client.competidores ?? []);
  useEffect(() => { pidioFaltan.current = false; void cargarFeed(); }, [cargarFeed, firmaCuentas]);
  useEffect(() => {
    const alCambiar = (e) => { if (!e.detail?.clientId || e.detail.clientId === clienteId) void cargarFeed(); };
    window.addEventListener("inspiracion", alCambiar);
    return () => window.removeEventListener("inspiracion", alCambiar);
  }, [cargarFeed, clienteId]);

  const actualizar = async () => {
    setActualizando(true);
    setError("");
    setAviso("");
    try {
      const d = await actualizarInspiracion(clienteId);
      setFeed(d);
      setPulsoLocal((n) => n + 1);
      setAviso(d.errores?.length ? `Puesto al día, salvo ${d.errores.length === 1 ? "una cuenta" : `${d.errores.length} cuentas`} (abajo dice por qué).` : "Puesto al día.");
    } catch (e) {
      setError(e.message);
    }
    setActualizando(false);
  };

  const conTrabajo = (id, hacer) => async () => {
    if (trabajando) return;
    setTrabajando(id);
    setError("");
    try { await hacer(); } catch (e) { setError(e.message); }
    setTrabajando("");
  };
  const pedirResumen = conTrabajo("resumen", async () => { setResumen(await proponerResumen(clienteId)); });
  const guardarResumen = conTrabajo("resumen", async () => {
    const { guardarNota } = await import("../lib/cerebro");
    await guardarNota(clienteId, { ...(resumen.existente ? { id: resumen.existente.id } : {}), titulo: resumen.titulo, texto: resumen.texto, tipo: "nota", interna: false });
    setResumen(null);
    setAviso("Guardada en el cerebro: el motor de ideas la tiene en cuenta cuando escribe.");
  });

  const cuentas = feed?.cuentas ?? [];
  const conFeed = cuentas.some((c) => c.feed);
  const piezas = datos?.piezas ?? [];
  const panel = modo === "panel";

  return (
    <section className={`bank-panel inspiracion${panel ? "" : " bank-panel-pagina"}`} aria-labelledby={`${ids}-t`}>
      <div className="bank-panel-cabecera">
        <h3 id={`${ids}-t`} className="bank-panel-titulo"><Icon name="trending" size={18} /> Lo mejor · {client.name}</h3>
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
          {!lectura && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirGuardarReferencia(clienteId)}>
              <Icon name="link" size={14} /> Pegar un enlace
            </button>
          )}
          {onCerrar && <button type="button" className="btn-icon" onClick={onCerrar} aria-label="Cerrar Lo mejor"><Icon name="close" size={18} /></button>}
        </div>
      </div>

      {(editandoCuentas || (feed && !cuentas.length)) && (
        <div id={`${ids}-cuentas`} className="inspiracion-cuentas">
          {!cuentas.length && <p className="hint" style={{ margin: 0 }}>Añade hasta 10 cuentas que sigue {client.name}: su competencia y las que le inspiran (Instagram de empresa o creador, YouTube o TikTok).</p>}
          {onPersistClient && !lectura
            ? <CuentasReferencia client={client} onGuardar={(competidores) => onPersistClient({ ...client, competidores })} />
            : !cuentas.length && <p className="hint" style={{ margin: 0 }}>Las cuentas se añaden en la pestaña Resultados del cliente.</p>}
        </div>
      )}

      <div className="bank-panel-filtros" role="group" aria-label="Qué ventana">
        {VENTANAS.map((v) => (
          <button key={v.id} type="button" className="filter-chip" aria-pressed={ventana === v.id} onClick={() => setVentana(v.id)}>{v.nombre}</button>
        ))}
      </div>
      <div className="bank-panel-filtros inspiracion-orden">
        <label className="sr-only" htmlFor={`${ids}-fuente`}>De dónde</label>
        <select id={`${ids}-fuente`} className="input" value={fuente} onChange={(e) => setFuente(e.target.value)}>
          <option value="">De todas partes</option>
          {Object.entries(FUENTES).map(([id, f]) => <option key={id} value={id}>{f.nombre}</option>)}
        </select>
        <label className="sr-only" htmlFor={`${ids}-formato`}>Formato</label>
        <select id={`${ids}-formato`} className="input" value={formato} onChange={(e) => setFormato(e.target.value)}>
          <option value="">Todos los formatos</option>
          {Object.entries(FORMATOS_LO_MEJOR).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
      </div>

      {(error || errorLista) && <p role="alert" className="inspiracion-error">{error || errorLista}</p>}
      <div role="status" aria-live="polite" className={aviso ? "hint inspiracion-aviso" : "sr-only"}>{aviso}</div>

      {cuentas.some((c) => c.error) && (
        <ul className="inspiracion-errores">
          {cuentas.filter((c) => c.error).map((c) => (
            <li key={c.clave}><a href={enlaceDePerfil(c)} target="_blank" rel="noopener noreferrer">@{c.usuario}</a>: {c.error}</li>
          ))}
        </ul>
      )}

      {!lectura && (feed?.publicaciones ?? []).length >= 3 && (
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
        {cargando && !datos && <p className="hint" style={{ textAlign: "center", padding: "var(--sp-4) 0" }}>Cargando…</p>}
        {!cargando && datos && !piezas.length && (
          <p className="hint" style={{ textAlign: "center", padding: "var(--sp-4) var(--sp-2)" }}>
            {actualizando ? "Leyendo sus publicaciones…" : cuentas.length ? `Nada ${ventana === "semana" ? "esta semana" : "en el último mes"} con estos filtros.` : "Añade sus cuentas o pega el enlace de una referencia."}
          </p>
        )}
        <LoMejorTarjetas piezas={piezas} clientes={clientes?.length ? clientes : [client]} clienteFijo={clienteId} lectura={lectura}
          onLlevar={onLlevar} llevarRef={llevarRef} destacada={pieza} onAviso={setAviso} onError={setError} />
      </div>
    </section>
  );
}
