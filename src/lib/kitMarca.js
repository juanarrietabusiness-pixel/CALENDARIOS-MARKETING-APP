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

import { SIN_TEXTO_VIDEO } from "./videoLimpio.js";

import { limpiarAprendido, lineasAprendidas } from "./aprendizajeVisual.js";
import { posicionDelKit } from "./logoEncima.js";

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
      garantia: { nombre: "Garantía", linea: "Transmite seguridad y respaldo. Composición sugerida (si la escena no dice otra): un sello o distintivo de garantía visible, orden y estabilidad." },
      testimonio: { nombre: "Testimonio", linea: "Real y humano, nada de pose. Composición sugerida (si la escena no dice otra): una persona en su entorno cotidiano, con espacio para una cita corta." },
      solucion: { nombre: "Solución", linea: "El cambio se entiende de un vistazo. Composición sugerida (si la escena no dice otra): antes y después, el problema y su solución en la misma pieza." },
      objeciones: { nombre: "Objeciones", linea: "Tono tranquilo y directo: una pregunta frecuente y su respuesta clara. Composición sugerida (si la escena no dice otra): limpia, tipo tarjeta." },
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

/**
 * Los ESTILOS VISUALES: CÓMO se ve la pieza, aparte de QUÉ comunica (el tipo). Cada uno lleva una línea de acabado
 * profesional —luz, lente, color, tipografía— en una o dos frases: lo que pediría un director de arte. Párrafos más
 * largos empeoran el resultado (el motor deja de hacerle caso a la escena). Corporativo y Creativo eran «presets»:
 * describían el aspecto, no el mensaje, y por eso son estilos.
 */
export const ESTILOS_VISUALES = Object.freeze({
  fotografico: {
    nombre: "Fotográfico", ayuda: "Fotografía publicitaria profesional.",
    linea: "Acabado de fotografía publicitaria profesional: luz suave y direccional con un contraluz sutil, lente de 50 a 85 mm, profundidad de campo corta, color gradado limpio y natural, texturas nítidas.",
  },
  grafico: {
    nombre: "Diseño gráfico", ayuda: "Pieza de diseño: bloques de color y texto bien jerarquizado.",
    linea: "Acabado de diseño gráfico publicitario: composición en retícula, bloques de color de la paleta, formas limpias y mucho aire; si lleva texto, jerarquía tipográfica clara (titular grande, apoyo pequeño) y alineación precisa.",
  },
  natural: {
    nombre: "Natural (celular)", ayuda: "Como tomada por una persona real: cercana y creíble.",
    linea: "Acabado natural, como tomada con un buen celular por una persona real: luz de ventana, encuadre espontáneo, sin retoque visible; cercana y creíble.",
  },
  editorial: {
    nombre: "Editorial premium", ayuda: "Como una revista de estilo de vida.",
    linea: "Acabado editorial premium, como una revista de estilo de vida: luz natural cálida y envolvente, tonos suaves y armónicos, mucho espacio negativo, composición elegante y asimétrica, textura fina.",
  },
  estudio: {
    nombre: "Producto en estudio", ayuda: "El producto nítido y protagonista, sin distracciones.",
    linea: "Acabado de producto en estudio: fondo liso o superficie limpia, iluminación de estudio con sombras suaves, el producto nítido y protagonista, reflejos controlados, sin distracciones.",
  },
  corporativo: {
    nombre: "Corporativo", ayuda: "Sobrio y confiable: personas e instalaciones reales.",
    linea: "Acabado corporativo: sobrio y confiable, encuadres ordenados, luz pareja y limpia, personas en un entorno profesional real, los colores de la paleta en superficies y detalles.",
  },
  creativo: {
    nombre: "Creativo", ayuda: "Una idea visual que sorprende.",
    linea: "Acabado creativo de campaña: una idea visual que sorprende (escala, perspectiva o una metáfora visual), color audaz de la paleta, composición dinámica y un acabado pulido de alto nivel.",
  },
});

