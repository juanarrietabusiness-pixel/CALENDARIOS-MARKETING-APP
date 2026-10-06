// ============================================================
// Las piezas del perfil por PLANTILLA: portadas de destacados y foto
//
// Con IA de imagen las portadas salían cada una distinta y con detalles
// raros: un juego de destacados tiene que verse como un JUEGO. Aquí se
// dibujan en un lienzo con la paleta del kit de marca y un icono del set de
// la aplicación, en uno de seis estilos que no se ven básicos. Sin gastar
// en IA: si se quiere un fondo «con IA», se crea UNO en el Estudio y se
// reutiliza en todas (estilo «foto»).
//
// Medidas de Instagram:
//   · la portada de un destacado se sube como una historia (1080 × 1920) y
//     Instagram enseña el CÍRCULO del centro: todo lo importante va dentro
//     de `RADIO_SEGURO`;
//   · la foto de perfil se ve en círculo y muy pequeña: el logo ocupa como
//     mucho el 62 % del diámetro.
//
// Lo puro (estilos, colores, geometría) está aquí; el dibujo, en
// components/PiezasPerfil.jsx.
// ============================================================

import { textoSobre } from "./colores";

export const PORTADA = Object.freeze({ ancho: 1080, alto: 1920 });
export const FOTO = Object.freeze({ lado: 1080 });
/** Radio del círculo que enseña Instagram en una portada de 1080 de ancho (con margen). */
export const RADIO_SEGURO = 400;
/** El logo de la foto de perfil, como fracción del diámetro. */
export const LOGO_EN_FOTO = 0.62;

/** Los estilos de portada. `fondo`: necesita una imagen de fondo. */
export const ESTILOS_PORTADA = Object.freeze([
  { id: "degradado", nombre: "Degradado", ayuda: "Del color principal al acento, en diagonal, con el icono claro." },
  { id: "solido", nombre: "Sólido", ayuda: "Un color plano con el icono en contraste: limpio y uniforme." },
  { id: "contorno", nombre: "Contorno doble", ayuda: "Fondo de la marca y dos anillos finos en el acento alrededor del icono." },
  { id: "cristal", nombre: "Cristal", ayuda: "Degradado con un disco translúcido y brillo suave detrás del icono." },
  { id: "sello", nombre: "Sello", ayuda: "Fondo claro y un círculo lleno del color de la marca, como una insignia." },
  { id: "foto", nombre: "Fondo con imagen", ayuda: "Una imagen de la galería (puede ser un fondo hecho con IA) con un velo y el icono encima.", fondo: true },
]);

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Los tres colores de una portada a partir de la paleta del kit: principal (fondo), acento y el del icono (el que
 * mejor contrasta). Sin paleta, el azul de la agencia. Pura.
 */
export function coloresDePortada(paleta = [], elegidos = {}) {
  const hex = (Array.isArray(paleta) ? paleta : []).map((c) => (typeof c === "string" ? c : c?.hex)).filter((c) => HEX.test(String(c ?? "")));
  const principal = HEX.test(elegidos.principal ?? "") ? elegidos.principal : hex[0] ?? "#1E3A6B";
  const acento = HEX.test(elegidos.acento ?? "") ? elegidos.acento : hex.find((c) => c.toUpperCase() !== principal.toUpperCase()) ?? "#1E90FF";
  const icono = HEX.test(elegidos.icono ?? "") ? elegidos.icono : textoSobre(principal);
  return { principal, acento, icono };
}

/** Una versión más clara de un color (para fondos «sello»): mezcla con blanco. Pura. */
export function aclarar(hex, cuanto = 0.85) {
  if (!HEX.test(String(hex ?? ""))) return "#F5F6F7";
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  const mezcla = (v) => Math.round(v + (255 - v) * cuanto).toString(16).padStart(2, "0");
  return `#${mezcla(n(1))}${mezcla(n(3))}${mezcla(n(5))}`.toUpperCase();
}

/** Dónde y de qué tamaño va una imagen para que CUBRA un rectángulo (recortando lo que sobre). Pura. */
export function cubrir(anchoImg, altoImg, ancho, alto) {
  const escala = Math.max(ancho / anchoImg, alto / altoImg);
  const w = anchoImg * escala;
  const h = altoImg * escala;
  return { x: (ancho - w) / 2, y: (alto - h) / 2, w, h };
}

/** Dónde va el logo en la foto de perfil: centrado y dentro del `LOGO_EN_FOTO` del diámetro, sin deformarlo. Pura. */
export function logoEnFoto(anchoLogo, altoLogo, lado = FOTO.lado, fraccion = LOGO_EN_FOTO) {
  const max = lado * fraccion;
  const escala = Math.min(max / anchoLogo, max / altoLogo);
  const w = anchoLogo * escala;
  const h = altoLogo * escala;
  return { x: (lado - w) / 2, y: (lado - h) / 2, w, h };
}

/** «destacado-reseñas.png»: el nombre del archivo de una portada. Pura. */
export function nombreDePortada(titulo, i = 0) {
  const base = String(titulo ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `destacado-${base || i + 1}.png`;
}
