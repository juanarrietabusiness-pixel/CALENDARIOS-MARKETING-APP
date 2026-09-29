import { describe, it, expect, vi, afterEach } from "vitest";
import {
  textoEstableDelCerebro, consultaDeTanda, consultaDePublicacion, TEXTO_SIN_FICHA,
} from "./cerebroCliente";
import { contextoEnBloques, MIN_CARACTERES_CACHE } from "./contextoADN";
import { buildClientContext, buildScriptPrompt, loadADN, contextoDelCerebro, pasajesDeLaTanda } from "../api";

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

afterEach(() => vi.unstubAllGlobals());

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
