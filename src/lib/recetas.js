// ============================================================
// Las RECETAS: el CÓMO de una pieza empaquetado, para que la agencia sólo escoja el QUÉ
//
// Una receta es un DATO, no código: un método escrito (en markdown) que lee quien diseña —el asistente de la
// aplicación o Claude en claude.ai por el conector— con las herramientas que ya existen (guia_de_diseno,
// disenar_piezas, estado_encargo, crear_video…). Las de la casa viven aquí; las que la agencia CAMBIA o crea, en D1
// (`recetas`, worker/rutas/recetas.js), y una fila con el id de una de la casa la sustituye, como las plantillas de
// plan (plantillasPlan.js).
//
// «Crear con Claude» guarda el pedido (el cliente, la publicación, las referencias de la galería, lo que se pidió) en un
// HANDOFF de un día y abre claude.ai con un mensaje corto («/receta foto-heroe · Feria del Lente · HANDOFF: …»): Claude lo
// canjea con la herramienta `receta` y sigue el método con lo del cliente. Lo paga la suscripción de Claude.
//
// Los métodos son de la agencia, escritos con sus palabras: Higgsfield publica los suyos sin licencia y no se copian.
// Puro: lo importan la pantalla y el Worker.
// ============================================================

export const SALIDAS_RECETA = Object.freeze({
  imagen: "Imagen",
  carrusel: "Carrusel",
  video: "Video con IA",
  animado: "Video animado",
  guion: "Guion para grabar",
});

export const MAX_RECETAS = 40;
export const MAX_INSTRUCCIONES = 5_000;
const MAX_PREGUNTAS = 3;
const MAX_CONTROLES = 8;
const ID = /^[a-z0-9][a-z0-9-]{1,59}$/;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const largo = (t, n) => String(t ?? "").replace(/\r/g, "").trim().slice(0, n);
const lista = (x, max, n) => (Array.isArray(x) ? x.map((s) => corto(s, n)).filter(Boolean).slice(0, max) : []);

/** Lo que se hace siempre al final, con cualquier receta de imagen. */
const CIERRE_IMAGEN = [
  "Cuando salgan: estado_encargo y MIRA cada pieza (el texto letra por letra, que se lea en un teléfono, el logo, el producto). Lo que no esté bien, corregir_pieza con una orden concreta y con medidas.",
  "Si es para una publicación del calendario, ponla con poner_en_publicacion (sin volver a crear nada).",
].join("\n");