/** Compatibilidad: el «acabado» de antes es el estilo visual de ahora (mismos ids). */
export const ACABADOS = ESTILOS_VISUALES;

/** El estilo que trae cada tipo de pieza si el cliente no fijó otro (`kit.estiloPorTipo`). */
export const ESTILO_POR_TIPO = Object.freeze({
  anuncio: "fotografico", beneficios: "grafico", servicios: "estudio", educativo: "grafico", diferenciador: "editorial", maletas: "natural", humano: "natural",
});

/** Los presets de antes (producto, anuncio, corporativo, creativo) → los de ahora. Lo que no tiene equivalente pasa a propio. */
const PRESET_ANTIGUO = Object.freeze({ producto: "servicios" });
/** Los presets de antes que describían un ASPECTO: pasan a estilos propios con su texto. */
const ESTILOS_ANTIGUOS = Object.freeze({ corporativo: "Corporativo", creativo: "Creativo" });
export const MAX_PROPIOS = 6;
export const MAX_ESTILOS = 6;
/** Personajes de la marca (el bebé de Baby Caleb): hasta 4, cada uno con retrato y, si hay, cuerpo entero. */
export const MAX_PERSONAJES = 4;
const ID_PERSONAJE = /^personaje-[a-z0-9-]{1,40}$/;
const ID_PROPIO = /^propio-[a-z0-9-]{1,40}$/;
const ID_ESTILO = /^estilo-[a-z0-9-]{1,40}$/;

const HEX = /^#[0-9a-f]{6}$/i;
/** «Reglas que no se rompen»: lo que la agencia repite en cada pieza (tamaño del texto, el logo, la marca). */
export const MAX_REGLAS = 12;
const MAX_REGLA = 160;
/** Las reglas, limpias: frases cortas, sin repetir (sin mirar mayúsculas), como mucho 12. Pura. */
export function limpiarReglas(entrada) {
  const fuera = [];
  for (const r of Array.isArray(entrada) ? entrada : []) {
    const t = corto(r, MAX_REGLA).replace(/[.\s]+$/, "");
    if (t && !fuera.some((x) => x.toLowerCase() === t.toLowerCase())) fuera.push(t);
  }
  return fuera.slice(0, MAX_REGLAS);
}
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
  const estilos = [];
  // Un propio que vino de un preset viejo de aspecto (propio-corporativo, propio-creativo) es un estilo.
  const aEstilo = (id) => /^propio-(corporativo|creativo)$/.test(id);
  for (const p of Array.isArray(g.propios) ? g.propios : []) {
    const id = String(p?.id ?? "");
    const nombre = corto(p?.nombre, 40);
    const texto = corto(p?.texto, 1500);
    if (!(ID_PROPIO.test(id) && nombre && texto)) continue;
    if (aEstilo(id)) {
      const idEstilo = id.replace(/^propio-/, "estilo-");
      if (!estilos.some((x) => x.id === idEstilo)) estilos.push({ id: idEstilo, nombre, texto });
    } else if (!propios.some((x) => x.id === id)) propios.push({ id, nombre, texto });
  }
  for (const e of Array.isArray(g.estilos) ? g.estilos : []) {
    const id = String(e?.id ?? "");
    const nombre = corto(e?.nombre, 40);
    const texto = corto(e?.texto, 1500);
    if (ID_ESTILO.test(id) && nombre && texto && !estilos.some((x) => x.id === id)) estilos.push({ id, nombre, texto });
  }
  for (const [viejo, nombre] of Object.entries(ESTILOS_ANTIGUOS)) {
    const texto = corto(guardados[viejo], 1500);
    const id = `estilo-${viejo}`;
    if (texto && !estilos.some((x) => x.id === id)) estilos.push({ id, nombre, texto });
  }
  const estilosFinal = estilos.slice(0, MAX_ESTILOS);
  // Las referencias de un propio que pasó a estilo se van con él.
  const refsEntrada = { ...(g.referencias && typeof g.referencias === "object" ? g.referencias : {}) };
  for (const k of Object.keys(refsEntrada)) {
    if (aEstilo(k) && !refsEntrada[k.replace(/^propio-/, "estilo-")]) refsEntrada[k.replace(/^propio-/, "estilo-")] = refsEntrada[k];
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
    // Los personajes de la marca: salen IGUAL en todas las láminas y todos los reels.
    personajes: limpiarPersonajes(g.personajes),
    // Los estilos visuales propios del cliente (hasta 6) y el estilo que fijó para cada tipo de pieza.
    estilos: estilosFinal,
    estiloPorTipo: limpiarEstiloPorTipo(g.estiloPorTipo, estilosFinal),
    // Reglas visuales que la IA propuso de los «Me gusta» y la papelera, y una persona aceptó (aprendizajeVisual.js).
    aprendido: limpiarAprendido(g.aprendido),
    // La referencia visual de cada tipo de pieza (y de cada propio): claves de la galería de este cliente.
    referencias: limpiarRefsPreset(refsEntrada, [...propios.slice(0, MAX_PROPIOS), ...estilosFinal]),
    // El modelo FIJADO de este cliente, por tipo («Fijar para este cliente»): un id del catálogo del Estudio.
    modelos: limpiarModelosKit(g.modelos),
    // Las reglas que la agencia no quiere repetir en cada pedido: van en TODA pieza y en la revisión de marca.
    reglas: limpiarReglas(g.reglas),
    // Quién pone el logo: el modelo (de referencia, lo de siempre) o la aplicación encima (logoEncima.js).
    logoModo: g.logoModo === "estampado" ? "estampado" : "modelo",
    logoPosicion: posicionDelKit(g.logoPosicion),
    // La tipografía REAL de la marca: el archivo de la fuente y una muestra dibujada con ella (imagen de la galería),
    // que va de referencia «toma la tipografía de aquí» en toda pieza donde el modelo escribe texto.
    fuente: limpiarFuente(g.fuente),
    // La VOZ de la marca en los videos con locución: una de las voces fijas de Google (VOCES_OMNI en el catálogo del
    // Estudio; Omni por Kie la registra). Vacía: la que escoja el modelo.
    voz: /^[a-z]{3,20}$/.test(String(g.voz ?? "")) ? String(g.voz) : "",
    // Las PLANTILLAS: piezas que quedaron muy bien, guardadas con su sistema de diseño para repetir el diseño con otro
    // contenido (post fijo, historia, portada o lámina de carrusel). Claves de la galería de ESTE cliente.
    plantillas: limpiarPlantillas(g.plantillas),
    ...(g.preparadoAt ? { preparadoAt: String(g.preparadoAt) } : {}),
  };
}

