// ============================================================
// El PERSONAJE del video animado, dibujado con código (puro: lo comparten la vista previa y el render del Container)
//
// Una figura plana de la casa —bebé, niño o adulto— con cinco expresiones (neutral, feliz, triste, preocupado, dormido)
// y seis poses. NO es el personaje de ninguna marca ajena: el aspecto (piel, pelo, ropa, un accesorio) lo pone cada
// cliente en su kit (`kit.personajeVideo`) y así sale IGUAL en todos sus videos: el bebé de Baby Caleb es siempre el
// mismo bebé.
//
// Se dibuja en una rejilla de 100 × 120 (el origen en el centro) que se escala a la caja que le da el reparto. Sólo
// primitivas del lienzo (arc, bezierCurveTo, lineTo): ni Path2D ni ellipse, que el lienzo del Container no garantiza.
// Las animaciones salen de `vida` (los segundos desde que entró): parpadeo, la lágrima que cae, las «Z» del sueño, el
// saludo. Deterministas: el mismo instante da el mismo dibujo.
// ============================================================

/** Las expresiones y lo que se puede llevar encima. */
export const EXPRESIONES_PERSONAJE = Object.freeze(["neutral", "feliz", "triste", "preocupado", "dormido"]);
export const ACCESORIOS_PERSONAJE = Object.freeze(["ninguno", "chupete", "lazo", "gorro"]);

/** Los tokens de color de la marca (los mismos que `TOKENS_COLOR` de videoEscenas.js: un test lo exige). */
export const TOKENS_ROPA = Object.freeze(["fondo", "superficie", "texto", "acento", "apoyo", "claro", "oscuro"]);
const HEX = /^#[0-9a-f]{6}$/i;

/** El aspecto de partida: piel cálida, pelo castaño, la ropa del color de apoyo de la marca. */
export const ASPECTO_POR_DEFECTO = Object.freeze({ piel: "#F3C7A6", pelo: "#6B4423", ropa: "apoyo", accesorio: "ninguno", nombre: "" });

/**
 * El aspecto limpio de un personaje (el del kit o el del guion): piel y pelo #RRGGBB (pelo vacío = sin pelo), ropa un
 * token de la marca o #RRGGBB, un accesorio de la lista y su nombre (≤ 40, para la persona). Lo que no vale vuelve a lo
 * de partida. Pura.
 */
