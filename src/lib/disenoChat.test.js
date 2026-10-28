import { describe, it, expect, vi, beforeEach } from "vitest";

// La red del Estudio, de mentira: lo que se comprueba es lo que se PIDE.
const pedidos = [];
const fichasPedidas = [];
const ordenes = [];
vi.mock("./estudio", async (original) => {
  const real = await original();
  return {
    ...real,
    pedirImagenes: vi.fn(async (_c, datos) => { pedidos.push(datos); return { trabajo: { id: `t${pedidos.length}`, estado: "hecho" } }; }),
    carpetaDeGrupo: vi.fn(async () => "carpeta-1"),
    ordenarCarpeta: vi.fn(async (_c, id, orden) => { ordenes.push({ id, orden }); }),
    fichasDeDiseno: vi.fn(async (_c, datos) => {
      fichasPedidas.push(datos);
      return { concepto: "Serie azul", fichas: Object.fromEntries(datos.piezas.map((p) => [p.n, { ficha: `Pieza: ficha ${p.n}.`, ...(p.n === 1 ? { plantilla: "plantilla-a" } : {}) }])) };
    }),
  };
});
const carruseles = [];
vi.mock("./carruselEstudio", () => ({
  esperarArchivos: vi.fn(async (_c, t) => [{ id: `a-${t.id}`, clave: `clientes/c1/estudio/${t.id}.png`, src: `/api/media/clientes/c1/estudio/${t.id}.png`, tipo: "imagen" }]),
  crearCarrusel: vi.fn(async (datos) => {
    carruseles.push(datos);
    return datos.laminas.map((l) => { const r = { final: { id: `l${l.n}`, clave: `clientes/c1/l${l.n}.png` } }; datos.alAvanzar(l.n - 1, r); return r; });
  }),
}));
vi.mock("./controlEstudio", () => ({ controlEncendido: () => false, controlarYCorregir: vi.fn(), modeloParaCorregir: () => null }));

const { planDePiezas, crearPlan, costoDelPlan, textoDeLaFicha, modeloFinal, loQueFunciona, formatoDe } = await import("./disenoChat.js");
const { conFichas } = await import("./loteEstudio.js");

const kit = { logo: "clientes/c1/logo.png", modelos: { imagen: "muse-image" }, plantillas: [{ id: "plantilla-a", nombre: "Oferta", uso: "post", clave: "clientes/c1/p.png", sistema: "titular grande" }] };
const ctx = (activos = { meta: true, gemini: true }) => ({
  clienteId: "c1", cliente: { id: "c1", name: "D'CASA" }, activos, kit,
  g: { archivos: [{ id: "p", clave: "clientes/c1/p.png", src: "/api/media/clientes/c1/p.png", tipo: "imagen", favorito: true }], productos: [] },
});

