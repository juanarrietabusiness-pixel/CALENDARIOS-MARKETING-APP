// ============================================================
// «MEJORAR MI VIDEO» y «VARIOS ÁNGULOS DE UNA TOMA»: lo puro (lo usan el Worker, la pantalla y el MCP)
//
// Sobre un video que YA está en la galería del cliente (grabado por la persona o hecho con IA):
//
//   escalar   Topaz por Kie: el mismo video, ampliado (×2 o ×4) y limpio. Cualquier duración, hasta 50 MB.
//   look      Cambiar SÓLO la luz y el color con uno de nuestros looks escritos (no los de Higgsfield): Omni 1.2 edita
//             hasta 15 s; de 15 a 30 s, Seedance 2.5 (sigue el video de referencia: puede cambiar algo más).
//   cambiar   Lo mismo con una instrucción libre y, si se quiere, fotos de referencia (el producto exacto).
//   angulos   De 3 a 5 cámaras nuevas de la MISMA toma, una por ángulo, y un montaje que va saltando entre el original
//             y los ángulos con el AUDIO ORIGINAL debajo.
//
// SIEMPRE se conserva el audio original: lo que sale del modelo se une en el Container con el sonido del video de la
// persona (container/unir.mjs). Y SIEMPRE se pregunta el costo antes (video pregunta siempre: regla de oro 9).
// Nada de esto se ha probado contra Kie todavía (sólo la unión, con ffmpeg).
// ============================================================

import { modeloPorId, estimar, costoUnitario, textoCosto } from "./estudioCatalogo.js";
import { SIN_TEXTO_VIDEO } from "./videoLimpio.js";

export const MODOS_MEJORA = Object.freeze(["escalar", "look", "cambiar", "angulos"]);
export const NOMBRE_MODO = Object.freeze({
  escalar: "Escalar", look: "Look y luz", cambiar: "Cambiar algo", angulos: "Varios ángulos",
});

/** Lo más que dura un video que Omni 1.2 edita; hasta `HASTA_LARGO`, Seedance 2.5. */
export const HASTA_OMNI = 15;
export const HASTA_LARGO = 30;
/** Topaz admite hasta 50 MB. */
export const TOPE_ESCALAR = 50 * 1024 * 1024;
export const MIN_ANGULOS = 3;
export const MAX_ANGULOS = 5;
/** Cada cuánto salta de cámara el montaje de ángulos (s). */
export const CORTE_ANGULOS = 2;
/** Fotos de referencia para «cambiar algo». */
export const MAX_REFERENCIAS_MEJORA = 3;

/** Nuestros LOOKS: sólo la luz y el color, escritos por la agencia. */
export const LOOKS = Object.freeze([
  { id: "dorada", nombre: "Hora dorada", texto: "luz cálida y baja de atardecer (hora dorada) entrando de lado, sombras largas y suaves, piel con tono dorado natural y un brillo cálido en los bordes" },
  { id: "estudio", nombre: "Luz de estudio", texto: "luz de estudio suave y envolvente, como con una caja de luz grande al frente y un relleno blanco, sombras muy suaves, colores fieles y limpios, aspecto de anuncio profesional" },
  { id: "limpio", nombre: "Blanco y luminoso", texto: "imagen luminosa y aireada (high key), blancos limpios sin quemar, colores suaves y naturales, sensación de frescura y orden, aspecto de marca premium" },
  { id: "cine", nombre: "Cine cálido", texto: "gradación de color cinematográfica cálida: sombras profundas con un toque azul verdoso, pieles cálidas, contraste suave tipo película, ligero viñeteado" },
  { id: "noche", nombre: "Noche con neón", texto: "ambiente nocturno con luces de neón de colores (magenta y cian) reflejándose en las superficies, contraste alto, negros profundos, aspecto urbano y moderno" },
  { id: "contraluz", nombre: "Contraluz", texto: "contraluz suave detrás del sujeto que dibuja un borde de luz en el pelo y los hombros, cara bien expuesta con un relleno suave, fondo un poco más oscuro" },
  { id: "pelicula", nombre: "Película de 35 mm", texto: "aspecto de película de 35 mm: grano fino, colores algo desaturados y cálidos, negros levemente lavados, halo suave en las luces" },
  { id: "frio", nombre: "Frío y moderno", texto: "luz neutra a fría, blancos limpios con un toque azul, contraste medio, colores sobrios, aspecto tecnológico y moderno" },
]);

