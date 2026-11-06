// ============================================================
// La imagen como saldrá en su red (el ajuste del lienzo, recordado)
//
// Lo que ya cabe en su objetivo («feed», «historia») es el ORIGINAL tal cual;
// lo que no, el MISMO ajuste que se hará al programar (`vistaAjuste`, el lienzo
// de lib/medios.js). Lo usan la vista previa de cada red (vistaRed.jsx) y la
// cuadrícula de «Ver el mes como se verá» (VistaMes.jsx). Vive aparte para que
// ese archivo sólo exporte su componente.
// ============================================================

import { useEffect, useState } from "react";
import { vistaAjuste } from "../lib/medios";

// Lo ya dibujado, por imagen, objetivo y ajuste: cambiar de pestaña no
// vuelve a pasar por el lienzo.
const dibujadas = new Map();

/**
 * La imagen como saldrá en su objetivo («feed», «historia»): el original si ya cabe, o el ajuste dibujado (recordado).
 * Sin objetivo, el original.
 */
export function useAjustada(src, objetivo, modo, color) {
  const clave = `${src}|${objetivo}|${modo}|${color}`;
  const [vista, setVista] = useState(() => dibujadas.get(clave) ?? null);
  useEffect(() => {
    if (!src || !objetivo) return undefined;
    if (dibujadas.has(clave)) { setVista(dibujadas.get(clave)); return undefined; }
    let vivo = true;
    setVista(null);
    vistaAjuste(src, objetivo, modo, color)
      .then((v) => { dibujadas.set(clave, v); if (vivo) setVista(v); })
      .catch(() => { if (vivo) setVista(src); });
    return () => { vivo = false; };
  }, [clave, src, objetivo, modo, color]);
  return objetivo ? vista : src;
}
