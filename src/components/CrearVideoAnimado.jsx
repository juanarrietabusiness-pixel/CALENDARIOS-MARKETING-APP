// ============================================================
// «Video nuevo» del video animado (lazy: el chunk de VideoAnimado está cerca de su tope)
//
// El paso 4: crear un video SIN Claude. La idea (o la publicación del calendario de la que sale), la duración y el
// formato; «Escribir el guion con IA» lo pide al servidor (`POST /api/videos/<c>/escribir`, texto, sin confirmación) y
// lo devuelve SIN GUARDAR: la pantalla lo abre como borrador para revisarlo, editarlo y guardarlo. «Empezar con una
// plantilla» abre el guion de arranque, como antes. «Estructura del guion» escoge cuál de las de la agencia sigue la voz
// en off (o la IA escoge); la que siguió vuelve con el guion y el borrador la guarda (`origen.estructuraId`).
//
// «Con tu canción» (CrearConCancion.jsx, en su chunk): el video sobre una canción YA GRABADA con su letra sincronizada; la
// crea el servidor ya guardada (con la canción como su locución) y se abre con `onCreado`. `formaInicial` «cancion» abre
// directo en ella (la categoría «Video con canción» del calendario y del Estudio).
//
// «Estilo del video» (SelectorEstiloVideo): un ESTILO GUARDADO del cliente para voz en off; la IA escribe con él y el
// servidor impone su forma.
// ============================================================

import { lazy, Suspense, useCallback, useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { escribirGuionVideo } from "../lib/videosApi";
import { DURACIONES_ANIMADO, DURACION_ANIMADO_POR_DEFECTO, MAX_IDEA_ANIMADO } from "../lib/guionAnimadoIA";
import { publicacionesParaVideo } from "../lib/renderVideo";
import { fmtDate } from "../utils";
import SelectorEstructura from "./SelectorEstructura";
import SelectorEstiloVideo from "./SelectorEstiloVideo";

const FORMATOS = [["9:16", "Vertical 9:16"], ["1:1", "Cuadrado 1:1"], ["16:9", "Horizontal 16:9"]];
const CrearConCancion = lazy(() => import("./CrearConCancion"));

export default function CrearVideoAnimado({ client, publicacion = null, onListo, onPlantilla, onCancelar, onCreado, formaInicial = "idea" }) {
  const ids = useId();
  // De qué sale: una idea (la IA escribe la voz en off) o una canción ya grabada.
  const [forma, setForma] = useState(formaInicial === "cancion" && onCreado ? "cancion" : "idea");
  const [idea, setIdea] = useState(publicacion?.idea ?? "");
  const [segundos, setSegundos] = useState(DURACION_ANIMADO_POR_DEFECTO);
  const [formato, setFormato] = useState("9:16");
  const opciones = useMemo(() => publicacionesParaVideo(client.calendars ?? [], { hoy: fmtDate(new Date()), ligada: publicacion?.postId ?? null }), [client.calendars, publicacion?.postId]);
  const [postId, setPostId] = useState(publicacion?.postId ?? "");
  // La ESTRUCTURA de guion de la agencia que sigue la voz ("" = la escoge la IA entre las de voz en off).
  const [estructuraId, setEstructuraId] = useState("");
  // «Con imágenes de fondo»: la IA pide un fondo por sección; el director los crea después, con su costo.
  const [conFondos, setConFondos] = useState(false);
  // Un estilo guardado del cliente para voz en off (null: aún sin escoger; "": ninguno).
  const [estiloId, setEstiloId] = useState(null);
  const [estilo, setEstilo] = useState(null);
  const escogerEstilo = useCallback((id, e) => { setEstiloId(id); setEstilo(e); }, []);
  const fondosDelEstilo = estilo?.fondo?.imagen === true;
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const escribir = async () => {
    setOcupado(true); setError("");
    try {
      const r = await escribirGuionVideo(client.id, { idea, segundos, formato, postId, estructuraId, conFondos, estiloId: estiloId || "" });
      const destino = r.publicacion ?? (postId ? { postId, calendarId: opciones.find((o) => o.postId === postId)?.calendarId ?? publicacion?.calendarId ?? null } : null);
      const sigue = r.estructura ? `Sigue la estructura «${r.estructura.nombre}».` : "";
      const fondos = r.fondos > 0 ? `Pide ${r.fondos} imagen${r.fondos === 1 ? "" : "es"} de fondo: guarda el guion y créalas con el director (se dice el costo antes).` : "";
      onListo(r.guion, {
        publicacion: destino, estructura: r.estructura ?? null,
        aviso: [r.corregido ? "La IA corrigió su primer intento para que valide." : r.aviso || "", sigue, r.estilo ? `Con el estilo «${r.estilo.nombre}».` : "", fondos].filter(Boolean).join(" "),
      });
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  };

  const formas = onCreado && (
    <div className="va-opciones" role="group" aria-label="De qué sale el video">
      <button type="button" className="filter-chip" aria-pressed={forma === "idea"} onClick={() => setForma("idea")}><Icon name="sparkles" /> Con una idea</button>
      <button type="button" className="filter-chip" aria-pressed={forma === "cancion"} onClick={() => setForma("cancion")}><Icon name="music" /> Con tu canción</button>
    </div>
  );
  if (forma === "cancion") {
    return (
      <section className="va-crear" aria-labelledby={`${ids}-t`}>
        <h3 id={`${ids}-t`}>Video nuevo con tu canción</h3>
        {formas}
        <Suspense fallback={<p className="hint">Cargando…</p>}>
          <CrearConCancion client={client} publicacion={publicacion} onCreado={onCreado} onCancelar={onCancelar} />
        </Suspense>
      </section>
    );
  }

  return (
    <section className="va-crear" aria-labelledby={`${ids}-t`}>
      <h3 id={`${ids}-t`}>Video nuevo</h3>
      {formas}
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
      <SelectorEstructura uso="voz" value={estructuraId} onChange={setEstructuraId} disabled={ocupado} sencilla />
      <SelectorEstiloVideo client={client} uso="voz" value={estiloId} onChange={escogerEstilo} disabled={ocupado} />
      <label className="va-check">
        <input type="checkbox" checked={conFondos || fondosDelEstilo} disabled={ocupado || fondosDelEstilo} onChange={(e) => setConFondos(e.target.checked)} />
        {fondosDelEstilo ? "Con imágenes de fondo (lo pide el estilo; el director las crea después de guardar, con su costo)" : "Con imágenes de fondo (una por sección, en el estilo del kit; el director las crea después de guardar, con su costo)"}
      </label>
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
