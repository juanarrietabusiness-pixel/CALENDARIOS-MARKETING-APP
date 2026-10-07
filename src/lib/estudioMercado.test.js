import { describe, it, expect } from "vitest";
import {
  limpiarCatalogo, catalogoATexto, leerCatalogo, fundirCatalogo, pedidoGeneral, leerGeneral, pedidoDeProducto,
  leerDeProducto, limpiarEstudio, pasosDelEstudio, notasDelEstudio, estudioADocumento, angulosDeAnuncio, ideaDesdeAngulo,
  leerReferencia, notaDeReferencia, fraseActivo, diasActivo, estudioParaElKit, LIMITES_ANUNCIO, MAX_PRODUCTOS,
  productosParaPlan, mensajePedirDatos, lineaDeProducto, fechaLarga,
  pedidoDeReferenciaVideo, limpiarEstructura, estructuraATexto, pedidoDeAdaptacion, leerAdaptacion, ideaParaRecrear, ideaParaSeguirVideo,
  limpiarReferencia, limpiarProducto, fotosDeProducto, fotosDelCatalogo,
} from "./estudioMercado";

const CATALOGO = [
  { id: "p-lavado", nombre: "Lavado de muebles", tipo: "servicio", precio: "Desde $45", oferta: "", paraQuien: "Hogares con niños o mascotas", beneficios: "Quita manchas; seca en 4 horas" },
  { id: "p-alfombras", nombre: "Lavado de alfombras", tipo: "servicio", precio: "$25 el m²", activo: false },
];

const GENERAL = {
  rubro: "Limpieza a domicilio",
  resumen: "Mercado con mucha oferta informal y poca confianza.",
  competidores: [{ nombre: "LimpiaYa", queHacen: "Promos agresivas", fuerte: "Precio", debil: "Puntualidad" }],
  perfiles: [{ nombre: "Mamá ocupada", quien: "Madre que trabaja", dolor: "Manchas de los niños", aspiracion: "Casa limpia sin esfuerzo" }, { nombre: "Dueño de mascota", quien: "Vive con perros", dolor: "Olores", aspiracion: "Sofá como nuevo" }],
  deseos: [{ deseo: "tranquilidad", porque: "Quiere que alguien de confianza entre a su casa" }, { deseo: "Inventado", porque: "x" }, { deseo: "Familia", porque: "Salud de los niños" }],
  nivel: { dominante: "problema", porque: "Saben que el sofá está sucio" },
  propuestaValor: "Muebles como nuevos en un día, en tu casa.",
  fuentes: ["https://ejemplo.com/a", "javascript:alert(1)"],
};

const PRODUCTO = {
  elementos: { cliente: "Familias", dolor: "Manchas", deseo: "Sofá limpio", objeciones: "¿Daña la tela?", alternativas: "Hacerlo uno mismo", diferenciador: "Secado rápido", confianza: "Garantía de satisfacción" },
  objeciones: [{ objecion: "Es caro", respuesta: "Cuesta menos que un sofá nuevo" }],
  pruebas: ["Garantía de satisfacción"],
  ganchos: { inconsciente: "¿Sabes lo que vive en tu sofá?", producto: "Tu sofá como nuevo en 4 horas", decision: "Agenda hoy y paga después" },
  anuncio: { titulo: "Tu sofá como nuevo en 4 horas, garantizado y a domicilio", textoPrincipal: "x".repeat(400), descripcion: "Agenda hoy" },
};

