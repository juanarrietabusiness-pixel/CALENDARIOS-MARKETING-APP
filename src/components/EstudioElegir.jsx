import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { ideaDelPedido } from "../lib/kitMarca";
import "./ReferenciasGaleria.css";

// ============================================================
// «De la galería» del compositor: escoger VARIAS de una vez, sin saltos
//
// Antes, «De la galería» bajaba la página hasta la galería, se tocaba UNA imagen, la página subía otra vez al
// compositor y había que repetirlo por cada referencia (Estudio.jsx: `destinoGaleria` se vaciaba tras una). Ahora es un
// diálogo encima: se buscan y se marcan las que quepan («2 de 3»: los huecos que deja el modelo en ese sitio) y se
// ponen todas juntas. En el ORDEN en que se tocan: la primera es la referencia 1 del pedido.
// ============================================================

const NOMBRE_SITIO = { reference: "de referencia", start: "de imagen inicial", end: "de imagen final" };

/**
 * @param archivos  la galería del cliente (ya leída por el Estudio): sólo se ofrecen las imágenes
 * @param rol       el sitio del pedido («reference», «start», «end»)
 * @param caben     cuántas caben todavía en ese sitio
 * @param yaPuestas ids que ya están en el pedido (se ven marcadas y no se pueden volver a poner)
 * @param onPoner   (archivos en orden) => void
 */
export default function EstudioElegir({ archivos = [], rol = "reference", caben = 1, yaPuestas = [], onPoner, onCerrar }) {
  const ids = useId();
  const ref = useDialogA11y(onCerrar);
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [elegidas, setElegidas] = useState([]);
  const buscar = useRef(null);
  useEffect(() => { buscar.current?.focus({ preventScroll: true }); }, []);

  const imagenes = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return archivos
      .filter((a) => a.tipo === "imagen" && a.src && !a.borradoAt)
      .filter((a) => (filtro === "gustos" ? a.favorito : filtro === "subidas" ? a.subido : true))
      .filter((a) => !q || `${ideaDelPedido(a.prompt ?? "")} ${a.nombre ?? ""}`.toLowerCase().includes(q))
      .slice(0, 120);
  }, [archivos, texto, filtro]);

  const marcada = (a) => elegidas.some((x) => x.id === a.id);
  const lleno = elegidas.length >= caben;
  const alternar = (a) => setElegidas((l) => (l.some((x) => x.id === a.id) ? l.filter((x) => x.id !== a.id) : l.length >= caben ? (caben === 1 ? [a] : l) : [...l, a]));

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={ref} className="dialog ref-galeria-dialogo est-elegir" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} aria-describedby={`${ids}-d`}>
        <div className="ref-galeria-cabecera">
          <h3 id={`${ids}-t`}>De la galería</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onCerrar}><Icon name="close" size={18} /></button>
        </div>
        <p id={`${ids}-d`} className="hint" style={{ margin: 0 }}>
          Toca las que quieras poner {NOMBRE_SITIO[rol] ?? ""}{caben > 1 ? ", en el orden en que las tocas" : ""}. Caben {caben}.
        </p>
        <div className="est-elegir-filtros">
          <label className="sr-only" htmlFor={`${ids}-b`}>Buscar en la galería</label>
          <input id={`${ids}-b`} ref={buscar} type="search" className="input" placeholder="Buscar por lo que se pidió…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="est-tipos" role="group" aria-label="Cuáles">
            {[["todas", "Todas"], ["gustos", "Me gusta"], ["subidas", "Subidas"]].map(([id, n]) => (
              <button key={id} type="button" className="filter-chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{n}</button>
            ))}
          </div>
        </div>
        {!imagenes.length ? <p className="hint">No hay imágenes con ese filtro.</p> : (
          <ul className="ref-galeria-rejilla" aria-label="Imágenes de la galería">
            {imagenes.map((a) => {
              const puesta = yaPuestas.includes(a.id);
              const n = elegidas.findIndex((x) => x.id === a.id) + 1;
              return (
                <li key={a.id}>
                  <button type="button" className="ref-galeria-opcion est-elegir-opcion" disabled={puesta || (lleno && !marcada(a) && caben > 1)}
                    aria-pressed={marcada(a)} aria-label={`${puesta ? "Ya está en el pedido" : marcada(a) ? `Escogida (${n})` : "Escoger"}: ${ideaDelPedido(a.prompt ?? "").slice(0, 80) || "imagen"}`}
                    onClick={() => alternar(a)}>
                    <img src={a.src} alt="" loading="lazy" />
                    {(n > 0 || puesta) && <span className="est-elegir-numero" aria-hidden="true">{puesta ? <Icon name="check" size={12} /> : n}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="est-elegir-pie">
          <span className="hint" role="status">{elegidas.length} de {caben}</span>
          <button type="button" className="btn btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!elegidas.length} onClick={() => onPoner(elegidas)}>
            <Icon name="check" size={16} /> {elegidas.length > 1 ? `Poner las ${elegidas.length}` : "Poner"}
          </button>
        </div>
      </div>
    </div>
  );
}
