import { describe, it, expect } from "vitest";
import {
  camaraInicial, posicion, base, foco, proyectar, proyectarLote, girar, acercar, factorDeRueda, anguloDeArrastre,
  desplazar, entre, haciaNota, pixeles, niebla, PHI_MIN, PHI_MAX, DIST_MIN, DIST_MAX,
} from "./camara3d";

// ============================================================
// La cámara del cerebro 3D
//
// Sustituye a OrbitControls de three.js: lo que importa es que un punto
// caiga donde debe en la pantalla y que los límites sean los de siempre.
// ============================================================

const cerca = (a, b, d = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(d);

describe("la cámara de partida", () => {
  it("mira al centro desde (1,95; 0,8; 2,75), como Agents Office", () => {
    const c = camaraInicial();
    const [x, y, z] = posicion(c);
    cerca(x, 1.95); cerca(y, 0.8); cerca(z, 2.75);
  });

  it("sus ejes son perpendiculares y unitarios", () => {
    const b = base(camaraInicial());
    const punto = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    for (const e of [b.adelante, b.derecha, b.arriba]) cerca(punto(e, e), 1);
    cerca(punto(b.adelante, b.derecha), 0); cerca(punto(b.adelante, b.arriba), 0); cerca(punto(b.derecha, b.arriba), 0);
  });
});

describe("proyectar", () => {
  const c = camaraInicial();
  const b = base(c);
  const f = foco(600);

  it("lo que mira la cámara cae en el centro de la pantalla", () => {
    const p = proyectar([c.tx, c.ty, c.tz], b, f, 800, 600);
    cerca(p.x, 400, 1e-6); cerca(p.y, 300, 1e-6);
    cerca(p.z, c.dist, 1e-9);
  });

  it("lo que está a la derecha cae a la derecha, y lo de arriba, arriba (y crece hacia abajo)", () => {
    const d = b.derecha; const u = b.arriba;
    const der = proyectar([d[0] * 0.5, d[1] * 0.5, d[2] * 0.5], b, f, 800, 600);
    const arr = proyectar([u[0] * 0.5, u[1] * 0.5, u[2] * 0.5], b, f, 800, 600);
    expect(der.x).toBeGreaterThan(400);
    expect(arr.y).toBeLessThan(300);
  });

  it("lo lejano se ve más pequeño: el mismo desvío, menos píxeles", () => {
    const d = b.derecha; const a = b.adelante;
    const cercano = proyectar([d[0] * 0.5 - a[0] * 0.5, d[1] * 0.5 - a[1] * 0.5, d[2] * 0.5 - a[2] * 0.5], b, f, 800, 600);
    const lejano = proyectar([d[0] * 0.5 + a[0] * 1.5, d[1] * 0.5 + a[1] * 1.5, d[2] * 0.5 + a[2] * 1.5], b, f, 800, 600);
    expect(cercano.x - 400).toBeGreaterThan(lejano.x - 400);
  });

  it("lo que queda detrás de la cámara no se proyecta", () => {
    const a = b.adelante;
    expect(proyectar([b.pos[0] - a[0], b.pos[1] - a[1], b.pos[2] - a[2]], b, f, 800, 600)).toBeNull();
  });

  it("el lote da lo mismo que punto por punto, y 0 de profundidad detrás de la cámara", () => {
    const pts = new Float32Array([0, 0, 0, 0.4, 0.2, -0.3, -1, 0.5, 0.9, b.pos[0] - b.adelante[0], b.pos[1] - b.adelante[1], b.pos[2] - b.adelante[2]]);
    const X = new Float32Array(4); const Y = new Float32Array(4); const Z = new Float32Array(4);
    proyectarLote(pts, 4, b, f, 800, 600, X, Y, Z);
    for (let i = 0; i < 3; i++) {
      const p = proyectar([pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]], b, f, 800, 600);
      cerca(X[i], p.x, 1e-3); cerca(Y[i], p.y, 1e-3); cerca(Z[i], p.z, 1e-5);
    }
    expect(Z[3]).toBe(0);
  });

  it("el foco crece con el alto: es lo que fija cuánto se ve", () => {
    expect(foco(1200)).toBeCloseTo(foco(600) * 2, 6);
  });
});

