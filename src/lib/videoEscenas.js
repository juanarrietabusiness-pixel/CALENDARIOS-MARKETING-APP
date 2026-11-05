// ============================================================
// El formato de escenas del VIDEO ANIMADO, versión 1 (puro)
//
// Un video animado («Content Factory»): las escenas se DIBUJAN CON CÓDIGO —no
// con un modelo de imagen o de video—, hay UNA sola toma de locución y los
// subtítulos salen de los tiempos de cada palabra. Este archivo es el contrato
// entre las tres partes que lo usan, y por eso no depende de nada:
//
//   · Claude (por MCP) y el asistente ESCRIBEN el guion en este formato;
//   · la pantalla lo VALIDA, lo enseña para aprobarlo y dibuja la vista previa
//     (el motor de Canvas 2D, fase 1, paso 2);
//   · el render del Container (fase 2) lo CONSUME tal cual, con el mismo motor
//     y ffmpeg. Lo que no esté aquí no existe para el render.
//
// Tres decisiones que no se ven y no se pueden cambiar sin romper el render:
//
//   1. LAS ESCENAS SE ANCLAN A PALABRAS, NO A SEGUNDOS. El texto hablado de
//      todas las escenas, en orden, ES la locución. La escena k empieza donde
//      empieza su primera palabra; una capa aparece «en la palabra 3» de su
//      escena. Si se cambia de voz o de velocidad, todo se vuelve a cuadrar
//      solo con los tiempos nuevos (`lineaDeTiempo`). Antes de que haya voz se
//      estima a `PALABRAS_POR_SEGUNDO`.
//   2. LAS POSICIONES SON RELATIVAS: con nombre («arriba», «centro»…) o en
//      fracciones del lienzo (0–1), y el tamaño en fracción del LADO CORTO.
//      Así el mismo guion sale en 9:16, 1:1 y 16:9 sin reescribirlo.
//   3. LOS COLORES SON DEL ESTILO: un token («acento», «fondo»…) o un #RRGGBB.
//      Cambiar el estilo recolorea el video entero sin tocar las escenas.
//
// Un silencio (`pausa`) se INSERTA en la locución detrás del habla de su
// escena: la toma es una, así que una escena muda sólo puede existir si el
// render mete ese hueco en el audio. `lineaDeTiempo` devuelve dónde (en el
// tiempo del AUDIO) y cuánto, para que el render lo haga con ffmpeg.
//
// La documentación con ejemplos está en docs/formato-escenas-v1.md.
// ============================================================

import { PALABRAS_POR_SEGUNDO } from "./reel.js";

export const VERSION_GUION = 1;
export const FPS = 30;

/** Los lienzos de salida. El primero de `formatos` es el principal (el de la vista previa). */
export const FORMATOS_VIDEO = Object.freeze({
  "9:16": Object.freeze({ ancho: 1080, alto: 1920, nombre: "Vertical (reel, historia, TikTok)" }),
  "1:1": Object.freeze({ ancho: 1080, alto: 1080, nombre: "Cuadrado (feed)" }),
  "16:9": Object.freeze({ ancho: 1920, alto: 1080, nombre: "Horizontal (YouTube)" }),
});

/** El ciclo de un proyecto. Está también en el CHECK de D1 (0059): cambiar uno obliga a cambiar el otro. */
export const ESTADOS_VIDEO = Object.freeze(["borrador", "aprobado", "con_voz", "renderizando", "renderizado", "fallido"]);
export const NOMBRE_ESTADO_VIDEO = Object.freeze({
  borrador: "Borrador", aprobado: "Guion aprobado", con_voz: "Con locución",
  renderizando: "Renderizando", renderizado: "Listo", fallido: "Falló el render",
});
const PASOS = Object.freeze({
  borrador: ["aprobado"],
  aprobado: ["borrador", "con_voz", "renderizando"],
  con_voz: ["borrador", "aprobado", "renderizando"],
  renderizando: ["renderizado", "fallido"],
  renderizado: ["borrador", "renderizando"],
  fallido: ["borrador", "renderizando"],
});
/** ¿Se puede pasar de un estado a otro? Pura. */
export const puedePasar = (de, a) => Boolean(PASOS[de]?.includes(a));
/**
 * Lo que pasa al EDITAR el guion: vuelve a borrador (la aprobación era de otro texto) salvo mientras se renderiza,
 * que no se deja editar. Pura.
 */
export const estadoTrasEditar = (estado) => (estado === "renderizando" ? null : "borrador");
/**
 * ¿Se puede generar la locución? Sólo con el guion APROBADO y siendo la misma versión que se aprobó: editar después
 * de aprobar sube la versión y obliga a aprobar otra vez. Pura.
 */
export const puedeGenerarVoz = (p) => ["aprobado", "con_voz"].includes(p?.estado)
  && Number.isInteger(p?.version) && p.version === p?.aprobada_version;

// ------------------------------------------------------------
// Topes
// ------------------------------------------------------------

export const MIN_SEGUNDOS = 5;
export const MAX_SEGUNDOS = 150;
export const MAX_ESCENAS = 40;
export const MAX_CAPAS = 8;
export const MAX_HABLA = 400;
export const MAX_PANTALLA = 80;
export const MAX_PAUSA = 3;
/** Una escena no dura menos que esto: si su habla es más corta, se le suma silencio. */
export const MIN_ESCENA = 0.6;
/** Lo que queda detrás de la última palabra antes de cortar el audio. */
export const COLA_FINAL = 0.4;

