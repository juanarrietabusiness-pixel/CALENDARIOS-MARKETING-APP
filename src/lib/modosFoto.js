// ============================================================
// Los atajos de «¿Qué quieres?»: los modos de foto de producto y la versión de temporada (puro)
//
// Rellenan la indicación que ya usan «Crear la imagen aquí», «Otra versión» y «Recrear con mi marca» (el director de
// arte la trata como LO QUE PIDE LA AGENCIA, por delante de todo). No crean nada solos: la persona escoge la acción y
// ve el costo. Sólo lo carga el panel de una publicación (las fechas que vienen están en temporada.js).
//
//   · LOS MODOS DE FOTO son los de la sesión de fotos de producto de Higgsfield que la aplicación no tenía como
//     composición (con manos, una persona que lo usa, flotando, con salpicadura, estilo Pinterest): los nombres y cuándo
//     usar cada uno salen de su skill público (licencia MIT, docs/licencias/higgsfield-skills.md); su vocabulario
//     fotográfico es privado (vive en su servidor), así que cada línea está escrita aquí.
//   · LA TEMPORADA: la MISMA pieza ambientada en la fecha, sin inventar ofertas.
// ============================================================

/** Los modos de foto de producto, como atajos de «¿Qué quieres?». */
export const MODOS_FOTO = Object.freeze([
  {
    id: "manos", etiqueta: "Con manos",
    instruccion: "Foto de producto en primer plano: unas manos reales lo sostienen o lo usan con un gesto natural (piel real, uñas cuidadas), recorte cerrado y el fondo limpio y desenfocado con los colores de la marca.",
  },
  {
    id: "persona", etiqueta: "Una persona lo usa",
    instruccion: "Una persona real que encaja con su cliente ideal usa o lleva el producto, plano medio y gesto natural, en un ambiente de estilo de vida coherente con la marca; el producto se ve claro y protagonista.",
  },
  {
    id: "flotando", etiqueta: "Flotando",
    instruccion: "Foto de producto conceptual: el producto flota en el aire, ligeramente inclinado, con una sombra suave debajo y algunos elementos de su mundo flotando alrededor; fondo de color pleno de la marca y luz de estudio.",
  },
  {
    id: "salpicadura", etiqueta: "Con salpicadura",
    instruccion: "Foto de producto con el movimiento congelado: una salpicadura (de agua o de lo que tenga sentido para el producto) lo rodea, con gotas nítidas, sobre un fondo de color de la marca y luz de estudio contrastada.",
  },
  {
    id: "pinterest", etiqueta: "Estilo Pinterest",
    instruccion: "Imagen estilo Pinterest: composición de moodboard cuidada y aspiracional, luz natural suave, objetos de estilo de vida alrededor del producto, colores armónicos de la marca y mucho aire.",
  },
]);


/** Cómo se ambienta cada fecha (lo que no está, la decoración propia de la fecha). Sin inventar ofertas. */
const AMBIENTE = Object.freeze({
  navidad: "luces cálidas, detalles de pino, cintas rojas y doradas y un ambiente de hogar",
  nochebuena: "luces cálidas, mesa de fiesta, detalles de pino y dorados",
  "fin-de-anio": "brillo, destellos dorados y ambiente de celebración",
  "black-friday": "estética de Black Friday: fondo oscuro, alto contraste y detalles brillantes",
  "cyber-monday": "estética digital y tecnológica, fondo oscuro con acentos de neón suaves",
  madre: "ternura, flores frescas y un detalle de regalo",
  padre: "un ambiente cálido de familia y un detalle de regalo",
  "san-valentin": "corazones discretos, rosas y tonos rojos y rosados suaves",
  halloween: "calabazas y tonos naranja y morado, divertido y nada aterrador",
  "sabado-carnaval": "confeti y color, alegría de carnaval",
  independencia: "detalles discretos en rojo, azul y blanco de la bandera de Panamá",
  separacion: "detalles discretos en rojo, azul y blanco de la bandera de Panamá",
  bandera: "la bandera de Panamá presente con respeto, rojo, azul y blanco",
});


/** La indicación de la versión de temporada para una fecha. Pura. */
export function instruccionDeTemporada(fecha) {
  const nombre = String(fecha?.nombre ?? "").trim() || "la fecha";
  const ambiente = AMBIENTE[fecha?.id] ?? "la decoración y los detalles propios de la fecha";
  return `Versión de temporada para ${nombre}: la MISMA pieza (producto, texto y diseño) ambientada con ${ambiente}, sin perder los colores ni el logo de la marca. Sin precios ni ofertas que la publicación no diga.`;
}

