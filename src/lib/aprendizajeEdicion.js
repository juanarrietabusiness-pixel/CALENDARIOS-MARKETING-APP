// ============================================================
// Lo que el EDITOR DE VIDEO GRABADO aprende de una edición (puro): las guardas de las PROPUESTAS
//
// Al terminar una edición, quien edita escribe el ACTA (qué se hizo y con qué) y las CORRECCIONES de la persona, cada una
// GENERAL (para todo cliente: va al manual del editor, src/lib/manualEditor.js) o DE LA MARCA (va a su estilo de edición,
// src/lib/estilosEdicion.js). Ninguna se aplica sola: quedan como PROPUESTAS y se aplican con el «sí» de una persona
// (acta_de_edicion con confirmado; la pantalla, en la Fase 5). Las guardas (docs/propuesta-edicion-video-grabado.md §4.3):
//
//   1. Sin cita no hay propuesta: el respaldo son las palabras de la persona en ESTA edición.
//   2. Una GENERAL necesita una orden («nunca…», «siempre…», «en todos los videos») o haberse repetido en actas de dos
//      clientes distintos; si no, se ofrece como DE LA MARCA.
//   3. No se propone dos veces lo que ya dice el manual o el estilo, ni lo pendiente ni lo descartado.
//   4. Tope de 10 pendientes por destino (el manual; el estilo de cada cliente).
//   5. Aplicar es una operación de texto EXACTA (`antes` → `texto`): si `antes` ya no está, la propuesta caduca y se dice;
//      nunca se reescribe a ciegas.
// ============================================================

export const OPERACIONES_PROPUESTA = Object.freeze(["anadir", "cambiar", "quitar"]);
export const MAX_PENDIENTES_POR_DESTINO = 10;
export const MAX_CORRECCIONES = 12;
export const MAX_TEXTO_PROPUESTA = 600;
export const MAX_CITA = 300;

/** Los campos de TEXTO de un estilo de edición a los que una propuesta de la marca puede añadir, cambiar o quitar. */
export const CAMPOS_ESTILO = Object.freeze(["gancho", "ritmo", "notas", "piezas.textoDetras", "piezas.titular", "piezas.tachado", "piezas.cinta",
  "piezas.sello", "piezas.fichas", "piezas.lista", "piezas.preguntas", "piezas.trio", "piezas.logo", "piezas.whatsapp", "piezas.celular", "cierre.boton"]);

/** Las palabras de una ORDEN para todos los clientes. */
const ORDEN = /\b(nunca|siempre|en todos|todos los videos|en todas|cada vez|para todos|a todos|en cualquier|de ahora en adelante|en adelante)\b/i;

const corto = (t, n) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, n) : "");
const largo = (t, n) => (typeof t === "string" ? t.replace(/\r/g, "").trim().slice(0, n) : "");
/** Para comparar sin mayúsculas, tildes, signos ni espacios de más. */
export const plano = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").trim();

/** ¿La cita es una orden para todos? */
export const esOrden = (cita) => ORDEN.test(String(cita ?? ""));

/**
 * Una corrección tal como la manda quien edita, limpia: { alcance: general|marca, parte, operacion, antes, texto, cita }, o
 * { error }. `partesManual`: los ids de las partes del manual (comun.…, tipos.…). Pura.
 */
export function limpiarCorreccion(c, { partesManual = [] } = {}) {
  if (!c || typeof c !== "object") return { error: "Cada corrección es un objeto { alcance, parte, operacion, texto, antes?, cita }." };
  const alcance = c.alcance === "general" ? "general" : c.alcance === "marca" ? "marca" : null;
  if (!alcance) return { error: "«alcance»: general (para todo cliente: va al manual) o marca (va a su estilo)." };
  const cita = corto(c.cita, MAX_CITA);
  if (!cita) return { error: "Sin «cita» (las palabras de la persona en esta edición) no hay propuesta." };
  const operacion = OPERACIONES_PROPUESTA.includes(c.operacion) ? c.operacion : null;
  if (!operacion) return { error: `«operacion»: ${OPERACIONES_PROPUESTA.join(", ")}.` };
  const texto = largo(c.texto, MAX_TEXTO_PROPUESTA);
  const antes = largo(c.antes, MAX_TEXTO_PROPUESTA);
  if (operacion !== "quitar" && !texto) return { error: "Falta «texto»: lo que se añade o el texto nuevo." };
  if (operacion !== "anadir" && !antes) return { error: "Para cambiar o quitar hace falta «antes»: el texto EXACTO que hay ahora." };
  const parte = String(c.parte ?? "").trim();
  if (alcance === "general" && !partesManual.includes(parte)) return { error: `«parte» de una general: una del manual (${partesManual.join(", ")}).` };
  if (alcance === "marca" && parte && !CAMPOS_ESTILO.includes(parte)) return { error: `«parte» de una de la marca: un campo de texto del estilo (${CAMPOS_ESTILO.join(", ")}).` };
  return { alcance, parte: alcance === "marca" ? parte || "notas" : parte, operacion, antes, texto, cita };
}

