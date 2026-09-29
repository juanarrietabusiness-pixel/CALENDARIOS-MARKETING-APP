import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  slug, rutaUnica, limpiarNota, clasificarArchivo, tituloDeArchivo, seccionesDe, dividirEnNotas,
  MAX_TEXTO, AUTORIDAD, SIEMPRE, TIPOS,
} from "../../worker/lib/cerebro/notas.js";
import { RAIZ, hayWorkspace } from "../../src/lib/workspace.test-helper.js";

// ============================================================
// Las notas del cerebro: qué es una, de qué tipo, y cómo se parte un
// archivo del repositorio en notas. Todo mecánico: si esto pasara por un
// modelo, podría resumir mal y perder una regla.
// ============================================================

describe("rutas de notas", () => {
  it("un título pasa a slug: sin tildes, en minúsculas y con guiones", () => {
    expect(slug("Tono y voz de la marca")).toBe("tono-y-voz-de-la-marca");
    expect(slug("¿Qué NO se le pide? (Meta AI)")).toBe("que-no-se-le-pide-meta-ai");
    expect(slug("   ")).toBe("nota");
    expect(slug("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it("dos notas con el mismo título no comparten ruta", () => {
    const usadas = new Set(["tono"]);
    expect(rutaUnica("tono", usadas)).toBe("tono-2");
    usadas.add("tono-2");
    expect(rutaUnica("tono", usadas)).toBe("tono-3");
    expect(rutaUnica("precios", usadas)).toBe("precios");
  });
});

describe("limpiarNota: lo que llega del navegador", () => {
  it("acepta una nota buena y normaliza", () => {
    const r = limpiarNota({ titulo: "  Garantía ", texto: "Dos años.\r\nTodo.", tipo: "marca", interna: true });
    expect(r.nota).toEqual({ titulo: "Garantía", texto: "Dos años.\nTodo.", tipo: "marca", interna: 1, fuente: "", origen: "manual" });
  });

  it("un tipo o un origen inventados vuelven a los de siempre", () => {
    const r = limpiarNota({ titulo: "x", texto: "y", tipo: "secreto", origen: "hacker" });
    expect(r.nota.tipo).toBe("nota");
    expect(r.nota.origen).toBe("manual");
  });

  it("rechaza lo vacío y lo enorme, con el motivo", () => {
    expect(limpiarNota({ titulo: "", texto: "algo" }).error).toMatch(/título/);
    expect(limpiarNota({ titulo: "a", texto: "  \n " }).error).toMatch(/vacía/);
    expect(limpiarNota({ titulo: "a", texto: "x".repeat(MAX_TEXTO + 1) }).error).toMatch(/pártela/);
  });
});

describe("clasificar un archivo del repositorio", () => {
  const c = (r) => clasificarArchivo(r);
  it("el canon es marca", () => {
    for (const r of ["Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md", "X/01_ADN_y_Memoria/02_buyer_personas.md", "X/01_ADN_y_Memoria/03_diccionario_seo.json"]) {
      expect(c(r)).toMatchObject({ tipo: "marca", interna: 0 });
    }
  });
  it("la receta es maquetación y el prompt maestro se trata por secciones", () => {
    expect(c("X/01_ADN_y_Memoria/05_receta.json")).toMatchObject({ tipo: "maquetacion", forma: "receta" });
    expect(c("X/01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md")).toMatchObject({ forma: "prompt-maestro" });
  });
  it("lo que produjo otro sistema es un borrador interno", () => {
    expect(c("X/03_Redes_Sociales/Auditorias/2026-07-26_ideas.md")).toMatchObject({ tipo: "borrador", interna: 1 });
    expect(c("X/03_Redes_Sociales/Instagram_TikTok/2026-08-17_prompt_maestro_meta_ai_semana.md")).toMatchObject({ tipo: "borrador", interna: 1 });
  });
  it("lo demás es un documento", () => {
    expect(c("X/02_Web_y_SEO/brief.md")).toMatchObject({ tipo: "documento", interna: 0 });
  });
  it("el título sale del nombre del archivo", () => {
    expect(tituloDeArchivo("X/01_ADN_y_Memoria/01_brand_guidelines.md")).toBe("Brand guidelines");
    expect(tituloDeArchivo("X/05_receta.json")).toBe("Receta");
  });
});

describe("seccionesDe", () => {
  const md = "# Manual\n\nIntro.\n\n## 1 · Tono\n\nCercano.\n\n## 2 · Límites\n\nNunca versículos.\n";
  it("parte por «##», con la introducción aparte y sin la numeración en el título", () => {
    const s = seccionesDe(md);
    expect(s.map((x) => [x.titulo, x.intro])).toEqual([["", true], ["Tono", false], ["Límites", false]]);
    expect(s.map((x) => x.texto).join("")).toBe(md);
  });

  it("una sección enorme se parte por «###» y cada trozo lleva su jerarquía", () => {
    const grande = `## Plantillas\n\nIntro.\n\n### A · Ambiente\n\n${"a ".repeat(50)}\n\n### B · Valor\n\n${"b ".repeat(50)}\n`;
    const s = seccionesDe(grande, 100);
    expect(s.map((x) => x.titulo)).toEqual(["Plantillas", "Plantillas › A · Ambiente", "Plantillas › B · Valor"]);
  });

  it("una sección enorme sin «###» se queda entera", () => {
    const s = seccionesDe(`## Solo\n\n${"palabra ".repeat(2000)}`, 100);
    expect(s).toHaveLength(1);
  });
});

describe("dividirEnNotas", () => {
  const PROMPT = "# Sistema · Meta AI\n\nIntro.\n\n## 1 · El reparto del trabajo\nMeta pinta.\n\n## 2 · Las plantillas\nA, B y C.\n\n## 3 · Cómo se arma la semana\nUn post al día.\n\n## 4 · Las reglas duras\nNunca versículos.\n";

  it("el prompt maestro: las secciones de maquetación son maquetación, las de reglas son marca", () => {
    const n = dividirEnNotas("X/01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md", PROMPT);
    const por = Object.fromEntries(n.map((x) => [x.titulo.replace(/^.* — /, ""), x.tipo]));
    expect(por["El reparto del trabajo"]).toBe("maquetacion");
    expect(por["Las plantillas"]).toBe("maquetacion");
    expect(por["Cómo se arma la semana"]).toBe("marca");
    expect(por["Las reglas duras"]).toBe("marca");
    expect(n[0].tipo, "la introducción del documento de maquetación también lo es").toBe("maquetacion");
  });

  it("todas las notas llevan su fuente, su origen y una ruta única", () => {
    const usadas = new Set();
    const n = dividirEnNotas("X/01_ADN_y_Memoria/01_brand_guidelines.md", "# M\n\n## Tono\nA.\n\n## Tono\nB.\n", usadas);
    expect(n.every((x) => x.fuente === "X/01_ADN_y_Memoria/01_brand_guidelines.md" && x.origen === "repositorio")).toBe(true);
    expect(new Set(n.map((x) => x.ruta)).size).toBe(n.length);
    expect(usadas.size).toBe(n.length);
  });

  it("no pierde ni añade texto: las notas de un archivo juntas son el archivo", () => {
    const md = "# Manual\n\nIntro.\n\n## Tono\n\nCercano.\n\n## Límites\n\nNunca versículos.\n";
    const n = dividirEnNotas("X/01_ADN_y_Memoria/01_brand_guidelines.md", md);
    expect(n.map((x) => x.texto).join("\n\n")).toBe(md.trim().replace(/\n\n(?=## )/g, "\n\n"));
  });

  it("la receta se parte en las reglas de texto y en las medidas", () => {
    const receta = JSON.stringify({ marca: "X", hashtags: "#x", cta: "Escríbenos", lienzo: { ancho: 1080 }, colores: [{ hex: "#fff" }] });
    const n = dividirEnNotas("X/01_ADN_y_Memoria/05_receta.json", receta);
    expect(n).toHaveLength(2);
    const texto = n.find((x) => x.tipo === "marca");
    const medidas = n.find((x) => x.tipo === "maquetacion");
    expect(JSON.parse(texto.texto)).toEqual({ marca: "X", hashtags: "#x", cta: "Escríbenos" });
    expect(JSON.parse(medidas.texto)).toEqual({ lienzo: { ancho: 1080 }, colores: [{ hex: "#fff" }] });
  });

  it("una receta rota o recortada entra entera como maquetación, sin perderse", () => {
    const n = dividirEnNotas("X/01_ADN_y_Memoria/05_receta.json", '{"marca":"X","lien');
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ tipo: "maquetacion", texto: '{"marca":"X","lien' });
  });

  it("un informe de otro sistema es UNA nota interna, no cuarenta", () => {
    const informe = "# Reporte\n\n## Métricas\nx\n\n## Ideas\ny\n\n## Tendencias\nz\n";
    const n = dividirEnNotas("X/03_Redes_Sociales/Auditorias/2026-07-26_ideas.md", informe);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ tipo: "borrador", interna: 1 });
  });

  it("una sección que se llama «Economía unitaria» se marca interna; la que sólo lo menciona se avisa", () => {
    const md = "# M\n\n## Precios\n\nRN $50. Costo $9 (nunca se dicen al cliente).\n\n## Economía unitaria\n\nMargen 30 %.\n\n## Tono\n\nCercano.\n";
    const n = dividirEnNotas("X/01_ADN_y_Memoria/04_master_prompts.md", md);
    const por = Object.fromEntries(n.map((x) => [x.titulo.replace(/^.* — /, ""), x]));
    expect(por["Economía unitaria"].interna).toBe(1);
    expect(por["Precios"].interna, "un precio de venta puede vivir junto a un costo: no se oculta sola").toBe(0);
    expect(por["Precios"].revisar).toBe(true);
    expect(por["Tono"].revisar).toBeUndefined();
  });

  it("un archivo corto sin secciones es una nota con el título de su encabezado", () => {
    const n = dividirEnNotas("X/02_Web_y_SEO/brief.md", "# Brief del sitio\n\nUn párrafo.");
    expect(n).toHaveLength(1);
    expect(n[0].titulo).toBe("Brief del sitio");
  });

  it("todo tipo que sale existe", () => {
    const n = dividirEnNotas("X/01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md", PROMPT);
    expect(n.every((x) => TIPOS.includes(x.tipo))).toBe(true);
  });
});

describe("autoridad", () => {
  it("el canon pesa más que un documento y un borrador casi nada; la ficha y las cifras no compiten", () => {
    expect(AUTORIDAD.marca).toBeGreaterThan(AUTORIDAD.documento);
    expect(AUTORIDAD.borrador).toBeLessThan(0.5);
    expect(SIEMPRE).toEqual(["ficha", "cifras"]);
    for (const t of SIEMPRE) expect(AUTORIDAD[t]).toBeUndefined();
  });
});

describe.skipIf(!hayWorkspace)("con el ADN real de Agencia_Workspace", () => {
  const recorrer = (cliente) => {
    const usadas = new Set();
    const notas = [];
    const ir = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (/06_Assets/.test(p)) continue;
        if (e.isDirectory()) ir(p);
        else if (/\.(md|json)$/.test(e.name)) notas.push(...dividirEnNotas(p.slice(RAIZ.length + 1), readFileSync(p, "utf8"), usadas));
      }
    };
    ir(`${RAIZ}/${cliente}`);
    return notas;
  };

  it.each(["Dcasa", "Baby Caleb", "Feria del lente", "Juancito Ads", "Rofer Service"])("%s: rutas únicas, notas de tamaño útil y nada por encima del tope", (cliente) => {
    const notas = recorrer(cliente);
    expect(new Set(notas.map((n) => n.ruta)).size).toBe(notas.length);
    expect(notas.length).toBeGreaterThan(8);
    expect(notas.every((n) => n.texto.length > 0 && n.texto.length <= MAX_TEXTO)).toBe(true);
    const canon = notas.filter((n) => n.tipo === "marca");
    expect(canon.length, "el canon no puede quedar vacío").toBeGreaterThan(5);
  });

  it("Baby Caleb: los costos y proveedores quedan internos y el precio de venta NO", () => {
    const notas = recorrer("Baby Caleb");
    const internas = notas.filter((n) => n.interna && n.tipo !== "borrador").map((n) => n.titulo);
    expect(internas.some((t) => /Econom[ií]a unitaria/i.test(t))).toBe(true);
    expect(internas.some((t) => /proveedores/i.test(t))).toBe(true);
    const precios = notas.find((n) => /precios/i.test(n.titulo) && n.tipo === "marca");
    expect(precios, "la sección de precios existe").toBeDefined();
    expect(precios.interna).toBe(0);
    expect(precios.texto).toMatch(/\$/);
  });
});
