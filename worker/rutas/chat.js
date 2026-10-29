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
//   · El modelo y el esfuerzo de razonamiento que diga la configuración
//     del espacio (Ajustes → IA; Sonnet 5 · alto por defecto). El
//     razonamiento se paga del mismo max_tokens que la respuesta, así
//     que el tope sube a 32 000.
//   · Streaming de punta a punta: el Worker lee el SSE de Anthropic y le
//     reenvía al navegador el texto según se escribe.
//   · Un BUCLE en el servidor para las herramientas de servidor (web, el
//     cerebro del cliente, consultas a D1: ver herramientasServidor.js).
//     Cuando el modelo pide una herramienta del navegador —las que
//     escriben en el calendario abierto—, el Worker termina el turno y
//     el navegador la ejecuta y vuelve a llamar, como antes.
//   · Caché del prompt: el sistema lleva su marca y la petición la
//     automática, que cubre el historial. En una conversación larga el
//     prefijo se lee de caché a una décima parte del precio. PERO la
//     caché dura cinco minutos y escribirla cuesta 1,25×: el consumo real
//     mostró tres mensajes separados por horas que escribieron 49 000
//     tokens de caché y no leyeron ninguno. Por eso sólo se marca cuando
//     la conversación va seguida (`seguido`, que manda el navegador) o
//     a partir de la segunda vuelta del bucle, que sí la va a leer.
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
// El despliegue con Opus 5.5 fijo devolvió «El proveedor de IA
// devolvió un error» en el primer «Hola»: la misma clave que funcionaba
// con Sonnet 5 no tenía ese modelo, y el mensaje genérico escondía el
// motivo —el mismo fallo de diseño que tuvo antes la generación de
// imágenes con Gemini—. Ahora:
//
//   · el modelo y el razonamiento salen de la configuración del espacio
//     (configIA.js: Sonnet 5 · alto por defecto); si la cuenta rechaza el
//     Opus elegido, se vuelve a Sonnet 5 y se avisa;
//   · la búsqueda web desactivada en la organización se quita de la
//     petición y se avisa, en vez de tumbar la respuesta entera;
//   · cualquier otro rechazo enseña el mensaje real de Anthropic.
// ============================================================

import { error, cuerpo, CABECERAS_API, json } from "../lib/respuesta.js";
import { abrirFlujo, leerFlujo, esRechazoDeModelo, esRechazoDeWeb, mensajeDeRechazo, RechazoAnthropic, textoDe } from "../lib/anthropic.js";
import { prepararIA, registrarConsumo, MODELO_SONNET, etiquetaModelo } from "../lib/configIA.js";
import { crearEjecutor, DEFINICIONES, HERRAMIENTAS_WEB, NOMBRES, describirUso } from "../lib/herramientasServidor.js";
import { ahora, uuid } from "../lib/ids.js";
import { firma } from "../lib/vivo.js";
import { kitDe } from "../lib/estudio/kit.js";
import { manualDelEspacio, correccionesDelCliente } from "../lib/estudio/fichas.js";
import { leerMercado } from "../lib/mercado.js";
import { bloqueDeMarca, kitVacio } from "../../src/lib/kitMarca.js";
import { productosActivos, lineaDeProducto } from "../../src/lib/estudioMercado.js";
import { instruccionDeDiseno, resumenDelKit, lineaDeCorrecciones } from "../../src/lib/director.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_TOKENS = 32_000;
const MAX_VUELTAS = 8;

