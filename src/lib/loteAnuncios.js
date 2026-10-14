// ============================================================
// El lote de anuncios por nivel de consciencia (puro)
//
// Lo que la agencia hacía a mano: para un producto, varias piezas por cada
// nivel de consciencia (Schwartz) —del que no sabe que tiene el problema al
// que sólo necesita el empujón—, con su gancho, el precio EXACTO del
// catálogo y el producto real.
//
//   1. Se escoge el producto, cuántas por nivel, el formato, el tipo de pieza,
//      el modelo y cómo va el texto (plantilla, por defecto, o lo escribe la IA).
//   2. La IA escribe las IDEAS (titular, apoyo y escena) con el estudio de
//      mercado y el cerebro delante: texto, no gasta en el motor.
//   3. Una persona las revisa, quita las que no y ve el costo total ANTES de
//      pedir nada. Sólo entonces se crean, en cola, en una carpeta del lote.
//   4. Cada pieza se lleva al calendario con un botón.
//
// QUE NO SALGAN TODAS IGUALES. La primera versión dejaba la forma de cada
// pieza al criterio del modelo y la plantilla ponía la misma banda abajo:
// veinte piezas que sólo cambiaban de foto y de texto. Lo que no se da
// resuelto, el modelo lo resuelve igual cada vez (la regla de la skill
// «prompt maestro»), así que ahora lo decide el CÓDIGO pieza por pieza
// (`planDeLote`): la COMPOSICIÓN (producto héroe, en uso, cenital, detalle,
// tipográfica…), el FONDO, la PUERTA por la que entra al argumento
// (situación, cifra, objeción… ninguna más de dos veces) y el PRODUCTO, que
// con «la marca en general» rota por el catálogo: así cada pieza lleva las
// fotos REALES de su producto. La plantilla de texto sigue a la composición.
//
// Lo usan la pantalla (EstudioLote.jsx) y el Worker (worker/lib/estudio/lote.js).
// ============================================================

import { NIVELES_CONSCIENCIA, CLAVES_NIVEL, nombreDeNivel } from "./consciencia.js";
import { PLANTILLAS_TEXTO } from "./carrusel.js";

export const POR_NIVEL = 5;
export const MAX_POR_NIVEL = 10;
export const MAX_LOTE = 30;
export const MAX_TITULAR = 60;
export const MAX_APOYO = 110;
export const MAX_ESCENA = 400;

/** Los formatos de un anuncio: la proporción de la imagen y el formato de la publicación. */
export const FORMATOS_LOTE = Object.freeze({
  post: { nombre: "Post 4:5", aspectRatio: "4:5", format: "post" },
  historia: { nombre: "Historia 9:16", aspectRatio: "9:16", format: "historia" },
  cuadrado: { nombre: "Cuadrado 1:1", aspectRatio: "1:1", format: "post" },
});

/** Dónde va el texto en la plantilla, según el formato (en una historia, abajo tapa los botones de Instagram). */
export const plantillaDeFormato = (formato) => (formato === "historia" ? "centro" : "banda");

/**
 * Las composiciones: CÓMO se ve cada pieza, dado resuelto. `plantilla`: dónde va el texto si lo pone la plantilla
 * (en una historia, nunca abajo). El orden importa: se reparten en saltos de 4, así dos seguidas nunca se parecen.
 */