// ------------------------------------------------------------
// El vocabulario
// ------------------------------------------------------------

/** Para qué es cada escena. Lo lee la IA al escribir y el motor para escoger su plantilla si la escena no trae capas. */
export const TIPOS_ESCENA = Object.freeze({
  gancho: "Gancho: lo que detiene el dedo en los dos primeros segundos",
  problema: "El problema o el dolor de quien mira",
  agitacion: "Por qué ese problema importa o empeora",
  solucion: "La salida: qué cambia",
  producto: "El producto o el servicio en cuadro",
  beneficio: "Un beneficio concreto",
  pasos: "Cómo funciona o cómo se hace, en pasos",
  dato: "Una cifra o un dato con su fuente",
  prueba: "Prueba: resultado, garantía o reseña REAL",
  comparacion: "Antes y después, o esto contra aquello",
  explicacion: "Un concepto explicado (educativo)",
  cierre: "El llamado a la acción y la marca",
});

/** El nombre corto de cada tipo, para la pantalla. */
export const NOMBRE_TIPO_ESCENA = Object.freeze({
  gancho: "Gancho", problema: "Problema", agitacion: "Agitación", solucion: "Solución", producto: "Producto",
  beneficio: "Beneficio", pasos: "Pasos", dato: "Dato", prueba: "Prueba", comparacion: "Comparación",
  explicacion: "Explicación", cierre: "Cierre",
});

/** Los colores con nombre que da el estilo (la paleta del kit de marca de cada cliente). */
export const TOKENS_COLOR = Object.freeze(["fondo", "superficie", "texto", "acento", "apoyo", "claro", "oscuro"]);
const HEX = /^#[0-9a-f]{6}$/i;
export const esColor = (c) => TOKENS_COLOR.includes(c) || HEX.test(String(c ?? ""));

export const POSICIONES = Object.freeze(["centro", "arriba", "abajo", "izq", "der", "arriba-izq", "arriba-der", "abajo-izq", "abajo-der"]);
export const ENTRADAS = Object.freeze(["aparece", "fundido", "sube", "baja", "escala", "rebote", "escribe", "barrido", "dibuja"]);
export const SALIDAS = Object.freeze(["ninguna", "fundido", "baja", "escala"]);
export const BUCLES = Object.freeze(["ninguno", "flota", "pulso", "gira", "late"]);
export const TRANSICIONES = Object.freeze(["corte", "fundido", "barrido", "zoom", "deslizar"]);
export const FONDOS = Object.freeze(["plano", "degradado", "papel", "rayas", "puntos", "estrellas", "lineas"]);
export const RITMOS = Object.freeze(["calmado", "medio", "rapido"]);
export const ILUSTRACIONES = Object.freeze(["plana", "papel", "linea", "poster"]);
export const ICONOS_VIDEO = Object.freeze([
  "check", "cruz", "corazon", "estrella", "rayo", "reloj", "bolsa", "carrito", "chat", "telefono", "ubicacion",
  "regalo", "escudo", "hoja", "gota", "bebe", "casa", "flecha", "alerta", "sonrisa", "dinero", "camion",
]);

// Cada propiedad: [tipo, opciones]. Tipos: texto (máx), enum (lista), color, num (mín, máx), bool, lista (de textos o de objetos).
const T = (max, req = false) => ({ t: "texto", max, req });
const E = (lista, def) => ({ t: "enum", lista, def });
const N = (min, max, def, req = false) => ({ t: "num", min, max, def, req });
const C = (def) => ({ t: "color", def });
const B = (def = false) => ({ t: "bool", def });

/** Lo más que lleva un dibujo (lienzo libre). */
export const MAX_FORMAS = 24;
export const FIGURAS_DIBUJO = Object.freeze(["circulo", "elipse", "rect", "triangulo", "estrella", "corazon", "gota", "linea", "curva", "arco"]);
export const ENTRADAS_FORMA = Object.freeze(["escala", "aparece", "fundido", "sube", "dibuja"]);

/**
 * Una forma de un DIBUJO: todo en fracciones de la caja del dibujo (0,0 arriba a la izquierda; 1,1 abajo a la derecha).
 *   x, y   — el centro (en línea y curva, el punto de partida)
 *   w, h   — el ancho y el alto (fracción del ancho y del alto de la caja); h 0 = igual de alto que de ancho (un círculo)
 *   x2, y2 — el punto final de la línea y la curva; cx, cy — el punto que dobla la curva
 *   inicio, fin — los grados del arco (0 = a la derecha, en el sentido del reloj)
 *   retraso — segundos desde que entra el dibujo hasta que aparece ESTA forma; entrada — cómo aparece
 */
const FORMA_DIBUJO = Object.freeze({
  figura: E(FIGURAS_DIBUJO, "circulo"),
  x: N(0, 1, 0.5), y: N(0, 1, 0.5), w: N(0, 1, 0.3), h: N(0, 1, 0),
  x2: N(0, 1, 0.5), y2: N(0, 1, 0.5), cx: N(0, 1, 0.5), cy: N(0, 1, 0.5),
  inicio: N(0, 360, 0), fin: N(0, 360, 270),
  color: C("acento"), relleno: B(true), grosor: N(0.002, 0.15, 0.03), giro: N(-180, 180, 0), radio: N(0, 0.5, 0),
  retraso: N(0, 10, 0), entrada: E(ENTRADAS_FORMA, "escala"),
});

