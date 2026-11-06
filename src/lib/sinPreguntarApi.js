// ============================================================
// «Crear imágenes sin preguntar» desde el navegador: leer el ajuste y encenderlo
//
// La regla vive en src/lib/sinPreguntar.js (la misma que aplica el servidor). Aquí, lo que necesita la pantalla: el
// TOPE del espacio (de GET /api/ajustes, recordado un minuto: cada «¿Sigo?» no tiene por qué pedirlo otra vez) y
// encenderlo desde una pregunta («No volver a preguntar»), que sólo puede el administrador (el servidor da 403 a los
// demás; aquí no se ofrece).
// ============================================================

import { loadAjustes, saveAjustes } from "./db";
import { limpiarSinPreguntar, decidirConfirmacion, topeSugerido } from "./sinPreguntar";
import { esAdmin } from "./sesionActual";

const VIGENCIA_MS = 60_000;
let memo = null; // { tope, hasta }

/** El tope del espacio (0 = apagado). Si no se puede leer, 0: se pregunta como siempre. */
export async function topeDelEspacio() {
  if (memo && memo.hasta > Date.now()) return memo.tope;
  try {
    const a = await loadAjustes();
    memo = { tope: limpiarSinPreguntar(a?.sin_preguntar_usd), hasta: Date.now() + VIGENCIA_MS };
    return memo.tope;
  } catch {
    return 0;
  }
}

/** Que la próxima lectura vaya al servidor (lo cambió Ajustes o una pregunta). */
export function olvidarTope(tope = null) {
  memo = tope === null ? null : { tope: limpiarSinPreguntar(tope), hasta: Date.now() + VIGENCIA_MS };
}

/**
 * ¿Hay que preguntar este pedido? Lee el ajuste y aplica la regla. → { preguntar, sinPreguntar, motivo, tope }.
 * `opciones` como `decidirConfirmacion` (costo, tipo, otroMotor, siempre).
 */
export async function decidir(opciones = {}) {
  const tope = (opciones.tipo ?? "imagen") === "imagen" ? await topeDelEspacio() : 0;
  return { ...decidirConfirmacion({ ...opciones, tope }), tope };
}

/**
 * El `confirmar(costo)` de siempre (el «¿Sigo?» del panel), con el ajuste delante: si el espacio lo tiene fijado y es
 * una imagen con el modelo del cliente dentro del tope, sigue sin preguntar. `preguntar(costo)` es la pregunta de
 * siempre (devuelve si sigue). `otroMotor`: la persona escogió otro modelo para esta vez.
 */
export function confirmarConAjuste(preguntar, { otroMotor = false, tipo = "imagen" } = {}) {
  return async (costo) => {
    const d = await decidir({ costo, tipo, otroMotor });
    return d.preguntar ? Boolean(await preguntar(costo, d)) : true;
  };
}

/** ¿Puede quien está dentro encenderlo? (Lo que decide es el servidor.) */
export const puedeFijar = () => esAdmin();

/**
 * «No volver a preguntar»: enciende el ajuste con el tope que propone este pedido (el doble redondeado, o 3 $). Sólo el
 * administrador. → el tope que quedó.
 */
export async function fijarSinPreguntar(costo = 0) {
  const tope = topeSugerido(costo);
  const a = await saveAjustes({ sin_preguntar_usd: tope });
  const quedo = limpiarSinPreguntar(a?.sin_preguntar_usd) || tope;
  olvidarTope(quedo);
  return quedo;
}
