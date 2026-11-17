// ============================================================
// Los COLORES de «Mejorar mi video» (modo «color»): grades hechos con ffmpeg en el Container, SIN IA
//
// Cada uno es una cadena de filtros de ffmpeg sobre la imagen (no toca el audio ni la escena: ni caras ni objetos
// cambian). Los usa container/unir.mjs al unir y para la muestra de un cuadro, y la pantalla para enseñar los nombres.
// Sólo filtros que trae el ffmpeg de Debian bookworm (5.1): eq, curves, colorbalance, colortemperature, hue, noise.
// Pura.
// ============================================================

export const COLORES = Object.freeze([
  { id: "calido", nombre: "Cálido", texto: "Piel y madera más cálidas, como luz de tarde.", filtro: "colortemperature=temperature=5000:mix=0.6,eq=saturation=1.08:contrast=1.04" },
  { id: "frio", nombre: "Frío y limpio", texto: "Blancos limpios con un toque azul, aspecto moderno.", filtro: "colortemperature=temperature=8200:mix=0.5,eq=saturation=0.96:contrast=1.05" },
  { id: "cine", nombre: "Cine", texto: "Sombras verdeazuladas y pieles cálidas, contraste suave de película.", filtro: "curves=preset=medium_contrast,colorbalance=rs=-0.06:gs=0.02:bs=0.08:rh=0.06:bh=-0.05,eq=saturation=0.92" },
  { id: "luminoso", nombre: "Luminoso", texto: "Más luz y aire, colores suaves: aspecto de marca premium.", filtro: "eq=brightness=0.04:contrast=1.02:saturation=1.04,curves=all='0/0.03 0.5/0.57 1/1'" },
  { id: "vivo", nombre: "Colores vivos", texto: "Más saturación y contraste: el producto resalta.", filtro: "eq=saturation=1.3:contrast=1.08" },
  { id: "contraste", nombre: "Alto contraste", texto: "Negros profundos y blancos firmes, con fuerza.", filtro: "curves=preset=strong_contrast,eq=saturation=1.05" },
  { id: "pelicula", nombre: "Película", texto: "Colores lavados y cálidos con grano fino, como en rollo.", filtro: "curves=preset=vintage,eq=saturation=0.9,noise=alls=5:allf=t" },
  { id: "pastel", nombre: "Pastel", texto: "Suave y claro, poco contraste: tierno, para bebés o belleza.", filtro: "eq=contrast=0.9:saturation=0.82:brightness=0.04,curves=all='0/0.07 1/0.97'" },
  { id: "noche", nombre: "Noche", texto: "Más oscuro y azulado, con contraste: ambiente nocturno.", filtro: "colorbalance=bs=0.1:bm=0.05,eq=brightness=-0.05:contrast=1.12:saturation=0.9" },
  { id: "byn", nombre: "Blanco y negro", texto: "Blanco y negro con contraste medio.", filtro: "hue=s=0,curves=preset=medium_contrast" },
]);

/** El color con ese id, o null. */
export const colorPorId = (id) => COLORES.find((c) => c.id === id) ?? null;
