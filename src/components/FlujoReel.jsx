import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { textoCosto, estimar, costoDePieza, etiquetaDeCosto, CONFIRMAR_DESDE, VOCES_OMNI } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import { TIPOS_PRESET, ESTILOS_VISUALES, limpiarKit, referenciasDePersonajes, estiloDeMarca, bloqueDeMarca } from "../lib/kitMarca";
import { repartirTiempos, tramo, maxPlanos, MIN_PLANOS, ajustarDuracion, locucionQueCabe, PALABRAS_POR_SEGUNDO, promptParaFlow, sinVozPropia } from "../lib/reel";
import { modelosParaCarrusel, modeloParaCarrusel } from "../lib/carruselEstudio";
import { modelosParaReel, modeloRecomendadoParaReel, modeloParaTramo, crearFotograma, editarImagen, pedidoDeVideo, corregirTramo, modelosParaClips, modeloParaClips, pedidoDeClip } from "../lib/reelEstudio";
import { duracionesDeReel, haceDuracion, duracionDeClip, DURACION_REEL_POR_DEFECTO } from "../lib/duracionesVideo";
import { resultadoDeReel, finalDePaso } from "../lib/encargoReelPuro";
import { lanzarReel, continuarReel, montarReel, fotogramaFinal, listarEncargos, leerEncargo, seguirEncargo } from "../lib/encargosApi";
import { textoDelGuionReel } from "../lib/montajeReel";
import { crearZip } from "../lib/zip";
import { CopyButton } from "./calendario/primitivas";
import ReferenciasGaleria from "./ReferenciasGaleria";
import GuardarRegla from "./GuardarRegla";
import IdeasDeFormato from "./IdeasDeFormato";
import { editaLaAgencia } from "../lib/sesionActual";
import "./calendario/RevisionMes.css";
import "./calendario/CarruselIA.css";
import "./EstudioLote.css";

// ============================================================
// El reel por planos, hecho en el SERVIDOR y terminado aquí
//
//   1. Idea: la promoción, el beneficio o la idea central; el tipo, el estilo, el producto y los personajes. La IA
//      propone el guion (lee el que ya tiene la publicación, si lo tiene).
//   2. Planos: qué se ve y la cámara de cada uno, lo que se DICE y lo que se LEE (el gancho, el llamado). El video va
//      limpio: el texto lo pone el montaje, escrito por el código.
//   3. Fotogramas: uno por plano, en orden. Los hace el SERVIDOR (un encargo de tipo «reel»): se puede cerrar esto y
//      retomarlo («Seguir con…» en el paso 1). Se corrigen o se rehacen antes de pagar el video.
//   4. Video: un video con todo (el storyboard) o un clip limpio por plano, y «Montarlo aquí»: la voz de la marca
//      (ElevenLabs, con el tiempo de cada palabra), el gancho escrito, los subtítulos, el logo, el llamado y la música,
//      por el render del video animado. Los clips también se bajan en un ZIP para CapCut. Lo que sale se pone SOLO en
//      su publicación (y su caption, guion y portada si estaban vacíos).
//
// Las duraciones salen de las llaves que hay (lib/duracionesVideo.js): lo que un modelo hace en un video va en uno; lo
// que pasa de ahí, por clips y montaje. «Copiar para Flow» sigue, como opción manual.
//
// Lo usan la pestaña Estudio («Video») y «Crear reel con IA» de una publicación.
// ============================================================

const PASOS = [["idea", "Idea"], ["planos", "Planos"], ["fotogramas", "Fotogramas"], ["video", "Video"]];

// La receta «Video del producto» (10–15 s, termina en la foto real y el logo) es la otra forma de este mismo flujo: va
// aquí y no como opción del compositor porque el chunk del Estudio está en su tope (rendimiento.bundle.test.js).
const FlujoVideoProducto = lazy(() => import("./FlujoVideoProducto"));
const VideoAnimado = lazy(() => import("./VideoAnimado"));
// La estructura de guion de la voz en off y «Guardar como estructura»: en su chunk (este flujo se precarga con el
// Estudio, que está en su tope: un import fijo sumaría sus archivos a la lista de precarga del Estudio).
const SelectorEstructura = lazy(() => import("./SelectorEstructura"));
const GuardarEstructura = lazy(() => import("./GuardarEstructura"));
const FORMAS = [
  ["guion", "Por planos", "La idea, el storyboard, el video y el montaje con voz, texto y logo"],
  ["producto", "Del producto", "10–15 s que terminan en su foto real y el logo"],
  ["animado", "Animado con código", "Escenas dibujadas, una locución y subtítulos: 30 s a 2 min"],
];
const FASE_MONTAJE = {
  nuevo: "Montando…", aprobar: "Aprobando el montaje…", voz: "Pidiendo la voz…", esperaVoz: "Generando la voz de la marca…",
  render: "Renderizando el mp4…", renderizando: "Renderizando el mp4…",
};

