import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { soloLectura } from "../lib/sesionActual";
import {
  leerMercado, guardarCatalogo, proponerCatalogo, estudiarGeneral, estudiarProducto, guardarBorrador, aprobarEstudio,
  agregarReferencia, reanalizarReferencia, borrarReferencia, adaptarReferencia,
} from "../lib/mercado";
import { subirImagen } from "../lib/estudio";
import { urlBibliotecaWeb } from "../lib/biblioteca";
import {
  ELEMENTOS_MERCADO, DESEOS_REISS, NIVELES_CONSCIENCIA, LIMITES_ANUNCIO, MAX_MATERIAL, MAX_PRODUCTOS, MAX_FOTOS_PRODUCTO, NIVELES_STOCK,
  limpiarCatalogo, productosActivos, pasosDelEstudio, nombreDeNivel, fraseActivo, mensajePedirDatos,
  ideaParaRecrear, ideaParaSeguirVideo,
} from "../lib/estudioMercado";

// El Estudio en un diálogo, para «Recrear con mi marca» y «Seguir este video»: sólo se descarga al abrirlo.
const Estudio = lazy(() => import("./Estudio"));
import "./EstudioMercado.css";

// ============================================================
// El estudio de mercado de un cliente (en la pestaña Cerebro)
//
// Una tarjeta con el estado —cuántos productos, si hay estudio aprobado,
// cuántas referencias— y un diálogo con tres pestañas:
//
//   Catálogo     Los productos y servicios con su precio. «Proponer con IA»
//                los saca del cerebro; nada se guarda sin pulsar Guardar.
//                El inventario (disponibilidad, vigencia de la oferta,
//                diferenciador) es un interruptor POR CLIENTE, apagado: sólo
//                algunos lo necesitan y a los demás no les debe hacer ruido.
//                «Pedir datos al cliente» arma el mensaje de WhatsApp.
//   Estudio      «Realizar estudio de mercado»: lo general y luego un
//                producto por llamada, cada paso guardado en el borrador.
//                Se revisa (y se corrige) antes de aprobar; aprobar lo
//                lleva al cerebro y a Drive.
//   Competencia  Las capturas de anuncios de la competencia: la IA las mira
//                y dice qué hacen y cómo adaptarlo.
// ============================================================