/** Las recetas de la casa. Las de la agencia, en D1, se suman o las sustituyen por su id. */
export const RECETAS_CASA = Object.freeze([
  {
    id: "pieza-del-post",
    titulo: "La pieza de una publicación",
    descripcion: "Diseña la imagen de una publicación del calendario con su idea, su texto y el kit del cliente, y la deja puesta.",
    salida: "imagen",
    tipos: [],
    preguntas: ["¿Qué publicación es? (si no viene en el pedido)"],
    controles: ["El texto de la pieza, exacto", "Nada de precios ni promesas que no estén en el catálogo", "El producto real, si sale"],
    instrucciones: [
      "1. Lee la guía del cliente con guia_de_diseno (manual, kit, catálogo y lo que la agencia corrige) y mira sus imágenes.",
      "2. Lee la publicación (ver_calendario si no viene en el pedido): su idea, su tipo, su texto de la pieza y su producto.",
      "3. Escribe UNA ficha completa con el formato de la guía, con el texto de la pieza tal cual y la foto descrita como la haría un fotógrafo.",
      "4. disenar_piezas con su post_id (y los ids de sus productos): enseña el plan y el costo, y crea sólo con el «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "foto-heroe",
    titulo: "Foto héroe del producto",
    descripcion: "El producto real como protagonista, con luz de estudio o en su sitio, para un anuncio o una pieza de producto.",
    salida: "imagen",
    tipos: ["anuncio", "servicios"],
    preguntas: ["¿Qué producto del catálogo?", "¿En estudio (fondo liso) o en su sitio (en uso)?"],
    controles: ["El producto idéntico a sus fotos: forma, etiqueta, colores", "El precio, el del catálogo", "Sin otras marcas"],
    instrucciones: [
      "1. guia_de_diseno del cliente. El producto sale del CATÁLOGO, con sus fotos reales (sus ids en «productos»).",
      "2. Dos variantes de UNA ficha cada una, con composiciones distintas: el producto entre el 45 y el 70 % de la pieza; la superficie, la luz (de dónde viene, cómo es la sombra) y el lente dichos como un fotógrafo de producto; un solo gesto expresivo (un reflejo, un ángulo bajo, un color de fondo de la paleta).",
      "3. El titular habla del resultado, no del producto; el precio exacto sólo si está en el catálogo.",
      "4. disenar_piezas con las dos: plan, costo, «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "oferta-clara",
    titulo: "Anuncio con la oferta",
    descripcion: "Una promoción que se entiende en dos segundos: el beneficio o el número enorme, el producto acompaña.",
    salida: "imagen",
    tipos: ["beneficios", "anuncio"],
    preguntas: ["¿Cuál es la oferta exacta y hasta cuándo vale?"],
    controles: ["La oferta y la fecha, tal cual las dijo la agencia o el catálogo", "Nada de urgencias inventadas"],
    instrucciones: [
      "1. guia_de_diseno. Si la oferta no está en el pedido ni en el catálogo, PREGÚNTALA: nunca la inventes.",
      "2. Una ficha: la oferta es el titular y lo más grande (entre el 12 y el 20 % de la altura); el producto real acompaña; el color de acento sólo en la oferta y el botón; la fecha límite sólo si es real.",
      "3. Un formato por destino: post 4:5 y, si se pide, historia 9:16 con la misma oferta (zona segura: libres el 14 % de arriba y el 20 % de abajo).",
      "4. disenar_piezas: plan, costo, «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "educativo-guardable",
    titulo: "Educativo para guardar",
    descripcion: "Un consejo útil de su rubro en una pieza tipográfica limpia, de las que la gente guarda.",
    salida: "imagen",
    tipos: ["educativo"],
    preguntas: ["¿Qué consejo o qué duda del cliente responde?"],
    controles: ["El dato, del cerebro del cliente (Saber del rubro) o dicho por la agencia", "Sin botón de compra"],
    instrucciones: [
      "1. guia_de_diseno y buscar_cerebro del cliente sobre el tema (el consejo sale de lo que sabe la marca, nunca inventado).",
      "2. Una ficha TIPOGRÁFICA: el titular es la promesa útil («3 señales de…»), el contenido en 3 puntos de una línea, fondo de un color de la paleta, un icono o una foto pequeña sólo si ayuda. Sin producto, salvo que sea el ejemplo.",
      "3. Si son más de 3 puntos, es un carrusel: usa la receta «Carrusel paso a paso».",
      "4. disenar_piezas: plan, costo, «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "carrusel-paso-a-paso",
    titulo: "Carrusel que se lee entero",
    descripcion: "De 5 a 7 láminas con una estructura (errores comunes, mito o realidad, paso a paso…) y el mismo sistema en todas.",
    salida: "carrusel",
    tipos: ["educativo", "diferenciador", "maletas"],
    preguntas: ["¿De qué trata y qué estructura (errores, mitos, paso a paso, antes y después)?"],
    controles: ["El titular en la misma zona y del mismo tamaño en todas", "Cada lámina, una idea", "El cierre invita a actuar"],
    instrucciones: [
      "1. guia_de_diseno. Escoge la estructura y escribe el guion: la portada promete algo concreto, cada lámina del medio cuenta UNA idea, el cierre invita a actuar.",
      "2. El SISTEMA de la serie con medidas: dónde va el titular y de qué tamaño, los márgenes, el fondo y el logo, iguales en todas.",
      "3. disenar_piezas con carrusel=true y la ficha de cada lámina (o sólo el tema, y lo diseña el director): plan, costo, «sí».",
      "4. Mira cada lámina; la que se salga del sistema, corregir_pieza con igual_a la portada.",
      "5. Ponlo en su publicación con poner_en_publicacion (carrusel_id).",
    ].join("\n"),
  },
  {
    id: "antes-y-despues",
    titulo: "Antes y después",
    descripcion: "El cambio que logra el producto o el servicio, en pantalla dividida. Sólo con un caso real.",
    salida: "imagen",
    tipos: ["maletas", "diferenciador"],
    preguntas: ["¿Hay fotos reales del antes y del después? (sin ellas no se hace)"],
    controles: ["Nada inventado: ni resultados, ni personas, ni cifras", "Las dos mitades con la misma luz y el mismo encuadre"],
    instrucciones: [
      "1. Sin fotos reales del caso (en la galería del cliente) NO se hace: un antes y después inventado engaña y Meta lo rechaza. Pídelas.",
      "2. guia_de_diseno; mira las fotos con ver_pieza.",
      "3. Una ficha en pantalla dividida (izquierda antes, derecha después) con las fotos de referencia, una etiqueta corta en cada mitad y el titular arriba.",
      "4. disenar_piezas con las fotos en «referencias»: plan, costo, «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "recrear-referencia",
    titulo: "Una referencia, con mi marca",
    descripcion: "Toma la IDEA de una pieza que gustó (de la competencia o de inspiración) y hace una versión propia que no se reconoce como copia.",
    salida: "imagen",
    tipos: [],
    preguntas: ["¿Qué referencia de la galería? (si no viene en el pedido)", "¿De qué producto del cliente?"],
    controles: ["Nada de su producto, su texto, su marca ni su logo", "Que no se reconozca como copia"],
    instrucciones: [
      "1. Mira la referencia con ver_pieza y di en una frase qué la hace funcionar (el gancho, el ángulo, el tipo de composición).",
      "2. guia_de_diseno del cliente. Escribe una ficha PROPIA con esa idea y otra distribución, otro encuadre y otro fondo: el producto del catálogo del cliente y sus colores.",
      "3. La referencia NO va al motor de imagen (la copiaría): la idea va en la ficha.",
      "4. disenar_piezas: plan, costo, «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "tarjeta-beneficios",
    titulo: "Tarjeta: 4 beneficios con icono",
    descripcion: "Una sola imagen que se lee de un vistazo: el titular y cuatro beneficios reales, cada uno con su icono.",
    salida: "imagen",
    tipos: ["beneficios", "servicios", "diferenciador"],
    preguntas: ["¿De qué producto o servicio son los beneficios?"],
    controles: ["Cada beneficio, del catálogo o del cerebro (ninguno inventado)", "Los cuatro iconos del mismo estilo", "Cada línea de 3 a 6 palabras"],
    instrucciones: [
      "1. guia_de_diseno y buscar_cerebro: los beneficios salen del catálogo y del estudio de mercado del producto, con sus palabras.",
      "2. Una ficha en retícula: el titular arriba (del 6 al 20 % de la altura), cuatro filas o una cuadrícula de 2 × 2 con un icono lineal sencillo del mismo grosor y un beneficio de 3 a 6 palabras cada uno, el producto real pequeño o en una esquina si ayuda; fondo de un color de la paleta, mucho contraste.",
      "3. Los iconos se describen uno por uno (qué dibuja cada uno): «un icono de reloj», no «iconos bonitos».",
      "4. disenar_piezas: plan, costo, «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "ficha-tecnica",
    titulo: "Ficha técnica del producto",
    descripcion: "El producto real con sus datos clave señalados (medidas, material, qué incluye), como una hoja de especificaciones bonita.",
    salida: "imagen",
    tipos: ["servicios", "anuncio"],
    preguntas: ["¿Qué producto del catálogo?"],
    controles: ["Cada dato, del catálogo (ninguna medida inventada)", "El producto idéntico a sus fotos"],
    instrucciones: [
      "1. guia_de_diseno; el producto del CATÁLOGO con sus fotos (ids en «productos») y sus datos. Si faltan datos, pregúntalos: nunca inventes una medida ni un material.",
      "2. Una ficha: el producto real al centro (50–60 %) sobre un fondo liso de la paleta; de 3 a 5 datos alrededor, cada uno con una línea fina que señala la parte de la que habla; el nombre del producto arriba y el precio exacto abajo si está.",
      "3. disenar_piezas: plan, costo, «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "mito-o-realidad",
    titulo: "Mito o realidad (una imagen)",
    descripcion: "Una creencia común de su rubro, desmentida en una sola pieza: el mito tachado y la realidad en grande.",
    salida: "imagen",
    tipos: ["educativo"],
    preguntas: ["¿Qué mito? (si no lo sabes, propón tres del rubro y que escojan)"],
    controles: ["La realidad, con fuente en el cerebro (Saber del rubro) o dicha por la agencia", "Sin alarmar"],
    instrucciones: [
      "1. buscar_cerebro del cliente (Saber del rubro): el mito y su respuesta salen de ahí o de la agencia.",
      "2. Una ficha tipográfica en dos zonas: arriba «MITO» con la frase tachada en un tono apagado; abajo «REALIDAD» con la respuesta corta en grande y el color de acento; un icono o una foto pequeña sólo si ayuda.",
      "3. disenar_piezas: plan, costo, «sí».",
      CIERRE_IMAGEN,
    ].join("\n"),
  },
  {
    id: "pack-anuncios",
    titulo: "Pack de anuncios por ubicación",
    descripcion: "El mismo anuncio en feed (4:5), historias y reels (9:16) y cuadrado (1:1), con su texto para Meta: listo para «Nueva campaña».",
    salida: "imagen",
    tipos: ["anuncio", "beneficios"],
    preguntas: ["¿Qué producto y qué oferta o ángulo?", "¿A quién le habla (de los perfiles del estudio de mercado)?"],
    controles: ["El mismo mensaje en los tres formatos", "En 9:16, libres el 14 % de arriba y el 20 % de abajo", "El texto de Meta sin promesas que no estén en el catálogo"],
    instrucciones: [
      "1. guia_de_diseno; el producto del catálogo con sus fotos; el ángulo, del estudio de mercado del producto si lo hay.",
      "2. Tres fichas del MISMO concepto, una por formato: 4:5 (feed), 9:16 (historias y reels: el texto dentro de la zona segura) y 1:1. Misma oferta, mismo titular, la composición adaptada a cada proporción (no un recorte).",
      "3. disenar_piezas con las tres (formato vertical, story y square): plan, costo, «sí».",
      "4. Escribe el texto del anuncio para Meta: título (hasta 40 caracteres), texto principal (hasta 125, el gancho en la primera línea) y descripción corta, con el precio exacto si va. Y dile a la persona que lo lleve a Anuncios → «Nueva campaña» con estas piezas.",
      "5. estado_encargo y MIRA las tres juntas: que se vean como el mismo anuncio.",
    ].join("\n"),
  },
  {
    id: "producto-en-movimiento",
    titulo: "El producto en movimiento",
    descripcion: "Un clip corto de apoyo (5 a 8 s) del producto real: la cámara lo rodea, se acerca o lo descubre. Para reels y anuncios.",
    salida: "video",
    tipos: ["anuncio", "servicios"],
    preguntas: ["¿Qué producto del catálogo?", "¿Qué movimiento: rodearlo, acercarse a un detalle o descubrirlo?"],
    controles: ["El producto idéntico al primer fotograma", "Sin texto ni logo en el video (se ponen al montarlo)", "El costo, confirmado"],
    instrucciones: [
      "1. ver_estudio: las fotos REALES del producto y los modelos de video que hay.",
      "2. El primer fotograma: crear_en_estudio de imagen 9:16 con las fotos del producto en «referencias» y sin_logo=true, con la escena y la luz descritas como un fotógrafo de producto. Míralo con estado_trabajo antes de seguir.",
      "3. El video: crear_en_estudio de video con ese fotograma en imagen_inicial; el prompt describe SÓLO el movimiento de cámara por segundos (p. ej. «0–3 s la cámara rodea el producto de izquierda a derecha a ras de la mesa; 3–6 s se acerca a la etiqueta»), corto, sin texto en pantalla, sin voz. Confirma el costo antes.",
      "4. Si es de una publicación, ponlo con poner_en_publicacion cuando esté.",
    ].join("\n"),
  },
  {
    id: "ficha-desde-enlace",
    titulo: "Ficha de un producto desde su enlace",
    descripcion: "Lee la página del producto (su tienda, Mercado Libre, el proveedor) y saca su ficha: qué es, para quién, beneficios, datos y precio.",
    salida: "guion",
    tipos: ["servicios"],
    preguntas: ["¿El enlace del producto?"],
    controles: ["Sólo lo que dice la página (lo que no, se marca como «por confirmar»)", "El precio, el de la página y con su fecha"],
    instrucciones: [
      "1. Lee la página del enlace (con tu herramienta de leer páginas web). Si no se puede leer, pide que copien el texto.",
      "2. Escribe la ficha: nombre, qué es en una frase, para quién, de 3 a 5 beneficios con las palabras de la página, datos (medidas, material, qué incluye), precio con la fecha en que se leyó, y lo que falta como «por confirmar».",
      "3. Propón cómo queda en el catálogo del cliente y dile a la persona que lo guarde en la pestaña Cerebro → Estudio de mercado → Catálogo (con sus fotos): desde aquí no se escribe el catálogo.",
      "4. Si piden piezas de ese producto, sigue con «Foto héroe del producto» o «Ficha técnica del producto».",
    ].join("\n"),
  },
  {
    id: "video-animado",
    titulo: "Video animado explicativo",
    descripcion: "Un video de 15 a 45 s dibujado con código (texto, iconos, cifras, el producto) con voz y subtítulos, a mp4.",
    salida: "animado",
    tipos: ["educativo", "beneficios", "diferenciador"],
    preguntas: ["¿Qué tiene que entender quien lo vea, en una frase?", "¿Duración y formato (9:16 por defecto)?"],
    controles: ["El guion valida", "La revisión sin problemas graves", "La voz, sólo con el «sí» al costo"],
    instrucciones: [
      "1. formato_video (el formato de escenas) y buscar_cerebro del cliente.",
      "2. crear_video con un guion de 5 a 8 escenas: gancho en 2 s, el problema, la idea, la prueba, el cierre con el llamado. Ligado a su publicación si la hay.",
      "3. ver_escenas y revisar_video: corrige con editar_escena lo que salga (texto que se sale, subtítulos que tapan).",
      "4. Enséñaselo a la persona: aprobar_video sólo con su «sí».",
      "5. generar_locucion (cuesta: confirma la cifra) y renderizar_video. Dile dónde quedó el mp4.",
    ].join("\n"),
  },
  {
    id: "montaje-ugc",
    titulo: "Montar el video que grabó el cliente",
    descripcion: "El UGC o los clips que grabó el cliente, cortados y con gancho escrito, textos, logo y música: a mp4, sin pagar voz.",
    salida: "animado",
    tipos: ["humano", "maletas", "anuncio"],
    preguntas: ["¿Qué clips de la galería (o de Drive) van, y en qué orden?", "¿Cuál es el gancho que va escrito en el primer segundo?"],
    controles: ["Cada clip existe en la galería del cliente", "El texto se lee sobre el video (velo o placa)", "La revisión sin problemas graves"],
    instrucciones: [
      "1. ver_estudio: los IDs de los videos del cliente en la galería (si están en Drive, que primero los traigan a la galería). formato_video.",
      "2. crear_video con una escena por clip: capa «video» a sangre con su «desde» y «hasta» (el tramo bueno, sin las pausas del principio), «sonido» true si habla la persona, y encima el gancho escrito, un dato o un sello; sin «habla» (no lleva locución). El cierre con el logo y el llamado.",
      "3. ver_escenas y revisar_video: que el texto se lea sobre el video (oscurecer 0,3–0,5 o placa) y que nada tape la cara de quien habla.",
      "4. Si va música, musicas o generar_musica (cuesta: confirma la cifra) y sonido_video; la música baja sola cuando habla el clip.",
      "5. Enséñaselo a la persona: aprobar_video sólo con su «sí»; luego renderizar_video (no gasta IA). Dile dónde quedó el mp4.",
    ].join("\n"),
  },
  {
    id: "guion-ugc",
    titulo: "Guion UGC para grabar",
    descripcion: "El guion de un video que graba una persona: voz palabra por palabra, tomas y texto en pantalla, por tramos.",
    salida: "guion",
    tipos: ["humano", "maletas", "anuncio"],
    preguntas: ["¿De qué producto y para quién?", "¿Cuántos segundos (15, 30, 45 o 60)?"],
    controles: ["La voz cabe en la duración (2,5 palabras por segundo)", "Nada prometido que no esté en el catálogo"],
    instrucciones: [
      "1. buscar_cerebro del cliente: su Voz UGC (quién habla, tú o usted, cómo cierra) y el producto.",
      "2. Escribe el guion por tramos: «[0–3 s] VOZ: «…» | SE VE: … | TEXTO: …». El gancho en los primeros 3 s; un solo beneficio; el cierre con el llamado.",
      "3. Tres ganchos alternativos para probar.",
      "4. Si es de una publicación, guárdalo en su guion con editar_publicacion (guion), sin tocar lo demás.",
    ].join("\n"),
  },
]);

const IDS_CASA = new Set(RECETAS_CASA.map((r) => r.id));
export const esDeCasa = (id) => IDS_CASA.has(String(id ?? ""));

/** Una receta limpia (de la casa, de D1 o de la pantalla), o null si le falta el título o el método. Pura. */
export function limpiarReceta(r) {
  const id = String(r?.id ?? "").toLowerCase();
  if (!ID.test(id)) return null;
  const titulo = corto(r?.titulo, 80);
  const instrucciones = largo(r?.instrucciones, MAX_INSTRUCCIONES);
  if (!titulo || !instrucciones) return null;
  return {
    id, titulo, instrucciones,
    descripcion: corto(r?.descripcion, 240),
    salida: SALIDAS_RECETA[r?.salida] ? r.salida : "imagen",
    tipos: lista(r?.tipos, 8, 30),
    preguntas: lista(r?.preguntas, MAX_PREGUNTAS, 160),
    controles: lista(r?.controles, MAX_CONTROLES, 160),
    ...(r?.oculta === true ? { oculta: true } : {}),
  };
}

/**
 * Las que valen: las de la casa con lo que la agencia cambió encima, y las propias detrás. Una guardada con
 * `oculta` saca una de la casa de la lista. Pura.
 */
export function recetasDisponibles(guardadas = []) {
  const propias = new Map(guardadas.map(limpiarReceta).filter(Boolean).map((r) => [r.id, r]));
  const casa = RECETAS_CASA.map((r) => ({ ...(propias.get(r.id) ?? r), casa: true, cambiada: propias.has(r.id) }));
  const nuevas = [...propias.values()].filter((r) => !IDS_CASA.has(r.id)).map((r) => ({ ...r, casa: false }));
  return [...casa, ...nuevas].filter((r) => !r.oculta);
}

/** Un id nuevo para una receta propia, a partir de su título y sin chocar con las que hay. Pura. */
export function idDeReceta(titulo, existentes = []) {
  const base = `r-${String(titulo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "receta"}`;
  const usados = new Set(existentes);
  let id = base;
  for (let i = 2; usados.has(id); i++) id = `${base}-${i}`;
  return id;
}

// ------------------------------------------------------------
// El pedido que viaja con «Crear con Claude» (handoff)
// ------------------------------------------------------------

export const HORAS_HANDOFF = 24;
const ID_FILA = /^[\w-]{1,80}$/;

/** Lo que se guarda del pedido: la publicación, las referencias (ids de la galería) y lo que se pidió. Pura. */
export function limpiarHandoff(d = {}) {
  const pub = d?.publicacion && ID_FILA.test(String(d.publicacion.calendarId ?? "")) && /^[\w-]{1,80}$/.test(String(d.publicacion.postId ?? ""))
    ? { calendarId: String(d.publicacion.calendarId), postId: String(d.publicacion.postId) }
    : null;
  return {
    ...(pub ? { publicacion: pub } : {}),
    referencias: (Array.isArray(d?.referencias) ? d.referencias : []).map(String).filter((x) => ID_FILA.test(x)).slice(0, 6),
    productos: (Array.isArray(d?.productos) ? d.productos : []).map(String).filter((x) => /^[\w-]{1,80}$/.test(x)).slice(0, 4),
    indicacion: corto(d?.indicacion, 600),
    // La pieza de «Lo mejor» de la que sale (su enlace, de quién es, su cifra, su tipo y por qué funciona): así Claude
    // la recrea sabiendo QUÉ funcionó, no sólo mirándola.
    ...(d?.referencia && typeof d.referencia === "object" ? {
      referencia: {
        enlace: /^https:\/\//.test(String(d.referencia.enlace ?? "")) ? corto(d.referencia.enlace, 600) : "",
        cuenta: corto(d.referencia.cuenta, 80), cifra: corto(d.referencia.cifra, 120), tipo: corto(d.referencia.tipo, 60),
        idea: corto(d.referencia.idea, 400), texto: corto(d.referencia.texto, 600),
      },
    } : {}),
  };
}

/** El mensaje que se pega en claude.ai. Corto: el pedido entero está en el handoff. Pura. */
export function mensajeParaClaude({ receta, cliente = "", handoffId = "" }) {
  return [`/receta ${receta?.id ?? receta}`, cliente ? `cliente ${cliente}` : "", handoffId ? `HANDOFF: ${handoffId}` : ""].filter(Boolean).join(" · ");
}

/** El enlace que abre claude.ai con el mensaje escrito (sin documentar: por eso el botón también lo COPIA). Pura. */
export const enlaceDeClaude = (mensaje) => `https://claude.ai/new?q=${encodeURIComponent(String(mensaje ?? ""))}`;

/** Lo que el asistente de la aplicación recibe con «Crear aquí» (el mismo comando: lo resuelve con `receta`). Pura. */
export const mensajeParaElAsistente = (receta, indicacion = "") => [`/receta ${receta?.id ?? receta}`, corto(indicacion, 300)].filter(Boolean).join(" — ");

// ------------------------------------------------------------
// Lo que lee quien diseña
// ------------------------------------------------------------

/** Una línea por receta, para `ver_recetas`. Pura. */
export const lineaDeReceta = (r) => `· ${r.id} — ${r.titulo} (${SALIDAS_RECETA[r.salida] ?? r.salida})${r.descripcion ? `: ${r.descripcion}` : ""}`;

/** La receta entera como la lee Claude: el método, lo que hay que preguntar si falta y lo que se comprueba. Pura. */
export function textoDeReceta(r) {
  return [
    `RECETA «${r.titulo}» (${r.id}) — sale: ${SALIDAS_RECETA[r.salida] ?? r.salida}.`,
    r.descripcion,
    "",
    "MÉTODO (síguelo en orden, con las herramientas del calendario):",
    r.instrucciones,
    r.preguntas?.length ? `\nSI FALTA ALGO, pregúntalo TODO en un solo mensaje (como mucho ${MAX_PREGUNTAS} preguntas): ${r.preguntas.join(" · ")}` : "",
    r.controles?.length ? `\nANTES DE ENTREGAR, comprueba: ${r.controles.join(" · ")}.` : "",
    "\nCuesta dinero crear: enseña siempre el plan con su costo y crea sólo con el «sí» de la persona.",
  ].filter((l) => l !== "").join("\n");
}

/** La regla que se suma a las instrucciones del servidor MCP y al asistente: cómo se enruta un «/receta». */
export const REGLA_RECETAS = "Un mensaje que empieza por «/receta» o trae «HANDOFF:» se resuelve PRIMERO con la herramienta receta (con su id y, si lo trae, el handoff_id) y se sigue su método paso a paso. Para ver cuáles hay: ver_recetas.";
