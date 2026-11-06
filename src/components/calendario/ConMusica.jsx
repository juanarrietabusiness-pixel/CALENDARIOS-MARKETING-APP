import { useEffect, useId, useMemo, useState } from "react";
import Icon from "../Icon";
import { mediosDe } from "../../lib/publicacion";
import {
  puedeConMusica, esCarruselParaMusica, fotoDe, postConMusica, volverALaFoto, musicaPorDefecto,
  DURACIONES_FOTO, DURACION_FOTO, MOVIMIENTOS_FOTO, MOVIMIENTO_FOTO, FRASE_COSTO,
} from "../../lib/conMusica";
import { cancionSugerida, ultimaCancionUsada, cancionParaGuardar, textoDeCancion, limpiarCanciones } from "../../lib/cancionesInstagram";
import { musicasDelCliente, pedirConMusica, leerVideoConMusica, medioDelVideo } from "../../lib/conMusicaApi";
import { navegar } from "../../lib/rutas";

// ============================================================
// «Publicar con música» en la pestaña Pieza del panel de una publicación (lazy)
//
// La API de Instagram no deja poner su música en fotos ni en carruseles. Dos caminos:
//   · un POST DE UNA FOTO → «Publicar con música»: la pista (la favorita del cliente o la de la marca, con «Escuchar»),
//     la duración (7, 10 o 15 s) y el movimiento; el servidor hace un video animado de una escena y lo renderiza (no
//     gasta IA). Al terminar, la publicación es un reel con el mp4 y la foto de portada, y se ve y se oye aquí antes de
//     programarla. «Volver a la foto» lo deshace (el mp4 se queda en la galería).
//   · un CARRUSEL → «Con música de Instagram»: se marca «La publico yo» con la canción sugerida de la lista del cliente
//     (Marca → Kit y voz); a su hora llega el aviso con la pantalla del teléfono.
//
// El servidor pone el reel SOLO en la publicación; el panel abierto lo pone también en su formulario en cuanto se entera
// (el aviso `videos` y, de respaldo, mirar cada pocos segundos): si no, su guardado al cerrar pisaría el reel. Lo que se
// está haciendo va en la publicación (`conMusicaPendiente`), no en el componente: lo sigue la pestaña que esté abierta.
// ============================================================

const leerKit = (k) => {
  if (!k) return {};
  if (typeof k === "object") return k;
  try { return JSON.parse(k) ?? {}; } catch { return {}; }
};
const MIRAR_CADA_MS = 3000;
const MIRAR_HASTA_MS = 5 * 60_000;

