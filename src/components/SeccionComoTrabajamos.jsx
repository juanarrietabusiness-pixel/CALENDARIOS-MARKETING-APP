import { lazy, Suspense, useState } from "react";
import Icon from "./Icon";

// ============================================================
// Ajustes → «Cómo trabajamos» (fase 7)
//
// Lo que la agencia decide UNA vez y siguen el director, la IA y el equipo en todos los clientes, que estaba repartido:
// las RECETAS (se abrían sólo desde la pestaña Diseño o desde una publicación), las FÓRMULAS UGC (sólo desde el guion
// de un UGC), las PLANTILLAS de plan y los MANUALES (campañas, el criterio comercial de los videos, el del director y
// «cómo se diseña cada tipo»). Aquí, juntos: las recetas y las fórmulas abren su editor de siempre (un diálogo, en
// diferido); las plantillas y los manuales son las secciones que siguen (SeccionPlantillas, SeccionManualCampanas).
// ============================================================

const Recetas = lazy(() => import("./Recetas"));
const FormulasUgc = lazy(() => import("./calendario/FormulasUgc"));

const irA = (id) => (e) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function SeccionComoTrabajamos() {
  const [abierto, setAbierto] = useState("");
  return (
    <section id="como-trabajamos" className="ajustes-seccion" aria-labelledby="ajustes-como">
      <h2 className="ajustes-titulo" id="ajustes-como">
        <Icon name="list" size={18} /> Cómo trabajamos
      </h2>
      <p className="ajustes-intro">
        Las recetas, las fórmulas de video, las plantillas de plan y los manuales de la agencia: lo que se decide una vez y
        siguen el director, la IA y el equipo con todos los clientes.
      </p>
      <ul className="como-trabajamos">
        <li>
          <button type="button" className="btn btn-secondary" onClick={() => setAbierto("recetas")}>
            <Icon name="list" size={16} /> Recetas
          </button>
          <span className="hint">El cómo de cada pieza: «Crear aquí» con el director o «Crear con Claude».</span>
        </li>
        <li>
          <button type="button" className="btn btn-secondary" onClick={() => setAbierto("formulas")}>
            <Icon name="video" size={16} /> Fórmulas UGC
          </button>
          <span className="hint">Las formas de video que funcionan, sin su contenido: valen para todos los clientes.</span>
        </li>
        <li>
          <a href="#plantillas" className="btn btn-secondary" onClick={irA("plantillas")}>
            <Icon name="grid" size={16} /> Plantillas de plan
          </a>
          <span className="hint">Qué sale cada día según el objetivo del cliente.</span>
        </li>
        <li>
          <a href="#manual-campanas" className="btn btn-secondary" onClick={irA("manual-campanas")}>
            <Icon name="megaphone" size={16} /> Manuales
          </a>
          <span className="hint">Campañas, el criterio comercial de los videos, el director y cómo se diseña cada tipo.</span>
        </li>
      </ul>
      <Suspense fallback={null}>
        {abierto === "recetas" && <Recetas onCerrar={() => setAbierto("")} />}
        {abierto === "formulas" && <FormulasUgc onCerrar={() => setAbierto("")} />}
      </Suspense>
    </section>
  );
}
