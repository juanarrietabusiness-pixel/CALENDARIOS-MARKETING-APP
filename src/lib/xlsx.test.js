import { describe, it, expect } from "vitest";
import { crearXlsx, partesXlsx, escaparXml, letraDeColumna, nombreDeHoja } from "./xlsx";
import { leerZip } from "./zip";
import { hojasDelPlan, planDelCiclo, temporadaDelMes, HOJAS_EXCEL } from "./planCiclo";

const dec = new TextDecoder();

/** ¿Está bien formado? Las etiquetas abren y cierran en orden (sin un analizador de XML: Node no trae DOMParser). */
function bienFormado(xml) {
  const pila = [];
  const sinDecl = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  for (const m of sinDecl.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, cierra, nombre, , sola] = m;
    if (sola) continue;
    if (cierra) {
      if (pila.pop() !== nombre) return false;
    } else pila.push(nombre);
  }
  // Ningún «&» suelto ni «<» dentro del texto.
  return pila.length === 0 && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(sinDecl);
}

describe("el XLSX", () => {
  it("es un ZIP con las partes que pide Excel, en carpetas", () => {
    const bytes = crearXlsx([{ nombre: "Uno", filas: [["a", 1]] }, { nombre: "Dos", filas: [] }]);
    const partes = leerZip(bytes).map((p) => p.nombre);
    expect(partes).toEqual([
      "[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml",
      "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml",
    ]);
    for (const p of leerZip(bytes)) expect(bienFormado(dec.decode(p.datos)), p.nombre).toBe(true);
  });

  it("los tipos, el libro y sus relaciones nombran cada hoja", () => {
    const partes = Object.fromEntries(partesXlsx([{ nombre: "Presentación", filas: [] }, { nombre: "Evaluación", filas: [] }]).map((p) => [p.nombre, p.texto]));
    expect(partes["[Content_Types].xml"]).toContain('PartName="/xl/worksheets/sheet2.xml"');
    expect(partes["[Content_Types].xml"]).toContain('PartName="/xl/styles.xml"');
    expect(partes["_rels/.rels"]).toContain('Target="xl/workbook.xml"');
    expect(partes["xl/workbook.xml"]).toContain('<sheet name="Presentación" sheetId="1" r:id="rId1"/>');
    expect(partes["xl/_rels/workbook.xml.rels"]).toContain('Id="rId2"');
    expect(partes["xl/_rels/workbook.xml.rels"]).toContain('Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"');
  });

  it("el texto va como inlineStr escapado, los números como números, y las cabeceras en negrita", () => {
    const [hoja] = partesXlsx([{ nombre: "H", filas: [["Precio", 12.5], ["<b>&", "", null, 3]], cabeceras: [1], combinadas: ["A1:B1", "malo"], anchos: [20, 30] }])
      .filter((p) => p.nombre.startsWith("xl/worksheets/"));
    expect(hoja.texto).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Precio</t></is></c>');
    expect(hoja.texto).toContain('<c r="B1" s="1"><v>12.5</v></c>');
    expect(hoja.texto).toContain("&lt;b&gt;&amp;");
    expect(hoja.texto).toContain('<c r="D2" s="2"><v>3</v></c>');
    expect(hoja.texto).not.toContain('r="B2"');
    expect(hoja.texto).toContain('<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>');
    expect(hoja.texto).toContain('<col min="2" max="2" width="30" customWidth="1"/>');
  });

  it("escapa, quita los caracteres de control y nombra las columnas y las hojas como Excel", () => {
    expect(escaparXml('a "b" <c> & \u0001d')).toBe("a &quot;b&quot; &lt;c&gt; &amp; d");
    expect([0, 25, 26, 27, 701, 702].map(letraDeColumna)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    const usados = new Set();
    expect(nombreDeHoja("Campaña: [especial]/temporada?", usados)).toBe("Campaña especial temporada");
    expect(nombreDeHoja("Campaña especial temporada", usados)).toBe("Campaña especial temporada 2");
    expect(nombreDeHoja("x".repeat(40), new Set())).toHaveLength(31);
  });

  it("el del plan de campañas: las cinco hojas de la agencia, una fila por conjunto, y la de los textos", () => {
    const plan = planDelCiclo({
      negocio: { tipo: "productos", destino: "whatsapp", cuenta: "historial", ticket: { valor: 50 }, invertir: { valor: 20 }, metaVentas: { valor: 1000 } },
      mes: "2026-11", cliente: { nombre: "Dcasa" }, temporada: temporadaDelMes({ mes: "2026-11", hoy: "2026-11-06" }),
    });
    const bytes = crearXlsx(hojasDelPlan(plan));
    const partes = leerZip(bytes);
    const libro = dec.decode(partes.find((p) => p.nombre === "xl/workbook.xml").datos);
    for (const n of Object.values(HOJAS_EXCEL)) expect(libro).toContain(`name="${n}"`);
    const hojas = partes.filter((p) => p.nombre.startsWith("xl/worksheets/")).map((p) => dec.decode(p.datos));
    expect(hojas).toHaveLength(6);
    expect(libro).toContain('name="Textos de los anuncios"');
    expect(hojas[5]).toContain(">Texto principal</t>");
    for (const h of hojas.slice(0, 5)) {
      expect(bienFormado(h)).toBe(true);
      expect(h).toContain(">Objetivo</t>");
      expect(h).toContain(">Presupuesto de la campaña Advantage+</t>");
      expect(h).toContain(">Exclusiones</t>");
      expect(h).toContain(">Anuncio 1</t>");
    }
    // Presentación: tres conjuntos (filas 5, 6 y 7) con su presupuesto diario en la columna E.
    expect(hojas[0]).toContain('<c r="B1" s="2"><v>120</v></c>');
    expect(hojas[0]).toContain('<c r="E7" s="2"><v>1.33</v></c>');
    expect(hojas[0]).not.toContain('<c r="E8"');
    // Lo de la campaña, combinado en sus tres filas (como la hoja de la agencia).
    expect(hojas[0]).toContain('<mergeCell ref="A5:A7"/>');
    // La de temporada lleva su fecha.
    expect(hojas[4]).toContain("Del 20 nov al 30 nov");
  });
});
