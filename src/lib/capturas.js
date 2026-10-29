// ============================================================
// Las capturas que se mandan a la IA (la auditoría de un perfil)
//
// Aparte de medios.js, que va en la carga inicial: esto sólo lo usa la
// pantalla de Auditorías, que se carga en diferido.
// ============================================================

/**
 * Una captura de pantalla, reducida para mandarla a la IA: JPEG de 1080 px
 * de ancho como mucho. Una captura del teléfono pesa varios MB y la API
 * tiene tope por imagen; a este tamaño se sigue leyendo todo el texto.
 */
export async function capturaReducida(archivo, maximo = 1080) {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, maximo / img.width);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
  img.close?.();
  return lienzo.toDataURL("image/jpeg", 0.82);
}