describe("el catálogo", () => {
  it("limpia: sin nombre fuera, ids repetidos cambian, con tope", () => {
    const c = limpiarCatalogo([{ nombre: "" }, { id: "a", nombre: "Uno" }, { id: "a", nombre: "Dos" }, ...Array.from({ length: 40 }, (_, i) => ({ nombre: `P${i}` }))]);
    expect(c[0].id).toBe("a");
    expect(c[1].id).toBe("a-2");
    expect(c).toHaveLength(MAX_PRODUCTOS);
  });

  it("la nota de cifras sólo nombra lo activo y lleva los precios tal cual", () => {
    const t = catalogoATexto(CATALOGO);
    expect(t).toContain("Lavado de muebles (servicio) · precio: Desde $45");
    expect(t).not.toContain("alfombras");
    expect(catalogoATexto([{ nombre: "x", activo: false }])).toBe("");
  });

  it("el inventario: apagado no existe; encendido, agotado fuera del plan y aparte en la nota", () => {
    const cat = [
      { id: "a", nombre: "Sofá", precio: "$400", oferta: "10 % menos", ofertaHasta: "2026-10-15", stock: "bajo", stockNota: "quedan 3", diferenciador: "Tela antimanchas" },
      { id: "b", nombre: "Mesa", precio: "$120", stock: "agotado" },
      { id: "c", nombre: "Silla", precio: "$40", stock: "inventado", ofertaHasta: "mañana" },
    ];
    const limpio = limpiarCatalogo(cat);
    expect(limpio[2]).toMatchObject({ stock: "", ofertaHasta: "" });

    // Apagado: todo sale, sin nada del inventario (ni en el plan ni en lo que lee la IA).
    expect(productosParaPlan(cat, false).map((p) => [p.id, p.stock])).toEqual([["a", ""], ["b", ""], ["c", ""]]);
    const apagado = catalogoATexto(cat);
    expect(apagado).toContain("Mesa");
    expect(apagado).not.toMatch(/válida hasta|antimanchas|disponibilidad|Agotados/);

    // Encendido: lo agotado no entra al plan y la IA sabe que no se anuncia; la nota del stock no viaja.
    expect(productosParaPlan(cat, true).map((p) => p.id)).toEqual(["a", "c"]);
    const t = catalogoATexto(cat, { inventario: true });
    expect(t).toContain("oferta: 10 % menos (válida hasta el 15 de octubre de 2026; en publicaciones posteriores NO se menciona)");
    expect(t).toContain("lo que lo hace distinto: Tela antimanchas");
    expect(t).toContain("disponibilidad: poca");
    expect(t).toContain("Agotados ahora (NO se anuncian ni se ofrecen hasta que vuelvan): Mesa.");
    expect(t).not.toContain("quedan 3");
    expect(lineaDeProducto(limpio[0])).not.toContain("válida hasta");
    expect(fechaLarga("2026-01-05")).toBe("5 de enero de 2026");
    expect(fechaLarga("x")).toBe("");
  });

  it("el mensaje para pedir datos al cliente dice lo que falta y nada más", () => {
    const cat = [{ id: "a", nombre: "Sofá", precio: "", oferta: "2x1" }, { id: "b", nombre: "Mesa", precio: "$120", stock: "medio" }];
    const estudio = { general: { ...GENERAL, faltan: ["Testimonios reales", "¿Hacen envíos?"] }, productos: { a: { ...PRODUCTO, faltan: ["testimonios reales"] } } };
    const m = mensajePedirDatos({ marca: "Dcasa", catalogo: cat, inventario: true, estudio });
    expect(m).toContain("Hola, equipo de Dcasa.");
    expect(m).toContain("• Sofá: precio · ¿cuánto hay disponible? · ¿la oferta «2x1» sigue? ¿hasta cuándo?");
    expect(m).not.toContain("• Mesa");
    expect(m.match(/testimonios reales/gi)).toHaveLength(1);
    expect(m).toContain("• ¿Hacen envíos?");
    const sinInv = mensajePedirDatos({ catalogo: cat });
    expect(sinInv).toContain("• Sofá: precio");
    expect(sinInv).not.toMatch(/disponible|hasta cuándo|inventario/);
  });

  it("lee lo que propone la IA y lo funde sin pisar lo escrito a mano", () => {
    const propuesto = leerCatalogo('Aquí va: {"productos":[{"nombre":"Lavado de muebles","precio":"$99","oferta":"2x1"},{"nombre":"Impermeabilizado","tipo":"servicio","precio":""}]}');
    expect(propuesto).toHaveLength(2);
    const f = fundirCatalogo(CATALOGO, propuesto);
    const lavado = f.find((p) => p.nombre === "Lavado de muebles");
    expect(lavado.precio).toBe("Desde $45");     // lo de la persona manda
    expect(lavado.oferta).toBe("2x1");           // lo vacío se rellena
    expect(lavado.id).toBe("p-lavado");          // conserva su id
    expect(f.map((p) => p.nombre)).toContain("Impermeabilizado");
    expect(leerCatalogo("no hay JSON")).toBeNull();
  });
});

describe("lo general", () => {
  it("el pedido lleva el catálogo, el material y dice si hay búsqueda web", () => {
    const p = pedidoGeneral({ marca: "Dcasa", contexto: "FICHA: x", catalogo: CATALOGO, material: "«Llegaron puntuales»", conWeb: true });
    expect(p).toContain("Tienes búsqueda en internet");
    expect(p).toContain("Lavado de muebles");
    expect(p).not.toContain("alfombras");
    expect(p).toContain("«Llegaron puntuales»");
    expect(pedidoGeneral({ marca: "Dcasa" })).toContain("No tienes búsqueda en internet");
  });

  it("lee: deseos sólo de la lista de Reiss, nivel válido, fuentes sólo http", () => {
    const g = leerGeneral(JSON.stringify(GENERAL));
    expect(g.deseos.map((d) => d.deseo)).toEqual(["Tranquilidad", "Familia"]);
    expect(g.nivel.dominante).toBe("problema");
    expect(g.fuentes).toEqual(["https://ejemplo.com/a"]);
    expect(leerGeneral('{"nada":1}')).toBeNull();
  });
});

