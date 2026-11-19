// ============================================================
// La IDENTIDAD DE VIDEO de un cliente (pura): lo que todos sus videos comparten para verse y sonar igual
//
// Vive en el kit (`kit.identidadVideo`) y la cambia SÓLO su ruta (worker/lib/estudio/identidadVideo.js): el PUT del kit
// la conserva, como los estilos guardados. Tiene cuatro partes, todas opcionales:
//
//   · `estiloId`   — cuál de los ESTILOS GUARDADOS del cliente (src/lib/estilosVideo.js) es «el de la marca»: se aplica
//                    solo a cada video animado nuevo que no pida otro.
//   · `musicas`    — la lista de músicas de la biblioteca (del cliente o de la agencia) que pueden sonar en sus videos.
//                    Un video nuevo toma una de la lista (la que menos se usó últimamente); Claude escoge otra de la
//                    lista según el tono. Sin lista, la favorita del cliente, como antes.
//   · `efectos`    — para cada MOMENTO del video (transición, golpe, subida, sello, logo, ítem, cifra), los efectos del
//                    CATÁLOGO que suenan en sus automáticos, rotando entre ellos. Sin lista para un momento, el de siempre.
//   · `subtitulos` — el estilo de dibujo de los subtítulos (`ESTILOS_SUBTITULO`), dónde van, cuántas palabras por grupo,
//                    el color de la palabra clave y si van en mayúsculas.
//
// Se aplica al CREAR un video (videosProyectos.js `crearProyecto`): lo ya hecho no cambia, y lo que se cambie después en
// un video concreto (otra música, otro subtítulo) se queda en ese video. Un estilo guardado puede llevar su propio
// sonido o subtítulo (el del video del que salió): manda el estilo que se elige, y la identidad cubre lo que no diga.
//
// Aquí sólo la forma (ids con su formato, topes): que un efecto exista en el catálogo o que una música sea de este
// cliente lo comprueba el servidor al guardar (el catálogo pesa 50 kB y esto lo carga el kit en la pantalla).
// ============================================================

import { TOKENS_COLOR, ESTILOS_SUBTITULOS } from "./videoEscenas.js";
import { limpiarEstilosVideo } from "./estilosVideo.js";

export { ESTILOS_SUBTITULOS };

/** Los estilos de dibujo de los subtítulos (los dibuja src/lib/motorVideo.js, `dibujarSubtitulos`). */
export const ESTILOS_SUBTITULO = Object.freeze({
  clasico: { nombre: "Clásico", descripcion: "El grupo en mayúsculas con borde oscuro; la palabra que se dice crece un poco y la clave va en el color de acento." },
  palabra: { nombre: "Palabra a palabra", descripcion: "Sólo la palabra que se dice, grande y con borde, en el centro de su franja; la clave, en el color de acento." },
  placa: { nombre: "Sobre placa", descripcion: "El grupo sobre una placa redondeada del color oscuro de la marca, sin borde; la clave en el color de acento." },
  limpio: { nombre: "Limpio", descripcion: "Como se escribe (sin forzar mayúsculas), sin borde, con una sombra suave; lo que aún no se dice, tenue." },
});
export const ESTILO_SUBTITULO_INICIAL = "clasico";
/** Los estilos que por defecto NO van en mayúsculas (los demás sí, como siempre). */
const SIN_MAYUSCULAS = new Set(["limpio"]);

/** Los MOMENTOS del video que suenan solos, con los papeles del catálogo que les encajan (para sugerir). */
export const MOMENTOS_EFECTO = Object.freeze({
  transicion: { nombre: "Transiciones", para: "cada cambio de escena que se mueve (deslizar, barrido, zoom, empuje…)", papeles: ["transicion", "transicion_grande"] },
  impacto: { nombre: "Golpes", para: "el destello de una transición de golpe o glitch", papeles: ["golpe", "glitch", "obturador"] },
  subida: { nombre: "Subidas", para: "la tensión que llega hasta un golpe", papeles: ["subida", "respiro"] },
  sello: { nombre: "Sellos y llamados", para: "un sello o el llamado a la acción que aparece", papeles: ["pop", "aterrizaje"] },
  logo: { nombre: "Logo", para: "cuando entra el logo", papeles: ["firma", "brillo", "golpe"] },
  item: { nombre: "Ítems de una lista", para: "cada ítem de una lista que llega", papeles: ["toc", "aterrizaje", "toque"] },
  cifra: { nombre: "Cifras", para: "una cifra o un dato que aparece", papeles: ["campana", "tic", "golpe"] },
});
export const IDS_MOMENTO = Object.freeze(Object.keys(MOMENTOS_EFECTO));

