import { describe, it, expect } from "vitest";
import {
  ejemplosDelCliente, bloqueDeEjemplos, pedidoDelPlanificador, leerPlanificador, conPlanificado, planificadoVigente, planificadoParaGuardar,
  firmaDeCasilla, sePlanifica, choquesDeVariedad, pedidoDeCritica, leerCritica, MAX_EJEMPLOS, HORAS_PLAN,
} from "./motorTextos.js";
import {
  darForma, celdasPorNiveles, repartirContexto, recortarBloque, TOTAL_CONTEXTO, TOPES_CONTEXTO, partesDeProduccion, pedidoDeProduccion,
  leerProduccion, escogidoDe, tacticaValida, lineaDePieza, TACTICAS,
} from "./loteAnuncios.js";
import { formaDe } from "./formasGancho.js";

// ============================================================
// El motor de textos como lo haría Claude (lib/motorTextos.js y lo nuevo de lib/loteAnuncios.js): el contexto por
// bloques, los ejemplos del cliente, las opciones que escoge la IA, el planificador del mes, la variedad y el revisor.
// ============================================================

const angulos = {
  sofa: [
    { id: "visitas", nombre: "Las visitas", publico: "frio", linea: "«Las visitas» — problema: no hay dónde duerman" },
    { id: "espacio", nombre: "El espacio", publico: "tibio", linea: "«El espacio» — se abre en un gesto" },
    { id: "precio", nombre: "El precio", linea: "«El precio» — objeción: parece caro" },
    { id: "facil", nombre: "Fácil", linea: "«Fácil» — se arma solo" },
  ],
};
const productos = [{ id: "sofa", nombre: "Sofá cama" }];

describe("el contexto por bloques", () => {
  it("cada bloque con su tope: lo último (los pasajes, el rubro) llega aunque la ficha sea larga", () => {
    const b = repartirContexto({ ficha: "F".repeat(20_000), pautas: "P".repeat(500), pasajes: "pasaje ".repeat(2000), rubro: "R".repeat(5000) });
    expect(b.pautas).toHaveLength(500);
    expect(b.pasajes.length).toBeGreaterThan(TOPES_CONTEXTO.pasajes - 50);
    expect(b.rubro.length).toBeGreaterThan(TOPES_CONTEXTO.rubro - 50);
    const total = Object.values(b).reduce((n, t) => n + t.length, 0);
    expect(total).toBeLessThanOrEqual(TOTAL_CONTEXTO + 20);
    // Lo que sobra (sin estudio, sin lenguaje, sin ejemplos) se lo lleva la ficha, que va primero.
    expect(b.ficha.length).toBeGreaterThan(TOPES_CONTEXTO.ficha);
  });

  it("recorta sin partir una línea por la mitad", () => {
    expect(recortarBloque("uno dos tres\ncuatro cinco seis", 18)).toBe("uno dos tres …");
    expect(recortarBloque("corto", 100)).toBe("corto");
  });

  it("el pedido lleva el papel al principio y lo de la marca por bloques; con el texto de antes, como antes", () => {
    const plan = darForma(celdasPorNiveles({ problema: 1 }), { productos });
    const t = pedidoDeProduccion({ marca: "Dcasa", plan, bloques: { ficha: "Ficha de Dcasa", pautas: "Nunca digas barato", pasajes: "Pasaje", rubro: "Saber" } });
    expect(t).toMatch(/^Eres el redactor de contenido de la agencia para Dcasa/);
    expect(t).toMatch(/LO QUE SE SABE DE LA MARCA:\nFicha de Dcasa\n\nPAUTAS PARA ESCRIBIR[^\n]*\nNunca digas barato\n\nPasaje/);
    expect(t).toMatch(/SABER DEL RUBRO[^\n]*\nSaber/);
    expect(pedidoDeProduccion({ plan, contexto: "Lo de antes" })).toMatch(/LO QUE SE SABE DE LA MARCA:\nLo de antes/);
  });

  it("lo FIJO es igual en todas las llamadas de una tanda (va a la caché); lo de cada llamada, aparte", () => {
    const plan = darForma(celdasPorNiveles({ problema: 2, decision: 2 }), { productos, angulos });
    const a = partesDeProduccion({ marca: "Dcasa", plan: plan.slice(0, 2), planTodo: plan, productos: { sofa: "Sofá cama · $399" } });
    const b = partesDeProduccion({ marca: "Dcasa", plan: plan.slice(2), planTodo: plan, productos: { sofa: "Sofá cama · $399" }, usados: ["Uno"] });
    expect(a.fijo).toBe(b.fijo);
    expect(a.variable).toMatch(/^Escribe 2 publicaciones/);
    expect(b.variable).toMatch(/Estos titulares ya salieron[\s\S]*Uno/);
    expect(a.fijo).not.toMatch(/Escribe \d/);
  });
});

