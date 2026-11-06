// ============================================================
// Qué pieza va en cada etapa del CICLO DE VENTAS según el negocio y el destino (puro)
//
// La tabla del ciclo de ventas del curso de campañas (módulo 2), escrita con palabras propias, y `cicloDe()`.
// Vive aparte de cicloVentas.js, y se importa de AQUÍ: cicloVentas.js va en la carga inicial (lo lee el embudo del
// mes) y esta tabla es texto que sólo necesitan las pantallas de anuncios y el Worker. Reexportada desde allí, la
// primera pantalla diferida que la usara la metería entera en el arranque (rollup reparte por módulo, no por
// función). Lo vigila tests/despliegue/rendimiento.bundle.test.js.
// ============================================================

import { ETAPAS_CICLO, tipoNegocioDe, destinoNegocioDe } from "./cicloVentas.js";

/** El objetivo de campaña que sugiere el ciclo (con el id de Meta en `meta`, el de src/lib/anuncios.js). */
// (`@__PURE__`: lo que nadie importa no entra en el bundle.)
export const OBJETIVOS_CICLO = /* @__PURE__ */ Object.freeze({
  interaccion: { nombre: "Interacción", meta: "OUTCOME_ENGAGEMENT", ayuda: "Conversaciones por WhatsApp, Messenger o Instagram: la venta se cierra hablando." },
  ventas: { nombre: "Ventas", meta: "OUTCOME_SALES", ayuda: "Compras en una tienda o una página con el píxel." },
  clientes: { nombre: "Clientes potenciales", meta: "OUTCOME_LEADS", ayuda: "Datos de contacto de quien quiere saber más: servicios de precio alto o con asesoría." },
  reconocimiento: { nombre: "Reconocimiento", meta: "OUTCOME_AWARENESS", ayuda: "Que la vea mucha gente cerca: una tienda física." },
});

/**
 * La pieza de cada etapa para cada tipo de negocio y destino: `contenido` (qué dice y cómo se ve), `artes` (ids de
 * TIPOS_ARTE, src/lib/tiposArte.js) y `lleva` (a dónde lleva el anuncio). Es la tabla del ciclo de ventas del curso
 * (módulo 2) escrita con palabras propias. La tabla no trae todas las combinaciones: las que faltan se DEDUCEN de la
 * más cercana (`deducido: true`, ver DEDUCIDOS) y dicen de cuál. Las variantes de una tienda web (educativa o de
 * productos personalizados) van como `<tipo>:<destino>:<variante>`.
 */
