// El VIDEO del editor: cámara virtual + lo que va detrás de la persona + la persona recortada + lo de delante + los
// subtítulos + las transiciones + el cierre. Todo sale de public/datos.json (src/lib/escenaEdicion.js) y de los cuadros
// de public/r/ (kit-edicion/python/cuadros.py). Las capas, en el orden de Rofer v2: los textos van en espacio de PANTALLA,
// nunca dentro del contenedor que hace zoom (se descentraban: corrección de la agencia en Comunidad).
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, continueRender, delayRender } from "remotion";
import { clamp, lerp, ease, eout, ein, n5, muelle, colores, letras, PROGRESO_CELULAR, BURBUJA } from "./base.js";
import { Celular, IconoWhatsApp } from "./Piezas.jsx";
import { PIEZAS_DETRAS, PIEZAS_DELANTE } from "./catalogo.js";

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
  const base = 100;
  const ancho = ids.reduce((s, i) => s + medir(txt(W[i].w), `900 ${base}px "${L.texto}"`), 0) + medir(" ", `900 ${base}px "${L.texto}"`) * (ids.length - 1) * 1.2;
  const tam = Math.min(64, (880 / ancho) * base);
  const q = muelle(f, fps, W[ids[0]].s - 0.08, { damping: 14, stiffness: 320, mass: 0.5 });
  const placa = S.estilo === "placa";
  const padX = 0.42 * tam;
  const padY = 0.2 * tam;
  return (
    <div style={{ position: "absolute", left: 0, width: 1080, top: S.y - tam * 0.62 - padY, display: "flex", justifyContent: "center" }}>
      <div style={{ padding: `${padY}px ${padX}px`, borderRadius: 0.3 * tam, background: placa ? C.oscuro : "transparent", boxShadow: placa ? `0 12px 30px ${C.sombra(0.45)}` : "none",
        whiteSpace: "nowrap", transform: `scale(${lerp(0.82, 1, q)})`, opacity: clamp(q * 2.5) }}>
        {ids.map((i, j) => {
          const w = W[i];
          const dicha = t >= w.s - 0.04;
          const r = muelle(f, fps, w.s - 0.04, { damping: 12, stiffness: 300, mass: 0.4 });
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

// ------------------------------------------------------------ transiciones
const Barrido = ({ d, f, C }) => {
  for (const s of [...d.cambios, d.vozFin]) {
    const k0 = f - Math.round(s * d.fps);
    if (k0 < -6 || k0 > 6) continue;
    const x = lerp(-1800, 1500, ease((k0 + 6) / 12));
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -400, left: x, width: 1500, height: 2720, transform: "skewX(-14deg)", background: C.oscuro, boxShadow: `-26px 0 0 ${C.acento}, 26px 0 0 ${C.acento}` }} />
      </div>
    );
  }
  return null;
};
const Destello = ({ d, f }) => {
  let o = 0;
  for (const c of d.cortes) {
    if (d.cambios.some((s) => Math.abs(s - c) < 0.02)) continue;
    const k = f - Math.round(c * d.fps);
    if (k >= 0 && k < 4) o = Math.max(o, 0.22 * (1 - k / 4));
  }
  return o > 0 ? <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: o, mixBlendMode: "soft-light" }} /> : null;
};

