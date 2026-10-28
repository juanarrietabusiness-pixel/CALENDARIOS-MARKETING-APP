// ============================================================
// «Dame ideas» para un CARRUSEL o un REEL IA (puro)
//
// Para cuando no hay idea: la IA propone de 3 a 5, cada una distinta, con lo
// que se sabe de la marca (catálogo con precio EXACTO, estudio de mercado y
// el cerebro para escribir, nunca lo interno). Un carrusel trae su tema y el
// guion lámina por lámina («Portada: … / Slide 2: … / CTA: …», lo que lee
// `partirGuion`); un reel, la idea central de 10 s. «Usar» la pone en el paso
// 1 del flujo y de ahí sigue como siempre. Es texto: no gasta en el motor.
//
// Lo usan components/FlujoCarrusel.jsx, components/FlujoReel.jsx y el Worker
// (worker/lib/estudio/ideasFormato.js).
// ============================================================

import { estructuraDe, lineaDeEstructura } from "./estructurasCarrusel.js";

export const MIN_IDEAS_FORMATO = 3;
export const MAX_IDEAS_FORMATO = 5;
const MAX_TITULO = 60;
const MAX_TEMA = 400;
const MAX_GUION = 2000;
const MAX_IDEA = 600;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const limiteIdeas = (n) => Math.max(MIN_IDEAS_FORMATO, Math.min(MAX_IDEAS_FORMATO, Math.round(Number(n) || 4)));

/** Lo que se le pide a la IA. `formato`: "carrusel" | "reel". Pura. */
export function pedidoDeIdeasFormato({ formato = "carrusel", marca = "la marca", rubro = "", n = 4, tipo = "", tema = "", producto = "", estudio = "", contexto = "", usados = [], segundos = 10, estructuras = [] }) {
  const cuantas = limiteIdeas(n);
  const carrusel = formato !== "reel";
  // Una estructura DISTINTA por idea (la pone el código: sin ella todas salían «Portada / Slide 1…5 / CTA»).
  const formas = carrusel ? estructuras.filter((id) => estructuraDe(id)).slice(0, cuantas) : [];
  return [
    carrusel
      ? `Propón ${cuantas} ideas de CARRUSEL de Instagram (de 5 a 8 láminas) para ${marca}${rubro ? ` (${rubro})` : ""}.`
      : `Propón ${cuantas} ideas de REEL vertical de ${segundos} segundos, hecho con IA (varios planos con cortes), para ${marca}${rubro ? ` (${rubro})` : ""}.`,
    tipo ? `Tipo de pieza: ${tipo}.` : "Variadas: cada una de un tipo distinto (educativo, beneficio, promoción, testimonio, diferenciador…).",
    tema ? `Sobre: ${corto(tema, 300)}` : "",
    producto ? `Producto (precio EXACTO si se nombra): ${producto}` : "",
    estudio ? `Lo que dice el estudio de mercado:\n${String(estudio).slice(0, 2500)}` : "",
    contexto ? `Lo que se sabe de la marca:\n${String(contexto).slice(0, 3500)}` : "",
    formas.length ? `Cada idea con SU estructura, en este orden (una distinta por idea; el guion la sigue lámina a lámina y con ese número de láminas):\n${formas.map((id, k) => `${k + 1}. ${lineaDeEstructura(id)}`).join("\n")}` : "",
    usados.length ? `Ya salieron estas (no las repitas): ${usados.slice(0, 15).map((u) => `«${corto(u, 80)}»`).join(", ")}` : "",
    "",
    carrusel
      ? "Reglas: cada idea con un gancho claro en la portada, una lámina por idea y el cierre con el llamado a la acción. El texto de cada lámina, corto (una frase o un titular con apoyo). Un precio, EXACTO como en el catálogo. Nada de reseñas, cifras ni urgencias inventadas; no nombres a la competencia."
      : "Reglas: cada idea con un gancho en los primeros 2 segundos, algo que se VE (no sólo que se dice) y el cierre con el llamado a la acción. Un precio, EXACTO como en el catálogo. Nada de reseñas, cifras ni urgencias inventadas; no nombres a la competencia.",
    "",
    carrusel
      ? 'Responde SOLO con JSON: {"ideas":[{"titulo":"cómo la llamarías, corto","tema":"de qué va y por qué funciona, en una frase","guion":"Portada: …\\nSlide 2: …\\nSlide 3: …\\nCTA: …"}]}'
      + (formas.length ? ` (las ideas en el orden de las estructuras: la 1 con la estructura 1…)` : "")
      : 'Responde SOLO con JSON: {"ideas":[{"titulo":"cómo la llamarías, corto","idea":"la idea central: el gancho, lo que se ve y el cierre, en 2 o 3 frases"}]}',
  ].filter((l) => l !== "").join("\n");
}

/** La respuesta → [{ id, titulo, tema, guion }] (carrusel) o [{ id, titulo, idea }] (reel). Las vacías, fuera. Pura. */
export function leerIdeasFormato(texto, formato = "carrusel", estructuras = []) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return [];
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return []; }
  const lista = Array.isArray(d?.ideas) ? d.ideas : [];
  return lista.slice(0, MAX_IDEAS_FORMATO).flatMap((x, k) => {
    const titulo = corto(x?.titulo, MAX_TITULO);
    if (formato === "reel") {
      const idea = corto(x?.idea, MAX_IDEA);
      return idea ? [{ id: `idea-${k + 1}`, titulo: titulo || idea.slice(0, 40), idea }] : [];
    }
    const guion = String(x?.guion ?? "").replace(/\\n/g, "\n").trim().slice(0, MAX_GUION);
    const tema = corto(x?.tema, MAX_TEMA);
    const estructura = estructuraDe(estructuras[k])?.id;
    return guion || tema ? [{ id: `idea-${k + 1}`, titulo: titulo || tema.slice(0, 40), tema, guion, ...(estructura ? { estructura } : {}) }] : [];
  });
}
