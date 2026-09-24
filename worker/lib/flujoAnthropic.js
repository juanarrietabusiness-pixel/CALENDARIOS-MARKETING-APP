// ============================================================
// El streaming de la API de Anthropic, reconstruido en mensaje
//
// Con `stream: true` la respuesta llega como eventos SSE: el mensaje
// empieza, cada bloque se abre, recibe trozos y se cierra, y al final
// llega el motivo de parada. Esto los junta otra vez en el mismo
// `content` que habría devuelto la llamada sin streaming, porque ese
// contenido hay que DEVOLVERLO tal cual en la vuelta siguiente del
// bucle de herramientas —los bloques de razonamiento con su firma
// incluidos: si llegan alterados, la API rechaza la petición—.
//
// Dos cosas que no son obvias:
//
//   · La entrada de una herramienta llega como trozos de JSON
//     (`input_json_delta`) que sólo son JSON válido al final. Se
//     acumulan como texto y se parsean al cerrar el bloque; si no
//     parsea —el modelo se quedó sin tokens a mitad—, se marca, porque
//     ejecutar una herramienta con la entrada cortada hace lo que no era.
//   · Los bloques de razonamiento traen su `signature` en un delta
//     aparte (`signature_delta`). Sin ella el bloque no vale para
//     devolverlo.
//
// Puro: no sabe de fetch ni de Workers, para poder probarlo con eventos
// grabados.
// ============================================================

/** Parte un texto SSE en eventos. Devuelve los completos y el resto. */
export function partirSSE(buffer) {
  const eventos = [];
  const trozos = buffer.split(/\r?\n\r?\n/);
  const resto = trozos.pop() ?? "";
  for (const trozo of trozos) {
    let tipo = "message";
    const datos = [];
    for (const linea of trozo.split(/\r?\n/)) {
      if (linea.startsWith("event:")) tipo = linea.slice(6).trim();
      else if (linea.startsWith("data:")) datos.push(linea.slice(5).replace(/^ /, ""));
    }
    if (!datos.length) continue;
    try {
      eventos.push({ tipo, datos: JSON.parse(datos.join("\n")) });
    } catch {
      // Un evento que no es JSON (un comentario de keep-alive) se salta.
    }
  }
  return { eventos, resto };
}

/**
 * Acumula los eventos de UNA respuesta. `consumir(evento)` devuelve lo
 * que conviene enseñar ya —un trozo de texto o de razonamiento— o null.
 */
export function crearAcumulador() {
  const bloques = [];
  const json = new Map();
  let parada = null;
  let detalleParada = null;
  let uso = {};
  let modelo = "";
  let fallo = null;

  function consumir({ tipo, datos }) {
    switch (tipo) {
      case "message_start":
        modelo = datos?.message?.model ?? "";
        uso = { ...(datos?.message?.usage ?? {}) };
        return null;

      case "content_block_start": {
        const b = structuredClone(datos.content_block ?? {});
        if (b.type === "tool_use" || b.type === "server_tool_use") {
          json.set(datos.index, "");
          b.input = {};
        }
        bloques[datos.index] = b;
        return null;
      }

      case "content_block_delta": {
        const b = bloques[datos.index];
        const d = datos.delta ?? {};
        if (!b) return null;
        if (d.type === "text_delta") {
          b.text = (b.text ?? "") + d.text;
          return { tipo: "texto", texto: d.text };
        }
        if (d.type === "thinking_delta") {
          b.thinking = (b.thinking ?? "") + d.thinking;
          return { tipo: "pensando", texto: d.thinking };
        }
        if (d.type === "signature_delta") {
          b.signature = (b.signature ?? "") + d.signature;
          return null;
        }
        if (d.type === "input_json_delta") {
          json.set(datos.index, (json.get(datos.index) ?? "") + (d.partial_json ?? ""));
          return null;
        }
        if (d.type === "citations_delta" && d.citation) {
          b.citations = [...(b.citations ?? []), d.citation];
          return null;
        }
        return null;
      }

      case "content_block_stop": {
        const b = bloques[datos.index];
        if (b && json.has(datos.index)) {
          const crudo = json.get(datos.index);
          try {
            b.input = crudo ? JSON.parse(crudo) : {};
          } catch {
            b.input = {};
            b._entradaRota = true;
          }
          json.delete(datos.index);
          if (b.type === "server_tool_use") return { tipo: "servidor", nombre: b.name, entrada: b.input };
        }
        return null;
      }

      case "message_delta":
        parada = datos?.delta?.stop_reason ?? parada;
        detalleParada = datos?.delta?.stop_details ?? detalleParada;
        uso = { ...uso, ...(datos?.usage ?? {}) };
        return null;

      case "error":
        fallo = datos?.error ?? { type: "error", message: "Error del proveedor" };
        return null;

      default:
        return null;
    }
  }

  /** El mensaje terminado, con la forma de una respuesta sin streaming. */
  function mensaje() {
    return {
      model: modelo,
      content: bloques.filter(Boolean).map((b) => {
        const { _entradaRota, ...limpio } = b;
        void _entradaRota;
        return limpio;
      }),
      stop_reason: parada,
      stop_details: detalleParada,
      usage: uso,
      entradasRotas: bloques.filter((b) => b?._entradaRota).map((b) => b.id),
      error: fallo,
    };
  }

  return { consumir, mensaje };
}
