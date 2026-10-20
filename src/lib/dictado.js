// ============================================================
// El dictado del asistente: escucha hasta que se vuelve a pulsar
//
// Antes estaba en `continuous: false` y sin resultados provisionales: el
// navegador cortaba en la primera pausa (3–4 segundos) y no se veía nada
// hasta el final. Ahora:
//
//   · `continuous` e `interimResults`: el texto aparece mientras se habla
//     (provisional, en gris) y se FIJA al cerrar cada frase.
//   · Si el navegador corta solo —Chrome lo hace tras un silencio o pasado
//     un rato, Safari más a menudo—, se vuelve a encender mientras la
//     persona no haya pulsado parar. Con un tope: si se corta enseguida una
//     y otra vez (sin permiso, sin servicio), para y lo dice en vez de
//     quedarse en un bucle.
//   · Cada frase final se entrega UNA vez. Una sesión nueva empieza con su
//     lista de resultados vacía, así que al reencenderse no se repite nada.
//
// `SR` (el SpeechRecognition del navegador) se inyecta para poder probarlo.
// ============================================================

/** Cuántos reencendidos seguidos sin oír nada se toleran antes de parar. */
export const MAX_REENCENDIDOS_VACIOS = 5;
/** Una sesión que dura menos que esto sin dar ningún resultado cuenta como «se cortó enseguida». */
export const SESION_CORTA_MS = 1500;

const ERRORES = {
  "not-allowed": "Permiso de micrófono denegado. Actívalo en los ajustes del navegador.",
  "service-not-allowed": "El navegador no permite el dictado en esta página.",
  "audio-capture": "No se encontró micrófono. Conecta uno e intenta de nuevo.",
  "network": "Error de red al procesar la voz. Revisa tu conexión.",
  "language-not-supported": "El navegador no tiene dictado en español.",
};

/**
 * Junta lo dictado con lo que ya hay en la caja: un espacio entre medias, nunca dos, y nada si no hay nada que
 * añadir. Pura.
 */
export function unirDictado(actual, nuevo) {
  const n = String(nuevo ?? "").replace(/\s+/g, " ").trim();
  const a = String(actual ?? "");
  if (!n) return a;
  if (!a.trim()) return n;
  return /\s$/.test(a) ? a + n : `${a} ${n}`;
}

/**
 * Lo nuevo de un evento `result`: las frases que se cerraron (cada una una vez) y lo provisional, que se reemplaza
 * entero en cada evento. `vistos` es el conjunto de índices finales ya entregados en ESTA sesión. Pura (salvo que
 * apunta en `vistos`).
 */
export function leerResultados(resultados, desde, vistos) {
  const finales = [];
  let provisional = "";
  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i];
    const texto = r?.[0]?.transcript ?? "";
    if (r?.isFinal) {
      if (i >= desde && !vistos.has(i)) {
        vistos.add(i);
        finales.push(texto);
      }
    } else {
      provisional += texto;
    }
  }
  return { final: finales.join(" ").replace(/\s+/g, " ").trim(), provisional: provisional.replace(/\s+/g, " ").trim() };
}

/**
 * El dictado. `alFinal(texto)` recibe cada frase que se cierra; `alProvisional(texto)` lo que se está diciendo (vacío
 * al cerrarse); `alEstado(escuchando)`, cuándo empieza y cuándo para de verdad; `alError(mensaje)`, por qué paró.
 * → { empezar(), parar(), cortar(), get escuchando }.
 */
export function crearDictado({ SR, lang = "es-PA", alFinal, alProvisional = () => {}, alEstado = () => {}, alError = () => {}, ahora = () => Date.now() }) {
  let activo = false;
  let rec = null;
  let vacios = 0;

  /**
   * Para. Con `soltar`, lo que llegue después de esta sesión se ignora (al enviar: lo provisional ya va en el
   * mensaje, y una frase tardía aparecería sola en la caja vacía). Sin él, la última frase que se estaba diciendo al
   * pulsar parar todavía entra cuando el navegador la cierra.
   */
  const terminar = (mensaje = "", { soltar = true } = {}) => {
    const estaba = activo;
    activo = false;
    if (rec) {
      const r = rec;
      if (soltar) rec = null;
      try { r.stop(); } catch { /* ya parado */ }
    }
    if (soltar) alProvisional("");
    if (estaba) alEstado(false);
    if (mensaje) alError(mensaje);
  };

  const sesion = () => {
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    const vistos = new Set();
    const inicio = ahora();
    let oyo = false;

    r.onresult = (e) => {
      if (rec !== r) return;
      const { final, provisional } = leerResultados(e.results ?? [], e.resultIndex ?? 0, vistos);
      if (final) { oyo = true; vacios = 0; alFinal(final); }
      if (provisional) oyo = true;
      alProvisional(provisional);
    };
    r.onerror = (ev) => {
      if (rec !== r) return;
      // Sin voz o cortado por el propio navegador: no es un error de la persona; `onend` lo vuelve a encender.
      if (ev?.error === "no-speech" || ev?.error === "aborted") return;
      terminar(ERRORES[ev?.error] ?? `Error de dictado: ${ev?.error || "desconocido"}.`);
    };
    r.onend = () => {
      if (rec !== r) return;
      alProvisional("");
      if (!activo) { rec = null; return; }
      // Se cortó solo: se vuelve a encender, salvo que lleve varias veces cortándose enseguida sin oír nada.
      vacios = !oyo && ahora() - inicio < SESION_CORTA_MS ? vacios + 1 : 0;
      if (vacios >= MAX_REENCENDIDOS_VACIOS) {
        terminar("El dictado se detuvo: el navegador lo cortaba una y otra vez. Pulsa el micrófono para intentarlo de nuevo.");
        return;
      }
      sesion();
    };

    rec = r;
    try {
      r.start();
    } catch {
      terminar("No se pudo iniciar el dictado.");
    }
  };

  return {
    empezar() {
      if (activo) return;
      activo = true;
      vacios = 0;
      alEstado(true);
      sesion();
    },
    /** La persona pulsó parar: la frase que estaba diciendo todavía entra. */
    parar() { terminar("", { soltar: false }); },
    /** Al enviar: para y no deja entrar nada más (lo provisional ya lo juntó quien envía). */
    cortar() { terminar(); },
    get escuchando() { return activo; },
  };
}
