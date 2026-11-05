// ============================================================
// Los componentes del video animado que salían como MARCADOR: lista, burbuja, reloj, antes y después, y teléfono
//
// Puros y deterministas, como el motor (src/lib/motorVideo.js): dibujan en un contexto 2D ya creado, con el origen en
// el centro de la capa, en el ancho que les dio el reparto, y devuelven { w, h } (lo que ocupan: el reparto los mide
// con este MISMO código). Lo que cambia con el tiempo sale de `vida` (segundos desde que entró la capa; Infinity al
// medir: todo puesto). Sin Path2D ni ellipse: el lienzo del Container no los garantiza.
//
// Los ayudantes del motor llegan en `h` (colorDe, colorLegible, rectRedondo, partirEnLineas, la imagen de la galería):
// importarlos de motorVideo.js sería circular.
// ============================================================

/** Lo que tarda en entrar cada ítem de una lista (o cada mensaje de un teléfono) desde que le toca. */
const ENTRADA_ITEM = 0.28;
const sale = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
const visto = (vida, desde) => (Number.isFinite(vida) ? sale((vida - desde) / ENTRADA_ITEM) : 1);

/**
 * LISTA o pasos: cada ítem con su marca (número en un círculo, o un punto) y su texto, entrando uno tras otro cada
 * `cada` segundos (el ESCALONADO: sin escribir un ancla por ítem). Una línea por ítem; si no cabe, la letra se encoge.
 */
