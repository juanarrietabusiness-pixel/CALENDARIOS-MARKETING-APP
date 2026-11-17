// ============================================================
// Los EFECTOS COLOCADOS de un video animado: una lista de efectos, cada uno anclado a un EVENTO del video (una escena
// que entra o sale, una capa que aparece o se va, una palabra que se dice, o un segundo), con las REGLAS de cada papel
// (puro: lo leen el Worker, el Container y la pantalla)
//
// El calendario SABE cuándo pasa cada cosa (es quien hace el video: `lineaDeTiempo`), así que nadie tiene que adivinar
// los momentos mirando los cuadros: Claude dice «pop cuando entra el sello» y aquí se convierte en el segundo exacto.
//
// Vive en `videos_proyectos.sonido.colocados` (sólo si hay alguno). Con lista, la lista MANDA: los automáticos (el
// whoosh de cada transición y el pop de cada sello o llamado) no suenan, para no doblar. Sin lista, los automáticos son
// también colocados (`colocadosAutomaticos`), con los mismos papeles y reglas.
//
// Las reglas de cada papel (alinear por el arranque o por el pico, cuánto se adelanta o se atrasa respecto al corte,
// cuántos dB sobre la música, lo más juntos que pueden ir en una racha y si la música baja antes) están MEDIDAS por
// earshot en películas de lanzamiento profesionales (su kit «launch»); las que no, lo dicen (`medido: false`).
// ============================================================

import { tiempoDeCapa } from "./videoEscenas.js";

/**
 * Los PAPELES y sus reglas. `alinear`: «arranque» (lo que suena empieza en el momento) o «pico» (lo más fuerte cae en
 * el momento); `ajusteMs`: dónde cae respecto al momento (negativo: antes); `sobreFondo`: dB por encima de la música que
 * suena justo antes; `separacionMs`: lo más juntos que pueden ir dos del mismo papel; `bajaMusica`: la música baja un
 * instante antes y vuelve con él.
 */
