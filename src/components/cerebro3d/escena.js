// ============================================================
// El cerebro 3D: el lienzo
//
// Cada nota es una neurona y cada conexión una sinapsis, dentro de un
// cerebro (ver `lib/cerebroLayout.js`). Gira solo, se para al tocarlo, y
// una señal recorre una sinapsis cuando se busca o se elige una nota.
//
// Es la misma escena que dibuja Agents Office con three.js, pero en un
// lienzo 2D y sin librería: cada nota es un punto proyectado con la cámara
// de `lib/camara3d.js`, y el brillo es luz que se SUMA (`lighter`). Un
// cerebro de un cliente son decenas o cientos de notas, y three.js son
// 144 kB comprimidos que habría que descargar para dibujarlas. La interfaz
// de este módulo es la misma que la de `initBrain3D` de la oficina: si un
// día hiciera falta WebGL para miles de notas, se cambia este archivo y
// nada más.
//
//   iniciarCerebro3D(ctx) → { setData, setFocus, refresh, fly, reset, zoomBy, rotateBy, spin, pickAt,
//                             pulseFrom, start, stop, resize, posEnPantalla }
//   ctx: host (el elemento donde va el lienzo) · colorDe(nota) · visible(nota) · onElegir(nota) ·
//        onVacio() · onHover(nota, x, y) · etiquetas() → [nota] (por orden de importancia)
//
// Los toques y los clics se buscan en coordenadas DEL LIENZO (clientX − rect.left), no de la página, y con la
// tolerancia de un dedo: 16 px con ratón, 26 con el dedo. Un clic que se mueve más de 5 px (10 con el dedo) es
// un arrastre, y un arrastre gira el cerebro.
// ============================================================

import { colocar, corteza, RADIOS } from "../../lib/cerebroLayout";
import * as Cam from "../../lib/camara3d";
import { COLOR_MENCION, COLOR_INTERNA, COLOR_APRENDIDA } from "../../lib/cerebroGrafo";

const VERSION_LAYOUT = 1; // si cambia la receta de colocar, sube: los sitios guardados dejan de valer
const claveDeSitios = (clave) => `cerebro3d.sitios.${clave}`;
const REDUCIDO = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const MAX_PULSOS = 90;
const FONDO_APAGADO = [42, 47, 62]; // el color al que se apaga lo que no coincide
const BLANCO = [255, 255, 255];

