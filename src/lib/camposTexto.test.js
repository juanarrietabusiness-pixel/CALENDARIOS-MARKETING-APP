import { describe, it, expect, vi, afterEach } from "vitest";
import { casillaDeCampos, pedidoDeCampos, leerCampos, aplicarCampos } from "./camposTexto.js";
import { darForma, textoDelCliente } from "./loteAnuncios.js";
import { textoDeUnCampo, escribirLoQueFalta, conceptoDelDia, conTextos } from "./escribirTextos.js";

// ============================================================
// Lo que le falta a una publicación, por el motor (modo «campos»)
// ============================================================

describe("la casilla de una publicación", () => {
  const post = { id: "p1", format: "reel", idea: "Ana enseña el sofá", guion: "", descripcion: "Ven hoy", pilar: "humano", rostro: true, formulaUgc: "f1", duracionUgc: 45, composicion: "uso" };

  it("lo escrito va en `escrito`; lo pedido que ya tenía texto, en `antes`; sólo lo que su formato lleva", () => {
    const c = casillaDeCampos(post, { date: "2030-03-07", concept: "Visitas" }, { campos: ["guion", "descripcion", "textoPieza"] });
    expect(c).toMatchObject({
      clave: "p1", formato: "reel", fecha: "2030-03-07", pilar: "humano", composicion: "uso", semana: "Visitas",
      rostro: true, duracionUgc: 45, formulaUgc: "f1",
      escrito: { idea: "Ana enseña el sofá" }, campos: ["guion", "descripcion"], antes: { descripcion: "Ven hoy" },
    });
  });

  it("sin nada que pedirle (una historia sólo con caption), null", () => {
    expect(casillaDeCampos({ id: "h", format: "historia" }, {}, { campos: ["descripcion", "guion"] })).toBeNull();
  });

  it("el caption de antes (`script`) cuenta como escrito", () => {
    expect(casillaDeCampos({ id: "a", format: "post", script: "viejo" }, {}, { campos: ["textoPieza"] }).escrito).toEqual({ descripcion: "viejo" });
  });
});

describe("el pedido", () => {
  const plan = darForma([
    { clave: "p1", formato: "post", tipo: "beneficios", campos: ["descripcion", "hashtags"], escrito: { idea: "Visitas", textoPieza: "¿Llegan visitas?" }, antes: {} },
    { clave: "p2", formato: "reel", tipo: "humano", rostro: true, duracionUgc: 30, campos: ["guion"], escrito: {}, antes: { guion: "[0–3 s] VOZ: «Hola»" } },
  ]);

  it("lleva la ficha del cliente, lo ya escrito y SÓLO cómo es cada campo pedido", () => {
    const t = pedidoDeCampos({ marca: "Dcasa", plan, cliente: textoDelCliente({ aiInstructions: "Trata de tú.", hashtags: "#Dcasa" }) });
    expect(t).toMatch(/Escribe lo que les falta a 2 publicaciones del calendario de Dcasa/);
    expect(t).toMatch(/INSTRUCCIONES OBLIGATORIAS DEL CLIENTE[^\n]*\nTrata de tú\./);
    expect(t).toMatch(/1\. \[Post 4:5\]/);
    expect(t).toMatch(/idea: «Visitas»/);
    expect(t).toMatch(/escribe: "descripcion", "hashtags"/);
    expect(t).toMatch(/guion para grabar de 30 s, unas 75 palabras/);
    expect(t).toMatch(/lo que tiene ahora en «guion»[^:]*: «\[0–3 s\] VOZ: «Hola»»/);
    expect(t).toMatch(/UGC · GUION PARA GRABAR \(30 segundos\)/);
    expect(t).toMatch(/"ganchos": 3 ganchos alternativos/);
    expect(t).not.toMatch(/"textoPieza"/);
    expect(t).not.toMatch(/"titulo"/);
  });

  it("sin ficha del cliente no inventa una", () => {
    expect(textoDelCliente({})).toBe("");
    expect(textoDelCliente(null)).toBe("");
    expect(pedidoDeCampos({ plan })).not.toMatch(/FICHA DEL CLIENTE/);
  });
});

