import { useId, useState } from "react";
import Icon from "./Icon";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { proponerLenguaje } from "../lib/cerebro";
import { MAX_MATERIAL_LENGUAJE } from "../lib/lenguajeCliente";

// ============================================================
// «Lenguaje del cliente» (pestaña Cerebro → Más): lo que se le da a la IA
// para proponer la nota con las frases EXACTAS de sus clientes. Todo es
// opcional: sin pegar nada, lee los comentarios guardados de la Bandeja y
// las respuestas de la encuesta. Nada se guarda aquí: la propuesta se abre
// en el editor de notas de siempre y la persona la revisa y la guarda.
// Se descarga sólo al abrirlo (lazy en Cerebro.jsx).
// ============================================================

export default function LenguajeCliente({ client, onPropuesta, onCerrar }) {
  const ids = useId();
  const [texto, setTexto] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [marcas, setMarcas] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  // Mientras la IA trabaja no se cierra: la llamada quedaría huérfana y sin aviso.
  const cerrar = () => { if (!trabajando) onCerrar(); };
  const ref = useDialogA11y(cerrar);

  const proponer = async (e) => {
    e.preventDefault();
    setTrabajando(true);
    setError("");
    try {
      const r = await proponerLenguaje(client.id, { texto, competencia, marcas });
      onPropuesta(r);
    } catch (err) {
      setError(err.message);
      setTrabajando(false);
    }
  };

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <form ref={ref} className="dialog cerebro-editor" role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} aria-describedby={`${ids}-d`} onSubmit={proponer}>
        <h3 id={`${ids}-t`}>Lenguaje del cliente</h3>
        <p id={`${ids}-d`} className="hint">
          La IA junta las frases EXACTAS con las que hablan los clientes de {client.name}: cómo cuentan su problema, sus dudas,
          lo que quieren y lo que celebran. Lee los comentarios guardados de la Bandeja, las respuestas de la encuesta «La voz
          de tus clientes» y lo que pegues aquí. Cada frase se comprueba en el texto: la que no está tal cual, se descarta.
        </p>
        <div className="field">
          <label className="label" htmlFor={`${ids}-p`}>Reseñas o comentarios de sus clientes (opcional)</label>
          <textarea id={`${ids}-p`} className="input" rows={5} maxLength={MAX_MATERIAL_LENGUAJE} value={texto} disabled={trabajando}
            placeholder="Pega reseñas de Google, Mercado Libre, comentarios o mensajes. Uno por línea." onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-c`}>Reseñas de 1 estrella de la competencia (opcional)</label>
          <textarea id={`${ids}-c`} className="input" rows={3} maxLength={MAX_MATERIAL_LENGUAJE} value={competencia} disabled={trabajando}
            aria-describedby={`${ids}-ch`} placeholder="Lo que se quejan los clientes de otras marcas. Uno por línea." onChange={(e) => setCompetencia(e.target.value)} />
          <p id={`${ids}-ch`} className="hint">Lo que odian de otras opciones es lo que su anuncio tiene que resolver.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-m`}>Marcas de la competencia que hay que ocultar (opcional)</label>
          <input id={`${ids}-m`} className="input" maxLength={600} value={marcas} disabled={trabajando} aria-describedby={`${ids}-mh`}
            placeholder="Separadas por comas" onChange={(e) => setMarcas(e.target.value)} />
          <p id={`${ids}-mh`} className="hint">En la nota se cambian por «otra marca». Las de su estudio de mercado ya se ocultan solas.</p>
        </div>
        <div aria-live="polite">
          {trabajando && <p role="status" className="cerebro-trabajando">La IA está leyendo los comentarios. Tarda menos de un minuto.</p>}
          {error && <p role="alert" className="cerebro-error">{error}</p>}
        </div>
        <div className="cerebro-editor-pie">
          <button type="button" className="btn btn-secondary" onClick={cerrar} disabled={trabajando}>Cancelar</button>
          <button type="submit" className="btn btn-accent" disabled={trabajando}>
            <Icon name="sparkles" size={16} /> {trabajando ? "Leyendo…" : "Proponer la nota"}
          </button>
        </div>
      </form>
    </div>
  );
}
