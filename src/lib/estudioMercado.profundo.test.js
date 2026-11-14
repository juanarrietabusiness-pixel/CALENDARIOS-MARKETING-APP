import { describe, it, expect } from "vitest";
import {
  limpiarGeneral, leerGeneral, resumenGeneral, pedidoGeneral, resumenDeReferencias, notasDelEstudio, limpiarEstudio,
  pedidoDeProducto, leerDeProducto, pedidoDeAngulos, leerAngulos, sinGarantiaInventada, estudioConAngulos, notaDeProducto,
  estudioADocumento, MAX_LENGUAJE_ESTUDIO,
} from "./estudioMercado";

// ============================================================
// Lo general más profundo (investigación del curso) y los ángulos de venta por producto. Lo que importa:
//   1. Un estudio de antes (aprobado sin nada de esto) sale IGUAL que entraba: sin claves nuevas.
//   2. Lo que viaja a otras llamadas (el resumen) va CORTO y sin nombrar a la competencia.
//   3. La garantía de un ángulo sólo es real si el estudio tiene alguna prueba: si no, la quita el código.
//   4. «Proponer ángulos» deja la propuesta en el BORRADOR (sin `aprobadoAt`).
// ============================================================

const CATALOGO = [{ id: "p-lavado", nombre: "Lavado de muebles", tipo: "servicio", precio: "Desde $45", beneficios: "Seca en 4 horas" }];

// Un estudio general de ANTES, ya limpio: así se guardaba.
const DE_ANTES = limpiarGeneral({
  rubro: "Limpieza", resumen: "Mucha oferta informal.",
  competidores: [{ nombre: "LimpiaYa", queHacen: "Promos", fuerte: "Precio", debil: "Puntualidad" }],
  perfiles: [{ nombre: "Mamá ocupada", quien: "Trabaja", dolor: "Manchas", aspiracion: "Casa limpia" }],
  deseos: [{ deseo: "Tranquilidad", porque: "Confianza" }], nivel: { dominante: "problema", porque: "x" },
  propuestaValor: "Como nuevo en un día", diferenciadores: ["Rápido"],
});

const PROFUNDO = {
  ...DE_ANTES,
  perfiles: [{ ...DE_ANTES.perfiles[0], trabajo: "Quiero que alguien de confianza limpie para no perder el sábado", intensidad: "alta" }, { nombre: "Otro", intensidad: "muchisima" }],
  problemas: { externos: ["Manchas en el sofá", "Olor a mascota", "Visitas", "Una cuarta de más"], internos: ["Vergüenza ante las visitas"], principal: "El sofá se ve viejo y le da vergüenza" },
  necesidad: { cree: "Un producto que quite manchas", real: "Que alguien lo haga bien una vez" },
  transformacion: { antes: "Tapa el sofá con una manta", despues: "Invita a la familia sin pena" },
  justificacion: "Sale más barato que un sofá nuevo",
  cansados: ["«Como nuevo garantizado» de LimpiaYa", "Fotos de antes y después trucadas"],
  competenciaIndirecta: [{ alternativa: "Hacerlo uno mismo con vinagre", porque: "Es barato" }, { porque: "sin nombre" }],
  anunciosDelRubro: { angulos: ["Precio bajo"], formatos: ["Antes y después"], mensajes: ["Promo del mes"], nadie: ["La salud de los niños", "Cuánto dura el secado"] },
};

