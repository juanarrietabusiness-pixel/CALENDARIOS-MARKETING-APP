// ============================================================
// Las barras de pestañas (BarraPestanas.jsx): los ids y las teclas (puro)
//
// Una pestaña y su panel se nombran entre sí (`aria-controls`, `aria-labelledby`): los dos ids salen de aquí, del
// mismo prefijo, para que quien pinta el panel no tenga que adivinar cómo se llama la pestaña.
// ============================================================

export const idDePestana = (base, id) => `${base}-tab-${id}`;
export const idDelPanel = (base) => `${base}-panel`;

/** A qué pestaña lleva una tecla desde la `i` de `n` (en círculo), o -1 si la tecla no mueve (o no hay foco en ninguna). */
export function indicePorTecla(i, n, tecla) {
  if (i < 0 || n < 1) return -1;
  if (tecla === "ArrowRight") return (i + 1) % n;
  if (tecla === "ArrowLeft") return (i - 1 + n) % n;
  if (tecla === "Home") return 0;
  if (tecla === "End") return n - 1;
  return -1;
}
