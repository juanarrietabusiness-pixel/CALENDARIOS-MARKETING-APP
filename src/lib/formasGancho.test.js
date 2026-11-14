import { describe, it, expect } from "vitest";
import {
  FORMAS_GANCHO, GANCHOS_VISUALES, VOCES_GANCHO, TIPOS_GANCHO, DONDE_GANCHO, formaDe, dondeDeFormato, formasPosibles, formaPara,
  formasParaGanchos, lineaDeForma, lineaDeGanchosUgc, ganchoVisualPara, lineaDeGanchoVisual, semillaDeTexto, cuentaDeFormas,
  formasDeCalendarios, limpiarFormasRecientes, piezasConForma, piezasConRinde, aprenderFormas, cifrasDelGancho, numerosDe,
  fraseDeMiedo, ganchosDePost, problemasDelGancho, REGLA_GANCHO, MIN_PIEZAS_FORMA,
} from "./formasGancho.js";
import { CLAVES_NIVEL } from "./consciencia.js";

describe("la biblioteca de formas de gancho", () => {
  it("de 18 a 22 formas, con ids únicos y todos sus campos dentro de lo que existe", () => {
    expect(FORMAS_GANCHO.length).toBeGreaterThanOrEqual(18);
    expect(FORMAS_GANCHO.length).toBeLessThanOrEqual(22);
    expect(new Set(FORMAS_GANCHO.map((f) => f.id)).size).toBe(FORMAS_GANCHO.length);
    for (const f of FORMAS_GANCHO) {
      expect(f.nombre, f.id).toBeTruthy();
      expect(f.como.length, f.id).toBeGreaterThan(30);
      expect(f.ejemplo, f.id).toBeTruthy();
      expect(f.niveles.length, f.id).toBeGreaterThan(0);
      for (const n of f.niveles) expect(CLAVES_NIVEL, f.id).toContain(n);
      for (const v of f.voces) expect(VOCES_GANCHO, f.id).toContain(v);
      expect(TIPOS_GANCHO, f.id).toContain(f.tipo);
      for (const d of f.donde) expect(DONDE_GANCHO, f.id).toContain(d);
      expect(typeof f.pauta).toBe("boolean");
      expect(typeof f.requiereDato).toBe("boolean");
    }
  });

  it("los niveles de la app (en su copia de consciencia.js) son los cinco", () => {
    // formasGancho.js no importa consciencia.js (para quedar pequeño): si un nivel cambia de clave, esto avisa.
    const usados = new Set(FORMAS_GANCHO.flatMap((f) => f.niveles));
    for (const n of CLAVES_NIVEL) expect(usados.has(n), n).toBe(true);
  });

  it("cada nivel × cada sitio del gancho tiene al menos dos formas, también en pauta y sin datos", () => {
    for (const nivel of CLAVES_NIVEL) {
      for (const formato of ["post", "carrusel", "reel"]) {
        const lista = formasPosibles({ nivel, formato, pauta: true, hayDatos: false });
        expect(lista.length, `${nivel} ${formato}`).toBeGreaterThanOrEqual(2);
        expect(lista.every((f) => f.pauta && !f.requiereDato), `${nivel} ${formato}`).toBe(true);
      }
    }
  });

  it("ningún ejemplo de la biblioteca lleva una cifra o un tono de miedo (los mismos que la revisión marca)", () => {
    for (const f of FORMAS_GANCHO) {
      expect(fraseDeMiedo(`${f.como} ${f.ejemplo}`), f.id).toBe("");
      expect(cifrasDelGancho(f.ejemplo), f.id).toEqual([]);
    }
  });
});

