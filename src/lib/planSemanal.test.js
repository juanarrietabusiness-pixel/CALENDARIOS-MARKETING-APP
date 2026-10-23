import { describe, it, expect } from "vitest";
import { semanaDelCliente, lineasDeLaSemana, semanaParaGuardar, semanaEstandar, semanaPropia, conFormato, valorDeFormato, nombreDeFormato, nombreCortoDeTipo } from "./planSemanal.js";
import { plantillasDisponibles, plantillaDelCliente, configDeFormatos, lineaDelPlan } from "./plantillasPlan.js";
import { casillasConPlantilla } from "./loteMes.js";
import { publicacionDePieza } from "./loteAnuncios.js";

const lista = plantillasDisponibles([]);

describe("la semana de una empresa", () => {
  it("sin plan: el ritmo de la agencia, sin formato fijo", () => {
    const s = semanaDelCliente({ name: "Dcasa" }, lista);
    expect(s.conPlan).toBe(false);
    expect(s.dias[1]).toEqual([{ format: null, pilar: "anuncio" }]);
    expect(s.dias[0]).toEqual([]);
  });

  it("con plantilla: el tipo vacío es el del ritmo", () => {
    const s = semanaDelCliente({ planContenido: { plantilla: "seguidores-productos" } }, lista);
    expect(s.conPlan).toBe(true);
    expect(s.dias[2]).toEqual([{ format: "carrusel", pilar: "beneficios" }, { format: "reel", pilar: "humano" }]);
  });
});

describe("guardar lo editado en la barra", () => {
  const cliente = { name: "Dcasa" };

  it("la primera de cada día va al ritmo (tipo vacío en el plan); las demás llevan su tipo; el rostro es un reel", () => {
    const dias = semanaDelCliente(cliente, lista).dias;
    // Martes: productos en vez de beneficios, y un video con rostro de contenido humano.
    dias[2] = [{ format: "carrusel", pilar: "servicios" }, conFormato({ pilar: "humano" }, "rostro")];
    // Jueves: el educativo pasa al miércoles.
    dias[3] = [{ format: "carrusel", pilar: "educativo" }];
    dias[4] = [];
    const { planContenido, ritmoContenido } = semanaParaGuardar(cliente, lista, dias);
    expect(ritmoContenido).toMatchObject({ 1: "anuncio", 2: "servicios", 3: "educativo", 4: "", 0: "" });
    expect(planContenido.personalizada.dias[2]).toEqual([{ format: "carrusel", pilar: "" }, { format: "reel", pilar: "humano", rostro: true }]);
    // Un día sin formato fijo toma «post», lo que hacía el lote sin plan.
    expect(planContenido.personalizada.dias[1]).toEqual([{ format: "post", pilar: "" }]);
    expect(planContenido.linea).toMatch(/UGC \(guion para grabar\)/);
    // Lo guardado se vuelve a leer igual.
    const s = semanaDelCliente({ ...cliente, planContenido, ritmoContenido }, lista);
    expect(s.dias[2]).toEqual([{ format: "carrusel", pilar: "servicios" }, { format: "reel", pilar: "humano", rostro: true }]);
    expect(s.dias[4]).toEqual([]);
    expect(semanaPropia({ planContenido, ritmoContenido })).toBe(true);
  });

  it("el lote del mes lo toma: cada día sus formatos, el rostro marcado y la temporada sigue en la primera", () => {
    const dias = semanaDelCliente(cliente, lista).dias;
    dias[2] = [{ format: "carrusel", pilar: "servicios" }, conFormato({ pilar: "humano" }, "rostro")];
    const guardado = semanaParaGuardar(cliente, lista, dias);
    const formatos = configDeFormatos(plantillaDelCliente(guardado.planContenido, lista));
    const casillas = casillasConPlantilla({ year: 2026, month: 10, ritmo: guardado.ritmoContenido, formatos, dias: [2] });
    const martes = casillas.filter((c) => c.fecha === "2026-11-03");
    expect(martes).toEqual([
      { clave: "2026-11-03|0", fecha: "2026-11-03", formato: "carrusel", pilar: "servicios" },
      { clave: "2026-11-03|1", fecha: "2026-11-03", formato: "reel", pilar: "humano", rostro: true },
    ]);
  });

  it("volver al estándar quita la copia y el ritmo propio, y conserva la plantilla elegida", () => {
    expect(semanaEstandar({ planContenido: { plantilla: "ventas-productos", personalizada: { id: "cliente", nombre: "x", dias: {} } } }, lista))
      .toMatchObject({ planContenido: { plantilla: "ventas-productos", personalizada: null }, ritmoContenido: null });
    expect(semanaEstandar({}, lista)).toEqual({ planContenido: null, ritmoContenido: null });
    expect(semanaPropia({})).toBe(false);
  });

  it("la idea con rostro llega al calendario como reel con rostro, sin archivos (una idea para grabar)", () => {
    const p = publicacionDePieza({ id: "x", idea: { titulo: "Taller", brief: "B", guion: "[0–3 s] Hola", rostro: true, formato: "reel" } });
    expect(p).toMatchObject({ format: "reel", rostro: true, aprobacion: "idea", guion: "[0–3 s] Hola" });
  });

  it("lo que dice la barra", () => {
    const dias = semanaDelCliente({}, lista).dias;
    dias[2] = [{ format: "carrusel", pilar: "servicios" }, conFormato({ pilar: "humano" }, "rostro")];
    const g = semanaParaGuardar({}, lista, dias);
    expect(lineasDeLaSemana(g, lista)[2]).toEqual(["Productos · Carrusel", "Humano · UGC"]);
    expect(lineasDeLaSemana({}, lista)[1]).toEqual(["Anuncio"]);
  });

  it("los nombres que se ven", () => {
    expect(valorDeFormato({ format: "reel", rostro: true })).toBe("rostro");
    expect(nombreDeFormato({ format: "reel", rostro: true })).toBe("UGC");
    expect(conFormato({ format: "reel", rostro: true, pilar: "humano" }, "post")).toEqual({ format: "post", pilar: "humano" });
    expect(nombreCortoDeTipo("servicios")).toBe("Productos");
    expect(nombreCortoDeTipo("viral")).toBe("Humano");
    expect(lineaDelPlan(null)).toBe("");
  });
});
