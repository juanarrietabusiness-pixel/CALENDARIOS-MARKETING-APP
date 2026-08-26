// ============================================================
// Partir un lote en tandas, y renumerarlo
//
// La función `ai` tiene su límite medido en su propia cabecera: seis
// publicaciones con Anthropic tardan unos 40 s, y el margen del plan
// gratuito de Supabase es de 150 s. Una pieza del prompt maestro es más
// cara que un caption —lleva titular con cortes, prompt de fondo,
// descripción y hashtags—, así que caben menos.
//
// Vive aquí y no en `api.js` porque no tiene nada de red: entra una lista
// y una función, salen las piezas. Así se puede probar la parte que falla
// en silencio —la numeración— sin llamar a nadie.
// ============================================================

export const PIEZAS_POR_TANDA = 3;

/**
 * Genera las piezas en tandas y las devuelve numeradas sobre el lote entero.
 *
 * El fallo silencioso que esto evita: cada llamada devuelve sus piezas
 * numeradas desde 1, así que sin renumerar el prompt sale con tres «PIEZA
 * 01» y Meta AI monta tres veces la primera. Se ve al abrir el HTML, no
 * antes.
 *
 * Un carrusel no se parte: sus tramos acentuados leídos en orden tienen que
 * formar una frase, y eso no sobrevive a dos llamadas que no se ven entre
 * sí. A cambio comparte una sola descripción, así que su salida es corta y
 * cabe entera.
 */
export async function enTandas(opciones, generar, alProgresar) {
  const { posts, modo = "lote" } = opciones;
  const total = posts.length;

  if (modo === "carrusel" || total <= PIEZAS_POR_TANDA) {
    alProgresar?.(0, total);
    const piezas = await generar(opciones);
    alProgresar?.(total, total);
    return piezas;
  }

  const todas = [];
  for (let i = 0; i < total; i += PIEZAS_POR_TANDA) {
    alProgresar?.(i, total);
    const piezas = await generar({ ...opciones, posts: posts.slice(i, i + PIEZAS_POR_TANDA) });
    todas.push(...piezas.map((p, j) => ({ ...p, n: i + j + 1 })));
  }
  alProgresar?.(total, total);
  return todas;
}
