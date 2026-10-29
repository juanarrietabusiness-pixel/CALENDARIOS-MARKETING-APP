import Icon from "./Icon";
import { Pieza } from "./EstudioVisor";
import { textoPapelera } from "../lib/estudio";

/** «12 oct» de «2026-10-12» (sin pasar por UTC: el día es el del calendario). */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaCorto = (f) => { const [, m, d] = String(f).split("-").map(Number); return m && d ? `${d} ${MESES[m - 1]}` : String(f); };

/**
 * La papelera del Estudio: recuperar, borrar del todo (lo que usa una publicación pide confirmar) y vaciar. Va en su
 * chunk (lazy): la pestaña Estudio tiene tope de 20 kB comprimidos y la papelera sólo se abre a veces.
 */
export default function EstudioPapelera({ papelera, lectura, borrando, onVaciar, onRecuperar, onBorrar, onNoBorrar }) {
  return (
    <>
      {papelera.length > 0 && !lectura && (
        <p className="est-papelera-nota">
          Lo que llevas 30 días aquí se borra solo, menos lo que usa una publicación o la marca (te decimos cuál).{" "}
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
                <p className="est-meta">{textoPapelera(a.borradoAt)}</p>
                {/* Por qué no se va al vaciar: lo usa de verdad una publicación (con su día) o es de la marca. */}
                {a.usadoEn.length > 0 && <p className="est-meta est-se-queda"><Icon name="calendar" size={12} /> La usa {a.usadoEn.length === 1 ? `la publicación${a.usadoEn[0].fecha ? ` del ${diaCorto(a.usadoEn[0].fecha)}` : ""}` : `${a.usadoEn.length} publicaciones`}: no se borra.</p>}
                {a.deLaMarca && <p className="est-meta est-se-queda"><Icon name="lock" size={12} /> Es {a.deLaMarca}: no se borra.</p>}
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
