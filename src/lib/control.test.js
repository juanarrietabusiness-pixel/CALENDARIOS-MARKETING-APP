import { describe, it, expect } from "vitest";
import { palabras, compararTexto, textoDelPedido, pedidoDeControl, leerControl, correccionDeTexto, resumenControl } from "./control.js";

describe("el control de calidad de una pieza", () => {
  it("compara palabra por palabra con tildes y eñes; mayúsculas y puntuación no cuentan", () => {
    expect(palabras("¿Llegan VISITAS? ¡Sofá-cama!")).toEqual(["llegan", "visitas", "sofá", "cama"]);
    expect(compararTexto("¿Llegan visitas?\nSofá cama $399", "LLEGAN VISITAS. SOFÁ CAMA $399")).toEqual([]);
    // Una tilde que falta, letras cambiadas y una palabra que no está.
    expect(compararTexto("Sofá cama de diseño", "Sofa cmaa diseño")).toEqual([
      { esperado: "sofá", escrito: "sofa" }, { esperado: "cama", escrito: "cmaa" }, { esperado: "de", escrito: "" },
    ]);
    expect(compararTexto("", "lo que sea")).toEqual([]);
  });

  it("saca el texto que se pidió del pedido: la línea del texto, la de la lámina o lo citado en la escena", () => {
    expect(textoDelPedido('Escena: una sala\n\nTexto en la imagen, exacto, legible y bien jerarquizado (lo primero grande): "¿Visitas?" / "Sofá cama $399".')).toBe("¿Visitas?\nSofá cama $399");
    expect(textoDelPedido('Lámina 1.\n\nEscribe en la lámina este texto, EXACTO, legible: "3 errores" / "al elegir sofá". Ningún otro texto.')).toBe("3 errores\nal elegir sofá");
    expect(textoDelPedido('Escena: Una sala luminosa con el titular «Duerme mejor» arriba.\n\nTipo de pieza: …')).toBe("Duerme mejor");
    expect(textoDelPedido("Escena: una sala sin texto")).toBe("");
  });

  it("el pedido dice el texto exacto, los precios del catálogo y si el logo tenía que ir", () => {
    const p = pedidoDeControl({ marca: "Dcasa", texto: "Sofá cama $399", precios: ["$399", "$120"], logo: true, reglas: ["el logo abajo a la derecha"] });
    expect(p).toMatch(/Transcribe EXACTAMENTE/);
    expect(p).toMatch(/DEBÍA decir \(exacto\): "Sofá cama \$399"/);
    expect(p).toMatch(/Los únicos precios válidos son los del catálogo: \$399, \$120/);
    expect(p).toMatch(/debía llevar el logo de Dcasa/);
    expect(p).toMatch(/el logo abajo a la derecha/);
    expect(pedidoDeControl({})).toMatch(/No se pidió texto/);
  });

  it("el veredicto: lo que encuentra el código manda aunque la IA diga que está bien; «soloTexto» si sólo falla el texto", () => {
    const ia = JSON.stringify({ textoLeido: "Sofa cmaa $399", errores: [], precios: [], logo: "bien", deformaciones: [], puntaje: 9 });
    const c = leerControl(ia, { texto: "Sofá cama $399", logo: true });
    expect(c.estado).toBe("revisar");
    expect(c.errores).toEqual([{ esperado: "sofá", escrito: "sofa" }, { esperado: "cama", escrito: "cmaa" }]);
    expect(c.soloTexto).toBe(true);
    const bien = leerControl(JSON.stringify({ textoLeido: "Sofá cama $399", logo: "bien" }), { texto: "Sofá cama $399", logo: true });
    expect(bien).toMatchObject({ estado: "ok", errores: [], soloTexto: false });
    // Un precio inventado o el logo deformado: a revisar, y no se corrige solo.
    const grave = leerControl(JSON.stringify({ textoLeido: "Sofá cama $299", precios: ["$299"], logo: "deformado" }), { texto: "Sofá cama", logo: true });
    expect(grave).toMatchObject({ estado: "revisar", soloTexto: false, logo: "deformado", precios: ["$299"] });
    expect(leerControl("sin json")).toBeNull();
  });

  it("la corrección quirúrgica dice qué cambiar y que lo demás se quede igual; el resumen de la tarjeta", () => {
    const c = { estado: "revisar", errores: [{ esperado: "cama", escrito: "cmaa" }, { esperado: "de", escrito: "" }] };
    const t = correccionDeTexto(c, "Sofá cama de diseño");
    expect(t).toMatch(/donde dice "cmaa" debe decir "cama"; falta la palabra "de"/);
    expect(t).toMatch(/EXACTAMENTE así: "Sofá cama de diseño"/);
    expect(t).toMatch(/Conserva todo lo demás exactamente igual/);
    expect(correccionDeTexto({ errores: [] })).toBe("");
    expect(resumenControl(c)).toBe("Revisar: dice «cmaa» (debía decir «cama»)");
    expect(resumenControl({ estado: "ok" })).toBe("Revisada");
    expect(resumenControl({ estado: "revisar", errores: [], precios: [], logo: "falta", deformaciones: [] })).toBe("Revisar: falta el logo");
  });
});

