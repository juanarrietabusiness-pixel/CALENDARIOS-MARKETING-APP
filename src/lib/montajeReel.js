// ============================================================
// «Montarlo aquí»: de los clips del reel (o de su video) a un VIDEO ANIMADO terminado (puro; también el Worker)
//
// Lo que hacía CapCut, dentro de la aplicación. El reel por planos deja un clip LIMPIO por plano (sin texto, sin voz ni
// música: los modelos de video escriben mal y deforman el logo) o UN video con todo. El montaje los vuelve un proyecto
// de video animado (videos_proyectos, formato de escenas v1) con una escena por plano:
//
//   · el clip A SANGRE (capa `video`, encuadre «completo», con un velo para leer el texto);
//   · lo que se DICE en ese plano (la locución repartida por planos, o lo que el guion dice de cada uno): la voz la pone
//     ElevenLabs con la voz de la marca y el tiempo de cada palabra, y los subtítulos salen solos;
//   · el GANCHO escrito en el primero, el texto de cada plano si lo trae, y en el último el LOGO y el LLAMADO;
//   · la música del guion (su estilo, para generarla con Suno, o la escogida en «Sonido»).
//
// EL TEXTO LO ESCRIBE EL CÓDIGO, no el modelo de video: sale sin faltas. Y luego, el render de siempre a mp4.
// ============================================================

import { palabrasDe, lineaDeTiempo, MAX_HABLA, MAX_PANTALLA, MAX_SEGUNDOS, MIN_SEGUNDOS } from "./videoEscenas.js";
import { tramo, esTomaFija } from "./reel.js";

/** Lo más que dice un llamado (la capa `llamado` admite 30). */
export const MAX_LLAMADO = 30;
/** El llamado si el guion no trae uno. */
export const LLAMADO_POR_DEFECTO = "Escríbenos hoy";
/** Lo que se oye un clip con sonido debajo de la voz (la música o el ambiente que hizo el modelo). */
export const VOLUMEN_CLIP_CON_VOZ = 0.35;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** Recorta por palabras (sin partir una a la mitad) y sin dejar un signo colgando. */
function cortarPalabras(t, n) {
  const s = corto(t, 10_000);
  if (s.length <= n) return s;
  const r = s.slice(0, n + 1);
  const i = r.lastIndexOf(" ");
  return (i > n * 0.5 ? r.slice(0, i) : s.slice(0, n)).replace(/[\s,;:·—–-]+$/, "");
}

/**
 * La locución entera repartida entre los planos, en proporción a lo que dura cada uno y cortando, si se puede, en un
 * signo (punto, coma…) a dos palabras o menos del punto exacto. → un texto por plano (puede quedar vacío). Pura.
 */
export function repartirLocucion(locucion = "", planos = []) {
  const n = planos.length;
  if (!n) return [];
  const palabras = String(locucion ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!palabras.length) return planos.map(() => "");
  const total = Number(planos.at(-1)?.hasta) || n;
  const cortes = [0];
  for (let k = 0; k < n - 1; k++) {
    const hasta = Number(planos[k]?.hasta) || ((k + 1) * total) / n;
    let b = Math.round((palabras.length * hasta) / total);
    // Mejor donde termina una frase o una coma, si está cerca.
    let mejor = null;
    for (let d = 0; d <= 2 && mejor === null; d++) {
      for (const j of [b - d, b + d]) {
        if (j > cortes.at(-1) && j < palabras.length && /[.,;:!?…]$/.test(palabras[j - 1])) { mejor = j; break; }
      }
    }
    b = Math.max(cortes.at(-1), Math.min(palabras.length, mejor ?? b));
    cortes.push(b);
  }
  cortes.push(palabras.length);
  return planos.map((_, k) => palabras.slice(cortes[k], cortes[k + 1]).join(" "));
}

/** Lo que dice cada plano: lo que el guion trae por plano (`dice`) o, si no, la locución repartida. Pura. */
export function hablaDePlanos(reel = {}) {
  const planos = reel.planos ?? [];
  const propios = planos.map((p) => corto(p?.dice, MAX_HABLA));
  if (propios.some(Boolean)) return propios;
  return repartirLocucion(reel.locucion, planos).map((t) => cortarPalabras(t, MAX_HABLA));
}

