import Icon from "./Icon";
import ContadorAtrasadas from "./ContadorAtrasadas";
import ContadorFallidas from "./ContadorFallidas";
import ContadorBandeja from "./ContadorBandeja";
import { navegar } from "../lib/rutas";

// ============================================================
// Las secciones de la aplicación
//
// Antes eran iconos sueltos en la cabecera —Mi día y Equipo— y Ajustes
// no existía: la IA estaba al fondo de Equipo. Ahora son una lista con
// nombre, arriba de la barra lateral y del cajón del móvil.
//
// Fase 7 (docs/propuesta-lo-mejor-y-creacion.md): Inicio · Mi día · Lo mejor · Producción · Bandeja · Resultados ·
// Anuncios · Auditorías, y aparte lo del espacio (Equipo, Ajustes). «Producción» es la página Programación de antes
// —lo que está por producir y la cola— y «Anuncios» lleva dentro la Biblioteca, como pestaña: `/programacion` y
// `/biblioteca` siguen abriendo lo suyo, y marcan su sección.
// ============================================================

const SECCIONES = [
  { vista: "panel", ruta: "/", nombre: "Inicio", icono: "home" },
  { vista: "tareas", ruta: "/tareas", nombre: "Mi día", icono: "clipboardCheck", contador: true },
  { vista: "lo-mejor", ruta: "/lo-mejor", nombre: "Lo mejor", icono: "trending" },
  { vista: "programacion", ruta: "/produccion", nombre: "Producción", icono: "clock", fallidas: true },
  { vista: "bandeja", ruta: "/bandeja", nombre: "Bandeja", icono: "inbox", bandeja: true },
  { vista: "resultados", ruta: "/resultados", nombre: "Resultados", icono: "chart" },
  { vista: "campanas", ruta: "/campanas", nombre: "Anuncios", icono: "megaphone", tambien: ["biblioteca"] },
  { vista: "auditorias", ruta: "/auditorias", nombre: "Auditorías", icono: "search" },
];
const DEL_ESPACIO = [
  { vista: "equipo", ruta: "/equipo", nombre: "Equipo", icono: "users" },
  { vista: "ajustes", ruta: "/ajustes", nombre: "Ajustes", icono: "settings" },
];

export default function NavPrincipal({ ruta, pulso = 0, onIr }) {
  const actual = (s) => (s.vista === "panel" ? ruta.vista === "panel" && !ruta.cliente : ruta.vista === s.vista || Boolean(s.tambien?.includes(ruta.vista)));
  const item = (s) => (
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
        {s.bandeja && <ContadorBandeja pulso={pulso} />}
      </button>
    </li>
  );
  return (
    <nav aria-label="Secciones" className="nav-principal">
      <ul>{SECCIONES.map(item)}</ul>
      <ul aria-label="El espacio">{DEL_ESPACIO.map(item)}</ul>
    </nav>
  );
}
