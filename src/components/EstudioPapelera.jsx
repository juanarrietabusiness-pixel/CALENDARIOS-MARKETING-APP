import Icon from "./Icon";
import { Pieza } from "./EstudioVisor";
import { textoPapelera } from "../lib/estudio";

/**
 * La papelera del Estudio: recuperar, borrar del todo (lo que usa una publicación pide confirmar) y vaciar. Va en su
 * chunk (lazy): la pestaña Estudio tiene tope de 20 kB comprimidos y la papelera sólo se abre a veces.
 */
export default function EstudioPapelera({ papelera, lectura, borrando, onVaciar, onRecuperar, onBorrar, onNoBorrar }) {
  return (
    <>
      {papelera.length > 0 && !lectura && (
        <p className="est-papelera-nota">
          Lo que llevas 30 días aquí se borra solo (menos lo que usa una publicación).{" "}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onVaciar}>Vaciar la papelera</button>
        </p>
      )}
      {papelera.length === 0 ? (
        <p className="est-vacio">La papelera está vacía.</p>
      ) : (
        <ul className="est-rejilla">
          {papelera.map((a) => (
            <li key={a.id} className="est-tarjeta est-tarjeta-papelera">
              <div className="est-img"><Pieza archivo={a} /></div>
              <div className="est-pie">
                <p className="est-prompt">{a.prompt}</p>
                <p className="est-meta">{textoPapelera(a.borradoAt)}{a.usadoEn.length ? ` · en ${a.usadoEn.length} publicación${a.usadoEn.length === 1 ? "" : "es"}` : ""}</p>
                {!lectura && (
                  borrando?.id === a.id ? (
                    <div className="est-confirmar-borrar" role="alert">
                      <p>{borrando.usos ? `Está en ${borrando.usos} publicación${borrando.usos === 1 ? "" : "es"}: desaparecerá de ${borrando.usos === 1 ? "ella" : "ellas"}.` : "¿Borrarla del todo?"}</p>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => onBorrar(a, true)}>Sí, borrar</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={onNoBorrar}>No</button>
                    </div>
                  ) : (
                    <div className="est-acciones">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRecuperar(a)}><Icon name="undo" size={14} /> Recuperar</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onBorrar(a)}>Borrar del todo</button>
                    </div>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