/** El gancho escrito de los primeros segundos: el del guion, o el texto del primer plano, o el principio de la voz. Pura. */
export function ganchoDe(reel = {}) {
  const propio = corto(reel.gancho, 200) || corto(reel.planos?.[0]?.pantalla, 200);
  if (propio) return cortarPalabras(propio, 60);
  const primera = String(reel.locucion ?? "").split(/(?<=[.!?¿¡])\s+/)[0] ?? "";
  const palabras = primera.split(/\s+/).filter(Boolean);
  return palabras.length >= 2 ? cortarPalabras(palabras.slice(0, 7).join(" "), 60).replace(/[.,;:]+$/, "") : "";
}

/** El llamado a la acción del cierre (≤ 30). Pura. */
export const llamadoDe = (reel = {}) => cortarPalabras(reel.llamado, MAX_LLAMADO) || corto(reel.planos?.at(-1)?.pantalla, MAX_LLAMADO) || LLAMADO_POR_DEFECTO;

const TIPOS_MEDIO = ["producto", "beneficio", "solucion", "explicacion", "prueba"];
const tipoDeEscena = (i, n) => (i === 0 ? "gancho" : i === n - 1 && n > 1 ? "cierre" : TIPOS_MEDIO[(i - 1) % TIPOS_MEDIO.length]);

/** Un clip se ve como mucho hasta este margen antes de su final: si la frase dura más, se quedaría quieto en su último cuadro. */
export const MARGEN_CLIP = 0.5;
/** Cómo se mueven los fotogramas fijos, por turnos (un movimiento de cámara suave). */
const MOVIMIENTOS_FOTO = ["acercar", "paneo", "alejar"];
/** El id de la escena de un plano. */
const idDeEscena = (p, i) => `p${p?.n ?? i + 1}`;

/**
 * El FOTOGRAMA (ya revisado) de cada escena del montaje, por su id: `fuente.fotogramas` trae el id de la galería del
 * fotograma de cada plano, en el orden de los planos. Lo usan los planos sin clip y la segunda mitad de una frase larga. Pura.
 */
export function fotosDeEscenas(reel = {}, fuente = {}) {
  const planos = (reel.planos ?? []).filter((p) => p && corto(p.escena, 10));
  const fotos = {};
  planos.forEach((p, i) => { const f = fuente.fotogramas?.[i]; if (f) fotos[idDeEscena(p, i)] = f; });
  return fotos;
}

/** La capa del fotograma a sangre, con un movimiento de cámara suave (y lo que dura en un montaje sin voz). */
const capaDeFoto = (archivo, k, oscurecer, dura = 0) => ({
  tipo: "imagen", id: "foto", archivo, rol: "foto", encuadre: "completo", recorte: "cubrir",
  movimiento: MOVIMIENTOS_FOTO[k % MOVIMIENTOS_FOTO.length], oscurecer,
  ...(dura > 0 ? { dura: Math.round(dura * 100) / 100 } : {}),
});

/**
 * El guion del montaje (formato de escenas v1). `fuente`:
 *   { tipo: "clips", clips: [{ archivoId, duracion } | null], fotogramas: [archivoId | null] }  un clip por plano;
 *   { tipo: "uno", archivoId, duracion }                                                       el mismo video, seguido.
 * Reglas del método de agencia (ninguna toca cómo se ve un montaje que ya salía bien):
 *   · NINGÚN PLANO PIERDE SU FRASE: el que no tiene clip (no salió, o su toma es «fija»: el producto, un beneficio, el
 *     cierre) va con su FOTOGRAMA a sangre y un movimiento suave; sin fotograma, con su texto sobre el fondo.
 *   · La VOZ manda en lo que dura cada escena (los clips no la alargan con silencios: `lineaDeTiempo`), y una frase que
 *     dura más que su clip se PARTE por palabras: la segunda parte va con el fotograma (`partirEscenasLargas`). Un clip
 *     nunca se queda quieto en su último cuadro.
 *   · Con un solo video, corre SEGUIDO bajo todas las escenas (cada una arranca donde va la voz): sin saltos ni repetidos.
 * `conLogo`: el kit tiene logo (va en el cierre). `sonidoClip`: el clip trae música o ambiente que vale oír (con voz,
 * bajito). `voz`: false para un montaje SIN locución (sólo los clips y la música). Pura.
 */
