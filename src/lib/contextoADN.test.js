import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  sinCapaMaquetacion, promptMaestroSoloTexto, recetaSoloTexto,
  contextoEnBloques, prepararContenidoIA, TITULO_FICHA, MIN_CARACTERES_CACHE,
} from "./contextoADN";
import { buildClientContext } from "../api";
import { RAIZ, hayWorkspace } from "./workspace.test-helper";

// ============================================================
// Qué del ADN viaja a la IA cuando se ESCRIBE texto, y cómo se parte para
// la caché de prompt. Los dos fallan abierto: lo que no reconocen, pasa
// entero. Estas pruebas comprueban las dos mitades de esa frase: que
// recorta lo que dice, y que no toca lo que no sabe leer.
// ============================================================

/** Un ADN como lo arma `worker/rutas/adn.js`: `\n--- ruta ---\ntexto\n` por archivo. */
const adn = (...archivos) => archivos.map(([ruta, texto]) => `\n--- ${ruta} ---\n${texto}\n`).join("");

const GUIDELINES = "# MANUAL DE MARCA\n\n## 0. Datos\nTono cercano. Precio RN $50.\n";
const RECETA = JSON.stringify({
  marca: "Baby Caleb", slug: "baby-caleb", hashtags: "#BabyCaleb", emojis: "con medida",
  cta: "Escríbenos", cifrasPermitidas: ["$50"], reglasDuras: ["Nada de versículos"],
  lienzo: { ancho: 1080, alto: 1350 }, fuentes: { familias: ["Montserrat"] },
  colores: [{ hex: "#1B3246" }], escala: [{ px: 104 }], plantillas: [{ id: "A" }],
}, null, 2);
const PROMPT_MAESTRO = [
  "# Sistema · Meta AI → semana en HTML\n\nIntroducción.\n",
  "## 1 · El reparto del trabajo\nMeta pinta, nosotros escribimos.\n",
  "## 2 · Las tres plantillas ✎\n### A · Ambiente\nLa foto manda.\n",
  "## 3 · Color y tipografía\n### La escala\n104 px.\n",
  "## 4 · El bloque de estilo y los negativos\nSin texto en el fondo.\n",
  "## 5 · El logo — se carga, no se dibuja\nBase64.\n",
  "## 6 · Cómo se arma el lote\n### La descripción de cada publicación\nMáximo 2.200 caracteres.\n",
  "## 7 · Las reglas duras (las que cuestan clientes)\nNunca decir el costo.\n",
  "## 8 · Verificación propia de esta marca\nRevisar hex.\n",
].join("\n");

describe("promptMaestroSoloTexto", () => {
  const r = promptMaestroSoloTexto(PROMPT_MAESTRO);

  it("quita las secciones que sólo hablan de maquetación", () => {
    for (const fuera of ["El reparto del trabajo", "Las tres plantillas", "Color y tipografía", "El bloque de estilo", "El logo", "Verificación propia"]) {
      expect(r).not.toContain(fuera);
    }
  });

  it("deja lo que dice qué se escribe y a qué no se puede llegar", () => {
    expect(r).toContain("Cómo se arma el lote");
    expect(r).toContain("La descripción de cada publicación");
    expect(r).toContain("Máximo 2.200 caracteres.");
    expect(r).toContain("Las reglas duras");
    expect(r).toContain("Nunca decir el costo.");
  });

  it("conserva la cabecera del documento", () => {
    expect(r.startsWith("# Sistema · Meta AI")).toBe(true);
  });

  it("un «###» no parte una sección: sus hijos se van o se quedan con ella", () => {
    expect(r).not.toContain("### La escala");
    expect(r).toContain("### La descripción de cada publicación");
  });

  it("un documento sin secciones de maquetación pasa entero", () => {
    const md = "# Notas\n\n## Tono\nCercano.\n";
    expect(promptMaestroSoloTexto(md)).toBe(md);
  });
});

