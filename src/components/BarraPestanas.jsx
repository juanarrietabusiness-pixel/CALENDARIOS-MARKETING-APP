import { useEffect, useRef } from "react";
import Icon from "./Icon";
import { idDePestana, idDelPanel, indicePorTecla } from "../lib/pestanas";

// ============================================================
// Una barra de pestañas accesible (el patrón de pestañas de WAI-ARIA)
//
// `role="tablist"` con cada pestaña `role="tab"`, `aria-selected` y `aria-controls` hacia el panel; el foco va sólo
// a la escogida (las demás con `tabIndex={-1}`) y las flechas, Inicio y Fin lo mueven entre ellas. Se ABRE con Intro
// o Espacio (el clic del botón): activación manual, porque cada pestaña es una dirección y una pantalla que se
// descarga, y abrir la de al lado con sólo pasar por ella con las flechas cargaría pantallas de más.
//
// La usan las pestañas de un cliente (App.jsx), sus sub-secciones (Crear, Referencias, Marca) y Anuncios. Quien la
// pinta pone el panel: `<div role="tabpanel" id={idDelPanel(base)} aria-labelledby={idDePestana(base, actual)}>`
// (los dos ids, de lib/pestanas.js).
// ============================================================

/**
 * @param pestanas [[id, texto, icono?]]
 * @param actual   la escogida (ninguna: el foco entra por la primera)
 * @param base     el prefijo de los ids (un `useId()` de quien la pinta)
 */
export default function BarraPestanas({ etiqueta, pestanas, actual, onElegir, base, clase = "pestanas-cliente", claseItem = "pestana-cliente" }) {
  const barra = useRef(null);
  // En el teléfono la barra puede desplazar: la escogida, a la vista al entrar.
  useEffect(() => {
    barra.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [actual]);
  const conFoco = pestanas.some(([id]) => id === actual) ? actual : pestanas[0]?.[0];
  const alTeclear = (e) => {
    const botones = [...(barra.current?.querySelectorAll('[role="tab"]') ?? [])];
    const sig = indicePorTecla(botones.indexOf(document.activeElement), botones.length, e.key);
    if (sig < 0) return;
    e.preventDefault();
    botones[sig].focus();
  };
  return (
    <div ref={barra} role="tablist" aria-label={etiqueta} className={clase} onKeyDown={alTeclear}>
      {pestanas.map(([id, texto, icono]) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={idDePestana(base, id)}
          aria-selected={id === actual}
          aria-controls={idDelPanel(base)}
          tabIndex={id === conFoco ? 0 : -1}
          className={claseItem}
          onClick={() => onElegir(id)}
        >
          {icono && <Icon name={icono} size={16} />}
          <span>{texto}</span>
        </button>
      ))}
    </div>
  );
}
