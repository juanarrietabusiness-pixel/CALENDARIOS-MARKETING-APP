// ============================================================
// «Dame ideas»: el generador de ideas del Estudio (puro)
//
// Para cuando la mente está en blanco: la IA propone ideas de piezas para
// el cliente, variadas o de un tipo de pieza. Cada idea dice qué se VE (la
// escena), qué va ESCRITO encima (corto, con el precio EXACTO del catálogo
// si lo lleva) y de qué producto es; «Usar» la pone en el compositor con su
// tipo y las fotos de su producto, y de ahí se crea como siempre.
//
// La variedad no se le pide al modelo: se la da resuelta el código, igual
// que en el lote (`planDeIdeas`). Cada idea llega con su tipo de contenido
// —lo que comunica: la regla de `PILARES`, no un estilo—, su composición y,
// si el tipo lleva producto, uno del catálogo que rota.
//
// Es texto: no gasta en el motor. Lo usan la pantalla (Estudio.jsx) y el
// Worker (worker/lib/estudio/ideas.js).
// ============================================================

import { PILARES } from "./pilares.js";
import { COMPOSICIONES } from "./loteAnuncios.js";

export const IDEAS_POR_DEFECTO = 6;
export const MAX_IDEAS = 8;
const MAX_TITULO = 60;
const MAX_ESCENA = 400;
const MAX_TEXTO = 140;

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const pilar = (id) => PILARES.find((p) => p.id === id) ?? null;

/**
 * Qué idea va en cada hueco: el tipo (el pedido, o todos rotando), la composición (rotando en saltos de 4: dos
 * seguidas nunca se parecen) y, si el tipo lleva producto, uno del catálogo. `semilla` cambia el punto de partida. Pura.
 */
export function planDeIdeas({ n = IDEAS_POR_DEFECTO, tipo = "", productos = [], semilla = 0 } = {}) {
  const total = Math.max(1, Math.min(MAX_IDEAS, Math.floor(Number(n) || IDEAS_POR_DEFECTO)));
  const s = Math.abs(Math.floor(Number(semilla) || 0));
  const tipos = pilar(tipo) ? [tipo] : PILARES.map((p) => p.id);
  let k = 0;
  return Array.from({ length: total }, (_, i) => {
    const t = tipos[(s + i) % tipos.length];
    const lleva = pilar(t)?.producto && productos.length;
    const r = {
      n: i + 1,
      tipo: t,
      composicion: COMPOSICIONES[(s + i * 4) % COMPOSICIONES.length].id,
      ...(lleva ? { productoId: productos[(s + k) % productos.length].id } : {}),
    };
    if (lleva) k += 1;
    return r;
  });
}

/**
 * Lo que se le pide a la IA. `productos`: { id → línea del catálogo (con su precio) }; `contexto`: el cerebro para
 * escribir (sin lo interno); `estudio`: lo general del estudio de mercado. Pura.
 */
export function pedidoDeIdeasEstudio({ marca = "la marca", plan = [], productos = {}, contexto = "", estudio = "", video = false, tema = "" }) {
  const que = video ? "videos cortos (8 a 10 s, una sola toma)" : "imágenes para redes sociales";
  return [
    `Propón ${plan.length} ideas de ${que} para ${marca}. Cada una tiene YA decidido su tipo de contenido (lo que comunica) y su composición: respétalos.`,
    tema ? `Tema que pide la persona: ${corto(tema, 300)}` : "",
    "",
    ...plan.map((r) => {
      const p = pilar(r.tipo);
      const comp = COMPOSICIONES.find((c) => c.id === r.composicion);
      return `${r.n}. ${p?.nombre ?? r.tipo}: ${p?.regla ?? ""} · composición: ${comp?.nombre ?? ""}${r.productoId && productos[r.productoId] ? ` · producto: ${productos[r.productoId]}` : ""}`;
    }),
    "",
    "Cada idea tiene:",
    `- "titulo": cómo la llamarías, en pocas palabras (${MAX_TITULO} caracteres).`,
    `- "escena": qué se VE, en una o dos frases sencillas y concretas (sujeto, acción, lugar, luz), con su composición. Sin texto dentro.`,
    video ? '- "texto": vacío (los modelos de video escriben mal).' : `- "texto": lo que va ESCRITO en la pieza, como mucho dos líneas cortas separadas por «\\n» (${MAX_TEXTO} caracteres); vacío si la pieza no lleva texto.`,
    "",
    "Reglas:",
    "- Ideas distintas entre sí: ni dos escenas en el mismo lugar con la misma acción, ni dos textos que digan lo mismo.",
    "- Precios, ofertas, garantías y cifras: sólo los del catálogo y EXACTOS como allí. No inventes testimonios ni personas reales.",
    "- No copies literal frases de lo que se sabe de la marca, y no nombres a la competencia.",
    "",
    estudio ? `ESTUDIO DE MERCADO:\n${String(estudio).slice(0, 6000)}\n` : "",
    contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 6000)}\n` : "",
    'Responde SOLO con JSON, una por número, así: {"ideas":[{"n":1,"titulo":"…","escena":"…","texto":"…"}]}',
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

const deJSON = (texto) => {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};

/** La respuesta de la IA → las ideas, cada una con lo que decidió el plan. Las que no traen escena, fuera. Pura. */
export function leerIdeasEstudio(texto, plan = []) {
  const d = deJSON(texto);
  const lista = Array.isArray(d?.ideas) ? d.ideas : Array.isArray(d) ? d : [];
  const porNumero = new Map();
  lista.forEach((x, i) => {
    const n = Number(x?.n) || i + 1;
    if (!porNumero.has(n)) porNumero.set(n, x);
  });
  return plan.flatMap((r) => {
    const x = porNumero.get(r.n);
    const escena = corto(x?.escena, MAX_ESCENA);
    if (!escena) return [];
    const texto = String(x?.texto ?? "").split(/\n|\\n/).map((l) => corto(l, 80).replace(/^["«“]|["»”]$/g, "")).filter(Boolean).slice(0, 2).join("\n");
    return [{ id: `idea-${r.n}`, ...r, titulo: corto(x?.titulo, MAX_TITULO) || escena.slice(0, 40), escena, texto }];
  });
}

/**
 * Lo que entra al compositor con «Usar»: la escena y, si la idea trae texto, la orden de escribirlo EXACTO (igual que
 * desde una publicación, `textoDeLaPieza`). Pura.
 */
export function ideaAlPedido(idea) {
  const lineas = String(idea?.texto ?? "").split("\n").map((l) => l.replace(/["“”«»]/g, "").trim()).filter(Boolean);
  return [
    String(idea?.escena ?? "").trim(),
    lineas.length ? `Texto en la imagen, exacto y legible: ${lineas.map((l) => `"${l}"`).join(" / ")}` : "",
  ].filter(Boolean).join("\n\n");
}
