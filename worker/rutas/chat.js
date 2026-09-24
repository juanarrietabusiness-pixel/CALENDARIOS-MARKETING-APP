// ============================================================
// El asistente
//
// QUÉ CAMBIÓ Y POR QUÉ
//
// Era un proxy de una sola llamada: Sonnet con el razonamiento apagado,
// 8 192 tokens de respuesta, sin streaming, y todo lo que el modelo
// sabía tenía que venir escrito en el prompt. «Pierde información» no
// era una impresión: lo que no cabía en el resumen del ADN no existía.
//
// Ahora:
//
//   · Sonnet 5 con razonamiento adaptativo, cuya profundidad se ajusta
//     con `effort` (AI_CHAT_ESFUERZO, «high» por defecto). El
//     razonamiento se paga del mismo max_tokens que la respuesta, así
//     que el tope sube a 32 000. Otro modelo se elige con AI_CHAT_MODEL;
//     si la cuenta no lo tiene, se vuelve solo a Sonnet 5 (ver abajo).
//   · Streaming de punta a punta: el Worker lee el SSE de Anthropic y le
//     reenvía al navegador el texto según se escribe.
//   · Un BUCLE en el servidor para las herramientas de servidor (web,
//     repositorio de GitHub, consultas a D1: ver herramientasServidor.js).
//     Cuando el modelo pide una herramienta del navegador —las que
//     escriben en el calendario abierto—, el Worker termina el turno y
//     el navegador la ejecuta y vuelve a llamar, como antes.
//   · Caché del prompt: el sistema lleva su marca y la petición la
//     automática, que cubre el historial. En una conversación larga el
//     prefijo se lee de caché a una décima parte del precio.
//
// DOS REGLAS DE LOS MODELOS ACTUALES QUE ESTO RESPETA
//
//   · Los bloques de razonamiento se devuelven INTACTOS dentro de un
//     turno —firma incluida—; por eso el navegador reenvía `mensajes`
//     tal cual los recibe. Entre turnos no se reenvían: el historial
//     guardado es texto.
//   · `tool_choice` forzado es un 400 en Opus 5.5. No se usa.
//
// CUANDO LA CUENTA NO ACEPTA ALGO
//
// El despliegue con Opus 5.5 por defecto devolvió «El proveedor de IA
// devolvió un error» en el primer «Hola»: la misma clave que funcionaba
// con Sonnet 5 no tenía ese modelo, y el mensaje genérico escondía el
// motivo —el mismo fallo de diseño que tuvo antes la generación de
// imágenes con Gemini—. Ahora:
//
//   · un modelo que la cuenta no tiene se sustituye por MODELO_RESPALDO;
//   · la búsqueda web desactivada en la organización se quita de la
//     petición y se avisa, en vez de tumbar la respuesta entera;
//   · cualquier otro rechazo enseña el mensaje real de Anthropic.
// ============================================================

import { error, cuerpo, CABECERAS_API, json } from "../lib/respuesta.js";
import { partirSSE, crearAcumulador } from "../lib/flujoAnthropic.js";
import { crearEjecutor, DEFINICIONES, HERRAMIENTAS_WEB, NOMBRES, describirUso } from "../lib/herramientasServidor.js";
import { ahora, uuid } from "../lib/ids.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_TOKENS = 32_000;
const MAX_VUELTAS = 8;
const ESFUERZOS = new Set(["low", "medium", "high", "xhigh", "max"]);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const INSTRUCCION_SERVIDOR = `HERRAMIENTAS QUE TIENES ADEMÁS DE LAS DEL CALENDARIO:
· web_search y web_fetch: busca en internet y lee páginas cuando necesites datos actuales —tendencias,
  fechas, competencia, noticias del sector—. Cita de dónde sale lo que traigas de fuera.
· listar_repositorio y leer_archivo_repositorio: el repositorio de GitHub con el ADN de marca del
  cliente. El contexto de abajo trae un RESUMEN; si necesitas el detalle de un documento, léelo entero.
· ver_calendario, ver_tareas y ver_banco_ideas: consulta lo que hay guardado, de este u otro cliente
  y de otros meses. Pide lo que necesites en vez de suponerlo.
Antes de decir que no tienes un dato, mira si alguna de estas herramientas lo trae.`;

export const MODELO_RESPALDO = "claude-sonnet-5";
export const modeloChat = (env) => env.AI_CHAT_MODEL || MODELO_RESPALDO;

/** Un rechazo de Anthropic con su código y su motivo, para decidir qué hacer. */
class RechazoAnthropic extends Error {
  constructor(estado, tipo, mensaje) {
    super(mensaje || `Anthropic respondió ${estado}`);
    this.estado = estado;
    this.tipo = tipo;
  }
}

