import { useEffect, useId, useRef } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { useDialogA11y } from "../hooks/useDialogA11y";

// ============================================================
// El visor grande de la carpeta de Drive de un cliente
//
// Antes tocar un archivo lo abría en otra pestaña, uno a uno, y los
// videos no se reproducían. Aquí se ve en grande DENTRO de la aplicación
// y se pasa al anterior o al siguiente sin cerrar: con las flechas de la
// pantalla, con las del teclado o deslizando el dedo.
//
// El archivo sale de /api/drive/…/archivo/<id>, que admite Range: el
// <video> avanza sin bajarse el archivo entero (y el iPhone lo exige).
// ============================================================

/** Lo que se mueve el dedo para que cuente como «pasar»: menos es un toque. */
const UMBRAL_DESLIZAR = 50;
/** La franja de abajo de un video donde están sus controles. */
const ALTO_CONTROLES = 64;

export default function VisorDrive({ clienteId, archivos, indice, onCambiar, onCerrar }) {
  const ref = useDialogA11y(onCerrar);
  const id = useId();
  const inicio = useRef(null);
  const total = archivos.length;
  const a = archivos[indice];
  const hayAnterior = indice > 0;
  const haySiguiente = indice < total - 1;
  const ir = (d) => {
    const j = indice + d;
    if (j >= 0 && j < total) onCambiar(j);
  };

  // Flechas del teclado. Escape lo atiende useDialogA11y con el foco dentro;
  // aquí también, porque al llegar al último la flecha se deshabilita y el
  // foco se va al <body>, fuera del diálogo.
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === "Escape") { onCerrar(); return; }
      // En un campo, o con el foco en el video (las flechas ahí adelantan y atrasan), no se pasa.
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|VIDEO)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); ir(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); ir(1); }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  });

  // Deslizar con el dedo (o arrastrar con el ratón) sobre el archivo.
  const alEmpezar = (e) => {
    // La barra de controles del video (abajo) se arrastra para avanzar: eso no es pasar de archivo.
    if (e.target instanceof HTMLVideoElement && e.clientY > e.target.getBoundingClientRect().bottom - ALTO_CONTROLES) return;
    inicio.current = { x: e.clientX, y: e.clientY };
  };
  const alTerminar = (e) => {
    const s = inicio.current;
    inicio.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < UMBRAL_DESLIZAR || Math.abs(dx) < Math.abs(dy)) return;
    ir(dx < 0 ? 1 : -1);
  };

  if (!a) return null;
  const src = db.urlArchivoDrive(clienteId, a.id);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="visor-drive" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="visor-drive-cabecera">
          <div className="visor-drive-titulo">
            <h3 id={`${id}-t`}>{a.nombre}</h3>
            <span className="visor-drive-cuenta">{indice + 1} de {total}</span>
          </div>
          <a className="btn-icon" href={db.urlArchivoDrive(clienteId, a.id, { descargar: true })} aria-label={`Descargar ${a.nombre}`} title="Descargar">
            <Icon name="download" size={18} />
          </a>
          <button type="button" className="btn-icon" onClick={onCerrar} aria-label="Cerrar el visor">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div
          className="visor-drive-escenario"
          onPointerDown={alEmpezar}
          onPointerUp={alTerminar}
          onPointerCancel={() => { inicio.current = null; }}
        >
          {a.tipo === "video" ? (
            // `key`: al pasar al siguiente, un <video> nuevo, sin el sonido del anterior.
            <video key={a.id} src={src} controls playsInline preload="metadata" className="visor-drive-medio" />
          ) : (
            <img key={a.id} src={src} alt={a.nombre} className="visor-drive-medio" draggable={false} />
          )}
          <button type="button" className="visor-drive-flecha" data-lado="izq" onClick={() => ir(-1)} disabled={!hayAnterior} aria-label="Anterior">
            <Icon name="chevronLeft" size={28} />
          </button>
          <button type="button" className="visor-drive-flecha" data-lado="der" onClick={() => ir(1)} disabled={!haySiguiente} aria-label="Siguiente">
            <Icon name="chevronRight" size={28} />
          </button>
        </div>
        <p className="visor-drive-ayuda">← → para pasar · desliza en el teléfono · Esc para cerrar</p>
      </div>
    </div>
  );
}
