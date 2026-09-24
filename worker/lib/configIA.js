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
//   · ia_modelo: «sonnet» (por defecto) u «opus».
//   · ia_razonamiento: «bajo», «medio», «alto» (por defecto) o «maximo».
//
// y la usan todas las llamadas de texto: chat, calendario, publicaciones
// y fichas. Las imágenes y los videos siguen en Gemini: Claude no genera
// imágenes ni ve video.
//
// «Opus» no es un id fijo: se pregunta a Anthropic qué modelos tiene la
// cuenta y se usa el Opus más reciente de la lista. Si no hay ninguno,
// o la cuenta lo rechaza al llamarlo, se vuelve a Sonnet 5 y se avisa.
// ============================================================

export const MODELO_SONNET = "claude-sonnet-5";

/** Del más reciente al más antiguo: el primero que tenga la cuenta. */
export const OPUS_PREFERIDOS = Object.freeze([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
]);

export const RAZONAMIENTOS = Object.freeze({ bajo: "low", medio: "medium", alto: "high", maximo: "max" });
export const MODELOS_ELEGIBLES = Object.freeze(["sonnet", "opus"]);
export const POR_DEFECTO = Object.freeze({ ia_modelo: "sonnet", ia_razonamiento: "alto" });

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
  "claude-opus-5-5": { entrada: 4, salida: 20 },
  "claude-opus-5": { entrada: 5, salida: 25 },
  "claude-opus-4-8": { entrada: 5, salida: 25 },
  "claude-opus-4-7": { entrada: 5, salida: 25 },
  "claude-opus-4-6": { entrada: 5, salida: 25 },
});

export function etiquetaModelo(id) {
  if (!id) return "";
  const m = /^claude-(sonnet|opus|haiku|fable)-(\d+)(?:-(\d+))?/.exec(id);
  if (!m) return id;
  const nombre = m[1][0].toUpperCase() + m[1].slice(1);
  return `${nombre} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ""}`;
}

/** Costo en US$ de una llamada, a partir de su `usage`. */
export function costoUSD(modelo, uso = {}) {
  const p = PRECIOS[modelo] ?? PRECIOS[MODELO_SONNET];
  const entrada = Number(uso.input_tokens ?? 0);
  const salida = Number(uso.output_tokens ?? 0);
  const leido = Number(uso.cache_read_input_tokens ?? 0);
  const escrito = Number(uso.cache_creation_input_tokens ?? 0);
  return (entrada * p.entrada + leido * p.entrada * 0.1 + escrito * p.entrada * 1.25 + salida * p.salida) / 1_000_000;
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
  return { ia_modelo: modelo, ia_razonamiento: razonamiento };
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
export async function registrarConsumo(acceso, { funcion, modelo, uso }) {
  if (!acceso || !uso) return;
  const ahora = new Date().toISOString();
  try {
    await acceso.insertar("consumo_ia", {
      id: crypto.randomUUID(),
      mes: ahora.slice(0, 7),
      funcion: String(funcion ?? "otro").slice(0, 40),
      modelo: String(modelo ?? ""),
      entrada: Number(uso.input_tokens ?? 0),
      salida: Number(uso.output_tokens ?? 0),
      cache_leido: Number(uso.cache_read_input_tokens ?? 0),
      cache_escrito: Number(uso.cache_creation_input_tokens ?? 0),
      costo_usd: costoUSD(modelo, uso),
      created_at: ahora,
    });
  } catch (e) {
    console.error("consumo: no se pudo apuntar", e);
  }
}
