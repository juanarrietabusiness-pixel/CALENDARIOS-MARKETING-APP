import { useState } from "react";
import Icon from "./Icon";
import { revisarVideo } from "../lib/revisionVideoApi";
import { FRASE_VEREDICTO } from "../lib/revisionVideo";
import "./VideoListo.css";

// ============================================================
// «¿Está listo este video?»: el motor de video lo VE antes de publicarlo
//
// En la pestaña Subir de una publicación con video y en el visor del Estudio. Un video de la galería va por su id
// (la revisión queda en su ficha: la segunda vez no se paga); el de una publicación, por su clave. `inicial`: la
// revisión que ya traía la ficha. Nada cambia solo: dice qué falla y cómo arreglarlo.
// ============================================================

const ICONO = { listo: "checkCircle", casi: "alert", no: "alert" };

export default function VideoListo({ clienteId, archivoId = "", clave = "", src = "", idea = "", productoId = "", formato = "reel", inicial = null }) {
  const [revision, setRevision] = useState(inicial?.criterios ? inicial : null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  if (!clienteId || (!archivoId && !clave)) return null;

  const revisar = async (otraVez = false) => {
    setOcupado(true);
    setError("");
    try {
      const r = await revisarVideo(clienteId, { ...(archivoId ? { archivoId } : { clave }), idea, productoId, formato, otraVez }, src);
      setRevision(r.revision);
    } catch (e) {
      setError(e.message);
    }
    setOcupado(false);
  };

  return (
    <section className="video-listo" aria-label="¿Está listo este video?" data-veredicto={revision?.veredicto}>
      <p role="status" className={ocupado ? "hint" : "sr-only"}>{ocupado ? "Viendo el video (tarda un poco)…" : ""}</p>
      {revision ? (
        <>
          <p className="video-listo-titulo">
            <Icon name={ICONO[revision.veredicto] ?? "alert"} size={16} /> {FRASE_VEREDICTO[revision.veredicto]} · {revision.puntaje}/10
          </p>
          {revision.resumen && <p className="hint" style={{ margin: 0 }}>{revision.resumen}</p>}
          <ul className="video-listo-lista">
            {revision.criterios.map((c) => (
              <li key={c.id} data-ok={c.ok === true ? "si" : c.ok === false ? "no" : "na"}>
                <Icon name={c.ok === true ? "check" : c.ok === false ? "close" : "minus"} size={14} />
                <span><strong>{c.nombre}</strong>{c.nota ? ` · ${c.nota}` : ""}</span>
              </li>
            ))}
          </ul>
          {revision.arreglos.length > 0 && (
            <div>
              <p className="label" style={{ margin: 0 }}>Antes de publicarlo</p>
              <ol className="video-listo-arreglos">{revision.arreglos.map((a) => <li key={a}>{a}</li>)}</ol>
            </div>
          )}
          {revision.porFotogramas && <p className="hint" style={{ margin: 0 }}>Se revisó por fotogramas (sin audio): la voz no se pudo oír.</p>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => revisar(true)}>
            <Icon name="refresh" size={14} /> Revisar otra vez
          </button>
        </>
      ) : (
        <div className="video-listo-arranque">
          <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => revisar(false)}>
            <Icon name="eye" size={16} /> {ocupado ? "Viendo el video…" : "¿Está listo este video?"}
          </button>
          <span className="hint">La IA lo ve entero: el gancho, si se entiende sin sonido, la voz, el producto, la marca y el cierre (unos centavos).</span>
        </div>
      )}
      {error && <p role="alert" className="cerebro-error" style={{ margin: 0 }}>{error}</p>}
    </section>
  );
}
