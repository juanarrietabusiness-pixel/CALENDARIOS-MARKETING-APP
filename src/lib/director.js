// ============================================================
// El DIRECTOR CREATIVO de las piezas (puro)
//
// Las piezas que salían del asistente eran mucho mejores que las del Estudio,
// y la diferencia no era el motor: era el PEDIDO. El asistente escribía una
// instrucción de diseño gráfico —zonas, placas, colores exactos, tamaño del
// titular— razonando como un diseñador; el Estudio pasaba todo por «Mejorar
// idea», que por regla devolvía una o dos frases de 60 palabras describiendo
// una foto. Con eso no se puede pedir una maqueta.
//
// Aquí vive lo que hace que se diseñe igual en todas partes:
//
//   · El MANUAL del director (editable en Ajustes → Manual de la agencia,
//     `manual.diseno`; vacío vale `MANUAL_DISENO_BASE`, escrito con palabras
//     propias): el proceso, las reglas de diseño y cómo se revisa.
//   · La FICHA DE DISEÑO (`FORMATO_FICHA`): la única forma de pedir una
//     imagen con diseño. La escriben el asistente (disenar_piezas), el
//     director de arte por tandas (`pedidoDeFichas`, worker/lib/estudio/
//     fichas.js) y el motor de ideas del lote (el campo `imagen`).
//   · Lo que nunca se pierde: el texto EXACTO de la pieza. `asegurarTexto`
//     lo repone si la IA lo reescribió, en vez de tirar la ficha entera.
//
// Lo importan el Worker y la pantalla.
// ============================================================

export const MAX_MANUAL_DISENO = 6_000;
/** Una ficha, como mucho: con la marca, las referencias y el logo detrás, el pedido no pasa de MAX_PROMPT (4.000). */
export const MAX_FICHA = 1_800;
/** Piezas por llamada al director de arte: más que eso y cada una recibe poca atención. */
export const MAX_FICHAS = 12;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const largo = (t, n) => String(t ?? "").replace(/\r/g, "").trim().slice(0, n);

export const MANUAL_DISENO_BASE = [
  "PROCESO",
  "1. Entiende para qué es cada pieza (vender, enseñar, dar confianza, recordar la marca) y a quién le habla.",
  "2. En una tanda, define antes el CONCEPTO que une las piezas y su SISTEMA VISUAL: qué se repite (tipografía, colores, márgenes, dónde va el logo) y qué cambia de una a otra.",
  "3. Escribe una ficha por pieza, completa: quien la genera no sabe nada más que lo que dice la ficha.",
  "4. Revisa cada imagen hecha como un director: el texto letra por letra, que el titular se lea en un teléfono, la jerarquía, la marca, nada deformado ni inventado. Si es un detalle, corrige esa misma imagen; si la composición no sirve, rehazla.",
  "",
  "REGLAS DE DISEÑO",
  "- Un mensaje por pieza. Titular de 2 a 7 palabras, lo más grande de la pieza; apoyo de una línea; botón de 2 o 3 palabras.",
  "- Jerarquía: 1) titular, 2) imagen o producto, 3) apoyo, 4) botón y logo. Como mucho tres tamaños de letra y dos familias.",
  "- Contraste siempre: letra clara sobre fondo oscuro o al revés. Sobre una foto, el texto va en una placa, una banda o una zona limpia de la foto.",
  "- Retícula: márgenes de un 6 a 8 % del ancho, todo alineado a las mismas líneas, aire alrededor del titular.",
  "- Posiciones y tamaños SIEMPRE con números (% del alto y del ancho de la pieza): «arriba» o «grande» no le dicen nada a quien genera la imagen, y es donde más se equivoca (el texto muy arriba, muy abajo o muy grande).",
  "- Zonas seguras: en un post 4:5 nada importante pegado al borde; en historia y reel, libres el 14 % de arriba y el 20 % de abajo.",
  "- Los colores de la marca con su código exacto y en proporción: uno manda, otro acompaña y el acento sólo en lo que se toca (precio, botón, oferta).",
  "- El producto real se ve grande, nítido y fiel; si hay foto del producto, se copia tal cual.",
  "- Fotografía creíble antes que ilustración genérica (salvo que la marca diga otra cosa); personas y lugares de Panamá y Latinoamérica.",
  "- Variedad en la serie: dos piezas seguidas no repiten composición. Alterna foto a sangre, placa de color, pantalla dividida, producto aislado sobre color, tipográfica, antes y después.",
  "- Nada inventado: precios, descuentos, fechas, reseñas, sellos o logos sólo si están en los datos.",
  "- El texto, en español sin faltas, entre comillas «…» y copiado exacto.",
].join("\n");

/** El manual que vale: el escrito por la agencia o el de la casa. Pura. */
export const manualDeDiseno = (manual) => largo(manual?.diseno, MAX_MANUAL_DISENO) || MANUAL_DISENO_BASE;

/**
 * CÓMO SE DISEÑA CADA TIPO DE CONTENIDO: lo que el director decide distinto según para qué es la pieza (un anuncio
 * no se diseña como un educativo). Los ids son los de `PILARES` (pilares.js); `claves`, cómo se reconoce el tipo por su
 * nombre (a quien diseña le llega «Educativo / Informativo», no el id). La agencia lo cambia tipo a tipo en Ajustes →
 * Manual de la agencia (`manual.disenoTipos`); vacío, vale el de la casa.
 */
