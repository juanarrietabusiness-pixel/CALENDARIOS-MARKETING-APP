import { useState, useMemo, useId, useEffect, useRef } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { MONTHS } from "../constants";
import { buscarEnEspacio } from "../lib/buscar";

// ============================================================
// Buscar y saltar (Ctrl+K / ⌘K)
//
// Llegar a un mes concreto de un cliente eran tres o cuatro toques —
// abrir el cajón, el cliente, la pestaña del mes, buscar el día—. Esto
// busca en clientes, calendarios y publicaciones a la vez, y lleva
// también a las acciones que se usan todo el rato.
//
// Patrón combobox: el foco se queda en el campo y las flechas mueven la
// opción activa (`aria-activedescendant`), como en cualquier buscador.
// ============================================================

export default function Buscador({ clients, client, onClose, onElegir }) {
  const ref = useDialogA11y(onClose);
  const ids = useId();
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const lista = useRef(null);

  const resultados = useMemo(
    () => buscarEnEspacio({ clients, client, texto, meses: MONTHS }),
    [clients, client, texto],
  );

  useEffect(() => { setActivo(0); }, [texto]);
  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  const alTeclear = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActivo((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && resultados[activo]) { e.preventDefault(); onElegir(resultados[activo]); }
  };

  let grupoAnterior = null;

  return (
    <div className="overlay buscador-capa">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Buscar" className="buscador">
        <div className="buscador-campo">
          <Icon name="search" size={18} />
          <input
            className="input"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${ids}-lista`}
            aria-activedescendant={resultados[activo] ? `${ids}-op-${activo}` : undefined}
            aria-autocomplete="list"
            aria-label="Buscar clientes, calendarios, publicaciones o acciones"
            placeholder="Busca un cliente, un mes, una publicación…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
          />
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar el buscador">
            <Icon name="close" size={18} />
          </button>
        </div>

        <ul id={`${ids}-lista`} role="listbox" ref={lista} className="buscador-lista" aria-label="Resultados">
          {resultados.length === 0 && (
            <li role="presentation" className="buscador-vacio">Nada con «{texto}».</li>
          )}
          {resultados.map((r, i) => {
            const cabecera = r.grupo !== grupoAnterior ? r.grupo : null;
            grupoAnterior = r.grupo;
            return (
              <li key={`${r.grupo}-${r.clave}`} role="presentation">
                {cabecera && <p className="buscador-grupo" aria-hidden="true">{cabecera}</p>}
                <button
                  type="button"
                  tabIndex={-1}
                  id={`${ids}-op-${i}`}
                  role="option"
                  aria-selected={i === activo}
                  data-indice={i}
                  className="buscador-opcion"
                  onPointerMove={() => setActivo(i)}
                  onClick={() => onElegir(r)}
                >
                  <Icon name={r.icono} size={16} />
                  <span className="buscador-texto">
                    <span>{r.titulo}</span>
                    {r.detalle && <span className="buscador-detalle">{r.detalle}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="buscador-pie" aria-hidden="true">
          <kbd>↑</kbd><kbd>↓</kbd> moverse · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> cerrar
        </p>
      </div>
    </div>
  );
}