export const MAX_MUSICAS_IDENTIDAD = 8;
export const MAX_EFECTOS_MOMENTO = 4;
const ID_ESTILO = /^ev-[a-z0-9]{4,24}$/;
const ID_PISTA = /^[\w-]{1,80}$/;
const ID_CATALOGO = /^[a-z0-9_-]{1,80}$/;
const POSICIONES_SUBTITULO = ["abajo", "centro", "arriba"];
const HEX = /^#[0-9a-f]{6}$/i;

const esObjeto = (o) => o && typeof o === "object" && !Array.isArray(o);
const corto = (t, n) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Los subtítulos de la identidad, limpios: { estilo, pos?, maxPalabras?, acento?, mayusculas? } o null. Pura. */
export function limpiarSubtitulosIdentidad(s) {
  if (!esObjeto(s)) return null;
  const out = {};
  if (Object.hasOwn(ESTILOS_SUBTITULO, s.estilo)) out.estilo = s.estilo;
  if (POSICIONES_SUBTITULO.includes(s.pos)) out.pos = s.pos;
  const n = Math.round(Number(s.maxPalabras));
  if (Number.isFinite(n) && n >= 1 && n <= 4) out.maxPalabras = n;
  if (TOKENS_COLOR.includes(s.acento) || HEX.test(String(s.acento ?? ""))) out.acento = String(s.acento);
  if (typeof s.mayusculas === "boolean") out.mayusculas = s.mayusculas;
  return Object.keys(out).length ? { estilo: out.estilo ?? ESTILO_SUBTITULO_INICIAL, ...out } : null;
}

/**
 * La identidad tal como se guarda: sólo lo que se entiende, con sus topes. → la identidad, o null si no lleva nada. Pura.
 * `musicas`: [{ id, de? ("agencia"), nombre? }]; `efectos`: { momento: [id del catálogo] }.
 */
export function limpiarIdentidad(o) {
  if (!esObjeto(o)) return null;
  const out = {};
  if (ID_ESTILO.test(String(o.estiloId ?? ""))) out.estiloId = String(o.estiloId);
  const vistas = new Set();
  const musicas = (Array.isArray(o.musicas) ? o.musicas : [])
    .map((m) => (typeof m === "string" ? { id: m } : m))
    .filter((m) => esObjeto(m) && ID_PISTA.test(String(m.id ?? "")) && !vistas.has(String(m.id)) && vistas.add(String(m.id)))
    .slice(0, MAX_MUSICAS_IDENTIDAD)
    .map((m) => ({ id: String(m.id), ...(m.de === "agencia" ? { de: "agencia" } : {}), ...(corto(m.nombre, 80) ? { nombre: corto(m.nombre, 80) } : {}) }));
  if (musicas.length) out.musicas = musicas;
  if (esObjeto(o.efectos)) {
    const efectos = {};
    for (const k of IDS_MOMENTO) {
      const lista = [...new Set((Array.isArray(o.efectos[k]) ? o.efectos[k] : []).map(String).filter((id) => ID_CATALOGO.test(id)))].slice(0, MAX_EFECTOS_MOMENTO);
      if (lista.length) efectos[k] = lista;
    }
    if (Object.keys(efectos).length) out.efectos = efectos;
  }
  const sub = limpiarSubtitulosIdentidad(o.subtitulos);
  if (sub) out.subtitulos = sub;
  return Object.keys(out).length ? out : null;
}

/** ¿Los subtítulos de este estilo van en mayúsculas? (lo que diga `mayusculas`; si no, según el estilo). Pura. */
export const subtitulosEnMayusculas = (sub) => (typeof sub?.mayusculas === "boolean" ? sub.mayusculas : !SIN_MAYUSCULAS.has(sub?.estilo));

/**
 * El guion con los SUBTÍTULOS de la identidad (al crear un video): el estilo, la posición, las palabras por grupo, el
 * acento y las mayúsculas. No los enciende ni los apaga (eso lo decide el guion: con letra cinética van apagados).
 * Sin identidad de subtítulos, el guion tal cual. → { guion, cambio }. Pura.
 */