export default function FlujoReel({ client, estudio, inicial = {}, onPoner = null, onListo = null, cabecera = null, onCreando = () => {} }) {
  const ids = useId();
  const [forma, setForma] = useState(["producto", "animado"].includes(inicial.forma) ? inicial.forma : "guion");
  const [abrirVideoId, setAbrirVideoId] = useState(null);
  const clienteId = client?.dbId || client?.id;
  const kit = limpiarKit(estudio?.kit);
  const activos = useMemo(() => estudio?.activos ?? {}, [estudio?.activos]);
  const [paso, setPaso] = useState("idea");
  const [idea, setIdea] = useState(inicial.idea ?? "");
  const [preset, setPreset] = useState(inicial.preset ?? "");
  const [estilo, setEstilo] = useState("");
  const [productoId, setProductoId] = useState(inicial.productoId ?? "");
  const [personajes, setPersonajes] = useState([]);
  const [refsMano, setRefsMano] = useState([]); // de la galería, para los fotogramas
  const rutas = useMemo(() => duracionesDeReel(activos), [activos]);
  const [duracion, setDuracion] = useState(() => (rutas.some((d) => d.segundos === DURACION_REEL_POR_DEFECTO) ? DURACION_REEL_POR_DEFECTO : rutas[0]?.segundos ?? DURACION_REEL_POR_DEFECTO));
  // Un anuncio que ya funciona (referencias analizadas del estudio de mercado): el guion sigue su estructura.
  const [referencias, setReferencias] = useState([]);
  const [referenciaId, setReferenciaId] = useState(inicial.referenciaId ?? "");
  // La ESTRUCTURA de guion de la agencia que sigue la voz en off ("" = la escoge la IA) y «Guardar como estructura».
  const [estructuraId, setEstructuraId] = useState("");
  const [sacarEstructura, setSacarEstructura] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [voz, setVoz] = useState(() => kit.voz || ""); // la voz de Omni (sólo un video de Omni con su propia voz)
  const [ejemplosFoto, setEjemplosFoto] = useState({}); // i → [ejemplos de la galería]
  const [ejemplosTramo, setEjemplosTramo] = useState([]);
  const [guion, setGuion] = useState(null); // { hilo, planos, musica, locucion, efectos, descripcion, gancho, llamado, segundos }
  const [correccion, setCorreccion] = useState({}); // i → texto
  const [tocando, setTocando] = useState({}); // i → true mientras se corrige o rehace un fotograma
  const [versiones, setVersiones] = useState([]); // videos corregidos por tramos (la última primero)
  const [tramoCambio, setTramoCambio] = useState({ desde: 0, hasta: 3, cambio: "" });
  const [modeloImagenId, setModeloImagenId] = useState("");
  const [modeloVideoId, setModeloVideoId] = useState("");
  // Qué sale de los fotogramas: UN video con todo (el storyboard) o un clip LIMPIO por fotograma (para montar aquí).
  const [salida, setSalida] = useState("uno");
  const [modeloClipsId, setModeloClipsId] = useState("");
  const [revisar, setRevisar] = useState(true);
  const [montar, setMontar] = useState(true);
  const [bajando, setBajando] = useState(false);
  const [revision, setRevision] = useState(null); // { idea, cambios }: lo que propone el director comercial
  const [ocupado, setOcupado] = useState("");
  const [confirmar, setConfirmar] = useState(null); // "lanzar" | "continuar" | null
  const [aviso, setAviso] = useState(null);
  // El encargo del servidor que lleva el reel, y los archivos que ya salieron.
  const [encargo, setEncargo] = useState(null);
  const [archivosEnc, setArchivosEnc] = useState(() => new Map());
  const [anteriores, setAnteriores] = useState([]); // los reels de este cliente que se pueden retomar
  const carpeta = useRef(null);
  const vivo = useRef(true);
  const siguiendo = useRef(null);
  const puestoAvisado = useRef(false);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => {
    let sigue = true;
    import("../lib/mercado").then(({ leerMercado }) => leerMercado(clienteId))
      .then((m) => { if (sigue) setReferencias((m?.referencias ?? []).filter((r) => r.analisis)); })
      .catch(() => { /* sin estudio de mercado, sin referencias */ });
    listarEncargos(clienteId).then((l) => { if (sigue) setAnteriores(l.filter((e) => e.tipo === "reel")); }).catch(() => {});
    return () => { sigue = false; };
  }, [clienteId]);

  const productos = estudio?.productos ?? [];
  const modelosImagen = useMemo(() => modelosParaCarrusel(activos), [activos]);
  // Las listas van del más barato al más caro; si nadie escoge, el recomendado.
  const modeloImagen = modelosImagen.find((m) => m.id === modeloImagenId) ?? modelosImagen.find((m) => m.id === modeloParaCarrusel(activos).id) ?? modelosImagen[0] ?? null;
  const segundos = guion?.segundos ?? duracion;
  const ruta = rutas.find((d) => d.segundos === segundos) ?? null;
  // UN video sólo con un modelo que haga esa duración exacta: lo que pasa de ahí, por clips.
  const modelosVideo = useMemo(() => modelosParaReel(activos).filter((m) => haceDuracion(m, segundos)), [activos, segundos]);
  const modeloVideo = modelosVideo.find((m) => m.id === modeloVideoId) ?? modelosVideo.find((m) => m.id === ruta?.modelos?.[0]) ?? modelosVideo.find((m) => m.id === modeloRecomendadoParaReel(activos)?.id) ?? modelosVideo[0] ?? null;
  const modelosClips = useMemo(() => modelosParaClips(activos), [activos]);
  const modeloClips = modelosClips.find((m) => m.id === modeloClipsId) ?? modeloParaClips(activos);
  const salidaReal = salida === "uno" && !modeloVideo ? "clips" : salida;
  const paraTramo = modeloParaTramo(activos);
  const planos = guion?.planos ?? [];
  const estiloTexto = estiloDeMarca(kit, preset, { marca: client.name, rubro: client.industry ?? "", estilo });
  const deLosPersonajes = referenciasDePersonajes(kit, personajes, estudio?.archivos ?? []);
  const lineaPersonajes = deLosPersonajes.map((p) => `Personaje: ${p.nota}.`).filter((v, i, l) => l.indexOf(v) === i).join(" ");
  const fotosProducto = api.fotosDelProducto(productos, productoId).map((f) => f.clave);
  const costoFotos = modeloImagen ? Math.round(planos.length * estimar(modeloImagen, 1, { imageSize: "2K" }) * 1000) / 1000 : 0;
  const maxPalabras = Math.floor(segundos * PALABRAS_POR_SEGUNDO);
  const palabras = String(guion?.locucion ?? "").trim().split(/\s+/).filter(Boolean).length;
  const ocupar = (q) => { setOcupado(q); onCreando(Boolean(q)); };

  // Lo que ya salió en el servidor.
  const res = encargo ? resultadoDeReel(encargo, archivosEnc) : null;
  const fotos = res?.fotos ?? [];
  const listos = fotos.map((f) => f?.archivo).filter(Boolean);
  const videoListo = res?.video ?? null;
  const videos = [...versiones, ...(videoListo ? [videoListo] : [])];
  const clips = res?.clips ?? [];
  const montaje = res?.montaje ?? null;
  const enMarcha = Boolean(res?.enMarcha);

  /** Lo que costará el video (o los clips) con lo escogido. */
  const costoDelVideo = () => {
    if (!guion) return 0;
    if (salidaReal === "uno" && modeloVideo) {
      const p = pedidoDeVideo({ modelo: modeloVideo, planos, hilo: guion.hilo, musica: guion.musica, locucion: guion.locucion, efectos: guion.efectos, voz, segundos, estilo: estiloTexto, fotogramas: listos.length ? listos : [{ clave: "x" }], sinVoz: montar });
      return estimar(modeloVideo, 1, p.ajustes);
    }
    if (modeloClips) {
      return Math.round(planos.reduce((t, pl) => {
        const s = duracionDeClip(modeloClips, Math.max(1, pl.hasta - pl.desde));
        return t + estimar(modeloClips, 1, pedidoDeClip({ modelo: modeloClips, plano: pl, fotograma: { clave: "x" }, segundos: s }).ajustes);
      }, 0) * 1000) / 1000;
    }
    return 0;
  };
  const costoVideo = costoDelVideo();

  /** El prompt para Flow: todo lo que Flow no sabe, en una sola instrucción (opción manual). */
  const producto = productos.find((p) => p.id === productoId);
  const paraFlow = guion ? promptParaFlow({
    guion: { ...guion, segundos }, marca: client.name, rubro: client.industry ?? "", identidad: bloqueDeMarca(kit), estilo: estiloTexto,
    personajes: kit.personajes.filter((p) => personajes.includes(p.id)).map((p) => ({ nombre: p.nombre, descripcion: p.descripcion })),
    producto: producto ? `${producto.nombre}${producto.precio ? ` (${producto.precio})` : ""}` : "",
    ingredientes: [
      kit.logo && `el logo de ${client.name}`,
      ...kit.personajes.filter((p) => personajes.includes(p.id)).map((p) => `el retrato de ${p.nombre}`),
      producto && fotosProducto.length && `la foto de ${producto.nombre}`,
    ].filter(Boolean),
  }) : "";

  /** Otra duración: los planos se reparten en el tiempo nuevo y, si ninguna lo hace en un video, van por clips. */
  const cambiarDuracion = (d) => {
    setDuracion(d);
    setGuion((g) => (g ? { ...g, segundos: d, planos: ajustarDuracion(g.planos, d), locucion: locucionQueCabe(g.locucion, d) } : g));
    const opcion = rutas.find((x) => x.segundos === d);
    if (opcion?.ruta === "clips") setSalida("clips");
    else if (opcion) { setSalida("uno"); setModeloVideoId(opcion.modelos[0] ?? ""); }
    setTramoCambio((t) => ({ ...t, desde: Math.min(t.desde, d - 1), hasta: Math.min(t.hasta, d) }));
  };
  const selectorDuracion = (
    <div className="field">
      <span className="label" id={`${ids}-dur`}>Duración</span>
      <div className="est-tipos" role="group" aria-labelledby={`${ids}-dur`}>
        {rutas.map((d) => (
          <button key={d.segundos} type="button" className="filter-chip" aria-pressed={segundos === d.segundos} disabled={Boolean(encargo)} onClick={() => cambiarDuracion(d.segundos)}>{d.nombre}</button>
        ))}
      </div>
      {ruta && <p className="hint">{ruta.ayuda}</p>}
      {!rutas.length && <p className="hint">No hay ningún modelo de video con llave (Ajustes → IA): sólo se puede copiar el guion para Flow.</p>}
    </div>
  );

  /** La carpeta del reel: la galería la enseña como UNA tarjeta (el servidor la ordena al terminar). */
  const prepararCarpeta = async () => {
    if (!carpeta.current) carpeta.current = await api.carpetaDeGrupo(clienteId, "reel", idea || guion?.titulo || "Reel");
    return carpeta.current;
  };

  /** Sigue el encargo mientras se mira (el servidor lo lleva aunque se cierre esto). */
  const seguir = (id) => {
    if (siguiendo.current === id) return;
    siguiendo.current = id;
    seguirEncargo({
      clienteId, id, seguir: () => vivo.current && siguiendo.current === id,
      alCambio: (e, archivos) => {
        if (!vivo.current) return;
        setEncargo(e);
        setArchivosEnc((a) => new Map([...a, ...archivos]));
      },
    }).then((e) => {
      if (siguiendo.current === id) siguiendo.current = null;
      if (!vivo.current || !e) return;
      window.dispatchEvent(new Event("ia:gasto"));
      if (e.estado === "fallido") setAviso({ ok: false, texto: e.error || "No salió." });
      else if (e.nota) setAviso({ ok: true, texto: e.nota });
    }).catch(() => { siguiendo.current = null; });
  };

  /** Abre un reel lanzado antes (se cerró la pantalla, o se pidió desde Claude): todo vuelve a donde iba. */
  const retomar = async (id) => {
    setAviso(null);
    try {
      const r = await leerEncargo(clienteId, id);
      const e = r.encargo;
      const g = e.reel?.reel;
      if (!g) throw new Error("Ese encargo no trae su guion.");
      setGuion(g);
      setDuracion(g.segundos);
      setIdea(e.titulo || idea);
      carpeta.current = e.reel.carpetaId ?? null;
      setEncargo(e);
      setArchivosEnc(new Map((r.archivos ?? []).map((a) => [a.id, a])));
      setSalida(e.reel.salida === "clips" ? "clips" : "uno");
      if (e.reel.video?.modelo) (e.reel.salida === "clips" ? setModeloClipsId : setModeloVideoId)(e.reel.video.modelo);
      const r2 = resultadoDeReel(e, new Map((r.archivos ?? []).map((a) => [a.id, a])));
      setPaso(r2.storyboardListo && !r2.esperaRevision && e.reel.salida !== "fotogramas" ? "video" : "fotogramas");
      if (e.estado === "en_marcha") seguir(e.id);
    } catch (err) {
      setAviso({ ok: false, texto: err.message });
    }
  };

  const escribir = async () => {
    ocupar("guion");
    setAviso(null);
    try {
      const r = await api.guionDeReel(clienteId, {
        idea, segundos: duracion, preset, estilo, productoId: productoId || undefined, personajes, referenciaId: referenciaId || undefined,
        estructuraId: estructuraId || undefined,
        // El guion que YA tiene la publicación: el reel lo sigue en vez de inventar otro.
        ...(inicial.guionPost ? { guionPost: inicial.guionPost } : {}), ...(inicial.postId ? { postId: inicial.postId } : {}),
        montaje: true,
      });
      setGuion(r);
      setPaso("planos");
      setSacarEstructura(false);
      setAviso({ ok: true, texto: ["Revisa los planos: qué se ve, lo que se dice y lo que se lee. El video va limpio: el texto lo pone el montaje.", r.estructuraNombre ? `Sigue la estructura «${r.estructuraNombre}».` : "", r.aviso ?? ""].filter(Boolean).join(" ") });
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

  /** Lo de la pantalla que el servidor necesita para armar cada fotograma como a mano. */
  const comunParaServidor = () => ({
    modelo: modeloImagen.id, estilo: estiloTexto, lineaPersonajes,
    personajes: deLosPersonajes.map((p) => ({ clave: p.clave, nota: p.nota })), fotos: fotosProducto,
    referencias: refsMano.map((r) => ({ clave: r.clave, toma: r.toma ?? [], nota: r.nota ?? "" })),
  });
  const videoParaServidor = () => (salidaReal === "uno"
    ? { modelo: modeloVideo?.id ?? "", voz: montar ? "" : voz }
    : { modelo: modeloClips?.id ?? "" });

  /** Al servidor: el storyboard (y, si no se revisa, el video o los clips y el montaje). */
  const lanzar = async () => {
    setConfirmar(null);
    ocupar("lanzar");
    setAviso(null);
    try {
      const carpetaId = await prepararCarpeta();
      const r = await lanzarReel(clienteId, {
        titulo: String(guion.titulo || idea || "Reel").replace(/\s+/g, " ").slice(0, 120),
        reel: { ...guion, segundos }, comun: comunParaServidor(), salida: salidaReal, revisar,
        video: videoParaServidor(), montaje: montar ? { automatico: true } : null, carpetaId,
        ...(inicial.postId && inicial.calendarId ? { calendarId: inicial.calendarId, postId: inicial.postId } : {}),
      });
      setEncargo(r.encargo);
      setArchivosEnc(new Map((r.archivos ?? []).map((a) => [a.id, a])));
      setPaso("fotogramas");
      setAviso({ ok: true, texto: "Creando los fotogramas en el servidor, en orden: puedes cerrar esto y seguir después («Seguir con…» en el primer paso)." });
      seguir(r.encargo.id);
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
    }
  };

  /** Tras revisar el storyboard: el video o los clips (y el montaje), en el servidor. */
  const continuar = async () => {
    setConfirmar(null);
    ocupar("continuar");
    setAviso(null);
    try {
      const r = await continuarReel(clienteId, encargo.id, { salida: salidaReal, video: videoParaServidor(), montaje: montar ? { automatico: true } : null });
      setEncargo(r.encargo);
      setArchivosEnc((a) => new Map([...a, ...(r.archivos ?? []).map((x) => [x.id, x])]));
      setPaso("video");
      setAviso({ ok: true, texto: `${salidaReal === "clips" ? "Creando los clips" : "Creando el video"} en el servidor: tarda unos minutos. Puedes cerrar esto.` });
      seguir(encargo.id);
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
    }
  };

  /** «Montarlo aquí»: sólo el proyecto (para revisarlo), o terminado (voz, render y a la publicación). */
  const montarAqui = async ({ automatico = false, confirmadoVoz = false } = {}) => {
    ocupar("montar");
    setAviso(null);
    try {
      const r = await montarReel(clienteId, encargo.id, { automatico, confirmadoVoz });
      setEncargo(r.encargo);
      setArchivosEnc((a) => new Map([...a, ...(r.archivos ?? []).map((x) => [x.id, x])]));
      const m = r.encargo.reel?.montaje;
      if (!automatico && !confirmadoVoz && m?.videoId) {
        setAviso({ ok: true, texto: "Montado: revisa el video animado, apruébalo y renderízalo." });
      } else {
        setAviso({ ok: true, texto: "Montando en el servidor: la voz de la marca, el texto, los subtítulos y el logo. Puedes cerrar esto." });
        if (r.encargo.estado === "en_marcha") seguir(encargo.id);
      }
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
    }
  };

  // Con el storyboard hecho y el video en camino (sin revisar), se pasa solo a ver el video.
  const aVideo = paso === "fotogramas" && Boolean(res?.storyboardListo) && !res?.esperaRevision && encargo?.reel?.salida !== "fotogramas" && encargo?.reel?.video?.fase !== "espera";
  useEffect(() => { if (aVideo) setPaso("video"); }, [aVideo]);

  // Lo que el servidor ya puso en la publicación, también en el panel abierto (si no, su guardado al cerrar lo pisaría).
  useEffect(() => {
    const puesto = encargo?.reel?.puesto;
    if (!onPoner || !puesto?.postId || !videoListo || puestoAvisado.current) return;
    puestoAvisado.current = true;
    onPoner([videoListo], { reemplazar: true, descripcion: guion?.descripcion ?? "", guion: guion ? textoDelGuionReel(guion) : "", portada: listos[0]?.src ?? "", quedarse: true });
  }, [encargo, videoListo, onPoner, guion, listos]);
  // Y el mp4 del montaje terminado (lo pone el render en la publicación): el panel abierto lo recibe igual.
  const mp4Avisado = useRef(false);
  const montajeHecho = montaje?.fase === "hecho" && montaje.automatico && montaje.videoId ? montaje.videoId : null;
  useEffect(() => {
    if (!onPoner || !montajeHecho || mp4Avisado.current || !inicial.postId) return;
    mp4Avisado.current = true;
    import("../lib/videosApi").then(({ leerVideo }) => leerVideo(clienteId, montajeHecho)).then((v) => {
      const r = v?.render;
      if (!vivo.current || r?.estado !== "listo" || !r.clave) return;
      onPoner([{ id: r.archivoId, src: `/api/media/${r.clave}`, mime: "video/mp4", tipo: "video", ancho: r.ancho, alto: r.alto, prompt: v.titulo }], { reemplazar: true, quedarse: true });
    }).catch(() => { mp4Avisado.current = false; });
  }, [montajeHecho, onPoner, clienteId, inicial.postId]);

  /** Un fotograma corregido o rehecho a mano: el servidor lo toma como el de ese plano (el video y los clips salen de él). */
  const unFotograma = async (i, hacer) => {
    setTocando((t) => ({ ...t, [i]: true }));
    try {
      const archivo = await hacer();
      const p = encargo.pasos[i];
      setArchivosEnc((a) => new Map([...a, [archivo.id, archivo]]));
      for (let intento = 0; intento < 5; intento++) {
        try {
          const r = await fotogramaFinal(clienteId, encargo.id, p.id, archivo.id);
          if (vivo.current) setEncargo(r.encargo);
          break;
        } catch (e) {
          if (e?.estado !== 409) throw e;
          await new Promise((ok) => setTimeout(ok, 2500));
        }
      }
      setCorreccion((c) => ({ ...c, [i]: "" }));
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      if (vivo.current) setTocando((t) => ({ ...t, [i]: false }));
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };
  const archivoDe = (i) => fotos[i]?.archivo ?? null;
  const rehacerFotograma = (i) => unFotograma(i, async () => crearFotograma({
    clienteId, modelo: modeloImagen, hilo: guion.hilo, estilo: estiloTexto, personajes: deLosPersonajes, fotos: fotosProducto, referencias: refsMano,
    plano: planos[i], total: planos.length, anterior: archivoDe(i - 1) ?? archivoDe(1) ?? null, primero: i > 1 ? archivoDe(0) : null,
    carpetaId: carpeta.current, seguir: () => vivo.current,
  }));
  const corregirFotograma = async (i) => {
    await unFotograma(i, () => editarImagen({ clienteId, modelo: modeloImagen, archivo: archivoDe(i), instruccion: correccion[i], ejemplos: ejemplosFoto[i] ?? [], carpetaId: carpeta.current, seguir: () => vivo.current }));
    setEjemplosFoto((e) => ({ ...e, [i]: [] }));
  };

  /** Los clips en un ZIP, numerados en el orden de los planos (para CapCut). */
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
      enlace.download = `clips-${String(client.name ?? "reel").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.zip`;
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
      setVersiones((v) => [nuevo, ...v]);
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
  const costoLanzar = costoFotos + (revisar ? 0 : costoVideo);

  // Qué video: por planos (este flujo) o la receta del producto. Mientras se crea algo no se cambia (se perdería).
  const selectorForma = (paso === "idea" || forma !== "guion") && (
    <div className="est-formas-video flujo-reel-formas" role="radiogroup" aria-label="Qué video">
      {FORMAS.map(([id, nombre, ayuda]) => (
        <button key={id} type="button" role="radio" aria-checked={forma === id} className="est-forma-video" disabled={Boolean(ocupado)} onClick={() => { setAbrirVideoId(null); setForma(id); }}>
          <strong>{nombre}</strong>
          <span>{ayuda}</span>
        </button>
      ))}
    </div>
  );
  // El video animado no gasta en ningún motor de video: sus escenas las dibuja el código (VideoAnimado.jsx).
  if (forma === "animado") {
    return (
      <section className="card flujo-carrusel flujo-reel" aria-label="Video animado con código">
        {cabecera}
        {selectorForma}
        {abrirVideoId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setForma("guion"); setAbrirVideoId(null); }}><Icon name="chevronLeft" size={14} /> Volver al reel</button>}
        <Suspense fallback={<p className="hint">Cargando…</p>}>
          <VideoAnimado client={client?.dbId ? { ...client, id: client.dbId } : client} estudio={estudio} abrirId={abrirVideoId}
            publicacion={inicial.postId && !abrirVideoId ? { postId: inicial.postId, calendarId: inicial.calendarId ?? null, idea: inicial.idea ?? "" } : null} />
        </Suspense>
      </section>
    );
  }
  if (forma === "producto") {
    return (
      <section className="card flujo-carrusel flujo-reel" aria-label="Video del producto">
        {cabecera}
        {selectorForma}
        <Suspense fallback={<p className="hint">Cargando…</p>}>
          <FlujoVideoProducto client={client} estudio={estudio} inicial={inicial} onPoner={onPoner} onListo={onListo} onCreando={(si) => { ocupar(si ? "producto" : ""); }} />
        </Suspense>
      </section>
    );
  }

  /** Qué sale y con qué: lo mismo al lanzar (sin revisar) y al seguir tras revisar el storyboard. */
  const opcionesDelVideo = (
    <fieldset className="field" style={{ margin: 0 }}>
      <legend className="label">Qué sale de los fotogramas</legend>
      <label className="est-logo-casilla">
        <input type="radio" name={`${ids}-salida`} checked={salidaReal === "uno"} disabled={!modelosVideo.length} onChange={() => setSalida("uno")} />
        <span><strong>Un solo video con todo</strong> · los fotogramas como storyboard, de {segundos} s{!modelosVideo.length ? " (ningún modelo con llave hace esta duración en un video)" : ""}</span>
      </label>
      <label className="est-logo-casilla">
        <input type="radio" name={`${ids}-salida`} checked={salidaReal === "clips"} disabled={!modelosClips.length} onChange={() => setSalida("clips")} />
        <span><strong>Un clip limpio por plano</strong> · {planos.length} clips sin texto, voz ni música, para montarlos aquí (o bajarlos para CapCut)</span>
      </label>
      {salidaReal === "uno" ? (
        <div className="field">
          <label className="label" htmlFor={`${ids}-mv`}>Modelo del video</label>
          <select id={`${ids}-mv`} className="input" value={modeloVideo?.id ?? ""} onChange={(e) => setModeloVideoId(e.target.value)}>
            {modelosVideo.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${etiquetaDeCosto(m)}`} · {m.referencias >= 2 ? "con el storyboard" : "desde el primer fotograma"}</option>)}
          </select>
        </div>
      ) : (
        <div className="field">
          <label className="label" htmlFor={`${ids}-mc`}>Modelo de los clips</label>
          <select id={`${ids}-mc`} className="input" value={modeloClips?.id ?? ""} onChange={(e) => setModeloClipsId(e.target.value)}>
            {modelosClips.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${etiquetaDeCosto(m)}`}</option>)}
          </select>
          <p className="hint">Cada clip dura lo que su plano, en lo que el modelo admita.</p>
        </div>
      )}
      <label className="est-logo-casilla">
        <input type="checkbox" checked={montar} onChange={(e) => setMontar(e.target.checked)} />
        <span><strong>Montarlo aquí al terminar</strong> · la voz de la marca, el gancho escrito, los subtítulos, el logo y el llamado, en un mp4 que va a la publicación. La voz pide confirmar su costo antes.</span>
      </label>
      {salidaReal === "uno" && !montar && modeloVideo?.ajustes?.voz && guion?.locucion?.trim() && (
        <div className="field">
          <label className="label" htmlFor={`${ids}-voz`}>Voz de Omni (la del propio video)</label>
          <select id={`${ids}-voz`} className="input" value={voz} onChange={(e) => setVoz(e.target.value)}>
            <option value="">La que escoja el modelo</option>
            {Object.entries(VOCES_OMNI).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        </div>
      )}
      {salidaReal === "uno" && !montar && !modeloVideo?.ajustes?.voz && guion?.locucion?.trim() && (
        <p className="hint">{sinVozPropia(modeloVideo) ? `${modeloVideo?.nombre} va sin voz: con «Montarlo aquí», la pone la voz de la marca.` : `${modeloVideo?.nombre} pone su propia voz. Con «Montarlo aquí», la de la marca.`}</p>
      )}
    </fieldset>
  );

  return (
    <section className="card flujo-carrusel flujo-reel" aria-labelledby={`${ids}-t`}>
      {cabecera}
      {selectorForma}
      <h3 id={`${ids}-t`} className="sr-only">Crear un reel con IA</h3>
      <ol className="lote-pasos" aria-label="Pasos">
        {PASOS.map(([id, n], k) => <li key={id} aria-current={id === paso ? "step" : undefined} data-hecho={indice > k || undefined}>{k + 1}. {n}</li>)}
      </ol>
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>

      {paso === "idea" && (
        <div className="carrusel-opciones">
          {anteriores.length > 0 && !encargo && (
            <div className="field">
              <span className="label">Seguir con un reel de antes</span>
              <div className="lote-fila">
                {anteriores.slice(0, 4).map((e) => (
                  <button key={e.id} type="button" className="btn btn-secondary btn-sm" onClick={() => retomar(e.id)}>
                    <Icon name="refresh" size={14} /> {String(e.titulo || "Reel").slice(0, 40)} · {e.estado === "en_marcha" ? "en marcha" : e.nota ? String(e.nota).slice(0, 40) : e.estado}
                  </button>
                ))}
              </div>
            </div>
          )}
          <IdeasDeFormato clienteId={clienteId} formato="reel" preset={preset} productoId={productoId} segundos={duracion} onUsar={(i) => setIdea(i.idea)} />
          <div className="field">
            <label className="label" htmlFor={`${ids}-idea`}>La idea central</label>
            <textarea id={`${ids}-idea`} className="input" rows={3} maxLength={1500} value={idea} onChange={(e) => setIdea(e.target.value)}
              placeholder="Caja grande de wipes Nateen: 960 por $45. Piel sensible protegida desde el primer uso." />
            <p className="hint">La promoción, el beneficio o lo que quieres contar. La IA propone el guion de {duracion} s por planos, con lo que se dice y se lee, siguiendo el criterio comercial de la agencia{inicial.guionPost ? " y el guion que ya tiene la publicación" : ""}.</p>
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
          {/* La estructura de guion de la agencia que sigue la voz en off (o la escoge la IA). */}
          <Suspense fallback={null}>
            <SelectorEstructura uso="voz" value={estructuraId} onChange={setEstructuraId} disabled={Boolean(ocupado)} />
          </Suspense>
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
          {guion.estructuraNombre && <p className="hint" style={{ margin: 0 }}><Icon name="list" size={12} /> La voz sigue la estructura de la agencia «{guion.estructuraNombre}».</p>}
          <div className="lote-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-gancho`}>El gancho escrito (los primeros segundos)</label>
              <input id={`${ids}-gancho`} className="input" maxLength={60} value={guion.gancho ?? ""} placeholder="¿Piel sensible?" onChange={(e) => setGuion((g) => ({ ...g, gancho: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-cta`}>El llamado del cierre</label>
              <input id={`${ids}-cta`} className="input" maxLength={30} value={guion.llamado ?? ""} placeholder="Escríbenos hoy" onChange={(e) => setGuion((g) => ({ ...g, llamado: e.target.value }))} />
            </div>
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
                  <label className="sr-only" htmlFor={`${ids}-pd-${i}`}>Lo que se dice en el plano {p.n}</label>
                  <input id={`${ids}-pd-${i}`} className="input" maxLength={400} value={p.dice ?? ""} placeholder="Lo que se dice (voz)" onChange={(e) => cambiarPlano(i, "dice", e.target.value)} />
                  {i > 0 && i < planos.length - 1 && (
                    <>
                      <label className="sr-only" htmlFor={`${ids}-pt-${i}`}>Lo que se lee en el plano {p.n}</label>
                      <input id={`${ids}-pt-${i}`} className="input" maxLength={80} value={p.pantalla ?? ""} placeholder="Lo que se lee (opcional)" onChange={(e) => cambiarPlano(i, "pantalla", e.target.value)} />
                    </>
                  )}
                  {planos.length > MIN_PLANOS && <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitarPlano(i)}><Icon name="trash" size={14} /> Quitar</button>}
                </div>
              </li>
            ))}
          </ol>
          {planos.length < maxPlanos(segundos) && <button type="button" className="btn btn-ghost btn-sm" onClick={anadirPlano}><Icon name="plus" size={14} /> Añadir plano</button>}
          {selectorDuracion}
          <fieldset className="reel-sonido">
            <legend className="label">El sonido</legend>
            <div className="field">
              <label className="label" htmlFor={`${ids}-mus`}>Música</label>
              <input id={`${ids}-mus`} className="input" maxLength={300} value={guion.musica ?? ""} placeholder="Pop suave y alegre, ritmo medio, sube en el cierre"
                onChange={(e) => setGuion((g) => ({ ...g, musica: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-loc`}>Locución entera <span className="hint">({palabras}/{maxPalabras} palabras)</span></label>
              <textarea id={`${ids}-loc`} className="input" rows={2} maxLength={1200} value={guion.locucion ?? ""} placeholder="Vacío si va sólo con música"
                onChange={(e) => setGuion((g) => ({ ...g, locucion: e.target.value }))} />
              {palabras > maxPalabras && <p className="revision-problema">No cabe en {segundos} s: quita {palabras - maxPalabras} palabra{palabras - maxPalabras === 1 ? "" : "s"}.</p>}
              <p className="hint">Con «Montarlo aquí» la dice la voz de la marca (lo de cada plano, si lo escribiste; si no, esta repartida).</p>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-efe`}>Efectos de sonido</label>
              <input id={`${ids}-efe`} className="input" maxLength={300} value={guion.efectos ?? ""} placeholder="Risas de bebé, ambiente de casa"
                onChange={(e) => setGuion((g) => ({ ...g, efectos: e.target.value }))} />
            </div>
          </fieldset>
          {/* Una voz en off que salió bien → su estructura, para todos los clientes (la cambian admin y editores). */}
          {editaLaAgencia() && planos.filter((p) => String(p.dice ?? "").trim()).length >= 2 && (
            sacarEstructura
              ? <Suspense fallback={<p className="hint">Cargando…</p>}><GuardarEstructura client={client} reel={{ ...guion, segundos }} onCerrar={() => setSacarEstructura(false)} onAviso={(texto) => setAviso({ ok: true, texto })} /></Suspense>
              : (
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setSacarEstructura(true)} disabled={Boolean(ocupado)}
                  title="La forma de esta voz en off, sin su contenido, para escogerla con cualquier cliente (la IA la saca y tú la revisas)">
                  <Icon name="list" size={14} /> Guardar como estructura
                </button>
              )
          )}
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
          <label className="est-logo-casilla">
            <input type="checkbox" checked={revisar} onChange={(e) => setRevisar(e.target.checked)} />
            <span><strong>Revisar el storyboard antes de pagar el video</strong> · se para tras los fotogramas para corregirlos</span>
          </label>
          {!revisar && opcionesDelVideo}
          {/* La opción manual: el guion entero para Flow, en una sola instrucción, con la marca dentro. */}
          <details className="notice reel-flow" style={{ display: "block" }}>
            <summary><strong>Hacerlo en Flow (opcional)</strong></summary>
            <p className="hint" style={{ margin: 0 }}>Lleva la marca, la continuidad, cada plano, la música y la locución; el video, sin texto. Sube en Flow las imágenes que dice el prompt.</p>
            <div className="reel-flow-acciones">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(paraFlow).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }).catch(() => setAviso({ ok: false, texto: "No se pudo copiar: cópialo a mano de abajo." }))}>
                <Icon name={copiado ? "check" : "copy"} size={14} /> {copiado ? "Copiado" : "Copiar para Flow"}
              </button>
              <span role="status" className="sr-only">{copiado ? "Prompt copiado" : ""}</span>
            </div>
            <pre className="reel-flow-prompt">{paraFlow}</pre>
          </details>
        </div>
      )}

      {(paso === "fotogramas" || paso === "video") && (
        <ol className="carrusel-laminas reel-fotogramas">
          {planos.map((p, i) => {
            const f = fotos[i];
            const cargando = !f || f.cargando || tocando[i];
            return (
              <li key={i} className="revision-item carrusel-lamina">
                <div className="carrusel-lamina-vista reel-vista">
                  {f?.archivo && !tocando[i] ? <img src={f.archivo.src} alt={`Fotograma ${p.n}`} loading="lazy" /> : <span className="hint">{cargando ? "Creando…" : f?.error ? "Falló" : p.n}</span>}
                </div>
                <div className="carrusel-lamina-texto">
                  <strong>{tramo(p)}</strong>
                  <p className="hint" style={{ margin: 0 }}>{p.escena}</p>
                  {f?.error && <p className="revision-problema">{f.error}</p>}
                  {paso === "fotogramas" && !ocupado && res?.storyboardListo && !enMarcha && !tocando[i] && (
                    <div className="carrusel-lamina-acciones">
                      {f?.archivo && (
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

      {paso === "fotogramas" && res?.esperaRevision && listos.length > 0 && !ocupado && opcionesDelVideo}

      {paso === "video" && salidaReal === "clips" && clips.some(Boolean) && (
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

      {paso === "video" && salidaReal === "uno" && (
        <div className="reel-video">
          {!videos.length && <p className="hint">{res?.videoError || (res?.videoCargando || enMarcha ? "Creando el video en el servidor…" : "Todavía no hay video.")}</p>}
          {videos.map((v, k) => (
            <figure key={v.id} className="reel-version">
              <video src={v.src} controls playsInline preload="metadata" aria-label={k === 0 ? "El reel, última versión" : `Versión anterior ${k}`} />
              <figcaption className="hint">{k === 0 ? "Última versión" : `Versión anterior ${videos.length - k}`}</figcaption>
            </figure>
          ))}
          {videos.length > 0 && paraTramo && !montaje && (
            <form className="reel-tramo-form" onSubmit={(e) => { e.preventDefault(); corregirElTramo(); }}>
              <span className="label">Corregir un tramo</span>
              <div className="reel-tramo-fila">
                <label>Del <input type="number" className="input" min={0} max={segundos - 1} value={tramoCambio.desde} onChange={(e) => setTramoCambio((t) => ({ ...t, desde: Math.max(0, Math.min(segundos - 1, Number(e.target.value) || 0)) }))} /></label>
                <label>al <input type="number" className="input" min={1} max={segundos} value={tramoCambio.hasta} onChange={(e) => setTramoCambio((t) => ({ ...t, hasta: Math.max(t.desde + 1, Math.min(segundos, Number(e.target.value) || 1)) }))} /> s</label>
              </div>
              <label className="sr-only" htmlFor={`${ids}-tc`}>Qué cambiar en ese tramo</label>
              <input id={`${ids}-tc`} className="input" maxLength={500} value={tramoCambio.cambio} placeholder="Que la mamá sonría y mire al bebé" onChange={(e) => setTramoCambio((t) => ({ ...t, cambio: e.target.value }))} />
              <ReferenciasGaleria compacto archivos={estudio?.archivos ?? []} elegidas={ejemplosTramo} onCambiar={setEjemplosTramo} max={3} etiqueta="Ejemplo de la galería" />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={Boolean(ocupado) || !tramoCambio.cambio.trim()}>
                <Icon name="wand" size={14} /> {ocupado === "tramo" ? "Corrigiendo…" : `Corregir con ${paraTramo.nombre}`}
              </button>
            </form>
          )}
        </div>
      )}

      {paso === "video" && montaje && (
        <div className="notice" role="status" style={{ display: "block" }}>
          <p style={{ margin: 0 }}><strong>Montaje:</strong> {montaje.fase === "fallido" ? `no salió (${montaje.error})` : montaje.fase === "confirmar" ? "montado; falta confirmar la voz de la marca." : montaje.fase === "espera" ? montaje.nota : montaje.fase === "hecho" ? (montaje.automatico ? "terminado: el mp4 está en la galería y en su publicación." : "listo para revisar en el video animado.") : FASE_MONTAJE[montaje.fase] ?? "en marcha…"}</p>
          <div className="lote-fila">
            {montaje.fase === "confirmar" && (
              <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(ocupado)} onClick={() => montarAqui({ confirmadoVoz: true })}>
                <Icon name="check" size={14} /> Sí, generar la voz{montaje.costoTexto ? ` por ${montaje.costoTexto}` : ""}
              </button>
            )}
            {montaje.videoId && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAbrirVideoId(montaje.videoId); setForma("animado"); }}>
                <Icon name="video" size={14} /> Abrir el video animado
              </button>
            )}
          </div>
        </div>
      )}
      {paso === "video" && encargo?.reel?.puesto?.postId && <p className="hint" role="status">Ya está en su publicación (con su caption, guion y portada si estaban vacíos).</p>}

      <div className="lote-pie">
        {confirmar ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmar(null)}>No</button>
            <button type="button" className="btn btn-primary" onClick={confirmar === "lanzar" ? lanzar : continuar}>
              Sí, crear {confirmar === "lanzar" ? `${planos.length} fotogramas${revisar ? "" : salidaReal === "clips" ? " y los clips" : " y el video"} por ${textoCosto(costoLanzar)}` : `${salidaReal === "clips" ? "los clips" : "el video"} por ${textoCosto(costoVideo)}`}
            </button>
          </>
        ) : (
          <>
            {paso === "idea" && (
              <button type="button" className="btn btn-primary" disabled={Boolean(ocupado) || (!idea.trim() && !referenciaId && !inicial.guionPost)} onClick={escribir}>
                <Icon name="sparkles" size={18} /> {ocupado === "guion" ? "Escribiendo el guion…" : `Proponer el guion de ${duracion} s`}
              </button>
            )}
            {paso === "planos" && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("idea")}>Volver</button>
                <p className="lote-costo">{planos.length} fotogramas{revisar ? "" : salidaReal === "clips" ? ` y ${planos.length} clips` : " y el video"} · <strong>{textoCosto(costoLanzar)}</strong> (aprox.){montar && !revisar ? " · la voz, aparte (se confirma)" : ""}</p>
                <button type="button" className="btn btn-primary" disabled={Boolean(ocupado) || !modeloImagen || planos.some((p) => !p.escena.trim()) || (!revisar && salidaReal === "uno" ? !modeloVideo : !revisar && !modeloClips)}
                  onClick={() => pedirConConfirmar("lanzar", costoLanzar, lanzar)}>
                  <Icon name="image" size={18} /> {ocupado === "lanzar" ? "Enviando…" : "Crear aquí"}
                </button>
              </>
            )}
            {paso === "fotogramas" && (
              <>
                {!ocupado && !enMarcha && !encargo && <button type="button" className="btn btn-ghost" onClick={() => setPaso("planos")}>Volver a los planos</button>}
                <p className="lote-costo">{enMarcha && !res?.storyboardListo ? `Creando los fotogramas en orden (${listos.length} de ${planos.length})…` : res?.esperaRevision ? `${salidaReal === "clips" ? `${planos.length} clips` : `Video de ${segundos} s`} · ${textoCosto(costoVideo)} (aprox.)` : ""}</p>
                {res?.esperaRevision && listos.length > 0 && !ocupado && (
                  <button type="button" className="btn btn-primary" disabled={salidaReal === "uno" ? !modeloVideo : !modeloClips} onClick={() => pedirConConfirmar("continuar", costoVideo, continuar)}>
                    <Icon name="video" size={18} /> {salidaReal === "clips" ? `Crear ${listos.length} clips` : "Crear el video"}
                  </button>
                )}
                {res?.storyboardListo && !res?.esperaRevision && encargo?.reel?.salida !== "fotogramas" && (
                  <button type="button" className="btn btn-secondary" onClick={() => setPaso("video")}>Ver el video</button>
                )}
              </>
            )}
            {paso === "video" && !ocupado && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("fotogramas")}>Ver el storyboard</button>
                {salidaReal === "clips" && clips.some((c) => c?.archivo) && (
                  <button type="button" className="btn btn-secondary" disabled={bajando} onClick={bajarClips}>
                    <Icon name="download" size={18} /> {bajando ? "Preparando el ZIP…" : "Descargar los clips para CapCut"}
                  </button>
                )}
                {!enMarcha && (!montaje || ["fallido", "hecho"].includes(montaje.fase) && !montaje.automatico) && (videoListo || clips.some((c) => c?.archivo)) && (
                  <>
                    {!montaje?.videoId && <button type="button" className="btn btn-secondary" onClick={() => montarAqui({})}><Icon name="video" size={18} /> Montarlo aquí</button>}
                    <button type="button" className="btn btn-primary" onClick={() => montarAqui({ automatico: true })}><Icon name="check" size={18} /> Montarlo y terminarlo</button>
                  </>
                )}
                {onPoner && videos[0] && !encargo?.reel?.puesto?.postId && !montaje && (
                  <button type="button" className="btn btn-secondary" onClick={() => onPoner([videos[0]], { reemplazar: true, descripcion: guion?.descripcion ?? "" })}>
                    <Icon name="check" size={18} /> Poner en la publicación
                  </button>
                )}
                {onListo && (videos[0] || encargo) && (
                  <button type="button" className="btn btn-ghost" onClick={onListo}>
                    <Icon name="check" size={18} /> Listo
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
      {/* Un reel en el servidor: se puede cerrar y volver. */}
      {encargo && enMarcha && <p className="hint">Se está haciendo en el servidor: puedes cerrar esto y seguir después.</p>}
      {encargo && !enMarcha && paso === "fotogramas" && res?.storyboardListo && !res?.esperaRevision && encargo.reel?.salida === "fotogramas" && (
        <p className="hint">El storyboard está listo.</p>
      )}
      {encargo && finalDePaso(encargo.pasos?.[0]) === null && !enMarcha && fotos.every((f) => f?.error) && (
        <p className="hint">No salió ningún fotograma: vuelve a los planos y pruébalo otra vez.</p>
      )}
    </section>
  );
}