const INSTRUCCION_SERVIDOR = `TU FUENTE ES EL CEREBRO DE CADA CLIENTE
Cada cliente tiene en la aplicación su CEREBRO: sus notas (ficha técnica, cifras, marca, tono, personas, límites,
estructuras de guion, decisiones, documentos que se le subieron). Es la fuente de verdad, por encima de lo que
recuerdes de la conversación. Lo que tienes escrito abajo es sólo lo básico; el resto se BUSCA:
· buscar_cerebro: antes de decir que no sabes algo de un cliente, antes de contestar sobre su marca, sus productos o
  sus reglas, y antes de escribir para él. Las notas cortas llegan enteras; de las largas, pasajes con su ruta.
  Si lo que buscas es para escribir un texto que se publica, pon para_publicar=true: así no te llega lo interno.
· leer_nota_cerebro: la nota completa, cuando los pasajes no bastan.
Si no está en el cerebro, dilo así («no lo tengo en el cerebro de X») y no lo inventes. NUNCA digas que no tienes
acceso a la información de un cliente sin haber buscado antes.

OTRAS HERRAMIENTAS QUE TIENES ADEMÁS DE LAS DEL CALENDARIO:
· web_search y web_fetch: busca en internet y lee páginas cuando necesites datos actuales —tendencias,
  fechas, competencia, noticias del sector—. Cita de dónde sale lo que traigas de fuera.
· ver_calendario, ver_tareas y ver_banco_ideas: consulta lo que hay guardado, de este u otro cliente
  y de otros meses. Pide lo que necesites en vez de suponerlo.
· ver_resultados: cómo le fue en redes —seguidores, alcance, interacciones, las publicaciones que mejor
  funcionaron, el formato y la hora que rinden más, la competencia—. Míralo antes de proponer contenido
  y apóyate en lo que de verdad funciona.
· ver_estudio, crear_en_estudio y estado_trabajo: el Estudio de imágenes y videos con IA del cliente.
  Primero ver_estudio (modelos disponibles, guía visual de la marca, galería). Un video, varias variantes,
  un modelo concreto o partir de imágenes de la galería se piden con crear_en_estudio: NO espera, queda
  en la galería del cliente y tú dices el ID del pedido. Cuesta dinero: si la respuesta trae un costo y
  dice que no se creó nada, díselo al usuario con la cifra y sólo con su «sí» repites con confirmado=true.
  Para una imagen o un video que deba verse aquí mismo (con el kit de la marca), usa generar_imagen.
Antes de decir que no tienes un dato, mira si alguna de estas herramientas lo trae.`;

const NOMBRES_WEB = new Set(HERRAMIENTAS_WEB.map((h) => h.name));

/**
 * El CATÁLOGO del cliente para quien diseña en el chat: cada producto con su id (lo que se pasa en `productos` de
 * disenar_piezas, y así van sus fotos reales de referencia), su precio y si tiene fotos. Sin esto el asistente no
 * sabía qué productos había y, en los carruseles, se los inventaba con marca y todo. Vacío sin catálogo.
 */
export function catalogoParaDisenar(mercado, cliente = "este cliente") {
  const activos = mercado ? productosActivos(mercado.catalogo) : [];
  const vigentes = mercado?.inventario ? activos.filter((p) => p.stock !== "agotado") : activos;
  if (!vigentes.length) {
    return `CATÁLOGO DE ${cliente.toUpperCase()}: vacío. Si una pieza tiene que enseñar un producto, PREGÚNTALE a la persona cuál y cómo es antes de diseñarla (o que lo cargue en Cerebro → Estudio de mercado): no inventes productos, empaques ni marcas.`;
  }
  return [
    `CATÁLOGO DE ${cliente.toUpperCase()} (lo único que existe; precios exactos):`,
    ...vigentes.map((p) => `${lineaDeProducto(p, { inventario: mercado.inventario })} · id: ${p.id} · ${p.fotos?.length ? `${p.fotos.length} foto${p.fotos.length === 1 ? "" : "s"} real${p.fotos.length === 1 ? "" : "es"}` : "sin fotos"}`),
    "CÓMO LO USAS AL DISEÑAR: si una pieza o un carrusel enseña productos, sólo de esta lista y por su nombre exacto, y pasa sus ids en «productos» de disenar_piezas (a nivel de la tanda y de cada pieza): así van sus fotos REALES de referencia y el motor no se inventa otro. Una pieza puede llevar varios. Si la persona no dijo cuál y no es evidente por el calendario o el cerebro, PREGÚNTALE cuál (dale las opciones de esta lista) antes de llamar a disenar_piezas. Nunca inventes un producto, un modelo, un empaque ni una marca.",
  ].join("\n");
}

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