/** Plantillas del kit, como mucho: con más, escoger deja de ser rápido. */
export const MAX_PLANTILLAS = 12;
const ID_PLANTILLA = /^plantilla-[a-z0-9-]{1,40}$/;
const USOS_PLANTILLA = ["post", "historia", "portada", "lamina"];

/** Las plantillas: id con forma, nombre, uso, la clave de la imagen y su sistema de diseño en palabras. Pura. */
function limpiarPlantillas(entrada) {
  const fuera = [];
  for (const p of Array.isArray(entrada) ? entrada : []) {
    const id = String(p?.id ?? "");
    const clave = String(p?.clave ?? "");
    const nombre = corto(p?.nombre, 60);
    if (!ID_PLANTILLA.test(id) || !CLAVE.test(clave) || clave.includes("..") || !nombre || fuera.some((x) => x.id === id)) continue;
    fuera.push({
      id, nombre, clave,
      uso: USOS_PLANTILLA.includes(p?.uso) ? p.uso : "post",
      sistema: corto(p?.sistema, 900),
      ...(typeof p?.archivoId === "string" && /^[\w-]{1,80}$/.test(p.archivoId) ? { archivoId: p.archivoId } : {}),
    });
  }
  return fuera.slice(0, MAX_PLANTILLAS);
}

/** La plantilla `id` del kit, o null. Pura. */
export const plantillaDelKit = (kitGuardado, id) => (id ? limpiarKit(kitGuardado).plantillas.find((p) => p.id === id) ?? null : null);