export function limpiarPersonaje(p) {
  const o = p && typeof p === "object" && !Array.isArray(p) ? p : {};
  const hex = (v, def) => (HEX.test(String(v ?? "")) ? String(v).toUpperCase() : def);
  return {
    piel: hex(o.piel, ASPECTO_POR_DEFECTO.piel),
    pelo: o.pelo === "" || o.pelo === "ninguno" ? "" : hex(o.pelo, ASPECTO_POR_DEFECTO.pelo),
    ropa: TOKENS_ROPA.includes(o.ropa) ? o.ropa : hex(o.ropa, ASPECTO_POR_DEFECTO.ropa),
    accesorio: ACCESORIOS_PERSONAJE.includes(o.accesorio) ? o.accesorio : "ninguno",
    nombre: String(o.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
    // La MASCOTA de la marca: una imagen de la galería por pose (`imagenesDePoses`). Sólo si la hay.
    ...(Object.keys(imagenesDePoses(o.imagenes)).length ? { imagenes: imagenesDePoses(o.imagenes) } : {}),
  };
}

/** Las poses de la pieza «personaje» (las mismas del formato de escenas). */
export const POSES_PERSONAJE = Object.freeze(["de-pie", "saluda", "senala", "piensa", "celebra", "preocupado"]);

/**
 * Las imágenes de la MASCOTA de una marca (si la tiene: el bebé vikingo, un muñeco, un animal), una por pose: { pose: id
 * de la galería }. Con ellas, la pieza «personaje» dibuja la mascota y no la figura genérica de la casa. Pura.
 */
export function imagenesDePoses(v) {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  return Object.fromEntries(POSES_PERSONAJE.map((p) => [p, String(o[p] ?? "").trim()]).filter(([, id]) => /^[\w-]{1,64}$/.test(id)));
}

/** La imagen de la mascota para una pose: la de esa pose, o la de pie, o la primera que haya. → id o null. Pura. */
export function imagenDePose(aspecto, pose) {
  const imgs = aspecto?.imagenes ?? {};
  return imgs[pose] ?? imgs["de-pie"] ?? Object.values(imgs)[0] ?? null;
}

/** ¿Trae algo un aspecto? (para no guardar uno vacío). Pura. */
export const tieneAspecto = (p) => Boolean(p && typeof p === "object" && ["piel", "pelo", "ropa", "accesorio", "nombre", "imagenes"].some((k) => p[k] !== undefined));

/** El guion con el personaje del KIT del cliente si no trae uno propio (lo hacen la vista previa y el servidor). Pura. */
export function conPersonajeDelKit(guion, kit) {
  if (!guion?.estilo || guion.estilo.personaje || !tieneAspecto(kit?.personajeVideo)) return guion;
  return { ...guion, estilo: { ...guion.estilo, personaje: limpiarPersonaje(kit.personajeVideo) } };
}

/** La rejilla y cuánto mide de alto la figura respecto a su ancho. */
export const PROPORCION_PERSONAJE = 1.2;

/** La expresión de una capa: la que diga, o la que sugiere su pose (preocupado → preocupado, celebra → feliz). Pura. */
export function expresionDe(capa = {}) {
  if (EXPRESIONES_PERSONAJE.includes(capa.expresion)) return capa.expresion;
  if (capa.pose === "preocupado") return "preocupado";
  if (capa.pose === "celebra") return "feliz";
  return "neutral";
}

/** Dónde va cada parte según la variante (en la rejilla de 100 × 120, origen en el centro). */
const CUERPOS = Object.freeze({
  bebe: { cabeza: { x: 0, y: -20, r: 30 }, torso: { y0: 6, y1: 48, w: 54 }, piernas: { y: 50, largo: 6, ancho: 15 }, hombro: { x: 22, y: 16 }, brazo: 9, mano: 6 },
  nino: { cabeza: { x: 0, y: -33, r: 21 }, torso: { y0: -10, y1: 30, w: 42 }, piernas: { y: 30, largo: 24, ancho: 12 }, hombro: { x: 19, y: -4 }, brazo: 8, mano: 5 },
  adulto: { cabeza: { x: 0, y: -40, r: 16 }, torso: { y0: -22, y1: 24, w: 40 }, piernas: { y: 24, largo: 34, ancho: 12 }, hombro: { x: 19, y: -17 }, brazo: 7.5, mano: 4.5 },
});

/** Un color un poco más oscuro (para el contorno y la boca): mezcla con el contorno. */
function oscurecer(hex, f = 0.35) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!m) return "#3A2A22";
  const n = parseInt(m[1], 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - f)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const circulo = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
/** Un óvalo con arc escalado (sin `ellipse`). */
function ovalo(ctx, x, y, rx, ry) {
  ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.restore();
}

/** Dónde acaba cada mano según la pose (lado: 1 derecha, -1 izquierda). */
function manoDe(pose, lado, b, vida) {
  const { hombro: s, cabeza: h } = b;
  const abajo = { x: lado * (s.x + 6), y: s.y + b.torso.y1 * 0.15 + 22 };
  switch (pose) {
    case "saluda": return lado === 1 ? { x: s.x + 14 + Math.sin(vida * 7) * 3, y: s.y - 30 } : abajo;
    case "senala": return lado === 1 ? { x: s.x + 26, y: s.y - 4 } : abajo;
    case "piensa": return lado === 1 ? { x: h.x + h.r * 0.35, y: h.y + h.r * 0.98 } : { x: -s.x + 4, y: s.y + 18 };
    case "celebra": return { x: lado * (s.x + 12 + Math.sin(vida * 6 + lado) * 2), y: s.y - 34 };
    case "preocupado": return { x: h.x + lado * h.r * 0.72, y: h.y + h.r * 0.48 };
    default: return abajo;
  }
}

