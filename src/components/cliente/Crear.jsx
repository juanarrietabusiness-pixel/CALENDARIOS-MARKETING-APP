import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { AvisoDelKit } from "./SemaforoKit";
import { semaforoDelKit } from "../../lib/semaforoKit";
import { recordarEstudio } from "../../lib/semaforoKitApi";
import "./cliente.css";

// ============================================================
// La pestaña «Crear» de un cliente: el Estudio y el Diseño, JUNTOS (fase 7)
//
// Eran dos pestañas —Estudio y Diseño— que existían por el tope de tamaño del chunk del Estudio, no por la persona.
// Ahora: arriba «¿Qué quieres crear?», que habla con el director (el mismo asistente de la pestaña Diseño, en la
// página, con sus atajos y las recetas) y debajo la galería; lo manual (el compositor de imagen y video, los flujos
// de carrusel y reel, «Muchas de una vez», recrear) va plegado en «Avanzado» dentro de la galería. El kit de marca vive
// en Marca → Kit y voz; lo crítico que le falte se avisa arriba (el semáforo).
//
// Las direcciones de antes siguen: `/estudio` es Crear → Galería (con su `?lote=mes`, que el Estudio lee al montarse)
// y `/diseno` es Crear → Director (con su `?receta=`, que lee el director). Las dos partes se cargan aparte (lazy):
// el chunk del Estudio tiene tope de 20 kB comprimidos.
// ============================================================

const DisenoDirector = lazy(() => import("../DisenoDirector"));
const Estudio = lazy(() => import("../Estudio"));

/**
 * @param seccion   «director» | «galeria» | null (la de entrada: el director)
 * @param asistente lo que el director necesita del calendario abierto (App.jsx)
 * @param onIr      (pestaña, sub-sección) → navega (a otra sub-sección de Crear, o a Marca para arreglar el kit)
 */
export default function Crear({ client, seccion = null, pulso = 0, asistente, onLlevarAlCalendario, onIr }) {
  const ids = useId();
  const galeria = useRef(null);
  const director = useRef(null);
  const [estudio, setEstudio] = useState(null);
  const vistaPrimera = useRef(false);

  // Lo que leyó el Estudio, para el semáforo (sin pedirlo otra vez) y para el aviso de la pestaña Pieza.
  const alLeer = useCallback((d) => {
    setEstudio(d);
    recordarEstudio(client.id, d);
    // Llegar a la galería (`/crear/galeria`, `/estudio` de antes): cuando ya pinta, se baja hasta ella una vez.
    if (!vistaPrimera.current && seccion === "galeria") requestAnimationFrame(() => galeria.current?.scrollIntoView({ block: "start" }));
    vistaPrimera.current = true;
  }, [client.id, seccion]);

  // Cambiar de sub-sección desde el índice de arriba (la galería ya pintada).
  useEffect(() => {
    if (!vistaPrimera.current) return;
    (seccion === "galeria" ? galeria : director).current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [seccion]);

  return (
    <div className="crear">
      <nav className="crear-indice" aria-label="En esta pestaña">
        <a href="#crear-director" className="filter-chip" aria-current={seccion !== "galeria" ? "location" : undefined}
          onClick={(e) => { e.preventDefault(); onIr("crear", "director"); }}>
          <Icon name="sparkles" size={14} /> ¿Qué quieres crear?
        </a>
        <a href="#crear-galeria" className="filter-chip" aria-current={seccion === "galeria" ? "location" : undefined}
          onClick={(e) => { e.preventDefault(); onIr("crear", "galeria"); }}>
          <Icon name="image" size={14} /> Galería y avanzado
        </a>
      </nav>

      <AvisoDelKit puntos={semaforoDelKit({ estudio })} onIr={onIr} />

      <section ref={director} id="crear-director" className="crear-director" aria-labelledby={`${ids}-d`}>
        <h2 id={`${ids}-d`} className="crear-titulo">¿Qué quieres crear?</h2>
        <Suspense fallback={<p role="status" className="hint">Abriendo el director…</p>}>
          <DisenoDirector client={client} asistente={asistente} />
        </Suspense>
      </section>

      <section ref={galeria} id="crear-galeria" className="crear-galeria" aria-label={`Galería de ${client.name}`}>
        <Suspense fallback={<p role="status" className="hint">Cargando la galería…</p>}>
          <Estudio client={client} pulso={pulso} onLlevarAlCalendario={onLlevarAlCalendario} onDatos={alLeer} onIrAlKit={() => onIr("marca", "kit")} />
        </Suspense>
      </section>
    </div>
  );
}
