// ============================================================
// El kit de marca de un cliente y los presets del Estudio (puro)
//
// Lo que la agencia hacía a mano en Flow con un texto por marca («Paleta
// estrictamente limitada a: azul profundo #1B3246 (estructura)…, tipografía
// únicamente Montserrat, sin colores fuera de la paleta…»), aquí por cliente
// y SALIDO DE SU CEREBRO:
//
//   · el KIT (`clients.kit_marca`): paleta con el papel de cada color,
//     tipografía, estilo, luz, lo que nunca debe salir y el logo original;
//   · cuatro PRESETS —producto, anuncio, corporativo, creativo—: el texto
//     fijo que va delante de cada idea. Se escriben con la IA a partir del
//     cerebro (y se pueden corregir a mano); sin escribir, se arman con el
//     kit y una plantilla por tipo.
//
// El pedido final es CORTO a propósito (ver «Mejorar idea»): el preset de la
// marca, la escena en una o dos frases y, en video, cómo se mueve. Lo que se
// manda al motor es lo que queda escrito en la galería.
//
// El LOGO va como imagen de referencia en las imágenes (si el modelo
// admite referencias), nunca en un video: en un video la imagen de apoyo es
// el primer fotograma, y el video empezaría en el logo.
// ============================================================

export const TIPOS_PRESET = Object.freeze({
  producto: {
    nombre: "Producto",
    ayuda: "El producto como protagonista: fondo limpio, luz suave.",
    base: (m) => `Fotografía publicitaria de producto para ${m}. El producto es el protagonista, con fondo limpio y abundante espacio negativo, composición sencilla y aireada.`,
  },
  anuncio: {
    nombre: "Anuncio",
    ayuda: "Pieza para pauta: jerarquía clara y espacio para el titular y el botón.",
    base: (m) => `Pieza publicitaria para redes de ${m}, pensada para anuncio: jerarquía visual clara, un solo mensaje, espacio limpio para un titular y un llamado a la acción.`,
  },
  corporativo: {
    nombre: "Corporativo",
    ayuda: "Equipo, instalaciones, oficio: sobrio y confiable.",
    base: (m) => `Fotografía corporativa de ${m}: personas reales, instalaciones u oficio, tono sobrio, profesional y confiable, composición ordenada.`,
  },
  creativo: {
    nombre: "Creativo",
    ayuda: "Concepto llamativo y composición inesperada, sin salir de la marca.",
    base: (m) => `Pieza creativa y llamativa para ${m}: un concepto visual original y una composición inesperada, sin salirse de la identidad de la marca.`,
  },
});

const HEX = /^#[0-9a-f]{6}$/i;
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Lo guardado, limpio: lo que no se entiende se descarta. Pura. */
export function limpiarKit(guardado) {
  const g = guardado && typeof guardado === "object" ? guardado : {};
  const paleta = (Array.isArray(g.paleta) ? g.paleta : [])
    .map((c) => ({ hex: String(c?.hex ?? "").trim().toUpperCase(), nombre: corto(c?.nombre, 40), rol: corto(c?.rol, 60) }))
    .filter((c) => HEX.test(c.hex))
    .slice(0, 8);
  const presets = {};
  for (const tipo of Object.keys(TIPOS_PRESET)) {
    const t = corto(g.presets?.[tipo], 1500);
    if (t) presets[tipo] = t;
  }
  return {
    paleta,
    tipografia: corto(g.tipografia, 120),
    estilo: corto(g.estilo, 300),
    luz: corto(g.luz, 200),
    evitar: corto(g.evitar, 400),
    logo: typeof g.logo === "string" && /^clientes\/[^/]+\/.+/.test(g.logo) && !g.logo.includes("..") ? g.logo : "",
    presets,
    ...(g.preparadoAt ? { preparadoAt: String(g.preparadoAt) } : {}),
  };
}

/** ¿Tiene algo el kit? Pura. */
export const kitVacio = (kit) => {
  const k = limpiarKit(kit);
  return !k.paleta.length && !k.tipografia && !k.estilo && !Object.keys(k.presets).length;
};

/** «azul profundo #1B3246 (estructura/tipografía), verde suave #91C9A2 (acento)». Pura. */
export function textoPaleta(paleta = []) {
  return paleta.map((c) => `${c.nombre ? `${c.nombre} ` : ""}${c.hex}${c.rol ? ` (${c.rol})` : ""}`).join(", ");
}

/**
 * El texto del preset de un tipo para un cliente: el escrito (por la IA o a
 * mano) si lo hay; si no, la plantilla del tipo con el kit. Pura.
 */
