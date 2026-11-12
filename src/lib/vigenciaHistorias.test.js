import { describe, it, expect } from "vitest";
import { vigenciaPorReglas, combinarVigencia, estaVigente, yaCaducada, leerVigencia, etiquetaVigencia, pedidoDeVigencia } from "./vigenciaHistorias.js";

const v = (post, publicada, extra = {}) => vigenciaPorReglas({ post, publicada, ...extra });

describe("las reglas de vigencia", () => {
  it("una felicitación de un día concreto no se reutiliza nunca", () => {
    expect(v({ title: "¡Feliz Día del Niño!" }, "2026-07-19").vigencia).toBe("nunca");
    expect(v({ textoPieza: "Feliz día de la patria" }, "2026-11-03").vigencia).toBe("nunca");
    expect(v({ descripcion: "Felices fiestas les desea todo el equipo" }, "2026-12-24").vigencia).toBe("nunca");
    expect(v({ idea: "Felicidades a todas las mamás" }, "2026-12-08").vigencia).toBe("nunca");
  });

  it("publicada en un día especial del cliente y lo nombra: era la publicación de ese día", () => {
    const r = v({ title: "Separación de Panamá: orgullo" }, "2026-11-03", { fechasDelDia: [{ nombre: "Separación de Panamá de Colombia" }] });
    expect(r.vigencia).toBe("nunca");
    // Publicada ese día pero sin nombrarlo: las reglas no lo deciden (la IA mira).
    expect(v({ title: "Tres trucos para limpiar tu sofá" }, "2026-11-03", { fechasDelDia: [{ nombre: "Separación de Panamá de Colombia" }] }).vigencia).toBeNull();
  });

  it("una promoción caduca al acabar el mes en que se publicó; si nombra un mes, ese mes", () => {
    expect(v({ textoPieza: "2x1 en lentes" }, "2026-10-10")).toMatchObject({ vigencia: "hasta", hasta: "2026-10-31" });
    expect(v({ title: "20% de descuento en sofás" }, "2026-10-05")).toMatchObject({ vigencia: "hasta", hasta: "2026-10-31" });
    expect(v({ title: "Lo nuevo de octubre" }, "2026-10-02")).toMatchObject({ vigencia: "hasta", hasta: "2026-10-31" });
    // El código de la oferta del mes cuenta como promoción aunque no diga «descuento».
    expect(v({ descripcion: "Usa LUNA10 al pagar" }, "2026-10-02", { oferta: { promoCode: "LUNA10" } })).toMatchObject({ vigencia: "hasta", hasta: "2026-10-31" });
  });

  it("una fecha explícita manda sobre el fin de mes; lo relativo acota", () => {
    expect(v({ title: "Ofertas hasta el 5 de diciembre" }, "2026-11-28")).toMatchObject({ hasta: "2026-12-05" });
    expect(v({ title: "Solo este fin de semana" }, "2026-10-09")).toMatchObject({ hasta: "2026-10-12" });
    expect(v({ title: "Precio especial hasta el 15" }, "2026-11-02")).toMatchObject({ hasta: "2026-11-15" });
    expect(v({ title: "Black Friday ya viene" }, "2026-11-10")).toMatchObject({ hasta: "2026-11-27" });
    // Un mes de antes nombrado en enero es el diciembre pasado.
    expect(v({ title: "Así cerramos diciembre" }, "2027-01-04")).toMatchObject({ hasta: "2026-12-31" });
  });

  it("lo atemporal no lo deciden las reglas (100 % algodón no es una promoción)", () => {
    expect(v({ title: "Cómo cuidar tu sofá", descripcion: "Te enseñamos 3 trucos. Tela 100 % algodón." }, "2026-10-10").vigencia).toBeNull();
    expect(v({ title: "Tu día a día más fácil" }, "2026-10-10").vigencia).toBeNull();
  });
});

describe("vigente o no", () => {
  it("sin revisar NO sale; lo vencido tampoco; lo apartado tampoco", () => {
    expect(estaVigente({ vigencia: "sin_revisar" }, "2026-11-12")).toBe(false);
    expect(estaVigente({ vigencia: "siempre" }, "2026-11-12")).toBe(true);
    expect(estaVigente({ vigencia: "siempre", excluida: 1 }, "2026-11-12")).toBe(false);
    expect(estaVigente({ vigencia: "hasta", vigente_hasta: "2026-10-31" }, "2026-11-12")).toBe(false);
    expect(estaVigente({ vigencia: "hasta", vigente_hasta: "2026-11-30" }, "2026-11-12")).toBe(true);
    expect(estaVigente({ vigencia: "nunca" }, "2026-11-12")).toBe(false);
    expect(yaCaducada({ vigencia: "hasta", hasta: "2026-10-31" }, "2026-11-01")).toBe(true);
    expect(etiquetaVigencia({ vigencia: "hasta", vigente_hasta: "2026-10-31" }, "2026-11-12").texto).toMatch(/Venció/);
  });

  it("gana lo más restrictivo: la IA no suelta lo que vieron las reglas", () => {
    expect(combinarVigencia({ vigencia: "hasta", hasta: "2026-11-30" }, { vigencia: "siempre" }).vigencia).toBe("hasta");
    expect(combinarVigencia({ vigencia: "hasta", hasta: "2026-11-30" }, { vigencia: "hasta", hasta: "2026-11-15" }).hasta).toBe("2026-11-15");
    expect(combinarVigencia({ vigencia: null }, { vigencia: "nunca" }).vigencia).toBe("nunca");
    expect(combinarVigencia({ vigencia: null }, { vigencia: "siempre" }).vigencia).toBe("siempre");
  });

  it("lee la respuesta de la IA y descarta lo que no entiende", () => {
    const r = leerVigencia('Aquí va: [{"n":1,"vigencia":"siempre","motivo":"Educa"},{"n":2,"vigencia":"hasta","hasta":null},{"n":3,"vigencia":"nunca","motivo":"Saludo"}]', 3);
    expect(r[1]).toMatchObject({ vigencia: "siempre" });
    expect(r[2]).toBeUndefined();
    expect(r[3]).toMatchObject({ vigencia: "nunca" });
    expect(leerVigencia("no sé", 1)).toEqual({});
    expect(pedidoDeVigencia([{ publicada: "2026-10-01", texto: "hola" }], "2026-11-12")).toMatch(/Hoy es 2026-11-12/);
  });
});
