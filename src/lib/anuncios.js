// ============================================================
// Anuncios de Meta (Marketing API): lo puro
//
// Lo que sabe decir sin hablar con nadie: qué objetivos hay y qué pide
// cada uno, cómo se convierte un presupuesto a lo que entiende Meta, si
// lo que escribió la persona en el asistente vale, y el CUERPO de cada
// llamada que crea algo. Lo importan la página /campanas y el Worker
// (worker/lib/anuncios.js): la regla es una sola.
//
// LA REGLA DEL DINERO: todo lo que se crea sale en `PAUSED` —campaña,
// conjunto y anuncio—. Los constructores de aquí abajo lo fijan ellos y
// no admiten otro valor; activar es otra llamada, de administrador y con
// confirmación, en el servidor.
//
// Lo que NO se ha probado contra Meta: estos cuerpos siguen la
// documentación de la Marketing API (ODAX, `is_adset_budget_sharing_enabled`,
// `targeting_automation.advantage_audience`, `instagram_user_id`), pero los
// tests hablan con un `fetch` de mentira. Lo primero con una cuenta real es
// crear una campaña de tráfico con 1 $ al día y mirarla en el Administrador
// de anuncios antes de activar nada.
// ============================================================

import { sumarDias } from "./agenda.js";

/** Los permisos de anuncios. Tienen App Review: se piden aparte, nunca en PERMISOS_META. */
export const PERMISOS_ANUNCIOS = Object.freeze(["ads_read", "ads_management"]);

/** Los que faltan de PERMISOS_ANUNCIOS en lo concedido (null si no se sabe). */
export const permisosAnunciosQueFaltan = (concedidos) =>
  (Array.isArray(concedidos) ? PERMISOS_ANUNCIOS.filter((p) => !concedidos.includes(p)) : null);

// ------------------------------------------------------------
// Objetivos (ODAX) y lo que pide cada uno
// ------------------------------------------------------------

/**
 * `optimizacion` y `destino` van al conjunto de anuncios. `pixel` dice si
 * hace falta un píxel de Meta (conversiones en la web) y con qué evento.
 * `acciones` son los `action_type` de /insights que cuentan como resultado,
 * por orden de preferencia; `alcance` cuenta personas en vez de acciones.
 */
/** Una conversación de WhatsApp (o Messenger) empezada por el anuncio, en /insights. */
export const ACCION_MENSAJE = "onsite_conversion.messaging_conversation_started_7d";

export const OBJETIVOS = Object.freeze({
  OUTCOME_AWARENESS: {
    nombre: "Reconocimiento", descripcion: "Que te vea el mayor número de personas.",
    optimizacion: "REACH", destino: null, pixel: null, resultado: "Personas alcanzadas", alcance: true, acciones: [],
  },
  OUTCOME_TRAFFIC: {
    nombre: "Tráfico", descripcion: "Llevar gente a la web, la tienda o WhatsApp.",
    optimizacion: "LINK_CLICKS", destino: "WEBSITE", pixel: null, resultado: "Clics en el enlace", acciones: ["link_click"],
  },
  OUTCOME_ENGAGEMENT: {
    nombre: "Interacción", descripcion: "Más reacciones, comentarios y compartidos.",
    optimizacion: "POST_ENGAGEMENT", destino: "ON_POST", pixel: null, resultado: "Interacciones",
    // Con destino WhatsApp, el resultado es la conversación empezada.
    acciones: [ACCION_MENSAJE, "post_engagement", "page_engagement"],
  },
  OUTCOME_LEADS: {
    nombre: "Clientes potenciales", descripcion: "Contactos en la web (necesita el píxel de Meta).",
    optimizacion: "OFFSITE_CONVERSIONS", destino: "WEBSITE", pixel: "LEAD", resultado: "Clientes potenciales",
    acciones: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  },
  OUTCOME_SALES: {
    nombre: "Ventas", descripcion: "Compras en la web (necesita el píxel de Meta).",
    optimizacion: "OFFSITE_CONVERSIONS", destino: "WEBSITE", pixel: "PURCHASE", resultado: "Compras",
    acciones: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", ACCION_MENSAJE],
  },
});

/**
 * Las campañas de antes de ODAX (creadas fuera de la app) siguen saliendo
 * en la lista con su objetivo viejo: se leen con el equivalente nuevo.
 */
const OBJETIVOS_VIEJOS = Object.freeze({
  BRAND_AWARENESS: "OUTCOME_AWARENESS", REACH: "OUTCOME_AWARENESS", LINK_CLICKS: "OUTCOME_TRAFFIC",
  POST_ENGAGEMENT: "OUTCOME_ENGAGEMENT", PAGE_LIKES: "OUTCOME_ENGAGEMENT", VIDEO_VIEWS: "OUTCOME_ENGAGEMENT",
  MESSAGES: "OUTCOME_ENGAGEMENT", LEAD_GENERATION: "OUTCOME_LEADS", CONVERSIONS: "OUTCOME_SALES",
  PRODUCT_CATALOG_SALES: "OUTCOME_SALES", OUTCOME_APP_PROMOTION: null,
});

export const objetivoODAX = (objetivo) => (OBJETIVOS[objetivo] ? objetivo : OBJETIVOS_VIEJOS[objetivo] ?? null);
export const nombreObjetivo = (objetivo) => OBJETIVOS[objetivoODAX(objetivo)]?.nombre ?? (objetivo ? String(objetivo) : "Sin objetivo");

