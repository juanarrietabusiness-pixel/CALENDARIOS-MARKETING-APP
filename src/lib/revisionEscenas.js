// ============================================================
// La REVISIÓN de un guion de video animado antes de renderizar (pura: sólo mide con el lienzo que le dan)
//
// Lo que no se ve leyendo el JSON y sí se ve en el video: un subtítulo encima de un titular, una palabra que no cabe
// y se sale de su caja, un texto encogido hasta no leerse, dos capas una encima de otra, algo pegado al borde donde
// lo tapan los botones de la red. Se mide con el MISMO reparto que dibuja (`cajasDeEscena` del motor), así que lo que
// dice la revisión es lo que saldrá. Corre donde haya un lienzo:
//   · en el Container, con las fuentes reales del kit (la herramienta `revisar_video` de Claude);
//   · en la pantalla, con lo que tenga cargado la vista previa (gratis).
//
// Cada problema dice la escena, la capa, cuándo se ve, qué pasa y qué hacer, y si es GRAVE (se nota en el video:
// tapa, se sale, se encima) o un AVISO (apretado, una palabra sola en la última línea).
//
// Y el DISEÑO de cada escena en su instante «lleno» (cuando ya entró todo): texto que en el teléfono se lee pequeño
// (por su tamaño en píxeles, no sólo por cuánto se encogió), una escena que deja casi todo vacío y una que carga todo
// a un lado. Son avisos: se nota, pero no rompe nada.
// ============================================================

import {
  cajasDeEscena, areaSegura, bandaDeSubtitulos, encajarTexto, capasDe, TIPO_POR_ROL, FUENTE_RESPALDO, DURACION_ENTRADA,
} from "./motorVideo.js";
import { FORMATOS_VIDEO, tiempoDeCapa } from "./videoEscenas.js";
import { DURACION_CUENTA } from "./motorPiezas.js";

/** Lo que se perdona al comparar con un borde (redondeos del reparto). */
const TOLERANCIA = 2;
/** Por debajo de esta fracción del tamaño de su rol, el texto se encogió tanto que ya no se lee bien. */
export const ENCOGIDO_MINIMO = 0.62;
/** Por debajo de esto (fracción del lado corto: unos 38 px en 1080) un texto se lee pequeño en el teléfono. */
export const TEXTO_MINIMO = 0.035;
/** Una escena llena menos que esto de su área (sin los subtítulos) → se ve vacía. */
export const LLENO_MINIMO = 0.12;
/** …o lo que hay cabe en menos que esto del alto y ocupa poco (menos del doble) → todo apiñado en una franja. */
export const FRANJA_MINIMA = 0.35;
/** El centro de lo que ocupa la escena, más lejos que esto del centro (fracción del alto o del ancho) → desequilibrada. */
export const DESCENTRADO_MAXIMO = Object.freeze({ alto: 0.15, ancho: 0.12 });
/** Dos capas que se cruzan menos que esto (fracción de la menor) no cuentan como encimadas. */
const CRUCE_MINIMO = 0.04;

/** Las capas que se LEEN: las que no pueden quedar tapadas ni salirse. */
const CON_LETRAS = new Set(["texto", "sello", "llamado", "lista", "cifra", "burbuja"]);

const cruce = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const seVenALaVez = (a, b) => a && b && a.desde < b.hasta && b.desde < a.hasta;

/**
 * El instante «lleno» de una escena: cuando ya entró todo lo que entra (lo mejor para mirar un cuadro de ella).
 * Segundos del video. Pura.
 */
export function instanteLleno(guion, linea, indice) {
  const m = linea?.escenas?.[indice];
  if (!m) return 0;
  const dEntra = DURACION_ENTRADA[guion?.estilo?.ritmo] ?? DURACION_ENTRADA.medio;
  // Lo que entra más tarde (sin pasar del final de la escena) más su animación de entrada.
  // Una cifra o un anillo que cuenta está «lleno» cuando llega a su valor: a la mitad, la hoja enseñaría otro número.
  let ultimo = m.desde;
  let cuenta = m.desde;
  for (const capa of capasDe(guion.escenas[indice])) {
    const { desde } = tiempoDeCapa(capa, m);
    if (desde >= m.hasta) continue;
    ultimo = Math.max(ultimo, desde);
    if (["cifra", "anillo"].includes(capa.tipo) && capa.contar !== false) cuenta = Math.max(cuenta, desde + DURACION_CUENTA + 0.05);
  }
  return Math.round(Math.min(m.hasta - 0.05, Math.max(m.desde, ultimo + dEntra + 0.1, cuenta)) * 100) / 100;
}

