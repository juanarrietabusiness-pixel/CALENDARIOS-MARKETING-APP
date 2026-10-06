// ============================================================
// Una llamada a la IA para el cerebro de un cliente
//
// Lo que tienen en común la ficha técnica (`preparar.js`) y las reglas que
// se proponen a partir de lo que pasó después de escribir (`proponer.js`):
// una sola petición larga, con razonamiento, que puede tardar minutos.
//
//   · Respeta el modelo y el razonamiento que elige el espacio, y el
//     presupuesto (`prepararIA`): con el tope agotado y «detener», no sale.
//   · En streaming (`abrirFlujo`): sin él, la API rechaza lo que podría
//     pasar de diez minutos.
//   · Si la cuenta no tiene el Opus elegido, vuelve a Sonnet 5 y lo dice.
//   · Apunta lo que costó AUNQUE la respuesta no sirva: costó igual.
//   · Un fallo sale con el motivo, en español y con el estado que le toca.
//   · Con `herramientas` (la búsqueda y la lectura web de Anthropic, que se
//     ejecutan en SU servidor): una búsqueda larga pausa el turno
//     (`pause_turn`) y se reenvía tal cual hasta que termina; si la cuenta
//     no tiene la búsqueda activada, se quita y se sigue sin ella, con aviso.
//     Las búsquedas se suman al consumo (10 $ por 1.000).
// ============================================================

import { abrirFlujo, leerFlujo, textoDe, esRechazoDeModelo, esRechazoDeWeb, mensajeDeRechazo, RechazoAnthropic } from "../anthropic.js";
import { prepararIA, registrarConsumo, MARGEN_RAZONAMIENTO, MODELO_SONNET, etiquetaModelo } from "../configIA.js";

const MAX_TOKENS_CAP = 64_000;
const PRESUPUESTO_MS = 290_000;
/** Cuántas veces se reanuda un turno que la búsqueda web pausó. */
const MAX_REANUDACIONES = 4;

/** Las direcciones que la búsqueda web devolvió y citó, sin repetir. */
function fuentesDe(contenidos) {
  const urls = [];
  for (const b of contenidos) {
    if (b?.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r?.url) urls.push(r.url);
    if (b?.type === "text" && Array.isArray(b.citations)) for (const c of b.citations) if (c?.url) urls.push(c.url);
  }
  return [...new Set(urls)].slice(0, 20);
}

/** Un fallo de una llamada que se le puede decir a la persona, con el estado que le toca. */
export class ErrorIA extends Error {
  constructor(mensaje, estado = 502, causa) {
    super(mensaje, causa ? { cause: causa } : undefined);
    this.estado = estado;
  }
}

/**
 * Le pide `prompt` (texto, o bloques con imágenes) a la IA y devuelve su texto. `funcion` es la del contador
 * (y decide el modelo: ver FUNCIONES_IA). `salida` es lo que se pide para escribir; el razonamiento va aparte.
 * @returns {{ texto: string, modelo: string, aviso: string|null, segundos: number, busquedas: number, conWeb: boolean, fuentes: string[] }}
 */
export async function llamarIA(env, acceso, cliente, { prompt, salida = 6000, funcion = "cerebro", herramientas = null }) {
  if (!env.ANTHROPIC_API_KEY) throw new ErrorIA("El servidor no tiene configurada la clave de Anthropic", 503);
  const ia = await prepararIA(env, acceso, { funcion });
  if (ia.bloqueo) throw new ErrorIA(ia.bloqueo, 402);
  const maxTokens = Math.min(salida + (MARGEN_RAZONAMIENTO[ia.esfuerzo] ?? 16_000), MAX_TOKENS_CAP);
  let modelo = ia.modelo;
  let aviso = ia.aviso ?? null;

  const arranque = Date.now();
  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), PRESUPUESTO_MS);
  let tools = Array.isArray(herramientas) && herramientas.length ? [...herramientas] : null;
  const mensajes = [{ role: "user", content: prompt }];
  const contenidos = [];
  const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let busquedas = 0;
  let m;
  try {
    for (let reanudaciones = 0; ;) {
      try {
        const res = await abrirFlujo(env, {
          model: modelo,
          max_tokens: maxTokens,
          thinking: { type: "adaptive" },
          output_config: { effort: ia.esfuerzo },
          messages: mensajes,
          ...(tools ? { tools } : {}),
        }, { signal: abortar.signal });
        m = await leerFlujo(res);
      } catch (e) {
        // La cuenta no tiene el Opus elegido: se escribe con Sonnet 5 y se dice.
        if (esRechazoDeModelo(e) && modelo !== MODELO_SONNET) {
          aviso = `${etiquetaModelo(modelo)} no aceptó la petición: se usó Sonnet 5.`;
          modelo = MODELO_SONNET;
          continue;
        }
        // La organización no tiene la búsqueda web activada: se sigue sin ella y se dice.
        if (esRechazoDeWeb(e) && tools) {
          tools = null;
          aviso = [aviso, "Sin búsqueda en internet: no está activada en la cuenta de Anthropic."].filter(Boolean).join(" ");
          continue;
        }
        throw e;
      }
      for (const k of Object.keys(uso)) uso[k] += Number(m.usage?.[k] ?? 0);
      busquedas += Number(m.usage?.server_tool_use?.web_search_requests ?? 0);
      contenidos.push(...(m.content ?? []));
      // Una búsqueda larga pausa el turno: se reenvía lo que llevaba y sigue donde iba.
      if (m.stop_reason === "pause_turn" && reanudaciones < MAX_REANUDACIONES && !m.error) {
        reanudaciones++;
        mensajes.push({ role: "assistant", content: m.content });
        continue;
      }
      break;
    }
  } catch (e) {
    if (abortar.signal.aborted) throw new ErrorIA("La IA no respondió a tiempo. Inténtalo otra vez.", 504);
    throw new ErrorIA(mensajeDeRechazo(e), e instanceof RechazoAnthropic && e.estado === 429 ? 429 : 502, e);
  } finally {
    clearTimeout(reloj);
  }

  // Lo que se gastó se apunta aunque la respuesta no sirva: costó igual.
  await registrarConsumo(acceso, { funcion, modelo, uso: { ...uso, server_tool_use: { web_search_requests: busquedas } }, clienteId: cliente.id });

  if (m.error) {
    throw new ErrorIA(m.error.type === "overloaded_error" ? "La IA está saturada. Inténtalo en unos segundos." : `La IA cortó la respuesta: ${m.error.message ?? "sin motivo"}`, 502);
  }
  if (m.stop_reason === "max_tokens") throw new ErrorIA("La respuesta se cortó por longitud. Inténtalo otra vez.", 502);
  if (tools) {
    // Con búsqueda, el texto puede venir repartido entre los turnos reanudados.
    const texto = contenidos.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("");
    return { texto, modelo, aviso, segundos: Math.round((Date.now() - arranque) / 1000), busquedas, conWeb: busquedas > 0, fuentes: fuentesDe(contenidos) };
  }
  return { texto: textoDe(m), modelo, aviso, segundos: Math.round((Date.now() - arranque) / 1000), busquedas: 0, conWeb: false, fuentes: [] };
}
