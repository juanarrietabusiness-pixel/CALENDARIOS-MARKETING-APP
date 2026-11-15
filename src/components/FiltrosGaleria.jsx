import { useId, useMemo, useState } from "react";
import Icon from "./Icon";
import { VISTAS_GALERIA, FORMAS_GALERIA, FECHAS_GALERIA, FILTROS_VACIOS, modelosDeLaGaleria, cuantosFiltros } from "../lib/estudio";
import "./EstudioGaleria.css";

// ============================================================
// Buscar y filtrar la galería del Estudio: la MISMA barra en la galería (Crear → Galería) y en «De la galería» de una
// publicación, así lo que se encuentra en una se encuentra en la otra. Los filtros son de src/lib/estudio.js
// (`filtrarArchivos`) y la búsqueda, de src/lib/galeriaVistas.js (también la usa el servidor para lo no cargado).
// ============================================================

/**
 * Las vistas como chips («Lo último», «Carruseles y reels», «Me gusta», «Marca», «Competencia», «Sin carpeta»), con su
 * número. Las vacías no salen (salvo la escogida y «Lo último»). `children`: lo que va detrás (carpetas, Drive, papelera).
 */
export function ChipsDeVistas({ filtro, cuentas = {}, onFiltro, activo = true, sin = [], mas = false, children = null }) {
  return (
    <div className="est-filtros" role="group" aria-label="Vistas de la galería">
      {VISTAS_GALERIA.filter(([id]) => !sin.includes(id) && (id === "todas" || id === filtro || (cuentas[id] ?? 0) > 0)).map(([id, nombre]) => (
        <button key={id} type="button" className="filter-chip" aria-pressed={activo && filtro === id} onClick={() => onFiltro(id)}>
          {id === "favoritas" && <Icon name="heart" size={13} />}{id === "marca" && <Icon name="lock" size={13} />}{id === "grupos" && <Icon name="copy" size={13} />}
          {" "}{nombre} ({cuentas[id] ?? 0}{mas && id !== "marca" ? "+" : ""})
        </button>
      ))}
      {children}
    </div>
  );
}

/**
 * El buscador y el panel «Filtros» (tipo, formato, producto, uso, modelo y fecha). `valor`: { ...FILTROS_VACIOS };
 * `productos`: [{ id, nombre }] del catálogo; `archivos`: la galería (para los modelos que hay). `soloImagenes`: sin el
 * filtro de tipo (la portada de un reel es una imagen).
 */
export default function FiltrosGaleria({ valor, onCambiar, archivos = [], productos = [], soloImagenes = false, buscando = false, aviso = "" }) {
  const ids = useId();
  const [abierto, setAbierto] = useState(false);
  const n = cuantosFiltros(valor);
  // Los modelos que hay en la galería, el más usado primero (por NOMBRE: «Nano Banana» junta sus dos ids).
  const modelos = useMemo(() => modelosDeLaGaleria(archivos), [archivos]);
  const poner = (k) => (e) => onCambiar({ ...valor, [k]: e.target.value });
  const campo = (k, etiqueta, opciones) => (
    <div className="est-filtro">
      <label className="label" htmlFor={`${ids}-${k}`}>{etiqueta}</label>
      <select id={`${ids}-${k}`} className="input" value={valor[k] ?? ""} onChange={poner(k)}>
        {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
  return (
    <div className="est-buscador">
      <div className="est-buscar">
        <label className="sr-only" htmlFor={`${ids}-b`}>Buscar en la galería</label>
        <input
          id={`${ids}-b`} type="search" className="input" value={valor.texto}
          placeholder="Buscar: qué se ve, el producto, el post, el modelo o la fecha…" onChange={poner("texto")}
        />
        <button type="button" className="btn btn-secondary btn-sm est-filtros-boton" aria-expanded={abierto} aria-controls={`${ids}-p`} onClick={() => setAbierto((v) => !v)}>
          <Icon name="filter" size={14} /> Filtros{n ? ` (${n})` : ""}
        </button>
      </div>
      <p className="est-buscar-estado" role="status">{buscando ? "Buscando en toda la galería…" : aviso}</p>
      <div id={`${ids}-p`} className="est-filtros-panel" hidden={!abierto}>
        {!soloImagenes && campo("tipo", "Tipo", [["", "Todo"], ["imagen", "Imágenes"], ["video", "Videos"], ["subida", "Subidas a mano"]])}
        {campo("forma", "Formato", [["", "Todos"], ...FORMAS_GALERIA])}
        {productos.length > 0 && campo("producto", "Producto", [["", "Todos"], ...productos.map((p) => [p.id, p.nombre])])}
        {campo("uso", "Uso", [["", "Usadas o no"], ["sin-usar", "Sin usar"], ["usadas", "Ya en una publicación"]])}
        {campo("fecha", "Fecha", [["", "Cualquiera"], ...FECHAS_GALERIA])}
        {(modelos.length > 1 || valor.modelo) && campo("modelo", "Modelo", [["", "Todos"], ...modelos.map((m) => [m.nombre, `${m.nombre} (${m.n})`])])}
        {n > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambiar({ ...FILTROS_VACIOS, texto: valor.texto })}>
            <Icon name="close" size={14} /> Quitar los filtros
          </button>
        )}
      </div>
    </div>
  );
}
