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
import { PLANTILLAS_TEXTO } from "./carrusel.js";
import { PILARES, pilarDe, nombreDePilar } from "./pilares.js";
import { camposDePromptListo } from "./promptImagen.js";

export const POR_NIVEL = 5;
export const MAX_POR_NIVEL = 10;
export const MAX_LOTE = 30;
/** El titular: los que funcionan miden unos 32 caracteres; de 40 en adelante se parte en tres o cuatro líneas. */
export const MAX_TITULAR = 40;
export const MAX_APOYO = 90;
export const MAX_ESCENA = 400;
/** El pedido de la imagen ya listo (escena + texto exacto), como el de «Mejorar idea». */
export const MAX_IMAGEN = 900;
export const MAX_BRIEF = 300;
export const MAX_DESCRIPCION = 600;
export const MAX_TITULO = 60;
export const MAX_HASHTAGS = 300;

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
  historia: "Es una HISTORIA de Instagram: una sola imagen vertical 9:16 que se ve unos segundos; una idea rápida y directa. No propongas carrusel ni reel.",
  carrusel: "Es un CARRUSEL de varias láminas que se deslizan: la idea se desarrolla lámina a lámina. No propongas una sola imagen ni un video.",
  reel: "Es un REEL: un video vertical de 10 segundos con varios planos. No propongas una imagen fija ni un carrusel.",
});

/** El guion que se le pide a la IA en un formato guiado (vacío en los de una imagen). */
const GUION_DE_FORMATO = Object.freeze({
  carrusel: '- "guion": las láminas del carrusel, de 5 a 7, una por línea: «Portada: …», «Slide 1: …», …, «CTA: …». Cada una, una idea corta que se lee en dos segundos; el precio, EXACTO.',
  reel: '- "guion": el reel de 10 s por planos, una línea por plano con su tiempo: «[0–2 s] qué se ve · texto en pantalla (5 palabras como mucho)», …, y el último con el logo y el llamado. Sin texto largo en pantalla.',
});
export const MAX_GUION = 2000;

/** Dónde va el texto en la plantilla, según el formato (en una historia, abajo tapa los botones de Instagram). */
export const plantillaDeFormato = (formato) => (formato === "historia" ? "centro" : "banda");

/**
 * Las composiciones: CÓMO se ve cada pieza. `objeto`: necesita un producto físico en cuadro (sin él, no se usa);
 * `uso`: lo enseña en uso o en su lugar; `plantilla`: dónde va el texto si lo pone la plantilla.
 */
export const COMPOSICIONES = Object.freeze([
  { id: "heroe", nombre: "Producto héroe", objeto: true, linea: "Composición: el producto como protagonista absoluto, en primer plano y ligeramente en ángulo, sobre un fondo limpio; plano cerrado.", plantilla: "banda" },
  { id: "uso", nombre: "En uso", uso: true, linea: "Composición: una persona real usando el producto o el servicio en un momento cotidiano, plano medio, gesto natural.", plantilla: "arriba" },
  { id: "ugc", nombre: "Selfie con el celular", uso: true, linea: "Composición: foto tomada con el celular por una persona real que lo prueba (estilo contenido de cliente): luz de casa, encuadre imperfecto, nada de estudio.", plantilla: "degradado" },
  { id: "cenital", nombre: "Vista cenital", objeto: true, linea: "Composición: vista cenital (desde arriba) ordenada, el producto con pocos objetos de su entorno alrededor, mucho espacio libre.", plantilla: "degradado" },
  { id: "macro", nombre: "Macro de textura", objeto: true, linea: "Composición: primerísimo plano de la textura o un detalle del producto (grano, tejido, brillo), fondo desenfocado, sensación táctil.", plantilla: "arriba" },
  { id: "tipografica", nombre: "Tipográfica", linea: "Composición de diseño gráfico: un gran bloque de color de la paleta domina la pieza y la imagen ocupa sólo un tercio, recortada limpia a un lado.", plantilla: "centro" },
  { id: "ambiente", nombre: "En su lugar", uso: true, linea: "Composición: la escena en su ambiente real (el lugar donde se usa), plano abierto, luz que entra de lado, mucho aire alrededor.", plantilla: "degradado" },
  { id: "dividida", nombre: "Antes y después", linea: "Composición dividida en dos mitades: a un lado el problema, al otro el resultado; el cambio se entiende de un vistazo.", plantilla: "banda" },
  { id: "emocion", nombre: "Emoción", linea: "Composición: primer plano de una cara con una emoción clara (alivio, alegría, tranquilidad, frustración según el mensaje).", plantilla: "arriba" },
  { id: "oficio", nombre: "El oficio", uso: true, linea: "Composición: el trabajo hecho o en proceso (las manos, la herramienta, el resultado), plano medio, luz de taller u oficina real.", plantilla: "banda" },
  { id: "unboxing", nombre: "Recién llegado", objeto: true, linea: "Composición: el producto recién sacado de su empaque sobre una mesa, manos que lo abren, sensación de estreno.", plantilla: "arriba" },
  { id: "serie", nombre: "Serie", objeto: true, linea: "Composición editorial en cuadrícula: dos o tres tomas del producto (o de varios) en paneles ordenados, como una página de revista.", plantilla: "centro" },
]);

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
export const composicionDe = (id) => COMPOSICIONES.find((x) => x.id === id) ?? null;
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

