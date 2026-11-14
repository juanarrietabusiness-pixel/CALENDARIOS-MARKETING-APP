// ============================================================
// La REVISIÓN 3Q de lo que corre en el Ads Manager (curso de campañas, entrega 5; puro)
//
// La agencia monta las campañas en el Ads Manager y la aplicación sólo las LEE. Esto dice qué hacer con ellas con el
// método de las tres preguntas, contado con palabras propias:
//
//   · Q1, ¿qué pasó?   — gasto, resultados y costo por resultado frente al NÚMERO MÁGICO del cliente (Marca → Números
//                        del negocio): el objetivo y el equilibrio. Con 30, 14 y 7 días lado a lado.
//   · Q2, ¿por qué?    — las seis métricas secundarias con sus umbrales (los del Manual, lib/umbrales3q.js): % de
//                        mensajes, CTR único, reproducciones de 3 s, tiempo de reproducción, frecuencia y CPM frente a
//                        su propio mes; además los rankings de calidad de Meta y el aprendizaje limitado.
//   · Q3, ¿qué hago?   — una acción por métrica: qué se cambia (el texto, el gancho, el guion, los anuncios, el
//                        público, la oferta) y a dónde se va en la aplicación para hacerlo.
//
// Tres reglas que no se ven en las cifras:
//
//   1. EL EFECTO DESGLOSE: Meta reparte el presupuesto de un conjunto entre sus anuncios como quiere, así que se juzga
//      el CONJUNTO (o la campaña, si el presupuesto es de campaña). Con el conjunto dentro del número mágico, sus
//      anuncios NO se tocan aunque uno se vea peor: cambiar uno altera el conjunto entero.
//   2. LA FASE DE APRENDIZAJE: lo que está aprendiendo, o se creó o cambió hace menos de `diasCambio` días (también si
//      se le sumó un anuncio), ESPERA. Juzgarlo antes reinicia el aprendizaje.
//   3. CUÁNDO SE PAUSA (decisión 7), lo PRIMERO que se mira tras lo que no entrega y lo que aprende: en los 30 días,
//      fuera del número mágico (más de `apagar` veces) o por encima del equilibrio, con `gastoParaApagar` veces el
//      número mágico gastado, Y la última semana también mal (una mala semana dentro de un buen mes no se pausa: se
//      vigila). Nunca si su conjunto va bien. Sin número mágico NO se pausa por costo (no hay con qué decir que es
//      caro); sí por un % de mensajes muy bajo (`pctMensajesPausar`), que no depende de los números del negocio.
//
// UN SOLO NÚMERO MÁGICO para todas las etapas (decisión de la agencia, 14-nov: el curso da un número por TIPO de
// campaña —mensajes, tráfico, clientes potenciales, ventas— y nunca por etapa). Sale de `numeroMagicoDelCliente`
// (lib/numerosNegocio.js), el mismo de la ficha, el plan, el aviso diario y el estratega. La etapa (del nombre de la
// campaña o escogida a mano) sólo cambia el umbral de FRECUENCIA: los públicos que ya conocen la marca son chicos.
//
// En la web, con valor de compra, la Q1 va por ROAS frente al ROAS de equilibrio (una venta más grande que el ticket
// no hace perder dinero aunque el costo por compra suba).
//
// Cada elemento sale además con su SEMÁFORO para quien no sabe del curso (`semaforoDe`): sana, a vigilar, mala o
// esperando, por qué en una frase, qué hacer en pasos y dónde en el Ads Manager; y la revisión, con un resumen arriba.
//
// Envuelve las reglas de antes (src/lib/diagnostico.js: apagar, revisar, renovar, vigilar, escalar, duplicar), que
// siguen siendo la base de lo que no es pausar. Lo que se ve de antes en la pantalla (`hallazgos`) sale de aquí con
// `comoDiagnostico`.
// ============================================================

import { resumenInsights, ACCION_MENSAJE, OBJETIVOS, objetivoODAX, formatoMoneda, nombreObjetivo, estadoAnuncio } from "./anuncios.js";
import { evaluar, ACCIONES_DIAGNOSTICO, UMBRALES as UMBRALES_DIAGNOSTICO } from "./diagnostico.js";
import { ETAPAS_CICLO, idEtapaCiclo } from "./cicloVentas.js";
import { UMBRALES_3Q, limpiarUmbrales3q } from "./umbrales3q.js";
import { diasEntre, sumarDias } from "./agenda.js";

export { UMBRALES_3Q, limpiarUmbrales3q };

/** Las ventanas que se comparan, de la más larga a la más corta, y cómo las pide Meta. */
export const VENTANAS = Object.freeze([30, 14, 7]);
export const PRESET_VENTANA = Object.freeze({ 30: "last_30d", 14: "last_14d", 7: "last_7d" });

/** Por debajo de esto, una tasa no dice nada todavía. */
const MIN_IMPRESIONES = 1000;
const MIN_CLICS = 20;
/** Una revisión vieja: Mi día la pide otra vez (el curso: optimizar cada 5 a 7 días). */
export const DIAS_PARA_REVISAR = 6;

// ------------------------------------------------------------
// Las etapas y lo que se le exige a cada una
// ------------------------------------------------------------

/** La campaña de temporada (la «Campaña especial» del Excel de estrategia): una oferta, una fecha o un lanzamiento. */
export const ETAPA_TEMPORADA = Object.freeze({ id: "temporada", nombre: "Temporada", ayuda: "La campaña de una fecha: la oferta del mes, una fecha comercial o un lanzamiento." });

/** Las que se pueden escoger a mano para una campaña. */
export const ETAPAS_REVISION = Object.freeze([...ETAPAS_CICLO.map(({ id, nombre, ayuda }) => ({ id, nombre, ayuda })), ETAPA_TEMPORADA]);
const NOMBRE_ETAPA = Object.fromEntries(ETAPAS_REVISION.map((e) => [e.id, e.nombre]));
export const nombreEtapaRevision = (id) => NOMBRE_ETAPA[id] ?? "";

/**
 * Qué umbral de FRECUENCIA toca a cada etapa: los públicos que ya conocen la marca son chicos y repiten más. Es lo
 * ÚNICO que cambia por etapa: el número mágico es el mismo en todas (decisión del 14-nov; antes había un
 * `EXIGENCIA_ETAPA` que pedía ×1,3 en presentación y ×0,8 en conversión y ascensión, y el curso no lo dice).
 */
export const FRECUENCIA_ETAPA = Object.freeze({
  presentacion: "frecuencia", evaluacion: "frecuenciaCalida", conversion: "frecuenciaCalida", ascension: "frecuenciaCalida", temporada: "frecuencia", "": "frecuencia",
});
const umbralFrecuencia = (u, etapa) => u[FRECUENCIA_ETAPA[etapa] ?? "frecuencia"];

/** Lo que se le exige a una campaña, en una frase: lo mismo en todas las etapas. */
export const TEXTO_EXIGENCIA = "El mismo número mágico para todas las etapas: lo que cambia por etapa es cuánto puede repetirse el anuncio (la frecuencia).";

const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Los alias que son también palabras corrientes («aire frío», «café caliente»): sólo cuentan como un trozo propio. */
const ALIAS_TEMPERATURA = new Set(["frio", "fria", "tibio", "tibia", "caliente"]);
const ANTES_DE_TEMPERATURA = new Set(["publico", "publicos", "audiencia", "trafico", "aud"]);

/**
 * La etapa que dice el NOMBRE de una campaña (la nomenclatura del Manual lleva `{etapa}`), o "". Los cuatro nombres
 * del curso y «temporada» van primero; los alias después. Palabras enteras: «Conversiones» (el objetivo viejo de Meta)
 * no es la etapa. Sin falsos positivos: un alias de temperatura («frío», «caliente») sólo cuenta si es un trozo entero
 * del nombre («Dcasa · Frío · Sofá») o va tras «público»/«audiencia» —«Aire frío · Ventas» es un producto, no una
 * etapa—; un verbo («atraer», «convertir») sólo al principio de un trozo; «especial» sólo como «campaña especial». Pura.
 */
export function etapaDeNombre(nombre) {
  const limpio = sinTildes(nombre);
  const palabras = limpio.split(/[^a-z0-9]+/).filter(Boolean);
  if (!palabras.length) return "";
  for (const e of ETAPAS_CICLO) if (palabras.includes(e.id)) return e.id;
  if (palabras.includes("temporada")) return "temporada";
  for (let i = 0; i < palabras.length; i++) if (palabras[i] === "especial" && (palabras[i - 1] === "campana" || i === 0)) return "temporada";
  // Los trozos del nombre: lo que separan «·», «|», «/», «-», «_» o «:».
  const trozos = limpio.split(/\s*[·|/_:–—-]+\s*/).map((t) => t.split(/[^a-z0-9]+/).filter(Boolean)).filter((t) => t.length);
  for (const t of trozos) {
    if (t.length === 1 && idEtapaCiclo(t[0])) return idEtapaCiclo(t[0]);
    const primera = t[0];
    if (!ALIAS_TEMPERATURA.has(primera) && idEtapaCiclo(primera)) return idEtapaCiclo(primera);
    for (let i = 1; i < t.length; i++) {
      if (ALIAS_TEMPERATURA.has(t[i]) && ANTES_DE_TEMPERATURA.has(t[i - 1])) return idEtapaCiclo(t[i] === "fria" ? "frio" : t[i] === "tibia" ? "tibio" : t[i]);
    }
  }
  return "";
}

const ID_META = /^\d{1,30}$/;

/** Lo escogido a mano (`anuncios_clientes.etapas`): id de campaña → etapa. Lo que no se entiende, fuera. Pura. */
export function limpiarEtapas(x) {
  const e = x && typeof x === "object" && !Array.isArray(x) ? x : {};
  const salida = {};
  for (const [id, etapa] of Object.entries(e).slice(0, 300)) {
    if (ID_META.test(id) && NOMBRE_ETAPA[etapa]) salida[id] = etapa;
  }
  return salida;
}

/** La etapa de una campaña: la del nombre o, si el nombre no dice ninguna, la escogida a mano. Pura. */
export function etapaDeCampana(campana, manuales = {}) {
  const delNombre = etapaDeNombre(campana?.nombre ?? campana?.name);
  if (delNombre) return { id: delNombre, de: "nombre" };
  const manual = limpiarEtapas(manuales)[String(campana?.id ?? "")];
  return manual ? { id: manual, de: "manual" } : { id: "", de: "" };
}

// ------------------------------------------------------------
// El Ads Manager
// ------------------------------------------------------------

const PAGINA_ADS = { campana: ["campaigns", "selected_campaign_ids"], conjunto: ["adsets", "selected_adset_ids"], anuncio: ["ads", "selected_ad_ids"] };

/** El enlace al Ads Manager con esa campaña, conjunto o anuncio escogido (la cuenta, con o sin «act_»). Pura. */
export function enlaceAdsManager(cuenta, nivel = "campana", id = "") {
  const act = String(cuenta ?? "").replace(/^act_/, "");
  if (!ID_META.test(act)) return "";
  const [pagina, campo] = PAGINA_ADS[nivel] ?? PAGINA_ADS.campana;
  const base = `https://adsmanager.facebook.com/adsmanager/manage/${pagina}?act=${act}`;
  return ID_META.test(String(id ?? "")) ? `${base}&${campo}=${id}` : base;
}

// ------------------------------------------------------------
// Las cifras de una fila de /insights
// ------------------------------------------------------------

