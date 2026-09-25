// ============================================================
// «Publicar»: dónde sale esta publicación y si puede salir
//
// Las redes de destino, lo que impide publicar (errores) y lo que
// conviene saber (avisos), con las MISMAS reglas que aplica el servidor
// al publicar (`lib/publicacion.js`). Así el aviso llega al escribir, no
// a la hora de salir.
// ============================================================

import { useEffect, useId, useState } from "react";
import Icon from "../Icon";
import { revisarPublicacion, REDES, AJUSTES, mediosDe, objetivoDe, necesitaAjuste } from "../../lib/publicacion";
import { vistaAjuste } from "../../lib/medios";
import { VistaPrevia } from "./editorPublicacion";

/**
 * Una imagen que Instagram no acepta tal cual (la de Flow, 3:4): en vez de
 * un error sin salida, cómo se va a ajustar y cómo queda. Se ajusta sola
 * al programar; aquí sólo se elige la forma.
 */
function AjusteImagen({ post, sf, medio, objetivo, color }) {
  const ids = useId();
  const modo = post.ajusteIG || "difuminado";
  const [vista, setVista] = useState(null);
  useEffect(() => {
    let vivo = true;
    vistaAjuste(medio.src, objetivo, modo, color).then((v) => { if (vivo) setVista(v); }).catch(() => { if (vivo) setVista(null); });
    return () => { vivo = false; };
  }, [medio.src, objetivo, modo, color]);
  return (
    <div className="ajuste-imagen">
      <div className="ajuste-imagen-vista" data-objetivo={objetivo}>
        {vista ? <img src={vista} alt={`Cómo quedará en ${objetivo === "historia" ? "la historia" : "el feed"}`} /> : <span>Preparando la vista…</span>}
      </div>
      <div className="ajuste-imagen-opciones">
        <p>
          <strong>{medio.ancho}×{medio.alto}</strong> no cabe en {objetivo === "historia" ? "una historia (9:16)" : "el feed de Instagram (de 4:5 a 1.91:1)"}.
          Al programar se ajusta así; el original no se toca y Facebook y tu cliente lo ven tal cual.
        </p>
        <label className="sr-only" htmlFor={`${ids}-a`}>Cómo ajustar la imagen</label>
        <select id={`${ids}-a`} className="input" value={modo} onChange={(e) => sf("ajusteIG", e.target.value)}>
          {Object.entries(AJUSTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
    </div>
  );
}

const REDES_POR_DEFECTO = ["instagram"];

export default function SeccionPublicar({ post, sf, client, children }) {
  const [previa, setPrevia] = useState(false);
  const redes = Array.isArray(post.redes) && post.redes.length ? post.redes : REDES_POR_DEFECTO;
  const { errores, avisos } = revisarPublicacion(post, redes, { navegador: true });
  const objetivo = redes.includes("instagram") ? objetivoDe(post, "instagram") : null;
  const fuera = objetivo ? mediosDe(post).find((m) => necesitaAjuste(m, objetivo)) : null;
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

      {fuera && <AjusteImagen post={post} sf={sf} medio={fuera} objetivo={objetivo} color={client?.primaryColor} />}

      {errores.length > 0 && (
        <ul className="revision-lista" data-tipo="error" aria-label="Lo que impide publicar">
          {errores.map((e) => <li key={e}><Icon name="alert" size={14} /> {e}</li>)}
        </ul>
      )}
      {avisos.some((a) => !(fuera && a.startsWith("Una imagen mide"))) && (
        <ul className="revision-lista" data-tipo="aviso" aria-label="Avisos">
          {avisos.filter((a) => !(fuera && a.startsWith("Una imagen mide"))).map((a) => <li key={a}>{a}</li>)}
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