/**
 * La FORMA de cada pieza: producto (si se ve y no lo trae), composición (sin las que necesitan objeto cuando no hay
 * producto en cuadro; en el orden `orden` si se aprendió cuáles funcionan), fondo, táctica y dónde va el texto. Dos
 * vecinas nunca comparten composición. `semilla` mueve el punto de partida. Pura.
 */
export function darForma(celdas = [], { productos = [], semilla = 0, formato = "post", orden = null } = {}) {
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
  return celdas.map((c, i) => {
    const ve = seVeElProducto(c, productos.length > 0);
    let productoId = c.productoId ?? "";
    if (ve && !productos.some((p) => p.id === productoId)) productoId = productos[(s + iProd++) % productos.length].id;
    const lista = ve ? conObjeto : sinObjeto;
    const salto = saltoPara(lista.length);
    let comp = ve ? lista[(s + salto * iCon++) % lista.length] : lista[(s + salto * iSin++) % lista.length];
    if (comp.id === previa && lista.length > 1) comp = lista[(lista.indexOf(comp) + 1) % lista.length];
    previa = comp.id;
    return {
      n: i + 1,
      ...c,
      ...(productoId ? { productoId } : {}),
      conProducto: ve,
      composicion: comp.id,
      plantilla: (c.formato ?? formato) === "historia" && comp.plantilla === "banda" ? "centro" : comp.plantilla,
      fondo: FONDOS[(s + i) % FONDOS.length][0],
      tactica: TACTICAS[(s + i * 3) % TACTICAS.length][0],
    };
  });
}

/** Compatibilidad: anuncios por nivel ya con forma. Pura. */
export const planDeLote = (cuantas, opciones = {}) => darForma(celdasPorNiveles(cuantas), opciones);

// ------------------------------------------------------------
// Lo que se le pide a la IA y cómo se lee
// ------------------------------------------------------------

