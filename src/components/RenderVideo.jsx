// ============================================================
// El RENDER a mp4 de un video animado, en su pantalla: pedirlo, esperarlo y verlo
//
// El render lo hace el Container (worker/lib/estudio/render.js): aquí sólo se pide y, mientras dura, se relee el video
// cada pocos segundos (además del aviso del espacio, que puede no llegar si el socket está caído). Al terminar se ve el
// mp4, se descarga y se dice si quedó puesto en su publicación.
// ============================================================

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { leerVideo, renderizarVideo } from "../lib/videosApi";
import { puedeRenderizar } from "../lib/renderVideo";

const CADA_MS = 4000;
const mb = (b) => `${(Number(b ?? 0) / 1048576).toFixed(1).replace(".", ",")} MB`;

export default function RenderVideo({ client, video, sucio, onCambio }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const render = video.render ?? {};
  const renderizando = video.estado === "renderizando";

  // Mientras se renderiza, se relee el video (el aviso del espacio también lo trae, pero no se depende de él).
  useEffect(() => {
    if (!renderizando) return undefined;
    const t = setInterval(async () => {
      const v = await leerVideo(client.id, video.id).catch(() => null);
      if (v && v.estado !== "renderizando") onCambio(v);
    }, CADA_MS);
    return () => clearInterval(t);
  }, [renderizando, client.id, video.id, onCambio]);

  const puede = puedeRenderizar({ ...video, aprobada_version: video.aprobadaVersion });
  const pedirlo = async () => {
    setOcupado(true); setError("");
    try { const v = await renderizarVideo(client.id, video.id, video.version); if (v) onCambio(v); } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };

  return (
    <section className="va-render" aria-label="El video en mp4">
      <strong>El video (mp4)</strong>
      {render.estado === "listo" && !renderizando && (
        <>
          <video className="va-mp4" src={`/api/media/${render.clave}`} controls playsInline preload="metadata" />
          <p className="hint">
            {Number(render.duracion ?? 0).toFixed(1).replace(".", ",")} s · {render.ancho}×{render.alto} · {mb(render.bytes)}
            {render.lufs !== null && render.lufs !== undefined ? ` · volumen ${String(render.lufs).replace(".", ",")} LUFS` : ""}
            {render.version !== video.version ? " · es de una versión anterior del guion" : ""}
          </p>
          <p className="hint">{render.adjunto ? "Está en la galería del cliente y puesto en su publicación." : render.aviso || "Está en la galería del cliente."}</p>
          <a className="btn btn-ghost btn-sm" href={`/api/media/${render.clave}`} download={`${(video.titulo || "video").replace(/[\\/:*?"<>|]+/g, "")}.mp4`}>
            <Icon name="download" /> Descargar
          </a>
        </>
      )}
      {renderizando && <p className="va-msg" role="status">Renderizando: la voz, las escenas y los subtítulos. Tarda menos de un minuto; puedes cerrar esta pantalla.</p>}
      {video.estado === "fallido" && <p className="va-msg va-error" role="alert">Falló el render: {render.error || "sin motivo"}</p>}
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
      {!renderizando && (
        <>
          <button type="button" className="btn btn-primary" disabled={!puede.ok || sucio || ocupado} onClick={pedirlo}>
            <Icon name="play" /> {ocupado ? "Pidiéndolo…" : render.estado === "listo" ? "Renderizar otra vez" : "Renderizar a mp4"}
          </button>
          {!puede.ok && <p className="hint">{puede.motivo}</p>}
          {puede.ok && !render.estado && <p className="hint">Gratis para la agencia: es cómputo del servidor, no IA.</p>}
        </>
      )}
    </section>
  );
}
