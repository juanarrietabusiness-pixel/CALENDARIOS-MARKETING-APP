// ============================================================
// Partir un lote en tandas, y renumerarlo
//
// Hay dos límites y los dos se han cruzado en producción: el tiempo que
// aguanta Supabase, y los tokens de salida del modelo. El segundo resultó
// ser el que mordía: los registros de la API enseñaron un lote de doce
// piezas consumiendo 24 000 tokens de salida, o sea 2 000 por pieza, contra
// un techo que le habíamos puesto muy por debajo.
//
// De ahí las tandas cortas. Y de ahí que se avance por las piezas que
// LLEGARON y no por las que se pidieron: si una respuesta se corta, la
// vuelta siguiente retoma donde se quedó en vez de saltarse una.
//
// Vive aquí y no en `api.js` porque no tiene nada de red: entra una lista
// y una función, salen las piezas. Así se puede probar la parte que falla
// en silencio —la numeración— sin llamar a nadie.
// ============================================================

export const PIEZAS_POR_TANDA = 2;

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
  let i = 0;
  let atascos = 0;

  while (i < total) {
    alProgresar?.(i, total);
    const piezas = await generar({ ...opciones, posts: posts.slice(i, i + PIEZAS_POR_TANDA) });

    if (!piezas.length) {
      // El generador ya avisa cuando no puede con ninguna; esto es la red
      // por si devolviera vacío sin lanzar. Sin el corte, el bucle se
      // quedaría pidiendo la misma tanda para siempre.
      if (++atascos >= 2) {
        throw new Error(`No se pudo escribir la pieza ${i + 1}. Prueba con menos publicaciones.`);
      }
      continue;
    }
    atascos = 0;

    // El generador devuelve las que le cupieron, que pueden ser menos de
    // las pedidas si la respuesta se cortó. Se avanza por las que llegaron,
    // no por las que se pidieron: así la siguiente vuelta retoma justo
    // donde se quedó en vez de saltarse una.
    todas.push(...piezas.map((p, j) => ({ ...p, n: i + j + 1 })));
    i += piezas.length;
  }

  alProgresar?.(total, total);
  return todas;
}
