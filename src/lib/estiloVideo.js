// ============================================================
// El KIT DE MARCA contado a la IA que escribe el guion de un VIDEO ANIMADO (puro)
//
// `bloqueDeMarca` (kitMarca.js) es para los motores de IMAGEN: una paleta en hex, el estilo de una foto, la luz. Al guion
// de un video animado no le sirve tal cual: el video se dibuja con CÓDIGO y sus colores son TOKENS del motor (fondo,
// texto, acento…), que salen del kit por el papel de cada color (`paletaDelKit` de motorVideo.js). Antes el guion sólo
// recibía el personaje y «los colores por sus tokens»: no sabía qué token era el dorado, ni el estilo de la marca, ni su
// letra, ni sus reglas, ni lo que la agencia aprendió. La agencia lo exigió: «el kit al 100 %».
//
// Aquí va TODO lo del kit que decide cómo se ve un video —la paleta traducida a tokens, el estilo, la tipografía (y si la
// letra es la del kit o la de la casa), lo que nunca debe salir, las reglas, lo aprendido, si hay logo, la música de la
// marca para el ánimo— y, por encima, el ESTILO DEL VIDEO que escribe la agencia (`kit.estiloVideo`), como OBLIGATORIO.
// Nada de lo interno del kit: ni claves del almacenamiento, ni modelos, ni presets de imagen.
// ============================================================

import { limpiarKit, lineaDeReglas, limpiarMusicaDeMarca } from "./kitMarca.js";
import { lineasAprendidas } from "./aprendizajeVisual.js";
import { paletaDelKit } from "./motorVideo.js";
import { FUENTE_CASA } from "./motorTexto.js";
import { TOKENS_COLOR } from "./videoEscenas.js";

/** Para qué usa el motor cada token (lo que la IA tiene que saber al escoger uno). */
export const PAPEL_DEL_TOKEN = Object.freeze({
  fondo: "el fondo de las escenas",
  superficie: "las placas, tarjetas y pantallas",
  texto: "el texto",
  acento: "lo que se destaca: el énfasis, el llamado, los sellos y la cifra",
  apoyo: "formas, adornos y el personaje",
  claro: "el más claro (texto sobre fondos oscuros)",
  oscuro: "el más oscuro (texto sobre fondos claros)",
});

const sinPunto = (t) => String(t ?? "").trim().replace(/[.\s]+$/, "");

/**
 * La paleta del kit en TOKENS: qué token es cada color (con su nombre y su papel en el kit) y los colores del kit que no
 * quedaron en ningún token (se pueden pedir por su #RRGGBB). → { lineas: [texto], sueltos: [texto] }. Pura.
 */
export function paletaEnTokens(kitPaleta = []) {
  const colores = (Array.isArray(kitPaleta) ? kitPaleta : []).filter((c) => /^#[0-9a-f]{6}$/i.test(String(c?.hex ?? "")));
  if (!colores.length) return { lineas: [], sueltos: [] };
  const tokens = paletaDelKit(colores);
  const delKit = (hex) => colores.find((c) => c.hex.toUpperCase() === String(hex).toUpperCase());
  const lineas = [];
  for (const t of TOKENS_COLOR) {
    const c = delKit(tokens[t]);
    if (!c) continue;
    const nombre = [c.nombre, c.rol].filter(Boolean).map(sinPunto).join(" — ");
    lineas.push(`«${t}» = ${tokens[t].toUpperCase()}${nombre ? ` (${nombre})` : ""}: ${PAPEL_DEL_TOKEN[t]}`);
  }
  const usados = new Set(TOKENS_COLOR.map((t) => String(tokens[t]).toUpperCase()));
  const sueltos = colores.filter((c) => !usados.has(c.hex.toUpperCase()))
    .map((c) => `${c.hex.toUpperCase()}${c.nombre || c.rol ? ` (${[c.nombre, c.rol].filter(Boolean).map(sinPunto).join(" — ")})` : ""}`);
  return { lineas, sueltos };
}

/**
 * Lo que la IA del guion tiene que saber del kit para que el video SEA de la marca: un bloque de texto, o "" si el kit no
 * dice nada. El `estiloVideo` de la agencia va al final y MANDA sobre los consejos generales. Pura.
 */
export function marcaParaElVideo(kitGuardado) {
  const kit = limpiarKit(kitGuardado);
  const { lineas, sueltos } = paletaEnTokens(kit.paleta);
  const musica = limpiarMusicaDeMarca(kit.musica);
  const partes = [
    lineas.length ? `Los colores son los del kit, por su TOKEN (no escribas «estilo.paleta» ni inventes colores):\n${lineas.map((l) => `· ${l}`).join("\n")}` : "",
    sueltos.length ? `Colores del kit sin token propio (se pueden pedir por su #RRGGBB en una forma, un fondo o un adorno): ${sueltos.join(", ")}.` : "",
    kit.estilo ? `Estilo de la marca: ${sinPunto(kit.estilo)}.` : "",
    kit.luz ? `Luz y textura: ${sinPunto(kit.luz)}.` : "",
    kit.tipografia || kit.fuente
      ? `Tipografía de la marca: ${sinPunto(kit.tipografia || kit.fuente?.nombre)}${kit.fuente ? " (el video la dibuja con su archivo, también el texto gigante y el énfasis)" : ` (sin archivo en el kit: el texto gigante y el énfasis salen con la letra de la casa, ${FUENTE_CASA}, sans muy gruesa)`}.`
      : `Sin tipografía en el kit: el texto gigante y el énfasis salen con la letra de la casa, ${FUENTE_CASA} (sans muy gruesa).`,
    kit.evitar ? `Nunca: ${sinPunto(kit.evitar)}.` : "",
    lineaDeReglas(kit.reglas),
    lineasAprendidas(kit.aprendido),
    kit.logo ? "Logo: el kit tiene logo (la capa «logo»; el cierre lo lleva)." : "Logo: el kit NO tiene logo; la capa «logo» saldría vacía: firma el cierre con el nombre de la marca en un texto.",
    musica.estilo || musica.evitar
      ? `La música de la marca (para el ánimo y el ritmo de las escenas): ${[musica.estilo && sinPunto(musica.estilo), musica.evitar && `nunca suena ${sinPunto(musica.evitar)}`].filter(Boolean).join("; ")}.`
      : "",
  ].filter(Boolean);
  const estilo = String(kit.estiloVideo ?? "").trim();
  if (!partes.length && !estilo) return "";
  return [
    "LA MARCA EN EL VIDEO (el kit de marca, al 100 %: manda sobre tu gusto)",
    ...partes,
    estilo ? `\nESTILO OBLIGATORIO DE LOS VIDEOS DE ESTA MARCA (cómo se ven y se mueven; manda sobre los consejos generales):\n${estilo}` : "",
  ].filter(Boolean).join("\n");
}

/** La línea que acompaña a las imágenes de referencia del estilo del video (van delante del pedido). Pura. */
export const lineaDeReferenciasVideo = (n) => (n > 0
  ? `${n === 1 ? "La imagen de arriba es una referencia" : `Las ${n} imágenes de arriba son referencias`} del ESTILO de los videos de esta marca —tipografía, composición, ritmo, tratamiento del fondo—; no se copian (ni su texto ni lo que enseñan): el video dice lo suyo con ese estilo.`
  : "");
