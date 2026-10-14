import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { textoCosto, estimar, costoDePieza, etiquetaDeCosto, CONFIRMAR_DESDE, MODELOS } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import { TIPOS_PRESET, ESTILOS_VISUALES, limpiarKit, referenciasDePersonajes, estiloDeMarca } from "../lib/kitMarca";
import { repartirTiempos, tramo, MAX_PLANOS, MIN_PLANOS } from "../lib/reel";
import { modelosParaCarrusel, modeloParaCarrusel } from "../lib/carruselEstudio";
import { modelosParaReel, modeloRecomendadoParaReel, modeloParaTramo, crearFotogramas, crearFotograma, editarImagen, pedidoDeVideo, crearVideo, corregirTramo } from "../lib/reelEstudio";
import { CopyButton } from "./calendario/primitivas";
import "./calendario/RevisionMes.css";
import "./calendario/CarruselIA.css";
import "./EstudioLote.css";

// ============================================================
// El reel con IA de 10 s, como en Flow, en cuatro pasos
//
//   1. Idea: la promoción, el beneficio o la idea central; el tipo, el
//      estilo, el producto y los personajes. La IA propone el guion.
//   2. Planos: de 4 a 8, cada uno con su tiempo, qué se ve, el texto corto
//      en pantalla y la cámara; el sonido y la descripción del post.
//   3. Fotogramas: uno por plano, en orden, para revisar personajes, estilo
//      e historia ANTES de pagar el video. Cada uno se corrige o se rehace.
//   4. Video: con los fotogramas como storyboard. «Corregir un tramo» (del
//      segundo X al Y) saca una versión nueva sin tocar lo demás.
//
// Lo usan la pestaña Estudio («Reel IA») y «Crear reel con IA» de una
// publicación (que además lo pone en ella).
// ============================================================

const PASOS = [["idea", "Idea"], ["planos", "Planos"], ["fotogramas", "Fotogramas"], ["video", "Video"]];