/**
 * La librería de componentes v1. El motor (paso 2) dibuja EXACTAMENTE estos; uno nuevo se añade aquí y en el motor a la
 * vez. Ninguno dibuja un logo, un personaje o un diseño ajeno: los personajes son figuras genéricas de la casa.
 */
export const COMPONENTES = Object.freeze({
  texto: { nombre: "Texto", props: { texto: T(MAX_PANTALLA, true), rol: E(["titular", "apoyo", "dato", "etiqueta"], "titular"), color: C("texto"), placa: { t: "color", def: "" }, alinear: E(["centro", "izq", "der"], "centro") } },
  sello: { nombre: "Sello de texto", props: { texto: T(24, true), color: C("acento"), rotacion: N(-20, 20, -6) } },
  telefono: {
    nombre: "Teléfono",
    props: {
      pantalla: E(["chat", "imagen", "color", "notificacion"], "chat"), color: C("superficie"),
      mensajes: { t: "lista", max: 6, item: { de: E(["cliente", "marca"], "cliente"), texto: T(90, true) } },
      archivo: T(64), notificacion: T(60),
    },
  },
  burbuja: { nombre: "Burbuja de chat", props: { texto: T(90, true), lado: E(["izq", "der"], "izq"), color: C("superficie") } },
  imagen: { nombre: "Imagen de la galería", props: { archivo: T(64, true), rol: E(["producto", "foto", "persona"], "producto"), recorte: E(["contener", "cubrir"], "contener"), marco: B(false) } },
  personaje: { nombre: "Personaje", props: { variante: E(["adulto", "nino", "bebe"], "adulto"), pose: E(["de-pie", "saluda", "senala", "piensa", "celebra", "preocupado"], "de-pie"), color: C("apoyo") } },
  icono: { nombre: "Icono", props: { nombre: E(ICONOS_VIDEO, "check"), color: C("acento"), fondo: { t: "color", def: "" } } },
  cifra: {
    nombre: "Cifra gigante",
    props: { valor: N(-1e9, 1e9, 0, true), prefijo: T(6), sufijo: T(12), etiqueta: T(30), contar: B(true), decimales: N(0, 2, 0), color: C("acento") },
  },
  anillo: {
    nombre: "Anillo de progreso",
    props: { valor: N(0, 100, 75, true), texto: T(10), etiqueta: T(30), contar: B(true), color: C("acento"), pista: C("superficie") },
  },
  dibujo: {
    nombre: "Dibujo (lienzo libre)",
    props: {
      proporcion: N(0.2, 3, 1),
      formas: { t: "lista", max: MAX_FORMAS, def: [], item: FORMA_DIBUJO },
    },
    comprobar: (p) => (p.formas?.length ? [] : [{ campo: "formas", mensaje: "Un dibujo necesita al menos una forma." }]),
  },
  lista: { nombre: "Lista o pasos", props: { items: { t: "textos", max: 6, maxTexto: 40, req: true }, numerada: B(false), color: C("texto") } },
  reloj: { nombre: "Reloj o contador", props: { modo: E(["reloj", "contador", "cuenta_atras"], "reloj"), desde: N(0, 86400, 0), hasta: N(0, 86400, 0), color: C("texto") } },
  forma: { nombre: "Forma", props: { figura: E(["circulo", "rect", "ola", "estrella", "flecha", "linea", "mancha"], "circulo"), color: C("apoyo"), relleno: B(true) } },
  logo: { nombre: "Logo del kit", props: { placa: { t: "color", def: "" } } },
  llamado: { nombre: "Llamado a la acción", props: { texto: T(30, true), color: C("claro"), fondo: C("acento") } },
  antes_despues: {
    nombre: "Antes y después",
    props: {
      modo: E(["lado", "deslizador", "secuencia"], "lado"),
      textoAntes: T(40), textoDespues: T(40), archivoAntes: T(64), archivoDespues: T(64),
      etiquetaAntes: T(16), etiquetaDespues: T(16), color: C("acento"),
    },
    // Cada lado necesita algo que enseñar: su texto o su imagen.
    comprobar: (p) => ["Antes", "Despues"].filter((l) => !p[`texto${l}`] && !p[`archivo${l}`])
      .map((l) => ({ campo: `texto${l}`, mensaje: `El lado «${l === "Antes" ? "antes" : "después"}» necesita texto${l} o archivo${l}.` })),
  },
});

/** Lo que tiene toda capa además de sus propiedades. */
const COMUNES = new Set(["id", "tipo", "pos", "tam", "entra", "sale", "animacion"]);

// ------------------------------------------------------------
// Las palabras: lo que se dice y cómo se cuenta
// ------------------------------------------------------------

