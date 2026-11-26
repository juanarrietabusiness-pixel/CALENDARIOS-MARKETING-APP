import { describe, it, expect } from "vitest";
import { conFondoContinuo, movimientoDeImagen } from "./motorVideo.js";
import { validarGuion } from "./videoEscenas.js";

// YouTube, fase 3 (26-nov-2026): cada escena reiniciaba el «Ken Burns» de su fondo y se veía un salto. Las escenas
// seguidas con el MISMO fondo son una sección: el movimiento va de punta a punta y la transición, al cambiar de sección.

const fondo = (archivo) => ({ tipo: "imagen", id: "fondo", archivo, encuadre: "completo", recorte: "cubrir", movimiento: "acercar", animacion: { entrada: "aparece" } });
const escena = (id, archivo, transicion = { tipo: "barrido", dur: 0.3 }) => ({ id, habla: "", capas: [fondo(archivo), { tipo: "texto", id: "t", texto: id }], transicion });
const linea = { escenas: [{ desde: 0, hasta: 4 }, { desde: 4, hasta: 8 }, { desde: 8, hasta: 12 }, { desde: 12, hasta: 16 }] };
const guion = { cancion: { archivo: "c", duracion: 16 }, escenas: [escena("a", "img1"), escena("b", "img1"), escena("c", "img1", { tipo: "golpe", dur: 0.3 }), escena("d", "img2")] };
// Como en el diseño real: la misma imagen con «alejar» en la escena de en medio.
guion.escenas[1].capas[0].movimiento = "alejar";

describe("el fondo continuo por sección", () => {
  it("las escenas seguidas con el mismo fondo son una sección: su fondo dura toda la sección y sólo entra en la primera", () => {
    const g = conFondoContinuo(guion, linea);
    expect(g.escenas[0].capas[0].continua).toEqual({ desde: 0, hasta: 12 });
    expect(g.escenas[2].capas[0].continua).toEqual({ desde: 0, hasta: 12 });
    expect(g.escenas[0].capas[0].animacion.entrada).toBe("aparece");
    // UN movimiento para toda la sección: el de su primera escena.
    expect(g.escenas[1].capas[0].movimiento).toBe("acercar");
    expect(g.escenas[1].capas[0].animacion.entrada).toBe("ninguna");
    // Dentro de la sección, lo que movería el cuadro entero pasa a fundido; al cambiar de sección, la suya.
    expect(g.escenas[1].transicion.tipo).toBe("fundido");
    expect(g.escenas[2].transicion.tipo).toBe("fundido");
    expect(g.escenas[3].transicion.tipo).toBe("barrido");
    expect(g.escenas[3].capas[0].continua).toBeUndefined();
    // Lo que no es el fondo, igual.
    expect(g.escenas[1].capas[1]).toBe(guion.escenas[1].capas[1]);
    // Se recuerda por línea de tiempo (se llama en cada cuadro).
    expect(conFondoContinuo(guion, linea)).toBe(g);
  });

  it("el movimiento no salta entre escenas de una sección", () => {
    // Al final de la escena «a» (t = 4) y al principio de «b» (t = 4), la misma escala: 4/12 de la sección.
    const p = 4 / 12;
    expect(movimientoDeImagen("acercar", p).escala).toBeCloseTo(movimientoDeImagen("acercar", p).escala, 6);
    expect(movimientoDeImagen("acercar", 1).escala).toBeGreaterThan(movimientoDeImagen("acercar", p).escala);
  });

  it("sin canción, apagado salvo que el estilo lo pida; con canción, «false» lo apaga", () => {
    const sinCancion = { ...guion, cancion: undefined };
    expect(conFondoContinuo(sinCancion, linea)).toBe(sinCancion);
    const pedido = { ...sinCancion, estilo: { fondoContinuo: true } };
    expect(conFondoContinuo(pedido, { ...linea }).escenas[1].capas[0].continua).toBeTruthy();
    const apagado = { ...guion, estilo: { fondoContinuo: false } };
    expect(conFondoContinuo(apagado, linea)).toBe(apagado);
  });

  it("el guion lo admite en el estilo (y no lo escribe si no se dice)", () => {
    const base = { version: 1, formatos: ["9:16"], escenas: [{ id: "a", tipo: "gancho", habla: "hola mundo", capas: [] }] };
    expect(validarGuion({ ...base, estilo: { fondoContinuo: true } }).guion.estilo.fondoContinuo).toBe(true);
    expect("fondoContinuo" in validarGuion(base).guion.estilo).toBe(false);
  });
});

describe("el estilo rellena lo que no se escribió (no lo de siempre)", async () => {
  const { rellenarConEstilo } = await import("./estilosVideo.js");
  const estilo = {
    id: "ev-56a686be933b", nombre: "Doré", texto: { rol: "gigante", entrada: "golpe", pulso: true, mayusculas: true, porPalabra: true, color: "claro" },
    apoyo: { color: "claro" }, etiqueta: { color: "acento" },
    fondo: { imagen: true, tratamiento: "byn", oscurecer: 0.5, recorte: "cubrir", movimientos: ["acercar"] },
  };
  const escena = {
    id: "l9", habla: "nos unió a la vid", capas: [
      { tipo: "imagen", id: "fondo", encuadre: "completo", archivo: "x" },
      { tipo: "texto", id: "t1", rol: "gigante", texto: "NOS UNIÓ A LA VID" },
      { tipo: "texto", id: "t2", rol: "apoyo", texto: "somos santos" },
      { tipo: "texto", id: "cita", rol: "etiqueta", texto: "Efesios 1:4", color: "texto" },
    ],
  };

  it("lo omitido toma el valor del estilo; lo escrito manda", () => {
    const { guion, n } = rellenarConEstilo({ escenas: [escena] }, estilo);
    const [img, gig, apoyo, cita] = guion.escenas[0].capas;
    expect(img).toMatchObject({ tam: 1, recorte: "cubrir", oscurecer: 0.5, tratamiento: "byn", movimiento: "acercar" });
    expect(gig).toMatchObject({ animacion: { entrada: "golpe" }, pulso: true, mayusculas: true, porPalabra: true, color: "claro" });
    expect(apoyo.color).toBe("claro");
    expect(cita.color).toBe("texto");
    expect(n).toBeGreaterThan(8);
  });

  it("las escenas ya guardadas tal cual no se tocan", () => {
    const intactas = new Set([JSON.stringify(escena)]);
    expect(rellenarConEstilo({ escenas: [escena] }, estilo, { intactas }).n).toBe(0);
  });
});