export function guionDeMontaje({ reel = {}, fuente = {}, titulo = "", conLogo = true, sonidoClip = false, voz = true, formato = "9:16" } = {}) {
  const planos = (reel.planos ?? []).filter((p) => p && corto(p.escena, 10));
  const habla = voz ? hablaDePlanos({ ...reel, planos }) : planos.map(() => "");
  const uno = fuente.tipo === "uno";
  const fotos = fotosDeEscenas(reel, fuente);
  const filas = planos.map((p, i) => {
    const foto = fotos[idDeEscena(p, i)] ?? null;
    const bruto = uno ? (fuente.archivoId ? { archivoId: fuente.archivoId, duracion: Number(fuente.duracion) || 0 } : null) : fuente.clips?.[i] ?? null;
    // Una toma fija se monta con su fotograma (aunque tenga clip): el modelo de video transforma el empaque al avanzar.
    const clip = bruto?.archivoId && !(!uno && esTomaFija(p) && foto) ? bruto : null;
    return { p, i, clip, foto };
  }).filter((f) => f.clip || f.foto || palabrasDe(habla[f.i]).length);
  const n = filas.length;
  const gancho = ganchoDe(reel);
  const llamado = llamadoDe(reel);
  const conHabla = habla.some((h) => palabrasDe(h).length);
  const escenas = filas.map(({ p, i, clip, foto }, k) => {
    const dura = Math.max(1, (Number(p.hasta) || 0) - (Number(p.desde) || 0));
    const dice = habla[i] ?? "";
    const cierre = k === n - 1 && n > 1;
    const primera = k === 0;
    const texto = primera ? gancho : cierre ? "" : corto(p.pantalla, MAX_PANTALLA);
    const oscurecer = cierre ? 0.5 : primera ? 0.3 : texto ? 0.25 : 0.12;
    const capas = [];
    if (clip) {
      // Si la escena habla, el clip ENTERO (la voz decide cuánto se ve); si no, lo que dura su plano (lo que dura la escena).
      const desde = uno ? Number(p.desde) || 0 : 0;
      const fin = uno ? (clip.duracion > 0 ? clip.duracion : Number(p.hasta) || desde + dura)
        : clip.duracion > 0 ? (palabrasDe(dice).length ? clip.duracion : Math.min(clip.duracion, dura)) : dura;
      capas.push({
        tipo: "video", id: "clip", archivo: clip.archivoId, encuadre: "completo", recorte: "cubrir",
        desde: Math.round(desde * 100) / 100, hasta: Math.round(Math.max(desde + 0.5, fin) * 100) / 100,
        sonido: Boolean(sonidoClip), volumen: conHabla ? VOLUMEN_CLIP_CON_VOZ : 1, oscurecer,
      });
    } else if (foto) {
      capas.push(capaDeFoto(foto, k, oscurecer, dura));
    }
    if (texto) {
      capas.push({
        tipo: "texto", id: primera ? "gancho" : "texto", texto: cortarPalabras(texto, MAX_PANTALLA), rol: primera ? "titular" : "apoyo",
        pos: "arriba", tam: 0.86, color: "claro", placa: "oscuro", animacion: { entrada: primera ? "escala" : "sube" },
      });
    }
    if (cierre) {
      if (conLogo) capas.push({ tipo: "logo", id: "logo", pos: "centro", tam: 0.5, animacion: { entrada: "escala" } });
      capas.push({ tipo: "llamado", id: "cta", texto: llamado, pos: "abajo", tam: 0.8, animacion: { entrada: "sube", bucle: "late" } });
    }
    return {
      id: idDeEscena(p, i), tipo: tipoDeEscena(k, n), habla: dice,
      pantalla: cortarPalabras(primera ? gancho : cierre ? llamado : texto, MAX_PANTALLA),
      // Un cierre con el logo se queda un poco después de la última palabra; una escena muda sin clip ni foto, lo de su plano.
      pausa: cierre ? 1 : !clip && !foto && !palabrasDe(dice).length ? dura : 0,
      fondo: { tipo: "plano", color: "oscuro" },
      transicion: { tipo: k === 0 ? "corte" : cierre ? "fundido" : "corte", dur: cierre ? 0.25 : 0 },
      capas,
    };
  });
  const guion = {
    version: 1,
    titulo: corto(titulo || reel.titulo || gancho || "Reel montado", 120),
    formatos: [formato],
    // Sobre un video de verdad el grano sobra: es para lo dibujado.
    estilo: { grano: 0, ritmo: "rapido", ilustracion: "plana" },
    subtitulos: { activo: conHabla, pos: "abajo" },
    musica: corto(reel.musica, 300) ? { estilo: corto(reel.musica, 300), instrumental: true } : null,
    escenas,
  };
  if (!conHabla) return guion;
  // Con los tiempos estimados de la voz (2,5 palabras por segundo); tras generarla, otra vez con los de verdad.
  return ajustarMontaje(guion, lineaDeTiempo(guion), { fotos, continuo: uno }).guion;
}

