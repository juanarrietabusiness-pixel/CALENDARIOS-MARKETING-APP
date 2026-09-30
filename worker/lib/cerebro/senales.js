// ============================================================
// Las señales: lo que pasa DESPUÉS de escribir
//
// Todo puro. Una señal es «esto salió bien» o «esto salió mal», de 0 a 1,
// con su motivo: el cliente aprobó o pidió cambios, la publicación rindió
// en redes, alguien de la agencia reescribió lo que puso la IA. De cada
// una salen tres cosas, que se aplican en `aprender.js`:
//
//   · una FILA en `cerebro_senales`, que es lo que lee la IA cuando se le
//     pide que proponga reglas;
//   · un REFUERZO de las notas que se usaron al escribir esa publicación
//     (`reinforce()` de memoria.js): suben en la búsqueda si salió bien,
//     bajan si salió mal, y todo vuelve al neutro con los meses;
//   · y, si el cliente dijo algo con sus palabras, una NOTA de tipo
//     «decisión» que las recoge tal cual.
//
// LO QUE NO CUENTA. Que el cliente no conteste no es un éxito: en Agents
// Office el silencio vale 0,75 («usado tal cual»), pero allí lo usó
// alguien de la casa, y aquí muchos clientes no responden nunca. Sin
// respuesta, sin señal.
// ============================================================

import { fold } from "./conocimiento.js";

export const TIPOS_SENAL = Object.freeze(["respuesta", "metricas", "correccion"]);

/**
 * Cuánto pesa cada clase de señal: una respuesta explícita del cliente es lo más claro; lo que rinde en redes
 * depende también de la hora, del día y de la suerte; y una corrección del equipo dice que el texto no servía tal
 * cual, no que la idea fuera mala. Acerca el resultado al neutro (0,5) en la misma proporción.
 */
export const PESO_SENAL = Object.freeze({ respuesta: 1, metricas: 0.6, correccion: 0.6 });

/** Aprobó → salió bien. Pidió cambios → no era lo que quería, sin ser un rechazo del todo. */
export const resultadoDeRespuesta = (estado) => (estado === "aprobado" ? 1 : 0.2);

/** Un resultado, acercado al neutro según lo que pesa su clase de señal. */
export const atenuar = (resultado, tipo) => {
  const r = Math.min(1, Math.max(0, Number(resultado)));
  return 0.5 + ((Number.isFinite(r) ? r : 0.5) - 0.5) * (PESO_SENAL[tipo] ?? 1);
};

/** La identidad de una señal: una por publicación y clase. Si cambia de opinión, se reemplaza. */
export const claveDeSenal = (tipo, postId) => `${tipo}:${postId}`;

/** La clave con la que se guarda la nota automática de la respuesta de una publicación. */
export const fuenteDeRespuesta = (postId) => `respuesta:${postId}`;

const recorta = (t, max) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** De qué publicación se habla: lo justo para que una regla se entienda sin abrir el calendario. */
export function resumenDePublicacion(post, dia = null) {
  const primera = String(post?.idea || post?.descripcion || "").split(/[.\n]/)[0];
  return {
    titulo: recorta(post?.title || primera || "una publicación", 80),
    formato: String(post?.format ?? ""),
    categoria: String(post?.category || dia?.category || ""),
    idea: recorta(post?.idea, 300),
    fecha: String(dia?.date ?? ""),
  };
}

const FORMATOS = { post: "post", reel: "reel", carrusel: "carrusel", historia: "historia", live: "live" };
const cuando = (pub) => [FORMATOS[pub.formato] ?? pub.formato, pub.categoria, pub.fecha].filter(Boolean).join(" · ");

/**
 * La nota «decisión» con las palabras del cliente, o null si no dijo nada (una aprobación a secas no lleva nota: la
 * señal ya la cuenta, y una nota que sólo dice «aprobó» no le enseña nada a nadie).
 *
 * `comentarios`: lo que el cliente escribió en la conversación de esa publicación, del más viejo al más nuevo.
 * No lleva nunca lo que dijo la agencia: es lo que dijo el CLIENTE, y por eso se cita entre comillas y con su nombre.
 */
