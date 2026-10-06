import { useState } from "react";

// ¿Toca el repaso de la mañana (RepasoAtrasadas)? Una vez al día por
// persona y navegador; «Listo por hoy» lo cierra hasta mañana.

const clave = (yoId) => `repaso-tareas:${yoId ?? "yo"}`;

function leer(yoId) {
  try { return localStorage.getItem(clave(yoId)); } catch { return null; }
}

export function useRepaso(yoId, hoy) {
  const [visto, setVisto] = useState(() => leer(yoId) === hoy);
  const cerrar = () => {
    try { localStorage.setItem(clave(yoId), hoy); } catch { /* sin almacenamiento: se cierra sólo en esta vista */ }
    setVisto(true);
  };
  return { pendiente: !visto, cerrar };
}