export const COMPOSICIONES = Object.freeze([
  { id: "heroe", nombre: "Producto héroe", linea: "Composición: el producto como protagonista absoluto, en primer plano y ligeramente en ángulo, sobre un fondo limpio; plano cerrado.", plantilla: "banda" },
  { id: "uso", nombre: "En uso", linea: "Composición: una persona real usando el producto en un momento cotidiano, plano medio, gesto natural; el producto se reconoce.", plantilla: "arriba" },
  { id: "cenital", nombre: "Vista cenital", linea: "Composición: vista cenital (desde arriba) ordenada, el producto con pocos objetos de su entorno alrededor, mucho espacio libre.", plantilla: "degradado" },
  { id: "detalle", nombre: "Detalle", linea: "Composición: macro de un detalle o una textura del producto, fondo desenfocado, sensación táctil.", plantilla: "arriba" },
  { id: "tipografica", nombre: "Tipográfica", linea: "Composición de diseño gráfico: un gran bloque de color de la paleta domina la pieza y el producto ocupa sólo un tercio, recortado limpio a un lado.", plantilla: "centro" },
  { id: "ambiente", nombre: "Ambiente", linea: "Composición: el producto dentro de su ambiente real (el lugar donde se usa), plano abierto, luz que entra de lado, mucho aire alrededor.", plantilla: "degradado" },
  { id: "dividida", nombre: "Antes y después", linea: "Composición dividida en dos mitades: a un lado el problema, al otro la solución con el producto; el cambio se entiende de un vistazo.", plantilla: "banda" },
  { id: "emocion", nombre: "Emoción", linea: "Composición: primer plano de una cara con una emoción clara (alivio, alegría, tranquilidad); el producto, cerca y secundario.", plantilla: "arriba" },
  { id: "serie", nombre: "Serie", linea: "Composición editorial en cuadrícula: dos o tres tomas del producto (o de varios productos) en paneles ordenados, como una página de revista.", plantilla: "centro" },
]);

/** Por dónde entra la pieza al argumento (de la skill «prompt maestro»): ninguna más de dos veces por lote. */
export const PUERTAS = Object.freeze([
  ["situacion", "una situación concreta que vive quien lo lee"],
  ["cifra", "una cifra o un dato EXACTO del catálogo o del estudio"],
  ["objecion", "la duda que frena la compra, y su respuesta"],
  ["mecanismo", "cómo funciona o por qué funciona"],
  ["comparacion", "lo de siempre frente a esto (sin nombrar a nadie)"],
  ["proceso", "lo fácil que es: los pasos para tenerlo"],
  ["consecuencia", "qué le cambia a quien lo compra"],
  ["si-no-hace-nada", "lo que pasa si no hace nada"],
]);

/** El fondo: la tercera cosa que, igual en todas, hace que un lote parezca una plantilla. */
export const FONDOS = Object.freeze([
  ["claro", "Fondo claro y luminoso, de los tonos de fondo de la paleta."],
  ["color", "Fondo de color pleno con el color dominante de la paleta."],
  ["real", "Fondo de un lugar real, fotográfico, con la paleta presente en los objetos."],
]);

const plantillaPara = (comp, formato) => (formato === "historia" && comp.plantilla === "banda" ? "centro" : comp.plantilla);

/**
 * El plan del lote: una ranura por pieza, con su nivel, su composición, su fondo, su puerta y su producto. `productos`:
 * [{ id }] — con uno, todas de ese; con varios («la marca en general»), rotan, así cada pieza lleva las fotos REALES
 * de un producto. `semilla` mueve el punto de partida: dos lotes del mismo cliente no empiezan igual. Pura.
 */
export function planDeLote(cuantas = {}, { productos = [], semilla = 0, formato = "post" } = {}) {
  const c = limpiarCuantas(cuantas);
  const s = Math.abs(Math.floor(Number(semilla) || 0));
  const ranuras = [];
  for (const clave of CLAVES_NIVEL) {
    for (let k = 0; k < (c[clave] ?? 0); k++) {
      const i = ranuras.length;
      const comp = COMPOSICIONES[(s + i * 4) % COMPOSICIONES.length];
      ranuras.push({
        n: i + 1,
        nivel: clave,
        composicion: comp.id,
        plantilla: plantillaPara(comp, formato),
        fondo: FONDOS[(s + i) % FONDOS.length][0],
        puerta: PUERTAS[(s + i * 3) % PUERTAS.length][0],
        ...(productos.length ? { productoId: productos[(s + i) % productos.length].id } : {}),
      });
    }
  }
  return ranuras;
}

