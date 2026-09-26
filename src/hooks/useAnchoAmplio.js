import { useEffect, useState } from "react";

/**
 * ¿La pantalla mide al menos `minimo` px de ancho? Se vuelve a pintar al
 * cruzar el umbral. Lo usan el asistente (se acopla desde 1280) y el
 * panel de una publicación (dos columnas desde 1024).
 */
export function useAnchoAmplio(minimo = 1280) {
  const consulta = `(min-width: ${minimo}px)`;
  const [amplio, setAmplio] = useState(() => window.matchMedia?.(consulta).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(consulta);
    if (!mq) return;
    const alCambiar = () => setAmplio(mq.matches);
    alCambiar();
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [consulta]);
  return amplio;
}
