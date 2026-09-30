import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { soloLectura } from "../lib/sesionActual";
import * as api from "../lib/estudio";
import {
  MODELOS, modeloPorId, modeloPorDefecto, estimar, textoCosto, pideConfirmar, normalizarAjustes,
  NOMBRE_PROPORCION, MAX_POR_PEDIDO, MAX_PROMPT, estaVivo, PRECIOS_AL,
} from "../lib/estudioCatalogo";
import {
  filtrarArchivos, contarFiltros, trabajosVisibles, fraseDeTrabajo, hace, textoPapelera, nombreDeDescarga,
} from "../lib/estudio";
import "./Estudio.css";

// ============================================================
// La pestaña Estudio de un cliente
//
// Se pide una imagen, se ve aparecer y queda en la galería del cliente con
// su prompt, su modelo y lo que costó. De ahí se descarga, se usa de
// referencia para la siguiente, se guarda en una carpeta o se manda a la
// papelera (30 días).
//
// LO QUE PASA AL PEDIR. El servidor crea un TRABAJO y esta pantalla lo va
// avanzando un paso a la vez —una imagen por paso—, porque el Worker no
// puede esperar. Si se cierra la pestaña a medias, el servidor sigue solo
// (el cron del minuto). Cada modelo dice cuánto cuesta ANTES de pedir, y
// desde 0,50 $ pide un segundo toque.
//
// Ningún motor se llama desde el navegador: todo va por /api/estudio.
// ============================================================

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const CANTIDADES = [1, 2, 3, 4, 6, MAX_POR_PEDIDO];
const MODELOS_DE_IMAGEN = MODELOS.filter((m) => m.tipo === "imagen");

const reemplazar = (lista = [], t) => (lista.some((x) => x.id === t.id) ? lista.map((x) => (x.id === t.id ? t : x)) : [t, ...lista]);
const nombreDeModelo = (id) => modeloPorId(id)?.nombre ?? (id ? id : "Aplicación");

