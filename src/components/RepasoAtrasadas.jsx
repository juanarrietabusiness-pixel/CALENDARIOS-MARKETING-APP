import Icon from "./Icon";
import SelectorFecha from "./SelectorFecha";
import { sumarDias, textoAtraso } from "../lib/agenda";
import "./RepasoAtrasadas.css";

// ============================================================
// El repaso de la mañana
//
// La primera vez que alguien abre sus tareas en el día y tiene
// atrasadas, se le pregunta qué hace con cada una: hoy, mañana, otro día
// o ya está hecha. Esconderlas no sirve —lo atrasado escondido se
// pudre—, y dejarlas en rojo para siempre tampoco: acaba siendo ruido.
//
// «Listo por hoy» lo cierra hasta mañana; se recuerda por persona y por
// navegador (`useRepaso`). Si se queda sin atrasadas, se cierra solo.
// ============================================================

export default function RepasoAtrasadas({ items, hoy, nombreDe, onMover, onHecha, onCerrar }) {
  if (!items.length) return null;
  const todasAHoy = async () => {
    for (const { tarea } of items) await onMover(tarea, hoy);
    onCerrar();
  };
  return (
    <section className="repaso" aria-label="Repaso de las atrasadas">
      <div className="repaso-cabecera">
        <Icon name="sun" size={18} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="repaso-titulo">Buenos días. Tienes {items.length} {items.length === 1 ? "tarea atrasada" : "tareas atrasadas"}.</p>
          <p className="repaso-ayuda">¿Qué hacemos con cada una?</p>
        </div>
      </div>
      <ul className="repaso-lista">
        {items.map(({ tarea: t, atraso }) => (
          <li key={`${t._rapida ? "r" : "c"}:${t.id}`} className="repaso-fila">
            <div className="repaso-fila-texto">
              <span className="repaso-fila-titulo">{t.title}</span>
              <span className="repaso-fila-meta">
                {t._rapida ? "Sin empresa" : nombreDe(t.client_id) || "Empresa"} · <span className="dia-atraso">{textoAtraso(atraso)}</span>
              </span>
            </div>
            <div className="repaso-acciones">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMover(t, hoy)}>Hoy</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMover(t, sumarDias(hoy, 1))}>Mañana</button>
              <SelectorFecha value={null} onChange={(f) => f && onMover(t, f)} etiqueta={`Mover «${t.title}» a otro día`} vacio="Otro día" prefijo="Para" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onHecha(t)} aria-label={`Ya está hecha: ${t.title}`}>
                <Icon name="check" size={14} /> Hecha
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="repaso-pie">
        <button type="button" className="btn btn-primary btn-sm" onClick={todasAHoy}>Todas a hoy</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrar}>Listo por hoy</button>
      </div>
    </section>
  );
}
