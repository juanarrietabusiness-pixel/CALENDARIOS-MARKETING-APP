// ============================================================
// «Crear imágenes sin preguntar»: la regla (pura; la leen el Worker y la pantalla)
//
// Toda imagen desde CONFIRMAR_DESDE (0,50 $) pedía un segundo «sí»: el 409 `confirmar` del servidor, la tarjeta del
// plan del chat, el «¿Sigo?» del panel. La agencia pidió poder dejarlo FIJO (Ajustes → IA, sólo el administrador):
//
//   · Apagado (`tope` 0), como siempre: se pregunta desde 0,50 $.
//   · Encendido con un TOPE por pedido: una IMAGEN con el modelo del cliente (el fijado en su kit o, si no hay, el
//     predeterminado, y su relevo automático de proporción, que no es una elección) que no pase del tope se crea sin
//     preguntar. Por encima del tope, se pregunta como siempre.
//   · Si el asistente sugiere OTRO motor (el chat o Claude por MCP mandan un `modelo` distinto), con el ajuste
//     encendido SE PREGUNTA aunque sea barato, diciendo qué sugiere, en vez de qué y por qué: la persona fijó su motor.
//   · Video, voz y música no entran: siguen preguntando como siempre (cuestan más y no se pidió).
//   · El presupuesto del mes («detener») sigue mandando: eso se mira aparte, después.
//
// Aquí no se importa el catálogo (estudioCatalogo.js arrastra cientos de modelos): este archivo lo cargan pantallas que
// no lo necesitan. Al revés: el catálogo re-exporta CONFIRMAR_DESDE de aquí.
// ============================================================

/** Desde este costo un pedido pide una segunda confirmación (si no está fijado «sin preguntar»). */
export const CONFIRMAR_DESDE = 0.5;
/** El tope que se propone al encenderlo desde una pregunta, si el doble del pedido no llega a más. */
export const TOPE_SIN_PREGUNTAR = 3;
/** Lo más que admite el ajuste (la columna tiene el mismo CHECK). */
export const TOPE_MAXIMO_SIN_PREGUNTAR = 1000;
/** Dónde se cambia. */
export const DONDE_SE_CAMBIA = "Ajustes → IA";

/** El ajuste como llega (columna `sin_preguntar_usd`, o un texto de la pantalla) → el tope en US$ (0 = apagado). Pura. */
export function limpiarSinPreguntar(valor) {
  if (valor === null || valor === undefined || valor === "" || valor === false) return 0;
  const n = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(TOPE_MAXIMO_SIN_PREGUNTAR, Math.round(n * 100) / 100);
}

/**
 * El tope que propone «No volver a preguntar»: el doble de este pedido redondeado hacia arriba, o 3 $ si sale menos.
 * Pura.
 */
export function topeSugerido(costo = 0) {
  const doble = Math.ceil((Number(costo) || 0) * 2);
  return Math.min(TOPE_MAXIMO_SIN_PREGUNTAR, Math.max(TOPE_SIN_PREGUNTAR, doble));
}

/** «3 $», «2,50 $». Pura. */
export const textoTope = (tope) => `${(Number.isInteger(tope) ? String(tope) : Number(tope).toFixed(2).replace(".", ","))} $`;

/**
 * ¿Hay que preguntar antes de crear? → { preguntar, sinPreguntar, motivo }.
 *   · `tope`: el ajuste del espacio (0 = apagado).
 *   · `costo`: lo que cuesta el pedido entero (la tanda, el lote, las tres historias).
 *   · `tipo`: «imagen» (lo único que entra), «video», «voz» o «musica».
 *   · `otroMotor`: el asistente pidió un modelo que no es el del cliente.
 *   · `siempre`: el sitio que, sin el ajuste, pregunta por cualquier costo (la tarjeta del plan del chat, la primera
 *     llamada de `disenar_piezas` por MCP, el segundo toque de las historias).
 * `motivo`: «» (no hace falta preguntar), «costo» (pregunta como siempre, sin el ajuste), «tope» (pasa del tope),
 * «otro_motor», «no_imagen». `sinPreguntar`: true sólo cuando el AJUSTE es lo que evita la pregunta (para decirlo). Pura.
 */
export function decidirConfirmacion({ tope = 0, costo = 0, tipo = "imagen", otroMotor = false, siempre = false } = {}) {
  const t = limpiarSinPreguntar(tope);
  const c = Number(costo) || 0;
  const antes = siempre || c >= CONFIRMAR_DESDE; // lo de siempre: ¿se preguntaba?
  if (tipo !== "imagen") return { preguntar: antes, sinPreguntar: false, motivo: antes ? "no_imagen" : "" };
  if (!t) return { preguntar: antes, sinPreguntar: false, motivo: antes ? "costo" : "" };
  // Con el ajuste puesto, la persona fijó su motor: otro, aunque sea barato, se pregunta.
  if (otroMotor) return { preguntar: true, sinPreguntar: false, motivo: "otro_motor" };
  if (c > t) return { preguntar: true, sinPreguntar: false, motivo: "tope" };
  return { preguntar: false, sinPreguntar: antes, motivo: "" };
}

/** Atajo: ¿se pregunta? Pura. */
export const hayQuePreguntar = (opciones) => decidirConfirmacion(opciones).preguntar;

/** Lo que dice la respuesta cuando se creó gracias al ajuste. Pura. */
export const textoSinPreguntar = (tope) =>
  `Se creó sin preguntar: la agencia lo tiene fijado en ${DONDE_SE_CAMBIA} (imágenes con el modelo del cliente hasta ${textoTope(limpiarSinPreguntar(tope) || TOPE_SIN_PREGUNTAR)} por pedido).`;

/** Por qué se pregunta pese al ajuste, en una frase (vacía si no hace falta decirlo). Pura. */
export function textoDelMotivo({ motivo, tope = 0 } = {}) {
  if (motivo === "tope") return `Pasa del tope de ${textoTope(limpiarSinPreguntar(tope))} por pedido que la agencia fijó para crear sin preguntar.`;
  return "";
}

/**
 * «El asistente sugiere usar X en vez de Y (porque …)». `sugerido` y `fijo`: los NOMBRES de los modelos. Vacío si no
 * hay sugerencia. Pura.
 */
export function textoSugerencia({ sugerido = "", fijo = "", motivo = "" } = {}) {
  if (!sugerido || sugerido === fijo) return "";
  const porque = String(motivo ?? "").replace(/\s+/g, " ").trim().replace(/^porque\s+/i, "").replace(/[.\s]+$/, "").slice(0, 240);
  return `El asistente sugiere usar ${sugerido}${fijo ? ` en vez de ${fijo}` : ""}${porque ? ` (porque ${porque})` : ""}.`;
}

/** Lo que se le dice a quien no es administrador y marca «No volver a preguntar». Pura. */
export const textoSoloAdmin = `Crear sin preguntar lo enciende el administrador en ${DONDE_SE_CAMBIA}.`;

/** Lo que se dice al encenderlo desde una pregunta. Pura. */
export const textoEncendido = (tope) =>
  `Listo: desde ahora las imágenes con el modelo de cada cliente se crean sin preguntar hasta ${textoTope(tope)} por pedido (se cambia en ${DONDE_SE_CAMBIA}).`;
