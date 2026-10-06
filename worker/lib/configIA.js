// ============================================================
// Qué modelo y cuánto razonamiento: una decisión del espacio
//
// Había tres modelos repartidos por el código —Haiku para casi todo el
// calendario, Sonnet sin razonar para las fichas, Opus 5.5 en el chat—
// y ninguno se veía desde la aplicación. Los guiones profesionales los
// escribía el modelo más pequeño sin que nadie lo hubiera decidido.
//
// Ahora hay UNA configuración, en `ajustes_espacio`, que cambia sólo el
// administrador:
//
//   · ia_modelo: «sonnet» (por defecto), «opus» o «haiku» (el barato).
//   · ia_razonamiento: «bajo», «medio», «alto» (por defecto) o «maximo».
//
// y la usan todas las llamadas de texto: chat, calendario, publicaciones
// y fichas. Las imágenes y los videos siguen en Gemini: Claude no genera
// imágenes ni ve video.
//
// «Opus» no es un id fijo: se pregunta a Anthropic qué modelos tiene la
// cuenta y se usa el Opus más reciente de la lista. Si no hay ninguno,
// o la cuenta lo rechaza al llamarlo, se vuelve a Sonnet 5 y se avisa.
//
// Y un PRESUPUESTO del mes (`presupuesto_usd`, `al_limite`): antes de
// cada llamada se suma lo gastado, y al llegar al tope se avisa, se baja
// a Sonnet en nivel Bajo o se detiene la IA, según se haya elegido. El
// saldo de Anthropic se acabó una vez sin que nadie lo viera venir.
// ============================================================

import { fechaEnZona } from "../../src/lib/agenda.js";

export const MODELO_SONNET = "claude-sonnet-5";

/**
 * El barato: la mitad que Sonnet. NO habla el mismo idioma que los
 * demás —ni razonamiento adaptativo ni `effort`, y las herramientas web
 * en su versión básica—: lo traduce `adaptarAlModelo()` en anthropic.js,
 * por donde pasa toda llamada, para que ninguna ruta tenga que saberlo.
 */
export const MODELO_HAIKU = "claude-haiku-4-5";

/** Del más reciente al más antiguo: el primero que tenga la cuenta. */
export const OPUS_PREFERIDOS = Object.freeze([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
]);

/**
 * Muse Spark, de Meta, por la API de Meta (api.meta.ai), que habla el
 * formato de mensajes de Anthropic: la llamada es la misma, cambia la
 * puerta (`abrirFlujo`). El «contributor» cuesta 12 veces menos a cambio
 * de que Meta pueda usar lo que se le manda para entrenar sus modelos.
 */
export const MODELO_MUSE = "muse-spark-1.3";
export const MODELO_MUSE_CONTRIBUIDOR = "muse-spark-1.2-contributor";
export const esMuse = (id) => String(id ?? "").startsWith("muse-");
/** La llave de Meta: `META_API_KEY`, o `MODEL_API_KEY`, que es como la llama su documentación. */
export const llaveMeta = (env) => env?.META_API_KEY || env?.MODEL_API_KEY || "";

export const RAZONAMIENTOS = Object.freeze({ bajo: "low", medio: "medium", alto: "high", maximo: "max" });
/** Lo que se elige para TODO (columna `ia_modelo`, con su CHECK): sólo Anthropic. */
export const MODELOS_ELEGIBLES = Object.freeze(["sonnet", "opus", "haiku"]);
/** Lo que se elige por función (`ia_modelos`, JSON): también Meta. */
export const MODELOS_POR_FUNCION = Object.freeze(["sonnet", "opus", "haiku", "muse", "muse-contribuidor"]);

/**
 * Cada llamada de texto pertenece a una de estas funciones, y cada una
 * puede llevar su modelo. Las claves de `funcion` (lo que se apunta en
 * `consumo_ia`) se reparten así; lo que no esté, va a «analisis».
 */
export const FUNCIONES_IA = Object.freeze({
  redaccion: ["calendario", "descripciones", "publicación"],
  guiones: ["guiones"],
  lectura: ["lectura de contenido"],
  asistente: ["asistente", "resumen del chat"],
  prompts: ["prompt de imagen"],
  analisis: ["informe", "auditoria", "cerebro", "ADN de marca", "kit de marca", "revisión de marca"],
});
/** Lo que escribe Muse Spark Contributor por defecto en cuanto hay llave de Meta (decisión de la agencia). */
export const MUSE_POR_DEFECTO_EN = Object.freeze(["redaccion", "guiones"]);
/** Qué motor hace las imágenes de la aplicación (adaptar a 4:5, /api/generar-imagen): «auto» es Meta si hay llave. */
export const MOTORES_IMAGEN = Object.freeze(["auto", "gemini", "meta"]);
export const huecoDe = (funcion) =>
  Object.keys(FUNCIONES_IA).find((h) => FUNCIONES_IA[h].includes(String(funcion ?? ""))) ?? "analisis";
