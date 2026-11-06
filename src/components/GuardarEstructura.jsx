import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import FormulasUgc from "./calendario/FormulasUgc";
import { proponerFormula } from "../lib/formulasUgcApi";
import { tramosDeEscenas, tramosDeReel, limpiarGuionVoz } from "../lib/formulasUgc";
import { lineaDeTiempo } from "../lib/videoEscenas";

// ============================================================
// «Guardar como estructura» desde una VOZ EN OFF que salió bien (lazy)
//
// Del guion de un video animado (escenas, con sus tiempos: los de la voz si
// ya la tiene) o de un reel por planos, los tramos con lo que dice cada uno
// (lib/formulasUgc.js: `tramosDeEscenas`, `tramosDeReel`). La IA ABSTRAE su
// estructura —la forma, sin el contenido— (`POST /api/formulas-ugc/proponer`
// con `voz`, texto: unos céntimos) y se abre en el editor de las estructuras
// de la agencia con «Voz en off» marcado. Nada se guarda hasta «Guardar».
// Se monta al pulsar el botón y pide en ese momento, UNA vez (StrictMode
// monta dos veces en desarrollo: la guarda es una ref, no el efecto).
// ============================================================

/**
 * @param guion     el guion de escenas de un video animado (o null)
 * @param palabras  los tiempos de la voz, si ya la tiene (o null: se estiman)
 * @param reel      el guion de un reel por planos (en lugar de `guion`)
 */
export default function GuardarEstructura({ client, guion = null, palabras = null, reel = null, onCerrar, onAviso }) {
  const [propuesta, setPropuesta] = useState(null);
  const [error, setError] = useState("");
  const pedido = useRef(false);

  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    const tramos = reel ? tramosDeReel(reel) : tramosDeEscenas(guion, guion?.escenas?.length ? lineaDeTiempo(guion, palabras) : null);
    const voz = limpiarGuionVoz({
      titulo: reel?.titulo ?? guion?.titulo ?? "",
      duracion: reel?.segundos ?? (tramos.length ? Math.max(...tramos.map((t) => t.hasta ?? 0)) : 0),
      tramos,
    });
    if (!voz) { setError("Hace falta un guion con voz en al menos dos escenas para sacar su estructura."); return; }
    proponerFormula({ voz, clienteId: client?.dbId || client?.id || null })
      .then((r) => setPropuesta(r.formula))
      .catch((e) => setError(`No se pudo sacar la estructura: ${e.message}`));
  }, [client, guion, palabras, reel]);

  if (propuesta) {
    return (
      <FormulasUgc inicial={propuesta} uso="voz" onCerrar={onCerrar}
        onGuardada={(f) => { onAviso?.(`Estructura «${f.nombre}» guardada: ya se puede escoger al escribir una voz en off, con cualquier cliente.`); onCerrar(); }} />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
      {error
        ? <p role="alert" className="va-msg va-error">{error}</p>
        : <p role="status" className="hint">La IA está sacando la estructura de este guion (la forma, sin su contenido)…</p>}
      {error && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={onCerrar}>
          <Icon name="close" size={14} /> Cerrar
        </button>
      )}
    </div>
  );
}
