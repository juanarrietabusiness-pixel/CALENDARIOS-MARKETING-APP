// ============================================================
// «¿Está listo este video?»: la IA lo VE antes de publicarlo (puro; también lo importa el Worker)
//
// Lo mira el motor de video del espacio (Gemini, o Meta por fotogramas: sin audio, así que la voz queda «sin saber»).
// Cada criterio es un sí, un no o «no aplica», con su nota; el VEREDICTO no es sólo de la IA: un no en lo que no se
// arregla después (el gancho, la voz en otro idioma, un defecto) lo deja en «No está listo» aunque el puntaje sea alto.
// Lo usan la pestaña Subir de una publicación con video y el visor del Estudio (components/VideoListo.jsx).
// ============================================================

/** Lo que se mira, en el orden en que se enseña. `grave`: un no aquí y el video no está listo. */
export const CRITERIOS_VIDEO = [
  { id: "gancho", nombre: "Engancha en los primeros 2 segundos", grave: true },
  { id: "sinSonido", nombre: "Se entiende sin sonido" },
  { id: "voz", nombre: "La voz va en español (latino neutro)", grave: true },
  { id: "producto", nombre: "Se ve el producto o el servicio" },
  { id: "marca", nombre: "Se ve la marca o el logo" },
  { id: "cierre", nombre: "Cierra con un llamado a la acción" },
  { id: "defectos", nombre: "Sin defectos (deformaciones, cortes, texto mal escrito)", grave: true },
  { id: "encuadre", nombre: "Bien encuadrado para el formato" },
];

const corto = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * El pedido al motor que VE el video. `formato`: «reel», «historia» o «youtube» (cambia el encuadre que se espera).
 * `producto`: la línea del catálogo (nombre y precio) si se sabe de qué es; `idea`: lo que la publicación quiere decir.
 */
export function pedidoDeRevisionVideo({ marca = "", producto = "", idea = "", formato = "reel", conLogo = false } = {}) {
  const encuadre = formato === "youtube" ? "horizontal 16:9" : "vertical 9:16, con lo importante lejos del 14 % de arriba y del 20 % de abajo (ahí van los botones de la red)";
  return [
    `Eres el director comercial de una agencia de redes sociales. Revisa este video de ${marca || "la marca"} ANTES de publicarlo y di si está listo. Sé estricto y concreto: es lo último que se mira.`,
    idea ? `Lo que el video tiene que comunicar: ${corto(idea, 600)}` : "",
    producto ? `El producto: ${corto(producto, 300)}. Si se dice un precio distinto, es un defecto.` : "",
    conLogo ? "La marca tiene logo: debería verse en algún momento (mejor al final), sin deformar." : "",
    `Formato: ${encuadre}.`,
    "",
    "Mira, uno por uno:",
    "- gancho: ¿los primeros 2 segundos hacen que alguien deje de deslizar? (movimiento, una pregunta, algo inesperado; no un logo ni un fundido lento)",
    "- sinSonido: ¿se entiende lo que pasa con el sonido apagado?",
    "- voz: si hay voz, ¿es español latino neutro, clara y sin voseo? Si no hay voz, null.",
    "- producto: ¿se ve el producto o el servicio, reconocible?",
    "- marca: ¿se ve la marca o el logo, sin deformar?",
    "- cierre: ¿termina diciendo qué hacer (escribir, comprar, visitar)?",
    "- defectos: ¿hay manos o caras deformes, objetos que cambian de forma, cortes bruscos, texto mal escrito o en otro idioma?",
    "- encuadre: ¿está bien encuadrado para el formato?",
    "",
    "En cada uno: ok = true (cumple), false (no cumple) o null (no aplica o no se puede saber), y una nota corta que diga QUÉ se ve (con el segundo, si sirve).",
    "Arreglos: como mucho 4, concretos y en el orden en que conviene hacerlos («recorta el primer segundo: empieza en negro»).",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"puntaje":0-10,"resumen":"una frase","criterios":{"gancho":{"ok":true,"nota":"…"},"sinSonido":{"ok":true,"nota":"…"},"voz":{"ok":null,"nota":"…"},"producto":{"ok":true,"nota":"…"},"marca":{"ok":true,"nota":"…"},"cierre":{"ok":false,"nota":"…"},"defectos":{"ok":true,"nota":"…"},"encuadre":{"ok":true,"nota":"…"}},"arreglos":["…"]}',
  ].filter((l) => l !== "").join("\n");
}

/** «listo», «casi» o «no». Un no en un criterio grave manda sobre el puntaje. Pura. */
export function veredictoVideo({ puntaje = 0, criterios = [] } = {}) {
  const graves = new Set(CRITERIOS_VIDEO.filter((c) => c.grave).map((c) => c.id));
  if (criterios.some((c) => c.ok === false && graves.has(c.id))) return "no";
  const fallan = criterios.filter((c) => c.ok === false).length;
  if (puntaje >= 8 && fallan === 0) return "listo";
  if (puntaje >= 6 && fallan <= 2) return "casi";
  return "no";
}

/** Lo que dice cada veredicto en la pantalla. */
export const FRASE_VEREDICTO = {
  listo: "Está listo para publicar",
  casi: "Casi: arregla lo marcado antes de publicarlo",
  no: "No está listo todavía",
};

/** La respuesta del motor → { puntaje, resumen, criterios: [{ id, nombre, ok, nota }], arreglos, veredicto }. Null si no hay JSON. Pura. */
export function leerRevisionVideo(texto) {
  const m = String(texto ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  if (!d || typeof d !== "object") return null;
  const dados = d.criterios && typeof d.criterios === "object" ? d.criterios : {};
  const criterios = CRITERIOS_VIDEO.map(({ id, nombre }) => {
    const c = dados[id] ?? {};
    const ok = c.ok === true ? true : c.ok === false ? false : null;
    return { id, nombre, ok, nota: corto(c.nota, 240) };
  });
  const puntaje = Math.max(0, Math.min(10, Math.round(Number(d.puntaje) || 0)));
  const arreglos = (Array.isArray(d.arreglos) ? d.arreglos : []).map((s) => corto(s, 240)).filter(Boolean).slice(0, 4);
  const r = { puntaje, resumen: corto(d.resumen, 300), criterios, arreglos };
  return { ...r, veredicto: veredictoVideo(r) };
}
