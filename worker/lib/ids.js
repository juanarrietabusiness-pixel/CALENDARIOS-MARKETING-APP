// ============================================================
// Identificadores y huellas
//
// Todo sale de crypto.getRandomValues / crypto.subtle, que Workers trae
// de serie. Nada de Math.random: un testigo de compartición predecible
// es un calendario de cliente abierto a quien lo adivine.
// ============================================================

export const uuid = () => crypto.randomUUID();

/** Hexadecimal de `bytes` octetos. 24 octetos = 48 caracteres. */
export function testigo(bytes = 24) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha256(texto) {
  const datos = new TextEncoder().encode(texto);
  const huella = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(huella)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre cadenas se corta en el primer carácter distinto, y esa
 * diferencia de tiempo se mide: permite adivinar un secreto carácter a
 * carácter.
 */
export function igualSeguro(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const ahora = () => new Date().toISOString();

export function enHoras(horas) {
  return new Date(Date.now() + horas * 3600_000).toISOString();
}
