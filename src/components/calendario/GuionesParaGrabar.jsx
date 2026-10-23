import { useId, useMemo, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import SelectorFecha from "../SelectorFecha";
import { fmtDate } from "../../utils";
import { ugcParaGrabar, textoParaGrabar, duracionUgc } from "../../lib/ugc";
import "./GuionUgc.css";

// ============================================================
// «Guiones para grabar»: todos los UGC de una sesión en un solo mensaje
//
// La agencia organiza con quien graba 4, 6 u 8 videos el mismo día y le
// manda los guiones la víspera. Aquí salen los UGC del mes que todavía no
// tienen video (lib/ugc.js, `ugcParaGrabar`), en orden de fecha; se marcan
// los de la sesión, se ordenan y se copian o comparten de una vez
// (`textoParaGrabar`: la sesión, y cada video con lo que se dice y sus
// tomas). Al mandarlos pasan a «En producción» (la etapa del tablero) y no
// se vuelven a ofrecer, salvo con «Enseñar los ya enviados».
// ============================================================

const manana = () => { const d = new Date(); d.setDate(d.getDate() + 1); return fmtDate(d); };

/** «jueves 30 oct» de una fecha AAAA-MM-DD. */
function textoDeFecha(f) {
  const [a, m, d] = String(f ?? "").split("-").map(Number);
  if (!a || !m || !d) return "";
  return new Date(a, m - 1, d).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "short" }).replace(/\./g, "").replace(",", "");
}

