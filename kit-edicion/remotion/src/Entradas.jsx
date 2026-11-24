// Las ENTRADAS de texto del catálogo (src/lib/variantesEdicion.js, «entrada»): subir, golpe, palabra por palabra, máscara,
// máquina de escribir y escala suave. Todas con la letra y los colores de la marca, y al RITMO del estilo (C.k). Ninguna
// cambia el ancho final del texto: la escena (escenaEdicion.js) mide el texto ya puesto y eso no se mueve.
import React from "react";
import { clamp, lerp, ease, eout, muelle } from "./base.js";

/**
 * Un texto que entra en el segundo `desde` con su variante. `estilo`: lo que lo pinta (familia, tamaño, color, sombra,
 * interletra); `tam`: su tamaño en px (para lo que se mide en proporción a la letra). Devuelve un inline-block: quien lo
 * coloca decide dónde va.
 */
export function TextoEntrante({ texto, variante = "subir", desde, f, fps, C, estilo = {}, tam = 100 }) {
  const k = C.k ?? 1;
  const u = f / fps - desde;
  const txt = String(texto ?? "");
  const base = { display: "inline-block", whiteSpace: "nowrap", ...estilo };
  switch (variante) {
    case "golpe": {
      const q = muelle(f, fps, desde, { damping: 13, stiffness: 260, mass: 0.7 }, k);
      return <span style={{ ...base, transform: `scale(${lerp(1.9, 1, q)})`, transformOrigin: "50% 55%", opacity: clamp(q * 2.5) }}>{txt}</span>;
    }
    case "escala": {
      // Despacio y sin rebote: apenas más pequeño, desenfocado y con las letras un poco abiertas.
      const q = eout(clamp(u / (0.75 * k)));
      const abre = (1 - q) * 0.05 * tam;
      return <span style={{ ...base, transform: `scale(${lerp(0.9, 1, q)})`, opacity: clamp(q * 1.4), filter: `blur(${(1 - q) * 7}px)`, letterSpacing: (estilo.letterSpacing ?? 0) + abre }}>{txt}</span>;
    }
    case "mascara": {
      // Un bloque del acento crece sobre el sitio del texto y, al retirarse hacia la derecha, lo deja descubierto.
      const dur = 0.55 * k;
      const q1 = ease(clamp(u / (dur * 0.5)));
      const q2 = ease(clamp((u - dur * 0.5) / (dur * 0.5)));
      const bloque = u < dur * 0.5 ? { transform: `scaleX(${q1})`, transformOrigin: "0 50%" } : { transform: `scaleX(${1 - q2})`, transformOrigin: "100% 50%" };
      return (
        <span style={{ ...base, position: "relative" }}>
          <span style={{ visibility: u >= dur * 0.5 ? "visible" : "hidden" }}>{txt}</span>
          {u >= 0 && q2 < 1 && <span style={{ position: "absolute", left: -tam * 0.06, right: -tam * 0.06, top: "12%", bottom: "8%", background: C.acento, ...bloque }} />}
        </span>
      );
    }
    case "palabra": {
      const ws = txt.split(/\s+/).filter(Boolean);
      const paso = 0.13 * k;
      return (
        <span style={base}>
          {ws.map((w, i) => {
            const q = muelle(f, fps, desde + i * paso, { damping: 12, stiffness: 240, mass: 0.5 }, k);
            return <span key={i} style={{ display: "inline-block", opacity: clamp(q * 2), transform: `translateY(${(1 - clamp(q)) * 0.35 * tam}px)` }}>{w}{i < ws.length - 1 ? " " : ""}</span>;
          })}
        </span>
      );
    }
    case "maquina": {
      const letras = [...txt];
      const por = 0.045 * k;
      const n = u < 0 ? 0 : Math.min(letras.length, Math.floor(u / por) + 1);
      const fin = letras.length * por;
      // El cursor: fijo mientras escribe, parpadea medio segundo y se va. No ocupa sitio (ancho 0).
      const cursor = u >= 0 && (u < fin || (u < fin + 0.6 && Math.floor((u - fin) / 0.2) % 2 === 0));
      const marca = <span key="c" style={{ display: "inline-block", width: 0, position: "relative" }}><span style={{ position: "absolute", left: tam * 0.03, top: tam * 0.18, height: tam * 0.92, width: Math.max(6, tam * 0.07), background: C.acento }} /></span>;
      return (
        <span style={base}>
          {letras.map((c, i) => (
            <React.Fragment key={i}>
              <span style={{ visibility: i < n ? "visible" : "hidden" }}>{c}</span>
              {cursor && i === n - 1 ? marca : null}
            </React.Fragment>
          ))}
          {cursor && n === 0 ? marca : null}
        </span>
      );
    }
    default: {
      // «subir»: desde su línea, como saliendo de una ranura.
      const q = eout(clamp(u / (0.32 * k)));
      return (
        <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", padding: `0 ${tam * 0.3}px ${tam * 0.1}px`, margin: `0 ${-tam * 0.3}px` }}>
          <span style={{ ...base, transform: `translateY(${(1 - q) * tam * 0.9}px)`, opacity: clamp(q * 3) }}>{txt}</span>
        </span>
      );
    }
  }
}
