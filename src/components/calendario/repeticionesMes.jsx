import { useId, useState } from "react";
import Icon from "../Icon";
import { MONTHS, FORMATS } from "../../constants";
import { fraseRepetir, REGLAS_REPETIR, opcionesRepetir } from "../../lib/repetir";

// ============================================================
// «Post que se repite»: lo que le toca a este mes
//
// Encima de la rejilla, sólo si hay algo: qué publicaciones se repiten aquí y
// en qué día. Nada se crea solo (el cajón del mes se crea al escribir): se
// AÑADEN con un botón, como ideas pendientes con la misma información, o se
// dejan para después. Con «La IA escribe textos nuevos», cada mes sale
// distinta: la copia llega sin descripción ni texto de la pieza, y «Escribir
// sus textos con IA» los rellena por el camino de siempre.
// ============================================================

const corta = (f) => `${+f.slice(8, 10)} ${MONTHS[+f.slice(5, 7) - 1].slice(0, 3).toLowerCase()}`;
const nombreDe = (p) => String(p?.title || p?.idea || FORMATS[p?.format]?.label || "Publicación").trim().slice(0, 60);

export function RepeticionesMes({ pendientes = [], hechas = 0, soloLectura = false, escribiendo = false, onAnadir, onOmitir, onNoRepetir, onEscribir, onCerrarHechas }) {
  const ids = useId();
  const [textosNuevos, setTextosNuevos] = useState(true);

  if (hechas && !pendientes.length) {
    return (
      <section className="repeticiones-mes" aria-label="Publicaciones que se repiten">
        <p role="status" className="repeticiones-mes-titulo">
          <Icon name="check" size={16} /> {hechas === 1 ? "Añadida 1 repetición" : `Añadidas ${hechas} repeticiones`} como ideas pendientes.
        </p>
        <div className="repeticiones-mes-botones">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEscribir} disabled={escribiendo}>
            <Icon name="sparkles" size={14} /> {escribiendo ? "Escribiendo…" : "Escribir sus textos con IA"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrarHechas}>Listo</button>
        </div>
        <p className="hint" style={{ margin: 0 }}>El diseño, con «Producir el mes» o «Crear con IA» en cada una.</p>
      </section>
    );
  }
  if (!pendientes.length) return null;

  return (
    <section className="repeticiones-mes" aria-labelledby={`${ids}-t`}>
      <p id={`${ids}-t`} className="repeticiones-mes-titulo">
        <Icon name="refresh" size={16} /> {pendientes.length === 1 ? "Se repite este mes 1 publicación" : `Se repiten este mes ${pendientes.length} publicaciones`}
      </p>
      <ul className="repeticiones-mes-lista">
        {pendientes.map((r) => (
          <li key={r.clave}>
            <span className="repeticiones-mes-fecha">{corta(r.fecha)}</span>
            <span className="repeticiones-mes-nombre">
              {nombreDe(r.origen)}
              <span className="hint"> · {fraseRepetir(r.origen.repetir, r.fechaOrigen).toLowerCase()}</span>
            </span>
            {!soloLectura && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNoRepetir(r)}
                aria-label={`Dejar de repetir «${nombreDe(r.origen)}»`}>
                No repetir más
              </button>
            )}
          </li>
        ))}
      </ul>
      {!soloLectura && (
        <>
          <label className="repeticiones-mes-opcion" htmlFor={`${ids}-textos`}>
            <input id={`${ids}-textos`} type="checkbox" checked={textosNuevos} onChange={(e) => setTextosNuevos(e.target.checked)} />
            La IA escribe textos nuevos (descripción, texto de la pieza, qué se ve)
          </label>
          <div className="repeticiones-mes-botones">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onAnadir({ textosNuevos })}>
              <Icon name="plus" size={14} /> {pendientes.length === 1 ? "Añadirla al mes" : "Añadirlas al mes"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOmitir}>Ahora no</button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * «Se repite» en el panel de una publicación. En una copia, de dónde viene (la regla es de la original: si la copia
 * también la llevara, serían dos series de lo mismo).
 */
export function SeRepite({ form, fecha, sf, idBase }) {
  if (form.repiteDe) {
    return (
      <div className="field">
        <span className="label">Se repite</span>
        <p className="hint" style={{ margin: 0 }}>
          <Icon name="refresh" size={12} /> Es la repetición del {form.repeticion ? corta(form.repeticion) : "mes"} de otra publicación.
          Para cambiar la regla, ábrela en su mes o usa «No repetir más» encima del calendario.
        </p>
      </div>
    );
  }
  const valor = REGLAS_REPETIR.includes(form.repetir) ? form.repetir : "";
  return (
    <div className="field">
      <label className="label" htmlFor={`${idBase}-repetir`}>Se repite</label>
      <select id={`${idBase}-repetir`} className="input" value={valor} onChange={(e) => sf("repetir", e.target.value || undefined)}>
        {opcionesRepetir(fecha).map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </select>
      {valor && (
        <p className="hint" style={{ margin: "var(--sp-1) 0 0" }}>
          Al abrir un mes que le toque, sale arriba para añadirla como idea con la misma información y otro texto.
        </p>
      )}
    </div>
  );
}
