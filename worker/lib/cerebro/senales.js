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
