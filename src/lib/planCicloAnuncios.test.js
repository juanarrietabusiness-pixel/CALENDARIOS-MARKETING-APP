import { describe, it, expect } from "vitest";
import {
  planDelCiclo, conPiezas, candidatasDelCalendario, guiaDeMontaje, hojasDelPlan, planATextoCiclo, temporadaDelMes,
  textoDeLaPieza, textoDelTotal, textoCalendario, anunciosQueFuncionaron, origenDelAnuncio,
} from "./planCiclo";
import { direccionDelLote, loteDeLaDireccion } from "./lotePauta";

// ============================================================
// El plan de campañas como EL sitio de la estrategia (14 de noviembre): «¿Qué vas a hacer?», el reparto a mano, el
// total del mes con la temporada aparte, las campañas desde hoy, y LOS ANUNCIOS de cada conjunto con sus textos.
// ============================================================

const NEGOCIO = {
  tipo: "productos", destino: "whatsapp", cuenta: "historial",
  ticket: { valor: 50, origen: "cliente" }, invertir: { valor: 20, origen: "agencia" }, metaVentas: { valor: 1000, origen: "agencia" },
};
const CATALOGO = [{ id: "sofa", nombre: "Sofá cama", precio: "$450", activo: true }, { id: "mesa", nombre: "Mesa", precio: "$120", activo: true }];
const MALETAS = {
  publico: "Mujeres de 28 a 45 años en Ciudad de Panamá, con casa propia y poder de compra medio alto.",
  problema: "El sofá viejo se hunde y no tienen dónde recibir visitas que se quedan a dormir.",
  solucion: "Un sofá que se abre en cama en diez segundos, con colchón de espuma de alta densidad.",
  diferenciales: "Fabricado en Panamá, tela antimanchas, entrega e instalación gratis en 72 horas.",
  testimonios: "Ana de Costa del Este lo usa a diario desde 2024 y lo recomienda a sus vecinas del edificio.",
  objeciones: "El precio: se paga en tres cuotas sin interés con tarjeta. El tamaño: se mide el espacio antes de entregar.",
  garantia: "Dos años de garantía de estructura y seis meses de tela, se pide por WhatsApp con la factura.",
};
const ESTUDIO = {
  general: { resumen: "Muebles en Panamá.", perfiles: [{ nombre: "Mamá práctica", quien: "Mamás de 30 a 45" }], deseos: [] },
  productos: { sofa: { elementos: MALETAS }, mesa: { elementos: { ...MALETAS, testimonios: "", garantia: "" } } },
};
const plan = (extra = {}) => planDelCiclo({
  negocio: NEGOCIO, manual: {}, mes: "2026-11", calendario: null, kit: { tiposArte: ["producto", "testimonio"] }, estudio: ESTUDIO,
  catalogo: CATALOGO, cliente: { nombre: "Dcasa", rubro: "Muebles" }, ...extra,
});