export function dibujarLista(ctx, capa, h) {
  const { w, lado, maxAlto, vida, cuerpo } = h;
  const items = (capa.items ?? []).slice(0, 6);
  // Letra de lectura (no de nota al pie): cada ítem en una o dos líneas; sólo si no cabe de alto, se encoge.
  let tam = lado * 0.05;
  const marca = () => tam * 1.3;
  const sep = () => marca() * 0.5;
  const disponible = () => w - marca() - sep();
  const partir = () => {
    ctx.font = `700 ${Math.round(tam)}px ${cuerpo}`;
    return items.map((t) => h.partir(ctx, t, disponible()).slice(0, 2));
  };
  let lineas = partir();
  const altoDe = (ls) => ls.reduce((a, l) => a + Math.max(marca(), l.length * tam * 1.2), 0) + Math.max(0, ls.length - 1) * tam * 0.55;
  for (let i = 0; i < 20 && altoDe(lineas) > maxAlto && tam > lado * 0.032; i++) { tam *= 0.94; lineas = partir(); }
  const alto = altoDe(lineas);
  ctx.font = `700 ${Math.round(tam)}px ${cuerpo}`;
  const ancho = Math.min(w, marca() + sep() + Math.max(0, ...lineas.flat().map((l) => ctx.measureText(l).width)));
  const x0 = -ancho / 2;
  const acento = h.color("acento");
  let y = -alto / 2;
  lineas.forEach((ls, i) => {
    const fila = Math.max(marca(), ls.length * tam * 1.2);
    const cy = y + fila / 2;
    y += fila + tam * 0.55;
    const p = visto(vida, i * (capa.cada ?? 0.4));
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p;
    ctx.translate(-(1 - p) * tam * 1.5, 0);
    const r = marca() / 2;
    ctx.fillStyle = acento;
    ctx.beginPath();
    ctx.arc(x0 + r, cy, capa.numerada ? r : r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    if (capa.numerada) {
      ctx.fillStyle = h.legible("claro", acento);
      ctx.font = `800 ${Math.round(tam * 0.75)}px ${cuerpo}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x0 + r, cy + tam * 0.03);
    }
    ctx.fillStyle = h.color(capa.color);
    ctx.font = `700 ${Math.round(tam)}px ${cuerpo}`;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ls.forEach((l, k) => ctx.fillText(l, x0 + marca() + sep(), cy + (k - (ls.length - 1) / 2) * tam * 1.2));
    ctx.restore();
  });
  return { w: ancho, h: alto };
}

/** Una BURBUJA de chat con su colita, a la izquierda (lo que escribe alguien) o a la derecha (la marca). */
export function dibujarBurbuja(ctx, capa, h, { anchoMax = h.w, tam: tamDado = 0 } = {}) {
  const { lado, cuerpo } = h;
  const tam = tamDado || lado * 0.044;
  ctx.font = `600 ${Math.round(tam)}px ${cuerpo}`;
  const pad = tam * 0.8;
  const lineas = h.partir(ctx, capa.texto, anchoMax - pad * 2).slice(0, 5);
  const anchoTexto = Math.max(...lineas.map((l) => ctx.measureText(l).width), tam * 2);
  const bw = Math.min(anchoMax, anchoTexto + pad * 2);
  const bh = lineas.length * tam * 1.3 + pad * 1.4;
  const cola = tam * 0.7;
  const der = capa.lado === "der";
  const fondo = h.color(capa.color);
  ctx.fillStyle = fondo;
  h.rect(ctx, -bw / 2, -(bh + cola) / 2, bw, bh, tam * 0.9);
  ctx.fill();
  // La colita, abajo del lado que habla.
  const xc = der ? bw / 2 - tam * 1.2 : -bw / 2 + tam * 1.2;
  const yb = -(bh + cola) / 2 + bh - 1;
  ctx.beginPath();
  ctx.moveTo(xc - cola * 0.6, yb);
  ctx.lineTo(xc + (der ? cola : -cola), yb + cola);
  ctx.lineTo(xc + cola * 0.6, yb);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = h.legible("texto", fondo);
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  lineas.forEach((l, i) => ctx.fillText(l, -bw / 2 + pad, -(bh + cola) / 2 + pad * 0.7 + tam * 1.3 * (i + 0.5)));
  return { w: bw, h: bh + cola };
}

/** «1:05» / «1:02:07»: segundos como reloj. Pura. */
export function tiempoComoReloj(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
}

/**
 * RELOJ: la esfera con sus agujas girando (el tiempo que pasa), un CONTADOR que sube de `desde` a `hasta` o una
 * CUENTA ATRÁS que baja; los dos últimos tardan lo que la cifra en contar.
 */
export function dibujarReloj(ctx, capa, h, avance) {
  const { w, maxAlto, lado, vida, titular } = h;
  const color = h.color(capa.color);
  if (capa.modo === "reloj") {
    const s = Math.min(w, maxAlto);
    const r = s / 2 - lado * 0.01;
    ctx.lineWidth = s * 0.045;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const largo = i % 3 === 0 ? 0.16 : 0.08;
      ctx.lineWidth = s * (i % 3 === 0 ? 0.03 : 0.018);
      ctx.beginPath();
      ctx.moveTo(Math.sin(a) * r * 0.78, -Math.cos(a) * r * 0.78);
      ctx.lineTo(Math.sin(a) * r * (0.78 - largo), -Math.cos(a) * r * (0.78 - largo));
      ctx.stroke();
    }
    const v = Number.isFinite(vida) ? vida : 0;
    const aguja = (ang, largo, grueso) => {
      ctx.lineWidth = s * grueso;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(ang) * r * largo, -Math.cos(ang) * r * largo); ctx.stroke();
    };
    aguja((v / 3) * Math.PI * 2, 0.62, 0.035);
    aguja((v / 36) * Math.PI * 2 + Math.PI / 3, 0.42, 0.05);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.04, 0, Math.PI * 2); ctx.fill();
    return { w: s, h: s };
  }
  const desde = Number(capa.desde) || 0;
  const hasta = Number(capa.hasta) || 0;
  const valor = desde + (hasta - desde) * avance;
  const texto = tiempoComoReloj(valor);
  const muestra = tiempoComoReloj(Math.max(desde, hasta)).replace(/\d/g, "8");
  let tam = Math.min(lado * 0.3, maxAlto * 0.8);
  ctx.font = `900 ${Math.round(tam)}px ${titular}`;
  const an = ctx.measureText(muestra).width;
  if (an > w) tam *= w / an;
  ctx.font = `900 ${Math.round(tam)}px ${titular}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(texto, 0, 0);
  return { w: Math.min(w, ctx.measureText(muestra).width), h: tam * 1.05 };
}

/** Un lado del antes y después: su imagen (recortada para llenar) o, si no hay, su texto sobre una tarjeta. */
function ladoAD(ctx, h, { img, texto, x, y, ancho, alto, fondo }) {
  ctx.save();
  h.rect(ctx, x, y, ancho, alto, h.lado * 0.025);
  ctx.clip();
  ctx.fillStyle = h.color(fondo);
  ctx.fillRect(x, y, ancho, alto);
  if (img) {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const k = Math.max(ancho / iw, alto / ih);
    ctx.drawImage(img, x + (ancho - iw * k) / 2, y + (alto - ih * k) / 2, iw * k, ih * k);
  } else if (texto) {
    const tam = h.lado * 0.045;
    ctx.font = `700 ${Math.round(tam)}px ${h.cuerpo}`;
    const lineas = h.partir(ctx, texto, ancho * 0.84).slice(0, 4);
    ctx.fillStyle = h.legible("texto", h.color(fondo));
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    lineas.forEach((l, i) => ctx.fillText(l, x + ancho / 2, y + alto / 2 + (i - (lineas.length - 1) / 2) * tam * 1.3));
  }
  ctx.restore();
}

function etiquetaAD(ctx, h, texto, cx, y, color) {
  if (!texto) return;
  const tam = h.lado * 0.032;
  ctx.font = `800 ${Math.round(tam)}px ${h.cuerpo}`;
  const an = ctx.measureText(texto).width + tam * 1.6;
  ctx.fillStyle = color;
  h.rect(ctx, cx - an / 2, y, an, tam * 1.8, tam * 0.9);
  ctx.fill();
  ctx.fillStyle = h.legible("claro", color);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(texto, cx, y + tam * 0.92);
}

/**
 * ANTES Y DESPUÉS: los dos lados juntos («lado»), uno encima del otro con una línea que se desliza («deslizador») o
 * uno y luego el otro («secuencia»). Cada lado, su imagen de la galería o su texto.
 */
export function dibujarAntesDespues(ctx, capa, h) {
  const { w, maxAlto, lado, vida } = h;
  const acento = h.color(capa.color);
  const imgA = capa.archivoAntes ? h.imagen(capa.archivoAntes) : null;
  const imgD = capa.archivoDespues ? h.imagen(capa.archivoDespues) : null;
  const etA = (capa.etiquetaAntes || "ANTES").toUpperCase();
  const etD = (capa.etiquetaDespues || "DESPUÉS").toUpperCase();
  const v = Number.isFinite(vida) ? vida : Infinity;
  if (capa.modo === "lado") {
    const hueco = lado * 0.02;
    const ancho = (w - hueco) / 2;
    const alto = Math.min(maxAlto, ancho * 1.3);
    ladoAD(ctx, h, { img: imgA, texto: capa.textoAntes, x: -w / 2, y: -alto / 2, ancho, alto, fondo: "superficie" });
    // El «después» entra un momento más tarde: primero se ve el problema.
    ctx.save();
    ctx.globalAlpha *= visto(v, 0.5);
    ladoAD(ctx, h, { img: imgD, texto: capa.textoDespues, x: -w / 2 + ancho + hueco, y: -alto / 2, ancho, alto, fondo: "superficie" });
    ctx.strokeStyle = acento; ctx.lineWidth = lado * 0.008;
    h.rect(ctx, -w / 2 + ancho + hueco, -alto / 2, ancho, alto, lado * 0.025);
    ctx.stroke();
    ctx.restore();
    etiquetaAD(ctx, h, etA, -w / 2 + ancho / 2, -alto / 2 + lado * 0.02, h.color("oscuro"));
    etiquetaAD(ctx, h, etD, w / 2 - ancho / 2, -alto / 2 + lado * 0.02, acento);
    return { w, h: alto };
  }
  const alto = Math.min(maxAlto, w * 0.8);
  if (capa.modo === "deslizador") {
    // La línea va de la derecha al centro en 1,2 s: se va descubriendo el «después» de debajo… al revés: el antes se tapa.
    const corte = -w / 2 + w * (1 - 0.5 * sale(v / 1.2));
    ladoAD(ctx, h, { img: imgD, texto: capa.textoDespues, x: -w / 2, y: -alto / 2, ancho: w, alto, fondo: "superficie" });
    ctx.save();
    ctx.beginPath(); ctx.rect(-w / 2, -alto / 2, corte + w / 2, alto); ctx.clip();
    ladoAD(ctx, h, { img: imgA, texto: capa.textoAntes, x: -w / 2, y: -alto / 2, ancho: w, alto, fondo: "fondo" });
    ctx.restore();
    ctx.fillStyle = acento;
    ctx.fillRect(corte - lado * 0.004, -alto / 2, lado * 0.008, alto);
    ctx.beginPath(); ctx.arc(corte, 0, lado * 0.03, 0, Math.PI * 2); ctx.fill();
    etiquetaAD(ctx, h, etA, -w / 2 + w * 0.2, -alto / 2 + lado * 0.02, h.color("oscuro"));
    etiquetaAD(ctx, h, etD, w / 2 - w * 0.2, -alto / 2 + lado * 0.02, acento);
    return { w, h: alto };
  }
  // «secuencia»: el antes 1,2 s y el después encima, fundiéndose.
  const p = Number.isFinite(v) ? sale((v - 1.2) / 0.4) : 1;
  ladoAD(ctx, h, { img: imgA, texto: capa.textoAntes, x: -w / 2, y: -alto / 2, ancho: w, alto, fondo: "superficie" });
  if (p > 0) {
    ctx.save(); ctx.globalAlpha *= p;
    ladoAD(ctx, h, { img: imgD, texto: capa.textoDespues, x: -w / 2, y: -alto / 2, ancho: w, alto, fondo: "superficie" });
    ctx.restore();
  }
  etiquetaAD(ctx, h, p >= 0.5 ? etD : etA, 0, -alto / 2 + lado * 0.02, p >= 0.5 ? acento : h.color("oscuro"));
  return { w, h: alto };
}

/**
 * TELÉFONO: el aparato con su pantalla. «chat»: los mensajes (cliente a la izquierda, marca a la derecha) entrando uno
 * tras otro; «imagen»: una imagen de la galería llenando la pantalla; «color»: la pantalla de un color;
 * «notificacion»: la pantalla bloqueada con un aviso.
 */
export function dibujarTelefono(ctx, capa, h) {
  const { w, maxAlto, lado, vida, cuerpo } = h;
  let pw = Math.min(w, maxAlto / 2);
  const ph = pw * 2;
  const borde = pw * 0.05;
  const x = -pw / 2; const y = -ph / 2;
  ctx.fillStyle = h.color("oscuro");
  h.rect(ctx, x, y, pw, ph, pw * 0.14);
  ctx.fill();
  const sx = x + borde; const sy = y + borde; const sw = pw - borde * 2; const sh = ph - borde * 2;
  const pantalla = h.color(capa.pantalla === "color" ? capa.color : capa.pantalla === "chat" ? "superficie" : "fondo");
  ctx.save();
  h.rect(ctx, sx, sy, sw, sh, pw * 0.1);
  ctx.clip();
  ctx.fillStyle = pantalla;
  ctx.fillRect(sx, sy, sw, sh);
  const v = Number.isFinite(vida) ? vida : Infinity;
  if (capa.pantalla === "imagen") {
    const img = capa.archivo ? h.imagen(capa.archivo) : null;
    if (img) {
      const iw = img.naturalWidth || img.width || 1;
      const ih = img.naturalHeight || img.height || 1;
      const k = Math.max(sw / iw, sh / ih);
      ctx.drawImage(img, sx + (sw - iw * k) / 2, sy + (sh - ih * k) / 2, iw * k, ih * k);
    }
  } else if (capa.pantalla === "chat") {
    // Los mensajes de arriba abajo, de dos en dos tercios del ancho, cada uno 0,7 s después del anterior.
    const tam = Math.max(lado * 0.034, sw * 0.085);
    let cy = sy + sh * 0.1;
    (capa.mensajes ?? []).slice(0, 6).forEach((m, i) => {
      const p = visto(v, i * 0.7);
      if (p <= 0) return;
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.translate(0, (1 - p) * tam);
      const marca = m.de === "marca";
      const medida = { ...h, lado };
      ctx.save();
      // Mide primero para saber el alto, sin dibujar fuera de la pantalla.
      ctx.translate(-9e6, -9e6);
      const caja = dibujarBurbuja(ctx, { texto: m.texto, lado: marca ? "der" : "izq", color: marca ? "acento" : "fondo" }, medida, { anchoMax: sw * 0.8, tam });
      ctx.restore();
      if (cy + caja.h <= sy + sh * 0.95) {
        ctx.translate(marca ? sx + sw - caja.w / 2 - sw * 0.05 : sx + caja.w / 2 + sw * 0.05, cy + caja.h / 2);
        dibujarBurbuja(ctx, { texto: m.texto, lado: marca ? "der" : "izq", color: marca ? "acento" : "fondo" }, medida, { anchoMax: sw * 0.8, tam });
      }
      ctx.restore();
      cy += caja.h + tam * 0.6;
    });
  } else if (capa.pantalla === "notificacion") {
    const tam = Math.max(lado * 0.024, sw * 0.06);
    ctx.fillStyle = h.legible("texto", pantalla);
    ctx.font = `300 ${Math.round(tam * 2.6)}px ${cuerpo}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("9:41", 0, sy + sh * 0.2);
    if (capa.notificacion) {
      const p = visto(v, 0.3);
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.translate(0, -(1 - p) * tam * 2);
      ctx.font = `600 ${Math.round(tam)}px ${cuerpo}`;
      const lineas = h.partir(ctx, capa.notificacion, sw * 0.74).slice(0, 3);
      const nh = lineas.length * tam * 1.3 + tam * 1.6;
      ctx.fillStyle = h.color("claro");
      h.rect(ctx, sx + sw * 0.06, sy + sh * 0.34, sw * 0.88, nh, tam * 0.8);
      ctx.fill();
      ctx.fillStyle = h.legible("texto", h.color("claro"));
      ctx.textAlign = "left";
      lineas.forEach((l, i) => ctx.fillText(l, sx + sw * 0.12, sy + sh * 0.34 + tam * 0.8 + tam * 1.3 * (i + 0.5)));
      ctx.restore();
    }
  }
  ctx.restore();
  // La isla de arriba: lo que hace que se lea como un teléfono.
  ctx.fillStyle = h.color("oscuro");
  h.rect(ctx, -pw * 0.16, sy + pw * 0.035, pw * 0.32, pw * 0.07, pw * 0.035);
  ctx.fill();
  return { w: pw, h: ph };
}