describe("recetaSoloTexto", () => {
  it("se queda con hashtags, emojis, CTA, cifras y reglas duras", () => {
    const r = JSON.parse(recetaSoloTexto(RECETA));
    expect(Object.keys(r).sort()).toEqual(["cifrasPermitidas", "cta", "emojis", "hashtags", "marca", "reglasDuras", "slug"]);
    expect(r.cifrasPermitidas).toEqual(["$50"]);
  });

  it("tira las medidas del lienzo, las fuentes y los colores", () => {
    const r = recetaSoloTexto(RECETA);
    for (const fuera of ["lienzo", "fuentes", "colores", "escala", "plantillas"]) expect(r).not.toContain(`"${fuera}"`);
  });

  it("un JSON recortado por el presupuesto del archivo no se toca", () => {
    const cortado = RECETA.slice(0, 120);
    expect(recetaSoloTexto(cortado)).toBe(cortado);
  });

  it("algo que no es un objeto no se toca", () => {
    expect(recetaSoloTexto("[1,2]")).toBe("[1,2]");
  });
});

describe("sinCapaMaquetacion", () => {
  const completo = adn(
    ["Baby Caleb/01_ADN_y_Memoria/01_brand_guidelines.md", GUIDELINES],
    ["Baby Caleb/01_ADN_y_Memoria/05_receta.json", RECETA],
    ["Baby Caleb/01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md", PROMPT_MAESTRO],
    ["Baby Caleb/03_Redes_Sociales/Instagram_TikTok/2026-08-17_prompt_maestro_meta_ai_semana.md", "# Semana 34\nPieza 1 …\n"],
  );
  const r = sinCapaMaquetacion(completo);

  it("las guías de marca pasan byte a byte", () => {
    expect(r).toContain(`\n--- Baby Caleb/01_ADN_y_Memoria/01_brand_guidelines.md ---\n${GUIDELINES}`);
  });

  it("el prompt semanal ya enviado a Meta AI se quita entero, con su encabezado", () => {
    expect(r).not.toContain("prompt_maestro_meta_ai_semana");
    expect(r).not.toContain("Pieza 1");
  });

  it("el prompt maestro y la receta se reducen pero siguen con su encabezado", () => {
    expect(r).toContain("--- Baby Caleb/01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md ---");
    expect(r).toContain("--- Baby Caleb/01_ADN_y_Memoria/05_receta.json ---");
    expect(r).not.toContain("Las tres plantillas");
    expect(r).not.toContain('"lienzo"');
    expect(r).toContain('"cifrasPermitidas"');
  });

  it("pesa bastante menos", () => {
    expect(r.length).toBeLessThan(completo.length * 0.75);
  });

  it("un ADN sin nada que quitar vuelve idéntico, la misma cadena", () => {
    const solo = adn(["Cliente/01_ADN_y_Memoria/01_brand_guidelines.md", GUIDELINES], ["Cliente/01_ADN_y_Memoria/02_buyer_personas.md", "# Personas\n"]);
    expect(sinCapaMaquetacion(solo)).toBe(solo);
  });

  it("un texto sin encabezados de archivo pasa entero", () => {
    const suelto = "Manual de marca\n\n--- fin ---\nmás texto\n";
    expect(sinCapaMaquetacion(suelto)).toBe(suelto);
  });

  it("vacío o nulo no rompe", () => {
    expect(sinCapaMaquetacion("")).toBe("");
    expect(sinCapaMaquetacion(undefined)).toBe("");
  });

  it("el archivo marcado «(recortado)» conserva su marca", () => {
    const c = adn(["C/01_ADN_y_Memoria/05_receta.json (recortado)", '{"marca":"X","lienzo":1}']);
    // el encabezado con «(recortado)» se escribe así en el ADN
    const t = "\n--- C/01_ADN_y_Memoria/05_receta.json (recortado) ---\n" + '{"marca":"X","lienzo":1}' + "\n";
    expect(sinCapaMaquetacion(t)).toContain("05_receta.json (recortado) ---");
    expect(sinCapaMaquetacion(t)).not.toContain("lienzo");
    expect(c).toBeTruthy();
  });
});

