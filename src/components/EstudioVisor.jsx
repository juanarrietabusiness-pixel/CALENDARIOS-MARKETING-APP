import { useId } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { modeloPorId, textoCosto, NOMBRE_PROPORCION } from "../lib/estudioCatalogo";
import { hace, nombreDeDescarga, esVideoReal, valorDeAjuste } from "../lib/estudio";

// ============================================================
// El visor: la imagen (o el video) grande y todo lo que se sabe de ella
//
// Dos columnas a partir de 900 px, una debajo de otra en el teléfono. Un video
// de verdad se reproduce con controles; la tarjeta animada de prueba es una imagen.
// ============================================================

/** La pieza, como imagen o como video. Un video pide `preload` ligero: no baja 40 MB para enseñar un fotograma. */
export function Pieza({ archivo: a, grande = false }) {
  if (esVideoReal(a)) {
    return (
      <video
        src={a.src} controls={grande} muted={!grande} playsInline preload="metadata" loop={!grande}
        aria-label={grande ? undefined : a.prompt}
      />
    );
  }
  return <img src={a.src} alt={a.prompt} loading={grande ? "eager" : "lazy"} />;
}

export default function Visor({
  archivo: a, carpetas, lectura, onCerrar, onFavorito, onPapelera, onMover, onRepetir, onVariar, onReferencia, onAnimar, onUsar, etiquetaUsar,
}) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const m = modeloPorId(a.modelo);
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
          <dl className="est-detalles">
            <div><dt>Modelo</dt><dd>{a.subido ? "Subida a mano" : m?.nombre ?? a.modelo ?? "Aplicación"}</dd></div>
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
          <div className="est-visor-acciones">
            {onUsar && <button type="button" className="btn btn-primary" onClick={onUsar}><Icon name="check" size={16} /> {etiquetaUsar ?? "Usar en la publicación"}</button>}
            {!lectura && !a.subido && <button type="button" className={`btn ${onUsar ? "btn-secondary" : "btn-primary"}`} onClick={onRepetir}><Icon name="refresh" size={16} /> Repetir</button>}
            {!lectura && !a.subido && !video && <button type="button" className="btn btn-secondary" onClick={onVariar}><Icon name="sparkles" size={16} /> Variar</button>}
            {!lectura && !video && <button type="button" className="btn btn-secondary" onClick={onAnimar}><Icon name="video" size={16} /> Animar</button>}
            {!lectura && !video && <button type="button" className="btn btn-secondary" onClick={onReferencia}><Icon name="paperclip" size={16} /> Usar de referencia</button>}
            {!lectura && <button type="button" className="btn btn-secondary" aria-pressed={a.favorito} onClick={onFavorito}><Icon name="star" size={16} /> {a.favorito ? "Es favorita" : "Favorita"}</button>}
            <a className="btn btn-secondary" href={a.src} download={nombreDeDescarga(a)}><Icon name="download" size={16} /> Descargar</a>
            {!lectura && <button type="button" className="btn btn-ghost" onClick={onPapelera}><Icon name="trash" size={16} /> A la papelera</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
