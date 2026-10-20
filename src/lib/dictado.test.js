import { describe, it, expect, beforeEach } from "vitest";
import { unirDictado, leerResultados, crearDictado, MAX_REENCENDIDOS_VACIOS, SESION_CORTA_MS } from "./dictado";

// ============================================================
// El dictado continuo, con un SpeechRecognition de mentira
//
// Lo que se cuida: que no se corte a la primera pausa (el navegador lo
// apaga y se vuelve a encender), que cada frase entre UNA vez aunque se
// reencienda, que lo provisional se vea y se reemplace, y que no se quede
// en un bucle si el navegador no deja escuchar.
// ============================================================

let sesiones;
let reloj;
class SRFalso {
  constructor() { this.parado = false; sesiones.push(this); }
  start() { if (this.falla) throw new Error("no"); }
  stop() { this.parado = true; }
  // Ayudas para la prueba: lo que haría el navegador.
  oye(resultados, resultIndex = 0) {
    this.onresult?.({ resultIndex, results: resultados.map(([t, isFinal]) => Object.assign([{ transcript: t }], { isFinal })) });
  }
  acaba() { this.onend?.(); }
  falla_(error) { this.onerror?.({ error }); }
}

const montar = () => {
  const log = { finales: [], provisional: [], estado: [], errores: [] };
  const d = crearDictado({
    SR: SRFalso, ahora: () => reloj,
    alFinal: (t) => log.finales.push(t), alProvisional: (t) => log.provisional.push(t),
    alEstado: (e) => log.estado.push(e), alError: (m) => log.errores.push(m),
  });
  return { d, log };
};

beforeEach(() => { sesiones = []; reloj = 0; });

describe("juntar lo dictado con lo escrito", () => {
  it("un espacio entre medias, nunca dos; nada si no hay nada", () => {
    expect(unirDictado("", "hola")).toBe("hola");
    expect(unirDictado("Hola", "qué tal")).toBe("Hola qué tal");
    expect(unirDictado("Hola ", "qué tal")).toBe("Hola qué tal");
    expect(unirDictado("Hola", "   ")).toBe("Hola");
    expect(unirDictado("   ", " uno  dos ")).toBe("uno dos");
  });
});

describe("leer un evento de resultados", () => {
  it("cada frase final se entrega una vez; lo provisional se junta y se reemplaza", () => {
    const vistos = new Set();
    const r = (pares) => pares.map(([t, isFinal]) => Object.assign([{ transcript: t }], { isFinal }));
    expect(leerResultados(r([["hola ", false]]), 0, vistos)).toEqual({ final: "", provisional: "hola" });
    expect(leerResultados(r([["hola qué tal", true], ["y", false]]), 0, vistos)).toEqual({ final: "hola qué tal", provisional: "y" });
    // El navegador vuelve a mandar la frase cerrada en la lista: no se repite.
    expect(leerResultados(r([["hola qué tal", true], ["y el reel", true]]), 1, vistos)).toEqual({ final: "y el reel", provisional: "" });
  });
});

describe("el dictado", () => {
  it("se configura para seguir escuchando y enseñar lo provisional", () => {
    const { d, log } = montar();
    d.empezar();
    expect(sesiones[0]).toMatchObject({ continuous: true, interimResults: true, lang: "es-PA" });
    expect(log.estado).toEqual([true]);
    expect(d.escuchando).toBe(true);
  });

  it("si el navegador lo corta solo, se vuelve a encender sin repetir nada", () => {
    const { d, log } = montar();
    d.empezar();
    sesiones[0].oye([["primera frase", true]]);
    reloj = 5000;
    sesiones[0].acaba(); // Chrome tras un silencio
    expect(sesiones).toHaveLength(2);
    expect(d.escuchando).toBe(true);
    sesiones[1].oye([["segunda frase", true]]);
    expect(log.finales).toEqual(["primera frase", "segunda frase"]);
    expect(log.estado).toEqual([true]); // no parpadea
  });

  it("«sin voz» no es un error: sigue escuchando", () => {
    const { d, log } = montar();
    d.empezar();
    sesiones[0].falla_("no-speech");
    reloj = 8000;
    sesiones[0].acaba();
    expect(d.escuchando).toBe(true);
    expect(log.errores).toEqual([]);
  });

  it("parar: la frase que se estaba diciendo todavía entra; después, nada", () => {
    const { d, log } = montar();
    d.empezar();
    sesiones[0].oye([["lo que digo", false]]);
    d.parar();
    expect(log.estado).toEqual([true, false]);
    expect(sesiones[0].parado).toBe(true);
    sesiones[0].oye([["lo que digo al final", true]]);
    sesiones[0].acaba();
    expect(log.finales).toEqual(["lo que digo al final"]);
    expect(sesiones).toHaveLength(1); // no se vuelve a encender
    sesiones[0].oye([["fantasma", true]], 1);
    expect(log.finales).toEqual(["lo que digo al final"]);
  });

  it("cortar (al enviar): no entra nada más, ni la frase tardía", () => {
    const { d, log } = montar();
    d.empezar();
    sesiones[0].oye([["provisional", false]]);
    d.cortar();
    sesiones[0].oye([["tardía", true]]);
    expect(log.finales).toEqual([]);
    expect(log.provisional.at(-1)).toBe("");
  });

  it("sin permiso para y lo dice", () => {
    const { d, log } = montar();
    d.empezar();
    sesiones[0].falla_("not-allowed");
    expect(d.escuchando).toBe(false);
    expect(log.errores[0]).toMatch(/Permiso de micrófono/);
    sesiones[0].acaba();
    expect(sesiones).toHaveLength(1);
  });

  it("si se corta enseguida una y otra vez sin oír nada, para en vez de quedarse en un bucle", () => {
    const { d, log } = montar();
    d.empezar();
    for (let i = 0; i < MAX_REENCENDIDOS_VACIOS; i++) {
      reloj += SESION_CORTA_MS / 3;
      sesiones.at(-1).acaba();
    }
    expect(d.escuchando).toBe(false);
    expect(sesiones).toHaveLength(MAX_REENCENDIDOS_VACIOS);
    expect(log.errores[0]).toMatch(/se detuvo/);
  });

  it("un corte tras hablar no cuenta para el tope: dictar un rato largo no lo apaga", () => {
    const { d } = montar();
    d.empezar();
    for (let i = 0; i < MAX_REENCENDIDOS_VACIOS * 3; i++) {
      sesiones.at(-1).oye([[`frase ${i}`, true]]);
      reloj += 200;
      sesiones.at(-1).acaba();
    }
    expect(d.escuchando).toBe(true);
  });

  it("si no puede arrancar, lo dice", () => {
    class Roto extends SRFalso { start() { throw new Error("ocupado"); } }
    const errores = [];
    const d = crearDictado({ SR: Roto, alFinal: () => {}, alError: (m) => errores.push(m) });
    d.empezar();
    expect(d.escuchando).toBe(false);
    expect(errores).toEqual(["No se pudo iniciar el dictado."]);
  });
});
