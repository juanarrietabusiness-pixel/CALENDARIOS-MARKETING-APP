import { describe, it, expect } from "vitest";
import {
  ideaDelPedido, PREFIJO_TIPO, referenciasDePreset, MAX_REFS_PRESET, limpiarKit, kitVacio, textoPaleta, textoPreset, componerPedido, ponerLogo, pedidoDeKit, leerKit, fundirKit,
  pedidoDeRevision, leerRevision, TIPOS_PRESET, IDS_PRESET, LINEA_VIDEO, LINEA_LOGO, ACABADOS, bloqueDeMarca, presetValido, presetActual,
  nombreDePreset, pedidoConMarca, estiloDeMarca, ESTILOS_VISUALES, estiloDeLaPieza, lineaDeEstilo, nombreDeEstilo, referenciasDePersonajes, MAX_PERSONAJES,
} from "./kitMarca";
import { PILARES, presetDePilar } from "./pilares";

const KIT = {
  paleta: [{ hex: "#152473", nombre: "azul marino", rol: "dominante" }, { hex: "#ffb400", nombre: "amarillo", rol: "solo acento" }, { hex: "rojo" }],
  tipografia: "Anton y Barlow",
  estilo: "industrial, sólido y confiable",
  luz: "fuerte y directa",
  evitar: "Sin elementos recargados",
  logo: "clientes/c1/logo.png",
};

describe("el kit", () => {
  it("se limpia: colores sin hex fuera, hex en mayúsculas, logo sólo de clientes/", () => {
    const k = limpiarKit(KIT);
    expect(k.paleta.map((c) => c.hex)).toEqual(["#152473", "#FFB400"]);
    expect(k.logo).toBe("clientes/c1/logo.png");
    expect(limpiarKit({ logo: "../../secreto" }).logo).toBe("");
    expect(limpiarKit({ logo: "https://otro.com/a.png" }).logo).toBe("");
    expect(kitVacio(null)).toBe(true);
    expect(kitVacio(KIT)).toBe(false);
  });

  it("la paleta se escribe con su papel", () => {
    expect(textoPaleta(limpiarKit(KIT).paleta)).toBe("azul marino #152473 (dominante), amarillo #FFB400 (solo acento)");
  });
});

describe("el bloque de marca", () => {
  it("lleva la paleta, el estilo, la luz, la tipografía y el «nunca», sin puntos dobles", () => {
    const b = bloqueDeMarca({ ...KIT, estilo: "industrial, sólido y confiable." });
    expect(b).toMatch(/^Identidad de la marca \(obligatoria\):/);
    expect(b).toContain("Paleta estrictamente limitada a: azul marino #152473 (dominante), amarillo #FFB400 (solo acento); sin colores fuera de la paleta.");
    expect(b).toContain("Estilo de la marca: industrial, sólido y confiable.");
    expect(b).toContain("Luz: fuerte y directa.");
    expect(b).toContain("Si lleva texto, tipografía únicamente Anton y Barlow.");
    expect(b).toContain("Nunca: Sin elementos recargados.");
    expect(b).toContain("Sin texto inventado ni logos de otras marcas.");
    expect(b).not.toContain("..");
  });

  it("vacío sin nada que decir de la marca (un kit con sólo presets no dice cómo es)", () => {
    expect(bloqueDeMarca(null)).toBe("");
    expect(bloqueDeMarca({ presets: { anuncio: "Algo." } })).toBe("");
  });
});

