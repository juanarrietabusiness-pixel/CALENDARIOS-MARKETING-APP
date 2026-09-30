// ============================================================
// El catálogo del Estudio: qué modelos hay, qué aceptan y cuánto cuestan
//
// PURO, y lo importan los dos lados: el Worker (para validar un pedido y
// saber a qué motor va) y la pantalla (para enseñar el costo ANTES de
// pedir). Dos copias de la tabla de precios acaban diciendo cosas
// distintas, y entonces el botón promete 0,07 $ y el contador apunta
// otra cifra. Igual que `agenda.js` y `publicacion.js`.
//
// UN MODELO ES DATOS, NO CÓDIGO. Añadir uno es una línea aquí; el motor
// (worker/lib/estudio/motores.js) sólo sabe llamar a su proveedor. Un test
// recorre el catálogo entero y falla si un modelo de imagen acepta
// fotogramas (en Agents Office la tarjeta de prueba los pedía y parecía un
// formulario de video), si un ajuste no trae su valor por defecto entre los
// permitidos, o si un modelo no declara costo.
//
// LOS PRECIOS SON ESTIMACIONES, y así se rotulan. Los motores no devuelven
// el costo real de una imagen; lo que se apunta en el contador es esto.
// `PRECIOS_AL` dice de cuándo son: un test avisa cuando pasan de 90 días.
// ============================================================

/** De cuándo son los precios de abajo (AAAA-MM-DD). */
export const PRECIOS_AL = "2026-09-30";

/** Desde este costo el pedido pide una segunda confirmación. */
export const CONFIRMAR_DESDE = 0.5;

/** Imágenes por pedido, como máximo. */
export const MAX_POR_PEDIDO = 8;

/** Videos por pedido, como máximo: cada uno cuesta de 0,20 $ a 3 $, y se ve mejor de uno en uno. */
export const MAX_VIDEOS_POR_PEDIDO = 2;

/** Cuántos se pueden pedir de este modelo. */
export const maxPorPedido = (modelo) => (modelo?.tipo === "video" ? MAX_VIDEOS_POR_PEDIDO : MAX_POR_PEDIDO);

/** Lo más largo que puede ser un prompt. */
export const MAX_PROMPT = 4_000;

const enumerado = (valores, defecto) => ({ tipo: "enum", valores: Object.freeze(valores), defecto });

const PROPORCIONES = Object.freeze(["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2", "5:4", "21:9"]);
const TAMANOS = Object.freeze(["1K", "2K", "4K"]);

/** Cómo se llama cada proporción en la interfaz (para quien no sabe qué es «4:5»). */
export const NOMBRE_PROPORCION = Object.freeze({
  "1:1": "Cuadrado", "4:5": "Vertical (feed)", "3:4": "Vertical", "2:3": "Vertical alto", "9:16": "Historia / Reel",
  "16:9": "Horizontal", "4:3": "Horizontal clásico", "3:2": "Horizontal foto", "5:4": "Casi cuadrado", "21:9": "Panorámico",
});

/** Tamaño de la tarjeta de prueba y de lo que se supone de un motor que no lo dice. */
export const MEDIDAS = Object.freeze({
  "1:1": [1024, 1024], "4:5": [1024, 1280], "3:4": [1024, 1365], "2:3": [1024, 1536], "9:16": [1024, 1792],
  "16:9": [1792, 1024], "4:3": [1365, 1024], "3:2": [1536, 1024], "5:4": [1280, 1024], "21:9": [1792, 768],
});

const AJUSTES_VEO = {
  aspectRatio: enumerado(["9:16", "16:9"], "9:16"),
  resolution: enumerado(["720p", "1080p"], "720p"),
  duration: enumerado(["4", "6", "8"], "8"),
};
/** Las reglas de Veo: con referencias, 720p horizontal; 1080p sólo en 8 s. */
function ajustarVeo(ajustes, medios = {}) {
  const r = { ...ajustes };
  if (medios.reference?.length) { r.aspectRatio = "16:9"; r.resolution = "720p"; }
  if (r.resolution === "1080p") r.duration = "8";
  return r;
}

/**
 * Los modelos. `costo` es dólares por imagen (o por segundo de video: `por: "s"`). `referencias` es cuántas
 * imágenes de referencia admite (0 = ninguna). `motor` dice quién lo hace.
 * `gid` es el id que espera el proveedor.
 */
