// ============================================================
// YouTube desde el navegador: conectar, elegir canal, privacidad
//
// Lo que no es de YouTube (el estado de las redes, las cuentas) sigue en
// db.js. Ver worker/rutas/youtube.js.
// ============================================================

import { pedir } from "./db";

const conCuerpo = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos) });

/** Conectar aquí es NAVEGAR a Google (con la cuenta que tiene el canal). */
export const urlConectarYouTube = (clientId) => `/api/redes/youtube/conectar?cliente=${encodeURIComponent(clientId)}`;

/** El enlace para que el cliente conecte su canal desde su teléfono (vale una semana). */
export async function enlaceYouTube(clientId) {
  return pedir("/redes/youtube/enlace", conCuerpo("POST", { clientId }));
}

/** Llegaron varios canales: éste es el del cliente. */
export async function elegirCanalYouTube(cuentaId) {
  return pedir("/redes/youtube/elegir", conCuerpo("POST", { cuentaId }));
}

/** «public», «unlisted» o «private». */
export async function privacidadYouTube(cuentaId, privacidad) {
  return pedir("/redes/youtube/privacidad", conCuerpo("PUT", { cuentaId, privacidad }));
}

export async function desconectarYouTube(cuentaId) {
  return pedir("/redes/youtube/desconectar", conCuerpo("POST", { cuentaId }));
}

/** Los nombres de la pantalla, en el mismo orden que el servidor. */
export const PRIVACIDADES = [
  ["public", "Público"],
  ["unlisted", "Oculto (sólo con el enlace)"],
  ["private", "Privado"],
];
