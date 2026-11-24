// Los CIERRES del catálogo (src/lib/variantesEdicion.js, «cierre»): tarjeta (el de Rofer v2), limpio, banda y círculo.
// Todos dicen lo mismo —el logo, el llamado, el número de WhatsApp y el @usuario de la marca— de maneras distintas, al
// ritmo del estilo (C.k) y con su forma (C.r). Se apagan en los últimos 0,35 s.
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { clamp, lerp, ease, eout, ein, muelle } from "./base.js";
import { IconoWhatsApp } from "./Piezas.jsx";

/** Lo común: los tiempos del cierre. */
function tiempos(d, f) {
  const t = f / d.fps;
  return { t, te: t - d.vozFin, apaga: 1 - ein(clamp((t - (d.total / d.fps - 0.35)) / 0.35)) };
}

const Tarjeta = ({ d, f, C, L }) => {
  const fps = d.fps;
  const { te, apaga } = tiempos(d, f);
  const VF = d.vozFin;
  const m = d.marca;
  const k = C.k;
  const lg = muelle(f, fps, VF + 0.08 * k, { damping: 12, stiffness: 160, mass: 0.7 }, k);
  const bt = muelle(f, fps, VF + 0.45 * k, { damping: 10, stiffness: 200, mass: 0.6 }, k);
  const nm = eout(clamp((te - 0.7 * k) / (0.35 * k)));
  const ig = eout(clamp((te - 0.95 * k) / (0.35 * k)));
  const late = te > 1.2 * k ? 1 + 0.025 * Math.max(0, Math.sin((te - 1.2 * k) * 6 / k)) : 1;
  const rayas = `repeating-linear-gradient(-45deg, ${C.oscuro} 0 34px, ${C.acento} 34px 68px)`;
  return (
    <AbsoluteFill style={{ background: C.oscuro, opacity: apaga }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(900px 900px at 50% 36%, rgba(255,255,255,.10), rgba(0,0,0,0) 70%), radial-gradient(1200px 900px at 50% 110%, ${C.sombra(0.6)}, rgba(0,0,0,0) 70%)` }} />
      {d.cierre.rayas !== false && <>
        <div style={{ position: "absolute", left: 0, top: 0, height: 30, width: 1300, background: rayas, transform: `translateX(${-60 + te * 40}px)` }} />
        <div style={{ position: "absolute", left: 0, bottom: 0, height: 30, width: 1300, background: rayas, transform: `translateX(${-60 - te * 40}px)` }} />
      </>}
      {m.logo && <div style={{ position: "absolute", left: 240, top: 440, width: 600, height: 520, borderRadius: C.r(44), background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        opacity: clamp(lg * 2), transform: `scale(${lerp(0.6, 1, lg)}) translateY(${(1 - lg) * 40}px)`, boxShadow: "0 30px 70px rgba(0,0,0,.45)" }}>
        <Img src={staticFile(m.logo)} style={{ maxWidth: 540, maxHeight: 460, objectFit: "contain" }} />
      </div>}
      {m.llamado && <div style={{ position: "absolute", left: 0, width: 1080, top: 1030, display: "flex", justifyContent: "center", opacity: clamp(bt * 2) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 40px", borderRadius: C.r(999), background: C.acento, transform: `scale(${lerp(0.5, 1, bt) * late})`, boxShadow: "0 18px 40px rgba(0,0,0,.35)" }}>
          {m.whatsapp && <IconoWhatsApp s={70} C={C} />}
          <div style={{ fontFamily: L.texto, fontWeight: 900, fontSize: 48, color: C.oscuro, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{m.llamado}</div>
        </div>
      </div>}
      {m.whatsapp && <div style={{ position: "absolute", left: 0, width: 1080, top: 1180 + 30 * (1 - nm), textAlign: "center", opacity: nm, fontFamily: L.titular, fontSize: 128, color: C.claro, letterSpacing: 4 }}>{m.whatsapp}</div>}
      {m.usuario && <div style={{ position: "absolute", left: 0, width: 1080, top: 1360 + 24 * (1 - ig), textAlign: "center", opacity: ig, fontFamily: L.texto, fontWeight: 800, fontSize: 40, color: "rgba(255,255,255,.85)" }}>{m.usuario}</div>}
    </AbsoluteFill>
  );
};

/** Limpio: el logo en un círculo blanco, una línea fina del acento que se abre, el llamado espaciado y el número. Sin rebotes. */
const Limpio = ({ d, f, C, L }) => {
  const { te, apaga } = tiempos(d, f);
  const m = d.marca;
  const k = C.k;
  const paso = (a, dur = 0.6) => eout(clamp((te - a * k) / (dur * k)));
  const lg = paso(0.1, 0.8);
  const linea = ease(clamp((te - 0.45 * k) / (0.7 * k)));
  const ll = paso(0.75);
  const nm = paso(0.95);
  const ig = paso(1.15);
  return (
    <AbsoluteFill style={{ background: C.oscuro, opacity: apaga }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(1000px 800px at 50% 40%, rgba(255,255,255,.06), rgba(0,0,0,0) 70%)` }} />
      {m.logo && <div style={{ position: "absolute", left: 540 - 210, top: 430, width: 420, height: 420, borderRadius: C.recta ? C.r(8) : 210, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        opacity: lg, transform: `translateY(${(1 - lg) * 30}px) scale(${lerp(0.94, 1, lg)})`, boxShadow: `0 24px 60px ${C.sombra(0.4)}` }}>
        <Img src={staticFile(m.logo)} style={{ maxWidth: 320, maxHeight: 300, objectFit: "contain" }} />
      </div>}
      <div style={{ position: "absolute", left: 540 - 300 * linea, width: 600 * linea, top: 945, height: 4, background: C.acento }} />
      {m.llamado && <div style={{ position: "absolute", left: 0, width: 1080, top: 990, textAlign: "center", opacity: ll, transform: `translateY(${(1 - ll) * 16}px)`,
        fontFamily: L.texto, fontWeight: 800, fontSize: 36, letterSpacing: 9, color: C.acento, whiteSpace: "nowrap" }}>{m.llamado}</div>}
      {m.whatsapp && <div style={{ position: "absolute", left: 0, width: 1080, top: 1070, textAlign: "center", opacity: nm, transform: `translateY(${(1 - nm) * 20}px)`, fontFamily: L.titular, fontSize: 116, color: C.claro, letterSpacing: 6 }}>{m.whatsapp}</div>}
      {m.usuario && <div style={{ position: "absolute", left: 0, width: 1080, top: 1240, textAlign: "center", opacity: ig * 0.85, fontFamily: L.texto, fontWeight: 600, fontSize: 36, letterSpacing: 2, color: C.claro }}>{m.usuario}</div>}
    </AbsoluteFill>
  );
};

