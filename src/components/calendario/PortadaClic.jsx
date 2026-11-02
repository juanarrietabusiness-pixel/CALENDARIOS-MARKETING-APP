import { useId, useState } from "react";
import Icon from "../Icon";
import { CONCEPTOS_PORTADA, PROPORCION_PORTADA, avisosDeTitular, titularInicial, escenaDePortada } from "../../lib/portadaClic";
import "./PortadaClic.css";

// ============================================================
// «Portada que da clic»: dentro de «Portada del video» (editorPublicacion.jsx), se carga aparte
//
// Se escoge el concepto (16), el titular (corto: se lee a 120 px) y si es para el reel (9:16) o para YouTube (16:9);
// la imagen sale por «Crear la imagen aquí» (lib/otraVersion.js): el director de arte, el kit, las fotos del producto,
// el control del texto y el logo. Cada portada se enseña en grande Y a 120 px, que es como se verá: si a 120 px no se
// lee, no sirve. Nada se pone solo: «Usar esta portada».
// ============================================================

export default function PortadaClic({ client, post, onPortada, onError }) {
  const ids = useId();
  const [concepto, setConcepto] = useState(CONCEPTOS_PORTADA[0].id);
  const [titular, setTitular] = useState(() => titularInicial(post));
  const [formato, setFormato] = useState((post.redes ?? []).includes("youtube") && post.format !== "reel" ? "youtube" : "reel");
  const [creando, setCreando] = useState("");
  const [hechas, setHechas] = useState([]); // [{ id, src, formato }]
  const avisos = avisosDeTitular(titular);
  const elegido = CONCEPTOS_PORTADA.find((c) => c.id === concepto);

  const crear = async () => {
    if (creando || !titular.trim()) return;
    setCreando("Preparando la portada…");
    try {
      const { crearImagenDelPost } = await import("../../lib/otraVersion");
      const nueva = await crearImagenDelPost({
        client,
        // La portada es una pieza propia: su «qué se ve» y su titular, sin el pedido listo de la publicación.
        post: { ...post, escena: escenaDePortada({ concepto, formato }), textoPieza: titular.trim(), promptImagen: "", promptImagenDe: "" },
        indicacion: `Es la portada del video (concepto «${elegido.nombre}»): el único texto es «${titular.trim()}», enorme`,
        opciones: { proporcion: PROPORCION_PORTADA[formato] },
        alProgresar: setCreando,
        confirmar: (costo) => window.confirm(`Esta portada cuesta unos ${costo.toFixed(2).replace(".", ",")} $. ¿Sigo?`),
      });
      if (nueva) setHechas((l) => [{ id: nueva.id, src: nueva.src, formato }, ...l].slice(0, 6));
    } catch (e) {
      onError?.(`No se pudo crear la portada: ${e.message}`);
    }
    setCreando("");
  };

  return (
    <section className="portada-clic" aria-labelledby={`${ids}-t`}>
      <h5 id={`${ids}-t`} className="label" style={{ margin: 0 }}>Portada que da clic</h5>
      <p className="hint" style={{ margin: 0 }}>Una idea, un foco grande y un titular corto: se tiene que entender a 120 px.</p>

      <div className="portada-clic-conceptos" role="radiogroup" aria-label="Concepto de la portada">
        {CONCEPTOS_PORTADA.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={concepto === c.id} className="filter-chip" title={c.idea} onClick={() => setConcepto(c.id)}>
            {c.nombre}
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }}>{elegido.idea}</p>

      <div className="field" style={{ margin: 0 }}>
        <label className="label" htmlFor={`${ids}-titular`}>Titular de la portada</label>
        <input id={`${ids}-titular`} className="input" value={titular} maxLength={60} onChange={(e) => setTitular(e.target.value)}
          aria-describedby={avisos.length ? `${ids}-avisos` : undefined} placeholder="Ej.: ¿Sigues haciendo esto?" />
        {avisos.length > 0 && <p id={`${ids}-avisos`} className="hint portada-clic-aviso">{avisos.join(" ")}</p>}
      </div>

      <div className="portada-clic-formato" role="radiogroup" aria-label="Para dónde es la portada">
        <button type="button" role="radio" aria-checked={formato === "reel"} className="filter-chip" onClick={() => setFormato("reel")}>Reel · 9:16</button>
        <button type="button" role="radio" aria-checked={formato === "youtube"} className="filter-chip" onClick={() => setFormato("youtube")}>YouTube · 16:9</button>
      </div>

      <button type="button" className="btn btn-primary btn-sm" onClick={crear} disabled={Boolean(creando) || !titular.trim()}>
        <Icon name="imageAi" size={14} /> {creando || "Crear la portada"}
      </button>
      <p role="status" className="sr-only">{creando}</p>

      {hechas.length > 0 && (
        <ul className="portada-clic-hechas">
          {hechas.map((h) => (
            <li key={h.id}>
              <img src={h.src} alt="" className="portada-clic-grande" data-formato={h.formato} />
              <div className="portada-clic-mini">
                <span className="hint">Así se ve a 120 px{h.formato === "reel" ? " en el perfil" : ""}:</span>
                <img src={h.src} alt="La portada a 120 píxeles" className="portada-clic-120" data-formato={h.formato} />
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPortada({ portada: h.src, portadaMs: null, portadaEncuadre: 0 })}>
                <Icon name="check" size={14} /> Usar esta portada
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
