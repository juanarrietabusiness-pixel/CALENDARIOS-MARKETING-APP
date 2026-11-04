import { describe, it, expect } from "vitest";
import { validarGuion, lineaDeTiempo } from "./videoEscenas.js";
import { revisarEscenas, textoDeRevision, instanteLleno } from "./revisionEscenas.js";
import { EJEMPLO_GUION } from "./videoFormatoIA.js";

// ============================================================
// La revisión antes de renderizar: lo que se nota en el video y no leyendo el JSON
// ============================================================

/** Un contexto 2D que sólo mide: cada letra, el 55 % del tamaño de la fuente (como en las pruebas del motor). */
function lienzo() {
  const estado = { font: "10px x" };
  const tam = () => Number(/(\d+)px/.exec(estado.font)?.[1] ?? 10);
  return new Proxy({}, {
    get(_, k) {
      if (k === "measureText") return (t) => ({ width: String(t).length * tam() * 0.55 });
      if (k === "createLinearGradient") return () => ({ addColorStop: () => {} });
      if (k in estado) return estado[k];
      return () => {};
    },
    set(_, k, v) { estado[k] = v; return true; },
  });
}

const copia = (x) => JSON.parse(JSON.stringify(x));
/** El ejemplo neutro con una escena cambiada. */
function con(cambiar) {
  const g = copia(EJEMPLO_GUION);
  cambiar(g);
  const v = validarGuion(g);
  expect(v.errores).toEqual([]);
  return v.guion;
}
const revisar = (guion, formato = "9:16") => revisarEscenas(lienzo(), { guion, linea: lineaDeTiempo(guion), formato });
const tipos = (ps) => ps.map((p) => p.tipo);

