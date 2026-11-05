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

import { palabrasDe, MAX_HABLA, MAX_PANTALLA, MAX_SEGUNDOS, MIN_SEGUNDOS } from "./videoEscenas.js";
import { PALABRAS_POR_SEGUNDO, tramo } from "./reel.js";

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

/**
 * El guion del montaje (formato de escenas v1). `fuente`:
 *   { tipo: "clips", clips: [{ archivoId, duracion } | null] }  un clip por plano (el que no salió se salta);
 *   { tipo: "uno", archivoId, duracion }                        el mismo video, cada escena con su tramo.
 * `conLogo`: el kit tiene logo (va en el cierre). `sonidoClip`: el clip trae música o ambiente que vale oír (con voz,
 * bajito). `voz`: false para un montaje SIN locución (sólo los clips y la música). Pura.
 */
export function guionDeMontaje({ reel = {}, fuente = {}, titulo = "", conLogo = true, sonidoClip = false, voz = true, formato = "9:16" } = {}) {
  const planos = (reel.planos ?? []).filter((p) => p && corto(p.escena, 10));
  const habla = voz ? hablaDePlanos({ ...reel, planos }) : planos.map(() => "");
  const uno = fuente.tipo === "uno";
  // Los planos que tienen su video (en «uno», todos: el mismo archivo con su tramo).
  const filas = planos.map((p, i) => ({ p, i, clip: uno ? (fuente.archivoId ? { archivoId: fuente.archivoId, duracion: Number(fuente.duracion) || 0 } : null) : fuente.clips?.[i] ?? null }))
    .filter((f) => f.clip?.archivoId);
  const n = filas.length;
  const gancho = ganchoDe(reel);
  const llamado = llamadoDe(reel);
  const conHabla = habla.some((h) => palabrasDe(h).length);
  const escenas = filas.map(({ p, i, clip }, k) => {
    const dura = Math.max(1, (Number(p.hasta) || 0) - (Number(p.desde) || 0));
    const dice = habla[i] ?? "";
    // Lo que dura la escena: lo del plano o lo que tarda en decirse (a 2,5 palabras por segundo), sin pasar del clip.
    const deseado = Math.max(dura, palabrasDe(dice).length / PALABRAS_POR_SEGUNDO + 0.3);
    let desde = 0;
    let hasta;
    if (uno) {
      desde = Number(p.desde) || 0;
      const fin = clip.duracion > 0 ? Math.min(clip.duracion, Number(p.hasta) || desde + dura) : Number(p.hasta) || desde + dura;
      hasta = Math.max(desde + 0.5, fin);
    } else {
      hasta = clip.duracion > 0 ? Math.min(clip.duracion, deseado) : deseado;
    }
    const cierre = k === n - 1 && n > 1;
    const primera = k === 0;
    const texto = primera ? gancho : cierre ? "" : corto(p.pantalla, MAX_PANTALLA);
    const capas = [
      {
        tipo: "video", id: "clip", archivo: clip.archivoId, encuadre: "completo", recorte: "cubrir",
        desde: Math.round(desde * 100) / 100, hasta: Math.round(hasta * 100) / 100,
        sonido: Boolean(sonidoClip), volumen: conHabla ? VOLUMEN_CLIP_CON_VOZ : 1,
        oscurecer: cierre ? 0.5 : primera ? 0.3 : texto ? 0.25 : 0.12,
      },
    ];
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
      id: `p${p.n ?? i + 1}`, tipo: tipoDeEscena(k, n), habla: dice,
      pantalla: cortarPalabras(primera ? gancho : cierre ? llamado : texto, MAX_PANTALLA),
      // Un cierre con el logo se queda un poco después de la última palabra.
      pausa: cierre ? 1 : 0,
      fondo: { tipo: "plano", color: "oscuro" },
      transicion: { tipo: k === 0 ? "corte" : cierre ? "fundido" : "corte", dur: cierre ? 0.25 : 0 },
      capas,
    };
  });
  return {
    version: 1,
    titulo: corto(titulo || reel.titulo || gancho || "Reel montado", 120),
    formatos: [formato],
    // Sobre un video de verdad el grano sobra: es para lo dibujado.
    estilo: { grano: 0, ritmo: "rapido", ilustracion: "plana" },
    subtitulos: { activo: conHabla, pos: "abajo" },
    musica: corto(reel.musica, 300) ? { estilo: corto(reel.musica, 300), instrumental: true } : null,
    escenas,
  };
}

/** ¿Hay con qué montar? (al menos un clip, o el video). Pura. */
export const sePuedeMontar = (fuente = {}) => (fuente.tipo === "uno" ? Boolean(fuente.archivoId) : (fuente.clips ?? []).some((c) => c?.archivoId));

/** Lo que dura el montaje a ojo (para decir el costo de la voz y no pasar de lo que admite el formato). Pura. */
export function segundosDeMontaje(guion) {
  const s = (guion?.escenas ?? []).reduce((t, e) => {
    const v = (e.capas ?? []).find((c) => c.tipo === "video");
    const clip = v ? Math.max(0, (Number(v.hasta) || 0) - (Number(v.desde) || 0)) : 0;
    return t + Math.max(clip, palabrasDe(e.habla).length / PALABRAS_POR_SEGUNDO) + (Number(e.pausa) || 0);
  }, 0);
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