export function notaDeRespuesta({ publicacion, estado = null, comentario = "", sugeridaDescripcion = "", sugeridoGuion = "", revisor = "", comentarios = [] } = {}) {
  const pub = publicacion ?? resumenDePublicacion(null);
  const propio = recorta(comentario, 900);
  const otros = comentarios.map((c) => recorta(c, 500)).filter((c) => c && c !== propio).slice(-4);
  const cambio = recorta(sugeridaDescripcion, 900);
  const guion = recorta(sugeridoGuion, 900);
  if (!propio && !otros.length && !cambio && !guion) return null;

  const quien = recorta(revisor, 60) || "El cliente";
  const que = estado === "cambios" ? "pidió cambios en" : estado === "aprobado" ? "aprobó" : "comentó sobre";
  const titulo = `${estado === "cambios" ? "Pidió cambios" : estado === "aprobado" ? "Aprobó con un comentario" : "Comentó"}: ${pub.titulo}`.slice(0, 140);
  const lineas = [`# ${quien} ${que} «${pub.titulo}»`, ""];
  const ficha = cuando(pub);
  if (ficha) lineas.push(`Publicación: ${ficha}.`);
  if (pub.idea) lineas.push(`Idea: ${pub.idea}`);
  if (propio) lineas.push("", `Lo que escribió: «${propio}»`);
  if (cambio) lineas.push("", `Cambio que propuso en la descripción: «${cambio}»`);
  if (guion) lineas.push("", `Cambio que propuso en el guion: «${guion}»`);
  if (otros.length) lineas.push("", "Lo que añadió en la conversación:", ...otros.map((c) => `- «${c}»`));
  const texto = lineas.join("\n");
  return { titulo, texto, resumen: recorta(propio || cambio || guion || otros[0], 200) };
}

/**
 * La señal de una respuesta del cliente. `resumen` es la línea que se enseña en la pantalla y que lee la IA:
 * «Pidió cambios en «Reel de sofás»: no me gustan los emojis».
 */
export function senalDeRespuesta({ postId, publicacion, estado, comentario = "", sugeridaDescripcion = "", sugeridoGuion = "", revisor = "", fecha = "" }) {
  const pub = publicacion ?? resumenDePublicacion(null);
  const palabras = recorta(comentario || sugeridaDescripcion || sugeridoGuion, 160);
  return {
    clave: claveDeSenal("respuesta", postId),
    tipo: "respuesta",
    postId,
    resultado: resultadoDeRespuesta(estado),
    resumen: `${estado === "aprobado" ? "Aprobó" : "Pidió cambios en"} «${pub.titulo}»${palabras ? `: ${palabras}` : ""}`,
    detalle: {
      estado, publicacion: pub, revisor: recorta(revisor, 60), fecha,
      comentario: recorta(comentario, 1200), sugeridaDescripcion: recorta(sugeridaDescripcion, 1200), sugeridoGuion: recorta(sugeridoGuion, 1200),
    },
  };
}

/** ¿Dos títulos de reglas dicen lo mismo? Sin tildes, mayúsculas ni puntuación: para no proponer dos veces una regla. */
export const mismoTitulo = (a, b) => {
  const limpia = (t) => fold(String(t)).replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
  return limpia(a) === limpia(b);
};

// ------------------------------------------------------------
// Resultados en redes
//
// Lo que rinde una publicación depende de la hora, del día, de la suerte y de cuánta gente sigue a la cuenta. Por eso
// nunca se compara con un número fijo sino con las demás publicaciones DEL MISMO CLIENTE, y sólo cuando ya hay
// bastantes y han tenido tiempo de rendir. Se mide igual que la pantalla de Resultados («las que más movieron»):
// por interacciones.
// ------------------------------------------------------------

/** Cuántas publicaciones medidas de una red hacen falta para poder decir cuáles rinden más. */
export const MIN_MEDIDAS = 8;
/** Y de un formato, para compararlo sólo con los suyos: un reel y una foto no se miden con la misma vara. */
export const MIN_DEL_FORMATO = 5;
/** Días que tarda una publicación en tener sus cifras: hasta entonces siguen subiendo. */
export const DIAS_DE_MADURACION = 5;

const DIA_MS = 86_400_000;