describe("¿Qué vas a hacer?, el reparto a mano, el total y desde hoy", () => {
  it("el reparto a mano del cliente manda sobre el del Manual y se dice; uno que no suma 100 no vale", () => {
    const p = plan({ reparto: JSON.stringify({ presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 }) });
    expect(p.campanas.map((c) => c.presupuesto.mensual)).toEqual([140, 20, 20, 20]);
    expect(p).toMatchObject({ repartoAMano: true, repartoBase: { presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 } });
    expect(planATextoCiclo(p)).toMatch(/repartido a mano/);
    const malo = plan({ reparto: { presentacion: 70, evaluacion: 10, conversion: 10, ascension: 0 } });
    expect(malo.repartoAMano).toBe(false);
    expect(malo.campanas.map((c) => c.presupuesto.mensual)).toEqual([120, 40, 20, 20]);
  });

  it("el total del mes enseña el ciclo y la temporada aparte", () => {
    const t = temporadaDelMes({ mes: "2026-11", hoy: "2026-11-06" });
    const p = plan({ temporada: t });
    expect(p.total).toEqual({ ciclo: 200, temporada: 14.63, mes: 214.63 });
    expect(textoDelTotal(p)).toBe("$214.63 en total: $200 del ciclo y $14.63 de la temporada");
    expect(textoDelTotal(plan())).toBe("$200 en total");
    expect(planATextoCiclo(p)).toMatch(/Total del mes: \$214\.63 en total: \$200 del ciclo y \$14\.63 de la temporada/);
  });

  it("un plan del mes en curso arranca hoy; uno de otro mes, el 1", () => {
    expect(plan({ hoy: "2026-11-14" }).campanas[0].calendario.inicio).toBe("2026-11-14");
    expect(plan({ hoy: "2026-10-20" }).campanas[0].calendario.inicio).toBe("2026-11-01");
    expect(textoCalendario(plan({ hoy: "2026-11-14" }).campanas[0])).toBe("Desde el 14 nov · sin fecha de fin");
  });

  it("sólo las campañas escogidas: la inversión se reparte entre ellas y la temporada va aunque el mes no la traiga", () => {
    const p = plan({ ajustes: { que: { campanas: ["conversion", "temporada"] } } });
    expect(p.campanas.map((c) => c.id)).toEqual(["conversion", "temporada"]);
    expect(p.reparto).toEqual([{ etapa: "conversion", nombre: "Conversión", pct: 100 }]);
    expect(p.campanas[0].presupuesto.mensual).toBe(200);
    expect(p.campanas[1].temporada.motivo).toBe("La pidió la agencia");
    expect(p.avisos.some((a) => a.codigo === "algunas")).toBe(true);
    // Escoger sin la temporada la quita aunque el mes la traiga.
    const t = temporadaDelMes({ mes: "2026-11", hoy: "2026-11-06" });
    expect(plan({ temporada: t, ajustes: { que: { campanas: ["presentacion"] } } }).campanas.map((c) => c.id)).toEqual(["presentacion"]);
    // Las hojas que no van dicen por qué.
    expect(hojasDelPlan(p)[0].filas[4][0]).toMatch(/no se escogió/);
  });

  it("los productos: el foco, varios o todo el catálogo; las maletas son de los escogidos", () => {
    const varios = plan({ ajustes: { que: { productos: "varios", productoIds: ["sofa", "mesa"] } } });
    expect(varios.productos.map((p) => p.id)).toEqual(["sofa", "mesa"]);
    expect(varios.maletas.map((m) => m.productoId)).toEqual(["mesa"]);
    expect(plan({ ajustes: { que: { productos: "todos" } } }).productos).toEqual([]);
    expect(plan({ ajustes: { que: { productos: "foco", productoIds: ["mesa"] } } }).foco).toEqual({ id: "mesa", nombre: "Mesa" });
    expect(plan({ ajustes: { que: { productos: "varios" } } }).avisos.some((a) => a.codigo === "sin-productos")).toBe(true);
  });

  it("cada campaña dice para qué sirve y en qué nivel se escribe cada anuncio (la regla de 100)", () => {
    const [pre, eva, con, asc] = plan().campanas;
    expect(pre.para).toMatch(/no te conoce/);
    expect(pre.nivelesAnuncios).toEqual(["inconsciente", "problema", "solucion", "inconsciente"]);
    expect(eva.nivelesAnuncios).toEqual(["solucion", "producto", "solucion", "solucion"]);
    expect(con.nivelesAnuncios.every((n) => n === "producto" || n === "decision")).toBe(true);
    expect(con.nivelesAnuncios[0]).toBe("producto");
    expect(asc.nivelesAnuncios).toEqual(["decision", "decision", "decision"]);
  });
});

