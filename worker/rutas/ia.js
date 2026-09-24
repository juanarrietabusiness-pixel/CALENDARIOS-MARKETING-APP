// ============================================================
// Proxy de IA — el puerto de supabase/functions/ai
//
// Cambia el envoltorio, no el contenido. Lo que viene de la función
// original y NO se toca, porque está aprendido a base de golpes:
//
//  · El razonamiento se paga del mismo max_tokens que el texto: una
//    respuesta puede volver con stop_reason «max_tokens» y sin un solo
//    bloque de texto. Antes se apagaba; ahora se enciende a propósito
//    —es lo que hace buenos los guiones— y se le suma su margen
//    (MARGEN_RAZONAMIENTO) al presupuesto que pide el navegador.
//  · Recorrer TODOS los bloques de la respuesta. Con `find` basta un
//    bloque de pensamiento por delante para que el texto llegue vacío
//    sin ningún error.
//  · El `diagnostico`, para no tener que adivinar a qué se fue el
//    presupuesto.
//
// LO QUE SÍ MEJORA: el reloj. Netlify cortaba a los 10 s —por eso esto
// vivía en Supabase— y Supabase corta a los 150 s. En Workers de pago el
// reloj no tiene límite mientras el cliente siga conectado, y los cinco
// minutos son de CPU, que esperar a Anthropic no consume. El presupuesto
// se mantiene, pero por higiene: un proveedor colgado no puede colgar la
// petición para siempre.
//
// QUÉ MODELO: el que diga la configuración del espacio (configIA.js),
// Sonnet 5 con razonamiento alto por defecto. El `tier` que manda el
// navegador ya no elige nada: antes «rapido» era Haiku, y con él se
// escribían casi todos los guiones sin que nadie lo hubiera decidido.
// ============================================================

import { json, error, cuerpo } from "../lib/respuesta.js";
import { abrirFlujo, leerFlujo, textoDe, esRechazoDeModelo, mensajeDeRechazo, RechazoAnthropic } from "../lib/anthropic.js";
import { leerConfigIA, resolverIA, registrarConsumo, MARGEN_RAZONAMIENTO, MODELO_SONNET } from "../lib/configIA.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024;   // las publicaciones llevan imágenes
const MAX_TOKENS_CAP = 64_000;            // texto pedido + margen del razonamiento
const PRESUPUESTO_MS = 290_000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bloques de texto solamente: Groq no acepta imágenes en este modelo. */
function soloTexto(content) {
  if (!Array.isArray(content)) return content;
  return content
    .filter((b) => b && typeof b === "object" && b.type === "text")
    .map((b) => ({ type: "text", text: b.text ?? "" }));
}

async function llamarGroq(env, content, maxTokens, signal) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: soloTexto(content) }],
    }),
  });
}

