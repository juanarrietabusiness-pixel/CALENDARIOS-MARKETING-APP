import { useState, useEffect, useCallback } from "react";
import Icon from "./Icon";
import * as db from "../lib/db";
import { formatoUSD } from "../lib/configIA";
import { navegar } from "../lib/rutas";

// ============================================================
// El gasto de la IA, siempre a la vista
//
// El saldo de Anthropic se acabó sin que nadie lo viera venir: el
// contador existía, pero al fondo de Equipo. Esto lo pone en la cabecera
// de todas las pantallas —gastado contra presupuesto, en ámbar desde el
// 80 % y en rojo al llegar— y lleva a Ajustes al pulsarlo.
//
// Se relee con cada `pulso`, al volver a la pestaña y cuando una llamada
// de IA termina (el evento `ia:gasto`, que lanza src/api.js).
// ============================================================

export const EVENTO_GASTO = "ia:gasto";

export default function MedidorIA({ pulso = 0, compacto = false }) {
  const [gasto, setGasto] = useState(null);

  const cargar = useCallback(() => {
    db.loadGastoIA().then(setGasto).catch(() => {});
  }, []);

  useEffect(() => { cargar(); }, [cargar, pulso]);

  useEffect(() => {
    // Un poco después de terminar: el apunte se escribe al cerrar la
    // respuesta, y pedirlo en el mismo instante lo perdería.
    let t;
    const tras = () => { clearTimeout(t); t = setTimeout(cargar, 1500); };
    const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
    window.addEventListener(EVENTO_GASTO, tras);
    document.addEventListener("visibilitychange", alVolver);
    const cada = setInterval(cargar, 5 * 60_000);
    return () => {
      clearTimeout(t);
      clearInterval(cada);
      window.removeEventListener(EVENTO_GASTO, tras);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar]);

  if (!gasto) return null;

  const { total = 0, presupuesto = 0, estado = "libre", porcentaje = 0 } = gasto;
  const conTope = estado !== "libre";
  const texto = conTope
    ? `${formatoUSD(total)} de ${formatoUSD(presupuesto)}`
    : formatoUSD(total);
  const descripcion = conTope
    ? `Gasto de IA este mes: ${formatoUSD(total)} de ${formatoUSD(presupuesto)} (${Math.round(porcentaje)} %)` +
      (estado === "agotado" ? ". Presupuesto alcanzado" : estado === "aviso" ? ". Cerca del presupuesto" : "")
    : `Gasto de IA este mes: ${formatoUSD(total)}, sin presupuesto`;

  return (
    <button
      type="button"
      className="medidor-ia"
      data-estado={estado}
      onClick={() => navegar("/ajustes")}
      aria-label={`${descripcion}. Abrir ajustes de la IA`}
      title={descripcion}
    >
      <Icon name="sparkles" size={16} />
      {!compacto && <span className="medidor-ia-texto">{texto}</span>}
      {conTope && (
        <span className="medidor-ia-barra" aria-hidden="true">
          <span style={{ width: `${Math.min(porcentaje, 100)}%` }} />
        </span>
      )}
    </button>
  );
}