/** Los ÁNGULOS de cámara que se pueden pedir. */
export const ANGULOS = Object.freeze([
  { id: "cerca", nombre: "Plano cercano", texto: "plano cercano (close-up) de la cara o del producto, más cerca que el original" },
  { id: "general", nombre: "Plano general", texto: "plano general más abierto que muestra todo el espacio alrededor" },
  { id: "lateral", nombre: "De lado", texto: "cámara de lado, a 90 grados del original, a la altura de los ojos" },
  { id: "tres-cuartos", nombre: "Tres cuartos", texto: "cámara en diagonal, a tres cuartos (unos 45 grados del original)" },
  { id: "picado", nombre: "Desde arriba", texto: "cámara alta mirando hacia abajo (picado)" },
  { id: "contrapicado", nombre: "Desde abajo", texto: "cámara baja mirando hacia arriba (contrapicado)" },
  { id: "hombro", nombre: "Sobre el hombro", texto: "cámara detrás del hombro de la persona, mirando lo que ella mira" },
  { id: "detalle", nombre: "Detalle", texto: "plano detalle muy cerrado de las manos, el producto o la acción principal" },
]);

const lookPorId = (id) => LOOKS.find((l) => l.id === id) ?? null;
const anguloPorId = (id) => ANGULOS.find((a) => a.id === id) ?? null;

/** Lo que se pide igual en todo lo que edita: que no cambie lo que no se pidió. */
const CONSERVA = "Conserva EXACTAMENTE las personas (sus caras, cuerpos y ropa), los objetos, el lugar, el encuadre, los movimientos, los cortes y el tiempo de cada acción.";

/** La proporción que mejor se parece al video entre las que admite el modelo. Pura. */
export function proporcionPara(modelo, ancho = 0, alto = 0) {
  const valores = modelo?.ajustes?.aspectRatio?.valores ?? [];
  if (!valores.length) return null;
  if (!(ancho > 0 && alto > 0)) return valores.includes("9:16") ? "9:16" : valores[0];
  const r = ancho / alto;
  const valor = (p) => { const [a, b] = p.split(":").map(Number); return a / b; };
  return [...valores].sort((a, b) => Math.abs(Math.log(valor(a) / r)) - Math.abs(Math.log(valor(b) / r)))[0];
}

/** La duración que admite el modelo para cubrir `segundos` (la primera que llega; si ninguna, la más larga). Pura. */
export function duracionPara(modelo, segundos) {
  const lista = (modelo?.ajustes?.duration?.valores ?? []).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  if (!lista.length) return 0;
  const quiero = Math.max(1, Math.ceil(Number(segundos) || 0));
  return lista.find((d) => d >= quiero) ?? lista.at(-1);
}

/** El modelo que edita un video de `segundos`: Omni 1.2 hasta 15 s, Seedance 2.5 hasta 30 s. → modelo | null. Pura. */
export function modeloQueEdita(segundos) {
  if (segundos <= HASTA_OMNI) return modeloPorId("gemini-omni-1-2-kie");
  if (segundos <= HASTA_LARGO) return modeloPorId("seedance-2-5-kie");
  return null;
}

/** Los ajustes del modelo que edita para este video. Pura. */
function ajustesDeEdicion(modelo, video) {
  const proporcion = proporcionPara(modelo, video.ancho, video.alto);
  const omni = modelo.id === "gemini-omni-1-2-kie";
  return {
    ...(proporcion ? { aspectRatio: proporcion } : {}),
    duration: String(duracionPara(modelo, video.duracion)),
    // Omni a 1080p cuesta casi lo mismo que a 720p; Seedance a 1080p, un 60 % más.
    resolution: omni ? "1080p" : "720p",
    // El sonido lo pone el ORIGINAL al unir: el del modelo no se usa.
    ...(modelo.ajustes?.sonido ? { sonido: "no" } : {}),
  };
}

/** El prompt de un LOOK. Pura. */
export const promptDeLook = (look) => [
  "Edita el video de referencia cambiando SOLO la luz y el color.", CONSERVA,
  `La luz y el color nuevos: ${look.texto}.`, "No añadas ni quites nada de la escena.", SIN_TEXTO_VIDEO,
].join(" ");

