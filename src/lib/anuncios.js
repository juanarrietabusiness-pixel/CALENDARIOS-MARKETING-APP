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
    optimizacion: "POST_ENGAGEMENT", destino: "ON_POST", pixel: null, resultado: "Interacciones", acciones: ["post_engagement", "page_engagement"],
  },
  OUTCOME_LEADS: {
    nombre: "Clientes potenciales", descripcion: "Contactos en la web (necesita el píxel de Meta).",
    optimizacion: "OFFSITE_CONVERSIONS", destino: "WEBSITE", pixel: "LEAD", resultado: "Clientes potenciales",
    acciones: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"],
  },
  OUTCOME_SALES: {
    nombre: "Ventas", descripcion: "Compras en la web (necesita el píxel de Meta).",
    optimizacion: "OFFSITE_CONVERSIONS", destino: "WEBSITE", pixel: "PURCHASE", resultado: "Compras",
    acciones: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
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

export function borradorVacio(hoy = "") {
  return {
    nombre: "",
    objetivo: "OUTCOME_TRAFFIC",
    categorias: [],
    paisCategoria: "PA",
    presupuesto: { tipo: "diario", monto: "" },
    inicio: hoy,
    fin: "",
    pixelId: "",
    publico: { paises: ["PA"], ciudades: [], edadMin: EDAD_MIN, edadMax: EDAD_MAX, sexo: "todos" },
    anuncio: { medio: null, texto: "", titulo: "", enlace: "", boton: "LEARN_MORE" },
  };
}

const esEnlace = (t) => {
  try { const u = new URL(String(t ?? "")); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
};

/**
 * Lo que está mal del borrador, paso a paso: [{ paso, campo, mensaje }].
 * La misma función la usan el asistente (para no dejar avanzar) y el
 * servidor (para no crear): lo que la pantalla deja pasar y el servidor
 * no, es un fallo de la pantalla, no del dinero.
 *
 * `moneda` y `minimoDiario` (unidades menores, de la cuenta) vienen de la
 * cuenta publicitaria; `hoy` es la fecha de la zona de la cuenta.
 */
export function validarBorrador(b = {}, { moneda = "USD", minimoDiario = null, hoy = "" } = {}) {
  const e = [];
  const mal = (paso, campo, mensaje) => e.push({ paso, campo, mensaje });
  const obj = OBJETIVOS[b.objetivo];

  // 1. Objetivo y nombre
  if (!obj) mal(1, "objetivo", "Escoge un objetivo.");
  if (!String(b.nombre ?? "").trim()) mal(1, "nombre", "Ponle un nombre a la campaña.");
  else if (String(b.nombre).length > 200) mal(1, "nombre", "El nombre es demasiado largo (máximo 200 caracteres).");
  const categorias = Array.isArray(b.categorias) ? b.categorias : [];
  const validas = new Set(CATEGORIAS_ESPECIALES.map((c) => c.id));
  if (categorias.some((c) => !validas.has(c))) mal(1, "categorias", "Hay una categoría especial que no existe.");
  if (categorias.length && !/^[A-Z]{2}$/.test(String(b.paisCategoria ?? ""))) mal(1, "paisCategoria", "Di en qué país aplica la categoría especial.");
  if (obj?.pixel && !String(b.pixelId ?? "").trim()) mal(1, "pixelId", `Para «${obj.nombre}» hace falta el píxel de Meta de la web del cliente.`);

  // 2. Presupuesto y fechas
  const p = b.presupuesto ?? {};
  const monto = Number(p.monto);
  const menores = aMenores(monto, moneda);
  const minimo = Number(minimoDiario) > 0 ? Number(minimoDiario) : factorMoneda(moneda);
  if (!["diario", "total"].includes(p.tipo)) mal(2, "presupuesto", "Escoge presupuesto diario o total.");
  if (!(monto > 0)) mal(2, "monto", "Escribe cuánto quieres gastar.");
  if (!FECHA.test(b.inicio ?? "")) mal(2, "inicio", "Escoge la fecha de inicio.");
  else if (hoy && b.inicio < hoy) mal(2, "inicio", "La fecha de inicio ya pasó.");
  if (b.fin && !FECHA.test(b.fin)) mal(2, "fin", "La fecha de fin no es válida.");
  if (p.tipo === "total" && !b.fin) mal(2, "fin", "Con presupuesto total hace falta una fecha de fin.");
  if (FECHA.test(b.inicio ?? "") && FECHA.test(b.fin ?? "") && b.fin < b.inicio) mal(2, "fin", "La fecha de fin es anterior a la de inicio.");
  if (monto > 0) {
    const dias = p.tipo === "total" ? Math.max(1, diasEntre(b.inicio, b.fin)) : 1;
    if (menores / dias < minimo) {
      mal(2, "monto", p.tipo === "total"
        ? `Con ${dias} días, el total no llega al mínimo diario de la cuenta (${formatoMoneda(deMenores(minimo, moneda), moneda)} al día).`
        : `El mínimo diario de la cuenta es ${formatoMoneda(deMenores(minimo, moneda), moneda)}.`);
    }
  }

  // 3. Público
  const pub = b.publico ?? {};
  const paises = Array.isArray(pub.paises) ? pub.paises : [];
  const ciudades = Array.isArray(pub.ciudades) ? pub.ciudades : [];
  if (!paises.length && !ciudades.length) mal(3, "paises", "Escoge al menos un país o una ciudad.");
  if (paises.some((c) => !/^[A-Z]{2}$/.test(String(c)))) mal(3, "paises", "Hay un código de país que no es válido (dos letras, como PA).");
  if (ciudades.some((c) => !c?.key)) mal(3, "ciudades", "Hay una ciudad sin identificador de Meta: búscala otra vez.");
  const repetidas = ciudades.filter((c) => paises.includes(c.pais)).map((c) => c.nombre);
  if (repetidas.length) mal(3, "ciudades", `Meta no admite un país y sus ciudades a la vez: quita el país o ${repetidas.join(", ")}.`);
  const edadMin = Number(pub.edadMin);
  const edadMax = Number(pub.edadMax);
  if (!(edadMin >= EDAD_MIN && edadMin <= EDAD_MAX) || !(edadMax >= EDAD_MIN && edadMax <= EDAD_MAX)) mal(3, "edad", `La edad va de ${EDAD_MIN} a ${EDAD_MAX}+.`);
  else if (edadMin > edadMax) mal(3, "edad", "La edad mínima es mayor que la máxima.");
  if (!["todos", "hombres", "mujeres"].includes(pub.sexo ?? "todos")) mal(3, "sexo", "Sexo no válido.");
  if (categorias.length) {
    if (edadMin !== EDAD_MIN || edadMax !== EDAD_MAX) mal(3, "edad", "Con categoría especial, Meta exige todas las edades (18 a 65+).");
    if ((pub.sexo ?? "todos") !== "todos") mal(3, "sexo", "Con categoría especial, Meta no deja escoger el sexo.");
    if (ciudades.some((c) => Number(c.radio ?? RADIO_MIN_ESPECIAL_KM) < RADIO_MIN_ESPECIAL_KM)) {
      mal(3, "ciudades", `Con categoría especial, el radio de una ciudad es de ${RADIO_MIN_ESPECIAL_KM} km o más.`);
    }
  }

  // 4. Anuncio
  const a = b.anuncio ?? {};
  const medio = a.medio;
  if (!medio?.clave) mal(4, "medio", "Escoge una imagen o un video.");
  else if (medio.tipo === "imagen" && !medio.hash) mal(4, "medio", "La imagen aún no está en Meta: espera a que termine de subir.");
  else if (medio.tipo === "video" && !(medio.videoId && medio.listo)) mal(4, "medio", "El video aún no está listo en Meta: espera a que termine de procesarse.");
  else if (!["imagen", "video"].includes(medio.tipo)) mal(4, "medio", "Ese archivo no es ni imagen ni video.");
  if (!String(a.texto ?? "").trim()) mal(4, "texto", "Escribe el texto del anuncio.");
  else if (String(a.texto).length > MAX_TEXTO) mal(4, "texto", `El texto pasa de ${MAX_TEXTO} caracteres.`);
  if (String(a.titulo ?? "").length > MAX_TITULO) mal(4, "titulo", `El título pasa de ${MAX_TITULO} caracteres.`);
  if (!esEnlace(a.enlace)) mal(4, "enlace", "Escribe el enlace completo, con https://.");
  if (!BOTONES.some((x) => x.id === a.boton)) mal(4, "boton", "Escoge el botón.");

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

/** El público, como lo quiere `targeting`. */
export function segmentacion(publico = {}, { especial = false } = {}) {
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
  return {
    geo_locations: geo,
    age_min: Number(publico.edadMin ?? EDAD_MIN),
    age_max: Number(publico.edadMax ?? EDAD_MAX),
    ...(sexo ? { genders: sexo } : {}),
    // Desde la v23 hay que decirlo al crear: 0 = el público es EXACTAMENTE
    // el que se escogió, sin que Meta lo amplíe por su cuenta.
    targeting_automation: { advantage_audience: 0 },
  };
}

/** El conjunto de anuncios: presupuesto, fechas, público, optimización. */
export function cuerpoConjunto(b, { campanaId, moneda = "USD", zona = "UTC", hoy = "" }) {
  const obj = OBJETIVOS[b.objetivo];
  const monto = aMenores(b.presupuesto?.monto, moneda);
  const especial = Array.isArray(b.categorias) && b.categorias.length > 0;
  // Si empieza hoy no se manda la hora: empieza cuando se ACTIVE. Una
  // hora de inicio que ya pasó la rechaza Meta en algunos casos.
  const empiezaHoy = !b.inicio || (hoy && b.inicio <= hoy);
  return {
    name: `${String(b.nombre).trim()} · Conjunto`,
    campaign_id: campanaId,
    status: ESTADO_AL_CREAR,
    ...(b.presupuesto?.tipo === "total" ? { lifetime_budget: String(monto) } : { daily_budget: String(monto) }),
    billing_event: "IMPRESSIONS",
    optimization_goal: obj.optimizacion,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    ...(obj.destino ? { destination_type: obj.destino } : {}),
    ...(obj.pixel ? { promoted_object: json({ pixel_id: String(b.pixelId), custom_event_type: obj.pixel }) } : {}),
    targeting: json(segmentacion(b.publico, { especial })),
    ...(empiezaHoy ? {} : { start_time: momentoEnZona(b.inicio, zona) }),
    ...(b.fin ? { end_time: momentoEnZona(b.fin, zona, true) } : {}),
  };
}

/**
 * El creativo. Imagen: `link_data` con el hash de /adimages. Video:
 * `video_data` con el id de /advideos y su miniatura (obligatoria). Con
 * Instagram asignado al cliente, `instagram_user_id` (el nombre de antes,
 * `instagram_actor_id`, ya no se acepta).
 */
export function cuerpoCreativo(b, { paginaId, instagramId = null, miniatura = "" }) {
  const a = b.anuncio;
  const boton = { type: a.boton, value: { link: a.enlace } };
  const base = { page_id: String(paginaId), ...(instagramId ? { instagram_user_id: String(instagramId) } : {}) };
  const historia = a.medio.tipo === "video"
    ? {
      ...base,
      video_data: {
        video_id: String(a.medio.videoId), image_url: miniatura || a.medio.miniatura || "",
        message: a.texto, ...(a.titulo ? { title: a.titulo } : {}), call_to_action: boton,
      },
    }
    : {
      ...base,
      link_data: {
        image_hash: String(a.medio.hash), link: a.enlace, message: a.texto,
        ...(a.titulo ? { name: a.titulo } : {}), call_to_action: boton,
      },
    };
  return { name: `${String(b.nombre).trim()} · Creativo`, object_story_spec: json(historia) };
}

export function cuerpoAnuncio(b, { conjuntoId, creativoId }) {
  return {
    name: `${String(b.nombre).trim()} · Anuncio`,
    adset_id: conjuntoId,
    creative: json({ creative_id: creativoId }),
    status: ESTADO_AL_CREAR,
  };
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
