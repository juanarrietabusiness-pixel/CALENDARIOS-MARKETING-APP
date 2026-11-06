// ============================================================
// La VOZ DEL CLIENTE: una encuesta corta para los clientes de un cliente, por un enlace (puro)
//
// El estudio de mercado pide hablar con 5 a 10 clientes de verdad (curso, módulo 3): por qué compraron, por qué a esta
// marca, qué casi los frena. Casi ninguna agencia lo hace, porque cuadrar llamadas cuesta. Aquí, un enlace fijo por
// cliente (`/voz?t=…`, sin sesión, como el de ventas) que el cliente reenvía a sus clientes por WhatsApp: siete
// preguntas cortas y una de sí o no, todo opcional menos una, y la casilla para que su respuesta sirva de testimonio
// CON su nombre.
//
// Lo que responden sirve para las maletas del estudio: el PROBLEMA y los DIFERENCIALES con las palabras de quien
// compra, las OBJECIONES que casi los frenan y los TESTIMONIOS (sólo de quien dio permiso, con su nombre: un testimonio
// sin permiso no se publica). «Llevar al estudio» le pide a la IA que lea las respuestas y PROPONGA qué añadir; una
// persona marca lo que se queda y va al BORRADOR del estudio, que se aprueba como siempre (worker/lib/whatsapp.js).
//
// «Llevar al estudio» vive aparte (src/lib/vozAlEstudio.js): arrastra el estudio de mercado, y la página pública —que
// importa este archivo— no lo necesita. Este archivo no importa nada.
//
// Las preguntas son propias (la licencia del método del curso no deja copiar su texto).
// ============================================================

/** Lo que cabe en cada respuesta: corto a propósito, se contesta desde el teléfono. */
export const MAX_RESPUESTA_VOZ = 600;
export const MAX_NOMBRE_VOZ = 60;
/** Cuántas respuestas guarda un cliente como mucho: el enlace es público y no se puede llenar sin fin. */
export const MAX_RESPUESTAS_CLIENTE = 500;
/** Cuántas lee la IA de una vez al llevarlas al estudio. */
export const MAX_PARA_ESTUDIO = 40;

/** Las preguntas, en orden. `maleta`: a qué maleta del estudio alimenta sobre todo. Una sola obligatoria. */
export const PREGUNTAS_VOZ = Object.freeze([
  { id: "problema", pregunta: "¿Qué problema o necesidad tenías cuando nos buscaste?", maleta: "problema" },
  { id: "buscaba", pregunta: "¿Qué era lo más importante para ti al escoger?", maleta: "problema" },
  { id: "porque", pregunta: "¿Por qué nos escogiste a nosotros y no a otra opción?", maleta: "diferenciales", obligatoria: true },
  { id: "freno", pregunta: "¿Hubo algo que casi te hace no comprar? (el precio, el envío, una duda…)", maleta: "objeciones" },
  { id: "sorpresa", pregunta: "¿Qué fue lo que más te gustó o te sorprendió?", maleta: "testimonios" },
  { id: "amigo", pregunta: "Si se lo contaras a un amigo, ¿cómo nos describirías?", maleta: "testimonios" },
  { id: "extranaria", pregunta: "Si mañana no existiéramos, ¿qué extrañarías?", maleta: "diferenciales" },
]);
const IDS_PREGUNTA = PREGUNTAS_VOZ.map((p) => p.id);
const OBLIGATORIA = PREGUNTAS_VOZ.find((p) => p.obligatoria);

/** «¿Nos recomendarías?»: la octava, de un toque. */
export const RECOMIENDA = Object.freeze([
  { id: "si", nombre: "Sí" },
  { id: "tal-vez", nombre: "Tal vez" },
  { id: "no", nombre: "No" },
]);
const IDS_RECOMIENDA = RECOMIENDA.map((r) => r.id);

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const lista = (v) => (Array.isArray(v) ? v : []);

/**
 * Lo que manda quien responde, limpio: { fila, error }. `productos`: los ids que puede escoger (lo que compró). Con la
 * casilla del testimonio, el nombre es obligatorio (un testimonio sin nombre no sirve). `sitio` es el campo trampa que
 * no ve una persona: si llega lleno, `spam` (se contesta que sí y no se guarda). Pura.
 */
