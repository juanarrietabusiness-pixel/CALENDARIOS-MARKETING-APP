import { lazy, Suspense, useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { uid } from "../utils";
import { enlaceLimpio, plataformaDe, formatoPorEnlace, nuevaIdea, PLATAFORMAS } from "../lib/bancoIdeas";
import { anadirAlBanco } from "../lib/bancoIdeasApi";
import { yoActual } from "../lib/sesionActual";
import { FORMATS } from "../constants";
import "./GuardarReferencia.css";

// «Extraer guion y adaptar» de lo que se guardó: sólo se descarga al abrirlo.
const ExtraerUgc = lazy(() => import("./calendario/ExtraerUgc"));
const CACHE_COMPARTIDO = "compartido";

/** Los archivos que dejó el service worker de «Compartir» (public/sw.js) en su caché. */
async function leerCompartidos({ id, n }) {
  const cache = await caches.open(CACHE_COMPARTIDO);
  const lista = [];
  for (let i = 0; i < n; i++) {
    const r = await cache.match(`/compartido/${id}/${i}`);
    if (!r) continue;
    const tipo = r.headers.get("content-type") || "application/octet-stream";
    const nombre = decodeURIComponent(r.headers.get("x-nombre") || `archivo-${i + 1}`);
    lista.push(new File([await r.blob()], nombre, { type: tipo }));
  }
  return lista;
}
async function olvidarCompartidos({ id, n }) {
  try {
    const cache = await caches.open(CACHE_COMPARTIDO);
    for (let i = 0; i < n; i++) await cache.delete(`/compartido/${id}/${i}`);
  } catch { /* sin caché: nada que borrar */ }
}
const megas = (b) => `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

// ============================================================
// «Guardar referencia»: el enlace de un video bueno, en dos toques
//
// Desde la cabecera, la barra del móvil, el banco de ideas o donde sea: se
// pega el enlace, se escoge la empresa (o ninguna: queda GENERAL y sale en
// el banco de todos los clientes hasta que se le asigne una) y, si se quiere,
// una nota de qué tiene de bueno. Va al banco de ideas único.
//
// También se abre desde «Compartir» de Instagram o TikTok (/compartir, ya
// relleno): en Android instalando la aplicación (el manifiesto la pone en la
// hoja de compartir) y en el iPhone con un Atajo que abre esa dirección.
//
// En Android llega además el ARCHIVO (el video guardado del teléfono): lo
// recibe el service worker y aquí se sube a la galería de la empresa que se
// escoja. Con un enlace de Instagram sin archivo, «Traer el video de
// Instagram» lo baja por la API (business_discovery: hace falta el @ de la
// cuenta si el enlace no lo dice, y que sea de empresa o creador). Si se
// guardó un video, se ofrece «Extraer guion y adaptar» (UGC).
// ============================================================

export default function GuardarReferencia({ clientes = [], clienteInicial = null, textoInicial = "", notaInicial = "", archivosCompartidos = null, sinArchivos = false, onClose, onGuardado }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  // Un colaborador no puede guardar sin empresa (la capa no le enseña las generales).
  const colaborador = Array.isArray(yoActual()?.clientes);
  const [texto, setTexto] = useState(textoInicial);
  const [clienteId, setClienteId] = useState(clienteInicial || (colaborador ? clientes[0]?.id ?? "" : ""));
  const [nota, setNota] = useState(notaInicial);
  const [formato, setFormato] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(sinArchivos ? "El archivo compartido no llegó: guarda el enlace, o sube el video desde la galería." : "");
  // Lo que llegó por «Compartir» (File) y lo que se trajo de Instagram (ya en la galería).
  const [archivos, setArchivos] = useState([]);
  const [traidos, setTraidos] = useState([]);
  const [trayendo, setTrayendo] = useState(false);
  const [preguntaUsuario, setPreguntaUsuario] = useState(false);
  const [usuarioIg, setUsuarioIg] = useState("");
  // Guardado con un video: se ofrece extraer su guion. { video } | null; `extrayendo` abre el diálogo.
  const [hecho, setHecho] = useState(null);
  const [extrayendo, setExtrayendo] = useState(false);

  useEffect(() => {
    if (!archivosCompartidos || typeof caches === "undefined") return;
    leerCompartidos(archivosCompartidos).then(setArchivos).catch(() => setError("No se pudo leer el archivo compartido."));
  }, [archivosCompartidos]);

  const enlace = enlaceLimpio(texto);
  const red = enlace ? PLATAFORMAS[plataformaDe(enlace)] : null;
  const formatoFinal = formato || (enlace ? formatoPorEnlace(enlace) : "post");
  const puedePegar = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  const pegar = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setTexto(t);
      if (t && !enlaceLimpio(t)) setError("Lo que hay copiado no es un enlace.");
      else setError("");
    } catch {
      setError("El navegador no dejó leer lo copiado: pégalo en el campo (mantén pulsado y «Pegar»).");
    }
  };

  const conArchivo = archivos.length > 0 || traidos.length > 0;
  const deInstagram = Boolean(enlace) && plataformaDe(enlace) === "instagram";

  /** «Traer el video de Instagram»: por la API, a la galería de la empresa. Sin @ en el enlace, lo pregunta. */
  const traer = async () => {
    if (!clienteId) { setError("Escoge primero la empresa: el video va a su galería."); return; }
    setTrayendo(true);
    setError("");
    try {
      // En diferido: el cliente del estudio de mercado sólo se baja si se trae algo.
      const { traerEnlaceDeInstagram } = await import("../lib/mercado");
      const r = await traerEnlaceDeInstagram(clienteId, enlace, usuarioIg);
      setTraidos([r.archivo]);
      setPreguntaUsuario(false);
      if (!nota.trim() && r.publicacion?.texto) setNota(`@${r.usuario}: ${r.publicacion.texto.slice(0, 200)}`);
    } catch (err) {
      if (err?.datos?.codigo === "usuario") setPreguntaUsuario(true);
      setError(err.message);
    }
    setTrayendo(false);
  };

  const guardar = async (e) => {
    e?.preventDefault();
    if (!enlace && !conArchivo) { setError("Pega el enlace del video (empieza por https://)."); return; }
    if (archivos.length && !clienteId) { setError("Escoge la empresa: el archivo va a su galería."); return; }
    setGuardando(true);
    setError("");
    try {
      const subidos = [];
      // En diferido: lib/estudio.js arrastra el catálogo de modelos; sólo hace falta si llegó un archivo.
      const { subirImagen } = archivos.length ? await import("../lib/estudio") : {};
      for (const f of archivos) subidos.push((await subirImagen(clienteId, f)).archivo);
      const todos = [...subidos, ...traidos];
      const video = todos.find((a) => a.tipo === "video") ?? null;
      const idea = {
        ...nuevaIdea({ id: uid(), idea: nota.trim(), format: video && !formato ? "reel" : formatoFinal, referenceLink: enlace }),
        ...(todos.length ? { archivos: todos.map((a) => ({ id: a.id, src: a.src, tipo: a.tipo })) } : {}),
      };
      await anadirAlBanco(idea, clienteId || null);
      if (archivosCompartidos) await olvidarCompartidos(archivosCompartidos);
      const nombre = clientes.find((c) => c.id === clienteId)?.name;
      const frase = nombre ? `Referencia guardada en el banco de ${nombre}${todos.length ? " (el archivo, en su galería)" : ""}.` : "Referencia guardada como general: sale en el banco de todos los clientes.";
      onGuardado?.(frase);
      if (video && clienteId) { setHecho({ video, frase }); setGuardando(false); return; }
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
      setGuardando(false);
    }
  };

  // Guardado con un video: «Extraer guion y adaptar» o cerrar.
  if (hecho) {
    const cliente = clientes.find((c) => c.id === clienteId);
    return (
      <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={ref} className="dialog guardar-referencia" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
          <div className="guardar-referencia-cabecera">
            <h2 id={`${ids}-t`} style={{ margin: 0 }}><Icon name="check" size={18} /> Guardada</h2>
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={18} /></button>
          </div>
          <p style={{ margin: 0 }}>{hecho.frase}</p>
          <p className="hint">¿Sacas ya el guion de este video para {cliente?.name}? La IA lo transcribe y lo adapta como UGC para grabar.</p>
          <div className="guardar-referencia-botones">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Listo</button>
            <button type="button" className="btn btn-primary" onClick={() => setExtrayendo(true)}><Icon name="user" size={16} /> Extraer guion y adaptar</button>
          </div>
          {extrayendo && cliente && (
            <Suspense fallback={null}>
              <ExtraerUgc client={cliente} inicial={{ id: hecho.video.id, src: hecho.video.src, nombre: "El video guardado" }} onCerrar={onClose} />
            </Suspense>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      {/* Sin la validación del navegador: lo que se comparte desde el teléfono trae texto delante del enlace
          («Mira este video https://…») y `type="url"` lo rechazaba; el enlace lo saca `enlaceLimpio`. */}
      <form ref={ref} className="dialog guardar-referencia" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} onSubmit={guardar} noValidate>
        <div className="guardar-referencia-cabecera">
          <h2 id={`${ids}-t`} style={{ margin: 0 }}>
            <Icon name="link" size={18} /> Guardar referencia
          </h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={18} />
          </button>
        </div>

        <label className="label" htmlFor={`${ids}-enlace`}>Enlace del video{conArchivo ? " (opcional)" : ""}</label>
        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          <input
            id={`${ids}-enlace`} className="input" type="url" inputMode="url" autoComplete="off" autoFocus
            placeholder="https://www.instagram.com/reel/…" value={texto}
            onChange={(e) => { setTexto(e.target.value); setError(""); }}
            aria-describedby={`${ids}-red`}
          />
          {puedePegar && (
            <button type="button" className="btn btn-secondary" onClick={pegar}>
              <Icon name="clipboardCheck" size={16} /> Pegar
            </button>
          )}
        </div>
        <p id={`${ids}-red`} className="hint" aria-live="polite" style={{ marginTop: "var(--sp-1)" }}>
          {red
            ? <span className="guardar-referencia-red"><Icon name={red.icono} size={12} /> {red.nombre} · {FORMATS[formatoFinal]?.label ?? formatoFinal}</span>
            : "Copia el enlace desde «Compartir» en Instagram, TikTok o YouTube y pégalo aquí."}
        </p>

        {archivos.length > 0 && (
          <p className="guardar-referencia-archivos" role="status">
            <Icon name={archivos.some((f) => f.type.startsWith("video/")) ? "video" : "image"} size={14} />
            {" "}Llegó {archivos.length === 1 ? `«${archivos[0].name}» (${megas(archivos[0].size)})` : `${archivos.length} archivos`}: va a la galería de la empresa que escojas.
          </p>
        )}
        {traidos.length > 0 && (
          <p className="guardar-referencia-archivos" role="status"><Icon name="check" size={14} /> Traído de Instagram: ya está en la galería («Competencia»).</p>
        )}
        {deInstagram && !conArchivo && (
          <div className="guardar-referencia-traer">
            {preguntaUsuario && (
              <>
                <label className="label" htmlFor={`${ids}-ig`}>¿De qué cuenta es? (su @)</label>
                <input id={`${ids}-ig`} className="input" placeholder="@cuenta" value={usuarioIg} onChange={(e) => setUsuarioIg(e.target.value)} autoComplete="off" />
              </>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={traer} disabled={trayendo || (preguntaUsuario && !usuarioIg.trim())}>
              <Icon name="download" size={14} /> {trayendo ? "Trayendo…" : "Traer el video de Instagram"}
            </button>
            <p className="hint" style={{ margin: 0 }}>Sólo de cuentas de empresa o de creador, y entre sus últimas 50 publicaciones.</p>
          </div>
        )}

        <label className="label" htmlFor={`${ids}-empresa`} style={{ marginTop: "var(--sp-3)" }}>¿Para qué empresa?</label>
        <select id={`${ids}-empresa`} className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          {!colaborador && <option value="">Ninguna todavía (general)</option>}
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {!colaborador && !clienteId && (
          <p className="hint" style={{ marginTop: "var(--sp-1)" }}>Sale en el banco de todos los clientes hasta que le asignes una.</p>
        )}

        <label className="label" htmlFor={`${ids}-nota`} style={{ marginTop: "var(--sp-3)" }}>Nota (opcional)</label>
        <textarea
          id={`${ids}-nota`} className="textarea" rows={2} value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Qué tiene de bueno: el gancho, la transición, la música…"
        />

        <label className="label" htmlFor={`${ids}-formato`} style={{ marginTop: "var(--sp-3)" }}>Para hacer un…</label>
        <select id={`${ids}-formato`} className="input" value={formatoFinal} onChange={(e) => setFormato(e.target.value)}>
          {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
        </select>

        <DesdeCompartir />

        {error && <p role="alert" className="guardar-referencia-error">{error}</p>}

        <div className="guardar-referencia-botones">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando || (!enlace && !conArchivo)}>
            {guardando ? "Guardando…" : <><Icon name="bookmark" size={16} /> Guardar</>}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Cómo guardar sin abrir la aplicación: desde «Compartir». Android por el manifiesto; iPhone, con un Atajo. */
function DesdeCompartir() {
  const ids = useId();
  const [copiado, setCopiado] = useState(false);
  const direccion = `${window.location.origin}/compartir?texto=`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(direccion);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <details className="guardar-referencia-ayuda">
      <summary>Guardar directo desde «Compartir» de Instagram o TikTok</summary>
      <h3 id={`${ids}-a`}>Android</h3>
      <ol aria-labelledby={`${ids}-a`}>
        <li>Abre esta aplicación en Chrome y toca el menú ⋮ → «Instalar aplicación» (o «Añadir a la pantalla de inicio»).</li>
        <li>En Instagram o TikTok toca «Compartir» → «Juancito Ads». Se abre esta ventana con el enlace puesto.</li>
        <li>¿Ya guardaste el video en el teléfono? Compártelo desde la galería → «Juancito Ads»: llega el archivo y va a la galería de la empresa.</li>
      </ol>
      <h3 id={`${ids}-i`}>iPhone (con un Atajo, una sola vez)</h3>
      <ol aria-labelledby={`${ids}-i`}>
        <li>Abre la app «Atajos» → «+» → «Añadir acción» y busca «Codificar URL».</li>
        <li>Añade debajo «Abrir URL» y escribe la dirección de abajo seguida de la «URL codificada».</li>
        <li>En los detalles del atajo activa «Mostrar en hoja de compartir» y ponle de nombre «Guardar en Juancito».</li>
        <li>En Instagram o TikTok: «Compartir» → «Guardar en Juancito». Safari abre esta ventana con el enlace puesto.</li>
      </ol>
      <div className="guardar-referencia-direccion">
        <code>{direccion}</code>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copiar}>
          <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiada" : "Copiar"}
        </button>
      </div>
    </details>
  );
}
