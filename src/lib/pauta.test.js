import { describe, it, expect } from "vitest";
import {
  limpiarPauta, vaAPauta, nivelDePauta, limpiarAnuncio, tieneTextosAnuncio, anuncioATexto, recortarHashtags, REGLA_ANUNCIO,
  bloqueDeAnuncio, lineaDePauta, anunciosDeRespuesta, sugerirPauta, deLaOferta, etapaSugerida, conPautas, problemasDePauta,
  aplicarArregloPauta, revisarPauta, resumenPauta, casiIguales, cortarEnPalabra, describirPauta, llamadoPorDefecto,
  MAX_TEXTOS, MAX_TITULO_ANUNCIO, MAX_DESCRIPCION_ANUNCIO, PRIMERA_LINEA,
} from "./pauta.js";
import { enPauta } from "./estadoChip.js";
import { LIMITES_ANUNCIO } from "./estudioMercado.js";

const post = (extra = {}) => ({ id: "p1", format: "post", status: "pending", ...extra });

describe("la marca «Va a pauta»", () => {
  it("limpia la etapa con los alias de antes y quita lo que no es", () => {
    expect(limpiarPauta({ etapa: "atraer" })).toEqual({ etapa: "presentacion", como: "" });
    expect(limpiarPauta({ etapa: "tibio", como: "anuncio", nivel: "producto" })).toEqual({ etapa: "evaluacion", nivel: "producto", como: "anuncio" });
    expect(limpiarPauta({ etapa: "Conversión", como: "inventado", nivel: "nada" })).toEqual({ etapa: "conversion", como: "" });
    // Sin etapa: la de su nivel; sin nada, presentación.
    expect(limpiarPauta({ nivel: "decision" }).etapa).toBe("ascension");
    expect(limpiarPauta({}).etapa).toBe("presentacion");
    // `auto` sólo si lo puso la app, y su motivo con él.
    expect(limpiarPauta({ etapa: "conversion", auto: true, motivo: "La oferta del mes" })).toMatchObject({ auto: true, motivo: "La oferta del mes" });
    expect(limpiarPauta({ etapa: "conversion", auto: "si", motivo: "x" })).not.toHaveProperty("motivo");
  });

  it("false, vacío o un texto no es ir a pauta (false recuerda que alguien la quitó)", () => {
    for (const x of [false, null, undefined, "si", [], 3]) expect(limpiarPauta(x)).toBeNull();
    expect(vaAPauta(post({ pauta: { etapa: "presentacion" } }))).toBe(true);
    expect(vaAPauta(post({ pauta: false }))).toBe(false);
    expect(vaAPauta(post())).toBe(false);
  });

  it("el chip del mes usa la MISMA regla (su copia de una línea, para no cargar ésta al arrancar)", () => {
    for (const p of [post({ pauta: { etapa: "presentacion" } }), post({ pauta: false }), post(), post({ pauta: [] }), post({ pauta: "si" })]) {
      expect(enPauta(p)).toBe(vaAPauta(p));
    }
  });

  it("el nivel: el escogido; si no, el de la publicación si es de su etapa; si no, el de la etapa", () => {
    expect(nivelDePauta({ etapa: "presentacion", nivel: "solucion" }, { nivel: "problema" })).toBe("solucion");
    expect(nivelDePauta({ etapa: "presentacion" }, { nivel: "inconsciente" })).toBe("inconsciente");
    expect(nivelDePauta({ etapa: "presentacion" }, { nivel: "decision" })).toBe("problema");
    expect(nivelDePauta({ etapa: "conversion" }, {})).toBe("producto");
    expect(nivelDePauta(false, {})).toBe("");
  });

  it("describe la pauta en una línea", () => {
    expect(describirPauta({ etapa: "evaluacion", como: "publicacion" })).toBe("Evaluación · con la publicación");
    expect(describirPauta(false)).toBe("");
  });
});

