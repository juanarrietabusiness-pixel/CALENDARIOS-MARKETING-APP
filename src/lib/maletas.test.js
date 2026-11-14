import { describe, it, expect } from "vitest";
import {
  estadoDeMaleta, semaforoMaletas, maletasQueFaltan, resumenDeMaletas, tareaParaElCliente, avisoDeMaletas, esGenerico,
} from "./maletas.js";

const COMPLETO = {
  elementos: {
    publico: "Mujeres de 28 a 45 años en Ciudad de Panamá, con hijos pequeños y trabajo de oficina, de ingreso medio.",
    problema: "Los niños manchan el sofá cada semana y no tienen tiempo de llevarlo a lavar a ningún lado.",
    solucion: "Lavado a domicilio con equipo de inyección y extracción; el sofá queda seco en cuatro horas.",
    diferenciales: "El único en la ciudad que seca en cuatro horas y trae protector antimanchas incluido en el precio.",
    testimonios: "Más de 200 familias atendidas; María de Costa del Este dijo que su sofá blanco quedó como nuevo.",
    objeciones: "¿Daña la tela? No: el químico es neutro. ¿Cuánto tarda? Una hora y media en su casa.",
    garantia: "Si la mancha vuelve en 15 días, volvemos sin costo; se pide por WhatsApp con la foto.",
  },
  objeciones: [],
};

describe("una maleta", () => {
  it("vacía o que dice que no hay, en rojo; corta o de relleno, en ámbar; concreta, en verde", () => {
    expect(estadoDeMaleta("testimonios", "").estado).toBe("rojo");
    expect(estadoDeMaleta("testimonios", "No hay testimonios todavía").estado).toBe("rojo");
    expect(estadoDeMaleta("garantia", "Por confirmar").estado).toBe("rojo");
    expect(estadoDeMaleta("garantia", "Garantía de satisfacción").estado).toBe("ambar");
    expect(estadoDeMaleta("diferenciales", "Excelente calidad, atención personalizada y los mejores precios del mercado.").estado).toBe("ambar");
    expect(estadoDeMaleta("garantia", COMPLETO.elementos.garantia).estado).toBe("verde");
  });

  it("un problema bien escrito que empieza por «no hay» no se toma por vacío", () => {
    const t = "No hay quien lave muebles a domicilio con garantía en la ciudad y la gente termina comprando otro sofá";
    expect(estadoDeMaleta("problema", t).estado).toBe("verde");
    expect(estadoDeMaleta("problema", "Falta de tiempo para limpiar el sofá con niños y mascotas en casa").estado).toBe("verde");
  });

  it("las objeciones cuentan también las respondidas en el estudio", () => {
    expect(estadoDeMaleta("objeciones", "", { objeciones: [{ objecion: "Caro", respuesta: "Menos que uno nuevo" }, { objecion: "Tarda", respuesta: "Una hora" }] }).estado).toBe("verde");
    expect(estadoDeMaleta("objeciones", "", { objeciones: [{ objecion: "Caro", respuesta: "" }] }).estado).toBe("ambar"); // escrita, pero sin su respuesta
  });

  it("detecta el relleno sin castigar lo concreto", () => {
    expect(esGenerico("Calidad, confianza y compromiso con nuestros clientes")).toBe(true);
    expect(esGenerico("Familias con niños que buscan sofás cómodos y resistentes en Panamá")).toBe(false);
  });
});

