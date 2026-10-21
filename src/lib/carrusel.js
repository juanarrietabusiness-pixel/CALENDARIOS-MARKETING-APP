// ============================================================
// El carrusel por láminas (puro)
//
// Un carrusel con guion se crea lámina a lámina: el guion se parte en
// láminas (portada, una por idea, cierre), y cada una se pide al Estudio
// con las ANTERIORES de referencia —la primera y la de justo antes— para
// que todas parezcan de la misma serie: mismo fondo, paleta, letra y
// márgenes. Pedirlas todas a la vez salía con cada lámina de un estilo.
//
// El texto de cada lámina, de dos formas:
//   · «ia»: lo escribe el modelo (Nano Banana lo hace bien), EXACTO.
//   · «plantilla»: el modelo deja el hueco limpio y el texto se pone
//     encima con la letra y los colores del kit (lib/textoSobreImagen.js):
//     sin una sola falta, a costa de un acabado más sencillo.
//
// Lo que toca el Estudio y el lienzo vive en los componentes; aquí, qué
// se pide y cómo se coloca.
// ============================================================

export const MAX_LAMINAS = 10; // lo que admite un carrusel de Instagram
const MAX_TEXTO = 400;

/** Los dos modos del texto de una lámina. */
export const MODOS_TEXTO = Object.freeze({
  ia: { nombre: "Lo escribe la IA", ayuda: "Nano Banana pone el texto con el diseño. Revisa cada lámina: puede equivocarse en una letra." },
  plantilla: { nombre: "Plantilla con mi texto", ayuda: "La IA deja el hueco y el texto se pone encima con los colores del kit: exacto, sin faltas." },
});

/** Dónde va el texto en el modo plantilla. `zona` es lo que se le pide al modelo que deje libre. */
export const PLANTILLAS_TEXTO = Object.freeze({
  banda: { nombre: "Banda abajo", zona: "el tercio inferior" },
  arriba: { nombre: "Titular arriba", zona: "el tercio superior" },
  centro: { nombre: "Tarjeta al centro", zona: "el centro de la lámina" },
  degradado: { nombre: "Texto sobre degradado", zona: "el cuarto inferior, con zonas tranquilas y sin objetos importantes" },
});

// «Portada:», «Slide 2:», «Lámina 3 —», «**Diapositiva 4.**», «CTA:», «Cierre (lámina 6):»…
const ETIQUETA = /^\s*(?:[-*•]\s*)?(?:\*\*)?\s*(portada|slide|l[aá]mina|diapositiva|tarjeta|cta|cierre|final|p[aá]gina)\b\s*(\d+)?\s*(?:\([^)]*\))?\s*(?:\*\*)?\s*[:.\-–—]\s*(?:\*\*)?\s*/i;
const NUMERADA = /^\s*(\d{1,2})\s*[.)-]\s+/;

const limpio = (t) => String(t ?? "").replace(/\*\*/g, "").replace(/[ \t]+\n/g, "\n").trim().slice(0, MAX_TEXTO);

/** Qué es cada lámina: la primera, la portada; la última con «CTA»/«cierre» (o la última de 3+), el cierre. */
function conRoles(textos, etiquetas = []) {
  return textos.map((texto, i) => {
    const e = String(etiquetas[i] ?? "").toLowerCase();
    const rol = i === 0 ? "portada"
      : /cta|cierre|final/.test(e) || (i === textos.length - 1 && textos.length >= 3 && !e) ? "cierre" : "contenido";
    return { n: i + 1, rol, texto };
  });
}

/**
 * El guion de un carrusel → [{ n, rol, texto }]. Entiende «Portada: … / Slide 1: … / CTA: …» (lo que escribe la
 * IA), las láminas separadas por «---», las numeradas («1. …») y, si no, los párrafos. Hasta MAX_LAMINAS. Pura.
 */