describe("el asistente lo sabe (api.js, sin importar esto: va en la carga inicial)", () => {
  it("la línea de la publicación dice VA A PAUTA y, si hay alguna, cómo se escribe y cómo se marca", async () => {
    const { buildChatSystemPrompt } = await import("../api");
    const cal = { name: "Nov", year: 2026, month: 10, days: [{ date: "2026-11-02", posts: [post({ id: "a", pauta: { etapa: "conversion" } }), post({ id: "b" })] }] };
    const t = buildChatSystemPrompt({ name: "Dcasa" }, cal, "", []);
    expect(t).toMatch(/ID:a [^\n]*VA A PAUTA \(etapa conversion\)/);
    expect(t).not.toMatch(/ID:b [^\n]*VA A PAUTA/);
    expect(t).toMatch(/editar_publicacion con «pauta»/);
    const sin = buildChatSystemPrompt({ name: "Dcasa" }, { ...cal, days: [{ date: "2026-11-02", posts: [post({ id: "b" })] }] }, "", []);
    expect(sin).not.toMatch(/VA A PAUTA/);
  });
});

describe("los textos de anuncio aparte", () => {
  it("hasta 5 textos sin repetir, títulos de 40 cortados en una palabra, descripción de 30 y el botón de su destino", () => {
    const a = limpiarAnuncio({
      textos: ["Uno", "uno", "Dos\\nlíneas", "Tres", "Cuatro", "Cinco", "Seis"],
      titulos: ["«Sofá cama que se abre en un segundo y dura años»", "Corto"],
      descripcion: "Envío gratis en toda la ciudad de Panamá",
      boton: "nada",
    }, { destino: "web" });
    expect(a.textos).toEqual(["Uno", "Dos\nlíneas", "Tres", "Cuatro", "Cinco"]);
    expect(a.textos.length).toBe(MAX_TEXTOS);
    expect(a.titulos[0].length).toBeLessThanOrEqual(MAX_TITULO_ANUNCIO);
    expect(a.titulos[0]).toBe("Sofá cama que se abre en un segundo y");
    expect(a.descripcion.length).toBeLessThanOrEqual(MAX_DESCRIPCION_ANUNCIO);
    expect(a.descripcion).toBe("Envío gratis en toda la ciudad");
    expect(a.boton).toBe("SHOP_NOW");
    expect(limpiarAnuncio({ textos: ["x"], boton: "Enviar mensaje de WhatsApp" }).boton).toBe("WHATSAPP_MESSAGE");
  });

  it("los límites son los del estudio de mercado (Meta): 40 el título y 30 la descripción", () => {
    expect(MAX_TITULO_ANUNCIO).toBe(LIMITES_ANUNCIO.titulo);
    expect(MAX_DESCRIPCION_ANUNCIO).toBe(LIMITES_ANUNCIO.descripcion);
  });

  it("sin textos ni títulos no hay anuncio; se copia todo junto", () => {
    expect(limpiarAnuncio({ descripcion: "Algo" })).toBeNull();
    expect(limpiarAnuncio("texto")).toBeNull();
    expect(tieneTextosAnuncio(post({ anuncio: { textos: ["Hola"] } }))).toBe(true);
    expect(tieneTextosAnuncio(post())).toBe(false);
    const t = anuncioATexto({ textos: ["A", "B"], titulos: ["T"], descripcion: "D", boton: "WHATSAPP_MESSAGE" });
    expect(t).toMatch(/Texto principal 1:\nA/);
    expect(t).toMatch(/Títulos:\n· T/);
    expect(t).toMatch(/Botón: Enviar mensaje de WhatsApp/);
  });

  it("corta en palabra y deja 3 hashtags", () => {
    expect(cortarEnPalabra("una frase bastante larga para un título", 20)).toBe("una frase bastante");
    expect(recortarHashtags("#a #b, #c #d")).toBe("#a #b #c");
  });
});

