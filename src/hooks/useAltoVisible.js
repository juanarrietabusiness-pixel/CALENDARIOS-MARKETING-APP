// ============================================================
// Lo que de verdad se ve de la pantalla (con el teclado abierto)
//
// En el teléfono el teclado no encoge `window.innerHeight` ni lo que mide
// un `position: fixed; inset: 0`: el asistente seguía midiendo la pantalla
// entera, la caja de escribir crecía contra ese alto y el botón de enviar
// quedaba DEBAJO del teclado, sin forma de pulsarlo al terminar de escribir.
// `visualViewport` sí lo descuenta: alto y desplazamiento de lo visible.
// Sin `visualViewport` (navegadores viejos) vale `innerHeight`.
// ============================================================

import { useEffect, useState } from "react";

const leer = () => {
  if (typeof window === "undefined") return { alto: 0, arriba: 0 };
  const v = window.visualViewport;
  return v ? { alto: Math.round(v.height), arriba: Math.round(v.offsetTop) } : { alto: window.innerHeight, arriba: 0 };
};

export function useAltoVisible(activo = true) {
  const [medida, setMedida] = useState(leer);
  useEffect(() => {
    if (!activo || typeof window === "undefined") return undefined;
    const v = window.visualViewport;
    const alCambiar = () => setMedida((m) => {
      const n = leer();
      return n.alto === m.alto && n.arriba === m.arriba ? m : n;
    });
    alCambiar();
    v?.addEventListener("resize", alCambiar);
    v?.addEventListener("scroll", alCambiar);
    window.addEventListener("resize", alCambiar);
    return () => {
      v?.removeEventListener("resize", alCambiar);
      v?.removeEventListener("scroll", alCambiar);
      window.removeEventListener("resize", alCambiar);
    };
  }, [activo]);
  return medida;
}
