// ============================================================
// Cómo se ve cada cosa del calendario
//
// Funciones puras: un tono a partir de una categoría, una hora en 12
// horas, texto sin marcas. Van aparte de las primitivas porque oxlint
// pide que un fichero de componentes exporte SÓLO componentes —si no,
// el recargado en caliente deja de funcionar—, y porque además así se
// pueden probar sin montar nada.
// ============================================================

export const CATEGORY_HUES = [210, 340, 30, 160, 270, 50, 190, 0, 130, 300, 80, 230];

export function categoryHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return CATEGORY_HUES[((h % CATEGORY_HUES.length) + CATEGORY_HUES.length) % CATEGORY_HUES.length];
}

export function stripMarkdown(text) {
  if (!text) return "";
  return text.replace(/\*\*\*(.*?)\*\*\*/g, "$1").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/__(.*?)__/g, "$1").replace(/_(.*?)_/g, "$1");
}

export function fmt12h(value) {
  if (!value) return "--:--";
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * La cabecera de un campo del panel: etiqueta a la izquierda, botón de
 * IA a la derecha. Vive aquí y no en `primitivas.jsx` por lo que dice
 * la cabecera de este fichero: un fichero de componentes que exporta
 * algo que no es un componente rompe el recargado en caliente, y oxlint
 * lo avisa.
 */
export const fieldHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--sp-2)",
  marginBottom: "var(--sp-1)",
};