/** Dónde queda una cifra entre las demás, de 0 a 100. Las iguales cuentan la mitad, para que un empate no favorezca a nadie. */
export function percentil(valor, todos) {
  const v = Number(valor) || 0;
  if (!todos.length) return 50;
  let menos = 0;
  let iguales = 0;
  for (const t of todos) {
    const x = Number(t) || 0;
    if (x < v) menos++;
    else if (x === v) iguales++;
  }
  return ((menos + iguales / 2) / todos.length) * 100;
}

/** Del percentil al 0–1 de una señal. No llega a los extremos: una sola cifra no merece decir «lo mejor» ni «lo peor». */
export const resultadoDePercentil = (p) => 0.1 + 0.8 * (Math.min(100, Math.max(0, Number(p) || 0)) / 100);

/**
 * Dónde queda cada publicación entre las de su cliente. `filas`: de `metricas_publicacion`
 * ({ id, red, tipo, externo_id, interacciones, alcance, texto, enlace, publicada_at }).
 * Sólo cuentan las que ya maduraron; con menos de `MIN_MEDIDAS` en una red, esa red no se compara.
 * → { puntuadas: [{ ...fila, percentil, base: "formato" | "red", de }], madurando, pocas: { red: n } }
 */
export function puntuarPublicaciones(filas, { ahora = Date.now(), maduracion = DIAS_DE_MADURACION } = {}) {
  const maduras = [];
  let madurando = 0;
  for (const f of filas) {
    const t = Date.parse(f.publicada_at);
    if (!Number.isFinite(t)) continue;
    if (ahora - t < maduracion * DIA_MS) madurando++;
    else maduras.push(f);
  }
  const porRed = new Map();
  for (const f of maduras) porRed.set(f.red, [...(porRed.get(f.red) ?? []), f]);

  const puntuadas = [];
  const pocas = {};
  for (const [red, lista] of porRed) {
    if (lista.length < MIN_MEDIDAS) { pocas[red] = lista.length; continue; }
    for (const f of lista) {
      const mismos = lista.filter((g) => g.tipo === f.tipo);
      const grupo = mismos.length >= MIN_DEL_FORMATO ? mismos : lista;
      puntuadas.push({
        ...f, percentil: percentil(f.interacciones, grupo.map((g) => g.interacciones)),
        base: grupo === mismos ? "formato" : "red", de: grupo.length,
      });
    }
  }
  return { puntuadas, madurando, pocas };
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const suma = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
/** Fecha y hora de Panamá (UTC−5, sin horario de verano) de un instante ISO. */
const enPanama = (iso) => new Date(Date.parse(iso) - 5 * 3_600_000).toJSON();

/**
 * La señal de una publicación medida. Puede haber salido en más de una red (Instagram y Facebook tienen sus filas):
 * cuenta una vez, con el percentil medio y las cifras sumadas.
 * `filas`: las de `puntuarPublicaciones` de esa publicación.
 */
export function senalDeMetricas(postId, filas) {
  const principal = filas.find((f) => f.red === "instagram") ?? filas[0];
  const p = media(filas.map((f) => f.percentil));
  const interacciones = suma(filas.map((f) => f.interacciones));
  const alcance = suma(filas.map((f) => f.alcance));
  const texto = recorta(principal.texto, 400);
  const local = principal.publicada_at ? enPanama(principal.publicada_at) : "";
  const pub = {
    titulo: recorta(String(principal.texto ?? "").split(/[\n]/)[0], 80) || "una publicación",
    formato: String(principal.tipo ?? ""), categoria: "", idea: "", fecha: local.slice(0, 10),
  };
  const veredicto = p >= 75 ? "Rindió mejor que casi todas" : p <= 25 ? "Rindió por debajo de casi todas" : "Rindió como las demás";
  return {
    clave: claveDeSenal("metricas", postId),
    tipo: "metricas",
    postId,
    resultado: resultadoDePercentil(p),
    resumen: `${veredicto}: «${pub.titulo}» — ${interacciones} interacciones, mejor que el ${Math.round(p)} % de ${principal.base === "formato" ? "sus " + (pub.formato || "publicaciones") + "s" : "sus publicaciones"}`,
    detalle: {
      publicacion: pub, fecha: pub.fecha, hora: local.slice(11, 16), percentil: Math.round(p * 10) / 10, interacciones, alcance,
      texto, enlace: recorta(principal.enlace, 300), redes: filas.map((f) => f.red), base: principal.base, comparadas: principal.de,
    },
  };
}

// ------------------------------------------------------------
// Correcciones del equipo
//
// Cuando la IA escribe una descripción o un guion y alguien de la agencia lo reescribe, esa diferencia es la
// lección más honesta que hay: es exactamente lo que la IA no supo. Se apunta el texto de la IA la primera vez
// que llega —la línea base— y después se mide cuánto se alejó lo que hay ahora.
//
// Sólo se sabe que un texto lo escribió la IA si se le pidió con las notas del cerebro (`cerebro_usos`); y sólo se
// reconoce su llegada porque llega DE GOLPE: lo que teclea una persona entra de a poco, y una pausa de 600 ms no
// da para sesenta caracteres.
// ------------------------------------------------------------

/** Menos que esto es una errata o un retoque: no enseña nada. */
export const MIN_CAMBIO = 0.15;
/** Cuánto tiene que cambiar la señal para volver a escribirla: los guardados llegan cada pausa al teclear. */
export const SALTO_MINIMO = 0.08;
/** Caracteres de golpe con los que se reconoce un texto que llegó entero. */
const LLEGADA_MINIMA = 60;

export const CAMPOS_TEXTO = Object.freeze([["descripcion", "descripción"], ["guion", "guion"]]);

/** La descripción y el guion de una publicación (la descripción, con el respaldo del campo heredado). */
export const textoDe = (post) => ({ descripcion: String(post?.descripcion || post?.script || ""), guion: String(post?.guion || "") });

/** ¿Cambió algo del texto entre dos versiones? */
export const cambioElTexto = (a, b) => CAMPOS_TEXTO.some(([c]) => a[c] !== b[c]);

// Palabras y emojis: quitar los emojis de un texto tiene que notarse.
const piezas = (t) => fold(String(t ?? "")).match(/[\p{L}\p{N}]+|\p{Extended_Pictographic}/gu) ?? [];

function bigramas(ps) {
  const lista = ps.length < 2 ? ps : ps.slice(1).map((p, i) => `${ps[i]} ${p}`);
  const m = new Map();
  for (const g of lista) m.set(g, (m.get(g) ?? 0) + 1);
  return m;
}

/** Cuánto se parecen dos textos, de 0 a 1 (Dice sobre pares de palabras: no le importa el orden de las frases). */
export function similitud(a, b) {
  const pa = piezas(a);
  const pb = piezas(b);
  if (!pa.length && !pb.length) return 1;
  if (!pa.length || !pb.length) return 0;
  const ga = bigramas(pa);
  const gb = bigramas(pb);
  let comunes = 0;
  let na = 0;
  let nb = 0;
  for (const [g, c] of ga) { na += c; comunes += Math.min(c, gb.get(g) ?? 0); }
  for (const c of gb.values()) nb += c;
  return (2 * comunes) / (na + nb);
}

const contarEmojis = (t) => (String(t ?? "").match(/\p{Extended_Pictographic}/gu) ?? []).length;

/**
 * Cuánto cambió un texto, de 0 a 1. Quitar (o poner) los emojis es de lo más habitual que se corrige y, en palabras,
 * casi no pesa: por eso, si su número cambia en dos o más, eso cuenta aparte.
 */
export function intensidadDeCambio(antes, despues) {
  const enPalabras = 1 - similitud(antes, despues);
  const dif = Math.abs(contarEmojis(antes) - contarEmojis(despues));
  return Math.max(enPalabras, dif >= 2 ? Math.min(0.5, 0.1 + 0.1 * dif) : 0);
}

/** El cambio, en palabras para quien lo lee después (la IA que propone reglas y la persona que las revisa). */
export function describirCambio(antes, despues, intensidad) {
  const partes = [];
  const ea = contarEmojis(antes);
  const ed = contarEmojis(despues);
  if (ea >= 2 && ed === 0) partes.push("se quitaron los emojis");
  else if (ea - ed >= 3) partes.push("se quitaron varios emojis");
  else if (ed - ea >= 3) partes.push("se añadieron emojis");
  const la = String(antes ?? "").length;
  const ld = String(despues ?? "").length;
  if (la >= 80 && ld <= la * 0.6) partes.push("quedó mucho más corto");
  else if (la >= 80 && ld >= la * 1.5) partes.push("quedó mucho más largo");
  if (!partes.length) partes.push(intensidad >= 0.6 ? "se reescribió casi entero" : "se cambiaron varias frases");
  return partes.join(", ");
}

/** ¿Este texto acaba de llegar entero? Un tecleo no lo hace; la IA (o un pegado) sí. */
export function llegoDeGolpe(antes, despues) {
  const a = String(antes ?? "");
  const d = String(despues ?? "");
  if (d.trim().length < LLEGADA_MINIMA) return false;
  if (d.length - a.length >= LLEGADA_MINIMA) return true;
  return a.trim().length >= LLEGADA_MINIMA && similitud(a, d) < 0.4;
}

/**
 * Qué dice un guardado sobre lo que escribió la IA.
 *   `base`: lo apuntado hasta ahora ({} = todavía nada; un campo ausente = de ése todavía no llegó nada). Cada campo
 *           lleva en `en` cuándo se apuntó.
 *   `antes` y `despues`: el texto de la publicación en los dos guardados.
 *   `pedidoAt`: la última vez que se le pidió texto a la IA para esta publicación. Si es posterior a lo apuntado y
 *           el campo vuelve a llegar de golpe, es la IA REGENERANDO: la base se cambia por el texto nuevo. Sin esto,
 *           un texto regenerado se leería como una corrección enorme del anterior.
 *   `ahora`: el instante que se apunta.
 * → { base, fijada, correccion }
 *   · `base` nueva, con los campos que acaban de llegar de golpe; `fijada` dice si cambió.
 *   · `correccion`: el campo que más se alejó de lo que escribió la IA, o null si no hay nada que medir todavía.
 */
export function evaluarEdicion(base, antes, despues, { pedidoAt = "", ahora = new Date().toJSON() } = {}) {
  const nueva = { ...base, en: { ...base?.en } };
  const recien = new Set();
  for (const [campo] of CAMPOS_TEXTO) {
    if (antes[campo] === despues[campo] || !llegoDeGolpe(antes[campo], despues[campo])) continue;
    const yaHabia = nueva[campo] !== undefined;
    if (yaHabia && !(pedidoAt && pedidoAt > String(nueva.en[campo] ?? ""))) continue;
    nueva[campo] = despues[campo];
    nueva.en[campo] = ahora;
    recien.add(campo);
  }
  let mayor = null;
  for (const [campo, etiqueta] of CAMPOS_TEXTO) {
    // Lo que acaba de llegar en ESTE guardado es la base: aún no hay con qué compararlo.
    if (nueva[campo] === undefined || recien.has(campo)) continue;
    const actual = despues[campo];
    // Un campo vaciado es alguien a medio reescribirlo, no una opinión.
    if (String(actual).trim().length < 10) continue;
    const intensidad = intensidadDeCambio(nueva[campo], actual);
    if (!mayor || intensidad > mayor.intensidad) mayor = { campo: etiqueta, antes: nueva[campo], despues: actual, intensidad };
  }
  return { base: nueva, fijada: recien.size > 0, correccion: mayor };
}

/** De cuánto se cambió a cuánto salió: un texto que se dejó casi igual es una aceptación; uno reescrito, no. */
export const resultadoDeCorreccion = (intensidad) => Math.min(0.75, Math.max(0.15, 0.75 - 0.6 * Math.min(1, Math.max(0, intensidad))));

/** La señal de una corrección. `quien`: el nombre de la persona que la hizo. */
export function senalDeCorreccion({ postId, publicacion, campo, antes, despues, intensidad, quien = "", fecha = "" }) {
  const pub = publicacion ?? resumenDePublicacion(null);
  const cambio = describirCambio(antes, despues, intensidad);
  const que = campo === "guion" ? "el guion" : `la ${campo}`;
  return {
    clave: claveDeSenal("correccion", postId),
    tipo: "correccion",
    postId,
    resultado: resultadoDeCorreccion(intensidad),
    resumen: intensidad < MIN_CAMBIO ? `Dejó casi igual ${que} de «${pub.titulo}»` : `Corrigió ${que} de «${pub.titulo}»: ${cambio}`,
    detalle: {
      publicacion: pub, fecha, campo, antes: recorta(antes, 1200), despues: recorta(despues, 1200),
      cambio, intensidad: Math.round(intensidad * 100) / 100, quien: recorta(quien, 60),
    },
  };
}