const lineaDe = (lista, id) => lista.find(([x]) => x === id)?.[1] ?? "";
const composicionDe = (id) => COMPOSICIONES.find((x) => x.id === id) ?? null;

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();

/** Cuántas por nivel, limpio: sólo niveles que existen, de 0 a MAX_POR_NIVEL, y el total con tope. Pura. */
export function limpiarCuantas(entrada = {}) {
  const fuera = {};
  let total = 0;
  for (const clave of CLAVES_NIVEL) {
    const n = Math.max(0, Math.min(MAX_POR_NIVEL, Math.floor(Number(entrada?.[clave]) || 0)));
    const cabe = Math.min(n, MAX_LOTE - total);
    if (cabe > 0) { fuera[clave] = cabe; total += cabe; }
  }
  return fuera;
}

export const totalDeCuantas = (cuantas) => Object.values(limpiarCuantas(cuantas)).reduce((a, b) => a + b, 0);

/** Las cuántas por defecto: POR_NIVEL en cada nivel. */
export const cuantasPorDefecto = () => Object.fromEntries(CLAVES_NIVEL.map((c) => [c, POR_NIVEL]));

/**
 * Lo que se le pide a la IA para escribir las ideas. `producto`: la línea del catálogo (con su precio); `estudio`: el
 * estudio de ese producto y lo general (texto); `contexto`: el cerebro para escribir (sin lo interno). Con `plan`
 * (planDeLote) y `productos` ({ id → línea del catálogo }), la IA escribe UNA idea por ranura con la forma ya
 * decidida; sin plan, como antes, por nivel. Pura.
 */
