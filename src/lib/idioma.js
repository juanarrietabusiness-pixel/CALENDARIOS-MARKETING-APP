// ============================================================
// Español latino neutro en todo lo que escribe la IA (puro)
//
// Algunos guiones y captions salían con voseo («vení», «tenés», «vos») o
// con formas de España («vosotros», «ordenador»): el modelo imita lo que
// tiene delante —un ADN, un ejemplo, un comentario— y ningún prompt le
// decía qué español escribir. La regla es UNA y se pone en el único sitio
// por donde pasa toda llamada de texto (`abrirFlujo`, worker/lib/anthropic.js)
// y en el análisis de video de Gemini: una ruta nueva la lleva sin saberlo.
// ============================================================

/** La marca que deja saber si una petición ya lleva la regla. */
const MARCA = "IDIOMA DE TODO LO QUE ESCRIBES:";

export const REGLA_IDIOMA = `${MARCA} español latino neutro, el que se entiende igual en Panamá, México o Colombia.
- Trata a quien lee de «tú», o de «usted» si la marca o el cliente lo usan. Nunca «vos» ni «vosotros».
- Sin voseo ni formas de España: «ven», no «vení»; «tienes», no «tenés»; «puedes», no «podés»; «mira», no «mirá»; «ustedes», no «vosotros»; «celular», no «móvil»; «computadora», no «ordenador».
- Aunque el material de la marca, los ejemplos o la conversación usen otra variante, lo que tú escribas va en español neutro. Los nombres propios, las marcas y las citas textuales se respetan tal cual.
- Si te piden expresamente otro idioma, escribe en ese idioma.`;

/** ¿Ya la lleva? (una petición que pasa dos veces no la duplica) */
function laLleva(system) {
  if (typeof system === "string") return system.includes(MARCA);
  return Array.isArray(system) && system.some((b) => typeof b?.text === "string" && b.text.includes(MARCA));
}

/**
 * La petición de mensajes con la regla DELANTE del resto del sistema.
 * Delante y fija: la caché de prompt es por prefijo, y un bloque que no
 * cambia nunca no la invalida. Lo marcado con `cache_control` se conserva.
 */
export function conReglaIdioma(peticion) {
  if (!peticion || laLleva(peticion.system)) return peticion;
  const regla = { type: "text", text: REGLA_IDIOMA };
  const resto = typeof peticion.system === "string"
    ? (peticion.system.trim() ? [{ type: "text", text: peticion.system }] : [])
    : Array.isArray(peticion.system) ? peticion.system : [];
  return { ...peticion, system: [regla, ...resto] };
}
