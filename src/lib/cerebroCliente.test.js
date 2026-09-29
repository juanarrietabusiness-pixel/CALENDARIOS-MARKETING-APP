import { describe, it, expect, vi, afterEach } from "vitest";
import {
  textoEstableDelCerebro, consultaDeTanda, consultaDePublicacion, TEXTO_SIN_FICHA,
  usaElCerebro, crearMemoriaCorta, contextoDelChat,
} from "./cerebroCliente";
import { guardarNota, borrarNota, importarAlCerebro, listarCerebro } from "./cerebro";
import { contextoEnBloques, MIN_CARACTERES_CACHE } from "./contextoADN";
import { buildClientContext, buildScriptPrompt, loadADN, contextoDelCerebro, pasajesDeLaTanda, adnParaElChat } from "../api";

// ============================================================
// La generación con el cerebro del cliente
//
// Lo que se comprueba, por orden de importancia:
//   1. Los pasajes de CADA tanda van detrás de la marca de caché: el
//      bloque cacheado es idéntico entre tandas. Si un pasaje se colara
//      dentro, cada tanda escribiría la caché entera y nunca la leería.
//   2. Si el cerebro falla o está vacío, la generación sigue con el ADN
//      de la ficha, como antes, en vez de romperse.
//   3. Sin `forzar`, manda el cerebro; con `forzar`, se relee GitHub.
// ============================================================

afterEach(() => {
  vi.unstubAllGlobals();
  contextoDelChat.olvidar("c1");
});

const cliente = { id: "c1", dbId: "c1", name: "Dcasa", industry: "Muebles", githubRepo: "https://github.com/x/y", githubContext: "ADN VIEJO DE LA FICHA" };
// Una ficha de verdad mide unos 3 500 caracteres (la pasada de IA la pide así): con menos, el bloque cacheado
// no llega al mínimo que Anthropic cachea y se manda sin más, que también está bien.
const FICHA = "Dcasa vende muebles y hogar en Panamá. Tono cercano. ".repeat(65);
const CIFRAS = "- Envío gratis desde $300 [[precios]]";

/** El Worker de mentira: contesta al contexto con lo que se le dé. */
function cerebroFalso({ ficha = FICHA, cifras = CIFRAS, notas = 12, estado = 200, falla = false } = {}) {
  const pedidos = [];
  vi.stubGlobal("fetch", async (url, init) => {
    pedidos.push({ url: String(url), cuerpo: JSON.parse(init.body) });
    if (falla) throw new Error("sin red");
    if (estado !== 200) return new Response("", { status: estado });
    const consulta = JSON.parse(init.body).consulta;
    return Response.json({ ficha, cifras, pasajes: consulta ? `PASAJES PARA: ${consulta}` : "", fuentes: [], notas });
  });
  return pedidos;
}

describe("el texto estable", () => {
  it("lleva la ficha y las cifras, cada una con su título", () => {
    const t = textoEstableDelCerebro({ ficha: "Quién es: Dcasa", cifras: "- Envío gratis" });
    expect(t).toMatch(/^FICHA TÉCNICA\nQuién es: Dcasa/);
    expect(t).toMatch(/CIFRAS VIGENTES[^\n]*\n- Envío gratis/);
  });

  it("sin cifras, sólo la ficha; sin ninguna, dice que no está preparada en vez de quedar vacío", () => {
    expect(textoEstableDelCerebro({ ficha: "x", cifras: "" })).not.toMatch(/CIFRAS/);
    expect(textoEstableDelCerebro({})).toBe(TEXTO_SIN_FICHA);
    expect(TEXTO_SIN_FICHA).toMatch(/no lo inventes/);
  });
});