describe("los presets", () => {
  it("uno por tipo de contenido del calendario: todo tipo tiene su preset, y existe", () => {
    expect(Object.keys(TIPOS_PRESET)).toEqual(["anuncio", "beneficios", "servicios", "educativo", "diferenciador", "maletas", "humano"]);
    for (const p of PILARES) expect(TIPOS_PRESET[p.preset], p.id).toBeTruthy();
    expect(IDS_PRESET).toContain("maletas-garantia");
    expect(IDS_PRESET).toContain("maletas-objeciones");
  });

  it("desde un post, el preset sale de su tipo (y en las 7 maletas, de la suya); lo de antes pasa por su alias", () => {
    expect(presetDePilar("anuncio")).toBe("anuncio");
    expect(presetDePilar("maletas", "testimonio")).toBe("maletas-testimonio");
    expect(presetDePilar("maletas", "inventado")).toBe("maletas");
    expect(presetDePilar("viral")).toBe("humano");
    expect(presetDePilar("comunidad")).toBe("humano");
    expect(presetDePilar("")).toBe("");
  });

  it("sin preset escrito, la plantilla del tipo SIN la paleta (la paleta va en el bloque de marca)", () => {
    const t = textoPreset(KIT, "servicios", { marca: "Rofer Service", rubro: "maquinaria pesada" });
    expect(t).toMatch(/^Pieza de producto o servicio de Rofer Service \(maquinaria pesada\)/);
    expect(t).not.toContain("#152473");
    const m = textoPreset(KIT, "maletas-garantia", { marca: "Rofer" });
    expect(m).toMatch(/^Pieza de confianza de Rofer/);
    expect(m).toContain(TIPOS_PRESET.maletas.subtipos.garantia.linea);
    expect(textoPreset(KIT, "inventado")).toBe("");
  });

  it("el escrito (por la IA o a mano) manda; una de las 7 maletas suma su línea al escrito de las maletas", () => {
    expect(textoPreset({ ...KIT, presets: { anuncio: "Mi preset de anuncio." } }, "anuncio")).toBe("Mi preset de anuncio.");
    expect(textoPreset({ ...KIT, presets: { maletas: "Confianza Rofer." } }, "maletas-solucion")).toBe(`Confianza Rofer. ${TIPOS_PRESET.maletas.subtipos.solucion.linea}`);
  });

  it("los de antes se traducen: producto pasa a Producto / Servicio; corporativo y creativo (un aspecto, no un mensaje), a estilos propios", () => {
    const k = limpiarKit({ ...KIT, presets: { producto: "P viejo.", anuncio: "A viejo.", corporativo: "C viejo.", creativo: "Cr viejo." } });
    expect(k.presets).toEqual({ anuncio: "A viejo.", servicios: "P viejo." });
    expect(k.propios).toEqual([]);
    expect(k.estilos).toEqual([{ id: "estilo-corporativo", nombre: "Corporativo", texto: "C viejo." }, { id: "estilo-creativo", nombre: "Creativo", texto: "Cr viejo." }]);
    // Guardar lo limpio y volver a limpiarlo no duplica nada.
    expect(limpiarKit(k)).toEqual(k);
    expect(presetActual("producto", k)).toBe("servicios");
    expect(presetActual("corporativo", k)).toBe("");
    expect(presetActual("anuncio", KIT)).toBe("anuncio");
    expect(nombreDePreset("maletas-garantia", k)).toBe("7 maletas · Garantía");
    // Un propio de aspecto guardado como preset propio pasa a estilo con sus referencias.
    const viejo = limpiarKit({ propios: [{ id: "propio-corporativo", nombre: "Corporativo", texto: "C." }, { id: "propio-navidad", nombre: "Navidad", texto: "N." }], referencias: { "propio-corporativo": ["clientes/c1/a.png"] } });
    expect(viejo.propios.map((p) => p.id)).toEqual(["propio-navidad"]);
    expect(viejo.estilos).toEqual([{ id: "estilo-corporativo", nombre: "Corporativo", texto: "C." }]);
    expect(viejo.referencias["estilo-corporativo"]).toEqual(["clientes/c1/a.png"]);
  });

  it("el estilo de una pieza: el escogido, el fijado para su tipo o el de la casa; y su línea va en el pedido", () => {
    const k = limpiarKit({ ...KIT, estilos: [{ id: "estilo-lujo", nombre: "Lujo", texto: "Acabado de lujo." }], estiloPorTipo: { anuncio: "estilo-lujo", educativo: "noexiste", inventado: "grafico" } });
    expect(k.estiloPorTipo).toEqual({ anuncio: "estilo-lujo" });
    expect(estiloDeLaPieza(k, "anuncio", "")).toBe("estilo-lujo");
    expect(estiloDeLaPieza(k, "anuncio", "editorial")).toBe("editorial");
    expect(estiloDeLaPieza(k, "humano", "")).toBe("natural");
    expect(estiloDeLaPieza(k, "maletas-garantia", "")).toBe("natural");
    expect(estiloDeLaPieza(k, "", "")).toBe("");
    expect(estiloDeLaPieza(k, "propio-x", "")).toBe("");
    expect(lineaDeEstilo(k, "estilo-lujo")).toBe("Acabado de lujo.");
    expect(nombreDeEstilo(k, "grafico")).toBe("Diseño gráfico");
    const p = pedidoConMarca({ kit: k, idea: "Un sofá", preset: "educativo" });
    expect(p).toContain(ESTILOS_VISUALES.grafico.linea);
    expect(p.indexOf("Escena: Un sofá")).toBe(0);
    expect(pedidoConMarca({ kit: k, idea: "Un sofá", preset: "educativo", estilo: "estudio" })).toContain(ESTILOS_VISUALES.estudio.linea);
    // El «acabado» de antes sigue valiendo.
    expect(componerPedido({ idea: "x", acabado: "natural" })).toContain(ESTILOS_VISUALES.natural.linea);
    expect(estiloDeMarca(k, "anuncio")).toContain("Acabado de lujo.");
  });

  it("los propios: id con forma, nombre y texto; sin repetir; como mucho seis", () => {
    const muchos = Array.from({ length: 9 }, (_, i) => ({ id: `propio-x${i}`, nombre: `P${i}`, texto: "t" }));
    const k = limpiarKit({ propios: [{ id: "malo", nombre: "a", texto: "b" }, { id: "propio-a", nombre: "", texto: "b" }, ...muchos, { id: "propio-x0", nombre: "otra", texto: "t" }] });
    expect(k.propios.map((p) => p.id)).toEqual(["propio-x0", "propio-x1", "propio-x2", "propio-x3", "propio-x4", "propio-x5"]);
    expect(presetValido("propio-x1", k)).toBe(true);
    expect(presetValido("propio-x8", k)).toBe(false);
    expect(kitVacio({ propios: [{ id: "propio-a", nombre: "a", texto: "b" }] })).toBe(false);
  });
});

