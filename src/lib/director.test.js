import { describe, it, expect } from "vitest";
import {
  asegurarTexto, limpiarFicha, leerFichas, pedidoDeFichas, instruccionDeDiseno, resumenDelKit, manualDeDiseno,
  MANUAL_DISENO_BASE, FORMATO_FICHA, MAX_FICHA,
} from "./director.js";
import { limpiarKit, bloqueDeMarca, referenciaDePlantilla, lineaDePlantillaEnPedido, fundirKit, MAX_PLANTILLAS } from "./kitMarca.js";

describe("la ficha de diseño", () => {
  it("sin líneas en blanco (el pedido del motor se parte por ellas) y con tope", () => {
    expect(limpiarFicha("Pieza: post.\n\n\nTexto: «Hola»  \n")).toBe("Pieza: post.\nTexto: «Hola»");
    expect(limpiarFicha("x".repeat(5000))).toHaveLength(MAX_FICHA);
  });

  it("el texto exacto se repone si la IA lo reescribió, en vez de tirar la ficha", () => {
    const ficha = "Pieza: post.\nTexto: titular «Sofa cama» (grande).";
    expect(asegurarTexto(ficha, "Sofá cama")).toMatch(/Texto exacto que va en la imagen[^\n]*«Sofá cama»/);
    // Si ya está (con o sin comillas), no se toca.
    expect(asegurarTexto("Texto: titular «Sofá cama».", "Sofá cama")).toBe("Texto: titular «Sofá cama».");
    expect(asegurarTexto("Texto: «Envío gratis» / «Todo noviembre»", "Envío gratis\nTodo noviembre")).not.toMatch(/Texto exacto/);
    // Sin texto que asegurar, la ficha tal cual.
    expect(asegurarTexto(ficha, "")).toBe(ficha);
  });
});

describe("el director de arte por tandas", () => {
  const piezas = [{ n: 1, idea: "Envío gratis", texto: "Envío gratis\nTodo noviembre" }, { n: 2, idea: "El sofá", sinTexto: true, indicacion: "fondo blanco" }];

  it("el pedido lleva el manual, la ficha, cada pieza y lo que pide la agencia (que manda)", () => {
    const p = pedidoDeFichas({ cliente: "D'CASA", piezas, marca: "Paleta: #1340B1", plantillas: [{ id: "plantilla-a", nombre: "Oferta", uso: "post", sistema: "titular grande" }] });
    expect(p).toContain(MANUAL_DISENO_BASE.split("\n")[0]);
    expect(p).toContain(FORMATO_FICHA.split("\n")[0]);
    expect(p).toMatch(/estas 2 piezas/);
    expect(p).toMatch(/texto EXACTO de la pieza: «Envío gratis» \/ «Todo noviembre»/);
    expect(p).toMatch(/SIN TEXTO en la imagen/);
    expect(p).toMatch(/LO QUE PIDE LA AGENCIA \(manda sobre todo lo demás\): fondo blanco/);
    expect(p).toMatch(/plantilla-a · «Oferta»/);
    // Sin kit, se le dice qué hacer.
    expect(pedidoDeFichas({ piezas })).toMatch(/aún no tiene kit de marca/);
  });

  it("lee una ficha por pieza, con el texto asegurado; lo que no se entiende, null", () => {
    const r = leerFichas(JSON.stringify({ concepto: "Noviembre azul", piezas: [{ n: 1, ficha: "Pieza: uno.\nTexto: «Envio gratis»" }, { n: 2, ficha: "Pieza: dos.", plantilla: "plantilla-a" }, { n: 9, ficha: "no existe" }] }), piezas);
    expect(r.concepto).toBe("Noviembre azul");
    expect(r.fichas[1].ficha).toMatch(/«Envío gratis» \/ «Todo noviembre»/);
    expect(r.fichas[2]).toEqual({ ficha: "Pieza: dos.", plantilla: "plantilla-a" });
    expect(r.fichas[9]).toBeUndefined();
    expect(leerFichas("no es json", piezas)).toBeNull();
  });
});

