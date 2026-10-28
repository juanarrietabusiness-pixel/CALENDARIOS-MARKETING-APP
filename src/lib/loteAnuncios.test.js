import { describe, it, expect } from "vitest";
import {
  limpiarCuantas, totalDeCuantas, cuantasPorDefecto, pedidoDeProduccion, leerProduccion, textoDeIdea, limpiarTitular,
  publicacionDePieza, nombreCarpetaLote, plantillaDeFormato, MAX_LOTE, MAX_POR_NIVEL, POR_NIVEL, celdasPorNiveles, celdasMatriz, celdasPorTipos,
  darForma, seVeElProducto, titularesUsados, aprenderComposiciones, COMPOSICIONES, TACTICAS, MIN_SENALES_COMPOSICION,
} from "./loteAnuncios";
import { PLANTILLAS_TEXTO } from "./carrusel";
import { pedidoDeLote, ideaDeLote, colaDeLote } from "./loteEstudio";
import { ideaParaMejorar, ideaSinMejorar, pedidoDePieza, apoyosDePieza } from "./pieza";
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
    expect(p).not.toMatch(/"guion"/);
    // En un carrusel o un reel, la IA escribe además su guion.
    const c = pedidoDeProduccion({ marca: "Dcasa", plan, formato: "carrusel" });
    expect(c).toMatch(/publicaciones de formato Carrusel/);
    expect(c).toMatch(/"guion": las láminas del carrusel siguiendo SU estructura/);
    expect(pedidoDeProduccion({ marca: "Dcasa", plan, formato: "reel" })).toMatch(/"guion": el reel de 10 s por planos/);
    const leidas = leerProduccion(JSON.stringify({ ideas: [{ n: 1, titular: "Hola", escena: "x", guion: "Portada: a\\nCTA: b" }] }), plan, "carrusel");
    expect(leidas[0].guion).toBe("Portada: a\nCTA: b");
    // En un post el guion sobra: no se lee.
    expect(leerProduccion(JSON.stringify({ ideas: [{ n: 1, titular: "Hola", escena: "x", guion: "Portada: a" }] }), plan)[0].guion).toBeUndefined();
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

  it("la idea que se mejora lleva escena, composición sugerida, texto exacto (si lo escribe el motor) y el brief; sin frases fijas de fondo", () => {
    const conForma = { ...idea, composicion: "uso", brief: "Lo que gana quien compra" };
    const m = ideaParaMejorar(ideaDeLote(conForma, { modo: "ia" }));
    expect(m).toMatch(/^Un sofá cama abierto en un estudio\n\nComposición sugerida: una persona real usando el producto/);
    expect(m).toMatch(/Texto en la imagen, exacto, legible y bien jerarquizado \(lo primero grande\): "Duerme mejor" \/ "Desde \$399"\./);
    expect(m).toMatch(/Contexto de la publicación: Lo que gana quien compra$/);
    expect(m).not.toMatch(/Fondo/);
    // Con plantilla el motor no escribe: no va el texto, y detrás va la zona libre.
    expect(ideaParaMejorar(ideaDeLote(conForma, { modo: "plantilla" }))).not.toMatch(/Texto en la imagen/);
    expect(colaDeLote(conForma, { modo: "plantilla" })).toMatch(/^Composición: En uso\. NO escribas ningún texto.*Deja .* limpio/);
    expect(colaDeLote({ ...idea, composicion: "heroe" }, { modo: "plantilla", formato: "historia" })).toMatch(/Deja el centro de la lámina limpio/);
    expect(colaDeLote(conForma, { modo: "ia" })).toBe("Composición: En uso.");
    expect(ideaSinMejorar(ideaDeLote({ ...conForma, conProducto: false }))).toMatch(/El producto NO aparece/);
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
    // El estilo del tipo (Anuncio → Fotográfico) va con su acabado.
    expect(p.prompt).toMatch(/Acabado de fotografía publicitaria profesional/);
    expect(ideaDelPedido(p.prompt)).toMatch(/^Un sofá cama abierto en un estudio NO escribas/);
    const frio = pedidoDeLote({ idea: { ...idea, conProducto: false }, kit, modelo: modeloPorId("nano-banana"), fotos, marca: "Dcasa" });
    expect(frio.medios.reference).toEqual(["clientes/c1/logo.png"]);
  });

  it("la misma pieza pide lo mismo por el lote que hecha a mano: el lote ES el camino individual", () => {
    const kit = { paleta: [{ hex: "#112233", nombre: "azul" }], logo: "clientes/c1/logo.png" };
    const fotos = [{ clave: "clientes/c1/sofa.jpg", producto: { nombre: "Sofá cama", marca: "" } }];
    const modelo = modeloPorId("nano-banana-2");
    const escena = "Una sala luminosa con el sofá cama abierto; el texto «Duerme mejor» arriba, grande.";
    const delLote = pedidoDeLote({ idea: { ...idea, composicion: "uso" }, escena, kit, preset: "anuncio", modo: "ia", formato: "post", modelo, fotos, marca: "Dcasa" });
    const aMano = pedidoDePieza({
      kit, idea: escena, extra: "Composición: En uso.", preset: "anuncio", modelo, marca: "Dcasa", aspectRatio: "4:5",
      apoyos: apoyosDePieza({ kit, preset: "anuncio", fotos, modelo, tomaTipo: ["estilo"] }),
    });
    expect(delLote).toEqual(aMano);
    // En alta resolución: un modelo con tamaño pide 2K aunque por defecto sea 1K.
    expect(delLote.ajustes.imageSize).toBe("2K");
  });

  it("al calendario: título, brief como idea, texto de la pieza, descripción, tipo y matriz, pendiente", () => {
    const post = publicacionDePieza({
      id: "p1", idea: { ...idea, titulo: "Duerme mejor hoy", brief: "Lo que gana", descripcion: "Escríbenos.", tipo: "anuncio", deseo: "Tranquilidad", perfil: "Mamá", productoId: "sofa" },
      archivo: { src: "/api/media/clientes/c1/a.jpg", ancho: 1080, alto: 1350 }, formato: "historia", producto: { id: "sofa", nombre: "Sofá cama" },
    });
    expect(post).toEqual({
      id: "p1", format: "historia", title: "Duerme mejor hoy", idea: "Lo que gana", escena: "Un sofá cama abierto en un estudio", textoPieza: "Duerme mejor\nDesde $399", descripcion: "Escríbenos.",
      pilar: "anuncio", nivel: "producto", productoId: "sofa", producto: "Sofá cama", deseo: "Tranquilidad", perfil: "Mamá", status: "pending",
      medios: [{ src: "/api/media/clientes/c1/a.jpg", tipo: "imagen", ancho: 1080, alto: 1350 }],
    });
    expect(nombreCarpetaLote("Sofá cama", new Date("2026-10-12T15:00:00Z"))).toBe("Lote Sofá cama · 12 oct");
    // Sólo la idea (sin diseño): el cliente aprueba la idea; con el guion de un carrusel, va en la publicación.
    const soloIdea = publicacionDePieza({ id: "p2", idea: { ...idea, guion: "Portada: x\nCTA: y" }, formato: "carrusel" });
    expect(soloIdea).toMatchObject({ format: "carrusel", aprobacion: "idea", guion: "Portada: x\nCTA: y", escena: "Un sofá cama abierto en un estudio" });
    expect(soloIdea.medios).toBeUndefined();
    // Varias láminas (un carrusel hecho) o un video (un reel).
    expect(publicacionDePieza({ id: "p3", idea, formato: "reel", archivos: [{ src: "/v.mp4", tipo: "video" }] }).medios).toEqual([{ src: "/v.mp4", tipo: "video" }]);
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

describe("el plan del mes en el lote: hashtags, estrategia y lo que se guarda en la publicación", () => {
  it("los hashtags, limpios: cada uno con su «#», sin repetir", async () => {
    const { limpiarHashtags } = await import("./loteAnuncios.js");
    expect(limpiarHashtags("#Sofá cama, #sofá  ##Panamá #cama")).toBe("#Sofá #cama #sofá #Panamá");
    expect(limpiarHashtags(["uno", "#dos"])).toBe("#uno #dos");
    expect(limpiarHashtags("")).toBe("");
  });

  it("la estrategia del mes: sólo lo escrito, con el concepto de cada semana", async () => {
    const { textoEstrategiaDelMes } = await import("./loteAnuncios.js");
    expect(textoEstrategiaDelMes(null)).toBe("");
    expect(textoEstrategiaDelMes({ campana: "", semanas: ["", ""] })).toBe("");
    const t = textoEstrategiaDelMes({ campana: "Marzo cómodo", codigo: "COMODO", semanas: ["Descanso", "", "Visitas"] });
    expect(t).toMatch(/Campaña: Marzo cómodo/);
    expect(t).toMatch(/Código promocional: COMODO/);
    expect(t).toMatch(/- Semana 1: Descanso\n- Semana 3: Visitas/);
  });

  it("la publicación de una idea guarda su formato, la forma, los hashtags; un carrusel no lleva texto de la pieza", async () => {
    const { publicacionDePieza } = await import("./loteAnuncios.js");
    const idea = { titulo: "T", titular: "¿Visitas?", escena: "Sala", brief: "B", composicion: "uso", tactica: "pregunta", hashtags: "#a", formato: "carrusel", guion: "Portada: x" };
    const p = publicacionDePieza({ id: "p", idea, formato: "post" });
    expect(p).toMatchObject({ format: "carrusel", composicion: "uso", tactica: "pregunta", hashtagsFinales: "#a", guion: "Portada: x", aprobacion: "idea" });
    expect(p.textoPieza).toBeUndefined();
    expect(publicacionDePieza({ id: "q", idea: { ...idea, formato: undefined }, formato: "post" }).textoPieza).toBe("¿Visitas?");
  });

  it("al diseñarla después, la composición que decidió el plan va en el pedido (sugerida)", async () => {
    const { promptDePublicacion } = await import("./estudio.js");
    expect(promptDePublicacion({ escena: "Una sala", composicion: "uso" })).toMatch(/^Una sala\n\nComposición sugerida: una persona real usando el producto/);
    expect(promptDePublicacion({ escena: "Una sala", composicion: "inventada" })).toBe("Una sala");
  });
});
