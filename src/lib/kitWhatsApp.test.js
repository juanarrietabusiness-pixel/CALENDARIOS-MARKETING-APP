import { describe, it, expect } from "vitest";
import {
  limpiarKitWhatsApp, limpiarAtajo, kitVacio, productosDelKit, listaDePrecios, ponerPrecios, pedidoKitWhatsApp, leerKitWhatsApp,
  pendientesDelKit, cifrasDeDinero, avisosDelKit, bloquesEditados, fundirKitWhatsApp, kitATexto, guionATexto, etiquetaATexto,
  estudioTieneGarantia, ETIQUETAS_BASE, RESPUESTAS_BASE, MAX_RESPUESTAS,
} from "./kitWhatsApp.js";

// ============================================================
// El kit de WhatsApp Business (curso de campañas, entrega 8): lo que importa es que los PRECIOS los ponga el código,
// que lo inventado se avise y que «Volver a proponer» no pise lo editado a mano.
// ============================================================

const CATALOGO = [
  { id: "sofa", nombre: "Sofá cama", precio: "$450", oferta: "10% de descuento en efectivo" },
  { id: "mesa", nombre: "Mesa de centro", precio: "B/. 120" },
  { id: "silla", nombre: "Silla", precio: "", activo: true },
  { id: "viejo", nombre: "Viejo", precio: "$9", activo: false },
];
const PRODUCTOS = productosDelKit(CATALOGO);

const RESPUESTA_IA = JSON.stringify({
  bienvenida: "¡Hola! Te atiende el equipo de Dcasa. ¿Qué mueble buscas?",
  ausencia: "Ahora no estamos. Te respondemos [completar: el horario de atención].",
  respuestas: [
    { atajo: "/Precio", titulo: "Precios", texto: "Estos son nuestros precios:\n{precios}\n¿Cuál te interesa?" },
    { atajo: "envío", titulo: "Envíos", texto: "Enviamos a [completar: las zonas de envío]. ¿A dónde sería?" },
    { atajo: "precio", titulo: "Repetida", texto: "Otra con el mismo atajo" },
    { atajo: "", titulo: "", texto: "sin atajo" },
    { atajo: "garantia", titulo: "Garantía", texto: "Tiene garantía de 1 año.", objecion: true },
  ],
  etiquetas: [{ nombre: "Nuevo", etapa: "frio", cuando: "Escribió" }, { nombre: "nuevo", etapa: "x" }, { nombre: "Compró", etapa: "ascension" }],
  guiones: [
    { productoId: "sofa", saludo: "Hola", preguntas: ["¿Para qué espacio?", "", "¿Para cuándo?"], presentacion: "Se abre en 5 segundos.",
      objeciones: [{ objecion: "Es caro", respuesta: "Dura años." }], cierre: "Hoy con {oferta}, queda en {precio}. ¿Te lo aparto?", seguimiento: ["¿Pudiste verlo?"] },
    { productoId: "inventado", producto: "Mesa de centro", saludo: "Hola", cierre: "Cuesta {precio}." },
    { productoId: "silla", saludo: "Hola", cierre: "Cuesta {precio}. {oferta}" },
    { productoId: "nada", producto: "No existe", saludo: "Hola" },
  ],
});

describe("limpiar el kit", () => {
  it("el atajo: minúsculas, sin tildes, sin barra ni espacios", () => {
    expect(limpiarAtajo("/Envío Gratis!")).toBe("enviogratis");
    expect(limpiarAtajo("  ")).toBe("");
  });

  it("atajos sin repetir, sin vacíos; etapas por alias; etiquetas sin repetir", () => {
    const k = limpiarKitWhatsApp(JSON.parse(RESPUESTA_IA));
    expect(k.respuestas.map((r) => r.atajo)).toEqual(["precio", "envio", "precio2", "garantia"]);
    expect(k.respuestas[3].objecion).toBe(true);
    expect(k.etiquetas).toEqual([{ nombre: "Nuevo", etapa: "conversion", cuando: "Escribió" }, { nombre: "Compró", etapa: "ascension", cuando: "" }]);
    expect(k.guiones[0].preguntas).toEqual(["¿Para qué espacio?", "¿Para cuándo?"]);
  });

  it("como mucho 12 respuestas; `editado` sólo si es el booleano", () => {
    const muchas = Array.from({ length: 20 }, (_, i) => ({ atajo: `r${i}`, texto: "x", editado: i === 0 ? true : "si" }));
    const k = limpiarKitWhatsApp({ respuestas: muchas });
    expect(k.respuestas).toHaveLength(MAX_RESPUESTAS);
    expect(k.respuestas[0].editado).toBe(true);
    expect(k.respuestas[1].editado).toBeUndefined();
  });

  it("vacío sin nada", () => {
    expect(kitVacio({})).toBe(true);
    expect(kitVacio({ bienvenida: "Hola" })).toBe(false);
  });
});

