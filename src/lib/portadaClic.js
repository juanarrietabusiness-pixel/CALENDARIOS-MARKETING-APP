// ============================================================
// «Portada que da clic»: la portada de un reel o de un video de YouTube, por CONCEPTO (puro)
//
// Una portada se ve pequeña —unos 120 px en el perfil o en la lista de YouTube—, así que no gana la más bonita sino la
// que se entiende de un vistazo: UNA idea, un foco grande y un titular corto y enorme. Los 16 conceptos son la forma de
// esa idea (antes y después, la pregunta, el número…), escritos con palabras propias a partir del método público de
// Higgsfield (MIT, docs/licencias/higgsfield-skills.md). La imagen sale por el camino de una pieza (el director de
// arte, el kit, las fotos del producto, el control del texto y el logo): calendario/PortadaClic.jsx.
// ============================================================

export const CONCEPTOS_PORTADA = [
  { id: "antes-despues", nombre: "Antes y después", idea: "La pieza partida en dos: cómo era y cómo queda.", escena: "La imagen partida en dos mitades bien separadas: a un lado el antes (apagado, el problema) y al otro el después (luminoso, resuelto), con el mismo encuadre para que se note la diferencia." },
  { id: "reaccion", nombre: "La reacción", idea: "Una cara con una emoción fuerte mirando lo que pasa.", escena: "Una persona en primer plano con una reacción clara y exagerada (sorpresa, alivio, asombro) mirando hacia el producto o el detalle, que ocupa la otra mitad." },
  { id: "pregunta", nombre: "La pregunta", idea: "Una pregunta que la persona quiere contestar.", escena: "Un fondo limpio con el foco (el producto o una persona pensativa) a un lado y la pregunta enorme al otro, como protagonista." },
  { id: "numero", nombre: "El número grande", idea: "Una cifra enorme: 3 errores, 5 minutos, 2x.", escena: "Un número gigante, el elemento más grande de la pieza, junto al producto o a la escena que explica, con muy pocos elementos más." },
  { id: "error", nombre: "El error tachado", idea: "Lo que NO se hace, marcado con una X roja.", escena: "La forma equivocada de hacerlo, reconocible, con una X o una tachadura roja grande encima; si cabe, al lado la forma correcta con un visto verde." },
  { id: "versus", nombre: "Esto o esto", idea: "Dos opciones lado a lado para comparar.", escena: "Dos opciones lado a lado, del mismo tamaño y con el mismo encuadre, separadas por una línea o un «VS» claro; cada una bien reconocible." },
  { id: "secreto", nombre: "Lo que nadie te dice", idea: "Algo oculto que se revela a medias.", escena: "El producto o la escena parcialmente revelada (una tela que se levanta, una caja entreabierta, un detalle en sombra) que invita a ver qué hay." },
  { id: "resultado", nombre: "El resultado", idea: "El final feliz, sin mostrar el proceso.", escena: "El resultado terminado y perfecto, en su mejor luz, ocupando casi toda la pieza: lo que la persona quiere tener." },
  { id: "gigante", nombre: "El producto gigante", idea: "El producto enorme, en primer plano, sin nada más.", escena: "El producto real en primer plano, enorme, ocupando más de la mitad de la pieza, sobre un fondo de un solo color de la marca, con sombra suave." },
  { id: "senala", nombre: "Señala el detalle", idea: "Una flecha o un círculo sobre lo que importa.", escena: "La escena con UN detalle señalado por un círculo o una flecha grande de color de la marca, para que el ojo vaya directo ahí." },
  { id: "lista", nombre: "La lista", idea: "Varias cosas en orden: un top, un paso a paso.", escena: "Tres elementos ordenados (en fila o escalonados), cada uno pequeño pero reconocible, con el titular que dice cuántos son." },
  { id: "reto", nombre: "El reto", idea: "¿Se puede…? Una prueba con resultado incierto.", escena: "La prueba a punto de pasar (el producto ante un desafío: agua, peso, un niño travieso) congelada en el momento de tensión." },
  { id: "precio", nombre: "El precio", idea: "El precio del catálogo como gancho (sólo si es real).", escena: "El producto real con su precio exacto del catálogo en una etiqueta o placa grande y llamativa; nada más compite con los dos." },
  { id: "como", nombre: "El cómo", idea: "Las manos haciéndolo: se promete enseñar a hacerlo.", escena: "Unas manos en plena acción usando el producto o haciendo el paso clave, en primer plano y con luz clara." },
  { id: "detras", nombre: "Detrás de cámaras", idea: "Lo que no se ve: el taller, el equipo, el proceso.", escena: "Una escena real del proceso o del equipo trabajando, cercana y auténtica, con el producto o la marca reconocible en ella." },
  { id: "momento", nombre: "El momento", idea: "El instante justo antes de que pase algo.", escena: "El instante de máxima tensión de una pequeña historia (la cara antes de probarlo, el regalo a punto de abrirse), con el foco claro." },
];

