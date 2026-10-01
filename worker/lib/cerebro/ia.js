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
// ============================================================

import { abrirFlujo, leerFlujo, textoDe, esRechazoDeModelo, mensajeDeRechazo, RechazoAnthropic } from "../anthropic.js";
import { prepararIA, registrarConsumo, MARGEN_RAZONAMIENTO, MODELO_SONNET, etiquetaModelo } from "../configIA.js";

const MAX_TOKENS_CAP = 64_000;
const PRESUPUESTO_MS = 290_000;

/** Un fallo de una llamada que se le puede decir a la persona, con el estado que le toca. */
export class ErrorIA extends Error {
  constructor(mensaje, estado = 502, causa) {
    super(mensaje, causa ? { cause: causa } : undefined);
    this.estado = estado;
  }
}

/**
 * Le pide `prompt` a la IA y devuelve su texto. `salida` es lo que se pide para escribir; el razonamiento va aparte.
 * @returns {{ texto: string, modelo: string, aviso: string|null, segundos: number }}
 */
export async function llamarIA(env, acceso, cliente, { prompt, salida = 6000 }) {
  if (!env.ANTHROPIC_API_KEY) throw new ErrorIA("El servidor no tiene configurada la clave de Anthropic", 503);
  const ia = await prepararIA(env, acceso, { funcion: "cerebro" });
  if (ia.bloqueo) throw new ErrorIA(ia.bloqueo, 402);
  const maxTokens = Math.min(salida + (MARGEN_RAZONAMIENTO[ia.esfuerzo] ?? 16_000), MAX_TOKENS_CAP);
  let modelo = ia.modelo;
  let aviso = ia.aviso ?? null;

  const arranque = Date.now();
  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), PRESUPUESTO_MS);
  let m;
  try {
    for (;;) {
      try {
        const res = await abrirFlujo(env, {
          model: modelo,
          max_tokens: maxTokens,
          thinking: { type: "adaptive" },
          output_config: { effort: ia.esfuerzo },
          messages: [{ role: "user", content: prompt }],
        }, { signal: abortar.signal });
        m = await leerFlujo(res);
        break;
      } catch (e) {
        // La cuenta no tiene el Opus elegido: se escribe con Sonnet 5 y se dice.
        if (esRechazoDeModelo(e) && modelo !== MODELO_SONNET) {
          aviso = `${etiquetaModelo(modelo)} no aceptó la petición: se usó Sonnet 5.`;
          modelo = MODELO_SONNET;
          continue;
        }
        throw e;
      }
    }
  } catch (e) {
    if (abortar.signal.aborted) throw new ErrorIA("La IA no respondió a tiempo. Inténtalo otra vez.", 504);
    throw new ErrorIA(mensajeDeRechazo(e), e instanceof RechazoAnthropic && e.estado === 429 ? 429 : 502, e);
  } finally {
    clearTimeout(reloj);
  }

  // Lo que se gastó se apunta aunque la respuesta no sirva: costó igual.
  await registrarConsumo(acceso, { funcion: "cerebro", modelo, uso: m.usage, clienteId: cliente.id });

  if (m.error) {
    throw new ErrorIA(m.error.type === "overloaded_error" ? "La IA está saturada. Inténtalo en unos segundos." : `La IA cortó la respuesta: ${m.error.message ?? "sin motivo"}`, 502);
  }
  if (m.stop_reason === "max_tokens") throw new ErrorIA("La respuesta se cortó por longitud. Inténtalo otra vez.", 502);
  return { texto: textoDe(m), modelo, aviso, segundos: Math.round((Date.now() - arranque) / 1000) };
}