export function pedidoDeIdeasLote({ marca = "la marca", producto = "", estudio = "", contexto = "", cuantas = {}, formato = "post", plan = null, productos = {}, usados = [] }) {
  const c = limpiarCuantas(cuantas);
  const niveles = NIVELES_CONSCIENCIA.filter((n) => c[n.clave]);
  const conPlan = Array.isArray(plan) && plan.length > 0;
  const nivelDe = (clave) => NIVELES_CONSCIENCIA.find((n) => n.clave === clave);
  return [
    `Escribe ideas de ANUNCIOS de una sola imagen (${FORMATOS_LOTE[formato]?.nombre ?? "post"}) para ${marca}, para este producto:`,
    producto || (conPlan && Object.keys(productos).length ? "(la marca en general: cada pieza dice su producto, del catálogo)" : "(sin producto concreto: la marca)"),
    "",
    ...(conPlan
      ? [
          `Son ${plan.length} piezas. Cada una tiene YA decidido su nivel de consciencia, su puerta de entrada (por dónde entra al argumento), su composición y su fondo: respétalos.`,
          ...plan.map((r) => {
            const nv = nivelDe(r.nivel);
            return `${r.n}. ${nv?.nombre ?? r.nivel} (${nv?.ayuda ?? ""}; por ${nv?.angulo === "dolor" ? "el dolor" : "la ganancia"}) · puerta: ${lineaDe(PUERTAS, r.puerta)} · composición: ${composicionDe(r.composicion)?.nombre ?? ""}${r.productoId && productos[r.productoId] ? ` · producto: ${productos[r.productoId]}` : ""}`;
          }),
        ]
      : [
          "Cuántas por nivel de consciencia del público:",
          ...niveles.map((n) => `- ${n.clave} (${n.nombre}: ${n.ayuda}; se toca por ${n.angulo === "dolor" ? "el dolor" : "la ganancia"}): ${c[n.clave]}`),
        ]),
    "",
    "Cada idea tiene:",
    `- "titular": el texto grande de la pieza, de 8 palabras como mucho (${MAX_TITULAR} caracteres).`,
    `- "apoyo": una línea corta debajo (${MAX_APOYO} caracteres como mucho). Puede ir vacía.`,
    `- "escena": qué se VE en la imagen, en una o dos frases, SIN texto (el texto va aparte), con la composición de su pieza. Con el producto real si aparece.`,
    "",
    "Reglas:",
    "- Cada idea con un ángulo distinto: ni dos titulares parecidos, ni dos escenas en el mismo lugar con la misma acción.",
    "- Inconsciente y problema: habla del dolor o la situación. Producto y listo para comprar: el producto, la prueba y la oferta.",
    "- El precio y la oferta, sólo si están en el catálogo y EXACTOS como allí. No inventes precios, descuentos, garantías ni cifras.",
    "- No copies literal frases de lo que se sabe de la marca: son la forma de decirlo, no el texto.",
    "- No nombres a la competencia.",
    usados.length ? `- Estos titulares ya salieron: no repitas ninguno ni su idea:\n${usados.slice(0, 30).map((t) => `  · ${corto(t, MAX_TITULAR)}`).join("\n")}` : "",
    "",
    estudio ? `ESTUDIO DE MERCADO:\n${String(estudio).slice(0, 9000)}\n` : "",
    contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 6000)}\n` : "",
    conPlan
      ? 'Responde SOLO con JSON, una idea por pieza con su número, así: {"ideas":[{"n":1,"titular":"…","apoyo":"…","escena":"…"}]}'
      : 'Responde SOLO con JSON, así: {"ideas":[{"nivel":"inconsciente","titular":"…","apoyo":"…","escena":"…"}]}',
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

const deJSON = (texto) => {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};

const ideaLimpia = (x) => {
  const titular = corto(x?.titular, MAX_TITULAR).replace(/^["«“]|["»”]$/g, "");
  const escena = corto(x?.escena, MAX_ESCENA);
  return titular && escena ? { titular, apoyo: corto(x?.apoyo, MAX_APOYO), escena } : null;
};

/**
 * La respuesta de la IA → las ideas. Sin plan: como mucho las pedidas por nivel, en el orden de los niveles. Con plan:
 * una por ranura (por su número; si no lo trae, por orden), y cada idea lleva lo que decidió el plan. Pura.
 */
export function leerIdeasLote(texto, cuantas = {}, plan = null) {
  const d = deJSON(texto);
  const lista = Array.isArray(d?.ideas) ? d.ideas : Array.isArray(d) ? d : [];
  if (Array.isArray(plan) && plan.length) {
    const porNumero = new Map();
    lista.forEach((x, i) => {
      const n = Number(x?.n) || i + 1;
      if (!porNumero.has(n)) porNumero.set(n, x);
    });
    const vistos = Object.fromEntries(CLAVES_NIVEL.map((k) => [k, 0]));
    return plan.flatMap((r) => {
      const limpia = ideaLimpia(porNumero.get(r.n));
      if (!limpia) return [];
      vistos[r.nivel] += 1;
      return [{ id: `${r.nivel}-${vistos[r.nivel]}`, ...r, ...limpia, elegida: true }];
    });
  }
  const c = limpiarCuantas(cuantas);
  const porNivel = Object.fromEntries(CLAVES_NIVEL.map((k) => [k, []]));
  for (const x of lista) {
    const nivel = String(x?.nivel ?? "").toLowerCase().trim();
    if (!porNivel[nivel] || porNivel[nivel].length >= (c[nivel] ?? 0)) continue;
    const limpia = ideaLimpia(x);
    if (!limpia) continue;
    porNivel[nivel].push({ id: `${nivel}-${porNivel[nivel].length + 1}`, nivel, ...limpia, elegida: true });
  }
  return CLAVES_NIVEL.flatMap((k) => porNivel[k]);
}

/** «Titular\nApoyo»: lo que va escrito en la pieza (y en `textoPieza` de la publicación). Pura. */
export const textoDeIdea = (idea) => [corto(idea?.titular, MAX_TITULAR), corto(idea?.apoyo, MAX_APOYO)].filter(Boolean).join("\n");

/** Dónde va el texto de una idea en la plantilla: el de su composición, o el del formato si no trae. Pura. */
export const plantillaDeIdea = (idea, formato = "post") => (PLANTILLAS_TEXTO[idea?.plantilla] ? idea.plantilla : plantillaDeFormato(formato));

/**
 * La escena del pedido de UNA pieza del lote: lo que se ve, su composición y su fondo (si los trae del plan) y el texto.
 * Con `modo: "ia"` el motor escribe el texto EXACTO; con «plantilla», deja el hueco y el texto se pone encima después.
 * Lo demás (tipo de pieza, referencias, marca, logo) lo añade `pedidoConMarca`. Pura.
 */
export function escenaDeAnuncio(idea, { modo = "plantilla", formato = "post" } = {}) {
  const zona = PLANTILLAS_TEXTO[plantillaDeIdea(idea, formato)]?.zona ?? PLANTILLAS_TEXTO.banda.zona;
  const lineas = textoDeIdea(idea).split("\n").map((l) => `"${l.replace(/["“”«»]/g, "")}"`);
  return [
    corto(idea?.escena, MAX_ESCENA),
    composicionDe(idea?.composicion)?.linea ?? "",
    lineaDe(FONDOS, idea?.fondo),
    modo === "ia"
      ? `Texto en la imagen, EXACTO, legible y bien jerarquizado (lo primero grande): ${lineas.join(" / ")}. Ningún otro texto.`
      : `NO escribas ningún texto, letra ni número en la imagen: el texto se pone después. Deja ${zona} limpio y despejado, con buen contraste.`,
  ].filter(Boolean).join(" ");
}