describe("lo general, más profundo", () => {
  it("un estudio de antes sale igual: sin claves nuevas y leerlo dos veces da lo mismo", () => {
    expect(Object.keys(DE_ANTES)).not.toEqual(expect.arrayContaining(["problemas"]));
    for (const k of ["problemas", "necesidad", "transformacion", "justificacion", "cansados", "competenciaIndirecta", "anunciosDelRubro"]) {
      expect(DE_ANTES).not.toHaveProperty(k);
    }
    expect(DE_ANTES.perfiles[0]).toEqual({ nombre: "Mamá ocupada", quien: "Trabaja", dolor: "Manchas", aspiracion: "Casa limpia", sesgos: [] });
    expect(limpiarGeneral(DE_ANTES)).toEqual(DE_ANTES);
    // Y su resumen, también como antes (sin las líneas nuevas).
    expect(resumenGeneral(DE_ANTES)).not.toMatch(/Problema principal|Transformación|cansado|casi nadie/);
  });

  it("lo nuevo se limpia con sus topes y queda estable", () => {
    const g = leerGeneral(JSON.stringify(PROFUNDO));
    expect(g.problemas.externos).toHaveLength(3);
    expect(g.problemas.principal).toBe("El sofá se ve viejo y le da vergüenza");
    expect(g.competenciaIndirecta).toEqual([{ alternativa: "Hacerlo uno mismo con vinagre", porque: "Es barato" }]);
    expect(g.anunciosDelRubro.nadie).toEqual(["La salud de los niños", "Cuánto dura el secado"]);
    expect(g.perfiles[0]).toMatchObject({ trabajo: expect.stringContaining("no perder el sábado"), intensidad: "alta" });
    expect(g.perfiles[1]).not.toHaveProperty("intensidad");
    expect(limpiarGeneral(g)).toEqual(g);
    // Lo vacío no deja la clave: una persona que borra todo lo de un bloque lo quita.
    expect(limpiarGeneral({ ...g, necesidad: { cree: "", real: "" }, cansados: ["", " "] })).not.toHaveProperty("necesidad");
  });

  it("el resumen lleva lo profundo CORTO y sin nombres de la competencia", () => {
    const g = leerGeneral(JSON.stringify(PROFUNDO));
    const r = resumenGeneral(g);
    expect(r).toContain("Problema principal: El sofá se ve viejo y le da vergüenza · por fuera:");
    expect(r).toContain("Cree que necesita: Un producto que quite manchas · necesita de verdad: Que alguien lo haga bien una vez");
    expect(r).toContain("Transformación: Tapa el sofá con una manta → Invita a la familia sin pena");
    expect(r).toContain("En los anuncios del rubro casi nadie: La salud de los niños; Cuánto dura el secado");
    expect(r).toContain("lo contrata para:");
    expect(r).toContain("[alta]");
    const profundo = r.split("\n").filter((l) => /^(Problema principal|Cree que|Transformación|Cómo justifica|Está cansado|Otras formas|En los anuncios)/.test(l));
    expect(profundo).toHaveLength(7);
    expect(profundo.find((l) => l.startsWith("Está cansado"))).toContain("de otra marca");
    // Aunque la IA escriba de más, cada línea tiene su tope: el resumen no crece sin control.
    const enorme = leerGeneral(JSON.stringify({ ...PROFUNDO, problemas: { externos: ["x".repeat(200), "y".repeat(200), "z".repeat(200)], internos: ["w".repeat(200)], principal: "p".repeat(240) }, cansados: Array(4).fill("c".repeat(200)), anunciosDelRubro: { nadie: Array(4).fill("n".repeat(200)) } }));
    const lineas = resumenGeneral(enorme).split("\n").filter((l) => /^(Problema principal|Cree que|Transformación|Cómo justifica|Está cansado|Otras formas|En los anuncios)/.test(l));
    expect(lineas.join("\n").length).toBeLessThan(1700);
  });

  it("la nota general cuenta lo profundo y la competencia directa NO se nombra en ella", () => {
    const e = limpiarEstudio({ general: leerGeneral(JSON.stringify(PROFUNDO)), productos: {} });
    const [general, competencia] = notasDelEstudio(e, CATALOGO, { marca: "Dcasa" });
    expect(general.interna).toBe(false);
    expect(general.texto).toContain("## El problema\nEl principal: El sofá se ve viejo y le da vergüenza\n- Lo que se ve: Manchas en el sofá");
    expect(general.texto).toContain("- Lo que siente: Vergüenza ante las visitas");
    expect(general.texto).toContain("## Otras formas de resolverlo (competencia indirecta)\n- **Hacerlo uno mismo con vinagre**: Es barato");
    expect(general.texto).toContain("- Lo que casi nadie hace (la oportunidad): La salud de los niños; Cuánto dura el secado");
    expect(general.texto).toContain("Lo contrata para: Quiero que alguien de confianza limpie");
    expect(general.texto).not.toContain("LimpiaYa");
    expect(competencia.texto).toContain("LimpiaYa");
  });

  it("el pedido general usa las referencias analizadas (sin el competidor) y el lenguaje del cliente, y pide lo nuevo", () => {
    const referencias = [
      { id: "r1", competidor: "LimpiaYa", medio: "video", origen: "anuncio", desde: "2026-07-01", analisis: { gancho: "¿Tu sofá huele?", angulo: "dolor", formato: "antes y después", nivel: "problema", porQueFunciona: "x" } },
      { id: "r2", competidor: "Otra", analisis: null },
    ];
    expect(resumenDeReferencias(referencias)).toMatch(/^- Video \(anuncio\): gancho: ¿Tu sofá huele\?; ángulo: dolor; formato: antes y después; nivel: Consciente del problema; lleva \d+ meses activo/);
    expect(resumenDeReferencias(referencias)).not.toContain("LimpiaYa");
    expect(resumenDeReferencias([{ id: "r2", analisis: null }])).toBe("");
    const p = pedidoGeneral({ marca: "Dcasa", referencias, lenguaje: "## Lo que celebran · lo dicen 2\n- «quedó como nuevo» (2)" + "x".repeat(4000) });
    expect(p).toContain("ANUNCIOS Y VIDEOS DE LA COMPETENCIA YA ANALIZADOS");
    expect(p).toContain("LO QUE DICEN SUS CLIENTES");
    expect(p).toContain("«quedó como nuevo» (2)");
    expect(p).not.toContain("x".repeat(MAX_LENGUAJE_ESTUDIO + 10));
    for (const campo of ['"problemas":', '"necesidad":', '"transformacion":', '"justificacion":', '"cansados":', '"competenciaIndirecta":', '"anunciosDelRubro":', '"trabajo":', '"intensidad":']) {
      expect(p).toContain(campo);
    }
    // Sin referencias ni lenguaje, esos bloques no salen (y lo del rubro pide decir que falta).
    const sin = pedidoGeneral({ marca: "Dcasa" });
    expect(sin).not.toContain("YA ANALIZADOS");
    expect(sin).not.toContain("LO QUE DICEN SUS CLIENTES");
    expect(sin).toMatch(/déjalo vacío y dilo en «faltan»/);
  });
});

