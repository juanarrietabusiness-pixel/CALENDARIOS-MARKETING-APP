import SelectorFecha from "./SelectorFecha";
import { fechaEnZona, sumarDias } from "../lib/agenda";

// ============================================================
// «¿Cuándo la haces?»: el día PLANEADO de una tarea (`today_date`)
//
// No es la fecha límite. Es lo que la agencia hace a mano en Google Tasks:
// apuntar hoy lo de hoy, dejar la víspera lo de «mañana» —que al llegar el
// día ya está en Hoy— o agendar la semana entera, cada tarea en su día.
// Antes, al crear una tarea en una empresa o en Mi día sólo se escogía la
// fecha límite; el día planeado sólo se ponía desde el panel lateral.
//
// Tres toques fijos (sin día, hoy, mañana) y el calendario para cualquier
// otro: así no hay que abrir el mes para lo de todos los días.
// ============================================================

export default function ElegirDia({ value = "", onChange, etiqueta = "Día en que se hace" }) {
  const hoy = fechaEnZona();
  const manana = sumarDias(hoy, 1);
  const otro = value && value !== hoy && value !== manana ? value : null;
  const opcion = (fecha, texto) => (
    <button type="button" className={`filter-chip ${value === fecha || (!value && !fecha) ? "active" : ""}`}
      aria-pressed={value === fecha || (!value && !fecha)} onClick={() => onChange(fecha)}>
      {texto}
    </button>
  );
  return (
    <div className="elegir-dia" role="group" aria-label={etiqueta}>
      {opcion("", "Sin día")}
      {opcion(hoy, "Hoy")}
      {opcion(manana, "Mañana")}
      <SelectorFecha value={otro} onChange={(f) => onChange(f || "")} etiqueta={`${etiqueta}: otro día`} vacio="Otro día…" prefijo="El" />
    </div>
  );
}
