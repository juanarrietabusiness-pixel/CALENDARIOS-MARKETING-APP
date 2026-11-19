import { lazy, Suspense, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { modeloPorId, nombreDelModelo, textoCosto, estimar, NOMBRE_PROPORCION } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import { hace, nombreDeDescarga, esVideoReal, valorDeAjuste, ATAJOS_EDICION, AJUSTES_DE_TEXTO, IGUALAR_TEXTO, ejemploParaIgualar } from "../lib/estudio";
import { corregirTexto } from "../lib/controlEstudio";
import { resumenControl } from "../lib/control";
import ReferenciasGaleria from "./ReferenciasGaleria";
import GuardarRegla from "./GuardarRegla";
import SelectorModelo from "./SelectorModelo";

// «Extraer guion y adaptar» (UGC) de un video: sólo se descarga al abrirlo.
const ExtraerUgc = lazy(() => import("./calendario/ExtraerUgc"));
// «Guardar como plantilla» va en su chunk: el del Estudio está en su tope.
const GuardarPlantilla = lazy(() => import("./GuardarPlantilla"));
const VideoListo = lazy(() => import("./VideoListo"));
// «Desglosar toma por toma»: la IA describe el video sin opinar, para que un reel siga su forma (en su chunk).
const DesgloseVideo = lazy(() => import("./DesgloseVideo"));
// «Poner en una publicación…»: lo que ya está en la galería, a un post de cualquier mes (sin crear ni cobrar).
const PonerEnPublicacion = lazy(() => import("./PonerEnPublicacion"));
// «Mejorar mi video» y «Varios ángulos» (escalar, look, cambiar algo, ángulos), con el audio original.
const MejorarVideo = lazy(() => import("./MejorarVideo"));
// «Nuevos ganchos»: versiones de la entrada (o del cierre) del mismo anuncio, para probarlas en Meta.
const NuevosGanchos = lazy(() => import("./NuevosGanchos"));
// «Variaciones para anuncios»: de esta pieza maestra, las de un conjunto de anuncios (sólo se descarga al pulsarlo).
const VariacionesAnuncio = lazy(() => import("./VariacionesAnuncio"));

// ============================================================
// El visor: la imagen (o el video) grande y todo lo que se sabe de ella
//
// Dos columnas a partir de 900 px, una debajo de otra en el teléfono. Un video
// de verdad se reproduce con controles; la tarjeta animada de prueba es una imagen.
// ============================================================

/** La pieza, como imagen o como video. Un video pide `preload` ligero: no baja 40 MB para enseñar un fotograma. */
export function Pieza({ archivo: a, grande = false, onError = undefined }) {
  if (esVideoReal(a)) {
    return (
      <video
        src={a.src} controls={grande} muted={!grande} playsInline preload="metadata" loop={!grande}
        aria-label={grande ? undefined : a.prompt} onError={onError}
      />
    );
  }
  return <img src={a.src} alt={a.prompt} loading={grande ? "eager" : "lazy"} onError={onError} />;
}

/**
 * «Revisar marca»: la IA mira la imagen con el kit delante y dice qué
 * respeta y qué no. «Corregir» lleva su sugerencia al compositor, junto a la
 * idea original, para pedirla otra vez.
 */
/**
 * El control de calidad (lib/control.js): lo que la IA leyó en la pieza, lo mal escrito, los precios que no están en el
 * catálogo, el logo y las deformaciones. «Revisar la pieza» lo pide (o lo repite); «Corregir el texto» edita la MISMA
 * imagen cambiando sólo las palabras mal escritas, y abre la nueva (la de antes se queda en la galería).
 */
function ControlDeCalidad({ archivo, clienteId, lectura, onAbrir }) {
  const [control, setControl] = useState(archivo.ajustes?.control ?? null);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const hacer = async (que, fn) => {
    setOcupado(que);
    setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setOcupado(""); }
  };
  const revisar = () => hacer("Revisando la pieza…", async () => setControl((await api.controlarArchivo(clienteId, archivo.id)).control));
  const corregir = () => hacer("Corrigiendo (tarda un poco)…", async () => {
    const r = await corregirTexto({ clienteId, archivo, control });
    if (r.corregida) onAbrir?.(r.archivo);
    else setError(`La corrección no mejoró la pieza${r.intento ? " (quedó en la galería)" : ""}: prueba «Editar» con tus palabras.`);
  });
  if (!clienteId || archivo.tipo === "video") return null;
  return (
    <section className="est-control" aria-label="Control de calidad" data-estado={control?.estado}>
      <p role="status" className={ocupado ? "hint" : "sr-only"}>{ocupado}</p>
      {control ? (
        <>
          <p className="est-control-titulo"><Icon name={control.estado === "ok" ? "checkCircle" : "alert"} size={16} /> {resumenControl(control)}</p>
          {control.textoLeido && <p className="hint">Se lee: «{control.textoLeido.replace(/\n+/g, " / ")}»</p>}
          {control.errores.length > 1 && <ul className="est-revision-lista" data-falla>{control.errores.map((e) => <li key={`${e.escrito}-${e.esperado}`}><Icon name="alert" size={14} /> {e.escrito ? `«${e.escrito}» → «${e.esperado}»` : `falta «${e.esperado}»`}</li>)}</ul>}
          {[...control.precios.map((p) => `Precio que no está en el catálogo: ${p}`), ...control.deformaciones, ...control.otros].map((t) => <p key={t} className="hint"><Icon name="alert" size={14} /> {t}</p>)}
          {/* La revisión del director: su nota y lo que arreglaría, con números. */}
          {control.puntajeDiseno != null && (
            <p className="hint">Director: {control.puntajeDiseno}/10{control.diseno?.length ? ` · ${control.diseno.map((x) => x.arreglo).join(" · ")}` : ""}</p>
          )}
        </>
      ) : <p className="hint">Sin revisar: la IA puede leer el texto letra por letra y buscar precios inventados, el logo y deformaciones.</p>}
      {error && <p role="alert" className="cerebro-error">{error}</p>}
      {/* Los botones se quedan mientras trabaja (`aria-disabled`, no `disabled`): si desaparecieran o se deshabilitaran,
          el foco se iría al body y Escape ya no cerraría el visor. */}
      {!lectura && (
        <div className="est-control-botones">
          {(control?.corregible ?? control?.soloTexto) && <button type="button" className="btn btn-primary btn-sm" aria-disabled={Boolean(ocupado)} onClick={() => !ocupado && corregir()}><Icon name="wand" size={14} /> {control.errores.length ? "Corregir el texto" : "Aplicar los arreglos del director"}</button>}
          <button type="button" className="btn btn-ghost btn-sm" aria-disabled={Boolean(ocupado)} onClick={() => !ocupado && revisar()}><Icon name="eye" size={14} /> {control ? "Revisar otra vez" : "Revisar la pieza"}</button>
        </div>
      )}
    </section>
  );
}

