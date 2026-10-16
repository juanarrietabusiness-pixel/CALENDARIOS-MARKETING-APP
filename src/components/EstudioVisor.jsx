import { useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { modeloPorId, nombreDelModelo, textoCosto, NOMBRE_PROPORCION } from "../lib/estudioCatalogo";
import * as api from "../lib/estudio";
import { hace, nombreDeDescarga, esVideoReal, valorDeAjuste, ATAJOS_EDICION } from "../lib/estudio";
import { corregirTexto } from "../lib/controlEstudio";
import { resumenControl } from "../lib/control";
import ReferenciasGaleria from "./ReferenciasGaleria";
import GuardarRegla from "./GuardarRegla";

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
  const corregir = () => hacer("Corrigiendo el texto (tarda un poco)…", async () => {
    const r = await corregirTexto({ clienteId, archivo, control });
    if (r.corregida) onAbrir?.(r.archivo);
    else setError(`La corrección no mejoró el texto${r.intento ? " (quedó en la galería)" : ""}: prueba «Editar» con tus palabras.`);
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
        </>
      ) : <p className="hint">Sin revisar: la IA puede leer el texto letra por letra y buscar precios inventados, el logo y deformaciones.</p>}
      {error && <p role="alert" className="cerebro-error">{error}</p>}
      {/* Los botones se quedan mientras trabaja (`aria-disabled`, no `disabled`): si desaparecieran o se deshabilitaran,
          el foco se iría al body y Escape ya no cerraría el visor. */}
      {!lectura && (
        <div className="est-control-botones">
          {control?.soloTexto && <button type="button" className="btn btn-primary btn-sm" aria-disabled={Boolean(ocupado)} onClick={() => !ocupado && corregir()}><Icon name="wand" size={14} /> Corregir el texto</button>}
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

export default function Visor({
  archivo: a, carpetas, lectura, onCerrar, onFavorito, onPapelera, onMover, onRepetir, onReferencia, onAnimar, onUsar, etiquetaUsar,
  costoOtra = null, onOtraIgual = null, onOtrasVersiones = null, versionando = false, onRecrear = null,
  onEditar = null, original = null, onVerOriginal = null,
  esLogo = false, onLogo = null, revision = null, onRevisar = null, onCorregir = null, galeria = [],
  clienteId = null, onEstampar = null,
}) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const [editando, setEditando] = useState(false);
  const [cambio, setCambio] = useState("");
  const [ejemplos, setEjemplos] = useState([]);
  const [cuantas, setCuantas] = useState(1);
  const m = modeloPorId(a.modelo);
  const puedeOtra = !lectura && !a.subido && costoOtra != null && onOtraIgual;
  const video = a.tipo === "video";
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog est-visor" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="est-visor-imagen"><Pieza archivo={a} grande /></div>
        <div className="est-visor-panel">
          <div className="est-visor-cabecera">
            <h3 id={`${id}-t`}>{a.subido ? "Imagen subida" : video ? "Video creado" : "Imagen creada"}</h3>
            <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
          </div>
          <p className="est-visor-prompt">{a.prompt}</p>
          {original && (
            <p className="hint est-visor-original">
              <Icon name="refresh" size={14} /> Editada a partir de{" "}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onVerOriginal?.(original)}>la imagen original</button>, que no se tocó.
            </p>
          )}
          <dl className="est-detalles">
            <div><dt>Modelo</dt><dd>{a.subido ? "Subida a mano" : nombreDelModelo(a.modelo) || "Aplicación"}</dd></div>
            {a.ajustes?.aspectRatio && <div><dt>Formato</dt><dd>{NOMBRE_PROPORCION[a.ajustes.aspectRatio] ?? a.ajustes.aspectRatio} ({a.ajustes.aspectRatio})</dd></div>}
            {a.ajustes?.duration && <div><dt>Duración</dt><dd>{valorDeAjuste("duration", a.ajustes.duration)}</dd></div>}
            {a.ancho > 0 && <div><dt>Tamaño</dt><dd>{a.ancho}×{a.alto}</dd></div>}
            {a.costo > 0 && <div><dt>Costo</dt><dd>{textoCosto(a.costo)}{m?.estimado ? " (aprox.)" : ""}</dd></div>}
            <div><dt>Creada</dt><dd>{hace(a.creado)}</dd></div>
            {a.usadoEn.length > 0 && <div><dt>En uso</dt><dd>{a.usadoEn.length} publicación{a.usadoEn.length === 1 ? "" : "es"}</dd></div>}
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
          {editando && (
            <form className="est-editar" onSubmit={(e) => { e.preventDefault(); if (cambio.trim()) onEditar(cambio, ejemplos); }}>
              <label className="label" htmlFor={`${id}-e`}>¿Qué cambio?</label>
              <input id={`${id}-e`} className="input" value={cambio} maxLength={500}
                placeholder="Ej.: quita el texto de arriba y pon el fondo blanco" onChange={(e) => setCambio(e.target.value)} />
              <div className="est-editar-atajos" role="group" aria-label="Cambios frecuentes">
                {ATAJOS_EDICION.map((t) => (
                  <button key={t} type="button" className="filter-chip" onClick={() => setCambio((c) => (c.trim() ? `${c.trim().replace(/[.\s]+$/, "")}; ${t.toLowerCase()}` : t))}>{t}</button>
                ))}
              </div>
              <ReferenciasGaleria archivos={galeria} elegidas={ejemplos} onCambiar={setEjemplos} max={2} etiqueta="Ejemplo de la galería" />
              <div className="est-editar-botones">
                <button type="submit" className="btn btn-primary btn-sm" disabled={!cambio.trim()}><Icon name="wand" size={14} /> Editar con IA</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditando(false); setCambio(""); }}>Cancelar</button>
                {clienteId && !lectura && <GuardarRegla clienteId={clienteId} texto={cambio} />}
              </div>
              <p className="hint" style={{ margin: 0 }}>Sale una imagen NUEVA en la galería; esta se queda como está.</p>
            </form>
          )}
          {puedeOtra && (
            <div className="est-otra" role="group" aria-labelledby={`${id}-otra`}>
              <span className="label" id={`${id}-otra`}>¿Otra?</span>
              <div className="est-otra-fila">
                <button type="button" className="btn btn-secondary btn-sm" disabled={versionando} onClick={onOtraIgual}>
                  <Icon name="refresh" size={14} /> Otra igual
                </button>
                <span className="est-otra-versiones">
                  <label className="est-otra-cuantas">
                    <span className="sr-only">Cuántas versiones</span>
                    <select className="input" value={cuantas} disabled={versionando} onChange={(e) => setCuantas(Number(e.target.value))}>
                      {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={versionando} onClick={() => onOtrasVersiones(cuantas)}>
                    <Icon name="sparkles" size={14} /> {versionando ? "Escribiendo las versiones…" : cuantas === 1 ? "Otra versión distinta" : `${cuantas} versiones distintas`}
                  </button>
                </span>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                «Otra igual» repite el pedido. «Versión distinta»: la misma información con otra escena (la IA la escribe); se quedan el tipo, la marca y las referencias.
                {" "}{textoCosto(costoOtra)} cada una{m?.estimado ? ", aprox." : ""}.
              </p>
            </div>
          )}
          {!video && <ControlDeCalidad key={a.id} archivo={a} clienteId={clienteId} lectura={lectura} onAbrir={onVerOriginal} />}
          {!video && (onRevisar || revision) && <RevisionDeMarca revision={revision} onRevisar={onRevisar} onCorregir={lectura ? null : onCorregir} />}
          <div className="est-visor-acciones">
            {!lectura && !video && onEditar && !editando && <button type="button" className="btn btn-secondary" onClick={() => setEditando(true)}><Icon name="pencil" size={16} /> Editar</button>}
            {onUsar && <button type="button" className="btn btn-primary" onClick={onUsar}><Icon name="check" size={16} /> {etiquetaUsar ?? "Usar en la publicación"}</button>}
            {!lectura && !a.subido && <button type="button" className={`btn ${onUsar ? "btn-secondary" : "btn-primary"}`} onClick={onRepetir}><Icon name="pencil" size={16} /> Ajustar y pedir</button>}
            {!lectura && !video && <button type="button" className="btn btn-secondary" onClick={onAnimar}><Icon name="video" size={16} /> Animar</button>}
            {!lectura && !video && <button type="button" className="btn btn-secondary" onClick={onReferencia}><Icon name="paperclip" size={16} /> Usar de referencia</button>}
            {!lectura && onRecrear && <button type="button" className="btn btn-secondary" onClick={onRecrear} title="Analizarlo y hacer una versión con la marca"><Icon name="refresh" size={16} /> Recrear como anuncio</button>}
            {!lectura && !video && onEstampar && (
              <button type="button" className="btn btn-secondary" onClick={onEstampar} title="Pega el logo original del kit encima, en su esquina: sale una pieza nueva">
                <Icon name="star" size={16} /> Estampar el logo
              </button>
            )}
            {!lectura && !video && onLogo && (
              <button type="button" className="btn btn-secondary" aria-pressed={esLogo} onClick={onLogo} disabled={esLogo}>
                <Icon name="star" size={16} /> {esLogo ? "Es el logo de la marca" : "Usar como logo"}
              </button>
            )}
            {!lectura && <button type="button" className="btn btn-secondary est-me-gusta" aria-pressed={a.favorito} onClick={onFavorito} title="El cerebro aprende de lo que te gusta"><Icon name="heart" size={16} /> {a.favorito ? "Te gusta" : "Me gusta"}</button>}
            <a className="btn btn-secondary" href={a.src} download={nombreDeDescarga(a)}><Icon name="download" size={16} /> Descargar</a>
            {!lectura && <button type="button" className="btn btn-ghost" onClick={onPapelera}><Icon name="trash" size={16} /> A la papelera</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