describe("el semáforo de un producto", () => {
  it("todas en verde: se puede anunciar", () => {
    const s = semaforoMaletas(COMPLETO);
    expect(s).toMatchObject({ estado: "verde", listo: true, faltan: [], flojas: [] });
    expect(s.maletas.map((m) => m.clave)).toEqual(["publico", "problema", "solucion", "diferenciales", "testimonios", "objeciones", "garantia"]);
    expect(s.aviso).toBe("Las 7 maletas están: se puede anunciar.");
  });

  it("si falta una, no se lanza; floja, se avisa pero se puede", () => {
    const sinTestimonio = semaforoMaletas({ ...COMPLETO, elementos: { ...COMPLETO.elementos, testimonios: "", garantia: "Garantía total" } });
    expect(sinTestimonio).toMatchObject({ estado: "rojo", listo: false, faltan: ["testimonios"], flojas: ["garantia"] });
    expect(sinTestimonio.aviso).toBe("Faltan los testimonios: si falta una maleta, no lances el anuncio.");
    const floja = semaforoMaletas({ ...COMPLETO, elementos: { ...COMPLETO.elementos, garantia: "Garantía total" } });
    expect(floja).toMatchObject({ estado: "ambar", listo: true });
    expect(floja.aviso).toBe("Se puede anunciar, pero conviene concretar la garantía.");
    expect(semaforoMaletas({ elementos: { ...COMPLETO.elementos, solucion: "", problema: "" } }).aviso).toBe("Faltan el problema y la solución: si falta una maleta, no lances el anuncio.");
    expect(semaforoMaletas({ elementos: { ...COMPLETO.elementos, solucion: "" } }).aviso).toMatch(/^Falta la solución:/);
    expect(semaforoMaletas(null)).toMatchObject({ estado: "rojo", listo: false });
    expect(semaforoMaletas(null).faltan).toHaveLength(7);
  });

  it("un estudio aprobado con los elementos de antes se lee por alias (sin reescribir la fila)", () => {
    const viejo = {
      productos: {
        lavado: {
          elementos: {
            cliente: "Familias con niños y mascotas en Ciudad de Panamá, de ingreso medio, que viven en apartamentos.",
            dolor: "Manchas y olores en el sofá que no salen con productos del supermercado ni con agua.",
            deseo: "Sofá limpio", alternativas: "Hacerlo uno mismo",
            diferenciador: "Seca en cuatro horas y trae protector antimanchas incluido sin costo extra.",
            objeciones: "¿Daña la tela? ¿Cuánto tarda? ¿Hay que mover los muebles de la sala?",
            confianza: "Garantía de 15 días: si la mancha vuelve, regresamos sin costo.",
          },
        },
      },
    };
    const faltan = maletasQueFaltan(viejo, "lavado");
    // Público, problema, diferenciales y objeciones salen del estudio de antes; la garantía, de «confianza».
    expect(faltan.map((m) => m.clave)).toEqual(["solucion", "testimonios"]);
    expect(faltan.find((m) => m.clave === "testimonios")).toMatchObject({ estado: "rojo", delCliente: true });
    expect(maletasQueFaltan(viejo, "otro")).toHaveLength(7);
  });
});

describe("el resumen y la tarea para el cliente", () => {
  const catalogo = [{ id: "a", nombre: "Lavado" }, { id: "b", nombre: "Alfombras" }, { id: "c", nombre: "Inactivo", activo: false }];

  it("un renglón por producto activo, con lo que sólo da el cliente aparte", () => {
    const estudio = { productos: { a: COMPLETO, b: { elementos: { ...COMPLETO.elementos, testimonios: "", garantia: "" } } } };
    const r = resumenDeMaletas(estudio, catalogo);
    expect(r).toMatchObject({ listos: 1, total: 2 });
    expect(r.productos.map((p) => [p.id, p.estado, p.delCliente])).toEqual([["a", "verde", []], ["b", "rojo", ["testimonios", "garantia"]]]);
    expect(resumenDeMaletas(null, catalogo).productos.every((p) => p.sinEstudio && p.estado === "rojo")).toBe(true);
  });

  it("la tarea lleva el mensaje listo y sólo lo que es del cliente", () => {
    const t = tareaParaElCliente({ marca: "Dcasa", producto: "Lavado", claves: ["testimonios", "garantia", "problema"] });
    expect(t.title).toBe("Pedirle a Dcasa los testimonios y la garantía de «Lavado»");
    expect(t.description).toContain("Hola, equipo de Dcasa.");
    expect(t.description).toContain("testimonios reales");
    expect(t.description).toContain("qué garantía ofrecen");
    expect(t.description).not.toMatch(/problema/i);
    expect(tareaParaElCliente({ claves: ["problema"] })).toBeNull();
    expect(avisoDeMaletas([], [])).toMatch(/se puede anunciar/);
  });
});
