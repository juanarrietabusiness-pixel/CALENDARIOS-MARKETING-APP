// ============================================================
// Lo que se decide ANTES de escribir el prompt, no dentro de él
//
// Es la diferencia entre el entregable de PanaClaw y el nuestro, y su skill
// lo dice en una línea:
//
//     «Se entrega resuelta, no como regla: si Meta tiene que decidirlo,
//      no lo hace.»
//
// Nosotros le estábamos dando a Meta AI la fórmula de la interlínea para
// que la calculara, y el tamaño y el anclaje se los pedíamos al modelo que
// escribe las piezas. Las tres son cuentas mecánicas: el número de líneas
// decide el tamaño, el tamaño decide el anclaje, y los caracteres de cada
// línea deciden la holgura. Aquí se resuelven, y al prompt llega el número.
//
// El contrato entero de este sistema es que Meta AI copia y no decide.
// Dejarle una cuenta pendiente lo rompe por dentro aunque el prompt esté
// perfectamente redactado.
// ============================================================

/** Los corchetes del acento son marcas para el maquetador, no texto. */
const sinMarcas = (linea) => String(linea).replace(/[⟦⟧]/g, "");

/** Rango de líneas que declara una fila de la escala: «Titular L · 4–5 líneas». */
function rangoDeLineas(elemento) {
  const doble = elemento.match(/(\d+)\s*[–—-]\s*(\d+)\s*líneas/i);
  if (doble) return [Number(doble[1]), Number(doble[2])];
  const simple = elemento.match(/(\d+)\s*líneas?/i);
  if (simple) return [Number(simple[1]), Number(simple[1])];
  return null;
}

/** Las filas de la escala que son titular, ordenadas de mayor a menor cuerpo. */
export function tamanosDeTitular(receta) {
  return (receta?.escala || [])
    .map((fila) => ({ ...fila, rango: rangoDeLineas(fila.elemento || "") }))
    .filter((fila) => /titular/i.test(fila.elemento || "") && fila.rango)
    .sort((a, b) => b.px - a.px);
}

/**
 * Elige el cuerpo del titular.
 *
 * «El número de líneas propone, el carácter más largo dispone»: si una línea
 * se pasa del rango de caracteres de su tamaño, baja un escalón. Sin esa
 * segunda comprobación, un titular de dos líneas muy largas se compone al
 * cuerpo mayor y se sale del lienzo.
 */
export function elegirTamano(receta, titular) {
  const tamanos = tamanosDeTitular(receta);
  if (!tamanos.length) return null;

  const lineas = titular.map(sinMarcas);
  const masLarga = Math.max(...lineas.map((l) => l.length), 0);

  let elegido =
    tamanos.find((t) => lineas.length >= t.rango[0] && lineas.length <= t.rango[1]) ??
    // Más líneas de las que contempla la escala: el cuerpo más pequeño.
    (lineas.length > tamanos[0].rango[1] ? tamanos[tamanos.length - 1] : tamanos[0]);

  // El carácter más largo dispone.
  let bajadas = 0;
  while (elegido.maxCaracteresLinea && masLarga > elegido.maxCaracteresLinea) {
    const siguiente = tamanos[tamanos.indexOf(elegido) + 1];
    if (!siguiente) break;
    elegido = siguiente;
    bajadas++;
  }

  return {
    ...elegido,
    lineas: lineas.length,
    caracteresMaximos: masLarga,
    bajoUnEscalon: bajadas > 0,
  };
}

/**
 * Resuelve la interlínea del titular, par de líneas a par de líneas.
 *
 * Devuelve el avance ya calculado, en em y en píxeles, con el motivo de cada
 * holgura escrito. Lo del motivo no es cortesía: es lo que permite al humano
 * comprobar el resultado sin rehacer la cuenta, y lo que hace que un error
 * se vea en vez de esconderse en un número.
 */