/** Categorías especiales: vivienda, empleo, crédito y política tienen reglas de público propias. */
export const CATEGORIAS_ESPECIALES = Object.freeze([
  { id: "HOUSING", nombre: "Vivienda" },
  { id: "EMPLOYMENT", nombre: "Empleo" },
  { id: "FINANCIAL_PRODUCTS_SERVICES", nombre: "Productos y servicios financieros" },
  { id: "ISSUES_ELECTIONS_POLITICS", nombre: "Temas sociales, elecciones o política" },
]);

/** Los botones del anuncio (`call_to_action.type`). */
export const BOTONES = Object.freeze([
  { id: "LEARN_MORE", nombre: "Más información" },
  { id: "SHOP_NOW", nombre: "Comprar" },
  { id: "ORDER_NOW", nombre: "Pedir ahora" },
  { id: "BOOK_TRAVEL", nombre: "Reservar" },
  { id: "CONTACT_US", nombre: "Contactarnos" },
  { id: "SIGN_UP", nombre: "Registrarte" },
  { id: "GET_QUOTE", nombre: "Pedir presupuesto" },
  { id: "GET_OFFER", nombre: "Ver oferta" },
  { id: "SUBSCRIBE", nombre: "Suscribirte" },
  { id: "APPLY_NOW", nombre: "Solicitar" },
]);

/** Los países que más usa la agencia; el resto se escribe por su código ISO. */
export const PAISES = Object.freeze([
  ["PA", "Panamá"], ["CR", "Costa Rica"], ["CO", "Colombia"], ["MX", "México"], ["GT", "Guatemala"], ["SV", "El Salvador"],
  ["HN", "Honduras"], ["NI", "Nicaragua"], ["DO", "República Dominicana"], ["PR", "Puerto Rico"], ["VE", "Venezuela"],
  ["EC", "Ecuador"], ["PE", "Perú"], ["CL", "Chile"], ["AR", "Argentina"], ["UY", "Uruguay"], ["PY", "Paraguay"],
  ["BO", "Bolivia"], ["US", "Estados Unidos"], ["ES", "España"],
].map(([codigo, nombre]) => ({ codigo, nombre })));

export const nombrePais = (codigo) => PAISES.find((p) => p.codigo === codigo)?.nombre ?? codigo;

// ------------------------------------------------------------
// Rangos de fechas de las estadísticas
// ------------------------------------------------------------

export const RANGOS = Object.freeze({
  7: { preset: "last_7d", nombre: "Últimos 7 días", dias: 7 },
  30: { preset: "last_30d", nombre: "Últimos 30 días", dias: 30 },
  90: { preset: "last_90d", nombre: "Últimos 90 días", dias: 90 },
});

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo que va a /insights: `date_preset` para los tres de siempre, o
 * `time_range` si llegan dos fechas válidas (y en orden). Un rango raro
 * cae en 30 días en vez de fallar: es una estadística, no dinero.
 */
export function rangoInsights({ rango = 30, desde = "", hasta = "" } = {}) {
  if (FECHA.test(desde) && FECHA.test(hasta) && desde <= hasta) {
    return { time_range: JSON.stringify({ since: desde, until: hasta }) };
  }
  return { date_preset: (RANGOS[rango] ?? RANGOS[30]).preset };
}

/** El mismo rango como modificador de un campo expandido: `insights.date_preset(last_30d){…}`. */
export function modificadorInsights(r) {
  if (r.time_range) return `.time_range(${r.time_range})`;
  return `.date_preset(${r.date_preset})`;
}

// ------------------------------------------------------------
// Dinero: la moneda de la cuenta y sus unidades menores
// ------------------------------------------------------------

/**
 * Meta recibe los presupuestos en la unidad MENOR de la moneda de la
 * cuenta (centavos del dólar). Las monedas sin decimales van tal cual: sus
 * presupuestos se escriben en pesos enteros, y multiplicarlos por 100
 * pediría cien veces más dinero. Lista de la tabla de monedas de Meta.
 */
const SIN_DECIMALES = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);

export const factorMoneda = (moneda) => (SIN_DECIMALES.has(String(moneda ?? "").toUpperCase()) ? 1 : 100);

/** 12.5 USD → 1250. Redondea al centavo: 12.345 no es un presupuesto. */
export const aMenores = (monto, moneda) => Math.round(Number(monto) * factorMoneda(moneda));

/** 1250 → 12.5 USD. Lo que devuelve Meta en presupuestos (cadena de unidades menores). */
export const deMenores = (menores, moneda) => (menores == null || menores === "" ? null : Number(menores) / factorMoneda(moneda));

/** «$12.50». El gasto de /insights ya viene en unidades MAYORES (cadena decimal). */
export function formatoMoneda(valor, moneda = "USD") {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency: moneda || "USD", maximumFractionDigits: factorMoneda(moneda) === 1 ? 0 : 2 }).format(Number(valor));
  } catch {
    return `${Number(valor).toFixed(2)} ${moneda}`;
  }
}

// ------------------------------------------------------------
// El asistente: el borrador y su validación
// ------------------------------------------------------------

export const EDAD_MIN = 18;
export const EDAD_MAX = 65;
/** Con categoría especial, Meta no deja radios de ciudad por debajo de 15 millas. */
export const RADIO_MIN_ESPECIAL_KM = 25;
export const MAX_TEXTO = 2000;
export const MAX_TITULO = 255;

/** Días entre dos fechas YYYY-MM-DD, contando las dos. */
export function diasEntre(desde, hasta) {
  if (!FECHA.test(desde) || !FECHA.test(hasta)) return 0;
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1;
}