/**
 * Aplica una operación EXACTA a un texto. → { texto } o { caduca: motivo }. Añadir pone una línea nueva al final; cambiar y
 * quitar necesitan que `antes` esté UNA sola vez. Pura.
 */
export function aplicarATexto(actual, { operacion, antes = "", texto = "" }) {
  const base = String(actual ?? "");
  if (operacion === "anadir") return { texto: base.trim() ? `${base.replace(/\s+$/, "")}\n${texto}` : texto };
  const veces = antes ? base.split(antes).length - 1 : 0;
  if (veces === 0) return { caduca: "el texto que cambiaba ya no está (alguien cambió esa parte después): vuelve a proponerla sobre lo de ahora." };
  if (veces > 1) return { caduca: "el texto que cambiaba aparece más de una vez: hace falta uno más largo que sea único." };
  if (operacion === "cambiar") return { texto: base.replace(antes, texto) };
  return { texto: base.replace(antes, "").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "").replace(/ {2,}/g, " ") };
}

/** El valor de un campo de texto del estilo («piezas.lista»), o "". Pura. */
export const campoDelEstilo = (estilo, campo) => String(campo.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), estilo) ?? "");

/** El estilo con un campo de texto cambiado (una copia). Pura. */
export function conCampo(estilo, campo, valor) {
  const copia = JSON.parse(JSON.stringify(estilo ?? {}));
  const [a, b] = campo.split(".");
  if (b) copia[a] = { ...(copia[a] ?? {}), [b]: valor };
  else copia[a] = valor;
  if (b && !valor) delete copia[a][b];
  if (!b && !valor) delete copia[a];
  return copia;
}

/**
 * Decide qué pasa con una corrección limpia antes de guardarla como propuesta. → { propuesta } (con su destino) o
 * { descartada: motivo }. Pura.
 *   · `textoActual`: lo que dice HOY la parte del manual (general) o el campo del estilo (marca).
 *   · `otras`: las propuestas que ya hay (pendientes y descartadas) con { destino, parte, texto, estado, clientId }.
 *   · `repetidaEn`: cuántos clientes DISTINTOS (este aparte) tienen una propuesta con el mismo texto.
 *   · `pendientes`: { manual: n, estilo: n } de ESTE espacio y este cliente.
 */
export function evaluarCorreccion(c, { textoActual = "", otras = [], repetidaEn = 0, pendientes = { manual: 0, estilo: 0 } } = {}) {
  const destino = c.alcance === "general" ? "manual" : "estilo";
  if (destino === "manual" && !esOrden(c.cita) && repetidaEn < 1) {
    return { descartada: "Como GENERAL necesita una orden de la persona («nunca…», «siempre…», «en todos los videos») o haberse repetido con otro cliente. Ofrécela como de la marca (alcance: marca).", sugerencia: "marca" };
  }
  const nota = destino === "manual" && !esOrden(c.cita) ? "general porque ya salió con otro cliente" : "";
  const t = plano(c.texto);
  if (c.operacion === "anadir" && t && plano(textoActual).includes(t)) return { descartada: "Eso ya lo dice." };
  const igual = otras.find((p) => p.destino === destino && plano(p.texto) === t && plano(p.antes ?? "") === plano(c.antes));
  if (igual?.estado === "pendiente") return { descartada: "Ya está propuesta y esperando el sí." };
  if (igual?.estado === "descartada") return { descartada: "Ya se propuso y la persona la descartó." };
  if ((pendientes[destino] ?? 0) >= MAX_PENDIENTES_POR_DESTINO) {
    return { descartada: `Ya hay ${MAX_PENDIENTES_POR_DESTINO} propuestas esperando en ${destino === "manual" ? "el manual" : "el estilo de este cliente"}: que se decidan antes.` };
  }
  if (c.operacion !== "anadir") {
    const prueba = aplicarATexto(textoActual, c);
    if (prueba.caduca) return { descartada: `No se puede ${c.operacion === "cambiar" ? "cambiar" : "quitar"}: ${prueba.caduca}` };
  }
  return { propuesta: { destino, parte: c.parte, operacion: c.operacion, antes: c.antes, texto: c.texto, cita: c.cita, ...(nota ? { nota } : {}) } };
}

/** Cómo se le enseña una propuesta a la persona, con el texto exacto. Pura. */
export function textoDePropuesta(p, { nombreParte = p.parte } = {}) {
  const donde = p.destino === "manual" ? `el MANUAL (para todos los clientes), parte «${nombreParte}»` : `el ESTILO de la marca, «${nombreParte}»`;
  const que = p.operacion === "anadir" ? `AÑADIR: «${p.texto}»`
    : p.operacion === "cambiar" ? `CAMBIAR «${p.antes}» POR «${p.texto}»`
      : `QUITAR: «${p.antes}»`;
  return `[${p.id}] En ${donde}: ${que}. Porque dijo: «${p.cita}».`;
}
