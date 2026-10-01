// ============================================================
// El Estudio, desde el navegador
//
// Llama a /api/estudio por `pedir()` (db.js): la misma cookie, la misma
// cabecera de pestaña y el mismo error con el motivo del servidor en
// español. Nada aquí habla con Google ni con ningún otro motor: eso es del
// Worker, y `connect-src` sigue en `'self'`.
//
// Lo PURO (filtrar la galería, agrupar los trabajos, la frase de cada
// estado) está abajo y tiene sus casos; lo que llama a la red, arriba.
// ============================================================

import { pedir } from "./db";
import { estaVivo, diasQueQuedan, MODELOS, MAX_PROMPT } from "./estudioCatalogo";

const base = (clienteId) => `/estudio/${encodeURIComponent(clienteId)}`;
const post = (cuerpo) => ({ method: "POST", body: JSON.stringify(cuerpo ?? {}) });

/** Qué motores tienen llave en el servidor (nunca la llave). */
export const leerMotores = () => pedir("/estudio/motores");

/** La galería, la papelera, las carpetas y los trabajos de un cliente. */
export const leerEstudio = (clienteId) => pedir(base(clienteId));

/** Pide imágenes. Lanza con `e.datos.codigo === "confirmar"` si cuesta 0,50 $ o más y falta la confirmación. */
export const pedirImagenes = (clienteId, datos) => pedir(`${base(clienteId)}/trabajos`, post(datos));

/** UN paso de un trabajo: una imagen. Devuelve `{ trabajo, ocupado }`. */
export const avanzarTrabajo = (clienteId, id) => pedir(`${base(clienteId)}/trabajos/${encodeURIComponent(id)}/avanzar`, post());
export const cancelarTrabajo = (clienteId, id) => pedir(`${base(clienteId)}/trabajos/${encodeURIComponent(id)}/cancelar`, post());
export const reintentarTrabajo = (clienteId, id) => pedir(`${base(clienteId)}/trabajos/${encodeURIComponent(id)}/reintentar`, post());

/**
 * «Mejorar idea»: la IA devuelve la idea más clara y sencilla, para que el
 * motor la entienda. `{ idea, modelo, aviso }`. Es texto: no pide nada al motor.
 */
export const mejorarIdea = (clienteId, datos) => pedir(`${base(clienteId)}/mejorar`, post(datos));

/** Sube una imagen a mano (la foto del producto, el logo) a la galería del cliente. */
export function subirImagen(clienteId, archivo, { carpetaId = null } = {}) {
  const form = new FormData();
  form.set("archivo", archivo);
  if (carpetaId) form.set("carpetaId", carpetaId);
  return pedir(`${base(clienteId)}/archivos`, { method: "POST", body: form });
}

const delArchivo = (clienteId, id, accion) => `${base(clienteId)}/archivos/${encodeURIComponent(id)}/${accion}`;
export const cambiarArchivo = (clienteId, id, cambios) => pedir(delArchivo(clienteId, id, "cambiar"), post(cambios));
export const apuntarUso = (clienteId, id, { calendarId, postId }) => pedir(delArchivo(clienteId, id, "uso"), post({ calendarId, postId }));
export const mandarAPapelera = (clienteId, id) => pedir(delArchivo(clienteId, id, "papelera"), post());
export const recuperarArchivo = (clienteId, id) => pedir(delArchivo(clienteId, id, "recuperar"), post());
export const borrarDelTodo = (clienteId, id, { forzar = false } = {}) =>
  pedir(`${base(clienteId)}/archivos/${encodeURIComponent(id)}${forzar ? "?forzar=1" : ""}`, { method: "DELETE" });
export const vaciarPapelera = (clienteId) => pedir(`${base(clienteId)}/papelera/vaciar`, post());

