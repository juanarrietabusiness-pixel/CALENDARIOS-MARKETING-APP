import { describe, it, expect } from "vitest";
import {
  darForma, celdasPorNiveles, pedidoDeProduccion, leerProduccion, publicacionDePieza, lineaDePieza, anguloPara, bloqueDeLenguaje,
} from "./loteAnuncios.js";
import { casillaDeCampos, pedidoDeCampos, leerCampos, aplicarCampos } from "./camposTexto.js";
import { rellenarConIdea, reemplazarConIdea } from "./ideaPublicacion.js";
import { publicacionDelPlan } from "./planMes.js";
import { planDeIdeas } from "./ideasEstudio.js";
import { revisarMes, problemasDeGancho, numerosPermitidos } from "./revisionMes.js";
import { formaDe } from "./formasGancho.js";
import { pedidoDeReel } from "./reel.js";

// ============================================================
// La forma del gancho y el ángulo en el MOTOR de ideas (lib/loteAnuncios.js, lib/camposTexto.js) y lo que viaja a la
// publicación; las reglas del gancho en «Revisar el mes». Lo de antes (casillas y publicaciones sin forma ni ángulo)
// sigue valiendo.
// ============================================================

const productos = [{ id: "sofa", nombre: "Sofá cama" }];
const angulos = {
  sofa: [
    { id: "visitas", nombre: "Las visitas", publico: "frio", linea: "«Las visitas» — problema (lo que se ve): no hay dónde duerman" },
    { id: "espacio", nombre: "El espacio", publico: "tibio", linea: "«El espacio» — lo que lo distingue: se abre en un gesto" },
    { id: "precio", nombre: "El precio", linea: "«El precio» — objeción: parece caro" },
  ],
};

describe("darForma: la forma del gancho y el ángulo", () => {
  it("cada pieza lleva una forma que encaja con su nivel, y dos vecinas nunca la comparten", () => {
    const plan = darForma(celdasPorNiveles({ inconsciente: 3, problema: 3, decision: 3 }), { semilla: 4 });
    for (const r of plan) expect(formaDe(r.formaGancho).niveles, r.n).toContain(r.nivel);
    for (let i = 1; i < plan.length; i++) expect(plan[i].formaGancho, `pieza ${i + 1}`).not.toBe(plan[i - 1].formaGancho);
  });

  it("no repite las que el cliente usó hace poco si puede", () => {
    const recientes = ["error-comun", "punto-de-vista", "historia", "confesion", "senales"];
    const plan = darForma([{ tipo: "educativo", nivel: "inconsciente" }], { formas: recientes });
    expect(recientes).not.toContain(plan[0].formaGancho);
  });

  it("la que ya trae una publicación se respeta; lo de pauta, sólo formas que van en un anuncio", () => {
    expect(darForma([{ nivel: "problema", formaGancho: "mito" }])[0].formaGancho).toBe("mito");
    const plan = darForma(Array.from({ length: 6 }, () => ({ nivel: "problema", pauta: { etapa: "presentacion" } })));
    expect(plan.every((r) => formaDe(r.formaGancho).pauta)).toBe(true);
  });

  it("una UGC trae las formas de sus 3 ganchos, distintas", () => {
    const [r] = darForma([{ nivel: "problema", formato: "reel", rostro: true }], { formato: "reel" });
    expect(r.formasGanchos).toHaveLength(3);
    expect(new Set(r.formasGanchos).size).toBe(3);
    expect(r.formasGanchos[0]).toBe(r.formaGancho);
  });

  it("los ángulos del producto: fríos en los niveles fríos, tibios en los demás, sin repetir el de la vecina", () => {
    const plan = darForma(
      [{ nivel: "inconsciente" }, { nivel: "problema" }, { nivel: "producto" }, { nivel: "decision" }].map((c) => ({ ...c, tipo: "anuncio", productoId: "sofa" })),
      { productos, angulos },
    );
    expect(["visitas", "precio"]).toContain(plan[0].angulo);
    expect(["visitas", "precio"]).toContain(plan[1].angulo);
    expect(plan[1].angulo).not.toBe(plan[0].angulo);
    expect(["espacio", "precio"]).toContain(plan[2].angulo);
    expect(plan[3].angulo).not.toBe(plan[2].angulo);
    expect(plan[0].anguloLinea).toMatch(/^«/);
    // Sin ángulos (un estudio de antes), nada.
    expect(darForma([{ nivel: "problema", productoId: "sofa", tipo: "anuncio" }], { productos })[0].angulo).toBeUndefined();
    expect(anguloPara({ productoId: "sofa", angulo: "espacio", nivel: "inconsciente" }, angulos).id).toBe("espacio");
  });

  it("«Dame ideas» del Estudio no cambia: su plan no lleva forma de gancho", () => {
    expect(planDeIdeas({ n: 3 }).every((r) => !("formaGancho" in r))).toBe(true);
  });
});

