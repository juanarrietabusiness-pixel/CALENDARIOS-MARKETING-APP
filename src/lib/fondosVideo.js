// ============================================================
// Las IMÁGENES DE FONDO POR SECCIÓN del video animado (puro: lo comparten la pantalla, el Worker y Claude)
//
// Con «Con imágenes de fondo», la IA que escribe el guion (o diseña las escenas de una canción) pone de fondo de cada
// sección una capa `imagen` a sangre con `pide` —lo que muestra, en el estilo del kit— y SIN `archivo`. Es un FONDO POR
// CREAR: el guion se guarda así y el motor, mientras tanto, deja ver el fondo de la escena (no hay marcador, no se rompe
// la vista previa ni el render). Después, «Crear las imágenes de fondo» las pide al DIRECTOR por un encargo del servidor
// (con su costo y su confirmación, como toda pieza: worker/lib/estudio/fondosVideo.js) y, al terminar, el encargo les
// pone su `archivo` al guion guardado.
//
// Por qué así (y no crear las imágenes antes de guardar): el guion es de la persona hasta que lo guarda, y el costo se
// dice antes de pagar; un guion con el hueco puesto se puede revisar, editar o renderizar ya, y la imagen llega cuando
// llega. Las escenas de una misma sección llevan el MISMO `pide`: es UNA imagen para todas (el coro, cada vez que vuelve).
// ============================================================

/** Como mucho, imágenes de fondo distintas por video (cada una es una pieza que se paga). */
export const MAX_FONDOS = 8;
/** Lo que se le cuenta a la IA de la galería del cliente (imágenes que ya tiene), como mucho. */
export const MAX_GALERIA_FONDOS = 24;

