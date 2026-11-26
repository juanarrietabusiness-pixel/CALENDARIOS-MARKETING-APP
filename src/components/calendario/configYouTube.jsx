// ============================================================
// «Configuración de YouTube» de una publicación (`post.youtube`): sólo aparece cuando YouTube está en «¿Qué sale y
// dónde?» (seccionPublicar.jsx la carga en diferido). Lo vacío vale lo de siempre: el título es la primera línea del
// texto, la descripción el mismo texto, las etiquetas los hashtags, la categoría la automática (Música si es una canción)
// y la privacidad la del canal. Lo que se escribe aquí lo lee el publicador (worker/lib/publicador.js) al subirlo.
//
// Lo que YouTube deja y aquí NO está, y por qué (se dice en la pantalla): las COLABORACIONES (no hay API para invitar a
// otro canal: se menciona con @ en la descripción), el idioma, la ubicación, la licencia y «notificar a los suscriptores»
// (PostPeer no los manda). «Hecho para niños» va siempre en «No».
// ============================================================

import { useEffect, useId, useMemo, useState, lazy, Suspense } from "react";
import Icon from "../Icon";
import FilaInterruptor from "../Interruptor";
import {
  LIMITES, CATEGORIAS_YOUTUBE, PRIVACIDADES_YOUTUBE_POST, tituloYouTube, descripcionYouTube, etiquetasYouTube, bytesDe,
  huecosSinLlenar, esShortYouTube, miniaturaYouTube, textoPara,
} from "../../lib/publicacion";
import { listasYouTube, youtubeDelVideo } from "../../lib/youtube";

const GaleriaSelector = lazy(() => import("../GaleriaSelector"));

/** Un campo de `post.youtube` cambiado (vacío: fuera). Se guarda TAL CUAL se escribe: el publicador lo limpia. */
function conCampo(post, campo, valor) {
  const y = { ...(post.youtube ?? {}) };
  const vacio = valor === undefined || valor === null || valor === "" || valor === false || (Array.isArray(valor) && !valor.length);
  if (vacio) delete y[campo]; else y[campo] = valor;
  return { ...post, youtube: Object.keys(y).length ? y : undefined };
}

function Contador({ valor, maximo, etiqueta }) {
  const pasa = valor > maximo;
  return (
    <span className="contador" data-pasa={pasa || undefined} aria-label={`${etiqueta}: ${valor} de ${maximo}`}>
      {valor}/{maximo}
    </span>
  );
}