const PRODUCTO_CON_PRUEBAS = {
  elementos: { publico: "Familias", problema: "Manchas", solucion: "Lavado a domicilio", garantia: "Si no sale la mancha, no se cobra" },
  objeciones: [], pruebas: [], ganchos: {}, anuncio: {},
};
const PRODUCTO_SIN_PRUEBAS = { ...PRODUCTO_CON_PRUEBAS, elementos: { publico: "Familias", problema: "Manchas", solucion: "Lavado a domicilio" } };
const ANGULOS = [
  { nombre: "Sin manchas de mascota", problemaExterno: "Pelos y olor", dolor: "Vergüenza", solucion: "Lavado profundo", garantia: "Garantía de 30 días", ganchos: ["El perro ya no huele en el sofá", "Mi sofá olía a perro"], publico: "frio" },
  { nombre: "Sin perder el sábado", solucion: "Seca en 4 horas", ganchos: ["Limpio antes del almuerzo"], publico: "tibio" },
  { nombre: "Más barato que uno nuevo", falsaCreencia: "Lavarlo cuesta lo mismo que cambiarlo", ganchos: ["No lo cambies todavía"] },
];

describe("los ángulos de venta por producto", () => {
  it("el pedido de un producto pide de 3 a 5 ángulos distintos, la garantía sólo real y ganchos sin nada personal de quien lee", () => {
    const p = pedidoDeProducto({ marca: "Dcasa", producto: CATALOGO[0], lenguaje: "- «quedó como nuevo» (2)" });
    expect(p).toMatch(/«angulos»: de 3 a 5 ÁNGULOS DE VENTA distintos y complementarios/);
    expect(p).toMatch(/«garantia» \(SÓLO una garantía o prueba real/);
    expect(p).toMatch(/nada que afirme algo personal de quien lee/);
    expect(p).toContain('"angulos":[{"nombre":"…","problemaExterno":"…","dolor":"…","solucion":"…","diferencial":"…","garantia":"…","objecion":"…","falsaCreencia":"…","ganchos":["…"],"publico":"frio|tibio"}]');
    expect(p).toContain("«quedó como nuevo» (2)");
  });

  it("al leer de la IA, sin ninguna prueba en el estudio la garantía del ángulo es inventada: se quita y se pide", () => {
    const sin = leerDeProducto(JSON.stringify({ ...PRODUCTO_SIN_PRUEBAS, angulos: ANGULOS }));
    expect(sin.angulos).toHaveLength(3);
    expect(sin.angulos[0]).not.toHaveProperty("garantia");
    expect(sin.faltan.at(-1)).toMatch(/garantía o una prueba real/);
    const con = leerDeProducto(JSON.stringify({ ...PRODUCTO_CON_PRUEBAS, angulos: ANGULOS }));
    expect(con.angulos[0].garantia).toBe("Garantía de 30 días");
    expect(con.faltan).toEqual([]);
    // Lo que escribe una persona en el borrador no pasa por la guarda.
    expect(limpiarEstudio({ general: DE_ANTES, productos: { a: { ...PRODUCTO_SIN_PRUEBAS, angulos: ANGULOS } } }).productos.a.angulos[0].garantia).toBe("Garantía de 30 días");
    expect(sinGarantiaInventada(ANGULOS, { pruebas: ["Testimonio de Ana"] }).quitadas).toBe(0);
    // Un producto de antes, sin ángulos, se lee como siempre.
    expect(leerDeProducto(JSON.stringify(PRODUCTO_SIN_PRUEBAS))).not.toHaveProperty("angulos");
  });

  it("«Proponer ángulos» lleva el estudio del producto (sin ángulos) y sólo pide los ángulos; su lectura aplica la guarda", () => {
    const p = pedidoDeAngulos({ marca: "Dcasa", producto: CATALOGO[0], general: DE_ANTES, estudioProducto: { ...PRODUCTO_CON_PRUEBAS, angulos: ANGULOS }, contexto: "FICHA: x" });
    expect(p).toContain("SU ESTUDIO (las 7 maletas");
    expect(p).toContain("Si no sale la mancha, no se cobra");
    expect(p).not.toContain("Ángulos de venta");
    expect(p).toContain("Mamá ocupada");
    expect(p).not.toMatch(/Tienes búsqueda en internet/);
    expect(p.trim().endsWith('"faltan":["…"]}')).toBe(true);
    const r = leerAngulos(`Aquí van: ${JSON.stringify({ angulos: ANGULOS, faltan: ["Testimonios reales"] })}`, { estudioProducto: PRODUCTO_SIN_PRUEBAS });
    expect(r.angulos[0]).not.toHaveProperty("garantia");
    expect(r.faltan).toEqual(["Testimonios reales", expect.stringMatching(/garantía o una prueba real/)]);
    expect(leerAngulos('{"angulos":[]}')).toBeNull();
  });

  it("van al BORRADOR: sin aprobación, con lo que falta sumado sin repetir; sin estudio de ese producto, null", () => {
    const aprobado = limpiarEstudio({ general: DE_ANTES, productos: { "p-lavado": { ...PRODUCTO_CON_PRUEBAS, faltan: ["Testimonios reales"] } }, aprobadoAt: "2026-10-01T00:00:00Z", hechoAt: "2026-09-30T00:00:00Z" });
    const b = estudioConAngulos(aprobado, "p-lavado", { angulos: ANGULOS, faltan: ["testimonios reales", "Fotos del antes"] });
    expect(b).not.toHaveProperty("aprobadoAt");
    expect(b.hechoAt).toBe("2026-09-30T00:00:00Z");
    expect(b.productos["p-lavado"].angulos.map((a) => a.id)).toEqual(["sin-manchas-de-mascota", "sin-perder-el-sabado", "mas-barato-que-uno-nuevo"]);
    expect(b.productos["p-lavado"].faltan).toEqual(["Testimonios reales", "Fotos del antes"]);
    expect(b.general).toEqual(aprobado.general);
    expect(estudioConAngulos(aprobado, "otro", { angulos: ANGULOS })).toBeNull();
  });

  it("la nota del producto y el documento los cuentan; una nota de antes no cambia", () => {
    const nota = notaDeProducto({ ...PRODUCTO_CON_PRUEBAS, angulos: ANGULOS }, CATALOGO[0]);
    expect(nota).toContain("## Ángulos de venta\n\n### Sin manchas de mascota (para quien no conoce la marca)\n- Problema (lo que se ve): Pelos y olor");
    expect(nota).toContain("- Ganchos: «El perro ya no huele en el sofá» · «Mi sofá olía a perro»");
    expect(nota).toContain("### Más barato que uno nuevo\n- La creencia falsa (el mito): Lavarlo cuesta lo mismo que cambiarlo");
    expect(notaDeProducto({ ...PRODUCTO_CON_PRUEBAS, angulos: ANGULOS }, CATALOGO[0], { angulos: false })).not.toContain("Ángulos de venta");
    expect(notaDeProducto(PRODUCTO_CON_PRUEBAS, CATALOGO[0])).not.toContain("Ángulos de venta");
    const html = estudioADocumento(limpiarEstudio({ general: DE_ANTES, productos: { "p-lavado": { ...PRODUCTO_CON_PRUEBAS, angulos: ANGULOS } } }), CATALOGO, { marca: "Dcasa", fecha: new Date(2026, 10, 14) });
    expect(html).toContain("<h3>Sin manchas de mascota (para quien no conoce la marca)</h3>");
  });
});
