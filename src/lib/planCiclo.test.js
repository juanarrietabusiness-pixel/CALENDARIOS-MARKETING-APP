import { describe, it, expect } from "vitest";
import {
  planDelCiclo, conPiezas, candidatasDelCalendario, guiaDeMontaje, hojasDelPlan, planATextoCiclo, temporadaDelMes,
  conjuntosDeEtapa, repartoDelPlan, plantillaConEtapa, tipoArteDePost, limpiarProgreso, avanceDeGuia, textoDeLaPieza,
  PUBLICOS_CICLO, HOJAS_EXCEL, DIAS_DEL_MES, PCT_TEMPORADA,
} from "./planCiclo";
import { limpiarManualCiclo, limpiarReparto, limpiarAnunciosPorConjunto, sumaDelReparto, errorDelCiclo, REPARTO_POR_DEFECTO } from "./manualCiclo";
import { limpiarManual, nombreConPlantilla, NOMENCLATURA_POR_DEFECTO } from "./estratega";
import { idEtapaCiclo } from "./cicloVentas";

// La meta de 1.000 $ al 20 %: 200 $ de inversión al mes (la calculadora de presupuesto del curso).
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
  general: { resumen: "Muebles en Panamá.", perfiles: [{ nombre: "Mamá práctica", quien: "Mamás de 30 a 45" }, { nombre: "Pareja joven", quien: "Parejas que estrenan casa" }], deseos: [] },
  productos: { sofa: { elementos: MALETAS }, mesa: { elementos: { ...MALETAS, testimonios: "", garantia: "" } } },
};

const plan = (extra = {}) => planDelCiclo({
  negocio: NEGOCIO, manual: {}, mes: "2026-11", calendario: null, kit: { tiposArte: ["producto", "testimonio"] }, estudio: ESTUDIO,
  catalogo: CATALOGO, cliente: { nombre: "Dcasa", rubro: "Muebles" }, ...extra,
});

describe("el Manual del plan", () => {
  it("el reparto suma 100 o vale el de la casa (60/20/10/10)", () => {
    expect(REPARTO_POR_DEFECTO).toEqual({ presentacion: 60, evaluacion: 20, conversion: 10, ascension: 10 });
    expect(limpiarReparto({ presentacion: 70, evaluacion: 20, conversion: 5, ascension: 5 })).toEqual({ presentacion: 70, evaluacion: 20, conversion: 5, ascension: 5 });
    expect(limpiarReparto({ presentacion: 70, evaluacion: 20, conversion: 5, ascension: 0 })).toEqual(REPARTO_POR_DEFECTO); // suma 95
    expect(limpiarReparto({ presentacion: 0, evaluacion: 50, conversion: 25, ascension: 25 })).toEqual(REPARTO_POR_DEFECTO); // sin presentación
    expect(limpiarReparto({ presentacion: "60", evaluacion: "20", conversion: "10", ascension: "10" })).toEqual(REPARTO_POR_DEFECTO);
    expect(limpiarReparto(null)).toEqual(REPARTO_POR_DEFECTO);
    expect(sumaDelReparto({ presentacion: 50, evaluacion: 20 })).toBe(70);
    // Lo que el Manual no deja guardar.
    expect(errorDelCiclo({ reparto: { presentacion: 50, evaluacion: 20, conversion: 10, ascension: 10 } })).toMatch(/suma 90 %/);
    expect(errorDelCiclo({ reparto: { presentacion: 0, evaluacion: 50, conversion: 25, ascension: 25 } })).toMatch(/Presentación/);
    expect(errorDelCiclo({ reparto: REPARTO_POR_DEFECTO })).toBe("");
    expect(errorDelCiclo({})).toBe("");
  });

  it("de 4 a 6 anuncios por conjunto, 4 por defecto", () => {
    expect(limpiarAnunciosPorConjunto(6)).toBe(6);
    expect(limpiarAnunciosPorConjunto("5")).toBe(5);
    expect(limpiarAnunciosPorConjunto(9)).toBe(4);
    expect(limpiarAnunciosPorConjunto(undefined)).toBe(4);
    expect(limpiarManualCiclo({ anunciosPorConjunto: 5 })).toEqual({ reparto: REPARTO_POR_DEFECTO, anunciosPorConjunto: 5 });
    // limpiarManual los lleva (en una línea, desde manualCiclo.js).
    expect(limpiarManual({ reparto: { presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 } }).reparto.presentacion).toBe(70);
  });

  it("la nomenclatura por defecto lleva {etapa}, y un Manual de antes sin ella la recibe detrás del cliente", () => {
    expect(NOMENCLATURA_POR_DEFECTO.campana).toContain("{etapa}");
    expect(nombreConPlantilla(NOMENCLATURA_POR_DEFECTO.campana, { cliente: "Dcasa", etapa: "Presentación", objetivo: "Interacción WhatsApp", mes: "Noviembre 2026" }))
      .toBe("Dcasa · Presentación · Interacción WhatsApp · Noviembre 2026");
    expect(plantillaConEtapa("{cliente} · {objetivo} · {producto} · {mes}")).toBe("{cliente} · {etapa} · {objetivo} · {producto} · {mes}");
    expect(plantillaConEtapa("{objetivo} | {mes}")).toBe("{etapa} · {objetivo} | {mes}");
  });
});