function RevisionDeMarca({ revision, onRevisar, onCorregir }) {
  if (revision?.cargando) return <p role="status" className="hint est-revision">La IA está revisando la imagen contra el kit…</p>;
  if (revision?.error) {
    return (
      <div className="est-revision" role="alert">
        <p className="notice notice-error">{revision.error}</p>
        {onRevisar && <button type="button" className="btn btn-ghost btn-sm" onClick={onRevisar}>Reintentar</button>}
      </div>
    );
  }
  const r = revision?.datos;
  if (!r) {
    return (
      <button type="button" className="btn btn-secondary btn-sm est-revisar" onClick={onRevisar}>
        <Icon name="eye" size={16} /> Revisar marca
      </button>
    );
  }
  const tono = r.puntaje >= 8 ? "bien" : r.puntaje >= 5 ? "medio" : "mal";
  return (
    <section className="est-revision" aria-label="Revisión de marca">
      <p className="est-revision-puntaje" data-tono={tono}><strong>{r.puntaje}/10</strong> con la marca</p>
      {r.cumple.length > 0 && <ul className="est-revision-lista">{r.cumple.map((t) => <li key={t}><Icon name="check" size={14} /> {t}</li>)}</ul>}
      {r.falla.length > 0 && <ul className="est-revision-lista" data-falla>{r.falla.map((t) => <li key={t}><Icon name="alert" size={14} /> {t}</li>)}</ul>}
      {r.sugerencia && (
        <p className="hint">
          Sugerencia: {r.sugerencia}{" "}
          {onCorregir && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCorregir(r.sugerencia)}><Icon name="refresh" size={14} /> Pedirla corregida</button>}
        </p>
      )}
    </section>
  );
}

