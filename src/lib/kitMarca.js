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
//   · el BLOQUE DE MARCA (`bloqueDeMarca`): la paleta, el estilo, la luz, la
//     tipografía y lo que nunca debe salir. Va en TODO pedido mientras el kit
//     tenga algo y no se apague «Usar kit de marca», con preset o sin él: antes
//     sólo viajaba dentro del preset, y con «Sin preset» —lo que salía desde un
//     post sin tipo— la imagen no sabía nada de la marca;
//   · los PRESETS, uno por TIPO DE CONTENIDO del calendario (anuncio,
//     beneficios, producto/servicio, educativo, diferenciador, 7 maletas con
//     sus cuatro, contenido humano): qué clase de pieza es. Desde un post se
//     escoge solo por su tipo. Los escribe la IA por cliente a partir del
//     cerebro y se corrigen a mano; sin escribir, una plantilla por tipo. Más
//     los PROPIOS de cada cliente (hasta 6) y un ACABADO opcional.
//
// QUÉ HACE DE VERDAD EL TIPO DE PIEZA. Al principio cada tipo era un párrafo
// que iba DELANTE de la escena y fijaba la composición («el producto ocupa el
// centro, espacio limpio para el titular y el botón»): el motor obedecía eso
// antes que la idea, todas las piezas de un tipo salían con la misma forma, y
// las que salían mejor eran las de «Sin tipo». Ahora la ESCENA va primero y
// manda, el tipo dice para qué es la pieza (qué comunica y con qué tono, no
// cómo se encuadra), y cada tipo puede llevar hasta dos IMÁGENES de
// referencia (`referencias`) que enseñan el estilo en vez de describirlo.
//
// ============================================================

import { limpiarAprendido, lineasAprendidas } from "./aprendizajeVisual.js";

/** Los presets, uno por tipo de contenido (los ids de `PILARES`, en pilares.js). `base`: la plantilla sin escribir. */
export const TIPOS_PRESET = Object.freeze({
  anuncio: {
    nombre: "Anuncio",
    ayuda: "Venta directa (Meta): un solo mensaje y el producto bien reconocible.",
    base: (m) => `Anuncio de venta directa de ${m}: un solo mensaje que se entiende en un segundo y el producto bien reconocible.`,
  },
  beneficios: {
    nombre: "Beneficios / Promoción",
    ayuda: "Lo que gana quien compra, o la oferta, se nota a primera vista.",
    base: (m) => `Pieza de beneficio u oferta de ${m}: lo que gana quien compra se nota a primera vista, con sensación de oportunidad.`,
  },
  servicios: {
    nombre: "Producto / Servicio",
    ayuda: "El producto real y bien visto; el servicio, con su resultado.",
    base: (m) => `Pieza de producto o servicio de ${m}: el producto real, bien visto y creíble; si es un servicio, se ve su resultado.`,
  },
  educativo: {
    nombre: "Educativo / Informativo",
    ayuda: "Educa o informa: una sola idea, ordenada y fácil de leer.",
    base: (m) => `Pieza educativa de ${m}: enseña una sola idea, ordenada y fácil de leer; transmite que la marca sabe del tema.`,
  },
  diferenciador: {
    nombre: "Diferenciador",
    ayuda: "Lo que hace única a la empresa, claro.",
    base: (m) => `Pieza que muestra lo que hace única a ${m}: ese rasgo se ve claro, con un tono seguro y sin nombrar a nadie.`,
  },
  maletas: {
    nombre: "7 maletas",
    ayuda: "Confianza: garantía, testimonio, solución u objeciones.",
    base: (m) => `Pieza de confianza de ${m}: cercana y creíble, sin exageraciones publicitarias.`,
    subtipos: {
      garantia: { nombre: "Garantía", linea: "Transmite seguridad: un sello o distintivo de garantía visible, composición estable y ordenada, sensación de respaldo." },
      testimonio: { nombre: "Testimonio", linea: "Aspecto real y humano: una persona en un entorno cotidiano, luz natural y espacio para una cita corta; nada de pose de estudio." },
      solucion: { nombre: "Solución", linea: "Antes y después: el problema y su solución en la misma pieza, composición dividida o en secuencia; el cambio se entiende de un vistazo." },
      objeciones: { nombre: "Objeciones", linea: "Una pregunta frecuente en grande y su respuesta clara, composición limpia tipo tarjeta, tono tranquilo y directo." },
    },
  },
  humano: {
    nombre: "Contenido humano",
    ayuda: "Personas reales, equipo, proceso: que no parezca un anuncio.",
    base: (m) => `Fotografía natural y cercana de ${m}: personas reales, el equipo, el proceso o el detrás de cámaras, luz natural, encuadre espontáneo y poca edición; no debe parecer un anuncio.`,
  },
});