const mezclar = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgbDe = (hex) => { const n = parseInt(String(hex).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const radioBase = (n) => Math.min(0.095, 0.026 + 0.011 * Math.sqrt(n.d || 0));

export function iniciarCerebro3D(ctx) {
  const { host, colorDe } = ctx;
  const canvas = document.createElement("canvas");
  canvas.className = "cg-lienzo";
  canvas.setAttribute("aria-hidden", "true");
  canvas.tabIndex = -1;
  host.prepend(canvas);
  const g = canvas.getContext("2d");

  // ---------- Sprites: una esfera con volumen y un brillo suave, por color ----------
  const sprites = new Map();
  const sprite = (clave, hacer) => { let s = sprites.get(clave); if (!s) { s = hacer(); sprites.set(clave, s); } return s; };
  const lienzo = (n) => { const c = document.createElement("canvas"); c.width = c.height = n; return c; };
  const esfera = (rgb) => sprite(`e${rgb}`, () => {
    const c = lienzo(96); const x = c.getContext("2d");
    const grad = x.createRadialGradient(36, 32, 4, 48, 48, 48);
    grad.addColorStop(0, css(mezclar(rgb, BLANCO, 0.7)));
    grad.addColorStop(0.35, css(rgb));
    grad.addColorStop(1, css(mezclar(rgb, [0, 0, 0], 0.55)));
    x.fillStyle = grad; x.beginPath(); x.arc(48, 48, 47, 0, Math.PI * 2); x.fill();
    return c;
  });
  const brillo = (rgb) => sprite(`b${rgb}`, () => {
    const c = lienzo(64); const x = c.getContext("2d");
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, css(rgb, 1)); grad.addColorStop(0.22, css(rgb, 0.55)); grad.addColorStop(0.55, css(rgb, 0.12)); grad.addColorStop(1, css(rgb, 0));
    x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
    return c;
  });

  // ---------- Los datos ----------
  let nodos = []; let enlaces = []; let menciones = []; let aprendidas = []; let ids = [];
  let P = new Float32Array(0); let posDe = new Map(); let colores = []; let visibles = [];
  let elegida = null; let enfoque = null; let vecindad = null; let coinciden = null; let verMenciones = true; let verAprendidas = true;
  const cortezaPts = corteza(1500);
  const nCorteza = cortezaPts.length / 3;
  const cX = new Float32Array(nCorteza); const cY = new Float32Array(nCorteza); const cZ = new Float32Array(nCorteza);
  let escalaRadio = 1; // con muchas notas cada una se hace más pequeña: un cerebro de 300 no es una bola de bolas
  const radioDe = (n) => radioBase(n) * escalaRadio;
  let SX = new Float32Array(0); let SY = new Float32Array(0); let SZ = new Float32Array(0);

  // ---------- La cámara ----------
  let cam = Cam.camaraInicial();
  let W = 1; let H = 1; let dpr = 1;
  let margenIzq = 0; let margenDer = 0; // lo que tapan las tarjetas que flotan sobre el lienzo: el cerebro se centra en el hueco que queda
  let giroT = 0; let giroP = 0; // lo que falta por girar: se aplica poco a poco (inercia)
  let girando = !REDUCIDO.matches; // ¿el usuario quiere que gire solo?
  let auto = girando; let reposoHasta = 0; let vuelo = null;
  const detenerGiro = () => { auto = false; reposoHasta = Infinity; vuelo = null; };
  const reposar = (ms = 5000) => { reposoHasta = performance.now() + ms; };

  // ---------- Pulsos: señales que recorren las sinapsis ----------
  const pulsos = [];
  let proximoAmbiente = 0;
  const nacer = (a, b, fuerte) => {
    if (pulsos.length >= MAX_PULSOS) pulsos.shift();
    pulsos.push({ a, b, t: 0, v: fuerte ? 1.1 : 0.55 + Math.random() * 0.4, fuerte });
  };
  const seMuestra = ([a, b]) => visibles[a] && visibles[b];

  // ---------- Proyección ----------
  let cuadro = 0; let proyectadoEn = -1; let bCam = null; let foco = 1;
  function proyectar() {
    if (SX.length !== nodos.length) { SX = new Float32Array(nodos.length); SY = new Float32Array(nodos.length); SZ = new Float32Array(nodos.length); }
    bCam = Cam.base(cam); foco = Cam.foco(H);
    Cam.proyectarLote(P, nodos.length, bCam, foco, W - margenDer + margenIzq, H, SX, SY, SZ);
    proyectadoEn = cuadro;
  }

  /** La nota bajo (x, y) —píxeles del lienzo—. Gana la más cercana; en un empate, la que está delante. */
  function pickAt(x, y, alcance = 16) {
    if (proyectadoEn !== cuadro) proyectar();
    let mejor = null; let ms = Infinity;
    for (let i = 0; i < nodos.length; i++) {
      if (!visibles[i] || !SZ[i]) continue;
      const px = Cam.pixeles(radioDe(nodos[i]), SZ[i], foco);
      const d = Math.hypot(SX[i] - x, SY[i] - y) - px;
      if (d > alcance) continue;
      const s = d + SZ[i] * 6;
      if (s < ms) { ms = s; mejor = nodos[i]; }
    }
    return mejor;
  }

  // ---------- El dibujo ----------
  const sombra = (i) => { // cómo se ve una nota según los filtros, la búsqueda y el enfoque
    const n = nodos[i];
    const encendida = (!vecindad || vecindad.has(i)) && (!coinciden || coinciden.has(i));
    return { n, encendida, base: colores[i], color: encendida ? colores[i] : mezclar(colores[i], FONDO_APAGADO, 0.82) };
  };

  function dibujarLinea(a, b, ca, cb, alfa, ancho = 1) {
    if (!SZ[a] || !SZ[b] || alfa <= 0.004) return;
    const f = Cam.niebla((SZ[a] + SZ[b]) / 2);
    const mx = (SX[a] + SX[b]) / 2; const my = (SY[a] + SY[b]) / 2;
    g.lineWidth = ancho;
    g.strokeStyle = css(ca, alfa * f); g.beginPath(); g.moveTo(SX[a], SY[a]); g.lineTo(mx, my); g.stroke();
    g.strokeStyle = css(cb, alfa * f); g.beginPath(); g.moveTo(mx, my); g.lineTo(SX[b], SY[b]); g.stroke();
  }

  function dibujar(dt) {
    proyectar();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const filtrando = Boolean(vecindad || coinciden);

    g.globalCompositeOperation = "lighter";
    // La corteza: el contorno tenue que hace que se lea «un cerebro».
    Cam.proyectarLote(cortezaPts, nCorteza, bCam, foco, W - margenDer + margenIzq, H, cX, cY, cZ);
    const puntoCorteza = brillo([140, 158, 230]);
    for (let i = 0; i < nCorteza; i++) {
      if (!cZ[i]) continue;
      const t = Math.max(3, Cam.pixeles(0.018, cZ[i], foco)) * 2.2;
      g.globalAlpha = 0.22 * Cam.niebla(cZ[i]);
      g.drawImage(puntoCorteza, cX[i] - t / 2, cY[i] - t / 2, t, t);
    }
    g.globalAlpha = 1;

    // Las sinapsis: entre dos notas que se ven. Las del enfoque se iluminan aparte.
    const activa = (a, b) => (!vecindad || (vecindad.has(a) && vecindad.has(b))) && (!coinciden || (coinciden.has(a) && coinciden.has(b)));
    for (const [a, b] of enlaces) {
      if (!visibles[a] || !visibles[b]) continue;
      dibujarLinea(a, b, colores[a], colores[b], filtrando ? (activa(a, b) ? 0.6 : 0.035) : 0.3);
    }
    if (verMenciones) {
      const azul = rgbDe(COLOR_MENCION);
      for (const [a, b] of menciones) {
        if (!visibles[a] || !visibles[b]) continue;
        dibujarLinea(a, b, azul, azul, filtrando ? (activa(a, b) ? 0.26 : 0.02) : 0.13);
      }
    }
    if (verAprendidas && aprendidas.length) { // lo que salió bien: dos notas usadas juntas en algo que el cliente aprobó, en dorado
      const oro = rgbDe(COLOR_APRENDIDA);
      for (const [a, b, w] of aprendidas) {
        if (!visibles[a] || !visibles[b]) continue;
        const base = 0.18 + 0.5 * w;
        dibujarLinea(a, b, oro, oro, filtrando ? (activa(a, b) ? Math.min(1, base * 2.2) : 0.02) : base, 1 + w);
      }
    }
    if (enfoque) {
      for (const [a, b] of enlaces) if ((a === enfoque.i || b === enfoque.i) && visibles[a] && visibles[b]) dibujarLinea(a, b, BLANCO, BLANCO, 0.85, 1.5);
    }

    // El resplandor de cada nota.
    for (let i = 0; i < nodos.length; i++) {
      if (!visibles[i] || !SZ[i]) continue;
      const { n, encendida, color } = sombra(i);
      // Lo que el cerebro aprendió: una nota que suele salir bien brilla un poco más, una que suele salir mal, un poco menos.
      const lw = n.peso == null ? 1 : 0.7 + 0.6 * n.peso;
      const tam = radioDe(n) * lw * (encendida ? (elegida === n ? 5.6 : enfoque === n ? 5.4 : 4.6) : 2.6);
      g.globalAlpha = Math.min(1, (encendida ? (elegida === n ? 0.7 : 0.55) : 0.1) * lw) * Cam.niebla(SZ[i]);
      const px = Math.max(4, Cam.pixeles(tam, SZ[i], foco));
      g.drawImage(brillo(elegida === n ? BLANCO : color), SX[i] - px / 2, SY[i] - px / 2, px, px);
    }
    g.globalAlpha = 1;

    // Las señales que recorren las sinapsis.
    for (let i = pulsos.length - 1; i >= 0; i--) { pulsos[i].t += dt * pulsos[i].v; if (pulsos[i].t >= 1) pulsos.splice(i, 1); }
    for (const p of pulsos) {
      if (!SZ[p.a] || !SZ[p.b]) continue;
      const e = p.t * p.t * (3 - 2 * p.t);
      const x = SX[p.a] + (SX[p.b] - SX[p.a]) * e; const y = SY[p.a] + (SY[p.b] - SY[p.a]) * e;
      const z = SZ[p.a] + (SZ[p.b] - SZ[p.a]) * e;
      const px = Math.max(6, Cam.pixeles(p.fuerte ? 0.16 : 0.09, z, foco));
      g.globalAlpha = Math.sin(Math.PI * p.t) * (p.fuerte ? 1 : 0.7);
      g.drawImage(brillo(mezclar(colores[p.a], BLANCO, p.fuerte ? 0.7 : 0.45)), x - px / 2, y - px / 2, px, px);
    }
    g.globalAlpha = 1;

    // Los núcleos, de lejos a cerca: son sólidos y el de delante tapa al de atrás.
    g.globalCompositeOperation = "source-over";
    const orden = [];
    for (let i = 0; i < nodos.length; i++) if (visibles[i] && SZ[i]) orden.push(i);
    orden.sort((a, b) => SZ[b] - SZ[a]);
    for (const i of orden) {
      const { n, encendida, color } = sombra(i);
      const r = radioDe(n) * (elegida === n ? 1.35 : enfoque === n ? 1.25 : 1);
      const px = Math.max(3, Cam.pixeles(r, SZ[i], foco) * 2);
      g.globalAlpha = Cam.niebla(SZ[i]) * (encendida ? 1 : 0.55);
      g.drawImage(esfera(elegida === n ? BLANCO : color), SX[i] - px / 2, SY[i] - px / 2, px, px);
      if (n.interna && encendida) { // el anillo cálido: sólo la ve el equipo, no sale en los textos que se publican
        g.globalAlpha = Cam.niebla(SZ[i]) * 0.9; g.lineWidth = 1.5; g.strokeStyle = css(rgbDe(COLOR_INTERNA));
        g.beginPath(); g.arc(SX[i], SY[i], px / 2 + 2.5, 0, Math.PI * 2); g.stroke();
      }
      if (elegida === n) { g.globalAlpha = 1; g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(SX[i], SY[i], px / 2 + 5, 0, Math.PI * 2); g.stroke(); }
    }
    g.globalAlpha = 1;
    dibujarEtiquetas();
  }

  // ---------- Etiquetas: HTML, nítidas y pulsables (un nombre es un blanco mucho mayor que un punto) ----------
  const capa = document.createElement("div");
  capa.className = "cg-etiquetas";
  host.appendChild(capa);
  const pool = [];
  const ocupado = [];
  function dibujarEtiquetas() {
    const quieren = ctx.etiquetas ? ctx.etiquetas() : [];
    while (pool.length < quieren.length) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "cg-etiqueta"; b.tabIndex = -1;
      capa.appendChild(b); pool.push(b);
    }
    ocupado.length = 0;
    for (let k = 0; k < pool.length; k++) {
      const b = pool[k]; const n = quieren[k];
      let omitir = !n || !visibles[n.i] || !SZ[n.i];
      if (!omitir) { // una etiqueta que pisaría a otra se deja fuera; ganan las primeras de la lista
        const x0 = SX[n.i] + 9; const y0 = SY[n.i] - 9; const w = Math.min(240, 26 + n.titulo.length * 6.6); const h = 26;
        const obligada = n === elegida || n === enfoque;
        if (!obligada && ocupado.some((r) => x0 < r[2] && x0 + w > r[0] && y0 < r[3] && y0 + h > r[1])) omitir = true;
        else ocupado.push([x0, y0, x0 + w, y0 + h]);
      }
      if (omitir) { if (!b.hidden) b.hidden = true; continue; }
      if (b.hidden) b.hidden = false;
      if (b._n !== n) { b._n = n; b.textContent = n.titulo; b.style.setProperty("--c", colorDe(n)); }
      b.classList.toggle("sel", n === elegida);
      b.classList.toggle("foc", n === enfoque);
      // Las lejanas se desvanecen: la profundidad se lee también en los nombres.
      const cerca = Math.max(0.35, Math.min(1, 1.6 - (SZ[n.i] - 2.4) * 0.35));
      b.style.transform = `translate(${Math.round(SX[n.i] + 9)}px, ${Math.round(SY[n.i] - 9)}px)`;
      b.style.opacity = n === elegida || n === enfoque ? 1 : cerca.toFixed(2);
    }
  }
  capa.addEventListener("click", (e) => { const b = e.target.closest(".cg-etiqueta"); if (b && b._n && ctx.onElegir) ctx.onElegir(b._n); });
  capa.addEventListener("pointerover", (e) => {
    const b = e.target.closest(".cg-etiqueta");
    if (b && b._n && ctx.onHover) { const r = b.getBoundingClientRect(); const h = host.getBoundingClientRect(); ctx.onHover(b._n, r.left - h.left, r.top - h.top + r.height); }
  });
  capa.addEventListener("pointerout", (e) => { if (e.target.closest(".cg-etiqueta") && ctx.onHover) ctx.onHover(null); });

  // ---------- El puntero: girar, acercar, desplazar; un toque que no se mueve es un clic ----------
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const punteros = new Map();
  let abajo = null; let pinza = 0;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* un puntero que ya no existe */ }
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    detenerGiro();
    if (punteros.size === 1) {
      const toque = e.pointerType !== "mouse"; const [x, y] = local(e);
      abajo = { x: e.clientX, y: e.clientY, t: performance.now(), toque, n: pickAt(x, y, toque ? 26 : 16), mover: e.button === 2 || e.shiftKey, movido: false };
    } else {
      abajo = null; // dos dedos: pellizcar, no elegir
      const [a, b] = [...punteros.values()];
      pinza = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const previo = punteros.get(e.pointerId);
    if (!previo) { // sin pulsar: sólo el ratón, para el cursor y la vista previa
      if (e.pointerType !== "mouse") return;
      const [x, y] = local(e); const n = pickAt(x, y, 14);
      canvas.style.cursor = n ? "pointer" : "grab";
      if (ctx.onHover) ctx.onHover(n, x, y);
      return;
    }
    const dx = e.clientX - previo.x; const dy = e.clientY - previo.y;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size >= 2) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinza > 0 && d > 0) cam = Cam.acercar(cam, pinza / d);
      pinza = d;
      cam = Cam.desplazar(cam, dx / 2, dy / 2, Cam.foco(H));
      return;
    }
    if (abajo && Math.hypot(e.clientX - abajo.x, e.clientY - abajo.y) > (abajo.toque ? 10 : 5)) abajo.movido = true;
    if (abajo?.mover) cam = Cam.desplazar(cam, dx, dy, Cam.foco(H));
    else { giroT -= Cam.anguloDeArrastre(dx, H); giroP -= Cam.anguloDeArrastre(dy, H); canvas.style.cursor = "grabbing"; }
  });
  canvas.addEventListener("pointerleave", () => { if (ctx.onHover) ctx.onHover(null); });
  const soltar = (e) => {
    punteros.delete(e.pointerId);
    pinza = 0;
    const d = abajo; abajo = null;
    canvas.style.cursor = "grab";
    if (!d) { reposar(); return; }
    if (d.movido || performance.now() - d.t > 700) { reposar(); return; } // giró el cerebro
    const [x, y] = local(e);
    const n = pickAt(x, y, d.toque ? 26 : 16) || d.n;
    if (n && ctx.onElegir) ctx.onElegir(n);
    else if (!n && ctx.onVacio) ctx.onVacio();
    if (!n) reposar();
  };
  canvas.addEventListener("pointerup", soltar);
  canvas.addEventListener("pointercancel", (e) => { punteros.delete(e.pointerId); abajo = null; pinza = 0; reposar(); });
  canvas.addEventListener("dblclick", (e) => { const [x, y] = local(e); if (!pickAt(x, y, 16)) reset(); });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); detenerGiro(); reposar(); cam = Cam.acercar(cam, Cam.factorDeRueda(e.deltaY)); }, { passive: false });
  canvas.style.cursor = "grab";

  // ---------- El bucle: sólo mientras se ve ----------
  let raf = 0; let ultimo = 0; let corriendo = false; let enPantalla = true;
  function bucle(ahora) {
    raf = requestAnimationFrame(bucle);
    if (document.hidden || !enPantalla) { ultimo = 0; return; }
    const dt = Math.min(0.05, (ahora - (ultimo || ahora)) / 1000);
    ultimo = ahora; cuadro++;
    if (vuelo) {
      const k = Math.min(1, Math.max(0, (ahora - vuelo.t0) / vuelo.d));
      cam = Cam.entre(vuelo.de, vuelo.a, k);
      if (k >= 1) vuelo = null;
    }
    // La inercia: lo que falta por girar se aplica poco a poco, como OrbitControls con «damping».
    const k = 1 - Math.pow(1 - 0.08, dt * 60);
    if (Math.abs(giroT) > 1e-5 || Math.abs(giroP) > 1e-5) { cam = Cam.girar(cam, giroT * k, giroP * k); giroT *= 1 - k; giroP *= 1 - k; }
    if (!auto && girando && !elegida && ahora > reposoHasta && !vuelo) auto = true; // vuelve a girar cuando lo sueltas
    if (auto && girando) cam = { ...cam, theta: cam.theta - ((2 * Math.PI) / 60) * 0.55 * dt };
    tickAmbiente(ahora);
    dibujar(dt);
  }
  function tickAmbiente(ahora) { // una chispa rara de vez en cuando: el cerebro está vivo
    if (REDUCIDO.matches || !enlaces.length || ahora < proximoAmbiente) return;
    if (enfoque) {
      proximoAmbiente = ahora + 420;
      const propias = enlaces.filter((l) => (l[0] === enfoque.i || l[1] === enfoque.i) && seMuestra(l));
      const l = propias[(Math.random() * propias.length) | 0];
      if (l) nacer(enfoque.i, l[0] === enfoque.i ? l[1] : l[0]); // la nota enfocada habla con sus vecinas
    } else {
      proximoAmbiente = ahora + 1200 + Math.random() * 900;
      const l = enlaces[(Math.random() * enlaces.length) | 0];
      if (l && seMuestra(l)) nacer(l[0], l[1]);
    }
  }
  function ajustar() {
    W = host.clientWidth || 1; H = host.clientHeight || 1; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    proyectadoEn = -1;
  }
  const observador = typeof ResizeObserver === "function" ? new ResizeObserver(() => { if (corriendo) ajustar(); }) : null;
  observador?.observe(host);
  // Fuera de la pantalla no se dibuja: ahorra batería si se baja la página con el mapa a medio ver.
  const visor = typeof IntersectionObserver === "function" ? new IntersectionObserver(([e]) => { enPantalla = e.isIntersecting; }) : null;
  visor?.observe(host);

  function volarA(destino, ms = 750) {
    vuelo = { t0: performance.now(), d: REDUCIDO.matches ? 1 : ms, de: { ...cam }, a: destino };
    auto = false; reposoHasta = Infinity;
  }
  function reset() { volarA(Cam.camaraInicial()); reposoHasta = performance.now() + 900; }
  function fly(n, dist = 2.1) {
    volarA(Cam.haciaNota(cam, [P[n.i * 3], P[n.i * 3 + 1], P[n.i * 3 + 2]], dist));
  }

  function guardarSitios(clave) {
    if (!clave) return;
    try {
      const p = {};
      nodos.forEach((n, i) => { p[n.id] = [+P[i * 3].toFixed(3), +P[i * 3 + 1].toFixed(3), +P[i * 3 + 2].toFixed(3)]; });
      localStorage.setItem(claveDeSitios(clave), JSON.stringify({ v: VERSION_LAYOUT, p }));
    } catch { /* sin almacenamiento: el cerebro se vuelve a colocar, igual de bien */ }
  }
  function leerSitios(clave) {
    if (!clave) return new Map();
    try {
      const c = JSON.parse(localStorage.getItem(claveDeSitios(clave)) || "null");
      if (c && c.v === VERSION_LAYOUT && c.p) return new Map(Object.entries(c.p));
    } catch { /* datos ilegibles: se ignoran */ }
    return new Map();
  }
  function pintar() {
    visibles = nodos.map((n) => Boolean(ctx.visible(n)));
    proyectadoEn = -1;
  }

  return {
    /**
     * Un mapa nuevo. Las notas que ya estaban conservan su sitio (con `clave`, también entre visitas): sólo se colocan
     * las nuevas y sus vecinas.
     */
    setData(ns, ls, mas = {}) {
      const anteriores = new Map(ids.map((id, i) => [id, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]]));
      const prev = anteriores.size ? anteriores : leerSitios(mas.clave);
      nodos = ns.slice();
      ids = nodos.map((n) => n.id);
      enlaces = ls.filter(([a, b]) => ns[a] && ns[b]);
      menciones = (mas.menciones ?? []).filter(([a, b]) => ns[a] && ns[b]);
      aprendidas = (mas.aprendidas ?? []).filter(([a, b]) => ns[a] && ns[b]);
      P = colocar(nodos, enlaces, prev, menciones);
      posDe = new Map(nodos.map((n, i) => [n.id, i]));
      colores = nodos.map((n) => rgbDe(colorDe(n)));
      escalaRadio = nodos.length > 60 ? Math.max(0.55, Math.sqrt(60 / nodos.length)) : 1;
      pulsos.length = 0;
      elegida = null; enfoque = null; vecindad = null; coinciden = null;
      pintar();
      guardarSitios(mas.clave);
    },
    /** La nota elegida, la que se señala con el ratón (o null) y las que coinciden con la búsqueda (Set de `i`, o null). */
    setFocus(sel, sobre, coincidencias) {
      elegida = sel; enfoque = sobre || sel; coinciden = coincidencias;
      vecindad = enfoque
        ? new Set([enfoque.i, ...[...enlaces, ...(verMenciones ? menciones : []), ...(verAprendidas ? aprendidas : [])].filter(([a, b]) => a === enfoque.i || b === enfoque.i).map(([a, b]) => (a === enfoque.i ? b : a))])
        : null;
      if (elegida) auto = false;
      else if (reposoHasta === Infinity && girando) reposoHasta = performance.now() + 3000; // se cerró la ficha: vuelve a girar un momento después
    },
    setLayers(menc, aprend = true) { verMenciones = Boolean(menc); verAprendidas = Boolean(aprend); },
    /** Cuánto tapan por la izquierda y por la derecha las tarjetas sobre el lienzo (píxeles): el cerebro queda en el hueco. */
    setInsets(izq, der) {
      const l = Math.max(0, Math.round(izq)); const d = Math.max(0, Math.round(der));
      if (l === margenIzq && d === margenDer) return;
      margenIzq = l; margenDer = d; proyectadoEn = -1;
    },
    refresh: pintar,
    fly, reset, pickAt,
    zoomBy(f) { cam = Cam.acercar(cam, f); reposar(); auto = false; },
    rotateBy(dTheta, dPhi) { cam = Cam.girar(cam, dTheta, dPhi); auto = false; reposar(); },
    spin(on) {
      girando = on === undefined ? !girando : Boolean(on);
      auto = girando && !elegida;
      reposoHasta = girando ? performance.now() + 400 : Infinity;
      return girando;
    },
    pulseFrom(i, n = 5) {
      for (const [a, b] of enlaces.filter(([x, y]) => x === i || y === i).slice(0, n)) nacer(i, a === i ? b : a, true);
    },
    start() {
      if (corriendo) return;
      corriendo = true; ajustar(); ultimo = 0; raf = requestAnimationFrame(bucle);
    },
    stop() { corriendo = false; cancelAnimationFrame(raf); raf = 0; },
    resize: ajustar,
    destroy() {
      this.stop(); observador?.disconnect(); visor?.disconnect(); canvas.remove(); capa.remove();
    },
    /** Dónde está una nota en la pantalla (píxeles del lienzo), o null. Para las pruebas en un navegador y para anclar cosas. */
    posEnPantalla(id) {
      const i = posDe.get(id);
      if (i === undefined) return null;
      if (proyectadoEn !== cuadro) proyectar();
      return SZ[i] ? { x: SX[i], y: SY[i], z: SZ[i] } : null;
    },
    get spinning() { return girando; },
    get canvas() { return canvas; },
    get camara() { return cam; },
    radios: RADIOS,
  };
}
