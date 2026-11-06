// ============================================================
// «Con tu canción» de «Video nuevo» (lazy: el chunk de VideoAnimado está cerca de su tope)
//
// La agencia sube el MP3 TERMINADO de una canción (voz e instrumental; el fragmento del reel ya recortado, hasta 3 min) a
// la biblioteca de sonido —o escoge una que ya esté, del cliente o de la agencia—, pega su letra y escoge el formato.
// «Sincronizar la letra» pregunta el costo (409, no crea nada) y sólo con el segundo toque lo paga: ElevenLabs alinea la
// letra con la canción (y aísla la voz si la música la tapa) o Gemini la oye. El resultado enseña cada línea con su
// tiempo, de dónde salió, la coincidencia (con un aviso si es baja) y el AJUSTE FINO (±1,5 s, gratis). Luego «Prueba de
// sincronía (gratis)» o «Diseñar las escenas con IA»: los dos crean el borrador con la canción como su locución y lo
// abren. No se genera voz.
// ============================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { listarCanciones, sincronizarCancion, crearVideoConCancion } from "../lib/cancionApi";
import { subirSonido } from "../lib/sonidosApi";
import { limpiarLetra, MAX_LETRA, DESPLAZAMIENTO_MAX, MAX_SEGUNDOS_CANCION, MAX_BYTES_CANCION, COINCIDENCIA_MINIMA } from "../lib/videoCancion";
import { publicacionesParaVideo } from "../lib/renderVideo";
import { fmtDate } from "../utils";

const FORMATOS = [["9:16", "Vertical 9:16"], ["1:1", "Cuadrado 1:1"], ["16:9", "Horizontal 16:9"]];
const ACEPTA = "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a";
const dinero = (n) => (n < 0.01 ? "menos de 1 ¢" : `${Number(n).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} $`);
const mmss = (s) => { const n = Math.max(0, Number(s) || 0); return `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, "0")}`; };