describe("los anuncios: lo que ya funcionó, lo escogido a mano y sus textos", () => {
  const post = (id, extra = {}) => ({ id, format: "post", title: `Pieza ${id}`, descripcion: "¿Tu sofá se hunde? El sofá cama que se abre en diez segundos. Escríbenos por WhatsApp y te asesoramos.", ...extra });
  const calendarios = [
    { id: "cal-11", year: 2026, month: 10, days: [
      { date: "2026-11-02", posts: [post("p1", { status: "published", composicion: "heroe", productoId: "sofa" })] },
      { date: "2026-11-09", posts: [post("p7", { composicion: "macro", productoId: "mesa" })] },
      { date: "2026-11-10", posts: [post("p8", { pauta: { etapa: "presentacion" }, composicion: "uso", productoId: "mesa" })] },
    ] },
    // Un mes viejo que se lee sólo por un anuncio que ya funcionó.
    { id: "cal-06", year: 2026, month: 5, soloClaves: new Set(["cal-06|v1"]), days: [
      { date: "2026-06-03", posts: [post("v1", { status: "published", composicion: "cenital", productoId: "sofa" }), post("v2", { status: "published" })] },
    ] },
  ];
  const cola = [
    { calendar_id: "cal-11", post_id: "p1", red: "instagram", estado: "publicada", variante: "post", externo_id: "ig1", enlace: "https://www.instagram.com/p/AAA/" },
    { calendar_id: "cal-06", post_id: "v1", red: "instagram", estado: "publicada", variante: "post", externo_id: "igv", enlace: "https://www.instagram.com/p/VVV/" },
  ];
  const enPauta = {
    referencia: 1.5,
    publicaciones: {
      "cal-06|v1": { calendarId: "cal-06", postId: "v1", etapa: "evaluacion", activo: false, nombreResultado: "conversaciones", d30: { gasto: 40, resultados: 50, costo: 0.8 } },
      "cal-11|p1": { calendarId: "cal-11", postId: "p1", etapa: "presentacion", activo: true, d30: { gasto: 30, resultados: 10, costo: 3 } },
    },
  };
  // La cuenta: p1 rinde 3,6× su mediana (lo publicado que mejor funcionó).
  const metricas = [
    { id: "m1", cuenta_id: "cta", red: "instagram", externo_id: "ig1", interacciones: 40 },
    { id: "m2", cuenta_id: "cta", red: "instagram", externo_id: "x2", interacciones: 11 },
    { id: "m3", cuenta_id: "cta", red: "instagram", externo_id: "x3", interacciones: 12 },
    { id: "m4", cuenta_id: "cta", red: "instagram", externo_id: "x4", interacciones: 10 },
    { id: "m5", cuenta_id: "cta", red: "instagram", externo_id: "x5", interacciones: 8 },
  ];
  const funcionaron = anunciosQueFuncionaron(enPauta);
  const cands = (incluir = []) => candidatasDelCalendario({ calendarios, cola, metricas, destino: "whatsapp", incluir: new Set(["cal-06|v1", ...incluir]) });

  it("lo que ya funcionó como anuncio (dentro del número mágico) va primero en su etapa, aunque sea de un mes viejo", () => {
    expect(funcionaron).toEqual([{ clave: "cal-06|v1", etapa: "evaluacion", costo: 0.8, resultados: 50, nombreResultado: "conversaciones", activo: false }]);
    const p = conPiezas(plan(), cands(), { hoy: "2026-11-06", funcionaron });
    const eva = p.campanas.find((c) => c.id === "evaluacion");
    expect(eva.anuncios[0]).toMatchObject({ n: 1, slot: "evaluacion:a1", origen: "funciono", como: "publicacion", funciono: { costo: 0.8 } });
    expect(origenDelAnuncio(eva.anuncios[0])).toBe("Ya funcionó como anuncio: $0.80 por conversación en 30 días");
    // v2, del mismo mes viejo, no entra (sólo se leyó v1).
    expect(cands().some((x) => x.postId === "v2")).toBe(false);
    // Sin número mágico, hacen falta 3 resultados.
    expect(anunciosQueFuncionaron({ publicaciones: { "a|b": { calendarId: "a", postId: "b", d30: { resultados: 2, costo: 1 } } } })).toEqual([]);
  });

  it("lo escogido a mano manda en su hueco (una publicación sin publicar ni marcar, o un anuncio nuevo) y el resto se sugiere", () => {
    const elegidos = {
      "presentacion:a2": { pieza: { calendarId: "cal-11", postId: "p7" }, como: "subir", textos: { textos: ["Uno", "Dos", "Tres"], titulos: ["Mesa"], descripcion: "Envío gratis" }, editado: true },
      "presentacion:a4": { nuevo: true },
    };
    const p = conPiezas(plan(), cands(["cal-11|p7"]), { hoy: "2026-11-06", funcionaron, elegidos });
    const pre = p.campanas[0];
    expect(pre.anuncios.map((a) => [a.n, a.origen])).toEqual([[1, "publicada"], [2, "elegido"], [3, "pauta"], [4, "nuevo"]]);
    expect(pre.anuncios[1]).toMatchObject({ pieza: { postId: "p7" }, textosDe: "plan", editado: true, sugerido: false });
    expect(pre.anuncios[3]).toMatchObject({ nuevo: true, pieza: null, como: "subir" });
    expect(textoDeLaPieza(pre.anuncios[3])).toMatch(/Anuncio nuevo/);
    expect(pre.faltan).toBeNull();
    // Una publicación escogida que ya no está: se dice y el hueco vuelve a lo sugerido.
    const perdida = conPiezas(plan(), cands(), { elegidos: { "presentacion:a1": { pieza: { calendarId: "cal-11", postId: "nada" } } } });
    expect(perdida.avisos.some((a) => a.codigo === "escogida-perdida")).toBe(true);
  });

  it("con productos escogidos sólo se sugiere lo de esos productos", () => {
    const p = conPiezas(plan({ ajustes: { que: { productos: "varios", productoIds: ["sofa"] } } }), cands(), { hoy: "2026-11-06", funcionaron });
    expect(p.campanas.flatMap((c) => c.anuncios.map((a) => a.pieza?.postId))).not.toContain("p8");
    expect(conPiezas(plan(), cands(), { hoy: "2026-11-06", funcionaron }).campanas[0].anuncios.map((a) => a.pieza?.postId)).toContain("p8");
  });

  it("con la publicación ya subida, su caption es el texto principal: se enseña, se revisa y faltan título y descripción", () => {
    const p = conPiezas(plan(), cands(), { hoy: "2026-11-06", funcionaron });
    const a = p.campanas[0].anuncios[0];
    expect(a).toMatchObject({ como: "publicacion", puedePublicacion: true });
    expect(a.caption).toMatch(/^¿Tu sofá se hunde\?/);
    expect(a.problemas).toEqual([]);
    expect(p.avisos.find((x) => x.codigo === "faltan-textos").texto).toMatch(/no tienen sus textos/);
    const paso = guiaDeMontaje(p).find((x) => x.id === "presentacion:a1");
    expect(paso.campos.find((f) => f.etiqueta === "Texto principal").valor).toMatch(/^El de la publicación \(no se cambia\): ¿Tu sofá/);
    expect(paso.campos.find((f) => f.etiqueta === "Título").valor).toMatch(/^Falta/);
  });

  it("la guía, el Excel y el texto llevan los textos de cada anuncio, con su botón Copiar", () => {
    const elegidos = { "presentacion:a1": { pieza: { calendarId: "cal-11", postId: "p1" }, como: "publicacion", textos: { titulos: ["El sofá que se abre en 10 s"], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" } } };
    const p = conPiezas(plan(), cands(), { hoy: "2026-11-06", funcionaron, elegidos });
    const paso = guiaDeMontaje(p).find((x) => x.id === "presentacion:a1");
    expect(paso.campos.find((f) => f.etiqueta === "Título")).toMatchObject({ valor: "El sofá que se abre en 10 s", copiar: true });
    expect(paso.campos.find((f) => f.etiqueta === "Descripción")).toMatchObject({ valor: "Envío gratis", copiar: true });
    const textos = hojasDelPlan(p).at(-1);
    expect(textos.nombre).toBe("Textos de los anuncios");
    expect(textos.filas[2]).toEqual(["Campaña", "Conjuntos", "Anuncio", "Publicación", "Cómo se monta", "Nivel", "Ángulo de venta", "Texto principal", "Títulos", "Descripción", "Botón"]);
    const fila = textos.filas.find((f) => f[2] === p.campanas[0].anuncios[0].nombre);
    expect(fila[4]).toBe("Usar la publicación existente");
    expect(fila[7]).toMatch(/^\(El de la publicación, no se cambia\)\n¿Tu sofá/);
    expect(fila.slice(8, 11)).toEqual(["El sofá que se abre en 10 s", "Envío gratis", "Enviar mensaje de WhatsApp"]);
    expect(hojasDelPlan(p)[0].filas[4][9]).toMatch(/textos en la hoja «Textos de los anuncios»/);
    const texto = planATextoCiclo(p);
    expect(texto).toMatch(/Texto principal \(el de la publicación, no se cambia\)/);
    expect(texto).toMatch(/· El sofá que se abre en 10 s/);
  });

  it("lo que falta de presentación se pide repartido por niveles fríos, sin el arte de producto", () => {
    const p = conPiezas(plan(), [], { hoy: "2026-11-06" });
    const faltan = p.campanas[0].faltan;
    expect(faltan).toMatchObject({ n: 4, etapa: "presentacion", niveles: { inconsciente: 2, problema: 1, solucion: 1 } });
    expect(faltan.artes).not.toContain("producto");
    expect(p.campanas[2].faltan.artes).toEqual(p.campanas[2].artes);
    // La dirección del lote lleva los niveles y el lote los lee así.
    const url = direccionDelLote("/cliente/c1/crear/galeria", faltan, "Sin el producto en los fríos.");
    const q = new URLSearchParams(url.split("?")[1]);
    expect(q.get("niveles")).toBe("inconsciente:2,problema:1,solucion:1");
    expect(loteDeLaDireccion(q)).toMatchObject({ pauta: { etapa: "presentacion" }, cuantas: { inconsciente: 2, problema: 1, solucion: 1 } });
    // Uno solo, como antes.
    expect(new URLSearchParams(direccionDelLote("/x", { n: 2, etapa: "conversion", niveles: { producto: 2 } }).split("?")[1]).get("nivel")).toBe("producto");
  });
});
