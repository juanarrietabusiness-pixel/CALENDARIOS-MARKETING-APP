// ============================================================
// La cámara del cerebro 3D
//
// Todo puro: una cámara que gira alrededor de un punto (órbita), y cómo un
// punto del espacio cae en la pantalla. Sustituye a lo que en Agents Office
// hace three.js con `OrbitControls` —aquí no hay librería: un cerebro de un
// cliente son decenas o cientos de notas, y las cuentas caben en un lienzo
// 2D—. Los límites y las velocidades son los mismos, para que se sienta igual.
//
// La cámara es un estado plano { theta, phi, dist, tx, ty, tz }:
//   theta  giro horizontal alrededor del cerebro (radianes)
//   phi    inclinación desde el polo de arriba: 0 = desde arriba, π = desde abajo
//   dist   distancia al punto que mira
//   t*     el punto que mira (cambia al volar hacia una nota o al desplazar)
// ============================================================

export const FOV = 42; // grados, vertical
export const DIST_MIN = 0.35;
export const DIST_MAX = 9;
export const PHI_MIN = 0.3; // nunca boca abajo: sin llegar a los polos
export const PHI_MAX = Math.PI - 0.3;
export const CERCA = 0.05; // lo que queda más cerca que esto no se pinta

/** Desde dónde se ve el cerebro al abrirlo: (1,95; 0,8; 2,75), como en Agents Office. */
export function camaraInicial() {
  const x = 1.95; const y = 0.8; const z = 2.75;
  const dist = Math.hypot(x, y, z);
  return { theta: Math.atan2(x, z), phi: Math.acos(y / dist), dist, tx: 0, ty: 0, tz: 0 };
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const restar = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unitario = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };

/** Dónde está la cámara en el espacio. */
export function posicion(c) {
  const s = Math.sin(c.phi);
  return [c.tx + c.dist * s * Math.sin(c.theta), c.ty + c.dist * Math.cos(c.phi), c.tz + c.dist * s * Math.cos(c.theta)];
}

/** Los tres ejes de la cámara (derecha, arriba, adelante) y su posición: lo que hace falta para proyectar. */
export function base(c) {
  const pos = posicion(c);
  const adelante = unitario(restar([c.tx, c.ty, c.tz], pos));
  const derecha = unitario(cruz(adelante, [0, 1, 0]));
  const arriba = cruz(derecha, adelante);
  return { pos, adelante, derecha, arriba };
}

/** Píxeles por unidad a distancia 1: lo que relaciona un tamaño del espacio con uno de la pantalla. */
export const foco = (alto) => alto / 2 / Math.tan((FOV * Math.PI) / 360);

/**
 * Un punto del espacio → la pantalla. `z` es la profundidad (distancia a lo largo de la mirada): sirve para ordenar,
 * para el desvanecido y para el tamaño (`f / z` píxeles por unidad). null si queda detrás de la cámara.
 */
export function proyectar(p, b, f, ancho, alto) {
  const v = restar(p, b.pos);
  const z = punto(v, b.adelante);
  if (z <= CERCA) return null;
  return { x: ancho / 2 + (punto(v, b.derecha) * f) / z, y: alto / 2 - (punto(v, b.arriba) * f) / z, z };
}

/** Girar alrededor del cerebro. Nunca pasa de los polos. */
export function girar(c, dTheta, dPhi) {
  return { ...c, theta: c.theta + dTheta, phi: limitar(c.phi + dPhi, PHI_MIN, PHI_MAX) };
}

/** Acercar (factor < 1) o alejar (> 1), dentro de los límites. */
export function acercar(c, factor) {
  return { ...c, dist: limitar(c.dist * factor, DIST_MIN, DIST_MAX) };
}

/** El factor de zoom de un giro de rueda: el mismo que OrbitControls (0,95 elevado a la velocidad). */
export function factorDeRueda(deltaY, velocidad = 0.8) {
  const f = Math.pow(0.95, velocidad * Math.abs(deltaY * 0.01));
  return deltaY < 0 ? f : 1 / f;
}

/** Cuánto gira la cámara al arrastrar `px` píxeles en una pantalla de `alto`: una vuelta entera por alto de pantalla × 0,55. */
export const anguloDeArrastre = (px, alto, velocidad = 0.55) => (2 * Math.PI * px * velocidad) / Math.max(1, alto);

/** Desplazar lo que se mira, en el plano de la pantalla (arrastrar con el botón derecho o con dos dedos). */
export function desplazar(c, dx, dy, f) {
  const b = base(c);
  const k = c.dist / f; // unidades del espacio por píxel a la distancia del objetivo
  return {
    ...c,
    tx: c.tx - b.derecha[0] * dx * k + b.arriba[0] * dy * k,
    ty: c.ty - b.derecha[1] * dx * k + b.arriba[1] * dy * k,
    tz: c.tz - b.derecha[2] * dx * k + b.arriba[2] * dy * k,
  };
}

/** Una cámara entre dos: `k` de 0 a 1, con la salida suave del vuelo (rápido al principio, lento al llegar). */
export function entre(a, b, k) {
  const e = 1 - Math.pow(1 - limitar(k, 0, 1), 3);
  const mezcla = (x, y) => x + (y - x) * e;
  return { theta: mezcla(a.theta, b.theta), phi: mezcla(a.phi, b.phi), dist: mezcla(a.dist, b.dist), tx: mezcla(a.tx, b.tx), ty: mezcla(a.ty, b.ty), tz: mezcla(a.tz, b.tz) };
}

/** La cámara que tiene una nota en el centro, mirada desde donde ya se estaba mirando. */
export function haciaNota(c, p, dist = 2.1) {
  return { ...c, tx: p[0], ty: p[1], tz: p[2], dist: limitar(dist, DIST_MIN, DIST_MAX) };
}

/** Cuántos píxeles mide algo de `radio` (unidades del espacio) a profundidad `z`. */
export const pixeles = (radio, z, f) => (radio * f) / Math.max(CERCA, z);

/** El desvanecido con la distancia (la niebla): 1 cerca, menos lejos. Es la de Agents Office, `FogExp2` a 0,16. */
export const niebla = (z, densidad = 0.16) => Math.exp(-((densidad * z) ** 2));

/**
 * Lo mismo que `proyectar` para muchos puntos a la vez, sin crear un objeto por punto: se llama una vez por
 * fotograma con todas las notas y con los miles de puntos de la corteza. `P` son 3 números por punto; escribe en
 * `X`, `Y` y `Z` (la profundidad; 0 = detrás de la cámara, que no se pinta).
 */
export function proyectarLote(P, n, b, f, ancho, alto, X, Y, Z) {
  const [px, py, pz] = b.pos;
  const [ax, ay, az] = b.adelante;
  const [dx, dy, dz] = b.derecha;
  const [ux, uy, uz] = b.arriba;
  const cx = ancho / 2;
  const cy = alto / 2;
  for (let i = 0; i < n; i++) {
    const vx = P[i * 3] - px; const vy = P[i * 3 + 1] - py; const vz = P[i * 3 + 2] - pz;
    const z = vx * ax + vy * ay + vz * az;
    if (z <= CERCA) { Z[i] = 0; continue; }
    X[i] = cx + ((vx * dx + vy * dy + vz * dz) * f) / z;
    Y[i] = cy - ((vx * ux + vy * uy + vz * uz) * f) / z;
    Z[i] = z;
  }
}