describe("el pedido", () => {
  it("tipo de pieza + acabado + escena + marca + logo, y en video el movimiento; sin nada, la idea tal cual", () => {
    // La escena PRIMERO: con el tipo delante fijando la composición, el motor le hacía caso a él y no a la idea.
    expect(componerPedido({ idea: "Una excavadora al atardecer", preset: "PRESET." })).toBe(`Escena: Una excavadora al atardecer\n\n${PREFIJO_TIPO} PRESET.`);
    expect(componerPedido({ idea: "x", preset: "P.", video: true })).toBe(`Escena: x\n\n${PREFIJO_TIPO} P.\n\n${LINEA_VIDEO}`);
    expect(componerPedido({ idea: " sola " })).toBe("sola");
    expect(componerPedido({ idea: "x", preset: "P.", acabado: "grafico", marca: "MARCA.", logo: true }))
      .toBe(`Escena: x\n\n${PREFIJO_TIPO} P.\n\n${ACABADOS.grafico.linea}\n\nMARCA.\n\n${LINEA_LOGO}`);
  });

  it("SIN tipo, la marca va igual: era lo que faltaba desde un post sin tipo", () => {
    const p = pedidoConMarca({ kit: KIT, idea: "Una excavadora", marca: "Rofer", logo: true });
    expect(p).toMatch(/^Escena: Una excavadora/);
    expect(p).toContain("#152473");
    expect(p).toContain(LINEA_LOGO);
    expect(pedidoConMarca({ kit: KIT, idea: "Una excavadora", usarKit: false, logo: true })).toBe("Una excavadora");
    // En video el logo no va (sería el primer fotograma), aunque se pida.
    expect(pedidoConMarca({ kit: KIT, idea: "x", video: true, logo: true })).not.toContain(LINEA_LOGO);
  });

  it("el estilo entero para el carrusel: el preset y la marca en un texto", () => {
    const e = estiloDeMarca(KIT, "anuncio", { marca: "Rofer" });
    expect(e).toMatch(/^Anuncio de venta directa de Rofer/);
    expect(e).toContain("Identidad de la marca");
    expect(estiloDeMarca(null, "")).toBe("");
  });

  it("de un pedido compuesto se recupera la escena, empiece o no por ella", () => {
    expect(ideaDelPedido(componerPedido({ idea: "Una excavadora", preset: "P.", video: true }))).toBe("Una excavadora");
    expect(ideaDelPedido(pedidoConMarca({ kit: KIT, idea: "Sin tipo", marca: "R" }))).toBe("Sin tipo");
    expect(ideaDelPedido("una idea suelta")).toBe("una idea suelta");
  });

  it("el logo va de referencia sólo en imágenes con hueco", () => {
    const m = { referencias: 3 };
    expect(ponerLogo({ kit: KIT, tipo: "imagen", modelo: m, referencias: [] })).toBe(true);
    expect(ponerLogo({ kit: KIT, tipo: "video", modelo: m, referencias: [] })).toBe(false);
    expect(ponerLogo({ kit: KIT, tipo: "imagen", modelo: { referencias: 0 }, referencias: [] })).toBe(false);
    expect(ponerLogo({ kit: KIT, tipo: "imagen", modelo: { referencias: 1 }, referencias: ["clientes/c1/x.png"] })).toBe(false);
    expect(ponerLogo({ kit: KIT, tipo: "imagen", modelo: m, referencias: ["clientes/c1/logo.png"] })).toBe(false);
    expect(ponerLogo({ kit: { ...KIT, logo: "" }, tipo: "imagen", modelo: m })).toBe(false);
  });
});