describe("qué forma lleva cada pieza", () => {
  it("dónde vive el gancho: el primer segundo en un reel, la portada en un carrusel, el titular en lo demás", () => {
    expect(dondeDeFormato("reel")).toBe("video");
    expect(dondeDeFormato("carrusel")).toBe("portada");
    expect(dondeDeFormato("post")).toBe("caption");
    expect(dondeDeFormato("historia")).toBe("caption");
    expect(lineaDeForma("lista", "reel")).toMatch(/primer segundo del video/);
    expect(lineaDeForma("lista", "carrusel")).toMatch(/portada del carrusel/);
    expect(lineaDeForma("lista", "historia")).toMatch(/texto de la pieza/);
    expect(lineaDeForma("lista", "reel", { rostro: true })).toMatch(/primer tramo de lo que se dice/);
    expect(lineaDeForma("no-existe")).toBe("");
  });

  it("«Desliza para ver» sólo en la portada de un carrusel", () => {
    expect(formasPosibles({ formato: "carrusel" }).some((f) => f.id === "desliza")).toBe(true);
    expect(formasPosibles({ formato: "post" }).some((f) => f.id === "desliza")).toBe(false);
    expect(formasPosibles({ formato: "reel" }).some((f) => f.id === "desliza")).toBe(false);
  });

  it("en pauta nunca una forma que dice algo de quien lee o que pide comentarios", () => {
    const enPauta = formasPosibles({ nivel: "problema", pauta: true });
    expect(enPauta.some((f) => f.id === "si-te-pasa")).toBe(false);
    expect(enPauta.some((f) => f.id === "participa")).toBe(false);
    expect(formasPosibles({ nivel: "problema" }).some((f) => f.id === "si-te-pasa")).toBe(true);
  });

  it("las que piden un dato real, sólo con datos", () => {
    expect(formasPosibles({ nivel: "producto", hayDatos: false }).some((f) => f.requiereDato)).toBe(false);
    expect(formasPosibles({ nivel: "producto", hayDatos: true }).some((f) => f.id === "cifra-real")).toBe(true);
  });

  it("encaja con su nivel, no repite la de la vecina y se va a la menos usada", () => {
    const f = formaPara({ nivel: "inconsciente" }, { formato: "post" });
    expect(formaDe(f).niveles).toContain("inconsciente");
    const cuenta = new Map([[f, 5]]);
    const otra = formaPara({ nivel: "inconsciente" }, { formato: "post", cuenta, previa: f });
    expect(otra).not.toBe(f);
    expect(cuenta.get(otra) ?? 0).toBe(0);
  });

  it("lo que no rinde no sale si queda otra, y una de cada dos piezas va con una que rinde", () => {
    const posibles = formasPosibles({ nivel: "problema", formato: "post" }).map((x) => x.id);
    const malas = posibles.slice(0, posibles.length - 2);
    const buena = posibles[posibles.length - 1];
    for (let i = 0; i < 6; i++) {
      const f = formaPara({ nivel: "problema" }, { formato: "post", aprendidas: { buenas: [buena], malas }, indice: i });
      expect(malas, `pieza ${i}`).not.toContain(f);
      if (i % 2 === 1) expect(f).toBe(buena);
    }
  });

  it("los 3 ganchos de una UGC: tres formas distintas, la primera la de la pieza", () => {
    const ids = formasParaGanchos({ nivel: "problema", formaGancho: "historia" });
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("historia");
    expect(lineaDeGanchosUgc(ids)).toMatch(/uno con CADA forma/);
    // En pauta, sin las que no van en un anuncio.
    expect(formasParaGanchos({ nivel: "problema", pauta: { etapa: "presentacion" } }).every((id) => formaDe(id).pauta)).toBe(true);
  });

  it("la regla del gancho para el pedido nombra la forma, las cifras y el miedo", () => {
    expect(REGLA_GANCHO).toMatch(/CON la forma/);
    expect(REGLA_GANCHO).toMatch(/cifras/);
    expect(REGLA_GANCHO).toMatch(/miedo/);
  });
});