describe("el asistente como director creativo", () => {
  it("su instrucción lleva el manual (el de la agencia si lo escribió) y sus herramientas", () => {
    expect(instruccionDeDiseno(null)).toContain(MANUAL_DISENO_BASE);
    expect(instruccionDeDiseno({ diseno: "Siempre fondo blanco." })).toContain("Siempre fondo blanco.");
    expect(manualDeDiseno({ diseno: "  " })).toBe(MANUAL_DISENO_BASE);
    for (const h of ["disenar_piezas", "ver_lo_que_funciona", "corregir_pieza", "version_final", "guardar_regla", "poner_en_publicacion"]) expect(instruccionDeDiseno(null)).toContain(h);
  });

  it("sabe si el cliente tiene kit, y si no, que lo diga y ofrezca prepararlo", () => {
    expect(resumenDelKit({ vacio: true, cliente: "D'CASA" })).toMatch(/NO está preparado[\s\S]*Preparar con IA/);
    const kit = limpiarKit({ paleta: [{ hex: "#1340B1", nombre: "Azul" }], logo: "clientes/c1/logo.png", plantillas: [{ id: "plantilla-a", nombre: "Oferta", clave: "clientes/c1/a.png", uso: "post" }] });
    const r = resumenDelKit({ kit, marca: bloqueDeMarca(kit), cliente: "D'CASA" });
    expect(r).toMatch(/#1340B1/);
    expect(r).toMatch(/plantilla-a · «Oferta»/);
  });
});

describe("las plantillas del kit", () => {
  const kit = { plantillas: [{ id: "plantilla-a", nombre: "Oferta azul", uso: "post", clave: "clientes/c1/a.png", sistema: "SISTEMA DE DISEÑO DE LA SERIE (…): titular grande; el texto va arriba." }] };

  it("se limpian: id con forma, clave del cliente, uso conocido y tope", () => {
    const k = limpiarKit({ plantillas: [
      ...kit.plantillas,
      { id: "otra", nombre: "Mala", clave: "clientes/c1/b.png" },
      { id: "plantilla-b", nombre: "Sin clave", clave: "../fuera.png" },
      { id: "plantilla-c", nombre: "Uso raro", clave: "clientes/c1/c.png", uso: "valla" },
    ] });
    expect(k.plantillas.map((p) => p.id)).toEqual(["plantilla-a", "plantilla-c"]);
    expect(k.plantillas[1].uso).toBe("post");
    const muchas = Array.from({ length: MAX_PLANTILLAS + 3 }, (_, i) => ({ id: `plantilla-${i}`, nombre: `P${i}`, clave: `clientes/c1/${i}.png` }));
    expect(limpiarKit({ plantillas: muchas }).plantillas).toHaveLength(MAX_PLANTILLAS);
  });

  it("su imagen va de referencia por su DISEÑO (nunca su contenido), y sólo si sigue en la galería", () => {
    const ref = referenciaDePlantilla(kit, "plantilla-a");
    expect(ref).toMatchObject({ clave: "clientes/c1/a.png", toma: ["composicion", "estilo", "tipografia"] });
    expect(ref.nota).toMatch(/no copies su texto/);
    expect(referenciaDePlantilla(kit, "plantilla-a", [])).toBeNull();
    expect(referenciaDePlantilla(kit, "plantilla-a", [{ clave: "clientes/c1/a.png" }])).not.toBeNull();
    expect(lineaDePlantillaEnPedido(kit, "plantilla-a")).toMatch(/^Sigue el diseño de la plantilla «Oferta azul»[^:]*: titular grande/);
  });

  it("«Volver a preparar» el kit con IA no se las lleva", () => {
    expect(fundirKit(kit, { estilo: "nuevo" }).plantillas).toHaveLength(1);
  });
});

describe("lo que la agencia corrige y el carrusel del director", () => {
  it("las correcciones: de los pedidos de edición, sin las que hace sola la aplicación, sin repetir y con tope", async () => {
    const { correccionesRecientes, lineaDeCorrecciones } = await import("./director.js");
    const c = correccionesRecientes([
      "Edita la imagen de referencia: el titular más arriba. Conserva todo lo demás exactamente igual.",
      "Edita la imagen de referencia 1: el precio en amarillo. Conserva todo lo demás exactamente igual.\nImagen de referencia 2: …",
      "Edita la imagen de referencia: donde dice «Sofa» debe decir «Sofá». Conserva todo lo demás exactamente igual.",
      "Edita la imagen de referencia: Recompón esta MISMA pieza en formato 4:5. Conserva todo lo demás exactamente igual.",
      "Edita la imagen de referencia: El titular más arriba. Conserva todo lo demás exactamente igual.",
      "Escena: un sofá",
    ]);
    expect(c).toEqual(["el titular más arriba", "el precio en amarillo"]);
    expect(correccionesRecientes(Array.from({ length: 20 }, (_, i) => `Edita la imagen de referencia: cambio ${i}. Conserva todo lo demás exactamente igual.`))).toHaveLength(8);
    expect(lineaDeCorrecciones([])).toBe("");
    expect(lineaDeCorrecciones(c)).toMatch(/^CORRECCIONES QUE LA AGENCIA HIZO HACE POCO/);
  });

  it("el carrusel: pide la serie con medidas y lee una ficha por lámina con su texto exacto", async () => {
    const { pedidoDeCarrusel, leerCarrusel } = await import("./director.js");
    const p = pedidoDeCarrusel({ cliente: "Dcasa", laminas: [{ n: 1, rol: "portada", texto: "Hola" }, { n: 2, rol: "cierre", texto: "Chao" }], plantillas: [{ id: "plantilla-a", nombre: "Portada azul", uso: "portada", sistema: "" }, { id: "plantilla-b", nombre: "Post", uso: "post", sistema: "" }], vistas: 2 });
    expect(p).toMatch(/^Las 2 imágenes de arriba son plantillas/);
    expect(p).toMatch(/1\. \(portada\) Hola/);
    expect(p).toMatch(/titular entre el 8 y el 22 % de la altura/);
    expect(p).toMatch(/plantilla-a · «Portada azul»/);
    expect(p).not.toMatch(/plantilla-b/);
    expect(pedidoDeCarrusel({ tema: "Colchones" })).toMatch(/escribe de 5 a 7 láminas sobre este tema: Colchones/);
    const r = leerCarrusel('{"sistema":"titular arriba","laminas":[{"n":1,"texto":"Uno","ficha":"Pieza: a.\\n\\nComposición: b."},{"n":2,"texto":"Dos","ficha":"Pieza: c."}]}');
    expect(r.hilo).toBe("titular arriba");
    expect(r.laminas[0]).toMatchObject({ n: 1, rol: "portada", texto: "Uno" });
    expect(r.laminas[0].ficha).toMatch(/^Pieza: a\.\nComposición: b\.\nTexto exacto que va en la imagen.*«Uno»/);
    expect(leerCarrusel('{"laminas":[{"texto":"sola"}]}')).toBeNull();
    expect(leerCarrusel("nada")).toBeNull();
  });
});

describe("cómo se diseña cada tipo y las plantillas por tipo", async () => {
  const { tipoDeDiseno, disenoDelTipo, bloqueDeDisenoPorTipo, plantillaParaTipo, limpiarDisenoTipos, pedidoDeFichas, lineaDePlantilla, DISENO_POR_TIPO } = await import("./director.js");
  const { limpiarKit } = await import("./kitMarca.js");

  it("reconoce el tipo por su id o por su nombre", () => {
    expect(tipoDeDiseno("Educativo / Informativo")).toBe("educativo");
    expect(tipoDeDiseno("Servicios / Productos")).toBe("servicios");
    expect(tipoDeDiseno("maletas-garantia")).toBe("maletas");
    expect(tipoDeDiseno("Testimonio")).toBe("maletas");
    expect(tipoDeDiseno("Comunidad")).toBe("humano");
    expect(tipoDeDiseno("Variadas")).toBe("");
  });

  it("vale el del manual de la agencia o el de la casa, y sólo los tipos de la tanda", () => {
    expect(disenoDelTipo("educativo")).toBe(DISENO_POR_TIPO.find((x) => x.id === "educativo").base);
    expect(disenoDelTipo("Educativo / Informativo", { disenoTipos: { educativo: "Siempre fondo azul." } })).toBe("Siempre fondo azul.");
    const b = bloqueDeDisenoPorTipo(["Anuncio", "Anuncio", "Educativo / Informativo"]);
    expect(b).toMatch(/^CÓMO SE DISEÑA CADA TIPO/);
    expect(b.split("\n")).toHaveLength(3);
    expect(bloqueDeDisenoPorTipo([])).toBe("");
    expect(bloqueDeDisenoPorTipo([], null, { todos: true }).split("\n")).toHaveLength(DISENO_POR_TIPO.length + 1);
    expect(limpiarDisenoTipos({ educativo: "  x ", inventado: "y", anuncio: "" })).toEqual({ educativo: "x" });
  });

  it("el director lo lee en las fichas, y la plantilla de un tipo dice de qué tipo es", () => {
    const p = pedidoDeFichas({ piezas: [{ n: 1, tipo: "Anuncio", texto: "Hola" }] });
    expect(p).toMatch(/CÓMO SE DISEÑA CADA TIPO[\s\S]*- Anuncio: El producto real es el protagonista/);
    expect(p).not.toMatch(/- Educativo/);
    expect(lineaDePlantilla({ id: "plantilla-a", nombre: "Azul", uso: "post", tipos: ["educativo"] })).toMatch(/ES LA DE: Educativo \/ Informativo/);
  });

  it("la plantilla asignada a un tipo, por su uso", () => {
    const kit = limpiarKit({ plantillas: [
      { id: "plantilla-a", nombre: "Edu", uso: "post", clave: "clientes/c1/a.png", tipos: ["educativo", "inventado"] },
      { id: "plantilla-b", nombre: "Portada", uso: "portada", clave: "clientes/c1/b.png", tipos: ["educativo"] },
    ] });
    expect(kit.plantillas[0].tipos).toEqual(["educativo"]);
    expect(plantillaParaTipo(kit.plantillas, "Educativo / Informativo", "post")?.id).toBe("plantilla-a");
    expect(plantillaParaTipo(kit.plantillas, "educativo", "carrusel")?.id).toBe("plantilla-b");
    expect(plantillaParaTipo(kit.plantillas, "educativo", "historia")).toBeNull();
    expect(plantillaParaTipo(kit.plantillas, "Anuncio", "post")).toBeNull();
  });
});