/**
 * UNA sola «Corregir», con su campo en su sitio: lo que se escribe, los cambios frecuentes y los del texto (más arriba,
 * más grande…), «Igualar el texto a…» otra lámina de su serie y ejemplos de la galería. Los atajos sólo RELLENAN el
 * campo: lo único que cobra es el botón, que dice cuánto. Sale una imagen NUEVA (ésta no se toca) y se abre aquí.
 */
function Corregir({ id, archivo: a, galeria = [], cambio, setCambio, ejemplos, setEjemplos, costo, ocupado, selector, clienteId, lectura, onEditar, onCancelar, campo }) {
  const serie = a.carpetaId ? galeria.filter((x) => x.carpetaId === a.carpetaId && x.id !== a.id && x.tipo === "imagen" && !x.borrado) : [];
  const sumar = (t) => setCambio((c) => (c.trim() ? `${c.trim().replace(/[.\s]+$/, "")}; ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t));
  return (
    <form id={id} className="est-editar est-corregir" onSubmit={(e) => { e.preventDefault(); if (cambio.trim() && !ocupado) onEditar(cambio, ejemplos); }}>
      <label className="label" htmlFor={`${id}-e`}>¿Qué cambio en esta imagen?</label>
      <textarea id={`${id}-e`} ref={campo} className="input" rows={2} value={cambio} maxLength={500}
        placeholder="Ej.: quita el texto de arriba y pon el fondo blanco" onChange={(e) => setCambio(e.target.value)} />
      <div className="est-editar-atajos" role="group" aria-label="Cambios frecuentes (rellenan el campo)">
        {ATAJOS_EDICION.map((t) => <button key={t} type="button" className="filter-chip" onClick={() => sumar(t)}>{t}</button>)}
      </div>
      <div className="est-editar-atajos" role="group" aria-label="El texto de la pieza (rellenan el campo)">
        {AJUSTES_DE_TEXTO.map((x) => <button key={x.id} type="button" className="filter-chip" aria-pressed={cambio === x.instruccion} onClick={() => setCambio(x.instruccion)}>{x.etiqueta}</button>)}
      </div>
      {serie.length > 0 && (
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor={`${id}-ig`}>Igualar el texto a otra lámina del carrusel</label>
          <select id={`${id}-ig`} className="input" value="" onChange={(e) => {
            const otra = serie.find((x) => x.id === e.target.value);
            if (!otra) return;
            setCambio(IGUALAR_TEXTO);
            setEjemplos([ejemploParaIgualar(otra)]);
          }}>
            <option value="">Escoge la lámina que quedó bien…</option>
            {serie.map((x) => <option key={x.id} value={x.id}>{`${String(x.prompt ?? "").replace(/^(Escena|Lámina \d+ de \d+[^.]*\.)\s*/, "").slice(0, 50) || "Sin descripción"} · ${hace(x.creado)}`}</option>)}
          </select>
        </div>
      )}
      <ReferenciasGaleria archivos={galeria} elegidas={ejemplos} onCambiar={setEjemplos} max={2} etiqueta="Ejemplo de la galería" />
      {selector}
      <div className="est-editar-botones">
        <button type="submit" className="btn btn-primary btn-sm" aria-disabled={!cambio.trim() || ocupado || undefined}>
          <Icon name="wand" size={14} /> {ocupado ? "Pidiendo…" : `Corregir${costo != null ? ` · ${textoCosto(costo)}` : ""}`}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>Cancelar</button>
        {clienteId && !lectura && <GuardarRegla clienteId={clienteId} texto={cambio} />}
      </div>
      <p className="hint" style={{ margin: 0 }}>Sale una imagen NUEVA, ya revisada, y se abre aquí; ésta se queda entre sus versiones.</p>
    </form>
  );
}

export default function Visor({
  archivo: a, carpetas, lectura, onCerrar, onFavorito, onPapelera, onMover, onReferencia, onAnimar, onUsar, etiquetaUsar,
  costoOtra = null, onOtraIgual = null, onOtrasVersiones = null, versionando = false, onRecrear = null,
  onEditar = null, original = null, onVerOriginal = null, anteriores = null, onPrincipal = null, onQuitarOtras = null,
  esLogo = false, onLogo = null, revision = null, onRevisar = null, galeria = [],
  clienteId = null, onEstampar = null, cliente = null, onPlantilla = null, activos = null, desdePost = null,
  enCamino = "", onAbrirNueva = null,
}) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const panel = useRef(null);
  const campo = useRef(null);
  // Lo que está abierto bajo la barra: «corregir», «otra» o «mas». Desde «Corregir esta» de una publicación, ya en
  // «Corregir», con lo escrito en «¿Qué quieres?».
  const [abierto, setAbiertoEstado] = useState(desdePost?.accion === "editar" ? "corregir" : "");
  // El modelo de «Corregir» y de «Otra versión» para ESTA vez ("" = el de siempre); no fija nada.
  const [modeloSel, setModeloSel] = useState("");
  const [cambio, setCambio] = useState(desdePost?.accion === "editar" ? desdePost.indicacion ?? "" : "");
  const [ejemplos, setEjemplos] = useState([]);
  const [cuantas, setCuantas] = useState(1);
  const [extrayendo, setExtrayendo] = useState(false);
  const [poniendo, setPoniendo] = useState(false);
  const [variando, setVariando] = useState(false);
  const [mejorando, setMejorando] = useState(false);
  const [ganchos, setGanchos] = useState(false);
  const m = modeloPorId(a.modelo);
  const puedeOtra = !lectura && !a.subido && costoOtra != null && onOtraIgual;
  const video = a.tipo === "video";
  const puedeCorregir = !lectura && !video && Boolean(onEditar);
  const proporcion = a.ajustes?.aspectRatio ?? api.proporcionDeMedidas(a.ancho, a.alto) ?? "";
  const elegido = modeloPorId(modeloSel);
  const costoVersion = elegido ? estimar(elegido, 1, a.ajustes ?? {}) : costoOtra;
  const deEditar = activos ? api.modeloDeEdicion(activos, modeloSel, proporcion) : null;
  const costoCorregir = deEditar ? estimar(deEditar, 1, { aspectRatio: proporcion }) : null;
  const editarCon = (instruccion, lista) => onEditar(instruccion, lista, modeloSel);
  const selector = (vacio) => activos && (
    <SelectorModelo activos={activos} valor={modeloSel} onCambiar={setModeloSel} proporcion={proporcion} conReferencias etiqueta="Con qué modelo (sólo esta vez)" vacio={vacio} disabled={versionando} />
  );
  // Abrir una sección la deja ARRIBA del panel (en el teléfono la barra va abajo): se ve sin buscarla.
  const setAbierto = (que) => {
    setAbiertoEstado((x) => (x === que ? "" : que));
    requestAnimationFrame(() => {
      panel.current?.scrollTo?.({ top: 0 });
      if (que === "corregir") campo.current?.focus({ preventScroll: true });
    });
  };
  // «Pedirla corregida» de la revisión de marca: su sugerencia, en «Corregir».
  const corregirCon = (sugerencia) => {
    setCambio(sugerencia);
    setAbiertoEstado("corregir");
    requestAnimationFrame(() => panel.current?.scrollTo?.({ top: 0 }));
  };
  const usar = onUsar
    ? <button type="button" className="btn btn-primary est-barra-boton est-barra-principal" onClick={onUsar}><Icon name="check" size={18} /> <span>{etiquetaUsar ?? "Usar en la publicación"}</span></button>
    : !lectura && cliente
      ? <button type="button" className="btn btn-primary est-barra-boton est-barra-principal" onClick={() => setPoniendo(true)}><Icon name="send" size={18} /> <span>Poner en una publicación…</span></button>
      : null;

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog est-visor" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} data-abierto={abierto || undefined}>
        <div className="est-visor-cabecera">
          <h3 id={`${id}-t`}>{a.subido ? "Imagen subida" : video ? "Video creado" : "Imagen creada"}</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        <div className="est-visor-imagen"><Pieza archivo={a} grande /></div>

        {/* La barra: lo de siempre a un toque. Arriba del panel a lo ancho; abajo, fija, en el teléfono. */}
        <div className="est-visor-barra" role="group" aria-label="Acciones de la pieza">
          {usar}
          {puedeCorregir && (
            <button type="button" className="btn btn-secondary est-barra-boton" aria-expanded={abierto === "corregir"} aria-controls={`${id}-corregir`} onClick={() => setAbierto("corregir")}>
              <Icon name="pencil" size={18} /> <span>Corregir</span>
            </button>
          )}
          {puedeOtra && (
            <button type="button" className="btn btn-secondary est-barra-boton" aria-expanded={abierto === "otra"} aria-controls={`${id}-otra`} onClick={() => setAbierto("otra")}>
              <Icon name="sparkles" size={18} /> <span>Otra versión</span>
            </button>
          )}
          {video && !lectura && clienteId && esVideoReal(a) && (
            <button type="button" className="btn btn-secondary est-barra-boton" onClick={() => setMejorando(true)} title="Escalar, cambiar la luz, cambiar algo o sacar varios ángulos de la toma, con el audio original">
              <Icon name="wand" size={18} /> <span>Mejorar</span>
            </button>
          )}
          {video && !lectura && clienteId && esVideoReal(a) && (
            <button type="button" className="btn btn-secondary est-barra-boton" onClick={() => setGanchos(true)} title="Varias versiones de la entrada del anuncio para probarlas en Meta">
              <Icon name="sparkles" size={18} /> <span>Ganchos</span>
            </button>
          )}
          <a className="btn btn-secondary est-barra-boton" href={a.src} download={nombreDeDescarga(a)}><Icon name="download" size={18} /> <span>Descargar</span></a>
          {!lectura && (
            <button type="button" className="btn btn-secondary est-barra-boton" aria-expanded={abierto === "mas"} aria-controls={`${id}-mas`} onClick={() => setAbierto("mas")}>
              <Icon name="more" size={18} /> <span>Más</span>
            </button>
          )}
        </div>

        <div ref={panel} className="est-visor-panel">
          <div role="status" aria-live="polite" className={enCamino ? "est-visor-encamino" : "sr-only"}>
            {enCamino && <><Icon name="sparkles" size={14} /> {enCamino}</>}
          </div>

          {abierto === "corregir" && puedeCorregir && (
            <Corregir
              id={`${id}-corregir`} archivo={a} galeria={galeria} cambio={cambio} setCambio={setCambio} ejemplos={ejemplos} setEjemplos={setEjemplos}
              costo={costoCorregir} ocupado={versionando} clienteId={clienteId} lectura={lectura} campo={campo}
              selector={selector(`El de corregir (${deEditar?.nombre ?? "automático"})`)}
              onEditar={editarCon} onCancelar={() => { setAbiertoEstado(""); setCambio(""); setEjemplos([]); }}
            />
          )}

          {abierto === "otra" && puedeOtra && (
            <div id={`${id}-otra`} className="est-otra" role="group" aria-labelledby={`${id}-otra-t`}>
              <span className="label" id={`${id}-otra-t`}>Otra versión</span>
              <div className="est-otra-fila">
                <span className="est-otra-versiones">
                  <label className="est-otra-cuantas">
                    <span className="sr-only">Cuántas versiones</span>
                    <select className="input" value={cuantas} disabled={versionando} onChange={(e) => setCuantas(Number(e.target.value))}>
                      {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-primary btn-sm" disabled={versionando} onClick={() => onOtrasVersiones(cuantas, modeloSel)}>
                    <Icon name="sparkles" size={14} /> {versionando ? "Pidiendo…" : `${cuantas === 1 ? "Otra versión" : `${cuantas} versiones`} · ${textoCosto((costoVersion ?? 0) * cuantas)}`}
                  </button>
                </span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={versionando} onClick={() => onOtraIgual(modeloSel)}>
                  <Icon name="refresh" size={14} /> Otra igual · {textoCosto(costoVersion ?? 0)}
                </button>
              </div>
              {!video && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} aria-expanded={variando} aria-controls={`${id}-var`}
                  title="Esta pieza como maestra: 3 a 5 más con su mismo estilo para un conjunto de anuncios" onClick={() => setVariando((v) => !v)}>
                  <Icon name="layers" size={14} /> Variaciones para anuncios
                </button>
              )}
              {!video && variando && (
                <Suspense fallback={<p role="status" className="hint">Cargando…</p>}>
                  <VariacionesAnuncio id={`${id}-var`} archivo={a} costo={costoVersion} estimado={Boolean((elegido ?? m)?.estimado)} ocupado={versionando}
                    onCrear={(n) => onOtrasVersiones(n, modeloSel, "anuncios")} onCerrar={() => setVariando(false)} />
                </Suspense>
              )}
              {selector(`El de esta pieza (${nombreDelModelo(a.modelo) || "el mismo"})`)}
              <p className="hint" style={{ margin: 0 }}>
                «Otra versión»: la misma información y el mismo texto con otra composición (el director la rediseña mirando ésta). «Otra igual» repite el pedido con la marca de hoy. Salen revisadas y con el logo, y la nueva se abre aquí{(elegido ?? m)?.estimado ? " (precio aproximado)" : ""}.
              </p>
            </div>
          )}

          {abierto === "mas" && !lectura && (
            <div id={`${id}-mas`} className="est-visor-mas" role="group" aria-label="Más acciones">
              <button type="button" className="btn btn-secondary btn-sm est-me-gusta" aria-pressed={a.favorito} onClick={onFavorito} title="El cerebro aprende de lo que te gusta"><Icon name="heart" size={16} /> {a.favorito ? "Te gusta" : "Me gusta"}</button>
              {!video && <button type="button" className="btn btn-secondary btn-sm" onClick={onAnimar}><Icon name="video" size={16} /> Animar</button>}
              {!video && <button type="button" className="btn btn-secondary btn-sm" onClick={onReferencia}><Icon name="paperclip" size={16} /> Usar de referencia</button>}
              {onRecrear && <button type="button" className="btn btn-secondary btn-sm" onClick={onRecrear} title="Para un anuncio de OTRA cuenta: lo analiza y hace una versión propia con esta marca, sin copiarlo"><Icon name="refresh" size={16} /> Recrear con mi marca</button>}
              {video && cliente && esVideoReal(a) && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExtrayendo(true)} title="Sacar lo que se dice y lo que se ve, y reescribirlo para esta marca como UGC para grabar">
                  <Icon name="user" size={16} /> Extraer guion UGC
                </button>
              )}
              {!video && onEstampar && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={onEstampar} title="Pega el logo original del kit encima, en su esquina: sale una pieza nueva">
                  <Icon name="star" size={16} /> Estampar el logo
                </button>
              )}
              {!video && onLogo && (
                <button type="button" className="btn btn-secondary btn-sm" aria-pressed={esLogo} onClick={onLogo} disabled={esLogo}>
                  <Icon name="star" size={16} /> {esLogo ? "Es el logo de la marca" : "Usar como logo"}
                </button>
              )}
              {/* Lo de la marca (el logo, una foto del catálogo…) no va a la papelera: se dice qué es y dónde se cambia. */}
              {a.deLaMarca
                ? <p className="hint" style={{ margin: 0 }}><Icon name="lock" size={14} /> Es {a.deLaMarca}: para quitarla, cámbiala primero en el kit o en el catálogo.</p>
                : <button type="button" className="btn btn-ghost btn-sm" onClick={onPapelera}><Icon name="trash" size={16} /> A la papelera</button>}
            </div>
          )}

          {/* Las otras versiones de esta pieza (la galería enseña una sola tarjeta: lib/estudio.js, `apilarVersiones`). */}
          {anteriores?.length > 0 && (() => {
            // Todas las versiones juntas, en orden de creación, con la que se ve marcada: se pasa de una a otra sin
            // perder las demás, se escoge cuál es la principal (la de la tarjeta) y se borran las que sobran.
            const principalId = a.vistaId ?? a.id;
            const todas = [a, ...anteriores].sort((x, y) => String(x.creado).localeCompare(String(y.creado)));
            return (
              <div className="est-visor-versiones">
                <p className="hint" style={{ margin: 0 }}>{todas.length} versiones de esta pieza. Toca una para verla.</p>
                <ul className="est-visor-versiones-lista">
                  {todas.map((v, i) => (
                    <li key={v.id}>
                      <button type="button" className="est-visor-version" aria-current={v.id === a.id ? "true" : undefined}
                        style={v.id === a.id ? { outline: "2px solid var(--accent)", outlineOffset: 2 } : undefined}
                        onClick={() => v.id !== a.id && onVerOriginal?.(v)}
                        aria-label={`Versión ${i + 1}${v.id === principalId ? " (la principal)" : ""}${v.usadoEn?.length ? ", en uso" : ""}: del ${new Date(v.creado).toLocaleString("es-PA")}`}>
                        <Pieza archivo={v} />
                      </button>
                      <span className="hint" style={{ display: "block", textAlign: "center", margin: 0 }}>
                        {i + 1}{v.id === principalId ? " · principal" : ""}{v.usadoEn?.length ? " · en uso" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {!lectura && (
                  <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                    {onPrincipal && a.id !== principalId && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={onPrincipal} title="Es la que enseña la tarjeta de la galería">
                        <Icon name="star" size={14} /> Hacer la principal
                      </button>
                    )}
                    {onQuitarOtras && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={onQuitarOtras}>
                        <Icon name="trash" size={14} /> Quedarme sólo con ésta (las otras {anteriores.length}, a la papelera)
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {original && (
            <p className="hint est-visor-original">
              <Icon name="refresh" size={14} /> Editada a partir de{" "}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onVerOriginal?.(original)}>la imagen original</button>, que no se tocó.
            </p>
          )}
          {!video && <ControlDeCalidad key={a.id} archivo={a} clienteId={clienteId} lectura={lectura} onAbrir={onAbrirNueva ?? onVerOriginal} />}
          {!video && (onRevisar || revision) && <RevisionDeMarca revision={revision} onRevisar={onRevisar} onCorregir={puedeCorregir ? corregirCon : null} />}
          <details className="est-visor-pedido">
            <summary>Lo que se pidió</summary>
            <p className="est-visor-prompt">{a.prompt}</p>
          </details>
          <dl className="est-detalles">
            <div><dt>Modelo</dt><dd>{a.subido ? "Subida a mano" : nombreDelModelo(a.modelo) || "Aplicación"}</dd></div>
            {a.ajustes?.aspectRatio && <div><dt>Formato</dt><dd>{NOMBRE_PROPORCION[a.ajustes.aspectRatio] ?? a.ajustes.aspectRatio} ({a.ajustes.aspectRatio})</dd></div>}
            {a.ajustes?.duration && <div><dt>Duración</dt><dd>{valorDeAjuste("duration", a.ajustes.duration)}</dd></div>}
            {a.ancho > 0 && <div><dt>Tamaño</dt><dd>{a.ancho}×{a.alto}</dd></div>}
            {a.costo > 0 && <div><dt>Costo</dt><dd>{textoCosto(a.costo)}{m?.estimado ? " (aprox.)" : ""}</dd></div>}
            <div><dt>Creada</dt><dd>{hace(a.creado)}</dd></div>
            {a.usadoEn?.length > 0 && <div><dt>En uso</dt><dd>{a.usadoEn.length} publicación{a.usadoEn.length === 1 ? "" : "es"}</dd></div>}
          </dl>
          {!lectura && (
            <div className="field">
              <label className="label" htmlFor={`${id}-c`}>Carpeta</label>
              <select id={`${id}-c`} className="input" value={a.carpetaId ?? ""} onChange={(e) => onMover(e.target.value)}>
                <option value="">Sin carpeta</option>
                {carpetas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          {!video && !lectura && clienteId && <Suspense fallback={null}><GuardarPlantilla key={`p-${a.id}`} clienteId={clienteId} archivo={a} onGuardada={onPlantilla} /></Suspense>}
          {video && clienteId && esVideoReal(a) && (
            <Suspense fallback={null}><VideoListo key={`v-${a.id}`} clienteId={clienteId} archivoId={a.id} src={a.src} inicial={a.ajustes?.revisionVideo} /></Suspense>
          )}
          {video && clienteId && esVideoReal(a) && (
            <Suspense fallback={null}><DesgloseVideo key={`d-${a.id}`} clienteId={clienteId} archivoId={a.id} src={a.src} nombre={a.prompt} inicial={a.ajustes?.deconstruccion} lectura={lectura} activos={activos} /></Suspense>
          )}
        </div>
      </div>
      {extrayendo && (
        <Suspense fallback={null}>
          <ExtraerUgc client={cliente} inicial={{ id: a.id, src: a.src, nombre: "Este video" }} onCerrar={() => setExtrayendo(false)} />
        </Suspense>
      )}
      {ganchos && (
        <Suspense fallback={null}>
          <NuevosGanchos clienteId={clienteId} archivo={a} cliente={cliente} onCerrar={() => setGanchos(false)} />
        </Suspense>
      )}
      {mejorando && (
        <Suspense fallback={null}>
          <MejorarVideo clienteId={clienteId} archivo={a} cliente={cliente} onCerrar={() => setMejorando(false)} />
        </Suspense>
      )}
      {poniendo && (
        <Suspense fallback={null}>
          <PonerEnPublicacion cliente={cliente} archivoIds={[a.id]} tipo={video ? "video" : "imagen"} descripcion={video ? "este video" : "esta imagen"} onCerrar={() => setPoniendo(false)} />
        </Suspense>
      )}
    </div>
  );
}
