// ============================================================
// Dónde queda cada nota en el cerebro
//
// Todo puro: recibe notas y conexiones, devuelve posiciones. Portado del
// cerebro 3D de Agents Office (`src/brain3d.js`, `layout3D`), que es donde
// se afinó, con los mismos números: lo que se ve aquí es lo que se ve allí.
//
// La forma no es adorno, es coherente: las notas se asientan DENTRO de un
// cerebro —dos hemisferios con la fisura entre ellos—, cada grupo de notas
// (un archivo del repositorio, la ficha…) es una región propia (un lóbulo),
// las notas enlazadas se atraen entre sí y cada una conserva su sitio. Lo
// que conecta con todo (la ficha, un índice) queda cerca del centro; el
// detalle, hacia la corteza.
//
// Es determinista: el «azar» de cada nota sale de su id, así que el cerebro
// de un cliente tiene siempre la misma forma. Y es estable: con `prev` (las
// posiciones que ya tenían) sólo se mueven las notas nuevas y sus vecinas;
// una nota que se añade no sacude todo el cerebro.
//
// nodos: [{ id, g (grupo), d (cuántas conexiones toca) }]
// enlaces / suaves: [[i, j]] — los suaves (menciones) atraen un tercio.
// ============================================================

/** Medio tamaño del cerebro: ancho, alto y largo (de frente a atrás). */
export const RADIOS = Object.freeze({ x: 1.08, y: 0.86, z: 1.34 });
const R = RADIOS;