export const ACCIONES_LIMITE = Object.freeze(["avisar", "bajar", "detener"]);
export const POR_DEFECTO = Object.freeze({
  ia_modelo: "sonnet",
  ia_razonamiento: "alto",
  ia_razonamiento_chat: null,
  ia_modelos: {},
  presupuesto_usd: 30,
  al_limite: "avisar",
});

/**
 * Lo que el razonamiento necesita ADEMÁS del texto pedido. El
 * razonamiento se paga del mismo max_tokens que la respuesta: sin este
 * margen, una ficha con presupuesto justo volvía con stop_reason
 * «max_tokens» y ni una línea de texto.
 */
export const MARGEN_RAZONAMIENTO = Object.freeze({ low: 4_000, medium: 8_000, high: 16_000, max: 32_000 });

/** US$ por millón de tokens. La caché se lee a 0,1× y se escribe a 1,25×. */
export const PRECIOS = Object.freeze({
  "claude-sonnet-5": { entrada: 2, salida: 10 },
  "claude-haiku-4-5": { entrada: 1, salida: 5 },
  "claude-opus-5-5": { entrada: 4, salida: 20 },
  "claude-opus-5": { entrada: 5, salida: 25 },
  "claude-opus-4-8": { entrada: 5, salida: 25 },
  "claude-opus-4-7": { entrada: 5, salida: 25 },
  "claude-opus-4-6": { entrada: 5, salida: 25 },
  "muse-spark-1.3": { entrada: 1.25, salida: 4.25 },
  "muse-spark-1.2-contributor": { entrada: 0.1, salida: 0.2 },
});

/** La búsqueda web se cobra aparte del texto: US$10 por cada 1.000. */
export const PRECIO_BUSQUEDA = 0.01;

/**
 * Gemini, US$ por millón de tokens. La imagen generada sale como tokens
 * de salida a 30 $/M (unos 1.290 por imagen, ≈ 0,039 $).
 */
export const PRECIOS_GEMINI = Object.freeze({
  "gemini-2.5-flash": { entrada: 0.3, salida: 2.5 },
  "gemini-2.5-flash-image": { entrada: 0.3, salida: 30 },
});

export function etiquetaModelo(id) {
  if (!id) return "";
  // «gemini-2.5-flash-image» → «Gemini 2.5 Flash Image».
  if (id === MODELO_MUSE_CONTRIBUIDOR) return "Muse Spark 1.2 Contributor";
  if (id.startsWith("muse-spark-")) return `Muse Spark ${id.slice("muse-spark-".length)}`;
  if (id.startsWith("gemini-")) {
    return id.split("-").map((p) => (/^\d/.test(p) ? p : p[0].toUpperCase() + p.slice(1))).join(" ");
  }
  const m = /^claude-(sonnet|opus|haiku|fable)-(\d+)(?:-(\d+))?/.exec(id);
  if (!m) return id;
  const nombre = m[1][0].toUpperCase() + m[1].slice(1);
  return `${nombre} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ""}`;
}

/** Búsquedas web de una llamada, según el `usage` de Anthropic. */
export const busquedasDe = (uso = {}) => Number(uso?.server_tool_use?.web_search_requests ?? 0);

/** Costo en US$ de una llamada, a partir de su `usage`. Incluye las búsquedas. */
export function costoUSD(modelo, uso = {}) {
  const p = PRECIOS[modelo] ?? PRECIOS[MODELO_SONNET];
  const entrada = Number(uso.input_tokens ?? 0);
  const salida = Number(uso.output_tokens ?? 0);
  const leido = Number(uso.cache_read_input_tokens ?? 0);
  const escrito = Number(uso.cache_creation_input_tokens ?? 0);
  const tokens = (entrada * p.entrada + leido * p.entrada * 0.1 + escrito * p.entrada * 1.25 + salida * p.salida) / 1_000_000;
  return tokens + busquedasDe(uso) * PRECIO_BUSQUEDA;
}

