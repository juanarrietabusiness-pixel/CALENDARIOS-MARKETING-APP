// ============================================================
// La PRODUCCIÓN EN LOTE del Estudio (puro)
//
// La versión de la agencia de una matriz de producción de anuncios, pero
// para TODOS los tipos de pieza del calendario. Tres formas de llenar el
// lote, el mismo camino después:
//
//   · ANUNCIOS EN MATRIZ: los 3 deseos (Reiss) × los 2 perfiles del estudio
//     de mercado aprobado × los niveles de consciencia (Schwartz) que se
//     marquen: hasta 30 piezas, una por casilla, cada una con su gancho. Sin
//     estudio aprobado, por niveles (cuántas por cada uno).
//   · POR TIPO DE PIEZA: cuántas de cada tipo (educativo, diferenciador, 7
//     maletas…); la matriz del mes (`asignarMatriz`) les da producto, nivel,
//     deseo, perfil y la maleta que toca.
//   · EL MES COMPLETO (loteMes.js): un día, una pieza, con el ritmo.
//
// Después, igual para las tres:
//   1. El CÓDIGO decide la forma de cada pieza (`darForma`): composición,
//      fondo, táctica del gancho, producto y si el producto SE VE. Lo que no
//      se da resuelto el modelo lo resuelve igual cada vez, y salían veinte
//      piezas que sólo cambiaban de foto y de texto.
//   2. La IA escribe cada pieza: título, brief (qué comunica), titular,
//      apoyo, escena y descripción. Es texto: no gasta en el motor.
//   3. Una persona revisa, quita y corrige, y ve el costo. Se crea (con la
//      escena mejorada sola y 1–3 imágenes por idea), se escoge una y la
//      publicación va al calendario lista para revisión.
//
// Reglas de oficio que van en el código o en el pedido:
//   · El producto se VE sólo de «consciente de la solución» en adelante: a
//     quien no sabe que tiene el problema se le habla del problema.
//   · Sin producto en la imagen (o una marca de servicio), nada de
//     composiciones que necesitan un objeto: una «macro de textura» sin
//     objeto se rellena con cualquier cosa.
//   · Al menos un tercio de las piezas con producto lo enseñan EN USO o en
//     su lugar, y entran el selfie con el celular y la macro de textura.
//   · Titular corto (40 caracteres, 8 palabras), sin «·» (sale como «¿»),
//     sin cifras, reseñas ni urgencias inventadas, y sin marcas en lo que no
//     es el producto real.
//
// Lo usan la pantalla (EstudioLote.jsx) y el Worker (worker/lib/estudio/).
// ============================================================

import { NIVELES_CONSCIENCIA, CLAVES_NIVEL, nombreDeNivel } from "./consciencia.js";
import { lineaDeNotaDelDia } from "./notasSemana.js";
import { PLANTILLAS_TEXTO } from "./carrusel.js";
import { PILARES, pilarDe, nombreDePilar, COMPOSICIONES, composicionDe } from "./pilares.js";
import { estructuraDe, estructuraPara, limpiarEstructurasRecientes, lineaDeEstructura } from "./estructurasCarrusel.js";
import { camposDePromptListo } from "./promptImagen.js";
import { FORMATO_FICHA, limpiarFicha, asegurarTexto, ajustarFicha } from "./director.js";
import { llevaCaption, llevaHashtags, separarHashtags } from "./reglasFormato.js";
import { MAX_LENGUAJE } from "./lenguajeCliente.js";
import { formaDe, formaPara, formasParaGanchos, formasPosibles, lineaDeForma, lineaDeGanchosUgc, cuentaDeFormas, limpiarFormasRecientes, REGLA_GANCHO } from "./formasGancho.js";

export const POR_NIVEL = 5;
export const MAX_POR_NIVEL = 10;
export const MAX_LOTE = 30;
/** El titular: los que funcionan miden unos 32 caracteres; de 40 en adelante se parte en tres o cuatro líneas. */
export const MAX_TITULAR = 40;
export const MAX_APOYO = 90;
export const MAX_ESCENA = 400;
/** El pedido de la imagen ya listo (escena + texto exacto), como el de «Mejorar idea». */
export const MAX_IMAGEN = 1_500;
export const MAX_BRIEF = 300;
export const MAX_DESCRIPCION = 600;
export const MAX_TITULO = 60;
export const MAX_HASHTAGS = 300;
/** Por qué funciona el gancho, en una línea (lo lee quien revisa el lote). */
export const MAX_PORQUE = 160;

/** Los formatos: la proporción de la imagen y el formato de la publicación. */
export const FORMATOS_LOTE = Object.freeze({
  post: { nombre: "Post 4:5", aspectRatio: "4:5", format: "post" },
  historia: { nombre: "Historia 9:16", aspectRatio: "9:16", format: "historia" },
  cuadrado: { nombre: "Cuadrado 1:1", aspectRatio: "1:1", format: "post" },
  // Los guiados: la IA escribe además su GUION (las láminas, o los planos de 10 s), y se crean como a mano.
  carrusel: { nombre: "Carrusel", aspectRatio: "4:5", format: "carrusel", guiado: true },
  reel: { nombre: "Reel IA 10 s", aspectRatio: "9:16", format: "reel", guiado: true },
});

/**
 * Qué ES cada formato, dicho a la IA: sin esto, «una publicación de post» era ambiguo y a veces proponía un carrusel o
 * un reel para un post. La idea tiene que ser del formato escogido, nunca de otro.
 */
export const REGLA_FORMATO = Object.freeze({
  post: "Es un POST de UNA sola imagen fija (4:5): la idea se resuelve en una imagen. No propongas carrusel, video ni reel.",
  cuadrado: "Es un POST de UNA sola imagen fija cuadrada: la idea se resuelve en una imagen. No propongas carrusel, video ni reel.",
  historia: "Es una HISTORIA de Instagram: una sola imagen vertical 9:16 que se ve unos segundos; una idea rápida y directa. No lleva caption ni hashtags (no se publican en una historia): lo que dice va en la pieza. No propongas carrusel ni reel.",
  carrusel: "Es un CARRUSEL de varias láminas que se deslizan: la idea se desarrolla lámina a lámina. No propongas una sola imagen ni un video.",
  reel: "Es un REEL: un video vertical de 10 segundos con varios planos. No propongas una imagen fija ni un carrusel.",
  // Sólo en el modo «campos» (lo que le falta a una publicación ya en el calendario): un directo no se diseña ni se idea en lote.
  live: "Es un DIRECTO (live) en vivo: los temas de la transmisión y el caption que la anuncia. No propongas una imagen ni un carrusel.",
});

/** El guion que se le pide a la IA en un formato guiado (vacío en los de una imagen). */
export const GUION_DE_FORMATO = Object.freeze({
  carrusel: '- "guion": las láminas del carrusel siguiendo SU estructura (la que dice cada pieza) y su número de láminas, una por línea: «Portada: …», «Slide 1: …», …, «CTA: …». La portada promete algo concreto de esa estructura (no un título genérico); cada lámina, una idea corta que se lee en dos segundos; el precio, EXACTO. Dos carruseles no se parecen.',
  reel: '- "guion": el reel de 10 s por planos, una línea por plano con su tiempo: «[0–2 s] qué se ve · cámara», …, y el último cierra con el producto o el resultado. SIN texto en pantalla: el video va limpio (los modelos de video escriben mal).',
  live: '- "guion": los temas del directo en viñetas, uno por línea («- …»), en el orden en que se hablan, con el llamado a la acción al final.',
});
export const MAX_GUION = 2000;

/** Dónde va el texto en la plantilla, según el formato (en una historia, abajo tapa los botones de Instagram). */
export const plantillaDeFormato = (formato) => (formato === "historia" ? "centro" : "banda");

// Las composiciones viven en pilares.js (lo lee también lib/estudio.js, que carga el panel de cada publicación y no debe
// arrastrar este archivo entero). Se reexportan: quien las importaba de aquí no cambia.
export { COMPOSICIONES, composicionDe };

