// ============================================================
// Respuestas y cabeceras del Worker
//
// LA TRAMPA QUE JUSTIFICA ESTE FICHERO
//
// Workers Static Assets lee un `public/_headers`, pero la documentación
// es explícita: «los encabezados personalizados definidos en _headers no
// se aplican a las respuestas generadas por el código de tu Worker».
//
// O sea que las cabeceras de seguridad viven en DOS sitios: `_headers`
// para el HTML y los recursos, y aquí para todo lo que cuelga de
// /api/*. Si sólo se traduce netlify.toml a _headers, la API se queda
// sin X-Content-Type-Options, sin Cache-Control y sin CSP —y el sitio
// se ve exactamente igual—. Es el tipo de fallo invisible para el que
// existe tests/despliegue/.
// ============================================================

/** Cabeceras que lleva TODA respuesta de /api/*. */
export const CABECERAS_API = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // La API devuelve estado en vivo —aprobaciones, sesión—: cachearla
  // muestra datos viejos sin ningún síntoma de que lo sean.
  "Cache-Control": "no-store, max-age=0",
});

export function json(datos, estado = 200, extra = {}) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { ...CABECERAS_API, ...extra },
  });
}

/**
 * Error con mensaje en español.
 *
 * El detalle técnico va al registro, no al cuerpo: un mensaje de error
 * que repite lo que dijo la base de datos cuenta la forma de las tablas
 * a quien pregunte.
 */
export function error(mensaje, estado = 400, causa = null) {
  if (causa) console.error(`[${estado}] ${mensaje}:`, causa);
  return json({ error: mensaje }, estado);
}

export const noAutenticado = () => error("No autenticado", 401);
export const noEncontrado = (que = "Recurso") => error(`${que} no encontrado`, 404);

/** 204 sin cuerpo, para los DELETE. */
export function sinContenido() {
  return new Response(null, { status: 204, headers: CABECERAS_API });
}

/** Lee el cuerpo JSON sin dejar que un cuerpo roto tumbe la petición. */
export async function cuerpo(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
