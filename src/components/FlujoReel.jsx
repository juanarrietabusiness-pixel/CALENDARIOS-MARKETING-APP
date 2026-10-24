import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { textoCosto, estimar, costoDePieza, etiquetaDeCosto, CONFIRMAR_DESDE, MODELOS, VOCES_OMNI } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import { TIPOS_PRESET, ESTILOS_VISUALES, limpiarKit, referenciasDePersonajes, estiloDeMarca, bloqueDeMarca } from "../lib/kitMarca";
import { repartirTiempos, tramo, maxPlanos, MIN_PLANOS, DURACIONES_REEL, ajustarDuracion, locucionQueCabe, PALABRAS_POR_SEGUNDO, soloFlow, SEGUNDOS_POR_CLIP, promptParaFlow, sinVozPropia } from "../lib/reel";
import { modelosParaCarrusel, modeloParaCarrusel } from "../lib/carruselEstudio";
import { modelosParaReel, modeloRecomendadoParaReel, modeloParaTramo, crearFotogramas, crearFotograma, editarImagen, pedidoDeVideo, crearVideo, corregirTramo, modelosParaClips, modeloParaClips, pedidoDeClip, crearClips } from "../lib/reelEstudio";
import { crearZip } from "../lib/zip";
import { CopyButton } from "./calendario/primitivas";
import ReferenciasGaleria from "./ReferenciasGaleria";
import GuardarRegla from "./GuardarRegla";
import IdeasDeFormato from "./IdeasDeFormato";
import "./calendario/RevisionMes.css";
import "./calendario/CarruselIA.css";
import "./EstudioLote.css";