describe("qué buscar", () => {
  it("una tanda pregunta por la campaña, las ofertas y lo que dice cada publicación", () => {
    const q = consultaDeTanda(
      { campaign: "Octubre sofás", offers: "2x1" },
      [{ idea: "Reel de sofás seccionales", category: "producto", format: "reel", _concept: "semana 1" }, { idea: "Tips de limpieza", format: "post" }],
    );
    for (const t of ["Octubre sofás", "2x1", "sofás seccionales", "producto", "reel", "Tips de limpieza"]) expect(q).toContain(t);
  });

  it("no pasa de 1 500 caracteres ni se rompe con huecos", () => {
    expect(consultaDeTanda({}, [{}, { idea: "x".repeat(5000) }]).length).toBeLessThanOrEqual(1500);
    expect(consultaDeTanda(undefined, undefined)).toBe("");
  });

  it("una publicación suelta usa su categoría o la de su día", () => {
    expect(consultaDePublicacion({ campaign: "C" }, { idea: "I", format: "post" }, { category: "cat", concept: "sem" })).toBe("C · I · cat · post · sem");
  });
});

describe("el contexto en modo cerebro", () => {
  const adn = textoEstableDelCerebro({ ficha: FICHA, cifras: CIFRAS });

  it("dice que la fuente de verdad es el cerebro, no el repositorio", () => {
    const t = buildClientContext(cliente, { campaign: "Octubre" }, adn, { pasajes: "un pasaje" });
    expect(t).toContain("CEREBRO DE DCASA");
    expect(t).toMatch(/El cerebro del cliente que viene abajo/);
    expect(t).not.toContain("leído de su repositorio");
    expect(t).not.toContain("no tiene ADN conectado");
  });

  it("los pasajes de la tanda van DESPUÉS de la marca de caché", () => {
    const t = buildClientContext(cliente, { campaign: "Octubre" }, adn, { pasajes: "PASAJE DE SOFÁS" });
    const b = contextoEnBloques(t);
    expect(b, "el contexto del cerebro tiene que ser lo bastante grande para cachearse").not.toBeNull();
    expect(b[0].text).toContain("Envío gratis");
    expect(b[0].text).not.toContain("PASAJE DE SOFÁS");
    expect(b[1].text).toContain("PASAJE DE SOFÁS");
    expect(b[1].text).toContain("PASAJES DEL CEREBRO");
  });

  it("dos tandas distintas comparten el bloque cacheado byte a byte", () => {
    const a = contextoEnBloques(buildClientContext(cliente, { campaign: "Octubre" }, adn, { pasajes: "sofás seccionales" }));
    const b = contextoEnBloques(buildClientContext(cliente, { campaign: "Octubre" }, adn, { pasajes: "hashtags y WhatsApp" }));
    expect(a[0].text).toBe(b[0].text);
    expect(a[1].text).not.toBe(b[1].text);
  });

  it("también con el prompt de guiones completo: la caché sigue intacta y el pedido va detrás", () => {
    const post = { id: "p1", format: "reel", idea: "Sofás", _date: "2026-10-05", _dayName: "lunes" };
    const p = buildScriptPrompt(cliente, { campaign: "Octubre" }, [post], adn, [], { pasajes: "PASAJE" });
    const b = contextoEnBloques(p);
    expect(b[0].text.length).toBeGreaterThan(MIN_CARACTERES_CACHE);
    expect(b[1].text).toContain("PUBLICACION_ID:p1");
    expect(b[0].text).not.toContain("PUBLICACION_ID");
  });

  it("sin cerebro, el contexto es el de siempre", () => {
    const t = buildClientContext(cliente, {}, "## ADN\nmanual de marca", null);
    expect(t).toContain("ADN DE DCASA — leído de su repositorio");
    expect(t).not.toContain("PASAJES DEL CEREBRO");
  });
});