/** Un grupo de opciones como botones de radio (los mismos «segmented» de «¿Cuándo sale?»). */
function Opciones({ etiqueta, opciones, valor, onCambiar, deshabilitado }) {
  return (
    <div className="field">
      <span className="label">{etiqueta}</span>
      <div className="segmented" role="radiogroup" aria-label={etiqueta}>
        {opciones.map(([k, nombre]) => (
          <button key={k} type="button" role="radio" aria-checked={valor === k} className={`segmented-btn ${valor === k ? "active" : ""}`}
            onClick={() => onCambiar(k)} disabled={deshabilitado}>
            {nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Sigue el render del reel con música que la publicación tiene PENDIENTE (`post.conMusicaPendiente`: { videoId, foto }):
 * el aviso `videos` del servidor y, de respaldo, una mirada cada pocos segundos. Al salir, pone el reel en el formulario
 * (el servidor ya lo puso en el calendario; si no, el guardado del panel al cerrar lo pisaría). El encargo vive en la
 * publicación y no en el componente: pasar de Pieza a Publicar, o cerrar y volver a abrir el panel, lo sigue igual.
 * → { mensaje, setMensaje }.
 */
function useSeguirReel({ post, setForm, clientId }) {
  const pendiente = post?.conMusicaPendiente ?? null;
  const videoId = pendiente?.videoId ?? "";
  const foto = pendiente?.foto ?? "";
  const [mensaje, setMensaje] = useState(null);
  useEffect(() => {
    if (!videoId || !clientId) return undefined;
    let vivo = true;
    let espera = null;
    const desde = Date.now();
    const quitar = (p) => {
      if (p?.conMusicaPendiente?.videoId !== videoId) return p;
      const { conMusicaPendiente, ...resto } = p;
      void conMusicaPendiente;
      return resto;
    };
    const mirar = async () => {
      if (!vivo) return;
      let v;
      try { v = await leerVideoConMusica(clientId, videoId); } catch (e) { v = e?.estado === 404 ? { estado: "borrado" } : null; }
      if (!vivo) return;
      if (v?.estado === "renderizado") {
        const medio = medioDelVideo(v);
        setForm((p) => (medio ? postConMusica(quitar(p), medio, { videoId, foto, ahora: new Date().toISOString() }) : null) ?? quitar(p));
        setMensaje({ ok: true, texto: v.render?.aviso || "Listo: ahora es un reel con la foto de portada. Míralo y óyelo antes de programarlo (también en la vista previa de Publicar)." });
        return;
      }
      if (v?.estado === "fallido" || v?.estado === "borrado") {
        setForm(quitar);
        setMensaje({ ok: false, texto: v.estado === "borrado" ? "El video ya no está: vuelve a pedirlo." : `No salió el video: ${String(v.render?.error || "el render falló").replace(/[.\s]+$/, "")}. Vuelve a intentarlo.` });
        return;
      }
      // Pasado un rato se deja de mirar desde aquí: sigue en el servidor y se pone solo (otra vez que se abra, se mira).
      if (Date.now() - desde > MIRAR_HASTA_MS) return;
      espera = setTimeout(mirar, MIRAR_CADA_MS);
    };
    const alAviso = (e) => {
      if (e.detail?.id && e.detail.id !== videoId) return;
      clearTimeout(espera);
      void mirar();
    };
    window.addEventListener("videos", alAviso);
    void mirar();
    return () => { vivo = false; clearTimeout(espera); window.removeEventListener("videos", alAviso); };
  }, [videoId, foto, clientId, setForm]);
  return { mensaje, setMensaje };
}

/** El reel con música de un post de UNA foto (o, si ya lo es, cambiarlo o volver a la foto). */
function ReelConMusica({ post, setForm, client, clientId, cal, onError, kit }) {
  const ids = useId();
  const yaEs = Boolean(post.conMusica?.foto?.src);
  const haciendo = Boolean(post.conMusicaPendiente?.videoId);
  const [abierto, setAbierto] = useState(false);
  const [musicas, setMusicas] = useState(null);
  const [musicaId, setMusicaId] = useState("");
  const [segundos, setSegundos] = useState(DURACION_FOTO);
  const [movimiento, setMovimiento] = useState(MOVIMIENTO_FOTO);
  const [logo, setLogo] = useState(kit.logoModo === "estampado" && Boolean(kit.logo));
  const [pidiendo, setPidiendo] = useState(false);
  const { mensaje, setMensaje } = useSeguirReel({ post, setForm, clientId });

  // Las músicas, al abrir las opciones (una vez).
  useEffect(() => {
    if (!abierto || musicas || !clientId) return undefined;
    let vivo = true;
    musicasDelCliente(clientId).then((lista) => {
      if (!vivo) return;
      setMusicas(lista);
      setMusicaId((actual) => actual || musicaPorDefecto(lista, kit)?.id || "");
    }).catch(() => vivo && setMusicas([]));
    return () => { vivo = false; };
  }, [abierto, musicas, clientId, kit]);

  const pedirlo = async () => {
    if (!cal || !post.id) { onError?.("Guarda primero la publicación en su día."); return; }
    const foto = fotoDe(post)?.src ?? "";
    setPidiendo(true);
    setMensaje(null);
    try {
      const r = await pedirConMusica(clientId, {
        postId: post.id, calendarId: cal.dbId || cal.id, musicaId, segundos, movimiento, ...(kit.logo ? { logo } : {}),
      });
      // Lo pendiente va EN la publicación: lo sigue quien tenga el panel abierto, en cualquier pestaña.
      setForm((p) => ({ ...p, conMusicaPendiente: { videoId: r.video.id, foto } }));
      setMensaje({ ok: true, texto: `Haciendo el video con «${r.musica?.nombre ?? "la música"}»: tarda menos de un minuto. ${FRASE_COSTO} Puedes cerrar: se pone solo en la publicación.` });
      setAbierto(false);
    } catch (e) {
      setMensaje({ ok: false, texto: e.datos?.codigo === "sin_container" ? "Aquí no se puede hacer el video (en local no hay Container): pruébalo en el sitio publicado." : e.message });
    }
    setPidiendo(false);
  };

  const video = yaEs ? mediosDe(post).find((m) => m.tipo === "video") : null;
  const ocupado = pidiendo || haciendo;
  const escogida = musicas?.find((m) => m.id === musicaId) ?? null;

  return (
    <section className="card con-musica" aria-labelledby={`${ids}-titulo`} style={{ display: "grid", gap: "var(--sp-2)", padding: "var(--sp-3)" }}>
      <h3 id={`${ids}-titulo`} className="label" style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
        <Icon name="music" size={18} /> {yaEs ? "Es un reel con música" : "Publicar con música"}
      </h3>
      {!yaEs && (
        <p className="hint" style={{ margin: 0 }}>
          Instagram no deja poner su música en una foto: la foto pasa a un reel corto con movimiento suave y una música del
          cliente, que sale como «audio original». No gasta IA.
        </p>
      )}
      {yaEs && video && <video src={video.src} controls playsInline preload="metadata" style={{ width: "100%", maxWidth: 260, borderRadius: "var(--radius-sm)" }} aria-label="El reel con música" />}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        <button type="button" className={yaEs ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"} aria-expanded={abierto} aria-controls={`${ids}-opciones`}
          onClick={() => setAbierto((v) => !v)} disabled={ocupado}>
          <Icon name="music" size={16} /> {abierto ? "Cerrar las opciones" : yaEs ? "Cambiar la música o el movimiento" : "Escoger la música…"}
        </button>
        {yaEs && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado}
            onClick={() => { setForm((p) => volverALaFoto(p, new Date().toISOString())); setMensaje({ ok: true, texto: "Vuelve a ser la foto. El video sigue en la galería." }); }}>
            <Icon name="undo" size={16} /> Volver a la foto
          </button>
        )}
      </div>

      <div id={`${ids}-opciones`} hidden={!abierto} style={{ display: abierto ? "grid" : undefined, gap: "var(--sp-2)" }}>
        <div className="field">
          <label className="label" htmlFor={`${ids}-musica`}>Música</label>
          {musicas === null ? <p role="status" className="hint">Cargando las músicas…</p>
            : !musicas.length ? (
              <p className="hint">
                {client?.name ?? "Este cliente"} no tiene música en su galería: súbela (MP3 o WAV con derechos) o genérala en «Sonido»
                de un video animado (Más formas → Video animado).
              </p>
            ) : (
              <>
                <select id={`${ids}-musica`} className="input" value={musicaId} onChange={(e) => setMusicaId(e.target.value)} disabled={ocupado}>
                  {musicas.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.favorita || m.favorito ? " (favorita)" : ""}</option>)}
                </select>
                {escogida?.src && (
                  <audio key={escogida.id} src={escogida.src} controls preload="none" style={{ width: "100%" }} aria-label={`Escuchar «${escogida.nombre}»`} />
                )}
              </>
            )}
        </div>
        <Opciones etiqueta="Duración" opciones={DURACIONES_FOTO.map((x) => [x, `${x} s`])} valor={segundos} onCambiar={setSegundos} deshabilitado={ocupado} />
        <Opciones etiqueta="Movimiento de la foto" opciones={MOVIMIENTOS_FOTO.map((m) => [m.id, m.nombre])} valor={movimiento} onCambiar={setMovimiento} deshabilitado={ocupado} />
        {kit.logo && (
          <label style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
            <input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} disabled={ocupado} />
            <span>El logo del kit encima <span className="hint">(desmárcalo si la foto ya lo lleva)</span></span>
          </label>
        )}
        <p className="hint" style={{ margin: 0 }}><Icon name="info" size={13} /> {FRASE_COSTO}</p>
        <div>
          <button type="button" className="btn btn-primary" onClick={pedirlo} disabled={ocupado || !musicaId} aria-busy={pidiendo || undefined}>
            <Icon name="video" size={16} /> {pidiendo ? "Pidiéndolo…" : yaEs ? "Hacerlo otra vez así" : "Hacer el reel con música"}
          </button>
        </div>
      </div>

      <div role="status" aria-live="polite">
        {haciendo && <p className="hint" style={{ margin: 0 }}><Icon name="clock" size={13} /> Haciendo el video en el servidor…</p>}
        {mensaje && <p className={mensaje.ok ? "hint" : "notice notice-error"} style={{ margin: 0 }}>{mensaje.texto}</p>}
      </div>
    </section>
  );
}

/** En la pestaña Publicar, sólo el estado del reel que se está haciendo (y lo sigue: ver `useSeguirReel`). */
function ReelPendiente({ post, setForm, clientId }) {
  const { mensaje } = useSeguirReel({ post, setForm, clientId });
  return (
    <div role="status" aria-live="polite">
      {post.conMusicaPendiente?.videoId && <p className="hint" style={{ margin: 0 }}><Icon name="music" size={13} /> Haciendo el reel con música en el servidor: cuando salga, la vista previa lo enseña.</p>}
      {mensaje && <p className={mensaje.ok ? "hint" : "notice notice-error"} style={{ margin: 0 }}>{mensaje.texto}</p>}
    </div>
  );
}

/** Un carrusel A MANO con la música de Instagram: la marca «La publico yo» y la canción sugerida. */
function CarruselConMusica({ post, setForm, client, kit, enlaceAMano, onIrA, filas = [], onCancelar = null }) {
  const ids = useId();
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState("");
  const canciones = useMemo(() => limpiarCanciones(kit.musica?.cancionesInstagram), [kit]);
  const ultima = useMemo(() => ultimaCancionUsada(client, post.id), [client, post.id]);
  const marcado = Boolean(post.asistida && post.conMusicaInstagram);
  const cancion = cancionSugerida(canciones, { ultima, actual: post.cancionInstagram });

  const marcar = async () => {
    const c = cancionSugerida(canciones, { ultima, actual: post.cancionInstagram });
    const ahora = new Date().toISOString();
    setForm((p) => ({
      ...p, asistida: true, conMusicaInstagram: true,
      notaAsistida: String(p.notaAsistida ?? "").trim() || `Música de Instagram${c ? `: «${textoDeCancion(c)}»` : ""}`,
      ...(c && !p.cancionInstagram?.nombre ? { cancionInstagram: cancionParaGuardar(c, ahora) } : {}),
    }));
    // Lo que ya estaba en la cola saldría solo, SIN la música: se saca (como «La publico yo» de «¿Cuándo sale?»).
    const programadas = filas.filter((f) => f.postId === post.id && f.estado === "programada");
    if (!programadas.length) { setAviso(""); return; }
    if (!onCancelar) { setAviso("Estaba programada: en Publicar, «Guardar para publicar a mano» la saca de la cola."); return; }
    try {
      for (const f of programadas) await onCancelar(f.id);
      setAviso("Estaba programada: se sacó de la cola para que no salga sola sin la música.");
    } catch (e) {
      setAviso(`No se pudo sacar de la cola: ${e.message}. Hazlo en Publicar.`);
    }
  };
  const otra = () => {
    const c = cancionSugerida(canciones, { ultima, actual: post.cancionInstagram, otra: true });
    if (!c) return;
    setForm((p) => {
      const nota = String(p.notaAsistida ?? "");
      const deLaCancion = !nota.trim() || /^Música de Instagram/.test(nota);
      return { ...p, cancionInstagram: cancionParaGuardar(c, new Date().toISOString()), ...(deLaCancion ? { notaAsistida: `Música de Instagram: «${textoDeCancion(c)}»` } : {}) };
    });
  };
  const copiar = () => {
    if (!cancion) return;
    navigator.clipboard?.writeText(textoDeCancion(cancion)).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }).catch(() => {});
  };

  return (
    <section className="card con-musica" aria-labelledby={`${ids}-titulo`} style={{ display: "grid", gap: "var(--sp-2)", padding: "var(--sp-3)" }}>
      <h3 id={`${ids}-titulo`} className="label" style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
        <Icon name="music" size={18} /> Con música de Instagram
      </h3>
      {!marcado ? (
        <>
          <p className="hint" style={{ margin: 0 }}>
            Instagram no deja poner su música en un carrusel por la API: se publica desde el teléfono en un minuto. A su hora
            llega un aviso con las imágenes en orden, el texto para copiar y una canción sugerida.
          </p>
          <div>
            <button type="button" className="btn btn-primary btn-sm" onClick={marcar}>
              <Icon name="photo" size={16} /> Publicarlo a mano con música
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>Se publica a mano con la música de Instagram (en Publicar, «La publico yo»).</p>
          {cancion ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", alignItems: "center" }}>
              <span><strong>Canción sugerida:</strong> {textoDeCancion(cancion)}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={copiar}><Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiado" : "Copiar"}</button>
              {canciones.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={otra}><Icon name="refresh" size={14} /> Otra canción</button>}
            </div>
          ) : (
            <p className="hint" style={{ margin: 0 }}>Sin lista de canciones de Instagram para {client?.name ?? "este cliente"}: escríbela en Marca → Kit y voz.</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
            {enlaceAMano && (
              <a className="btn btn-secondary btn-sm" href={enlaceAMano} onClick={(e) => { e.preventDefault(); navegar(enlaceAMano); }}>
                <Icon name="external" size={14} /> La pantalla del teléfono
              </a>
            )}
            {onIrA && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onIrA("salida")}>Siguiente: ¿cuándo sale? <Icon name="chevronRight" size={14} /></button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((p) => ({ ...p, asistida: false, conMusicaInstagram: false }))}>Ya no a mano</button>
          </div>
        </>
      )}
      <div role="status" aria-live="polite">{aviso && <p className="hint" style={{ margin: 0 }}>{aviso}</p>}</div>
    </section>
  );
}

/**
 * @param compacto  en la pestaña Publicar: sólo el estado (y seguir) del reel que se está haciendo.
 */
export default function ConMusica({ post, setForm, client, clientId, cal = null, onError, enlaceAMano = null, onIrA = null, compacto = false, filas = [], onCancelar = null }) {
  const kit = useMemo(() => leerKit(client?.kitMarca), [client?.kitMarca]);
  if (!clientId || !post) return null;
  if (compacto) return post.conMusicaPendiente?.videoId ? <ReelPendiente post={post} setForm={setForm} clientId={clientId} /> : null;
  if (esCarruselParaMusica(post)) {
    return <CarruselConMusica post={post} setForm={setForm} client={client} kit={kit} enlaceAMano={enlaceAMano} onIrA={onIrA} filas={filas} onCancelar={onCancelar} />;
  }
  if (!puedeConMusica(post).ok) return null;
  return <ReelConMusica post={post} setForm={setForm} client={client} clientId={clientId} cal={cal} onError={onError} kit={kit} />;
}