export const DISENO_POR_TIPO = Object.freeze([
  { id: "anuncio", nombre: "Anuncio", claves: ["anuncio"], base: "El producto real es el protagonista (40–60 % de la pieza) y el titular habla del resultado; el precio exacto y el botón en el color de acento. Poco texto: titular, una línea y el botón." },
  { id: "beneficios", nombre: "Beneficios / Promociones", claves: ["beneficio", "promoci"], base: "La oferta manda: el número o el beneficio en grande (el titular), el producto acompaña, la fecha límite sólo si es real. Color de acento en la oferta." },
  { id: "educativo", nombre: "Educativo / Informativo", claves: ["educativ", "informativ"], base: "El texto es el protagonista: tipográfica limpia o un icono o foto que apoye; fondo de un color de la marca; el producto no aparece salvo que sea el ejemplo. Nada de botón de compra." },
  { id: "diferenciador", nombre: "Diferenciador", claves: ["diferenciador"], base: "Una sola afirmación que nadie más puede decir, muy grande; una prueba visual (proceso, detalle, material, equipo). Sobria y segura, sin oferta." },
  { id: "maletas", nombre: "7 maletas", claves: ["maleta", "garant", "testimonio", "soluci", "objeci"], base: "Da confianza: un testimonio va como cita con comillas y nombre (sólo si es real); una garantía, con su sello hecho con la tipografía de la marca (sin inventar sellos oficiales); un antes y después, en pantalla dividida." },
  { id: "humano", nombre: "Contenido humano", claves: ["humano", "viral", "comunidad"], base: "Foto o escena real y cercana (personas, equipo, el día a día), poco texto y sin aspecto de anuncio; el logo pequeño." },
  { id: "servicios", nombre: "Servicios / Productos", claves: ["servicio", "producto"], base: "Enseña el producto o el servicio y qué incluye: foto clara y fiel, el nombre y dos o tres puntos cortos; el precio exacto si está." },
]);
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** El id del tipo de diseño por su id o su nombre («Educativo / Informativo» → «educativo»), o "". Pura. */
export function tipoDeDiseno(tipo) {
  const t = sinTildes(tipo).trim();
  if (!t) return "";
  const porId = DISENO_POR_TIPO.find((x) => x.id === t || t.startsWith(`${x.id}-`));
  if (porId) return porId.id;
  return DISENO_POR_TIPO.find((x) => x.claves.some((c) => t.includes(c)))?.id ?? "";
}

/** Cómo se diseña ese tipo: el del manual de la agencia o el de la casa. "" si no es un tipo conocido. Pura. */
export function disenoDelTipo(tipo, manual = null) {
  const id = tipoDeDiseno(tipo);
  if (!id) return "";
  return largo(manual?.disenoTipos?.[id], MAX_DISENO_TIPO) || DISENO_POR_TIPO.find((x) => x.id === id).base;
}
export const MAX_DISENO_TIPO = 500;

/** El bloque «CÓMO SE DISEÑA CADA TIPO» con sólo los tipos que hay (todos si `tipos` va vacío y `todos`). Pura. */
export function bloqueDeDisenoPorTipo(tipos = [], manual = null, { todos = false } = {}) {
  const ids = todos ? DISENO_POR_TIPO.map((x) => x.id) : [...new Set(tipos.map(tipoDeDiseno).filter(Boolean))];
  if (!ids.length) return "";
  return ["CÓMO SE DISEÑA CADA TIPO DE CONTENIDO (decide la pieza según su tipo):",
    ...ids.map((id) => `- ${DISENO_POR_TIPO.find((x) => x.id === id).nombre}: ${disenoDelTipo(id, manual)}`)].join("\n");
}

/** Los `disenoTipos` del manual, limpios: sólo tipos que existen y con tope. Pura. */
export const limpiarDisenoTipos = (m) => Object.fromEntries(DISENO_POR_TIPO
  .map((x) => [x.id, largo(m?.[x.id], MAX_DISENO_TIPO)]).filter(([, v]) => v));

/**
 * La plantilla del kit ASIGNADA al tipo de una pieza (`plantilla.tipos`), para su uso: post e historia por el suyo;
 * la portada de un carrusel o de un reel, por «portada». null si no hay. Pura.
 */
export function plantillaParaTipo(plantillas = [], tipo = "", formato = "post") {
  const id = tipoDeDiseno(tipo);
  if (!id) return null;
  const uso = formato === "historia" || formato === "reel" ? "historia" : formato === "carrusel" ? "portada" : "post";
  return plantillas.find((p) => (p.tipos ?? []).includes(id) && p.uso === uso) ?? null;
}