export const MODELOS = Object.freeze([
  {
    id: "nano-banana", motor: "gemini", tipo: "imagen", gid: "gemini-2.5-flash-image", nombre: "Nano Banana", predeterminado: true,
    creador: "Google", calidad: 3, velocidad: "rápido", costo: 0.039, referencias: 3,
    nota: "El que ya usa la aplicación para las imágenes de las publicaciones. Edita y mezcla fotos: hasta 3 referencias (tu producto, tu logo, un estilo).",
    para: ["todo uso", "editar fotos", "producto"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1") },
  },
  {
    id: "nano-banana-2", motor: "gemini", tipo: "imagen", gid: "gemini-3.1-flash-image", nombre: "Nano Banana 2",
    creador: "Google", calidad: 3, velocidad: "rápido", costo: 0.067, referencias: 14, estimado: true,
    nota: "El todoterreno más nuevo de Google: hasta 14 referencias y hasta 4K. Precio aproximado; si tu cuenta de Google aún no lo tiene, dirá el motivo.",
    para: ["todo uso", "muchas referencias", "4K"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1"), imageSize: enumerado(TAMANOS, "1K") },
  },
  {
    id: "nano-banana-2-lite", motor: "gemini", tipo: "imagen", gid: "gemini-3.1-flash-lite-image", nombre: "Nano Banana 2 Lite",
    creador: "Google", calidad: 2, velocidad: "muy rápido", costo: 0.02, referencias: 3, estimado: true,
    nota: "El más rápido y barato de Google: para probar ideas y hacer lotes. Precio aproximado.",
    para: ["bocetos", "lotes", "barato"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1") },
  },
  {
    id: "nano-banana-pro", motor: "gemini", tipo: "imagen", gid: "gemini-3-pro-image-preview", nombre: "Nano Banana Pro",
    creador: "Google", calidad: 4, velocidad: "normal", costo: 0.134, referencias: 14, estimado: true,
    nota: "El tope de Google: piensa la composición y escribe texto legible dentro de la imagen. Hasta 14 referencias y 4K. Precio aproximado.",
    para: ["texto legible", "composición compleja", "4K"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1"), imageSize: enumerado(TAMANOS, "1K") },
  },
  // ---- Video. Cuestan por SEGUNDO (`por: "s"`) y tardan de uno a diez minutos: van por la cola de
  // los motores (`enviar` + `sondear`), no en una sola llamada. Las reglas de Veo salen de su API:
  // con referencias sólo sale a 720p horizontal, 1080p sólo viene en 8 s y un fotograma final necesita el inicial.
  {
    id: "veo-3.1", motor: "gemini", tipo: "video", gid: "veo-3.1-generate-preview", nombre: "Veo 3.1",
    creador: "Google", calidad: 4, velocidad: "lento", costo: 0.4, por: "s", referencias: 3, inicial: 1, final: 1, estimado: true,
    nota: "El video de Google, con sonido y diálogo: imagen inicial y final, o hasta 3 referencias (con referencias sale a 720p horizontal). Exige facturación en el proyecto de Google. Precio aproximado.",
    para: ["anuncios", "reels", "con sonido"],
    ajustes: AJUSTES_VEO, ajustar: ajustarVeo,
  },
  {
    id: "veo-3.1-fast", motor: "gemini", tipo: "video", gid: "veo-3.1-fast-generate-preview", nombre: "Veo 3.1 Fast",
    creador: "Google", calidad: 3, velocidad: "normal", costo: 0.15, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    nota: "Veo más rápido y barato, con sonido; imagen inicial y final. Precio aproximado.",
    para: ["reels", "pruebas", "animar una imagen"],
    ajustes: AJUSTES_VEO, ajustar: ajustarVeo,
  },
  {
    id: "veo-3.1-lite", motor: "gemini", tipo: "video", gid: "veo-3.1-lite-generate-preview", nombre: "Veo 3.1 Lite", predeterminado: true,
    creador: "Google", calidad: 2, velocidad: "rápido", costo: 0.05, por: "s", referencias: 0, inicial: 1, final: 0, estimado: true,
    nota: "El Veo más económico: para probar y animar imágenes en lote. Precio aproximado.",
    para: ["lotes", "pruebas", "barato"],
    ajustes: AJUSTES_VEO, ajustar: ajustarVeo,
  },
  {
    id: "prueba-video", motor: "prueba", tipo: "video", nombre: "Prueba de video (gratis)",
    creador: "Estudio", calidad: 1, velocidad: "muy rápido", costo: 0, por: "s", referencias: 8, inicial: 1, final: 1,
    nota: "Una tarjeta animada en lugar del video: prueba todo el recorrido (animar una imagen, esperar, ver) sin gastar nada.",
    para: ["probar el flujo sin gastar"],
    ajustes: { aspectRatio: enumerado(["16:9", "9:16", "1:1"], "9:16"), duration: enumerado(["3", "5", "8"], "5") },
  },
  {
    id: "prueba", motor: "prueba", tipo: "imagen", nombre: "Prueba (gratis)",
    creador: "Estudio", calidad: 1, velocidad: "muy rápido", costo: 0, referencias: 8,
    nota: "Una tarjeta con tu prompt, no una imagen real: prueba todo el recorrido sin gastar nada.",
    para: ["probar el flujo sin gastar"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1") },
  },
]);

/** El modelo con ese id, o null. */
export const modeloPorId = (id) => MODELOS.find((m) => m.id === id) ?? null;

/**
 * El modelo con que arranca el compositor: el marcado `predeterminado` de ese tipo si su motor tiene llave, luego
 * cualquier otro real, y si no hay ninguno, la prueba. El predeterminado es el más barato que ya se sabe que
 * funciona: para imagen, el que la aplicación ya usaba; para video, Veo Lite.
 */
export function modeloPorDefecto(motoresActivos = {}, tipo = "imagen") {
  const deEsteTipo = MODELOS.filter((m) => m.tipo === tipo && m.motor !== "prueba" && motoresActivos[m.motor]);
  return deEsteTipo.find((m) => m.predeterminado) ?? deEsteTipo[0]
    ?? MODELOS.find((m) => m.tipo === tipo && m.motor === "prueba");
}

/** Segundos de un video pedido (su ajuste `duration`, o el que traiga el modelo por defecto). */
export const duracionDe = (modelo, ajustes = {}) => Number(ajustes?.duration ?? modelo?.ajustes?.duration?.defecto ?? 0) || 0;

/** Cuánto cuesta un pedido, en dólares, redondeado a la milésima. Un video cuesta por segundo. */
export function estimar(modelo, cantidad = 1, ajustes = {}) {
  const m = typeof modelo === "string" ? modeloPorId(modelo) : modelo;
  if (!m) return 0;
  const n = Math.max(1, Math.min(maxPorPedido(m), Math.trunc(Number(cantidad)) || 1));
  const unidades = m.por === "s" ? duracionDe(m, ajustes) : 1;
  return Math.round(m.costo * n * unidades * 1000) / 1000;
}

/** «≈ 0,07 $», «gratis». */
export function textoCosto(dolares) {
  if (!(dolares > 0)) return "gratis";
  const n = dolares < 0.1 ? dolares.toFixed(3) : dolares.toFixed(2);
  return `≈ ${n.replace(".", ",")} $`;
}

/** ¿Este costo pide una segunda confirmación? */
export const pideConfirmar = (dolares) => Number(dolares) >= CONFIRMAR_DESDE;

/**
 * Los ajustes tal como los acepta el modelo: cada uno con un valor
 * permitido, y los que el modelo no conoce, fuera. Lo que llegue
 * inventado (del navegador, de un asistente) no llega al proveedor.
 */
export function normalizarAjustes(modelo, entrada = {}) {
  const m = typeof modelo === "string" ? modeloPorId(modelo) : modelo;
  const salida = {};
  for (const [nombre, def] of Object.entries(m?.ajustes ?? {})) {
    const valor = entrada?.[nombre];
    salida[nombre] = def.valores.includes(valor) ? valor : def.defecto;
  }
  return salida;
}

/**
 * Los ajustes tal como quedan para este modelo y estos medios: normalizados, y con las reglas propias del
 * modelo aplicadas (Veo con referencias sale a 720p horizontal; 1080p sólo viene en 8 s). La pantalla los
 * usa para no enseñar una combinación que el modelo va a cambiar, y `validarPedido` para lo que se envía.
 */
export function ajustesDe(modelo, entrada = {}, medios = {}) {
  const m = typeof modelo === "string" ? modeloPorId(modelo) : modelo;
  const ajustes = normalizarAjustes(m, entrada);
  return m?.ajustar ? m.ajustar(ajustes, medios) : ajustes;
}

/** La proporción de un pedido; 1:1 si el modelo no la trae. */
export const proporcionDe = (ajustes) => (MEDIDAS[ajustes?.aspectRatio] ? ajustes.aspectRatio : "1:1");

/**
 * Comprueba un pedido y lo deja limpio. Pura: la llaman el Worker (antes
 * de crear el trabajo) y la pantalla (para no enseñar un botón que el
 * servidor va a rechazar). `{ ok, error, pedido }`.
 */
export function validarPedido(entrada = {}) {
  const modelo = modeloPorId(entrada.modelo);
  if (!modelo) return { ok: false, error: "Ese modelo no existe en el Estudio." };
  const prompt = String(entrada.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "Escribe qué quieres crear." };
  if (prompt.length > MAX_PROMPT) return { ok: false, error: `El prompt es demasiado largo (máximo ${MAX_PROMPT} caracteres).` };
  const tope = maxPorPedido(modelo);
  const n = Number(entrada.n ?? 1);
  if (!(Number.isInteger(n) && n >= 1 && n <= tope)) {
    return { ok: false, error: `Puedes pedir de 1 a ${tope} ${modelo.tipo === "video" ? "videos" : "imágenes"} por vez.` };
  }
  const unicos = (lista) => [...new Set((lista ?? []).map(String))];
  const medios = {};
  const referencias = unicos(entrada.medios?.reference);
  const inicial = unicos(entrada.medios?.start);
  const final = unicos(entrada.medios?.end);
  if (referencias.length > (modelo.referencias ?? 0)) {
    return {
      ok: false,
      error: modelo.referencias
        ? `${modelo.nombre} admite hasta ${modelo.referencias} referencias; llevas ${referencias.length}.`
        : `${modelo.nombre} no admite imágenes de referencia.`,
    };
  }
  if (inicial.length > (modelo.inicial ?? 0)) {
    return { ok: false, error: modelo.inicial ? `${modelo.nombre} lleva una sola imagen inicial.` : `${modelo.nombre} no admite imagen inicial.` };
  }
  if (final.length > (modelo.final ?? 0)) {
    return { ok: false, error: modelo.final ? `${modelo.nombre} lleva una sola imagen final.` : `${modelo.nombre} no admite imagen final.` };
  }
  if (final.length && !inicial.length) return { ok: false, error: "La imagen final necesita también una inicial." };
  if (inicial.length && referencias.length && modelo.motor === "gemini" && modelo.tipo === "video") {
    return { ok: false, error: "Ese modelo no mezcla imagen inicial con referencias: usa una cosa o la otra." };
  }
  if (referencias.length) medios.reference = referencias;
  if (inicial.length) medios.start = inicial;
  if (final.length) medios.end = final;
  let ajustes = normalizarAjustes(modelo, entrada.ajustes);
  if (modelo.ajustar) ajustes = modelo.ajustar(ajustes, medios);
  return { ok: true, pedido: { modelo, prompt, n, ajustes, medios, costoEstimado: estimar(modelo, n, ajustes) } };
}

/** Días que un archivo espera en la papelera antes de borrarse de verdad. */
export const DIAS_PAPELERA = 30;

/** Días que le quedan a un archivo de la papelera (0 = se borra ya). */
export function diasQueQuedan(borradoAt, ahora = Date.now()) {
  const t = Date.parse(borradoAt);
  if (!Number.isFinite(t)) return DIAS_PAPELERA;
  return Math.max(0, Math.ceil((t + DIAS_PAPELERA * 86_400_000 - ahora) / 86_400_000));
}

/** Estados en los que un trabajo sigue vivo. */
export const ESTADOS_VIVOS = Object.freeze(["en_cola", "en_marcha"]);
export const estaVivo = (estado) => ESTADOS_VIVOS.includes(estado);

/** Lo que dice la interfaz de cada estado. */
export const NOMBRE_ESTADO = Object.freeze({
  en_cola: "En cola", en_marcha: "Creando…", hecho: "Listo", fallido: "No salió", cancelado: "Cancelado",
});