export function limpiarRespuestaVoz(entrada, { productos = [] } = {}) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  if (corto(e.sitio, 200)) return { fila: null, error: "", spam: true };
  const r = e.respuestas && typeof e.respuestas === "object" ? e.respuestas : {};
  const respuestas = {};
  for (const id of IDS_PREGUNTA) {
    const t = corto(r[id], MAX_RESPUESTA_VOZ);
    if (t) respuestas[id] = t;
  }
  if (!respuestas[OBLIGATORIA.id]) return { fila: null, error: "Cuéntanos por qué nos escogiste: es la única pregunta obligatoria." };
  const nombre = corto(e.nombre, MAX_NOMBRE_VOZ);
  const permiso = e.permiso === true;
  if (permiso && !nombre) return { fila: null, error: "Para usar tu respuesta como testimonio, escribe tu nombre (o desmarca la casilla)." };
  const ids = new Set(lista(productos).map((p) => String(p?.id ?? p)));
  const producto = ids.has(String(e.producto ?? "")) ? String(e.producto) : "";
  const recomienda = IDS_RECOMIENDA.includes(e.recomienda) ? e.recomienda : "";
  return { fila: { respuestas, nombre, permiso, producto, recomienda }, error: "" };
}

/** Una fila guardada (de D1 o de la pantalla) como la usan la pantalla y la IA. Pura. */
export function respuestaDeFila(f) {
  if (!f) return null;
  let r = f.respuestas;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { r = {}; } }
  const respuestas = {};
  for (const id of IDS_PREGUNTA) { const t = corto(r?.[id], MAX_RESPUESTA_VOZ); if (t) respuestas[id] = t; }
  return {
    id: String(f.id ?? ""),
    respuestas,
    nombre: corto(f.nombre, MAX_NOMBRE_VOZ),
    permiso: f.permiso === true || Number(f.permiso) === 1,
    producto: String(f.producto ?? ""),
    recomienda: IDS_RECOMIENDA.includes(f.recomienda) ? f.recomienda : "",
    llevadaAt: f.llevada_at ?? f.llevadaAt ?? null,
    creadaAt: f.created_at ?? f.creadaAt ?? null,
  };
}

/** Cuántas hay, cuántas dieron permiso, qué tanto recomiendan y cuántas no se han llevado al estudio. Pura. */
export function resumenVoz(respuestas) {
  const rs = lista(respuestas).map(respuestaDeFila).filter(Boolean);
  const cuenta = (id) => rs.filter((r) => r.recomienda === id).length;
  return {
    total: rs.length,
    conPermiso: rs.filter((r) => r.permiso && r.nombre).length,
    sinLlevar: rs.filter((r) => !r.llevadaAt).length,
    recomiendan: { si: cuenta("si"), "tal-vez": cuenta("tal-vez"), no: cuenta("no") },
  };
}

/** Una respuesta en texto: «Por qué nos escogió: …», una línea por pregunta contestada. Pura. */
export function respuestaATexto(r) {
  const x = respuestaDeFila(r);
  if (!x) return "";
  const cortaDe = { problema: "Su problema", buscaba: "Lo más importante", porque: "Por qué nos escogió", freno: "Lo que casi lo frena", sorpresa: "Lo que más le gustó", amigo: "Cómo nos describe", extranaria: "Lo que extrañaría" };
  return [
    ...IDS_PREGUNTA.filter((id) => x.respuestas[id]).map((id) => `${cortaDe[id]}: ${x.respuestas[id]}`),
    x.recomienda && `¿Nos recomienda?: ${RECOMIENDA.find((r) => r.id === x.recomienda).nombre}`,
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------
// El enlace y los mensajes
// ------------------------------------------------------------

/** La dirección pública: `https://…/voz?t=<testigo>`. Vacía sin testigo. Pura. */
export const enlaceDeVoz = (origen, testigo) => (testigo ? `${String(origen ?? "").replace(/\/$/, "")}/voz?t=${encodeURIComponent(testigo)}` : "");

/** El mensaje que el CLIENTE reenvía a sus clientes. Pura. */
export function mensajeVoz({ marca = "", enlace = "" } = {}) {
  const de = String(marca).trim();
  return [
    `¡Hola! En ${de || "nuestro negocio"} queremos seguir mejorando y tu opinión nos ayuda muchísimo.`,
    "¿Nos regalas 2 minutos? Son unas preguntas cortas, desde el teléfono:",
    enlace,
    "¡Gracias por confiar en nosotros!",
  ].filter(Boolean).join("\n");
}

/** El mensaje que la AGENCIA le manda al cliente, con el de sus clientes dentro, listo para reenviar. Pura. */
export function mensajeAlCliente({ nombre = "", marca = "", enlace = "" } = {}) {
  const hola = `Hola${String(nombre).trim() ? ` ${String(nombre).trim()}` : ""}`;
  return [
    `${hola}, para que los anuncios hablen como hablan tus clientes necesitamos escucharlos. ¿Puedes reenviar este mensaje a 5 o 10 clientes que ya te compraron (los más contentos y alguno que dudó antes de comprar)?`,
    "",
    mensajeVoz({ marca, enlace }),
  ].join("\n");
}