const NOMBRES_WEB = new Set(HERRAMIENTAS_WEB.map((h) => h.name));

/** ¿El rechazo es porque la cuenta no tiene ese modelo? */
export const esRechazoDeModelo = (e) =>
  e instanceof RechazoAnthropic &&
  (e.tipo === "not_found_error" || (e.estado === 400 && /\bmodel\b/i.test(e.message) && !/tool/i.test(e.message)));

/** ¿El rechazo es por la búsqueda o la lectura web? */
export const esRechazoDeWeb = (e) =>
  e instanceof RechazoAnthropic && (e.estado === 400 || e.estado === 403) &&
  /web[_ ]?(search|fetch)/i.test(e.message);

/** Lo que se le enseña a la persona: el motivo de verdad, no uno genérico. */
function mensajeDeRechazo(e) {
  if (e.estado === 429) return "El asistente está saturado. Inténtalo en unos segundos.";
  if (e.estado === 401 || e.estado === 403) return "La clave de IA del servidor no es válida o no tiene permiso.";
  return `Anthropic rechazó la petición (${e.estado}): ${String(e.message).slice(0, 300)}`;
}
const esfuerzo = (env) => (ESFUERZOS.has(env.AI_CHAT_ESFUERZO) ? env.AI_CHAT_ESFUERZO : "high");

function validarMensajes(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "Falta el historial de mensajes";
  for (const m of messages) {
    if (!m || typeof m !== "object") return "Mensaje inválido";
    if (m.role !== "user" && m.role !== "assistant") return "Rol de mensaje inválido";
    if (typeof m.content !== "string" && !Array.isArray(m.content)) return "Contenido de mensaje inválido";
    if (typeof m.content === "string" && !m.content.trim()) return "Contenido de mensaje vacío";
  }
  return null;
}

/** Las herramientas del navegador, sin nombres que choquen con las del servidor. */
function herramientasDelNavegador(tools) {
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((t) => t && typeof t.name === "string" && t.input_schema && !NOMBRES.has(t.name))
    .slice(0, 40)
    .map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

/**
 * Una llamada a Anthropic. Reintenta UNA vez si falla antes de empezar
 * a llegar nada (429, 5xx, red); a mitad del streaming no se reintenta,
 * que ya se ha enseñado texto.
 */
async function abrirFlujo(env, peticion) {
  for (let intento = 0; intento <= 1; intento++) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(peticion),
      });
    } catch (e) {
      if (intento < 1) { await dormir(2000); continue; }
      throw new Error("No se pudo contactar con el proveedor de IA", { cause: e });
    }
    if ((res.status === 429 || res.status >= 500) && intento < 1) { await dormir(2000); continue; }
    if (!res.ok) {
      const cuerpoError = await res.text().catch(() => "");
      console.error("chat: error", res.status, cuerpoError);
      let detalle = {};
      try { detalle = JSON.parse(cuerpoError)?.error ?? {}; } catch { /* no era JSON */ }
      throw new RechazoAnthropic(res.status, detalle.type ?? "", detalle.message ?? "");
    }
    return res;
  }
  throw new Error("No se pudo generar la respuesta");
}

/** Lee un flujo SSE entero, avisando de cada trozo. */
async function leerFlujo(res, alTrozo) {
  const acc = crearAcumulador();
  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const { eventos, resto } = partirSSE(buffer);
    buffer = resto;
    for (const ev of eventos) {
      const salida = acc.consumir(ev);
      if (salida) await alTrozo(salida);
    }
  }
  if (buffer.trim()) for (const ev of partirSSE(`${buffer}\n\n`).eventos) acc.consumir(ev);
  return acc.mensaje();
}

