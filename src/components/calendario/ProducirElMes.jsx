import { useId } from "react";
import Icon from "../Icon";
import { useDialogA11y } from "../../hooks/useDialogA11y";

// ============================================================
// «Producir el mes»: el botón grande del calendario
//
// Antes era «Generar contenido», que sólo escribía los textos que faltaban de
// lo que ya había. Ahora pregunta qué se quiere producir:
//
//   · Crear lo que falta: el Estudio → Producir en lote → «Mes completo» con
//     ESTE mes, que salta los días que ya tienen publicación (la idea, el texto
//     y la pieza de cada día, con el ritmo del cliente y su matriz).
//   · Diseñar las que ya hay: «Producir el mes con IA» de siempre (la pieza de
//     cada publicación que no tiene contenido).
//
// Completar sólo los textos sigue en el menú «⋯».
// ============================================================

// Cada opción es una tarjeta pulsable: icono a la izquierda, título y explicación (sin CSS propio: va en su chunk).
const OPCION = { display: "flex", alignItems: "flex-start", gap: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)", boxSizing: "border-box", textAlign: "left", width: "100%", minHeight: "var(--tap)", cursor: "pointer", color: "inherit", font: "inherit" };
const TEXTOS = { display: "flex", flexDirection: "column", gap: "var(--sp-1)" };

export default function ProducirElMes({ mesNombre, publicaciones = 0, pasado = false, onCrear, onDisenar, onClose }) {
  const ids = useId();
  const ref = useDialogA11y(onClose);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} style={{ width: "min(560px, 100%)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--sp-3)" }}>
          <h3 id={`${ids}-t`} style={{ margin: 0 }}>Producir {mesNombre}</h3>
          <button type="button" className="btn-icon" aria-label="Cerrar" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <button type="button" className="card" style={OPCION} onClick={onCrear} disabled={pasado}>
          <Icon name="sparkles" size={22} />
          <span style={TEXTOS}>
            <strong>Crear lo que falta</strong>
            <span className="hint">
              {pasado
                ? "Este mes ya pasó: el lote produce desde hoy en adelante."
                : `Abre «Producir en lote» del Estudio en el mes completo: una pieza por día con el ritmo del cliente (idea, texto e imagen).${publicaciones ? " Los días que ya tienen publicación se saltan." : ""}`}
            </span>
          </span>
        </button>
        <button type="button" className="card" style={OPCION} onClick={onDisenar} disabled={!publicaciones}>
          <Icon name="imageAi" size={22} />
          <span style={TEXTOS}>
            <strong>Diseñar las que ya hay{publicaciones ? ` (${publicaciones})` : ""}</strong>
            <span className="hint">
              {publicaciones
                ? "Crea con IA la pieza de las publicaciones de este mes que todavía no tienen contenido, por semanas y días."
                : "Este mes todavía no tiene publicaciones."}
            </span>
          </span>
        </button>
        <p className="hint" style={{ margin: 0 }}>Para escribir sólo los textos que faltan (ideas, guiones y descripciones): menú «⋯» → «Completar los textos que faltan».</p>
      </div>
    </div>
  );
}