describe("las opciones que escoge la IA", () => {
  it("darForma da 2–3 válidas: la sugerida primero, ninguna del nivel equivocado ni la de la vecina", () => {
    const plan = darForma(celdasPorNiveles({ inconsciente: 2, problema: 2, decision: 2 }), { productos, semilla: 3 });
    for (const r of plan) {
      expect(r.opciones.formas[0]).toBe(r.formaGancho);
      expect(r.opciones.formas.length).toBeGreaterThan(1);
      expect(r.opciones.formas.length).toBeLessThanOrEqual(3);
      for (const f of r.opciones.formas) expect(formaDe(f).niveles, `${r.n} ${f}`).toContain(r.nivel);
      expect(r.opciones.tacticas[0]).toBe(r.tactica);
    }
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].opciones.formas.slice(1)).not.toContain(plan[i - 1].formaGancho);
      expect(plan[i].opciones.tacticas.slice(1)).not.toContain(plan[i - 1].tactica);
    }
  });

  it("las tácticas que piden un dato real sólo con datos; la urgencia, con una fecha especial; el precio, no en lo frío", () => {
    expect(tacticaValida("precio", { nivel: "decision" }, { hayDatos: true })).toBe(true);
    expect(tacticaValida("precio", { nivel: "problema" }, { hayDatos: true })).toBe(false);
    expect(tacticaValida("prueba", {}, { hayDatos: false })).toBe(false);
    expect(tacticaValida("urgencia", {})).toBe(false);
    expect(tacticaValida("urgencia", { especial: "Black Friday" })).toBe(true);
    const plan = darForma(celdasPorNiveles({ decision: 6 }), { productos });
    for (const r of plan) for (const t of r.opciones.tacticas.slice(1)) expect(["precio", "prueba", "urgencia"]).not.toContain(t);
  });

  it("lo que ya trae la casilla (su forma, su ángulo) o una UGC no se ofrece: va fijo", () => {
    expect(darForma([{ nivel: "problema", formaGancho: "mito" }])[0].opciones?.formas).toBeUndefined();
    expect(darForma([{ nivel: "problema", formato: "reel", rostro: true }], { formato: "reel" })[0].opciones?.formas).toBeUndefined();
    const [r] = darForma([{ nivel: "producto", tipo: "anuncio", productoId: "sofa", angulo: "precio" }], { productos, angulos });
    expect(r.angulo).toBe("precio");
    expect(r.opciones?.angulos).toBeUndefined();
  });

  it("la línea de la pieza dice la sugerida con su id y las otras; la IA escoge y se lee sólo una de las suyas", () => {
    const [r] = darForma([{ nivel: "producto", tipo: "anuncio", productoId: "sofa" }], { productos, angulos });
    const linea = lineaDePieza(r, { sofa: "Sofá cama" });
    expect(linea).toMatch(/otras formas que también valen aquí: «/);
    expect(linea).toMatch(new RegExp(`\\[${r.formaGancho}\\]`));
    expect(linea).toMatch(/otros ángulos que también valen aquí/);
    const otra = r.opciones.formas[1];
    const ang = r.opciones.angulos[1].id;
    const tac = r.opciones.tacticas[1];
    const [idea] = leerProduccion(JSON.stringify({ ideas: [{ n: 1, titular: "Hola", escena: "Una sala", forma: otra, angulo: ang, tactica: tac }] }), [r]);
    expect(idea).toMatchObject({ formaGancho: otra, angulo: ang, tactica: tac, anguloNombre: r.opciones.angulos[1].nombre });
    // Una que no estaba entre sus opciones no vale: queda la sugerida.
    expect(escogidoDe(r, { forma: "no-existe", tactica: "precio-falso", angulo: "x" })).toMatchObject({ formaGancho: r.formaGancho, tactica: r.tactica, angulo: r.angulo });
  });

  it("con opciones, el pedido pide escoger y decir cuál; sin ellas, el gancho va decidido como siempre", () => {
    const plan = darForma(celdasPorNiveles({ problema: 2 }), { productos });
    const t = pedidoDeProduccion({ plan });
    expect(t).toMatch(/escoge el que mejor sirva a ESA pieza/);
    expect(t).toMatch(/"forma":"…"/);
    const sin = plan.map(({ opciones: _o, ...r }) => r);
    expect(pedidoDeProduccion({ plan: sin })).toMatch(/YA decidido su tipo de contenido \(lo que comunica\), su nivel de consciencia, su gancho y su composición/);
  });
});

