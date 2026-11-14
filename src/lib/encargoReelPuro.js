// ============================================================
// El reel como encargo del servidor: lo que comparten la pantalla y el Worker (puro)
//
// El encargo lo lleva worker/lib/estudio/encargoReel.js. Aquí, los nombres de sus etapas y cómo la pantalla lee un
// encargo de reel: el storyboard (un fotograma por plano), el video o los clips y el montaje.
// ============================================================

/** Qué sale de los fotogramas: nada más (se revisa y se sigue), un video con todo, o un clip limpio por plano. */
export const SALIDAS_REEL = Object.freeze(["fotogramas", "uno", "clips"]);
/** Las fases del montaje en las que ya no queda nada que hacer solo (o espera a una persona). */
export const FIN_MONTAJE = Object.freeze(["hecho", "fallido", "confirmar", "espera"]);
/** Los planos que admite un reel (60 s en planos de 3 s). */
export const PLANOS_REEL_MAX = 20;

/** El archivo final de un paso (lo que la pantalla corrigió manda; si no, lo que salió). Pura. */
export const finalDePaso = (p) => (p?.fase === "hecho" ? (p.finales?.[0] ?? p.opciones?.[0]?.id ?? null) : null);

/**
 * Lo que la pantalla del reel enseña de un encargo: por plano, el fotograma (`{ archivo }`, `{ cargando }`,
 * `{ error }`) y el clip; el video; el montaje. `archivos`: Map id → archivo de la galería. Pura.
 */
export function resultadoDeReel(e, archivos = new Map()) {
  if (!e) return null;
  const r = e.reel ?? {};
  const fotos = (e.pasos ?? []).map((p) => {
    if (p.fase === "fallido") return { error: p.error || "El fotograma no salió." };
    if (p.fase !== "hecho") return { cargando: true };
    const a = archivos.get(finalDePaso(p));
    if (!a) return { error: "El fotograma se creó pero no aparece en la galería." };
    // «¿Listo para animar?» (lib/listoAnimar.js): el de SU ficha; uno corregido después no lo lleva.
    const animable = a.ajustes?.animable ?? (p.animable?.archivoId === a.id ? p.animable : null);
    return animable ? { archivo: a, animable } : { archivo: a };
  });
  const clips = (e.pasos ?? []).map((p) => {
    const c = p.clip;
    if (!c) return null;
    if (c.fase === "fallido") return { error: c.error || "El clip no salió." };
    if (c.fase !== "hecho") return { cargando: true };
    const a = archivos.get(c.archivoId);
    return a ? { archivo: a } : { error: "El clip se creó pero no aparece en la galería." };
  });
  const v = r.video ?? {};
  const video = v.archivoId ? archivos.get(v.archivoId) ?? null : null;
  return {
    fotos, clips, video,
    videoCargando: v.fase === "generando" || (v.fase === "nuevo" && e.estado === "en_marcha" && r.salida === "uno"),
    videoError: v.fase === "fallido" ? v.error || "El video no salió." : "",
    storyboardListo: (e.pasos ?? []).every((p) => p.fase === "hecho" || p.fase === "fallido"),
    esperaRevision: v.fase === "espera" && e.estado !== "en_marcha",
    montaje: r.montaje ?? null,
    enMarcha: e.estado === "en_marcha",
  };
}
