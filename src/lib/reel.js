// ============================================================
// El reel con IA de 10 segundos, como en Flow (puro)
//
//   1. La IDEA central (promoción, beneficio o idea) → el GUION por planos:
//      de 4 a 8 planos con cortes, cada uno con qué se ve, su texto corto en
//      pantalla (el precio EXACTO si lo lleva) y la cámara; el cierre con el
//      logo y el llamado. Más el hilo que comparten todos (personajes, luz,
//      paleta), el sonido y la descripción del post.
//   2. El STORYBOARD: un fotograma por plano (imagen 9:16), en orden, cada uno
//      con el anterior y los personajes de referencia. Se revisan y corrigen
//      ANTES de pagar el video, que es lo caro.
//   3. El VIDEO: Gemini Omni (por Kie) con los fotogramas como storyboard
//      (hasta 7 referencias), los tiempos en el prompt y 10 s.
//   4. CORREGIR UN TRAMO: el video hecho va como video de referencia con
//      «del segundo X al Y: …»; sale una versión nueva y la anterior se queda.
//
// Lo usan la pantalla (components/FlujoReel.jsx) y el Worker
// (worker/lib/estudio/reel.js).
// ============================================================

export const MIN_PLANOS = 3;
export const MAX_PLANOS = 8;
/** Lo que admite Gemini Omni como referencias (sin video): el storyboard se reparte en esos huecos. */
export const MAX_STORYBOARD = 7;
const MAX_ESCENA = 300;
const MAX_TEXTO = 60;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const comillas = (t) => String(t ?? "").split(/\n+/).map((l) => l.replace(/["“”«»]/g, "").trim()).filter(Boolean).map((l) => `"${l}"`).join(" / ");

/** Lo que se le pide a la IA para el guion por planos. Pura. */
export function pedidoDeReel({ marca = "la marca", rubro = "", idea = "", segundos = 10, tipo = "", estilo = "", producto = "", personajes = [], identidad = "", contexto = "" }) {
  return [
    `Eres director creativo de reels. Escribe el guion de UN reel vertical (9:16) de ${segundos} segundos para ${marca}${rubro ? ` (${rubro})` : ""}, para generarlo con un modelo de video con IA que hace varios planos con cortes en una sola pieza.`,
    `LA IDEA CENTRAL: ${corto(idea, 1200) || "propón una a partir de lo que sabemos de la marca"}`,
    tipo ? `Tipo de pieza: ${tipo}.` : "",
    estilo ? `Estilo visual: ${estilo}` : "",
    producto ? `Producto (precio EXACTO si se nombra): ${producto}` : "",
    personajes.length ? `Personajes de la marca (salen IGUAL en cada plano donde aparezcan): ${personajes.join("; ")}` : "",
    identidad ? `Identidad de la marca: ${corto(identidad, 600)}` : "",
    contexto ? `Lo que se sabe de la marca:\n${String(contexto).slice(0, 3000)}` : "",
    "",
    `Reglas: de ${MIN_PLANOS + 1} a ${MAX_PLANOS} planos que sumen ${segundos} s exactos, contiguos desde 0. El primero detiene el scroll (gancho); el del medio muestra el producto o el resultado; el último cierra con el logo de la marca y el llamado a la acción (WhatsApp si lo hay en lo que se sabe). Texto en pantalla corto: como mucho 5 palabras por plano (o vacío), sin errores; un precio, EXACTO como en el catálogo. Nada de reseñas, cifras ni urgencias inventadas.`,
    "",
    'Responde SOLO con JSON: {"hilo":"lo que comparten todos los planos (personaje, luz, paleta, lugar), en una frase","planos":[{"desde":0,"hasta":2,"escena":"qué se ve (sujeto, acción, lugar, luz)","texto":"texto en pantalla o vacío","camara":"movimiento de cámara"}],"sonido":"música, sonido ambiente o voz (y qué dice, si habla)","descripcion":"el texto del post, de 2 a 4 frases, sin hashtags"}',
  ].filter((l) => l !== "").join("\n");
}

/**
 * La respuesta → { hilo, planos: [{ n, desde, hasta, escena, texto, camara }], sonido, descripcion }, o null. Los
 * tiempos se ordenan y se ajustan para que sean contiguos y sumen `segundos` (el último termina ahí). Pura.
 */
export function leerReel(texto, segundos = 10) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  const lista = (Array.isArray(d?.planos) ? d.planos : [])
    .map((p) => ({ desde: Number(p?.desde) || 0, escena: corto(p?.escena, MAX_ESCENA), texto: corto(p?.texto, MAX_TEXTO), camara: corto(p?.camara, 160) }))
    .filter((p) => p.escena)
    .sort((a, b) => a.desde - b.desde)
    .slice(0, MAX_PLANOS);
  if (lista.length < MIN_PLANOS) return null;
  return {
    hilo: corto(d?.hilo, 300),
    planos: repartirTiempos(lista, segundos),
    sonido: corto(d?.sonido, 300),
    descripcion: String(d?.descripcion ?? "").trim().slice(0, 1000),
  };
}

/** Los tiempos de los planos: contiguos desde 0, cada uno de al menos 1 s, el último termina en `segundos`. Pura. */
export function repartirTiempos(planos, segundos = 10) {
  const n = planos.length;
  const total = Math.max(n, Math.round(Number(segundos) || 10));
  let desde = 0;
  return planos.map((p, k) => {
    const propuesto = Number(planos[k + 1]?.desde);
    const resto = n - k - 1;
    const hasta = k === n - 1 ? total
      : Math.min(total - resto, Math.max(desde + 1, Number.isFinite(propuesto) && propuesto > desde ? Math.round(propuesto) : desde + Math.round((total - desde) / (resto + 1))));
    const plano = { ...p, n: k + 1, desde, hasta };
    desde = hasta;
    return plano;
  });
}

/** «[0–2 s]» Pura. */
export const tramo = (p) => `[${p.desde}–${p.hasta} s]`;

/**
 * Lo que se pide para UN fotograma del storyboard (imagen 9:16): el plano, el hilo, el estilo de la marca y, si ya
 * hay, que siga los anteriores. El texto en pantalla va EXACTO (el fotograma enseña cómo se verá). Pura.
 */
export function pedidoDeFotograma({ plano, total, hilo = "", estilo = "", personajes = "", conAnteriores = false, conFotos = false }) {
  return [
    `Fotograma ${plano.n} de ${total} del storyboard de un reel vertical 9:16: el plano ${tramo(plano)}. Una imagen fija de lo que se verá en ese momento del video, con calidad de fotograma de cine publicitario.`,
    `Qué se ve: ${plano.escena}`,
    plano.camara ? `Encuadre (la cámara se moverá así: ${plano.camara}).` : "",
    hilo ? `Lo que comparten TODOS los planos: ${hilo}` : "",
    estilo,
    personajes,
    conAnteriores ? "Las referencias incluyen los fotogramas anteriores de este MISMO reel: mismos personajes, mismo lugar, misma luz y paleta, como planos de una misma pieza." : "",
    conFotos ? "Una de las referencias es la foto real del producto: si aparece, que sea ese producto, igual." : "",
    plano.texto ? `Texto en pantalla, EXACTO y legible, corto y bien colocado: ${comillas(plano.texto)}. Ningún otro texto.` : "Sin texto en pantalla.",
  ].filter(Boolean).join("\n\n").slice(0, 3800);
}

/** Los fotogramas que van al video como storyboard: todos si caben; si no, repartidos (siempre el primero y el último). Pura. */
export function fotogramasParaVideo(fotogramas = [], max = MAX_STORYBOARD) {
  const lista = fotogramas.filter(Boolean);
  if (lista.length <= max) return lista;
  if (max <= 1) return lista.slice(0, max);
  return Array.from({ length: max }, (_, k) => lista[Math.round((k * (lista.length - 1)) / (max - 1))]);
}

/**
 * El pedido del VIDEO: los planos con sus tiempos, el hilo, el sonido y el estilo; con storyboard, que las imágenes
 * de referencia son los fotogramas EN ORDEN. Pura.
 */
export function promptDeReel({ planos = [], hilo = "", sonido = "", segundos = 10, estilo = "", conStoryboard = false, personajes = "" }) {
  return [
    `Reel vertical 9:16 de ${segundos} segundos, con varios planos y cortes limpios, calidad de anuncio profesional.`,
    conStoryboard ? "Las imágenes de referencia son el STORYBOARD, en orden: cada una es un plano. Respeta sus personajes, su lugar, su luz, su paleta y su texto." : "",
    personajes,
    hilo ? `Lo que comparten todos los planos: ${hilo}` : "",
    ...planos.map((p) => `${tramo(p)} ${p.escena}${p.camara ? ` Cámara: ${p.camara}.` : ""}${p.texto ? ` Texto en pantalla, exacto: ${comillas(p.texto)}.` : ""}`),
    sonido ? `Sonido: ${sonido}` : "",
    estilo,
  ].filter(Boolean).join("\n").slice(0, 4000);
}

/** «Del segundo X al Y: …» sobre un video hecho: cambia SÓLO ese tramo. Pura. */
export function promptDeTramo({ desde = 0, hasta = 10, cambio = "" }) {
  const c = corto(cambio, 500).replace(/[.\s]+$/, "");
  return `Corrige este video SOLO del segundo ${desde} al ${hasta}: ${c}. Conserva todo lo demás exactamente igual: los otros planos, los personajes, el texto en pantalla, la música y la duración.`;
}