export function partirGuion(guion) {
  const t = String(guion ?? "").replace(/\r/g, "").trim();
  if (!t) return [];
  const lineas = t.split("\n");

  // 1. Con etiquetas: cada etiqueta abre una lámina y lo de debajo es suyo.
  if (lineas.some((l) => ETIQUETA.test(l))) {
    const bloques = [];
    for (const l of lineas) {
      const m = l.match(ETIQUETA);
      if (m) bloques.push({ etiqueta: m[1], texto: l.slice(m[0].length) });
      else if (bloques.length) bloques[bloques.length - 1].texto += `\n${l}`;
      else if (l.trim()) bloques.push({ etiqueta: "", texto: l }); // lo de antes de la primera etiqueta
    }
    const validos = bloques.map((b) => ({ ...b, texto: limpio(b.texto) })).filter((b) => b.texto).slice(0, MAX_LAMINAS);
    return conRoles(validos.map((b) => b.texto), validos.map((b) => b.etiqueta));
  }
  // 2. Separadas por «---».
  if (/^\s*-{3,}\s*$/m.test(t)) {
    return conRoles(t.split(/^\s*-{3,}\s*$/m).map(limpio).filter(Boolean).slice(0, MAX_LAMINAS));
  }
  // 3. Numeradas.
  if (lineas.filter((l) => NUMERADA.test(l)).length >= 2) {
    const bloques = [];
    for (const l of lineas) {
      if (NUMERADA.test(l)) bloques.push(l.replace(NUMERADA, ""));
      else if (bloques.length) bloques[bloques.length - 1] += `\n${l}`;
    }
    return conRoles(bloques.map(limpio).filter(Boolean).slice(0, MAX_LAMINAS));
  }
  // 4. Por párrafos.
  return conRoles(t.split(/\n\s*\n/).map(limpio).filter(Boolean).slice(0, MAX_LAMINAS));
}

/** El texto de una lámina partido para la plantilla: la primera línea (o frase) es el titular; lo demás, apoyo. Pura. */
export function titularYApoyo(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return { titular: "", apoyo: "" };
  const [primera, ...resto] = t.split("\n");
  if (resto.length) return { titular: primera.trim(), apoyo: resto.join(" ").replace(/\s+/g, " ").trim() };
  // Una sola línea larga: la primera frase de titular, si la hay.
  const m = t.match(/^(.{8,90}?[.!?¿¡:])\s+(.+)$/s);
  return m ? { titular: m[1].trim(), apoyo: m[2].trim() } : { titular: t, apoyo: "" };
}

/**
 * Las referencias de una lámina, por orden de importancia, hasta `max` (lo que admita el modelo): la anterior (la
 * continuidad), la portada (el ancla del estilo), las fotos del producto y el LOGO, que tiene su hueco reservado
 * (el último) en cuanto el modelo admite dos. Antes iba «si cabe»: con la anterior, la portada y una foto ya no cabía
 * en ningún modelo de 3, y los carruseles salían sin logo. Sin repetir. Pura.
 */
export function referenciasDeLamina({ anterior = "", portada = "", fotos = [], logo = "", max = 3 } = {}) {
  const tope = Math.max(0, max);
  const salida = [];
  for (const k of [anterior, portada, ...fotos]) if (k && k !== logo && !salida.includes(k)) salida.push(k);
  if (!logo || tope < 2) return [...salida, ...(logo ? [logo] : [])].slice(0, tope);
  return [...salida.slice(0, tope - 1), logo];
}