// ------------------------------------------------------------
// El borrador: una campaña con sus conjuntos (públicos) y sus anuncios
//
// La agencia monta las campañas de ventas con 2 o 3 conjuntos —por
// intereses, Advantage+ y similares— y de 4 a 6 anuncios que van en todos
// ellos: así Meta reparte y se ve qué público y qué pieza funcionan. Cada
// conjunto lleva su presupuesto; las fechas son de la campaña. Cada anuncio
// es una imagen o un video, o un carrusel de 2 a 10 tarjetas.
//
// El destino puede ser la web o WHATSAPP (conversaciones): con WhatsApp no
// hay enlace ni botón que escoger, y el número es el de la página.
// ------------------------------------------------------------

export const MAX_CONJUNTOS = 3;
export const MAX_ANUNCIOS = 6;
export const MIN_TARJETAS = 2;
export const MAX_TARJETAS = 10;
export const MAX_INTERESES = 25;
/** La dirección que lleva un anuncio a WhatsApp: el número es el de la página conectada. */
export const ENLACE_WHATSAPP = "https://api.whatsapp.com/send";

/** A dónde lleva el anuncio. WhatsApp sólo con los objetivos que Meta deja (conversaciones o clics). */
export const DESTINOS = Object.freeze({
  web: { nombre: "Web o tienda", descripcion: "El botón abre un enlace." },
  whatsapp: { nombre: "WhatsApp", descripcion: "El botón abre una conversación con el número de la página.", objetivos: ["OUTCOME_ENGAGEMENT", "OUTCOME_SALES", "OUTCOME_TRAFFIC"] },
});

/** El destino que vale para este borrador: WhatsApp sólo si el objetivo lo admite. */
export const destinoDe = (b) => (b?.destino === "whatsapp" && DESTINOS.whatsapp.objetivos.includes(b?.objetivo) ? "whatsapp" : "web");

/**
 * Qué se optimiza y con qué destino, según el objetivo y a dónde lleva. Con WhatsApp: conversaciones (ventas,
 * interacción) o clics (tráfico), y nada de píxel.
 */
export function optimizacionDe(b) {
  const obj = OBJETIVOS[b?.objetivo];
  if (!obj) return null;
  if (destinoDe(b) === "whatsapp") {
    return b.objetivo === "OUTCOME_TRAFFIC"
      ? { optimizacion: "LINK_CLICKS", destino: "WHATSAPP", pixel: null, conversaciones: false }
      : { optimizacion: "CONVERSATIONS", destino: "WHATSAPP", pixel: null, conversaciones: true };
  }
  return { optimizacion: obj.optimizacion, destino: obj.destino, pixel: obj.pixel, conversaciones: false };
}

/** Las formas de público de un conjunto. */
export const TIPOS_CONJUNTO = Object.freeze({
  intereses: { nombre: "Intereses", ayuda: "Gente interesada en lo que escojas (buscados en Meta)." },
  advantage: { nombre: "Advantage+", ayuda: "Meta busca el público por su cuenta; los intereses van como sugerencia." },
  similares: { nombre: "Similares", ayuda: "Gente parecida a un público que ya existe (clientes, quien escribió…)." },
  abierto: { nombre: "Abierto", ayuda: "Sólo lugar, edad y sexo." },
});

const publicoVacio = () => ({ paises: ["PA"], ciudades: [], edadMin: EDAD_MIN, edadMax: EDAD_MAX, sexo: "todos", intereses: [], similares: [] });
export const conjuntoVacio = (tipo = "intereses") => ({ nombre: "", tipo, presupuesto: { tipo: "diario", monto: "" }, publico: publicoVacio() });
export const tarjetaVacia = () => ({ medio: null, titulo: "", descripcion: "", enlace: "" });
export const anuncioVacio = () => ({ nombre: "", formato: "unico", medio: null, tarjetas: [], texto: "", titulo: "", descripcion: "", enlace: "", boton: "LEARN_MORE" });

export function borradorVacio(hoy = "") {
  return {
    nombre: "",
    objetivo: "OUTCOME_TRAFFIC",
    destino: "web",
    categorias: [],
    paisCategoria: "PA",
    inicio: hoy,
    fin: "",
    pixelId: "",
    conjuntos: [conjuntoVacio("abierto")],
    anuncios: [anuncioVacio()],
  };
}

/**
 * El borrador en su forma de hoy. Los de antes (un `presupuesto`, un `publico` y un `anuncio`) se leen como un conjunto
 * y un anuncio: las campañas guardadas y quien llame con la forma vieja siguen valiendo. Pura.
 */
export function normalizarBorrador(b = {}) {
  const conjuntos = Array.isArray(b.conjuntos) && b.conjuntos.length
    ? b.conjuntos
    : [{ nombre: "", tipo: b.publico?.intereses?.length ? "intereses" : "abierto", presupuesto: b.presupuesto ?? { tipo: "diario", monto: "" }, publico: b.publico ?? publicoVacio() }];
  const anuncios = Array.isArray(b.anuncios) && b.anuncios.length ? b.anuncios : [{ ...anuncioVacio(), ...(b.anuncio ?? {}), formato: "unico" }];
  return {
    ...b,
    destino: destinoDe(b),
    conjuntos: conjuntos.map((c) => ({ ...conjuntoVacio(c?.tipo), ...c, publico: { ...publicoVacio(), ...(c?.publico ?? {}) } })),
    anuncios: anuncios.map((a) => ({ ...anuncioVacio(), ...a, tarjetas: Array.isArray(a?.tarjetas) ? a.tarjetas : [] })),
  };
}

