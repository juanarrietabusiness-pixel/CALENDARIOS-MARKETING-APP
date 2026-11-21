// Las PIEZAS gráficas del editor, cada una con lo que dice la escena (src/lib/escenaEdicion.js): tiempos en segundos de
// salida, posiciones en px de 1080×1920 y la marca. Salen de Rofer v2 y Comunidad v3; ningún color ni letra es fijo.
import React from "react";
import { Img, OffthreadVideo, staticFile } from "remotion";
import { clamp, lerp, eout, ein, ease, muelle, PROGRESO_CELULAR } from "./base.js";

// ------------------------------------------------------------ las que van DETRÁS de la persona
export const Gigante = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  if (t < p.desde - 0.05 || t > p.hasta + 0.05) return null;
  const tam = p.tam;
  const sale = clamp((t - (p.hasta - 0.2)) / 0.2);
  let tr = "";
  let o = 1;
  if (p.modo === "golpe") { const q = muelle(f, fps, p.desde, { damping: 13, stiffness: 260, mass: 0.7 }); tr = `scale(${lerp(1.9, 1, q)})`; o = clamp(q * 2.5); }
  else if (p.modo === "pop") { const q = muelle(f, fps, p.desde, { damping: 10, stiffness: 200, mass: 0.6 }); tr = `scale(${lerp(0.4, 1, q)})`; o = clamp(q * 2); }
  else { const q = eout(clamp((t - p.desde) / 0.32)); tr = `translateY(${(1 - q) * tam * 0.9}px)`; o = clamp(q * 3); }
  return (
    <div style={{ position: "absolute", left: 0, width: 1080, top: p.y - tam * 0.62, height: tam * 1.24, textAlign: "center", overflow: p.modo === "subir" ? "hidden" : "visible", opacity: 1 - sale }}>
      <div style={{ transform: `${tr} translateY(${-14 * ein(sale)}px)`, transformOrigin: "50% 55%", opacity: o, fontFamily: L.titular, fontSize: tam, lineHeight: 1.24,
        color: p.color === "acento" ? C.acento : C.claro, letterSpacing: p.espacio ?? 1, whiteSpace: "nowrap", textShadow: `0 10px 28px ${C.sombra(0.45)}, 0 2px 0 ${C.sombra(0.25)}` }}>{p.texto}</div>
    </div>
  );
};

/** El gancho: COMPLETO desde el cuadro 0 (es la portada) y sale antes de `hasta`. */
export const Titular = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  const sale = ein(clamp((t - (p.hasta - 0.24)) / 0.24));
  if (sale >= 1) return null;
  let y = p.y - p.lineas[0].tam * 0.62;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - sale, transform: `translateY(${-50 * sale}px)` }}>
      {p.lineas.map((l, i) => {
        const top = y;
        y += l.tam * 1.24 * 0.82;
        return <div key={i} style={{ position: "absolute", left: 0, width: 1080, top, textAlign: "center", fontFamily: L.titular, fontSize: l.tam, lineHeight: 1.24,
          color: l.color === "acento" ? C.acento : C.claro, textShadow: `0 10px 28px ${C.sombra(0.45)}, 0 2px 0 ${C.sombra(0.25)}`, letterSpacing: i ? 2 : 1, whiteSpace: "nowrap" }}>{l.texto}</div>;
      })}
    </div>
  );
};

export const Tachado = ({ p, f, fps, C }) => {
  const t = f / fps;
  if (t < p.desde || t > p.hasta) return null;
  const q = eout(clamp((t - p.desde) / 0.18));
  return <div style={{ position: "absolute", left: 540 - p.ancho / 2, top: p.y - 9, width: p.ancho, height: 18, borderRadius: 9, background: C.acento, transform: `rotate(-5deg) scaleX(${q})`,
    transformOrigin: "0 50%", opacity: 1 - clamp((t - (p.hasta - 0.15)) / 0.15), boxShadow: `0 6px 18px ${C.sombra(0.4)}` }} />;
};

