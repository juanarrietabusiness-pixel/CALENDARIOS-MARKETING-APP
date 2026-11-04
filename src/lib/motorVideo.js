// ============================================================
// El MOTOR del video animado: dibuja un fotograma de un guion en un lienzo 2D (puro)
//
// `dibujarFrame(ctx, …)` pinta el instante `t` de un guion validado
// (src/lib/videoEscenas.js) en un contexto de Canvas 2D. No conoce el navegador:
// no crea lienzos, no carga imágenes ni fuentes y no lee la hora. Así el MISMO
// código dibuja la vista previa en la pantalla y, en la fase 2, cada fotograma
// del render en el Container (con un Canvas 2D de Node). Lo que cambie entre los
// dos tiene que entrar por `recursos` y `fuentes`, nunca por aquí.
//
// Reglas que no se ven y sostienen el render:
//
//   · DETERMINISTA. El mismo guion, la misma línea de tiempo y el mismo `t`
//     dan exactamente las mismas llamadas al lienzo. Nada de Math.random ni de
//     Date: lo «aleatorio» (el grano, el papel, la mancha) sale de una semilla
//     (`semilla`), y el grano cambia por FOTOGRAMA, no por reloj.
//   · COORDENADAS DE SALIDA. Se dibuja en las medidas del formato (1080 × 1920
//     en 9:16) aunque el lienzo sea más pequeño: quien llama escala el contexto
//     antes (`ctx.scale`). El motor nunca toca la transformación de fuera: todo
//     va entre `save()` y `restore()`.
//   · UNA CAPA QUE AÚN NO ENTRA NO SE DIBUJA. Antes de su `entra` y después de
//     su `sale` (más la salida animada) no hay ni una llamada: así un fotograma
//     sólo paga lo que se ve.
//   · LO QUE EL MOTOR AÚN NO DIBUJA SE VE COMO UN MARCADOR con su nombre
//     (`COMPONENTES_LISTOS`): el guion es válido aunque el componente llegue
//     después, y la vista previa no se rompe.
// ============================================================

import { FORMATOS_VIDEO, FPS, tiempoDeCapa } from "./videoEscenas.js";

/** Los componentes que este motor ya dibuja. El resto sale como marcador hasta que se escriban. */
export const COMPONENTES_LISTOS = Object.freeze(["texto", "sello", "imagen", "forma", "logo", "llamado"]);

const FUENTE_RESPALDO = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// ------------------------------------------------------------
// Semillas y suavizados
// ------------------------------------------------------------