describe("loadADN", () => {
  it("con cerebro, manda el cerebro: su ficha y sus cifras, y no relee GitHub", async () => {
    const pedidos = cerebroFalso();
    const r = await loadADN(cliente);
    expect(r).toMatchObject({ cerebro: true, notas: 12, cacheado: false });
    expect(r.content).toContain("FICHA TÉCNICA");
    expect(r.content).toContain("Envío gratis");
    expect(r.content).not.toContain("ADN VIEJO");
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe("/api/cerebro/c1/contexto");
  });

  it("con el cerebro vacío (0 notas) vuelve al ADN de la ficha", async () => {
    cerebroFalso({ notas: 0 });
    expect(await loadADN(cliente)).toEqual({ content: "ADN VIEJO DE LA FICHA", sections: {}, cacheado: true });
  });

  it("si el Worker falla, o no hay red, también: la generación no se rompe", async () => {
    cerebroFalso({ estado: 500 });
    expect((await loadADN(cliente)).content).toBe("ADN VIEJO DE LA FICHA");
    cerebroFalso({ falla: true });
    expect((await loadADN(cliente)).content).toBe("ADN VIEJO DE LA FICHA");
  });

  it("con «forzar» se salta el cerebro: es lo que hace la ficha del cliente para probar GitHub", async () => {
    const pedidos = [];
    vi.stubGlobal("fetch", async (url) => {
      pedidos.push(String(url));
      return String(url).startsWith("/api/adn") ? Response.json({ content: "DE GITHUB", files: [] }) : Response.json({ ficha: "x", notas: 12 });
    });
    const r = await loadADN({ ...cliente, githubContext: "" }, { forzar: true });
    expect(r.content).toBe("DE GITHUB");
    expect(r.cerebro).toBeUndefined();
    expect(pedidos.some((p) => p.includes("/api/cerebro/")), "no debe ni preguntarle al cerebro").toBe(false);
  });

  it("un cliente sin id no pide nada", async () => {
    const pedidos = cerebroFalso();
    expect(await contextoDelCerebro(undefined)).toBeNull();
    expect(pedidos).toHaveLength(0);
  });
});

describe("cuándo se usa el cerebro", () => {
  it("con notas y con ficha, siempre", () => {
    expect(usaElCerebro({ notas: 5, ficha: "Quién es…" }, { githubContext: "ADN VIEJO" })).toBe(true);
    expect(usaElCerebro({ notas: 5, ficha: "Quién es…" }, {})).toBe(true);
  });

  it("sin notas para este uso, nunca", () => {
    expect(usaElCerebro({ notas: 0, ficha: "algo" }, {})).toBe(false);
    expect(usaElCerebro(null, {})).toBe(false);
    expect(usaElCerebro({}, {})).toBe(false);
  });

  it("con notas pero SIN ficha, sólo si no hay un ADN de la ficha al que volver", () => {
    expect(usaElCerebro({ notas: 5, ficha: "  ", cifras: "x" }, { githubContext: "ADN VIEJO" })).toBe(false);
    expect(usaElCerebro({ notas: 5, ficha: "" }, { githubContext: "" })).toBe(true);
    expect(usaElCerebro({ notas: 5, ficha: "" }, undefined)).toBe(true);
  });
});

describe("loadADN cuando el cerebro aún no tiene ficha", () => {
  it("con un ADN guardado en la ficha del cliente, sigue con ese ADN (el cerebro no lo sustituye por unos pasajes sueltos)", async () => {
    cerebroFalso({ ficha: "", cifras: "" });
    expect(await loadADN(cliente)).toEqual({ content: "ADN VIEJO DE LA FICHA", sections: {}, cacheado: true });
  });

  it("sin ADN guardado, usa el cerebro aunque no tenga ficha, y lo dice", async () => {
    cerebroFalso({ ficha: "", cifras: "" });
    const r = await loadADN({ ...cliente, githubContext: "" });
    expect(r).toMatchObject({ cerebro: true, content: TEXTO_SIN_FICHA });
  });

  it("y con los pasajes de la tanda pasa lo mismo: no se piden si el cliente no usa el cerebro", async () => {
    const pedidos = cerebroFalso({ ficha: "" });
    const adn = await loadADN(cliente);
    pedidos.length = 0;
    expect(await pasajesDeLaTanda(cliente, adn, {}, [{ idea: "x" }])).toBe("");
    expect(pedidos).toHaveLength(0);
  });
});