/** Las indicaciones de emoción de ElevenLabs v3 («[emocionada]») van entre corchetes: se dicen, no se leen. */
const ETIQUETA = /\[[^\]\n]{1,40}\]/g;
export const sinEtiquetas = (texto = "") => String(texto).replace(ETIQUETA, " ").replace(/\s+/g, " ").trim();
/** Las etiquetas de emoción de un texto. Pura. */
export const etiquetasDe = (texto = "") => (String(texto).match(ETIQUETA) ?? []).map((e) => e.slice(1, -1).trim());

/**
 * Las palabras que se DICEN de un texto, en orden: sin etiquetas y sin signos sueltos. Es la MISMA cuenta que hará
 * la alineación de la locución: palabra i del guion ⇄ palabra i de la toma. Pura.
 */
export function palabrasDe(texto = "") {
  return sinEtiquetas(texto).split(" ").filter((p) => /[\p{L}\p{N}]/u.test(p));
}

/** El texto de la locución entera, con las etiquetas (lo que recibe ElevenLabs v3). Pura. */
export const textoDeLocucion = (guion) => (guion?.escenas ?? []).map((e) => String(e.habla ?? "").trim()).filter(Boolean).join(" ");

// ------------------------------------------------------------
// Validar y limpiar
// ------------------------------------------------------------

const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const recorta = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function validarProp(def, valor, donde, errores) {
  if (valor === undefined || valor === null || valor === "") {
    if (def.req) errores.push({ donde, mensaje: "Falta y es obligatorio." });
    return def.def;
  }
  switch (def.t) {
    case "texto": {
      const s = recorta(valor);
      if (s.length > def.max) errores.push({ donde, mensaje: `Pasa de ${def.max} caracteres (tiene ${s.length}): acórtalo.` });
      return s;
    }
    case "enum":
      if (!def.lista.includes(valor)) { errores.push({ donde, mensaje: `«${valor}» no vale. Opciones: ${def.lista.join(", ")}.` }); return def.def; }
      return valor;
    case "color":
      if (!esColor(valor)) { errores.push({ donde, mensaje: `«${valor}» no es un color: usa ${TOKENS_COLOR.join(", ")} o #RRGGBB.` }); return def.def; }
      return valor;
    case "num": {
      const n = Number(valor);
      if (!Number.isFinite(n) || n < def.min || n > def.max) { errores.push({ donde, mensaje: `Tiene que ser un número entre ${def.min} y ${def.max}.` }); return def.def; }
      return n;
    }
    case "bool":
      if (typeof valor !== "boolean") { errores.push({ donde, mensaje: "Tiene que ser true o false." }); return def.def; }
      return valor;
    case "textos": {
      if (!Array.isArray(valor) || !valor.length) { errores.push({ donde, mensaje: "Tiene que ser una lista de textos." }); return []; }
      if (valor.length > def.max) errores.push({ donde, mensaje: `Como mucho ${def.max} elementos.` });
      return valor.slice(0, def.max).map((v, i) => validarProp({ t: "texto", max: def.maxTexto, req: true }, v, `${donde}[${i}]`, errores));
    }
    case "lista": {
      if (!Array.isArray(valor)) { errores.push({ donde, mensaje: "Tiene que ser una lista." }); return []; }
      if (valor.length > def.max) errores.push({ donde, mensaje: `Como mucho ${def.max} elementos.` });
      return valor.slice(0, def.max).map((v, i) => {
        if (!esObjeto(v)) { errores.push({ donde: `${donde}[${i}]`, mensaje: "Tiene que ser un objeto." }); return {}; }
        return Object.fromEntries(Object.entries(def.item).map(([k, d]) => [k, validarProp(d, v[k], `${donde}[${i}].${k}`, errores)]));
      });
    }
    default:
      return def.def;
  }
}

/** Un momento dentro de la escena: { palabra: n } (la n-ésima palabra que se dice en ella, desde 0) o { s: segundos }. */
function validarMomento(valor, donde, nPalabras, errores) {
  if (valor === undefined || valor === null) return null;
  if (!esObjeto(valor)) { errores.push({ donde, mensaje: "Tiene que ser { palabra: n } o { s: segundos }." }); return null; }
  if ("palabra" in valor) {
    const n = valor.palabra;
    if (!Number.isInteger(n) || n < 0) { errores.push({ donde, mensaje: "«palabra» es la posición de una palabra de esta escena, desde 0." }); return null; }
    if (n >= nPalabras) { errores.push({ donde, mensaje: `La escena dice ${nPalabras} palabra${nPalabras === 1 ? "" : "s"}: la ${n} no existe (se cuenta desde 0).` }); return null; }
    return { palabra: n };
  }
  if ("s" in valor) {
    const s = Number(valor.s);
    if (!Number.isFinite(s) || s < 0 || s > MAX_SEGUNDOS) { errores.push({ donde, mensaje: "«s» son segundos desde que empieza la escena." }); return null; }
    return { s };
  }
  errores.push({ donde, mensaje: "Tiene que ser { palabra: n } o { s: segundos }." });
  return null;
}

function validarPos(valor, donde, errores) {
  if (valor === undefined || valor === null) return "centro";
  if (typeof valor === "string") {
    if (POSICIONES.includes(valor)) return valor;
    errores.push({ donde, mensaje: `«${valor}» no es una posición. Opciones: ${POSICIONES.join(", ")} o { x, y } entre 0 y 1.` });
    return "centro";
  }
  const x = Number(valor?.x); const y = Number(valor?.y);
  if (esObjeto(valor) && x >= 0 && x <= 1 && y >= 0 && y <= 1) return { x, y };
  errores.push({ donde, mensaje: "La posición es un nombre o { x, y } entre 0 y 1 (0,0 arriba a la izquierda)." });
  return "centro";
}