export const crearCarpeta = (clienteId, nombre) => pedir(`${base(clienteId)}/carpetas`, post({ nombre }));
export const renombrarCarpeta = (clienteId, id, nombre) => pedir(`${base(clienteId)}/carpetas/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ nombre }) });
export const borrarCarpeta = (clienteId, id) => pedir(`${base(clienteId)}/carpetas/${encodeURIComponent(id)}`, { method: "DELETE" });

// ------------------------------------------------------------
// Puro
// ------------------------------------------------------------

/** Filtros de la galería: `todas`, `favoritas`, `subidas`, `sin-carpeta` o el id de una carpeta. */
export function filtrarArchivos(archivos = [], { filtro = "todas", texto = "" } = {}) {
  const t = String(texto ?? "").trim().toLowerCase();
  return archivos.filter((a) => {
    if (filtro === "favoritas" && !a.favorito) return false;
    if (filtro === "subidas" && !a.subido) return false;
    if (filtro === "sin-carpeta" && a.carpetaId) return false;
    if (!["todas", "favoritas", "subidas", "sin-carpeta"].includes(filtro) && a.carpetaId !== filtro) return false;
    if (t && !`${a.prompt} ${a.modelo}`.toLowerCase().includes(t)) return false;
    return true;
  });
}

/** Cuántos archivos hay en cada filtro, para los números de los chips. */
export function contarFiltros(archivos = [], carpetas = []) {
  const cuentas = { todas: archivos.length, favoritas: 0, subidas: 0, "sin-carpeta": 0 };
  for (const c of carpetas) cuentas[c.id] = 0;
  for (const a of archivos) {
    if (a.favorito) cuentas.favoritas++;
    if (a.subido) cuentas.subidas++;
    if (!a.carpetaId) cuentas["sin-carpeta"]++;
    else if (a.carpetaId in cuentas) cuentas[a.carpetaId]++;
  }
  return cuentas;
}

/**
 * Qué trabajos se enseñan arriba: los que siguen vivos, y lo que falló o se
 * canceló en la última hora y la persona no ha descartado. Lo terminado bien
 * ya está en la galería.
 */
export function trabajosVisibles(trabajos = [], { descartados = new Set(), ahora = Date.now() } = {}) {
  return trabajos.filter((t) => {
    if (estaVivo(t.estado)) return true;
    if (descartados.has(t.id)) return false;
    if (t.estado === "fallido" || t.estado === "cancelado") return ahora - Date.parse(t.actualizado || t.creado) < 3_600_000;
    // Un trabajo que terminó con menos de lo pedido lleva su nota: que se vea.
    return t.estado === "hecho" && Boolean(t.nota) && ahora - Date.parse(t.terminado || t.actualizado) < 3_600_000;
  });
}

/** Lo que dice una tarjeta de trabajo en curso. */
export function fraseDeTrabajo(t) {
  const hechos = t.archivos?.length ?? 0;
  if (t.estado === "en_cola") return t.nota || (hechos ? `Van ${hechos} de ${t.n}. Sigue en cola…` : "En cola…");
  if (t.estado === "en_marcha") {
    // Un video se envía y luego se espera: lo que el servidor dice («Enviado…», «Generando…») es más útil que un «Creando».
    if (t.nota) return t.nota;
    const cosa = t.tipo === "video" ? "el video" : "la imagen";
    return t.n > 1 ? `Creando ${t.tipo === "video" ? "el" : "la"} ${hechos + 1} de ${t.n}…` : `Creando ${cosa}…`;
  }
  if (t.estado === "fallido") return t.error || "No salió.";
  if (t.estado === "cancelado") return hechos ? `Cancelado. Llegaron ${hechos} de ${t.n}.` : "Cancelado.";
  return t.nota || "";
}

/** «hace 3 min», «hace 2 h», «ayer», o la fecha. */
export function hace(iso, ahora = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((ahora - t) / 1000));
  if (s < 45) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 172_800) return "ayer";
  return new Date(t).toLocaleDateString("es-PA", { day: "numeric", month: "short" });
}

/** «Se borra en 12 días», «Se borra hoy». */
export function textoPapelera(borradoAt, ahora = Date.now()) {
  const d = diasQueQuedan(borradoAt, ahora);
  return d <= 0 ? "Se borra hoy" : d === 1 ? "Se borra mañana" : `Se borra en ${d} días`;
}

/** Nombre del archivo al descargar: el prompt, corto y sin símbolos. */
export function nombreDeDescarga(archivo) {
  const ext = { "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm" }[archivo.mime] ?? "png";
  const base = String(archivo.prompt || "imagen").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "imagen";
  return `${base}.${ext}`;
}

// ------------------------------------------------------------
// Puro: de una publicación al Estudio y del Estudio a una publicación
// ------------------------------------------------------------

/** La proporción con que conviene crear la imagen o el video de una publicación. */
export function proporcionParaFormato(formato, tipo = "imagen") {
  if (formato === "reel" || formato === "historia") return "9:16";
  if (formato === "live") return "16:9";
  // Un post o un carrusel: 4:5 es lo más alto que admite el feed de Instagram. Un video de post, cuadrado no lo hacen los motores: vertical.
  return tipo === "video" ? "9:16" : "4:5";
}

/** El texto con que arranca el compositor desde una publicación: su idea y, si hay, lo que dice. */
export function promptDePublicacion(post = {}) {
  const idea = String(post.idea ?? "").trim();
  const titulo = String(post.title ?? "").trim();
  const texto = String(post.descripcion ?? post.script ?? "").trim();
  const partes = [idea || titulo, idea && texto ? `Contexto de la publicación: ${texto.slice(0, 300)}` : ""].filter(Boolean);
  return partes.join("\n\n").slice(0, 1500);
}

/** ¿Es un video de verdad (que se reproduce con <video>) y no una tarjeta animada de prueba? */
export const esVideoReal = (archivo) => String(archivo?.mime ?? "").startsWith("video/");

/** La proporción más cercana, entre las que ofrecen los modelos, a unas medidas. `null` si no se sabe. */
export function proporcionDeMedidas(ancho, alto) {
  if (!(ancho > 0 && alto > 0)) return null;
  const r = ancho / alto;
  const candidatas = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9]];
  return candidatas.reduce((mejor, c) => (Math.abs(c[1] - r) < Math.abs(mejor[1] - r) ? c : mejor))[0];
}

/** Lo que se añade a una publicación al usar un archivo del Estudio. */
export const medioDeArchivo = (a) => ({
  src: a.src, tipo: esVideoReal(a) ? "video" : "imagen", nombre: String(a.prompt ?? "").slice(0, 60),
  ...(a.ancho > 0 && a.alto > 0 ? { ancho: a.ancho, alto: a.alto } : {}),
});

/**
 * Una imagen que ya está en una publicación (`/api/media/clientes/<cliente>/…`) vista como
 * un archivo del Estudio, para usarla de imagen inicial sin pasar por la galería. `null` si
 * no es una ruta del propio cliente: el servidor tampoco la aceptaría.
 */
export function archivoDesdeSrc(src, clienteId, prompt = "") {
  const ruta = String(src ?? "");
  const prefijo = "/api/media/";
  if (!ruta.startsWith(prefijo)) return null;
  let clave;
  try { clave = decodeURIComponent(ruta.slice(prefijo.length).split("?")[0]); } catch { return null; }
  if (!clave.startsWith(`clientes/${clienteId}/`) || clave.includes("..")) return null;
  return { id: `ext:${clave}`, src: ruta, clave, prompt: String(prompt ?? "").slice(0, 200) };
}

/** El nombre de cada ajuste en la pantalla. */
export const ETIQUETA_AJUSTE = Object.freeze({ aspectRatio: "Formato", imageSize: "Tamaño", resolution: "Resolución", duration: "Duración", calidad: "Calidad", formato: "Archivo" });

/** «4 s», «720p», «1K» según el ajuste. */
const VALORES = Object.freeze({ calidad: { high: "Alta (pule en varias pasadas)", low: "Rápida" }, formato: { webp: "WebP (ligero)", png: "PNG", jpeg: "JPEG" } });

export function valorDeAjuste(nombre, valor) {
  if (nombre === "duration") return `${valor} s`;
  return VALORES[nombre]?.[valor] ?? valor;
}

// ------------------------------------------------------------
// Editar una imagen con una indicación sencilla
// ------------------------------------------------------------

/** Atajos de «¿Qué cambio?»: lo que más se pide. */
export const ATAJOS_EDICION = Object.freeze([
  "Quita el texto",
  "Cambia el fondo por uno liso y claro",
  "Más luz, más brillante",
  "Acerca más el producto",
  "Quita los objetos que distraen",
  "Hazla más cálida",
]);

/**
 * El prompt de una edición: lo que la persona pide y la orden de no tocar
 * lo demás. Va tal cual al motor y queda en la galería: lo que se mandó es
 * lo que se ve.
 */
export function promptDeEdicion(instruccion) {
  const pedido = String(instruccion ?? "").trim().replace(/[.\s]+$/, "");
  if (!pedido) return "";
  return `Edita la imagen de referencia: ${pedido}. Conserva todo lo demás exactamente igual: la composición, el encuadre, las personas, el producto, los colores, la luz y cualquier texto o logo que no se pida cambiar.`.slice(0, MAX_PROMPT);
}

/**
 * Con qué modelo se edita: Muse Image si hay llave de Meta (edita y cuesta
 * 0,01 $), si no Nano Banana, si no el primero de imagen con referencias que
 * tenga llave; sin ninguno, la prueba. `activos`: { motor: bool }.
 */
export function modeloParaEditar(activos = {}) {
  const preferidos = ["muse-image", "nano-banana"];
  const con = (m) => m.tipo === "imagen" && m.referencias > 0 && activos[m.motor];
  return preferidos.map((id) => MODELOS.find((m) => m.id === id)).find((m) => m && con(m))
    ?? MODELOS.find((m) => con(m) && m.motor !== "prueba")
    ?? MODELOS.find((m) => m.id === "prueba");
}

/** ¿De qué imagen sale esta edición? El id del archivo original, si se sabe por su trabajo. Pura. */
export function originalDe(archivo, trabajos = [], archivos = []) {
  const t = trabajos.find((x) => x.id === archivo?.trabajoId);
  const clave = t?.medios?.reference?.[0];
  if (!clave || !/^Edita la imagen de referencia:/.test(t.prompt ?? "")) return null;
  return archivos.find((a) => a.clave === clave) ?? null;
}