describe("la IA", () => {
  it("el pedido del kit lleva lo que sabemos y los ejemplos de la agencia", () => {
    const p = pedidoDeKit({ marca: "Baby Caleb", rubro: "bebés", guia: "Colores: azul #1B3246", ficha: "Marca orgánica" });
    expect(p).toContain("Baby Caleb (bebés)");
    expect(p).toContain("azul #1B3246");
    expect(p).toContain("no inventes colores");
    expect(p).toMatch(/Ejemplo 2 \(maquinaria pesada\)/);
    // Un preset por tipo de contenido, y la paleta fuera de ellos (va aparte en todo pedido).
    for (const id of Object.keys(TIPOS_PRESET)) expect(p).toContain(`"${id}":"…"`);
    expect(p).toContain("NO repitas la paleta");
  });

  it("al fundir lo que propone la IA se conservan los presets propios (la IA no los escribe)", () => {
    const guardado = { logo: "clientes/c1/logo.png", propios: [{ id: "propio-feria", nombre: "Feria", texto: "C." }], estilos: [{ id: "estilo-lujo", nombre: "Lujo", texto: "L." }], estiloPorTipo: { anuncio: "estilo-lujo" } };
    const f = fundirKit(guardado, limpiarKit({ presets: { anuncio: "A." } }), "2026-10-12T00:00:00Z");
    expect(f.propios).toEqual(guardado.propios);
    expect(f.estilos).toEqual(guardado.estilos);
    expect(f.estiloPorTipo).toEqual(guardado.estiloPorTipo);
    expect(f.presets).toEqual({ anuncio: "A." });
  });

  it("lee el kit sin tocar el logo, y al fundir conserva el que había", () => {
    const r = leerKit('Listo: {"paleta":[{"hex":"#1b3246","rol":"estructura"}],"tipografia":"Montserrat","presets":{"producto":"P"},"logo":"clientes/x/y.png","dudas":"ninguna"}');
    expect(r.kit.paleta[0].hex).toBe("#1B3246");
    expect(r.kit.logo).toBe("");
    expect(r.dudas).toBe("ninguna");
    const f = fundirKit({ logo: "clientes/c1/logo.png" }, r.kit, "2026-10-06T00:00:00Z");
    expect(f).toMatchObject({ logo: "clientes/c1/logo.png", tipografia: "Montserrat", preparadoAt: "2026-10-06T00:00:00Z" });
    expect(leerKit("nada")).toBeNull();
  });

  it("la revisión: el pedido lleva el kit y se lee el puntaje entre 0 y 10", () => {
    const p = pedidoDeRevision({ marca: "Rofer", kit: KIT, prompt: "Excavadora" });
    expect(p).toContain("azul marino #152473 (dominante)");
    expect(p).toContain("Lo que se pidió: Excavadora");
    expect(leerRevision('{"puntaje":14,"cumple":["paleta"],"falla":["texto inventado"],"sugerencia":"sin texto"}'))
      .toEqual({ puntaje: 10, cumple: ["paleta"], falla: ["texto inventado"], sugerencia: "sin texto" });
    expect(leerRevision("no")).toBeNull();
  });
});

describe("la referencia visual de cada tipo de pieza", () => {
  it("se guardan como mucho dos claves de clientes/ por tipo que exista (o por propio)", () => {
    const k = limpiarKit({
      propios: [{ id: "propio-a", nombre: "Navidad", texto: "t" }],
      referencias: { anuncio: ["clientes/c1/a.jpg", "clientes/c1/a.jpg", "clientes/c1/b.jpg", "clientes/c1/c.jpg"], inventado: ["clientes/c1/x.jpg"], "propio-a": ["clientes/c1/n.jpg", "otra/cosa.jpg", "clientes/c1/../c2/x.jpg"] },
    });
    expect(k.referencias).toEqual({ anuncio: ["clientes/c1/a.jpg", "clientes/c1/b.jpg"], "propio-a": ["clientes/c1/n.jpg"] });
    expect(MAX_REFS_PRESET).toBe(2);
  });
  it("van sólo las que siguen en la galería, con qué se toma y la nota; una maleta usa las de las maletas", () => {
    const kit = { referencias: { anuncio: ["clientes/c1/a.jpg", "clientes/c1/borrada.jpg"], maletas: ["clientes/c1/m.jpg"] } };
    const archivos = [{ id: "1", clave: "clientes/c1/a.jpg", src: "/api/media/clientes/c1/a.jpg" }, { id: "2", clave: "clientes/c1/m.jpg" }];
    const refs = referenciasDePreset(kit, "anuncio", archivos);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ clave: "clientes/c1/a.jpg", toma: ["estilo", "composicion"], nota: "es la referencia visual de las piezas «Anuncio»" });
    expect(referenciasDePreset(kit, "maletas-garantia", archivos, { toma: ["estilo"] })[0]).toMatchObject({ clave: "clientes/c1/m.jpg", toma: ["estilo"] });
    expect(referenciasDePreset(kit, "", archivos)).toEqual([]);
  });
});