function validarCapa(capa, donde, nPalabras, errores, avisos, ids) {
  if (!esObjeto(capa)) { errores.push({ donde, mensaje: "Una capa es un objeto con «tipo»." }); return null; }
  const def = COMPONENTES[capa.tipo];
  if (!def) { errores.push({ donde: `${donde}.tipo`, mensaje: `«${capa.tipo}» no es un componente. Opciones: ${Object.keys(COMPONENTES).join(", ")}.` }); return null; }
  const id = recorta(capa.id) || `${capa.tipo}-${ids.size + 1}`;
  if (ids.has(id)) errores.push({ donde: `${donde}.id`, mensaje: `El id «${id}» se repite.` });
  ids.add(id);
  const props = {};
  for (const [k, d] of Object.entries(def.props)) props[k] = validarProp(d, capa[k], `${donde}.${k}`, errores);
  for (const f of def.comprobar?.(props) ?? []) errores.push({ donde: `${donde}.${f.campo}`, mensaje: f.mensaje });
  for (const k of Object.keys(capa)) {
    if (!COMUNES.has(k) && !(k in def.props)) avisos.push({ donde: `${donde}.${k}`, mensaje: `«${k}» no es de un ${capa.tipo}: se quitó.` });
  }
  const tam = capa.tam === undefined ? 0.6 : Number(capa.tam);
  if (!(tam >= 0.05 && tam <= 1.5)) errores.push({ donde: `${donde}.tam`, mensaje: "«tam» es el ancho en fracción del lado corto: entre 0.05 y 1.5." });
  const a = esObjeto(capa.animacion) ? capa.animacion : {};
  const animacion = {
    entrada: validarProp(E(ENTRADAS, "aparece"), a.entrada, `${donde}.animacion.entrada`, errores),
    salida: validarProp(E(SALIDAS, "ninguna"), a.salida, `${donde}.animacion.salida`, errores),
    bucle: validarProp(E(BUCLES, "ninguno"), a.bucle, `${donde}.animacion.bucle`, errores),
  };
  return {
    id, tipo: capa.tipo, pos: validarPos(capa.pos, `${donde}.pos`, errores), tam: Number.isFinite(tam) ? tam : 0.6,
    entra: validarMomento(capa.entra, `${donde}.entra`, nPalabras, errores) ?? { s: 0 },
    sale: validarMomento(capa.sale, `${donde}.sale`, nPalabras, errores),
    animacion, ...props,
  };
}

function validarEscena(e, i, errores, avisos, idsEscenas) {
  const donde = `escenas[${i}]`;
  if (!esObjeto(e)) { errores.push({ donde, mensaje: "Una escena es un objeto." }); return null; }
  const id = recorta(e.id) || `e${i + 1}`;
  if (idsEscenas.has(id)) errores.push({ donde: `${donde}.id`, mensaje: `El id «${id}» se repite.` });
  idsEscenas.add(id);
  if (!TIPOS_ESCENA[e.tipo]) errores.push({ donde: `${donde}.tipo`, mensaje: `«${e.tipo}» no es un tipo de escena. Opciones: ${Object.keys(TIPOS_ESCENA).join(", ")}.` });
  const habla = recorta(e.habla);
  if (habla.length > MAX_HABLA) errores.push({ donde: `${donde}.habla`, mensaje: `Pasa de ${MAX_HABLA} caracteres: parte la escena en dos.` });
  const nPalabras = palabrasDe(habla).length;
  const pausa = e.pausa === undefined ? 0 : Number(e.pausa);
  if (!(pausa >= 0 && pausa <= MAX_PAUSA)) errores.push({ donde: `${donde}.pausa`, mensaje: `«pausa» son segundos de silencio detrás del habla: entre 0 y ${MAX_PAUSA}.` });
  if (!nPalabras && !(pausa > 0)) errores.push({ donde, mensaje: "Una escena que no dice nada necesita «pausa» (los segundos que dura en silencio)." });
  const pantalla = recorta(e.pantalla);
  if (pantalla.length > MAX_PANTALLA) errores.push({ donde: `${donde}.pantalla`, mensaje: `Pasa de ${MAX_PANTALLA} caracteres.` });

  const f = esObjeto(e.fondo) ? e.fondo : {};
  const fondo = {
    tipo: validarProp(E(FONDOS, "plano"), f.tipo, `${donde}.fondo.tipo`, errores),
    color: validarProp(C("fondo"), f.color, `${donde}.fondo.color`, errores),
    color2: validarProp(C("superficie"), f.color2, `${donde}.fondo.color2`, errores),
  };
  const tr = esObjeto(e.transicion) ? e.transicion : {};
  const transicion = {
    tipo: validarProp(E(TRANSICIONES, "corte"), tr.tipo, `${donde}.transicion.tipo`, errores),
    dur: validarProp(N(0, 1, 0.3), tr.dur, `${donde}.transicion.dur`, errores),
  };
  const capasIn = e.capas === undefined ? [] : e.capas;
  if (!Array.isArray(capasIn)) errores.push({ donde: `${donde}.capas`, mensaje: "«capas» es una lista." });
  const lista = Array.isArray(capasIn) ? capasIn : [];
  if (lista.length > MAX_CAPAS) errores.push({ donde: `${donde}.capas`, mensaje: `Como mucho ${MAX_CAPAS} capas por escena.` });
  const ids = new Set();
  const capas = lista.slice(0, MAX_CAPAS).map((c, k) => validarCapa(c, `${donde}.capas[${k}]`, nPalabras, errores, avisos, ids)).filter(Boolean);
  if (!capas.length && !pantalla) avisos.push({ donde, mensaje: "Sin capas ni texto en pantalla: el motor la dibujará sólo con el fondo." });
  for (const et of etiquetasDe(habla)) {
    if (et.split(/\s+/).length > 4) avisos.push({ donde: `${donde}.habla`, mensaje: `La indicación «[${et}]» es larga: v3 sigue mejor una o dos palabras.` });
  }
  return { id, tipo: TIPOS_ESCENA[e.tipo] ? e.tipo : "explicacion", habla, pantalla, pausa: pausa >= 0 && pausa <= MAX_PAUSA ? pausa : 0, fondo, transicion, capas };
}

