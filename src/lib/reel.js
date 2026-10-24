// ============================================================
// El reel con IA de 10 segundos, como en Flow (puro)
//
//   1. La IDEA central (promoción, beneficio o idea) → el GUION por planos:
//      de 4 a 8 planos con cortes, cada uno con qué se ve y la cámara, SIN
//      texto en pantalla (videoLimpio.js: los modelos de video escriben mal y
//      deforman el logo). Más el hilo que comparten todos (personajes, luz,
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

import { SIN_TEXTO_VIDEO } from "./videoLimpio.js";

export const MIN_PLANOS = 3;
export const MAX_PLANOS = 8;
/** Lo que admite Gemini Omni como referencias (sin video): el storyboard se reparte en esos huecos. */
export const MAX_STORYBOARD = 7;
const MAX_ESCENA = 300;
const MAX_TEXTO = 60;
/** Lo que se dice cómodo en voz en off: unas 2,5 palabras por segundo. */
export const PALABRAS_POR_SEGUNDO = 2.5;
/**
 * Las duraciones del reel: 10 s con Omni, 8 s con Veo (cuesta la mitad) y, en UN solo video por API, 15, 20 y 30 s con
 * Seedance 2.5 por Kie (varios planos, música propia y el storyboard de referencia). Lo de más, en Flow.
 */
export const DURACIONES_REEL = Object.freeze([
  { segundos: 10, nombre: "10 s · Gemini Omni", modelos: ["gemini-omni-kie", "kling-3-omni-kie", "seedance-2-kie", "gemini-omni-flash"] },
  { segundos: 8, nombre: "8 s · Veo 3.1 Fast", modelos: ["veo-3-1-fast-kie"] },
  { segundos: 15, nombre: "15 s · un solo video", modelos: ["seedance-2-5-kie", "kling-3-omni-kie", "seedance-2-kie"] },
  { segundos: 20, nombre: "20 s · Seedance 2.5", modelos: ["seedance-2-5-kie"] },
  { segundos: 30, nombre: "30 s · Seedance 2.5", modelos: ["seedance-2-5-kie"] },
  // Lo más largo es para FLOW: varios clips de 10 s de Omni pegados (aquí no se crea por API).
  { segundos: 40, nombre: "40 s · Flow, 4 clips", modelos: [], soloFlow: true },
]);
/** Lo que dura un clip de Omni en Flow: un guion para Flow se parte en clips de esto. */
export const SEGUNDOS_POR_CLIP = 10;
/** Hasta dónde llega UN video por API (Seedance 2.5 por Kie). */
export const MAX_SEGUNDOS_API = 30;
/** ¿Esta duración sólo se hace en Flow (varios clips pegados)? Pura. */
export const soloFlow = (segundos) => Boolean(DURACIONES_REEL.find((d) => d.segundos === Number(segundos))?.soloFlow) || Number(segundos) > MAX_SEGUNDOS_API;
/** Cuántos planos caben: hasta 8 en 10 s, uno cada 2,5 s en un video más largo (12 como mucho); en Flow, 5 por clip. Pura. */
export const maxPlanos = (segundos = 10) => (soloFlow(segundos)
  ? Math.min(20, Math.ceil(segundos / SEGUNDOS_POR_CLIP) * 5)
  : Math.max(MAX_PLANOS, Math.min(12, Math.ceil(Number(segundos) / 2.5))));