/** Cómo se escribe una ficha: la misma para el asistente, el director de arte y el motor de ideas. */
export const FORMATO_FICHA = [
  "Pieza: <formato y proporción> — <para qué es, en una frase>.",
  "Composición: <dónde va cada cosa CON MEDIDAS en % de la pieza: «titular entre el 8 y el 22 % de la altura, 80 % del ancho, centrado; producto del 30 al 85 %; logo abajo a la derecha, 10 % del ancho»>.",
  "Fondo: <color con su código #HEX, foto a sangre, degradado, textura>.",
  "Imagen principal: <qué se ve: sujeto o producto, acción, lugar, luz y encuadre>.",
  "Texto (exacto, sin cambiar una letra): titular «…» (<alto de letra en % de la altura de la pieza, peso, color, zona>); apoyo «…» (…); botón «…» (<forma, color y zona>).",
  "Marca: <dónde va el logo y de qué tamaño; qué colores de la paleta mandan>.",
  "Evitar: <lo que no debe salir>.",
].join("\n");

/** Una pieza que NO lleva texto (lo pone la plantilla encima, o es un video): la línea de texto cambia por esto. */
export const FICHA_SIN_TEXTO = "Texto: NINGUNO. No escribas letras ni números en la imagen; deja libre y limpia la zona indicada.";

/** La ficha limpia: sin líneas en blanco (el pedido del motor separa sus partes con una línea en blanco) y con tope. Pura. */
export function limpiarFicha(texto) {
  return String(texto ?? "")
    .replace(/\r/g, "")
    .replace(/```[a-z]*|```/g, "")
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
    .join("\n")
    .slice(0, MAX_FICHA)
    .trim();
}

