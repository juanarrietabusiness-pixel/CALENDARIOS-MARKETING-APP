// ============================================================
// DERIVAR un video de su MAESTRO (puro: lo usa worker/lib/estudio/cancion.js, `derivarVideo`; la herramienta,
// `derivar_video`)
//
// El maestro de una canción es el video LARGO (16:9 para YouTube, la canción entera); de él salen sus reels sin rehacer
// el diseño: las MISMAS escenas, el mismo estilo y los mismos fondos, en otro formato y, si se pide, sólo un tramo
// (`desde`/`hasta`, segundos del maestro). Los tiempos no se recalculan a mano: salen de la sincronía de la canción
// entera (el servidor la recorta: `recorteDeSincronia`), así que no se paga nada.
//
//   · Las escenas con letra se quedan con las palabras que EMPIEZAN dentro del tramo (las de fuera se quitan del «habla»
//     y sus capas ancladas a una palabra se mueven a la que queda); las que se quedan sin ninguna, fuera. Las escenas sin
//     letra (intro, puente) se quedan si medio segundo de ellas cae dentro.
//   · El CIERRE del maestro se cambia por el del formato: en 16:9 (YouTube), el logo y «Suscríbete»; en vertical (reel),
//     sólo el logo pequeño sobre negro (decisión de la agencia, 26-nov-2026).
//   · `gancho`: la primera escena con más fuerza (se acerca y su texto entra de golpe) y UN efecto, al empezar. En una
//     canción no van efectos en las transiciones (Juan): con gancho, ése es el único.
// ============================================================

import { palabrasDe, FORMATOS_VIDEO } from "./videoEscenas.js";
import { EFECTO_AUTOMATICO } from "./efectosColocados.js";

/** Lo que tiene que caer dentro del tramo de una escena sin letra para quedarse (s). */
export const SOLAPE_MINIMO = 0.5;
/** El cierre: lo que dura como poco tras la última palabra para que se vea (s); con menos se avisa. */
export const CIERRE_MINIMO = 1.5;
/** El id de la escena de cierre que pone la derivación. */
export const ID_CIERRE = "cierre-derivado";

const r3 = (n) => Math.round(n * 1000) / 1000;

/** El cierre de un formato: en 16:9, el logo y «Suscríbete»; si no, el logo pequeño sobre el color oscuro. Pura. */
export function cierreDelFormato(formato) {
  const youtube = formato === "16:9";
  return {
    id: ID_CIERRE, tipo: "cierre", habla: "", pantalla: "", pausa: 0,
    fondo: { tipo: "plano", color: "oscuro" }, transicion: { tipo: "fundido", dur: 0.4 },
    capas: youtube
      ? [
        { tipo: "logo", id: "logo", pos: "centro", tam: 0.32, entra: { s: 0 }, animacion: { entrada: "escala" } },
        { tipo: "llamado", id: "suscribete", texto: "Suscríbete", pos: "abajo", tam: 0.42, entra: { s: 0.4 }, animacion: { entrada: "sube" } },
      ]
      // Con posición fija el logo mide su «tam» (repartido por zonas, el del cierre va al menos a la mitad).
      : [{ tipo: "logo", id: "logo", pos: { x: 0.5, y: 0.47 }, tam: 0.28, entra: { s: 0 }, animacion: { entrada: "aparece" } }],
  };
}

/** Un momento { palabra: n } movido a las palabras que quedan (`primera`: la que era la 0; `n`: cuántas quedan). */
function momentoMovido(m, primera, n) {
  if (!m || typeof m !== "object" || !("palabra" in m)) return m;
  return { palabra: Math.max(0, Math.min(n - 1, m.palabra - primera)) };
}

/**
 * El guion DERIVADO (sin `cancion`: la pone el servidor con la del tramo). `palabras`: las del maestro, una por palabra
 * de su habla y en el tiempo del maestro (sin el ajuste fino); `linea`: su línea de tiempo con esas palabras; `desde`,
 * `hasta`: el tramo en segundos del maestro. → { guion, escenas, dentro (palabras), primera (el id de su primera
 * escena), avisos } o { error }. Pura.
 */