const esEnlace = (t) => {
  try { const u = new URL(String(t ?? "")); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
};

/** Lo que está mal de un medio ya escogido (imagen con hash, video listo en Meta). */
function faltaDelMedio(medio, { soloImagen = false } = {}) {
  if (!medio?.clave) return "Escoge una imagen o un video.";
  if (soloImagen && medio.tipo !== "imagen") return "En un carrusel, cada tarjeta es una imagen.";
  if (medio.tipo === "imagen" && !medio.hash) return "La imagen aún no está en Meta: espera a que termine de subir.";
  if (medio.tipo === "video" && !(medio.videoId && medio.listo)) return "El video aún no está listo en Meta: espera a que termine de procesarse.";
  if (!["imagen", "video"].includes(medio.tipo)) return "Ese archivo no es ni imagen ni video.";
  return "";
}

/** Los pasos del asistente. */
export const PASOS_CAMPANA = Object.freeze(["Objetivo", "Públicos", "Anuncios", "Revisar"]);

/**
 * Lo que está mal del borrador, paso a paso: [{ paso, campo, mensaje, indice? }].
 * La misma función la usan el asistente (para no dejar avanzar) y el
 * servidor (para no crear): lo que la pantalla deja pasar y el servidor
 * no, es un fallo de la pantalla, no del dinero.
 *
 *   1. Objetivo, destino, categorías, píxel y FECHAS (son de la campaña)
 *   2. Los conjuntos: presupuesto y público de cada uno
 *   3. Los anuncios
 *
 * `moneda` y `minimoDiario` (unidades menores, de la cuenta) vienen de la
 * cuenta publicitaria; `hoy` es la fecha de la zona de la cuenta.
 */
export function validarBorrador(entrada = {}, { moneda = "USD", minimoDiario = null, hoy = "" } = {}) {
  const b = normalizarBorrador(entrada);
  const e = [];
  const mal = (paso, campo, mensaje, indice) => e.push({ paso, campo, mensaje, ...(indice != null ? { indice } : {}) });
  const obj = OBJETIVOS[b.objetivo];
  const opt = optimizacionDe(b);
  const whatsapp = destinoDe(b) === "whatsapp";

  // 1. Objetivo, nombre, destino y fechas
  if (!obj) mal(1, "objetivo", "Escoge un objetivo.");
  if (!String(b.nombre ?? "").trim()) mal(1, "nombre", "Ponle un nombre a la campaña.");
  else if (String(b.nombre).length > 200) mal(1, "nombre", "El nombre es demasiado largo (máximo 200 caracteres).");
  if (entrada.destino === "whatsapp" && !whatsapp) mal(1, "destino", "WhatsApp sólo va con Ventas, Interacción o Tráfico.");
  const categorias = Array.isArray(b.categorias) ? b.categorias : [];
  const validas = new Set(CATEGORIAS_ESPECIALES.map((c) => c.id));
  if (categorias.some((c) => !validas.has(c))) mal(1, "categorias", "Hay una categoría especial que no existe.");
  if (categorias.length && !/^[A-Z]{2}$/.test(String(b.paisCategoria ?? ""))) mal(1, "paisCategoria", "Di en qué país aplica la categoría especial.");
  if (opt?.pixel && !String(b.pixelId ?? "").trim()) mal(1, "pixelId", `Para «${obj.nombre}» en la web hace falta el píxel de Meta de la web del cliente (o lleva la campaña a WhatsApp).`);
  if (!FECHA.test(b.inicio ?? "")) mal(1, "inicio", "Escoge la fecha de inicio.");
  else if (hoy && b.inicio < hoy) mal(1, "inicio", "La fecha de inicio ya pasó.");
  if (b.fin && !FECHA.test(b.fin)) mal(1, "fin", "La fecha de fin no es válida.");
  if (FECHA.test(b.inicio ?? "") && FECHA.test(b.fin ?? "") && b.fin < b.inicio) mal(1, "fin", "La fecha de fin es anterior a la de inicio.");

  // 2. Los conjuntos
  if (b.conjuntos.length > MAX_CONJUNTOS) mal(2, "conjuntos", `Como mucho ${MAX_CONJUNTOS} conjuntos por campaña.`);
  const varios = b.conjuntos.length > 1;
  b.conjuntos.slice(0, MAX_CONJUNTOS).forEach((c, i) => {
    const de = (m) => (varios ? `Conjunto ${i + 1}: ${m.charAt(0).toLowerCase()}${m.slice(1)}` : m);
    const m2 = (campo, mensaje) => mal(2, campo, de(mensaje), varios ? i : undefined);
    if (!TIPOS_CONJUNTO[c.tipo]) m2("tipo", "Escoge el tipo de público.");
    // Presupuesto
    const p = c.presupuesto ?? {};
    const monto = Number(p.monto);
    const menores = aMenores(monto, moneda);
    const minimo = Number(minimoDiario) > 0 ? Number(minimoDiario) : factorMoneda(moneda);
    if (!["diario", "total"].includes(p.tipo)) m2("presupuesto", "Escoge presupuesto diario o total.");
    if (!(monto > 0)) m2("monto", "Escribe cuánto quieres gastar.");
    if (p.tipo === "total" && !b.fin) m2("fin", "Con presupuesto total hace falta una fecha de fin (en el primer paso).");
    if (monto > 0) {
      const dias = p.tipo === "total" ? Math.max(1, diasEntre(b.inicio, b.fin)) : 1;
      if (menores / dias < minimo) {
        m2("monto", p.tipo === "total"
          ? `Con ${dias} días, el total no llega al mínimo diario de la cuenta (${formatoMoneda(deMenores(minimo, moneda), moneda)} al día).`
          : `El mínimo diario de la cuenta es ${formatoMoneda(deMenores(minimo, moneda), moneda)}.`);
      }
    }
    // Público
    const pub = c.publico ?? {};
    const paises = Array.isArray(pub.paises) ? pub.paises : [];
    const ciudades = Array.isArray(pub.ciudades) ? pub.ciudades : [];
    if (!paises.length && !ciudades.length) m2("paises", "Escoge al menos un país o una ciudad.");
    if (paises.some((x) => !/^[A-Z]{2}$/.test(String(x)))) m2("paises", "Hay un código de país que no es válido (dos letras, como PA).");
    if (ciudades.some((x) => !x?.key)) m2("ciudades", "Hay una ciudad sin identificador de Meta: búscala otra vez.");
    const repetidas = ciudades.filter((x) => paises.includes(x.pais)).map((x) => x.nombre);
    if (repetidas.length) m2("ciudades", `Meta no admite un país y sus ciudades a la vez: quita el país o ${repetidas.join(", ")}.`);
    const edadMin = Number(pub.edadMin);
    const edadMax = Number(pub.edadMax);
    if (!(edadMin >= EDAD_MIN && edadMin <= EDAD_MAX) || !(edadMax >= EDAD_MIN && edadMax <= EDAD_MAX)) m2("edad", `La edad va de ${EDAD_MIN} a ${EDAD_MAX}+.`);
    else if (edadMin > edadMax) m2("edad", "La edad mínima es mayor que la máxima.");
    if (!["todos", "hombres", "mujeres"].includes(pub.sexo ?? "todos")) m2("sexo", "Sexo no válido.");
    const intereses = Array.isArray(pub.intereses) ? pub.intereses : [];
    const similares = Array.isArray(pub.similares) ? pub.similares : [];
    if (intereses.some((x) => !/^\d{1,30}$/.test(String(x?.id ?? "")))) m2("intereses", "Hay un interés sin identificador de Meta: búscalo otra vez.");
    if (intereses.length > MAX_INTERESES) m2("intereses", `Como mucho ${MAX_INTERESES} intereses.`);
    if (c.tipo === "intereses" && !intereses.length) m2("intereses", "Escoge al menos un interés (o cambia el tipo a «Abierto»).");
    if (c.tipo === "similares" && !similares.length) m2("similares", "Escoge el público similar.");
    if (similares.some((x) => !/^\d{1,30}$/.test(String(x?.id ?? "")))) m2("similares", "Hay un público sin identificador de Meta.");
    if (c.tipo === "advantage" && edadMin > 25) m2("edad", "Con Advantage+, la edad mínima puede ser como mucho 25 (Meta amplía el resto).");
    if (categorias.length) {
      if (edadMin !== EDAD_MIN || edadMax !== EDAD_MAX) m2("edad", "Con categoría especial, Meta exige todas las edades (18 a 65+).");
      if ((pub.sexo ?? "todos") !== "todos") m2("sexo", "Con categoría especial, Meta no deja escoger el sexo.");
      if (ciudades.some((x) => Number(x.radio ?? RADIO_MIN_ESPECIAL_KM) < RADIO_MIN_ESPECIAL_KM)) {
        m2("ciudades", `Con categoría especial, el radio de una ciudad es de ${RADIO_MIN_ESPECIAL_KM} km o más.`);
      }
      if (c.tipo === "similares") m2("similares", "Con categoría especial, Meta no admite públicos similares.");
    }
  });

  // 3. Los anuncios
  if (b.anuncios.length > MAX_ANUNCIOS) mal(3, "anuncios", `Como mucho ${MAX_ANUNCIOS} anuncios por campaña.`);
  const variosA = b.anuncios.length > 1;
  b.anuncios.slice(0, MAX_ANUNCIOS).forEach((a, i) => {
    const m3 = (campo, mensaje) => mal(3, campo, variosA ? `Anuncio ${i + 1}: ${mensaje.charAt(0).toLowerCase()}${mensaje.slice(1)}` : mensaje, variosA ? i : undefined);
    if (a.formato === "carrusel") {
      const t = a.tarjetas ?? [];
      if (t.length < MIN_TARJETAS || t.length > MAX_TARJETAS) m3("tarjetas", `Un carrusel lleva de ${MIN_TARJETAS} a ${MAX_TARJETAS} tarjetas.`);
      t.forEach((x, j) => {
        const falta = faltaDelMedio(x.medio, { soloImagen: true });
        if (falta) m3("tarjetas", `Tarjeta ${j + 1}: ${falta.charAt(0).toLowerCase()}${falta.slice(1)}`);
        if (String(x.titulo ?? "").length > MAX_TITULO) m3("tarjetas", `Tarjeta ${j + 1}: el título pasa de ${MAX_TITULO} caracteres.`);
        if (!whatsapp && x.enlace && !esEnlace(x.enlace)) m3("tarjetas", `Tarjeta ${j + 1}: el enlace no es una dirección web.`);
      });
    } else if (a.formato === "unico") {
      const falta = faltaDelMedio(a.medio);
      if (falta) m3("medio", falta);
    } else m3("formato", "Escoge si es una imagen o video, o un carrusel.");
    if (!String(a.texto ?? "").trim()) m3("texto", "Escribe el texto del anuncio.");
    else if (String(a.texto).length > MAX_TEXTO) m3("texto", `El texto pasa de ${MAX_TEXTO} caracteres.`);
    if (String(a.titulo ?? "").length > MAX_TITULO) m3("titulo", `El título pasa de ${MAX_TITULO} caracteres.`);
    if (!whatsapp) {
      if (!esEnlace(a.enlace)) m3("enlace", "Escribe el enlace completo, con https://.");
      if (!BOTONES.some((x) => x.id === a.boton)) m3("boton", "Escoge el botón.");
    }
  });

  return e;
}

/** Los errores de un paso (para no dejar pasar al siguiente). */
export const erroresDelPaso = (errores, paso) => errores.filter((x) => x.paso === paso);

// ------------------------------------------------------------
// Las fechas en la zona de la cuenta
// ------------------------------------------------------------

/** «-05:00» para America/Panama en esa fecha (con horario de verano donde lo haya). */
export function desfaseZona(zona, fecha) {
  try {
    const partes = new Intl.DateTimeFormat("en-US", { timeZone: zona || "UTC", timeZoneName: "longOffset" })
      .formatToParts(new Date(`${fecha}T12:00:00Z`));
    const t = partes.find((x) => x.type === "timeZoneName")?.value ?? "GMT";
    const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(t);
    return m ? `${m[1]}:${m[2] ?? "00"}` : "+00:00";
  } catch {
    return "+00:00";
  }
}

/** El comienzo (00:00) o el final (23:59:59) de un día en la zona de la cuenta, en ISO 8601. */
export const momentoEnZona = (fecha, zona, final = false) => `${fecha}T${final ? "23:59:59" : "00:00:00"}${desfaseZona(zona, fecha)}`;

// ------------------------------------------------------------
// Los cuerpos de cada llamada. TODOS en PAUSED.
// ------------------------------------------------------------

/**
 * El único estado con el que se crea algo. No es un parámetro: una
 * campaña creada activa gasta en cuanto Meta la revisa, sin que nadie
 * haya confirmado nada.
 */
export const ESTADO_AL_CREAR = "PAUSED";

const json = (v) => JSON.stringify(v);

/**
 * La campaña. `is_adset_budget_sharing_enabled` es obligatorio desde que
 * el presupuesto va en el conjunto y no en la campaña (Meta responde
 * 100/4834011 si falta): `false`, para que el gasto sea exactamente el
 * presupuesto que se escribió. `special_ad_categories` también es
 * obligatorio, vacío si no se declara ninguna.
 */
export function cuerpoCampana(b) {
  const categorias = Array.isArray(b.categorias) ? b.categorias : [];
  return {
    name: String(b.nombre).trim(),
    objective: b.objetivo,
    status: ESTADO_AL_CREAR,
    buying_type: "AUCTION",
    special_ad_categories: json(categorias),
    ...(categorias.length ? { special_ad_category_country: json([b.paisCategoria]) } : {}),
    is_adset_budget_sharing_enabled: "false",
  };
}

/**
 * El público, como lo quiere `targeting`. `tipo` es el del conjunto:
 *   · intereses → `flexible_spec` con los intereses; el público es exactamente ese.
 *   · advantage → `advantage_audience: 1`: Meta amplía; los intereses van como sugerencia.
 *   · similares → `custom_audiences` con el público similar.
 *   · abierto   → lugar, edad y sexo.
 */
export function segmentacion(publico = {}, { especial = false, tipo = "abierto" } = {}) {
  const paises = Array.isArray(publico.paises) ? publico.paises : [];
  const ciudades = Array.isArray(publico.ciudades) ? publico.ciudades : [];
  const geo = {
    ...(paises.length ? { countries: paises } : {}),
    ...(ciudades.length ? {
      cities: ciudades.map((c) => ({
        key: String(c.key), radius: Math.max(especial ? RADIO_MIN_ESPECIAL_KM : 0, Number(c.radio ?? 10)) || 10, distance_unit: "kilometer",
      })),
    } : {}),
    location_types: ["home", "recent"],
  };
  const sexo = publico.sexo === "hombres" ? [1] : publico.sexo === "mujeres" ? [2] : null;
  const intereses = (Array.isArray(publico.intereses) ? publico.intereses : []).map((x) => ({ id: String(x.id), name: String(x.nombre ?? x.name ?? "") }));
  const similares = (Array.isArray(publico.similares) ? publico.similares : []).map((x) => ({ id: String(x.id) }));
  const advantage = tipo === "advantage";
  return {
    geo_locations: geo,
    age_min: Number(publico.edadMin ?? EDAD_MIN),
    // Con Advantage+ el tope de edad es una sugerencia: Meta exige 65.
    age_max: advantage ? EDAD_MAX : Number(publico.edadMax ?? EDAD_MAX),
    ...(sexo ? { genders: sexo } : {}),
    ...((tipo === "intereses" || advantage) && intereses.length ? { flexible_spec: [{ interests: intereses }] } : {}),
    ...(tipo === "similares" && similares.length ? { custom_audiences: similares } : {}),
    // Desde la v23 hay que decirlo al crear: 0 = el público es EXACTAMENTE
    // el que se escogió; 1 = Advantage+, Meta lo amplía.
    targeting_automation: { advantage_audience: advantage ? 1 : 0 },
  };
}

/** El nombre de cada pieza en Meta: con un solo conjunto o anuncio, el de siempre; con varios, el suyo. */
const nombreDe = (b, que, lista, i) => {
  const base = String(b.nombre).trim();
  if (lista.length <= 1) return `${base} · ${que}`;
  const propio = String(lista[i]?.nombre ?? "").trim();
  return `${base} · ${propio || `${que} ${i + 1}`}`;
};

/**
 * Un conjunto de anuncios (`indice`, el primero si no se dice): presupuesto, fechas, público, optimización. Con
 * WhatsApp y conversaciones, `promoted_object` es la página (su número de WhatsApp).
 */
export function cuerpoConjunto(entrada, { campanaId, moneda = "USD", zona = "UTC", hoy = "", paginaId = null, indice = 0 }) {
  const b = normalizarBorrador(entrada);
  const c = b.conjuntos[indice];
  const opt = optimizacionDe(b);
  const monto = aMenores(c.presupuesto?.monto, moneda);
  const especial = Array.isArray(b.categorias) && b.categorias.length > 0;
  // Si empieza hoy no se manda la hora: empieza cuando se ACTIVE. Una
  // hora de inicio que ya pasó la rechaza Meta en algunos casos.
  const empiezaHoy = !b.inicio || (hoy && b.inicio <= hoy);
  const promovido = opt.pixel ? { pixel_id: String(b.pixelId), custom_event_type: opt.pixel }
    : opt.conversaciones && paginaId ? { page_id: String(paginaId) } : null;
  return {
    name: nombreDe(b, "Conjunto", b.conjuntos, indice),
    campaign_id: campanaId,
    status: ESTADO_AL_CREAR,
    ...(c.presupuesto?.tipo === "total" ? { lifetime_budget: String(monto) } : { daily_budget: String(monto) }),
    billing_event: "IMPRESSIONS",
    optimization_goal: opt.optimizacion,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    ...(opt.destino ? { destination_type: opt.destino } : {}),
    ...(promovido ? { promoted_object: json(promovido) } : {}),
    targeting: json(segmentacion(c.publico, { especial, tipo: c.tipo })),
    ...(empiezaHoy ? {} : { start_time: momentoEnZona(b.inicio, zona) }),
    ...(b.fin ? { end_time: momentoEnZona(b.fin, zona, true) } : {}),
  };
}

/**
 * El creativo de un anuncio (`indice`). Imagen: `link_data` con el hash de /adimages. Video: `video_data` con el id de
 * /advideos y su miniatura (obligatoria; `miniaturas[indice]`). Carrusel: `link_data.child_attachments`, una tarjeta
 * por imagen, cada una con su título. Con WhatsApp, el botón es «Enviar mensaje de WhatsApp» y el enlace el de
 * WhatsApp. Con Instagram asignado al cliente, `instagram_user_id` (el nombre de antes, `instagram_actor_id`, ya no
 * se acepta).
 */
export function cuerpoCreativo(entrada, { paginaId, instagramId = null, miniatura = "", indice = 0 }) {
  const b = normalizarBorrador(entrada);
  const a = b.anuncios[indice];
  const whatsapp = destinoDe(b) === "whatsapp";
  const enlace = whatsapp ? ENLACE_WHATSAPP : a.enlace;
  const boton = whatsapp
    ? { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } }
    : { type: a.boton, value: { link: a.enlace } };
  const base = { page_id: String(paginaId), ...(instagramId ? { instagram_user_id: String(instagramId) } : {}) };
  let historia;
  if (a.formato === "carrusel") {
    historia = {
      ...base,
      link_data: {
        link: enlace, message: a.texto,
        child_attachments: a.tarjetas.map((t) => {
          const propio = !whatsapp && t.enlace ? t.enlace : enlace;
          return {
            link: propio, image_hash: String(t.medio.hash),
            ...(t.titulo ? { name: t.titulo } : {}), ...(t.descripcion ? { description: t.descripcion } : {}),
            call_to_action: whatsapp ? boton : { type: a.boton, value: { link: propio } },
          };
        }),
        // Que Meta ordene las tarjetas por rendimiento y sin la tarjeta final con la foto de perfil.
        multi_share_optimized: true, multi_share_end_card: false,
      },
    };
  } else if (a.medio.tipo === "video") {
    historia = {
      ...base,
      video_data: {
        video_id: String(a.medio.videoId), image_url: miniatura || a.medio.miniatura || "",
        message: a.texto, ...(a.titulo ? { title: a.titulo } : {}), ...(a.descripcion ? { link_description: a.descripcion } : {}), call_to_action: boton,
      },
    };
  } else {
    historia = {
      ...base,
      link_data: {
        image_hash: String(a.medio.hash), link: enlace, message: a.texto,
        ...(a.titulo ? { name: a.titulo } : {}), ...(a.descripcion ? { description: a.descripcion } : {}), call_to_action: boton,
      },
    };
  }
  return { name: nombreDe(b, b.anuncios.length > 1 ? "Anuncio" : "Creativo", b.anuncios, indice), object_story_spec: json(historia) };
}

