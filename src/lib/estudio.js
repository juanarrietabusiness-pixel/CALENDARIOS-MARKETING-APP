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
import { estaVivo, diasQueQuedan } from "./estudioCatalogo";

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
  if (t.estado === "en_marcha") return t.n > 1 ? `Creando la ${hechos + 1} de ${t.n}…` : "Creando la imagen…";
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
  const ext = archivo.mime === "image/jpeg" ? "jpg" : archivo.mime === "image/webp" ? "webp" : archivo.mime === "image/svg+xml" ? "svg" : "png";
  const base = String(archivo.prompt || "imagen").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "imagen";
  return `${base}.${ext}`;
}
