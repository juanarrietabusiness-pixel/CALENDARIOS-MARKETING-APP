// ============================================================
// La pestaña Cerebro: lo que decide qué se ve
//
// Todo puro. Los nombres de los tipos, cómo se filtran y ordenan las
// notas, cómo se cuenta lo que hizo una importación o la IA, y cómo se
// lee un documento que se suelta encima.
// ============================================================

/** Cada tipo de nota, como lo ve quien no sabe qué es un «tipo». */
export const TIPOS_VISTA = Object.freeze({
  ficha: { nombre: "Ficha técnica", ayuda: "La tarjeta corta que la IA lee siempre" },
  cifras: { nombre: "Cifras", ayuda: "Precios, plazos y teléfonos vigentes; la IA los lee siempre" },
  marca: { nombre: "Marca", ayuda: "Tono, personas, límites: lo que define a la marca" },
  maquetacion: { nombre: "Maquetación", ayuda: "Plantillas y medidas para pedirle las piezas a Meta AI; no entra en los textos" },
  documento: { nombre: "Documento", ayuda: "Lo importado o subido que no es canon" },
  nota: { nombre: "Nota", ayuda: "Escrita a mano" },
  decision: { nombre: "Decisión", ayuda: "Lo que el cliente aprobó o rechazó, y por qué" },
  borrador: { nombre: "Borrador", ayuda: "Informes de otros sistemas: pesan poco y no salen en los textos" },
});

/** Los filtros por tipo, en el orden en que se ofrecen. */
export const FILTROS_TIPO = Object.freeze(["todas", "ficha", "cifras", "marca", "documento", "nota", "maquetacion", "borrador"]);

export const nombreDeTipo = (tipo) => TIPOS_VISTA[tipo]?.nombre ?? "Nota";

/** Orden de las notas: la ficha y las cifras primero, luego por tipo y por título. */
const PESO = { ficha: 0, cifras: 1, marca: 2, decision: 3, documento: 4, nota: 5, maquetacion: 6, borrador: 7 };
export function ordenarNotas(notas) {
  return [...notas].sort((a, b) => (PESO[a.tipo] ?? 9) - (PESO[b.tipo] ?? 9) || a.titulo.localeCompare(b.titulo, "es"));
}

const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Filtra por tipo, por «sólo internas» y por lo que se escriba en el cuadro (título o resumen). */
export function filtrarNotas(notas, { tipo = "todas", soloInternas = false, texto = "" } = {}) {
  const q = sinTildes(texto).trim();
  return notas.filter((n) => {
    if (tipo !== "todas" && n.tipo !== tipo) return false;
    if (soloInternas && !n.interna) return false;
    if (q && !sinTildes(`${n.titulo} ${n.resumen ?? ""}`).includes(q)) return false;
    return true;
  });
}

/** Cuántas notas hay de cada tipo, para los números de los filtros. */
export function contarPorTipo(notas) {
  const c = { todas: notas.length };
  for (const n of notas) c[n.tipo] = (c[n.tipo] ?? 0) + 1;
  return c;
}

