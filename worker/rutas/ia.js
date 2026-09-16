// ============================================================
// Proxy de IA — el puerto de supabase/functions/ai
//
// Cambia el envoltorio, no el contenido. Lo que viene de la función
// original y NO se toca, porque está aprendido a base de golpes:
//
//  · La política de pensamiento por nivel. Los modelos actuales piensan
//    si no se les dice que no, y ese pensamiento se paga del mismo
//    max_tokens que el texto: una respuesta puede volver con
//    stop_reason «max_tokens» y sin un solo bloque de texto.
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
// ============================================================

import { json, error, cuerpo } from "../lib/respuesta.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024;   // las publicaciones llevan imágenes
const MAX_TOKENS_CAP = 32_000;            // un prompt maestro de 12 piezas no cabe en 4096
const PRESUPUESTO_MS = 230_000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bloques de texto solamente: Groq no acepta imágenes en este modelo. */
function soloTexto(content) {
  if (!Array.isArray(content)) return content;
  return content
    .filter((b) => b && typeof b === "object" && b.type === "text")
    .map((b) => ({ type: "text", text: b.text ?? "" }));
}

function niveles(env) {
  // "omitir"     no se manda el campo (Haiku 4.5 ya viene sin pensamiento)
  // "no"         se apaga explícitamente
  // "adaptativo" se enciende con esfuerzo bajo, por si hiciera falta
  const pensarCalidad =
    (env.AI_PENSAR ?? "").trim().toLowerCase() === "adaptativo" ? "adaptativo" : "no";
  return {
    rapido: { model: env.AI_MODEL || "claude-haiku-4-5-20251001", pensar: "omitir" },
    calidad: { model: env.AI_MODEL_CALIDAD || "claude-sonnet-5", pensar: pensarCalidad },
  };
}

async function llamarAnthropic(env, content, maxTokens, nivel, signal) {
  const cuerpoPeticion = {
    model: nivel.model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  };

  // El campo sólo se manda cuando hay algo que decir: a los modelos que
  // ya vienen sin pensamiento no se les cambia la petición.
  if (nivel.pensar === "no") {
    cuerpoPeticion.thinking = { type: "disabled" };
  } else if (nivel.pensar === "adaptativo") {
    cuerpoPeticion.thinking = { type: "adaptive" };
    // Sin esto el esfuerzo es «high» y el razonamiento se come el
    // presupuesto igual que cuando no se configuraba nada.
    cuerpoPeticion.output_config = { effort: "low" };
  }

  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(cuerpoPeticion),
  });
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

export async function rutaIA(req, env) {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_BODY_BYTES) return error("La petición es demasiado grande", 413);

  const body = await cuerpo(req);
  if (!body) return error("JSON inválido");

  const content = body.content;
  if (!content || (typeof content !== "string" && !Array.isArray(content))) {
    return error("Falta el contenido de la petición");
  }

  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 2048, 256), MAX_TOKENS_CAP);
  const tabla = niveles(env);
  const nivel = tabla[String(body.tier ?? "rapido")] ?? tabla.rapido;

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
    `El proveedor de IA no respondió en ${transcurrido()} s y se agotó el margen. ` +
    "Prueba con menos publicaciones por tanda.", 504,
  );

  const reintentos = 2;
  for (let intento = 0; intento <= reintentos; intento++) {
    // Cada intento sólo puede usar lo que quede: así el tercero no
    // empieza sabiendo que no va a caber.
    const ms = restante();
    if (ms <= 5_000) return seAgoto();

    const abortar = new AbortController();
    const reloj = setTimeout(() => abortar.abort(), ms);
    let res;
    try {
      res = usarGroq
        ? await llamarGroq(env, content, maxTokens, abortar.signal)
        : await llamarAnthropic(env, content, maxTokens, nivel, abortar.signal);
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
      // El error del proveedor se registra pero no se devuelve tal cual:
      // puede describir la clave o la cuenta.
      console.error("ia: el proveedor respondió", res.status, await res.text().catch(() => ""));
      const msg = res.status === 429
        ? "El proveedor de IA está saturado. Inténtalo en unos segundos."
        : res.status === 401 || res.status === 403
          ? "La clave de IA del servidor no es válida. Revísala en los secretos del Worker."
          : "El proveedor de IA devolvió un error.";
      return error(msg, res.status === 429 ? 429 : 502);
    }

    const data = await res.json();

    // Se concatenan TODOS los bloques de texto, no el primero que
    // aparezca. Con `find` bastaba un bloque de pensamiento por delante
    // para que la respuesta llegara vacía sin que nadie supiera por qué.
    const bloques = Array.isArray(data?.content) ? data.content : [];
    const text = usarGroq
      ? (data?.choices?.[0]?.message?.content ?? "")
      : bloques.filter((b) => b?.type === "text").map((b) => b?.text ?? "").join("");

    const u = data?.usage ?? {};

    return json({
      text,
      provider: usarGroq ? "groq" : "anthropic",
      model: usarGroq ? (env.GROQ_MODEL || "llama-3.3-70b-versatile") : nivel.model,
      // La diferencia entre un prompt maestro entero y uno cortado a
      // media pieza, que desde el navegador no se distingue de un modelo
      // que decidió parar.
      truncated: !usarGroq && data?.stop_reason === "max_tokens",
      segundos: transcurrido(),
      // Sin estos números, «se cortó» obliga a adivinar si el presupuesto
      // se fue en texto o en pensamiento, y esa duda ya costó tres rondas
      // de arreglos que apuntaban al sitio equivocado.
      diagnostico: usarGroq ? null : {
        stopReason: data?.stop_reason ?? "",
        pensamiento: nivel.pensar,
        maxTokens,
        tipos: bloques.map((b) => b?.type ?? "?"),
        entrada: u.input_tokens ?? 0,
        salida: u.output_tokens ?? 0,
        cacheLeido: u.cache_read_input_tokens ?? 0,
        cacheEscrito: u.cache_creation_input_tokens ?? 0,
      },
    });
  }

  return error("No se pudo generar el contenido", 502);
}