/** Banda: el acento entra de lado y se queda en diagonal; el logo y el número a la izquierda, con golpe. */
const Banda = ({ d, f, C, L }) => {
  const fps = d.fps;
  const { te, apaga } = tiempos(d, f);
  const m = d.marca;
  const k = C.k;
  const VF = d.vozFin;
  const b = eout(clamp(te / (0.35 * k)));
  const lg = muelle(f, fps, VF + 0.25 * k, { damping: 14, stiffness: 260, mass: 0.6 }, k);
  const nm = muelle(f, fps, VF + 0.5 * k, { damping: 14, stiffness: 300, mass: 0.6 }, k);
  const ll = eout(clamp((te - 0.75 * k) / (0.3 * k)));
  const ig = eout(clamp((te - 0.95 * k) / (0.3 * k)));
  return (
    <AbsoluteFill style={{ background: C.oscuro, opacity: apaga, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -300, top: 1010, width: 1700, height: 420, background: C.acento, transform: `rotate(-8deg) translateX(${(1 - b) * -1800}px)`, boxShadow: `0 30px 60px ${C.sombra(0.45)}` }} />
      <div style={{ position: "absolute", left: -300, top: 1450, width: 1700, height: 26, background: C.claro, opacity: 0.9, transform: `rotate(-8deg) translateX(${(1 - b) * 1800}px)` }} />
      {m.logo && <div style={{ position: "absolute", left: 80, top: 430, width: 460, height: 400, borderRadius: C.r(28), background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        opacity: clamp(lg * 2), transform: `translateX(${(1 - lg) * -160}px) rotate(${-3 * (1 - lg)}deg)`, boxShadow: `0 26px 60px ${C.sombra(0.5)}` }}>
        <Img src={staticFile(m.logo)} style={{ maxWidth: 410, maxHeight: 350, objectFit: "contain" }} />
      </div>}
      {m.llamado && <div style={{ position: "absolute", left: 80, top: 880, opacity: ll, transform: `translateX(${(1 - ll) * -60}px)`, fontFamily: L.titular, fontSize: 64, lineHeight: 1.05, color: C.claro, letterSpacing: 2, maxWidth: 920 }}>{m.llamado}</div>}
      {m.whatsapp && <div style={{ position: "absolute", left: 80, top: 1120, transform: `rotate(-8deg) scale(${lerp(1.6, 1, nm)})`, transformOrigin: "0 50%", opacity: clamp(nm * 2), display: "flex", alignItems: "center", gap: 24 }}>
        <IconoWhatsApp s={110} C={C} />
        <div style={{ fontFamily: L.titular, fontSize: 132, color: C.oscuro, letterSpacing: 3 }}>{m.whatsapp}</div>
      </div>}
      {m.usuario && <div style={{ position: "absolute", left: 80, top: 1560, opacity: ig, fontFamily: L.texto, fontWeight: 900, fontSize: 44, color: C.acento, letterSpacing: 1 }}>{m.usuario}</div>}
    </AbsoluteFill>
  );
};

