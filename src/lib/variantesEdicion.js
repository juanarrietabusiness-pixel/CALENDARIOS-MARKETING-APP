// ============================================================
// El CATÁLOGO DE VARIANTES de las piezas del editor de video grabado (puro; lo lleva copiado el kit y lo usa el servidor)
//
// El kit nació con UN juego de piezas, el de Rofer v2: el primer video de otra empresa salió igual que Rofer con otros
// colores (corrección de la agencia, 2026-11-24). Aquí está cada pieza que se puede pintar de varias maneras, todas con los
// colores, las letras y el logo de la marca:
//   · transicion — el paso de un clip a otro y al cierre;
//   · entrada    — cómo aparece un texto (el gigante detrás de la persona, las palabras del trío, lo grande del sello);
//   · subtitulos — los 4 estilos de identidad_video (src/lib/identidadVideo.js, ESTILOS_SUBTITULO);
//   · cierre     — el final con el logo, el llamado, el número y el @usuario;
//   · ritmo      — cuánto tardan las animaciones (el pulso del video);
//   · forma      — esquinas redondas o rectas en placas, fichas y botones.
// Lo que se elige va en plan.json («variantes») y llega a Remotion resuelto (escenaEdicion.js → datos.variantes). Una
// pieza de texto puede pedir su propia entrada («entrada» en la pieza). Sin «variantes», el juego de siempre (BASE).
// ============================================================

export const VARIANTES = Object.freeze({
  transicion: Object.freeze({
    nombre: "Transición",
    variantes: Object.freeze({
      barrido: { nombre: "Barrido diagonal", descripcion: "Una franja del color oscuro, inclinada y con filo del acento, cruza el cuadro en el cambio." },
      zoom: { nombre: "Golpe de zoom", descripcion: "La imagen se acerca de golpe hasta el corte y la siguiente llega desde cerca, con un desenfoque breve." },
      paneo: { nombre: "Paneo rápido", descripcion: "La imagen sale barrida de lado y la siguiente entra por el otro, con estela de movimiento." },
      deslizar: { nombre: "Deslizamiento", descripcion: "Un panel del color de la marca sube desde abajo, tapa el corte y sigue hacia arriba." },
      glitch: { nombre: "Glitch", descripcion: "Unos cuadros de interferencia: franjas desplazadas, color invertido y temblor, y corte." },
      destello: { nombre: "Corte seco con destello", descripcion: "Corte limpio, sin movimiento, con un destello blanco y del acento de dos o tres cuadros." },
    }),
  }),
  entrada: Object.freeze({
    nombre: "Entrada de texto",
    variantes: Object.freeze({
      subir: { nombre: "Subir", descripcion: "El texto sube desde su línea, como saliendo de una ranura." },
      golpe: { nombre: "Golpe", descripcion: "El texto cae grande y aterriza a su tamaño con rebote." },
      palabra: { nombre: "Palabra por palabra", descripcion: "Cada palabra aparece detrás de la anterior, con un pequeño salto." },
      mascara: { nombre: "Máscara", descripcion: "Una barra del acento recorre el texto y lo va descubriendo de izquierda a derecha." },
      maquina: { nombre: "Máquina de escribir", descripcion: "Letra a letra, con el cursor del color de acento." },
      escala: { nombre: "Escala suave", descripcion: "El texto aparece apenas más pequeño y con las letras abiertas, y se asienta despacio." },
    }),
  }),
  subtitulos: Object.freeze({
    nombre: "Subtítulos",
    // Los mismos 4 de identidad_video (un test lo comprueba): así el estilo de la marca vale en el editor y en el Estudio.
    variantes: Object.freeze({
      clasico: { nombre: "Clásico", descripcion: "El grupo en mayúsculas con borde oscuro; la clave en el color de acento." },
      palabra: { nombre: "Palabra a palabra", descripcion: "Sólo la palabra que se dice, grande y con borde; la clave en el acento." },
      placa: { nombre: "Sobre placa", descripcion: "El grupo sobre una placa del color oscuro de la marca; la clave en el acento." },
      limpio: { nombre: "Limpio", descripcion: "Como se escribe, sin borde, con una sombra suave; lo que aún no se dice, tenue." },
    }),
  }),
  cierre: Object.freeze({
    nombre: "Cierre",
    variantes: Object.freeze({
      tarjeta: { nombre: "Tarjeta", descripcion: "El logo en una tarjeta blanca, el botón del llamado que late, el número grande y rayas de obra arriba y abajo." },
      limpio: { nombre: "Limpio", descripcion: "Sobre el color oscuro, sin rayas: el logo en un círculo, una línea fina del acento que se abre, el llamado en letra espaciada y el número." },
      banda: { nombre: "Banda", descripcion: "Una banda del acento entra de lado y se queda en diagonal; el logo y el número alineados a la izquierda, con fuerza." },
      circulo: { nombre: "Círculo", descripcion: "Un círculo del acento se abre desde el centro y revela el logo con un rebote suave; el llamado en una píldora." },
    }),
  }),
  ritmo: Object.freeze({
    nombre: "Ritmo",
    variantes: Object.freeze({
      pausado: { nombre: "Pausado", descripcion: "Animaciones largas y suaves: el texto se asienta, las transiciones respiran." },
      normal: { nombre: "Normal", descripcion: "El pulso de siempre." },
      vivo: { nombre: "Vivo", descripcion: "Todo entra y sale más rápido; las transiciones duran menos." },
    }),
  }),
  forma: Object.freeze({
    nombre: "Forma",
    variantes: Object.freeze({
      redonda: { nombre: "Redonda", descripcion: "Placas, fichas y botones con esquinas redondeadas y píldoras." },
      recta: { nombre: "Recta", descripcion: "Esquinas casi rectas: placas y botones de canto vivo." },
    }),
  }),
});

