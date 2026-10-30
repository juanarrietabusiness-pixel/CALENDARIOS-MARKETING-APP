import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { textoCosto, estimar, costoDePieza, etiquetaDeCosto, CONFIRMAR_DESDE, MODELOS } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import { limpiarKit } from "../lib/kitMarca";
import { modelosParaCarrusel, modeloParaCarrusel } from "../lib/carruselEstudio";
import { editarImagen, crearVideo } from "../lib/reelEstudio";
import { ajusteDeDuracion } from "../lib/videoCorto";
import { duracionesDe, palabrasQueCaben, sinVozEnProducto } from "../lib/videoProducto";
import { modelosParaProducto, modeloParaProducto, crearFotogramaDeProducto, costoDeFotogramas, pedidoDeVideoProducto } from "../lib/videoProductoEstudio";
import { CopyButton } from "./calendario/primitivas";
import "./calendario/RevisionMes.css";
import "./calendario/CarruselIA.css";
import "./EstudioLote.css";

// ============================================================
// La receta «Video del producto» (10 a 15 s), en cuatro pasos
//
//   1. Producto: uno del catálogo con fotos, la duración (la del modelo) y, si se quiere, lo que se quiere contar.
//   2. Guion: el primer fotograma, tres tramos, la cámara, la locución en español y la música. Se corrige a mano.
//   3. Fotogramas: el primero (sin logo) y el cierre (la foto real del producto y el logo), por centavos. Se
//      corrigen o se rehacen ANTES de pagar el video: es lo que hace que el producto y el logo salgan perfectos.
//   4. Video: arranca en el primero y termina en el cierre. Otra versión con el mismo pedido si no convence.
//
// Por qué así, en src/lib/videoProducto.js. Lo abren el flujo de video del Estudio («Video» → «Del producto») y el
// panel de una publicación de reel («Video del producto»), que lo pone en ella.
// ============================================================

const PASOS = [["producto", "Producto"], ["guion", "Guion"], ["fotogramas", "Fotogramas"], ["video", "Video"]];
const FOTOGRAMAS = [["inicio", "Primer fotograma", "Sin logo: así empieza el video."], ["cierre", "Cierre", "La foto real del producto y el logo: así termina."]];

