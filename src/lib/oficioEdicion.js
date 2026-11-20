// ============================================================
// Los NÚMEROS DEL OFICIO de editar un video grabado (puro): una sola fuente
//
// Salen de lo MEDIDO en los videos que la agencia aprobó (Rofer · reel de Alex v2, Comunidad v3), y la agencia decidió
// (2026-11-20, docs/propuesta-edicion-video-grabado.md §11) que mandan sobre los del plan de la auditoría
// (docs/auditoria-estudio-mcp.md §8), con UNA cosa de la auditoría: el ducking empieza ~150 ms ANTES de la voz.
//
// Quién los usa:
//   · el MANUAL DEL EDITOR (src/lib/manualEditor.js): su base en código se escribe con estos números, así que el texto
//     que lee Claude y el número que usa el kit no pueden decir cosas distintas;
//   · el KIT DE PIEZAS (Fase 2: el empaquetador copia este archivo al zip y genera de él un `oficio.json` para Python);
//   · el motor del video animado, cuando lleguen las Entregas 5 y 6 de la auditoría (ducking, LUFS, zonas, subtítulos):
//     que los importe de aquí en vez de escribir los suyos.
//
// Cambiar un número aquí cambia el manual de la casa (y su huella: la pantalla avisa a quien lo editó).
// ============================================================

export const OFICIO = Object.freeze({
  /** Silencios relativos a la VOZ, no un umbral fijo: lo que está por debajo de (voz + umbralDb) más de `minimo` s se deja en `queda` s. */
  silencio: Object.freeze({ umbralDb: -18, minimo: 0.16, queda: 0.1, fundidoMs: 5 }),
  /** Rescatar un clip flojo: el llamado sube, presencia, un poco más rápido sin cambiar el tono, la palabra susurrada realzada. */
  rescate: Object.freeze({ llamadoDb: 1, presenciaHz: 3000, presenciaDb: 3, atempo: 1.05, susurroDb: 11 }),
  /** La cámara virtual: alternar abierto y medio en cada corte, seguir la cabeza suavizado y sólo en parte. */
  camara: Object.freeze({ abierto: Object.freeze([1.12, 1.15]), medio: Object.freeze([1.45, 1.5]), seguir: 0.55, maxAcercar: 2 }),
  /** Franjas seguras del 9:16 (fracción del alto) para el editor: lo de arriba y lo de abajo que tapa la aplicación. */
  zonas: Object.freeze({ arriba: 0.14, abajo: 0.2 }),
  /** Subtítulos: grupos cortos, una línea. */
  subtitulos: Object.freeze({ maxPalabras: 4, lineas: 1 }),
  /**
   * La música, en dB RMS de la pista (en Rofer v2 la canción venía a −14 y bajo la voz quedó en −18: 9–10 dB por debajo
   * de la voz). La primera versión la tenía 19 dB por debajo y «ni se escuchaba».
   */
  musica: Object.freeze({ bajoVoz: -18, debajoDeLaVoz: Object.freeze([9, 10]), llamado: -15, cierre: -6 }),
  /** El ducking: cuánto antes de la voz empieza a bajar (de la auditoría), cuánto tarda en bajar y en volver (de Rofer). */
  ducking: Object.freeze({ anticipacion: 0.15, ataque: 0.03, liberacion: 0.4 }),
  /** La cadena de la voz. */
  voz: Object.freeze({ pasoAltoHz: 80, ruidoMezcla: 0.85 }),
  /** El máster, medido DESPUÉS de codificar a AAC. */
  master: Object.freeze({ lufs: -14, picoDbtp: -1.2 }),
  /** La hoja de contactos del video final: un cuadro cada tantos segundos. */
  hoja: Object.freeze({ cadaSegundos: 1.7 }),
  /** El cierre sin voz. */
  cierre: Object.freeze({ segundos: 3 }),
});

/** Un número con coma decimal, como se escribe en la interfaz («0,16»). Puro. */
export const coma = (n) => String(n).replace(".", ",");

/** «1,12–1,15». Puro. */
export const rango = ([a, b]) => `${coma(a)}–${coma(b)}`;

/** «−18»: el signo menos tipográfico, como el resto de la documentación. Puro. */
export const db = (n) => (n < 0 ? `−${coma(-n)}` : `+${coma(n)}`);