/** El prompt de «cambiar algo». Pura. */
export const promptDeCambio = (instruccion, conFotos = false) => [
  "Edita el video de referencia.", CONSERVA, `Cambia SOLO esto: ${String(instruccion).trim().replace(/\.$/, "")}.`,
  conFotos ? "Lo nuevo es EXACTAMENTE lo de las imágenes de referencia (su forma, su color, su marca): no lo inventes." : "",
  "Todo lo demás queda igual.", SIN_TEXTO_VIDEO,
].filter(Boolean).join(" ");

/** El prompt de UN ángulo nuevo de la misma toma. Pura. */
export const promptDeAngulo = (angulo) => [
  "Recrea EXACTAMENTE la misma toma del video de referencia vista desde otra cámara, como si una segunda cámara la hubiera grabado a la vez.",
  `La cámara nueva: ${angulo.texto}.`,
  "Las mismas personas con la misma cara, el mismo cuerpo y la misma ropa; el mismo lugar, la misma luz y los mismos objetos; las mismas acciones en el mismo momento, segundo a segundo. Una sola toma continua, sin cortes.",
  SIN_TEXTO_VIDEO,
].join(" ");

/**
 * Los tramos del montaje de ángulos: salta de cámara cada `CORTE_ANGULOS` s, empezando por el original y pasando por cada
 * ángulo en orden. `fuente`: "original" o el índice del ángulo. Pura.
 */
export function tramosDeAngulos(duracion, n) {
  const total = Math.max(0.5, Number(duracion) || 0);
  const camaras = ["original", ...Array.from({ length: n }, (_, i) => i)];
  const cortes = Math.max(camaras.length, Math.round(total / CORTE_ANGULOS));
  const largo = total / cortes;
  return Array.from({ length: cortes }, (_, i) => ({
    fuente: camaras[i % camaras.length], desde: Math.round(i * largo * 1000) / 1000, hasta: Math.round(Math.min(total, (i + 1) * largo) * 1000) / 1000,
  }));
}

const enSegundos = (s) => `${Math.round(s * 10) / 10} s`.replace(".", ",");

/**
 * El PLAN de una mejora → { ok, error } | { ok: true, modo, titulo, pasos: [{ id, titulo, pedido }], costo, modelo,
 * resumen, aviso, union }. `video`: { clave, ancho, alto, duracion, bytes }; `activos`: { motor: bool }. Pura: el
 * Worker la usa para crear el encargo (con la clave ya comprobada) y la pantalla para enseñar el costo antes.
 */
