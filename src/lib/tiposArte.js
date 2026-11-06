// ============================================================
// Los TIPOS DE ARTE y los SESGOS del curso de campañas, como dato (puro y pequeño)
//
// Los diez tipos de arte son la forma de la pieza que vende (curso, módulo 4): cada marca usa de 2 a 4 según su
// estudio de mercado (`kit.tiposArte`) y prueba unas pocas piezas de cada uno. Cada tipo se enlaza con lo que la
// aplicación ya tenía —las composiciones del lote (`COMPOSICIONES` de loteAnuncios.js) y los tipos de contenido
// (`PILARES` de pilares.js)— por sus ids, sin importarlos (son grandes), y con las etapas del ciclo donde mejor va
// (la tabla de las cuatro campañas, módulo 5). Un test comprueba que cada id exista.
//
// Los seis sesgos son lo que mueve a un público a decidir (módulo 2): el estudio de mercado propone de 3 a 5 por
// perfil y el motor los lee. Cada uno apunta a la TÁCTICA del gancho que lo usa (`TACTICAS` de loteAnuncios.js).
//
// Con palabras propias: la licencia del método del curso no deja copiar su texto.
// ============================================================

export const MIN_TIPOS_ARTE = 2;
export const MAX_TIPOS_ARTE = 4;

/**
 * Los diez tipos de arte. `composiciones`: ids de COMPOSICIONES que lo dibujan; `pilares`: ids de PILARES con los que
 * suele ir; `etapas`: las del ciclo (cicloVentas.js) donde mejor funciona.
 */
export const TIPOS_ARTE = Object.freeze([
  { id: "demostracion", nombre: "Demostración", ayuda: "Enseña cómo funciona el producto o el servicio, en uso.",
    composiciones: ["uso", "oficio", "ambiente"], pilares: ["servicios", "educativo"], etapas: ["presentacion"] },
  { id: "testimonio", nombre: "Testimonio", ayuda: "Clientes reales que cuentan su experiencia: da credibilidad (sólo con testimonios que existan).",
    composiciones: ["ugc", "emocion"], pilares: ["maletas", "humano"], etapas: ["evaluacion", "conversion"] },
  { id: "prensa", nombre: "Prensa", ayuda: "Un medio, un premio o una autoridad respalda a la marca (sólo si es real): casi un testimonio.",
    composiciones: ["tipografica", "serie"], pilares: ["diferenciador"], etapas: ["presentacion", "evaluacion", "conversion"] },
  { id: "aspiracional", nombre: "Aspiracional", ayuda: "Junta el producto con la persona que quien lo ve quiere llegar a ser.",
    composiciones: ["ambiente", "emocion", "uso"], pilares: ["humano", "anuncio"], etapas: ["presentacion"] },
  { id: "beneficios", nombre: "Beneficios", ayuda: "Lo que gana quien lo compra, dicho y enseñado.",
    composiciones: ["heroe", "tipografica", "cenital"], pilares: ["beneficios", "servicios"], etapas: ["presentacion", "evaluacion"] },
  { id: "producto", nombre: "Producto", ayuda: "El producto es el centro de la pieza.",
    composiciones: ["heroe", "macro", "unboxing", "cenital", "serie"], pilares: ["anuncio", "servicios"], etapas: ["evaluacion", "conversion", "ascension"] },
  { id: "promocion", nombre: "Promoción", ayuda: "La oferta que recibe quien compra: el precio, un regalo o una condición (sólo la que existe).",
    composiciones: ["tipografica", "heroe"], pilares: ["beneficios", "anuncio"], etapas: ["conversion", "ascension"] },
  { id: "dividida", nombre: "Pantalla dividida", ayuda: "Una línea parte la pieza en dos: antes y después, esto frente a aquello, o dos cosas que se complementan.",
    composiciones: ["dividida"], pilares: ["diferenciador", "maletas"], etapas: ["presentacion"] },
  { id: "educativo", nombre: "Educativo", ayuda: "Enseña algo útil para ganarse la confianza; funciona muy bien con cursos y servicios.",
    composiciones: ["tipografica", "oficio", "serie"], pilares: ["educativo"], etapas: ["presentacion"] },
  { id: "humano", nombre: "Humano", ayuda: "Lo emocional: personas, el equipo, lo que la empresa hace por otros.",
    composiciones: ["emocion", "ugc", "oficio"], pilares: ["humano"], etapas: ["presentacion"] },
]);
const ARTE_POR_ID = new Map(TIPOS_ARTE.map((t) => [t.id, t]));

/** El tipo de arte de un id, o null. Pura. */
export const tipoArteDe = (id) => ARTE_POR_ID.get(String(id ?? "")) ?? null;

/** Los tipos de arte que mejor van en una etapa del ciclo (por su id, ya resuelto). Pura. */
export const tiposArteDeEtapa = (etapa) => TIPOS_ARTE.filter((t) => t.etapas.includes(etapa));

/** Los tipos de arte de una marca, limpios: ids que existen, sin repetir, como mucho MAX_TIPOS_ARTE. Pura. */
export function limpiarTiposArte(ids) {
  const salida = [];
  for (const x of Array.isArray(ids) ? ids : []) {
    const id = String(x ?? "");
    if (ARTE_POR_ID.has(id) && !salida.includes(id)) salida.push(id);
    if (salida.length >= MAX_TIPOS_ARTE) break;
  }
  return salida;
}