/** Los ojos según la expresión (con su parpadeo). */
function ojos(ctx, h, expr, vida, tinta) {
  const ox = h.r * 0.36;
  const oy = h.y - h.r * 0.02;
  const tam = h.r * 0.1;
  ctx.strokeStyle = tinta; ctx.fillStyle = tinta; ctx.lineCap = "round"; ctx.lineWidth = h.r * 0.07;
  // Parpadea cada 3,4 s (0,12 s cerrado), menos cuando duerme o sonríe con los ojos.
  const parpadea = vida % 3.4 > 3.28;
  for (const l of [-1, 1]) {
    const x = h.x + l * ox;
    if (expr === "dormido" || (parpadea && expr !== "feliz")) {
      ctx.beginPath(); ctx.arc(x, oy - tam * 0.3, tam * 1.2, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    } else if (expr === "feliz") {
      ctx.beginPath(); ctx.arc(x, oy + tam * 0.6, tam * 1.2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else {
      circulo(ctx, x, oy, expr === "preocupado" ? tam * 1.15 : tam); ctx.fill();
      // El brillo del ojo.
      ctx.save(); ctx.fillStyle = "#FFFFFF"; circulo(ctx, x + tam * 0.35, oy - tam * 0.35, tam * 0.35); ctx.fill(); ctx.restore();
    }
  }
  // Las cejas: tristes y preocupadas, con la parte de dentro arriba.
  if (expr === "triste" || expr === "preocupado") {
    const subir = expr === "preocupado" ? 0.55 : 0.4;
    for (const l of [-1, 1]) {
      const x = h.x + l * ox;
      ctx.beginPath();
      ctx.moveTo(x - l * tam * 1.3, oy - tam * (2.4 + subir * 1.6));
      ctx.lineTo(x + l * tam * 1.1, oy - tam * 2.1);
      ctx.stroke();
    }
  }
}

/** La boca según la expresión (o el chupete). */
function boca(ctx, h, expr, accesorio, ropa, tinta) {
  const y = h.y + h.r * 0.42;
  const a = h.r * 0.22;
  ctx.strokeStyle = tinta; ctx.lineCap = "round"; ctx.lineWidth = h.r * 0.065;
  if (accesorio === "chupete" && expr !== "feliz") {
    ctx.fillStyle = ropa; ovalo(ctx, h.x, y + h.r * 0.02, a * 1.2, a * 0.75); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; circulo(ctx, h.x, y + h.r * 0.02, a * 0.38); ctx.fill();
    return;
  }
  ctx.beginPath();
  switch (expr) {
    case "feliz":
      ctx.fillStyle = oscurecer("#E07A6A", 0.25);
      ctx.moveTo(h.x - a * 1.2, y - a * 0.2); ctx.quadraticCurveTo(h.x, y + a * 1.6, h.x + a * 1.2, y - a * 0.2); ctx.closePath(); ctx.fill();
      return;
    case "triste": ctx.arc(h.x, y + a * 0.9, a, Math.PI * 1.2, Math.PI * 1.8); break;
    case "preocupado":
      ctx.moveTo(h.x - a, y + a * 0.2); ctx.bezierCurveTo(h.x - a * 0.4, y - a * 0.4, h.x + a * 0.4, y + a * 0.7, h.x + a, y + a * 0.1); break;
    case "dormido": circulo(ctx, h.x, y + a * 0.2, a * 0.32); ctx.stroke(); return;
    default: ctx.arc(h.x, y - a * 0.5, a, Math.PI * 0.2, Math.PI * 0.8);
  }
  ctx.stroke();
}

/** Lo que acompaña a la expresión y se mueve: la lágrima, la gota de sudor, las «Z». */
function extras(ctx, h, expr, vida, tinta) {
  if (expr === "triste") {
    // Una lágrima que cae de un ojo y vuelve a salir.
    const p = (vida % 1.8) / 1.8;
    ctx.save(); ctx.globalAlpha *= 1 - p * 0.5; ctx.fillStyle = "#4FA8E0"; ctx.strokeStyle = tinta; ctx.lineWidth = h.r * 0.03;
    const x = h.x + h.r * 0.4; const y = h.y + h.r * 0.2 + p * h.r * 0.45; const g = h.r * 0.13;
    ctx.beginPath(); ctx.moveTo(x, y - g * 1.6); ctx.quadraticCurveTo(x + g, y - g * 0.1, x, y + g); ctx.quadraticCurveTo(x - g, y - g * 0.1, x, y - g * 1.6); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (expr === "preocupado") {
    ctx.save(); ctx.fillStyle = "#6CC0EE"; ctx.strokeStyle = tinta; ctx.lineWidth = h.r * 0.03;
    const x = h.x + h.r * 0.98; const y = h.y - h.r * 0.42 + Math.sin(vida * 3) * h.r * 0.03;
    ctx.beginPath(); ctx.moveTo(x, y - h.r * 0.16); ctx.quadraticCurveTo(x + h.r * 0.12, y + h.r * 0.02, x, y + h.r * 0.07); ctx.quadraticCurveTo(x - h.r * 0.12, y + h.r * 0.02, x, y - h.r * 0.16); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (expr === "dormido") {
    // Tres «Z» que suben y se apagan, a destiempo.
    ctx.save(); ctx.strokeStyle = tinta; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let i = 0; i < 3; i++) {
      const p = ((vida + i * 0.8) % 2.4) / 2.4;
      const s = h.r * (0.22 + i * 0.07);
      const x = h.x + h.r * (0.85 + p * 0.3 + i * 0.1);
      const y = h.y - h.r * (0.55 + p * 0.55 + i * 0.12);
      ctx.globalAlpha = Math.sin(Math.PI * p);
      ctx.lineWidth = Math.max(1, s * 0.22);
      ctx.beginPath(); ctx.moveTo(x - s / 2, y - s / 2); ctx.lineTo(x + s / 2, y - s / 2); ctx.lineTo(x - s / 2, y + s / 2); ctx.lineTo(x + s / 2, y + s / 2); ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Dibuja el personaje centrado en el origen, en una caja de `ancho` × `ancho · 1,2`. `aspecto` ya limpio (piel, pelo,
 * ropa, accesorio), `colorDe(token|#hex)` resuelve los tokens de la marca. → { w, h }. Pura salvo por dibujar.
 */
export function dibujarPersonaje(ctx, { variante = "bebe", pose = "de-pie", expresion = "neutral", aspecto = ASPECTO_POR_DEFECTO, vida = 0, ancho, colorDe = (c) => c }) {
  const b = CUERPOS[variante] ?? CUERPOS.bebe;
  const a = { ...ASPECTO_POR_DEFECTO, ...(aspecto ?? {}) };
  const piel = a.piel;
  const ropa = colorDe(a.ropa) || "#7FB3D5";
  const contorno = oscurecer(piel, 0.62);
  const k = ancho / 100;
  ctx.save();
  ctx.scale(k, k);
  // Respira dormido; da un saltito feliz.
  if (expresion === "dormido") ctx.scale(1, 1 + Math.sin(vida * 2.2) * 0.012);
  if (expresion === "feliz") ctx.translate(0, -Math.abs(Math.sin(vida * 4)) * 2);
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = 2.2; ctx.strokeStyle = contorno;

  // Piernas (o los pies del bebé).
  const pie = b.piernas;
  for (const l of [-1, 1]) {
    ctx.fillStyle = variante === "bebe" ? ropa : oscurecer(ropa, 0.25);
    const x = l * b.torso.w * 0.22;
    if (variante === "bebe") { ovalo(ctx, x, pie.y + 2, pie.ancho * 0.6, pie.largo + 2); ctx.fill(); ctx.stroke(); }
    else {
      ctx.beginPath(); ctx.moveTo(x - pie.ancho / 2, pie.y); ctx.lineTo(x + pie.ancho / 2, pie.y); ctx.lineTo(x + pie.ancho / 2 - 1, pie.y + pie.largo); ctx.lineTo(x - pie.ancho / 2 + 1, pie.y + pie.largo); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = contorno; ovalo(ctx, x + l * 2, pie.y + pie.largo + 1, pie.ancho * 0.6, 3); ctx.fill();
    }
  }

  // El torso: un mameluco redondeado (bebé) o una camiseta.
  const t = b.torso;
  ctx.fillStyle = ropa;
  ctx.beginPath();
  ctx.moveTo(-t.w / 2 + 6, t.y0);
  ctx.quadraticCurveTo(-t.w / 2, t.y0, -t.w / 2, t.y0 + 8);
  ctx.lineTo(-t.w / 2 + (variante === "bebe" ? -2 : 2), t.y1 - 6);
  ctx.quadraticCurveTo(-t.w / 2 + 2, t.y1, -t.w / 2 + 10, t.y1);
  ctx.lineTo(t.w / 2 - 10, t.y1);
  ctx.quadraticCurveTo(t.w / 2 - 2, t.y1, t.w / 2 - (variante === "bebe" ? -2 : 2), t.y1 - 6);
  ctx.lineTo(t.w / 2, t.y0 + 8);
  ctx.quadraticCurveTo(t.w / 2, t.y0, t.w / 2 - 6, t.y0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (variante === "bebe") {
    // Los botones del mameluco.
    ctx.fillStyle = "#FFFFFF";
    for (const y of [t.y0 + 14, t.y0 + 24]) { circulo(ctx, 0, y, 1.8); ctx.fill(); }
  }

  // La cabeza, las mejillas y el pelo.
  const h = b.cabeza;
  ctx.fillStyle = piel; circulo(ctx, h.x, h.y, h.r); ctx.fill(); ctx.stroke();
  for (const l of [-1, 1]) { circulo(ctx, h.x + l * h.r * 0.36 * 1.6, h.y + h.r * 0.3, h.r * 0.14); ctx.save(); ctx.globalAlpha *= 0.45; ctx.fillStyle = "#F28C8C"; ctx.fill(); ctx.restore(); }
  if (a.pelo) {
    ctx.fillStyle = a.pelo; ctx.strokeStyle = oscurecer(a.pelo, 0.3);
    if (variante === "bebe") {
      // Un rizo arriba.
      ctx.beginPath(); ctx.moveTo(h.x - 4, h.y - h.r + 1);
      ctx.bezierCurveTo(h.x - 8, h.y - h.r - 10, h.x + 9, h.y - h.r - 12, h.x + 5, h.y - h.r - 3);
      ctx.bezierCurveTo(h.x + 3, h.y - h.r - 7, h.x - 1, h.y - h.r - 6, h.x + 1, h.y - h.r + 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 1.02, Math.PI * 1.02, Math.PI * 1.98);
      ctx.quadraticCurveTo(h.x + h.r * 0.2, h.y - h.r * 0.5, h.x - h.r, h.y - h.r * 0.05); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = contorno;
  }
  if (a.accesorio === "gorro") {
    ctx.fillStyle = ropa; ctx.beginPath(); ctx.arc(h.x, h.y - h.r * 0.15, h.r * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#FFFFFF"; circulo(ctx, h.x, h.y - h.r * 1.12, h.r * 0.16); ctx.fill(); ctx.stroke();
  }
  if (a.accesorio === "lazo") {
    ctx.fillStyle = ropa;
    const lx = h.x + h.r * 0.55; const ly = h.y - h.r * 0.78; const s = h.r * 0.24;
    for (const l of [-1, 1]) { ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + l * s * 1.4, ly - s * 0.8); ctx.lineTo(lx + l * s * 1.4, ly + s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    circulo(ctx, lx, ly, s * 0.45); ctx.fill(); ctx.stroke();
  }

  // La cara.
  ojos(ctx, h, expresion, vida, contorno);
  boca(ctx, h, expresion, a.accesorio, ropa, contorno);

  // Los brazos (encima: en «preocupado» y «piensa» las manos tocan la cara).
  for (const l of [-1, 1]) {
    const s = { x: l * b.hombro.x, y: b.hombro.y };
    const m = manoDe(pose, l, b, vida);
    const codo = { x: (s.x + m.x) / 2 + l * 6, y: (s.y + m.y) / 2 + 4 };
    ctx.strokeStyle = contorno; ctx.lineWidth = b.brazo + 2.2;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(codo.x, codo.y, m.x, m.y); ctx.stroke();
    ctx.strokeStyle = ropa; ctx.lineWidth = b.brazo;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(codo.x, codo.y, m.x, m.y); ctx.stroke();
    ctx.fillStyle = piel; ctx.strokeStyle = contorno; ctx.lineWidth = 2.2;
    circulo(ctx, m.x, m.y, b.mano); ctx.fill(); ctx.stroke();
  }

  extras(ctx, h, expresion, vida, contorno);
  ctx.restore();
  return { w: ancho, h: ancho * PROPORCION_PERSONAJE };
}