/**
 * El montaje AJUSTADO a la voz (`linea`: `lineaDeTiempo` con los tiempos estimados o los de la locución). Con un solo
 * video (`continuo`), cada escena arranca el video donde va la voz: corre seguido, sin saltos ni repetidos. Con clips,
 * `partirEscenasLargas`. Lo que se DICE no cambia nunca: la locución ya pagada sigue valiendo. → { guion, cambio, partidas }. Pura.
 */
export function ajustarMontaje(guion, linea, { fotos = {}, continuo = false } = {}) {
  if (!continuo) return partirEscenasLargas(guion, linea, fotos);
  let cambio = false;
  const escenas = (guion?.escenas ?? []).map((e, k) => {
    const l = linea?.escenas?.[k];
    if (!l) return e;
    const capas = (e.capas ?? []).map((c) => {
      if (c.tipo !== "video" || c.encuadre !== "completo") return c;
      const fin = Number(c.hasta) || 0;
      const desde = Math.round(Math.max(0, fin > 0 ? Math.min(l.desde, fin - 0.5) : l.desde) * 100) / 100;
      if (desde === c.desde) return c;
      cambio = true;
      return { ...c, desde };
    });
    return { ...e, capas };
  });
  return { guion: { ...guion, escenas }, cambio, partidas: 0 };
}

/**
 * Las escenas con CLIP cuya voz dura más que el clip (menos `MARGEN_CLIP`) se parten en dos por palabras, sin cambiar lo
 * que se dice: la primera con el clip (hasta donde llega) y la segunda con el FOTOGRAMA de ese plano y un movimiento
 * suave. Corta, si puede, en una coma o un punto a dos palabras o menos. El cierre se lleva el logo y el llamado a la
 * segunda parte. Sin fotograma, o con etiquetas de emoción en el habla, no se parte. → { guion, cambio, partidas }. Pura.
 */
export function partirEscenasLargas(guion, linea, fotos = {}) {
  const ids = new Set((guion?.escenas ?? []).map((e) => e.id));
  const escenas = [];
  let partidas = 0;
  (guion?.escenas ?? []).forEach((e, k) => {
    const l = linea?.escenas?.[k];
    const clip = (e.capas ?? []).find((c) => c.tipo === "video" && c.encuadre === "completo");
    const foto = fotos[e.id];
    const tramoClip = clip ? (Number(clip.hasta) || 0) - (Number(clip.desde) || 0) : 0;
    const tokens = String(e.habla ?? "").split(" ").filter(Boolean);
    const palabras = l?.palabras ?? [];
    if (!clip || !foto || !l || tramoClip <= 0 || /\[[^\]]*\]/.test(e.habla ?? "") || palabras.length < 2
      || l.hasta - l.desde <= tramoClip - MARGEN_CLIP) { escenas.push(e); return; }
    // La segunda parte dice al menos dos palabras: una sola palabra en su propia escena sería un destello.
    if (palabras.length < 3) { escenas.push(e); return; }
    const limite = l.desde + Math.max(0.2, tramoClip - MARGEN_CLIP);
    let j = Math.max(1, Math.min(palabras.length - 2, palabras.filter((w) => w.hasta <= limite).length));
    // Mejor donde termina una frase o una coma, si está cerca.
    const esPalabra = (t) => /[\p{L}\p{N}]/u.test(t);
    const fin = (w) => { let cuenta = 0; for (let t = 0; t < tokens.length; t++) { if (esPalabra(tokens[t])) cuenta++; if (cuenta === w) return t; } return tokens.length - 1; };
    for (let d = 0; d <= 2; d++) if (j - d >= 1 && /[.,;:!?…]$/.test(tokens[fin(j - d)])) { j -= d; break; }
    // (Partirla así no cambia lo que se dice: la locución sigue valiendo.)
    const corte = fin(j) + 1;
    const a = tokens.slice(0, corte).join(" ");
    const b = tokens.slice(corte).join(" ");
    if (!b || !palabrasDe(b).length) { escenas.push(e); return; }
    let id = `${e.id}b`;
    while (ids.has(id)) id += "b";
    ids.add(id);
    const cierre = (e.capas ?? []).filter((c) => c.tipo === "logo" || c.tipo === "llamado");
    const restoA = (e.capas ?? []).filter((c) => c.tipo !== "logo" && c.tipo !== "llamado");
    escenas.push({ ...e, habla: a, pausa: 0, capas: restoA });
    escenas.push({
      ...e, id, habla: b, pantalla: cierre.length ? e.pantalla : "",
      transicion: { tipo: "corte", dur: 0 },
      capas: [capaDeFoto(foto, k + 1, Number(clip.oscurecer) || 0.12), ...cierre],
    });
    partidas++;
  });
  return { guion: { ...guion, escenas }, cambio: partidas > 0, partidas };
}

