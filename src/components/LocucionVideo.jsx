// ============================================================
// «La voz» del video animado en su pantalla (lazy: el chunk de VideoAnimado está cerca de su tope)
//
// Antes la locución sólo la pedía Claude (generar_locucion). Aquí, con el guion aprobado: «Ver el costo» pregunta al
// servidor (409 `confirmar` con la cifra; no crea nada) y sólo «Generar por …» la paga. Mientras se genera, se relee
// el video cada 4 s (además del aviso del espacio). La voz es la de la marca (kit); si no hay, se dice dónde escogerla.
// ============================================================

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { leerVideo, pedirLocucionVideo } from "../lib/videosApi";
import { puedeGenerarVoz, tieneHabla } from "../lib/videoEscenas";

const CADA_MS = 4000;
const dinero = (n) => (n < 0.01 ? "menos de 1 ¢" : `${Number(n).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} $`);

export default function LocucionVideo({ client, video, sucio, onCambio }) {
  const loc = video.locucion ?? {};
  const [precio, setPrecio] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const generando = loc.estado === "generando";
  const deEstaVersion = loc.estado === "lista" && loc.version === video.version;
  const puede = puedeGenerarVoz({ ...video, aprobada_version: video.aprobadaVersion }) && !sucio;

  useEffect(() => {
    if (!generando) return undefined;
    const t = setInterval(async () => {
      const v = await leerVideo(client.id, video.id).catch(() => null);
      if (v && v.locucion?.estado !== "generando") onCambio(v);
    }, CADA_MS);
    return () => clearInterval(t);
  }, [generando, client.id, video.id, onCambio]);

  const pedirla = async (confirmado) => {
    setOcupado(true); setError("");
    try {
      const r = await pedirLocucionVideo(client.id, video.id, { version: video.version, confirmado });
      if (r?.confirmar) { setPrecio(r.confirmar); return; }
      setPrecio(null);
      const v = await leerVideo(client.id, video.id).catch(() => null);
      if (v) onCambio(v);
    } catch (e) {
      setError(e.datos?.codigo === "sin_voz" ? `${e.message} Ábrela en «Probar una voz» (en la lista de videos) y pulsa «Fijar como voz de la marca».` : e.message);
    } finally { setOcupado(false); }
  };

  if (!["aprobado", "con_voz", "renderizado", "fallido"].includes(video.estado) && !generando && !loc.estado) return null;
  // Un montaje de clips sin habla no tiene voz que generar: sale con el sonido de los clips.
  if (video.guion && !tieneHabla(video.guion) && !loc.estado) return null;
  return (
    <div className="va-locucion">
      <strong>La voz</strong>
      {generando && <p className="va-msg" role="status">Generando la voz ({loc.voz?.nombre ?? "la de la marca"})… sigue aunque cierres. {loc.nota || ""}</p>}
      {loc.estado === "lista" && (
        <p className="hint">
          {deEstaVersion ? "Lista" : "De otra versión del guion"}: {loc.voz?.nombre ?? "voz"}, {Number(loc.duracion ?? 0).toFixed(1)} s
          {loc.revisar ? " · OJO: escúchala, no se entendió todo el guion" : ""}.
        </p>
      )}
      {loc.estado === "fallida" && <p className="va-msg va-error" role="alert">La voz no salió: {loc.error || "sin motivo"}.</p>}
      {!puede && !generando && !deEstaVersion && <p className="hint">{sucio ? "Guarda los cambios y aprueba el guion para generar la voz." : "Aprueba el guion para generar la voz."}</p>}
      {puede && !generando && (
        <div className="va-acciones">
          {precio ? (
            <>
              <button type="button" className="btn btn-accent btn-sm" disabled={ocupado} onClick={() => pedirla(true)}>
                <Icon name="mic" /> {ocupado ? "Pidiendo…" : `Generar por ${dinero(precio.costo)}`}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrecio(null)}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => pedirla(false)}>
              <Icon name="mic" /> {ocupado ? "Calculando…" : deEstaVersion ? "Otra toma de la voz (ver el costo)" : "Generar la voz (ver el costo)"}
            </button>
          )}
        </div>
      )}
      {precio && <p className="va-msg" role="status">{precio.error}</p>}
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
    </div>
  );
}
