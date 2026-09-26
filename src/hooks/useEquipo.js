import { useEffect, useState } from "react";
import { cargarEquipo } from "../lib/equipo";

// ============================================================
// Los miembros del espacio: para «Lo lleva», las @menciones, la carga…
//
// Se guarda en el módulo: lo piden a la vez el panel, la rejilla y la
// campana, y no hace falta preguntarlo tres veces. Se relee con el
// `pulso` (entra alguien, se cambia el nombre), como mucho cada 30 s.
// ============================================================

let cache = null;
let leidoEn = 0;
let enCurso = null;

function leer() {
  if (enCurso) return enCurso;
  enCurso = cargarEquipo()
    .then((r) => { cache = r?.miembros ?? []; leidoEn = Date.now(); return cache; })
    .finally(() => { enCurso = null; });
  return enCurso;
}

export function useEquipo(pulso = 0) {
  const [miembros, setMiembros] = useState(cache ?? []);
  useEffect(() => {
    let vivo = true;
    if (cache && Date.now() - leidoEn < 30_000) { setMiembros(cache); return undefined; }
    leer().then((m) => { if (vivo) setMiembros(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [pulso]);
  return miembros;
}

/** El miembro con ese id, o null. */
export const miembroDe = (miembros, id) => (id ? miembros.find((m) => m.userId === id) ?? null : null);