describe("la revisión de las escenas", () => {
  it("el ejemplo neutro sale limpio en los tres formatos: nada grave", () => {
    const g = validarGuion(copia(EJEMPLO_GUION)).guion;
    for (const f of ["9:16", "1:1", "16:9"]) expect(revisar(g, f).filter((p) => p.grave)).toEqual([]);
    expect(textoDeRevision([], { formato: "9:16" })).toMatch(/sin problemas/);
  });

  it("algo puesto con x/y donde lo tapan los botones de la red: fuera de la zona segura (grave si se lee)", () => {
    const g = con((x) => { x.escenas[1].capas[0].pos = { x: 0.5, y: 0.93 }; });
    const p = revisar(g).find((q) => q.tipo === "zona_segura" || q.tipo === "se_sale");
    expect(p).toMatchObject({ grave: true, escena: "e2", n: 2, capa: "s" });
    expect(p.mensaje).toMatch(/zona/);
  });

  it("un texto en la franja de los subtítulos: los subtítulos lo tapan", () => {
    // La franja de 9:16 está justo encima del 20 % de abajo: y ≈ 0,73.
    const g = con((x) => { x.escenas[1].capas[0].pos = { x: 0.5, y: 0.735 }; });
    const p = revisar(g).find((q) => q.tipo === "subtitulos");
    expect(p).toMatchObject({ grave: true, capa: "s" });
    expect(p.mensaje).toMatch(/subtitulos\.pos/);
    // Sin subtítulos, eso no es problema.
    const sin = con((x) => { x.escenas[1].capas[0].pos = { x: 0.5, y: 0.735 }; x.subtitulos.activo = false; });
    expect(tipos(revisar(sin))).not.toContain("subtitulos");
  });

  it("una palabra que no cabe en su caja se sale; un texto largo de más se encoge y se dice", () => {
    const larga = con((x) => { x.escenas[0].capas[1].texto = "Supercalifragilisticoespialidosamente"; x.escenas[0].capas[1].tam = 0.3; });
    const p = revisar(larga).find((q) => q.tipo === "texto_se_sale");
    expect(p).toMatchObject({ grave: true, capa: "t" });
    expect(p.mensaje).toMatch(/Supercalifragilisticoespialidosamente/);

    const mucho = con((x) => {
      x.escenas[0].capas[1].texto = "Un titular larguísimo que intenta decir demasiadas cosas a la vez en pantalla";
      x.escenas[0].capas[1].tam = 0.5;
    });
    expect(tipos(revisar(mucho))).toContain("texto_apretado");
  });

  it("dos capas encimadas mientras se ven las dos; si una sale antes de que entre la otra, no", () => {
    const g = con((x) => {
      x.escenas[1].capas[0].pos = { x: 0.5, y: 0.45 };
      x.escenas[1].capas[1].pos = { x: 0.5, y: 0.45 };
    });
    expect(revisar(g).find((q) => q.tipo === "encimadas")).toMatchObject({ grave: true, escena: "e2" });
    const turnos = con((x) => {
      x.escenas[1].capas.splice(2); // sin el icono del ejemplo, que va en su zona
      x.escenas[1].capas[0].pos = { x: 0.5, y: 0.45 };
      x.escenas[1].capas[0].sale = { palabra: 2 };
      x.escenas[1].capas[1].pos = { x: 0.5, y: 0.45 };
      x.escenas[1].capas[1].entra = { palabra: 4 };
    });
    expect(tipos(revisar(turnos))).not.toContain("encimadas");
  });

  it("el diseño de cada escena: texto pequeño, escena vacía y todo cargado a un lado (avisos, no graves)", () => {
    const una = (capas) => {
      const v = validarGuion({ escenas: [{ tipo: "dato", habla: "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince", capas }] });
      expect(v.errores).toEqual([]);
      return v.guion;
    };
    // Una etiqueta sola: la escena se ve vacía.
    const sola = revisar(una([{ tipo: "texto", id: "e", texto: "nuevo", rol: "etiqueta", tam: 0.2 }]));
    expect(tipos(sola)).toContain("espacio_vacio");
    // Demasiado en una escena: el motor encoge todo para que quepa y las etiquetas quedan por debajo de lo que se lee.
    const llena = revisar(una([
      { tipo: "texto", id: "t", texto: "Lo que incluye tu plan de este mes", rol: "titular", pos: "arriba" },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ tipo: "texto", id: `e${n}`, texto: `La ventaja número ${n} que trae el plan completo de este mes`, rol: "etiqueta", pos: "abajo" })),
    ]), "16:9");
    const p = llena.find((q) => q.tipo === "texto_pequeno");
    expect(p.mensaje).toMatch(/px/);
    expect(p.grave).toBe(false);
    expect(sola.filter((p) => ["texto_pequeno", "espacio_vacio"].includes(p.tipo)).every((p) => !p.grave)).toBe(true);
    // Todo puesto arriba con coordenadas: carga la escena arriba.
    const arriba = revisar(una([
      { tipo: "texto", id: "t", texto: "Un titular", rol: "titular", pos: { x: 0.5, y: 0.2 } },
      { tipo: "cifra", id: "c", valor: 90, sufijo: "%", pos: { x: 0.5, y: 0.33 } },
    ]));
    const d = arriba.find((p) => p.tipo === "desequilibrio");
    expect(d.mensaje).toMatch(/arriba/);
    // Repartido por zonas, con una pieza visual grande: nada de eso.
    const bien = revisar(una([
      { tipo: "cifra", id: "c", valor: 90, sufijo: "%", etiqueta: "lo recomiendan", pos: "centro" },
      { tipo: "texto", id: "t", texto: "Nueve de cada diez", rol: "titular", pos: "arriba" },
    ]));
    expect(tipos(bien)).not.toEqual(expect.arrayContaining(["espacio_vacio"]));
    expect(tipos(bien)).not.toContain("desequilibrio");
    expect(tipos(bien)).not.toContain("texto_pequeno");
  });

  it("el texto de la revisión pone los graves primero, con escena y segundo", () => {
    const t = textoDeRevision([
      { grave: false, tipo: "palabra_sola", escena: "e1", n: 1, capa: "t", en: 0.4, mensaje: "Una sola." },
      { grave: true, tipo: "subtitulos", escena: "e3", n: 3, capa: "x", en: 7.2, mensaje: "Tapa." },
    ]);
    expect(t.split("\n")).toEqual([
      "Revisión (9:16): 1 grave y 1 aviso.",
      "· GRAVE · escena 3 (e3) · 7.2 s · Tapa.",
      "· aviso · escena 1 (e1) · 0.4 s · Una sola.",
    ]);
  });

  it("el instante «lleno» de cada escena es cuando ya entró todo, dentro de la escena", () => {
    const g = validarGuion(copia(EJEMPLO_GUION)).guion;
    const l = lineaDeTiempo(g);
    l.escenas.forEach((m, i) => {
      const t = instanteLleno(g, l, i);
      expect(t).toBeGreaterThanOrEqual(m.desde);
      expect(t).toBeLessThan(m.hasta);
    });
    // En la primera, la capa «t» entra en la palabra 5: el instante lleno es después.
    expect(instanteLleno(g, l, 0)).toBeGreaterThan(l.escenas[0].palabras[5].desde);
  });
});
