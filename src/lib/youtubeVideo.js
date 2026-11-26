// ============================================================
// Lo que un video animado lleva a YOUTUBE (puro: lo usa worker/lib/estudio/youtubeVideo.js y la herramienta
// `preparar_youtube`)
//
//   · CAPÍTULOS de sus tiempos (`capitulosDelVideo`): cada SECCIÓN (las escenas seguidas con el mismo fondo, como el
//     fondo continuo de motorVideo.js; sin fondos, cada escena) empieza un capítulo con su primera línea. YouTube sólo
//     los enseña si el primero va en 0:00, hay al menos 3 y cada uno dura 10 s o más: los cortos se juntan con el de
//     antes y, si no salen 3, no se ponen.
//   · Las CITAS bíblicas que el video enseña (las etiquetas con forma de cita: «Efesios 1:4»).
//   · La DESCRIPCIÓN: el título, los capítulos, la letra entera, las citas y las redes, en menos de 5.000 bytes (lo que
//     admite YouTube; se recorta la letra si hace falta).
// ============================================================

import { palabrasDe } from "./videoEscenas.js";
import { bytesDe } from "./publicacion.js";

/** Lo que pide YouTube para enseñar los capítulos. */
export const CAPITULOS = Object.freeze({ minimos: 3, segundosMinimos: 10, max: 40 });
/** La categoría «Música» de YouTube (la de siempre, «Gente y blogs», es la 22). */
export const CATEGORIA_MUSICA = "10";
export const CATEGORIA_PERSONAS = "22";
/** La portada de YouTube: 1280×720. */
export const PORTADA_YOUTUBE = Object.freeze({ ancho: 1280, alto: 720 });