export const PAPELES = Object.freeze({
  transicion: { nombre: "Transición", para: "un cambio de escena o algo que cruza la pantalla (whoosh, swish, zip)", alinear: "pico", ajusteMs: 37, sobreFondo: 9, separacionMs: 0, bajaMusica: false, medido: true },
  transicion_grande: { nombre: "Transición grande", para: "un cambio grande de escena, algo enorme que pasa", alinear: "pico", ajusteMs: 3, sobreFondo: 8.5, separacionMs: 0, bajaMusica: true, medido: true },
  subida: { nombre: "Subida", para: "la tensión que crece hasta una revelación (termina justo en el momento)", alinear: "pico", ajusteMs: -23, sobreFondo: 8, separacionMs: 0, bajaMusica: false, medido: true },
  respiro: { nombre: "Respiro inverso", para: "algo que crece y llega justo después del corte", alinear: "pico", ajusteMs: 42, sobreFondo: 9.5, separacionMs: 0, bajaMusica: true, medido: true },
  golpe: { nombre: "Golpe", para: "un título o el logo que cae, un corte fuerte, un dato que impacta", alinear: "arranque", ajusteMs: 0, sobreFondo: 7.5, separacionMs: 0, bajaMusica: true, medido: true },
  caida: { nombre: "Caída", para: "peso debajo de un golpe, la energía que se va tras un momento fuerte", alinear: "arranque", ajusteMs: 0, sobreFondo: 7, separacionMs: 0, bajaMusica: true, medido: true },
  aterrizaje: { nombre: "Aterrizaje", para: "un elemento que entra y se asienta (un icono, una tarjeta)", alinear: "arranque", ajusteMs: 30, sobreFondo: 8, separacionMs: 159, bajaMusica: false, medido: true },
  toque: { nombre: "Toque", para: "un dedo que toca la pantalla, algo ligero que se posa", alinear: "arranque", ajusteMs: -60, sobreFondo: 3, separacionMs: 115, bajaMusica: false, medido: true },
  pop: { nombre: "Pop", para: "un sello, una burbuja, una palabra o una etiqueta que aparece", alinear: "arranque", ajusteMs: 4, sobreFondo: 8.5, separacionMs: 114, bajaMusica: false, medido: true },
  clic: { nombre: "Clic", para: "un botón que se pulsa, el cursor, un interruptor", alinear: "arranque", ajusteMs: -11, sobreFondo: 6.5, separacionMs: 85, bajaMusica: false, medido: true },
  confirmacion: { nombre: "Confirmación", para: "algo que salió bien: un pedido hecho, una tarea marcada", alinear: "arranque", ajusteMs: 0, sobreFondo: 8.5, separacionMs: 0, bajaMusica: false, medido: true },
  tic: { nombre: "Tic", para: "un contador que avanza, filas que pasan, pasos pequeños", alinear: "arranque", ajusteMs: 0, sobreFondo: 3, separacionMs: 66, bajaMusica: false, medido: true },
  toc: { nombre: "Toc", para: "un golpecito de madera, algo que se coloca con firmeza", alinear: "arranque", ajusteMs: -40, sobreFondo: 8, separacionMs: 100, bajaMusica: false, medido: true },
  tecla: { nombre: "Tecla", para: "texto que se escribe letra a letra (8 a 14 por segundo como mucho)", alinear: "arranque", ajusteMs: 8, sobreFondo: 6.5, separacionMs: 87, bajaMusica: false, medido: true },
  tecleo: { nombre: "Tecleo seguido", para: "una frase tecleada de un tirón, en un solo efecto", alinear: "arranque", ajusteMs: 8, sobreFondo: 6.5, separacionMs: 0, bajaMusica: false, medido: true },
  texto: { nombre: "Nota de texto", para: "un texto que aparece, con una nota suave", alinear: "arranque", ajusteMs: 0, sobreFondo: 4, separacionMs: 110, bajaMusica: false, medido: true },
  campana: { nombre: "Campana", para: "una notificación, un logro, un precio o una oferta que se revela", alinear: "arranque", ajusteMs: -20, sobreFondo: 7.5, separacionMs: 110, bajaMusica: false, medido: true },
  brillo: { nombre: "Brillo", para: "magia, algo que se revela o queda limpio, el cierre", alinear: "arranque", ajusteMs: 0, sobreFondo: 6, separacionMs: 0, bajaMusica: false, medido: false },
  firma: { nombre: "Firma de logo", para: "la aparición del logo al final", alinear: "arranque", ajusteMs: 0, sobreFondo: 8, separacionMs: 0, bajaMusica: true, medido: false },
  glitch: { nombre: "Glitch", para: "interferencia, algo digital que falla o cambia de golpe", alinear: "arranque", ajusteMs: 0, sobreFondo: 6, separacionMs: 0, bajaMusica: false, medido: false },
  obturador: { nombre: "Obturador", para: "una foto, un zoom o un corte de golpe", alinear: "arranque", ajusteMs: 9, sobreFondo: 4, separacionMs: 66, bajaMusica: false, medido: true },
  interfaz: { nombre: "Interfaz", para: "lo que pasa en una pantalla: enviar, recibir, añadir al carrito, un error", alinear: "arranque", ajusteMs: 0, sobreFondo: 6, separacionMs: 90, bajaMusica: false, medido: false },
  // Un efecto de la BIBLIOTECA de sonido (subido): no se sabe qué es, va por su arranque.
  propio: { nombre: "De la biblioteca", para: "un efecto subido a la biblioteca de sonido", alinear: "arranque", ajusteMs: 0, sobreFondo: 6, separacionMs: 0, bajaMusica: false, medido: false },
});

/**
 * Los efectos AUTOMÁTICOS (sin lista), del catálogo: el whoosh de cada transición que se mueve, el IMPACTO de un golpe o un
 * glitch (un golpe grave en el destello) y el pop de cada sello o llamado.
 */
export const EFECTO_AUTOMATICO = Object.freeze({ transicion: "whoosh_fast-crisp", impacto: "pro_impact-air", sello: "ui_pop-soft" });
/**
 * La VARIEDAD de los automáticos: cada tipo de transición suena a su familia (un empuje a un barrido grave, una cortina a
 * un paño que pasa, un círculo a un respiro que se abre, un golpe a un impacto…) y, dentro de la familia, la variante va
 * ROTANDO con cada transición del video. Antes sonaba el mismo whoosh en todas, el mismo impacto y el mismo pop: lo
 * primero que se oye como «plantilla». El primero de cada lista es el de `EFECTO_AUTOMATICO` cuando lo hay.
 */