/** 3 541 → «3,5 mil»; 126 975 → «127 mil»; 800 → «800». */
export function formatoCaracteres(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  const k = v / 1000;
  return `${(k >= 100 ? Math.round(k) : Math.round(k * 10) / 10).toLocaleString("es")} mil`;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Lo que hizo una importación, en frases. → { texto, detalles: [{ titulo, lista }] }
 * `detalles` son las notas que la pantalla debe enseñar a la agencia: las
 * que se marcaron internas solas y las que hay que revisar.
 */
export function describirImportacion(r) {
  const a = r?.archivos ?? {};
  const n = r?.notas ?? {};
  const partes = [];
  if (n.creadas) partes.push(`${plural(n.creadas, "nota creada", "notas creadas")} de ${plural((a.nuevos ?? 0) + (a.actualizados ?? 0), "archivo", "archivos")}`);
  if (n.reemplazadas) partes.push(`${plural(n.reemplazadas, "nota renovada", "notas renovadas")}`);
  if (n.conservadas) partes.push(`${plural(n.conservadas, "corregida a mano se conservó", "corregidas a mano se conservaron")}`);
  if (a.iguales) partes.push(`${plural(a.iguales, "archivo sin cambios", "archivos sin cambios")}`);
  if (a.cambiados) partes.push(`${plural(a.cambiados, "archivo cambió", "archivos cambiaron")} en el repositorio (usa «Actualizar lo que cambió» para traerlos)`);
  if (a.omitidos) partes.push(`${plural(a.omitidos, "archivo quedó", "archivos quedaron")} para la siguiente vuelta: vuelve a pulsar el botón`);
  if (a.fallidos) partes.push(`${plural(a.fallidos, "archivo no se pudo leer", "archivos no se pudieron leer")}`);
  const detalles = [];
  if (r?.internas?.length) detalles.push({ titulo: "Marcadas como internas (no salen en los textos que se publican)", lista: r.internas });
  if (r?.revisar?.length) detalles.push({ titulo: "Mencionan algo interno: revisa si alguna debe marcarse", lista: r.revisar });
  return { texto: partes.length ? `${partes.join(". ")}.` : "No había nada nuevo que traer.", detalles };
}

/** Lo que hizo la pasada de IA, en una frase. */
export function describirFicha(r) {
  const ficha = { creada: "Ficha técnica escrita", reemplazada: "Ficha técnica renovada", conservada: "La ficha técnica tiene cambios tuyos: se conservó" }[r?.ficha] ?? "";
  const cifras = { creada: "cifras escritas", reemplazada: "cifras renovadas", conservada: "las cifras tienen cambios tuyos: se conservaron", vacia: "no había cifras claras que anotar" }[r?.cifras] ?? "";
  const extra = [];
  if (r?.leidas) extra.push(`leyó ${plural(r.leidas, "nota", "notas")}`);
  if (r?.fuera?.length) extra.push(`${plural(r.fuera.length, "no cupo", "no cupieron")}`);
  if (r?.aviso) extra.push(r.aviso);
  return `${[ficha, cifras].filter(Boolean).join("; ")}${extra.length ? ` (${extra.join("; ")})` : ""}.`;
}

// ------------------------------------------------------------
// Documentos que se sueltan
// ------------------------------------------------------------

const MAX_CARACTERES = 200_000;
const TEXTO = /\.(md|markdown|txt|csv|json)$/i;
const CON_LIBRERIA = /\.(pdf|docx?|xlsx?|pptx?)$/i;

/** Un nombre de archivo como título: «precios-2026_v2.md» → «Precios 2026 v2». */
export function tituloDeDocumento(nombre) {
  const t = String(nombre ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "Documento";
}

/** ¿Se puede leer este archivo como nota? → { ok: true } o { ok: false, motivo }. */
export function validarDocumento(nombre, tamano) {
  if (CON_LIBRERIA.test(nombre)) {
    return { ok: false, motivo: `«${nombre}»: los PDF, Word y Excel llegan más adelante. Por ahora, pega su texto en una nota o sube un .md, .txt o .csv.` };
  }
  if (!TEXTO.test(nombre)) return { ok: false, motivo: `«${nombre}»: sólo se leen archivos .md, .txt, .csv y .json.` };
  if (tamano > MAX_CARACTERES * 4) return { ok: false, motivo: `«${nombre}» es demasiado grande. Pártelo en varios.` };
  return { ok: true };
}

/** El texto de un archivo como cuerpo de nota, o el motivo por el que no vale. Puro salvo por `file.text()`. */
export async function leerDocumento(file) {
  const v = validarDocumento(file.name, file.size);
  if (!v.ok) return { error: v.motivo };
  const texto = (await file.text()).replace(/\r\n?/g, "\n").trim();
  if (!texto) return { error: `«${file.name}» está vacío.` };
  if (texto.length > MAX_CARACTERES) return { error: `«${file.name}» pasa de ${MAX_CARACTERES.toLocaleString("es")} caracteres. Pártelo en varios.` };
  return { nota: { titulo: tituloDeDocumento(file.name), texto, tipo: "documento", origen: "documento", fuente: file.name } };
}