export function conSubtitulosDeIdentidad(guion, identidad) {
  const sub = limpiarIdentidad(identidad)?.subtitulos;
  if (!sub || !esObjeto(guion)) return { guion, cambio: false };
  const antes = esObjeto(guion.subtitulos) ? guion.subtitulos : {};
  const nuevo = { ...antes, ...sub };
  const cambio = JSON.stringify(nuevo) !== JSON.stringify(antes);
  return { guion: cambio ? { ...guion, subtitulos: nuevo } : guion, cambio };
}

/** Los efectos de la identidad por momento ({ momento: [ids] }) o null: lo que lleva el sonido de un video nuevo. Pura. */
export function paletaDeIdentidad(identidad) {
  const e = limpiarIdentidad(identidad)?.efectos;
  return e && Object.keys(e).length ? e : null;
}

/** La paleta de efectos de un SONIDO (el de un video), limpia: { momento: [ids] } o null. Pura. */
export function limpiarPaleta(p) {
  return paletaDeIdentidad({ efectos: p });
}

/**
 * La música de la identidad que toca a un video nuevo: la primera de la lista que NO sonó en los últimos videos
 * (`recientes`: ids de música de los videos más nuevos primero); si todas sonaron, la que hace más que sonó. → el
 * elemento de la lista, o null sin lista. Pura.
 */
export function musicaQueToca(identidad, recientes = []) {
  const lista = limpiarIdentidad(identidad)?.musicas ?? [];
  if (!lista.length) return null;
  const orden = recientes.map(String);
  const libre = lista.find((m) => !orden.includes(m.id));
  if (libre) return libre;
  return [...lista].sort((a, b) => orden.indexOf(b.id) - orden.indexOf(a.id))[0];
}

/**
 * La identidad dicha en frases (para Claude y la pantalla). `estilos`: los estilos guardados del cliente; `pistas`: las
 * músicas que puede usar (de la biblioteca). → [frases]. Pura.
 */
export function resumenDeIdentidad(identidad, { estilos = [], pistas = [] } = {}) {
  const i = limpiarIdentidad(identidad);
  if (!i) return [];
  const nombrePista = (m) => pistas.find((p) => p.id === m.id)?.nombre || m.nombre || m.id;
  const estilo = i.estiloId ? estilos.find((e) => e.id === i.estiloId) : null;
  const sub = i.subtitulos;
  return [
    i.estiloId ? `Estilo de la marca: ${estilo ? `«${estilo.nombre}»` : `${i.estiloId} (ya no está guardado: no se aplica)`}.` : "",
    i.musicas?.length ? `Músicas (${i.musicas.length}): ${i.musicas.map((m) => `«${nombrePista(m)}» [${m.id}]${m.de === "agencia" ? " (de la agencia)" : ""}`).join(", ")}.` : "",
    ...Object.entries(i.efectos ?? {}).map(([k, ids]) => `Efectos de ${MOMENTOS_EFECTO[k].nombre.toLowerCase()}: ${ids.join(", ")}.`),
    sub ? `Subtítulos: ${ESTILOS_SUBTITULO[sub.estilo].nombre.toLowerCase()}${sub.pos ? `, ${sub.pos}` : ""}${sub.maxPalabras ? `, hasta ${sub.maxPalabras} palabras` : ""}${sub.acento ? `, clave en ${sub.acento}` : ""}, ${subtitulosEnMayusculas(sub) ? "en mayúsculas" : "como se escribe"}.` : "",
  ].filter(Boolean);
}

/**
 * El ESTILO DE LA MARCA de un kit (el que marca `identidadVideo.estiloId`) si encaja con el uso («cancion» o «voz»), o
 * null: un estilo que ya no está guardado, o que es sólo para el otro uso, no se aplica. Pura.
 */
export function estiloDeMarcaDelKit(kit, uso = "voz") {
  const id = limpiarIdentidad(kit?.identidadVideo)?.estiloId;
  if (!id) return null;
  const e = limpiarEstilosVideo(kit?.estilosVideo).find((x) => x.id === id);
  if (!e) return null;
  return !e.para || e.para === "todos" || e.para === uso ? e : null;
}