describe("una memoria corta", () => {
  it("guarda un valor un rato y luego lo suelta", () => {
    let ahora = 1000;
    const m = crearMemoriaCorta(60_000, () => ahora);
    m.poner("c1", { notas: 3 });
    expect(m.leer("c1")).toEqual({ notas: 3 });
    ahora += 59_999;
    expect(m.leer("c1")).toEqual({ notas: 3 });
    ahora += 1;
    expect(m.leer("c1")).toBeUndefined();
  });

  it("un «null» guardado cuenta como valor: un cliente sin cerebro no vuelve a preguntarse en cada mensaje", () => {
    const m = crearMemoriaCorta();
    m.poner("c1", null);
    expect(m.leer("c1")).toBeNull();
    expect(m.leer("c2")).toBeUndefined();
  });

  it("olvidar suelta sólo ese cliente", () => {
    const m = crearMemoriaCorta();
    m.poner("c1", 1);
    m.poner("c2", 2);
    m.olvidar("c1");
    expect(m.leer("c1")).toBeUndefined();
    expect(m.leer("c2")).toBe(2);
  });
});

describe("el ADN del asistente", () => {
  it("con cerebro y ficha, la ficha y las cifras; y sólo una petición por minuto y cliente", async () => {
    const pedidos = cerebroFalso();
    const a = await adnParaElChat(cliente);
    const b = await adnParaElChat(cliente);
    expect(a).toMatchObject({ cerebro: true });
    expect(a.content).toContain("Envío gratis");
    expect(b).toEqual(a);
    expect(pedidos, "el chat pregunta en cada mensaje: sin memoria sería una vuelta al servidor cada vez").toHaveLength(1);
  });

  it("sin cerebro, lo que el cliente ya lleva en su ficha —como antes—, sin releer GitHub", async () => {
    const pedidos = cerebroFalso({ notas: 0 });
    const r = await adnParaElChat({ ...cliente, githubRepo: "https://github.com/x/y" });
    expect(r).toEqual({ content: "ADN VIEJO DE LA FICHA", cerebro: false });
    expect(pedidos.every((p) => p.url.startsWith("/api/cerebro/")), "el chat no debe disparar la lectura del repositorio").toBe(true);
    await adnParaElChat(cliente);
    expect(pedidos, "tampoco repite la pregunta: el «no hay cerebro» también se recuerda").toHaveLength(1);
  });

  it("sin cerebro y sin ADN guardado, vacío: nunca lanza ni lee GitHub", async () => {
    cerebroFalso({ falla: true });
    expect(await adnParaElChat({ id: "c1", name: "Dcasa", githubRepo: "https://github.com/x/y" })).toEqual({ content: "", cerebro: false });
  });

  it("con cerebro pero sin ficha y con un ADN guardado, el ADN guardado", async () => {
    cerebroFalso({ ficha: "" });
    expect(await adnParaElChat(cliente)).toEqual({ content: "ADN VIEJO DE LA FICHA", cerebro: false });
  });

  it("cambiar el cerebro desde la pestaña suelta lo recordado: la ficha corregida llega al chat en el acto", async () => {
    const respuestas = [];
    vi.stubGlobal("fetch", async (url, init) => {
      respuestas.push({ url: String(url), metodo: init?.method ?? "GET" });
      if (String(url).endsWith("/contexto")) return Response.json({ ficha: FICHA, cifras: CIFRAS, pasajes: "", fuentes: [], notas: 3 });
      return Response.json({ ok: true });
    });
    await adnParaElChat(cliente);
    await adnParaElChat(cliente);
    expect(respuestas.filter((r) => r.url.endsWith("/contexto"))).toHaveLength(1);

    await guardarNota("c1", { titulo: "Ficha técnica", texto: "corregida", tipo: "ficha" });
    await adnParaElChat(cliente);
    expect(respuestas.filter((r) => r.url.endsWith("/contexto")), "guardar una nota lo suelta").toHaveLength(2);

    await borrarNota("c1", "n1");
    await adnParaElChat(cliente);
    expect(respuestas.filter((r) => r.url.endsWith("/contexto")), "borrarla también").toHaveLength(3);

    await importarAlCerebro("c1");
    await adnParaElChat(cliente);
    expect(respuestas.filter((r) => r.url.endsWith("/contexto")), "e importar también").toHaveLength(4);

    await listarCerebro("c1");
    await adnParaElChat(cliente);
    expect(respuestas.filter((r) => r.url.endsWith("/contexto")), "mirar no lo suelta").toHaveLength(4);
  });

  it("aunque el cambio falle, se suelta: pudo quedar a medias", async () => {
    vi.stubGlobal("fetch", async (url) => (String(url).endsWith("/contexto")
      ? Response.json({ ficha: FICHA, cifras: "", pasajes: "", fuentes: [], notas: 3 })
      : new Response(JSON.stringify({ error: "no" }), { status: 500 })));
    await adnParaElChat(cliente);
    expect(contextoDelChat.leer("c1")).toBeDefined();
    await expect(guardarNota("c1", { titulo: "x", texto: "y" })).rejects.toThrow();
    expect(contextoDelChat.leer("c1")).toBeUndefined();
  });
});