const WHATSAPP = "a WhatsApp";
export const CICLO_POR_NEGOCIO = /* @__PURE__ */ Object.freeze({
  "productos:whatsapp": {
    objetivo: "interaccion",
    etapas: {
      presentacion: { contenido: "Dar a conocer la marca con lo más vendido: el producto, para qué sirve y cómo se siente usarlo. Foto limpia con el nombre del producto de título.", artes: ["producto", "beneficios", "demostracion"], lleva: WHATSAPP },
      evaluacion: { contenido: "Un anuncio más largo para quien ya mostró interés: más detalles del producto y, de título, lo que dice un cliente contento.", artes: ["producto", "beneficios", "testimonio"], lleva: WHATSAPP },
      conversion: { contenido: "Sólo la experiencia de quien ya lo tiene: un carrusel de fotos reales de clientes, su testimonio de título y la garantía reforzada.", artes: ["testimonio", "promocion"], lleva: WHATSAPP },
      ascension: { contenido: "El segundo producto: el kit completo o la versión de más valor, con algo exclusivo para quien ya compró; de título, la experiencia de un cliente.", artes: ["producto", "promocion"], lleva: WHATSAPP },
    },
  },
  "productos:web": {
    objetivo: "ventas",
    etapas: {
      presentacion: { contenido: "La marca y lo más vendido (o la necesidad que resuelve) en un carrusel sencillo, con el nombre del producto y el envío gratis si lo hay.", artes: ["producto", "beneficios", "demostracion"], lleva: "a la página de inicio" },
      evaluacion: { contenido: "Un producto concreto con sus detalles en pocas palabras y el envío gratis.", artes: ["producto", "beneficios"], lleva: "a la página del producto" },
      conversion: { contenido: "A quien visitó o dejó algo en el carrito: un carrusel que le recuerda lo que vio, con más beneficios (envío y devolución sin costo).", artes: ["producto", "promocion"], lleva: "a los productos que ya vio" },
      ascension: { contenido: "La colección con lo nuevo, para quien ya compró, con lo que hace distinta a la marca.", artes: ["producto", "promocion"], lleva: "a la página de la colección" },
    },
  },
  "productos:web:educativo": {
    objetivo: "ventas",
    nota: "Tienda que vende enseñando: primero una clase gratis, luego los productos.",
    etapas: {
      presentacion: { contenido: "Un anuncio que enseña algo y lleva a una clase corta gratis (en una página que pide registrarse).", artes: ["educativo", "demostracion"], lleva: "a la clase gratis" },
      evaluacion: { contenido: "Varios productos con sus características y beneficios.", artes: ["producto", "beneficios"], lleva: "a la sección de productos" },
      conversion: { contenido: "Clientes felices y lo que ganaron.", artes: ["testimonio", "beneficios"], lleva: "a la página de un producto" },
      ascension: { contenido: "Lo nuevo o lo que complementa lo que ya compró; sirve para lo exclusivo o lo difícil de vender.", artes: ["producto", "promocion"], lleva: "a la página del producto" },
    },
  },
  "productos:web:personalizados": {
    objetivo: "ventas",
    nota: "Tienda de productos a la medida: un cuestionario recomienda qué le conviene a cada quien.",
    etapas: {
      presentacion: { contenido: "Plantea la necesidad e invita a un cuestionario que recomienda lo que le conviene.", artes: ["educativo", "aspiracional"], lleva: "al inicio, con el botón del cuestionario" },
      evaluacion: { contenido: "Un beneficio que nadie más da o una garantía difícil de rechazar.", artes: ["beneficios", "prensa"], lleva: "directo a los productos" },
      conversion: { contenido: "El más vendido, con sus beneficios y su garantía.", artes: ["producto", "testimonio"], lleva: "a ese producto" },
      ascension: { contenido: "Lo que complementa lo que ya compró, con un video de su producto.", artes: ["producto", "demostracion"], lleva: "a la página del producto" },
    },
  },
  "producto-nuevo:web": {
    objetivo: "ventas",
    nota: "Lo nuevo se vende por la solución, no por la marca: primero hay que explicar que existe.",
    etapas: {
      presentacion: { contenido: "Explica el problema y que ya existe una solución, con sus características, sin centrarse en la marca.", artes: ["educativo", "demostracion", "dividida"], lleva: "a la web, con toda la variedad" },
      evaluacion: { contenido: "Un carrusel de productos concretos con un título que invita a participar (cuál va contigo, cómo te verías con esto).", artes: ["producto", "aspiracional"], lleva: "a la sección de productos" },
      conversion: { contenido: "Un anuncio directo para la primera compra: descuento, promoción, un beneficio o la garantía.", artes: ["promocion", "testimonio"], lleva: "a la página del producto" },
      ascension: { contenido: "La invitación a una comunidad o a una aplicación con acceso a toda la gama.", artes: ["humano", "producto"], lleva: "a la comunidad o la aplicación" },
    },
  },
  "servicios:whatsapp": {
    objetivo: "interaccion",
    etapas: {
      presentacion: { contenido: "El problema y su solución: qué va a sentir o recibir, con un descuento o pocos cupos (sólo si es verdad).", artes: ["beneficios", "demostracion", "dividida"], lleva: WHATSAPP },
      evaluacion: { contenido: "Un texto más largo con detalles, los beneficios otra vez y un regalo para que lo prueben, sólo para quien ya mostró interés.", artes: ["beneficios", "testimonio", "prensa"], lleva: WHATSAPP },
      conversion: { contenido: "La misma imagen de la presentación con otro texto: un anuncio directo a quien ya preguntó, con un regalo más.", artes: ["promocion", "producto"], lleva: WHATSAPP },
      ascension: { contenido: "El servicio que complementa (el combo), con el texto ajustado a lo que más preguntan los clientes.", artes: ["promocion", "producto"], lleva: WHATSAPP },
    },
  },
  "segunda-necesidad:whatsapp": {
    objetivo: "interaccion",
    etapas: {
      presentacion: { contenido: "Crear la necesidad: el problema, hacerlo sentir y luego la solución con sus beneficios, en un video sencillo hablando a cámara, tipo selfie.", artes: ["humano", "demostracion"], lleva: WHATSAPP },
      evaluacion: { contenido: "Para quien ya la sigue: un diagnóstico gratis sólo para posibles clientes, en un anuncio corto.", artes: ["beneficios", "promocion"], lleva: WHATSAPP },
      conversion: { contenido: "El testimonio de un cliente que cuenta el problema y cómo se le resolvió, con sus palabras.", artes: ["testimonio"], lleva: WHATSAPP },
      ascension: { contenido: "El servicio que complementa, con sus beneficios y un descuento para clientes.", artes: ["promocion", "producto"], lleva: WHATSAPP },
    },
  },
  "servicios:web": {
    objetivo: "clientes",
    etapas: {
      presentacion: { contenido: "Texto corto y poca información en la imagen (casi un meme): la atención privada, cómoda y accesible de un profesional.", artes: ["humano", "beneficios"], lleva: "a la página del servicio" },
      evaluacion: { contenido: "En la página, una encuesta corta que recoge qué le interesa para enfocar la asesoría.", artes: ["educativo", "beneficios"], lleva: "a la encuesta" },
      conversion: { contenido: "Un video de testimonio y un llamado directo a hablar con el profesional.", artes: ["testimonio", "humano"], lleva: "a hablar con el profesional" },
      ascension: { contenido: "Un servicio nuevo para quien ya es cliente.", artes: ["producto", "promocion"], lleva: "a la página del servicio" },
    },
  },
  "suscripcion:web": {
    objetivo: "ventas",
    etapas: {
      presentacion: { contenido: "Un video sencillo con una frase que dice qué la hace distinta y una descripción corta.", artes: ["humano", "beneficios"], lleva: "a una página con la información exacta" },
      evaluacion: { contenido: "Por qué elegir la marca y las dudas resueltas, desde la experiencia del cliente, con una oferta.", artes: ["testimonio", "beneficios"], lleva: "a una página que cuenta la experiencia" },
      conversion: { contenido: "Un carrusel con la información detallada de los planes.", artes: ["producto", "beneficios"], lleva: "directo a la página de los planes" },
      ascension: { contenido: "Videos del plan mensual con una oferta de ahorro.", artes: ["promocion"], lleva: "a la página de los planes" },
    },
  },
  "nicho:web": {
    objetivo: "clientes",
    etapas: {
      presentacion: { contenido: "Una imagen sencilla con una descripción detallada, para quien ya sabe lo que busca.", artes: ["educativo", "prensa"], lleva: "a una página tipo artículo" },
      evaluacion: { contenido: "Una invitación directa a responder una encuesta, con lo que la hace distinta y su experiencia (confianza y cifras reales).", artes: ["prensa", "beneficios", "testimonio"], lleva: "a la encuesta" },
      conversion: { contenido: "Un recordatorio para volver a la página de la encuesta.", artes: ["producto", "testimonio"], lleva: "a la encuesta" },
      ascension: { contenido: "Otros servicios o asesorías parecidas, que responden a un miedo concreto.", artes: ["promocion", "producto"], lleva: "a la página de precios y planes" },
    },
  },
  "cursos:web": {
    objetivo: "ventas",
    nota: "Un curso no se vende por WhatsApp: quien lo compra quiere ver qué trae, en una página. Por debajo de 50 $ se vende directo, sin calentar; por encima de 80 $, con todas las etapas. Los cupos, siempre limitados (de verdad).",
    etapas: {
      // La tabla del curso sólo da reglas sueltas para los cursos: la presentación y la evaluación se deducen de que
      // un curso se vende enseñando y se compara por lo que trae.
      presentacion: { contenido: "Una clase corta o un consejo de valor que presenta el curso.", artes: ["educativo", "demostracion"], lleva: "a la página del curso" },
      evaluacion: { contenido: "Qué trae el curso (temario, horas, diploma) y quién lo enseña.", artes: ["educativo", "prensa", "beneficios"], lleva: "a la página del curso" },
      conversion: { contenido: "Testimonios de alumnos, siempre: es lo que mejor cierra un curso, con los cupos que quedan.", artes: ["testimonio", "promocion"], lleva: "a la página de pago" },
      ascension: { contenido: "Un curso más avanzado o más profundo para quien ya terminó.", artes: ["educativo", "promocion"], lleva: "a la página del curso siguiente" },
    },
  },
});