describe("cada producto", () => {
  it("el pedido lleva el resumen general y la regla de los ganchos", () => {
    const p = pedidoDeProducto({ marca: "Dcasa", producto: CATALOGO[0], general: GENERAL });
    expect(p).toContain("Lavado de muebles");
    expect(p).toContain("Mamá ocupada");
    expect(p).toContain("por el DOLOR");
  });

  it("lee y recorta los textos de anuncio a lo que admite Meta", () => {
    const e = leerDeProducto(JSON.stringify(PRODUCTO));
    expect(e.anuncio.titulo.length).toBeLessThanOrEqual(LIMITES_ANUNCIO.titulo);
    expect(e.anuncio.textoPrincipal.length).toBeLessThanOrEqual(LIMITES_ANUNCIO.textoPrincipal);
    expect(Object.keys(e.ganchos)).toEqual(["inconsciente", "producto", "decision"]);
    expect(leerDeProducto('{"elementos":{"cliente":"x"}}')).toBeNull();
  });
});

describe("el estudio entero", () => {
  const estudio = limpiarEstudio({ general: GENERAL, productos: { "p-lavado": PRODUCTO, "../malo": PRODUCTO }, conWeb: true });

  it("limpia ids raros y dice qué pasos faltan", () => {
    expect(Object.keys(estudio.productos)).toEqual(["p-lavado"]);
    expect(pasosDelEstudio(CATALOGO, null).map((p) => [p.clave, p.hecho])).toEqual([["general", false], ["p-lavado", false]]);
    expect(pasosDelEstudio(CATALOGO, estudio).every((p) => p.hecho)).toBe(true);
  });

  it("las notas: general, competencia INTERNA y una por producto; la competencia no va en la general", () => {
    const notas = notasDelEstudio(estudio, CATALOGO, { marca: "Dcasa" });
    expect(notas.map((n) => [n.ruta, n.interna])).toEqual([["estudio-de-mercado", false], ["estudio-competencia", true], ["estudio-lavado-de-muebles", false]]);
    expect(notas[0].texto).not.toContain("LimpiaYa");
    expect(notas[1].texto).toContain("LimpiaYa");
    expect(notas[2].texto).toContain("Desde $45");
    expect(notas[2].texto).toContain("## Ganchos por nivel de consciencia");
  });

  it("el documento de Drive escapa lo que viene de la IA", () => {
    const html = estudioADocumento(limpiarEstudio({ ...estudio, general: { ...GENERAL, resumen: "<script>x</script>" } }), CATALOGO, { marca: "Dcasa", fecha: new Date(2026, 9, 6) });
    expect(html).toContain("6 de octubre de 2026");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("los ángulos para el Estudio llevan el precio exacto, y la idea lo pide tal cual", () => {
    const a = angulosDeAnuncio(estudio, CATALOGO);
    expect(a.map((x) => x.nivel)).toEqual(["inconsciente", "producto", "decision"]);
    const idea = ideaDesdeAngulo(a[1]);
    expect(idea).toContain("«Tu sofá como nuevo en 4 horas»");
    expect(idea).toContain("escrito exactamente así: Desde $45");
    expect(estudioParaElKit(estudio)).toContain("Propuesta de valor");
  });
});

describe("las referencias de la competencia", () => {
  it("cuánto lleva activo un anuncio", () => {
    expect(diasActivo("2026-07-01", new Date("2026-10-06T12:00:00Z"))).toBe(97);
    expect(fraseActivo("2026-07-01", new Date("2026-10-06T12:00:00Z"))).toContain("3 meses");
    expect(fraseActivo("2026-10-01", new Date("2026-10-06T12:00:00Z"))).toContain("aún no dice mucho");
    expect(fraseActivo("ayer")).toBe("");
  });

  it("lee el análisis y lo convierte en nota", () => {
    const a = leerReferencia('{"gancho":"50% hoy","nivel":"decision","deseo":"ahorro","porQueFunciona":"Urgencia","ideaParaNosotros":"Usar la garantía"}');
    expect(a.deseo).toBe("Ahorro");
    const nota = notaDeReferencia({ id: "r1", competidor: "LimpiaYa", desde: "2026-07-01", analisis: a });
    expect(nota).toContain("# Referencia de la competencia: LimpiaYa");
    expect(nota).toContain("- Nivel de consciencia: Listo para comprar");
    expect(leerReferencia("nada")).toBeNull();
  });
});

describe("las referencias de video", () => {
  const ESTRUCTURA = { duracion: 9, tramos: [{ desde: 0, hasta: 2, que: "Cae el jugo" }, { desde: 2, hasta: 7, que: "Limpian" }, { desde: "x", hasta: 1, que: "roto" }, { desde: 7, hasta: 9, que: "" }], camara: "fija" };

  it("el pedido a Gemini dice si es orgánico y pide la estructura", () => {
    const t = pedidoDeReferenciaVideo({ marca: "Dcasa", competidor: "LimpiaYa", origen: "organico" });
    expect(t).toMatch(/^Este video es contenido orgánico \(no pagado\) de la competencia \(LimpiaYa\) de Dcasa/);
    expect(t).toContain('"estructura":{"duracion"');
    expect(t.match(/\{"gancho"/g)).toHaveLength(1);
  });

  it("la estructura se limpia y se cuenta corta", () => {
    const e = limpiarEstructura(ESTRUCTURA);
    expect(e.tramos).toHaveLength(2);
    expect(estructuraATexto(ESTRUCTURA)).toBe("Dura 9 s. 0–2 s: Cae el jugo · 2–7 s: Limpian. Cámara: fija");
    expect(limpiarEstructura({ tramos: [] })).toBeNull();
    expect(estructuraATexto(null)).toBe("");
  });

  it("una referencia guarda si es video y si es orgánica; lo raro, como imagen de anuncio", () => {
    expect(limpiarReferencia({ id: "r1", medio: "video", origen: "organico", analisis: { gancho: "g", estructura: ESTRUCTURA } })).toMatchObject({ medio: "video", origen: "organico" });
    expect(limpiarReferencia({ id: "r1", medio: "gif", origen: "x" })).toMatchObject({ medio: "imagen", origen: "anuncio" });
    expect(limpiarReferencia({ id: "r1", analisis: { gancho: "g", estructura: ESTRUCTURA } }).analisis.estructura.tramos).toHaveLength(2);
  });

  it("adaptar pide la misma forma con el producto exacto, y se lee", () => {
    const ref = { id: "r1", analisis: { gancho: "Derrame", estructura: ESTRUCTURA } };
    const t = pedidoDeAdaptacion({ marca: "Dcasa", referencia: ref, productoLinea: "Sofá (producto) · precio: $400", formato: "carrusel" });
    expect(t).toContain("Escribe un carrusel para Dcasa con la MISMA estructura");
    expect(t).toContain("Estructura: Dura 9 s.");
    expect(t).toContain("precio: $400");
    expect(t).toContain("separado por ---");
    expect(leerAdaptacion('{"titulo":"T","guion":"G","descripcion":"D"}')).toMatchObject({ titulo: "T", guion: "G" });
    expect(leerAdaptacion("{}")).toBeNull();
  });

  it("recrear y seguir un video arman el pedido sin IA, con el producto y sin copiar", () => {
    const ref = { id: "r1", analisis: { gancho: "50% hoy.", formato: "foto de producto con texto encima.", estructura: ESTRUCTURA } };
    const r = ideaParaRecrear(ref, { nombre: "Sofá", precio: "$400" });
    expect(r).toBe("Crea una pieza nueva con la misma composición y el mismo tipo de imagen que la de referencia (foto de producto con texto encima), con Sofá, en los colores de nuestra marca. No copies su texto, su logo ni su marca. El mensaje, con nuestras palabras: 50% hoy. Precio exacto: $400.");
    const v = ideaParaSeguirVideo(ref, null);
    expect(v).toContain("con nuestro producto");
    expect(v).toContain("Estructura: Dura 9 s.");
  });
});

describe("las fotos de un producto", () => {
  it("sólo claves de R2 de un cliente, sin `..`, sin repetir y con tope", () => {
    const fotos = ["clientes/c1/a.jpg", "clientes/c1/a.jpg", "/api/media/clientes/c1/b.jpg", "clientes/c1/../x.jpg", "clientes/c1/c.jpg", "clientes/c1/d.jpg", "clientes/c1/e.jpg", "clientes/c1/f.jpg"];
    expect(fotosDeProducto(fotos)).toEqual(["clientes/c1/a.jpg", "clientes/c1/c.jpg", "clientes/c1/d.jpg", "clientes/c1/e.jpg"]);
    expect(fotosDeProducto("clientes/c1/a.jpg")).toEqual([]);
    expect(limpiarProducto({ nombre: "Sofá" }).fotos).toEqual([]);
  });

  it("la IA no trae fotos, y sólo se ofrecen las de lo activo", () => {
    expect(leerCatalogo('{"productos":[{"nombre":"Sofá","fotos":["clientes/c1/a.jpg"]}]}')[0].fotos).toEqual([]);
    const catalogo = [
      { id: "p-a", nombre: "A", fotos: ["clientes/c1/a.jpg"] },
      { id: "p-b", nombre: "B", fotos: [] },
      { id: "p-c", nombre: "C", activo: false, fotos: ["clientes/c1/c.jpg"] },
    ];
    expect(fotosDelCatalogo(catalogo)).toEqual([{ id: "p-a", nombre: "A", fotos: ["clientes/c1/a.jpg"] }]);
  });
});