export default function FlujoVideoProducto({ client, estudio, inicial = {}, onPoner = null, onListo = null, onCreando = () => {} }) {
  const ids = useId();
  const clienteId = client?.dbId || client?.id;
  const kit = limpiarKit(estudio?.kit);
  const activos = useMemo(() => estudio?.activos ?? {}, [estudio]);
  const productos = estudio?.productos ?? [];
  const [paso, setPaso] = useState("producto");
  const [productoId, setProductoId] = useState(() => (productos.some((p) => p.id === inicial.productoId) ? inicial.productoId : productos[0]?.id ?? ""));
  const [idea, setIdea] = useState(inicial.idea ?? "");
  const [modeloVideoId, setModeloVideoId] = useState("");
  const [modeloImagenId, setModeloImagenId] = useState("");
  const [segundos, setSegundos] = useState(10);
  const [guion, setGuion] = useState(null);
  const [fotos, setFotos] = useState({}); // inicio | cierre → { archivo } | { error } | { cargando }
  const [correccion, setCorreccion] = useState({});
  const [videos, setVideos] = useState([]); // versiones, la última primero
  const [ocupado, setOcupado] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState(null);
  const carpeta = useRef(null);
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const modelosVideo = useMemo(() => modelosParaProducto(activos), [activos]);
  const modeloVideo = modelosVideo.find((m) => m.id === modeloVideoId) ?? modeloParaProducto(activos) ?? MODELOS.find((m) => m.id === "prueba-video");
  const duraciones = duracionesDe(modeloVideo);
  const modelosImagen = useMemo(() => modelosParaCarrusel(activos), [activos]);
  const fijado = modelosImagen.find((m) => m.id === kit.modelos?.imagen);
  const modeloImagen = modelosImagen.find((m) => m.id === modeloImagenId) ?? fijado ?? modelosImagen.find((m) => m.id === modeloParaCarrusel(activos).id) ?? modelosImagen[0] ?? null;
  const producto = productos.find((p) => p.id === productoId) ?? null;
  const inicio = fotos.inicio?.archivo ?? null;
  const cierre = fotos.cierre?.archivo ?? null;
  const pedidoVideo = guion && inicio && cierre && modeloVideo ? pedidoDeVideoProducto({ modelo: modeloVideo, guion, inicio, cierre }) : null;
  const costoVideo = modeloVideo ? estimar(modeloVideo, 1, { duration: ajusteDeDuracion(modeloVideo, guion?.segundos ?? segundos) ?? undefined }) : 0;
  const costoFotos = costoDeFotogramas(modeloImagen);
  const palabras = String(guion?.locucion ?? "").trim().split(/\s+/).filter(Boolean).length;
  const maxPalabras = palabrasQueCaben(guion?.segundos ?? segundos);
  const ocupar = (q) => { setOcupado(q); onCreando(Boolean(q)); };
  const gasto = () => window.dispatchEvent(new Event("ia:gasto"));

  // La duración la decide el modelo: si cambia y la escogida no existe, la primera que tenga.
  useEffect(() => {
    if (duraciones.length && !duraciones.includes(segundos)) setSegundos(duraciones[0]);
  }, [duraciones, segundos]);

  /** La carpeta del video: la galería lo enseña como UNA tarjeta (los videos, el último primero, y los dos fotogramas). */
  const prepararCarpeta = async () => {
    if (!carpeta.current) carpeta.current = await api.carpetaDeGrupo(clienteId, "reel", `Video de ${producto?.nombre ?? "producto"}`);
  };
  const orden = [...videos.map((v) => v?.id), inicio?.id, cierre?.id].filter(Boolean).join(",");
  useEffect(() => {
    if (!carpeta.current || ocupado || !orden) return;
    api.ordenarCarpeta(clienteId, carpeta.current, orden.split(",")).catch(() => { /* sin orden, la galería lo deduce */ });
  }, [orden, ocupado, clienteId]);

  const escribir = async () => {
    ocupar("guion");
    setAviso(null);
    try {
      const r = await api.guionDeVideoProducto(clienteId, { productoId, segundos, idea, post: inicial.post ?? undefined });
      setGuion(r.guion);
      setFotos({});
      setVideos([]);
      setPaso("guion");
      setAviso({ ok: true, texto: ["Revisa el guion: el primer fotograma, los tramos y lo que dice la voz.", r.aviso ?? ""].filter(Boolean).join(" ") });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      gasto();
    }
  };

  const comun = () => ({
    clienteId, guion, kit, modelo: modeloImagen, producto, productos, marca: client.name, rubro: client.industry ?? "", activos,
    carpetaId: carpeta.current, seguir: () => vivo.current,
  });
  /** Un fotograma (crearlo, rehacerlo o corregirlo): su sitio dice «Creando…» y luego lo que salió o por qué falló. */
  const unFotograma = async (cual, hacer) => {
    setFotos((f) => ({ ...f, [cual]: { ...f[cual], cargando: true } }));
    try {
      const archivo = await hacer();
      if (vivo.current) setFotos((f) => ({ ...f, [cual]: { archivo } }));
    } catch (e) {
      if (vivo.current) setFotos((f) => ({ ...f, [cual]: { error: e.message } }));
      throw e;
    }
  };
  const crearLosFotogramas = async () => {
    ocupar("fotogramas");
    setPaso("fotogramas");
    setAviso({ ok: true, texto: "Creando el primer fotograma y el cierre…" });
    try {
      await prepararCarpeta();
      const datos = comun();
      // A la vez: no dependen el uno del otro.
      const r = await Promise.allSettled(FOTOGRAMAS.map(([cual]) => unFotograma(cual, () => crearFotogramaDeProducto({ ...datos, cual }))));
      const mal = r.filter((x) => x.status === "rejected").length;
      setAviso(mal ? { ok: false, texto: "Uno de los fotogramas no salió: rehazlo antes de crear el video." } : { ok: true, texto: "Revisa los dos fotogramas: el video arranca en el primero y termina EXACTAMENTE en el cierre." });
    } finally {
      ocupar("");
      gasto();
    }
  };
  const rehacer = async (cual) => {
    ocupar(cual);
    try {
      await prepararCarpeta();
      await unFotograma(cual, () => crearFotogramaDeProducto({ ...comun(), cual }));
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      gasto();
    }
  };
  const corregir = async (cual) => {
    const instruccion = String(correccion[cual] ?? "").trim();
    if (!instruccion || !fotos[cual]?.archivo) return;
    ocupar(cual);
    try {
      await unFotograma(cual, () => editarImagen({ clienteId, modelo: modeloImagen, archivo: fotos[cual].archivo, instruccion, aspectRatio: "9:16", carpetaId: carpeta.current, seguir: () => vivo.current }));
      setCorreccion((c) => ({ ...c, [cual]: "" }));
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      gasto();
    }
  };

  const crearElVideo = async () => {
    setConfirmar(false);
    if (!pedidoVideo) return;
    setPaso("video");
    ocupar("video");
    setAviso({ ok: true, texto: "Creando el video: tarda unos minutos. Puedes seguir en otra pestaña; queda en la galería." });
    try {
      await prepararCarpeta();
      const video = await crearVideo({ clienteId, pedido: pedidoVideo, carpetaId: carpeta.current, calendarId: inicial.calendarId, postId: inicial.postId, seguir: () => vivo.current });
      if (!vivo.current) return;
      setVideos((v) => [video, ...v]);
      setAviso({ ok: true, texto: "Listo. Si no convence, «Otra versión» lo vuelve a pedir con los mismos fotogramas; ésta se queda." });
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      ocupar("");
      gasto();
    }
  };
  const pedirVideo = () => (costoVideo >= CONFIRMAR_DESDE ? setConfirmar(true) : crearElVideo());

  const indice = PASOS.findIndex(([x]) => x === paso);
  const cambiarTramo = (i, accion) => setGuion((g) => ({ ...g, tramos: g.tramos.map((t, k) => (k === i ? { ...t, accion } : t)) }));

  return (
    <div className="flujo-video-producto">
      <h3 id={`${ids}-t`} className="sr-only">Video del producto</h3>
      <ol className="lote-pasos" aria-label="Pasos">
        {PASOS.map(([id, n], k) => <li key={id} aria-current={id === paso ? "step" : undefined} data-hecho={indice > k || undefined}>{k + 1}. {n}</li>)}
      </ol>
      <div aria-live="polite">{aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "hint" : "cerebro-error"}>{aviso.texto}</p>}</div>

      {paso === "producto" && (
        <div className="carrusel-opciones">
          {productos.length === 0 ? (
            <p className="notice" role="note">
              Este cliente no tiene productos con fotos en el catálogo. Súbelas en Cerebro → Estudio de mercado → Catálogo: el video termina en la foto REAL del producto.
            </p>
          ) : (
            <div className="field">
              <label className="label" htmlFor={`${ids}-prod`}>Producto</label>
              <select id={`${ids}-prod`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <p className="hint">Sólo salen los que tienen fotos: el cierre se hace con ellas.</p>
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor={`${ids}-idea`}>Qué quieres contar (opcional)</label>
            <textarea id={`${ids}-idea`} className="input" rows={2} maxLength={1000} value={idea} onChange={(e) => setIdea(e.target.value)}
              placeholder="El bebé ya no se deja cambiar: con el pañal tipo pants se le sube como un calzoncito." />
          </div>
          <div className="lote-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-mv`}>Modelo del video</label>
              <select id={`${ids}-mv`} className="input" value={modeloVideo?.id ?? ""} onChange={(e) => setModeloVideoId(e.target.value)}>
                {modelosVideo.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${etiquetaDeCosto(m)}`}</option>)}
              </select>
              {sinVozEnProducto(modeloVideo) && <p className="hint">{modeloVideo?.nombre} va sin voz (la inventa mal en español): sólo música.</p>}
            </div>
            {duraciones.length > 0 && (
              <div className="field">
                <span className="label" id={`${ids}-dur`}>Duración</span>
                <div className="est-tipos" role="group" aria-labelledby={`${ids}-dur`}>
                  {duraciones.map((s) => <button key={s} type="button" className="filter-chip" aria-pressed={segundos === s} onClick={() => setSegundos(s)}>{s} s</button>)}
                </div>
              </div>
            )}
          </div>
          {!kit.logo && <p className="hint">El kit de marca no tiene logo: el cierre saldrá sin él. Se pone en la pestaña Estudio → Kit de marca.</p>}
        </div>
      )}

      {paso !== "producto" && guion && (
        <div className="carrusel-opciones">
          <div className="field">
            <label className="label" htmlFor={`${ids}-ini`}>El primer fotograma</label>
            <textarea id={`${ids}-ini`} className="input" rows={2} maxLength={400} value={guion.inicio} disabled={paso !== "guion"}
              onChange={(e) => setGuion((g) => ({ ...g, inicio: e.target.value }))} />
          </div>
          <ol className="carrusel-laminas">
            {guion.tramos.map((t, i) => (
              <li key={t.clave} className="revision-item carrusel-lamina">
                <div className="carrusel-lamina-texto" style={{ width: "100%" }}>
                  <label className="label" htmlFor={`${ids}-tr-${i}`}>{t.nombre} · {t.desde}–{t.hasta} s</label>
                  <textarea id={`${ids}-tr-${i}`} className="input" rows={2} maxLength={300} value={t.accion} disabled={paso !== "guion"} onChange={(e) => cambiarTramo(i, e.target.value)} />
                </div>
              </li>
            ))}
          </ol>
          <div className="lote-fila">
            <div className="field">
              <label className="label" htmlFor={`${ids}-cam`}>Cámara</label>
              <input id={`${ids}-cam`} className="input" maxLength={160} value={guion.camara} disabled={paso !== "guion"} onChange={(e) => setGuion((g) => ({ ...g, camara: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-mus`}>Música</label>
              <input id={`${ids}-mus`} className="input" maxLength={200} value={guion.musica} disabled={paso !== "guion"} onChange={(e) => setGuion((g) => ({ ...g, musica: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${ids}-loc`}>Lo que dice la voz (en español)</label>
            <textarea id={`${ids}-loc`} className="input" rows={2} maxLength={600} value={guion.locucion} disabled={paso !== "guion"} onChange={(e) => setGuion((g) => ({ ...g, locucion: e.target.value }))} />
            <p className={palabras > maxPalabras ? "revision-problema" : "hint"}>{palabras} de {maxPalabras} palabras que caben en {guion.segundos} s. Va escrita en el pedido: si no, el modelo se inventa una voz en otro idioma.</p>
          </div>
          {guion.descripcion && (
            <details>
              <summary className="hint">El caption del post</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{guion.descripcion}</p>
              <CopyButton text={guion.descripcion} describes="el caption" />
            </details>
          )}
          {paso === "guion" && (
            <div className="field" style={{ margin: 0 }}>
              <label className="label" htmlFor={`${ids}-mi`}>Modelo de los fotogramas</label>
              <select id={`${ids}-mi`} className="input" value={modeloImagen?.id ?? ""} onChange={(e) => setModeloImagenId(e.target.value)}>
                {modelosImagen.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.motor === "prueba" ? "" : ` · ${textoCosto(costoDePieza(m))} cada uno`}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {(paso === "fotogramas" || paso === "video") && (
        <ol className="carrusel-laminas reel-fotogramas">
          {FOTOGRAMAS.map(([cual, nombre, ayuda]) => {
            const f = fotos[cual];
            return (
              <li key={cual} className="revision-item carrusel-lamina">
                <div className="carrusel-lamina-vista reel-vista">
                  {f?.archivo && !f?.cargando ? <img src={f.archivo.src} alt={nombre} loading="lazy" /> : <span className="hint">{f?.cargando ? "Creando…" : f?.error ? "Falló" : nombre}</span>}
                </div>
                <div className="carrusel-lamina-texto">
                  <strong>{nombre}</strong>
                  <p className="hint" style={{ margin: 0 }}>{ayuda}</p>
                  {f?.error && <p className="revision-problema">{f.error}</p>}
                  {paso === "fotogramas" && !ocupado && f && !f.cargando && (
                    <div className="carrusel-lamina-acciones">
                      {f.archivo && (
                        <form className="carrusel-corregir" onSubmit={(e) => { e.preventDefault(); corregir(cual); }}>
                          <label className="sr-only" htmlFor={`${ids}-c-${cual}`}>Qué corregir en {nombre}</label>
                          <input id={`${ids}-c-${cual}`} className="input" maxLength={300} value={correccion[cual] ?? ""}
                            placeholder={cual === "cierre" ? "El logo más grande…" : "Que la mamá sonría…"} onChange={(e) => setCorreccion((c) => ({ ...c, [cual]: e.target.value }))} />
                          <button type="submit" className="btn btn-secondary btn-sm" disabled={!correccion[cual]?.trim()}><Icon name="wand" size={14} /> Corregir</button>
                        </form>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => rehacer(cual)}><Icon name="refresh" size={14} /> Rehacer</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {paso === "video" && (
        <div className="reel-video">
          {videos.length === 0 && <p className="hint">{ocupado === "video" ? "Creando el video…" : "Todavía no hay video."}</p>}
          {videos.map((v, k) => (
            <figure key={v.id} className="reel-version">
              <video src={v.src} controls playsInline preload="metadata" aria-label={k === 0 ? "El video, última versión" : `Versión anterior ${k}`} />
              <figcaption className="hint">{k === 0 ? "Última versión" : `Versión anterior ${videos.length - k}`}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <div className="lote-pie">
        {confirmar ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmar(false)}>No</button>
            <button type="button" className="btn btn-primary" onClick={crearElVideo}>Sí, crear el video por {textoCosto(costoVideo)}</button>
          </>
        ) : (
          <>
            {paso === "producto" && (
              <button type="button" className="btn btn-primary" disabled={Boolean(ocupado) || !producto || !modeloVideo} onClick={escribir}>
                <Icon name="sparkles" size={18} /> {ocupado === "guion" ? "Escribiendo el guion…" : `Proponer el guion de ${segundos} s`}
              </button>
            )}
            {paso === "guion" && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("producto")}>Volver</button>
                <p className="lote-costo">Los dos fotogramas · <strong>{textoCosto(costoFotos)}</strong> (aprox.)</p>
                <button type="button" className="btn btn-primary" disabled={!modeloImagen || !guion?.inicio?.trim() || palabras > maxPalabras} onClick={crearLosFotogramas}>
                  <Icon name="image" size={18} /> Crear los dos fotogramas
                </button>
              </>
            )}
            {paso === "fotogramas" && (
              <>
                {!ocupado && <button type="button" className="btn btn-ghost" onClick={() => setPaso("guion")}>Volver al guion</button>}
                <p className="lote-costo">{ocupado ? "Creando…" : <>Video de {guion?.segundos} s con {modeloVideo?.nombre} · <strong>{textoCosto(costoVideo)}</strong> (aprox.)</>}</p>
                {!ocupado && (
                  <button type="button" className="btn btn-primary" disabled={!pedidoVideo} onClick={pedirVideo}>
                    <Icon name="video" size={18} /> Crear el video
                  </button>
                )}
              </>
            )}
            {paso === "video" && !ocupado && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setPaso("fotogramas")}>Volver a los fotogramas</button>
                {pedidoVideo && <button type="button" className="btn btn-secondary" onClick={pedirVideo}><Icon name="refresh" size={18} /> Otra versión · {textoCosto(costoVideo)}</button>}
                {onPoner && videos[0] && (
                  <button type="button" className="btn btn-primary" onClick={() => onPoner([videos[0]], { reemplazar: true, descripcion: guion?.descripcion ?? "" })}>
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
    </div>
  );
}