/** Tres tamaños (o tres cosas) que crecen con su palabra; la imagen, si la hay, de la marca (public/marca/). */
export const Trio = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  if (t < p.desde - 0.05 || t > p.hasta + 0.05) return null;
  const o = 1 - clamp((t - (p.hasta - 0.2)) / 0.2);
  return (
    <div style={{ position: "absolute", left: 0, width: 1080, top: p.y, height: 330, opacity: o }}>
      {p.items.map((it, i) => {
        if (t < it.at - 0.03) return null;
        const q = muelle(f, fps, it.at, { damping: 11, stiffness: 210, mass: 0.6 });
        const cx = 190 + i * 350;
        const w = 300 * it.escala;
        return (
          <div key={i} style={{ position: "absolute", left: cx - 160, top: 0, width: 320, height: 330, opacity: clamp(q * 2), transform: `translateY(${(1 - q) * 60}px) scale(${lerp(0.6, 1, q)})`, transformOrigin: "50% 100%" }}>
            {p.imagen && <Img src={staticFile(p.imagen)} style={{ position: "absolute", left: 160 - w / 2, top: 230 - w * 0.588, width: w, filter: `drop-shadow(0 8px 18px ${C.sombra(0.5)})` }} />}
            <div style={{ position: "absolute", left: 0, width: 320, top: p.imagen ? 238 : 230 - 64 * it.escala, textAlign: "center", fontFamily: L.titular, fontSize: p.imagen ? 64 : 64 + 40 * it.escala, color: C.acento, letterSpacing: 1, textShadow: `0 10px 28px ${C.sombra(0.45)}` }}>{it.texto}</div>
          </div>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------ las que van DELANTE
export const Cinta = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  if (t < p.desde - 0.05 || t > p.hasta) return null;
  const q = eout(clamp((t - p.desde) / 0.28));
  const rayas = `repeating-linear-gradient(-45deg, ${C.oscuro} 0 26px, ${C.acento} 26px 52px)`;
  return (
    <div style={{ position: "absolute", left: -200, top: p.y - 70, width: 1480, height: 140, transform: `rotate(${p.giro}deg) translateX(${(1 - q) * -1500}px)`, opacity: 1 - clamp((t - (p.hasta - 0.18)) / 0.18), boxShadow: `0 16px 40px ${C.sombra(0.45)}` }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 22, background: rayas }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 22, background: rayas }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 22, bottom: 22, background: C.acento, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: L.titular, fontSize: 76, color: C.oscuro, letterSpacing: 2 }}>{p.texto}</div>
    </div>
  );
};

export const TarjetaLogo = ({ p, f, fps, C, marca }) => {
  const t = f / fps;
  if (!marca.logo || t < p.desde - 0.05 || t > p.hasta + 0.05) return null;
  const q = muelle(f, fps, p.desde, { damping: 12, stiffness: 190, mass: 0.6 });
  const sale = ease(clamp((t - (p.hasta - 0.25)) / 0.25));
  const w = p.ancho;
  return (
    <div style={{ position: "absolute", left: 540 - w / 2 - 22, top: p.y - w * 0.45, width: w + 44, height: w * 0.9, borderRadius: 30, background: "#fff", boxShadow: `0 22px 50px ${C.sombra(0.45)}`,
      opacity: clamp(q * 2) * (1 - sale), transform: `translateY(${(1 - q) * 80 - 120 * ein(sale)}px) scale(${lerp(0.7, 1, q)})`, display: "flex", alignItems: "center", justifyContent: "center", border: `5px solid ${C.acento}` }}>
      <Img src={staticFile(marca.logo)} style={{ maxWidth: w * 0.92, maxHeight: w * 0.78, objectFit: "contain" }} />
    </div>
  );
};

const ICONOS = {
  reloj: (c) => <svg width="50" height="50" viewBox="0 0 50 50"><circle cx="25" cy="25" r="21" fill="none" stroke={c} strokeWidth="6" /><path d="M25 13 V26 L33 31" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" /></svg>,
  dinero: (c, L) => <svg width="50" height="50" viewBox="0 0 50 50"><text x="25" y="40" textAnchor="middle" fontFamily={L.titular} fontSize="44" fill={c}>$</text></svg>,
  check: (c) => <svg width="50" height="50" viewBox="0 0 32 32"><path d="M6 17 L13 24 L26 8" fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  flecha: (c) => <svg width="50" height="50" viewBox="0 0 50 50"><path d="M10 25 H38 M28 14 L39 25 L28 36" fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};
export const Ficha = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  if (t < p.desde - 0.05 || t > p.hasta + 0.05) return null;
  const q = muelle(f, fps, p.desde, { damping: 11, stiffness: 220, mass: 0.55 });
  const o = clamp(q * 2) * (1 - clamp((t - (p.hasta - 0.15)) / 0.15));
  const baja = eout(clamp((t - (p.desde + 0.35)) / 0.3));
  const der = p.lado === "derecha";
  return (
    <div style={{ position: "absolute", top: p.y, ...(der ? { right: 1080 - p.x } : { left: p.x }), opacity: o, transform: `translateX(${(der ? 1 : -1) * 90 * (1 - q)}px) rotate(${der ? 4 : -4}deg) scale(${lerp(0.7, 1, q)})`,
      display: "flex", alignItems: "center", gap: 16, padding: "14px 30px 14px 16px", borderRadius: 999, background: C.oscuro, boxShadow: `0 14px 34px ${C.sombra(0.5)}` }}>
      <div style={{ width: 66, height: 66, borderRadius: 33, background: C.acento, display: "flex", alignItems: "center", justifyContent: "center" }}>{(ICONOS[p.icono] ?? ICONOS.check)(C.oscuro, L)}</div>
      <div style={{ fontFamily: L.titular, fontSize: 60, color: C.claro, letterSpacing: 1 }}>{p.texto}</div>
      {p.baja && <svg width="40" height="46" viewBox="0 0 40 46" style={{ opacity: baja, transform: `translateY(${(1 - baja) * -14}px)` }}><path d="M20 4 V36 M6 24 L20 40 L34 24" fill="none" stroke={C.acento} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
  );
};

export const Lista = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  if (t < p.desde || t > p.hasta + 0.05) return null;
  const o = 1 - clamp((t - (p.hasta - 0.22)) / 0.22);
  const cab = eout(clamp((t - p.desde) / 0.3));
  return (
    <div style={{ position: "absolute", left: p.x, top: p.y, opacity: o }}>
      {p.titulo && <div style={{ fontFamily: L.texto, fontWeight: 900, fontSize: 34, letterSpacing: 5, color: C.acento, textShadow: `0 3px 0 ${C.sombra(0.35)}, 0 0 22px ${C.sombra(0.55)}`, opacity: cab, transform: `translateX(${(1 - cab) * -40}px)`, marginBottom: 12 }}>{p.titulo}</div>}
      {p.items.map((it, i) => {
        if (t < it.at - 0.08) return null;
        const q = muelle(f, fps, it.at - 0.06, { damping: 12, stiffness: 240, mass: 0.5 });
        const destello = clamp(1 - (t - it.at) / 0.35);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, opacity: clamp(q * 2), transform: `translateX(${(1 - q) * -120}px)` }}>
            <div style={{ width: 62, height: 62, borderRadius: 14, background: C.acento, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 20px ${C.sombra(0.45)}` }}>{ICONOS.check(C.oscuro)}</div>
            <div style={{ padding: "8px 22px", borderRadius: 12, background: C.oscuro, fontFamily: L.texto, fontWeight: 900, fontSize: 46, color: C.claro, whiteSpace: "nowrap", boxShadow: `0 8px 20px ${C.sombra(0.45)}, 0 0 0 ${3 * destello}px ${C.acento}` }}>{it.texto}</div>
          </div>
        );
      })}
    </div>
  );
};

export const Sello = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  if (t < p.desde - 0.03 || t > p.hasta + 0.05) return null;
  const q = muelle(f, fps, p.desde, { damping: 13, stiffness: 300, mass: 0.7 });
  return (
    <div style={{ position: "absolute", left: 0, width: 1080, top: p.y - 110, height: 220, display: "flex", justifyContent: "center", alignItems: "center", opacity: clamp(q * 3) * (1 - clamp((t - (p.hasta - 0.2)) / 0.2)) }}>
      <div style={{ transform: `rotate(${p.giro}deg) scale(${lerp(2.2, 1, q)})`, padding: "20px 44px 18px", borderRadius: 18, border: `8px solid ${C.acento}`, background: C.oscuro, textAlign: "center", boxShadow: `0 20px 50px ${C.sombra(0.5)}` }}>
        <div style={{ fontFamily: L.texto, fontWeight: 900, fontSize: 38, letterSpacing: 6, color: C.acento }}>{p.arriba}</div>
        <div style={{ fontFamily: L.titular, fontSize: 112, lineHeight: 1.05, color: C.claro, letterSpacing: 2, whiteSpace: "nowrap" }}>{p.grande}</div>
      </div>
    </div>
  );
};

export const Preguntas = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  if (t < (p.items[0]?.at ?? p.desde) - 0.1 || t > p.hasta + 0.05) return null;
  const o = 1 - clamp((t - (p.hasta - 0.22)) / 0.22);
  const check = p.marcar === null ? 0 : eout(clamp((t - p.marcar) / 0.16));
  return (
    <div style={{ position: "absolute", left: 0, width: 1080, top: p.y, opacity: o }}>
      {p.items.map((it, i) => {
        if (t < it.at - 0.08) return null;
        const q = muelle(f, fps, it.at - 0.06, { damping: 12, stiffness: 240, mass: 0.5 });
        return (
          <div key={i} style={{ display: "flex", justifyContent: "center", marginBottom: 16, opacity: clamp(q * 2), transform: `translateY(${(1 - q) * 50}px) scale(${lerp(0.8, 1, q)})` }}>
            <div style={{ display: "flex", alignItems: "center", borderRadius: 16, background: C.oscuro, boxShadow: `0 10px 26px ${C.sombra(0.5)}`, overflow: "hidden" }}>
              <div style={{ width: 92, height: 92, background: C.acento, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: L.titular, fontSize: 64, color: C.oscuro, position: "relative" }}>
                <span style={{ opacity: 1 - check }}>{i + 1}</span>
                <div style={{ position: "absolute", opacity: check, transform: `scale(${lerp(0.4, 1, check)})` }}>{ICONOS.check(C.oscuro)}</div>
              </div>
              <div style={{ padding: "0 30px", fontFamily: L.texto, fontWeight: 900, fontSize: 46, color: C.claro, whiteSpace: "nowrap" }}>{it.texto}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const IconoWhatsApp = ({ s, C }) => (
  <svg width={s} height={s} viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="30" fill={C.whatsapp} />
    <path d="M32 13 a19 19 0 0 0 -16.4 28.6 L13 51 l9.7 -2.5 A19 19 0 1 0 32 13 z" fill="#fff" />
    <path d="M32 16.5 a15.5 15.5 0 0 0 -13.2 23.6 l-1.6 5.8 6 -1.6 A15.5 15.5 0 1 0 32 16.5 z" fill={C.whatsapp} />
    <path d="M25.2 23.5c.4-.9.8-.9 1.2-.9h1c.3 0 .7.1 1 .9l1.4 3.4c.1.3.2.7 0 1l-.6.9-.8.9c-.3.3-.5.6-.2 1.1.3.5 1.4 2.3 3 3.7 2 1.8 3.7 2.4 4.2 2.6.5.3.8.2 1.1-.1l1.4-1.7c.3-.4.6-.4 1-.2l3.3 1.6c.4.2.7.3.8.5.1.2.1 1.2-.3 2.3-.4 1.1-2.4 2.2-3.3 2.3-.9.1-1.7.4-5.8-1.2-4.9-1.9-8-6.9-8.2-7.2-.2-.3-2-2.6-2-5 0-2.4 1.2-3.5 1.7-4z" fill="#fff" />
  </svg>
);

export const BotonWhatsApp = ({ p, f, fps, C, L, marca }) => {
  const t = f / fps;
  if (t < p.desde - 0.03 || t >= p.hasta) return null;
  const q = muelle(f, fps, p.desde, { damping: 10, stiffness: 230, mass: 0.6 });
  const toque = p.toque ?? Infinity;
  const tq = clamp((t - toque) / 0.45);
  const presion = t > toque ? 1 - 0.06 * Math.sin(Math.PI * clamp((t - toque) / 0.22)) : 1;
  const late = t > p.desde + 0.5 ? 1 + 0.02 * Math.sin((t - p.desde) * 9) : 1;
  return (
    <div style={{ position: "absolute", left: 0, width: 1080, top: p.y, display: "flex", justifyContent: "center", opacity: clamp(q * 2) }}>
      <div style={{ position: "relative", transform: `scale(${lerp(0.4, 1, q) * presion * late})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "18px 44px 18px 22px", borderRadius: 999, background: C.oscuro, border: `6px solid ${C.acento}`, boxShadow: `0 22px 50px ${C.sombra(0.55)}` }}>
          <IconoWhatsApp s={104} C={C} />
          <div>
            <div style={{ fontFamily: L.texto, fontWeight: 900, fontSize: 30, letterSpacing: 5, color: C.acento, lineHeight: 1 }}>WHATSAPP</div>
            <div style={{ fontFamily: L.titular, fontSize: 92, color: C.claro, lineHeight: 1.05, letterSpacing: 2 }}>{marca.whatsapp}</div>
          </div>
        </div>
        {t > toque && <div style={{ position: "absolute", left: 120 - 60 * (1 + 2 * tq), top: 75 - 60 * (1 + 2 * tq), width: 120 * (1 + 2 * tq), height: 120 * (1 + 2 * tq), borderRadius: "50%", border: `5px solid ${C.acento}`, opacity: 0.9 * (1 - tq) }} />}
      </div>
    </div>
  );
};

// ------------------------------------------------------------ modo celular (Comunidad v3)

/** El teléfono con la pantalla (imagen o video de public/celular/), sobre un fondo desenfocado de la propia toma. */
export const Celular = ({ p, f, fps, C, L }) => {
  const t = f / fps;
  const m0 = PROGRESO_CELULAR(p, t);
  if (m0 <= 0.001) return null;
  const m = ease(clamp((m0 - 0.25) / 0.75));
  const PH = { w: 476, h: 1000, x: 302, y: 362, bez: 15 };
  const y = lerp(PH.y + 900, PH.y, m);
  const pantallas = p.pantallas.map((s) => ({ ...s, at: s.at ?? p.desde }));
  let k = 0;
  pantallas.forEach((s, i) => { if (t >= (s.at ?? 0)) k = i; });
  const titulo = [...p.titulos].reverse().find((x) => t >= x.at - 0.05);
  return (
    <>
      <div style={{ position: "absolute", left: PH.x, top: y, width: PH.w, height: PH.h, opacity: clamp(m * 2) }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 74, background: "#0c0c10", border: `2px solid ${C.oscuro}`, boxShadow: `0 40px 90px rgba(0,0,0,.65), inset 0 0 0 4px #1b1b22` }} />
        <div style={{ position: "absolute", left: PH.bez, top: PH.bez, width: PH.w - 2 * PH.bez, height: PH.h - 2 * PH.bez, borderRadius: 60, overflow: "hidden", background: "#000" }}>
          {pantallas.map((s, i) => {
            const entra = ease(clamp((t - s.at) / 0.45));
            if (i !== k && i !== k - 1) return null;
            const x = i === k && i > 0 ? 100 * (1 - entra) : i === k - 1 ? -100 * ease(clamp((t - pantallas[k].at) / 0.45)) : 0;
            const estilo = { position: "absolute", top: 50, width: "100%", height: "calc(100% - 50px)", objectFit: "cover", objectPosition: "top" };
            return <div key={i} style={{ position: "absolute", inset: 0, transform: `translateX(${x}%)` }}>
              {/\.(mp4|mov|webm)$/i.test(s.archivo) ? <OffthreadVideo src={staticFile(s.archivo)} style={estilo} muted /> : <Img src={staticFile(s.archivo)} style={estilo} />}
            </div>;
          })}
        </div>
        <div style={{ position: "absolute", left: PH.w / 2 - 62, top: PH.bez + 9, width: 124, height: 34, borderRadius: 17, background: "#000" }} />
      </div>
      {titulo && (
        <div style={{ position: "absolute", left: 0, width: 1080, top: 262, textAlign: "center", opacity: clamp((m0 - 0.5) * 2) }}>
          {titulo.numero && <div style={{ fontFamily: L.texto, fontWeight: 800, fontSize: 28, letterSpacing: 10, color: C.acento }}>{titulo.numero}</div>}
          <div style={{ fontFamily: L.titular, fontSize: 64, lineHeight: 1.05, color: C.claro, textShadow: "0 4px 20px rgba(0,0,0,.6)", opacity: eout(clamp((t - titulo.at) / 0.42)) }}>{titulo.texto}</div>
        </div>
      )}
    </>
  );
};