/** Costo en US$ de una llamada a Gemini, a partir de su `usageMetadata`. */
export function costoGemini(modelo, meta = {}) {
  const p = PRECIOS_GEMINI[modelo] ?? PRECIOS_GEMINI["gemini-2.5-flash"];
  const entrada = Number(meta?.promptTokenCount ?? 0);
  const salida = Number(meta?.candidatesTokenCount ?? 0) + Number(meta?.thoughtsTokenCount ?? 0);
  return (entrada * p.entrada + salida * p.salida) / 1_000_000;
}

/** El Opus más reciente de una lista de ids, o null. Pura. */
export function elegirOpus(ids = []) {
  const hay = new Set(ids);
  return OPUS_PREFERIDOS.find((id) => hay.has(id)) ?? null;
}

/** La configuración del espacio, con los valores por defecto si no hay fila. */
export async function leerConfigIA(acceso) {
  const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId }).catch(() => null);
  const modelo = MODELOS_ELEGIBLES.includes(fila?.ia_modelo) ? fila.ia_modelo : POR_DEFECTO.ia_modelo;
  const razonamiento = fila?.ia_razonamiento in RAZONAMIENTOS ? fila.ia_razonamiento : POR_DEFECTO.ia_razonamiento;
  const presupuesto = Number(fila?.presupuesto_usd);
  return {
    ia_modelo: modelo,
    ia_razonamiento: razonamiento,
    ia_razonamiento_chat: fila?.ia_razonamiento_chat in RAZONAMIENTOS ? fila.ia_razonamiento_chat : null,
    ia_modelos: limpiarModelos(fila?.ia_modelos),
    presupuesto_usd: Number.isFinite(presupuesto) && presupuesto >= 0 && fila?.presupuesto_usd != null ? presupuesto : POR_DEFECTO.presupuesto_usd,
    al_limite: ACCIONES_LIMITE.includes(fila?.al_limite) ? fila.al_limite : POR_DEFECTO.al_limite,
  };
}

/** `ia_modelos` como se guarda (texto JSON) → sólo funciones y modelos que existen. */
export function limpiarModelos(valor) {
  let obj = valor;
  if (typeof valor === "string") { try { obj = JSON.parse(valor); } catch { obj = {}; } }
  const salida = {};
  for (const [hueco, modelo] of Object.entries(obj && typeof obj === "object" ? obj : {})) {
    if (hueco in FUNCIONES_IA && MODELOS_POR_FUNCION.includes(modelo)) salida[hueco] = modelo;
    if (hueco === "imagen" && MOTORES_IMAGEN.includes(modelo)) salida.imagen = modelo;
  }
  return salida;
}

/**
 * El modelo elegido para una función: el suyo, o —en redacción y guiones,
 * si hay llave de Meta— Muse Spark Contributor, o el general. Pura.
 */
export function modeloParaHueco(config, hueco, { hayMeta = false } = {}) {
  const propio = config?.ia_modelos?.[hueco];
  if (propio) return propio;
  if (hayMeta && MUSE_POR_DEFECTO_EN.includes(hueco)) return "muse-contribuidor";
  return config?.ia_modelo ?? POR_DEFECTO.ia_modelo;
}

/** El motor de imagen que toca: el elegido, o con «auto», Meta si hay llave y si no Gemini. Pura. */
export function motorDeImagen(config, { hayMeta = false } = {}) {
  const elegido = config?.ia_modelos?.imagen ?? "auto";
  if (elegido === "meta") return hayMeta ? "meta" : "gemini";
  if (elegido === "gemini") return "gemini";
  return hayMeta ? "meta" : "gemini";
}

/** El mes en curso en Panamá, AAAA-MM: es el mes de las facturas de la agencia. */
export const mesActual = () => fechaEnZona().slice(0, 7);

/** Lo gastado este mes en US$, sumando todos los apuntes. */
export async function gastoDelMes(acceso, mes = mesActual()) {
  return acceso.sumar("consumo_ia", "costo_usd", { mes }).catch(() => 0);
}

/**
 * En qué punto del presupuesto está el mes. Pura.
 * `estado`: «libre» (sin tope), «ok», «aviso» (≥ 80 %) o «agotado».
 */
export function estadoPresupuesto(gasto, presupuesto) {
  if (!(presupuesto > 0)) return { estado: "libre", porcentaje: 0 };
  const porcentaje = (gasto / presupuesto) * 100;
  return { estado: porcentaje >= 100 ? "agotado" : porcentaje >= 80 ? "aviso" : "ok", porcentaje };
}