/** «m:ss» (o «h:mm:ss» desde una hora), como los lee YouTube. Pura. */
export function marcaDeTiempo(segundos) {
  const s = Math.max(0, Math.floor(Number(segundos) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const fondoDe = (e) => (e?.capas ?? []).find((c) => c?.tipo === "imagen" && c.encuadre === "completo" && (c.archivo || c.pide)) ?? null;
const claveDeFondo = (e) => { const c = fondoDe(e); return c ? String(c.archivo || String(c.pide ?? "").trim().toLowerCase()) : ""; };

/** El nombre de un capítulo: su primera línea, sin el signo final, hasta 50 letras. */
function nombreDe(escenas, i, total) {
  const habla = escenas.map((e) => String(e.habla ?? "").trim()).find(Boolean) ?? "";
  if (!habla) return i === 0 ? "Intro" : i === total - 1 ? "Final" : "Instrumental";
  const palabras = palabrasDe(habla);
  let t = "";
  for (const w of palabras) {
    if (`${t} ${w}`.trim().length > 50) break;
    t = `${t} ${w}`.trim();
  }
  return (t || habla.slice(0, 50)).replace(/[,.;:¡!¿?]+$/, "");
}

/**
 * Los capítulos del video: [{ desde (s), titulo }]. `linea`: la de `lineaDeTiempo` con sus palabras. Vacío si no salen
 * los que pide YouTube. Pura.
 */
export function capitulosDelVideo(guion, linea) {
  const escenas = guion?.escenas ?? [];
  if (!escenas.length || !linea?.escenas?.length) return [];
  // 1. Secciones: las escenas seguidas con el mismo fondo; sin fondos, cada escena. El cierre va con la anterior.
  const grupos = [];
  escenas.forEach((e, i) => {
    const t = linea.escenas[i];
    if (!t) return;
    const ultimo = grupos.at(-1);
    const misma = ultimo && (e.tipo === "cierre" || (claveDeFondo(e) && claveDeFondo(e) === ultimo.clave));
    if (misma) { ultimo.escenas.push(e); ultimo.hasta = t.hasta; return; }
    grupos.push({ clave: claveDeFondo(e), escenas: [e], desde: t.desde, hasta: t.hasta });
  });
  // 2. Los de menos de 10 s se juntan con el anterior (el primero, con el siguiente).
  const juntos = [];
  for (const g of grupos) {
    const ultimo = juntos.at(-1);
    if (ultimo && ultimo.hasta - ultimo.desde < CAPITULOS.segundosMinimos) { ultimo.escenas.push(...g.escenas); ultimo.hasta = g.hasta; continue; }
    juntos.push({ ...g, escenas: [...g.escenas] });
  }
  const ultimo = juntos.at(-1);
  if (juntos.length > 1 && ultimo.hasta - ultimo.desde < CAPITULOS.segundosMinimos) {
    const previo = juntos.at(-2);
    previo.escenas.push(...ultimo.escenas);
    previo.hasta = ultimo.hasta;
    juntos.pop();
  }
  if (juntos.length < CAPITULOS.minimos) return [];
  // 3. Nombres; el primero en 0:00; dos seguidos con el mismo nombre (el coro que vuelve) llevan su número.
  const salida = juntos.slice(0, CAPITULOS.max).map((g, i) => ({ desde: i === 0 ? 0 : g.desde, titulo: nombreDe(g.escenas, i, juntos.length) }));
  const vistos = new Map();
  for (const c of salida) {
    const n = (vistos.get(c.titulo) ?? 0) + 1;
    vistos.set(c.titulo, n);
    if (n > 1) c.titulo = `${c.titulo} (${n})`;
  }
  return salida;
}

/** ¿Tiene forma de cita bíblica? («Efesios 1:4», «1 Juan 4:8», «Salmo 23», «Juan 3:16-17»). */
const CITA = /^(?:[1-3]\s?)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s(?:de\s)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?\s\d{1,3}(?::\d{1,3}(?:[-–]\d{1,3})?)?$/;

/** Las citas bíblicas que el video ENSEÑA (sus textos con forma de cita), sin repetir y en orden. Pura. */
export function citasDelGuion(guion) {
  const salida = [];
  for (const e of guion?.escenas ?? []) {
    for (const c of e.capas ?? []) {
      if (c?.tipo !== "texto") continue;
      const t = String(c.texto ?? "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
      const bonita = t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s|\d)([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase()) : t;
      if (CITA.test(bonita) && !salida.includes(bonita)) salida.push(bonita);
    }
  }
  return salida;
}

/**
 * La DESCRIPCIÓN del video en YouTube: { titulo, intro?, capitulos, letra, citas, redes: { instagram, whatsapp, web } }
 * → el texto (≤ 5.000 bytes: si no cabe, se acorta la letra). Pura.
 */
export function descripcionYouTubeDelVideo({ titulo = "", intro = "", capitulos = [], letra = "", citas = [], redes = {}, hashtags = [] } = {}) {
  const sinAngulos = (t) => String(t ?? "").replace(/</g, "‹").replace(/>/g, "›");
  const red = [];
  const ig = String(redes.instagram ?? "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").replace(/\/$/, "").trim();
  if (ig) red.push(`Instagram: https://www.instagram.com/${ig}`);
  const wa = String(redes.whatsapp ?? "").replace(/[^\d]/g, "");
  if (wa) red.push(`WhatsApp: https://wa.me/${wa}`);
  if (redes.web) red.push(`Web: ${String(redes.web).trim()}`);
  const partes = (cuerpoLetra) => [
    titulo ? sinAngulos(titulo) : "",
    intro ? sinAngulos(intro) : "",
    capitulos.length ? ["Capítulos:", ...capitulos.map((c) => `${marcaDeTiempo(c.desde)} ${sinAngulos(c.titulo)}`)].join("\n") : "",
    cuerpoLetra ? `Letra:\n${sinAngulos(cuerpoLetra)}` : "",
    citas.length ? `Citas: ${citas.join(" · ")}` : "",
    red.length ? `Síguenos:\n${red.join("\n")}` : "",
    hashtags.length ? hashtags.map((h) => `#${String(h).replace(/^#/, "")}`).join(" ") : "",
  ].filter(Boolean).join("\n\n");
  // Si no cabe, la letra pierde renglones del final (con «…» al cortar) hasta que cabe.
  const renglones = String(letra ?? "").trim().split("\n");
  let n = renglones.length;
  let texto = partes(renglones.join("\n").trim());
  while (bytesDe(texto) > 5000 && n > 0) {
    n--;
    texto = partes(n ? `${renglones.slice(0, n).join("\n")}\n…` : "");
  }
  return texto.slice(0, 5000);
}

/**
 * Las líneas del título en la PORTADA (como mucho 2, de hasta ~18 letras cada una para que se lea en un teléfono):
 * corta por palabras. Pura.
 */
export function lineasDePortada(titulo, max = 18) {
  const ws = String(titulo ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const w of ws) {
    if (actual && `${actual} ${w}`.length > max && lineas.length < 1) { lineas.push(actual); actual = w; } else actual = actual ? `${actual} ${w}` : w;
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, 2);
}

/** «AAAA-MM-DDTHH:mm» en hora de Panamá (UTC−5, sin horario de verano) → ISO en UTC, o null si no vale. Pura. */
export function publicarElDesdePanama(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(local ?? "").trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) + 5, Number(m[5]));
  if (!Number.isFinite(ms)) return null;
  // Un INSTANTE para la API (no un día del calendario): compuesto a mano en UTC.
  const d = new Date(ms);
  const p = (n, k = 2) => String(n).padStart(k, "0");
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00.000Z`;
}
