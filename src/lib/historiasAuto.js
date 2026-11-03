// ============================================================
// Historias automáticas: volver a sacar como historia lo que ya se publicó
//
// Una por día y por cliente, a su hora, para que la cuenta no se quede
// callada entre publicación y publicación. La historia es la imagen del post
// ENCAJADA en 9:16 (la misma imagen sobre su fondo difuminado) con una
// frase corta encima: la hace el navegador (lienzo, src/lib/historiasRepost.js)
// y no cuesta nada. Lo de aquí es puro: lo usa también el Worker
// (worker/lib/historiasAuto.js), que es quien la pone en la cola cada día.
// ============================================================

import { fechaEnZona } from "./agenda.js";
import { mediosDe } from "./publicacion.js";

export const HORA_HISTORIAS = "18:00";
/** Cuántas al día como mucho (decisión de la agencia: empezar con una y subir si todo va bien). */
export const MAX_POR_DIA = 5;
/** Entre una y la siguiente del mismo día, en minutos; y la última no pasa de aquí (si no caben, se juntan). */
const SEPARACION = 120;
const ULTIMA = 22 * 60;
export const REDES_HISTORIAS = Object.freeze(["instagram", "facebook"]);

/** Lo publicado de los últimos días que puede volver como historia. */
export const DIAS_ATRAS = 90;
/** Lo recién publicado no se repite: ya está en el perfil y en el inicio de quien sigue. */
export const DIAS_SIN_REPETIR_POST = 2;
/** La misma historia no sale dos veces en tan poco (con pocas publicaciones, mejor un día sin historia). */
export const DIAS_ENTRE_USOS = 4;
/** Cuántas se preparan de una vez en el navegador (cada una es leer, dibujar y subir una imagen). */
export const PREPARAR_DE_UNA_VEZ = 6;

/** Las frases que van encima. Cortas, sin precio ni promesa: sirven para cualquier publicación. */
export const FRASES_HISTORIA = Object.freeze([
  "¿Ya lo viste?",
  "Por si te lo perdiste",
  "Vuelve a verlo",
  "Lo más visto",
  "No te lo pierdas",
  "Te lo recordamos",
  "¿Lo guardaste?",
  "Esto te va a servir",
]);

/** La frase de una pieza: rota por su número, así dos seguidas no dicen lo mismo. */
export const fraseDe = (indice) => FRASES_HISTORIA[Math.abs(Number(indice) || 0) % FRASES_HISTORIA.length];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Los ajustes de un cliente, con lo que falte puesto por defecto. */
export function limpiarAjustes(a = {}) {
  const redes = Array.isArray(a.redes) ? [...new Set(a.redes.filter((r) => REDES_HISTORIAS.includes(r)))] : [];
  const porDia = Math.round(Number(a.porDia));
  return {
    activa: a.activa === true,
    hora: HORA.test(String(a.hora ?? "")) ? a.hora : HORA_HISTORIAS,
    redes: redes.length ? redes : ["instagram"],
    porDia: porDia >= 1 && porDia <= MAX_POR_DIA ? porDia : 1,
  };
}

const sumarDias = (fecha, n) => {
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10) + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/** Minutos desde la medianoche de Panamá (UTC−5 todo el año). */
const minutosPanama = (momento) => ((momento.getUTCHours() + 19) % 24) * 60 + momento.getUTCMinutes();
const minutosDe = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/**
 * El día de la próxima historia: hoy si a su hora le quedan al menos diez
 * minutos (lo que tarda el cron en verlo y la cola en sacarla), si no, mañana.
 */
export function proximaFecha(hora, momento = new Date()) {
  const hoy = fechaEnZona(momento);
  return minutosPanama(momento) <= minutosDe(HORA.test(String(hora)) ? hora : HORA_HISTORIAS) - 10 ? hoy : sumarDias(hoy, 1);
}

const comoHora = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Las horas de las historias de un día: la primera a su hora y las demás cada 2 horas; si la última pasaría de las
 * 22:00, se juntan (nunca a menos de 30 minutos, ni después de las 23:50). Pura.
 */
export function horasDelDia(hora, porDia = 1) {
  const inicio = minutosDe(HORA.test(String(hora)) ? hora : HORA_HISTORIAS);
  const n = Math.min(MAX_POR_DIA, Math.max(1, Math.round(Number(porDia)) || 1));
  if (n === 1) return [comoHora(inicio)];
  const cabe = Math.floor((ULTIMA - inicio) / (n - 1));
  const paso = Math.max(30, Math.min(SEPARACION, cabe));
  return Array.from({ length: n }, (_, i) => comoHora(Math.min(23 * 60 + 50, inicio + i * paso)));
}