const num = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const accion = (lista, tipo) => (Array.isArray(lista) ? num(lista.find((a) => a?.action_type === tipo)?.value) : 0);
const primeraDe = (lista, tipos) => {
  for (const t of tipos) {
    const v = accion(lista, t);
    if (v) return v;
  }
  return 0;
};
const suma = (lista) => (Array.isArray(lista) ? lista.reduce((s, a) => s + num(a?.value), 0) : num(lista));
const TIPOS_COMPRA = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

const TIPOS_CLIENTE = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

/**
 * Una fila de /insights con todo lo que mira la revisión. `null` donde el campo no llegó (Meta rechazó los nuevos y se
 * leyó con los de siempre), para no confundir «no se sabe» con 0. Los % van de 0 a 100. `tipo` (el de
 * `tipoDeResultado`) fija qué es un resultado: con «conversacion», SÓLO las conversaciones (Meta omite las acciones en
 * cero y, sin mensajes, se contaban las interacciones: hallazgo 1 del 14-nov). Pura.
 */
export function cifras3q(fila, objetivo = null, { tipo = "" } = {}) {
  if (!fila || typeof fila !== "object") return null;
  const r = resumenInsights(fila, objetivo);
  const conversaciones = accion(fila.actions, ACCION_MENSAJE);
  const compras = primeraDe(fila.actions, TIPOS_COMPRA);
  if (objetivo && tipo === "conversacion") r.resultados = conversaciones;
  else if (objetivo && tipo === "compra") r.resultados = compras;
  else if (objetivo && tipo === "cliente") r.resultados = primeraDe(fila.actions, TIPOS_CLIENTE);
  if (objetivo && ["conversacion", "compra", "cliente"].includes(tipo)) r.costoPorResultado = r.resultados ? r.gasto / r.resultados : null;
  const valor = primeraDe(fila.action_values, TIPOS_COMPRA);
  const clicsUnicos = fila.unique_inline_link_clicks != null ? num(fila.unique_inline_link_clicks) : null;
  const ctrUnico = fila.unique_inline_link_click_ctr != null
    ? num(fila.unique_inline_link_click_ctr)
    : clicsUnicos != null && r.alcance ? (clicsUnicos / r.alcance) * 100 : null;
  const costoClicUnico = fila.cost_per_unique_inline_link_click != null
    ? num(fila.cost_per_unique_inline_link_click)
    : clicsUnicos ? r.gasto / clicsUnicos : null;
  const rep3s = accion(fila.actions, "video_view");
  const tiempo = fila.video_avg_time_watched_actions != null ? suma(fila.video_avg_time_watched_actions) : null;
  const frecuencia = num(fila.frequency) || (r.alcance ? r.impresiones / r.alcance : 0);
  return {
    gasto: r2(r.gasto),
    impresiones: r.impresiones,
    alcance: r.alcance,
    clics: r.clics,
    cpm: r.cpm != null ? r2(r.cpm) : r.impresiones ? r2((r.gasto / r.impresiones) * 1000) : null,
    ctr: r.ctr,
    resultados: r.resultados,
    costoPorResultado: r.costoPorResultado == null ? null : r2(r.costoPorResultado),
    conversaciones,
    costoConversacion: conversaciones ? r2(r.gasto / conversaciones) : null,
    compras,
    valorCompras: r2(valor),
    roas: valor && r.gasto ? r2(valor / r.gasto) : null,
    costoCompra: compras ? r2(r.gasto / compras) : null,
    clicsUnicos,
    ctrUnico: ctrUnico == null ? null : r2(ctrUnico),
    costoClicUnico: costoClicUnico == null ? null : r2(costoClicUnico),
    pctMensajes: clicsUnicos > 0 ? r1((conversaciones / clicsUnicos) * 100) : null,
    reproducciones3s: rep3s,
    tasa3s: rep3s > 0 && r.impresiones > 0 ? r1((rep3s / r.impresiones) * 100) : null,
    tiempoVideo: tiempo > 0 ? r1(tiempo) : null,
    thruplays: fila.video_thruplay_watched_actions != null ? suma(fila.video_thruplay_watched_actions) : null,
    frecuencia: r1(frecuencia),
  };
}

/** Varias filas sumadas en una (la cuenta entera desde sus campañas): gasto, impresiones, clics y acciones. Pura. */
export function sumarFilas(filas = []) {
  const total = { spend: 0, impressions: 0, clicks: 0, actions: [], action_values: [] };
  const juntar = (destino, lista) => {
    for (const a of Array.isArray(lista) ? lista : []) {
      const previa = destino.find((x) => x.action_type === a?.action_type);
      if (previa) previa.value = String(num(previa.value) + num(a.value));
      else if (a?.action_type) destino.push({ action_type: a.action_type, value: String(num(a.value)) });
    }
  };
  for (const f of filas) {
    if (!f) continue;
    total.spend += num(f.spend);
    total.impressions += num(f.impressions);
    total.clicks += num(f.clicks);
    juntar(total.actions, f.actions);
    juntar(total.action_values, f.action_values);
  }
  return { ...total, spend: String(total.spend), impressions: String(total.impressions), clicks: String(total.clicks) };
}

/** Para qué optimiza un conjunto (`optimization_goal`): conversaciones de mensajes o interacciones con la publicación. */
const OPTIMIZA_MENSAJES = /CONVERSATIONS|MESSAGING/;
const OPTIMIZA_INTERACCION = /POST_ENGAGEMENT|THRUPLAY|VIDEO_VIEWS|PAGE_LIKES|ENGAGED_USERS|TWO_SECOND/;

/**
 * Qué cuenta como resultado de una campaña, según su objetivo y lo que de verdad llegó. `optimizaciones`: las de sus
 * conjuntos (`optimization_goal`), lo que más dice. Una de Interacción con destino WhatsApp (o que optimiza
 * conversaciones) mide CONVERSACIONES aunque no haya ninguna; sólo la que optimiza interacciones (la evaluación de un
 * cliente con web, un video) mide interacciones. Pura.
 */
export function tipoDeResultado(fila, objetivo, destino = "", optimizaciones = []) {
  const odax = objetivoODAX(objetivo);
  const obj = OBJETIVOS[odax];
  if (!obj) return "";
  if (obj.alcance) return "alcance";
  const opt = (Array.isArray(optimizaciones) ? optimizaciones : []).map((o) => String(o ?? "").toUpperCase()).filter(Boolean);
  if (opt.some((o) => OPTIMIZA_MENSAJES.test(o)) && ["OUTCOME_ENGAGEMENT", "OUTCOME_SALES", "OUTCOME_LEADS"].includes(odax)) return "conversacion";
  if (odax === "OUTCOME_ENGAGEMENT") {
    if (opt.length && opt.every((o) => OPTIMIZA_INTERACCION.test(o))) return "interaccion";
    if (destino !== "web") return "conversacion";
  }
  if (odax === "OUTCOME_SALES" && destino === "whatsapp" && !opt.some((o) => /PURCHASE|VALUE|OFFSITE/.test(o))) return "conversacion";
  const acciones = Array.isArray(fila?.actions) ? fila.actions : [];
  for (const tipo of obj.acciones) {
    if (!acciones.some((a) => a?.action_type === tipo)) continue;
    if (tipo === ACCION_MENSAJE) return "conversacion";
    if (TIPOS_COMPRA.includes(tipo)) return "compra";
    if (tipo === "link_click") return "clic";
    if (/lead/.test(tipo)) return "cliente";
    return "interaccion";
  }
  // Sin acciones todavía: lo que se espera de ese objetivo.
  if (odax === "OUTCOME_SALES") return destino === "web" ? "compra" : "conversacion";
  return { OUTCOME_ENGAGEMENT: "conversacion", OUTCOME_LEADS: "cliente", OUTCOME_TRAFFIC: "clic" }[odax] ?? "";
}

/** Cómo se llama el resultado. */
export const NOMBRE_RESULTADO = Object.freeze({
  conversacion: "conversaciones", compra: "compras", cliente: "clientes potenciales", clic: "clics", interaccion: "interacciones", alcance: "personas alcanzadas", "": "resultados",
});

// ------------------------------------------------------------
// Q1: frente al número mágico
// ------------------------------------------------------------

/** Cómo está una campaña, un conjunto o un anuncio frente a lo que aguanta su etapa. */
export const ESTADOS_Q1 = Object.freeze({
  sano: { nombre: "Dentro del número mágico", corto: "Dentro", tono: "ok" },
  "sin-numero": { nombre: "Sin número mágico: no se sabe si es caro", corto: "Sin número mágico", tono: "pausa" },
  caro: { nombre: "Por encima del número mágico", corto: "Por encima", tono: "espera" },
  fuera: { nombre: "Fuera del número mágico", corto: "Fuera", tono: "mal" },
  pierde: { nombre: "Pierde dinero: pasa del equilibrio", corto: "Pierde dinero", tono: "mal" },
  "sin-resultados": { nombre: "Gasta sin resultados", corto: "Sin resultados", tono: "mal" },
  pronto: { nombre: "Poco gasto todavía", corto: "Poco gasto", tono: "pausa" },
  "sin-gasto": { nombre: "No gastó", corto: "No gastó", tono: "pausa" },
});

/**
 * El número mágico de esta campaña: el del cliente para su TIPO de resultado (conversación, cliente potencial,
 * compra, clic), el mismo en todas las etapas. `numeros`: { conversacion, cliente, compra, clic }, cada uno de
 * `numeroMagicoDelCliente` ({ valor, objetivo, equilibrio, roasEquilibrio, roasObjetivo }; lo de antes, sólo con
 * objetivo y equilibrio, también vale). Sin número mágico `ref` es 0: NO se compara con el promedio del mes (una
 * campaña cara todo el mes parecería «normal»); el promedio va aparte, de referencia. `costoMax` (tecleado) manda.
 * → { ref, objetivo, equilibrio, roasEquilibrio, roasObjetivo, porRoas, promedio, de }. Pura.
 */
export function referencia({ tipo = "", numeros = null, costoMax = 0, c30 = null } = {}) {
  const prom = Number(c30?.costoPorResultado) > 0 ? r2(Number(c30.costoPorResultado)) : null;
  if (Number(costoMax) > 0) return { ref: r2(Number(costoMax)), objetivo: Number(costoMax), equilibrio: null, roasEquilibrio: null, roasObjetivo: null, porRoas: false, promedio: prom, de: "escrito" };
  const n = tipo === "conversacion" ? numeros?.conversacion
    : tipo === "cliente" ? numeros?.cliente ?? numeros?.conversacion
      : tipo === "compra" ? numeros?.compra
        : tipo === "clic" ? numeros?.clic : null;
  const obj = Number(n?.objetivo) > 0 ? Number(n.objetivo) : null;
  const eq = Number(n?.equilibrio) > 0 ? Number(n.equilibrio) : null;
  const valor = Number(n?.valor) > 0 ? Number(n.valor) : obj && eq ? Math.min(obj, eq) : obj ?? eq;
  const roasEquilibrio = Number(n?.roasEquilibrio) > 0 ? r2(Number(n.roasEquilibrio)) : null;
  const roasObjetivo = Number(n?.roasObjetivo) > 0 ? r2(Number(n.roasObjetivo)) : null;
  if (valor > 0) {
    return {
      ref: r2(valor), objetivo: obj === null ? null : r2(obj), equilibrio: eq === null ? null : r2(eq), roasEquilibrio, roasObjetivo,
      porRoas: tipo === "compra" && roasEquilibrio > 0, promedio: prom, de: obj && (!eq || obj <= eq) ? "numero-magico" : "equilibrio",
    };
  }
  return { ref: 0, objetivo: null, equilibrio: null, roasEquilibrio: null, roasObjetivo: null, porRoas: false, promedio: prom, de: prom ? "promedio" : "" };
}