export default function FlujoReel({ client, estudio, inicial = {}, onPoner = null, onListo = null, cabecera = null, onCreando = () => {} }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const kit = limpiarKit(estudio?.kit);
  const activos = estudio?.activos ?? {};
  const [paso, setPaso] = useState("idea");
  const [idea, setIdea] = useState(inicial.idea ?? "");
  const [preset, setPreset] = useState(inicial.preset ?? "");
  const [estilo, setEstilo] = useState("");
  const [productoId, setProductoId] = useState(inicial.productoId ?? "");
  const [personajes, setPersonajes] = useState([]);
  const [guion, setGuion] = useState(null); // { hilo, planos, sonido, descripcion, segundos }
  const [fotos, setFotos] = useState([]); // por plano: { archivo } | { error } | { cargando }
  const [correccion, setCorreccion] = useState({}); // i → texto
  const [videos, setVideos] = useState([]); // versiones, la última primero
  const [tramoCambio, setTramoCambio] = useState({ desde: 0, hasta: 3, cambio: "" });
  const [modeloImagenId, setModeloImagenId] = useState("");
  const [modeloVideoId, setModeloVideoId] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [confirmar, setConfirmar] = useState(null); // "fotogramas" | "video" | null
  const [aviso, setAviso] = useState(null);
  const carpeta = useRef(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const productos = estudio?.productos ?? [];
  const modelosImagen = useMemo(() => modelosParaCarrusel(estudio?.activos ?? {}), [estudio]);
  // Las listas van del más barato al más caro; si nadie escoge, el recomendado.
  const modeloImagen = modelosImagen.find((m) => m.id === modeloImagenId) ?? modelosImagen.find((m) => m.id === modeloParaCarrusel(estudio?.activos ?? {}).id) ?? modelosImagen[0] ?? null;
  const modelosVideo = useMemo(() => modelosParaReel(estudio?.activos ?? {}), [estudio]);
  const modeloVideo = modelosVideo.find((m) => m.id === modeloVideoId) ?? modeloRecomendadoParaReel(estudio?.activos ?? {}) ?? MODELOS.find((m) => m.id === "prueba-video");
  const paraTramo = modeloParaTramo(activos);
  const segundos = guion?.segundos ?? 10;
  const planos = guion?.planos ?? [];
  const listos = fotos.map((f) => f?.archivo).filter(Boolean);
  const estiloTexto = estiloDeMarca(kit, preset, { marca: client.name, rubro: client.industry ?? "", estilo });
  const deLosPersonajes = referenciasDePersonajes(kit, personajes, estudio?.archivos ?? []);
  const lineaPersonajes = deLosPersonajes.map((p) => `Personaje: ${p.nota}.`).filter((v, i, l) => l.indexOf(v) === i).join(" ");
  const costoFotos = modeloImagen ? Math.round(planos.length * estimar(modeloImagen, 1, { imageSize: "2K" }) * 1000) / 1000 : 0;
  const pedidoVideo = modeloVideo && guion ? pedidoDeVideo({ modelo: modeloVideo, planos, hilo: guion.hilo, sonido: guion.sonido, segundos, estilo: estiloTexto, personajes: lineaPersonajes, fotogramas: listos }) : null;
  const costoVideo = pedidoVideo ? estimar(modeloVideo, 1, pedidoVideo.ajustes) : 0;
  const ocupar = (q) => { setOcupado(q); onCreando(Boolean(q)); };

  const prepararCarpeta = async () => {
    if (carpeta.current) return;
    const dia = new Date().toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" }).replace(/\./g, "");
    const nombre = `Reel · ${idea.slice(0, 20).trim()} · ${dia}`.slice(0, 40);
    try {
      carpeta.current = (await api.crearCarpeta(clienteId, nombre))?.carpeta?.id ?? null;
    } catch {
      const g = await api.leerEstudio(clienteId).catch(() => null);
      carpeta.current = (g?.carpetas ?? []).find((c) => c.nombre.toLowerCase() === nombre.toLowerCase())?.id ?? null;
    }
  };

  const escribir = async () => {
    ocupar("guion");
    setAviso(null);
    try {
      const r = await api.guionDeReel(clienteId, { idea, segundos: 10, preset, estilo, productoId: productoId || undefined, personajes });
      setGuion(r);
      setPaso("planos");
      setAviso({ ok: true, texto: ["Revisa los planos: qué se ve, el texto en pantalla y la cámara.", r.aviso ?? ""].filter(Boolean).join(" ") });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  const cambiarPlano = (i, campo, valor) => setGuion((g) => ({ ...g, planos: g.planos.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)) }));
  const quitarPlano = (i) => setGuion((g) => ({ ...g, planos: repartirTiempos(g.planos.filter((_, j) => j !== i), g.segundos) }));
  const anadirPlano = () => setGuion((g) => ({ ...g, planos: repartirTiempos([...g.planos, { escena: "", texto: "", camara: "" }], g.segundos) }));

  const comunFotos = () => ({
    clienteId, modelo: modeloImagen, hilo: guion.hilo, estilo: estiloTexto, personajes: deLosPersonajes,
    fotos: api.fotosDelProducto(productos, productoId).map((f) => f.clave), carpetaId: carpeta.current, seguir: () => vivo.current,
  });
  const crearLosFotogramas = async () => {
    setConfirmar(null);
    setPaso("fotogramas");
    ocupar("fotogramas");
    setFotos(planos.map(() => ({ cargando: true })));
    await prepararCarpeta();
    const salida = await crearFotogramas({ ...comunFotos(), carpetaId: carpeta.current, planos, alAvanzar: (i, r) => { if (vivo.current) setFotos((x) => x.map((y, j) => (j === i ? r : y))); } });
    ocupar("");
    if (!vivo.current) return;
    setFotos(planos.map((_, i) => salida[i] ?? { error: "No se pidió." }));
    window.dispatchEvent(new Event("ia:gasto"));
    const bien = salida.filter((r) => r?.archivo).length;
    setAviso({ ok: bien > 0, texto: bien === planos.length ? "Revisa el storyboard: corrige o rehaz los fotogramas que no te convenzan antes de crear el video." : `Salieron ${bien} de ${planos.length}. Rehaz los que fallaron.` });
  };
  const unFotograma = async (i, hacer) => {
    setFotos((x) => x.map((y, j) => (j === i ? { ...y, cargando: true } : y)));
    try {
      const archivo = await hacer();
      if (vivo.current) setFotos((x) => x.map((y, j) => (j === i ? { archivo } : y)));
      setCorreccion((c) => ({ ...c, [i]: "" }));
    } catch (e) {
      if (vivo.current) setFotos((x) => x.map((y, j) => (j === i ? { ...y, cargando: false, error: e.message } : y)));
    }
    window.dispatchEvent(new Event("ia:gasto"));
  };
  const rehacerFotograma = (i) => unFotograma(i, () => crearFotograma({
    ...comunFotos(), plano: planos[i], total: planos.length, anterior: fotos[i - 1]?.archivo ?? fotos[1]?.archivo ?? null, primero: i > 1 ? fotos[0]?.archivo ?? null : null,
  }));
  const corregirFotograma = (i) => unFotograma(i, () => editarImagen({ clienteId, modelo: modeloImagen, archivo: fotos[i].archivo, instruccion: correccion[i], carpetaId: carpeta.current, seguir: () => vivo.current }));

  const crearElVideo = async () => {
    setConfirmar(null);
    setPaso("video");
    ocupar("video");
    setAviso({ ok: true, texto: "Creando el video: tarda unos minutos. Puedes seguir en otra pestaña; queda en la galería." });
    try {
      await prepararCarpeta();
      const video = await crearVideo({ clienteId, pedido: pedidoVideo, carpetaId: carpeta.current, calendarId: inicial.calendarId, postId: inicial.postId, seguir: () => vivo.current });
      if (!vivo.current) return;
      setVideos((v) => [video, ...v]);
      setAviso({ ok: true, texto: "Listo. Si un tramo no quedó, corrígelo: sale otra versión y esta se queda." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };
  const corregirElTramo = async () => {
    const video = videos[0];
    if (!video || !paraTramo || !tramoCambio.cambio.trim()) return;
    ocupar("tramo");
    setAviso({ ok: true, texto: `Corrigiendo del segundo ${tramoCambio.desde} al ${tramoCambio.hasta}…` });
    try {
      const nuevo = await corregirTramo({ clienteId, modelo: paraTramo, video, ...tramoCambio, segundos, carpetaId: carpeta.current, seguir: () => vivo.current });
      if (!vivo.current) return;
      setVideos((v) => [nuevo, ...v]);
      setTramoCambio((t) => ({ ...t, cambio: "" }));
      setAviso({ ok: true, texto: "Versión nueva arriba; la anterior se queda abajo y en la galería." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  const pedirConConfirmar = (que, costo, hacer) => (costo >= CONFIRMAR_DESDE ? setConfirmar(que) : hacer());
  const indice = PASOS.findIndex(([x]) => x === paso);

  return (
    <section className="card flujo-carrusel flujo-reel" aria-labelledby={`${ids}-t`}>
      {cabecera}
      <h3 id={`${ids}-t`} className="sr-only">Crear un reel con IA</h3>
      <ol className="lote-pasos" aria-label="Pasos">
        {PASOS.map(([id, n], k) => <li key={id} aria-current={id === paso ? "step" : undefined} data-hecho={indice > k || undefined}>{k + 1}. {n}</li>)}
      </ol>
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>

      {paso === "idea" && (
        <div className="carrusel-opciones">
          <div className="field">
            <label className="label" htmlFor={`${ids}-idea`}>La idea central</label>
            <textarea id={`${ids}-idea`} className="input" rows={3} maxLength={1500} value={idea} onChange={(e) => setIdea(e.target.value)}
              placeholder="Caja grande de wipes Nateen: 960 por $45. Piel sensible protegida desde el primer uso." />
            <p className="hint">La promoción, el beneficio o lo que quieres contar. La IA propone el guion de 10 s por planos.</p>
          </div>
          <div className="lote-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-tipo`}>Tipo de pieza</label>
              <select id={`${ids}-tipo`} className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="">Sin tipo</option>
                {Object.entries(TIPOS_PRESET).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
                {kit.propios.map((p) => <option key={p.id} value={p.id}>{p.nombre} (propio)</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-est`}>Estilo visual</label>
              <select id={`${ids}-est`} className="input" value={estilo} onChange={(e) => setEstilo(e.target.value)}>
                <option value="">{preset ? "El del tipo" : "Ninguno"}</option>
                {Object.entries(ESTILOS_VISUALES).map(([id, d]) => <option key={id} value={id}>{d.nombre}</option>)}
                {kit.estilos.map((e) => <option key={e.id} value={e.id}>{e.nombre} (propio)</option>)}
              </select>
            </div>
            {productos.length > 0 && (
              <div className="field">
                <label className="label" htmlFor={`${ids}-prod`}>Producto</label>
                <select id={`${ids}-prod`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                  <option value="">Ninguno</option>
                  {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}
          </div>
          {kit.personajes.length > 0 && (
            <div className="field">
              <span className="label" id={`${ids}-pers`}>Personajes que salen</span>
              <div className="est-tipos" role="group" aria-labelledby={`${ids}-pers`}>
                {kit.personajes.map((p) => (
                  <button key={p.id} type="button" className="filter-chip" aria-pressed={personajes.includes(p.id)} title={p.descripcion}
                    onClick={() => setPersonajes((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))}>{p.nombre}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {paso === "planos" && guion && (
        <div className="carrusel-opciones">
          <div className="field">
            <label className="label" htmlFor={`${ids}-hilo`}>Lo que comparten todos los planos</label>
            <input id={`${ids}-hilo`} className="input" maxLength={300} value={guion.hilo} onChange={(e) => setGuion((g) => ({ ...g, hilo: e.target.value }))} />
          </div>
          <ol className="carrusel-laminas">
            {planos.map((p, i) => (
              <li key={i} className="revision-item carrusel-lamina">
                <div className="carrusel-lamina-vista reel-tramo"><span>{tramo(p)}</span></div>
                <div className="carrusel-lamina-texto">
                  <label className="sr-only" htmlFor={`${ids}-pe-${i}`}>Qué se ve en el plano {p.n}</label>
                  <textarea id={`${ids}-pe-${i}`} className="textarea" rows={2} maxLength={300} value={p.escena} placeholder="Qué se ve" onChange={(e) => cambiarPlano(i, "escena", e.target.value)} />
                  <label className="sr-only" htmlFor={`${ids}-pt-${i}`}>Texto en pantalla del plano {p.n}</label>
                  <input id={`${ids}-pt-${i}`} className="input" maxLength={60} value={p.texto} placeholder="Texto en pantalla (corto, o vacío)" onChange={(e) => cambiarPlano(i, "texto", e.target.value)} />
                  <label className="sr-only" htmlFor={`${ids}-pc-${i}`}>Cámara del plano {p.n}</label>
                  <input id={`${ids}-pc-${i}`} className="input" maxLength={160} value={p.camara} placeholder="Cámara" onChange={(e) => cambiarPlano(i, "camara", e.target.value)} />
                  {planos.length > MIN_PLANOS && <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitarPlano(i)}><Icon name="trash" size={14} /> Quitar</button>}
                </div>
              </li>
            ))}
          </ol>
          {planos.length < MAX_PLANOS && <button type="button" className="btn btn-ghost btn-sm" onClick={anadirPlano}><Icon name="plus" size={14} /> Añadir plano</button>}
          <div className="field">
            <label className="label" htmlFor={`${ids}-son`}>Sonido</label>
            <input id={`${ids}-son`} className="input" maxLength={300} value={guion.sonido} onChange={(e) => setGuion((g) => ({ ...g, sonido: e.target.value }))} />
          </div>
          {guion.descripcion && (
            <div className="field">
              <span className="label">Descripción del post</span>
              <p className="recrear-descripcion">{guion.descripcion}</p>
              <CopyButton text={guion.descripcion} describes="la descripción" />
            </div>
          )}
          <div className="field" style={{ margin: 0 }}>
            <label className="label" htmlFor={`${ids}-mi`}>Modelo de los fotogramas</label>
            <select id={`${ids}-mi`} className="input" value={modeloImagen?.id ?? ""} onChange={(e) => setModeloImagenId(e.target.value)}>
              {modelosImagen.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${textoCosto(costoDePieza(m))} cada uno`}</option>)}
            </select>
          </div>
        </div>
      )}

      {(paso === "fotogramas" || paso === "video") && (
        <ol className="carrusel-laminas reel-fotogramas">
          {planos.map((p, i) => {
            const f = fotos[i];
            return (
              <li key={i} className="revision-item carrusel-lamina">
                <div className="carrusel-lamina-vista reel-vista">
                  {f?.archivo && !f?.cargando ? <img src={f.archivo.src} alt={`Fotograma ${p.n}`} loading="lazy" /> : <span className="hint">{f?.cargando ? "Creando…" : f?.error ? "Falló" : p.n}</span>}
                </div>
                <div className="carrusel-lamina-texto">
                  <strong>{tramo(p)}</strong>
                  <p className="hint" style={{ margin: 0 }}>{p.escena}{p.texto ? ` · «${p.texto}»` : ""}</p>
                  {f?.error && <p className="revision-problema">{f.error}</p>}
                  {paso === "fotogramas" && !ocupado && f && !f.cargando && (
                    <div className="carrusel-lamina-acciones">
                      {f.archivo && (
                        <form className="carrusel-corregir" onSubmit={(e) => { e.preventDefault(); if (correccion[i]?.trim()) corregirFotograma(i); }}>
                          <label className="sr-only" htmlFor={`${ids}-fc-${i}`}>Qué corregir en el fotograma {p.n}</label>
                          <input id={`${ids}-fc-${i}`} className="input" maxLength={300} value={correccion[i] ?? ""} placeholder="Que la mamá sonría…" onChange={(e) => setCorreccion((c) => ({ ...c, [i]: e.target.value }))} />
                          <button type="submit" className="btn btn-secondary btn-sm" disabled={!correccion[i]?.trim()}><Icon name="wand" size={14} /> Corregir</button>
                        </form>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => rehacerFotograma(i)}><Icon name="refresh" size={14} /> Rehacer</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {paso === "fotogramas" && !ocupado && listos.length > 0 && (
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor={`${ids}-mv`}>Modelo del video</label>
          <select id={`${ids}-mv`} className="input" value={modeloVideo?.id ?? ""} onChange={(e) => setModeloVideoId(e.target.value)}>
            {modelosVideo.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${etiquetaDeCosto(m)}`} · {m.referencias >= 2 ? "con el storyboard" : "desde el primer fotograma"}</option>)}
          </select>
        </div>
      )}

      {paso === "video" && (
        <div className="reel-video">
          {videos.length === 0 && <p className="hint">{ocupado === "video" ? "Creando el video…" : "Todavía no hay video."}</p>}
          {videos.map((v, k) => (
            <figure key={v.id} className="reel-version">
              <video src={v.src} controls playsInline preload="metadata" aria-label={k === 0 ? "El reel, última versión" : `Versión anterior ${k}`} />
              <figcaption className="hint">{k === 0 ? "Última versión" : `Versión anterior ${videos.length - k}`}</figcaption>
            </figure>
          ))}
          {videos.length > 0 && paraTramo && (
            <form className="reel-tramo-form" onSubmit={(e) => { e.preventDefault(); corregirElTramo(); }}>
              <span className="label">Corregir un tramo</span>
              <div className="reel-tramo-fila">
                <label>Del <input type="number" className="input" min={0} max={segundos - 1} value={tramoCambio.desde} onChange={(e) => setTramoCambio((t) => ({ ...t, desde: Math.max(0, Math.min(segundos - 1, Number(e.target.value) || 0)) }))} /></label>
                <label>al <input type="number" className="input" min={1} max={segundos} value={tramoCambio.hasta} onChange={(e) => setTramoCambio((t) => ({ ...t, hasta: Math.max(t.desde + 1, Math.min(segundos, Number(e.target.value) || 1)) }))} /> s</label>
              </div>
              <label className="sr-only" htmlFor={`${ids}-tc`}>Qué cambiar en ese tramo</label>
              <input id={`${ids}-tc`} className="input" maxLength={500} value={tramoCambio.cambio} placeholder="Que la mamá sonría y mire al bebé" onChange={(e) => setTramoCambio((t) => ({ ...t, cambio: e.target.value }))} />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado) || !tramoCambio.cambio.trim()}>
                <Icon name="wand" size={14} /> {ocupado === "tramo" ? "Corrigiendo…" : `Corregir con ${paraTramo.nombre}`}
              </button>
            </form>
          )}
          {videos.length > 0 && !paraTramo && <p className="hint">Para corregir un tramo hace falta Gemini Omni o Kling Omni por Kie.ai (KIE_API_KEY).</p>}
        </div>
      )}

      <div className="lote-pie">
        {confirmar ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmar(null)}>No</button>
            <button type="button" className="btn btn-primary" onClick={confirmar === "video" ? crearElVideo : crearLosFotogramas}>
              Sí, {confirmar === "video" ? `crear el video por ${textoCosto(costoVideo)}` : `crear ${planos.length} fotogramas por ${textoCosto(costoFotos)}`}
            </button>
          </>
        ) : (
          <>
            {paso === "idea" && (
              <button type="button" className="btn btn-primary" disabled={Boolean(ocupado) || !idea.trim()} onClick={escribir}>
                <Icon name="sparkles" size={18} /> {ocupado === "guion" ? "Escribiendo el guion…" : "Proponer el guion de 10 s"}
              </button>
            )}
            {paso === "planos" && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("idea")}>Volver</button>
                <p className="lote-costo">{planos.length} fotogramas · <strong>{textoCosto(costoFotos)}</strong> (aprox.)</p>
                <button type="button" className="btn btn-primary" disabled={!modeloImagen || planos.some((p) => !p.escena.trim())} onClick={() => pedirConConfirmar("fotogramas", costoFotos, crearLosFotogramas)}>
                  <Icon name="image" size={18} /> Crear los fotogramas
                </button>
              </>
            )}
            {paso === "fotogramas" && (
              <>
                {!ocupado && <button type="button" className="btn btn-ghost" onClick={() => setPaso("planos")}>Volver a los planos</button>}
                <p className="lote-costo">{ocupado ? "Creando los fotogramas, en orden…" : `Video de ${segundos} s · ${textoCosto(costoVideo)} (aprox.)`}</p>
                {!ocupado && listos.length > 0 && (
                  <button type="button" className="btn btn-primary" disabled={!pedidoVideo} onClick={() => pedirConConfirmar("video", costoVideo, crearElVideo)}>
                    <Icon name="video" size={18} /> Crear el video
                  </button>
                )}
              </>
            )}
            {paso === "video" && !ocupado && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("fotogramas")}>Volver al storyboard</button>
                {onPoner && videos[0] && (
                  <button type="button" className="btn btn-primary" onClick={() => onPoner([videos[0]], { reemplazar: true })}>
                    <Icon name="check" size={18} /> Poner en la publicación
                  </button>
                )}
                {onListo && videos[0] && (
                  <button type="button" className={`btn ${onPoner ? "btn-secondary" : "btn-primary"}`} onClick={onListo}>
                    <Icon name="check" size={18} /> Listo
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
