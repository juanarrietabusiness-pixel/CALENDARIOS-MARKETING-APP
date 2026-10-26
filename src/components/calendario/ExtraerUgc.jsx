import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { leerEstudio, subirImagen } from "../../lib/estudio";
import { extraerUgc } from "../../lib/mercado";
import { anadirAlBanco } from "../../lib/bancoIdeasApi";
import { nuevaIdea } from "../../lib/bancoIdeas";
import { DURACIONES_UGC, partirGuionUgc, publicacionDeUgc } from "../../lib/ugc";
import { proponerFormula } from "../../lib/formulasUgcApi";
import { editaLaAgencia } from "../../lib/sesionActual";
import "./GuionUgc.css";

// Las fórmulas de la agencia: sólo al guardar una.
const FormulasUgc = lazy(() => import("./FormulasUgc"));

// ============================================================
// «Extraer guion y adaptar» (UGC)
//
// Lo que la agencia hacía a mano: ver un video que funciona, sacar la voz
// en off y las ideas visuales y reescribirlo para la empresa. Gemini VE el
// video (la voz palabra por palabra y las tomas) y la IA lo ADAPTA a la
// marca con el producto del catálogo, en UGC para grabar (lib/ugc.js,
// `POST /api/mercado/<c>/ugc`). No guarda nada solo: el resultado va a la
// publicación («Usar en la publicación») o al banco de ideas del cliente.
//
// El video sale de la publicación (lo que ya tiene puesto), de la galería
// del Estudio o se sube aquí (a la galería). La transcripción se recuerda
// en la ficha del video: adaptarlo otra vez no vuelve a pagar a Gemini.
//
// «Guardar como fórmula» saca del video ORIGINAL su receta (sin su
// contenido) para la biblioteca de la agencia (lib/formulasUgc.js): la IA la
// propone y se abre en el editor; nada se guarda hasta «Guardar».
// ============================================================

/** De dónde sale el video para el servidor: su ficha de la galería, su clave en una publicación o su enlace de YouTube. */
const origenDelVideo = (v) => (v.youtube ? { youtube: v.youtube } : v.id ? { archivoId: v.id } : { clave: v.src });