/**
 * El estado Q1 de unas cifras frente al número mágico. Sin número mágico, «sin-numero»: no se sabe si es caro. En la
 * web, con valor de compra y ROAS de equilibrio (`porRoas`), por ROAS: vender menos veces lo invertido que el
 * equilibrio es perder dinero (una venta más grande que el ticket no hace perder aunque la compra «cueste más»). Pura.
 */
export function estadoQ1(c, { ref = 0, equilibrio = null, porRoas = false, roasEquilibrio = null, roasObjetivo = null } = {}, umbrales = UMBRALES_3Q) {
  const u = { ...UMBRALES_3Q, ...umbrales };
  if (!c || !(c.gasto > 0)) return "sin-gasto";
  if (!(ref > 0)) return "sin-numero";
  if (porRoas && roasEquilibrio > 0 && c.roas > 0) {
    if (c.roas < roasEquilibrio) return c.gasto >= ref ? "pierde" : "pronto";
    if (roasObjetivo > 0 && c.roas < roasObjetivo) return "caro";
    return "sano";
  }
  if (!c.resultados) return c.gasto >= ref ? "sin-resultados" : "pronto";
  const cpr = c.costoPorResultado;
  if (equilibrio > 0 && cpr > equilibrio) return "pierde";
  if (cpr > u.apagar * ref) return "fuera";
  if (cpr > ref) return "caro";
  return "sano";
}

/**
 * La ventana con que se juzga el MES (la Q1 del curso mira 30 días; 14 y 7 dan la tendencia): 30 días si gastó en
 * ellos; si no, 14 o 7 (lo recién creado). Pura.
 */
export const ventanaDelMes = (c) => [30, 14, 7].map((w) => c?.[w]).find((x) => x?.gasto > 0) ?? c?.[7] ?? null;

/**
 * La tendencia: la última semana frente al mes (el costo por resultado o, en la web por ROAS, el ROAS). «empeora» si
 * cuesta un 30 % más (o el ROAS cae un 30 %), «mejora» al revés; "" si no hay con qué comparar. Pura.
 */
export function tendenciaDe(c, { porRoas = false } = {}) {
  const m = ventanaDelMes(c);
  const s = c?.[7];
  if (!m || !s || !(s.gasto > 0)) return "";
  if (porRoas) {
    if (!(m.roas > 0) || !(s.roas > 0)) return "";
    return s.roas < m.roas * 0.7 ? "empeora" : s.roas > m.roas * 1.3 ? "mejora" : "";
  }
  if (!(m.costoPorResultado > 0) || !(s.costoPorResultado > 0)) return !s.resultados && m.resultados ? "empeora" : "";
  return s.costoPorResultado > m.costoPorResultado * 1.3 ? "empeora" : s.costoPorResultado < m.costoPorResultado * 0.77 ? "mejora" : "";
}

// ------------------------------------------------------------
// Q2 y Q3: las métricas secundarias y qué hacer con cada una
// ------------------------------------------------------------

/**
 * Las métricas de la Q2 y su Q3. `ir` es a dónde se va en la aplicación: «ganchos» y «anuncios» abren el lote de
 * anuncios del Estudio (con su nivel y lo que se pide), «video» el director, «adsmanager» el Ads Manager.
 */
export const METRICAS_Q2 = Object.freeze({
  pctMensajes: {
    nombre: "% de mensajes", unidad: "%", que: "texto", titulo: "Un llamado más claro a escribir", ir: "anuncios",
    accion: "Dan clic y no escriben: que se vea que la conversación es por WhatsApp (su logo, «escríbenos»), qué se gana al escribir y que no haya nada que haga dudar entre el clic y el mensaje.",
    pide: "Anuncios con un llamado claro a escribir por WhatsApp: qué se gana al escribir, sin pasos de más.",
  },
  ctrUnico: {
    nombre: "CTR único", unidad: "%", que: "creativo", titulo: "Anuncios que llamen más", ir: "anuncios",
    accion: "Pocos de los que lo ven dan clic: la pieza o la primera línea no le hablan a este público. Prueba otro ángulo y otro tipo de arte.",
    pide: "Anuncios nuevos con otro ángulo y otro tipo de arte: los de ahora casi no reciben clics.",
  },
  tasa3s: {
    nombre: "Reproducciones de 3 s", unidad: "%", que: "gancho", titulo: "Mejorar los ganchos", ir: "ganchos",
    accion: "Pocos se quedan los primeros 3 segundos: cambia cómo empieza el video, lo primero que se ve y se dice.",
    pide: "Ganchos nuevos para los primeros 3 segundos: los de ahora no retienen.",
  },
  tiempoVideo: {
    nombre: "Tiempo de reproducción", unidad: "s", que: "guion", titulo: "Mejorar el guion y la edición", ir: "video",
    accion: "Se van antes de tiempo: el beneficio al principio, menos introducción y cambios de plano más seguidos.",
  },
  frecuencia: {
    nombre: "Frecuencia (7 días)", unidad: "veces", que: "anuncios", titulo: "Anuncios nuevos", ir: "anuncios", mayor: true,
    accion: "La misma gente ya lo vio muchas veces: suma anuncios nuevos con otros ángulos en vez de subir el presupuesto.",
    pide: "Anuncios nuevos para un público que ya vio los de ahora: otros ángulos, la misma oferta.",
  },
  cpm: {
    nombre: "CPM frente a su mes", unidad: "dinero", que: "publico", titulo: "Un público más grande", ir: "adsmanager", mayor: true,
    accion: "Las mil impresiones salen más caras que en su mes: el público se agota o es chico. Ábrelo (más intereses, similares o Advantage+) en el Ads Manager.",
  },
  ranking: {
    nombre: "Calidad según Meta", unidad: "", que: "creativo", titulo: "Una pieza de más calidad", ir: "anuncios",
    accion: "Meta lo compara con los anuncios que le llegan al mismo público y lo pone por debajo del promedio: cambia la pieza o el texto.",
    pide: "Anuncios de más calidad para este público: la pieza y el texto, otro ángulo.",
  },
  aprendizaje: {
    nombre: "Aprendizaje limitado", unidad: "", que: "publico", titulo: "Darle con qué aprender", ir: "adsmanager",
    accion: "Meta no junta resultados suficientes para salir del aprendizaje: un público más grande, más presupuesto o juntar conjuntos parecidos.",
  },
});
const ORDEN_Q2 = Object.keys(METRICAS_Q2);

/** Lo que se hace cuando la pieza va bien y aun así cada resultado sale caro: la oferta y el destino. */
export const ACCION_OFERTA = Object.freeze({
  id: "oferta", que: "oferta", titulo: "Revisar la oferta y el destino", ir: "",
  texto: "La pieza recibe clics y mensajes y aun así cada resultado sale caro: mira la oferta (qué se gana al escribir hoy), cómo se responde por WhatsApp y si el público es el correcto.",
});

const RANKINGS = Object.freeze({
  quality_ranking: "Calidad", engagement_rate_ranking: "Interacción esperada", conversion_rate_ranking: "Conversión esperada",
});
const TEXTO_RANKING = Object.freeze({
  ABOVE_AVERAGE: "Por encima del promedio", AVERAGE: "En el promedio",
  BELOW_AVERAGE_35: "Por debajo (entre el 35 % peor)", BELOW_AVERAGE_20: "Por debajo (entre el 20 % peor)", BELOW_AVERAGE_10: "Por debajo (entre el 10 % peor)",
});

/** Los rankings de un anuncio (sólo los que Meta dio: con pocas impresiones no da ninguno). Pura. */
export function rankingsDe(fila) {
  if (!fila) return [];
  return Object.entries(RANKINGS)
    .filter(([campo]) => TEXTO_RANKING[fila[campo]])
    .map(([campo, nombre]) => ({ campo, nombre, valor: fila[campo], texto: TEXTO_RANKING[fila[campo]], bajo: String(fila[campo]).startsWith("BELOW") }));
}

const coma = (n) => String(n).replace(".", ",");
const pctTexto = (v) => (v == null ? "—" : `${coma(r1(v))} %`);

/** Una métrica de la Q2, con su valor, su umbral y si avisa. */
function metrica(id, valor, umbral, mal, extra = {}) {
  const m = METRICAS_Q2[id];
  return { id, nombre: m.nombre, unidad: m.unidad, valor, umbral, mal: Boolean(mal), ...extra };
}

/**
 * La Q2 de un elemento: sus métricas secundarias en la ventana con datos suficientes (7 días; si no, 14 o 30) —la
 * frecuencia, siempre en 7— y si cada una pasa de su umbral. `tipo` dice si el % de mensajes aplica. Pura.
 */
export function q2De({ c, tipo = "", etapa = "", rankings = [], aprendizaje = "" } = {}, umbrales = UMBRALES_3Q, moneda = "USD") {
  const u = { ...UMBRALES_3Q, ...umbrales };
  const ventana = VENTANAS.slice().reverse().find((w) => c?.[w]?.impresiones >= MIN_IMPRESIONES) ?? 7;
  const v = c?.[ventana] ?? null;
  const lista = [];
  if (v) {
    if (tipo === "conversacion" && v.clicsUnicos >= MIN_CLICS && v.pctMensajes != null) {
      lista.push(metrica("pctMensajes", v.pctMensajes, u.pctMensajes, v.pctMensajes < u.pctMensajes, { texto: `De cada 100 que dan clic, escriben ${coma(Math.round(v.pctMensajes))}.` }));
    }
    if (v.ctrUnico != null && v.impresiones >= MIN_IMPRESIONES) {
      lista.push(metrica("ctrUnico", v.ctrUnico, u.ctrUnico, v.ctrUnico < u.ctrUnico, { texto: `Da clic el ${pctTexto(v.ctrUnico)} de quienes lo ven.` }));
    }
    if (v.tasa3s != null) {
      lista.push(metrica("tasa3s", v.tasa3s, u.tasa3s, v.tasa3s < u.tasa3s, { texto: `Se queda 3 segundos el ${pctTexto(v.tasa3s)} de las impresiones.` }));
    }
    if (v.tiempoVideo != null) {
      lista.push(metrica("tiempoVideo", v.tiempoVideo, u.tiempoVideo, v.tiempoVideo < u.tiempoVideo, { texto: `Se quedan ${coma(v.tiempoVideo)} s de media.` }));
    }
  }
  const c7 = c?.[7];
  if (c7?.frecuencia > 0) {
    const tope = umbralFrecuencia(u, etapa);
    lista.push(metrica("frecuencia", c7.frecuencia, tope, c7.frecuencia > tope, { texto: `Cada persona lo vio ${coma(c7.frecuencia)} veces en 7 días.` }));
  }
  const c30 = c?.[30];
  if (c7?.cpm > 0 && c30?.cpm > 0 && c7.impresiones >= MIN_IMPRESIONES) {
    const tope = r2(c30.cpm * (1 + u.cpm / 100));
    lista.push(metrica("cpm", c7.cpm, tope, c7.cpm > tope, { texto: `Mil impresiones: ${formatoMoneda(c7.cpm, moneda)} esta semana, ${formatoMoneda(c30.cpm, moneda)} en su mes.` }));
  }
  const bajos = rankings.filter((r) => r.bajo);
  if (bajos.length) lista.push(metrica("ranking", null, null, true, { texto: bajos.map((r) => `${r.nombre}: ${r.texto.toLowerCase()}`).join(" · ") }));
  if (String(aprendizaje).toUpperCase() === "FAIL") lista.push(metrica("aprendizaje", null, null, true, { texto: "Meta lo marca con aprendizaje limitado." }));
  return { ventana, metricas: lista };
}

