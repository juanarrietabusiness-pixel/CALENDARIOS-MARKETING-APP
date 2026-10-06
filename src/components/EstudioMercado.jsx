import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { soloLectura } from "../lib/sesionActual";
import {
  leerMercado, guardarCatalogo, proponerCatalogo, estudiarGeneral, estudiarProducto, guardarBorrador, aprobarEstudio,
  agregarReferencia, reanalizarReferencia, borrarReferencia,
} from "../lib/mercado";
import { subirImagen } from "../lib/estudio";
import { urlBibliotecaWeb } from "../lib/biblioteca";
import {
  ELEMENTOS_MERCADO, DESEOS_REISS, NIVELES_CONSCIENCIA, LIMITES_ANUNCIO, MAX_MATERIAL, MAX_PRODUCTOS,
  limpiarCatalogo, productosActivos, pasosDelEstudio, nombreDeNivel, fraseActivo,
} from "../lib/estudioMercado";
import "./EstudioMercado.css";

// ============================================================
// El estudio de mercado de un cliente (en la pestaña Cerebro)
//
// Una tarjeta con el estado —cuántos productos, si hay estudio aprobado,
// cuántas referencias— y un diálogo con tres pestañas:
//
//   Catálogo     Los productos y servicios con su precio. «Proponer con IA»
//                los saca del cerebro; nada se guarda sin pulsar Guardar.
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
              <PanelCatalogo client={client} catalogo={datos.catalogo} lectura={lectura} onOcupado={setOcupado}
                onGuardado={(catalogo) => { onDatos({ catalogo }); onCambioCerebro?.(); }} onSeguir={() => setTab("estudio")} />
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

const PRODUCTO_VACIO = () => ({ id: `p-nuevo-${Date.now().toString(36)}`, nombre: "", tipo: "producto", precio: "", oferta: "", paraQuien: "", beneficios: "", activo: true });

function PanelCatalogo({ client, catalogo, lectura, onOcupado, onGuardado, onSeguir }) {
  const ids = useId();
  const [lista, setLista] = useState(() => (catalogo.length ? catalogo : []));
  const [trabajando, setTrabajando] = useState("");
  const [aviso, setAviso] = useState(null);
  const [cambiado, setCambiado] = useState(false);
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
      const r = await guardarCatalogo(client.id, limpiarCatalogo(lista));
      setLista(r.catalogo);
      setCambiado(false);
      onGuardado(r.catalogo);
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
  const [f, setF] = useState({ competidor: "", enlace: "", desde: null, nota: "" });
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
      const r = await agregarReferencia(client.id, { archivoId: subido.id, competidor: f.competidor, enlace: f.enlace, desde: f.desde ?? "", nota: f.nota });
      onDatos({ referencias: [r.referencia, ...datos.referencias] });
      onCambioCerebro?.();
      setArchivo(null);
      setF({ competidor: "", enlace: "", desde: null, nota: "" });
      setAviso(r.aviso ? { ok: false, texto: `Guardada, pero sin analizar: ${r.aviso}` } : { ok: true, texto: "Referencia analizada y guardada en el cerebro (como nota interna) y en la carpeta «Competencia» del Estudio." });
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
        meses activo casi siempre le está funcionando a quien lo paga. Guarda la captura y súbela aquí.
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
              {vista ? <img src={vista} alt="Captura elegida" /> : <span className="hint">Sin captura</span>}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => entrada.current?.click()} disabled={Boolean(trabajando)}>
                <Icon name="upload" size={14} /> {archivo ? "Cambiar captura" : "Elegir captura"}
              </button>
              <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" onChange={elegir} className="cerebro-archivo" aria-label="Elegir la captura del anuncio" tabIndex={-1} />
            </div>
            <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              <div className="field">
                <label className="label" htmlFor={`${ids}-c`}>Competidor</label>
                <input id={`${ids}-c`} className="input" list={`${ids}-cl`} maxLength={80} value={f.competidor} onChange={(e) => setF({ ...f, competidor: e.target.value })} />
                <datalist id={`${ids}-cl`}>{competidores.map((c) => <option key={c.nombre} value={c.nombre} />)}</datalist>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-e`}>Enlace del anuncio (opcional)</label>
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
            <Icon name="sparkles" size={16} /> {trabajando === "subir" ? "Subiendo y analizando…" : "Subir y analizar"}
          </button>
        </form>
      )}
      <div aria-live="polite"><Mensaje aviso={aviso} /></div>

      {!datos.referencias.length && <p className="cerebro-vacio">Todavía no hay referencias de la competencia.</p>}
      <ul className="mercado-referencias">
        {datos.referencias.map((r) => (
          <li key={r.id} className="mercado-referencia card">
            {r.clave && <img src={`/api/media/${r.clave}`} alt={`Anuncio de ${r.competidor || "la competencia"}`} loading="lazy" />}
            <div className="mercado-referencia-texto">
              <p className="mercado-referencia-titulo">
                <strong>{r.competidor || "Competencia"}</strong>
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
                </dl>
              ) : <p className="hint">Sin analizar.</p>}
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
    </div>
  );
}
