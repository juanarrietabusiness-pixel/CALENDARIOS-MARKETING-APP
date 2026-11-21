// Lo común de las piezas: la marca en colores, el tiempo y las curvas. Todo sale de datos.json (la escena que arma
// kit.mjs con src/lib/escenaEdicion.js): aquí no hay colores ni letras fijos de ningún cliente.
import { spring, Easing } from "remotion";

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, x) => a + (b - a) * x;
export const ease = Easing.inOut(Easing.cubic);
export const eout = Easing.out(Easing.cubic);
export const ein = Easing.in(Easing.cubic);
export const n5 = (n) => String(n).padStart(5, "0");
/** Un muelle que arranca en el segundo `at`. */
export const muelle = (f, fps, at, c = { damping: 12, stiffness: 170, mass: 0.6 }) => spring({ frame: f - Math.round(at * fps), fps, config: c });

/** Oscurece o aclara un #rrggbb (k < 0 oscurece). */
export function tono(hex, k) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
const rgba = (hex, a) => {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Los colores de la marca con los papeles que usan las piezas. */
export function colores(marca = {}) {
  const c = marca.colores ?? {};
  const oscuro = c.oscuro ?? "#152473";
  return {
    oscuro, oscuro2: c.oscuro2 ?? tono(oscuro, -0.33), acento: c.acento ?? "#FFB400", claro: c.claro ?? "#FFFFFF",
    tinta: c.tinta ?? tono(oscuro, -0.66), whatsapp: c.whatsapp ?? "#25D366",
    sombra: (a) => rgba(c.tinta ?? tono(oscuro, -0.66), a),
  };
}
/** Las familias de letra (las carga Letras.jsx). */
export const letras = (marca = {}) => ({ titular: marca.letras?.titular?.familia ?? "Anton", texto: marca.letras?.texto?.familia ?? "Inter Tight" });

// El modo celular: cuánto está puesto (0–1) y dónde queda la burbuja con la persona.
export const PROGRESO_CELULAR = (p, t) => ease(clamp((t - p.desde) / 0.6)) * (1 - ease(clamp((t - (p.hasta - 0.55)) / 0.55)));
export const BURBUJA = { cx: 885, cy: 1235, r: 150 };