/** La táctica del gancho: el ángulo con que se escribe el titular. Ninguna se inventa datos. */
export const TACTICAS = Object.freeze([
  ["curiosidad", "curiosidad: abre una pregunta que sólo la pieza responde"],
  ["pregunta", "pregunta directa a quien lo lee"],
  ["identidad", "identidad: «esto es para ti si…»"],
  ["comparacion", "comparación: lo de siempre frente a esto (sin nombrar a nadie)"],
  ["precio", "el precio o la oferta EXACTOS del catálogo como gancho"],
  ["autoridad", "autoridad: lo que la marca sabe o lleva haciendo (sólo lo que esté escrito)"],
  ["prueba", "prueba: un dato o una cifra REAL (sólo si está escrita; si no, otra táctica)"],
  ["urgencia", "urgencia: sólo con una fecha o un cupo REAL; si no hay, otra táctica"],
  // Los tres sesgos del curso que faltaban (SESGOS de tiposArte.js); los ids de antes no cambian, así lo guardado en
  // `post.tactica` sigue valiendo.
  ["reciprocidad", "reciprocidad: da algo de valor primero (un consejo útil o un regalo REAL de la marca; si no hay regalo, el consejo)"],
  ["empatia", "empatía: habla como alguien que vive lo mismo que quien lee, con sus palabras"],
  ["microcompromiso", "micro-compromiso: pide un paso pequeño y fácil (escribir una palabra, guardar la pieza), no la compra"],
]);

/** El fondo: la tercera cosa que, igual en todas, hace que un lote parezca una plantilla. */
export const FONDOS = Object.freeze([
  ["claro", "Fondo claro y luminoso, de los tonos de fondo de la paleta."],
  ["color", "Fondo de color pleno con el color dominante de la paleta."],
  ["real", "Fondo de un lugar real, fotográfico, con la paleta presente en los objetos."],
]);

/** Los niveles donde el producto NO se ve: a quien no sabe que tiene el problema se le habla del problema. */
const SIN_PRODUCTO_EN = new Set(["inconsciente", "problema"]);

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const lineaDe = (lista, id) => lista.find(([x]) => x === id)?.[1] ?? "";
// Las estructuras de un carrusel viven en su módulo (pequeño: lo leen también «Dame ideas» y el director).
export { ESTRUCTURAS_CARRUSEL, estructuraDe, estructuraPara, limpiarEstructurasRecientes, estructurasDeCalendarios, lineaDeEstructura } from "./estructurasCarrusel.js";

const mcd = (a, b) => (b ? mcd(b, a % b) : a);
/** Un salto que recorre la lista entera antes de repetir y no deja dos vecinas seguidas. */
const saltoPara = (n) => [5, 3, 7, 1].find((k) => k < n && mcd(k, n) === 1) ?? 1;

// ------------------------------------------------------------
// Las casillas del lote
// ------------------------------------------------------------

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

/** Anuncios por nivel: [{ tipo: "anuncio", nivel }]. Pura. */
export function celdasPorNiveles(cuantas = {}) {
  const c = limpiarCuantas(cuantas);
  return CLAVES_NIVEL.flatMap((nivel) => Array.from({ length: c[nivel] ?? 0 }, () => ({ tipo: "anuncio", nivel })));
}

/**
 * Anuncios en MATRIZ: cada deseo × cada perfil × cada nivel marcado, en orden de embudo (inconsciente → listo para
 * comprar) dentro de cada deseo y perfil. Con tope de MAX_LOTE. Pura.
 */
export function celdasMatriz({ deseos = [], perfiles = [], niveles = CLAVES_NIVEL } = {}) {
  const ns = CLAVES_NIVEL.filter((n) => niveles.includes(n));
  const ds = deseos.filter(Boolean).slice(0, 3);
  const ps = perfiles.filter(Boolean).slice(0, 2);
  const fuera = [];
  for (const deseo of ds.length ? ds : [""]) {
    for (const perfil of ps.length ? ps : [""]) {
      for (const nivel of ns) fuera.push({ tipo: "anuncio", nivel, ...(deseo ? { deseo } : {}), ...(perfil ? { perfil } : {}) });
    }
  }
  return fuera.slice(0, MAX_LOTE);
}

/** Por tipo de pieza: { educativo: 3, maletas: 4 } → [{ tipo }], en el orden de los tipos, con tope. Pura. */
export function celdasPorTipos(cuantas = {}) {
  const fuera = [];
  for (const p of PILARES) {
    const n = Math.max(0, Math.min(MAX_POR_NIVEL, Math.floor(Number(cuantas?.[p.id]) || 0)));
    for (let i = 0; i < n && fuera.length < MAX_LOTE; i++) fuera.push({ tipo: p.id });
  }
  return fuera;
}

/** ¿Se VE el producto en esta casilla? Si su tipo lleva producto y su nivel no es de los fríos. Pura. */
export function seVeElProducto(celda, hayProductos = true) {
  if (!hayProductos) return false;
  const p = pilarDe(celda?.tipo ?? celda?.pilar);
  if (p && !p.producto) return false;
  return !SIN_PRODUCTO_EN.has(celda?.nivel);
}

/** Cuántas opciones da el código por casilla para la táctica, la forma del gancho y el ángulo: la IA escoge entre ellas. */
export const OPCIONES_POR_CASILLA = 3;

/**
 * ¿Vale esta táctica para esta casilla? Las que piden un dato REAL (el precio, una prueba) sólo si el cliente lo tiene;
 * el precio, nunca en los niveles fríos (el producto no se ve); la urgencia, sólo con una fecha especial ese día. Pura.
 */
export function tacticaValida(id, celda = {}, { hayDatos = false } = {}) {
  if (id === "precio") return hayDatos && !SIN_PRODUCTO_EN.has(celda.nivel);
  if (id === "prueba") return hayDatos;
  if (id === "urgencia") return Boolean(celda.especial);
  return TACTICAS.some(([x]) => x === id);
}

/**
 * Las OPCIONES de una casilla (lo que la IA puede escoger, todo dentro de las reglas del código): la táctica, la forma del
 * gancho y el ángulo que el código sugiere van primero, y detrás hasta dos más que también cumplen (su nivel, la pauta,
 * los datos reales, no la de la vecina, no las que no le rinden al cliente, las menos usadas). Lo que ya trae la casilla
 * (una forma o un ángulo puestos) o una UGC (sus 3 ganchos dependen de su forma) no se ofrece: va fijo. Pura.
 */
function opcionesDe(c, { tactica, formaGancho, angulo }, { formato, hayDatos, tacticaPrevia, formaPrevia, anguloPrevio, cuenta, aprendidas, angulos, s, i }) {
  const fuera = {};
  // Las demás, rotando desde la sugerida (cada casilla ofrece otras), sin la de la vecina ni las que no le valen.
  const desde = TACTICAS.findIndex(([x]) => x === tactica);
  const tacticas = [tactica, ...TACTICAS.map((_, k) => TACTICAS[(desde + 1 + k * 4 + s + i) % TACTICAS.length][0])]
    .filter((x, k, todas) => todas.indexOf(x) === k && (k === 0 || (x !== tacticaPrevia && tacticaValida(x, c, { hayDatos }))))
    .slice(0, OPCIONES_POR_CASILLA);
  if (tacticas.length > 1) fuera.tacticas = tacticas;
  if (!formaDe(c.formaGancho) && !c.rostro) {
    const malas = new Set(aprendidas?.malas ?? []);
    const posibles = formasPosibles({ nivel: c.nivel, formato: c.formato ?? formato, pauta: Boolean(c.pauta), hayDatos })
      .map((f) => f.id).filter((id) => id !== formaGancho && id !== formaPrevia);
    const sinMalas = posibles.filter((id) => !malas.has(id));
    const lista = (sinMalas.length >= 2 ? sinMalas : posibles).sort((a, b) => (cuenta.get(a) ?? 0) - (cuenta.get(b) ?? 0));
    const formas = [formaGancho, ...lista].slice(0, OPCIONES_POR_CASILLA);
    if (formas.length > 1) fuera.formas = formas;
  }
  const todos = Array.isArray(angulos?.[c.productoId]) ? angulos[c.productoId].filter((a) => a?.id && a?.nombre) : [];
  if (angulo && todos.length > 1 && c.angulo !== angulo.id) {
    const quiere = NIVELES_FRIOS.has(c.nivel) ? "frio" : c.nivel ? "tibio" : "";
    const otros = todos.filter((a) => a.id !== angulo.id && a.id !== anguloPrevio && (!quiere || !a.publico || a.publico === quiere));
    const lista = [angulo, ...otros].slice(0, OPCIONES_POR_CASILLA).map((a) => ({ id: a.id, nombre: a.nombre, linea: a.linea ?? "" }));
    if (lista.length > 1) fuera.angulos = lista;
  }
  return Object.keys(fuera).length ? fuera : null;
}