describe("el plan del ciclo", () => {
  it("con historial: las cuatro campañas con el reparto 60/20/10/10 de 200 $ y su presupuesto donde va", () => {
    const p = plan();
    expect(p.campanas.map((c) => c.id)).toEqual(["presentacion", "evaluacion", "conversion", "ascension"]);
    expect(p.inversion).toBe(200);
    expect(p.inversionDe).toBe("meta");
    expect(p.campanas.map((c) => c.presupuesto.mensual)).toEqual([120, 40, 20, 20]);
    const [pre, eva, con, asc] = p.campanas;
    // Presentación: en cada conjunto (3), 120 / 30 / 3 = 1,33 al día.
    expect(pre.presupuesto).toMatchObject({ en: "conjunto", diario: 4, porConjunto: 1.33, dias: DIAS_DEL_MES });
    expect(pre.conjuntos.map((x) => x.tipo)).toEqual(["intereses", "similares", "advantage"]);
    expect(pre.conjuntos.every((x) => x.presupuestoDiario === 1.33)).toBe(true);
    // Evaluación y ascensión: el presupuesto en la campaña (Advantage+), sin presupuesto por conjunto.
    expect(eva.presupuesto).toMatchObject({ en: "campana", diario: 1.33, porConjunto: null });
    expect(asc.presupuesto.en).toBe("campana");
    // Conversión también en la campaña, como su hoja del Excel de la agencia (la columna C, del grupo de la campaña).
    expect(con.presupuesto.en).toBe("campana");
    // Advantage+ nunca en evaluación ni en ascensión.
    expect(eva.conjuntos.some((x) => x.publico.advantage)).toBe(false);
    expect(asc.conjuntos.some((x) => x.publico.advantage)).toBe(false);
    expect(eva.conjuntos.map((x) => x.publico.publicos)).toEqual([["interaccion-30"], ["interaccion-90"]]);
    expect(eva.conjuntos[0].excluye.publicos).toEqual(["mensajes-30", "clientes"]);
    expect(con.conjuntos[0].publico.publicos).toEqual(["mensajes-30"]);
    expect(asc.conjuntos[0].publico.publicos).toEqual(["clientes"]);
    // Objetivo de interacción a WhatsApp, maximizar conversaciones, ubicaciones Advantage+.
    expect(pre).toMatchObject({ objetivo: "interaccion", appMensajes: "WhatsApp", rendimiento: "Maximizar el número de conversaciones", ubicaciones: "Advantage+ (automáticas)" });
    expect(pre.anunciosPorConjunto).toBe(4);
    // Los nombres llevan la etapa (así la revisión de lo que corre la reconoce).
    expect(pre.nombre).toBe("Dcasa · Presentación · Interacción WhatsApp · Noviembre 2026");
    expect(idEtapaCiclo(eva.nombre.split(" · ")[1])).toBe("evaluacion");
    expect(pre.conjuntos[0].nombre).toBe("Intereses · Mamá práctica · 30-45");
    // Los de quien ya interactuó van sin edad en el nombre (abierta).
    expect(eva.conjuntos[0].nombre).toBe("Interactuaron · 30 días");
    // Los públicos a crear, sin los de la web.
    expect(p.publicos.map((x) => x.id)).toEqual(["interaccion-30", "interaccion-90", "mensajes-30", "clientes", "similares-1"]);
  });

  it("cuenta nueva: presentación y evaluación, 75/25, dos de intereses (uno por perfil) y Advantage+ sólo de prueba", () => {
    const p = plan({ negocio: { ...NEGOCIO, cuenta: "nueva" } });
    expect(p.campanas.map((c) => c.id)).toEqual(["presentacion", "evaluacion"]);
    expect(p.reparto.map((r) => r.pct)).toEqual([75, 25]);
    expect(p.campanas.map((c) => c.presupuesto.mensual)).toEqual([150, 50]);
    const pre = p.campanas[0];
    expect(pre.conjuntos.map((x) => x.nombreCorto)).toEqual(["Intereses · Mamá práctica", "Intereses · Pareja joven", "Advantage+ · prueba"]);
    expect(pre.conjuntos.some((x) => x.tipo === "similares")).toBe(false);
    expect(pre.conjuntos[2].nota).toMatch(/prueba/);
    expect(p.avisos.some((a) => a.codigo === "cuenta-nueva")).toBe(true);
  });

  it("a la web: objetivo de ventas, sin app de mensajes, y los públicos del píxel", () => {
    const p = plan({ negocio: { ...NEGOCIO, destino: "web" } });
    const [pre, eva, con] = p.campanas;
    expect(pre).toMatchObject({ objetivo: "ventas", appMensajes: "", rendimiento: "Maximizar el número de conversiones (compras)" });
    expect(pre.nombre).toBe("Dcasa · Presentación · Ventas · Noviembre 2026");
    expect(pre.conjuntos[0].excluye.publicos).toContain("visitas-30");
    // En la web, quien visitó la web ya es de conversión: evaluación le habla a quien interactuó y lo excluye.
    expect(eva.conjuntos[0].publico.publicos).toEqual(["interaccion-30"]);
    expect(eva.conjuntos[0].excluye.publicos).toEqual(["visitas-30", "clientes"]);
    expect(con.conjuntos[0].publico.publicos).toEqual(["carrito-30", "visitas-30"]);
    expect(p.publicos.map((x) => x.id)).toContain("carrito-30");
    // Un servicio que capta por formulario en la web no tiene carrito.
    const servicio = plan({ negocio: { ...NEGOCIO, tipo: "segunda-necesidad", destino: "web" } });
    expect(servicio.objetivo).toBe("clientes");
    expect(servicio.campanas.find((c) => c.id === "conversion").conjuntos[0].publico.publicos).toEqual(["visitas-30"]);
    expect(servicio.publicos.map((x) => x.id)).not.toContain("carrito-30");
  });

  it("el reparto y los anuncios del Manual mandan", () => {
    const p = plan({ manual: { reparto: { presentacion: 70, evaluacion: 20, conversion: 5, ascension: 5 }, anunciosPorConjunto: 6 } });
    expect(p.campanas.map((c) => c.presupuesto.mensual)).toEqual([140, 40, 10, 10]);
    // Con el tope de cada etapa (el curso): evaluación 4 como mucho, ascensión 3.
    expect(p.campanas.map((c) => c.anunciosPorConjunto)).toEqual([6, 4, 6, 3]);
    // Un reparto con cuenta nueva vuelve a sumar 100.
    expect(repartoDelPlan({ presentacion: 70, evaluacion: 20, conversion: 5, ascension: 5 }, "nueva").map((r) => r.pct)).toEqual([77.8, 22.2]);
  });

  it("sin números del negocio: la estructura sale igual, sin cifras, y lo dice (grave)", () => {
    const p = plan({ negocio: { tipo: "productos", destino: "whatsapp", cuenta: "historial" } });
    expect(p.inversion).toBeNull();
    expect(p.campanas).toHaveLength(4);
    expect(p.campanas[0].presupuesto).toMatchObject({ mensual: null, diario: null, porConjunto: null });
    expect(p.avisos.find((a) => a.codigo === "sin-numeros")).toMatchObject({ grave: true });
  });

  it("una inversión escrita a mano manda sobre la meta, y el presupuesto del mes vale si no hay meta", () => {
    expect(plan({ numeros: { inversion: 600 } }).campanas[0].presupuesto.mensual).toBe(360);
    const p = plan({ negocio: { tipo: "productos", destino: "whatsapp", cuenta: "historial", presupuesto: { valor: 300, origen: "meta" } } });
    expect(p).toMatchObject({ inversion: 300, inversionDe: "meta-ads" });
  });

  it("sin el tipo de negocio ni el destino: productos por WhatsApp, y lo dice", () => {
    const p = plan({ negocio: { ...NEGOCIO, tipo: "", destino: "" } });
    expect(p.tipo).toBe("productos");
    expect(p.destino).toBe("whatsapp");
    expect(p.avisos.some((a) => a.codigo === "sin-perfil")).toBe(true);
  });

  it("las maletas que faltan del producto foco: «si falta una, no lances»", () => {
    const sin = plan({ calendario: { opciones: { estrategia: { objetivo: "vender", focoId: "mesa" } } } });
    const a = sin.avisos.find((x) => x.codigo === "maletas");
    expect(a).toMatchObject({ grave: true, productoId: "mesa" });
    expect(a.texto).toMatch(/no lances/);
    expect(a.texto).toMatch(/Faltan los testimonios y la garantía/);
    expect(sin.campanas[0].nombre).toContain("Mesa");
    const con = plan({ calendario: { opciones: { estrategia: { objetivo: "vender", focoId: "sofa" } } } });
    expect(con.avisos.some((x) => x.codigo === "maletas")).toBe(false);
  });

  it("los tipos de arte de cada etapa ponen primero los de la marca", () => {
    const p = plan();
    expect(p.campanas[0].artes).toEqual(["producto", "beneficios", "demostracion"]);
    expect(p.campanas[2].artes[0]).toBe("testimonio");
  });

  it("un presupuesto que no llega a 1 al día por conjunto avisa", () => {
    const p = plan({ numeros: { inversion: 60 } });
    expect(p.avisos.some((a) => a.codigo === "presupuesto-bajo" && a.campana === "presentacion")).toBe(true);
  });
});