describe("las herramientas de diseño del asistente", () => {
  beforeEach(() => { pedidos.length = 0; fichasPedidas.length = 0; });

  it("los productos que pasa el asistente (ids del catálogo) llevan sus fotos REALES, también varios en una pieza", () => {
    const productos = [
      { id: "s", nombre: "Sofá cama", fotos: ["clientes/c1/p/s1.png", "clientes/c1/p/s2.png"] },
      { id: "m", nombre: "Mesa de centro", fotos: ["clientes/c1/p/m1.png"] },
    ];
    const c = { ...ctx({ gemini: true }), kit: {}, g: { archivos: [], productos } };
    const [p] = planDePiezas(c, [{ titulo: "La sala", ficha: "Pieza: post.\nImagen principal: una sala.", productos: ["s", "m", "inventado"] }]);
    expect(p.productos).toEqual(["s", "m", "inventado"]);
    // Una de cada uno antes que la segunda de ninguno; el id que no existe no trae nada.
    expect(p.pedido.medios.reference.slice(0, 2)).toEqual(["clientes/c1/p/s1.png", "clientes/c1/p/m1.png"]);
    expect(p.pedido.prompt).toMatch(/foto REAL del producto «Sofá cama»/);
    expect(p.pedido.prompt).toMatch(/foto REAL del producto «Mesa de centro»/);
  });

  it("un carrusel del asistente lleva las fotos de sus productos en todas las láminas", async () => {
    carruseles.length = 0;
    const productos = [{ id: "s", nombre: "Sofá cama", fotos: ["clientes/c1/p/s1.png"] }];
    const c = { ...ctx({ gemini: true }), kit: {}, g: { archivos: [], productos } };
    const plan = planDePiezas(c, [{ titulo: "Portada", ficha: "Pieza: portada.", productos: ["s"] }, { titulo: "Dos", ficha: "Pieza: dos." }]);
    await crearPlan(c, plan, { carrusel: "Sofás" });
    expect(carruseles[0].fotos).toEqual(["clientes/c1/p/s1.png"]);
  });

  it("el plan arma cada pieza por el camino de UNA pieza, con el modelo del cliente, la plantilla y su costo", () => {
    const plan = planDePiezas(ctx(), [
      { titulo: "Envío gratis", ficha: "Pieza: post.\nTexto: titular «Envío gratis».", formato: "vertical", plantilla_id: "plantilla-a" },
      { titulo: "Sin ficha", ficha: "" },
    ]);
    // Con referencias (la plantilla y el logo) sigue Muse Image, el modelo del cliente: el Worker asegura el 4:5.
    expect(plan[0].modelo.id).toBe("muse-image");
    expect(plan[0].pedido.modelo).toBe("muse-image");
    expect(plan[0].pedido.prompt).toMatch(/^Escena: Pieza: post\./);
    expect(plan[0].pedido.prompt).toMatch(/Sigue el diseño de la plantilla «Oferta»/);
    expect(plan[0].pedido.medios.reference).toContain("clientes/c1/p.png");
    expect(plan[0].pedido.ajustes.aspectRatio).toBe("4:5");
    expect(plan[1].error).toMatch(/Falta la ficha/);
    expect(costoDelPlan(plan)).toBeCloseTo(plan[0].costo);
    // Una pieza sin referencias sigue con el modelo del cliente.
    const solo = planDePiezas({ ...ctx(), kit: { modelos: { imagen: "muse-image" } } }, [{ titulo: "x", ficha: "Pieza: post.", formato: "vertical" }]);
    expect(solo[0].modelo.id).toBe("muse-image");
  });

  it("«Final» usa el mejor modelo con llave; sin llave de ninguno, el del cliente", () => {
    expect(modeloFinal({ gemini: true }).id).toBe("nano-banana-pro");
    expect(modeloFinal({})).toBeNull();
    expect(planDePiezas(ctx({ gemini: true, meta: true }), [{ titulo: "x", ficha: "Pieza: x." }], { calidad: "final" })[0].modelo.id).toBe("nano-banana-pro");
  });

  it("crea de tres en tres (el botón es la confirmación) y devuelve cada pieza en su número", async () => {
    const plan = planDePiezas(ctx(), Array.from({ length: 5 }, (_, i) => ({ titulo: `P${i + 1}`, ficha: `Pieza: ${i + 1}.` })));
    const vistos = [];
    const r = await crearPlan(ctx(), plan, { alAvanzar: (n, e) => { if (e.archivo) vistos.push(n); } });
    expect(pedidos).toHaveLength(5);
    expect(pedidos.every((p) => p.confirmado === true)).toBe(true);
    expect(r.map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);
    expect(r.every((x) => x.archivo)).toBe(true);
    expect(vistos.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("un carrusel va por el camino de «Carrusel con IA» (en orden, con la ficha de cada lámina), a su carpeta y en orden", async () => {
    ordenes.length = 0;
    carruseles.length = 0;
    const plan = planDePiezas(ctx(), Array.from({ length: 4 }, (_, i) => ({ titulo: `L${i + 1}`, ficha: `Pieza: lámina ${i + 1}.\nTexto (exacto): titular «Uno ${i + 1}».` })));
    const vistos = [];
    const r = await crearPlan(ctx(), plan, { carrusel: "Envío gratis", alAvanzar: (n, e) => { if (e.archivo) vistos.push(n); } });
    expect(pedidos).toHaveLength(0);
    expect(carruseles).toHaveLength(1);
    const c = carruseles[0];
    expect(c.carpetaId).toBe("carpeta-1");
    expect(c.laminas.map((l) => l.rol)).toEqual(["portada", "contenido", "contenido", "cierre"]);
    expect(c.laminas[1]).toMatchObject({ texto: "Uno 2", ficha: expect.stringMatching(/^Pieza: lámina 2\./) });
    expect(c.logo).toBe("clientes/c1/logo.png");
    expect(vistos).toEqual([1, 2, 3, 4]);
    expect(ordenes).toEqual([{ id: "carpeta-1", orden: r.map((x) => x.archivo.id) }]);
  });

  it("el texto que debe tener una pieza sale de su ficha (para el control)", () => {
    expect(textoDeLaFicha("Pieza: x.\nTexto (exacto): titular «Envío gratis» (grande); botón «Escríbenos».")).toBe("Envío gratis\nEscríbenos");
    expect(textoDeLaFicha("Pieza: x.")).toBe("");
  });

  it("ver_lo_que_funciona: las plantillas primero y luego los «Me gusta», sin repetir", () => {
    const { texto, archivos } = loQueFunciona(ctx());
    expect(texto).toMatch(/plantilla-a · «Oferta»/);
    expect(archivos.map((a) => a.id)).toEqual(["p"]);
    expect(loQueFunciona({ ...ctx(), kit: {} }).texto).toMatch(/NO tiene kit de marca/);
  });

  it("el tamaño de una pieza en el chat sale de su proporción", () => {
    expect(formatoDe({ ajustes: { aspectRatio: "9:16" } })).toBe("story");
    expect(formatoDe({ ancho: 1080, alto: 1350 })).toBe("vertical");
  });
});

describe("el lote, con el director de arte", () => {
  beforeEach(() => { fichasPedidas.length = 0; });

  it("TODAS pasan por el director: el borrador del motor de ideas (`imagen`) ya no se lo salta", async () => {
    const ideas = [
      { id: "a", titular: "Uno", escena: "Una sala" },
      { id: "b", titular: "Dos", escena: "Un cuarto", imagen: "Pieza: lista." },
      { id: "c", titular: "Tres", escena: "Un patio", pide: "más luz" },
    ];
    const r = await conFichas({ ideas, clienteId: "c1", modo: "ia", formato: "post", piezaDe: () => "Anuncio", indicacion: "" });
    expect(fichasPedidas).toHaveLength(1);
    expect(fichasPedidas[0].piezas.map((p) => p.escena)).toEqual(["Una sala", "Un cuarto", "Un patio"]);
    // Sabe cuántas son en total: la serie.
    expect(fichasPedidas[0].serie).toBe(3);
    expect(fichasPedidas[0].piezas[2].indicacion).toBe("más luz");
    expect(r.find((i) => i.id === "a").ficha).toBe("Pieza: ficha 1.");
    expect(r.find((i) => i.id === "a").plantilla).toBe("plantilla-a");
    // La que ya diseñó el director (`ficha`) no se vuelve a pedir.
    fichasPedidas.length = 0;
    await conFichas({ ideas: [{ id: "d", escena: "Un balcón", ficha: "Pieza: ya." }], clienteId: "c1" });
    expect(fichasPedidas).toHaveLength(0);
    // Con una indicación para toda la tanda, va en cada pieza.
    await conFichas({ ideas, clienteId: "c1", modo: "ia", indicacion: "fondo blanco" });
    expect(fichasPedidas[0].piezas).toHaveLength(3);
    expect(fichasPedidas[0].piezas.every((p) => p.indicacion.startsWith("fondo blanco"))).toBe(true);
  });
});