/** El anuncio: un creativo dentro de un conjunto. `nombre` lo arma quien crea (conjunto × anuncio). */
export function cuerpoAnuncio(b, { conjuntoId, creativoId, nombre = "" }) {
  return {
    name: nombre || `${String(b.nombre).trim()} · Anuncio`,
    adset_id: conjuntoId,
    creative: json({ creative_id: creativoId }),
    status: ESTADO_AL_CREAR,
  };
}

/** Cuánto suma el presupuesto de los conjuntos: { diario, total } (null si no hay de ese tipo). Pura. */
export function presupuestoDelBorrador(entrada) {
  const b = normalizarBorrador(entrada);
  const suma = (tipo) => b.conjuntos.filter((c) => c.presupuesto?.tipo === tipo).reduce((n, c) => n + (Number(c.presupuesto?.monto) || 0), 0);
  const diario = suma("diario");
  const total = suma("total");
  return { diario: diario || null, total: total || null };
}

// ------------------------------------------------------------
// Estadísticas
// ------------------------------------------------------------

/** Los campos de /insights que se piden siempre. */
export const CAMPOS_INSIGHTS = "spend,impressions,reach,cpm,cpc,ctr,clicks,actions";

const num = (v) => (v == null || v === "" ? 0 : Number(v) || 0);