/** Los ids de preset que existen: los tipos y, de las 7 maletas, cada una («maletas-garantia»). */
export const IDS_PRESET = Object.freeze(Object.entries(TIPOS_PRESET).flatMap(([id, def]) => [id, ...Object.keys(def.subtipos ?? {}).map((s) => `${id}-${s}`)]));

/** Un acabado, opcional: cambia cómo se ve sin crear más presets. */
export const ACABADOS = Object.freeze({
  fotografico: { nombre: "Fotográfico", linea: "Acabado fotográfico realista, como una foto profesional." },
  grafico: { nombre: "Diseño gráfico", linea: "Acabado de diseño gráfico: formas limpias, bloques de color de la paleta y composición de pieza publicitaria." },
  natural: { nombre: "Natural (celular)", linea: "Acabado natural, como tomada con un celular: luz real, sin retoque, sensación espontánea." },
});

/** Los presets de antes (producto, anuncio, corporativo, creativo) → los de ahora. Lo que no tiene equivalente pasa a propio. */
const PRESET_ANTIGUO = Object.freeze({ producto: "servicios" });
const PROPIOS_ANTIGUOS = Object.freeze({ corporativo: "Corporativo", creativo: "Creativo" });
export const MAX_PROPIOS = 6;
const ID_PROPIO = /^propio-[a-z0-9-]{1,40}$/;

const HEX = /^#[0-9a-f]{6}$/i;
/** Imágenes de referencia por tipo de pieza: como mucho dos (los motores admiten pocas y van también el producto y el logo). */
export const MAX_REFS_PRESET = 2;
const CLAVE = /^clientes\/[^/]+\/.+/;
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Lo guardado, limpio: lo que no se entiende se descarta. Pura. */
export function limpiarKit(guardado) {
  const g = guardado && typeof guardado === "object" ? guardado : {};
  const paleta = (Array.isArray(g.paleta) ? g.paleta : [])
    .map((c) => ({ hex: String(c?.hex ?? "").trim().toUpperCase(), nombre: corto(c?.nombre, 40), rol: corto(c?.rol, 60) }))
    .filter((c) => HEX.test(c.hex))
    .slice(0, 8);
  const guardados = g.presets && typeof g.presets === "object" ? g.presets : {};
  const presets = {};
  for (const id of IDS_PRESET) {
    const t = corto(guardados[id], 1500);
    if (t) presets[id] = t;
  }
  for (const [viejo, nuevo] of Object.entries(PRESET_ANTIGUO)) {
    const t = corto(guardados[viejo], 1500);
    if (t && !presets[nuevo]) presets[nuevo] = t;
  }
  const propios = [];
  for (const p of Array.isArray(g.propios) ? g.propios : []) {
    const id = String(p?.id ?? "");
    const nombre = corto(p?.nombre, 40);
    const texto = corto(p?.texto, 1500);
    if (ID_PROPIO.test(id) && nombre && texto && !propios.some((x) => x.id === id)) propios.push({ id, nombre, texto });
  }
  for (const [viejo, nombre] of Object.entries(PROPIOS_ANTIGUOS)) {
    const texto = corto(guardados[viejo], 1500);
    const id = `propio-${viejo}`;
    if (texto && !propios.some((x) => x.id === id)) propios.push({ id, nombre, texto });
  }
  return {
    paleta,
    tipografia: corto(g.tipografia, 120),
    estilo: corto(g.estilo, 300),
    luz: corto(g.luz, 200),
    evitar: corto(g.evitar, 400),
    logo: typeof g.logo === "string" && /^clientes\/[^/]+\/.+/.test(g.logo) && !g.logo.includes("..") ? g.logo : "",
    presets,
    propios: propios.slice(0, MAX_PROPIOS),
    // Reglas visuales que la IA propuso de los «Me gusta» y la papelera, y una persona aceptó (aprendizajeVisual.js).
    aprendido: limpiarAprendido(g.aprendido),
    // La referencia visual de cada tipo de pieza (y de cada propio): claves de la galería de este cliente.
    referencias: limpiarRefsPreset(g.referencias, propios.slice(0, MAX_PROPIOS)),
    ...(g.preparadoAt ? { preparadoAt: String(g.preparadoAt) } : {}),
  };
}

