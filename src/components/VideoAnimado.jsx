// ============================================================
// «Animado con código»: los videos animados de un cliente y su VISTA PREVIA (lazy, dentro de FlujoReel)
//
// La lista de proyectos del cliente, el guion por escenas (pegarlo, corregirlo, ver sus errores con su sitio), la
// vista previa en un lienzo con el MISMO motor que usará el render (motorVideo.js) y «Aprobar el guion». Nada de lo de
// aquí gasta: la vista previa la dibuja el navegador, gratis, y los tiempos son estimados hasta que haya locución.
//
// La vista previa se dibuja a la medida del lienzo en pantalla (el motor dibuja en 1080 × 1920 y aquí se escala), y
// sólo mientras se ve: pausada no repinta nada. Con «reducir movimiento» no arranca sola.
// ============================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { validarGuion, lineaDeTiempo, FORMATOS_VIDEO, NOMBRE_ESTADO_VIDEO, NOMBRE_TIPO_ESCENA, puedePasar } from "../lib/videoEscenas";
import { dibujarFrame, paletaDelGuion, escenaEn, COMPONENTES_LISTOS } from "../lib/motorVideo";
import { prepararRecursos } from "../lib/motorVideoNavegador";
import { listarVideos, leerVideo, crearVideo, guardarVideo, aprobarVideo, borrarVideo } from "../lib/videosApi";
import { limpiarKit } from "../lib/kitMarca";
import "./VideoAnimado.css";

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

export default function VideoAnimado({ client, estudio }) {
  const ids = useId();
  const kit = useMemo(() => limpiarKit(estudio?.kit), [estudio?.kit]);
  const archivos = useMemo(() => estudio?.archivos ?? [], [estudio?.archivos]);
  const [lista, setLista] = useState(null);
  const [abierto, setAbierto] = useState(null); // el proyecto guardado, o { nuevo: true }
  const [texto, setTexto] = useState("");
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const [errServidor, setErrServidor] = useState([]);

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
  const nuevo = () => { setMsg(null); setErrServidor([]); setAbierto({ nuevo: true }); setTexto(JSON.stringify(ARRANQUE, null, 2)); };

  // La validación va en vivo con el MISMO validador que el servidor.
  const validacion = useMemo(() => validarGuion(texto), [texto]);

  const guardar = async () => {
    if (!validacion.ok) return;
    setOcupado("guardar"); setMsg(null); setErrServidor([]);
    try {
      const r = abierto.nuevo
        ? await crearVideo(client.id, { guion: validacion.guion })
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
      setMsg({ texto: "Guion aprobado. El siguiente paso es la locución (llega en el paso 3)." });
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
        <div className="va-barra">
          <button type="button" className="btn btn-primary" onClick={nuevo}><Icon name="plus" /> Video nuevo</button>
        </div>
        {lista === null ? <p className="hint">Cargando…</p> : !lista.length ? (
          <p className="hint">Este cliente aún no tiene videos animados. Pídele uno a Claude o empieza con «Video nuevo».</p>
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
  const puedeAprobar = !abierto.nuevo && !sucio && validacion.ok && puedePasar(estado, "aprobado");
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
            ? <VistaPrevia guion={validacion.guion} palabras={abierto.locucion?.palabras ?? null} kit={kit} archivos={archivos} />
            : <p className="hint">Sin escenas válidas no hay vista previa.</p>}
        </div>

        <div className="va-lado">
          {validacion.guion?.escenas?.length > 0 && <Escenas guion={validacion.guion} />}

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

          <details className="va-json" open={abierto.nuevo || !validacion.ok}>
            <summary>El guion (JSON)</summary>
            <label htmlFor={`${ids}-json`} className="hint">Lo escribe Claude; aquí se corrige a mano. Se valida mientras escribes.</label>
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
        </div>
      </div>
    </div>
  );
}

/** Las escenas en orden: tipo, lo que se dice y lo que se ve, con sus tiempos estimados. */
function Escenas({ guion }) {
  const linea = useMemo(() => lineaDeTiempo(guion), [guion]);
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
function VistaPrevia({ guion, palabras, kit, archivos }) {
  const ids = useId();
  const lienzo = useRef(null);
  const [formato, setFormato] = useState(guion.formatos[0]);
  const [t, setT] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [prep, setPrep] = useState({ recursos: {}, fuentes: {}, faltan: [] });
  const linea = useMemo(() => lineaDeTiempo(guion, palabras), [guion, palabras]);
  const paleta = useMemo(() => paletaDelGuion(guion, kit.paleta), [guion, kit.paleta]);
  const f = guion.formatos.includes(formato) ? formato : guion.formatos[0];
  const { ancho, alto } = FORMATOS_VIDEO[f];

  // Las imágenes, el logo y la letra: se vuelven a preparar sólo si cambian las que pide el guion o el kit.
  const clavePrep = JSON.stringify([guion.escenas.map((e) => e.capas.map((c) => c.archivo ?? "")), guion.estilo.fuentes, kit.logo, kit.fuente?.clave, archivos.length]);
  useEffect(() => {
    let vivo = true;
    prepararRecursos(guion, { archivos, kit }).then((p) => { if (vivo) setPrep(p); });
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
  }, [guion, linea, f, paleta, prep, ancho, alto]);

  useEffect(() => { pintar(t); }, [pintar, t]);
  useEffect(() => { setT((x) => Math.min(x, linea.total)); }, [linea.total]);

  // Reproducir: el reloj del navegador sólo mueve `t`; el dibujo es el mismo que con la barra.
  useEffect(() => {
    if (!reproduciendo) return undefined;
    let pedido = 0;
    let antes = performance.now();
    const paso = (ahora) => {
      const dt = (ahora - antes) / 1000;
      antes = ahora;
      setT((x) => {
        const n = x + dt;
        if (n >= linea.total) { setReproduciendo(false); return linea.total; }
        return n;
      });
      pedido = requestAnimationFrame(paso);
    };
    pedido = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(pedido);
  }, [reproduciendo, linea.total]);

  // Repintar si cambia el ancho (girar el teléfono, abrir el panel).
  useEffect(() => {
    const c = lienzo.current;
    if (!c || typeof ResizeObserver === "undefined") return undefined;
    const o = new ResizeObserver(() => pintar(t));
    o.observe(c);
    return () => o.disconnect();
  }, [pintar, t]);

  const k = escenaEn(linea, t);
  const alternar = () => { if (!reproduciendo && t >= linea.total - 0.01) setT(0); setReproduciendo((r) => !r); };
  const paso = (d) => { setReproduciendo(false); setT((x) => Math.min(linea.total, Math.max(0, x + d))); };

  return (
    <div className="va-vista">
      {guion.formatos.length > 1 && (
        <div className="va-formatos" role="group" aria-label="Formato de la vista previa">
          {guion.formatos.map((x) => <button key={x} type="button" className="filter-chip" aria-pressed={x === f} onClick={() => setFormato(x)}>{x}</button>)}
        </div>
      )}
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
      <p className="hint">
        {linea.estimado ? "Tiempos estimados (2,5 palabras por segundo): con la locución se cuadran a la voz real." : "Tiempos de la locución."}
        {" "}Sin sonido ni subtítulos todavía.
        {prep.faltan.length > 0 && ` ${prep.faltan.length === 1 ? "Una imagen no está" : `${prep.faltan.length} imágenes no están`} en la galería: sale su marcador.`}
      </p>
    </div>
  );
}
