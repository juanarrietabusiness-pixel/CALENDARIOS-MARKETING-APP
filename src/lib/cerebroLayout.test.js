import { describe, it, expect } from "vitest";
import { colocar, corteza, huella, azar, RADIOS } from "./cerebroLayout";

// ============================================================
// Dónde queda cada nota en el cerebro
//
// Portado de `layout3D` de Agents Office. Lo que se comprueba es lo que
// hace que se lea «un cerebro» y no una nube: todo dentro del cráneo, los
// centros al medio, cada lóbulo en su hemisferio, y la forma estable.
// ============================================================

/** Un cliente de mentira: `grupos` lóbulos con `porGrupo` notas, la primera de cada grupo enlazada con todas las suyas. */
function cliente(grupos = 5, porGrupo = 8, { cruzados = true } = {}) {
  const nodos = [];
  const enlaces = [];
  for (let g = 0; g < grupos; g++) {
    const primera = nodos.length;
    for (let k = 0; k < porGrupo; k++) {
      nodos.push({ id: `g${g}-n${k}`, g: `grupo-${g}`, d: 0 });
      if (k > 0) enlaces.push([primera, nodos.length - 1]);
    }
  }
  if (cruzados) for (let g = 1; g < grupos; g++) enlaces.push([(g - 1) * porGrupo, g * porGrupo]); // los centros se enlazan entre sí
  for (const [a, b] of enlaces) { nodos[a].d++; nodos[b].d++; }
  return { nodos, enlaces };
}
const punto = (P, i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
const elipsoide = ([x, y, z]) => Math.hypot(x / RADIOS.x, y / RADIOS.y, z / RADIOS.z);

describe("colocar", () => {
  it("es determinista: el mismo cliente tiene siempre la misma forma", () => {
    const { nodos, enlaces } = cliente();
    expect([...colocar(nodos, enlaces)]).toEqual([...colocar(nodos, enlaces)]);
  });

  it("todo queda dentro del cráneo, y todo es un número", () => {
    const { nodos, enlaces } = cliente(6, 12);
    const P = colocar(nodos, enlaces);
    expect(P).toHaveLength(nodos.length * 3);
    for (let i = 0; i < nodos.length; i++) {
      const p = punto(P, i);
      expect(p.every(Number.isFinite)).toBe(true);
      expect(elipsoide(p), `nota ${i}`).toBeLessThan(1.15);
    }
  });

  it("lo que conecta con todo queda más al centro que las hojas", () => {
    const { nodos, enlaces } = cliente(4, 10);
    const P = colocar(nodos, enlaces);
    const centro = (i) => elipsoide(punto(P, i));
    const centros = nodos.map((n, i) => i).filter((i) => nodos[i].d >= 10);
    const hojas = nodos.map((n, i) => i).filter((i) => nodos[i].d === 1);
    expect(centros.length).toBeGreaterThan(0);
    const media = (l) => l.reduce((s, i) => s + centro(i), 0) / l.length;
    expect(media(centros)).toBeLessThan(media(hojas));
  });

  it("los dos hemisferios se reparten, con la fisura entre ellos", () => {
    const { nodos, enlaces } = cliente(6, 10);
    const P = colocar(nodos, enlaces);
    const izq = nodos.filter((n, i) => P[i * 3] < 0).length;
    const der = nodos.filter((n, i) => P[i * 3] > 0).length;
    expect(izq).toBeGreaterThan(nodos.length * 0.25);
    expect(der).toBeGreaterThan(nodos.length * 0.25);
    // La fisura: casi ninguna nota queda pegada a x = 0.
    const pegadas = nodos.filter((n, i) => Math.abs(P[i * 3]) < 0.03).length;
    expect(pegadas).toBeLessThan(nodos.length * 0.1);
  });

  it("las notas de un mismo lóbulo quedan más juntas entre sí que con las de otro", () => {
    const { nodos, enlaces } = cliente(5, 10);
    const P = colocar(nodos, enlaces);
    const dist = (a, b) => Math.hypot(...punto(P, a).map((v, k) => v - punto(P, b)[k]));
    let dentro = 0; let nd = 0; let fuera = 0; let nf = 0;
    for (let a = 0; a < nodos.length; a++) for (let b = a + 1; b < nodos.length; b++) {
      if (nodos[a].g === nodos[b].g) { dentro += dist(a, b); nd++; } else { fuera += dist(a, b); nf++; }
    }
    expect(dentro / nd).toBeLessThan(fuera / nf);
  });

  it("una nota nueva no sacude el cerebro: sólo se mueven ella y las notas que toca", () => {
    const { nodos, enlaces } = cliente();
    const antes = colocar(nodos, enlaces);
    const prev = new Map(nodos.map((n, i) => [n.id, punto(antes, i)]));
    const con = [...nodos, { id: "nueva", g: "grupo-1", d: 1 }];
    const despues = colocar(con, [...enlaces, [8, nodos.length]], prev);
    for (let i = 0; i < nodos.length; i++) {
      if (i === 8) continue; // la que la nueva enlaza hace sitio: es la única que puede moverse
      expect(punto(despues, i), `nota ${i}`).toEqual(punto(antes, i));
    }
    expect(punto(despues, nodos.length).every(Number.isFinite)).toBe(true);
    expect(elipsoide(punto(despues, nodos.length))).toBeLessThan(1.15);
  });

  it("sin nada nuevo, no se mueve nada", () => {
    const { nodos, enlaces } = cliente();
    const antes = colocar(nodos, enlaces);
    const prev = new Map(nodos.map((n, i) => [n.id, punto(antes, i)]));
    expect([...colocar(nodos, enlaces, prev)]).toEqual([...antes]);
  });

  it("la nota nueva nace junto a su vecina", () => {
    const { nodos, enlaces } = cliente();
    const antes = colocar(nodos, enlaces);
    const prev = new Map(nodos.map((n, i) => [n.id, punto(antes, i)]));
    const despues = colocar([...nodos, { id: "nueva", g: "grupo-1", d: 1 }], [...enlaces, [8, nodos.length]], prev);
    const dist = (a, b) => Math.hypot(...punto(despues, a).map((v, k) => v - punto(despues, b)[k]));
    let suma = 0; let n = 0;
    for (let a = 0; a < nodos.length; a++) for (let b = a + 1; b < nodos.length; b++) { suma += dist(a, b); n++; }
    expect(dist(nodos.length, 8), "más cerca de su vecina que la distancia media entre dos notas").toBeLessThan(suma / n / 1.5);
  });

  it("un sitio guardado que no es un número no vale: se vuelve a colocar, y no contagia a sus vecinas", () => {
    const { nodos, enlaces } = cliente(3, 4);
    // La 0 y la 1 están enlazadas: la 1 nace junto a «su vecina» y esa vecina tiene el sitio roto.
    const prev = new Map([[nodos[0].id, [NaN, 1, 1]], [nodos[1].id, [0.2, undefined, 0]], [nodos[2].id, [0.1, 0.1, 0.1]]]);
    const P = colocar(nodos, enlaces, prev);
    expect([...P].every(Number.isFinite)).toBe(true);
    expect(punto(P, 2), "la de sitio bueno se queda o casi (la tocan las que se colocan)").toBeDefined();
  });

  it("sin notas, o con una sola, no rompe", () => {
    expect(colocar([], [])).toHaveLength(0);
    const P = colocar([{ id: "a", g: "x", d: 0 }], []);
    expect(P).toHaveLength(3);
    expect([...P].every(Number.isFinite)).toBe(true);
  });

  it("ignora conexiones a notas que no existen", () => {
    const { nodos } = cliente(2, 3);
    expect([...colocar(nodos, [[0, 99], [98, 1], [0, 1]])].every(Number.isFinite)).toBe(true);
  });

  it("400 notas se colocan en un instante", () => {
    const { nodos, enlaces } = cliente(10, 40);
    const t0 = performance.now();
    const P = colocar(nodos, enlaces);
    expect(performance.now() - t0, "el cerebro de un cliente grande no puede tardar segundos").toBeLessThan(2500);
    for (let i = 0; i < nodos.length; i++) expect(elipsoide(punto(P, i))).toBeLessThan(1.2);
  });

  it("las menciones atraen menos que los enlaces, pero atraen", () => {
    const nodos = [{ id: "a", g: "x", d: 1 }, { id: "b", g: "x", d: 1 }];
    const con = (enlaces, suaves) => {
      const P = colocar(nodos, enlaces, new Map(), suaves);
      return Math.hypot(...punto(P, 0).map((v, k) => v - punto(P, 1)[k]));
    };
    expect(con([], [[0, 1]])).toBeLessThanOrEqual(con([], []) + 1e-6);
  });
});

describe("la corteza", () => {
  it("son puntos sobre la superficie, sin ninguno en la fisura", () => {
    const P = corteza(1500);
    expect(P.length).toBeGreaterThan(1200 * 3);
    expect(P.length).toBeLessThanOrEqual(1500 * 3);
    for (let i = 0; i < P.length / 3; i++) {
      const [x, y, z] = punto(P, i);
      expect(elipsoide([x, y, z])).toBeGreaterThan(0.75); // más plano por debajo, y con pliegues
      expect(elipsoide([x, y, z])).toBeLessThan(1.15);
      expect(Math.abs(x / RADIOS.x) < 0.05 && y / RADIOS.y > -0.3, "la fisura queda abierta").toBe(false);
    }
  });

  it("siempre la misma", () => {
    expect([...corteza(200)]).toEqual([...corteza(200)]);
  });
});

describe("huella y azar", () => {
  it("la huella de un texto no cambia, y textos distintos dan huellas distintas", () => {
    expect(huella("abc")).toBe(huella("abc"));
    expect(huella("abc")).not.toBe(huella("abd"));
  });

  it("el azar de una semilla es siempre el mismo y va de 0 a 1", () => {
    const a = azar(5); const b = azar(5);
    for (let i = 0; i < 20; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