/**
 * La imagen de una plantilla como referencia de una pieza: se toma su DISEÑO (retícula, zonas, tamaños, colores,
 * tipografía), nunca su contenido. Null si no existe o ya no está en la galería (`archivos`: si se da, se comprueba). Pura.
 */
export function referenciaDePlantilla(kitGuardado, id, archivos = null) {
  const p = plantillaDelKit(kitGuardado, id);
  if (!p) return null;
  if (Array.isArray(archivos) && !archivos.some((a) => a.clave === p.clave)) return null;
  return {
    clave: p.clave, src: `/api/media/${p.clave}`, toma: ["composicion", "estilo", "tipografia"],
    nota: `es la PLANTILLA «${p.nombre}» de la marca: repite su diseño (retícula, zonas, tamaños y peso del texto, colores, elementos que se repiten, dónde va el logo) con el contenido NUEVO de esta pieza; no copies su texto, su foto ni su producto`,
  };
}

/** El sistema de la plantilla en una línea del pedido (vacío si no tiene). Pura. */
export function lineaDePlantillaEnPedido(kitGuardado, id) {
  const p = plantillaDelKit(kitGuardado, id);
  if (!p?.sistema) return p ? `Sigue el diseño de la plantilla «${p.nombre}» (imagen de referencia): mismo sistema, contenido nuevo.` : "";
  return `Sigue el diseño de la plantilla «${p.nombre}» (imagen de referencia): ${p.sistema.replace(/^SISTEMA DE DISEÑO[^:]*:\s*/i, "")} Sólo cambia el contenido.`;
}

/** La fuente de la marca: { clave (el archivo, en `clientes/<c>/fuentes/`), nombre, muestra (imagen del cliente) } o null. */
function limpiarFuente(f) {
  const clave = typeof f?.clave === "string" && /^clientes\/[^/]+\/fuentes\/[\w.-]+$/.test(f.clave) && !f.clave.includes("..") ? f.clave : "";
  const muestra = typeof f?.muestra === "string" && /^clientes\/[^/]+\/.+/.test(f.muestra) && !f.muestra.includes("..") ? f.muestra : "";
  if (!clave || !muestra) return null;
  return { clave, muestra, nombre: corto(f?.nombre, 60) || "la tipografía de la marca" };
}

/**
 * La muestra de la tipografía como referencia de una pieza (sólo cuando el modelo escribe el texto). Null sin fuente.
 * Pura.
 */
export function referenciaDeTipografia(kitGuardado) {
  const f = limpiarKit(kitGuardado).fuente;
  if (!f) return null;
  return {
    clave: f.muestra, src: `/api/media/${f.muestra}`, toma: ["tipografia"],
    nota: `es la muestra de la tipografía de la marca (${f.nombre}): escribe TODO el texto de la pieza con ESA letra (su forma, su grosor, su estilo); no copies las palabras de la muestra`,
  };
}

/** Los personajes: id con forma, nombre, una descripción corta y de 1 a 2 imágenes (retrato y cuerpo) del cliente. */
function limpiarPersonajes(entrada) {
  const fuera = [];
  for (const p of Array.isArray(entrada) ? entrada : []) {
    const id = String(p?.id ?? "");
    const nombre = corto(p?.nombre, 40);
    const imagenes = [...new Set((Array.isArray(p?.imagenes) ? p.imagenes : []).map(String))].filter((c) => CLAVE.test(c) && !c.includes("..")).slice(0, 2);
    if (!ID_PERSONAJE.test(id) || !nombre || !imagenes.length || fuera.some((x) => x.id === id)) continue;
    fuera.push({ id, nombre, descripcion: corto(p?.descripcion, 300), imagenes });
  }
  return fuera.slice(0, MAX_PERSONAJES);
}

/**
 * Las imágenes de los personajes escogidos como referencias, cada una diciendo QUIÉN es: el modelo tiene que sacarlo
 * IGUAL (cara, pelo, ropa), no inspirarse. Sólo las que siguen en la galería. Pura.
 */
