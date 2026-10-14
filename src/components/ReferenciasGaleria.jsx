import { useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { TOMAS } from "../lib/referencias";
import "./ReferenciasGaleria.css";

/**
 * «+ Referencia de la galería»: escoger imágenes de la galería del cliente como ejemplo (al corregir una imagen, una
 * lámina, un fotograma o un tramo) o como referencia (el reel), cada una con QUÉ se toma de ella. Las claves son de
 * la galería de ESE cliente: el servidor las vuelve a comprobar al pedir.
 *
 *   archivos   la galería (se ofrecen sólo las imágenes)
 *   elegidas   [{ id, clave, src, toma, nota }]
 *   onCambiar  (lista) => void
 */
export default function ReferenciasGaleria({ archivos = [], elegidas = [], onCambiar, max = 3, etiqueta = "Referencia de la galería", compacto = false }) {
  const ids = useId();
  const [abierto, setAbierto] = useState(false);
  const imagenes = useMemo(() => archivos.filter((a) => a.tipo === "imagen" && a.src && !a.borradoAt).slice(0, 80), [archivos]);
  const cambiar = (id, cambios) => onCambiar(elegidas.map((e) => (e.id === id ? { ...e, ...cambios } : e)));
  const anadir = (a) => {
    if (!elegidas.some((e) => e.id === a.id) && elegidas.length < max) onCambiar([...elegidas, { id: a.id, clave: a.clave, src: a.src, toma: [], nota: "" }]);
    setAbierto(false);
  };
  return (
    <div className={`ref-galeria${compacto ? " ref-galeria-compacta" : ""}`}>
      {elegidas.length > 0 && (
        <ul className="ref-galeria-lista">
          {elegidas.map((e, i) => (
            <li key={e.id} className="ref-galeria-item">
              <img src={e.src} alt="" />
              <label className="sr-only" htmlFor={`${ids}-t-${e.id}`}>Qué se toma de la referencia {i + 1}</label>
              <select id={`${ids}-t-${e.id}`} className="input" value={e.toma?.[0] ?? ""} onChange={(ev) => cambiar(e.id, { toma: ev.target.value ? [ev.target.value] : [] })}>
                <option value="">Tomar: todo</option>
                {TOMAS.map(([id, n]) => <option key={id} value={id}>Tomar: {n.toLowerCase()}</option>)}
              </select>
              <button type="button" className="btn-icon" aria-label={`Quitar la referencia ${i + 1}`} onClick={() => onCambiar(elegidas.filter((x) => x.id !== e.id))}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {elegidas.length < max && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={!imagenes.length} title={imagenes.length ? "" : "La galería no tiene imágenes"} onClick={() => setAbierto(true)}>
          <Icon name="image" size={14} /> {etiqueta}
        </button>
      )}
      {abierto && <Escoger imagenes={imagenes} yaPuestas={elegidas.map((e) => e.id)} onEscoger={anadir} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

function Escoger({ imagenes, yaPuestas, onEscoger, onCerrar }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog ref-galeria-dialogo" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`}>
        <div className="ref-galeria-cabecera">
          <h3 id={`${ids}-t`}>Escoge una imagen de la galería</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        <ul className="ref-galeria-rejilla">
          {imagenes.map((a) => (
            <li key={a.id}>
              <button type="button" className="ref-galeria-opcion" disabled={yaPuestas.includes(a.id)} aria-label={`Usar: ${a.prompt || a.nombre || "imagen"}`} onClick={() => onEscoger(a)}>
                <img src={a.src} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
