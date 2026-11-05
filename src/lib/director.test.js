import { describe, it, expect } from "vitest";
import {
  asegurarTexto, limpiarFicha, leerFichas, pedidoDeFichas, instruccionDeDiseno, resumenDelKit, manualDeDiseno,
  MANUAL_DISENO_BASE, FORMATO_FICHA, MAX_FICHA, OFICIO_VISUAL, FICHA_SIN_TEXTO, lineaSinTexto, pedidoDeCarrusel,
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

describe("una ficha larga se acorta sin perder el texto (Feria del Lente, 5-nov-2026)", () => {
  // La del director, como salió en producción (1.800+ caracteres por la línea «Fotografía»): cortada por el final,
  // llegó al motor con «titular «Tus lentes en 40 mi» y sin marca ni «Evitar».
  const larga = [
    "Pieza: Post de feed 4:5 (1080x1350px) — Diferenciador para vender el servicio exclusivo de fabricación en 40 minutos a quien necesita lentes el mismo día en Ciudad de Panamá y La Chorrera.",
    `Composición: Retícula con márgenes de 7% a cada lado; titular entre el 10% y el 18% de la altura, 78% del ancho, centrado; foto circular contenida entre el 24% y el 72% de la altura, 68% del ancho, centrada; ${"forma geométrica plana en la esquina, ".repeat(6)}logo abajo, 18% del ancho.`,
    "Fondo: Color plano y liso Crema hueso #F2EDE4 sin textura, sin degradado, sin viñeta, luminoso y uniforme en toda la pieza.",
    `Imagen principal: manos de técnico panameño colocando un lente transparente en la biseladora del taller, ${"encuadre medio cerrado a la altura de la mesa, ".repeat(5)}sin marcas.`,
    `Fotografía: Luz difusa que entra por ventana amplia a la izquierda, 5200K; lente 85mm a f/4.5; ${"textura real de piel y metal sin aspecto plástico, ".repeat(6)}sin HDR.`,
    "Texto (exacto, sin cambiar una letra): titular «Tus lentes en 40 minutos» (8 % de la altura, Oswald mayúsculas, rojo #D91B19); apoyo «Ciudad de Panamá y La Chorrera» (3,5 %, Montserrat, negro); botón «Agenda tu examen» (píldora roja con letra blanca).",
    "Marca: el logo de referencia abajo al centro, 18 % del ancho.",
    "Evitar: manos con dedos de más, una biseladora inventada con texto, letras de más.",
  ].join("\n");

  it("limpiarFicha la acorta por lo prescindible y la línea del texto llega entera", () => {
    expect(larga.length).toBeGreaterThan(MAX_FICHA);
    const f = limpiarFicha(larga);
    expect(f.length).toBeLessThanOrEqual(MAX_FICHA);
    expect(f).toContain("titular «Tus lentes en 40 minutos»");
    expect(f).toContain("botón «Agenda tu examen» (píldora roja con letra blanca).");
    expect(f.startsWith("Pieza: Post de feed 4:5")).toBe(true);
  });

  it("asegurarTexto añade la línea del texto aunque la ficha esté en el tope (antes el tope se la volvía a quitar)", () => {
    const sinTexto = larga.replace(/\nTexto \(exacto[^\n]*/, "").replace("Evitar: ", `Evitar: ${"x ".repeat(400)}`);
    const f = asegurarTexto(sinTexto, "Tus lentes en 40 minutos\nCiudad de Panamá y La Chorrera\nAgenda tu examen");
    expect(f.length).toBeLessThanOrEqual(MAX_FICHA);
    // «Ciudad de Panamá y La Chorrera» ya lo dice la línea «Pieza»: sólo se reponen las que faltan.
    expect(f.split("\n").at(-1)).toBe("Texto exacto que va en la imagen (gana sobre cualquier otro texto de esta ficha): «Tus lentes en 40 minutos» / «Agenda tu examen».");
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
    // «¿Qué quieres?» de la publicación llega también al carrusel, y manda.
    expect(pedidoDeCarrusel({ tema: "Colchones", indicacion: "que salga una mamá" })).toMatch(/LO QUE PIDE LA AGENCIA \(manda sobre todo lo demás\): que salga una mamá/);
    expect(pedidoDeCarrusel({ tema: "Colchones" })).not.toMatch(/LO QUE PIDE LA AGENCIA/);
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

describe("el oficio: lo que separa una pieza profesional de una genérica", () => {
  it("la ficha pide la FOTOGRAFÍA como un fotógrafo (luz, temperatura, lente, apertura, sombra)", () => {
    const linea = FORMATO_FICHA.split("\n").find((l) => l.startsWith("Fotografía:"));
    expect(linea).toMatch(/de dónde viene la luz/);
    expect(linea).toMatch(/en K/);
    expect(linea).toMatch(/lente en mm y la apertura/);
    expect(linea).toMatch(/cómo cae la sombra/);
    // Va detrás de «Imagen principal» y antes del texto: la ficha se lee de arriba abajo.
    const orden = FORMATO_FICHA.split("\n").map((l) => l.split(":")[0]);
    expect(orden.indexOf("Fotografía")).toBe(orden.indexOf("Imagen principal") + 1);
  });

  it("va con el manual que sea: el de la agencia lo sustituye, el oficio no", () => {
    const propio = { diseno: "Nuestro manual: todo en azul." };
    for (const p of [
      pedidoDeFichas({ piezas: [{ n: 1, formato: "post", idea: "x" }], manual: propio }),
      pedidoDeCarrusel({ tema: "x", manual: propio }),
      instruccionDeDiseno(propio),
      instruccionDeDiseno(propio, { canal: "mcp" }),
    ]) {
      expect(p).toContain("Nuestro manual: todo en azul.");
      expect(p).toContain(OFICIO_VISUAL);
    }
    expect(OFICIO_VISUAL).toMatch(/Palabras vagas, prohibidas/);
    expect(OFICIO_VISUAL).toMatch(/Nada de clichés/);
    expect(OFICIO_VISUAL).toMatch(/Un solo gesto expresivo/);
  });

  it("sin texto en la imagen: una zona TRANQUILA de la escena, nunca «espacio negativo», «hueco» ni una franja plana", () => {
    for (const t of [FICHA_SIN_TEXTO, lineaSinTexto(), pedidoDeFichas({ piezas: [{ n: 1, formato: "post", idea: "x", sinTexto: true }] })]) {
      expect(t).toMatch(/zona (tranquila )?de tono uniforme/);
      expect(t).not.toMatch(/deja (la zona )?libre|limpio y despejado/i);
    }
    expect(OFICIO_VISUAL).toMatch(/nunca «espacio negativo», «hueco» ni una franja plana/);
  });
});

describe("una ficha que no cabe en el pedido", async () => {
  const { ajustarFicha } = await import("./director.js");
  const ficha = [
    "Pieza: post 4:5 — servicio: el examen gratis con tu compra.",
    `Composición: ${"titular arriba, del 6 al 20 % de la altura; ".repeat(6)}`,
    `Fondo: ${"la consulta, pared crema #F2EDE4; ".repeat(5)}`,
    `Imagen principal: ${"una mujer en el autorrefractómetro; ".repeat(6)}`,
    `Fotografía: ${"panel suave a 45° desde la derecha, 5000 K, 50 mm a f/2.2; ".repeat(5)}`,
    "Texto (exacto, sin cambiar una letra): titular «Examen computarizado gratis» (9 %); apoyo «Incluido con tu compra» (4 %).",
    `Marca: ${"logo abajo a la derecha, 12 % del ancho; ".repeat(4)}`,
    `Evitar: ${"caras deformadas; ".repeat(8)}`,
  ].join("\n");

  it("quita primero lo prescindible (Marca, Evitar, Fondo) y nunca el texto exacto ni la pieza", () => {
    const f = ajustarFicha(ficha, ficha.length - 120);
    expect(f.length).toBeLessThanOrEqual(ficha.length - 120);
    expect(f).not.toMatch(/^Marca:/m);
    expect(f).toMatch(/^Evitar:/m);
    expect(f).toContain("«Examen computarizado gratis»");
    expect(f).toMatch(/^Pieza:/);
  });

  it("si aun así no cabe, recorta lo más largo por una palabra; el texto sigue entero", () => {
    const f = ajustarFicha(ficha, 700);
    expect(f.length).toBeLessThanOrEqual(700);
    expect(f).toContain("titular «Examen computarizado gratis» (9 %); apoyo «Incluido con tu compra» (4 %).");
    expect(f).not.toMatch(/^(Evitar|Marca|Fondo):/m);
  });

  it("lo que cabe no se toca, y una escena que no es ficha se corta por el final", () => {
    expect(ajustarFicha(ficha, 5000)).toBe(ficha.trim());
    expect(ajustarFicha("Una sala luminosa con un sofá gris y plantas", 10)).toBe("Una sala l");
  });
});