/** Cuántas palabras y letras caben en un titular que se lee a 120 px. */
export const MAX_PALABRAS_PORTADA = 4;
export const MAX_LETRAS_PORTADA = 24;

/** Avisos sobre el titular (vacío si está bien). Pura. */
export function avisosDeTitular(titular) {
  const t = String(titular ?? "").replace(/\s+/g, " ").trim();
  if (!t) return ["Escribe el titular: es lo que se lee en la portada."];
  const avisos = [];
  const palabras = t.split(" ").length;
  if (palabras > MAX_PALABRAS_PORTADA) avisos.push(`Tiene ${palabras} palabras: a 120 px se leen como mucho ${MAX_PALABRAS_PORTADA}.`);
  if (t.length > MAX_LETRAS_PORTADA) avisos.push(`Tiene ${t.length} letras: con más de ${MAX_LETRAS_PORTADA} la letra sale pequeña.`);
  return avisos;
}

/** El titular de partida: el texto de la pieza o el título, cortado a las palabras que caben. Pura. */
export function titularInicial(post = {}) {
  const base = String(post.textoPieza || post.title || "").split(/\n|[.!?¿¡:|·—-]\s/)[0].replace(/["«»]/g, "").replace(/\s+/g, " ").trim();
  return base.split(" ").slice(0, MAX_PALABRAS_PORTADA).join(" ").slice(0, MAX_LETRAS_PORTADA).trim();
}

export const PROPORCION_PORTADA = { reel: "9:16", youtube: "16:9" };

/**
 * «Qué se ve» de la portada (va como `escena` de la publicación al director de arte, que escribe la ficha). Pura.
 * `formato`: «reel» (9:16, lo importante en la ventana 3:4 del centro: el perfil la recorta) o «youtube» (16:9).
 */
export function escenaDePortada({ concepto, formato = "reel" } = {}) {
  const c = CONCEPTOS_PORTADA.find((x) => x.id === concepto) ?? CONCEPTOS_PORTADA[0];
  const zona = formato === "youtube"
    ? "Formato 16:9 horizontal; deja libre la esquina inferior derecha (ahí YouTube pone la duración)."
    : "Formato 9:16 vertical; TODO lo importante (el foco y el titular) dentro de la ventana 3:4 del centro, porque el perfil recorta arriba y abajo.";
  return [
    `PORTADA de un video, concepto «${c.nombre}»: ${c.escena}`,
    "Tiene que entenderse vista en miniatura, a 120 px de ancho: una sola idea, un solo foco grande (ocupa al menos el 40 % de la pieza), fondo simple y alto contraste.",
    "El titular, enorme (al menos el 15 % de la altura de la pieza), en letra gruesa y con contorno o placa que lo separe del fondo; nada de texto pequeño, ni más textos que el titular.",
    zona,
  ].join(" ");
}