/** Las referencias por tipo, limpias: ids que existen, claves de `clientes/`, sin repetir y como mucho dos. Pura. */
function limpiarRefsPreset(entrada, propios = []) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  const fuera = {};
  for (const [id, lista] of Object.entries(e)) {
    if (!IDS_PRESET.includes(id) && !propios.some((p) => p.id === id)) continue;
    const claves = [...new Set((Array.isArray(lista) ? lista : []).map(String))].filter((c) => CLAVE.test(c) && !c.includes("..")).slice(0, MAX_REFS_PRESET);
    if (claves.length) fuera[id] = claves;
  }
  return fuera;
}

/**
 * Las imágenes de referencia del tipo de pieza escogido, como archivos de apoyo (sólo las que siguen en la galería: una
 * borrada rompería el pedido). Una de las 7 maletas usa las suyas o, si no tiene, las de las maletas. `toma`: qué se
 * toma de ellas (en el lote, sólo el estilo: la composición la decide el plan). Pura.
 */
export function referenciasDePreset(kitGuardado, id, archivos = [], { toma = ["estilo", "composicion"] } = {}) {
  if (!id) return [];
  const refs = limpiarKit(kitGuardado).referencias;
  const claves = refs[id] ?? refs[String(id).split("-")[0]] ?? [];
  const nombre = nombreDePreset(id, kitGuardado);
  return claves
    .map((clave) => (archivos ?? []).find((a) => a.clave === clave))
    .filter(Boolean)
    .map((a) => ({ ...a, toma, nota: `es la referencia visual de las piezas «${nombre}»` }));
}

/** ¿Tiene algo el kit? Pura. */
export const kitVacio = (kit) => {
  const k = limpiarKit(kit);
  return !k.paleta.length && !k.tipografia && !k.estilo && !k.luz && !k.evitar && !Object.keys(k.presets).length && !k.propios.length && !k.aprendido.length;
};

/** «azul profundo #1B3246 (estructura/tipografía), verde suave #91C9A2 (acento)». Pura. */
export function textoPaleta(paleta = []) {
  return paleta.map((c) => `${c.nombre ? `${c.nombre} ` : ""}${c.hex}${c.rol ? ` (${c.rol})` : ""}`).join(", ");
}

const sinPunto = (t) => String(t ?? "").trim().replace(/[.\s]+$/, "");

/**
 * Lo que la marca exige en TODA pieza: la paleta, el estilo, la luz, la tipografía y lo que nunca debe salir.
 * Vacío si el kit no tiene nada de eso (un kit con sólo presets no dice cómo es la marca). Pura.
 */
export function bloqueDeMarca(kitGuardado) {
  const kit = limpiarKit(kitGuardado);
  const partes = [
    kit.paleta.length ? `Paleta estrictamente limitada a: ${textoPaleta(kit.paleta)}; sin colores fuera de la paleta.` : "",
    kit.estilo ? `Estilo de la marca: ${sinPunto(kit.estilo)}.` : "",
    kit.luz ? `Luz: ${sinPunto(kit.luz)}.` : "",
    kit.tipografia ? `Si lleva texto, tipografía únicamente ${sinPunto(kit.tipografia)}.` : "",
    kit.evitar ? `Nunca: ${sinPunto(kit.evitar)}.` : "",
    lineasAprendidas(kit.aprendido),
  ].filter(Boolean);
  if (!partes.length) return "";
  return ["Identidad de la marca (obligatoria):", ...partes, "Sin texto inventado ni logos de otras marcas."].join(" ");
}

/** ¿Existe ese preset para este kit? (un tipo, una de las 7 maletas o un propio del cliente). Pura. */
export function presetValido(id, kitGuardado) {
  if (!id) return false;
  if (IDS_PRESET.includes(id)) return true;
  return limpiarKit(kitGuardado).propios.some((p) => p.id === id);
}

/** El preset guardado de antes (en el navegador) → el de ahora, o vacío. Pura. */
export function presetActual(id, kitGuardado) {
  if (presetValido(id, kitGuardado)) return id;
  if (PRESET_ANTIGUO[id]) return PRESET_ANTIGUO[id];
  if (PROPIOS_ANTIGUOS[id] && presetValido(`propio-${id}`, kitGuardado)) return `propio-${id}`;
  return "";
}

