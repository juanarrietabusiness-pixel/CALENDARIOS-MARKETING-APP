import { useState } from "react";
import Icon from "./Icon";
import { guardarRegla } from "../lib/estudio";

/**
 * «Guardar como regla», junto a cada corrección: lo que hubo que corregir una vez («el texto más pequeño», «el logo
 * abajo a la derecha») pasa a las reglas del kit y va solo en todas las piezas siguientes. Se guarda en el servidor
 * sobre el kit guardado (POST …/kit/reglas), así no pisa lo que otra persona cambió.
 */
export default function GuardarRegla({ clienteId, texto, onGuardada }) {
  const [estado, setEstado] = useState(""); // "" | guardando | error
  const [guardada, setGuardada] = useState("");
  const [error, setError] = useState("");
  const regla = String(texto ?? "").trim();
  if (!regla) return null;
  const guardar = async () => {
    setEstado("guardando");
    setError("");
    try {
      const { kit } = await guardarRegla(clienteId, regla);
      setEstado("");
      setGuardada(regla);
      onGuardada?.(kit);
    } catch (e) {
      setEstado("error");
      setError(e.message);
    }
  };
  if (guardada === regla) return <span className="hint" role="status"><Icon name="check" size={13} /> Guardada en el kit: va en todas las piezas.</span>;
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" disabled={estado === "guardando"} onClick={guardar}
        title="Que valga para todas las piezas de este cliente, no sólo para ésta">
        <Icon name="bookmark" size={14} /> {estado === "guardando" ? "Guardando…" : "Guardar como regla"}
      </button>
      {error && <span role="alert" className="cerebro-error">{error}</span>}
    </>
  );
}
