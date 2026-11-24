// El VIDEO del editor: cámara virtual + lo que va detrás de la persona + la persona recortada + lo de delante + los
// subtítulos + las transiciones + el cierre. Todo sale de public/datos.json (src/lib/escenaEdicion.js) y de los cuadros
// de public/r/ (kit-edicion/python/cuadros.py). Las capas, en el orden de Rofer v2: los textos van en espacio de PANTALLA,
// nunca dentro del contenedor que hace zoom (se descentraban: corrección de la agencia en Comunidad).
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, continueRender, delayRender } from "remotion";
import { clamp, lerp, eout, n5, muelle, conEstilo, letras, PROGRESO_CELULAR, BURBUJA } from "./base.js";
import { Celular } from "./Piezas.jsx";
import { PIEZAS_DETRAS, PIEZAS_DELANTE } from "./catalogo.js";
import { ConTransicion, DestelloCorte } from "./Transiciones.jsx";
import { Cierre } from "./Cierres.jsx";

// ------------------------------------------------------------ letras: las del kit de la marca o, si no, Anton e Inter Tight (OFL)
const Letras = ({ marca }) => {
  const [h] = React.useState(() => delayRender("letras"));
  React.useEffect(() => {
    const L = letras(marca);
    const caras = [
      [L.titular, marca.letras?.titular?.archivo ?? "fonts/anton-400.woff2", 400],
      [L.texto, marca.letras?.texto?.archivo ?? "fonts/inter-tight-900.woff2", 900],
      [L.texto, marca.letras?.texto?.archivo800 ?? "fonts/inter-tight-800.woff2", 800],
      [L.texto, marca.letras?.texto?.archivo600 ?? "fonts/inter-tight-600.woff2", 600],
    ];
    const css = caras.map(([fam, url, peso]) => `@font-face{font-family:"${fam}";src:url(${staticFile(url)});font-weight:${peso}}`).join("\n");
    const st = document.createElement("style");
    st.innerHTML = css;
    document.head.appendChild(st);
    Promise.all(caras.map(([fam, , peso]) => document.fonts.load(`${peso} 20px "${fam}"`))).then(() => continueRender(h), () => continueRender(h));
  }, [h, marca]);
  return null;
};

// ------------------------------------------------------------ la sacudida en los golpes grandes
const sacudida = (f, fps, golpes) => {
  let x = 0;
  let y = 0;
  for (const s of golpes) {
    const d = f - Math.round(s * fps);
    if (d < 0 || d > 9) continue;
    const a = 9 * Math.exp(-d / 2.6);
    x += a * Math.sin(d * 2.7);
    y += a * Math.cos(d * 3.3);
  }
  return { x, y };
};