const PESTANAS = [
  ["catalogo", "Catálogo", "list"],
  ["estudio", "Estudio", "chart"],
  ["competencia", "Competencia", "users"],
];

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function EstudioMercado({ client, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(null); // la pestaña con la que se abre, o null

  const cargar = useCallback(async () => {
    try {
      setDatos(await leerMercado(client.id));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [client.id]);

  useEffect(() => { setDatos(null); cargar(); }, [cargar]);

  const activos = productosActivos(datos?.catalogo ?? []);
  const estado = datos?.estudio
    ? `Aprobado el ${fecha(datos.estudio.aprobadoAt || datos.estudio.hechoAt)}${datos.estudio.conWeb ? " · con búsqueda en internet" : ""}`
    : datos?.borrador ? "Hay un estudio a medias o por aprobar" : "Sin hacer todavía";

  return (
    <section className="mercado-tarjeta card" aria-labelledby={`mercado-${client.id}`}>
      <div className="mercado-tarjeta-texto">
        <h3 id={`mercado-${client.id}`} className="mercado-titulo"><Icon name="chart" size={18} /> Estudio de mercado</h3>
        <p className="hint" style={{ margin: 0 }}>
          Sus productos y precios, a quién le vende, qué lo mueve a comprar y qué hace la competencia. Lo usan los textos,
          las ideas y el preset de anuncio del Estudio.
        </p>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
        {datos && (
          <dl className="mercado-estado">
            <div><dt>Catálogo</dt><dd>{activos.length ? `${activos.length} ${activos.length === 1 ? "producto o servicio" : "productos y servicios"}` : "Vacío"}</dd></div>
            <div><dt>Estudio</dt><dd>{estado}</dd></div>
            <div><dt>Competencia</dt><dd>{datos.referencias.length ? `${datos.referencias.length} referencias` : "Ninguna"}</dd></div>
          </dl>
        )}
      </div>
      <div className="mercado-tarjeta-acciones">
        <button type="button" className="btn btn-accent" disabled={!datos} onClick={() => setAbierto(activos.length ? "estudio" : "catalogo")}>
          <Icon name="sparkles" size={18} /> Realizar estudio de mercado
        </button>
        <button type="button" className="btn btn-secondary" disabled={!datos} onClick={() => setAbierto("catalogo")}>
          <Icon name="list" size={18} /> Catálogo
        </button>
        <button type="button" className="btn btn-secondary" disabled={!datos} onClick={() => setAbierto("competencia")}>
          <Icon name="users" size={18} /> Competencia
        </button>
      </div>
      {abierto && datos && (
        <DialogoMercado
          client={client}
          datos={datos}
          inicial={abierto}
          onDatos={(d) => { setDatos((x) => ({ ...x, ...d })); }}
          onCambioCerebro={onCambio}
          onCerrar={() => { setAbierto(null); cargar(); }}
        />
      )}
    </section>
  );
}

// ------------------------------------------------------------
// El diálogo
// ------------------------------------------------------------

function DialogoMercado({ client, datos, inicial, onDatos, onCambioCerebro, onCerrar }) {
  const ids = useId();
  const [tab, setTab] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  // Mientras trabaja la IA, cerrar con Escape o el fondo dejaría la llamada huérfana y sin aviso.
  const cerrar = () => { if (!ocupado) onCerrar(); };
  const ref = useDialogA11y(cerrar);
  const lectura = soloLectura();

  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} className="sheet mercado-dialogo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="sheet-header">
          <h2 id={`${ids}-t`} style={{ fontSize: "var(--fs-md)" }}>Estudio de mercado de {client.name}</h2>
          <button type="button" className="btn-icon" onClick={cerrar} disabled={ocupado} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        <div className="sheet-body">
          <div className="segmented" role="tablist" aria-label="Partes del estudio" style={{ marginBottom: "var(--sp-4)" }}>
            {PESTANAS.map(([k, l, ic]) => (
              <button key={k} type="button" role="tab" id={`${ids}-tab-${k}`} aria-selected={tab === k} aria-controls={`${ids}-panel-${k}`}
                tabIndex={tab === k ? 0 : -1} className={`segmented-btn ${tab === k ? "active" : ""}`} disabled={ocupado && tab !== k} onClick={() => setTab(k)}>
                <Icon name={ic} size={16} /> {l}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${ids}-panel-${tab}`} aria-labelledby={`${ids}-tab-${tab}`}>
            {tab === "catalogo" && (
              <PanelCatalogo client={client} catalogo={datos.catalogo} inventario={datos.inventario} estudio={datos.borrador ?? datos.estudio}
                lectura={lectura} onOcupado={setOcupado}
                onGuardado={(r) => { onDatos(r); onCambioCerebro?.(); }} onSeguir={() => setTab("estudio")} />
            )}
            {tab === "estudio" && (
              <PanelEstudio client={client} datos={datos} lectura={lectura} onOcupado={setOcupado}
                onDatos={onDatos} onCambioCerebro={onCambioCerebro} onIrCatalogo={() => setTab("catalogo")} />
            )}
            {tab === "competencia" && (
              <PanelCompetencia client={client} datos={datos} lectura={lectura} onOcupado={setOcupado}
                onDatos={onDatos} onCambioCerebro={onCambioCerebro} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Mensaje({ aviso }) {
  if (!aviso) return null;
  return (
    <div role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "cerebro-aviso" : "cerebro-error"}>
      <p style={{ margin: 0 }}>{aviso.texto}</p>
      {aviso.enlace && <p style={{ margin: "var(--sp-1) 0 0" }}><a href={aviso.enlace} target="_blank" rel="noreferrer">Abrir el documento en Drive <Icon name="external" size={12} /></a></p>}
    </div>
  );
}

// ------------------------------------------------------------
// Catálogo
// ------------------------------------------------------------

const PRODUCTO_VACIO = () => ({
  id: `p-nuevo-${Date.now().toString(36)}`, nombre: "", tipo: "producto", precio: "", oferta: "", paraQuien: "", beneficios: "", activo: true,
  stock: "", stockNota: "", ofertaHasta: "", diferenciador: "", fotos: [],
});

/**
 * Las fotos de un producto: el Estudio las pone de referencia cuando crea una pieza de ese producto, para
 * que salga el producto REAL y no uno parecido. Se suben a la galería del Estudio al escogerlas.
 */
function FotosProducto({ client, producto, lectura, onCambiar }) {
  const ids = useId();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const fotos = producto.fotos ?? [];
  const elegir = async (e) => {
    // Se copia ANTES de vaciar el campo: vaciarlo deja la lista vacía.
    const archivos = [...e.target.files].slice(0, MAX_FOTOS_PRODUCTO - fotos.length);
    e.target.value = "";
    if (!archivos.length) return;
    setSubiendo(true);
    setError("");
    const nuevas = [];
    try {
      for (const a of archivos) nuevas.push((await subirImagen(client.id, a)).archivo.clave);
    } catch (err) {
      setError(err.message);
    }
    if (nuevas.length) onCambiar([...fotos, ...nuevas]);
    setSubiendo(false);
  };
  return (
    <div className="field">
      <span className="label" id={`${ids}-t`}>Fotos del producto <span style={{ fontWeight: 400, textTransform: "none" }}>· el Estudio las usa de referencia</span></span>
      <div className="mercado-fotos" role="group" aria-labelledby={`${ids}-t`}>
        {fotos.map((k, i) => (
          <div key={k} className="mercado-foto">
            <img src={`/api/media/${k}`} alt={`Foto ${i + 1} de ${producto.nombre || "el producto"}`} loading="lazy" />
            {!lectura && (
              <button type="button" className="btn-icon btn-sm" aria-label={`Quitar la foto ${i + 1}`} onClick={() => onCambiar(fotos.filter((x) => x !== k))}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
        {!lectura && fotos.length < MAX_FOTOS_PRODUCTO && (
          <label className="btn btn-secondary btn-sm mercado-foto-subir">
            <Icon name="plus" size={14} /> {subiendo ? "Subiendo…" : "Añadir foto"}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={subiendo} onChange={elegir} />
          </label>
        )}
      </div>
      {error && <p role="alert" className="cerebro-error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}

function PanelCatalogo({ client, catalogo, inventario: inventarioGuardado, estudio, lectura, onOcupado, onGuardado, onSeguir }) {
  const ids = useId();
  const [lista, setLista] = useState(() => (catalogo.length ? catalogo : []));
  const [inventario, setInventario] = useState(Boolean(inventarioGuardado));
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null);
  const [cambiado, setCambiado] = useState(false);
  const [pedir, setPedir] = useState(null); // el texto del mensaje para el cliente, mientras se ve
  const ocupar = (t) => { setTrabajando(t); onOcupado(Boolean(t)); };

  const cambiar = (id, campo, valor) => { setLista((l) => l.map((p) => (p.id === id ? { ...p, [campo]: valor } : p))); setCambiado(true); };

  const proponer = async () => {
    ocupar("proponer");
    setAviso(null);
    try {
      const r = await proponerCatalogo(client.id);
      setLista(r.catalogo);
      setCambiado(true);
      setAviso({ ok: true, texto: `La IA encontró ${r.nuevos} ${r.nuevos === 1 ? "producto o servicio" : "productos y servicios"} en el cerebro. Revisa los precios y pulsa «Guardar catálogo».${r.aviso ? ` ${r.aviso}` : ""}` });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    ocupar("");
  };

  const guardar = async () => {
    ocupar("guardar");
    setAviso(null);
    try {
      const r = await guardarCatalogo(client.id, limpiarCatalogo(lista), inventario);
      setLista(r.catalogo);
      setInventario(r.inventario);
      setCambiado(false);
      onGuardado({ catalogo: r.catalogo, inventario: r.inventario });
      setAviso({ ok: true, texto: "Catálogo guardado. La IA ya usa estos precios en todo lo que escribe." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    ocupar("");
  };

  return (
    <div className="mercado-panel">
      <p className="hint" style={{ marginTop: 0 }}>
        Los precios van EXACTAMENTE como se escriben aquí: la IA no inventa ni redondea otros. Lo que no esté activo no se anuncia.
      </p>
      {!lectura && (
        <div className="mercado-acciones">
          <button type="button" className="btn btn-secondary" onClick={proponer} disabled={Boolean(trabajando)}>
            <Icon name="sparkles" size={16} /> {trabajando === "proponer" ? "Leyendo el cerebro…" : "Proponer con IA"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => { setLista((l) => [...l, PRODUCTO_VACIO()]); setCambiado(true); }}
            disabled={Boolean(trabajando) || lista.length >= MAX_PRODUCTOS}>
            <Icon name="plus" size={16} /> Añadir producto o servicio
          </button>
          <button type="button" className="btn btn-secondary" aria-expanded={Boolean(pedir)} aria-controls={`${ids}-pedir`}
            onClick={() => setPedir((x) => (x ? null : mensajePedirDatos({ marca: client.name, catalogo: limpiarCatalogo(lista), inventario, estudio })))}>
            <Icon name="send" size={16} /> Pedir datos al cliente
          </button>
        </div>
      )}
      {pedir !== null && <PedirDatos id={`${ids}-pedir`} texto={pedir} onTexto={setPedir} onCerrar={() => setPedir(null)} />}

      {!lectura && (
        <div className="interruptor-fila mercado-inventario">
          <div>
            <span id={`${ids}-inv`} style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>Inventario y detalles</span>
            <p className="hint" style={{ margin: 0 }}>
              Para los clientes que lo necesitan: cuánto hay de cada producto, hasta cuándo vale la oferta y qué lo hace
              distinto. Lo agotado no sale en el plan del mes, lo que tiene poco va al principio y lo que tiene mucho, más veces.
            </p>
          </div>
          <button type="button" role="switch" aria-labelledby={`${ids}-inv`} aria-checked={inventario}
            className={`toggle${inventario ? " is-on" : ""}`} disabled={Boolean(trabajando)}
            onClick={() => { setInventario((x) => !x); setCambiado(true); }}>
            <span className="toggle-thumb" />
          </button>
        </div>
      )}
      <div aria-live="polite"><Mensaje aviso={aviso} /></div>

      {!lista.length && <p className="cerebro-vacio">Todavía no hay productos. Pulsa «Proponer con IA» para sacarlos del cerebro, o añádelos a mano.</p>}
      <ul className="mercado-productos">
        {lista.map((p, i) => (
          <li key={p.id} className="mercado-producto" data-inactivo={!p.activo || undefined}>
            <div className="mercado-producto-fila">
              <div className="field" style={{ flex: "2 1 220px" }}>
                <label className="label" htmlFor={`${ids}-${i}-n`}>Nombre</label>
                <input id={`${ids}-${i}-n`} className="input" value={p.nombre} maxLength={80} readOnly={lectura} onChange={(e) => cambiar(p.id, "nombre", e.target.value)} />
              </div>
              <div className="field" style={{ flex: "1 1 130px" }}>
                <label className="label" htmlFor={`${ids}-${i}-t`}>Tipo</label>
                <select id={`${ids}-${i}-t`} className="input" value={p.tipo} disabled={lectura} onChange={(e) => cambiar(p.id, "tipo", e.target.value)}>
                  <option value="producto">Producto</option>
                  <option value="servicio">Servicio</option>
                </select>
              </div>
              <div className="field" style={{ flex: "1 1 130px" }}>
                <label className="label" htmlFor={`${ids}-${i}-p`}>Precio</label>
                <input id={`${ids}-${i}-p`} className="input" value={p.precio} maxLength={60} placeholder="Ej.: $25 · Desde $40" readOnly={lectura} onChange={(e) => cambiar(p.id, "precio", e.target.value)} />
              </div>
            </div>
            <div className="mercado-producto-fila">
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label className="label" htmlFor={`${ids}-${i}-o`}>Oferta vigente (opcional)</label>
                <input id={`${ids}-${i}-o`} className="input" value={p.oferta} maxLength={160} readOnly={lectura} onChange={(e) => cambiar(p.id, "oferta", e.target.value)} />
              </div>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label className="label" htmlFor={`${ids}-${i}-q`}>Para quién</label>
                <input id={`${ids}-${i}-q`} className="input" value={p.paraQuien} maxLength={240} readOnly={lectura} onChange={(e) => cambiar(p.id, "paraQuien", e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-${i}-b`}>Beneficios principales</label>
              <textarea id={`${ids}-${i}-b`} className="input" rows={2} value={p.beneficios} maxLength={700} readOnly={lectura} onChange={(e) => cambiar(p.id, "beneficios", e.target.value)} />
            </div>
            {inventario && (
              <>
                <div className="mercado-producto-fila">
                  <div className="field" style={{ flex: "1 1 150px" }}>
                    <label className="label" htmlFor={`${ids}-${i}-s`}>Disponibilidad</label>
                    <select id={`${ids}-${i}-s`} className="input" value={p.stock ?? ""} disabled={lectura} onChange={(e) => cambiar(p.id, "stock", e.target.value)}
                      aria-describedby={p.stock ? `${ids}-${i}-sh` : undefined}>
                      <option value="">Sin indicar</option>
                      {NIVELES_STOCK.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
                    </select>
                    {p.stock && <p id={`${ids}-${i}-sh`} className="hint" style={{ margin: 0 }}>{NIVELES_STOCK.find((n) => n.id === p.stock)?.ayuda}</p>}
                  </div>
                  <div className="field" style={{ flex: "2 1 220px" }}>
                    <label className="label" htmlFor={`${ids}-${i}-sn`}>Nota del inventario (sólo para la agencia)</label>
                    <input id={`${ids}-${i}-sn`} className="input" value={p.stockNota ?? ""} maxLength={120} placeholder="Ej.: 40 unidades · llegan más el 20 · 8 cupos por semana"
                      readOnly={lectura} onChange={(e) => cambiar(p.id, "stockNota", e.target.value)} />
                  </div>
                </div>
                <div className="mercado-producto-fila">
                  {p.oferta && (
                    <div className="field" style={{ flex: "1 1 180px" }}>
                      <span className="label">La oferta vale hasta</span>
                      <SelectorFecha value={p.ofertaHasta ?? ""} onChange={(d) => cambiar(p.id, "ofertaHasta", d || "")} etiqueta={`Fin de la oferta de ${p.nombre || "este producto"}`} vacio="Sin fecha de fin" prefijo="Hasta" />
                    </div>
                  )}
                  <div className="field" style={{ flex: "2 1 220px" }}>
                    <label className="label" htmlFor={`${ids}-${i}-d`}>Lo que lo hace distinto</label>
                    <input id={`${ids}-${i}-d`} className="input" value={p.diferenciador ?? ""} maxLength={240} placeholder="Ej.: el único con garantía de 2 años en la ciudad"
                      readOnly={lectura} onChange={(e) => cambiar(p.id, "diferenciador", e.target.value)} />
                  </div>
                </div>
              </>
            )}
            {(!lectura || p.fotos?.length > 0) && (
              <FotosProducto client={client} producto={p} lectura={lectura} onCambiar={(fotos) => cambiar(p.id, "fotos", fotos)} />
            )}
            {!lectura && (
              <div className="mercado-producto-pie">
                <label className="cerebro-casilla">
                  <input type="checkbox" checked={p.activo} onChange={(e) => cambiar(p.id, "activo", e.target.checked)} />
                  <span>Activo (se vende ahora)</span>
                </label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setLista((l) => l.filter((x) => x.id !== p.id)); setCambiado(true); }}>
                  <Icon name="trash" size={14} /> Quitar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!lectura && (
        <div className="mercado-pie">
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={Boolean(trabajando) || !cambiado}>
            {trabajando === "guardar" ? "Guardando…" : "Guardar catálogo"}
          </button>
          {!cambiado && productosActivos(lista).length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={onSeguir}>Seguir al estudio <Icon name="chevronRight" size={16} /></button>
          )}
        </div>
      )}
    </div>
  );
}

/** El mensaje para el cliente: se puede retocar, copiar o abrir en WhatsApp. */
function PedirDatos({ id, texto, onTexto, onCerrar }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch { /* sin portapapeles: el texto está a la vista para copiarlo a mano */ }
  };
  return (
    <div id={id} className="mercado-pedir">
      <label className="label" htmlFor={`${id}-t`}>Mensaje para el cliente (puedes cambiarlo antes de enviarlo)</label>
      <textarea id={`${id}-t`} className="input" rows={9} value={texto} onChange={(e) => onTexto(e.target.value)} />
      <div className="mercado-acciones">
        <button type="button" className="btn btn-primary btn-sm" onClick={copiar}><Icon name="copy" size={14} /> {copiado ? "Copiado" : "Copiar"}</button>
        <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
          <Icon name="external" size={14} /> Abrir en WhatsApp
        </a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrar}>Cerrar</button>
      </div>
      <span role="status" className="sr-only">{copiado ? "Mensaje copiado" : ""}</span>
    </div>
  );
}