describe("la tipografía de la marca como referencia y con qué se corrige", () => {
  const kit = { fuente: { clave: "clientes/c1/fuentes/f.ttf", nombre: "Montserrat", muestra: "clientes/c1/estudio/muestra.png" } };
  const modelo = { id: "nano-banana", referencias: 3 };

  it("la muestra va de referencia «tipografía» sólo cuando el modelo escribe el texto", async () => {
    const { apoyosDePieza, apoyosDelCompositor } = await import("./pieza.js");
    const { referenciaDeTipografia, limpiarKit } = await import("./kitMarca.js");
    expect(referenciaDeTipografia({})).toBeNull();
    expect(referenciaDeTipografia(kit)).toMatchObject({ clave: "clientes/c1/estudio/muestra.png", toma: ["tipografia"] });
    expect(limpiarKit({ fuente: { clave: "clientes/c1/../c2/f.ttf", muestra: "clientes/c1/m.png" } }).fuente).toBeNull();
    expect(apoyosDePieza({ kit, modelo }).map((a) => a.clave)).toEqual(["clientes/c1/estudio/muestra.png"]);
    expect(apoyosDePieza({ kit, modelo, conTexto: false })).toEqual([]);
    const c = apoyosDelCompositor({ kit, modelo, form: { tipo: "imagen", prompt: "x" }, puestas: [] });
    expect(c.deLaLetra.map((a) => a.clave)).toEqual(["clientes/c1/estudio/muestra.png"]);
    // Sin hueco (el logo se guarda el suyo y lo puesto a mano ocupa el resto), no va.
    expect(apoyosDelCompositor({ kit, modelo, form: { tipo: "imagen" }, puestas: ["a", "b"], reservaLogo: true }).deLaLetra).toEqual([]);
    expect(apoyosDelCompositor({ kit, modelo, form: { tipo: "video" }, puestas: [] }).deLaLetra).toEqual([]);
  });

  it("el texto se corrige con el modelo que hizo la pieza si edita; si no, con Nano Banana", async () => {
    const { modeloParaCorregir } = await import("./controlEstudio.js");
    expect(modeloParaCorregir({ gemini: true, kie: true }, "nano-banana-pro-kie").id).toBe("nano-banana-pro-kie");
    expect(modeloParaCorregir({ gemini: true }, "modelo-que-no-existe").id).toBe("nano-banana");
    expect(modeloParaCorregir({ gemini: true }, "prueba").id).toBe("nano-banana");
  });
});

describe("la revisión del director", async () => {
  const { pedidoDeControl, leerControl, correccionDelDirector, mejoro, NOTA_MINIMA, PREFIJO_AJUSTE } = await import("./control.js");
  const { correccionesRecientes } = await import("./director.js");

  it("con la ficha, el control pide además la nota y los arreglos de diseño con números", () => {
    const p = pedidoDeControl({ texto: "Hola", ficha: "Pieza: post.\nComposición: titular del 8 al 22 %." });
    expect(p).toMatch(/como el DIRECTOR CREATIVO que la diseñó con esta ficha:\nPieza: post\./);
    expect(p).toMatch(/"puntajeDiseno":1-10/);
    expect(pedidoDeControl({ texto: "Hola" })).not.toMatch(/DIRECTOR/);
  });

  it("por debajo de 8 con arreglos, revisar y corregible; con un precio inventado, no se toca solo", () => {
    const flojo = leerControl('{"textoLeido":"Hola","logo":"no aplica","diseno":[{"problema":"muy abajo","arreglo":"sube el titular al 10 %"}],"puntajeDiseno":6}', { texto: "Hola" });
    expect(flojo).toMatchObject({ estado: "revisar", puntajeDiseno: 6, corregible: true, soloTexto: false });
    const bien = leerControl('{"textoLeido":"Hola","logo":"no aplica","diseno":[{"problema":"x","arreglo":"y"}],"puntajeDiseno":8}', { texto: "Hola" });
    expect(bien.estado).toBe("ok");
    expect(NOTA_MINIMA).toBe(8);
    const precio = leerControl('{"textoLeido":"Hola","precios":["$5"],"diseno":[{"arreglo":"sube"}],"puntajeDiseno":5}', { texto: "Hola" });
    expect(precio.corregible).toBe(false);
    // Sin ficha (no hay nota), lo de siempre.
    expect(leerControl('{"textoLeido":"Hola"}', { texto: "Hola" }).puntajeDiseno).toBeUndefined();
  });

  it("una sola edición arregla letras y diseño, y el director no aprende de ella", () => {
    const c = leerControl('{"textoLeido":"Hloa","diseno":[{"arreglo":"sube el titular al 10 %"}],"puntajeDiseno":6}', { texto: "Hola" });
    const e = correccionDelDirector(c, "Hola");
    expect(e.startsWith(`${PREFIJO_AJUSTE} sube el titular al 10 %.`)).toBe(true);
    expect(e).toMatch(/donde dice "hloa" debe decir "hola"/);
    expect(correccionDelDirector({ errores: [], puntajeDiseno: 9, diseno: [{ arreglo: "x" }] }, "Hola")).toBe("");
    expect(correccionesRecientes([`Edita la imagen de referencia: ${e}. Conserva todo lo demás exactamente igual.`, "Edita la imagen de referencia: el logo más pequeño. Conserva todo lo demás exactamente igual."]))
      .toEqual(["el logo más pequeño"]);
  });

  it("se queda la corregida sólo si mejoró", () => {
    const antes = { estado: "revisar", errores: [], puntajeDiseno: 6 };
    expect(mejoro(antes, { estado: "revisar", errores: [], puntajeDiseno: 7 })).toBe(true);
    expect(mejoro(antes, { estado: "revisar", errores: [], puntajeDiseno: 5 })).toBe(false);
    expect(mejoro(antes, { estado: "revisar", errores: [{ esperado: "a" }], puntajeDiseno: 9 })).toBe(false);
    expect(mejoro({ errores: [{ esperado: "a" }] }, { estado: "revisar", errores: [] })).toBe(true);
    expect(mejoro(antes, null)).toBe(false);
  });
});
