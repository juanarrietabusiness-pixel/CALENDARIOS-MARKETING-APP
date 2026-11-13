// ============================================================
// El INTERRUPTOR de la aplicación: para lo que se enciende, se QUEDA y surte efecto al momento (la bandeja de un
// cliente, las historias automáticas, «Programar al aprobar», crear sin preguntar…). Lo que se escoge de una lista o
// es una opción de un formulario que se confirma con un botón sigue siendo una casilla.
//
// Antes estaba copiado a mano en siete sitios (`.toggle`), y el riel apagado era `--border`: ~1,3 : 1 contra el fondo,
// así que apagado se veía sólo una bolita suelta. Ahora:
//   · apagado = riel con BORDE del color del texto secundario y la bolita del mismo color (más de 3 : 1); encendido =
//     el riel lleno de acento y la bolita blanca;
//   · dice «Sí» / «No» al lado: el estado no depende sólo del color;
//   · desactivado se VE desactivado (opacidad, sin mano) y la fila puede decir por qué (`motivo`);
//   · la zona que se toca mide `--tap` de alto aunque el riel mida 24 px;
//   · en una fila, la etiqueta es un <label> del botón: tocar el texto también lo cambia.
// El estado lo anuncia `aria-checked` (role="switch"); el «Sí / No» va con aria-hidden para no decirlo dos veces.
// ============================================================

import { useId } from "react";

/** Sólo el control. `etiquetadoPor` (id) o `ariaLabel` le dan nombre; `descritoPor`, la descripción. */
export function Interruptor({
  id, encendido, onCambiar, disabled = false, etiquetadoPor, ariaLabel, descritoPor, titulo, textos = ["No", "Sí"],
}) {
  const on = Boolean(encendido);
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={etiquetadoPor}
      aria-label={etiquetadoPor ? undefined : ariaLabel}
      aria-describedby={descritoPor || undefined}
      className="interruptor"
      disabled={disabled}
      title={titulo}
      onClick={() => onCambiar?.(!on)}
    >
      <span className="interruptor-riel" aria-hidden="true"><span className="interruptor-bolita" /></span>
      <span className="interruptor-estado" aria-hidden="true">{on ? textos[1] : textos[0]}</span>
    </button>
  );
}

/**
 * Una fila con su etiqueta, su descripción y el interruptor a la derecha. `motivo` se enseña sólo desactivado (por qué
 * no se puede tocar). `children` va debajo de la descripción (avisos, errores).
 */
export default function FilaInterruptor({
  etiqueta, descripcion, motivo, encendido, onCambiar, disabled = false, titulo, textos, className = "", children,
}) {
  const id = useId();
  const conMotivo = disabled && motivo;
  const descritoPor = [descripcion ? `${id}-d` : "", conMotivo ? `${id}-m` : ""].filter(Boolean).join(" ");
  return (
    <div className={`interruptor-fila${className ? ` ${className}` : ""}`}>
      <div className="interruptor-texto">
        <label htmlFor={id} className="interruptor-etiqueta" data-desactivado={disabled || undefined}>{etiqueta}</label>
        {descripcion && <p id={`${id}-d`} className="hint" style={{ margin: 0 }}>{descripcion}</p>}
        {conMotivo && <p id={`${id}-m`} className="hint interruptor-motivo" style={{ margin: 0 }}>{motivo}</p>}
        {children}
      </div>
      <Interruptor
        id={id} encendido={encendido} onCambiar={onCambiar} disabled={disabled} descritoPor={descritoPor}
        titulo={titulo} textos={textos}
      />
    </div>
  );
}