export const SONIDOS_DE_TRANSICION = Object.freeze({
  fundido: ["swish-soft", "swipe-velvet", "reverse_swell-short"],
  barrido: ["swipe-glide", "swipe-paper", "swipe-cloth"],
  deslizar: ["swish-bright", "swipe-flick", "whoosh_fast-sleeve"],
  zoom: ["whoosh_fast-whip", "whoosh_fast-tight", "whoosh_fast-reverse"],
  empuje: ["whoosh_big-swell", "pro_whoosh_big-swell", "whoosh_big-cape", "pro_whoosh_big-tonal"],
  cortina: ["whoosh_big-thump_airy", "swipe-velvet", "whoosh_big-thump"],
  circulo: ["reverse_swell-ring", "reverse_swell-cymbal", "reverse_swell-breath"],
  persiana: ["swipe-cloth", "shutter-film", "swish-cane"],
  golpe: ["pro_impact-air", "pro_impact-deep", "cut_hit-punch", "pro_impact-swell"],
  glitch: ["pro_glitch-standard", "pro_glitch-data", "glitch-burst"],
});
/** Lo que entra en pantalla y suena solo (sin lista), con sus variantes que rotan; y el volumen (dB) de cada sitio. */
export const SONIDOS_DE_CAPA = Object.freeze({
  sello: ["ui_pop-soft", "pro_pop-boop", "pro_pop-double", "ui_pop-wide"],
  logo: ["logo_sting-soft_bloom", "pro_logo_sting-swell_sting", "logo_sting-spark"],
  // Los ítems de una lista, en madera (cálido; no un pop de interfaz), y el ÚLTIMO, una confirmación: «ya está».
  item: ["knock-wood", "knock-desk", "knock-double"],
  final: ["notify-mid_wood", "notify-mid_tine"],
  cifra: ["mallet-up4", "mallet-flourish"],
  busqueda: ["pro_typing_run-tick", "pro_typing_run-soft"],
  resultado: ["ui_pop-step", "ui_pop-blip"],
  comentario: ["notify-m2", "notify-m3"],
  icono: ["pro_pop_in-round", "pro_pop_in-double"],
  despues: ["notify-mid_tine", "notify-mid_wood"],
  marcador: ["pro_shimmer-m1", "pro_shimmer-m2"],
});
/** Lo que acompaña a un GOLPE de luz: la subida que termina en el destello y el grave que queda debajo. */
export const CAPAS_DEL_GOLPE = Object.freeze({ subida: ["riser-swell", "riser-build", "pro_riser-air_gate"], caida: ["pro_sub_drop-soft", "pro_sub_drop-low"] });
const VOLUMEN_DE_CAPA = Object.freeze({ item: -1, icono: -2, resultado: -2, marcador: -2, caida: -3 });
/** Las transiciones que se MUEVEN (su whoosh cae en la mitad, lo más rápido del movimiento, no en el primer cuadro). */
const SE_MUEVEN = new Set(["empuje", "cortina", "circulo", "persiana", "deslizar", "barrido", "zoom"]);
/** Cuándo se pinta el marcador de una palabra de énfasis, desde que entra su texto (aproximado: la primera línea). */
const MARCADOR_TRAS = 0.45;
/**
 * Los SECUNDARIOS (el destello del marcador, la nota de una cifra, el pop de un icono) son adorno: callan si un principal
 * (una transición, un golpe, un ítem, el logo…) suena hasta `ANTES` s antes o `DESPUES` s después. Sin esto se
 * amontonaban sobre la cola de un impacto o encima del whoosh de su propia escena.
 */
const SECUNDARIOS = new Set(["marcador", "cifra", "icono"]);
export const RESPIRO_SECUNDARIO = Object.freeze({ antes: 0.5, despues: 0.25 });
/** Lo que espera cada ítem de una lista a que entre el anterior si la capa no lo dice (s; lo mismo que dibuja el motor). */
const CADA_ITEM = 0.4;
/** Una variante de la lista por su turno (0, 1, 2…), dando la vuelta. Pura. */
const turnoDe = (lista, n) => lista[((n % lista.length) + lista.length) % lista.length];