/** «Anuncio», «7 maletas · Garantía», o el nombre de un propio. Pura. */
export function nombreDePreset(id, kitGuardado) {
  if (!id) return "";
  const propio = limpiarKit(kitGuardado).propios.find((p) => p.id === id);
  if (propio) return propio.nombre;
  const [tipo, sub] = String(id).split("-");
  const def = TIPOS_PRESET[tipo];
  if (!def) return "";
  return sub && def.subtipos?.[sub] ? `${def.nombre} · ${def.subtipos[sub].nombre}` : def.nombre;
}

/**
 * El texto del preset para un cliente: qué clase de pieza es. El escrito (por la IA o a mano) si lo hay; si no, la
 * plantilla del tipo. Una de las 7 maletas suma su línea al de las maletas. La paleta NO va aquí: va en el bloque de
 * marca, que acompaña a cualquier preset. Pura.
 */
export function textoPreset(kitGuardado, id, { marca = "la marca", rubro = "" } = {}) {
  const kit = limpiarKit(kitGuardado);
  const propio = kit.propios.find((p) => p.id === id);
  if (propio) return propio.texto;
  if (kit.presets[id]) return kit.presets[id];
  const quien = rubro ? `${marca} (${rubro})` : marca;
  const [tipo, sub] = String(id ?? "").split("-");
  const def = TIPOS_PRESET[tipo];
  if (!def) return "";
  const base = kit.presets[tipo] || def.base(quien);
  return sub && def.subtipos?.[sub] ? `${base} ${def.subtipos[sub].linea}` : base;
}

/** Cómo se presenta el tipo de pieza en el pedido: orienta, pero la escena manda. */
export const PREFIJO_TIPO = "Tipo de pieza (orienta el propósito y el tono; la escena y su composición mandan):";

/** Lo que se añade en un video: el movimiento, corto. */
export const LINEA_VIDEO = "Video corto: movimiento de cámara suave y natural, sin cortes bruscos, ritmo tranquilo.";

/** Lo que se dice del logo cuando va de referencia: que no lo redibuje. */
export const LINEA_LOGO = "Una de las imágenes de referencia es el logo de la marca: si aparece en la pieza, cópialo tal cual (forma, colores y letras), sin redibujarlo ni inventar otro.";

/**
 * El pedido que va al motor: la ESCENA primero (es lo que manda), el tipo de pieza (para qué es), el acabado, qué se
 * toma de cada referencia (referencias.js), la identidad de la marca, el logo y, en video, cómo se mueve. Sin nada de
 * eso, la idea tal cual. Lo que se manda es lo que queda escrito en la galería. Pura.
 */
export function componerPedido({ idea, preset = "", acabado = "", referencias = "", marca = "", logo = false, video = false }) {
  const escena = String(idea ?? "").trim();
  const lineaAcabado = ACABADOS[acabado]?.linea ?? "";
  const lineasRefs = String(referencias ?? "").trim();
  if (!preset && !lineaAcabado && !lineasRefs && !marca && !logo) return escena;
  const tipo = String(preset ?? "").trim();
  return [`Escena: ${escena}`, tipo ? `${PREFIJO_TIPO} ${tipo}` : "", lineaAcabado, lineasRefs, String(marca).trim(), logo ? LINEA_LOGO : "", video ? LINEA_VIDEO : ""]
    .filter(Boolean).join("\n\n");
}

/** La escena de un pedido compuesto (sin el preset, la marca ni la línea del video); si no lo es, el texto tal cual. Pura. */
export function ideaDelPedido(prompt) {
  const t = String(prompt ?? "");
  const m = t.match(/(?:^|\n\n)Escena: ([\s\S]*?)(?:\n\n|$)/);
  return m ? m[1].trim() : t.trim();
}

/**
 * El mismo pedido con OTRA escena: el tipo de pieza, la marca, las referencias y el logo se quedan como estaban
 * («Otra versión distinta»). Si el pedido no está compuesto, la escena nueva es todo el pedido. Pura.
 */
export function conOtraEscena(prompt, escena) {
  const t = String(prompt ?? "");
  const nueva = String(escena ?? "").trim();
  if (!/(?:^|\n\n)Escena: /.test(t)) return nueva;
  return t.replace(/((?:^|\n\n)Escena: )[\s\S]*?(?=\n\n|$)/, (_, inicio) => `${inicio}${nueva}`);
}