const comillas = (texto) => String(texto ?? "").split(/\n+/).map((l) => l.replace(/["“”«»]/g, "").trim()).filter(Boolean)
  .map((l) => `"${l.slice(0, 120)}"`).join(" / ");

/**
 * Lo que se le pide al motor para UNA lámina. `preset` es el estilo de la marca (kit: tipo, estilo visual y marca),
 * `conAnteriores` si van las láminas anteriores de referencia, `conFotos` si va la foto del producto. Con la
 * PROPUESTA del director de arte, cada lámina trae además qué se ve (`escena`), su composición y el hilo que comparten
 * todas (`hilo`); `personajes`, las líneas de quién es cada personaje que va de referencia. Pura.
 */
export function pedidoDeLamina({ lamina, total, idea = "", preset = "", modo = "ia", plantilla = "banda", conAnteriores = false, conFotos = false, conLogo = false, hilo = "", personajes = "", sistema = "" }) {
  const rol = { portada: "la PORTADA: tiene que detener el scroll", cierre: "el CIERRE: invita a actuar", contenido: "una lámina de contenido" }[lamina.rol] ?? "una lámina";
  const zona = PLANTILLAS_TEXTO[plantilla]?.zona ?? PLANTILLAS_TEXTO.banda.zona;
  return [
    `Lámina ${lamina.n} de ${total} de un carrusel de Instagram, vertical 4:5. Es ${rol}.`,
    lamina.escena ? `Qué se ve en esta lámina: ${String(lamina.escena).slice(0, MAX_ESCENA_LAMINA)}` : "",
    lamina.composicion ? `Composición de esta lámina: ${String(lamina.composicion).slice(0, 200)}` : "",
    preset,
    idea ? `Tema del carrusel: ${String(idea).slice(0, 300)}` : "",
    hilo ? `Lo que comparten TODAS las láminas: ${String(hilo).slice(0, 300)}` : "",
    personajes,
    conAnteriores
      ? "Las imágenes de referencia incluyen las láminas anteriores de este MISMO carrusel: conserva exactamente su estilo, fondo, paleta, tipografía, márgenes y personajes, como piezas de una misma serie. Cambia sólo el contenido de esta lámina."
      : "Define un estilo limpio y reconocible: las siguientes láminas lo van a repetir.",
    // El sistema de la portada aprobada, en palabras (src/lib/sistemaCarrusel.js): la referencia sola dice «algo así».
    sistema,
    conFotos ? "Una de las referencias es la foto real del producto: si aparece, que sea ese producto, igual." : "",
    // Sin decirlo, el logo de referencia era una imagen más y el modelo no lo ponía.
    conLogo
      ? `La ÚLTIMA imagen de referencia es el logo de la marca: ponlo en esta lámina, pequeño y nítido, en el mismo sitio en todas las láminas (una esquina, sin tapar el texto), copiado tal cual —forma, colores y letras—, sin redibujarlo ni inventar otro.${lamina.rol === "portada" || lamina.rol === "cierre" ? " En esta lámina es obligatorio." : ""}`
      : "",
    modo === "plantilla"
      ? `NO escribas ningún texto, letra ni número en la imagen: el texto se pone después. Deja ${zona} limpio y despejado, con buen contraste, para ese texto.\nLo que dice esta lámina (sólo para inspirar la imagen): ${String(lamina.texto).slice(0, 300)}`
      : `Escribe en la lámina este texto, EXACTO, legible y bien jerarquizado (lo primero grande, lo demás más pequeño): ${comillas(lamina.texto)}. Ningún otro texto.`,
  ].filter(Boolean).join("\n\n").slice(0, 3800);
}

// ------------------------------------------------------------
// La contrapropuesta del director de arte (texto)
// ------------------------------------------------------------

export const MAX_ESCENA_LAMINA = 300;

/**
 * Lo que se le pide a la IA: el guion (o el tema) convertido en un plan lámina por lámina que entienda quien lo va a
 * generar (como la contrapropuesta que hacía Flow): qué se ve, el texto EXACTO con su jerarquía y la composición, y
 * el hilo visual que comparten todas. `laminas`: las del guion (`partirGuion`); sin guion, la IA escribe de 5 a 7 desde
 * el tema. Pura.
 */
export function pedidoDePropuesta({ marca = "la marca", rubro = "", laminas = [], tema = "", tipo = "", estilo = "", producto = "", personajes = [], identidad = "" }) {
  const conGuion = laminas.length >= 2;
  return [
    `Eres director de arte de una agencia. Prepara un carrusel de Instagram (4:5) de ${marca}${rubro ? ` (${rubro})` : ""} para un generador de imágenes que hará las láminas UNA a una, cada una con la anterior de referencia.`,
    conGuion ? "Convierte este guion en un plan lámina por lámina. Respeta su orden y sus datos; puedes acortar un texto que no quepa en una lámina, sin cambiar precios ni cifras:" : `No hay guion: escribe de 5 a 7 láminas sobre este tema: ${String(tema).slice(0, 400)}`,
    conGuion ? laminas.map((l) => `${l.n}. (${l.rol}) ${String(l.texto).replace(/\s+/g, " ").slice(0, 400)}`).join("\n") : "",
    conGuion && tema ? `Tema: ${String(tema).slice(0, 300)}` : "",
    tipo ? `Tipo de pieza: ${tipo}.` : "",
    estilo ? `Estilo visual: ${estilo}` : "",
    producto ? `Producto: ${producto}` : "",
    personajes.length ? `Personajes de la marca (salen IGUAL en todas las láminas donde aparezcan): ${personajes.join("; ")}` : "",
    identidad ? `Identidad de la marca: ${String(identidad).slice(0, 600)}` : "",
    "",
    "Para cada lámina:",
    `- "escena": qué se VE, en una o dos frases concretas (sujeto, acción, lugar, luz, encuadre). Sin texto dentro. ${MAX_ESCENA_LAMINA} caracteres.`,
    '- "texto": lo que va ESCRITO, como mucho tres líneas cortas separadas por «\\n»: la primera es el titular (grande); las demás, el apoyo. Corto: se tiene que leer en dos segundos.',
    '- "composicion": dónde va el sujeto y dónde el texto, en una frase. Distinta en cada lámina, con el mismo hilo visual.',
    "La portada detiene el scroll; las de en medio cuentan una idea cada una; el cierre invita a actuar.",
    "",
    'Responde SOLO con JSON: {"hilo":"lo que comparten todas (fondo, luz, paleta, personaje), en una frase","laminas":[{"n":1,"rol":"portada","escena":"…","texto":"…","composicion":"…"}]}',
  ].filter((l) => l !== "").join("\n");
}

/** La respuesta → { hilo, laminas: [{ n, rol, escena, texto, composicion }] } (hasta MAX_LAMINAS), o null. Pura. */
export function leerPropuesta(texto) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  const lista = (Array.isArray(d?.laminas) ? d.laminas : []).map((x) => ({
    escena: String(x?.escena ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ESCENA_LAMINA),
    texto: String(x?.texto ?? "").split(/\n|\\n/).map((l) => l.trim()).filter(Boolean).slice(0, 3).join("\n").slice(0, MAX_TEXTO),
    composicion: String(x?.composicion ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
  })).filter((x) => x.escena || x.texto).slice(0, MAX_LAMINAS);
  if (lista.length < 2) return null;
  return {
    hilo: String(d?.hilo ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    laminas: lista.map((x, k) => ({ n: k + 1, rol: k === 0 ? "portada" : k === lista.length - 1 && lista.length >= 3 ? "cierre" : "contenido", ...x })),
  };
}

// ------------------------------------------------------------
// La plantilla: colores y líneas (el dibujo, en lib/textoSobreImagen.js)
// ------------------------------------------------------------

const HEX = /^#[0-9A-F]{6}$/i;
const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Negro o blanco, lo que más contraste dé sobre `hex`. Pura. */
export const textoSobre = (hex) => (HEX.test(hex) && luminancia(hex) > 0.4 ? "#111111" : "#FFFFFF");

/**
 * Los colores de la plantilla desde la paleta del kit: el fondo de la banda es el dominante (el primero), el acento
 * el segundo, y el texto el que contraste. Sin kit, negro y blanco. Pura.
 */
export function coloresPlantilla(kit) {
  const paleta = (kit?.paleta ?? []).map((c) => c?.hex).filter((h) => HEX.test(h ?? ""));
  const fondo = paleta[0] ?? "#111111";
  const acento = paleta.find((h, i) => i > 0 && Math.abs(luminancia(h) - luminancia(fondo)) > 0.2) ?? textoSobre(fondo);
  return { fondo, texto: textoSobre(fondo), acento };
}

/**
 * Parte un texto en líneas que quepan en `ancho`, palabra a palabra. `medir(texto)` devuelve el ancho (en el lienzo,
 * `ctx.measureText(t).width`). Una palabra más ancha que la línea va sola. Hasta `maxLineas`; lo que sobra se corta
 * con «…». Pura.
 */
export function partirLineas(texto, ancho, medir, maxLineas = 6) {
  const palabras = String(texto ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (actual && medir(prueba) > ancho) { lineas.push(actual); actual = p; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maxLineas) {
    const cortadas = lineas.slice(0, maxLineas);
    cortadas[maxLineas - 1] = `${cortadas[maxLineas - 1].replace(/[.,;:]?$/, "")}…`;
    return cortadas;
  }
  return lineas;
}

/** Cuánto costaría el carrusel: una imagen por lámina. Pura. */
export const costoCarrusel = (laminas, costoPorImagen) => Math.round((laminas?.length ?? 0) * (Number(costoPorImagen) || 0) * 1000) / 1000;
