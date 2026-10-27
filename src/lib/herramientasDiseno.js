// ============================================================
// Las herramientas de DISEÑO del asistente (el director creativo)
//
// Aparte de api.js a propósito: api.js va en el bundle principal y esto
// sólo lo necesita el chat (ChatPanel, lazy). Lo que hacen vive en
// lib/disenoChat.js; cómo diseña, en lib/director.js.
// ============================================================

/** Sólo con un cliente abierto: diseñar, corregir, la versión final y ver lo que funciona. */
export const HERRAMIENTAS_DISENO = Object.freeze([
    {
      name: "disenar_piezas",
      description: "Diseña de 1 a 12 piezas de imagen con diseño gráfico (posts, historias, portadas, anuncios) para este cliente, una FICHA DE DISEÑO cada una. La persona ve las fichas y el costo y aprueba con un botón (no le pidas el «sí» antes). Al terminar recibes cada imagen para revisarla.",
      input_schema: {
        type: "object",
        properties: {
          concepto: { type: "string", description: "La idea que une la tanda y su sistema visual, en 1 o 2 frases." },
          carrusel: { type: "boolean", description: "true si las piezas son las láminas de UN carrusel, en su orden (portada primero): quedan agrupadas en la galería como un carrusel. Todas en formato vertical 4:5." },
          piezas: {
            type: "array",
            minItems: 1,
            maxItems: 12,
            items: {
              type: "object",
              properties: {
                titulo: { type: "string", description: "Nombre corto de la pieza (para la tarjeta)." },
                ficha: { type: "string", description: "La ficha de diseño completa, una línea por apartado: Pieza, Composición, Fondo, Imagen principal, Texto (exacto, entre «»), Marca, Evitar." },
                formato: { type: "string", enum: ["vertical", "story", "square", "horizontal"], description: "vertical 4:5 (post del feed, por defecto), story 9:16 (historia o reel), square 1:1, horizontal 16:9." },
                post_id: { type: "string", description: "La publicación del calendario a la que va (opcional): se pone en ella al salir." },
                estilo: { type: "string", enum: ["anuncio", "beneficios", "servicios", "educativo", "diferenciador", "maletas", "humano"], description: "El tipo de contenido (opcional)." },
                plantilla_id: { type: "string", description: "El id de una plantilla del kit a seguir (opcional)." },
              },
              required: ["titulo", "ficha"],
            },
          },
        },
        required: ["piezas"],
      },
    },
    {
      name: "corregir_pieza",
      description: "Corrige un DETALLE de una imagen ya creada editándola (una letra, el tamaño del titular, un color, quitar algo). La de antes se queda en la galería y la nueva ocupa su sitio en la publicación.",
      input_schema: {
        type: "object",
        properties: {
          archivo_id: { type: "string", description: "El id de la imagen (el que te devolvió disenar_piezas) o su clave («En la imagen clientes/…» de la persona)." },
          indicacion: { type: "string", description: "Qué cambiar, concreto y con medidas: «donde dice X debe decir Y», «el titular baja al 10–24 % de la altura», «el precio el doble de grande»." },
          igual_a: { type: "string", description: "Opcional: el id de otra pieza de la MISMA serie que quedó bien; el texto de ésta se pone en su misma posición y tamaño. Con esto, la indicación puede ir vacía." },
        },
        required: ["archivo_id"],
      },
    },
    {
      name: "version_final",
      description: "Rehace una imagen escogida con el mejor modelo que tenga llave (Nano Banana Pro o GPT Image), con su misma ficha y en alta resolución. Úsala cuando la persona escoja las buenas. La nueva ocupa el sitio de la anterior en la publicación.",
      input_schema: {
        type: "object",
        properties: { archivo_id: { type: "string", description: "El id de la imagen." } },
        required: ["archivo_id"],
      },
    },
    {
      name: "guardar_regla",
      description: "Guarda una regla de diseño en el kit del cliente («Reglas que no se rompen»): va sola en TODAS las piezas siguientes. Sólo cuando la persona lo pida o acepte tu propuesta (por ejemplo, tras corregir lo mismo dos veces).",
      input_schema: {
        type: "object",
        properties: { regla: { type: "string", description: "Una frase corta y concreta: «El precio siempre en amarillo y grande, abajo a la derecha»." } },
        required: ["regla"],
      },
    },
    {
      name: "ver_lo_que_funciona",
      description: "Las plantillas guardadas y las imágenes que le gustaron a la agencia de este cliente (las ves), y si tiene kit de marca. Míralo antes de la primera tanda de la conversación.",
      input_schema: { type: "object", properties: {} },
    },
]);