export async function rutaChat(req, env, { acceso, ctx, usuario = null } = {}) {
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
  // La conversación en la que va esta vuelta: si quien preguntó se va a mitad, la respuesta se guarda en ella.
  const conversacion = body.conversacionId
    ? await acceso.leerUno("chat_conversaciones", { id: String(body.conversacionId) })
    : null;
  const ia = await prepararIA(env, acceso, { para: "chat" });
  if (ia.bloqueo) return error(ia.bloqueo, 402);
  // Con la persona que firma, el asistente también sabe pedir al Estudio (y queda dicho quién lo pidió).
  const ejecutor = crearEjecutor({
    env, acceso, clienteActual,
    estudio: usuario ? { usuario, por: firma(usuario, req), origen: "asistente" } : null,
  });

  const cachear = body.seguido === true;
  const system = [{ type: "text", text: INSTRUCCION_SERVIDOR }];
  // Con un cliente abierto, el asistente es además su DIRECTOR CREATIVO: el manual de la agencia (Ajustes), la ficha de
  // diseño, sus herramientas y lo que exige su kit (o que no lo tiene). Va antes del sistema del navegador: no cambia
  // de un mensaje a otro, así que entra en la caché.
  if (clienteActual) {
    const kit = kitDe(clienteActual);
    const [manual, correcciones, mercado] = await Promise.all([
      manualDelEspacio(acceso), correccionesDelCliente(acceso, clienteActual.id), leerMercado(acceso, clienteActual.id).catch(() => null),
    ]);
    system.push({ type: "text", text: [
      instruccionDeDiseno(manual), resumenDelKit({ kit, marca: bloqueDeMarca(kit), vacio: kitVacio(kit) && !kit.logo, cliente: clienteActual.name }),
      catalogoParaDisenar(mercado, clienteActual.name), lineaDeCorrecciones(correcciones),
    ].filter(Boolean).join("\n\n") });
  }
  if (typeof body.system === "string" && body.system.trim()) {
    system.push({ type: "text", text: body.system });
  }
  const conCache = (peticion) => ({
    ...peticion,
    cache_control: { type: "ephemeral" },
    system: peticion.system.map((b, i, todos) => (i === todos.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b)),
  });
  const tools = [
    ...herramientasDelNavegador(body.tools),
    ...DEFINICIONES,
    ...(env.AI_CHAT_WEB === "no" ? [] : HERRAMIENTAS_WEB),
  ];
  const base = {
    model: ia.modelo,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: ia.esfuerzo },
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
        if (esRechazoDeModelo(e) && base.model !== MODELO_SONNET) {
          console.warn(`chat: la cuenta no acepta ${base.model}; se usa ${MODELO_SONNET}`);
          await emitir({ t: "aviso", texto: `${etiquetaModelo(base.model)} no aceptó la petición: responde Sonnet 5` });
          base.model = MODELO_SONNET;
          peticion = { ...peticion, model: MODELO_SONNET };
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
    // Quién va a responder, antes de nada: la etiqueta del panel sale de
    // aquí, así que refleja el modelo real y no sólo el elegido.
    await emitir({ t: "modelo", id: base.model, etiqueta: etiquetaModelo(base.model), esfuerzo: ia.esfuerzo });
    if (ia.aviso) await emitir({ t: "aviso", texto: ia.aviso });
    const mensajes = [...body.messages];
    const nuevos = [];
    // Si quien preguntó cerró la pestaña a mitad, la respuesta la guarda
    // el servidor: el mensaje del usuario ya estaba en el historial y la
    // respuesta, pagada. Sólo cuando no queda nada por hacer en el
    // navegador —si faltaba una herramienta suya, no hay respuesta que
    // guardar—.
    const guardarSiSeFue = async () => {
      if (conectado || !conversacion) return;
      const texto = nuevos
        .filter((x) => x.role === "assistant")
        .flatMap((x) => x.content.filter((b) => b.type === "text").map((b) => b.text))
        .join("").trim();
      if (!texto) return;
      await acceso.insertar("chat_messages", {
        id: uuid(), client_id: conversacion.client_id ?? null, conversacion_id: conversacion.id, role: "assistant", content: texto, created_at: ahora(),
      }).catch((e) => console.error("chat: no se pudo guardar la respuesta huérfana", e));
    };
    const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    let busquedas = 0;
    const anotar = () => registrarConsumo(acceso, {
      funcion: "asistente",
      modelo: base.model,
      uso: { ...uso, server_tool_use: { web_search_requests: busquedas } },
      clienteId: clienteActual?.id,
    });
    try {
      for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
        const peticion = { ...base, messages: mensajes };
        const res = await abrirConAjustes(cachear || vuelta > 0 ? conCache(peticion) : peticion);
        const m = await leerFlujo(res, async (trozo) => {
          if (trozo.tipo === "servidor") await emitir({ t: "herramienta", texto: describirUso(trozo.nombre, trozo.entrada) });
          else await emitir({ t: trozo.tipo, d: trozo.texto });
        });
        if (m.error) throw new Error(m.error.type === "overloaded_error"
          ? "El asistente está saturado. Inténtalo en unos segundos."
          : "El proveedor de IA cortó la respuesta.");
        for (const k of Object.keys(uso)) uso[k] += Number(m.usage?.[k] ?? 0);
        busquedas += Number(m.usage?.server_tool_use?.web_search_requests ?? 0);

        const asistente = { role: "assistant", content: m.content };
        nuevos.push(asistente);
        mensajes.push(asistente);

        // La búsqueda web larga pausa el turno: se reenvía tal cual y sigue.
        if (m.stop_reason === "pause_turn") continue;

        if (m.stop_reason !== "tool_use") {
          await emitir({ t: "fin", mensajes: nuevos, resultadosServidor: [], stopReason: m.stop_reason, uso, modelo: m.model });
          await anotar();
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
        await anotar();
        return;
      }
      await emitir({ t: "fin", mensajes: nuevos, resultadosServidor: [], stopReason: "limite", uso });
      await anotar();
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
  // Un resumen por CONVERSACIÓN: cada tema se pliega por su lado.
  const conversacionId = metodo === "GET" ? url.searchParams.get("conversacion") : (await cuerpo(req))?.conversacionId;
  if (!conversacionId) return error("Falta la conversación");
  const conversacion = await acceso.leerUno("chat_conversaciones", { id: String(conversacionId) });
  if (!conversacion) return error("Conversación no encontrada", 404);
  const clienteId = conversacion.client_id ?? null;

  const actual = await acceso.leerUno("chat_resumenes", { id: conversacion.id });
  if (metodo === "GET") return json({ resumen: actual?.content ?? "", hasta: actual?.hasta ?? null });
  if (metodo !== "POST") return error(`Método ${metodo} no permitido aquí`, 405);
  if (!env.ANTHROPIC_API_KEY) return error("El servidor no tiene configurada la clave de Anthropic", 503);

  const todos = await acceso.leer("chat_messages", { conversacion_id: conversacion.id }, "created_at asc");
  const sinResumir = actual?.hasta ? todos.filter((m) => m.created_at > actual.hasta) : todos;
  if (sinResumir.length <= UMBRAL) return json({ resumen: actual?.content ?? "", hasta: actual?.hasta ?? null });

  const aPlegar = sinResumir.slice(0, sinResumir.length - RECIENTES);
  const transcripcion = aPlegar
    .map((m) => `${m.role === "user" ? "USUARIO" : "ASISTENTE"}: ${m.content}`)
    .join("\n\n");

  const ia = await prepararIA(env, acceso, { funcion: "resumen del chat" });
  if (ia.bloqueo) return error(ia.bloqueo, 402);
  const peticion = {
      model: ia.modelo,
      max_tokens: 24000,
      thinking: { type: "adaptive" },
      output_config: { effort: ia.esfuerzo },
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
  };
  let m;
  try {
    m = await leerFlujo(await abrirFlujo(env, peticion).catch((e) => {
      if (esRechazoDeModelo(e) && peticion.model !== MODELO_SONNET) {
        peticion.model = MODELO_SONNET;
        return abrirFlujo(env, peticion);
      }
      throw e;
    }));
  } catch (e) {
    return error(`No se pudo resumir la conversación: ${mensajeDeRechazo(e)}`, 502, e);
  }
  await registrarConsumo(acceso, { funcion: "resumen del chat", modelo: peticion.model, uso: m.usage, clienteId });
  const resumen = textoDe(m).trim();
  if (!resumen) return error("El resumen salió vacío", 502);

  const hasta = aPlegar[aPlegar.length - 1].created_at;
  await acceso.guardar("chat_resumenes", {
    id: conversacion.id, client_id: clienteId, conversacion_id: conversacion.id, content: resumen, hasta,
    created_at: actual?.created_at ?? ahora(), updated_at: ahora(),
  });
  return json({ resumen, hasta });
}
