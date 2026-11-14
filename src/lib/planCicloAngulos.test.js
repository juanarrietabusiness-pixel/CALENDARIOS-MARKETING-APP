import { describe, it, expect } from "vitest";
import {
  planDelCiclo, conPiezas, candidatasDelCalendario, guiaDeMontaje, hojasDelPlan, planATextoCiclo, conjuntosDeEtapa,
  enPalabra, edadDeTexto, textoEdad, encajeEnEtapa, angulosParaCampana, presupuestoDelMes, idDelPlanDelMes, NOTA_EXCLUSIONES,
} from "./planCiclo";
import { limpiarAnunciosPlan, fundirAnunciosPlan, casillaDeTextos, pedidoDeTextosPlan, limpiarAnguloHueco } from "./anunciosPlan";
import { preferenciasDeAnuncios } from "./aprenderAnuncios";
import { anguloDePost, fotoDePublicacion } from "./enPauta";

// ============================================================
// Lo que corrigió el Excel del plan de campañas (nombres, edades, reparto, públicos que compiten, presupuestos que no
// dan) y los ÁNGULOS DE VENTA en cada hueco de anuncio, con lo que se aprende de ellos.
// ============================================================

const NEGOCIO = {
  tipo: "productos", destino: "whatsapp", cuenta: "historial",
  ticket: { valor: 50, origen: "cliente" }, invertir: { valor: 20, origen: "agencia" }, metaVentas: { valor: 1000, origen: "agencia" },
};
const CATALOGO = [{ id: "sofa", nombre: "Sofá cama", precio: "$450", activo: true }, { id: "mesa", nombre: "Mesa", precio: "$120", activo: true }];
const MALETAS = {
  publico: "Mujeres de 28 a 45 años en Ciudad de Panamá, con casa propia.",
  problema: "El sofá viejo se hunde y no tienen dónde recibir visitas.",
  solucion: "Un sofá que se abre en cama en diez segundos.",
  diferenciales: "Fabricado en Panamá, tela antimanchas.",
  testimonios: "Ana de Costa del Este lo usa a diario desde 2024.",
  objeciones: "El precio: tres cuotas sin interés.",
  garantia: "Dos años de garantía de estructura.",
};
const ANGULOS_SOFA = [
  { id: "visitas", nombre: "Las visitas que se quedan", publico: "frio", problemaExterno: "No hay dónde dormir a las visitas.", ganchos: ["¿Y si se quedan a dormir?"] },
  { id: "espacio", nombre: "Un cuarto más sin construir", publico: "frio" },
  { id: "garantia", nombre: "Dos años sin preocuparte", publico: "tibio", garantia: "Dos años de estructura." },
  { id: "cuotas", nombre: "En tres cuotas", publico: "tibio" },
];
const ESTUDIO = {
  general: { resumen: "Muebles.", perfiles: [{ nombre: "Mamá práctica", quien: "Mamás que trabajan desde casa y reciben a la familia todos los domingos, buscan orden en la sala, muebles que se limpien fácil y algo que dure muchos años sin tener que pensar en ello otra vez." }, { nombre: "Pareja joven", quien: "Parejas que estrenan casa" }] },
  productos: { sofa: { elementos: MALETAS, angulos: ANGULOS_SOFA }, mesa: { elementos: MALETAS, angulos: [{ id: "familia", nombre: "La mesa de los domingos", publico: "tibio" }] } },
};
const APROBADO = { ...ESTUDIO, aprobadoAt: "2026-10-01T00:00:00.000Z" };
const plan = (extra = {}) => planDelCiclo({
  negocio: NEGOCIO, manual: {}, mes: "2026-11", kit: { tiposArte: ["producto"] }, estudio: ESTUDIO, catalogo: CATALOGO,
  cliente: { nombre: "Dcasa", rubro: "Muebles" }, ...extra,
});