/** Los resultados de una fila de /insights según el objetivo. */
export function resultadosDe(fila, objetivo) {
  const obj = OBJETIVOS[objetivoODAX(objetivo)];
  if (!fila || !obj) return null;
  if (obj.alcance) return num(fila.reach);
  const acciones = Array.isArray(fila.actions) ? fila.actions : [];
  for (const tipo of obj.acciones) {
    const a = acciones.find((x) => x.action_type === tipo);
    if (a) return num(a.value);
  }
  return 0;
}

/** Una fila de /insights como la pinta la pantalla. `objetivo` null = la cuenta entera (sin resultados). */
export function resumenInsights(fila, objetivo = null) {
  const f = fila ?? {};
  const resultados = objetivo ? resultadosDe(f, objetivo) : null;
  const gasto = num(f.spend);
  return {
    gasto,
    impresiones: num(f.impressions),
    alcance: num(f.reach),
    clics: num(f.clicks),
    cpm: f.cpm != null ? num(f.cpm) : null,
    cpc: f.cpc != null ? num(f.cpc) : null,
    ctr: f.ctr != null ? num(f.ctr) : null,
    resultados,
    costoPorResultado: resultados ? gasto / resultados : null,
  };
}

/** Todos los días del rango, con 0 donde Meta no devolvió fila (no gastó ese día). */
export function serieDiaria(filas = [], campo = "spend", { desde = "", hasta = "" } = {}) {
  const porDia = new Map((filas ?? []).map((f) => [f.date_start, num(f[campo])]));
  const dias = [...porDia.keys()].sort();
  const inicio = FECHA.test(desde) ? desde : dias[0];
  const fin = FECHA.test(hasta) ? hasta : dias.at(-1);
  if (!inicio || !fin) return [];
  const salida = [];
  for (let fecha = inicio; fecha <= fin && salida.length < 400; fecha = sumarDias(fecha, 1)) {
    salida.push({ fecha, valor: porDia.get(fecha) ?? 0 });
  }
  return salida;
}

