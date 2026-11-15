// ============================================================
// La galería del Estudio vista y buscada: lo PURO que comparten la pantalla y el Worker
//
// La pantalla filtra lo que tiene cargado con estas funciones, y el Worker (GET /api/estudio/<c>/galeria?q=) busca
// con LAS MISMAS lo que la pantalla aún no cargó: si fueran dos reglas, una pieza saldría buscando aquí y no allí.
//
// BUSCAR. Antes se buscaba en el pedido ENTERO, que lleva el bloque de la marca (paleta, estilo, «nunca»…): una
// palabra de la paleta casaba con todas las piezas del cliente. Ahora sólo en lo que dice qué ES la pieza: su escena o
// su ficha (`ideaDelPedido`), su título, el texto de la plantilla, el producto, la publicación donde se usa (su día, su
// título), el modelo y la fecha. Sin mayúsculas ni tildes, y cada palabra en cualquier orden.
// ============================================================

import { ideaDelPedido } from "./escenaDelPedido.js";
import { nombreDelModelo } from "./estudioCatalogo.js";

/** Sin mayúsculas ni tildes: «Sofá» = «sofa». Pura. */
export const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIA = 86_400_000;
/** Panamá no cambia de hora: siempre UTC−5. */
const PANAMA = -5 * 3_600_000;

/** «AAAA-MM-DD» de un instante, por sus campos UTC (quien llama ya lo movió a la hora de Panamá). */
const diaUTC = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/** El día de Panamá (YYYY-MM-DD) de una fecha ISO o de un instante en ms; un día se queda. "" si no se entiende. Pura. */
export function diaDePanama(fecha) {
  const t = String(fecha ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const ms = typeof fecha === "number" ? fecha : Date.parse(t);
  return Number.isFinite(ms) ? diaUTC(ms + PANAMA) : "";
}

const sumarDias = (dia, n) => diaUTC(Date.parse(`${dia}T12:00:00Z`) + n * DIA);

/** El lunes (YYYY-MM-DD) de la semana de una fecha, en Panamá. "" si no se entiende. Pura. */
export function lunesDe(fecha) {
  const dia = diaDePanama(fecha);
  if (!dia) return "";
  const dow = (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;
  return sumarDias(dia, -dow);
}

/** «15 nov 2026 noviembre 2026-11-15 15/11»: una fecha como se busca. Pura. */
export function fechaParaBuscar(fecha) {
  const dia = diaDePanama(fecha);
  if (!dia) return "";
  const [y, m, d] = dia.split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1]} ${y} ${MESES[m - 1]} ${dia} ${d}/${m}`;
}

/** El título que una pieza tenga, o la línea «Pieza:» de su ficha. "" si no. Pura. */
export function tituloDeArchivo(a) {
  const propio = a?.ajustes?.titulo ?? a?.ajustes?.nombre;
  if (propio) return String(propio);
  return /^\s*Pieza:\s*(.+)$/m.exec(String(a?.prompt ?? ""))?.[1]?.trim() ?? "";
}

/**
 * Todo lo que se busca de una pieza, ya normalizado: su escena o ficha, el título, el texto puesto encima, el modelo,
 * la fecha, la publicación donde se usa de verdad (su día, su título, su producto) y los productos del catálogo de los
 * que es foto. `productos`: [{ nombre, fotos: [claves] }] (los de GET /api/estudio). Pura.
 */
export function textoDeBusqueda(a, { productos = [] } = {}) {
  const partes = [
    ideaDelPedido(a?.prompt), tituloDeArchivo(a), a?.ajustes?.plantilla?.texto,
    a?.modelo, a?.subido ? "Subida" : nombreDelModelo(a?.modelo),
    fechaParaBuscar(a?.creado),
    ...(a?.usadoEn ?? []).flatMap((u) => [u?.titulo, u?.producto, u?.fecha ? `publicación ${fechaParaBuscar(u.fecha)}` : ""]),
    ...(productos ?? []).filter((p) => (p?.fotos ?? []).includes(a?.clave)).map((p) => p.nombre),
    a?.deLaMarca,
  ];
  return normalizar(partes.filter(Boolean).join("\n"));
}

/** Las palabras de lo escrito en el buscador (sin tildes ni mayúsculas). Pura. */
export const palabrasDeBusqueda = (texto) => normalizar(texto).split(/\s+/).filter(Boolean);

/** ¿La pieza casa con lo escrito? Cada palabra tiene que estar, en cualquier orden. Sin nada escrito, todas. Pura. */
export function coincideConBusqueda(a, texto, opciones = {}) {
  const palabras = palabrasDeBusqueda(texto);
  if (!palabras.length) return true;
  const t = textoDeBusqueda(a, opciones);
  return palabras.every((p) => t.includes(p));
}

// ------------------------------------------------------------
// Forma, fecha y producto: los filtros de la galería
// ------------------------------------------------------------

const RAZONES = { "9:16": 9 / 16, "2:3": 2 / 3, "3:4": 3 / 4, "4:5": 4 / 5, "1:1": 1, "5:4": 5 / 4, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9 };

/**
 * La forma de una pieza: «vertical» (9:16, 2:3), «4:5» (4:5 y 3:4, la del feed), «cuadrada» u «horizontal». Por sus
 * medidas, o por la proporción que se pidió (un video subido no tiene medidas). "" si no se sabe. Pura.
 */
export function formaDe(a) {
  const r = a?.ancho > 0 && a?.alto > 0 ? a.ancho / a.alto : RAZONES[String(a?.ajustes?.aspectRatio ?? "")] ?? 0;
  if (!r) return "";
  if (r < 0.7) return "vertical";
  if (r < 0.9) return "4:5";
  if (r <= 1.12) return "cuadrada";
  return "horizontal";
}

export const FORMAS_GALERIA = [["vertical", "Vertical (9:16)"], ["4:5", "Feed (4:5 y 3:4)"], ["cuadrada", "Cuadrada"], ["horizontal", "Horizontal"]];
export const FECHAS_GALERIA = [["semana", "Esta semana"], ["pasada", "La semana pasada"], ["mes", "Este mes"], ["mes-pasado", "El mes pasado"]];

/** ¿Cae la fecha de la pieza en ese periodo (semanas de lunes a domingo y meses de Panamá)? Pura. */
export function enFecha(a, periodo, ahora = Date.now()) {
  if (!periodo) return true;
  const hoy = diaDePanama(ahora);
  const dia = diaDePanama(a?.creado);
  if (!dia) return false;
  if (periodo === "semana") return lunesDe(dia) === lunesDe(hoy);
  if (periodo === "pasada") return lunesDe(dia) === sumarDias(lunesDe(hoy), -7);
  const mes = diaDePanama(hoy).slice(0, 7);
  if (periodo === "mes") return dia.slice(0, 7) === mes;
  if (periodo === "mes-pasado") return dia.slice(0, 7) === sumarDias(`${mes}-01`, -1).slice(0, 7);
  return true;
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const palabrasEnteras = (texto, nombre) => {
  const n = normalizar(nombre).trim();
  if (n.length < 3) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapar(n)}($|[^\\p{L}\\p{N}])`, "u").test(normalizar(texto));
};