export default function Estudio({ client, pulso = 0 }) {
  const ids = useId();
  const lectura = soloLectura();
  const [datos, setDatos] = useState(null);
  const [motores, setMotores] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null); // { ok, texto }

  const [form, setForm] = useState({ modelo: "", prompt: "", n: 1, ajustes: {}, referencias: [] });
  const [confirmando, setConfirmando] = useState(null); // el costo a confirmar, o null
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const [filtro, setFiltro] = useState("todas");
  const [texto, setTexto] = useState("");
  const [enPapelera, setEnPapelera] = useState(false);
  const [visor, setVisor] = useState(null);
  const [descartados, setDescartados] = useState(() => new Set());
  const [carpetaNueva, setCarpetaNueva] = useState(null); // null = cerrado; texto = escribiendo
  const [renombrando, setRenombrando] = useState(null);
  const [borrando, setBorrando] = useState(null); // { id, usos } — pidiendo confirmación para borrar del todo

  const siguiendo = useRef(new Set());
  const montado = useRef(true);
  const entradaArchivo = useRef(null);
  const promptRef = useRef(null);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // ---------- Cargar ----------
  const cargar = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([api.leerEstudio(client.id), api.leerMotores()]);
      if (!montado.current) return;
      setDatos(g);
      setMotores(m.motores);
      setError("");
    } catch (e) {
      if (montado.current) setError(e.message);
    } finally {
      if (montado.current) setCargando(false);
    }
  }, [client.id]);

  useEffect(() => { cargar(); }, [cargar, pulso]);

  // El modelo de partida: uno real si su motor tiene llave, y si no, la prueba.
  useEffect(() => {
    if (!motores) return;
    setForm((f) => {
      if (f.modelo && modeloPorId(f.modelo)) return f;
      const activos = Object.fromEntries(Object.entries(motores).map(([k, v]) => [k, v.activo]));
      const m = modeloPorDefecto(activos);
      return { ...f, modelo: m.id, ajustes: normalizarAjustes(m, f.ajustes) };
    });
  }, [motores]);

  const modelo = modeloPorId(form.modelo);
  const motorActivo = (m) => Boolean(motores?.[m.motor]?.activo);
  const costo = modelo ? estimar(modelo, form.n) : 0;

  // ---------- Seguir un trabajo: un paso, y otro, hasta que termine ----------
  const seguir = useCallback(async (id) => {
    if (siguiendo.current.has(id)) return;
    siguiendo.current.add(id);
    let vistas = -1;
    try {
      while (montado.current) {
        let r;
        try {
          r = await api.avanzarTrabajo(client.id, id);
        } catch (e) {
          if (montado.current) setAviso({ ok: false, texto: e.message });
          break;
        }
        if (!montado.current) break;
        const t = r.trabajo;
        setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, t) } : d));
        const hechas = t.archivos?.length ?? 0;
        if (hechas !== vistas) { vistas = hechas; cargar(); } // las imágenes van apareciendo
        if (!estaVivo(t.estado)) break;
        // Otro tiene el paso, o el motor pidió esperar (saturación): sin prisa. Si no, el siguiente ya.
        await dormir(r.ocupado ? 2500 : t.nota ? 3000 : 200);
      }
    } finally {
      siguiendo.current.delete(id);
    }
  }, [client.id, cargar]);

  // Lo que quedó a medias al recargar se retoma (el cron también lo haría, pero más despacio).
  useEffect(() => {
    if (lectura || !datos) return;
    for (const t of datos.trabajos) if (estaVivo(t.estado)) seguir(t.id);
  }, [datos, lectura, seguir]);

  // ---------- Pedir ----------
  const cambiarModelo = (id) => {
    const m = modeloPorId(id);
    setConfirmando(null);
    setForm((f) => ({ ...f, modelo: id, ajustes: normalizarAjustes(m, f.ajustes), referencias: f.referencias.slice(0, m.referencias) }));
  };

  const enviar = async (confirmado = false) => {
    if (!modelo || enviando) return;
    if (!form.prompt.trim()) {
      setAviso({ ok: false, texto: "Escribe qué quieres crear." });
      promptRef.current?.focus();
      return;
    }
    if (!confirmado && pideConfirmar(costo)) { setConfirmando(costo); return; }
    setConfirmando(null);
    setEnviando(true);
    setAviso(null);
    try {
      const { trabajo } = await api.pedirImagenes(client.id, {
        modelo: form.modelo, prompt: form.prompt, n: form.n, ajustes: form.ajustes,
        medios: form.referencias.length ? { reference: form.referencias.map((r) => r.clave) } : {},
        confirmado: true,
      });
      setDatos((d) => (d ? { ...d, trabajos: reemplazar(d.trabajos, trabajo) } : d));
      seguir(trabajo.id);
    } catch (e) {
      if (e.datos?.codigo === "confirmar") setConfirmando(e.datos.costo);
      else setAviso({ ok: false, texto: e.message });
    } finally {
      setEnviando(false);
    }
  };

  // ---------- Referencias y subidas ----------
  const limiteRefs = modelo?.referencias ?? 0;
  const alternarReferencia = (a) => {
    setConfirmando(null);
    setForm((f) => {
      if (f.referencias.some((r) => r.id === a.id)) return { ...f, referencias: f.referencias.filter((r) => r.id !== a.id) };
      if (f.referencias.length >= limiteRefs) return f;
      return { ...f, referencias: [...f.referencias, a] };
    });
  };
  const esReferencia = (a) => form.referencias.some((r) => r.id === a.id);
  const usarDeReferencia = (a) => {
    if (!limiteRefs) { setAviso({ ok: false, texto: `${modelo?.nombre ?? "Este modelo"} no admite imágenes de referencia. Escoge otro modelo.` }); return; }
    if (!esReferencia(a) && form.referencias.length >= limiteRefs) { setAviso({ ok: false, texto: `${modelo.nombre} admite hasta ${limiteRefs} referencias.` }); return; }
    if (!esReferencia(a)) alternarReferencia(a);
    setAviso({ ok: true, texto: "Lista como referencia. Escribe qué quieres hacer con ella." });
    promptRef.current?.focus();
    promptRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  const subir = async (e) => {
    // Copiar ANTES de resetear: vaciar el campo vacía también su lista de archivos.
    const archivos = [...e.target.files];
    e.target.value = "";
    if (!archivos.length) return;
    setSubiendo(true);
    setAviso(null);
    try {
      let ultimo = null;
      for (const f of archivos.slice(0, 6)) {
        ultimo = (await api.subirImagen(client.id, f, { carpetaId: !["todas", "favoritas", "subidas", "sin-carpeta"].includes(filtro) ? filtro : null })).archivo;
        if (limiteRefs) setForm((fm) => (fm.referencias.length < limiteRefs ? { ...fm, referencias: [...fm.referencias, ultimo] } : fm));
      }
      setAviso({ ok: true, texto: archivos.length === 1 ? "Imagen subida a la galería." : `${Math.min(archivos.length, 6)} imágenes subidas.` });
      await cargar();
    } catch (err) {
      setAviso({ ok: false, texto: err.message });
    } finally {
      setSubiendo(false);
    }
  };

  // ---------- La galería ----------
  const accion = async (hacer, exito) => {
    try {
      await hacer();
      if (exito) setAviso({ ok: true, texto: exito });
      await cargar();
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    }
  };
  const alternarFavorito = (a) => accion(async () => {
    const { archivo } = await api.cambiarArchivo(client.id, a.id, { favorito: !a.favorito });
    setVisor((v) => (v?.id === a.id ? archivo : v));
  });
  const aPapelera = (a) => accion(async () => { await api.mandarAPapelera(client.id, a.id); setVisor(null); }, "Movida a la papelera. Puedes recuperarla 30 días.");
  const recuperar = (a) => accion(() => api.recuperarArchivo(client.id, a.id), "Recuperada.");
  const moverA = (a, carpetaId) => accion(async () => {
    const { archivo } = await api.cambiarArchivo(client.id, a.id, { carpetaId: carpetaId || null });
    setVisor((v) => (v?.id === a.id ? archivo : v));
  });
  const borrarDeVerdad = async (a, forzar = false) => {
    try {
      await api.borrarDelTodo(client.id, a.id, { forzar });
      setBorrando(null);
      setAviso({ ok: true, texto: "Borrada del todo." });
      await cargar();
    } catch (e) {
      if (e.datos?.codigo === "en_uso") setBorrando({ id: a.id, usos: e.datos.usos });
      else setAviso({ ok: false, texto: e.message });
    }
  };
  const vaciar = () => accion(async () => {
    const r = await api.vaciarPapelera(client.id);
    setAviso({ ok: true, texto: r.borrados ? `${r.borrados} borrada${r.borrados === 1 ? "" : "s"} del todo.` : "No había nada que borrar (lo que usa una publicación se queda)." });
  });
  const repetir = (a, conReferencia = false) => {
    const m = modeloPorId(a.modelo);
    const usable = m && motorActivo(m);
    const destino = usable ? m : modelo;
    setConfirmando(null);
    setForm({
      modelo: destino.id, prompt: a.prompt, n: 1,
      ajustes: normalizarAjustes(destino, a.ajustes),
      referencias: conReferencia && destino.referencias ? [a] : [],
    });
    setVisor(null);
    setEnPapelera(false);
    setAviso(usable || !m ? null : { ok: false, texto: `${m.nombre} no está disponible en este servidor: se usó ${destino.nombre}.` });
    promptRef.current?.focus();
    promptRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  // ---------- Carpetas ----------
  const crearCarpeta = async (e) => {
    e.preventDefault();
    if (!carpetaNueva?.trim()) return;
    try {
      const { carpeta } = await api.crearCarpeta(client.id, carpetaNueva);
      setCarpetaNueva(null);
      setFiltro(carpeta.id);
      await cargar();
    } catch (err) {
      setAviso({ ok: false, texto: err.message });
    }
  };
  const guardarNombre = async (e) => {
    e.preventDefault();
    try {
      await api.renombrarCarpeta(client.id, renombrando.id, renombrando.nombre);
      setRenombrando(null);
      await cargar();
    } catch (err) {
      setAviso({ ok: false, texto: err.message });
    }
  };
  const quitarCarpeta = (c) => accion(async () => { await api.borrarCarpeta(client.id, c.id); setFiltro("todas"); }, `Carpeta «${c.nombre}» quitada. Sus imágenes siguen en la galería.`);

  // ---------- Derivados ----------
  const archivos = useMemo(() => datos?.archivos ?? [], [datos]);
  const carpetas = useMemo(() => datos?.carpetas ?? [], [datos]);
  const papelera = datos?.papelera ?? [];
  const cuentas = useMemo(() => contarFiltros(archivos, carpetas), [archivos, carpetas]);
  const visibles = useMemo(() => filtrarArchivos(archivos, { filtro, texto }), [archivos, filtro, texto]);
  const enCurso = useMemo(() => trabajosVisibles(datos?.trabajos ?? [], { descartados }), [datos, descartados]);
  const carpetaActiva = carpetas.find((c) => c.id === filtro) ?? null;
  const soloPrueba = motores && !Object.entries(motores).some(([id, m]) => id !== "prueba" && m.activo);

  if (cargando) return <p role="status" className="est-nota">Cargando el Estudio…</p>;
  if (error && !datos) return <div className="est-error" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary btn-sm" onClick={cargar}>Reintentar</button></div>;

  return (
    <section className="estudio" aria-labelledby={`${ids}-h`}>
      <header className="est-cabecera">
        <h2 id={`${ids}-h`} className="est-titulo">Estudio</h2>
        <p className="est-sub">Crea imágenes para {client.name}. Cada una queda aquí, con su prompt y lo que costó.</p>
      </header>

      <div className="est-aviso-region" role="status" aria-live="polite">
        {aviso && (
          <p className={aviso.ok ? "est-aviso" : "est-aviso est-aviso-mal"}>
            {aviso.texto}
            <button type="button" className="btn-icon est-cerrar" aria-label="Cerrar el aviso" onClick={() => setAviso(null)}><Icon name="close" size={16} /></button>
          </p>
        )}
      </div>

      {soloPrueba && (
        <p className="est-aviso est-aviso-info">
          Ahora mismo sólo está activo el motor de <strong>prueba</strong> (gratis): saca una tarjeta con tu texto, no una imagen real.
          Para imágenes de verdad, el administrador tiene que poner la llave <code>GOOGLE_AI_KEY</code> como secreto del Worker.
        </p>
      )}

      {/* ---------- Pedir ---------- */}
      {!lectura && modelo && (
        <form className="card est-compositor" onSubmit={(e) => { e.preventDefault(); enviar(false); }}>
          <div className="field">
            <label className="label" htmlFor={`${ids}-p`}>¿Qué quieres crear?</label>
            <textarea
              id={`${ids}-p`} ref={promptRef} className="input est-prompt-campo" rows={4} maxLength={MAX_PROMPT}
              placeholder="Una taza de café humeante sobre una mesa de madera, luz de la mañana, estilo fotografía de producto…"
              value={form.prompt}
              onChange={(e) => { setConfirmando(null); setForm({ ...form, prompt: e.target.value }); }}
            />
            <p className="hint">Sin texto dentro de la imagen, salvo que lo pidas. {form.prompt.length > 3500 ? `${form.prompt.length} de ${MAX_PROMPT} caracteres.` : ""}</p>
          </div>

          <div className="est-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-m`}>Modelo</label>
              <select id={`${ids}-m`} className="input" value={form.modelo} onChange={(e) => cambiarModelo(e.target.value)}>
                {MODELOS_DE_IMAGEN.map((m) => (
                  <option key={m.id} value={m.id} disabled={!motorActivo(m)}>
                    {m.nombre} · {textoCosto(m.costo)}{motorActivo(m) ? "" : " · sin llave"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-f`}>Formato</label>
              <select id={`${ids}-f`} className="input" value={form.ajustes.aspectRatio} onChange={(e) => setForm({ ...form, ajustes: { ...form.ajustes, aspectRatio: e.target.value } })}>
                {modelo.ajustes.aspectRatio.valores.map((v) => <option key={v} value={v}>{NOMBRE_PROPORCION[v] ?? v} ({v})</option>)}
              </select>
            </div>
            {modelo.ajustes.imageSize && (
              <div className="field">
                <label className="label" htmlFor={`${ids}-t`}>Tamaño</label>
                <select id={`${ids}-t`} className="input" value={form.ajustes.imageSize} onChange={(e) => setForm({ ...form, ajustes: { ...form.ajustes, imageSize: e.target.value } })}>
                  {modelo.ajustes.imageSize.valores.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor={`${ids}-n`}>Cuántas</label>
              <select id={`${ids}-n`} className="input" value={form.n} onChange={(e) => { setConfirmando(null); setForm({ ...form, n: Number(e.target.value) }); }}>
                {CANTIDADES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <p className="hint est-modelo-nota">{modelo.nota}</p>

          {/* Referencias */}
          <div className="field">
            <span className="label" id={`${ids}-r`}>Imágenes de referencia</span>
            {limiteRefs === 0 ? (
              <p className="hint">{modelo.nombre} no admite referencias.</p>
            ) : (
              <div className="est-refs" role="group" aria-labelledby={`${ids}-r`}>
                {form.referencias.map((r) => (
                  <span key={r.id} className="est-ref">
                    <img src={r.src} alt="" />
                    <span className="est-ref-nombre">{r.prompt || "Imagen"}</span>
                    <button type="button" className="btn-icon est-ref-quitar" aria-label={`Quitar la referencia: ${r.prompt || "imagen"}`} onClick={() => alternarReferencia(r)}><Icon name="close" size={14} /></button>
                  </span>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" disabled={subiendo || form.referencias.length >= limiteRefs} onClick={() => entradaArchivo.current?.click()}>
                  <Icon name="upload" size={16} /> {subiendo ? "Subiendo…" : "Subir una imagen"}
                </button>
                <input ref={entradaArchivo} type="file" accept="image/png,image/jpeg,image/webp" multiple className="est-archivo" tabIndex={-1} aria-hidden="true" onChange={subir} />
                <span className="hint">{form.referencias.length} de {limiteRefs}. También puedes usar cualquiera de la galería con «Usar de referencia».</span>
              </div>
            )}
          </div>

          <div className="est-pie-compositor">
            <p className="est-costo">
              Costo: <strong>{textoCosto(costo)}</strong>{modelo.estimado && costo > 0 ? " · precio aproximado" : ""}
            </p>
            {confirmando != null ? (
              <div className="est-confirmar" role="alert">
                <span>Este pedido cuesta <strong>{textoCosto(confirmando)}</strong>. ¿Seguimos?</span>
                <button type="button" className="btn btn-primary" disabled={enviando} onClick={() => enviar(true)}>Sí, crear</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(null)}>No</button>
              </div>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={enviando || !motorActivo(modelo)}>
                <Icon name="sparkles" size={18} /> {enviando ? "Pidiendo…" : `Crear ${form.n > 1 ? `${form.n} imágenes` : "imagen"}`}
              </button>
            )}
          </div>
        </form>
      )}

      {/* ---------- En curso ---------- */}
      {enCurso.length > 0 && (
        <ul className="est-trabajos" aria-label="Pedidos en curso">
          {enCurso.map((t) => (
            <li key={t.id} className={`est-trabajo est-trabajo-${t.estado}`}>
              <div className="est-trabajo-texto">
                <p className="est-trabajo-prompt">{t.prompt}</p>
                <p className="est-trabajo-estado">
                  {nombreDeModelo(t.modelo)} · {fraseDeTrabajo(t)}
                </p>
                {estaVivo(t.estado) && t.n > 1 && (
                  <progress className="est-progreso" max={t.n} value={t.archivos?.length ?? 0} aria-label={`${t.archivos?.length ?? 0} de ${t.n} imágenes`} />
                )}
              </div>
              {!lectura && (
                <div className="est-trabajo-acciones">
                  {estaVivo(t.estado) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => accion(() => api.cancelarTrabajo(client.id, t.id))}>Cancelar</button>}
                  {(t.estado === "fallido" || t.estado === "cancelado") && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => accion(async () => { await api.reintentarTrabajo(client.id, t.id); seguir(t.id); })}>Reintentar</button>
                  )}
                  {!estaVivo(t.estado) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDescartados((s) => new Set(s).add(t.id))}>Descartar</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Galería ---------- */}
      <div className="est-galeria-cabecera">
        <h3 className="est-subtitulo">{enPapelera ? "Papelera" : "Galería"}</h3>
        <div className="est-filtros" role="group" aria-label="Filtrar la galería">
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && filtro === "todas"} onClick={() => { setEnPapelera(false); setFiltro("todas"); }}>Todas ({cuentas.todas})</button>
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && filtro === "favoritas"} onClick={() => { setEnPapelera(false); setFiltro("favoritas"); }}>Favoritas ({cuentas.favoritas})</button>
          <button type="button" className="filter-chip" aria-pressed={!enPapelera && filtro === "subidas"} onClick={() => { setEnPapelera(false); setFiltro("subidas"); }}>Subidas ({cuentas.subidas})</button>
          {carpetas.map((c) => (
            <button key={c.id} type="button" className="filter-chip" aria-pressed={!enPapelera && filtro === c.id} onClick={() => { setEnPapelera(false); setFiltro(c.id); }}>
              <Icon name="folder" size={13} /> {c.nombre} ({cuentas[c.id] ?? 0})
            </button>
          ))}
          {!lectura && carpetaNueva === null && (
            <button type="button" className="filter-chip est-chip-nueva" onClick={() => setCarpetaNueva("")}><Icon name="plus" size={13} /> Carpeta</button>
          )}
          <button type="button" className="filter-chip" aria-pressed={enPapelera} onClick={() => setEnPapelera(true)}><Icon name="trash" size={13} /> Papelera ({papelera.length})</button>
        </div>
        {carpetaNueva !== null && (
          <form className="est-carpeta-form" onSubmit={crearCarpeta}>
            <label className="est-solo-lector" htmlFor={`${ids}-cn`}>Nombre de la carpeta</label>
            <input id={`${ids}-cn`} className="input" value={carpetaNueva} maxLength={40} autoFocus placeholder="Nombre de la carpeta" onChange={(e) => setCarpetaNueva(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!carpetaNueva.trim()}>Crear</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCarpetaNueva(null)}>Cancelar</button>
          </form>
        )}
        {!enPapelera && carpetaActiva && !lectura && (
          renombrando ? (
            <form className="est-carpeta-form" onSubmit={guardarNombre}>
              <label className="est-solo-lector" htmlFor={`${ids}-rn`}>Nuevo nombre</label>
              <input id={`${ids}-rn`} className="input" value={renombrando.nombre} maxLength={40} autoFocus onChange={(e) => setRenombrando({ ...renombrando, nombre: e.target.value })} />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!renombrando.nombre.trim()}>Guardar</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenombrando(null)}>Cancelar</button>
            </form>
          ) : (
            <div className="est-carpeta-acciones">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenombrando({ id: carpetaActiva.id, nombre: carpetaActiva.nombre })}><Icon name="pencil" size={14} /> Renombrar «{carpetaActiva.nombre}»</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitarCarpeta(carpetaActiva)}><Icon name="trash" size={14} /> Quitar la carpeta</button>
            </div>
          )
        )}
        {!enPapelera && archivos.length > 6 && (
          <div className="est-buscar">
            <label className="est-solo-lector" htmlFor={`${ids}-b`}>Buscar en la galería</label>
            <input id={`${ids}-b`} type="search" className="input" placeholder="Buscar por lo que pediste…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        )}
      </div>

      {enPapelera ? (
        <>
          {papelera.length > 0 && !lectura && (
            <p className="est-papelera-nota">
              Lo que llevas 30 días aquí se borra solo (menos lo que usa una publicación).{" "}
              <button type="button" className="btn btn-secondary btn-sm" onClick={vaciar}>Vaciar la papelera</button>
            </p>
          )}
          {papelera.length === 0 ? (
            <p className="est-vacio">La papelera está vacía.</p>
          ) : (
            <ul className="est-rejilla">
              {papelera.map((a) => (
                <li key={a.id} className="est-tarjeta est-tarjeta-papelera">
                  <div className="est-img"><img src={a.src} alt={a.prompt} loading="lazy" /></div>
                  <div className="est-pie">
                    <p className="est-prompt">{a.prompt}</p>
                    <p className="est-meta">{textoPapelera(a.borradoAt)}{a.usadoEn.length ? ` · en ${a.usadoEn.length} publicación${a.usadoEn.length === 1 ? "" : "es"}` : ""}</p>
                    {!lectura && (
                      borrando?.id === a.id ? (
                        <div className="est-confirmar-borrar" role="alert">
                          <p>{borrando.usos ? `Está en ${borrando.usos} publicación${borrando.usos === 1 ? "" : "es"}: desaparecerá de ${borrando.usos === 1 ? "ella" : "ellas"}.` : "¿Borrarla del todo?"}</p>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => borrarDeVerdad(a, true)}>Sí, borrar</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBorrando(null)}>No</button>
                        </div>
                      ) : (
                        <div className="est-acciones">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => recuperar(a)}><Icon name="undo" size={14} /> Recuperar</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => borrarDeVerdad(a)}>Borrar del todo</button>
                        </div>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : archivos.length === 0 ? (
        <div className="card est-vacio-grande">
          <h3>Todavía no hay imágenes de {client.name}</h3>
          <p>Escribe qué quieres arriba y pulsa «Crear imagen». Cada una que salga queda aquí, y puedes usarla de referencia para la siguiente.</p>
        </div>
      ) : visibles.length === 0 ? (
        <p className="est-vacio">No hay imágenes con ese filtro.</p>
      ) : (
        <ul className="est-rejilla">
          {visibles.map((a) => (
            <li key={a.id} className="est-tarjeta">
              <button type="button" className="est-img" aria-label={`Abrir: ${a.prompt}`} onClick={() => setVisor(a)}>
                <img src={a.src} alt={a.prompt} loading="lazy" />
                {esReferencia(a) && <span className="est-marca-ref">Referencia</span>}
              </button>
              <div className="est-pie">
                <p className="est-prompt">{a.prompt}</p>
                <p className="est-meta">{a.subido ? "Subida" : nombreDeModelo(a.modelo)}{a.costo > 0 ? ` · ${textoCosto(a.costo)}` : ""} · {hace(a.creado)}</p>
                <div className="est-acciones">
                  {!lectura && (
                    <>
                      <button type="button" className="btn-icon" aria-pressed={a.favorito} aria-label={a.favorito ? "Quitar de favoritas" : "Marcar como favorita"} onClick={() => alternarFavorito(a)}>
                        <Icon name="star" size={18} />
                      </button>
                      <button type="button" className="btn-icon" aria-pressed={esReferencia(a)} aria-label={esReferencia(a) ? "Quitar de las referencias" : "Usar de referencia"} onClick={() => (esReferencia(a) ? alternarReferencia(a) : usarDeReferencia(a))}>
                        <Icon name="paperclip" size={18} />
                      </button>
                    </>
                  )}
                  <a className="btn-icon" href={a.src} download={nombreDeDescarga(a)} aria-label="Descargar"><Icon name="download" size={18} /></a>
                  {!lectura && (
                    <button type="button" className="btn-icon" aria-label="Mandar a la papelera" onClick={() => aPapelera(a)}><Icon name="trash" size={18} /></button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="est-precios">Los precios son aproximados y de {new Date(PRECIOS_AL).toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" })}. Lo que se gasta aquí suma al presupuesto de IA del mes.</p>

      {visor && (
        <Visor
          archivo={visor} carpetas={carpetas} lectura={lectura}
          onCerrar={() => setVisor(null)}
          onFavorito={() => alternarFavorito(visor)}
          onPapelera={() => aPapelera(visor)}
          onMover={(c) => moverA(visor, c)}
          onRepetir={() => repetir(visor)}
          onVariar={() => repetir(visor, true)}
          onReferencia={() => { usarDeReferencia(visor); setVisor(null); }}
          motorActivo={(m) => motorActivo(m)}
        />
      )}
    </section>
  );
}

/** La imagen grande y todo lo que se sabe de ella. */
function Visor({ archivo: a, carpetas, lectura, onCerrar, onFavorito, onPapelera, onMover, onRepetir, onVariar, onReferencia }) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const m = modeloPorId(a.modelo);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog est-visor" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="est-visor-imagen"><img src={a.src} alt={a.prompt} /></div>
        <div className="est-visor-panel">
          <div className="est-visor-cabecera">
            <h3 id={`${id}-t`}>{a.subido ? "Imagen subida" : "Imagen creada"}</h3>
            <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
          </div>
          <p className="est-visor-prompt">{a.prompt}</p>
          <dl className="est-detalles">
            <div><dt>Modelo</dt><dd>{a.subido ? "Subida a mano" : m?.nombre ?? a.modelo ?? "Aplicación"}</dd></div>
            {a.ajustes?.aspectRatio && <div><dt>Formato</dt><dd>{NOMBRE_PROPORCION[a.ajustes.aspectRatio] ?? a.ajustes.aspectRatio} ({a.ajustes.aspectRatio})</dd></div>}
            {a.ancho > 0 && <div><dt>Tamaño</dt><dd>{a.ancho}×{a.alto}</dd></div>}
            {a.costo > 0 && <div><dt>Costo</dt><dd>{textoCosto(a.costo)}{m?.estimado ? " (aprox.)" : ""}</dd></div>}
            <div><dt>Creada</dt><dd>{hace(a.creado)}</dd></div>
            {a.usadoEn.length > 0 && <div><dt>En uso</dt><dd>{a.usadoEn.length} publicación{a.usadoEn.length === 1 ? "" : "es"}</dd></div>}
          </dl>
          {!lectura && (
            <div className="field">
              <label className="label" htmlFor={`${id}-c`}>Carpeta</label>
              <select id={`${id}-c`} className="input" value={a.carpetaId ?? ""} onChange={(e) => onMover(e.target.value)}>
                <option value="">Sin carpeta</option>
                {carpetas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="est-visor-acciones">
            {!lectura && !a.subido && <button type="button" className="btn btn-primary" onClick={onRepetir}><Icon name="refresh" size={16} /> Repetir</button>}
            {!lectura && !a.subido && <button type="button" className="btn btn-secondary" onClick={onVariar}><Icon name="sparkles" size={16} /> Variar</button>}
            {!lectura && <button type="button" className="btn btn-secondary" onClick={onReferencia}><Icon name="paperclip" size={16} /> Usar de referencia</button>}
            {!lectura && <button type="button" className="btn btn-secondary" aria-pressed={a.favorito} onClick={onFavorito}><Icon name="star" size={16} /> {a.favorito ? "Es favorita" : "Favorita"}</button>}
            <a className="btn btn-secondary" href={a.src} download={nombreDeDescarga(a)}><Icon name="download" size={16} /> Descargar</a>
            {!lectura && <button type="button" className="btn btn-ghost" onClick={onPapelera}><Icon name="trash" size={16} /> A la papelera</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
