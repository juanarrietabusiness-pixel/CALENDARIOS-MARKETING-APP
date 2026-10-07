// ============================================================
// Revisar el mes antes de enviarlo al cliente (puro)
//
// Lo que la agencia revisaba a ojo, publicación por publicación, después de
// que la IA escribiera el mes. Dos partes:
//
//   · REGLAS que no cuestan nada y salen al instante: un precio que no está
//     en el catálogo, la competencia nombrada, una promoción en una fecha
//     delicada, voseo («vení», «tenés»), un texto sin llamado a la acción,
//     más de 30 hashtags. El voseo se arregla con un botón.
//   · Lo que hace falta para ENVIAR: una publicación sin su contenido
//     (porque es un reel que se graba, o no se pudo hacer) tiene que llevar
//     la idea clara en su texto, su guion (o el texto de cada lámina) y una
//     referencia que el cliente pueda abrir.
//
// La revisión con IA (opcional, unos centavos) y la de las imágenes contra
// el kit de marca las hace la pantalla (RevisionMes.jsx) con lo de aquí.
// ============================================================

import { faltaParaEnviar } from "./completitud";

export { faltaParaEnviar };

/** Formas del voseo que se cuelan cuando el modelo imita un ADN o un ejemplo rioplatense → su forma de tú. */
export const VOSEO = Object.freeze({
  vení: "ven", venite: "vente", tenés: "tienes", querés: "quieres", podés: "puedes", sabés: "sabes", sos: "eres",
  mirá: "mira", escribinos: "escríbenos", contanos: "cuéntanos", decinos: "dinos", aprovechá: "aprovecha",
  comprá: "compra", pedí: "pide", llamá: "llama", hacé: "haz", tomá: "toma", elegí: "elige", probá: "prueba",
  visitanos: "visítanos", seguinos: "síguenos", dejá: "deja", reservá: "reserva", agendá: "agenda", animate: "anímate",
  sumate: "súmate", descubrí: "descubre", disfrutá: "disfruta", conocé: "conoce", encontrá: "encuentra", buscá: "busca",
  andá: "ve", esperá: "espera", fijate: "fíjate", imaginá: "imagina", llevá: "lleva", preguntá: "pregunta",
});
const PALABRA_VOSEO = new RegExp(`(^|[^\\p{L}])(${Object.keys(VOSEO).join("|")})(?=[^\\p{L}]|$)`, "giu");

const CTA = /(escr[ií]b|whats|wa\.me|link|enlace|agend|reserv|compr|ped[ií]|pide|llam|v[ií]sit|\bdm\b|mensaje|cotiz|inscr[ií]b|reg[ií]str|orden|pregunt|consult|clic|toca|desliza|guarda|comparte|s[ií]gue|s[ií]guenos|escanea|aprovecha|ven a|vis[ií]tanos|cont[aá]ctanos|ll[aá]manos)/i;
const PROMO = /(descuento|oferta|promo|rebaja|\d+\s?%|2x1|3x2|gratis|liquidaci[oó]n|black friday|cyber)/i;
const MAX_HASHTAGS = 30;

/** Las cantidades de dinero de un texto, normalizadas («$45», «B/. 45.00», «45 dólares» → «45»). */
export function cantidadesDe(texto) {
  const t = String(texto ?? "");
  const salida = new Set();
  const norma = (n) => String(Number(String(n).replace(/,(?=\d{3}\b)/g, "").replace(",", ".")));
  for (const m of t.matchAll(/(?:\$|B\/\.?|USD)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/gi)) salida.add(norma(m[1]));
  for (const m of t.matchAll(/(\d+(?:[.,]\d{1,2})?)\s?(?:d[oó]lares|balboas|usd)\b/gi)) salida.add(norma(m[1]));
  for (const m of t.matchAll(/(\d{1,3})\s?%/g)) salida.add(`${Number(m[1])}%`);
  return [...salida].filter((x) => x !== "NaN");
}

/** Las cantidades que el catálogo sí dice (precios y ofertas). Pura. */
export function cantidadesDelCatalogo(catalogo = []) {
  return new Set((Array.isArray(catalogo) ? catalogo : []).flatMap((p) => cantidadesDe(`${p?.precio ?? ""} ${p?.oferta ?? ""}`)));
}

/** Cambia el voseo por su forma de tú, respetando la mayúscula inicial. Pura. */
export function corregirVoseo(texto) {
  return String(texto ?? "").replace(PALABRA_VOSEO, (_, antes, palabra) => {
    const tu = VOSEO[palabra.toLowerCase()] ?? palabra;
    return antes + (palabra[0] === palabra[0].toUpperCase() ? tu[0].toUpperCase() + tu.slice(1) : tu);
  });
}

const textoDe = (p) => [p?.descripcion || p?.script || "", p?.guion || "", p?.hashtagsFinales || ""].join("\n");

/**
 * Lo que las reglas ven en una publicación → [{ codigo, texto, arreglo? }]. Pura.
 * @param ctx  { precios: Set (cantidadesDelCatalogo), competidores: [nombre], delicada: nombre de la fecha o null }
 */