/** ¿Este modelo inventa la voz (mal, en español)? Seedance y Wan van SIN voz: música y efectos. Pura. */
export const sinVozPropia = (modelo) => /^(seedance|wan)/.test(String(modelo?.id ?? modelo ?? ""));

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Lo que se le pide a la IA para el guion por planos. Pura. */
export function pedidoDeReel({ marca = "la marca", rubro = "", idea = "", segundos = 10, tipo = "", estilo = "", producto = "", personajes = [], identidad = "", contexto = "", musica = "", locucion = "", estructura = "" }) {
  const clips = Math.ceil(segundos / SEGUNDOS_POR_CLIP);
  return [
    `Eres director creativo de reels. Escribe el guion de UN reel vertical (9:16) de ${segundos} segundos para ${marca}${rubro ? ` (${rubro})` : ""}, para generarlo con un modelo de video con IA que hace varios planos con cortes en una sola pieza.`,
    `LA IDEA CENTRAL: ${corto(idea, 1200) || "propón una a partir de lo que sabemos de la marca"}`,
    tipo ? `Tipo de pieza: ${tipo}.` : "",
    estilo ? `Estilo visual: ${estilo}` : "",
    producto ? `Producto (precio EXACTO si se nombra): ${producto}` : "",
    personajes.length ? `Personajes de la marca (salen IGUAL en cada plano donde aparezcan): ${personajes.join("; ")}` : "",
    identidad ? `Identidad de la marca: ${corto(identidad, 600)}` : "",
    contexto ? `Lo que se sabe de la marca:\n${String(contexto).slice(0, 3000)}` : "",
    musica ? `Música que se quiere: ${corto(musica, 300)}` : "",
    locucion ? `Locución que se quiere (respétala si cabe): ${corto(locucion, 500)}` : "",
    // Un anuncio que ya funciona: su forma, no su marca ni sus palabras.
    estructura ? `ESTRUCTURA A SEGUIR (es la de un anuncio que ya funciona, de otra marca): copia su forma —el orden de los momentos, el ritmo, el tipo de gancho y de cierre— con el producto y la marca de ${marca}; nunca su marca, sus personajes ni su texto.\n${corto(estructura, 1500)}` : "",
    soloFlow(segundos) ? `Es un video LARGO que se hará en ${clips} clips de ${SEGUNDOS_POR_CLIP} s que se pegan uno tras otro: ningún plano cruza un múltiplo de ${SEGUNDOS_POR_CLIP} s (cada clip empieza en un plano nuevo), cada clip termina en un momento que enlaza con el siguiente, el gancho va en el primero y el cierre con el llamado en el último. Los personajes, la ropa, el lugar y la luz son los MISMOS en todos.` : "",
    "",
    `Reglas: de ${MIN_PLANOS + 1} a ${maxPlanos(segundos)} planos que sumen ${segundos} s exactos, contiguos desde 0. El primero detiene el scroll (gancho); el del medio muestra el producto o el resultado; el último cierra con el producto o el resultado y deja ganas de escribir (el logo y el llamado no los dibuja el modelo de video: los modelos los deforman). El video va LIMPIO: ningún plano lleva texto, letras ni subtítulos en pantalla. Nada de reseñas, cifras ni urgencias inventadas. La locución (voz en off) dura lo que el video: como mucho ${Math.floor(segundos * PALABRAS_POR_SEGUNDO)} palabras, en español latino neutro, o vacía si el reel va sólo con música.`,
    "",
    'Responde SOLO con JSON: {"hilo":"lo que comparten todos los planos (personaje, luz, paleta, lugar), en una frase","planos":[{"desde":0,"hasta":2,"escena":"qué se ve (sujeto, acción, lugar, luz)","camara":"movimiento de cámara"}],"musica":"estilo, ritmo y ánimo de la música","locucion":"lo que dice la voz en off, o vacío","efectos":"sonido ambiente o efectos, o vacío","descripcion":"el texto del post, de 2 a 4 frases, sin hashtags"}',
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
    .slice(0, maxPlanos(segundos));
  if (lista.length < MIN_PLANOS) return null;
  return {
    hilo: corto(d?.hilo, 300),
    planos: repartirTiempos(lista, segundos),
    // El sonido por partes: música, lo que dice la voz y los efectos (un guion de antes traía todo en «sonido»).
    musica: corto(d?.musica ?? (d?.locucion || d?.efectos ? "" : d?.sonido), 300),
    locucion: corto(d?.locucion, 1200),
    efectos: corto(d?.efectos, 300),
    descripcion: String(d?.descripcion ?? "").trim().slice(0, 1000),
  };
}

/**
 * Los planos llevados a otra duración (10 → 8 s): cada uno conserva su proporción del total y quedan contiguos.
 * Así cambiar a Veo de 8 s no obliga a escribir el guion otra vez. Pura.
 */
export function ajustarDuracion(planos = [], segundos = 10) {
  const total = planos.at(-1)?.hasta || planos.length || 1;
  return repartirTiempos(planos.map((p) => ({ ...p, desde: Math.round(((Number(p.desde) || 0) * segundos) / total) })), segundos);
}

/** La locución cortada a lo que cabe en `segundos` (por palabras). Pura. */
export function locucionQueCabe(texto = "", segundos = 10) {
  const palabras = String(texto ?? "").trim().split(/\s+/).filter(Boolean);
  const max = Math.floor(segundos * PALABRAS_POR_SEGUNDO);
  return palabras.length <= max ? palabras.join(" ") : `${palabras.slice(0, max).join(" ").replace(/[,;:]$/, "")}…`;
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
 * hay, que siga los anteriores. Sin texto: el fotograma enseña cómo se verá el video, y el video va limpio. Pura.
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
    SIN_TEXTO_VIDEO,
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
export function promptDeReel({ planos = [], hilo = "", sonido = "", musica = "", locucion = "", efectos = "", segundos = 10, estilo = "", conStoryboard = false, personajes = "", sinVoz = false }) {
  return [
    `Reel vertical 9:16 de ${segundos} segundos, con varios planos y cortes limpios, calidad de anuncio profesional.`,
    conStoryboard ? "Las imágenes de referencia son el STORYBOARD, en orden: cada una es un plano. Respeta sus personajes, su lugar, su luz y su paleta." : "",
    SIN_TEXTO_VIDEO,
    personajes,
    hilo ? `Lo que comparten todos los planos: ${hilo}` : "",
    ...planos.map((p) => `${tramo(p)} ${p.escena}${p.camara ? ` Cámara: ${p.camara}.` : ""}`),
    sonido ? `Sonido: ${sonido}` : "",
    musica ? `Música de fondo: ${corto(musica, 300)}.` : "",
    sinVoz ? "Sin voz ni diálogo: sólo música y efectos de sonido."
      : locucion ? `Locución en off, en español latino neutro, clara y a tiempo con los planos: «${corto(locucion, 500)}».` : "",
    efectos ? `Efectos de sonido: ${corto(efectos, 300)}.` : "",
    estilo,
  ].filter(Boolean).join("\n").slice(0, 4000);
}

/** Los planos repartidos en clips de `porClip` s (por dónde empieza cada plano) → [{ n, desde, hasta, planos }]. Pura. */
export function clipsDelGuion(planos = [], segundos = 10, porClip = SEGUNDOS_POR_CLIP) {
  const n = Math.max(1, Math.ceil(Number(segundos) / porClip));
  return Array.from({ length: n }, (_, k) => ({
    n: k + 1, desde: k * porClip, hasta: Math.min((k + 1) * porClip, segundos),
    planos: planos.filter((p) => (Number(p.desde) || 0) >= k * porClip && ((Number(p.desde) || 0) < (k + 1) * porClip || k === n - 1)),
  })).filter((c) => c.planos.length);
}

/**
 * El prompt para pegar en FLOW (Gemini Omni), en UNA sola instrucción: Flow no sabe nada de la marca, así que lleva
 * todo —la marca, el estilo, la ficha de continuidad (personajes, producto, lugar, luz), los clips con sus planos,
 * y cámara, la música, la locución y los efectos— y qué imágenes subir como ingredientes. Con más
 * de un clip, el agente de Flow los genera seguidos y cada uno continúa al anterior. Pura.
 * @param personajes [{ nombre, descripcion }]  @param producto «Nombre (precio…)»  @param ingredientes nombres de lo que se sube
 */
export function promptParaFlow({ guion = {}, marca = "la marca", rubro = "", identidad = "", estilo = "", personajes = [], producto = "", ingredientes = [] } = {}) {
  const segundos = Number(guion.segundos) || 10;
  const clips = clipsDelGuion(guion.planos ?? [], segundos);
  const varios = clips.length > 1;
  const plano = (p) => `${tramo(p)} ${String(p.escena ?? "").trim().replace(/([^.!?])$/, "$1.")}${p.camara ? ` Cámara: ${p.camara}.` : ""}`;
  return [
    varios
      ? `Crea con Gemini Omni un video vertical 9:16 de ${segundos} segundos para ${marca}${rubro ? ` (${rubro})` : ""}, en ${clips.length} clips de ${SEGUNDOS_POR_CLIP} segundos que se pegan en orden. Genera los ${clips.length} clips seguidos: cada uno continúa exactamente donde termina el anterior (mismo personaje, ropa, lugar, luz y paleta), como un solo anuncio.`
      : `Crea con Gemini Omni un video vertical 9:16 de ${segundos} segundos para ${marca}${rubro ? ` (${rubro})` : ""}, con varios planos y cortes limpios, calidad de anuncio profesional.`,
    identidad ? `\nLA MARCA (respétala en todo el video):\n${String(identidad).trim()}` : "",
    estilo ? `\nESTILO VISUAL: ${String(estilo).trim()}` : "",
    "\nCONTINUIDAD (igual en todos los planos" + (varios ? " y en todos los clips" : "") + "):",
    guion.hilo ? `- ${guion.hilo}` : "",
    ...personajes.map((p) => `- Personaje «${p.nombre}»${p.descripcion ? `: ${p.descripcion}` : ""}. Es SIEMPRE la misma persona.`),
    producto ? `- Producto: ${producto}. Es el producto real: igual en cada plano.` : "",
    ingredientes.length ? `\nIMÁGENES DE REFERENCIA (súbelas como ingredientes): ${ingredientes.join("; ")}. Cópialas tal cual; el logo, sin redibujarlo.` : "",
    "",
    ...clips.flatMap((c) => [varios ? `CLIP ${c.n} (${c.desde}–${c.hasta} s):` : "PLANOS:", ...c.planos.map(plano), ""]),
    "SONIDO (en el mismo video, a tiempo con los planos):",
    guion.musica ? `- Música de fondo: ${corto(guion.musica, 300)}.` : "- Música de fondo acorde a la marca, sin letra.",
    guion.locucion ? `- Locución en off, en español latino neutro, clara${varios ? ", repartida a lo largo de los clips" : ""}: «${corto(guion.locucion, 1200)}».` : "- Sin locución.",
    guion.efectos ? `- Efectos: ${corto(guion.efectos, 300)}.` : "",
    "",
    `REGLAS: ${SIN_TEXTO_VIDEO} Sin marcas de otros; manos, caras y producto sin deformaciones.`,
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** «Del segundo X al Y: …» sobre un video hecho: cambia SÓLO ese tramo. Pura. */
export function promptDeTramo({ desde = 0, hasta = 10, cambio = "" }) {
  const c = corto(cambio, 500).replace(/[.\s]+$/, "");
  return `Corrige este video SOLO del segundo ${desde} al ${hasta}: ${c}. Conserva todo lo demás exactamente igual: los otros planos, los personajes, la música y la duración, sin añadir texto.`;
}
