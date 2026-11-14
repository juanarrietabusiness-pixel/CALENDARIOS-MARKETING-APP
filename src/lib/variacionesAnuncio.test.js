import { describe, it, expect } from "vitest";
import {
  ejesDeVariacion, cuantasVariaciones, textoDeVariacion, encargoDeVariacion, carpetaDeVariaciones, EJES_VARIACION, MIN_VARIACIONES, MAX_VARIACIONES,
} from "./variacionesAnuncio";
import { limpiarPiezaEncargo, lineaDeEspeciales, PAPELES_ESPECIALES } from "./director";

// ============================================================
// «Variaciones para anuncios»: de una pieza maestra, las de un conjunto
//
// Lo que importa:
//   1. Cada variación cambia UNA cosa dicha y conserva el ADN de la maestra.
//   2. Con texto, los ganchos van primero; el resto del texto, exacto. Sin texto (o con la plantilla encima), ningún gancho.
//   3. Nada inventado ni personal de quien lee.
// ============================================================

const FICHA = "Pieza: post 4:5 — anuncio del sofá cama.\nComposición: el sofá a la derecha, titular arriba del 8 al 20 %.\nTexto (exacto, sin cambiar una letra): titular «Duerme como en casa» (9 %); apoyo «Desde $399» (4 %).";

describe("cuántas y qué cambia cada una", () => {
  it("de 3 a 5", () => {
    expect([2, 3, 4, 5, 6, "4", "x"].map(cuantasVariaciones)).toEqual([0, 3, 4, 5, 0, 4, 0]);
    expect(MIN_VARIACIONES).toBe(3);
    expect(MAX_VARIACIONES).toBe(5);
  });

  it("con texto, los ganchos primero y de dos tipos; sin texto, ninguno; sin repetir", () => {
    expect(ejesDeVariacion(3, { conTexto: true })).toEqual(["gancho", "angulo", "composicion"]);
    expect(ejesDeVariacion(5, { conTexto: true })).toEqual(["gancho", "angulo", "composicion", "pregunta", "fondo"]);
    const sin = ejesDeVariacion(5, { conTexto: false });
    expect(sin.some((e) => EJES_VARIACION[e].gancho)).toBe(false);
    expect(new Set(sin).size).toBe(5);
    expect(ejesDeVariacion(9, { conTexto: true })).toHaveLength(5);
  });

  it("los ganchos no afirman nada personal de quien lee", () => {
    expect(EJES_VARIACION.pregunta.linea).toMatch(/nunca sobre quien lee/);
    for (const e of Object.values(EJES_VARIACION)) expect(e.linea).not.toMatch(/sufres|tu piel/i);
  });
});

describe("el texto que tiene que quedar", () => {
  it("en un gancho, sin el titular; en lo demás, el mismo", () => {
    expect(textoDeVariacion("Duerme como en casa\nDesde $399", "gancho")).toBe("Desde $399");
    expect(textoDeVariacion("Duerme como en casa\nDesde $399", "angulo")).toBe("Duerme como en casa\nDesde $399");
    expect(textoDeVariacion("", "gancho")).toBe("");
  });
});

describe("el encargo del director", () => {
  it("una de gancho: el titular de antes dicho, el resto exacto, la maestra delante", () => {
    const e = encargoDeVariacion(FICHA, { k: 0, eje: "gancho", texto: "Duerme como en casa\nDesde $399", productoIds: ["sofa"] });
    expect(e).toMatchObject({ n: 1, texto: "Desde $399", productoIds: ["sofa"] });
    expect(e.idea).toMatch(/^VARIACIÓN 1 PARA UN CONJUNTO DE ANUNCIOS de la pieza maestra: conserva su ADN/);
    expect(e.idea).toMatch(/Cambia el GANCHO/);
    expect(e.idea).toMatch(/Antes el titular era «Duerme como en casa»: escribe otro, y ponlo DELANTE del resto del texto, que va EXACTO/);
    expect(e.idea).toMatch(/LA FICHA DE LA PIEZA MAESTRA:\nPieza: post 4:5/);
    expect(e.idea).toMatch(/Nada de precios, descuentos, cifras ni promesas que no estén en la maestra/);
    // Pasa por la limpieza del director sin perder nada.
    expect(limpiarPiezaEncargo(e).texto).toBe("Desde $399");
  });

  it("una que no es de gancho: el MISMO texto, exacto", () => {
    const e = encargoDeVariacion(FICHA, { k: 2, eje: "composicion", texto: "Duerme como en casa\nDesde $399" });
    expect(e.n).toBe(3);
    expect(e.texto).toBe("Duerme como en casa\nDesde $399");
    expect(e.idea).toMatch(/El texto de la pieza va EXACTO, el mismo de la maestra/);
    expect(e.idea).toMatch(/Cambia la COMPOSICIÓN/);
  });

  it("con el texto puesto por la plantilla encima: sin texto ni gancho", () => {
    const e = encargoDeVariacion("Un sofá cama en una sala", { k: 0, eje: "angulo", texto: "Duerme como en casa", sinTexto: true });
    expect(e).toMatchObject({ texto: "", sinTexto: true });
    expect(e.idea).not.toMatch(/titular era/);
    expect(e.idea).toMatch(/LA ESCENA DE LA PIEZA MAESTRA:\nUn sofá cama/);
    expect(limpiarPiezaEncargo(e).sinTexto).toBe(true);
  });
});

describe("la pieza maestra para el director", () => {
  it("es una imagen especial con su papel", () => {
    expect(PAPELES_ESPECIALES).toContain("maestra");
    expect(lineaDeEspeciales(["maestra"], "Dcasa")).toMatch(/^LA IMAGEN 1 ES LA PIEZA MAESTRA de un conjunto de anuncios[^]*conserva su ADN/);
  });
});

describe("la carpeta", () => {
  it("cabe en el nombre de una carpeta (40) y la repetida lleva su número", () => {
    expect(carpetaDeVariaciones("Duerme como en casa")).toBe("Variaciones · Duerme como en casa");
    const larga = carpetaDeVariaciones("«Un titular larguísimo que no cabe entero en el nombre»");
    expect(larga.length).toBeLessThanOrEqual(40);
    expect(larga).not.toMatch(/«|»/);
    expect(carpetaDeVariaciones("Un titular larguísimo que no cabe", 2)).toMatch(/ \(2\)$/);
    expect(carpetaDeVariaciones("Un titular larguísimo que no cabe", 2).length).toBeLessThanOrEqual(40);
    expect(carpetaDeVariaciones("")).toBe("Variaciones · anuncio");
  });
});