export function textoPreset(kitGuardado, tipo, { marca = "la marca", rubro = "" } = {}) {
  const kit = limpiarKit(kitGuardado);
  if (kit.presets[tipo]) return kit.presets[tipo];
  const def = TIPOS_PRESET[tipo] ?? TIPOS_PRESET.producto;
  const quien = rubro ? `${marca} (${rubro})` : marca;
  return [
    def.base(quien),
    kit.paleta.length ? `Paleta estrictamente limitada a: ${textoPaleta(kit.paleta)}.` : "",
    kit.estilo ? `Estilo ${kit.estilo}.` : "",
    kit.luz ? `Luz: ${kit.luz}.` : "",
    kit.tipografia ? `Tipografía únicamente ${kit.tipografia}.` : "",
    kit.paleta.length ? "Sin colores fuera de la paleta." : "",
    kit.evitar ? `${kit.evitar.replace(/\.$/, "")}.` : "",
    "Sin texto inventado ni logos de otras marcas.",
  ].filter(Boolean).join(" ");
}

/** Lo que se añade en un video: el movimiento, corto. */
export const LINEA_VIDEO = "Video corto: movimiento de cámara suave y natural, sin cortes bruscos, ritmo tranquilo.";

/**
 * El pedido que va al motor: el preset de la marca, la escena y, en video,
 * cómo se mueve. Sin preset, la idea tal cual. Pura.
 */
export function componerPedido({ idea, preset = "", video = false }) {
  const escena = String(idea ?? "").trim();
  if (!preset) return escena;
  return [preset.trim(), `Escena: ${escena}`, video ? LINEA_VIDEO : ""].filter(Boolean).join("\n\n");
}

/** La escena de un pedido compuesto (sin el preset ni la línea del video); si no lo es, el texto tal cual. Pura. */
export function ideaDelPedido(prompt) {
  const t = String(prompt ?? "");
  const i = t.indexOf("\n\nEscena: ");
  if (i < 0) return t.trim();
  return t.slice(i + "\n\nEscena: ".length).split("\n\n")[0].trim();
}

/**
 * ¿Se pone el logo como referencia? Sólo en imágenes, con un modelo que
 * admita referencias, si hay hueco y si no está ya puesto. Pura.
 */
export function ponerLogo({ kit, tipo, modelo, referencias = [] }) {
  const logo = limpiarKit(kit).logo;
  if (!logo || tipo === "video" || !(modelo?.referencias > 0)) return false;
  if (referencias.includes(logo)) return false;
  return referencias.length < modelo.referencias;
}

// ------------------------------------------------------------
// La IA: preparar el kit desde el cerebro, y revisar una pieza
// ------------------------------------------------------------

/** Ejemplos de la agencia: así escribe sus presets en Flow (sirven de muestra del TONO, no se copian). */
const EJEMPLOS = `Ejemplo 1 (bebés, orgánico): Fotografía publicitaria de producto para marca de bebés hipoalergénica y orgánica. Paleta estrictamente limitada a: azul profundo #1B3246 (estructura/tipografía), verde suave #91C9A2 (acento natural), naranja cálido #EE924A (detalle/CTA), crema #F9F6ED y #F2EFE5 (fondos). Estilo limpio, cálido, suave y confiable, abundante espacio negativo, luz natural difusa, composición sencilla y aireada. Tipografía únicamente Montserrat. Sin colores fuera de la paleta, sin elementos recargados, sin texto inventado ni logos de otras marcas.

Ejemplo 2 (maquinaria pesada): Fotografía publicitaria de maquinaria pesada para marca de movimiento de tierra y alquiler/venta de equipos. Paleta estrictamente limitada a: azul marino #152473 (dominante: estructura, fondos oscuros, tipografía) y amarillo de máquina #FFB400 (solo acento: detalles, CTA, cifras). El azul domina siempre; el amarillo nunca al revés. Estilo industrial, sólido y confiable, iluminación fuerte y directa, estética técnica y de autoridad de oficio, composición con espacio para texto. Tipografía estilo Anton/Archivo Black para títulos e Inter/Barlow para apoyo. Sin colores fuera de la paleta, sin logos de otras marcas, sin texto inventado.`;