// Las combinaciones que la tabla del curso no trae, deducidas de la más parecida (`de`): la misma pieza en cada etapa,
// con su objetivo y a dónde lleva; cada una dice de cuál sale. Son DATOS y se arman al pedirlas (`baseDe`): una llamada
// o un acceso a la tabla aquí arriba haría que el bundle no la pudiera quitar de donde no se usa.
const DEDUCIDOS = /* @__PURE__ */ Object.freeze({
  "segunda-necesidad:web": { de: "segunda-necesidad:whatsapp", objetivo: "clientes", lleva: "a una página con un formulario",
    nota: "Deducido de segunda necesidad por WhatsApp: lo mismo, pero el diagnóstico gratis se pide con un formulario." },
  "suscripcion:whatsapp": { de: "suscripcion:web", objetivo: "interaccion", lleva: WHATSAPP,
    nota: "Deducido de suscripción en la web: la información de los planes se manda por mensaje." },
  "nicho:whatsapp": { de: "nicho:web", objetivo: "interaccion", lleva: WHATSAPP,
    nota: "Deducido de nicho en la web: las preguntas de la encuesta se hacen por mensaje." },
  "producto-nuevo:whatsapp": { de: "producto-nuevo:web", objetivo: "interaccion", lleva: WHATSAPP,
    nota: "Deducido de producto nuevo en la web: se explica igual, y la variedad se enseña por mensaje (el catálogo de WhatsApp)." },
});

