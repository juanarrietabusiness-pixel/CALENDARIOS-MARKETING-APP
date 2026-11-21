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
  /**
   * Silencios relativos a la VOZ, no un umbral fijo: lo que está por debajo de (voz + umbralDb) más de `minimo` s se deja
   * en `queda` s, medido sobre la voz LIMPIA (con el ruido de la obra debajo, el audio crudo no deja ver los silencios).
   * Un corte que QUITA menos de `quitarMinimo` s no se hace: no se oye como silencio y sí se ve como salto (cada corte
   * cambia la cámara). Al rehacer el corte de Rofer v2 con el kit (2026-11-21) salió igual que v2 salvo un corte de 0,06 s;
   * el más pequeño de v2 quitó 0,08 s.
   */
  silencio: Object.freeze({ umbralDb: -18, minimo: 0.16, queda: 0.1, quitarMinimo: 0.07, fundidoMs: 5 }),
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
   * de la voz). La primera versión la tenía 19 dB por debajo y «ni se escuchaba». `normalizar`: la canción se lleva
   * primero a −14 dB RMS; las demás son la GANANCIA que se le aplica encima (bajo la voz, en el llamado, en los huecos sin
   * voz y en el cierre). `apartar`: cuánto se aparta (×) un instante en los golpes grandes.
   */
  musica: Object.freeze({ normalizar: -14, bajoVoz: -18, debajoDeLaVoz: Object.freeze([9, 10]), llamado: -15, libre: -13, cierre: -6, apartar: 0.6 }),
  /** El ducking: cuánto antes de la voz empieza a bajar (de la auditoría), cuánto tarda en bajar y en volver (de Rofer), y
   *  desde qué nivel de la voz (dB RMS en ventanas de 50 ms) cuenta como que habla. */
  ducking: Object.freeze({ anticipacion: 0.15, ataque: 0.03, liberacion: 0.4, umbralVoz: -46 }),
  /** La cadena de la voz: el nivel común de habla de todos los clips (dB, mediana de las ventanas con voz), la limpieza y
   *  el bus (compresión suave y de-esser), con los valores de voz.py de Rofer v2. */
  voz: Object.freeze({
    pasoAltoHz: 80, ruidoMezcla: 0.85, nivel: -16, fundido: 0.012,
    compresor: Object.freeze({ umbral: -24, razon: 2.5, ataqueMs: 6, liberacionMs: 140, ganancia: 2 }), deesser: 0.35,
  }),
  /**
   * El máster, medido DESPUÉS de codificar a AAC. El AAC sube el pico verdadero (en Rofer, de −1,2 a −1,0 dBTP), así que
   * la mezcla apunta `margenAac` dB más abajo para que el archivo final quede por debajo del tope.
   */
  master: Object.freeze({ lufs: -14, picoDbtp: -1.2, margenAac: 0.5, lra: 9 }),
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