/**
 * ¿Es de ese producto? Una foto suya del catálogo, una pieza de una publicación de ese producto, o una que lo NOMBRA en
 * su escena (palabra entera, sin tildes). `producto`: { id, nombre, fotos }. Pura.
 */
export function esDelProducto(a, producto) {
  if (!producto) return true;
  if ((producto.fotos ?? []).includes(a?.clave)) return true;
  if ((a?.usadoEn ?? []).some((u) => u?.productoId === producto.id || (u?.producto && palabrasEnteras(u.producto, producto.nombre)))) return true;
  return palabrasEnteras(`${ideaDelPedido(a?.prompt)}\n${tituloDeArchivo(a)}`, producto.nombre);
}

// ------------------------------------------------------------
// Las carpetas
// ------------------------------------------------------------

/** La carpeta «Competencia» (la crea el estudio de mercado: lo de otras marcas). Pura. */
export const esCarpetaCompetencia = (c) => normalizar(c?.nombre).trim() === "competencia";

/**
 * Las carpetas que pone la APLICACIÓN, no la persona: las de tipo «auto» (el lote, las variaciones) y, por su nombre, las
 * de antes de que hubiera tipo («Lote …», «Variaciones · …») y la de la competencia. No gastan las 30 de la persona ni
 * llenan la fila de carpetas: van en el desplegable. Pura.
 */
export const esCarpetaAutomatica = (c) => c?.tipo === "auto" || esCarpetaCompetencia(c)
  || (!c?.tipo && /^(lote |variaciones · )/i.test(String(c?.nombre ?? "")));

// ------------------------------------------------------------
// Por semanas
// ------------------------------------------------------------

/** «Esta semana», «La semana pasada», «Semana del 3 nov» (con el año si no es este). Pura. */
export function tituloDeSemana(lunes, ahora = Date.now()) {
  const hoy = lunesDe(ahora);
  if (lunes === hoy) return "Esta semana";
  if (lunes === sumarDias(hoy, -7)) return "La semana pasada";
  const [y, m, d] = String(lunes).split("-").map(Number);
  if (!y) return "Sin fecha";
  return `Semana del ${d} ${MESES_CORTOS[m - 1]}${y !== Number(hoy.slice(0, 4)) ? ` ${y}` : ""}`;
}

/**
 * Las tarjetas de la galería en semanas (de lunes a domingo, Panamá), en el orden en que llegan: [{ clave, titulo,
 * items }]. `fechaDe(item)` da su fecha. Pura.
 */
export function porSemanas(items = [], fechaDe = (x) => x?.creado, ahora = Date.now()) {
  const semanas = new Map();
  for (const x of items) {
    const clave = lunesDe(fechaDe(x)) || "sin-fecha";
    if (!semanas.has(clave)) semanas.set(clave, { clave, titulo: clave === "sin-fecha" ? "Sin fecha" : tituloDeSemana(clave, ahora), items: [] });
    semanas.get(clave).items.push(x);
  }
  return [...semanas.values()];
}
