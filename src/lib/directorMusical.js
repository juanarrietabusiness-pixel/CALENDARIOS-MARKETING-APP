// ============================================================
// El DIRECTOR MUSICAL del video animado (puro: lo usa el Worker; la llamada, en worker/lib/estudio/directorMusical.js)
//
// La música de Suno salía genérica: el estilo era el `guion.musica.estilo` que escribió la IA del guion en una línea
// («música corporativa alegre») sin saber nada del video ni de la marca. Ahora, antes de pedirla, una IA de texto LEE
// el video ya hecho y escribe el pedido para Suno. Lo que se puede contar, lo cuenta el CÓDIGO (aquí), no la IA:
//
//   · `analisisDelVideo`: la línea de tiempo de verdad (con la locución, si la hay; si no, estimada) → cuánto dura
//     cada escena, cuántos cortes por minuto, el BPM que casa con esos cortes (`bpmPorCortes`: un compás de cuatro
//     tiempos por escena, dentro del rango del ritmo del guion), dónde están los silencios y dónde entran el gancho,
//     el beneficio y el llamado;
//   · `pedidoDeDirectorMusical`: lo que se le manda a la IA, con LA MÚSICA DE LA MARCA delante (`kit.musica`: la
//     escribió la agencia y manda sobre todo) y las que ya gustaron (las «Me gusta esta» de «Sonido»);
//   · `leerPropuestaMusical`: su respuesta, limpia. El estilo va en INGLÉS (las etiquetas que mejor entiende Suno),
//     siempre con su BPM; se le quitan los nombres de artistas («in the style of…»: Suno los rechaza y sería copiar)
//     y las voces del «evitar» (las pone la aplicación al pedir una instrumental, `cuerpoSuno`);
//   · `propuestaDeRespaldo`: si la IA no contesta, la música de la marca o la pista del guion con el tempo de los
//     cortes. Nunca deja a nadie sin poder pedir la música.
// ============================================================

import { lineaDeTiempo, NOMBRE_TIPO_ESCENA } from "./videoEscenas.js";

/** Lo más que ocupa cada campo de la propuesta. */
export const TOPES_PROPUESTA = Object.freeze({ estilo: 600, evitar: 150, titulo: 60, genero: 160, instrumentos: 200, energia: 300, porque: 300 });
/** El rango de BPM según el ritmo del guion (`estilo.ritmo`). */
export const RANGO_BPM = Object.freeze({ calmado: [70, 100], medio: [88, 118], rapido: [108, 140] });
/** Lo mínimo para que un hueco sin voz cuente como silencio (s). */
const MIN_SILENCIO = 0.5;
/** Lo que se le pasa de cada escena a la IA. */
const MAX_HABLA_ESCENA = 140;

const limpio = (s, tope) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, tope);
const r1 = (n) => Math.round(n * 10) / 10;
const coma = (n) => String(r1(n)).replace(".", ",");