// ------------------------------------------------------------
// Estudio
// ------------------------------------------------------------

function PanelEstudio({ client, datos, lectura, onOcupado, onDatos, onCambioCerebro, onIrCatalogo }) {
  const ids = useId();
  const [material, setMaterial] = useState("");
  const [borrador, setBorrador] = useState(datos.borrador);
  const [paso, setPaso] = useState(null);        // el paso que corre: { nombre }
  const [aviso, setAviso] = useState(null);
  const [cambiado, setCambiado] = useState(false);
  const [guardando, setGuardando] = useState("");
  const parar = useRef(false);
  const activos = productosActivos(datos.catalogo);
  const pasos = pasosDelEstudio(datos.catalogo, borrador);
  const faltan = pasos.filter((p) => !p.hecho);
  const ocupado = Boolean(paso) || Boolean(guardando);

  useEffect(() => { onOcupado(ocupado); }, [ocupado, onOcupado]);

  /** Corre los pasos que falten, uno detrás de otro. `deNuevo` rehace todo desde lo general. */
  const realizar = async (deNuevo = false) => {
    parar.current = false;
    setAviso(null);
    const pendientes = deNuevo ? pasosDelEstudio(datos.catalogo, null) : faltan;
    let ultimo = borrador;
    const avisos = new Set();
    let busquedas = 0;
    try {
      for (const p of pendientes) {
        if (parar.current) break;
        setPaso({ nombre: p.nombre, general: p.clave === "general" });
        const r = p.clave === "general"
          ? await estudiarGeneral(client.id, material)
          : await estudiarProducto(client.id, p.clave, material);
        ultimo = r.borrador;
        busquedas += Number(r.busquedas ?? 0);
        if (r.aviso) avisos.add(r.aviso);
        setBorrador(r.borrador);
        onDatos({ borrador: r.borrador });
      }
      setAviso({
        ok: true,
        texto: `${parar.current ? "Detenido. Lo hecho queda guardado en el borrador." : "Listo: revisa el estudio y apruébalo."}${busquedas ? ` La IA hizo ${busquedas} ${busquedas === 1 ? "búsqueda" : "búsquedas"} en internet.` : ""}${avisos.size ? ` ${[...avisos].join(" ")}` : ""}`,
      });
    } catch (e) {
      setAviso({ ok: false, texto: `${e.message} Lo hecho hasta aquí queda en el borrador: «Continuar» sigue donde se quedó.` });
    }
    setBorrador(ultimo);
    setPaso(null);
    setCambiado(false);
  };

  const editar = (cambio) => { setBorrador((b) => cambio(structuredClone(b))); setCambiado(true); };

  const guardarCambios = async () => {
    setGuardando("guardar");
    try {
      const r = await guardarBorrador(client.id, borrador);
      setBorrador(r.borrador);
      onDatos({ borrador: r.borrador });
      setCambiado(false);
      setAviso({ ok: true, texto: "Cambios guardados en el borrador." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setGuardando("");
  };

  const aprobar = async () => {
    setGuardando("aprobar");
    setAviso(null);
    try {
      if (cambiado) await guardarBorrador(client.id, borrador);
      const r = await aprobarEstudio(client.id);
      onDatos({ estudio: r.estudio, borrador: null });
      setBorrador(null);
      setCambiado(false);
      onCambioCerebro?.();
      setAviso({
        ok: !r.avisoDrive,
        texto: `Estudio aprobado: ${r.notas} ${r.notas === 1 ? "nota" : "notas"} en el cerebro${r.drive ? " y el documento en Drive" : ""}.${r.avisoDrive ? ` ${r.avisoDrive}` : ""}`,
        enlace: r.drive?.enlace,
      });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setGuardando("");
  };

  const descartar = async () => {
    setGuardando("descartar");
    try {
      await guardarBorrador(client.id, null);
      setBorrador(null);
      onDatos({ borrador: null });
      setAviso({ ok: true, texto: "Borrador descartado." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
    setGuardando("");
  };

  const vista = borrador ?? datos.estudio;
  const esBorrador = Boolean(borrador);

  return (
    <div className="mercado-panel">
      {!activos.length && (
        <p className="cerebro-aviso" role="note">
          Sin catálogo el estudio sólo puede ser general. <button type="button" className="btn btn-ghost btn-sm" onClick={onIrCatalogo}>Armar el catálogo primero</button>
        </p>
      )}

      {!lectura && (
        <>
          <div className="field">
            <label className="label" htmlFor={`${ids}-m`}>Material del cliente (opcional, muy recomendable)</label>
            <textarea id={`${ids}-m`} className="input" rows={4} maxLength={MAX_MATERIAL} value={material} disabled={ocupado}
              placeholder="Pega reseñas de Google, comentarios, conversaciones de WhatsApp, preguntas frecuentes… Es la voz real de sus clientes: lo que más afina el estudio."
              onChange={(e) => setMaterial(e.target.value)} />
            <p className="hint">{material.length.toLocaleString("es")} de {MAX_MATERIAL.toLocaleString("es")} caracteres. No se guarda aparte: se usa para este estudio.</p>
          </div>

          <ol className="mercado-pasos" aria-label="Pasos del estudio">
            {pasos.map((p) => (
              <li key={p.clave} data-hecho={p.hecho || undefined} data-corriendo={paso?.nombre === p.nombre || undefined}>
                <Icon name={p.hecho ? "checkCircle" : paso?.nombre === p.nombre ? "refresh" : "circle"} size={16} />
                <span>{p.clave === "general" ? p.nombre : `Estudio de «${p.nombre}»`}</span>
              </li>
            ))}
          </ol>

          <div className="mercado-acciones">
            {!paso ? (
              <>
                <button type="button" className="btn btn-accent" disabled={ocupado || (!faltan.length && esBorrador)} onClick={() => realizar(!esBorrador)}>
                  <Icon name="sparkles" size={16} /> {esBorrador && faltan.length && faltan.length < pasos.length ? "Continuar el estudio" : "Realizar estudio de mercado"}
                </button>
                {esBorrador && (
                  <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => realizar(true)}>
                    <Icon name="refresh" size={16} /> Rehacer todo
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => { parar.current = true; }}>
                <Icon name="pause" size={16} /> Detener después de este paso
              </button>
            )}
          </div>
        </>
      )}

      <div aria-live="polite">
        {paso && (
          <p role="status" className="cerebro-trabajando">
            {paso.general ? "Estudiando el mercado en general (busca en internet): de 1 a 4 minutos." : `Estudiando «${paso.nombre}»: de 1 a 3 minutos.`} Puedes seguir en otra pestaña; no cierres esta.
          </p>
        )}
        <Mensaje aviso={aviso} />
      </div>

      {vista ? (
        <div className="mercado-revision">
          <div className="mercado-revision-cabecera">
            <h3 className="mercado-subtitulo">{esBorrador ? "Revisa antes de aprobar" : `Estudio aprobado${datos.estudio?.aprobadoAt ? ` el ${fecha(datos.estudio.aprobadoAt)}` : ""}`}</h3>
            {esBorrador && <span className="badge">Borrador</span>}
          </div>
          {vista.general && <RevisionGeneral general={vista.general} editable={esBorrador && !lectura && !paso} onEditar={editar} />}
          {Object.entries(vista.productos ?? {}).map(([id, est]) => (
            <RevisionProducto key={id} id={id} estudio={est} producto={datos.catalogo.find((p) => p.id === id)}
              editable={esBorrador && !lectura && !paso} onEditar={editar} />
          ))}
        </div>
      ) : (
        !paso && <p className="cerebro-vacio">Todavía no hay estudio. Pulsa «Realizar estudio de mercado».</p>
      )}

      {esBorrador && !lectura && !paso && (
        <div className="mercado-pie">
          <button type="button" className="btn btn-primary" onClick={aprobar} disabled={Boolean(guardando) || !borrador?.general}>
            <Icon name="check" size={16} /> {guardando === "aprobar" ? "Guardando…" : "Aprobar y guardar en el cerebro y en Drive"}
          </button>
          {cambiado && <button type="button" className="btn btn-secondary" onClick={guardarCambios} disabled={Boolean(guardando)}>{guardando === "guardar" ? "Guardando…" : "Guardar cambios"}</button>}
          <button type="button" className="btn btn-ghost" onClick={descartar} disabled={Boolean(guardando)}>Descartar borrador</button>
        </div>
      )}
    </div>
  );
}

/** Un texto del estudio: editable en el borrador, de lectura si no. */
function Campo({ etiqueta, valor, onCambio, editable, filas = 2, max = 1200 }) {
  const id = useId();
  if (!editable) {
    return valor ? (
      <div className="mercado-campo">
        <p className="mercado-campo-etiqueta">{etiqueta}</p>
        <p className="mercado-campo-texto">{valor}</p>
      </div>
    ) : null;
  }
  return (
    <div className="field mercado-campo">
      <label className="label" htmlFor={id}>{etiqueta}</label>
      {filas > 1
        ? <textarea id={id} className="input" rows={filas} maxLength={max} value={valor ?? ""} onChange={(e) => onCambio(e.target.value)} />
        : <input id={id} className="input" maxLength={max} value={valor ?? ""} onChange={(e) => onCambio(e.target.value)} />}
    </div>
  );
}

function RevisionGeneral({ general: g, editable, onEditar }) {
  const ids = useId();
  const set = (ruta) => (v) => onEditar((b) => { ruta(b.general, v); return b; });
  return (
    <details className="mercado-bloque" open>
      <summary><Icon name="globe" size={16} /> El mercado en general</summary>
      <Campo etiqueta="Rubro" valor={g.rubro} editable={editable} filas={1} max={120} onCambio={set((x, v) => { x.rubro = v; })} />
      <Campo etiqueta="Panorama" valor={g.resumen} editable={editable} filas={4} max={1500} onCambio={set((x, v) => { x.resumen = v; })} />
      <Campo etiqueta="Propuesta de valor" valor={g.propuestaValor} editable={editable} max={400} onCambio={set((x, v) => { x.propuestaValor = v; })} />

      <h4 className="mercado-h4">Perfiles de comprador</h4>
      <div className="mercado-rejilla">
        {g.perfiles.map((p, i) => (
          <div key={i} className="mercado-ficha">
            <Campo etiqueta="Nombre" valor={p.nombre} editable={editable} filas={1} max={60} onCambio={set((x, v) => { x.perfiles[i].nombre = v; })} />
            <Campo etiqueta="Quién es" valor={p.quien} editable={editable} max={300} onCambio={set((x, v) => { x.perfiles[i].quien = v; })} />
            <Campo etiqueta="Qué le duele" valor={p.dolor} editable={editable} max={300} onCambio={set((x, v) => { x.perfiles[i].dolor = v; })} />
            <Campo etiqueta="Qué quiere lograr" valor={p.aspiracion} editable={editable} max={300} onCambio={set((x, v) => { x.perfiles[i].aspiracion = v; })} />
          </div>
        ))}
      </div>

      <h4 className="mercado-h4">Los deseos que mueven la compra</h4>
      <ul className="mercado-lista-simple">
        {g.deseos.map((d, i) => (
          <li key={i}>
            {editable ? (
              <div className="mercado-producto-fila">
                <div className="field" style={{ flex: "0 1 200px" }}>
                  <label className="label" htmlFor={`${ids}-d${i}`}>Deseo</label>
                  <select id={`${ids}-d${i}`} className="input" value={d.deseo} onChange={(e) => set((x, v) => { x.deseos[i].deseo = v; })(e.target.value)}>
                    {DESEOS_REISS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ flex: "1 1 240px" }}>
                  <Campo etiqueta="Por qué" valor={d.porque} editable max={300} onCambio={set((x, v) => { x.deseos[i].porque = v; })} />
                </div>
              </div>
            ) : <><strong>{d.deseo}</strong>: {d.porque}</>}
          </li>
        ))}
      </ul>

      <h4 className="mercado-h4">Nivel de consciencia del mercado</h4>
      {editable ? (
        <div className="field">
          <label className="label" htmlFor={`${ids}-n`}>Nivel dominante</label>
          <select id={`${ids}-n`} className="input" value={g.nivel.dominante} onChange={(e) => set((x, v) => { x.nivel.dominante = v; })(e.target.value)}>
            <option value="">Sin definir</option>
            {NIVELES_CONSCIENCIA.map((n) => <option key={n.clave} value={n.clave}>{n.nombre} — {n.ayuda}</option>)}
          </select>
        </div>
      ) : <p className="mercado-campo-texto"><strong>{nombreDeNivel(g.nivel.dominante) || "Sin definir"}</strong>{g.nivel.porque ? `: ${g.nivel.porque}` : ""}</p>}

      {g.diferenciadores.length > 0 && <><h4 className="mercado-h4">Diferenciadores</h4><ul className="mercado-lista-simple">{g.diferenciadores.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      {g.competidores.length > 0 && (
        <>
          <h4 className="mercado-h4">Competencia <span className="badge cerebro-interna"><Icon name="lock" size={12} /> Interna</span></h4>
          <ul className="mercado-lista-simple">
            {g.competidores.map((c, i) => <li key={i}><strong>{c.nombre}</strong>: {c.queHacen}{c.fuerte ? ` Fuerte: ${c.fuerte}.` : ""}{c.debil ? ` Débil: ${c.debil}.` : ""}</li>)}
          </ul>
        </>
      )}
      {g.oportunidades.length > 0 && <><h4 className="mercado-h4">Oportunidades</h4><ul className="mercado-lista-simple">{g.oportunidades.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      {g.faltan.length > 0 && <><h4 className="mercado-h4">Falta por confirmar</h4><ul className="mercado-lista-simple mercado-faltan">{g.faltan.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      {g.fuentes.length > 0 && (
        <details className="mercado-fuentes">
          <summary>Fuentes ({g.fuentes.length})</summary>
          <ul>{g.fuentes.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{u}</a></li>)}</ul>
        </details>
      )}
    </details>
  );
}

function RevisionProducto({ id, estudio: e, producto, editable, onEditar }) {
  const set = (ruta) => (v) => onEditar((b) => { ruta(b.productos[id], v); return b; });
  return (
    <details className="mercado-bloque">
      <summary><Icon name="star" size={16} /> {producto?.nombre ?? e.nombre}{producto?.precio ? ` · ${producto.precio}` : ""}</summary>
      <div className="mercado-rejilla">
        {ELEMENTOS_MERCADO.map((el) => (
          <div key={el.clave} className="mercado-ficha">
            <Campo etiqueta={el.titulo} valor={e.elementos[el.clave]} editable={editable} filas={3} onCambio={set((x, v) => { x.elementos[el.clave] = v; })} />
          </div>
        ))}
      </div>

      {e.objeciones.length > 0 && (
        <>
          <h4 className="mercado-h4">Objeciones y cómo responderlas</h4>
          {e.objeciones.map((o, i) => (
            <div key={i} className="mercado-ficha">
              <Campo etiqueta="Objeción" valor={o.objecion} editable={editable} filas={1} max={200} onCambio={set((x, v) => { x.objeciones[i].objecion = v; })} />
              <Campo etiqueta="Respuesta" valor={o.respuesta} editable={editable} max={400} onCambio={set((x, v) => { x.objeciones[i].respuesta = v; })} />
            </div>
          ))}
        </>
      )}

      <h4 className="mercado-h4">Ganchos por nivel de consciencia</h4>
      {NIVELES_CONSCIENCIA.map((n) => (
        <Campo key={n.clave} etiqueta={`${n.nombre} (${n.angulo === "dolor" ? "por el dolor" : "por la ganancia"})`} valor={e.ganchos[n.clave]} editable={editable} filas={1} max={220}
          onCambio={set((x, v) => { x.ganchos[n.clave] = v; })} />
      ))}

      <h4 className="mercado-h4">Textos de anuncio</h4>
      <Campo etiqueta={`Título (hasta ${LIMITES_ANUNCIO.titulo})`} valor={e.anuncio.titulo} editable={editable} filas={1} max={LIMITES_ANUNCIO.titulo} onCambio={set((x, v) => { x.anuncio.titulo = v; })} />
      <Campo etiqueta={`Texto principal (hasta ${LIMITES_ANUNCIO.textoPrincipal})`} valor={e.anuncio.textoPrincipal} editable={editable} filas={3} max={LIMITES_ANUNCIO.textoPrincipal} onCambio={set((x, v) => { x.anuncio.textoPrincipal = v; })} />
      <Campo etiqueta={`Descripción (hasta ${LIMITES_ANUNCIO.descripcion})`} valor={e.anuncio.descripcion} editable={editable} filas={1} max={LIMITES_ANUNCIO.descripcion} onCambio={set((x, v) => { x.anuncio.descripcion = v; })} />

      {e.pruebas.length > 0 && <><h4 className="mercado-h4">Pruebas reales</h4><ul className="mercado-lista-simple">{e.pruebas.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
      {e.faltan.length > 0 && <><h4 className="mercado-h4">Falta por confirmar</h4><ul className="mercado-lista-simple mercado-faltan">{e.faltan.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
    </details>
  );
}

// ------------------------------------------------------------
// Competencia
// ------------------------------------------------------------

function PanelCompetencia({ client, datos, lectura, onOcupado, onDatos, onCambioCerebro }) {
  const ids = useId();
  const entrada = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [f, setF] = useState({ competidor: "", enlace: "", desde: null, nota: "", origen: "anuncio" });
  const [creando, setCreando] = useState(null); // el Estudio abierto con una referencia: { inicial }
  const esVideo = Boolean(archivo?.type?.startsWith("video/"));
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null);
  const vista = useMemo(() => (archivo ? URL.createObjectURL(archivo) : ""), [archivo]);
  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);
  const ocupar = (t) => { setTrabajando(t); onOcupado(Boolean(t)); };
  const competidores = (datos.estudio ?? datos.borrador)?.general?.competidores ?? [];

  const elegir = (e) => {
    // Se copia ANTES de vaciar el campo: vaciarlo deja la lista vacía.
    const [uno] = [...e.target.files];
    e.target.value = "";
    if (uno) setArchivo(uno);
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (!archivo) return;
    ocupar("subir");
    setAviso(null);
    try {
      const { archivo: subido } = await subirImagen(client.id, archivo);
      const r = await agregarReferencia(client.id, { archivoId: subido.id, competidor: f.competidor, enlace: f.enlace, desde: f.desde ?? "", nota: f.nota, origen: f.origen });
      onDatos({ referencias: [r.referencia, ...datos.referencias] });
      onCambioCerebro?.();
      setArchivo(null);
      setF({ competidor: "", enlace: "", desde: null, nota: "", origen: "anuncio" });
      setAviso(r.aviso
        ? { ok: false, texto: `Guardada, pero sin analizar: ${r.aviso}` }
        : { ok: true, texto: `Referencia analizada${r.referencia?.medio === "video" ? " (con su estructura tramo a tramo)" : ""} y guardada en el cerebro (como nota interna) y en la carpeta «Competencia» del Estudio.` });
    } catch (err) {
      setAviso({ ok: false, texto: err.message });
    }
    ocupar("");
  };

  const reanalizar = async (ref) => {
    ocupar(ref.id);
    try {
      const r = await reanalizarReferencia(client.id, ref.id);
      onDatos({ referencias: datos.referencias.map((x) => (x.id === ref.id ? r.referencia : x)) });
    } catch (err) {
      setAviso({ ok: false, texto: err.message });
    }
    ocupar("");
  };

  const quitar = async (ref) => {
    ocupar(ref.id);
    try {
      await borrarReferencia(client.id, ref.id);
      onDatos({ referencias: datos.referencias.filter((x) => x.id !== ref.id) });
      onCambioCerebro?.();
    } catch (err) {
      setAviso({ ok: false, texto: err.message });
    }
    ocupar("");
  };

  const biblioteca = (texto) => urlBibliotecaWeb({ texto, paises: ["PA"], estado: "ACTIVE" });

  return (
    <div className="mercado-panel">
      <p className="hint" style={{ marginTop: 0 }}>
        La API de Meta no enseña los anuncios comerciales de Panamá: se miran en la web de la Biblioteca. Un anuncio que lleva
        meses activo casi siempre le está funcionando a quien lo paga. Guarda la captura —o descarga el video, también los
        orgánicos de TikTok o Reels— y súbelo aquí: de un video la IA saca su estructura para escribir guiones con la misma forma.
      </p>
      <div className="mercado-acciones">
        {competidores.slice(0, 6).map((c) => (
          <a key={c.nombre} className="btn btn-secondary btn-sm" href={biblioteca(c.nombre)} target="_blank" rel="noreferrer">
            <Icon name="search" size={14} /> {c.nombre}
          </a>
        ))}
        <a className="btn btn-secondary btn-sm" href={biblioteca(f.competidor || client.industry || client.name)} target="_blank" rel="noreferrer">
          <Icon name="external" size={14} /> Abrir la Biblioteca de anuncios
        </a>
      </div>

      {!lectura && (
        <form className="mercado-referencia-form card" onSubmit={enviar}>
          <div className="mercado-producto-fila">
            <div className="mercado-captura">
              {vista ? (esVideo ? <video src={vista} muted controls playsInline aria-label="Video elegido" /> : <img src={vista} alt="Captura elegida" />) : <span className="hint">Sin captura ni video</span>}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => entrada.current?.click()} disabled={Boolean(trabajando)}>
                <Icon name="upload" size={14} /> {archivo ? "Cambiar" : "Elegir captura o video"}
              </button>
              <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" onChange={elegir} className="cerebro-archivo" aria-label="Elegir la captura o el video" tabIndex={-1} />
            </div>
            <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <div className="field">
                <label className="label" htmlFor={`${ids}-c`}>Competidor</label>
                <input id={`${ids}-c`} className="input" list={`${ids}-cl`} maxLength={80} value={f.competidor} onChange={(e) => setF({ ...f, competidor: e.target.value })} />
                <datalist id={`${ids}-cl`}>{competidores.map((c) => <option key={c.nombre} value={c.nombre} />)}</datalist>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-o`}>Qué es</label>
                <select id={`${ids}-o`} className="input" value={f.origen} onChange={(e) => setF({ ...f, origen: e.target.value })}>
                  <option value="anuncio">Un anuncio (pagado)</option>
                  <option value="organico">Contenido orgánico (TikTok, Reels…)</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-e`}>Enlace (opcional)</label>
                <input id={`${ids}-e`} className="input" type="url" maxLength={300} placeholder="https://www.facebook.com/ads/library/?id=…" value={f.enlace} onChange={(e) => setF({ ...f, enlace: e.target.value })} />
              </div>
              <div className="field">
                <span className="label">Activo desde (lo dice la Biblioteca)</span>
                <SelectorFecha value={f.desde} onChange={(d) => setF({ ...f, desde: d })} etiqueta="Activo desde" vacio="Sin fecha" prefijo="Desde" />
                {f.desde && <p className="hint">{fraseActivo(f.desde)}</p>}
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-n`}>Nota (opcional)</label>
                <input id={`${ids}-n`} className="input" maxLength={400} placeholder="Ej.: lo vi con muchos comentarios" value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
              </div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!archivo || Boolean(trabajando)}>
            <Icon name="sparkles" size={16} /> {trabajando === "subir" ? (esVideo ? "Subiendo y viendo el video…" : "Subiendo y analizando…") : "Subir y analizar"}
          </button>
        </form>
      )}
      <div aria-live="polite"><Mensaje aviso={aviso} /></div>

      {!datos.referencias.length && <p className="cerebro-vacio">Todavía no hay referencias de la competencia.</p>}
      <ul className="mercado-referencias">
        {datos.referencias.map((r) => (
          <li key={r.id} className="mercado-referencia card">
            {r.clave && (r.medio === "video"
              ? <video src={`/api/media/${r.clave}`} controls playsInline preload="metadata" aria-label={`Video de ${r.competidor || "la competencia"}`} />
              : <img src={`/api/media/${r.clave}`} alt={`Anuncio de ${r.competidor || "la competencia"}`} loading="lazy" />)}
            <div className="mercado-referencia-texto">
              <p className="mercado-referencia-titulo">
                <strong>{r.competidor || "Competencia"}</strong>
                <span className="hint"> · {r.medio === "video" ? "Video" : "Imagen"} {r.origen === "organico" ? "orgánico" : "de anuncio"}</span>
                {r.desde && <span className="hint"> · {fraseActivo(r.desde)}</span>}
                {r.enlace && <> · <a href={r.enlace} target="_blank" rel="noreferrer">Ver anuncio <Icon name="external" size={12} /></a></>}
              </p>
              {r.analisis ? (
                <dl className="mercado-analisis">
                  {[["Gancho", r.analisis.gancho], ["Ángulo", r.analisis.angulo], ["Oferta", r.analisis.oferta], ["Formato", r.analisis.formato],
                    ["Nivel", nombreDeNivel(r.analisis.nivel)], ["Deseo", r.analisis.deseo], ["Por qué funciona", r.analisis.porQueFunciona],
                    ["Cómo adaptarlo", r.analisis.ideaParaNosotros]].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                  {r.analisis.estructura && (
                    <div>
                      <dt>Estructura</dt>
                      <dd>
                        <ol className="mercado-tramos">
                          {r.analisis.estructura.tramos.map((t, i) => <li key={i}><strong>{t.desde}–{t.hasta} s</strong> {t.que}</li>)}
                        </ol>
                        {[r.analisis.estructura.camara && `Cámara: ${r.analisis.estructura.camara}`, r.analisis.estructura.ritmo && `Ritmo: ${r.analisis.estructura.ritmo}`, r.analisis.estructura.sonido && `Sonido: ${r.analisis.estructura.sonido}`]
                          .filter(Boolean).map((x) => <p key={x} className="hint" style={{ margin: 0 }}>{x}</p>)}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : <p className="hint">Sin analizar.</p>}
              {!lectura && r.analisis && (
                <AccionesReferencia client={client} referencia={r} productos={productosActivos(datos.catalogo)} ocupado={Boolean(trabajando)} onOcupado={ocupar}
                  onCrear={(inicial) => setCreando({ inicial })} onError={(texto) => setAviso({ ok: false, texto })} />
              )}
              {!lectura && (
                <div className="mercado-acciones">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(trabajando)} onClick={() => reanalizar(r)}>
                    <Icon name="refresh" size={14} /> {trabajando === r.id ? "Analizando…" : "Analizar otra vez"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(trabajando)} onClick={() => quitar(r)} aria-label={`Quitar la referencia de ${r.competidor || "la competencia"}`}>
                    <Icon name="trash" size={14} /> Quitar
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {creando && <EstudioConReferencia client={client} inicial={creando.inicial} onCerrar={() => setCreando(null)} />}
    </div>
  );
}

/**
 * Lo que se hace con una referencia ya analizada: «Adaptar a la marca» (un guion con su misma estructura, para un
 * producto) y llevarla al Estudio: una captura se RECREA con la marca (va de imagen de referencia) y un video se
 * SIGUE con Kling Omni (va de video de referencia).
 */
function AccionesReferencia({ client, referencia: r, productos, ocupado, onOcupado, onCrear, onError }) {
  const ids = useId();
  const [productoId, setProductoId] = useState("");
  const [formato, setFormato] = useState(r.medio === "video" ? "reel" : "post");
  const [adaptacion, setAdaptacion] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const producto = productos.find((p) => p.id === productoId) ?? null;
  const archivo = { id: r.archivoId, clave: r.clave, src: `/api/media/${r.clave}`, tipo: r.medio === "video" ? "video" : "imagen", prompt: `Referencia: ${r.competidor || "competencia"}` };

  const adaptar = async () => {
    setTrabajando(true);
    onOcupado(`adaptar-${r.id}`);
    try {
      setAdaptacion((await adaptarReferencia(client.id, r.id, { productoId, formato })).adaptacion);
    } catch (e) {
      onError(e.message);
    }
    setTrabajando(false);
    onOcupado("");
  };
  const texto = adaptacion ? [adaptacion.titulo, adaptacion.idea, "", adaptacion.guion, adaptacion.textoPantalla && `Texto en pantalla: ${adaptacion.textoPantalla}`, "", adaptacion.descripcion].filter((x) => x !== undefined && x !== false).join("\n").trim() : "";
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* el texto está a la vista */ }
  };

  return (
    <div className="mercado-adaptar">
      <div className="mercado-producto-fila">
        <div className="field" style={{ flex: "2 1 180px" }}>
          <label className="label" htmlFor={`${ids}-p`}>Para qué producto</label>
          <select id={`${ids}-p`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            <option value="">El producto que mejor encaje</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: "1 1 120px" }}>
          <label className="label" htmlFor={`${ids}-f`}>Formato</label>
          <select id={`${ids}-f`} className="input" value={formato} onChange={(e) => setFormato(e.target.value)}>
            <option value="reel">Reel</option>
            <option value="carrusel">Carrusel</option>
            <option value="post">Post</option>
          </select>
        </div>
      </div>
      <div className="mercado-acciones">
        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={adaptar}>
          <Icon name="sparkles" size={14} /> {trabajando ? "Escribiendo…" : `Adaptar a ${client.name}`}
        </button>
        {r.medio === "video" ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado}
            onClick={() => onCrear({ tipo: "video", modelo: "kling-omni-video", video: archivo, proporcion: "9:16", preset: "anuncio", prompt: ideaParaSeguirVideo(r, producto) })}>
            <Icon name="video" size={14} /> Seguir este video con mi marca
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado}
            onClick={() => onCrear({ tipo: "imagen", referencias: [archivo], proporcion: "4:5", preset: "anuncio", prompt: ideaParaRecrear(r, producto) })}>
            <Icon name="imageAi" size={14} /> Recrear con mi marca
          </button>
        )}
      </div>
      {adaptacion && (
        <div className="mercado-pedir" role="group" aria-label="Guion adaptado">
          <label className="label" htmlFor={`${ids}-t`}>Guion adaptado (revísalo antes de usarlo)</label>
          <textarea id={`${ids}-t`} className="input" rows={10} readOnly value={texto} />
          <div className="mercado-acciones">
            <button type="button" className="btn btn-primary btn-sm" onClick={copiar}><Icon name="copy" size={14} /> {copiado ? "Copiado" : "Copiar"}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdaptacion(null)}>Cerrar</button>
          </div>
          <span role="status" className="sr-only">{copiado ? "Guion copiado" : ""}</span>
        </div>
      )}
    </div>
  );
}

/** El Estudio del cliente en un diálogo, arrancando con la referencia puesta. Lo creado queda en su galería. */
function EstudioConReferencia({ client, inicial, onCerrar }) {
  const ref = useDialogA11y(onCerrar);
  return (
    <div className="overlay overlay-sheet">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Crear con la referencia" className="sheet mercado-estudio">
        <Suspense fallback={<p role="status" className="est-nota" style={{ padding: "var(--sp-5)" }}>Abriendo el Estudio…</p>}>
          <Estudio client={client} modo="dialogo" inicial={inicial} onCerrar={onCerrar} />
        </Suspense>
      </div>
    </div>
  );
}
