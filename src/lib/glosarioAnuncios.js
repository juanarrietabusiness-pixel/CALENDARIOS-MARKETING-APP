// ============================================================
// «¿Qué es esto?»: cada término de los anuncios explicado sin jerga (puro y pequeño)
//
// Decisión de la agencia (14-nov): lo tiene que entender alguien con conocimiento básico o intermedio, a simple vista.
// Cada término (número mágico, equilibrio, fase de aprendizaje, efecto desglose, CTR único, % de mensajes…) lleva su
// explicación JUNTO a donde aparece —un «¿Qué es esto?» que se despliega—, nunca sólo en un `title` (no se ve en el
// teléfono). Lo leen la revisión 3Q, la ficha de los números del negocio, «Para pautar» y «Revisar las campañas».
// ============================================================

export const GLOSARIO = Object.freeze({
  numeroMagico: "Lo máximo que el cliente puede pagar por un resultado (una conversación, una compra) y seguir ganando dinero. Sale de sus números: cuánto deja cada venta, qué parte decidió invertir y de cada cuántas conversaciones sale una venta. Es el mismo para todas las campañas y todas las etapas.",
  equilibrio: "El punto en que ni se gana ni se pierde. Si un resultado cuesta más que esto, la publicidad pierde dinero.",
  roasEquilibrio: "Cuántas veces hay que vender lo invertido en anuncios para no perder: por debajo, se pierde dinero aunque se venda.",
  tasaCierre: "De cada 100 personas que escriben, cuántas acaban comprando. Mientras no se mide con las ventas reales, se usa la de por defecto (5 de cada 100).",
  aprendizaje: "Los primeros días de algo nuevo o cambiado, Meta prueba a quién mostrárselo. Sus cifras todavía no dicen nada y tocarlo lo hace empezar de cero: se espera.",
  desglose: "Meta reparte el presupuesto de un conjunto entre sus anuncios como le conviene. Si el conjunto va bien, sus anuncios no se tocan aunque uno se vea peor: cambiar uno altera el conjunto entero.",
  ctrUnico: "De cada 100 personas que ven el anuncio, cuántas dan clic (cada persona cuenta una vez). Bajo, la pieza o la primera línea no llaman la atención.",
  pctMensajes: "De cada 100 personas que dan clic, cuántas llegan a escribir por WhatsApp. Bajo, algo entre el clic y el mensaje hace dudar.",
  tasa3s: "De cada 100 veces que se muestra un video, cuántas se quedan a ver los primeros 3 segundos. Bajo, el comienzo del video no engancha.",
  tiempoVideo: "Cuántos segundos se queda de media la gente viendo el video. Bajo, el guion o la edición pierden a la gente.",
  frecuencia: "Cuántas veces vio el mismo anuncio cada persona en una semana. Muy alta, la gente se cansa y deja de responder.",
  cpm: "Lo que cuesta mostrar el anuncio mil veces. Si sube mucho frente a su mes, el público se está agotando o es muy chico.",
  cbo: "El presupuesto lo lleva la campaña entera y Meta lo reparte entre sus conjuntos: entonces se juzga la campaña completa.",
  roas: "Cuántas veces se recupera lo invertido en anuncios: ventas ÷ inversión. Si inviertes 100 y vendes 400, el ROAS es 4. Lo que importa es que quede por encima del ROAS de equilibrio.",
  etapa: "En qué punto de la compra está la gente a la que le habla la campaña: Presentación (no te conoce), Evaluación (te vio y compara), Conversión (ya te escribió) o Ascensión (ya te compró).",
  margen: "Lo que le queda al negocio de cada venta después de pagar lo que cuesta el producto, el envío y las comisiones, sin el impuesto y sin las devoluciones.",
  bruto: "Meta reporta las ventas en bruto: con el ITBMS y sin descontar devoluciones. Por eso el equilibrio ya los descuenta: un ROAS que en Meta parece bueno puede estar perdiendo dinero.",
  ritmo: "Si el gasto del mes va al paso que pide el plan: lo que se planeó para el mes, repartido por los días que ya pasaron. Si va muy adelantado, el dinero se acaba antes de fin de mes; si va atrasado, algo no está entregando.",
  destino: "A dónde lleva el anuncio: el WhatsApp del cliente o su web. Si la gente sigue dando clic como siempre pero llegan menos conversaciones, el anuncio funciona y lo que falla está después del clic.",
  cansado: "Un anuncio se cansa cuando la gente que lo ve ya lo conoce y le da clic cada vez menos. Se nota en que su CTR baja día a día frente a sus primeros días. Se renueva con una versión nueva de la pieza.",
  formato: "Video, imagen o carrusel. Meta le da más dinero al formato que mejor le funciona; si casi todo va a uno, no se sabe si los otros venderían más barato.",
  pocosDatos: "Con pocos resultados, un anuncio puede parecer bueno o malo por suerte. Hacen falta unos 50 resultados para concluir con confianza; antes, lo que dice la revisión es una pista.",
  semanaAnterior: "Los 7 días anteriores a los últimos 7: se compara con un periodo del mismo largo para no confundir un mes entero con una semana.",
});

/** Cómo se nombra cada término en la pantalla (para el «¿Qué es…?»). */
export const NOMBRE_TERMINO = Object.freeze({
  numeroMagico: "el número mágico", equilibrio: "el equilibrio", roasEquilibrio: "el ROAS de equilibrio", tasaCierre: "la tasa de cierre",
  aprendizaje: "la fase de aprendizaje", desglose: "el efecto desglose", ctrUnico: "el CTR único", pctMensajes: "el % de mensajes",
  tasa3s: "la tasa de 3 segundos", tiempoVideo: "el tiempo de reproducción", frecuencia: "la frecuencia", cpm: "el CPM",
  cbo: "el presupuesto de campaña", roas: "el ROAS", etapa: "la etapa", margen: "el margen", bruto: "«en bruto»",
  ritmo: "el ritmo de gasto", destino: "el destino", cansado: "un anuncio cansado", formato: "el formato",
  pocosDatos: "«pocos datos»", semanaAnterior: "«7 días antes»",
});
