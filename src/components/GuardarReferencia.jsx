import { useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { uid } from "../utils";
import { enlaceLimpio, plataformaDe, formatoPorEnlace, nuevaIdea, PLATAFORMAS } from "../lib/bancoIdeas";
import { anadirAlBanco } from "../lib/bancoIdeasApi";
import { yoActual } from "../lib/sesionActual";
import { FORMATS } from "../constants";
import "./GuardarReferencia.css";

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
// ============================================================

export default function GuardarReferencia({ clientes = [], clienteInicial = null, textoInicial = "", notaInicial = "", onClose, onGuardado }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  // Un colaborador no puede guardar sin empresa (la capa no le enseña las generales).
  const colaborador = Array.isArray(yoActual()?.clientes);
  const [texto, setTexto] = useState(textoInicial);
  const [clienteId, setClienteId] = useState(clienteInicial || (colaborador ? clientes[0]?.id ?? "" : ""));
  const [nota, setNota] = useState(notaInicial);
  const [formato, setFormato] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

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

  const guardar = async (e) => {
    e?.preventDefault();
    if (!enlace) { setError("Pega el enlace del video (empieza por https://)."); return; }
    setGuardando(true);
    setError("");
    try {
      const idea = nuevaIdea({ id: uid(), idea: nota.trim(), format: formatoFinal, referenceLink: enlace });
      await anadirAlBanco(idea, clienteId || null);
      const nombre = clientes.find((c) => c.id === clienteId)?.name;
      onGuardado?.(nombre ? `Referencia guardada en el banco de ${nombre}.` : "Referencia guardada como general: sale en el banco de todos los clientes.");
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
      setGuardando(false);
    }
  };

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

        <label className="label" htmlFor={`${ids}-enlace`}>Enlace del video</label>
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
          <button type="submit" className="btn btn-primary" disabled={guardando || !enlace}>
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
