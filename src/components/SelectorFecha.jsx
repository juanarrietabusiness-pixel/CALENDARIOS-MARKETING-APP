import { useState, useEffect, useRef, useId, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { MONTHS } from "../constants";
import { fechaEnZona, sumarDias, diaSemana, esFecha, textoFecha } from "../lib/agenda";

// ============================================================
// Escoger una fecha en un calendario del mes
//
// El `<input type="date">` obligaba a teclear día, mes y año —y en
// cada navegador se veía distinto: mm/dd/yyyy en unos, dd/mm/aaaa en
// otros—. Esto abre el mes actual y se toca el día.
//
// Tres decisiones:
//
//   · Es un DESPLEGABLE anclado a un botón, no un diálogo: se cierra con
//     Escape y con un clic fuera, y el fondo sigue usable. Por eso es
//     el rol de grupo y no el de diálogo (ver CLAUDE.md, el selector de
//     hora).
//   · Se pinta en un PORTAL, con posición fija calculada desde el botón.
//     Dentro de un panel con `overflow: hidden` o de un diálogo, un
//     desplegable normal salía recortado o debajo del fondo oscuro.
//   · La semana empieza en lunes, como la rejilla del calendario de la
//     aplicación.
// ============================================================

const DIAS_CORTOS = ["L", "M", "M", "J", "V", "S", "D"];
const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const ANCHO = 296;
const MARGEN = 8;

const primeroDelMes = (f) => `${f.slice(0, 8)}01`;
const mesSiguiente = (f, n) => {
  let a = +f.slice(0, 4);
  let m = +f.slice(5, 7) - 1 + n;
  a += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return `${a}-${String(m + 1).padStart(2, "0")}-01`;
};

/** Las celdas del mes, con los huecos de delante para empezar en lunes. */
function celdasDelMes(primero) {
  const hueco = (diaSemana(primero) + 6) % 7;
  const celdas = Array(hueco).fill(null);
  for (let f = primero; f.slice(0, 7) === primero.slice(0, 7); f = sumarDias(f, 1)) celdas.push(f);
  return celdas;
}

function nombreLargo(f) {
  const dia = DIAS_LARGOS[(diaSemana(f) + 6) % 7];
  return `${dia} ${+f.slice(8, 10)} de ${MONTHS[+f.slice(5, 7) - 1].toLowerCase()} de ${f.slice(0, 4)}`;
}

/**
 * @param {string|null} value   AAAA-MM-DD o vacío
 * @param {(f: string|null) => void} onChange
 * @param {string} etiqueta     nombre accesible («Fecha límite de …»)
 * @param {string} vacio        lo que dice el botón sin fecha
 */
export default function SelectorFecha({ value, onChange, etiqueta = "Fecha límite", vacio = "Sin fecha", prefijo = "Vence" }) {
  const hoy = fechaEnZona();
  const valor = esFecha(value) ? value : null;
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(primeroDelMes(valor ?? hoy));
  const [enfocado, setEnfocado] = useState(valor ?? hoy);
  const [posicion, setPosicion] = useState(null);
  const boton = useRef(null);
  const capa = useRef(null);
  const id = useId();

  const abrir = () => {
    const base = valor ?? hoy;
    setMes(primeroDelMes(base));
    setEnfocado(base);
    setAbierto(true);
  };
  const cerrar = useCallback((devolverFoco = true) => {
    setAbierto(false);
    setPosicion(null);
    if (devolverFoco) boton.current?.focus();
  }, []);

  const elegir = (f) => {
    onChange(f);
    cerrar();
  };

  // Posición: debajo del botón, o encima si abajo no cabe; nunca fuera
  // de la pantalla por los lados.
  const colocar = useCallback(() => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(ANCHO, window.innerWidth - MARGEN * 2);
    const alto = capa.current?.offsetHeight ?? 360;
    const izquierda = Math.max(MARGEN, Math.min(r.left, window.innerWidth - ancho - MARGEN));
    const abajo = r.bottom + 6;
    const arriba = r.top - alto - 6;
    const top = abajo + alto > window.innerHeight - MARGEN && arriba > MARGEN ? arriba : abajo;
    setPosicion({ top, left: izquierda, width: ancho });
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return;
    colocar();
  }, [abierto, mes, colocar]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => {
      if (capa.current?.contains(e.target) || boton.current?.contains(e.target)) return;
      cerrar(false);
    };
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    window.addEventListener("pointerdown", fuera, true);
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, true);
    return () => {
      window.removeEventListener("pointerdown", fuera, true);
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("resize", colocar);
      window.removeEventListener("scroll", colocar, true);
    };
  }, [abierto, cerrar, colocar]);

  // El foco va al día enfocado al abrir y al moverse con las flechas.
  // Espera a que la capa esté COLOCADA: mientras calcula su posición va
  // oculta, y un elemento oculto no acepta el foco.
  const colocado = posicion !== null;
  useEffect(() => {
    if (!abierto || !colocado) return;
    capa.current?.querySelector(`[data-fecha="${enfocado}"]`)?.focus({ preventScroll: true });
  }, [abierto, colocado, enfocado, mes]);

  const moverFoco = (e) => {
    const pasos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!pasos) return;
    e.preventDefault();
    const nuevo = sumarDias(enfocado, pasos);
    setEnfocado(nuevo);
    if (nuevo.slice(0, 7) !== mes.slice(0, 7)) setMes(primeroDelMes(nuevo));
  };

  const celdas = celdasDelMes(mes);
  const titulo = `${MONTHS[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`;

  return (
    <>
      <button
        ref={boton}
        type="button"
        className={`selector-fecha-boton ${valor ? "con-fecha" : ""}`}
        onClick={() => (abierto ? cerrar() : abrir())}
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={`${etiqueta}: ${valor ? nombreLargo(valor) : "sin fecha"}. Cambiar`}
      >
        <Icon name="calendar" size={14} />
        <span>{valor ? `${prefijo} ${textoFecha(valor, hoy).toLowerCase()}` : vacio}</span>
      </button>

      {abierto && createPortal(
        <div
          ref={capa}
          id={id}
          role="group"
          aria-label={etiqueta}
          className="selector-fecha"
          style={posicion ? { top: posicion.top, left: posicion.left, width: posicion.width } : { visibility: "hidden" }}
        >
          <div className="selector-fecha-cabecera">
            <button type="button" className="btn-icon" onClick={() => setMes(mesSiguiente(mes, -1))} aria-label="Mes anterior">
              <Icon name="chevronLeft" size={18} />
            </button>
            <span className="selector-fecha-titulo" aria-live="polite">{titulo}</span>
            <button type="button" className="btn-icon" onClick={() => setMes(mesSiguiente(mes, 1))} aria-label="Mes siguiente">
              <Icon name="chevronRight" size={18} />
            </button>
          </div>

          <div className="selector-fecha-semana" aria-hidden="true">
            {DIAS_CORTOS.map((d, i) => <span key={i} data-finde={i >= 5}>{d}</span>)}
          </div>

          <div className="selector-fecha-dias" onKeyDown={moverFoco}>
            {celdas.map((f, i) => f === null ? (
              <span key={`h${i}`} aria-hidden="true" />
            ) : (
              <button
                key={f}
                type="button"
                data-fecha={f}
                className="selector-fecha-dia"
                data-hoy={f === hoy}
                data-pasado={f < hoy}
                data-finde={(diaSemana(f) + 6) % 7 >= 5}
                aria-pressed={f === valor}
                aria-label={`${nombreLargo(f)}${f === hoy ? ", hoy" : ""}`}
                tabIndex={f === enfocado ? 0 : -1}
                onClick={() => elegir(f)}
              >
                {+f.slice(8, 10)}
              </button>
            ))}
          </div>

          <div className="selector-fecha-atajos">
            <button type="button" className="filter-chip" onClick={() => elegir(hoy)}>Hoy</button>
            <button type="button" className="filter-chip" onClick={() => elegir(sumarDias(hoy, 1))}>Mañana</button>
            <button type="button" className="filter-chip" onClick={() => elegir(sumarDias(hoy, 7))}>En una semana</button>
            {valor && (
              <button type="button" className="filter-chip" onClick={() => elegir(null)} style={{ marginLeft: "auto" }}>
                Quitar
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