const sinMarcas = (t) => String(t ?? "").normalize("NFC").replace(/["“”«»]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Las líneas del texto de la pieza (titular, apoyo, botón), sin comillas. Pura. */
export const lineasDelTexto = (texto) => String(texto ?? "").split(/\n+/).map((l) => l.replace(/["“”«»]/g, "").trim()).filter(Boolean).slice(0, 4);

/** El texto exacto de una ficha: lo que va entre «» en su línea «Texto…». Pura. */
export function textoDeLaFicha(ficha = "") {
  const linea = String(ficha).split("\n").find((l) => /^Texto/i.test(l)) ?? "";
  const citas = [...linea.matchAll(/«([^»]{1,120})»/g)].map((m) => m[1].trim()).filter(Boolean);
  return citas.length ? lineasDelTexto(citas.join("\n")).join("\n") : "";
}

/** ¿Es una ficha de diseño (y no una escena de una o dos frases)? Pura. */
export const esFicha = (t) => /(^|\n)\s*Pieza: /.test(String(t ?? "")) && /\nComposición: /.test(String(t ?? ""));

/**
 * La ficha con el texto EXACTO de la pieza dentro. Si la IA reescribió alguna línea (o se la comió), se añade la línea
 * «Texto exacto…» con las que faltan: el texto de la pieza lo escribió una persona o el motor de ideas, y es lo único
 * que el diseño no decide. Antes se tiraba la ficha entera por una letra cambiada. Pura.
 */
export function asegurarTexto(ficha, texto) {
  const f = limpiarFicha(ficha);
  const lineas = lineasDelTexto(texto);
  if (!f || !lineas.length) return f;
  const dentro = sinMarcas(f);
  const faltan = lineas.filter((l) => !dentro.includes(sinMarcas(l)));
  if (!faltan.length) return f;
  return limpiarFicha(`${f}\nTexto exacto que va en la imagen (gana sobre cualquier otro texto de esta ficha): ${faltan.map((l) => `«${l.slice(0, 120)}»`).join(" / ")}.`);
}

// ------------------------------------------------------------
// El asistente, como director creativo
// ------------------------------------------------------------

/**
 * Lo que el asistente sabe de cómo diseñar: el manual, la ficha y cómo usar sus herramientas de diseño. Va en su
 * sistema cuando hay un cliente abierto. Pura.
 */
export function instruccionDeDiseno(manual) {
  return [
    "CÓMO DISEÑAS: ERES EL DIRECTOR CREATIVO Y DISEÑADOR GRÁFICO DE LA AGENCIA",
    "La persona te da instrucciones sencillas («12 posts de noviembre, envío gratis»). Tú razonas todo lo demás: el concepto, el sistema visual, la composición y el texto de cada pieza. No le preguntes lo que puedas decidir con el cerebro del cliente, su calendario y su kit; pregunta sólo lo imprescindible.",
    "",
    "MANUAL DEL DIRECTOR (síguelo siempre):",
    manualDeDiseno(manual),
    "",
    bloqueDeDisenoPorTipo([], manual, { todos: true }),
    "Cuando una plantilla del cliente «ES LA DE» un tipo, las piezas de ese tipo la siguen (pasa su id en «plantilla»).",
    "",
    "LA FICHA DE DISEÑO: cada pieza se pide con una ficha así, una línea por apartado (quien genera la imagen sólo sabe lo que dice):",
    FORMATO_FICHA,
    "",
    "TUS HERRAMIENTAS DE DISEÑO:",
    "· Un CARRUSEL: sus láminas en orden (portada primero) en UNA sola llamada a disenar_piezas con carrusel=true y formato vertical (4:5); así quedan agrupadas en la galería. Mismo sistema en todas: el titular, los márgenes, el fondo y el logo en el mismo sitio y del mismo tamaño en cada lámina, y dilo con medidas en cada ficha.",
    "· LOS PRODUCTOS salen del CATÁLOGO del cliente (abajo, con sus ids): por su nombre exacto en la ficha y con sus ids en «productos» de disenar_piezas (de la tanda, o de cada pieza si cambian), también en un carrusel. Así van sus fotos REALES y el motor no se inventa otro producto ni otra marca. Si no sabes de qué producto va y no lo dice el calendario ni el cerebro, PREGUNTA cuál antes de diseñar (ofrece las opciones del catálogo). Una pieza puede llevar varios productos.",
    "· disenar_piezas: de 1 a 12 piezas, una ficha cada una. La persona ve las fichas y el costo y aprueba con un botón: NO le pidas el «sí» por texto antes. Si son para publicaciones del calendario, pasa el post_id de cada una y copia su texto de la pieza TAL CUAL.",
    "· ver_lo_que_funciona: las plantillas y las imágenes que gustaron de este cliente, para que veas su estilo. Míralo antes de la primera tanda de la conversación.",
    "· Al terminar, disenar_piezas te devuelve cada imagen para que la MIRES. Si una tiene una falta de ortografía, un texto ilegible, un logo deformado o se sale del sistema, arréglala con corregir_pieza (un detalle) o pídela otra vez con disenar_piezas (la composición no sirve) ANTES de dar la tanda por buena. Di en una línea qué corregiste.",
    "· version_final: cuando la persona escoja las buenas, la misma pieza con el mejor modelo que haya (los borradores salen con el modelo del cliente).",
    "· guardar_regla: si la persona corrige lo mismo dos veces, ofrécele guardarlo como regla del kit (va en todas las piezas); sólo con su sí.",
    "· La persona puede señalar una imagen escribiendo «En la imagen clientes/…:»: es su clave; pásala como archivo_id a corregir_pieza o version_final.",
    "· Si en una serie una pieza quedó con el texto en otro sitio o de otro tamaño, corregir_pieza con igual_a = la que quedó bien: se iguala a ella (más fiable que describirlo).",
    "· generar_imagen sigue para una imagen rápida sin diseño (una foto, una ilustración).",
  ].join("\n");
}

/** Una plantilla del kit en una línea, para el asistente y el director de arte. Pura. */
export const lineaDePlantilla = (p) => `- ${p.id} · «${p.nombre}» (${NOMBRES_USO[p.uso] ?? p.uso}${(p.tipos ?? []).length ? `; ES LA DE: ${p.tipos.map((id) => DISENO_POR_TIPO.find((x) => x.id === id)?.nombre ?? id).join(", ")}` : ""})${p.sistema ? `: ${corto(p.sistema, 400)}` : ""}`;

export const USOS_PLANTILLA = Object.freeze(["post", "historia", "portada", "lamina"]);
export const NOMBRES_USO = Object.freeze({ post: "post fijo", historia: "historia", portada: "portada de carrusel", lamina: "lámina interior de carrusel" });

// ------------------------------------------------------------
// El director de arte por tandas (sin chat)
// ------------------------------------------------------------

/**
 * Una pieza del encargo, limpia. `n` su número; `formato` post|historia|carrusel|reel; `tipo` el tipo de contenido (su
 * nombre); `idea` el brief; `escena` lo que una persona escribió de qué se ve (manda); `texto` el texto EXACTO de la
 * pieza; `producto` su línea del catálogo; `indicacion` lo que pidió la agencia (manda sobre todo); `sinTexto` si el
 * texto lo pone la plantilla encima; `plantilla` el id de una plantilla del kit. Pura.
 */
export function limpiarPiezaEncargo(p = {}, i = 0) {
  return {
    n: Number.isInteger(p.n) && p.n > 0 ? p.n : i + 1,
    formato: ["post", "historia", "carrusel", "reel", "anuncio"].includes(p.formato) ? p.formato : "post",
    proporcion: /^\d{1,2}:\d{1,2}$/.test(String(p.proporcion ?? "")) ? String(p.proporcion) : "",
    tipo: corto(p.tipo, 80),
    idea: corto(p.idea, 900),
    escena: corto(p.escena, 900),
    texto: largo(p.texto, 400),
    // Una pieza puede hablar de VARIOS productos del catálogo (una línea por producto).
    producto: largo(p.producto, 900),
    indicacion: corto(p.indicacion, 400),
    composicion: corto(p.composicion, 200),
    sinTexto: p.sinTexto === true,
    plantilla: /^plantilla-[a-z0-9-]{1,40}$/.test(String(p.plantilla ?? "")) ? String(p.plantilla) : "",
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(p.fecha ?? "")) ? String(p.fecha) : "",
  };
}

/**
 * Cómo piensa el director cada pieza: lo que el asistente hace en una conversación (por eso sus piezas salían mejores)
 * dicho como un proceso. Va en todo pedido de fichas y de carrusel.
 */
export const RAZONA_COMO_DIRECTOR = [
  "Piensa cada pieza como lo harías sentado con la agencia, ANTES de escribir su ficha:",
  "1) para qué es y a quién le habla (lo que vende la marca, el producto, el tipo de contenido);",
  "2) qué tiene que sentir o entender quien la ve en dos segundos, y cuál es la UNA idea visual que lo consigue (no la primera que se le ocurre a cualquiera: la que sólo funciona para esta marca);",
  "3) la composición con medidas, la jerarquía del texto y dónde respira la pieza;",
  "4) qué podría salir mal al generarla (texto muy pequeño, producto deformado, algo inventado) y cómo lo evita la ficha.",
  "Después escribe la ficha completa: quien genera la imagen no sabe nada más que lo que dice la ficha.",
].join("\n");

/** El catálogo del cliente para quien diseña: lo único que se puede enseñar como producto. */
export const REGLA_PRODUCTOS = "Productos y marcas: SÓLO los del catálogo del cliente, con su nombre exacto; nunca inventes un producto, un modelo, un empaque ni una marca (tampoco los de una referencia de otra marca). Si la pieza no dice cuál, escoge del catálogo el que mejor encaje o no enseñes ninguno.";
const lineaDeCatalogo = (catalogo) => `CATÁLOGO DEL CLIENTE (lo único que existe; precios exactos):\n${largo(catalogo, 2500)}`;
export const MAX_SOBRE_LA_MARCA = 2_500;

/** Lo que es cada imagen ESPECIAL que va delante del pedido (la original de «Otra versión», la referencia de otra marca). */
const PAPELES = Object.freeze({
  original: (n) => `LA IMAGEN ${n} ES LA PIEZA ORIGINAL de la que se pide OTRA VERSIÓN: mírala bien. La versión nueva conserva su mensaje, su texto exacto, su producto, su paleta y su nivel de acabado, y se tiene que reconocer como de la misma campaña; lo que cambia es la composición, de forma moderada (otro encuadre, otra distribución, otro fondo o escenario), para que sea una alternativa real y no la misma imagen ni algo ajeno.`,
  inspiracion: (n, cliente) => `LA IMAGEN ${n} ES UNA PIEZA DE OTRA MARCA que a la agencia le gustó como inspiración. Toma de ella la IDEA —el gancho, el ángulo, cómo cuenta el mensaje, el tipo de composición— y diseña una versión PROPIA de ${cliente}, ligeramente distinta: cambia la distribución, el encuadre, el fondo y el estilo de la foto lo suficiente para que nadie la reconozca como una copia. Nada de su producto, su texto, su marca, su empaque ni su logo: el producto es del catálogo de ${cliente} y los colores, los de su marca.`,
});

/** Las líneas de las imágenes especiales, en el orden en que van (las primeras del pedido). Pura. */
export function lineaDeEspeciales(papeles = [], cliente = "la marca") {
  return papeles.map((p, i) => PAPELES[p]?.(i + 1, cliente) ?? "").filter(Boolean).join("\n");
}
export const PAPELES_ESPECIALES = Object.freeze(Object.keys(PAPELES));

const NOMBRE_FORMATO = { post: "post del feed", historia: "historia (9:16)", carrusel: "portada de carrusel", reel: "portada de reel (9:16)", anuncio: "anuncio" };

/** Una pieza del encargo en el pedido. Pura. */
function lineaDeEncargo(p) {
  return [
    `${p.n}. ${NOMBRE_FORMATO[p.formato] ?? p.formato}${p.proporcion ? ` ${p.proporcion}` : ""}${p.fecha ? ` · ${p.fecha}` : ""}${p.tipo ? ` · tipo: ${p.tipo}` : ""}`,
    p.idea ? `   de qué va: ${p.idea}` : "",
    p.escena ? `   qué se ve (lo escribió la agencia: respétalo): ${p.escena}` : "",
    p.sinTexto ? "   SIN TEXTO en la imagen: el texto se pone después encima; deja la zona libre." : p.texto ? `   texto EXACTO de la pieza: ${lineasDelTexto(p.texto).map((l) => `«${l}»`).join(" / ")}` : "   sin texto escrito: propón un titular corto y, si hace falta, un apoyo.",
    p.producto
      ? (p.producto.includes("\n")
        ? `   productos que salen JUNTOS en esta pieza (reales; precio exacto si se nombra; todos visibles y reconocibles):\n${p.producto.split("\n").map((l) => `     ${l.replace(/^-\s*/, "- ")}`).join("\n")}`
        : `   producto (real, con su precio exacto si se nombra): ${p.producto}`)
      : "",
    p.composicion ? `   composición sugerida por el plan: ${p.composicion}` : "",
    p.plantilla ? `   sigue la plantilla ${p.plantilla} (su sistema de diseño, con este contenido)` : "",
    p.indicacion ? `   LO QUE PIDE LA AGENCIA (manda sobre todo lo demás): ${p.indicacion}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Lo que se le pide al director de arte: una ficha por pieza, todas de una serie coherente. `marca`: el bloque del kit
 * (paleta, estilo, reglas); `guia`: la identidad visual del cerebro; `plantillas`: las del kit; `concepto`: el de la
 * tanda si ya lo hay. Pura.
 */
export function pedidoDeFichas({ cliente = "la marca", rubro = "", piezas = [], marca = "", guia = "", plantillas = [], manual = null, concepto = "", productos = "", catalogo = "", sobreLaMarca = "", correcciones = [], vistas = 0, especiales = [], previas = [], serie = 0 }) {
  const lista = piezas.slice(0, MAX_FICHAS).map(limpiarPiezaEncargo);
  const enSerie = lista.length > 1 || serie > 1;
  return [
    lineaDeEspeciales(especiales, cliente),
    lineaDeVistas(vistas, { desde: especiales.length + 1 }),
    `Eres el director creativo y diseñador gráfico de una agencia en Panamá. Diseña ${lista.length === 1 ? "esta pieza" : `estas ${lista.length} piezas`} de redes sociales para ${cliente}${rubro ? ` (${rubro})` : ""}${enSerie ? `, ${lista.length === 1 ? "parte de una serie coherente" : "como una serie coherente"}` : ""}.`,
    RAZONA_COMO_DIRECTOR,
    "",
    "MANUAL DEL DIRECTOR (síguelo siempre):",
    manualDeDiseno(manual),
    "",
    marca ? `LA MARCA (obligatorio en toda pieza):\n${marca}` : "Este cliente aún no tiene kit de marca: toma los colores y el estilo de la identidad de abajo; si no hay, usa una paleta sobria de dos colores y dilo en la ficha.",
    sobreLaMarca ? `\nLO QUE SE SABE DE ${String(cliente).toUpperCase()} (su ficha técnica en el cerebro: qué vende, a quién, cómo habla):\n${largo(sobreLaMarca, MAX_SOBRE_LA_MARCA)}` : "",
    guia ? `\nIDENTIDAD VISUAL (del cerebro del cliente):\n${largo(guia, 3500)}` : "",
    productos ? `\nPRODUCTOS DE ESTAS PIEZAS (precios exactos; no inventes otros):\n${largo(productos, 1500)}` : "",
    catalogo ? `\n${lineaDeCatalogo(catalogo)}` : "",
    previas.length ? `\nPIEZAS DE ESTA SERIE QUE YA DISEÑASTE (síguelas en el sistema visual —tipografía, márgenes, logo, paleta— y NO repitas su composición):\n${previas.slice(0, 3).map((f, i) => `${i + 1}. ${corto(f, 700)}`).join("\n")}` : "",
    plantillas.length ? `\nPLANTILLAS DE ESTE CLIENTE (diseños que ya funcionaron; si una encaja, síguela y di su id en «plantilla»; la que «ES LA DE» un tipo se usa en las piezas de ese tipo salvo que la pieza diga otra):\n${plantillas.map(lineaDePlantilla).join("\n")}` : "",
    bloqueDeDisenoPorTipo(lista.map((p) => p.tipo), manual) ? `\n${bloqueDeDisenoPorTipo(lista.map((p) => p.tipo), manual)}` : "",
    lineaDeCorrecciones(correcciones),
    concepto ? `\nCONCEPTO DE LA TANDA (síguelo): ${corto(concepto, 600)}` : "",
    "",
    "LAS PIEZAS:",
    ...lista.map(lineaDeEncargo),
    "",
    "LA FICHA, una línea por apartado y sin líneas en blanco:",
    FORMATO_FICHA,
    `En una pieza SIN TEXTO, la línea de texto es: ${FICHA_SIN_TEXTO}`,
    "",
    `Reglas: español latino neutro; el texto exacto de cada pieza, copiado letra por letra entre «»; nada de precios, descuentos, sellos ni reseñas que no estén arriba; ningún logo de otra marca. ${REGLA_PRODUCTOS}`,
    'Responde SOLO con JSON: {"concepto":"la idea que une la serie y su sistema visual, en 1 o 2 frases","piezas":[{"n":1,"ficha":"Pieza: …\\nComposición: …","plantilla":""}]}',
  ].filter((l) => l !== "").join("\n");
}

/**
 * La respuesta → { concepto, fichas: { n → { ficha, plantilla } } }, con el texto exacto asegurado en cada una. Las que
 * no vengan, no están (quien pide sigue con su camino de antes para esas). Pura.
 */
export function leerFichas(texto, piezas = []) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  const lista = piezas.map(limpiarPiezaEncargo);
  const fichas = {};
  for (const x of Array.isArray(d?.piezas) ? d.piezas : []) {
    const p = lista.find((y) => y.n === Number(x?.n));
    if (!p) continue;
    let ficha = limpiarFicha(x?.ficha);
    if (!ficha) continue;
    ficha = p.sinTexto ? ficha : asegurarTexto(ficha, p.texto);
    const plantilla = /^plantilla-[a-z0-9-]{1,40}$/.test(String(x?.plantilla ?? "")) ? String(x.plantilla) : p.plantilla;
    fichas[p.n] = { ficha, ...(plantilla ? { plantilla } : {}) };
  }
  if (!Object.keys(fichas).length) return null;
  return { concepto: corto(d?.concepto, 600), fichas };
}

// ------------------------------------------------------------
// El kit, en pocas líneas, para quien diseña
// ------------------------------------------------------------

/**
 * Lo que el asistente necesita saber del kit para diseñar: si está, qué exige y qué plantillas hay. Si no está, que
 * lo diga y ofrezca prepararlo. `kit` ya limpio (limpiarKit); `marca`: su bloque (bloqueDeMarca). Pura.
 */
export function resumenDelKit({ kit = null, marca = "", vacio = false, cliente = "este cliente" } = {}) {
  if (!kit || vacio) {
    return `KIT DE MARCA DE ${cliente.toUpperCase()}: NO está preparado. Las piezas saldrán sin su paleta ni su logo: díselo a la persona en una línea y ofrécele prepararlo (Estudio → Kit de marca → «Preparar con IA»). Mientras, saca los colores y el estilo del cerebro (buscar_cerebro) y escríbelos en cada ficha.`;
  }
  return [
    `KIT DE MARCA DE ${cliente.toUpperCase()} (el Estudio lo pone solo en cada pieza; tú escribe la ficha de acuerdo con él):`,
    marca,
    kit.tipografia ? `Tipografía: ${kit.tipografia}.` : "",
    kit.logo ? (kit.logoModo === "estampado" ? "Logo: lo estampa la aplicación encima al terminar; en la ficha deja libre su esquina y no lo dibujes." : "Logo: va de referencia al motor; di en la ficha dónde va y de qué tamaño.") : "Logo: el kit no tiene logo.",
    (kit.plantillas ?? []).length ? `Plantillas guardadas (diseños que ya funcionaron; pasa su id en «plantilla» para seguir una):\n${kit.plantillas.map(lineaDePlantilla).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------
// Lo que la agencia ya corrigió en este cliente (para no repetirlo)
// ------------------------------------------------------------

/**
 * Las correcciones recientes de la agencia en este cliente, sacadas de los pedidos de EDICIÓN de su Estudio
 * («Edita la imagen de referencia: el titular más arriba. Conserva…»): lo que se corrige una y otra vez es lo que el
 * director tiene que hacer bien desde la ficha. Fuera las que hace sola la aplicación (la letra mal escrita del
 * control: «donde dice…»; la recomposición de la proporción). `prompts` de la más nueva a la más vieja. Pura.
 */
export function correccionesRecientes(prompts = [], max = 8) {
  const vistas = new Set();
  const salida = [];
  for (const p of prompts) {
    const m = String(p ?? "").match(/^Edita la imagen de referencia(?: 1)?: ([\s\S]+?)\. Conserva todo lo demás/);
    if (!m) continue;
    const t = m[1].replace(/\s+/g, " ").trim();
    // Lo que hace sola la aplicación no es de la agencia: la letra del control, la recomposición y el ajuste del director.
    if (!t || /donde dice/i.test(t) || /^Recompón/i.test(t) || /^Ajuste del director:/i.test(t)) continue;
    const clave = t.toLowerCase().slice(0, 60);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(t.slice(0, 200));
    if (salida.length >= max) break;
  }
  return salida;
}

/** Las correcciones recientes, para el pedido del director. Pura. */
export const lineaDeCorrecciones = (lista = []) => (lista.length
  ? `CORRECCIONES QUE LA AGENCIA HIZO HACE POCO EN ESTE CLIENTE (errores que se repiten: que la ficha los evite desde el principio):\n${lista.map((c) => `- ${c}`).join("\n")}`
  : "");

/** Cuando el director VE imágenes del cliente (plantillas y «Me gusta»): qué son. Pura. */
export const lineaDeVistas = (n, { desde = 1 } = {}) => {
  if (!n) return "";
  if (desde > 1) return `${n === 1 ? `La imagen ${desde} es una plantilla o pieza` : `Las imágenes ${desde} a ${desde + n - 1} son plantillas y piezas`} que le gustaron a la agencia de este cliente: ese es el nivel y el estilo a igualar (no copies su contenido).`;
  return `Las ${n === 1 ? "imagen de arriba es" : `${n} imágenes de arriba son`} plantillas y piezas que le gustaron a la agencia de este cliente: ese es el nivel y el estilo a igualar (no copies su contenido).`;
};

// ------------------------------------------------------------
// El carrusel, diseñado por el director
// ------------------------------------------------------------

/** Cómo va en la ficha el sistema de la serie: con medidas, igual en todas las láminas. */
const REGLA_SERIE = "Un carrusel es UNA serie: el titular en la MISMA zona, del MISMO tamaño y peso en todas las láminas (dilo con medidas: «titular entre el 8 y el 22 % de la altura, 80 % del ancho»), los mismos márgenes, el mismo fondo o su variación, el logo en el mismo sitio y del mismo tamaño. Lo que cambia de una a otra es el contenido.";

/**
 * Lo que se le pide al director para un carrusel: con el guion (`laminas`: las de partirGuion) o sólo un tema, de 5 a 7
 * láminas. Devuelve el sistema de la serie y la ficha de cada lámina con su texto exacto. Pura.
 */
export function pedidoDeCarrusel({ cliente = "la marca", rubro = "", laminas = [], tema = "", tipo = "", estilo = "", producto = "", personajes = [], marca = "", guia = "", plantillas = [], manual = null, correcciones = [], vistas = 0, estructura = "", catalogo = "", sobreLaMarca = "" }) {
  const conGuion = laminas.length >= 2;
  const deCarrusel = plantillas.filter((p) => p.uso === "portada" || p.uso === "lamina");
  return [
    lineaDeVistas(vistas),
    `Eres el director creativo y diseñador gráfico de una agencia en Panamá. Diseña un carrusel de Instagram (cada lámina vertical 4:5) de ${cliente}${rubro ? ` (${rubro})` : ""}. Un generador de imágenes hará las láminas UNA a una, cada una con la anterior y la portada de referencia, y sólo sabe lo que diga la ficha.`,
    RAZONA_COMO_DIRECTOR.replace("cada pieza", "el carrusel y cada lámina"),
    conGuion
      ? `EL GUION (respeta su orden y sus datos; puedes acortar un texto que no quepa, sin cambiar precios ni cifras):\n${laminas.map((l) => `${l.n}. (${l.rol}) ${String(l.texto).replace(/\s+/g, " ").slice(0, 400)}`).join("\n")}`
      : `No hay guion: escribe ${estructura ? "las láminas" : "de 5 a 7 láminas"} sobre este tema: ${corto(tema, 400)}${estructura ? `\nSigue esta ${corto(estructura, 400)} (la portada promete algo concreto de esa estructura, no un título genérico).` : ""}`,
    conGuion && tema ? `Tema: ${corto(tema, 300)}` : "",
    tipo ? `Tipo de contenido: ${tipo}.` : "",
    estilo ? `Estilo visual: ${corto(estilo, 300)}` : "",
    producto ? (producto.includes("\n") ? `Productos de este carrusel (reales, precio exacto si se nombra):\n${largo(producto, 900)}` : `Producto (real, precio exacto si se nombra): ${corto(producto, 300)}`) : "",
    personajes.length ? `Personajes de la marca (salen IGUAL donde aparezcan): ${personajes.join("; ")}` : "",
    "",
    "MANUAL DEL DIRECTOR (síguelo siempre):",
    manualDeDiseno(manual),
    "",
    marca ? `LA MARCA (obligatorio en toda lámina):\n${marca}` : "Este cliente aún no tiene kit de marca: toma los colores y el estilo de la identidad de abajo.",
    sobreLaMarca ? `\nLO QUE SE SABE DE ${String(cliente).toUpperCase()} (su ficha técnica en el cerebro):\n${largo(sobreLaMarca, MAX_SOBRE_LA_MARCA)}` : "",
    guia ? `\nIDENTIDAD VISUAL (del cerebro del cliente):\n${largo(guia, 3000)}` : "",
    catalogo ? `\n${lineaDeCatalogo(catalogo)}` : "",
    deCarrusel.length ? `\nPLANTILLAS DE CARRUSEL DE ESTE CLIENTE (si una encaja, sigue su sistema; la que «ES LA DE» este tipo, síguela):\n${deCarrusel.map(lineaDePlantilla).join("\n")}` : "",
    tipo && disenoDelTipo(tipo, manual) ? `\nCÓMO SE DISEÑA ESTE TIPO (${corto(tipo, 60)}): ${disenoDelTipo(tipo, manual)}` : "",
    lineaDeCorrecciones(correcciones),
    "",
    REGLA_SERIE,
    "La portada detiene el scroll; las de en medio cuentan una idea cada una; el cierre invita a actuar.",
    "",
    "LA FICHA de cada lámina, una línea por apartado y sin líneas en blanco:",
    FORMATO_FICHA,
    "",
    `Reglas: español latino neutro; el texto de cada lámina, corto (se lee en dos segundos), copiado letra por letra entre «» en su ficha; nada de precios, descuentos, sellos ni reseñas que no estén arriba; ningún logo de otra marca. ${REGLA_PRODUCTOS}`,
    'Responde SOLO con JSON: {"sistema":"el sistema de la serie en una o dos frases, con medidas","laminas":[{"n":1,"texto":"titular\\napoyo","ficha":"Pieza: …\\nComposición: …"}]}',
  ].filter((l) => l !== "").join("\n");
}

/**
 * La respuesta → { hilo, laminas: [{ n, rol, texto, ficha }] } (2 a 10), con el texto exacto asegurado en cada ficha.
 * `hilo` es el sistema de la serie (lo que comparten todas). null si no se puede leer. Pura.
 */
export function leerCarrusel(texto, maxLaminas = 10) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  const lista = (Array.isArray(d?.laminas) ? d.laminas : []).map((x) => {
    const texto = String(x?.texto ?? "").split(/\n|\\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3).join("\n").slice(0, 400);
    return { texto, ficha: asegurarTexto(x?.ficha, texto) };
  }).filter((x) => x.ficha || x.texto).slice(0, maxLaminas);
  if (lista.length < 2) return null;
  return {
    hilo: corto(d?.sistema ?? d?.hilo, 400),
    laminas: lista.map((x, k) => ({ n: k + 1, rol: k === 0 ? "portada" : k === lista.length - 1 && lista.length >= 3 ? "cierre" : "contenido", ...x })),
  };
}

/** Los encargos frecuentes del director: rellenan la caja del chat (pestaña Diseño y «Modo director» del asistente). */
export const ATAJOS_DIRECTOR = Object.freeze([
  { etiqueta: "Diseña la semana", texto: "Diseña las piezas de la semana que viene del calendario: cada una en su publicación, con su texto de la pieza." },
  { etiqueta: "Anuncios de un producto", texto: "Diseña 6 anuncios del producto " },
  { etiqueta: "Un carrusel", texto: "Diseña un carrusel 4:5 sobre " },
  { etiqueta: "Historias de un post", texto: "Diseña 3 historias que acompañen al post del " },
  { etiqueta: "Otra como esta", texto: "Haz otra pieza con el mismo diseño de la plantilla " },
  { etiqueta: "Mira lo que funciona", texto: "Mira las plantillas y lo que me gustó de este cliente y dime qué estilo ves antes de diseñar." },
]);