describe("lo que lee la IA", () => {
  it("la regla tiene las 8 reglas de lo que va a pauta, en palabras de la agencia", () => {
    for (let i = 1; i <= 8; i++) expect(REGLA_ANUNCIO).toMatch(new RegExp(`\\n${i}\\. `));
    expect(REGLA_ANUNCIO).toMatch(/no se puede cambiar/);
    expect(REGLA_ANUNCIO).toMatch(new RegExp(`${PRIMERA_LINEA} caracteres`));
    expect(REGLA_ANUNCIO).toMatch(/WhatsApp/);
    expect(REGLA_ANUNCIO).toMatch(/«hoy»/);
    expect(REGLA_ANUNCIO).toMatch(/como mucho 3/);
    expect(REGLA_ANUNCIO).toMatch(/precio EXACTO del catálogo/);
    expect(REGLA_ANUNCIO).toMatch(/¿Tienes sobrepeso\?/);
    expect(REGLA_ANUNCIO).toMatch(/distinta de las otras de su etapa/);
  });

  it("el bloque lleva el destino y el tipo de negocio del cliente y cómo se escribe cada etapa que aparece", () => {
    const b = bloqueDeAnuncio({ tipo: "servicios", destino: "whatsapp", etapas: ["evaluacion"] });
    expect(b).toMatch(/El destino del anuncio: WhatsApp/);
    expect(b).toMatch(/El tipo de negocio: Servicios/);
    expect(b).toMatch(/- Evaluación: para quien ya vio la marca/);
    expect(b).not.toMatch(/- Presentación:/);
    expect(b).toMatch(/"anuncio" \(en las que van a pauta\)/);
    expect(bloqueDeAnuncio({ destino: "web" })).toMatch(/Tienda web.*entrar a la web/);
    // Sin destino guardado, WhatsApp (el de casi toda la agencia).
    expect(bloqueDeAnuncio({})).toMatch(/El destino del anuncio: WhatsApp/);
    expect(bloqueDeAnuncio({ enJson: true })).toMatch(/añade esa clave "anuncio" a su objeto/);
    expect(bloqueDeAnuncio({ conCampo: false })).not.toMatch(/"anuncio"/);
  });

  it("la línea de la pieza dice su etapa, su nivel y cómo se monta", () => {
    expect(lineaDePauta({ etapa: "conversion", como: "publicacion" }, {})).toMatch(/^VA A PAUTA · etapa Conversión · nivel Consciente del producto · se monta con la publicación/);
    expect(lineaDePauta(false)).toBe("");
  });

  it("lee el «anuncio» de cada número de una respuesta", () => {
    const m = anunciosDeRespuesta('```json\n{"ideas":[{"n":2,"anuncio":{"textos":["Uno","Dos","Tres"],"titulos":["T"]}},{"n":3}]}\n```');
    expect(m.get(2).textos).toEqual(["Uno", "Dos", "Tres"]);
    expect(m.has(3)).toBe(false);
    expect(anunciosDeRespuesta("nada").size).toBe(0);
  });
});

