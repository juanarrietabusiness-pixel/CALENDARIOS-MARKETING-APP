// ============================================================
// Un XLSX hecho en el navegador, sin librería (puro)
//
// Un .xlsx es un ZIP de XML (SpreadsheetML). Lo mínimo que abren Excel, Numbers, LibreOffice y Google Sheets:
// `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/styles.xml` y una
// `xl/worksheets/sheetN.xml` por hoja. El texto va como `inlineStr` (sin la tabla de cadenas compartidas, que sólo
// ahorra espacio) y los números como números. Tres estilos: normal con ajuste de línea, la cabecera (negrita sobre gris)
// y el número con dos decimales. El ZIP es el de lib/zip.js, sin comprimir: una hoja de un plan pesa unos kB.
//
// Una librería de hojas de cálculo son cientos de kB; esto, dos. Lo usa «Descargar el Excel» del plan de campañas.
// ============================================================

import { crearZip } from "./zip.js";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const TIPO_HOJA = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
/** El tipo del archivo, para el Blob y la descarga. */
export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Lo que Excel admite en una celda. */
const MAX_CELDA = 32_767;

/** Escapa para XML, y quita los caracteres de control que Excel rechaza (con ellos, «el archivo está dañado»). Pura. */
export function escaparXml(t) {
  return String(t ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** La letra de una columna (0 → A, 25 → Z, 26 → AA). Pura. */
export function letraDeColumna(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * El nombre de una hoja, como Excel lo admite: sin `[]:*?/\`, sin comillas simples al borde, de 1 a 31 caracteres y
 * sin repetirse (`usados`). Pura.
 */
export function nombreDeHoja(nombre, usados = new Set()) {
  let base = String(nombre ?? "").replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").slice(0, 31) || "Hoja";
  let n = 2;
  let salida = base;
  while (usados.has(salida.toLowerCase())) {
    const sufijo = ` ${n++}`;
    salida = `${base.slice(0, 31 - sufijo.length)}${sufijo}`;
  }
  usados.add(salida.toLowerCase());
  base = salida;
  return base;
}

const esNumero = (v) => typeof v === "number" && Number.isFinite(v);

function celda(v, ref, { cabecera = false } = {}) {
  if (v === null || v === undefined || v === "") return "";
  if (esNumero(v)) return `<c r="${ref}" s="${cabecera ? 1 : 2}"><v>${v}</v></c>`;
  const texto = escaparXml(String(v).slice(0, MAX_CELDA));
  // `xml:space` para que los saltos y los espacios del borde no se pierdan.
  return `<c r="${ref}" t="inlineStr" s="${cabecera ? 1 : 0}"><is><t xml:space="preserve">${texto}</t></is></c>`;
}

/** Una hoja: { filas: [[celda]], combinadas?: ["A3:B3"], anchos?: [n], cabeceras?: [n.º de fila, desde 1] }. */
function hojaXml({ filas = [], combinadas = [], anchos = [], cabeceras = [] }) {
  const enNegrita = new Set(cabeceras);
  const cols = anchos.length
    ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(4, Math.min(120, Number(w) || 12))}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const datos = filas.map((fila, i) => {
    const r = i + 1;
    const celdas = (fila ?? []).map((v, j) => celda(v, `${letraDeColumna(j)}${r}`, { cabecera: enNegrita.has(r) })).join("");
    return celdas ? `<row r="${r}">${celdas}</row>` : `<row r="${r}"/>`;
  }).join("");
  const unidas = combinadas.filter((x) => /^[A-Z]+\d+:[A-Z]+\d+$/.test(x));
  return `${XML}<worksheet xmlns="${NS}" xmlns:r="${NS_R}">` +
    `<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}` +
    `<sheetData>${datos}</sheetData>` +
    (unidas.length ? `<mergeCells count="${unidas.length}">${unidas.map((x) => `<mergeCell ref="${x}"/>`).join("")}</mergeCells>` : "") +
    "</worksheet>";
}

const ESTILOS = `${XML}<styleSheet xmlns="${NS}">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE7EAF0"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

/**
 * Las partes del XLSX, como [{ nombre, texto }] (en el orden en que van en el ZIP). `hojas`: [{ nombre, filas,
 * combinadas?, anchos?, cabeceras? }]. Pura (la usan `crearXlsx` y los tests).
 */
export function partesXlsx(hojas = []) {
  const usados = new Set();
  const lista = (hojas.length ? hojas : [{ nombre: "Hoja", filas: [] }]).map((h, i) => ({ ...h, n: i + 1, nombre: nombreDeHoja(h.nombre, usados) }));
  const contentTypes = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    lista.map((h) => `<Override PartName="/xl/worksheets/sheet${h.n}.xml" ContentType="${TIPO_HOJA}"/>`).join("") +
    "</Types>";
  const rels = `${XML}<Relationships xmlns="${NS_PKG}">` +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
  const workbook = `${XML}<workbook xmlns="${NS}" xmlns:r="${NS_R}"><bookViews><workbookView/></bookViews><sheets>` +
    lista.map((h) => `<sheet name="${escaparXml(h.nombre)}" sheetId="${h.n}" r:id="rId${h.n}"/>`).join("") +
    "</sheets></workbook>";
  const workbookRels = `${XML}<Relationships xmlns="${NS_PKG}">` +
    lista.map((h) => `<Relationship Id="rId${h.n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${h.n}.xml"/>`).join("") +
    `<Relationship Id="rId${lista.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";
  return [
    { nombre: "[Content_Types].xml", texto: contentTypes },
    { nombre: "_rels/.rels", texto: rels },
    { nombre: "xl/workbook.xml", texto: workbook },
    { nombre: "xl/_rels/workbook.xml.rels", texto: workbookRels },
    { nombre: "xl/styles.xml", texto: ESTILOS },
    ...lista.map((h) => ({ nombre: `xl/worksheets/sheet${h.n}.xml`, texto: hojaXml(h) })),
  ];
}

/** Los bytes del .xlsx (para un Blob con MIME_XLSX). Pura. */
export function crearXlsx(hojas = [], { fecha = new Date() } = {}) {
  const cod = new TextEncoder();
  return crearZip(partesXlsx(hojas).map((p) => ({ nombre: p.nombre, datos: cod.encode(p.texto) })), { fecha, rutas: true });
}