// El ADN real: lo que se ahorra en cada cliente y, sobre todo, lo que NO se
// pierde. Sin el checkout de Agencia_Workspace, se saltan.
describe.skipIf(!hayWorkspace)("con el ADN real de Agencia_Workspace", () => {
  const leer = (cliente) => {
    const base = `${RAIZ}/${cliente}/01_ADN_y_Memoria`;
    const archivos = readdirSync(base).filter((n) => /\.(md|json)$/.test(n)).sort();
    const extra = [];
    try {
      const ig = `${RAIZ}/${cliente}/03_Redes_Sociales/Instagram_TikTok`;
      for (const n of readdirSync(ig)) if (/\.md$/.test(n)) extra.push([`${cliente}/03_Redes_Sociales/Instagram_TikTok/${n}`, readFileSync(`${ig}/${n}`, "utf8")]);
    } catch { /* el cliente no tiene esa carpeta */ }
    return adn(...archivos.map((n) => [`${cliente}/01_ADN_y_Memoria/${n}`, readFileSync(`${base}/${n}`, "utf8")]), ...extra);
  };

  it("Dcasa: baja de un tercio del contexto o más", () => {
    const completo = leer("Dcasa");
    const r = sinCapaMaquetacion(completo);
    expect(r.length).toBeLessThan(completo.length * 0.72);
  });

  it.each(["Dcasa", "Baby Caleb", "Feria del lente", "Juancito Ads"])("%s: no pierde la marca", (cliente) => {
    const completo = leer(cliente);
    const r = sinCapaMaquetacion(completo);
    // Las guías, las personas y los master prompts pasan idénticos.
    for (const n of ["01_brand_guidelines.md", "02_buyer_personas.md", "04_master_prompts.md", "03_diccionario_seo.json"]) {
      const bloque = `\n--- ${cliente}/01_ADN_y_Memoria/${n} ---\n${readFileSync(`${RAIZ}/${cliente}/01_ADN_y_Memoria/${n}`, "utf8")}\n`;
      expect(r).toContain(bloque);
    }
    // Y de la receta siguen las cifras y las reglas duras, tal cual.
    const receta = JSON.parse(readFileSync(`${RAIZ}/${cliente}/01_ADN_y_Memoria/05_receta.json`, "utf8"));
    const ruta = `--- ${cliente}/01_ADN_y_Memoria/05_receta.json ---\n`;
    const cuerpo = r.slice(r.indexOf(ruta) + ruta.length).split("\n--- ")[0];
    const reducida = JSON.parse(cuerpo);
    expect(reducida.cifrasPermitidas).toEqual(receta.cifrasPermitidas);
    expect(reducida.reglasDuras).toEqual(receta.reglasDuras);
    expect(reducida).not.toHaveProperty("lienzo");
    // Del prompt maestro se queda «las reglas duras», que cuestan clientes.
    expect(r).toMatch(/## \d+ · Las reglas duras/);
  });
});

describe("contextoEnBloques", () => {
  const ADN = "x".repeat(MIN_CARACTERES_CACHE + 500);
  const contexto = (extra = "") =>
    `Escribes para X.\n\nADN DE X\n${ADN}\n\n═══════════════════════════════════════════════════════════\n${TITULO_FICHA}\n═══════════════════════════════════════════════════════════\nINDUSTRIA: N/A${extra}`;

  it("parte en el ADN, que se cachea, y la ficha, que no", () => {
    const b = contextoEnBloques(contexto());
    expect(b).toHaveLength(2);
    expect(b[0]).toEqual({ type: "text", text: expect.stringContaining(ADN), cache_control: { type: "ephemeral" } });
    expect(b[1]).not.toHaveProperty("cache_control");
    expect(b[1].text).toContain(TITULO_FICHA);
  });

  it("no pierde ni añade un carácter", () => {
    const t = contexto("\nCAMPAÑA: octubre");
    const b = contextoEnBloques(t);
    expect(b.map((x) => x.text).join("")).toBe(t);
  });

  it("dos llamadas del mismo cliente comparten el bloque cacheado byte a byte", () => {
    const a = contextoEnBloques(contexto("\nCAMPAÑA: octubre"));
    const b = contextoEnBloques(contexto("\nCAMPAÑA: noviembre\nOFERTAS: 2x1"));
    expect(a[0].text).toBe(b[0].text);
  });

  it("por debajo del mínimo que Anthropic cachea, no parte", () => {
    const corto = `Escribes para X.\nADN DE X\nbreve\n\n═══════════════════════════════════════════════════════════\n${TITULO_FICHA}\n═══`;
    expect(contextoEnBloques(corto)).toBeNull();
  });

  it("sin el título de la ficha, no parte", () => {
    expect(contextoEnBloques(`${ADN}\nnada más`)).toBeNull();
  });
});

describe("prepararContenidoIA", () => {
  const ADN = "y".repeat(MIN_CARACTERES_CACHE + 10);
  const ctx = `Escribes.\n${ADN}\n\n═══════════════════════════════════════════════════════════\n${TITULO_FICHA}\n═══════════════════════════════════════════════════════════\nHASHTAGS: #x\n\nPIDE ALGO`;

  it("una cadena con contexto pasa a dos bloques", () => {
    const r = prepararContenidoIA(ctx);
    expect(Array.isArray(r)).toBe(true);
    expect(r[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("una cadena sin contexto pasa igual", () => {
    expect(prepararContenidoIA("Dame 5 fechas")).toBe("Dame 5 fechas");
  });

  it("con imágenes DETRÁS, el ADN sigue primero y las imágenes se conservan", () => {
    const img = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AA" } };
    const r = prepararContenidoIA([{ type: "text", text: ctx }, img]);
    expect(r).toHaveLength(3);
    expect(r[0].cache_control).toBeDefined();
    expect(r[2]).toBe(img);
  });

  it("con una imagen DELANTE no se toca: la caché es por prefijo y esa imagen cambia en cada llamada", () => {
    const entrada = [{ type: "image", source: {} }, { type: "text", text: ctx }];
    expect(prepararContenidoIA(entrada)).toBe(entrada);
  });

  it("lo que no reconoce pasa entero", () => {
    expect(prepararContenidoIA(undefined)).toBeUndefined();
    const raro = [{ type: "document" }];
    expect(prepararContenidoIA(raro)).toBe(raro);
  });
});

describe("buildClientContext", () => {
  const cliente = { name: "Baby Caleb", industry: "Bebés", whatsapp: "+507 6000-0000", githubRepo: "https://github.com/x/y" };
  const adnGrande = adn(
    ["Baby Caleb/01_ADN_y_Memoria/01_brand_guidelines.md", GUIDELINES + "z".repeat(MIN_CARACTERES_CACHE)],
    ["Baby Caleb/01_ADN_y_Memoria/05_prompt_maestro_meta_ai.md", PROMPT_MAESTRO],
  );

  it("el ADN va antes que la ficha, y la ficha tiene el título con el que se parte la caché", () => {
    const t = buildClientContext(cliente, { campaign: "Octubre" }, adnGrande);
    expect(t.indexOf("Tono cercano")).toBeLessThan(t.indexOf(TITULO_FICHA));
    expect(t.indexOf(TITULO_FICHA)).toBeLessThan(t.indexOf("CAMPAÑA DEL MES: Octubre"));
  });

  it("se parte donde debe: el ADN cacheado, la campaña no", () => {
    const b = contextoEnBloques(buildClientContext(cliente, { campaign: "Octubre" }, adnGrande));
    expect(b).not.toBeNull();
    expect(b[0].text).toContain("Tono cercano");
    expect(b[0].text).not.toContain("Octubre");
    expect(b[1].text).toContain("CAMPAÑA DEL MES: Octubre");
  });

  it("escribir texto no manda la maquetación", () => {
    const t = buildClientContext(cliente, {}, adnGrande);
    expect(t).not.toContain("Las tres plantillas");
    expect(t).toContain("Las reglas duras");
  });

  it("con ADN no dice que no lo hay", () => {
    expect(buildClientContext(cliente, {}, adnGrande)).not.toContain("no tiene ADN conectado");
  });

  it("un cliente con ADN conectado al que esta consulta no se lo manda, no dice que no lo tiene", () => {
    const t = buildClientContext({ ...cliente, githubContext: adnGrande }, {});
    expect(t).not.toContain("no tiene ADN conectado");
    expect(t).toContain("no viaja el ADN completo");
  });

  it("un cliente sin repositorio sí lo dice", () => {
    const t = buildClientContext({ name: "Nuevo", industry: "x" }, {});
    expect(t).toContain("no tiene ADN conectado");
  });
});