describe("los ejemplos del propio cliente", () => {
  const calendarios = [
    { id: "k1", days: [{ date: "2030-01-05", posts: [
      { id: "a", format: "post", title: "Visitas", descripcion: "Cuando llegan visitas, el sofá cama de Dcasa se abre en un gesto y todos duermen bien. Escríbenos." },
      { id: "b", format: "reel", descripcion: "Corto" },
    ] }] },
    { id: "k2", days: [{ date: "2030-02-05", posts: [
      { id: "c", format: "carrusel", status: "approved", descripcion: "Tres errores al comprar un sofá cama que te cuestan noches de sueño; el tercero es el más común." },
    ] }] },
  ];
  const metricas = [
    ...[10, 12, 11, 9].map((v, i) => ({ cuenta_id: "c", red: "instagram", texto: `Publicación normal número ${i} con su texto de relleno suficiente`, publicada_at: "2030-02-01", interacciones: v })),
    { cuenta_id: "c", red: "instagram", texto: "¿Sabías que un sofá cama bien elegido dura diez años? Te contamos cómo escogerlo.", publicada_at: "2030-02-10", interacciones: 60 },
  ];

  it("lo aprobado (las más nuevas primero) y lo que más rindió, con su texto; sin repetir y con tope", () => {
    const e = ejemplosDelCliente({ calendarios, aprobadas: new Set(["k1|a"]), metricas, hoy: "2030-03-01" });
    expect(e.map((x) => x.origen)).toEqual(["aprobada", "aprobada", "rindio"]);
    expect(e[0].texto).toMatch(/^Tres errores/);
    expect(e[2].rinde).toBeGreaterThan(1.2);
    expect(e.length).toBeLessThanOrEqual(MAX_EJEMPLOS);
    // Sin aprobaciones ni métricas: nada.
    expect(ejemplosDelCliente({ calendarios: [{ id: "x", days: [] }] })).toEqual([]);
  });

  it("van con su regla: el TONO, nunca copiar", () => {
    const t = bloqueDeEjemplos(ejemplosDelCliente({ calendarios, aprobadas: new Set(["k1|a"]), metricas, hoy: "2030-03-01" }));
    expect(t).toMatch(/^EJEMPLOS DE ESTA MARCA[^\n]*TONO[^\n]*no copies/);
    expect(t).toMatch(/Aprobada por el cliente · Carrusel/);
    expect(t).toMatch(/Le rindió [\d,]+× su promedio en Instagram/);
    expect(bloqueDeEjemplos([])).toBe("");
  });
});

describe("el planificador del mes", () => {
  const plan = darForma(celdasPorNiveles({ problema: 2, decision: 2 }), { productos, angulos })
    .map((r, i) => ({ ...r, clave: `p${i}`, fecha: `2030-03-0${i + 2}`, formato: "post", productoId: "sofa" }));

  it("se planifica el mes (y el plan con `planificar`), con 4 piezas o más", () => {
    expect(sePlanifica("mes", {}, 4)).toBe(true);
    expect(sePlanifica("mes", {}, 3)).toBe(false);
    expect(sePlanifica("plan", {}, 10)).toBe(false);
    expect(sePlanifica("plan", { planificar: true }, 10)).toBe(true);
    expect(sePlanifica("mes", { planificar: false }, 10)).toBe(false);
    expect(sePlanifica("campos", { planificar: true }, 10)).toBe(false);
  });

  it("el pedido mira todas las piezas con sus opciones y pide idea, gancho, ángulo y porqué con un arco", () => {
    const t = pedidoDelPlanificador({ marca: "Dcasa", lineas: plan.map((r) => lineaDePieza(r, { sofa: "Sofá cama" })), estrategia: "ESTRATEGIA DEL MES: vender", planificadas: ["2030-03-01 [post] Ya hecha"] });
    expect(t).toMatch(/^Eres el PLANIFICADOR de contenido de la agencia para Dcasa/);
    expect(t).toMatch(/LAS PIEZAS DEL MES \(4\)/);
    expect(t).toMatch(/otras formas que también valen aquí/);
    expect(t).toMatch(/YA PLANIFICADAS[\s\S]*Ya hecha/);
    expect(t).toMatch(/"arco"/);
  });

  it("lee sólo ideas con texto y lo escogido que esté entre las opciones; la casilla queda decidida", () => {
    const r0 = plan[0];
    const leido = leerPlanificador(JSON.stringify({ arco: "Del problema a la compra.", piezas: [
      { n: r0.n, idea: "La noche en que llegan los suegros y no hay cama", forma: r0.opciones.formas[1], tactica: "inventada", angulo: r0.opciones.angulos?.[1]?.id, porque: "Se reconoce." },
      { n: plan[1].n, idea: "" },
      { n: 99, idea: "No es de este plan" },
    ] }), plan);
    expect(leido.arco).toBe("Del problema a la compra.");
    expect([...leido.piezas.keys()]).toEqual([r0.n]);
    const p = leido.piezas.get(r0.n);
    expect(p.tactica).toBeUndefined();
    const decidida = conPlanificado(r0, p);
    expect(decidida).toMatchObject({ formaGancho: r0.opciones.formas[1], planificada: { idea: "La noche en que llegan los suegros y no hay cama", porque: "Se reconoce." } });
    expect(decidida.opciones).toBeUndefined();
    expect(lineaDePieza(decidida, {})).toMatch(/EL PLAN DEL MES \(lo decidió el planificador[^)]*\): «La noche en que llegan los suegros/);
    expect(lineaDePieza(decidida, {})).not.toMatch(/otras formas/);
    expect(leerPlanificador("nada", plan)).toBeNull();
  });

  it("lo guardado vale si su casilla sigue igual y tiene menos de HORAS_PLAN horas", () => {
    const ahora = Date.parse("2030-03-01T12:00:00Z");
    const guardado = { at: new Date(ahora - 3600_000).toISOString(), arco: "x", piezas: { p0: planificadoParaGuardar(plan[0], { idea: "Una" }) } };
    expect(planificadoVigente(guardado, plan, ahora).porClave.get("p0").idea).toBe("Una");
    // Otra casilla con la misma clave (otro tipo, otro nivel): no vale.
    expect(planificadoVigente(guardado, [{ ...plan[0], nivel: "solucion" }], ahora).porClave.size).toBe(0);
    expect(planificadoVigente(guardado, plan, ahora + HORAS_PLAN * 3600_000).porClave.size).toBe(0);
    expect(firmaDeCasilla(plan[0])).toMatch(/^post\|anuncio\|\|sofa\|problema\|2030-03-02$/);
  });
});

