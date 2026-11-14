import { useId, useState } from "react";
import Icon from "./Icon";
import { deconstruirVideo } from "../lib/revisionVideoApi";
import { fraseDeLaCuenta, cabeceraDeToma, textoDeDeconstruccion, PRODUCCIONES, segundosTexto } from "../lib/deconstructor";
import "./VideoListo.css";

// ============================================================
// «Desglosar toma por toma»: la IA describe un video sin opinar (el visor del Estudio)
//
// Planos, ángulos, movimientos de cámara, qué pasa, lo que se dice y se lee, y el ritmo de los cortes. No propone nada:
// sirve para que un reel siga su FORMA («Seguir un anuncio que ya funciona» del reel por planos, o «Recrear» de «Lo
// mejor» como video animado). Es caro en tokens de video: sólo a pedido; queda en la ficha y la segunda vez no se paga.
// `inicial`: el desglose que ya traía la ficha. `lectura`: sólo se mira (quien es de sólo lectura no lo pide).
// ============================================================

export default function DesgloseVideo({ clienteId, archivoId, src = "", nombre = "", inicial = null, lectura = false }) {
  const ids = useId();
  const [d, setD] = useState(inicial?.tomas?.length ? inicial : null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);
  if (!clienteId || !archivoId || (lectura && !d)) return null;

  const desglosar = async (otraVez = false) => {
    setOcupado(true);
    setError("");
    try {
      const r = await deconstruirVideo(clienteId, archivoId, { otraVez }, src);
      setD(r.deconstruccion);
    } catch (e) {
      setError(e.message);
    }
    setOcupado(false);
  };
  const copiar = () => navigator.clipboard.writeText(textoDeDeconstruccion(d, { nombre })).then(() => {
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }).catch(() => setError("No se pudo copiar: selecciónalo a mano."));

  const f = d?.ficha ?? {};
  const r = d?.recurrentes ?? {};
  const repetido = [["Sujetos", r.sujetos], ["Lugares", r.lugares], ["Color", r.color], ["Luz", r.luz], ["Audio", r.audio]].filter(([, v]) => v);

  return (
    <section className="video-listo" aria-labelledby={`${ids}-t`}>
      <p role="status" className={ocupado ? "hint" : "sr-only"}>{ocupado ? "Viendo el video toma por toma (tarda un poco)…" : ""}</p>
      {d ? (
        <>
          <p id={`${ids}-t`} className="video-listo-titulo"><Icon name="list" size={16} /> Desglose toma por toma</p>
          <p className="hint" style={{ margin: 0 }}>
            {fraseDeLaCuenta(d)}
            {f.proporcion ? ` · ${f.proporcion}` : ""}
            {f.produccion ? ` · ${PRODUCCIONES[f.produccion]}` : ""}
          </p>
          {f.produccionPorque && <p className="hint" style={{ margin: 0 }}>Por qué: {f.produccionPorque}</p>}
          {d.porFotogramas && <p className="hint" style={{ margin: 0 }}>Se vio por fotogramas (sin audio): las tomas son aproximadas y lo que se dice no se sabe.</p>}
          <details>
            <summary className="label">Ver las {d.tomas.length} tomas</summary>
            {repetido.length > 0 && (
              <dl className="video-listo-lista" style={{ marginTop: "var(--sp-2)" }}>
                {repetido.map(([k, v]) => <div key={k}><dt style={{ display: "inline", fontWeight: 700 }}>{k}: </dt><dd style={{ display: "inline", margin: 0 }}>{v}</dd></div>)}
              </dl>
            )}
            <ol className="video-listo-arreglos" style={{ marginTop: "var(--sp-2)" }} aria-label="Mapa de secuencia">
              {d.tomas.map((t) => (
                <li key={t.n}>
                  <strong>{cabeceraDeToma(t).replace(/^\d+ · /, "")}</strong>
                  {t.contenido ? <span> · {t.contenido}</span> : null}
                  {t.dice ? <span> · Dice: «{t.dice}»</span> : null}
                  {t.texto ? <span> · En pantalla: «{t.texto}»</span> : null}
                </li>
              ))}
            </ol>
            {(d.montaje?.ritmo || d.montaje?.musica) && (
              <p className="hint" style={{ margin: "var(--sp-2) 0 0" }}>Montaje: {[d.montaje.ritmo, d.montaje.musica].filter(Boolean).join(" · ")}</p>
            )}
            {d.noSeSabe?.length > 0 && <p className="hint" style={{ margin: "var(--sp-1) 0 0" }}>No se puede saber: {d.noSeSabe.join(" · ")}</p>}
            {d.cuenta?.tomas > 1 && <p className="hint" style={{ margin: "var(--sp-1) 0 0" }}>La toma más corta dura {segundosTexto(d.cuenta.masCorta)} s; la más larga, {segundosTexto(d.cuenta.masLarga)} s.</p>}
          </details>
          <p className="hint" style={{ margin: 0 }}>Para que un reel siga su forma: en el video «Por planos», «Seguir la forma de un video desglosado» → este video.</p>
          <div className="video-listo-arranque">
            <button type="button" className="btn btn-ghost btn-sm" onClick={copiar}><Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiado" : "Copiar el desglose"}</button>
            {!lectura && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => desglosar(true)}>
                <Icon name="refresh" size={14} /> Desglosar otra vez
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="video-listo-arranque">
          <button id={`${ids}-t`} type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => desglosar(false)}>
            <Icon name="list" size={16} /> {ocupado ? "Viendo el video…" : "Desglosar toma por toma"}
          </button>
          <span className="hint">La IA describe el video sin opinar: cada toma con su plano, la cámara, lo que se ve y se dice, y el ritmo de los cortes. Sirve para que un reel siga su forma. Cuesta algo más que revisarlo; queda guardado.</span>
        </div>
      )}
      {error && <p role="alert" className="cerebro-error" style={{ margin: 0 }}>{error}</p>}
    </section>
  );
}