/** Lo que se le pide a la IA para armar el kit y los cuatro presets de un cliente. Pura. */
export function pedidoDeKit({ marca, rubro = "", guia = "", ficha = "" }) {
  return [
    `Eres director de arte de una agencia en Panamá. Arma el kit visual de la marca ${marca}${rubro ? ` (${rubro})` : ""} para generar imágenes y videos con IA, a partir de lo que sabemos de ella.`,
    "",
    "LO QUE SABEMOS DE LA MARCA:",
    [ficha, guia].filter(Boolean).join("\n\n") || "(No hay guía visual guardada: deduce lo razonable del rubro y dilo en «dudas».)",
    "",
    "Reglas:",
    "- Usa SOLO colores que aparezcan en lo que sabemos (con su código hex). Si no hay ninguno, deja la paleta vacía: no inventes colores.",
    "- Cada color con su papel (dominante, acento, fondo, texto…) y cuál manda sobre cuál.",
    "- La tipografía, sólo si aparece; si no, vacía.",
    "- Cuatro presets: producto, anuncio, corporativo y creativo. Cada uno es UN párrafo de 60 a 110 palabras, en el estilo de los ejemplos: qué tipo de pieza es, la paleta estricta con hex y papeles, el estilo, la luz, la composición, la tipografía y lo que no debe salir. Sin listas.",
    "- No describas una escena concreta: el preset va delante de cualquier idea.",
    "- Si hay ESTUDIO DE MERCADO, el preset de anuncio tiene que hablarle a esos perfiles y a esos deseos (el tono de la imagen, la gente que sale, la emoción), sin escribir textos ni precios: esos van en cada pieza.",
    "",
    "EJEMPLOS DE CÓMO ESCRIBE LA AGENCIA SUS PRESETS (son de otras marcas: no copies sus colores):",
    EJEMPLOS,
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"paleta":[{"hex":"#RRGGBB","nombre":"…","rol":"…"}],"tipografia":"…","estilo":"…","luz":"…","evitar":"…","presets":{"producto":"…","anuncio":"…","corporativo":"…","creativo":"…"},"dudas":"lo que no estaba claro, en una frase (o vacío)"}',
  ].join("\n");
}

/**
 * La respuesta de la IA → el kit y sus dudas. Null si no hay JSON. El logo
 * no lo pone la IA: al guardar se conserva el que había (`fundirKit`). Pura.
 */
export function leerKit(texto) {
  const m = String(texto ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  return { kit: limpiarKit({ ...d, logo: "" }), dudas: corto(d.dudas, 300) };
}

/** Lo que propone la IA sobre lo guardado: conserva el logo. Pura. */
export function fundirKit(guardado, propuesto, ahora = new Date().toISOString()) {
  const antes = limpiarKit(guardado);
  return limpiarKit({ ...propuesto, logo: antes.logo, preparadoAt: ahora });
}

/** Lo que se le pide a la IA al revisar una pieza contra el kit. La imagen va aparte. Pura. */
export function pedidoDeRevision({ marca, kit: kitGuardado, prompt = "" }) {
  const kit = limpiarKit(kitGuardado);
  return [
    `Revisa si esta imagen respeta la identidad visual de ${marca}. Sé estricto y concreto.`,
    "",
    "EL KIT DE LA MARCA:",
    kit.paleta.length ? `Paleta: ${textoPaleta(kit.paleta)}` : "Paleta: (sin definir)",
    kit.tipografia ? `Tipografía: ${kit.tipografia}` : "",
    kit.estilo ? `Estilo: ${kit.estilo}` : "",
    kit.luz ? `Luz: ${kit.luz}` : "",
    kit.evitar ? `Nunca: ${kit.evitar}` : "",
    prompt ? `\nLo que se pidió: ${corto(prompt, 1500)}` : "",
    "",
    "Mira: colores fuera de la paleta (y si el dominante es el correcto), texto inventado o mal escrito, logos de otras marcas, estilo y luz, y si se parece a lo que se pidió.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"puntaje":0-10,"cumple":["lo que sí respeta"],"falla":["lo que no, concreto"],"sugerencia":"una frase para añadir al pedido y corregirlo (o vacío)"}',
  ].filter((l) => l !== "").join("\n");
}

/** La respuesta de la revisión. Null si no hay JSON. Pura. */
export function leerRevision(texto) {
  const m = String(texto ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  const lista = (x) => (Array.isArray(x) ? x.map((s) => corto(s, 200)).filter(Boolean).slice(0, 6) : []);
  const puntaje = Math.max(0, Math.min(10, Math.round(Number(d.puntaje) || 0)));
  return { puntaje, cumple: lista(d.cumple), falla: lista(d.falla), sugerencia: corto(d.sugerencia, 300) };
}