/** Una huella estable de un texto (FNV-1a de 32 bits). */
export function huella(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Un generador de números al «azar» que siempre da los mismos para la misma semilla (mulberry32). */
export function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Los lóbulos salen de las propias notas: los grupos que más se enlazan entre sí comparten hemisferio y quedan
 * juntos (un corte equilibrado de los enlaces grupo × grupo), y cada hemisferio se coloca de frente, por arriba,
 * hacia atrás. → Map grupo → dirección [x, y, z] unitaria.
 */
function anclasDeRegion(nodos, enlaces) {
  const tamano = new Map();
  for (const n of nodos) tamano.set(n.g, (tamano.get(n.g) || 0) + 1);
  const grupos = [...tamano.keys()].sort((a, b) => tamano.get(b) - tamano.get(a) || a.localeCompare(b));
  const par = (a, b) => (a < b ? a + "\u0001" + b : b + "\u0001" + a);
  const afinidad = new Map();
  const A = (a, b) => afinidad.get(par(a, b)) || 0;
  for (const [i, j] of enlaces) {
    const a = nodos[i]?.g;
    const b = nodos[j]?.g;
    if (!a || !b || a === b) continue;
    afinidad.set(par(a, b), A(a, b) + 1);
  }
  const lado = { "-1": [], "1": [] };
  const carga = { "-1": 0, "1": 0 };
  const total = nodos.length || 1;
  for (const g of grupos) {
    // Cada grupo, al hemisferio con el que más se enlaza, sin que uno quede mucho más cargado que el otro.
    const puntos = (s) => lado[s].reduce((t, h) => t + A(g, h), 0) - 6 * (carga[s] - carga[-s]) / total;
    const s = puntos(-1) > puntos(1) || (puntos(-1) === puntos(1) && carga[-1] <= carga[1]) ? -1 : 1;
    lado[s].push(g);
    carga[s] += tamano.get(g);
  }
  const salida = new Map();
  for (const s of [-1, 1]) {
    const l = lado[s];
    if (!l.length) continue;
    // Una cadena: el siguiente lóbulo es el más enlazado con el último que se colocó.
    const cadena = [l[0]];
    const faltan = new Set(l.slice(1));
    while (faltan.size) {
      const ultimo = cadena[cadena.length - 1];
      let mejor = null;
      let mp = -1;
      for (const g of faltan) {
        const v = A(ultimo, g) * 100 + tamano.get(g);
        if (v > mp) { mp = v; mejor = g; }
      }
      cadena.push(mejor);
      faltan.delete(mejor);
    }
    cadena.forEach((g, k) => {
      const th = Math.PI * (k + 0.5) / cadena.length; // de frente → arriba → atrás
      const dx = 0.62;
      const dy = Math.sin(th) * 0.72 - 0.12;
      const dz = Math.cos(th) * 0.95;
      const m = Math.hypot(dx, dy, dz);
      salida.set(g, [s * dx / m, dy / m, dz / m]);
    });
  }
  return salida;
}

/**
 * Posiciones de las notas (Float32Array, 3 por nota).
 * `prev`: Map id → [x, y, z] de las que ya estaban: no se mueven. `suaves`: menciones.
 */
export function colocar(nodos, enlaces, prev = new Map(), suaves = []) {
  const N = nodos.length;
  const P = new Float32Array(N * 3);
  const V = new Float32Array(N * 3);
  const dirs = anclasDeRegion(nodos, enlaces);
  const ady = nodos.map(() => []);
  for (const [a, b] of enlaces) if (ady[a] && ady[b]) { ady[a].push(b); ady[b].push(a); }
  const grado = nodos.map((n) => n.d || 0);
  const maxD = Math.max(1, ...grado);

  // Dónde quiere estar una nota: en la dirección de su lóbulo, más adentro cuanto más conecta.
  const T = new Float32Array(N * 3);
  nodos.forEach((n, i) => {
    const d = dirs.get(n.g) || [1, 0, 0];
    const rr = 0.98 - 0.66 * Math.min(1, Math.log1p(grado[i]) / Math.log1p(maxD));
    T[i * 3] = d[0] * R.x * rr; T[i * 3 + 1] = d[1] * R.y * rr; T[i * 3 + 2] = d[2] * R.z * rr;
  });

  const mueve = new Uint8Array(N);
  let nuevas = 0;
  nodos.forEach((n, i) => {
    const p = prev.get(n.id);
    // Un sitio que no es un número no es un sitio: se vuelve a colocar.
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) { P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; return; }
    nuevas++;
    mueve[i] = 1;
    for (const j of ady[i]) mueve[j] = 1; // una nota nueva y las que toca buscan su sitio
    const r = azar(huella(n.id));
    // Nace junto a una vecina que ya tenga sitio. Un sitio que no es un número tampoco vale aquí: sin comprobarlo, una vecina con
    // el sitio roto lo contagiaba (la nota nacía en NaN y se quedaba fuera del cerebro).
    const vecina = ady[i].map((j) => prev.get(nodos[j].id)).find((q) => q && q.every(Number.isFinite));
    const b = vecina || [T[i * 3], T[i * 3 + 1], T[i * 3 + 2]];
    P[i * 3] = b[0] + (r() - 0.5) * 0.24; P[i * 3 + 1] = b[1] + (r() - 0.5) * 0.24; P[i * 3 + 2] = b[2] + (r() - 0.5) * 0.24;
  });
  if (!prev.size) mueve.fill(1);

  const iteraciones = !nuevas ? 0 : prev.size ? 120 : N > 800 ? 200 : 300;
  // El sitio que se guarda cada nota se encoge según se llena el cerebro (una celda fija tardaba segundos con 2 000).
  const celda = Math.min(0.36, 1.6 * Math.cbrt((4 / 3) * Math.PI * R.x * R.y * R.z / Math.max(1, N)));
  const kr = 0.0036 * (celda / 0.36) ** 2;
  const celda2 = celda * celda;
  const G = new Map();
  const K = (x, y, z) => ((Math.floor(x / celda) + 64) * 128 + (Math.floor(y / celda) + 64)) * 128 + (Math.floor(z / celda) + 64);

  for (let it = 0; it < iteraciones; it++) {
    const paso = 0.06 * (1 - it / iteraciones) + 0.004;
    V.fill(0);
    G.clear();
    for (let i = 0; i < N; i++) {
      const k = K(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      const l = G.get(k);
      if (l) l.push(i); else G.set(k, [i]);
    }
    for (let i = 0; i < N; i++) { // espacio: una nota empuja a las de su celda y las contiguas
      if (!mueve[i]) continue;
      const x = P[i * 3]; const y = P[i * 3 + 1]; const z = P[i * 3 + 2];
      const cx = Math.floor(x / celda) + 64; const cy = Math.floor(y / celda) + 64; const cz = Math.floor(z / celda) + 64;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const l = G.get(((cx + dx) * 128 + cy + dy) * 128 + cz + dz);
        if (!l) continue;
        for (const j of l) {
          if (j === i) continue;
          let ex = x - P[j * 3]; let ey = y - P[j * 3 + 1]; let ez = z - P[j * 3 + 2];
          let d2 = ex * ex + ey * ey + ez * ez;
          if (d2 > celda2) continue;
          if (d2 < 1e-6) { ex = 0.01 * ((i % 3) - 1); ey = 0.01; ez = 0.01 * ((j % 3) - 1); d2 = 3e-4; }
          const f = kr / d2; const d = Math.sqrt(d2);
          V[i * 3] += ex / d * f; V[i * 3 + 1] += ey / d * f; V[i * 3 + 2] += ez / d * f;
        }
      }
    }
    for (let li = 0; li < enlaces.length + suaves.length; li++) { // sinapsis: las notas conectadas se atraen hasta una distancia de reposo
      const [a, b] = li < enlaces.length ? enlaces[li] : suaves[li - enlaces.length];
      if (a == null || b == null || a >= N || b >= N) continue;
      if (!mueve[a] && !mueve[b]) continue;
      const ex = P[b * 3] - P[a * 3]; const ey = P[b * 3 + 1] - P[a * 3 + 1]; const ez = P[b * 3 + 2] - P[a * 3 + 2];
      const d = Math.hypot(ex, ey, ez) || 1e-3;
      // Las muchas conexiones de un centro no aplastan el cerebro en una bola.
      const f = (d - 0.3) * 0.03 / (1 + Math.max(grado[a], grado[b]) / 4) * (li < enlaces.length ? 1 : 0.35);
      V[a * 3] += ex / d * f; V[a * 3 + 1] += ey / d * f; V[a * 3 + 2] += ez / d * f;
      V[b * 3] -= ex / d * f; V[b * 3 + 1] -= ey / d * f; V[b * 3 + 2] -= ez / d * f;
    }
    for (let i = 0; i < N; i++) {
      if (!mueve[i]) continue;
      const o = i * 3;
      const lado = Math.sign((dirs.get(nodos[i].g) || [1])[0]) || 1;
      V[o] += (T[o] - P[o]) * 0.03; V[o + 1] += (T[o + 1] - P[o + 1]) * 0.03; V[o + 2] += (T[o + 2] - P[o + 2]) * 0.03; // su lóbulo, a su profundidad
      const q = Math.hypot(P[o] / R.x, P[o + 1] / R.y, P[o + 2] / R.z); // dentro del cráneo
      if (q > 0.97) { const s = (q - 0.97) * 0.5; V[o] -= P[o] * s; V[o + 1] -= P[o + 1] * s; V[o + 2] -= P[o + 2] * s; }
      if (P[o] * lado < 0.07) V[o] += lado * (0.07 - P[o] * lado) * 0.25; // la fisura entre los hemisferios
      const vv = Math.hypot(V[o], V[o + 1], V[o + 2]);
      const s = vv > paso ? paso / vv : 1;
      P[o] += V[o] * s; P[o + 1] += V[o + 1] * s; P[o + 2] += V[o + 2] * s;
    }
  }
  return P;
}

/**
 * La corteza: puntos tenues en la superficie del cerebro, plegados como circunvoluciones y con la fisura abierta.
 * Es sólo el contorno que hace que se lea «un cerebro». → Float32Array, 3 por punto.
 */
export function corteza(cuantos = 1500) {
  const r = azar(7);
  const pts = [];
  for (let i = 0; i < cuantos; i++) {
    const u = r() * 2 - 1;
    const t = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const x = s * Math.cos(t); let y = u; const z = s * Math.sin(t);
    if (Math.abs(x) < 0.06 && y > -0.35) continue; // la fisura
    const pliegue = 1 + 0.035 * Math.sin(9 * y + 5 * z) * Math.sin(7 * z - 3 * x); // circunvoluciones
    if (y < -0.55) y *= 0.8; // más plano por debajo
    pts.push(x * R.x * pliegue, y * R.y * pliegue, z * R.z * pliegue);
  }
  return new Float32Array(pts);
}
