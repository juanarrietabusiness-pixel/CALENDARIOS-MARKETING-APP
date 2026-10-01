import { useEffect, useId, useState } from "react";
import { estadoBandeja, cambiarBandeja } from "../lib/bandeja";

// ============================================================
// El interruptor de la bandeja de un cliente
//
// Vive en dos sitios —la ficha del cliente y la propia Bandeja— y es el
// MISMO componente, para que digan lo mismo. Guarda al pulsarlo (no con
// «Guardar cambios» de la ficha): encenderlo suscribe la página en Meta,
// que es algo que pasa fuera de la ficha.
//
// Apagado, el Worker no lee ni guarda nada de ese cliente. Sin cuentas de
// Meta asignadas no se puede encender, y lo dice.
//
// `estado` (opcional) es lo que ya leyó quien lo pinta —la Bandeja trae
// todos los clientes de una vez—; sin él, lo pide.
// ============================================================

const nombresCuentas = (cuentas = []) => cuentas.map((c) => c.nombre).filter(Boolean).join(" y ");

export default function InterruptorBandeja({ clientId, estado, nombreCliente = "", onCambio }) {
  const ids = useId();
  const [propio, setPropio] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState("");

  useEffect(() => {
    if (estado !== undefined || !clientId) return undefined;
    let vivo = true;
    estadoBandeja()
      .then((r) => { if (vivo) setPropio(r.clientes.find((c) => c.clientId === clientId) ?? { clientId, activa: false, cuentas: [] }); })
      .catch((e) => { if (vivo) setFallo(e.message); });
    return () => { vivo = false; };
  }, [clientId, estado]);

  if (!clientId) return null;
  const info = estado ?? propio;
  const cuentas = info?.cuentas ?? [];
  const activa = Boolean(info?.activa);
  const errores = info?.suscripcion?.errores ?? [];

  const cambiar = async () => {
    setOcupado(true);
    setFallo("");
    try {
      const r = await cambiarBandeja(clientId, !activa);
      setPropio(r);
      onCambio?.(r);
    } catch (e) {
      setFallo(e.message);
    }
    setOcupado(false);
  };

  return (
    <div className="interruptor-fila" style={{ flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <span id={`${ids}-t`} style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>
          Bandeja de comentarios y mensajes{nombreCliente ? ` · ${nombreCliente}` : ""}
        </span>
        <p id={`${ids}-d`} className="hint" style={{ margin: 0 }}>
          {!info
            ? "Comprobando…"
            : !cuentas.length
              ? "Asigna su página de Facebook o su Instagram en Ajustes → Integraciones para poder encenderla."
              : activa
                ? `Llegan a la Bandeja los comentarios y mensajes de ${nombresCuentas(cuentas)}. Apagada, no se lee ni se guarda nada de este cliente.`
                : `Apagada: no se lee ni se guarda nada de ${nombresCuentas(cuentas)}.`}
        </p>
        {activa && errores.length > 0 && (
          <p className="hint" style={{ margin: "var(--sp-1) 0 0", color: "var(--accent-alt)" }}>
            Meta no aceptó los avisos al momento ({errores.join(" · ")}). Mientras tanto, usa «Actualizar» en la Bandeja.
          </p>
        )}
        {fallo && <p role="alert" className="notice notice-error" style={{ margin: "var(--sp-2) 0 0" }}>{fallo}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-labelledby={`${ids}-t`}
        aria-describedby={`${ids}-d`}
        aria-checked={activa}
        disabled={!info || ocupado || (!cuentas.length && !activa)}
        className={`toggle${activa ? " is-on" : ""}`}
        onClick={cambiar}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}