describe("la lectura", () => {
  const plan = [
    { n: 1, clave: "p1", formato: "post", campos: ["descripcion"] },
    { n: 2, clave: "p2", formato: "reel", rostro: true, campos: ["guion"] },
    { n: 3, clave: "p3", formato: "historia", campos: ["textoPieza"] },
  ];

  it("sólo lo pedido; el caption sin hashtags (si no se pidieron, se quitan); el guion UGC por tramos con sus ganchos", () => {
    const r = leerCampos(`\`\`\`json
{"textos":[
  {"n":1,"descripcion":"Ven hoy.\\n\\n#sofa","hashtags":"#no","guion":"no"},
  {"n":2,"guion":"FÓRMULA: La pregunta\\n[0–3 s] VOZ: «¿Se hunde?» | SE VE: la sala | TEXTO: ¿Se hunde?\\nGANCHOS:\\n- Uno\\n- Dos","formula":"La pregunta"},
  {"n":3,"textoPieza":"Hoy · abrimos\\nVen"}
]}
\`\`\``, plan);
    expect(r).toEqual([
      { clave: "p1", n: 1, campos: { descripcion: "Ven hoy." } },
      { clave: "p2", n: 2, campos: { guion: "[0–3 s] VOZ: «¿Se hunde?» | SE VE: la sala | TEXTO: ¿Se hunde?" }, ganchos: ["Uno", "Dos"], formula: "La pregunta" },
      { clave: "p3", n: 3, campos: { textoPieza: "Hoy. abrimos\nVen" } },
    ]);
  });

  it("lo que no se puede leer no rompe: no devuelve nada", () => {
    expect(leerCampos("no hay JSON", plan)).toEqual([]);
    expect(leerCampos(JSON.stringify({ textos: [{ n: 1 }] }), plan)).toEqual([]);
  });
});

describe("ponerlo en la publicación", () => {
  it("sólo RELLENA lo vacío; el campo pedido con su botón se reescribe", () => {
    const post = { format: "post", descripcion: "La mía", textoPieza: "" };
    const textos = { campos: { descripcion: "La de la IA", textoPieza: "Titular", hashtags: "#a" } };
    expect(aplicarCampos(post, textos).cambios).toEqual({ textoPieza: "Titular", hashtagsFinales: "#a" });
    expect(aplicarCampos(post, textos, { reemplazar: ["descripcion"] }).cambios).toEqual({ descripcion: "La de la IA", textoPieza: "Titular", hashtagsFinales: "#a" });
  });

  it("nada que su formato no lleve; una UGC se queda con sus ganchos, su duración y la fórmula que siguió", () => {
    expect(aplicarCampos({ format: "historia" }, { campos: { descripcion: "x", textoPieza: "Hoy" } }).cambios).toEqual({ textoPieza: "Hoy" });
    const ugc = aplicarCampos({ format: "reel", rostro: true }, { campos: { guion: "[0–3 s] VOZ: «Hola»" }, ganchos: ["A"], formulaUgc: "f1" });
    expect(ugc.cambios).toEqual({ guion: "[0–3 s] VOZ: «Hola»", ganchosUgc: ["A"], duracionUgc: 30, formulaUgc: "f1" });
    expect(ugc.campos).toEqual(["guion"]);
  });
});