describe("los precios salen del catálogo, exactos", () => {
  it("la lista de precios: sólo los activos con precio", () => {
    expect(PRODUCTOS.map((p) => p.id)).toEqual(["sofa", "mesa", "silla"]);
    expect(listaDePrecios(PRODUCTOS)).toBe("• Sofá cama: $450 (10% de descuento en efectivo)\n• Mesa de centro: B/. 120");
    expect(listaDePrecios([])).toMatch(/^\[completar:/);
  });

  it("leer la respuesta: casa los productos, pone {precio}, {precios} y {oferta}, y descarta lo que no es del catálogo", () => {
    const k = leerKitWhatsApp(RESPUESTA_IA, { productos: PRODUCTOS });
    expect(k.respuestas[0].texto).toContain("• Sofá cama: $450");
    const [sofa, mesa, silla] = k.guiones;
    expect(sofa.cierre).toBe("Hoy con 10% de descuento en efectivo, queda en $450. ¿Te lo aparto?");
    // Un id inventado se casa por el nombre.
    expect(mesa).toMatchObject({ productoId: "mesa", producto: "Mesa de centro", cierre: "Cuesta B/. 120." });
    // Sin precio en el catálogo: se marca para completar, y la oferta que no hay se quita.
    expect(silla.cierre).toBe("Cuesta [completar: el precio de Silla].");
    expect(k.guiones).toHaveLength(3);
  });

  it("sin etiquetas, las de partida", () => {
    const k = leerKitWhatsApp(JSON.stringify({ bienvenida: "Hola" }), { productos: PRODUCTOS });
    expect(k.etiquetas.map((t) => t.nombre)).toEqual(ETIQUETAS_BASE.map((t) => t.nombre));
    expect(leerKitWhatsApp("no es json")).toBeNull();
    expect(leerKitWhatsApp("{}")).toBeNull();
  });

  it("con un solo producto con precio, {precio} en una respuesta es ese precio", () => {
    const k = ponerPrecios({ respuestas: [{ atajo: "precio", texto: "Cuesta {precio}" }] }, [{ id: "a", nombre: "A", precio: "$5" }]);
    expect(k.respuestas[0].texto).toBe("Cuesta $5");
  });
});

describe("el pedido a la IA", () => {
  const t = pedidoKitWhatsApp({
    marca: "Dcasa", rubro: "Muebles", negocio: "vende productos",
    productos: [{ ...CATALOGO[0], tipo: "producto", maletas: { problema: "Poco espacio", garantia: "" }, objeciones: [{ objecion: "¿Envían?", respuesta: "Sí, a todo Panamá." }] }],
    ficha: "LA FICHA DEL CLIENTE (se sigue SIEMPRE):\n- Dónde está: Calle 50", contexto: "Tutea.",
  });

  it("lleva el producto con su id, sus maletas y sus objeciones, y la ficha", () => {
    expect(t).toContain("[sofa] Sofá cama");
    expect(t).toContain("Problema: Poco espacio");
    expect(t).toContain("Objeción: «¿Envían?» → Sí, a todo Panamá.");
    expect(t).toContain("Dónde está: Calle 50");
  });

  it("pide los marcadores de precio y prohíbe inventar", () => {
    expect(t).toContain("{precio}");
    expect(t).toContain("{precios}");
    expect(t).toMatch(/No inventes NADA/);
    expect(t).toContain("[completar:");
    for (const r of RESPUESTAS_BASE) expect(t).toContain(r.atajo);
    for (const e of ["presentacion", "evaluacion", "conversion", "ascension"]) expect(t).toContain(e);
  });
});

describe("lo que se revisa antes de copiar", () => {
  it("las cifras de dinero (y un descuento), no un «100 % algodón»", () => {
    expect(cifrasDeDinero("Cuesta $1.250 o 30 dólares, B/. 45,50; 20% de descuento; 100% algodón").map((c) => c.valor)).toEqual([1250, 45.5, 30, 20]);
  });

  it("avisa de cifras que no están en el catálogo, de una garantía que el estudio no tiene y de lo que falta", () => {
    const k = leerKitWhatsApp(RESPUESTA_IA, { productos: PRODUCTOS });
    k.respuestas.push({ atajo: "combo", titulo: "Combo", texto: "El combo sale en $999." });
    const avisos = avisosDelKit(k, { productos: PRODUCTOS, hayGarantia: false });
    expect(avisos.join(" ")).toContain("$999 (/combo)");
    expect(avisos.join(" ")).not.toContain("$450");
    expect(avisos.join(" ")).toContain("garantía");
    expect(avisos.join(" ")).toMatch(/Faltan 3 datos/);
    expect(avisosDelKit(k, { productos: PRODUCTOS, hayGarantia: true }).join(" ")).not.toContain("garantía y el estudio");
  });

  it("los pendientes, con su sitio", () => {
    const p = pendientesDelKit(leerKitWhatsApp(RESPUESTA_IA, { productos: PRODUCTOS }));
    expect(p).toContainEqual({ donde: "Ausencia", que: "el horario de atención" });
    expect(p).toContainEqual({ donde: "/envio", que: "las zonas de envío" });
    expect(p.some((x) => x.donde.startsWith("Guion de Silla"))).toBe(true);
  });

  it("¿el estudio tiene garantía?", () => {
    const estudio = { productos: { sofa: { elementos: { publico: "a", problema: "b", solucion: "c", garantia: "1 año" } } } };
    expect(estudioTieneGarantia(estudio)).toBe(true);
    expect(estudioTieneGarantia(null)).toBe(false);
  });
});

describe("volver a proponer no pisa lo editado", () => {
  const actual = {
    bienvenida: { texto: "Mi bienvenida", editado: true },
    ausencia: { texto: "Ausencia vieja" },
    respuestas: [{ atajo: "precio", texto: "Mía", editado: true }, { atajo: "envio", texto: "Vieja" }, { atajo: "cuotas", texto: "Propia", editado: true }],
    etiquetas: [{ nombre: "Nuevo", etapa: "presentacion" }],
    guiones: [{ productoId: "sofa", saludo: "Mi saludo", editado: true }],
    actualizado: "2026-11-01T10:00:00.000Z", por: "Ana",
  };
  const propuesto = {
    bienvenida: { texto: "Nueva bienvenida" }, ausencia: { texto: "Ausencia nueva" },
    respuestas: [{ atajo: "precio", texto: "Nueva" }, { atajo: "envio", texto: "Nueva envío" }, { atajo: "pago", texto: "Pago" }],
    etiquetas: [{ nombre: "Interesado", etapa: "evaluacion" }],
    guiones: [{ productoId: "sofa", saludo: "Nuevo saludo" }, { productoId: "mesa", saludo: "Hola mesa" }],
  };

  it("cuenta los bloques editados", () => {
    expect(bloquesEditados(actual)).toBe(4);
  });

  it("conserva lo editado (y lo propio que no está en la propuesta) y toma lo demás", () => {
    const f = fundirKitWhatsApp(actual, propuesto);
    expect(f.bienvenida.texto).toBe("Mi bienvenida");
    expect(f.ausencia.texto).toBe("Ausencia nueva");
    expect(f.respuestas.map((r) => `${r.atajo}:${r.texto}`)).toEqual(["precio:Mía", "envio:Nueva envío", "pago:Pago", "cuotas:Propia"]);
    expect(f.guiones.map((g) => g.saludo)).toEqual(["Mi saludo", "Hola mesa"]);
    expect(f).toMatchObject({ actualizado: actual.actualizado, por: "Ana" });
  });

  it("con permiso, lo reemplaza todo", () => {
    const f = fundirKitWhatsApp(actual, propuesto, { pisarEditado: true });
    expect(f.bienvenida.texto).toBe("Nueva bienvenida");
    expect(f.respuestas.map((r) => r.atajo)).toEqual(["precio", "envio", "pago"]);
  });

  it("si no cabe, se cae lo de la propuesta, nunca lo editado", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => ({ atajo: `p${i}`, texto: "x" }));
    const f = fundirKitWhatsApp({ respuestas: [{ atajo: "mia", texto: "m", editado: true }] }, { respuestas: muchas });
    expect(f.respuestas).toHaveLength(12);
    expect(f.respuestas.some((r) => r.atajo === "mia")).toBe(true);
  });
});

describe("para copiar", () => {
  const k = leerKitWhatsApp(RESPUESTA_IA, { productos: PRODUCTOS });

  it("todo el kit en orden: bienvenida, ausencia, respuestas, etiquetas y guiones", () => {
    const t = kitATexto(k, { marca: "Dcasa" });
    expect(t.startsWith("KIT DE WHATSAPP BUSINESS · Dcasa")).toBe(true);
    const orden = ["MENSAJE DE BIENVENIDA", "MENSAJE DE AUSENCIA", "RESPUESTAS RÁPIDAS", "/precio — Precios", "ETIQUETAS", "GUION DE VENTAS · Sofá cama"].map((x) => t.indexOf(x));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(kitATexto({})).toBe("");
  });

  it("un guion y una etiqueta", () => {
    const g = guionATexto(k.guiones[0]);
    expect(g).toContain("2. Para saber qué necesita\n• ¿Para qué espacio?");
    expect(g).toContain("4. Si pone un «pero»\n• «Es caro»");
    expect(etiquetaATexto({ nombre: "Cotizó", etapa: "conversion", cuando: "Tiene el precio" })).toBe("Cotizó (Conversión): Tiene el precio");
  });
});
