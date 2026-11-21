import "./Ajustes.css";
import Icon from "../components/Icon";
import SeccionIA from "../components/SeccionIA";
import SeccionPresupuesto from "../components/SeccionPresupuesto";
import { lazy, Suspense, useEffect } from "react";
import SeccionDrive from "../components/SeccionDrive";
import SeccionMeta from "../components/SeccionMeta";
import SeccionTikTok from "../components/SeccionTikTok";
import SeccionYouTube from "../components/SeccionYouTube";
import SeccionScrapeCreators from "../components/SeccionScrapeCreators";
import SeccionClaude from "../components/SeccionClaude";
import SeccionComoTrabajamos from "../components/SeccionComoTrabajamos";
import SeccionPlantillas from "../components/SeccionPlantillas";
import SeccionManualCampanas from "../components/SeccionManualCampanas";
import LimpiezaTerminadas from "../components/LimpiezaTerminadas";
import { TaskTemplatesManager } from "../components/TaskPanel";

// Salud y avisos: su chunk (la salud del sistema y la suscripción a los avisos en el teléfono).
const SeccionSalud = lazy(() => import("../components/SeccionSalud"));
// El editor de video grabado: su chunk (el manual y las últimas ediciones).
const SeccionEditorVideo = lazy(() => import("../components/SeccionEditorVideo"));

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
  ["claude", "Claude"],
  // Recetas, fórmulas UGC, plantillas de plan y manuales, juntos (fase 7).
  ["como-trabajamos", "Cómo trabajamos"],
  ["editor-video", "Editor de video"],
  ["tareas", "Tareas"],
  ["copia", "Copia de seguridad"],
  ["salud", "Salud y avisos"],
];

export default function Ajustes({ yo, clients = [], pulso = 0, onVolver, onExportar, onImportar }) {
  const esAdmin = yo?.rol === "admin";

  // Se llega con «#integraciones» desde la vuelta de Google o de Meta y
  // desde el panel de una publicación: la SPA no desplaza sola al ancla.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, []);

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
        <SeccionDrive esAdmin={esAdmin} pulso={pulso}>
          <SeccionMeta esAdmin={esAdmin} clients={clients} pulso={pulso} />
          <SeccionTikTok clients={clients} pulso={pulso} />
          <SeccionYouTube clients={clients} pulso={pulso} />
          <SeccionScrapeCreators esAdmin={esAdmin} pulso={pulso} />
        </SeccionDrive>
        <SeccionClaude pulso={pulso} />
        <SeccionComoTrabajamos />
        <SeccionPlantillas pulso={pulso} />
        <SeccionManualCampanas pulso={pulso} />

        <section id="editor-video" className="ajustes-seccion" aria-labelledby="ajustes-editor-video">
          <h2 className="ajustes-titulo" id="ajustes-editor-video">
            <Icon name="video" size={18} /> Editor de video
          </h2>
          <p className="ajustes-intro">
            Los videos que GRABÓ una persona (clips hablando a cámara), editados por Claude con el kit de la agencia: el manual que
            sigue, sus últimas ediciones y lo que aprende de las correcciones.
          </p>
          <Suspense fallback={<p className="hint" style={{ margin: 0 }}>Cargando el editor de video…</p>}>
            <SeccionEditorVideo pulso={pulso} />
          </Suspense>
        </section>

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

        <Suspense fallback={<p className="hint" style={{ margin: 0 }}>Cargando la salud del sistema…</p>}>
          <SeccionSalud esAdmin={esAdmin} pulso={pulso} />
        </Suspense>
      </div>
    </div>
  );
}