const textoBloqueo = (config) =>
  `Se alcanzó el presupuesto de IA del mes ($${config.presupuesto_usd.toFixed(2)}). ` +
  "El administrador puede subirlo en Ajustes → Presupuesto.";

/**
 * Para las llamadas que no son de Anthropic (Gemini): sólo si el
 * presupuesto las deja pasar. Devuelve el texto del bloqueo, o null.
 * «Bajar» no aplica: Gemini no tiene nivel que bajar.
 */
export async function bloqueoPorPresupuesto(acceso) {
  if (!acceso) return null;
  const config = await leerConfigIA(acceso);
  const { estado } = estadoPresupuesto(await gastoDelMes(acceso), config.presupuesto_usd);
  return estado === "agotado" && config.al_limite === "detener" ? textoBloqueo(config) : null;
}

/**
 * Lo que necesita CUALQUIER llamada de IA antes de hacerse: modelo,
 * esfuerzo, y si el presupuesto la deja pasar.
 *
 *   · `para: "chat"` usa el nivel del asistente si hay uno propio.
 *   · `bloqueo`: texto listo para enseñar si el presupuesto está agotado
 *     y el espacio eligió «detener». Quien llama NO debe llamar a nadie.
 *   · Con «bajar», la llamada sale con Sonnet en nivel Bajo y un aviso.
 */
export async function prepararIA(env, acceso, { para = "texto", funcion = null } = {}) {
  const config = acceso ? await leerConfigIA(acceso) : { ...POR_DEFECTO };
  const gasto = acceso ? await gastoDelMes(acceso) : 0;
  const { estado } = estadoPresupuesto(gasto, config.presupuesto_usd);
  const nivel = para === "chat" && config.ia_razonamiento_chat ? config.ia_razonamiento_chat : config.ia_razonamiento;
  const tope = `$${config.presupuesto_usd.toFixed(2)}`;

  if (estado === "agotado" && config.al_limite === "detener") {
    return { bloqueo: textoBloqueo(config), config, gasto };
  }
  if (estado === "agotado" && config.al_limite === "bajar") {
    const ia = await resolverIA(env, { ia_modelo: "sonnet", ia_razonamiento: "bajo" });
    return { ...ia, aviso: `Presupuesto del mes alcanzado (${tope}): la IA trabaja con Sonnet en nivel Bajo.`, config, gasto, bloqueo: null };
  }
  const hueco = para === "chat" ? "asistente" : huecoDe(funcion);
  const elegido = modeloParaHueco(config, hueco, { hayMeta: Boolean(llaveMeta(env)) });
  const ia = await resolverIA(env, { ia_modelo: elegido, ia_razonamiento: nivel });
  return { ...ia, hueco, config, gasto, bloqueo: null };
}

// La lista de modelos cambia poco: se pide una vez cada diez minutos por
// instancia del Worker, no en cada mensaje.
let cacheModelos = { hasta: 0, ids: null };

/** Los modelos que tiene la cuenta de Anthropic. null si no se pudo saber. */
export async function modelosDeLaCuenta(env) {
  if (cacheModelos.ids && Date.now() < cacheModelos.hasta) return cacheModelos.ids;
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) {
      console.error("modelos:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const ids = (data?.data ?? []).map((m) => m?.id).filter(Boolean);
    cacheModelos = { hasta: Date.now() + 10 * 60_000, ids };
    return ids;
  } catch (e) {
    console.error("modelos:", e);
    return null;
  }
}

/** Para las pruebas: la caché es de módulo y sobreviviría entre casos. */
export function olvidarModelos() {
  cacheModelos = { hasta: 0, ids: null };
}

/**
 * Lo que se manda a Anthropic según la configuración: el id del modelo
 * y el esfuerzo. `aviso` explica por qué no es el elegido, si no lo es.
 */