describe("desde la pantalla (lib/escribirTextos.js)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const cuerpos = [];
  const servidor = (textos) => vi.stubGlobal("fetch", async (url, op = {}) => {
    cuerpos.push({ url: String(url), cuerpo: JSON.parse(op.body) });
    return Response.json({ textos: textos(JSON.parse(op.body)) });
  });

  it("el concepto de la semana es el de la FILA de la rejilla", () => {
    // Octubre de 2026 empieza en jueves: el 5 es de la semana 2.
    expect(conceptoDelDia({ weekConcepts: ["Uno", "Dos"] }, { date: "2026-10-05", concept: "viejo" })).toBe("Dos");
    expect(conceptoDelDia({ weekConcepts: [] }, { date: "2026-10-05", concept: "viejo" })).toBe("viejo");
  });

  it("el botón del caption pide también los hashtags si no tiene, y la estrategia del mes viaja", async () => {
    cuerpos.length = 0;
    servidor((b) => b.publicaciones.map((c, i) => ({ clave: c.clave, n: i + 1, campos: { descripcion: "Ven", hashtags: "#a" } })));
    const cal = { year: 2026, month: 9, campaign: "Otoño", weekConcepts: ["Uno", "Dos"], days: [] };
    const t = await textoDeUnCampo("c1", { post: { id: "p1", format: "post", idea: "Sofá" }, day: { date: "2026-10-05" }, cal, campo: "descripcion" });
    expect(t.campos.descripcion).toBe("Ven");
    const { url, cuerpo } = cuerpos[0];
    expect(url).toBe("/api/estudio/c1/lote/ideas");
    expect(cuerpo).toMatchObject({ modo: "campos", estrategia: { campana: "Otoño" } });
    expect(cuerpo.publicaciones[0]).toMatchObject({ clave: "p1", campos: ["descripcion", "hashtags"], semana: "Dos", escrito: { idea: "Sofá" } });
  });

  it("«Completar»: de 6 en 6, y lo que llegó se pone sólo en lo vacío", async () => {
    cuerpos.length = 0;
    servidor((b) => b.publicaciones.map((c, i) => ({ clave: c.clave, n: i + 1, campos: { descripcion: `D-${c.clave}` } })));
    const days = [{ date: "2026-10-05", posts: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, format: "post", idea: "x", textoPieza: "t", hashtagsFinales: "#a", ...(i === 0 ? { descripcion: "La mía" } : {}) })) }];
    const pedidos = days[0].posts.map((post) => ({ post, day: days[0] }));
    const porId = await escribirLoQueFalta("c1", { year: 2026, month: 9, days }, pedidos);
    expect(cuerpos.map((c) => c.cuerpo.publicaciones.length)).toEqual([6, 1]);
    const nuevos = conTextos(days, porId)[0].posts;
    expect(nuevos[1].descripcion).toBe("D-p1");
    expect(nuevos[0].descripcion).toBe("La mía");
  });
});