describe("los pasajes de una tanda", () => {
  it("se piden con lo que dicen sus publicaciones, y sólo si el cliente usa el cerebro", async () => {
    const pedidos = cerebroFalso();
    const adn = await loadADN(cliente);
    const texto = await pasajesDeLaTanda(cliente, adn, { campaign: "Octubre" }, [{ idea: "Reel de sofás", format: "reel" }]);
    expect(texto).toContain("Reel de sofás");
    expect(pedidos.at(-1).cuerpo).toMatchObject({ para: "texto", presupuesto: 6000 });
    expect(await pasajesDeLaTanda(cliente, { cerebro: undefined }, {}, [])).toBe("");
  });

  it("si falla, la tanda sigue sin pasajes en vez de romperse", async () => {
    cerebroFalso();
    const adn = await loadADN(cliente);
    cerebroFalso({ falla: true });
    expect(await pasajesDeLaTanda(cliente, adn, {}, [{ idea: "x" }])).toBe("");
  });
});

describe("el asistente", () => {
  const legacy = "\n--- X/01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md ---\n# Sistema\n\n## 1 · Las plantillas\nPlantilla A: fondo azul.\n\n## 2 · Las reglas duras\nNunca versículos.\n";
  const cli = { id: "c1", name: "Dcasa", githubRepo: "x" };

  it("sin cerebro sigue viendo el ADN ENTERO, maquetación incluida: alguien puede pedirle el prompt para Meta AI", async () => {
    const { buildChatSystemPrompt } = await import("../api");
    const chat = buildChatSystemPrompt(cli, null, legacy, []);
    const texto = buildClientContext(cli, null, legacy);
    expect(chat).toContain("Plantilla A: fondo azul.");
    expect(texto, "lo que escribe captions no la necesita").not.toContain("Plantilla A: fondo azul.");
    expect(chat).toContain("Nunca versículos.");
  });

  it("con cerebro recibe la ficha y las cifras, y sabe que el resto lo busca con buscar_cerebro", async () => {
    const { buildChatSystemPrompt } = await import("../api");
    const chat = buildChatSystemPrompt(cli, null, textoEstableDelCerebro({ ficha: FICHA, cifras: CIFRAS }), [], { pasajes: "" });
    expect(chat).toContain("CEREBRO DE DCASA");
    expect(chat).toContain("Envío gratis");
    expect(chat).toMatch(/buscar_cerebro/);
    expect(chat).toMatch(/No digas que no sabes algo sin buscarlo/);
  });

  it("sin cerebro no le habla de una herramienta que no aplica", async () => {
    const { buildChatSystemPrompt } = await import("../api");
    expect(buildChatSystemPrompt(cli, null, legacy, [])).not.toMatch(/buscar_cerebro/);
  });
});
