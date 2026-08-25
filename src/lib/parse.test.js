import { describe, it, expect } from "vitest";
import {
  parseAIResponse,
  parseBloques,
  parseGitHubUrl,
  parseJSONLoose,
  parsePiezas,
} from "./parse";

// ============================================================
// Cada bloque de aquí abajo reproduce un fallo que llegó a producción.
// Si alguno vuelve a romperse, salta en `npm test` y no en una captura
// de pantalla del cliente.
// ============================================================

describe("parsePiezas", () => {
  // El fallo: «Expected ',' or '}' after property value in JSON at position
  // 8445». Las piezas viajaban dentro de un array JSON, y la prosa española
  // lleva comillas rectas y saltos de línea que rompen el escapado. Con doce
  // piezas, que no ocurra ninguna vez es improbable.
  const respuesta = `<<<PIEZA:1>>>
PLANTILLA: B
FORMATO: post
FECHA: 2026-12-02
ANTETITULO: MES DE DÉCIMO
TITULAR:
EL ⟦DÉCIMO⟧ SE VA
EN COSAS QUE
NO RECUERDAS.
NOTA: Aplica sólo en tienda.
FOTO_REAL: si
PROMPT_FONDO:
Card de color hueso liso, sin textura. Del 0 % al 78 % de la altura no hay
más que color plano — sin brillo, sin sombra y sin detalle.
Sin objetos y sin muebles.
DESCRIPCION:
Llega el décimo y con él la frase de siempre: "este año sí lo aprovecho".
Te decimos en qué se va — y en qué sí vale la pena.

#Dcasa #Décimo #Panamá
HASHTAGS: #Dcasa #Décimo #Panamá

<<<PIEZA:2>>>
PLANTILLA: C
FORMATO: reel
TITULAR:
⟦ORDEN⟧ QUE
SÍ DURA.
GUION:
Hook (0-3s): "¿Cuántas veces ordenaste este clóset?"
Desarrollo: el problema no es el orden — es el reparto.
CTA: Escríbenos.
PROMPT_FONDO:
Masa plana de azul, sin degradado.
DESCRIPCION:
El orden que "sí dura" no existe si el espacio está mal repartido.
HASHTAGS: #Dcasa #Orden`;

  const piezas = parsePiezas(respuesta);

  it("lee todas las piezas del lote", () => {
    expect(piezas).toHaveLength(2);
    expect(piezas.map((p) => p.n)).toEqual([1, 2]);
  });

  it("conserva los cortes de línea del titular y el acento ⟦ ⟧", () => {
    // Los cortes los decide quien escribe, no el navegador: si el parser los
    // aplana, Meta AI recalcula el titular y la pieza sale con otra forma.
    expect(piezas[0].titular).toEqual([
      "EL ⟦DÉCIMO⟧ SE VA",
      "EN COSAS QUE",
      "NO RECUERDAS.",
    ]);
    expect(piezas[1].titular).toEqual(["⟦ORDEN⟧ QUE", "SÍ DURA."]);
  });

  it("no parte los campos multilínea en la primera línea", () => {
    // El `$` con bandera `m` casa al final de CADA línea: con él, el prompt
    // del fondo llegaba con una sola y el titular vacío.
    expect(piezas[0].promptFondo.split("\n")).toHaveLength(3);
    expect(piezas[1].guion.split("\n")).toHaveLength(3);
  });

  it("conserva las comillas rectas de la prosa", () => {
    expect(piezas[0].descripcion).toContain('"este año sí lo aprovecho"');
    expect(piezas[1].guion).toContain('"¿Cuántas veces ordenaste este clóset?"');
  });

  it("conserva las tildes y los guiones largos", () => {
    expect(piezas[0].antetitulo).toBe("MES DE DÉCIMO");
    expect(piezas[0].promptFondo).toContain("—");
    expect(piezas[0].descripcion).toContain("décimo");
  });

  it("lee FOTO_REAL como booleano y lo omite cuando no está", () => {
    expect(piezas[0].fotoReal).toBe(true);
    expect(piezas[1].fotoReal).toBe(false);
  });

  it("deja vacíos los campos que la pieza no trae", () => {
    expect(piezas[0].guion).toBe("");
    expect(piezas[1].antetitulo).toBe("");
    expect(piezas[1].nota).toBe("");
  });

  it("devuelve una lista vacía si no hay ninguna ficha", () => {
    expect(parsePiezas("Lo siento, no puedo ayudarte con eso.")).toEqual([]);
  });
});

describe("parseBloques", () => {
  const ETIQUETAS = ["UNO", "DOS", "TRES"];

  it("lee un campo multilínea que está al final del texto", () => {
    // Éste es el caso exacto del `$` multilínea: sin fin-de-entrada de
    // verdad, el último campo se cortaba en su primer salto.
    const t = "UNO: a\nDOS: b\nTRES:\nprimera\nsegunda\ntercera";
    expect(parseBloques(t, ETIQUETAS).TRES).toBe("primera\nsegunda\ntercera");
  });

  it("corta un campo justo donde empieza la siguiente etiqueta", () => {
    const t = "UNO:\nlínea uno\nlínea dos\nDOS: b";
    expect(parseBloques(t, ETIQUETAS).UNO).toBe("línea uno\nlínea dos");
  });

  it("no confunde una etiqueta con otra que la contiene", () => {
    const t = "DESCRIPCION: corta\nDESCRIPCION_CONJUNTO: larga";
    const c = parseBloques(t, ["DESCRIPCION", "DESCRIPCION_CONJUNTO"]);
    expect(c.DESCRIPCION).toBe("corta");
    expect(c.DESCRIPCION_CONJUNTO).toBe("larga");
  });

  it("omite las etiquetas que no aparecen", () => {
    expect(parseBloques("UNO: a", ETIQUETAS)).toEqual({ UNO: "a" });
  });

  it("no trata como etiqueta algo que no está a principio de línea", () => {
    const t = "UNO: mira DOS: esto es parte del texto";
    expect(parseBloques(t, ETIQUETAS).UNO).toBe("mira DOS: esto es parte del texto");
  });
});