export default function GuionesParaGrabar({ client, cal, onAplicar, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  const [conEnviados, setConEnviados] = useState(false);
  const todas = useMemo(() => ugcParaGrabar(cal?.days ?? [], { conEnviados: true }), [cal]);
  // Lo que se acaba de mandar sigue a la vista (marcado «ya enviado»): si desapareciera, no se vería qué se copió.
  const [recien, setRecien] = useState(() => new Set());
  const lista = conEnviados ? todas : todas.filter((x) => !x.enviado || recien.has(x.id));
  // El orden de la sesión (ids) y cuáles van: al abrir, todos los que tienen guion y no se mandaron.
  const [orden, setOrden] = useState(() => todas.map((x) => x.id));
  const [elegidas, setElegidas] = useState(() => new Set(todas.filter((x) => !x.enviado && !x.sinGuion).map((x) => x.id)));
  const [fecha, setFecha] = useState(manana);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const porId = new Map(todas.map((x) => [x.id, x]));
  const ordenadas = orden.map((id) => porId.get(id)).filter((x) => x && lista.includes(x));
  const van = ordenadas.filter((x) => elegidas.has(x.id) && !x.sinGuion);
  const texto = textoParaGrabar({ cliente: client?.name ?? "", cuando: textoDeFecha(fecha), piezas: van.map((x) => x.post) });

  const alternar = (id) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const mover = (id, paso) => setOrden((o) => {
    // Se mueve entre las que se ven, saltando las ocultas.
    const visibles = o.filter((x) => ordenadas.some((y) => y.id === x));
    const i = visibles.indexOf(id);
    const j = i + paso;
    if (i < 0 || j < 0 || j >= visibles.length) return o;
    const otra = visibles[j];
    return o.map((x) => (x === id ? otra : x === otra ? id : x));
  });

  // Al mandarlos, a «En producción»: así no se vuelven a ofrecer (y el tablero dice que se están grabando).
  const marcarEnviados = () => {
    const envio = new Set(van.map((x) => x.id));
    setRecien((r) => new Set([...r, ...envio]));
    onAplicar((days) => days.map((d) => ({
      ...d,
      posts: (d.posts ?? []).map((p) => (envio.has(p.id) && !["programada", "publicada"].includes(p.etapa) ? { ...p, etapa: "produccion" } : p)),
    })));
  };

  const copiar = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(texto);
      marcarEnviados();
      setAviso(`Copiado: ${van.length} ${van.length === 1 ? "guion" : "guiones"}. Pégalo en el chat de quien graba. Pasaron a «En producción».`);
    } catch {
      setError("No se pudo copiar. Selecciona el texto de abajo y cópialo a mano.");
    }
  };

  const compartir = async () => {
    setError("");
    try {
      await navigator.share({ title: `Grabación ${client?.name ?? ""}`.trim(), text: texto });
      marcarEnviados();
      setAviso(`Compartido: ${van.length} ${van.length === 1 ? "guion" : "guiones"}. Pasaron a «En producción».`);
    } catch (e) {
      // Cerrar la hoja de compartir no es un error, y entonces no se mandó nada.
      if (e?.name !== "AbortError") setError("No se pudo compartir desde este navegador. Usa «Copiar todo».");
    }
  };
  const puedeCompartir = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const enviados = todas.filter((x) => x.enviado).length;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="dialog extraer-ugc" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-2)" }}>
          <h2 id={`${ids}-t`} style={{ margin: 0 }}><Icon name="video" size={18} /> Guiones para grabar</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <p className="hint" style={{ margin: "var(--sp-2) 0 var(--sp-3)" }}>
          Los UGC de este mes que todavía no tienen video. Marca los de la sesión, ordénalos y mándalos todos en un solo
          mensaje: al copiarlos o compartirlos pasan a «En producción».
        </p>

        <div className="grabar-cabeza">
          <div className="field">
            <span className="label">Día de la grabación</span>
            <SelectorFecha value={fecha} onChange={(f) => setFecha(f || "")} etiqueta="Día de la grabación" vacio="Sin día" prefijo="Grabación:" />
          </div>
          {enviados > 0 && (
            <label className="grabar-enviados">
              <input type="checkbox" checked={conEnviados} onChange={(e) => setConEnviados(e.target.checked)} />
              Enseñar los ya enviados ({enviados})
            </label>
          )}
        </div>

        {!lista.length ? (
          <p className="hint">
            {todas.length ? "Todos los UGC de este mes ya se mandaron a grabar." : "Este mes no tiene UGC sin video. Un UGC es un reel marcado «UGC · guion para grabar» en su panel."}
          </p>
        ) : (
          <ol className="grabar-lista" aria-label="Los UGC de la sesión, en orden">
            {ordenadas.map((x, i) => {
              const p = x.post;
              const id = `${ids}-c${x.id}`;
              return (
                <li key={x.id} className={`grabar-item${elegidas.has(x.id) && !x.sinGuion ? " is-va" : ""}`}>
                  <input id={id} type="checkbox" checked={elegidas.has(x.id) && !x.sinGuion} disabled={x.sinGuion} onChange={() => alternar(x.id)} />
                  <label htmlFor={id} className="grabar-item-texto">
                    <strong>{p.title || p.idea || "Sin título"}</strong>
                    <span className="hint">
                      {textoDeFecha(x.fecha)}{p.duracionUgc ? ` · ${duracionUgc(p.duracionUgc)} s` : ""}{x.enviado ? " · ya enviado" : ""}
                      {x.sinGuion ? " · sin guion: escríbelo primero en su panel" : ""}
                    </span>
                  </label>
                  <span className="grabar-item-mover">
                    <button type="button" className="btn-icon" aria-label={`Subir «${p.title || "este"}»`} disabled={i === 0} onClick={() => mover(x.id, -1)}><Icon name="arrowUp" size={16} /></button>
                    <button type="button" className="btn-icon" aria-label={`Bajar «${p.title || "este"}»`} disabled={i === ordenadas.length - 1} onClick={() => mover(x.id, 1)}><Icon name="arrowDown" size={16} /></button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {van.length > 0 && (
          <>
            <label className="label" htmlFor={`${ids}-txt`} style={{ marginTop: "var(--sp-3)", display: "block" }}>El mensaje ({van.length} {van.length === 1 ? "video" : "videos"})</label>
            <textarea id={`${ids}-txt`} className="textarea grabar-texto" readOnly value={texto} rows={10} />
            <div className="extraer-ugc-acciones" style={{ marginTop: "var(--sp-3)" }}>
              {puedeCompartir && (
                <button type="button" className="btn btn-secondary" onClick={compartir}><Icon name="send" size={16} /> Compartir</button>
              )}
              <button type="button" className="btn btn-primary" onClick={copiar}><Icon name="copy" size={16} /> Copiar todo</button>
            </div>
          </>
        )}

        <div role="status" aria-live="polite" className={aviso ? "hint" : "sr-only"}>{aviso}</div>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
      </div>
    </div>
  );
}