/** Círculo: el acento se abre desde el centro y revela el logo con un rebote suave; el llamado en una píldora. */
const Circulo = ({ d, f, C, L }) => {
  const fps = d.fps;
  const { te, apaga } = tiempos(d, f);
  const m = d.marca;
  const k = C.k;
  const VF = d.vozFin;
  const abre = ease(clamp(te / (0.55 * k)));
  const lg = muelle(f, fps, VF + 0.3 * k, { damping: 9, stiffness: 140, mass: 0.7 }, k);
  const ll = muelle(f, fps, VF + 0.7 * k, { damping: 11, stiffness: 170, mass: 0.6 }, k);
  const nm = eout(clamp((te - 0.95 * k) / (0.4 * k)));
  const ig = eout(clamp((te - 1.15 * k) / (0.4 * k)));
  return (
    <AbsoluteFill style={{ background: C.oscuro, opacity: apaga }}>
      <div style={{ position: "absolute", inset: 0, background: C.acento, clipPath: `circle(${lerp(0, 1150, abre)}px at 540px 720px)` }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(800px 800px at 540px 720px, rgba(255,255,255,.25), rgba(0,0,0,0) 70%)`, opacity: abre }} />
      {m.logo && <div style={{ position: "absolute", left: 540 - 250, top: 720 - 250, width: 500, height: 500, borderRadius: C.recta ? C.r(8) : 250, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        opacity: clamp(lg * 2), transform: `scale(${lerp(0.3, 1, lg)})`, boxShadow: `0 30px 70px ${C.sombra(0.35)}` }}>
        <Img src={staticFile(m.logo)} style={{ maxWidth: 380, maxHeight: 360, objectFit: "contain" }} />
      </div>}
      {m.llamado && <div style={{ position: "absolute", left: 0, width: 1080, top: 1060, display: "flex", justifyContent: "center", opacity: clamp(ll * 2) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 42px", borderRadius: C.r(999), background: C.oscuro, transform: `translateY(${(1 - ll) * 50}px)`, boxShadow: `0 14px 34px ${C.sombra(0.35)}` }}>
          {m.whatsapp && <IconoWhatsApp s={64} C={C} />}
          <div style={{ fontFamily: L.texto, fontWeight: 800, fontSize: 44, color: C.claro, whiteSpace: "nowrap" }}>{m.llamado}</div>
        </div>
      </div>}
      {m.whatsapp && <div style={{ position: "absolute", left: 0, width: 1080, top: 1200 + 24 * (1 - nm), textAlign: "center", opacity: nm, fontFamily: L.titular, fontSize: 120, color: C.oscuro, letterSpacing: 4 }}>{m.whatsapp}</div>}
      {m.usuario && <div style={{ position: "absolute", left: 0, width: 1080, top: 1370 + 20 * (1 - ig), textAlign: "center", opacity: ig, fontFamily: L.texto, fontWeight: 800, fontSize: 40, color: C.oscuro }}>{m.usuario}</div>}
    </AbsoluteFill>
  );
};

const CIERRES = { tarjeta: Tarjeta, limpio: Limpio, banda: Banda, circulo: Circulo };

/** El cierre del estilo (datos.variantes.cierre); desde el final de la voz. */
export const Cierre = ({ d, f, C, L }) => {
  if (f / d.fps < d.vozFin) return null;
  const P = CIERRES[d.variantes?.cierre] ?? Tarjeta;
  return <P d={d} f={f} C={C} L={L} />;
};