/**
 * Todo el pedido de una pieza para un cliente, con su kit: lo usan la pantalla, «Producir el mes» y el asistente, así
 * los tres piden igual. `usarKit: false` deja sólo el preset y la escena. Pura.
 */
export function pedidoConMarca({ kit, idea, preset = "", acabado = "", referencias = "", marca = "la marca", rubro = "", video = false, logo = false, usarKit = true }) {
  return componerPedido({
    idea,
    preset: preset ? textoPreset(kit, preset, { marca, rubro }) : "",
    acabado,
    referencias,
    marca: usarKit ? bloqueDeMarca(kit) : "",
    logo: usarKit && logo && !video,
    video,
  });
}

/**
 * El estilo entero para quien pide por su cuenta (el carrusel, lámina a lámina): el preset y la identidad de la marca
 * juntos, en un solo texto. Pura.
 */
export function estiloDeMarca(kit, preset, { marca = "la marca", rubro = "" } = {}) {
  return [preset ? textoPreset(kit, preset, { marca, rubro }) : "", bloqueDeMarca(kit)].filter(Boolean).join("\n\n");
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

/** Los presets que escribe la IA: uno por tipo (las 7 maletas, uno para las cuatro; cada una suma su línea). */
const PRESETS_DE_LA_IA = Object.keys(TIPOS_PRESET);

/** Lo que se le pide a la IA para armar el kit y un preset por tipo de contenido de un cliente. Pura. */
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
    "- El estilo, la luz y «evitar» describen la marca en CUALQUIER pieza: van en todo pedido, junto con la paleta.",
    "- Un preset por TIPO DE CONTENIDO del calendario de la agencia:",
    ...PRESETS_DE_LA_IA.map((id) => `  · ${id} (${TIPOS_PRESET[id].nombre}): ${TIPOS_PRESET[id].ayuda}`),
    "  Cada uno es UNA o DOS frases (de 20 a 45 palabras) para ESTA marca: para qué sirve la pieza, qué comunica, la emoción, el tono y la gente que sale (si sale). Sin listas.",
    "  NO describas la composición, el encuadre ni dónde va el producto o el texto: eso lo decide cada escena, y fijarlo hace que todas las piezas de un tipo salgan iguales.",
    "- En los presets NO repitas la paleta, la tipografía ni lo que no debe salir: eso va aparte, en todo pedido. Tampoco describas una escena concreta: el preset va delante de cualquier idea.",
    "- Si hay ESTUDIO DE MERCADO, los presets de anuncio y beneficios le hablan a esos perfiles y a esos deseos (el tono de la imagen, la gente que sale, la emoción), sin escribir textos ni precios: esos van en cada pieza.",
    "",
    "EJEMPLOS DE CÓMO DESCRIBE LA AGENCIA UNA MARCA (son de otras marcas: no copies sus colores; de ahí salen la paleta, el estilo, la luz y lo que no debe salir):",
    EJEMPLOS,
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"paleta":[{"hex":"#RRGGBB","nombre":"…","rol":"…"}],"tipografia":"…","estilo":"…","luz":"…","evitar":"…","presets":{${PRESETS_DE_LA_IA.map((id) => `"${id}":"…"`).join(",")}},"dudas":"lo que no estaba claro, en una frase (o vacío)"}`,
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

/** Lo que propone la IA sobre lo guardado: conserva el logo y los presets propios (la IA no los escribe). Pura. */
export function fundirKit(guardado, propuesto, ahora = new Date().toISOString()) {
  const antes = limpiarKit(guardado);
  // Lo que la IA no escribe se queda: el logo, los presets propios, las reglas aprendidas y las referencias de cada tipo.
  return limpiarKit({ ...propuesto, logo: antes.logo, propios: antes.propios, aprendido: antes.aprendido, referencias: antes.referencias, preparadoAt: ahora });
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
    lineasAprendidas(kit.aprendido),
    prompt ? `\nLo que se pidió: ${corto(prompt, 1500)}` : "",
    "",
    "Mira: colores fuera de la paleta (y si el dominante es el correcto), texto inventado o mal escrito, logos de otras marcas o un logo propio redibujado, estilo y luz, y si se parece a lo que se pidió.",
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