/**
 * El tipo de arte de una publicación: el que traiga escrito (`tipoArte`); si no, el que dibuja su composición CON su
 * tipo de contenido; si no casan los dos, el de su composición; si no, el de su tipo de contenido. En cada paso van
 * primero los de la marca (`artesMarca`, kit.tiposArte). "" si no se sabe. UNA regla para el plan de campañas y para
 * lo que se aprende de los anuncios: con dos, la misma pieza contaría como un tipo en el plan y como otro al aprender.
 * Pura.
 */
export function tipoArteDePost(post, artesMarca = []) {
  if (tipoArteDe(post?.tipoArte)) return post.tipoArte;
  const marca = limpiarTiposArte(artesMarca);
  const orden = [...TIPOS_ARTE.filter((t) => marca.includes(t.id)), ...TIPOS_ARTE.filter((t) => !marca.includes(t.id))];
  const comp = String(post?.composicion ?? "");
  const pilar = String(post?.pilar ?? "");
  if (comp && pilar) {
    const ambos = orden.find((t) => t.composiciones.includes(comp) && t.pilares.includes(pilar));
    if (ambos) return ambos.id;
  }
  if (comp) {
    const deComp = orden.find((t) => t.composiciones.includes(comp));
    if (deComp) return deComp.id;
  }
  return pilar ? orden.find((t) => t.pilares.includes(pilar))?.id ?? "" : "";
}

/**
 * La línea que leen el director y el motor de ideas con los tipos de arte de la marca (`kit.tiposArte`), o "". Va
 * aparte del bloque de la marca a propósito: ése va en TODA pieza al motor de imagen, y esto es para quien diseña. Pura.
 */
export function lineaDeTiposArte(ids) {
  const lista = limpiarTiposArte(ids).map(tipoArteDe);
  if (!lista.length) return "";
  return `Tipos de arte de esta marca (los que le funcionan: cada pieza sale de uno de ellos, salvo que la pieza pida otro): ${lista.map((t) => `${t.nombre} (${t.ayuda.replace(/\.$/, "").toLowerCase()})`).join("; ")}.`;
}

// ------------------------------------------------------------
// Los sesgos
// ------------------------------------------------------------

export const MAX_SESGOS = 5;

/** Los seis sesgos. `tactica`: el id de TACTICAS (loteAnuncios.js) con que se escribe el gancho que lo usa. */
export const SESGOS = Object.freeze([
  { id: "reciprocidad", nombre: "Reciprocidad", ayuda: "Quien recibe algo de valor quiere devolverlo: dar primero (un consejo, una muestra, un regalo real).", tactica: "reciprocidad" },
  { id: "empatia", nombre: "Empatía", ayuda: "Se le compra a quien cae bien y entiende: hablar como alguien cercano que vive lo mismo.", tactica: "empatia" },
  { id: "prueba-social", nombre: "Prueba social", ayuda: "Se hace lo que hacen los demás: clientes, reseñas y cifras reales.", tactica: "prueba" },
  { id: "autoridad", nombre: "Autoridad", ayuda: "Se le hace caso a quien sabe: experiencia, certificaciones, un experto que respalda.", tactica: "autoridad" },
  { id: "escasez", nombre: "Escasez", ayuda: "Lo que se acaba vale más: pocas unidades o una fecha límite (sólo si es verdad).", tactica: "urgencia" },
  { id: "microcompromiso", nombre: "Micro-compromiso", ayuda: "Tras un primer paso pequeño se sigue: pedir algo fácil antes que la compra.", tactica: "microcompromiso" },
]);
const SESGO_POR_ID = new Map(SESGOS.map((s) => [s.id, s]));
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** El id de un sesgo por su id o su nombre («Prueba social», «micro-compromiso», «empatía»), o "". Pura. */
export function idSesgo(x) {
  const k = sinTildes(x);
  if (!k) return "";
  if (SESGO_POR_ID.has(k)) return k;
  const plano = k.replace(/[\s_-]+/g, "");
  return SESGOS.find((s) => s.id.replace(/-/g, "") === plano || sinTildes(s.nombre).replace(/[\s-]+/g, "") === plano)?.id ?? "";
}

/** El sesgo de un id o nombre, o null. Pura. */
export const sesgoDe = (x) => SESGO_POR_ID.get(idSesgo(x)) ?? null;

/** Los sesgos de un perfil, limpios: los que existen, sin repetir, como mucho MAX_SESGOS. Pura. */
export function limpiarSesgos(lista) {
  const salida = [];
  for (const x of Array.isArray(lista) ? lista : []) {
    const id = idSesgo(x);
    if (id && !salida.includes(id)) salida.push(id);
    if (salida.length >= MAX_SESGOS) break;
  }
  return salida;
}

/** Los nombres de unos sesgos, en una frase («Reciprocidad, Prueba social»). Pura. */
export const nombresDeSesgos = (ids) => limpiarSesgos(ids).map((id) => SESGO_POR_ID.get(id).nombre).join(", ");