export function problemasDeTexto(post, { precios = new Set(), competidores = [], delicada = null } = {}) {
  const salida = [];
  const texto = textoDe(post);
  if (!texto.trim()) return salida;
  const descripcion = String(post?.descripcion || post?.script || "");

  if (precios.size) {
    const raros = cantidadesDe(texto).filter((c) => !precios.has(c));
    if (raros.length) salida.push({ codigo: "precio", texto: `Lleva ${raros.map((c) => (c.endsWith("%") ? c : `$${c}`)).join(", ")}, que no está en el catálogo. ¿Es un precio inventado o el catálogo está viejo?` });
  }
  const nombrados = competidores.filter((c) => c && c.length >= 3 && new RegExp(`(^|[^\\p{L}])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^\\p{L}]|$)`, "iu").test(texto));
  if (nombrados.length) salida.push({ codigo: "competencia", texto: `Nombra a la competencia (${nombrados.join(", ")}).` });
  if (delicada && PROMO.test(texto)) salida.push({ codigo: "delicada", texto: `Es ${delicada} (fecha delicada) y el texto habla de promociones.` });
  const voseo = [...new Set([...texto.matchAll(PALABRA_VOSEO)].map((m) => m[2].toLowerCase()))];
  if (voseo.length) salida.push({ codigo: "voseo", texto: `Voseo: ${voseo.map((v) => `«${v}» → «${VOSEO[v]}»`).join(", ")}.`, arreglo: "Pasar a tú" });
  if (descripcion.trim() && post?.format !== "historia" && !CTA.test(descripcion)) salida.push({ codigo: "cta", texto: "La descripción no dice qué hacer (escribir, agendar, comprar…)." });
  const hashtags = (texto.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (hashtags > MAX_HASHTAGS) salida.push({ codigo: "hashtags", texto: `Lleva ${hashtags} hashtags; Instagram admite ${MAX_HASHTAGS}.` });
  return salida;
}

/** Aplica el arreglo de un problema (hoy, el voseo) a la publicación. Pura. */
export function aplicarArregloTexto(post, codigo) {
  if (codigo !== "voseo") return post;
  const salida = { ...post };
  for (const k of ["descripcion", "script", "guion", "idea"]) if (typeof post?.[k] === "string") salida[k] = corregirVoseo(post[k]);
  return salida;
}

/**
 * El mes entero: las publicaciones con algo que mirar → [{ date, post, problemas, falta }], en orden. Pura.
 * @param delicadas  { "2026-11-02": "Día de los Difuntos" } (las fechas delicadas del mes).
 */
export function revisarMes(days = [], { catalogo = [], competidores = [], delicadas = {} } = {}) {
  const precios = cantidadesDelCatalogo(catalogo);
  const salida = [];
  for (const d of [...(days ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const post of d?.posts ?? []) {
      const problemas = problemasDeTexto(post, { precios, competidores, delicada: delicadas[d.date] ?? null });
      const falta = faltaParaEnviar(post);
      if (problemas.length || falta.length) salida.push({ date: d.date, post, problemas, falta });
    }
  }
  return salida;
}

/** «3 publicaciones sin contenido a las que les falta algo · 5 avisos en los textos». Vacío si no hay nada. Pura. */
export function resumenRevision(lista = []) {
  const sinContenido = lista.filter((x) => x.falta.length).length;
  const avisos = lista.reduce((n, x) => n + x.problemas.length, 0);
  return [
    sinContenido && `${sinContenido} ${sinContenido === 1 ? "publicación sin contenido a la que le falta algo" : "publicaciones sin contenido a las que les falta algo"}`,
    avisos && `${avisos} ${avisos === 1 ? "aviso en los textos" : "avisos en los textos"}`,
  ].filter(Boolean).join(" · ");
}

/** Lo que se le pide a la IA en la revisión opcional: lo que las reglas no ven. Pura. */
export function pedidoDeRevisionIA({ marca, publicaciones = [] }) {
  return [
    `Eres editor de una agencia en Panamá. Revisa los textos del calendario de ${marca} antes de enviárselos al cliente.`,
    "Busca SOLO problemas reales: faltas de ortografía o de tildes, frases confusas, un texto que no corresponde a su idea o a su formato, promesas que suenan exageradas o arriesgadas (salud, resultados garantizados), tono que no es el de la marca, repeticiones entre publicaciones. Los precios, la competencia y el voseo ya se revisaron: no los repitas.",
    "Si una publicación está bien, no la nombres. Cada problema, en una frase, con la corrección propuesta.",
    "",
    "PUBLICACIONES:",
    ...publicaciones.map((p) => `<<<${p.id}>>> ${p.date} · ${p.format}\nIDEA: ${String(p.idea ?? "").slice(0, 300)}\nTEXTO: ${String(p.descripcion || p.script || "").slice(0, 1500)}${p.guion ? `\nGUION: ${String(p.guion).slice(0, 1200)}` : ""}`),
    "",
    'Responde SOLO con JSON: {"problemas":[{"id":"…","texto":"…"}]}',
  ].join("\n");
}

/** La respuesta de la IA → { id: [texto] }. Lo que nombre una publicación que no se le mandó, se descarta. Pura. */
export function leerRevisionIA(texto, ids = []) {
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  let d;
  try { d = JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
  const validos = new Set(ids);
  const salida = {};
  for (const p of Array.isArray(d?.problemas) ? d.problemas : []) {
    const id = String(p?.id ?? "");
    const frase = String(p?.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (!validos.has(id) || !frase) continue;
    (salida[id] ??= []).push(frase);
  }
  return salida;
}
