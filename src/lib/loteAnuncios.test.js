import { describe, it, expect } from "vitest";
import {
  limpiarCuantas, totalDeCuantas, cuantasPorDefecto, pedidoDeProduccion, leerProduccion, escenaDeAnuncio, textoDeIdea, limpiarTitular,
  publicacionDePieza, nombreCarpetaLote, plantillaDeFormato, MAX_LOTE, MAX_POR_NIVEL, POR_NIVEL, celdasPorNiveles, celdasMatriz, celdasPorTipos,
  darForma, seVeElProducto, titularesUsados, aprenderComposiciones, COMPOSICIONES, TACTICAS, MIN_SENALES_COMPOSICION,
} from "./loteAnuncios";
import { PLANTILLAS_TEXTO } from "./carrusel";
import { pedidoDeLote } from "./loteEstudio";
import { modeloPorId } from "./estudioCatalogo";
import { ideaDelPedido } from "./kitMarca";

describe("las casillas del lote", () => {
  it("por niveles: cinco en cada uno por defecto, sólo niveles que existen y con tope", () => {
    expect(cuantasPorDefecto()).toEqual({ inconsciente: POR_NIVEL, problema: POR_NIVEL, solucion: POR_NIVEL, producto: POR_NIVEL, decision: POR_NIVEL });
    expect(totalDeCuantas(cuantasPorDefecto())).toBe(25);
    expect(limpiarCuantas({ inconsciente: 3, inventado: 4, problema: -2, solucion: "x", producto: 99 })).toEqual({ inconsciente: 3, producto: MAX_POR_NIVEL });
    expect(totalDeCuantas({ inconsciente: 10, problema: 10, solucion: 10, producto: 10 })).toBe(MAX_LOTE);
    expect(celdasPorNiveles({ problema: 2, decision: 1 })).toEqual([{ tipo: "anuncio", nivel: "problema" }, { tipo: "anuncio", nivel: "problema" }, { tipo: "anuncio", nivel: "decision" }]);
  });

  it("la matriz: cada deseo × cada perfil × cada nivel, en orden de embudo, hasta 30", () => {
    const m = celdasMatriz({ deseos: ["Tranquilidad", "Familia", "Ahorro"], perfiles: ["Mamá primeriza", "Abuela"], niveles: ["decision", "inconsciente"] });
    expect(m).toHaveLength(12);
    expect(m.slice(0, 2)).toEqual([
      { tipo: "anuncio", nivel: "inconsciente", deseo: "Tranquilidad", perfil: "Mamá primeriza" },
      { tipo: "anuncio", nivel: "decision", deseo: "Tranquilidad", perfil: "Mamá primeriza" },
    ]);
    expect(celdasMatriz({ deseos: ["a", "b", "c"], perfiles: ["x", "y"] })).toHaveLength(30);
  });

  it("por tipos: cuántas de cada tipo, en el orden de los tipos", () => {
    expect(celdasPorTipos({ educativo: 2, maletas: 1, inventado: 4 })).toEqual([{ tipo: "educativo" }, { tipo: "educativo" }, { tipo: "maletas" }]);
  });
});