/**
 * ¿El montaje dice TODO lo del reel? Lo que se dice tiene que ser, palabra por palabra, lo que el reel reparte entre
 * sus planos (el gancho, la marca, el producto: nada se salta), y el gancho tiene que estar escrito en la primera
 * escena. → [errores graves] (vacío si está bien). Pura.
 */
export function comprobarMontaje(reel = {}, guion = {}, { voz = true } = {}) {
  const errores = [];
  const planos = (reel.planos ?? []).filter((p) => p && corto(p.escena, 10));
  const norm = (t) => palabrasDe(t).map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
  if (voz) {
    const esperado = norm(hablaDePlanos({ ...reel, planos }).join(" "));
    const dicho = norm((guion.escenas ?? []).map((e) => e.habla ?? "").join(" "));
    const falta = esperado.filter((w, i) => dicho[i] !== w);
    if (esperado.join(" ") !== dicho.join(" ")) {
      errores.push(`Al montar se perdió parte de lo que se dice (${falta.length ? `«${esperado.slice(0, 12).join(" ")}…»` : "el orden cambió"}): el montaje tiene que decir todo lo del guion del reel.`);
    }
  }
  const gancho = ganchoDe(reel);
  const primera = guion.escenas?.[0];
  if (gancho && !(primera?.capas ?? []).some((c) => c.tipo === "texto" && c.texto)) errores.push("Al montar se perdió el gancho escrito de la primera escena.");
  return errores;
}

/** ¿Hay con qué montar? (al menos un clip o un fotograma, o el video). Pura. */
export const sePuedeMontar = (fuente = {}) => (fuente.tipo === "uno" ? Boolean(fuente.archivoId)
  : (fuente.clips ?? []).some((c) => c?.archivoId) || (fuente.fotogramas ?? []).some(Boolean));

/** Lo que dura el montaje a ojo (para decir el costo de la voz y no pasar de lo que admite el formato). Pura. */
export function segundosDeMontaje(guion) {
  // La misma cuenta que el render (la voz manda en las escenas que hablan), con los tiempos estimados.
  const s = (guion?.escenas ?? []).length ? lineaDeTiempo(guion).total : 0;
  return Math.max(MIN_SEGUNDOS, Math.min(MAX_SEGUNDOS, Math.round(s * 10) / 10));
}

/**
 * El guion del reel como texto para el campo «Guion» de la publicación: un tramo por plano con lo que se ve, lo que se
 * dice y lo que se lee (la forma que ya lee el panel en un UGC). Pura.
 */
export function textoDelGuionReel(reel = {}) {
  const habla = hablaDePlanos(reel);
  return (reel.planos ?? []).map((p, i) => [
    `${tramo(p)} SE VE: ${corto(p.escena, 300)}`,
    habla[i] ? `VOZ: «${habla[i]}»` : "",
    (i === 0 ? ganchoDe(reel) : corto(p.pantalla, 80)) ? `TEXTO: ${i === 0 ? ganchoDe(reel) : corto(p.pantalla, 80)}` : "",
  ].filter(Boolean).join(" | ")).join("\n");
}
