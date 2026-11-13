import { useState, useEffect, useId } from "react";
import Icon from "./Icon";
import { limpiarSinPreguntar, TOPE_SIN_PREGUNTAR, TOPE_MAXIMO_SIN_PREGUNTAR, textoTope } from "../lib/sinPreguntar";
import { olvidarTope } from "../lib/sinPreguntarApi";
import FilaInterruptor from "./Interruptor";

// ============================================================
// Ajustes → IA → «Crear imágenes sin preguntar»
//
// Apagado (como siempre): toda imagen desde 0,50 $ pide un segundo «sí». Encendido con un TOPE por pedido: una imagen
// con el modelo de cada cliente que no pase del tope se crea directo, en el chat, por Claude (MCP) y en el panel. La
// regla está en src/lib/sinPreguntar.js y la aplica también el servidor. Lo cambia sólo el administrador, como el
// presupuesto; los demás lo ven.
// ============================================================

export default function SinPreguntarAjuste({ valor, esAdmin, guardando, onGuardar }) {
  const ids = useId();
  const tope = limpiarSinPreguntar(valor);
  const [borrador, setBorrador] = useState(String(tope || TOPE_SIN_PREGUNTAR));
  const [fallo, setFallo] = useState("");
  useEffect(() => { if (tope) setBorrador(String(tope)); }, [tope]);

  const guardar = async (encendido) => {
    setFallo("");
    let nuevo = null;
    if (encendido) {
      nuevo = limpiarSinPreguntar(borrador);
      if (!nuevo) { setFallo("Escribe el tope en dólares (más de 0)."); return; }
    }
    await onGuardar(nuevo);
    // La pantalla recuerda el ajuste un minuto (src/lib/sinPreguntarApi.js): que la próxima pregunta lo lea de nuevo.
    olvidarTope();
  };

  const nota = { fontSize: "var(--fs-3xs)", color: "var(--text-dim)", margin: 0 };
  return (
    <fieldset className="ia-funciones" aria-describedby={`${ids}-nota`}>
      <legend className="label">Crear imágenes sin preguntar</legend>
      <p id={`${ids}-nota`} style={nota}>
        Apagado, toda imagen desde 0,50 $ pide un segundo «sí». Encendido, una imagen con el modelo de cada cliente (el
        fijado en su kit o el predeterminado) que no pase del tope se crea directo: una pieza, una tanda del director, un
        carrusel, las historias, otra versión, corregir, recrear y el lote. Pregunta igual si pasa del tope o si el
        asistente sugiere otro motor. Video, voz y música preguntan siempre, y el presupuesto del mes sigue mandando.
      </p>
      <FilaInterruptor
        etiqueta={tope > 0 ? `Sin preguntar hasta ${textoTope(tope)} por pedido` : "Se pregunta desde 0,50 $"}
        encendido={tope > 0}
        disabled={!esAdmin || guardando}
        motivo={!esAdmin ? "Lo cambia quien administra el espacio." : "Guardando…"}
        onCambiar={(si) => void guardar(si)}
      />
      <form
        onSubmit={(e) => { e.preventDefault(); void guardar(true); }}
        style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <div className="field" style={{ flex: "0 1 200px", marginBottom: 0 }}>
          <label className="label" htmlFor={`${ids}-tope`}>Tope por pedido (US$)</label>
          <input
            id={`${ids}-tope`}
            className="input"
            type="number"
            inputMode="decimal"
            min="0.5"
            max={TOPE_MAXIMO_SIN_PREGUNTAR}
            step="0.5"
            value={borrador}
            disabled={!esAdmin || guardando}
            onChange={(e) => setBorrador(e.target.value)}
          />
        </div>
        {esAdmin && (
          <button className="btn btn-secondary" type="submit" disabled={guardando}>
            <Icon name="check" size={18} /> {tope > 0 ? "Guardar el tope" : "Encender con este tope"}
          </button>
        )}
      </form>
      {fallo && <p role="alert" className="notice notice-error" style={{ margin: 0 }}>{fallo}</p>}
    </fieldset>
  );
}