/** El nombre de la carpeta del lote en la galería. Pura. */
export function nombreCarpetaLote(producto = "", fecha = new Date()) {
  const dia = fecha.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" }).replace(/\./g, "");
  return corto(`Lote ${producto || "anuncios"} · ${dia}`, 40);
}

/**
 * La publicación que sale de una pieza del lote, lista para meterla en un día: un anuncio (tipo de contenido), con su
 * nivel, su producto, el texto de la pieza y la imagen. Pendiente: la ve el cliente. Pura.
 */
export function publicacionDeAnuncio({ id, idea, archivo, formato = "post", producto = null }) {
  return {
    id,
    format: FORMATOS_LOTE[formato]?.format ?? "post",
    title: idea.titular,
    idea: idea.escena,
    textoPieza: textoDeIdea(idea),
    pilar: "anuncio",
    nivel: idea.nivel,
    ...(producto ? { productoId: producto.id, producto: producto.nombre } : {}),
    status: "pending",
    medios: [{ src: archivo.src, tipo: "imagen", ...(archivo.ancho && archivo.alto ? { ancho: archivo.ancho, alto: archivo.alto } : {}) }],
  };
}

/** «Inconsciente · 5», para los títulos de cada grupo. Pura. */
export const tituloDeNivel = (clave, n) => `${nombreDeNivel(clave)} · ${n}`;

/**
 * Los titulares que ya salieron en la galería de este cliente (el texto de las piezas compuestas y el que se le pidió
 * escribir al motor), para que el lote siguiente no los repita: el índice en negativo de la skill. Pura.
 */
export function titularesUsados(archivos = [], max = 30) {
  const fuera = [];
  for (const a of archivos ?? []) {
    const deTexto = String(a?.ajustes?.plantilla?.texto ?? "").split("\n")[0];
    const delPedido = String(a?.prompt ?? "").match(/Texto en la imagen[^:]*:\s*"([^"]+)"/)?.[1] ?? "";
    const t = corto(deTexto || delPedido, MAX_TITULAR);
    if (t && !fuera.includes(t)) fuera.push(t);
    if (fuera.length >= max) break;
  }
  return fuera;
}