/**
 * Revisa todas las escenas de un guion en un formato → [{ grave, tipo, escena, n, capa, en, mensaje }].
 *   ctx     — un contexto 2D que mida de verdad (con las fuentes ya registradas)
 *   linea   — `lineaDeTiempo(guion, palabras)`
 *   recursos, fuentes — los mismos que recibe el motor al dibujar
 * Pura (sólo mide).
 */
export function revisarEscenas(ctx, { guion, linea, formato, recursos = {}, fuentes = {} }) {
  const f = FORMATOS_VIDEO[formato] ? formato : (guion?.formatos?.[0] ?? "9:16");
  const { ancho, alto } = FORMATOS_VIDEO[f];
  const lado = Math.min(ancho, alto);
  const area = areaSegura(f, ancho, alto);
  const sub = guion?.subtitulos?.activo ? bandaDeSubtitulos(f, ancho, alto, guion.subtitulos.pos) : null;
  const banda = sub ? { x: area.x, y: sub.y, w: area.w, h: sub.h } : null;
  const titular = fuentes?.titular || FUENTE_RESPALDO;
  const cuerpo = fuentes?.cuerpo || titular;
  const problemas = [];

  (guion?.escenas ?? []).forEach((escena, i) => {
    const capas = capasDe(escena);
    const porId = new Map(capas.map((c) => [c.id, c]));
    const cajas = cajasDeEscena(ctx, { guion, linea, indice: i, formato: f, recursos, fuentes });
    const de = (caja, tipo, mensaje, grave = true) => problemas.push({
      grave, tipo, escena: escena.id, n: i + 1, capa: caja.id, en: Math.round((caja.cuando?.desde ?? linea.escenas[i]?.desde ?? 0) * 10) / 10, mensaje,
    });
    const delante = cajas.filter((c) => !c.detras && c.tipo !== "forma");

    for (const caja of delante) {
      const nombre = `«${caja.id}» (${caja.tipo})`;
      // 1. Fuera del lienzo: se corta.
      if (caja.x < -TOLERANCIA || caja.y < -TOLERANCIA || caja.x + caja.w > ancho + TOLERANCIA || caja.y + caja.h > alto + TOLERANCIA) {
        de(caja, "se_sale", `${nombre} se sale del cuadro y se corta. Quítale la posición x/y o bájale el tamaño (tam).`);
        continue;
      }
      // 2. Fuera del área segura: lo tapan la barra de la red, el texto del post o los botones.
      if (caja.x < area.x - TOLERANCIA || caja.y < area.y - TOLERANCIA || caja.x + caja.w > area.x + area.w + TOLERANCIA || caja.y + caja.h > area.y + area.h + TOLERANCIA) {
        de(caja, "zona_segura", `${nombre} queda fuera de la zona segura (en ${f}, ahí lo tapan la barra de la red o los botones). Usa una zona (arriba, centro, abajo) en vez de x/y.`, CON_LETRAS.has(caja.tipo) || caja.tipo === "logo");
      }
      // 3. Encima de los subtítulos.
      if (banda && cruce(caja, banda) > 0 && CON_LETRAS.has(caja.tipo)) {
        de(caja, "subtitulos", `Los subtítulos tapan ${nombre}. Muévelo a otra zona o pon los subtítulos ${guion.subtitulos.pos === "arriba" ? "abajo" : "arriba"} (subtitulos.pos).`);
      } else if (banda && cruce(caja, banda) > 0 && sub && !sub.aparta) {
        de(caja, "subtitulos", `Los subtítulos (en el centro) van encima de ${nombre}.`, false);
      }
    }

    // 4. Dos capas encimadas que se ven a la vez.
    for (let a = 0; a < delante.length; a++) {
      for (let b = a + 1; b < delante.length; b++) {
        const p = delante[a]; const q = delante[b];
        if (!seVenALaVez(p.cuando, q.cuando)) continue;
        const menor = Math.min(p.w * p.h, q.w * q.h) || 1;
        if (cruce(p, q) / menor > CRUCE_MINIMO) {
          de(q, "encimadas", `«${q.id}» queda encima de «${p.id}» mientras se ven las dos. Que una salga antes de que entre la otra, o ponlas en zonas distintas.`);
        }
      }
    }

    // 5. El texto: una palabra que no cabe, un texto encogido de más, una palabra sola en la última línea.
    for (const caja of delante) {
      const capa = porId.get(caja.id);
      if (capa?.tipo === "llamado") {
        const enc = encajarTexto(ctx, capa.texto ?? "", { ancho: (caja.ancho ?? caja.w) * 0.84, lado, rol: "apoyo", familia: titular });
        if (enc.tam * (caja.escala ?? 1) < lado * TEXTO_MINIMO) {
          de(caja, "texto_pequeno", `El llamado «${caja.id}» se lee pequeño en el teléfono (unos ${Math.round(enc.tam * (caja.escala ?? 1))} px): menos palabras.`, false);
        }
        continue;
      }
      if (!capa || !["texto", "sello"].includes(capa.tipo)) continue;
      const rol = capa.tipo === "sello" ? "titular" : (capa.rol ?? "titular");
      const r = TIPO_POR_ROL[rol] ?? TIPO_POR_ROL.titular;
      const familia = capa.tipo === "sello" || r.fuente === "titular" ? titular : cuerpo;
      const anchoTexto = (caja.ancho ?? caja.w) * (capa.tipo === "sello" ? 0.84 : 1);
      const enc = encajarTexto(ctx, capa.texto ?? "", { ancho: anchoTexto, lado, rol, familia });
      ctx.font = enc.fuente;
      const masAncha = Math.max(0, ...enc.lineas.map((l) => ctx.measureText(r.mayusculas ? l.toUpperCase() : l).width));
      const nombre = `«${caja.id}»`;
      if (masAncha > anchoTexto + TOLERANCIA) {
        const larga = String(capa.texto ?? "").split(/\s+/).reduce((x, y) => (y.length > x.length ? y : x), "");
        de(caja, "texto_se_sale", `El texto de ${nombre} no cabe: «${larga}» es más ancha que su caja y se sale. Acórtala o dale más ancho (tam).`);
      } else if (capa.tipo === "sello" && enc.lineas.length > 1) {
        // Un sello es un golpe de vista («NUEVO», «-20 %»): partido en dos líneas ya no se lee de un vistazo.
        de(caja, "sello_partido", `El sello ${nombre} se parte en ${enc.lineas.length} líneas («${enc.lineas.join(" / ")}»): un sello se lee de un vistazo en UNA. Déjalo en una o dos palabras cortas, o pásalo a un texto.`, false);
      } else if (enc.lineas.length > r.lineas) {
        de(caja, "texto_se_parte", `El texto de ${nombre} se parte en ${enc.lineas.length} líneas (lo normal para un ${rol} son ${r.lineas}). Acórtalo.`, false);
      }
      const encogido = (enc.tam * (caja.escala ?? 1)) / (lado * r.tam);
      const px = enc.tam * (caja.escala ?? 1);
      if (encogido < ENCOGIDO_MINIMO) {
        de(caja, "texto_apretado", `El texto de ${nombre} se encogió al ${Math.round(encogido * 100)} % de su tamaño para caber: se leerá pequeño. Menos palabras, o pásalo al habla.`, false);
      } else if (px < lado * TEXTO_MINIMO) {
        de(caja, "texto_pequeno", `El texto de ${nombre} sale a unos ${Math.round(px)} px: en el teléfono se lee pequeño. Usa un rol mayor (titular o apoyo en vez de etiqueta) o menos palabras.`, false);
      }
      const ultima = enc.lineas.at(-1) ?? "";
      if (enc.lineas.length >= 2 && !/\s/.test(ultima.trim()) && ultima.length <= 6) {
        de(caja, "palabra_sola", `La última línea de ${nombre} queda con una palabra sola («${ultima}»). Cambia una palabra para que se reparta mejor.`, false);
      }
    }

    // 6. El diseño de la escena en su instante «lleno»: ¿se ve vacía?, ¿todo a un lado?
    const t = instanteLleno(guion, linea, i);
    const vistas = cajas.filter((c) => !c.detras && c.cuando && c.cuando.desde <= t + 0.01 && t < c.cuando.hasta);
    if (vistas.length) {
      const zona = { ...area };
      if (sub?.aparta) { if (guion.subtitulos.pos === "arriba") { zona.y += sub.h; zona.h -= sub.h; } else zona.h -= sub.h; }
      const areaZona = zona.w * zona.h || 1;
      const ocupado = vistas.reduce((n, c) => n + c.w * c.h, 0) / areaZona;
      const arriba = Math.min(...vistas.map((c) => c.y)); const abajo = Math.max(...vistas.map((c) => c.y + c.h));
      const franja = (abajo - arriba) / (zona.h || 1);
      const primera = vistas[0];
      const enEscena = { cuando: { desde: t }, id: primera.id };
      if (ocupado < LLENO_MINIMO || (franja < FRANJA_MINIMA && ocupado < LLENO_MINIMO * 2)) {
        de(enEscena, "espacio_vacio", `La escena se ve vacía: lo que hay ocupa el ${Math.round(ocupado * 100)} % del cuadro${franja < FRANJA_MINIMA ? ` y cabe en una franja del ${Math.round(franja * 100)} % del alto` : ""}. Súmale una pieza visual (una cifra, un icono, un anillo, un dibujo o una imagen) o un texto más grande.`, false);
      }
      // El centro de lo que OCUPA la escena (de lo más alto a lo más bajo, de lo más a la izquierda a lo más a la
      // derecha): pesado por área, un titular ancho abajo y una cifra arriba parecerían «todo abajo» y no lo están.
      const izq = Math.min(...vistas.map((c) => c.x)); const der = Math.max(...vistas.map((c) => c.x + c.w));
      const cx = (izq + der) / 2;
      const cy = (arriba + abajo) / 2;
      const dy = (cy - (zona.y + zona.h / 2)) / (zona.h || 1);
      const dx = (cx - (zona.x + zona.w / 2)) / (zona.w || 1);
      if (Math.abs(dy) > DESCENTRADO_MAXIMO.alto) {
        de(enEscena, "desequilibrio", `La escena carga todo ${dy < 0 ? "arriba" : "abajo"} y deja ${dy < 0 ? "la parte de abajo" : "la de arriba"} vacía. Reparte las capas en zonas (arriba, centro, abajo) o quita las coordenadas x/y.`, false);
      } else if (Math.abs(dx) > DESCENTRADO_MAXIMO.ancho) {
        de(enEscena, "desequilibrio", `La escena carga todo a la ${dx < 0 ? "izquierda" : "derecha"}. Equilíbrala con algo al otro lado o céntrala.`, false);
      }
    }
  });
  return problemas;
}

/** Los problemas dichos en texto, para el modelo o para la pantalla: los graves primero. Pura. */
export function textoDeRevision(problemas, { formato = "9:16" } = {}) {
  if (!problemas.length) return `Revisión (${formato}): sin problemas. Nada tapado, nada fuera de la zona segura, ningún texto que se salga.`;
  const orden = [...problemas].sort((a, b) => Number(b.grave) - Number(a.grave) || a.n - b.n);
  const graves = orden.filter((p) => p.grave).length;
  return [
    `Revisión (${formato}): ${graves} grave${graves === 1 ? "" : "s"} y ${orden.length - graves} aviso${orden.length - graves === 1 ? "" : "s"}.`,
    ...orden.map((p) => `· ${p.grave ? "GRAVE" : "aviso"} · escena ${p.n} (${p.escena}) · ${p.en.toFixed(1)} s · ${p.mensaje}`),
  ].join("\n");
}
