import Icon from "./Icon";
import ContadorAtrasadas from "./ContadorAtrasadas";
import ContadorFallidas from "./ContadorFallidas";
import { navegar } from "../lib/rutas";

// ============================================================
// Las secciones de la aplicación
//
// Antes eran iconos sueltos en la cabecera —Mi día y Equipo— y Ajustes
// no existía: la IA estaba al fondo de Equipo. Ahora son una lista con
// nombre, arriba de la barra lateral y del cajón del móvil.
// ============================================================

const SECCIONES = [
  { vista: "panel", ruta: "/", nombre: "Inicio", icono: "home" },
  { vista: "tareas", ruta: "/tareas", nombre: "Mi día", icono: "clipboardCheck", contador: true },
  { vista: "programacion", ruta: "/programacion", nombre: "Programación", icono: "clock", fallidas: true },
  { vista: "resultados", ruta: "/resultados", nombre: "Resultados", icono: "chart" },
  { vista: "auditorias", ruta: "/auditorias", nombre: "Auditorías", icono: "search" },
  { vista: "equipo", ruta: "/equipo", nombre: "Equipo", icono: "users" },
  { vista: "ajustes", ruta: "/ajustes", nombre: "Ajustes", icono: "settings" },
];

export default function NavPrincipal({ ruta, pulso = 0, onIr }) {
  const actual = (s) => (s.vista === "panel" ? ruta.vista === "panel" && !ruta.cliente : ruta.vista === s.vista);
  return (
    <nav aria-label="Secciones" className="nav-principal">
      <ul>
        {SECCIONES.map((s) => (
          <li key={s.vista}>
            <button
              type="button"
              className="nav-principal-item"
              aria-current={actual(s) ? "page" : undefined}
              onClick={() => { navegar(s.ruta); onIr?.(); }}
            >
              <Icon name={s.icono} size={18} />
              <span>{s.nombre}</span>
              {s.contador && <ContadorAtrasadas pulso={pulso} />}
              {s.fallidas && <ContadorFallidas pulso={pulso} />}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