describe("lo que va a pauta (lib/pauta.js)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const enPauta = { id: "p9", format: "post", idea: "Sofá cama", pauta: { etapa: "atraer", como: "publicacion" } };

  it("la casilla viaja con su pauta limpia y «anuncio» sólo se pide si va a pauta (nunca en un directo)", () => {
    const c = casillaDeCampos(enPauta, {}, { campos: ["descripcion", "anuncio"] });
    expect(c).toMatchObject({ pauta: { etapa: "presentacion", como: "publicacion" }, campos: ["descripcion", "anuncio"] });
    expect(casillaDeCampos({ id: "a", format: "post" }, {}, { campos: ["descripcion", "anuncio"] }).campos).toEqual(["descripcion"]);
    expect(casillaDeCampos({ id: "b", format: "post", pauta: false }, {}, { campos: ["anuncio"] })).toBeNull();
    expect(casillaDeCampos({ id: "l", format: "live", pauta: { etapa: "presentacion" } }, {}, { campos: ["anuncio"] })).toBeNull();
    // Una historia no lleva caption, pero sí sus textos para montarla subiendo la pieza.
    expect(casillaDeCampos({ id: "h", format: "historia", pauta: { etapa: "conversion" } }, {}, { campos: ["descripcion", "anuncio"] }).campos).toEqual(["anuncio"]);
  });

  it("el pedido lleva la regla del anuncio, la línea de su etapa y cómo es el campo «anuncio»", () => {
    const plan = darForma([{ ...casillaDeCampos(enPauta, {}, { campos: ["descripcion", "hashtags", "anuncio"] }), tipo: "anuncio" }]);
    const t = pedidoDeCampos({ marca: "Dcasa", plan });
    expect(t).toMatch(/LO QUE VA A PAUTA \(anuncios de Meta\)/);
    expect(t).toMatch(/VA A PAUTA · etapa Presentación · nivel Consciente del problema · se monta con la publicación/);
    expect(t).toMatch(/En las que VAN A PAUTA es el texto principal del anuncio/);
    expect(t).toMatch(/En las que van a pauta, 3 como mucho/);
    expect(t).toMatch(/- "anuncio" \(en las que van a pauta\)/);
    expect(t).toMatch(/"anuncio":\{"textos":\[/);
    // Con el bloque del servidor (el destino y el tipo de negocio del cliente), ése.
    expect(pedidoDeCampos({ plan, pauta: "BLOQUE DEL SERVIDOR" })).toMatch(/BLOQUE DEL SERVIDOR/);
    // Sin pauta, nada de esto.
    const sin = pedidoDeCampos({ plan: darForma([{ ...casillaDeCampos({ id: "x", format: "post" }, {}, { campos: ["descripcion"] }), tipo: "anuncio" }]) });
    expect(sin).not.toMatch(/VA A PAUTA/);
    expect(sin).not.toMatch(/"anuncio"/);
  });

  it("la lectura: 3 hashtags como mucho y el «anuncio» como objeto; se pone sólo si no tenía (salvo su botón)", () => {
    const plan = [{ n: 1, clave: "p9", formato: "post", pauta: { etapa: "presentacion" }, campos: ["descripcion", "hashtags", "anuncio"] }];
    const r = leerCampos(JSON.stringify({ textos: [{ n: 1, descripcion: "Gancho\n\nEscríbenos por WhatsApp.", hashtags: "#a #b #c #d #e", anuncio: { textos: ["Uno", "Dos", "Tres"], titulos: ["Título"], descripcion: "Envío gratis", boton: "nada" } }] }), plan, { destino: "web" });
    expect(r[0].campos.hashtags).toBe("#a #b #c");
    expect(r[0].campos.anuncio).toEqual({ textos: ["Uno", "Dos", "Tres"], titulos: ["Título"], descripcion: "Envío gratis", boton: "SHOP_NOW" });
    const vacio = aplicarCampos({ id: "p9", format: "post", pauta: { etapa: "presentacion" } }, r[0]);
    expect(vacio.cambios.anuncio.textos).toHaveLength(3);
    expect(vacio.campos).toContain("textos del anuncio");
    const conTextosYa = { id: "p9", format: "post", anuncio: { textos: ["Mío"] } };
    expect(aplicarCampos(conTextosYa, r[0]).cambios.anuncio).toBeUndefined();
    expect(aplicarCampos(conTextosYa, r[0], { reemplazar: ["anuncio"] }).cambios.anuncio.textos[0]).toBe("Uno");
  });

  it("desde la pantalla: el caption de lo que va a pauta pide también sus textos aparte, y «Completar» los cuenta como lo que falta", async () => {
    const cuerpos = [];
    vi.stubGlobal("fetch", async (url, op = {}) => {
      const b = JSON.parse(op.body);
      cuerpos.push(b);
      return Response.json({ textos: b.publicaciones.map((c, i) => ({ clave: c.clave, n: i + 1, campos: { descripcion: "Ven", anuncio: { textos: ["A", "B", "C"], titulos: [], descripcion: "", boton: "WHATSAPP_MESSAGE" } } })) });
    });
    await textoDeUnCampo("c1", { post: { ...enPauta, hashtagsFinales: "#a" }, day: { date: "2026-10-05" }, cal: null, campo: "descripcion" });
    expect(cuerpos[0].publicaciones[0].campos).toEqual(["descripcion", "anuncio"]);
    expect(cuerpos[0].publicaciones[0].pauta).toEqual({ etapa: "presentacion", como: "publicacion" });
    const days = [{ date: "2026-10-05", posts: [{ ...enPauta, descripcion: "Ya", textoPieza: "t", hashtagsFinales: "#a" }] }];
    await escribirLoQueFalta("c1", { year: 2026, month: 9, days }, [{ post: days[0].posts[0], day: days[0] }]);
    expect(cuerpos[1].publicaciones[0].campos).toEqual(["anuncio"]);
  });

  it("«Reescribir como anuncio»: los campos pedidos se reescriben, con lo que pide la agencia", async () => {
    const cuerpos = [];
    vi.stubGlobal("fetch", async (url, op = {}) => {
      const b = JSON.parse(op.body);
      cuerpos.push(b);
      return Response.json({ textos: [{ clave: "p9", n: 1, campos: { descripcion: "Nuevo como anuncio" } }] });
    });
    const { reescribirComoAnuncio } = await import("./escribirTextos.js");
    const cambios = await reescribirComoAnuncio("c1", { post: { ...enPauta, descripcion: "¡Hoy abrimos!" }, campos: ["descripcion"], pide: "Distinta de otra" });
    expect(cambios).toEqual({ descripcion: "Nuevo como anuncio" });
    expect(cuerpos[0].publicaciones[0]).toMatchObject({ campos: ["descripcion"], antes: { descripcion: "¡Hoy abrimos!" }, pide: "Distinta de otra" });
  });
});
