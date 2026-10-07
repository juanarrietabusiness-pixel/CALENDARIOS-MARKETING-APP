// ============================================================
// Google Drive: lo que el navegador y el Worker comparten (puro)
// ============================================================

/**
 * El id de una carpeta a partir de lo que se pegue: el enlace en
 * cualquiera de sus formas —/drive/folders/…, /drive/u/0/folders/…, con
 * ?usp=sharing detrás, ?id=…— o el id a secas. "" si no hay ninguno.
 *
 * Se guarda el id y no el enlace porque el enlace cambia de forma según
 * desde dónde se copie, y el id no.
 */
export function idDeCarpeta(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return "";
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(t) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : "";
}

export const MIME_CARPETA = "application/vnd.google-apps.folder";

/** «imagen», «video», «carpeta» u «otro», según el tipo MIME. */
export function tipoDeArchivo(mime = "") {
  if (mime === MIME_CARPETA) return "carpeta";
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("video/")) return "video";
  return "otro";
}

/** «3,4 MB». */
export function tamanoLegible(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toLocaleString("es-PA", { maximumFractionDigits: 1 })} MB`;
}

/** El enlace para abrir una carpeta en Drive. */
export const enlaceCarpeta = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

// ------------------------------------------------------------
// Guardar las piezas en Drive, por mes y semana
//
// La agencia guarda lo que sale así: `Octubre 2026 / Semana 2 /
// Martes 6 - Semana 2 - 8 am.jpg`, y un carrusel con `- 1`, `- 2`… La
// semana es la FILA de la rejilla (la de la campaña y de «Producir el
// mes»). Lo ya guardado se apunta en la publicación (`guardadoDrive`:
// src → { id, ruta }) y no se sube dos veces; si la pieza cambió de
// archivo, de día o de hora, se sube la nueva y la anterior va a la
// papelera de Drive (se recupera 30 días).
// ------------------------------------------------------------

const MESES_DRIVE = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_DRIVE = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** La semana del mes de una fecha: la fila de la rejilla, de lunes a domingo (como `semanaDelMes`). */
function semanaDe(y, m, d) {
  const desfase = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  return Math.floor((d - 1 + desfase) / 7) + 1;
}

/** «08:00» → «8 am», «13:30» → «1.30 pm», «» → «». Pura. */
export function horaParaNombre(hora) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora ?? "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  const h12 = h % 12 || 12;
  return `${h12}${min ? `.${String(min).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
}

/** Las carpetas de una fecha → ["Octubre 2026", "Semana 2"]. [] si la fecha no vale. Pura. */
export function carpetasDeFecha(fecha) {
  const m = FECHA.exec(String(fecha ?? ""));
  if (!m) return [];
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return [`${MESES_DRIVE[mes - 1]} ${y}`, `Semana ${semanaDe(y, mes, d)}`];
}

/** La extensión de un archivo por su ruta (jpg si no se sabe). */
const extDe = (src) => (/\.([a-z0-9]{2,4})(?:\?|$)/i.exec(String(src ?? ""))?.[1] ?? "jpg").toLowerCase();

/**
 * El nombre de una pieza: «Martes 6 - Semana 2 - 8 am.jpg»; en un carrusel, « - 1», « - 2»…; las historias de un
 * post, « - historia 1». Pura.
 */
export function nombreDePieza({ fecha, hora = "", indice = 0, total = 1, historia = false, src = "" }) {
  const m = FECHA.exec(String(fecha ?? ""));
  if (!m) return "";
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dia = DIAS_DRIVE[new Date(Date.UTC(y, mes - 1, d)).getUTCDay()];
  const partes = [`${dia} ${d}`, `Semana ${semanaDe(y, mes, d)}`, horaParaNombre(hora)].filter(Boolean);
  if (historia) partes.push(`historia ${indice + 1}`);
  else if (total > 1) partes.push(String(indice + 1));
  return `${partes.join(" - ")}.${extDe(src)}`;
}

const srcDe = (m) => (typeof m === "string" ? m : m?.src);
const enLaApp = (src) => typeof src === "string" && src.startsWith("/api/media/clientes/");

/**
 * Qué hay que hacer en Drive con una publicación de un día → { subir: [{ src, carpetas, nombre, reemplaza? }], quitar:
 * [id], guardadas, total }. Sube lo que no está guardado o está guardado en otra ruta (cambió el día o la hora): la
 * copia vieja (`reemplaza`) sólo va a la papelera si la nueva subió. `quitar` es lo guardado de archivos que la
 * publicación ya no tiene. Pura.
 */
export function planDrive(post, fecha) {
  const carpetas = carpetasDeFecha(fecha);
  if (!carpetas.length) return { subir: [], quitar: [], guardadas: 0, total: 0 };
  const medios = (Array.isArray(post?.medios) ? post.medios : []).map(srcDe).filter(enLaApp);
  if (!medios.length && enLaApp(post?.image)) medios.push(post.image);
  const historias = (Array.isArray(post?.historias) ? post.historias : []).map(srcDe).filter(enLaApp);
  const piezas = [
    ...[...new Set(medios)].map((src, i, l) => ({ src, carpetas, nombre: nombreDePieza({ fecha, hora: post?.publishTime, indice: i, total: l.length, src }) })),
    ...[...new Set(historias)].map((src, i) => ({ src, carpetas, nombre: nombreDePieza({ fecha, hora: post?.publishTime, indice: i, historia: true, src }) })),
  ];
  const guardado = post?.guardadoDrive && typeof post.guardadoDrive === "object" ? post.guardadoDrive : {};
  const ruta = (p) => [...p.carpetas, p.nombre].join("/");
  const subir = piezas.filter((p) => guardado[p.src]?.ruta !== ruta(p))
    .map((p) => (guardado[p.src]?.id ? { ...p, reemplaza: guardado[p.src].id } : p));
  const suyas = new Set(piezas.map((p) => p.src));
  const quitar = Object.entries(guardado).filter(([src, g]) => !suyas.has(src) && g?.id).map(([, g]) => g.id);
  return { subir, quitar, guardadas: piezas.length - subir.length, total: piezas.length };
}

/**
 * `guardadoDrive` tras una tanda: lo que sigue valiendo, lo nuevo (`guardados`: [{ src, id, ruta }]) y, de lo que
 * no subió, la copia de antes (no se mandó a la papelera). Lo de archivos que ya no tiene, fuera. Pura.
 */
export function guardadoTras(post, fecha, guardados = []) {
  const { subir } = planDrive(post, fecha);
  const pendientes = new Set(subir.map((p) => p.src));
  const nuevos = new Map(guardados.filter((g) => g?.src && g?.id).map((g) => [g.src, { id: g.id, ruta: g.ruta }]));
  const actuales = new Set([...(post?.medios ?? []), ...(post?.historias ?? [])].map(srcDe).concat(post?.image ? [post.image] : []));
  const salida = {};
  for (const [src, g] of Object.entries(post?.guardadoDrive ?? {})) {
    if (actuales.has(src) && (!pendientes.has(src) || !nuevos.has(src))) salida[src] = g;
  }
  for (const [src, g] of nuevos) salida[src] = g;
  return salida;
}