function validarEstilo(s = {}, errores) {
  const est = esObjeto(s) ? s : {};
  const paleta = {};
  if (est.paleta !== undefined && !esObjeto(est.paleta)) errores.push({ donde: "estilo.paleta", mensaje: "La paleta es { token: #RRGGBB }." });
  for (const [k, v] of Object.entries(esObjeto(est.paleta) ? est.paleta : {})) {
    if (!TOKENS_COLOR.includes(k)) { errores.push({ donde: `estilo.paleta.${k}`, mensaje: `«${k}» no es un token. Opciones: ${TOKENS_COLOR.join(", ")}.` }); continue; }
    if (!HEX.test(String(v))) { errores.push({ donde: `estilo.paleta.${k}`, mensaje: "Un color de la paleta es #RRGGBB." }); continue; }
    paleta[k] = String(v).toUpperCase();
  }
  const fuente = (f, donde) => {
    if (f === undefined || f === null || f === "kit") return "kit";
    if (!esObjeto(f) || !recorta(f.nombre)) { errores.push({ donde, mensaje: "Una fuente es «kit» o { nombre, clave? }." }); return "kit"; }
    const clave = recorta(f.clave);
    if (clave && (!/^clientes\/[^/]+\/fuentes\/[^\s]+$/.test(clave) || clave.includes(".."))) { errores.push({ donde: `${donde}.clave`, mensaje: "La clave de una fuente es la de su archivo en el kit (clientes/<cliente>/fuentes/…)." }); return "kit"; }
    return { nombre: recorta(f.nombre).slice(0, 60), ...(clave ? { clave } : {}) };
  };
  const fu = esObjeto(est.fuentes) ? est.fuentes : {};
  return {
    ...(recorta(est.estiloId) ? { estiloId: recorta(est.estiloId).slice(0, 64) } : {}),
    paleta,
    fuentes: { titular: fuente(fu.titular, "estilo.fuentes.titular"), cuerpo: fuente(fu.cuerpo, "estilo.fuentes.cuerpo") },
    grano: validarProp(N(0, 1, 0.25), est.grano, "estilo.grano", errores),
    ritmo: validarProp(E(RITMOS, "medio"), est.ritmo, "estilo.ritmo", errores),
    ilustracion: validarProp(E(ILUSTRACIONES, "plana"), est.ilustracion, "estilo.ilustracion", errores),
  };
}

/**
 * Valida un guion (objeto o texto JSON) y lo devuelve LIMPIO: sólo los campos del formato, con sus valores por
 * defecto. Nada se recorta ni se arregla en silencio: un texto largo, un color que no existe o una palabra que la
 * escena no dice son ERRORES (quien lo escribió lo corrige); lo que sobra se quita y va en `avisos`.
 * → { ok, errores: [{ donde, mensaje }], avisos, guion, segundos (estimados) }. Pura.
 */