export default function CrearConCancion({ client, publicacion = null, onCreado, onCancelar }) {
  const ids = useId();
  const [canciones, setCanciones] = useState(null);
  const [musicaId, setMusicaId] = useState("");
  const [letra, setLetra] = useState("");
  const [formato, setFormato] = useState("9:16");
  const [titulo, setTitulo] = useState("");
  const opciones = useMemo(() => publicacionesParaVideo(client.calendars ?? [], { hoy: fmtDate(new Date()), ligada: publicacion?.postId ?? null }), [client.calendars, publicacion?.postId]);
  const [postId, setPostId] = useState(publicacion?.postId ?? "");
  const [precio, setPrecio] = useState(null);
  const [sincronia, setSincronia] = useState(null);
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const archivoRef = useRef(null);

  const cargar = useCallback(async (escoger = "") => {
    try {
      const lista = await listarCanciones(client.id);
      setCanciones(lista);
      setMusicaId((actual) => escoger || actual || lista[0]?.id || "");
    } catch (e) { setError(e.message); setCanciones([]); }
  }, [client.id]);
  useEffect(() => { cargar(); }, [cargar]);

  // Otra canción u otra letra: el precio y la sincronía de antes ya no valen.
  useEffect(() => { setPrecio(null); setSincronia(null); setDesplazamiento(0); }, [musicaId, letra]);

  const escogida = canciones?.find((c) => c.id === musicaId) ?? null;
  const delCliente = (canciones ?? []).filter((c) => c.de !== "agencia");
  const deAgencia = (canciones ?? []).filter((c) => c.de === "agencia");
  const limpia = useMemo(() => (letra.trim() ? limpiarLetra(letra) : null), [letra]);
  const larga = escogida?.duracion && escogida.duracion > MAX_SEGUNDOS_CANCION + 0.5;

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (archivo.size > MAX_BYTES_CANCION) { setError("La canción pesa más de 15 MB: sube sólo el fragmento del reel."); return; }
    setOcupado("subir"); setError(""); setAviso("");
    try {
      const r = await subirSonido(client.id, archivo, { categoria: "musica" });
      setAviso(r.repetido ? "Esa canción ya estaba en la biblioteca: la escogí." : `Subida a la biblioteca de ${client.name}.`);
      await cargar(r.pista?.id ?? "");
    } catch (err) { setError(err.message); } finally { setOcupado(""); }
  };

  const sincronizar = async (confirmado) => {
    setOcupado("sincronizar"); setError(""); setAviso("");
    try {
      const r = await sincronizarCancion(client.id, { musicaId, letra, confirmado });
      if (r.confirmar) { setPrecio(r.confirmar); return; }
      setPrecio(null);
      setSincronia(r.sincronia);
      if (r.repetida) setAviso("Esta canción con esta letra ya estaba sincronizada: no costó nada.");
    } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };

  const crear = async (modo) => {
    setOcupado(modo); setError("");
    try {
      const destino = opciones.find((o) => o.postId === postId);
      const r = await crearVideoConCancion(client.id, {
        huella: sincronia.huella, modo, formato, titulo, postId, calendarId: destino?.calendarId ?? publicacion?.calendarId ?? "", desplazamiento,
      });
      const partes = [
        modo === "ia" ? "Escenas diseñadas por la IA sobre la letra." : "Prueba de sincronía creada: una escena por línea.",
        r.corregido ? "La IA corrigió su primer intento para que la letra fuera tal cual." : "",
        r.aviso || "",
        "Revísala en la vista previa (suena con la canción) y apruébala: la canción ya es su locución.",
      ];
      onCreado(r.video, partes.filter(Boolean).join(" "));
    } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };

  // Las líneas con el ajuste fino aplicado (lo mismo que hará el servidor al crear: se mueve todo junto).
  const lineas = useMemo(() => (sincronia?.lineas ?? []).map((l) => ({
    ...l, desde: Math.min(sincronia.duracion, Math.max(0, l.desde + desplazamiento)), hasta: Math.min(sincronia.duracion, Math.max(0, l.hasta + desplazamiento)),
  })), [sincronia, desplazamiento]);

  return (
    <div className="va-cancion">
      <p className="hint">Sube la canción YA TERMINADA (voz e instrumental mezclados, sólo el fragmento del reel, hasta 3 minutos) y pega su letra tal cual se canta. No se genera voz: la canción es el audio y la letra sale palabra por palabra, sincronizada.</p>

      <label htmlFor={`${ids}-cancion`}>La canción</label>
      <div className="va-cancion-fila">
        <select id={`${ids}-cancion`} className="input" value={musicaId} onChange={(e) => setMusicaId(e.target.value)} disabled={canciones === null || Boolean(ocupado)}>
          {canciones === null && <option value="">Cargando…</option>}
          {canciones?.length === 0 && <option value="">No hay canciones: súbela</option>}
          {delCliente.length > 0 && (
            <optgroup label={`De ${client.name}`}>
              {delCliente.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.duracion ? ` · ${mmss(c.duracion)}` : ""}</option>)}
            </optgroup>
          )}
          {deAgencia.length > 0 && (
            <optgroup label="De la agencia">
              {deAgencia.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.duracion ? ` · ${mmss(c.duracion)}` : ""}</option>)}
            </optgroup>
          )}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado)} onClick={() => archivoRef.current?.click()}>
          <Icon name="upload" /> {ocupado === "subir" ? "Subiendo…" : "Subir una"}
        </button>
        <input ref={archivoRef} type="file" accept={ACEPTA} hidden onChange={subir} aria-label="Subir una canción (MP3, WAV o M4A, hasta 15 MB)" />
      </div>
      {escogida && <audio controls preload="none" src={escogida.src} className="va-cancion-audio" aria-label={`Escuchar ${escogida.nombre}`} />}
      {larga && <p className="va-msg va-error" role="alert">Dura {mmss(escogida.duracion)}: el video admite 3 minutos. Sube sólo el fragmento del reel.</p>}

      <label htmlFor={`${ids}-letra`}>La letra (tal cual se canta, un renglón por línea; las marcas «[Coro]» se quitan solas)</label>
      <textarea id={`${ids}-letra`} className="input" rows={8} maxLength={MAX_LETRA} value={letra} onChange={(e) => setLetra(e.target.value)} disabled={Boolean(ocupado)}
        placeholder={"[Coro]\nToallitas suaves para tu bebé\nsin alcohol y sin perfume"} />
      {limpia?.error && letra.trim() && <p className="hint">{limpia.error}</p>}
      {limpia && !limpia.error && <p className="hint">{limpia.lineas.length} línea{limpia.lineas.length === 1 ? "" : "s"}, {limpia.palabras} palabras.{limpia.avisos.length ? ` ${limpia.avisos.join(" ")}` : ""}</p>}

      <fieldset className="va-opciones">
        <legend>Formato</legend>
        {FORMATOS.map(([f, nombre]) => (
          <button key={f} type="button" className="filter-chip" aria-pressed={formato === f} onClick={() => setFormato(f)}>{nombre}</button>
        ))}
      </fieldset>
      <label htmlFor={`${ids}-titulo`}>Título del video (opcional)</label>
      <input id={`${ids}-titulo`} className="input" maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={escogida?.nombre ?? ""} />
      <label htmlFor={`${ids}-post`}>Va en una publicación (opcional: el mp4 se pondrá en ella)</label>
      <select id={`${ids}-post`} className="input" value={postId} onChange={(e) => setPostId(e.target.value)}>
        <option value="">Ninguna</option>
        {opciones.map((o) => <option key={o.postId} value={o.postId}>{o.etiqueta}</option>)}
        {publicacion?.postId && !opciones.some((o) => o.postId === publicacion.postId) && <option value={publicacion.postId}>La publicación abierta</option>}
      </select>

      {!sincronia && (
        <div className="va-acciones">
          {precio ? (
            <>
              <button type="button" className="btn btn-accent" disabled={Boolean(ocupado)} onClick={() => sincronizar(true)}>
                <Icon name="music" /> {ocupado === "sincronizar" ? "Sincronizando… (hasta un par de minutos)" : `Sincronizar por unos ${dinero(precio.minimo ?? precio.costo)}`}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={() => setPrecio(null)}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" disabled={Boolean(ocupado) || !musicaId || !limpia || Boolean(limpia.error) || larga} onClick={() => sincronizar(false)}>
              <Icon name="music" /> {ocupado === "sincronizar" ? "Calculando…" : "Sincronizar la letra (ver el costo)"}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={onCancelar}>Cancelar</button>
        </div>
      )}
      {precio && <p className="va-msg" role="status">{precio.error}</p>}

      {sincronia && (
        <section className="va-cancion-sincronia" aria-labelledby={`${ids}-sinc`}>
          <h4 id={`${ids}-sinc`}>Letra sincronizada</h4>
          <p className="hint">
            {sincronia.nombreFuente} · se encontró el {Math.round(sincronia.coincidencia * 100)} % · {mmss(sincronia.duracion)} de canción
          </p>
          {sincronia.coincidencia < COINCIDENCIA_MINIMA && (
            <p className="va-msg va-error" role="alert">
              La letra no se encontró bien en la canción: revisa la prueba de sincronía y, si todo va adelantado o atrasado, el ajuste fino. Comprueba que la letra sea exactamente la del fragmento.
            </p>
          )}
          {(sincronia.avisos ?? []).map((a) => <p key={a} className="hint">{a}</p>)}
          <ol className="va-cancion-lineas" aria-label="Las líneas con su tiempo">
            {lineas.map((l, i) => (
              <li key={`${i}-${l.texto}`} className={l.coro ? "va-cancion-coro" : undefined}>
                <span className="va-cancion-t">{mmss(l.desde)}</span>
                <span>{l.texto}{l.coro ? <span className="va-cancion-etiqueta"> · coro</span> : null}</span>
              </li>
            ))}
          </ol>
          <label htmlFor={`${ids}-ajuste`}>
            Ajuste fino: {desplazamiento > 0 ? "+" : ""}{desplazamiento.toFixed(2).replace(".", ",")} s
            <span className="hint"> (si la letra sale antes que la voz, muévelo a la derecha; gratis)</span>
          </label>
          <input id={`${ids}-ajuste`} type="range" className="va-cancion-ajuste" min={-DESPLAZAMIENTO_MAX} max={DESPLAZAMIENTO_MAX} step={0.05} value={desplazamiento}
            onChange={(e) => setDesplazamiento(Number(e.target.value))} disabled={Boolean(ocupado)} />
          <div className="va-acciones">
            <button type="button" className="btn btn-primary" disabled={Boolean(ocupado)} onClick={() => crear("karaoke")}>
              <Icon name="play" /> {ocupado === "karaoke" ? "Creando…" : "Prueba de sincronía (gratis)"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={Boolean(ocupado)} onClick={() => crear("ia")}>
              <Icon name="sparkles" /> {ocupado === "ia" ? "Diseñando… (hasta un minuto)" : "Diseñar las escenas con IA"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={onCancelar}>Cancelar</button>
          </div>
        </section>
      )}
      {aviso && <p className="va-msg" role="status">{aviso}</p>}
      {error && <p className="va-msg va-error" role="alert">{error}</p>}
    </div>
  );
}