describe("el pedido del motor", () => {
  const plan = darForma(
    [{ tipo: "anuncio", nivel: "problema", productoId: "sofa" }, { tipo: "humano", nivel: "inconsciente", formato: "reel", rostro: true }],
    { productos, angulos, formato: "post" },
  );

  it("la línea de la pieza dice la forma, dónde va y el ángulo", () => {
    const linea = lineaDePieza(plan[0], { sofa: "Sofá cama" }, "post");
    expect(linea).toMatch(/forma del gancho: «.+» — .+; va en el titular de la pieza y la primera línea del caption/);
    expect(linea).toMatch(/ángulo de venta: «/);
    expect(lineaDePieza(plan[1], {}, "post")).toMatch(/ganchos \(3 alternativos para el primer tramo, uno con CADA forma/);
    // Una casilla de antes (sin forma ni ángulo) sale como siempre.
    expect(lineaDePieza({ n: 1, tipo: "anuncio", nivel: "problema" })).not.toMatch(/forma del gancho|ángulo de venta/);
  });

  it("pide «porque», los ganchos de las UGC, la regla del gancho y el lenguaje del cliente", () => {
    const t = pedidoDeProduccion({ marca: "Dcasa", plan, productos: { sofa: "Sofá cama" }, lenguaje: "«ya no sé dónde poner a mi suegra»" });
    expect(t).toMatch(/"porque": en UNA línea/);
    expect(t).toMatch(/"ganchos" \(SÓLO en las UGC\)/);
    expect(t).toMatch(/"ganchos":\["…","…","…"\]/);
    expect(t).toMatch(/El GANCHO \(el titular/);
    expect(t).toMatch(/EL LENGUAJE DEL CLIENTE[^\n]*no inventes citas[\s\S]*ya no sé dónde poner a mi suegra/);
    expect(pedidoDeProduccion({ marca: "Dcasa", plan })).not.toMatch(/LENGUAJE DEL CLIENTE/);
    expect(bloqueDeLenguaje("")).toBe("");
  });

  it("lee «porque» y los ganchos de una UGC, y la publicación guarda la forma, el ángulo y los ganchos", () => {
    const ideas = leerProduccion(JSON.stringify({ ideas: [
      { n: 1, titular: "¿Dónde duermen?", escena: "Una sala", porque: "Nombra el problema antes que el producto.", ganchos: ["no"] },
      { n: 2, titular: "Mira esto", escena: "Ana en la sala", ganchos: ["«Uno»", "Dos", "Tres", "Cuatro"], guion: "[0–3 s] VOZ: «x»" },
    ] }), plan, "post");
    expect(ideas[0].porque).toBe("Nombra el problema antes que el producto.");
    expect(ideas[0].ganchos).toBeUndefined();
    expect(ideas[1].ganchos).toEqual(["Uno", "Dos", "Tres"]);
    const pub = publicacionDePieza({ id: "p1", idea: ideas[0] });
    expect(pub.formaGancho).toBe(plan[0].formaGancho);
    expect(pub.angulo).toBe(plan[0].angulo);
    expect(pub.porque).toBeUndefined();
    expect(publicacionDePieza({ id: "p2", idea: ideas[1], formato: "reel" }).ganchosUgc).toEqual(["Uno", "Dos", "Tres"]);
    // Una idea de antes, sin forma ni ángulo, no escribe esos campos.
    const vieja = publicacionDePieza({ id: "p3", idea: { titular: "Hola", escena: "x", tipo: "anuncio" } });
    expect("formaGancho" in vieja || "angulo" in vieja).toBe(false);
  });
});

describe("el modo «campos»", () => {
  it("la casilla lleva la forma y el ángulo que ya tiene la publicación", () => {
    const c = casillaDeCampos({ id: "p1", format: "post", formaGancho: "mito", angulo: "visitas" }, { date: "2030-03-04" }, { campos: ["descripcion"] });
    expect(c).toMatchObject({ formaGancho: "mito", angulo: "visitas" });
    expect("formaGancho" in casillaDeCampos({ id: "p2", format: "post" }, {}, { campos: ["descripcion"] })).toBe(false);
  });

  it("el pedido con forma lleva la regla del gancho; sin forma, como siempre", () => {
    const r = { n: 1, clave: "p1", formato: "post", campos: ["descripcion"], escrito: {}, antes: {}, formaGancho: "lista" };
    expect(pedidoDeCampos({ plan: [r] })).toMatch(/El GANCHO \(el titular/);
    expect(pedidoDeCampos({ plan: [{ ...r, formaGancho: undefined }] })).not.toMatch(/El GANCHO \(el titular/);
    expect(pedidoDeCampos({ plan: [r], lenguaje: "«me da pena recibir gente»" })).toMatch(/LENGUAJE DEL CLIENTE[\s\S]*me da pena/);
  });

  it("la respuesta vuelve con la forma y el ángulo sólo si se escribió donde viven, y sólo rellenan", () => {
    const plan = [
      { n: 1, clave: "p1", formato: "post", campos: ["descripcion"], formaGancho: "lista", angulo: "visitas" },
      { n: 2, clave: "p2", formato: "post", campos: ["hashtags"], formaGancho: "mito", angulo: "visitas" },
    ];
    const t = leerCampos(JSON.stringify({ textos: [{ n: 1, descripcion: "Tres cosas. Escríbenos." }, { n: 2, hashtags: "#a" }] }), plan);
    expect(t[0]).toMatchObject({ formaGancho: "lista", angulo: "visitas" });
    expect("formaGancho" in t[1] || "angulo" in t[1]).toBe(false);
    expect(aplicarCampos({ format: "post" }, t[0]).cambios).toMatchObject({ descripcion: "Tres cosas. Escríbenos.", formaGancho: "lista", angulo: "visitas" });
    expect(aplicarCampos({ format: "post", formaGancho: "mito", angulo: "otro" }, t[0]).cambios).not.toHaveProperty("formaGancho");
    // Si el caption no entró (ya tenía uno y no se pidió con su botón), tampoco la forma.
    expect(aplicarCampos({ format: "post", descripcion: "El mío" }, t[0]).cambios).toEqual({});
  });
});

describe("lo que viaja al calendario", () => {
  const idea = { titulo: "Visitas", brief: "b", escena: "e", textoPieza: "T", formaGancho: "lista", angulo: "visitas", ganchos: ["a", "b", "c"] };

  it("rellenarConIdea pone la forma, el ángulo y los ganchos de una UGC SÓLO si no los tenía", () => {
    expect(rellenarConIdea({ format: "post" }, idea).cambios).toMatchObject({ formaGancho: "lista", angulo: "visitas" });
    expect(rellenarConIdea({ format: "post", formaGancho: "mito" }, idea).cambios).not.toHaveProperty("formaGancho");
    const ugc = rellenarConIdea({ format: "reel", rostro: true }, idea);
    expect(ugc.cambios.ganchosUgc).toEqual(["a", "b", "c"]);
    expect(ugc.campos).toContain("ganchos");
    expect(rellenarConIdea({ format: "reel", rostro: true, ganchosUgc: ["mío"] }, idea).cambios).not.toHaveProperty("ganchosUgc");
    expect(rellenarConIdea({ format: "post" }, idea).cambios).not.toHaveProperty("ganchosUgc");
  });

  it("«Otra» los reemplaza, y «Planificar mes» los lleva al calendario", () => {
    expect(reemplazarConIdea({ format: "post", formaGancho: "mito" }, idea)).toMatchObject({ formaGancho: "lista", angulo: "visitas" });
    const pub = publicacionDelPlan({ idea: "x", formaGancho: "lista", angulo: "visitas" }, { format: "post" }, {}, { id: "p" });
    expect(pub).toMatchObject({ formaGancho: "lista", angulo: "visitas" });
  });
});

describe("«Revisar el mes»: las reglas del gancho", () => {
  const catalogo = [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }];

  it("una cifra del gancho que no está escrita, y el gancho de miedo; lo escrito en el estudio vale", () => {
    const days = [{ date: "2030-03-04", posts: [
      { id: "a", format: "post", textoPieza: "El 90 % lo hace mal", descripcion: "Escríbenos por WhatsApp." },
      { id: "b", format: "post", textoPieza: "Esto podría matarte", descripcion: "Escríbenos por WhatsApp." },
      { id: "c", format: "post", textoPieza: "10 años de garantía", descripcion: "Escríbenos por WhatsApp." },
    ] }];
    const r = revisarMes(days, { catalogo, estudio: { productos: { sofa: { elementos: { garantia: "10 años" } } } } });
    const de = (id) => r.find((x) => x.post.id === id)?.problemas.map((p) => p.codigo) ?? [];
    expect(de("a")).toContain("cifra-gancho");
    expect(de("b")).toContain("miedo");
    expect(de("c")).not.toContain("cifra-gancho");
  });

  it("sin catálogo ni estudio cargados no se dice «inventada» (no se sabe qué está escrito); el miedo, siempre", () => {
    const post = { format: "post", textoPieza: "El 90 % lo hace mal. Esto podría matarte" };
    expect(problemasDeGancho(post, { permitidos: null }).map((p) => p.codigo)).toEqual(["miedo"]);
    const days = [{ date: "2030-03-04", posts: [{ id: "a", ...post, descripcion: "Escríbenos." }] }];
    expect(revisarMes(days).flatMap((x) => x.problemas.map((p) => p.codigo))).not.toContain("cifra-gancho");
  });

  it("un precio del caption que ya marcó la regla del precio no se repite como cifra del gancho", () => {
    const days = [{ date: "2030-03-04", posts: [{ id: "a", format: "post", descripcion: "Desde $45. Escríbenos." }] }];
    const codigos = revisarMes(days, { catalogo }).flatMap((x) => x.problemas.map((p) => p.codigo));
    expect(codigos).toContain("precio");
    expect(codigos).not.toContain("cifra-gancho");
    expect(numerosPermitidos({ catalogo }).has("399")).toBe(true);
  });
});

describe("el gancho visual del reel por planos", () => {
  it("sólo si se le da: una sugerencia, no una orden", () => {
    expect(pedidoDeReel({ idea: "x" })).not.toMatch(/primer plano \(lo que detiene/i);
    expect(pedidoDeReel({ idea: "x", ganchoVisual: "«Transición rápida»: un corte" })).toMatch(/una sugerencia: «Transición rápida»: un corte\. Úsala si encaja/);
  });
});