/**
 * La FORMA de cada pieza: producto (si se ve y no lo trae), composición (sin las que necesitan objeto cuando no hay
 * producto en cuadro; en el orden `orden` si se aprendió cuáles funcionan), fondo, táctica y dónde va el texto. Dos
 * vecinas nunca comparten composición. `semilla` mueve el punto de partida. La táctica, la forma del gancho y el ángulo
 * llevan además sus OPCIONES (`opciones`: 2–3 válidas; la IA escoge y dice por qué). Pura.
 */
export function darForma(celdas = [], {
  productos = [], semilla = 0, formato = "post", orden = null, estructuras = [],
  formas = [], formasAprendidas = null, angulos = null, hayDatos = false,
} = {}) {
  const s = Math.abs(Math.floor(Number(semilla) || 0));
  // `orden` (aprenderComposiciones): sólo las que funcionan, las mejores repetidas para que salgan más. Si se queda
  // corta (menos de 3 sin objeto), todas: un lote sin producto en cuadro no puede quedarse sin opciones.
  const aprendidas = (Array.isArray(orden) ? orden : []).map(composicionDe).filter(Boolean);
  const conObjeto = aprendidas.length >= 4 ? aprendidas : [...COMPOSICIONES];
  const sinObjeto = conObjeto.filter((c) => !c.objeto).length >= 3 ? conObjeto.filter((c) => !c.objeto) : COMPOSICIONES.filter((c) => !c.objeto);
  let iProd = 0;
  let iCon = 0;
  let iSin = 0;
  let previa = "";
  // Las estructuras de los carruseles: las recientes del cliente y las que se van dando en este plan.
  const usadas = limpiarEstructurasRecientes(estructuras);
  let iCarrusel = 0;
  // Las formas de gancho (lib/formasGancho.js): las recientes del cliente cuentan como ya usadas, y las de este plan
  // también, así no se repiten; ninguna igual a la de la vecina.
  const cuentaFormas = cuentaDeFormas(limpiarFormasRecientes(formas));
  let formaPrevia = "";
  // Los ángulos de venta de cada producto (del estudio APROBADO): sin repetir el mismo dos veces seguidas.
  const usosAngulo = new Map();
  let anguloPrevio = "";
  let tacticaPrevia = "";
  return celdas.map((c, i) => {
    const esCarrusel = (c.formato ?? formato) === "carrusel";
    const estructura = esCarrusel ? (estructuraDe(c.estructura)?.id ?? estructuraPara(c.tipo ?? c.pilar, { usadas, semilla: s, indice: iCarrusel++ })) : "";
    if (estructura) usadas.push({ pilar: c.tipo ?? c.pilar ?? "", estructura });
    const ve = seVeElProducto(c, productos.length > 0);
    let productoId = c.productoId ?? "";
    if (ve && !productos.some((p) => p.id === productoId)) productoId = productos[(s + iProd++) % productos.length].id;
    const lista = ve ? conObjeto : sinObjeto;
    const salto = saltoPara(lista.length);
    let comp = ve ? lista[(s + salto * iCon++) % lista.length] : lista[(s + salto * iSin++) % lista.length];
    if (comp.id === previa && lista.length > 1) comp = lista[(lista.indexOf(comp) + 1) % lista.length];
    previa = comp.id;
    // La FORMA del gancho: la que ya trae (una publicación que la tiene) o la que encaja con su nivel y su formato.
    const formaGancho = formaDe(c.formaGancho) ? c.formaGancho
      : formaPara({ ...c, formato: c.formato ?? formato }, { formato, hayDatos, cuenta: cuentaFormas, previa: formaPrevia, aprendidas: formasAprendidas, semilla: s, indice: i });
    // Una UGC: sus 3 ganchos alternativos, cada uno con una forma distinta (la primera, la suya).
    const formasGanchos = c.rostro ? formasParaGanchos({ ...c, formaGancho }, { hayDatos, semilla: s, indice: i }) : null;
    const angulo = anguloPara({ ...c, productoId }, angulos, { previo: anguloPrevio, usos: usosAngulo });
    const tactica = TACTICAS[(s + i * 3) % TACTICAS.length][0];
    const opciones = opcionesDe({ ...c, productoId }, { tactica, formaGancho, angulo }, {
      formato, hayDatos, tacticaPrevia, formaPrevia, anguloPrevio, cuenta: cuentaFormas, aprendidas: formasAprendidas, angulos, s, i,
    });
    cuentaFormas.set(formaGancho, (cuentaFormas.get(formaGancho) ?? 0) + 1);
    formaPrevia = formaGancho;
    tacticaPrevia = tactica;
    if (angulo) { anguloPrevio = angulo.id; usosAngulo.set(angulo.id, (usosAngulo.get(angulo.id) ?? 0) + 1); }
    return {
      n: i + 1,
      ...c,
      ...(productoId ? { productoId } : {}),
      conProducto: ve,
      composicion: comp.id,
      plantilla: (c.formato ?? formato) === "historia" && comp.plantilla === "banda" ? "centro" : comp.plantilla,
      fondo: FONDOS[(s + i) % FONDOS.length][0],
      tactica,
      ...(estructura ? { estructura } : {}),
      formaGancho,
      ...(formasGanchos ? { formasGanchos } : {}),
      ...(angulo ? { angulo: angulo.id, anguloNombre: angulo.nombre, anguloLinea: angulo.linea } : {}),
      ...(opciones ? { opciones } : {}),
    };
  });
}

/** Los niveles fríos: a quien no conoce la marca se le habla con los ángulos de público «frio». */
const NIVELES_FRIOS = new Set(["inconsciente", "problema"]);

/**
 * El ÁNGULO de venta de una casilla: el que ya trae si es de su producto o, si no, uno de los de su producto
 * (`angulos`: { productoId → [{ id, nombre, publico, linea }] }, del estudio aprobado): los de público «frio» en los
 * niveles fríos y los «tibio» en los demás (los que no dicen público, en los dos), el menos usado y nunca el mismo que
 * la vecina si hay otro. Null sin ángulos. Pura.
 */
export function anguloPara(celda = {}, angulos = null, { previo = "", usos = new Map() } = {}) {
  const todos = Array.isArray(angulos?.[celda.productoId]) ? angulos[celda.productoId].filter((a) => a?.id && a?.nombre) : [];
  if (!todos.length) return null;
  const ya = todos.find((a) => a.id === celda.angulo);
  if (ya) return ya;
  const quiere = NIVELES_FRIOS.has(celda.nivel) ? "frio" : celda.nivel ? "tibio" : "";
  const delPublico = quiere ? todos.filter((a) => !a.publico || a.publico === quiere) : todos;
  let lista = delPublico.length ? delPublico : todos;
  const sinPrevio = lista.filter((a) => a.id !== previo);
  if (sinPrevio.length) lista = sinPrevio;
  const minimo = Math.min(...lista.map((a) => usos.get(a.id) ?? 0));
  return lista.find((a) => (usos.get(a.id) ?? 0) === minimo);
}

/** Compatibilidad: anuncios por nivel ya con forma. Pura. */
export const planDeLote = (cuantas, opciones = {}) => darForma(celdasPorNiveles(cuantas), opciones);

// ------------------------------------------------------------
// Lo que se le pide a la IA y cómo se lee
// ------------------------------------------------------------

const fechaLegible = (fecha) => new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** El nombre de cada formato en el pedido (el directo sólo existe en el modo «campos»). */
const nombreDeFormato = (f) => FORMATOS_LOTE[f]?.nombre ?? (f === "live" ? "Directo" : "");

/**
 * La línea de una pieza en el pedido: todo lo que ya está decidido. `formato`: el del lote, para la pieza que no trae el
 * suyo (dice dónde va su gancho). Pura.
 */