describe("los ganchos visuales del primer segundo", () => {
  it("en un reel con IA no sale «responder un comentario» (va limpio) y sin producto, nada que lo necesite", () => {
    const vistos = new Set(Array.from({ length: 20 }, (_, s) => ganchoVisualPara({ semilla: s, conProducto: false, ia: true })));
    expect(vistos.has("comentario")).toBe(false);
    expect([...vistos].every((id) => !GANCHOS_VISUALES.find((g) => g.id === id).conProducto)).toBe(true);
    const conProducto = new Set(Array.from({ length: 20 }, (_, s) => ganchoVisualPara({ semilla: s, conProducto: true })));
    expect(conProducto.has("en-uso")).toBe(true);
  });

  it("la misma idea, la misma sugerencia", () => {
    expect(semillaDeTexto("un sofá cama")).toBe(semillaDeTexto("un sofá cama"));
    const a = ganchoVisualPara({ semilla: semillaDeTexto("x") });
    expect(lineaDeGanchoVisual(a)).toMatch(/^«.+»: /);
    expect(lineaDeGanchoVisual("no-existe")).toBe("");
  });
});

describe("lo que ya usó el cliente y lo que se aprende", () => {
  const calendarios = [
    { id: "k1", days: [
      { date: "2030-02-01", posts: [{ id: "a", formaGancho: "lista" }, { id: "b", formaGancho: "no-existe" }, { id: "c" }] },
      { date: "2030-02-20", posts: [{ id: "d", formaGancho: "mito" }] },
    ] },
    { id: "k2", days: [{ date: "2030-03-02", posts: [{ id: "e", formaGancho: "historia" }] }] },
  ];

  it("las formas de sus calendarios, de la más vieja a la más nueva, sólo las que existen", () => {
    expect(formasDeCalendarios(calendarios)).toEqual(["lista", "mito", "historia"]);
    expect(limpiarFormasRecientes(["lista", "inventada", 3])).toEqual(["lista"]);
    expect(cuentaDeFormas(["lista", "lista", "mito"]).get("lista")).toBe(2);
  });

  it("las piezas con forma ya maduras y su «rinde» por la cola PUBLICADA (el post, no su historia)", () => {
    const piezas = piezasConForma(calendarios, { hasta: "2030-02-28" });
    expect(piezas).toEqual([{ calendarId: "k1", postId: "a", forma: "lista" }, { calendarId: "k1", postId: "d", forma: "mito" }]);
    const cola = [
      { calendar_id: "k1", post_id: "a", red: "instagram", estado: "publicada", variante: "post", externo_id: "1" },
      { calendar_id: "k1", post_id: "a", red: "facebook", estado: "publicada", variante: "post", externo_id: "2" },
      { calendar_id: "k1", post_id: "d", red: "instagram", estado: "publicada", variante: "historia", externo_id: "3" },
      { calendar_id: "k1", post_id: "d", red: "instagram", estado: "error", variante: "post", externo_id: "4" },
    ];
    const rindes = new Map([["instagram:1", 1.4], ["facebook:2", 2.1], ["instagram:3", 9], ["instagram:4", 9]]);
    expect(piezasConRinde(piezas, { cola, rindes })).toEqual([{ forma: "lista", rinde: 2.1 }]);
  });

  it("sin muestra no se aprende nada; con ella, lo que rinde y lo que no", () => {
    expect(aprenderFormas([{ forma: "lista", rinde: 3 }, { forma: "mito", rinde: 0.2 }])).toMatchObject({ buenas: [], malas: [] });
    const n = MIN_PIEZAS_FORMA;
    const piezas = [
      ...Array.from({ length: n }, () => ({ forma: "lista", rinde: 1.6 })),
      ...Array.from({ length: n }, () => ({ forma: "mito", rinde: 0.5 })),
      ...Array.from({ length: n }, () => ({ forma: "historia", rinde: 1 })),
      { forma: "y-si", rinde: 9 },
    ];
    const r = aprenderFormas(piezas);
    expect(r.buenas).toEqual(["lista"]);
    expect(r.malas).toEqual(["mito"]);
    // Una forma con UNA pieza que rindió mucho no cuenta todavía.
    expect(r.buenas).not.toContain("y-si");
  });
});