export const PIEZAS_CON_VARIANTE = Object.freeze(Object.keys(VARIANTES));

/** El juego de siempre (Rofer v2): lo que sale si el plan no elige. */
export const VARIANTES_BASE = Object.freeze({ transicion: "barrido", entrada: "subir", subtitulos: "placa", cierre: "tarjeta", ritmo: "normal", forma: "redonda" });

/** Cuánto se alargan (o acortan) las animaciones con cada ritmo. */
export const FACTOR_RITMO = Object.freeze({ pausado: 1.45, normal: 1, vivo: 0.72 });

/** Las piezas que aparecen con la «entrada» del estilo (las demás tienen su animación propia, que sigue el ritmo). */
export const PIEZAS_CON_ENTRADA = Object.freeze(["gigante", "trio", "sello"]);

/** ¿Es `v` una variante de esa pieza? */
export const esVariante = (pieza, v) => Boolean(VARIANTES[pieza] && Object.hasOwn(VARIANTES[pieza].variantes, v));

/** Sólo lo válido de un objeto de variantes ({ transicion: "zoom", … }); lo demás se descarta. Pura. */
export function limpiarVariantes(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  return Object.fromEntries(PIEZAS_CON_VARIANTE.filter((k) => esVariante(k, x[k])).map((k) => [k, x[k]]));
}

/** Lo que NO es válido de un objeto de variantes, dicho para quien lo escribió (para validar el plan). Pura. */
export function erroresDeVariantes(x) {
  if (x === undefined || x === null) return [];
  if (typeof x !== "object" || Array.isArray(x)) return ["«variantes» es un objeto: { transicion, entrada, subtitulos, cierre, ritmo, forma }."];
  const errores = [];
  for (const [k, v] of Object.entries(x)) {
    if (!VARIANTES[k]) errores.push(`«variantes.${k}» no existe: las piezas con variante son ${PIEZAS_CON_VARIANTE.join(", ")}.`);
    else if (!esVariante(k, v)) errores.push(`«variantes.${k}»: «${v}» no es una variante; son ${Object.keys(VARIANTES[k].variantes).join(", ")}.`);
  }
  return errores;
}

/** Las variantes completas: lo elegido sobre la base. Pura. */
export function variantesCompletas(x) {
  return { ...VARIANTES_BASE, ...limpiarVariantes(x) };
}

/** Lo que lee Remotion: las variantes completas y el factor del ritmo (`k`). Pura. */
export function variantesParaRemotion(x) {
  const v = variantesCompletas(x);
  return { ...v, k: FACTOR_RITMO[v.ritmo] };
}

/** «Transición: golpe de zoom · Entrada: máscara · …» (sólo lo que hay). Pura. */
export function describirVariantes(x, { completas = false } = {}) {
  const v = completas ? variantesCompletas(x) : limpiarVariantes(x);
  return PIEZAS_CON_VARIANTE.filter((k) => v[k]).map((k) => `${VARIANTES[k].nombre}: ${VARIANTES[k].variantes[v[k]].nombre.toLowerCase()}`).join(" · ");
}

/** El catálogo en texto, para Claude (el manual, guia_de_edicion, kit_edicion). Pura. */
export function catalogoEnTexto() {
  return PIEZAS_CON_VARIANTE.map((k) => [
    `${VARIANTES[k].nombre} («${k}»):`,
    ...Object.entries(VARIANTES[k].variantes).map(([id, x]) => `  - ${id}: ${x.nombre}. ${x.descripcion}`),
  ].join("\n")).join("\n");
}