export function derivarGuion(maestro, { palabras = [], linea, desde = 0, hasta = Infinity, formato = "9:16", gancho = false } = {}) {
  if (!FORMATOS_VIDEO[formato]) return { error: `«${formato}» no es un formato: ${Object.keys(FORMATOS_VIDEO).join(", ")}.` };
  if (!(hasta > desde)) return { error: "«hasta» va después de «desde»." };
  const escenas = [];
  const avisos = [];
  let k = 0;
  let dentro = 0;
  let ultimaPalabra = desde;
  (maestro?.escenas ?? []).forEach((e, i) => {
    const tokens = palabrasDe(e.habla ?? "");
    const desdeK = k;
    k += tokens.length;
    if (e.tipo === "cierre") return; // el cierre lo pone el formato
    if (!tokens.length) {
      const t = linea?.escenas?.[i];
      const solape = t ? Math.min(hasta, t.hasta) - Math.max(desde, t.desde) : 0;
      if (solape >= SOLAPE_MINIMO) escenas.push(e);
      return;
    }
    const quedan = tokens.map((w, j) => ({ w, j, p: palabras[desdeK + j] }))
      .filter((x) => Number.isFinite(x.p?.desde) && x.p.desde >= desde - 0.05 && x.p.desde < hasta - 0.1);
    if (!quedan.length) return;
    dentro += quedan.length;
    ultimaPalabra = Math.max(ultimaPalabra, quedan.at(-1).p.hasta ?? quedan.at(-1).p.desde);
    const primera = quedan[0].j;
    const n = quedan.length;
    const partida = n < tokens.length;
    escenas.push({
      ...e,
      habla: quedan.map((x) => x.w).join(" "),
      ...(partida && e.pantalla === e.habla ? { pantalla: quedan.map((x) => x.w).join(" ") } : {}),
      capas: (e.capas ?? []).map((c) => ({
        ...c,
        ...(c.entra ? { entra: momentoMovido(c.entra, primera, n) } : {}),
        ...(c.sale ? { sale: momentoMovido(c.sale, primera, n) } : {}),
      })),
    });
  });
  if (!dentro) return { error: `Entre el segundo ${r3(desde)} y el ${r3(hasta)} del video no se canta nada: escoge otro tramo.` };
  if (Number.isFinite(hasta) && hasta - ultimaPalabra < CIERRE_MINIMO) {
    avisos.push(`El cierre dura ${Math.max(0, r3(hasta - ultimaPalabra))} s (tras la última palabra): con menos de ${CIERRE_MINIMO} s casi no se ve. Alarga «hasta» si la canción sigue.`);
  }
  escenas.push(cierreDelFormato(formato));
  if (gancho && escenas.length) {
    const g = escenas[0];
    escenas[0] = {
      ...g, camara: g.camara && g.camara !== "ninguna" ? g.camara : "acercar",
      capas: (g.capas ?? []).map((c) => (c.tipo === "texto" ? { ...c, animacion: { ...(c.animacion ?? {}), entrada: "golpe" } } : c)),
    };
  }
  return {
    guion: { ...maestro, formatos: [formato], escenas },
    escenas: escenas.length, dentro, primera: escenas[0]?.id ?? null, avisos,
  };
}

/**
 * El sonido del derivado: el del maestro sin los efectos colocados que ya no tienen dónde sonar (anclados a una escena
 * que no está o a un segundo, que ya no es el mismo). Con `gancho`, UN efecto al entrar la primera escena y nada más
 * (en una canción no van efectos en las transiciones). Pura.
 */
export function sonidoDerivado(sonido = {}, { escenas = [], gancho = false, primera = null } = {}) {
  const ids = new Set(escenas.map((e) => e.id));
  if (gancho && primera) {
    return { ...sonido, efectos: true, colocados: [{ sonido: EFECTO_AUTOMATICO.impacto, escena: primera, nota: "El gancho: el único efecto." }] };
  }
  const colocados = (sonido.colocados ?? []).filter((c) => c?.escena && ids.has(c.escena));
  const { colocados: _c, ...resto } = sonido;
  return colocados.length ? { ...resto, colocados } : resto;
}
