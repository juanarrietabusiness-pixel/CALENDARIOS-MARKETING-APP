import { describe, it, expect, vi, beforeEach } from "vitest";

// La red del Estudio, de mentira: lo que se comprueba es lo que se PIDE.
const pedidos = [];
const fichasPedidas = [];
vi.mock("./estudio", async (original) => {
  const real = await original();
  return {
    ...real,
    pedirImagenes: vi.fn(async (_c, datos) => { pedidos.push(datos); return { trabajo: { id: `t${pedidos.length}`, estado: "hecho" } }; }),
    fichasDeDiseno: vi.fn(async (_c, datos) => {
      fichasPedidas.push(datos);
      return { concepto: "Serie azul", fichas: Object.fromEntries(datos.piezas.map((p) => [p.n, { ficha: `Pieza: ficha ${p.n}.`, ...(p.n === 1 ? { plantilla: "plantilla-a" } : {}) }])) };
    }),
  };
});
vi.mock("./carruselEstudio", () => ({
  esperarArchivos: vi.fn(async (_c, t) => [{ id: `a-${t.id}`, clave: `clientes/c1/estudio/${t.id}.png`, src: `/api/media/clientes/c1/estudio/${t.id}.png`, tipo: "imagen" }]),
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

  it("el plan arma cada pieza por el camino de UNA pieza, con el modelo del cliente, la plantilla y su costo", () => {
    const plan = planDePiezas(ctx(), [
      { titulo: "Envío gratis", ficha: "Pieza: post.\nTexto: titular «Envío gratis».", formato: "vertical", plantilla_id: "plantilla-a" },
      { titulo: "Sin ficha", ficha: "" },
    ]);
    expect(plan[0].modelo.id).toBe("muse-image");
    expect(plan[0].pedido.prompt).toMatch(/^Escena: Pieza: post\./);
    expect(plan[0].pedido.prompt).toMatch(/Sigue el diseño de la plantilla «Oferta»/);
    expect(plan[0].pedido.medios.reference).toContain("clientes/c1/p.png");
    expect(plan[0].pedido.ajustes.aspectRatio).toBe("4:5");
    expect(plan[1].error).toMatch(/Falta la ficha/);
    expect(costoDelPlan(plan)).toBeCloseTo(plan[0].costo);
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

  it("diseña la tanda de una vez; lo que ya trae su ficha (sin nada que cambiar) no espera", async () => {
    const ideas = [
      { id: "a", titular: "Uno", escena: "Una sala" },
      { id: "b", titular: "Dos", escena: "Un cuarto", imagen: "Pieza: lista." },
      { id: "c", titular: "Tres", escena: "Un patio", pide: "más luz" },
    ];
    const r = await conFichas({ ideas, clienteId: "c1", modo: "ia", formato: "post", piezaDe: () => "Anuncio", indicacion: "" });
    expect(fichasPedidas).toHaveLength(1);
    expect(fichasPedidas[0].piezas.map((p) => p.escena)).toEqual(["Una sala", "Un patio"]);
    expect(fichasPedidas[0].piezas).toHaveLength(2);
    expect(fichasPedidas[0].piezas[1].indicacion).toBe("más luz");
    expect(r.find((i) => i.id === "a").ficha).toBe("Pieza: ficha 1.");
    expect(r.find((i) => i.id === "a").plantilla).toBe("plantilla-a");
    expect(r.find((i) => i.id === "b").ficha).toBeUndefined();
    // Con una indicación para toda la tanda, también se rediseña la que venía lista.
    fichasPedidas.length = 0;
    await conFichas({ ideas, clienteId: "c1", modo: "ia", indicacion: "fondo blanco" });
    expect(fichasPedidas[0].piezas).toHaveLength(3);
    expect(fichasPedidas[0].piezas.every((p) => p.indicacion.startsWith("fondo blanco"))).toBe(true);
  });
});