export async function rutaIA(req, env, { acceso } = {}) {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_BODY_BYTES) return error("La petición es demasiado grande", 413);

  const body = await cuerpo(req);
  if (!body) return error("JSON inválido");

  const content = body.content;
  if (!content || (typeof content !== "string" && !Array.isArray(content))) {
    return error("Falta el contenido de la petición");
  }

  const pedido = Math.min(Math.max(Number(body.maxTokens) || 2048, 256), MAX_TOKENS_CAP);

  const proveedor = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  const usarGroq = proveedor === "groq"
    ? true
    : proveedor === "anthropic"
      ? false
      : !env.ANTHROPIC_API_KEY && Boolean(env.GROQ_API_KEY);

  if (usarGroq && !env.GROQ_API_KEY) return error("El servidor no tiene configurada la clave de Groq", 503);
  if (!usarGroq && !env.ANTHROPIC_API_KEY) return error("El servidor no tiene configurada la clave de Anthropic", 503);

  const arranque = Date.now();
  const restante = () => PRESUPUESTO_MS - (Date.now() - arranque);
  const transcurrido = () => Math.round((Date.now() - arranque) / 1000);
  const seAgoto = () => error(
    `La IA no respondió en ${transcurrido()} s y se agotó el margen. ` +
    "Prueba con menos publicaciones por tanda.", 504,
  );

  if (usarGroq) return rutaGroq(env, content, pedido, { restante, transcurrido, seAgoto });

  const config = acceso ? await leerConfigIA(acceso) : { ia_modelo: "sonnet", ia_razonamiento: "alto" };
  const ia = await resolverIA(env, config);
  // El presupuesto del navegador es para ESCRIBIR; el razonamiento va aparte.
  const maxTokens = Math.min(pedido + (MARGEN_RAZONAMIENTO[ia.esfuerzo] ?? 16_000), MAX_TOKENS_CAP);
  let modelo = ia.modelo;
  let aviso = ia.aviso;

  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), restante());
  let m;
  try {
    for (;;) {
      try {
        const res = await abrirFlujo(env, {
          model: modelo,
          max_tokens: maxTokens,
          thinking: { type: "adaptive" },
          output_config: { effort: ia.esfuerzo },
          messages: [{ role: "user", content }],
        }, { signal: abortar.signal });
        m = await leerFlujo(res);
        break;
      } catch (e) {
        // La cuenta no tiene el Opus elegido: se escribe con Sonnet 5 y se dice.
        if (esRechazoDeModelo(e) && modelo !== MODELO_SONNET) {
          aviso = `Tu cuenta de Anthropic rechazó ${modelo}: se usó Sonnet 5.`;
          modelo = MODELO_SONNET;
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    if (abortar.signal.aborted) return seAgoto();
    const estado = e instanceof RechazoAnthropic ? (e.estado === 429 ? 429 : 502) : 502;
    return error(mensajeDeRechazo(e), estado, e);
  } finally {
    clearTimeout(reloj);
  }

  if (m.error) {
    return error(m.error.type === "overloaded_error"
      ? "La IA está saturada. Inténtalo en unos segundos."
      : `La IA cortó la respuesta: ${m.error.message ?? "sin motivo"}`, 502);
  }
  await registrarConsumo(acceso, { funcion: String(body.funcion ?? "calendario").slice(0, 40), modelo, uso: m.usage });

  const u = m.usage ?? {};
  const bloques = m.content ?? [];
  return json({
    text: textoDe(m),
    provider: "anthropic",
    model: modelo,
    aviso,
    // La diferencia entre un prompt maestro entero y uno cortado a
    // media pieza, que desde el navegador no se distingue de un modelo
    // que decidió parar.
    truncated: m.stop_reason === "max_tokens",
    segundos: transcurrido(),
    // Sin estos números, «se cortó» obliga a adivinar si el presupuesto
    // se fue en texto o en pensamiento, y esa duda ya costó tres rondas
    // de arreglos que apuntaban al sitio equivocado.
    diagnostico: {
      stopReason: m.stop_reason ?? "",
      pensamiento: ia.esfuerzo,
      maxTokens,
      tipos: bloques.map((b) => b?.type ?? "?"),
      entrada: u.input_tokens ?? 0,
      salida: u.output_tokens ?? 0,
      cacheLeido: u.cache_read_input_tokens ?? 0,
      cacheEscrito: u.cache_creation_input_tokens ?? 0,
    },
  });
}

/** Groq, sin cambios: no tiene razonamiento que configurar. */
async function rutaGroq(env, content, maxTokens, { restante, transcurrido, seAgoto }) {
  const reintentos = 2;
  for (let intento = 0; intento <= reintentos; intento++) {
    const ms = restante();
    if (ms <= 5_000) return seAgoto();

    const abortar = new AbortController();
    const reloj = setTimeout(() => abortar.abort(), ms);
    let res;
    try {
      res = await llamarGroq(env, content, maxTokens, abortar.signal);
    } catch (e) {
      clearTimeout(reloj);
      if (abortar.signal.aborted) return seAgoto();
      if (intento < reintentos && restante() > 30_000) {
        await dormir(2 ** (intento + 1) * 1000);
        continue;
      }
      return error("No se pudo contactar con el proveedor de IA", 502, e);
    }
    clearTimeout(reloj);

    if ((res.status === 429 || res.status >= 500) && intento < reintentos && restante() > 30_000) {
      await dormir(2 ** (intento + 1) * 1000);
      continue;
    }
    if (!res.ok) {
      console.error("ia: Groq respondió", res.status, await res.text().catch(() => ""));
      return error(res.status === 429
        ? "El proveedor de IA está saturado. Inténtalo en unos segundos."
        : "Groq devolvió un error.", res.status === 429 ? 429 : 502);
    }
    const data = await res.json();
    return json({
      text: data?.choices?.[0]?.message?.content ?? "",
      provider: "groq",
      model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
      truncated: false,
      segundos: transcurrido(),
      diagnostico: null,
    });
  }
  return error("No se pudo generar el contenido", 502);
}