// ------------------------------------------------------------ la cámara: toma + lo de detrás + persona (y el modo celular)
const Camara = ({ d, f, C, L }) => {
  const fps = d.fps;
  const t = f / fps;
  const fi = Math.min(f, d.cam.length - 1);
  const [z, tx, ty] = d.cam[fi];
  const sh = sacudida(f, fps, d.golpes);
  const xf = `translate(${tx + sh.x}px,${ty + sh.y}px) scale(${z})`;
  const cel = d.piezas.find((p) => p.tipo === "celular" && t >= p.desde - 0.05 && t <= p.hasta + 0.05);
  // Modo celular: toda la toma se encoge a una burbuja sobre la cara.
  let envoltura = {};
  if (cel) {
    const m = PROGRESO_CELULAR(cel, t);
    const cab = d.cabeza[fi] ?? [540, 600, 200];
    const sB = lerp(1, 0.4, m);
    const ox = lerp(0, BURBUJA.cx - cab[0] * sB, m);
    const oy = lerp(0, BURBUJA.cy - (cab[1] + cab[2] * 0.6) * sB, m);
    const R = lerp(1150, BURBUJA.r, eout(m)) / sB;
    envoltura = m > 0.001 ? { transform: `translate(${ox}px,${oy}px) scale(${sB})`, transformOrigin: "0 0", clipPath: `circle(${R}px at ${cab[0]}px ${cab[1] + cab[2] * 0.6}px)` } : {};
  }
  return (
    <AbsoluteFill style={envoltura}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, transformOrigin: "0 0", transform: xf }}>
        <Img src={staticFile(`r/cam/${n5(fi)}.jpg`)} style={{ position: "absolute", width: 1080, height: 1920 }} />
      </div>
      <div style={{ position: "absolute", inset: 0, transform: `translate(${sh.x * 0.6}px,${sh.y * 0.6}px)` }}>
        {d.piezas.map((p) => { const P = PIEZAS_DETRAS[p.tipo]; return P ? <P key={p.n} p={p} f={f} fps={fps} C={C} L={L} marca={d.marca} /> : null; })}
      </div>
      {(!d.conPersona || d.conPersona[fi]) && <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, transformOrigin: "0 0", transform: xf }}>
        <Img src={staticFile(`r/p/${n5(fi)}.webp`)} style={{ position: "absolute", width: 1080, height: 1920, filter: `drop-shadow(0 18px 30px ${C.sombra(0.35)})` }} />
      </div>}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${C.sombra(0.18)} 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 62%, ${C.sombra(0.3)} 100%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 90% 75% at 50% 45%, rgba(0,0,0,0) 60%, ${C.sombra(0.32)} 100%)` }} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ subtítulos: grupos de ≤ 4 palabras en UNA línea, medidos
let lienzo = null;
const medir = (texto, fuente) => {
  if (!lienzo) lienzo = document.createElement("canvas").getContext("2d");
  lienzo.font = fuente;
  return lienzo.measureText(texto).width;
};
const Subtitulos = ({ d, f, C, L }) => {
  const fps = d.fps;
  const t = f / fps;
  if (t >= d.vozFin - 0.02) return null;
  const W = d.palabras;
  const G = d.grupos;
  let k = -1;
  for (let i = 0; i < G.length; i++) {
    const a = W[G[i].ids[0]].s - 0.08;
    const sig = i + 1 < G.length ? W[G[i + 1].ids[0]].s - 0.08 : d.vozFin;
    const b = Math.min(sig, W[G[i].ids[G[i].ids.length - 1]].e + 0.5);
    if (t >= a && t < b) { k = i; break; }
  }
  if (k < 0 || G[k].oculto) return null;
  const S = d.subtitulos;
  const may = S.mayusculas !== false;
  const txt = (w) => (may ? w.toUpperCase() : w);
  const ids = G[k].ids;
  // «palabra»: sólo la palabra que se dice, grande y con borde, en el centro de su franja (identidad_video).
  if (S.estilo === "palabra") {
    let i = ids[0];
    for (const j of ids) if (t >= W[j].s - 0.04) i = j;
    const w = W[i];
    const tamP = Math.min(118, (900 / Math.max(1, medir(txt(w.w), `900 100px "${L.texto}"`))) * 100);
    const q = muelle(f, fps, w.s - 0.04, { damping: 11, stiffness: 340, mass: 0.45 }, C.k);
    return (
      <div style={{ position: "absolute", left: 0, width: 1080, top: S.y - tamP * 0.62, textAlign: "center" }}>
        <span style={{ display: "inline-block", fontFamily: L.texto, fontWeight: 900, fontSize: tamP, lineHeight: 1.24, color: w.kw ? C.acento : C.claro, whiteSpace: "nowrap",
          transform: `scale(${lerp(0.7, 1, q)})`, opacity: clamp(q * 3), WebkitTextStroke: `${tamP * 0.06}px ${C.tinta}`, paintOrder: "stroke fill", textShadow: `0 4px 0 ${C.sombra(0.8)}` }}>{txt(w.w)}</span>
      </div>
    );
  }
  const base = 100;
  const ancho = ids.reduce((s, i) => s + medir(txt(W[i].w), `900 ${base}px "${L.texto}"`), 0) + medir(" ", `900 ${base}px "${L.texto}"`) * (ids.length - 1) * 1.2;
  const tam = Math.min(64, (880 / ancho) * base);
  const q = muelle(f, fps, W[ids[0]].s - 0.08, { damping: 14, stiffness: 320, mass: 0.5 }, C.k);
  const placa = S.estilo === "placa";
  const padX = 0.42 * tam;
  const padY = 0.2 * tam;
  return (
    <div style={{ position: "absolute", left: 0, width: 1080, top: S.y - tam * 0.62 - padY, display: "flex", justifyContent: "center" }}>
      <div style={{ padding: `${padY}px ${padX}px`, borderRadius: C.r(0.3 * tam), background: placa ? C.oscuro : "transparent", boxShadow: placa ? `0 12px 30px ${C.sombra(0.45)}` : "none",
        whiteSpace: "nowrap", transform: `scale(${lerp(0.82, 1, q)})`, opacity: clamp(q * 2.5) }}>
        {ids.map((i, j) => {
          const w = W[i];
          const dicha = t >= w.s - 0.04;
          const r = muelle(f, fps, w.s - 0.04, { damping: 12, stiffness: 300, mass: 0.4 }, C.k);
          return (
            <span key={i} style={{ display: "inline-block", fontFamily: L.texto, fontWeight: 900, fontSize: tam, lineHeight: 1.24, color: w.kw ? C.acento : C.claro,
              opacity: dicha ? 1 : 0.45, transform: `translateY(${dicha ? (1 - clamp(r)) * -0.08 * tam : 0}px)`, marginLeft: j ? 0.3 * tam : 0,
              textShadow: placa ? "none" : S.estilo === "limpio" ? `0 2px 12px ${C.sombra(0.6)}` : `0 0 6px ${C.sombra(0.9)}, 0 3px 0 ${C.sombra(0.8)}`,
              WebkitTextStroke: S.estilo === "clasico" ? `${tam * 0.05}px ${C.tinta}` : undefined, paintOrder: "stroke fill" }}>{txt(w.w)}</span>
          );
        })}
      </div>
    </div>
  );
};

// ------------------------------------------------------------ todo junto
export const Video = ({ datos: d }) => {
  const f = useCurrentFrame();
  const v = d.variantes ?? {};
  const C = conEstilo(d.marca, v);
  const L = letras(d.marca);
  const t = f / d.fps;
  let contenido;
  if (t >= d.vozFin) contenido = <Cierre d={d} f={f} C={C} L={L} />;
  else {
    const cel = d.piezas.find((p) => p.tipo === "celular" && t >= p.desde - 0.05 && t <= p.hasta + 0.05);
    contenido = (
      <>
        {cel && PROGRESO_CELULAR(cel, t) > 0.001 && <AbsoluteFill style={{ background: "#000" }}>
          <Img src={staticFile(`r/cam/${n5(Math.min(f, d.cam.length - 1))}.jpg`)} style={{ position: "absolute", width: 1080, height: 1920, filter: "blur(36px) brightness(.32) saturate(.8)", transform: "scale(1.15)", opacity: clamp(PROGRESO_CELULAR(cel, t) * 4) }} />
        </AbsoluteFill>}
        <Camara d={d} f={f} C={C} L={L} />
        {cel && <Celular p={cel} f={f} fps={d.fps} C={C} L={L} />}
        {d.piezas.map((p) => { const P = PIEZAS_DELANTE[p.tipo]; return P ? <P key={p.n} p={p} f={f} fps={d.fps} C={C} L={L} marca={d.marca} /> : null; })}
        <Subtitulos d={d} f={f} C={C} L={L} />
        <DestelloCorte d={d} f={f} />
      </>
    );
  }
  return (
    <AbsoluteFill style={{ background: C.oscuro, overflow: "hidden" }}>
      <Letras marca={d.marca} />
      {/* La transición del estilo: lo que mueve TODO el cuadro (zoom, paneo, temblor) y lo que va por delante. */}
      <ConTransicion variante={v.transicion} d={d} f={f} C={C}>{contenido}</ConTransicion>
    </AbsoluteFill>
  );
};
