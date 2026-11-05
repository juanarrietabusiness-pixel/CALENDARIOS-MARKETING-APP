// ============================================================
// «Animado con código»: los videos animados de un cliente y su VISTA PREVIA (lazy, dentro de FlujoReel)
//
// La lista de proyectos del cliente, el guion por escenas (pegarlo, corregirlo, ver sus errores con su sitio), la
// vista previa en un lienzo con el MISMO motor que usará el render (motorVideo.js) y «Aprobar el guion». Nada de lo de
// aquí gasta: la vista previa la dibuja el navegador, gratis, y los tiempos son estimados hasta que haya locución.
//
// La vista previa se dibuja a la medida del lienzo en pantalla (el motor dibuja en 1080 × 1920 y aquí se escala), y
// sólo mientras se ve: pausada no repinta nada. Con «reducir movimiento» no arranca sola.
//
// Con locución, la VOZ suena con la animación: el reloj es el del audio mientras se habla (si el audio se atasca
// cargando, la animación lo espera) y el del navegador en los silencios que el render inserta (`tramoDeAudio`), así
// la vista previa suena como sonará el mp4. Los subtítulos los dibuja el motor con los mismos tiempos.
// ============================================================

import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { validarGuion, lineaDeTiempo, FORMATOS_VIDEO, NOMBRE_ESTADO_VIDEO, NOMBRE_TIPO_ESCENA, tramoDeAudio, palabrasMudas } from "../lib/videoEscenas";
import { dibujarFrame, paletaDelGuion, escenaEn, COMPONENTES_LISTOS, areaSegura, bandaDeSubtitulos } from "../lib/motorVideo";
import { prepararRecursos } from "../lib/motorVideoNavegador";
import { revisarEscenas } from "../lib/revisionEscenas";
import { textoDeSubtitulo } from "../lib/subtitulos";
import { listarVideos, leerVideo, crearVideo, guardarVideo, aprobarVideo, borrarVideo } from "../lib/videosApi";
import { limpiarKit } from "../lib/kitMarca";
import { conPersonajeDelKit } from "../lib/personajeVideo";
import RenderVideo from "./RenderVideo";
import "./VideoAnimado.css";

// «Probar una voz» va en su propio chunk: sólo lo carga quien lo abre.
const ProbarVoz = lazy(() => import("./ProbarVoz"));
const VideoSonido = lazy(() => import("./VideoSonido"));
// El paso 4 (crear sin Claude): cada pieza en su chunk.
const CrearVideoAnimado = lazy(() => import("./CrearVideoAnimado"));
const EditorEscenas = lazy(() => import("./EditorEscenas"));
const LocucionVideo = lazy(() => import("./LocucionVideo"));

/** Un guion de arranque: tres escenas que se ven bien con cualquier kit. Se edita antes de guardar. */
const ARRANQUE = {
  version: 1,
  titulo: "Video nuevo",
  formatos: ["9:16"],
  estilo: { grano: 0.25, ritmo: "medio", ilustracion: "poster" },
  escenas: [
    { id: "e1", tipo: "gancho", habla: "¿Sabías que esto te puede pasar a ti también?", pantalla: "¿Te ha pasado?", fondo: { tipo: "papel", color: "fondo" },
      capas: [{ tipo: "forma", figura: "mancha", color: "apoyo", tam: 0.85, animacion: { entrada: "dibuja", bucle: "gira" } },
        { tipo: "sello", texto: "¿Te ha pasado?", tam: 0.75, entra: { palabra: 1 }, animacion: { entrada: "escala" } }] },
    { id: "e2", tipo: "solucion", habla: "Tenemos la solución, y es más sencilla de lo que crees.", pantalla: "Más sencillo de lo que crees",
      transicion: { tipo: "barrido", dur: 0.35 }, fondo: { tipo: "degradado", color: "fondo", color2: "apoyo" },
      capas: [{ tipo: "texto", texto: "Más sencillo de lo que crees", rol: "titular", tam: 0.85, animacion: { entrada: "sube" } }] },
    { id: "e3", tipo: "cierre", habla: "Escríbenos hoy y te contamos cómo.", pantalla: "Escríbenos hoy", pausa: 1, transicion: { tipo: "fundido", dur: 0.3 },
      capas: [{ tipo: "logo", pos: "arriba", tam: 0.4, animacion: { entrada: "fundido" } },
        { tipo: "llamado", texto: "Escríbenos hoy", pos: "abajo", tam: 0.8, entra: { palabra: 0 }, animacion: { entrada: "sube", bucle: "late" } }] },
  ],
};