describe("los nombres y los textos se cortan en una palabra", () => {
  it("enPalabra corta con «…» sin dejar media palabra ni un signo suelto", () => {
    expect(enPalabra("Busca información antes de comprar el sofá", 25)).toBe("Busca información antes…");
    expect(enPalabra("Velvée — tela antimanchas", 9)).toBe("Velvée…");
    expect(enPalabra("Corto", 30)).toBe("Corto");
  });

  it("el texto del público del perfil no queda cortado a media palabra", () => {
    const pre = plan().campanas[0];
    expect(pre.conjuntos[0].publico.texto).toMatch(/…\.$/);
    expect(pre.conjuntos[0].publico.texto).not.toMatch(/\s\w{1,3}\.$/);
  });
});

describe("la edad del conjunto", () => {
  it("se lee del texto del público, y lo que no es una edad no cuenta", () => {
    expect(edadDeTexto("Mamás de 30 a 45 años")).toEqual({ min: 30, max: 45 });
    expect(edadDeTexto("entre 25 y 38")).toEqual({ min: 25, max: 38 });
    expect(edadDeTexto("25-38 años")).toEqual({ min: 25, max: 38 });
    expect(edadDeTexto("mayores de 40")).toEqual({ min: 40, max: 65 });
    expect(edadDeTexto("de 30 a 45 minutos de entrega")).toBeNull();
    expect(edadDeTexto("Parejas que estrenan casa")).toBeNull();
    expect(textoEdad({ min: 40, max: 65 })).toBe("40-65+");
  });

  it("intereses: la del perfil o, si no la dice, la del público del producto; los demás, sin edad en el nombre", () => {
    const p = plan({ ajustes: { que: { productos: "foco", productoIds: ["sofa"] } } });
    const [c1, c2] = p.campanas[0].conjuntos;
    // El perfil «Mamá práctica» no dice edad: va la del público del sofá (28 a 45).
    expect(c1).toMatchObject({ nombre: "Intereses · Mamá práctica · 28-45", edad: { min: 28, max: 45 } });
    expect(c2.nombre).toBe("Similares 1 %");
    const g = guiaDeMontaje(p);
    expect(g.find((x) => x.id === "presentacion:c1").campos.find((f) => f.etiqueta === "Edad").valor).toMatch(/^de 28 a 45 años/);
    expect(g.find((x) => x.id === "presentacion:c2").campos.find((f) => f.etiqueta === "Edad").valor).toMatch(/^Abierta/);
    // Sin edad en ningún sitio, el nombre va sin ella (nunca «18-65+» de todos).
    const sin = plan({ estudio: { general: { perfiles: [{ nombre: "Pareja joven", quien: "Parejas" }] }, productos: {} } });
    expect(sin.campanas[0].conjuntos[0].nombre).toBe("Intereses · Pareja joven");
  });
});

describe("los públicos que compiten", () => {
  it("evaluación: el de 90 días excluye al de 30 (ya está en el conjunto 1)", () => {
    const [c1, c2] = conjuntosDeEtapa("evaluacion");
    expect(c1.excluye.publicos).toEqual(["mensajes-30", "clientes"]);
    expect(c2.excluye.publicos).toEqual(["interaccion-30", "mensajes-30", "clientes"]);
    expect(c2.excluye.nota).toMatch(/no compiten/);
  });

  it("la nota de las exclusiones de presentación se entiende sin el curso", () => {
    expect(conjuntosDeEtapa("presentacion")[0].excluye.nota).toBe(NOTA_EXCLUSIONES);
    expect(NOTA_EXCLUSIONES).toMatch(/para no pagar dos veces por la misma persona/);
  });

  it("la temporada comparte gente con evaluación y ascensión: se dice y qué hacer", () => {
    const p = plan({ temporada: { nombre: "Black Friday", motivo: "", fechas: [], inicio: "2026-11-20", fin: "2026-11-27", dias: 8, ofertas: "", codigo: "" } });
    const a = p.avisos.find((x) => x.codigo === "temporada-compite");
    expect(a.texto).toMatch(/evaluación y ascensión/);
    expect(a.texto).toMatch(/no subas el presupuesto/);
  });
});