export function referenciasDePersonajes(kitGuardado, ids = [], archivos = []) {
  const kit = limpiarKit(kitGuardado);
  return kit.personajes.filter((p) => ids.includes(p.id)).flatMap((p) => p.imagenes
    .map((clave) => (archivos ?? []).find((a) => a.clave === clave))
    .filter(Boolean)
    .map((a) => ({
      ...a, toma: ["persona"],
      nota: `es «${p.nombre}», el personaje de la marca${p.descripcion ? ` (${p.descripcion.replace(/[.\s]+$/, "")})` : ""}: que salga IGUAL, con su misma cara, pelo y ropa`,
    })));
}

/** { tipo → id de estilo }: sólo tipos que existen y estilos que existen (de la casa o propios del cliente). */
function limpiarEstiloPorTipo(entrada, estilos = []) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  return Object.fromEntries(Object.entries(e)
    .filter(([tipo, id]) => TIPOS_PRESET[tipo] && (ESTILOS_VISUALES[id] || estilos.some((x) => x.id === id))));
}

const ID_MODELO = /^[a-z0-9][a-z0-9.-]{1,60}$/;
/** { imagen?, video? } con ids que parecen de modelo; si el modelo ya no existe, el Estudio cae en el predeterminado. */
function limpiarModelosKit(entrada) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  return Object.fromEntries(["imagen", "video"].filter((t) => ID_MODELO.test(String(e[t] ?? ""))).map((t) => [t, String(e[t])]));
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
  return !k.paleta.length && !k.tipografia && !k.estilo && !k.luz && !k.evitar && !Object.keys(k.presets).length && !k.propios.length && !k.estilos.length && !k.personajes.length && !k.aprendido.length && !k.reglas.length;
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
    lineaDeReglas(kit.reglas),
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
export const LINEA_VIDEO = `Video corto: movimiento de cámara suave y natural, sin cortes bruscos, ritmo tranquilo. ${SIN_TEXTO_VIDEO}`;

/** Lo que se dice del logo cuando va de referencia: que no lo redibuje. */
export const LINEA_LOGO = "Una de las imágenes de referencia es el logo de la marca: si aparece en la pieza, cópialo tal cual (forma, colores y letras), sin redibujarlo ni inventar otro.";

/** ¿Existe ese estilo para este kit? (uno de la casa o un propio del cliente). Pura. */
export const estiloValido = (id, kitGuardado) => Boolean(id) && (Boolean(ESTILOS_VISUALES[id]) || limpiarKit(kitGuardado).estilos.some((e) => e.id === id));

/**
 * El estilo de UNA pieza: el escogido si existe; si no («el del tipo»), el que el cliente fijó para ese tipo, o el de
 * la casa para ese tipo. Sin tipo y sin escoger, ninguno. Pura.
 */
export function estiloDeLaPieza(kitGuardado, preset = "", escogido = "") {
  if (estiloValido(escogido, kitGuardado)) return escogido;
  const tipo = String(preset ?? "").split("-")[0];
  if (!TIPOS_PRESET[tipo]) return "";
  const fijado = limpiarKit(kitGuardado).estiloPorTipo[tipo];
  return estiloValido(fijado, kitGuardado) ? fijado : ESTILO_POR_TIPO[tipo] ?? "";
}

/** La línea de acabado de un estilo (de la casa o propio), o vacío. Pura. */
export function lineaDeEstilo(kitGuardado, id) {
  if (ESTILOS_VISUALES[id]) return ESTILOS_VISUALES[id].linea;
  return limpiarKit(kitGuardado).estilos.find((e) => e.id === id)?.texto ?? "";
}

/** «Fotográfico», o el nombre de un estilo propio. Pura. */
export function nombreDeEstilo(kitGuardado, id) {
  return ESTILOS_VISUALES[id]?.nombre ?? limpiarKit(kitGuardado).estilos.find((e) => e.id === id)?.nombre ?? "";
}

