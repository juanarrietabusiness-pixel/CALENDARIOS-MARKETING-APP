import { useState, useEffect, useRef, useId } from "react";
import Icon from "./Icon";
import { navegar } from "../lib/rutas";
import { iniciales } from "../utils";

// ============================================================
// La cuenta: quién soy y salir
//
// El correo y el botón «Salir» ocupaban la cabecera entera en el
// móvil. Ahora van en un desplegable anclado al avatar. Es un
// desplegable, no un diálogo: se cierra con Escape y con un clic fuera,
// y el fondo sigue usable.
// ============================================================

export default function MenuCuenta({ yo, onSalir }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const boton = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false); };
    const tecla = (e) => { if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); } };
    window.addEventListener("pointerdown", fuera, true);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointerdown", fuera, true);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const ir = (ruta) => { setAbierto(false); navegar(ruta); };

  return (
    <div className="menu-cuenta" ref={caja}>
      <button
        ref={boton}
        type="button"
        className="menu-cuenta-boton"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={`Cuenta de ${yo.nombre || yo.email}`}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="menu-cuenta-avatar" style={{ background: yo.color || "var(--accent)" }} aria-hidden="true">
          {iniciales(yo.nombre || yo.email)}
        </span>
        <Icon name="chevronDown" size={14} />
      </button>
      {abierto && (
        <div id={id} className="menu-cuenta-panel" role="group" aria-label="Cuenta">
          <p className="menu-cuenta-quien">
            <strong>{yo.nombre || "Sin nombre"}</strong>
            <span>{yo.email}</span>
            <span>{yo.rol === "admin" ? "Administra el espacio" : "Edita calendarios"}</span>
          </p>
          <button type="button" className="menu-cuenta-item" onClick={() => ir("/ajustes")}>
            <Icon name="settings" size={16} /> Ajustes
          </button>
          <button type="button" className="menu-cuenta-item" onClick={() => ir("/equipo")}>
            <Icon name="users" size={16} /> Equipo y perfil
          </button>
          <button type="button" className="menu-cuenta-item" data-peligro="true" onClick={onSalir}>
            <Icon name="logout" size={16} /> Salir
          </button>
        </div>
      )}
    </div>
  );
}