describe("las reglas del gancho", () => {
  it("las cifras que dicen algo, no el número de una lista ni un año ni un teléfono", () => {
    expect(cifrasDelGancho("3 errores al comprar un sofá")).toEqual([]);
    expect(cifrasDelGancho("Lo nuevo de 2026")).toEqual([]);
    expect(cifrasDelGancho("Escríbenos al 6000-0000")).toEqual([]);
    expect(cifrasDelGancho("El 90 % de la gente lo hace mal").map((c) => c.norma)).toEqual(["90%"]);
    expect(cifrasDelGancho("Ahorra 100 % de tu tiempo").map((c) => c.norma)).toEqual(["100%"]);
    expect(cifrasDelGancho("Desde $45").map((c) => c.norma)).toEqual(["45"]);
    expect(cifrasDelGancho("Rinde 3x más").map((c) => c.norma)).toEqual(["3x"]);
    expect(cifrasDelGancho("Más de 500 clientes felices").map((c) => c.norma)).toEqual(["500"]);
    expect(cifrasDelGancho("10 años cuidando tu casa").map((c) => c.norma)).toEqual(["10"]);
    expect(cifrasDelGancho("10.000 familias").map((c) => c.norma)).toEqual(["10000"]);
  });

  it("los números escritos se normalizan igual", () => {
    expect([...numerosDe("Precio: $1,200.00 · 10.000 piezas · garantía de 10 años")]).toEqual(expect.arrayContaining(["1200", "10000", "10"]));
  });

  it("miedo y sensacionalismo, con una lista estrecha que no casa con el uso normal", () => {
    expect(fraseDeMiedo("Este error podría matarte")).toMatch(/podría matarte/);
    expect(fraseDeMiedo("Esto debería ser ilegal")).toBeTruthy();
    expect(fraseDeMiedo("Te están mintiendo sobre el colchón")).toBeTruthy();
    expect(fraseDeMiedo("El marketing está muerto")).toBeTruthy();
    expect(fraseDeMiedo("Peligro mortal en tu cocina")).toBeTruthy();
    for (const normal of [
      "Te va a encantar", "Esto podría matar tu antojo de dulce", "La planta está muerta? Revívela", "¿Tu planta está muerta?",
      "Un error común al lavar", "Ilegalmente cómodo", "Lo que nadie te cuenta del sofá", "Mata el aburrimiento",
    ]) expect(fraseDeMiedo(normal), normal).toBe("");
  });

  it("el gancho de una publicación: el titular, la primera línea del caption, la del guion y los de una UGC", () => {
    expect(ganchosDePost({
      textoPieza: "Titular\nApoyo", descripcion: "Primera línea.\nLo demás", guion: "[0–3 s] VOZ: «Hola» | SE VE: x\n[3–6 s] …",
      ganchosUgc: ["Otro gancho"],
    })).toEqual(["Titular", "Primera línea.", "«Hola»", "Otro gancho"]);
    expect(ganchosDePost({ guion: "Portada: 5 mitos\nSlide 1: …" })).toEqual(["5 mitos"]);
  });

  it("cifra inventada frente a lo escrito (catálogo, estudio, idea) y lo que ya dijo la regla del precio", () => {
    const post = { textoPieza: "El 90 % lo hace mal", descripcion: "Más de 500 clientes. Desde $45", idea: "un 90 % de las casas" };
    const p = problemasDelGancho(post, { permitidos: new Set(["45"]) });
    expect(p.find((x) => x.codigo === "cifra-gancho").texto).toMatch(/«500 clientes»/);
    expect(p.find((x) => x.codigo === "cifra-gancho").texto).not.toMatch(/90/);
    expect(problemasDelGancho({ textoPieza: "Desde $99" }, { excluir: new Set(["99"]) })).toEqual([]);
    expect(problemasDelGancho({ textoPieza: "Esto podría matarte" }).map((x) => x.codigo)).toEqual(["miedo"]);
    expect(problemasDelGancho({})).toEqual([]);
  });
});