export function validarGuion(entrada) {
  const errores = [];
  const avisos = [];
  let g = entrada;
  if (typeof g === "string") {
    try { g = JSON.parse(g); } catch { return { ok: false, errores: [{ donde: "", mensaje: "No es JSON válido." }], avisos, guion: null, segundos: 0 }; }
  }
  if (!esObjeto(g)) return { ok: false, errores: [{ donde: "", mensaje: "El guion es un objeto con «escenas»." }], avisos, guion: null, segundos: 0 };

  const version = g.version === undefined ? VERSION_GUION : g.version;
  if (version !== VERSION_GUION) errores.push({ donde: "version", mensaje: `Esta aplicación lee la versión ${VERSION_GUION} del formato.` });
  const formatosIn = g.formatos === undefined ? ["9:16"] : g.formatos;
  const formatos = Array.isArray(formatosIn) ? [...new Set(formatosIn)].filter((f) => {
    if (FORMATOS_VIDEO[f]) return true;
    errores.push({ donde: "formatos", mensaje: `«${f}» no es un formato. Opciones: ${Object.keys(FORMATOS_VIDEO).join(", ")}.` });
    return false;
  }) : [];
  if (!formatos.length) errores.push({ donde: "formatos", mensaje: "Hace falta al menos un formato." });

  const escIn = g.escenas;
  if (!Array.isArray(escIn) || !escIn.length) errores.push({ donde: "escenas", mensaje: "Hace falta al menos una escena." });
  else if (escIn.length > MAX_ESCENAS) errores.push({ donde: "escenas", mensaje: `Como mucho ${MAX_ESCENAS} escenas.` });
  const idsEscenas = new Set();
  const escenas = (Array.isArray(escIn) ? escIn.slice(0, MAX_ESCENAS) : []).map((e, i) => validarEscena(e, i, errores, avisos, idsEscenas)).filter(Boolean);

  const sub = esObjeto(g.subtitulos) ? g.subtitulos : {};
  const subtitulos = {
    activo: validarProp(B(true), sub.activo, "subtitulos.activo", errores),
    pos: validarProp(E(["abajo", "centro", "arriba"], "abajo"), sub.pos, "subtitulos.pos", errores),
    maxPalabras: validarProp(N(1, 4, 4), sub.maxPalabras, "subtitulos.maxPalabras", errores),
    maxCaracteres: validarProp(N(10, 30, 23), sub.maxCaracteres, "subtitulos.maxCaracteres", errores),
    acento: validarProp(C("acento"), sub.acento, "subtitulos.acento", errores),
  };
  const mu = esObjeto(g.musica) ? g.musica : null;
  // `estilo` e `instrumental` dicen QUÉ música lleva (lo lee generar_musica de Suno); `clave` es un archivo ya escogido
  // (el render lo usa si el SONIDO del video no tiene otra). La música escogida en «Sonido» manda sobre la del guion.
  const musica = mu ? {
    clave: recorta(mu.clave).slice(0, 200),
    volumen: validarProp(N(0, 1, 0.35), mu.volumen, "musica.volumen", errores),
    bajarConVoz: validarProp(B(true), mu.bajarConVoz, "musica.bajarConVoz", errores),
    ...(recorta(mu.estilo) ? { estilo: recorta(mu.estilo).replace(/\s+/g, " ").slice(0, 300) } : {}),
    ...(mu.instrumental === false ? { instrumental: false } : {}),
  } : null;
  if (musica?.clave && (!/^clientes\/[^/]+\//.test(musica.clave) || musica.clave.includes(".."))) errores.push({ donde: "musica.clave", mensaje: "La música es un archivo del cliente (clientes/<cliente>/…)." });

  for (const k of Object.keys(g)) {
    if (!["version", "titulo", "formatos", "estilo", "escenas", "subtitulos", "musica"].includes(k)) avisos.push({ donde: k, mensaje: `«${k}» no es del formato: se quitó.` });
  }
  const guion = {
    version: VERSION_GUION, titulo: recorta(g.titulo).slice(0, 120), formatos,
    estilo: validarEstilo(g.estilo, errores), escenas, subtitulos, musica,
  };
  const segundos = escenas.length ? lineaDeTiempo(guion).total : 0;
  if (escenas.length && segundos < MIN_SEGUNDOS) errores.push({ donde: "escenas", mensaje: `Dura unos ${segundos.toFixed(1)} s: el mínimo es ${MIN_SEGUNDOS}.` });
  if (segundos > MAX_SEGUNDOS) errores.push({ donde: "escenas", mensaje: `Dura unos ${Math.round(segundos)} s: el máximo es ${MAX_SEGUNDOS} (2 min 30 s).` });
  return { ok: !errores.length, errores, avisos, guion, segundos };
}

// ------------------------------------------------------------
// La línea de tiempo: de palabras a segundos y frames
// ------------------------------------------------------------

const redondo = (s) => Math.round(s * 1000) / 1000;
export const aFrame = (s, fps = FPS) => Math.round(s * fps);

/**
 * Los tiempos de cada palabra de la locución ENTERA: los de la toma (`palabras`, [{ desde, hasta }] en segundos del
 * audio, una por palabra de `palabrasDe(textoDeLocucion(guion))`) o, si no hay o no cuadran, estimados a
 * `PALABRAS_POR_SEGUNDO`. Pura.
 */
function tiemposDeAudio(total, palabras) {
  if (Array.isArray(palabras) && palabras.length === total
    && palabras.every((p, i) => Number.isFinite(p?.desde) && Number.isFinite(p?.hasta) && p.hasta >= p.desde && (i === 0 || p.desde >= palabras[i - 1].desde))) {
    return { tiempos: palabras.map((p) => ({ desde: p.desde, hasta: p.hasta })), estimado: false };
  }
  const paso = 1 / PALABRAS_POR_SEGUNDO;
  return { tiempos: Array.from({ length: total }, (_, i) => ({ desde: i * paso, hasta: (i + 1) * paso - 0.05 })), estimado: true };
}

/**
 * La línea de tiempo del video: cuándo empieza y acaba cada escena, cada palabra (en tiempo del VIDEO) y los
 * silencios que el render tiene que insertar en el audio.
 *
 * El audio es UNA toma. Se corta en puntos: el arranque de la primera palabra de cada escena (salvo la primera, que
 * empieza en 0) y el final de la última palabra + `COLA_FINAL`. La escena dura su trozo de audio más su `pausa`
 * (más lo que falte para `MIN_ESCENA`), y ese silencio se inserta en el audio detrás de su trozo.
 *
 * → { total, estimado, escenas: [{ id, desde, hasta, frames: { desde, hasta }, palabras: [{ texto, desde, hasta }] }],
 *     silencios: [{ en (s del audio), dur }] }. Pura.
 */
export function lineaDeTiempo(guion, palabras = null) {
  const escenas = guion?.escenas ?? [];
  const porEscena = escenas.map((e) => palabrasDe(e.habla));
  const total = porEscena.reduce((n, l) => n + l.length, 0);
  const { tiempos, estimado } = tiemposDeAudio(total, palabras);
  const finAudio = total ? tiempos[total - 1].hasta + COLA_FINAL : 0;

  // El índice global de la primera palabra de cada escena.
  const inicio = [];
  porEscena.reduce((n, l, k) => { inicio[k] = n; return n + l.length; }, 0);
  // El punto de corte del audio donde EMPIEZA la escena k.
  const corte = (k) => {
    if (k === 0) return 0;
    for (let j = k; j < escenas.length; j++) if (porEscena[j].length) return tiempos[inicio[j]].desde;
    return finAudio;
  };

  const salida = [];
  const silencios = [];
  let reloj = 0;
  let desplazado = 0; // lo que va de silencio insertado: tiempo del video = tiempo del audio + desplazado
  escenas.forEach((e, k) => {
    const a = corte(k);
    const b = k === escenas.length - 1 ? finAudio : corte(k + 1);
    const trozo = Math.max(0, b - a);
    const pausa = Math.max(Number(e.pausa) || 0, MIN_ESCENA - trozo, 0);
    const desde = reloj;
    const palabrasEscena = porEscena[k].map((texto, i) => {
      const t = tiempos[inicio[k] + i];
      return { texto, desde: redondo(t.desde + desplazado), hasta: redondo(t.hasta + desplazado) };
    });
    if (pausa > 0) silencios.push({ en: redondo(b), dur: redondo(pausa) });
    desplazado += pausa;
    reloj = desde + trozo + pausa;
    salida.push({ id: e.id, desde: redondo(desde), hasta: redondo(reloj), frames: { desde: aFrame(desde), hasta: aFrame(reloj) }, palabras: palabrasEscena });
  });
  return { total: redondo(reloj), estimado, escenas: salida, silencios };
}

/** Los ids de la galería que nombra un guion (imágenes, teléfonos, antes y después). Pura. */
export function archivosDelGuion(guion) {
  const ids = new Set();
  for (const e of guion?.escenas ?? []) {
    for (const c of e.capas ?? []) for (const k of ["archivo", "archivoAntes", "archivoDespues"]) if (c[k]) ids.add(c[k]);
  }
  return [...ids];
}

/** Cuándo se ve una capa, en segundos del video, dentro de su escena ya colocada (`lineaDeTiempo().escenas[k]`). Pura. */
export function tiempoDeCapa(capa, escena) {
  const momento = (m, def) => {
    if (m && Number.isInteger(m.palabra)) return escena.palabras[m.palabra]?.desde ?? def;
    if (m && Number.isFinite(m.s)) return Math.min(escena.desde + m.s, escena.hasta);
    return def;
  };
  const desde = momento(capa.entra, escena.desde);
  const hasta = Math.max(desde, momento(capa.sale, escena.hasta));
  return { desde: redondo(desde), hasta: redondo(hasta) };
}

/**
 * Qué se oye en el instante `t` del VIDEO: el segundo del AUDIO que suena (`a`) o que está en un silencio insertado
 * (`mudo`, con `a` en el punto donde se para). `desplazado` es lo que va de silencio (tiempo del video = audio +
 * desplazado) y `finTramo` el segundo del audio donde empieza el siguiente silencio. Lo usa la vista previa para que la
 * voz suene con la animación, y lo usará el render para montar el audio. Pura.
 */
export function tramoDeAudio(linea, t) {
  let desplazado = 0;
  for (const s of linea?.silencios ?? []) {
    const inicio = s.en + desplazado; // dónde empieza el silencio, en tiempo del video
    if (t < inicio) return { a: Math.max(0, t - desplazado), mudo: false, desplazado, finTramo: s.en };
    if (t < inicio + s.dur) return { a: s.en, mudo: true, desplazado, finTramo: s.en };
    desplazado += s.dur;
  }
  return { a: Math.max(0, t - desplazado), mudo: false, desplazado, finTramo: Infinity };
}

/**
 * Las palabras de una locución que la voz NO dijo: las del final que la alineación deja sin duración pegadas al último
 * instante (ElevenLabs v3 a veces corta la frase final y marca lo que falta así). → los índices, en orden. Un subtítulo
 * de esas palabras saldría de golpe al final, y lo que no se dijo no se puede subtitular. Pura.
 */
export function palabrasMudas(palabras) {
  const lista = Array.isArray(palabras) ? palabras : [];
  const fin = lista.at(-1)?.hasta;
  if (!Number.isFinite(fin)) return [];
  const mudas = [];
  for (let i = lista.length - 1; i >= 0; i--) {
    const p = lista[i];
    if (!(p.hasta - p.desde < 0.02 && fin - p.desde < 0.05)) break;
    mudas.unshift(i);
  }
  return mudas;
}
