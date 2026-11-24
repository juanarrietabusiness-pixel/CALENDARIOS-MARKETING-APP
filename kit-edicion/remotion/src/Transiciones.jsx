// Las TRANSICIONES del catálogo (src/lib/variantesEdicion.js, «transicion»): barrido diagonal, golpe de zoom, paneo
// rápido, deslizamiento, glitch y corte seco con destello. Ocurren en cada cambio de clip (datos.cambios) y al pasar al
// cierre (datos.vozFin). Cada una da dos cosas: `raiz`, el estilo de TODO el cuadro (lo que se mueve: zoom, paneo,
// temblor) y `encima`, lo que se pinta por delante (la franja, el panel, las interferencias, el destello). Al ritmo del
// estilo (C.k): más pausado, más cuadros.
import React from "react";
import { AbsoluteFill } from "remotion";
import { lerp, ease, ein, eout } from "./base.js";

/** El cambio más cercano a este cuadro dentro de la ventana [−h, h]: → { k0 (cuadros desde el corte), h } o null. */
function cercano(d, f, h) {
  let mejor = null;
  for (const s of [...d.cambios, d.vozFin]) {
    const k0 = f - Math.round(s * d.fps);
    if (k0 < -h || k0 > h) continue;
    if (!mejor || Math.abs(k0) < Math.abs(mejor.k0)) mejor = { k0, h };
  }
  return mejor;
}