/** Las transiciones que suenan a IMPACTO (un golpe grave en el destello, que es su mitad), no a whoosh. */
export const TRANSICIONES_DE_IMPACTO = Object.freeze(["golpe", "glitch"]);
/** Lo que se le sube al impacto automático (dB): lo grave se oye menos a igual RMS. */
export const REALCE_IMPACTO = 5;

/** El nivel de partida bajo la voz (dB, en RMS de lo que suena), el de siempre; cada papel se mueve sobre él. */
export const BAJO_LA_VOZ = 12;
/** Lo más cerca de la voz que llega un efecto por la regla de la música (dB): la voz manda. El volumen a mano sí lo pasa. */
export const TECHO_BAJO_LA_VOZ = 6;
/** Cuánto baja la música antes de un efecto que la baja (lo medido: 6 a 12 dB, 0,3 a 0,5 s antes; vuelve con él). */
export const BAJADA_MUSICA = Object.freeze({ db: 8, antes: 0.4, entra: 0.05, vuelve: 0.12 });
/** Efectos por cada 10 s en lo medido por earshot: lo dice el informe, no lo impone. */
export const DENSIDAD_DE_REFERENCIA = Object.freeze({ musica: [3, 13], locucion: [18, 30], efectos: [30, 38] });
/** Dos automáticos a menos de esto (s) se quedan en uno (el primero), como siempre. */
const JUNTOS_AUTOMATICOS = 0.15;

export const MAX_COLOCADOS = 120;
export const VOLUMEN_EFECTO = Object.freeze({ min: -12, max: 6 });
export const MAX_AJUSTE_MS = 1000;
/** Lo más que se ancla en el tiempo (s): el video más largo dura 150 s (180 con canción). */
const MAX_SEGUNDO = 600;

const ID_CATALOGO = /^[a-z0-9_-]{1,80}$/;
const ID = /^[\w-]{1,80}$/;
const r3 = (n) => Math.round(n * 1000) / 1000;
const texto = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const claveValida = (c) => typeof c === "string" && /^(clientes|biblioteca)\/[\w-]+\/./.test(c) && !c.includes("..");

/** El nivel de partida de un papel en dB respecto al de siempre bajo la voz (`sobreFondo` − 8). Pura. */
export const nivelDePapel = (papel) => (PAPELES[papel] ?? PAPELES.propio).sobreFondo - 8;

/**
 * Un efecto colocado, limpio, o null si no vale. Forma guardada (plana):
 *   { sonido: id del catálogo | propio: { archivoId, clave?, nombre, de? },
 *     ancla: segundo | escena (+ capa) (+ sale) | palabra (+ escena) (+ n),
 *     ajusteMs?, volumen?, nota? }
 * `sale: true` es cuando la escena (o la capa) se VA; `n` es la vez que se dice la palabra (1 la primera). Acepta
 * también los nombres de la herramienta (efecto, momento: "sale", ajuste_ms). Pura.
 */
export function limpiarColocado(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const out = {};
  if (o.propio && typeof o.propio === "object" && ID.test(String(o.propio.archivoId ?? ""))) {
    out.propio = {
      archivoId: String(o.propio.archivoId),
      ...(claveValida(o.propio.clave) ? { clave: o.propio.clave } : {}),
      nombre: texto(o.propio.nombre, 80),
      ...(o.propio.de === "agencia" ? { de: "agencia" } : {}),
    };
  } else {
    const id = String(o.sonido ?? o.efecto ?? "").trim();
    if (!ID_CATALOGO.test(id)) return null;
    out.sonido = id;
  }
  const escena = texto(o.escena, 80);
  const capa = texto(o.capa, 80);
  const palabra = texto(o.palabra, 40);
  const segundo = Number(o.segundo);
  if (palabra) {
    out.palabra = palabra;
    if (escena) out.escena = escena;
    const n = Math.round(Number(o.n));
    if (Number.isFinite(n) && n > 1) out.n = Math.min(n, 50);
  } else if (escena) {
    out.escena = escena;
    if (capa) out.capa = capa;
    if (o.sale === true || o.momento === "sale") out.sale = true;
  } else if (o.segundo !== undefined && o.segundo !== null && o.segundo !== "" && Number.isFinite(segundo) && segundo >= 0) {
    out.segundo = r3(Math.min(segundo, MAX_SEGUNDO));
  } else return null;
  const ajuste = Math.round(Number(o.ajusteMs ?? o.ajuste_ms));
  if (Number.isFinite(ajuste) && ajuste !== 0) out.ajusteMs = Math.max(-MAX_AJUSTE_MS, Math.min(MAX_AJUSTE_MS, ajuste));
  const v = Number(o.volumen);
  if (Number.isFinite(v) && v !== 0) out.volumen = Math.max(VOLUMEN_EFECTO.min, Math.min(VOLUMEN_EFECTO.max, Math.round(v * 2) / 2));
  const nota = texto(o.nota, 80);
  if (nota) out.nota = nota;
  return out;
}