export function lineaDePieza(r, productos = {}, formato = "") {
  const p = pilarDe(r.tipo ?? r.pilar);
  const nv = NIVELES_CONSCIENCIA.find((n) => n.clave === r.nivel);
  const prod = r.productoId && productos[r.productoId] ? productos[r.productoId] : "";
  const fmt = nombreDeFormato(r.formato) ? `[${nombreDeFormato(r.formato)}] ` : "";
  // Las opciones que la IA puede escoger (darForma): sólo las que traen más de una.
  const op = r.opciones ?? {};
  return [
    `${r.n}. ${fmt}${r.fecha ? `${fechaLegible(r.fecha)} · ` : ""}${nombreDePilar(r.tipo ?? r.pilar, r.pilarSub)}: ${p?.regla ?? ""}`,
    `   ${nv ? `nivel: ${nv.nombre} (${nv.ayuda}; por ${nv.angulo === "dolor" ? "el DOLOR, lo que quiere evitar" : "la GANANCIA, lo que quiere lograr"})` : "nivel: —"} · gancho: ${lineaDe(TACTICAS, r.tactica)}${op.tacticas ? ` [${r.tactica}]` : ""} · composición: ${composicionDe(r.composicion)?.nombre ?? ""}`,
    // Las OTRAS tácticas que también valen (la IA escoge y dice cuál en "tactica").
    op.tacticas ? `   otras tácticas que también valen aquí: ${op.tacticas.filter((x) => x !== r.tactica).map((x) => `${lineaDe(TACTICAS, x)} [${x}]`).join(" · ")}` : "",
    // La forma del gancho (lib/formasGancho.js) y, en una UGC, la de cada uno de sus 3 ganchos.
    formaDe(r.formaGancho) ? `   ${lineaDeForma(r.formaGancho, r.formato ?? formato, { rostro: Boolean(r.rostro || r.formasGanchos?.length) })}${op.formas ? ` [${r.formaGancho}]` : ""}` : "",
    op.formas ? `   otras formas que también valen aquí: ${op.formas.filter((x) => x !== r.formaGancho).map((x) => `«${formaDe(x)?.nombre}» — ${formaDe(x)?.como} [${x}]`).join(" · ")}` : "",
    r.formasGanchos?.length ? `   ${lineaDeGanchosUgc(r.formasGanchos)}` : "",
    r.deseo || r.perfil ? `   le habla a: ${[r.perfil, r.deseo && `deseo de ${r.deseo}`].filter(Boolean).join(", ")}` : "",
    // El ángulo de venta del producto (del estudio de mercado aprobado): el porqué de esta pieza.
    r.anguloLinea ? `   ángulo de venta: ${corto(r.anguloLinea, 450)}${op.angulos ? ` [${r.angulo}]` : ""}` : "",
    op.angulos ? `   otros ángulos que también valen aquí: ${op.angulos.filter((a) => a.id !== r.angulo).map((a) => `${corto(a.linea || a.nombre, 300)} [${a.id}]`).join(" · ")}` : "",
    // El PLANIFICADOR del mes ya decidió qué cuenta esta pieza (lib/motorTextos.js): se desarrolla, no se cambia.
    r.planificada?.idea ? `   EL PLAN DEL MES (lo decidió el planificador mirando el mes entero; desarróllalo, no lo cambies por otra idea): «${corto(r.planificada.idea, 300)}»${r.planificada.porque ? ` — por qué: ${corto(r.planificada.porque, 200)}` : ""}` : "",
    prod ? `   producto: ${prod}${r.conProducto ? "" : " (NO aparece en la imagen: se habla del problema)"}` : "",
    estructuraDe(r.estructura) ? `   ${lineaDeEstructura(r.estructura)}` : "",
    r.semana ? `   semana: ${corto(r.semana, 160)}` : "",
    r.especial ? `   fecha especial ese día: ${corto(r.especial, 120)}` : "",
    r.notaDia ? `   ${lineaDeNotaDelDia(r.notaDia)}` : "",
    r.ideaPersona ? `   idea de la agencia (desarróllala conservando su intención, su tema y su producto): «${corto(r.ideaPersona, 400)}»` : "",
    r.estructuraRef ? `   estructura a seguir en el guion (de una referencia de la competencia: la MISMA forma, tramos y ritmo; el contenido es de la marca y no se copia nada): ${corto(r.estructuraRef, 900)}` : "",
    r.antes ? `   la que había y NO sirvió (escribe OTRA distinta, con otro enfoque): «${corto(r.antes, 200)}»` : "",
    r.pide ? `   lo que pide la agencia para esta: ${corto(r.pide, 300)}` : "",
    r.cambio ? `   ojo: ${r.cambio}` : "",
    r.rostro ? `   ${LINEA_ROSTRO}` : "",
    // Va a pauta (lib/pauta.js `lineaDePauta`: la pone quien arma el pedido): su etapa y que el caption es el anuncio.
    r.lineaPauta ? `   ${corto(r.lineaPauta, 300)}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Un VIDEO CON ROSTRO (UGC): lo graba una persona de la marca hablando a cámara, no se hace con IA. Su guion es para
 * grabarlo: por tomas, lo que DICE (palabra por palabra), lo que se ve y el texto en pantalla. Lo dice en el pedido.
 */
export const LINEA_ROSTRO = "UGC (guion para grabar, 30 s): lo GRABA una persona de la marca hablando a cámara; no se hace con IA. En el guion, cada línea un tramo: «[0–3 s] VOZ: «lo que dice, palabra por palabra» | SE VE: la toma | TEXTO: en pantalla (6 palabras como mucho)», unas 2,5 palabras por segundo. La escena dice dónde y cómo grabarlo.";

/** ¿Lleva guion este formato (carrusel o reel)? Pura. */
const esGuiado = (formato) => Boolean(FORMATOS_LOTE[formato]?.guiado);

/**
 * La estrategia del mes para el pedido: la campaña, las ofertas y el código (sólo lo escrito aquí o en el catálogo se
 * promete) y el concepto de cada semana. `mes`: { campana, ofertas, codigo, semanas: [texto por semana] }. Pura.
 */
export function textoEstrategiaDelMes(mes = null) {
  if (!mes || typeof mes !== "object") return "";
  const semanas = (Array.isArray(mes.semanas) ? mes.semanas : []).map((t, i) => (corto(t, 160) ? `- Semana ${i + 1}: ${corto(t, 160)}` : "")).filter(Boolean);
  const lineas = [
    corto(mes.objetivo, 300) ? `Objetivo del mes: ${corto(mes.objetivo, 300)}` : "",
    corto(mes.campana, 300) ? `Campaña: ${corto(mes.campana, 300)}` : "",
    corto(mes.foco, 200) ? `Foco: ${corto(mes.foco, 200)}` : "",
    corto(mes.ofertas, 500) ? `Ofertas del mes: ${corto(mes.ofertas, 500)}` : "",
    corto(mes.codigo, 40) ? `Código promocional: ${corto(mes.codigo, 40)}` : "",
    semanas.length ? `Concepto de cada semana:\n${semanas.join("\n")}` : "",
  ].filter(Boolean);
  return lineas.length ? `ESTRATEGIA DEL MES (cada pieza la sigue; su semana manda en el tono):\n${lineas.join("\n")}` : "";
}

/**
 * El LENGUAJE DEL CLIENTE (la nota del cerebro con las frases exactas de sus clientes, lib/lenguajeCliente.js) en el
 * pedido: sus palabras en los ganchos y los textos, sin inventar citas ni testimonios. Vacío sin nota. Pura.
 */
export function bloqueDeLenguaje(texto) {
  const t = String(texto ?? "").trim();
  return t ? `EL LENGUAJE DEL CLIENTE (cómo cuentan sus clientes el problema, lo que dudan y lo que celebran): usa SUS palabras en los ganchos y los textos; no inventes citas ni testimonios ni pongas nombres.\n${t.slice(0, MAX_LENGUAJE)}\n` : "";
}

/** Un texto largo de la ficha (las instrucciones pueden ir en varias líneas): sin espacios de más y con tope. */
const largo = (t, max) => String(t ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max).trim();

/**
 * Lo de la FICHA DEL CLIENTE que el motor sigue SIEMPRE, en todos sus modos: sus instrucciones obligatorias (mandan), el
 * estilo de sus textos y de su locución, sus hashtags de marca y su contacto para el llamado a la acción (WhatsApp,
 * Instagram, teléfono, sucursales). Los caminos de antes (api.js) los leían y el motor del servidor no: ahora los lee
 * él. Acepta la fila de D1 (snake_case) o el cliente de la pantalla (camelCase). Vacío si no hay nada. Pura.
 */
export function textoDelCliente(c = null) {
  if (!c || typeof c !== "object") return "";
  const de = (a, b, max = 300) => largo(c[a] ?? c[b], max);
  const instrucciones = de("ai_instructions", "aiInstructions", 2500);
  const ig = de("instagram", "instagram", 80).replace(/^@?/, "@");
  const contacto = [
    de("whatsapp", "whatsapp", 60) ? `WhatsApp ${de("whatsapp", "whatsapp", 60)}` : "",
    ig.length > 1 ? `Instagram ${ig}` : "",
    de("phone", "phone", 60) ? `teléfono ${de("phone", "phone", 60)}` : "",
  ].filter(Boolean).join(" · ");
  const lugares = [de("sucursales", "sucursales", 300), de("direcciones", "direcciones", 300)].filter(Boolean).join(" · ");
  const lineas = [
    de("estilo_guion", "estiloGuion") ? `- Estilo de sus textos: ${de("estilo_guion", "estiloGuion")}` : "",
    de("estilo_locucion", "estiloLocucion") ? `- Estilo de su locución (lo que se dice en voz en un video): ${de("estilo_locucion", "estiloLocucion")}` : "",
    de("hashtags", "hashtags") ? `- Hashtags de la marca: ${de("hashtags", "hashtags")} (van SIEMPRE en «hashtags», junto a los del tema; nunca dentro del caption)` : "",
    contacto ? `- Contacto para el llamado a la acción: ${contacto} (el que encaje; no inventes otro)` : "",
    lugares ? `- Dónde está: ${lugares}` : "",
  ].filter(Boolean);
  if (!instrucciones && !lineas.length) return "";
  return [
    "LA FICHA DEL CLIENTE (se sigue SIEMPRE):",
    ...lineas,
    instrucciones ? `INSTRUCCIONES OBLIGATORIAS DEL CLIENTE (mandan sobre cualquier otra regla de estilo de este pedido):\n${instrucciones}` : "",
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------
// El contexto por BLOQUES, el papel y los ejemplos del cliente
// ------------------------------------------------------------

/**
 * Lo que se sabe de la marca va por BLOQUES, cada uno con su tope: antes se juntaban la ficha, las pautas, los pasajes y
 * el saber del rubro y se cortaba TODO a 6.000 caracteres, así lo último (los pasajes, el rubro) a veces no llegaba. Lo
 * que un bloque no usa (vacío o corto) se reparte entre los que se cortaron, en este orden (`ORDEN_CONTEXTO`), sin pasar
 * de TOTAL_CONTEXTO.
 */
export const TOPES_CONTEXTO = Object.freeze({ ficha: 2500, pautas: 3000, estudio: 3500, lenguaje: 1500, pasajes: 2500, rubro: 1500, ejemplos: 1500 });
export const ORDEN_CONTEXTO = Object.freeze(["ficha", "pautas", "estudio", "lenguaje", "pasajes", "rubro", "ejemplos"]);
export const TOTAL_CONTEXTO = 15_000;

/** Un texto recortado a `max` sin partir una línea (o, si no hay, una palabra) por la mitad. Pura. */
export function recortarBloque(texto, max) {
  const t = String(texto ?? "").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, Math.max(0, max - 2));
  const salto = corte.lastIndexOf("\n");
  const espacio = corte.lastIndexOf(" ");
  const hasta = salto > max * 0.5 ? salto : espacio > max * 0.5 ? espacio : corte.length;
  return `${corte.slice(0, hasta).trimEnd()} …`;
}

/**
 * Los bloques del contexto con su tope cada uno y lo que sobra repartido (ver TOPES_CONTEXTO). `bloques`: { ficha,
 * pautas, estudio, lenguaje, pasajes, rubro, ejemplos } (textos; los que faltan, vacíos). → el mismo objeto, recortado.
 * Pura.
 */
export function repartirContexto(bloques = {}, { total = TOTAL_CONTEXTO, topes = TOPES_CONTEXTO } = {}) {
  const largo = Object.fromEntries(ORDEN_CONTEXTO.map((k) => [k, String(bloques?.[k] ?? "").trim().length]));
  const da = Object.fromEntries(ORDEN_CONTEXTO.map((k) => [k, Math.min(largo[k], topes[k] ?? 0)]));
  let sobra = Math.max(0, total - Object.values(da).reduce((a, b) => a + b, 0));
  for (const k of ORDEN_CONTEXTO) {
    if (!sobra) break;
    const falta = largo[k] - da[k];
    if (falta <= 0) continue;
    const mas = Math.min(falta, sobra);
    da[k] += mas;
    sobra -= mas;
  }
  return Object.fromEntries(ORDEN_CONTEXTO.map((k) => [k, da[k] ? recortarBloque(bloques[k], da[k]) : ""]));
}

/**
 * El PAPEL de quien escribe, al principio del pedido: el redactor de la agencia para ESTA marca. Sin papel, el modelo
 * escribía como un asistente genérico (y salían frases que servían para cualquier marca). Pura.
 */
export const papelDelRedactor = (marca = "la marca") =>
  `Eres el redactor de contenido de la agencia para ${marca}: escribes como su mejor copywriter, con lo concreto de ESTA marca (su producto, su gente, su lugar, las palabras de sus clientes). Una frase que serviría igual para cualquier otra marca está mal escrita.`;

/**
 * Lo que se sabe de la marca (el contexto ya repartido) dicho en el pedido, cada bloque con su título. Con `bloques` (el
 * motor de ahora), cada uno con su tope; sin ellos (quien llama con el texto `contexto` de antes), como antes. Pura.
 */
export function textoDelContexto({ estudio = "", contexto = "", bloques = null, lenguaje = "", ejemplos = "" } = {}) {
  if (!bloques) {
    return [
      estudio ? `ESTUDIO DE MERCADO:\n${String(estudio).slice(0, 8000)}\n` : "",
      contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 6000)}\n` : "",
      bloqueDeLenguaje(lenguaje),
      ejemplos ? `${ejemplos}\n` : "",
    ];
  }
  const b = repartirContexto({ ...bloques, estudio, lenguaje, ejemplos });
  const marca = [b.ficha, b.pautas ? `PAUTAS PARA ESCRIBIR (las reglas de la agencia para este cliente: se siguen SIEMPRE, por encima de cualquier ejemplo)\n${b.pautas}` : "", b.pasajes].filter(Boolean).join("\n\n");
  return [
    b.estudio ? `ESTUDIO DE MERCADO:\n${b.estudio}\n` : "",
    marca ? `LO QUE SE SABE DE LA MARCA:\n${marca}\n` : "",
    b.rubro ? `SABER DEL RUBRO (úsalo en el contenido educativo):\n${b.rubro}\n` : "",
    bloqueDeLenguaje(b.lenguaje),
    b.ejemplos ? `${b.ejemplos}\n` : "",
  ];
}