export function planDeMejora({ modo, video = {}, look = "", instruccion = "", angulos = [], referencias = [], factor = "2", activos = {} } = {}) {
  if (!MODOS_MEJORA.includes(modo)) return { ok: false, error: "Escoge qué hacer con el video: escalar, look, cambiar algo o varios ángulos." };
  if (!activos.kie) return { ok: false, error: "Mejorar un video va por Kie.ai, y este servidor no tiene su llave (KIE_API_KEY)." };
  const duracion = Number(video.duracion) || 0;
  if (!(duracion > 0)) return { ok: false, error: "No pude medir lo que dura el video: vuelve a subirlo en MP4." };
  const medios = { video: [video.clave] };

  if (modo === "escalar") {
    if (Number(video.bytes) > TOPE_ESCALAR) return { ok: false, error: "Para escalar, el video tiene que pesar 50 MB o menos." };
    const modelo = modeloPorId("topaz-video-kie");
    const f = ["1", "2", "4"].includes(String(factor)) ? String(factor) : "2";
    const costo = Math.round(costoUnitario(modelo, { factor: f }) * Math.ceil(duracion) * 1000) / 1000;
    return {
      ok: true, modo, modelo, costo, titulo: `Escalado ×${f}`,
      resumen: `Topaz amplía tu video ×${f} y lo limpia (${enSegundos(duracion)}): ${textoCosto(costo)}. Conserva el audio original.`,
      pasos: [{ id: "escalar", titulo: `Escalado ×${f}`, pedido: { modelo: modelo.id, prompt: "Ampliar y limpiar el video.", n: 1, ajustes: { factor: f }, medios } }],
      union: { tramos: [{ fuente: 0, desde: 0, hasta: duracion }] },
    };
  }

  const modelo = modeloQueEdita(duracion);
  if (!modelo) return { ok: false, error: `El video dura ${enSegundos(duracion)}: para cambiar la luz, algo de la escena o los ángulos, hasta ${HASTA_LARGO} s (recórtalo antes). Escalar sí admite videos largos.` };
  const ajustes = ajustesDeEdicion(modelo, { ...video, duracion });
  const unidad = estimar(modelo, 1, ajustes);
  const nombreModelo = modelo.id === "gemini-omni-1-2-kie" ? "Gemini Omni 1.2" : "Seedance 2.5";
  const cubre = Number(ajustes.duration);
  const recorte = cubre < duracion ? ` El modelo hace ${cubre} s: lo que pase de ahí queda fuera.` : "";

  if (modo === "look") {
    const l = lookPorId(look);
    if (!l) return { ok: false, error: "Escoge un look." };
    return {
      ok: true, modo, modelo, costo: unidad, titulo: `Look: ${l.nombre}`,
      resumen: `${nombreModelo} cambia la luz y el color («${l.nombre}», ${cubre} s): ${textoCosto(unidad)}. Conserva el audio original.${recorte}`,
      pasos: [{ id: "look", titulo: l.nombre, pedido: { modelo: modelo.id, prompt: promptDeLook(l), n: 1, ajustes, medios } }],
      union: { tramos: [{ fuente: 0, desde: 0, hasta: Math.min(duracion, cubre) }] },
    };
  }

  if (modo === "cambiar") {
    const que = String(instruccion ?? "").trim();
    if (que.length < 3) return { ok: false, error: "Escribe qué quieres cambiar del video." };
    if (que.length > 600) return { ok: false, error: "La instrucción es demasiado larga (600 caracteres como mucho)." };
    const fotos = [...new Set((referencias ?? []).filter(Boolean))].slice(0, MAX_REFERENCIAS_MEJORA);
    return {
      ok: true, modo, modelo, costo: unidad, titulo: "Cambio en el video",
      resumen: `${nombreModelo} cambia «${que.slice(0, 80)}»${fotos.length ? ` con ${fotos.length === 1 ? "tu foto" : `${fotos.length} fotos`} de referencia` : ""} (${cubre} s): ${textoCosto(unidad)}. Conserva el audio original.${recorte}`,
      pasos: [{ id: "cambiar", titulo: "Cambio", pedido: { modelo: modelo.id, prompt: promptDeCambio(que, fotos.length > 0), n: 1, ajustes, medios: { ...medios, ...(fotos.length ? { reference: fotos } : {}) } } }],
      union: { tramos: [{ fuente: 0, desde: 0, hasta: Math.min(duracion, cubre) }] },
    };
  }

  // Varios ángulos.
  const elegidos = [...new Set(angulos ?? [])].map(anguloPorId).filter(Boolean);
  if (elegidos.length < MIN_ANGULOS || elegidos.length > MAX_ANGULOS) return { ok: false, error: `Escoge de ${MIN_ANGULOS} a ${MAX_ANGULOS} ángulos.` };
  const costo = Math.round(unidad * elegidos.length * 1000) / 1000;
  const largo = Math.min(duracion, cubre);
  return {
    ok: true, modo, modelo, costo, titulo: `${elegidos.length} ángulos de la toma`,
    resumen: `${nombreModelo} graba ${elegidos.length} cámaras nuevas de la misma toma (${cubre} s cada una): ${textoCosto(costo)}. Después se monta solo, saltando de cámara cada ${CORTE_ANGULOS} s, con el audio original.${recorte}`,
    aviso: "Si en el video alguien habla a cámara, en los ángulos nuevos la boca no coincidirá con la voz: funciona mejor con tomas sin habla (producto, ambiente, acción) o con la voz en off.",
    pasos: elegidos.map((a) => ({ id: `angulo-${a.id}`, titulo: a.nombre, pedido: { modelo: modelo.id, prompt: promptDeAngulo(a), n: 1, ajustes, medios } })),
    union: { tramos: tramosDeAngulos(largo, elegidos.length), copiar: false },
  };
}

/** Cómo va la mejora, en palabras, para la pantalla. Pura. */
export function textoDeMejora(m = {}) {
  const u = m.union ?? {};
  if (u.fase === "uniendo") return "Uniendo con el audio original…";
  if (u.fase === "hecho") return "Listo, con el audio original.";
  if (u.fase === "fallido") return u.error || "No se pudo unir con el audio original.";
  return "";
}