const fmtSeg = (s) => { const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r.toFixed(1).padStart(4, "0")}`; };
const fecha = (iso) => { try { return new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short" }); } catch { return ""; } };

export default function VideoAnimado({ client, estudio, publicacion = null }) {
  const ids = useId();
  const kit = useMemo(() => limpiarKit(estudio?.kit), [estudio?.kit]);
  const archivos = useMemo(() => estudio?.archivos ?? [], [estudio?.archivos]);
  const [lista, setLista] = useState(null);
  const [abierto, setAbierto] = useState(null); // el proyecto guardado, o { nuevo: true }
  const [texto, setTexto] = useState("");
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [errServidor, setErrServidor] = useState([]);
  const [probar, setProbar] = useState(false);
  // «Video nuevo»: la idea y la IA (o la plantilla). Desde una publicación del calendario arranca abierto.
  const [creando, setCreando] = useState(Boolean(publicacion?.postId));
  const [editarTextos, setEditarTextos] = useState(false);

  const recargarLista = useCallback(async () => {
    try { setLista(await listarVideos(client.id)); } catch (e) { setMsg({ error: true, texto: e.message }); setLista([]); }
  }, [client.id]);
  useEffect(() => { recargarLista(); }, [recargarLista]);

  // Otra persona guardó o aprobó: la lista se relee; el abierto, si es ése y no hay cambios a medias.
  const sucio = abierto && !abierto.nuevo && texto !== JSON.stringify(abierto.guion, null, 2);
  useEffect(() => {
    const alCambiar = async (ev) => {
      if (ev.detail?.clienteId !== client.id) return;
      recargarLista();
      if (ev.detail?.local || !abierto?.id || ev.detail?.id !== abierto.id || sucio) return;
      const v = await leerVideo(client.id, abierto.id).catch(() => null);
      if (v) { setAbierto(v); setTexto(JSON.stringify(v.guion, null, 2)); }
    };
    window.addEventListener("videos", alCambiar);
    return () => window.removeEventListener("videos", alCambiar);
  }, [client.id, abierto, sucio, recargarLista]);

  const abrir = async (id) => {
    setMsg(null); setErrServidor([]);
    try {
      const v = await leerVideo(client.id, id);
      setAbierto(v); setTexto(JSON.stringify(v.guion, null, 2));
    } catch (e) { setMsg({ error: true, texto: e.message }); }
  };
  const nuevo = (guion = ARRANQUE, { publicacion: destino = null, aviso = "" } = {}) => {
    setMsg(aviso ? { texto: aviso } : guion === ARRANQUE ? null : { texto: "Guion escrito: revísalo y guárdalo como borrador." });
    setErrServidor([]); setCreando(false); setEditarTextos(guion !== ARRANQUE);
    setAbierto({ nuevo: true, calendarId: destino?.calendarId ?? null, postId: destino?.postId ?? null });
    setTexto(JSON.stringify(guion, null, 2));
  };

  // La validación va en vivo con el MISMO validador que el servidor.
  const validacion = useMemo(() => validarGuion(texto), [texto]);

  const guardar = async () => {
    if (!validacion.ok) return;
    setOcupado("guardar"); setMsg(null); setErrServidor([]);
    try {
      const r = abierto.nuevo
        ? await crearVideo(client.id, { guion: validacion.guion, calendarId: abierto.calendarId ?? undefined, postId: abierto.postId ?? undefined })
        : await guardarVideo(client.id, abierto.id, { guion: validacion.guion, version: abierto.version });
      setAbierto(r.video); setTexto(JSON.stringify(r.video.guion, null, 2));
      setMsg({ texto: abierto.nuevo ? "Guardado como borrador." : r.video.version > abierto.version ? "Guardado. El guion cambió: hay que aprobarlo otra vez." : "Guardado." });
      recargarLista();
    } catch (e) {
      setErrServidor(e.datos?.errores ?? []);
      setMsg({ error: true, texto: e.message });
    } finally { setOcupado(""); }
  };

  const aprobar = async () => {
    setOcupado("aprobar"); setMsg(null);
    try {
      const v = await aprobarVideo(client.id, abierto.id, abierto.version);
      setAbierto(v);
      setMsg({ texto: v.vozReutilizada
        ? "Guion aprobado. Lo que se dice no cambió: la voz que ya tenía sirve (no hace falta pagar otra). Ya se puede renderizar."
        : "Guion aprobado. El siguiente paso es la voz: «Generar la voz» te dice el costo antes de pagarla." });
      recargarLista();
    } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(""); }
  };

  const [confirmaBorrar, setConfirmaBorrar] = useState(false);
  const borrar = async () => {
    if (!confirmaBorrar) { setConfirmaBorrar(true); return; }
    setOcupado("borrar");
    try { await borrarVideo(client.id, abierto.id); setAbierto(null); setMsg({ texto: "Video borrado." }); recargarLista(); } catch (e) { setMsg({ error: true, texto: e.message }); } finally { setOcupado(""); setConfirmaBorrar(false); }
  };

  const aviso = msg && <p className={msg.error ? "va-msg va-error" : "va-msg"} role={msg.error ? "alert" : "status"}>{msg.texto}</p>;

  if (!abierto) {
    return (
      <div className="va">
        <p className="hint">Escenas dibujadas con código, una sola locución y subtítulos por palabra. La vista previa es gratis: sólo la locución cuesta.</p>
        {aviso}
        {creando ? (
          <Suspense fallback={<p className="hint">Cargando…</p>}>
            <CrearVideoAnimado client={client} publicacion={publicacion} onListo={nuevo} onPlantilla={() => nuevo()} onCancelar={() => setCreando(false)} />
          </Suspense>
        ) : (
          <div className="va-barra">
            <button type="button" className="btn btn-primary" onClick={() => { setMsg(null); setCreando(true); }}><Icon name="plus" /> Video nuevo</button>
          </div>
        )}
        <details className="va-probar" onToggle={(e) => setProbar(e.currentTarget.open)}>
          <summary>Probar una voz</summary>
          {probar && <Suspense fallback={<p className="hint">Cargando…</p>}><ProbarVoz client={client} /></Suspense>}
        </details>
        {lista === null ? <p className="hint">Cargando…</p> : !lista.length ? (
          <p className="hint">Este cliente aún no tiene videos animados. Empieza con «Video nuevo» (la IA escribe el guion) o pídeselo a Claude.</p>
        ) : (
          <ul className="va-lista" aria-label="Videos animados del cliente">
            {lista.map((v) => (
              <li key={v.id}>
                <button type="button" className="va-item" onClick={() => abrir(v.id)}>
                  <strong>{v.titulo}</strong>
                  <span className={`va-estado va-estado-${v.estado}`}>{v.nombreEstado}</span>
                  <span className="hint">v{v.version} · {fecha(v.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const estado = abierto.nuevo ? "borrador" : abierto.estado;
  // Sólo se aprueba un borrador: «aprobar» otra vez un video con voz lo devolvía a «Guion aprobado».
  const puedeAprobar = !abierto.nuevo && !sucio && validacion.ok && estado === "borrador";
  const errores = validacion.ok ? errServidor : validacion.errores;

  return (
    <div className="va">
      <div className="va-barra">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAbierto(null); setMsg(null); }}><Icon name="chevronLeft" /> Todos los videos</button>
        <strong className="va-titulo">{validacion.guion?.titulo || abierto.titulo || "Video nuevo"}</strong>
        <span className={`va-estado va-estado-${estado}`}>{NOMBRE_ESTADO_VIDEO[estado]}{abierto.nuevo ? " (sin guardar)" : ` · v${abierto.version}`}</span>
      </div>
      {aviso}

      <div className="va-cuerpo">
        <div className="va-previa">
          {validacion.guion?.escenas?.length
            ? <VistaPrevia guion={conPersonajeDelKit(validacion.guion, kit)} locucion={abierto.locucion ?? null} kit={kit} archivos={archivos} />
            : <p className="hint">Sin escenas válidas no hay vista previa.</p>}
        </div>

        <div className="va-lado">
          {validacion.guion?.escenas?.length > 0 && (
            <div className="va-barra">
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={editarTextos} onClick={() => setEditarTextos((x) => !x)}>
                <Icon name="pencil" /> {editarTextos ? "Ver las escenas" : "Editar los textos"}
              </button>
            </div>
          )}
          {validacion.guion?.escenas?.length > 0 && (editarTextos
            ? <Suspense fallback={<p className="hint">Cargando…</p>}><EditorEscenas guion={validacion.guion} onCambiar={(g) => setTexto(JSON.stringify(g, null, 2))} /></Suspense>
            : <Escenas guion={validacion.guion} palabras={abierto.locucion?.estado === "lista" ? abierto.locucion.palabras ?? null : null} />)}

          {errores.length > 0 && (
            <div className="va-errores" role="alert">
              <strong>{errores.length === 1 ? "Un error" : `${errores.length} errores`} en el guion</strong>
              <ul>{errores.slice(0, 12).map((e, i) => <li key={i}><code>{e.donde || "guion"}</code> {e.mensaje}</li>)}</ul>
            </div>
          )}
          {validacion.ok && validacion.avisos.length > 0 && (
            <details className="va-avisos"><summary>{validacion.avisos.length} aviso{validacion.avisos.length === 1 ? "" : "s"}</summary>
              <ul>{validacion.avisos.map((a, i) => <li key={i}><code>{a.donde}</code> {a.mensaje}</li>)}</ul>
            </details>
          )}

          <details className="va-json" open={!validacion.ok}>
            <summary>El guion (JSON)</summary>
            <label htmlFor={`${ids}-json`} className="hint">Lo escribe la IA (o Claude); las capas se corrigen aquí a mano. Se valida mientras escribes.</label>
            <textarea id={`${ids}-json`} className="input va-texto" spellCheck={false} value={texto} onChange={(e) => setTexto(e.target.value)} rows={16} />
          </details>

          <div className="va-acciones">
            <button type="button" className="btn btn-primary" disabled={!validacion.ok || Boolean(ocupado) || (!abierto.nuevo && !sucio)} onClick={guardar}>
              {ocupado === "guardar" ? "Guardando…" : abierto.nuevo ? "Guardar borrador" : "Guardar cambios"}
            </button>
            {!abierto.nuevo && (
              <button type="button" className="btn btn-accent" disabled={!puedeAprobar || Boolean(ocupado)} onClick={aprobar}
                title={sucio ? "Guarda los cambios antes de aprobar" : undefined}>
                <Icon name="check" /> {ocupado === "aprobar" ? "Aprobando…" : estado === "borrador" ? "Aprobar el guion" : "Aprobado"}
              </button>
            )}
            {!abierto.nuevo && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado)} onClick={borrar} onBlur={() => setConfirmaBorrar(false)}>
                <Icon name="trash" /> {confirmaBorrar ? "Toca otra vez para borrarlo" : "Borrar"}
              </button>
            )}
          </div>
          {sucio && <p className="hint">Hay cambios sin guardar.</p>}
          {!abierto.nuevo && <Suspense fallback={null}><LocucionVideo client={client} video={abierto} sucio={sucio} onCambio={setAbierto} /></Suspense>}
          {!abierto.nuevo && <RenderVideo client={client} video={abierto} sucio={sucio} onCambio={setAbierto} />}
          {!abierto.nuevo && (
            <Suspense fallback={null}>
              <VideoSonido client={client} video={abierto} sucio={sucio} onCambio={(v) => { setAbierto(v); setTexto(JSON.stringify(v.guion, null, 2)); }} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

/** Las escenas en orden: tipo, lo que se dice y lo que se ve, con sus tiempos (los de la voz si la hay). */
function Escenas({ guion, palabras }) {
  const linea = useMemo(() => lineaDeTiempo(guion, palabras), [guion, palabras]);
  const pendientes = [...new Set(guion.escenas.flatMap((e) => e.capas.map((c) => c.tipo)).filter((t) => !COMPONENTES_LISTOS.includes(t)))];
  return (
    <div className="va-escenas">
      <ol>
        {guion.escenas.map((e, i) => (
          <li key={e.id}>
            <div className="va-escena-cab">
              <span className="va-escena-tipo">{NOMBRE_TIPO_ESCENA[e.tipo] ?? e.tipo}</span>
              <span className="hint">{fmtSeg(linea.escenas[i].desde)}–{fmtSeg(linea.escenas[i].hasta)}</span>
            </div>
            {e.pantalla && <strong className="va-escena-pantalla">{e.pantalla}</strong>}
            {e.habla && <p className="va-escena-habla">«{e.habla}»</p>}
          </li>
        ))}
      </ol>
      {pendientes.length > 0 && <p className="hint">Se ven como marcador hasta que el motor los dibuje: {pendientes.join(", ")}.</p>}
    </div>
  );
}

/** La vista previa: el lienzo, reproducir, la línea de tiempo y el formato. */
/**
 * Encima de la vista previa (NO va en el video): lo que tapan los botones de la red, en gris, y la franja de los
 * subtítulos, punteada. Así se ve por qué abajo queda aire.
 */
function pintarZonas(ctx, guion, formato, ancho, alto) {
  const a = areaSegura(formato, ancho, alto);
  ctx.save();
  ctx.fillStyle = "rgba(20, 24, 32, 0.38)";
  ctx.fillRect(0, 0, ancho, a.y);
  ctx.fillRect(0, a.y + a.h, ancho, alto - a.y - a.h);
  ctx.fillRect(0, a.y, a.x, a.h);
  ctx.fillRect(a.x + a.w, a.y, ancho - a.x - a.w, a.h);
  const lado = Math.min(ancho, alto);
  ctx.font = `600 ${Math.round(lado * 0.03)}px system-ui, sans-serif`;
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("Barra de la red", ancho / 2, a.y / 2);
  ctx.fillText("Texto del post y botones", ancho / 2, a.y + a.h + (alto - a.y - a.h) / 2);
  if (guion.subtitulos?.activo) {
    const b = bandaDeSubtitulos(formato, ancho, alto, guion.subtitulos.pos);
    ctx.setLineDash([lado * 0.02, lado * 0.012]);
    ctx.lineWidth = Math.max(2, lado * 0.004);
    ctx.strokeStyle = "rgba(20, 24, 32, 0.6)";
    ctx.strokeRect(a.x, b.y, a.w, b.h);
    ctx.fillStyle = "rgba(20, 24, 32, 0.7)";
    ctx.fillText("Subtítulos", ancho / 2, b.y - lado * 0.025);
  }
  ctx.restore();
}

function VistaPrevia({ guion, locucion, kit, archivos }) {
  const ids = useId();
  const lienzo = useRef(null);
  const audio = useRef(null);
  const [sonido, setSonido] = useState(true);
  const [falloVoz, setFalloVoz] = useState(false);
  const palabras = locucion?.estado === "lista" ? locucion.palabras ?? null : null;
  const [formato, setFormato] = useState(guion.formatos[0]);
  const [t, setT] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [zonas, setZonas] = useState(false);
  const [prep, setPrep] = useState({ recursos: {}, fuentes: {}, faltan: [] });
  const linea = useMemo(() => lineaDeTiempo(guion, palabras), [guion, palabras]);
  const paleta = useMemo(() => paletaDelGuion(guion, kit.paleta), [guion, kit.paleta]);
  const f = guion.formatos.includes(formato) ? formato : guion.formatos[0];
  const { ancho, alto } = FORMATOS_VIDEO[f];

  // Las imágenes, el logo y la letra: se vuelven a preparar sólo si cambian las que pide el guion o el kit.
  const clavePrep = JSON.stringify([guion.escenas.map((e) => e.capas.map((c) => c.archivo ?? "")), guion.estilo.fuentes, kit.logo, kit.fuente?.clave, archivos.length]);
  useEffect(() => {
    let vivo = true;
    // Cuando llega el cuadro de un clip que se buscó, se repinta el instante de ahora.
    prepararRecursos(guion, { archivos, kit, alCambiar: () => repintar.current() }).then((p) => { if (vivo) setPrep(p); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavePrep]);

  // Pintar el instante t. El lienzo mide lo que se ve (por la densidad de la pantalla) y el motor dibuja a 1080.
  const pintar = useCallback((tiempo) => {
    const c = lienzo.current;
    if (!c) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(w * (alto / ancho));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(w / ancho, h / alto);
    dibujarFrame(ctx, { guion, linea, t: tiempo, formato: f, paleta, recursos: prep.recursos, fuentes: prep.fuentes });
    if (zonas) pintarZonas(ctx, guion, f, ancho, alto);
  }, [guion, linea, f, paleta, prep, ancho, alto, zonas]);

  useEffect(() => { pintar(t); }, [pintar, t]);
  useEffect(() => { setT((x) => Math.min(x, linea.total)); }, [linea.total]);

  // La voz suena sólo si sus tiempos son los de ESTE guion (si no, la línea de tiempo es estimada y no casarían).
  const conVoz = Boolean(palabras && locucion?.clave && !linea.estimado);
  const voz = conVoz && sonido && !falloVoz;
  const mudas = useMemo(() => {
    if (!conVoz) return [];
    const dichas = linea.escenas.flatMap((e) => e.palabras.map((p) => p.texto));
    return palabrasMudas(palabras).map((i) => textoDeSubtitulo(dichas[i] ?? "")).filter(Boolean);
  }, [conVoz, palabras, linea]);
  const tAhora = useRef(t);
  tAhora.current = t;
  const repintar = useRef(() => {});
  repintar.current = () => pintar(tAhora.current);

  /** Pone el audio en el segundo que toca para el instante `x` del video y lo hace sonar (o lo calla en un silencio). */
  const sonarDesde = useCallback((x) => {
    const au = audio.current;
    if (!au || !voz) return;
    const r = tramoDeAudio(linea, x);
    if (r.mudo) { au.pause(); return; }
    au.currentTime = r.a;
    au.play().catch(() => {});
  }, [linea, voz]);

  // Reproducir: con voz, el reloj del audio mientras habla; sin ella (o en un silencio), el del navegador.
  useEffect(() => {
    const el = audio.current;
    if (!reproduciendo) { el?.pause(); return undefined; }
    let pedido = 0;
    let antes = performance.now();
    let x = tAhora.current;
    const paso = (ahora) => {
      const dt = Math.min(0.1, (ahora - antes) / 1000);
      antes = ahora;
      let n = x + dt;
      const au = audio.current;
      if (au && voz) {
        const r = tramoDeAudio(linea, n);
        if (r.mudo || (au.duration && r.a >= au.duration)) { if (!au.paused) au.pause(); }
        else if (au.paused) sonarDesde(n);
        else if (au.readyState < 3) n = x; // el audio se está cargando: la animación lo espera
        else {
          const segunAudio = au.currentTime + r.desplazado;
          if (Math.abs(segunAudio - n) > 0.25) au.currentTime = r.a;
          else if (au.currentTime < r.finTramo) n = Math.max(x, segunAudio);
        }
      }
      if (n >= linea.total) { setT(linea.total); setReproduciendo(false); return; }
      x = n;
      setT(n);
      pedido = requestAnimationFrame(paso);
    };
    pedido = requestAnimationFrame(paso);
    return () => { cancelAnimationFrame(pedido); el?.pause(); };
  }, [reproduciendo, linea, voz, sonarDesde]);

  // Repintar si cambia el ancho (girar el teléfono, abrir el panel).
  useEffect(() => {
    const c = lienzo.current;
    if (!c || typeof ResizeObserver === "undefined") return undefined;
    const o = new ResizeObserver(() => pintar(t));
    o.observe(c);
    return () => o.disconnect();
  }, [pintar, t]);

  // La revisión antes de renderizar, con las letras ya cargadas: lo mismo que mira Claude con `revisar_video`.
  const problemas = useMemo(() => {
    if (typeof document === "undefined") return [];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return [];
    try {
      return revisarEscenas(ctx, { guion, linea, formato: f, recursos: prep.recursos, fuentes: prep.fuentes })
        .sort((a, b) => Number(b.grave) - Number(a.grave) || a.en - b.en);
    } catch {
      return [];
    }
  }, [guion, linea, f, prep]);

  const k = escenaEn(linea, t);
  // Arrancar el audio DENTRO del toque: Safari en el iPhone sólo deja sonar lo que empieza con un gesto.
  const alternar = () => {
    if (reproduciendo) { setReproduciendo(false); return; }
    const desde = t >= linea.total - 0.01 ? 0 : t;
    if (desde !== t) setT(desde);
    sonarDesde(desde);
    setReproduciendo(true);
  };
  const paso = (d) => { setReproduciendo(false); setT((x) => Math.min(linea.total, Math.max(0, x + d))); };

  return (
    <div className="va-vista">
      <div className="va-formatos" role="group" aria-label="Formato de la vista previa">
        {guion.formatos.length > 1 && guion.formatos.map((x) => <button key={x} type="button" className="filter-chip" aria-pressed={x === f} onClick={() => setFormato(x)}>{x}</button>)}
        <button type="button" className="filter-chip" aria-pressed={zonas} onClick={() => setZonas((z) => !z)}>Zonas seguras</button>
        {conVoz && <button type="button" className="filter-chip" aria-pressed={sonido} onClick={() => { setSonido((v) => !v); audio.current?.pause(); setReproduciendo(false); }}>Voz</button>}
      </div>
      {conVoz && <audio ref={audio} src={`/api/media/${locucion.clave}`} preload="auto" onError={() => setFalloVoz(true)} />}
      {conVoz && falloVoz && <p className="va-msg va-error" role="alert">No se pudo cargar el audio de la locución: la vista previa sigue sin sonido.</p>}
      <div className={`va-marco va-marco-${f.replace(":", "x")}`}>
        <canvas ref={lienzo} className="va-lienzo" role="img"
          aria-label={`Vista previa, escena ${k + 1} de ${guion.escenas.length}: ${guion.escenas[k]?.pantalla || guion.escenas[k]?.habla || ""}`} />
      </div>
      <div className="va-controles">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => paso(-1 / 30)} aria-label="Un fotograma atrás"><Icon name="chevronLeft" /></button>
        <button type="button" className="btn btn-primary btn-sm" onClick={alternar} aria-label={reproduciendo ? "Pausar" : "Reproducir"}>
          <Icon name={reproduciendo ? "pause" : "play"} />
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => paso(1 / 30)} aria-label="Un fotograma adelante"><Icon name="chevronRight" /></button>
        <span className="va-reloj" aria-live="off">{fmtSeg(t)} / {fmtSeg(linea.total)}</span>
      </div>
      <label htmlFor={`${ids}-t`} className="sr-only">Momento del video</label>
      <input id={`${ids}-t`} type="range" className="va-barra-t" min={0} max={linea.total} step={1 / 30} value={t}
        onChange={(e) => { setReproduciendo(false); setT(Number(e.target.value)); }} />
      {mudas.length > 0 && (
        <p className="va-msg va-error" role="alert">
          La voz no dijo {mudas.length === 1 ? "la última palabra" : `las últimas ${mudas.length} palabras`} del guion: «{mudas.join(" ")}». Escúchala:
          si es así, hay que generar la locución otra vez (o acortar el cierre).
        </p>
      )}
      <p className="hint">
        {linea.estimado
          ? "Tiempos estimados (2,5 palabras por segundo): con la locución se cuadran a la voz real."
          : `Con la voz de la locución (${locucion?.voz?.nombre ?? "la voz"}): las escenas y los subtítulos van con sus palabras.`}
        {prep.faltan.length > 0 && ` ${prep.faltan.length === 1 ? "Una imagen no está" : `${prep.faltan.length} imágenes no están`} en la galería: sale su marcador.`}
      </p>
      <section className="va-revision" aria-labelledby={`${ids}-rev`}>
        <h4 id={`${ids}-rev`} className="va-revision-titulo">
          Revisión antes de renderizar ({f}): {problemas.length
            ? `${problemas.filter((p) => p.grave).length} grave${problemas.filter((p) => p.grave).length === 1 ? "" : "s"}, ${problemas.filter((p) => !p.grave).length} aviso${problemas.filter((p) => !p.grave).length === 1 ? "" : "s"}`
            : "todo en orden"}
        </h4>
        {problemas.length > 0 && (
          <ul className="va-revision-lista">
            {problemas.map((p, i) => (
              <li key={`${p.escena}-${p.capa}-${p.tipo}-${i}`} className={p.grave ? "va-rev-grave" : "va-rev-aviso"}>
                <span className="va-rev-tipo">{p.grave ? "Grave" : "Aviso"}</span>
                <span>Escena {p.n} · {fmtSeg(p.en)} — {p.mensaje}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setReproduciendo(false); setT(Math.min(linea.total, p.en + 0.5)); }}
                  aria-label={`Ver la escena ${p.n} en ${fmtSeg(p.en)}`}>Ver</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