const clave = (pide) => String(pide ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Los fondos por crear de un guion: [{ pide, escenas: [ids] }], uno por cada `pide` distinto (sin mayúsculas ni espacios
 * de más), en el orden en que aparecen. Sólo las capas `imagen` con `pide` y sin `archivo`. Pura.
 */
export function fondosPendientes(guion) {
  const porClave = new Map();
  for (const e of guion?.escenas ?? []) {
    for (const c of e.capas ?? []) {
      if (c?.tipo !== "imagen" || c.archivo || !clave(c.pide)) continue;
      const k = clave(c.pide);
      if (!porClave.has(k)) porClave.set(k, { pide: String(c.pide).trim(), escenas: [] });
      const f = porClave.get(k);
      if (!f.escenas.includes(e.id)) f.escenas.push(e.id);
    }
  }
  return [...porClave.values()];
}

/** ¿Lleva el guion algún fondo (por crear o ya creado con su `pide`)? Pura. */
export const conFondosPorCrear = (guion) => fondosPendientes(guion).length > 0;

/**
 * El guion con los fondos ya creados puestos: a cada capa `imagen` con `pide` y sin `archivo` le pone el id de la galería
 * de su `pide` (`puestos`: { pide → archivoId }). Lo que no está en `puestos` sigue por crear; una capa que alguien ya
 * cambió (con su `archivo`, o con otro `pide`) no se toca. → { guion, n } (n: capas puestas). Pura.
 */
export function conFondosPuestos(guion, puestos = {}) {
  const porClave = new Map(Object.entries(puestos ?? {}).map(([pide, id]) => [clave(pide), String(id ?? "")]).filter(([, id]) => id));
  let n = 0;
  const escenas = (guion?.escenas ?? []).map((e) => ({
    ...e,
    capas: (e.capas ?? []).map((c) => {
      if (c?.tipo !== "imagen" || c.archivo) return c;
      const id = porClave.get(clave(c.pide));
      if (!id) return c;
      n++;
      return { ...c, archivo: id };
    }),
  }));
  return { guion: { ...guion, escenas }, n };
}

/**
 * Lo que la galería del cliente le cuenta a la IA (imágenes que ya tiene: la agencia puede haber subido grabados de
 * dominio público, o piezas de antes que sirven de fondo): una línea por imagen con su id y lo que se sabe de ella.
 * `archivos`: filas de la galería ({ id, prompt, ancho, alto, origen, subido }). Pura.
 */
export function galeriaParaLaIA(archivos = []) {
  return (Array.isArray(archivos) ? archivos : []).slice(0, MAX_GALERIA_FONDOS).map((a) => {
    const que = String(a.prompt ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const medida = a.ancho && a.alto ? ` · ${a.ancho}×${a.alto}${a.alto > a.ancho * 1.3 ? " (vertical)" : ""}` : "";
    return `· ${a.id}${medida} — ${que || (a.subido ? "subida a mano (sin descripción)" : "sin descripción")}`;
  }).join("\n");
}

/**
 * Las reglas de los fondos para la IA que escribe el guion (con canción o sin ella). `galeria`: las líneas de
 * `galeriaParaLaIA` (o vacío). Pura.
 */
export function lineaDeFondos({ galeria = "", cancion = false, maxFondos = MAX_FONDOS } = {}) {
  return [
    "IMÁGENES DE FONDO (las pidió la agencia: cada sección con su imagen)",
    `· Cada sección del video (el gancho, cada ${cancion ? "verso" : "idea"}, ${cancion ? "el coro, el puente" : "el beneficio"} y el cierre) lleva de FONDO una capa «imagen» a sangre, la primera de sus capas: {"tipo":"imagen","id":"fondo","encuadre":"completo","recorte":"cubrir","movimiento":"acercar"|"alejar"|"paneo","oscurecer":0.35–0.55,"pide":"…"} SIN «archivo»: el director de arte de la agencia la crea después (9:16).`,
    "· «pide»: lo que MUESTRA la imagen, concreto y visual (el sujeto, el encuadre, la luz, la textura), en el estilo del kit y del video, y nacido de lo que DICE esa sección (su mensaje). Sin texto escrito, sin logo, sin marcos; con aire donde irá el texto (arriba o abajo) y ninguna cara donde va el texto.",
    `· Las escenas de una misma sección repiten EXACTAMENTE el mismo «pide» (es UNA imagen para todas)${cancion ? "; el coro, cada vez que vuelve, con la misma" : ""}. Como mucho ${maxFondos} imágenes distintas en todo el video.`,
    "· Si el estilo lo pide (grabados, fotos antiguas), «tratamiento»: «byn» la pone en blanco y negro con más contraste.",
    "· Con imagen de fondo, el texto va arriba o abajo (nunca encima de lo importante de la imagen) y se lee: «oscurecer» o una placa.",
    galeria ? "· Si una imagen de la GALERÍA de abajo sirve de fondo de una sección, úsala con su «archivo» (sin «pide»): ya está pagada." : "",
    galeria ? `GALERÍA DEL CLIENTE (imágenes que ya tiene; sólo si encajan):\n${galeria}` : "",
  ].filter(Boolean).join("\n");
}

/** El error de un guion que pide más fondos de la cuenta (para la vuelta de corrección). Pura. */
export function erroresDeFondos(guion, { maxFondos = MAX_FONDOS } = {}) {
  const n = fondosPendientes(guion).length;
  return n > maxFondos
    ? [{ donde: "escenas", mensaje: `Pide ${n} imágenes de fondo distintas: como mucho ${maxFondos}. Repite el MISMO «pide» en las escenas de una sección.` }]
    : [];
}

/**
 * Lo que recibe el DIRECTOR de cada fondo (`limpiarPiezaEncargo` de director.js): `escena`, lo que muestra (el `pide`:
 * manda); `idea`, para qué es y el ESTILO DEL VIDEO de la marca (obligatorio); `indicacion`, lo que manda sobre todo
 * (sin texto ni logo: el video los pone encima). Pura.
 */
export function encargoDeFondo(pide, { estiloVideo = "", marca = "" } = {}) {
  const estilo = String(estiloVideo ?? "").replace(/\s+/g, " ").trim();
  const idea = `Fondo a sangre (9:16) de una sección de un video animado${marca ? ` de ${marca}` : ""}: el video pone encima su texto y su logo.${estilo ? ` Estilo de los videos de esta marca (obligatorio): ${estilo}` : ""}`;
  return {
    formato: "historia", proporcion: "9:16", tipo: "", texto: "", sinTexto: true,
    escena: String(pide ?? "").replace(/\s+/g, " ").trim().slice(0, 900),
    idea: idea.slice(0, 900),
    indicacion: "Es el FONDO de un video: SIN ningún texto, letra, logo, marco ni placa; con aire arriba o abajo para el texto y ninguna cara donde irá.",
  };
}