/** Lo que hace falta para el JSON de la respuesta y las líneas de «Cada publicación tiene»: los formatos y lo que llevan. */
function rasgosDe(plan = [], formato = "post") {
  const formatos = [...new Set(plan.map((r) => r.formato).filter((f) => FORMATOS_LOTE[f]))];
  const mixto = formatos.length > 0;
  return {
    formatos, mixto,
    guiados: mixto ? formatos.filter(esGuiado) : esGuiado(formato) ? [formato] : [],
    deUnaImagen: mixto ? formatos.some((f) => !esGuiado(f)) : !esGuiado(formato),
    conCaption: mixto ? formatos.some((f) => llevaCaption(FORMATOS_LOTE[f].format)) : llevaCaption(FORMATOS_LOTE[formato]?.format ?? "post"),
    sinCaption: mixto && formatos.some((f) => !llevaCaption(FORMATOS_LOTE[f].format)) ? " (vacía en las historias: no llevan caption)" : "",
    rostro: plan.some((r) => r.rostro),
    opciones: {
      tacticas: plan.some((r) => r.opciones?.tacticas),
      formas: plan.some((r) => r.opciones?.formas),
      angulos: plan.some((r) => r.opciones?.angulos),
    },
  };
}

const limpioDeLineas = (lineas) => lineas.filter((l, i, x) => l !== "" || x[i - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n").trim();

/**
 * Lo que se le pide a la IA, en DOS partes: lo FIJO (el papel, la marca, la estrategia, el contexto, cómo es cada campo y
 * las reglas: igual para todas las llamadas de una tanda, así la segunda lo lee de la caché) y lo de ESTAS piezas (cuáles
 * son, lo ya usado y el JSON). `plan`: las piezas de esta llamada; `planTodo`: las de la tanda entera (lo fijo sale de
 * ellas, para que no cambie entre llamadas). `productos`: { id → línea del catálogo (precio EXACTO) }; `estudio`: el
 * estudio de mercado; `bloques`: { ficha, pautas, pasajes, rubro } del cerebro (cada uno con su tope; sin ellos vale
 * `contexto`, el texto de antes); `ejemplos`: piezas del propio cliente (el tono); `arco`: el del planificador del mes;
 * `conFicha`: pedir además la ficha de diseño «imagen» (por defecto NO: la escribe el director al diseñar). Pura.
 */
export function partesDeProduccion({
  marca = "la marca", plan = [], planTodo = null, productos = {}, perfiles = {}, estudio = "", contexto = "", bloques = null, usados = [], formato = "post",
  fechasEspeciales = [], mes = false, nota = "", estrategia = null, falta = "", ugc = "", identidad = "", cliente = "", pauta = "", lenguaje = "",
  ejemplos = "", arco = "", conFicha = false, artes = "",
}) {
  const todo = Array.isArray(planTodo) && planTodo.length ? planTodo : plan;
  const t = rasgosDe(todo, formato);
  const g = rasgosDe(plan, formato);
  const perfilesUsados = [...new Set(todo.map((r) => r.perfil).filter(Boolean))].filter((n) => perfiles[n]);
  const cuantas = plan.length === 1 ? "UNA publicación" : `${plan.length} publicaciones`;
  const escoge = g.opciones.tacticas || g.opciones.formas || g.opciones.angulos;
  const decidido = `su tipo de contenido (lo que comunica), su nivel de consciencia, ${escoge ? "" : "su gancho y "}su composición (la de la portada o el primer plano): respétalos.`;
  const encabezado = g.mixto
    ? `Escribe ${cuantas} para ${marca}${mes ? " del mes" : ""}. ${plan.length === 1 ? "Tiene" : "Cada una tiene"} YA decidido su FORMATO (entre corchetes), ${decidido} La idea de cada una es de SU formato, nunca de otro.`
    : `Escribe ${cuantas} ${esGuiado(formato) ? `de formato ${FORMATOS_LOTE[formato].nombre}` : `de una imagen (${FORMATOS_LOTE[formato]?.nombre ?? "post"})`} para ${marca}${mes ? ", una por día del mes" : ""}. ${plan.length === 1 ? "Tiene" : "Cada una tiene"} YA decidido ${decidido}`;
  const opciones = escoge
    ? "El GANCHO (su táctica y su forma) y el ÁNGULO traen el que sugiere el código y otros que también valen (entre corchetes, su id): escoge el que mejor sirva a ESA pieza, sin repetir el de la vecina, y explica en \"porque\" por qué funciona."
    : "";
  const deUnaImagen = conFicha && t.deUnaImagen;
  const guionLineas = t.guiados.map((f) => (t.mixto ? GUION_DE_FORMATO[f].replace('- "guion":', `- "guion" (SÓLO en las de formato ${FORMATOS_LOTE[f].nombre}):`) : GUION_DE_FORMATO[f]));
  const fijo = limpioDeLineas([
    papelDelRedactor(marca),
    "",
    ...(t.mixto ? t.formatos.map((f) => `- ${FORMATOS_LOTE[f].nombre}: ${REGLA_FORMATO[f]}`) : [REGLA_FORMATO[formato] ?? ""]),
    cliente ? String(cliente).slice(0, 4000) : "",
    // Los tipos de arte de la marca (lib/tiposArte.js): de cuál sale cada pieza (sirve para la escena).
    artes ? corto(artes, 900) : "",
    textoEstrategiaDelMes(estrategia),
    arco ? `EL ARCO DEL MES (lo decidió el planificador mirando todas las piezas): ${corto(arco, 600)}` : "",
    // Lo que va a pauta (lib/pauta.js `bloqueDeAnuncio`, con el negocio del cliente): la regla y el campo «anuncio».
    pauta ? String(pauta).slice(0, 5000) : "",
    perfilesUsados.length ? `Los perfiles:\n${perfilesUsados.map((n) => `- ${n}: ${perfiles[n]}`).join("\n")}` : "",
    fechasEspeciales.length ? `Fechas especiales:\n${fechasEspeciales.map((f) => `- ${f}`).join("\n")}` : "",
    "",
    ...textoDelContexto({ estudio, contexto, bloques, lenguaje, ejemplos }),
    // Las UGC: la voz de esta marca en sus videos y las fórmulas de la agencia (lib/ugc.js, lib/formulasUgc.js).
    ugc && t.rostro ? `PARA LAS UGC:\n${String(ugc).slice(0, 7000)}\n` : "",
    "Cada publicación tiene:",
    `- "titulo": cómo la llamarías en el calendario, en pocas palabras (${MAX_TITULO} caracteres).`,
    `- "brief": qué comunica la pieza y por qué funciona para ese nivel y ese perfil, en una o dos frases (${MAX_BRIEF} caracteres).`,
    t.opciones.tacticas ? '- "tactica": el id de la táctica del gancho que escogiste (la sugerida u otra de las que valen en su pieza).' : "",
    t.opciones.formas ? '- "forma": el id de la forma del gancho que escogiste (la sugerida u otra de las que valen en su pieza).' : "",
    t.opciones.angulos ? '- "angulo": el id del ángulo de venta que escogiste (el sugerido u otro de los que valen en su pieza).' : "",
    `- "porque": en UNA línea, por qué ese gancho (su forma y su táctica) funciona en ese nivel de consciencia (${MAX_PORQUE} caracteres; lo lee quien revisa, no se publica).`,
    `- "titular": el texto grande de la pieza: ${MAX_TITULAR} caracteres y 8 palabras como mucho. Empieza por un verbo o una pregunta, nunca por el nombre de la marca. Sin el signo «·».`,
    `- "apoyo": una línea corta debajo (${MAX_APOYO} caracteres), o vacía. Si el titular ya lo dice todo, vacía.`,
    `- "escena": qué se VE, en una o dos frases sencillas (sujeto, acción, lugar, luz), con su composición. SIN texto dentro. Si sale una persona, descríbela distinta de las de las demás piezas (edad, rasgos, ropa, lugar).`,
    deUnaImagen && identidad ? `- (Para la ficha «imagen») LA MARCA Y CÓMO SE DISEÑA CADA TIPO: ${String(identidad).trim().slice(0, 3000)}` : "",
    deUnaImagen ? `- "imagen"${t.mixto ? " (SÓLO en las de una imagen: post o historia)" : ""}: la FICHA DE DISEÑO de la pieza, como la escribiría un director creativo y diseñador gráfico, lista para el generador de imágenes. Una línea por apartado, separadas por \\n: ${FORMATO_FICHA.split("\n").map((l) => l.split(":")[0]).join(", ")}. En «Texto», el titular y el apoyo EXACTOS entre «», tal cual los escribiste, con su tamaño y su posición; en «Fondo», los colores de la marca con su código. Concreta y completa: quien genera la imagen sólo sabe lo que dice la ficha.` : "",
    t.conCaption ? `- "descripcion"${t.sinCaption}: el texto de la publicación (caption), de 2 a 4 frases, con un llamado a la acción si el tipo lo pide; SIN hashtags (van aparte) (${MAX_DESCRIPCION} caracteres).` : "",
    t.conCaption ? `- "hashtags"${t.sinCaption ? " (vacíos en las historias)" : ""}: de 5 a 10 hashtags útiles para esa publicación (del tema, del rubro y de la zona; los de la marca si la ficha los trae; ninguno inventado de otra marca), separados por espacios.` : "",
    ...guionLineas,
    ugc && t.rostro ? '- "formula" (SÓLO en las UGC): el nombre exacto de la fórmula de la agencia que sigue su guion.' : "",
    t.rostro ? '- "ganchos" (SÓLO en las UGC): 3 ganchos alternativos para el primer tramo (lo que se dice, palabra por palabra), uno con cada forma que dice su pieza.' : "",
    "",
    "Reglas:",
    "- Que todo el lote se sienta variado: ni dos titulares parecidos, ni dos escenas en el mismo lugar con la misma acción, ni la misma persona dos veces.",
    REGLA_GANCHO,
    "- Niveles por el dolor: activa la tensión de lo que quiere evitar. Niveles por la ganancia: lo que logra, en positivo.",
    "- Precios, ofertas, garantías y cifras: sólo los del catálogo y EXACTOS como allí. No inventes reseñas, testimonios, seguidores, porcentajes ni plazos; una urgencia sólo con una fecha real.",
    "- En la escena, lo que no es el producto real va LISO y sin marca (ropa, empaques, pantallas sin números), y nada de logos ni carteles de otros negocios.",
    "- Un día marcado «sin promociones» no vende ni da precios. No nombres a la competencia.",
    ...(falta ? [`- ${falta}`] : []),
  ]);
  const variable = limpioDeLineas([
    encabezado,
    opciones,
    nota ? `Contexto de esta publicación: ${corto(nota, 600)}` : "",
    "",
    ...plan.map((r) => lineaDePieza(r, productos, formato)),
    "",
    usados.length ? `Estos titulares ya salieron: no repitas ninguno ni su idea:\n${usados.slice(0, 30).map((u) => `  · ${corto(u, 80)}`).join("\n")}\n` : "",
    `Responde SOLO con JSON, una por número, así: {"ideas":[{"n":1,"titulo":"…","brief":"…"${g.opciones.tacticas ? ',"tactica":"…"' : ""}${g.opciones.formas ? ',"forma":"…"' : ""}${g.opciones.angulos ? ',"angulo":"…"' : ""},"porque":"…","titular":"…","apoyo":"…","escena":"…"${conFicha && g.deUnaImagen ? ',"imagen":"…"' : ""}${g.conCaption ? ',"descripcion":"…","hashtags":"#… #…"' : ""}${g.guiados.length ? ',"guion":"…"' : ""}${g.rostro ? ',"ganchos":["…","…","…"]' : ""}}]}`,
  ]);
  return { fijo, variable };
}

/** El pedido entero en un texto (lo fijo y lo de estas piezas): lo que lee el conector de Claude y una sola llamada. Pura. */
export function pedidoDeProduccion(datos = {}) {
  const { fijo, variable } = partesDeProduccion(datos);
  return `${fijo}\n\n${variable}`;
}

const deJSON = (texto) => {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};

/** Los hashtags limpios: «#uno #dos», cada uno con su «#», sin repetir y con tope. Pura. */
export function limpiarHashtags(t) {
  const lista = String(Array.isArray(t) ? t.join(" ") : t ?? "").split(/[\s,]+/).map((h) => h.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")).filter(Boolean);
  return [...new Set(lista)].slice(0, 15).map((h) => `#${h}`).join(" ").slice(0, MAX_HASHTAGS);
}

/** Un titular limpio: sin comillas alrededor, sin «·» (los motores lo dibujan como «¿») y con tope. Pura. */
export const limpiarTitular = (t) => corto(String(t ?? "").replace(/\s*·\s*/g, ". "), 80).replace(/^["«“]|["»”]$/g, "").slice(0, 60).trim();

/**
 * El caption y los hashtags de una respuesta de la IA, con la regla de su formato: sin caption ni hashtags en una
 * historia, y los hashtags que vengan al final del caption, aparte. → { descripcion, hashtags? }. Pura.
 */
export function captionYHashtags(x = {}, format = "post") {
  if (!llevaCaption(format)) return { descripcion: "" };
  const { texto, hashtags: delCaption } = separarHashtags(String(x?.descripcion ?? ""));
  const sueltos = Array.isArray(x?.hashtags) ? x.hashtags.join(" ") : String(x?.hashtags ?? "");
  const hashtags = llevaHashtags(format) ? limpiarHashtags(`${sueltos} ${delCaption}`) : "";
  return { descripcion: texto.slice(0, MAX_DESCRIPCION), ...(hashtags ? { hashtags } : {}) };
}

/** Los ganchos de una UGC: hasta 3, sin comillas alrededor y sin repetir (como `limpiarGanchos` de lib/ugc.js). Pura. */
export const limpiarGanchosIdea = (lista) => [...new Set((Array.isArray(lista) ? lista : [])
  .map((g) => corto(g, 200).replace(/^["«“]+|["»”]+$/g, "").trim()).filter(Boolean))].slice(0, 3);

/** La respuesta de la IA → una idea por casilla del plan (por su número; si no lo trae, por orden). Pura. */
export function leerProduccion(texto, plan = [], formato = "post") {
  return leerIdeas(crudasDe(texto, plan), plan, formato);
}

/**
 * La respuesta de la IA → Map n → lo que escribió para esa casilla (sin leer todavía). Sin número, por orden: el de la
 * casilla del plan (en una tanda, el plan no empieza en 1). Lo usa el motor para juntar las llamadas de una tanda y lo
 * que reescribe el revisor antes de leerlo (`leerIdeas`). Pura.
 */
export function crudasDe(texto, plan = [], clave = "ideas") {
  const d = deJSON(texto);
  const lista = Array.isArray(d?.[clave]) ? d[clave] : Array.isArray(d?.ideas) ? d.ideas : Array.isArray(d) ? d : [];
  const porNumero = new Map();
  lista.forEach((x, i) => {
    const n = Number(x?.n) || plan[i]?.n || i + 1;
    if (x && typeof x === "object" && !porNumero.has(n)) porNumero.set(n, x);
  });
  return porNumero;
}

/**
 * Lo que ESCOGIÓ la IA entre las opciones de su casilla (la táctica, la forma del gancho y el ángulo): sólo vale una que
 * esté entre las opciones; si no, la sugerida. → { tactica, formaGancho, angulo?, anguloNombre?, anguloLinea? }. Pura.
 */
export function escogidoDe(r = {}, x = {}) {
  const op = r.opciones ?? {};
  const tactica = op.tacticas?.includes(x?.tactica) ? x.tactica : r.tactica;
  const formaGancho = op.formas?.includes(x?.forma) ? x.forma : r.formaGancho;
  const ang = op.angulos?.find((a) => a.id === x?.angulo)
    ?? (r.angulo ? { id: r.angulo, nombre: r.anguloNombre, linea: r.anguloLinea } : null);
  return {
    ...(tactica ? { tactica } : {}),
    ...(formaGancho ? { formaGancho } : {}),
    ...(ang ? { angulo: ang.id, ...(ang.nombre ? { anguloNombre: ang.nombre } : {}), ...(ang.linea ? { anguloLinea: ang.linea } : {}) } : {}),
  };
}

/** Las crudas (`crudasDe`) → una idea por casilla del plan. Pura. */
export function leerIdeas(porNumero = new Map(), plan = [], formato = "post") {
  const vistos = {};
  return plan.flatMap((r) => {
    const x = porNumero.get(r.n);
    const titular = limpiarTitular(x?.titular);
    const escena = corto(x?.escena, MAX_ESCENA);
    if (!titular || !escena) return [];
    // El pedido listo (la ficha de diseño) lleva SIEMPRE el texto exacto: si la IA lo reescribió, se le repone
    // (asegurarTexto) en vez de tirar la ficha entera por una letra.
    const apoyo = corto(x?.apoyo, MAX_APOYO).replace(/\s*·\s*/g, ". ");
    const ficha = esGuiado(r.formato ?? formato) ? "" : ajustarFicha(limpiarFicha(String(x?.imagen ?? "").replace(/\\n/g, "\n")), MAX_IMAGEN);
    const imagen = ficha ? asegurarTexto(ficha, [titular, apoyo].filter(Boolean).join("\n")) : "";
    const imagenValida = Boolean(imagen);
    const grupo = r.fecha ? `mes-${r.fecha}` : r.tipo === "anuncio" ? r.nivel : r.tipo;
    vistos[grupo] = (vistos[grupo] ?? 0) + 1;
    return [{
      id: `${grupo}-${vistos[grupo]}`, ...r, titular, escena,
      // Lo que escogió entre las opciones de su casilla (sólo si estaba entre ellas).
      ...escogidoDe(r, x),
      titulo: corto(x?.titulo, MAX_TITULO) || titular,
      brief: corto(x?.brief, MAX_BRIEF),
      ...(corto(x?.porque, MAX_PORQUE) ? { porque: corto(x.porque, MAX_PORQUE) } : {}),
      apoyo,
      ...(imagenValida ? { imagen } : {}),
      // El caption y los hashtags sólo donde el formato los lleva (una historia no), y los hashtags SIEMPRE aparte: si la
      // IA los dejó al final del caption, se pasan a «hashtags» (si no, saldrían dos veces).
      ...captionYHashtags(x, FORMATOS_LOTE[r.formato ?? formato]?.format ?? "post"),
      // El guion sólo en un carrusel o un reel: en un post sobra, y la pieza lo leería como láminas.
      ...(String(x?.guion ?? "").trim() && esGuiado(r.formato ?? formato) ? { guion: String(x.guion).replace(/\\n/g, "\n").trim().slice(0, MAX_GUION) } : {}),
      // La fórmula UGC por su nombre (el Worker la pasa a su id).
      ...(r.rostro && corto(x?.formula, 60) ? { formula: corto(x.formula, 60) } : {}),
      // Los 3 ganchos de una UGC, uno con cada forma (van a `ganchosUgc` de la publicación).
      ...(r.rostro && limpiarGanchosIdea(x?.ganchos).length ? { ganchos: limpiarGanchosIdea(x.ganchos) } : {}),
      elegida: true,
    }];
  });
}

// ------------------------------------------------------------
// Cada pieza
// ------------------------------------------------------------

/** «Titular\nApoyo»: lo que va escrito en la pieza (y en `textoPieza` de la publicación). Pura. */
export const textoDeIdea = (idea) => [limpiarTitular(idea?.titular), corto(idea?.apoyo, MAX_APOYO)].filter(Boolean).join("\n");

/** Dónde va el texto de una idea en la plantilla: el de su composición, o el del formato si no trae. Pura. */
export const plantillaDeIdea = (idea, formato = "post") => (PLANTILLAS_TEXTO[idea?.plantilla] ? idea.plantilla : plantillaDeFormato(formato));

/** El nombre de la carpeta del lote en la galería. Pura. */
export function nombreCarpetaLote(producto = "", fecha = new Date()) {
  const dia = fecha.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" }).replace(/\./g, "");
  return corto(`Lote ${producto || "anuncios"} · ${dia}`, 40);
}

/**
 * La publicación que sale de una pieza: título, brief (la idea), qué se ve (`escena`: para diseñarla después con el
 * mismo camino), el texto de la pieza, el guion (carrusel o reel), la descripción, su tipo y su matriz, y los archivos
 * escogidos. Sin archivos es una IDEA: el cliente aprueba la idea, y SIN marca `aprobacion` (`tipoAprobacion` ya da
 * «idea» sin archivo): con ella, cuando llegara su pieza el cliente la seguiría viendo como idea y su «sí» quedaría «por
 * producir». Pendiente: la revisa el equipo y la aprueba el cliente. Pura.
 */
export function publicacionDePieza({ id, idea, archivo = null, archivos = null, formato = "post", producto = null }) {
  formato = idea.formato && FORMATOS_LOTE[idea.formato] ? idea.formato : formato;
  const prod = producto ?? (idea.productoId ? { id: idea.productoId, nombre: idea.producto ?? "" } : null);
  const lista = (archivos ?? (archivo ? [archivo] : [])).filter(Boolean);
  const medioDe = (a) => ({ src: a.src, tipo: a.tipo === "video" ? "video" : "imagen", ...(a.ancho && a.alto ? { ancho: a.ancho, alto: a.alto } : {}) });
  const pub = {
    id,
    format: FORMATOS_LOTE[formato]?.format ?? "post",
    title: idea.titulo || idea.titular,
    idea: idea.brief || idea.escena,
    ...(idea.escena ? { escena: idea.escena } : {}),
    // El texto encima de la pieza: en un carrusel va lámina a lámina (en el guion) y a un reel no se le pide.
    ...(esGuiado(formato) ? {} : { textoPieza: textoDeIdea(idea) }),
    ...(idea.guion ? { guion: idea.guion } : {}),
    ...(idea.descripcion ? { descripcion: idea.descripcion } : {}),
    ...(idea.hashtags ? { hashtagsFinales: idea.hashtags } : {}),
    // La FORMA que decidió el plan: al diseñarla después (Crear con IA, Producir el mes) sale con la misma.
    ...(idea.composicion ? { composicion: idea.composicion } : {}),
    ...(idea.tactica ? { tactica: idea.tactica } : {}),
    ...(idea.estructura ? { estructura: idea.estructura } : {}),
    // La forma del gancho y el ángulo de venta: para no repetirlos el mes siguiente y aprender cuál rinde.
    ...(formaDe(idea.formaGancho) ? { formaGancho: idea.formaGancho } : {}),
    ...(idea.angulo ? { angulo: idea.angulo } : {}),
    pilar: idea.tipo ?? idea.pilar ?? "anuncio",
    ...(idea.pilarSub ? { pilarSub: idea.pilarSub } : {}),
    ...(idea.nivel ? { nivel: idea.nivel } : {}),
    ...(prod?.id ? { productoId: prod.id, producto: prod.nombre ?? "" } : {}),
    ...(idea.deseo ? { deseo: idea.deseo } : {}),
    ...(idea.perfil ? { perfil: idea.perfil } : {}),
    ...(idea.rostro ? { rostro: true } : {}),
    ...(idea.rostro && idea.formulaUgc ? { formulaUgc: idea.formulaUgc } : {}),
    ...(idea.rostro && idea.ganchos?.length ? { ganchosUgc: idea.ganchos } : {}),
    // Va a pauta (el lote de los anuncios que faltan del plan de campañas): la etapa y sus textos de anuncio, ya limpios
    // en el servidor (lib/pauta.js).
    ...(idea.pauta ? { pauta: idea.pauta } : {}),
    ...(idea.pauta && idea.anuncio ? { anuncio: idea.anuncio } : {}),
    status: "pending",
    ...(lista.length ? { medios: lista.map(medioDe) } : {}),
  };
  // Sin archivo todavía: el pedido de su imagen, listo para «Crear con IA» desde el post.
  return idea.imagen && !lista.length && !esGuiado(formato) ? { ...pub, ...camposDePromptListo(pub, idea.imagen) } : pub;
}
export const publicacionDeAnuncio = publicacionDePieza;

/** «Inconsciente · 5», para los títulos de cada grupo. Pura. */
export const tituloDeNivel = (clave, n) => `${nombreDeNivel(clave)} · ${n}`;

/**
 * Los titulares que ya salieron en la galería de este cliente (el texto de las piezas compuestas y el que se le pidió
 * escribir al motor), para que el lote siguiente no los repita. Pura.
 */
export function titularesUsados(archivos = [], max = 30) {
  const fuera = [];
  for (const a of archivos ?? []) {
    const deTexto = String(a?.ajustes?.plantilla?.texto ?? "").split("\n")[0];
    const delPedido = String(a?.prompt ?? "").match(/Texto en la imagen[^:]*:\s*"([^"]+)"/)?.[1] ?? "";
    const t = corto(deTexto || delPedido, 80);
    if (t && !fuera.includes(t)) fuera.push(t);
    if (fuera.length >= max) break;
  }
  return fuera;
}

// ------------------------------------------------------------
// Lo que el cliente ha dicho que le gusta: qué composiciones funcionan
// ------------------------------------------------------------

/** Lo mínimo para fiarse: con menos piezas marcadas, el orden de siempre. */
export const MIN_SENALES_COMPOSICION = 6;

/**
 * Qué composiciones funcionan con ESTE cliente, por lo que pasó con sus piezas: «Me gusta» +2, usada en una
 * publicación +1, a la papelera −1 (lo subido a mano no cuenta: no lo hizo el motor). La composición de una pieza se
 * reconoce por su línea en el pedido. → { orden: [ids, de la que más gusta a la que menos], puntos: { id → n },
 * senales }. Con pocas señales, `orden` vacío: no se aprende de tres piezas. Pura.
 */
export function aprenderComposiciones(archivos = [], papelera = []) {
  const puntos = Object.fromEntries(COMPOSICIONES.map((c) => [c.id, 0]));
  let senales = 0;
  // La línea larga (piezas de antes) o el nombre corto que va detrás de la escena mejorada («Composición: En uso.»).
  const de = (a) => COMPOSICIONES.find((c) => String(a?.prompt ?? "").includes(c.linea) || String(a?.prompt ?? "").includes(`Composición: ${c.nombre}.`));
  for (const a of archivos ?? []) {
    const c = de(a);
    if (!c || a.subido) continue;
    const p = (a.favorito ? 2 : 0) + ((a.usadoEn ?? []).length ? 1 : 0);
    if (p) { puntos[c.id] += p; senales += 1; }
  }
  for (const a of papelera ?? []) {
    const c = de(a);
    if (!c || a.subido) continue;
    puntos[c.id] -= 1;
    senales += 1;
  }
  if (senales < MIN_SENALES_COMPOSICION) return { orden: [], puntos, senales };
  // Fuera las que restan. Las que suman (hasta tres) se INTERCALAN entre las neutras: una de cada dos piezas sale con
  // una que gusta, sin que dos seguidas se repitan. `darForma` repone todas si quedan pocas.
  const buenas = COMPOSICIONES.map((c, i) => ({ id: c.id, p: puntos[c.id], i })).filter((x) => x.p >= 0).sort((a, b) => b.p - a.p || a.i - b.i);
  const gustan = buenas.filter((x) => x.p > 0).slice(0, 3).map((x) => x.id);
  const neutras = buenas.map((x) => x.id).filter((id) => !gustan.includes(id));
  const orden = gustan.length ? neutras.flatMap((id, k) => [gustan[k % gustan.length], id]) : neutras;
  return { orden: orden.length ? orden : gustan, puntos, senales };
}