const dias = (a, b) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/**
 * La imagen de una publicación que puede volver como historia: la primera
 * imagen de sus medios o, en un video, su portada. Sólo lo subido a R2: lo de
 * antes (incrustado) no se puede leer en el lienzo ni firmar para Meta.
 */
export function imagenParaHistoria(post) {
  const subida = (src) => typeof src === "string" && src.startsWith("/api/media/clientes/");
  const imagen = mediosDe(post).find((m) => m.tipo === "imagen" && subida(m.src));
  if (imagen) return imagen.src;
  return subida(post?.portada) ? post.portada : null;
}

/**
 * Qué hay que preparar: las publicaciones del feed ya publicadas (una por
 * publicación aunque saliera en dos redes) que tienen imagen y aún no tienen
 * su historia. `filas` son filas de la cola ya leídas; `piezas`, las que hay.
 */
export function porPreparar(filas, piezas, momento = new Date()) {
  const hechas = new Set(piezas.map((p) => p.clave_post ?? p.clavePost));
  const vistas = new Set();
  const salida = [];
  const ordenadas = [...filas].sort((a, b) => (a.red === "instagram" ? -1 : 0) - (b.red === "instagram" ? -1 : 0));
  for (const f of ordenadas) {
    if ((f.variante ?? "post") !== "post" || f.estado !== "publicada" || !f.calendar_id) continue;
    if (f.publicada_at && dias(f.publicada_at, momento.toJSON()) > DIAS_ATRAS) continue;
    const clave = `${f.calendar_id}|${f.post_id}`;
    if (vistas.has(clave) || hechas.has(clave)) continue;
    vistas.add(clave);
    let post = {};
    try { post = typeof f.carga === "string" ? JSON.parse(f.carga).post ?? {} : f.carga?.post ?? {}; } catch { /* sin carga */ }
    if (["historia", "live"].includes(post.format)) continue;
    const src = imagenParaHistoria(post);
    if (!src) continue;
    salida.push({
      filaId: f.id, clavePost: clave, src, externoId: f.red === "instagram" ? f.externo_id ?? "" : "",
      publicadaAt: f.publicada_at ?? null, titulo: String(post.title || post.idea || "").slice(0, 140),
    });
  }
  return salida;
}

/**
 * La pieza que sale: la menos usada; a igualdad, la que mejor funcionó
 * (interacciones de su publicación en Instagram) y, después, la que lleva
 * más tiempo sin salir. Ni lo publicado hace menos de dos días ni lo que salió
 * como historia hace menos de cuatro. null si no queda ninguna.
 */
export function elegirPieza(piezas, { interacciones = new Map(), momento = new Date() } = {}) {
  const ahora = momento.toJSON();
  const candidatas = piezas.filter((p) =>
    !(p.publicada_at && dias(p.publicada_at, ahora) < DIAS_SIN_REPETIR_POST) &&
    !(p.usada_at && dias(p.usada_at, ahora) < DIAS_ENTRE_USOS));
  if (!candidatas.length) return null;
  const valor = (p) => Number(interacciones.get(p.externo_id) ?? 0);
  return candidatas.sort((a, b) =>
    (a.usos ?? 0) - (b.usos ?? 0) ||
    valor(b) - valor(a) ||
    String(a.usada_at ?? "").localeCompare(String(b.usada_at ?? "")))[0];
}

/** Las `n` piezas de un día, distintas, cada una con la misma regla que `elegirPieza`. Pura. */
export function elegirPiezas(piezas, n = 1, opciones = {}) {
  const salida = [];
  let quedan = [...piezas];
  for (let i = 0; i < n; i++) {
    const p = elegirPieza(quedan, opciones);
    if (!p) break;
    salida.push(p);
    quedan = quedan.filter((x) => x.id !== p.id);
  }
  return salida;
}

/** La publicación que va en la carga de la cola: sólo la historia, con la imagen ya hecha. */
export function publicacionDeRepost(pieza, fecha) {
  return {
    id: `repost-${pieza.id}`,
    format: "post",
    title: pieza.titulo || "Historia automática",
    historiaTambien: true,
    historias: [{ src: `/api/media/${pieza.clave}`, tipo: "imagen", nombre: "historia.jpg", ancho: 1080, alto: 1920 }],
    repost: { piezaId: pieza.id, fecha },
  };
}