/** Un número que parece al azar pero es siempre el mismo para el mismo cuadro (el render va por trozos y en paralelo). */
const azar = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** La transición de este cuadro: { raiz, encima }. */
function transicion(variante, d, f, C) {
  const k = C.k ?? 1;
  const nada = { raiz: null, encima: null };
  switch (variante) {
    case "zoom": {
      const c = cercano(d, f, Math.round(6 * k));
      if (!c) return nada;
      // Antes del corte se acerca de golpe; después llega desde cerca y se asienta.
      const antes = c.k0 < 0;
      const q = antes ? ein((c.k0 + c.h) / c.h) : 1 - eout(c.k0 / c.h);
      const z = 1 + 0.42 * q;
      return {
        raiz: { transform: `scale(${z})`, transformOrigin: "50% 42%", filter: q > 0.05 ? `blur(${7 * q}px)` : undefined },
        encima: c.k0 >= 0 && c.k0 < 2 ? <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: 0.35 * (1 - c.k0 / 2) }} /> : null,
      };
    }
    case "paneo": {
      const c = cercano(d, f, Math.round(5 * k));
      if (!c) return nada;
      const antes = c.k0 < 0;
      const q = antes ? ein((c.k0 + c.h) / c.h) : 1 - eout(c.k0 / c.h);
      // Se desplaza de lado y crece lo justo para que no asome el fondo por el borde.
      const x = (antes ? -1 : 1) * 300 * q;
      return {
        raiz: { transform: `translateX(${x}px) scale(${1 + 0.6 * q})`, filter: q > 0.05 ? `blur(${20 * q}px)` : undefined },
        // La estela: rayas del color de la marca, horizontales, que se ven sólo en lo más rápido.
        encima: q > 0.25 ? (
          <div style={{ position: "absolute", inset: 0, opacity: 0.55 * q, background: `repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 38px, ${C.sombra(0.35)} 38px 46px)`, mixBlendMode: "multiply" }} />
        ) : null,
      };
    }
    case "deslizar": {
      const c = cercano(d, f, Math.round(8 * k));
      if (!c) return nada;
      // Un panel del color oscuro sube desde abajo, tapa el corte y sigue hacia arriba; su borde de arriba, del acento.
      const q = ease((c.k0 + c.h) / (2 * c.h));
      const y = lerp(1920, -2300, q);
      const radio = C.r(120);
      return {
        raiz: null,
        encima: (
          <div style={{ position: "absolute", left: -40, width: 1160, top: y, height: 2300, background: C.oscuro, borderRadius: `${radio}px ${radio}px 0 0`, boxShadow: `0 -18px 0 ${C.acento}, 0 -40px 60px ${C.sombra(0.4)}` }} />
        ),
      };
    }
    case "glitch": {
      const c = cercano(d, f, Math.max(2, Math.round(3 * k)));
      if (!c) return nada;
      const fuerza = 1 - Math.abs(c.k0) / (c.h + 1);
      const jx = (azar(f) - 0.5) * 46 * fuerza;
      const franjas = Array.from({ length: 6 }, (_, i) => {
        const top = Math.floor(azar(f * 7 + i) * 1800);
        const alto = 30 + Math.floor(azar(f * 13 + i) * 140);
        const dx = (azar(f * 3 + i) - 0.5) * 220 * fuerza;
        return { top, alto, dx, color: i % 3 === 0 ? C.acento : null };
      });
      return {
        raiz: { transform: `translateX(${jx}px)`, filter: `contrast(${1 + 0.35 * fuerza}) saturate(${1 + 0.8 * fuerza})` },
        encima: (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            {franjas.map((x, i) => (
              <div key={i} style={{ position: "absolute", left: x.dx, width: 1080, top: x.top, height: x.alto, backdropFilter: i % 2 ? "invert(1) hue-rotate(160deg)" : "hue-rotate(90deg) saturate(3)",
                background: x.color ? x.color : "transparent", opacity: x.color ? 0.55 * fuerza : 1, mixBlendMode: x.color ? "screen" : undefined }} />
            ))}
            <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 2px, rgba(0,0,0,0) 2px 5px)", opacity: fuerza }} />
          </div>
        ),
      };
    }
    case "destello": {
      // Corte seco: nada se mueve; dos o tres cuadros de destello blanco con el acento detrás.
      const c = cercano(d, f, 4);
      if (!c || c.k0 < 0) return nada;
      const n = Math.max(2, Math.round(2 * k));
      if (c.k0 >= n) return nada;
      const o = 1 - c.k0 / n;
      return {
        raiz: null,
        encima: (
          <>
            <div style={{ position: "absolute", inset: 0, background: C.acento, opacity: 0.35 * o, mixBlendMode: "screen" }} />
            <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: 0.8 * o }} />
          </>
        ),
      };
    }
    default: {
      // «barrido»: la franja diagonal del color oscuro con filo del acento (el de Rofer v2).
      const c = cercano(d, f, Math.round(6 * k));
      if (!c) return nada;
      const x = lerp(-1800, 1500, ease((c.k0 + c.h) / (2 * c.h)));
      return {
        raiz: null,
        encima: (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -400, left: x, width: 1500, height: 2720, transform: "skewX(-14deg)", background: C.oscuro, boxShadow: `-26px 0 0 ${C.acento}, 26px 0 0 ${C.acento}` }} />
          </div>
        ),
      };
    }
  }
}

/** El destello pequeño de los cortes que NO son cambio de clip (los saltos dentro de una toma), igual con toda variante. */
export const DestelloCorte = ({ d, f }) => {
  let o = 0;
  for (const c of d.cortes) {
    if (d.cambios.some((s) => Math.abs(s - c) < 0.02)) continue;
    const k = f - Math.round(c * d.fps);
    if (k >= 0 && k < 4) o = Math.max(o, 0.22 * (1 - k / 4));
  }
  return o > 0 ? <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: o, mixBlendMode: "soft-light" }} /> : null;
};

/** Lo que se ve (`children`) con la transición del estilo en este cuadro: movido por ella y con lo suyo por encima. */
export const ConTransicion = ({ variante, d, f, C, children }) => {
  const tr = transicion(variante, d, f, C);
  return (
    <>
      <AbsoluteFill style={tr.raiz ?? undefined}>{children}</AbsoluteFill>
      {tr.encima}
    </>
  );
};