/** Un número de 32 bits a partir de un texto (FNV-1a). Pura. */
export function semilla(texto = "") {
  let h = 0x811c9dc5;
  for (const c of String(texto)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Un generador de números entre 0 y 1 a partir de una semilla (mulberry32). Pura. */
export function aleatorio(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const limitar = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const suave = {
  lineal: (p) => p,
  sale: (p) => 1 - (1 - p) ** 3,
  entraSale: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  rebote: (p) => { const c = 1.70158; const c3 = c + 1; return 1 + c3 * (p - 1) ** 3 + c * (p - 1) ** 2; },
};

/** Lo que dura la entrada de una capa según el ritmo del estilo. */
export const DURACION_ENTRADA = Object.freeze({ calmado: 0.6, medio: 0.4, rapido: 0.25 });
export const DURACION_SALIDA = 0.3;

// ------------------------------------------------------------
// Colores
// ------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;
const PALETA_NEUTRA = Object.freeze({
  fondo: "#F6F4EF", superficie: "#FFFFFF", texto: "#1F2430", acento: "#E4572E", apoyo: "#7BA7BC", claro: "#FFFFFF", oscuro: "#1F2430",
});

const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const saturacion = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};
/** El que más contrasta con `fondo` de los dos dados. Pura. */
export function contraste(fondo, a = "#FFFFFF", b = "#111111") {
  const r = (x, y) => { const [l1, l2] = [luminancia(x), luminancia(y)].sort((m, n) => n - m); return (l1 + 0.05) / (l2 + 0.05); };
  return r(fondo, a) >= r(fondo, b) ? a : b;
}

/**
 * La paleta de tokens a partir de la del KIT (`[{ hex, nombre, rol }]`): primero por lo que dice el papel de cada
 * color («fondo», «texto», «CTA», «acento»…), luego por la luz (el más claro es el fondo, el más oscuro el texto, el
 * más saturado que quede, el acento). Lo que no sale del kit queda en la paleta neutra. Pura.
 */
export function paletaDelKit(kitPaleta = []) {
  const colores = (Array.isArray(kitPaleta) ? kitPaleta : []).filter((c) => HEX.test(String(c?.hex ?? "")))
    .map((c) => ({ hex: c.hex.toUpperCase(), rol: String(c.rol ?? "").toLowerCase() }));
  if (!colores.length) return { ...PALETA_NEUTRA };
  const p = {};
  const usar = (token, c) => { if (c && !p[token]) p[token] = c.hex; };
  const porRol = (re) => colores.find((c) => re.test(c.rol) && !Object.values(p).includes(c.hex));
  usar("fondo", porRol(/fondo|background/));
  usar("texto", porRol(/texto|tipograf|estructura|titular/));
  usar("acento", porRol(/acento|cta|bot[oó]n|detalle|llamado/));
  usar("apoyo", porRol(/apoyo|secundari|natural/));
  const libres = () => colores.filter((c) => !Object.values(p).includes(c.hex));
  const claros = [...colores].sort((a, b) => luminancia(b.hex) - luminancia(a.hex));
  if (!p.fondo) usar("fondo", libres().sort((a, b) => luminancia(b.hex) - luminancia(a.hex))[0] ?? claros[0]);
  if (!p.texto) usar("texto", libres().sort((a, b) => luminancia(a.hex) - luminancia(b.hex))[0] ?? claros.at(-1));
  if (!p.acento) usar("acento", libres().sort((a, b) => saturacion(b.hex) - saturacion(a.hex))[0]);
  if (!p.apoyo) usar("apoyo", libres()[0]);
  p.claro = claros[0].hex;
  p.oscuro = claros.at(-1).hex;
  p.superficie = libres().find((c) => luminancia(c.hex) > 0.6)?.hex ?? (luminancia(p.fondo) > 0.5 ? "#FFFFFF" : p.claro);
  return { ...PALETA_NEUTRA, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) };
}

/** La paleta con la que se dibuja: la del kit y, encima, la que fija el guion. Pura. */
export const paletaDelGuion = (guion, kitPaleta = []) => ({ ...paletaDelKit(kitPaleta), ...(guion?.estilo?.paleta ?? {}) });

/** Un token o un #RRGGBB a su color. Pura. */
export const colorDe = (c, paleta) => (HEX.test(String(c ?? "")) ? c : paleta?.[c] ?? PALETA_NEUTRA[c] ?? PALETA_NEUTRA.texto);

// ------------------------------------------------------------
// Dónde va cada cosa
// ------------------------------------------------------------

/**
 * Los puntos con nombre por formato, en fracciones del lienzo. En 9:16 «arriba» baja del 14 % (la barra de
 * Instagram) y «abajo» se queda por encima de los subtítulos y de los botones de la app.
 */
export const PUNTOS = Object.freeze({
  "9:16": { arriba: 0.22, centro: 0.47, abajo: 0.7, izq: 0.27, der: 0.73 },
  "1:1": { arriba: 0.2, centro: 0.48, abajo: 0.74, izq: 0.27, der: 0.73 },
  "16:9": { arriba: 0.2, centro: 0.47, abajo: 0.74, izq: 0.25, der: 0.75 },
});
/** Dónde van los subtítulos (el centro de su tarjeta, en fracción de la altura). */
export const ALTURA_SUBTITULO = Object.freeze({ abajo: { "9:16": 0.83, "1:1": 0.88, "16:9": 0.88 }, centro: 0.5, arriba: 0.14 });

/** El centro de una capa en píxeles del lienzo. Pura. */
export function centroDe(pos, formato, ancho, alto) {
  if (pos && typeof pos === "object") return { x: pos.x * ancho, y: pos.y * alto };
  const k = PUNTOS[formato] ?? PUNTOS["9:16"];
  const [v, h] = String(pos ?? "centro").split("-");
  const y = { arriba: k.arriba, abajo: k.abajo }[v] ?? k.centro;
  const x = { izq: k.izq, der: k.der }[h ?? v] ?? 0.5;
  return { x: x * ancho, y: y * alto };
}

// ------------------------------------------------------------
// Animación de una capa
// ------------------------------------------------------------

/**
 * Cómo está una capa en el instante `t`: si se ve, su opacidad, desplazamiento, escala, giro y cuánto se ha revelado
 * (0–1, para «escribe», «barrido» y «dibuja»). `null` si en ese instante no se dibuja. Pura.
 */
export function estadoDeCapa(capa, momento, t, { ritmo = "medio", lado = 1080 } = {}) {
  const { desde, hasta } = momento;
  const conSalida = capa.animacion?.salida && capa.animacion.salida !== "ninguna";
  if (t < desde || t > hasta + (conSalida ? 0 : 1e-6)) return null;
  const dEntra = DURACION_ENTRADA[ritmo] ?? DURACION_ENTRADA.medio;
  const pe = limitar((t - desde) / dEntra);
  const e = { alfa: 1, dx: 0, dy: 0, escala: 1, giro: 0, revelado: 1 };
  const desp = lado * 0.08;
  switch (capa.animacion?.entrada ?? "aparece") {
    case "aparece": e.alfa = limitar((t - desde) / 0.12); break;
    case "fundido": e.alfa = suave.entraSale(pe); break;
    case "sube": e.alfa = suave.sale(pe); e.dy = desp * (1 - suave.sale(pe)); break;
    case "baja": e.alfa = suave.sale(pe); e.dy = -desp * (1 - suave.sale(pe)); break;
    case "escala": e.alfa = suave.sale(pe); e.escala = 0.6 + 0.4 * suave.sale(pe); break;
    case "rebote": e.alfa = limitar(pe * 3); e.escala = Math.max(0, suave.rebote(pe)); break;
    case "escribe": case "barrido": case "dibuja": e.revelado = suave.sale(pe); break;
    default: break;
  }
  if (conSalida) {
    const ps = limitar((t - (hasta - DURACION_SALIDA)) / DURACION_SALIDA);
    if (ps > 0) {
      if (capa.animacion.salida === "fundido") e.alfa *= 1 - ps;
      if (capa.animacion.salida === "baja") { e.alfa *= 1 - ps; e.dy += desp * suave.entraSale(ps); }
      if (capa.animacion.salida === "escala") { e.alfa *= 1 - ps; e.escala *= 1 - 0.4 * ps; }
    }
  }
  // El bucle cuenta desde que la capa entra: así dos capas que entran en momentos distintos no van al compás.
  const v = t - desde;
  switch (capa.animacion?.bucle ?? "ninguno") {
    case "flota": e.dy += Math.sin((v / 3) * Math.PI * 2) * lado * 0.012; break;
    case "pulso": e.escala *= 1 + Math.sin((v / 1.2) * Math.PI * 2) * 0.035; break;
    case "gira": e.giro += (v / 12) * Math.PI * 2; break;
    case "late": { const f = (v % 1.1) / 1.1; e.escala *= 1 + (f < 0.18 ? Math.sin((f / 0.18) * Math.PI) * 0.07 : 0); break; }
    default: break;
  }
  return e.alfa <= 0.001 || e.escala <= 0.001 ? null : e;
}

// ------------------------------------------------------------
// Texto: medir y partir en líneas
// ------------------------------------------------------------

/** El texto partido en líneas que caben en `ancho` con la fuente que ya tiene `ctx`. */
export function partirEnLineas(ctx, texto, ancho) {
  const lineas = [];
  let actual = "";
  for (const palabra of String(texto ?? "").split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && ctx.measureText(prueba).width > ancho) { lineas.push(actual); actual = palabra; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

const TIPO_POR_ROL = Object.freeze({
  titular: { tam: 0.092, peso: 800, lineas: 3, fuente: "titular", alto: 1.08 },
  apoyo: { tam: 0.052, peso: 500, lineas: 4, fuente: "cuerpo", alto: 1.25 },
  dato: { tam: 0.13, peso: 900, lineas: 2, fuente: "titular", alto: 1.0 },
  etiqueta: { tam: 0.036, peso: 700, lineas: 2, fuente: "cuerpo", alto: 1.2, mayusculas: true },
});

/**
 * La fuente y las líneas de un texto que tiene que caber en `ancho`: se empieza en el tamaño del rol y se baja de 6 en
 * 6 % hasta que entra en sus líneas (o hasta la mitad: si así no cabe, el guion pide demasiado texto).
 */
export function encajarTexto(ctx, texto, { ancho, lado, rol = "titular", familia = FUENTE_RESPALDO }) {
  const r = TIPO_POR_ROL[rol] ?? TIPO_POR_ROL.titular;
  const cuerpo = r.mayusculas ? String(texto).toUpperCase() : String(texto);
  let tam = lado * r.tam;
  let lineas = [];
  for (let i = 0; i < 12; i++) {
    ctx.font = `${r.peso} ${Math.round(tam)}px ${familia}`;
    lineas = partirEnLineas(ctx, cuerpo, ancho);
    const anchoMax = Math.max(0, ...lineas.map((l) => ctx.measureText(l).width));
    if (lineas.length <= r.lineas && anchoMax <= ancho) break;
    tam *= 0.94;
  }
  return { fuente: `${r.peso} ${Math.round(tam)}px ${familia}`, tam, lineas, altoLinea: tam * r.alto };
}

// ------------------------------------------------------------
// Formas básicas
// ------------------------------------------------------------

export function rectRedondo(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function trazarFigura(ctx, figura, w, h, id) {
  ctx.beginPath();
  switch (figura) {
    case "rect": rectRedondo(ctx, -w / 2, -h / 2, w, h, w * 0.08); return;
    case "estrella":
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = (i % 2 ? 0.42 : 1) * (w / 2);
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); return;
    case "flecha":
      ctx.moveTo(-w / 2, -h * 0.14); ctx.lineTo(w * 0.12, -h * 0.14); ctx.lineTo(w * 0.12, -h * 0.34);
      ctx.lineTo(w / 2, 0); ctx.lineTo(w * 0.12, h * 0.34); ctx.lineTo(w * 0.12, h * 0.14); ctx.lineTo(-w / 2, h * 0.14);
      ctx.closePath(); return;
    case "linea": ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); return;
    case "ola": {
      const pasos = 48;
      for (let i = 0; i <= pasos; i++) {
        const x = -w / 2 + (w * i) / pasos;
        const y = Math.sin((i / pasos) * Math.PI * 4) * h * 0.18 - h * 0.1;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); return;
    }
    case "mancha": {
      // Una forma orgánica: ocho radios de la semilla de la capa, unidos con curvas suaves.
      const al = aleatorio(semilla(id));
      const radios = Array.from({ length: 8 }, () => (0.78 + al() * 0.22) * (w / 2));
      const punto = (i) => { const a = (i / 8) * Math.PI * 2; return [Math.cos(a) * radios[i % 8], Math.sin(a) * radios[i % 8]]; };
      const [x0, y0] = punto(0); const [x1, y1] = punto(1);
      ctx.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
      for (let i = 1; i <= 8; i++) {
        const [cx, cy] = punto(i); const [nx, ny] = punto(i + 1);
        ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
      }
      ctx.closePath(); return;
    }
    default: ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.closePath();
  }
}

// ------------------------------------------------------------
// Los componentes
// ------------------------------------------------------------

/** El recuadro (alrededor del origen) que ocupa una imagen dentro de `ancho`, sin pasar de `maxAlto`. */
function cajaDeImagen(img, ancho, maxAlto, recorte) {
  const ia = img?.width && img?.height ? img.width / img.height : 1;
  if (recorte === "cubrir") { const h = Math.min(ancho * 1.25, maxAlto); return { w: ancho, h }; }
  let w = ancho; let h = ancho / ia;
  if (h > maxAlto) { h = maxAlto; w = h * ia; }
  return { w, h };
}

function dibujarImagenEn(ctx, img, w, h, recorte) {
  if (recorte === "cubrir" && img?.width && img?.height) {
    const escala = Math.max(w / img.width, h / img.height);
    const sw = w / escala; const sh = h / escala;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
  } else ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

function marcador(ctx, nombre, w, h, paleta, familia) {
  ctx.save();
  ctx.setLineDash([w * 0.03, w * 0.02]);
  ctx.lineWidth = Math.max(2, w * 0.008);
  ctx.strokeStyle = colorDe("texto", paleta);
  ctx.globalAlpha *= 0.55;
  rectRedondo(ctx, -w / 2, -h / 2, w, h, w * 0.05);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = colorDe("texto", paleta);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // Nunca menos de 28 px de salida: el marcador de un icono pequeño tiene que leerse en la vista previa.
  ctx.font = `600 ${Math.round(Math.max(28, Math.min(w, h) * 0.12))}px ${familia}`;
  ctx.fillText(nombre, 0, 0, w * 0.9);
  ctx.restore();
}

const NOMBRES_MARCADOR = Object.freeze({
  telefono: "Teléfono", burbuja: "Burbuja", personaje: "Personaje", icono: "Icono", cifra: "Cifra", lista: "Lista",
  reloj: "Reloj", antes_despues: "Antes / después",
});

/**
 * Dibuja una capa ya colocada: el origen está en su centro, con el estado de su animación aplicado. Devuelve el alto
 * que ocupó (para pruebas y para quien quiera apilar).
 */
function dibujarCapa(ctx, capa, estado, c) {
  const { paleta, lado, fuentes, recursos } = c;
  const w = capa.tam * lado;
  const titular = fuentes?.titular || FUENTE_RESPALDO;
  const cuerpo = fuentes?.cuerpo || titular;
  switch (capa.tipo) {
    case "texto": {
      const familia = (TIPO_POR_ROL[capa.rol] ?? TIPO_POR_ROL.titular).fuente === "titular" ? titular : cuerpo;
      const { fuente, lineas, altoLinea } = encajarTexto(ctx, capa.texto, { ancho: w, lado, rol: capa.rol, familia });
      ctx.font = fuente;
      const alto = lineas.length * altoLinea;
      const anchos = lineas.map((l) => ctx.measureText(l).width);
      if (capa.placa) {
        const pad = lado * 0.035;
        const pw = Math.max(...anchos) + pad * 2;
        ctx.fillStyle = colorDe(capa.placa, paleta);
        const x0 = capa.alinear === "izq" ? -w / 2 - pad : capa.alinear === "der" ? w / 2 - pw + pad : -pw / 2;
        rectRedondo(ctx, x0, -alto / 2 - pad * 0.7, pw, alto + pad * 1.4, lado * 0.025);
        ctx.fill();
      }
      ctx.fillStyle = colorDe(capa.color, paleta);
      ctx.textBaseline = "middle";
      ctx.textAlign = capa.alinear === "izq" ? "left" : capa.alinear === "der" ? "right" : "center";
      const x = capa.alinear === "izq" ? -w / 2 : capa.alinear === "der" ? w / 2 : 0;
      // «Escribe» revela las letras en orden; las demás entradas enseñan el texto entero.
      const total = lineas.reduce((n, l) => n + l.length, 0);
      let quedan = capa.animacion?.entrada === "escribe" ? Math.round(total * estado.revelado) : total;
      lineas.forEach((l, i) => {
        const trozo = l.slice(0, Math.max(0, quedan));
        quedan -= l.length;
        if (trozo) ctx.fillText(trozo, x, -alto / 2 + altoLinea * (i + 0.5));
      });
      return alto;
    }
    case "sello": {
      const { fuente, lineas, altoLinea } = encajarTexto(ctx, capa.texto, { ancho: w * 0.84, lado, rol: "titular", familia: titular });
      ctx.font = fuente;
      const h = lineas.length * altoLinea + lado * 0.06;
      ctx.rotate((capa.rotacion * Math.PI) / 180);
      ctx.fillStyle = colorDe(capa.color, paleta);
      rectRedondo(ctx, -w / 2, -h / 2, w, h, lado * 0.02);
      ctx.fill();
      ctx.strokeStyle = contraste(colorDe(capa.color, paleta), colorDe("claro", paleta), colorDe("oscuro", paleta));
      ctx.lineWidth = lado * 0.006;
      rectRedondo(ctx, -w / 2 + lado * 0.014, -h / 2 + lado * 0.014, w - lado * 0.028, h - lado * 0.028, lado * 0.012);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      lineas.forEach((l, i) => ctx.fillText(l.toUpperCase(), 0, -((lineas.length - 1) * altoLinea) / 2 + i * altoLinea));
      return h;
    }
    case "imagen": {
      const img = recursos?.imagen?.(capa.archivo) ?? null;
      const { w: iw, h: ih } = cajaDeImagen(img, w, c.alto * 0.55, capa.recorte);
      if (!img) { marcador(ctx, "Imagen", iw, ih, paleta, cuerpo); return ih; }
      if (capa.marco) {
        ctx.save();
        ctx.fillStyle = colorDe("superficie", paleta);
        ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = lado * 0.03; ctx.shadowOffsetY = lado * 0.01;
        const m = lado * 0.02;
        rectRedondo(ctx, -iw / 2 - m, -ih / 2 - m, iw + m * 2, ih + m * 2, lado * 0.02);
        ctx.fill();
        ctx.restore();
      }
      dibujarImagenEn(ctx, img, iw, ih, capa.recorte);
      return ih;
    }
    case "forma": {
      const h = capa.figura === "ola" || capa.figura === "flecha" ? w * 0.45 : capa.figura === "linea" ? lado * 0.01 : w;
      ctx.rotate(estado.giro);
      trazarFigura(ctx, capa.figura, w, h, capa.id);
      const color = colorDe(capa.color, paleta);
      if (capa.relleno && capa.figura !== "linea") { ctx.fillStyle = color; ctx.fill(); } else {
        ctx.strokeStyle = color; ctx.lineWidth = lado * 0.012; ctx.lineCap = "round"; ctx.stroke();
      }
      return h;
    }
    case "logo": {
      const img = recursos?.logo ?? null;
      const { w: lw, h: lh } = cajaDeImagen(img, w, c.alto * 0.3, "contener");
      if (!img) { marcador(ctx, "Logo", lw, lh, paleta, cuerpo); return lh; }
      dibujarImagenEn(ctx, img, lw, lh, "contener");
      return lh;
    }
    case "llamado": {
      const { fuente, lineas, tam } = encajarTexto(ctx, capa.texto, { ancho: w * 0.84, lado, rol: "apoyo", familia: titular });
      const negrita = fuente.replace(/^\d+/, "800");
      ctx.font = negrita;
      const h = Math.max(tam * 2.2, lado * 0.11) + (lineas.length - 1) * tam * 1.2;
      ctx.fillStyle = colorDe(capa.fondo, paleta);
      rectRedondo(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = colorDe(capa.color, paleta);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      lineas.forEach((l, i) => ctx.fillText(l, 0, -((lineas.length - 1) * tam * 1.2) / 2 + i * tam * 1.2));
      return h;
    }
    default: {
      const h = capa.tipo === "telefono" ? w * 2 : w * 0.6;
      marcador(ctx, NOMBRES_MARCADOR[capa.tipo] ?? capa.tipo, w, h, paleta, cuerpo);
      return h;
    }
  }
}

// ------------------------------------------------------------
// Fondo, grano y escenas
// ------------------------------------------------------------

function dibujarFondo(ctx, fondo, ancho, alto, paleta, id) {
  const a = colorDe(fondo?.color ?? "fondo", paleta);
  const b = colorDe(fondo?.color2 ?? "superficie", paleta);
  ctx.save();
  if (fondo?.tipo === "degradado") {
    const g = ctx.createLinearGradient(0, 0, 0, alto);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g;
  } else ctx.fillStyle = a;
  ctx.fillRect(0, 0, ancho, alto);
  const lado = Math.min(ancho, alto);
  if (fondo?.tipo === "rayas") {
    ctx.strokeStyle = b; ctx.globalAlpha = 0.18; ctx.lineWidth = lado * 0.03;
    for (let x = -alto; x < ancho; x += lado * 0.09) { ctx.beginPath(); ctx.moveTo(x, alto); ctx.lineTo(x + alto, 0); ctx.stroke(); }
  } else if (fondo?.tipo === "puntos") {
    ctx.fillStyle = b; ctx.globalAlpha = 0.28;
    const paso = lado * 0.06;
    for (let y = paso / 2; y < alto; y += paso) for (let x = paso / 2; x < ancho; x += paso) { ctx.beginPath(); ctx.arc(x, y, lado * 0.006, 0, Math.PI * 2); ctx.fill(); }
  } else if (fondo?.tipo === "papel") {
    // Fibras del papel: la semilla es la escena, así no «hierven» de un fotograma a otro.
    const al = aleatorio(semilla(`papel:${id}`));
    ctx.strokeStyle = contraste(a, "#FFFFFF", "#000000"); ctx.lineWidth = Math.max(1, lado * 0.0015);
    for (let i = 0; i < 160; i++) {
      ctx.globalAlpha = 0.03 + al() * 0.05;
      const x = al() * ancho; const y = al() * alto; const l = lado * (0.01 + al() * 0.03); const g = al() * Math.PI;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(g) * l, y + Math.sin(g) * l); ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * El ruido del grano: un cuadro de `lado` × `lado` en RGBA (gris con alfa), de la semilla dada. Quien llama lo
 * convierte en imagen (un lienzo) una vez y lo pasa en `recursos.grano`. Pura.
 */
export function ruidoDeGrano(lado = 256, s = 1) {
  const al = aleatorio(s);
  const datos = new Uint8ClampedArray(lado * lado * 4);
  for (let i = 0; i < lado * lado; i++) {
    const v = Math.round(al() * 255);
    datos[i * 4] = v; datos[i * 4 + 1] = v; datos[i * 4 + 2] = v; datos[i * 4 + 3] = 255;
  }
  return datos;
}

function dibujarGrano(ctx, tile, intensidad, frame, ancho, alto) {
  if (!tile || !(intensidad > 0) || !ctx.createPattern) return;
  const patron = ctx.createPattern(tile, "repeat");
  if (!patron) return;
  const al = aleatorio(semilla(`grano:${frame}`));
  ctx.save();
  ctx.globalAlpha = Math.min(0.5, intensidad * 0.42);
  ctx.globalCompositeOperation = "overlay";
  ctx.translate(-Math.floor(al() * (tile.width || 256)), -Math.floor(al() * (tile.height || 256)));
  ctx.fillStyle = patron;
  ctx.fillRect(0, 0, ancho + (tile.width || 256), alto + (tile.height || 256));
  ctx.restore();
}

/** Una escena entera en el instante `t` (fondo y capas), sin transición ni grano. */
function dibujarEscena(ctx, escena, momento, t, c) {
  dibujarFondo(ctx, escena.fondo, c.ancho, c.alto, c.paleta, escena.id);
  const capas = escena.capas?.length ? escena.capas : (escena.pantalla
    ? [{ id: `${escena.id}-pantalla`, tipo: "texto", texto: escena.pantalla, rol: "titular", color: "texto", placa: "", alinear: "centro", pos: "centro", tam: 0.84, entra: { s: 0 }, sale: null, animacion: { entrada: "sube", salida: "ninguna", bucle: "ninguno" } }]
    : []);
  for (const capa of capas) {
    const cuando = tiempoDeCapa(capa, momento);
    const estado = estadoDeCapa(capa, cuando, t, { ritmo: c.ritmo, lado: c.lado });
    if (!estado) continue;
    const { x, y } = centroDe(capa.pos, c.formato, c.ancho, c.alto);
    ctx.save();
    ctx.globalAlpha *= estado.alfa;
    ctx.translate(x + estado.dx, y + estado.dy);
    if (estado.escala !== 1) ctx.scale(estado.escala, estado.escala);
    if (estado.giro && capa.tipo !== "forma") ctx.rotate(estado.giro);
    // Barrido y dibuja: la capa se descubre de izquierda a derecha.
    if (estado.revelado < 1 && ["barrido", "dibuja"].includes(capa.animacion?.entrada)) {
      ctx.beginPath();
      ctx.rect(-c.lado, -c.alto, c.lado * 2 * estado.revelado, c.alto * 2);
      ctx.clip();
    }
    dibujarCapa(ctx, capa, estado, c);
    ctx.restore();
  }
}

/** La escena que se ve en `t` (la última que empezó). Pura. */
export function escenaEn(linea, t) {
  const es = linea?.escenas ?? [];
  let k = 0;
  for (let i = 0; i < es.length; i++) if (t >= es[i].desde) k = i;
  return k;
}

/**
 * Dibuja el fotograma del instante `t` de un guion.
 *   guion   — validado (`validarGuion().guion`)
 *   linea   — `lineaDeTiempo(guion, palabras)`
 *   formato — uno de FORMATOS_VIDEO (el primero del guion si no se dice)
 *   paleta  — `paletaDelGuion(guion, kit.paleta)`
 *   recursos — { imagen(id) → imagen | null, logo, grano } (imágenes ya cargadas, o nada: sale el marcador)
 *   fuentes — { titular, cuerpo }: familias ya registradas
 * El contexto se escala por fuera: aquí se dibuja en las medidas del formato.
 */
export function dibujarFrame(ctx, { guion, linea, t = 0, formato, paleta, recursos = {}, fuentes = {} }) {
  const f = formato ?? guion?.formatos?.[0] ?? "9:16";
  const { ancho, alto } = FORMATOS_VIDEO[f] ?? FORMATOS_VIDEO["9:16"];
  const c = {
    ancho, alto, lado: Math.min(ancho, alto), formato: f, paleta: paleta ?? paletaDelGuion(guion),
    ritmo: guion?.estilo?.ritmo ?? "medio", recursos, fuentes,
  };
  const escenas = guion?.escenas ?? [];
  ctx.save();
  if (!escenas.length) {
    ctx.fillStyle = c.paleta.fondo; ctx.fillRect(0, 0, ancho, alto); ctx.restore(); return;
  }
  const k = escenaEn(linea, t);
  const escena = escenas[k];
  const momento = linea.escenas[k];
  const tr = escena.transicion ?? { tipo: "corte", dur: 0 };
  const p = k > 0 && tr.tipo !== "corte" && tr.dur > 0 ? limitar((t - momento.desde) / tr.dur) : 1;
  if (p < 1) {
    // La anterior se queda quieta en su último fotograma mientras entra la nueva.
    const previa = linea.escenas[k - 1];
    dibujarEscena(ctx, escenas[k - 1], previa, previa.hasta - 1 / FPS, c);
    const q = suave.entraSale(p);
    ctx.save();
    if (tr.tipo === "fundido") ctx.globalAlpha = q;
    if (tr.tipo === "barrido") { ctx.beginPath(); ctx.rect(0, 0, ancho * q, alto); ctx.clip(); }
    if (tr.tipo === "deslizar") ctx.translate(ancho * (1 - q), 0);
    if (tr.tipo === "zoom") {
      ctx.globalAlpha = q;
      const s = 1.15 - 0.15 * q;
      ctx.translate(ancho / 2, alto / 2); ctx.scale(s, s); ctx.translate(-ancho / 2, -alto / 2);
    }
    dibujarEscena(ctx, escena, momento, t, c);
    ctx.restore();
  } else dibujarEscena(ctx, escena, momento, t, c);
  dibujarGrano(ctx, recursos.grano, guion?.estilo?.grano ?? 0, Math.round(t * FPS), ancho, alto);
  ctx.restore();
}

/** Los fotogramas de un video de `segundos`. Pura. */
export const framesDe = (segundos) => Math.max(1, Math.ceil(segundos * FPS));