// ============================================================
// El reel con IA de 10 s, como en Flow, en cuatro pasos
//
//   1. Idea: la promoción, el beneficio o la idea central; el tipo, el
//      estilo, el producto y los personajes. La IA propone el guion.
//   2. Planos: de 4 a 8, cada uno con su tiempo, qué se ve y la cámara (sin
//      texto en pantalla: videoLimpio.js); el sonido y la descripción del post.
//   3. Fotogramas: uno por plano, en orden, para revisar personajes, estilo
//      e historia ANTES de pagar el video. Cada uno se corrige o se rehace.
//   4. Video: con los fotogramas como storyboard. «Corregir un tramo» (del
//      segundo X al Y) saca una versión nueva sin tocar lo demás.
//
// 10 s con Gemini Omni o 8 s con Veo 3.1 Fast (la mitad de precio): cambiar la
// duración reparte los planos en el tiempo nuevo sin reescribir el guion. El
// sonido va en el MISMO pedido del video —música, locución con una voz
// escogida (Omni) y efectos—: así la voz cae en el plano que toca. Al corregir
// un fotograma o un tramo se pueden poner ejemplos de la galería.
//
// «Copiar para Flow» (lo principal): el guion en UNA instrucción para Gemini
// Omni en Flow, con todo lo que Flow no sabe —la marca, la continuidad, los
// clips, el sonido y qué imágenes subir— (`promptParaFlow`). 20, 30 y 40 s
// son SÓLO para Flow: varios clips de 10 s que el agente genera seguidos.
// El guion puede seguir la ESTRUCTURA de un anuncio que ya funciona (las
// referencias analizadas del estudio de mercado).
//
// Lo usan la pestaña Estudio («Video») y «Crear reel con IA» de una
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
  const [refsMano, setRefsMano] = useState([]); // de la galería, para los fotogramas
  const [duracion, setDuracion] = useState(10);
  // Un anuncio que ya funciona (referencias analizadas del estudio de mercado): el guion sigue su estructura.
  const [referencias, setReferencias] = useState([]);
  const [referenciaId, setReferenciaId] = useState(inicial.referenciaId ?? "");
  const [copiado, setCopiado] = useState(false);
  const [voz, setVoz] = useState(() => kit.voz || ""); // la voz fija del cliente (kit), si la tiene
  const [ejemplosFoto, setEjemplosFoto] = useState({}); // i → [ejemplos de la galería]
  const [ejemplosTramo, setEjemplosTramo] = useState([]);
  const [guion, setGuion] = useState(null); // { hilo, planos, musica, locucion, efectos, descripcion, segundos }
  const [fotos, setFotos] = useState([]); // por plano: { archivo } | { error } | { cargando }
  const [correccion, setCorreccion] = useState({}); // i → texto
  const [videos, setVideos] = useState([]); // versiones, la última primero
  const [tramoCambio, setTramoCambio] = useState({ desde: 0, hasta: 3, cambio: "" });
  const [modeloImagenId, setModeloImagenId] = useState("");
  const [modeloVideoId, setModeloVideoId] = useState("");
  // Qué sale de los fotogramas: UN video con todo (el storyboard) o un clip LIMPIO por fotograma para editar en CapCut.
  const [salida, setSalida] = useState("uno");
  const [modeloClipsId, setModeloClipsId] = useState("");
  const [segundosClip, setSegundosClip] = useState(5);
  const [clips, setClips] = useState([]); // por plano: { archivo } | { error } | { cargando } | null
  const [bajando, setBajando] = useState(false);
  const [revision, setRevision] = useState(null); // { idea, cambios }: lo que propone el director comercial
  const [ocupado, setOcupado] = useState("");
  const [confirmar, setConfirmar] = useState(null); // "fotogramas" | "video" | null
  const [aviso, setAviso] = useState(null);
  const carpeta = useRef(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => {
    let sigue = true;
    import("../lib/mercado").then(({ leerMercado }) => leerMercado(clienteId))
      .then((m) => { if (sigue) setReferencias((m?.referencias ?? []).filter((r) => r.analisis)); })
      .catch(() => { /* sin estudio de mercado, sin referencias */ });
    return () => { sigue = false; };
  }, [clienteId]);

  const productos = estudio?.productos ?? [];
  const modelosImagen = useMemo(() => modelosParaCarrusel(estudio?.activos ?? {}), [estudio]);
  // Las listas van del más barato al más caro; si nadie escoge, el recomendado.
  const modeloImagen = modelosImagen.find((m) => m.id === modeloImagenId) ?? modelosImagen.find((m) => m.id === modeloParaCarrusel(estudio?.activos ?? {}).id) ?? modelosImagen[0] ?? null;
  const modelosVideo = useMemo(() => modelosParaReel(estudio?.activos ?? {}), [estudio]);
  const modeloVideo = modelosVideo.find((m) => m.id === modeloVideoId) ?? modeloRecomendadoParaReel(estudio?.activos ?? {}) ?? MODELOS.find((m) => m.id === "prueba-video");
  const paraTramo = modeloParaTramo(activos);
  const segundos = guion?.segundos ?? duracion;
  const planos = guion?.planos ?? [];
  const listos = fotos.map((f) => f?.archivo).filter(Boolean);
  const estiloTexto = estiloDeMarca(kit, preset, { marca: client.name, rubro: client.industry ?? "", estilo });
  const deLosPersonajes = referenciasDePersonajes(kit, personajes, estudio?.archivos ?? []);
  const lineaPersonajes = deLosPersonajes.map((p) => `Personaje: ${p.nota}.`).filter((v, i, l) => l.indexOf(v) === i).join(" ");
  const costoFotos = modeloImagen ? Math.round(planos.length * estimar(modeloImagen, 1, { imageSize: "2K" }) * 1000) / 1000 : 0;
  const pedidoVideo = modeloVideo && guion ? pedidoDeVideo({
    modelo: modeloVideo, planos, hilo: guion.hilo, musica: guion.musica, locucion: guion.locucion, efectos: guion.efectos, voz,
    segundos, estilo: estiloTexto, personajes: lineaPersonajes, fotogramas: listos,
  }) : null;
  const conVoz = Boolean(modeloVideo?.ajustes?.voz);
  const maxPalabras = Math.floor(segundos * PALABRAS_POR_SEGUNDO);
  const palabras = String(guion?.locucion ?? "").trim().split(/\s+/).filter(Boolean).length;
  const costoVideo = pedidoVideo ? estimar(modeloVideo, 1, pedidoVideo.ajustes) : 0;
  const modelosClips = useMemo(() => modelosParaClips(estudio?.activos ?? {}), [estudio]);
  const modeloClips = modelosClips.find((m) => m.id === modeloClipsId) ?? modeloParaClips(activos);
  const duracionesClip = (modeloClips?.ajustes?.duration?.valores ?? []).map(Number);
  const conFotograma = fotos.filter((f) => f?.archivo).length;
  const muestraClip = modeloClips && listos[0] && planos[0] ? pedidoDeClip({ modelo: modeloClips, plano: planos[0], fotograma: listos[0], segundos: segundosClip }) : null;
  const costoClips = muestraClip ? Math.round(conFotograma * estimar(modeloClips, 1, muestraClip.ajustes) * 1000) / 1000 : 0;
  const ocupar = (q) => { setOcupado(q); onCreando(Boolean(q)); };
  const largo = soloFlow(segundos);

  /** El prompt para Flow: todo lo que Flow no sabe, en una sola instrucción. */
  const producto = productos.find((p) => p.id === productoId);
  const paraFlow = guion ? promptParaFlow({
    guion: { ...guion, segundos }, marca: client.name, rubro: client.industry ?? "", identidad: bloqueDeMarca(kit), estilo: estiloTexto,
    personajes: kit.personajes.filter((p) => personajes.includes(p.id)).map((p) => ({ nombre: p.nombre, descripcion: p.descripcion })),
    producto: producto ? `${producto.nombre}${producto.precio ? ` (${producto.precio})` : ""}` : "",
    ingredientes: [
      kit.logo && `el logo de ${client.name}`,
      ...kit.personajes.filter((p) => personajes.includes(p.id)).map((p) => `el retrato de ${p.nombre}`),
      producto && api.fotosDelProducto(productos, productoId).length && `la foto de ${producto.nombre}`,
    ].filter(Boolean),
  }) : "";

  /** 10 s (Omni) u 8 s (Veo, la mitad): los planos se reparten en el tiempo nuevo y el modelo del video sigue. */
  const cambiarDuracion = (d) => {
    setDuracion(d);
    setGuion((g) => (g ? { ...g, segundos: d, planos: ajustarDuracion(g.planos, d), locucion: locucionQueCabe(g.locucion, d) } : g));
    const opcion = DURACIONES_REEL.find((x) => x.segundos === d);
    const m = opcion?.modelos.map((id) => modelosVideo.find((x) => x.id === id)).find(Boolean);
    if (m) setModeloVideoId(m.id);
    setTramoCambio((t) => ({ ...t, desde: Math.min(t.desde, d - 1), hasta: Math.min(t.hasta, d) }));
  };
  const selectorDuracion = (
    <div className="field">
      <span className="label" id={`${ids}-dur`}>Duración</span>
      <div className="est-tipos" role="group" aria-labelledby={`${ids}-dur`}>
        {DURACIONES_REEL.map((d) => (
          <button key={d.segundos} type="button" className="filter-chip" aria-pressed={segundos === d.segundos} onClick={() => cambiarDuracion(d.segundos)}>{d.nombre}</button>
        ))}
      </div>
      {segundos === 8 && <p className="hint">Veo 3.1 Fast cuesta más o menos la mitad. Con fotogramas usa hasta 3 de referencia (el primero, uno del medio y el último).</p>}
      {soloFlow(segundos) && <p className="hint">Para Flow: {Math.ceil(segundos / SEGUNDOS_POR_CLIP)} clips de {SEGUNDOS_POR_CLIP} s con Gemini Omni, en una sola instrucción. Aquí no se crea por API.</p>}
    </div>
  );

  /** La carpeta del reel: la galería la enseña como UNA tarjeta (los videos, el último primero, y los fotogramas). */
  const prepararCarpeta = async () => {
    if (!carpeta.current) carpeta.current = await api.carpetaDeGrupo(clienteId, "reel", idea);
  };
  const ordenFinal = [...videos.map((v) => v?.id), ...fotos.map((f) => f?.archivo?.id)].filter(Boolean).join(",");
  useEffect(() => {
    if (!carpeta.current || ocupado || !ordenFinal) return;
    api.ordenarCarpeta(clienteId, carpeta.current, ordenFinal.split(",")).catch(() => { /* sin orden, la galería lo deduce */ });
  }, [ordenFinal, ocupado, clienteId]);

  const escribir = async () => {
    ocupar("guion");
    setAviso(null);
    try {
      const r = await api.guionDeReel(clienteId, { idea, segundos: duracion, preset, estilo, productoId: productoId || undefined, personajes, referenciaId: referenciaId || undefined });
      setGuion(r);
      setPaso("planos");
      setAviso({ ok: true, texto: ["Revisa los planos: qué se ve y la cámara. El video va limpio, sin texto.", r.aviso ?? ""].filter(Boolean).join(" ") });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  /** El director comercial mejora la idea y dice por qué; no se cambia nada hasta «Usar esta». */
  const revisarDirector = async () => {
    ocupar("director");
    setAviso(null);
    try {
      const r = await api.revisarComoDirector(clienteId, { idea, segundos: duracion, productoId: productoId || undefined });
      setRevision({ idea: r.idea, cambios: r.cambios ?? [] });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  const cambiarPlano = (i, campo, valor) => setGuion((g) => ({ ...g, planos: g.planos.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)) }));
  const quitarPlano = (i) => setGuion((g) => ({ ...g, planos: repartirTiempos(g.planos.filter((_, j) => j !== i), g.segundos) }));
  const anadirPlano = () => setGuion((g) => ({ ...g, planos: repartirTiempos([...g.planos, { escena: "", camara: "" }], g.segundos) }));

  const comunFotos = () => ({
    clienteId, modelo: modeloImagen, hilo: guion.hilo, estilo: estiloTexto, personajes: deLosPersonajes,
    fotos: api.fotosDelProducto(productos, productoId).map((f) => f.clave), referencias: refsMano, carpetaId: carpeta.current, seguir: () => vivo.current,
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
  const corregirFotograma = async (i) => {
    await unFotograma(i, () => editarImagen({ clienteId, modelo: modeloImagen, archivo: fotos[i].archivo, instruccion: correccion[i], ejemplos: ejemplosFoto[i] ?? [], carpetaId: carpeta.current, seguir: () => vivo.current }));
    setEjemplosFoto((e) => ({ ...e, [i]: [] }));
  };

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
  /** Un clip limpio por fotograma, todos a la vez (sin voz, sin música, sin texto: lo demás se pone en CapCut). */
  const crearLosClips = async () => {
    setConfirmar(null);
    setPaso("video");
    ocupar("clips");
    setClips(fotos.map((f) => (f?.archivo ? { cargando: true } : null)));
    setAviso({ ok: true, texto: `Creando ${conFotograma} clips a la vez: tardan unos minutos. Quedan en la galería.` });
    await prepararCarpeta();
    const salidaClips = await crearClips({
      clienteId, modelo: modeloClips, planos, fotogramas: fotos.map((f) => f?.archivo ?? null), hilo: guion.hilo, estilo: estiloTexto,
      personajes: lineaPersonajes, segundos: segundosClip, carpetaId: carpeta.current, seguir: () => vivo.current,
      alAvanzar: (i, r) => { if (vivo.current) setClips((x) => x.map((y, j) => (j === i ? r : y))); },
    });
    ocupar("");
    window.dispatchEvent(new Event("ia:gasto"));
    if (!vivo.current) return;
    const bien = salidaClips.filter((r) => r?.archivo).length;
    setAviso({ ok: bien > 0, texto: bien === conFotograma ? "Listos. Descárgalos en un ZIP, en orden, para editarlos." : `Salieron ${bien} de ${conFotograma}.` });
  };
  /** Los clips en un ZIP, numerados en el orden de los planos. */
  const bajarClips = async () => {
    setBajando(true);
    try {
      const hechos = clips.map((c, i) => (c?.archivo ? { archivo: c.archivo, i } : null)).filter(Boolean);
      const archivos = await Promise.all(hechos.map(async ({ archivo, i }) => {
        const r = await fetch(archivo.src, { credentials: "same-origin" });
        if (!r.ok) throw new Error(`No se pudo bajar el clip ${i + 1}.`);
        return { nombre: `${String(i + 1).padStart(2, "0")}-plano-${i + 1}.mp4`, datos: new Uint8Array(await r.arrayBuffer()) };
      }));
      const url = URL.createObjectURL(new Blob([crearZip(archivos)], { type: "application/zip" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `clips-${String(client.name ?? "reel").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.zip`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setBajando(false);
    }
  };

  const corregirElTramo = async () => {
    const video = videos[0];
    if (!video || !paraTramo || !tramoCambio.cambio.trim()) return;
    ocupar("tramo");
    setAviso({ ok: true, texto: `Corrigiendo del segundo ${tramoCambio.desde} al ${tramoCambio.hasta}…` });
    try {
      const nuevo = await corregirTramo({ clienteId, modelo: paraTramo, video, ...tramoCambio, ejemplos: ejemplosTramo, segundos, carpetaId: carpeta.current, seguir: () => vivo.current });
      if (!vivo.current) return;
      setVideos((v) => [nuevo, ...v]);
      setTramoCambio((t) => ({ ...t, cambio: "" }));
      setEjemplosTramo([]);
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
          <IdeasDeFormato clienteId={clienteId} formato="reel" preset={preset} productoId={productoId} segundos={duracion} onUsar={(i) => setIdea(i.idea)} />
          <div className="field">
            <label className="label" htmlFor={`${ids}-idea`}>La idea central</label>
            <textarea id={`${ids}-idea`} className="input" rows={3} maxLength={1500} value={idea} onChange={(e) => setIdea(e.target.value)}
              placeholder="Caja grande de wipes Nateen: 960 por $45. Piel sensible protegida desde el primer uso." />
            <p className="hint">La promoción, el beneficio o lo que quieres contar. La IA propone el guion de {duracion} s por planos, con la música y la locución, siguiendo el criterio comercial de la agencia.</p>
            <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(ocupado) || !idea.trim()} onClick={revisarDirector}>
              <Icon name="sparkles" size={14} /> {ocupado === "director" ? "Revisando…" : "Revisar como director comercial"}
            </button>
          </div>
          {revision && (
            <div className="card" role="region" aria-label="La revisión del director comercial">
              <p style={{ margin: 0 }}><strong>Así funcionaría mejor:</strong> {revision.idea}</p>
              {revision.cambios.length > 0 && (
                <ul className="hint" style={{ margin: "var(--sp-2) 0" }}>{revision.cambios.map((c, i) => <li key={i}>{c}</li>)}</ul>
              )}
              <div className="lote-fila">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { setIdea(revision.idea); setRevision(null); }}>Usar esta</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevision(null)}>Quedarme con la mía</button>
              </div>
            </div>
          )}
          {referencias.length > 0 && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-ref`}>Seguir un anuncio que ya funciona (opcional)</label>
              <select id={`${ids}-ref`} className="input" value={referenciaId} onChange={(e) => setReferenciaId(e.target.value)}>
                <option value="">Ninguno</option>
                {referencias.map((r) => <option key={r.id} value={r.id}>{[r.competidor || "Referencia", r.medio === "video" ? "video" : "imagen", r.analisis?.gancho].filter(Boolean).join(" · ").slice(0, 110)}</option>)}
              </select>
              <p className="hint">El guion copia su forma —orden, ritmo, gancho y cierre— con tu marca y tu producto. Sin idea escrita, usa la que propuso el análisis.</p>
            </div>
          )}
          {selectorDuracion}
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
          <div className="field">
            <span className="label">Referencias para los fotogramas</span>
            <ReferenciasGaleria archivos={estudio?.archivos ?? []} elegidas={refsMano} onCambiar={setRefsMano} max={3} etiqueta="Añadir referencia de la galería" />
            <p className="hint">Un ambiente, un estilo, el producto o una persona: dile qué tomar de cada una. Van en todos los fotogramas.</p>
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
          {/* Lo principal: el guion entero para Flow, en una sola instrucción, con la marca dentro. */}
          <div className="notice reel-flow" style={{ display: "block" }}>
            <p style={{ margin: 0 }}><strong>Para Flow (Gemini Omni)</strong>{largo ? ` · ${Math.ceil(segundos / SEGUNDOS_POR_CLIP)} clips de ${SEGUNDOS_POR_CLIP} s en una sola instrucción` : ""}</p>
            <p className="hint" style={{ margin: 0 }}>Lleva la marca, la continuidad, cada plano, la música y la locución; el video, sin texto. Sube en Flow las imágenes que dice el prompt (logo, personajes, producto).</p>
            <div className="reel-flow-acciones">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigator.clipboard.writeText(paraFlow).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }).catch(() => setAviso({ ok: false, texto: "No se pudo copiar: ábrelo en «Ver el prompt» y cópialo a mano." }))}>
                <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiado" : "Copiar para Flow"}
              </button>
              <span role="status" className="sr-only">{copiado ? "Prompt copiado" : ""}</span>
            </div>
            <details><summary className="hint">Ver el prompt</summary><pre className="reel-flow-prompt">{paraFlow}</pre></details>
          </div>
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
                  <label className="sr-only" htmlFor={`${ids}-pc-${i}`}>Cámara del plano {p.n}</label>
                  <input id={`${ids}-pc-${i}`} className="input" maxLength={160} value={p.camara} placeholder="Cámara" onChange={(e) => cambiarPlano(i, "camara", e.target.value)} />
                  {planos.length > MIN_PLANOS && <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitarPlano(i)}><Icon name="trash" size={14} /> Quitar</button>}
                </div>
              </li>
            ))}
          </ol>
          {planos.length < maxPlanos(segundos) && <button type="button" className="btn btn-ghost btn-sm" onClick={anadirPlano}><Icon name="plus" size={14} /> Añadir plano</button>}
          {selectorDuracion}
          <fieldset className="reel-sonido">
            <legend className="label">El sonido (va en el mismo pedido del video)</legend>
            <div className="field">
              <label className="label" htmlFor={`${ids}-mus`}>Música</label>
              <input id={`${ids}-mus`} className="input" maxLength={300} value={guion.musica ?? ""} placeholder="Pop suave y alegre, ritmo medio, sube en el cierre"
                onChange={(e) => setGuion((g) => ({ ...g, musica: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-loc`}>Locución (lo que dice la voz) <span className="hint">({palabras}/{maxPalabras} palabras)</span></label>
              <textarea id={`${ids}-loc`} className="input" rows={2} maxLength={500} value={guion.locucion ?? ""} placeholder="Vacío si va sólo con música"
                onChange={(e) => setGuion((g) => ({ ...g, locucion: e.target.value }))} />
              {palabras > maxPalabras && <p className="revision-problema">No cabe en {segundos} s: quita {palabras - maxPalabras} palabra{palabras - maxPalabras === 1 ? "" : "s"}.</p>}
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-efe`}>Efectos de sonido</label>
              <input id={`${ids}-efe`} className="input" maxLength={300} value={guion.efectos ?? ""} placeholder="Risas de bebé, ambiente de casa"
                onChange={(e) => setGuion((g) => ({ ...g, efectos: e.target.value }))} />
            </div>
            <p className="hint">La música de tendencia de Instagram no se puede poner por la API: si la quieres, deja la música vacía y añádela al publicar («La publico yo»).</p>
          </fieldset>
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
                  <p className="hint" style={{ margin: 0 }}>{p.escena}</p>
                  {f?.error && <p className="revision-problema">{f.error}</p>}
                  {paso === "fotogramas" && !ocupado && f && !f.cargando && (
                    <div className="carrusel-lamina-acciones">
                      {f.archivo && (
                        <>
                          <form className="carrusel-corregir" onSubmit={(e) => { e.preventDefault(); if (correccion[i]?.trim()) corregirFotograma(i); }}>
                            <label className="sr-only" htmlFor={`${ids}-fc-${i}`}>Qué corregir en el fotograma {p.n}</label>
                            <input id={`${ids}-fc-${i}`} className="input" maxLength={300} value={correccion[i] ?? ""} placeholder="Que la mamá sonría…" onChange={(e) => setCorreccion((c) => ({ ...c, [i]: e.target.value }))} />
                            <button type="submit" className="btn btn-secondary btn-sm" disabled={!correccion[i]?.trim()}><Icon name="wand" size={14} /> Corregir</button>
                          </form>
                          <ReferenciasGaleria compacto archivos={estudio?.archivos ?? []} elegidas={ejemplosFoto[i] ?? []} onCambiar={(l) => setEjemplosFoto((e) => ({ ...e, [i]: l }))}
                            max={Math.max(1, (modeloImagen?.referencias ?? 2) - 1)} etiqueta="Ejemplo de la galería" />
                          <GuardarRegla clienteId={clienteId} texto={correccion[i]} />
                        </>
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
        <fieldset className="field" style={{ margin: 0 }}>
          <legend className="label">Qué sale de los fotogramas</legend>
          <label className="est-logo-casilla">
            <input type="radio" name={`${ids}-salida`} checked={salida === "uno"} onChange={() => setSalida("uno")} />
            <span><strong>Un solo video con todo</strong> · los fotogramas como storyboard, de {segundos} s, listo para subir</span>
          </label>
          <label className="est-logo-casilla">
            <input type="radio" name={`${ids}-salida`} checked={salida === "clips"} onChange={() => setSalida("clips")} />
            <span><strong>Un clip limpio por fotograma</strong> · {conFotograma} videos sin texto, voz ni música, para editarlos en CapCut</span>
          </label>
        </fieldset>
      )}

      {paso === "fotogramas" && !ocupado && listos.length > 0 && salida === "clips" && (
        <div className="lote-fila">
          <div className="field">
            <label className="label" htmlFor={`${ids}-mc`}>Modelo de los clips</label>
            <select id={`${ids}-mc`} className="input" value={modeloClips?.id ?? ""} onChange={(e) => setModeloClipsId(e.target.value)}>
              {modelosClips.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${etiquetaDeCosto(m)}`}</option>)}
            </select>
          </div>
          {duracionesClip.length > 0 && (
            <div className="field">
              <label className="label" htmlFor={`${ids}-sc`}>Cada clip dura</label>
              <select id={`${ids}-sc`} className="input" value={duracionesClip.find((d) => d >= segundosClip) ?? duracionesClip.at(-1)} onChange={(e) => setSegundosClip(Number(e.target.value))}>
                {duracionesClip.map((d) => <option key={d} value={d}>{d} s</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {paso === "fotogramas" && !ocupado && listos.length > 0 && salida === "uno" && (
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor={`${ids}-mv`}>Modelo del video</label>
          <select id={`${ids}-mv`} className="input" value={modeloVideo?.id ?? ""} onChange={(e) => setModeloVideoId(e.target.value)}>
            {modelosVideo.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${etiquetaDeCosto(m)}`} · {m.referencias >= 2 ? "con el storyboard" : "desde el primer fotograma"}</option>)}
          </select>
          {conVoz && guion?.locucion?.trim() && (
            <>
              <label className="label" htmlFor={`${ids}-voz`} style={{ marginTop: "var(--sp-2)" }}>Voz de la locución</label>
              <select id={`${ids}-voz`} className="input" value={voz} onChange={(e) => setVoz(e.target.value)}>
                <option value="">La que escoja el modelo</option>
                {Object.entries(VOCES_OMNI).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
              <p className="hint">Voces fijas de Google: el idioma lo da el texto. Registrar la voz no cuesta nada.</p>
            </>
          )}
          {!conVoz && guion?.locucion?.trim() && <p className="hint">{sinVozPropia(modeloVideo) ? `${modeloVideo?.nombre} va sin voz (la inventa mal en español): sólo música y efectos. Para la locución, Gemini Omni (Kie) con la voz de la marca.` : `${modeloVideo?.nombre} no deja escoger la voz: pone la suya. Para escogerla, Gemini Omni (Kie).`}</p>}
        </div>
      )}

      {paso === "video" && salida === "clips" && (
        <div className="reel-video">
          <ol className="carrusel-laminas">
            {clips.map((c, i) => c && (
              <li key={i} className="revision-item carrusel-lamina">
                {c.archivo ? <video src={c.archivo.src} controls playsInline preload="metadata" aria-label={`Clip ${i + 1}`} />
                  : <p className="hint">{c.cargando ? `Clip ${i + 1}: creándolo…` : `Clip ${i + 1}: ${c.error}`}</p>}
                <p className="hint" style={{ margin: 0 }}>{tramo(planos[i] ?? { desde: 0, hasta: 0 })} {planos[i]?.escena}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {paso === "video" && salida === "uno" && (
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
              <ReferenciasGaleria compacto archivos={estudio?.archivos ?? []} elegidas={ejemplosTramo} onCambiar={setEjemplosTramo} max={3} etiqueta="Ejemplo de la galería" />
              <p className="hint">Al corregir un tramo, el modelo puede rehacer también el sonido de esos segundos.</p>
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
            <button type="button" className="btn btn-primary" onClick={confirmar === "video" ? crearElVideo : confirmar === "clips" ? crearLosClips : crearLosFotogramas}>
              Sí, {confirmar === "video" ? `crear el video por ${textoCosto(costoVideo)}` : confirmar === "clips" ? `crear ${conFotograma} clips por ${textoCosto(costoClips)}` : `crear ${planos.length} fotogramas por ${textoCosto(costoFotos)}`}
            </button>
          </>
        ) : (
          <>
            {paso === "idea" && (
              <button type="button" className="btn btn-primary" disabled={Boolean(ocupado) || (!idea.trim() && !referenciaId)} onClick={escribir}>
                <Icon name="sparkles" size={18} /> {ocupado === "guion" ? "Escribiendo el guion…" : `Proponer el guion de ${duracion} s`}
              </button>
            )}
            {paso === "planos" && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("idea")}>Volver</button>
                {largo ? <p className="lote-costo">{segundos} s: cópialo arriba y pégalo en Flow.</p> : (
                  <>
                    <p className="lote-costo">O aquí por API: {planos.length} fotogramas · <strong>{textoCosto(costoFotos)}</strong> (aprox.)</p>
                    <button type="button" className="btn btn-secondary" disabled={!modeloImagen || planos.some((p) => !p.escena.trim())} onClick={() => pedirConConfirmar("fotogramas", costoFotos, crearLosFotogramas)}>
                      <Icon name="image" size={18} /> Crear aquí por API
                    </button>
                  </>
                )}
              </>
            )}
            {paso === "fotogramas" && (
              <>
                {!ocupado && <button type="button" className="btn btn-ghost" onClick={() => setPaso("planos")}>Volver a los planos</button>}
                <p className="lote-costo">{ocupado ? "Creando los fotogramas, en orden…" : salida === "clips" ? `${conFotograma} clips · ${textoCosto(costoClips)} (aprox.)` : `Video de ${segundos} s · ${textoCosto(costoVideo)} (aprox.)`}</p>
                {!ocupado && listos.length > 0 && salida === "uno" && (
                  <button type="button" className="btn btn-primary" disabled={!pedidoVideo} onClick={() => pedirConConfirmar("video", costoVideo, crearElVideo)}>
                    <Icon name="video" size={18} /> Crear el video
                  </button>
                )}
                {!ocupado && listos.length > 0 && salida === "clips" && (
                  <button type="button" className="btn btn-primary" disabled={!modeloClips} onClick={() => pedirConConfirmar("clips", costoClips, crearLosClips)}>
                    <Icon name="video" size={18} /> Crear {conFotograma} clips limpios
                  </button>
                )}
              </>
            )}
            {paso === "video" && !ocupado && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("fotogramas")}>Volver al storyboard</button>
                {salida === "clips" && clips.some((c) => c?.archivo) && (
                  <button type="button" className="btn btn-primary" disabled={bajando} onClick={bajarClips}>
                    <Icon name="download" size={18} /> {bajando ? "Preparando el ZIP…" : `Descargar los ${clips.filter((c) => c?.archivo).length} clips (ZIP)`}
                  </button>
                )}
                {salida === "uno" && onPoner && videos[0] && (
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
