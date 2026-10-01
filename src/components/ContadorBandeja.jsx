import { useState, useEffect } from "react";
import { pendientesBandeja } from "../lib/bandeja";
import { totalPendientes } from "../lib/bandejaVista";

// ============================================================
// El número sobre «Bandeja»
//
// Comentarios sin atender y conversaciones sin atender, sólo de los
// clientes con la bandeja encendida. Relee con cada `pulso`: el webhook
// avisa al espacio cuando guarda algo.
// ============================================================

export default function ContadorBandeja({ pulso = 0 }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let vivo = true;
    pendientesBandeja()
      .then((p) => { if (vivo) setN(totalPendientes(p)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pulso]);

  if (!n) return null;
  return (
    <>
      <span className="contador-atrasadas" aria-hidden="true">{n > 99 ? "99+" : n}</span>
      <span className="sr-only">, {n} sin atender</span>
    </>
  );
}