/** La Q3: una acción por cada métrica que avisa, por orden de peso y sin repetir. Pura. */
export function accionesQ3(q2) {
  const vistas = new Set();
  const salida = [];
  for (const id of ORDEN_Q2) {
    if (!q2?.metricas?.some((m) => m.id === id && m.mal)) continue;
    const m = METRICAS_Q2[id];
    const clave = `${m.ir}|${m.titulo}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push({ id, que: m.que, titulo: m.titulo, texto: m.accion, ir: m.ir, ...(m.pide ? { pide: m.pide } : {}) });
  }
  return salida;
}

// ------------------------------------------------------------
// El veredicto de cada campaña, conjunto y anuncio
// ------------------------------------------------------------

/** Los veredictos, por orden de urgencia. Los de antes (lib/diagnostico.js) más los del método. */
export const VEREDICTOS = Object.freeze({
  revisar: { nombre: "Revisar la entrega", tono: "mal", orden: 0 },
  apagar: { nombre: "Apagar", tono: "mal", orden: 1 },
  mejorar: { nombre: "Mejorar", tono: "mal", orden: 2 },
  renovar: { nombre: "Renovar la pieza", tono: "espera", orden: 3 },
  vigilar: { nombre: "Vigilar", tono: "espera", orden: 4 },
  espera: { nombre: "Esperar: está aprendiendo", tono: "espera", orden: 5 },
  escalar: { nombre: "Escalar", tono: "ok", orden: 6 },
  duplicar: { nombre: "Escalar con otro público", tono: "ok", orden: 7 },
  sano: { nombre: "Sano: no se toca", tono: "ok", orden: 8 },
  completar: { nombre: "Completa los números del negocio", tono: "pausa", orden: 9 },
  pronto: { nombre: "Todavía es pronto", tono: "pausa", orden: 10 },
});

const veredicto = (id, motivo, extra = {}) => ({ id, nombre: VEREDICTOS[id].nombre, tono: VEREDICTOS[id].tono, motivo, acciones: [], ...extra });
const rechazado = (estado) => ["DISAPPROVED", "WITH_ISSUES"].includes(String(estado ?? "").toUpperCase());
const fechaCorta = (f) => {
  const [a, m, d] = String(f).split("-").map(Number);
  return a ? `${d} de ${["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1]}` : "";
};
const hace = (dias) => (dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`);

/** La última vez que se creó o cambió algo (Meta o el historial de la aplicación), como AAAA-MM-DD. */
function ultimoCambio(x, cambios = {}) {
  return [x?.creada, x?.actualizada, cambios?.[x?.id]]
    .map((f) => String(f ?? "").slice(0, 10))
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort()
    .at(-1) ?? "";
}

/**
 * Si tiene que esperar (aprendiendo, recién creado o cambiado, o con un anuncio recién sumado): el porqué, o "".
 * `subconjuntos`: con presupuesto de CAMPAÑA, la campaña es la unidad y espera a que sus conjuntos salgan del
 * aprendizaje (antes se juzgaba aunque Meta siguiera probando con ellos).
 */
function esperaDe(x, { hoy, cambios, u, hijos = [], subconjuntos = [] }) {
  if (String(x?.aprendizaje ?? "").toUpperCase() === "LEARNING") {
    return "Está en la fase de aprendizaje: Meta todavía prueba a quién mostrárselo. No lo toques hasta que salga.";
  }
  const aprendiendo = subconjuntos.filter((s) => String(s?.aprendizaje ?? "").toUpperCase() === "LEARNING");
  if (aprendiendo.length) {
    return `${aprendiendo.length === 1 ? `Su conjunto «${aprendiendo[0].nombre}» está` : `${aprendiendo.length} de sus conjuntos están`} en la fase de aprendizaje: Meta todavía prueba a quién mostrárselo. No toques la campaña hasta que salga${aprendiendo.length === 1 ? "" : "n"}.`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hoy ?? ""))) return "";
  const hasta = (f) => `espera hasta el ${fechaCorta(sumarDias(f, u.diasCambio))} para juzgarlo: cambiarlo antes reinicia el aprendizaje.`;
  const ultima = ultimoCambio(x, cambios);
  if (ultima && diasEntre(ultima, hoy) < u.diasCambio) {
    const nuevo = String(x.creada ?? "").slice(0, 10) === ultima;
    return `${nuevo ? "Es nuevo: se creó" : "Se cambió"} ${hace(diasEntre(ultima, hoy))}; ${hasta(ultima)}`;
  }
  const sub = subconjuntos.map((s) => ({ s, f: ultimoCambio(s, cambios) })).filter(({ f }) => f && diasEntre(f, hoy) < u.diasCambio).sort((a, b) => (a.f < b.f ? 1 : -1))[0];
  if (sub) return `Su conjunto «${sub.s.nombre}» se creó o cambió ${hace(diasEntre(sub.f, hoy))}; ${hasta(sub.f)}`;
  const hijo = hijos.map((h) => ({ h, f: String(h.creada ?? "").slice(0, 10) })).filter(({ f }) => /^\d{4}-\d{2}-\d{2}$/.test(f) && diasEntre(f, hoy) < u.diasCambio).sort((a, b) => (a.f < b.f ? 1 : -1))[0];
  if (hijo) return `Se le sumó el anuncio «${hijo.h.nombre}» ${hace(diasEntre(hijo.f, hoy))}; ${hasta(hijo.f)}`;
  return "";
}

/** Las reglas de antes (lib/diagnostico.js), con el número mágico, la frecuencia de su etapa y los umbrales del Manual. */
function base(x, nivel, { objetivo, R, moneda, u, etapa, tipo }) {
  return evaluar(
    { nivel, estado: x.estado, presupuestoDiario: x.presupuestoDiario ?? null, i7: x.i?.[7] ?? null, i30: x.i?.[30] ?? null, objetivo, tipo },
    { ref: R.ref, moneda, umbrales: { frecuenciaFatiga: umbralFrecuencia(u, etapa), apagar: u.apagar, gastoSinResultado: u.gastoParaApagar } },
  );
}

const DIAS_DE = (c, m) => (m === c?.[30] ? 30 : m === c?.[14] ? 14 : 7);

/** El motivo Q1 en una frase, con las cifras de la ventana `c` (`dias` días) y el número mágico. */
function motivoQ1(q1, c, R, tipo, moneda, dias = 7) {
  const d = (n) => formatoMoneda(n, moneda);
  const que = NOMBRE_RESULTADO[tipo] ?? "resultados";
  const en = `en ${dias} días`;
  if (!c) return `No gastó nada ${en}.`;
  if (q1 === "sin-numero") {
    const prom = c.costoPorResultado ? `${d(c.costoPorResultado)} por cada una de sus ${que} ${en}` : `${d(c.gasto)} gastados ${en}${c.resultados ? "" : ` sin ${que}`}`;
    return `${prom}. Sin número mágico no se pausa nada por costo: completa los números del negocio para saber si esto es caro.`;
  }
  if (R.porRoas && c.roas > 0 && ["pierde", "caro", "sano"].includes(q1)) {
    const roas = `vendió ${coma(c.roas)} veces lo invertido ${en}`;
    if (q1 === "pierde") return `${roas[0].toUpperCase()}${roas.slice(1)}: menos que el ROAS de equilibrio (${coma(R.roasEquilibrio)}), así pierde dinero.`;
    if (q1 === "caro") return `${roas[0].toUpperCase()}${roas.slice(1)}: no pierde (el equilibrio es ${coma(R.roasEquilibrio)}) pero queda por debajo del objetivo (${coma(R.roasObjetivo)}).`;
    return `${roas[0].toUpperCase()}${roas.slice(1)}: por encima del equilibrio (${coma(R.roasEquilibrio)}).`;
  }
  const magico = `el número mágico es ${d(R.ref)}`;
  if (q1 === "sin-resultados") return `Gastó ${d(c.gasto)} ${en} sin ${que} (${magico} por cada una).`;
  if (q1 === "pierde") return `Cada una de sus ${que} cuesta ${d(c.costoPorResultado)} ${en}, más que el equilibrio (${d(R.equilibrio)}): así pierde dinero.`;
  if (q1 === "fuera") return `Cada una de sus ${que} cuesta ${d(c.costoPorResultado)} ${en}: muy por encima del número mágico (${d(R.ref)}).`;
  if (q1 === "caro") return `Cada una de sus ${que} cuesta ${d(c.costoPorResultado)} ${en} y ${magico}.`;
  if (q1 === "sano") return R.ref > 0 ? `Dentro del número mágico: ${d(c.costoPorResultado)} por cada una de sus ${que} ${en} (${magico}).` : `${d(c.costoPorResultado)} por cada una de sus ${que} ${en}.`;
  if (q1 === "pronto") return `Lleva ${d(c.gasto)} ${en}: todavía no hay con qué juzgarlo (se juzga desde ${d(R.ref)} gastados).`;
  return `No gastó nada ${en}.`;
}

const MALO = new Set(["pierde", "fuera", "sin-resultados"]);

/**
 * DECISIÓN 7, lo primero que se mira (hallazgo 2 del 14-nov: antes las reglas de antes iban delante y un conjunto que
 * perdía dinero y además había empeorado salía «Vigilar»). → el motivo para pausarlo, o "".
 *   · Por costo: en los 30 días (`mes`) fuera del número mágico o por encima del equilibrio, con `gastoParaApagar`
 *     veces el número mágico gastado, y la última semana también mal. Sin número mágico, nunca por costo.
 *   · Por el % de mensajes: de cada 100 que dan clic escriben menos de `pctMensajesPausar` (con 40 clics únicos o
 *     más). Es lo que se mira SIN número mágico (no depende de los números del negocio); con él manda el costo y el
 *     % de mensajes queda como lo que hay que mejorar (Q2).
 */
function motivoDePausa({ mes, q1, q7, R, tipo, u, moneda, dias }) {
  if (R.ref > 0 && MALO.has(q1) && mes?.gasto >= u.gastoParaApagar * R.ref && (MALO.has(q7) || q7 === "caro")) {
    return motivoQ1(q1, mes, R, tipo, moneda, dias) + (dias > 7 ? " La última semana también fue mal." : "");
  }
  if (tipo === "conversacion" && mes?.clicsUnicos >= 40 && mes.pctMensajes != null && mes.pctMensajes < u.pctMensajesPausar && !(R.ref > 0)) {
    return `De cada 100 personas que dan clic sólo escriben ${coma(Math.round(mes.pctMensajes))} (${mes.clicsUnicos} clics y ${mes.conversaciones} conversaciones ${dias === 7 ? "en 7 días" : `en ${dias} días`}): el anuncio no lleva a la conversación.`;
  }
  return "";
}

/**
 * Juzga una UNIDAD: un conjunto (o la campaña entera si el presupuesto es de campaña). Es lo que se mira por el
 * efecto desglose. La Q1 es la del MES (30 días; 14 o 7 si es más nuevo) y la última semana da la tendencia: una mala
 * semana dentro de un buen mes se vigila, no se pausa. → { q1, q7, tendencia, q2, veredicto }.
 */
function juzgar(x, nivel, ctx, { hijos = [], subconjuntos = [], conBoton = true } = {}) {
  const { u, moneda, R, tipo } = ctx;
  const c = x.ventanas;
  const mes = ventanaDelMes(c);
  const dias = DIAS_DE(c, mes);
  const q1 = estadoQ1(mes, R, u);
  const q7 = estadoQ1(c[7], R, u);
  const tendencia = tendenciaDe(c, R);
  const q2 = q2De({ c, tipo, etapa: ctx.etapa, rankings: x.rankings ?? [], aprendizaje: x.aprendizaje }, u, moneda);
  const acciones = accionesQ3(q2);
  const con = (veredictoFinal) => ({ q1, q7, tendencia, q2, veredicto: veredictoFinal });
  if (rechazado(x.estado)) {
    return con(veredicto("revisar", `Meta lo marca como ${estadoAnuncio(x.estado).texto.toLowerCase()}: revísalo en el Ads Manager (el motivo está ahí).`, { acciones: [{ id: "adsmanager", que: "entrega", titulo: "Abrir en el Ads Manager", texto: "", ir: "adsmanager" }] }));
  }
  const b = base({ ...x, presupuestoDiario: conBoton ? x.presupuestoDiario : null }, nivel, ctx);
  if (b?.accion === "revisar") return con(veredicto("revisar", b.motivo));
  const espera = esperaDe(x, { ...ctx, hijos, subconjuntos });
  if (espera) {
    const luego = b?.accion === "apagar" || MALO.has(q1) ? " Si al terminar sigue igual, entonces se cambia." : "";
    return con(veredicto("espera", `${espera}${luego}`, { espera: true }));
  }
  // Pausar va PRIMERO (decisión 7).
  const pausa = motivoDePausa({ mes, q1, q7, R, tipo, u, moneda, dias });
  if (pausa) return con(veredicto("apagar", pausa));
  if (b) {
    // Las reglas de antes miran la semana. Si piden apagar pero el MES no está para pausar, se vigila.
    if (b.accion === "apagar") {
      return con(veredicto("vigilar", `${b.motivo} El mes va mejor${mes?.costoPorResultado ? ` (${formatoMoneda(mes.costoPorResultado, moneda)} por resultado en ${dias} días)` : ""}: vigílalo; si la próxima semana sigue así, se pausa.`, { acciones }));
    }
    // Lo que funciona (escalar, duplicar) no se toca por dentro: sus avisos de la Q2 quedan «para cuando toque cambiar».
    const funciona = VEREDICTOS[b.accion].tono === "ok";
    // Escalar o duplicar sólo con el mes dentro del número mágico: una buena semana no basta.
    if (funciona && q1 !== "sano") return con(veredicto("vigilar", `${b.motivo.split(":")[0]} esta semana, pero el mes no: ${motivoQ1(q1, mes, R, tipo, moneda, dias)}`, { acciones }));
    return con(veredicto(b.accion, b.motivo, {
      ...(b.sugerencia ? { sugerencia: b.sugerencia } : {}), acciones: funciona ? [] : acciones, ...(funciona ? { luego: acciones } : {}),
    }));
  }
  if (MALO.has(q1) || q1 === "caro") {
    const principal = acciones[0] ?? ACCION_OFERTA;
    const mejora = tendencia === "mejora" ? " La última semana va mejor." : "";
    return con(veredicto("mejorar", `${motivoQ1(q1, mes, R, tipo, moneda, dias)}${mejora} Lo que más pesa: ${principal.titulo.toLowerCase()}.`, {
      nombre: principal.titulo, acciones: acciones.length ? acciones : [ACCION_OFERTA],
    }));
  }
  if (q1 === "sano") {
    if (tendencia === "empeora" && (MALO.has(q7) || q7 === "caro")) {
      return con(veredicto("vigilar", `El mes va bien, pero la última semana empeoró: ${motivoQ1(q7, c[7], R, tipo, moneda, 7)} Vigílalo; si sigue así la próxima, se cambia.`, { acciones }));
    }
    return con(veredicto("sano", motivoQ1(q1, mes, R, tipo, moneda, dias), { luego: acciones }));
  }
  if (q1 === "sin-numero") return con(veredicto("completar", motivoQ1(q1, mes, R, tipo, moneda, dias), { luego: acciones }));
  return con(veredicto("pronto", motivoQ1(q1, mes, R, tipo, moneda, dias)));
}

/** Las ventanas de un elemento, como cifras (con lo que cuenta como resultado de su campaña). */
const ventanasDe = (x, objetivo, tipo = "") => Object.fromEntries(VENTANAS.map((w) => [w, cifras3q(x?.i?.[w] ?? null, objetivo, { tipo })]));
const activo = (x) => String(x?.status ?? x?.estado ?? "").toUpperCase() === "ACTIVE";
/** Presupuesto de campaña (Advantage): la campaña lo lleva y sus conjuntos no tienen el suyo. */
const cboDe = (c) => (Number(c?.presupuestoDiario) > 0 || Number(c?.presupuestoTotal) > 0) && !(c?.conjuntos ?? []).some((s) => Number(s.presupuestoDiario) > 0);

/**
 * La tasa de 3 s de una unidad (conjunto o campaña), contada SÓLO sobre las impresiones de sus anuncios de VIDEO (los
 * que tienen reproducciones): un conjunto que mezcla video e imagen la diluía con las impresiones de las imágenes.
 * Sin anuncios de video, null (no se juzga). Muta las ventanas que recibe.
 */
function tasa3sDeVideos(ventanas, anuncios) {
  if (!anuncios.length) return;
  for (const w of VENTANAS) {
    if (!ventanas[w]) continue;
    const videos = anuncios.map((a) => a.ventanas?.[w]).filter((v) => v?.reproducciones3s > 0);
    const imp = videos.reduce((n, v) => n + v.impresiones, 0);
    const rep = videos.reduce((n, v) => n + v.reproducciones3s, 0);
    ventanas[w] = { ...ventanas[w], tasa3s: imp > 0 ? r1((rep / imp) * 100) : null };
  }
}

/** Un hijo (un anuncio, o un conjunto de una campaña con presupuesto de campaña) por debajo de su unidad. */
function juzgarHijo(x, nivel, padre, ctx) {
  const c = x.ventanas;
  if (rechazado(x.estado)) return juzgar(x, nivel, ctx);
  const q2 = q2De({ c, tipo: ctx.tipo, etapa: ctx.etapa, rankings: x.rankings ?? [], aprendizaje: x.aprendizaje }, ctx.u, ctx.moneda);
  const q1 = estadoQ1(ventanaDelMes(c), ctx.R, ctx.u);
  const q7 = estadoQ1(c[7], ctx.R, ctx.u);
  // EL EFECTO DESGLOSE: con la unidad dentro del número mágico, sus hijos no se tocan.
  if (padre.q1 === "sano" && VEREDICTOS[padre.veredicto.id]?.tono === "ok") {
    return {
      q1, q7, q2,
      veredicto: veredicto("sano", `Su ${padre.nivel === "campana" ? "campaña" : "conjunto"} va bien: no se toca, aunque se vea peor que otro. Meta reparte el presupuesto entre ${nivel === "anuncio" ? "los anuncios" : "los conjuntos"} y se juzga el total.`, { luego: accionesQ3(q2), desglose: true }),
    };
  }
  if (padre.veredicto.id === "revisar") return { q1, q7, q2, veredicto: veredicto("revisar", "Su conjunto no está entregando.", { heredado: true }) };
  if (padre.veredicto.id === "espera") {
    return { q1, q7, q2, veredicto: veredicto("espera", `Su ${padre.nivel === "campana" ? "campaña" : "conjunto"} está esperando: se juzga cuando termine.`, { espera: true }) };
  }
  return juzgar(x, nivel, ctx, { conBoton: false });
}

/**
 * Una campaña con sus conjuntos y anuncios, juzgados. `x`: { id, nombre, objetivo, estado, status, presupuestoDiario,
 * presupuestoTotal, creada, actualizada, etapa, etapaDe, i, conjuntos: [...], anuncios: [...] }.
 */
function revisarCampana(x, opciones) {
  const { u, numeros, moneda, costoMax, cuenta, destino } = opciones;
  const i30 = x.i?.[30] ?? x.i?.[14] ?? x.i?.[7] ?? null;
  const tipo = tipoDeResultado(i30, x.objetivo, destino, (x.conjuntos ?? []).map((s) => s.optimizacion));
  // La etapa: la que traiga (ya resuelta) o la del nombre y, si no, la escogida a mano.
  const de = x.etapa !== undefined ? { id: x.etapa ?? "", de: x.etapaDe ?? "" } : etapaDeCampana(x, opciones.etapas);
  const etapa = NOMBRE_ETAPA[de.id] ? de.id : "";
  const ventanas = ventanasDe(x, x.objetivo, tipo);
  const R = referencia({ tipo, numeros, costoMax, c30: ventanas[30] });
  const ctx = { ...opciones, u, tipo, etapa, R, objetivo: x.objetivo, moneda };
  const cbo = cboDe(x);
  const anuncios = (x.anuncios ?? []).filter(activo).map((a) => ({ ...a, ventanas: ventanasDe(a, x.objetivo, tipo), enlace: enlaceAdsManager(cuenta, "anuncio", a.id) }));
  const conjuntos = (x.conjuntos ?? []).filter(activo).map((s) => {
    const v = ventanasDe(s, x.objetivo, tipo);
    tasa3sDeVideos(v, anuncios.filter((a) => String(a.conjuntoId) === String(s.id)));
    return { ...s, ventanas: v, enlace: enlaceAdsManager(cuenta, "conjunto", s.id) };
  });
  tasa3sDeVideos(ventanas, anuncios);
  const salida = {
    id: x.id, nombre: x.nombre, objetivo: x.objetivo, nombreObjetivo: nombreObjetivo(x.objetivo), estado: x.estado, cbo,
    presupuestoDiario: x.presupuestoDiario ?? null, etapa, etapaDe: etapa ? de.de : "", nombreEtapa: nombreEtapaRevision(etapa),
    exigencia: TEXTO_EXIGENCIA,
    tipoResultado: tipo, nombreResultado: NOMBRE_RESULTADO[tipo] ?? "resultados", referencia: R,
    ventanas, enlace: enlaceAdsManager(cuenta, "campana", x.id),
  };
  const c7 = ventanas[7];
  // Activa y sin gastar: lo de abajo no gastó tampoco; lo primero es que entregue.
  if (rechazado(x.estado) || (activo(x) && !(c7?.gasto > 0))) {
    const motivo = rechazado(x.estado) ? `Meta la marca como ${estadoAnuncio(x.estado).texto.toLowerCase()}: revísala en el Ads Manager.` : "La campaña está activa y no gastó nada en 7 días: puede estar en revisión, sin método de pago o con un público demasiado chico.";
    const heredado = veredicto("revisar", "Su campaña no está entregando.", { heredado: true });
    return {
      ...salida, q1: estadoQ1(ventanaDelMes(ventanas), R, u), q2: { ventana: 7, metricas: [] }, veredicto: veredicto("revisar", motivo),
      conjuntos: conjuntos.map((s) => ({ ...s, veredicto: heredado })), anuncios: anuncios.map((a) => ({ ...a, veredicto: heredado })),
    };
  }
  if (cbo) {
    // El presupuesto es de la campaña: ella es la unidad, y sus conjuntos y anuncios, lo que se reparte. Espera a que sus
    // conjuntos salgan del aprendizaje.
    const unidad = { ...juzgar({ ...x, ventanas }, "campana", ctx, { hijos: anuncios, subconjuntos: conjuntos, conBoton: false }), nivel: "campana" };
    // Funciona de sobra (la regla de «escalar» de antes): el presupuesto es de la campaña, así que se sube en el Ads Manager.
    const ud = UMBRALES_DIAGNOSTICO;
    const mes = ventanaDelMes(ventanas);
    if (unidad.veredicto.id === "sano" && R.ref > 0 && !R.porRoas && mes?.resultados >= ud.minGanador && mes.costoPorResultado <= ud.escalar * R.ref) {
      unidad.veredicto = veredicto("escalar", `Funciona: ${formatoMoneda(mes.costoPorResultado, moneda)} por resultado, por debajo del número mágico (${formatoMoneda(R.ref, moneda)}). El presupuesto es de la campaña: súbelo un 20 % en el Ads Manager; más de golpe reinicia el aprendizaje.`, {
        acciones: [{ id: "adsmanager", que: "presupuesto", titulo: "Subirlo en el Ads Manager", texto: "", ir: "adsmanager" }],
        ...(Number(x.presupuestoDiario) > 0 ? { sugerencia: { diarioActual: x.presupuestoDiario, diarioNuevo: r2(x.presupuestoDiario * 1.2) } } : {}),
      });
    }
    const porConjunto = new Map();
    const js = conjuntos.map((s) => {
      const j = { ...juzgarHijo(s, "conjunto", unidad, ctx), nivel: "conjunto" };
      porConjunto.set(String(s.id), j);
      return { ...s, ...j };
    });
    const as = anuncios.map((a) => {
      const padre = unidad.q1 === "sano" || unidad.veredicto.id === "espera" ? unidad : porConjunto.get(String(a.conjuntoId)) ?? unidad;
      return { ...a, ...juzgarHijo(a, "anuncio", padre, ctx) };
    });
    return { ...salida, q1: unidad.q1, q7: unidad.q7, tendencia: unidad.tendencia, q2: unidad.q2, veredicto: unidad.veredicto, conjuntos: js, anuncios: as };
  }
  // Presupuesto en cada conjunto: el conjunto es la unidad.
  const porConjunto = new Map();
  const js = conjuntos.map((s) => {
    const hijos = anuncios.filter((a) => String(a.conjuntoId) === String(s.id));
    const j = { ...juzgar(s, "conjunto", ctx, { hijos }), nivel: "conjunto" };
    porConjunto.set(String(s.id), j);
    return { ...s, ...j };
  });
  const as = anuncios.map((a) => {
    const padre = porConjunto.get(String(a.conjuntoId));
    // Sin su conjunto en la lista (pausado, o no llegó): se juzga solo, como antes.
    return { ...a, ...(padre ? juzgarHijo(a, "anuncio", padre, ctx) : juzgar(a, "anuncio", ctx)) };
  });
  const mes = ventanaDelMes(ventanas);
  const dias = DIAS_DE(ventanas, mes);
  const q1 = estadoQ1(mes, R, u);
  const q7 = estadoQ1(c7, R, u);
  const tendencia = tendenciaDe(ventanas, R);
  const q2 = q2De({ c: ventanas, tipo, etapa }, u, moneda);
  const todosEsperan = js.length > 0 && js.every((s) => s.veredicto.id === "espera");
  const pendientes = [...js, ...as].filter((y) => ["apagar", "mejorar", "renovar", "revisar"].includes(y.veredicto.id)).length;
  let v;
  if (todosEsperan) v = veredicto("espera", "Sus conjuntos están aprendiendo o se cambiaron hace poco: se juzga cuando terminen.", { espera: true });
  else if (q1 === "sano") v = veredicto("sano", motivoQ1(q1, mes, R, tipo, moneda, dias));
  else if (q1 === "sin-numero") v = veredicto("completar", motivoQ1(q1, mes, R, tipo, moneda, dias));
  else if (q1 === "pronto" || q1 === "sin-gasto") v = veredicto("pronto", motivoQ1(q1, mes, R, tipo, moneda, dias));
  else {
    v = veredicto("mejorar", `${motivoQ1(q1, mes, R, tipo, moneda, dias)}${pendientes ? ` ${pendientes === 1 ? "Un conjunto o anuncio pide" : `${pendientes} conjuntos y anuncios piden`} cambios: míralos abajo.` : ""}`, {
      nombre: ESTADOS_Q1[q1]?.nombre ?? "Mejorar", acciones: accionesQ3(q2),
    });
  }
  return { ...salida, q1, q7, tendencia, q2, veredicto: v, conjuntos: js, anuncios: as };
}

// ------------------------------------------------------------
// El SEMÁFORO: lo que entiende alguien que no hizo el curso
// ------------------------------------------------------------

/** Los cuatro colores (más «sin datos»), con su texto: nunca sólo el color. */
export const SEMAFOROS = Object.freeze({
  mala: { texto: "Mala", tono: "mal", orden: 0 },
  vigilar: { texto: "A vigilar", tono: "espera", orden: 1 },
  esperando: { texto: "Esperando: aprendiendo", tono: "pausa", orden: 2 },
  "sin-datos": { texto: "Sin datos para juzgar", tono: "pausa", orden: 3 },
  sana: { texto: "Sana", tono: "ok", orden: 4 },
});

/** Cómo se llama cada nivel en el Ads Manager (la pestaña donde se busca). */
export const PESTANA_ADS_MANAGER = Object.freeze({ campana: "Campañas", conjunto: "Conjuntos de anuncios", anuncio: "Anuncios" });

/** El color de un veredicto. Pura. */
export function idSemaforo(v, q1 = "") {
  switch (v?.id) {
    case "sano": case "escalar": case "duplicar": return "sana";
    case "apagar": case "revisar": return "mala";
    case "mejorar": return MALO.has(q1) ? "mala" : "vigilar";
    case "renovar": case "vigilar": return "vigilar";
    case "espera": return "esperando";
    default: return "sin-datos";
  }
}

/**
 * El SEMÁFORO de una campaña, un conjunto o un anuncio ya juzgado, para quien no sabe del curso: { id, texto, tono,
 * porque (una frase con sus números), pasos (qué hacer, en orden), donde («En el Ads Manager: …») }. `nivel`:
 * «campana», «conjunto» o «anuncio»; `conjunto`: el nombre de su conjunto (para un anuncio). Pura.
 */
export function semaforoDe(x, nivel, { moneda = "USD", conjunto = "" } = {}) {
  const v = x?.veredicto ?? {};
  const id = idSemaforo(v, x?.q1);
  const s = SEMAFOROS[id];
  const pestana = PESTANA_ADS_MANAGER[nivel] ?? "Campañas";
  const nombre = x?.nombre ? `«${x.nombre}»` : "el elemento";
  const aqui = `En el Ads Manager: ${pestana} → ${nombre}`;
  const busca = `Abre el Ads Manager («Abrir en el Ads Manager») y ve a la pestaña «${pestana}»: busca ${nombre}.`;
  const d = (n) => formatoMoneda(n, moneda);
  let pasos = [];
  let donde = "";
  switch (v.id) {
    case "apagar":
      pasos = [busca, "Apaga su interruptor (la primera columna de la fila). No lo borres: lo que se aprendió de él sirve para los siguientes."];
      donde = `${aqui} → apagar el interruptor`;
      break;
    case "revisar":
      pasos = [busca, "Mira la columna «Entrega»: dice si está en revisión, rechazado, sin método de pago o con un público muy chico.", "Si Meta lo rechazó, abre el anuncio y lee el motivo; corrige la pieza o el texto y vuelve a enviarlo."];
      donde = `${aqui} → columna «Entrega»`;
      break;
    case "escalar":
      pasos = [busca, v.sugerencia ? `Pulsa «Editar» y, en «Presupuesto», súbelo de ${d(v.sugerencia.diarioActual)} a ${d(v.sugerencia.diarioNuevo)} al día.` : "Pulsa «Editar» y sube el presupuesto un 20 %.", "No lo subas más de un 20 % de una vez: más de golpe reinicia el aprendizaje."];
      donde = `${aqui} → Editar → Presupuesto`;
      break;
    case "duplicar":
      pasos = [busca, "Pulsa «Duplicar» y, en el nuevo, cambia el público (otros intereses o públicos similares).", "Deja el original como está: funciona."];
      donde = `${aqui} → Duplicar`;
      break;
    case "mejorar":
    case "renovar": {
      const lista = (v.acciones ?? []).filter((a) => a.texto);
      pasos = lista.length ? lista.map((a) => `${a.titulo}: ${a.texto}`) : [v.motivo];
      const publico = lista.some((a) => a.que === "publico");
      const dentro = nivel === "anuncio" ? (conjunto ? `«${conjunto}»` : "su conjunto") : nombre;
      pasos.push(publico ? "Cambia el público en el conjunto (Editar → Público)." : `Haz los anuncios nuevos en la aplicación y súbelos DENTRO de ${dentro}; no edites los que ya corren (reinicia el aprendizaje).`);
      donde = publico ? `En el Ads Manager: Conjuntos de anuncios → ${nivel === "anuncio" && conjunto ? `«${conjunto}»` : nombre} → Editar → Público` : `En el Ads Manager: Conjuntos de anuncios → ${nivel === "anuncio" && conjunto ? `«${conjunto}»` : nombre} → crear un anuncio nuevo`;
      break;
    }
    case "vigilar":
      pasos = ["No cambies nada todavía.", "Vuelve a mirarlo en 3 o 4 días: si sigue igual, se cambia."];
      break;
    case "espera":
      pasos = ["No toques nada: cualquier cambio reinicia el aprendizaje y Meta empieza de cero."];
      break;
    case "sano":
      pasos = [v.desglose ? "No toques este: su conjunto va bien y Meta reparte el dinero entre todos." : "No toques nada: funciona."];
      break;
    case "completar":
      pasos = ["Completa los números del negocio del cliente: el costo del producto, el ticket y el % de cada venta que se invierte (Marca → Números del negocio).", "Vuelve a abrir la revisión: con el número mágico se sabe si esto es caro."];
      donde = "En la aplicación: Marca → Números del negocio";
      break;
    default:
      pasos = ["Espera a que gaste un poco más para juzgarlo."];
  }
  return { id, texto: s.texto, tono: s.tono, porque: v.motivo ?? "", pasos, donde };
}

const PEOR_SEMAFORO = (a, b) => (SEMAFOROS[a].orden <= SEMAFOROS[b].orden ? a : b);

/** Los semáforos de una campaña ya revisada: el suyo y el de cada conjunto y anuncio; el de la campaña, el peor de todos. */
function conSemaforos(c, moneda) {
  const nombreConjunto = new Map((c.conjuntos ?? []).map((s) => [String(s.id), s.nombre]));
  const conjuntos = (c.conjuntos ?? []).map((s) => ({ ...s, semaforo: semaforoDe(s, "conjunto", { moneda }) }));
  const anuncios = (c.anuncios ?? []).map((a) => ({ ...a, semaforo: semaforoDe(a, "anuncio", { moneda, conjunto: nombreConjunto.get(String(a.conjuntoId)) ?? "" }) }));
  const propio = semaforoDe(c, "campana", { moneda });
  let peor = propio.id;
  for (const x of [...conjuntos, ...anuncios]) if (!x.veredicto?.heredado) peor = PEOR_SEMAFORO(peor, x.semaforo.id);
  return { ...c, semaforo: propio, semaforoTotal: peor, conjuntos, anuncios };
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * El resumen de arriba: «De 5 campañas, 3 están sanas, 1 hay que vigilarla y 1 va mal: empieza por «X».». Cuenta cada
 * campaña por su peor semáforo (el suyo o el de algo de dentro). Pura.
 */
export function fraseDelResumen(campanas = []) {
  if (!campanas.length) return "No tiene campañas activas.";
  const cuenta = { mala: [], vigilar: [], esperando: [], "sin-datos": [], sana: [] };
  for (const c of campanas) cuenta[c.semaforoTotal ?? c.semaforo?.id ?? "sin-datos"]?.push(c);
  const partes = [
    cuenta.sana.length && plural(cuenta.sana.length, "está sana", "están sanas"),
    cuenta.vigilar.length && (cuenta.vigilar.length === 1 ? "1 hay que vigilarla" : `${cuenta.vigilar.length} hay que vigilarlas`),
    cuenta.mala.length && plural(cuenta.mala.length, "va mal", "van mal"),
    cuenta.esperando.length && plural(cuenta.esperando.length, "está aprendiendo", "están aprendiendo"),
    cuenta["sin-datos"].length && plural(cuenta["sin-datos"].length, "aún no se puede juzgar", "aún no se pueden juzgar"),
  ].filter(Boolean);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0];
  const total = campanas.length === 1 ? "De 1 campaña" : `De ${campanas.length} campañas`;
  const primera = cuenta.mala[0] ?? cuenta.vigilar[0];
  const cierre = cuenta.mala.length
    ? `: empieza por «${primera.nombre}».`
    : cuenta.vigilar.length ? `: mira primero «${primera.nombre}».` : ": no hay nada urgente.";
  return `${total}, ${lista}${cierre}`;
}

/**
 * La revisión de una cuenta. `campanas`: las ACTIVAS del Ads Manager con sus conjuntos y anuncios, cada uno con sus
 * filas de /insights por ventana (`i: { 30, 14, 7 }`). Opciones: `numeros` ({ conversacion, cliente, compra, clic }:
 * el número mágico de cada tipo, de `numeroMagicoDelCliente`), `umbrales` (los del Manual), `moneda`, `hoy` (Panamá),
 * `cambios` (id → fecha del último cambio hecho desde la aplicación), `cuenta` (act_…), `destino`, `etapas` (las
 * escogidas a mano: id → etapa; la del nombre manda) y `costoMax` (lo tecleado, si alguien lo prueba). Pura.
 * → { umbrales, campanas: [... con su semáforo], resumen: { campanas, porVeredicto, pendientes, porSemaforo, frase } }
 */
export function revisar(campanas = [], opciones = {}) {
  const u = limpiarUmbrales3q(opciones.umbrales);
  const o = {
    u, numeros: opciones.numeros ?? null, moneda: opciones.moneda ?? "USD", hoy: opciones.hoy ?? "", cambios: opciones.cambios ?? {},
    cuenta: opciones.cuenta ?? "", destino: opciones.destino ?? "", costoMax: Number(opciones.costoMax) > 0 ? Number(opciones.costoMax) : 0,
    etapas: opciones.etapas ?? {},
  };
  const lista = campanas.map((c) => conSemaforos(revisarCampana(c, o), o.moneda))
    .sort((a, b) => SEMAFOROS[a.semaforoTotal].orden - SEMAFOROS[b.semaforoTotal].orden
      || VEREDICTOS[a.veredicto.id].orden - VEREDICTOS[b.veredicto.id].orden || (b.ventanas[7]?.gasto ?? 0) - (a.ventanas[7]?.gasto ?? 0));
  const porVeredicto = {};
  const porSemaforo = {};
  let pendientes = 0;
  for (const c of lista) {
    porSemaforo[c.semaforoTotal] = (porSemaforo[c.semaforoTotal] ?? 0) + 1;
    for (const x of [c, ...c.conjuntos, ...c.anuncios]) {
      if (x.veredicto.heredado) continue;
      porVeredicto[x.veredicto.id] = (porVeredicto[x.veredicto.id] ?? 0) + 1;
      if (VEREDICTOS[x.veredicto.id].tono === "mal") pendientes++;
    }
  }
  return { umbrales: u, campanas: lista, resumen: { campanas: lista.length, porVeredicto, pendientes, porSemaforo, frase: fraseDelResumen(lista) } };
}

// ------------------------------------------------------------
// La cuenta entera frente al número mágico (30, 14 y 7 días)
// ------------------------------------------------------------

/** Los objetivos que buscan la conversación por WhatsApp (o la compra, en la web): el costo «real» sólo sale de éstos. */
const OBJETIVOS_DE_CONVERSACION = new Set(["OUTCOME_ENGAGEMENT", "OUTCOME_SALES"]);

/**
 * La Q1 del cliente: lo real de la cuenta en cada ventana frente al número mágico. WhatsApp → costo por conversación;
 * web → costo por compra y, con valor de compra, el ROAS frente al de equilibrio. El costo «real» sale SÓLO de las
 * campañas que buscan ese resultado (Interacción o Ventas; en la web, Ventas): una de tráfico o de alcance no busca
 * conversaciones y su gasto las encarecía de mentira. Las filas sin `objective` (lecturas de antes) cuentan todas.
 * `estado` es el del MES (30 días); `tendencia`, la última semana frente al mes. Pura.
 */
export function q1DeCuenta(filasPorVentana = {}, { destino = "", numeros = null } = {}) {
  const web = destino === "web";
  const n = web ? numeros?.compra : numeros?.conversacion;
  const obj = Number(n?.objetivo) > 0 ? r2(n.objetivo) : null;
  const eq = Number(n?.equilibrio) > 0 ? r2(n.equilibrio) : null;
  const valor = Number(n?.valor) > 0 ? r2(n.valor) : obj && eq ? Math.min(obj, eq) : obj ?? eq;
  const roasEquilibrio = Number(n?.roasEquilibrio) > 0 ? r2(n.roasEquilibrio) : null;
  const roasObjetivo = Number(n?.roasObjetivo) > 0 ? r2(n.roasObjetivo) : null;
  const busca = (f) => !f?.objective || (web ? objetivoODAX(f.objective) === "OUTCOME_SALES" : OBJETIVOS_DE_CONVERSACION.has(objetivoODAX(f.objective)));
  const ventanas = {};
  for (const w of VENTANAS) {
    const todas = filasPorVentana[w] ?? [];
    const c = cifras3q(sumarFilas(todas.filter(busca)));
    const total = cifras3q(sumarFilas(todas));
    const real = web ? c.costoCompra : c.costoConversacion;
    let estado = "sin-gasto";
    if (c.gasto > 0) {
      if (!valor) estado = "sin-numero";
      else if (web && roasEquilibrio && c.roas > 0) estado = c.roas < roasEquilibrio ? "pierde" : roasObjetivo && c.roas < roasObjetivo ? "caro" : "sano";
      else if (!(web ? c.compras : c.conversaciones)) estado = "sin-resultados";
      else if (eq && real > eq) estado = "pierde";
      else if (real > valor) estado = "caro";
      else estado = "sano";
    }
    ventanas[w] = { gasto: c.gasto, gastoTotal: total.gasto, conversaciones: c.conversaciones, compras: c.compras, valorCompras: c.valorCompras, real, roas: c.roas, estado };
  }
  const mes = [30, 14, 7].find((w) => ventanas[w].gasto > 0) ?? 7;
  const m = ventanas[mes];
  const s = ventanas[7];
  let tendencia = "";
  if (mes !== 7 && s.gasto > 0) {
    if (web && m.roas > 0 && s.roas > 0) tendencia = s.roas < m.roas * 0.7 ? "empeora" : s.roas > m.roas * 1.3 ? "mejora" : "";
    else if (m.real > 0 && s.real > 0) tendencia = s.real > m.real * 1.3 ? "empeora" : s.real < m.real * 0.77 ? "mejora" : "";
  }
  return {
    metrica: web ? "Costo por compra" : "Costo por conversación",
    resultado: web ? "compras" : "conversaciones",
    objetivo: obj, equilibrio: eq, valor, roasEquilibrio, roasObjetivo,
    ventanas,
    estado: m.estado,
    dias: mes,
    tendencia,
  };
}

// ------------------------------------------------------------
// Lo grave de cada día (el cron): no gasta, rechazado, el doble sin un resultado
// ------------------------------------------------------------

/**
 * Lo GRAVE de una cuenta, para la campana: una campaña activa que no gastó ayer (creada antes de ayer), un anuncio
 * rechazado o con problemas de una campaña encendida, y una campaña que gastó en 7 días el doble del número mágico sin
 * un resultado DE SU OBJETIVO: una conversación (Interacción o Ventas con WhatsApp), una compra (Ventas en la web) o un
 * cliente potencial (Clientes potenciales: antes se avisaba «sin una conversación» de una campaña de formularios). Una
 * de Interacción de un cliente con web, de Tráfico o de Alcance no se avisa: no busca nada de eso. `numero`: el número
 * mágico del cliente (el MISMO de la revisión, sin ajuste por etapa); `numeros` ({ conversacion, cliente, compra } de
 * `numeroMagicoDelCliente`), si llega, manda por tipo. Cada aviso con su `clave` para no repetirlo. Pura.
 * `campanas`: [{ id, name, status, effective_status, objective, created_time, ayer }] (ayer = lo gastado ayer).
 */
export function alertasGraves({ campanas = [], anuncios = [], semana = [], numero = 0, numeros = null, destino = "", hoy = "", nombre = "", moneda = "USD", umbrales = UMBRALES_3Q } = {}) {
  const u = { ...UMBRALES_3Q, ...umbrales };
  const cliente = nombre ? ` de ${nombre}` : "";
  const encendidas = new Map(campanas.filter((c) => String(c.status ?? "").toUpperCase() === "ACTIVE").map((c) => [String(c.id), c]));
  const salida = [];
  const ayer = /^\d{4}-\d{2}-\d{2}$/.test(hoy) ? sumarDias(hoy, -1) : "";
  for (const c of encendidas.values()) {
    const creada = String(c.created_time ?? "").slice(0, 10);
    const yaEntregaba = !creada || !ayer || creada < ayer;
    if (String(c.effective_status ?? "").toUpperCase() === "ACTIVE" && yaEntregaba && !(num(c.ayer) > 0)) {
      salida.push({ clave: `sin-gasto:${c.id}`, tipo: "sin-gasto", texto: `La campaña «${c.name ?? c.id}»${cliente} está activa y ayer no gastó nada: puede estar en revisión, sin método de pago o con un público muy chico.` });
    }
  }
  for (const a of anuncios) {
    const c = encendidas.get(String(a.campaign_id ?? ""));
    if (!c || !rechazado(a.effective_status)) continue;
    const como = String(a.effective_status).toUpperCase() === "DISAPPROVED" ? "rechazó" : "marca con problemas";
    salida.push({ clave: `rechazado:${a.id}`, tipo: "rechazado", texto: `Meta ${como} el anuncio «${a.name ?? a.id}» de «${c.name ?? c.id}»${cliente}: el motivo está en el Ads Manager.` });
  }
  const web = destino === "web";
  for (const f of semana) {
    const c = encendidas.get(String(f.campaign_id ?? ""));
    if (!c) continue;
    const odax = objetivoODAX(c.objective);
    // Qué resultado busca esta campaña (y con qué número se juzga).
    const que = odax === "OUTCOME_LEADS" ? "cliente"
      : odax === "OUTCOME_SALES" ? (web ? "compra" : "conversacion")
        : odax === "OUTCOME_ENGAGEMENT" && !web ? "conversacion" : "";
    if (!que) continue;
    const ref = Number(numeros?.[que]?.valor) > 0 ? Number(numeros[que].valor) : Number(numeros?.conversacion?.valor) > 0 && que === "cliente" ? Number(numeros.conversacion.valor) : Number(numero);
    if (!(ref > 0)) continue;
    const gasto = num(f.spend);
    const hechas = que === "compra" ? primeraDe(f.actions, TIPOS_COMPRA) : que === "cliente" ? primeraDe(f.actions, TIPOS_CLIENTE) : accion(f.actions, ACCION_MENSAJE);
    if (gasto >= u.gastoParaApagar * ref && !hechas) {
      const un = que === "compra" ? "una compra" : que === "cliente" ? "un cliente potencial" : "una conversación";
      salida.push({
        clave: `sin-resultado:${c.id}`, tipo: "sin-resultado",
        texto: `«${c.name ?? c.id}»${cliente} gastó ${formatoMoneda(gasto, moneda)} en 7 días sin ${un} (el número mágico es ${formatoMoneda(ref, moneda)}).`,
      });
    }
  }
  return salida;
}

// ------------------------------------------------------------
// Lo de antes: la lista de hallazgos del diagnóstico
// ------------------------------------------------------------

/** El veredicto como la acción de antes (lib/diagnostico.js). «Mejorar» se lee como «vigilar». */
const LEGADO = { apagar: "apagar", revisar: "revisar", renovar: "renovar", vigilar: "vigilar", escalar: "escalar", duplicar: "duplicar", mejorar: "vigilar" };

/** La revisión con la forma del diagnóstico de antes: { hallazgos, resumen }. Pura. */
export function comoDiagnostico(rev) {
  const hallazgos = [];
  let bien = 0;
  let gasto = 0;
  let resultados = 0;
  for (const c of rev?.campanas ?? []) {
    gasto += c.ventanas?.[7]?.gasto ?? 0;
    resultados += c.ventanas?.[7]?.resultados ?? 0;
    const base = { campanaId: c.id, campana: c.nombre };
    if (c.veredicto.id === "revisar") {
      hallazgos.push({ ...base, nivel: "campana", id: c.id, nombre: c.nombre, accion: "revisar", motivo: c.veredicto.motivo, cifras: c.ventanas?.[7] ?? null });
      continue;
    }
    for (const [nivel, lista] of [["conjunto", c.conjuntos], ["anuncio", c.anuncios]]) {
      for (const x of lista ?? []) {
        const accionVieja = LEGADO[x.veredicto.id];
        if (accionVieja && !x.veredicto.heredado) {
          hallazgos.push({ ...base, nivel, id: x.id, nombre: x.nombre, accion: accionVieja, motivo: x.veredicto.motivo, ...(x.veredicto.sugerencia ? { sugerencia: x.veredicto.sugerencia } : {}), cifras: x.ventanas?.[7] ?? null });
        } else bien++;
      }
    }
  }
  hallazgos.sort((a, b) => ACCIONES_DIAGNOSTICO[a.accion].orden - ACCIONES_DIAGNOSTICO[b.accion].orden);
  return {
    hallazgos,
    resumen: { campanas: rev?.campanas?.length ?? 0, gasto: r2(gasto), resultados, costoPorResultado: resultados ? r2(gasto / resultados) : null, bien },
  };
}

// ------------------------------------------------------------
// En texto: para el asistente, Claude (MCP) y la explicación de la IA
// ------------------------------------------------------------

/** Un valor de la Q2 con su unidad («35 %», «4,2 s», «3,1 veces», «6,00 US$»). Pura. */
export function valorQ2(unidad, v, moneda = "USD") {
  if (v == null) return "";
  if (unidad === "dinero") return formatoMoneda(v, moneda);
  if (unidad === "%") return pctTexto(v);
  if (unidad === "s") return `${coma(v)} s`;
  if (unidad === "veces") return `${coma(v)} ${v === 1 ? "vez" : "veces"}`;
  return coma(v);
}

const sinPunto = (t) => String(t ?? "").replace(/\.\s*$/, "");
const lineaQ2 = (m, moneda) => {
  const valor = valorQ2(m.unidad, m.valor, moneda);
  const umbral = m.umbral == null ? "" : ` (avisa ${METRICAS_Q2[m.id].mayor ? "por encima de" : "por debajo de"} ${valorQ2(m.unidad, m.umbral, moneda)})`;
  return `${m.nombre}${valor ? ` ${valor}` : ""}${umbral}${m.mal ? " ✗" : " ✓"}${m.texto ? ` — ${sinPunto(m.texto)}` : ""}`;
};

/**
 * La revisión en texto corto (sin las imágenes): el número mágico, lo real y cada campaña con su etapa, su veredicto
 * y sus Q2/Q3. Lo leen el asistente y Claude por MCP (`revisar_campanas`) y la IA que lo explica. Pura.
 */
export function textoDeRevision(r, { max = 7000 } = {}) {
  if (!r) return "";
  const moneda = r.cuenta?.moneda ?? "USD";
  const d = (n) => formatoMoneda(n, moneda);
  const q = r.q1Cuenta;
  const lineas = [
    `Revisión 3Q de las campañas de ${r.cliente?.nombre ?? "el cliente"} (cuenta ${r.cuenta?.nombre || r.cuenta?.externoId || "—"}, ${moneda}). Sólo lectura de lo que corre en el Ads Manager.`,
    q?.valor
      ? `Número mágico (el mismo para todas las etapas): ${q.metrica.toLowerCase()} ${d(q.valor)}${q.objetivo ? ` (objetivo ${d(q.objetivo)})` : ""}${q.equilibrio ? `, equilibrio ${d(q.equilibrio)}` : ""}${q.roasEquilibrio ? `, ROAS de equilibrio ${coma(q.roasEquilibrio)}` : ""}${r.numero?.tasaCierre ? `; tasa de cierre ${coma(r.numero.tasaCierre)} %` : ""}${r.numero?.de ? `, ${r.numero.de}` : ""}.`
      : `Sin número mágico: no se sabe si lo que cuesta es caro y NO se pausa nada por costo.${r.numero?.falta?.length ? ` ${r.numero.falta.map((f) => f.texto).join(" ")}` : ""} Se completa en Marca → Números del negocio.`,
    r.resumen?.frase ?? "",
    q ? `Lo real (${q.metrica.toLowerCase()}): ${VENTANAS.map((w) => `${w} días ${d(q.ventanas[w].gasto)} · ${q.ventanas[w][q.resultado] ?? 0} ${q.resultado}${q.ventanas[w].real != null ? ` · ${d(q.ventanas[w].real)} c/u` : ""}`).join("; ")}.` : "",
  ];
  if (!r.campanas?.length) lineas.push("No tiene campañas activas.");
  for (const c of r.campanas ?? []) {
    const c7 = c.ventanas?.[7];
    lineas.push(
      "",
      `· «${c.nombre}» · ${c.nombreEtapa ? `${c.nombreEtapa}${c.etapaDe === "manual" ? " (escogida a mano)" : ""}` : "sin etapa"} · ${c.nombreObjetivo}${c.cbo ? " · presupuesto de campaña" : ""}`,
      `  ${c.semaforo?.texto ? `${c.semaforo.texto} · ` : ""}${c.veredicto.nombre} — ${c.veredicto.motivo}`,
      c7 ? `  7 días: ${d(c7.gasto)} · ${c7.resultados ?? 0} ${c.nombreResultado}${c7.costoPorResultado ? ` · ${d(c7.costoPorResultado)} c/u` : ""}${c.referencia?.ref ? ` (número mágico ${d(c.referencia.ref)})` : ""}` : "",
    );
    const q2 = c.q2?.metricas ?? [];
    if (q2.length) lineas.push(`  Q2: ${q2.map((m) => lineaQ2(m, moneda)).join("; ")}`);
    for (const x of [...(c.conjuntos ?? []).map((s) => ["Conjunto", s]), ...(c.anuncios ?? []).map((a) => ["Anuncio", a])]) {
      const [nivel, y] = x;
      if (y.veredicto?.heredado) continue;
      const mal = (y.q2?.metricas ?? []).filter((m) => m.mal);
      lineas.push(`  - ${nivel} «${y.nombre}»: ${y.veredicto.nombre} — ${y.veredicto.motivo}${mal.length ? ` Q2: ${mal.map((m) => lineaQ2(m, moneda)).join("; ")}` : ""}`);
      for (const a of y.veredicto.acciones ?? []) if (a.texto) lineas.push(`    Q3 · ${a.titulo}: ${a.texto}`);
    }
    // Qué publicación del calendario es cada anuncio (worker/lib/enPauta.js la pone en `publicacionTexto`).
    const pubs = (c.anuncios ?? []).filter((a) => a.publicacionTexto);
    if (pubs.length) lineas.push(`  Qué publicación es cada anuncio: ${pubs.map((a) => `«${a.nombre}»: ${String(a.publicacionTexto).replace(/\.$/, "")}`).join("; ")}.`);
  }
  return lineas.filter((l) => l !== "").join("\n").slice(0, max);
}

/** Lo que se le pide a la IA si se quiere la explicación: la revisión delante y la orden de no inventar. Pura. */
export function pedidoRevisionIA({ marca, revision }) {
  return [
    `Eres el especialista en Meta Ads de una agencia en Panamá. Explica a la agencia, en 4 a 8 frases sencillas, cómo van los anuncios de ${marca}, por qué y qué hacer primero, en ese orden (qué pasó, por qué, qué hacer).`,
    "Usa SOLO las cifras y los veredictos de abajo; no inventes ninguna cifra ni cambies un veredicto. Español latino neutro, con «tú». Di «costo por conversación», no «CPA». Lo que dice «Sano: no se toca» o «Esperar», no se toca.",
    "",
    textoDeRevision(revision, { max: 9000 }),
  ].join("\n");
}

// ------------------------------------------------------------
// El informe de anuncios: lo que ve sólo la agencia
// ------------------------------------------------------------

/**
 * Las métricas del curso del mes para la vista de la AGENCIA del informe (el cliente no las ve): el % de mensajes,
 * el CTR único y el costo por conversación (o por compra) real frente al número mágico. `fila`: el total del mes de
 * /insights; `numeros`: { conversacion, compra }. null si la fila no trae lo nuevo. Pura.
 */
export function agenciaDelInforme(fila, { numeros = null, destino = "", umbrales = UMBRALES_3Q, campanas = null } = {}) {
  const c = cifras3q(fila);
  if (!c || (c.clicsUnicos == null && c.ctrUnico == null)) return null;
  const u = { ...UMBRALES_3Q, ...umbrales };
  const web = destino === "web";
  const n = web ? numeros?.compra : numeros?.conversacion;
  // El costo REAL sólo de las campañas que buscan ese resultado (las de mensajes; en la web, las de ventas): `campanas`
  // ([{ objective, insights }] del mes), si llegan. Sin ellas, la cuenta entera, como antes.
  const deEsas = Array.isArray(campanas)
    ? cifras3q(sumarFilas(campanas.filter((x) => (web ? objetivoODAX(x?.objective) === "OUTCOME_SALES" : ["OUTCOME_ENGAGEMENT", "OUTCOME_SALES"].includes(objetivoODAX(x?.objective)))).map((x) => x.insights)))
    : c;
  return {
    pctMensajes: web ? null : c.pctMensajes,
    ctrUnico: c.ctrUnico,
    costoClicUnico: c.costoClicUnico,
    conversaciones: c.conversaciones,
    compras: c.compras,
    metrica: web ? "Costo por compra" : "Costo por conversación",
    real: web ? deEsas.costoCompra : deEsas.costoConversacion,
    objetivo: Number(n?.objetivo) > 0 ? r2(n.objetivo) : null,
    equilibrio: Number(n?.equilibrio) > 0 ? r2(n.equilibrio) : null,
    // EL número mágico (el mismo de la ficha y la revisión) y, en la web, el ROAS frente al de equilibrio.
    valor: Number(n?.valor) > 0 ? r2(n.valor) : null,
    roas: web ? deEsas.roas : null,
    roasEquilibrio: web && Number(n?.roasEquilibrio) > 0 ? r2(n.roasEquilibrio) : null,
    umbrales: { pctMensajes: u.pctMensajes, ctrUnico: u.ctrUnico },
  };
}