describe("girar, acercar y desplazar", () => {
  const c = camaraInicial();

  it("girar cambia theta sin límite, pero phi nunca llega a los polos", () => {
    expect(girar(c, 10, 0).theta).toBeCloseTo(c.theta + 10, 9);
    expect(girar(c, 0, -10).phi).toBe(PHI_MIN);
    expect(girar(c, 0, 10).phi).toBe(PHI_MAX);
  });

  it("acercar respeta los límites de distancia", () => {
    expect(acercar(c, 0.0001).dist).toBe(DIST_MIN);
    expect(acercar(c, 1000).dist).toBe(DIST_MAX);
    expect(acercar(c, 0.5).dist).toBeCloseTo(c.dist * 0.5, 9);
  });

  it("la rueda hacia arriba acerca y hacia abajo aleja, y una vuelta y su contraria se anulan", () => {
    expect(factorDeRueda(-100)).toBeLessThan(1);
    expect(factorDeRueda(100)).toBeGreaterThan(1);
    expect(factorDeRueda(-100) * factorDeRueda(100)).toBeCloseTo(1, 9);
    expect(factorDeRueda(0)).toBe(1);
  });

  it("arrastrar la altura de la pantalla gira 0,55 de vuelta", () => {
    expect(anguloDeArrastre(600, 600)).toBeCloseTo(2 * Math.PI * 0.55, 9);
    expect(anguloDeArrastre(0, 600)).toBe(0);
    expect(Number.isFinite(anguloDeArrastre(10, 0))).toBe(true);
  });

  it("desplazar mueve el objetivo en el plano de la pantalla, no hacia dentro", () => {
    const b = base(c);
    const m = desplazar(c, 100, 0, foco(600));
    const d = [m.tx - c.tx, m.ty - c.ty, m.tz - c.tz];
    const punto = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    cerca(punto(d, b.adelante), 0, 1e-9);
    expect(punto(d, b.derecha)).toBeLessThan(0); // arrastrar a la derecha lleva la escena a la derecha
    expect(m.dist).toBe(c.dist);
  });
});

describe("volar", () => {
  const a = camaraInicial();

  it("entre dos cámaras: en 0 la primera, en 1 la segunda, y a mitad de camino ya ha hecho más de la mitad", () => {
    const b = { ...a, dist: 1, tx: 1 };
    expect(entre(a, b, 0)).toEqual({ theta: a.theta, phi: a.phi, dist: a.dist, tx: 0, ty: 0, tz: 0 });
    const fin = entre(a, b, 1);
    cerca(fin.dist, 1); cerca(fin.tx, 1);
    expect(entre(a, b, 0.5).tx).toBeGreaterThan(0.5); // sale rápido y llega despacio
  });

  it("k fuera de rango se recorta", () => {
    expect(entre(a, { ...a, tx: 1 }, 5).tx).toBe(1);
    expect(entre(a, { ...a, tx: 1 }, -5).tx).toBe(0);
  });

  it("haciaNota deja la nota en el centro sin cambiar desde dónde se mira", () => {
    const n = haciaNota(a, [0.3, -0.2, 0.5], 2.1);
    expect([n.tx, n.ty, n.tz]).toEqual([0.3, -0.2, 0.5]);
    expect(n.theta).toBe(a.theta);
    expect(n.phi).toBe(a.phi);
    expect(n.dist).toBe(2.1);
    const p = proyectar([0.3, -0.2, 0.5], base(n), foco(600), 800, 600);
    cerca(p.x, 400, 1e-6); cerca(p.y, 300, 1e-6);
  });
});

describe("tamaños", () => {
  it("un radio mide más cuanto más cerca, y no se dispara pegado a la cámara", () => {
    expect(pixeles(0.05, 2, 700)).toBeGreaterThan(pixeles(0.05, 4, 700));
    expect(Number.isFinite(pixeles(0.05, 0, 700))).toBe(true);
  });

  it("la niebla es 1 al lado y va bajando con la distancia", () => {
    expect(niebla(0)).toBe(1);
    expect(niebla(2)).toBeGreaterThan(niebla(5));
    expect(niebla(5)).toBeGreaterThan(0);
  });
});
