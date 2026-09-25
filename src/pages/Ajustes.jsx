import "./Ajustes.css";
import Icon from "../components/Icon";
import SeccionIA from "../components/SeccionIA";
import SeccionPresupuesto from "../components/SeccionPresupuesto";
import SeccionDrive from "../components/SeccionDrive";
import LimpiezaTerminadas from "../components/LimpiezaTerminadas";
import { TaskTemplatesManager } from "../components/TaskPanel";

// ============================================================
// Ajustes del espacio
//
// Lo que se configura una vez y se consulta de vez en cuando vivía
// repartido: la IA y su gasto al fondo de Equipo —donde nadie lo
// encontró el día que se acabó el saldo—, las plantillas de tareas y la
// copia de seguridad ocupando la barra lateral, que es para los
// clientes. Ahora todo eso está aquí, con un índice arriba.
// ============================================================

const INDICE = [
  ["ia", "Inteligencia artificial"],
  ["presupuesto", "Presupuesto y consumo"],
  ["integraciones", "Integraciones"],
  ["tareas", "Tareas"],
  ["copia", "Copia de seguridad"],
];

export default function Ajustes({ yo, clients = [], pulso = 0, onVolver, onExportar, onImportar }) {
  const esAdmin = yo?.rol === "admin";

  const irA = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-top">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", minWidth: 0 }}>
            <button className="btn-icon" onClick={onVolver} aria-label="Volver al panel">
              <Icon name="chevronLeft" />
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 className="page-title">Ajustes</h1>
              <p className="page-meta">La IA y su gasto, las integraciones y lo que vale para todo el equipo.</p>
            </div>
          </div>
        </div>
        <nav aria-label="Secciones de Ajustes" className="ajustes-indice">
          {INDICE.map(([id, nombre]) => (
            <a key={id} href={`#${id}`} className="filter-chip" onClick={irA(id)}>{nombre}</a>
          ))}
        </nav>
      </div>

      <div className="ajustes-rejilla">
        <SeccionIA esAdmin={esAdmin} pulso={pulso} />
        <SeccionPresupuesto esAdmin={esAdmin} pulso={pulso} />
        <SeccionDrive esAdmin={esAdmin} pulso={pulso} />

        <section id="tareas" className="ajustes-seccion" aria-labelledby="ajustes-tareas">
          <h2 className="ajustes-titulo" id="ajustes-tareas">
            <Icon name="clipboardCheck" size={18} /> Tareas
          </h2>
          <p className="ajustes-intro">
            Las plantillas se copian a cada cliente nuevo. El borrado automático vale para todas las tareas de la agencia.
          </p>
          <LimpiezaTerminadas cantidad={0} onVaciar={async () => {}} pulso={pulso} />
          <TaskTemplatesManager clients={clients} />
        </section>

        <section id="copia" className="ajustes-seccion" aria-labelledby="ajustes-copia">
          <h2 className="ajustes-titulo" id="ajustes-copia">
            <Icon name="download" size={18} /> Copia de seguridad
          </h2>
          <p className="ajustes-intro">
            Un archivo JSON con todos los clientes y sus calendarios. Importarlo AÑADE lo que trae; no borra nada.
          </p>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={onExportar}>
              <Icon name="download" size={18} /> Exportar
            </button>
            <button className="btn btn-secondary" onClick={onImportar}>
              <Icon name="upload" size={18} /> Importar
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