export async function resolverIA(env, config) {
  const esfuerzo = RAZONAMIENTOS[config.ia_razonamiento] ?? "high";
  if (config.ia_modelo === "muse" || config.ia_modelo === "muse-contribuidor") {
    // Sin llave de Meta no se intenta: se escribe con Sonnet y se dice.
    if (!llaveMeta(env)) return { modelo: MODELO_SONNET, esfuerzo, aviso: "Falta la llave de Meta (META_API_KEY): se usó Sonnet 5." };
    return { modelo: config.ia_modelo === "muse" ? MODELO_MUSE : MODELO_MUSE_CONTRIBUIDOR, esfuerzo, aviso: "" };
  }
  // Haiku no se pregunta a la cuenta: si no lo tiene, la llamada lo
  // rechaza y vuelve sola a Sonnet, como con Opus.
  if (config.ia_modelo === "haiku") return { modelo: MODELO_HAIKU, esfuerzo, aviso: "" };
  if (config.ia_modelo !== "opus") return { modelo: MODELO_SONNET, esfuerzo, aviso: "" };

  const ids = await modelosDeLaCuenta(env);
  // Sin lista no se sabe: se prueba con Opus 5, y si la cuenta lo
  // rechaza, la llamada vuelve sola a Sonnet (ver quien llama).
  if (!ids) return { modelo: "claude-opus-5", esfuerzo, aviso: "" };
  const opus = elegirOpus(ids);
  if (opus) return { modelo: opus, esfuerzo, aviso: "" };
  return { modelo: MODELO_SONNET, esfuerzo, aviso: "Tu cuenta de Anthropic no tiene ningún Opus: se usó Sonnet 5." };
}

/**
 * Apunta lo que costó una llamada. No se espera ni puede tumbar la
 * respuesta: si falla, lo que se pierde es un apunte del contador.
 */
export async function registrarConsumo(acceso, { funcion, modelo, uso, clienteId = null }) {
  if (!acceso || !uso) return;
  const ahora = new Date().toISOString();
  const dia = fechaEnZona();
  try {
    await acceso.insertar("consumo_ia", {
      id: crypto.randomUUID(),
      mes: dia.slice(0, 7),
      dia,
      proveedor: esMuse(modelo) ? "meta" : "anthropic",
      client_id: clienteId ? String(clienteId) : null,
      funcion: String(funcion ?? "otro").slice(0, 40),
      modelo: String(modelo ?? ""),
      entrada: Number(uso.input_tokens ?? 0),
      salida: Number(uso.output_tokens ?? 0),
      cache_leido: Number(uso.cache_read_input_tokens ?? 0),
      cache_escrito: Number(uso.cache_creation_input_tokens ?? 0),
      busquedas: busquedasDe(uso),
      costo_usd: costoUSD(modelo, uso),
      created_at: ahora,
    });
  } catch (e) {
    console.error("consumo: no se pudo apuntar", e);
  }
}

/** Lo mismo para Gemini (imágenes y video), con su `usageMetadata`. */
export async function registrarConsumoGemini(acceso, { funcion, modelo, meta, clienteId = null }) {
  if (!acceso) return;
  const ahora = new Date().toISOString();
  const dia = fechaEnZona();
  try {
    await acceso.insertar("consumo_ia", {
      id: crypto.randomUUID(),
      mes: dia.slice(0, 7),
      dia,
      proveedor: "gemini",
      client_id: clienteId ? String(clienteId) : null,
      funcion: String(funcion ?? "otro").slice(0, 40),
      modelo: String(modelo ?? ""),
      entrada: Number(meta?.promptTokenCount ?? 0),
      salida: Number(meta?.candidatesTokenCount ?? 0) + Number(meta?.thoughtsTokenCount ?? 0),
      cache_leido: 0,
      cache_escrito: 0,
      busquedas: 0,
      costo_usd: costoGemini(modelo, meta),
      created_at: ahora,
    });
  } catch (e) {
    console.error("consumo: no se pudo apuntar", e);
  }
}

/**
 * Apunta una llamada de la que se conoce el costo pero no los tokens: una
 * imagen del Estudio, cuyo precio es fijo por pieza. Igual que las otras,
 * no se espera ni puede tumbar la respuesta.
 */
export async function registrarConsumoFijo(acceso, { proveedor, funcion, modelo, costo, clienteId = null }) {
  if (!acceso || !(costo > 0)) return;
  const dia = fechaEnZona();
  try {
    await acceso.insertar("consumo_ia", {
      id: crypto.randomUUID(),
      mes: dia.slice(0, 7),
      dia,
      proveedor: String(proveedor ?? "otro").slice(0, 20),
      client_id: clienteId ? String(clienteId) : null,
      funcion: String(funcion ?? "otro").slice(0, 40),
      modelo: String(modelo ?? ""),
      entrada: 0,
      salida: 0,
      cache_leido: 0,
      cache_escrito: 0,
      busquedas: 0,
      costo_usd: Number(costo),
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("consumo: no se pudo apuntar", e);
  }
}