/** «0:08» (para Suno: minutos y segundos). Pura. */
export const minSeg = (s) => {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * El BPM que casa con los cortes: un compás de cuatro tiempos por escena (240 / segundos por escena), llevado al rango
 * del ritmo del guion multiplicando o dividiendo por dos (un corte sigue cayendo en un tiempo fuerte). Pura.
 */
export function bpmPorCortes(segundosPorEscena, ritmo = "medio") {
  const [lo, hi] = RANGO_BPM[ritmo] ?? RANGO_BPM.medio;
  const centro = (lo + hi) / 2;
  const s = Number(segundosPorEscena);
  if (!(s > 0)) return Math.round(centro);
  const base = 240 / s;
  const distancia = (b) => (b < lo ? lo - b : b > hi ? b - hi : 0);
  const mejor = [base / 4, base / 2, base, base * 2, base * 4]
    .sort((a, b) => distancia(a) - distancia(b) || Math.abs(a - centro) - Math.abs(b - centro))[0];
  return Math.round(Math.min(hi, Math.max(lo, mejor)));
}

const TIPOS_BENEFICIO = ["beneficio", "solucion", "producto", "prueba", "dato", "comparacion"];

/**
 * Lo que la música tiene que saber del video, contado por el código. `palabras`: los tiempos de la locución (los de
 * `locucion.palabras`); sin ellos, o si no cuadran con el guion, la línea de tiempo es estimada. Pura.
 * → { segundos, estimado, conVoz, escenas: [{ n, tipo, desde, hasta, dur, habla, pantalla, transicion }],
 *     segundosPorEscena, cortesPorMinuto, ritmo, bpm, rango, silencios: [{ desde, hasta }], momentos: { gancho,
 *     beneficio, llamado }, palabrasPorSegundo, transiciones: { tipo: n }, paleta, ilustracion, titulo, pista }
 */
export function analisisDelVideo(guion, { palabras = null } = {}) {
  const lista = Array.isArray(guion?.escenas) ? guion.escenas : [];
  const linea = lineaDeTiempo(guion, palabras);
  const escenas = lista.map((e, i) => {
    const t = linea.escenas[i] ?? { desde: 0, hasta: 0, palabras: [] };
    return {
      n: i + 1, tipo: e.tipo, desde: t.desde, hasta: t.hasta, dur: r1(t.hasta - t.desde),
      habla: limpio(e.habla, MAX_HABLA_ESCENA), pantalla: limpio(e.pantalla, 80),
      transicion: i > 0 ? (e.transicion?.tipo ?? "corte") : "", palabras: t.palabras ?? [],
    };
  });
  const segundos = linea.total;
  const segundosPorEscena = escenas.length ? segundos / escenas.length : 0;
  const ritmo = RANGO_BPM[guion?.estilo?.ritmo] ? guion.estilo.ritmo : "medio";
  // Los huecos sin voz: lo que queda de cada escena detrás de su última palabra (o la escena entera si no habla).
  const silencios = [];
  for (const e of escenas) {
    const ultima = e.palabras.length ? e.palabras[e.palabras.length - 1].hasta : e.desde;
    if (e.hasta - ultima >= MIN_SILENCIO) silencios.push({ desde: r1(ultima), hasta: r1(e.hasta) });
  }
  const gancho = escenas.find((e) => e.tipo === "gancho") ?? escenas[0] ?? null;
  const beneficio = escenas.find((e, i) => i > 0 && TIPOS_BENEFICIO.includes(e.tipo)) ?? null;
  const cierres = escenas.filter((e) => e.tipo === "cierre");
  const llamado = cierres[cierres.length - 1] ?? escenas[escenas.length - 1] ?? null;
  const nPalabras = escenas.reduce((n, e) => n + e.palabras.length, 0);
  const hablado = escenas.reduce((n, e) => n + (e.palabras.length ? e.palabras[e.palabras.length - 1].hasta - e.palabras[0].desde : 0), 0);
  const transiciones = {};
  for (const e of escenas) if (e.transicion) transiciones[e.transicion] = (transiciones[e.transicion] ?? 0) + 1;
  return {
    segundos: r1(segundos), estimado: linea.estimado, conVoz: Boolean(nPalabras) && !linea.estimado,
    escenas: escenas.map((e) => ({ n: e.n, tipo: e.tipo, desde: r1(e.desde), hasta: r1(e.hasta), dur: e.dur, habla: e.habla, pantalla: e.pantalla, transicion: e.transicion })),
    segundosPorEscena: r1(segundosPorEscena),
    cortesPorMinuto: segundos > 0 ? Math.round(((escenas.length - 1) / segundos) * 60) : 0,
    ritmo, bpm: bpmPorCortes(segundosPorEscena, ritmo), rango: RANGO_BPM[ritmo],
    silencios,
    momentos: {
      gancho: gancho ? { desde: r1(gancho.desde), hasta: r1(gancho.hasta) } : null,
      beneficio: beneficio ? { desde: r1(beneficio.desde) } : null,
      llamado: llamado ? { desde: r1(llamado.desde) } : null,
    },
    palabrasPorSegundo: hablado > 0 ? r1(nPalabras / hablado) : 0,
    transiciones,
    paleta: guion?.estilo?.paleta ?? {},
    ilustracion: guion?.estilo?.ilustracion ?? "",
    titulo: limpio(guion?.titulo, 120),
    pista: limpio(guion?.musica?.estilo, 300),
  };
}

/** El video contado para la IA, en líneas. Pura. */
export function textoDelVideo(a) {
  const tr = Object.entries(a.transiciones).map(([t, n]) => `${t} ×${n}`).join(", ");
  const paleta = Object.entries(a.paleta).map(([k, v]) => `${k} ${v}`).join(", ");
  const escenas = a.escenas.map((e) => [
    `  ${e.n}. ${coma(e.desde)}–${coma(e.hasta)} s · ${NOMBRE_TIPO_ESCENA[e.tipo] ?? e.tipo}`,
    e.habla ? `dice «${e.habla}»` : "sin voz",
    e.pantalla ? `se lee «${e.pantalla}»` : "",
    e.transicion ? `entra con ${e.transicion}` : "",
  ].filter(Boolean).join(" · "));
  const m = a.momentos;
  return [
    a.titulo ? `Título: ${a.titulo}` : "",
    `Duración: ${coma(a.segundos)} s (${a.conVoz ? "medida con la locución real" : "ESTIMADA: aún no tiene la voz; puede variar un poco"}).`,
    `Escenas: ${a.escenas.length}, una cada ${coma(a.segundosPorEscena)} s de media (≈ ${a.cortesPorMinuto} cortes por minuto). Ritmo del guion: ${a.ritmo}.`,
    `BPM que casa con los cortes: ${a.bpm} (rango para ese ritmo: ${a.rango[0]}–${a.rango[1]}).`,
    a.palabrasPorSegundo ? `La voz habla a ${coma(a.palabrasPorSegundo)} palabras por segundo.` : "",
    tr ? `Transiciones: ${tr}.` : "",
    a.ilustracion ? `Ilustración: ${a.ilustracion}.` : "",
    paleta ? `Paleta del video: ${paleta}.` : "",
    "Escena a escena (segundos del video):",
    ...escenas,
    a.silencios.length ? `Silencios (sin voz: ahí la música se oye más): ${a.silencios.map((s) => `${coma(s.desde)}–${coma(s.hasta)} s`).join(", ")}.` : "",
    `Momentos: ${[
      m.gancho ? `el gancho ${coma(m.gancho.desde)}–${coma(m.gancho.hasta)} s` : "",
      m.beneficio ? `el beneficio desde ${coma(m.beneficio.desde)} s` : "",
      m.llamado ? `el llamado a la acción desde ${coma(m.llamado.desde)} s` : "",
    ].filter(Boolean).join("; ")}.`,
  ].filter(Boolean).join("\n");
}

/** La música de la marca (`kit.musica`) contada para la IA; vacía si la agencia no escribió nada. Pura. */
export function lineaDeMusicaDeMarca(m) {
  if (!m) return "";
  const refs = (m.referencias ?? []).filter((r) => r?.estilo);
  if (!m.estilo && !m.evitar && !refs.length) return "";
  return [
    "LA MÚSICA DE LA MARCA (la decidió la agencia: MANDA sobre todo lo demás; si choca con el video, gana ella):",
    m.estilo ? `- Estilo: ${m.estilo}` : "",
    m.evitar ? `- Nunca: ${m.evitar}` : "",
    refs.length ? `- Músicas que ya gustaron a la marca (sigue su línea sin copiarlas palabra por palabra):\n${refs.map((r) => `  · ${r.titulo ? `«${r.titulo}»: ` : ""}${r.estilo}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Lo que se le pide a la IA. `cliente`: { rubro, descripcion, audiencia, estiloLocucion }; `kit`: { musica, paleta
 * (texto), estilo, luz }; `voz`: «Matilda (cálida, cercana)»; `tipo`: el tipo de contenido de su publicación;
 * `ficha`: lo que dice el cerebro (sin lo interno). Pura.
 */
export function pedidoDeDirectorMusical({ marca = "la marca", analisis, cliente = {}, kit = {}, voz = "", tipo = "", ficha = "", imagenes = 0 }) {
  // Un video SIN voz (una foto o un carrusel con música): la música es lo único que suena y manda.
  const sinVoz = !(analisis?.escenas ?? []).some((e) => e.habla);
  const marcaMusica = lineaDeMusicaDeMarca(kit.musica);
  const delCliente = [
    cliente.rubro ? `- Rubro: ${limpio(cliente.rubro, 120)}` : "",
    cliente.descripcion ? `- Qué es: ${limpio(cliente.descripcion, 500)}` : "",
    cliente.audiencia ? `- Su público: ${limpio(cliente.audiencia, 400)}` : "",
    cliente.estiloLocucion ? `- Cómo suena su locución: ${limpio(cliente.estiloLocucion, 300)}` : "",
    voz ? `- La voz de este video: ${voz}` : "",
    kit.estilo ? `- Su estilo visual: ${limpio(kit.estilo, 300)}` : "",
    kit.luz ? `- Su luz: ${limpio(kit.luz, 200)}` : "",
    kit.paleta ? `- Su paleta: ${limpio(kit.paleta, 400)}` : "",
  ].filter(Boolean).join("\n");
  return [
    sinVoz
      ? `Eres el DIRECTOR MUSICAL de la agencia Juancito Ads. Escribes el pedido para Suno (V6, modo personalizado) de la música de UN video YA HECHO de «${marca}» SIN voz: la música es lo único que suena, así que lleva la emoción entera (puede tener una melodía protagonista).`
      : `Eres el DIRECTOR MUSICAL de la agencia Juancito Ads. Escribes el pedido para Suno (V6, modo personalizado) de la música de fondo de UN video animado YA HECHO de «${marca}». La música va DEBAJO de una locución en español y baja sola mientras se habla: acompaña, no compite.`,
    imagenes
      ? `MIRA ${imagenes === 1 ? "la imagen de arriba: es lo que se ve en el video" : `las ${imagenes} imágenes de arriba: son lo que se ve en el video, en orden`}. La música tiene que CASAR con lo que se ve: su ambiente, sus colores, el producto, la emoción y el público que sugiere (no es lo mismo una cuna de bebé que unas zapatillas de correr). Dilo en «porque».`
      : "",
    marcaMusica,
    delCliente ? `EL CLIENTE:\n${delCliente}` : "",
    ficha ? `LO QUE DICE SU CEREBRO (la ficha de la marca):\n${limpio(ficha, 3000)}` : "",
    `EL VIDEO:\n${tipo ? `Tipo de contenido: ${tipo}.\n` : ""}${textoDelVideo(analisis)}`,
    analisis.pista ? `Lo que el guion dijo de la música (sólo una pista, suele ser genérica): «${analisis.pista}»` : "",
    [
      "CÓMO DECIDES:",
      "- Género Y subgénero concretos (nada de «música corporativa» ni «alegre» a secas): p. ej. «indie folk acústico», «lo-fi house cálido», «synth-pop minimalista», «bossa nova moderna».",
      `- El BPM casa con los cortes: que cada corte caiga en un tiempo fuerte. Usa ${analisis.bpm} salvo que la marca o el tono pidan otro dentro de ${analisis.rango[0]}–${analisis.rango[1]}.`,
      "- De 3 a 5 instrumentos concretos, pocos: deja sitio a la voz (nada de solos ni de melodías protagonistas en el registro de la voz).",
      "- La energía sigue al video y lo dices con los segundos: intro suave bajo el gancho, sube en el beneficio, cierre limpio en el llamado; en los silencios la música puede respirar.",
      "- La atmósfera, con dos o tres palabras que casen con la marca, su paleta y su público.",
      "- NUNCA nombres de artistas, bandas, canciones ni «al estilo de…»: Suno los rechaza y sería copiar.",
      "- En «evitar», lo que choque con la marca o tape la voz (p. ej. heavy distortion, aggressive drops, busy hi-hats). No pongas voces ahí: la aplicación las quita sola.",
    ].join("\n"),
    [
      "RESPONDE SÓLO con este JSON:",
      `{"estilo": "en INGLÉS, etiquetas separadas por comas que entiende Suno: género y subgénero, atmósfera, instrumentos, «N BPM» y cómo evoluciona la energía con los segundos (≤ ${TOPES_PROPUESTA.estilo} caracteres)",`,
      ` "evitar": "en INGLÉS, separado por comas (≤ ${TOPES_PROPUESTA.evitar})",`,
      ` "bpm": ${analisis.bpm},`,
      ' "genero": "en español: género y subgénero",',
      ' "instrumentos": "en español",',
      ' "energia": "en español: cómo evoluciona, con los segundos",',
      ` "titulo": "un nombre corto en español (≤ ${TOPES_PROPUESTA.titulo})",`,
      ' "porque": "UNA frase en español: por qué esta música le va a este video y a esta marca"}',
    ].join("\n"),
  ].filter(Boolean).join("\n\n");
}

/** Las referencias a artistas o canciones, fuera («in the style of X», «like Coldplay», «inspired by…»). Pura. */
export function sinArtistas(texto) {
  return String(texto ?? "")
    .replace(/\b(?:in the style of|style of|inspired by|reminiscent of|a la manera de|al estilo de|à la)\s+[^,.;]+/gi, "")
    .replace(/\b(?:[Ss]ounds? [Ll]ike|[Ll]ike|[Bb]y)\s+(?=[A-Z])[^,.;]+/g, "")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\s*,\s*(?:,\s*)+/g, ", ")
    .replace(/^[\s,.;]+|[\s,;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Las voces no van en «evitar» de la propuesta: las añade `cuerpoSuno` sólo si es instrumental. */
const VOCES = /^(?:no\s+)?(?:vocals?|singing|singer|voices?|lyrics|spoken word|choir|humming)$/i;

/** Junta listas separadas por comas sin repetir (lo de la marca primero). Pura. */
function juntarEvitar(...listas) {
  const vistos = new Set();
  const salida = [];
  for (const l of listas) {
    for (const x of String(l ?? "").split(/[,;\n]/).map((s) => limpio(s, 60)).filter(Boolean)) {
      const k = x.toLowerCase();
      if (VOCES.test(x) || vistos.has(k)) continue;
      vistos.add(k);
      salida.push(x);
    }
  }
  let t = "";
  for (const x of salida) {
    const siguiente = t ? `${t}, ${x}` : x;
    if (siguiente.length > TOPES_PROPUESTA.evitar) break;
    t = siguiente;
  }
  return t;
}

const BPM_EN_TEXTO = /\b\d{2,3}\s*bpm\b/i;
const leerJSON = (texto) => {
  const t = String(texto ?? "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};

/**
 * La respuesta de la IA, limpia → la propuesta, o null si no trae un estilo. El BPM fuera de 50–200 se cambia por el
 * de los cortes, y si el estilo no lo dice se le añade; el «evitar» de la marca va siempre. Pura.
 * → { estilo, evitar, instrumental, titulo, bpm, genero, instrumentos, energia, porque, duracion }
 */
export function leerPropuestaMusical(texto, { analisis, kitMusica = null } = {}) {
  const d = leerJSON(texto);
  if (!d || typeof d !== "object") return null;
  let estilo = sinArtistas(limpio(d.estilo, TOPES_PROPUESTA.estilo));
  if (!estilo) return null;
  const n = Math.round(Number(d.bpm));
  const bpm = n >= 50 && n <= 200 ? n : analisis?.bpm ?? 100;
  if (!BPM_EN_TEXTO.test(estilo)) estilo = `${estilo}, ${bpm} BPM`.slice(0, TOPES_PROPUESTA.estilo + 10);
  const titulo = sinArtistas(limpio(d.titulo, TOPES_PROPUESTA.titulo)) || tituloDe(analisis);
  return {
    estilo,
    evitar: juntarEvitar(kitMusica?.evitar, d.evitar),
    instrumental: true,
    titulo,
    bpm,
    genero: limpio(d.genero, TOPES_PROPUESTA.genero),
    instrumentos: limpio(Array.isArray(d.instrumentos) ? d.instrumentos.join(", ") : d.instrumentos, TOPES_PROPUESTA.instrumentos),
    energia: limpio(d.energia, TOPES_PROPUESTA.energia),
    porque: limpio(d.porque, TOPES_PROPUESTA.porque),
    duracion: duracionDe(analisis),
  };
}

const tituloDe = (a) => (a?.titulo ? `Música de «${limpio(a.titulo, 40)}»` : "Música del video");
const duracionDe = (a) => Math.max(10, Math.min(360, Math.ceil(Number(a?.segundos) || 30)));

/** Lo que suena por defecto según el ritmo del guion, si no hay ni marca ni pista. */
const GENERO_POR_RITMO = Object.freeze({
  calmado: "warm ambient acoustic, soft piano, gentle pads, light guitar",
  medio: "modern light pop, acoustic guitar, soft percussion, warm bass",
  rapido: "upbeat electronic pop, punchy drums, bright synths, round bass",
});

/**
 * La propuesta sin IA (no contestó, sin llave, sin presupuesto): la música de la marca o la pista del guion con el
 * tempo de los cortes y la energía de sus momentos. Pura.
 */
export function propuestaDeRespaldo(analisis, { kitMusica = null } = {}) {
  const base = limpio(kitMusica?.estilo, 400) || analisis.pista || GENERO_POR_RITMO[analisis.ritmo] || GENERO_POR_RITMO.medio;
  const m = analisis.momentos;
  const energia = [
    "soft intro under the hook",
    m.beneficio ? `builds at ${minSeg(m.beneficio.desde)}` : "builds in the middle",
    m.llamado ? `resolves at ${minSeg(m.llamado.desde)}` : "resolves at the end",
    "clean ending",
  ].join(", ");
  const estilo = sinArtistas(BPM_EN_TEXTO.test(base) ? `${base}, ${energia}` : `${base}, ${analisis.bpm} BPM, ${energia}`);
  return {
    estilo: estilo.slice(0, TOPES_PROPUESTA.estilo),
    evitar: juntarEvitar(kitMusica?.evitar, "heavy distortion, aggressive drops"),
    instrumental: true,
    titulo: tituloDe(analisis),
    bpm: analisis.bpm,
    genero: "", instrumentos: "", energia: "",
    porque: kitMusica?.estilo
      ? "Es la música de la marca con el tempo de los cortes del video."
      : analisis.pista ? "Es la música que dice el guion con el tempo de los cortes del video." : "Una base neutra con el tempo de los cortes del video.",
    duracion: duracionDe(analisis),
    deRespaldo: true,
  };
}

/** La huella de lo que decide la propuesta (el guion, si hay voz y la música de la marca): FNV-1a de 32 bits. Pura. */
export function huellaMusical(guion, { palabras = null, kitMusica = null } = {}) {
  const t = JSON.stringify({
    e: (guion?.escenas ?? []).map((e) => [e.id, e.tipo, e.habla, e.pantalla, e.pausa, e.transicion?.tipo]),
    s: guion?.estilo?.ritmo ?? "", m: guion?.musica?.estilo ?? "", t: guion?.titulo ?? "",
    v: Array.isArray(palabras) ? palabras.length : 0, f: Array.isArray(palabras) && palabras.length ? palabras[palabras.length - 1]?.hasta ?? 0 : 0,
    k: kitMusica ?? null,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
