// ============================================================
// Subir contenido: lo que se decide sin preguntar (puro)
//
// Subir era la última pieza de cinco pasos —calendario, día, idea,
// publicación, pestaña—. Ahora el archivo va primero y lo demás se
// deduce: el formato del archivo, las redes de las cuentas del cliente,
// y el texto lo escribe la IA mirando el archivo. Aquí vive lo que se
// deduce, para que el diálogo rápido y el panel decidan igual.
// ============================================================

import { mediosDe, destinoInstagram, conHistoria, REDES } from "./publicacion.js";
import { semanaDelMes } from "./semanas.js";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * El formato que pide lo subido: varias piezas son un carrusel; un video
 * solo, un reel; una imagen sola, un post. null si no hay nada.
 */
export function formatoDeMedios(medios = []) {
  const lista = medios.filter((m) => m?.src);
  if (!lista.length) return null;
  if (lista.length > 1) return "carrusel";
  return lista[0].tipo === "video" ? "reel" : "post";
}

/** Las redes por defecto: las que el cliente tiene conectadas (Instagram y Facebook primero). */
export function redesPorDefecto(redesDelCliente = []) {
  const orden = ["instagram", "facebook"].filter((r) => redesDelCliente.includes(r));
  return orden.length ? orden : redesDelCliente.length ? [redesDelCliente[0]] : ["instagram"];
}

const PIEZA_INSTAGRAM = { imagen: "post en el feed", carrusel: "carrusel", reel: "reel", historia: "historia" };

/**
 * Qué sale en UNA red con esta publicación: «reel», «historia»,
 * «publicación»… Es lo que se pinta debajo de cada red al elegirlas: la
 * agencia elegía redes sin saber qué iba a salir en cada una, y una
 * historia pensada sólo para Instagram salió también en Facebook.
 */
export function queSaleEn(post, red) {
  if (red === "instagram") return PIEZA_INSTAGRAM[destinoInstagram(post)];
  if (red === "tiktok") return "video";
  return post?.format === "historia" ? "historia" : "publicación";
}

const unir = (lista) => (lista.length < 2 ? lista.join("") : `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`);

/**
 * La frase de dónde sale y dónde NO: «Sale en Instagram (reel + historia)
 * y Facebook (publicación). No sale en TikTok.» Lo que queda fuera se
 * dice también: callarlo es lo que hacía creer que no saldría.
 */
export function resumenDestino(post, redes = []) {
  const dentro = redes.filter((r) => REDES[r]).map((r) => {
    const extra = r !== "tiktok" && conHistoria(post) ? " + historia" : "";
    return `${REDES[r].nombre} (${queSaleEn(post, r)}${extra})`;
  });
  const fuera = Object.keys(REDES).filter((r) => !redes.includes(r)).map((r) => REDES[r].nombre);
  if (!dentro.length) return "No sale en ninguna red: elige al menos una.";
  return `Sale en ${unir(dentro)}.${fuera.length ? ` No sale en ${unir(fuera)}.` : ""}`;
}

/** ¿Está vacía? Una publicación recién creada que se cierra sin escribir ni subir nada. */
export function publicacionVacia(post = {}) {
  const texto = ["title", "idea", "guion", "descripcion", "script", "hashtagsFinales", "primerComentario", "comment"]
    .some((k) => String(post[k] ?? "").trim());
  return !texto && !mediosDe(post).length && !(post.historias ?? []).length;
}

/**
 * Lo que la IA propone a partir del contenido, puesto en la publicación
 * SIN PISAR lo escrito: rellenar no es reescribir. Devuelve la publicación
 * nueva y qué campos se rellenaron.
 */
export function rellenarDesdeContenido(post = {}, propuesta = {}) {
  const campos = {
    descripcion: propuesta.descripcion,
    hashtagsFinales: propuesta.hashtags,
    primerComentario: propuesta.primerComentario,
    altTexto: propuesta.altTexto,
    idea: propuesta.idea,
    title: propuesta.titulo,
  };
  const salida = { ...post };
  const rellenados = [];
  for (const [k, v] of Object.entries(campos)) {
    const nuevo = typeof v === "string" ? v.trim() : "";
    const actual = k === "descripcion" ? post.descripcion || post.script : post[k];
    if (!nuevo || String(actual ?? "").trim()) continue;
    // Una historia no muestra texto: no se le escribe caption ni comentario.
    if (post.format === "historia" && ["descripcion", "hashtagsFinales", "primerComentario"].includes(k)) continue;
    salida[k] = nuevo;
    rellenados.push(k);
  }
  return { post: salida, rellenados };
}

/** ¿Tiene algo que la IA pueda mirar? Imágenes o videos subidos a la aplicación. */
export const tieneContenido = (post) => mediosDe(post).some((m) => m.src.startsWith("/api/media/"));

/**
 * Mete una publicación en el día que le toca de un calendario (creando el
 * día si no está) y devuelve el calendario nuevo. No toca los demás días.
 */
export function ponerEnDia(cal, fecha, post) {
  const days = [...(cal?.days ?? [])];
  const i = days.findIndex((d) => d.date === fecha);
  if (i >= 0) {
    days[i] = { ...days[i], posts: [...(days[i].posts ?? []), post] };
  } else {
    // La semana y el concepto, los de sus vecinos si los hay: así cae en su
    // semana de la lista y no en una suelta.
    const semana = semanaDelMes(fecha);
    const vecino = days.find((d) => (Number(d.weekNumber) || semanaDelMes(d.date)) === semana);
    days.push({
      date: fecha,
      dayName: DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()],
      weekNumber: Number(vecino?.weekNumber) || semana,
      concept: vecino?.concept ?? "",
      category: "",
      posts: [post],
    });
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return { ...cal, days };
}

/** Saca una publicación de su día y la mete en otro del mismo calendario (programar con otro día). */
export function moverEnCalendario(cal, postId, fecha) {
  let post = null;
  const sin = {
    ...cal,
    days: (cal?.days ?? []).map((d) => {
      const p = (d.posts ?? []).find((x) => x.id === postId);
      if (!p) return d;
      post = p;
      return { ...d, posts: d.posts.filter((x) => x.id !== postId) };
    }),
  };
  return post ? ponerEnDia(sin, fecha, post) : cal;
}