describe("los personajes de la marca", () => {
  it("se limpian (id, nombre, de 1 a 2 imágenes del cliente) y van de referencia diciendo QUIÉN son", () => {
    const k = limpiarKit({ personajes: [
      { id: "personaje-caleb", nombre: "Caleb", descripcion: "bebé pelirrojo, traje verde.", imagenes: ["clientes/c1/caleb.png", "clientes/c1/caleb-cuerpo.png", "clientes/c1/otra.png"] },
      { id: "personaje-sin", nombre: "Sin foto", imagenes: [] },
      { id: "malo", nombre: "X", imagenes: ["clientes/c1/x.png"] },
    ] });
    expect(k.personajes).toEqual([{ id: "personaje-caleb", nombre: "Caleb", descripcion: "bebé pelirrojo, traje verde.", imagenes: ["clientes/c1/caleb.png", "clientes/c1/caleb-cuerpo.png"] }]);
    expect(kitVacio({ personajes: k.personajes })).toBe(false);
    const archivos = [{ id: "a", clave: "clientes/c1/caleb.png" }];
    const refs = referenciasDePersonajes(k, ["personaje-caleb"], archivos);
    expect(refs).toHaveLength(1);
    expect(refs[0].toma).toEqual(["persona"]);
    expect(refs[0].nota).toMatch(/es «Caleb», el personaje de la marca \(bebé pelirrojo, traje verde\): que salga IGUAL/);
    expect(referenciasDePersonajes(k, [], archivos)).toEqual([]);
    expect(MAX_PERSONAJES).toBe(4);
    // Volver a preparar el kit con IA no se los lleva.
    expect(fundirKit(k, limpiarKit({})).personajes).toEqual(k.personajes);
  });
});


describe("reglas que no se rompen y quién pone el logo", () => {
  const kit = { paleta: [{ hex: "#112233", nombre: "Azul", rol: "fondo" }], logo: "clientes/c1/estudio/logo.png", reglas: ["El texto ocupa como mucho un tercio.", "el texto ocupa como mucho un tercio", "  ", "Nunca tapar la cara del bebé"] };

  it("se limpian (sin repetir ni vacías) y van en TODA pieza y en la revisión", () => {
    expect(limpiarKit(kit).reglas).toEqual(["El texto ocupa como mucho un tercio", "Nunca tapar la cara del bebé"]);
    expect(bloqueDeMarca(kit)).toContain("Reglas que no se rompen: El texto ocupa como mucho un tercio; Nunca tapar la cara del bebé.");
    expect(pedidoDeRevision({ marca: "Baby Caleb", kit })).toContain("Reglas que no se rompen:");
    expect(kitVacio({ reglas: ["Logo siempre abajo"] })).toBe(false);
  });

  it("con el logo estampado, el modelo no lo recibe; lo de siempre es que lo ponga el modelo", () => {
    const modelo = { referencias: 3 };
    expect(limpiarKit(kit).logoModo).toBe("modelo");
    expect(ponerLogo({ kit, tipo: "imagen", modelo })).toBe(true);
    expect(ponerLogo({ kit: { ...kit, logoModo: "estampado" }, tipo: "imagen", modelo })).toBe(false);
    expect(limpiarKit({ logoModo: "otro" }).logoModo).toBe("modelo");
  });

  it("«Volver a preparar» con IA no se lleva las reglas ni la forma del logo", () => {
    const antes = { ...kit, logoModo: "estampado", logoPosicion: { esquina: "arriba-izquierda", tamano: 0.2 } };
    const nuevo = fundirKit(antes, { paleta: [{ hex: "#445566" }], reglas: ["inventada"], logoModo: "modelo" });
    expect(nuevo.reglas).toEqual(limpiarKit(kit).reglas);
    expect(nuevo.logoModo).toBe("estampado");
    expect(nuevo.logoPosicion).toMatchObject({ esquina: "arriba-izquierda", tamano: 0.2 });
  });
});
