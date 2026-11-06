import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { listarEstilos, guardarEstilo, aplicarEstiloAVideo } from "../lib/estilosVideoApi";
import { USOS_ESTILO_VIDEO } from "../lib/estilosVideo";

// ============================================================
// «Estilo del video» de un video abierto (VideoAnimado.jsx, en diferido: su chunk está cerca de su tope)
//
// «Guardar como estilo»: las REGLAS del guion guardado —el texto principal, los fondos, las transiciones, el cierre, el
// grano, el ritmo, los subtítulos y los efectos; no la letra, ni los textos, ni las imágenes— pasan al kit del cliente, y
// el próximo video sale igual escogiéndolo en «Video nuevo» (src/lib/estilosVideo.js). «Aplicar un estilo guardado»: el
// código impone la forma de uno a este video (una versión nueva, en borrador). Gratis: no hay IA.
// ============================================================

export default function GuardarEstiloVideo({ client, video, sucio = false, onCambio, onAviso }) {
  const ids = useId();
  const [nombre, setNombre] = useState(video.titulo ?? "");
  const [nota, setNota] = useState("");
  const [para, setPara] = useState(video.guion?.cancion ? "cancion" : "voz");
  const [estilos, setEstilos] = useState(null);
  const [aplicar, setAplicar] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    listarEstilos(client.id).then((l) => { if (vivo) { setEstilos(l); setAplicar((a) => a || l[0]?.id || ""); } }).catch(() => { if (vivo) setEstilos([]); });
    return () => { vivo = false; };
  }, [client.id]);

  const guardar = async () => {
    setOcupado("guardar"); setError("");
    try {
      const r = await guardarEstilo(client.id, video.id, { nombre, nota, para });
      setEstilos(r.estilos ?? []);
      onAviso?.(`Guardado el estilo «${r.estilo.nombre}»: escógelo en «Video nuevo» y el siguiente sale igual. Se quita en Marca → Kit y voz.`);
    } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };

  const imponer = async () => {
    setOcupado("aplicar"); setError("");
    try {
      const r = await aplicarEstiloAVideo(client.id, video.id, { estiloId: aplicar, version: video.version });
      if (!r.cambios) { onAviso?.("El video ya tenía la forma de ese estilo: no había nada que cambiar."); return; }
      onCambio?.(r.video);
      onAviso?.(`Estilo aplicado (${r.cambios} cambio${r.cambios === 1 ? "" : "s"} de forma): ahora es la versión ${r.video.version}, en borrador.`);
    } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };

  const bloqueo = sucio ? "Guarda los cambios antes." : video.estado === "renderizando" ? "Se está renderizando: espera a que termine." : "";
  return (
    <div className="va-estilo-video">
      <p className="hint">Guarda cómo se ve y se mueve este video (el texto, los fondos, las transiciones, el cierre): no su letra ni sus imágenes. El siguiente sale igual escogiéndolo en «Video nuevo».</p>
      <label htmlFor={`${ids}-nombre`}>Nombre del estilo</label>
      <input id={`${ids}-nombre`} className="input" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={Boolean(ocupado)} />
      <label htmlFor={`${ids}-nota`}>Algo más que recordar (opcional)</label>
      <textarea id={`${ids}-nota`} className="input" rows={2} maxLength={600} value={nota} onChange={(e) => setNota(e.target.value)} disabled={Boolean(ocupado)}
        placeholder="Líneas doradas que tachan lo del mundo; citas bíblicas pequeñas con su referencia." />
      <label htmlFor={`${ids}-para`}>Para qué videos</label>
      <select id={`${ids}-para`} className="input" value={para} onChange={(e) => setPara(e.target.value)} disabled={Boolean(ocupado)}>
        {Object.entries(USOS_ESTILO_VIDEO).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
      </select>
      <div className="va-acciones">
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado) || Boolean(bloqueo) || !nombre.trim()} onClick={guardar}>
          <Icon name="bookmark" /> {ocupado === "guardar" ? "Guardando…" : "Guardar como estilo"}
        </button>
      </div>

      {estilos?.length > 0 && (
        <>
          <label htmlFor={`${ids}-aplicar`}>Aplicar un estilo guardado a este video</label>
          <div className="va-cancion-fila">
            <select id={`${ids}-aplicar`} className="input" value={aplicar} onChange={(e) => setAplicar(e.target.value)} disabled={Boolean(ocupado)}>
              {estilos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado) || Boolean(bloqueo) || !aplicar} onClick={imponer}>
              {ocupado === "aplicar" ? "Aplicando…" : "Aplicar"}
            </button>
          </div>
          <p className="hint">No cambia lo que se dice ni lo que se lee: sólo la forma. Queda como una versión nueva, en borrador.</p>
        </>
      )}
      {bloqueo && <p className="hint">{bloqueo}</p>}
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
    </div>
  );
}