describe("los presupuestos que no dan", () => {
  it("dice cuánto al día y a la semana, por qué no sale del aprendizaje, y qué juntar con sus números", () => {
    // 200 $ al mes: presentación 120 → 4 $ al día en 3 conjuntos = 1,33 cada uno; conversión y ascensión, 0,67 al día.
    const p = plan();
    const bajo = p.avisos.filter((a) => a.codigo === "presupuesto-bajo");
    expect(bajo.map((a) => a.campana)).toEqual(expect.arrayContaining(["presentacion", "conversion", "ascension"]));
    expect(bajo.find((a) => a.campana === "presentacion").texto).toMatch(/cada conjunto \(3\) queda con \$1\.33 al día \(\$9\.33 a la semana\)/);
    expect(bajo[0].texto).toMatch(/50 resultados a la semana/);
    const juntar = p.avisos.find((a) => a.codigo === "presupuesto-juntar");
    expect(juntar.texto).toMatch(/1\) presentación con un solo conjunto en vez de 3: cada uno tendría \$4 al día/);
    expect(juntar.texto).toMatch(/sólo presentación y evaluación/);
    expect(juntar.texto).toMatch(/O sube la inversión unos \$\d+ al mes/);
    // Con mucha inversión, nada de esto.
    const grande = plan({ numeros: { inversion: 6000 } });
    expect(grande.avisos.some((a) => a.codigo === "presupuesto-bajo" || a.codigo === "presupuesto-juntar")).toBe(false);
  });

  it("el presupuesto del mes es el del plan (lo que mide el ritmo de gasto de la revisión)", () => {
    expect(presupuestoDelMes({ negocio: NEGOCIO, manual: {}, mes: "2026-11" })).toMatchObject({ total: 200, ciclo: 200, temporada: 0, de: "meta" });
    expect(presupuestoDelMes({ negocio: {}, manual: {}, mes: "2026-11" })).toBeNull();
    expect(idDelPlanDelMes("c1", "2026-11")).toBe("ciclo-c1-2026-11");
  });
});

describe("cada pieza a la etapa donde mejor encaja", () => {
  const post = (id, extra = {}) => ({ id, format: "post", status: "published", title: `Pieza ${id}`, descripcion: "¿Tu sofá se hunde? El sofá cama que se abre en diez segundos. Escríbenos por WhatsApp.", ...extra });
  const calendarios = [{
    id: "cal", year: 2026, month: 10, days: [
      { date: "2026-11-02", posts: [post("a", { composicion: "uso", pilar: "educativo" })] },
      { date: "2026-11-03", posts: [post("b", { descripcion: "Sofá cama a $450 con envío gratis. Escríbenos por WhatsApp.", composicion: "heroe", pilar: "anuncio" })] },
      { date: "2026-11-04", posts: [post("c", { nivel: "producto", composicion: "cenital", pilar: "servicios" })] },
    ],
  }];
  const cola = ["a", "b", "c"].map((id) => ({ calendar_id: "cal", post_id: id, red: "instagram", estado: "publicada", variante: "post", externo_id: `ig-${id}`, enlace: `https://www.instagram.com/p/${id}/` }));
  const metricas = [
    ...["a", "b", "c"].map((id) => ({ id: `m-${id}`, cuenta_id: "x", red: "instagram", externo_id: `ig-${id}`, interacciones: 60 })),
    { id: "m1", cuenta_id: "x", red: "instagram", externo_id: "o1", interacciones: 10 }, { id: "m2", cuenta_id: "x", red: "instagram", externo_id: "o2", interacciones: 10 },
    { id: "m3", cuenta_id: "x", red: "instagram", externo_id: "o3", interacciones: 10 },
  ];

  it("lo que habla de precio va a conversión, lo del producto a evaluación y lo demás a presentación", () => {
    const c = candidatasDelCalendario({ calendarios, cola, metricas, destino: "whatsapp" });
    const p = conPiezas(plan(), c, { hoy: "2026-11-06" });
    const donde = Object.fromEntries(p.campanas.flatMap((x) => x.anuncios.map((a) => [a.pieza.postId, x.id])));
    expect(donde).toEqual({ a: "presentacion", b: "conversion", c: "evaluacion" });
  });

  it("el encaje: el precio resta en presentación y suma en conversión; un nivel frío fuera de presentación resta", () => {
    const pre = { etapa: "presentacion", artes: [] };
    const con = { etapa: "conversion", artes: [] };
    const conPrecio = { titulo: "Sofá a $450", tipoArte: "", nivel: "" };
    expect(encajeEnEtapa(conPrecio, con)).toBeGreaterThan(encajeEnEtapa(conPrecio, pre));
    expect(encajeEnEtapa({ titulo: "Mito del sofá", nivel: "problema" }, con)).toBeLessThan(0);
  });
});