/** La tabla de una combinación, de la del curso o deducida (cambia a dónde lleva cada etapa y el objetivo); o null. */
function baseDe(clave) {
  if (CICLO_POR_NEGOCIO[clave]) return CICLO_POR_NEGOCIO[clave];
  const d = DEDUCIDOS[clave];
  if (!d) return null;
  const etapas = CICLO_POR_NEGOCIO[d.de].etapas;
  return { objetivo: d.objetivo, deducido: true, nota: d.nota, etapas: Object.fromEntries(Object.entries(etapas).map(([k, e]) => [k, { ...e, lleva: d.lleva }])) };
}

/**
 * El ciclo de un negocio: por etapa, qué pieza va, con qué tipos de arte, a dónde lleva y si toca ya (una cuenta
 * NUEVA arranca sólo con presentación y evaluación). Un tipo o un destino que no se conoce vale productos por
 * WhatsApp; un curso por WhatsApp pasa a la web (no se venden por mensaje) y lo dice en `nota`. `variante`
 * («educativo», «personalizados») sólo existe para productos en la web. → { tipo, destino, variante, objetivo,
 * nombreObjetivo, objetivoMeta, nota, deducido, etapas: [{ id, nombre, niveles, reparto, contenido, artes, lleva,
 * ahora }] }. Pura.
 */
export function cicloDe(tipoNegocio, destino, { variante = "", cuenta = "" } = {}) {
  const tipo = tipoNegocioDe(tipoNegocio)?.id ?? "productos";
  let dest = destinoNegocioDe(destino)?.id ?? "whatsapp";
  const notas = [];
  if (tipo === "cursos" && dest === "whatsapp") {
    dest = "web";
    notas.push("Los cursos no se venden por WhatsApp: el anuncio lleva a la página del curso.");
  }
  const conVariante = variante ? `${tipo}:${dest}:${variante}` : "";
  const clave = conVariante && CICLO_POR_NEGOCIO[conVariante] ? conVariante : `${tipo}:${dest}`;
  const base = baseDe(clave) ?? CICLO_POR_NEGOCIO["productos:whatsapp"];
  if (base.nota) notas.unshift(base.nota);
  const nueva = cuenta === "nueva";
  const objetivo = OBJETIVOS_CICLO[base.objetivo];
  return {
    tipo, destino: dest, variante: clave === conVariante ? variante : "",
    objetivo: base.objetivo, nombreObjetivo: objetivo.nombre, objetivoMeta: objetivo.meta,
    nota: notas.join(" "), deducido: Boolean(base.deducido),
    etapas: ETAPAS_CICLO.map((e) => ({
      id: e.id, nombre: e.nombre, niveles: e.niveles, reparto: e.reparto,
      ...base.etapas[e.id], artes: [...base.etapas[e.id].artes],
      // Una cuenta nueva no tiene públicos para conversión ni ascensión: primero presentación y evaluación.
      ahora: !nueva || e.id === "presentacion" || e.id === "evaluacion",
    })),
  };
}