/** La lista limpia (los que no valen se quitan; como mucho `MAX_COLOCADOS`). Pura. */
export const limpiarColocados = (lista) => (Array.isArray(lista) ? lista.map(limpiarColocado).filter(Boolean).slice(0, MAX_COLOCADOS) : []);

/** Las claves de la biblioteca que usa una lista (para «la usa un video»). Pura. */
export const archivosDeColocados = (lista) => [...new Set((lista ?? []).map((c) => c?.propio?.archivoId).filter(Boolean))];

/** Una palabra comparable: sin tildes, mayúsculas ni signos. Pura. */
export const palabraComparable = (p) => String(p ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * El INSTANTE (s del video) del ancla de un efecto colocado, con lo que es en palabras. → { t, que } o { error }. Pura.
 * `linea` es la de `lineaDeTiempo` (con las palabras de cada escena en segundos del video).
 */
export function instanteDe(c, guion, linea) {
  const escenas = guion?.escenas ?? [];
  const total = Number(linea?.total) || 0;
  if (c.palabra) {
    const buscada = palabraComparable(c.palabra);
    if (!buscada) return { error: `«${c.palabra}» no es una palabra.` };
    let k0 = 0;
    let k1 = escenas.length;
    if (c.escena) {
      k0 = escenas.findIndex((e) => e.id === c.escena);
      if (k0 < 0) return { error: `No hay ninguna escena «${c.escena}».` };
      k1 = k0 + 1;
    }
    let vez = 0;
    for (let k = k0; k < k1; k++) {
      for (const p of linea?.escenas?.[k]?.palabras ?? []) {
        if (palabraComparable(p.texto) !== buscada) continue;
        vez++;
        if (vez === (c.n ?? 1)) return { t: r3(p.desde), que: `cuando se dice «${p.texto}» (escena ${escenas[k].id})` };
      }
    }
    return { error: vez ? `«${c.palabra}» se dice ${vez} ${vez === 1 ? "vez" : "veces"}${c.escena ? ` en la escena ${c.escena}` : ""}, no ${c.n}.` : `Nadie dice «${c.palabra}»${c.escena ? ` en la escena ${c.escena}` : " en el video"}.` };
  }
  if (c.escena) {
    const k = escenas.findIndex((e) => e.id === c.escena);
    const esc = linea?.escenas?.[k];
    if (k < 0 || !esc) return { error: `No hay ninguna escena «${c.escena}».` };
    if (c.capa) {
      const capa = (escenas[k].capas ?? []).find((x) => x.id === c.capa);
      if (!capa) return { error: `La escena ${c.escena} no tiene ninguna capa «${c.capa}» (tiene: ${(escenas[k].capas ?? []).map((x) => x.id).join(", ") || "ninguna"}).` };
      const t = tiempoDeCapa(capa, esc);
      return c.sale ? { t: r3(t.hasta), que: `cuando se va la capa ${c.capa} (escena ${c.escena})` } : { t: r3(t.desde), que: `cuando entra la capa ${c.capa} (escena ${c.escena})` };
    }
    return c.sale ? { t: r3(esc.hasta), que: `cuando termina la escena ${c.escena}` } : { t: r3(esc.desde), que: `cuando entra la escena ${c.escena}` };
  }
  if (Number.isFinite(c.segundo)) {
    if (c.segundo > total) return { error: `El segundo ${c.segundo} pasa del final del video (${total.toFixed(1)} s).` };
    return { t: c.segundo, que: `en el segundo ${c.segundo}` };
  }
  return { error: "No dice cuándo suena." };
}

/** La clave con la que se buscan las muestras de un colocado: el id del catálogo, o «propio:<archivoId>». Pura. */
export const claveDeColocado = (c) => (c.propio ? `propio:${c.propio.archivoId}` : c.sonido);

/**
 * Los MOMENTOS de una lista: en qué segundo empieza a sonar cada efecto (su archivo) con las reglas de su papel.
 * `datosDe(c)` → { papel, pico (s), nombre } o null (no está en el catálogo): lo pone quien llama (el catálogo, o lo
 * medido en el Container para uno de la biblioteca).
 *
 * → { momentos: [{ i, clave, nombre, papel, en (s: donde empieza el archivo), golpe (s: donde cae lo que importa),
 *     evento (s: el ancla), que, db (sobre el de siempre bajo la voz), volumen, sobreFondo, bajaMusica }] en orden,
 *     sinSitio: [{ i, motivo }], movidos: [{ i, ms }] }. Pura.
 */
export function momentosColocados(colocados, guion, linea, datosDe) {
  const momentos = [];
  const sinSitio = [];
  const movidos = [];
  (colocados ?? []).forEach((c, i) => {
    const d = datosDe(c);
    if (!d) { sinSitio.push({ i, motivo: `«${c.sonido}» no está en el catálogo de efectos.` }); return; }
    const ancla = instanteDe(c, guion, linea);
    if (ancla.error) { sinSitio.push({ i, motivo: ancla.error }); return; }
    const papel = PAPELES[d.papel] ? d.papel : "propio";
    const regla = PAPELES[papel];
    const golpe = ancla.t + (regla.ajusteMs + (c.ajusteMs ?? 0)) / 1000;
    const pico = regla.alinear === "pico" ? Math.max(0, Number(d.pico) || 0) : 0;
    momentos.push({
      i, clave: claveDeColocado(c), nombre: d.nombre || c.propio?.nombre || c.sonido, papel,
      en: r3(Math.max(0, golpe - pico)), golpe: r3(golpe), evento: ancla.t, que: ancla.que,
      db: nivelDePapel(papel), volumen: c.volumen ?? 0, sobreFondo: regla.sobreFondo, bajaMusica: regla.bajaMusica,
    });
  });
  momentos.sort((a, b) => a.en - b.en || a.i - b.i);
  // Las rachas: dos del mismo papel más juntos que su separación se separan (el segundo, más tarde).
  const ultimo = {};
  for (const m of momentos) {
    const sep = PAPELES[m.papel].separacionMs / 1000;
    const antes = ultimo[m.papel];
    if (sep > 0 && antes !== undefined && m.en - antes < sep) {
      const nuevo = r3(antes + sep);
      movidos.push({ i: m.i, ms: Math.round((nuevo - m.en) * 1000) });
      m.golpe = r3(m.golpe + (nuevo - m.en));
      m.en = nuevo;
    }
    ultimo[m.papel] = m.en;
  }
  momentos.sort((a, b) => a.en - b.en || a.i - b.i);
  return { momentos, sinSitio, movidos };
}

/**
 * Los AUTOMÁTICOS como colocados, con VARIEDAD: cada transición (no un corte seco ni la primera escena) suena a la familia
 * de su tipo (`SONIDOS_DE_TRANSICION`), rotando la variante; un golpe o un glitch, en su destello (la mitad de la
 * transición, algo más fuerte). Y lo que entra en pantalla: el pop de cada sello o llamado, la firma del logo, cada ítem
 * de una lista cuando llega, el golpe de una cifra, el tecleo de una búsqueda, la campana de un comentario y el pop de un
 * icono (`SONIDOS_DE_CAPA`, también rotando). `propios` ({ transicion?, sello? }: un efecto de la biblioteca, { archivoId,
 * clave, nombre }) suena en vez de los del catálogo en las transiciones y en los sellos. Dos a menos de 0,15 s se quedan
 * en uno. Pura.
 */
export function colocadosAutomaticos(guion, linea, propios = {}) {
  const turnos = {};
  const siguiente = (sitio, lista) => turnoDe(lista, (turnos[sitio] = (turnos[sitio] ?? -1) + 1));
  const lista = [];
  const de = (sitio, t, ancla, lista_ = SONIDOS_DE_CAPA[sitio]) => {
    const vol = VOLUMEN_DE_CAPA[sitio];
    lista.push({ t, secundario: SECUNDARIOS.has(sitio), c: { sonido: siguiente(sitio, lista_), ...ancla, ...(vol ? { volumen: vol } : {}) } });
  };
  (guion?.escenas ?? []).forEach((e, k) => {
    const esc = linea?.escenas?.[k];
    if (!esc) return;
    const tipo = e.transicion?.tipo;
    const mitad = Math.min(MAX_AJUSTE_MS, Math.round(((Number(e.transicion?.dur) || 0) / 2) * 1000));
    if (k > 0 && TRANSICIONES_DE_IMPACTO.includes(tipo)) {
      const destello = r3(esc.desde + mitad / 1000);
      lista.push({ t: destello, c: { sonido: siguiente(`transicion:${tipo}`, SONIDOS_DE_TRANSICION[tipo]), escena: e.id, ...(mitad ? { ajusteMs: mitad } : {}), volumen: REALCE_IMPACTO } });
      if (tipo === "golpe") {
        // La SUBIDA que termina justo en el destello y el GRAVE que queda debajo: un golpe de cine, no un clic.
        lista.push({ t: destello - 0.01, c: { sonido: siguiente("subida", CAPAS_DEL_GOLPE.subida), segundo: destello } });
        lista.push({ t: destello + 0.01, c: { sonido: siguiente("caida", CAPAS_DEL_GOLPE.caida), segundo: destello, volumen: VOLUMEN_DE_CAPA.caida } });
      }
    } else if (k > 0 && tipo && tipo !== "corte") {
      // Cada tipo rota SUS variantes (la primera de cada uno es la más suya: una persiana suena a paño, no a obturador).
      const c = propios?.transicion?.archivoId ? { propio: propios.transicion } : { sonido: siguiente(`transicion:${tipo}`, SONIDOS_DE_TRANSICION[tipo] ?? [EFECTO_AUTOMATICO.transicion]) };
      const ajuste = SE_MUEVEN.has(tipo) && mitad ? mitad : 0;
      lista.push({ t: r3(esc.desde + ajuste / 1000), c: { ...c, escena: e.id, ...(ajuste ? { ajusteMs: ajuste } : {}) } });
    }
    for (const c of e.capas ?? []) {
      const t = tiempoDeCapa(c, esc).desde;
      const ancla = { escena: e.id, capa: c.id };
      const antesDelFin = (x) => x < esc.hasta;
      if (c.tipo === "sello" || c.tipo === "llamado") {
        lista.push({ t, c: propios?.sello?.archivoId ? { propio: propios.sello, ...ancla } : { sonido: siguiente("sello", SONIDOS_DE_CAPA.sello), ...ancla } });
      } else if (["logo", "cifra", "comentario", "icono"].includes(c.tipo)) de(c.tipo, t, ancla);
      else if (c.tipo === "busqueda") {
        de("busqueda", t, ancla);
        // Los resultados llegan cuando acaba de escribir, uno cada 0,35 s (lo mismo que dibuja el motor); el último, el
        // de la marca, con su campanita.
        const largo = String(c.texto ?? "").length;
        const escrito = largo / Math.max(16, largo / 1.2) + 0.3;
        const n = Math.min(4, (c.resultados ?? []).length);
        for (let i = 0; i < n; i++) {
          const ti = r3(t + escrito + i * 0.35);
          if (antesDelFin(ti)) de(i === n - 1 ? "despues" : "resultado", ti, { segundo: ti });
        }
      } else if (c.tipo === "antes_despues") {
        const ti = r3(t + 0.5);
        if (antesDelFin(ti)) de("despues", ti, { segundo: ti });
      } else if (c.tipo === "texto" && c.resalte === "marcador") {
        const ti = r3(t + MARCADOR_TRAS);
        if (antesDelFin(ti)) de("marcador", ti, { segundo: ti });
      } else if (c.tipo === "lista") {
        // Cada ítem cuando llega (el primero, con la capa; los demás, cada `cada` segundos), anclado a su segundo; el
        // último de una lista NUMERADA (unos pasos) suena a confirmación.
        const cada = Number(c.cada) > 0 ? Number(c.cada) : CADA_ITEM;
        const items = (c.items ?? []).slice(0, 6);
        items.forEach((_, i) => {
          const ti = r3(t + i * cada);
          if (!antesDelFin(ti)) return;
          const ultimo = c.numerada && items.length > 1 && i === items.length - 1;
          de(ultimo ? "final" : "item", ti, i === 0 ? ancla : { segundo: ti });
        });
      }
    }
  });
  lista.sort((a, b) => a.t - b.t);
  // Dos a menos de 0,15 s se quedan en uno, salvo las capas de un golpe (suenan juntas a propósito).
  const juntos = new Set([...CAPAS_DEL_GOLPE.subida, ...CAPAS_DEL_GOLPE.caida]);
  const principales = lista.filter((x) => !x.secundario).map((x) => x.t);
  // «Dos a menos de 0,15 s» es dentro de la MISMA clase (dos transiciones, o dos cosas que entran): un whoosh y el pop
  // del sello que entra con él suenan los dos.
  const ultimo = { escena: -Infinity, capa: -Infinity };
  return lista.filter((x) => {
    if (juntos.has(x.c.sonido)) return true;
    if (x.secundario && principales.some((p) => p >= x.t - RESPIRO_SECUNDARIO.antes - 1e-6 && p <= x.t + RESPIRO_SECUNDARIO.despues + 1e-6)) return false;
    const clase = x.c.escena && !x.c.capa ? "escena" : "capa";
    if (x.t - ultimo[clase] < JUNTOS_AUTOMATICOS) return false;
    ultimo[clase] = x.t;
    return true;
  }).map((x) => x.c);
}

/**
 * Las BAJADAS de la música: antes de cada efecto cuyo papel la baja, `BAJADA_MUSICA.db` durante `antes` segundos hasta su
 * golpe (entra en `entra` s y vuelve en `vuelve` s con el golpe). → [{ desde, hasta, db }] en orden. Pura.
 */
export function bajadasDeMusica(momentos) {
  return (momentos ?? []).filter((m) => m.bajaMusica)
    .map((m) => ({ desde: r3(Math.max(0, m.golpe - BAJADA_MUSICA.antes)), hasta: r3(Math.max(0, m.golpe)), db: BAJADA_MUSICA.db }))
    .filter((b) => b.hasta > b.desde)
    .sort((a, b) => a.desde - b.desde);
}

/**
 * Los dB que baja la música en el instante `t` por las bajadas (0 fuera de ellas): entra en rampa, se sostiene hasta el
 * golpe y vuelve en rampa. Pura.
 */
export function bajadaEn(bajadas, t) {
  let peor = 0;
  for (const b of bajadas ?? []) {
    if (t < b.desde || t > b.hasta + BAJADA_MUSICA.vuelve) continue;
    let f;
    if (t <= b.hasta) f = Math.min(1, (t - b.desde) / BAJADA_MUSICA.entra);
    else f = Math.max(0, 1 - (t - b.hasta) / BAJADA_MUSICA.vuelve);
    peor = Math.max(peor, b.db * f);
  }
  return peor;
}

/** Una línea legible de un colocado (para Claude y la pantalla). Pura. */
export function textoDeColocado(c, nombre = null) {
  const que = c.palabra ? `al decir «${c.palabra}»${c.n > 1 ? ` (la vez ${c.n})` : ""}${c.escena ? ` en ${c.escena}` : ""}`
    : c.escena ? `${c.sale ? "al irse" : "al entrar"} ${c.capa ? `la capa ${c.capa} de ` : ""}la escena ${c.escena}`
      : `en el segundo ${c.segundo}`;
  const extra = [c.ajusteMs ? `${c.ajusteMs > 0 ? "+" : ""}${c.ajusteMs} ms` : "", c.volumen ? `${c.volumen > 0 ? "+" : ""}${c.volumen} dB` : ""].filter(Boolean).join(", ");
  return `${nombre ?? c.propio?.nombre ?? c.sonido} ${que}${extra ? ` (${extra})` : ""}`;
}