const fechaLegible = (fecha) => new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** La línea de una pieza en el pedido: todo lo que ya está decidido. Pura. */
function lineaDePieza(r, productos = {}) {
  const p = pilarDe(r.tipo ?? r.pilar);
  const nv = NIVELES_CONSCIENCIA.find((n) => n.clave === r.nivel);
  const prod = r.productoId && productos[r.productoId] ? productos[r.productoId] : "";
  const fmt = r.formato && FORMATOS_LOTE[r.formato] ? `[${FORMATOS_LOTE[r.formato].nombre}] ` : "";
  return [
    `${r.n}. ${fmt}${r.fecha ? `${fechaLegible(r.fecha)} · ` : ""}${nombreDePilar(r.tipo ?? r.pilar, r.pilarSub)}: ${p?.regla ?? ""}`,
    `   ${nv ? `nivel: ${nv.nombre} (${nv.ayuda}; por ${nv.angulo === "dolor" ? "el DOLOR, lo que quiere evitar" : "la GANANCIA, lo que quiere lograr"})` : "nivel: —"} · gancho: ${lineaDe(TACTICAS, r.tactica)} · composición: ${composicionDe(r.composicion)?.nombre ?? ""}`,
    r.deseo || r.perfil ? `   le habla a: ${[r.perfil, r.deseo && `deseo de ${r.deseo}`].filter(Boolean).join(", ")}` : "",
    prod ? `   producto: ${prod}${r.conProducto ? "" : " (NO aparece en la imagen: se habla del problema)"}` : "",
    r.semana ? `   semana: ${corto(r.semana, 160)}` : "",
    r.especial ? `   fecha especial ese día: ${corto(r.especial, 120)}` : "",
    r.ideaPersona ? `   idea de la agencia (desarróllala conservando su intención, su tema y su producto): «${corto(r.ideaPersona, 400)}»` : "",
    r.antes ? `   la que había y NO sirvió (escribe OTRA distinta, con otro enfoque): «${corto(r.antes, 200)}»` : "",
    r.pide ? `   lo que pide la agencia para esta: ${corto(r.pide, 300)}` : "",
    r.cambio ? `   ojo: ${r.cambio}` : "",
    r.rostro ? `   ${LINEA_ROSTRO}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Un VIDEO CON ROSTRO (UGC): lo graba una persona de la marca hablando a cámara, no se hace con IA. Su guion es para
 * grabarlo: por tomas, lo que DICE (palabra por palabra), lo que se ve y el texto en pantalla. Lo dice en el pedido.
 */
export const LINEA_ROSTRO = "VIDEO CON ROSTRO (UGC): lo GRABA una persona de la marca hablando a cámara; no se hace con IA. En el guion, cada línea una toma: «[0–3 s] lo que DICE, palabra por palabra · lo que se ve · texto en pantalla (5 palabras como mucho)». La escena dice dónde y cómo grabarlo.";

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
 * Lo que se le pide a la IA: una pieza por casilla del plan, con todo ya decidido. `productos`: { id → línea del
 * catálogo (precio EXACTO) }; `estudio`: el estudio de mercado; `contexto`: el cerebro para escribir (sin lo interno);
 * `perfiles`: { nombre → quién es y su dolor }; `fechasEspeciales`: las del mes. Pura.
 */
export function pedidoDeProduccion({
  marca = "la marca", plan = [], productos = {}, perfiles = {}, estudio = "", contexto = "", usados = [], formato = "post", fechasEspeciales = [], mes = false,
  nota = "", estrategia = null,
}) {
  const perfilesUsados = [...new Set(plan.map((r) => r.perfil).filter(Boolean))].filter((n) => perfiles[n]);
  const cuantas = plan.length === 1 ? "UNA publicación" : `${plan.length} publicaciones`;
  // Formatos mezclados (el plan del mes: un post, un carrusel, un reel…): cada pieza dice el suyo.
  const formatos = [...new Set(plan.map((r) => r.formato).filter((f) => FORMATOS_LOTE[f]))];
  const mixto = formatos.length > 0;
  const guiados = mixto ? formatos.filter(esGuiado) : esGuiado(formato) ? [formato] : [];
  const encabezado = mixto
    ? `Escribe ${cuantas} para ${marca}${mes ? " del mes" : ""}. ${plan.length === 1 ? "Tiene" : "Cada una tiene"} YA decidido su FORMATO (entre corchetes), su tipo de contenido (lo que comunica), su nivel de consciencia, su gancho y su composición (la de la portada o el primer plano): respétalos. La idea de cada una es de SU formato, nunca de otro.`
    : `Escribe ${cuantas} ${esGuiado(formato) ? `de formato ${FORMATOS_LOTE[formato].nombre}` : `de una imagen (${FORMATOS_LOTE[formato]?.nombre ?? "post"})`} para ${marca}${mes ? ", una por día del mes" : ""}. ${plan.length === 1 ? "Tiene" : "Cada una tiene"} YA decidido su tipo de contenido (lo que comunica), su nivel de consciencia, su gancho y su composición (la de la portada o el primer plano): respétalos.`;
  // Las de una imagen traen además su pedido para el motor, ya listo: así «Crear con IA» desde el post no espera a
  // «Mejorar idea» (lib/promptImagen.js).
  const deUnaImagen = mixto ? formatos.some((f) => !esGuiado(f)) : !esGuiado(formato);
  const guionLineas = guiados.map((f) => (mixto ? GUION_DE_FORMATO[f].replace('- "guion":', `- "guion" (SÓLO en las de formato ${FORMATOS_LOTE[f].nombre}):`) : GUION_DE_FORMATO[f]));
  return [
    encabezado,
    ...(mixto ? formatos.map((f) => `- ${FORMATOS_LOTE[f].nombre}: ${REGLA_FORMATO[f]}`) : [REGLA_FORMATO[formato] ?? ""]),
    nota ? `Contexto de esta publicación: ${corto(nota, 600)}` : "",
    textoEstrategiaDelMes(estrategia),
    perfilesUsados.length ? `Los perfiles:\n${perfilesUsados.map((n) => `- ${n}: ${perfiles[n]}`).join("\n")}` : "",
    fechasEspeciales.length ? `Fechas especiales:\n${fechasEspeciales.map((f) => `- ${f}`).join("\n")}` : "",
    "",
    ...plan.map((r) => lineaDePieza(r, productos)),
    "",
    "Cada publicación tiene:",
    `- "titulo": cómo la llamarías en el calendario, en pocas palabras (${MAX_TITULO} caracteres).`,
    `- "brief": qué comunica la pieza y por qué funciona para ese nivel y ese perfil, en una o dos frases (${MAX_BRIEF} caracteres).`,
    `- "titular": el texto grande de la pieza: ${MAX_TITULAR} caracteres y 8 palabras como mucho. Empieza por un verbo o una pregunta, nunca por el nombre de la marca. Sin el signo «·».`,
    `- "apoyo": una línea corta debajo (${MAX_APOYO} caracteres), o vacía. Si el titular ya lo dice todo, vacía.`,
    `- "escena": qué se VE, en una o dos frases sencillas (sujeto, acción, lugar, luz), con su composición. SIN texto dentro. Si sale una persona, descríbela distinta de las de las demás piezas (edad, rasgos, ropa, lugar).`,
    deUnaImagen ? `- "imagen"${mixto ? " (SÓLO en las de una imagen: post o historia)" : ""}: lo que se le pide al generador de imágenes, listo para usar: la escena con su composición en una o dos frases sencillas (60 palabras como mucho, sin contar el texto), y el titular y el apoyo EXACTOS entre comillas, tal cual los escribiste, legibles y bien jerarquizados (lo primero grande). Sin listas ni términos técnicos.` : "",
    `- "descripcion": el texto de la publicación (caption), de 2 a 4 frases, con un llamado a la acción si el tipo lo pide; sin hashtags (${MAX_DESCRIPCION} caracteres).`,
    '- "hashtags": de 5 a 10 hashtags útiles para esa publicación (del tema, del rubro y de la zona; ninguno inventado de otra marca), separados por espacios.',
    ...guionLineas,
    "",
    "Reglas:",
    "- Que todo el lote se sienta variado: ni dos titulares parecidos, ni dos escenas en el mismo lugar con la misma acción, ni la misma persona dos veces.",
    "- Niveles por el dolor: activa la tensión de lo que quiere evitar. Niveles por la ganancia: lo que logra, en positivo.",
    "- Precios, ofertas, garantías y cifras: sólo los del catálogo y EXACTOS como allí. No inventes reseñas, testimonios, seguidores, porcentajes ni plazos; una urgencia sólo con una fecha real.",
    "- En la escena, lo que no es el producto real va LISO y sin marca (ropa, empaques, pantallas sin números), y nada de logos ni carteles de otros negocios.",
    "- Un día marcado «sin promociones» no vende ni da precios. No nombres a la competencia.",
    usados.length ? `- Estos titulares ya salieron: no repitas ninguno ni su idea:\n${usados.slice(0, 30).map((t) => `  · ${corto(t, 80)}`).join("\n")}` : "",
    "",
    estudio ? `ESTUDIO DE MERCADO:\n${String(estudio).slice(0, 8000)}\n` : "",
    contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 6000)}\n` : "",
    `Responde SOLO con JSON, una por número, así: {"ideas":[{"n":1,"titulo":"…","brief":"…","titular":"…","apoyo":"…","escena":"…"${deUnaImagen ? ',"imagen":"…"' : ""},"descripcion":"…","hashtags":"#… #…"${guiados.length ? ',"guion":"…"' : ""}}]}`,
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n").replace(/\n{3,}/g, "\n\n");
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

/** La respuesta de la IA → una idea por casilla del plan (por su número; si no lo trae, por orden). Pura. */
export function leerProduccion(texto, plan = [], formato = "post") {
  const d = deJSON(texto);
  const lista = Array.isArray(d?.ideas) ? d.ideas : Array.isArray(d) ? d : [];
  const porNumero = new Map();
  lista.forEach((x, i) => {
    // Sin número, por orden: el de la casilla del plan (en una tanda, el plan no empieza en 1).
    const n = Number(x?.n) || plan[i]?.n || i + 1;
    if (!porNumero.has(n)) porNumero.set(n, x);
  });
  const vistos = {};
  return plan.flatMap((r) => {
    const x = porNumero.get(r.n);
    const titular = limpiarTitular(x?.titular);
    const escena = corto(x?.escena, MAX_ESCENA);
    if (!titular || !escena) return [];
    // El pedido listo sólo vale si trae el texto EXACTO (si lo reescribió, el motor escribiría otra cosa).
    const apoyo = corto(x?.apoyo, MAX_APOYO).replace(/\s*·\s*/g, ". ");
    const imagen = esGuiado(r.formato ?? formato) ? "" : corto(x?.imagen, MAX_IMAGEN);
    const imagenValida = imagen && imagen.includes(titular) && (!apoyo || imagen.includes(apoyo));
    const grupo = r.fecha ? `mes-${r.fecha}` : r.tipo === "anuncio" ? r.nivel : r.tipo;
    vistos[grupo] = (vistos[grupo] ?? 0) + 1;
    return [{
      id: `${grupo}-${vistos[grupo]}`, ...r, titular, escena,
      titulo: corto(x?.titulo, MAX_TITULO) || titular,
      brief: corto(x?.brief, MAX_BRIEF),
      apoyo,
      ...(imagenValida ? { imagen } : {}),
      descripcion: String(x?.descripcion ?? "").trim().slice(0, MAX_DESCRIPCION),
      ...(limpiarHashtags(x?.hashtags) ? { hashtags: limpiarHashtags(x.hashtags) } : {}),
      // El guion sólo en un carrusel o un reel: en un post sobra, y la pieza lo leería como láminas.
      ...(String(x?.guion ?? "").trim() && esGuiado(r.formato ?? formato) ? { guion: String(x.guion).replace(/\\n/g, "\n").trim().slice(0, MAX_GUION) } : {}),
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
 * escogidos. Sin archivos es una IDEA: el cliente aprueba la idea (`aprobacion: "idea"`). Pendiente: la revisa el
 * equipo y la aprueba el cliente. Pura.
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
    pilar: idea.tipo ?? idea.pilar ?? "anuncio",
    ...(idea.pilarSub ? { pilarSub: idea.pilarSub } : {}),
    ...(idea.nivel ? { nivel: idea.nivel } : {}),
    ...(prod?.id ? { productoId: prod.id, producto: prod.nombre ?? "" } : {}),
    ...(idea.deseo ? { deseo: idea.deseo } : {}),
    ...(idea.perfil ? { perfil: idea.perfil } : {}),
    ...(idea.rostro ? { rostro: true } : {}),
    status: "pending",
    ...(lista.length ? { medios: lista.map(medioDe) } : { aprobacion: "idea" }),
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