export async function rutaChat(req, env, { acceso, ctx } = {}) {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_BODY_BYTES) return error("La petición es demasiado grande", 413);

  const body = await cuerpo(req);
  if (!body) return error("JSON inválido");
  const invalido = validarMensajes(body.messages);
  if (invalido) return error(invalido);
  if (!env.ANTHROPIC_API_KEY) return error("El servidor no tiene configurada la clave de Anthropic", 503);

  let clienteActual = null;
  if (body.clienteId) {
    clienteActual = await acceso.leerUno("clients", { id: String(body.clienteId) });
    if (!clienteActual) return error("Cliente no encontrado", 404);
  }
  const ejecutor = crearEjecutor({ env, acceso, clienteActual });

  const system = [{ type: "text", text: INSTRUCCION_SERVIDOR }];
  if (typeof body.system === "string" && body.system.trim()) {
    system.push({ type: "text", text: body.system, cache_control: { type: "ephemeral" } });
  }
  const tools = [
    ...herramientasDelNavegador(body.tools),
    ...DEFINICIONES,
    ...(env.AI_CHAT_WEB === "no" ? [] : HERRAMIENTAS_WEB),
  ];
  const base = {
    model: modeloChat(env),
    max_tokens: MAX_TOKENS,
    stream: true,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: esfuerzo(env) },
    cache_control: { type: "ephemeral" },
    system,
    tools,
  };

  const { readable, writable } = new TransformStream();
  const escritor = writable.getWriter();
  const enc = new TextEncoder();
  let conectado = true;
  const emitir = async (obj) => {
    if (!conectado) return;
    try {
      await escritor.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
    } catch {
      // El navegador se fue. El bucle sigue hasta acabar su vuelta: lo
      // que ya pidió a Anthropic se paga igual.
      conectado = false;
    }
  };

  /**
   * Abre la llamada y, si la cuenta rechaza el modelo o la web, ajusta
   * la petición UNA vez por motivo y lo intenta otra vez. El ajuste se
   * queda en `base`: las vueltas siguientes ya salen con él.
   */
  const abrirConAjustes = async (peticion) => {
    for (let ajuste = 0; ajuste < 3; ajuste++) {
      try {
        return await abrirFlujo(env, peticion);
      } catch (e) {
        if (esRechazoDeModelo(e) && base.model !== MODELO_RESPALDO) {
          console.warn(`chat: la cuenta no acepta ${base.model}; se usa ${MODELO_RESPALDO}`);
          base.model = MODELO_RESPALDO;
          peticion = { ...peticion, model: MODELO_RESPALDO };
          continue;
        }
        if (esRechazoDeWeb(e) && base.tools.some((t) => NOMBRES_WEB.has(t.name))) {
          console.warn("chat: la cuenta rechaza la búsqueda web; se quita");
          base.tools = base.tools.filter((t) => !NOMBRES_WEB.has(t.name));
          peticion = { ...peticion, tools: base.tools };
          await emitir({ t: "aviso", texto: "Sin búsqueda en internet: no está activada en la cuenta de Anthropic" });
          continue;
        }
        if (e instanceof RechazoAnthropic) throw new Error(mensajeDeRechazo(e));
        throw e;
      }
    }
    throw new Error("No se pudo generar la respuesta");
  };

  const trabajo = (async () => {
    const mensajes = [...body.messages];
    const nuevos = [];
    // Si quien preguntó cerró la pestaña a mitad, la respuesta la guarda
    // el servidor: el mensaje del usuario ya estaba en el historial y la
    // respuesta, pagada. Sólo cuando no queda nada por hacer en el
    // navegador —si faltaba una herramienta suya, no hay respuesta que
    // guardar—.
    const guardarSiSeFue = async () => {
      if (conectado || !clienteActual) return;
      const texto = nuevos
        .filter((x) => x.role === "assistant")
        .flatMap((x) => x.content.filter((b) => b.type === "text").map((b) => b.text))
        .join("").trim();
      if (!texto) return;
      await acceso.insertar("chat_messages", {
        id: uuid(), client_id: clienteActual.id, role: "assistant", content: texto, created_at: ahora(),
      }).catch((e) => console.error("chat: no se pudo guardar la respuesta huérfana", e));
    };
    const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    try {
      for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
        const res = await abrirConAjustes({ ...base, messages: mensajes });
        const m = await leerFlujo(res, async (trozo) => {
          if (trozo.tipo === "servidor") await emitir({ t: "herramienta", texto: describirUso(trozo.nombre, trozo.entrada) });
          else await emitir({ t: trozo.tipo, d: trozo.texto });
        });
        if (m.error) throw new Error(m.error.type === "overloaded_error"
          ? "El asistente está saturado. Inténtalo en unos segundos."
          : "El proveedor de IA cortó la respuesta.");
        for (const k of Object.keys(uso)) uso[k] += Number(m.usage?.[k] ?? 0);

        const asistente = { role: "assistant", content: m.content };
        nuevos.push(asistente);
        mensajes.push(asistente);

        // La búsqueda web larga pausa el turno: se reenvía tal cual y sigue.
        if (m.stop_reason === "pause_turn") continue;

        if (m.stop_reason !== "tool_use") {
          await emitir({ t: "fin", mensajes: nuevos, resultadosServidor: [], stopReason: m.stop_reason, uso, modelo: m.model });
          await guardarSiSeFue();
          return;
        }

        const usos = m.content.filter((b) => b.type === "tool_use");
        const resultados = [];
        for (const b of usos.filter((u) => ejecutor.esDelServidor(u.name))) {
          await emitir({ t: "herramienta", texto: describirUso(b.name, b.input) });
          resultados.push(await ejecutor.ejecutar(b));
        }
        if (resultados.length === usos.length) {
          const respuesta = { role: "user", content: resultados };
          nuevos.push(respuesta);
          mensajes.push(respuesta);
          continue;
        }
        // Hay herramientas del navegador: él las ejecuta y junta sus
        // resultados con éstos en UN mismo mensaje, como exige la API.
        await emitir({ t: "fin", mensajes: nuevos, resultadosServidor: resultados, stopReason: "tool_use", uso, modelo: m.model });
        return;
      }
      await emitir({ t: "fin", mensajes: nuevos, resultadosServidor: [], stopReason: "limite", uso });
    } catch (e) {
      console.error("chat:", e);
      await emitir({ t: "error", mensaje: e?.message || "No se pudo generar la respuesta" });
    } finally {
      try { await escritor.close(); } catch { /* ya cerrado */ }
    }
  })();
  ctx?.waitUntil?.(trabajo);

  return new Response(readable, {
    status: 200,
    headers: { ...CABECERAS_API, "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

// ============================================================
// El resumen de las conversaciones largas
//
// El historial ya no se corta en los últimos 50 mensajes, que era
// perder lo de hace dos semanas sin que nadie lo decidiera. Cuando pasa
// de UMBRAL mensajes sin resumir, lo más viejo se pliega en un resumen
// —que se guarda, y se actualiza encima del anterior— y al modelo le
// llegan el resumen más los mensajes recientes enteros.
// ============================================================

const UMBRAL = 60;
const RECIENTES = 20;

export async function rutaResumenChat(req, env, { acceso, metodo }) {
  const url = new URL(req.url);
  const clienteId = metodo === "GET" ? url.searchParams.get("cliente") : (await cuerpo(req))?.clienteId;
  if (!clienteId) return error("Falta el cliente");
  if (!(await acceso.leerUno("clients", { id: String(clienteId) }))) return error("Cliente no encontrado", 404);

  const actual = await acceso.leerUno("chat_resumenes", { id: String(clienteId) });
  if (metodo === "GET") return json({ resumen: actual?.content ?? "", hasta: actual?.hasta ?? null });
  if (metodo !== "POST") return error(`Método ${metodo} no permitido aquí`, 405);
  if (!env.ANTHROPIC_API_KEY) return error("El servidor no tiene configurada la clave de Anthropic", 503);

  const todos = await acceso.leer("chat_messages", { client_id: String(clienteId) }, "created_at asc");
  const sinResumir = actual?.hasta ? todos.filter((m) => m.created_at > actual.hasta) : todos;
  if (sinResumir.length <= UMBRAL) return json({ resumen: actual?.content ?? "", hasta: actual?.hasta ?? null });

  const aPlegar = sinResumir.slice(0, sinResumir.length - RECIENTES);
  const transcripcion = aPlegar
    .map((m) => `${m.role === "user" ? "USUARIO" : "ASISTENTE"}: ${m.content}`)
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modeloChat(env),
      max_tokens: 8000,
      output_config: { effort: "low" },
      system:
        "Resumes conversaciones entre una agencia de marketing y su asistente de contenido. " +
        "El resumen sustituye a los mensajes: conserva decisiones, preferencias del cliente, " +
        "textos aprobados o rechazados y por qué, datos concretos (fechas, precios, nombres) y " +
        "tareas pendientes. Omite saludos y lo que ya no importa. En español, en viñetas.",
      messages: [{
        role: "user",
        content:
          `${actual?.content ? `RESUMEN ANTERIOR:\n${actual.content}\n\n` : ""}` +
          `CONVERSACIÓN A AÑADIR:\n${transcripcion}\n\nDevuelve el resumen actualizado completo.`,
      }],
    }),
  });
  if (!res.ok) {
    console.error("resumen:", res.status, await res.text().catch(() => ""));
    return error("No se pudo resumir la conversación", 502);
  }
  const data = await res.json();
  const resumen = (data?.content ?? []).filter((b) => b?.type === "text").map((b) => b.text).join("").trim();
  if (!resumen) return error("El resumen salió vacío", 502);

  const hasta = aPlegar[aPlegar.length - 1].created_at;
  await acceso.guardar("chat_resumenes", {
    id: String(clienteId), client_id: String(clienteId), content: resumen, hasta,
    created_at: actual?.created_at ?? ahora(), updated_at: ahora(),
  });
  return json({ resumen, hasta });
}