describe("los ángulos de venta en el plan", () => {
  it("sin estudio aprobado no hay ángulos: todo como antes", () => {
    const p = plan();
    expect(p.angulos).toEqual([]);
    expect(p.campanas.every((c) => c.angulosHuecos.every((x) => x === null))).toBe(true);
    expect(hojasDelPlan(conPiezas(p, [])).at(-1).filas[2]).toContain("Ángulo de venta");
  });

  it("presentación prueba los fríos, las demás los tibios; cada campaña otros, y el nombre del anuncio es el ángulo", () => {
    const p = conPiezas(plan({ estudio: APROBADO, ajustes: { que: { productos: "foco", productoIds: ["sofa"] } } }), [], { hoy: "2026-11-06" });
    expect(p.angulos.map((a) => a.id)).toEqual(["visitas", "espacio", "garantia", "cuotas"]);
    const [pre, eva] = p.campanas;
    expect(pre.angulosHuecos.slice(0, 2).map((a) => a.id)).toEqual(["visitas", "espacio"]);
    expect(eva.angulosHuecos.map((a) => a.id)).toEqual(["garantia", "cuotas", "garantia", "cuotas"]);
    // La siguiente campaña tibia empieza por los menos usados.
    expect(p.campanas[2].angulosHuecos[0].id).toBe("garantia");
    expect(pre.faltan.angulos.map((a) => a.id)).toEqual(["visitas", "espacio"]);
    expect(planATextoCiclo(p)).toMatch(/ángulo «Las visitas que se quedan» \(Sofá cama\)/);
    const celda = hojasDelPlan(p)[0].filas[4][9];
    expect(celda).toMatch(/Ángulo: «Las visitas que se quedan»/);
  });

  it("sólo del estudio APROBADO: un borrador no se prueba con dinero", () => {
    const p = plan({ estudio: APROBADO, estudioAprobado: null });
    expect(p.angulos).toEqual([]);
    expect(plan({ estudio: ESTUDIO, estudioAprobado: APROBADO }).angulos.length).toBeGreaterThan(0);
  });

  it("lo escogido manda (también «sin ángulo»), el anuncio lleva su ángulo y su nombre, y se ve en la guía y el Excel", () => {
    const elegidos = {
      "presentacion:a1": { nuevo: true, angulo: { productoId: "sofa", id: "espacio", nombre: "Un cuarto más sin construir" } },
      "presentacion:a2": { angulo: false },
    };
    const p = conPiezas(plan({ estudio: APROBADO }), [], { hoy: "2026-11-06", elegidos });
    const pre = p.campanas[0];
    expect(pre.angulosHuecos[0]).toMatchObject({ id: "espacio" });
    expect(pre.angulosHuecos[0].sugerido).toBeUndefined();
    expect(pre.angulosHuecos[1]).toBeNull();
    const a1 = pre.anuncios.find((a) => a.n === 1);
    expect(a1.nombre).toBe("1 · Pieza · Un cuarto más sin construir");
    const paso = guiaDeMontaje(p).find((x) => x.id === "presentacion:a1");
    expect(paso.campos.find((f) => f.etiqueta === "Ángulo de venta que prueba").valor).toBe("«Un cuarto más sin construir» (Sofá cama)");
    const fila = hojasDelPlan(p).at(-1).filas.find((f) => f[2] === a1.nombre);
    expect(fila[6]).toBe("«Un cuarto más sin construir» (Sofá cama)");
  });

  it("el sugerido se cambia por uno del producto de su pieza", () => {
    const post = { id: "m1", format: "post", title: "La mesa", status: "published", productoId: "mesa", composicion: "uso", descripcion: "La mesa de la familia. Escríbenos por WhatsApp." };
    const cands = candidatasDelCalendario({ calendarios: [{ id: "cal", days: [{ date: "2026-11-02", posts: [{ ...post, pauta: { etapa: "evaluacion" } }] }] }], destino: "whatsapp" });
    const p = conPiezas(plan({ estudio: APROBADO }), cands, { hoy: "2026-11-06" });
    const eva = p.campanas.find((c) => c.id === "evaluacion");
    expect(eva.anuncios[0].pieza.postId).toBe("m1");
    expect(eva.anuncios[0].angulo).toMatchObject({ productoId: "mesa", id: "familia", sugerido: true });
  });

  it("guardar el ángulo de un hueco: limpio, «sin ángulo» y volver al sugerido; lo de antes vale igual", () => {
    expect(limpiarAnguloHueco({ productoId: "sofa", id: "espacio" })).toEqual({ productoId: "sofa", id: "espacio", nombre: "espacio" });
    expect(limpiarAnguloHueco(false)).toBe(false);
    expect(limpiarAnguloHueco({ id: "x" })).toBeUndefined();
    expect(limpiarAnunciosPlan({ "presentacion:a1": { angulo: { productoId: "sofa", id: "espacio", nombre: "Espacio" } } })).toEqual({ "presentacion:a1": { angulo: { productoId: "sofa", id: "espacio", nombre: "Espacio" } } });
    // Lo guardado antes de los ángulos (sin `angulo`) se lee igual.
    const viejo = { "evaluacion:a2": { nuevo: true, como: "subir" } };
    expect(limpiarAnunciosPlan(viejo)).toEqual(viejo);
    const guardado = { "presentacion:a1": { pieza: { calendarId: "c", postId: "p" }, angulo: { productoId: "sofa", id: "espacio", nombre: "Espacio" } } };
    // Cambiar de publicación no se lleva el ángulo; `angulo: null` lo vuelve al sugerido.
    expect(fundirAnunciosPlan(guardado, { "presentacion:a1": { pieza: { calendarId: "c", postId: "q" } } })["presentacion:a1"].angulo).toMatchObject({ id: "espacio" });
    expect(fundirAnunciosPlan(guardado, { "presentacion:a1": { angulo: null } })["presentacion:a1"].angulo).toBeUndefined();
  });

  it("la IA escribe los textos del hueco con SU ángulo (y sus ganchos de inspiración)", () => {
    const c = casillaDeTextos({ slot: "presentacion:a1", nivel: "problema", como: "subir" }, { id: "presentacion", etapa: "presentacion", nombreEtapa: "Presentación" }, null,
      { angulo: { linea: "«Las visitas que se quedan» — problema: No hay dónde dormir a las visitas.", ganchos: ["¿Y si se quedan a dormir?"] } });
    const pedido = pedidoDeTextosPlan({ marca: "Dcasa", casillas: [c] });
    expect(pedido).toMatch(/Ángulo de venta que prueba este anuncio \(todo lo que escribas lo cuenta, cada texto de otra forma\): «Las visitas que se quedan»/);
    expect(pedido).toMatch(/Ganchos de ese ángulo \(inspiración, no se copian\): «¿Y si se quedan a dormir\?»/);
    // Sin ángulo, como antes.
    const sin = pedidoDeTextosPlan({ marca: "Dcasa", casillas: [casillaDeTextos({ slot: "presentacion:a1", nivel: "problema", como: "subir" }, { id: "presentacion", etapa: "presentacion", nombreEtapa: "Presentación" })] });
    expect(sin).not.toMatch(/Ángulo de venta que prueba/);
  });

  it("angulosParaCampana: sin ángulos aptos, null en cada hueco", () => {
    expect(angulosParaCampana([{ productoId: "s", id: "x", nombre: "X", publico: "tibio" }], "presentacion", 2)).toEqual([null, null]);
  });
});