/**
 * El pedido que va al motor: la ESCENA primero (es lo que manda), el tipo de pieza (para qué es), el estilo visual
 * (su línea de acabado), qué se toma de cada referencia (referencias.js), la identidad de la marca, el logo y, en
 * video, cómo se mueve. Sin nada de eso, la idea tal cual. Lo que se manda es lo que queda escrito en la galería.
 * `estilo` es la LÍNEA ya resuelta; `acabado` (el id de antes) se acepta por compatibilidad. Pura.
 */
export function componerPedido({ idea, preset = "", estilo = "", acabado = "", referencias = "", marca = "", logo = false, video = false }) {
  const escena = String(idea ?? "").trim();
  const lineaEstilo = String(estilo || ACABADOS[acabado]?.linea || "").trim();
  const lineasRefs = String(referencias ?? "").trim();
  if (!preset && !lineaEstilo && !lineasRefs && !marca && !logo) return escena;
  const tipo = String(preset ?? "").trim();
  return [`Escena: ${escena}`, tipo ? `${PREFIJO_TIPO} ${tipo}` : "", lineaEstilo, lineasRefs, String(marca).trim(), logo ? LINEA_LOGO : "", video ? LINEA_VIDEO : ""]
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
 * Todo el pedido de una pieza para un cliente, con su kit: lo usan la pantalla, «Producir el mes», el lote y el
 * asistente, así todos piden igual. `estilo`: el id escogido ("" = el del tipo; `acabado` es su nombre de antes).
 * `usarKit: false` deja sólo el preset, el estilo y la escena. Pura.
 */
export function pedidoConMarca({ kit, idea, preset = "", estilo = "", acabado = "", referencias = "", marca = "la marca", rubro = "", video = false, logo = false, usarKit = true }) {
  return componerPedido({
    idea,
    preset: preset ? textoPreset(kit, preset, { marca, rubro }) : "",
    estilo: lineaDeEstilo(kit, estiloDeLaPieza(kit, preset, estilo || acabado)),
    referencias,
    marca: usarKit ? bloqueDeMarca(kit) : "",
    logo: usarKit && logo && !video,
    video,
  });
}

/**
 * El estilo entero para quien pide por su cuenta (el carrusel, lámina a lámina): el preset, el estilo visual y la
 * identidad de la marca juntos, en un solo texto. Pura.
 */
export function estiloDeMarca(kit, preset, { marca = "la marca", rubro = "", estilo = "" } = {}) {
  return [preset ? textoPreset(kit, preset, { marca, rubro }) : "", lineaDeEstilo(kit, estiloDeLaPieza(kit, preset, estilo)), bloqueDeMarca(kit)].filter(Boolean).join("\n\n");
}

/** «Reglas que no se rompen: …; …». Pura. */
export const lineaDeReglas = (reglas = []) => (reglas.length ? `Reglas que no se rompen: ${reglas.join("; ")}.` : "");

/**
 * ¿Se pone el logo como referencia? Sólo en imágenes, con un modelo que
 * admita referencias, si hay hueco y si no está ya puesto. Con el logo
 * ESTAMPADO por la aplicación, nunca: el modelo no lo recibe. Pura.
 */
export function ponerLogo({ kit, tipo, modelo, referencias = [] }) {
  const { logo, logoModo } = limpiarKit(kit);
  if (!logo || logoModo === "estampado" || tipo === "video" || !(modelo?.referencias > 0)) return false;
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
  return limpiarKit({
    ...propuesto, logo: antes.logo, propios: antes.propios, estilos: antes.estilos, estiloPorTipo: antes.estiloPorTipo, personajes: antes.personajes,
    aprendido: antes.aprendido, referencias: antes.referencias, modelos: antes.modelos, reglas: antes.reglas,
    logoModo: antes.logoModo, logoPosicion: antes.logoPosicion, fuente: antes.fuente, voz: antes.voz, plantillas: antes.plantillas, preparadoAt: ahora,
  });
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
    lineaDeReglas(kit.reglas),
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
