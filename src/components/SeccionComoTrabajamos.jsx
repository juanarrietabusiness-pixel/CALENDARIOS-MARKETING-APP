import { lazy, Suspense, useState } from "react";
import Icon from "./Icon";

// ============================================================
// Ajustes → «Cómo trabajamos» (fase 7)
//
// Lo que la agencia decide UNA vez y siguen el director, la IA y el equipo en todos los clientes (también su BIBLIOTECA
// DE SONIDO: la música y los efectos para todos los clientes, BibliotecaSonido.jsx), que estaba repartido:
// las RECETAS (se abrían sólo desde la pestaña Diseño o desde una publicación), las ESTRUCTURAS DE GUION (antes
// «fórmulas UGC»: sólo desde el guion de un UGC; ahora también para la voz en off), las PLANTILLAS de plan y los
// MANUALES (campañas, el criterio comercial de los videos, el del director y «cómo se diseña cada tipo»). Aquí, juntos:
// las recetas y las estructuras abren su editor de siempre (un diálogo, en diferido, con su filtro UGC / Voz en off);
// las plantillas y los manuales son las secciones que siguen (SeccionPlantillas, SeccionManualCampanas).
// ============================================================

const Recetas = lazy(() => import("./Recetas"));
const FormulasUgc = lazy(() => import("./calendario/FormulasUgc"));
// La biblioteca de sonido de la AGENCIA (música y efectos para todos los clientes).
const BibliotecaSonido = lazy(() => import("./BibliotecaSonido"));

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
        Las recetas, las estructuras de guion, la música y los efectos, las plantillas de plan y los manuales de la agencia: lo
        que se decide una vez y siguen el director, la IA y el equipo con todos los clientes.
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
            <Icon name="video" size={16} /> Estructuras de guion
          </button>
          <span className="hint">
            De la agencia, para todos los clientes: la forma de los guiones que funcionan (UGC para grabar y voz en off),
            sin su contenido. Se escoge una al escribir el guion; el tono de cada marca va aparte.
          </span>
        </li>
        <li>
          <button type="button" className="btn btn-secondary" aria-expanded={abierto === "sonido"} aria-controls="como-sonido"
            onClick={() => setAbierto((x) => (x === "sonido" ? "" : "sonido"))}>
            <Icon name="music" size={16} /> Música y efectos
          </button>
          <span className="hint">
            La biblioteca de sonido de la agencia, para todos los clientes: lo que se sube aquí (o se pasa desde un cliente, como una
            música de Suno que funcionó) se pone en sus videos sin volver a pagarlo.
          </span>
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
      {abierto === "sonido" && (
        <div id="como-sonido">
          <Suspense fallback={<p role="status" className="hint">Cargando…</p>}>
            <BibliotecaSonido />
          </Suspense>
        </div>
      )}
      <Suspense fallback={null}>
        {abierto === "recetas" && <Recetas onCerrar={() => setAbierto("")} />}
        {abierto === "formulas" && <FormulasUgc onCerrar={() => setAbierto("")} />}
      </Suspense>
    </section>
  );
}