describe("la forma de cada pieza (darForma)", () => {
  const productos = [{ id: "a" }, { id: "b" }];

  it("el producto se ve de «solución» en adelante; en los niveles fríos y en los tipos sin producto, no", () => {
    expect(seVeElProducto({ tipo: "anuncio", nivel: "inconsciente" })).toBe(false);
    expect(seVeElProducto({ tipo: "anuncio", nivel: "producto" })).toBe(true);
    expect(seVeElProducto({ tipo: "educativo" })).toBe(false);
    expect(seVeElProducto({ tipo: "servicios" }, false)).toBe(false);
    const plan = darForma(celdasPorNiveles({ inconsciente: 2, decision: 2 }), { productos });
    expect(plan.map((r) => [r.nivel, r.conProducto, Boolean(r.productoId)])).toEqual([
      ["inconsciente", false, false], ["inconsciente", false, false], ["decision", true, true], ["decision", true, true],
    ]);
  });

  it("sin producto en cuadro no hay composiciones que necesiten un objeto, y dos vecinas nunca repiten", () => {
    const plan = darForma(celdasPorTipos({ educativo: 6, humano: 6 }), { productos });
    expect(plan.every((r) => !COMPOSICIONES.find((c) => c.id === r.composicion).objeto)).toBe(true);
    for (let i = 1; i < plan.length; i++) expect(plan[i].composicion).not.toBe(plan[i - 1].composicion);
  });

  it("un lote con producto: variado, con piezas en uso, y ganchos distintos", () => {
    const plan = darForma(celdasMatriz({ deseos: ["a", "b", "c"], perfiles: ["x", "y"], niveles: ["solucion", "producto", "decision"] }), { productos });
    expect(new Set(plan.map((r) => r.composicion)).size).toBeGreaterThanOrEqual(8);
    expect(plan.filter((r) => COMPOSICIONES.find((c) => c.id === r.composicion).uso).length).toBeGreaterThanOrEqual(Math.floor(plan.length / 3) - 1);
    expect(new Set(plan.map((r) => r.tactica)).size).toBe(TACTICAS.length);
    expect(new Set(plan.map((r) => r.productoId))).toEqual(new Set(["a", "b"]));
  });

  it("en una historia el texto nunca va abajo; la semilla cambia el punto de partida", () => {
    expect(darForma(celdasPorNiveles({ producto: 9 }), { formato: "historia", productos }).some((r) => r.plantilla === "banda")).toBe(false);
    expect(darForma(celdasPorNiveles({ producto: 3 }), { productos, semilla: 1 })[0].composicion)
      .not.toBe(darForma(celdasPorNiveles({ producto: 3 }), { productos })[0].composicion);
  });

  it("lo aprendido manda: las composiciones que gustan salen más y las de la papelera no salen", () => {
    const linea = (id) => COMPOSICIONES.find((c) => c.id === id).linea;
    const archivos = [
      ...Array.from({ length: 4 }, () => ({ prompt: `x ${linea("ugc")}`, favorito: true, usadoEn: [] })),
      ...Array.from({ length: 2 }, () => ({ prompt: `x ${linea("macro")}`, favorito: false, usadoEn: [{}] })),
      { prompt: linea("heroe"), favorito: true, subido: true },
    ];
    const papelera = Array.from({ length: 3 }, () => ({ prompt: `y ${linea("tipografica")}` }));
    const a = aprenderComposiciones(archivos, papelera);
    expect(a.senales).toBe(9);
    expect(a.puntos.ugc).toBe(8);
    expect(a.puntos.tipografica).toBe(-3);
    expect(a.orden[0]).toBe("ugc");
    expect(a.orden).not.toContain("tipografica");
    const plan = darForma(celdasPorNiveles({ producto: 10 }), { productos, orden: a.orden });
    expect(plan.some((r) => r.composicion === "tipografica")).toBe(false);
    expect(plan.filter((r) => r.composicion === "ugc").length).toBeGreaterThanOrEqual(2);
    // Con pocas señales no se aprende nada.
    expect(aprenderComposiciones(archivos.slice(0, MIN_SENALES_COMPOSICION - 2)).orden).toEqual([]);
  });
});

describe("lo que se le pide a la IA y cómo se lee", () => {
  const plan = darForma(celdasMatriz({ deseos: ["Tranquilidad"], perfiles: ["Mamá primeriza"], niveles: ["problema", "decision"] }), { productos: [{ id: "sofa" }] });

  it("el pedido da cada pieza resuelta: nivel con su ángulo, gancho, composición, a quién y el producto", () => {
    const p = pedidoDeProduccion({ marca: "Dcasa", plan, productos: { sofa: "Sofá cama · $399" }, perfiles: { "Mamá primeriza": "duerme poco" }, usados: ["Duerme mejor"] });
    expect(p).toMatch(/^1\. Anuncio: Pieza de venta directa/m);
    expect(p).toMatch(/nivel: Consciente del problema .*por el DOLOR/);
    expect(p).toMatch(/le habla a: Mamá primeriza, deseo de Tranquilidad/);
    expect(p).toMatch(/Los perfiles:\n- Mamá primeriza: duerme poco/);
    expect(p).toMatch(/producto: Sofá cama · \$399$/m);
    expect(p).toMatch(/40 caracteres y 8 palabras/);
    expect(p).toMatch(/ya salieron: no repitas[\s\S]*· Duerme mejor/);
    expect(p).toMatch(/"brief"/);
  });

  it("lee por número: título, brief, titular (sin «·»), apoyo, escena y descripción; cada una con lo que decidió el plan", () => {
    const ideas = leerProduccion(JSON.stringify({ ideas: [
      { n: 2, titulo: "Llévalo hoy", brief: "Cierre", titular: "Tu sala · lista hoy", apoyo: "Desde $399", escena: "El sofá en una sala", descripcion: "Escríbenos." },
      { n: 1, titular: "¿Duermes mal?", escena: "Una mamá cansada" },
    ] }), plan);
    expect(ideas.map((i) => [i.id, i.titular, i.titulo])).toEqual([["problema-1", "¿Duermes mal?", "¿Duermes mal?"], ["decision-1", "Tu sala. lista hoy", "Llévalo hoy"]]);
    expect(ideas[1]).toMatchObject({ brief: "Cierre", descripcion: "Escríbenos.", productoId: "sofa", conProducto: true, deseo: "Tranquilidad", elegida: true });
    expect(leerProduccion("nada", plan)).toEqual([]);
    expect(limpiarTitular("«Hola · mundo»")).toBe("Hola. mundo");
  });
});

