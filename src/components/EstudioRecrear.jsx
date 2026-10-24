import { useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import BancoSelector from "./BancoSelector";
import { Pieza } from "./EstudioVisor";
import { useDialogA11y } from "../hooks/useDialogA11y";
import * as api from "../lib/estudio";
import { leerMercado, agregarReferencia, adaptarReferencia } from "../lib/mercado";
import { productosActivos } from "../lib/estudioMercado";
import { resumenDelAnalisis, versionDeAdaptacion, pedidoParaElCompositor, MODOS_RECREAR, duracionDeReferencia } from "../lib/recrear";
import { motorParaRecrear } from "../lib/motorRecrear";
import { CopyButton } from "./calendario/primitivas";
import "./EstudioLote.css";

// ============================================================
// «Recrear un anuncio»: de una pieza de otra marca, una del cliente
//
//   1. El anuncio: se sube (imagen o video), se escoge de la galería o se trae
//      de Drive, y se dice para qué producto.
//   2. La IA lo analiza —Claude mira la imagen, Gemini ve el video— y queda en
//      el cerebro como referencia INTERNA. Luego propone la versión para el
//      cliente con la misma forma; una persona la corrige.
//   3. «Crear con mi marca» la pone en el compositor del Estudio con el kit, el
//      logo y las fotos del producto (también en video): el costo se ve allí
//      antes de pedir.
//
// En VIDEO hay dos modos (`MODOS_RECREAR`): el mismo video con nuestro producto
// (se edita el original) u otra versión que transmita lo mismo; el motor lo
// propone una regla entre los que tienen llave (lib/motorRecrear.js). «Otra
// versión» reescribe sin volver a analizar, y un anuncio ya analizado no se paga
// otra vez: su análisis está en las referencias del estudio de mercado.
// ============================================================

const PASOS = ["El anuncio", "La versión"];
const FILTROS = [["todo", "Todo"], ["video", "Videos"], ["imagen", "Imágenes"]];

export default function EstudioRecrear({ client, archivos = [], productosConFotos = [], inicial = null, activos = {}, onCerrar, onCrear }) {
  const ids = useId();
  const clienteId = client.dbId || client.id;
  const [paso, setPaso] = useState(0);
  const [archivo, setArchivo] = useState(inicial);
  const [catalogo, setCatalogo] = useState(null);
  const [analizadas, setAnalizadas] = useState([]); // las referencias del estudio de mercado: un anuncio ya analizado no se paga otra vez
  const [filtro, setFiltro] = useState("todo");
  const [modo, setModo] = useState("version");
  const [pide, setPide] = useState("");
  const [productoId, setProductoId] = useState("");
  const [competidor, setCompetidor] = useState("");
  const [nota, setNota] = useState("");
  const [escogiendo, setEscogiendo] = useState(false); // galería
  const [deDrive, setDeDrive] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [referencia, setReferencia] = useState(null);
  const [version, setVersion] = useState(null); // { idea, texto, descripcion }
  const [aviso, setAviso] = useState(null);
  const entrada = useRef(null);
  const ocupado = Boolean(trabajando);
  const ref = useDialogA11y(() => { if (!ocupado) onCerrar(); });

  useEffect(() => {
    leerMercado(clienteId).then((m) => { setCatalogo(productosActivos(m.catalogo ?? [])); setAnalizadas(m.referencias ?? []); }).catch(() => setCatalogo([]));
  }, [clienteId]);

  const producto = catalogo?.find((p) => p.id === productoId) ?? null;
  const video = archivo?.tipo === "video";
  const galeria = archivos.filter((a) => !a.borradoAt && (filtro === "todo" || a.tipo === filtro));
  const segundos = duracionDeReferencia(referencia);
  const motor = video ? motorParaRecrear(activos, { modo, segundos }) : null;

  const subir = async (lista, comoArchivo = (a) => a) => {
    if (!lista?.length) return;
    setTrabajando("subir");
    setAviso(null);
    try {
      setArchivo((await api.subirImagen(clienteId, await comoArchivo(lista[0]))).archivo);
    } catch (e) {
      setAviso({ ok: false, texto: e.message });
    } finally {
      setTrabajando("");
    }
  };

  /** La versión para el cliente (no vuelve a analizar). `antes` + `pide`: otra distinta de la que hay. */
  const proponer = async (ref, { modoVideo = modo, antes = "", pedido = "" } = {}) => {
    setTrabajando("version");
    try {
      const a = await adaptarReferencia(clienteId, ref.id, {
        productoId, formato: video ? "reel" : "post", modo: video ? modoVideo : "", antes, pide: pedido, segundos: duracionDeReferencia(ref),
      });
      setVersion(versionDeAdaptacion(a.adaptacion));
      return true;
    } catch (e) {
      setAviso({ ok: false, texto: `La versión no salió: ${e.message} Escríbela a mano o pide otra.` });
      return false;
    } finally {
      setTrabajando("");
    }
  };

  /** Analizar (queda en el cerebro como referencia interna) y pedir la versión. Si ya estaba analizado, no se paga otra vez. */
  const analizar = async () => {
    if (!archivo) return;
    setAviso(null);
    const yaEstaba = analizadas.find((r) => r.archivoId === archivo.id && r.analisis);
    let ref = yaEstaba ?? null;
    if (!ref) {
      setTrabajando("analizar");
      try {
        // Un video lo puede ver Meta por fotogramas: se le da de dónde sacarlos.
        const r = await agregarReferencia(clienteId, { archivoId: archivo.id, competidor, nota, origen: "anuncio" }, archivo.tipo === "video" ? archivo.src : "");
        ref = r.referencia;
        if (ref) setAnalizadas((l) => [ref, ...l]);
        if (!ref?.analisis) {
          setReferencia(ref);
          setPaso(1);
          setAviso({ ok: false, texto: r.aviso || "No se pudo analizar. Puedes escribir la versión a mano." });
          setVersion({ idea: "", texto: "", descripcion: "" });
          setTrabajando("");
          return;
        }
      } catch (e) {
        setAviso({ ok: false, texto: e.message });
        setTrabajando("");
        return;
      }
    }
    setReferencia(ref);
    setPaso(1);
    if (await proponer(ref)) {
      setAviso({ ok: true, texto: yaEstaba ? "Ya estaba analizado: se usó ese análisis (no se pagó otra vez). Revisa la versión antes de crear." : "Analizado y guardado en el cerebro como referencia interna. Revisa la versión antes de crear." });
    } else {
      setVersion({ idea: ref.analisis.ideaParaNosotros ?? "", texto: "", descripcion: "" });
    }
  };

  /** Otra versión distinta, con lo que pida la agencia (o en el otro modo), sin volver a analizar. */
  const otraVersion = async (modoVideo = modo) => {
    if (!referencia?.analisis) return;
    setAviso(null);
    const mismoModo = modoVideo === modo;
    setModo(modoVideo);
    if (await proponer(referencia, { modoVideo, antes: mismoModo ? version?.idea ?? "" : "", pedido: pide })) {
      setPide("");
      setAviso({ ok: true, texto: mismoModo ? "Otra versión: revisa y crea, o pide otra." : `Versión para «${MODOS_RECREAR[modoVideo].nombre}».` });
    }
  };

  const crear = () => {
    // Las fotos REALES del producto van también en video (antes se vaciaban y el video salía con otro producto).
    const fotos = api.fotosDelProducto(productosConFotos, productoId);
    onCrear(pedidoParaElCompositor({ archivo, fotos, version, video, modo, modelo: motor?.modelo ?? null, segundos: motor?.segundos ?? 0 }));
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !ocupado) onCerrar(); }}>
      <div ref={ref} className="dialog lote-dialogo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="lote-cabecera">
          <h3 id={`${ids}-t`}>Recrear un anuncio</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" disabled={ocupado} onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        <ol className="lote-pasos" aria-label="Pasos">
          {PASOS.map((p, i) => <li key={p} aria-current={i === paso ? "step" : undefined} data-hecho={i < paso || undefined}>{i + 1}. {p}</li>)}
        </ol>

        <div className="lote-cuerpo">
          {paso === 0 && (
            <>
              <div className="recrear-fuente">
                <div className="recrear-pieza">
                  {archivo ? <Pieza archivo={archivo} /> : <span className="hint">Ningún anuncio todavía</span>}
                </div>
                <div className="recrear-botones" role="group" aria-label="De dónde sale el anuncio">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => entrada.current?.click()}>
                    <Icon name="upload" size={16} /> {trabajando === "subir" ? "Subiendo…" : "Subir imagen o video"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || !archivos.length} aria-expanded={escogiendo} onClick={() => setEscogiendo((x) => !x)}>
                    <Icon name="image" size={16} /> De la galería
                  </button>
                  {client.driveFolder && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => setDeDrive(true)}>
                      <Icon name="cloud" size={16} /> Desde Drive
                    </button>
                  )}
                  <input ref={entrada} type="file" hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
                    onChange={(e) => { const l = [...e.target.files]; e.target.value = ""; subir(l); }} />
                </div>
              </div>
              {escogiendo && (
                <div role="group" aria-label="Qué enseñar de la galería" className="est-filtros">
                  {FILTROS.map(([id, nombre]) => (
                    <button key={id} type="button" className="filter-chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{nombre}</button>
                  ))}
                </div>
              )}
              {escogiendo && (
                <ul className="recrear-galeria" aria-label="Escoger de la galería">
                  {!galeria.length && <li className="hint">No hay {filtro === "video" ? "videos" : "imágenes"} en la galería.</li>}
                  {galeria.slice(0, 120).map((a) => (
                    <li key={a.id}>
                      <button type="button" aria-pressed={archivo?.id === a.id} aria-label={`Escoger: ${a.prompt || "pieza"}`} onClick={() => { setArchivo(a); setEscogiendo(false); }}>
                        <Pieza archivo={a} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="lote-fila">
                <div className="field">
                  <label className="label" htmlFor={`${ids}-p`}>Para qué producto</label>
                  <select id={`${ids}-p`} className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                    <option value="">{catalogo === null ? "Cargando el catálogo…" : "El que mejor encaje"}</option>
                    {(catalogo ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.precio ? ` · ${p.precio}` : ""}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor={`${ids}-c`}>De quién es (opcional)</label>
                  <input id={`${ids}-c`} className="input" maxLength={80} value={competidor} placeholder="La marca del anuncio" onChange={(e) => setCompetidor(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor={`${ids}-n`}>Qué te gusta de él (opcional)</label>
                <input id={`${ids}-n`} className="input" maxLength={400} value={nota} placeholder="El gancho de arriba, cómo muestra el antes y después…" onChange={(e) => setNota(e.target.value)} />
              </div>
              {video && <ModoVideo ids={ids} modo={modo} onModo={setModo} disabled={ocupado} />}
              <p className="hint">
                {video ? "Gemini ve el video" : "Claude mira la imagen"} y lo explica: el gancho, cómo está hecho y por qué funciona. Queda en el cerebro como
                referencia INTERNA (la ven el equipo y el asistente, nunca lo que se escribe para publicar).
              </p>
            </>
          )}

          {paso === 1 && referencia && (
            <>
              <div className="recrear-fuente">
                <div className="recrear-pieza"><Pieza archivo={archivo} /></div>
                <dl className="recrear-analisis">
                  {resumenDelAnalisis(referencia.analisis).map((l) => <div key={l.titulo}><dt>{l.titulo}</dt><dd>{l.texto}</dd></div>)}
                </dl>
              </div>
              {version && (
                <section className="recrear-version" aria-labelledby={`${ids}-v`}>
                  <h4 id={`${ids}-v`} className="lote-nivel-titulo">La versión para {client.name}{producto ? ` · ${producto.nombre}` : ""}</h4>
                  <div className="field">
                    <label className="label" htmlFor={`${ids}-i`}>Qué se ve</label>
                    <textarea id={`${ids}-i`} className="input" rows={4} maxLength={1500} value={version.idea} onChange={(e) => setVersion((v) => ({ ...v, idea: e.target.value }))} />
                  </div>
                  {!video && (
                    <div className="field">
                      <label className="label" htmlFor={`${ids}-x`}>Texto en la pieza</label>
                      <input id={`${ids}-x`} className="input" maxLength={120} value={version.texto} onChange={(e) => setVersion((v) => ({ ...v, texto: e.target.value }))} />
                    </div>
                  )}
                  {video && motor && (
                    <p className="hint" role="note"><strong>Motor recomendado: {motor.modelo.nombre}</strong> ({motor.segundos} s). {motor.porque}</p>
                  )}
                  {video && !motor && <p className="cerebro-error" role="alert">No hay ningún modelo de video con llave que sirva para esto.</p>}
                  {version.descripcion && (
                    <div className="field">
                      <span className="label">Descripción propuesta</span>
                      <p className="recrear-descripcion">{version.descripcion}</p>
                      <CopyButton text={version.descripcion} describes="la descripción" />
                    </div>
                  )}
                  <div className="field">
                    <label className="label" htmlFor={`${ids}-o`}>¿No te gusta? Qué cambiar (opcional)</label>
                    <input id={`${ids}-o`} className="input" maxLength={500} value={pide} disabled={ocupado} placeholder="Más emotivo, que salga una mamá, que termine con el producto en la mesa…" onChange={(e) => setPide(e.target.value)} />
                  </div>
                  <div className="lote-fila">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado || !referencia?.analisis} onClick={() => otraVersion()}>
                      <Icon name="refresh" size={16} /> {trabajando === "version" ? "Escribiendo…" : "Otra versión"}
                    </button>
                    {video && <ModoVideo ids={`${ids}-2`} modo={modo} onModo={(m) => otraVersion(m)} disabled={ocupado || !referencia?.analisis} />}
                  </div>
                </section>
              )}
            </>
          )}

          <div aria-live="polite">
            {aviso && <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "cerebro-aviso" : "cerebro-error"}>{aviso.texto}</p>}
          </div>
        </div>

        <div className="lote-pie">
          {paso === 0 && (
            <button type="button" className="btn btn-primary" disabled={!archivo || ocupado} onClick={analizar}>
              <Icon name="sparkles" size={18} /> {trabajando === "analizar" ? "Analizando…" : trabajando === "version" ? "Escribiendo la versión…" : "Analizar y proponer la versión"}
            </button>
          )}
          {paso === 1 && (
            <>
              <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setPaso(0)}>Volver</button>
              <button type="button" className="btn btn-primary" disabled={ocupado || !version?.idea.trim() || (video && !motor)} onClick={crear}>
                <Icon name={video ? "video" : "imageAi"} size={18} /> Crear con mi marca
              </button>
            </>
          )}
        </div>
      </div>
      {deDrive && (
        <BancoSelector
          clientId={clienteId} driveFolder={client.driveFolder} tipos={["image", "video"]} maximo={1} titulo="Traer un anuncio de Drive"
          onSelect={(l) => { setDeDrive(false); subir(l, api.archivoDeDrive); }} onClose={() => setDeDrive(false)}
        />
      )}
    </div>
  );
}

/** Los dos modos de recrear un video: radios con su ayuda. */
function ModoVideo({ ids, modo, onModo, disabled }) {
  return (
    <fieldset className="field" disabled={disabled}>
      <legend className="label">Cómo recrearlo</legend>
      {Object.entries(MODOS_RECREAR).map(([id, d]) => (
        <label key={id} className="est-logo-casilla" htmlFor={`${ids}-m-${id}`}>
          <input id={`${ids}-m-${id}`} type="radio" name={`${ids}-modo`} checked={modo === id} onChange={() => onModo(id)} />
          <span><strong>{d.nombre}</strong> · {d.ayuda}</span>
        </label>
      ))}
    </fieldset>
  );
}