describe("qué se marca solo (decisión 9)", () => {
  it("las del tipo «Anuncio» y las de la oferta del mes, con `auto`; nunca un directo, lo publicado, lo ya marcado o lo que se quitó", () => {
    const items = [
      post({ id: "a", pilar: "anuncio", nivel: "decision" }),
      post({ id: "b", pilar: "anuncio", nivel: "producto" }),
      post({ id: "c", pilar: "beneficios" }),
      post({ id: "d", pilar: "educativo", descripcion: "Aprende a escoger tu colchón con 15 % de descuento" }),
      post({ id: "e", pilar: "educativo" }),
      post({ id: "f", pilar: "anuncio", format: "live" }),
      post({ id: "g", pilar: "anuncio", status: "published" }),
      post({ id: "h", pilar: "anuncio", pauta: { etapa: "presentacion" } }),
      post({ id: "i", pilar: "anuncio", pauta: false }),
    ];
    const s = sugerirPauta(items, { ofertas: "15 % en colchones hasta el 30" });
    expect(s.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(s[0].pauta).toMatchObject({ etapa: "conversion", auto: true, motivo: "Tipo «Anuncio» del plan semanal" });
    expect(s[1].pauta.etapa).toBe("evaluacion");
    expect(s[2]).toMatchObject({ motivo: "La oferta del mes", pauta: { etapa: "conversion" } });
    // Sin oferta en el mes, «Beneficios» no va solo.
    expect(sugerirPauta([post({ id: "c", pilar: "beneficios" })]).length).toBe(0);
  });

  it("de la oferta: su código, una de sus cifras o dos de sus palabras", () => {
    expect(deLaOferta(post({ descripcion: "Usa el código NOVIEMBRE" }), { codigo: "noviembre" })).toBe(true);
    expect(deLaOferta(post({ descripcion: "2x1 en almohadas" }), { ofertas: "2x1 en todo" })).toBe(true);
    expect(deLaOferta(post({ descripcion: "Sofás cama para salas pequeñas" }), { ofertas: "Descuento en sofás cama esta quincena" })).toBe(true);
    expect(deLaOferta(post({ descripcion: "Mesas de comedor" }), { ofertas: "Descuento en sofás cama" })).toBe(false);
    expect(deLaOferta(post({ pilar: "beneficios" }), {})).toBe(false);
  });

  it("la etapa sugerida: la oferta a conversión; un «Anuncio» por su nivel", () => {
    expect(etapaSugerida({ nivel: "solucion" }, { oferta: true })).toBe("conversion");
    expect(etapaSugerida({ nivel: "inconsciente" })).toBe("presentacion");
    expect(etapaSugerida({})).toBe("presentacion");
  });

  it("marca las escogidas en los días", () => {
    const days = [{ date: "2026-11-02", posts: [post({ id: "a" }), post({ id: "b" })] }, { date: "2026-11-03", posts: [] }];
    const d = conPautas(days, { a: { etapa: "atraer", como: "" } });
    expect(d[0].posts[0].pauta).toEqual({ etapa: "presentacion", como: "" });
    expect(d[0].posts[1].pauta).toBeUndefined();
    expect(d[1]).toBe(days[1]);
    // Quitarla deja `false`: así no se vuelve a proponer.
    const sin = conPautas(d, { a: false });
    expect(sin[0].posts[0].pauta).toBe(false);
    expect(sugerirPauta([{ ...sin[0].posts[0], pilar: "anuncio" }])).toEqual([]);
  });
});

describe("la revisión de anuncio", () => {
  const conPauta = (descripcion, extra = {}) => post({ pauta: { etapa: "presentacion" }, descripcion, anuncio: { textos: ["Uno"] }, ...extra });
  const codigos = (p, ctx) => problemasDePauta(p, ctx).map((x) => x.codigo);
  const BUENO = "Tu sala pequeña también merece un sofá cama que se abre en un segundo.\n\nEscríbenos por WhatsApp y te ayudamos a escoger el tuyo.";

  it("un caption de anuncio bien escrito pasa", () => {
    expect(codigos(conPauta(BUENO))).toEqual([]);
  });

  it("lo que caduca: hoy, mañana, el día de la semana, un horario", () => {
    for (const t of ["¡Sólo por hoy!", "Ven mañana", "Este viernes abrimos", "Abierto hasta las 8", "De 9 am a 5 pm", "últimas horas para pedir"]) {
      expect(codigos(conPauta(`Tu sala merece un sofá nuevo que dure años de verdad.\n${t}. Escríbenos por WhatsApp.`))).toContain("caduca");
    }
    // «Hoyo» o «mañanero» no son «hoy» ni «mañana».
    expect(codigos(conPauta("Tu sala merece un sofá nuevo que dure años de verdad.\nSin hoyos. Escríbenos por WhatsApp."))).not.toContain("caduca");
  });

  it("la primera línea: larga, un saludo o casi nada", () => {
    expect(codigos(conPauta(`${"Un sofá cama muy cómodo ".repeat(7)}\nEscríbenos por WhatsApp.`))).toContain("primera-linea");
    expect(codigos(conPauta("¡Hola, familia!\nTu sala merece un sofá nuevo. Escríbenos por WhatsApp."))).toContain("primera-linea");
    expect(codigos(conPauta("🛋️✨\nTu sala merece un sofá nuevo. Escríbenos por WhatsApp."))).toContain("primera-linea");
  });

  it("sin llamado a WhatsApp (o a la web, si el destino es la web), con su arreglo", () => {
    const p = conPauta("Tu sala pequeña también merece un sofá cama que se abre en un segundo.");
    const r = problemasDePauta(p, {});
    expect(r.find((x) => x.codigo === "llamado")).toMatchObject({ arreglo: "Añadir el llamado" });
    expect(codigos(conPauta(BUENO), { destino: "web" })).toContain("llamado");
    const arreglado = aplicarArregloPauta(p, "llamado", { whatsapp: "+507 6000-0000" });
    expect(arreglado.descripcion).toMatch(/\n\nEscríbenos por WhatsApp al \+507 6000-0000/);
    expect(codigos(arreglado)).not.toContain("llamado");
    expect(llamadoPorDefecto({ destino: "web" })).toMatch(/web/);
  });

  it("hashtags de más (o dentro del caption) se arreglan solos: fuera del caption y 3 como mucho", () => {
    const p = conPauta(`${BUENO}\n\n#sofa #panama`, { hashtagsFinales: "#muebles #hogar #deco" });
    expect(codigos(p)).toContain("hashtags");
    const a = aplicarArregloPauta(p, "hashtags");
    expect(a.descripcion).toBe(BUENO);
    expect(a.hashtagsFinales).toBe("#muebles #hogar #deco");
    expect(codigos(a)).not.toContain("hashtags");
  });

  it("lo que dice de quien lee (atributos personales)", () => {
    expect(codigos(conPauta(`¿Tienes sobrepeso? Este colchón te ayuda.\n${BUENO}`))).toContain("personal");
    expect(codigos(conPauta(`Olvídate de tus deudas con nuestro plan.\n${BUENO}`))).toContain("personal");
    expect(codigos(conPauta(`¿Te cuesta dormir por el acné?\n${BUENO}`))).toContain("personal");
    expect(codigos(conPauta(BUENO))).not.toContain("personal");
  });

  it("casi igual a otra de su ETAPA (otra etapa no cuenta)", () => {
    const a = { date: "2026-11-02", post: conPauta(BUENO, { id: "a" }) };
    const b = conPauta(`${BUENO} Hoy no.`.replace(" Hoy no.", ""), { id: "b" });
    expect(codigos(b, { otras: [a] })).toContain("parecida");
    const otraEtapa = { ...a, post: { ...a.post, pauta: { etapa: "conversion" } } };
    expect(codigos(b, { otras: [otraEtapa] })).not.toContain("parecida");
    expect(casiIguales("Una cosa totalmente distinta sobre colchones ortopédicos firmes", BUENO)).toBe(false);
  });

  it("sin caption, o sin sus textos aparte; una historia no lleva caption", () => {
    expect(codigos(post({ pauta: { etapa: "presentacion" } }))).toEqual(["sin-caption", "textos"]);
    expect(codigos(post({ format: "historia", pauta: { etapa: "presentacion" } }))).toEqual(["textos"]);
    expect(problemasDePauta(post(), {})).toEqual([]);
  });

  it("el mes: todas las que van a pauta, en orden, y su resumen", () => {
    const days = [
      { date: "2026-11-05", posts: [conPauta(BUENO, { id: "b" })] },
      { date: "2026-11-02", posts: [conPauta(BUENO, { id: "a" }), post({ id: "x" })] },
    ];
    const l = revisarPauta(days, {});
    expect(l.map((x) => x.post.id)).toEqual(["a", "b"]);
    // «Casi igual» se le dice a la segunda.
    expect(l[0].problemas).toEqual([]);
    expect(l[1].problemas.map((x) => x.codigo)).toContain("parecida");
    expect(resumenPauta(l)).toBe("2 van a pauta · 1 con algo que revisar");
    expect(resumenPauta([])).toBe("");
  });
});