/** Un tramo en una fila: tiempo · lo que dice · lo que se ve. */
function Tabla({ tramos, etiqueta }) {
  return (
    <div className="guion-ugc-tabla" role="table" aria-label={etiqueta}>
      <div role="row" className="guion-ugc-fila guion-ugc-titulos">
        <span role="columnheader">Tiempo</span><span role="columnheader">Lo que dice</span><span role="columnheader">Lo que se ve</span>
      </div>
      {tramos.map((t, i) => (
        <div role="row" className="guion-ugc-fila" key={i}>
          <span role="cell" className="guion-ugc-tiempo">{t.desde != null ? `${t.desde}–${t.hasta} s` : "—"}</span>
          <span role="cell">{t.voz ? `«${t.voz}»` : <span className="hint">(sin voz)</span>}</span>
          <span role="cell">{t.seVe}{t.texto && <span className="guion-ugc-texto">En pantalla: «{t.texto}»</span>}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * @param videos     los videos ya puestos en la publicación ({ src, nombre? }).
 * @param onUsar     recibe la publicación UGC (`publicacionDeUgc`); sin él, sólo se guarda en el banco.
 * @param inicial    un video de la galería con el que arrancar ({ id, src, nombre }), p. ej. desde el visor; o uno PÚBLICO
 *                   de YouTube ({ youtube, nombre }): Gemini lo ve por su enlace (Inspiración), sin bajarlo.
 * @param formula    abrir directo en «Guardar como fórmula»: sólo se transcribe el original (sin adaptar, no se paga
 *                   la llamada de texto) y la IA propone su receta.
 */
export default function ExtraerUgc({ client, videos = [], duracion: duracionInicial = 30, productoId: productoInicial = "", inicial = null, onUsar = null, onCerrar, formula: soloFormula = false }) {
  const ids = useId();
  const clienteId = client.dbId || client.id;
  const [ocupado, setOcupado] = useState("");
  const ref = useDialogA11y(() => { if (!ocupado) onCerrar(); });
  const entrada = useRef(null);
  const [galeria, setGaleria] = useState(null); // { videos, productos }
  const [video, setVideo] = useState(inicial ?? (videos[0] ? { src: videos[0].src, nombre: "El video de la publicación" } : null));
  const [productoId, setProductoId] = useState(productoInicial);
  const [duracion, setDuracion] = useState(duracionInicial);
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [formula, setFormula] = useState(null); // la propuesta, abierta en el editor

  useEffect(() => {
    let vivo = true;
    leerEstudio(clienteId).then((g) => {
      if (!vivo) return;
      const lista = (g?.archivos ?? []).filter((a) => a.tipo === "video" && !a.borradoAt && String(a.mime ?? "").startsWith("video/"));
      setGaleria({ videos: lista, productos: g?.productos ?? [] });
    }).catch(() => vivo && setGaleria({ videos: [], productos: [] }));
    return () => { vivo = false; };
  }, [clienteId]);

  const subir = async (archivo) => {
    if (!archivo) return;
    if (!archivo.type.startsWith("video/")) { setError("Escoge un video (MP4, MOV o WebM)."); return; }
    setError("");
    setOcupado("Subiendo el video a la galería…");
    try {
      const r = await subirImagen(clienteId, archivo);
      setVideo({ id: r.archivo.id, src: r.archivo.src, nombre: archivo.name });
      setGaleria((g) => (g && !g.videos.some((v) => v.id === r.archivo.id) ? { ...g, videos: [r.archivo, ...g.videos] } : g));
    } catch (e) {
      setError(`No se pudo subir: ${e.message}`);
    }
    setOcupado("");
  };

  const extraer = async () => {
    if (!video || ocupado) return;
    setError("");
    setAviso("");
    setResultado(null);
    setOcupado("Viendo el video y adaptándolo a la marca (puede tardar un minuto)…");
    try {
      const r = await extraerUgc(clienteId, { ...origenDelVideo(video), productoId, duracion, nota }, video.src ?? "");
      setResultado(r);
      if (r.aviso) setAviso(r.aviso);
    } catch (e) {
      setError(e.message);
    }
    setOcupado("");
  };

  const pub = resultado ? publicacionDeUgc(resultado.adaptado, { duracion: resultado.duracion, productoId: resultado.producto?.id ?? "", producto: resultado.producto?.nombre ?? "" }) : null;
  const alBanco = async () => {
    if (!pub) return;
    setOcupado("Guardando en el banco de ideas…");
    try {
      await anadirAlBanco({ ...nuevaIdea({ id: crypto.randomUUID(), idea: pub.idea, format: "reel", guion: pub.guion, descripcion: pub.descripcion ?? "" }), ...pub }, clienteId);
      setAviso("Guardado en el banco de ideas de este cliente. Desde allí se lleva a un día del calendario.");
    } catch (e) {
      setError(`No se pudo guardar: ${e.message}`);
    }
    setOcupado("");
  };

  const formulaDe = async (original, duracionOriginal) => {
    const fuente = { ...(video?.id ? { archivoId: video.id } : {}), ...(inicial?.cuenta ? { cuenta: inicial.cuenta } : {}), ...(inicial?.enlace ? { enlace: inicial.enlace } : {}) };
    const r = await proponerFormula({ original, fuente, duracion: original.duracion ?? duracionOriginal, clienteId });
    setFormula(r.formula);
    if (r.aviso) setAviso(r.aviso);
  };
  const comoFormula = async () => {
    if (!resultado?.original) return;
    setError("");
    setOcupado("Sacando la fórmula del video…");
    try {
      await formulaDe(resultado.original, resultado.duracion);
    } catch (e) {
      setError(`No se pudo sacar la fórmula: ${e.message}`);
    }
    setOcupado("");
  };
  // Directo a la fórmula (desde Inspiración): sólo la transcripción del original; sin adaptarlo.
  const sacarFormula = async () => {
    if (!video || ocupado) return;
    setError("");
    setAviso("");
    setOcupado("Viendo el video y sacando su fórmula (puede tardar un minuto)…");
    try {
      const r = await extraerUgc(clienteId, { ...origenDelVideo(video), soloTranscribir: true }, video.src ?? "");
      await formulaDe(r.original, duracion);
    } catch (e) {
      setError(`No se pudo sacar la fórmula: ${e.message}`);
    }
    setOcupado("");
  };

  const opciones = [
    ...videos.map((v, i) => ({ clave: `p${i}`, src: v.src, nombre: videos.length > 1 ? `Video ${i + 1} de la publicación` : "El video de la publicación" })),
    ...(galeria?.videos ?? []).map((a) => ({ clave: a.id, id: a.id, src: a.src, nombre: a.prompt?.slice(0, 60) || "Video de la galería" })),
  ];

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div ref={ref} className="dialog extraer-ugc" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-2)" }}>
          <h2 id={`${ids}-t`} style={{ margin: 0 }}><Icon name="video" size={18} /> Extraer guion y adaptar</h2>
          <button type="button" className="btn-icon" onClick={onCerrar} disabled={Boolean(ocupado)} aria-label="Cerrar"><Icon name="close" size={18} /></button>
        </div>
        <p className="hint" style={{ margin: "var(--sp-2) 0 var(--sp-3)" }}>
          La IA ve el video, saca lo que se dice palabra por palabra y lo que se ve, y lo reescribe para {client.name} como
          UGC para grabar: la misma forma, con su producto y su voz. No copia frases ni marcas del original.
        </p>

        {!resultado && (
          <div className="extraer-ugc-form">
            <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
              <legend className="label">El video</legend>
              {video?.youtube && (
                <p className="hint" style={{ margin: 0 }}>
                  <Icon name="play" size={12} /> {video.nombre || "El video de YouTube"}: Gemini lo ve por su enlace, sin bajarlo.
                </p>
              )}
              {!video?.youtube && !galeria && !videos.length && <p className="hint" role="status">Cargando la galería…</p>}
              {!video?.youtube && opciones.length > 0 && (
                <ul className="extraer-ugc-videos">
                  {opciones.map((o) => (
                    <li key={o.clave}>
                      <label>
                        <input type="radio" name={`${ids}-v`} checked={video?.src === o.src} onChange={() => setVideo({ id: o.id, src: o.src, nombre: o.nombre })} />
                        <video src={o.src} muted playsInline preload="metadata" aria-hidden="true" />
                        <span>{o.nombre}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {!video?.youtube && galeria && !opciones.length && <p className="hint" style={{ margin: 0 }}>Este cliente no tiene videos en la galería: sube uno (el que guardaste del teléfono).</p>}
              {!video?.youtube && (
                <>
                  <input ref={entrada} type="file" accept="video/*" className="sr-only" aria-label="Video para extraer el guion"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void subir(f); }} />
                  <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => entrada.current?.click()} disabled={Boolean(ocupado)}>
                    <Icon name="upload" size={14} /> Subir un video
                  </button>
                </>
              )}
            </fieldset>
            <div className="extraer-ugc-ajustes">
              <label className="field" htmlFor={`${ids}-prod`}>
                <span className="label">Producto</span>
                <select id={`${ids}-prod`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                  <option value="">Sin producto concreto</option>
                  {(galeria?.productos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
              <label className="field" htmlFor={`${ids}-dur`}>
                <span className="label">Duración</span>
                <select id={`${ids}-dur`} className="input" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
                  {DURACIONES_UGC.map((d) => <option key={d} value={d}>{d} s</option>)}
                </select>
              </label>
            </div>
            <label className="field" htmlFor={`${ids}-nota`}>
              <span className="label">¿Algo más? <span className="hint">(opcional)</span></span>
              <textarea id={`${ids}-nota`} className="input" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="Ej.: que lo diga la dueña, mencionar el envío gratis" />
            </label>
            {soloFormula && editaLaAgencia() ? (
              <button type="button" className="btn btn-primary" onClick={sacarFormula} disabled={!video || Boolean(ocupado)} aria-busy={Boolean(ocupado) || undefined}
                title="La receta del video, sin su contenido, para la biblioteca de fórmulas de la agencia">
                <Icon name="list" size={16} /> {ocupado ? "Trabajando…" : "Sacar su fórmula"}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={extraer} disabled={!video || Boolean(ocupado)} aria-busy={Boolean(ocupado) || undefined}>
                <Icon name="sparkles" size={16} /> {ocupado && !resultado ? "Trabajando…" : "Extraer y adaptar"}
              </button>
            )}
          </div>
        )}

        {resultado && pub && (
          <div className="extraer-ugc-resultado">
            <h3 className="label" style={{ margin: 0 }}>{pub.title || "El guion adaptado"} · {resultado.duracion} s{resultado.producto ? ` · ${resultado.producto.nombre}` : ""}</h3>
            <Tabla tramos={partirGuionUgc(pub.guion)} etiqueta="El guion adaptado" />
            {pub.ganchosUgc?.length > 0 && (
              <div className="guion-ugc-ganchos">
                <p className="label" style={{ margin: 0 }}>Ganchos para probar</p>
                <ul>{pub.ganchosUgc.map((g) => <li key={g}><span>«{g}»</span></li>)}</ul>
              </div>
            )}
            {pub.descripcion && <p className="extraer-ugc-caption"><strong>Caption:</strong> {pub.descripcion}</p>}
            <details>
              <summary>El video original, transcrito</summary>
              {resultado.original?.estructura && <p className="hint" style={{ margin: 0 }}>Estructura: {resultado.original.estructura}</p>}
              {resultado.original?.porQue && <p className="hint" style={{ margin: 0 }}>Por qué funciona: {resultado.original.porQue}</p>}
              <Tabla tramos={resultado.original?.tramos ?? []} etiqueta="El video original" />
            </details>
            <div className="extraer-ugc-acciones">
              <button type="button" className="btn btn-ghost" onClick={() => setResultado(null)} disabled={Boolean(ocupado)}>Cambiar y volver a adaptar</button>
              {editaLaAgencia() && (
                <button type="button" className="btn btn-secondary" onClick={comoFormula} disabled={Boolean(ocupado)}
                  title="La receta del video original, sin su contenido, para usarla con cualquier cliente">
                  <Icon name="list" size={16} /> Guardar como fórmula
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={alBanco} disabled={Boolean(ocupado)}>
                <Icon name="bulb" size={16} /> Guardar en el banco de ideas
              </button>
              {onUsar && (
                <button type="button" className="btn btn-primary" onClick={() => onUsar(pub)} disabled={Boolean(ocupado)}>
                  <Icon name="check" size={16} /> Usar en la publicación
                </button>
              )}
            </div>
          </div>
        )}

        <div role="status" aria-live="polite" className={ocupado || aviso ? "hint" : "sr-only"}>{ocupado || aviso}</div>
        {error && <p role="alert" className="cerebro-error">{error}</p>}
      </div>
      {formula && (
        <Suspense fallback={null}>
          <FormulasUgc inicial={formula} onCerrar={() => setFormula(null)}
            onGuardada={(f) => { setFormula(null); setAviso(`Fórmula «${f.nombre}» guardada: ya se puede escoger en cualquier guion UGC.`); }} />
        </Suspense>
      )}
    </div>
  );
}
