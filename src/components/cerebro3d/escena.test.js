import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { iniciarCerebro3D } from "./escena";
import { armarGrafo, colorDeNota } from "../../lib/cerebroGrafo";

// ============================================================
// El lienzo del cerebro 3D, sin navegador
//
// No hay jsdom: se le da al lienzo un DOM de mentira que sólo apunta lo
// que se le pide (qué se dibujó, qué eventos escucha). Lo que se comprueba
// es la lógica que vive en él y que nadie ve leyendo el código: dónde cae
// cada nota en la pantalla, a cuál se llega con un toque, qué hace un
// arrastre, y que un vuelo termina con la nota en el centro.
// Que se VEA bien lo comprueba abrir la pantalla en un navegador.
// ============================================================

let cuadros; let rafPendiente; let ahoraFalso; let elementos; let dibujos;

function elemento(etiqueta) {
  const escucha = new Map();
  const hijos = [];
  return {
    etiqueta, hijos, escucha, hidden: false, style: { setProperty() {} }, dataset: {}, className: "", textContent: "",
    classList: { toggle() {} },
    setAttribute() {}, appendChild(h) { hijos.push(h); }, prepend(h) { hijos.unshift(h); }, remove() {},
    addEventListener(tipo, fn) { escucha.set(tipo, fn); },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    closest: () => null,
    getContext: () => contexto2d(),
    clientWidth: 800, clientHeight: 600, width: 0, height: 0,
  };
}
function contexto2d() {
  const base = { createRadialGradient: () => ({ addColorStop() {} }) };
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k] : (...a) => { dibujos.push([k, ...a]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

beforeEach(() => {
  cuadros = 0; rafPendiente = null; ahoraFalso = 1000; elementos = []; dibujos = [];
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", { hidden: false, createElement: (t) => { const e = elemento(t); elementos.push(e); return e; } });
  vi.stubGlobal("requestAnimationFrame", (fn) => { rafPendiente = fn; return ++cuadros; });
  vi.stubGlobal("cancelAnimationFrame", () => { rafPendiente = null; });
  vi.spyOn(performance, "now").mockImplementation(() => ahoraFalso);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** Avanza `ms` de reloj falso en cuadros de 16 ms, dibujando cada uno. */
function avanzar(ms) {
  for (let t = 0; t < ms; t += 16) {
    ahoraFalso += 16;
    const f = rafPendiente;
    if (!f) return;
    f(ahoraFalso);
  }
}

const respuesta = () => ({
  notas: [
    { id: "a", ruta: "a", titulo: "Ficha técnica", tipo: "ficha", grupo: "Ficha y cifras", d: 3, resumen: "", interna: false },
    { id: "b", ruta: "b", titulo: "Sofás", tipo: "marca", grupo: "Catálogo", d: 1, resumen: "", interna: false },
    { id: "c", ruta: "c", titulo: "Comedores", tipo: "marca", grupo: "Catálogo", d: 1, resumen: "", interna: false },
    { id: "d", ruta: "d", titulo: "Costos", tipo: "documento", grupo: "Finanzas", d: 1, resumen: "", interna: true },
    { id: "e", ruta: "e", titulo: "Plantilla", tipo: "maquetacion", grupo: "Prompt", d: 0, resumen: "", interna: false },
  ],
  enlaces: [[0, 1], [0, 2], [0, 3]],
  menciones: [],
});

function montar(extra = {}) {
  const host = elemento("div");
  const eventos = { elegidas: [], vacios: 0, hovers: [] };
  const escena = iniciarCerebro3D({
    host, colorDe: colorDeNota, visible: extra.visible ?? (() => true),
    etiquetas: extra.etiquetas ?? (() => []),
    onElegir: (n) => eventos.elegidas.push(n), onVacio: () => { eventos.vacios++; }, onHover: (n) => eventos.hovers.push(n),
  });
  const g = armarGrafo(respuesta());
  escena.setData(g.nodos, g.enlaces, { menciones: g.menciones });
  escena.start();
  avanzar(32);
  const lienzo = host.hijos.find((h) => h.etiqueta === "canvas");
  return { escena, g, host, eventos, lienzo };
}
const evento = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, shiftKey: false, preventDefault() {}, ...extra });

describe("dónde cae cada nota", () => {
  it("todas dentro de la pantalla, y la ficha —el centro del cerebro— cerca del medio", () => {
    const { escena, g } = montar();
    for (const n of g.nodos) {
      const p = escena.posEnPantalla(n.id);
      expect(p, n.titulo).not.toBeNull();
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(800);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(600);
    }
    const ficha = escena.posEnPantalla("a");
    expect(Math.hypot(ficha.x - 400, ficha.y - 300), "lo que conecta con todo queda al centro").toBeLessThan(180);
    escena.destroy();
  });

  it("una nota que no existe no tiene sitio", () => {
    const { escena } = montar();
    expect(escena.posEnPantalla("zzz")).toBeNull();
    escena.destroy();
  });

  it("el lienzo toma el tamaño de su contenedor", () => {
    const { escena, lienzo } = montar();
    expect(lienzo.width).toBe(800);
    expect(lienzo.height).toBe(600);
    escena.destroy();
  });
});

describe("elegir una nota con un toque", () => {
  it("pulsar encima de una nota la elige, con la tolerancia de un dedo", () => {
    const { escena, g, lienzo, eventos } = montar();
    const p = escena.posEnPantalla("b");
    lienzo.escucha.get("pointerdown")(evento(p.x, p.y));
    lienzo.escucha.get("pointerup")(evento(p.x, p.y));
    expect(eventos.elegidas.map((n) => n.id)).toEqual(["b"]);
    expect(escena.pickAt(p.x + 10, p.y)?.id, "un poco al lado, con el ratón").toBe("b");
    expect(escena.pickAt(p.x + 200, p.y + 200)).toBeNull();
    expect(g.nodos).toHaveLength(5);
    escena.destroy();
  });

  it("pulsar en el vacío avisa de que no hay nota", () => {
    const { escena, lienzo, eventos } = montar();
    lienzo.escucha.get("pointerdown")(evento(5, 5));
    lienzo.escucha.get("pointerup")(evento(5, 5));
    expect(eventos.elegidas).toEqual([]);
    expect(eventos.vacios).toBe(1);
    escena.destroy();
  });

  it("un arrastre no es un clic: gira el cerebro y no elige nada", () => {
    const { escena, lienzo, eventos } = montar();
    const p = escena.posEnPantalla("b");
    const antes = escena.camara.theta;
    lienzo.escucha.get("pointerdown")(evento(p.x, p.y));
    lienzo.escucha.get("pointermove")(evento(p.x + 120, p.y + 10));
    lienzo.escucha.get("pointerup")(evento(p.x + 120, p.y + 10));
    avanzar(400);
    expect(eventos.elegidas).toEqual([]);
    expect(eventos.vacios).toBe(0);
    expect(escena.camara.theta, "la inercia aplica el giro poco a poco").not.toBe(antes);
    escena.destroy();
  });

  it("con el dedo el margen para un clic es mayor: 8 px de movimiento todavía es un toque", () => {
    const { escena, lienzo, eventos } = montar();
    const p = escena.posEnPantalla("c");
    lienzo.escucha.get("pointerdown")(evento(p.x, p.y, { pointerType: "touch" }));
    lienzo.escucha.get("pointerup")(evento(p.x + 8, p.y, { pointerType: "touch" }));
    expect(eventos.elegidas.map((n) => n.id)).toEqual(["c"]);
    escena.destroy();
  });

  it("una nota que los filtros esconden no se puede elegir", () => {
    let ver = () => true;
    const { escena, g } = montar({ visible: (n) => ver(n) });
    const p = escena.posEnPantalla("b");
    expect(escena.pickAt(p.x, p.y)?.id).toBe("b");
    ver = (n) => n.id !== "b";
    escena.refresh();
    avanzar(32);
    expect(escena.pickAt(p.x, p.y)?.id ?? null).not.toBe("b");
    expect(g.nodos).toHaveLength(5);
    escena.destroy();
  });
});

describe("la cámara", () => {
  it("volar a una nota la deja en el centro, y sólo cuando termina el vuelo", () => {
    const { escena, g } = montar();
    escena.fly(g.nodos[1]);
    avanzar(100);
    const enCamino = escena.posEnPantalla("b");
    avanzar(1000);
    const llegada = escena.posEnPantalla("b");
    expect(Math.hypot(llegada.x - 400, llegada.y - 300)).toBeLessThan(3);
    expect(Math.hypot(enCamino.x - 400, enCamino.y - 300)).toBeGreaterThan(Math.hypot(llegada.x - 400, llegada.y - 300));
    escena.destroy();
  });

  it("con una tarjeta tapando la derecha, el cerebro se centra en el hueco que queda", () => {
    const { escena, g } = montar();
    escena.setInsets(0, 300);
    escena.fly(g.nodos[1]);
    avanzar(1100);
    const p = escena.posEnPantalla("b");
    expect(p.x, "el centro del hueco: (0 + 500) / 2").toBeCloseTo(250, 0);
    escena.setInsets(0, 0);
    expect(escena.posEnPantalla("b").x).toBeCloseTo(400, 0);
    escena.destroy();
  });

  it("volver a la vista inicial devuelve la cámara a su sitio", () => {
    const { escena, g } = montar();
    const inicial = { ...escena.camara };
    escena.fly(g.nodos[3]);
    avanzar(1000);
    expect(escena.camara.tx).not.toBe(0);
    escena.reset();
    avanzar(1000);
    expect(escena.camara.tx).toBeCloseTo(inicial.tx, 3);
    expect(escena.camara.dist).toBeCloseTo(inicial.dist, 3);
    escena.destroy();
  });

  it("acercar y girar por las flechas y los botones respetan los límites", () => {
    const { escena } = montar();
    for (let i = 0; i < 60; i++) escena.zoomBy(0.5);
    expect(escena.camara.dist).toBeCloseTo(0.35, 6);
    for (let i = 0; i < 60; i++) escena.zoomBy(2);
    expect(escena.camara.dist).toBeCloseTo(9, 6);
    escena.rotateBy(0, -50);
    expect(escena.camara.phi).toBeCloseTo(0.3, 6);
    escena.destroy();
  });

  it("gira sola y se para cuando se le dice; volver a encenderla la hace girar otra vez", () => {
    const { escena } = montar();
    const t0 = escena.camara.theta;
    avanzar(2000);
    expect(escena.camara.theta, "gira sola").toBeLessThan(t0);
    expect(escena.spin(false)).toBe(false);
    const t1 = escena.camara.theta;
    avanzar(2000);
    expect(escena.camara.theta).toBe(t1);
    expect(escena.spin(true)).toBe(true);
    avanzar(2000);
    expect(escena.camara.theta).toBeLessThan(t1);
    escena.destroy();
  });

  it("tocarla detiene el giro automático, y no vuelve hasta que pasan unos segundos", () => {
    const { escena, lienzo } = montar();
    avanzar(200);
    lienzo.escucha.get("pointerdown")(evento(5, 5));
    lienzo.escucha.get("pointerup")(evento(5, 5));
    const t = escena.camara.theta;
    avanzar(2000);
    expect(escena.camara.theta).toBe(t);
    avanzar(4000);
    expect(escena.camara.theta).toBeLessThan(t);
    escena.destroy();
  });

  it("con una nota elegida no gira sola", () => {
    const { escena, g } = montar();
    escena.setFocus(g.nodos[1], null, null);
    const t = escena.camara.theta;
    avanzar(8000);
    expect(escena.camara.theta).toBe(t);
    escena.destroy();
  });

  it("la rueda acerca y no deja que la página se desplace", () => {
    const { escena, lienzo } = montar();
    const d = escena.camara.dist;
    const e = { deltaY: -300, preventDefault: vi.fn() };
    lienzo.escucha.get("wheel")(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(escena.camara.dist).toBeLessThan(d);
    escena.destroy();
  });
});

describe("el dibujo", () => {
  it("cada cuadro dibuja algo, y el bucle se para al destruir", () => {
    const { escena } = montar();
    dibujos.length = 0;
    avanzar(48);
    expect(dibujos.some(([k]) => k === "drawImage")).toBe(true);
    expect(dibujos.some(([k]) => k === "clearRect")).toBe(true);
    escena.destroy();
    expect(rafPendiente).toBeNull();
  });

  it("una pestaña oculta no dibuja", () => {
    const { escena } = montar();
    document.hidden = true;
    dibujos.length = 0;
    avanzar(80);
    expect(dibujos).toEqual([]);
    escena.destroy();
  });

  it("las notas que los filtros esconden no se dibujan como núcleos", () => {
    const todas = montar();
    dibujos.length = 0; avanzar(16);
    const conTodas = dibujos.filter(([k]) => k === "drawImage").length;
    todas.escena.destroy();
    const pocas = montar({ visible: (n) => n.id === "a" });
    dibujos.length = 0; avanzar(16);
    expect(dibujos.filter(([k]) => k === "drawImage").length).toBeLessThan(conTodas);
    pocas.escena.destroy();
  });

  it("las internas llevan su anillo; las demás no", () => {
    const { escena } = montar();
    dibujos.length = 0; avanzar(16);
    const anillos = dibujos.filter(([k]) => k === "arc").length;
    expect(anillos, "el de «Costos», que es interna").toBeGreaterThanOrEqual(1);
    escena.destroy();
  });

  it("una señal por cada sinapsis de la nota se dibuja mientras dura; una nota sin conexiones no lanza ninguna", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // las chispas sueltas del cerebro, iguales en las dos pasadas
    const cuadro = (i) => {
      const { escena } = montar();
      escena.pulseFrom(i, 3);
      dibujos.length = 0; avanzar(16);
      const n = dibujos.filter(([k]) => k === "drawImage").length;
      escena.destroy();
      return n;
    };
    expect(cuadro(0), "la ficha tiene tres sinapsis: tres señales").toBe(cuadro(4) + 3);
  });

  it("las señales duran menos de un segundo: pasado ese rato ya no queda ninguna de las lanzadas", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { escena } = montar();
    escena.pulseFrom(0, 3);
    avanzar(1500);
    dibujos.length = 0; avanzar(16);
    const trasUnRato = dibujos.filter(([k]) => k === "drawImage").length;
    escena.destroy();
    const sin = montar();
    dibujos.length = 0; avanzar(16);
    const base = dibujos.filter(([k]) => k === "drawImage").length;
    sin.escena.destroy();
    expect(trasUnRato).toBeLessThanOrEqual(base + 1); // como mucho una chispa suelta más
  });
});

describe("las etiquetas", () => {
  it("una por cada nota que se pide, colocada con un translate; las que sobran, ocultas", () => {
    let quieren = ["a", "b"];
    let g = null;
    const { escena, host, g: grafo } = montar({ etiquetas: () => (g ? quieren.map((id) => g.nodos.find((n) => n.id === id)) : []) });
    g = grafo;
    avanzar(32);
    const capa = host.hijos.find((h) => h.className === "cg-etiquetas");
    const botones = capa.hijos;
    expect(botones).toHaveLength(2);
    expect(botones.map((b) => b.textContent)).toEqual(["Ficha técnica", "Sofás"]);
    expect(botones[0].style.transform).toMatch(/^translate\(-?\d+px, -?\d+px\)$/);
    quieren = ["a"];
    avanzar(32);
    expect(botones[1].hidden).toBe(true);
    escena.destroy();
  });

  it("una etiqueta que pisaría a otra se deja fuera, salvo la de la nota elegida", () => {
    let g = null;
    const { escena, host, g: grafo } = montar({ etiquetas: () => (g ? g.nodos.slice(0, 2) : []) });
    g = grafo;
    // Las dos notas en el mismo punto: se pisan.
    escena.fly(g.nodos[0]);
    avanzar(1000);
    escena.zoomBy(9);
    avanzar(100);
    const capa = host.hijos.find((h) => h.className === "cg-etiquetas");
    const visibles = capa.hijos.filter((b) => !b.hidden).length;
    expect(visibles).toBeGreaterThanOrEqual(1);
    escena.destroy();
  });
});

describe("guardar los sitios entre visitas", () => {
  it("sin almacenamiento del navegador no rompe nada", () => {
    expect(() => montar({}).escena.destroy()).not.toThrow();
  });

  it("con almacenamiento, la segunda vez las notas quedan donde estaban", () => {
    const guardado = new Map();
    vi.stubGlobal("localStorage", { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) });
    const g = armarGrafo(respuesta());
    const abrir = () => {
      const host = elemento("div");
      const e = iniciarCerebro3D({ host, colorDe: colorDeNota, visible: () => true });
      e.setData(g.nodos, g.enlaces, { menciones: [], clave: "cliente-1" });
      e.start(); avanzar(16);
      return e;
    };
    const uno = abrir();
    const antes = g.nodos.map((n) => uno.posEnPantalla(n.id));
    uno.destroy();
    expect([...guardado.keys()]).toEqual(["cerebro3d.sitios.cliente-1"]);
    const dos = abrir();
    g.nodos.forEach((n, i) => expect(dos.posEnPantalla(n.id).x).toBeCloseTo(antes[i].x, 0));
    dos.destroy();
  });

  it("los sitios guardados de otra versión de la receta se ignoran", () => {
    const guardado = new Map([["cerebro3d.sitios.x", JSON.stringify({ v: 99, p: { a: [9, 9, 9] } })]]);
    vi.stubGlobal("localStorage", { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) });
    const g = armarGrafo(respuesta());
    const e = iniciarCerebro3D({ host: elemento("div"), colorDe: colorDeNota, visible: () => true });
    e.setData(g.nodos, g.enlaces, { clave: "x" });
    e.start(); avanzar(16);
    const p = e.posEnPantalla("a");
    expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(800);
    e.destroy();
  });
});
