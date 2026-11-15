import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Icon from "../Icon";
import { AvisoDelKit } from "./SemaforoKit";
import { semaforoDelKit } from "../../lib/semaforoKit";
import { recordarEstudio } from "../../lib/semaforoKitApi";
import { SECCIONES_DEL_CLIENTE } from "../../lib/rutas";
import "./cliente.css";

// ============================================================
// La pestaña «Crear» de un cliente: el director, «A mano» y la galería
//
// Tres sub-secciones de la MISMA página (el Estudio no se desmonta al pasar de una a otra: lo que se está escribiendo
// en el compositor no se pierde):
//   · «¿Qué quieres crear?» (`/crear/director`): el director arriba (el asistente incrustado, con sus atajos y las
//     recetas) y la galería debajo.
//   · «A mano» (`/crear/a-mano`): el COMPOSITOR abierto arriba y el director plegado en una línea. Es lo que la agencia
//     hace casi siempre (el 95 % de las imágenes las pide una persona desde aquí): antes vivía en «Avanzado», cerrado en
//     cada visita y debajo de un chat de 440 px.
//   · «Galería» (`/crear/galeria`): la de siempre (y `?lote=mes`, que el Estudio lee al montarse).
//
// Se RECUERDA la última sub-sección por navegador (`crear-seccion`): entrar en `/cliente/x/crear` a secas abre la que se
// usó la última vez. Es una comodidad de cada persona, no un dato del equipo.
//
// Las direcciones de antes siguen: `/estudio` es Crear → Galería y `/diseno` es Crear → Director (con su `?receta=`). Las
// dos partes se cargan aparte (lazy): el chunk del Estudio tiene tope de 20 kB comprimidos.
// ============================================================

const DisenoDirector = lazy(() => import("../DisenoDirector"));
const Estudio = lazy(() => import("../Estudio"));

const CLAVE = "crear-seccion";
const recordada = () => {
  try {
    const s = localStorage.getItem(CLAVE);
    return SECCIONES_DEL_CLIENTE.crear.includes(s) ? s : null;
  } catch { return null; }
};

const INDICE = [["director", "sparkles", "¿Qué quieres crear?"], ["a-mano", "pencil", "A mano"], ["galeria", "image", "Galería"]];

/**
 * @param seccion   «director» | «a-mano» | «galeria» | null (la recordada o, la primera vez, el director)
 * @param asistente lo que el director necesita del calendario abierto (App.jsx)
 * @param onIr      (pestaña, sub-sección) → navega (a otra sub-sección de Crear, o a Marca para arreglar el kit)
 */
export default function Crear({ client, seccion = null, pulso = 0, asistente, onLlevarAlCalendario, onIr }) {
  const ids = useId();
  const zonaEstudio = useRef(null);
  const director = useRef(null);
  const [estudio, setEstudio] = useState(null);
  const vistaPrimera = useRef(false);
  const [guardada] = useState(recordada);
  const actual = seccion ?? guardada ?? "director";
  const aMano = actual === "a-mano";
  // En «A mano», el director va plegado. Una vez abierto (o si se llegó desde su sub-sección) se queda montado aunque se
  // pliegue: la conversación en curso no se corta.
  const [verDirector, setVerDirector] = useState(false);
  const [directorVisto, setDirectorVisto] = useState(!aMano);
  const montarDirector = !aMano || verDirector || directorVisto;

  useEffect(() => {
    if (!seccion) return;
    try { localStorage.setItem(CLAVE, seccion); } catch { /* sin almacenamiento: no se recuerda */ }
  }, [seccion]);

  // Lo que leyó el Estudio, para el semáforo (sin pedirlo otra vez) y para el aviso de la pestaña Pieza.
  const alLeer = useCallback((d) => {
    setEstudio(d);
    recordarEstudio(client.id, d);
    // Llegar a la galería (`/crear/galeria`, `/estudio` de antes): cuando ya pinta, se baja hasta ella una vez.
    if (!vistaPrimera.current && actual === "galeria") requestAnimationFrame(() => zonaEstudio.current?.scrollIntoView({ block: "start" }));
    vistaPrimera.current = true;
  }, [client.id, actual]);

  // Cambiar de sub-sección desde el índice de arriba (la galería ya pintada).
  useEffect(() => {
    if (!vistaPrimera.current) return;
    if (actual === "director") director.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else zonaEstudio.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [actual]);

  const ir = (s) => {
    if (s !== "a-mano") setDirectorVisto(true);
    onIr("crear", s);
  };
  const plegarDirector = () => {
    setDirectorVisto(true);
    setVerDirector((v) => !v);
  };

  return (
    <div className="crear" data-seccion={actual}>
      <nav className="crear-indice" aria-label="En esta pestaña">
        {INDICE.map(([id, icono, nombre]) => (
          <a key={id} href={`#crear-${id}`} className="filter-chip" aria-current={actual === id ? "location" : undefined}
            onClick={(e) => { e.preventDefault(); ir(id); }}>
            <Icon name={icono} size={14} /> {nombre}
          </a>
        ))}
      </nav>

      <AvisoDelKit puntos={semaforoDelKit({ estudio })} onIr={onIr} />

      <section ref={director} id="crear-director" className={`crear-director${aMano ? " crear-director-plegado" : ""}`} aria-labelledby={`${ids}-d`}>
        {aMano ? (
          <button type="button" id={`${ids}-d`} className="btn btn-ghost crear-director-boton" aria-expanded={verDirector} aria-controls={`${ids}-dc`} onClick={plegarDirector}>
            <Icon name={verDirector ? "chevronDown" : "chevronRight"} size={16} /> ¿Prefieres pedírselo al director?
          </button>
        ) : (
          <h2 id={`${ids}-d`} className="crear-titulo">¿Qué quieres crear?</h2>
        )}
        <div id={`${ids}-dc`} hidden={aMano && !verDirector}>
          {montarDirector && (
            <Suspense fallback={<p role="status" className="hint">Abriendo el director…</p>}>
              <DisenoDirector client={client} asistente={asistente} />
            </Suspense>
          )}
        </div>
      </section>

      <section ref={zonaEstudio} id="crear-galeria" className="crear-galeria" aria-label={aMano ? `Crear a mano para ${client.name}` : `Galería de ${client.name}`}>
        <Suspense fallback={<p role="status" className="hint">{aMano ? "Abriendo el compositor…" : "Cargando la galería…"}</p>}>
          <Estudio
            client={client} pulso={pulso} onLlevarAlCalendario={onLlevarAlCalendario} onDatos={alLeer} onIrAlKit={() => onIr("marca", "kit")}
            aMano={aMano} onAMano={() => ir("a-mano")}
          />
        </Suspense>
      </section>
    </div>
  );
}