describe("qué ángulo gana (lo que se aprende de los anuncios)", () => {
  const pieza = (n, { gasto, resultados, angulo, conAngulo = true }) => [
    `cal1|p${n}`,
    {
      calendarId: "cal1", postId: `p${n}`, red: "instagram", activo: true, visto: "2026-11-06", etapa: "presentacion", nombreEtapa: "Presentación",
      tipoResultado: "conversacion", nombreResultado: "conversaciones",
      d7: { gasto: gasto / 4, resultados: Math.round(resultados / 4), costo: null }, d30: { gasto, resultados, costo: gasto / resultados },
      anuncios: [], post: { titulo: `Pieza ${n}`, composicion: "uso", pilar: "anuncio", nivel: "problema", ...(conAngulo ? { angulo: `sofa:${angulo}`, anguloNombre: angulo === "visitas" ? "Las visitas" : "El espacio" } : {}) },
    },
  ];
  const enPauta = {
    moneda: "USD", referencia: 0.5,
    publicaciones: Object.fromEntries([
      ...[1, 2, 3].map((n) => pieza(n, { gasto: 30, resultados: 30, angulo: "visitas" })),
      ...[4, 5, 6].map((n) => pieza(n, { gasto: 30, resultados: 10, angulo: "espacio" })),
    ]),
  };

  it("con la misma muestra mínima, el ángulo más barato y el más caro de su etapa", () => {
    const p = preferenciasDeAnuncios(enPauta);
    expect(p.mejores.find((x) => x.rasgo === "angulo")).toMatchObject({ id: "sofa:visitas", nombre: "Las visitas", nombreRasgo: "ángulo de venta" });
    expect(p.peores.find((x) => x.rasgo === "angulo")).toMatchObject({ id: "sofa:espacio" });
    expect(p.linea).toMatch(/el ángulo de venta «Las visitas»/);
  });

  it("si la publicación no lo trae, el del hueco del plan donde corrió; sin ángulos, como antes", () => {
    const sinAngulo = { ...enPauta, publicaciones: Object.fromEntries(Object.entries(enPauta.publicaciones).map(([k, e]) => [k, { ...e, post: { ...e.post, angulo: undefined, anguloNombre: undefined } }])) };
    expect(preferenciasDeAnuncios(sinAngulo).mejores.some((x) => x.rasgo === "angulo")).toBe(false);
    const angulos = new Map([1, 2, 3, 4, 5, 6].map((n) => [`cal1|p${n}`, { clave: n <= 3 ? "sofa:visitas" : "sofa:espacio", nombre: n <= 3 ? "Las visitas" : "El espacio" }]));
    expect(preferenciasDeAnuncios(sinAngulo, null, { angulos }).mejores.find((x) => x.rasgo === "angulo")).toMatchObject({ id: "sofa:visitas" });
  });

  it("el ángulo de una publicación: el objeto del motor o un texto; se recuerda en la foto de «En pauta»", () => {
    expect(anguloDePost({ angulo: { id: "visitas", productoId: "sofa", nombre: "Las visitas" } })).toEqual({ clave: "sofa:visitas", nombre: "Las visitas" });
    expect(anguloDePost({ angulo: "Las visitas que se quedan" })).toEqual({ clave: "las-visitas-que-se-quedan", nombre: "Las visitas que se quedan" });
    expect(anguloDePost({})).toBeNull();
    expect(fotoDePublicacion({ title: "x", angulo: { id: "visitas", productoId: "sofa", nombre: "Las visitas" } })).toMatchObject({ angulo: "sofa:visitas", anguloNombre: "Las visitas" });
    expect(fotoDePublicacion({ title: "x" }).angulo).toBeUndefined();
  });
});
