// ============================================================
// Las conversaciones del asistente, por tema (puro)
//
// Cada cliente tiene su lista y el asistente general la suya; las ve todo el
// equipo. El título lo propone la IA con el primer intercambio y se puede
// cambiar a mano. Lo usan el Worker (worker/rutas/conversaciones.js) y la
// pantalla (ChatPanel).
// ============================================================

export const MAX_TITULO = 80;
/** Lo que se le enseña a la IA para titular: el principio basta. */
const MAX_MUESTRA = 1500;
/** El título de una conversación nueva hasta que la IA (o alguien) le pone uno. */
export const TITULO_NUEVA = "Nueva conversación";

/** Un título escrito por la IA o por una persona, limpio: una línea, sin comillas ni punto final, hasta MAX_TITULO. */
export function tituloLimpio(texto) {
  let t = String(texto ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  t = t.replace(/^(t[ií]tulo|title)\s*:\s*/i, "");
  // Comillas, asteriscos y el punto final, en el orden que vengan («Título».  o  «Título.»).
  for (let i = 0; i < 3; i++) t = t.replace(/^[«"'“*#\s]+|[»"'”*.\s]+$/g, "");
  if (t.length > MAX_TITULO) t = `${t.slice(0, MAX_TITULO - 1).replace(/\s+\S*$/, "")}…`;
  return t;
}

/** Lo que se le pide a la IA para titular una conversación, con su primer intercambio. */
export function pedidoDeTitulo({ pregunta = "", respuesta = "", cliente = "" } = {}) {
  return [
    `Ponle un TÍTULO a esta conversación entre una agencia de marketing y su asistente${cliente ? ` sobre el cliente ${cliente}` : ""}.`,
    "Entre 2 y 6 palabras, en español, que digan el TEMA (ej.: «Guiones de reels de octubre», «Campaña de Navidad», «Precios del sofá cama»).",
    "Sin comillas, sin punto final, sin emojis. Responde SOLO con el título.",
    "",
    `LA PERSONA: ${String(pregunta).slice(0, MAX_MUESTRA)}`,
    respuesta ? `EL ASISTENTE: ${String(respuesta).slice(0, MAX_MUESTRA)}` : "",
  ].filter((l) => l !== "").join("\n");
}

/**
 * Un título provisional sin IA: las primeras palabras de lo que se preguntó. Es lo que se ve mientras llega el de la
 * IA, y lo que queda si la IA falla.
 */
export function tituloProvisional(pregunta) {
  const t = String(pregunta ?? "").replace(/\[\[[^\]]*\]\]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return TITULO_NUEVA;
  const palabras = t.split(" ").slice(0, 7).join(" ");
  return tituloLimpio(palabras.length < t.length ? `${palabras}…` : palabras) || TITULO_NUEVA;
}

/** Cuándo se habló por última vez, en corto: «hoy, 9:30», «ayer», «12 oct». `ahora` se inyecta. */
export function cuandoFue(iso, ahora = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = (x) => x.toLocaleDateString("es-PA", { timeZone: "America/Panama" });
  if (dia(d) === dia(ahora)) return `hoy, ${d.toLocaleTimeString("es-PA", { timeZone: "America/Panama", hour: "numeric", minute: "2-digit" })}`;
  const ayer = new Date(ahora.getTime() - 86_400_000);
  if (dia(d) === dia(ayer)) return "ayer";
  return d.toLocaleDateString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", ...(d.getFullYear() !== ahora.getFullYear() ? { year: "numeric" } : {}) });
}

/** La lista en el orden en que se enseña: la de la última vez arriba. Filtra por lo escrito en el buscador. */
export function ordenarConversaciones(lista, buscar = "") {
  const q = String(buscar).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return [...(lista ?? [])]
    .filter((c) => !q || String(c.titulo ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q))
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
}