export default function ConfigYouTube({ post, setForm, clientId, via = null, onError }) {
  const ids = useId();
  const y = post.youtube ?? {};
  const set = (campo, valor) => setForm((p) => conCampo(p, campo, valor));
  // `mediosDe` normaliza y se deja la marca del video animado: se lee de los medios tal cual.
  const videoAnimado = (Array.isArray(post.medios) ? post.medios : []).find((m) => m?.videoAnimado)?.videoAnimado ?? null;
  const short = esShortYouTube(post);

  // La descripción: «el mismo texto» o una propia. Lo escrito se recuerda al volver a «el mismo texto» (por si fue sin querer).
  const [propia, setPropia] = useState(Boolean(y.descripcion));
  const [guardada, setGuardada] = useState(y.descripcion ?? "");
  const [antesDeArmar, setAntesDeArmar] = useState(null);
  const [etiquetasTexto, setEtiquetasTexto] = useState((y.etiquetas ?? []).join(", "));
  const [ocupado, setOcupado] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [galeria, setGaleria] = useState(false);
  const [listas, setListas] = useState(null);

  // Las listas del canal: al abrir (por PostPeer; con Google, la nota de por qué no).
  useEffect(() => {
    if (!clientId) return undefined;
    let vivo = true;
    listasYouTube(clientId)
      .then((r) => { if (vivo) setListas(r ?? { listas: [] }); })
      .catch((e) => { if (vivo) setListas({ listas: [], nota: e?.message || "No se pudieron leer las listas del canal." }); });
    return () => { vivo = false; };
  }, [clientId]);

  const primeraLinea = useMemo(() => tituloYouTube({ ...post, youtube: undefined }), [post]);
  const bytes = bytesDe(descripcionYouTube(post));
  const largoEtiquetas = etiquetasYouTube(post).map((t) => (t.includes(" ") ? `"${t}"` : t)).join(",").length;
  const huecos = huecosSinLlenar(`${tituloYouTube(post)}\n${descripcionYouTube(post)}\n${y.primerComentario ?? ""}`);
  const miniatura = miniaturaYouTube(post);
  const porGoogle = via === "google" || listas?.via === "google";

  function elegirDescripcion(conPropia) {
    setPropia(conPropia);
    if (conPropia) set("descripcion", guardada || textoPara(post, "youtube"));
    else { setGuardada(y.descripcion ?? guardada); set("descripcion", ""); }
  }

  async function armar() {
    if (!videoAnimado || !clientId) return;
    setOcupado("armar");
    setAvisos([]);
    try {
      const r = await youtubeDelVideo(clientId, videoAnimado, { titulo: y.titulo || primeraLinea });
      setAntesDeArmar({ descripcion: y.descripcion ?? "", propia });
      setPropia(true);
      setForm((p) => {
        let q = conCampo(p, "descripcion", r.descripcion);
        if (!p.youtube?.categoria && r.categoria) q = conCampo(q, "categoria", r.categoria);
        return q;
      });
      setAvisos(r.avisos ?? []);
    } catch (e) {
      onError?.(e?.message || "No se pudo armar la descripción del video.");
    } finally {
      setOcupado("");
    }
  }

  function deshacerArmado() {
    if (!antesDeArmar) return;
    setPropia(antesDeArmar.propia);
    set("descripcion", antesDeArmar.propia ? antesDeArmar.descripcion : "");
    setAntesDeArmar(null);
  }

  async function crearMiniatura() {
    if (!videoAnimado || !clientId) return;
    setOcupado("miniatura");
    setAvisos([]);
    try {
      const r = await youtubeDelVideo(clientId, videoAnimado, { titulo: y.titulo || primeraLinea, miniatura: true });
      if (r.miniatura) set("miniatura", r.miniatura);
      setAvisos((r.avisos ?? []).filter((a) => !a.startsWith("Sin capítulos")));
    } catch (e) {
      onError?.(e?.message || "No se pudo crear la miniatura.");
    } finally {
      setOcupado("");
    }
  }

  function elegirDeGaleria(archivos) {
    setGaleria(false);
    const a = archivos?.[0];
    if (!a?.src) return;
    set("miniatura", a.src);
    const avisos = [];
    if (a.ancho && a.alto && Math.abs(a.ancho / a.alto - 16 / 9) > 0.03) avisos.push(`Esa imagen mide ${a.ancho}×${a.alto}: la miniatura de YouTube es de 16:9 (1280×720) y se recortará.`);
    else if (a.ancho && a.ancho < 640) avisos.push(`Esa imagen mide ${a.ancho} px de ancho: YouTube pide al menos 640 (mejor 1280).`);
    setAvisos(avisos);
  }

  function elegirLista(id) {
    const l = (listas?.listas ?? []).find((x) => x.id === id);
    setForm((p) => conCampo(conCampo(p, "playlistId", l?.id ?? ""), "playlist", l?.titulo ?? ""));
  }

  return (
    <div className="config-youtube">
      <p className="hint" style={{ marginTop: 0 }}>
        {short
          ? "Sale como Short: es vertical (o cuadrado) y dura 3 minutos o menos."
          : "Sale como video normal: es horizontal o dura más de 3 minutos (un Short es vertical y de hasta 3 minutos)."}
      </p>

      {/* 1. El título */}
      <div className="field">
        <div className="compositor-texto-cabecera">
          <label className="label" htmlFor={`${ids}-titulo`}>Título</label>
          <Contador valor={(y.titulo ?? "").length} maximo={LIMITES.youtube.titulo} etiqueta="Caracteres del título" />
        </div>
        <input
          id={`${ids}-titulo`} className="input" maxLength={LIMITES.youtube.titulo} value={y.titulo ?? ""}
          onChange={(e) => set("titulo", e.target.value)} placeholder={primeraLinea || "El título del video"} aria-describedby={`${ids}-titulo-d`}
        />
        <p id={`${ids}-titulo-d`} className="hint">Vacío: la primera línea del texto{primeraLinea ? ` («${primeraLinea.slice(0, 60)}${primeraLinea.length > 60 ? "…" : ""}»)` : ""}.</p>
      </div>

      {/* 2. La descripción */}
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Descripción</legend>
        <div className="segmented" role="radiogroup" aria-label="Qué descripción lleva">
          <button type="button" role="radio" aria-checked={!propia} className={`segmented-btn${!propia ? " active" : ""}`} onClick={() => elegirDescripcion(false)}>El mismo texto</button>
          <button type="button" role="radio" aria-checked={propia} className={`segmented-btn${propia ? " active" : ""}`} onClick={() => elegirDescripcion(true)}>Texto propio para YouTube</button>
        </div>
        {propia && (
          <textarea
            id={`${ids}-desc`} className="textarea" style={{ minHeight: 160, marginTop: "var(--sp-2)" }} value={y.descripcion ?? ""} aria-label="Descripción de YouTube"
            onChange={(e) => set("descripcion", e.target.value)} placeholder="La descripción que verá YouTube…"
          />
        )}
        <div className="compositor-texto-cabecera">
          <span className="hint" style={{ margin: 0 }}>{propia ? "Sólo para YouTube: en las demás redes sale el texto de la publicación." : "Sale el texto de la publicación con sus hashtags."}</span>
          <Contador valor={bytes} maximo={LIMITES.youtube.descripcionBytes} etiqueta="Bytes de la descripción" />
        </div>
        {videoAnimado && (
          <div className="fila-botones" style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!ocupado} onClick={armar}
              title="La letra entera, los capítulos de sus tiempos, las citas que enseña y las redes del cliente. Gratis.">
              <Icon name="sparkles" size={14} /> {ocupado === "armar" ? "Armando…" : "Armar con la letra y los capítulos"}
            </button>
            {antesDeArmar && <button type="button" className="btn btn-ghost btn-sm" onClick={deshacerArmado}>Deshacer</button>}
          </div>
        )}
      </fieldset>

      {huecos.length > 0 && (
        <p className="notice notice-warn" role="status">
          Hay {huecos.length === 1 ? "un hueco" : `${huecos.length} huecos`} sin llenar ({huecos.slice(0, 3).join(", ")}): no se puede programar hasta completarl{huecos.length === 1 ? "o" : "os"}.
        </p>
      )}

      {/* 3. Etiquetas */}
      <div className="field">
        <div className="compositor-texto-cabecera">
          <label className="label" htmlFor={`${ids}-tags`}>Etiquetas</label>
          <Contador valor={largoEtiquetas} maximo={LIMITES.youtube.etiquetas} etiqueta="Caracteres de las etiquetas" />
        </div>
        <input
          id={`${ids}-tags`} className="input" value={etiquetasTexto} aria-describedby={`${ids}-tags-d`} placeholder="alabanza, música cristiana, 57DMC"
          onChange={(e) => {
            setEtiquetasTexto(e.target.value);
            set("etiquetas", e.target.value.split(",").map((t) => t.replace(/^#/, "").trim()).filter(Boolean));
          }}
        />
        <p id={`${ids}-tags-d`} className="hint">Separadas por comas. No se ven: ayudan a que YouTube lo encuentre. Vacío: los hashtags de la publicación.</p>
      </div>

      {/* 4 y 5. Categoría y privacidad */}
      <div className="campos-dos" style={{ display: "grid", gap: "var(--sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="field">
          <label className="label" htmlFor={`${ids}-cat`}>Categoría</label>
          <select id={`${ids}-cat`} className="input" value={y.categoria ?? ""} onChange={(e) => set("categoria", e.target.value)}>
            <option value="">Automática (Música si es una canción)</option>
            {CATEGORIAS_YOUTUBE.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-priv`}>Privacidad</label>
          <select id={`${ids}-priv`} className="input" value={y.privacidad ?? ""} onChange={(e) => set("privacidad", e.target.value)}>
            <option value="">La del canal</option>
            {PRIVACIDADES_YOUTUBE_POST.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </div>
      </div>

      {/* 6. Miniatura */}
      <div className="field">
        <span className="label" id={`${ids}-mini`}>Miniatura</span>
        <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" }}>
          <span className="config-youtube-miniatura" aria-labelledby={`${ids}-mini`}>
            {miniatura ? <img src={miniatura} alt="La miniatura del video" /> : <span className="hint" style={{ margin: 0 }}>La escoge YouTube</span>}
          </span>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGaleria(true)}><Icon name="photo" size={14} /> De la galería</button>
            {videoAnimado && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!ocupado} onClick={crearMiniatura}
                title="La imagen principal del video con el título, en la letra del kit (1280×720). Gratis.">
                <Icon name="sparkles" size={14} /> {ocupado === "miniatura" ? "Creando…" : "Crear miniatura"}
              </button>
            )}
            {y.miniatura && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("miniatura", "")}>Quitar</button>}
          </div>
        </div>
        <p className="hint">
          1280×720 (16:9) y menos de 2 MB. {short ? "En un Short YouTube no usa la miniatura subida: el fotograma se escoge en su app." : !y.miniatura && post.portada ? "Sin escoger, va la portada de la publicación." : ""}
        </p>
      </div>
      {galeria && (
        <Suspense fallback={null}>
          <GaleriaSelector clienteId={clientId} una destino="la miniatura" onElegir={elegirDeGaleria} onCerrar={() => setGaleria(false)} />
        </Suspense>
      )}

      {avisos.length > 0 && (
        <ul className="notice notice-warn" role="status" style={{ paddingLeft: "var(--sp-5)" }}>
          {avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}

      {/* 7. Lista de reproducción */}
      <div className="field">
        <label className="label" htmlFor={`${ids}-lista`}>Lista de reproducción</label>
        <select
          id={`${ids}-lista`} className="input" value={y.playlistId ?? ""} onChange={(e) => elegirLista(e.target.value)}
          disabled={porGoogle || listas === null} aria-describedby={`${ids}-lista-d`}
        >
          <option value="">{listas === null ? "Leyendo las listas del canal…" : "Ninguna"}</option>
          {y.playlistId && !(listas?.listas ?? []).some((l) => l.id === y.playlistId) && <option value={y.playlistId}>{y.playlist || y.playlistId}</option>}
          {(listas?.listas ?? []).map((l) => <option key={l.id} value={l.id}>{l.titulo || l.id}</option>)}
        </select>
        <p id={`${ids}-lista-d`} className="hint">
          {listas?.nota || (listas && !listas.listas?.length ? "El canal no tiene listas (se crean en YouTube Studio)." : "Al publicarse, el video entra en esa lista.")}
        </p>
      </div>

      {/* 8. Primer comentario */}
      <div className="field">
        <label className="label" htmlFor={`${ids}-com`}>Primer comentario (opcional)</label>
        <textarea
          id={`${ids}-com`} className="textarea" style={{ minHeight: 70 }} value={y.primerComentario ?? ""} aria-describedby={`${ids}-com-d`}
          onChange={(e) => set("primerComentario", e.target.value)} placeholder="Lo comenta el canal en cuanto sale (un enlace, una pregunta…)"
        />
        <p id={`${ids}-com-d`} className="hint">{porGoogle ? "Con la conexión de Google no se pone: sólo cuando el canal va por PostPeer." : "Lo publica el canal en cuanto sale el video."}</p>
      </div>

      {/* 9. Contenido hecho con IA */}
      <FilaInterruptor
        etiqueta="Contenido alterado o sintético"
        descripcion="Enciéndelo si muestra personas, lugares o hechos realistas que no son reales (hechos o cambiados con IA). Una animación o una música hecha con IA no lo necesitan."
        encendido={y.ia === true}
        onCambiar={(v) => set("ia", v)}
      />

      {/* 10 y 11. Lo fijo y lo que no se puede */}
      <ul className="hint config-youtube-fijo" style={{ paddingLeft: "var(--sp-5)" }}>
        <li>«Hecho para niños»: <strong>No</strong>, siempre (la agencia no publica contenido para niños).</li>
        <li>Colaboraciones: YouTube no deja invitar a otro canal desde fuera de su app. Menciónalo con @ en la descripción o en el título.</li>
        <li>El idioma, la ubicación, la licencia y «notificar a los suscriptores» se dejan como los tenga el canal.</li>
      </ul>
    </div>
  );
}
