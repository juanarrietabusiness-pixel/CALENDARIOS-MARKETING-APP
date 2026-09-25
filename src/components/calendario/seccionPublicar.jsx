// ============================================================
// «Publicar»: dónde sale esta publicación y si puede salir
//
// Las redes de destino, lo que impide publicar (errores) y lo que
// conviene saber (avisos), con las MISMAS reglas que aplica el servidor
// al publicar (`lib/publicacion.js`). Así el aviso llega al escribir, no
// a la hora de salir.
// ============================================================

import { useState } from "react";
import Icon from "../Icon";
import { revisarPublicacion, REDES } from "../../lib/publicacion";
import { VistaPrevia } from "./editorPublicacion";

const REDES_POR_DEFECTO = ["instagram"];

export default function SeccionPublicar({ post, sf, client, children }) {
  const [previa, setPrevia] = useState(false);
  const redes = Array.isArray(post.redes) && post.redes.length ? post.redes : REDES_POR_DEFECTO;
  const { errores, avisos } = revisarPublicacion(post, redes);
  const alternar = (r) => sf("redes", redes.includes(r) ? redes.filter((x) => x !== r) : [...redes, r]);

  return (
    <section className="seccion-publicar" aria-labelledby="seccion-publicar-t">
      <h3 id="seccion-publicar-t" className="label">Publicar</h3>
      <div className="redes-destino" role="group" aria-label="Dónde se publica">
        {Object.entries(REDES).map(([id, r]) => (
          <button key={id} type="button" className="filter-chip" aria-pressed={redes.includes(id)} onClick={() => alternar(id)}>
            <Icon name={r.icono} size={14} /> {r.nombre}
          </button>
        ))}
      </div>

      {errores.length > 0 && (
        <ul className="revision-lista" data-tipo="error" aria-label="Lo que impide publicar">
          {errores.map((e) => <li key={e}><Icon name="alert" size={14} /> {e}</li>)}
        </ul>
      )}
      {avisos.length > 0 && (
        <ul className="revision-lista" data-tipo="aviso" aria-label="Avisos">
          {avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      {!errores.length && <p className="revision-ok"><Icon name="check" size={14} /> Lista para publicar en {redes.map((r) => REDES[r].nombre).join(" y ")}.</p>}

      <div className="seccion-publicar-botones">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPrevia(true)}>
          <Icon name="photo" size={16} /> Vista previa
        </button>
        {children}
      </div>

      {previa && <VistaPrevia post={{ ...post, redes }} client={client} onClose={() => setPrevia(false)} />}
    </section>
  );
}