describe("cada pieza", () => {
  const idea = { id: "producto-1", nivel: "producto", titular: "Duerme mejor", apoyo: "Desde $399", escena: "Un sofá cama abierto en un estudio" };

  it("con plantilla, el motor deja el hueco; con «lo escribe la IA», el texto va EXACTO y sobre una superficie real", () => {
    expect(escenaDeAnuncio(idea, { modo: "plantilla" })).toBe("Un sofá cama abierto en un estudio NO escribas ningún texto, letra ni número en la imagen: el texto se pone después. Deja el tercio inferior limpio y despejado, con buen contraste.");
    expect(escenaDeAnuncio(idea, { modo: "plantilla", formato: "historia" })).toMatch(/Deja el centro de la lámina limpio/);
    expect(escenaDeAnuncio(idea, { modo: "ia" })).toMatch(/EXACTO.*"Duerme mejor" \/ "Desde \$399"\. Ningún otro texto\. .*nunca sobre un velo pintado/);
    expect(escenaDeAnuncio({ ...idea, conProducto: false, composicion: "emocion", plantilla: "arriba" })).toMatch(/primer plano de una cara.*El producto NO aparece.*Deja el tercio superior/);
    expect(plantillaDeFormato("historia")).toBe("centro");
    expect(textoDeIdea(idea)).toBe("Duerme mejor\nDesde $399");
    expect(PLANTILLAS_TEXTO.degradado).toBeTruthy();
  });

  it("el pedido lleva el kit, la foto REAL del producto y el logo si cabe; sin las fotos cuando el producto no sale", () => {
    const kit = { paleta: [{ hex: "#112233", nombre: "azul" }], logo: "clientes/c1/logo.png" };
    const fotos = [{ clave: "clientes/c1/sofa.jpg", producto: { nombre: "Sofá cama", marca: "" } }];
    const p = pedidoDeLote({ idea, kit, preset: "anuncio", modo: "plantilla", formato: "historia", modelo: modeloPorId("nano-banana"), fotos, marca: "Dcasa", n: 3 });
    expect(p.medios.reference).toEqual(["clientes/c1/sofa.jpg", "clientes/c1/logo.png"]);
    expect(p.n).toBe(3);
    expect(p.ajustes.aspectRatio).toBe("9:16");
    expect(p.prompt).toMatch(/^Escena: Un sofá cama abierto en un estudio/);
    expect(p.prompt).toMatch(/Tipo de pieza .*: Anuncio de venta directa de Dcasa/);
    expect(p.prompt).toMatch(/Imagen de referencia 1: es la foto REAL del producto «Sofá cama»/);
    expect(ideaDelPedido(p.prompt)).toMatch(/^Un sofá cama abierto en un estudio NO escribas/);
    const frio = pedidoDeLote({ idea: { ...idea, conProducto: false }, kit, modelo: modeloPorId("nano-banana"), fotos, marca: "Dcasa" });
    expect(frio.medios.reference).toEqual(["clientes/c1/logo.png"]);
  });

  it("al calendario: título, brief como idea, texto de la pieza, descripción, tipo y matriz, pendiente", () => {
    const post = publicacionDePieza({
      id: "p1", idea: { ...idea, titulo: "Duerme mejor hoy", brief: "Lo que gana", descripcion: "Escríbenos.", tipo: "anuncio", deseo: "Tranquilidad", perfil: "Mamá", productoId: "sofa" },
      archivo: { src: "/api/media/clientes/c1/a.jpg", ancho: 1080, alto: 1350 }, formato: "historia", producto: { id: "sofa", nombre: "Sofá cama" },
    });
    expect(post).toEqual({
      id: "p1", format: "historia", title: "Duerme mejor hoy", idea: "Lo que gana", textoPieza: "Duerme mejor\nDesde $399", descripcion: "Escríbenos.",
      pilar: "anuncio", nivel: "producto", productoId: "sofa", producto: "Sofá cama", deseo: "Tranquilidad", perfil: "Mamá", status: "pending",
      medios: [{ src: "/api/media/clientes/c1/a.jpg", tipo: "imagen", ancho: 1080, alto: 1350 }],
    });
    expect(nombreCarpetaLote("Sofá cama", new Date("2026-10-12T15:00:00Z"))).toBe("Lote Sofá cama · 12 oct");
  });

  it("los titulares que ya salieron: del texto de la plantilla y del que se le pidió al motor", () => {
    expect(titularesUsados([
      { ajustes: { plantilla: { texto: "Duerme mejor\nDesde $399" } } },
      { prompt: 'Escena… Texto en la imagen, EXACTO, legible: "Hoy sí" / "Ya"' },
      { prompt: "nada" },
      { ajustes: { plantilla: { texto: "Duerme mejor" } } },
    ])).toEqual(["Duerme mejor", "Hoy sí"]);
  });
});