describe("la temporada", () => {
  it("Black Friday y Cyber Monday de noviembre: del 20 al 30, con su presupuesto aparte del reparto", () => {
    const t = temporadaDelMes({ mes: "2026-11", calendario: null, fechasEspeciales: null, hoy: "2026-11-06" });
    expect(t).toMatchObject({ nombre: "Black Friday y Cyber Monday", inicio: "2026-11-20", fin: "2026-11-30", dias: 11 });
    const p = plan({ temporada: t });
    const c = p.campanas.find((x) => x.id === "temporada");
    expect(c).toBeDefined();
    expect(c.nombre).toBe("Dcasa · Temporada · Interacción WhatsApp · Noviembre 2026");
    // 20 % de 200 en 30 días = 1,33 al día, por los 11 días de la fecha.
    expect(c.presupuesto.diario).toBe(Math.round(((200 * PCT_TEMPORADA) / 100 / 30) * 100) / 100);
    expect(c.presupuesto.mensual).toBe(Math.round(1.33 * 11 * 100) / 100);
    expect(c.calendario).toEqual({ inicio: "2026-11-20", fin: "2026-11-30" });
    // El reparto de las cuatro no cambia.
    expect(p.campanas.slice(0, 4).map((x) => x.presupuesto.mensual)).toEqual([120, 40, 20, 20]);
    // Un diario escrito manda; «no incluir» la quita y lo dice.
    expect(plan({ temporada: t, ajustes: { temporada: { diario: 10 } } }).campanas.at(-1).presupuesto.mensual).toBe(110);
    const quitada = plan({ temporada: t, ajustes: { temporada: { incluir: false } } });
    expect(quitada.campanas.some((x) => x.id === "temporada")).toBe(false);
    expect(quitada.avisos.some((a) => a.codigo === "temporada-quitada")).toBe(true);
  });

  it("sólo la oferta del calendario: el mes entero desde hoy; un mes sin nada no la trae", () => {
    expect(temporadaDelMes({ mes: "2026-09", calendario: { offers: "2x1 en cojines" }, hoy: "2026-09-10" }))
      .toMatchObject({ inicio: "2026-09-10", fin: "2026-09-30", ofertas: "2x1 en cojines" });
    expect(temporadaDelMes({ mes: "2026-09", calendario: {}, hoy: "2026-09-10" })).toBeNull();
    // Una fecha ya pasada no trae temporada.
    expect(temporadaDelMes({ mes: "2026-10", calendario: null, hoy: "2026-11-06" })).toBeNull();
  });

  it("una fecha delicada no hace temporada", () => {
    const nombres = temporadaDelMes({ mes: "2026-02", fechasEspeciales: { elegidas: ["cancer"] }, hoy: "2026-01-01" })?.fechas.map((f) => f.nombre);
    expect(nombres).toContain("Día del Amor y la Amistad");
    expect(nombres).not.toContain("Día Mundial contra el Cáncer");
  });
});

