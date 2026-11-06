// ============================================================
// Las herramientas del NAVEGADOR que se le declaran al asistente
//
// Viven fuera de api.js a propósito: api.js va en la carga inicial (que
// está en su tope) y esto sólo lo usa el asistente, que se carga aparte.
// Lo que no está declarado aquí no existe para la IA: mira esto antes de
// tocar el prompt cuando diga «no puedo».
// ============================================================

import { herramientaGuardarEnCerebro } from "../api.js";
import { PROPIEDADES_FECHA_TAREA } from "./agenda.js";

export function getChatTools(hasCalendar) {
  const tools = [
    herramientaGuardarEnCerebro(),
    {
      name: "borrar_memoria",
      description: "Borra una de las memorias de antes (las que llevan su id entre corchetes) que ya no aplica o que piden olvidar.",
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string", description: "El id de la memoria, el que va entre corchetes." },
        },
        required: ["id"],
      },
    },
  ];

  tools.push(
    {
      name: "crear_tarea",
      description: "Crea una tarea para el cliente actual. Útil cuando el usuario menciona algo pendiente, un entregable o un paso que debe recordar.",
      input_schema: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título de la tarea." },
          descripcion: { type: "string", description: "Descripción o detalle de la tarea (opcional)." },
          ...PROPIEDADES_FECHA_TAREA,
          asignada_a: { type: "string", description: "Nombre de la persona asignada (opcional)." },
        },
        required: ["titulo"],
      },
    },
    {
      name: "agregar_banco_ideas",
      description: "Guarda una idea o una referencia (enlace de un video) en el banco de ideas de la agencia, para usarla después. Necesita la idea o el enlace.",
      input_schema: {
        type: "object",
        properties: {
          idea: { type: "string", description: "Concepto de la publicación, o qué tiene de bueno la referencia." },
          enlace: { type: "string", description: "El enlace de la referencia (https://…), si lo hay." },
          general: { type: "boolean", description: "true: sin empresa, sale en el banco de todos los clientes. Por defecto, de este cliente." },
          formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Formato sugerido." },
          descripcion: { type: "string", description: "Caption/descripción sugerida (opcional)." },
          guion: { type: "string", description: "Guion sugerido (opcional)." },
        },
      },
    },
  );

  if (hasCalendar) {
    tools.push(
      {
        name: "crear_publicacion",
        description: "Crea una nueva publicación en un día del calendario (AAAA-MM-DD). El día NO tiene que tener publicaciones ya: cualquier día del mes vale. Si la fecha es de otro mes, se crea en el calendario de ese mes. Para varias, llámala una vez por publicación.",
        input_schema: {
          type: "object",
          properties: {
            fecha: { type: "string", description: "Fecha en formato AAAA-MM-DD." },
            formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Formato de la publicación." },
            idea: { type: "string", description: "Idea o concepto de la publicación." },
            descripcion: { type: "string", description: "Caption/descripción lista para publicar." },
            guion: { type: "string", description: "Guion para reels, carruseles, historias o lives." },
            hora: { type: "string", description: "Hora de publicación. Se entiende «9am», «9:00», «21:30» o «6 pm»." },
          },
          required: ["fecha", "formato"],
        },
      },
      {
        name: "editar_publicacion",
        description: "Edita campos de una publicación existente. Necesitas el ID de la publicación (visible en el contexto del calendario).",
        input_schema: {
          type: "object",
          properties: {
            post_id: { type: "string", description: "ID de la publicación a editar." },
            idea: { type: "string", description: "Nueva idea." },
            descripcion: { type: "string", description: "Nueva descripción/caption." },
            guion: { type: "string", description: "Nuevo guion." },
            texto_pieza: { type: "string", description: "Lo que va ESCRITO encima del diseño (no el caption): titular, frase de apoyo y precio del catálogo, una línea cada uno." },
            titulo: { type: "string", description: "Nuevo título (cómo se llama en el calendario)." },
            hashtags: { type: "string", description: "Nuevos hashtags, separados por espacios (#uno #dos)." },
            escena: { type: "string", description: "Nuevo «Qué se ve»: la escena de la imagen, sin texto dentro." },
            formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Nuevo formato." },
            hora: { type: "string", description: "Hora de publicación. Se entiende «9am», «9:00», «21:30» o «6 pm». Escribe «quitar» para dejarla sin asignar." },
            pauta: {
              description: "Si se va a pautar en Meta: { etapa, como } para marcarla (su caption se escribe como ANUNCIO: en el Ads Manager ya no se cambia) o false para quitarla. etapa: presentacion (no conoce la marca), evaluacion (la compara), conversion (está por decidir) o ascension (ya compró); como: publicacion (se monta con la publicación), anuncio (subiendo la pieza) o vacío (las dos). Sólo si la persona lo pide.",
              anyOf: [
                {
                  type: "object",
                  properties: {
                    etapa: { type: "string", enum: ["presentacion", "evaluacion", "conversion", "ascension"] },
                    como: { type: "string", enum: ["publicacion", "anuncio", ""] },
                  },
                  required: ["etapa"],
                },
                { type: "boolean" },
              ],
            },
          },
          required: ["post_id"],
        },
      },
      {
        name: "eliminar_publicaciones",
        description: "Elimina una o varias publicaciones del calendario. Pide confirmación al usuario antes de usar esta herramienta.",
        input_schema: {
          type: "object",
          properties: {
            post_ids: {
              type: "array",
              items: { type: "string" },
              description: "Lista de IDs de las publicaciones a eliminar.",
            },
          },
          required: ["post_ids"],
        },
      },
      {
        name: "editar_publicaciones_lote",
        description: "Edita muchas publicaciones a la vez. Dos formas, y se pueden combinar: `aplicar_a_todas` pone los MISMOS valores en todas las que pasen el filtro —para «pon las 9am a todos los lunes» o «marca como aprobados todos los reels»—, y `cambios` da valores DISTINTOS a cada publicación por su ID —para reescribir textos, que son diferentes en cada una—.",
        input_schema: {
          type: "object",
          properties: {
            filtro_dia: {
              type: "string",
              enum: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
              description: "Filtrar por día de la semana (opcional).",
            },
            filtro_formato: {
              type: "string",
              enum: ["post", "reel", "carrusel", "historia", "live"],
              description: "Filtrar por formato (opcional).",
            },
            filtro_semana: {
              type: "integer",
              description: "Filtrar por número de semana del mes, tal como aparece en el contexto (opcional).",
            },
            aplicar_a_todas: {
              type: "object",
              properties: {
                hora: { type: "string", description: "Hora de publicación: «9am», «9:00», «21:30», «6 pm». Escribe «quitar» para dejarla sin asignar." },
                formato: { type: "string", enum: ["post", "reel", "carrusel", "historia", "live"], description: "Formato para todas." },
              },
              description: "Los MISMOS valores para todas las publicaciones que pasen el filtro. Requiere al menos un filtro: sin filtro no se aplica nada, para no tocar el mes entero por accidente.",
            },
            cambios: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  post_id: { type: "string", description: "ID de la publicación." },
                  idea: { type: "string", description: "Nueva idea." },
                  descripcion: { type: "string", description: "Nueva descripción/caption." },
                  guion: { type: "string", description: "Nuevo guion." },
                  hora: { type: "string", description: "Hora de publicación para esta publicación en concreto." },
                },
                required: ["post_id"],
              },
              description: "Valores distintos para cada publicación, por ID. Para textos, que no se repiten.",
            },
          },
        },
      },
    );
  }

  // Fuera del `if`: una imagen para el chat no necesita calendario.
  tools.push({
    name: "generar_imagen",
    description: "Crea una imagen (o un video, con tipo «video») con IA y la ENTREGA EN EL CHAT, donde el usuario la ve y la descarga. Con un cliente abierto la hace el Estudio con su kit de marca (logo, paleta, fotos del producto) y su modelo. Úsala siempre que pidan una imagen o un video. Si también piden ponerla en una publicación del calendario, pasa post_id. Si la agencia fijó «crear sin preguntar» (Ajustes → IA), una imagen con el modelo del cliente dentro de su tope sale a la primera; si la respuesta dice NO SE CREÓ NADA, pregunta con la cifra.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Descripción detallada de lo que debe mostrar la imagen: sujeto, composición, estilo, colores, luz y, si lo piden, el texto exacto que debe llevar." },
        formato_imagen: {
          type: "string",
          enum: ["square", "vertical", "story", "horizontal"],
          description: "Tamaño: square (1080×1080, post), vertical (1080×1350, post de feed alto), story (1080×1920, historia o reel), horizontal (1200×630, portada o anuncio web). Elige el que corresponda a lo que pidan; por defecto square.",
        },
        post_id: { type: "string", description: "ID de una publicación del calendario a la que además asignarla (opcional)." },
        tipo: { type: "string", enum: ["imagen", "video"], description: "imagen (por defecto) o video. Un video sólo con un cliente abierto, y tarda unos minutos." },
        estilo: {
          type: "string",
          enum: ["anuncio", "beneficios", "servicios", "educativo", "diferenciador", "maletas", "humano"],
          description: "El tipo de contenido de la pieza (el del día o el de la publicación): pone el preset de ese tipo del kit de marca. Opcional.",
        },
        modelo: { type: "string", description: "Opcional: el ID de OTRO modelo (de ver_estudio) que sugieres en vez del del cliente. Sólo si de verdad conviene (un texto exacto largo que el suyo escribe mal, una proporción que no hace), con motivo_modelo: se le pregunta a la persona." },
        motivo_modelo: { type: "string", description: "Por qué sugieres ese modelo, en una frase corta: se le enseña a la persona." },
        confirmado: { type: "boolean", description: "Sólo true si el usuario ya dijo que sí al costo que le dijiste. Nunca lo pongas por tu cuenta." },
      },
      required: ["prompt"],
    },
  });

  return tools;
}