describe("parseJSONLoose", () => {
  it("lee JSON bien formado sin tocarlo", () => {
    expect(parseJSONLoose('{"a":1,"b":"dos"}')).toEqual({ a: 1, b: "dos" });
  });

  it("repara una comilla sin escapar dentro de una cadena", () => {
    // Lo que devolvió el modelo en producción. `JSON.parse` lanza aquí.
    const roto = '{"cta":"El titular "corto" va arriba","n":1}';
    expect(() => JSON.parse(roto)).toThrow();
    expect(parseJSONLoose(roto)).toEqual({ cta: 'El titular "corto" va arriba', n: 1 });
  });

  it("repara un salto de línea crudo dentro de una cadena", () => {
    const roto = '{"estilo":"primera\nsegunda"}';
    expect(() => JSON.parse(roto)).toThrow();
    expect(parseJSONLoose(roto).estilo).toBe("primera\nsegunda");
  });

  it("quita las comas colgantes", () => {
    expect(parseJSONLoose('{"a":[1,2,],}')).toEqual({ a: [1, 2] });
  });

  it("ignora las vallas de bloque de código y el texto de alrededor", () => {
    const raw = 'Aquí tienes:\n```json\n{"a":1}\n```\nEso es todo.';
    expect(parseJSONLoose(raw)).toEqual({ a: 1 });
  });

  it("lee arrays cuando se le piden", () => {
    expect(parseJSONLoose("[1,2,3]", "[", "]")).toEqual([1, 2, 3]);
  });

  it("no confunde una URL con el cierre de la cadena", () => {
    // Las URL llevan `:` y `/`, que es justo lo que mira el reparador.
    const url = "https://fonts.googleapis.com/css2?family=Anton&display=swap";
    expect(parseJSONLoose(`{"url":"${url}"}`).url).toBe(url);
  });

  it("avisa cuando no hay JSON en absoluto", () => {
    expect(() => parseJSONLoose("no hay nada aquí")).toThrow(/no contenía JSON/i);
  });
});

describe("parseGitHubUrl", () => {
  it("lee dueño y repositorio de una URL simple", () => {
    expect(parseGitHubUrl("https://github.com/abrinay1997-stack/Agencia_Workspace"))
      .toEqual({ owner: "abrinay1997-stack", repo: "Agencia_Workspace", folder: "" });
  });

  it("lee la carpeta de una URL con /tree/", () => {
    const u = "https://github.com/abrinay1997-stack/Agencia_Workspace/tree/main/Dcasa/01_ADN_y_Memoria";
    expect(parseGitHubUrl(u)).toEqual({
      owner: "abrinay1997-stack",
      repo: "Agencia_Workspace",
      folder: "Dcasa/01_ADN_y_Memoria",
    });
  });

  it("quita el sufijo .git", () => {
    expect(parseGitHubUrl("https://github.com/uno/dos.git").repo).toBe("dos");
  });

  it("devuelve null si no es una URL de GitHub", () => {
    expect(parseGitHubUrl("https://gitlab.com/uno/dos")).toBeNull();
    expect(parseGitHubUrl("")).toBeNull();
  });
});

describe("parseAIResponse", () => {
  it("lee guion y descripción de cada publicación", () => {
    const raw = `<<<PUBLICACION_ID:abc123>>>
GUION:
Hook: algo
CTA: escríbenos
DESCRIPCION:
Un caption con #hashtags

<<<PUBLICACION_ID:def456>>>
DESCRIPCION:
Sólo descripción`;
    const r = parseAIResponse(raw);
    expect(Object.keys(r)).toEqual(["abc123", "def456"]);
    expect(r.abc123.guion).toBe("Hook: algo\nCTA: escríbenos");
    expect(r.def456.descripcion).toBe("Sólo descripción");
    expect(r.def456.guion).toBe("");
  });
});

// ============================================================
// El prompt que recibe el modelo redactor.
//
// No se prueba llamando a la IA: se prueba que las instrucciones que
// gobiernan su trabajo estén ahí. Las dos de abajo se perdieron una vez
// cada una en un refactor y nadie se enteró hasta ver la pieza.
// ============================================================

describe("las instrucciones al redactor", () => {
  it("le prohíbe decidir la maquetación", async () => {
    // Si el modelo elige el cuerpo o el anclaje, dos piezas del mismo mes
    // salen compuestas distinto. Esas cuentas las hace `componer.js`.
    const { default: src } = await import("../api.js?raw").catch(() => ({ default: "" }));
    const texto = src || (await import("node:fs")).readFileSync("src/api.js", "utf8");
    expect(texto).toContain("NO decidas el cuerpo del titular, ni el anclaje, ni la interlínea");
  });

  it("le manda mirar lo ya publicado", async () => {
    // El estándar de la agencia obliga a revisar Calendarios_Aprobados para
    // no repetir. Se leía del repositorio y nadie le decía que lo usara.
    const texto = (await import("node:fs")).readFileSync("src/api.js", "utf8");
    expect(texto).toContain("Calendarios_Aprobados");
    expect(texto).toMatch(/no vuelve, ni con otras palabras/);
  });
});