/**
 * Los anuncios del mes para el informe: la cuenta entera y cada campaña
 * que gastó algo, TODAS —las creadas en la app y las del Administrador de
 * anuncios—, de mayor a menor gasto (hasta `max`). `desdeApp`: ids de las
 * campañas que se crearon aquí. Pura.
 */
export function resumenAnunciosDelMes({ cuenta, total, campanas = [], desdeApp = [] }, { max = 10 } = {}) {
  const deAqui = new Set(desdeApp.map(String));
  const lista = campanas
    .map((c) => ({
      id: String(c.id),
      nombre: c.name ?? "",
      objetivo: nombreObjetivo(c.objective),
      estado: estadoAnuncio(c.effective_status ?? c.status).texto,
      desdeApp: deAqui.has(String(c.id)),
      ...resumenInsights(c.insights, c.objective),
    }))
    .filter((c) => c.gasto > 0 || c.impresiones > 0)
    .sort((a, b) => b.gasto - a.gasto);
  return {
    cuenta: cuenta?.nombre ?? "",
    moneda: cuenta?.moneda ?? "USD",
    total: resumenInsights(total),
    campanas: lista.slice(0, max),
    otras: Math.max(0, lista.length - max),
  };
}

/** Cómo se dice el estado de algo de Meta (`effective_status`). */
export function estadoAnuncio(status) {
  const s = String(status ?? "").toUpperCase();
  if (s === "ACTIVE") return { texto: "Activa", tono: "ok" };
  if (s === "PAUSED" || s.endsWith("_PAUSED")) return { texto: s === "PAUSED" ? "En pausa" : "En pausa (por arriba)", tono: "pausa" };
  if (s === "IN_PROCESS" || s === "PENDING_REVIEW" || s === "PREAPPROVED") return { texto: "En revisión", tono: "espera" };
  if (s === "DISAPPROVED" || s === "WITH_ISSUES") return { texto: s === "DISAPPROVED" ? "Rechazada" : "Con problemas", tono: "mal" };
  if (s === "DELETED" || s === "ARCHIVED") return { texto: "Archivada", tono: "pausa" };
  if (s === "PENDING_BILLING_INFO") return { texto: "Falta el método de pago", tono: "mal" };
  return { texto: s ? s.toLowerCase() : "—", tono: "pausa" };
}

/** «10 $ al día · del 1 oct al 15 oct» para el diálogo de activar. */
export function resumenPresupuesto({ diario = null, total = null, inicio = "", fin = "", moneda = "USD" } = {}) {
  // La fecha tal como la escribe Meta, en la zona de la cuenta
  // («2026-10-15T23:59:59-0500»): pasarla a UTC la movería al día siguiente.
  const fecha = (iso) => (FECHA.test(String(iso).slice(0, 10))
    ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "");
  const dinero = diario != null ? `${formatoMoneda(diario, moneda)} al día` : total != null ? `${formatoMoneda(total, moneda)} en total` : "Presupuesto en los conjuntos";
  const cuando = inicio && fin ? `del ${fecha(inicio)} al ${fecha(fin)}` : inicio ? `desde el ${fecha(inicio)}, sin fecha de fin` : fin ? `hasta el ${fecha(fin)}` : "sin fecha de fin";
  return `${dinero} · ${cuando}`;
}
