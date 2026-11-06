// ============================================================
// «La canción» de un video con canción (lazy, en el sitio de «La voz»: LocucionVideo.jsx la abre si la locución es una
// canción). No hay voz que generar: la canción ES el audio. Aquí se ve de dónde salieron los tiempos de la letra y su
// coincidencia, si el guion de ahora sigue diciendo la letra (si no, no se renderiza), el AJUSTE FINO (±1,5 s, gratis: se
// aplica al leer y no cambia la versión) y «Volver a sincronizar» (paga otra vez, con su costo antes).
// ============================================================

import { useEffect, useId, useState } from "react";
import Icon from "./Icon";
import { ajustarCancionVideo, resincronizarCancionVideo } from "../lib/cancionApi";
import { estadoDeCancion, FUENTES_CANCION, DESPLAZAMIENTO_MAX, COINCIDENCIA_MINIMA } from "../lib/videoCancion";

const dinero = (n) => (n < 0.01 ? "menos de 1 ¢" : `${Number(n).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} $`);
const conSigno = (n) => `${n > 0 ? "+" : ""}${Number(n).toFixed(2).replace(".", ",")} s`;

export default function CancionVideo({ client, video, sucio, onCambio }) {
  const ids = useId();
  const loc = video.locucion ?? {};
  const [ajuste, setAjuste] = useState(Number(loc.desplazamiento) || 0);
  const [precio, setPrecio] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [dicho, setDicho] = useState("");
  // Si otra persona movió el ajuste (o se volvió a sincronizar), se ve el de ahora.
  useEffect(() => { setAjuste(Number(loc.desplazamiento) || 0); }, [loc.desplazamiento]);

  const estado = video.guion ? estadoDeCancion(video.guion, loc) : { ok: true };
  const renderizando = video.estado === "renderizando";
  const cambiado = Math.abs(ajuste - (Number(loc.desplazamiento) || 0)) > 0.001;

  const guardarAjuste = async () => {
    setOcupado("ajuste"); setError(""); setDicho("");
    try {
      const v = await ajustarCancionVideo(client.id, video.id, ajuste);
      if (v) onCambio(v);
      setDicho(video.estado === "renderizado" ? "Ajuste guardado: vuelve a renderizar para oírlo en el mp4 (gratis)." : "Ajuste guardado: la vista previa ya va con él.");
    } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };

  const resincronizar = async (confirmado) => {
    setOcupado("sincronizar"); setError(""); setDicho("");
    try {
      const r = await resincronizarCancionVideo(client.id, video.id, { confirmado });
      if (r?.confirmar) { setPrecio(r.confirmar); return; }
      setPrecio(null);
      if (r?.video) onCambio(r.video);
      setDicho(`Sincronizada otra vez (${FUENTES_CANCION[r?.sincronia?.fuente] ?? "lista"}).`);
    } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };

  return (
    <div className="va-locucion">
      <strong>La canción</strong>
      <p className="hint">
        «{loc.nombre ?? "La canción"}»{loc.de === "agencia" ? " (de la agencia)" : ""} · {Number(loc.duracion ?? 0).toFixed(1)} s · sincronizada por {FUENTES_CANCION[loc.fuente] ?? loc.fuente}
        {" "}({Math.round(Number(loc.coincidencia ?? 0) * 100)} % de la letra encontrada). No se genera voz: la canción es el audio.
      </p>
      {Number(loc.coincidencia ?? 0) < COINCIDENCIA_MINIMA && (
        <p className="va-msg va-error" role="alert">La letra no se encontró bien en la canción: mira la vista previa y, si todo va adelantado o atrasado, el ajuste fino; si no, vuelve a sincronizar.</p>
      )}
      {!estado.ok && <p className="va-msg va-error" role="alert">{estado.motivo}</p>}
      {sucio && <p className="hint">Hay cambios sin guardar en el guion: la vista previa ya los usa; guárdalos para aprobarlo.</p>}

      <label htmlFor={`${ids}-ajuste`}>Ajuste fino de la letra: {conSigno(ajuste)} <span className="hint">(si sale antes que la voz, a la derecha; gratis)</span></label>
      <input id={`${ids}-ajuste`} type="range" className="va-cancion-ajuste" min={-DESPLAZAMIENTO_MAX} max={DESPLAZAMIENTO_MAX} step={0.05} value={ajuste}
        onChange={(e) => setAjuste(Number(e.target.value))} disabled={renderizando || Boolean(ocupado)} />
      <div className="va-acciones">
        <button type="button" className="btn btn-secondary btn-sm" disabled={!cambiado || renderizando || Boolean(ocupado)} onClick={guardarAjuste}>
          <Icon name="check" /> {ocupado === "ajuste" ? "Guardando…" : "Guardar el ajuste"}
        </button>
        {precio ? (
          <>
            <button type="button" className="btn btn-accent btn-sm" disabled={Boolean(ocupado)} onClick={() => resincronizar(true)}>
              <Icon name="refresh" /> {ocupado === "sincronizar" ? "Sincronizando…" : `Sincronizar por unos ${dinero(precio.minimo ?? precio.costo)}`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrecio(null)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={renderizando || Boolean(ocupado)} onClick={() => resincronizar(false)}>
            <Icon name="refresh" /> {ocupado === "sincronizar" ? "Calculando…" : "Volver a sincronizar (ver el costo)"}
          </button>
        )}
      </div>
      {precio && <p className="va-msg" role="status">{precio.error}</p>}
      {dicho && <p className="va-msg" role="status">{dicho}</p>}
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
    </div>
  );
}
