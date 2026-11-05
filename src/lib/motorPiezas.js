// ============================================================
// Las PIEZAS del video animado que no son texto: iconos, el dibujo libre, la cifra gigante, el anillo, los fondos
// decorativos y el logo sin su fondo liso (puro: lo usa motorVideo.js en la vista previa y en el Container)
//
// Mismas reglas que el motor: nada de `document`, `Path2D`, `Math.random` ni la hora. Todo se dibuja con las
// primitivas del lienzo (moveTo, lineTo, curvas, arcos), que existen igual en el navegador y en @napi-rs/canvas; lo
// «aleatorio» sale de una semilla. Así un cuadro del Container es el de la pantalla.
// ============================================================

// ------------------------------------------------------------
// Los ICONOS: trazos en una rejilla de 24, como los de la interfaz (components/Icon.jsx), un poco más gruesos para
// leerse en el teléfono. Cada uno es una función que traza sobre un lienzo ya escalado a la rejilla.
// ------------------------------------------------------------

const punto = (ctx, x, y, r = 1) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); };
const linea = (ctx, ...p) => { ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); };
const caja = (ctx, x, y, w, h, r) => {
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};
const circulo = (ctx, x, y, r) => { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); };

/** Cada icono: [trazos, puntos rellenos]. Los puntos van aparte porque se RELLENAN (un trazo no se ve en un punto). */
const ICONOS = Object.freeze({
  check: [(c) => linea(c, 5, 12.5, 10, 17.5, 19.5, 7)],
  cruz: [(c) => { linea(c, 6, 6, 18, 18); linea(c, 18, 6, 6, 18); }],
  corazon: [(c) => {
    c.moveTo(12, 20.5); c.bezierCurveTo(4, 15, 2.5, 10.5, 4.5, 7.5); c.bezierCurveTo(6.5, 4.6, 10.5, 4.8, 12, 8);
    c.bezierCurveTo(13.5, 4.8, 17.5, 4.6, 19.5, 7.5); c.bezierCurveTo(21.5, 10.5, 20, 15, 12, 20.5); c.closePath();
  }],
  estrella: [(c) => {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 4.2 : 9.5;
      const x = 12 + Math.cos(a) * r; const y = 12.8 + Math.sin(a) * r;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  }],
  rayo: [(c) => { linea(c, 13, 2.5, 4.5, 13.5, 11, 13.5, 10, 21.5, 19.5, 10, 13, 10); c.closePath(); }],
  reloj: [(c) => { circulo(c, 12, 12, 9); linea(c, 12, 7, 12, 12, 15.5, 14); }],
  bolsa: [(c) => { linea(c, 5, 8, 19, 8, 18, 21, 6, 21); c.closePath(); c.moveTo(9, 8); c.arc(12, 8, 3, Math.PI, 0); }],
  carrito: [(c) => linea(c, 2.5, 4, 5.5, 4, 8, 15.5, 18.5, 15.5, 20.5, 7.5, 6.5, 7.5), (c) => { circulo(c, 9, 19.5, 1.4); circulo(c, 17, 19.5, 1.4); }],
  chat: [(c) => { caja(c, 3.5, 4.5, 17, 12, 3); linea(c, 8, 16.5, 7, 20.5, 12, 16.5); }],
  telefono: [(c) => { caja(c, 7, 2.5, 10, 19, 2.5); linea(c, 11, 18, 13, 18); }],
  ubicacion: [(c) => {
    c.moveTo(12, 21.5); c.bezierCurveTo(7, 16, 5, 12.5, 5, 9.5); c.arc(12, 9.5, 7, Math.PI, 0);
    c.bezierCurveTo(19, 12.5, 17, 16, 12, 21.5); c.closePath(); circulo(c, 12, 9.5, 2.6);
  }],
  regalo: [(c) => {
    caja(c, 4, 9.5, 16, 4, 0.8); caja(c, 5.5, 13.5, 13, 7.5, 0.8); linea(c, 12, 9.5, 12, 21);
    c.moveTo(12, 9.5); c.bezierCurveTo(9, 9.5, 7, 5, 9.5, 5); c.bezierCurveTo(11, 5, 12, 7, 12, 9.5);
    c.bezierCurveTo(15, 9.5, 17, 5, 14.5, 5); c.bezierCurveTo(13, 5, 12, 7, 12, 9.5);
  }],
  escudo: [(c) => {
    linea(c, 12, 2.5, 19.5, 5.5, 19.5, 11.5); c.bezierCurveTo(19.5, 16.5, 16, 19.5, 12, 21.5);
    c.bezierCurveTo(8, 19.5, 4.5, 16.5, 4.5, 11.5); c.lineTo(4.5, 5.5); c.closePath(); linea(c, 8.5, 12, 11, 14.5, 15.5, 9.5);
  }],
  hoja: [(c) => { c.moveTo(5, 19); c.bezierCurveTo(4, 10, 10, 4, 20, 4); c.bezierCurveTo(20, 14, 14, 20, 5, 19); c.closePath(); linea(c, 5, 19, 13, 11); }],
  gota: [(c) => { c.moveTo(12, 3); c.bezierCurveTo(8, 8, 5.5, 11.5, 5.5, 14.5); c.arc(12, 14.5, 6.5, Math.PI, 0, true); c.bezierCurveTo(18.5, 11.5, 16, 8, 12, 3); c.closePath(); }],
  bebe: [(c) => {
    circulo(c, 12, 13, 7.5); c.moveTo(12, 5.5); c.bezierCurveTo(10.5, 3.5, 13.5, 2.5, 13.5, 4.2);
    c.moveTo(12 + 2.2 * Math.cos(0.2 * Math.PI), 14.5 + 2.2 * Math.sin(0.2 * Math.PI)); c.arc(12, 14.5, 2.2, 0.2 * Math.PI, 0.8 * Math.PI);
  }, (c) => { punto(c, 9.5, 12, 0.9); punto(c, 14.5, 12, 0.9); }],
  casa: [(c) => { linea(c, 3.5, 11, 12, 3.5, 20.5, 11); linea(c, 5.5, 9.5, 5.5, 20.5, 18.5, 20.5, 18.5, 9.5); linea(c, 10, 20.5, 10, 14.5, 14, 14.5, 14, 20.5); }],
  flecha: [(c) => { linea(c, 4, 12, 20, 12); linea(c, 14, 6, 20, 12, 14, 18); }],
  alerta: [(c) => { linea(c, 12, 3, 21.5, 20, 2.5, 20); c.closePath(); linea(c, 12, 9.5, 12, 14); }, (c) => punto(c, 12, 17.2, 1)],
  sonrisa: [(c) => {
    circulo(c, 12, 12, 9); c.moveTo(12 + 4.5 * Math.cos(0.15 * Math.PI), 13 + 4.5 * Math.sin(0.15 * Math.PI)); c.arc(12, 13, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
  }, (c) => { punto(c, 9, 9.5, 1); punto(c, 15, 9.5, 1); }],
  dinero: [(c) => { caja(c, 2.5, 6.5, 19, 11, 2); circulo(c, 12, 12, 2.8); }, (c) => { punto(c, 6, 12, 0.9); punto(c, 18, 12, 0.9); }],
  camion: [(c) => { caja(c, 2, 6, 12, 10, 0.8); linea(c, 14, 9.5, 18.5, 9.5, 21.5, 13, 21.5, 16, 14, 16); circulo(c, 6.5, 17.5, 1.8); circulo(c, 17.5, 17.5, 1.8); }],
});

/** Los iconos que sabe dibujar el motor (deben ser los de ICONOS_VIDEO del formato: un test los compara). */
export const ICONOS_DIBUJADOS = Object.freeze(Object.keys(ICONOS));

/**
 * Dibuja el icono `nombre` de `lado` px centrado en el origen, en `color`. `grosor` es el del trazo en la rejilla de 24.
 * Pura (sólo llama al lienzo).
 */
export function dibujarIcono(ctx, nombre, lado, color, grosor = 1.9) {
  const [trazos, puntos] = ICONOS[nombre] ?? ICONOS.check;
  ctx.save();
  ctx.translate(-lado / 2, -lado / 2);
  ctx.scale(lado / 24, lado / 24);
  ctx.lineWidth = grosor; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.beginPath(); trazos(ctx); ctx.stroke();
  if (puntos) { ctx.beginPath(); puntos(ctx); ctx.fill(); }
  ctx.restore();
}

// ------------------------------------------------------------
// La CIFRA: el número que cuenta hasta su valor
// ------------------------------------------------------------

/** Lo que tarda en contar una cifra (o llenarse un anillo) desde que entra. */
export const DURACION_CUENTA = 1.2;
const saleSuave = (p) => 1 - (1 - p) ** 3;

/** Cuánto ha avanzado la cuenta `vida` segundos después de entrar (0 a 1, frenando al final). Pura. */
export const avanceDeCuenta = (vida, contar = true) => (!contar || !Number.isFinite(vida) ? 1 : saleSuave(Math.min(1, Math.max(0, vida / DURACION_CUENTA))));

/**
 * Un número como se escribe en español: coma decimal y punto de miles desde 10 000 («1500», «12.500», «4,5»). Sin
 * `toLocaleString`, que depende de lo que traiga cada entorno: el Container y la pantalla tienen que dar lo mismo. Pura.
 */
export function formatearCifra(valor, decimales = 0, { abreviar = false } = {}) {
  const n = Number(valor) || 0;
  const signo = n < 0 ? "-" : "";
  // ABREVIADA («412K», «3,2M»): desde mil. Con un decimal sólo por debajo de 10 («4,5K»), y sin «,0».
  const a = Math.abs(n);
  if (abreviar && a >= 1000) {
    const [div, letra] = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : [1e3, "K"];
    const x = a / div;
    const texto = x < 10 ? x.toFixed(1).replace(/\.0$/, "").replace(".", ",") : String(Math.round(x));
    return `${signo}${texto}${letra}`;
  }
  const [ent, dec] = Math.abs(n).toFixed(Math.max(0, Math.min(2, decimales | 0))).split(".");
  const entero = ent.length >= 5 ? ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ent;
  return `${signo}${entero}${dec ? `,${dec}` : ""}`;
}

// ------------------------------------------------------------
// El DIBUJO libre: formas simples que describe el guion, cada una con su momento y su entrada
// ------------------------------------------------------------

const ENTRADA_FORMA = 0.45;

/**
 * Dibuja las formas de un dibujo en una caja de `ancho` × `alto` centrada en el origen. `vida`: segundos desde que entró
 * el dibujo (Infinity al medir: todo puesto). `colorDe(token)` resuelve los colores. Pura.
 */
export function dibujarFormas(ctx, formas, { ancho, alto, vida = Infinity, colorDe }) {
  const X = (x) => -ancho / 2 + x * ancho;
  const Y = (y) => -alto / 2 + y * alto;
  for (const f of formas ?? []) {
    const p = Number.isFinite(vida) ? (vida - (f.retraso ?? 0)) / ENTRADA_FORMA : 1;
    if (p <= 0) continue;
    const q = saleSuave(Math.min(1, p));
    const w = (f.w ?? 0.3) * ancho;
    const h = f.h ? f.h * alto : w;
    const color = colorDe(f.color);
    const trazo = Math.max(1, (f.grosor ?? 0.03) * ancho);
    ctx.save();
    if (f.entrada === "fundido" || f.entrada === "aparece") ctx.globalAlpha *= f.entrada === "aparece" ? Math.min(1, p * 4) : q;
    else if (f.entrada !== "dibuja") ctx.globalAlpha *= Math.min(1, p * 3);
    const cx = X(f.x ?? 0.5); const cy = Y(f.y ?? 0.5);
    const deLinea = ["linea", "curva", "arco"].includes(f.figura);
    if (!deLinea) {
      ctx.translate(cx, cy + (f.entrada === "sube" ? (1 - q) * alto * 0.08 : 0));
      if (f.giro) ctx.rotate((f.giro * Math.PI) / 180);
      if (f.entrada === "escala") ctx.scale(0.4 + 0.6 * q, 0.4 + 0.6 * q);
    } else if (f.entrada === "sube") ctx.translate(0, (1 - q) * alto * 0.08);
    // «dibuja»: las líneas se trazan de a poco; lo demás se descubre de izquierda a derecha.
    const parte = f.entrada === "dibuja" ? q : 1;
    // Una forma rellena que «se dibuja» se descubre de izquierda a derecha: el recorte va ANTES de su trazado.
    const descubre = f.relleno && !deLinea && parte < 1;
    if (descubre) { ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w * parte, h); ctx.clip(); }
    ctx.beginPath();
    switch (f.figura) {
      case "elipse": ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); break;
      case "rect": { const r = Math.min(w, h) * (f.radio ?? 0); caja(ctx, -w / 2, -h / 2, w, h, Math.max(0.01, r)); break; }
      case "triangulo": linea(ctx, 0, -h / 2, w / 2, h / 2, -w / 2, h / 2); ctx.closePath(); break;
      case "estrella":
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rx = (i % 2 ? 0.42 : 1) * (w / 2); const ry = (i % 2 ? 0.42 : 1) * (h / 2);
          if (i) ctx.lineTo(Math.cos(a) * rx, Math.sin(a) * ry); else ctx.moveTo(Math.cos(a) * rx, Math.sin(a) * ry);
        }
        ctx.closePath(); break;
      case "corazon":
        ctx.save(); ctx.scale(w / 24, h / 24); ctx.translate(-12, -12); ICONOS.corazon[0](ctx); ctx.restore(); break;
      case "gota":
        ctx.save(); ctx.scale(w / 24, h / 24); ctx.translate(-12, -12); ICONOS.gota[0](ctx); ctx.restore(); break;
      case "linea": {
        const x2 = X(f.x2 ?? 0.5); const y2 = Y(f.y2 ?? 0.5);
        linea(ctx, cx, cy, cx + (x2 - cx) * parte, cy + (y2 - cy) * parte); break;
      }
      case "curva": {
        const x2 = X(f.x2 ?? 0.5); const y2 = Y(f.y2 ?? 0.5); const kx = X(f.cx ?? 0.5); const ky = Y(f.cy ?? 0.5);
        ctx.moveTo(cx, cy);
        const pasos = Math.max(2, Math.round(32 * parte));
        for (let i = 1; i <= pasos; i++) {
          const t = (i / pasos) * parte; const u = 1 - t;
          ctx.lineTo(u * u * cx + 2 * u * t * kx + t * t * x2, u * u * cy + 2 * u * t * ky + t * t * y2);
        }
        break;
      }
      case "arco": {
        const a0 = ((f.inicio ?? 0) * Math.PI) / 180; const a1 = ((f.fin ?? 270) * Math.PI) / 180;
        const fin = a0 + (((a1 - a0) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2) * parte;
        ctx.moveTo(cx + Math.cos(a0) * (w / 2), cy + Math.sin(a0) * (w / 2));
        ctx.arc(cx, cy, w / 2, a0, fin); break;
      }
      default: ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.closePath();
    }
    if (f.relleno && !deLinea) {
      ctx.fillStyle = color; ctx.fill();
    } else {
      ctx.strokeStyle = color; ctx.lineWidth = trazo; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------
// Los FONDOS decorativos: estrellas y líneas (las puntos y rayas viven en el motor)
// ------------------------------------------------------------

/** Un generador de números de una semilla (mulberry32), el mismo que usa el motor. Pura. */
function generador(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Estrellas: destellos de cuatro puntas y puntos, repartidos con la semilla de la escena, que brillan despacio con el
 * tiempo (`t`, segundos del video). Pura.
 */
export function dibujarEstrellas(ctx, { ancho, alto, color, semilla, t = 0 }) {
  const al = generador(semilla);
  const lado = Math.min(ancho, alto);
  const n = Math.round((ancho * alto) / (lado * lado) * 46);
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = al() * ancho; const y = al() * alto; const r = lado * (0.003 + al() ** 3 * 0.014);
    const fase = al() * Math.PI * 2; const vel = 0.6 + al() * 1.2;
    ctx.globalAlpha = (0.25 + al() * 0.45) * (0.65 + 0.35 * Math.sin(t * vel + fase));
    ctx.beginPath();
    if (r > lado * 0.008) {
      // Un destello: cuatro puntas finas.
      ctx.moveTo(x, y - r * 2.4); ctx.quadraticCurveTo(x, y, x + r * 2.4, y); ctx.quadraticCurveTo(x, y, x, y + r * 2.4);
      ctx.quadraticCurveTo(x, y, x - r * 2.4, y); ctx.quadraticCurveTo(x, y, x, y - r * 2.4);
    } else ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Líneas: unas cuantas curvas suaves que cruzan el cuadro, finas y discretas, de la semilla de la escena. Pura. */
export function dibujarLineas(ctx, { ancho, alto, color, semilla }) {
  const al = generador(semilla);
  const lado = Math.min(ancho, alto);
  ctx.save();
  ctx.strokeStyle = color; ctx.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    ctx.globalAlpha = 0.1 + al() * 0.14;
    ctx.lineWidth = lado * (0.002 + al() * 0.004);
    const y0 = al() * alto; const y1 = al() * alto; const k1 = al() * alto; const k2 = al() * alto;
    ctx.beginPath(); ctx.moveTo(-lado * 0.05, y0); ctx.bezierCurveTo(ancho * 0.33, k1, ancho * 0.66, k2, ancho + lado * 0.05, y1); ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------
// El LOGO sin su fondo liso, y su tono
// ------------------------------------------------------------

const distancia = (d, i, c) => Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2]));

/**
 * Quita el FONDO LISO de una imagen RGBA (un logo en JPEG con su fondo blanco se veía como una tarjeta sobre el fondo
 * del video): si las cuatro esquinas son opacas y del mismo color, ese color —y lo que se le parece, hasta
 * `tolerancia`— se vuelve transparente desde el BORDE hacia dentro (lo que está encerrado dentro de una letra se queda),
 * con el borde suavizado. Cambia `datos` en su sitio. → { quitado, fondo: [r, g, b] }. Sólo si lo quitado es entre el
 * 5 % y el 97 % de la imagen (menos no es un fondo; más es que la imagen es sólo eso). Pura.
 */
export function quitarFondoLiso(datos, ancho, alto, { tolerancia = 40 } = {}) {
  const esquina = (x, y) => (y * ancho + x) * 4;
  const esquinas = [esquina(0, 0), esquina(ancho - 1, 0), esquina(0, alto - 1), esquina(ancho - 1, alto - 1)];
  if (esquinas.some((i) => datos[i + 3] < 200)) return { quitado: false };
  const fondo = [0, 1, 2].map((k) => Math.round(esquinas.reduce((s, i) => s + datos[i + k], 0) / 4));
  if (esquinas.some((i) => distancia(datos, i, fondo) > 28)) return { quitado: false };
  const total = ancho * alto;
  const visto = new Uint8Array(total);
  const pila = [];
  const empujar = (p) => { if (!visto[p] && distancia(datos, p * 4, fondo) <= tolerancia) { visto[p] = 1; pila.push(p); } };
  for (let x = 0; x < ancho; x++) { empujar(x); empujar((alto - 1) * ancho + x); }
  for (let y = 0; y < alto; y++) { empujar(y * ancho); empujar(y * ancho + ancho - 1); }
  let n = 0;
  while (pila.length) {
    const p = pila.pop(); n++;
    const x = p % ancho; const y = (p - x) / ancho;
    if (x > 0) empujar(p - 1);
    if (x < ancho - 1) empujar(p + 1);
    if (y > 0) empujar(p - ancho);
    if (y < alto - 1) empujar(p + ancho);
  }
  if (n < total * 0.05 || n > total * 0.97) return { quitado: false };
  for (let p = 0; p < total; p++) {
    if (visto[p]) { datos[p * 4 + 3] = 0; continue; }
    // El borde: lo que toca el fondo quitado y se le parece algo pierde opacidad poco a poco (sin dientes).
    const x = p % ancho;
    const vecino = (x > 0 && visto[p - 1]) || (x < ancho - 1 && visto[p + 1]) || (p >= ancho && visto[p - ancho]) || (p + ancho < total && visto[p + ancho]);
    if (!vecino) continue;
    const d = distancia(datos, p * 4, fondo);
    if (d < tolerancia * 2) datos[p * 4 + 3] = Math.round(datos[p * 4 + 3] * Math.max(0.15, (d - tolerancia) / tolerancia));
  }
  return { quitado: true, fondo };
}

/** La luz relativa (0 negro, 1 blanco) de un color r, g, b. Pura. */
export function luzDe(r, g, b) {
  const c = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/** Cuántas luces guarda el tono de un logo: sus cuantiles, de la más oscura a la más clara. */
export const CUANTILES_TONO = 32;

/**
 * El TONO de lo que se ve de una imagen RGBA (sus píxeles opacos): la luz de sus cuantiles, de la más oscura a la más
 * clara (`CUANTILES_TONO`), o null si no se ve nada. No basta la media: un logo rojo con letras azul marino da un
 * medio que contrasta con un fondo azul oscuro, y las letras desaparecen. Pura.
 */
export function tonoDeImagen(datos) {
  const luces = [];
  const paso = Math.max(4, Math.floor(datos.length / 4 / 40000) * 4);
  for (let i = 0; i < datos.length; i += paso) {
    if (datos[i + 3] < 128) continue;
    luces.push(luzDe(datos[i], datos[i + 1], datos[i + 2]));
  }
  if (!luces.length) return null;
  luces.sort((a, b) => a - b);
  return Array.from({ length: CUANTILES_TONO }, (_, k) => luces[Math.min(luces.length - 1, Math.floor(((k + 0.5) / CUANTILES_TONO) * luces.length))]);
}

/** De lo que se ve del logo, más de esta parte sin contraste con el fondo → placa. */
export const SIN_CONTRASTE_MAXIMO = 0.2;

/**
 * ¿Hace falta una placa detrás del logo? Cuando más de `SIN_CONTRASTE_MAXIMO` de lo que se ve del logo no llega a 2 a 1
 * de contraste con el fondo de la escena (las letras oscuras de un logo sobre un fondo oscuro), o, con un tono de un
 * solo número (la media), cuando ese número no llega. Pura.
 */
export function logoNecesitaPlaca(tono, luzFondo) {
  if (tono === null || tono === undefined || !Number.isFinite(luzFondo)) return false;
  const razon = (l) => { const [a, b] = l > luzFondo ? [l, luzFondo] : [luzFondo, l]; return (a + 0.05) / (b + 0.05); };
  if (!Array.isArray(tono)) return Number.isFinite(tono) && razon(tono) < 2;
  if (!tono.length) return false;
  return tono.filter((l) => razon(l) < 2).length / tono.length > SIN_CONTRASTE_MAXIMO;
}