export function resolverInterlinea(receta, titular, px) {
  const i = receta?.interlineado;
  const lineas = titular.map(sinMarcas);
  if (!i || lineas.length < 2) return null;

  // Las claves de la receta son grupos de caracteres: «Á É Í Ó Ú».
  const grupos = (obj) =>
    Object.entries(obj || {}).map(([chars, valor]) => ({
      chars: chars.split(/\s+/).filter(Boolean),
      valor,
    }));

  const arriba = grupos(i.holguraSuperior);
  const abajo = grupos(i.holguraInferior);

  const buscar = (texto, gs) => {
    for (const g of gs) {
      const hallados = g.chars.filter((c) => texto.includes(c));
      if (hallados.length) return { valor: g.valor, chars: hallados };
    }
    return null;
  };

  const pares = [];
  for (let n = 0; n < lineas.length - 1; n++) {
    // `base` sale de la fila de la escala que toca, no de la receta global:
    // el titular XL y el L no llevan la misma interlínea.
    const base = Number(px.interlinea ?? 1);
    const sup = buscar(lineas[n + 1], arriba);
    const inf = buscar(lineas[n], abajo);

    const avanceEm = base + (sup?.valor ?? 0) + (inf?.valor ?? 0);
    const porque = [
      sup && `${sup.chars.join(" ")} en la línea ${n + 2}`,
      inf && `${inf.chars.join(" ")} en la línea ${n + 1}`,
    ].filter(Boolean).join(" · ");

    pares.push({
      de: n + 1,
      a: n + 2,
      base,
      holguraSuperior: sup?.valor ?? 0,
      holguraInferior: inf?.valor ?? 0,
      avanceEm: Number(avanceEm.toFixed(4)),
      avancePx: Math.round(avanceEm * px.px),
      porque: porque || "sin tildes ni descendentes: interlínea base",
    });
  }
  return pares;
}

/**
 * Elige el anclaje vertical.
 *
 * Mecánico, no artístico. Hay dos formas de decidirlo y las marcas usan una
 * u otra: por PLANTILLA, cuando cada composición tiene su base fija —es el
 * caso de las marcas con banda inferior—, o por NÚMERO DE LÍNEAS, cuando el
 * bloque flota y el titular largo sube.
 *
 * Sin `anclajes` en la receta se devuelve null y el prompt usa la prosa del
 * campo `anclaje`. Es peor, pero no se inventa una base que nadie decidió.
 */
export function elegirAnclaje(receta, pieza, lineas) {
  const anclajes = receta?.anclajes;
  if (!Array.isArray(anclajes) || !anclajes.length) return null;

  // La plantilla manda sobre el número de líneas: si la marca fija la base
  // de cada composición, el titular largo no la mueve.
  const porPlantilla = anclajes.find(
    (a) => a.plantilla && pieza?.plantilla && String(a.plantilla) === String(pieza.plantilla)
  );
  if (porPlantilla) return porPlantilla;

  return (
    anclajes.find((a) =>
      Array.isArray(a.lineas) ? lineas >= a.lineas[0] && lineas <= a.lineas[1] : false
    ) ?? null
  );
}

/**
 * Resuelve una pieza entera: cuerpo, anclaje e interlínea.
 *
 * Lo que devuelve va literal al prompt. Meta AI no calcula nada de esto.
 */
export function componerPieza(receta, pieza) {
  const titular = Array.isArray(pieza.titular) ? pieza.titular : [];
  if (!titular.length) return { ...pieza };

  const tamano = elegirTamano(receta, titular);
  if (!tamano) return { ...pieza };

  return {
    ...pieza,
    _tamano: tamano,
    _anclaje: elegirAnclaje(receta, pieza, titular.length),
    _interlinea: resolverInterlinea(receta, titular, tamano),
  };
}

/** Avisos de composición que el humano tiene que ver antes de entregar. */
export function avisosDeComposicion(receta, piezas) {
  const avisos = [];
  for (const p of piezas) {
    const titular = Array.isArray(p.titular) ? p.titular : [];
    if (!titular.length) continue;
    const t = elegirTamano(receta, titular);
    if (!t) continue;

    if (t.bajoUnEscalon) {
      avisos.push(
        `Pieza ${p.n}: el titular bajó a ${t.px} px porque una línea llega a ${t.caracteresMaximos} caracteres.`
      );
    }
    if (t.maxCaracteresLinea && t.caracteresMaximos > t.maxCaracteresLinea) {
      // Ya no queda escalón al que bajar: es el humano quien tiene que
      // acortar la línea, y decirlo es mejor que entregar una pieza que se
      // sale del lienzo.
      avisos.push(
        `Pieza ${p.n}: una línea del titular tiene ${t.caracteresMaximos} caracteres y el cuerpo más pequeño admite ${t.maxCaracteresLinea}. Hay que acortarla.`
      );
    }
  }
  return avisos;
}
