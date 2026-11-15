// ============================================================
// La pantalla en blanco después de un despliegue (puro, salvo `vigilarDespliegue`)
//
// Cada pantalla de la aplicación es un trozo aparte que se descarga al abrirla (`lazy`). Una pestaña que se dejó
// abierta durante un despliegue sigue pidiendo los trozos de la versión de antes, que ya no existen: el `import()`
// falla, React no tiene qué pintar y, sin una barrera, desmonta TODO. Pestaña en blanco, título correcto, nada en el
// registro que diga por qué. Al recargar se descarga el index.html nuevo (max-age=0) con los nombres nuevos.
//
// Se recarga UNA vez: si el trozo sigue sin llegar después de recargar (no es un despliegue, es la red o un archivo
// que falta de verdad), recargar en bucle sería peor que el aviso de la barrera de errores.
// ============================================================

const CLAVE = "recarga-tras-despliegue";
/** Dentro de este plazo desde la última recarga automática, no se recarga otra vez: se enseña el aviso. */
export const ESPERA_RECARGA = 30_000;

/** ¿Es un trozo de la aplicación que no se pudo descargar? Cada navegador lo dice con otras palabras. */
export function esFalloDeCarga(e) {
  if (e?.name === "ChunkLoadError") return true;
  const texto = String(e?.message ?? e ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS|Failed to load module script|is not a valid JavaScript MIME type/i.test(texto);
}

/**
 * Recarga la página si no se recargó por lo mismo hace menos de `ESPERA_RECARGA`. → true si recarga. Sin
 * almacenamiento (modo privado estricto) no recarga: no habría forma de saber si ya lo hizo y podría entrar en bucle.
 */
export function recargarUnaVez({ almacen = globalThis.sessionStorage, ahora = Date.now(), recargar = () => globalThis.location?.reload() } = {}) {
  try {
    const antes = Number(almacen?.getItem(CLAVE)) || 0;
    if (ahora - antes < ESPERA_RECARGA) return false;
    almacen.setItem(CLAVE, String(ahora));
  } catch {
    return false;
  }
  recargar();
  return true;
}

/**
 * Lo que avisa Vite cuando no puede descargar un trozo (`vite:preloadError`): se recarga una vez y el error no sigue
 * (`preventDefault`). Si ya se recargó, el error sigue y lo recoge la barrera de errores de la pantalla.
 */
export function vigilarDespliegue(ventana = globalThis.window) {
  ventana?.addEventListener?.("vite:preloadError", (e) => {
    if (recargarUnaVez()) e.preventDefault();
  });
}
