// ============================================================
// «Video nuevo» del video animado (lazy: el chunk de VideoAnimado está cerca de su tope)
//
// El paso 4: crear un video SIN Claude. La idea (o la publicación del calendario de la que sale), la duración y el
// formato; «Escribir el guion con IA» lo pide al servidor (`POST /api/videos/<c>/escribir`, texto, sin confirmación) y
// lo devuelve SIN GUARDAR: la pantalla lo abre como borrador para revisarlo, editarlo y guardarlo. «Empezar con una
// plantilla» abre el guion de arranque, como antes.
// ============================================================

import { useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { escribirGuionVideo } from "../lib/videosApi";
import { DURACIONES_ANIMADO, DURACION_ANIMADO_POR_DEFECTO, MAX_IDEA_ANIMADO } from "../lib/guionAnimadoIA";
import { publicacionesParaVideo } from "../lib/renderVideo";
import { fmtDate } from "../utils";

const FORMATOS = [["9:16", "Vertical 9:16"], ["1:1", "Cuadrado 1:1"], ["16:9", "Horizontal 16:9"]];

export default function CrearVideoAnimado({ client, publicacion = null, onListo, onPlantilla, onCancelar }) {
  const ids = useId();
  const [idea, setIdea] = useState(publicacion?.idea ?? "");
  const [segundos, setSegundos] = useState(DURACION_ANIMADO_POR_DEFECTO);
  const [formato, setFormato] = useState("9:16");
  const opciones = useMemo(() => publicacionesParaVideo(client.calendars ?? [], { hoy: fmtDate(new Date()), ligada: publicacion?.postId ?? null }), [client.calendars, publicacion?.postId]);
  const [postId, setPostId] = useState(publicacion?.postId ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const escribir = async () => {
    setOcupado(true); setError("");
    try {
      const r = await escribirGuionVideo(client.id, { idea, segundos, formato, postId });
      const destino = r.publicacion ?? (postId ? { postId, calendarId: opciones.find((o) => o.postId === postId)?.calendarId ?? publicacion?.calendarId ?? null } : null);
      onListo(r.guion, { publicacion: destino, aviso: r.corregido ? "La IA corrigió su primer intento para que valide." : r.aviso || "" });
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };

  return (
    <section className="va-crear" aria-labelledby={`${ids}-t`}>
      <h3 id={`${ids}-t`}>Video nuevo</h3>
      <p className="hint">Di de qué va y la IA escribe el guion por escenas (texto: unos céntimos). Lo revisas y lo editas antes de guardarlo; la voz, después, con su costo.</p>
      <label htmlFor={`${ids}-idea`}>De qué va el video</label>
      <textarea id={`${ids}-idea`} className="input" rows={4} maxLength={MAX_IDEA_ANIMADO} value={idea} onChange={(e) => setIdea(e.target.value)}
        placeholder="Tres errores al escoger toallitas para un bebé con piel sensible, y por qué las nuestras no llevan alcohol ni perfume." />
      <label htmlFor={`${ids}-post`}>Sale de una publicación (opcional: la IA la lee y el mp4 se pondrá en ella)</label>
      <select id={`${ids}-post`} className="input" value={postId} onChange={(e) => setPostId(e.target.value)}>
        <option value="">Ninguna</option>
        {opciones.map((o) => <option key={o.postId} value={o.postId}>{o.etiqueta}</option>)}
        {publicacion?.postId && !opciones.some((o) => o.postId === publicacion.postId) && <option value={publicacion.postId}>La publicación abierta</option>}
      </select>
      <fieldset className="va-opciones">
        <legend>Duración</legend>
        {DURACIONES_ANIMADO.map((s) => (
          <button key={s} type="button" className="filter-chip" aria-pressed={segundos === s} onClick={() => setSegundos(s)}>{s} s</button>
        ))}
      </fieldset>
      <fieldset className="va-opciones">
        <legend>Formato</legend>
        {FORMATOS.map(([f, nombre]) => (
          <button key={f} type="button" className="filter-chip" aria-pressed={formato === f} onClick={() => setFormato(f)}>{nombre}</button>
        ))}
      </fieldset>
      <div className="va-acciones">
        <button type="button" className="btn btn-primary" disabled={ocupado || (!idea.trim() && !postId)} onClick={escribir}>
          <Icon name="sparkles" /> {ocupado ? "Escribiendo el guion… (hasta un minuto)" : "Escribir el guion con IA"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={onPlantilla}>Empezar con una plantilla</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
    </section>
  );
}