describe("qué pieza va en cada anuncio", () => {
  const post = (id, extra = {}) => ({ id, format: "post", title: `Pieza ${id}`, descripcion: "¿Tu sofá se hunde? El sofá cama que se abre en diez segundos. Escríbenos por WhatsApp y te asesoramos.", ...extra });
  const calendarios = [{
    id: "cal-11", year: 2026, month: 10, days: [
      { date: "2026-11-02", posts: [post("p1", { status: "published", composicion: "heroe", pilar: "anuncio" })] },
      { date: "2026-11-03", posts: [post("p2", { status: "published", composicion: "macro" })] },
      { date: "2026-11-04", posts: [post("p3", { pauta: { etapa: "evaluacion" }, composicion: "cenital", anuncio: { textos: ["Texto 1", "Texto 2", "Texto 3"], titulos: ["Título"], descripcion: "Envío gratis" } })] },
      { date: "2026-11-05", posts: [post("p4", { pauta: { etapa: "evaluacion" }, composicion: "uso", tipoArte: "demostracion" }), post("p4b", { pauta: { etapa: "evaluacion" }, composicion: "uso", tipoArte: "demostracion" })] },
      { date: "2026-11-06", posts: [post("p5", { status: "published", descripcion: "¡Hola! Hoy abrimos. #muebles" })] },
      { date: "2026-11-07", posts: [post("p6", { pauta: { etapa: "conversion" }, descripcion: "Black Friday: 15 % en el sofá cama. Escríbenos por WhatsApp.", pilar: "beneficios" })] },
    ],
  }];
  const cola = [
    { calendar_id: "cal-11", post_id: "p1", red: "instagram", estado: "publicada", variante: "post", externo_id: "ig1", enlace: "https://www.instagram.com/p/AAA/" },
    { calendar_id: "cal-11", post_id: "p2", red: "instagram", estado: "publicada", variante: "post", externo_id: "ig2", enlace: "https://www.instagram.com/p/BBB/" },
    { calendar_id: "cal-11", post_id: "p5", red: "instagram", estado: "publicada", variante: "post", externo_id: "ig5", enlace: "https://www.instagram.com/p/EEE/" },
    { calendar_id: "cal-11", post_id: "p2", red: "instagram", estado: "publicada", variante: "historia", externo_id: "ig2h", enlace: "" },
  ];
  // La cuenta: la mediana de interacciones es 11; p1 rinde 3,6×, p2 1×, p5 2,7×.
  const metricas = [
    { id: "m1", cuenta_id: "cta", red: "instagram", externo_id: "ig1", interacciones: 40 },
    { id: "m2", cuenta_id: "cta", red: "instagram", externo_id: "ig2", interacciones: 11 },
    { id: "m5", cuenta_id: "cta", red: "instagram", externo_id: "ig5", interacciones: 30 },
    { id: "m6", cuenta_id: "cta", red: "instagram", externo_id: "x6", interacciones: 10 },
    { id: "m7", cuenta_id: "cta", red: "instagram", externo_id: "x7", interacciones: 8 },
  ];
  const cands = () => candidatasDelCalendario({ calendarios, cola, metricas, destino: "whatsapp", artesMarca: ["producto"] });

  it("lo publicado entra con su «rinde» (la cuenta de «Lo mejor») y si su texto sirve para pauta", () => {
    const c = cands();
    const p1 = c.find((x) => x.postId === "p1");
    expect(p1).toMatchObject({ publicada: true, rinde: 3.6, sirve: true, enlaces: { instagram: "https://www.instagram.com/p/AAA/" }, tipoArte: "producto" });
    const p5 = c.find((x) => x.postId === "p5");
    expect(p5.sirve).toBe(false);
    expect(p5.motivo).toMatch(/caduca|«hoy»/i);
    expect(c.find((x) => x.postId === "p3")).toMatchObject({ publicada: false, pauta: { etapa: "evaluacion" } });
  });

  it("primero lo publicado que rindió, luego lo de «Va a pauta» con su etapa; lo que falta se pide", () => {
    const p = conPiezas(plan(), cands(), { hoy: "2026-11-06" });
    const [pre, eva, con] = p.campanas;
    // p1 (3,6×) va a presentación con su publicación; p2 rinde poco y p5 no sirve.
    expect(pre.anuncios.map((a) => a.pieza.postId)).toEqual(["p1"]);
    expect(pre.anuncios[0]).toMatchObject({ como: "publicacion", origen: "publicada", nombre: "1 · Pieza · Pieza p1" });
    expect(textoDeLaPieza(pre.anuncios[0])).toMatch(/usar la publicación: https:\/\/www\.instagram\.com\/p\/AAA\//);
    expect(pre.faltan).toMatchObject({ n: 3, etapa: "presentacion", nivel: "problema" });
    // Evaluación: p3 (con sus textos) y sólo UNA de p4/p4b (mismo tipo de arte y composición).
    expect(eva.anuncios.map((a) => a.pieza.postId)).toEqual(["p3", "p4"]);
    expect(eva.anuncios[0]).toMatchObject({ como: "subir", origen: "pauta" });
    expect(eva.anuncios[0].pieza.textos.textos).toHaveLength(3);
    expect(p.avisos.find((a) => a.codigo === "diversidad").texto).toMatch(/UN solo anuncio/);
    expect(con.anuncios.map((a) => a.pieza.postId)).toEqual(["p6"]);
    expect(p.avisos.some((a) => a.codigo === "faltan-piezas")).toBe(true);
  });

  it("la oferta del mes va a la campaña de temporada", () => {
    const t = temporadaDelMes({ mes: "2026-11", calendario: { offers: "15 % de descuento por Black Friday" }, hoy: "2026-11-06" });
    const p = conPiezas(plan({ temporada: t }), cands(), { ofertas: "15 % de descuento por Black Friday", hoy: "2026-11-06" });
    expect(p.campanas.find((c) => c.id === "temporada").anuncios.map((a) => a.pieza.postId)).toEqual(["p6"]);
    expect(p.campanas.find((c) => c.id === "conversion").anuncios).toHaveLength(0);
  });

  it("lo que se aprendió de sus anuncios ordena los tipos de arte de lo que falta y el plan lo dice", () => {
    const sin = conPiezas(plan(), cands(), { hoy: "2026-11-06" });
    // Sin aprender: los de la etapa que no cubre ninguna pieza puesta y, detrás, el que ya va (producto, la de p1).
    // Lo que falta de presentación es de niveles fríos (problema, solución, inconsciente): sin el arte de producto.
    expect(sin.campanas[0].faltan.artes).toEqual(["beneficios", "demostracion"]);
    const aprendido = {
      muestra: 7,
      mejores: [{ rasgo: "tipoArte", nombreRasgo: "tipo de arte", id: "demostracion", nombre: "El barato", costo: 0.8, total: 1.2, piezas: 3 }],
      peores: [{ rasgo: "tipoArte", nombreRasgo: "tipo de arte", id: "beneficios", nombre: "El caro", costo: 2, total: 1.2, piezas: 3 }],
    };
    const con = conPiezas(plan(), cands(), { hoy: "2026-11-06", aprendido });
    // El más barato pasa delante y el más caro, detrás de los que faltan; lo ya cubierto sigue al final; nada se añade.
    expect(con.campanas[0].faltan.artes).toEqual(["demostracion", "beneficios"]);
    const aviso = con.avisos.find((a) => a.codigo === "aprendido");
    expect(aviso.texto).toMatch(/7 piezas/);
    expect(aviso.texto).toMatch(/sale más barato el tipo de arte «El barato» \(\$0\.80\)/);
    expect(aviso.texto).toMatch(/sale más caro el tipo de arte «El caro» \(\$2\)/);
    expect(con.aprendido).toMatchObject({ muestra: 7 });
    // Sin muestra no cambia nada ni dice nada; y rehacer el plan no repite el aviso.
    expect(sin.avisos.some((a) => a.codigo === "aprendido")).toBe(false);
    expect(sin.aprendido).toBeNull();
    expect(conPiezas(con, cands(), { hoy: "2026-11-06", aprendido }).avisos.filter((a) => a.codigo === "aprendido")).toHaveLength(1);
  });

  it("el tipo de arte de una publicación: el suyo, el de su composición (los de la marca primero) o el de su tipo", () => {
    expect(tipoArteDePost({ tipoArte: "prensa" })).toBe("prensa");
    expect(tipoArteDePost({ composicion: "heroe" }, ["beneficios"])).toBe("beneficios");
    expect(tipoArteDePost({ composicion: "heroe" })).toBe("beneficios");
    expect(tipoArteDePost({ pilar: "educativo" })).toBe("demostracion");
    expect(tipoArteDePost({})).toBe("");
  });
});

describe("la guía de montaje", () => {
  it("en el orden del Ads Manager: públicos, y por campaña la campaña, el conjunto 1, sus anuncios y los demás conjuntos", () => {
    const g = guiaDeMontaje(plan());
    // Antes de empezar: las etiquetas de WhatsApp Business (en una web, el píxel) y los públicos.
    expect(g[0].id).toBe("antes:etiquetas");
    expect(g.slice(1, 6).every((x) => x.nivel === "publico")).toBe(true);
    expect(guiaDeMontaje(plan({ negocio: { ...NEGOCIO, destino: "web" } }))[0].id).toBe("antes:pixel");
    const pre = g.filter((x) => x.grupo === "presentacion").map((x) => x.id);
    expect(pre).toEqual(["presentacion:campana", "presentacion:c1", "presentacion:a1", "presentacion:a2", "presentacion:a3", "presentacion:a4", "presentacion:c2", "presentacion:c3"]);
    const campana = g.find((x) => x.id === "presentacion:campana");
    expect(campana.campos.find((f) => f.etiqueta === "Prueba A/B").valor).toBe("Desactivada");
    expect(campana.campos.find((f) => f.etiqueta === "Presupuesto de la campaña Advantage+").valor).toMatch(/Desactivado/);
    expect(g.find((x) => x.id === "evaluacion:campana").campos.find((f) => f.etiqueta === "Presupuesto de la campaña Advantage+").valor).toMatch(/^Activado: \$1\.33 al día/);
    const c1 = g.find((x) => x.id === "presentacion:c1");
    expect(c1.campos.map((f) => f.etiqueta)).toEqual(["Nombre", "Presupuesto diario", "App de mensajes", "Objetivo de rendimiento", "Puja", "Calendario", "Edad", "Público",
      "Segmentación detallada Advantage", "Excluir", "Público Advantage+", "Ubicaciones", "Llegar a más personas con más probabilidad de clic"]);
    expect(c1.campos.at(-1).valor).toBe("Desactivado");
    expect(c1.campos.find((f) => f.etiqueta === "Excluir").valor).toMatch(/Interactuaron · 90 días, Lista de clientes/);
    expect(g.find((x) => x.id === "presentacion:c2").nota).toMatch(/Duplica el conjunto 1/);
    // Con el presupuesto en la campaña, el conjunto no lo lleva.
    expect(g.find((x) => x.id === "evaluacion:c1").campos.some((f) => f.etiqueta === "Presupuesto diario")).toBe(false);
  });

  it("el progreso: sólo ids de la guía, y cuántos van", () => {
    const g = guiaDeMontaje(plan());
    const p = limpiarProgreso({ "presentacion:campana": { por: "Ana", at: "2026-11-06T10:00:00.000Z" }, "otra:cosa": { por: "x" }, "bad id!": {} }, g);
    expect(Object.keys(p)).toEqual(["presentacion:campana"]);
    expect(avanceDeGuia(g, p)).toEqual({ hechos: 1, total: g.length });
  });
});

describe("el Excel y el texto", () => {
  it("cinco hojas con las columnas del Excel de la agencia y una fila por conjunto", () => {
    const t = temporadaDelMes({ mes: "2026-11", hoy: "2026-11-06" });
    const hojas = hojasDelPlan(plan({ temporada: t }));
    expect(hojas.map((h) => h.nombre)).toEqual([...Object.values(HOJAS_EXCEL), "Textos de los anuncios"]);
    expect(hojas[4].nombre).toBe("Campaña Especial (temporada)");
    const pre = hojas[0];
    expect(pre.filas[0]).toEqual(["Presupuesto Mensual (USD):", 120]);
    expect(pre.filas[3].slice(0, 9)).toEqual(["Objetivo", "Presupuesto de la campaña Advantage+", "App de Mensajes", "Objetivo de rendimiento", "Presupuesto Diario", "Calendario", "Público", "Exclusiones", "Ubicaciones"]);
    expect(pre.filas[3].slice(9)).toEqual(["Anuncio 1", "Anuncio 2", "Anuncio 3", "Anuncio 4"]);
    expect(pre.filas.slice(4, 7).map((f) => f[4])).toEqual([1.33, 1.33, 1.33]);
    // B es un sí/no (Presentación: el presupuesto va en cada conjunto) y, como la hoja de la agencia, lo de la campaña y
    // los anuncios (los mismos en los tres conjuntos) van combinados en sus filas.
    expect(pre.filas[4][1]).toBe("No");
    expect(pre.combinadas.slice(0, 3)).toEqual(["A3:B3", "C3:I3", "J3:M3"]);
    expect(pre.combinadas).toEqual(expect.arrayContaining(["A5:A7", "C5:C7", "J5:J7", "M5:M7"]));
    expect(pre.combinadas).not.toContain("E5:E7");
    const eva = hojas[1];
    expect(eva.filas[3].slice(0, 3)).toEqual(["Objetivo", "Presupuesto de la campaña Advantage+", "Presupuesto diario"]);
    // La cifra diaria va en C «Presupuesto diario»; B dice sí.
    expect(eva.filas[4].slice(1, 3)).toEqual(["Sí", 1.33]);
    expect(eva.combinadas.slice(0, 3)).toEqual(["A3:C3", "D3:I3", "J3:M3"]);
    expect(eva.combinadas).toEqual(expect.arrayContaining(["C5:C6", "D5:D6"]));
    // Conversión y la Campaña Especial: el presupuesto en la campaña (C), como su Excel.
    const con = hojas[2];
    expect(con.filas[4].slice(1, 3)).toEqual(["Sí", 0.67]);
    expect(hojas[4].filas[4][1]).toBe("Sí");
    expect(typeof hojas[4].filas[4][2]).toBe("number");
  });

  it("una cuenta nueva deja sus hojas de conversión y ascensión con el motivo", () => {
    const hojas = hojasDelPlan(plan({ negocio: { ...NEGOCIO, cuenta: "nueva" } }));
    expect(hojas[2].filas[4][0]).toMatch(/cuenta es nueva/);
    expect(hojas[4].filas[4][0]).toMatch(/no trae oferta/);
  });

  it("el texto lleva los avisos, los públicos, cada campaña y sus anuncios", () => {
    const texto = planATextoCiclo(plan({ negocio: { tipo: "productos", destino: "whatsapp", cuenta: "historial" } }));
    expect(texto).toMatch(/^PLAN DE CAMPAÑAS · Dcasa · Noviembre 2026/);
    expect(texto).toMatch(/\[!\] Sin los números del negocio/);
    expect(texto).toMatch(/PÚBLICOS PERSONALIZADOS A CREAR/);
    expect(texto).toMatch(/PRESENTACIÓN · Dcasa · Presentación/);
    expect(texto).toMatch(/1\. por producir/);
  });
});

describe("los públicos y los conjuntos", () => {
  it("cada público que usa un conjunto existe", () => {
    const ids = new Set(PUBLICOS_CICLO.map((p) => p.id));
    for (const etapa of ["presentacion", "evaluacion", "conversion", "ascension", "temporada"]) {
      for (const web of [false, true]) {
        for (const x of conjuntosDeEtapa(etapa, { web })) {
          for (const id of [...x.publico.publicos, ...x.excluye.publicos]) expect(ids.has(id), `${etapa}: ${id}`).toBe(true);
        }
      }
    }
  });
});