describe("la variedad y el revisor", () => {
  const plan = darForma(celdasPorNiveles({ problema: 3 }), { productos }).map((r) => ({ ...r, formato: "post" }));

  it("dos vecinas con la misma forma: a la segunda se le da otra de SUS opciones", () => {
    const ideas = plan.map((r) => ({ n: r.n, formaGancho: plan[0].formaGancho, tactica: r.tactica }));
    const choques = choquesDeVariedad(ideas, plan);
    expect(choques.map((c) => c.n)).toEqual([2, 3]);
    for (const c of choques) {
      expect(c.formaGancho).not.toBe(plan[0].formaGancho);
      expect(plan.find((r) => r.n === c.n).opciones.formas).toContain(c.formaGancho);
      expect(c.linea).toMatch(/repite con la anterior/);
    }
    // Lo que no trae opciones no se toca.
    expect(choquesDeVariedad(ideas, plan.map(({ opciones: _o, ...r }) => r))).toEqual([]);
  });

  it("el revisor recibe la guía, lo escrito y las que repiten; sólo reescribe campos que puede", () => {
    const t = pedidoDeCritica({ piezas: [{ r: plan[0], escrito: { titular: "Descubre el sofá", descripcion: "Te presentamos" } }], variedad: [{ n: 2, linea: "- n.º 2: repite con la anterior" }] });
    expect(t).toMatch(/^AHORA ERES EL EDITOR JEFE/);
    expect(t).toMatch(/serviría igual para otra|sirve igual para otra/);
    expect(t).toMatch(/titular: «Descubre el sofá»/);
    expect(t).toMatch(/repiten con su vecina[\s\S]*n\.º 2/);
    const m = leerCritica(JSON.stringify({ revisadas: [
      { n: 1, motivo: "genérico", titular: "Tus visitas duermen", forma: "otra", tactica: "x" },
      { n: 42, titular: "No es del plan" },
    ] }), plan);
    expect([...m.keys()]).toEqual([1]);
    expect(m.get(1).cambios).toEqual({ titular: "Tus visitas duermen" });
    expect(leerCritica('{"revisadas":[]}', plan).size).toBe(0);
    // En «campos», sólo los campos que pedía.
    const campos = [{ n: 1, campos: ["descripcion"] }];
    expect(leerCritica(JSON.stringify({ revisadas: [{ n: 1, descripcion: "Nuevo", titulo: "No" }] }), campos, "campos").get(1).cambios).toEqual({ descripcion: "Nuevo" });
  });
});

it("las tácticas siguen siendo las mismas (lo guardado en `post.tactica` vale)", () => {
  expect(TACTICAS.map(([id]) => id).slice(0, 3)).toEqual(["curiosidad", "pregunta", "identidad"]);
});