// ------------------------------------------------------------ cierre: logo, botón del llamado, número y @usuario
const Cierre = ({ d, f, C, L }) => {
  const fps = d.fps;
  const t = f / fps;
  const VF = d.vozFin;
  const te = t - VF;
  if (te < 0) return null;
  const m = d.marca;
  const lg = muelle(f, fps, VF + 0.08, { damping: 12, stiffness: 160, mass: 0.7 });
  const bt = muelle(f, fps, VF + 0.45, { damping: 10, stiffness: 200, mass: 0.6 });
  const nm = eout(clamp((te - 0.7) / 0.35));
  const ig = eout(clamp((te - 0.95) / 0.35));
  const late = te > 1.2 ? 1 + 0.025 * Math.max(0, Math.sin((te - 1.2) * 6)) : 1;
  const apaga = 1 - ein(clamp((t - (d.total / fps - 0.35)) / 0.35));
  const rayas = `repeating-linear-gradient(-45deg, ${C.oscuro} 0 34px, ${C.acento} 34px 68px)`;
  return (
    <AbsoluteFill style={{ background: C.oscuro, opacity: apaga }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(900px 900px at 50% 36%, rgba(255,255,255,.10), rgba(0,0,0,0) 70%), radial-gradient(1200px 900px at 50% 110%, ${C.sombra(0.6)}, rgba(0,0,0,0) 70%)` }} />
      {d.cierre.rayas !== false && <>
        <div style={{ position: "absolute", left: 0, top: 0, height: 30, width: 1300, background: rayas, transform: `translateX(${-60 + te * 40}px)` }} />
        <div style={{ position: "absolute", left: 0, bottom: 0, height: 30, width: 1300, background: rayas, transform: `translateX(${-60 - te * 40}px)` }} />
      </>}
      {m.logo && <div style={{ position: "absolute", left: 240, top: 440, width: 600, height: 520, borderRadius: 44, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        opacity: clamp(lg * 2), transform: `scale(${lerp(0.6, 1, lg)}) translateY(${(1 - lg) * 40}px)`, boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}>
        <Img src={staticFile(m.logo)} style={{ maxWidth: 540, maxHeight: 460, objectFit: "contain" }} />
      </div>}
      {m.llamado && <div style={{ position: "absolute", left: 0, width: 1080, top: 1030, display: "flex", justifyContent: "center", opacity: clamp(bt * 2) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 40px", borderRadius: 999, background: C.acento, transform: `scale(${lerp(0.5, 1, bt) * late})`, boxShadow: "0 18px 40px rgba(0,0,0,.35)" }}>
          {m.whatsapp && <IconoWhatsApp s={70} C={C} />}
          <div style={{ fontFamily: L.texto, fontWeight: 900, fontSize: 48, color: C.oscuro, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{m.llamado}</div>
        </div>
      </div>}
      {m.whatsapp && <div style={{ position: "absolute", left: 0, width: 1080, top: 1180 + 30 * (1 - nm), textAlign: "center", opacity: nm, fontFamily: L.titular, fontSize: 128, color: C.claro, letterSpacing: 4 }}>{m.whatsapp}</div>}
      {m.usuario && <div style={{ position: "absolute", left: 0, width: 1080, top: 1360 + 24 * (1 - ig), textAlign: "center", opacity: ig, fontFamily: L.texto, fontWeight: 800, fontSize: 40, color: "rgba(255,255,255,.85)" }}>{m.usuario}</div>}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ todo junto
export const Video = ({ datos: d }) => {
  const f = useCurrentFrame();
  const C = colores(d.marca);
  const L = letras(d.marca);
  const t = f / d.fps;
  if (t >= d.vozFin) return (<AbsoluteFill><Letras marca={d.marca} /><Cierre d={d} f={f} C={C} L={L} /><Barrido d={d} f={f} C={C} /></AbsoluteFill>);
  const cel = d.piezas.find((p) => p.tipo === "celular" && t >= p.desde - 0.05 && t <= p.hasta + 0.05);
  return (
    <AbsoluteFill style={{ background: C.oscuro, overflow: "hidden" }}>
      <Letras marca={d.marca} />
      {cel && PROGRESO_CELULAR(cel, t) > 0.001 && <AbsoluteFill style={{ background: "#000" }}>
        <Img src={staticFile(`r/cam/${n5(Math.min(f, d.cam.length - 1))}.jpg`)} style={{ position: "absolute", width: 1080, height: 1920, filter: "blur(36px) brightness(.32) saturate(.8)", transform: "scale(1.15)", opacity: clamp(PROGRESO_CELULAR(cel, t) * 4) }} />
      </AbsoluteFill>}
      <Camara d={d} f={f} C={C} L={L} />
      {cel && <Celular p={cel} f={f} fps={d.fps} C={C} L={L} />}
      {d.piezas.map((p) => { const P = PIEZAS_DELANTE[p.tipo]; return P ? <P key={p.n} p={p} f={f} fps={d.fps} C={C} L={L} marca={d.marca} /> : null; })}
      <Subtitulos d={d} f={f} C={C} L={L} />
      <Destello d={d} f={f} />
      <Barrido d={d} f={f} C={C} />
    </AbsoluteFill>
  );
};
