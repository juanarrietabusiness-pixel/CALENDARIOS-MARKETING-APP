import "./MejorarVideo.css";
import { Suspense, lazy, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { mejorarVideo, seguirEncargo, textosDeGancho } from "../lib/encargosApi";
import { textoDePaso } from "../lib/encargos";
import { MAX_GANCHOS, MAX_MOMENTO, SEGUNDOS_GANCHO, textoDeMejora } from "../lib/mejoraVideo";

const PonerEnPublicacion = lazy(() => import("./PonerEnPublicacion"));

// ============================================================
// «Nuevos ganchos» de un anuncio (lazy): varias versiones de la ENTRADA (o del cierre) del mismo video, para probarlas
// en el mismo conjunto de Meta y quedarse con la que más retiene.
//
//   · Con el momento fuerte (gratis): cada versión abre con el mejor momento del mismo video y un texto de gancho
//     encima, y sigue con el video. Lo hace el Container, sin IA.
//   · Entrada nueva con IA: Seedance 2.5 hace 5 s nuevos que terminan en el cuadro donde sigue el video.
//   · Cierre nuevo con IA: 5 s nuevos que salen del cuadro donde se corta.
// Los textos los puede escribir la IA con las formas de gancho del método («Escribirlos con IA»): no crea nada.
// Lo con IA pregunta el costo antes, siempre. El servidor lo hace aunque se cierre esto.
// ============================================================

const TIPOS = [
  { id: "ganchos", nombre: "Con el momento fuerte", detalle: "Abre con el mejor momento del mismo video y un texto encima. Sin IA: gratis.", para: "texto" },
  { id: "gancho-ia", nombre: "Entrada nueva con IA", detalle: `${SEGUNDOS_GANCHO} s nuevos que terminan donde sigue tu video. No conviene si empieza con alguien hablando a cámara.`, para: "entrada" },
  { id: "cierre-ia", nombre: "Cierre nuevo con IA", detalle: `${SEGUNDOS_GANCHO} s nuevos al final, que terminan en el producto para el llamado.`, para: "cierre" },
];

const redondo = (x) => Math.round(Number(x) * 10) / 10;

export default function NuevosGanchos({ clienteId, archivo, cliente = null, onCerrar, onPoner = null }) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const video = useRef(null);
  const [tipo, setTipo] = useState("ganchos");
  const [textos, setTextos] = useState(["", "", ""]);
  const [formas, setFormas] = useState([]);
  const [momento, setMomento] = useState({ desde: 0, hasta: 2 });
  const [saltar, setSaltar] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [costo, setCosto] = useState(null);
  const [encargo, setEncargo] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [puesto, setPuesto] = useState("");
  const [poniendo, setPoniendo] = useState(null);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const t = TIPOS.find((x) => x.id === tipo);
  const base = archivo?.id ? { archivoId: archivo.id } : { clave: archivo?.clave ?? archivo?.src ?? "" };
  const lista = textos.map((x) => x.trim()).filter(Boolean);
  const cuerpo = () => ({ ...base, modo: tipo, textos: lista, momento, saltar, seguido: true });
  const cambiar = (fn) => (...a) => { setCosto(null); setError(""); fn(...a); };
  const ahora = () => redondo(video.current?.currentTime ?? 0);

  // Al conocer lo que dura, el momento por defecto: los últimos segundos (casi siempre el resultado).
  const alCargar = () => {
    const d = Number(video.current?.duration) || 0;
    if (!d || duracion) return;
    setDuracion(d);
    setMomento({ desde: redondo(Math.max(0, d - 2.5)), hasta: redondo(d) });
  };

  const escribir = async () => {
    setOcupado("textos");
    setError("");
    try {
      const r = await textosDeGancho(clienteId, { ...base, para: t.para, cuantos: MAX_GANCHOS });
      setTextos([...r.textos, "", "", ""].slice(0, MAX_GANCHOS));
      setFormas(r.formas ?? []);
      if (tipo === "ganchos" && r.momento) setMomento({ desde: redondo(r.momento.desde), hasta: redondo(r.momento.hasta) });
      setCosto(null);
    } catch (e) {
      setError(e.message);
    }
    setOcupado("");
  };

  async function seguir(e0) {
    setEncargo(e0);
    const fin = await seguirEncargo({
      clienteId, id: e0.id, seguir: () => vivo.current,
      alCambio: (e, archivos) => {
        if (!vivo.current) return;
        setEncargo(e);
        if (e.estado !== "en_marcha") setResultados((e.mejora?.union?.archivoIds ?? []).map((x) => archivos.get(x)).filter(Boolean));
      },
    });
    return fin;
  }

  const hacer = async (confirmado = false) => {
    if (ocupado) return;
    setOcupado("hacer");
    setError("");
    try {
      const r = await mejorarVideo(clienteId, { ...cuerpo(), ...(confirmado ? { confirmado: true } : {}) });
      if (r?.encargo) await seguir(r.encargo);
    } catch (e) {
      if (e?.estado === 409 && e.datos?.codigo === "confirmar") setCosto({ resumen: e.datos.resumen ?? e.message, aviso: e.datos.aviso ?? null });
      else if (vivo.current) setError(e.message);
    }
    if (vivo.current) setOcupado("");
  };

  const enMarcha = encargo?.estado === "en_marcha";
  const progreso = encargo ? [
    ...encargo.pasos.map((p) => `${p.titulo}: ${p.fase === "hecho" ? "lista" : p.fase === "fallido" ? (p.error || "no salió") : textoDePaso(p) || "en cola"}`),
    textoDeMejora(encargo.mejora),
  ].filter(Boolean) : [];

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div ref={ref} className="dialog mejorar-video" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="mejorar-video-cabecera">
          <h3 id={`${id}-t`}>Nuevos ganchos</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>

        {!encargo && (
          <>
            <p className="hint" style={{ margin: 0 }}>Varias versiones de la entrada del mismo anuncio, para subirlas al mismo conjunto de Meta y quedarte con la que más retiene. El resto del video no cambia.</p>
            {archivo?.src && (
              <video ref={video} className="mejorar-video-vista" src={archivo.src} controls playsInline preload="metadata" onLoadedMetadata={alCargar} aria-label="Tu video" />
            )}
            <fieldset className="mejorar-video-modos">
              <legend className="label">¿Cómo?</legend>
              {TIPOS.map((x) => (
                <label key={x.id} className="mejorar-video-modo" data-elegido={tipo === x.id || undefined}>
                  <input type="radio" name={`${id}-tipo`} checked={tipo === x.id} onChange={cambiar(() => { setTipo(x.id); setFormas([]); })} />
                  <span><strong>{x.nombre}</strong><small>{x.detalle}</small></span>
                </label>
              ))}
            </fieldset>

            {tipo === "ganchos" && (
              <fieldset className="mejorar-video-tiempo">
                <legend className="label">El momento fuerte (hasta {MAX_MOMENTO} s): el resultado, el antes y después</legend>
                <div className="field">
                  <label className="label" htmlFor={`${id}-d`}>Desde (s)</label>
                  <input id={`${id}-d`} className="input" type="number" min="0" step="0.1" value={momento.desde} onChange={(e) => cambiar(setMomento)((m) => ({ ...m, desde: Number(e.target.value) }))} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cambiar(() => setMomento((m) => ({ desde: ahora(), hasta: Math.max(ahora() + 0.5, m.hasta) })))}>Usar el segundo que se ve</button>
                </div>
                <div className="field">
                  <label className="label" htmlFor={`${id}-h`}>Hasta (s)</label>
                  <input id={`${id}-h`} className="input" type="number" min="0" step="0.1" value={momento.hasta} onChange={(e) => cambiar(setMomento)((m) => ({ ...m, hasta: Number(e.target.value) }))} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cambiar(() => setMomento((m) => ({ ...m, hasta: ahora() })))}>Usar el segundo que se ve</button>
                </div>
              </fieldset>
            )}
            <div className="field">
              <label className="label" htmlFor={`${id}-s`}>{tipo === "cierre-ia" ? "Segundos que se quitan del final" : "El video sigue desde el segundo"}</label>
              <input id={`${id}-s`} className="input" type="number" min="0" step="0.5" value={saltar} onChange={(e) => cambiar(setSaltar)(Number(e.target.value))} aria-describedby={`${id}-s-d`} />
              <p id={`${id}-s-d`} className="hint" style={{ margin: 0 }}>{tipo === "cierre-ia" ? "0: el cierre nuevo va después de todo el video." : "0: desde el principio. Si la entrada de tu video es floja, sáltala."}</p>
            </div>

            <fieldset className="mejorar-video-opciones">
              <legend className="label">{tipo === "ganchos" ? `Los textos del gancho (uno por versión, hasta ${MAX_GANCHOS})` : `Qué se ve en cada una (una por versión, hasta ${MAX_GANCHOS})`}</legend>
              {textos.map((x, i) => (
                <div key={i} className="field" style={{ margin: 0 }}>
                  <label className="sr-only" htmlFor={`${id}-x${i}`}>Versión {i + 1}</label>
                  <input id={`${id}-x${i}`} className="input" maxLength={tipo === "ganchos" ? 90 : 300} value={x} placeholder={`Versión ${i + 1}${formas[i] ? ` · ${formas[i]}` : ""}`}
                    onChange={(e) => cambiar(setTextos)((l) => l.map((y, k) => (k === i ? e.target.value : y)))} />
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={escribir} disabled={Boolean(ocupado)} aria-busy={ocupado === "textos" || undefined} style={{ justifySelf: "start" }}>
                <Icon name="wand" size={14} /> {ocupado === "textos" ? "Escribiendo…" : "Escribirlos con IA"}
              </button>
              {formas.length > 0 && <p className="hint" style={{ margin: 0 }}>Con las formas de gancho: {formas.join(", ")}.</p>}
            </fieldset>

            {costo ? (
              <div className="mejorar-video-costo" role="alertdialog" aria-labelledby={`${id}-c`}>
                <p id={`${id}-c`} style={{ margin: 0 }}><strong>{costo.resumen}</strong></p>
                {costo.aviso && <p className="hint" style={{ margin: 0 }}>{costo.aviso}</p>}
                <div className="mejorar-video-botones">
                  <button type="button" className="btn btn-primary" onClick={() => hacer(true)} disabled={Boolean(ocupado)}><Icon name="check" size={16} /> Sí, hacerlo</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setCosto(null)} disabled={Boolean(ocupado)}>Cambiar algo</button>
                </div>
              </div>
            ) : (
              <div className="mejorar-video-botones">
                <button type="button" className="btn btn-primary" onClick={() => hacer(false)} disabled={Boolean(ocupado) || !lista.length} aria-busy={ocupado === "hacer" || undefined}>
                  <Icon name="sparkles" size={16} /> {tipo === "ganchos" ? `Hacer ${lista.length || ""} ${lista.length === 1 ? "versión" : "versiones"} (gratis)` : "Ver cuánto cuesta"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
              </div>
            )}
          </>
        )}

        {encargo && (
          <div className="mejorar-video-progreso">
            <div role="status" aria-live="polite">
              {enMarcha && <p className="hint" style={{ margin: 0 }}><Icon name="sparkles" size={14} /> Trabajando en el servidor: puedes cerrar esto, la campana te avisa al terminar.</p>}
              <ul>{progreso.map((x) => <li key={x}>{x}</li>)}</ul>
              {!enMarcha && encargo.estado === "fallido" && <p className="form-error" role="alert">{encargo.error || "No salió."}</p>}
            </div>
            {resultados.length > 0 && (
              <div className="mejorar-video-versiones">
                {resultados.map((a, i) => (
                  <div key={a.id} className="mejorar-video-version">
                    <video className="mejorar-video-vista" src={a.src} controls playsInline preload="metadata" aria-label={`Versión ${i + 1}`} />
                    <strong>Versión {i + 1}</strong>
                    {onPoner
                      ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onPoner(a); setPuesto(a.id); }} disabled={puesto === a.id}><Icon name="check" size={14} /> {puesto === a.id ? "Puesta" : "Poner en la publicación"}</button>
                      : cliente && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPoniendo(a)}><Icon name="send" size={14} /> Poner en una publicación…</button>}
                    <a className="btn btn-ghost btn-sm" href={a.src} download><Icon name="download" size={14} /> Descargar</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {error && <p role="alert" className="form-error" style={{ margin: 0 }}>{error}</p>}
      </div>
      {poniendo && (
        <Suspense fallback={null}>
          <PonerEnPublicacion cliente={cliente} archivoIds={[poniendo.id]} tipo="video" descripcion="esta versión del anuncio" onCerrar={() => setPoniendo(null)} />
        </Suspense>
      )}
    </div>
  );
}
